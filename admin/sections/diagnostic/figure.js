/**
 * Diagnostic terrain - figure cartographique du rapport.
 *
 * Rend un « plan de zone » sur une carte MapLibre éphémère, hors écran, puis
 * compose l'habillage au canvas 2D. La carte de l'utilisateur n'est jamais
 * déplacée : pas de sauvegarde/restauration de caméra ni de couches, donc
 * aucun état sale possible si la génération échoue.
 *
 * Le fond est dégrisé (saturation coupée, noirs remontés) pour rendre tout le
 * registre sombre aux données : c'est ce qui règle le « on ne voit plus rien »,
 * bien plus que de réduire le nombre de points.
 */

import { dg, safeColor } from './state.js';

// 16:10 : un tracé au lasso est grossièrement isotrope, la bande large du
// gabarit précédent écrasait la figure.
const FIG_W = 1120;
const FIG_H = 700;
const PIXEL_RATIO = 2;

const INK = 'rgba(17,24,39,0.62)';
const VEIL = 'rgba(255,255,255,0.58)';

/* ── Carte éphémère ─────────────────────────────────────────────── */

/**
 * Style dédié : uniquement le fond, dégrisé. Aucune couche de données ne peut
 * y entrer par effet de bord - ni heatmap, ni bâtiments 3D, ni survol.
 */
function _figureStyle() {
  return {
    version: 8,
    sources: {
      'fig-raster': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      // Plancher de panne : si les tuiles n'arrivent pas, la figure sort
      // dégradée mais lisible, jamais transparente.
      { id: 'fig-bg', type: 'background', paint: { 'background-color': '#eef1f4' } },
      {
        id: 'fig-raster-layer',
        type: 'raster',
        source: 'fig-raster',
        paint: {
          'raster-saturation': -0.9,
          'raster-brightness-min': 0.3,
          'raster-contrast': -0.1,
        },
      },
    ],
  };
}

/** Attend que la carte soit chargée ET ses tuiles posées, avec plafond dur. */
function _waitIdle(map, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);
    const check = () => {
      if (done) return;
      // areTilesLoaded : 'idle' peut survenir avant l'arrivée des tuiles réseau.
      if (map.loaded() && map.areTilesLoaded()) { clearTimeout(timer); finish(); return; }
      map.once('idle', check);
    };
    map.once('idle', check);
    if (map.loaded()) check();
  });
}

/* ── Habillage ──────────────────────────────────────────────────── */

/** Distance en mètres entre deux positions (formule haversine). */
function _distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Barre d'échelle : distance ronde (1, 2 ou 5 × 10ⁿ) mesurée sur la projection. */
function _drawScaleBar(ctx, map, w, h, k) {
  const y = h / k - 26;
  const probe = 200; // px écran servant d'étalon
  const left = map.unproject([0, map.getCanvas().clientHeight / 2]);
  const right = map.unproject([probe, map.getCanvas().clientHeight / 2]);
  const mPerPx = _distanceM(left, right) / probe;
  if (!isFinite(mPerPx) || mPerPx <= 0) return;

  const target = mPerPx * 150;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= target * 0.6) || pow;
  const px = nice / mPerPx;
  const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
  const x = 22;

  ctx.save();
  ctx.scale(k, k);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
  ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeText(label, x, y - 8);
  ctx.fillText(label, x, y - 8);
  ctx.restore();
}

/** Flèche de nord. */
function _drawNorth(ctx, w, k) {
  const x = w / k - 26;
  const y = 30;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -13); ctx.lineTo(5.5, 7); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 7);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fill();
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeText('N', 0, 20);
  ctx.fillText('N', 0, 20);
  ctx.restore();
}

