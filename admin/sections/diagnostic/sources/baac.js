/**
 * Diagnostic terrain - accidents corporels de la circulation (fichier BAAC).
 * Le fichier national annuel de l'Observatoire de la sécurité routière est
 * publié sur data.gouv.fr en trois tables : caractéristiques (lieu, date),
 * usagers (gravité), véhicules (catégories). On les lit en flux depuis le
 * navigateur (le site autorise les appels croisés), on ne garde que les
 * accidents des communes du territoire, et on rattache victimes et véhicules
 * à chaque accident. Format en vigueur depuis 2019.
 *
 * Le catalogue data.gouv n'est pas régulier, relevé le 23 septembre 2026 :
 * les caractéristiques s'appellent « caracteristiques-2019.csv »,
 * « carcteristiques-2021.csv » et « carcteristiques-2022.csv » (faute
 * d'origine), « caract-2023.csv » puis « Caract_2024.csv », et le fichier des
 * caractéristiques de 2022 nomme l'identifiant « Accident_Id » au lieu de
 * « Num_Acc ». Les fichiers « vehicules-immatricules-baac-AAAA.csv » sont une
 * autre table, jamais confondue avec celle des véhicules.
 */

import { streamCsvFromStream, toNumber } from '../data.js';

const DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/bases-de-donnees-annuelles-des-accidents-corporels-de-la-circulation-routiere-annees-de-2005-a-2024/';
const FIRST_YEAR = 2019; // premier millésime au format actuel (coordonnées par accident)
// Titre d'une table annuelle : « caract », « caracteristiques », « carcteristiques », « usagers », « vehicules ».
const TABLE_TITLE = /^(car(?:a)?ct(?:eristiques)?|usagers|vehicules)[-_](\d{4})\.csv$/i;
// Noms de la colonne identifiant l'accident, selon les millésimes.
const ACCIDENT_KEYS = ['num_acc', 'accident_id'];

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
 * Tables annuelles complètes, depuis la liste des ressources du catalogue.
 * Une année n'est retenue que si ses trois tables sont publiées.
 * @param {Array<{title: string, url: string}>} resources
 * @returns {Map<number, {caract: string, usagers: string, vehicules: string}>}
 */
export function baacFilesByYear(resources) {
  const years = new Map();
  for (const r of Array.isArray(resources) ? resources : []) {
    const m = String(r?.title || '').trim().match(TABLE_TITLE);
    if (!m || !r.url) continue;
    const year = Number(m[2]);
    if (year < FIRST_YEAR) continue;
    const name = m[1].toLowerCase();
    const key = name.startsWith('car') ? 'caract' : name;
    if (!years.has(year)) years.set(year, {});
    // Le catalogue liste les dépôts les plus récents en premier : on garde le premier.
    if (!years.get(year)[key]) years.get(year)[key] = r.url;
  }
  for (const [year, files] of years) if (!files.caract || !files.usagers || !files.vehicules) years.delete(year);
  return years;
}

/**
 * Fichiers disponibles par année, depuis le catalogue data.gouv.
 * @returns {Promise<Map<number, {caract: string, usagers: string, vehicules: string}>>}
 */
export async function listBaacYears() {
  if (_resources) return _resources;
  let res;
  try {
    res = await fetch(DATASET_API, { signal: AbortSignal.timeout(20000) });
  } catch {
    throw new Error('Le site data.gouv.fr ne répond pas pour le moment. Réessayez dans quelques minutes.');
  }
  if (!res.ok) throw new Error(`Le site data.gouv.fr ne répond pas pour le moment (erreur ${res.status}). Réessayez dans quelques minutes.`);
  const data = await res.json();
  _resources = baacFilesByYear(data.resources);
  return _resources;
}

