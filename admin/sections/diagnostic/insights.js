/**
 * Diagnostic terrain - lecture chiffrée d'une zone.
 * Tout ce que le rapport affiche de calculé vient d'ici, sans interface ni
 * appel réseau : indicateurs par source, part de la zone dans le territoire,
 * rang parmi des secteurs comparables, lieux qui cumulent les signaux,
 * points d'attention à règles écrites, constats. Le modèle de langage ne
 * touche à rien de tout cela.
 */

import { layerKind } from './state.js';
import { sourceOfLayer } from './sources.js';
import { distanceM, toNumber } from './data.js';

const _num = (v) => { const n = toNumber(v); return isFinite(n) ? n : 0; };
const _pct = (part, all) => (all > 0 ? Math.round((part / all) * 100) : 0);
/** Part en pourcentage lisible : « 12 % », « 0,5 % », « moins de 0,1 % ». */
export function shareText(part, all) {
  if (!all || !part) return '0 %';
  const v = (part / all) * 100;
  if (v >= 1) return `${Math.round(v)} %`;
  if (v >= 0.1) return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  return 'moins de 0,1 %';
}

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

/** Quantile p (0..1) d'une liste (0 si vide). */
export function quantile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

/**
 * Part de la zone dans le territoire pour une couche : entités retenues sur
 * total de la couche, et rang de densité parmi des secteurs comparables (le
 * territoire couvert par la couche découpé en cellules de la taille de la zone).
 * @returns {{inZone: number, total: number, share: number, percentile: number|null, cells: number}}
 */
