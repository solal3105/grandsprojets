/**
 * Diagnostic terrain - compteurs vélo (pages publiques Eco-Compteur).
 * La plateforme nationale des fréquentations et les observatoires locaux
 * publient leurs compteurs sur Eco-Visio, dont l'interface publique répond
 * au navigateur. Chaque compteur porte sa position, sa moyenne journalière,
 * le passage de la veille et le total depuis sa pose : on ne garde que ceux
 * situés dans les contours du territoire.
 */

import { pointInPolygon } from '../data.js';
import { ECO_VISIO_ORGANISMES, NATIONAL_ORGANISME } from './eco-visio-organismes.js';

const API = 'https://www.eco-visio.net/api/aladdin/1.0.0/pbl/publicwebpageplus';
const PRATIQUE = { 1: 'piétons', 2: 'vélos', 3: 'chevaux', 4: 'voitures', 5: 'motos', 6: 'engins', 7: 'vélos', 12: 'mixte' };

/** Deux emprises [minLng, minLat, maxLng, maxLat] se touchent-elles ? */
export function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Organismes à consulter pour une emprise : le réseau national et les observatoires qui la touchent. */
export function organismesFor(bbox) {
  const local = ECO_VISIO_ORGANISMES.filter((o) => o.id !== NATIONAL_ORGANISME && bboxIntersects(o.bbox, bbox));
  return [{ id: NATIONAL_ORGANISME, nom: 'Réseau vélo et marche' }, ...local];
}

/** Un compteur est-il dans l'un des anneaux du territoire ? */
export function insideTerritory(lng, lat, contours) {
  const [x, y] = [lng, lat];
  const b = contours.bbox;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  return contours.rings.some((ring) => pointInPolygon([x, y], ring));
}

/** Un compteur Eco-Visio → une entité, ou null s'il est hors territoire ou sans position. */
export function counterToFeature(c, contours, organismeNom) {
  const lng = Number(c?.lon);
  const lat = Number(c?.lat);
  if (!isFinite(lng) || !isFinite(lat) || !insideTerritory(lng, lat, contours)) return null;
  const kinds = [...new Set((Array.isArray(c.pratique) ? c.pratique : []).map((p) => PRATIQUE[p.pratique]).filter(Boolean))];
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      nom: String(c.nom || '').trim(),
      type: kinds.length === 1 ? kinds[0] : (kinds.length ? 'mixte' : (PRATIQUE[c.mainPratique] || '')),
      moyenne_journaliere: Number(c.moyD) || 0,
      hier: Number(c.lastDay) || 0,
      total_depuis_la_pose: Number(c.total) || 0,
      installe_le: String(c.debut || ''),
      releve_le: String(c.today || ''),
      organisme: String(c.nomOrganisme || organismeNom || ''),
      id_compteur: Number(c.idPdc) || null,
    },
  };
}

async function _list(organismeId) {
  const res = await fetch(`${API}/${organismeId}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Eco-Visio a répondu ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Compteurs du territoire : toutes les pages publiques concernées sont lues,
 * les compteurs hors contours écartés, les doublons fusionnés.
 * @param {{rings, bbox}} contours
 * @param {(msg: string) => void} [onProgress]
 */
export async function fetchCounters(contours, onProgress) {
  const seen = new Map();
  let failures = 0;
  for (const org of organismesFor(contours.bbox)) {
    onProgress?.(`${org.nom} : lecture des compteurs…`);
    let list = [];
    try { list = await _list(org.id); } catch { failures++; continue; }
    for (const c of list) {
      const f = counterToFeature(c, contours, org.nom);
      if (f && !seen.has(f.properties.id_compteur)) seen.set(f.properties.id_compteur, f);
    }
  }
  if (!seen.size && failures) throw new Error('Les pages publiques Eco-Compteur ne répondent pas pour le moment. Réessayez dans quelques minutes.');
  return { type: 'FeatureCollection', features: [...seen.values()] };
}

/** Réglages de la couche de compteurs. */
export function countersLayerCfg(scopeLabel) {
  return {
    label: `Compteurs vélo · ${scopeLabel}`,
    group_label: 'Mobilité',
    kind: 'reference',
    style: { mode: 'graduated', color: '#0F766E', value_field: 'moyenne_journaliere', radius: 6 },
    popup: { title_field: 'nom', fields: ['type', 'moyenne_journaliere', 'hier', 'total_depuis_la_pose', 'installe_le', 'organisme'] },
    metrics: [
      { field: 'moyenne_journaliere', agg: 'sum' },
      { field: 'moyenne_journaliere', agg: 'max' },
    ],
    ai_context: 'Compteurs automatiques de passages (vélos, parfois piétons) publiés par la plateforme nationale des fréquentations et les observatoires locaux, avec la moyenne journalière de passages, le passage de la veille et le total depuis la pose',
    default_on: true,
  };
}
