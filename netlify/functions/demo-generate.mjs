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

// Code INSEE d'une commune : 5 caracteres. Metropole (69244), Corse (2A004,
// 2B033), outre-mer (97411, 98801). La lettre corse est en 2e position.
const INSEE_RE = /^(?:\d{2}|2[AB])\d{3}$/i;

const VILLE_PREFIX = 'essai-';
const MAX_PER_IP_PER_DAY = 15;
const MAX_GLOBAL_PER_DAY = 80;
const MAX_PHASE_ATTEMPTS = 2; // au-dela, la phase est declaree en echec (anti-boucle)
/* Profondeur de collecte sur le site de la mairie.
   La mesure d'origine (« passer de 5 a 24 pages ne rend zero projet de plus »)
   portait sur un crawl NON CLASSE, qui remoissonnait la navigation. Depuis que
   les liens sont tries par force de signal, les pages supplementaires sont des
   pages de fond, pas du menu.
   Le plafond est desormais large, parce que le vrai probleme mesure etait
   inverse : Bordeaux rendait 7 fiches et Montpellier 5, la ou une metropole a
   des dizaines d'operations. Le cout IA, lui, ne suit pas : le paquet envoye au
   modele reste borne par BUNDLE_MAX_CHARS, seule la duree reseau augmente. */
const MAIRIE_PAGES = 30;
// Pages filles, tirees uniquement des sommaires de projets (voir le second
// niveau de crawl dans inspectMairieSite)
const MAIRIE_PAGES_ENFANTS = 26;
const PAGE_TEXT_CHARS = 5000;
// Texte conserve AVANT le retrait du gabarit : il faut voir la page entiere
// pour reconnaitre ce qui s'y repete d'une page a l'autre. La troncature a
// PAGE_TEXT_CHARS n'intervient qu'ensuite, sur du contenu reel.
// Mesure sur un panel de 18 communes : une page de mairie rend 5 000 a 7 000
// caracteres de texte. 20 000 couvre tres largement, sans faire enfler le
// calcul de gabarit, qui indexe des enchainements de mots page par page.
const PAGE_TEXT_BRUT_CHARS = 20000;
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
      /* Plus de plafond de fait. 12 puis 18 bridaient le rappel exactement la
         ou le prospect est le plus gros : sur les 22 communes generees avant ce
         changement, Bordeaux rendait 7 fiches et Montpellier 5. Ce n'est pas la
         preuve qui manquait, c'est la place.
         60 n'est plus un arbitrage produit mais une simple butee de securite
         contre une reponse aberrante : aucune commune francaise n'a 60
         operations attestees simultanement dans ses sources publiques. */
      maxItems: 60,
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

// Schémas des appels vision (courts). Le schéma du logo est défini avec son
// appel, plus bas : il rend désormais le choix du logo ET sa couleur.
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
// Le point final est autorise en DNS : `localhost.` resout comme `localhost`,
// et `intranet.local.` comme `intranet.local`. Sans le `\.?` chaque motif
// d'hote se contournait en ajoutant un point.
const PRIVATE_HOST_RE = /^(localhost\.?$|.*\.local\.?$|.*\.internal\.?$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|\[?::1|\[?::$|\[?::ffff:|\[?f[cd][0-9a-f]{2}:|\[?fe[89ab][0-9a-f]:)/i;
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


// Réplique de la fonction Postgres public.slugify (source de vérité pour la colonne
// `slug`). Copie assumée : ce runtime Node ne peut pas importer modules/security-utils.js.
// Toute évolution doit être répercutée aux deux endroits.
function slugify(str) {
  return String(str || '')
    // Ligatures : NFD ne les décompose pas, unaccent() si (Cœur -> Coeur)
    .replace(/[\u0153\u0152]/g, 'oe')
    .replace(/[\u00e6\u00c6]/g, 'ae')
    .replace(/\u00df/g, 'ss')
    .replace(/[\u00f8\u00d8]/g, 'o')
    .replace(/[\u0142\u0141]/g, 'l')
    .replace(/[\u0111\u0110\u00f0\u00d0]/g, 'd')
    .replace(/[\u00fe\u00de]/g, 'th')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

/* Etendue d'une geometrie, en kilometres (largeur, hauteur).
   Sert a refuser une emprise trop vaste pour designer un projet : la requete
   « Vannes, Vannes » rend a Nominatim le CONTOUR ADMINISTRATIF de la commune,
   9,9 x 8,2 km, qui passait tous les controles precedents (son nom contient
   celui de la commune, et il tient forcement dans sa propre boite). Un projet
   etale sur toute sa commune ne dit rien a personne. */
function geometryExtentKm(geometry) {
  let minLng = Infinity; let minLat = Infinity; let maxLng = -Infinity; let maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      minLng = Math.min(minLng, coords[0]); maxLng = Math.max(maxLng, coords[0]);
      minLat = Math.min(minLat, coords[1]); maxLat = Math.max(maxLat, coords[1]);
    } else coords.forEach(walk);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  if (!isFinite(minLng)) return { w: 0, h: 0 };
  const midLat = (minLat + maxLat) / 2;
  return {
    w: (maxLng - minLng) * 111.32 * Math.cos((midLat * Math.PI) / 180),
    h: (maxLat - minLat) * 111.32,
  };
}

// Une emprise de projet credible ne depasse pas ce gabarit, ni cette part de
// l'etendue de la commune. Au-dela, ce n'est plus un projet : c'est un secteur.
const PROJECT_MAX_EXTENT_KM = 1.6;
const PROJECT_MAX_SHARE = 0.30;

function extentAcceptable(geometry, bbox) {
  const e = geometryExtentKm(geometry);
  if (e.w > PROJECT_MAX_EXTENT_KM || e.h > PROJECT_MAX_EXTENT_KM) return false;
  if (bbox) {
    const c = geometryExtentKm({ coordinates: [[[bbox.minLng, bbox.minLat], [bbox.maxLng, bbox.maxLat]]] });
    if (c.w && e.w / c.w > PROJECT_MAX_SHARE) return false;
    if (c.h && e.h / c.h > PROJECT_MAX_SHARE) return false;
  }
  return true;
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

// Adresse postale de la mairie dans l'annuaire officiel : le champ `adresse`
// porte ses coordonnees, seule position VRAIE de l'hotel de ville dont on
// dispose sans geocodage supplementaire.
function positionDeLAdresse(rec) {
  let bloc = rec?.adresse;
  if (typeof bloc === 'string') { try { bloc = JSON.parse(bloc); } catch { return null; } }
  const a = Array.isArray(bloc) ? bloc[0] : bloc;
  const lat = Number(a?.latitude);
  const lng = Number(a?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, libelle: [a.numero_voie, a.code_postal, a.nom_commune].filter(Boolean).join(', ') };
}

/* L'annuaire officiel se trompe parfois de coordonnees.
   Mesure sur Gex (01173) : le champ `adresse` porte le bon libelle, « 77 rue
   de l'Horloge, 01170, Gex », et la position 45.696793 / 4.885262, qui est
   celle de la mairie de VENISSIEUX, a 300 km de la. Le radar de l'ecran
   partait donc a l'autre bout de la France devant le prospect.
   La commune a un contour officiel : une position hors de ce contour n'est pas
   celle de sa mairie, quel que soit ce qu'affirme la fiche. */
function positionDansLaCommune(position, bbox) {
  if (!position) return false;
  if (!bbox) return true;
  return geometryInBbox({ type: 'Point', coordinates: [position.lng, position.lat] }, bbox);
}

/* Site ET position de la mairie, en une seule interrogation de l'annuaire.
   La position sert au radar de l'ecran : il pulsait jusqu'ici sur le centre
   GEOMETRIQUE de la commune, qui tombe reguliairement dans un champ ou une
   foret. Un elu qui voit le balayage partir de sa mairie comprend tout de
   suite d'ou on part ; un point au milieu de nulle part ne dit rien. */
async function findMairie(insee, bbox = null) {
  const vide = { site: null, position: null };
  try {
    const url = new URL('https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records');
    url.searchParams.set('where', `pivot LIKE "mairie" AND code_insee_commune = "${insee}"`);
    url.searchParams.set('limit', '3');
    const r = await fetchWithTimeout(url.toString());
    if (!r.ok) return vide;
    const data = await r.json();
    const records = data.results || [];
    /* La position est prise sur le PREMIER enregistrement qui en porte une ET
       qui tombe dans la commune, meme si c'est un autre que celui qui porte le
       site internet. Une fiche dont les coordonnees designent une autre commune
       est ecartee : mieux vaut aucun ancrage, le radar reste alors sur le
       centre communal, qu'un radar qui balaye a 300 km. */
    const positions = records.map(positionDeLAdresse).filter(Boolean);
    const position = positions.find((p) => positionDansLaCommune(p, bbox)) || null;
    if (!position && positions.length) {
      console.warn(`[demo-generate] annuaire ${insee} : position hors commune ecartee (${positions[0].lat}, ${positions[0].lng}) pour « ${positions[0].libelle} »`);
    }
    for (const rec of records) {
      const raw = rec.site_internet;
      if (!raw) continue;
      let site = null;
      try {
        const parsed = JSON.parse(raw);
        site = Array.isArray(parsed) ? parsed[0]?.valeur : parsed?.valeur;
      } catch {
        if (typeof raw === 'string' && raw.includes('.')) site = raw;
      }
      if (site) return { site: site.startsWith('http') ? site : `https://${site}`, position };
    }
    return { site: null, position };
  } catch {
    return vide; // annuaire indisponible : etape sautee
  }
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
    // Caracteres de controle, designes par leur categorie Unicode. Ecrits en
    // clair dans une classe de caracteres, ils faisaient passer TOUT le fichier
    // pour un binaire : grep et ripgrep n'y trouvaient plus rien.
    .replace(/\p{Cc}/gu, ' ')
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

/* Page-tremplin d'une protection anti-robot.

   Quelques sites de communes ne servent pas leur contenu : ils renvoient une
   page minuscule qui deplace le navigateur par script vers une adresse a jeton,
   en posant un cookie, puis exigent ce cookie - renouvele a chaque saut - pour
   rendre la vraie page. Sans cookie : « 403 Attack detected ».

   On NE FRANCHIT PAS ce controle. Il faudrait reproduire le bocal a cookies
   d'un navigateur dans le seul but de passer un garde-barriere que la
   collectivite a delibarement installe, et son robots.txt - le seul endroit ou
   elle dirait ce qu'elle autorise - est lui-meme derriere ce garde-barriere.
   Mesure sur 160 communes (80 plus grandes, 80 moyennes) : 2 sites concernes.

   Ce qu'on fait, en revanche : le DIRE. Sans cela, la commune remonte une carte
   maigre et personne ne sait pourquoi. */
const TREMPLIN_RE = /(?:window\.)?location(?:\.href)?\s*=\s*['"][^'"]{1,300}['"]/i;

function estPageTremplin(html) {
  const h = String(html || '');
  return h.length < 3000
    && TREMPLIN_RE.test(h)
    && !/<(article|main|nav|ul|section)\b/i.test(h);
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

/* Collecte des pages du site de la mairie.
   Niveau 1 : les pages de l'accueil. Niveau 2 : les pages filles des sommaires.
   Dans les deux cas, c'est un appel IA qui choisit quoi ouvrir.

   AUCUN FILTRE PAR MOT-CLE ICI, ET IL NE FAUT PAS EN REINTRODUIRE.
   La selection reposait sur une liste de mots (« projet », « travaux »,
   « urbanisme »...), un bareme de points et une liste de penalites. Un
   vocabulaire fige ne peut pas predire ce que contient une page : la mairie de
   Conflans publiait « Les pistes de padel debarquent en ville », qui ne
   contient aucun de ces mots, et cette page portait la seule phrase donnant le
   lieu de l'operation (« au stade Claude-Fichot, derriere les courts de tennis
   couverts »). Elle etait ecartee trois fois : absente du motif d'entree,
   penalisee au bareme parce que son adresse contient « actualites », et
   rejetee par le filet de rattrapage qui reprenait la meme liste. Resultat :
   une punaise posee a un kilometre du vrai site.

   Chaque mot ajoute a une telle liste deplace le probleme sans le resoudre.
   Le choix des pages a ouvrir est donc rendu a un appel IA court. */
const LIEN_LABEL_MAX = 80;

/* Extrait les liens internes d'une page, sans aucun jugement sur leur contenu,
   en evitant les doublons avec ce qui est deja connu (`known`).

   Le libellé était borné à 120 caractères DANS LE MOTIF, ce qui ne tronquait
   pas le libellé : cela faisait échouer le motif entier dès qu'un lien
   contenait du balisage imbriqué (icône, span, image). Mesure sur le site de
   Bourgoin-Jallieu : 108 liens sur 169 étaient perdus, dont la rubrique
   « Les grands projets » qui regroupe TOUT le contenu utile de la commune.
   La borne est désormais large et la troncature se fait après coup.
   Les ancres sont acceptées et coupées : `page.html#section` désigne bien une
   page, et l'ancien motif rejetait toute adresse en contenant une. */
function collectPageLinks(html, baseUrl, host, outLinks, known = []) {
  const aRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,3000}?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html)) !== null && outLinks.length < 250) {
    const href = m[1].split('#')[0];
    if (!href) continue;
    const label = stripHtml(m[2]).trim();
    // Un intitule vide ou d'un seul mot court est une fleche de pagination ou
    // un « lire la suite » : il ne designe rien pour qui doit choisir.
    if (label.length < 4) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.host !== host) continue;
      if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)$/i.test(abs.pathname)) continue;
      abs.hash = '';
      const u = abs.toString();
      if (u === baseUrl) continue;
      if (outLinks.some((l) => l.url === u) || known.some((l) => l.url === u)) continue;
      outLinks.push({ url: u, label: label.slice(0, LIEN_LABEL_MAX) || abs.pathname });
    } catch { /* href invalide */ }
  }
}

