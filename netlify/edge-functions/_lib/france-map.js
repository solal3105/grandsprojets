/* ============================================================================
   CARTE DE FRANCE EN SVG - index des villes (/ville/)

   Une carte muette, rendue côté serveur : aucune librairie, aucun tuilage,
   aucun appel réseau. Chaque ville est un point cliquable qui mène à son hub,
   ce qui en fait aussi du maillage interne lisible par les moteurs.

   Projection équirectangulaire corrigée par cos(46,5°) : x = lng × k,
   y = -lat. À l'échelle de la France elle est fidèle à l'œil et tient en
   deux multiplications.

   Tracés : Natural Earth 1:50m (domaine public), simplifiés par
   Douglas-Peucker. Les territoires ultramarins sont dessinés en encart,
   à l'échelle, et seulement quand une ville s'y trouve.
   ============================================================================ */

import { escHtml, escAttr, frNumber } from './seo.js';

export const METROPOLE_PATH =
  "M5.24,-47.59L5.16,-47.55L5.11,-47.46L5.05,-47.43L4.96,-47.43L4.91,-47.49L4.80,-47.45L4.75,-47.39L4.82,-47.32L4.59,-47.03L4.44,-46.95L4.41,-46.76L4.24,-46.61L4.18,-46.46L4.21,-46.38L4.20,-46.28L4.11,-46.21L4.11,-46.15L4.13,-46.14L4.27,-46.19L4.32,-46.25L4.29,-46.33L4.43,-46.43L4.66,-46.41L4.69,-46.28L4.66,-46.17L4.83,-45.93L4.68,-45.81L4.67,-45.74L4.83,-45.50L4.92,-45.40L4.87,-45.24L4.71,-45.14L4.61,-45.14L4.56,-45.12L4.57,-45.07L4.64,-44.92L4.81,-44.83L4.84,-44.72L4.79,-44.68L4.71,-44.51L4.75,-44.34L4.80,-44.28L5.04,-44.14L5.26,-44.16L5.28,-44.08L5.15,-43.86L5.16,-43.77L5.09,-43.77L5.08,-43.73L4.94,-43.66L4.73,-43.44L4.62,-43.37L4.58,-43.26L4.52,-43.20L4.21,-43.07L4.15,-43.10L4.00,-43.10L3.90,-43.18L3.72,-43.23L3.66,-43.34L3.49,-43.37L3.48,-43.44L3.24,-43.37L2.91,-43.48L2.79,-43.59L2.69,-43.56L2.61,-43.46L2.24,-43.19L2.10,-42.92L2.13,-42.59L2.21,-42.43L1.99,-42.46L1.86,-42.41L1.83,-42.34L1.51,-42.42L1.40,-42.35L1.37,-42.36L1.33,-42.43L1.17,-42.50L1.20,-42.56L1.18,-42.60L1.03,-42.64L0.98,-42.60L0.93,-42.69L0.53,-42.84L0.46,-42.84L0.43,-42.69L0.18,-42.69L0.14,-42.72L-0.03,-42.69L-0.21,-42.83L-0.40,-42.80L-0.52,-42.94L-0.64,-42.95L-0.81,-43.02L-0.88,-43.06L-0.89,-43.10L-0.94,-43.04L-1.01,-43.05L-0.97,-43.24L-1.18,-43.31L-1.23,-43.41L-1.12,-43.44L-1.02,-43.56L-0.93,-44.02L-0.86,-44.56L-0.81,-44.66L-0.74,-44.69L-0.79,-44.76L-0.86,-44.67L-0.82,-45.16L-0.74,-45.53L-0.57,-45.38L-0.53,-45.31L-0.48,-45.09L-0.38,-45.00L-0.44,-45.09L-0.54,-45.47L-0.82,-45.71L-0.83,-45.77L-0.71,-45.74L-0.76,-45.93L-0.79,-46.31L-0.96,-46.35L-1.23,-46.51L-1.42,-46.81L-1.44,-46.92L-1.39,-47.04L-1.43,-47.11L-1.51,-47.16L-1.45,-47.26L-1.40,-47.27L-1.20,-47.22L-1.36,-47.31L-1.62,-47.28L-1.72,-47.31L-1.74,-47.38L-1.67,-47.47L-1.76,-47.53L-1.91,-47.51L-1.93,-47.54L-1.88,-47.60L-1.92,-47.63L-2.04,-47.60L-2.11,-47.62L-2.17,-47.69L-2.37,-47.71L-2.41,-47.75L-2.69,-47.84L-2.97,-47.82L-3.05,-47.97L-3.22,-48.04L-3.19,-48.09L-3.01,-48.13L-2.98,-48.17L-3.11,-48.23L-3.15,-48.29L-2.92,-48.30L-3.02,-48.37L-3.25,-48.36L-3.28,-48.45L-3.25,-48.54L-3.12,-48.62L-2.79,-48.71L-2.56,-48.71L-2.39,-48.81L-2.22,-48.84L-2.07,-48.79L-1.85,-48.54L-1.68,-48.65L-1.43,-48.65L-1.38,-48.58L-1.31,-48.70L-1.26,-48.63L-0.95,-48.65L-1.02,-48.70L-1.08,-48.81L-1.09,-49.20L-1.25,-49.49L-1.29,-49.60L-1.28,-49.68L-1.09,-49.67L-0.94,-49.71L-0.87,-49.68L-0.85,-49.49L-0.78,-49.39L-0.36,-49.35L-0.11,-49.30L0.09,-49.40L0.29,-49.45L0.30,-49.47L0.19,-49.46L0.09,-49.51L0.08,-49.56L0.13,-49.70L0.42,-49.86L0.64,-49.91L0.86,-50.00L0.97,-50.09L1.10,-50.25L1.07,-50.29L1.09,-50.74L1.15,-50.89L1.32,-50.99L1.74,-51.10L1.79,-50.96L1.79,-50.88L1.90,-50.75L1.95,-50.71L2.14,-50.78L2.23,-50.66L2.25,-50.53L2.47,-50.48L2.54,-50.31L2.58,-50.34L2.72,-50.34L2.78,-50.32L2.87,-50.25L2.85,-50.14L2.89,-50.09L2.85,-50.00L2.87,-49.96L3.13,-49.96L3.21,-50.00L3.24,-50.10L3.32,-50.15L3.35,-50.14L3.30,-49.96L3.33,-49.91L3.35,-49.79L3.45,-49.78L3.63,-49.68L3.79,-49.51L3.99,-49.54L4.14,-49.45L4.30,-49.49L4.45,-49.44L4.50,-49.39L4.64,-49.16L4.74,-49.21L4.82,-49.18L4.84,-49.11L5.13,-49.15L5.18,-49.09L5.24,-49.06L5.60,-48.97L5.60,-48.89L5.40,-48.64L5.30,-48.28L5.24,-48.16L5.18,-47.67L5.21,-47.61L5.24,-47.59ZM6.53,-42.81L6.51,-42.66L6.56,-42.55L6.57,-42.13L6.47,-41.93L6.45,-41.68L6.32,-41.38L6.12,-41.52L6.06,-41.59L6.12,-41.70L6.00,-41.76L6.02,-41.93L5.93,-41.93L5.99,-42.10L5.91,-42.16L5.90,-42.22L5.97,-42.28L5.94,-42.34L5.90,-42.36L6.00,-42.55L6.07,-42.61L6.23,-42.66L6.29,-42.73L6.39,-42.69L6.41,-42.71L6.45,-43.02L6.48,-43.02L6.51,-42.98L6.53,-42.81Z";