export function benchmark(inZoneFeatures, allFeatures, zoneBbox) {
  const inZone = inZoneFeatures.length;
  const total = allFeatures.length;
  const out = { inZone, total, share: _pct(inZone, total), percentile: null, cells: 0 };
  if (!inZone || total < 20 || !zoneBbox) return out;
  // Cellules de la taille de la zone sur l'emprise de la couche
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of allFeatures) {
    const [x, y] = f.__pt;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = Math.max(zoneBbox[2] - zoneBbox[0], 0.002);
  const h = Math.max(zoneBbox[3] - zoneBbox[1], 0.002);
  const counts = new Map();
  for (const f of allFeatures) {
    const cx = Math.floor((f.__pt[0] - minX) / w);
    const cy = Math.floor((f.__pt[1] - minY) / h);
    const key = `${cx}:${cy}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const cells = [...counts.values()];
  if (cells.length < 5) return { ...out, cells: cells.length };
  const below = cells.filter((c) => c < inZone).length;
  return { ...out, percentile: Math.round((below / cells.length) * 100), cells: cells.length };
}

/** Phrase de comparaison : « 11 % des 533 accidents de la commune, parmi les 5 % de secteurs les plus denses ». */
export function benchmarkText(b, what, territoryLabel) {
  if (!b || !b.inZone || b.total < 10) return '';
  const parts = [`${shareText(b.inZone, b.total)} des ${b.total.toLocaleString('fr-FR')} ${what}${territoryLabel ? ` de ${territoryLabel}` : ''}`];
  if (b.percentile !== null && b.percentile >= 50) parts.push(`parmi les ${Math.max(1, 100 - b.percentile)} % de secteurs les plus denses`);
  return parts.join(', ');
}

/* ── Indicateurs par source ────────────────────────────────────── */

/** Regroupe des entités par couche, avec la config de la couche. */
function _byLayer(features, layers) {
  const map = new Map();
  for (const f of features) {
    if (!map.has(f.__layerId)) map.set(f.__layerId, []);
    map.get(f.__layerId).push(f);
  }
  return [...map.entries()].map(([id, feats]) => ({ layer: layers.find((l) => l.id === id), feats })).filter((x) => x.layer);
}

export function stravaInsights(feats) {
  if (!feats.length) return null;
  const totals = feats.map((f) => _num(f.properties.total_trip_count));
  const sum = (k) => feats.reduce((a, f) => a + _num(f.properties[k]), 0);
  const trips = sum('total_trip_count');
  const commute = sum('forward_commute_trip_count') + sum('reverse_commute_trip_count');
  const ebike = sum('ebike_ride_count');
  const speeds = feats.flatMap((f) => [_num(f.properties.forward_average_speed_meters_per_second), _num(f.properties.reverse_average_speed_meters_per_second)]).filter((v) => v > 0);
  const busiest = feats[totals.indexOf(Math.max(...totals))];
  return {
    segments: feats.length,
    busiestPerDay: Math.round(Math.max(...totals) / 365),
    busiest,
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
    // Sous cinq accidents, le rapport les liste au lieu de les statistiquer
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

export function countersInsights(feats, allFeats, zoneCenter) {
  if (feats.length) {
    const sorted = [...feats].sort((a, b) => _num(b.properties.moyenne_journaliere) - _num(a.properties.moyenne_journaliere));
    return {
      count: feats.length,
      perDay: feats.reduce((a, f) => a + _num(f.properties.moyenne_journaliere), 0),
      top: sorted.slice(0, 3).map((f) => ({ nom: f.properties.nom, perDay: _num(f.properties.moyenne_journaliere), hier: _num(f.properties.hier) })),
      nearest: null,
    };
  }
  if (!allFeats?.length || !zoneCenter) return null;
  let best = null;
  for (const f of allFeats) {
    const d = distanceM(f.__pt, zoneCenter);
    if (!best || d < best.d) best = { d, f };
  }
  return best ? { count: 0, perDay: 0, top: [], nearest: { nom: best.f.properties.nom, perDay: _num(best.f.properties.moyenne_journaliere), distanceM: Math.round(best.d) } } : null;
}

export function wazeInsights(alerts, jams) {
  if (!alerts.length && !jams.length) return null;
  const byType = new Map();
  for (const f of alerts) { const t = String(f.properties.type || 'Alerte'); byType.set(t, (byType.get(t) || 0) + 1); }
  const delays = jams.map((f) => _num(f.properties.retard_s)).filter((v) => v > 0);
  return {
    alerts: alerts.length,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
    jams: jams.length,
    meanDelayS: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0,
    jamKm: Math.round(jams.reduce((a, f) => a + _num(f.properties.longueur_m), 0) / 100) / 10,
  };
}

/* ── Lieux qui cumulent ────────────────────────────────────────── */

/**
 * Regroupe des points proches (rayon en mètres) en lieux, et classe les
 * lieux par ce qui s'y cumule : d'abord le nombre de sources distinctes,
 * puis le nombre de points. Chaque point porte __layerId et __pt.
 * @returns {Array<{center: number[], count: number, sources: Map<string, Array>, score: number}>}
 */
export function clusterPoints(points, radiusM = 40) {
  const clusters = [];
  for (const p of points) {
    if (!p.__pt || p.geometry?.type !== 'Point') continue;
    let best = null;
    for (const c of clusters) {
      const d = distanceM(c.center, p.__pt);
      if (d <= radiusM && (!best || d < best.d)) best = { c, d };
    }
    if (best) {
      const c = best.c;
      c.points.push(p);
      // centre = moyenne courante : le lieu glisse vers la masse des points
      c.center = [
        c.center[0] + (p.__pt[0] - c.center[0]) / c.points.length,
        c.center[1] + (p.__pt[1] - c.center[1]) / c.points.length,
      ];
    } else {
      clusters.push({ center: [...p.__pt], points: [p] });
    }
  }
  return clusters.map((c) => {
    const sources = new Map();
    for (const p of c.points) {
      if (!sources.has(p.__layerId)) sources.set(p.__layerId, []);
      sources.get(p.__layerId).push(p);
    }
    return { center: c.center, count: c.points.length, sources, score: sources.size * 10 + c.points.length };
  }).sort((a, b) => b.score - a.score);
}

/* ── Points d'attention à règles ───────────────────────────────── */

/** Plus courte distance d'un point à l'un des sommets d'une liste de géométries. */
function _nearestVertexM(pt, feats) {
  let best = Infinity;
  for (const f of feats) {
    const g = f.geometry;
    const walk = (coords) => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number') { const d = distanceM(pt, coords); if (d < best) best = d; return; }
      for (const c of coords) walk(c);
    };
    walk(g?.coordinates);
    if (best === 0) break;
  }
  return best;
}

/**
 * Règles écrites, chacune avec son critère chiffré :
 *  R1  un tronçon parmi les 10 % les plus fréquentés du territoire (Strava) sans aménagement cyclable à moins de 25 m
 *  R2  un accident corporel à moins de 40 m d'un point à améliorer du Baromètre
 *  R3  un lieu où convergent au moins trois sources différentes
 */
export function attentionPoints({ strava, stravaAll, cycleways, accidents, fubRed, hotspots }) {
  const out = [];
  if (strava?.length && stravaAll?.length) {
    const p95 = quantile(stravaAll.map((f) => _num(f.properties.total_trip_count)), 0.95);
    const busy = strava.filter((f) => _num(f.properties.total_trip_count) >= p95 && p95 > 0);
    const without = cycleways?.length
      ? busy.filter((f) => _nearestVertexM(f.__pt, cycleways) > 30)
      : busy;
    if (without.length) {
      out.push({
        rule: 'R1',
        title: `${without.length} tronçon${without.length > 1 ? 's' : ''} très emprunté${without.length > 1 ? 's' : ''} sans aménagement cyclable connu`,
        text: `Parmi les 5 % de tronçons les plus empruntés du territoire par les cyclistes Strava (au moins ${Math.round(p95 / 365).toLocaleString('fr-FR')} trajet${Math.round(p95 / 365) > 1 ? 's' : ''} par jour), ${without.length} n'${without.length > 1 ? 'ont' : 'a'} aucun aménagement cyclable à moins de 30 mètres dans OpenStreetMap${cycleways?.length ? ' : à vérifier sur place, une rue apaisée peut s\'en passer' : ' (aucune couche d\'aménagements chargée : à vérifier)'}.`,
        points: without.slice(0, 6).map((f) => ({ pt: f.__pt, perDay: Math.round(_num(f.properties.total_trip_count) / 365) })),
      });
    }
  }
  if (accidents?.length && fubRed?.length) {
    const both = accidents.filter((a) => _nearestVertexM(a.__pt, fubRed) <= 40);
    if (both.length) {
      out.push({
        rule: 'R2',
        title: `${both.length} accident${both.length > 1 ? 's' : ''} là où les cyclistes signalent un point à améliorer`,
        text: `${both.length} accident${both.length > 1 ? 's' : ''} corporel${both.length > 1 ? 's' : ''} ${both.length > 1 ? 'sont survenus' : 'est survenu'} à moins de 40 mètres d'un lieu que les cyclistes ont désigné comme prioritaire dans le Baromètre vélo.`,
        points: both.slice(0, 6).map((f) => ({ pt: f.__pt, label: `${f.properties.gravite || 'Accident'}, ${f.properties.date || ''}` })),
      });
    }
  }
  const dense = (hotspots || []).filter((h) => h.sources.size >= 3);
  if (dense.length) {
    out.push({
      rule: 'R3',
      title: `${dense.length} lieu${dense.length > 1 ? 'x' : ''} où convergent au moins trois sources`,
      text: `${dense.length} lieu${dense.length > 1 ? 'x' : ''} de la zone réuni${dense.length > 1 ? 'ssent' : 't'}, dans un rayon de 40 mètres, des signaux venus d'au moins trois sources différentes.`,
      points: dense.slice(0, 6).map((h) => ({ pt: h.center, label: `${h.count} signaux, ${h.sources.size} sources` })),
    });
  }
  return out;
}

