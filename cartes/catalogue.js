/* ============================================================================
   CATALOGUE DES CARTES - cartes/catalogue.js

   Module PARTAGÉ entre l'edge function (netlify/edge-functions/cartes.js), qui
   pré-rend la page pour le référencement, et la page elle-même (cartes.js),
   qui reconstruit le catalogue dans le navigateur si le pré-rendu a manqué.
   Une seule règle de sélection, une seule projection, un seul rendu HTML : ce
   que Google lit et ce que la tablette du salon montre sont le même objet.

   Aucune dépendance et aucun accès au DOM : le fichier tourne tel quel sous
   Deno (edge) et dans le navigateur (module ES).
   ============================================================================ */

export const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
// Clé publique (RLS protège les données) : la même que dans supabaseservice.js
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
export const BASE_ORIGIN = 'https://openprojets.com';

// Les cartes construites par la démo portent toutes ce préfixe ; l'espace de
// démonstration de la Métropole de Lyon est le seul autre espace montré.
export const PREFIXE_ESSAI = 'essai-';
export const VILLE_LYON = 'metropole-lyon';

/* Vitrine tournante : une commune n'y entre qu'avec au moins ce nombre de
   fiches illustrées. En dessous, elle reste dans la liste complète (un passant
   cherche d'abord la sienne) mais on ne la met pas en scène : trois tirages
   sans photo font moins envie qu'aucun. */
export const VITRINE_MIN_ILLUSTREES = 6;
// Fiches embarquées par commune pour la mise en scène
export const FICHES_PAR_VILLE = 4;
// Couleur posée par défaut sur un espace dont le site n'a livré aucune couleur :
// elle n'identifie pas la commune, la page reprend alors sa propre teinte.
const COULEUR_PAR_DEFAUT = '#14ae5c';
// Largeurs demandées au service d'images de Supabase (redimensionnement à la
// volée, seule façon de ne pas envoyer 1 Mo par photo à une tablette modeste)
export const LARGEUR_FICHE = 800;
export const LARGEUR_LOGO = 160;

/* ─── Le ciel : images aériennes de l'IGN (Géoplateforme, sans clé) ───
   Une seule image par vue, à la taille de l'écran, plutôt qu'une mosaïque de
   tuiles : une requête, un décodage, et le navigateur la garde 21 jours. */
const IGN_WMS = 'https://data.geopf.fr/wms-r/wms';
const IGN_COUCHE_FRANCE = 'ORTHOIMAGERY.ORTHOPHOTOS';
const IGN_COUCHE_COMMUNE = 'HR.ORTHOIMAGERY.ORTHOPHOTOS';
export const IGN_CREDIT = 'Vues aériennes IGN, BD ORTHO (Géoplateforme)';

const RAYON_TERRE = 6378137;

/** Web Mercator (EPSG:3857), en mètres */
export function mercator(lat, lng) {
  const la = Math.max(-85, Math.min(85, Number(lat)));
  const x = RAYON_TERRE * (Number(lng) * Math.PI / 180);
  const y = RAYON_TERRE * Math.log(Math.tan(Math.PI / 4 + (la * Math.PI / 180) / 2));
  return { x, y };
}

/* Les deux cadres de la France, en mètres Mercator. En paysage la France est
   décalée vers la droite, le texte vit à gauche sur l'Atlantique ; en portrait
   elle occupe la moitié haute, le texte vit en bas. Le contour de la France
   (cartes/index.html) est tracé dans ce même repère, l'axe y renversé
   (le SVG descend, Mercator monte) : la même figure sert aux deux cadres, seul
   le viewBox change. */
export const VUES_FRANCE = {
  paysage: { minx: -1664034, maxx: 1508251, miny: 4978026, maxy: 6762437, largeur: 1920, hauteur: 1080 },
  portrait: { minx: -709662, maxx: 1188336, miny: 3845701, maxy: 7219918, largeur: 1080, hauteur: 1920 },
};

/** viewBox SVG du cadre : origine en haut à gauche, y renversé */
export function viewBoxDe(vue) {
  return `${vue.minx} ${-vue.maxy} ${vue.maxx - vue.minx} ${vue.maxy - vue.miny}`;
}