/* ─── Retrait du gabarit du site (menus, bandeaux, pieds de page) ───────────

   `stripHtml` ne retire que <nav> et <footer>. Les CMS de mairie construisent
   massivement leurs menus en <div class="menu"> et <ul>, qui survivaient donc
   au nettoyage. Comme le texte est ensuite coupe aux PREMIERS caracteres,
   l'IA recevait surtout de la navigation. Mesure sur Bourgoin-Jallieu : les
   900 premiers caracteres de la page « Travaux » etaient integralement du menu,
   et la liste reelle des chantiers arrivait apres.

   Methode deterministe, sans dependance et sans appel IA : un enchainement de
   MOTS_GABARIT mots present sur la majorite des pages d'un meme site n'est pas
   du contenu, c'est le gabarit. Mesure sur ce meme site : la page « Travaux »
   passe de 5 159 caracteres de menu a 2 429 caracteres qui sont la vraie liste
   des chantiers avec leurs dates. */
const MOTS_GABARIT = 8;

function retirerLeGabarit(textes) {
  if (textes.length < 2) return textes;
  const seuil = Math.max(2, Math.ceil(textes.length * 0.6));
  const motsParPage = textes.map((t) => String(t || '').split(' '));
  const compte = new Map();
  for (const mots of motsParPage) {
    const vus = new Set();
    for (let i = 0; i + MOTS_GABARIT <= mots.length; i++) {
      const cle = mots.slice(i, i + MOTS_GABARIT).join(' ');
      if (vus.has(cle)) continue;
      vus.add(cle);
      compte.set(cle, (compte.get(cle) || 0) + 1);
    }
  }
  return motsParPage.map((mots) => {
    const aRetirer = new Uint8Array(mots.length);
    for (let i = 0; i + MOTS_GABARIT <= mots.length; i++) {
      const cle = mots.slice(i, i + MOTS_GABARIT).join(' ');
      if ((compte.get(cle) || 0) >= seuil) aRetirer.fill(1, i, i + MOTS_GABARIT);
    }
    const net = mots.filter((_, i) => !aRetirer[i]).join(' ').replace(/\s+/g, ' ').trim();
    // Garde-fou : si le retrait vide la page, c'est que le calcul s'est trompe
    // (deux pages quasi identiques). On rend alors le texte d'origine.
    return net.length >= 200 ? net : mots.join(' ');
  });
}

/* Toutes les adresses internes d'une page, sans filtre de mot-cle.
   Sert a etablir la NAVIGATION du site depuis l'accueil : ce qui figure sur
   l'accueil est du menu, ce qui n'apparait que sur une page de sommaire est son
   contenu propre. */
function collectAllInternalLinks(html, baseUrl, host, out) {
  const aRe = /<a[^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = aRe.exec(html)) !== null && out.size < 400) {
    const href = m[1].split('#')[0];
    if (!href) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.host !== host) continue;
      abs.hash = '';
      out.add(abs.toString());
    } catch { /* href invalide */ }
  }
  return out;
}

/* Le SITEMAP du site, quand il existe.

   Amorcer le crawl sur l'accueil revient a ne voir que le present. Mesure sur
   Conflans : l'accueil expose 95 liens, aucun ne mene a l'article des pistes de
   padel, qui portait pourtant la seule phrase donnant le lieu de l'operation.
   L'article n'etait pas non plus sur les trois premieres pages du fil
   d'actualites, qui en liste dix par page. Il aurait fallu paginer a l'aveugle.
   Le sitemap du meme site rend 280 actualites et 90 pages en deux requetes, et
   l'article y figure avec sa date de derniere modification. */
const SITEMAP_CHEMINS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];
const SITEMAP_SOUS_MAX = 6;
const SITEMAP_URLS_MAX = 400;
const SITEMAP_MAX_BYTES = 3000000;

// Entrees d'un sitemap ou d'un index de sitemaps : {url, lastmod}
function lireSitemap(xml) {
  const out = [];
  // Le decoupage par balise fermante evite qu'un <lastmod> soit rattache a
  // l'entree suivante, ce qu'un motif unique sur tout le document ferait.
  for (const bloc of String(xml || '').split(/<\/(?:url|sitemap)>/i)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(bloc)?.[1];
    if (!loc) continue;
    out.push({
      url: loc.replace(/&amp;/g, '&'),
      lastmod: /<lastmod>\s*([^<\s]+)/i.exec(bloc)?.[1] || '',
    });
    if (out.length >= 3000) break;
  }
  return out;
}

const estUnSitemap = (u) => /\.xml(\?|$)/i.test(u);

async function fetchSitemapUrls(baseUrl) {
  for (const chemin of SITEMAP_CHEMINS) {
    let r;
    try {
      r = await fetchCapped(new URL(chemin, baseUrl).toString(), { headers: UA }, 12000, SITEMAP_MAX_BYTES);
    } catch { continue; }
    if (!r) continue;
    const entrees = lireSitemap(r.data);
    if (!entrees.length) continue;

    // Index de sitemaps : les entrees pointent vers d'autres fichiers .xml
    const sous = entrees.filter((e) => estUnSitemap(e.url)).slice(0, SITEMAP_SOUS_MAX);
    if (sous.length) {
      const lots = await inChunks(sous, 3, async (s) => {
        const rr = await fetchCapped(s.url, { headers: UA }, 12000, SITEMAP_MAX_BYTES);
        return rr ? lireSitemap(rr.data) : [];
      });
      const toutes = lots.flat().filter((e) => !estUnSitemap(e.url));
      if (toutes.length) return toutes;
    }
    const directes = entrees.filter((e) => !estUnSitemap(e.url));
    if (directes.length) return directes;
  }
  return [];
}

// Intitule lisible tire du dernier segment d'une adresse : le slug d'un CMS est
// une phrase (« les-pistes-de-padel-debarquent-en-ville »), pas un identifiant.
function libelleDuChemin(u) {
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim().slice(0, LIEN_LABEL_MAX);
  } catch { return ''; }
}

/* Choix des pages a ouvrir, confie a l'IA.

   Un appel court par niveau de crawl : la liste des liens (intitule + chemin),
   et l'IA rend les index a ouvrir, du plus prometteur au moins prometteur.
   Elle lit un intitule comme un humain le lit, ce qu'aucune liste de mots ne
   sait faire : « Les pistes de padel debarquent en ville » est evidemment une
   operation d'amenagement, « Inscriptions cantine » evidemment pas.

   Environ 3 000 tokens en entree pour 200 liens, une centaine en sortie. La
   latence est absorbee : cette branche attend de toute facon la presse et les
   marches publics, qui tournent en parallele. */
const LIENS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ouvrir: {
      type: 'array',
      maxItems: 40,
      description: "Index des pages à ouvrir, de la plus prometteuse à la moins prometteuse. Tableau vide si aucune page du lot ne peut décrire une opération.",
      items: { type: 'integer' },
    },
  },
  required: ['ouvrir'],
};

/* Un modele a qui l'on soumet 500 lignes d'un coup et qui doit en rendre 30
   rate les entrees du milieu, quel que soit leur interet. Mesure sur Conflans :
   sur les 495 candidats en un seul appel, l'article des pistes de padel n'est
   pas retenu ; sur le lot de 120 qui le contient, il l'est, en troisieme
   position sur trois. Le decoupage n'est pas une optimisation de cout, c'est ce
   qui rend le rappel utilisable. */
const LIENS_LOT_MAX = 120;

async function choisirLiensParIa(liens, communeNom, max, contexte) {
  if (!liens.length) return [];
  if (liens.length <= LIENS_LOT_MAX) return choisirDansUnLot(liens, communeNom, max, contexte);

  const lots = [];
  for (let i = 0; i < liens.length; i += LIENS_LOT_MAX) lots.push(liens.slice(i, i + LIENS_LOT_MAX));
  const parLot = await inChunks(lots, 4, (lot) => choisirDansUnLot(lot, communeNom, max, contexte));

  /* Fusion en tourniquet : le premier choix de chaque lot, puis le deuxieme de
     chacun, et ainsi de suite. Aucun lot ne peut monopoliser les places, et
     l'ordre de sortie reflete le rang attribue par l'IA dans son propre lot.
     Cet ordre compte au-dela du crawl : le paquet envoye a l'extraction est
     plafonne, et les dernieres pages lues en sont ecartees. */
  const out = [];
  const vus = new Set();
  for (let rang = 0; out.length < max; rang++) {
    let ajout = false;
    for (const choix of parLot) {
      const l = choix?.[rang];
      if (!l || vus.has(l.url)) continue;
      vus.add(l.url);
      out.push(l);
      ajout = true;
      if (out.length >= max) break;
    }
    if (!ajout) break;
  }
  console.log(`[demo-generate] liens : ${out.length} page(s) retenue(s) sur ${liens.length} par l'IA (${lots.length} lots)`);
  return out;
}

/* Classement de REPLI, quand l'IA n'est pas joignable. Purement structurel :
   aucun vocabulaire, seulement la forme de l'adresse et de l'intitule.

   Prendre les liens dans l'ordre du document ouvrait le menu, « Annuaires »
   en tete (mesure sur Conflans, en local sans acces au modele). Une page de
   CONTENU a un chemin plus profond qu'une rubrique de premier niveau, et un
   intitule redige plutot qu'un mot unique. Ce n'est pas un jugement sur le
   sujet de la page, c'est une observation sur sa place dans le site. */
function rangStructurel(lien) {
  let score = 0;
  try {
    const segments = new URL(lien.url).pathname.split('/').filter(Boolean);
    score += Math.min(segments.length, 4) * 10;
  } catch { /* url deja validee a la collecte */ }
  score += Math.min(String(lien.label || '').trim().split(/\s+/).length, 8);
  return score;
}

async function choisirDansUnLot(liens, communeNom, max, contexte) {
  const repliStructurel = () => [...liens]
    .sort((a, b) => rangStructurel(b) - rangStructurel(a))
    .slice(0, max);
  try {
    const system = `Tu prépares le recensement des opérations d'aménagement de la commune de ${communeNom} à partir de son site officiel. ${contexte}

Retiens les pages susceptibles de DÉCRIRE ou de LISTER une opération qui transforme physiquement le territoire : construction, réhabilitation, requalification d'espace public, équipement, voirie, logement, aménagement paysager. Une actualité municipale qui annonce un chantier ou l'ouverture d'un équipement compte autant qu'une rubrique « Grands projets » : c'est souvent elle qui donne le lieu exact.

Écarte les pages de service et de vie quotidienne : démarches administratives, état civil, inscriptions, menus, agenda culturel, contacts, annuaire, recrutement, mentions légales, comptes rendus de conseil municipal.

Juge sur l'intitulé et le chemin, pas sur la présence d'un mot particulier. Au plus ${max} index, les plus prometteurs d'abord. Dans le doute sur une page qui pourrait décrire une opération, retiens-la : une page inutile coûte peu, une page manquée fait disparaître un projet de la carte.`;
    const user = JSON.stringify(
      liens.map((l, i) => ({ index: i, intitule: l.label, chemin: cheminDe(l.url) })),
      null, 0
    );
    const out = await openAIStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      'liens_a_ouvrir', LIENS_SCHEMA, 600, 40000, 0.1
    );
    const choisis = [...new Set(out.ouvrir || [])]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < liens.length)
      .slice(0, max)
      .map((i) => liens[i]);
    // Une reponse vide n'est pas un verdict exploitable : sur un site dont tous
    // les intitules sont opaques, mieux vaut ouvrir des pages au hasard que de
    // rendre une commune sans aucune source.
    if (!choisis.length) return repliStructurel();
    console.log(`[demo-generate] liens : ${choisis.length} page(s) retenue(s) sur ${liens.length} par l'IA`);
    return choisis;
  } catch (e) {
    console.warn(`[demo-generate] choix des liens indisponible, repli sur l'ordre du document :: ${e?.message}`);
    return repliStructurel();
  }
}

