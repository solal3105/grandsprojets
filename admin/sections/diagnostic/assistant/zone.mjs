/**
 * Diagnostic terrain - assistant « Demander » : la zone et ses chiffres.
 * Calcul pur, sans réseau ni interface : quelles entités de chaque couche sont
 * dans le rayon du lieu, ce qu'elles comptent, les textes à lire (les plus
 * proches d'abord) avec leurs références, et le bilan par grand axe.
 * Le modèle de langage ne fait que restituer ce que ce fichier calcule.
 */

import { distanceToGeometryM, insideRing } from '../geometry.js';
import { aggregateMetrics, geometryBbox } from '../data.js';
import { layerKind, layerMetrics } from '../state.js';
import { sourceOfLayer } from '../sources.js';
import { observationText, accidentDetail } from '../dossier/model.js';
import { accidentsInsights, cyclewaysInsights, stravaInsights, lengthKm } from '../insights.js';
import { DEFAULT_RADIUS, MAX_RADIUS, TEXTS_PER_LAYER, TEXT_CHARS, ASSISTANT_REQUEST_MAX_CHARS } from './contract.mjs';

const M_PER_DEG = 111320;
/** Entités de référence décrites une par une au modèle, au plus. */
const ITEMS_PER_REFERENCE = 15;
/** Distance maximale entre une entité et un grand axe pour lui être rattachée. */
export const AXIS_BUFFER_M = 35;

/** Forme d'une géométrie de lieu : 'point', 'line' ou 'area'. */
export function geometryKind(geometry) {
  const t = geometry?.type || '';
  if (/Point/.test(t)) return 'point';
  if (/LineString/.test(t)) return 'line';
  return 'area';
}

/** Rayon retenu : celui demandé (borné), sinon celui du tour précédent, sinon celui de la forme du lieu. */
export function chooseRadius(requested, geometry, previous = null) {
  const n = Number(requested);
  if (Number.isFinite(n) && n > 0) return Math.min(MAX_RADIUS, Math.max(10, Math.round(n)));
  if (Number.isFinite(previous) && previous > 0) return previous;
  return DEFAULT_RADIUS[geometryKind(geometry)];
}

/** Anneaux extérieurs d'un polygone ou multipolygone. */
function outerRings(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map((p) => p[0]);
  return [];
}
const insideArea = (p, geometry) => outerRings(geometry).some((ring) => ring && insideRing(p, ring));

/** Sommets d'une géométrie, échantillonnés pour borner le calcul. */
function vertices(geometry, cap = 400) {
  const out = [];
  const walk = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') { out.push(c); return; }
    c.forEach(walk);
  };
  walk(geometry?.coordinates);
  if (out.length <= cap) return out;
  const step = out.length / cap;
  return Array.from({ length: cap }, (_, i) => out[Math.floor(i * step)]);
}

/** Distance en mètres entre une entité et le lieu (0 si elle le touche ou s'y trouve). */
export function distanceToPlace(geometry, place) {
  if (!geometry || !place) return Infinity;
  if (place.type === 'Point') {
    const p = place.coordinates;
    if (insideArea(p, geometry)) return 0;
    return distanceToGeometryM(p, geometry);
  }
  const placeArea = geometryKind(place) === 'area';
  if (geometry.type === 'Point') {
    if (placeArea && insideArea(geometry.coordinates, place)) return 0;
    return distanceToGeometryM(geometry.coordinates, place);
  }
  let best = Infinity;
  for (const v of vertices(geometry)) {
    if (placeArea && insideArea(v, place)) return 0;
    best = Math.min(best, distanceToGeometryM(v, place));
  }
  return best;
}

