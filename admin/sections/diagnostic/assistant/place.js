/**
 * Diagnostic terrain - assistant « Demander » : retrouver un lieu.
 * Services publics appelés depuis le navigateur, comme le reste du catalogue :
 * Base Adresse Nationale (adresses et rues), découpage administratif
 * (communes), annuaire des entreprises (siège de l'intercommunalité),
 * Nominatim et Overpass d'OpenStreetMap (lieux nommés, tracé des rues,
 * grands axes). Seuls les résultats du territoire de l'espace sont retenus.
 */

import { resolveTerritory } from '../sources/territory.js';
import { mergeAxes } from './zone.mjs';

const BAN = 'https://api-adresse.data.gouv.fr/search/';
const GEO_API = 'https://geo.api.gouv.fr';
const ENTREPRISES = 'https://recherche-entreprises.api.gouv.fr/search';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/** Erreur de recherche de lieu, dont le message s'affiche tel quel. */
export class PlaceError extends Error {}

async function _json(url, label, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(15000) });
  } catch (e) {
    if (e?.name === 'AbortError' && init.signal?.aborted) throw e;
    throw new PlaceError(`${label} ne répond pas pour le moment. Réessayez dans quelques minutes.`);
  }
  if (!res.ok) throw new PlaceError(`${label} ne répond pas pour le moment (erreur ${res.status}). Réessayez dans quelques minutes.`);
  return res.json();
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Codes INSEE et centre du territoire de l'espace. */
async function territoryScope(branding) {
  const territory = await resolveTerritory();
  const codes = new Set([territory.commune.code, ...(territory.epci?.communes || []).map((c) => c.code)]);
  const center = [parseFloat(branding?.center_lng), parseFloat(branding?.center_lat)];
  return { territory, codes, center };
}

/** Commune du territoire dont le nom correspond, s'il y en a une. */
function communeOf(scope, name) {
  const n = norm(name);
  if (!n) return null;
  const all = [scope.territory.commune, ...(scope.territory.epci?.communes || [])];
  return all.find((c) => norm(c.nom) === n) || all.find((c) => norm(c.nom).startsWith(n)) || null;
}

async function searchBan(text, type, scope, commune, signal) {
  const params = new URLSearchParams({ q: text, limit: '10', type });
  if (commune) params.set('citycode', commune.code);
  else if (isFinite(scope.center[0])) { params.set('lon', scope.center[0]); params.set('lat', scope.center[1]); }
  const data = await _json(`${BAN}?${params}`, 'La Base Adresse Nationale', { signal });
  return (data.features || []).filter((f) => scope.codes.has(f.properties?.citycode) && f.properties.score >= 0.45);
}

