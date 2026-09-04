/* ============================================================================
   FONCTION DEMO-GENERATE - route /api/demo-generate (SSE, deux phases)

   Phase « analyse » (par défaut) : recensement multi-sources en direct
   (site de la mairie + pages projets + PDFs officiels, presse locale lue en
   entier, marchés publics BOAMP), sélection IA en deux passes streamées avec
   citations obligatoires, localisation hybride (emprises réelles OSM,
   adresses BAN), illustrations (visuels officiels jugés par l'IA, puis vue
   aérienne IGN du lieu), un article recherché et rédigé par fiche. Résultat
   sauvegardé en brouillon
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
// Socle de rédaction partagé avec l'outil de l'admin : structure de l'article,
// nettoyage des liens, construction du bloc de sources citées.
import { promptArticle, retirerLesLiens, sourcesDesAnnotations, blocSources, hoteLisible } from './lib/redaction.mjs';
import {
  chargerReseau, reseauEnGeojson, zoneParInsee,
  STYLE_COUCHE_TRANSPORTS, NOM_COUCHE_TRANSPORTS, CATEGORIE_TRANSPORTS,
} from './lib/transit-osm.mjs';
// Mecanique d'exploration : registre des pages vues, file de ce qui reste a
// ouvrir, rapprochement des projets decrits par plusieurs pages.
import {
  FileExploration, empreinteGabarit, retirerGabaritConnu, GABARIT_RESTE_MIN,
  regrouper, fondre, normaliserUrl,
} from './lib/demo-exploration.mjs';

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
/* Modele des TACHES UNITAIRES : lire une page, trier des intitules. Ce sont de
   petits problemes fermes - une page, une question - la ou l'ancien modele
   posait un probleme enorme a un gros modele. Un modele leger y suffit et coute
   quinze fois moins ; a l'echelle de quatre-vingt-dix pages, c'est ce qui rend
   la lecture page par page MOINS chere que l'ancien depouillement en bloc.
   Verifie par comparaison sur Vannes avant adoption (voir demo/README.md). */
const OPENAI_MODEL_LIGHT = process.env.DEMO_OPENAI_MODEL_LIGHT || 'gpt-4o-mini';

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
// Pages filles, tirees uniquement des sommaires de projets (voir le second
// niveau de crawl dans inspectMairieSite)
/* Vivier de liens. Trois metropoles mesurees - Bordeaux, Montpellier, Colmar -
   saturent les 250 liens des l'accueil, ce qui veut dire qu'on choisissait
   parmi une liste deja coupee. Elargir le vivier ne coute que de la memoire :
   le nombre de pages REELLEMENT ouvertes reste commande par MAIRIE_PAGES. */
const LIENS_PAGE_MAX = 400;
const LIENS_NAVIGATION_MAX = 900;
/* Fenetre de lecture de l'accueil. A 500 Ko, on ne lisait que le cinquieme de
   l'accueil de lyon.fr, qui pese 2,45 Mo : les liens s'y trouvaient, on ne les
   voyait pas. Cette fenetre sert AUSSI a relever la navigation du site, qui est
   ce qui permet ensuite de distinguer le menu repete du contenu propre d'une
   page ; l'elargir profite donc deux fois. */
const ACCUEIL_MAX_BYTES = 2500000;
/* Pages lues en parallele. Mesure sur lyon.fr : six pages en 503 ms, sans
   aucun cout de calcul. Le facteur limitant est la latence du site, pas nous. */
// Texte conserve AVANT le retrait du gabarit : il faut voir la page entiere
// pour reconnaitre ce qui s'y repete d'une page a l'autre. La repartition de la
// place de lecture n'intervient qu'ensuite, sur du contenu reel.
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
/* Filet de securite de la branche mairie, en millisecondes.
   Ce n'est PAS ce qui corrige les communes bloquees : la cause etait un flux
   gzip jamais termine que l'abort ne debloquait pas (voir fetchCapped). Ce
   budget ne couvre que le cas restant : un site dont les pages sont si
   nombreuses et si lentes que la seule collecte epuiserait l'invocation.
   Mesure sur Ploudalmezeau une fois la cause corrigee : la branche complete
   tient en 34,6 s (18 pages lues). Le filet est donc pose au-dessus du normal
   observe, pas dessous : a 32 s il rognait une collecte qui aboutit.
   La presse et les marches publics repondent en 1 a 2 s et ne dependent pas de
   la mairie : quand le filet se declenche, le recensement continue avec eux. */
const MAIRIE_BUDGET_MS = 45000;
/* Part du budget reservee au PREMIER niveau de collecte. Le reste appartient
   aux pages filles, qui portent le detail des operations : sur un site lent,
   un premier niveau sans borne les condamnait purement et simplement. */

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

/* Champs d'un projet, partagés par la lecture d'une page et par le
   dépouillement des avis de marchés : c'est le même objet, décrit par deux
   sources différentes. Les décrire deux fois les ferait diverger au premier
   ajustement. */
const CHAMPS_PROJET = {
  title: { type: 'string', description: 'Nom court et propre du projet, sans le nom de la commune' },
  description: { type: 'string', description: '2 à 4 phrases factuelles en français, dates si connues, aucun superlatif' },
  category_slug: { type: 'string', enum: Object.keys(CATEGORIES) },
  place: { type: 'string', description: 'Lieu géocodable le plus précis (rue, quartier, équipement), vide si inconnu' },
  address: { type: 'string', description: 'Adresse postale EXACTE du projet SI elle figure telle quelle dans le texte (ex : "12 rue Voltaire" ou "avenue des Belges"). Recopie-la fidèlement. Chaîne vide si aucune adresse n\'est écrite - N\'INVENTE JAMAIS d\'adresse.' },
  geo_query: { type: 'string', description: 'Requête qui permettra de trouver CE projet sur une carte OpenStreetMap de la commune. Par ordre de préférence : l\'adresse (n° + rue), sinon une VOIE citée dans le texte au sujet de ce projet (ex : "rue de Kerjolys"), sinon le nom EXACT d\'un équipement (ex : "Centre nautique Robert Sautin"). N\'utilise le nom d\'un secteur ou d\'un quartier ("secteur de l\'ancienne gare") QUE si le texte ne cite aucune voie ni aucun équipement : un nom de secteur ne figure sur aucune carte et le projet ne pourra pas être situé. Chaîne vide seulement si aucun lieu n\'est identifiable.' },
  evidence_quote: { type: 'string', description: 'Citation exacte copiée MOT POUR MOT depuis le texte fourni, une seule phrase, 200 caractères maximum. C\'est la preuve que le projet existe : si tu ne peux pas citer, ne retiens pas le projet.' },
  confidence: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
};
const CHAMPS_PROJET_REQUIS = Object.keys(CHAMPS_PROJET);

/* LECTURE D'UNE PAGE : le cœur du nouveau modèle.

   Une page, un appel, deux questions posées ensemble : que décrit-elle, et où
   mène-t-elle. On ne demande plus à l'IA de dépouiller d'un coup l'équivalent
   d'un livre de cent cinquante pages, exercice où elle rate le milieu ; on lui
   soumet une page à la fois, ce qu'elle traite sans marge d'erreur.
   L'adresse du projet n'est pas demandée : c'est celle de la page lue, et la
   faire recopier par le modèle ne produisait que des approximations. */
const PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projets: {
      type: 'array',
      maxItems: 12,
      description: 'Projets d\'aménagement décrits par CETTE page. Tableau vide si la page n\'en décrit aucun, ce qui est le cas le plus fréquent.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: CHAMPS_PROJET,
        required: CHAMPS_PROJET_REQUIS,
      },
    },
    liens: {
      type: 'array',
      maxItems: 25,
      description: 'Index des liens de cette page qui mènent vraisemblablement à la description d\'une opération d\'aménagement. Tableau vide si aucun.',
      items: { type: 'integer' },
    },
    interet: {
      type: 'string',
      enum: ['forte', 'moyenne', 'nulle'],
      description: 'Cette page appartient-elle à une rubrique qui parle d\'aménagement du territoire ? "forte" pour une page de projet ou son sommaire, "nulle" pour une page de service, d\'état civil ou de vie associative.',
    },
  },
  required: ['projets', 'liens', 'interet'],
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

/* Corps JSON destiné à PostgreSQL, débarrassé de l'octet NUL.

   PostgreSQL refuse U+0000 dans `text` comme dans `jsonb` : SQLSTATE 22P05,
   « cannot be converted to text ». Or une page de mairie en ramène : relevé
   sur www.villeurbanne.fr, un seul NUL dans le texte collecté faisait rejeter
   TOUT l'insert du brouillon en 400. La collecte était bonne, les 32 pages
   étaient lues, et la génération mourait à l'écriture, sans rien laisser.

   Le nettoyage se fait sur la chaîne SERIALISEE : JSON.stringify échappe le
   NUL en six caracteres ASCII, donc un seul remplacement couvre tous les
   champs, a toutes les profondeurs, pour toutes les tables, sans parcourir
   l'objet. Le faire champ par champ laisserait passer le prochain.

   Ne jamais ecrire d'octet NUL litteral dans ce commentaire : il rendrait le
   fichier binaire pour grep et les outils de diff. */
const corpsJson = (valeur) => JSON.stringify(valeur).replace(/\\u0000/g, '');

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

/* Lecture d'un flux, bornee en TEMPS et en octets.

   Sortie en fonction a part pour deux raisons. D'abord parce que c'est ici que
   se jouait le blocage : `AbortController.abort()` NE DEBLOQUE PAS un
   `reader.read()` deja en attente quand le serveur repond en gzip sans
   content-length et ne termine jamais proprement son flux. La promesse de
   read() reste pendante POUR TOUJOURS, ni le catch ni le finally de l'appelant
   ne s'executent, et l'invocation entiere se fige. Mesure sur
   www.ploudalmezeau.fr (Node 20) : en-tetes a 201 ms, abort a 8 s, puis plus
   rien. La course ci-dessous est la seule borne reellement effective.

   Ensuite parce que `fetchCapped` refuse par construction toute adresse locale
   (garde anti-SSRF) : le cas ne serait pas atteignable depuis un test sans
   affaiblir cette garde. Ici, un lecteur de flux se fabrique a la main.

   Ce qui a deja ete lu est CONSERVE, comme au plafond d'octets : une page
   tronquee reste exploitable, une invocation figee ne l'est pas. */
async function lireFluxBorne(reader, finLecture, maxBytes) {
  const chunks = [];
  let total = 0;
  let tronque = false;
  while (true) {
    const lu = await Promise.race([
      reader.read(),
      sleep(Math.max(0, finLecture - Date.now())).then(() => null),
    ]);
    if (!lu) {
      tronque = true;
      try { await reader.cancel(); } catch { /* flux déjà clos */ }
      break;
    }
    if (lu.done) break;
    chunks.push(lu.value);
    total += lu.value.byteLength;
    if (total >= maxBytes) { try { await reader.cancel(); } catch { /* flux déjà clos */ } break; }
  }
  return { chunks, total, tronque };
}

/* Corps JSON, borné lui aussi.

   `fetchWithTimeout` annule son minuteur DES QUE LES EN-TETES ARRIVENT : passé
   ce point, `r.json()` lit le corps sans aucune borne. Un serveur qui répond
   puis fige son flux gèle donc l'invocation entière, exactement comme le gzip
   jamais terminé de fetchCapped, mais sans même le garde-fou de l'abort.
   Toute lecture de corps du fichier passe par ici. */
async function lireJson(r, ms = FETCH_TIMEOUT_MS, maxBytes = 8000000) {
  if (!r?.body) return r.json();
  const { chunks, total, tronque } = await lireFluxBorne(r.body.getReader(), Date.now() + ms, maxBytes);
  if (tronque) throw new Error(`corps JSON interrompu apres ${ms} ms (${total} o lus)`);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  return JSON.parse(new TextDecoder().decode(buf));
}

