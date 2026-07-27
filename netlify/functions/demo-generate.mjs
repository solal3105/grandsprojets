/* ============================================================================
   FONCTION DEMO-GENERATE - route /api/demo-generate (SSE, deux phases)

   Phase « analyse » (par défaut) : recensement multi-sources en direct
   (site de la mairie + pages projets + PDFs officiels, presse locale lue en
   entier, marchés publics BOAMP), sélection IA en deux passes streamées avec
   citations obligatoires, localisation hybride (emprises réelles OSM,
   adresses BAN), illustrations libres (Wikimedia Commons, geosearch sur
   place), articles rédigés par fiche. Résultat sauvegardé en brouillon
   (demo_instances.payload) puis événement { type: 'phase' } : l'écran
   enchaîne aussitôt la seconde invocation.

   Phase « create » : invocation fraîche et courte qui matérialise le
   brouillon (branding aux couleurs de la commune, modules, covers, articles,
   fiches, dossiers PDF) puis émet { type: 'done' } avec les statistiques du
   recensement. Ce découpage tient chaque invocation loin de la durée
   maximale d'exécution (la version monolithique était tuée en vol).

   Villes créées sous le préfixe `essai-` : exclues du sitemap et du
   llms.txt, noindex (voir demo/README.md pour la désinstallation complète).
   ============================================================================ */

import zlib from 'node:zlib';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
// `netlify dev` injecte dans les fonctions la passerelle IA de Netlify
// (OPENAI_BASE_URL = <site>/.netlify/ai + un jeton de passerelle a la place de
// la cle du compte). Si cette passerelle n'est pas provisionnee, TOUS les
// appels echouent en local alors que la production fonctionne. DEMO_OPENAI_KEY
// permet de viser l'API OpenAI directe pour developper et auditer.
const DEMO_OPENAI_KEY = process.env.DEMO_OPENAI_KEY || null;
const OPENAI_BASE_URL = (DEMO_OPENAI_KEY
  ? (process.env.DEMO_OPENAI_BASE_URL || 'https://api.openai.com')
  : (process.env.OPENAI_BASE_URL || 'https://api.openai.com')).replace(/\/$/, '');
const OPENAI_RESPONSES_URL = `${OPENAI_BASE_URL}/v1/responses`;
const openaiKey = () => DEMO_OPENAI_KEY || process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.DEMO_OPENAI_MODEL || 'gpt-4o';
/* Modele des taches de vision. Contre-intuitivement, il ne faut PAS y mettre
   un modele leger : mesure faite, le juge d'image passe de 953 a 13 565 tokens
   d'entree par appel sur gpt-4o-mini, qui facture les images a un tarif de
   tokens bien plus eleve. Le gain de prix unitaire ne compense pas ce facteur
   quatorze. On reste donc sur le modele principal, en gardant la variable pour
   pouvoir en changer sans toucher au code. */
const OPENAI_VISION_MODEL = process.env.DEMO_OPENAI_VISION_MODEL || OPENAI_MODEL;

const VILLE_PREFIX = 'essai-';
const MAX_PER_IP_PER_DAY = 15;
const MAX_GLOBAL_PER_DAY = 80;
const MAX_PHASE_ATTEMPTS = 2; // au-dela, la phase est declaree en echec (anti-boucle)
// Profondeur de collecte sur le site de la mairie. Mesure faite sur Tassin :
// passer de 5 a 24 pages triple la duree et le cout d'extraction pour ZERO
// projet supplementaire (la profondeur 2 remoissonne surtout la navigation).
// On garde donc un plafond modeste, mais sur les MEILLEURES pages : c'est le
// classement des liens, pas leur nombre, qui apporte le gain.
const MAIRIE_PAGES = 8;
// Pages filles, tirees uniquement des sommaires de projets (voir le second
// niveau de crawl dans inspectMairieSite)
const MAIRIE_PAGES_ENFANTS = 10;
const PAGE_TEXT_CHARS = 5000;
// Extrait de source transmis au redacteur pour chaque projet : sans lui, les
// puces "concretes" des articles etaient integralement inventees.
const SOURCE_EXCERPT_CHARS = 1800;
// Lecture des PDF officiels : plafonds de telechargement et de texte retenu
const PDF_MAX_FILES = 3;
const PDF_MAX_BYTES = 3500000;
const PDF_TEXT_CHARS = 6000;
// Plafond de telechargement d'une illustration. Au-dela on ABANDONNE l'image :
// fetchCapped tronque, et une image tronquee s'affiche amputee.
const COVER_MAX_BYTES = 8000000;
const FETCH_TIMEOUT_MS = 8000;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; OpenProjetsDemo/1.0; +https://openprojets.com/demo/)' };

const CATEGORIES = {
  'urbanisme': 'urbanisme',
  'renovation-urbaine': 'renovation urbaine',
  'mobilite': 'mobilite',
  'environnement': 'environnement',
  'equipement-public': 'equipement public',
  'patrimoine': 'patrimoine',
  'economique': 'economique',
  'logement': 'logement',
  'cadre-de-vie': 'cadre de vie',
};


// Icônes Font Awesome et couleurs des catégories créées avec chaque espace
// (mêmes colonnes que les villes réelles : category_icons.category_styles)
const CATEGORY_META = {
  'urbanisme': { icon: 'fa-solid fa-building', color: '#6366F1' },
  'renovation-urbaine': { icon: 'fa-solid fa-trowel-bricks', color: '#F97316' },
  'mobilite': { icon: 'fa-solid fa-bus', color: '#0EA5E9' },
  'environnement': { icon: 'fa-solid fa-leaf', color: '#22C55E' },
  'equipement-public': { icon: 'fa-solid fa-school', color: '#8B5CF6' },
  'patrimoine': { icon: 'fa-solid fa-landmark', color: '#B45309' },
  'economique': { icon: 'fa-solid fa-briefcase', color: '#0891B2' },
  'logement': { icon: 'fa-solid fa-house', color: '#EC4899' },
  'cadre-de-vie': { icon: 'fa-solid fa-tree', color: '#10B981' },
};

/* ─── Schémas de sortie IA ─── */

/* Un SEUL schema de sortie. Le corpus etait auparavant lu deux fois par l'IA :
   une passe d'extraction de candidats, puis une passe de selection qui le
   relisait pour verifier. C'etait le premier poste de tokens de la generation
   (~25 000 + ~16 000 en entree). La citation obligatoire, qui etait la vraie
   valeur de la premiere passe, est simplement remontee ici. */
const FINAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projects: {
      type: 'array',
      // 12 plafonnait le rappel sur les communes bien dotees : l'audit a montre
      // des projets reels ecartes faute de place, pas faute de preuve.
      maxItems: 18,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Nom court et propre du projet, sans le nom de la commune' },
          description: { type: 'string', description: '2 à 4 phrases factuelles en français, dates si connues, aucun superlatif' },
          category_slug: { type: 'string', enum: Object.keys(CATEGORIES) },
          place: { type: 'string', description: 'Lieu géocodable le plus précis (rue, quartier, équipement), vide si inconnu' },
          address: { type: 'string', description: 'Adresse postale EXACTE du projet SI elle figure telle quelle dans les sources (ex : "12 rue Voltaire" ou "avenue des Belges"). Recopie-la fidèlement. Chaîne vide si aucune adresse n\'est écrite dans les sources - N\'INVENTE JAMAIS d\'adresse.' },
          geo_query: { type: 'string', description: 'Requête optimale pour localiser CE projet sur OpenStreetMap dans la commune : adresse (n° + rue) si connue, sinon le nom EXACT de l\'équipement (ex : "Centre nautique Robert Sautin") ou du quartier/lieu-dit tel qu\'il apparaît sur une carte. Chaîne vide seulement si aucun lieu n\'est identifiable.' },
          source_url: { type: 'string' },
          evidence_quote: { type: 'string', description: 'Citation exacte copiée MOT POUR MOT depuis la source citée, une seule phrase, 200 caractères maximum. C\'est la preuve que le projet existe : si tu ne peux pas citer, ne retiens pas le projet.' },
          confidence: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
        },
        required: ['title', 'description', 'category_slug', 'place', 'address', 'geo_query', 'source_url', 'evidence_quote', 'confidence'],
      },
    },
  },
  required: ['projects'],
};

const ARTICLES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    articles: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer', description: 'Index du projet dans la liste fournie, ordre conservé' },
          title: { type: 'string', description: 'Titre du projet, repris tel quel' },
          markdown: { type: 'string', description: 'Article en markdown, 150 à 250 mots' },
        },
        required: ['index', 'title', 'markdown'],
      },
    },
  },
  required: ['articles'],
};

// Schémas des appels vision (courts)
const HEX_COLOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { color: { type: 'string' } },
  required: ['color'],
};

const IMAGE_CHOICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { best_index: { type: 'integer' } },
  required: ['best_index'],
};

/* ─── Helpers génériques ─── */

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Garde anti-SSRF : jamais de fetch sortant vers du privé/loopback. IPv4 en
// formes alternatives (décimal/hex/octal) déjà normalisées par new URL(). IPv6
// couvert : loopback ::1, unspecified ::, IPv4-mapped ::ffff:, ULA fc00::/7,
// link-local fe80::/10
const PRIVATE_HOST_RE = /^(localhost$|.*\.local$|.*\.internal$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|\[?::1|\[?::$|\[?::ffff:|\[?f[cd][0-9a-f]{2}:|\[?fe[89ab][0-9a-f]:)/i;
function isSafePublicUrl(u) {
  try {
    const p = new URL(u);
    return /^https?:$/.test(p.protocol) && !PRIVATE_HOST_RE.test(p.hostname);
  } catch { return false; }
}

// Fetch borné en temps ET en octets pendant toute la lecture du corps
// (fetchWithTimeout ne couvre que les en-têtes : un serveur lent ou une
// réponse géante pouvait bloquer la fonction ou saturer la mémoire)
async function fetchCapped(url, opts = {}, ms = FETCH_TIMEOUT_MS, maxBytes = 500000, asBuffer = false) {
  if (!isSafePublicUrl(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    // Revalide l'hôte final : une redirection a pu mener vers du privé
    if (!r.ok || !r.body || !isSafePublicUrl(r.url)) return null;
    const reader = r.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) { try { await reader.cancel(); } catch { /* flux déjà clos */ } break; }
    }
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
    const capped = buf.buffer.slice(0, Math.min(total, maxBytes));
    return {
      url: r.url,
      headers: r.headers,
      data: asBuffer ? capped : new TextDecoder('utf-8', { fatal: false }).decode(capped),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Normalisation et vocabulaire generique, partages par le rattachement des
// images, le dedoublonnage et la localisation
const unaccentLower = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const GENERIC_PROJECT_WORDS = /^(projet|travaux|amenagement|renovation|construction|extension|rehabilitation|demolition|reconstruction|creation|requalification|vegetalisation|batiment|centre|espace|locaux|groupe|nouvelle|nouveau|commune|ville)$/;
const communeHost = (u) => { try { return new URL(u).host; } catch { return 'la mairie'; } };


function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Les pages sont plafonnees au telechargement : quand la coupure tombe au
    // milieu d'un <script>, sa balise fermante manque, les regex ci-dessus ne
    // matchent plus et tout le JavaScript ressortait comme du "texte source"
    // (releve : un extrait d'article de presse commencant par "use strict").
    .replace(/<script[\s\S]*$/i, ' ')
    .replace(/<style[\s\S]*$/i, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#\d+;|&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hostOf(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; }
}

async function inChunks(items, size, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(worker)));
  }
  return out;
}

/* ─── Sources publiques ─── */

async function resolveCommune(insee) {
  const r = await fetchWithTimeout(
    `https://geo.api.gouv.fr/communes/${encodeURIComponent(insee)}?fields=nom,code,population,centre,departement,contour&geometry=contour`
  );
  if (!r.ok) return null;
  return r.json();
}

function bboxOfContour(contour) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      minLng = Math.min(minLng, coords[0]); maxLng = Math.max(maxLng, coords[0]);
      minLat = Math.min(minLat, coords[1]); maxLat = Math.max(maxLat, coords[1]);
    } else coords.forEach(walk);
  };
  if (contour?.coordinates) walk(contour.coordinates);
  if (!isFinite(minLng)) return null;
  const dLng = (maxLng - minLng) * 0.15, dLat = (maxLat - minLat) * 0.15;
  return { minLng: minLng - dLng, minLat: minLat - dLat, maxLng: maxLng + dLng, maxLat: maxLat + dLat };
}

function geometryInBbox(geometry, bbox) {
  if (!bbox) return true;
  let ok = true;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      if (coords[0] < bbox.minLng || coords[0] > bbox.maxLng || coords[1] < bbox.minLat || coords[1] > bbox.maxLat) ok = false;
    } else coords.forEach(walk);
  };
  walk(geometry.coordinates);
  return ok;
}

async function findMairieWebsite(insee) {
  try {
    const url = new URL('https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records');
    url.searchParams.set('where', `pivot LIKE "mairie" AND code_insee_commune = "${insee}"`);
    url.searchParams.set('limit', '3');
    const r = await fetchWithTimeout(url.toString());
    if (!r.ok) return null;
    const data = await r.json();
    for (const rec of data.results || []) {
      const raw = rec.site_internet;
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const site = Array.isArray(parsed) ? parsed[0]?.valeur : parsed?.valeur;
        if (site) return site.startsWith('http') ? site : `https://${site}`;
      } catch {
        if (typeof raw === 'string' && raw.includes('.')) return raw.startsWith('http') ? raw : `https://${raw}`;
      }
    }
  } catch { /* annuaire indisponible : étape sautée */ }
  return null;
}

/* Texte d'un PDF officiel.
   Les communes publient leur calendrier de travaux en PDF (« Travaux a venir
   2026 »). Ces fichiers etaient collectes et affiches en piece jointe, mais
   jamais LUS, alors que ce sont les seules sources qui donnent des dates de
   chantier fiables. Extraction volontairement minimale et sans dependance :
   decompression des flux, puis lecture des chaines des operateurs de texte.
   Elle ne gere pas les PDF scannes (images), qui n'ont de toute facon pas de
   couche texte. */
function pdfExtractText(buffer, maxChars = PDF_TEXT_CHARS) {
  const brut = Buffer.from(buffer).latin1Slice(0);
  const re = /stream\r?\n?([\s\S]*?)endstream/g;
  let m;
  let flux = 0;
  let contenu = '';
  while ((m = re.exec(brut)) !== null && flux < 60 && contenu.length < maxChars * 6) {
    flux++;
    const donnees = Buffer.from(m[1], 'latin1');
    let sortie;
    try { sortie = zlib.inflateSync(donnees); } catch {
      try { sortie = zlib.inflateRawSync(donnees); } catch { continue; }
    }
    contenu += sortie.toString('latin1');
  }
  if (!contenu) return '';

  // Chaines des operateurs Tj et TJ. Le crenage decoupe les mots en fragments :
  // on les recolle sans separateur, les espaces reels etant dans les chaines.
  const morceaux = [];
  const chaineRe = /\((?:\\.|[^()\\])*\)/g;
  let c;
  while ((c = chaineRe.exec(contenu)) !== null) {
    morceaux.push(c[0].slice(1, -1));
    if (morceaux.length > 60000) break;
  }
  const texte = morceaux.join('')
    .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\[nrt]/g, ' ')
    .replace(/[ -]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Un PDF scanne rend surtout du bruit : on ne garde que du texte plausible
  const lettres = (texte.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  if (texte.length < 120 || lettres / texte.length < 0.55) return '';
  return texte.slice(0, maxChars);
}

// Telecharge et lit les PDF les plus prometteurs du site de la mairie
async function readMairiePdfs(pdfs) {
  const cibles = pdfs
    .filter((p) => /travaux|planning|calendrier|programme|projet|amenagement|concertation/i.test(`${p.url} ${p.label}`))
    .slice(0, PDF_MAX_FILES);
  if (!cibles.length) return [];
  const lus = await inChunks(cibles, 3, async (p) => {
    try {
      const f = await fetchCapped(p.url, { headers: UA }, 9000, PDF_MAX_BYTES, true);
      if (!f) return null;
      const texte = pdfExtractText(f.data);
      return texte ? { url: p.url, label: p.label, texte } : null;
    } catch { return null; }
  });
  return lus.filter(Boolean);
}

function collectPdfLinks(html, baseUrl, out) {
  const re = /<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]{0,140}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < 12) {
    const label = stripHtml(m[2]).slice(0, 90);
    const target = `${m[1]} ${label}`.toLowerCase();
    if (!/(concertation|enqu[eê]te|dossier|r[eé]union|projet|am[eé]nagement|amenagement|plu|orientation|travaux|plan[ -]guide)/.test(target)) continue;
    try {
      const abs = new URL(m[1], baseUrl).toString();
      if (!out.some((p) => p.url === abs)) out.push({ url: abs, label: label || 'Document PDF' });
    } catch { /* lien invalide */ }
  }
}

