/**
 * Diagnostic terrain - chargement et normalisation des données.
 * Fonctions pures : GeoJSON, CSV (lecture en flux), shapefile, jointure d'un
 * tableau, détection de champs, agrégats de zone, géométrie.
 */

import { store } from '../../store.js';
import { INTERNAL_SOURCES } from './state.js';

/** Normalise n'importe quel GeoJSON en FeatureCollection (ou null). */
export function toFeatureCollection(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) return json;
  if (json.type === 'Feature' && json.geometry) return { type: 'FeatureCollection', features: [json] };
  return null;
}

/** Emprise [minX, minY, maxX, maxY] d'une géométrie (null si invalide). */
export function geometryBbox(geometry) {
  if (!geometry) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      if (!isFinite(coords[0]) || !isFinite(coords[1])) return;
      if (coords[0] < minX) minX = coords[0];
      if (coords[0] > maxX) maxX = coords[0];
      if (coords[1] < minY) minY = coords[1];
      if (coords[1] > maxY) maxY = coords[1];
      return;
    }
    coords.forEach(walk);
  };
  walk(geometry.coordinates);
  return isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/** Applique `fn(lng, lat)` à chaque sommet de la géométrie ; s'arrête si fn retourne true. */
export function someVertex(geometry, fn) {
  const walk = (coords) => {
    if (!Array.isArray(coords)) return false;
    if (typeof coords[0] === 'number') return fn(coords[0], coords[1]);
    for (const c of coords) if (walk(c)) return true;
    return false;
  };
  return walk(geometry?.coordinates);
}

/**
 * Prépare les features d'une couche : filtre les géométries invalides et
 * pré-calcule le point d'ancrage (`__pt`) et l'emprise (`__bbox`) utilisés
 * par le lasso et la heatmap.
 */
export function prepareFeatures(fc) {
  const out = [];
  for (const f of fc.features || []) {
    if (!f || !f.geometry) continue;
    const bbox = geometryBbox(f.geometry);
    if (!bbox) continue;
    const pt = f.geometry.type === 'Point'
      ? [f.geometry.coordinates[0], f.geometry.coordinates[1]]
      : [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    out.push({ ...f, properties: f.properties || {}, __pt: pt, __bbox: bbox });
  }
  return out;
}

/** Liste des champs présents dans les propriétés (échantillonné). */
export function detectFields(features, cap = 200) {
  const seen = new Set();
  for (const f of features.slice(0, cap)) {
    for (const k of Object.keys(f.properties || {})) seen.add(k);
  }
  return [...seen];
}

/** Valeur numérique d'une propriété (accepte « 12,5 »), NaN sinon. */
export function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || !v.trim()) return NaN;
  return Number(v.trim().replace(',', '.'));
}

/**
 * Champs dont les valeurs renseignées sont (presque) toutes numériques, sur un
 * échantillon. C'est la liste proposée pour un style gradué ou un chiffre de zone.
 */
export function numericFields(features, cap = 200) {
  const sample = features.slice(0, cap);
  const out = [];
  for (const field of detectFields(sample, cap)) {
    let filled = 0, numeric = 0;
    for (const f of sample) {
      const v = f.properties?.[field];
      if (v === null || v === undefined || v === '') continue;
      filled++;
      if (isFinite(toNumber(v))) numeric++;
    }
    if (filled && numeric >= filled * 0.9) out.push(field);
  }
  return out;
}

/**
 * Une couche est présumée « témoignages » si au moins un champ porte un vrai
 * texte (plus de 12 caractères sur la majorité des entités renseignées) :
 * c'est exactement ce que l'analyse sait lire. Sinon elle est présumée
 * « référence » (comptages, mesures, zonages).
 */
export function guessKind(features, cap = 200) {
  const sample = features.slice(0, cap);
  if (!sample.length) return 'temoignages';
  for (const field of detectFields(sample, cap)) {
    let filled = 0, long = 0;
    for (const f of sample) {
      const v = f.properties?.[field];
      if (typeof v !== 'string' || !v.trim()) continue;
      filled++;
      if (v.trim().length > 12 && !isFinite(toNumber(v))) long++;
    }
    if (filled && long >= filled * 0.5) return 'temoignages';
  }
  return 'reference';
}

