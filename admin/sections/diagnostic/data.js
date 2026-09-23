/**
 * Diagnostic terrain - chargement et normalisation des données.
 * Fonctions pures : GeoJSON, CSV (lecture en flux), shapefile, jointure d'un
 * tableau, détection de champs, agrégats de zone, géométrie.
 */

import * as api from '../../api.js';
import { store } from '../../store.js';
import { INTERNAL_SOURCES } from './state.js';

/** Normalise n'importe quel GeoJSON en FeatureCollection (ou null). */
export function toFeatureCollection(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) return json;
  if (json.type === 'Feature' && json.geometry) return { type: 'FeatureCollection', features: [json] };
  return null;
}

/** Session expirée sur la page d'une source du catalogue (relais Waze et Baromètre). */
export const SESSION_EXPIRED = 'Votre session a expiré. Reconnectez-vous, puis rouvrez cette source.';

/**
 * Message lisible d'une erreur. Nos propres messages (Error simples, écrits
 * pour l'écran) passent tels quels ; ceux de la base, du stockage ou du
 * navigateur, écrits pour un développeur, sont remplacés par `fallback`.
 */
export function readableError(err, fallback) {
  if (!err) return fallback;
  if (err.name === 'TimeoutError') return 'Le service a mis trop de temps à répondre. Réessayez dans quelques minutes.';
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message || '')) return 'La connexion a échoué. Vérifiez votre réseau, puis réessayez.';
  const ours = err instanceof Error && err.constructor === Error
    && !('code' in err) && !('details' in err) && !('statusCode' in err) && !err.__isStorageError;
  return ours && err.message ? err.message : fallback;
}

