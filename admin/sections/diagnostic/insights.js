/**
 * Diagnostic terrain - lecture chiffrée d'une zone.
 * Les mesures que le dossier (dossier/model.js) tire des sources connues :
 * longueur des tronçons, flux Strava, accidents, aménagements cyclables. Sans
 * interface ni appel réseau ; le modèle de langage ne touche à rien de cela.
 */

import { distanceM, toNumber, maxOf } from './data.js';

const _num = (v) => { const n = toNumber(v); return isFinite(n) ? n : 0; };
const _pct = (part, all) => (all > 0 ? Math.round((part / all) * 100) : 0);

/** Longueur d'une géométrie en kilomètres (lignes et contours). */
export function lengthKm(geometry) {
  if (!geometry) return 0;
  const ringLen = (ring) => { let m = 0; for (let i = 1; i < ring.length; i++) m += distanceM(ring[i - 1], ring[i]); return m; };
  const g = geometry;
  let m = 0;
  if (g.type === 'LineString') m = ringLen(g.coordinates);
  else if (g.type === 'MultiLineString' || g.type === 'Polygon') for (const r of g.coordinates) m += ringLen(r);
  else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) for (const r of poly) m += ringLen(r);
  return m / 1000;
}

/** Médiane d'une liste de nombres (0 si vide). */
export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ── Indicateurs par source ────────────────────────────────────── */

export function stravaInsights(feats) {
  if (!feats.length) return null;
  const totals = feats.map((f) => _num(f.properties.total_trip_count));
  const sum = (k) => feats.reduce((a, f) => a + _num(f.properties[k]), 0);
  const trips = sum('total_trip_count');
  const commute = sum('forward_commute_trip_count') + sum('reverse_commute_trip_count');
  const ebike = sum('ebike_ride_count');
  const speeds = feats.flatMap((f) => [_num(f.properties.forward_average_speed_meters_per_second), _num(f.properties.reverse_average_speed_meters_per_second)]).filter((v) => v > 0);
  // Une grande zone peut retenir des dizaines de milliers de tronçons : jamais
  // Math.max(...totals), qui échoue au-delà d'environ 65 000 valeurs.
  const top = maxOf(totals);
  return {
    segments: feats.length,
    busiestPerDay: Math.round(top / 365),
    busiest: feats[totals.indexOf(top)],
    medianPerDay: Math.round(median(totals) / 365),
    commuteShare: _pct(commute, trips),
    ebikeShare: _pct(ebike, trips),
    speedKmh: speeds.length ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 3.6 * 10) / 10 : 0,
  };
}

export function accidentsInsights(feats) {
  if (!feats.length) return null;
  const sum = (k) => feats.reduce((a, f) => a + _num(f.properties[k]), 0);
  const yes = (k) => feats.filter((f) => String(f.properties[k]).toLowerCase() === 'oui').length;
  const byYear = new Map();
  for (const f of feats) { const y = _num(f.properties.annee); if (y) byYear.set(y, (byYear.get(y) || 0) + 1); }
  const night = feats.filter((f) => /nuit/i.test(String(f.properties.lumiere || ''))).length;
  const inter = feats.filter((f) => f.properties.intersection && !/hors/i.test(String(f.properties.intersection))).length;
  const severe = feats.filter((f) => /tué|hospitalisé/i.test(String(f.properties.gravite || ''))).length;
  return {
    count: feats.length,
    tues: sum('tues'), hospitalises: sum('blesses_hospitalises'), legers: sum('blesses_legers'),
    velo: yes('velo'), pieton: yes('pieton'), deuxRoues: yes('deux_roues_motorise'), trottinette: yes('trottinette'),
    vulnerableShare: _pct(feats.filter((f) => ['velo', 'pieton', 'trottinette'].some((k) => String(f.properties[k]).toLowerCase() === 'oui')).length, feats.length),
    nightShare: _pct(night, feats.length),
    intersectionShare: _pct(inter, feats.length),
    severeShare: _pct(severe, feats.length),
    byYear: [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count })),
    // Sous cinq accidents, le dossier les décrit un par un au lieu de les compter.
    cases: feats.length < 5 ? feats.map((f) => ({
      date: String(f.properties.date || ''), heure: String(f.properties.heure || ''), gravite: String(f.properties.gravite || ''),
      usagers: ['velo', 'pieton', 'trottinette', 'deux_roues_motorise', 'voiture', 'poids_lourd', 'transport_en_commun']
        .filter((k) => String(f.properties[k]).toLowerCase() === 'oui')
        .map((k) => ({ velo: 'vélo', pieton: 'piéton', trottinette: 'trottinette', deux_roues_motorise: 'deux-roues motorisé', voiture: 'voiture', poids_lourd: 'poids lourd', transport_en_commun: 'transport en commun' })[k]),
      adresse: String(f.properties.adresse || ''),
    })) : [],
  };
}

export function cyclewaysInsights(feats) {
  if (!feats.length) return null;
  const byType = new Map();
  let km = 0;
  for (const f of feats) {
    const l = lengthKm(f.geometry);
    km += l;
    const t = String(f.properties.type || 'Autre');
    byType.set(t, (byType.get(t) || 0) + l);
  }
  return {
    segments: feats.length,
    km: Math.round(km * 10) / 10,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, k]) => ({ type, km: Math.round(k * 10) / 10 })),
  };
}