// Fetch borné en temps ET en octets pendant toute la lecture du corps
// (fetchWithTimeout ne couvre que les en-têtes : un serveur lent ou une
// réponse géante pouvait bloquer la fonction ou saturer la mémoire)
async function fetchCapped(url, opts = {}, ms = FETCH_TIMEOUT_MS, maxBytes = 500000, asBuffer = false) {
  if (!isSafePublicUrl(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const finLecture = Date.now() + ms;
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    // Revalide l'hôte final : une redirection a pu mener vers du privé
    if (!r.ok || !r.body || !isSafePublicUrl(r.url)) return null;
    const { chunks, total, tronque } = await lireFluxBorne(r.body.getReader(), finLecture, maxBytes);
    if (tronque) console.warn(`[demo-generate] lecture interrompue apres ${ms} ms sur ${hostOf(url)} (${total} o lus)`);
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

// Empreinte d'une chaine OU d'un bloc d'octets. La variante binaire sert a
// reconnaitre l'image vide que rend un service cartographique hors de sa zone
// de couverture, qu'aucun code HTTP ne signale.
async function sha256Hex(entree) {
  const octets = typeof entree === 'string' ? new TextEncoder().encode(entree) : entree;
  const buf = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hostOf(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; }
}

/* Les lots s'enchainent EN SERIE : un lot lent retarde tous les suivants. Sur
   un site dont chaque page pese 190 Ko et repond en 2 s, dix lots de six
   suffisaient a depasser a eux seuls le mur d'invocation. `echeance` arrete la
   serie proprement et rend ce qui a deja ete collecte, au lieu de laisser
   l'invocation se faire tuer avec tout son travail. */
async function inChunks(items, size, worker, echeance = Infinity) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    if (Date.now() >= echeance) {
      console.warn(`[demo-generate] echeance atteinte : ${items.length - i} element(s) sur ${items.length} non traites`);
      break;
    }
    out.push(...await Promise.all(items.slice(i, i + size).map(worker)));
  }
  return out;
}

/* ─── Sources publiques ─── */

async function resolveCommune(insee) {
  const r = await fetchWithTimeout(
    `https://geo.api.gouv.fr/communes/${encodeURIComponent(insee)}?fields=nom,code,population,centre,departement,contour,epci&geometry=contour`
  );
  if (!r.ok) return null;
  return lireJson(r);
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

/* ─── L'ETAGE INTERCOMMUNAL ───

   Les operations structurantes d'une petite commune - voirie metropolitaine,
   tram, logement social - vivent sur le site de son intercommunalite, pas sur
   le sien : mesure sur Quincieux, la Metropole de Lyon y investit douze
   millions pendant que quincieux.fr parle du parc de la mairie. On n'explore
   PAS ce site en entier, il peut etre enorme : on ne retient que les pages
   dont l'adresse ou l'intitule NOMME la commune, plus une poignee de rubriques
   d'amenagement ou la descente pourra la chercher. */
const EPCI_HUBS_MAX = 10;
const EPCI_CANDIDATES_MAX = 40;
const EPCI_HUB_RE = /amenag|projet|travaux|chantier|urbanis|grand-projet|quartier/i;

// Nom distinctif d'un EPCI pour l'annuaire : « CC du Pays d'Iroise » s'y
// appelle « Communaute de communes - Pays d'Iroise », on cherche la partie
// qui ne change pas.
function nomDistinctifEpci(nom) {
  return String(nom || '')
    .replace(/^(CC|CA|CU|Communaut[eé] de communes|Communaut[eé] d'agglom[eé]ration|Communaut[eé] urbaine|M[eé]tropole)\s*(du|de la|de l'|des|de|d')?\s*/i, '')
    .trim();
}

async function findEpciSite(nomEpci) {
  try {
    const distinctif = nomDistinctifEpci(nomEpci) || nomEpci;
    const u = new URL('https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records');
    u.searchParams.set('where', `pivot like "epci" and nom like "${distinctif.replace(/"/g, '')}"`);
    u.searchParams.set('select', 'nom,site_internet');
    u.searchParams.set('limit', '1');
    const r = await fetchWithTimeout(u.toString(), {}, 7000);
    if (!r.ok) return null;
    const rec = (await lireJson(r))?.results?.[0];
    let sites = rec?.site_internet;
    if (typeof sites === 'string') { try { sites = JSON.parse(sites); } catch { return null; } }
    const site = (Array.isArray(sites) ? sites : [sites]).map((x) => x?.valeur).find((v) => v && isSafePublicUrl(v));
    return site || null;
  } catch { return null; }
}

/* Adresses candidates de l'etage intercommunal : la « recherche ciblee » se
   fait dans le plan du site, filtre par le nom de la commune. */
async function amorcerEpci(nomEpci, communeNom) {
  const site = await findEpciSite(nomEpci);
  if (!site) return null;
  const home = await fetchCapped(site, { headers: UA }, FETCH_TIMEOUT_MS, ACCUEIL_MAX_BYTES);
  if (!home || estPageTremplin(home.data)) return null;
  const host = new URL(home.url).host;
  const slug = slugify(communeNom);
  const motCommune = unaccentLower(communeNom);

  const liens = [];
  collectPageLinks(home.data, home.url, host, liens);
  const sitemap = await fetchSitemapUrls(home.url);
  for (const e of sitemap.slice(0, 2000)) {
    liens.push({ url: e.url, label: libelleDuChemin(e.url) });
  }

  const nommees = [];
  const hubs = [];
  const vus = new Set();
  for (const l of liens) {
    const cle = normaliserUrl(l.url);
    if (vus.has(cle)) continue;
    vus.add(cle);
    const meule = unaccentLower(`${l.url} ${l.label}`);
    if (meule.includes(slug) || meule.includes(motCommune)) {
      if (nommees.length < EPCI_CANDIDATES_MAX) nommees.push(l);
    } else if (EPCI_HUB_RE.test(l.url) && hubs.length < EPCI_HUBS_MAX) {
      hubs.push(l);
    }
  }
  console.log(`[demo-generate] intercommunalite ${host} : ${nommees.length} page(s) nommant ${communeNom}, ${hubs.length} rubrique(s) d'amenagement`);
  return { nom: nomEpci, host, accueilTexte: stripHtml(home.data).slice(0, PAGE_TEXT_BRUT_CHARS), candidates: [...nommees, ...hubs] };
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
    const data = await lireJson(r);
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
  while ((m = aRe.exec(html)) !== null && outLinks.length < LIENS_PAGE_MAX) {
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
// Sous ce nombre de pages, le calcul du gabarit n'a pas assez de matiere pour
// etre fiable : on ne retire rien plutot que de vider un corpus deja maigre.


/* Repartition de la place de lecture entre les pages.

   Chaque page etait coupee au meme nombre de caracteres, et ce nombre unique se
   trompait dans les deux sens. Mesure sur Lyon : quatre pages sur douze etaient
   amputees, dont une de 10 286 caracteres ramenee a 5 000, alors que le paquet
   envoye au modele n'etait rempli qu'a moitie. Mesure sur Ploudalmezeau : une
   seule page sur trente et une atteignait le plafond, la moyenne etant de
   2 192 caracteres. On coupait donc la matiere la ou il y en avait, et on
   reservait de la place la ou il n'y en avait pas.

   Deux passes, comme pour le paquet lui-meme : chacun sa part, puis le reliquat
   des pages courtes aux pages longues. L'ordre compte, il est celui du
   classement rendu par l'IA : si le reliquat vient a manquer, il doit manquer
   aux pages les moins prometteuses. */


/* Toutes les adresses internes d'une page, sans filtre de mot-cle.
   Sert a etablir la NAVIGATION du site depuis l'accueil : ce qui figure sur
   l'accueil est du menu, ce qui n'apparait que sur une page de sommaire est son
   contenu propre. */
function collectAllInternalLinks(html, baseUrl, host, out) {
  const aRe = /<a[^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = aRe.exec(html)) !== null && out.size < LIENS_NAVIGATION_MAX) {
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
const SITEMAP_CHEMINS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml'];
const SITEMAP_SOUS_MAX = 6;
const SITEMAP_URLS_MAX = 400;
const SITEMAP_MAX_BYTES = 3000000;

/* Le sitemap n'est pas toujours a l'un des chemins d'usage : lyon.fr et
   brest.fr ne repondent sur aucun des quatre. La seule facon fiable de le
   trouver est de demander au site ou il se trouve, ce que robots.txt dit
   explicitement quand il existe. Les adresses d'un autre domaine sont ecartees :
   c'est une porte de sortie que la garde des adresses publiques ne verrait
   pas passer. */
async function cheminsDeSitemap(baseUrl) {
  const chemins = [];
  try {
    const r = await fetchCapped(new URL('/robots.txt', baseUrl).toString(), { headers: UA }, 8000, 200000);
    const hote = new URL(baseUrl).host;
    for (const ligne of String(r?.data || '').split('\n')) {
      const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(ligne);
      if (!m) continue;
      try {
        const u = new URL(m[1], baseUrl);
        if (u.host === hote && isSafePublicUrl(u.toString())) chemins.push(u.toString());
      } catch { /* ligne illisible */ }
    }
  } catch { /* robots.txt absent : ce n'est pas une anomalie */ }
  return [...chemins, ...SITEMAP_CHEMINS.map((c) => new URL(c, baseUrl).toString())];
}

// Un 404 servi en HTML avec un code 200 entrerait sinon dans le lecteur de
// sitemap, qui n'y trouverait rien mais aurait consomme sa tentative.
const estDuXml = (s) => /^\s*(<\?xml|<urlset|<sitemapindex)/i.test(String(s || '').slice(0, 200));

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
  for (const chemin of await cheminsDeSitemap(baseUrl)) {
    let r;
    try {
      r = await fetchCapped(chemin, { headers: UA }, 12000, SITEMAP_MAX_BYTES);
    } catch { continue; }
    if (!r || !estDuXml(r.data)) continue;
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

async function inspectMairieSite(siteUrl, communeNom, onFinding, echeance = Infinity) {
  const out = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [], images: [], candidates: [], accueilTexte: '', bloque: false, tronque: false, octets: 0 };
  const home = await fetchCapped(siteUrl, { headers: UA }, FETCH_TIMEOUT_MS, ACCUEIL_MAX_BYTES);
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
  /* Le texte de l'accueil sert de REFERENCE pour reconnaitre le gabarit du
     site : il porte le menu, le pied de page et le bandeau de cookies,
     c'est-a-dire tout ce qui se repete de page en page. */
  out.accueilTexte = stripHtml(html).slice(0, PAGE_TEXT_BRUT_CHARS);
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

  /* Le sitemap n'est un gain que s'il reste du temps pour ouvrir ce qu'il
     revele : sans budget, il ne ferait qu'allonger la liste de candidats d'un
     tri IA qu'on ne pourra pas honorer. */
  const sitemap = Date.now() >= echeance ? [] : await fetchSitemapUrls(home.url);
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

  /* AMORCAGE de l'exploration.

     Cette fonction ne telecharge plus aucune page de contenu : elle prepare la
     liste des candidates, et c'est l'exploration qui les ouvrira une par une en
     decidant au fur et a mesure ou descendre. Le crawl a deux niveaux qui vivait
     ici a disparu avec son plafond de pages : on ne decide plus a l'avance
     combien lire, on s'arrete quand plus rien de neuf ne remonte.

     Les intitules restent la seule matiere pour amorcer, ce qui est correct :
     juger un lien sur son intitule est exactement ce qu'un humain fait devant un
     sommaire. La difference est qu'on ne joue plus toute la collecte sur ce
     jugement, puisque la lecture de chaque page le corrige aussitot. */
  out.candidates = links;
  out.navigation = [...navigation];
  console.log(`[demo-generate] amorcage ${out.host} : ${links.length} candidate(s)`);

  for (const pdf of out.pdfs.slice(0, 6)) {
    onFinding?.({ kind: 'pdf', title: pdf.label, domain: 'PDF officiel' });
  }
  return out;
}

// Presse locale : plafond global, quota par requete, age maximal, et nombre de
// titres annonces a l'ecran pendant la collecte.
const NEWS_MAX = 22;
const NEWS_PAR_REQUETE = 8;
const NEWS_AGE_MAX_MS = 3 * 365 * 24 * 3600 * 1000;
const NEWS_ANNONCES = 13;

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
      /* Quota PAR REQUETE. Le compteur etait global : sur une metropole, la
         premiere requete remplissait a elle seule les 22 places, et les deux
         autres etaient telechargees puis jetees. La troisieme est pourtant la
         plus specifiquement urbaine, elle cite les ZAC, les mediatheques et les
         ecoquartiers. Sur une petite commune, ou chaque requete rend moins que
         son quota, le comportement ne change pas. */
      let pourCetteRequete = 0;
      while ((m = itemRe.exec(xml)) !== null && items.length < NEWS_MAX && pourCetteRequete < NEWS_PAR_REQUETE) {
        const block = m[1];
        const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block)?.[1]?.trim();
        const link = /<link>([\s\S]*?)<\/link>/.exec(block)?.[1]?.trim();
        const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1]?.trim();
        /* La balise <source> porte le NOM du media dans son contenu et son
           adresse dans son attribut `url`. Seul le nom etait lu, si bien que
           l'ecran annoncait « news.google.com » comme media a chaque fois. */
        const src = /<source([^>]*)>([\s\S]*?)<\/source>/.exec(block);
        const source = src?.[2]?.trim() || '';
        const sourceUrl = /url=["']([^"']+)["']/.exec(src?.[1] || '')?.[1] || '';
        if (!title || !link || seen.has(title)) continue;
        if (pubDate && Date.now() - new Date(pubDate).getTime() > NEWS_AGE_MAX_MS) continue;
        seen.add(title);
        pourCetteRequete++;
        items.push({
          title,
          link,
          date: pubDate ? new Date(pubDate).toLocaleDateString('fr-FR') : '',
          source,
          sourceUrl,
        });
      }
    } catch { /* flux indisponible */ }
  }

  /* On ne telecharge PAS le corps des articles.

     Le lien d'un item Google News est une redirection encodee qui ne mene plus
     au media : mesure refaite le 24 aout 2026, les articles rendent 200 OK et
     580 Ko d'une coquille JavaScript, zero caractere d'article. Les recuperer
     supposerait de passer par un mecanisme interne non documente de Google,
     dont le flux restreint par ailleurs l'usage : c'est un choix qui ne se
     tranche pas dans le code.

     Restent les TITRES, souvent explicites (« Ce que l'on sait de la renovation
     du groupe scolaire Paul Bert »). Ils ne peuvent pas FONDER une fiche, qui
     exige une citation mot pour mot, une description factuelle et un lieu
     geocodable ; mesure sur Lyon, 22 titres ont produit zero projet. Ils
     corroborent en revanche utilement ce que la mairie annonce, et c'est a ce
     titre seul qu'ils entrent dans le corpus. Le CORPS des articles, lui,
     arrive par un autre chemin : l'etage presse (moissonnerLaPresse), qui
     obtient les adresses reelles via la recherche web d'OpenAI et lit chaque
     article un par un. */
  for (const item of items.slice(0, NEWS_ANNONCES)) {
    /* `annonce` et non `article` : ces titres sont des signaux vus dans les
       flux, pas des articles LUS. Le compteur d'articles lus appartient a
       l'etage presse, qui ouvre reellement les pages. */
    onFinding?.({ kind: 'annonce', title: item.title.replace(/ - [^-]+$/, ''), domain: item.source || hostOf(item.sourceUrl || item.link), date: item.date });
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
    const data = await lireJson(r);
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
/* Attente conseillee par le serveur. OpenAI renvoie soit `retry-after` en
   secondes, soit `retry-after-ms` en millisecondes ; on plafonne pour ne pas
   immobiliser une invocation deja bornee en duree. */
function attenteConseillee(headers) {
  const ms = Number(headers.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return Math.min(ms, 20000);
  const s = Number(headers.get('retry-after'));
  if (Number.isFinite(s) && s > 0) return Math.min(s * 1000, 20000);
  return null;
}

async function postOpenAI(body, timeoutMs = 120000, tries = 5) {
  let lastErr;
  let derniereReponse = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs);
      /* Cadence depassee (429) ou panne passagere (5xx) : la reponse ARRIVE,
         donc l'ancien code la rendait telle quelle et l'appelant levait
         aussitot. Une lecture de page etait alors definitivement perdue, jamais
         retentee, et la commune sortait appauvrie sans qu'aucune erreur ne le
         signale : seul le nombre de fiches trahissait le trou. Mesure du
         04/09/2026 sur un lot de generations simultanees : a quatre communes de
         front, 118 pages de mairie et 47 articles perdus de cette facon, contre
         zero a trois. Les coupures reseau, elles, etaient deja retentees plus
         bas : c'est la meme reprise, etendue aux refus qui repondent. */
      if (r.status === 429 || r.status >= 500) {
        derniereReponse = r;
        // Corps consomme pour liberer la connexion ; l'appelant ne lit que le statut
        try { await r.arrayBuffer(); } catch { /* corps deja clos */ }
        if (i === tries - 1) break;
        const attente = attenteConseillee(r.headers) ?? Math.min(1000 * 2 ** i, 8000);
        console.warn(`[demo-generate] OpenAI ${r.status}, nouvelle tentative ${i + 1}/${tries} dans ${Math.round(attente / 1000)} s`);
        await sleep(attente + Math.floor(Math.random() * 400));
        continue;
      }
      return r;
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
  // Toutes les tentatives epuisees sur un refus qui repond : on rend la derniere
  // reponse, l'appelant produit alors le meme message d'erreur qu'avant
  if (derniereReponse) return derniereReponse;
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
async function openAIStructured(input, schemaName, schema, maxTokens, timeoutMs = 120000, temperature = 0.2, model = OPENAI_MODEL, tries = 5) {
  const r = await postOpenAI({
    model,
    input,
    text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
    max_output_tokens: maxTokens,
    temperature,
  }, timeoutMs, tries);
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

/* ─── EXPLORATION : lire une page, en tirer des projets et la suite du chemin ───

   Consigne délibérément courte. Elle part à chaque page, donc chaque mot y est
   payé autant de fois qu'il y a de pages ; et il n'y a plus besoin des longues
   mises en garde de l'ancien dépouillement, qui existaient parce qu'un corpus
   énorme faisait lâcher les règles énoncées trop loin du point de génération. */
const PAGE_TEXTE_LU_MAX = 9000;
const PAGE_LIENS_SOUMIS = 60;

function consignePage(communeNom, cadre = 'mairie') {
  const entete = cadre === 'presse'
    ? `Tu dépouilles UN article de presse en ligne pour y trouver les projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES situés dans la commune de ${communeNom}.

L'article peut couvrir plusieurs communes ou toute une agglomération : ne retiens QUE les opérations situées à ${communeNom}. La presse rapporte aussi des intentions, des polémiques et des promesses : ne retiens que les opérations DÉCIDÉES, financées ou engagées, jamais une piste à l'étude ni une promesse de campagne.`
    : `Tu dépouilles UNE page du site officiel de ${communeNom} pour y trouver les projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES qui concernent cette commune.`;
  return `${entete}

Retiens un projet UNIQUEMENT si cette page le décrit vraiment, et si tu peux en recopier une phrase mot pour mot. Une simple mention en passant, un lien de menu ou un titre de rubrique ne sont pas une description : dans ce cas, rends une liste vide, ce qui est le cas le plus fréquent et ne pose aucun problème.

Un projet est une OPÉRATION : une construction, une rénovation, une extension, une requalification, annoncée, en cours ou récemment livrée. La page de présentation d'un équipement qui existe déjà - ses horaires, ses tarifs, sa réservation, son fonctionnement - n'est PAS un projet, même si l'équipement est photogénique.

Écarte ce qui n'est pas un aménagement du territoire : raccordement d'un concessionnaire de réseau (électricité, gaz, fibre), entretien courant, contrat de service, achat de matériel, événement, élection, fait divers. Écarte aussi les projets situés dans une AUTRE commune.

Si la page est une TRIBUNE ou l'expression d'un groupe politique, ne retiens RIEN : ce qu'un groupe réclame ou conteste n'est pas une opération attestée par la commune.

Une page peut décrire plusieurs opérations distinctes : un parking, une résidence, un équipement et une voie réaménagée sont des projets différents, même dans le même quartier.

Pour les LIENS : indique ceux qui mènent vraisemblablement à la description d'une opération, en jugeant sur leur intitulé. Ce sont eux qui guideront la suite de l'exploration, alors ne retiens ni les menus, ni les démarches administratives, ni les pages d'élus ou d'instances.`;
}

/* ─── TRI DE MASSE des adresses candidates ───

   Il ECARTE l'evident, il ne choisit pas les meilleures. La nuance est tout :
   sur trois cent vingt intitules, personne ne se trompe en refusant « etat
   civil », « menus de la cantine » ou « recensement citoyen », alors que
   deviner laquelle des deux cents pages restantes decrit un chantier est
   impossible sans l'ouvrir. L'ancienne selection faisait ce pari, en retenait
   trente, et se trompait : sur Lyon, la seule rubrique que l'accueil offrait
   etait de la gouvernance.

   Ce qui survit au tri est ouvert INTEGRALEMENT. Ce tri n'existe donc que pour
   ne pas payer la lecture de pages dont l'intitule dit deja qu'elles n'ont
   rien a voir avec l'amenagement du territoire. */
const TRI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ecarter: {
      type: 'array',
      description: "Index des pages dont l'intitulé montre qu'elles ne décriront jamais une opération d'aménagement.",
      items: { type: 'integer' },
    },
  },
  required: ['ecarter'],
};
const TRI_LOT_MAX = 150;

/* Une rubrique de PREMIER NIVEAU est un carrefour, pas une destination.
   Mesure sur Ploudalmezeau : le tri a ecarte « mairie » sur son intitule, alors
   que les fiches de projets de cette commune vivent sous
   /mairie/conseil-municipal/projets/. Le sitemap a sauve la mise cette fois-la,
   mais sur une commune sans sitemap, refuser le carrefour coupe l'acces a toute
   une branche du site. On ne juge donc jamais ces pages sur leur nom : elles
   sont peu nombreuses, et ce sont elles qui ouvrent le reste. */
function estUnCarrefour(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length <= 1;
  } catch { return false; }
}

// Au-dela, les pages racines ne sont pas des carrefours : le site est PLAT.
const CARREFOURS_MAX = 20;

async function ecarterLesHorsSujet(communeNom, liens) {
  if (liens.length <= TRI_LOT_MAX / 4) return liens;
  /* La protection des carrefours ne vaut que sur un site HIERARCHIQUE, ou les
     pages racines sont une poignee de rubriques qui ouvrent le reste. Mesure
     sur mairie-vannes.fr : toutes les pages y sont a la racine, et proteger
     « la racine » revenait a exempter le site entier du tri - 7 adresses
     ecartees sur 280, puis 267 lectures dont une bonne moitie pour rien. */
  const racines = liens.filter((l) => estUnCarrefour(l.url));
  const siteHierarchique = racines.length <= CARREFOURS_MAX;
  const carrefours = siteHierarchique ? racines : [];
  const aTrier = siteHierarchique ? liens.filter((l) => !estUnCarrefour(l.url)) : liens;
  const lots = [];
  for (let i = 0; i < aTrier.length; i += TRI_LOT_MAX) lots.push(aTrier.slice(i, i + TRI_LOT_MAX));

  const system = `Tu prepares le recensement des operations d'amenagement de la commune de ${communeNom} a partir de son site officiel. On va OUVRIR toutes les pages que tu ne rejettes pas : ton travail est uniquement d'ecarter celles dont l'intitule prouve deja qu'elles n'ont rien a voir.

ECARTE : demarches administratives, etat civil, inscriptions scolaires, menus de cantine, agenda culturel, vie associative, sport et loisirs, annuaire, contacts, recrutement, mentions legales, comptes rendus de conseil, elus et instances (adjoints, commissions, groupes politiques, organigramme), pages de compte ou de connexion, articles de vie quotidienne sans rapport avec un chantier.

N'ECARTE PAS une page dont l'intitule est vague, generique ou peu clair : dans le doute on ouvre, cela ne coute presque rien, alors qu'une page ecartee a tort fait disparaitre un projet de la carte. N'ecarte jamais une actualite, un sommaire, une rubrique de travaux, d'urbanisme, de cadre de vie ou de projets.

N'ecarte jamais non plus une RUBRIQUE, c'est-a-dire une page dont le chemin est court et l'intitule general (« mairie », « ma ville », « vivre ici ») : ce sont des carrefours qui menent ailleurs, et leur nom ne dit rien de ce qu'ils contiennent. Le patrimoine bati fait partie de l'amenagement des qu'il est question de le restaurer : n'ecarte une page de patrimoine que si elle raconte l'histoire ou la legende d'un lieu.`;

  const parLot = await inChunks(lots, 4, async (lot) => {
    try {
      const user = JSON.stringify(lot.map((l, i) => ({ index: i, intitule: l.label, chemin: l.url.replace(/^https?:\/\/[^/]+/, '') })), null, 0);
      const out = await openAIStructured(
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        /* Le tri reste sur le GRAND modele : c'est un jugement, pas une
           extraction. Mesure sur Vannes : le modele leger n'ecarte que 9
           adresses sur 280 la ou le grand en ecarte 189, et chaque adresse
           gardee a tort se paie ensuite en lecture. Le tri ne coute que
           quelques appels par generation, l'economie serait fausse. */
        'tri_liens', TRI_SCHEMA, 2000, 60000, 0.1
      );
      const ecartes = new Set((out.ecarter || []).filter((i) => Number.isInteger(i) && i >= 0 && i < lot.length));
      if (process.env.DEMO_DUMP) {
        // Ce que le tri refuse d'ouvrir. Sans cette trace, on ne peut ni
        // verifier qu'il ecarte bien, ni voir ce qu'il jette a tort.
        for (const i of ecartes) console.log(`[demo-tri] ECARTE : ${lot[i].label} (${lot[i].url.replace(/^https?:\/\/[^/]+/, '')})`);
      }
      return lot.filter((_, i) => !ecartes.has(i));
    } catch (e) {
      // Sans tri, on ouvre tout : c'est plus cher, jamais moins bon.
      console.warn(`[demo-generate] tri des liens indisponible, tout est ouvert :: ${e?.message}`);
      return lot;
    }
  });
  return [...carrefours, ...parLot.flat()];
}

/* Extrait de page centre sur une citation. Sans citation retrouvee, le debut
   de la page fait l'affaire : c'est la ou un CMS place le chapeau. */
function extraitAutourDe(texte, citation) {
  const t = String(texte || '');
  const at = citation ? t.indexOf(String(citation).slice(0, 40)) : -1;
  const from = at > 0 ? Math.max(0, at - 600) : 0;
  return t.slice(from, from + SOURCE_EXCERPT_CHARS).trim();
}

async function lirePage(commune, page, liens, cadre = 'mairie') {
  const listeLiens = liens.slice(0, PAGE_LIENS_SOUMIS);
  const user = `PAGE : ${page.title || '(sans titre)'}
ADRESSE : ${page.url}

TEXTE DE LA PAGE :
${page.text.slice(0, PAGE_TEXTE_LU_MAX)}

LIENS DE CETTE PAGE :
${listeLiens.length ? listeLiens.map((l, i) => `${i}. ${l.label}`).join('\n') : '(aucun)'}`;

  const out = await openAIStructured(
    [{ role: 'system', content: consignePage(commune.nom, cadre) }, { role: 'user', content: user }],
    /* Deux tentatives, pas cinq : une page perdue sur cent vingt ne coute
       rien, alors que cinq reprises avec recul exponentiel immobilisent une
       place de la vague pendant une demi-minute. C'est l'inverse du gros appel
       d'autrefois, ou tout reposait sur une seule reponse. */
    'lecture_page', PAGE_SCHEMA, 3000, 45000, 0.2, OPENAI_MODEL_LIGHT, 2
  );
  const projets = (out.projets || []).map((p) => ({
    ...p,
    // L'adresse de la source est celle de la page lue, jamais une recopie
    source_url: page.url,
    origine: 'commune',
    sources: [{ url: page.url, type: 'mairie' }],
    /* Un extrait de la page, centre sur la citation quand on la retrouve. Il
       sert deux fois : de matiere a l'article, et de repli au geocodage, car
       les pages citent souvent la voie en toutes lettres la ou le modele
       nomme le secteur (« ancienne gare » se geocode mal, « rue de Kerjolys »
       parfaitement). */
    page_excerpt: extraitAutourDe(page.text, p.evidence_quote),
  }));
  const suivants = [...new Set(out.liens || [])]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < listeLiens.length)
    .map((i) => listeLiens[i]);
  return { projets, suivants, interet: out.interet || 'moyenne' };
}


/* ─── ÉTAGE PRESSE ───

   La presse locale documente des opérations que ni le site de la commune ni
   celui de l'intercommunalité n'exposent (relevé sur Quincieux : la
   requalification du centre-bourg validée par la Métropole n'existe que dans
   la presse régionale). Les flux Google News étant illisibles (leurs liens
   rendent une coquille JavaScript) et le flux Bing réservé par ses conditions
   à un usage personnel, la découverte passe par la recherche web d'OpenAI,
   déjà employée pour la rédaction : ses ANNOTATIONS portent les adresses
   réelles des articles cités, jamais le texte du modèle (invité à écrire une
   adresse, il écrit un titre - mesuré). Les articles sont ensuite lus un par
   un par le même lecteur que les pages de mairie, sans suivre aucun de leurs
   liens, et seuls les projets qui NOMMENT la commune sont versés. */
const PRESSE_ARTICLES_MAX = 8;
const PRESSE_TIMEOUT_MS = 90000;
// Ce qui n'est pas un article lisible : agrégateurs, réseaux, portails de
// marchés (déjà couverts par le BOAMP), encyclopédies et documents bruts
const HORS_PRESSE = /news\.google\.|\bbing\.com|facebook\.|twitter\.|\bx\.com|linkedin\.|instagram\.|youtube\.|wikipedi|wikimedia|centraledesmarches|marchesonline|francemarches|klekoon|pappers\.|societe\.com|\.pdf($|[?#])/i;

async function chercherLaPresse(commune, epciNom, mairieHost) {
  const contexte = [epciNom, commune.departement?.nom ? `département ${commune.departement.nom}` : '']
    .filter(Boolean).join(', ');
  const corps = {
    model: ARTICLE_MODEL,
    input: [{
      role: 'system',
      content: `Tu cherches des ARTICLES DE PRESSE en ligne (journaux, sites d'actualités locales ou régionales) qui décrivent des opérations d'aménagement urbain dans la commune de ${commune.nom}${contexte ? ` (${contexte})` : ''} : requalification, logements, équipements publics, voirie, espaces publics. Fais au moins trois recherches distinctes avec des angles différents, et cite chaque article retenu. N'utilise NI le site de la commune elle-même, NI des documents PDF, NI des annuaires d'entreprises, NI des portails de marchés publics : uniquement des articles qui racontent une opération précise.`,
    }, {
      role: 'user',
      content: `Commune : ${commune.nom}. Quels articles de presse en ligne décrivent ses opérations d'aménagement ? Cite-les.`,
    }],
    max_output_tokens: 1600,
    /* Sortie LIBRE, à rebours de tout le reste du fichier : contrainte par un
       schéma, la réponse arrive sans annotations (mesuré), et les annotations
       sont la seule source d'adresses réelles. Le texte n'est jamais lu. */
    tools: [{ type: ARTICLE_OUTIL }],
  };
  const r = await postOpenAI(corps, PRESSE_TIMEOUT_MS);
  if (!r.ok) throw new Error(`recherche presse indisponible (${r.status})`);
  const data = JSON.parse(await readBody(r));
  logUsage('presse_recherche', data.usage);
  const { annotations } = texteEtCitations(data);
  const vus = new Set();
  const articles = [];
  /* Le site de la commune et ses sous-domaines ne sont pas de la presse : la
     mairie est deja lue par l'exploration, et malgre la consigne le moteur de
     recherche cite volontiers villeurbanne.fr ou un sous-domaine municipal
     (releve sur Villeurbanne). La comparaison ignore le prefixe www. */
  const domaineMairie = String(mairieHost || '').replace(/^www\./, '');
  for (const a of annotations) {
    const url = String(a?.url || '');
    if (!/^https?:\/\//i.test(url) || HORS_PRESSE.test(url)) continue;
    const hote = hostOf(url);
    if (!hote) continue;
    const nu = hote.replace(/^www\./, '');
    if (domaineMairie && (nu === domaineMairie || nu.endsWith(`.${domaineMairie}`))) continue;
    const cle = normaliserUrl(url);
    if (vus.has(cle)) continue;
    vus.add(cle);
    articles.push({ url, title: String(a?.title || '').trim() });
    if (articles.length >= PRESSE_ARTICLES_MAX) break;
  }
  return articles;
}

async function moissonnerLaPresse(send, step, state) {
  const { commune, mairie } = state;
  step('presse', 'start', 'Lecture de la presse locale', 'Recherche des articles qui documentent des opérations');
  let articles = [];
  try {
    articles = await chercherLaPresse(commune, state.epci?.nom, mairie.host);
  } catch (e) {
    console.warn(`[demo-generate] presse : recherche indisponible :: ${e?.message}`);
    step('presse', 'skip', 'Presse locale', 'recherche indisponible');
    return [];
  }
  if (!articles.length) {
    console.log(`[demo-generate] presse : aucune adresse d'article exploitable`);
    step('presse', 'skip', 'Presse locale', 'aucun article exploitable trouvé');
    return [];
  }
  console.log(`[demo-generate] presse : ${articles.length} article(s) a lire (${articles.map((a) => hostOf(a.url)).join(', ')})`);

  const slug = slugify(commune.nom);
  const mot = unaccentLower(commune.nom);
  const nommeLaCommune = (p) => {
    const meule = unaccentLower(`${p.title || ''} ${p.place || ''} ${p.address || ''} ${p.geo_query || ''} ${p.description || ''} ${p.evidence_quote || ''}`);
    return meule.includes(slug) || meule.includes(mot);
  };

  const recolte = [];
  let lues = 0;
  await inChunks(articles, 4, async (a) => {
    const page = await fetchCapped(a.url, { headers: UA }, 6000, 400000);
    if (!page) return;
    const texte = stripHtml(page.data).slice(0, PAGE_TEXT_BRUT_CHARS);
    // Un teaser d'article payant trop court ne peut fonder aucune citation
    if (texte.length < 400 || looksLikeCode(texte)) return;
    try {
      const lu = await lirePage(commune, { url: page.url, title: a.title, text: texte }, [], 'presse');
      lues++;
      for (const p of lu.projets) {
        if (!nommeLaCommune(p)) continue;
        p.origine = 'presse';
        p.sources = [{ url: p.source_url, type: 'presse' }];
        recolte.push(p);
        send({ type: 'ai-item', phase: 'ai1', title: p.title, quote: (p.evidence_quote || '').slice(0, 220), domain: hostOf(p.source_url) });
      }
      send({ type: 'finding', kind: 'article', title: a.title || hoteLisible(page.url), domain: hostOf(page.url) });
    } catch (e) {
      console.warn(`[demo-generate] presse : lecture perdue ${a.url} :: ${e?.message}`);
    }
  });
  console.log(`[demo-generate] presse : ${lues} article(s) lu(s), ${recolte.length} projet(s) retenus`);
  step('presse', 'done', 'Presse locale dépouillée', `${lues} article(s) lu(s), ${recolte.length} opération(s) documentée(s)`);
  return recolte;
}


/* ─── RÉDACTION D'UN ARTICLE ───

   Un appel PAR PROJET, avec recherche web, comme le fait l'outil de rédaction
   de l'admin. La démo écrivait auparavant trois articles par appel, à partir du
   seul extrait de ses sources, et le résultat s'en ressentait : mesure sur
   Lyon, des articles de 54 mots pour une cible annoncée de 150 à 250.

   Le lot a été supprimé pour une raison mesurée, pas par élégance : prié
   d'écrire trois articles en une fois avec une recherche à sa disposition, le
   modèle fait UNE recherche et rend UN article ; contraint d'en rendre trois,
   il n'en fait AUCUNE et invente trois articles de trois cents mots. Le lot est
   le pire des deux mondes. Un appel par projet règle les deux, et rattache en
   prime chaque citation au bon projet sans aucun travail.

   La recherche est RESTREINTE aux domaines déjà attestés pour ce projet : le
   site de la commune et les sources qui ont servi à l'établir. C'est ce qui
   permet d'aller chercher de la matière sans rouvrir la porte au blog de
   quartier, et donc de garder l'exigence de sourçage qui fait toute la valeur
   de cette démonstration. */
const ARTICLE_MAX_TOKENS = 1400;
// En deca, ce n'est pas un article : mieux vaut une fiche sans texte qu'une
// fiche portant une phrase d'excuse.
const ARTICLE_MIN_CHARS = 200;
const ARTICLE_TIMEOUT_MS = 60000;
// Modèle et outil de recherche. Sortis en constantes pour être ajustables sans
// toucher au code, les noms d'outils de l'API évoluant plus vite que ce fichier.
const ARTICLE_MODEL = process.env.DEMO_ARTICLE_MODEL || 'gpt-4.1';
const ARTICLE_OUTIL = process.env.DEMO_ARTICLE_TOOL || 'web_search';

/* Domaines où la recherche a le droit d'aller pour CE projet. */
function domainesAutorises(projet, mairieHost) {
  const hotes = new Set();
  if (mairieHost) hotes.add(mairieHost.replace(/^www\./, ''));
  for (const s of projet.sources || []) {
    const h = hostOf(s.url);
    if (h) hotes.add(h);
  }
  const cite = hostOf(projet.source_url);
  if (cite) hotes.add(cite);
  return [...hotes].filter(Boolean);
}

/* Texte et citations d'une réponse de l'API Responses.
   Les annotations sont la SEULE source d'adresses réelles : invité à remplir
   lui-même un champ d'URL, le modèle y écrit un jeton interne. */
function texteEtCitations(data) {
  const annotations = [];
  let texte = '';
  for (const item of data?.output || []) {
    for (const bloc of item?.content || []) {
      if (typeof bloc?.text === 'string') texte += bloc.text;
      if (Array.isArray(bloc?.annotations)) annotations.push(...bloc.annotations);
    }
  }
  return { texte: texte.trim(), annotations };
}

async function redigerArticle(commune, projet, pdfs, mairieHost) {
  const system = promptArticle({ commune: commune.nom, stricte: true });
  const domaines = domainesAutorises(projet, mairieHost);
  // Les intitules seuls : l'adresse ne sert qu'au rattachement, fait en code.
  const documents = pdfs.length
    ? pdfs.map((d) => `- ${d.label}`).join('\n')
    : '(aucun)';
  const user = `PROJET : ${projet.title}
${projet.place ? `LIEU : ${projet.place}\n` : ''}COMMUNE : ${commune.nom}
DESCRIPTION ÉTABLIE : ${projet.description || '(aucune)'}
EXTRAIT DES SOURCES OFFICIELLES :
${projet.source_excerpt || '(aucun extrait : reste sur la description, sans ajouter aucun détail)'}

DOCUMENTS OFFICIELS DISPONIBLES (recopie l'intitulé exact de celui qui porte sur CE projet, dans le champ prévu, et ne le cite jamais dans le corps du texte) :
${documents}

Consulte les pages des sources de ce projet pour compléter ce que l'extrait ne dit pas, puis rédige l'article.`;

  const corps = {
    model: ARTICLE_MODEL,
    input: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_output_tokens: ARTICLE_MAX_TOKENS,
    /* La sortie est CONTRAINTE, comme partout ailleurs dans ce fichier.
       Laissée libre, elle est publiée telle quelle sur la fiche, et le modèle
       s'adresse volontiers au demandeur : « Voici un texte factuel et sobre : »,
       ou pire « Je n'ai trouvé aucune information récente sur ce projet ».
       Ce qui se lit très bien dans une fenêtre de rédaction où un agent relit
       devient, sur une carte de démonstration, une fiche qui parle à un élu de
       ce que l'IA n'a pas trouvé. Le champ unique force l'article et rien
       d'autre ; les citations continuent de remonter normalement. */
    text: {
      format: {
        type: 'json_schema',
        name: 'article_projet',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            markdown: {
              type: 'string',
              description: "L'article en markdown, et lui seul : aucun préambule, aucune phrase adressée au lecteur de la consigne, aucun commentaire sur ce que tu as trouvé ou non.",
            },
            /* Le lien du document est construit EN CODE à partir de cet
               intitulé : le modèle ne recopie jamais une adresse fidèlement, et
               le nettoyage des liens supprimerait de toute façon celle qu'il
               aurait écrite dans le corps du texte. */
            document: {
              type: 'string',
              description: "Intitulé EXACT, recopié de la liste fournie, du document officiel qui porte sur CE projet précis. Chaîne vide si aucun document de la liste ne le concerne clairement.",
            },
          },
          required: ['markdown', 'document'],
        },
      },
    },
  };
  /* Sans domaine attesté, on n'ouvre pas la recherche : elle ramènerait des
     pages que rien ne rattache à ce projet, ce que cette démo s'interdit. */
  if (domaines.length) {
    corps.tools = [{ type: ARTICLE_OUTIL, filters: { allowed_domains: domaines } }];
  }

  const r = await postOpenAI(corps, ARTICLE_TIMEOUT_MS);
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`IA indisponible (${r.status}) ${detail.slice(0, 200)}`);
  }
  const data = JSON.parse(await readBody(r));
  logUsage('article', data.usage);
  const { texte, annotations } = texteEtCitations(data);
  if (!texte) throw new Error('Article vide');
  let markdown = '';
  let document = '';
  try {
    const sortie = JSON.parse(texte);
    markdown = String(sortie.markdown || '').trim();
    document = String(sortie.document || '').trim();
  } catch { markdown = ''; }
  // Un article illisible ou vide est un MANQUE, pas une panne : la fiche existe
  // quand même, avec sa description et son illustration.
  if (markdown.length < ARTICLE_MIN_CHARS) throw new Error('Article trop court ou illisible');

  const sources = sourcesDesAnnotations(annotations);
  /* Aucune citation ne remonte : la recherche n'a rien trouvé, ou n'a pas eu
     lieu. L'article n'en est pas moins écrit à partir de l'extrait, qui est
     attesté ; on cite alors la source d'origine du projet, comme avant. */
  const citees = sources.length
    ? sources
    : [{ url: projet.source_url, title: hoteLisible(projet.source_url) }].filter((s) => s.url);
  /* Le dossier officiel qui porte sur ce projet, rattache par son intitule.
     C'est ce qu'un elu ouvre en premier : la deliberation ou la concertation
     qui fonde l'operation. */
  const dossier = pdfs.find((d) => d.label && d.label.trim() === document);
  const blocDossier = dossier ? `\n\n## Document officiel\n\n- [${dossier.label}](${dossier.url})\n` : '';
  return `${retirerLesLiens(markdown)}${blocDossier}${blocSources(citees)}`;
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

/* ─── Ce que la carte publiée reçoit pour un projet ───

   Une emprise réelle est l'argument le plus fort de la démonstration, mais à
   l'échelle où la carte s'ouvre, une cour d'école de quarante mètres est un
   point de deux pixels : elle existe sans se voir. On publie donc, EN PLUS du
   contour et jamais à sa place, un repère ponctuel dès que l'emprise est trop
   petite pour se lire.

   Rien à ajouter côté carte : celle-ci pose déjà un marqueur de catégorie sur
   toute forme ponctuelle d'une contribution, et cadre la fiche sur l'ensemble
   des formes, si bien qu'un point posé à l'intérieur du contour ne déplace pas
   le cadrage. L'écran de génération fait d'ailleurs exactement ce choix depuis
   toujours : il pose une épingle et lève l'emprise pour chaque projet. La carte
   livrée ressemble enfin à celle que le visiteur a vue se construire. */

// Taille minimale, en pixels d'écran, sous laquelle une forme n'est plus lue
// comme une forme mais comme une bavure. L'épingle en fait quarante de haut.
const REPERE_MIN_PX = 24;
// Longueur de l'équateur en mètres, divisée par la taille d'une tuile : c'est
// la résolution d'une carte web au zoom 0, à l'équateur.
const RESOLUTION_ZOOM_0 = 156543.03;

function tailleMinimaleVisible(zoom, lat) {
  return (REPERE_MIN_PX * RESOLUTION_ZOOM_0 * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom);
}

/* Point de repère d'une géométrie.
   Sur un tracé, le sommet du milieu, qui est forcément SUR le tracé ; sur une
   surface, son centre, c'est-à-dire exactement le point où l'écran de
   génération a fait apparaître l'épingle devant le visiteur. */
function pointDeRepere(geometry) {
  if (/LineString/.test(geometry.type)) {
    const pts = [];
    const walk = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
    walk(geometry.coordinates);
    if (!pts.length) return null;
    return pts[Math.floor(pts.length / 2)];
  }
  const c = centroidOf(geometry);
  return Number.isFinite(c.lat) && Number.isFinite(c.lng) ? [c.lng, c.lat] : null;
}

function featuresDuProjet(geometry, title, zoom, lat) {
  const emprise = { type: 'Feature', geometry, properties: { name: title } };
  if (!geometry || geometry.type === 'Point') return [emprise];

  const { w, h } = geometryExtentKm(geometry);
  if (Math.max(w, h) * 1000 >= tailleMinimaleVisible(zoom, lat)) return [emprise];

  const repere = pointDeRepere(geometry);
  if (!repere) return [emprise];
  /* L'emprise reste EN PREMIER : la carte interroge les formes avant les
     marqueurs, et le survol doit continuer à souligner le contour. */
  return [emprise, { type: 'Feature', geometry: { type: 'Point', coordinates: repere }, properties: { name: title } }];
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
      const f = (await lireJson(r)).features?.[0];
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

/* La COMMUNE d'un résultat Nominatim, lue dans son détail d'adresse.

   `municipality` en est exclu, et c'est tout l'objet de cette fonction : sur
   les données françaises, ce champ porte l'ARRONDISSEMENT, pas la commune.
   Mesures réelles :
     Complexe Sportif Claude Fichot -> town « Conflans-Sainte-Honorine »,
                                       municipality « Saint-Germain-en-Laye »
     Chemin de Dessus-Perdtemps     -> village « Échenevex »,
                                       municipality « Gex »
   Lire `municipality` en premier rejetait donc TOUS les résultats de Conflans,
   et acceptait un chemin d'une commune voisine pour Gex. Les deux erreurs sont
   corrigées par le même choix : la commune est dans city, town, village ou
   hamlet, jamais ailleurs. */
function communeDuResultat(hit) {
  const a = hit?.address || {};
  return a.city || a.town || a.village || a.hamlet || '';
}

// Géocodage complet d'une requête : Nominatim (emprises/tracés réels) puis BAN.
// best-of-6 : on garde l'ordre de pertinence de Nominatim mais on descend
// jusqu'au 1er résultat réellement DANS la commune et son emprise (un homonyme
// mieux classé ailleurs ne fait plus rater le bon résultat).
/* La politique d'usage de Nominatim est stricte : une requete par seconde au
   plus. Or un refus 429 revient en ~50 ms, la ou une reponse pleine prend une
   bonne seconde : une boucle non cadencee ACCELERE des qu'elle est limitee et
   entretient elle-meme le blocage (spirale observee : 214 refus d'affilee).
   Le cadencement vaut donc pour toutes les requetes, pas que les reprises. */
let nominatimProchainDepart = 0;
async function nominatimRespire() {
  const attente = nominatimProchainDepart - Date.now();
  nominatimProchainDepart = Math.max(Date.now(), nominatimProchainDepart) + 1100;
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
}

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
    /* Nominatim limite a ~1 requete/s par IP, et plusieurs generations peuvent
       sortir par la meme IP (poste local, IPs partagees Netlify). Un refus 429
       ne dit rien du lieu cherche : on patiente puis on retente, sinon des
       projets parfaitement localisables partent en « non localisable ». */
    let r;
    for (let essai = 0; ; essai++) {
      await nominatimRespire();
      r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
      if (r.status !== 429 || essai >= 2) break;
      await new Promise((res) => setTimeout(res, 1500 * (essai + 1)));
    }
    if (!r.ok) console.warn(`[demo-generate] nominatim http=${r.status} pour "${q}"`);
    if (r.ok) {
      const commLc = commune.nom.toLowerCase().slice(0, 8);
      for (const hit of await lireJson(r)) {
        const g = hit.geojson;
        if (!g || !geometryInBbox(g, bbox)) continue;
        /* La commune du resultat, lue dans le DETAIL d'adresse. Chercher le nom
           de la commune dans le libelle entier se fait piegeer par les echelons
           administratifs superieurs : « Chemin de Dessus Perdtemps, Echenevex,
           Gex, Ain » contient « Gex » parce que Gex est l'ARRONDISSEMENT, et
           l'ecole Perdtemps se retrouvait a 3,5 km, dans la commune voisine.
           Repli sur l'ancien test quand le detail ne porte aucune commune, ce
           qui arrive sur certaines emprises. */
        const communeTrouvee = communeDuResultat(hit);
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
    /* Dernier recours : les designations precedentes ont toutes echoue, donc ce
       qu'on cherche ici est CE QUE LES ANNUAIRES CONNAISSENT, pas la meilleure
       description du lieu. Mesure sur Ploudalmezeau : « secteur de l'ancienne
       gare » est la bonne reponse en francais et n'existe sur aucune carte,
       alors que la meme page cite « rue de Kerjolys », qui se geocode du
       premier coup. D'ou l'insistance sur la VOIE. */
    const system = `Tu localises des projets urbains dans la commune de ${commune.nom}. Les designations evidentes ont deja ete essayees sans succes : ce qu'on te demande est une adresse qui existe REELLEMENT sur une carte.

Pour CHAQUE projet (index conservé), cherche dans l'extrait fourni une VOIE nommee - rue, avenue, boulevard, place, chemin, route, quai - et rends-la. C'est le seul type de lieu qu'un annuaire d'adresses connait a coup sur. A defaut de voie, rends le nom exact d'un equipement (« Centre nautique Robert Sautin »), puis seulement en dernier ressort un lieu-dit.

Ne rends JAMAIS un nom de secteur, de quartier ou d'operation (« secteur de l'ancienne gare », « ecoquartier »): ces noms ne figurent sur aucune carte et la recherche echouera encore. Si l'extrait ne cite ni voie ni equipement, rends une chaine vide : une position fausse est pire qu'une absence.`;
    const user = JSON.stringify(projets.map((p, i) => ({
      index: i,
      titre: p.title,
      description: (p.description || '').slice(0, 300),
      extrait: (p.source_excerpt || '').slice(0, 1200),
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
     le resultat honnete. On ne se rabat pas sur un lieu voisin. C'est a la
     LECTURE de la page de nommer un lieu geocodable, ce que sa consigne lui
     demande explicitement. */
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
    return r.ok ? commonsPagesToCandidates(await lireJson(r)) : [];
  } catch { return []; }
}

/* La recherche de photos PAR PROXIMITE a été retirée.

   Elle demandait à Wikimedia Commons les photos prises dans un rayon de trois
   cents mètres autour du projet, en supposant qu'une photo voisine montrerait
   au moins le quartier. Le fonds libre français n'est pas un relevé du terrain,
   c'est un album de monuments : à trois cents mètres d'un réaménagement de
   voirie il n'y a pas la rue, il y a l'église classée. Mesure sur Lyon, les
   trois seules illustrations issues de ce chemin étaient hors sujet toutes les
   trois, et le juge visuel ne pouvait pas les rattraper puisqu'on lui demandait
   de choisir la meilleure d'un lot entièrement hors sujet.
   Ce qui la remplace est la vue aérienne du lieu exact, plus bas : elle ne
   montre pas le projet, mais elle montre l'endroit, ce qui est vérifiable par
   un élu qui connaît sa commune. */

// Photos taguées au nom du lieu mais pas géolocalisées à proximité (équipements)
const commonsTextCandidates = (query) =>
  commonsQuery({ generator: 'search', gsrsearch: query, gsrnamespace: 6, gsrlimit: 6 });

/* ─── Vue aérienne du lieu, via la Géoplateforme de l'IGN ───

   Service public, gratuit, sans clé, et surtout JUSTE PAR CONSTRUCTION : elle
   ne prétend pas montrer le projet, elle montre l'endroit où il se trouve. Elle
   remplace la recherche par proximité pour tous les projets dont aucune source
   ne publie de visuel, ce qui est le cas de la totalité de ceux qui viennent
   d'un avis de marché public.

   Le service répond TOUJOURS 200, même hors de sa zone de couverture, où il
   rend une image uniforme de quelques kilo-octets. Aucun code d'erreur ne
   signale ce cas : c'est la sonde plus bas qui le reconnaît. */
const IGN_WMS = 'https://data.geopf.fr/wms-r/wms';
const IGN_COUCHE_AERIENNE = 'HR.ORTHOIMAGERY.ORTHOPHOTOS';
const IGN_CREDIT = 'Vue aérienne IGN, BD ORTHO (Géoplateforme)';
// Format de la vignette. Le 16/9 exact est celui de la couverture d'une fiche :
// toute autre proportion serait recadrée à l'affichage.
const IGN_LARGEUR_PX = 1280;
const IGN_HAUTEUR_PX = 720;
const IGN_RATIO = IGN_LARGEUR_PX / IGN_HAUTEUR_PX;
/* Largeur de terrain montrée, en mètres. Le plancher tient à la résolution de
   la prise de vue, environ 20 cm par pixel : en dessous, le service agrandit et
   l'image devient une bouillie de toitures. Le plafond suit la taille maximale
   d'une emprise de projet déjà admise ailleurs dans ce fichier, et reste
   lisible : à 1 400 mètres on distingue encore les rues et les îlots. */
const IGN_LARGEUR_MIN_M = 220;
const IGN_LARGEUR_MAX_M = 1600;
// Marge autour de l'emprise : un projet collé aux bords de sa vignette se lit
// mal, on montre aussi ce qu'il y a autour.
const IGN_MARGE = 1.6;
const METRES_PAR_DEGRE_LAT = 111320;

function borner(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/* URL d'une vue aérienne cadrée sur une géométrie de projet.
   Le cadrage suit la proportion de l'IMAGE et non celle de la géométrie, sans
   quoi le service étirerait la prise de vue. */
function vueAerienneUrl(geometry, { couche = IGN_COUCHE_AERIENNE, largeurPx = IGN_LARGEUR_PX, hauteurPx = IGN_HAUTEUR_PX } = {}) {
  const centre = centroidOf(geometry);
  if (!centre) return null;
  const etendue = geometryExtentKm(geometry);
  const largeurM = borner(
    Math.max(etendue.w * 1000, etendue.h * 1000 * IGN_RATIO) * IGN_MARGE,
    IGN_LARGEUR_MIN_M,
    IGN_LARGEUR_MAX_M
  );
  const dLat = (largeurM / IGN_RATIO) / 2 / METRES_PAR_DEGRE_LAT;
  const dLng = (largeurM / 2) / (METRES_PAR_DEGRE_LAT * Math.cos((centre.lat * Math.PI) / 180));
  return bboxWmsUrl(
    [centre.lat - dLat, centre.lng - dLng, centre.lat + dLat, centre.lng + dLng],
    { couche, largeurPx, hauteurPx }
  );
}

/* Requête GetMap. En WMS 1.3.0 et EPSG:4326, l'ordre des coordonnées de la
   boîte est latitude puis longitude, l'inverse de l'ordre GeoJSON : inverser
   les deux rend une image de l'autre bout du monde, sans aucune erreur. */
function bboxWmsUrl([minLat, minLng, maxLat, maxLng], { couche, largeurPx, hauteurPx }) {
  const u = new URL(IGN_WMS);
  const p = {
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: couche,
    STYLES: '',
    CRS: 'EPSG:4326',
    BBOX: [minLat, minLng, maxLat, maxLng].map((n) => n.toFixed(6)).join(','),
    WIDTH: String(largeurPx),
    HEIGHT: String(hauteurPx),
    FORMAT: 'image/jpeg',
  };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.toString();
}

// Taille des sondes de couverture : assez grande pour que deux zones réellement
// couvertes ne rendent jamais la même image, assez petite pour ne rien coûter.
const IGN_SONDE_PX = 64;
const IGN_SONDE_DELTA = 0.004;
// Point volontairement hors de tout territoire français, en plein golfe de
// Guinée : ce que le service y répond EST son image de « rien à montrer ».
const IGN_SONDE_VIDE = [0, 0, IGN_SONDE_DELTA, IGN_SONDE_DELTA];

// Poids en dessous duquel une vue aérienne au format de couverture est une
// image uniforme, donc un trou de couverture. Mesures : 92 ko sur un cadrage
// serré, 227 ko sur le plus large, contre quelques kilo-octets pour du vide.
const AERIEN_OCTETS_MIN = 20000;

const estVueAerienne = (u) => typeof u === 'string' && u.startsWith(IGN_WMS);

async function empreinteVueAerienne(bbox) {
  const url = bboxWmsUrl(bbox, { couche: IGN_COUCHE_AERIENNE, largeurPx: IGN_SONDE_PX, hauteurPx: IGN_SONDE_PX / 2 });
  const r = await fetchCapped(url, { headers: UA }, 8000, 200000, true);
  if (!r || !r.data?.byteLength) return null;
  return sha256Hex(new Uint8Array(r.data));
}

/* La commune est-elle couverte par la prise de vue aérienne ?
   On compare l'image du centre de la commune à celle d'un point hors
   couverture, mesurée dans la même génération plutôt qu'inscrite en dur : le
   jour où l'IGN change d'encodeur, une empreinte figée dans le code aurait
   déclaré la France entière hors couverture.
   En cas de service injoignable, on répond non : mieux vaut aucune vue aérienne
   que des fiches pointant sur une image morte. */
async function couvertureVueAerienne(lat, lng) {
  try {
    const [ici, rien] = await Promise.all([
      empreinteVueAerienne([lat - IGN_SONDE_DELTA, lng - IGN_SONDE_DELTA, lat + IGN_SONDE_DELTA, lng + IGN_SONDE_DELTA]),
      empreinteVueAerienne(IGN_SONDE_VIDE),
    ]);
    if (!ici || !rien) return false;
    return ici !== rien;
  } catch (e) {
    console.warn('[demo-generate] sonde de couverture aérienne :', e?.message);
    return false;
  }
}

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
   de fois qu'il y a de projets. Ne restent que des sources rattachables.

   Ces candidats sont ceux qui passent devant le juge visuel, donc ceux qui
   pretendent montrer LE PROJET. La vue aerienne, elle, ne pretend rien de tel
   et n'entre pas dans ce lot : elle est posee plus loin, sans jugement. */
const CANDIDATS_MAX = 8;

async function gatherImageCandidates(project, communeNom, mairiePages = []) {
  // Bloc de la page de la mairie qui parle de CE projet : la meilleure source
  const fromPage = mairiePageImages(project, mairiePages);
  // Images de la page source du projet elle-meme
  const fromSource = project.source_url ? await sourceImageCandidates(project.source_url) : [];

  /* Recherche par NOM sur Wikimedia Commons, en dernier ressort. C'est le seul
     chemin restant vers une vraie photo d'un objet nomme : une passerelle, une
     gare, une eglise en restauration. On ne la tente que si le projet designe
     un lieu nomme, sans quoi la requete se reduit au nom de la commune et ne
     rend que du hasard, exactement ce que la recherche par proximite faisait. */
  let commons = [];
  const lieu = String(project.place || project.geo_query || '').trim();
  if (!fromPage.length && !fromSource.length && motsSignificatifs(lieu).size) {
    commons = await commonsTextCandidates(`${lieu} ${communeNom}`.trim());
  }

  const seen = new Set();
  const all = [];
  for (const c of [...fromPage, ...fromSource, ...commons]) {
    if (seen.has(c.url) || all.length >= CANDIDATS_MAX) continue;
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
    body: corpsJson(rows),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Insertion ${table} : ${r.status} ${t.slice(0, 200)}`);
  }
  return returning ? lireJson(r) : null;
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
    body: corpsJson(patch),
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
  // Les runs que la plateforme a interrompus ne sont pas des tentatives du
  // visiteur : voir RUN_PHASE_INTERROMPU. Le `is.null` est indispensable, un
  // `neq` seul ecarterait aussi toutes les lignes sans phase.
  url.searchParams.set('or', `(phase.is.null,phase.neq.${RUN_PHASE_INTERROMPU})`);
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
  const rows = await lireJson(r);
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

/* Une invocation tuee en vol (mur de duree, coupure reseau) n'atteint jamais
   closeRun : sa ligne reste `running` pour toujours et le journal ment, en
   melangeant les onglets fermes en cours de route et les generations que la
   plateforme a interrompues. Balayage a l'ouverture de chaque generation, sur
   les lignes assez vieilles pour qu'aucune invocation ne puisse encore les
   tenir. Comme tout le journal : jamais bloquant. */
const RUN_PERIME_MIN = 10;
/* Marqueur des runs clos par le balayage. Il sert AUSSI de filtre au quota :
   une invocation tuee par la plateforme n'a rien consomme (zero appel modele)
   et n'est pas une tentative de plus du visiteur, c'est la MEME tentative que
   le navigateur relance tout seul. La compter revenait a punir le visiteur
   d'une panne interne : huit relances automatiques sur une commune brulaient
   la moitie du quota d'une adresse IP. Le garde-fou anti-abus reste entier :
   les tentatives reelles, elles, comptent toujours. */
const RUN_PHASE_INTERROMPU = 'interrompu';

async function sweepStaleRuns() {
  try {
    const limite = new Date(Date.now() - RUN_PERIME_MIN * 60000).toISOString();
    const url = new URL(`${SUPABASE_URL}/rest/v1/demo_runs`);
    url.searchParams.set('status', 'eq.running');
    url.searchParams.set('started_at', `lt.${limite}`);
    const r = await fetchWithTimeout(url.toString(), {
      method: 'PATCH',
      headers: { ...serviceHeaders(), Prefer: 'return=representation' },
      body: corpsJson({
        status: 'failed',
        phase: RUN_PHASE_INTERROMPU,
        error_message: 'generation interrompue : invocation terminee avant la fin de la phase',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) return;
    const rows = await lireJson(r).catch(() => []);
    if (rows.length) console.log(`[demo-generate] journal: ${rows.length} run(s) perime(s) clos en echec`);
  } catch (e) {
    console.warn('[demo-generate] journal: balayage impossible ::', e?.message);
  }
}

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
      body: corpsJson({ ...patch, updated_at: new Date().toISOString() }),
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

async function coreSources(send, step, insee, runState) {
  const finding = (f) => send({ type: 'finding', ...f });

  step('resolve', 'start', 'Recherche de la commune');
  const commune = await resolveCommune(insee);
  if (!commune?.centre) {
    send({ type: 'error', message: 'Commune introuvable. Vérifiez la saisie.' });
    return null;
  }
  /* Le nom est inscrit au journal DES QU'IL EST CONNU, sans attendre la fin du
     recensement. Ecrit seulement a la sortie de la phase, il manquait a toutes
     les tentatives interrompues en route : le journal accumulait des lignes a
     commune vide, impossibles a rattacher a quoi que ce soit. */
  if (runState?.id) await patchRun(runState.id, { commune_nom: commune.nom });
  const bbox = bboxOfContour(commune.contour);
  step('resolve', 'done', 'Commune reconnue',
    `${commune.nom} · ${commune.departement?.nom || ''} · ${(commune.population || 0).toLocaleString('fr-FR')} habitants`);

  // Les trois collectes sont independantes (presse/BOAMP ne dependent pas de la
  // mairie) : menees en parallele pour ne pas additionner leurs latences
  const echeanceMairie = Date.now() + MAIRIE_BUDGET_MS;
  step('mairie', 'start', 'Visite du site officiel de la mairie');
  step('news', 'start', 'Lecture de la presse locale');
  step('boamp', 'start', 'Consultation des marchés publics (BOAMP)');
  // L'etage intercommunal s'amorce en parallele : deux ou trois requetes, et
  // il ne sera LU que s'il reste de la place apres le site de la commune.
  const epciPromise = commune.epci?.nom
    ? amorcerEpci(commune.epci.nom, commune.nom).catch((e) => { console.warn(`[demo-generate] intercommunalite injoignable :: ${e?.message}`); return null; })
    : Promise.resolve(null);

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
      const m = await inspectMairieSite(site, commune.nom, finding, echeanceMairie);
      m.position = position;
      /* Site protege contre la lecture automatique : on le dit franchement,
         plutot que de laisser croire a une commune sans projets. La generation
         continue sur la presse et les marches publics. */
      if (m.bloque) {
        step('mairie', 'skip', 'Site officiel de la mairie',
          `${m.host} bloque la lecture automatique · recensement poursuivi sur la presse et les marchés publics`);
        return m;
      }
      /* Identité visuelle et lecture des PDF en parallèle : deux travaux
         indépendants qui ne doivent pas s'additionner dans la durée de la phase.
         Passé l'échéance, les deux sont sautés : ce sont des finitions, et
         `m.logoUrl` porte déjà le meilleur candidat du scoring texte. */
      const enRetard = Date.now() >= echeanceMairie;
      if (enRetard) m.tronque = true;
      const [identite, pdfsLus] = enRetard ? [null, []] : await Promise.all([
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
      /* Une collecte ecourtee se DIT, et elle dit POURQUOI : le motif etait
         calcule mais jamais lu, si bien que l'ecran annoncait « pour tenir le
         temps imparti » alors que le temps n'y etait pour rien. */
      if (m.tronque) bits.push(m.motifArret === 'temps' || !m.motifArret
        ? 'site très riche : lecture écourtée pour tenir le temps imparti'
        : 'site très riche : lecture arrêtée une fois la matière suffisante');
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
    send({ type: 'error', kind: 'sans-projet', message: messageSansProjet(commune.nom) });
    return null;
  }

  const epci = await epciPromise;
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
    epci,
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
      /* L'exploration part de la : les adresses candidates relevees sur
         l'accueil et dans le sitemap, et le texte de l'accueil, qui sert de
         reference pour reconnaitre le menu commun a toutes les pages. */
      candidates: (mairie.candidates || []).map((l) => ({ url: l.url, label: l.label })),
      accueilTexte: mairie.accueilTexte || '',
      /* La NAVIGATION du site, relevee sur l'accueil. Elle sert a ne pas
         resoumettre le menu a chaque lecture de page : les liens d'une page
         sont proposes dans l'ordre du document et coupes a quarante, or le menu
         vient en premier. Sans ce filtre, une page a gros menu ne montrait
         jamais ses liens de contenu au modele. */
      navigation: mairie.navigation || [],
      // Remplis au fil de l'exploration : index des images et allowlist
      pages: [],
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

/* ─── Les marchés publics en dernier recours ───

   Un avis de marché apporte deux choses excellentes, l'adresse officielle du
   chantier et le maître d'ouvrage, et deux choses détestables, une prose
   administrative et aucun visuel. Mesure sur Lyon : les douze projets venus du
   site de la ville ont tous une vraie photo, les sept venus des avis n'en ont
   aucune, et leurs intitulés - « modernisation du système de sécurité incendie
   de l'université » - ne sont pas ce qu'on montre à un élu.

   La règle est donc : tant que la commune documente elle-même assez
   d'opérations, les avis ne créent pas de fiche et servent seulement à
   compléter les autres, ce que la fusion a déjà fait juste avant. Dès que la
   commune est muette, ils reprennent leur rôle de matière première, sans quoi
   il ne resterait rien à montrer.

   L'arbitrage se fait sur la LISTE EXTRAITE, pas sur le corpus : le paquet est
   construit avant de savoir combien la mairie donnera. Deux extractions
   successives auraient coûté 80 % de tokens et 65 % de temps en plus sur
   l'étape la plus chère, pour un résultat identique. */
const MARCHES_CIBLE = Number(process.env.DEMO_MARCHES_CIBLE) || 12;
/* Nombre de projets REELLEMENT poses sur la carte en dessous duquel la reserve
   d'avis se rouvre. La cible ci-dessus compte des projets attestes ; entre les
   deux, le geocodage en retire une partie. */
const RESERVE_PLANCHER = 8;
// Mots distinctifs qu'une source doit partager avec un projet pour l'attester.

function arbitrerMarches(projects, cible = MARCHES_CIBLE) {
  const propres = projects.filter((p) => p.origine !== 'marche');
  const marches = projects.filter((p) => p.origine === 'marche');
  if (!marches.length) return { retenus: projects, ecartes: [] };

  const places = Math.max(0, cible - propres.length);
  /* Les avis qui portent une adresse d'abord : ce sont les seuls qui se
     géocoderont, et un avis sans lieu propre finit de toute façon écarté plus
     loin, faute d'emplacement vérifiable. À adresse égale, le plus récent. */
  const classes = [...marches].sort((a, b) => {
    const adr = Number(Boolean(String(b.address || '').trim())) - Number(Boolean(String(a.address || '').trim()));
    if (adr) return adr;
    return String(b.marcheDate || '').localeCompare(String(a.marcheDate || ''));
  });
  const gardes = classes.slice(0, places);
  const ecartes = classes.slice(places);
  // L'ordre d'origine est preserve : il porte le classement de l'extraction.
  const gardesSet = new Set(gardes);
  return {
    retenus: projects.filter((p) => p.origine !== 'marche' || gardesSet.has(p)),
    ecartes,
  };
}

/* En dessous de ce nombre de projets situes, la carte est COURTE. Ce seuil ne
   commande PLUS l'arret de la generation : il commande seulement ce que
   l'ecran annonce au visiteur. Une carte d'un seul projet reste une carte de
   sa commune, ce qui vaut infiniment mieux qu'un ecran de texte. */
const CARTE_COURTE = 3;

/* Une commune dont le web ne parle pas n'est pas un echec de la demonstration,
   c'est le constat qui justifie la carte. Le texte ne dit donc jamais que la
   commune manque de projets, mais que les SOURCES PUBLIQUES n'en documentent
   pas, puis il enchaine sur ce que ses propres documents permettraient. */
/* « de Angers », « de Le Havre » et « de Les Fins » sont fautifs : la
   preposition se contracte avec l'article et s'elide devant une voyelle. Ces
   textes portent un nom de commune choisi par le visiteur, la faute serait donc
   sous ses yeux, sur son propre nom de commune. */
function deLaCommune(nom) {
  const n = String(nom || '').trim();
  if (!n) return '';
  if (n.startsWith('Le ')) return `du ${n.slice(3)}`;
  if (n.startsWith('Les ')) return `des ${n.slice(4)}`;
  if (/^[aeiouyàâäéèêëîïôöùûü]/i.test(n)) return `d'${n}`;
  return `de ${n}`;
}

function messageSansProjet(nom) {
  return `Les sources publiques ne documentent aujourd'hui aucun projet ${deLaCommune(nom)}. `
    + "Beaucoup de communes se trouvent dans cette situation, et c'est précisément ce qu'une carte vient corriger. "
    + 'Vos documents internes nous suffisent pour la construire en quelques jours.';
}

/* Annonce faite AVANT l'arrivee, pour que le visiteur ne decouvre pas la
   brievete de sa carte a l'ecran de fin. Le nombre annonce ici est definitif :
   il est calcule apres le geocodage, seule etape qui peut encore reduire la
   liste. Annoncer plus tot exposerait a se contredire d'un ecran a l'autre. */
function messageCarteCourte(nom, n) {
  const trouve = n > 1 ? `que ${n} projets documentés` : "qu'un seul projet documenté";
  return `Nous n'avons trouvé ${trouve} dans les sources publiques ${deLaCommune(nom)}. `
    + `Nous construisons la carte avec ${n > 1 ? 'ces projets' : 'ce projet'}, `
    + 'et vos propres documents nous permettront de la compléter.';
}

/* ─── PHASE EXPLORATION ───

   Elle remplace l'ancien couple « tout collecter puis tout dépouiller d'un
   coup ». On ouvre une vague de pages, on lit chacune séparément, et ce qu'on y
   trouve désigne la vague suivante. L'exploration s'enfonce là où elle trouve,
   s'arrête là où elle ne trouve rien.

   Découpée en tranches comme la localisation : une métropole demande plusieurs
   dizaines de pages, ce qui ne tient pas dans une invocation. */
/* Lectures menees de front. CINQ, et ce chiffre est une mesure, pas un gout :
   a huit comme a dix, les connexions sortantes partent en echec en rafale
   (verifie deux fois, dont une campagne entiere faussee) ; a cinq, une sonde
   de soixante-cinq pages passe sans un seul echec. */
const VAGUE_TAILLE = 5;
/* Plafond de securite, pas un arbitrage : aucune commune francaise ne publie
   trois cents pages qui decrivent des operations d'amenagement. L'exploration
   s'arrete normalement parce qu'elle a vide sa file, pas parce qu'elle a
   atteint un quota.
   Il n'y a plus d'arret « au bout de N vagues sans resultat » : c'etait un pari
   sur l'ordre de la file, et il a fait perdre l'ecoquartier de Ploudalmezeau,
   dont la fiche detaillee attendait derriere vingt pages sans interet. */
/* Reglable sans deploiement : 300 est le mode exhaustif (Lyon rend 53 fiches
   en 10 minutes), 120 un mode salon plus court. Le cout et la duree suivent
   presque lineairement le nombre de pages. */
const EXPLO_PAGES_MAX = Number(process.env.DEMO_PAGES_MAX) || 300;
/* BUDGET DE MATIERE, le vrai curseur du mode salon. Mesure sur la trace
   exhaustive de Vannes : les projets arrivent jusqu'a la derniere page et les
   pistes froides produisent presque autant que les chaudes (24 % contre 28 %),
   donc ni un tri plus dur ni un arret au rendement ne tiennent - le premier
   perd de vrais projets, le second perd 56 % des projets ou n'economise rien.
   S'arreter quand ON A ASSEZ DE MATIERE, en revanche, coupe tot sur les villes
   riches (Bordeaux : 60 projets reperes des la 80e page sur 266) et jamais sur
   les communes pauvres. ACTIF PAR DEFAUT a cent projets, calibre pour une carte
   finale de quarante a cinquante fiches une fois la fusion et le geocodage
   passes ; zero = illimite, le mode exhaustif. */
const EXPLO_BRUTS_MAX = process.env.DEMO_BRUTS_MAX !== undefined
  ? Number(process.env.DEMO_BRUTS_MAX)
  : 100;
// Pages repechees au plus quand l'abondance arrete la lecture : celles dont
// l'intitule annonce CLAIREMENT une operation majeure ne restent pas de cote.
const REPECHAGE_MAX = 15;

/* Le REPECHAGE, filet de l'arret par abondance.
   Couper a cent projets laisse une file du meme tonneau que ce qu'on a lu :
   c'est mesure, la pertinence d'un lien se predit mal. Mais un intitule qui
   annonce sans ambiguite une operation majeure - ZAC, ecoquartier,
   requalification, grand projet nomme - est l'exception ou le titre suffit.
   Une derniere lecture des intitules restants les retient, on les lit, puis on
   ferme : rien de manifestement en or ne part dans la part mise de cote. */
async function repecherLesTitresEnOr(communeNom, restantes) {
  if (!restantes.length) return [];
  try {
    const system = `La lecture du site de ${communeNom} s'arrete : assez de projets sont deja reperes. Voici les intitules des pages qui ne seront PAS lues. Ne retiens que celles dont l'intitule annonce SANS AMBIGUITE une operation d'amenagement majeure : une ZAC, un ecoquartier, une requalification, un grand projet urbain nomme, un equipement structurant en construction. Un intitule vague, generique ou de vie quotidienne ne se repeche pas : dans le doute, laisse. Rends au plus ${REPECHAGE_MAX} index.`;
    const user = restantes.map((l, i) => `${i}. ${l.label || l.url}`).join('\n');
    const out = await openAIStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      'repechage_titres', TRI_SCHEMA_REPECHAGE, 600, 40000, 0.1
    );
    return [...new Set(out.garder || [])]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < restantes.length)
      .slice(0, REPECHAGE_MAX)
      .map((i) => restantes[i]);
  } catch (e) {
    console.warn(`[demo-generate] repechage indisponible :: ${e?.message}`);
    return [];
  }
}

const TRI_SCHEMA_REPECHAGE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    garder: {
      type: 'array',
      description: 'Index des intitules qui annoncent sans ambiguite une operation majeure.',
      items: { type: 'integer' },
    },
  },
  required: ['garder'],
};
// Pages qui servent a reconnaitre le gabarit du site, en plus de l'accueil.
const GABARIT_ECHANTILLONS = 4;
/* Texte garde par page dans l'index des visuels. Assez pour reconnaitre de quoi
   parle la page, assez court pour que le brouillon reste transportable : il est
   relu et reecrit a chaque tranche des phases suivantes. */
const INDEX_TEXTE_MAX = 1500;
/* L'index voyage dans le brouillon pendant toutes les phases suivantes : borne
   en pages et en blocs, sinon une exploration de quatre-vingt-dix pages ferait
   transporter un mega-octet a chaque tranche de localisation. */
const INDEX_PAGES_MAX = 80;
const INDEX_BLOCS_MAX = 12;
const EXPLO_TOURS_MAX = 12;
// Tranches consecutives sans une seule page lue avant d'abandonner l'exploration
// et de continuer avec ce qui a deja ete trouve.
const TRANCHES_VIDES_MAX = 2;
// Priorité donnée aux liens rapportés par une page selon ce qu'elle valait :
// descendre depuis une page de projets est bien plus prometteur que descendre
// depuis une page quelconque.
const PRIORITE = { forte: 3, moyenne: 1, nulle: 0 };

async function coreExplore(send, step, state) {
  const { commune, mairie } = state;
  const explo = state.explo || (state.explo = {
    file: new FileExploration({ hote: mairie.host }).serialiser(),
    bruts: [],
    tours: 0,
    pagesLues: 0,
    /* Tranches consecutives qui n'ont pas reussi a lire UNE page. Deux d'affilee
       signifient que le site ou la liaison IA ne repondent plus : on finalise
       avec ce qu'on a plutot que de bruler les douze tranches du quota a ne
       rien faire. Mesure le 24/08 : douze tranches consommees pour douze pages,
       et le visiteur aurait attendu quatre minutes devant une carte vide. */
    tranchesVides: 0,
    amorcee: false,
  });
  explo.tours++;

  const file = FileExploration.restaurer(explo.file);
  if (!explo.amorcee) {
    const racine = normaliserUrl(`https://${mairie.host}/`);
    // L'accueil est lu A PART, jamais comme candidate : il se recrutait
    // lui-meme via son lien « Accueil » et repassait par la file pour rien.
    const candidates = (mairie.candidates || []).filter((l) => normaliserUrl(l.url) !== racine);
    const gardees = await ecarterLesHorsSujet(commune.nom, candidates);
    for (const l of gardees) file.ajouter(l.url, l.label, 0);
    file.marquerVue(racine);
    explo.amorcee = true;
    console.log(`[demo-generate] exploration ${commune.nom} : ${candidates.length} candidate(s), ${candidates.length - gardees.length} ecartee(s) sur l'intitule, ${file.restantes} a ouvrir`);
    /* L'ACCUEIL est depouille lui aussi, une fois : une petite commune presente
       souvent ses projets directement en page d'accueil, et l'ancien modele la
       versait au corpus. Le gabarit ne s'y applique pas, il en est la source. */
    try {
      const luAccueil = await lirePage(commune, { url: `https://${mairie.host}/`, title: 'Accueil du site de la mairie', text: mairie.accueilTexte || '' }, []);
      send({ type: 'finding', kind: 'page', title: 'Accueil du site de la mairie', domain: mairie.host });
      for (const pr of luAccueil.projets) {
        explo.bruts.push(pr);
        send({ type: 'ai-item', phase: 'ai1', title: pr.title, quote: (pr.evidence_quote || '').slice(0, 220), domain: hostOf(pr.source_url) });
      }
      explo.pagesLues++;
    } catch (e) {
      console.warn(`[demo-generate] lecture de l'accueil impossible :: ${e?.message}`);
    }
    // Les candidates sont dans la file : leur copie du brouillon a fini d'exister
    state.mairie.candidates = [];
  }

  step('ai1', 'start',
    explo.tours === 1 ? 'Lecture du site de la mairie, page par page' : 'Lecture en cours',
    explo.tours === 1
      ? `${file.restantes} page(s) candidate(s), chacune lue séparément`
      : `${explo.bruts.length} projet(s) repéré(s), ${file.restantes} page(s) en attente`);

  /* Le gabarit s'apprend sur l'accueil ET sur les premieres pages lues : mesure
     sur Ploudalmezeau, l'accueil seul laissait passer « Ouvrir la barre
     d'outils Outils d'accessibilite Augmenter le texte », qui se retrouvait
     dans l'extrait servant a localiser le projet. */
  /* References du gabarit : l'accueil ET les echantillons, comptes SEPAREMENT.
     Un enchainement n'est du gabarit que s'il figure sur au moins deux
     references : le menu et le pied de page y sont, un teaser unique n'y est
     pas. Voir empreinteGabarit. */
  const etageEpci = explo.etage === 'epci';
  const accueilRef = etageEpci ? (state.epci?.accueilTexte || '') : (mairie.accueilTexte || '');
  const hoteEtage = etageEpci ? state.epci.host : mairie.host;
  /* Pendant l'etage intercommunal, la COHERENCE avec la commune est un filtre,
     pas une esperance : aucun lien n'entre en file, ni n'est montre au modele,
     s'il ne nomme pas la commune dans son adresse ou son intitule. Sans ce
     verrou, les pages de la metropole se recommandaient entre elles et la
     lecture partait sur les projets de toute l'agglomeration - mesure sur
     Quincieux : deux cents pages de grandlyon.com lues, la gare routiere de
     Gerland dans la moisson. */
  const slugCommune = slugify(commune.nom);
  const motCommune = unaccentLower(commune.nom);
  const nommeLaCommune = (l) => {
    const meule = unaccentLower(`${l.url} ${l.label || ''}`);
    return meule.includes(slugCommune) || meule.includes(motCommune);
  };
  const gabarit = empreinteGabarit([accueilRef, ...(explo.echantillons || [])]);
  // Le menu du site, sous forme normalisee : retire des liens soumis au modele
  const navSet = new Set((mairie.navigation || []).map(normaliserUrl));
  const t0 = Date.now();
  // Pages en echec de la tranche, remises en file a la SORTIE de la boucle
  const echecs = [];
  // Pages consommees par la tranche, lectures abouties ET ecartees legitimes :
  // c'est la mesure d'avancement, pas le seul compte des lectures IA.
  let traitees = 0;

  const assezDeMatiere = () => EXPLO_BRUTS_MAX > 0 && explo.bruts.length >= EXPLO_BRUTS_MAX;
  while (file.restantes && Date.now() - t0 < PHASE_BUDGET_MS && explo.pagesLues < EXPLO_PAGES_MAX
    && (!assezDeMatiere() || explo.repechageFait)) {
    const lot = file.vague(VAGUE_TAILLE);
    if (!lot.length) break;

    const resultats = await inChunks(lot, VAGUE_TAILLE, async (candidate) => {
      const page = await fetchCapped(candidate.url, { headers: UA }, 6000, 400000);
      if (!page) return { echec: candidate };
      /* Une page de la mairie qui redirige HORS du site n'est pas une page de
         la mairie : la lire la verserait a l'allowlist d'attestation, et une
         fiche pourrait citer un site tiers comme source officielle. */
      if (hostOf(page.url) !== hostOf(`https://${hoteEtage}`)) return { ecartee: true };
      const brut = stripHtml(page.data).slice(0, PAGE_TEXT_BRUT_CHARS);
      const texte = retirerGabaritConnu(brut, gabarit);
      // Une page qui ne dit rien de plus que le gabarit du site n'a aucun
      // contenu propre : on ne paie pas une lecture pour l'apprendre.
      if (texte.length < GABARIT_RESTE_MIN || looksLikeCode(texte)) return { ecartee: true };

      const liens = [];
      collectPageLinks(page.data, page.url, hoteEtage, liens);
      /* On soumet tous les liens PAS ENCORE LUS, y compris ceux qui attendent
         deja dans la file : c'est ainsi qu'une page de sommaire fait remonter
         ses fiches detaillees en tete, au lieu de les laisser au fond d'une
         file alimentee par le sitemap. */
      /* Les 60 sieges de la soumission vont d'abord aux liens INCONNUS de la
         file : une candidate deja en attente sera lue de toute facon, elle n'a
         besoin que d'une eventuelle remontee de priorite. */
      const nouveaux = liens
        .filter((l) => !file.dejaOuverte(l.url) && !navSet.has(normaliserUrl(l.url)))
        .filter((l) => !etageEpci || nommeLaCommune(l))
        .sort((x, y) => Number(file.connue(x.url)) - Number(file.connue(y.url)));
      collectPdfLinks(page.data, page.url, state.mairie.pdfs);

      try {
        const lu = await lirePage(commune, { url: page.url, title: candidate.label, text: texte }, nouveaux);
        if (process.env.DEMO_DUMP) {
          // Rendement page par page : la matiere premiere du reglage de l'arret
          console.log(`[demo-pages] ${lu.projets.length} projet(s) | interet ${lu.interet} | ${candidate.priorite > 0 ? 'chaude' : 'froide'} | ${page.url}`);
        }
        /* L'echantillon de gabarit ne part qu'avec une lecture ABOUTIE : verse
           avant l'appel, une page remise en file apres echec retrouvait son
           propre texte dans le gabarit a la relecture, et en ressortait vide. */
        return {
          candidate, page, lu, texte,
          echantillon: brut.slice(0, 4000),
          horsSieges: nouveaux.slice(PAGE_LIENS_SOUMIS),
          images: extractImageUrls(page.data, page.url, 24),
          blocs: extractPageBlocks(page.data, page.url),
        };
      } catch (e) {
        console.warn(`[demo-generate] lecture impossible : ${candidate.url} :: ${e?.message}`);
        return { echec: candidate };
      }
    });

    /* Les pages en echec sont MISES DE COTE, et ne retournent en file qu'a la
       FIN de la tranche : remises immediatement, elles restaient en tete du
       classement et etaient repiochees quelques secondes plus tard, dans la
       meme fenetre de coupure, ou leur seconde chance se consumait pour rien.
       Ce sont precisement les pages les plus prioritaires qui mouraient en
       premier. */
    for (const r of resultats) {
      if (r?.echec) echecs.push(r.echec);
      if (r && !r.echec) traitees++;
    }

    for (const r of resultats) {
      if (!r || r.echec || r.ecartee) continue;
      explo.pagesLues++;
      /* Une trouvaille PAR page lue : le compteur de sources de l'ecran dit
         le vrai compte (il comptait une vague de cinq pour une), et le fil
         montre chaque page ouverte au lieu d'un cumul. */
      send({ type: 'finding', kind: 'page', title: r.candidate.label || r.page.url, domain: hostOf(r.page.url) });
      if ((explo.echantillons = explo.echantillons || []).length < GABARIT_ECHANTILLONS) {
        explo.echantillons.push(r.echantillon);
      }
      for (const p of r.lu.projets) {
        if (etageEpci) {
          /* Les pages d'amorce de l'etage (rubriques d'amenagement) parlent de
             toute la metropole : le verrou sur les LIENS ne suffit pas, les
             projets vitrines qu'elles decrivent elles-memes (La Duchere, place
             Grandclement...) entraient dans la recolte d'une petite commune et
             voyageaient jusqu'au filet du geocodage pour rien. Un projet de
             l'etage qui ne nomme la commune ni dans son texte ni par sa page
             source est un projet d'ailleurs : il ne quitte pas la page. */
          const texteDuProjet = `${p.title || ''} ${p.place || ''} ${p.address || ''} ${p.geo_query || ''} ${p.description || ''}`;
          if (!nommeLaCommune({ url: p.source_url || '', label: texteDuProjet })) continue;
          // La source est l'intercommunalite : l'attestation reste officielle,
          // le lecteur de la fiche voit d'ou elle vient.
          p.sources = [{ url: p.source_url, type: 'intercommunalite' }];
        }
        explo.bruts.push(p);
        send({ type: 'ai-item', phase: 'ai1', title: p.title, quote: (p.evidence_quote || '').slice(0, 220), domain: hostOf(p.source_url) });
      }
      /* Les liens que cette page recommande. La priorite ne decide plus de ce
         qu'on lira - la file est destinee a etre videe - seulement de l'ordre :
         une page designee par une page de projets a des chances de donner plus
         vite, autant commencer par elle. */
      for (const l of r.lu.suivants) file.ajouter(l.url, l.label, PRIORITE[r.lu.interet] ?? 1);
      /* Les liens qu'on n'a PAS pu soumettre au modele, au-dela des 60 sieges,
         n'en disparaissent pas pour autant : sur une page qui parle
         d'amenagement, ils entrent en file a priorite basse. Elle est faite
         pour etre videe, et ses gardes bornent deja le cout. */
      if (r.lu.interet !== 'nulle' && r.horsSieges?.length) {
        for (const l of r.horsSieges) file.ajouter(l.url, l.label, 0);
      }
      // L'index d'images sert plus tard à rattacher un visuel officiel au projet
      if (r.images.length || r.blocs.length) {
        /* Index des visuels, pour la phase des illustrations. Le TEXTE y est
           conserve, ampute mais present : c'est lui qui permet de reconnaitre
           que cette page parle de ce projet-la. Sans lui, seul le rattachement
           par bloc fonctionnait, et le repli « page entiere » ne se declenchait
           jamais - releve sur Lyon, deux vraies photos sur sept la ou toutes
           les fiches issues du site de la ville en avaient une. */
        if (state.mairie.pages.length < INDEX_PAGES_MAX) {
          state.mairie.pages.push({
            url: r.page.url,
            title: r.candidate.label,
            text: r.texte.slice(0, INDEX_TEXTE_MAX),
            images: r.images.slice(0, 8),
            blocs: r.blocs.filter((b) => b.images?.length).slice(0, INDEX_BLOCS_MAX),
          });
        }
      }
      if (!state.mairie.urls.includes(r.page.url)) state.mairie.urls.push(r.page.url);
    }
  }

  /* Les echecs retournent en file MAINTENANT, hors de la fenetre de coupure
     qui les a fait tomber : ils seront relus a la tranche suivante, et leur
     presence compte dans file.restantes, donc dans la decision de continuer. */
  for (const c of echecs) file.remettre(c);
  explo.file = file.serialiser();
  /* Une tranche a AVANCE des qu'elle a consomme des pages, meme si aucune n'a
     franchi la lecture IA : quarante pages minces ecartees d'affilee sont un
     site qui repond, pas une liaison morte. */
  explo.tranchesVides = traitees > 0 ? 0 : (explo.tranchesVides || 0) + 1;

  /* L'abondance declenche d'abord le REPECHAGE : les intitules restants sont
     relus une derniere fois, les operations majeures manifestes sont gardees
     seules en file, et une tranche de plus les lit avant la fermeture. */
  if (assezDeMatiere() && !explo.repechageFait) {
    explo.repechageFait = true;
    const restantes = FileExploration.restaurer(explo.file);
    const candidates = [...restantes.candidates.values()];
    const enOr = await repecherLesTitresEnOr(commune.nom, candidates);
    if (enOr.length) {
      const garde = new FileExploration({ hote: mairie.host });
      garde.vues = restantes.vues;
      for (const l of enOr) garde.ajouter(l.url, l.label, 3);
      explo.file = garde.serialiser();
      // Le budget de matiere est leve d'autant : ces pages doivent etre lues
      explo.repeches = enOr.length;
      console.log(`[demo-generate] repechage : ${enOr.length} intitule(s) en or sur ${candidates.length} mis de cote`);
      step('ai1', 'done', 'Lecture en cours', `assez de matière, ${enOr.length} page(s) majeure(s) repêchée(s) avant fermeture`);
      state.__continue = true;
      return state;
    }
    explo.file = new FileExploration({ hote: mairie.host }).serialiser();
  }

  let fini = !file.restantes
    || explo.pagesLues >= EXPLO_PAGES_MAX
    || explo.tours >= EXPLO_TOURS_MAX
    || explo.tranchesVides >= TRANCHES_VIDES_MAX
    || (assezDeMatiere() && explo.repechageFait);

  /* BASCULE VERS L'INTERCOMMUNALITE. Le site de la commune est epuise et le
     budget de matiere n'est pas atteint : les pages du site intercommunal qui
     NOMMENT la commune prennent la suite, avec leur propre gabarit. */
  if (fini && !etageEpci && !explo.etageEpciFait
    && !assezDeMatiere()
    && explo.tranchesVides < TRANCHES_VIDES_MAX
    && state.epci?.candidates?.length) {
    explo.etageEpciFait = true;
    explo.etage = 'epci';
    explo.echantillons = [];
    const suite = new FileExploration({ hote: state.epci.host, plafond: 80 });
    for (const l of state.epci.candidates) suite.ajouter(l.url, l.label, 0);
    explo.file = suite.serialiser();
    state.epci.candidates = [];
    console.log(`[demo-generate] etage intercommunal : ${suite.restantes} page(s) de ${state.epci.host} a lire pour ${commune.nom}`);
    step('ai1', 'done', 'Lecture en cours', `site de la commune épuisé, lecture de ${state.epci.host} (${suite.restantes} page(s) nommant la commune)`);
    state.__continue = true;
    return state;
  }
  fini = fini && (etageEpci || explo.etageEpciFait || !state.epci?.candidates?.length || assezDeMatiere() || explo.tranchesVides >= TRANCHES_VIDES_MAX);
  if (!fini) {
    step('ai1', 'done', 'Lecture en cours', `${explo.pagesLues} page(s) lue(s), ${explo.bruts.length} projet(s) repéré(s)`);
    state.__continue = true;
    return state;
  }
  delete state.__continue;

  const motif = !file.restantes ? 'site entièrement parcouru'
    : assezDeMatiere() ? 'assez de matière réunie'
      : explo.tranchesVides >= TRANCHES_VIDES_MAX ? 'lectures en échec répété'
        : explo.pagesLues >= EXPLO_PAGES_MAX ? 'plafond de pages atteint'
          : 'budget de temps atteint';
  console.log(`[demo-generate] exploration ${commune.nom} : ${explo.pagesLues} pages lues, ${explo.bruts.length} projets bruts, ${file.restantes} candidates non ouvertes (${motif}, ${explo.tours} tranche(s))`);
  step('ai1', 'done', 'Site de la mairie dépouillé',
    `${explo.pagesLues} page(s) lue(s) une par une, ${explo.bruts.length} projet(s) repéré(s)`);
  state.stats.pages_lues = explo.pagesLues;
  state.stats.motif_arret = motif;
  // Le site a livre ce qu'il avait : on enchaine sur le rapprochement, qui a
  // besoin de la liste complete pour fondre ce qui doit l'etre.
  return coreAi(send, step, state);
}

/* Depouillement des AVIS DE MARCHES.

   Ils forment une liste compacte, une notice par avis : ils ne posent donc pas
   le probleme de volume qui a impose la lecture page par page, et un seul appel
   suffit. Ils gardent leur statut de complement : la fusion leur donnera leur
   place aupres des projets deja reperes sur le site de la commune, et
   l'arbitrage decidera ensuite lesquels meritent une fiche a eux seuls. */
const AVIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projets: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { ...CHAMPS_PROJET, source_url: { type: 'string', description: "L'adresse de l'avis, recopiee telle quelle depuis la ligne correspondante." } },
        required: [...CHAMPS_PROJET_REQUIS, 'source_url'],
      },
    },
  },
  required: ['projets'],
};

async function depouillerLesAvis(commune, boamp) {
  if (!boamp.length) return [];
  const system = `Tu depouilles des avis de marches publics de travaux passes par ou pour la commune de ${commune.nom}. Pour chaque avis qui correspond a un amenagement PHYSIQUE et LOCALISABLE du territoire, rends un projet.

Ecarte l'entretien courant, les contrats de service, les achats de materiel et les interventions de concessionnaires de reseau. Le champ « Lieu d'execution » d'un avis EST l'adresse officielle du chantier : recopie-la dans address, en retirant le code postal et le nom de la commune. La date est celle de PARUTION de l'avis, ce n'est ni un debut ni une fin de chantier : ne la presente jamais comme un calendrier.

La citation doit etre recopiee mot pour mot depuis l'objet ou la description de l'avis.`;
  const user = boamp.map((b) => [
    `[${b.link}] ${b.nature || 'Avis'} paru le ${b.date} | maitre d'ouvrage : ${b.acheteur || 'non precise'}`,
    `  Objet : ${b.title}`,
    b.lieu ? `  Lieu d'execution : ${b.lieu}` : '',
    b.description ? `  Description : ${b.description}` : '',
    b.lots?.length ? `  Lots : ${b.lots.join(' ; ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  try {
    const out = await openAIStructured(
      [{ role: 'system', content: system }, { role: 'user', content: `AVIS :\n\n${user}` }],
      'avis_marches', AVIS_SCHEMA, 8000, 90000, 0.2
    );
    const parLien = new Map(boamp.map((b) => [b.link, b]));
    return (out.projets || []).map((p) => ({
      ...p,
      origine: 'marche',
      marcheDate: parLien.get(p.source_url)?.date || '',
      sources: [{ url: p.source_url, type: 'marche' }],
    }));
  } catch (e) {
    console.warn(`[demo-generate] depouillement des avis impossible :: ${e?.message}`);
    return [];
  }
}

/* ARBITRAGE des rapprochements douteux.

   Le tri mecanique tranche les cas nets sans rien couter. Restent les paires
   qui partagent un seul mot caracteristique sans partager leur lieu, ou qui
   n'en partagent aucun tout en designant peut-etre le meme endroit. On ne
   soumet alors que les TITRES et les lieux, jamais les pages : c'est un appel
   court, sur une liste courte, et il ne se declenche pas quand il n'y a aucun
   doute a lever. */
const DOUTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    memes: {
      type: 'array',
      description: 'Index des paires qui designent le MEME chantier physique.',
      items: { type: 'integer' },
    },
  },
  required: ['memes'],
};
// Paires soumises par appel d'arbitrage : au-dela, le modele rate le milieu de
// la liste, exactement comme pour le tri des liens.
const DOUTES_PAR_LOT = 40;

async function arbitrerLesDoutes(commune, projets, groupes, doutes) {
  if (!doutes.length) return groupes;
  const decrire = (i) => `${projets[i].title}${projets[i].geo_query ? ` (lieu : ${projets[i].geo_query})` : ''}`;
  /* Tous les doutes sont arbitres, par LOTS : la troncature a quarante paires
     laissait sur une metropole plus de la moitie des doutes sans arbitrage,
     donc autant de doublons potentiels publies. */
  const lots = [];
  for (let i = 0; i < doutes.length; i += DOUTES_PAR_LOT) lots.push(doutes.slice(i, i + DOUTES_PAR_LOT));
  try {
    const system = `Deux descriptions peuvent designer le MEME chantier de la commune de ${commune.nom}, vu par deux sources differentes, ou deux chantiers DISTINCTS.

Rends les index des paires qui designent le meme chantier physique, au meme endroit. Dans le doute, ne les rapproche pas : fusionner deux operations distinctes fait disparaitre un projet de la carte, alors que les laisser separees ne coute qu'une fiche en double, qu'un dernier controle attrapera plus loin.

Deux descriptions du MEME OBJET sont le MEME chantier, meme si le lieu est formule autrement : « renovation des petites serres » et « restauration des petites serres du parc » designent les memes serres ; une creche nommee et la meme creche avec son adresse sont la meme creche. Deux tranches d'une meme operation aussi.
En revanche un equipement et la voie qui le dessert sont DISTINCTS, et deux equipements differents d'un meme quartier aussi.`;
    const verdictsParLot = await inChunks(lots, 2, async (lot) => {
      const user = lot.map(([i, j], k) => `${k}. A = ${decrire(i)} | B = ${decrire(j)}`).join('\n');
      const out = await openAIStructured(
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        'rapprochement_doutes', DOUTES_SCHEMA, 1000, 40000, 0.1
      );
      return (out.memes || [])
        .filter((k) => Number.isInteger(k) && k >= 0 && k < lot.length)
        .map((k) => lot[k]);
    });
    const aFondre = verdictsParLot.flat();
    if (!aFondre.length) return groupes;

    /* Les groupes sont refondus : deux projets declares identiques doivent
       rejoindre le meme groupe, y compris quand chacun appartenait deja a un
       groupe distinct forme par le tri mecanique. */
    const groupeDe = new Map();
    groupes.forEach((g, idx) => { for (const p of g) groupeDe.set(p, idx); });
    const parent = groupes.map((_, i) => i);
    const racine = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (const [i, j] of aFondre) {
      const gi = groupeDe.get(projets[i]);
      const gj = groupeDe.get(projets[j]);
      if (gi === undefined || gj === undefined) continue;
      const ri = racine(gi); const rj = racine(gj);
      if (ri !== rj) parent[rj] = ri;
    }
    const refondus = new Map();
    groupes.forEach((g, idx) => {
      const r = racine(idx);
      if (!refondus.has(r)) refondus.set(r, []);
      refondus.get(r).push(...g);
    });
    return [...refondus.values()];
  } catch (e) {
    console.warn(`[demo-generate] arbitrage des rapprochements indisponible :: ${e?.message}`);
    return groupes;
  }
}

/* CONTROLE FINAL sur les titres.

   La lecture page par page, sur le modele leger, laisse passer quelques
   residus que la consigne interdit pourtant : mesure sur Lyon, « La salsa
   cubaine » et « SORCIERE ! », deux evenements culturels, figuraient parmi les
   cinquante-trois fiches. Devant un elu, une seule suffit a discrediter la
   carte. Un appel court, sur les seuls titres, ecarte ces residus ; son biais
   est de GARDER, l'extraction ayant deja filtre l'essentiel. */
const RESIDUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ecarter: {
      type: 'array',
      description: 'Index des entrees qui ne sont manifestement PAS des operations d\'amenagement.',
      items: { type: 'integer' },
    },
  },
  required: ['ecarter'],
};

