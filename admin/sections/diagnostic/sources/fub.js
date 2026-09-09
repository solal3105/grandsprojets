/**
 * Diagnostic terrain - Baromètre vélo de la FUB (côté navigateur).
 * La plateforme open data de la FUB publie, par commune et par
 * intercommunalité, les contributions cartographiques du Baromètre : points
 * à améliorer en priorité, améliorations constatées, souhaits de
 * stationnement. Le serveur (/api/sources/fub) fait la recherche et relaie
 * l'archive ; ici on la lit et on en fait des couches de témoignages.
 */

import { readZipEntries, toFeatureCollection } from '../data.js';
import { store } from '../../../store.js';

/** Les fichiers d'une archive du Baromètre qui deviennent des couches. */
export const FUB_LAYERS = [
  {
    key: 'points-rouges',
    file: /points-rouges|points-noirs|points_noirs/i,
    label: 'Points à améliorer en priorité',
    color: '#DC2626',
    ai_context: 'Lieux signalés par les cyclistes comme prioritaires à améliorer lors du Baromètre vélo de la FUB (enquête citoyenne nationale), avec leur commentaire',
  },
  {
    key: 'points-verts',
    file: /points-verts/i,
    label: 'Améliorations constatées',
    color: '#16A34A',
    ai_context: 'Lieux où les cyclistes constatent une amélioration récente, signalés lors du Baromètre vélo de la FUB, avec leur commentaire',
  },
  {
    key: 'stationnements',
    file: /^stationnements/i,
    label: 'Souhaits de stationnement vélo',
    color: '#2563EB',
    ai_context: 'Lieux où les cyclistes souhaitent du stationnement vélo, signalés lors du Baromètre vélo de la FUB, avec leur commentaire',
  },
];

async function _call(params) {
  const url = '/api/sources/fub?' + new URLSearchParams({ ville: store.city || '', ...params });
  const res = await fetch(url, {
    headers: store.session?.access_token ? { Authorization: `Bearer ${store.session.access_token}` } : {},
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Plateforme FUB indisponible (HTTP ${res.status})`);
  }
  return res;
}

/**
 * Jeux du Baromètre disponibles pour un territoire.
 * @returns {Promise<Array<{uid, id, year, scope, title}>>}
 */
export async function listFubDatasets({ communeCode, epciCode }) {
  const res = await _call({ mode: 'list', commune: communeCode || '', epci: epciCode || '' });
  const data = await res.json();
  return Array.isArray(data.datasets) ? data.datasets : [];
}

/** Télécharge un jeu et le convertit en couches prêtes à enregistrer. */
export async function fetchFubLayers(uid, onProgress) {
  onProgress?.('Téléchargement du jeu de données…');
  const res = await _call({ mode: 'download', uid });
  const zip = await res.arrayBuffer();
  onProgress?.('Lecture des contributions…');
  const files = await readZipEntries(zip);
  const out = [];
  for (const def of FUB_LAYERS) {
    const f = files.find((x) => def.file.test(x.name) && /\.geojson$/i.test(x.name));
    if (!f) continue;
    let fc = null;
    try { fc = toFeatureCollection(JSON.parse(await f.text())); } catch { fc = null; }
    if (!fc?.features?.length) continue;
    // Seul le commentaire intéresse la lecture ; les codes de rattachement
    // (commune, EPCI, département, région) sont retirés.
    fc.features = fc.features.map((ft) => ({
      type: 'Feature',
      geometry: ft.geometry,
      properties: { description: String(ft.properties?.description || '').trim() },
    }));
    out.push({ def, fc });
  }
  if (!out.length) throw new Error('L\'archive du Baromètre ne contient aucune contribution cartographique.');
  return out;
}

/** Réglages de la couche pour un fichier du Baromètre. */
export function fubLayerCfg(def, year, groupLabel) {
  return {
    label: `${def.label} · Baromètre vélo ${year}`,
    group_label: groupLabel,
    kind: 'temoignages',
    style: { mode: 'single', color: def.color, radius: 4 },
    popup: { title_field: '', fields: ['description'] },
    metrics: [],
    ai_context: def.ai_context,
    default_on: def.key === 'points-rouges',
  };
}