/** Emprise du lieu élargie du rayon, en degrés. */
function searchBox(place, radius) {
  const b = geometryBbox(place);
  if (!b) return null;
  const lat = (b[1] + b[3]) / 2;
  const dy = radius / M_PER_DEG, dx = radius / (M_PER_DEG * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}
const overlaps = (a, b) => a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/**
 * Entités d'une couche dans la zone, triées de la plus proche à la plus lointaine.
 * Sans lieu (tout le territoire), toutes les entités sont retenues.
 */
export function featuresInZone(features, place, radius) {
  if (!place) return features.map((feature) => ({ feature, distance: 0 }));
  const box = searchBox(place, radius);
  const out = [];
  for (const feature of features) {
    const g = feature?.geometry;
    if (!g) continue;
    if (g.type === 'Point') {
      const [x, y] = g.coordinates;
      if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    } else if (!overlaps(geometryBbox(g), box)) continue;
    const distance = distanceToPlace(g, place);
    if (distance <= radius) out.push({ feature, distance });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/** Lettre de référence de la n-ième couche : a, b, … z, aa, ab… */
export function layerLetter(index) {
  let s = '', n = index;
  do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

const clip = (text, max = TEXT_CHARS) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};
const str = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** Où se trouve une entité, d'après ses propriétés (adresse, rue, nom). */
function whereOf(p = {}) {
  return str(p.adresse) || str(p.address) || [str(p.rue), str(p.commune)].filter(Boolean).join(', ') || '';
}

/** Texte d'une entité tel que le modèle le lit. */
export function itemText(feature, layer, source) {
  const p = feature.properties || {};
  if (source === 'accidents') return clip([str(p.date), accidentDetail(p)].filter(Boolean).join(' : '));
  if (layerKind(layer) === 'temoignages') return clip(observationText(feature, layer));
  const popup = layer.popup || {};
  const title = str(p[popup.title_field]);
  const values = (popup.fields || []).filter((f) => f !== popup.title_field).map((f) => (str(p[f]) ? `${f} : ${str(p[f])}` : '')).filter(Boolean);
  return clip([title, ...values].filter(Boolean).join(' ; '));
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Chiffres d'une source connue, dans les mots que le modèle restitue. */
function sourceFigures(source, features) {
  if (source === 'accidents') {
    const a = accidentsInsights(features);
    return a && {
      accidents: a.count, personnes_tuees: a.tues, blesses_hospitalises: a.hospitalises, blesses_legers: a.legers,
      accidents_avec_cycliste: a.velo, accidents_avec_pieton: a.pieton, accidents_par_annee: a.byYear,
    };
  }
  if (source === 'osm-cycleways') {
    const c = cyclewaysInsights(features);
    return c && { km_amenages: c.km, km_par_type: c.byType };
  }
  if (source === 'strava') {
    const s = stravaInsights(features);
    return s && { troncons: s.segments, trajets_par_jour_troncon_le_plus_frequente: s.busiestPerDay, part_domicile_travail_pct: s.commuteShare };
  }
  return null;
}

/**
 * Faits d'une couche dans la zone : nombre, chiffres calculés, entités à lire
 * avec leur référence (lettre de la couche + rang de proximité).
 * @returns {{ facts: object, refs: Map<string, {layerId, feature, distance}> }}
 */
export function layerFacts(layer, members, letter, { texts = TEXTS_PER_LAYER } = {}) {
  const source = sourceOfLayer(layer)?.id || '';
  const kind = layerKind(layer);
  const features = members.map((m) => m.feature);
  const facts = { id: layer.id, lettre: letter, couche: layer.label, nature: kind === 'temoignages' ? 'témoignages' : 'référence', nombre_dans_la_zone: members.length };
  if (layer.ai_context) facts.description = clip(layer.ai_context, 300);
  const metrics = layerMetrics(layer);
  const values = aggregateMetrics(features, metrics);
  if (values.length) {
    facts.chiffres = values.map((v) => {
      const m = metrics.find((x) => x.field === v.field) || {};
      return { libelle: m.label || v.field, valeur: round(v.value), unite: m.unit || '' };
    });
  }
  const figures = sourceFigures(source, features);
  if (figures) facts.calculs = figures;
  if (members.some((m) => /LineString/.test(m.feature.geometry?.type || ''))) {
    facts.km_de_trace = round(features.reduce((s, f) => s + lengthKm(f.geometry), 0));
  }
  const refs = new Map();
  const cap = kind === 'temoignages' ? texts : Math.min(texts, ITEMS_PER_REFERENCE);
  // Les tracés (aménagements, tronçons) se résument par leurs chiffres.
  const describable = members.filter((m) => /Point/.test(m.feature.geometry?.type || ''));
  const items = [];
  for (const m of describable) {
    if (items.length >= cap) break;
    const texte = itemText(m.feature, layer, source);
    if (!texte) continue;
    const ref = `${letter}${items.length + 1}`;
    refs.set(ref, { layerId: layer.id, feature: m.feature, distance: m.distance });
    const item = { ref, texte, distance_m: Math.round(m.distance) };
    const where = whereOf(m.feature.properties);
    if (where && !texte.includes(where)) item.lieu = clip(where, 120);
    items.push(item);
  }
  if (items.length) facts[kind === 'temoignages' ? 'textes' : 'exemples'] = items;
  if (describable.length > items.length && items.length) facts.non_detailles = describable.length - items.length;
  return { facts, refs };
}

/**
 * Faits de toutes les couches demandées.
 * @param {Array} layers - couches (config) à lire
 * @param {(id) => Array} featuresOf - entités chargées d'une couche
 * @returns {{ couches: object[], refs: Map, members: Map<layerId, Array> }}
 */
export function zoneFacts(layers, featuresOf, place, radius, { texts = TEXTS_PER_LAYER } = {}) {
  const couches = [], refs = new Map(), members = new Map();
  layers.forEach((layer, i) => {
    const inZone = featuresInZone(featuresOf(layer.id) || [], place, radius);
    members.set(layer.id, inZone);
    const out = layerFacts(layer, inZone, layerLetter(i), { texts });
    couches.push(out.facts);
    for (const [k, v] of out.refs) refs.set(k, v);
  });
  return { couches, refs, members };
}

/** Réduit les textes jusqu'à ce que la demande tienne dans la taille admise. */
export function fitFacts(build, maxChars = ASSISTANT_REQUEST_MAX_CHARS - 8000) {
  for (const texts of [TEXTS_PER_LAYER, 25, 15, 8, 4]) {
    const out = build(texts);
    if (JSON.stringify(out.couches).length + JSON.stringify(out.extra || {}).length <= maxChars) return out;
  }
  return build(2);
}

/** Regroupe les tronçons OpenStreetMap d'un même nom en un seul axe. */
export function mergeAxes(ways) {
  const byName = new Map();
  for (const w of ways) {
    const name = str(w.name);
    if (!name || !Array.isArray(w.coordinates) || w.coordinates.length < 2) continue;
    if (!byName.has(name)) byName.set(name, { nom: name, rang: w.rank ?? 9, lines: [] });
    const axis = byName.get(name);
    axis.rang = Math.min(axis.rang, w.rank ?? 9);
    axis.lines.push(w.coordinates);
  }
  return [...byName.values()].map((a) => ({ nom: a.nom, rang: a.rang, geometry: { type: 'MultiLineString', coordinates: a.lines } }));
}

/**
 * Bilan par grand axe : chaque entité ponctuelle de la zone est rattachée à
 * l'axe le plus proche, s'il passe à moins de AXIS_BUFFER_M.
 * @returns {Array<{axe, total, par_couche: object, refs: string[]}>}
 */
export function axesFacts(axes, couches, refs, members) {
  if (!axes?.length) return [];
  const byLayerRef = new Map();
  for (const [ref, r] of refs) byLayerRef.set(r.feature, ref);
  const rows = axes.map((a) => ({ axe: a.nom, total: 0, par_couche: {}, refs: [], geometry: a.geometry }));
  for (const c of couches) {
    for (const m of members.get(c.id) || []) {
      const g = m.feature.geometry;
      if (g?.type !== 'Point') continue;
      let best = null, bestD = AXIS_BUFFER_M;
      for (const row of rows) {
        const d = distanceToGeometryM(g.coordinates, row.geometry);
        if (d <= bestD) { best = row; bestD = d; }
      }
      if (!best) continue;
      best.total++;
      best.par_couche[c.couche] = (best.par_couche[c.couche] || 0) + 1;
      const ref = byLayerRef.get(m.feature);
      if (ref && best.refs.length < 6) best.refs.push(ref);
    }
  }
  return rows.filter((r) => r.total).sort((a, b) => b.total - a.total).map(({ geometry: _g, ...r }) => r);
}

/**
 * Retire d'une réponse les références qui n'existent pas, et renvoie celles
 * qui restent dans leur ordre d'apparition.
 */
export function checkRefs(text, refs) {
  const used = [];
  const clean = String(text || '').replace(/\s*\[\[([a-z]+\d+)\]\]/gi, (all, ref) => {
    const k = ref.toLowerCase();
    if (!refs.has(k)) return '';
    if (!used.includes(k)) used.push(k);
    return all.replace(ref, k);
  });
  return { text: clean, used };
}
