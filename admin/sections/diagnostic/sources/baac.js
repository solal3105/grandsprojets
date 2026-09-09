/**
 * Diagnostic terrain - accidents corporels de la circulation (fichier BAAC).
 * Le fichier national annuel de l'Observatoire de la sécurité routière est
 * publié sur data.gouv.fr en trois tables : caractéristiques (lieu, date),
 * usagers (gravité), véhicules (catégories). On les lit en flux depuis le
 * navigateur (le site autorise les appels croisés), on ne garde que les
 * accidents des communes du territoire, et on rattache victimes et véhicules
 * à chaque accident. Format en vigueur depuis 2019.
 */

import { streamCsvFromStream, toNumber } from '../data.js';

const DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/bases-de-donnees-annuelles-des-accidents-corporels-de-la-circulation-routiere-annees-de-2005-a-2024/';
const FIRST_YEAR = 2019; // premier millésime au format actuel (coordonnées par accident)

// Décodage des codes officiels du fichier (notice BAAC).
const GRAVITE = { 2: 'Tué', 3: 'Blessé hospitalisé', 4: 'Blessé léger', 1: 'Indemne' };
const GRAVITE_RANG = { 2: 3, 3: 2, 4: 1, 1: 0 };
const LUMIERE = { 1: 'Plein jour', 2: 'Crépuscule ou aube', 3: 'Nuit sans éclairage', 4: 'Nuit, éclairage non allumé', 5: 'Nuit avec éclairage' };
const INTERSECTION = { 1: 'Hors intersection', 2: 'Intersection en X', 3: 'Intersection en T', 4: 'Intersection en Y', 5: 'Plus de 4 branches', 6: 'Giratoire', 7: 'Place', 8: 'Passage à niveau', 9: 'Autre intersection' };
const METEO = { 1: 'Normale', 2: 'Pluie légère', 3: 'Pluie forte', 4: 'Neige ou grêle', 5: 'Brouillard ou fumée', 6: 'Vent fort ou tempête', 7: 'Temps éblouissant', 8: 'Temps couvert', 9: 'Autre' };
const CATEGORIES = [
  ['velo', new Set(['1', '80'])],
  ['trottinette', new Set(['50', '60'])],
  ['deux_roues_motorise', new Set(['2', '30', '31', '32', '33', '34', '41', '42', '43'])],
  ['voiture', new Set(['7', '10'])],
  ['poids_lourd', new Set(['13', '14', '15', '16', '17'])],
  ['transport_en_commun', new Set(['37', '38', '39', '40'])],
];
export const GRAVITE_COLORS = { 'Tué': '#7F1D1D', 'Blessé hospitalisé': '#DC2626', 'Blessé léger': '#F59E0B', 'Indemne': '#9CA3AF' };

let _resources = null;

/**
 * Fichiers disponibles par année, depuis le catalogue data.gouv.
 * @returns {Promise<Map<number, {caract: string, usagers: string, vehicules: string}>>}
 */
export async function listBaacYears() {
  if (_resources) return _resources;
  const res = await fetch(DATASET_API, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`data.gouv.fr indisponible (HTTP ${res.status})`);
  const data = await res.json();
  const years = new Map();
  for (const r of data.resources || []) {
    const m = String(r.title || '').match(/^(caract(?:eristiques)?|usagers|vehicules)[-_](\d{4})\.csv$/i);
    if (!m) continue;
    const year = Number(m[2]);
    if (year < FIRST_YEAR) continue;
    const key = m[1].toLowerCase().startsWith('caract') ? 'caract' : m[1].toLowerCase();
    if (!years.has(year)) years.set(year, {});
    years.get(year)[key] = r.url;
  }
  for (const [year, files] of years) if (!files.caract || !files.usagers || !files.vehicules) years.delete(year);
  _resources = years;
  return years;
}

const _cell = (cells, headers, name) => {
  const i = headers.indexOf(name);
  return i >= 0 ? String(cells[i] ?? '').trim() : '';
};
const _coord = (s) => toNumber(String(s).replace(',', '.'));