/** Valeurs distinctes d'un champ, triées par fréquence : [[valeur, n], …]. */
export function distinctValues(features, field, cap = 12) {
  const counts = new Map();
  for (const f of features) {
    const v = f.properties?.[field];
    if (v === null || v === undefined || v === '') continue;
    const key = String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap);
}

/**
 * Paliers d'un style gradué : quantiles des valeurs du champ (5 %, 25 %, 50 %,
 * 75 %, 95 %), dédoublonnés et croissants. Les quantiles résistent aux valeurs
 * extrêmes : un tronçon à 50 000 passages n'écrase pas la lecture des autres.
 * Retourne [] si moins de deux valeurs distinctes.
 */
export function quantileStops(features, field) {
  const values = [];
  for (const f of features) {
    const n = toNumber(f.properties?.[field]);
    if (isFinite(n)) values.push(n);
  }
  if (values.length < 2) return [];
  values.sort((a, b) => a - b);
  const q = (p) => values[Math.min(values.length - 1, Math.floor(p * (values.length - 1)))];
  const stops = [];
  for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const v = q(p);
    if (!stops.length || v > stops[stops.length - 1]) stops.push(v);
  }
  return stops.length >= 2 ? stops : [];
}

/** Agrégations disponibles pour un chiffre de zone. */
export const METRIC_AGGS = {
  sum: { label: 'Total', apply: (values) => values.reduce((a, b) => a + b, 0) },
  mean: { label: 'Moyenne', apply: (values) => values.reduce((a, b) => a + b, 0) / values.length },
  max: { label: 'Maximum', apply: (values) => Math.max(...values) },
};

/**
 * Chiffres de zone d'une couche de référence : pour chaque métrique
 * configurée ({ field, agg }), l'agrégat des entités fournies.
 * Une métrique sans aucune valeur numérique est omise (jamais un 0 inventé).
 */
export function aggregateMetrics(features, metrics) {
  const out = [];
  for (const m of Array.isArray(metrics) ? metrics : []) {
    const agg = METRIC_AGGS[m?.agg] || METRIC_AGGS.sum;
    const values = [];
    for (const f of features) {
      const n = toNumber(f.properties?.[m.field]);
      if (isFinite(n)) values.push(n);
    }
    if (!values.length) continue;
    out.push({ field: m.field, agg: m.agg in METRIC_AGGS ? m.agg : 'sum', value: agg.apply(values), n: values.length });
  }
  return out;
}

/** Ne garde que les propriétés listées (l'ordre des champs est conservé). */
export function restrictProps(features, keep) {
  const set = new Set(keep);
  return features.map((f) => {
    const props = {};
    for (const k of Object.keys(f.properties || {})) if (set.has(k)) props[k] = f.properties[k];
    return { ...f, properties: props };
  });
}

/** URL de chargement d'une couche selon son type de source. */
function layerDataUrl(layer) {
  if (layer.source_type === 'internal') {
    const src = INTERNAL_SOURCES[layer.source_ref];
    if (!src) return null;
    return `${src.endpoint}?ville=${encodeURIComponent(store.city || '')}`;
  }
  return layer.source_ref || null;
}

/** Charge et prépare le GeoJSON d'une couche. Throw en cas d'échec. */
export async function loadLayerData(layer) {
  const url = layerDataUrl(layer);
  if (!url) throw new Error('Source de données introuvable');
  // Une source relayée par nos fonctions (flux partenaire) exige la session.
  const headers = url.startsWith('/api/sources/') && store.session?.access_token
    ? { Authorization: `Bearer ${store.session.access_token}` }
    : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Une couche déposée par le diagnostic est compressée (gzip) : la
  // décompression est faite ici, le serveur la sert telle quelle.
  const gzipped = /\.gz(\?|$)/i.test(url) || /gzip/i.test(res.headers.get('content-type') || '');
  const json = gzipped && res.body && typeof DecompressionStream === 'function'
    ? await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json()
    : await res.json();
  const fc = toFeatureCollection(json);
  if (!fc) throw new Error('GeoJSON non reconnu');
  return prepareFeatures(fc);
}