/* ── Assemblage ────────────────────────────────────────────────── */

/**
 * Lecture complète d'une zone.
 * @param {Object} p
 * @param {{features, context, polygon, bbox, areaKm2}} p.selection
 * @param {Array} p.layers - dg.layers
 * @param {Map} p.runtime - dg.runtime (toutes les entités par couche, pour comparer)
 * @param {string} [p.territoryLabel] - « Lyon », « Grenoble-Alpes-Métropole »
 */
export function buildInsights({ selection, layers, runtime, territoryLabel = '' }) {
  const all = [...(selection.features || []), ...(selection.context || [])];
  const groups = _byLayer(all, layers);
  const bySource = (id) => groups.filter((g) => sourceOfLayer(g.layer)?.id === id);
  const feats = (id) => bySource(id).flatMap((g) => g.feats);
  const allOf = (id) => layers.filter((l) => sourceOfLayer(l)?.id === id).flatMap((l) => runtime.get(l.id)?.features || []);
  const zoneCenter = selection.bbox ? [(selection.bbox[0] + selection.bbox[2]) / 2, (selection.bbox[1] + selection.bbox[3]) / 2] : null;

  const wazeAlerts = bySource('waze').filter((g) => !/part=jams/.test(String(g.layer.source_ref))).flatMap((g) => g.feats);
  const wazeJams = bySource('waze').filter((g) => /part=jams/.test(String(g.layer.source_ref))).flatMap((g) => g.feats);
  const fubGroups = bySource('fub');
  const fubRed = fubGroups.filter((g) => /améliorer/i.test(g.layer.label)).flatMap((g) => g.feats);
  const fubGreen = fubGroups.filter((g) => /constat/i.test(g.layer.label)).flatMap((g) => g.feats);
  const fubParking = fubGroups.filter((g) => /stationnement/i.test(g.layer.label)).flatMap((g) => g.feats);

  const themes = {
    usage: {
      strava: stravaInsights(feats('strava')),
      counters: countersInsights(feats('comptages'), allOf('comptages'), zoneCenter),
    },
    securite: {
      accidents: accidentsInsights(feats('accidents')),
      waze: wazeInsights(wazeAlerts, wazeJams),
    },
    equipement: {
      cycleways: cyclewaysInsights(feats('osm-cycleways')),
    },
    paroles: {
      fub: fubGroups.length ? { red: fubRed.length, green: fubGreen.length, parking: fubParking.length, withText: [...fubRed, ...fubGreen, ...fubParking].filter((f) => String(f.properties.description || '').trim().length > 12).length } : null,
      participer: feats('participer').length,
      contributions: feats('contributions').length,
      travaux: feats('travaux').length,
    },
  };

  // Comparaisons au territoire, par couche
  const benchmarks = groups.map((g) => ({
    layerId: g.layer.id,
    label: g.layer.label,
    source: sourceOfLayer(g.layer)?.id || null,
    color: g.layer.style?.color || '#64748B',
    kind: layerKind(g.layer),
    ...benchmark(g.feats, runtime.get(g.layer.id)?.features || [], selection.bbox),
  }));

  // Lieux qui cumulent : points des témoignages, accidents, Baromètre, alertes
  const pointFeats = all.filter((f) => f.geometry?.type === 'Point' && ['participer', 'contributions', 'fub', 'accidents', 'waze', null].includes(sourceOfLayer(layers.find((l) => l.id === f.__layerId))?.id ?? null));
  const hotspots = clusterPoints(pointFeats, 40).filter((h) => h.count >= 3).slice(0, 5).map((h, i) => ({
    n: i + 1,
    center: h.center,
    count: h.count,
    score: h.score,
    sources: [...h.sources.entries()].map(([id, pts]) => {
      const layer = layers.find((l) => l.id === id);
      return { layerId: id, label: layer?.label || '', color: layer?.style?.color || '#64748B', count: pts.length, kind: layer ? layerKind(layer) : 'temoignages' };
    }),
    quotes: [...h.sources.values()].flat()
      .map((f) => ({ text: String(f.properties.description || f.properties.motif || '').trim(), layerId: f.__layerId }))
      .filter((q) => q.text.length > 12).slice(0, 3),
  }));

  const attention = attentionPoints({
    strava: feats('strava'), stravaAll: allOf('strava'), cycleways: feats('osm-cycleways'),
    accidents: feats('accidents'), fubRed, hotspots: clusterPoints(pointFeats, 40),
  });

  return {
    areaKm2: selection.areaKm2,
    counts: { temoignages: (selection.features || []).length, reference: (selection.context || []).length, layers: groups.length },
    themes,
    benchmarks,
    hotspots,
    attention,
    kpis: buildKpis(themes, benchmarks, territoryLabel),
    constats: buildConstats(themes, benchmarks, hotspots, attention, selection.areaKm2, territoryLabel),
  };
}