/** « 1 point », « 12 tronçons » : le nom concret des éléments d'une couche, selon leur forme. */
export function countLabel(n, features) {
  const type = features?.[0]?.geometry?.type || '';
  const [one, many] = /Point/.test(type) ? ['point', 'points']
    : /Line/.test(type) ? ['tronçon', 'tronçons']
      : /Polygon/.test(type) ? ['zone', 'zones'] : ['élément', 'éléments'];
  const count = Number(n) || 0;
  return `${count.toLocaleString('fr-FR')} ${count >= 2 ? many : one}`;
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

/** Une emprise [minX, minY, maxX, maxY] tient-elle en longitudes et latitudes (degrés) ? */
export function inDegrees(bbox) {
  return Array.isArray(bbox) && bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90;
}

/**
 * Prépare les features d'une couche : filtre les géométries invalides et
 * pré-calcule le point d'ancrage (`__pt`) et l'emprise (`__bbox`) utilisés
 * par le lasso et la heatmap. Une position hors des degrés (couche en Lambert 93
 * enregistrée avant le contrôle d'import) est écartée : elle ne peut ni
 * s'afficher ni cadrer la carte.
 */
export function prepareFeatures(fc) {
  const out = [];
  for (const f of fc.features || []) {
    if (!f || !f.geometry) continue;
    const bbox = geometryBbox(f.geometry);
    if (!bbox || !inDegrees(bbox)) continue;
    const pt = f.geometry.type === 'Point'
      ? [f.geometry.coordinates[0], f.geometry.coordinates[1]]
      : [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    out.push({ ...f, properties: f.properties || {}, __pt: pt, __bbox: bbox });
  }
  return out;
}

// Noms d'un système de coordonnées en degrés (WGS 84), tels que les écrivent les logiciels.
const WGS84_NAMES = /crs84|epsg:{1,2}(4326|4979)\b|wgs[\s_-]?84/i;

/**
 * Le fichier est-il dans une autre projection que les degrés ? Soit il le
 * déclare (membre `crs` d'un GeoJSON en Lambert 93), soit aucune de ses
 * positions ne tient en longitudes et latitudes.
 */
export function projectionProblem(fc) {
  const declared = fc?.crs?.properties?.name;
  if (declared && !WGS84_NAMES.test(String(declared))) return true;
  let valid = 0, outside = 0;
  for (const f of fc?.features || []) {
    const bbox = geometryBbox(f?.geometry);
    if (!bbox) continue;
    if (inDegrees(bbox)) valid++; else outside++;
  }
  return !valid && outside > 0;
}

/** Colonnes de coordonnées remplies de nombres qui ne sont pas des degrés (Lambert 93, par exemple). */
export function csvProjectionProblem(records, latCol, lngCol) {
  if (!latCol || !lngCol) return false;
  let numeric = 0, degrees = 0;
  for (const rec of records || []) {
    const lat = parseFloat(String(rec?.[latCol] ?? '').replace(',', '.'));
    const lng = parseFloat(String(rec?.[lngCol] ?? '').replace(',', '.'));
    if (!isFinite(lat) || !isFinite(lng)) continue;
    numeric++;
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) degrees++;
  }
  return numeric > 0 && degrees === 0;
}

/** Ce qu'il faut faire d'un fichier dont les positions ne sont pas en degrés. */
export function projectionMessage({ kind = 'geojson', lat = '', lng = '', hasPrj = true } = {}) {
  if (kind === 'csv') {
    return `Les colonnes « ${lat} » et « ${lng} » ne contiennent pas des latitudes et des longitudes en degrés : leurs valeurs sont sans doute exprimées dans une autre projection, comme le Lambert 93. Ajoutez à votre tableau des colonnes de latitude et de longitude en degrés (WGS 84), ou demandez cet export à votre service SIG.`;
  }
  if (kind === 'shapefile' && !hasPrj) {
    return 'Ce shapefile est arrivé sans son fichier .prj, qui indique sa projection, et ses positions ne sont pas en latitude et longitude. Déposez-le de nouveau avec son fichier .prj (même nom, extension .prj) : nous le convertirons nous-mêmes.';
  }
  return 'Les positions de ce fichier ne sont pas en latitude et longitude : il utilise une autre projection, comme le Lambert 93. Demandez à votre service SIG un export en WGS 84 (EPSG:4326), ou déposez le shapefile d\'origine avec son fichier .prj : nous le convertirons nous-mêmes.';
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

/** Plus grande valeur d'une liste, sans étaler la liste en arguments (au-delà de 65 000 valeurs, Math.max(...v) échoue). */
export function maxOf(values) {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  return max;
}

/** Agrégations disponibles pour un chiffre de zone. */
export const METRIC_AGGS = {
  sum: { label: 'Total', apply: (values) => values.reduce((a, b) => a + b, 0) },
  mean: { label: 'Moyenne', apply: (values) => values.reduce((a, b) => a + b, 0) / values.length },
  max: { label: 'Maximum', apply: (values) => maxOf(values) },
};

/**
 * Chiffres de zone d'une couche de référence : pour chaque métrique
 * configurée ({ field, agg, label?, unit?, min? }), l'agrégat des entités
 * fournies. Une valeur sous `min` est écartée (Waze note -1 le retard d'une
 * circulation bloquée : ce n'est pas un retard). Une métrique sans aucune
 * valeur numérique est omise (jamais un 0 inventé).
 */
export function aggregateMetrics(features, metrics) {
  const out = [];
  for (const m of Array.isArray(metrics) ? metrics : []) {
    if (!m || typeof m.field !== 'string') continue;
    const agg = Object.hasOwn(METRIC_AGGS, m.agg) ? METRIC_AGGS[m.agg] : METRIC_AGGS.sum;
    const min = Number.isFinite(m.min) ? m.min : -Infinity;
    const values = [];
    for (const f of features) {
      const n = toNumber(f.properties?.[m.field]);
      if (isFinite(n) && n >= min) values.push(n);
    }
    if (!values.length) continue;
    out.push({ field: m.field, agg: Object.hasOwn(METRIC_AGGS, m.agg) ? m.agg : 'sum', value: agg.apply(values), n: values.length });
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

/** Référence d'un fichier déposé dans le compartiment privé : « storage:diagnostic/<ville>/<fichier> ». */
export const isPrivateFileRef = (ref) => String(ref || '').startsWith('storage:diagnostic/');

/** URL de chargement d'une couche selon son type de source. */
function layerDataUrl(layer) {
  if (layer.source_type === 'internal') {
    const src = INTERNAL_SOURCES[layer.source_ref];
    if (!src) return null;
    return `${src.endpoint}?ville=${encodeURIComponent(store.city || '')}`;
  }
  return layer.source_ref || null;
}

/**
 * Lit un GeoJSON depuis des octets, compressés (gzip) ou non. Le format se
 * reconnaît à ses deux premiers octets, pas à l'adresse : un serveur peut
 * aussi bien livrer le fichier tel quel que déjà décompressé.
 */
async function _geojsonFromBlob(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const gzipped = head[0] === 0x1f && head[1] === 0x8b;
  if (gzipped && typeof DecompressionStream !== 'function') {
    throw new Error('Ce navigateur ne sait pas ouvrir les couches compressées. Mettez-le à jour, puis rechargez la page.');
  }
  const stream = gzipped ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob.stream();
  try {
    return await new Response(stream).json();
  } catch {
    throw new Error('Les données reçues sont illisibles. Si la source a changé, retirez la couche puis ajoutez-la de nouveau.');
  }
}

/** Ce qu'il faut dire quand une adresse de données répond par une erreur. */
async function _httpError(res, url) {
  let server = '';
  try {
    const body = await res.json();
    if (typeof body?.error === 'string') server = body.error.trim();
  } catch { /* réponse sans message */ }
  if (res.status === 401) return 'Votre session a expiré. Reconnectez-vous, puis réessayez.';
  // Nos relais (Waze, Baromètre) rédigent un message utile : il passe tel quel.
  if (server && url.startsWith('/api/sources/')) return server;
  if (res.status === 404) return 'Les données de cette couche sont introuvables à leur adresse. Retirez la couche, puis ajoutez de nouveau vos données.';
  if (res.status === 403) return 'Le service qui publie ces données en refuse l\'accès. Vérifiez que l\'adresse est toujours publique.';
  if (res.status >= 500) return `Le service qui fournit ces données ne répond pas pour le moment (erreur ${res.status}). Réessayez dans quelques minutes.`;
  return `Les données n'ont pas pu être chargées (erreur ${res.status}). Réessayez dans quelques minutes.`;
}

/** Charge et prépare le GeoJSON d'une couche. Throw en cas d'échec, avec un message à afficher. */
export async function loadLayerData(layer) {
  // Fichier déposé dans le compartiment privé : téléchargé avec la session.
  if (isPrivateFileRef(layer.source_ref)) {
    let blob;
    try {
      blob = await api.downloadDiagnosticFile(layer.source_ref);
    } catch (e) {
      throw new Error(e?.status === 404
        ? 'Le fichier de cette couche est introuvable. Retirez la couche, puis ajoutez de nouveau vos données.'
        : readableError(e, 'Le fichier de cette couche n\'a pas pu être téléchargé. Vérifiez votre connexion, puis réessayez.'));
    }
    return _featuresOf(await _geojsonFromBlob(blob));
  }
  const url = layerDataUrl(layer);
  if (!url) throw new Error('La source de cette couche n\'existe plus. Retirez la couche, puis ajoutez de nouveau vos données.');
  // Une source relayée par nos fonctions (flux partenaire) exige la session.
  const headers = url.startsWith('/api/sources/') && store.session?.access_token
    ? { Authorization: `Bearer ${store.session.access_token}` }
    : {};
  let res;
  try {
    res = await fetch(url, { headers });
  } catch {
    throw new Error('Nous n\'avons pas pu joindre l\'adresse de ces données. Vérifiez votre connexion, puis réessayez.');
  }
  if (!res.ok) throw new Error(await _httpError(res, url));
  // Anciennes couches déposées (adresse publique, fichier compressé) comme
  // liens distants : même lecture.
  return _featuresOf(await _geojsonFromBlob(await res.blob()));
}

function _featuresOf(json) {
  const fc = toFeatureCollection(json);
  if (!fc) throw new Error('Les données reçues ne sont pas des données cartographiques. Si la source a changé, retirez la couche puis ajoutez-la de nouveau.');
  const features = prepareFeatures(fc);
  // Couche enregistrée en Lambert 93 avant le contrôle d'import : plutôt
  // qu'une couche vide sans explication, la raison et la marche à suivre.
  if (!features.length && fc.features.length && projectionProblem(fc)) {
    throw new Error('Les positions de cette couche ne sont pas en latitude et longitude (Lambert 93 ou autre projection) : elle ne peut pas s\'afficher. Retirez-la, puis ajoutez de nouveau vos données en WGS 84.');
  }
  return features;
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

/* ── Encodage des fichiers texte ────────────────────────────────── */

/**
 * Décode un texte entier : UTF-8, sinon Windows-1252, l'encodage des tableaux
 * enregistrés par Excel en France (sans quoi les accents deviennent « � »).
 */
export function decodeText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Texte d'un fichier déposé, dans son encodage réel. */
export async function readTextFile(file) {
  return decodeText(await file.arrayBuffer());
}

const _concatBytes = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/** Le texte contient-il un caractère hors ASCII ? */
function _hasNonAscii(text) {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) return true;
  return false;
}

/**
 * Octets d'une séquence UTF-8 commencée mais pas terminée à la fin d'un
 * morceau (le décodeur les garde en attente du morceau suivant).
 */
function _pendingUtf8(previous, bytes) {
  const last = bytes.length >= 3 ? bytes.subarray(bytes.length - 3) : _concatBytes(previous, bytes).slice(-3);
  for (let i = last.length - 1; i >= 0; i--) {
    const b = last[i];
    if (b < 0x80) return new Uint8Array(0);
    if (b >= 0xC0) {
      const need = b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : 2;
      return last.length - i < need ? last.slice(i) : new Uint8Array(0);
    }
  }
  return new Uint8Array(0);
}

/**
 * Flux d'octets vers flux de texte. En mode « auto », le texte est lu en UTF-8
 * tant qu'il est valide. Au premier octet invalide, un fichier resté ASCII
 * jusque-là est relu en Windows-1252 (tableau d'Excel) ; un fichier qui
 * contenait déjà de l'UTF-8 valide reste lu en UTF-8.
 */
export function textDecoderStream(encoding = 'auto') {
  if (encoding !== 'auto') return new TextDecoderStream(encoding);
  let decoder = new TextDecoder('utf-8', { fatal: true });
  let strict = true; // encodage pas encore tranché
  let sawNonAscii = false; // un caractère UTF-8 non ASCII a déjà été lu
  let pending = new Uint8Array(0);
  return new TransformStream({
    transform(chunk, controller) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      let text;
      if (strict) {
        try {
          text = decoder.decode(bytes, { stream: true });
          if (!sawNonAscii && _hasNonAscii(text)) sawNonAscii = true;
          pending = _pendingUtf8(pending, bytes);
        } catch {
          decoder = new TextDecoder(sawNonAscii ? 'utf-8' : 'windows-1252');
          strict = false;
          text = decoder.decode(_concatBytes(pending, bytes), { stream: true });
          pending = new Uint8Array(0);
        }
      } else {
        text = decoder.decode(bytes, { stream: true });
      }
      if (text) controller.enqueue(text);
    },
    flush(controller) {
      let text;
      try {
        text = decoder.decode();
      } catch {
        // Le fichier s'achève sur un octet isolé : ce n'était pas de l'UTF-8.
        text = new TextDecoder(sawNonAscii ? 'utf-8' : 'windows-1252').decode(pending);
      }
      if (text) controller.enqueue(text);
    },
  });
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
 * sans jamais être chargé entier. L'encodage est reconnu tout seul (voir
 * textDecoderStream), sauf s'il est imposé.
 */
export async function streamCsvFromStream(stream, onRow, encoding = 'auto') {
  let headers = null;
  let stop = false;
  const parser = new CsvParser((row) => {
    if (stop) return;
    if (!headers) { headers = row; return; }
    if (onRow(row, headers) === false) stop = true;
  });
  const reader = stream.pipeThrough(textDecoderStream(encoding)).getReader();
  let failed = false;
  try {
    while (!stop) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(value);
    }
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    // Lecture interrompue (aperçu, erreur) : le reste du flux n'est pas téléchargé.
    if (stop || failed) await reader.cancel().catch(() => {});
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

/**
 * Devine la colonne correspondant à l'un des mots-clés donnés, hors des
 * colonnes exclues. Rien de convaincant : '' (l'administrateur choisit).
 */
export function guessColumn(headers, keys, { exclude = [] } = {}) {
  const avoid = new Set(exclude.filter(Boolean));
  const low = headers.map((h) => String(h).toLowerCase().trim());
  for (const k of keys) {
    const i = low.findIndex((h, j) => h === k && !avoid.has(headers[j]));
    if (i >= 0) return headers[i];
  }
  // Repli par sous-chaîne - uniquement pour les clés non ambiguës (≥ 3 car.,
  // sinon « x »/« y » matchent n'importe quel en-tête).
  for (let i = 0; i < low.length; i++) {
    if (avoid.has(headers[i])) continue;
    if (keys.some((k) => k.length >= 3 && low[i].includes(k))) return headers[i];
  }
  return '';
}

/** Colonnes de latitude et de longitude d'un tableau : jamais la même pour les deux. */
export function guessLatLng(headers) {
  const lat = guessColumn(headers, ['lat', 'latitude', 'y']);
  const lng = guessColumn(headers, ['lon', 'lng', 'long', 'longitude', 'x'], { exclude: [lat] });
  return { lat, lng };
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
  if (eocd < 0) throw new Error('Cette archive zip est illisible : elle est peut-être incomplète. Téléchargez-la de nouveau, puis déposez-la.');
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
    } else throw new Error(`Nous ne savons pas ouvrir le fichier « ${name.split('/').pop()} » de cette archive. Décompressez-la sur votre ordinateur, puis déposez directement ses fichiers.`);
    out.push(new File([bytes], name.split('/').pop()));
  }
  return out;
}

/** Aplatit un lot de fichiers : chaque archive zip est remplacée par son contenu. */
export async function expandFiles(files) {
  const out = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) for (const entry of await readZipEntries(f)) out.push(entry);
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
 * Plusieurs sources géographiques dans un même dépôt (une archive qui
 * contient deux shapefiles) sont refusées : en garder une seule sans le dire
 * ferait disparaître les autres.
 */
export function classifyFiles(files) {
  const byExt = (ext) => files.filter((f) => _ext(f) === ext);
  const shps = byExt('shp');
  const candidates = shps.length ? [...shps, ...byExt('geojson')] : (byExt('geojson').length ? byExt('geojson') : byExt('json'));
  if (candidates.length > 1) {
    const names = candidates.slice(0, 4).map((f) => f.name).join(', ') + (candidates.length > 4 ? '…' : '');
    throw new Error(`Ce dépôt contient ${candidates.length} fichiers cartographiques (${names}). Nous en ajoutons un à la fois : déposez-les un par un, chaque shapefile avec ses fichiers .dbf, .shx et .prj.`);
  }
  const shp = shps[0];
  let geo = null;
  if (shp) {
    const sibling = (ext) => byExt(ext).find((f) => _stem(f) === _stem(shp)) || byExt(ext)[0] || null;
    geo = { kind: 'shapefile', name: _stem(shp), shp, dbf: sibling('dbf'), shx: sibling('shx'), prj: sibling('prj'), cpg: sibling('cpg') };
  } else {
    const gj = candidates[0];
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
    s.onerror = () => reject(new Error('Nous n\'avons pas pu charger l\'outil qui lit les shapefiles. Vérifiez votre connexion, puis réessayez.'));
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
 * l'encodage) et retourne une FeatureCollection. Un shapefile dont les
 * positions ne sont pas en degrés (sans .prj, le plus souvent) est refusé.
 */
export async function readShapefileParts({ shp, dbf, prj, cpg }) {
  if (!shp) throw new Error('Le fichier .shp manque : déposez-le avec ses fichiers .dbf, .shx et .prj.');
  await _ensureShpLib();
  let fc = null;
  try {
    const [shpBuf, dbfBuf, prjText, cpgText] = await Promise.all([
      shp.arrayBuffer(), dbf ? dbf.arrayBuffer() : null, prj ? prj.text() : null, cpg ? cpg.text() : null,
    ]);
    const geoms = window.shp.parseShp(shpBuf, prjText || undefined);
    const props = dbfBuf ? window.shp.parseDbf(dbfBuf, cpgText || undefined) : geoms.map(() => ({}));
    fc = toFeatureCollection(window.shp.combine([geoms, props]));
  } catch (e) {
    console.warn('[admin/diagnostic] Shapefile illisible:', e);
  }
  if (!fc) throw new Error('Ce shapefile est illisible. Vérifiez que ses fichiers .shp, .dbf et .shx viennent du même export, puis déposez-les de nouveau.');
  if (projectionProblem(fc)) throw new Error(projectionMessage({ kind: 'shapefile', hasPrj: !!prj }));
  return fc;
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
