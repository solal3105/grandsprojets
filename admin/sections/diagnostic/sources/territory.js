/**
 * Diagnostic terrain - territoire d'un espace.
 * Depuis le centre de la carte de l'espace, retrouve la commune et son
 * intercommunalité (API Découpage administratif, geo.api.gouv.fr), puis la
 * liste des communes de l'intercommunalité. C'est ce qui permet d'aller
 * chercher des données publiques « chez nous » sans rien demander.
 */

import { dg } from '../state.js';

const GEO_API = 'https://geo.api.gouv.fr';

async function _json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Découpage administratif indisponible (HTTP ${res.status})`);
  return res.json();
}

/**
 * Territoire de l'espace courant, mis en cache dans l'état de la section.
 * @returns {Promise<{commune: {code, nom, population}, epci: {code, nom, communes: Array<{code, nom}>}|null}>}
 */
export async function resolveTerritory() {
  if (dg.territory) return dg.territory;
  const b = dg.branding || {};
  const lat = parseFloat(b.center_lat);
  const lng = parseFloat(b.center_lng);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error('Le centre de la carte de votre espace n\'est pas défini : renseignez-le dans Structure.');
  const found = await _json(`${GEO_API}/communes?lat=${lat}&lon=${lng}&fields=nom,code,codeEpci,epci,population`);
  const c = Array.isArray(found) ? found[0] : null;
  if (!c) throw new Error('Aucune commune trouvée au centre de votre carte.');
  const commune = { code: c.code, nom: c.nom, population: c.population || 0 };
  let epci = null;
  if (c.epci?.code) {
    let communes = [];
    try {
      communes = (await _json(`${GEO_API}/epcis/${encodeURIComponent(c.epci.code)}/communes?fields=nom,code`))
        .map((x) => ({ code: x.code, nom: x.nom }));
    } catch { communes = []; }
    epci = { code: c.epci.code, nom: c.epci.nom, communes };
  }
  dg.territory = { commune, epci };
  return dg.territory;
}

/** Libellé court d'un périmètre : « Grenoble » ou « Grenoble-Alpes-Métropole (49 communes) ». */
export function scopeLabel(territory, scope) {
  if (scope === 'epci' && territory?.epci) {
    const n = territory.epci.communes?.length || 0;
    return n ? `${territory.epci.nom} (${n} communes)` : territory.epci.nom;
  }
  return territory?.commune?.nom || '';
}

/**
 * Contours du périmètre (commune seule, ou toutes les communes de
 * l'intercommunalité), en anneaux [lng, lat] prêts pour un test
 * point-dans-polygone. Mis en cache par périmètre.
 * @returns {Promise<{rings: number[][][], bbox: number[]}>}
 */
export async function resolveContours(territory, scope) {
  dg.contours = dg.contours || {};
  const key = scope === 'epci' && territory?.epci ? `epci:${territory.epci.code}` : `commune:${territory?.commune?.code}`;
  if (dg.contours[key]) return dg.contours[key];
  let geometries = [];
  if (scope === 'epci' && territory?.epci) {
    const fc = await _json(`${GEO_API}/communes?codeEpci=${encodeURIComponent(territory.epci.code)}&fields=code&format=geojson&geometry=contour`);
    geometries = (fc.features || []).map((f) => f.geometry).filter(Boolean);
  } else {
    const c = await _json(`${GEO_API}/communes/${encodeURIComponent(territory.commune.code)}?fields=contour&format=json`);
    if (c.contour) geometries = [c.contour];
  }
  const rings = [];
  for (const g of geometries) {
    if (g.type === 'Polygon') rings.push(g.coordinates[0]);
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) rings.push(poly[0]);
  }
  if (!rings.length) throw new Error('Contour du territoire indisponible.');
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y;
    if (x > bbox[2]) bbox[2] = x; if (y > bbox[3]) bbox[3] = y;
  }
  dg.contours[key] = { rings, bbox };
  return dg.contours[key];
}

/**
 * Codes INSEE du périmètre, arrondissements municipaux compris : les fichiers
 * nationaux (accidents) rattachent Paris, Lyon et Marseille à leurs
 * arrondissements (75101…, 69381…, 13201…), jamais au code de la commune.
 */
export async function communeCodesFor(territory, scope) {
  const base = scope === 'epci' && territory?.epci?.communes?.length
    ? territory.epci.communes.map((c) => c.code)
    : [territory.commune.code];
  const codes = new Set(base);
  for (const code of base) {
    if (!/^(75056|69123|13055)$/.test(code)) continue;
    try {
      const arr = await _json(`${GEO_API}/communes?codeParent=${code}&type=arrondissement-municipal&fields=code`);
      for (const a of arr) if (a.code) codes.add(a.code);
    } catch { /* sans arrondissements, la commune seule */ }
  }
  return [...codes];
}

/**
 * Nom d'un lieu depuis une position (Base adresse nationale) : « Rue
 * Garibaldi, Lyon 3e ». Chaîne vide si le service ne répond pas.
 */
export async function reverseGeocode(lng, lat, { precise = false } = {}) {
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lng}&lat=${lat}${precise ? '' : '&type=street'}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return '';
    const data = await res.json();
    const p = data?.features?.[0]?.properties;
    if (!p) return '';
    return [p.name || p.street, p.city].filter(Boolean).join(', ');
  } catch { return ''; }
}