// Detecte un texte qui est en fait du code : une page dont le corps utile n'a
// pas ete recupere (coquille JavaScript, script tronque). Le ratio de symboles
// de programmation est sans ambiguite face a de la prose francaise.
function looksLikeCode(text) {
  const t = String(text || '').slice(0, 4000);
  if (t.length < 200) return false;
  if (/^\s*["']use strict["']/.test(t)) return true;
  const symbols = (t.match(/[{};=<>()]/g) || []).length;
  return symbols / t.length > 0.06;
}

// Contenu d'une meta-balise (og:image, twitter:image, og:description...), quel
// que soit l'ordre des attributs name/property et content
function metaContent(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<meta[^>]+(?:name|property)=["']${k}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html)?.[1]
    || new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${k}["']`, 'i').exec(html)?.[1]
    || null;
}

// Écarte les images qui ne sont jamais des illustrations de projet (logos,
// icônes, pixels de tracking, boutons de partage, SVG)
const IMG_SKIP_RE = /(\.svg|sprite|logo|icone?|\bicon\b|avatar|pixel|placeholder|1x1|blank|spacer|button|share|facebook|twitter|instagram|linkedin|youtube|banner|bandeau|drapeau)/i;

// URLs d'images d'une page : image principale (og/twitter) en tete, puis images
// de contenu <img> (data-src ou src). Absolues, filtrees, dedupliquees.
function extractImageUrls(html, baseUrl, cap = 16) {
  const out = [];
  const push = (src) => {
    if (!src || out.length >= cap) return;
    try {
      const abs = new URL(src, baseUrl).toString();
      if (/^https?:/.test(abs) && !IMG_SKIP_RE.test(abs) && !out.includes(abs)) out.push(abs);
    } catch { /* src invalide */ }
  };
  push(metaContent(html, 'og:image') || metaContent(html, 'og:image:secure_url') || metaContent(html, 'twitter:image'));
  const imgRe = /<img\b[^>]*?(?:data-src|src)=["']([^"']+)["'][^>]*>/gi;
  let m; let n = 0;
  while ((m = imgRe.exec(html)) !== null && n < 14) { push(m[1]); n++; }
  return out;
}

// Moissonne les images d'une page dans `out` (accumulé sur plusieurs pages) :
// les pages "grands projets" des mairies portent les vrais visuels des projets
function collectImages(html, baseUrl, out, cap = 16) {
  for (const url of extractImageUrls(html, baseUrl, cap)) {
    if (out.length >= cap) break;
    if (!out.includes(url)) out.push(url);
  }
}

/* Collecte des pages projets du site de la mairie.
   Niveau 1 : les pages reperees depuis l'accueil, classees par force du signal.
   Niveau 2 : les pages filles, mais UNIQUEMENT depuis une page qui ressemble a
   un sommaire (fort signal, peu de texte). Declenche partout, ce second niveau
   ne ramenait que de la navigation. */

const PROJECT_LINK_RE = /(projet|travaux|urbanisme|amenagement|aménagement|chantier|grand[s-]?projet|cadre[ -]de[ -]vie|renovation|rénovation|equipement|équipement|construction|amenager|concertation|mobilit|logement|ecoquartier|écoquartier|zac)/i;

// Un lien nommé « grands projets » ou « ZAC » vaut mieux qu'un « logement » de
// menu : le score départage avant le plafonnement.
const LINK_SCORES = [
  [/grand[s-]?\s?projet|projets?[ -]structurant|nos[ -]projets|projet[ -]de[ -]ville/i, 60],
  [/zac|ecoquartier|écoquartier|amenagement|aménagement|requalification/i, 40],
  [/urbanisme|renovation|rénovation|construction|chantier/i, 30],
  [/travaux|concertation|equipement|équipement/i, 20],
  [/cadre[ -]de[ -]vie|mobilit|logement/i, 10],
];

// Pages de service qui contiennent un mot-cle sans jamais decrire de projet
// (« Numeros utiles » remontait ainsi dans la collecte elargie)
const LINK_PENALTIES = /numero|utile|contact|annuaire|horaire|demarche|etat[ -]civil|scolaire|cantine|agenda|actualite|newsletter|mentions|plan[ -]du[ -]site|recrutement|emploi|marche[ -]public|deliberation|conseil[ -]municipal/i;

function scoreProjectLink(link) {
  const hay = `${link.url} ${link.label}`;
  let score = 0;
  for (const [re, pts] of LINK_SCORES) if (re.test(hay)) score += pts;
  if (LINK_PENALTIES.test(hay)) score -= 45;
  // Une page de contenu (chemin profond) porte plus d'information qu'une
  // rubrique de premier niveau
  try { score += Math.min(new URL(link.url).pathname.split('/').filter(Boolean).length, 4) * 3; } catch { /* url deja validee */ }
  return score;
}

// Extrait les liens internes évoquant un projet, en évitant les doublons avec
// ce qui est déjà connu (`known`)
function collectProjectLinks(html, baseUrl, host, outLinks, known = []) {
  const aRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html)) !== null && outLinks.length < 90) {
    const href = m[1];
    const label = stripHtml(m[2]);
    if (!PROJECT_LINK_RE.test(`${href} ${label}`)) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.host !== host) continue;
      if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)$/i.test(abs.pathname)) continue;
      const u = abs.toString();
      if (outLinks.some((l) => l.url === u) || known.some((l) => l.url === u)) continue;
      outLinks.push({ url: u, label: label.slice(0, 80) || abs.pathname });
    } catch { /* href invalide */ }
  }
}

/* Decoupe une page en blocs {texte, images}. Un bloc = une operation sur une
   page qui en liste plusieurs. Deux decoupages complementaires : par titres de
   niveau 2 ou 3, et par conteneurs de carte les plus courants. Le but est
   qu'une vignette ne puisse etre proposee que pour le projet a cote duquel elle
   se trouve reellement. */
function extractPageBlocks(html, baseUrl) {
  const blocs = [];
  const pousser = (fragment) => {
    if (!fragment || fragment.length < 120) return;
    const texte = stripHtml(fragment).slice(0, 700);
    if (texte.length < 40) return;
    const images = extractImageUrls(fragment, baseUrl, 3);
    if (images.length) blocs.push({ texte, images });
  };

  // Decoupage par titres : le texte qui suit un <h2>/<h3> decrit ce titre
  const parTitres = html.split(/(?=<h[23][\s>])/i);
  if (parTitres.length > 2) for (const f of parTitres.slice(1, 40)) pousser(f);

  // Decoupage par cartes : classes de conteneur les plus repandues
  const carteRe = /<(article|li|div)[^>]*class=["'][^"']*(card|item-wrap|page-item|teaser|vignette|tuile|actu|projet)[^"']*["'][\s\S]{200,6000}?<\/\1>/gi;
  let m;
  let n = 0;
  while ((m = carteRe.exec(html)) !== null && n < 40) { pousser(m[0]); n++; }

  return blocs.slice(0, 40);
}

// Télécharge un lot de pages en parallèle et les verse dans `out`
async function fetchPages(links, out, onFinding) {
  const fetched = await inChunks(links, 6, async (link) => {
    const page = await fetchCapped(link.url, { headers: UA }, 6000, 400000);
    if (!page) return null;
    return { link, page, text: stripHtml(page.data).slice(0, PAGE_TEXT_CHARS) };
  });
  for (const sp of fetched) {
    if (!sp) continue;
    collectPdfLinks(sp.page.data, sp.page.url, out.pdfs);
    collectImages(sp.page.data, sp.page.url, out.images);
    if (sp.text.length > 400 && !out.urls.includes(sp.link.url)) {
      // Les images sont AUSSI gardees par page : c'est le seul moyen de
      // rattacher une photo au bon projet. Versees dans un pool indifferencie,
      // elles n'etaient que du remplissage que le juge visuel rejetait.
      out.pages.push({
        url: sp.link.url,
        title: sp.link.label,
        text: sp.text,
        images: extractImageUrls(sp.page.data, sp.page.url, 24),
        // Une page « nos projets » juxtapose une carte par operation, chacune
        // avec SA vignette. Associer les images a la page entiere donnait la
        // photo d'un projet a son voisin (releve sur Vannes : 0 attribution
        // correcte sur 5). On decoupe donc la page en blocs.
        blocs: extractPageBlocks(sp.page.data, sp.page.url),
      });
      out.urls.push(sp.link.url);
      onFinding?.({ kind: 'page', title: sp.link.label, domain: out.host });
    }
  }
  return fetched;
}

/* Vrai logo de la commune, plutot qu'une favicon.
   Une apple-touch-icon est carree, basse definition et souvent reduite a un
   monogramme. Mesure sur trois sites : les logos se trouvent entre 6 et 40 Ko
   dans le HTML, alors que la recherche etait bornee aux 6 000 premiers
   caracteres et ne trouvait donc JAMAIS rien. On elargit la fenetre et on
   classe les candidats, car un meme site expose souvent plusieurs variantes
   dont une version blanche destinee aux fonds sombres, inutilisable ici. */
const LOGO_MAUVAISE_VARIANTE = /blanc|white|negatif|negative|inverse|dark|footer|mono|print/i;
// Logos de labels, de partenaires et de publications municipales : ils portent
// le mot « logo » mais ne sont pas l'identite de la commune (releve : « Ville
// Active et Sportive » sur Tassin, le magazine « Vannes & vous » sur Vannes).
const LOGO_PARASITE = /thumbnail|vignette|csm_|label|partenaire|sponsor|certifi|magazine|journal|active|sportive|fleuri|handicap|qualite|charte|prix|trophee/i;

function findSiteLogo(html, baseUrl) {
  const zone = html.slice(0, 60000);
  const hits = [];
  for (const tag of zone.match(/<img[^>]+>/gi) || []) {
    // La position prime : le logo d'identite est dans l'en-tete, les logos de
    // labels et de partenaires arrivent plus bas dans la page.
    const at = zone.indexOf(tag);
    const alt = /alt=["']([^"']*)["']/i.exec(tag)?.[1] || '';
    const cls = /class=["']([^"']*)["']/i.exec(tag)?.[1] || '';
    // srcset : on prend la plus grande definition proposee
    const srcset = /srcset=["']([^"']+)["']/i.exec(tag)?.[1];
    const fromSet = srcset
      ? srcset.split(',').map((s) => s.trim().split(/\s+/)).sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0]?.[0]
      : null;
    const src = fromSet || /(?:data-src|src)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || /^data:/i.test(src)) continue;
    const hay = `${src} ${alt} ${cls}`;
    if (!/logo|blason|armoirie/i.test(hay)) continue;

    const w = parseInt(/width=["']?(\d+)/i.exec(tag)?.[1] || '0', 10);
    const h = parseInt(/height=["']?(\d+)/i.exec(tag)?.[1] || '0', 10);
    let score = 100;
    // Decroissance douce avec la position : elle doit departager deux logos
    // credibles, pas eliminer un logo legitime place tard dans le HTML (mesure :
    // celui d'Oyonnax se trouve a 35 Ko et une penalite trop raide l'ecartait)
    score -= Math.min(at / 1500, 60);
    if (LOGO_PARASITE.test(hay)) score -= 90;
    // Variante blanche : destinee aux fonds sombres, elle serait invisible sur
    // l'interface. Penalite forte pour qu'elle ne gagne jamais contre une
    // version couleur, et qu'a defaut on repasse sur l'icone du site.
    if (LOGO_MAUVAISE_VARIANTE.test(hay)) score -= 120;
    if (/small|mini|mobile|icon/i.test(hay)) score -= 30;
    // Un logo utilisable fait au moins ~100 px de large
    score += Math.min(w, 400) / 4;
    if (w && w < 60) score -= 40;
    if (h && w && w / h > 6) score -= 20; // banniere etiree, pas un logo
    hits.push({ src, score });
  }
  // Seuil : sous ce niveau, aucun candidat n'est meilleur que l'icone declaree
  // du site (apple-touch-icon), qui est au moins la marque de la commune
  hits.sort((a, b) => b.score - a.score);
  for (const hit of hits) {
    if (hit.score < 40) break;
    try { return new URL(hit.src, baseUrl).toString(); } catch { /* url invalide */ }
  }
  return null;
}

async function inspectMairieSite(siteUrl, onFinding) {
  const out = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [], images: [] };
  const home = await fetchCapped(siteUrl, { headers: UA }, FETCH_TIMEOUT_MS, 500000);
  if (!home) return out;
  const finalUrl = new URL(home.url);
  out.host = finalUrl.host;
  out.urls.push(home.url);
  const html = home.data;
  out.pages.push({ url: home.url, title: 'Accueil du site de la mairie', text: stripHtml(html).slice(0, 5000) });
  collectPdfLinks(html, home.url, out.pdfs);
  collectImages(html, home.url, out.images);

  const color = /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,8})["']/.exec(html)
    || /<meta[^>]+content=["'](#[0-9a-fA-F]{3,8})["'][^>]+name=["']theme-color["']/.exec(html);
  if (color) {
    const hex = color[1].toLowerCase().slice(0, 7);
    if (!/^#(fff|ffffff|000|000000|f8f8f8|fefefe)$/.test(hex)) out.themeColor = hex;
  }

  const iconCandidates = [];
  const linkRe = /<link[^>]+rel=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const rel = m[1].toLowerCase();
    if (!/icon/.test(rel)) continue;
    const href = /href=["']([^"']+)["']/.exec(m[0])?.[1];
    if (!href) continue;
    // La DEFINITION prime, pas le type de balise : privilegier systematiquement
    // apple-touch-icon faisait preferer un 120x120 a un android-chrome 512x512
    // declare juste a cote (releve sur Vannes). A defaut d'attribut sizes, la
    // definition se lit souvent dans le nom du fichier (…-512x512.png).
    const declared = parseInt(/sizes=["'](\d+)/.exec(m[0])?.[1] || '0', 10);
    const fromName = parseInt(/(\d{2,4})x\1|[-_](\d{2,4})\.(png|webp|jpg)/i.exec(href)?.[1]
      || /[-_](\d{2,4})\.(png|webp|jpg)/i.exec(href)?.[1] || '0', 10);
    const size = declared || fromName || (rel.includes('apple-touch') ? 180 : 32);
    iconCandidates.push({ href, score: size });
  }
  iconCandidates.sort((a, b) => b.score - a.score);

  out.logoUrl = findSiteLogo(html, finalUrl)
    || new URL(iconCandidates[0]?.href || '/favicon.ico', finalUrl).toString();
  // Le finding logo est émis par coreSources, une fois la couleur résolue
  // (meta theme-color, sinon couleur dominante du logo par vision IA)

  const links = [];
  collectProjectLinks(html, finalUrl, finalUrl.host, links);
  // Les liens sont classés avant d'être coupés : une page « Grands projets »
  // vaut mieux qu'une entrée de menu « logement ». Auparavant on prenait les 5
  // PREMIERS liens du HTML, donc surtout la navigation, en laissant de côté les
  // pages de fond. C'est le principal facteur limitant du nombre de projets.
  links.sort((a, b) => scoreProjectLink(b) - scoreProjectLink(a));
  const seed = await fetchPages(links.slice(0, MAIRIE_PAGES), out, onFinding);

  /* Second niveau, cible. Une page « Grands projets » n'est souvent qu'un
     SOMMAIRE : sur Vannes elle liste 14 operations en 1 160 caracteres, chaque
     page fille en portant 3 000 a 15 000. Sans ce niveau, on ne retenait que 5
     des 14 projets et les articles manquaient de matiere.
     Il est declenche seulement depuis une page a fort signal et peu de texte,
     c'est-a-dire un index : le declencher partout ramenait surtout de la
     navigation (mesure sur Tassin : trois fois plus lent, zero projet de plus). */
  const index = seed
    .filter(Boolean)
    .filter((sp) => scoreProjectLink(sp.link) >= 45 && sp.text.length < 4000)
    .slice(0, 2);
  if (index.length) {
    const enfants = [];
    for (const sp of index) collectProjectLinks(sp.page.data, sp.page.url, finalUrl.host, enfants, links);
    if (enfants.length) {
      enfants.sort((a, b) => scoreProjectLink(b) - scoreProjectLink(a));
      await fetchPages(enfants.slice(0, MAIRIE_PAGES_ENFANTS), out, onFinding);
    }
  }
  for (const pdf of out.pdfs.slice(0, 6)) {
    onFinding?.({ kind: 'pdf', title: pdf.label, domain: 'PDF officiel' });
  }
  return out;
}

async function fetchLocalNews(communeNom, departement, onFinding) {
  const queries = [
    `"${communeNom}" (projet OR aménagement OR rénovation OR réhabilitation)`,
    `"${communeNom}" (travaux OR chantier OR construction) ${departement || ''}`,
    `"${communeNom}" (ZAC OR écoquartier OR équipement OR médiathèque OR gymnase OR école OR crèche OR requalification)`,
  ];
  const items = [];
  const seen = new Set();
  for (const q of queries) {
    try {
      const u = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`;
      const r = await fetchWithTimeout(u);
      if (!r.ok) continue;
      const xml = await r.text();
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRe.exec(xml)) !== null && items.length < 22) {
        const block = m[1];
        const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block)?.[1]?.trim();
        const link = /<link>([\s\S]*?)<\/link>/.exec(block)?.[1]?.trim();
        const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1]?.trim();
        const source = /<source[^>]*>([\s\S]*?)<\/source>/.exec(block)?.[1]?.trim() || '';
        if (!title || !link || seen.has(title)) continue;
        if (pubDate && Date.now() - new Date(pubDate).getTime() > 3 * 365 * 24 * 3600 * 1000) continue;
        seen.add(title);
        items.push({ title, link, date: pubDate ? new Date(pubDate).toLocaleDateString('fr-FR') : '', source, text: '' });
      }
    } catch { /* flux indisponible */ }
  }

  await inChunks(items.slice(0, 13), 4, async (item) => {
    const page = await fetchCapped(item.link, { headers: UA }, 6000, 400000);
    if (!page) return;
    item.finalUrl = page.url;
    const html = page.data;
    const ogDesc = metaContent(html, 'og:description');
    const body = stripHtml(html);
    // Google News sert une coquille JavaScript plutot que l'article : sans ce
    // garde-fou, du code se retrouvait presente a l'IA comme le texte de la
    // source, et servait de base a la redaction de la fiche.
    item.text = [(ogDesc || ''), looksLikeCode(body) ? '' : body.slice(0, 2500)].filter(Boolean).join(' | ');
    onFinding?.({ kind: 'article', title: item.title.replace(/ - [^-]+$/, ''), domain: hostOf(item.finalUrl || item.link) || item.source, date: item.date });
  });
  return items;
}

// Marches qui n'ont aucune traduction physique sur une carte : les ecarter a la
// source ameliore la pertinence ET evite de payer des tokens pour du bruit
// (releve sur Tassin : fournitures scolaires, nettoyage des batiments).
// Le champ type_marche=TRAVAUX ecarte deja fournitures et services par
// construction. Il reste l'entretien courant, qui est un marche de travaux mais
// pas un projet : rien a montrer sur une carte.
const BOAMP_NOT_A_PROJECT = /entretien (et |courant|des|du )|r[eé]parations? courante|maintenance|v[eé]rification p[eé]riodique|contr[oô]le r[eé]glementaire|balayage|fauchage|d[eé]neigement|curage/i;

// Un marche de SERVICES peut annoncer un projet a son stade le plus neuf :
// concours d'architecte, mission OPC, etude de faisabilite. Les ecarter parce
// qu'ils ne sont pas classes TRAVAUX rendait invisibles les operations les plus
// recentes de la commune (mesure sur Tassin : le batiment du Sauze et le depot
// de Montcelard, tous deux de juin 2026, disparaissaient).
const BOAMP_SERVICE_DE_PROJET = /ma[iî]trise d['’ ]?o?euvre|\bmoe\b|concours|\bopc\b|ordonnancement|[ée]tude de faisabilit|programmation urbaine|assistance [àa] ma[iî]trise d['’ ]?ouvrage|\bamo\b/i;

// Interventions de concessionnaires de reseau : elles ferment une rue mais ne
// transforment pas le territoire, et n'ont rien a faire sur une carte de
// projets urbains.
const CONCESSIONNAIRE_RE = /\b(enedis|grdf|\bgrt\s?gaz\b|rte\b|orange|sfr|bouygues telecom|free\b|fibre optique|c[aâ]ble [eé]lectrique|ligne haute tension|moyenne tension|raccordement (?:au |du |des )?r[eé]seau|branchement)\b/i;

// Au-dela, un avis ne renseigne plus l'etat du chantier : il devient archive.
const BOAMP_MAX_AGE_MONTHS = 36;
const BOAMP_MAX_ROWS = 20;

/* Le BOAMP ne se resume pas a un intitule : le champ `donnees` porte l'avis
   complet. Trois formats coexistent selon l'anciennete (eForms europeen,
   FNSimple francais, schema legacy), d'ou la recherche par motif de cle plutot
   que par chemin fixe. Mesure sur Tassin : 17 avis sur 20 exposent une vraie
   description, et 12 sur 20 une ADRESSE POSTALE de lieu d'execution.
   C'est simultanement la matiere qui manquait aux articles et l'adresse qui
   manquait au geocodage. */
const BOAMP_DESC_RE = /natureMarche\.description|ProcurementProject\.cbc:Description|OBJET_COMPLET|objetComplet/i;
const BOAMP_LIEU_RE = /lieuExecution|lieuExecutionLivraison|RealizedLocation/i;
const BOAMP_LOT_RE = /lots\.lot\.\d+\.intitule|ProcurementProjectLot\.\d+\..*cbc:Name/i;

// Les valeurs arrivent doublement echappees (&amp;lt;br/&amp;gt;)
function unescapeBoamp(s) {
  return String(s || '')
    .replace(/&amp;lt;|&lt;/g, '<')
    .replace(/&amp;gt;|&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function boampDetails(donnees) {
  let blob = donnees;
  if (typeof blob === 'string') { try { blob = JSON.parse(blob); } catch { return {}; } }
  if (!blob || typeof blob !== 'object') return {};
  const desc = new Set(); const lieux = new Set(); const lots = new Set();
  const walk = (x, path = '', depth = 0) => {
    if (depth > 12 || !x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      const key = path ? `${path}.${k}` : k;
      if (typeof v === 'string') {
        if (BOAMP_DESC_RE.test(key) && v.length > 40) desc.add(unescapeBoamp(v));
        else if (BOAMP_LIEU_RE.test(key) && v.length > 5) lieux.add(unescapeBoamp(v));
        else if (BOAMP_LOT_RE.test(key) && v.length > 5) lots.add(unescapeBoamp(v));
      } else if (v && typeof v === 'object') walk(v, key, depth + 1);
    }
  };
  walk(blob);
  // Le lieu le plus long est le plus complet (numero + rue + code postal)
  const lieu = [...lieux].filter((l) => !/^country$/i.test(l)).sort((a, b) => b.length - a.length)[0] || '';
  return {
    description: [...desc].sort((a, b) => b.length - a.length)[0]?.slice(0, 700) || '',
    lieu: lieu.slice(0, 160),
    lots: [...lots].slice(0, 6),
  };
}

async function fetchBoamp(communeNom, departementCode, onFinding) {
  try {
    const url = new URL('https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records');
    // Fenetre de recence : sans elle, limit=40 remontait jusqu'en 2018 et des
    // marches de 2020 s'affichaient « En cours » sur la carte. Un avis de plus
    // de 3 ans ne dit plus rien de l'etat actuel du chantier.
    const cutoff = new Date(Date.now() - BOAMP_MAX_AGE_MONTHS * 30.44 * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    // Pas de filtre type_marche cote API : il est applique en JS pour pouvoir
    // rattraper les marches de SERVICES qui annoncent un projet a son stade le
    // plus neuf (concours de maitrise d'oeuvre, mission OPC, etude). Les filtrer
    // en amont rendait invisibles les operations les PLUS recentes.
    // Filtre departemental indispensable : le nom d'une commune est parfois un
    // nom commun. « Vannes » remontait des marches de vannes de vidange du Var
    // et du Gard, 13 avis hors sujet sur 25. Le departement les ecarte tous.
    const dep = /^[0-9AB]{2,3}$/i.test(String(departementCode || '')) ? String(departementCode) : null;
    // Le BOAMP stocke « 1 » là où l'API géo dit « 01 » : sans les deux formes,
    // le filtre ne rendait AUCUN avis pour les départements 01 à 09 (mesuré sur
    // Oyonnax : 29 avis réels devenus 0).
    const depVariantes = dep ? [...new Set([dep, dep.replace(/^0+/, '')])].filter(Boolean) : [];
    url.searchParams.set('where', [
      `search(objet, "${communeNom.replace(/"/g, '')}")`,
      depVariantes.length ? `(${depVariantes.map((d) => `code_departement like "${d}"`).join(' or ')})` : '',
      `dateparution > date'${cutoff}'`,
    ].filter(Boolean).join(' and '));
    url.searchParams.set('order_by', 'dateparution desc');
    url.searchParams.set('limit', '60');
    url.searchParams.set('select', 'objet,dateparution,url_avis,nature_libelle,nomacheteur,descripteur_libelle,type_marche,donnees');
    const r = await fetchWithTimeout(url.toString(), {}, 15000);
    if (!r.ok) return [];
    const data = await r.json();
    const rows = (data.results || [])
      .map((rec) => ({
        title: String(rec.objet || '').slice(0, 240),
        date: String(rec.dateparution || ''),
        link: rec.url_avis || 'https://www.boamp.fr/',
        nature: String(rec.nature_libelle || ''),
        acheteur: String(rec.nomacheteur || ''),
        themes: Array.isArray(rec.descripteur_libelle) ? rec.descripteur_libelle.slice(0, 4).join(', ') : '',
        marche: (Array.isArray(rec.type_marche) ? rec.type_marche.join(' ') : String(rec.type_marche || '')).toUpperCase(),
        ...boampDetails(rec.donnees),
      }))
      .filter((x) => x.title && !BOAMP_NOT_A_PROJECT.test(x.title))
      .filter((x) => x.marche.includes('TRAVAUX') || BOAMP_SERVICE_DE_PROJET.test(x.title));
    // Un meme marche reparait a plusieurs dates (avis initial, rectificatif,
    // resultat). On garde l'occurrence la plus informative : un « Resultat de
    // marche » prouve que le contrat est attribue, donc que le chantier suit.
    const best = new Map();
    for (const x of rows) {
      const k = x.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
      const prev = best.get(k);
      const score = /r[eé]sultat|attribution/i.test(x.nature) ? 2 : 1;
      if (!prev || score > prev.score) best.set(k, { ...x, score });
    }
    // Plafond : la liste BOAMP est tres compacte (une ligne par avis) et
    // saturait a elle seule le quota de candidats de l'IA, evincant la presse
    // et les pages de la mairie (mesure : 17 fiches sur 18 issues du BOAMP,
    // ZERO de la presse alors que 22 articles avaient ete lus).
    const deduped = [...best.values()]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, BOAMP_MAX_ROWS);
    rows.length = 0;
    rows.push(...deduped);
    rows.slice(0, 7).forEach((x) => onFinding?.({ kind: 'boamp', title: x.title.slice(0, 110), date: x.date }));
    return rows;
  } catch {
    return [];
  }
}

/* ─── IA : API Responses (retry réseau, appel structuré + variante streamée) ─── */

// POST vers l'API Responses, avec retry sur erreur réseau ("fetch failed") et
// backoff croissant : survit aux coupures de socket transitoires (bursts)
async function postOpenAI(body, timeoutMs = 120000, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetchWithTimeout(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs);
    } catch (e) {
      lastErr = e;
      // e.cause.code precise la nature (ECONNRESET socket, ENOTFOUND dns...)
      console.warn(`[demo-generate] OpenAI fetch échec (${e?.message}${e?.cause?.code ? '/' + e.cause.code : ''}), retry ${i + 1}/${tries}`);
      // Backoff exponentiel plafonne : sur UND_ERR_CONNECT_TIMEOUT en rafale
      // (plusieurs appels concurrents), un recul de 500 ms retombait dans la
      // meme fenetre de congestion et les 3 tentatives partaient ensemble.
      await sleep(Math.min(1000 * 2 ** i, 8000) + Math.floor(Math.random() * 400));
    }
  }
  throw lastErr;
}