/** Position d'une commune dans un cadre, en fraction (0..1) de la largeur et de la hauteur */
export function positionDansVue(lat, lng, vue) {
  const m = mercator(lat, lng);
  return {
    x: (m.x - vue.minx) / (vue.maxx - vue.minx),
    y: (vue.maxy - m.y) / (vue.maxy - vue.miny),
  };
}

function urlWms(couche, bbox, largeur, hauteur) {
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: couche, STYLES: '', CRS: 'EPSG:3857',
    BBOX: bbox.map((n) => n.toFixed(0)).join(','), WIDTH: String(largeur), HEIGHT: String(hauteur), FORMAT: 'image/jpeg',
  });
  return `${IGN_WMS}?${params}`;
}

/** La France vue du ciel, dans l'un des deux cadres */
export function urlFrance(orientation = 'paysage') {
  const vue = VUES_FRANCE[orientation] || VUES_FRANCE.paysage;
  return urlWms(IGN_COUCHE_FRANCE, [vue.minx, vue.miny, vue.maxx, vue.maxy], vue.largeur, vue.hauteur);
}

/* Une commune vue du ciel : 2,4 km de côté sur la petite dimension de l'écran,
   assez pour lire un centre-bourg entier et le tissu d'une grande ville. */
export const EMPRISE_COMMUNE_M = 2400;
export function urlAerienne(lat, lng, orientation = 'paysage') {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return '';
  const m = mercator(lat, lng);
  const paysage = orientation !== 'portrait';
  const largeur = paysage ? 1920 : 1080;
  const hauteur = paysage ? 1080 : 1920;
  const demiCourt = EMPRISE_COMMUNE_M / 2;
  const demiLong = demiCourt * (paysage ? largeur / hauteur : hauteur / largeur);
  const bbox = paysage
    ? [m.x - demiLong, m.y - demiCourt, m.x + demiLong, m.y + demiCourt]
    : [m.x - demiCourt, m.y - demiLong, m.x + demiCourt, m.y + demiLong];
  return urlWms(IGN_COUCHE_COMMUNE, bbox, largeur, hauteur);
}

/* ─── Durée d'une génération selon la taille de la commune ───
   Mesures relevées sur les générations réelles (demo/README.md) : une petite
   commune en trois à quatre minutes, une métropole en six à huit. Même barème
   dans demo/demo.js, qui ne peut pas importer ce module. */
export function dureeEstimee(population) {
  const p = Number(population) || 0;
  if (p < 3000) return { min: 3, max: 3, texte: 'environ 3 minutes' };
  if (p < 20000) return { min: 3, max: 4, texte: '3 à 4 minutes' };
  if (p < 100000) return { min: 4, max: 6, texte: '4 à 6 minutes' };
  return { min: 6, max: 8, texte: '6 à 8 minutes' };
}

/* ─── Utilitaires ─── */

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const escAttr = escHtml;

/** Couleur hexadécimale valide, en minuscules, ou '' */
export function couleurSure(couleur) {
  const c = String(couleur || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(c) ? c : '';
}

/** Seules les adresses http(s) sont posées dans le HTML */
export function urlSure(url) {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) ? u : '';
}