// Chemin lisible d'une adresse, pour donner a l'IA la structure du site sans
// lui faire payer le domaine repete a chaque ligne
function cheminDe(u) {
  try { return new URL(u).pathname; } catch { return u; }
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
    // Texte COMPLET a ce stade : la troncature n'intervient qu'apres le retrait
    // du gabarit, sinon on couperait dans le menu et pas dans le contenu.
    return { link, page, text: stripHtml(page.data).slice(0, PAGE_TEXT_BRUT_CHARS) };
  });
  for (const sp of fetched) {
    if (!sp) continue;
    collectPdfLinks(sp.page.data, sp.page.url, out.pdfs);
    collectImages(sp.page.data, sp.page.url, out.images);
    /* Une page servie en coquille JavaScript n'a pas de contenu : sans ce
       test, du code se retrouvait présenté à l'IA comme le texte d'une source
       officielle. Le garde-fou existait pour les articles de presse, qui ne
       sont plus téléchargés ; le risque, lui, subsiste sur les CMS de mairie. */
    if (sp.text.length > 400 && !looksLikeCode(sp.text) && !out.urls.includes(sp.link.url)) {
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
  /* Le scoring texte ne TRANCHE plus, il PRESELECTIONNE : il rend les meilleurs
     candidats, et c'est un appel de vision qui choisit ensuite. Une liste de
     mots relevés commune par commune (« active », « sportive », « magazine »)
     ne peut structurellement pas voir qu'un logo est en version blanche, donc
     invisible sur l'interface, ni qu'un fichier nommé « logo-ville-durable.png »
     est le logo d'un label et pas celui de la commune. Un modèle qui REGARDE
     l'image le voit. Le scoring reste indispensable en repli, car la vision
     rejette les .svg, très fréquents sur les sites de mairie. */
  hits.sort((a, b) => b.score - a.score);
  const retenus = [];
  for (const hit of hits) {
    if (hit.score < 40 || retenus.length >= 4) break;
    try {
      const abs = new URL(hit.src, baseUrl).toString();
      if (!retenus.includes(abs)) retenus.push(abs);
    } catch { /* url invalide */ }
  }
  return retenus;
}

async function inspectMairieSite(siteUrl, communeNom, onFinding) {
  const out = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [], images: [], bloque: false };
  const home = await fetchCapped(siteUrl, { headers: UA }, FETCH_TIMEOUT_MS, 500000);
  if (!home) return out;
  /* Le site renvoie une page-tremplin au lieu de son contenu : inutile
     d'insister, mais il faut le dire. Sans ce constat explicite, la commune
     rendait une carte maigre et rien n'indiquait que sa source principale
     n'avait jamais ete lisible. */
  if (estPageTremplin(home.data)) {
    out.host = new URL(home.url).host;
    out.bloque = true;
    console.warn(`[demo-generate] ${out.host} : lecture automatique bloquee (page-tremplin anti-robot), site de la commune ignore`);
    return out;
  }
  const finalUrl = new URL(home.url);
  out.host = finalUrl.host;
  out.urls.push(home.url);
  const html = home.data;
  // Texte complet ici aussi : le retrait du gabarit, en fin de collecte, a
  // besoin de l'accueil pour reconnaitre le menu commun a tout le site.
  out.pages.push({ url: home.url, title: 'Accueil du site de la mairie', text: stripHtml(html).slice(0, PAGE_TEXT_BRUT_CHARS) });
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

  const logoCandidats = findSiteLogo(html, finalUrl);
  const icone = new URL(iconCandidates[0]?.href || '/favicon.ico', finalUrl).toString();
  // L'icône du site ferme la liste : c'est le repli quand aucun logo n'est
  // reconnaissable, et c'est au moins la marque de la commune.
  if (!logoCandidats.includes(icone)) logoCandidats.push(icone);
  out.logoCandidats = logoCandidats;
  out.logoUrl = logoCandidats[0];
  // Le finding logo est émis par coreSources, une fois que la vision a tranché
  // entre les candidats et donné la couleur de la commune

  /* La NAVIGATION du site, relevee sur l'accueil : toutes ses adresses
     internes, sans filtre. Elle sert ensuite a distinguer, sur une page de
     sommaire, ses entrees propres du menu qu'elle repete. */
  const navigation = collectAllInternalLinks(html, finalUrl, finalUrl.host, new Set());

  /* Niveau 1 : les liens de l'accueil COMPLETES PAR LE SITEMAP sont proposes a
     l'IA, qui choisit lesquels ouvrir. L'accueil apporte les intitules rediges,
     le sitemap apporte tout ce que l'accueil ne montre plus. Aucun tri prealable
     par vocabulaire. */
  const links = [];
  collectPageLinks(html, finalUrl, finalUrl.host, links);
  const depuisAccueil = links.length;

  const sitemap = await fetchSitemapUrls(home.url);
  if (sitemap.length) {
    const connus = new Set(links.map((l) => l.url));
    const duSitemap = sitemap
      .filter((e) => {
        try {
          const p = new URL(e.url);
          return p.host === finalUrl.host
            && !connus.has(e.url)
            && !/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)$/i.test(p.pathname)
            && p.pathname !== '/';
        } catch { return false; }
      })
      // Le plus recent d'abord : c'est structurel, pas un jugement sur le sujet.
      // Au-dela du plafond, une page ancienne a peu de chances de decrire une
      // operation encore en cours.
      .sort((a, b) => String(b.lastmod).localeCompare(String(a.lastmod)))
      .slice(0, SITEMAP_URLS_MAX)
      .map((e) => ({ url: e.url, label: libelleDuChemin(e.url) }));
    links.push(...duSitemap);
  }
  console.log(`[demo-generate] candidats : ${depuisAccueil} de l'accueil + ${links.length - depuisAccueil} du sitemap`);

  const aOuvrir = await choisirLiensParIa(
    links, communeNom, MAIRIE_PAGES,
    "Voici les liens de la page d'accueil du site officiel, complétés par les adresses publiées dans son sitemap. Pour ces dernières, l'intitulé est tiré de l'adresse elle-même."
  );
  const seed = await fetchPages(aOuvrir, out, onFinding);

  /* Second niveau. Une page « Travaux », « Grands projets » ou « Actualites »
     n'est souvent qu'un SOMMAIRE : sur Vannes elle liste 14 operations en
     1 160 caracteres, chaque page fille en portant 3 000 a 15 000. Sans ce
     niveau, on ne retenait que 5 des 14 projets.

     Un sommaire se reconnait a ce qu'il EXPOSE : une page qui offre plusieurs
     liens encore inconnus en est un, quel que soit son titre. C'est mesurable,
     et vrai sur tous les sites. Les entrees deja presentes dans la NAVIGATION
     relevee sur l'accueil sont du menu repete, pas du contenu propre. */
  const MIN_ENFANTS_POUR_SOMMAIRE = 3;
  const enfants = [];
  const vus = new Set(links.map((l) => l.url));
  let sommaires = 0;
  for (const sp of seed.filter(Boolean)) {
    const trouves = [];
    collectPageLinks(sp.page.data, sp.page.url, finalUrl.host, trouves, links);
    const propres = trouves.filter((l) => !navigation.has(l.url) && !vus.has(l.url));
    if (propres.length < MIN_ENFANTS_POUR_SOMMAIRE) continue;
    sommaires++;
    for (const l of propres) { vus.add(l.url); enfants.push(l); }
  }
  if (enfants.length) {
    console.log(`[demo-generate] ${sommaires} sommaire(s), ${enfants.length} page(s) fille(s) reperee(s)`);
    const fillesAOuvrir = await choisirLiensParIa(
      enfants, communeNom, MAIRIE_PAGES_ENFANTS,
      'Voici les entrées listées par les pages de sommaire déjà ouvertes. Chaque entrée est un contenu propre du site, pas une rubrique de menu.'
    );
    await fetchPages(fillesAOuvrir, out, onFinding);
  }

  /* Retrait du gabarit, une fois TOUTES les pages du site collectees : il faut
     plusieurs pages pour reconnaitre ce qui s'y repete. La troncature a la
     taille transmise a l'IA n'intervient qu'ici, donc sur du contenu reel. */
  const nets = retirerLeGabarit(out.pages.map((p) => p.text));
  out.pages.forEach((p, i) => { p.text = (nets[i] || p.text).slice(0, PAGE_TEXT_CHARS); });

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

  /* On NE TELECHARGE PLUS le corps des articles.

     Le lien d'un item Google News est une redirection encodee qui ne resout
     plus vers le media : mesure sur Conflans, les 22 articles rendent 200 OK
     et 580 Ko du shell JavaScript de Google (« window.WIZ_global_data »), zero
     caractere d'article. Le garde-fou looksLikeCode les rejetait correctement,
     si bien que les 13 telechargements etaient integralement perdus : jusqu'a
     400 Ko et 6 s chacun, pour un texte toujours vide. La balise
     <description> du flux ne contient, elle, que le titre repete.

     Restent les TITRES, qui sont la vraie valeur de cette source et sont
     souvent explicites (« Ce que l'on sait de la renovation du groupe scolaire
     Paul Bert », « L'hotel de ville est en pleine renovation »). Ils
     corroborent ce que la mairie et les marches publics annoncent. */
  for (const item of items.slice(0, 13)) {
    onFinding?.({ kind: 'article', title: item.title.replace(/ - [^-]+$/, ''), domain: item.source || hostOf(item.link), date: item.date });
  }
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

/* Interventions de concessionnaires de reseau : elles ferment une rue mais ne
   transforment pas le territoire, et n'ont rien a faire sur une carte de
   projets urbains.

   Deux motifs, pas un seul. Les marques dont le nom est aussi un nom de
   commune ou un mot courant (Orange dans le Vaucluse, Free, RTE) ne peuvent
   pas ecarter un projet a elles seules : « Construction d'une mediatheque a
   Orange » etait rejete comme intervention de concessionnaire, et comme la
   description cite presque toujours la commune, TOUS les projets d'Orange
   tombaient. Ces marques ambigues exigent donc un mot de contexte reseau a
   proximite. Les marques sans ambiguite gardent leur declenchement direct. */
const CONCESSIONNAIRE_RE = /\b(enedis|grdf|grt\s?gaz|fibre optique|c[aâ]ble [eé]lectrique|ligne haute tension|moyenne tension|raccordement (?:au |du |des )?r[eé]seau|d[eé]voiement de r[eé]seaux?)\b/i;
// Marques ambigues : il faut le mot de marque ET un mot de contexte reseau
// dans la meme phrase (60 caracteres de part et d'autre).
const CONCESSIONNAIRE_AMBIGU_RE = /\b(orange|sfr|bouygues telecom|free|rte)\b[\s\S]{0,60}\b(r[eé]seau|raccordement|fibre|c[aâ]ble|t[eé]l[eé]com|[eé]lectri|haute tension|antenne|op[eé]rateur)\b|\b(r[eé]seau|raccordement|fibre|c[aâ]ble|t[eé]l[eé]com|[eé]lectri|haute tension|antenne|op[eé]rateur)\b[\s\S]{0,60}\b(orange|sfr|bouygues telecom|free|rte)\b/i;

/* Un projet est-il une intervention de concessionnaire ?
   Le nom de la commune est retire du texte avant le test : sans cela, toute
   commune homonyme d'un operateur voyait ses projets ecartes. */
function estInterventionReseau(project, communeNom) {
  let hay = `${project.title || ''} ${project.description || ''}`;
  if (communeNom) {
    hay = hay.replace(new RegExp(communeNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  }
  return CONCESSIONNAIRE_RE.test(hay) || CONCESSIONNAIRE_AMBIGU_RE.test(hay);
}

// Au-dela, un avis ne renseigne plus l'etat du chantier : il devient archive.
const BOAMP_MAX_AGE_MONTHS = 36;
const BOAMP_MAX_ROWS = 45;

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
    /* Les interventions de concessionnaire sont ecartees DES MAINTENANT, pas
       seulement a la sortie de l'IA : chaque ligne inutile consomme une place
       dans le paquet et des tokens pour rien. */
    let deduped = [...best.values()]
      .filter((x) => !estInterventionReseau({ title: x.title, description: x.description }, communeNom))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    /* Plafond : la liste BOAMP est tres compacte (une ligne par avis) et
       saturait a elle seule le quota de candidats de l'IA, evincant la presse
       et les pages de la mairie (mesure : 17 fiches sur 18 issues du BOAMP,
       ZERO de la presse alors que 22 articles avaient ete lus).
       Le tri de selection etait la RECENCE PURE, ce qui evinçait une ZAC
       majeure parue il y a quatorze mois derriere vingt refections de trottoir
       recentes. Au-dela du plafond, un appel IA court trie par interet urbain,
       en lisant la description officielle que le code extrayait deja sans
       jamais s'en servir. En dessous du plafond, aucun appel : ce serait du
       gaspillage pur. */
    if (deduped.length > BOAMP_MAX_ROWS) {
      deduped = await trierBoampParIa(deduped, communeNom);
    }
    deduped = deduped.slice(0, BOAMP_MAX_ROWS);
    rows.length = 0;
    rows.push(...deduped);
    rows.slice(0, 7).forEach((x) => onFinding?.({ kind: 'boamp', title: x.title.slice(0, 110), date: x.date }));
    return rows;
  } catch {
    return [];
  }
}

/* Tri des avis de marches par interet urbain, quand ils sont trop nombreux.
   Un seul appel court : environ 4 500 tokens en entree, 500 en sortie. Sa
   latence est gratuite en temps reel, la branche BOAMP etant la plus rapide des
   trois collectes et attendant deja les deux autres. */
const BOAMP_TRI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    avis: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer' },
          interet: {
            type: 'integer',
            description: '2 = opération d\'aménagement visible sur une carte (construction, réhabilitation lourde, requalification d\'espace public, ouvrage). 1 = travaux réels mais mineurs (réfection ponctuelle, mise aux normes). 0 = rien à montrer (entretien courant, marché à bons de commande, fournitures, prestation intellectuelle sans projet identifié).',
          },
        },
        required: ['index', 'interet'],
      },
    },
  },
  required: ['avis'],
};

async function trierBoampParIa(rows, communeNom) {
  try {
    const system = `Tu tries des avis de marchés publics de la commune de ${communeNom} pour une carte des projets urbains. Pour chaque avis, dis s'il correspond à quelque chose qu'un habitant pourrait voir sur une carte.

Fie-toi à la description officielle autant qu'à l'objet : un intitulé « Marché à bons de commande - voirie 2026 » dont la description décrit de l'entretien courant vaut 0, même s'il est récent. Une opération d'aménagement vaut 2 même si son avis est ancien.`;
    const user = JSON.stringify(rows.map((x, i) => ({
      index: i,
      objet: x.title,
      lieu: x.lieu || '',
      description: (x.description || '').slice(0, 300),
    })), null, 1);
    const out = await openAIStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      'tri_boamp', BOAMP_TRI_SCHEMA, 2200, 45000, 0.1
    );
    const scores = new Map((out.avis || []).map((a) => [a.index, Number(a.interet) || 0]));
    const avant = rows.length;
    // Interet decroissant, puis recence : a interet egal, l'avis recent gagne
    const trie = rows
      .map((x, i) => ({ x, i, interet: scores.has(i) ? scores.get(i) : 1 }))
      .filter((r) => r.interet > 0)
      .sort((a, b) => (b.interet - a.interet) || (a.x.date < b.x.date ? 1 : -1))
      .map((r) => r.x);
    console.log(`[demo-generate] tri BOAMP par l'IA : ${trie.length}/${avant} avis retenus`);
    // Un tri qui vide tout est suspect : on garde alors l'ordre par recence
    return trie.length >= 3 ? trie : rows;
  } catch (e) {
    console.warn('[demo-generate] tri BOAMP :', e?.message);
    return rows;
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

/* Remise a zero en tete de chaque invocation.
   Ce compteur est de portee MODULE : sur un conteneur de fonction reutilise
   (cas courant en rafale), il cumulait depuis le demarrage du conteneur, et
   cumulerTokens reinjectait a chaque phase le total deja compte par les
   precedentes. Le seul instrument de mesure du cout annoncait deux a quatre
   fois la depense reelle. */
function resetTokens() {
  _tokens.input = 0; _tokens.output = 0; _tokens.appels = 0;
}

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

/* Réponse coupée au plafond de sortie.
   Distinguée d'une panne réseau, parce que le remède est l'inverse : rejouer à
   l'identique retombe sur la même coupure et fait payer DEUX FOIS le plus gros
   appel de la génération. Il faut relancer avec plus de place. Le cas devient
   réel maintenant que le nombre de projets n'est plus plafonné. */
class ReponseTronquee extends Error {
  constructor(schemaName) {
    super(`Réponse IA tronquée (${schemaName})`);
    this.tronquee = true;
  }
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
  if (data.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens') {
    throw new ReponseTronquee(schemaName);
  }
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
  let tronquee = false;
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
          } else if (ev.type === 'response.incomplete') {
            logUsage(schemaName, ev.response?.usage);
            if (ev.response?.incomplete_details?.reason === 'max_output_tokens') tronquee = true;
          }
        } catch { /* ligne partielle : suite au prochain chunk */ }
      }
    }
  } finally {
    wd.clear();
  }
  if (tronquee) throw new ReponseTronquee(schemaName);
  if (!full) throw new Error('Réponse IA vide');
  return JSON.parse(full);
}