// Coût IA : chaque appel logge ses tokens sous le nom de son schéma. Les 6
// phases étant des invocations distinctes, le total d'une génération se
// reconstitue en additionnant ces lignes dans les logs serveur.
// Cumul par invocation. Chaque phase etant une invocation distincte, le total
// d'une generation se reconstitue en additionnant les cumuls remontes dans
// stats, ce qui evite d'avoir a eplucher les logs pour chiffrer le cout.
const _tokens = { input: 0, output: 0, appels: 0 };

function logUsage(label, usage) {
  if (!usage) return;
  const i = usage.input_tokens ?? 0;
  const o = usage.output_tokens ?? 0;
  _tokens.input += i; _tokens.output += o; _tokens.appels += 1;
  console.log(`[demo-tokens] ${label} input=${i} output=${o} total=${i + o}`);
}

// Ajoute la consommation de CETTE invocation au cumul deja porte par l'etat
function cumulerTokens(state) {
  if (!state) return state;
  state.stats = state.stats || {};
  state.stats.tokens_in = (state.stats.tokens_in || 0) + _tokens.input;
  state.stats.tokens_out = (state.stats.tokens_out || 0) + _tokens.output;
  state.stats.appels_ia = (state.stats.appels_ia || 0) + _tokens.appels;
  return state;
}

// Texte de sortie d'une réponse (deux emplacements possibles selon le format)
function outputTextOf(data) {
  return data.output_text
    || data.output?.flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text
    || '';
}

// Watchdog d'inactivité : annule le flux si aucun chunk n'arrive dans idleMs
// (fetchWithTimeout ne borne que les en-têtes ; un corps figé pendrait l'invocation)
function idleCanceller(reader, idleMs = 30000) {
  let t;
  return {
    arm: () => { clearTimeout(t); t = setTimeout(() => { try { reader.cancel(); } catch { /* déjà clos */ } }, idleMs); },
    clear: () => clearTimeout(t),
  };
}

// Lit tout le corps en texte, borné par un watchdog d'inactivité
async function readBody(r, idleMs = 30000) {
  if (!r.body) return r.text();
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  const wd = idleCanceller(reader, idleMs);
  let out = '';
  try {
    wd.arm();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      wd.arm();
      out += dec.decode(value, { stream: true });
    }
  } finally { wd.clear(); }
  return out;
}

// Appel structuré non streamé : renvoie l'objet JSON validé (json_schema strict).
// Température basse par défaut : taches de fidélité (extraction, jugement)
async function openAIStructured(input, schemaName, schema, maxTokens, timeoutMs = 120000, temperature = 0.2, model = OPENAI_MODEL) {
  const r = await postOpenAI({
    model,
    input,
    text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
    max_output_tokens: maxTokens,
    temperature,
  }, timeoutMs);
  if (!r.ok) throw new Error(`IA indisponible (${r.status})`);
  const data = JSON.parse(await readBody(r));
  logUsage(schemaName, data.usage);
  const text = outputTextOf(data);
  if (!text) throw new Error('Réponse IA vide');
  return JSON.parse(text);
}

// Passe streamée : diffuse les titres au fil de l'eau (onTitle) pour le direct
async function callOpenAIStreamed(system, user, schemaName, schema, maxTokens, onTitle, temperature = 0.2) {
  const r = await postOpenAI({
    model: OPENAI_MODEL,
    stream: true,
    input: [{ role: 'system', content: system }, { role: 'user', content: user }],
    text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
    max_output_tokens: maxTokens,
    temperature,
  }, 120000);
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`IA indisponible (${r.status}) ${errText.slice(0, 200)}`);
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  const wd = idleCanceller(reader, 30000);
  let buf = '';
  let full = '';
  let titlesSeen = 0;
  const TITLE_RE = /"title"\s*:\s*"((?:[^"\\]|\\.)+)"/g;
  try {
    wd.arm();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      wd.arm();
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === 'response.output_text.delta' && ev.delta) {
            full += ev.delta;
            const titles = [...full.matchAll(TITLE_RE)];
            for (; titlesSeen < titles.length; titlesSeen++) {
              onTitle?.(titles[titlesSeen][1].replace(/\\(["\\])/g, '$1'));
            }
          } else if (ev.type === 'response.output_text.done' && ev.text) {
            full = ev.text;
          } else if (ev.type === 'response.completed') {
            logUsage(schemaName, ev.response?.usage);
          }
        } catch { /* ligne partielle : suite au prochain chunk */ }
      }
    }
  } finally {
    wd.clear();
  }
  if (!full) throw new Error('Réponse IA vide');
  return JSON.parse(full);
}

// Passe texte : streamée (titres en direct), avec repli non streamé si le flux
// échoue ou revient vide (aléa transitoire) - jamais d'interruption de démo
async function callOpenAIResilient(system, user, schemaName, schema, maxTokens, onTitle, temperature = 0.2) {
  try {
    return await callOpenAIStreamed(system, user, schemaName, schema, maxTokens, onTitle, temperature);
  } catch (e) {
    console.error('[demo-generate] repli IA non streamé après :', e.message);
    return openAIStructured([{ role: 'system', content: system }, { role: 'user', content: user }], schemaName, schema, maxTokens, 120000, temperature);
  }
}

// Budget de caracteres du paquet envoye a l'IA. Sans plafond, l'elargissement
// de la collecte ferait grimper le cout d'extraction proportionnellement au
// nombre de pages ; on borne donc, en servant d'abord les sources a plus fort
// rendement (pages officielles, puis avis de marches, puis presse).
const BUNDLE_MAX_CHARS = 120000;

/* Quotas par origine. Le paquet est plafonne globalement, mais un plafond
   unique laissait la liste des marches publics - tres compacte, une ligne par
   avis - consommer tout le budget et evincer la prose de la presse et de la
   mairie (mesure : 92 % des fiches issues d'une seule source sur Tassin, ZERO
   de la presse alors que 22 articles avaient ete lus). Chaque origine dispose
   donc de sa part reservee, et le reliquat non consomme profite aux autres. */
const PART_MAIRIE = 0.55;
const PART_BOAMP = 0.20;
const PART_PRESSE = 0.25;

