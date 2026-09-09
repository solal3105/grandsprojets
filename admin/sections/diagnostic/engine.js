/**
 * Diagnostic terrain - moteur d'import, sans interface.
 * Lit ce qui a été déposé, reconnaît un export connu, applique sa recette
 * (jointure, filtre, colonnes, réglages) et enregistre la couche. Le
 * catalogue de sources et le wizard avancé s'appuient tous deux dessus.
 */

import * as api from '../../api.js';
import { DEFAULT_STYLE } from './state.js';
import {
  toFeatureCollection, prepareFeatures, detectFields, restrictProps,
  parseCsv, guessColumn, csvToFeatures, readShapefileParts,
  csvHead, csvDistinct, buildJoinIndex, applyJoin, guessJoinColumns,
  expandFiles, classifyFiles, latestValue,
} from './data.js';
import { matchRecipe, resolveColumn } from './recipes.js';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Aplatit et trie un dépôt (fichiers, dossier, archive) : la source
 * géographique, les tableaux qui l'accompagnent, et un nom lisible.
 */
export async function readDrop(rawFiles) {
  const files = await expandFiles(rawFiles);
  const { geo, tables } = classifyFiles(files);
  // Une archive déposée seule donne son nom : c'est celui que l'on connaît,
  // pas celui, souvent illisible, du fichier qu'elle contient.
  const name = rawFiles.length === 1 && /\.zip$/i.test(rawFiles[0].name)
    ? rawFiles[0].name.replace(/\.[^.]+$/, '')
    : (geo?.name || '');
  return { files, geo, tables, name };
}

/** Lit la source géographique d'un dépôt en FeatureCollection. */
export async function loadGeo(geo) {
  if (!geo) throw new Error('Aucun fichier géographique reconnu : GeoJSON, shapefile (.shp avec .dbf et .prj) ou CSV avec latitude et longitude.');
  if (geo.kind === 'shapefile') return readShapefileParts(geo);
  const text = await geo.file.text();
  if (geo.kind === 'csv') {
    const { headers, records } = parseCsv(text);
    if (!records.length) throw new Error('CSV vide ou illisible');
    const lat = guessColumn(headers, ['lat', 'latitude', 'y']);
    const lng = guessColumn(headers, ['lon', 'lng', 'long', 'longitude', 'x']);
    const features = csvToFeatures(records, lat, lng);
    if (!features.length) throw new Error('Aucun point géolocalisé : le CSV doit porter des colonnes latitude et longitude.');
    return { type: 'FeatureCollection', features, csv: { headers, records, lat, lng } };
  }
  const fc = toFeatureCollection(JSON.parse(text));
  if (!fc) throw new Error('GeoJSON non reconnu (FeatureCollection ou Feature attendu)');
  return fc;
}

/** Entités préparées et liste des champs d'une FeatureCollection. */
export function prepareDraft(fc) {
  const features = prepareFeatures(fc);
  if (!features.length) throw new Error('Aucune géométrie valide trouvée');
  return { features, fields: detectFields(features) };
}

/** En-têtes et échantillon d'un tableau CSV. */
export async function inspectTable(file) {
  const { headers, sample } = await csvHead(file, 50);
  if (!headers.length) throw new Error('Tableau vide ou illisible');
  return { file, headers, sample };
}

/** Recette d'export connu correspondant à une couche et son tableau. */
export function recipeFor(fields, headers) {
  return matchRecipe({ geoFields: fields, tableHeaders: headers });
}

/**
 * Valeurs disponibles pour le filtre d'une recette (années, en général),
 * avec celle retenue par défaut. null si la recette ne filtre pas.
 */
export async function recipeFilterValues(table, recipe) {
  const column = recipe.join.filterColumn ? resolveColumn(table.headers, recipe.join.filterColumn) : '';
  if (!column) return null;
  const values = await csvDistinct(table.file, column, 200);
  if (!values.length) return null;
  const chosen = recipe.join.filterRule === 'latest' ? latestValue(values) : values[0][0];
  return { column, values, chosen };
}

/** Colonnes communes entre une couche et un tableau (recette ou devinées). */
export function joinColumnsFor(fields, table, recipe) {
  if (recipe) {
    return {
      layerKey: fields.find((f) => norm(f) === norm(recipe.join.layerKey)) || '',
      tableKey: resolveColumn(table.headers, recipe.join.tableKey),
    };
  }
  return guessJoinColumns(fields, table.headers);
}