async function ecarterLesResidus(commune, projets) {
  if (projets.length < 2) return projets;
  try {
    const system = `Voici les titres des fiches retenues pour la carte des projets d'amenagement de ${commune.nom}. La quasi-totalite sont de vraies operations : ton travail est seulement d'ecarter les intrus MANIFESTES.

ECARTE : un spectacle, un concert, un cours ou un atelier, un festival, une exposition, une animation saisonniere, une election, un dispositif evenementiel sans chantier, une INAUGURATION seule (le chantier est fini), et la simple PRESENTATION d'un equipement existant (horaires, tarifs, reservation) sans operation de travaux.
NE TOUCHE A RIEN d'autre. Sont des amenagements, meme quand le titre ne le crie pas : une restauration de patrimoine, une fresque murale, une aire de jeux, une vegetalisation de cours d'ecole ou de rue, une ferme urbaine, la suppression de feux ou la pietonnisation d'un carrefour, un equipement, une voirie, une concertation sur l'avenir d'une rue. Dans le doute, garde : ecarter a tort fait disparaitre un vrai projet de la carte.`;
    const user = projets.map((p, i) => `${i}. ${p.title}${p.description ? ` - ${String(p.description).slice(0, 90)}` : ''}`).join('\n');
    const out = await openAIStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      'residus_titres', RESIDUS_SCHEMA, 800, 40000, 0.1
    );
    const ecartes = new Set((out.ecarter || []).filter((i) => Number.isInteger(i) && i >= 0 && i < projets.length));
    if (ecartes.size) {
      console.log(`[demo-generate] residus ecartes au controle final : ${[...ecartes].map((i) => projets[i].title).join(' | ')}`);
    }
    return projets.filter((_, i) => !ecartes.has(i));
  } catch (e) {
    console.warn(`[demo-generate] controle final indisponible :: ${e?.message}`);
    return projets;
  }
}