function buildSourcesBundle({ mairie, news, boamp }) {
  const parts = [];
  let budget = BUNDLE_MAX_CHARS;

  /* Les parts sont des PLANCHERS, pas des plafonds. Traitees comme des
     plafonds, elles faisaient fondre le corpus : une commune dont la mairie
     n'expose que trois pages laissait 60 000 caracteres inutilises que la
     presse ne pouvait pas reprendre, et le paquet tombait de 12 000 a 5 400
     mots. Premiere passe : chaque origine sert sa part reservee. Seconde
     passe : le reliquat va a qui a encore de la matiere. */
  const groupes = [];
  const pushGroup = (textes, reserve) => {
    groupes.push({ textes, reserve, i: 0 });
  };
  const servir = (g, plafond) => {
    let restant = Math.min(plafond, budget);
    while (g.i < g.textes.length && restant > 0 && budget > 0) {
      const t = g.textes[g.i];
      const morceau = t.length > restant ? t.slice(0, restant) : t;
      parts.push(morceau);
      restant -= morceau.length;
      budget -= morceau.length;
      g.i++;
    }
  };

  pushGroup(
    mairie.pages.map((p) => `SOURCE OFFICIELLE [${p.url}] (${p.title}) :\n${p.text}`)
      // Les PDF officiels ferment la part « mairie » : ce sont les seules
      // sources qui portent un calendrier de chantier daté
      .concat((mairie.pdfTextes || []).map((d) => `DOCUMENT OFFICIEL PDF [${d.url}] (${d.label}) :\n${d.texte}`)),
    BUNDLE_MAX_CHARS * PART_MAIRIE
  );
  if (boamp.length) {
    // La date est explicitement qualifiée : sans cela, le rédacteur la reprenait
    // comme un début ou une fin de travaux dans la section « Calendrier ».
    const entete = 'MARCHÉS PUBLICS DE TRAVAUX (BOAMP). La date est celle de PARUTION DE L\'AVIS, ce n\'est ni un début ni une fin de chantier. Le champ « Lieu d\'exécution » est l\'adresse OFFICIELLE du chantier déclarée par le maître d\'ouvrage : recopie-la telle quelle dans le champ address du projet correspondant :';
    pushGroup([entete].concat(boamp.map((b) => [
      `- [${b.link}] avis paru le ${b.date} | ${b.nature || 'Avis'} | maître d'ouvrage : ${b.acheteur || 'non précisé'}${b.themes ? ` | thèmes : ${b.themes}` : ''}`,
      `  Objet : ${b.title}`,
      b.lieu ? `  Lieu d'exécution : ${b.lieu}` : '',
      b.description ? `  Description : ${b.description}` : '',
      b.lots?.length ? `  Lots : ${b.lots.join(' ; ')}` : '',
    ].filter(Boolean).join('\n'))), BUNDLE_MAX_CHARS * PART_BOAMP);
  }
  pushGroup(
    news.map((n) => `ARTICLE DE PRESSE [${n.finalUrl || n.link}] (${n.source || hostOf(n.finalUrl || n.link)}, ${n.date}) :\nTitre : ${n.title}\n${n.text || '(contenu non accessible, titre seul)'}`),
    BUNDLE_MAX_CHARS * PART_PRESSE
  );

  // Passe 1 : la part garantie de chaque origine
  for (const g of groupes) servir(g, g.reserve);
  // Passe 2 : le budget restant, a qui a encore de la matiere
  for (const g of groupes) servir(g, budget);

  return parts.join('\n\n---\n\n');
}

/* Passe UNIQUE d'extraction et de selection.
   Le corpus n'est plus lu deux fois : la citation obligatoire, seule vraie
   valeur ajoutee de l'ancienne passe de candidats, fait partie du schema
   final. Economie mesuree : la moitie du plus gros poste de tokens. */
async function extractProjects(commune, bundle, onTitle) {
  const system = `Tu es un rédacteur territorial exigeant. Tu dépouilles des sources publiques au sujet de la commune de ${commune.nom} et tu en tires la liste des projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES qui la concernent.

Sois EXHAUSTIF : retiens chaque projet réel et distinct attesté par les sources, jusqu'à 18. Ne vise pas un chiffre rond, ne résume pas la liste, n'élague pas les projets modestes.

Les sources sont de trois natures : pages officielles de la mairie, articles de presse, avis de marchés publics. Dépouille les TROIS avec la même attention. La liste de marchés publics est compacte et facile à moissonner, mais un projet raconté sur une page de la mairie ou dans un article de presse compte autant : ne remplis pas ta liste avec les seuls marchés publics.

Règles :
- Uniquement des projets physiques et localisables qui touchent le territoire de la commune. Un projet à cheval sur plusieurs communes (ligne de transport, piste cyclable structurante, ouvrage d'art, opération intercommunale) COMPTE dès qu'une partie s'y trouve : décris la portion locale. Un projet contesté compte aussi : c'est l'aménagement physique qui t'intéresse, pas la polémique.
- ÉCARTE ce qui n'est pas un aménagement du territoire : raccordement d'un concessionnaire de réseau (électricité, gaz, télécoms, fibre), entretien courant, contrat de service, achat de matériel. Écarte aussi les événements, élections, faits divers, et tout projet situé entièrement dans une AUTRE commune.
- Ne fusionne que deux entrées qui désignent EXACTEMENT le même projet au même endroit. Un parking, une résidence rénovée, un équipement (piscine, EHPAD, médiathèque), une voie réaménagée, un espace public sont des projets DISTINCTS, même dans le même quartier.
- evidence_quote : une citation exacte, copiée MOT POUR MOT depuis la source. C'est la preuve du projet : si tu ne peux pas citer, ne le retiens pas.
- source_url : obligatoirement une URL présente entre crochets dans les sources fournies.
- confidence "haute" si la citation atteste clairement le projet ; "moyenne" si l'information est réelle mais partielle ; "basse" seulement si douteux (il sera écarté).
- category_slug (catégorie dominante) : urbanisme (ZAC, aménagement large), renovation-urbaine (réhabilitation de quartier ou de logement social), mobilite (voirie, transport, pistes cyclables, gare), environnement (nature, eau, énergie), equipement-public (école, gymnase, médiathèque, hôpital, mairie, centre technique municipal, poste de police, tout bâtiment porté par la collectivité pour un service public), patrimoine (monument, église, château), economique (zone d'activité, commerces, immobilier d'entreprise privé), logement (résidence, cité universitaire, programme de logements), cadre-de-vie (espaces publics, parcs, places). En cas d'hésitation entre economique et equipement-public, tranche par le maître d'ouvrage : une opération portée par la collectivité relève de equipement-public.
- description : 2 à 4 phrases sobres et factuelles, dates si connues, zéro superlatif, en français impeccable.
- place : le lieu géocodable le plus précis mentionné (rue, quartier, équipement), chaîne vide sinon.
- address : recopie l'adresse postale exacte du projet si elle figure dans les sources (numéro + rue, ou nom de rue seul). Pour un projet issu d'un marché public, le champ « Lieu d'exécution » de l'avis EST cette adresse : recopie-la en retirant le code postal et le nom de la commune. Ignore les mentions vagues du type « différents bâtiments de la commune », qui ne sont pas des adresses. Chaîne vide si rien n'est écrit. N'invente JAMAIS.
- geo_query : la MEILLEURE requête pour localiser CE projet sur une carte OpenStreetMap dans la commune. Adresse précise si connue, sinon le nom EXACT de l'équipement, du quartier ou du lieu-dit, sans le mot "projet" ni de verbe (écris "Centre nautique Robert Sautin", pas "Rénovation du centre nautique"). Ne laisse JAMAIS ce champ vide.`;
  // Résilient : le flux OpenAI revient parfois vide (aléa constaté) -> une
  // passe non streamée en secours plutôt que d'interrompre toute la démo
  const out = await callOpenAIResilient(system, `SOURCES :\n\n${bundle}`, 'projets', FINAL_SCHEMA, 9000, onTitle);
  return out.projects || [];
}

// Rédaction par lots : un appel qui échoue (flux tronqué, coupure réseau) ne
// coûte que son lot, pas tous les articles de la commune.
const ARTICLES_BATCH = 3;

async function writeArticlesBatch(commune, projects, offset, pdfs, onTitle) {
  const system = `Tu es un rédacteur territorial. Pour CHAQUE projet fourni (index conservé), écris un article markdown de 150 à 250 mots destiné aux habitants de ${commune.nom}.

RÈGLE ABSOLUE : tu ne disposes que du champ "extrait_source" de chaque projet. Chaque affirmation de ton article doit pouvoir se lire dans cet extrait ou dans la description. N'ajoute AUCUN détail technique qui n'y figure pas : pas d'éclairage LED, pas de matériaux, pas de nombre de places, pas d'essences d'arbres, pas de dispositifs inventés. Si l'extrait est pauvre, écris un article court : mieux vaut trois lignes exactes que quinze lignes plausibles. Ne contredis jamais l'intention de la source (si elle dit "limiter le trafic", n'écris pas "améliorer la fluidité").

Structure : 2 phrases d'introduction, une section "## Ce qui change" avec 2 à 4 puces tirées de l'extrait, une section "## Calendrier" UNIQUEMENT si l'extrait donne une date de CHANTIER (début, fin, livraison, inauguration). Une date de parution d'avis de marché n'est PAS un calendrier de travaux : dans ce cas, pas de section Calendrier du tout. Si un document PDF fourni correspond CLAIREMENT au projet, ajoute "## Documents" avec le lien markdown. Termine toujours par : *Fiche générée automatiquement à partir de sources publiques : [NOM_DU_MEDIA](URL_SOURCE).* Ton sobre et factuel, aucun superlatif.`;
  const user = `PROJETS :\n${JSON.stringify(projects.map((p, i) => ({
    index: i,
    title: p.title,
    description: p.description,
    place: p.place,
    source_url: p.source_url,
    source_media: hostOf(p.source_url),
    extrait_source: p.source_excerpt || '(aucun extrait disponible : reste sur la description, sans ajouter de détail)',
  })), null, 1)}\n\nDOCUMENTS PDF DISPONIBLES :\n${pdfs.length ? pdfs.map((p) => `- [${p.label}](${p.url})`).join('\n') : '(aucun)'}`;
  const out = await callOpenAIResilient(system, user, 'articles_projets', ARTICLES_SCHEMA, 4000, onTitle, 0.4);
  // L'index renvoyé est local au lot : on le replace dans la numérotation globale
  return (out.articles || [])
    .filter((a) => a && typeof a.markdown === 'string' && a.markdown.trim())
    .map((a) => ({ ...a, index: offset + (typeof a.index === 'number' ? a.index : 0) }));
}

async function writeArticles(commune, projects, pdfs, onTitle) {
  const batches = [];
  for (let i = 0; i < projects.length; i += ARTICLES_BATCH) {
    batches.push({ items: projects.slice(i, i + ARTICLES_BATCH), offset: i });
  }
  const results = await inChunks(batches, 2, async ({ items, offset }) => {
    try {
      return await writeArticlesBatch(commune, items, offset, pdfs, onTitle);
    } catch (e) {
      console.error(`[demo-generate] articles lot ${offset} :`, e.message);
      return [];
    }
  });
  return results.flat();
}

// Formats rejetes par la vision gpt-4o : un seul suffit a faire echouer TOUT
// l'appel (png/jpeg/webp/gif uniquement acceptes)
const VISION_UNSUPPORTED_RE = /\.(svg|avif|tiff?|ico|bmp|heic|heif)(\?|#|$)/i;

// Couleur dominante du logo par vision IA : quand la mairie n'expose pas de
// meta theme-color, l'espace prend quand même la couleur de la commune
async function dominantColorFromLogo(logoUrl) {
  if (!logoUrl || VISION_UNSUPPORTED_RE.test(logoUrl)) return null; // .ico/.svg : vision echouerait
  try {
    const out = await openAIStructured([{
      role: 'user',
      content: [
        { type: 'input_text', text: 'Donne la couleur dominante de ce logo en hexadécimal #RRGGBB, en ignorant blanc, noir et gris. Choisis la couleur de marque la plus saturée et identitaire.' },
        { type: 'input_image', image_url: logoUrl },
      ],
    }], 'couleur_logo', HEX_COLOR_SCHEMA, 60, 25000, 0.2, OPENAI_VISION_MODEL);
    const hex = out.color?.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex || '')) return null;
    // Écarter le quasi blanc / quasi noir : inutilisable comme couleur primaire
    const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if ((rr > 232 && gg > 232 && bb > 232) || (rr < 24 && gg < 24 && bb < 24)) return null;
    return hex;
  } catch {
    return null;
  }
}

/* ─── Localisation hybride ─── */

function centroidOf(geometry) {
  const pts = [];
  const walk = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  walk(geometry.coordinates);
  const n = pts.length || 1;
  return {
    lng: pts.reduce((s, p) => s + p[0], 0) / n,
    lat: pts.reduce((s, p) => s + p[1], 0) / n,
  };
}

// BAN (adresses officielles), scopé sur la commune : rapide, sans quota.
// Seuil de score élevé (0.6) : BAN renvoie sinon une rue au nom VOISIN (ex
// "Docteur Boyer" pour "Docteur Rollet") - un placement faussement précis à la
// mauvaise adresse est pire qu'un repli honnête. On exige une vraie correspondance.
async function banGeocode(q, commune, bbox) {
  try {
    const u = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&citycode=${commune.code}&limit=1`;
    const r = await fetchWithTimeout(u);
    if (r.ok) {
      const f = (await r.json()).features?.[0];
      /* type='municipality' est la commune ELLE-MEME : la BAN rend ce resultat
         des que la requete ne correspond a aucune adresse (« Différents
         bâtiments de la ville de », « Tassin et Lyon »). On obtenait alors le
         centre communal, presente comme une « adresse précise » : exactement la
         position fabriquee que tout le reste du systeme s'interdit. */
      const type = f?.properties?.type;
      if (f && type !== 'municipality' && f.properties?.score >= 0.6 && geometryInBbox(f.geometry, bbox)) {
        return { geometry: f.geometry, method: 'adresse' };
      }
    }
  } catch { /* BAN indisponible */ }
  return null;
}

// Géocodage complet d'une requête : Nominatim (emprises/tracés réels) puis BAN.
// best-of-6 : on garde l'ordre de pertinence de Nominatim mais on descend
// jusqu'au 1er résultat réellement DANS la commune et son emprise (un homonyme
// mieux classé ailleurs ne fait plus rater le bon résultat).
async function nominatimLookup(q, commune, bbox) {
  try {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('q', `${q}, ${commune.nom}`);
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('polygon_geojson', '1');
    u.searchParams.set('countrycodes', 'fr');
    u.searchParams.set('limit', '6');
    const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
    if (!r.ok) console.warn(`[demo-generate] nominatim http=${r.status} pour "${q}"`);
    if (r.ok) {
      const commLc = commune.nom.toLowerCase().slice(0, 8);
      for (const hit of await r.json()) {
        const g = hit.geojson;
        if (!g || !(hit.display_name || '').toLowerCase().includes(commLc) || !geometryInBbox(g, bbox)) continue;
        if (['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'].includes(g.type)) {
          return { geometry: g, method: g.type.includes('Line') ? 'trace' : 'emprise' };
        }
        if (g.type === 'Point') return { geometry: g, method: 'adresse' };
      }
    }
  } catch (e) {
    console.warn(`[demo-generate] nominatim échec "${q}" :: ${e?.message}${e?.cause?.code ? '/' + e.cause.code : ''}`);
  }
  return null;
}

// Distance approchee en metres entre deux points (suffisant a l'echelle d'une
// commune, ou l'erreur de la projection plate est negligeable)
function haversineM(a, b) {
  const dLat = (b.lat - a.lat) * 111320;
  const dLng = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Mots d'un titre qui identifient reellement un projet (toponymes, noms
// d'equipements), une fois retire le vocabulaire d'amenagement
function distinctiveWords(titre) {
  return [...new Set(
    unaccentLower(titre).split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !GENERIC_PROJECT_WORDS.test(w))
  )];
}

/* Quartiers statistiques IRIS de l'INSEE : la seule couche officielle qui
   decoupe TOUTES les communes de plus de 5 000 habitants en secteurs nommes,
   avec leur emprise. Elle donne une position honnete a la maille du quartier
   quand aucune adresse n'est identifiable. Un seul appel par commune. */
async function fetchIrisQuartiers(insee) {
  try {
    const url = new URL('https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-france-iris/records');
    url.searchParams.set('where', `com_code="${insee}"`);
    url.searchParams.set('limit', '60');
    url.searchParams.set('select', 'iris_name,geo_shape');
    const r = await fetchWithTimeout(url.toString(), {}, 12000);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).flatMap((rec) => {
      // iris_name arrive sous forme de tableau a un element
      const nom = Array.isArray(rec.iris_name) ? rec.iris_name[0] : rec.iris_name;
      const geometry = rec.geo_shape?.geometry || rec.geo_shape;
      if (!nom || !geometry?.type) return [];
      return [{ nom, cle: unaccentLower(nom), geometry }];
    });
  } catch {
    return [];
  }
}

/* Dernier recours de localisation : l'IA a lu les sources et sait souvent
   nommer un lieu geocodable que les champs structures n'ont pas rendu. Un
   appel unique pour tous les projets restants, sur le modele leger. */
const PLACES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lieux: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'number' },
          lieu: { type: 'string', description: 'Rue, place, quartier ou équipement de la commune, tel qu\'il figure sur une carte. Chaîne vide si vraiment introuvable.' },
        },
        required: ['index', 'lieu'],
      },
    },
  },
  required: ['lieux'],
};

async function askAiForPlaces(commune, projets) {
  if (!projets.length) return [];
  try {
    const system = `Tu localises des projets urbains dans la commune de ${commune.nom}. Pour CHAQUE projet (index conservé), donne le nom du lieu le plus précis qui permette de le retrouver sur une carte de cette commune : une rue, une place, un quartier, un lieu-dit ou un équipement nommé. Écris-le tel qu'il apparaîtrait sur une carte, sans verbe ni mot « projet ». Si le texte fourni ne permet vraiment pas de situer le projet, rends une chaîne vide plutôt qu'une invention : une position fausse est pire qu'une absence.`;
    const user = JSON.stringify(projets.map((p, i) => ({
      index: i,
      titre: p.title,
      description: (p.description || '').slice(0, 300),
      extrait: (p.source_excerpt || '').slice(0, 700),
    })), null, 1);
    const out = await openAIStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      'lieux_projets', PLACES_SCHEMA, 1200, 40000, 0.1, OPENAI_VISION_MODEL
    );
    const parIndex = new Map((out.lieux || []).map((x) => [x.index, String(x.lieu || '').trim()]));
    return projets.map((_, i) => parIndex.get(i) || '');
  } catch (e) {
    console.warn('[demo-generate] recours IA localisation :', e?.message);
    return projets.map(() => '');
  }
}