/** Territoires ultramarins : tracé et emprise projetée (pour les encarts). */
export const OUTRE_MER = {
  reunion: {
    label: "La Réunion",
    bbox: [38.020, 20.865, 38.437, 21.369],
    path: "M38.41,21.34L38.31,21.37L38.24,21.36L38.11,21.27L38.07,21.22L38.02,21.06L38.03,21.00L38.07,20.90L38.17,20.87L38.27,20.88L38.32,20.91L38.37,21.02L38.44,21.14L38.43,21.28L38.41,21.34Z",
  },
  guadeloupe: {
    label: "Guadeloupe",
    bbox: [-42.536, -16.507, -42.108, -15.886],
    path: "M-42.21,-16.23L-42.30,-16.22L-42.35,-16.23L-42.36,-16.30L-42.33,-16.36L-42.35,-16.43L-42.34,-16.48L-42.31,-16.51L-42.27,-16.47L-42.26,-16.41L-42.23,-16.36L-42.11,-16.26L-42.21,-16.23ZM-42.40,-16.01L-42.45,-15.96L-42.48,-15.98L-42.51,-16.06L-42.54,-16.30L-42.50,-16.36L-42.43,-16.33L-42.37,-16.27L-42.39,-16.23L-42.38,-16.05L-42.40,-16.01ZM-42.15,-15.89L-42.19,-15.89L-42.20,-15.89L-42.21,-15.95L-42.18,-16.00L-42.16,-16.01L-42.14,-15.96L-42.13,-15.92L-42.15,-15.89Z",
  },
  martinique: {
    label: "Martinique",
    bbox: [-42.141, -14.875, -41.870, -14.426],
    path: "M-41.87,-14.49L-41.88,-14.44L-41.89,-14.43L-41.92,-14.47L-42.03,-14.47L-42.05,-14.53L-42.00,-14.60L-42.06,-14.62L-42.09,-14.65L-42.14,-14.80L-42.14,-14.85L-42.11,-14.87L-42.08,-14.88L-42.01,-14.83L-41.96,-14.76L-41.94,-14.76L-41.93,-14.74L-41.94,-14.69L-41.90,-14.61L-41.87,-14.49Z",
  },
  guyane: {
    label: "Guyane",
    bbox: [-37.595, -5.782, -35.555, -2.121],
    path: "M-37.60,-2.33L-37.59,-2.34L-37.54,-2.34L-37.51,-2.42L-37.45,-2.46L-37.31,-2.82L-37.29,-2.99L-37.31,-3.14L-37.30,-3.18L-37.18,-3.45L-37.16,-3.59L-37.18,-3.62L-37.19,-3.63L-37.25,-3.77L-37.31,-3.83L-37.35,-3.90L-37.41,-4.05L-37.41,-4.14L-37.45,-4.20L-37.44,-4.24L-37.48,-4.49L-37.46,-4.58L-37.47,-4.69L-37.50,-4.75L-37.50,-4.84L-37.50,-4.91L-37.48,-4.96L-37.48,-5.01L-37.40,-5.19L-37.34,-5.29L-37.23,-5.41L-37.16,-5.68L-37.12,-5.77L-37.07,-5.78L-36.80,-5.56L-36.67,-5.54L-36.41,-5.43L-36.32,-5.27L-36.11,-5.02L-35.99,-4.94L-35.99,-4.88L-36.02,-4.77L-35.95,-4.86L-35.83,-4.72L-35.80,-4.65L-35.77,-4.51L-35.80,-4.35L-35.74,-4.44L-35.74,-4.52L-35.71,-4.63L-35.68,-4.64L-35.65,-4.57L-35.59,-4.29L-35.56,-4.23L-35.56,-4.06L-35.63,-3.99L-35.68,-3.87L-35.75,-3.78L-35.76,-3.74L-35.79,-3.70L-35.79,-3.65L-35.91,-3.36L-35.95,-3.27L-36.02,-3.18L-36.04,-3.12L-36.04,-3.05L-36.08,-2.90L-36.11,-2.86L-36.18,-2.65L-36.18,-2.57L-36.20,-2.53L-36.28,-2.36L-36.39,-2.27L-36.42,-2.21L-36.46,-2.18L-36.49,-2.18L-36.54,-2.20L-36.61,-2.21L-36.64,-2.20L-36.68,-2.30L-36.71,-2.34L-36.78,-2.28L-36.83,-2.25L-36.99,-2.31L-37.01,-2.35L-37.03,-2.35L-37.09,-2.28L-37.26,-2.12L-37.33,-2.15L-37.37,-2.15L-37.47,-2.21L-37.53,-2.25L-37.55,-2.29L-37.60,-2.33Z",
  },
  mayotte: {
    label: "Mayotte",
    bbox: [31.005, 12.653, 31.130, 12.985],
    path: "M31.10,12.98L31.06,12.98L31.04,12.96L31.02,12.90L31.04,12.79L31.01,12.70L31.04,12.65L31.07,12.71L31.09,12.71L31.13,12.75L31.12,12.85L31.10,12.92L31.10,12.98Z",
  },
};
/* ─── Projection ─── */