async function _stream(url, onRow, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Fichier national indisponible (HTTP ${res.status})`);
  await streamCsvFromStream(res.body, onRow);
}

/**
 * Accidents d'une année sur les communes données, prêts en GeoJSON.
 * @param {number} year
 * @param {{caract, usagers, vehicules}} files
 * @param {string[]} communeCodes - codes INSEE
 * @param {(msg: string) => void} [onProgress]
 */
export async function fetchBaacYear(year, files, communeCodes, onProgress, signal) {
  const codes = new Set(communeCodes.map(String));
  const accidents = new Map();

  onProgress?.(`${year} : lecture des accidents…`);
  await _stream(files.caract, (cells, h) => {
    if (!codes.has(_cell(cells, h, 'com'))) return;
    const lat = _coord(_cell(cells, h, 'lat'));
    const lng = _coord(_cell(cells, h, 'long'));
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return;
    const jour = _cell(cells, h, 'jour').padStart(2, '0');
    const mois = _cell(cells, h, 'mois').padStart(2, '0');
    accidents.set(_cell(cells, h, 'Num_Acc'), {
      lat, lng,
      date: `${jour}/${mois}/${_cell(cells, h, 'an') || year}`,
      heure: _cell(cells, h, 'hrmn'),
      lumiere: LUMIERE[Number(_cell(cells, h, 'lum'))] || '',
      agglomeration: _cell(cells, h, 'agg') === '2' ? 'oui' : 'non',
      intersection: INTERSECTION[Number(_cell(cells, h, 'int'))] || '',
      meteo: METEO[Number(_cell(cells, h, 'atm'))] || '',
      adresse: _cell(cells, h, 'adr'),
      commune: _cell(cells, h, 'com'),
      usagers: 0, tues: 0, blesses_hospitalises: 0, blesses_legers: 0, pietons: 0, graviteRang: -1,
      velo: 'non', trottinette: 'non', deux_roues_motorise: 'non', voiture: 'non', poids_lourd: 'non', transport_en_commun: 'non',
    });
  }, signal);
  if (!accidents.size) return [];

  onProgress?.(`${year} : victimes (${accidents.size} accidents)…`);
  await _stream(files.usagers, (cells, h) => {
    const acc = accidents.get(_cell(cells, h, 'Num_Acc'));
    if (!acc) return;
    acc.usagers++;
    const grav = Number(_cell(cells, h, 'grav'));
    if (grav === 2) acc.tues++;
    else if (grav === 3) acc.blesses_hospitalises++;
    else if (grav === 4) acc.blesses_legers++;
    if (_cell(cells, h, 'catu') === '3') acc.pietons++;
    if ((GRAVITE_RANG[grav] ?? -1) > acc.graviteRang) acc.graviteRang = GRAVITE_RANG[grav];
  }, signal);

  onProgress?.(`${year} : véhicules impliqués…`);
  await _stream(files.vehicules, (cells, h) => {
    const acc = accidents.get(_cell(cells, h, 'Num_Acc'));
    if (!acc) return;
    const catv = String(Number(_cell(cells, h, 'catv')));
    for (const [key, set] of CATEGORIES) if (set.has(catv)) acc[key] = 'oui';
  }, signal);

  return [...accidents.entries()].map(([num, a]) => {
    const { lat, lng, graviteRang, ...rest } = a;
    const gravite = Object.entries(GRAVITE_RANG).find(([, r]) => r === graviteRang)?.[0];
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        numero: num,
        annee: year,
        gravite: GRAVITE[gravite] || 'Indemne',
        pieton: rest.pietons > 0 ? 'oui' : 'non',
        ...rest,
      },
    };
  });
}

/** Réglages de la couche d'accidents. */
export function baacLayerCfg(years, scopeLabel) {
  const span = years.length > 1 ? `${Math.min(...years)} à ${Math.max(...years)}` : String(years[0]);
  return {
    label: `Accidents corporels ${span} · ${scopeLabel}`,
    group_label: 'Sécurité',
    kind: 'reference',
    style: { mode: 'category', color: '#DC2626', category_field: 'gravite', cat_colors: { ...GRAVITE_COLORS }, radius: 5 },
    popup: { title_field: 'date', fields: ['gravite', 'usagers', 'velo', 'pieton', 'adresse', 'lumiere'] },
    metrics: [
      { field: 'tues', agg: 'sum' },
      { field: 'blesses_hospitalises', agg: 'sum' },
      { field: 'blesses_legers', agg: 'sum' },
      { field: 'usagers', agg: 'sum' },
    ],
    ai_context: `Accidents corporels de la circulation enregistrés par les forces de l'ordre (fichier national BAAC, ${span}), avec la gravité la plus élevée de l'accident, les victimes et les catégories d'usagers impliqués (vélo, piéton, deux-roues motorisé, voiture)`,
    default_on: true,
  };
}
