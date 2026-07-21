/**
 * Diagnostic terrain — chargement et normalisation des données.
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

/** Point d'ancrage d'une feature (centre de l'emprise pour les lignes/polygones). */
export function anchorPoint(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    const c = geometry.coordinates;
    return Array.isArray(c) && isFinite(c[0]) && isFinite(c[1]) ? [c[0], c[1]] : null;
  }
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
  if (!isFinite(minX)) return null;
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/**
 * Prépare les features d'une couche : filtre les géométries invalides et
 * pré-calcule le point d'ancrage (`__pt`) utilisé par le lasso et la heatmap.
 */
export function prepareFeatures(fc) {
  const out = [];
  for (const f of fc.features || []) {
    if (!f || !f.geometry) continue;
    const pt = anchorPoint(f.geometry);
    if (!pt) continue;
    out.push({ ...f, properties: f.properties || {}, __pt: pt });
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

function _parseCsvLine(line, sep) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      continue;
    }
    if (c === sep && !quoted) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** Parse un CSV (séparateur , ou ; auto-détecté) en objets clé→valeur. */
export function parseCsv(text) {
  const lines = String(text).trim().split('\n').map((l) => l.replace(/\r/g, ''));
  if (lines.length < 2) return { headers: [], records: [] };
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = _parseCsvLine(lines[0], sep);
  const records = lines.slice(1).filter(Boolean).map((line) => {
    const values = _parseCsvLine(line, sep);
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
  for (let i = 0; i < low.length; i++) {
    if (keys.some((k) => low[i].includes(k))) return headers[i];
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

/** Test point dans polygone (ray casting) — poly = [[x, y], …] en coordonnées écran. */
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