// Requêtes de localisation d'un projet, de la plus fiable à la plus faible :
// adresse postale relevée dans la source, requête optimisée par l'IA, lieu,
// puis le titre nettoyé de son verbe (l'IA laisse parfois les autres vides).
function locationQueries(project) {
  const fromTitle = String(project.title || '')
    .replace(/^(r[eé]am[eé]nagement|am[eé]nagement|construction|r[eé]novation|r[eé]habilitation|extension|d[eé]molition|reconstruction|cr[eé]ation|installation|requalification|v[eé]g[eé]talisation|ouverture|restructuration|renouvellement|modification|transfert|r[eé]fection)\s+(de\s+la|de\s+l['’]|du|des|de|d['’]|d'|un|une)?\s*/i, '')
    .trim();
  const seen = new Set();
  const out = [];
  for (const q of [project.address, project.geo_query, project.place, fromTitle, ...odonymesDe(project.source_excerpt)]) {
    const t = String(q || '').trim();
    if (t.length >= 3 && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out;
}

/* Noms de voies lus directement dans le texte des sources. On n'essayait que
   les quatre champs produits par l'IA ; or les descriptions officielles citent
   souvent l'adresse en toutes lettres (« avenue Charles de Gaulle », « montée
   de Verdun »), que la BAN geocode parfaitement, sans quota. */
// La casse est insensible sur le TYPE de voie seulement. Avec le drapeau `i`
// global, la classe [A-Z] du nom acceptait aussi les minuscules : la regex
// avalait la suite de la phrase (« chemin de la Raude est concerné ») et
// attrapait « place importante pour la commune ».
const ODONYME_RE = /\b(?:[Rr]ue|[Aa]venue|[Bb]oulevard|[Pp]lace|[Cc]hemin|[Rr]oute|[Ii]mpasse|[Aa]ll[ée]e|[Qq]uai|[Cc]ours|[Mm]ont[ée]e|[Ee]splanade|[Ss]quare|[Pp]assage)\s+(?:de\s+la\s+|de\s+l['’]|du\s+|des\s+|de\s+|d['’]|la\s+|le\s+|les\s+)?[A-ZÉÈÀÂÎÔÛ][\wÀ-ÿ'’-]*(?:\s+(?:de\s+|du\s+|des\s+|d['’]|la\s+|le\s+)?[A-ZÉÈÀÂÎÔÛ][\wÀ-ÿ'’-]*){0,2}/g;

function odonymesDe(texte) {
  const out = [];
  for (const m of String(texte || '').match(ODONYME_RE) || []) {
    const v = m.replace(/\s+/g, ' ').trim();
    if (v.length >= 8 && !out.includes(v)) out.push(v);
    if (out.length >= 3) break;
  }
  return out;
}

/* ─── Illustrations libres (Wikimedia Commons), pertinence jugée par l'IA ─── */

// Pré-filtre bon marché : jamais de blason/logo/carte/SVG envoyé à la vision
// La recherche texte de Commons remonte massivement des ouvrages numerises :
// chercher « Lycee Lesage Vannes » y rend des bulletins archeologiques du XIXe
// siecle. On exige donc une extension d'image et on ecarte les scans.
// « carte postale », « CPA » et les scans anciens s'ajoutent a la liste : une
// carte postale de 1910 avec tramway hippomobile illustrait un amenagement
// cyclable de 2025.
const COMMONS_BLOCKLIST = /(blason|logo|coat[_ ]of[_ ]arms|carte postale|\bcpa\b|\bcarte\b|\bmap\b|\bplan\b|flag|drapeau|armoiries|diagram|bulletin|revue|histoire de|\(IA |archive\.org|manuscrit|gravure|estampe|lithographi|scann?[ée] par|18\d\d|19[0-4]\d|\.svg|\.tif|\.pdf|\.djvu)/i;
const COMMONS_IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

// Mappe une réponse Commons (query.pages) en candidats {url,title,credit},
// filtrés par la blocklist (blasons, logos, cartes...)
function commonsPagesToCandidates(data) {
  const out = [];
  for (const page of Object.values(data?.query?.pages || {})) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const meta = info.extmetadata || {};
    const title = String(page.title || '').replace(/^File:/i, '');
    if (!COMMONS_IMAGE_EXT.test(title)) continue;
    if (COMMONS_BLOCKLIST.test(`${title} ${stripHtml(meta.Categories?.value || '')}`)) continue;
    const artist = stripHtml(meta.Artist?.value || '').slice(0, 60) || 'auteur inconnu';
    const license = meta.LicenseShortName?.value || 'licence libre';
    out.push({ url: info.thumburl, title, credit: `${artist}, Wikimedia Commons (${license})` });
  }
  return out;
}

// Interroge l'API Commons (namespace fichiers) : geosearch ou recherche texte
async function commonsQuery(params) {
  try {
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    const all = { action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1024', origin: '*', ...params };
    for (const [k, v] of Object.entries(all)) u.searchParams.set(k, String(v));
    const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
    return r.ok ? commonsPagesToCandidates(await r.json()) : [];
  } catch { return []; }
}

// Photos géolocalisées autour d'un point
const commonsCandidatesAt = (lat, lng, radius) =>
  commonsQuery({ generator: 'geosearch', ggscoord: `${lat}|${lng}`, ggsradius: radius, ggslimit: 8, ggsnamespace: 6 });

// Photos taguées au nom du lieu mais pas géolocalisées à proximité (équipements)
const commonsTextCandidates = (query) =>
  commonsQuery({ generator: 'search', gsrsearch: query, gsrnamespace: 6, gsrlimit: 6 });

// Images de la SOURCE du projet (article de presse, page mairie) : les plus
// pertinentes car elles illustrent littéralement le projet. Démo : la licence
// n'est pas un critère ici. L'image og/principale (index 0) est mise en avant.
async function sourceImageCandidates(url) {
  const page = await fetchCapped(url, { headers: UA }, 6000, 500000);
  if (!page) return [];
  const credit = `Source : ${hostOf(page.url) || 'web'}`;
  return extractImageUrls(page.data, page.url, 5)
    .map((u, i) => ({ url: u, title: i === 0 ? 'illustration de la source' : 'image de la source', credit }));
}

// Candidats autour du projet : d'abord les images de sa source (les plus
// pertinentes), puis le geosearch Commons, complété par une recherche texte
// si besoin. Dédupliqués, plafonnés. Le juge vision tranche ensuite.
/* Images de la page de la mairie qui parle DE CE projet.
   Wikimedia Commons ne contient pas les equipements municipaux francais
   (verifie : chercher « Lycee Lesage Vannes » y rend des scans de bulletins
   archeologiques du XIXe siecle). La seule source qui publie des visuels des
   projets d'une commune, c'est le site de cette commune. Encore faut-il
   rattacher chaque photo au bon projet plutot que de tout verser en vrac. */
function mairiePageImages(project, pages = []) {
  const mots = [...new Set(
    unaccentLower(`${project.geo_query || ''} ${project.place || ''} ${project.title || ''}`)
      .split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !GENERIC_PROJECT_WORDS.test(w))
  )];
  if (!mots.length) return [];

  // Priorite absolue au BLOC : sur une page qui liste plusieurs operations,
  // seule la vignette du bloc decrivant CE projet est la bonne.
  let meilleurBloc = null;
  for (const page of pages) {
    for (const bloc of page.blocs || []) {
      const hay = unaccentLower(bloc.texte);
      const score = mots.filter((m) => hay.includes(m)).length;
      if (score >= 2 && (!meilleurBloc || score > meilleurBloc.score)) meilleurBloc = { page, bloc, score };
    }
  }
  if (meilleurBloc) {
    return meilleurBloc.bloc.images.map((url) => ({
      url,
      title: `Visuel du projet sur ${communeHost(meilleurBloc.page.url)}`,
      credit: `Source : ${communeHost(meilleurBloc.page.url)}`,
    }));
  }

  // A defaut, la page entiere : acceptable quand une page est consacree a un
  // seul projet, ce qui est le cas des pages filles du second niveau de crawl
  let best = null;
  for (const page of pages) {
    if (!page.images?.length) continue;
    const hay = unaccentLower(`${page.title || ''} ${page.text || ''}`);
    const score = mots.filter((m) => hay.includes(m)).length;
    if (score && (!best || score > best.score)) best = { page, score };
  }
  // Au moins trois mots distinctifs : sur une page multi-projets, deux mots
  // communs relevent trop souvent du hasard
  if (!best || best.score < 3) return [];
  return best.page.images.slice(0, 4).map((url) => ({
    url,
    title: `Visuel de la page « ${best.page.title} »`,
    credit: `Source : ${communeHost(best.page.url)}`,
  }));
}


/* Candidats d'illustration d'UN projet, par ordre de confiance decroissante.
   Le pool d'images generiques du site de la mairie a ete supprime : verse
   indifferemment dans le pool de chaque projet, il produisait l'essentiel des
   mauvaises attributions (une photo de Conleau prise sur la page d'accueil
   servait de visuel a un square) et faisait reencoder les memes images autant
   de fois qu'il y a de projets. Ne restent que des sources rattachables. */
async function gatherImageCandidates(project, communeNom, lat, lng, mairiePages = [], locationSure = true) {
  // Bloc de la page de la mairie qui parle de CE projet : la meilleure source
  const fromPage = mairiePageImages(project, mairiePages);
  // Images de la page source du projet elle-meme
  const fromSource = project.source_url ? await sourceImageCandidates(project.source_url) : [];

  // Commons n'est sollicite qu'a defaut, et seulement si la position est sure :
  // un geosearch autour d'une position fabriquee ne rend que du hasard.
  let commons = [];
  if (!fromPage.length && !fromSource.length && locationSure) {
    commons = await commonsCandidatesAt(lat, lng, 300);
    if (commons.length < 3) {
      commons = commons.concat(await commonsTextCandidates(
        `${project.place || project.geo_query || project.title} ${communeNom}`.trim()
      ));
    }
  }

  const seen = new Set();
  const all = [];
  for (const c of [...fromPage, ...fromSource, ...commons]) {
    if (seen.has(c.url) || all.length >= 8) continue;
    seen.add(c.url);
    all.push(c);
  }
  return all;
}

/* Repli thematique : quand aucun visuel du projet n'existe, une photo
   GENERIQUE du type d'ouvrage vaut mieux qu'une vignette vide, a condition
   d'etre annoncee comme telle. Personne ne photographie la chaufferie d'un
   lycee, mais une chaufferie reste parlante. Le credit dit explicitement
   « illustration generique » pour ne jamais laisser croire a une photo du
   projet lui-meme. */
const THEMES_GENERIQUES = [
  [/chaufferie|chauffage|[eé]nerg[eé]tique|chaudi[eè]re/i, 'chaufferie bois collective', 'une chaufferie'],
  [/groupe scolaire|[eé]cole|maternelle|[eé]l[eé]mentaire/i, 'école primaire France bâtiment', 'une école'],
  [/coll[eè]ge|lyc[eé]e/i, 'lycée France bâtiment', 'un établissement scolaire'],
  [/cr[eè]che|multi[- ]accueil|petite enfance/i, 'crèche France bâtiment', 'une crèche'],
  [/pont|passerelle|ouvrage d.art/i, 'pont routier France', 'un pont'],
  [/piscine|centre nautique|bassin/i, 'piscine municipale France', 'une piscine municipale'],
  [/gymnase|salle de sport|complexe sportif|stade/i, 'gymnase France', 'un équipement sportif'],
  [/m[eé]diath[eè]que|biblioth[eè]que/i, 'médiathèque France bâtiment', 'une médiathèque'],
  [/cimeti[eè]re/i, 'cimetière France allée', 'un cimetière'],
  [/parking|stationnement/i, 'parking public France', 'un parking'],
  [/cyclable|v[eé]lo|voie lyonnaise/i, 'piste cyclable France', 'une piste cyclable'],
  [/assainissement|eaux us[eé]es|r[eé]seau d.eau/i, 'chantier canalisation rue France', 'un chantier de réseaux'],
  [/march[eé]|halle/i, 'halle de marché France', 'une halle de marché'],
  [/ehpad|maison de retraite|r[eé]sidence autonomie/i, 'EHPAD France bâtiment', 'un EHPAD'],
  [/police|gendarmerie/i, 'poste de police municipale France', 'un poste de police'],
  [/mairie|h[oô]tel de ville/i, 'hôtel de ville France', 'une mairie'],
  [/logement|r[eé]sidence|habitat/i, 'immeuble logements neufs France', 'un programme de logements'],
  [/parc|square|jardin|v[eé]g[eé]talisation/i, 'parc public France', 'un parc public'],
];

function themeGenerique(project) {
  const hay = `${project.title || ''} ${project.description || ''}`;
  for (const [re, requete, libelle] of THEMES_GENERIQUES) {
    if (re.test(hay)) return { requete, libelle };
  }
  return null;
}

// L'IA REGARDE vraiment les photos et choisit celle qui illustre ce projet
// précis, ou aucune (-1). C'est le juge de pertinence : mieux vaut rien qu'une
// image hors sujet. Coût vision assumé, la crédibilité de la démo prime.
async function pickBestImageWithAI(project, communeNom, candidates) {
  // Ecarte les formats que la vision rejette : un seul suffirait a faire
  // echouer TOUT l'appel et a perdre tous les autres candidats
  const usable = candidates.filter((c) => !VISION_UNSUPPORTED_RE.test(c.url));
  if (!usable.length) return null;
  try {
    const content = [{
      type: 'input_text',
      text: `Projet urbain à ${communeNom} : "${project.title}". ${project.description || ''}${project.place ? ` Lieu concerné : ${project.place}.` : ''}\n\nVoici ${usable.length} photo(s) numérotée(s) de 0 à ${usable.length - 1}. Choisis l'index de celle qui illustre le mieux CE lieu ou CE projet (le bâtiment, la rue, le quartier ou l'équipement concerné, ou une vue représentative du secteur). Si aucune ne correspond vraiment, réponds -1. Ne choisis jamais par défaut : une photo hors sujet est pire que pas de photo.`,
    }];
    usable.forEach((c, i) => {
      content.push({ type: 'input_text', text: `Image ${i} - ${c.title}` });
      // detail 'low' : 85 tokens par image au lieu de ~1100 en détail auto.
      // Juger « cette photo montre-t-elle ce parking / cette rue » ne demande
      // pas la pleine résolution, et ce juge concentrait la moitié du coût IA.
      content.push({ type: 'input_image', image_url: c.url, detail: 'low' });
    });
    const out = await openAIStructured([{ role: 'user', content }], 'choix_image', IMAGE_CHOICE_SCHEMA, 60, 30000, 0.2, OPENAI_VISION_MODEL);
    const idx = out.best_index;
    if (typeof idx !== 'number' || idx < 0 || idx >= usable.length) return null;
    return usable[idx];
  } catch { return null; }
}

/* ─── Écriture Supabase ─── */

async function uploadToStorage(path, body, contentType) {
  const r = await fetchWithTimeout(`${SUPABASE_URL}/storage/v1/object/uploads/${path}`, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'Content-Type': contentType, 'x-upsert': 'true' },
    body,
  });
  if (!r.ok) throw new Error(`Storage ${r.status} sur ${path}`);
  return `${SUPABASE_URL}/storage/v1/object/public/uploads/${path}`;
}

async function insertRows(table, rows, { returning = false, onConflict = null } = {}) {
  // onConflict : indispensable pour l'idempotence quand la cible du conflit
  // n'est pas la PK (city_modules, consultation_dossiers)
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : ''}`;
  const r = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      ...serviceHeaders(),
      Prefer: `resolution=merge-duplicates${returning ? ',return=representation' : ''}`,
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Insertion ${table} : ${r.status} ${t.slice(0, 200)}`);
  }
  return returning ? r.json() : null;
}