/* ── CSV ───────────────────────────────────────────────────────── */

/**
 * Analyseur CSV à état, alimenté par morceaux : le même code lit un texte en
 * mémoire ou un fichier de plusieurs centaines de mégaoctets en flux, sans
 * jamais matérialiser le fichier entier. Conforme RFC 4180 : guillemets,
 * séparateur , ou ; auto-détecté sur la première ligne, retours à la ligne
 * DANS les champs entre guillemets. Les lignes vides sont ignorées.
 */
export class CsvParser {
  /** @param {(row: string[]) => void} onRow - reçoit chaque ligne (cellules trimées) */
  constructor(onRow) {
    this.onRow = onRow;
    this.sep = null;
    this.head = ''; // texte accumulé tant que la première ligne n'est pas complète
    this.row = [];
    this.cell = '';
    this.quoted = false;
    this.quoteSeen = false; // guillemet vu en zone citée : doublé (littéral) ou fermant ?
    this.skipLF = false; // un \r vient de clore une ligne : ignorer le \n d'un CRLF
  }

  _detectSep(line) {
    this.sep = (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length ? ';' : ',';
  }

  _endRow() {
    this.row.push(this.cell.trim());
    if (this.row.some((v) => v !== '')) this.onRow(this.row);
    this.row = [];
    this.cell = '';
  }

  push(chunk) {
    const src = String(chunk);
    if (this.sep === null) {
      // Le séparateur se décide sur la première ligne complète, quel que soit
      // le découpage des morceaux.
      this.head += src;
      const nl = this.head.search(/[\r\n]/);
      if (nl === -1) return;
      this._detectSep(this.head.slice(0, nl));
      const all = this.head;
      this.head = '';
      this._consume(all);
      return;
    }
    this._consume(src);
  }

  _consume(src) {
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (this.skipLF) {
        this.skipLF = false;
        if (c === '\n') continue;
      }
      if (this.quoted) {
        if (this.quoteSeen) {
          this.quoteSeen = false;
          if (c === '"') { this.cell += '"'; continue; } // guillemet doublé = littéral
          this.quoted = false; // guillemet fermant : c se traite hors citation
        } else if (c === '"') {
          this.quoteSeen = true;
          continue;
        } else {
          this.cell += c;
          continue;
        }
      }
      if (c === '"') { this.quoted = true; continue; }
      if (c === this.sep) { this.row.push(this.cell.trim()); this.cell = ''; continue; }
      if (c === '\r') { this.skipLF = true; this._endRow(); continue; }
      if (c === '\n') { this._endRow(); continue; }
      this.cell += c;
    }
  }

  end() {
    if (this.sep === null) {
      if (!this.head) return;
      this._detectSep(this.head);
      const all = this.head;
      this.head = '';
      this._consume(all);
    }
    if (this.quoteSeen) { this.quoteSeen = false; this.quoted = false; }
    if (this.cell !== '' || this.row.length) this._endRow();
  }
}

/** Parse un CSV en objets clé→valeur : { headers, records }. */
export function parseCsv(text) {
  const rows = [];
  const parser = new CsvParser((row) => rows.push(row));
  parser.push(text);
  parser.end();
  if (rows.length < 2) return { headers: rows[0] || [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1).map((values) => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = values[i] ?? ''; });
    return rec;
  });
  return { headers, records };
}

/**
 * Lit un fichier CSV en flux. `onRow(cells, headers)` est appelé pour chaque
 * ligne de données ; retourner `false` interrompt la lecture (utile pour un
 * aperçu). Résout avec les en-têtes.
 */
export async function streamCsv(file, onRow) {
  return streamCsvFromStream(file.stream(), onRow);
}

/**
 * Même lecture en flux depuis un ReadableStream d'octets (réponse réseau,
 * fichier) : un CSV national de plusieurs dizaines de mégaoctets se filtre
 * sans jamais être chargé entier.
 */