/** cos(46,5°) : ramène les longitudes à l'échelle des latitudes. */
export const PROJ_K = 0.68835;

export function project(lng, lat) {
  return [lng * PROJ_K, -lat];
}

/** Emprise projetée de la métropole (Corse comprise). */
const METRO = { minX: -3.278, minY: -51.098, maxX: 6.579, maxY: -41.384 };
const PAD = 0.32;

/** Rayon des points : racine du nombre de projets, pour que la surface suive. */
const R_MIN = 0.085;
const R_MAX = 0.20;

/** Encarts ultramarins : une rangée en bas à gauche, au-dessus de l'Atlantique. */
const INSET = { x: -3.24, y: -43.7, size: 1.82, gap: 0.22 };

function inBox(x, y, bbox) {
  return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
}

/**
 * Place les villes sur la carte : métropole en grand, ultramarins en encart.
 * Rend un objet pur, sans HTML, pour que le calcul se teste seul.
 *
 * @param {Array<{slug:string,label:string,count:number,lat:number,lng:number}>} villes
 */
export function layoutMap(villes) {
  const maxCount = villes.reduce((m, v) => Math.max(m, v.count || 0), 1);
  const radius = count => R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.max(count, 1) / maxCount);

  // Quelles terres lointaines faut-il dessiner ? Seulement celles qui ont une ville.
  const placed = villes.map(v => {
    const [x, y] = project(v.lng, v.lat);
    const key = Object.keys(OUTRE_MER).find(k => inBox(x, y, OUTRE_MER[k].bbox)) || '';
    return { ...v, x, y, territory: key };
  });
  const territories = [...new Set(placed.map(p => p.territory).filter(Boolean))];

  // Chaque encart reçoit sa case, et sa propre échelle
  const insets = territories.map((key, i) => {
    const t = OUTRE_MER[key];
    const bx = INSET.x + i * (INSET.size + INSET.gap);
    const by = INSET.y;
    const w = t.bbox[2] - t.bbox[0];
    const h = t.bbox[3] - t.bbox[1];
    // 0.66 : la terre occupe les deux tiers de la case, le reste est la marge
    const scale = (INSET.size / Math.max(w, h)) * 0.66;
    return {
      key,
      label: t.label,
      path: t.path,
      box: { x: bx, y: by, w: INSET.size, h: INSET.size },
      scale,
      tx: bx + INSET.size / 2 - scale * (t.bbox[0] + t.bbox[2]) / 2,
      ty: by + INSET.size / 2 - scale * (t.bbox[1] + t.bbox[3]) / 2,
    };
  });
  const insetBy = new Map(insets.map(i => [i.key, i]));

  // Les gros points d'abord : les petits passent au-dessus et restent cliquables
  const pins = placed
    .map(p => {
      const ins = p.territory ? insetBy.get(p.territory) : null;
      return {
        slug: p.slug,
        label: p.label,
        count: p.count,
        color: p.color,
        r: radius(p.count),
        cx: ins ? ins.tx + ins.scale * p.x : p.x,
        cy: ins ? ins.ty + ins.scale * p.y : p.y,
      };
    })
    .sort((a, b) => b.r - a.r);

  const bottom = insets.length ? Math.max(METRO.maxY, INSET.y + INSET.size + 0.36) : METRO.maxY;
  const viewBox = [
    (METRO.minX - PAD).toFixed(2),
    (METRO.minY - PAD).toFixed(2),
    (METRO.maxX - METRO.minX + PAD * 2).toFixed(2),
    (bottom - METRO.minY + PAD * 2).toFixed(2),
  ].join(' ');

  return { viewBox, land: METROPOLE_PATH, insets, pins };
}

