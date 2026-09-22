/** Géométrie du dossier : le périmètre tracé, pas l'emprise de ses observations. */
const RAD = Math.PI / 180;
const EARTH = 6371008.8;
const EPS = 1e-12;

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function polygonAreaKm2(polygon) {
  const area = (ring) => {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      let delta = (b[0] - a[0]) * RAD;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      sum += delta * (2 + Math.sin(a[1] * RAD) + Math.sin(b[1] * RAD));
    }
    return Math.abs(sum * EARTH * EARTH / 2) / 1e6;
  };
  const polys = polygon?.type === 'MultiPolygon' ? polygon.coordinates : [polygon?.coordinates || []];
  return polys.reduce((total, rings) => total + Math.max(0, (rings[0] ? area(rings[0]) : 0) - rings.slice(1).reduce((s, r) => s + area(r), 0)), 0);
}

/** Les points sur la frontière appartiennent au périmètre. */
export function insideRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const ab = sub(b, a), ap = sub(p, a);
    if (Math.abs(cross(ab, ap)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function cuts(a, b, ring) {
  const r = sub(b, a), values = [0, 1];
  for (let i = 0; i < ring.length; i++) {
    const c = ring[i], d = ring[(i + 1) % ring.length], s = sub(d, c), q = sub(c, a);
    const denominator = cross(r, s);
    if (Math.abs(denominator) < EPS) {
      // Une frontière colinéaire peut ne couvrir qu'une partie du segment.
      if (Math.abs(cross(q, r)) < EPS) {
        const axis = Math.abs(r[0]) > Math.abs(r[1]) ? 0 : 1;
        if (Math.abs(r[axis]) > EPS) for (const p of [c, d]) { const t = (p[axis] - a[axis]) / r[axis]; if (t > 0 && t < 1) values.push(t); }
      }
      continue;
    }
    const t = cross(q, s) / denominator, u = cross(q, r) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) values.push(t);
  }
  return [...new Set(values)].sort((x, y) => x - y);
}

/** Découpe les lignes, y compris celles qui traversent la zone sans sommet intérieur. */
export function clipLines(geometry, ring) {
  const lines = geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : [];
  const out = [];
  for (const line of lines) {
    let current = null;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], ts = cuts(a, b, ring);
      for (let j = 1; j < ts.length; j++) {
        if (ts[j] - ts[j - 1] < EPS || !insideRing(at(a, b, (ts[j] + ts[j - 1]) / 2), ring)) { current = null; continue; }
        const start = at(a, b, ts[j - 1]), end = at(a, b, ts[j]);
        if (current && Math.hypot(current.at(-1)[0] - start[0], current.at(-1)[1] - start[1]) < EPS) current.push(end);
        else { current = [start, end]; out.push(current); }
      }
    }
  }
  if (!out.length) return null;
  return out.length === 1 ? { type: 'LineString', coordinates: out[0] } : { type: 'MultiLineString', coordinates: out };
}

/** Les polygones sont retenus par intersection ; leur surface n'est pas totalisée. */
export function intersectsRing(geometry, ring) {
  if (!geometry) return false;
  if (geometry.type === 'Point') return insideRing(geometry.coordinates, ring);
  if (geometry.type === 'MultiPoint') return geometry.coordinates.some((p) => insideRing(p, ring));
  if (/LineString/.test(geometry.type)) return Boolean(clipLines(geometry, ring));
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.some((rings) => rings.some((r) => Boolean(clipLines({ type: 'LineString', coordinates: r }, ring))) || ring.some((p) => insideRing(p, rings[0]) && !rings.slice(1).some((hole) => insideRing(p, hole))));
}

/** Distance locale point / segment ; les sommets seuls ne suffisent pas. */
export function distanceToGeometryM(point, geometry) {
  const scaleX = RAD * EARTH * Math.cos(point[1] * RAD), scaleY = RAD * EARTH;
  const local = (p) => [(p[0] - point[0]) * scaleX, (p[1] - point[1]) * scaleY];
  const segment = (a, b) => {
    const x = local(a), y = local(b), v = sub(y, x);
    const t = Math.max(0, Math.min(1, -(x[0] * v[0] + x[1] * v[1]) / (v[0] ** 2 + v[1] ** 2 || 1)));
    return Math.hypot(x[0] + t * v[0], x[1] + t * v[1]);
  };
  if (geometry?.type === 'Point') return Math.hypot(...local(geometry.coordinates));
  let best = Infinity;
  const walk = (coords) => {
    if (!Array.isArray(coords) || !coords.length) return;
    if (typeof coords[0]?.[0] === 'number') for (let i = 1; i < coords.length; i++) best = Math.min(best, segment(coords[i - 1], coords[i]));
    else for (const child of coords) walk(child);
  };
  walk(geometry?.coordinates);
  return best;
}