/** Six chiffres au plus pour la première page, chacun avec sa comparaison. */
export function buildKpis(themes, benchmarks, territoryLabel) {
  const bench = (source) => benchmarks.find((b) => b.source === source);
  const kpis = [];
  const s = themes.usage.strava;
  const k0 = themes.usage.counters;
  const counterRef = k0?.count ? k0.top[0] : (k0?.nearest && k0.nearest.distanceM <= 800 ? k0.nearest : null);
  if (s) kpis.push({ key: 'flux', value: s.busiestPerDay, unit: 'trajets Strava / jour', label: 'sur l\'axe le plus emprunté', sub: counterRef ? `échantillon : le compteur ${counterRef.nom} en mesure ${counterRef.perDay.toLocaleString('fr-FR')}` : `${s.commuteShare} % de trajets pendulaires · échantillon Strava`, tone: 'usage' });
  const a = themes.securite.accidents;
  if (a) kpis.push({ key: 'accidents', value: a.count, unit: a.count > 1 ? 'accidents corporels' : 'accident corporel', label: `${a.tues + a.hospitalises} victime${a.tues + a.hospitalises > 1 ? 's' : ''} grave${a.tues + a.hospitalises > 1 ? 's' : ''}`, sub: benchmarkText(bench('accidents'), 'accidents', territoryLabel), tone: 'securite' });
  const f = themes.paroles.fub;
  if (f) kpis.push({ key: 'fub', value: f.red, unit: f.red > 1 ? 'points à améliorer' : 'point à améliorer', label: `signalés par les cyclistes${f.green ? `, ${f.green} amélioration${f.green > 1 ? 's' : ''} constatée${f.green > 1 ? 's' : ''}` : ''}`, sub: benchmarkText(benchmarks.find((b) => b.source === 'fub' && /améliorer/i.test(b.label)), 'points à améliorer', territoryLabel), tone: 'paroles' });
  if (themes.paroles.participer) kpis.push({ key: 'participer', value: themes.paroles.participer, unit: themes.paroles.participer > 1 ? 'signalements d\'habitants' : 'signalement d\'habitant', label: 'depuis votre carte', sub: benchmarkText(bench('participer'), 'signalements', territoryLabel), tone: 'paroles' });
  const c = themes.equipement.cycleways;
  if (c) kpis.push({ key: 'cycleways', value: c.km, unit: 'km d\'aménagements cyclables', label: c.byType[0] ? `surtout ${c.byType[0].type.toLowerCase()}` : '', sub: benchmarkText(bench('osm-cycleways'), 'tronçons aménagés', territoryLabel), tone: 'equipement' });
  const k = themes.usage.counters;
  if (k?.count) kpis.push({ key: 'counters', value: k.perDay, unit: 'passages / jour', label: `sur ${k.count} compteur${k.count > 1 ? 's' : ''}`, sub: k.top[0] ? `le plus fréquenté : ${k.top[0].nom}` : '', tone: 'usage' });
  const w = themes.securite.waze;
  if (w && kpis.length < 6) kpis.push({ key: 'waze', value: w.alerts, unit: w.alerts > 1 ? 'alertes Waze' : 'alerte Waze', label: w.jams ? `${w.jams} ralentissement${w.jams > 1 ? 's' : ''}, ${Math.round(w.meanDelayS / 60)} min de retard moyen` : 'à l\'instant du diagnostic', sub: '', tone: 'securite' });
  return kpis.slice(0, 6);
}