/* ─── Rendu ─── */

function pin(p) {
  const mot = p.count > 1 ? 'projets' : 'projet';
  const nom = escHtml(p.label);
  return `<a class="vh-ixmap__pin" href="/ville/${encodeURIComponent(p.slug)}" data-ville="${escAttr(p.slug)}"`
    + `${p.color ? ` style="--pin:${p.color}"` : ''} aria-label="${escAttr(`${p.label}, ${p.count} ${mot}`)}">`
    // Un seul cercle : la cible cliquable est exactement le point qu'on voit.
    // Une cible élargie irait voler les clics des villes voisines, nombreuses
    // autour de Paris et de Lyon.
    + `<circle class="vh-ixmap__dot" cx="${p.cx.toFixed(3)}" cy="${p.cy.toFixed(3)}" r="${p.r.toFixed(3)}"></circle>`
    + `<text x="${p.cx.toFixed(3)}" y="${(p.cy - p.r - 0.14).toFixed(3)}">${nom}</text>`
    + `</a>`;
}

function inset(i) {
  return `<g class="vh-ixmap__inset">`
    + `<rect x="${i.box.x}" y="${i.box.y}" width="${i.box.w}" height="${i.box.h}" rx="0.18"></rect>`
    + `<path d="${i.path}" transform="translate(${i.tx.toFixed(3)} ${i.ty.toFixed(3)}) scale(${i.scale.toFixed(4)})"></path>`
    + `<text x="${(i.box.x + i.box.w / 2).toFixed(2)}" y="${(i.box.y + i.box.h - 0.14).toFixed(2)}">${escHtml(i.label)}</text>`
    + `</g>`;
}

