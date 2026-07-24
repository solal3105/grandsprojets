/**
 * Diagnostic terrain - chargement et normalisation des données.
 * Fonctions pures : GeoJSON, CSV, détection de champs, géométrie.
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

/** URL de chargement d'une couche selon son type de source. */
export function layerDataUrl(layer) {
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fc = toFeatureCollection(await res.json());
  if (!fc) throw new Error('GeoJSON non reconnu');
  return prepareFeatures(fc);
}

/* ── CSV → GeoJSON ─────────────────────────────────────────────── */

/**
 * Parse un CSV en objets clé→valeur. Parser à état conforme RFC 4180 :
 * guillemets, séparateur , ou ; auto-détecté, retours à la ligne DANS les
 * champs entre guillemets.
 */
export function parseCsv(text) {
  const src = String(text).replace(/\r\n?/g, '\n');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? src.length : src.indexOf('\n'));
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === sep) { row.push(cell.trim()); cell = ''; continue; }
    if (c === '\n') {
      row.push(cell.trim());
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += c;
  }
  row.push(cell.trim());
  if (row.some((v) => v !== '')) rows.push(row);

  if (rows.length < 2) return { headers: rows[0] || [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1).map((values) => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = values[i] ?? ''; });
    return rec;
  });
  return { headers, records };
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