// Passe texte : streamée (titres en direct), avec repli non streamé si le flux
// échoue ou revient vide (aléa transitoire) - jamais d'interruption de démo
async function callOpenAIResilient(system, user, schemaName, schema, maxTokens, onTitle, temperature = 0.2) {
  try {
    return await callOpenAIStreamed(system, user, schemaName, schema, maxTokens, onTitle, temperature);
  } catch (e) {
    /* Une coupure et une réponse tronquée demandent des remèdes OPPOSÉS. Sur
       une coupure, rejouer à l'identique suffit. Sur une troncature, rejouer à
       l'identique retombe sur la même limite et fait payer deux fois le plus
       gros appel de la génération : il faut de la place en plus. */
    const plafond = e?.tronquee ? Math.round(maxTokens * 1.6) : maxTokens;
    console.error(`[demo-generate] repli IA non streamé après : ${e.message}${e?.tronquee ? ` (plafond de sortie relevé à ${plafond})` : ''}`);
    return openAIStructured([{ role: 'system', content: system }, { role: 'user', content: user }], schemaName, schema, plafond, 120000, temperature);
  }
}

// Budget de caracteres du paquet envoye a l'IA. Sans plafond, l'elargissement
// de la collecte ferait grimper le cout d'extraction proportionnellement au
// nombre de pages ; on borne donc, en servant d'abord les sources a plus fort
// rendement (pages officielles, puis avis de marches, puis presse).
const BUNDLE_MAX_CHARS = 260000;

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

Sois EXHAUSTIF : retiens CHAQUE projet réel et distinct attesté par les sources, sans aucune limite de nombre. Ne vise pas un chiffre rond, ne résume pas la liste, n'élague pas les projets modestes. Une métropole peut légitimement en compter plusieurs dizaines : une liste courte sur une grande ville est une erreur, pas une synthèse.

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
  /* Rappel des consignes APRES le corpus.
     Les règles étaient toutes placées avant 260 000 caractères de sources, donc
     très loin du point de génération, et le code contient la preuve qu'elles
     lâchent : le filtre des concessionnaires en JavaScript existe parce que le
     modèle retenait des interventions ENEDIS que la consigne lui interdit
     explicitement. Le phénomène s'aggrave avec la taille du corpus, c'est-à-dire
     précisément sur les métropoles, les prospects qui comptent. Environ 200
     tokens, coût négligeable à l'échelle de cet appel. */
  const rappel = `

RAPPEL, maintenant que tu as lu les sources. Avant de répondre, vérifie chaque projet de ta liste :
1. Est-ce un aménagement PHYSIQUE du territoire ? Un raccordement de réseau (électricité, gaz, fibre, télécoms), de l'entretien courant ou un achat de matériel n'en est pas un : retire-le.
2. evidence_quote est-elle copiée MOT POUR MOT depuis la source citée ? Une phrase reformulée, résumée ou reconstituée n'est pas une citation : sans citation exacte, retire le projet.
3. source_url figure-t-elle bien entre crochets dans les sources ci-dessus ?
4. address : est-elle ÉCRITE dans les sources ? Si tu l'as déduite, devinée ou complétée, remplace-la par une chaîne vide.
5. Deux entrées de ta liste désignent-elles vraiment deux chantiers DIFFÉRENTS ? Ne fusionne que ce qui est identique, et ne fusionne jamais deux équipements distincts d'un même quartier.
6. Sois EXHAUSTIF : n'élague aucun projet réel et attesté pour faire court.`;

  // Résilient : le flux OpenAI revient parfois vide (aléa constaté) -> une
  // passe non streamée en secours plutôt que d'interrompre toute la démo
  const out = await callOpenAIResilient(system, `SOURCES :\n\n${bundle}${rappel}`, 'projets', FINAL_SCHEMA, 26000, onTitle);
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

/* Nature REELLE d'un fichier image, lue dans ses premiers octets.
   Se fier a l'en-tete `content-type` trompait dans les deux sens : un serveur
   qui rend une page d'erreur en annoncant `image/png`, ou une image annoncee
   en `text/plain` par un CDN mal configure. La signature binaire tranche, et
   donne au passage la bonne extension de fichier. */
function typeImageReel(buffer) {
  const o = new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength));
  const debute = (...octets) => octets.every((v, i) => o[i] === v);
  if (debute(0x89, 0x50, 0x4e, 0x47)) return { ext: 'png', ct: 'image/png' };
  if (debute(0xff, 0xd8, 0xff)) return { ext: 'jpg', ct: 'image/jpeg' };
  if (debute(0x47, 0x49, 0x46, 0x38)) return { ext: 'gif', ct: 'image/gif' };
  if (debute(0x00, 0x00, 0x01, 0x00)) return { ext: 'ico', ct: 'image/x-icon' };
  if (debute(0x52, 0x49, 0x46, 0x46) && o[8] === 0x57 && o[9] === 0x45) return { ext: 'webp', ct: 'image/webp' };
  // SVG : du texte, qui commence par une declaration XML, un commentaire ou la
  // balise racine, parfois apres quelques espaces ou un BOM.
  const tete = new TextDecoder('utf-8', { fatal: false }).decode(o).replace(/^﻿/, '').trimStart().toLowerCase();
  if (tete.startsWith('<?xml') || tete.startsWith('<svg') || tete.startsWith('<!doctype svg')) {
    return { ext: 'svg', ct: 'image/svg+xml' };
  }
  return null;
}

/* Logo de la commune ET sa couleur, en UN SEUL appel de vision.

   Deux corrections en une. D'abord le choix du logo : le scoring texte ne peut
   pas voir qu'une image est la version blanche du logo, destinee aux fonds
   sombres et donc invisible sur l'interface claire de la carte ; un modele qui
   regarde l'image le voit. Ensuite le cout : l'ancien appel couleur envoyait
   une image SANS `detail: 'low'`, soit environ 1 100 tokens, alors que le meme
   fichier documente 400 lignes plus loin que 85 tokens suffisent a juger une
   image. Quatre candidats en detail bas coutent donc MOINS que l'ancien appel
   a un seul candidat en pleine resolution.

   Mesure a l'origine de ce changement : sur les 22 communes generees, 13
   gardaient le vert Open Projets faute de couleur trouvee, et les 3 dont le
   logo etait un .ico n'avaient meme pas droit a l'appel. */
const LOGO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    best_index: { type: 'integer', description: 'Index du vrai logo de la commune, -1 si aucune image ne l\'est' },
    color: { type: 'string', description: 'Couleur de marque dominante du logo choisi, en #RRGGBB. Chaîne vide si le logo est uniquement blanc, noir ou gris.' },
  },
  required: ['best_index', 'color'],
};