/* Le vocabulaire d'amenagement ne caracterise aucun projet en particulier :
   « renovation », « travaux » et « ville » se retrouvent dans un titre sur
   deux. Il est retire avant tout rapprochement. */
const MOTS_SANS_CARACTERE = GENERIC_PROJECT_WORDS;

async function coreAi(send, step, state) {
  const { commune, mairie, news, boamp } = state;

  /* ÉTAGE PRESSE : seulement quand la commune et son intercommunalité n'ont
     pas déjà rempli le budget de matière. Il prend sa PROPRE invocation
     (passage de relais) pour ne pas alourdir celle qui porte déjà les avis et
     le rapprochement ; au retour, coreExplore repasse sans rien relire. */
  if (!state.pressePassee) {
    state.pressePassee = true;
    const deja = (state.explo?.bruts || []).length;
    if (process.env.DEMO_PRESSE !== '0' && !(EXPLO_BRUTS_MAX > 0 && deja >= EXPLO_BRUTS_MAX)) {
      state.presseProjets = await moissonnerLaPresse(send, step, state);
      state.presseUrls = [...new Set(state.presseProjets.map((p) => p.source_url))];
      state.__continue = true;
      return state;
    }
  }

  step('ai2', 'start', 'Rapprochement et vérification', 'Un même chantier décrit par plusieurs pages ne fait qu\'une fiche');

  // Les avis de marches, en un appel : liste compacte, aucun risque de volume
  const avis = await depouillerLesAvis(commune, boamp);
  if (avis.length) console.log(`[demo-generate] avis de marches depouilles : ${avis.length} projet(s)`);

  const bruts = [...(state.explo?.bruts || []), ...avis, ...(state.presseProjets || [])];
  const beforeFilter = bruts.length;

  const allowedUrls = new Set([
    ...mairie.urls,
    ...news.flatMap((n) => [n.link, n.sourceUrl].filter(Boolean)),
    ...boamp.map((b) => b.link),
    ...(state.presseUrls || []),
  ].map(normaliserUrl));
  const allowedHosts = new Set([...allowedUrls].map(hostOf).filter(Boolean));

  let retenus = bruts.filter((p) =>
    p.confidence !== 'basse'
    && (allowedUrls.has(normaliserUrl(p.source_url)) || allowedHosts.has(hostOf(p.source_url)))
  );

  // Garde-fou concessionnaires : la consigne demande d'ecarter les
  // interventions de reseau, le modele en laisse passer (releve : « renovation
  // d'un cable electrique moyenne tension par ENEDIS » presentee comme un
  // projet urbain). Remplacer une conduite n'est pas un amenagement.
  const avantConcess = retenus.length;
  retenus = retenus.filter((p) => !estInterventionReseau(p, commune.nom));
  if (retenus.length < avantConcess) {
    console.log(`[demo-generate] interventions de concessionnaire ecartees : ${avantConcess - retenus.length}`);
  }

  /* RAPPROCHEMENT. C'est la contrepartie de la lecture page par page : le meme
     ecoquartier figure sur la rubrique « nos projets », sur l'actualite qui
     annonce le chantier et dans l'avis de marche. Trois pages distinctes,
     aucune lue deux fois, et pourtant trois entrees a fondre en une.
     Ce que la mecanique laisse en doute part a l'arbitrage, sur les seuls
     titres, ce qui est court et sur. */
  const { groupes, doutes } = regrouper(retenus, MOTS_SANS_CARACTERE);
  const groupesFinaux = doutes.length ? await arbitrerLesDoutes(commune, retenus, groupes, doutes) : groupes;
  let projects = groupesFinaux.map((g) => fondre(g, MOTS_SANS_CARACTERE));
  projects = await ecarterLesResidus(commune, projects);
  const fusionnes = retenus.length - projects.length;
  console.log(`[demo-generate] rapprochement : ${retenus.length} descriptions -> ${projects.length} projets (${fusionnes} fondu(s), ${doutes.length} doute(s) arbitre(s))`);

  /* La matiere de l'article : les phrases relevees sur chaque page qui parle du
     projet. Elle remplace l'extrait composite d'autrefois, qui etait decoupe a
     l'aveugle dans un corpus commun. */
  for (const p of projects) {
    p.source_excerpt = (p.page_excerpt || [p.description, p.evidence_quote].filter(Boolean).join('\n\n'))
      .slice(0, SOURCE_EXCERPT_CHARS);
    delete p.page_excerpt;
  }

  if (fusionnes) {
    send({ type: 'rejected', kind: 'doublon', count: fusionnes });
  }

  /* Seul le vide arrete la generation. Un ou deux projets attestes suffisent a
     monter une carte, et la brievete sera annoncee apres le geocodage. */
  if (!projects.length) {
    send({ type: 'error', kind: 'sans-projet', message: messageSansProjet(commune.nom) });
    return null;
  }

  const { retenus: gardes, ecartes } = arbitrerMarches(projects);
  projects = gardes;
  state.marchesReserve = ecartes;
  if (ecartes.length) {
    const propres = projects.filter((p) => p.origine !== 'marche').length;
    const raison = propres >= MARCHES_CIBLE ? 'abondance' : 'plafond';
    console.log(`[demo-generate] marches publics ecartes : ${ecartes.length} (motif ${raison}, ${propres} projet(s) documente(s) par la commune)`);
    send({ type: 'rejected', kind: 'marche', count: ecartes.length, raison, titles: ecartes.map((p) => p.title).slice(0, 12) });
  }

  step('ai2', 'done', 'Projets vérifiés', `${projects.length} projets attestés par les sources`);
  /* La CITATION voyage avec chaque projet attesté. L'écran en fait la matière
     de sa pièce de papier : c'est la phrase relevée dans la source qui prouve
     que le projet existe, et c'est elle qui distingue un recensement d'une
     liste produite par une IA. */
  send({
    type: 'projects',
    items: projects.map((p) => ({
      title: p.title,
      category_slug: p.category_slug,
      quote: String(p.evidence_quote || '').slice(0, 180),
      media: hostOf(p.source_url) || '',
    })),
  });

  state.projects = projects;
  state.stats.pages_lues = state.stats.pages_lues || 0;
  state.stats.candidates = beforeFilter;
  state.stats.marches_ecartes = ecartes.length;

  // Le paquet de sources ne sert plus : on allège le brouillon. On garde
  // toutefois un index reduit des pages (titre, images, debut de texte) : la
  // phase illustrations, qui tourne plus tard, en a besoin pour rattacher une
  // photo de la mairie au bon projet.
  /* Index reduit des pages, pour la seule phase des illustrations : elle a
     besoin de rattacher une photo de la mairie au bon projet, rien de plus.

     Ce resserrement compte plus qu'il n'y parait. Le brouillon est relu ET
     reecrit a chaque tranche, et la localisation en compte jusqu'a quatorze :
     tout ce qu'on y laisse dormir se paie autant de fois. Depuis que la
     collecte peut rapporter soixante-dix pages au lieu de trente, un index
     genereux couterait plusieurs centaines de kilo-octets par tranche.
     Ne sont donc gardees que les pages qui portent VRAIMENT une image. Le texte
     des blocs, lui, n'est PAS raccourci : c'est exactement ce qui sert a
     reconnaitre lequel parle du projet, et l'amputer ferait retomber le
     rattachement sur la page entiere, c'est-a-dire sur la photo du voisin. */
  state.mairie.pages = mairie.pages
    .filter((p) => p.images?.length || p.blocs?.some((b) => b.images?.length))
    .map((p) => ({
      url: p.url,
      title: p.title,
      images: (p.images || []).slice(0, 8),
      blocs: (p.blocs || []).filter((b) => b.images?.length).slice(0, 25),
      text: (p.text || '').slice(0, 1500),
    }));
  state.news = [];
  // Le texte des PDF a fini son office (paquet + fusion) : il pese lourd dans
  // le brouillon relu a chaque phase suivante. Les liens (mairie.pdfs) restent,
  // eux servent encore au rattachement des dossiers en phase create.
  state.mairie.pdfTextes = [];
  state.boamp = [];
  /* L'exploration est finie : son etat - la file, ses centaines d'adresses, les
     echantillons de gabarit, les projets bruts deja fondus - n'a plus aucun
     lecteur, et le brouillon est relu jusqu'a quatorze fois par la phase de
     localisation. Tout ce qui reste ici se paierait a chaque tranche. */
  state.explo = null;
  state.mairie.candidates = [];
  state.mairie.accueilTexte = '';
  state.mairie.navigation = [];
  if (state.epci) state.epci = { nom: state.epci.nom, host: state.epci.host };
  return state;
}