/** Trois constats au plus, écrits à partir des chiffres, jamais du modèle. */
export function buildConstats(themes, benchmarks, hotspots, attention, areaKm2, territoryLabel) {
  const out = [];
  const strong = benchmarks.filter((b) => b.share >= 5 && b.inZone >= 3).sort((a, b) => b.share - a.share)[0];
  if (strong) out.push(`La zone, ${areaKm2.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km², concentre ${shareText(strong.inZone, strong.total)} des ${strong.label.toLowerCase().split(' · ')[0]} ${territoryLabel ? `de ${territoryLabel}` : 'du territoire'} (${strong.inZone} sur ${strong.total}).`);
  const s = themes.usage.strava;
  const k = themes.usage.counters;
  const ref = k?.count ? k.top[0] : (k?.nearest && k.nearest.distanceM <= 800 ? k.nearest : null);
  if (s) out.push(`Les cyclistes passent surtout par un axe : ${s.commuteShare} % de trajets pendulaires, ${s.speedKmh} km/h en moyenne d'après Strava${ref ? `, et ${ref.perDay.toLocaleString('fr-FR')} passages par jour au compteur ${ref.nom}` : ''}.`);
  const a = themes.securite.accidents;
  if (a && !out.some((t) => /accident/.test(t))) {
    const vuln = a.velo + a.pieton + a.trottinette;
    out.push(a.count >= 5
      ? `${a.count} accidents corporels, dont ${a.vulnerableShare} % impliquant un piéton, un vélo ou une trottinette${a.nightShare ? ` et ${a.nightShare} % de nuit` : ''}.`
      : `${a.count} accident${a.count > 1 ? 's' : ''} corporel${a.count > 1 ? 's' : ''}${vuln ? `, dont ${vuln} impliquant un piéton, un vélo ou une trottinette` : ''}, ${a.tues + a.hospitalises ? `${a.tues + a.hospitalises} victime${a.tues + a.hospitalises > 1 ? 's' : ''} grave${a.tues + a.hospitalises > 1 ? 's' : ''}` : 'sans victime grave'}.`);
  }
  if (attention[0] && out.length < 3) out.push(attention[0].text);
  if (hotspots[0] && out.length < 3) out.push(`Le lieu qui cumule le plus de signaux réunit ${hotspots[0].count} points venus de ${hotspots[0].sources.length} source${hotspots[0].sources.length > 1 ? 's' : ''}.`);
  return out.slice(0, 3);
}