async function deleteWhere(table, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetchWithTimeout(url.toString(), { method: 'DELETE', headers: serviceHeaders() });
  if (!r.ok) throw new Error(`Suppression ${table} : ${r.status}`);
}

async function updateInstance(ville, patch) {
  const r = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/demo_instances?ville=eq.${encodeURIComponent(ville)}`, {
    method: 'PATCH',
    headers: serviceHeaders(),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Mise à jour demo_instances : ${r.status}`);
}

async function countToday(filterCol, filterVal) {
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL(`${SUPABASE_URL}/rest/v1/demo_instances`);
  url.searchParams.set('select', 'ville');
  url.searchParams.set('created_at', `gte.${today}`);
  if (filterCol) url.searchParams.set(filterCol, `eq.${filterVal}`);
  const r = await fetchWithTimeout(url.toString(), {
    headers: { ...serviceHeaders(), Prefer: 'count=exact', Range: '0-0' },
  });
  const range = r.headers.get('content-range') || '0/0';
  return parseInt(range.split('/')[1] || '0', 10);
}

async function getInstance(where) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/demo_instances`);
  url.searchParams.set('select', 'ville,commune_nom,commune_insee,status,payload,created_at');
  for (const [k, v] of Object.entries(where)) url.searchParams.set(k, `eq.${v}`);
  const r = await fetchWithTimeout(url.toString(), { headers: serviceHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

/* ─── Phase ANALYSE : recensement, IA, localisation, illustrations, articles ─── */

/* Les trois cœurs de l'analyse opèrent sur un objet `state` sérialisable :
   en production, chaque cœur tourne dans sa propre invocation (le state
   voyage via demo_instances.payload) ; en local sans clé service, ils
   s'enchaînent dans la même invocation pour garder la démo visuelle. */

async function coreSources(send, step, insee) {
  const finding = (f) => send({ type: 'finding', ...f });

  step('resolve', 'start', 'Recherche de la commune');
  const commune = await resolveCommune(insee);
  if (!commune?.centre) {
    send({ type: 'error', message: 'Commune introuvable. Vérifiez la saisie.' });
    return null;
  }
  const bbox = bboxOfContour(commune.contour);
  step('resolve', 'done', 'Commune reconnue',
    `${commune.nom} · ${commune.departement?.nom || ''} · ${(commune.population || 0).toLocaleString('fr-FR')} habitants`);

  // Les trois collectes sont independantes (presse/BOAMP ne dependent pas de la
  // mairie) : menees en parallele pour ne pas additionner leurs latences
  step('mairie', 'start', 'Visite du site officiel de la mairie');
  step('news', 'start', 'Lecture de la presse locale');
  step('boamp', 'start', 'Consultation des marchés publics (BOAMP)');

  const [mairie, news, boamp] = await Promise.all([
    (async () => {
      const site = await findMairieWebsite(insee);
      if (!site) {
        step('mairie', 'skip', 'Site officiel de la mairie', "non renseigné dans l'annuaire officiel");
        return { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [], images: [] };
      }
      const m = await inspectMairieSite(site, finding);
      // Identité visuelle et lecture des PDF en parallèle : deux travaux
      // indépendants qui ne doivent pas s'additionner dans la durée de la phase
      const [couleur, pdfsLus] = await Promise.all([
        !m.themeColor && m.logoUrl ? dominantColorFromLogo(m.logoUrl) : Promise.resolve(null),
        readMairiePdfs(m.pdfs || []),
      ]);
      if (couleur) m.themeColor = couleur;
      m.pdfTextes = pdfsLus;
      if (m.host) finding({ kind: 'logo', title: m.host, iconUrl: m.logoUrl, color: m.themeColor });
      const bits = [];
      if (m.host) bits.push(m.host);
      if (m.logoUrl) bits.push('logo récupéré');
      if (m.themeColor) bits.push('couleurs de la commune extraites');
      if (m.pages.length > 1) bits.push(`${m.pages.length - 1} page(s) projets lue(s)`);
      if (pdfsLus.length) bits.push(`${pdfsLus.length} document(s) PDF lu(s)`);
      else if (m.pdfs.length) bits.push(`${m.pdfs.length} document(s) officiel(s)`);
      step('mairie', m.host ? 'done' : 'skip', 'Site officiel de la mairie', bits.join(' · ') || 'non exploitable');
      return m;
    })(),
    (async () => {
      const n = await fetchLocalNews(commune.nom, commune.departement?.nom, finding);
      step('news', n.length ? 'done' : 'skip', 'Presse locale', `${n.length} article(s) récents analysés`);
      return n;
    })(),
    (async () => {
      const b = await fetchBoamp(commune.nom, commune.departement?.code, finding);
      step('boamp', b.length ? 'done' : 'skip', 'Marchés publics', `${b.length} avis trouvé(s)`);
      return b;
    })(),
  ]);

  if (!mairie.pages.length && !news.length && !boamp.length) {
    send({ type: 'error', message: `Pas assez de sources publiques exploitables pour ${commune.nom}. Passez nous voir : on prépare la carte avec vous, avec vos documents.` });
    return null;
  }

  const sourcesCount = mairie.pages.length + news.length + (boamp.length ? 1 : 0);
  console.log(`[demo-generate] sources ${commune.nom}: ${mairie.pages.length} pages mairie, ${news.length} articles, ${boamp.length} BOAMP, ${(mairie.images || []).length} images mairie, theme=${mairie.themeColor || 'aucun'}`);
  return {
    commune: {
      nom: commune.nom,
      code: commune.code,
      population: commune.population || 0,
      lat: commune.centre.coordinates[1],
      lng: commune.centre.coordinates[0],
    },
    bbox,
    mairie: { host: mairie.host, logoUrl: mairie.logoUrl, themeColor: mairie.themeColor, pdfs: mairie.pdfs, pages: mairie.pages, urls: mairie.urls, images: mairie.images },
    news,
    boamp,
    stats: { sources: sourcesCount, news: news.length, boamp: boamp.length },
  };
}

async function coreAi(send, step, state) {
  const { commune, mairie, news, boamp } = state;
  const bundle = buildSourcesBundle({ mairie, news, boamp });
  const words = Math.round(bundle.length / 6);

  console.log(`[demo-generate] depouillement ${commune.nom} : ~${words} mots`);
  step('ai1', 'start', 'Dépouillement des sources par l\'IA', `${state.stats.sources} sources, ~${words.toLocaleString('fr-FR')} mots à lire`);
  let projects = await extractProjects(commune, bundle, (title) => send({ type: 'ai-item', phase: 'ai1', title }));
  console.log(`[demo-generate] -> ${projects.length} projets extraits`);
  step('ai1', 'done', 'Sources dépouillées', `${projects.length} projet(s) repéré(s)`);

  step('ai2', 'start', 'Vérification des projets', 'Chaque projet doit citer sa source mot pour mot');

  const allowedUrls = new Set([
    ...mairie.urls,
    ...news.flatMap((n) => [n.link, n.finalUrl].filter(Boolean)),
    ...boamp.map((b) => b.link),
  ]);
  const allowedHosts = new Set([...allowedUrls].map(hostOf).filter(Boolean));
  const beforeFilter = projects.length;
  projects = projects.filter((p) =>
    p.confidence !== 'basse' && (allowedUrls.has(p.source_url) || allowedHosts.has(hostOf(p.source_url)))
  );

  // Garde-fou concessionnaires : le prompt demande d'écarter les interventions
  // de réseau, le modèle en laisse passer (relevé : « rénovation d'un câble
  // électrique moyenne tension par ENEDIS » présentée comme un projet urbain).
  // Remplacer une conduite n'est pas un aménagement du territoire.
  const avantConcess = projects.length;
  projects = projects.filter((p) => !CONCESSIONNAIRE_RE.test(`${p.title} ${p.description}`));
  if (projects.length < avantConcess) {
    console.log(`[demo-generate] interventions de concessionnaire écartées : ${avantConcess - projects.length}`);
  }

  // Dédoublonnage après sélection : le modèle scinde parfois un même avis en
  // deux fiches (relevé : « Aménagements d'une rue-jardin ET végétalisation des
  // abords du parking de l'Horloge » rendu en deux projets, même source, même
  // lieu, statuts contradictoires). Deux fiches qui partagent leur source ET
  // leur lieu de géocodage désignent le même chantier.
  const seenPair = new Set();
  const beforeDedup = projects.length;
  projects = projects.filter((p) => {
    const loc = (p.geo_query || p.place || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!loc) return true;
    const key = `${p.source_url}|${loc}`;
    if (seenPair.has(key)) return false;
    seenPair.add(key);
    return true;
  });
  if (projects.length < beforeDedup) {
    console.log(`[demo-generate] doublons source+lieu écartés : ${beforeDedup - projects.length}`);
  }
  console.log(`[demo-generate] -> ${projects.length} projets retenus (${beforeFilter} avant filtre source)`);

  if (projects.length < 3) {
    send({ type: 'error', message: `Les sources publiques ne suffisent pas pour une carte fidèle de ${commune.nom} (${projects.length} projet(s) vérifié(s)). Avec vos documents, la carte complète se monte en quelques jours : parlons-en.` });
    return null;
  }
  step('ai2', 'done', 'Projets vérifiés', `${projects.length} projets attestés par les sources`);
  send({ type: 'projects', items: projects.map((p) => ({ title: p.title, category_slug: p.category_slug })) });

  state.projects = projects;
  state.stats.words = words;
  state.stats.candidates = beforeFilter;

  /* FUSION MULTI-SOURCES.
     Un projet n'appartient plus a une source unique : le meme chantier figure
     souvent dans deux ou trois sources COMPLEMENTAIRES. L'avis de marche porte
     l'adresse officielle et le maitre d'ouvrage mais une description
     squelettique ; la page de la mairie porte le recit et les visuels mais
     jamais d'adresse postale ; la presse porte le contexte et les dates.
     On rassemble ici tout ce qui parle du projet, ce qui alimente d'un coup la
     redaction (matiere reelle au lieu d'inventions), le geocodage (une adresse
     recuperee d'une autre source) et l'attestation (plusieurs liens). */
  const corpus = [];
  for (const pg of mairie.pages) {
    corpus.push({ url: pg.url, type: 'mairie', titre: pg.title || '', texte: pg.text || '' });
  }
  for (const d of mairie.pdfTextes || []) {
    corpus.push({ url: d.url, type: 'document', titre: d.label || '', texte: d.texte || '' });
  }
  for (const n of news) {
    // Google News sert une coquille sans le texte de l'article : le titre reste
    // alors la seule matiere reelle, et il est souvent explicite (« Projet de
    // 43 logements sociaux : la Ville est contre »).
    const t = n.text || '';
    corpus.push({
      url: n.finalUrl || n.link,
      type: 'presse',
      titre: n.title || '',
      texte: `Titre de presse : ${n.title}${n.source ? ` (${n.source}${n.date ? ', ' + n.date : ''})` : ''}. ${t}`.trim(),
    });
  }
  for (const b of boamp) {
    corpus.push({
      url: b.link,
      type: 'marche',
      titre: b.title || '',
      lieu: b.lieu || '',
      texte: [
        `Marché public de travaux. Objet : ${b.title}.`,
        `Maître d'ouvrage : ${b.acheteur || 'non précisé'}.`,
        `${b.nature || 'Avis'} paru le ${b.date} (date de parution de l'avis, ce n'est ni un début ni une fin de chantier).`,
        b.lieu ? `Lieu d'exécution : ${b.lieu}.` : '',
        b.description ? `Description officielle : ${b.description}` : '',
        b.lots?.length ? `Lots : ${b.lots.join(' ; ')}.` : '',
        b.themes ? `Thèmes : ${b.themes}.` : '',
      ].filter(Boolean).join(' '),
    });
  }

  let fusions = 0;
  for (const p of projects) {
    const mots = distinctiveWords(`${p.title} ${p.geo_query || ''} ${p.place || ''}`);
    const quote = String(p.evidence_quote || '');

    // La source citee par l'IA vient toujours en tete, les autres derriere,
    // classees par nombre de mots distinctifs partages
    const retenues = [];
    for (const src of corpus) {
      const estCitee = src.url === p.source_url;
      const hay = unaccentLower(`${src.titre} ${src.texte}`);
      const score = mots.filter((m) => hay.includes(m)).length;
      // Deux mots distinctifs pour une source non citee : un seul est trop
      // souvent fortuit (le nom d'une avenue passante citee ailleurs)
      if (estCitee || score >= 2) retenues.push({ src, score: estCitee ? 99 : score });
    }
    retenues.sort((x, y) => y.score - x.score);
    if (retenues.length > 1) fusions++;

    // Extrait composite, borne, centre sur la citation quand on la retrouve
    const morceaux = [];
    let reste = SOURCE_EXCERPT_CHARS;
    for (const { src } of retenues.slice(0, 3)) {
      if (reste <= 0) break;
      const at = quote ? src.texte.indexOf(quote.slice(0, 40)) : -1;
      const from = at > 0 ? Math.max(0, at - 600) : 0;
      const bout = src.texte.slice(from, from + Math.min(reste, 1200)).trim();
      if (bout.length > 30) { morceaux.push(bout); reste -= bout.length; }
    }
    p.source_excerpt = morceaux.join('\n\n') || quote;
    p.sources = retenues.slice(0, 3).map(({ src }) => ({ url: src.url, type: src.type }));

    // Adresse recuperee d'une AUTRE source : c'est le gain principal de la
    // fusion pour la carte. Seul un avis de marche porte une adresse officielle,
    // et un projet trouve sur le site de la mairie n'en avait donc jamais.
    if (!String(p.address || '').trim()) {
      const avecLieu = retenues.find(({ src }) => src.type === 'marche' && src.lieu);
      if (avecLieu) {
        // On retire code postal et nom de commune, que le geocodeur ajoute deja
        p.address = avecLieu.src.lieu
          .replace(/\b\d{5}\b/g, ' ')
          .replace(new RegExp(commune.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
          .replace(/[-\s]+$/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
    }
  }
  console.log(`[demo-generate] fusion multi-sources : ${fusions}/${projects.length} projets attestés par plusieurs sources`);

  // Le paquet de sources ne sert plus : on allège le brouillon. On garde
  // toutefois un index reduit des pages (titre, images, debut de texte) : la
  // phase illustrations, qui tourne plus tard, en a besoin pour rattacher une
  // photo de la mairie au bon projet.
  state.mairie.pages = mairie.pages
    .filter((p) => p.images?.length || p.blocs?.length)
    .map((p) => ({
      url: p.url,
      title: p.title,
      images: (p.images || []).slice(0, 8),
      blocs: (p.blocs || []).slice(0, 25),
      text: (p.text || '').slice(0, 1500),
    }));
  state.news = [];
  return state;
}

// Phase LOCALISATION : localisation seule (Nominatim est lent, 1 req/s) - la
// recherche d'illustrations, coûteuse en vision IA, part dans sa propre phase
async function coreGeo(send, step, state) {
  const { projects, bbox } = state;
  const communeShim = {
    nom: state.commune.nom,
    code: state.commune.code,
    centre: { coordinates: [state.commune.lng, state.commune.lat] },
  };

  step('geo', 'start', 'Localisation des projets', 'Emprises réelles OpenStreetMap, adresses officielles BAN');
  const METHOD_LABELS = { emprise: 'emprise réelle trouvée', trace: 'tracé réel trouvé', adresse: 'adresse précise', quartier: 'quartier identifié' };
  const hits = Array.from({ length: projects.length }, () => null);
  const queries = projects.map(locationQueries);

  /* Deux passes, parce qu'une seule boucle sequentielle ne tenait pas la
     charge : a 18 projets et jusqu'a 4 requetes chacun au rythme impose par
     Nominatim (1 req/s), le budget de 32 s s'epuisait des les premiers projets
     et TOUS les suivants basculaient en position fabriquee (mesure sur
     Oyonnax : 15 punaises inventees sur 18).

     Passe 1, Nominatim, sequentielle et bornee : seule source d'emprises et de
     traces reels, donc on lui reserve le budget, mais UNE requete par projet.
     Passe 2, BAN, en parallele : officielle, scopee sur la commune, sans quota,
     donc elle rattrape tout le reste en une poignee de secondes. */
  const NOMINATIM_BUDGET_MS = 30000;
  const t0 = Date.now();
  for (let i = 0; i < projects.length; i++) {
    if (!queries[i].length) continue;
    if (Date.now() - t0 > NOMINATIM_BUDGET_MS) break;
    hits[i] = await nominatimLookup(queries[i][0], communeShim, bbox);
    // Le rythme appartient a la boucle, pas a la fonction : place dans le
    // lookup, il n'etait applique qu'en cas d'echec, et 18 succes d'affilee
    // auraient viole la politique d'usage (1 requete/seconde).
    await sleep(1050);
  }

  const pending = projects.map((_, i) => i).filter((i) => !hits[i] && queries[i].length);
  if (pending.length) {
    const rescued = await inChunks(pending, 8, async (i) => {
      for (const q of queries[i]) {
        const hit = await banGeocode(q, communeShim, bbox);
        if (hit) return { i, hit };
      }
      return null;
    });
    for (const r of rescued) if (r) hits[r.i] = r.hit;
  }

  /* Etage 3 : couche de quartiers. Beaucoup de projets ne designent pas une
     adresse mais un secteur (« quartier de la Raude »). Les quartiers
     statistiques IRIS de l'INSEE donnent une emprise reelle a cette maille,
     acceptable pour situer un projet, la ou un point invente ne l'est pas. */
  const sansPosition = projects.map((_, i) => i).filter((i) => !hits[i]);
  if (sansPosition.length) {
    const quartiers = await fetchIrisQuartiers(state.commune.code);
    if (quartiers.length) {
      let rattrapes = 0;
      for (const i of sansPosition) {
        const mots = distinctiveWords(`${projects[i].geo_query || ''} ${projects[i].place || ''} ${projects[i].title}`);
        if (!mots.length) continue;
        const q = quartiers.find((qt) => mots.some((m) => qt.cle.includes(m)));
        if (q) { hits[i] = { geometry: q.geometry, method: 'quartier' }; rattrapes++; }
      }
      if (rattrapes) console.log(`[demo-generate] quartiers IRIS : ${rattrapes} projet(s) situe(s)`);
    }
  }

  /* Etage 4, dernier recours : on redemande a l'IA. Elle a lu les sources et
     sait souvent nommer un lieu geocodable que les champs structures n'ont pas
     rendu. Un seul appel pour tous les projets restants. */
  const restants = projects.map((_, i) => i).filter((i) => !hits[i]);
  if (restants.length) {
    const propositions = await askAiForPlaces(state.commune, restants.map((i) => projects[i]));
    const aTester = restants
      .map((i, k) => ({ i, lieu: propositions[k] }))
      .filter((x) => x.lieu && x.lieu.length >= 3);
    if (aTester.length) {
      // BAN d'abord, en parallele et sans quota. Nominatim ensuite, en serie et
      // au rythme impose, pour les lieux NOMMES (« quartier de la Plaine »,
      // « Grande Vapeur ») que la BAN ne connait pas : elle n'indexe que des
      // adresses, alors que l'IA propose souvent un toponyme.
      const trouves = await inChunks(aTester, 8, async ({ i, lieu }) => {
        const hit = await banGeocode(lieu, communeShim, bbox);
        return hit ? { i, hit } : null;
      });
      let n = 0;
      for (const r of trouves) if (r) { hits[r.i] = r.hit; n++; }

      for (const { i, lieu } of aTester) {
        if (hits[i]) continue;
        const hit = await nominatimLookup(lieu, communeShim, bbox);
        if (hit) { hits[i] = hit; n++; }
        await sleep(1050);
      }
      console.log(`[demo-generate] recours IA : ${n}/${aTester.length} lieu(x) proposé(s) géocodé(s)`);
    }
  }

  /* Les projets qu'on ne sait pas situer, meme a la maille du quartier, sont
     RETIRES. Ils etaient auparavant poses a une position calculee autour du
     centre-ville, indiscernable d'une vraie punaise : une carte qui invente
     des emplacements devant un elu qui connait sa commune coute plus cher
     qu'une carte moins fournie. */
  const located = [];
  let abandonnes = 0;
  for (let i = 0; i < projects.length; i++) {
    const loc = hits[i];
    if (!loc) { abandonnes++; continue; }
    const c = centroidOf(loc.geometry);
    // Plafond aussi au stockage : une emprise Nominatim géante retombe en point
    if (JSON.stringify(loc.geometry).length >= 15000) {
      loc.geometry = { type: 'Point', coordinates: [c.lng, c.lat] };
    }
    located.push({ ...projects[i], ...loc });
  }
  /* Dedoublonnage APRES geocodage. La cle source+lieu ne voyait pas les
     doublons inter-sources : le meme parking de l'Horloge arrivait par la
     mairie et par un avis de marche, produisant deux punaises a 200 m avec des
     statuts contradictoires (« Livre » et « En cours »). Ici on compare ce que
     l'habitant voit : deux points proches dont les titres partagent un mot
     distinctif designent le meme chantier. */
  const doublons = new Set();
  for (let i = 0; i < located.length; i++) {
    if (doublons.has(i)) continue;
    const a = centroidOf(located[i].geometry);
    const motsA = distinctiveWords(located[i].title);
    for (let j = i + 1; j < located.length; j++) {
      if (doublons.has(j)) continue;
      const b = centroidOf(located[j].geometry);
      if (haversineM(a, b) > 250) continue;
      const communs = distinctiveWords(located[j].title).filter((w) => motsA.includes(w));
      if (communs.length) doublons.add(j);
    }
  }
  if (doublons.size) {
    console.log(`[demo-generate] doublons géographiques fusionnés : ${doublons.size}`);
    for (const i of [...doublons].sort((x, y) => y - x)) located.splice(i, 1);
  }

  // Les punaises ne partent au navigateur qu'une fois la liste stabilisee :
  // les envoyer avant le dedoublonnage faisait apparaitre pendant la generation
  // des marqueurs absents de la carte finale.
  for (const p of located) {
    const c = centroidOf(p.geometry);
    send({
      type: 'geo-item',
      title: p.title,
      method: p.method,
      label: METHOD_LABELS[p.method],
      category_slug: p.category_slug,
      lat: c.lat,
      lng: c.lng,
      geometry: p.geometry.type !== 'Point' ? p.geometry : null,
      // La PREUVE : la phrase exacte relevée dans la source, et d'où elle vient.
      // C'est ce qui distingue un recensement d'une génération de texte, et
      // l'écran ne l'affichait pas alors qu'elle était déjà produite.
      quote: String(p.evidence_quote || '').slice(0, 220),
      media: hostOf(p.source_url) || '',
      sources: (p.sources || []).map((s) => s.type),
    });
  }

  // Le plancher de 3 projets etait controle AVANT le geocodage. Depuis que les
  // projets non localisables sont retires, la liste peut fondre ici : on
  // recontrole, plutot que de livrer une carte a une ou deux punaises.
  if (located.length < 3) {
    send({ type: 'error', message: `Les sources publiques ne permettent pas de situer assez de projets à ${state.commune.nom} (${located.length} sur la carte). Avec vos documents, la carte complète se monte en quelques jours : parlons-en.` });
    return null;
  }

  const exacts = located.filter((p) => p.method !== 'quartier').length;
  console.log(`[demo-generate] geo ${state.commune.nom}: ${located.length} situés (${exacts} à l'adresse, ${located.length - exacts} au quartier), ${abandonnes} écarté(s) faute de localisation`);
  step('geo', 'done', 'Projets localisés',
    `${located.length} projet(s) situé(s)${abandonnes ? `, ${abandonnes} écarté(s) faute d'emplacement identifiable` : ''}`);
  // Ce qu'on REFUSE est aussi un argument : l'écran l'affiche comme un gage de
  // rigueur, là où tout le monde ne montre que ce qu'il a trouvé.
  if (abandonnes) send({ type: 'rejected', kind: 'position', count: abandonnes });

  state.located = located;
  state.projects = [];
  state.stats.verified = located.length;
  state.stats.precise = exacts;
  state.stats.abandonnes = abandonnes;
  return state;
}

// Phase ILLUSTRATIONS : candidats (sources + mairie + Commons) puis juge visuel
async function coreMedia(send, step, state) {
  const { located } = state;
  const pages = state.mairie?.pages || [];
  console.log(`[demo-generate] media: ${located.length} projets, ${pages.length} page(s) mairie indexée(s)`);
  step('media', 'start', 'Recherche des illustrations des projets', 'Chaque image est choisie par l\'IA selon le sujet');
  // Concurrence 4 : a 6 appels vision simultanes, les connexions sortantes du
  // bac a sable de fonctions partaient en UND_ERR_CONNECT_TIMEOUT en rafale
  const images = await inChunks(located, 4, async (p) => {
    const c = centroidOf(p.geometry);
    const candidates = await gatherImageCandidates(p, state.commune.nom, c.lat, c.lng, pages, true);
    const choix = candidates.length ? await pickBestImageWithAI(p, state.commune.nom, candidates) : null;
    if (process.env.DEMO_DUMP) {
      const origines = candidates.map((x) => (/wikimedia|wikipedia/.test(x.url) ? 'commons' : 'site')).join(',');
      console.log(`[demo-media] "${p.title}" : ${candidates.length} candidats [${origines}] -> ${choix ? 'RETENU ' + choix.title : 'aucun'}`);
    }
    return choix;
  });

  /* Repli thematique pour les projets restes sans visuel. Une seule recherche
     Commons par THEME distinct, pas par projet : deux ecoles partagent la meme
     requete. Aucune vision n'est appelee ici, la requete etant deja explicite
     (« lycee France batiment ») et le credit annoncant l'image comme generique. */
  const sansImage = located.map((p, i) => ({ p, i })).filter(({ i }) => !images[i]);
  const parTheme = new Map();
  for (const { p, i } of sansImage) {
    const t = themeGenerique(p);
    if (!t) continue;
    if (!parTheme.has(t.requete)) parTheme.set(t.requete, { libelle: t.libelle, cibles: [] });
    parTheme.get(t.requete).cibles.push(i);
  }
  if (parTheme.size) {
    const themes = [...parTheme.entries()];
    const resultats = await inChunks(themes, 4, async ([requete]) => commonsTextCandidates(requete));
    themes.forEach(([, info], k) => {
      const dispo = (resultats[k] || []).filter((c) => !VISION_UNSUPPORTED_RE.test(c.url));
      // Une image differente par projet quand la recherche en offre plusieurs
      info.cibles.forEach((idx, rang) => {
        const c = dispo[rang % Math.max(dispo.length, 1)];
        if (!c) return;
        images[idx] = { ...c, credit: `Illustration générique (${info.libelle}) - ${c.credit}`, generique: true };
      });
    });
    console.log(`[demo-generate] media: repli thématique appliqué sur ${themes.reduce((s, [, i2]) => s + i2.cibles.length, 0)} projet(s)`);
  }
  let illustrated = 0;
  const usedCovers = new Set(); // pas deux fois la même image sur des fiches différentes
  // Les CMS servent la même photo sous plusieurs URL (vignettes de cache
  // suffixées d'une empreinte : "web-parking-3d6e6237.png" et
  // "web-parking-450dc1de.png"). Comparer les URL brutes laissait donc passer
  // des doublons, et une photo de parking se retrouvait sur un projet de rue.
  const coverKey = (u) => {
    try {
      const p = decodeURIComponent(new URL(u).pathname).toLowerCase();
      const file = p.slice(p.lastIndexOf('/') + 1);
      return file.replace(/-[0-9a-f]{6,}(?=\.[a-z0-9]+$)/, '').replace(/[\s_]+/g, '-');
    } catch { return u; }
  };
  for (let i = 0; i < located.length; i++) {
    // Pas de photo de repli hors sujet : sans illustration pertinente, on
    // n'en met aucune (une vignette qui ne colle pas casse la crédibilité)
    const img = images[i];
    if (img && !usedCovers.has(coverKey(img.url))) {
      usedCovers.add(coverKey(img.url));
      located[i].coverSrc = img.url;
      located[i].coverCredit = img.credit;
      illustrated++;
      const c = centroidOf(located[i].geometry);
      // coverSrc + coordonnées : le front pose la photo directement sur la carte
      send({ type: 'media-item', title: located[i].title, credit: img.credit, coverSrc: img.url, lat: c.lat, lng: c.lng, generique: Boolean(img.generique) });
    }
  }
  console.log(`[demo-generate] media: ${illustrated}/${located.length} illustrés`);
  step('media', illustrated ? 'done' : 'skip', 'Illustrations trouvées', `${illustrated}/${located.length} projets illustrés (image choisie par l'IA)`);
  // Refuser une photo hors sujet est une décision, pas un échec : on l'affiche
  if (located.length - illustrated > 0) {
    send({ type: 'rejected', kind: 'photo', count: located.length - illustrated });
  }

  state.located = located;
  state.stats.illustrated = illustrated;
  return state;
}

async function coreRedact(send, step, state) {
  step('articles', 'start', 'Rédaction des articles de présentation', 'Un article sourcé par projet, avec les documents officiels');
  let articles = [];
  try {
    // writeArticles ne lit que commune.nom : state.commune suffit
    articles = await writeArticles(state.commune, state.located, state.mairie.pdfs, (title) => send({ type: 'article-item', title }));
  } catch (e) {
    console.error('[demo-generate] articles :', e.message);
  }
  step('articles', articles.length ? 'done' : 'skip', 'Articles rédigés', `${articles.length} article(s) de présentation`);
  state.articles = articles;
  return state;
}

/* Wrappers de phase : chargent le brouillon, exécutent un cœur, sauvegardent,
   annoncent la phase suivante. Chaque invocation reste courte. */

async function saveDraft(ville, insee, communeNom, ipHash, status, state) {
  await insertRows('demo_instances', [{
    ville,
    commune_insee: insee,
    commune_nom: communeNom,
    ip_hash: ipHash,
    status,
    payload: state,
  }]);
}

async function runSources(send, step, insee, ipHash) {
  const state = await coreSources(send, step, insee);
  if (!state) return;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Local : pas de persistance possible, on enchaîne tout dans l'invocation
    const s2 = await coreAi(send, step, state);
    if (!s2) return;
    const s3 = await coreGeo(send, step, s2);
    const s4 = await coreMedia(send, step, s3);
    await coreRedact(send, step, s4);
    // Audit local : DEMO_DUMP=1 déverse les artefacts complets (projets
    // localisés, illustrations retenues, articles rédigés) dans les logs
    // serveur, seule façon de les inspecter sans persistance Supabase.
    if (process.env.DEMO_DUMP) {
      console.log('[demo-dump] ' + JSON.stringify({
        commune: s4.commune,
        mairie: {
          host: s4.mairie?.host,
          logoUrl: s4.mairie?.logoUrl,
          themeColor: s4.mairie?.themeColor,
          pages: s4.mairie?.pages?.map((p) => ({ url: p.url, title: p.title, chars: p.text?.length })),
          pdfs: s4.mairie?.pdfs?.map((p) => p.url),
          imagesCount: s4.mairie?.images?.length,
        },
        stats: { ...s4.stats, tokens_in: _tokens.input, tokens_out: _tokens.output, appels_ia: _tokens.appels },
        located: s4.located,
        articles: s4.articles,
      }));
    }
    send({
      type: 'error',
      message: 'Environnement local sans clé service Supabase : la création de l\'espace est désactivée ici. En production, cette étape fonctionne.',
      debug: 'SUPABASE_SERVICE_ROLE_KEY absente du contexte (netlify dev)',
    });
    return;
  }

  // Communes homonymes : la clé reste lisible, l'INSEE n'est ajouté qu'en cas
  // de collision réelle (Castres du Tarn vs Castres de l'Aisne)
  let ville = `${VILLE_PREFIX}${slugify(state.commune.nom)}`;
  const clash = await getInstance({ ville });
  if (clash && clash.commune_insee !== insee) {
    ville = `${VILLE_PREFIX}${slugify(state.commune.nom)}-${insee.toLowerCase()}`;
  }
  await saveDraft(ville, insee, state.commune.nom, ipHash, 'draft-sources', state);
  send({ type: 'phase', next: 'ai', ville });
}

// Wrapper commun des phases intermediaires : charge le brouillon a l'etat
// attendu, execute le coeur, sauvegarde, annonce la phase suivante. Si le coeur
// renonce (state null : sources insuffisantes en ai), echec definitif propre.
async function runPhase(send, step, ville, { expect, core, nextStatus, nextPhase }) {
  const instance = await getInstance({ ville });
  if (!instance?.payload || instance.status !== expect) {
    send({ type: 'error', message: 'Analyse introuvable : relancez la génération.' });
    return;
  }

  /* Verrou de phase. Rien n'empechait deux appels concurrents sur la meme
     ville d'executer la meme phase en parallele : le client rejoue sur
     coupure, et chaque rejeu repayait l'IA. Le statut passe en transit AVANT
     l'execution, ce qui fait echouer le controle `status !== expect` du second
     appel. Le brouillon est conserve pour permettre une reprise. */
  const enCours = `running-${nextStatus}`;
  await updateInstance(ville, { status: enCours });

  let state;
  try {
    state = cumulerTokens(await core(send, step, instance.payload));
  } catch (e) {
    // On rend la phase rejouable : sans cela l'instance resterait verrouillee
    await updateInstance(ville, { status: expect });
    throw e;
  }
  if (!state) {
    await updateInstance(ville, { status: 'failed', payload: null });
    return;
  }
  await updateInstance(ville, { status: nextStatus, payload: state });
  send({ type: 'phase', next: nextPhase, ville });
}

const runAi = (send, step, ville) => runPhase(send, step, ville, { expect: 'draft-sources', core: coreAi, nextStatus: 'draft-ai', nextPhase: 'locate' });
const runLocate = (send, step, ville) => runPhase(send, step, ville, { expect: 'draft-ai', core: coreGeo, nextStatus: 'draft-locate', nextPhase: 'media' });
const runMedia = (send, step, ville) => runPhase(send, step, ville, { expect: 'draft-locate', core: coreMedia, nextStatus: 'draft-media', nextPhase: 'redact' });
const runRedact = (send, step, ville) => runPhase(send, step, ville, { expect: 'draft-media', core: coreRedact, nextStatus: 'draft', nextPhase: 'create' });

/* ─── Phase CREATE : matérialisation du brouillon (invocation courte) ─── */

async function runCreate(send, step, ville) {
  const createItem = (label) => send({ type: 'create-item', label });
  const t0 = Date.now();

  const instance = await getInstance({ ville });
  if (!instance) {
    send({ type: 'error', message: 'Brouillon introuvable : relancez la génération.' });
    return;
  }
  if (instance.status === 'ready') {
    send({ type: 'done', url: `/?city=${ville}`, ville, communeNom: instance.commune_nom, existing: true });
    return;
  }
  const { commune, mairie, stats, located, articles } = instance.payload || {};
  if (!commune || !located?.length) {
    send({ type: 'error', message: 'Brouillon incomplet : relancez la génération.' });
    return;
  }

  step('create', 'start', `Ouverture de l'espace de ${commune.nom}`);

  // Rejouabilité : une reprise après échec partiel repart d'une base propre
  // (les anciens dossiers d'abord, ils référencent les fiches par FK)
  const previous = await (async () => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/contribution_uploads`);
    url.searchParams.set('select', 'id');
    url.searchParams.set('ville', `eq.${ville}`);
    const r = await fetchWithTimeout(url.toString(), { headers: serviceHeaders() });
    return r.ok ? r.json() : [];
  })();
  if (previous.length) {
    await deleteWhere('consultation_dossiers', { contribution_id: `in.(${previous.map((p) => p.id).join(',')})` });
    await deleteWhere('contribution_uploads', { ville: `eq.${ville}` });
  }
  await deleteWhere('category_icons', { ville: `eq.${ville}` });

  // Illustrations re-hébergées en parallèle (URL stables, pas de hotlink).
  // Slugs déterministes : une reprise réécrit les mêmes fichiers (upsert)
  step('covers', 'start', 'Installation des illustrations');
  const slugs = located.map((p, i) => `${slugify(p.title)}-${i + 1}`);
  const coverUrls = await inChunks(located.map((p, i) => ({ p, i })), 3, async ({ p, i }) => {
    if (!p.coverSrc) return null;
    try {
      const img = await fetchCapped(p.coverSrc, { headers: UA }, FETCH_TIMEOUT_MS, COVER_MAX_BYTES, true);
      if (!img) return null;
      // fetchCapped TRONQUE au plafond au lieu d'abandonner : un PNG de 6,9 Mo
      // ressortait amputé de son dernier tiers, sans marqueur de fin, et
      // s'affichait à moitié vide. Mieux vaut aucune illustration qu'une image
      // coupée en deux sur la fiche.
      const declared = Number(img.headers.get('content-length') || 0);
      if (img.data.byteLength >= COVER_MAX_BYTES || (declared && declared > COVER_MAX_BYTES)) {
        console.warn(`[demo-generate] cover ignorée (trop lourde, ${declared || img.data.byteLength} octets) : ${p.title}`);
        return null;
      }
      const ct = img.headers.get('content-type') || 'image/jpeg';
      // L'extension suit le type réel : tout était nommé .jpg, y compris des PNG
      const ext = /png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp' : /gif/.test(ct) ? 'gif' : 'jpg';
      const url = await uploadToStorage(`demo/${ville}/${slugs[i]}-cover.${ext}`, img.data, ct);
      send({ type: 'cover-item', title: p.title });
      return url;
    } catch { return null; }
  });
  step('covers', 'done', 'Illustrations installées', `${coverUrls.filter(Boolean).length}/${located.length}`);

  step('publish', 'start', 'Publication des fiches');
  // Uploads geojson + markdown par lots (inChunks préserve l'ordre : rows[i] = located[i])
  const rows = await inChunks(located.map((p, i) => ({ p, i })), 5, async ({ p, i }) => {
    const slug = slugs[i];
    const fc = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: p.geometry, properties: { name: p.title } }],
    };
    const geojsonUrl = await uploadToStorage(`demo/${ville}/${slug}.geojson`, JSON.stringify(fc), 'application/json');

    let markdownUrl = null;
    const article = articles.find((a) => a.index === i) || articles[i];
    if (article?.markdown) {
      const credit = p.coverCredit && coverUrls[i] ? `\n\n*Illustration : ${p.coverCredit}.*` : '';
      markdownUrl = await uploadToStorage(
        `demo/${ville}/${slug}.md`,
        new TextEncoder().encode(article.markdown + credit),
        'text/markdown; charset=utf-8'
      );
    }

    createItem(`Fiche publiée : ${p.title}`);
    return {
      ville,
      project_name: p.title,
      category: CATEGORIES[p.category_slug] || 'urbanisme',
      category_slug: p.category_slug,
      slug,
      description: p.description,
      official_url: p.source_url || null,
      geojson_url: geojsonUrl,
      cover_url: coverUrls[i],
      markdown_url: markdownUrl,
      tags: null,
      approved: true,
    };
  });
  const inserted = await insertRows('contribution_uploads', rows, { returning: true }) || [];

  const dossierRows = [];
  for (let i = 0; i < rows.length; i++) {
    const article = articles.find((a) => a.index === i) || articles[i];
    if (!article?.markdown) continue;
    const contribution = inserted.find((c) => c.slug === rows[i].slug);
    for (const pdf of mairie.pdfs || []) {
      if (article.markdown.includes(pdf.url)) {
        dossierRows.push({
          project_name: rows[i].project_name,
          category: rows[i].category,
          title: pdf.label,
          pdf_url: pdf.url,
          contribution_id: contribution?.id || null,
        });
      }
    }
  }
  if (dossierRows.length) {
    await insertRows('consultation_dossiers', dossierRows, { onConflict: 'project_name,pdf_url' });
    createItem(`${dossierRows.length} document(s) officiel(s) rattaché(s) aux fiches`);
  }
  step('publish', 'done', 'Fiches publiées', `${rows.length} projets sur la carte de ${commune.nom}`);

  // Le branding en DERNIER : l'espace ne devient public qu'avec ses fiches
  // (plus jamais d'espace fantôme si l'invocation meurt en route)
  let logoUrl = null;
  if (mairie.logoUrl) {
    try {
      const img = await fetchCapped(mairie.logoUrl, { headers: UA }, FETCH_TIMEOUT_MS, 4500000, true);
      if (img) {
        const ct = img.headers.get('content-type') || 'image/png';
        if (/image|icon|octet/.test(ct)) {
          const ext = ct.includes('svg') ? 'svg' : ct.includes('jpeg') ? 'jpg' : ct.includes('ico') ? 'ico' : 'png';
          logoUrl = await uploadToStorage(`branding/${ville}/logo.${ext}`, img.data, ct);
          createItem('Logo de la mairie installé');
        }
      }
    } catch { /* logo facultatif */ }
  }

  const population = commune.population || 0;
  const zoom = population > 100000 ? 12 : population > 20000 ? 13 : population > 5000 ? 14 : 15;
  await insertRows('city_branding', [{
    ville,
    brand_name: commune.nom,
    logo_url: logoUrl || 'https://openprojets.com/home/img/logos/classic_color.png',
    center_lat: commune.lat,
    center_lng: commune.lng,
    zoom,
    primary_color: mairie.themeColor || '#14AE5C',
    enabled_toggles: ['filters', 'basemap', 'theme', 'search', 'info'],
    travaux: false,
  }]);
  createItem(mairie.themeColor
    ? `Espace créé aux couleurs de ${commune.nom} (${mairie.themeColor})`
    : `Espace ${commune.nom} créé`);
  await insertRows('city_modules', [{
    ville, module_key: 'carte', label: 'Menu', icon_class: 'fas fa-map', sort_order: 0, enabled: true, config: {},
  }], { onConflict: 'ville,module_key' });

  // Catégories complètes : icône Font Awesome + couleur, comme une vraie ville
  const usedSlugs = [...new Set(rows.map((r) => r.category_slug))];
  await insertRows('category_icons', usedSlugs.map((slug, i) => ({
    ville,
    category: CATEGORIES[slug] || slug,
    icon_class: CATEGORY_META[slug]?.icon || 'fa-solid fa-map-pin',
    display_order: i + 1,
    layers_to_display: [],
    category_styles: { color: CATEGORY_META[slug]?.color || '#6366F1' },
  })));
  createItem(`${usedSlugs.length} catégorie(s) créée(s), avec icônes et couleurs`);

  await updateInstance(ville, {
    status: 'ready',
    payload: null,
    projects_count: rows.length,
    duration_ms: Date.now() - t0,
  });
  console.log(`[demo-generate] espace prêt: ${ville} (${rows.length} fiches, ${coverUrls.filter(Boolean).length} illustrées, ${Date.now() - t0}ms)`);
  step('create', 'done', 'Espace prêt', commune.nom);
  send({ type: 'done', url: `/?city=${ville}`, ville, communeNom: commune.nom, projectsCount: rows.length, stats });
}

/* ─── Handler SSE ─── */

export default async (req, context) => {
  const url = new URL(req.url);
  const phase = url.searchParams.get('phase') || 'analyse';
  const insee = (url.searchParams.get('commune') || '').toUpperCase();
  const villeParam = url.searchParams.get('ville') || '';

  if (phase === 'analyse' && !/^\d{2}[0-9AB]\d{2}$/.test(insee)) {
    return new Response(JSON.stringify({ error: 'Paramètre commune invalide (code INSEE attendu)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://openprojets.com' },
    });
  }
  if (phase !== 'analyse' && !/^essai-[a-z0-9-]+$/.test(villeParam)) {
    return new Response(JSON.stringify({ error: 'Paramètre ville invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://openprojets.com' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        // Toute erreur envoyee au client est aussi tracee serveur : plus aucun
        // echec silencieux (meme ceux qui ne passent pas par le catch)
        if (obj.type === 'error') {
          console.warn(`[demo-generate] ERREUR envoyee (${obj.retryable ? 'retry' : 'definitive'}) :: ${obj.message}${obj.debug ? ' :: ' + obj.debug : ''}`);
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const step = (id, status, label, detail = '') => send({ type: 'step', id, status, label, detail });
      const t0 = Date.now();
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping ${Date.now() - t0}\n\n`)); } catch { /* flux fermé */ }
      }, 5000);

      console.log(`[demo-generate] >>> phase=${phase} cible=${villeParam || insee}`);
      try {
        // Le plafond quotidien ne gardait que la premiere phase. Les cinq
        // suivantes, qui portent l'essentiel du cout IA, etaient appelables sans
        // aucune borne : il suffisait d'un `ville` valide pour les rejouer.
        if (phase !== 'analyse') {
          const global = await countToday(null, null);
          if (global >= MAX_GLOBAL_PER_DAY * 2) {
            send({ type: 'error', message: 'Le quota de démonstrations du jour est atteint. Contactez-nous pour une démo guidée.' });
            clearInterval(heartbeat);
            controller.close();
            return;
          }
        }
        if (phase === 'ai') {
          await runAi(send, step, villeParam);
        } else if (phase === 'locate') {
          await runLocate(send, step, villeParam);
        } else if (phase === 'media') {
          await runMedia(send, step, villeParam);
        } else if (phase === 'redact') {
          await runRedact(send, step, villeParam);
        } else if (phase === 'create') {
          await runCreate(send, step, villeParam);
        } else {
          // Idempotence / reprise :
          //  - carte prête -> on la montre (on n'y touche plus : sécurité clients)
          //  - brouillon RÉCENT (< 15 min, génération en cours) -> reprise
          //  - échec, ou brouillon ancien/abandonné -> on repart de ZÉRO (aucun
          //    verrou : une commune non terminée doit toujours être relançable)
          const already = await getInstance({ commune_insee: insee });
          const RESUME = { 'draft-sources': 'ai', 'draft-ai': 'locate', 'draft-locate': 'media', 'draft-media': 'redact', 'draft': 'create' };
          // Une phase interrompue en plein vol laisse un statut de transit
          // (verrou de runPhase). On la rejoue depuis son etat d'entree.
          const REPRISE_TRANSIT = {
            'running-draft-ai': ['draft-sources', 'ai'],
            'running-draft-locate': ['draft-ai', 'locate'],
            'running-draft-media': ['draft-locate', 'media'],
            'running-draft': ['draft-media', 'redact'],
          };
          const ageMin = already ? (Date.now() - new Date(already.created_at).getTime()) / 60000 : Infinity;
          if (already && REPRISE_TRANSIT[already.status] && ageMin < 15) {
            const [etat] = REPRISE_TRANSIT[already.status];
            await updateInstance(already.ville, { status: etat });
            already.status = etat;
          }

          if (already?.status === 'ready') {
            step('resolve', 'done', 'Commune reconnue', already.commune_nom);
            step('exists', 'done', 'Espace déjà généré', 'On vous y emmène');
            send({ type: 'done', url: `/?city=${already.ville}`, ville: already.ville, communeNom: already.commune_nom, existing: true });
          } else if (already && RESUME[already.status] && ageMin < 15) {
            step('resolve', 'done', 'Commune reconnue', already.commune_nom);
            step('exists', 'done', 'Analyse déjà engagée', 'Reprise là où elle s\'était arrêtée');
            send({ type: 'phase', next: RESUME[already.status], ville: already.ville });
          } else {
            // Échec ou brouillon abandonné : on efface pour repartir proprement
            if (already) {
              console.log(`[demo-generate] redémarrage de zéro pour ${insee} (ancien statut ${already.status}, ${Math.round(ageMin)} min)`);
              await deleteWhere('demo_instances', { ville: `eq.${already.ville}` });
            }
            const ipHash = (await sha256Hex(context?.ip || 'inconnu')).slice(0, 24);
            const kioskOk = process.env.DEMO_KIOSK_KEY
              && url.searchParams.get('k') === process.env.DEMO_KIOSK_KEY;
            const [byIp, global] = await Promise.all([countToday('ip_hash', ipHash), countToday(null, null)]);
            if (global >= MAX_GLOBAL_PER_DAY || (!kioskOk && byIp >= MAX_PER_IP_PER_DAY)) {
              send({ type: 'error', message: 'Le quota de démonstrations du jour est atteint. Contactez-nous pour une démo guidée.' });
            } else {
              await runSources(send, step, insee, ipHash);
            }
          }
        }
      } catch (err) {
        console.error(`[demo-generate] ERREUR phase=${phase} cible=${villeParam || insee} ::`, err?.stack || err?.message || err);
        // Anti-boucle : au-dela de MAX_PHASE_ATTEMPTS echecs sur une meme phase,
        // on declare l'instance en echec pour ne plus la relancer indefiniment
        let retryable = true;
        if (villeParam) {
          try {
            // Compteur PAR PHASE : deux erreurs transitoires sur des phases
            // differentes ne doivent pas s'additionner pour tuer la generation
            const key = `_attempts_${phase}`;
            const inst = await getInstance({ ville: villeParam });
            const attempts = ((inst?.payload && inst.payload[key]) || 0) + 1;
            console.warn(`[demo-generate] echec phase=${phase} tentative ${attempts}/${MAX_PHASE_ATTEMPTS} sur ${villeParam}`);
            if (attempts >= MAX_PHASE_ATTEMPTS) {
              // Echec transitoire repete (429, reseau...) : on arrete la boucle de
              // reprise pour cette session SANS verrouiller la commune (pas de
              // status 'failed') ; compteur remis a zero pour un futur essai.
              // Le verrou 7 jours reste reserve aux sources insuffisantes (runPhase).
              if (inst?.payload) await updateInstance(villeParam, { payload: { ...inst.payload, [key]: 0 } });
              retryable = false;
              console.error(`[demo-generate] ${villeParam} : arret des reprises apres ${attempts} echecs sur phase=${phase} (commune NON verrouillee)`);
            } else if (inst?.payload) {
              await updateInstance(villeParam, { payload: { ...inst.payload, [key]: attempts } });
            }
          } catch (e2) {
            console.error('[demo-generate] anti-boucle KO ::', e2?.message);
          }
        }
        send({
          type: 'error',
          message: retryable
            ? 'Un imprévu est survenu pendant la génération. Nouvelle tentative...'
            : "La génération n'a pas pu aboutir pour cette commune. Réessayez plus tard, ou passez nous voir pour une démo guidée.",
          retryable,
          // Motif technique court (visible en console pour comprendre l'echec)
          debug: `phase=${phase} :: ${String(err?.message || err).slice(0, 200)}`,
        });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* déjà fermé */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://openprojets.com',
    },
  });
};

export const config = { path: '/api/demo-generate' };