export async function streamCsvFromStream(stream, onRow, encoding = 'utf-8') {
  let headers = null;
  let stop = false;
  const parser = new CsvParser((row) => {
    if (stop) return;
    if (!headers) { headers = row; return; }
    if (onRow(row, headers) === false) stop = true;
  });
  const reader = stream.pipeThrough(new TextDecoderStream(encoding)).getReader();
  try {
    while (!stop) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(value);
    }
  } finally {
    if (stop) await reader.cancel().catch(() => {});
  }
  if (!stop) parser.end();
  return headers || [];
}

/** En-têtes et un échantillon de lignes d'un CSV (lecture partielle). */
export async function csvHead(file, limit = 50) {
  const sample = [];
  const headers = await streamCsv(file, (cells, hdrs) => {
    const rec = {};
    hdrs.forEach((h, i) => { rec[h] = cells[i] ?? ''; });
    sample.push(rec);
    return sample.length < limit;
  });
  return { headers, sample };
}

/** Valeurs distinctes d'une colonne d'un CSV, avec leur fréquence (plafonné). */
export async function csvDistinct(file, column, cap = 200) {
  const counts = new Map();
  await streamCsv(file, (cells, headers) => {
    const idx = headers.indexOf(column);
    const v = idx >= 0 ? cells[idx] : '';
    if (v === '') return;
    if (!counts.has(v) && counts.size >= cap) return;
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Chaîne numérique stricte → nombre, sinon valeur telle quelle ('' → null). */
export function typedValue(s) {
  if (s === '' || s === null || s === undefined) return null;
  if (typeof s !== 'string') return s;
  return /^-?\d+([.,]\d+)?$/.test(s.trim()) ? toNumber(s) : s;
}

/** Clé de jointure normalisée : « 0012 » et 12 désignent la même entité. */
export function joinKey(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return /^-?\d+$/.test(s) ? String(Number(s)) : s.toLowerCase();
}

/**
 * Construit l'index d'un tableau : clé → propriétés (colonnes conservées, typées).
 * Un filtre optionnel (colonne = valeur) ne retient qu'une partie des lignes ;
 * en cas de doublon de clé, la dernière ligne l'emporte.
 * @returns {Promise<{index: Map, rows: number, kept: number}>}
 */
export async function buildJoinIndex(file, { keyColumn, keepColumns, filterColumn = '', filterValue = '' }) {
  const index = new Map();
  let rows = 0, kept = 0;
  const keep = keepColumns?.length ? keepColumns : null;
  await streamCsv(file, (cells, headers) => {
    rows++;
    const at = (col) => { const i = headers.indexOf(col); return i >= 0 ? (cells[i] ?? '') : ''; };
    if (filterColumn && at(filterColumn) !== filterValue) return;
    const key = joinKey(at(keyColumn));
    if (!key) return;
    const props = {};
    headers.forEach((h, i) => {
      if (h === keyColumn || (keep && !keep.includes(h))) return;
      props[h] = typedValue(cells[i] ?? '');
    });
    index.set(key, props);
    kept++;
  });
  return { index, rows, kept };
}

/**
 * Applique une jointure : chaque entité reçoit les propriétés de la ligne
 * dont la clé correspond à son champ `layerKey`. Sans correspondance,
 * l'entité est retirée (par défaut) ou gardée telle quelle.
 * @returns {{features: Array, matched: number, unmatched: number}}
 */
export function applyJoin(features, index, layerKey, { keepUnmatched = false } = {}) {
  const out = [];
  let matched = 0, unmatched = 0;
  for (const f of features) {
    const props = index.get(joinKey(f.properties?.[layerKey]));
    if (props) {
      matched++;
      out.push({ ...f, properties: { ...f.properties, ...props } });
    } else {
      unmatched++;
      if (keepUnmatched) out.push(f);
    }
  }
  return { features: out, matched, unmatched };
}

/** Devine la colonne correspondant à l'un des mots-clés donnés. */
export function guessColumn(headers, keys) {
  const low = headers.map((h) => h.toLowerCase().trim());
  for (const k of keys) {
    const i = low.indexOf(k);
    if (i >= 0) return headers[i];
  }
  // Repli par sous-chaîne - uniquement pour les clés non ambiguës (≥ 3 car.,
  // sinon « x »/« y » matchent n'importe quel en-tête).
  for (let i = 0; i < low.length; i++) {
    if (keys.some((k) => k.length >= 3 && low[i].includes(k))) return headers[i];
  }
  return headers[0] || '';
}

/**
 * Un champ qui ressemble à un identifiant (id, uid, code, clé, INSEE, edgeUID,
 * osmId…) : utile pour joindre, jamais une grandeur à cartographier.
 */
export function isIdLike(field) {
  return /(^|_)(id|uid|code|key|insee)(_|$)|(id|uid)$/i.test(String(field));
}

/**
 * Devine la paire de colonnes de jointure entre les champs d'une couche et
 * les en-têtes d'un tableau : même nom à la casse et aux séparateurs près
 * (edgeUID ↔ edge_uid), sinon un identifiant (« id ») de chaque côté.
 */
export function guessJoinColumns(layerFields, headers) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const f of layerFields) {
    const h = headers.find((x) => norm(x) === norm(f));
    if (h) return { layerKey: f, tableKey: h };
  }
  return {
    layerKey: layerFields.find(isIdLike) || layerFields[0] || '',
    tableKey: headers.find(isIdLike) || headers[0] || '',
  };
}

/** Convertit des enregistrements CSV en features GeoJSON Point. */
export function csvToFeatures(records, latCol, lngCol) {
  const dec = (s) => parseFloat(String(s).replace(',', '.'));
  const features = [];
  for (const rec of records) {
    const lat = dec(rec[latCol]);
    const lng = dec(rec[lngCol]);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: rec });
  }
  return features;
}