/* Trois methodes, toutes precises. Le niveau « quartier identifie » a ete
   retire avec l'etage IRIS : une emprise de secteur statistique n'est pas la
   position d'un projet. */
const METHOD_LABELS = {
  emprise: 'emprise réelle trouvée',
  trace: 'tracé réel trouvé',
  adresse: 'adresse précise',
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

/* Brouillon ecrit par une version anterieure du code.
   L'etat de la phase de localisation voyage en base entre les tranches, et une
   mise en production peut tomber au milieu d'une generation. Les champs absents
   doivent etre recrees, sinon un `.push` sur `undefined` fait echouer la
   reprise. De meme, `aTester` contenait de simples indices avant de contenir
   des paires [projet, rang] : le destructurer sur un nombre leve une exception
   et la generation se terminait en echec, brouillon intact et IA deja payee. */
function migrerEtatGeo(geo, queries) {
  if (!geo) return geo;
  if (!Array.isArray(geo.titresFusionnes)) geo.titresFusionnes = [];
  if (!Array.isArray(geo.titresSuperposes)) geo.titresSuperposes = [];
  if (!Array.isArray(geo.titresAbandonnes)) geo.titresAbandonnes = [];
  if (!Array.isArray(geo.aTester)) geo.aTester = [];
  if (geo.etape === 'nominatim' && geo.aTester.length && !Array.isArray(geo.aTester[0])) {
    geo.aTester = essaisNominatim(queries);
    geo.curseur = 0;
  }
  return geo;
}

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
  if (process.env.DEMO_DUMP && !state.geo) {
    // Ce que le geocodeur va reellement chercher. Sans cette trace, un projet
    // non localise ne dit pas s'il manquait de lieu ou si l'annuaire a echoue.
    projects.forEach((p, i) => {
      console.log(`[demo-geo] "${p.title}" -> ${queries[i].length ? queries[i].join(' | ') : 'AUCUNE REQUETE'}`);
      console.log(`[demo-geo]   extrait : ${(p.source_excerpt || '').slice(0, 400).replace(/\s+/g, ' ')}`);
    });
  }

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
    /* Les TITRES des projets ecartes, pas seulement leur nombre. L'ecran de
       generation les affiche : « voila ce que nous avons refuse de vous
       montrer, et pourquoi » est un argument, un compteur anonyme n'en est
       pas un. */
    titresFusionnes: [],
    titresSuperposes: [],
    /* Titres des projets restes sans emplacement AVANT une reouverture de la
       reserve de marches, qui remplace `geo.reste` par de nouveaux indices. */
    titresAbandonnes: [],
    tours: 0,
  });

  migrerEtatGeo(geo, queries);
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
      if (memeChantier(deja, projet, d)) {
        geo.fusionnes++;
        geo.titresFusionnes.push(projet.title);
        return false;
      }
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
        geo.titresSuperposes.push(projet.title);
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
      if (!lot.length) { etapeSuivante('ia'); continue; }
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

    /* L'etage des quartiers IRIS de l'INSEE a ete RETIRE.

       Il posait le projet sur l'emprise d'un secteur statistique entier, ce qui
       revient a colorier un quartier de plusieurs centaines de metres pour un
       chantier ponctuel. Mesure sur Venissieux : la ligne de tramway T10 et
       Grand Parilly - Puisoz etaient rendus ainsi. Devant un elu qui connait
       son territoire, une tache large affichee a la place d'un projet precis se
       lit comme une approximation, pas comme une information.
       Un projet qu'on ne sait situer qu'a la maille du quartier est desormais
       ecarte, comme tous les autres emplacements non verifiables. */

    /* Dernier recours : on redemande a l'IA. Elle a lu les sources et
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

  /* FILET : la réserve des marchés publics.
     Les avis écartés plus haut l'ont été sur le nombre de projets ATTESTÉS, pas
     sur le nombre de projets qui atterrissent vraiment sur la carte. Quand le
     géocodage fait fondre la liste, on rouvre la réserve plutôt que de livrer
     une carte vide alors qu'il restait de la matière. Une seule fois, et
     seulement en dessous du plancher : rouvrir en boucle reviendrait à annuler
     l'arbitrage. */
  /* La réouverture exige qu'il reste un tour pour travailler : sans cette
     condition, la tranche suivante sort de la boucle sans rien tenter et
     l'écran annonce comme « emplacement non vérifiable » des avis auxquels on
     n'a jamais posé la question. */
  if (state.located.length < RESERVE_PLANCHER
    && state.marchesReserve?.length
    && !geo.reserveUtilisee
    && geo.tours < GEO_MAX_TOURS) {
    const reserve = state.marchesReserve;
    state.marchesReserve = [];
    geo.reserveUtilisee = true;
    console.log(`[demo-generate] ${state.located.length} projet(s) situé(s) : réouverture de ${reserve.length} avis de marché mis en réserve`);
    /* L'écran annonçait ces avis comme écartés : ils ne le sont plus. Un compte
       à zéro efface la mention, sinon le visiteur lirait « avis écartés »
       pendant que les épingles de ces mêmes avis se posent sous ses yeux. */
    send({ type: 'rejected', kind: 'marche', count: 0 });
    state.stats.marches_ecartes = 0;
    /* Les projets restés sans emplacement sont MÉMORISÉS avant d'écraser le
       reste : `geo.reste` est leur seul porteur, et la réouverture le remplace
       par les indices de la réserve. Sans cette copie, une carte à six projets
       sur vingt annonçait ensuite « trois écartés » et n'en nommait aucun des
       quatorze vrais. Ce qu'on refuse est un argument à condition de dire vrai. */
    geo.titresAbandonnes.push(...geo.reste.map((i) => projects[i].title));
    const depart = projects.length;
    projects.push(...reserve);
    // On repart uniquement sur les nouveaux venus, à l'étage le plus complet.
    geo.etape = 'nominatim';
    geo.curseur = 0;
    geo.reste = reserve.map((_, k) => depart + k);
    geo.aTester = essaisNominatim(projects.map(locationQueries))
      .filter(([i]) => i >= depart);
    geo.lieuxIa = null;
    step('geo', 'done', 'Localisation en cours', `${state.located.length} projet(s) situé(s), reprise sur les marchés publics`);
    state.projects = projects;
    state.__continue = true;
    return state;
  }
  // La réserve n'a plus de raison d'être : elle ne doit pas voyager davantage.
  state.marchesReserve = [];

  /* Les projets qu'on ne sait pas situer, meme a la maille du quartier, sont
     RETIRES. Ils etaient auparavant poses a une position calculee autour du
     centre-ville, indiscernable d'une vraie punaise : une carte qui invente des
     emplacements devant un elu qui connait sa commune coute plus cher qu'une
     carte moins fournie. */
  const located = state.located;
  /* Un projet ecarte pour position DEJA OCCUPEE est bien un projet dont on ne
     connait pas l'emplacement : le geocodeur lui a rendu le repli d'un autre.
     Il rejoint donc les non localisables, ce qui est exact. */
  const abandonnes = geo.reste.length + geo.titresAbandonnes.length + geo.superposes;

  /* Seul le vide arrete la generation : sans un projet situe, il n'y a rien a
     poser sur la carte. Un ou deux projets, eux, font une carte courte, pas un
     echec. */
  if (!located.length) {
    send({ type: 'error', kind: 'sans-projet', message: messageSansProjet(state.commune.nom) });
    return null;
  }

  /* Le compte devient DEFINITIF ici, le geocodage etant la derniere etape qui
     puisse reduire la liste. C'est donc le moment d'annoncer une carte courte :
     assez tot pour que les illustrations et la redaction restent a venir, et
     assez tard pour ne pas annoncer un nombre qui se contredirait ensuite. */
  const carteCourte = located.length < CARTE_COURTE;
  if (carteCourte) {
    send({ type: 'notice', message: messageCarteCourte(state.commune.nom, located.length) });
  }

  // Toutes les positions retenues sont precises : l'etage quartier n'existe plus
  const exacts = located.length;
  console.log(`[demo-generate] geo ${state.commune.nom}: ${located.length} situés, ${abandonnes} sans emplacement identifiable (dont ${geo.superposes} sur une position déjà occupée), ${geo.fusionnes} doublon(s) fusionné(s), ${geo.tours} tranche(s)`);
  step('geo', 'done', 'Projets localisés',
    `${located.length} projet(s) situé(s)${abandonnes ? `, ${abandonnes} écarté(s) faute d'emplacement identifiable` : ''}`);
  /* Ce qu'on REFUSE est un argument, à condition de dire vrai. Les doublons
     fusionnés ne sont PAS des « emplacements non vérifiables » : ils étaient
     parfaitement localisés, c'est le projet qui faisait doublon. Les compter
     ensemble revenait à mentir à l'écran sur le motif du rejet.
     Cet argument ne tient QUE sur une carte fournie : afficher cinq rejets
     au-dessus de deux projets retenus insiste sur ce qui manque au lieu de
     valoriser ce qui a été trouvé. Sur une carte courte, on se tait. */
  if (abandonnes && !carteCourte) {
    send({
      type: 'rejected',
      kind: 'position',
      count: abandonnes,
      // Les projets restes sans emplacement, plus ceux rabattus sur une
      // position deja prise : les deux relevent du meme motif.
      titles: [...geo.titresAbandonnes, ...geo.reste.map((i) => projects[i].title), ...geo.titresSuperposes].slice(0, 12),
    });
  }
  if (geo.fusionnes && !carteCourte) {
    send({ type: 'rejected', kind: 'doublon', count: geo.fusionnes, titles: geo.titresFusionnes.slice(0, 12) });
  }

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
   doublons, et une photo de parking se retrouvait sur un projet de rue.

   Une image servie par un SERVICE n'a pas de nom de fichier : toutes les vues
   aériennes de la Géoplateforme partagent le chemin `/wms-r/wms` et ne se
   distinguent que par leur cadrage, qui est dans la chaîne de requête. Sans le
   cas ci-dessous, la première vue aérienne d'une génération passait et TOUTES
   les suivantes étaient rejetées comme doublons, silencieusement. La chaîne de
   requête n'entre dans la clé que lorsque le nom de fichier ne dit rien, pour
   ne pas rouvrir la porte aux vignettes de cache que ce garde-fou attrape. */
const NOM_DE_FICHIER_IMAGE = /\.[a-z0-9]{2,5}$/;

function coverKey(u) {
  try {
    const url = new URL(u);
    const p = decodeURIComponent(url.pathname).toLowerCase();
    const file = p.slice(p.lastIndexOf('/') + 1);
    const normalise = file.replace(/-[0-9a-f]{6,}(?=\.[a-z0-9]+$)/, '').replace(/[\s_]+/g, '-');
    if (NOM_DE_FICHIER_IMAGE.test(normalise)) return normalise;
    return `${p}?${url.search.slice(1).toLowerCase()}`;
  } catch { return u; }
}

/* Phase ILLUSTRATIONS. Quatre rangs, du plus au moins probant :

   1. le visuel publié par la mairie sur la page qui parle DE CE projet ;
   2. le visuel de la source du projet, article de presse ou page officielle ;
   3. une photo Wikimedia du lieu, quand le projet désigne un lieu nommé ;
   4. à défaut, la vue aérienne du lieu exact.

   Les trois premiers passent devant un juge visuel qui a le droit de tout
   refuser : ils prétendent montrer le projet, il faut donc le vérifier. Le
   quatrième ne passe devant personne, il est juste par construction, et il
   n'est jamais présenté comme une photo du projet.

   Découpée en tranches et émettant au fil de l'eau, pour les mêmes raisons que
   la localisation : un appel de vision par projet, quatre en parallèle, et un
   nombre de projets désormais non plafonné. L'ancienne version n'envoyait rien
   à l'écran avant d'avoir jugé TOUTES les images, soit un second silence de
   près d'une minute juste après celui de la localisation. */
/* Vue aérienne d'un projet, quand aucune photo ne le montre.
   Rend null si le service ne couvre pas la commune, ou si ce cadrage exact a
   déjà servi à un autre projet, ce qui n'arrive qu'entre deux projets voisins
   au mètre près. */
function vueAerienneDe(projet, disponible, used) {
  if (!disponible) return null;
  const url = vueAerienneUrl(projet.geometry);
  if (!url || used.has(coverKey(url))) return null;
  return { url, credit: IGN_CREDIT, source: 'aerien' };
}

async function coreMedia(send, step, state) {
  const located = state.located;
  const pages = state.mairie?.pages || [];
  const media = state.media || (state.media = { curseur: 0, illustrated: 0, aeriennes: 0, used: [], tours: 0 });
  media.tours++;

  /* La couverture aérienne est sondée UNE fois et retenue sur l'état racine :
     `state.media` est remis à null en fin de phase, un drapeau posé dessus ne
     survivrait pas d'une tranche à l'autre. */
  if (state.ignAerien === undefined) {
    state.ignAerien = await couvertureVueAerienne(state.commune.lat, state.commune.lng);
    console.log(`[demo-generate] vue aérienne IGN : ${state.ignAerien ? 'disponible' : 'indisponible ou hors couverture'} sur ${state.commune.nom}`);
  }

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
      const candidates = await gatherImageCandidates(p, state.commune.nom, pages);
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
      const retenu = img && !used.has(coverKey(img.url))
        ? { url: img.url, credit: img.credit, source: 'photo' }
        : vueAerienneDe(located[i], state.ignAerien, used);
      if (!retenu) continue;
      used.add(coverKey(retenu.url));
      located[i].coverSrc = retenu.url;
      located[i].coverCredit = retenu.credit;
      media.illustrated++;
      if (retenu.source === 'aerien') media.aeriennes++;
      const c = centroidOf(located[i].geometry);
      // coverSrc + coordonnées : le front pose la photo directement sur la carte
      send({
        type: 'media-item',
        title: located[i].title,
        credit: retenu.credit,
        coverSrc: retenu.url,
        lat: c.lat,
        lng: c.lng,
        source: retenu.source,
        // Conservé pour les écrans déjà ouverts au moment d'une mise en ligne
        generique: false,
      });
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
     requete. Le credit annonce explicitement l'image comme generique.

     Depuis la vue aerienne, ce repli ne sert plus que la ou l'IGN ne couvre pas
     la commune. Une photo d'une AUTRE piscine se repere en un instant devant un
     elu, la ou la vue aerienne de sa propre commune se verifie ; on ne descend
     donc a ce rang que faute de mieux. Sur une generation ordinaire, cet appel
     a l'IA ne part plus du tout. */
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
          send({ type: 'media-item', title: located[idx].title, credit: located[idx].coverCredit, coverSrc: c.url, lat: pt.lat, lng: pt.lng, source: 'generique', generique: true });
        });
      });
      console.log(`[demo-generate] media: repli thématique appliqué sur ${entrees.reduce((s, [, i2]) => s + i2.cibles.length, 0)} projet(s)`);
    }
  }

  const illustrated = media.illustrated;
  const aeriennes = media.aeriennes;
  const photos = illustrated - aeriennes;
  console.log(`[demo-generate] media: ${illustrated}/${located.length} illustrés dont ${aeriennes} vue(s) aérienne(s) (${media.tours} tranche(s))`);
  step('media', illustrated ? 'done' : 'skip', 'Illustrations trouvées',
    `${illustrated}/${located.length} projets illustrés${aeriennes ? ` (${photos} visuel(s) officiel(s), ${aeriennes} vue(s) aérienne(s) du lieu)` : ' (image choisie par l\'IA)'}`);
  // Refuser une photo hors sujet est une décision, pas un échec : on l'affiche
  if (located.length - illustrated > 0) {
    send({ type: 'rejected', kind: 'photo', count: located.length - illustrated });
  }

  state.media = null;
  state.stats.illustrated = illustrated;
  state.stats.aeriennes = aeriennes;
  /* L'index des pages de la mairie a fini son office : il ne servait qu'à
     rattacher une photo au bon projet, ce qui vient d'être fait. Il pèse
     lourd, et la rédaction qui suit relit puis réécrit le brouillon à chaque
     tranche. Rien en aval ne le lit : la phase de création n'utilise de
     `mairie` que ses PDF et ses candidats de logo. */
  if (state.mairie) state.mairie.pages = [];
  return state;
}