/**
 * Carte muette de la France, villes comprises. Chaque point est un lien.
 * @param {Parameters<typeof layoutMap>[0]} villes
 */
export function renderFranceMap(villes) {
  const { viewBox, land, insets, pins } = layoutMap(villes);
  const titre = `Carte de France : les projets recensés dans ${frNumber(villes.length)} villes`;
  // data-viewbox garde le cadrage d'origine : c'est le repère du zoom et du
  // bouton qui remet la carte d'aplomb (ville/ville-hub.js).
  const svg = `<svg class="vh-ixmap__svg" id="vh-ixmap-svg" viewBox="${viewBox}" data-viewbox="${viewBox}"`
    + ` role="img" aria-labelledby="vh-ixmap-title" focusable="false">`
    + `<title id="vh-ixmap-title">${escHtml(titre)}</title>`
    + `<path class="vh-ixmap__land" d="${land}"></path>`
    + insets.map(inset).join('')
    + `<g class="vh-ixmap__pins">${pins.map(pin).join('')}</g>`
    + `</svg>`;
  // Les boutons sont le chemin sûr : ils marchent au doigt, au clavier et sans
  // molette. La roulette et le glisser ne font que doubler ce qu'ils offrent.
  const zoom = `<div class="vh-ixmap__zoom" id="vh-ixmap-zoom" hidden>`
    + `<button type="button" class="vh-ixmap__btn" data-zoom="in" aria-label="Agrandir la carte"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>`
    + `<button type="button" class="vh-ixmap__btn" data-zoom="out" aria-label="Réduire la carte"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>`
    + `<button type="button" class="vh-ixmap__btn" data-zoom="reset" aria-label="Revoir la France entière"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>`
    + `</div>`;
  return `<div class="vh-ixmap" id="vh-ixmap">${svg}${zoom}</div>`;
}