/** Tracé d'une rue dans OpenStreetMap, autour de son point dans la Base Adresse. */
async function streetLine(name, point, signal) {
  const safe = name.replace(/[\\"]/g, '').replace(/[.*+?^${}()|[\]]/g, '\\$&');
  const query = `[out:json][timeout:20];way["highway"]["name"~"^${safe}$",i](around:1500,${point[1]},${point[0]});out geom;`;
  try {
    const data = await overpass(query, signal);
    const lines = (data.elements || []).filter((e) => Array.isArray(e.geometry)).map((e) => e.geometry.map((g) => [g.lon, g.lat]));
    return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return null;
  }
}

async function overpass(query, signal) {
  let last = null;
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`, signal: signal || AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw new PlaceError(`OpenStreetMap ne répond pas pour le moment (${last?.message || 'délai dépassé'}). Réessayez dans quelques minutes.`);
}

/** Lieu nommé (gare, parc, place, école, lac…) dans OpenStreetMap. */
async function searchNamed(text, scope, commune, signal) {
  const [x, y] = scope.center;
  const params = new URLSearchParams({ q: commune ? `${text}, ${commune.nom}` : text, format: 'geojson', polygon_geojson: '1', addressdetails: '1', limit: '8', countrycodes: 'fr', 'accept-language': 'fr' });
  if (isFinite(x)) { params.set('viewbox', `${x - 0.5},${y + 0.35},${x + 0.5},${y - 0.35}`); params.set('bounded', '1'); }
  const data = await _json(`${NOMINATIM}?${params}`, 'OpenStreetMap', { signal });
  const names = new Set([...(scope.territory.epci?.communes || []), scope.territory.commune].map((c) => norm(c.nom)));
  return (data.features || []).filter((f) => {
    const a = f.properties?.address || {};
    const city = a.city || a.town || a.village || a.municipality || '';
    return !city || names.has(norm(city));
  });
}

async function searchCommune(text, scope, signal) {
  const local = communeOf(scope, text);
  const code = local?.code;
  const url = code
    ? `${GEO_API}/communes/${code}?fields=nom,code,contour&format=geojson&geometry=contour`
    : `${GEO_API}/communes?nom=${encodeURIComponent(text)}&fields=nom,code,contour&format=geojson&geometry=contour&boost=population&limit=5`;
  const data = await _json(url, 'Le service du découpage administratif', { signal });
  const list = data.type === 'Feature' ? [data] : (data.features || []);
  return list.filter((f) => scope.codes.has(f.properties?.code));
}

/** Siège de l'intercommunalité : l'annuaire des entreprises, par son numéro SIREN. */
async function searchSeat(scope, signal) {
  const epci = scope.territory.epci;
  if (!epci?.code) return null;
  const data = await _json(`${ENTREPRISES}?q=${encodeURIComponent(epci.code)}&per_page=1`, 'L\'annuaire des entreprises', { signal });
  const s = data.results?.[0]?.siege;
  const lat = parseFloat(s?.latitude), lng = parseFloat(s?.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { label: `Siège de ${epci.nom}`, adresse: s.adresse || '', geometry: { type: 'Point', coordinates: [lng, lat] } };
}

/**
 * Résout le lieu demandé.
 * @param {{texte, type, commune}} lieu - lecture de la demande
 * @returns {Promise<{label, adresse, type, geometry}|null>} null pour tout le territoire
 */
export async function resolvePlace(lieu, branding, { signal } = {}) {
  const type = lieu?.type || 'aucun';
  if (type === 'territoire' || type === 'aucun') return null;
  const scope = await territoryScope(branding);
  const commune = communeOf(scope, lieu.commune);
  const text = String(lieu.texte || '').trim();
  const notFound = () => new PlaceError(`Je n'ai pas trouvé « ${text} » sur le territoire de ${scope.territory.epci?.nom || scope.territory.commune.nom}. Précisez la commune ou le nom exact.`);

  if (type === 'siege') {
    const seat = await searchSeat(scope, signal);
    if (seat) return { ...seat, type };
    throw new PlaceError('Je n\'ai pas trouvé l\'adresse du siège de l\'intercommunalité. Donnez son adresse, par exemple « 30 avenue Général Leclerc à Vienne ».');
  }
  if (type === 'commune') {
    const [c] = await searchCommune(text || lieu.commune, scope, signal);
    if (!c) throw notFound();
    return { label: c.properties.nom, adresse: '', type, geometry: c.geometry };
  }
  if (type === 'adresse' || type === 'rue') {
    const hits = await searchBan(text, type === 'adresse' ? 'housenumber' : 'street', scope, commune, signal);
    const best = hits[0] || (type === 'adresse' ? (await searchBan(text, 'street', scope, commune, signal))[0] : null);
    if (best) {
      const p = best.properties;
      if (type === 'rue' || p.type === 'street') {
        const line = await streetLine(p.name || p.street, best.geometry.coordinates, signal);
        return { label: `${p.name}, ${p.city}`, adresse: p.label, type: 'rue', geometry: line || best.geometry };
      }
      return { label: p.label, adresse: p.label, type, geometry: best.geometry };
    }
  }
  const [named] = await searchNamed(text, scope, commune, signal);
  if (named) {
    const p = named.properties || {};
    const name = p.name || String(p.display_name || '').split(',')[0];
    const city = p.address?.city || p.address?.town || p.address?.village || '';
    return { label: city && !norm(name).includes(norm(city)) ? `${name}, ${city}` : name, adresse: p.display_name || '', type: 'lieu', geometry: named.geometry };
  }
  throw notFound();
}

/** Grands axes (routes principales nommées) autour du lieu, depuis OpenStreetMap. */
export async function fetchAxes(place, radius, { signal } = {}) {
  if (!place) return [];
  let around;
  if (place.type === 'Point') {
    const [x, y] = place.coordinates;
    around = `(around:${Math.round(radius)},${y},${x})`;
  } else {
    const b = placeBox(place);
    if (!b) return [];
    const dy = radius / 111320, dx = radius / (111320 * Math.cos((b[1] + b[3]) * Math.PI / 360));
    around = `(${b[1] - dy},${b[0] - dx},${b[3] + dy},${b[2] + dx})`;
  }
  const rank = { trunk: 1, primary: 2, secondary: 3, tertiary: 4 };
  const data = await overpass(`[out:json][timeout:25];way["highway"~"^(trunk|primary|secondary|tertiary)$"]["name"]${around};out tags geom;`, signal);
  return mergeAxes((data.elements || []).filter((e) => Array.isArray(e.geometry)).map((e) => ({
    name: e.tags?.name, rank: rank[e.tags?.highway] ?? 9, coordinates: e.geometry.map((g) => [g.lon, g.lat]),
  })));
}

function placeBox(geometry) {
  if (!geometry) return null;
  let b = null;
  const walk = (c) => {
    if (typeof c?.[0] === 'number') { b = b ? [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])] : [c[0], c[1], c[0], c[1]]; return; }
    if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);
  return b;
}