/* ── Fichiers déposés : archives, dossiers, lots ───────────────── */

/**
 * Lit une archive zip sans dépendance : répertoire central puis entrées,
 * décompressées par le navigateur (DecompressionStream « deflate-raw »).
 * Les dossiers et les fichiers de métadonnées macOS sont ignorés.
 * @param {File|ArrayBuffer} source
 * @returns {Promise<File[]>}
 */
export async function readZipEntries(source) {
  const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Archive zip illisible');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = decoder.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
    const q = lho;
    const start = q + 30 + dv.getUint16(q + 26, true) + dv.getUint16(q + 28, true);
    const data = u8.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = data;
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error(`Compression non prise en charge dans l'archive (${name})`);
    out.push(new File([bytes], name.split('/').pop()));
  }
  return out;
}

/** Aplatit un lot de fichiers : chaque archive zip est remplacée par son contenu. */
export async function expandFiles(files) {
  const out = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) out.push(...await readZipEntries(f));
    else if (!f.name.startsWith('.')) out.push(f);
  }
  return out;
}

/** Fichiers d'un dépôt par glisser-déposer, dossiers parcourus récursivement. */
export async function filesFromDataTransfer(dt) {
  const items = dt?.items ? [...dt.items] : [];
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dt?.files || [])];
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      if (!file.name.startsWith('.')) out.push(file);
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    // readEntries rend les entrées par lots : boucler jusqu'au lot vide.
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

const _ext = (f) => (f.name.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
const _stem = (f) => f.name.replace(/\.[^.]+$/, '');

/**
 * Trie un lot de fichiers : la source géographique (shapefile avec ses
 * compagnons, sinon GeoJSON) et les tableaux (CSV) qui l'accompagnent.
 * Sans source géographique, un CSV unique est traité comme des points.
 */
export function classifyFiles(files) {
  const byExt = (ext) => files.filter((f) => _ext(f) === ext);
  const shp = byExt('shp')[0];
  let geo = null;
  if (shp) {
    const sibling = (ext) => byExt(ext).find((f) => _stem(f) === _stem(shp)) || byExt(ext)[0] || null;
    geo = { kind: 'shapefile', name: _stem(shp), shp, dbf: sibling('dbf'), shx: sibling('shx'), prj: sibling('prj'), cpg: sibling('cpg') };
  } else {
    const gj = byExt('geojson')[0] || byExt('json')[0];
    if (gj) geo = { kind: 'geojson', name: _stem(gj), file: gj };
  }
  const tables = byExt('csv');
  if (!geo && tables.length === 1) {
    geo = { kind: 'csv', name: _stem(tables[0]), file: tables[0] };
    return { geo, tables: [] };
  }
  return { geo, tables };
}

/** Parmi des valeurs distinctes [[valeur, n], …], la plus récente (numérique la plus grande). */
export function latestValue(values) {
  const nums = values.map(([v]) => [v, toNumber(v)]).filter(([, n]) => isFinite(n));
  if (nums.length) return nums.sort((a, b) => b[1] - a[1])[0][0];
  return values[0]?.[0] ?? '';
}

/* ── Shapefile (archive zip) ───────────────────────────────────── */

// Lecteur de shapefile chargé à la demande : il embarque la décompression de
// l'archive et la reprojection (Lambert 93 et autres .prj) vers WGS84. Il ne
// pèse rien tant qu'aucune archive n'est déposée.
const SHP_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/shpjs/6.2.0/shp.min.js';
let _shpLoading = null;

function _loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Lecteur de shapefile indisponible (vérifiez la connexion)'));
    document.head.appendChild(s);
  });
}