async function choisirLogoEtCouleur(candidats) {
  const usables = (candidats || []).filter((u) => u && !VISION_UNSUPPORTED_RE.test(u)).slice(0, 4);
  if (!usables.length) return null;
  try {
    const content = [{
      type: 'input_text',
      text: `Voici ${usables.length} image(s) numérotée(s) de 0 à ${usables.length - 1}, prises sur le site d'une mairie française.

Choisis celle qui est le LOGO OFFICIEL DE LA COMMUNE (son nom, son blason ou sa marque). Écarte : les logos de labels et de partenaires (« Ville active et sportive », « Villes fleuries »), les couvertures de magazine municipal, les bandeaux, les pictogrammes d'interface.

Écarte aussi toute version BLANCHE ou monochrome claire du logo : elle est faite pour un fond sombre et serait invisible sur une interface claire. Si la seule image disponible est blanche, choisis-la quand même mais rends une couleur vide.

Réponds -1 si aucune de ces images n'est le logo de la commune.

color : la couleur de marque la plus saturée et identitaire du logo choisi, en #RRGGBB, en ignorant le blanc, le noir et les gris. Chaîne vide s'il n'y en a pas.`,
    }];
    usables.forEach((url, i) => {
      content.push({ type: 'input_text', text: `Image ${i}` });
      // detail 'low' : 85 tokens par image au lieu d'environ 1 100
      content.push({ type: 'input_image', image_url: url, detail: 'low' });
    });
    const out = await openAIStructured([{ role: 'user', content }], 'logo_commune', LOGO_SCHEMA, 80, 30000, 0.2, OPENAI_VISION_MODEL);

    const idx = out.best_index;
    const logoUrl = (typeof idx === 'number' && idx >= 0 && idx < usables.length) ? usables[idx] : null;

    let hex = String(out.color || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) {
      hex = null;
    } else {
      // Écarter le quasi blanc / quasi noir : inutilisable comme couleur primaire
      const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      if ((rr > 232 && gg > 232 && bb > 232) || (rr < 24 && gg < 24 && bb < 24)) hex = null;
    }
    return { logoUrl, themeColor: hex };
  } catch (e) {
    console.warn('[demo-generate] choix du logo :', e?.message);
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

/* Le lieu trouvé porte-t-il un mot du lieu cherché ?

   C'est le seul contrôle qui interroge la PERTINENCE du résultat, là où les
   trois garde-fous existants ne testent que sa géographie. Les annuaires font
   de la correspondance approchée : interrogés sur « Hôtel de Ville », ils
   rendent volontiers un arrêt de bus « Centre Ville - Jean Jaurès », qui est
   dans la commune, de taille normale, sur une position libre, et n'a rien à
   voir. Mesuré sur Conflans : c'était la dernière punaise fausse de la carte.

   La comparaison ignore les mots trop courts et le vocabulaire d'aménagement,
   « ville » et « centre » compris : sans cela, « Hôtel de Ville » et « Centre
   Ville » se ressembleraient. Quand la requête ne contient que des mots
   génériques, on ne rejette rien : il n'y a alors rien à comparer, et un refus
   serait arbitraire. */
const MOT_SIGNIFICATIF_MIN = 4;

function motsSignificatifs(s) {
  return new Set(
    unaccentLower(s).split(/[^a-z0-9]+/)
      .filter((w) => w.length >= MOT_SIGNIFICATIF_MIN && !GENERIC_PROJECT_WORDS.test(w))
  );
}

function nomCoherent(requete, nomTrouve) {
  const cherches = motsSignificatifs(requete);
  if (!cherches.size) return true;
  const trouves = motsSignificatifs(nomTrouve);
  for (const mot of cherches) if (trouves.has(mot)) return true;
  return false;
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
      if (f && type !== 'municipality' && f.properties?.score >= 0.6 && geometryInBbox(f.geometry, bbox)
        && nomCoherent(q, f.properties.label || '')) {
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
    // Le detail d'adresse permet de comparer la COMMUNE du resultat, et non
    // de chercher son nom quelque part dans le libelle complet (voir plus bas)
    u.searchParams.set('addressdetails', '1');
    const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
    if (!r.ok) console.warn(`[demo-generate] nominatim http=${r.status} pour "${q}"`);
    if (r.ok) {
      const commLc = commune.nom.toLowerCase().slice(0, 8);
      for (const hit of await r.json()) {
        const g = hit.geojson;
        if (!g || !geometryInBbox(g, bbox)) continue;
        /* La commune du resultat, lue dans le DETAIL d'adresse. Chercher le nom
           de la commune dans le libelle entier se fait piegeer par les echelons
           administratifs superieurs : « Chemin de Dessus Perdtemps, Echenevex,
           Gex, Ain » contient « Gex » parce que Gex est l'ARRONDISSEMENT, et
           l'ecole Perdtemps se retrouvait a 3,5 km, dans la commune voisine.
           Repli sur l'ancien test quand le detail ne porte aucune commune, ce
           qui arrive sur certaines emprises. */
        const adr = hit.address || {};
        const communeTrouvee = adr.municipality || adr.city || adr.town || adr.village || adr.hamlet || '';
        const memeCommune = communeTrouvee
          ? unaccentLower(communeTrouvee) === unaccentLower(commune.nom)
          : (hit.display_name || '').toLowerCase().includes(commLc);
        if (!memeCommune) continue;
        /* Le resultat doit porter un mot du lieu cherche. Sans ce test,
           « Hotel de Ville » rendait l'arret de bus « Centre Ville - Jean
           Jaures ». On compare au NOM de l'objet et a son adresse, pas au
           display_name entier : celui-ci finit par le nom de la commune, du
           departement et du pays, ce qui ferait passer n'importe quoi. */
        if (!nomCoherent(q, `${hit.name || ''} ${(hit.display_name || '').split(',').slice(0, 3).join(' ')}`)) continue;
        // Le contour de la commune coche toutes les cases precedentes : c'est
        // sa TAILLE qui le trahit, pas son nom ni sa position.
        if (!extentAcceptable(g, bbox)) continue;
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

/* Requêtes de localisation d'un projet, de la plus fiable à la plus faible :
   adresse postale relevée dans la source, requête optimisée par l'IA, lieu,
   lieux nommés lus littéralement dans le texte, et le titre en DERNIER.

   Le titre était en quatrième position, donc devant les lieux réellement écrits
   dans la source. Or c'est la formulation la plus faible de toutes : un titre
   d'opération décrit ce qu'on fait, pas où. « Construction des pistes de
   padel », soumis tel quel à un annuaire, ne pouvait rendre qu'un résultat au
   hasard, et l'étage Nominatim n'essaie QUE la première formulation de cette
   liste. C'est la position dans ce tableau qui a produit la punaise fausse de
   Conflans, pas le géocodeur. */
function locationQueries(project) {
  const fromTitle = String(project.title || '')
    .replace(/^(r[eé]am[eé]nagement|am[eé]nagement|construction|r[eé]novation|r[eé]habilitation|extension|d[eé]molition|reconstruction|cr[eé]ation|installation|requalification|v[eé]g[eé]talisation|ouverture|restructuration|renouvellement|modification|transfert|r[eé]fection)\s+(de\s+la|de\s+l['’]|du|des|de|d['’]|d'|un|une)?\s*/i, '')
    .trim();
  const seen = new Set();
  const out = [];
  /* Chaque champ de l'IA est suivi de sa forme sans mot generique.

     Les lieux LUS DANS LE TEXTE ne servent que si l'IA n'a designe aucun lieu.
     Un nom de rue ou d'equipement present sur la page est trop souvent une
     mention incidente, sans rapport avec le projet : mesure sur Conflans, le
     gymnase Pierre Ruquet, simplement cite dans un avis, servait d'emplacement
     a la requalification du secteur Paul-Brard ; mesure sur Gex, la place
     Gambetta, citee pour un autre chantier de la meme page, servait
     d'emplacement au boulodrome Perdtemps.

     Quand l'IA a nomme un lieu, sa designation fait foi : si ce lieu est
     introuvable dans les annuaires, le projet part sans emplacement, ce qui est
     le resultat honnete. On ne se rabat pas sur un lieu voisin. */
  const aUnLieuNomme = [project.address, project.geo_query, project.place]
    .some((x) => motsSignificatifs(String(x || '')).size > 0);
  const candidats = [
    project.address,
    project.geo_query, sansPrefixeGenerique(project.geo_query),
    project.place, sansPrefixeGenerique(project.place),
    ...(aUnLieuNomme ? [] : odonymesDe(project.source_excerpt)),
    fromTitle, sansPrefixeGenerique(fromTitle),
  ];
  for (const q of candidats) {
    const t = String(q || '').trim();
    if (t.length < 3 || seen.has(t.toLowerCase())) continue;
    /* Une formulation sans AUCUN mot distinctif n'est pas un lieu, et un
       annuaire interroge la-dessus repond toujours quelque chose : ce quelque
       chose est du hasard. Mesure sur Gex : le nettoyage de l'adresse d'un avis
       de marche transformait « Ville de Gex » en « Ville de », qui partait en
       requete de rang 0 et posait le camping Les Genets sur l'ecole de musique.
       Le meme test protege de « travaux », « batiment communal », « la ville ». */
    if (!motsSignificatifs(t).size) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/* Lieux nommes lus directement dans le texte des sources. On n'essayait que
   les quatre champs produits par l'IA ; or les descriptions officielles citent
   souvent le lieu en toutes lettres (« avenue Charles de Gaulle », « montée
   de Verdun »), que la BAN geocode parfaitement, sans quota.

   Les EQUIPEMENTS comptent autant que les voies. Le motif ne connaissait que
   les types de voie, et ratait donc « au stade Claude-Fichot, derriere les
   courts de tennis couverts » : la phrase exacte que la mairie de Conflans
   publiait pour ses pistes de padel, et qui aurait suffi a les placer. Un
   equipement nomme est meme un meilleur candidat qu'une rue : il designe un
   objet unique, la ou une rue peut faire un kilometre. */
// La casse est insensible sur le TYPE de lieu seulement. Avec le drapeau `i`
// global, la classe [A-Z] du nom acceptait aussi les minuscules : la regex
// avalait la suite de la phrase (« chemin de la Raude est concerné ») et
// attrapait « place importante pour la commune ».
const VOIE_TYPES = '[Rr]ue|[Aa]venue|[Bb]oulevard|[Pp]lace|[Cc]hemin|[Rr]oute|[Ii]mpasse|[Aa]ll[ée]e|[Qq]uai|[Cc]ours|[Mm]ont[ée]e|[Ee]splanade|[Ss]quare|[Pp]assage';
const EQUIPEMENT_TYPES = '[Ss]tade|[Gg]ymnase|[Cc]omplexe sportif|[Pp]iscine|[Cc]entre nautique|[Cc]entre aquatique'
  + '|[Gg]roupe scolaire|[EÉeé]cole [éeE]l[ée]mentaire|[EÉeé]cole maternelle|[EÉeé]cole|[Cc]oll[èe]ge|[Ll]yc[ée]e|[Cc]r[èe]che'
  + '|[Mm][ée]diath[èe]que|[Bb]iblioth[èe]que|[Cc]onservatoire|[Tt]h[ée][âa]tre'
  + '|[Ss]alle des f[êe]tes|[Ss]alle polyvalente|[Ss]alle|[Hh]alle|[Mm]arch[ée] couvert'
  + '|[Pp]arc|[Jj]ardin|[Cc]imeti[èe]re|[Rr][ée]sidence|[Hh][ôo]tel de ville';
/* Types de ZONE. Ils ne servent PAS a reperer un lieu dans le texte, seulement
   a retirer le mot generique d'une requete : « Quartier Paul-Brard » et
   « Secteur Paul-Brard » rendent ZERO resultat chez Nominatim, « Paul-Brard »
   rend « Cite Paul Brard » au premier rang. */
const ZONE_TYPES = '[Qq]uartier|[Ss]ecteur|[Cc]it[ée]|[EÉeé]coquartier|[ÎIîi]lot|[Dd]omaine|ZAC|[Zz]one d\'activit[ée]s?';
const ARTICLE_RE = "(?:de\\s+la\\s+|de\\s+l['’]|du\\s+|des\\s+|de\\s+|d['’]|la\\s+|le\\s+|les\\s+)?";
const ODONYME_RE = new RegExp(
  `\\b(?:${VOIE_TYPES}|${EQUIPEMENT_TYPES})\\s+${ARTICLE_RE}`
  + `[A-ZÉÈÀÂÎÔÛ][\\wÀ-ÿ'’-]*(?:\\s+(?:de\\s+|du\\s+|des\\s+|d['’]|la\\s+|le\\s+)?[A-ZÉÈÀÂÎÔÛ][\\wÀ-ÿ'’-]*){0,2}`,
  'g'
);
/* Le prefixe generique d'un EQUIPEMENT, a retirer pour obtenir le nom propre
   seul. La commune et OpenStreetMap ne s'accordent pas sur ce mot : Conflans
   ecrit « stade Claude-Fichot », OSM enregistre « Complexe Sportif Claude
   Fichot ». Interroge avec le prefixe, l'annuaire ne rend RIEN ; avec le nom
   propre seul, il rend l'equipement au premier rang, avec ou sans trait
   d'union. Verifie aussi sur « theatre Simone Signoret ».
   Les VOIES n'y passent pas : « de Verdun » seul est inexploitable, la ou
   « montee de Verdun » designe une voie precise. */
const PREFIXE_GENERIQUE_RE = new RegExp(`^(?:${EQUIPEMENT_TYPES}|${ZONE_TYPES})\\s+${ARTICLE_RE}`);

/* Une requete debarrassee de son mot generique, ou chaine vide s'il n'y en a
   pas. S'applique aussi aux champs produits par l'IA : c'est elle qui ecrit
   « Quartier Paul-Brard », et cette forme ne trouve rien. Jamais sur une VOIE :
   « Maurice-Berteaux » seul serait plus ambigu que « rue Maurice-Berteaux ». */
function sansPrefixeGenerique(q) {
  const t = String(q || '').trim();
  const nu = t.replace(PREFIXE_GENERIQUE_RE, '').trim();
  return nu && nu !== t ? nu : '';
}
const ODONYMES_MAX = 4;

function odonymesDe(texte) {
  const out = [];
  const pousser = (v) => {
    const t = String(v).replace(/\s+/g, ' ').trim();
    if (t.length >= 6 && !out.includes(t)) out.push(t);
  };
  for (const m of String(texte || '').match(ODONYME_RE) || []) {
    // La forme complete d'abord : c'est la plus specifique.
    pousser(m);
    const nu = sansPrefixeGenerique(m);
    if (nu) pousser(nu);
    if (out.length >= ODONYMES_MAX) break;
  }
  return out.slice(0, ODONYMES_MAX);
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
   projet lui-meme.

   Un SEUL appel IA remplace les 18 familles qui etaient ecrites en dur, et qui
   avaient deux defauts. Couverture : giratoire, tribunal, caserne, theatre,
   eglise, port, gare routiere, decheterie, skatepark, station d'epuration ne
   correspondaient a aucune ligne, donc aucune image. Langue : les requetes
   etaient en francais alors que Wikimedia Commons est indexe massivement en
   anglais (« biomass boiler plant » rend infiniment plus que « chaufferie bois
   collective »). Cout : environ 700 tokens en entree, un appel par generation. */
const THEMES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer', description: 'Index du projet dans la liste fournie' },
          query_en: { type: 'string', description: 'Requête Wikimedia Commons EN ANGLAIS décrivant le TYPE d\'ouvrage, jamais le projet précis ni la commune. Exemples : "biomass boiler plant", "public swimming pool France", "roundabout France". Chaîne vide si le projet ne correspond à aucun type d\'ouvrage photographiable.' },
          libelle_fr: { type: 'string', description: 'Le type d\'ouvrage en français, précédé de son article, pour le crédit affiché : "une chaufferie", "un giratoire", "une caserne de pompiers".' },
        },
        required: ['index', 'query_en', 'libelle_fr'],
      },
    },
  },
  required: ['themes'],
};

async function themesGeneriques(communeNom, projets) {
  const vide = projets.map(() => null);
  if (!projets.length) return vide;
  try {
    const system = `Pour chaque projet urbain de la commune de ${communeNom}, identifie le TYPE D'OUVRAGE qu'il produit, puis donne une requête de recherche photo EN ANGLAIS qui rendra des photos de ce type d'ouvrage sur Wikimedia Commons.

Tu ne cherches PAS une photo du projet lui-même : elle n'existe pas. Tu cherches une photo d'un ouvrage du même type, qui servira d'illustration explicitement créditée comme générique.

- query_en : en anglais, 2 à 5 mots, le type d'ouvrage seul. Jamais le nom du projet, jamais le nom de la commune, jamais un nom propre. Ajoute "France" seulement si l'architecture française change vraiment le résultat.
- libelle_fr : le même type d'ouvrage en français avec son article, tel qu'il sera lu dans « Illustration générique (…) ».
- Si le projet ne produit aucun ouvrage photographiable (une étude, une concertation, un plan), rends une chaîne vide pour query_en : mieux vaut aucune image qu'une image hors sujet.`;
    const user = JSON.stringify(projets.map((p, i) => ({
      index: i,
      titre: p.title,
      description: (p.description || '').slice(0, 200),
    })), null, 1);
    const out = await openAIStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      'themes_illustration', THEMES_SCHEMA, 1400, 40000, 0.2
    );
    const parIndex = new Map();
    for (const t of out.themes || []) {
      const requete = String(t.query_en || '').trim();
      if (requete) parIndex.set(t.index, { requete, libelle: String(t.libelle_fr || 'un ouvrage public').trim() });
    }
    return projets.map((_, i) => parIndex.get(i) || null);
  } catch (e) {
    // Aucun repli codé en dur : sans thème, la fiche reste sans photo, ce qui
    // est le comportement honnête. Une table de 18 regex ne couvrait de toute
    // façon qu'une partie des cas.
    console.warn('[demo-generate] thèmes d\'illustration :', e?.message);
    return vide;
  }
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

/* Compte le TRAVAIL du jour, pas les communes.
   Le compteur portait sur `demo_instances`, dont la ligne est SUPPRIMÉE avant
   d'être réinsérée à chaque redémarrage de zéro : relancer vingt fois la même
   commune laissait le compteur à 1. Depuis qu'un bouton « Refaire le
   recensement » existe à l'écran, c'était une porte ouverte. `demo_runs` est en
   ajout seul : une ligne par tentative, donc une unité de quota par tentative,
   qu'elle aboutisse ou non. */
async function countToday(filterCol, filterVal) {
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL(`${SUPABASE_URL}/rest/v1/demo_runs`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('started_at', `gte.${today}`);
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

/* ─── Journal des générations (demo_runs) ───────────────────────────────────

   `demo_instances` porte l'ETAT COURANT d'une commune, et le chemin
   « redémarrage de zéro » supprime sa ligne : seuls les succès survivaient.
   Impossible, donc, de savoir combien de visiteurs se sont pris un mur, sur
   quelle étape, ni combien de temps une démo prend réellement.

   `demo_runs` est un journal en ajout seul : une ligne par tentative, ouverte
   en `running`, close en `ready` ou `failed`. Une ligne restée `running` est
   elle-même une information : le visiteur a fermé l'onglet en cours de route.

   Règle : la télémétrie ne casse JAMAIS la démo. Tout est en try/catch, un
   journal indisponible ne doit pas coûter une génération. */

async function createRun(fields) {
  try {
    const rows = await insertRows('demo_runs', [fields], { returning: true });
    return rows?.[0]?.id || null;
  } catch (e) {
    console.warn('[demo-generate] journal: ouverture impossible ::', e?.message);
    return null;
  }
}

async function patchRun(runId, patch) {
  if (!runId) return;
  try {
    const r = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/demo_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      headers: serviceHeaders(),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) console.warn(`[demo-generate] journal: mise à jour ${r.status}`);
  } catch (e) {
    console.warn('[demo-generate] journal: mise à jour impossible ::', e?.message);
  }
}

// Clôture d'un run, en succès ou en échec. `startedAt` permet de calculer la
// durée RÉELLE d'une génération, celle que personne ne mesurait : le
// duration_ms de demo_instances ne couvrait que la dernière étape.
async function closeRun(runId, status, { phase, error, projectsCount, startedAt } = {}) {
  if (!runId) return;
  const now = Date.now();
  await patchRun(runId, {
    status,
    ...(phase ? { phase } : {}),
    ...(error ? { error_message: String(error).slice(0, 500) } : {}),
    ...(projectsCount != null ? { projects_count: projectsCount } : {}),
    ended_at: new Date(now).toISOString(),
    ...(startedAt ? { duration_ms: Math.max(0, now - startedAt) } : {}),
  });
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
      const { site, position } = await findMairie(insee, bbox);
      /* La position de la mairie part IMMEDIATEMENT, avant même la visite du
         site : c'est elle qui ancre le radar à l'écran, et le radar démarre dès
         cette étape. Envoyée plus tard, il aurait balayé plusieurs secondes
         depuis le centre géométrique de la commune. */
      if (position) finding({ kind: 'mairie-position', lat: position.lat, lng: position.lng, title: position.libelle });
      if (!site) {
        step('mairie', 'skip', 'Site officiel de la mairie', "non renseigné dans l'annuaire officiel");
        return { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [], images: [], position };
      }
      const m = await inspectMairieSite(site, commune.nom, finding);
      m.position = position;
      /* Site protege contre la lecture automatique : on le dit franchement,
         plutot que de laisser croire a une commune sans projets. La generation
         continue sur la presse et les marches publics. */
      if (m.bloque) {
        step('mairie', 'skip', 'Site officiel de la mairie',
          `${m.host} bloque la lecture automatique · recensement poursuivi sur la presse et les marchés publics`);
        return m;
      }
      // Identité visuelle et lecture des PDF en parallèle : deux travaux
      // indépendants qui ne doivent pas s'additionner dans la durée de la phase
      const [identite, pdfsLus] = await Promise.all([
        (m.logoCandidats || []).length ? choisirLogoEtCouleur(m.logoCandidats) : Promise.resolve(null),
        readMairiePdfs(m.pdfs || []),
      ]);
      // La vision tranche entre les candidats du scoring texte, qui reste le
      // repli quand elle échoue ou que tous les candidats sont des .svg.
      if (identite?.logoUrl) m.logoUrl = identite.logoUrl;
      // La meta theme-color du site prime : c'est la couleur que la commune a
      // elle-même déclarée. La vision ne sert qu'à défaut.
      if (!m.themeColor && identite?.themeColor) m.themeColor = identite.themeColor;
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
  console.log(`[demo-generate] sources ${commune.nom}: ${mairie.pages.length} pages mairie${mairie.bloque ? ' (SITE BLOQUE)' : ''}, ${news.length} articles, ${boamp.length} BOAMP, ${(mairie.images || []).length} images mairie, theme=${mairie.themeColor || 'aucun'}`);
  return {
    commune: {
      nom: commune.nom,
      code: commune.code,
      population: commune.population || 0,
      lat: commune.centre.coordinates[1],
      lng: commune.centre.coordinates[0],
    },
    bbox,
    // pdfTextes VOYAGE : c'est le texte des PDF officiels, la seule source qui
    // porte des dates de chantier. Il etait produit par readMairiePdfs puis
    // perdu ici, donc jamais lu par l'IA alors qu'il etait deja paye.
    // logoCandidats VOYAGE : la phase de création réessaie sur les suivants si
    // le meilleur ne se télécharge pas. Sans cette liste, un délai dépassé
    // suffisait à priver l'espace du logo de la commune.
    mairie: {
      host: mairie.host,
      logoUrl: mairie.logoUrl,
      logoCandidats: (mairie.logoCandidats || []).slice(0, 4),
      themeColor: mairie.themeColor,
      pdfs: mairie.pdfs,
      pdfTextes: mairie.pdfTextes || [],
      pages: mairie.pages,
      urls: mairie.urls,
      images: mairie.images,
    },
    news,
    boamp,
    // `site_bloque` remonte jusqu'au journal : une carte maigre sur une grande
    // commune s'explique alors d'un coup d'oeil, sans avoir a rejouer la
    // generation pour comprendre.
    stats: { sources: sourcesCount, news: news.length, boamp: boamp.length, site_bloque: Boolean(mairie.bloque) },
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
  projects = projects.filter((p) => !estInterventionReseau(p, commune.nom));
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
  // Le texte des PDF a fini son office (paquet + fusion) : il pese lourd dans
  // le brouillon relu a chaque phase suivante. Les liens (mairie.pdfs) restent,
  // eux servent encore au rattachement des dossiers en phase create.
  state.mairie.pdfTextes = [];
  state.boamp = [];
  return state;
}

const METHOD_LABELS = {
  emprise: 'emprise réelle trouvée',
  trace: 'tracé réel trouvé',
  adresse: 'adresse précise',
  quartier: 'quartier identifié',
};

/* Deux fiches designent-elles le MEME chantier ?
   L'ancien test « deux points a moins de 250 m qui partagent UN mot distinctif »
   supprimait des projets reels : « Reamenagement de l'avenue Berthelot » et
   « Residence Berthelot » a 200 m partagent « berthelot », et la residence
   disparaissait sans un mot. On exige donc soit deux mots communs, soit un seul
   mot mais a tres courte distance, ou le doute n'existe plus. */
function memeChantier(a, b, distanceM) {
  if (distanceM > 250) return false;
  const communs = distinctiveWords(b.title).filter((w) => distinctiveWords(a.title).includes(w));
  if (communs.length >= 2) return true;
  return communs.length === 1 && distanceM < 80;
}

/* Phase LOCALISATION.

   Elle est DECOUPEE EN TRANCHES : Nominatim impose un rythme d'une requete par
   seconde, et depuis que le nombre de projets n'est plus plafonne, une commune
   bien dotee demande plus de temps qu'une invocation ne peut en tenir. Chaque
   invocation travaille pendant un budget borne puis rend la main ; le client
   rappelle la meme phase, qui reprend a son curseur. Auparavant, le budget
   epuise faisait simplement basculer TOUS les projets suivants en « non
   localisable » (mesure sur Oyonnax : 15 punaises perdues sur 18).

   Elle parle AU FIL DE L'EAU : chaque projet part a l'ecran des qu'il est
   place. L'ancienne version n'emettait rien avant la fin du dedoublonnage,
   soit une minute entiere pendant laquelle le bandeau restait fige devant le
   prospect. Le dedoublonnage est desormais incremental, ce qui rend l'emission
   immediate sans jamais afficher une punaise absente de la carte finale. */
const PHASE_BUDGET_MS = 22000;
const NOMINATIM_RATE_MS = 1050;
/* Deux fiches ne peuvent pas occuper le meme point : au-dela d'un projet, une
   position partagee est un repli du geocodeur, pas l'adresse du chantier. */
const POSITION_MIN_M = 45;
// Filet anti-boucle : au-dela, on finalise avec ce qu'on a plutot que de
// rappeler la phase indefiniment.
const GEO_MAX_TOURS = 14;
/* Nombre de formulations tentees par projet a l'etage Nominatim.
   Une seule ne suffit pas : la premiere est souvent la forme complete
   (« stade Claude-Fichot »), que l'annuaire ne connait pas sous ce nom, quand
   la seconde est le nom propre seul (« Claude-Fichot »), qui rend l'equipement.
   Les essais sont ordonnes par RANG, pas par projet : tous les projets tentent
   leur meilleure formulation avant qu'aucun n'en tente une seconde, pour qu'un
   budget de tranche epuise ne prive personne de son premier essai. */
const NOMINATIM_ESSAIS = 2;

function essaisNominatim(queries) {
  const paires = [];
  for (let rang = 0; rang < NOMINATIM_ESSAIS; rang++) {
    for (let i = 0; i < queries.length; i++) {
      if (queries[i].length > rang) paires.push([i, rang]);
    }
  }
  return paires;
}

async function coreGeo(send, step, state) {
  const { projects, bbox } = state;
  const communeShim = {
    nom: state.commune.nom,
    code: state.commune.code,
    centre: { coordinates: [state.commune.lng, state.commune.lat] },
  };
  const queries = projects.map(locationQueries);

  // Etat de la phase, serialisable : il voyage d'une tranche a l'autre
  const geo = state.geo || (state.geo = {
    etape: 'nominatim',
    curseur: 0,
    /* A l'etage Nominatim, des paires [indice de projet, rang de formulation].
       Les etages suivants remplacent ce tableau par de simples indices. */
    aTester: essaisNominatim(queries),
    // Indices encore sans position, tous etages confondus
    reste: projects.map((_, i) => i),
    lieuxIa: null,
    fusionnes: 0,
    superposes: 0,
    tours: 0,
  });
  state.located = state.located || [];
  geo.tours++;

  const premiereTranche = geo.tours === 1;
  if (premiereTranche) {
    step('geo', 'start', 'Localisation des projets', `${projects.length} projet(s) à situer, emprises réelles OpenStreetMap et adresses officielles BAN`);
  } else {
    step('geo', 'start', 'Localisation des projets', `${state.located.length} situé(s), ${geo.reste.length} en cours...`);
  }

  /* Accepte un projet localisé : dédoublonnage incrémental, puis émission
     immédiate. Rend true si le projet a rejoint la carte. */
  const accepter = (i, loc) => {
    const c = centroidOf(loc.geometry);
    // Une emprise géante ne tient pas dans le brouillon relu à chaque tranche :
    // elle retombe en point, comme avant, mais plus tôt.
    if (JSON.stringify(loc.geometry).length >= 15000) {
      loc.geometry = { type: 'Point', coordinates: [c.lng, c.lat] };
    }
    const projet = { ...projects[i], ...loc };

    for (const deja of state.located) {
      const d = haversineM(centroidOf(deja.geometry), c);
      if (memeChantier(deja, projet, d)) { geo.fusionnes++; return false; }
      /* Une position DÉJÀ OCCUPÉE n'est pas celle de ce projet-ci.
         J'avais relâché cette règle en pensant à deux bâtiments d'un même
         groupe scolaire. La réalité mesurée est autre : sur Saint-Denis (974),
         CINQ fiches ont atterri sur exactement le même polygone, à la sixième
         décimale près. Ce n'étaient pas cinq projets voisins, mais cinq avis
         de marché sans lieu propre (« bâtiments communaux », « les écoles »,
         « les cimetières », « voiries ») que le géocodeur a tous rabattus sur
         le même repli. Un emplacement partagé par plusieurs projets n'est la
         position d'aucun : c'est exactement la position fabriquée que le reste
         du système s'interdit. Le projet est donc écarté, et compté comme
         « emplacement non vérifiable », ce qu'il est réellement. */
      if (d < POSITION_MIN_M) {
        geo.superposes++;
        return false;
      }
    }

    state.located.push(projet);
    send({
      type: 'geo-item',
      title: projet.title,
      method: projet.method,
      label: METHOD_LABELS[projet.method],
      category_slug: projet.category_slug,
      lat: c.lat,
      lng: c.lng,
      geometry: projet.geometry.type !== 'Point' ? projet.geometry : null,
      // La PREUVE : la phrase exacte relevée dans la source, et d'où elle vient.
      quote: String(projet.evidence_quote || '').slice(0, 220),
      media: hostOf(projet.source_url) || '',
      sources: (projet.sources || []).map((s) => s.type),
    });
    return true;
  };

  const retirerDuReste = (i) => {
    const k = geo.reste.indexOf(i);
    if (k >= 0) geo.reste.splice(k, 1);
  };

  const t0 = Date.now();
  const budgetEpuise = () => Date.now() - t0 > PHASE_BUDGET_MS;

  // Passe a l'etage suivant : on repart de ce qui n'a pas encore de position
  const etapeSuivante = (nom) => {
    geo.etape = nom;
    geo.curseur = 0;
    geo.aTester = geo.reste.slice();
  };

  while (geo.etape !== 'final' && !budgetEpuise() && geo.tours <= GEO_MAX_TOURS) {
    /* Etage 1, Nominatim : seule source d'emprises et de traces reels, donc on
       lui reserve le budget, mais UNE requete par projet et au rythme impose
       par sa politique d'usage (1 requete/seconde). */
    if (geo.etape === 'nominatim') {
      if (geo.curseur >= geo.aTester.length) { etapeSuivante('ban'); continue; }
      const [i, rang] = geo.aTester[geo.curseur++];
      // Le projet a pu etre place par un essai precedent
      if (!geo.reste.includes(i) || !queries[i][rang]) continue;
      const hit = await nominatimLookup(queries[i][rang], communeShim, bbox);
      if (hit) { retirerDuReste(i); accepter(i, hit); }
      // Le rythme appartient a la boucle, pas au lookup : place dans le lookup,
      // il n'etait applique qu'en cas d'echec.
      await sleep(NOMINATIM_RATE_MS);
      continue;
    }

    /* Etage 2, BAN : officielle, scopee sur la commune, sans quota. Elle
       rattrape tout le reste en une poignee de secondes, donc en parallele. */
    if (geo.etape === 'ban') {
      const lot = geo.aTester.slice(geo.curseur, geo.curseur + 8);
      geo.curseur += lot.length;
      if (!lot.length) { etapeSuivante('iris'); continue; }
      const trouves = await inChunks(lot, 8, async (i) => {
        for (const q of queries[i]) {
          const hit = await banGeocode(q, communeShim, bbox);
          if (hit) return { i, hit };
        }
        return null;
      });
      for (const r of trouves) {
        if (r && geo.reste.includes(r.i)) { retirerDuReste(r.i); accepter(r.i, r.hit); }
      }
      continue;
    }

    /* Etage 3, quartiers IRIS de l'INSEE : beaucoup de projets ne designent pas
       une adresse mais un secteur (« quartier de la Raude »). Cette couche
       officielle donne une emprise REELLE a cette maille, la ou un point
       invente ne serait pas acceptable. */
    if (geo.etape === 'iris') {
      const quartiers = geo.reste.length ? await fetchIrisQuartiers(state.commune.code) : [];
      let rattrapes = 0;
      for (const i of geo.reste.slice()) {
        const mots = distinctiveWords(`${projects[i].geo_query || ''} ${projects[i].place || ''} ${projects[i].title}`);
        if (!mots.length) continue;
        // Un IRIS trop vaste designe un secteur, pas un projet
        const q = quartiers.find((qt) => mots.some((m) => qt.cle.includes(m)) && extentAcceptable(qt.geometry, bbox));
        if (q) { retirerDuReste(i); if (accepter(i, { geometry: q.geometry, method: 'quartier' })) rattrapes++; }
      }
      if (rattrapes) console.log(`[demo-generate] quartiers IRIS : ${rattrapes} projet(s) situe(s)`);
      etapeSuivante('ia');
      continue;
    }

    /* Etage 4, dernier recours : on redemande a l'IA. Elle a lu les sources et
       sait souvent nommer un lieu geocodable que les champs structures n'ont
       pas rendu. Un seul appel pour tous les projets restants. */
    if (geo.etape === 'ia') {
      if (!geo.lieuxIa) {
        const restants = geo.reste.slice();
        const propositions = restants.length ? await askAiForPlaces(state.commune, restants.map((i) => projects[i])) : [];
        geo.lieuxIa = restants
          .map((i, k) => ({ i, lieu: propositions[k] }))
          .filter((x) => x.lieu && x.lieu.length >= 3);
        // BAN d'abord, en parallele et sans quota
        const trouves = await inChunks(geo.lieuxIa, 8, async ({ i, lieu }) => {
          const hit = await banGeocode(lieu, communeShim, bbox);
          return hit ? { i, hit } : null;
        });
        for (const r of trouves) {
          if (r && geo.reste.includes(r.i)) { retirerDuReste(r.i); accepter(r.i, r.hit); }
        }
        geo.curseur = 0;
        continue;
      }
      // Nominatim ensuite, en serie et au rythme impose, pour les lieux NOMMES
      // (« quartier de la Plaine ») que la BAN n'indexe pas.
      if (geo.curseur >= geo.lieuxIa.length) { geo.etape = 'final'; continue; }
      const { i, lieu } = geo.lieuxIa[geo.curseur++];
      if (!geo.reste.includes(i)) continue;
      const hit = await nominatimLookup(lieu, communeShim, bbox);
      if (hit) { retirerDuReste(i); accepter(i, hit); }
      await sleep(NOMINATIM_RATE_MS);
      continue;
    }
  }

  // Budget epuise mais travail inacheve : on rend la main, la tranche suivante
  // reprend exactement ou celle-ci s'arrete.
  if (geo.etape !== 'final' && geo.tours < GEO_MAX_TOURS) {
    step('geo', 'done', 'Localisation en cours', `${state.located.length} projet(s) situé(s) jusqu'ici`);
    state.__continue = true;
    return state;
  }
  delete state.__continue;

  /* Les projets qu'on ne sait pas situer, meme a la maille du quartier, sont
     RETIRES. Ils etaient auparavant poses a une position calculee autour du
     centre-ville, indiscernable d'une vraie punaise : une carte qui invente des
     emplacements devant un elu qui connait sa commune coute plus cher qu'une
     carte moins fournie. */
  const located = state.located;
  /* Un projet ecarte pour position DEJA OCCUPEE est bien un projet dont on ne
     connait pas l'emplacement : le geocodeur lui a rendu le repli d'un autre.
     Il rejoint donc les non localisables, ce qui est exact. */
  const abandonnes = geo.reste.length + geo.superposes;

  // Le plancher de 3 projets etait controle AVANT le geocodage. Depuis que les
  // projets non localisables sont retires, la liste peut fondre ici.
  if (located.length < 3) {
    send({ type: 'error', message: `Les sources publiques ne permettent pas de situer assez de projets à ${state.commune.nom} (${located.length} sur la carte). Avec vos documents, la carte complète se monte en quelques jours : parlons-en.` });
    return null;
  }

  const exacts = located.filter((p) => p.method !== 'quartier').length;
  console.log(`[demo-generate] geo ${state.commune.nom}: ${located.length} situés (${exacts} à l'adresse, ${located.length - exacts} au quartier), ${abandonnes} sans emplacement identifiable (dont ${geo.superposes} sur une position déjà occupée), ${geo.fusionnes} doublon(s) fusionné(s), ${geo.tours} tranche(s)`);
  step('geo', 'done', 'Projets localisés',
    `${located.length} projet(s) situé(s)${abandonnes ? `, ${abandonnes} écarté(s) faute d'emplacement identifiable` : ''}`);
  /* Ce qu'on REFUSE est un argument, à condition de dire vrai. Les doublons
     fusionnés ne sont PAS des « emplacements non vérifiables » : ils étaient
     parfaitement localisés, c'est le projet qui faisait doublon. Les compter
     ensemble revenait à mentir à l'écran sur le motif du rejet. */
  if (abandonnes) send({ type: 'rejected', kind: 'position', count: abandonnes });
  if (geo.fusionnes) send({ type: 'rejected', kind: 'doublon', count: geo.fusionnes });

  state.projects = [];
  state.geo = null;
  state.stats.verified = located.length;
  state.stats.precise = exacts;
  state.stats.abandonnes = abandonnes;
  state.stats.fusionnes = geo.fusionnes;
  state.stats.superposes = geo.superposes;
  return state;
}

/* Les CMS servent la même photo sous plusieurs URL (vignettes de cache
   suffixées d'une empreinte : "web-parking-3d6e6237.png" et
   "web-parking-450dc1de.png"). Comparer les URL brutes laissait passer des
   doublons, et une photo de parking se retrouvait sur un projet de rue. */
function coverKey(u) {
  try {
    const p = decodeURIComponent(new URL(u).pathname).toLowerCase();
    const file = p.slice(p.lastIndexOf('/') + 1);
    return file.replace(/-[0-9a-f]{6,}(?=\.[a-z0-9]+$)/, '').replace(/[\s_]+/g, '-');
  } catch { return u; }
}

/* Phase ILLUSTRATIONS : candidats (sources + mairie + Commons) puis juge visuel.

   Découpée en tranches et émettant au fil de l'eau, pour les mêmes raisons que
   la localisation : un appel de vision par projet, quatre en parallèle, et un
   nombre de projets désormais non plafonné. L'ancienne version n'envoyait rien
   à l'écran avant d'avoir jugé TOUTES les images, soit un second silence de
   près d'une minute juste après celui de la localisation. */
async function coreMedia(send, step, state) {
  const located = state.located;
  const pages = state.mairie?.pages || [];
  const media = state.media || (state.media = { curseur: 0, illustrated: 0, used: [], tours: 0 });
  media.tours++;

  if (media.tours === 1) {
    console.log(`[demo-generate] media: ${located.length} projets, ${pages.length} page(s) mairie indexée(s)`);
    step('media', 'start', 'Recherche des illustrations des projets', 'Chaque image est choisie par l\'IA selon le sujet');
  } else {
    step('media', 'start', 'Recherche des illustrations', `${media.illustrated} trouvée(s), ${located.length - media.curseur} projet(s) restant(s)`);
  }

  const t0 = Date.now();
  const used = new Set(media.used);

  // Concurrence 4 : a 6 appels vision simultanes, les connexions sortantes du
  // bac a sable de fonctions partaient en UND_ERR_CONNECT_TIMEOUT en rafale
  while (media.curseur < located.length && Date.now() - t0 < PHASE_BUDGET_MS) {
    const lot = [];
    for (let k = 0; k < 4 && media.curseur < located.length; k++) lot.push(media.curseur++);
    const choix = await inChunks(lot, 4, async (i) => {
      const p = located[i];
      const c = centroidOf(p.geometry);
      const candidates = await gatherImageCandidates(p, state.commune.nom, c.lat, c.lng, pages, true);
      const img = candidates.length ? await pickBestImageWithAI(p, state.commune.nom, candidates) : null;
      if (process.env.DEMO_DUMP) {
        const origines = candidates.map((x) => (/wikimedia|wikipedia/.test(x.url) ? 'commons' : 'site')).join(',');
        console.log(`[demo-media] "${p.title}" : ${candidates.length} candidats [${origines}] -> ${img ? 'RETENU ' + img.title : 'aucun'}`);
      }
      return { i, img };
    });
    // Le rattachement est séquentiel : `used` interdit la même photo sur deux
    // fiches, et cette décision ne peut pas se prendre en parallèle.
    for (const { i, img } of choix) {
      if (!img || used.has(coverKey(img.url))) continue;
      used.add(coverKey(img.url));
      located[i].coverSrc = img.url;
      located[i].coverCredit = img.credit;
      media.illustrated++;
      const c = centroidOf(located[i].geometry);
      // coverSrc + coordonnées : le front pose la photo directement sur la carte
      send({ type: 'media-item', title: located[i].title, credit: img.credit, coverSrc: img.url, lat: c.lat, lng: c.lng, generique: false });
    }
  }
  media.used = [...used];

  if (media.curseur < located.length && media.tours < GEO_MAX_TOURS) {
    step('media', 'done', 'Illustrations en cours', `${media.illustrated} illustration(s) trouvée(s)`);
    state.__continue = true;
    return state;
  }
  delete state.__continue;

  /* Repli thematique pour les projets restes sans visuel. Une seule recherche
     Commons par THEME distinct, pas par projet : deux ecoles partagent la meme
     requete. Le credit annonce explicitement l'image comme generique. */
  const sansImage = located.map((p, i) => ({ p, i })).filter(({ p }) => !p.coverSrc);
  if (sansImage.length) {
    const themes = await themesGeneriques(state.commune.nom, sansImage.map(({ p }) => p));
    const parRequete = new Map();
    sansImage.forEach(({ i }, k) => {
      const t = themes[k];
      if (!t?.requete) return;
      if (!parRequete.has(t.requete)) parRequete.set(t.requete, { libelle: t.libelle, cibles: [] });
      parRequete.get(t.requete).cibles.push(i);
    });
    if (parRequete.size) {
      const entrees = [...parRequete.entries()];
      const resultats = await inChunks(entrees, 4, async ([requete]) => commonsTextCandidates(requete));
      entrees.forEach(([, info], k) => {
        const dispo = (resultats[k] || []).filter((c) => !VISION_UNSUPPORTED_RE.test(c.url) && !used.has(coverKey(c.url)));
        // Une image differente par projet quand la recherche en offre plusieurs
        info.cibles.forEach((idx, rang) => {
          const c = dispo[rang % Math.max(dispo.length, 1)];
          if (!c || used.has(coverKey(c.url))) return;
          used.add(coverKey(c.url));
          located[idx].coverSrc = c.url;
          located[idx].coverCredit = `Illustration générique (${info.libelle}) - ${c.credit}`;
          media.illustrated++;
          const pt = centroidOf(located[idx].geometry);
          send({ type: 'media-item', title: located[idx].title, credit: located[idx].coverCredit, coverSrc: c.url, lat: pt.lat, lng: pt.lng, generique: true });
        });
      });
      console.log(`[demo-generate] media: repli thématique appliqué sur ${entrees.reduce((s, [, i2]) => s + i2.cibles.length, 0)} projet(s)`);
    }
  }

  const illustrated = media.illustrated;
  console.log(`[demo-generate] media: ${illustrated}/${located.length} illustrés (${media.tours} tranche(s))`);
  step('media', illustrated ? 'done' : 'skip', 'Illustrations trouvées', `${illustrated}/${located.length} projets illustrés (image choisie par l'IA)`);
  // Refuser une photo hors sujet est une décision, pas un échec : on l'affiche
  if (located.length - illustrated > 0) {
    send({ type: 'rejected', kind: 'photo', count: located.length - illustrated });
  }

  state.media = null;
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

async function runSources(send, step, insee, ipHash, runState) {
  // cumulerTokens n'était appelé que par runPhase : la phase sources, qui
  // consomme pourtant de l'IA (choix du logo, tri des marchés), n'était jamais
  // comptée et le journal sous-estimait la dépense de toute une étape.
  const state = cumulerTokens(await coreSources(send, step, insee));
  if (!state) return;
  // Le run voyage dans le brouillon : les cinq invocations suivantes sont des
  // processus distincts, c'est le seul fil qui les relie a la meme generation.
  if (runState?.id) {
    state.run = { id: runState.id, startedAt: runState.startedAt };
    await patchRun(runState.id, {
      commune_nom: state.commune.nom,
      sources_count: state.stats?.sources ?? null,
      phase: 'sources',
      // Trace durable : le site de la commune a-t-il pu etre lu ?
      ...(state.stats?.site_bloque ? { error_message: 'site de la commune : lecture automatique bloquee' } : {}),
      tokens_in: state.stats?.tokens_in ?? 0,
      tokens_out: state.stats?.tokens_out ?? 0,
      ia_calls: state.stats?.appels_ia ?? 0,
    });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    /* Local : pas de persistance possible, on enchaîne tout dans l'invocation.
       Les phases découpées en tranches sont rejouées sur place tant qu'elles
       demandent la main, exactement comme le ferait le client en production. */
    const enchainer = async (core, s) => {
      let courant = s;
      for (let tour = 0; tour < GEO_MAX_TOURS && courant; tour++) {
        courant = await core(send, step, courant);
        if (!courant?.__continue) return courant;
        delete courant.__continue;
      }
      return courant;
    };
    const s2 = await coreAi(send, step, state);
    if (!s2) return;
    const s3 = await enchainer(coreGeo, s2);
    // coreGeo renonce quand trop peu de projets sont situés : il a déjà expliqué
    // pourquoi à l'écran, on s'arrête là plutôt que de casser sur un état nul.
    if (!s3) return;
    const s4 = await enchainer(coreMedia, s3);
    if (!s4) return;
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
  if (runState?.id) await patchRun(runState.id, { ville });
  send({ type: 'phase', next: 'ai', ville });
}

// Wrapper commun des phases intermediaires : charge le brouillon a l'etat
// attendu, execute le coeur, sauvegarde, annonce la phase suivante. Si le coeur
// renonce (state null : sources insuffisantes en ai), echec definitif propre.
async function runPhase(send, step, ville, { expect, core, nextStatus, nextPhase, selfPhase }, runState) {
  const instance = await getInstance({ ville });
  /* Le run est retrouvé AVANT tout contrôle : sans cela, un abandon sur
     « analyse introuvable » laissait la ligne du journal en `running`, donc
     indiscernable d'un visiteur qui ferme son onglet. Le symptôme le plus utile
     à voir serait précisément celui qu'on ne verrait pas. */
  if (runState && instance?.payload?.run?.id) {
    runState.id = instance.payload.run.id;
    runState.startedAt = instance.payload.run.startedAt || runState.startedAt;
  }

  let statut = instance?.status;
  const ageMin = instance ? (Date.now() - new Date(instance.created_at).getTime()) / 60000 : Infinity;

  /* Guérison d'un verrou resté en place. Une invocation tuée en plein vol laisse
     le statut de transit `running-<suite>` : son catch n'a pas pu le relâcher.
     Le client, lui, reprend désormais directement sur la phase courante au lieu
     de repasser par la route d'analyse, qui était le seul endroit sachant
     débloquer ce cas. Sans cette guérison ici, un simple hoquet réseau pendant
     une tranche terminait la démo sur un échec, brouillon intact et IA déjà
     payée. Le découpage en tranches multiplie les occasions : une métropole
     enchaîne dix à trente invocations au lieu de six. */
  if (instance?.payload && statut === `running-${nextStatus}` && ageMin < 15) {
    console.warn(`[demo-generate] verrou de transit relâché sur ${ville} (${statut})`);
    await updateInstance(ville, { status: expect });
    statut = expect;
  }

  // La phase a déjà abouti et c'est l'annonce qui s'est perdue : on avance au
  // lieu de refaire le travail (et de le repayer).
  if (instance?.payload && statut === nextStatus) {
    send({ type: 'phase', next: nextPhase, ville });
    return;
  }

  if (!instance?.payload || statut !== expect) {
    /* Rejouable : la route d'analyse sait retrouver la bonne phase depuis
       n'importe quel état avancé. Marquer cette erreur définitive coupait la
       seule protection contre une coupure réseau au milieu d'une génération. */
    send({
      type: 'error',
      message: 'Reprise de l\'analyse...',
      retryable: true,
      debug: `phase inattendue : ${statut || 'aucune instance'} (attendu ${expect})`,
    });
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
    // Renoncement propre du cœur (sources insuffisantes) : ce n'est pas une
    // panne, mais c'est un échec du point de vue du visiteur. Il est journalisé
    // comme tel, sinon ces communes-là resteraient invisibles.
    await updateInstance(ville, { status: 'failed', payload: null });
    if (runState) {
      runState.closed = true;
      await closeRun(runState.id, 'failed', { phase: nextPhase, error: runState.lastError || 'sources insuffisantes', startedAt: runState.startedAt });
    }
    return;
  }
  /* Phase INACHEVEE : le cœur a consommé son budget de temps sans finir.
     Depuis que le nombre de projets n'est plus plafonné, la localisation d'une
     métropole ne tient plus dans une seule invocation. On sauvegarde l'avancée,
     on remet l'instance dans son état d'entrée, et on redemande LA MEME phase :
     elle reprendra à son curseur. Sans cela, le budget épuisé faisait
     simplement basculer tous les projets suivants en « non localisable ». */
  if (state.__continue && selfPhase) {
    delete state.__continue;
    await updateInstance(ville, { status: expect, payload: state });
    if (runState?.id) {
      await patchRun(runState.id, {
        phase: selfPhase,
        tokens_in: state.stats?.tokens_in ?? 0,
        tokens_out: state.stats?.tokens_out ?? 0,
        ia_calls: state.stats?.appels_ia ?? 0,
      });
    }
    send({ type: 'phase', next: selfPhase, ville });
    return;
  }

  await updateInstance(ville, { status: nextStatus, payload: state });
  if (runState?.id) {
    await patchRun(runState.id, {
      phase: nextPhase,
      tokens_in: state.stats?.tokens_in ?? 0,
      tokens_out: state.stats?.tokens_out ?? 0,
      ia_calls: state.stats?.appels_ia ?? 0,
    });
  }
  send({ type: 'phase', next: nextPhase, ville });
}

const runAi = (send, step, ville, rs) => runPhase(send, step, ville, { expect: 'draft-sources', core: coreAi, nextStatus: 'draft-ai', nextPhase: 'locate' }, rs);
const runLocate = (send, step, ville, rs) => runPhase(send, step, ville, { expect: 'draft-ai', core: coreGeo, nextStatus: 'draft-locate', nextPhase: 'media', selfPhase: 'locate' }, rs);
const runMedia = (send, step, ville, rs) => runPhase(send, step, ville, { expect: 'draft-locate', core: coreMedia, nextStatus: 'draft-media', nextPhase: 'redact', selfPhase: 'media' }, rs);
const runRedact = (send, step, ville, rs) => runPhase(send, step, ville, { expect: 'draft-media', core: coreRedact, nextStatus: 'draft', nextPhase: 'create' }, rs);

/* Article du projet numero i, ou rien.
   Le repli positionnel `articles[i]` a ete retire : la liste d'articles est
   ordonnee mais TROUEE (un lot de redaction en echec est avale et rend []).
   Prendre le i-eme element d'une liste trouee posait l'article d'un projet sur
   la fiche d'un AUTRE. Une fiche sans article est un manque ; une fiche avec
   l'article du voisin est une faute qu'un elu voit en trois secondes. */
function articleDuProjet(articles, i) {
  return (articles || []).find((a) => a && a.index === i) || null;
}

/* ─── Phase CREATE : matérialisation du brouillon (invocation courte) ─── */

async function runCreate(send, step, ville, runState) {
  const createItem = (label) => send({ type: 'create-item', label });
  const t0 = Date.now();

  const instance = await getInstance({ ville });
  if (!instance) {
    send({ type: 'error', message: 'Brouillon introuvable : relancez la génération.' });
    return;
  }
  if (runState && instance.payload?.run?.id) {
    runState.id = instance.payload.run.id;
    runState.startedAt = instance.payload.run.startedAt || runState.startedAt;
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
    const article = articleDuProjet(articles, i);
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
    const article = articleDuProjet(articles, i);
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

  /* Le branding en DERNIER : l'espace ne devient public qu'avec ses fiches
     (plus jamais d'espace fantôme si l'invocation meurt en route).

     Le logo est tenté sur TOUS les candidats retenus, pas seulement le
     meilleur. Une seule tentative, sans repli et sans trace, faisait perdre le
     logo sur un simple délai dépassé ou un refus passager du serveur de la
     mairie, alors que trois autres adresses attendaient. Relevé en base : 7
     espaces sur 27 sans logo, dont deux communes dont le logo se télécharge
     parfaitement quand on rejoue la séquence. */
  let logoUrl = null;
  const candidatsLogo = [mairie.logoUrl, ...(mairie.logoCandidats || [])]
    .filter((u, i, tous) => u && tous.indexOf(u) === i)
    .slice(0, 5);
  for (const candidat of candidatsLogo) {
    try {
      // Délai propre, plus large que celui du moissonnage : c'est un fichier
      // unique et petit, pas une page de site à parcourir.
      const img = await fetchCapped(candidat, { headers: UA }, 15000, 4500000, true);
      if (!img) { console.warn(`[demo-generate] logo injoignable : ${candidat}`); continue; }
      /* Le type est lu dans les OCTETS, pas dans l'en-tête déclaré. Un serveur
         qui rend une page d'erreur en annonçant `image/png`, ou une image en
         annonçant `text/plain`, trompait le contrôle dans un sens comme dans
         l'autre. La signature binaire, elle, ne ment pas. */
      const vrai = typeImageReel(img.data);
      if (!vrai) {
        console.warn(`[demo-generate] logo rejeté (contenu non reconnu comme image) : ${candidat}`);
        continue;
      }
      logoUrl = await uploadToStorage(`branding/${ville}/logo.${vrai.ext}`, img.data, vrai.ct);
      createItem('Logo de la mairie installé');
      break;
    } catch (e) {
      console.warn(`[demo-generate] logo échec sur ${candidat} :: ${e?.message}`);
    }
  }
  if (!logoUrl) {
    // Silencieux jusqu'ici : l'espace prenait le logo Open Projets et personne
    // ne savait que la commune en avait un.
    console.warn(`[demo-generate] AUCUN logo installé pour ${ville} (${candidatsLogo.length} candidat(s) essayé(s))`);
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
  // Clôture du journal. `startedAt` remonte à la PREMIERE invocation : c'est la
  // seule durée qui corresponde à ce que le visiteur a réellement attendu.
  if (runState) {
    runState.closed = true;
    await patchRun(runState.id, {
      tokens_in: stats?.tokens_in ?? 0,
      tokens_out: stats?.tokens_out ?? 0,
      ia_calls: stats?.appels_ia ?? 0,
    });
    await closeRun(runState.id, 'ready', { phase: 'create', projectsCount: rows.length, startedAt: runState.startedAt });
  }
  const totalMs = runState?.startedAt ? Date.now() - runState.startedAt : Date.now() - t0;
  console.log(`[demo-generate] espace prêt: ${ville} (${rows.length} fiches, ${coverUrls.filter(Boolean).length} illustrées, création ${Date.now() - t0}ms, total ${Math.round(totalMs / 1000)}s)`);
  step('create', 'done', 'Espace prêt', commune.nom);
  send({
    type: 'done',
    url: `/?city=${ville}`,
    ville,
    communeNom: commune.nom,
    communeInsee: instance.commune_insee,
    projectsCount: rows.length,
    stats,
  });
}

/* ─── Handler SSE ─── */

export default async (req, context) => {
  const url = new URL(req.url);
  const phase = url.searchParams.get('phase') || 'analyse';
  const insee = (url.searchParams.get('commune') || '').toUpperCase();
  const villeParam = url.searchParams.get('ville') || '';

  // La lettre des codes corses est en DEUXIEME position (2A004, 2B033), pas en
  // troisieme : l'ancien motif \d{2}[0-9AB]\d{2} refusait les 360 communes de
  // Corse, qui partaient en 400 puis en quatre reprises identiques a l'ecran.
  if (phase === 'analyse' && !INSEE_RE.test(insee)) {
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

  // Le compteur de tokens est de portee module : sur un conteneur reutilise il
  // cumulerait depuis le demarrage du conteneur et gonflerait le cout affiche.
  resetTokens();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      /* Suivi de la generation en cours dans le journal demo_runs. Il est
         partage par toutes les branches : le `finally` s'en sert pour clore un
         run reste ouvert, ce qui est precisement le cas des echecs qu'on ne
         voyait pas. */
      const runState = { id: null, startedAt: Date.now(), closed: false, lastError: null, definitif: false };

      const send = (obj) => {
        // Toute erreur envoyee au client est aussi tracee serveur : plus aucun
        // echec silencieux (meme ceux qui ne passent pas par le catch)
        if (obj.type === 'error') {
          runState.lastError = obj.message;
          if (obj.retryable !== true) runState.definitif = true;
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
          await runAi(send, step, villeParam, runState);
        } else if (phase === 'locate') {
          await runLocate(send, step, villeParam, runState);
        } else if (phase === 'media') {
          await runMedia(send, step, villeParam, runState);
        } else if (phase === 'redact') {
          await runRedact(send, step, villeParam, runState);
        } else if (phase === 'create') {
          await runCreate(send, step, villeParam, runState);
        } else {
          // Idempotence / reprise :
          //  - carte prête -> on la montre (on n'y touche plus : sécurité clients)
          //  - brouillon RÉCENT (< 15 min, génération en cours) -> reprise
          //  - échec, ou brouillon ancien/abandonné -> on repart de ZÉRO (aucun
          //    verrou : une commune non terminée doit toujours être relançable)
          /* Relance volontaire : `regen=1` refait le recensement d'une commune
             deja generee au lieu d'ouvrir l'espace existant. L'adresse de
             l'espace ne change pas, ses fiches sont remplacees (runCreate fait
             deja le menage avant d'inserer). C'est ce qui permet de remontrer
             une commune apres une amelioration du systeme, et de rafraichir un
             espace de prospection sans changer le lien deja envoye. */
          const regen = url.searchParams.get('regen') === '1';
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

          if (already?.status === 'ready' && !regen) {
            step('resolve', 'done', 'Commune reconnue', already.commune_nom);
            step('exists', 'done', 'Espace déjà généré', 'On vous y emmène');
            send({
              type: 'done',
              url: `/?city=${already.ville}`,
              ville: already.ville,
              communeNom: already.commune_nom,
              communeInsee: already.commune_insee,
              existing: true,
            });
          } else if (already && RESUME[already.status] && ageMin < 15 && !regen) {
            step('resolve', 'done', 'Commune reconnue', already.commune_nom);
            step('exists', 'done', 'Analyse déjà engagée', 'Reprise là où elle s\'était arrêtée');
            send({ type: 'phase', next: RESUME[already.status], ville: already.ville });
          } else {
            // Échec, brouillon abandonné, ou relance volontaire : on efface la
            // ligne d'état pour repartir proprement. Le journal demo_runs, lui,
            // conserve la trace de la tentative précédente.
            if (already) {
              console.log(`[demo-generate] ${regen ? 'relance demandée' : 'redémarrage de zéro'} pour ${insee} (ancien statut ${already.status}, ${Math.round(ageMin)} min)`);
              await deleteWhere('demo_instances', { ville: `eq.${already.ville}` });
            }
            const ipHash = (await sha256Hex(context?.ip || 'inconnu')).slice(0, 24);
            const kioskOk = process.env.DEMO_KIOSK_KEY
              && url.searchParams.get('k') === process.env.DEMO_KIOSK_KEY;
            const [byIp, global] = await Promise.all([countToday('ip_hash', ipHash), countToday(null, null)]);
            if (global >= MAX_GLOBAL_PER_DAY || (!kioskOk && byIp >= MAX_PER_IP_PER_DAY)) {
              send({ type: 'error', message: 'Le quota de démonstrations du jour est atteint. Contactez-nous pour une démo guidée.' });
            } else {
              // Le run est ouvert AVANT le recensement : une commune introuvable
              // ou sans sources exploitables laisse ainsi une trace, alors
              // qu'elle disparaissait totalement du système.
              runState.id = await createRun({
                commune_insee: insee,
                commune_nom: already?.commune_nom || '',
                ip_hash: ipHash,
                kiosk: Boolean(kioskOk),
                regen: Boolean(regen && already),
                phase: 'sources',
              });
              await runSources(send, step, insee, ipHash, runState);
            }
          }
        }
      } catch (err) {
        console.error(`[demo-generate] ERREUR phase=${phase} cible=${villeParam || insee} ::`, err?.stack || err?.message || err);
        runState.crashMessage = String(err?.message || err).slice(0, 300);
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
        /* Cloture du journal. Trois issues possibles pour une invocation :
           - elle a livre l'espace : runCreate a deja clos le run ;
           - elle passe la main a la phase suivante : le run reste ouvert, c'est
             normal, la phase suivante le reprendra ;
           - elle s'arrete sur une erreur DEFINITIVE : c'est ici qu'on la
             consigne. Les erreurs rejouables ne closent rien, la reprise doit
             pouvoir aboutir.
           Un run laisse en `running` sans suite est lui-meme une information :
           c'est le visiteur qui a ferme l'onglet. */
        if (runState.id && !runState.closed && runState.definitif) {
          runState.closed = true;
          await closeRun(runState.id, 'failed', {
            phase,
            error: runState.crashMessage || runState.lastError,
            startedAt: runState.startedAt,
          });
        }
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

/**
 * Primitives exposées pour vérification directe.
 *
 * Ce module est le tunnel de démo : il parcourt des sites de mairie, des PDFs
 * et de la presse. Ses gardes (URL publique uniquement, bornes géographiques,
 * type d'image réel) ne sont atteignables autrement qu'en lançant une
 * génération complète, donc jamais vérifiés. Rien d'autre ne les importe.
 */
export const _internals = {
  INSEE_RE,
  isSafePublicUrl,
  slugify,
  stripHtml,
  hostOf,
  communeHost,
  unaccentLower,
  bboxOfContour,
  geometryExtentKm,
  extentAcceptable,
  geometryInBbox,
  centroidOf,
  haversineM,
  typeImageReel,
  looksLikeCode,
  estPageTremplin,
  collectPageLinks,
  essaisNominatim,
  sansPrefixeGenerique,
  nomCoherent,
  rangStructurel,
  positionDansLaCommune,
  locationQueries,
  unescapeBoamp,
  odonymesDe,
  distinctiveWords,
};
