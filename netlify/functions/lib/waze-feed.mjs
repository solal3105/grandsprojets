/**
 * Flux Waze for Cities → GeoJSON.
 * Le flux partenaire (GeoRSS JSON, rafraîchi toutes les deux minutes) porte
 * des alertes ponctuelles et des ralentissements en lignes. Fonctions pures,
 * partagées entre la fonction de relais et les tests.
 */

const ALERT_TYPES = {
  ACCIDENT: 'Accident',
  JAM: 'Embouteillage',
  WEATHERHAZARD: 'Danger sur la route',
  HAZARD: 'Danger sur la route',
  ROAD_CLOSED: 'Route fermée',
  POLICE: 'Police',
  CONSTRUCTION: 'Travaux',
};
const ALERT_SUBTYPES = {
  ACCIDENT_MINOR: 'Accident léger',
  ACCIDENT_MAJOR: 'Accident grave',
  JAM_MODERATE_TRAFFIC: 'Trafic ralenti',
  JAM_HEAVY_TRAFFIC: 'Trafic dense',
  JAM_STAND_STILL_TRAFFIC: 'Trafic à l\'arrêt',
  JAM_LIGHT_TRAFFIC: 'Trafic fluide',
  HAZARD_ON_ROAD: 'Obstacle sur la chaussée',
  HAZARD_ON_ROAD_POT_HOLE: 'Nid-de-poule',
  HAZARD_ON_ROAD_OBJECT: 'Objet sur la chaussée',
  HAZARD_ON_ROAD_ROAD_KILL: 'Animal renversé',
  HAZARD_ON_ROAD_CAR_STOPPED: 'Véhicule arrêté',
  HAZARD_ON_ROAD_CONSTRUCTION: 'Travaux',
  HAZARD_ON_ROAD_ICE: 'Verglas',
  HAZARD_ON_ROAD_LANE_CLOSED: 'Voie fermée',
  HAZARD_ON_ROAD_TRAFFIC_LIGHT_FAULT: 'Feu en panne',
  HAZARD_ON_SHOULDER: 'Danger sur le bas-côté',
  HAZARD_ON_SHOULDER_CAR_STOPPED: 'Véhicule arrêté sur le bas-côté',
  HAZARD_ON_SHOULDER_ANIMALS: 'Animaux sur le bas-côté',
  HAZARD_ON_SHOULDER_MISSING_SIGN: 'Panneau manquant',
  HAZARD_WEATHER: 'Météo',
  HAZARD_WEATHER_FOG: 'Brouillard',
  HAZARD_WEATHER_HAIL: 'Grêle',
  HAZARD_WEATHER_HEAVY_RAIN: 'Forte pluie',
  HAZARD_WEATHER_HEAVY_SNOW: 'Forte neige',
  HAZARD_WEATHER_FLOOD: 'Inondation',
  ROAD_CLOSED_HAZARD: 'Route fermée (danger)',
  ROAD_CLOSED_CONSTRUCTION: 'Route fermée (travaux)',
  ROAD_CLOSED_EVENT: 'Route fermée (événement)',
  POLICE_VISIBLE: 'Police visible',
  POLICE_HIDING: 'Police cachée',
};

const _iso = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : '');
const _num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Hôtes acceptés pour un flux partenaire. */
export function isAllowedFeedUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && /(^|\.)waze\.com$/.test(u.hostname) && /partnerhub-api|row-rtserver|rtserver/.test(u.pathname);
  } catch { return false; }
}

/** Alertes → points. */
export function alertsToGeoJSON(feed) {
  const features = [];
  for (const a of Array.isArray(feed?.alerts) ? feed.alerts : []) {
    const x = _num(a?.location?.x);
    const y = _num(a?.location?.y);
    if (x === null || y === null) continue;
    const type = String(a.type || '').toUpperCase();
    const sub = String(a.subtype || '').toUpperCase();
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x, y] },
      properties: {
        type: ALERT_TYPES[type] || type || 'Alerte',
        precision: ALERT_SUBTYPES[sub] || (sub ? sub.replace(/_/g, ' ').toLowerCase() : ''),
        rue: String(a.street || ''),
        commune: String(a.city || ''),
        description: String(a.reportDescription || ''),
        fiabilite: _num(a.reliability),
        confirmations: _num(a.nThumbsUp) || 0,
        signale_le: _iso(a.pubMillis),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Ralentissements → lignes. */
export function jamsToGeoJSON(feed) {
  const features = [];
  for (const j of Array.isArray(feed?.jams) ? feed.jams : []) {
    const line = (Array.isArray(j?.line) ? j.line : []).map((p) => [_num(p?.x), _num(p?.y)]).filter(([x, y]) => x !== null && y !== null);
    if (line.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: {
        rue: String(j.street || ''),
        commune: String(j.city || ''),
        vitesse_kmh: _num(j.speedKMH),
        retard_s: _num(j.delay),
        longueur_m: _num(j.length),
        niveau: _num(j.level),
        signale_le: _iso(j.pubMillis),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