/** Années publiées, de la plus ancienne à la plus récente, écrites pour un titre : « 2024 », « 2023 et 2024 », « 2020 à 2024 », « 2019, 2020, 2023 et 2024 ». */
export function yearsLabel(years) {
  const list = [...new Set((years || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!list.length) return '';
  if (list.length === 1) return String(list[0]);
  if (list.length === 2) return `${list[0]} et ${list[1]}`;
  const consecutive = list.every((y, i) => i === 0 || y === list[i - 1] + 1);
  if (consecutive) return `${list[0]} à ${list[list.length - 1]}`;
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`;
}

const _WORDS = { 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq' };

/**
 * Périodes proposées à partir des années réellement publiées : la dernière,
 * les trois et les cinq dernières, puis toutes. Une année absente du
 * catalogue n'est jamais comptée ni annoncée.
 * @param {number[]} available
 * @returns {{periods: Array<{key: string, years: number[], label: string}>, defaultKey: string}}
 */
export function baacPeriods(available) {
  const years = [...new Set((available || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const periods = [];
  const add = (set, label) => {
    const key = set.join('-');
    if (!set.length || periods.some((p) => p.key === key)) return;
    periods.push({ key, years: set, label: `${label} (${yearsLabel(set)})` });
  };
  for (const n of [1, 3, 5]) {
    const set = years.slice(-n);
    const all = set.length === years.length && years.length > 1;
    add(set, all ? 'Toutes les années disponibles' : n === 1 ? 'Dernière année disponible' : `Les ${_WORDS[n]} dernières années disponibles`);
  }
  add(years, 'Toutes les années disponibles');
  const preferred = periods.find((p) => p.years.length === 5) || periods[periods.length - 1];
  return { periods, defaultKey: preferred?.key || '' };
}

const _coord = (s) => toNumber(String(s).replace(',', '.'));

/**
 * Lit une table en flux. `onRow(get)` reçoit un accès aux cellules par nom de
 * colonne (casse ignorée) ; l'identifiant de l'accident est lu sous ses deux
 * noms connus.
 */
async function _stream(url, year, onRow, signal) {
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new Error(`Le fichier national de ${year} ne répond pas pour le moment. Réessayez dans quelques minutes.`);
  }
  if (!res.ok || !res.body) throw new Error(`Le fichier national de ${year} ne répond pas pour le moment (erreur ${res.status}). Réessayez dans quelques minutes.`);
  let index = null;
  let keyAt = -1;
  await streamCsvFromStream(res.body, (cells, headers) => {
    if (!index) {
      index = new Map(headers.map((h, i) => [String(h).trim().toLowerCase(), i]));
      keyAt = ACCIDENT_KEYS.map((k) => index.get(k)).find((i) => i !== undefined) ?? -1;
      if (keyAt < 0) throw new Error(`Le fichier national de ${year} a changé de forme : nous n'y trouvons plus l'identifiant des accidents. Prévenez-nous pour que nous l'adaptions.`);
    }
    const get = (name) => {
      const i = name === 'id' ? keyAt : index.get(name);
      return i === undefined || i < 0 ? '' : String(cells[i] ?? '').trim();
    };
    onRow(get);
  });
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
  await _stream(files.caract, year, (get) => {
    if (!codes.has(get('com'))) return;
    const lat = _coord(get('lat'));
    const lng = _coord(get('long'));
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const jour = get('jour').padStart(2, '0');
    const mois = get('mois').padStart(2, '0');
    accidents.set(get('id'), {
      lat, lng,
      date: `${jour}/${mois}/${get('an') || year}`,
      heure: get('hrmn'),
      lumiere: LUMIERE[Number(get('lum'))] || '',
      agglomeration: get('agg') === '2' ? 'oui' : 'non',
      intersection: INTERSECTION[Number(get('int'))] || '',
      meteo: METEO[Number(get('atm'))] || '',
      adresse: get('adr'),
      commune: get('com'),
      usagers: 0, tues: 0, blesses_hospitalises: 0, blesses_legers: 0, pietons: 0, graviteRang: -1,
      velo: 'non', trottinette: 'non', deux_roues_motorise: 'non', voiture: 'non', poids_lourd: 'non', transport_en_commun: 'non',
    });
  }, signal);
  if (!accidents.size) return [];

  onProgress?.(`${year} : victimes (${accidents.size} accidents)…`);
  await _stream(files.usagers, year, (get) => {
    const acc = accidents.get(get('id'));
    if (!acc) return;
    acc.usagers++;
    const grav = Number(get('grav'));
    if (grav === 2) acc.tues++;
    else if (grav === 3) acc.blesses_hospitalises++;
    else if (grav === 4) acc.blesses_legers++;
    if (get('catu') === '3') acc.pietons++;
    if ((GRAVITE_RANG[grav] ?? -1) > acc.graviteRang) acc.graviteRang = GRAVITE_RANG[grav];
  }, signal);

  onProgress?.(`${year} : véhicules impliqués…`);
  await _stream(files.vehicules, year, (get) => {
    const acc = accidents.get(get('id'));
    if (!acc) return;
    const catv = String(Number(get('catv')));
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

/**
 * Réglages de la couche d'accidents.
 * @param {number[]} years - années réellement lues, citées telles quelles dans le nom et le contexte
 * @param {string} scopeLabel - commune ou intercommunalité
 */
export function baacLayerCfg(years, scopeLabel) {
  const span = yearsLabel(years);
  const several = new Set((years || []).map(Number)).size > 1;
  return {
    label: `Accidents corporels ${span} · ${scopeLabel}`,
    group_label: 'Sécurité',
    kind: 'reference',
    style: { mode: 'category', color: '#DC2626', category_field: 'gravite', cat_colors: { ...GRAVITE_COLORS }, radius: 5 },
    popup: { title_field: 'date', fields: ['gravite', 'usagers', 'velo', 'pieton', 'adresse', 'lumiere'] },
    metrics: [
      { field: 'tues', agg: 'sum', label: 'Personnes tuées', unit: 'personnes' },
      { field: 'blesses_hospitalises', agg: 'sum', label: 'Blessés hospitalisés', unit: 'personnes' },
      { field: 'blesses_legers', agg: 'sum', label: 'Blessés légers', unit: 'personnes' },
      { field: 'usagers', agg: 'sum', label: 'Usagers impliqués', unit: 'personnes' },
    ],
    ai_context: `Accidents corporels de la circulation enregistrés par les forces de l'ordre (fichier national BAAC, ${several ? 'années' : 'année'} ${span}), avec la gravité la plus élevée de l'accident, les victimes et les catégories d'usagers impliqués (vélo, piéton, deux-roues motorisé, voiture)`,
    default_on: true,
  };
}
