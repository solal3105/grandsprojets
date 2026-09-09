/**
 * Diagnostic terrain - aménagements cyclables depuis OpenStreetMap.
 * Interrogation directe d'Overpass depuis le navigateur (le service autorise
 * les appels croisés), bascule de miroir, zone = les communes du territoire
 * par leur code INSEE. Une couche de référence : chaque tronçon porte son
 * type d'aménagement, colorié par catégorie.
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const TYPE_LABELS = {
  cycleway: 'Piste cyclable',
  track: 'Piste cyclable',
  lane: 'Bande cyclable',
  opposite_lane: 'Bande cyclable à contresens',
  opposite_track: 'Piste cyclable à contresens',
  share_busway: 'Voie bus ouverte aux vélos',
  shared_lane: 'Chaussée partagée',
  path: 'Voie verte',
  living_street: 'Zone de rencontre',
};

/** Type d'aménagement lisible d'une voie OSM, ou '' si aucun. */
export function cyclewayType(tags = {}) {
  if (tags.highway === 'cycleway') return TYPE_LABELS.cycleway;
  if (tags.highway === 'path' && tags.bicycle === 'designated') return TYPE_LABELS.path;
  if (tags.highway === 'living_street') return TYPE_LABELS.living_street;
  for (const k of ['cycleway', 'cycleway:both', 'cycleway:left', 'cycleway:right']) {
    const v = tags[k];
    if (v && TYPE_LABELS[v]) return TYPE_LABELS[v];
  }
  return '';
}

function _query(inseeCodes, timeoutS) {
  const codes = inseeCodes.map((c) => String(c).replace(/[^0-9A-Z]/gi, '')).filter(Boolean);
  const area = `area["ref:INSEE"~"^(${codes.join('|')})$"]["boundary"="administrative"]->.z;`;
  return `[out:json][timeout:${timeoutS}];${area}(`
    + 'way["highway"="cycleway"](area.z);'
    + 'way["highway"="path"]["bicycle"="designated"](area.z);'
    + 'way["highway"="living_street"](area.z);'
    + 'way["cycleway"~"^(lane|track|opposite_lane|opposite_track|share_busway|shared_lane)$"](area.z);'
    + 'way["cycleway:both"~"^(lane|track|share_busway|shared_lane)$"](area.z);'
    + 'way["cycleway:left"~"^(lane|track|opposite_lane|opposite_track|share_busway|shared_lane)$"](area.z);'
    + 'way["cycleway:right"~"^(lane|track|opposite_lane|opposite_track|share_busway|shared_lane)$"](area.z);'
    + ');out geom;';
}

/** Voies OSM → FeatureCollection de lignes (type, nom, sens, revêtement). */
export function waysToGeoJSON(data) {
  const round = (n) => Math.round(n * 1e5) / 1e5;
  const features = [];
  for (const el of data?.elements || []) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const type = cyclewayType(el.tags || {});
    if (!type) continue;
    const t = el.tags || {};
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: el.geometry.map((p) => [round(p.lon), round(p.lat)]) },
      properties: {
        type,
        nom: t.name || '',
        sens_unique: t.oneway === 'yes' ? 'oui' : 'non',
        revetement: t.surface || '',
        osm_id: el.id,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Interroge Overpass pour les communes données, avec bascule de miroir. */
export async function fetchCycleways(inseeCodes, { timeoutMs = 90000, onProgress } = {}) {
  if (!inseeCodes?.length) throw new Error('Aucune commune pour délimiter la recherche.');
  const body = 'data=' + encodeURIComponent(_query(inseeCodes, Math.ceil(timeoutMs / 1000) - 5));
  let lastError = null;
  for (const endpoint of ENDPOINTS) {
    onProgress?.('Interrogation d\'OpenStreetMap…');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`OpenStreetMap a répondu ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.elements)) throw new Error('réponse OpenStreetMap inattendue');
      return waysToGeoJSON(data);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`OpenStreetMap est injoignable pour le moment (${lastError?.message || 'délai dépassé'}). Réessayez dans quelques minutes.`);
}

/** Réglages de la couche d'aménagements cyclables. */
export function cyclewaysLayerCfg(scopeLabel) {
  return {
    label: `Aménagements cyclables · ${scopeLabel}`,
    group_label: 'Mobilité',
    kind: 'reference',
    style: { mode: 'category', color: '#16A34A', category_field: 'type', radius: 3 },
    popup: { title_field: 'nom', fields: ['type', 'sens_unique', 'revetement'] },
    metrics: [],
    ai_context: 'Aménagements cyclables (pistes, bandes, voies vertes, zones de rencontre) tels que cartographiés dans OpenStreetMap, avec leur type',
    default_on: true,
  };
}