/** Attribution - obligation de licence dès qu'on diffuse une image du fond. */
function _drawAttribution(ctx, w, h, k, text) {
  ctx.save();
  ctx.scale(k, k);
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  const x = w / k - 8;
  const y = h / k - 8;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillRect(x - tw - 6, y - 12, tw + 10, 16);
  ctx.fillStyle = 'rgba(17,24,39,0.75)';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ── Peinture des données ───────────────────────────────────────── */

/**
 * Voile blanc hors de la zone tracée. Un seul chemin en règle « evenodd »,
 * qui est exactement le test d'appartenance utilisé pour sélectionner les
 * points : la partie dévoilée est la sélection, au pixel près.
 */
function _drawVeil(ctx, map, ring, w, h, k) {
  if (!ring?.length) return;
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, w / k, h / k);
  const first = map.project(ring[0]);
  ctx.moveTo(first.x, first.y);
  for (const c of ring.slice(1)) {
    const p = map.project(c);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = VEIL;
  ctx.fill('evenodd');
  // Périmètre tracé plein : un trait continu dit une géométrie exacte, là où
  // des tirets suggèrent une limite approximative.
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** Marques ponctuelles : disque opaque à la couleur de la couche, liseré blanc. */
function _drawPoints(ctx, map, features, w, h, k, { radius = 4.4, context = false } = {}) {
  ctx.save();
  ctx.scale(k, k);
  for (const f of features) {
    if (!f.__pt) continue;
    const p = map.project(f.__pt);
    if (p.x < -20 || p.y < -20 || p.x > w / k + 20 || p.y > h / k + 20) continue;
    const layer = dg.layers.find((l) => l.id === f.__layerId);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    // Opaque, jamais translucide : des disques empilés fabriqueraient des
    // zones plus sombres, qu'on lirait comme une intensité.
    ctx.fillStyle = safeColor(layer?.style?.color);
    ctx.fill();
    if (context) continue; // le voile se chargera de les atténuer
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(17,24,39,0.45)';
    ctx.stroke();
  }
  ctx.restore();
}

/** Points des couches visibles hors sélection - le contexte de la zone. */
function _contextFeatures(selected) {
  const taken = new Set(selected.map((f) => `${f.__layerId}|${f.__pt?.join(',')}`));
  const out = [];
  for (const layer of dg.layers) {
    const rt = dg.runtime.get(layer.id);
    if (!rt || rt.status !== 'ready' || !rt.visible) continue;
    for (const f of rt.features) {
      if (!f.__pt || taken.has(`${layer.id}|${f.__pt.join(',')}`)) continue;
      out.push({ ...f, __layerId: layer.id });
    }
  }
  return out;
}

/* ── Entrée publique ────────────────────────────────────────────── */

/**
 * Produit la figure de la zone (data URL PNG), ou null si elle n'a pas pu être
 * rendue. Ne touche jamais à la carte de l'utilisateur.
 * @param {{polygon: object, features: Array}} selection
 */
export async function renderZoneFigure(selection) {
  if (typeof maplibregl === 'undefined') return null;
  const ring = selection?.polygon?.coordinates?.[0];
  const features = selection?.features || [];
  if (!ring?.length && !features.length) return null;

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${FIG_W}px;height:${FIG_H}px;pointer-events:none`;
  document.body.appendChild(host);

  let map = null;
  try {
    map = new maplibregl.Map({
      container: host,
      style: _figureStyle(),
      center: [0, 0],
      zoom: 2,
      pixelRatio: PIXEL_RATIO,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    });

    const bounds = new maplibregl.LngLatBounds();
    for (const c of ring || []) bounds.extend(c);
    for (const f of features) {
      if (f.__bbox) {
        bounds.extend([f.__bbox[0], f.__bbox[1]]);
        bounds.extend([f.__bbox[2], f.__bbox[3]]);
      } else if (f.__pt) bounds.extend(f.__pt);
    }
    if (bounds.isEmpty()) return null;
    // Marge de contexte autour de la zone, et place réservée en bas pour
    // l'échelle et l'attribution.
    map.fitBounds(bounds, {
      padding: { top: 48, right: 48, bottom: 64, left: 48 },
      maxZoom: 17.5,
      animate: false,
      duration: 0,
    });

    await _waitIdle(map, 8000);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const src = map.getCanvas();
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0);

    // Facteur d'échelle réel du bitmap : le pixelRatio demandé n'est pas
    // toujours celui obtenu (plafonné par le contexte WebGL).
    const k = src.width / (src.clientWidth || FIG_W);
    // Ordre : contexte, puis voile (qui l'atténue), puis sélection au-dessus.
    // Un seul levier d'atténuation, aucun gris arbitraire.
    _drawPoints(ctx, map, _contextFeatures(features), out.width, out.height, k, { radius: 3, context: true });
    _drawVeil(ctx, map, ring, out.width, out.height, k);
    _drawPoints(ctx, map, features, out.width, out.height, k);
    _drawScaleBar(ctx, map, out.width, out.height, k);
    _drawNorth(ctx, out.width, k);
    _drawAttribution(ctx, out.width, out.height, k, '© OpenStreetMap contributors');

    return out.toDataURL('image/png');
  } catch (err) {
    console.warn('[admin/diagnostic] Figure de zone:', err);
    return null;
  } finally {
    try { map?.remove(); } catch { /* jamais initialisée */ }
    host.remove();
  }
}