/** Un chiffre lisible en français : 1 102 et non 1102 */
export function nombre(n) {
  return String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** « août 2026 » depuis une date ISO, '' si inconnue */
export function moisEnLettres(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Blanc ou encre : la couleur de texte lisible sur une couleur de fond */
export function texteSur(couleur) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(couleur || '');
  if (!m) return '#ffffff';
  const lin = (h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return L > 0.4 ? '#101014' : '#ffffff';
}

/* Version réduite d'une image hébergée dans notre storage Supabase : le point
   d'accès `render/image` redimensionne à la volée. Une image venue d'ailleurs
   est rendue telle quelle. */
export function imageReduite(url, largeur) {
  const u = urlSure(url);
  if (!u) return '';
  const prefixe = `${SUPABASE_URL}/storage/v1/object/public/`;
  if (!u.startsWith(prefixe)) return u;
  const chemin = u.slice(prefixe.length).split('?')[0];
  return `${SUPABASE_URL}/storage/v1/render/image/public/${chemin}?width=${largeur}&quality=72`;
}

/** Mêmes exclusions que le sitemap : entrées de test e2e */
function estEntreeDeTest(nom, categorie) {
  const n = String(nom || '').toLowerCase();
  const c = String(categorie || '').toLowerCase();
  return n.startsWith('e2e-') || n.startsWith('e2e_') || n.startsWith('test ') || n === 'test'
    || c.startsWith('e2e-') || c.startsWith('e2e_');
}

export function nomDepuisSlug(slug) {
  return String(slug || '')
    .replace(new RegExp(`^${PREFIXE_ESSAI}`), '')
    .split('-')
    .map((m) => (m ? m.charAt(0).toUpperCase() + m.slice(1) : m))
    .join(' ');
}

/* ─── Lecture des données ─── */

const enTetes = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

/* PostgREST plafonne chaque réponse à 1 000 lignes : les fiches des communes
   d'essai dépassent ce nombre, on lit donc par pages jusqu'à la dernière. */
async function lireTout(table, params, fetchImpl) {
  const PAGE = 1000;
  const lignes = [];
  for (let offset = 0; offset < 20000; offset += PAGE) {
    const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('limit', String(PAGE));
    url.searchParams.set('offset', String(offset));
    const r = await fetchImpl(url.toString(), { headers: enTetes });
    if (!r.ok) throw new Error(`${table} : ${r.status}`);
    const page = await r.json();
    if (!Array.isArray(page)) break;
    lignes.push(...page);
    if (page.length < PAGE) break;
  }
  return lignes;
}

/**
 * Charge tout ce que la page montre : l'identité des espaces (couleur, logo,
 * centre) et leurs fiches approuvées. Lève en cas d'échec réseau : l'appelant
 * décide de la dégradation.
 */
export async function chargerCatalogue({ fetchImpl = fetch } = {}) {
  const perimetre = `(ville.like.${PREFIXE_ESSAI}*,ville.eq.${VILLE_LYON})`;
  const [identites, fiches] = await Promise.all([
    lireTout('city_branding', {
      select: 'ville,brand_name,logo_url,dark_logo_url,primary_color,center_lat,center_lng',
      or: perimetre,
      order: 'ville.asc',
    }, fetchImpl),
    lireTout('contribution_uploads', {
      select: 'ville,project_name,category,category_slug,slug,cover_url,created_at',
      approved: 'eq.true',
      or: perimetre,
      order: 'created_at.desc',
    }, fetchImpl),
  ]);
  return construireCatalogue(identites, fiches);
}

/**
 * Assemble le catalogue à partir des lignes brutes. Fonction pure : c'est elle
 * que les tests exercent.
 * @returns {{ villes: Array, lyon: Object|null, totaux: {communes:number, projets:number, illustrees:number} }}
 */
export function construireCatalogue(identites, fiches) {
  const parVille = new Map();
  for (const f of fiches || []) {
    const ville = String(f?.ville || '').toLowerCase();
    if (!ville || !f?.project_name || estEntreeDeTest(f.project_name, f.category)) continue;
    if (!parVille.has(ville)) parVille.set(ville, []);
    parVille.get(ville).push(f);
  }

  const villes = [];
  let lyon = null;
  for (const id of identites || []) {
    const slug = String(id?.ville || '').toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const estLyon = slug === VILLE_LYON;
    if (!estLyon && !slug.startsWith(PREFIXE_ESSAI)) continue;
    const projets = parVille.get(slug) || [];
    if (projets.length === 0) continue;

    // Les fiches arrivent triées de la plus récente à la plus ancienne ; on
    // embarque les plus récentes qui ont une image, notre storage d'abord
    // (lui seul se redimensionne à la volée).
    const illustrees = projets.filter((p) => urlSure(p.cover_url));
    const chezNous = illustrees.filter((p) => String(p.cover_url).startsWith(SUPABASE_URL));
    const ailleurs = illustrees.filter((p) => !String(p.cover_url).startsWith(SUPABASE_URL));
    const retenues = [...chezNous, ...ailleurs].slice(0, FICHES_PAR_VILLE).map((p) => ({
      titre: String(p.project_name).trim(),
      image: imageReduite(p.cover_url, LARGEUR_FICHE),
      lien: p.category_slug && p.slug
        ? `/fiche/${encodeURIComponent(slug)}/${encodeURIComponent(p.category_slug)}/${encodeURIComponent(p.slug)}`
        : '',
    }));

    const couleur = couleurSure(id.primary_color);
    const derniere = projets.reduce((max, p) => (String(p.created_at || '') > max ? String(p.created_at) : max), '');
    const lat = Number.isFinite(Number(id.center_lat)) ? Number(id.center_lat) : null;
    const lng = Number.isFinite(Number(id.center_lng)) ? Number(id.center_lng) : null;
    const v = {
      slug,
      // L'espace de démonstration porte en base un libellé de travail : à
      // l'écran, c'est le nom de la collectivité
      nom: estLyon ? 'Métropole de Lyon' : (String(id.brand_name || '').trim() || nomDepuisSlug(slug)),
      // La couleur par défaut n'est pas celle de la commune : on ne la montre pas
      couleur: couleur && couleur !== COULEUR_PAR_DEFAUT ? couleur : '',
      logo: imageReduite(id.logo_url, LARGEUR_LOGO),
      logoSombre: imageReduite(id.dark_logo_url, LARGEUR_LOGO),
      lat,
      lng,
      total: projets.length,
      illustrees: illustrees.length,
      genere: moisEnLettres(derniere),
      vitrine: !estLyon && illustrees.length >= VITRINE_MIN_ILLUSTREES,
      fiches: retenues,
    };
    if (estLyon) lyon = v;
    else villes.push(v);
  }

  villes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const totaux = {
    communes: villes.length,
    projets: villes.reduce((s, v) => s + v.total, 0),
    illustrees: villes.reduce((s, v) => s + v.illustrees, 0),
  };
  return { villes, lyon, totaux };
}

/** La commune mise en avant par défaut : la plus illustrée */
export function villeVedette(catalogue) {
  return [...(catalogue?.villes || [])]
    .filter((v) => v.vitrine)
    .sort((a, b) => b.illustrees - a.illustrees || a.nom.localeCompare(b.nom, 'fr'))[0] || null;
}

/* ─── Rendu HTML (chaînes, sans DOM) ─── */

/** Une commune dans la liste complète : lien vers sa page ville */
export function renderCommune(v) {
  const logo = v.logo
    ? `<img class="commune__logo" src="${escAttr(v.logo)}" alt="" loading="lazy" decoding="async" width="56" height="56">`
    : `<span class="commune__logo commune__logo--vide" aria-hidden="true">${escHtml(v.nom.charAt(0))}</span>`;
  const style = v.couleur ? ` style="--ville:${v.couleur}"` : '';
  return `<li class="commune"${style}>
  <a class="commune__lien" href="/ville/${encodeURIComponent(v.slug)}" data-ville="${escAttr(v.slug)}" data-nom="${escAttr(v.nom)}">
    ${logo}
    <span class="commune__texte"><span class="commune__nom">${escHtml(v.nom)}</span><span class="commune__n">${nombre(v.total)} ${v.total > 1 ? 'projets' : 'projet'}</span></span>
  </a>
</li>`;
}

/* Une commune sur la France vue du ciel : un point en coordonnées Mercator,
   le rayon en mètres (14 km font huit pixels sur un écran de 1920). Le cercle
   sert aux deux cadres, seul le viewBox de la figure change. */
export function renderPoint(v) {
  if (v.lat == null || v.lng == null) return '';
  const m = mercator(v.lat, v.lng);
  // Hors du cadre paysage (outre-mer) : pas de point
  const vue = VUES_FRANCE.paysage;
  if (m.x < vue.minx || m.x > vue.maxx || m.y < vue.miny || m.y > vue.maxy) return '';
  return `<circle class="point" cx="${m.x.toFixed(0)}" cy="${(-m.y).toFixed(0)}" r="14000" data-ville="${escAttr(v.slug)}"><title>${escHtml(v.nom)}</title></circle>`;
}

/**
 * La scène d'une commune : son identité, ce qu'on y a trouvé, ses fiches en
 * tirages photo. Servie pré-rendue pour la commune vedette, puis rejouée par
 * la page pour chaque commune de la vitrine.
 */
export function renderVille(v, { lyon = false } = {}) {
  const tirages = v.fiches.filter((f) => f.image).slice(0, 3).map((f, i) => {
    const ouverture = f.lien ? `<a class="tirage" href="${escAttr(f.lien)}" style="--i:${i}">` : `<span class="tirage" style="--i:${i}">`;
    const fermeture = f.lien ? '</a>' : '</span>';
    return `${ouverture}<span class="tirage__image"><img src="${escAttr(f.image)}" alt="" decoding="async" width="${LARGEUR_FICHE}" height="${Math.round(LARGEUR_FICHE * 0.62)}"></span><span class="tirage__titre">${escHtml(f.titre)}</span>${fermeture}`;
  }).join('');

  const logo = v.logo
    ? `<span class="ville__logo"><img src="${escAttr(v.logo)}" alt="" decoding="async" width="${LARGEUR_LOGO}" height="${LARGEUR_LOGO}"></span>`
    : '';
  // Un ou deux titres de projets en exemple, tant que la phrase reste courte :
  // elle doit tenir en trois lignes et se lire en quelques secondes, jamais
  // être coupée par des points de suspension
  const LONGUEUR_MAX = 150;
  const titres = v.fiches.slice(0, 2).map((f) => f.titre);
  const phrase = (ex) => {
    const dont = ex.length ? `, dont ${ex.map((t) => `« ${t} »`).join(' et ')}` : '';
    return lyon
      ? `${nombre(v.total)} projets renseignés à la main, avec leurs tracés et leurs documents : la carte complète, celle que nous construisons avec vous.`
      : `${nombre(v.total)} ${v.total > 1 ? 'projets repérés' : 'projet repéré'} sur le web public${dont}.`;
  };
  let exemples = titres;
  while (exemples.length && phrase(exemples).length > LONGUEUR_MAX) exemples = exemples.slice(0, -1);
  const sous = escHtml(phrase(exemples));
  const genere = lyon
    ? 'L\'espace de démonstration, alimenté pour de vrai'
    : (v.genere ? `Carte construite en ${escHtml(v.genere)}, sans la commune` : 'Carte construite sans la commune');
  const nom = v.nom;
  const style = v.couleur ? ` style="--ville:${v.couleur};--ville-texte:${texteSur(v.couleur)}"` : '';
  // La taille du nom se règle en CSS sur sa longueur et sur son plus long
  // segment insécable (un mot, ou un mot suivi de son trait d'union)
  const mot = Math.max(...nom.split(/[\s-]+/).map((m) => m.length)) + 1;

  return `<div class="scene__texte"${style}>
  <p class="ville__genere">${genere}</p>
  <h2 class="ville__nom" style="--n:${Math.max(4, nom.length)};--mot:${Math.max(4, mot)}">${logo}<span>${escHtml(nom)}</span></h2>
  <p class="ville__sous">${sous}</p>
  <p class="ville__action"><a class="bouton bouton--ville" href="/${encodeURIComponent(v.slug)}" data-ville="${escAttr(v.slug)}" data-nom="${escAttr(nom)}">Ouvrir la carte de ${lyon ? 'la ' : ''}${escHtml(nom)}</a></p>
</div>
<div class="scene__tirages" data-ville="${escAttr(v.slug)}" data-nom="${escAttr(nom)}">${tirages}</div>`;
}

/** La phrase des totaux, sous la promesse d'accueil */
export function renderCompte(totaux) {
  const t = totaux || {};
  if (!t.communes) return '';
  return `<b data-compte="${t.communes}">${nombre(t.communes)}</b> communes ont déjà la leur, avec <b data-compte="${t.projets}">${nombre(t.projets)}</b> projets situés sur leur carte, <b data-compte="${t.illustrees}">${nombre(t.illustrees)}</b> avec leur photo.`;
}

/** JSON-LD : la page est une collection dont chaque commune est un élément */
export function renderJsonLd(catalogue, canonical, description) {
  const villes = catalogue?.villes || [];
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Les cartes des projets de ${villes.length} communes`,
    description,
    url: canonical,
    inLanguage: 'fr',
    isPartOf: { '@type': 'WebSite', name: 'Open Projets', url: BASE_ORIGIN },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: villes.length,
      itemListElement: villes.map((v, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: v.nom,
        url: `${BASE_ORIGIN}/ville/${encodeURIComponent(v.slug)}`,
      })),
    },
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Open Projets', item: BASE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: 'Les cartes des communes', item: canonical },
    ],
  };
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json(collection)}</script>\n<script type="application/ld+json">${json(breadcrumb)}</script>`;
}