/* Phase RÉDACTION, découpée en tranches comme la localisation et les
   illustrations. Un article se recherche puis s'écrit en cinq à dix secondes :
   dix-sept articles ne tiennent plus dans une invocation, alors que trois
   appels de lot y tenaient. Trois articles à la fois, pas davantage : le bac à
   sable des fonctions rompt ses connexions sortantes au-delà. */
const ARTICLES_CONCURRENCE = 3;

async function coreRedact(send, step, state) {
  const located = state.located;
  const redac = state.redac || (state.redac = { curseur: 0, tours: 0 });
  redac.tours++;
  state.articles = state.articles || [];

  step('articles', 'start',
    redac.tours === 1 ? 'Rédaction des articles de présentation' : 'Rédaction en cours',
    redac.tours === 1
      ? 'Un article par projet, écrit à partir des sources officielles consultées'
      : `${state.articles.length} article(s) écrit(s), ${located.length - redac.curseur} restant(s)`);

  const t0 = Date.now();
  const pdfs = state.mairie?.pdfs || [];
  const mairieHost = state.mairie?.host || '';

  while (redac.curseur < located.length && Date.now() - t0 < PHASE_BUDGET_MS) {
    const lot = [];
    for (let k = 0; k < ARTICLES_CONCURRENCE && redac.curseur < located.length; k++) lot.push(redac.curseur++);
    const ecrits = await inChunks(lot, ARTICLES_CONCURRENCE, async (i) => {
      try {
        const markdown = await redigerArticle(state.commune, located[i], pdfs, mairieHost);
        send({ type: 'article-item', title: located[i].title });
        return { index: i, title: located[i].title, markdown };
      } catch (e) {
        // Un article manquant est un manque, pas une panne : la fiche existe
        // quand même, avec sa description et sa photo.
        console.error(`[demo-generate] article "${located[i].title}" :`, e.message);
        return null;
      }
    });
    for (const a of ecrits) {
      // Un rejeu de tranche ne doit pas creer de doublon
      if (a && !state.articles.some((x) => x.index === a.index)) state.articles.push(a);
    }
  }

  if (redac.curseur < located.length && redac.tours < GEO_MAX_TOURS) {
    step('articles', 'done', 'Rédaction en cours', `${state.articles.length} article(s) écrit(s)`);
    state.__continue = true;
    return state;
  }
  delete state.__continue;

  console.log(`[demo-generate] articles : ${state.articles.length}/${located.length} (${redac.tours} tranche(s))`);
  step('articles', state.articles.length ? 'done' : 'skip', 'Articles rédigés', `${state.articles.length} article(s) de présentation`);
  state.redac = null;
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
  const state = cumulerTokens(await coreSources(send, step, insee, runState));
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
    const s2 = await enchainer(coreExplore, state);
    if (!s2) return;
    const s3 = await enchainer(coreGeo, s2);
    // coreGeo renonce quand trop peu de projets sont situés : il a déjà expliqué
    // pourquoi à l'écran, on s'arrête là plutôt que de casser sur un état nul.
    if (!s3) return;
    const s4 = await enchainer(coreMedia, s3);
    if (!s4) return;
    /* La rédaction est elle aussi découpée en tranches depuis qu'elle fait un
       appel par projet : sans `enchainer`, la voie locale n'écrivait plus que
       les trois premiers articles. */
    const s5 = await enchainer(coreRedact, s4);
    if (!s5) return;
    // Audit local : DEMO_DUMP=1 déverse les artefacts complets (projets
    // localisés, illustrations retenues, articles rédigés) dans les logs
    // serveur, seule façon de les inspecter sans persistance Supabase.
    if (process.env.DEMO_DUMP) {
      console.log('[demo-dump] ' + JSON.stringify({
        commune: s5.commune,
        mairie: {
          host: s5.mairie?.host,
          logoUrl: s5.mairie?.logoUrl,
          themeColor: s5.mairie?.themeColor,
          pages: s5.mairie?.pages?.map((p) => ({ url: p.url, title: p.title, chars: p.text?.length })),
          pdfs: s5.mairie?.pdfs?.map((p) => p.url),
          imagesCount: s5.mairie?.images?.length,
        },
        stats: { ...s5.stats, tokens_in: _tokens.input, tokens_out: _tokens.output, appels_ia: _tokens.appels },
        located: s5.located,
        articles: s5.articles,
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
/* Compteur d'echecs d'une phase, pose par le handler sous la cle `_attempts_<route>`.
   Il vit dans le brouillon, donc il survit aux invocations : c'est voulu, sans
   quoi l'anti-boucle ne verrait jamais deux echecs de suite. Mais il n'etait
   remis a zero QU'AU moment d'atteindre le plafond, jamais apres un travail
   reussi. Une phase decoupee en tranches - la localisation en compte jusqu'a
   quatorze - qui rencontre un incident passager sur sa premiere tranche puis un
   autre sur sa troisieme atteignait donc 2 sur 2 et la generation etait
   abandonnee, alors qu'elle avancait normalement entre les deux. */
function oublierLesEchecs(payload, route) {
  const cle = `_attempts_${route}`;
  if (!payload || payload[cle] === undefined) return payload;
  const { [cle]: _, ...reste } = payload;
  return reste;
}

async function runPhase(send, step, ville, { expect, core, nextStatus, nextPhase, selfPhase, route }, runState) {
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
    // Une tranche qui aboutit efface l'ardoise : voir oublierLesEchecs.
    await updateInstance(ville, { status: expect, payload: oublierLesEchecs(state, route) });
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

  await updateInstance(ville, { status: nextStatus, payload: oublierLesEchecs(state, route) });
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

const runAi = (send, step, ville, rs) => runPhase(send, step, ville, { route: 'ai', expect: 'draft-sources', core: coreExplore, nextStatus: 'draft-ai', nextPhase: 'locate', selfPhase: 'ai' }, rs);
const runLocate = (send, step, ville, rs) => runPhase(send, step, ville, { route: 'locate', expect: 'draft-ai', core: coreGeo, nextStatus: 'draft-locate', nextPhase: 'media', selfPhase: 'locate' }, rs);
const runMedia = (send, step, ville, rs) => runPhase(send, step, ville, { route: 'media', expect: 'draft-locate', core: coreMedia, nextStatus: 'draft-media', nextPhase: 'redact', selfPhase: 'media' }, rs);
const runRedact = (send, step, ville, rs) => runPhase(send, step, ville, { route: 'redact', expect: 'draft-media', core: coreRedact, nextStatus: 'draft', nextPhase: 'create', selfPhase: 'redact' }, rs);

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
      /* Trou de couverture LOCAL dans la prise de vue aérienne. La sonde de la
         phase illustrations vérifie la commune, pas chaque parcelle : il reste
         des zones blanches ponctuelles, et le service les rend avec un code 200
         comme s'il n'y avait rien d'anormal. Une image uniforme se compresse en
         quelques kilo-octets là où une vraie vue en pèse cent à deux cents. */
      if (estVueAerienne(p.coverSrc) && img.data.byteLength < AERIEN_OCTETS_MIN) {
        console.warn(`[demo-generate] vue aérienne vide (${img.data.byteLength} octets) : ${p.title}`);
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
  /* Le zoom d'ouverture de la carte est calculé ICI, avant les fichiers, parce
     que le seuil de visibilité d'une emprise en dépend directement : les deux
     doivent venir du même nombre, sinon ils divergeront à la première retouche
     du barème. Il sert ensuite tel quel au branding de la ville, plus bas. */
  const population = commune.population || 0;
  const zoom = population > 100000 ? 12 : population > 20000 ? 13 : population > 5000 ? 14 : 15;

  // Uploads geojson + markdown par lots (inChunks préserve l'ordre : rows[i] = located[i])
  const rows = await inChunks(located.map((p, i) => ({ p, i })), 5, async ({ p, i }) => {
    const slug = slugs[i];
    const fc = {
      type: 'FeatureCollection',
      features: featuresDuProjet(p.geometry, p.title, zoom, commune.lat),
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
  /* Dedoublonnage sur la cle de conflit AVANT l'insertion. Deux fiches portant
     le meme intitule, ou un meme PDF cite par deux articles, produisaient deux
     lignes de meme (project_name, pdf_url) dans un seul ordre SQL : Postgres
     refuse alors tout le lot (21000, « ON CONFLICT DO UPDATE command cannot
     affect row a second time ») et la phase de creation echoue en entier.
     Constate le 04/09/2026 sur Le Havre : 38 projets localises perdus a la
     derniere etape, apres dix minutes de collecte. */
  const dossiersUniques = [...new Map(
    dossierRows.map((d) => [`${d.project_name}\u0000${d.pdf_url}`, d])
  ).values()];
  if (dossiersUniques.length) {
    await insertRows('consultation_dossiers', dossiersUniques, { onConflict: 'project_name,pdf_url' });
    createItem(`${dossiersUniques.length} document(s) officiel(s) rattaché(s) aux fiches`);
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

  /* Réseau de transport LOURD (métro, tram, funiculaire) : couche de données
     NATIVE de l'espace, construite depuis OpenStreetMap, couleur officielle
     portée par chaque tracé, affichée par défaut. Une seule ligne suffit :
     le tram d'une ville moyenne est précisément ce qu'on veut montrer. Un
     seul tour de service et un échec silencieux : le réseau est un bonus, il
     ne retarde ni ne fait échouer la création. « Refaire le recensement » le
     reconstruit, comme le reste de l'espace. */
  try {
    const data = await chargerReseau(zoneParInsee(commune.code), { timeoutMs: 15000, tours: 1 });
    const reseau = reseauEnGeojson(data);
    if (reseau.features.length >= 1) {
      const reseauUrl = await uploadToStorage(
        `layer/${ville}/transports.geojson`,
        JSON.stringify(reseau),
        'application/json'
      );
      await deleteWhere('layers', { ville: `eq.${ville}`, name: `eq.${NOM_COUCHE_TRANSPORTS}` });
      await insertRows('layers', [{
        ville,
        name: NOM_COUCHE_TRANSPORTS,
        url: reseauUrl,
        style: STYLE_COUCHE_TRANSPORTS,
        is_default: true,
        icon: null,
        icon_color: null,
      }]);
      await insertRows('category_icons', [{ ville, ...CATEGORIE_TRANSPORTS, display_order: usedSlugs.length + 1 }]);
      createItem(`Réseau de transport ajouté (${reseau.features.length} lignes)`);
    }
  } catch (e) {
    console.warn(`[demo-generate] réseau de transport indisponible pour ${ville} :: ${e?.message}`);
  }

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
    /* Le seuil de la carte courte n'est defini QU'ICI : l'ecran recoit un
       booleen deja tranche, il n'a pas a connaitre le nombre qui le declenche.
       Le compte fait foi est celui des fiches reellement publiees. */
    courte: rows.length < CARTE_COURTE,
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
            send({ type: 'error', kind: 'quota', message: 'Le quota de démonstrations du jour est atteint.' });
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
            /* Sans clé service (netlify dev ne transmet pas les valeurs
               secrètes), cette invocation ne peut ni voir qu'une commune a déjà
               son espace (l'idempotence est aveugle : on regénère), ni créer
               l'espace en fin de parcours. Le dire MAINTENANT : découvert après
               trois minutes d'analyse, ce mode local passe pour une panne. */
            if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
              // L'ecran reste muet sur ce mode : seul le journal en parle,
              // et le message de fin explique pourquoi aucun espace n'existe
              console.warn('[demo-generate] clé service Supabase absente : idempotence et création d\'espace désactivées (poser SUPABASE_SERVICE_ROLE_KEY dans .env pour retrouver le comportement de production)');
            }
            const kioskOk = process.env.DEMO_KIOSK_KEY
              && url.searchParams.get('k') === process.env.DEMO_KIOSK_KEY;
            // Avant de compter : le journal doit dire la verite sur les runs
            // qu'aucune invocation ne tient plus.
            await sweepStaleRuns();
            const [byIp, global] = await Promise.all([countToday('ip_hash', ipHash), countToday(null, null)]);
            if (global >= MAX_GLOBAL_PER_DAY || (!kioskOk && byIp >= MAX_PER_IP_PER_DAY)) {
              send({ type: 'error', kind: 'quota', message: 'Le quota de démonstrations du jour est atteint.' });
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
        /* Le motif est consigne MEME quand la reprise reste possible.
           Sans cela, une phase qui echoue laissait une ligne `running` muette,
           impossible a distinguer d'un onglet ferme : c'est ce qui a rendu
           Villeurbanne indechiffrable (5 tentatives, aucune erreur en base,
           une heure a reconstituer ce qu'une colonne aurait dit). Le run n'est
           pas CLOS ici, la reprise doit pouvoir aboutir ; on l'annote. */
        if (runState.id) {
          await patchRun(runState.id, { error_message: `phase=${phase} :: ${runState.crashMessage}` });
        }
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
  inChunks,
  lireFluxBorne,
  lireJson,
  corpsJson,
  MAIRIE_BUDGET_MS,
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
  vueAerienneUrl,
  couvertureVueAerienne,
  coverKey,
  oublierLesEchecs,
  featuresDuProjet,
  tailleMinimaleVisible,
  pointDeRepere,
  REPERE_MIN_PX,
  arbitrerMarches,
  domainesAutorises,
  nomDistinctifEpci,
  MARCHES_CIBLE,
  typeImageReel,
  looksLikeCode,
  estPageTremplin,
  collectPageLinks,
  essaisNominatim,
  migrerEtatGeo,
  communeDuResultat,
  METHOD_LABELS,
  sansPrefixeGenerique,
  nomCoherent,
  positionDansLaCommune,
  locationQueries,
  unescapeBoamp,
  odonymesDe,
  distinctiveWords,
  CARTE_COURTE,
  deLaCommune,
  messageSansProjet,
  messageCarteCourte,
};