/**
 * Applique une recette : jointure filtrée, colonnes reprises, réglages de la
 * couche et champs conservés. Ne touche à aucune interface.
 * @returns {Promise<{features, fields, keep: Set<string>, cfg, join}>}
 */
export async function runRecipe({ features, fields, table, recipe, filterColumn = '', filterValue = '' }) {
  const { layerKey, tableKey } = joinColumnsFor(fields, table, recipe);
  if (!layerKey || !tableKey) throw new Error('Colonne commune introuvable entre la couche et le tableau.');
  const columns = recipe.join.columns.map((c) => resolveColumn(table.headers, c)).filter(Boolean);
  const { index, rows, kept } = await buildJoinIndex(table.file, { keyColumn: tableKey, keepColumns: columns, filterColumn, filterValue });
  if (!index.size) throw new Error(`Aucune ligne exploitable dans le tableau (${rows} lue(s)).`);
  const joined = applyJoin(features, index, layerKey, { keepUnmatched: false });
  if (!joined.features.length) throw new Error('Aucune entité de la couche ne correspond au tableau.');
  const newFields = detectFields(joined.features);
  const keepGeo = (recipe.keepGeoFields || []).map((f) => newFields.find((x) => norm(x) === norm(f))).filter(Boolean);
  const keep = new Set(newFields.filter((f) => keepGeo.includes(f) || columns.includes(f)));
  const cfg = cfgFromRecipe(recipe, filterValue);
  return {
    features: joined.features,
    fields: newFields,
    keep,
    cfg,
    join: { layerKey, tableKey, filterColumn, filterValue, columns, rows, kept, matched: joined.matched, unmatched: joined.unmatched },
  };
}

/** Réglages de couche décrits par une recette, valeur de filtre injectée dans le nom. */
export function cfgFromRecipe(recipe, filterValue = '') {
  const L = recipe.layer;
  return {
    label: String(L.label || '').replace('{value}', filterValue || '').trim(),
    group_label: L.group_label || '',
    kind: L.kind === 'reference' ? 'reference' : 'temoignages',
    style: { ...DEFAULT_STYLE, ...L.style },
    popup: { title_field: '', fields: [], ...L.popup },
    metrics: (L.metrics || []).map((m) => ({ ...m })),
    ai_context: L.ai_context || '',
    default_on: true,
  };
}

/**
 * Enregistre une couche à partir d'entités : dépôt dans Storage (champs
 * conservés seulement) puis ligne dans diagnostic_layers.
 * @param {Object} p
 * @param {Array} p.features - entités préparées (__pt, __bbox retirés à l'envoi)
 * @param {Set<string>|null} p.keep - champs conservés (null = tous)
 * @param {Object} p.cfg - réglages (label, kind, style, popup, metrics, ai_context, default_on, group_label)
 * @param {string} [p.source] - identifiant de la source du catalogue
 * @param {string} [p.dataset] - identifiant du jeu de données (mise à jour, doublons)
 * @param {number} [p.sort_order]
 */
export async function persistStorageLayer({ features, keep, cfg, source = '', dataset = '', sort_order = 0 }) {
  const kept = keep ? restrictProps(features, [...keep]) : features;
  const fc = { type: 'FeatureCollection', features: kept.map(({ __pt, __bbox, ...f }) => f) };
  const source_ref = await api.uploadDiagnosticGeoJSON(fc);
  const { data, error } = await api.upsertDiagnosticLayer({
    label: cfg.label,
    group_label: cfg.group_label || '',
    source_type: 'storage',
    source_ref,
    style: cfg.style,
    popup: layerPopup(cfg, source, dataset),
    ai_context: cfg.ai_context || '',
    default_on: cfg.default_on !== false,
    sort_order,
  });
  if (error) throw error;
  return data;
}

/** Le jsonb `popup` d'une couche : champs de popup, nature, chiffres de zone, provenance. */
export function layerPopup(cfg, source = '', dataset = '') {
  const popup = {
    title_field: cfg.popup?.title_field || '',
    fields: cfg.popup?.fields || [],
    kind: cfg.kind === 'reference' ? 'reference' : 'temoignages',
    metrics: cfg.kind === 'reference' ? (cfg.metrics || []) : [],
  };
  if (source) popup.source = source;
  if (dataset) popup.dataset = dataset;
  return popup;
}