async function _ensureShpLib() {
  if (typeof window.shp === 'function') return;
  if (!_shpLoading) _shpLoading = _loadScriptOnce(SHP_LIB_URL).catch((e) => { _shpLoading = null; throw e; });
  await _shpLoading;
}

/**
 * Lit un shapefile à partir de ses fichiers séparés (.shp obligatoire, .dbf
 * pour les attributs, .prj pour la reprojection vers WGS84, .cpg pour
 * l'encodage) et retourne une FeatureCollection.
 */
export async function readShapefileParts({ shp, dbf, prj, cpg }) {
  if (!shp) throw new Error('Fichier .shp manquant');
  await _ensureShpLib();
  try {
    const [shpBuf, dbfBuf, prjText, cpgText] = await Promise.all([
      shp.arrayBuffer(), dbf ? dbf.arrayBuffer() : null, prj ? prj.text() : null, cpg ? cpg.text() : null,
    ]);
    const geoms = window.shp.parseShp(shpBuf, prjText || undefined);
    const props = dbfBuf ? window.shp.parseDbf(dbfBuf, cpgText || undefined) : geoms.map(() => ({}));
    const fc = toFeatureCollection(window.shp.combine([geoms, props]));
    if (!fc) throw new Error('contenu non reconnu');
    return fc;
  } catch (e) {
    throw new Error(`Shapefile illisible (${e?.message || e}).`);
  }
}

/**
 * Lit une archive zip contenant un shapefile (.shp + .dbf + .shx, .prj
 * recommandé) et retourne une FeatureCollection en WGS84. Une archive
 * contenant plusieurs shapefiles est fusionnée en une seule couche.
 */
export async function readShapefileZip(file) {
  await _ensureShpLib();
  const buf = await file.arrayBuffer();
  let result;
  try {
    result = await window.shp(buf);
  } catch (e) {
    throw new Error(`Shapefile illisible (${e?.message || e}). L'archive doit contenir .shp, .dbf et .shx.`);
  }
  const collections = (Array.isArray(result) ? result : [result]).map(toFeatureCollection).filter(Boolean);
  if (!collections.length) throw new Error('Aucun shapefile trouvé dans l\'archive');
  return { type: 'FeatureCollection', features: collections.flatMap((fc) => fc.features) };
}

/* ── Géométrie ─────────────────────────────────────────────────── */

/** Distance en mètres entre deux [lng, lat] (haversine). */
export function distanceM(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Emprise [minLng, minLat, maxLng, maxLat] d'une liste de features préparées. */
export function featuresBbox(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    const [x, y] = f.__pt;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/** Surface approximative (km²) de l'emprise d'une sélection. */
export function bboxAreaKm2(bbox) {
  if (!bbox) return 0;
  const midLat = ((bbox[1] + bbox[3]) / 2) * Math.PI / 180;
  const w = (bbox[2] - bbox[0]) * 111.32 * Math.cos(midLat);
  const h = (bbox[3] - bbox[1]) * 110.574;
  return Math.max(0.01, Math.abs(w * h));
}

/** Test point dans polygone (ray casting) - poly = [[x, y], …] en coordonnées écran. */
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1])
      && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
