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
  parseCsv, guessLatLng, csvToFeatures, readShapefileParts, readTextFile,
  projectionProblem, csvProjectionProblem, projectionMessage,
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

/** Un fichier GeoJSON lu : ses positions doivent être en degrés. */
export function parseGeoJSONText(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier est illisible : il est peut-être incomplet ou endommagé. Exportez-le de nouveau, puis déposez-le.');
  }
  const fc = toFeatureCollection(json);
  if (!fc) throw new Error('Ce fichier ne contient pas de données cartographiques lisibles. Vérifiez qu\'il s\'agit bien d\'un export cartographique (.geojson), puis déposez-le de nouveau.');
  if (projectionProblem(fc)) throw new Error(projectionMessage({ kind: 'geojson' }));
  return fc;
}

/** Lit la source géographique d'un dépôt en FeatureCollection. */
export async function loadGeo(geo) {
  if (!geo) throw new Error('Nous ne trouvons aucun fichier cartographique dans ce dépôt. Déposez un tableau avec des colonnes de latitude et de longitude, un fichier .geojson, ou un fichier .shp accompagné de ses fichiers .dbf, .shx et .prj.');
  if (geo.kind === 'shapefile') return readShapefileParts(geo);
  const text = await readTextFile(geo.file);
  if (geo.kind === 'csv') {
    const { headers, records } = parseCsv(text);
    if (!records.length) throw new Error('Ce tableau est vide ou illisible. Vérifiez qu\'il contient une ligne d\'en-têtes et au moins une ligne de données.');
    const { lat, lng } = guessLatLng(headers);
    if (!lat || !lng) throw new Error('Nous ne trouvons pas de colonnes de latitude et de longitude dans ce tableau. Pour les indiquer vous-même, choisissez « Décrire ce fichier moi-même ».');
    if (csvProjectionProblem(records, lat, lng)) throw new Error(projectionMessage({ kind: 'csv', lat, lng }));
    const features = csvToFeatures(records, lat, lng);
    if (!features.length) throw new Error(`Aucune ligne de ce tableau ne porte de position lisible dans les colonnes « ${lat} » et « ${lng} ». Pour choisir d'autres colonnes, choisissez « Décrire ce fichier moi-même ».`);
    return { type: 'FeatureCollection', features, csv: { headers, records, lat, lng } };
  }
  return parseGeoJSONText(text);
}

/** Entités préparées et liste des champs d'une FeatureCollection. */
export function prepareDraft(fc) {
  const features = prepareFeatures(fc);
  if (!features.length) throw new Error('Ce fichier ne contient aucun point, tracé ni zone que nous sachions lire. Vérifiez qu’il s’agit bien d’un fichier cartographique, ou déposez un tableau avec des colonnes de latitude et de longitude.');
  return { features, fields: detectFields(features) };
}

/** En-têtes et échantillon d'un tableau CSV. */
export async function inspectTable(file) {
  const { headers, sample } = await csvHead(file, 50);
  if (!headers.length) throw new Error('Ce tableau est vide ou illisible. Vérifiez qu\'il contient une ligne d\'en-têtes.');
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
  if (!layerKey || !tableKey) throw new Error('Nous ne trouvons pas de colonne commune entre le fichier cartographique et le tableau.');
  const columns = recipe.join.columns.map((c) => resolveColumn(table.headers, c)).filter(Boolean);
  const { index, rows, kept } = await buildJoinIndex(table.file, { keyColumn: tableKey, keepColumns: columns, filterColumn, filterValue });
  if (!index.size) throw new Error(`Aucune ligne du tableau n'a pu être retenue (${rows.toLocaleString('fr-FR')} ${rows >= 2 ? 'lignes lues' : 'ligne lue'}). Vérifiez que le tableau vient du même export que le fichier cartographique.`);
  const joined = applyJoin(features, index, layerKey, { keepUnmatched: false });
  if (!joined.features.length) throw new Error('Aucun élément du fichier cartographique ne correspond aux lignes du tableau. Vérifiez que les deux fichiers viennent du même export.');
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
 * Enregistre une couche à partir d'entités : dépôt dans le compartiment privé
 * (champs conservés seulement) puis ligne dans diagnostic_layers.
 * @param {Object} p
 * @param {Array} p.features - entités préparées (__pt, __bbox retirés à l'envoi)
 * @param {Set<string>|null} p.keep - champs conservés (null = tous)
 * @param {Object} p.cfg - réglages (label, kind, style, popup, metrics, ai_context, default_on, group_label)
 * @param {string} [p.source] - identifiant de la source du catalogue
 * @param {string} [p.dataset] - identifiant du jeu de données (mise à jour, doublons)
 * @param {number} [p.sort_order]
 * @param {string} [p.city] - collectivité fixée au début de l'import
 */
export async function persistStorageLayer({ features, keep, cfg, source = '', dataset = '', sort_order = 0, city = null }) {
  const kept = keep ? restrictProps(features, [...keep]) : features;
  const fc = { type: 'FeatureCollection', features: kept.map(({ __pt, __bbox, ...f }) => f) };
  const source_ref = await api.uploadDiagnosticGeoJSON(fc, city);
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
  }, city);
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
