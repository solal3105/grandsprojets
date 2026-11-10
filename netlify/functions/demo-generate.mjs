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

// Empreinte des pages lues, pour ne jamais relire la meme sous une autre adresse
import { createHash } from 'node:crypto';
// Socle de rédaction partagé avec l'outil de l'admin : structure de l'article,
// nettoyage des liens, construction du bloc de sources citées.
import { promptArticle, retirerLesLiens, blocSources, hoteLisible } from './lib/redaction.mjs';
import {
  chargerReseau, reseauEnGeojson, zoneParInsee,
  STYLE_COUCHE_TRANSPORTS, NOM_COUCHE_TRANSPORTS, CATEGORIE_TRANSPORTS,
} from './lib/transit-osm.mjs';
// Mecanique d'exploration : registre des pages vues, file de ce qui reste a
// ouvrir, fusion des descriptions d'une meme operation.
import {
  FileExploration, empreinteGabarit, retirerGabaritConnu, GABARIT_RESTE_MIN,
  fondre, normaliserUrl, estUnPdf, estUnePageExplorable,
} from './lib/demo-exploration.mjs';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
// La demo a sa propre cle pour que son budget reste separe de celui du reste.
// A defaut, elle suit la cle commune. Dans tous les cas l'appel part chez OpenAI
// directement : `netlify dev` remplace OPENAI_API_KEY par un jeton a lui, et
// OPENAI_DIRECT_KEY est le nom qu'il ne reecrit pas.
const DEMO_OPENAI_KEY = process.env.DEMO_OPENAI_KEY || null;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const openaiKey = () => DEMO_OPENAI_KEY || process.env.OPENAI_DIRECT_KEY || process.env.OPENAI_API_KEY;
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
// Documents officiels : ce qu'on soumet au jugement pour UNE page, et ce qu'on
// retient pour tout le site. Le tri, lui, appartient a la lecture de la page.
const PDF_PAR_PAGE_MAX = 20;
const PDF_TOTAL_MAX = 40;
/* LECTURE des PDF de la mairie. Une petite commune ne decrit souvent ses
   projets que dans les proces-verbaux du conseil et son bulletin : mesure sur
   faugeres34.fr, aucune page du site ne parle de la rehabilitation de l'ancienne
   mairie, de la borne de recharge ni de la centrale solaire, que les PV de 2025
   et 2026 detaillent avec leur plan de financement. Quand le site est epuise
   sans avoir reuni assez de matiere, UN jugement choisit parmi tous les PDF
   croises ceux qui valent d'etre lus ; ils entrent en file comme des pages, et
   leur texte est lu par tranches. Bornes : nombre de documents, poids du
   fichier, nombre de tranches. Une ville dont le site suffit ne lit aucun PDF. */
const PDF_LUS_MAX = 12;
const DOCS_VUS_MAX = 240;
const DOCS_PAR_PAGE_VUS = 60;
const PDF_OCTETS_MAX = 30000000;
const PDF_TRANCHES_MAX = 4;
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
  address: { type: 'string', description: 'Adresse postale EXACTE du projet SI elle figure telle quelle dans le texte (ex : "12 rue Voltaire" ou "avenue des Belges"). Recopie-la fidèlement. Chaîne vide si aucune adresse n\'est écrite - N\'INVENTE JAMAIS d\'adresse. L\'adresse où l\'on consulte le dossier, où se tient une enquête publique ou une permanence (mairie, services techniques) n\'est PAS celle du projet : laisse alors ce champ vide, sauf si le projet porte sur ce bâtiment lui-même.' },
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
    documents: {
      type: 'array',
      maxItems: 8,
      description: 'Index des documents PDF de cette page qui sont le dossier d\'une opération d\'aménagement : dossier de concertation, notice d\'enquête publique, plan-guide, planning de travaux, délibération portant sur une opération. Tableau vide si aucun, ce qui est le cas le plus fréquent.',
      items: { type: 'integer' },
    },
    interet: {
      type: 'string',
      enum: ['forte', 'moyenne', 'nulle'],
      description: 'Cette page appartient-elle à une rubrique qui parle d\'aménagement du territoire ? "forte" pour une page de projet ou son sommaire, "nulle" pour une page de service, d\'état civil ou de vie associative.',
    },
  },
  required: ['projets', 'liens', 'documents', 'interet'],
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
/* Meme logique pour les caracteres COUPES EN DEUX. Un emoji occupe deux
   unites UTF-16 ; une troncature au caractere pres (extrait de 1 800 signes
   autour d'une citation, echantillon de gabarit, index des visuels) peut n'en
   garder qu'une moitie. JSON.stringify l'ecrit alors \\udXXX, que PostgreSQL
   refuse en jsonb (22P02, « Unicode low surrogate must follow a high
   surrogate ») : c'est un 400 sur l'ecriture du brouillon, identique a chaque
   reprise puisque l'etat est le meme. Constate le 10/11/2026 sur
   Noyal-Chatillon-sur-Seiche : deux echecs de suite a la meme tranche de
   lecture, puis abandon de la generation. Chaque moitie orpheline devient le
   caractere de remplacement, avant la serialisation. */
const MOITIE_ORPHELINE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const sansMoitieOrpheline = (cle, v) => (typeof v === 'string' ? v.replace(MOITIE_ORPHELINE_RE, '\uFFFD') : v);
const corpsJson = (valeur) => JSON.stringify(valeur, sansMoitieOrpheline).replace(/\\u0000/g, '');

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
// images, le dedoublonnage et la localisation.
// Les TYPES d'equipement en font partie : « complexe sportif » ne designe
// aucun equipement precis, et l'annuaire rend le premier venu (a Mazamet,
// interroge sur « complexe sportif », il rend celui de la Chevaliere).
const unaccentLower = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const GENERIC_PROJECT_WORDS = /^(projet|travaux|amenagement|renovation|construction|extension|rehabilitation|demolition|reconstruction|creation|requalification|vegetalisation|batiment|centre|espace|locaux|groupe|nouvelle|nouveau|commune|ville|complexe|sportif|sportive|gymnase|stade|equipement)$/;
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
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    /* Les accents ecrits en entites nommees se RECOMPOSENT : la lettre, puis le
       signe diacritique correspondant, et la normalisation Unicode en fait le
       caractere francais attendu. Ces entites etaient jusqu'ici remplacees par
       une espace, avec tout le reste : « T&eacute;l&eacute;charger » arrivait au
       modele sous la forme « T l charger », et une page entiere ecrite ainsi
       perdait ses accents en meme temps qu'elle gagnait des mots coupes en
       deux. */
    .replace(/&([a-zA-Z])(acute|grave|circ|uml|cedil|tilde|ring);/g,
      (_, lettre, signe) => `${lettre}${ACCENTS[signe]}`.normalize('NFC'))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&(?:quot|apos|#39);/gi, "'")
    .replace(/&[a-z]+\d*;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Signes diacritiques combinants, pour recomposer les entites nommees
const ACCENTS = {
  acute: '\u0301', grave: '\u0300', circ: '\u0302',
  uml: '\u0308', cedil: '\u0327', tilde: '\u0303', ring: '\u030A',
};

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

/* Les documents PDF d'une page, TOUS, avec leur intitule.
 *
 * Cette fonction ne juge rien : elle releve ce qui est la et le rend a l'appelant,
 * qui le soumet a la lecture de la page. C'est la seule maniere de trier des
 * documents : sur un site de mairie, « dossier », « projet », « reunion » ou
 * « orientation » designent le dossier d'inscription a la cantine, le projet
 * educatif, le compte rendu du conseil et le debat d'orientation budgetaire,
 * bien plus souvent qu'une operation d'amenagement. Un filtre de vocabulaire
 * retenait sept documents administratifs sur huit (mesure du 14/09/2026), et le
 * modele qui venait de lire la page, lui, ne les voyait jamais passer.
 *
 * Les seuls refus faits ici sont structurels : ce n'est pas une adresse, ce
 * n'est pas du web, ou c'est deja releve.
 */
function collectPdfLinks(html, baseUrl, max = PDF_PAR_PAGE_MAX) {
  /* Le lien d'abord, son intitule ensuite, et jamais l'inverse : un bouton de
     telechargement enveloppe souvent son libelle dans une icone, un cartouche
     et le poids du fichier. Exiger la balise fermante dans la meme expression
     faisait rater le lien entier des que l'habillage depassait la fenetre -
     zero document releve sur les pages de projets de Saint-Nazaire, qui en
     portent pourtant cinq a sept. */
  const re = /<a\b[^>]*href=["']([^"'\s]+\.pdf(?:\?[^"']*)?)["'][^>]*>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null && out.length < max) {
    try {
      const abs = new URL(m[1], baseUrl);
      if (!/^https?:$/.test(abs.protocol)) continue;
      const url = abs.toString();
      const suite = html.slice(re.lastIndex, re.lastIndex + 2000);
      const fin = suite.indexOf('</a>');
      /* Une balise coupee par la fenetre laisserait son code dans l'intitule :
         « <path d="M369.9 97.9 286 14C277… » pour une icone de telechargement,
         relevee telle quelle sur les pages de projets de Saint-Nazaire. */
      const dedans = (fin >= 0 ? suite.slice(0, fin) : suite).replace(/<[^>]*$/, ' ');
      const label = stripHtml(dedans).slice(0, 90);
      /* Le meme fichier est souvent lie deux fois : une fois par un titre vide
         qui ne porte que l'ancre, une fois par le bloc de telechargement qui
         porte le vrai intitule. On garde l'intitule renseigne. */
      const deja = out.find((p) => p.url === url);
      if (deja) {
        if (!deja.label && label) deja.label = label;
        continue;
      }
      out.push({ url, label });
    } catch { /* lien invalide */ }
  }
  return out;
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

/* Selection de `max` entrees de sitemap reparties entre rubriques : une
   rubrique est le chemin de l'adresse sans son dernier segment. Chaque tour
   prend l'entree la plus recente de chaque rubrique encore pourvue, les
   rubriques les plus fraiches d'abord. Sous le plafond, tout est garde. */
function repartirParRubrique(entrees, max) {
  const recentes = [...entrees].sort((a, b) => String(b.lastmod).localeCompare(String(a.lastmod)));
  if (recentes.length <= max) return recentes;
  const rubriques = new Map();
  for (const e of recentes) {
    let cle = '';
    try { cle = new URL(e.url).pathname.replace(/\/+$/, '').split('/').slice(0, -1).join('/'); } catch { /* adresse illisible */ }
    if (!rubriques.has(cle)) rubriques.set(cle, []);
    rubriques.get(cle).push(e);
  }
  const files = [...rubriques.values()];
  const out = [];
  for (let tour = 0; out.length < max; tour++) {
    let pris = false;
    for (const f of files) {
      if (tour < f.length) { out.push(f[tour]); pris = true; if (out.length >= max) break; }
    }
    if (!pris) break;
  }
  return out;
}

// Intitule lisible tire du dernier segment d'une adresse : le slug d'un CMS est
// une phrase (« les-pistes-de-padel-debarquent-en-ville »), pas un identifiant.
/* Un dernier segment fait seulement de chiffres est l'identifiant de la fiche,
   pas son nom : sur ville-noyal-chatillon.fr, chaque actualite finit par
   /12183/, et le tri des intitules recevait « 12183 » pour toute la rubrique.
   Le nom est alors le segment d'avant. */
function libelleDuChemin(u) {
  try {
    const segs = new URL(u).pathname.split('/').filter(Boolean);
    while (segs.length > 1 && /^\d+$/.test(segs[segs.length - 1])) segs.pop();
    const seg = segs.pop() || '';
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

/* Valeur d'un attribut HTML, entre guillemets doubles, simples, ou SANS
   guillemets : les sites minifiés les retirent (« <a class=logo> »,
   « <img src=/assets/logo.svg> », relevé sur Rennes), et une lecture limitée
   aux valeurs entre guillemets ne voyait ni la classe ni l'adresse. */
function attributHtml(tag, nom) {
  const m = new RegExp(`(?:^|\\s)${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

/* Une couleur ne devient celle de l'espace que si elle peut porter des boutons
   et des titres sur fond clair. Le controle ne rejetait que le blanc et le noir
   exacts : la meta theme-color de Vénissieux, « #D5E0EB », un bleu-gris de fond
   d'ecran, prenait ainsi la place du rouge de son logo. Une teinte trop claire,
   trop sombre ou trop peu saturee est ecartee, et c'est alors la couleur lue
   par le juge visuel sur le logo qui sert. Rend la couleur normalisee en
   #rrggbb, ou null. */
function couleurUtilisable(brute) {
  let hex = String(brute || '').trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) hex = `#${hex.slice(1).split('').map((c) => c + c).join('')}`;
  hex = hex.slice(0, 7);
  if (!/^#[0-9a-f]{6}$/.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [haut, bas] = [Math.max(r, g, b), Math.min(r, g, b)];
  // Clarte au sens HSL : un ambre franc (#F59E0B) reste admis, un bleu-gris de
  // fond d'ecran (#D5E0EB) ou un jaune pale sont ecartes
  const clarte = (haut + bas) / 2;
  if (clarte > 0.78 || clarte < 0.08) return null;
  if (haut - bas < 0.15) return null;
  return hex;
}

function findSiteLogo(html, baseUrl) {
  /* La fenetre de lecture commence au CORPS de la page, pas a son premier
     caractere. Un site qui ecrit ses feuilles de style dans l'en-tete
     (releve sur Vénissieux : 110 Ko avant le <body>) repoussait son logo hors
     des 60 Ko lus, et la recherche ne rendait rien : l'espace recevait alors
     l'icone de repli, en l'occurrence l'image generique d'un module
     WordPress. La position, qui sert au classement, se compte du meme point. */
  const debut = Math.max(0, html.search(/<body\b/i));
  const zone = html.slice(debut, debut + 60000);
  const hits = [];
  for (const tag of zone.match(/<img[^>]+>/gi) || []) {
    // La position prime : le logo d'identite est dans l'en-tete, les logos de
    // labels et de partenaires arrivent plus bas dans la page.
    const at = zone.indexOf(tag);
    const alt = attributHtml(tag, 'alt');
    const cls = attributHtml(tag, 'class');
    // srcset : on prend la plus grande definition proposee
    const srcset = attributHtml(tag, 'srcset');
    const fromSet = srcset
      ? srcset.split(',').map((s) => s.trim().split(/\s+/)).sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0]?.[0]
      : null;
    const src = fromSet || attributHtml(tag, 'data-src') || attributHtml(tag, 'src');
    if (!src || /^data:/i.test(src)) continue;
    /* Le mot « logo » est souvent porté par le lien ou le bloc qui ENTOURE
       l'image (« <a class="logo"><img src="marque.png"> »), pas par l'image
       elle-même : relevé sur Rennes, dont l'image ne dit que le nom de la
       ville. On lit donc aussi la balise ouvrante qui précède immédiatement. */
    const avant = zone.slice(Math.max(0, at - 400), at);
    const parent = /<(?:a|div|span|picture|figure)\b[^>]*(?:class|id|aria-label|title)\s*=\s*(?:["'][^"']*(?:logo|blason|armoirie)[^"']*["']|[^\s>"']*(?:logo|blason|armoirie)[^\s>"']*)[^>]*>\s*(?:<(?:source|span|div|picture)\b[^>]*>\s*)*$/i.test(avant) ? ' logo' : '';
    const hay = `${src} ${alt} ${cls}${parent}`;
    if (!/logo|blason|armoirie/i.test(hay)) continue;

    const w = parseInt(attributHtml(tag, 'width') || '0', 10);
    const h = parseInt(attributHtml(tag, 'height') || '0', 10);
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

async function inspectMairieSite(siteUrl, communeNom, echeance = Infinity) {
  const out = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [], images: [], candidates: [], accueilTexte: '', bloque: false, tronque: false, octets: 0 };
  const home = await fetchCapped(siteUrl, { headers: UA }, FETCH_TIMEOUT_MS, ACCUEIL_MAX_BYTES);
  /* Un accueil qui ne repond pas etait rendu comme un site vide : aucune
     candidate, aucun message, et la carte sortait avec ce que la presse avait
     donne. C'est ce qu'a vecu Noyal-Chatillon-sur-Seiche le 10/11/2026 : la
     relance n'a pas pu lire le site et a publie une carte d'un seul projet sans
     le signaler. Le site injoignable est desormais signale comme un site
     bloque, et compte comme tel dans le journal. */
  if (!home) {
    try { out.host = new URL(siteUrl).host; } catch { /* adresse illisible */ }
    out.bloque = true;
    out.injoignable = true;
    console.warn(`[demo-generate] ${out.host} : le site de la commune ne repond pas, site ignore`);
    return out;
  }
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
  /* Aucun document releve ici : l'accueil est visite AVANT que la lecture des
     pages ne commence, donc personne ne pourrait juger de leur pertinence. Ils
     reviendront d'eux-memes avec la page qui les presente, jugee par la
     lecture, et un accueil de mairie ne publie de toute facon pas un dossier de
     concertation sans page dediee derriere. */
  collectImages(html, home.url, out.images);

  const color = /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,8})["']/.exec(html)
    || /<meta[^>]+content=["'](#[0-9a-fA-F]{3,8})["'][^>]+name=["']theme-color["']/.exec(html);
  if (color) out.themeColor = couleurUtilisable(color[1]);

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
  /* L'icône du site est tenue À PART : c'est le dernier recours de
     l'installation quand aucun logo n'a pu être téléchargé, jamais un
     candidat. Mêlée aux candidats, elle était la seule image que le juge
     visuel savait regarder quand le vrai logo est un .svg (le cas le plus
     fréquent sur les sites de mairie) : il la désignait, elle passait en tête,
     et le logo trouvé n'était jamais essayé. Relevé en base : 53 espaces sur
     78 portaient l'icône de l'onglet à la place du logo. */
  out.logoCandidats = logoCandidats.filter((u) => u !== icone);
  out.iconeUrl = icone;
  /* Les icones declarees passent AUSSI devant le juge visuel, apres les
     candidats logo. Installee sans jamais avoir ete regardee, l'icone la plus
     grande etait sur Vénissieux l'image generique d'un module WordPress
     (« DEFAULT APP », 512 px, la plus grande de toutes), alors que le vrai
     monogramme de la commune, declare en 192 px, attendait juste a cote. */
  out.iconeCandidats = [];
  for (const c of iconCandidates) {
    try {
      const abs = new URL(c.href, finalUrl).toString();
      if (!out.iconeCandidats.includes(abs)) out.iconeCandidats.push(abs);
    } catch { /* url invalide */ }
    if (out.iconeCandidats.length >= 3) break;
  }
  out.logoUrl = out.logoCandidats[0] || icone;
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
    /* Au-dela du plafond, on ne garde plus simplement les plus recentes :
       un site regenere son annuaire chaque nuit, et ses fiches occupaient
       alors tout le plafond. Mesure sur saintgenislaval.fr : 2 235 adresses,
       les 400 plus recentes etaient l'annuaire des entreprises et des
       associations (toutes datees du jour), et aucune des six pages de la
       rubrique « projets en cours » n'etait ouverte. Les places sont donc
       reparties entre RUBRIQUES (le dossier de l'adresse), a tour de role, la
       plus recente d'abord dans chaque rubrique. C'est structurel : aucun mot
       n'y est juge, une petite rubrique passe simplement avant la centieme
       fiche d'une grande. */
    links.push(...repartirParRubrique(duSitemap, SITEMAP_URLS_MAX)
      .map((e) => ({ url: e.url, label: libelleDuChemin(e.url) })));
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
    /* Les interventions de concessionnaire ne sont plus ecartees ici par une
       liste de marques : le depouillement des avis et le rapprochement les
       jugent sur le fond. La liste se trompait dans les deux sens (une
       mediatheque d'Orange ecartee, une conduite d'eau potable gardee). */
    let deduped = [...best.values()]
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
    : cadre === 'document'
      ? `Tu dépouilles un document PDF publié par la commune de ${communeNom} (procès-verbal du conseil municipal, bulletin municipal, dossier de projet...) pour y trouver les projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES qui concernent cette commune. Une délibération qui approuve des travaux, leur plan de financement ou une demande de subvention pour une opération précise décrit un projet. Ne retiens QUE ce qui se construit, se rénove ou s'aménage à un endroit que le document nomme (une rue, un bâtiment, un lieu-dit, un quartier) : un acte purement juridique ou financier n'est pas un projet, même s'il porte sur un terrain. Une acquisition ou une cession de parcelle, un avenant à un contrat ou à une concession, une convention, une servitude, un périmètre de protection, une garantie d'emprunt, un tarif, une décision de personnel ou une subvention à une association ne se retiennent pas.`
      : `Tu dépouilles UNE page du site officiel de ${communeNom} pour y trouver les projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES qui concernent cette commune.`;
  return `${entete}

Retiens un projet UNIQUEMENT si cette page le décrit vraiment, et si tu peux en recopier une phrase mot pour mot. Une simple mention en passant, un lien de menu ou un titre de rubrique ne sont pas une description : dans ce cas, rends une liste vide, ce qui est le cas le plus fréquent et ne pose aucun problème.

Un projet est une OPÉRATION : une construction, une rénovation, une extension, une requalification, annoncée, en cours ou récemment livrée. La page de présentation d'un équipement qui existe déjà - ses horaires, ses tarifs, sa réservation, son fonctionnement - n'est PAS un projet, même si l'équipement est photogénique.

Écarte ce qui n'est pas un aménagement du territoire : raccordement d'un concessionnaire de réseau (électricité, gaz, fibre), entretien courant, contrat de service, achat de matériel, événement, élection, fait divers. Écarte aussi les projets situés dans une AUTRE commune.

Si la page est une TRIBUNE ou l'expression d'un groupe politique, ne retiens RIEN : ce qu'un groupe réclame ou conteste n'est pas une opération attestée par la commune.

Une page peut décrire plusieurs opérations distinctes : un parking, une résidence, un équipement et une voie réaménagée sont des projets différents, même dans le même quartier.

Pour les LIENS : indique ceux qui mènent vraisemblablement à la description d'une opération, en jugeant sur leur intitulé. Ce sont eux qui guideront la suite de l'exploration, alors ne retiens ni les menus, ni les démarches administratives, ni les pages d'élus ou d'instances.

Pour les DOCUMENTS : la page porte parfois des fichiers PDF, donnés avec leur intitulé et leur nom de fichier. Retiens uniquement ceux qui constituent le dossier d'une opération que TU VIENS DE RETENIR sur cette page : dossier de concertation, notice d'enquête publique, plan-guide, planning de travaux, délibération qui porte sur l'opération. Si tu n'as retenu aucun projet, ne retiens aucun document. Un site de mairie publie surtout des documents de la vie courante - dossier d'inscription, formulaire de subvention, compte rendu de conseil, débat d'orientation budgétaire, bulletin municipal, règlement, tarifs, menus - et aucun d'eux n'est le dossier d'une opération : dans le doute, ne retiens rien.`;
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
   rien a voir avec l'amenagement du territoire.

   Les ACTUALITES se jugent desormais sur leur intitule comme le reste. Les
   proteger toutes faisait ouvrir l'agenda entier : mesure le 10/11/2026 sur
   saintgenislaval.fr, 75 actualites lues (« samedi yoga », « concours de
   petanque », « octobre rose »...) pour une seule operation de reference, la
   chapelle de Beaunant, dont l'intitule annonce les travaux. Rejoue sur les
   candidates reelles des quatre communes du banc, le nouveau tri ecarte 290
   des 523 pages que l'ancien faisait lire, dont 273 n'avaient rien donne, et
   chaque projet de reference garde au moins une page qui le decrit. Une
   version plus severe (qui ecartait aussi la presentation des services)
   perdait le reamenagement du centre de Saint-Genis-Laval, decrit sur la seule
   page « vehicule et stationnement » : elle n'a pas ete gardee. Le numero du
   magazine municipal reste un sommaire : sur vienne.fr, l'article sur
   l'ecole Jean Moulin n'est atteint que depuis la page du numero 196. La
   page du budget aussi : celle de ville-noyal-chatillon.fr est la seule a
   decrire les travaux de l'ecole du Chat Perche, celle de vienne.fr en
   decrit six dont l'avenue du General Leclerc.

   Le tri rend aussi les intitules qui annoncent A EUX SEULS une operation : ils
   passent en tete de la file. Sur ce meme rejeu, 97 de ces 120 pages ont donne
   un projet, contre 27 des 113 autres pages gardees. */
const TRI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ecarter: {
      type: 'array',
      description: "Index des pages dont l'intitulé montre qu'elles ne décriront jamais une opération d'aménagement.",
      items: { type: 'integer' },
    },
    operations: {
      type: 'array',
      description: "Index des pages gardées dont l'intitulé annonce à lui seul une opération précise, ou qui recensent les projets ou les travaux de la commune.",
      items: { type: 'integer' },
    },
  },
  required: ['ecarter', 'operations'],
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

/* `hierarchique` : la nature du site, deja etablie sur la liste complete des
   candidates. Les liens decouverts en cours de lecture arrivent par petits
   paquets, ou quelques pages racines ne disent rien de la structure du site :
   sur vienne.fr, les actualites vivent a la racine, et un paquet de dix
   d'entre elles aurait passe pour dix carrefours a proteger. Avec ce
   parametre, un petit paquet est trie lui aussi. */
async function ecarterLesHorsSujet(communeNom, liens, { hierarchique } = {}) {
  if (!liens.length) return liens;
  if (hierarchique === undefined && liens.length <= TRI_LOT_MAX / 4) return liens;
  /* La protection des carrefours ne vaut que sur un site HIERARCHIQUE, ou les
     pages racines sont une poignee de rubriques qui ouvrent le reste. Mesure
     sur mairie-vannes.fr : toutes les pages y sont a la racine, et proteger
     « la racine » revenait a exempter le site entier du tri - 7 adresses
     ecartees sur 280, puis 267 lectures dont une bonne moitie pour rien. */
  const racines = liens.filter((l) => estUnCarrefour(l.url));
  const siteHierarchique = hierarchique ?? racines.length <= CARREFOURS_MAX;
  const carrefours = siteHierarchique ? racines : [];
  const aTrier = siteHierarchique ? liens.filter((l) => !estUnCarrefour(l.url)) : liens;
  const lots = [];
  for (let i = 0; i < aTrier.length; i += TRI_LOT_MAX) lots.push(aTrier.slice(i, i + TRI_LOT_MAX));

  const system = `Tu prepares le recensement des operations d'amenagement de la commune de ${communeNom} a partir de son site officiel : constructions, renovations, extensions, requalifications de voies ou de places, equipements publics, quartiers en projet. Chaque page que tu ne rejettes pas sera ouverte et lue, et chaque lecture se paie en temps et en argent. Tu rends deux listes.

ECARTER : les pages dont l'intitule montre qu'elles ne decriront jamais une telle operation. Demarches administratives, etat civil, inscriptions scolaires, menus de cantine, agenda culturel, vie associative, sport et loisirs, annuaire, contacts, recrutement, mentions legales, elus et instances (adjoints, commissions, groupes politiques, organigramme), pages de compte ou de connexion, articles de vie quotidienne sans rapport avec un chantier.

N'ecarte PAS les pages qui publient les proces-verbaux ou comptes rendus du conseil municipal, le bulletin municipal ou les deliberations : leurs documents seront lus, et dans une petite commune ce sont souvent les seuls a decrire les projets.

Une ACTUALITE se juge sur son intitule, comme les autres pages. Ecarte celle qui annonce un evenement ou une animation (concert, spectacle, exposition, atelier, fete, foire, braderie, vide-grenier, sortie, seance sportive, concours), une ceremonie ou une commemoration, une collecte, une campagne de prevention ou de sante, une alerte meteo, une permanence, un appel a candidatures, une election, un portrait, une information pratique sans rapport avec un chantier. Garde celle dont l'intitule parle ou peut parler d'un chantier, de travaux, d'une voie, d'un batiment, d'un equipement, d'un parc, d'un quartier, d'un projet, d'une inauguration, d'une pose de premiere pierre, d'une reunion publique ou d'une concertation, et garde aussi celle dont l'intitule est trop vague pour savoir.

N'ecarte jamais un sommaire (un numero du magazine ou du bulletin municipal en est un : il renvoie vers ses articles), une rubrique de travaux, d'urbanisme, de cadre de vie ou de projets, ni une page de budget ou de finances de la commune (elle detaille souvent les investissements de l'annee), ni une RUBRIQUE au chemin court et a l'intitule general (« mairie », « ma ville », « vivre ici ») : ce sont des carrefours qui menent ailleurs. Le patrimoine bati fait partie de l'amenagement des qu'il est question de le restaurer : n'ecarte une page de patrimoine que si elle raconte l'histoire ou la legende d'un lieu. Dans le doute, garde : une page ecartee a tort fait disparaitre un projet de la carte.

OPERATIONS : parmi les pages que tu gardes, celles dont l'intitule annonce a lui seul une operation precise (un chantier, des travaux sur un lieu nomme, la construction, la renovation ou l'amenagement de quelque chose, un projet nomme, l'inauguration d'un equipement) ou une rubrique qui recense les projets ou les travaux de la commune. Elles seront lues en premier. Une page au titre vague n'y va pas, elle reste simplement gardee.`;

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
      const valides = (liste) => new Set((liste || []).filter((i) => Number.isInteger(i) && i >= 0 && i < lot.length));
      const ecartes = valides(out.ecarter);
      const operations = valides(out.operations);
      if (process.env.DEMO_DUMP) {
        // Ce que le tri refuse d'ouvrir. Sans cette trace, on ne peut ni
        // verifier qu'il ecarte bien, ni voir ce qu'il jette a tort.
        for (const i of ecartes) console.log(`[demo-tri] ECARTE : ${lot[i].label} (${lot[i].url.replace(/^https?:\/\/[^/]+/, '')})`);
      }
      /* Une page a la fois ecartee et designee comme operation est gardee : le
         doute profite a la lecture, comme partout dans ce tri. */
      return lot.filter((_, i) => !ecartes.has(i) || operations.has(i))
        .map((l) => (operations.has(lot.indexOf(l)) ? { ...l, operation: true } : l));
    } catch (e) {
      // Sans tri, on ouvre tout : c'est plus cher, jamais moins bon.
      console.warn(`[demo-generate] tri des liens indisponible, tout est ouvert :: ${e?.message}`);
      return lot;
    }
  });
  const gardees = [...carrefours, ...parLot.flat()];
  gardees.siteHierarchique = siteHierarchique;
  return gardees;
}

/* Extrait de page centre sur une citation. Sans citation retrouvee, le debut
   de la page fait l'affaire : c'est la ou un CMS place le chapeau. */
function extraitAutourDe(texte, citation) {
  const t = String(texte || '');
  const at = citation ? t.indexOf(String(citation).slice(0, 40)) : -1;
  const from = at > 0 ? Math.max(0, at - 600) : 0;
  return t.slice(from, from + SOURCE_EXCERPT_CHARS).trim();
}

/* Nom du fichier d'une adresse. Un lien de telechargement s'intitule souvent
   « Telecharger » ou « PDF », et c'est alors le nom du fichier qui porte le
   sens : sans lui, le jugement se ferait sur un mot vide. */
function nomDeFichier(u) {
  try {
    const chemin = decodeURIComponent(new URL(u).pathname);
    return chemin.slice(chemin.lastIndexOf('/') + 1);
  } catch { return ''; }
}

const DOCS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lire: { type: 'array', maxItems: PDF_LUS_MAX, items: { type: 'integer' }, description: 'Index des documents à lire, du plus utile au moins utile.' },
  },
  required: ['lire'],
};

/* Parmi tous les PDF croises sur le site, lesquels lire pour connaitre les
   projets de la commune ? Jugement confie au grand modele : c'est un tri sur
   des intitules et des noms de fichiers dates, une seule fois par generation. */
async function choisirLesDocumentsALire(commune, docs, dejaTrouves = []) {
  if (!docs.length) return [];
  try {
    const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const system = `Nous sommes le ${aujourdhui}. Voici les documents PDF publiés sur le site officiel de ${commune.nom}, chacun avec son intitulé, son nom de fichier et la page qui le présente. On va lire en entier ceux que tu désignes pour y trouver les projets d'aménagement, de travaux ou d'équipement de la commune.

Désigne les documents qui racontent ce que la commune décide et construit EN CE MOMENT : procès-verbaux et comptes rendus du conseil municipal, bulletins et magazines municipaux, dossiers de présentation, de concertation ou d'enquête publique d'un projet. Ne retiens que les plus récents, datés des deux dernières années d'après leur intitulé ou leur nom de fichier, les plus récents d'abord, ${PDF_LUS_MAX} au plus.

Tu reçois aussi la liste des projets que les pages du site ont déjà permis de repérer. Si elle est courte, les procès-verbaux du conseil sont souvent la seule source : désigne-les largement. Si elle est déjà longue, ne désigne que les documents qui apporteront des opérations absentes de cette liste ou le dossier complet d'une opération qui y figure (bulletin municipal récent, dossier de création ou de concertation, étude) : une décision ou une délibération isolée, une liste de délibérations, un procès-verbal de plus n'apprendront rien, ne les désigne pas.

Ne désigne jamais un règlement, un formulaire, un document d'urbanisme réglementaire (PLU, zonage, servitudes, annexes sanitaires), un arrêté de circulation, un tarif, un menu, un document budgétaire sans description de projets. Si rien ne convient, rends une liste vide.`;
    const user = `PROJETS DÉJÀ REPÉRÉS SUR LE SITE (${dejaTrouves.length}) :
${dejaTrouves.slice(0, 120).map((t) => `- ${t}`).join('\n') || '(aucun)'}

DOCUMENTS :
${docs.map((d, i) => `${i}. ${d.label || '(sans intitulé)'} [fichier : ${nomDeFichier(d.url)}] (page : ${d.page || '?'})`).join('\n')}`;
    const out = await openAIStructured([{ role: 'system', content: system }, { role: 'user', content: user }],
      'documents_a_lire', DOCS_SCHEMA, 400, 40000, 0.1);
    return [...new Set(out.lire || [])].filter((i) => Number.isInteger(i) && i >= 0 && i < docs.length).slice(0, PDF_LUS_MAX).map((i) => docs[i]);
  } catch (e) {
    console.warn(`[demo-generate] choix des documents indisponible :: ${e?.message}`);
    return [];
  }
}

/* Texte d'un PDF, ou null s'il est illisible (scan sans texte, fichier trop
   lourd, extraction indisponible). La bibliotheque n'est chargee qu'au premier
   document : une generation sans PDF a lire n'en paie pas le cout. */
async function texteDuPdf(url) {
  const r = await fetchCapped(url, { headers: UA }, 20000, PDF_OCTETS_MAX, true);
  if (!r?.data || r.data.byteLength >= PDF_OCTETS_MAX) return null;
  const octets = new Uint8Array(r.data);
  if (String.fromCharCode(...octets.slice(0, 5)) !== '%PDF-') return null;
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(octets);
    const { text } = await extractText(pdf, { mergePages: true });
    const propre = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return propre.length >= GABARIT_RESTE_MIN ? propre : null;
  } catch (e) {
    console.warn(`[demo-generate] PDF illisible : ${url} :: ${e?.message}`);
    return null;
  }
}

/* Lecture d'un PDF par tranches de la taille d'une page : chaque tranche passe
   par la meme lecture qu'une page du site, et les projets s'additionnent. Le
   document devient le dossier des projets qu'il decrit. */
async function lirePdf(commune, candidate) {
  const texte = await texteDuPdf(candidate.url);
  if (!texte) return null;
  const titre = candidate.label || nomDeFichier(candidate.url);
  const tranches = [];
  for (let i = 0; i < texte.length && tranches.length < PDF_TRANCHES_MAX; i += PAGE_TEXTE_LU_MAX) {
    tranches.push(texte.slice(i, i + PAGE_TEXTE_LU_MAX));
  }
  const lus = await Promise.all(tranches.map((t, k) => lirePage(commune, {
    url: candidate.url,
    title: tranches.length > 1 ? `${titre} (partie ${k + 1} sur ${tranches.length})` : titre,
    text: t,
  }, [], 'document').catch(() => ({ projets: [], suivants: [], dossiers: [], interet: 'nulle' }))));
  const projets = lus.flatMap((l) => l.projets);
  // L'extrait a ete pris dans la tranche : on le recentre sur le texte entier
  for (const p of projets) p.page_excerpt = extraitAutourDe(texte, p.evidence_quote);
  return {
    projets,
    suivants: [],
    dossiers: projets.length ? [{ url: candidate.url, label: titre, page: candidate.url }] : [],
    interet: lus.some((l) => l.interet === 'forte') ? 'forte' : lus.some((l) => l.interet === 'moyenne') ? 'moyenne' : 'nulle',
    texte,
  };
}

async function lirePage(commune, page, liens, cadre = 'mairie', documents = []) {
  const listeLiens = liens.slice(0, PAGE_LIENS_SOUMIS);
  const listeDocs = documents.slice(0, PDF_PAR_PAGE_MAX);
  const user = `PAGE : ${page.title || '(sans titre)'}
ADRESSE : ${page.url}

TEXTE DE LA PAGE :
${page.text.slice(0, PAGE_TEXTE_LU_MAX)}

LIENS DE CETTE PAGE :
${listeLiens.length ? listeLiens.map((l, i) => `${i}. ${l.label}`).join('\n') : '(aucun)'}

DOCUMENTS PDF DE CETTE PAGE :
${listeDocs.length ? listeDocs.map((d, i) => `${i}. ${d.label || '(lien sans intitulé)'} [fichier : ${nomDeFichier(d.url)}]`).join('\n') : '(aucun)'}`;

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
  /* Les documents retenus portent l'adresse de LEUR page : c'est ce
     rattachement qui permet, a la redaction, de ne proposer a un projet que les
     dossiers trouves la ou il est decrit, au lieu du tas de tout le site.

     Une page qui ne decrit AUCUNE operation n'a donc aucun dossier a rendre :
     son document ne pourrait etre rattache a rien, et il ne ferait que defiler
     a l'ecran comme une trouvaille. Mesure sur la page « rapports et plans » de
     Saint-Nazaire, ou trois plans de prevention du bruit etaient retenus sans
     qu'aucun projet n'y soit decrit. */
  const dossiers = !projets.length ? [] : [...new Set(out.documents || [])]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < listeDocs.length)
    .map((i) => ({ url: listeDocs[i].url, label: listeDocs[i].label || nomDeFichier(listeDocs[i].url), page: page.url }));
  return { projets, suivants, dossiers, interet: out.interet || 'moyenne' };
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


/* ─── RÉDACTION D'UN ARTICLE, EN DEUX TEMPS ───

   Un article par projet, écrit en deux appels : d'abord les faits, ensuite la
   prose.

   Pourquoi. Le rédacteur recevait le titre, la description, un extrait de 1 800
   signes et une recherche web restreinte aux domaines du projet, et devait
   rendre 300 à 500 mots. Mesure du banc d'essai du 10/11/2026 (quatre
   communes, juges stricts) : la recherche n'était presque jamais lancée (2
   recherches pour 73 articles), l'extrait était souvent du menu de site (cours
   Brillier à Vienne : 1 800 signes de navigation de l'agglomération), et le
   modèle remplissait la longueur demandée avec ce qu'il imaginait : « pont
   coupé à toute circulation » alors qu'une seconde page dit que la passerelle
   reste ouverte, « le montant n'est pas précisé » alors que le PDF de la page le
   donne, « les riverains constateront un changement ».

   1. Le code lit lui-même TOUTES les sources du projet (pages citées et PDF de
      ces pages), avec leur date de publication.
   2. Un petit modèle en tire la liste exhaustive des faits utiles, rangés par
      rubrique, chacun avec la citation qui le porte. Le code retrouve chaque
      citation dans le texte de sa source et jette le fait dont la citation est
      introuvable.
   3. Le rédacteur n'a que ces faits, sans recherche : il les relie et les met
      en français. La longueur suit la matière.

   La relecture des chiffres après coup (une phrase retirée par chiffre non
   attesté, plus un appel de vérification) est supprimée : elle ne voyait que
   les chiffres, et elle vidait des articles justes. */
/* Un article suit maintenant sa matière : à 1 600 jetons, ceux du Vallon de
   Saint-Genis-Laval (180 faits) et de la Vallée de Gère à Vienne étaient
   coupés, et la fiche restait sans article. */
const ARTICLE_MAX_TOKENS = 4000;
const ARTICLE_TIMEOUT_MS = 60000;
/* Le modèle de la recherche de presse, seul appel qui garde l'outil de
   recherche web : la rédaction n'en a plus. Mesure du 10/11/2026 sur les
   quatre communes du banc, étage presse rejoué en entier (recherche puis
   lecture des articles) : gpt-4.1-mini rapporte autant d'opérations qui
   nomment la commune que gpt-4.1 dans fin1 (2, 2, 2 et 3), dont le Vallon des
   Hôpitaux à Saint-Genis-Laval et la ZAC centre-ville de Noyal ; la recherche
   prend 4 à 5 s et lit 8 000 jetons de résultats au lieu de 17 500, au
   cinquième du prix. Une recherche web ne rend jamais deux fois les mêmes
   articles : la comparaison porte sur un tirage de chaque modèle. */
const ARTICLE_MODEL = process.env.DEMO_ARTICLE_MODEL || 'gpt-4.1-mini';
const ARTICLE_OUTIL = process.env.DEMO_ARTICLE_TOOL || 'web_search';
/* Texte et citations d'une réponse de l'API Responses, pour la recherche de
   presse. Les annotations sont la SEULE source d'adresses réelles : invité à
   remplir lui-même un champ d'URL, le modèle y écrit un jeton interne. */
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
const REDACTION_MODEL = process.env.DEMO_REDACTION_MODEL || 'gpt-4.1-mini';
/* L'extracteur. Mesure du 10/11/2026 sur le cours Brillier à Vienne (sept
   pages) : gpt-4o-mini relève 8 faits et oublie les quatre financeurs,
   gpt-4.1-mini en relève 22, dont les 32 000 € du Département pour le vélo et
   les 171 167 € pour la chaussée, pour 0,008 $ au lieu de 0,003 $. */
const FAITS_MODEL = process.env.DEMO_FAITS_MODEL || 'gpt-4.1-mini';
/* Un grand projet donne plus de cent faits : à 4 000 jetons, l'extraction du
   Vallon de Saint-Genis-Laval était coupée et la fiche restait sans article. */
const FAITS_MAX_TOKENS = 10000;
const FAITS_TIMEOUT_MS = 90000;
const FAITS_LOT_CHARS = 25000;
// Bornes de lecture d'un projet : de quoi tenir dans un appel du petit modèle
const SOURCES_LUES_MAX = 8;
const PDF_PAR_PROJET_MAX = 6;
const CORPUS_CHARS = 90000;
const SOURCE_PAGE_OCTETS = 800000;
const SOURCE_PDF_OCTETS = 15000000;
const RUBRIQUES = ['programme', 'calendrier', 'acteurs', 'etat', 'effets'];

/* Forme de comparaison d'une citation : lettres et chiffres seulement, sans
   accents ni ponctuation. Le modèle recopie fidèlement les mots mais change
   volontiers une apostrophe, un guillemet ou une espace insécable ; ces
   écarts-là ne changent pas ce que dit le passage. */
const pourCitation = (t) => unaccentLower(String(t || '')).replace(/[^a-z0-9]+/g, ' ').trim();

/* La citation se trouve-t-elle dans la source ? Une coupure marquée par des
   points de suspension est admise, chaque morceau devant figurer dans la
   source : c'est ainsi qu'un modèle rassemble deux phrases d'une même page qui
   portent ensemble un fait (sur le cours Brillier, le pilotage et les « 18 mois
   de travaux » sont dits dans deux phrases, dans l'ordre inverse). */
function citationRetrouvee(citation, sourceNormalisee) {
  const morceaux = String(citation || '').split(/\.{3}|…|\[\s*\.\.\.\s*\]/).map(pourCitation).filter(Boolean);
  return morceaux.length > 0 && morceaux.every((m) => sourceNormalisee.includes(m));
}

// Date de publication déclarée par la page (Open Graph, schema.org, <time>)
function dateDePublication(html) {
  const m = /property=["']article:published_time["'][^>]*content=["']([^"']+)/i.exec(html)
    || /content=["']([^"']+)["'][^>]*property=["']article:published_time/i.exec(html)
    || /"datePublished"\s*:\s*"([^"]+)"/i.exec(html)
    || /<time[^>]+datetime=["']([^"']+)/i.exec(html);
  const d = m ? new Date(m[1]) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

/* Date de dernière mise à jour déclarée par la page. Une page de rubrique
   (« Finances et marchés », « Travaux en cours ») est publiée une fois et
   complétée pendant des années : sa date de publication seule la ferait passer
   pour ancienne (Noyal, publiée en 2022, mise à jour en septembre 2026). */
function dateDeMiseAJour(html) {
  const m = /property=["']article:modified_time["'][^>]*content=["']([^"']+)/i.exec(html)
    || /content=["']([^"']+)["'][^>]*property=["']article:modified_time/i.exec(html)
    || /"dateModified"\s*:\s*"([^"]+)"/i.exec(html);
  const d = m ? new Date(m[1]) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

// Titre de la page : le <h1> d'abord, qui nomme l'article et non le site
function titreDeLaPage(html) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const og = /property=["']og:title["'][^>]*content=["']([^"']+)/i.exec(html);
  const titre = h1 ? stripHtml(h1[1]) : og ? stripHtml(og[1]) : '';
  return titre.slice(0, 140);
}

/* Texte d'un PDF, avec sa date de création. Rendu vide pour un document
   scanné, qui n'a pas de couche texte. */
async function lirePdfSource(url) {
  const r = await fetchCapped(url, { headers: UA }, 20000, SOURCE_PDF_OCTETS, true);
  if (!r?.data || r.data.byteLength >= SOURCE_PDF_OCTETS) return null;
  /* Un PDF lu à moitié (serveur lent, lecture coupée à l'échéance) n'est pas
     un PDF : sa lecture échoue dans pdf.js par un rejet que rien ne rattrape,
     et qui faisait tomber tout le processus (mesure sur le Vallon de
     Saint-Genis-Laval, quatre PDF de 2 à 4 Mo lus ensemble). */
  const annonce = Number(r.headers?.get?.('content-length'));
  if (annonce && r.data.byteLength < annonce) return null;
  const octets = new Uint8Array(r.data);
  if (String.fromCharCode(...octets.slice(0, 5)) !== '%PDF-') return null;
  return lireLeTexteDuPdf(url, octets);
}

/* pdf.js est chargé une fois, et les PDF sont lus l'un après l'autre. Lancées
   ensemble, les premières lectures chargeaient chacune pdf.js, et l'une
   d'elles finissait par un rejet que rien ne rattrapait (« Invalid PDF
   structure »), ce qui faisait tomber tout le processus : mesure sur le Vallon
   de Saint-Genis-Laval, six PDF de 2 à 4 Mo. En série, la mémoire reste aussi
   bornée à un document à la fois. */
let _pdfjs = null;
let _filePdf = Promise.resolve();
function lireLeTexteDuPdf(url, octets) {
  const lecture = _filePdf.then(async () => {
    try {
      _pdfjs ||= import('unpdf').then(async (m) => { await m.getResolvedPDFJS(); return m; });
      const { extractText, getDocumentProxy } = await _pdfjs;
      const pdf = await getDocumentProxy(octets);
      const { text } = await extractText(pdf, { mergePages: true });
      let publiee = '';
      try {
        const meta = await pdf.getMetadata();
        const c = /^D:(\d{4})(\d{2})(\d{2})/.exec(meta?.info?.CreationDate || '');
        if (c) publiee = `${c[1]}-${c[2]}-${c[3]}`;
      } catch { /* pas de métadonnées */ }
      try { await pdf.destroy(); } catch { /* déjà libéré */ }
      const texte = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      return texte ? { texte, publiee, titre: '', pdfs: [] } : null;
    } catch (e) {
      console.warn(`[demo-generate] PDF illisible : ${url} :: ${e?.message}`);
      return null;
    }
  });
  _filePdf = lecture;
  return lecture;
}

/* Une page source : son contenu principal, sa date, son titre et les PDF
   qu'elle lie. Le contenu principal est la balise <main> quand le site en pose
   une : sur Noyal, 773 signes d'article au lieu de 6 000 de menus, et les PDF
   des encadrés voisins ne sont plus pris pour ceux du projet. */
async function lirePageSource(url) {
  const r = await fetchCapped(url, { headers: UA }, 8000, SOURCE_PAGE_OCTETS, true);
  if (!r?.data) return null;
  const octets = new Uint8Array(r.data);
  if (String.fromCharCode(...octets.slice(0, 5)) === '%PDF-') return lirePdfSource(url);
  const html = new TextDecoder('utf-8', { fatal: false }).decode(octets);
  const principal = /<main[\s>][\s\S]*?<\/main>/i.exec(html)?.[0] || html;
  const texte = stripHtml(principal);
  if (!texte || looksLikeCode(texte)) return null;
  return { texte, publiee: dateDePublication(html), modifiee: dateDeMiseAJour(html), titre: titreDeLaPage(html), pdfs: collectPdfLinks(principal, r.url || url) };
}

// Une lecture par adresse et par invocation, partagée entre les projets qui citent la même page
const _sourcesLues = new Map();
function lireSource(url) {
  if (!_sourcesLues.has(url)) {
    const lecture = !isSafePublicUrl(url) ? Promise.resolve(null)
      : (/\.pdf(\?|#|$)/i.test(url) ? lirePdfSource(url) : lirePageSource(url)).catch(() => null);
    _sourcesLues.set(url, lecture);
  }
  return _sourcesLues.get(url);
}

/* Place de lecture répartie entre les sources : chacune sa part, puis le
   reliquat des sources courtes aux longues, dans l'ordre (la page d'origine
   d'abord). Couper chaque source au même nombre de signes amputait les longues
   alors que le paquet restait à moitié vide. */
function repartirLaPlace(sources, total) {
  /* Partage équitable : chaque source reçoit sa part, celles qui en demandent
     moins la rendent, et ce qui est rendu se partage à nouveau entre les
     sources encore coupées, à parts égales. Le reliquat allait auparavant à la
     première source longue de la liste : sur l'accueil de loisirs de Noyal, la
     maquette du budget 2026 (290 000 signes de tableaux) en prenait 62 000, et
     la note de présentation qui dit l'équipement ouvert le 4 février 2026 n'en
     gardait que 7 000. */
  for (const s of sources) s.place = 0;
  let reste = total;
  let ouvertes = sources.filter((s) => s.texte.length > 0);
  while (reste > 0 && ouvertes.length) {
    const part = Math.floor(reste / ouvertes.length);
    if (part < 1) break;
    for (const s of ouvertes) {
      const plus = Math.min(part, s.texte.length - s.place);
      s.place += plus; reste -= plus;
    }
    ouvertes = ouvertes.filter((s) => s.place < s.texte.length);
  }
  for (const s of sources) s.lu = s.texte.slice(0, s.place);
}

/* Toutes les sources lisibles d'un projet : ses pages, puis les PDF de ces
   pages (ceux que l'exploration a retenus, puis les autres liens de document
   de la page). Repli sur l'extrait relevé à l'exploration quand la page
   d'origine ne répond plus : c'est le texte qui a fondé la fiche. */
async function sourcesDuProjet(projet, tousLesPdfs) {
  const pages = [...new Set([projet.source_url, ...(projet.sources || []).map((s) => s.url)]
    .filter((u) => /^https?:\/\//.test(u || '')))].slice(0, SOURCES_LUES_MAX);
  const lues = await Promise.all(pages.map(lireSource));
  const sources = [];
  pages.forEach((url, i) => {
    if (lues[i]?.texte) sources.push({ url, nature: /\.pdf(\?|#|$)/i.test(url) ? 'pdf' : 'page', ...lues[i] });
    else if (url === projet.source_url && projet.source_excerpt) sources.push({ url, nature: 'page', texte: projet.source_excerpt, publiee: '', titre: '', pdfs: [] });
  });
  const pagesLues = new Set(pages);
  const candidats = [
    ...(tousLesPdfs || []).filter((d) => pagesLues.has(d.page)),
    ...sources.flatMap((s) => s.pdfs || []),
  ];
  const pdfs = [];
  for (const d of candidats) {
    if (pdfs.length >= PDF_PAR_PROJET_MAX) break;
    if (!pagesLues.has(d.url) && !pdfs.some((p) => p.url === d.url)) pdfs.push(d);
  }
  const pdfsLus = await Promise.all(pdfs.map((d) => lireSource(d.url)));
  pdfs.forEach((d, i) => {
    if (pdfsLus[i]?.texte) sources.push({ ...pdfsLus[i], url: d.url, nature: 'pdf', titre: d.label || nomDeFichier(d.url) });
  });
  sources.forEach((s, i) => { s.id = `S${i + 1}`; s.normalisee = pourCitation(s.texte); });
  repartirLaPlace(sources, CORPUS_CHARS);
  return sources;
}

/* ATTRIBUTION D'UN PASSAGE. Mesure du banc du 10/11/2026 : l'extracteur
   répondait à « ce passage porte-t-il sur le projet ? » par oui presque
   toujours, puisqu'on venait de lui demander des faits sur ce projet. La fiche
   de l'école Le Chat Perché à Noyal recevait ainsi 947 570 € du budget 2026
   qui vont à l'accueil de loisirs d'une autre école, la cantine et l'entretien
   des espaces verts ; celle de la vidéoprotection, la mutuelle des agents. Un
   budget, un procès-verbal ou un bulletin liste des lignes voisines, et rien
   dans une question à une seule réponse ne les en distinguait.

   L'extracteur reçoit donc les autres opérations de la carte, et dit pour
   chaque passage à laquelle il se rapporte : le projet demandé, une autre
   opération nommée, ou aucune. Une ligne de budget qui nomme l'accueil de
   loisirs a désormais une place où aller. Seuls les passages rendus au projet
   demandé sont gardés. */
function schemaDesFaits(nAutres) {
  const operations = ['P', 'aucune', ...Array.from({ length: nAutres }, (_, k) => `O${k + 1}`)];
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      faits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            citation: { type: 'string', description: 'Passage de la source recopié mot pour mot, qui porte ce fait.' },
            source: { type: 'string', description: 'Identifiant de la source (S1, S2...).' },
            /* Nommer l'objet du passage avant de le ranger : une page de la
               Ville sur le cours Brillier parle aussi du monument aux morts et
               de la halte fluviale, que l'extracteur versait au cours Brillier
               tant qu'il n'avait pas à dire de quoi parlait chaque passage. */
            objet: { type: 'string', description: 'Les mots de la source qui nomment ce dont parle le passage (le chantier, l\'équipement, le lieu, l\'intitulé de la ligne ou du point), recopiés tels quels depuis le passage ou depuis le titre de la section où il se trouve. Vide si rien ne le nomme.' },
            operation: { type: 'string', enum: operations, description: '« P » si le passage parle du projet demandé, « O1 », « O2 »... s\'il parle d\'une autre opération de la liste, « aucune » s\'il parle d\'autre chose.' },
            rubrique: { type: 'string', enum: RUBRIQUES },
          },
          required: ['citation', 'source', 'objet', 'operation', 'rubrique'],
        },
      },
      documents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Identifiants des sources PDF qui portent sur ce projet précis.',
      },
      /* L'intitulé et la date de chaque source. Le <h1> des pages porte souvent
         des capitales et des crochets (« [TRAVAUX] Fermeture du pont »), que la
         charte d'écriture exclut ; le modèle les récrit sans toucher au sens.
         La date est celle que le document écrit pour lui-même : la date de
         dépôt d'un PDF n'est pas celle de la séance qu'il rapporte (Faugères :
         les délibérations du 20 août 2026, déposées en octobre, étaient dites
         « d'octobre 2026 »). */
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            source: { type: 'string' },
            titre: { type: 'string', description: 'Intitulé court en typographie courante : majuscule initiale et noms propres seulement, sans crochets ni capitales.' },
            date_ecrite: { type: 'string', description: 'La date que le document se donne à lui-même, recopiée mot pour mot depuis son texte : date de la séance d\'un procès-verbal ou d\'une délibération, date d\'un article, date d\'un budget, d\'un bulletin ou d\'un plan. Vide si son texte n\'en écrit pas.' },
            date_iso: { type: 'string', description: 'Cette même date sous la forme AAAA-MM-JJ, AAAA-MM ou AAAA. Vide si date_ecrite est vide.' },
          },
          required: ['source', 'titre', 'date_ecrite', 'date_iso'],
        },
      },
    },
    required: ['faits', 'documents', 'sources'],
  };
}

/* Une date partielle (AAAA, AAAA-MM) ou complète, lue sans fuseau. Rendue
   vide si elle n'a pas cette forme. */
function dateIso(iso) {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(iso || '').trim());
  if (!m || Number(m[2] || 1) > 12 || Number(m[3] || 1) > 31) return null;
  return { annee: m[1], mois: m[2] || '', jour: m[3] || '' };
}

/* La date écrite par le document est-elle bien la sienne ? Elle doit figurer
   dans son texte, et la forme AAAA-MM-JJ que le modèle en donne doit en
   reprendre l'année et le jour : un modèle qui lit « séance du 20 août » dans
   un PV de 2026 ne peut pas rendre 2025-10-01. */
function dateDeLaSourceVerifiee(s, d) {
  const iso = dateIso(d?.date_iso);
  const ecrite = String(d?.date_ecrite || '').trim();
  if (!iso || !ecrite || !citationRetrouvee(ecrite, s.normalisee)) return '';
  const chiffres = ecrite.match(/\d+/g) || [];
  if (!chiffres.includes(iso.annee)) return '';
  if (iso.jour && !chiffres.some((c) => Number(c) === Number(iso.jour))) return '';
  return [iso.annee, iso.mois, iso.jour].filter(Boolean).join('-');
}

// « il y a 3 ans », « il y a 5 mois » : l'écart entre la date d'une source et aujourd'hui
function ancienneteDe(iso) {
  const d = dateIso(iso);
  if (!d) return '';
  const ref = new Date(`${d.annee}-${d.mois || '07'}-${d.jour || '15'}T12:00:00Z`);
  const mois = Math.round((Date.now() - ref.getTime()) / (30.44 * 86400000));
  if (mois < 1) return 'moins d\'un mois';
  if (mois < 24) return `${mois} mois`;
  return `${Math.floor(mois / 12)} ans`;
}

// 2026-08-20 → « 20 août 2026 », 2026-08 → « août 2026 », 2026 → « 2026 »
function dateLisible(iso) {
  const d = dateIso(iso);
  if (!d) return '';
  const date = new Date(`${d.annee}-${d.mois || '01'}-${d.jour || '01'}T12:00:00Z`);
  if (d.jour) return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  if (d.mois) return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return d.annee;
}

/* La date d'une source telle qu'on peut la présenter : celle que le document
   écrit pour lui-même, sinon, pour une page, sa date de publication déclarée.
   La date de création d'un fichier PDF n'est jamais retenue : c'est le jour de
   son dépôt, pas celui de ce qu'il rapporte. */
const dateDeLaSource = (s) => s?.datee || (s?.nature === 'page' ? s.publiee || '' : '');

/* VÉRIFICATION DU RATTACHEMENT, par un second regard.

   Mesure du 10/11/2026 sur l'école Le Chat Perché de Noyal, après que
   l'extracteur a reçu la liste des autres opérations : il rangeait encore au
   projet la ligne « ALSH CONSTRUCTION ALSH ESPACE VIE SOCIALE ET 2 CLASSES »
   du budget, l'opération voisine pourtant dans sa liste, et les totaux de la
   section d'investissement. Chargé de trouver des faits sur un projet, un
   modèle trouve que tout en parle. La question est donc reposée à part, à un
   modèle qui n'a rien à remplir : chaque passage gardé, avec ce qui l'entoure
   dans sa source, se rapporte-t-il au projet, à une autre opération de la
   carte, ou à rien de tout cela ? */
const RATTACHEMENT_FAITS_LOT = 60;
const CONTEXTE_AVANT = 400;
const CONTEXTE_APRES = 200;
function contexteDuPassage(s, citation) {
  const t = s?.texte || '';
  const debut = String(citation || '').slice(0, 30);
  let at = debut ? t.indexOf(debut) : -1;
  if (at < 0) {
    // Apostrophes et espaces changés par le modèle : on cherche dans la forme normalisée
    const n = s?.normalisee || '';
    const k = n.indexOf(pourCitation(citation).slice(0, 30));
    return k < 0 ? '' : n.slice(Math.max(0, k - CONTEXTE_AVANT), k + pourCitation(citation).length + CONTEXTE_APRES);
  }
  return t.slice(Math.max(0, at - CONTEXTE_AVANT), at + String(citation).length + CONTEXTE_APRES);
}

async function verifierLeRattachement(commune, projet, faits, parId, autres) {
  if (!faits.length) return faits;
  const codes = ['P', 'aucune', ...autres.map((_, k) => `O${k + 1}`)];
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      passages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            ce_qu_il_nomme: { type: 'string', description: 'Ce que le passage et son contexte désignent, en quelques mots.' },
            operation: { type: 'string', enum: codes },
          },
          required: ['id', 'ce_qu_il_nomme', 'operation'],
        },
      },
    },
    required: ['passages'],
  };
  const listeAutres = autres.map((o, k) => `O${k + 1} : ${o.title}${o.place ? ` (${o.place})` : ''}`).join('\n');
  const system = `Tu vérifies une fiche de la carte des projets de ${commune.nom}. La fiche porte sur UN projet, désigné P : « ${projet.title} »${projet.place ? ` (${projet.place})` : ''}${projet.description ? `. ${String(projet.description).slice(0, 400)}` : ''}

Les autres opérations de la commune ont chacune leur fiche :
${listeAutres || '(aucune)'}

On a relevé pour la fiche P les passages qui suivent, chacun avec son contexte dans sa source. Pour chacun, dis à quoi il se rapporte vraiment, d'après ce qu'il nomme et ce qui l'entoure : « P » s'il parle du projet P lui-même ; le code d'une autre opération s'il parle d'elle ; « aucune » s'il parle d'autre chose (le budget ou le fonctionnement de toute la commune, ses totaux, le personnel, un service, un chantier hors de la liste).

Tu n'as pas à remplir la fiche : un passage qui ne parle pas de P doit en sortir. Dans un budget, un procès-verbal ou un bulletin, une ligne ou un paragraphe se rapporte à l'opération qu'il nomme ou à celle de la section où il se trouve, pas à P parce qu'il est voisin d'une ligne qui le nomme. Un même groupe scolaire, une même rue ou un même quartier peuvent porter deux opérations distinctes.`;
  const lots = [];
  for (let k = 0; k < faits.length; k += RATTACHEMENT_FAITS_LOT) lots.push(faits.slice(k, k + RATTACHEMENT_FAITS_LOT));
  const verdicts = new Map();
  await Promise.all(lots.map(async (lot) => {
    const user = JSON.stringify(lot.map((f) => {
      const src = parId.get(f.source);
      return { id: f.id, source: src?.titre || hostOf(src?.url || ''), passage: f.citation, contexte: contexteDuPassage(src, f.citation) };
    }));
    try {
      const out = await openAIStructured([{ role: 'system', content: system }, { role: 'user', content: user }],
        'rattachement_faits', schema, 400 + 60 * lot.length, FAITS_TIMEOUT_MS, 0, FAITS_MODEL, 2);
      for (const v of out.passages || []) verdicts.set(v.id, v);
    } catch (e) {
      // Sans second regard, les passages gardent le rattachement de l'extracteur
      console.warn(`[demo-generate] verification du rattachement impossible pour "${projet.title}" :: ${e?.message}`);
    }
  }));
  const nomDe = (code) => (code === 'aucune' ? 'aucune opération de la carte' : autres[Number(String(code).slice(1)) - 1]?.title || code);
  for (const f of faits) {
    const v = verdicts.get(f.id);
    if (v && v.operation !== 'P') f.motif = `rattachement refusé : ${nomDe(v.operation)} (${String(v.ce_qu_il_nomme || '').slice(0, 60)})`;
  }
  return faits;
}

/* Les faits d'un projet, chacun retrouvé dans sa source.
   Un fait est une citation : il est gardé si elle figure dans le texte de la
   source qu'il désigne. L'extracteur ne reformule plus. Sa reformulation a été
   essayée, et c'est elle qui trompait le rédacteur (sur le réseau express vélo
   de Noyal, 5 km de liaison qui « permettent » déjà de rejoindre Rennes
   devenaient 5 km qui « vont être aménagés ») ; la contrôler par ses nombres
   rejetait 8 faits justes sur 28 au boulevard du Rhône, dont tout le plan de
   financement. Sans elle, la sortie est aussi deux fois plus courte.
   @param {Array<Object>} autres - les autres opérations de la carte, qui ont leur propre fiche */
async function extraireLesFaits(commune, projet, sources, aujourdhui, autres = []) {
  const listeAutres = autres.map((o, k) => `O${k + 1} : ${o.title}${o.place ? ` (${o.place})` : ''}`).join('\n');
  const system = `Tu relèves, pour les habitants de ${commune.nom}, tout ce que les sources fournies établissent sur UN projet : « ${projet.title} »${projet.place ? ` (${projet.place})` : ''}.

Relève TOUS les faits utiles sur ce projet, sans en omettre aucun, un fait par élément d'information. Parcours chaque source phrase par phrase : chaque phrase qui dit quelque chose du projet donne au moins un fait.
- programme : ce qui est construit, transformé ou installé, avec ses chiffres (logements, surfaces, longueurs, places, classes, équipements, matériaux annoncés), et les rues, lieux et itinéraires concernés ;
- calendrier : chaque date ou période (études, concertation, début et fin de chantier, phases, livraison, inauguration), recopiée comme la source l'écrit ;
- acteurs : maître d'ouvrage, aménageur, architecte, bureau d'études, entreprises, financeurs, et chaque montant avec ce qu'il finance exactement (coût total, part de chaque financeur, poste concerné) ;
- etat : où en est le projet à la date de la source (à l'étude, en concertation, en travaux, livré, inauguré, abandonné), et ce qui reste à faire ;
- effets : ce qui change pour les habitants (fermetures, déviations, ce qui reste ouvert, horaires, stationnement, nouveaux usages).

Chaque fait est une citation recopiée mot pour mot, d'un seul tenant, dans la source indiquée : une phrase ou un morceau de phrase qui contient tout le fait, assez longue pour qu'on comprenne de quoi elle parle et sans rien y changer.

Pour chaque fait, recopie d'abord dans « objet » les mots de la source qui nomment ce dont il parle, tels qu'ils sont écrits dans le passage ou dans le titre de sa section (« ACCUEIL LOISIRS SUD EXT ECOLE LPP ALSH », « Restauration de l'église », « Point 4 : vidéoprotection »), jamais le nom du projet demandé s'il n'y figure pas ; puis dis dans « operation » à quelle opération ces mots se rapportent : « P » pour le projet demandé, le code d'une autre opération de la commune s'il parle d'elle, « aucune » s'il parle d'autre chose (le fonctionnement de la commune, le personnel, un service, un chantier qui n'est pas dans la liste). ${listeAutres ? `Les autres opérations de la commune, qui ont chacune leur fiche :\n${listeAutres}\n` : ''}
Une page, un procès-verbal, un budget ou un bulletin parlent de beaucoup de choses à la fois. Un passage ne se rapporte au projet demandé que s'il en parle lui-même : il nomme son équipement, son lieu ou l'opération, ou il continue sans ambiguïté un paragraphe qui les nomme. La ligne voisine d'un budget, le point suivant d'un ordre du jour, l'article d'à côté d'un bulletin se rapportent à ce qu'ils nomment, même dans le même chapitre ou pour le même quartier. Les totaux et les sections d'un document budgétaire de toute la commune portent sur la commune, jamais sur le projet. Si une source corrige une annonce précédente, relève les deux faits.

Dans « documents », donne les identifiants des PDF qui portent sur ce projet précis.
Dans « sources », donne pour chaque source son intitulé et la date qu'elle se donne à elle-même : la date de séance d'un procès-verbal ou d'une délibération, la date d'un article, d'un budget, d'un bulletin ou d'un plan, recopiée telle que son texte l'écrit. La date de publication d'une page en ligne n'est pas à recopier : laisse vide si le texte n'écrit pas de date pour lui-même.
Nous sommes le ${aujourdhui}.`;

  const parId = new Map(sources.map((s) => [s.id, s]));
  const lots = lotsDeSources(sources);
  const schema = schemaDesFaits(autres.length);
  const sorties = await Promise.all(lots.map((lot) => openAIStructured([
    { role: 'system', content: system },
    { role: 'user', content: lot.map((s) => `=== ${s.id} : ${s.nature === 'pdf' ? 'document PDF' : 'page'}${s.titre ? ` « ${s.titre} »` : ''}${s.nature === 'page' && s.publiee ? `, publiée en ligne le ${dateLisible(s.publiee)}` : ''}\n${s.lu}`).join('\n\n') },
  ], 'faits_projet', schema, FAITS_MAX_TOKENS, FAITS_TIMEOUT_MS, 0, FAITS_MODEL, 2).catch((e) => {
    // Un lot perdu coûte ses faits, pas l'article : les autres lots suffisent souvent
    console.warn(`[demo-generate] extraction perdue pour "${projet.title}" (${lot.map((x) => x.id).join(', ')}) :: ${e?.message}`);
    return { faits: [], documents: [], sources: [] };
  })));

  for (const d of sorties.flatMap((o) => o.sources || [])) {
    const s = parId.get(d.source);
    if (!s) continue;
    if (String(d.titre || '').trim()) s.titre = String(d.titre).trim().slice(0, 140);
    const datee = dateDeLaSourceVerifiee(s, d);
    if (datee) { s.datee = datee; s.datee_ecrite = String(d.date_ecrite).trim(); }
  }

  const nomDe = (code) => (code === 'aucune' ? 'aucune opération de la carte' : autres[Number(String(code).slice(1)) - 1]?.title || code);
  const gardes = [];
  const rejetes = [];
  const vues = [];
  for (const f of sorties.flatMap((o) => o.faits || [])) {
    const s = parId.get(f.source);
    const forme = pourCitation(f.citation);
    const motif = f.operation !== 'P' ? `autre opération (${nomDe(f.operation)})`
      : !s ? 'source inconnue'
        : !citationRetrouvee(f.citation, s.normalisee) ? 'citation introuvable'
          // La même phrase reprise d'une page à l'autre ne fait qu'un fait
          : vues.some((v) => v.includes(forme)) ? 'doublon'
            : '';
    if (motif) rejetes.push({ ...f, motif });
    else { gardes.push({ ...f, id: `F${gardes.length + 1}` }); vues.push(forme); }
  }
  /* Second regard sur le rattachement des passages gardés (voir
     verifierLeRattachement), puis renumérotation des faits restants. */
  await verifierLeRattachement(commune, projet, gardes, parId, autres);
  for (const f of gardes.filter((x) => x.motif)) rejetes.push(f);
  const retenus = gardes.filter((x) => !x.motif).map((f, k) => ({ ...f, id: `F${k + 1}` }));
  gardes.length = 0;
  gardes.push(...retenus);
  /* Un document officiel listé sous l'article est un PDF que l'extracteur
     rattache au projet ET qui porte au moins un fait gardé : le budget de toute
     la commune n'est plus présenté comme le dossier d'une école parce qu'une de
     ses lignes a été lue pour elle. */
  const avecFaits = new Set(gardes.map((f) => f.source));
  const documents = sorties.flatMap((o) => o.documents || []).map((id) => parId.get(id))
    .filter((s) => s?.nature === 'pdf' && avecFaits.has(s.id));
  return { faits: gardes, rejetes: rejetes.filter((r) => r.motif !== 'doublon'), documents: [...new Set(documents)] };
}

/* Les sources d'un projet partent en plusieurs appels d'extraction, lancés
   ensemble, d'au plus FAITS_LOT_CHARS signes chacun. Mesure du 10/11/2026 sur
   le Vallon de Saint-Genis-Laval (13 sources, 90 000 signes en un appel) :
   122 s d'attente, dont un premier essai coupé à 60 s, et 40 citations sur 84
   rejetées parce que le modèle, noyé, résumait au lieu de recopier. */
function lotsDeSources(sources) {
  const lots = [];
  let courant = [];
  let taille = 0;
  for (const s of sources) {
    if (courant.length && taille + s.lu.length > FAITS_LOT_CHARS) { lots.push(courant); courant = []; taille = 0; }
    courant.push(s);
    taille += s.lu.length;
  }
  if (courant.length) lots.push(courant);
  return lots;
}

const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    /* L'état du projet à la date du jour, établi AVANT d'écrire. Mesure du banc
       du 10/11/2026 : l'accueil de loisirs de Noyal, livré et ouvert le 4
       février 2026, était raconté au futur depuis les pages de son chantier ;
       un projet de 2018 l'était au présent. */
    etat_aujourdhui: { type: 'string', description: 'Où en est le projet aujourd\'hui, en une phrase, d\'après le fait le plus récent qui le dit, avec son identifiant et sa date.' },
    markdown: {
      type: 'string',
      description: "L'article en markdown, et lui seul : aucun préambule, aucune phrase adressée au lecteur de la consigne.",
    },
    description: { type: 'string', description: 'Deux ou trois phrases pour la fiche du projet sur la carte : ce qu\'est le projet et où il en est aujourd\'hui, au temps juste, tirées des faits.' },
    faits_utilises: { type: 'array', items: { type: 'string' }, description: 'Identifiants (F1, F2...) des faits employés dans l\'article.' },
  },
  required: ['etat_aujourdhui', 'markdown', 'description', 'faits_utilises'],
};

/**
 * Article d'un projet, écrit à partir des faits relevés dans ses sources.
 * @param {Array<Object>} autres - les autres opérations de la carte, pour que
 *   l'extraction rende à chacune les passages qui la concernent
 * @returns {Promise<{markdown: string, description: string}>}
 */
async function redigerArticle(commune, projet, tousLesPdfs, autres = []) {
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const sources = await sourcesDuProjet(projet, tousLesPdfs);
  if (!sources.length) throw new Error('aucune source lisible');
  const { faits, rejetes, documents } = await extraireLesFaits(commune, projet, sources, aujourdhui, autres);
  console.log(`[demo-faits] "${projet.title}" : ${sources.length} source(s), ${faits.length} fait(s) gardé(s), ${rejetes.length} rejeté(s)${rejetes.length ? ` :: ${rejetes.map((r) => `${r.motif} « ${String(r.citation).slice(0, 80)} »`).join(' ; ')}` : ''}`);
  if (process.env.DEMO_FAITS_DETAIL) console.log(`[demo-faits-detail] ${JSON.stringify({ projet: projet.title, sources: sources.map((s) => ({ id: s.id, url: s.url, publiee: s.publiee, datee: s.datee || '', datee_ecrite: s.datee_ecrite || '', chars: s.texte.length, lu: s.lu.length })), faits, rejetes })}`);
  // Sans fait retrouvé dans une source, il n'y a rien à écrire que la description ne dise déjà
  if (!faits.length) throw new Error('aucun fait retrouvé dans les sources');

  const parId = new Map(sources.map((s) => [s.id, s]));
  /* L'âge de la source est calculé ici plutôt que laissé au rédacteur : mesure
     du 10/11/2026, une page de novembre 2023 qui annonçait des aménagements « à
     venir » était racontée au présent, « le projet est en cours ». La date est
     celle que la source écrit pour elle-même (séance, article), jamais celle du
     dépôt d'un fichier. Les faits sont donnés du plus ancien au plus récent :
     le dernier dit où en est le projet. */
  const datee = (f) => dateDeLaSource(parId.get(f.source));
  const ordonnes = [...faits].sort((x, y) => (datee(x) || '9999').localeCompare(datee(y) || '9999'));
  const liste = ordonnes.map((f) => {
    const d = datee(f);
    return {
      id: f.id, objet: f.objet, rubrique: f.rubrique, la_source_dit: f.citation,
      source_datee_du: d ? dateLisible(d) : 'date inconnue',
      ...(d ? { anciennete_de_la_source: ancienneteDe(d) } : {}),
    };
  });
  const system = promptArticle({ commune: commune.nom, aujourdhui });
  const user = `PROJET : ${projet.title}
${projet.place ? `LIEU : ${projet.place}\n` : ''}COMMUNE : ${commune.nom}
FAITS VÉRIFIÉS (${faits.length}), du plus ancien au plus récent, les faits sans date à la fin :
${JSON.stringify(liste, null, 1)}`;

  const out = await openAIStructured([{ role: 'system', content: system }, { role: 'user', content: user }],
    'article_projet', ARTICLE_SCHEMA, ARTICLE_MAX_TOKENS, ARTICLE_TIMEOUT_MS, 0.3, REDACTION_MODEL, 2);
  /* Les identifiants de faits n'ont rien à faire sous les yeux d'un habitant ;
     le rédacteur en sème parfois entre parenthèses malgré la consigne. */
  const markdown = retirerLesLiens(String(out.markdown || '').replace(/\s*\((?:F\d+[,;\s]*(?:et\s*)?)+\)/g, '').trim());
  if (!markdown) throw new Error('Article vide');

  /* Les sources citées sous l'article sont celles des faits employés, pages
     d'abord ; un PDF rattaché comme document officiel n'y est pas répété. */
  const utilises = new Set((out.faits_utilises || []).filter((id) => faits.some((f) => f.id === id)));
  const employes = faits.filter((f) => !utilises.size || utilises.has(f.id));
  const dossiers = [...documents];
  for (const f of employes) {
    const s = parId.get(f.source);
    if (s?.nature === 'pdf' && !dossiers.includes(s)) dossiers.push(s);
  }
  const citees = [...new Set(employes.map((f) => parId.get(f.source)))]
    .filter((s) => s && s.nature !== 'pdf')
    .map((s) => ({ url: s.url, title: s.titre || hoteLisible(s.url) }));
  const blocDossier = dossiers.length
    ? `\n\n## ${dossiers.length > 1 ? 'Les documents officiels sont en ligne' : 'Le document officiel est en ligne'}\n\n${dossiers.map((d) => `- [${d.titre || nomDeFichier(d.url)}](${d.url})`).join('\n')}\n`
    : '';
  const description = retirerLesLiens(String(out.description || '').replace(/\s*\((?:F\d+[,;\s]*(?:et\s*)?)+\)/g, '').trim());
  return { markdown: `${markdown}${blocDossier}${blocSources(citees)}`, description, etat: String(out.etat_aujourdhui || '').trim() };
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

/* Couleur de marque d'un logo SVG : la couleur saturée la plus présente dans
   ses attributs et ses styles, en ignorant les blancs, noirs et gris. Rend
   null si le logo est monochrome. Sans IA : le fichier dit tout. */
function couleurDepuisSvg(texte) {
  const t = String(texte || '');
  const comptes = new Map();
  const re = /(?:fill|stop-color|stroke)\s*[:=]\s*["']?\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    let hex = m[1].toLowerCase();
    if (hex.startsWith('rgb')) {
      const [r, g, b] = hex.match(/\d+/g).map((n) => Math.min(255, parseInt(n, 10)));
      hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    } else if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Saturation et luminosité : ni gris, ni presque blanc, ni presque noir
    if (max === 0 || (max - min) / max < 0.25 || max < 40 || (min > 225)) continue;
    comptes.set(hex, (comptes.get(hex) || 0) + 1);
  }
  if (!comptes.size) return null;
  return [...comptes.entries()].sort((a, b) => b[1] - a[1])[0][0];
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

/* `icones` : les icones declarees par le site pour l'onglet du navigateur.
   Elles sont presentees APRES les candidats logo, et le juge ne peut en retenir
   une qu'a defaut de logo. Le verdict dit d'ou vient l'image retenue
   (`source` : 'logo', 'icone' ou 'aucun') : l'appelant s'en sert pour ne plus
   installer, en repli, une image que le juge a ecartee. */
async function choisirLogoEtCouleur(candidats, icones = []) {
  const logos = (candidats || []).filter((u) => u && !VISION_UNSUPPORTED_RE.test(u)).slice(0, 4);
  const marques = (icones || []).filter((u) => u && !VISION_UNSUPPORTED_RE.test(u) && !logos.includes(u)).slice(0, 3);
  const usables = [...logos, ...marques];
  if (!usables.length) return null;
  try {
    const consigneIcones = marques.length
      ? `\n\nLes images ${logos.length} à ${usables.length - 1} sont les icônes que le site déclare pour l'onglet du navigateur. Une icône n'est retenue qu'en dernier recours, si aucune image précédente n'est le logo de la commune, et seulement si elle porte l'identité de la commune (monogramme, blason, marque). Écarte toute icône générique : pictogramme d'installation d'application (« Default App », « Get the app »), image fournie par un module technique, forme neutre sans rapport avec la commune.`
      : '';
    const content = [{
      type: 'input_text',
      text: `Voici ${usables.length} image(s) numérotée(s) de 0 à ${usables.length - 1}, prises sur le site d'une mairie française.

Choisis celle qui est le LOGO OFFICIEL DE LA COMMUNE (son nom, son blason ou sa marque). Écarte : les logos de labels et de partenaires (« Ville active et sportive », « Villes fleuries »), les couvertures de magazine municipal, les bandeaux, les pictogrammes d'interface.

Écarte aussi toute version BLANCHE ou monochrome claire du logo : elle est faite pour un fond sombre et serait invisible sur une interface claire. Ne la retiens jamais, même si c'est la seule image disponible : réponds -1 plutôt.${consigneIcones}

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
    const source = !logoUrl ? 'aucun' : (idx < logos.length ? 'logo' : 'icone');
    // Meme exigence que pour la couleur declaree par le site : ni trop claire,
    // ni trop sombre, ni grise
    return { logoUrl, source, themeColor: couleurUtilisable(out.color) };
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

/* Le NOM DE LA COMMUNE n'est pas un mot du lieu : c'est le cadre de la
   recherche, que chaque requête porte déjà. Compté comme significatif, il
   faisait passer n'importe quoi. Mesuré sur Mazamet : « complexe sportif de
   Mazamet », débarrassé de son préfixe, devenait « Mazamet » et rendait
   l'arrêt de bus « Mazamet » de l'avenue Charles Sabatié ; « RD 118 Mazamet »
   rendait l'avenue du Maréchal Foch, que la départementale traverse, pour un
   belvédère situé à deux kilomètres dans la montagne. Les deux résultats
   portaient le mot « Mazamet », donc passaient le contrôle de pertinence. */
function motsSignificatifs(s, communeNom = '') {
  const motsDeLaCommune = new Set(unaccentLower(communeNom).split(/[^a-z0-9]+/));
  return new Set(
    unaccentLower(s).split(/[^a-z0-9]+/)
      .filter((w) => w.length >= MOT_SIGNIFICATIF_MIN && !GENERIC_PROJECT_WORDS.test(w) && !motsDeLaCommune.has(w))
  );
}

function nomCoherent(requete, nomTrouve, communeNom = '') {
  const cherches = motsSignificatifs(requete, communeNom);
  if (!cherches.size) return true;
  const trouves = motsSignificatifs(nomTrouve, communeNom);
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
        && nomCoherent(q, f.properties.label || '', commune.nom)) {
        return { geometry: f.geometry, method: 'adresse' };
      }
    }
  } catch { /* BAN indisponible */ }
  return null;
}

// « 42 boulevard Soult », « 3 bis rue Voltaire » : un numéro en tête de voie
const AVEC_NUMERO_RE = /^\s*\d{1,4}\s*(?:bis|ter)?[\s,]/i;

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

/* Nominatim, dernier recours BORNÉ (voir l'étage 4 de coreGeo).
   best-of-6 : on garde l'ordre de pertinence de Nominatim mais on descend
   jusqu'au 1er résultat réellement DANS la commune et son emprise (un homonyme
   mieux classé ailleurs ne fait plus rater le bon résultat). */
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
        if (!nomCoherent(q, `${hit.name || ''} ${(hit.display_name || '').split(',').slice(0, 3).join(' ')}`, commune.nom)) continue;
        /* Une requête qui porte un NUMÉRO désigne un bâtiment, et Nominatim,
           qui ignore souvent ce numéro, rend la rue entière. Accepté ici, ce
           tracé passait avant la BAN, qui elle connaît le numéro : la maison
           de santé du 42 boulevard Soult, à Mazamet, était dessinée comme le
           boulevard sur toute sa longueur. On laisse donc la voie à la BAN. */
        if (AVEC_NUMERO_RE.test(q) && hit.category === 'highway') continue;
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


/* ─── Répertoire des lieux de la commune ───

   La localisation interrogeait un annuaire d'adresses projet par projet, et
   formulation par formulation, au rythme imposé d'une requête par seconde.
   Trois défauts mesurés à Noyal-Châtillon-sur-Seiche (10/11/2026) : 28 projets
   attestés sur 52 écartés faute d'emplacement, dont la ZAC de l'Ise et le
   réseau express vélo (« RD82 »), qu'aucun annuaire ne connaît sous ce nom ;
   la moitié de la durée d'une génération passée à attendre ce rythme ; et des
   positions fausses (le Hil 3 posé à un kilomètre de sa zone).

   On procède désormais dans l'autre sens. Les lieux NOMMÉS de la commune sont
   relevés une seule fois dans la BD TOPO de l'IGN (voies, équipements, zones
   d'activités, lieux-dits, giratoires et parkings, routes numérotées), puis
   l'IA rattache chaque projet à l'un d'eux en lisant sa source. Elle ne peut
   rien inventer : elle désigne un index de la liste, et le code pose la vraie
   géométrie de ce lieu, tracé pour une voie, contour pour un équipement.

   Le service WFS de la Géoplateforme répond sans clé. Le paramètre BBOX seul y
   est ignoré, d'où le filtre CQL. Mesuré sur Vienne (30 000 habitants) : tout
   le répertoire tient en moins de dix secondes et deux mégaoctets, couches
   interrogées en parallèle. */
/* Une couche lente un jour répond vite le lendemain (construction_lineaire :
   200 ms puis une coupure à 12 s, mesurées à Noyal le même après-midi) : un
   second essai, et deux essais tiennent encore dans une tranche. */
const REPERTOIRE_TIMEOUT_MS = 9000;
const REPERTOIRE_ESSAIS = 2;
const REPERTOIRE_MAX_BYTES = 12000000;

/* Les couches lues, et comment chacune nomme ses objets.
   `cle` identifie un objet de façon stable d'une tranche à l'autre : la
   géométrie ne voyage pas dans le brouillon, elle est relue au besoin. */
const COUCHES_REPERTOIRE = [
  // Les voies sont filtrées sur la commune elle-même : la table porte son code
  // INSEE et le filtre attributaire y est rapide (470 voies en six secondes à Vienne).
  { id: 'voie', typename: 'BDTOPO_V3:voie_nommee', parCode: true, nom: (p) => p.nom_voie_ban, nature: () => 'voie' },
  { id: 'zone', typename: 'BDTOPO_V3:zone_d_activite_ou_d_interet', nom: (p) => p.toponyme },
  { id: 'habitat', typename: 'BDTOPO_V3:zone_d_habitation', nom: (p) => p.toponyme },
  { id: 'lieudit', typename: 'BDTOPO_V3:lieu_dit_non_habite', nom: (p) => p.toponyme },
  { id: 'transport', typename: 'BDTOPO_V3:equipement_de_transport', nom: (p) => p.toponyme },
  { id: 'ouvrage', typename: 'BDTOPO_V3:construction_lineaire', nom: (p) => p.toponyme },
  { id: 'cimetiere', typename: 'BDTOPO_V3:cimetiere', nom: (p) => p.toponyme },
];
const natureDe = (p) => [p.nature, p.nature_detaillee].filter(Boolean).join(', ');

async function wfsRepertoire(typename, cql, propertyName = null) {
  const q = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: typename,
    OUTPUTFORMAT: 'application/json', COUNT: '5000', CQL_FILTER: cql,
  });
  if (propertyName) q.set('PROPERTYNAME', propertyName);
  for (let essai = 1; ; essai++) {
    try {
      const r = await fetchWithTimeout(`${GEOPF_WFS}?${q}`, { headers: UA }, REPERTOIRE_TIMEOUT_MS);
      if (!r.ok) throw new Error(`${typename} http=${r.status}`);
      return (await lireJson(r, REPERTOIRE_TIMEOUT_MS, REPERTOIRE_MAX_BYTES)).features || [];
    } catch (e) {
      if (essai >= REPERTOIRE_ESSAIS) throw e;
    }
  }
}

function pointsDe(g) {
  const pts = [];
  const walk = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  if (g?.coordinates) walk(g.coordinates);
  return pts;
}

/* Un objet appartient à la commune quand l'IGN l'y rattache, ou quand l'un de
   ses sommets tombe dans son contour : un stade à cheval sur la limite
   communale y a sa place, un équipement de la commune voisine compris dans la
   boîte de recherche n'y a pas la sienne. */
function dansLaCommune(f, code, contour) {
  const insee = String(f.properties?.insee_commune || '');
  if (insee) return insee.includes(code);
  return pointsDe(f.geometry).some((pt) => contientPoint(contour, pt));
}

/* Fusionne des géométries de même famille en une seule.
   Une voie nommée de la BD TOPO est déjà multiple ; une route numérotée y est
   découpée en dizaines de tronçons. Deux familles différentes ne se mêlent
   pas : on garde la première, qui est celle désignée en premier. */
function fusionnerGeometries(geoms) {
  const gs = geoms.filter(Boolean);
  if (gs.length <= 1) return gs[0] || null;
  const famille = (g) => (/Polygon/.test(g.type) ? 'surface' : /Line/.test(g.type) ? 'ligne' : 'point');
  const f0 = famille(gs[0]);
  const memes = gs.filter((g) => famille(g) === f0);
  if (memes.length === 1) return memes[0];
  const parties = (g) => (g.type.startsWith('Multi') ? g.coordinates : [g.coordinates]);
  const type = f0 === 'surface' ? 'MultiPolygon' : f0 === 'ligne' ? 'MultiLineString' : 'MultiPoint';
  return { type, coordinates: memes.flatMap(parties) };
}

/* L'angle de deux voies : le milieu des deux sommets les plus proches l'un de
   l'autre. Une opération « à l'angle de la rue du Gué et de la rue des
   Thermes » (Dialog, à Noyal) est un bâtiment, pas deux rues entières. Si les
   deux voies ne se touchent pas (plus de 60 m entre leurs sommets les plus
   proches), il n'y a pas d'angle et le projet garde les deux tracés. */
const CROISEMENT_MAX_M = 60;
function pointDeCroisement(g1, g2) {
  let best = null;
  for (const a of pointsDe(g1)) {
    for (const b of pointsDe(g2)) {
      const d = haversineM({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
      if (!best || d < best.d) best = { d, pt: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    }
  }
  return best && best.d <= CROISEMENT_MAX_M ? { type: 'Point', coordinates: best.pt } : null;
}

/* ─── Plafond de taille des géométries ───
   Le brouillon est relu et réécrit à chaque tranche : une emprise de plusieurs
   dizaines de kilooctets l'alourdit pour rien. Au-delà du plafond, la forme
   était remplacée par un simple point, et une voie de deux kilomètres perdait
   son tracé. On la simplifie plutôt (Douglas-Peucker), avec une tolérance qui
   double jusqu'à tenir sous le plafond ; au-delà d'une tolérance d'environ
   cinquante mètres la forme ne ressemble plus à rien et on renonce. */
const GEOMETRIE_MAX_CHARS = 15000;
const TOLERANCE_MIN_DEG = 0.000005;
const TOLERANCE_MAX_DEG = 0.0005;

function douglasPeucker(pts, tol) {
  if (pts.length <= 2) return pts;
  const garder = new Uint8Array(pts.length);
  garder[0] = 1; garder[pts.length - 1] = 1;
  const pile = [[0, pts.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    const [ax, ay] = pts[a]; const [bx, by] = pts[b];
    const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
    let max = -1; let k = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const ex = px - (ax + t * dx); const ey = py - (ay + t * dy);
      const d = ex * ex + ey * ey;
      if (d > max) { max = d; k = i; }
    }
    if (k > 0 && max > tol * tol) { garder[k] = 1; pile.push([a, k], [k, b]); }
  }
  return pts.filter((_, i) => garder[i]);
}

function simplifierGeometrie(g, tol) {
  const arrondi = (c) => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
  const ligne = (l) => douglasPeucker(l.map(arrondi), tol);
  const anneau = (a) => { const s = ligne(a); return s.length >= 4 ? s : a.map(arrondi); };
  switch (g.type) {
    case 'Point': return { type: 'Point', coordinates: arrondi(g.coordinates) };
    case 'MultiPoint': return { type: g.type, coordinates: g.coordinates.map(arrondi) };
    case 'LineString': return { type: g.type, coordinates: ligne(g.coordinates) };
    case 'MultiLineString': return { type: g.type, coordinates: g.coordinates.map(ligne) };
    case 'Polygon': return { type: g.type, coordinates: g.coordinates.map(anneau) };
    case 'MultiPolygon': return { type: g.type, coordinates: g.coordinates.map((p) => p.map(anneau)) };
    default: return g;
  }
}

function allegerLaGeometrie(g, maxChars = GEOMETRIE_MAX_CHARS) {
  if (!g) return null;
  let s = simplifierGeometrie(g, 0);
  for (let tol = TOLERANCE_MIN_DEG; JSON.stringify(s).length >= maxChars; tol *= 2) {
    if (tol > TOLERANCE_MAX_DEG) return null;
    s = simplifierGeometrie(g, tol);
  }
  return s;
}

/* Relève le répertoire. Rend { lieux, geometries } : `lieux` est la liste
   compacte qui voyage dans le brouillon et part à l'IA, `geometries` reste en
   mémoire (clé → géométrie). Une couche qui ne répond pas est simplement
   absente : le reste du répertoire sert quand même. */
async function releverLeRepertoire(code) {
  const communes = await wfsRepertoire('BDTOPO_V3:commune', `code_insee='${code}'`);
  const contour = communes[0]?.geometry;
  if (!contour) throw new Error('contour de la commune introuvable');
  const pts = pointsDe(contour);
  const boite = {
    minLng: Math.min(...pts.map((p) => p[0])), maxLng: Math.max(...pts.map((p) => p[0])),
    minLat: Math.min(...pts.map((p) => p[1])), maxLat: Math.max(...pts.map((p) => p[1])),
  };
  const bboxCql = (champ = 'geometrie') => `BBOX(${champ},${boite.minLat},${boite.minLng},${boite.maxLat},${boite.maxLng})`;

  const objets = []; // { c, cle, nom, nature, geometry }
  const echecs = [];
  const parCouche = COUCHES_REPERTOIRE.map(async (couche) => {
    try {
      const feats = await wfsRepertoire(couche.typename, couche.parCode ? `insee_commune='${code}'` : bboxCql());
      const retenus = couche.parCode ? feats : feats.filter((f) => dansLaCommune(f, code, contour));
      for (const f of retenus) {
        if (!f.geometry) continue;
        objets.push({
          c: couche.id, cle: f.properties.cleabs, nom: String(couche.nom(f.properties) || '').trim(),
          nature: couche.nature ? couche.nature(f.properties) : natureDe(f.properties), geometry: f.geometry,
        });
      }
    } catch (e) { echecs.push(`${couche.id} (${e?.message})`); }
  });
  /* Les routes numérotées (« RD82 ») et les itinéraires cyclables nommés ne
     sont pas des voies au sens de l'adresse : ils n'existent que comme suite de
     tronçons. Le filtre attributaire sur la commune n'est pas indexé (54 s
     mesurées à Noyal), la boîte l'est (moins d'une seconde) : on filtre donc la
     commune après coup, sur le côté gauche ou droit du tronçon. */
  const routes = (async () => {
    try {
      const champs = ['cpx_numero', 'cpx_toponyme_route_nommee', 'cpx_toponyme_itineraire_cyclable', 'cpx_toponyme_voie_verte'];
      const feats = await wfsRepertoire('BDTOPO_V3:troncon_de_route',
        `${bboxCql()} AND (${champs.map((c) => `${c} IS NOT NULL`).join(' OR ')})`,
        [...champs, 'insee_commune_gauche', 'insee_commune_droite', 'geometrie'].join(','));
      const groupes = new Map();
      for (const f of feats) {
        const p = f.properties || {};
        if (p.insee_commune_gauche !== code && p.insee_commune_droite !== code) continue;
        const noms = [
          p.cpx_numero && [p.cpx_numero, 'route numérotée'],
          p.cpx_toponyme_route_nommee && [p.cpx_toponyme_route_nommee, 'route nommée'],
          p.cpx_toponyme_itineraire_cyclable && [p.cpx_toponyme_itineraire_cyclable, 'itinéraire cyclable'],
          p.cpx_toponyme_voie_verte && [p.cpx_toponyme_voie_verte, 'voie verte'],
        ].filter(Boolean);
        for (const [nom, nature] of noms) {
          const k = `${nature}|${nom}`;
          if (!groupes.has(k)) groupes.set(k, { nom, nature, geoms: [] });
          groupes.get(k).geoms.push(f.geometry);
        }
      }
      for (const [k, g] of groupes) objets.push({ c: 'route', cle: k, nom: g.nom, nature: g.nature, geometry: fusionnerGeometries(g.geoms) });
    } catch (e) { echecs.push(`route (${e?.message})`); }
  })();
  await Promise.all([...parCouche, routes]);
  if (echecs.length) console.warn(`[demo-generate] répertoire ${code} : couche(s) indisponible(s) ${echecs.join(', ')}`);

  /* Un objet SANS NOM ne peut être désigné que s'il est le seul de son espèce
     dans la commune : « le monument aux morts », « le pumptrack ». Deux églises
     sans nom ne se distinguent pas, elles restent hors du répertoire. Un objet
     nommé en plusieurs morceaux (un lieu-dit coupé par une route) forme un
     seul lieu. */
  const especes = new Map();
  for (const o of objets) if (!o.nom) especes.set(`${o.c}|${o.nature}`, (especes.get(`${o.c}|${o.nature}`) || 0) + 1);
  const parNom = new Map();
  /* Le lieu qui porte le nom de la commune est son bourg entier. Le désigner
     revient à colorier toute l'agglomération pour un chantier ponctuel, ce que
     la phase s'interdit (voir l'étage des quartiers IRIS, retiré pour cela) :
     à Noyal, un ensemble de logements sans adresse y était rattaché. */
  const nomCommune = unaccentLower(communes[0].properties?.nom_officiel || '');
  for (const o of objets) {
    if (!o.nom && (!o.nature || especes.get(`${o.c}|${o.nature}`) !== 1)) continue;
    if (o.nom && unaccentLower(o.nom) === nomCommune) continue;
    const k = `${o.c}|${o.nom ? unaccentLower(o.nom) : o.nature}`;
    if (!parNom.has(k)) parNom.set(k, { c: o.c, nom: o.nom, nature: o.nature, cles: [], geoms: [] });
    const l = parNom.get(k);
    l.cles.push(o.cle); l.geoms.push(o.geometry);
  }
  const lieux = []; const geometries = new Map();
  const ordre = [...parNom.values()].sort((a, b) => a.c.localeCompare(b.c) || (a.nom || a.nature).localeCompare(b.nom || b.nature, 'fr'));
  for (const l of ordre) {
    const cle = `${l.c}:${l.cles.sort().join('+')}`;
    lieux.push({ n: l.nom || `${l.nature} (sans nom, le seul de la commune)`, t: l.nom ? l.nature : '', c: l.c, k: cle });
    geometries.set(cle, fusionnerGeometries(l.geoms));
  }
  return { lieux, geometries, couchesEnEchec: echecs.length };
}

/* Le répertoire reste en mémoire le temps du processus. En production, chaque
   tranche peut tourner dans une invocation neuve : il est alors relevé de
   nouveau, et les lieux y sont retrouvés par leur clé, pas par leur rang. */
const _repertoires = new Map();
async function repertoireIgnDe(code) {
  if (!_repertoires.has(code)) {
    const r = await releverLeRepertoire(code);
    _repertoires.set(code, r);
  }
  return _repertoires.get(code);
}

/* Le répertoire complet : les lieux de l'IGN, puis les opérations nommées de
   l'open data quand la recette en désigne (voir recetteOuverte). Une source
   muette n'empêche pas l'autre de servir : sans la BD TOPO, les opérations de
   l'open data situent encore ce qu'elles nomment. */
const _repertoiresComplets = new Map();
async function repertoireDe(code, recette = null) {
  if (!recette?.length) return repertoireIgnDe(code);
  const cle = `${code}|${recette.map((r) => `${r.url}|${r.champ}`).join('|')}`;
  if (!_repertoiresComplets.has(cle)) {
    const [ign, ouverts] = await Promise.all([
      repertoireIgnDe(code).catch((e) => ({ erreur: e })),
      lieuxOuverts(code, recette).catch((e) => {
        console.warn(`[demo-generate] open data à relire indisponible pour ${code} :: ${e?.message}`);
        return { lieux: [], geometries: new Map() };
      }),
    ]);
    if (ign.erreur && !ouverts.lieux.length) throw ign.erreur;
    const base = ign.erreur ? { lieux: [], geometries: new Map(), couchesEnEchec: COUCHES_REPERTOIRE.length } : ign;
    _repertoiresComplets.set(cle, {
      ...base,
      lieux: [...base.lieux, ...ouverts.lieux],
      geometries: new Map([...base.geometries, ...ouverts.geometries]),
      lieuxOuverts: ouverts.lieux.length,
    });
  }
  return _repertoiresComplets.get(cle);
}

/* ─── Opérations d'aménagement de l'open data des collectivités ───

   La BD TOPO nomme les voies et les équipements, pas les opérations. À Noyal,
   la ZAC Centre-Ville et la ZAC de l'Ise, attestées par le site de la commune,
   restaient sans lieu. Les périmètres de ZAC du Géoportail de l'urbanisme
   existent, mais sans nom, et les rapprocher des projets par l'IA (surface,
   rues, distance) s'est trompé deux fois sur trois. Les NOMS de ces opérations
   sont publiés par les collectivités elles-mêmes, dans leur open data, que le
   catalogue national data.gouv.fr moissonne.

   On procède en quatre temps, sans aucun portail ni aucun jeu désigné à
   l'avance :
   1. les organisations du catalogue qui SONT la commune ou son
      intercommunalité, reconnues à leur SIREN (celui que donne geo.api.gouv.fr)
      et non à leur nom, qui ramène aussi des homonymes ;
   2. l'IA lit les titres et le début des descriptions de tous leurs jeux, et
      retient ceux qui décrivent des opérations d'aménagement ;
   3. le code télécharge la part de chaque jeu retenu qui couvre la commune,
      quand le jeu offre une ressource lisible sans dépendance (export GeoJSON
      Opendatasoft, WFS ou OGC API Features filtrés sur la boîte de la commune,
      ou fichier GeoJSON), et ne garde que les objets situés dans la commune ;
   4. l'IA désigne, sur un échantillon des propriétés, le champ qui porte le
      nom de l'opération.
   Les objets ainsi nommés rejoignent le répertoire avec leur vraie géométrie.

   Ce qui a été jugé une fois (jeux, adresses de téléchargement, champ du nom)
   forme la « recette », petite et sérialisable, qui voyage dans l'état de la
   phase : une tranche qui tourne dans une invocation neuve retélécharge les
   objets sans refaire juger l'IA, et y retrouve les mêmes clés. Là où rien
   n'est publié, la recette est vide et le répertoire reste celui de l'IGN. */
const DATAGOUV_API = 'https://www.data.gouv.fr/api/1';
const OUVERT_TIMEOUT_MS = 8000;
// Toute la découverte tient dans une tranche, à côté du relevé de l'IGN qui tourne en même temps
const OUVERT_BUDGET_MS = 17000;
const OUVERT_CATALOGUE_MAX_BYTES = 12000000;
const OUVERT_JEU_MAX_BYTES = 8000000;
// Jeux de données d'une organisation lus en une requête : plus que n'en publie la plus fournie des métropoles
const OUVERT_JEUX_PAR_ORGANISATION = 1000;
const OUVERT_JEUX_MAX = 8;
const OUVERT_LIEUX_PAR_JEU_MAX = 80;
const OUVERT_DESCRIPTION_CHARS = 80;
const OUVERT_DESCRIPTION_JUGEE_CHARS = 300;
// Échantillon montré à l'IA pour chaque champ : assez pour reconnaître un nom, peu pour rester bref
const OUVERT_ECHANTILLON_VALEURS = 8;
const OUVERT_VALEUR_CHARS = 50;

// Commune telle que la connaît l'administration : SIREN, intercommunalité, contour exact
const _communesAdministratives = new Map();
async function communeAdministrative(code) {
  if (!_communesAdministratives.has(code)) {
    const r = await fetchWithTimeout(`https://geo.api.gouv.fr/communes/${encodeURIComponent(code)}?fields=nom,siren,epci,departement,contour&geometry=contour`, { headers: UA }, OUVERT_TIMEOUT_MS);
    if (!r.ok) throw new Error(`geo.api.gouv.fr http=${r.status}`);
    const c = await lireJson(r, OUVERT_TIMEOUT_MS, 4000000);
    if (!c?.contour) throw new Error('contour de la commune introuvable');
    _communesAdministratives.set(code, c);
  }
  return _communesAdministratives.get(code);
}

async function catalogue(chemin, champs, maxBytes = 2000000) {
  const r = await fetchWithTimeout(`${DATAGOUV_API}${chemin}`, { headers: { ...UA, 'X-Fields': champs } }, OUVERT_TIMEOUT_MS);
  if (!r.ok) throw new Error(`data.gouv.fr http=${r.status}`);
  return lireJson(r, OUVERT_TIMEOUT_MS, maxBytes);
}

/* Les organisations qui publient AU NOM de la commune ou de son
   intercommunalité. Le nom ne sert qu'à chercher ; c'est le SIREN, porté par le
   SIRET de l'organisation, qui décide. Une métropole publie parfois sous deux
   organisations (Rennes Métropole en a deux, de même SIREN) : on garde les deux.
   L'intercommunalité est cherchée aussi sous son nom distinctif : la
   « CA Vienne Condrieu » des données officielles s'appelle « Vienne Condrieu
   Agglomération » au catalogue, et le sigle seul suffit à ne rien trouver. */
async function organisationsDuTerritoire(admin) {
  const recherches = [
    admin.siren && { siren: admin.siren, q: admin.nom },
    admin.epci?.code && { siren: admin.epci.code, q: admin.epci.nom },
    admin.epci?.code && nomDistinctifEpci(admin.epci.nom) !== admin.epci.nom && { siren: admin.epci.code, q: nomDistinctifEpci(admin.epci.nom) },
  ].filter(Boolean);
  const trouvees = await Promise.all(recherches.map(async (t) => {
    const q = new URLSearchParams({ q: t.q, page_size: '50' });
    const d = await catalogue(`/organizations/?${q}`, 'data{id,name,business_number_id}').catch(() => null);
    return (d?.data || []).filter((o) => String(o.business_number_id || '').replace(/\s/g, '').startsWith(t.siren));
  }));
  const parId = new Map();
  for (const o of trouvees.flat()) parId.set(o.id, o);
  return [...parId.values()];
}

async function jeuxDesOrganisations(organisations) {
  const listes = await Promise.all(organisations.map(async (o) => {
    const q = new URLSearchParams({ organization: o.id, page_size: String(OUVERT_JEUX_PAR_ORGANISATION) });
    const d = await catalogue(`/datasets/?${q}`, 'data{id,title,description,resources{format,url,mime}}', OUVERT_CATALOGUE_MAX_BYTES)
      .catch((e) => { console.warn(`[demo-generate] jeux de ${o.name} illisibles :: ${e?.message}`); return null; });
    return (d?.data || []).map((j) => ({ ...j, organisation: o.name }));
  }));
  const parId = new Map();
  for (const j of listes.flat()) if (!parId.has(j.id)) parId.set(j.id, j);
  return [...parId.values()];
}

/* La ressource d'un jeu qu'on sait lire SANS DÉPENDANCE, et surtout qu'on sait
   restreindre à la commune avant de la télécharger. Ce sont des protocoles, pas
   des portails : l'export d'Opendatasoft, le WFS et l'OGC API Features filtrent
   par boîte côté serveur ; un fichier GeoJSON se lit entier, sous un plafond.
   Un shapefile zippé ou un service sans GeoJSON ne sont pas lisibles ici. */
function ressourceLisible(jeu) {
  const lisibles = [];
  for (const res of jeu.resources || []) {
    const url = String(res.url || '');
    if (!isSafePublicUrl(url)) continue;
    let u;
    try { u = new URL(url); } catch { continue; }
    const params = new Map([...u.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
    if (/\/api\/explore\/v2\.1\/catalog\/datasets\/[^/]+\/exports\/geojson\/?$/.test(u.pathname)) lisibles.push({ mode: 'opendatasoft', url, rang: 0 });
    else if (/^getfeature$/i.test(params.get('request') || '') && /json/i.test(params.get('outputformat') || '')) lisibles.push({ mode: 'wfs', url, rang: 1 });
    else if (/\/collections\/[^/]+\/items\/?$/.test(u.pathname)) lisibles.push({ mode: 'ogcapi', url, rang: 2 });
    else if (/geojson/i.test(`${res.format} ${res.mime}`) || /\.geojson$/i.test(u.pathname)) lisibles.push({ mode: 'fichier', url, rang: 3 });
  }
  return lisibles.sort((a, b) => a.rang - b.rang)[0] || null;
}

function boiteDe(contour) {
  const pts = pointsDe(contour);
  return {
    minLng: Math.min(...pts.map((p) => p[0])), maxLng: Math.max(...pts.map((p) => p[0])),
    minLat: Math.min(...pts.map((p) => p[1])), maxLat: Math.max(...pts.map((p) => p[1])),
  };
}

// L'adresse qui ne télécharge que la boîte de la commune, quand le protocole le permet
async function adresseDansLaBoite(res, b) {
  const u = new URL(res.url);
  if (res.mode === 'opendatasoft') {
    // Le filtre porte sur le champ point du jeu, dont le nom varie : la fiche du jeu le donne
    const fiche = await fetchWithTimeout(res.url.replace(/\/exports\/geojson\/?$/, ''), { headers: UA }, OUVERT_TIMEOUT_MS);
    if (!fiche.ok) throw new Error(`fiche Opendatasoft http=${fiche.status}`);
    const champs = (await lireJson(fiche, OUVERT_TIMEOUT_MS, 2000000)).fields || [];
    const point = champs.find((f) => f.type === 'geo_point_2d')?.name;
    if (point) u.searchParams.set('where', `in_bbox(${point}, ${b.minLat}, ${b.minLng}, ${b.maxLat}, ${b.maxLng})`);
  } else if (res.mode === 'wfs') {
    for (const k of [...u.searchParams.keys()]) if (/^(bbox|srsname)$/i.test(k)) u.searchParams.delete(k);
    // En WFS 2.0, l'URN du système de référence impose l'ordre latitude, longitude dans la boîte
    u.searchParams.set('BBOX', `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng},urn:ogc:def:crs:EPSG::4326`);
    u.searchParams.set('SRSNAME', 'EPSG:4326');
  } else if (res.mode === 'ogcapi') {
    u.searchParams.set('bbox', `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`);
    u.searchParams.set('limit', '1000');
  }
  return u.toString();
}

/* Les objets d'un jeu situés dans la commune : l'un de leurs sommets tombe dans
   son contour exact (la boîte du téléchargement déborde sur les voisines). Un
   jeu plus lourd que le plafond est ignoré plutôt que tronqué. */
const _objetsOuverts = new Map();
async function objetsDansLaCommune(url, contour) {
  if (!_objetsOuverts.has(url)) {
    const r = await fetchWithTimeout(url, { headers: { ...UA, Accept: 'application/geo+json, application/json' } }, OUVERT_TIMEOUT_MS);
    if (!r.ok) throw new Error(`http=${r.status}`);
    const d = await lireJson(r, OUVERT_TIMEOUT_MS, OUVERT_JEU_MAX_BYTES);
    const objets = (d?.features || []).filter((f) => f?.geometry?.coordinates && pointsDe(f.geometry).some((pt) => contientPoint(contour, pt)));
    _objetsOuverts.set(url, objets);
  }
  return _objetsOuverts.get(url);
}

const PRESELECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { jeux: { type: 'array', items: { type: 'integer' } } },
  required: ['jeux'],
};

/* Premier tri, sur le catalogue entier : il ne reçoit que des titres et des
   débuts de description, d'où un modèle léger, car une métropole publie
   plusieurs centaines de jeux. C'est la longueur de la liste qui fait la durée
   (près de 700 jeux à Rennes Métropole : de 6 à 13 s en un seul appel, mesuré
   le 10/11/2026) ; elle part donc en lots parallèles, dont les choix sont pris
   à tour de rôle, le premier de chaque lot d'abord. Ce tri ratisse large : le
   modèle léger retient aussi des jeux hors sujet (à Bègles, une « trame noire »
   et des zones de collecte des déchets), que le jugement final écarte en
   voyant leurs objets. */
const OUVERT_CHOIX_LOT = 200;
const OUVERT_CANDIDATS_PAR_LOT = 8;
const OUVERT_CANDIDATS_MAX = 16;
async function preselectionnerLesJeux(admin, jeux) {
  const lots = [];
  for (let k = 0; k < jeux.length; k += OUVERT_CHOIX_LOT) lots.push(jeux.slice(k, k + OUVERT_CHOIX_LOT));
  const choix = await Promise.all(lots.map((lot) => preselectionnerUnLot(admin, lot).catch((e) => {
    console.warn(`[demo-generate] tri des jeux ouverts indisponible pour ${lot.length} jeu(x) :: ${e?.message}`);
    return [];
  })));
  const candidats = [];
  for (let rang = 0; candidats.length < OUVERT_CANDIDATS_MAX && choix.some((c) => c.length > rang); rang++) {
    for (const c of choix) if (c[rang] && candidats.length < OUVERT_CANDIDATS_MAX) candidats.push(c[rang]);
  }
  return candidats;
}

async function preselectionnerUnLot(admin, jeux) {
  const liste = jeux.map((j, i) => `${i}|${j.title}|${String(j.description || '').replace(/\s+/g, ' ').slice(0, OUVERT_DESCRIPTION_CHARS)}`).join('\n');
  const system = `Tu prépares la carte des projets d'aménagement de la commune de ${admin.nom}. Voici des jeux de données ouverts publiés par la commune et par son intercommunalité (${admin.epci?.nom || 'aucune'}), un par ligne : index|titre|début de la description.

Donne l'index des jeux dont les objets peuvent être des secteurs, des opérations ou des tracés d'aménagement désignés par un nom propre : zones d'aménagement concerté, opérations ou programmes d'aménagement, projets urbains, secteurs de renouvellement urbain, secteurs d'orientations d'aménagement d'un plan local d'urbanisme, itinéraires cyclables en projet. Les plus prometteurs d'abord, ${OUVERT_CANDIDATS_PAR_LOT} au plus. Liste vide si aucun ne convient.`;
  const out = await openAIStructured([{ role: 'system', content: system }, { role: 'user', content: liste }],
    'jeux_amenagement', PRESELECTION_SCHEMA, 200, 15000, 0, OPENAI_MODEL_LIGHT, 1);
  return [...new Set((out.jeux || []).filter((i) => Number.isInteger(i) && jeux[i]))].slice(0, OUVERT_CANDIDATS_PAR_LOT).map((i) => jeux[i]);
}

const JUGEMENT_JEUX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    jeux: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer' },
          operations: { type: 'boolean', description: 'Vrai si les objets du jeu sont des opérations, des secteurs de projet ou des tracés d\'aménagement, faux sinon.' },
          nature: { type: 'string', description: 'Ce que sont les objets du jeu, en quelques mots au singulier (par exemple « zone d\'aménagement concerté »).' },
          champ: { type: 'string', description: 'Le champ dont la valeur est le nom propre de l\'opération ou du projet, recopié. Chaîne vide si aucun champ ne porte un tel nom.' },
          valeurs: { type: 'string', enum: ['nom propre de chaque operation', 'categorie partagee par beaucoup d\'objets', 'aucun champ'], description: 'Ce que sont les valeurs du champ choisi.' },
        },
        required: ['index', 'operations', 'nature', 'champ', 'valeurs'],
      },
    },
  },
  required: ['jeux'],
};

/* Le jugement final, sur pièces : le titre, la description, et un échantillon
   des propriétés des objets situés dans la commune. L'IA dit si ce sont des
   opérations d'aménagement, et quel champ porte leur nom : les jeux ne
   s'accordent sur aucun nom de champ (« nomzac », « nomopa », « label_long »,
   « nom »). Le code vérifie que le champ désigné existe bien. */
async function jugerLesJeux(admin, jeux) {
  const descriptions = jeux.map(({ jeu, objets }, index) => {
    const valeurs = new Map();
    for (const f of objets) {
      for (const [k, v] of Object.entries(f.properties || {})) {
        if (v === null || v === '' || typeof v === 'object') continue;
        if (!valeurs.has(k)) valeurs.set(k, new Set());
        valeurs.get(k).add(String(v).slice(0, OUVERT_VALEUR_CHARS));
      }
    }
    /* Un nom s'écrit en lettres : un champ dont aucune valeur ne contient trois
       lettres de suite (nombres, dates, codes) n'en porte pas, inutile de le
       montrer. */
    const champs = {};
    for (const [k, s] of valeurs) {
      if (![...s].some((v) => /\p{L}{3}/u.test(v))) continue;
      champs[k] = { valeurs_distinctes: s.size, exemples: [...s].slice(0, OUVERT_ECHANTILLON_VALEURS) };
    }
    return {
      index, titre: jeu.title,
      description: String(jeu.description || '').replace(/\s+/g, ' ').slice(0, OUVERT_DESCRIPTION_JUGEE_CHARS),
      objets_dans_la_commune: objets.length, champs,
    };
  });
  const system = `Voici des jeux de données ouverts qui couvrent la commune de ${admin.nom}, avec un échantillon des propriétés de leurs objets situés dans la commune. Ils serviront à situer sur une carte les projets d'aménagement de la commune.

Pour chaque jeu, dis d'abord si ses objets sont des opérations, des secteurs de projet ou des tracés d'aménagement (zone d'aménagement concerté, opération ou programme d'aménagement, projet urbain, renouvellement urbain, secteur d'orientations d'aménagement, itinéraire cyclable) : un parc, une trame écologique, un équipement existant, une zone de collecte ou un zonage réglementaire n'en sont pas.

Dis ensuite quel champ porte le NOM PROPRE de chaque objet (« ZAC des Prés », « Secteur Gare », « Réseau express vélo n° 3 ») : pas un code, pas un identifiant, pas une nature ou un type générique, pas une date, pas un nom de commune, et pas le simple nom de la rue où se trouve l'objet. Un nom propre distingue un objet des autres : un champ qui range les objets en quelques catégories (niveau de réseau, type, état, maître d'ouvrage) n'en porte pas, même si ses valeurs ont des majuscules. Quand plusieurs champs en portent un, choisis celui de l'opération d'ensemble plutôt que celui d'un lot ou d'un îlot. Chaîne vide si aucun champ ne porte un tel nom. Dis enfin ce que sont les valeurs du champ choisi : le nom propre de chaque opération, ou une catégorie que partagent beaucoup d'objets (compare le nombre de valeurs distinctes au nombre d'objets).`;
  const out = await openAIStructured([{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(descriptions) }],
    'jugement_jeux', JUGEMENT_JEUX_SCHEMA, 200 + 120 * jeux.length, 15000, 0, OPENAI_MODEL, 1);
  const parIndex = new Map((out.jeux || []).map((x) => [x.index, x]));
  return jeux.map((_, i) => {
    const x = parIndex.get(i);
    if (!x) return { motif: 'non jugé' };
    if (!x.operations) return { motif: 'pas des opérations' };
    if (!x.champ || !descriptions[i].champs[x.champ] || !/^nom propre/.test(x.valeurs)) return { motif: 'aucun champ ne porte de nom' };
    return { champ: x.champ, nature: String(x.nature || '').trim().slice(0, 90) };
  });
}

/* La recette : rend [{ id, titre, nature, url, champ }], vide là où
   rien n'est publié ou lisible. Les mesures de chaque étape partent au journal. */
async function recetteOuverte(code) {
  const t0 = Date.now();
  const admin = await communeAdministrative(code);
  const organisations = await organisationsDuTerritoire(admin);
  if (!organisations.length) { console.log(`[demo-generate] open data ${admin.nom} : aucune organisation de la commune ni de l'intercommunalité au catalogue`); return []; }
  const jeux = await jeuxDesOrganisations(organisations);
  const tCatalogue = Date.now() - t0;
  if (!jeux.length) return [];
  const candidats = await preselectionnerLesJeux(admin, jeux);
  const tTri = Date.now() - t0;
  const boite = boiteDe(admin.contour);
  const lus = await Promise.all(candidats.map(async (jeu) => {
    const res = ressourceLisible(jeu);
    if (!res) return { jeu, motif: 'aucune ressource lisible' };
    try {
      const url = await adresseDansLaBoite(res, boite);
      const objets = await objetsDansLaCommune(url, admin.contour);
      return objets.length ? { jeu, url, objets } : { jeu, motif: 'aucun objet dans la commune' };
    } catch (e) { return { jeu, motif: `illisible (${e?.message})` }; }
  }));
  const exploitables = lus.filter((r) => r.objets);
  const tTelechargement = Date.now() - t0;
  const verdicts = exploitables.length ? await jugerLesJeux(admin, exploitables) : [];
  const recette = [];
  exploitables.forEach((r, i) => {
    const v = verdicts[i];
    if (v.champ && recette.length < OUVERT_JEUX_MAX) recette.push({ id: r.jeu.id, titre: r.jeu.title, nature: v.nature, url: r.url, champ: v.champ });
    else r.motif = v.motif || 'au-delà du plafond';
  });
  console.log(`[demo-generate] open data ${admin.nom} : ${organisations.map((o) => o.name.trim()).join(', ')} ; ${jeux.length} jeux au catalogue ; candidats : ${lus.map((r) => `« ${r.jeu.title} » (${r.motif || `${r.objets.length} objets, retenu`})`).join(', ') || 'aucun'} ; ${recette.length} dans la recette ; catalogue ${tCatalogue} ms, tri ${tTri} ms, téléchargements ${tTelechargement} ms, fin ${Date.now() - t0} ms`);
  return recette;
}

/* La découverte ne doit jamais retarder la localisation : passé son budget,
   la phase continue avec le seul répertoire de l'IGN, et rien n'est perdu
   qu'une source facultative. */
async function recetteOuverteBornee(code) {
  let minuteur;
  const delai = new Promise((ok) => { minuteur = setTimeout(() => {
    console.warn(`[demo-generate] open data ${code} : découverte abandonnée après ${OUVERT_BUDGET_MS} ms`);
    ok([]);
  }, OUVERT_BUDGET_MS); });
  try {
    return await Promise.race([recetteOuverte(code).catch((e) => {
      console.warn(`[demo-generate] open data ${code} indisponible :: ${e?.message}`);
      return [];
    }), delai]);
  } finally { clearTimeout(minuteur); }
}

/* Les lieux de la recette. Les objets qui portent le même nom dans un même jeu
   forment un seul lieu (une ZAC multisite, les lots d'une opération) ; un objet
   sans nom ne se distingue pas et reste dehors. La clé tient au jeu et au nom,
   pas au rang : elle se retrouve d'une invocation à l'autre. */
async function lieuxOuverts(code, recette) {
  const admin = await communeAdministrative(code);
  const lieux = []; const geometries = new Map();
  await Promise.all(recette.map(async (r) => {
    let objets;
    try { objets = await objetsDansLaCommune(r.url, admin.contour); } catch (e) {
      console.warn(`[demo-generate] open data « ${r.titre} » indisponible :: ${e?.message}`);
      return;
    }
    const parNom = new Map();
    for (const f of objets) {
      const nom = String(f.properties?.[r.champ] ?? '').replace(/\s+/g, ' ').trim();
      const cle = unaccentLower(nom);
      if (!nom || cle === unaccentLower(admin.nom)) continue;
      if (!parNom.has(cle)) parNom.set(cle, { nom, geoms: [] });
      parNom.get(cle).geoms.push(f.geometry);
    }
    for (const [cle, l] of [...parNom].slice(0, OUVERT_LIEUX_PAR_JEU_MAX)) {
      const k = `ouvert:${r.id}:${cle}`;
      lieux.push({ n: l.nom, t: r.nature, c: 'operation', k });
      geometries.set(k, fusionnerGeometries(l.geoms));
    }
  }));
  lieux.sort((a, b) => a.t.localeCompare(b.t, 'fr') || a.n.localeCompare(b.n, 'fr'));
  return { lieux, geometries };
}

/* ─── Rattachement des projets au répertoire, par l'IA ─── */
const RATTACHEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rattachements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projet: { type: 'integer' },
          situation: { type: 'string', description: 'Les mots de la source qui disent où se fait CE projet, recopiés (rue, équipement, secteur, angle de rues, lieux-dits). Chaîne vide si la source ne le dit pas.' },
          lieux: {
            type: 'array',
            description: 'Le ou les lieux du répertoire qui sont le projet ou qui le portent. Liste vide si aucun.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'integer' },
                nom: { type: 'string', description: 'Le nom du lieu tel qu\'il est écrit dans le répertoire, recopié.' },
              },
              required: ['index', 'nom'],
            },
          },
          croisement: { type: 'boolean', description: 'Vrai si le projet est à l\'angle des deux voies données dans lieux.' },
          adresse_du_projet: { type: 'boolean', description: 'Vrai si l\'adresse numérotée fournie pour ce projet est bien celle où il se fait (et non celle d\'un guichet, du siège d\'un maître d\'ouvrage ou d\'un lieu de consultation).' },
        },
        required: ['projet', 'situation', 'lieux', 'croisement', 'adresse_du_projet'],
      },
    },
  },
  required: ['rattachements'],
};
/* Au-delà, la liste de projets d'un même appel est découpée en lots envoyés
   en parallèle. Chaque lot relit le répertoire entier, mais c'est la longueur
   de la RÉPONSE qui fait la durée : à Vienne, un lot de 22 projets (800 jetons
   en sortie) a dépassé 18 s et sa reprise a porté la tranche à 27 s. Un seul
   essai par tranche : un lot qui n'a pas répondu est repris à la suivante. */
const RATTACHEMENT_LOT = 15;
const RATTACHEMENT_TIMEOUT_MS = 19000;
const RATTACHEMENT_LIEUX_MAX = 4;
/* Le modèle du rattachement, le poste le plus cher de la génération (un
   répertoire de 10 000 à 17 000 jetons relu à chaque lot). Il reste sur
   gpt-4o, mesures du 10/11/2026 à l'appui.
   Rejoué sur les états réels de fin1 (quatre communes, 117 projets, même
   répertoire et mêmes extraits pour chaque modèle) :
   - gpt-4.1, 20 % moins cher, rattache 103 projets au même lieu que gpt-4o.
     Il en gagne quelques-uns (la mairie de Faugères, l'angle avenue Berthelot
     et quai Pasteur du city stade d'Estressin, la ZAC Centre-ville de Noyal)
     et en perd (le boulevard du Rhône rabattu sur la rue du Rhône du centre,
     l'école neuve de Faugères posée sur la salle du Palais de Bacchus). Mais
     il recopie dans « situation » des phrases entières là où gpt-4o donne le
     nom du lieu (« restauration de l'église Saint-Christophe de Faugères »
     contre « Église Saint-Christophe », « Travaux sur le pont de la Seiche »
     contre « Pont de la Seiche »), et il la remplit pour des projets que
     gpt-4o laisse sans lieu (« jardin communautaire », « zone inondable »).
     Or cette situation est la requête du dernier recours, Nominatim : en
     génération complète, l'église Saint-Christophe, projet de référence de
     Faugères, est restée sans emplacement ;
   - gpt-4.1-mini laisse cinq projets de Noyal sans lieu (dont l'église
     Saint-Léonard et la D82 du réseau express vélo) et en place trois à faux
     à Vienne (square Albert Vassy, boulevard des Alpes, Estressin).
   Le cache d'OpenAI aurait pu diviser le prix du répertoire, identique d'un
   lot à l'autre : avec une clé de routage (prompt_cache_key) et le deuxième
   lot envoyé 0,8 s, 1,5 s, 4 s puis 9 s après le premier, gpt-4.1 n'a servi
   aucun jeton depuis son cache, gpt-4.1-mini 7 000 sur 9 000. Les essais
   n'ont pas porté sur gpt-4o. */
const RATTACHEMENT_MODEL = process.env.DEMO_RATTACHEMENT_MODEL || OPENAI_MODEL;
/* L'extrait entier part à l'IA (1 800 signes autour de la citation) : le
   cœur seul coupait justement les phrases qui situent. Mesuré à Noyal : « à
   l'angle de la rue du Gué et de la rue des Thermes » (Dialog) et la liste
   des secteurs du chantier d'eau potable tombaient hors des 700 signes gardés. */
async function rattacherUnLot(commune, lieux, projets) {
  const liste = lieux.map((l, i) => `${i}|${l.n}${l.t ? `|${l.t}` : ''}`).join('\n');
  const system = `Tu situes des projets de la commune de ${commune.nom} sur sa carte. Voici le répertoire des lieux de la commune relevés dans les données nationales de l'IGN et dans l'open data des collectivités (opérations d'aménagement, zones d'aménagement concerté, secteurs de projet), un par ligne : index|nom|nature.

${liste}

Pour chaque projet, recopie d'abord dans « situation » les mots de la source qui disent où il se fait. Puis donne dans « lieux » l'index et le nom recopié de chaque lieu du répertoire nommé dans cette situation, et d'abord du lieu du répertoire qui EST le projet ou qui le porte : la voie où ont lieu les travaux, l'équipement construit ou rénové, la zone d'activités, le quartier ou le lieu-dit aménagé, la route numérotée qu'emprunte une liaison. Un quartier ou une ZAC dont le nom manque au répertoire n'empêchent pas le rattachement : donne les voies que la source cite comme celles de ce quartier ou de ce projet (voies nouvelles, voies aménagées). Un même lieu peut s'écrire autrement dans la source (« RD82 » pour « D82 », « école Le Chat Perché » pour « École Primaire le Chat Perche ») : rattache-le quand même. Le répertoire décrit la commune d'aujourd'hui : un équipement récent peut y figurer déjà, et un objet sans nom y est désigné par sa nature quand il est le seul de son espèce dans la commune. Quand le projet couvre plusieurs voies ou plusieurs sites nommés, donne-les tous, ${RATTACHEMENT_LIEUX_MAX} au plus.

Quand la source situe le projet à l'angle ou au carrefour de deux voies du répertoire, donne ces deux voies dans « lieux » et mets « croisement » à vrai ; sinon « croisement » est faux.

Laisse « lieux » vide quand aucun lieu du répertoire ne porte le projet. Ne choisis jamais un lieu que la source cite à propos d'autre chose, un lieu voisin faute de mieux, ni l'adresse d'un guichet, d'une permanence ou d'un lieu où l'on consulte un dossier : une position fausse est pire qu'une absence.`;
  const user = JSON.stringify(projets.map(({ k, p }) => ({
    projet: k,
    titre: p.title,
    lieu: p.place || '',
    adresse: p.address || '',
    requete: p.geo_query || '',
    extrait: String(p.source_excerpt || '').replace(/\s+/g, ' '),
  })), null, 1);
  const out = await openAIStructured([{ role: 'system', content: system }, { role: 'user', content: user }],
    'rattachement_lieux', RATTACHEMENT_SCHEMA, 200 + 120 * projets.length, RATTACHEMENT_TIMEOUT_MS, 0, RATTACHEMENT_MODEL, 1);
  return out.rattachements || [];
}

/* L'index rendu par l'IA est contrôlé par le nom qu'elle recopie. Dans une
   liste de plusieurs centaines de lieux classés par ordre alphabétique, elle
   se trompe parfois d'une ligne : à Noyal, « rue des Thermes », écrite en
   toutes lettres dans sa propre réponse, est revenue avec l'index de la rue
   des Voyageurs, sa voisine dans la liste. Quand nom et index divergent, le
   nom fait foi s'il désigne exactement une entrée ; sinon le lieu est ignoré. */
function indexVerifie(lieux, { index, nom }) {
  const cle = unaccentLower(nom).replace(/[^a-z0-9]+/g, ' ').trim();
  const nomDe = (l) => unaccentLower(l.n).replace(/[^a-z0-9]+/g, ' ').trim();
  if (Number.isInteger(index) && lieux[index] && nomDe(lieux[index]) === cle) return index;
  const memes = lieux.map((l, i) => (nomDe(l) === cle ? i : -1)).filter((i) => i >= 0);
  return memes.length === 1 ? memes[0] : -1;
}

/* Rend, pour chaque indice de projet demandé, { lieux: [index valides],
   adresse: bool }, ou null quand le lot n'a pas pu être traité. Le code
   VÉRIFIE la réponse : un index hors de la liste est ignoré, jamais deviné. */
async function rattacherAuxLieux(commune, lieux, projets, indices) {
  const nLots = Math.max(1, Math.ceil(indices.length / RATTACHEMENT_LOT));
  const taille = Math.ceil(indices.length / nLots);
  const lots = [];
  for (let k = 0; k < indices.length; k += taille) lots.push(indices.slice(k, k + taille));
  const resultat = new Map();
  await Promise.all(lots.map(async (lot) => {
    try {
      const reponses = await rattacherUnLot(commune, lieux, lot.map((i) => ({ k: i, p: projets[i] })));
      for (const r of reponses) {
        if (!lot.includes(r.projet)) continue;
        const valides = [...new Set((r.lieux || []).map((x) => indexVerifie(lieux, x)).filter((x) => x >= 0))]
          .slice(0, RATTACHEMENT_LIEUX_MAX);
        resultat.set(r.projet, { lieux: valides, croisement: !!r.croisement && valides.length === 2, adresse: !!r.adresse_du_projet, situation: String(r.situation || '').slice(0, 200) });
      }
      // Un projet oublié par la réponse est traité comme « aucun lieu »
      for (const i of lot) if (!resultat.has(i)) resultat.set(i, { lieux: [], croisement: false, adresse: false });
    } catch (e) {
      console.warn(`[demo-generate] rattachement aux lieux indisponible pour ${lot.length} projet(s) :: ${e?.message}`);
      for (const i of lot) resultat.set(i, null);
    }
  }));
  return resultat;
}

/* Requêtes de localisation d'un projet, de la plus fiable à la plus faible :
   adresse postale relevée dans la source, requête optimisée par l'IA, lieu,
   lieux nommés lus littéralement dans le texte, et le titre en DERNIER.

   Elles ne servent plus qu'au dernier étage, la BAN, pour les projets que le
   répertoire des lieux n'a pas portés. Le titre reste en dernier : c'est la
   formulation la plus faible de toutes, un titre d'opération décrit ce qu'on
   fait, pas où. « Construction des pistes de padel », soumis tel quel à un
   annuaire, ne pouvait rendre qu'un résultat au hasard (la punaise fausse de
   Conflans). */
function locationQueries(project, communeNom = '') {
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
  const texte = project.source_excerpt;
  const horsGuichet = (x) => (adresseDeGuichet(x, texte) ? '' : x);
  const address = horsGuichet(project.address);
  const geoQuery = horsGuichet(project.geo_query);
  const place = horsGuichet(project.place);
  const aUnLieuNomme = [address, geoQuery, place]
    .some((x) => motsSignificatifs(String(x || ''), communeNom).size > 0);
  const candidats = [
    address,
    geoQuery, sansPrefixeGenerique(geoQuery),
    place, sansPrefixeGenerique(place),
    ...(aUnLieuNomme ? [] : odonymesDe(texte).filter((o) => !adresseDeGuichet(o, texte))),
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
    if (!motsSignificatifs(t, communeNom).size) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/* L'adresse d'un GUICHET n'est pas celle d'un projet.

   Une page d'enquêtes publiques dit où consulter le dossier, pas où se fait le
   projet. Mesuré sur Mazamet : « aux services techniques, 63 rue des Cordes »
   a servi d'emplacement à la centrale hydroélectrique de Gaillardou, à six
   kilomètres de là dans la montagne, et la rue des Cordes à l'aire de
   valorisation du patrimoine, qui couvre tout le centre ancien. Le premier
   rendez-vous de démonstration se tenait justement avec le responsable de ce
   centre technique.

   Le test est étroit pour ne pas écarter un vrai lieu de chantier : l'adresse
   doit suivre IMMÉDIATEMENT le nom du guichet (« en mairie, place Gambetta »,
   « sise 1 place Georges Tournier »). « La mairie engage des travaux rue
   Voltaire » reste un emplacement. Une adresse citée au moins une fois hors de
   ce contexte est conservée. */
const GUICHET_AVANT_RE = /(?:services? techniques?|services? municipaux|service de l'urbanisme|centre technique municipal|en mairie|a la mairie|hotel de ville|sise?|situee?s?|siege|permanences?|registres?|accueil)\W{0,4}(?:(?:au|a la|a l'|du|de la|le|la)\s+)?(?:\d{1,4}\s*(?:bis|ter)?\s+)?$/;

function adresseDeGuichet(lieu, texte) {
  const cible = unaccentLower(lieu).replace(/\s+/g, ' ').trim();
  if (cible.length < 6) return false;
  const t = unaccentLower(texte).replace(/\s+/g, ' ');
  let vu = false;
  for (let at = t.indexOf(cible); at >= 0; at = t.indexOf(cible, at + 1)) {
    if (!GUICHET_AVANT_RE.test(t.slice(Math.max(0, at - 60), at))) return false;
    vu = true;
  }
  return vu;
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
      const m = await inspectMairieSite(site, commune.nom, echeanceMairie);
      m.position = position;
      /* Site protege contre la lecture automatique : on le dit franchement,
         plutot que de laisser croire a une commune sans projets. La generation
         continue sur la presse et les marches publics. */
      if (m.bloque) {
        step('mairie', 'skip', 'Site officiel de la mairie',
          m.injoignable
            ? `${m.host} ne répond pas pour le moment · recensement poursuivi sur la presse et les marchés publics`
            : `${m.host} bloque la lecture automatique · recensement poursuivi sur la presse et les marchés publics`);
        return m;
      }
      /* Identité visuelle : une finition, sautée passé l'échéance, `m.logoUrl`
         portant déjà le meilleur candidat du scoring texte. */
      const enRetard = Date.now() >= echeanceMairie;
      if (enRetard) m.tronque = true;
      const identite = enRetard || !((m.logoCandidats || []).length || (m.iconeCandidats || []).length)
        ? null
        : await choisirLogoEtCouleur(m.logoCandidats, m.iconeCandidats);
      /* La vision tranche entre les candidats du scoring texte puis les
         icones du site ; le scoring reste le repli quand elle echoue. Un
         logo .svg, qu'elle ne sait pas lire, garde la priorite sur une icone :
         c'est le cas le plus frequent du vrai logo. Ce qu'elle a REGARDE et
         ecarte sort de la cascade d'installation : jusqu'ici, un logo blanc
         refuse par le juge etait tout de meme installe en repli, et l'icone
         generique d'un module prenait la place quand la recherche ne rendait
         rien. */
      const svg = (m.logoCandidats || []).find((u) => /\.svg(\?|#|$)/i.test(u)) || null;
      if (identite?.source === 'logo') {
        m.logoUrl = identite.logoUrl;
      } else if (identite?.source === 'icone') {
        m.logoCandidats = svg ? [svg] : [];
        m.iconeUrl = identite.logoUrl;
        m.logoUrl = svg || identite.logoUrl;
      } else if (identite?.source === 'aucun') {
        m.logoCandidats = svg ? [svg] : [];
        m.iconeUrl = null;
        m.logoUrl = svg;
      }
      // La meta theme-color du site prime : c'est la couleur que la commune a
      // elle-même déclarée. La vision ne sert qu'à défaut.
      if (!m.themeColor && identite?.themeColor) m.themeColor = identite.themeColor;
      if (m.host) finding({ kind: 'logo', title: m.host, iconUrl: m.logoUrl, color: m.themeColor });
      const bits = [];
      if (m.host) bits.push(m.host);
      if (m.logoUrl) bits.push('logo récupéré');
      if (m.themeColor) bits.push('couleurs de la commune extraites');
      if (m.pages.length > 1) bits.push(`${m.pages.length - 1} page(s) projets lue(s)`);
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
    // logoCandidats VOYAGE : la phase de création réessaie sur les suivants si
    // le meilleur ne se télécharge pas. Sans cette liste, un délai dépassé
    // suffisait à priver l'espace du logo de la commune.
    mairie: {
      host: mairie.host,
      // Elle cadre la carte publiée : voir la création de l'espace
      position: mairie.position || null,
      logoUrl: mairie.logoUrl,
      logoCandidats: (mairie.logoCandidats || []).slice(0, 4),
      iconeUrl: mairie.iconeUrl || null,
      themeColor: mairie.themeColor,
      /* Les documents officiels se remplissent au fil de la lecture : chacun est
         retenu par le modele qui vient de lire la page ou il figure, et il
         garde l'adresse de cette page pour etre propose au bon projet. */
      pdfs: mairie.pdfs,
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
// Priorite d'une candidate dont l'intitule annonce une operation, des le tri
const PRIORITE_OPERATION = 2;

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
    /* Un intitule qui annonce a lui seul une operation passe en tete, juste
       apres les pages qu'une page de projets recommande : 97 des 120 pages
       ainsi designees ont donne un projet au rejeu du tri (voir
       ecarterLesHorsSujet). Les autres restent en file, a lire ensuite. */
    for (const l of gardees) file.ajouter(l.url, l.label, l.operation ? PRIORITE_OPERATION : 0);
    file.marquerVue(racine);
    explo.siteHierarchique = gardees.siteHierarchique
      ?? candidates.filter((l) => estUnCarrefour(l.url)).length <= CARREFOURS_MAX;
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

  /* Les liens DECOUVERTS en lisant passent par le meme tri que les candidates
     de depart. Ils entraient sans aucun filtre, et c'est par eux que la
     lecture se perdait : mesure le 10/11/2026 sur vienne.fr, une fois les
     candidates triees, 128 pages decouvertes ont encore ete lues, dont 104
     pour rien ; 94 etaient des fiches « /download/... » recommandees par les
     pages d'urbanisme (zonages du PLU, dossiers d'antennes relais,
     reglements). Le tri se fait par paquet, en tete de tranche, sur ce que la
     tranche precedente a recolte. */
  if (explo.aTrier?.length) {
    const paquet = explo.aTrier;
    explo.aTrier = [];
    const gardees = await ecarterLesHorsSujet(commune.nom, paquet, {
      hierarchique: explo.etage === 'epci' ? true : (explo.siteHierarchique ?? true),
    });
    for (const l of gardees) file.ajouter(l.url, l.label, Math.max(l.priorite || 0, l.operation ? PRIORITE_OPERATION : 0));
    console.log(`[demo-generate] liens decouverts : ${paquet.length} soumis au tri, ${paquet.length - gardees.length} ecarte(s)`);
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
  /* Empreintes des textes deja lus, pour ne jamais payer deux fois la meme
     page servie sous deux adresses. Elles voyagent en tableau dans l'etat
     serialise, d'une tranche a l'autre. */
  const empreintes = new Set(explo.empreintes || []);
  /* Liens decouverts pendant cette tranche, en attente du tri. Une adresse
     deja en file ou deja lue n'y passe pas : elle ne fait que remonter sa
     priorite, comme avant. */
  const aTrier = new Map();
  const proposer = (l, priorite) => {
    if (file.connue(l.url)) { file.ajouter(l.url, l.label, priorite); return; }
    if (!estUnePageExplorable(l.url, file.hote)) return;
    const cle = normaliserUrl(l.url);
    const deja = aTrier.get(cle);
    if (deja) deja.priorite = Math.max(deja.priorite, priorite);
    else aTrier.set(cle, { url: l.url, label: l.label, priorite });
  };

  /* Lecture d'un document PDF de la commune. Il passe par la meme lecture
     qu'une page, tranche par tranche (voir lirePdf), et rend un resultat de la
     meme forme : sans gabarit a apprendre, sans liens ni visuels a suivre. */
  const lireUnDocument = async (candidate) => {
    const lu = await lirePdf(commune, candidate).catch(() => null);
    if (!lu) return { ecartee: true };
    if (process.env.DEMO_DUMP) console.log(`[demo-pages] ${lu.projets.length} projet(s) | document | ${candidate.url}`);
    return {
      candidate, page: { url: candidate.url, data: '' }, lu, texte: lu.texte.slice(0, PAGE_TEXT_BRUT_CHARS),
      echantillon: null, horsSieges: [], images: [], blocs: [],
    };
  };

  const lireUne = async (candidate) => {
    // Un PDF choisi parmi les documents du site part directement a sa lecture
    if (estUnPdf(candidate.url)) return lireUnDocument(candidate);
    const page = await fetchCapped(candidate.url, { headers: UA }, 6000, 400000);
    if (!page) return { echec: candidate };
    /* Une page de la mairie qui redirige HORS du site n'est pas une page de
       la mairie : la lire la verserait a l'allowlist d'attestation, et une
       fiche pourrait citer un site tiers comme source officielle. */
    if (hostOf(page.url) !== hostOf(`https://${hoteEtage}`)) return { ecartee: true };
    /* La MEME page sous une autre adresse. Une redirection mene souvent
       plusieurs adresses du sitemap vers une seule page : sur
       saintgenislaval.fr, 88 adresses « decision-ndeg2025-... » redirigent
       toutes vers la liste des actes administratifs, qui etait lue 89 fois. L'adresse d'arrivee est marquee vue des la reception (ce
       passage est synchrone, deux lecteurs ne peuvent pas la reclamer
       ensemble), et une adresse d'arrivee deja vue n'est pas relue. Le
       controle precede celui du type : un meme document servi sous deux
       adresses n'est pas lu deux fois non plus. */
    if (normaliserUrl(page.url) !== candidate.cle) {
      if (file.dejaOuverte(page.url)) return { ecartee: true, doublon: page.url };
      file.marquerVue(page.url);
    }
    /* Ce qui n'est pas du HTML n'est pas une page : un PDF servi sans
       extension (saintgenislaval.fr/print/pdf/node/415 rend application/pdf)
       passait par stripHtml et partait a la lecture sous forme d'octets
       compresses. Mesure le 10/11/2026 : 20 lectures de ce genre sur ce seul
       site, aucune n'a rien donne. Un PDF ainsi reconnu part a la lecture des
       documents, a son adresse d'arrivee ; le reste est ecarte. Le texte deja
       recu, borne et decode comme du texte, n'est pas un PDF exploitable :
       lirePdf le recharge en octets. */
    const type = String(page.headers?.get?.('content-type') || '');
    if (/application\/(x-)?pdf/i.test(type)) return lireUnDocument({ ...candidate, url: page.url });
    if (type && !/html|xml|text\//i.test(type)) return { ecartee: true };
    const brut = stripHtml(page.data).slice(0, PAGE_TEXT_BRUT_CHARS);
    /* Meme texte, meme page, quelle que soit l'adresse : les CMS publient une
       page sous son alias et sous son chemin technique sans redirection. */
    const empreinte = createHash('sha1').update(brut).digest('hex').slice(0, 16);
    if (empreintes.has(empreinte)) return { ecartee: true, doublon: page.url };
    empreintes.add(empreinte);
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
    /* Les documents de la page partent AVEC elle au jugement : c'est le seul
       moment ou quelqu'un a sous les yeux a la fois le texte de la page et la
       liste de ses fichiers. Tous ceux qu'on a croises sont aussi rendus, pour
       le choix des documents a lire une fois le site epuise. */
    const documentsVus = collectPdfLinks(page.data, page.url, DOCS_PAR_PAGE_VUS);
    const documents = documentsVus.slice(0, PDF_PAR_PAGE_MAX);

    try {
      const lu = await lirePage(commune, { url: page.url, title: candidate.label, text: texte }, nouveaux, 'mairie', documents);
      if (process.env.DEMO_DUMP) {
        // Rendement page par page : la matiere premiere du reglage de l'arret
        console.log(`[demo-pages] ${lu.projets.length} projet(s) | interet ${lu.interet} | ${candidate.priorite > 0 ? 'chaude' : 'froide'} | ${page.url}`);
      }
      /* L'echantillon de gabarit ne part qu'avec une lecture ABOUTIE : verse
         avant l'appel, une page remise en file apres echec retrouvait son
         propre texte dans le gabarit a la relecture, et en ressortait vide. */
      return {
        candidate, page, lu, texte, documentsVus,
        echantillon: brut.slice(0, 4000),
        horsSieges: nouveaux.slice(PAGE_LIENS_SOUMIS),
        images: extractImageUrls(page.data, page.url, 24),
        blocs: extractPageBlocks(page.data, page.url),
      };
    } catch (e) {
      console.warn(`[demo-generate] lecture impossible : ${candidate.url} :: ${e?.message}`);
      // La page sera relue : son texte ne doit pas passer pour deja lu
      empreintes.delete(empreinte);
      return { echec: candidate };
    }
  };

  // Ce qu'une page lue apporte : projets, dossiers, liens a suivre, visuels.
  const traiter = (r) => {
    explo.pagesLues++;
    /* Une trouvaille PAR page lue : le compteur de sources de l'ecran dit
       le vrai compte (il comptait une vague de cinq pour une), et le fil
       montre chaque page ouverte au lieu d'un cumul. */
    send({ type: 'finding', kind: 'page', title: r.candidate.label || r.page.url, domain: hostOf(r.page.url) });
    // Un document n'a pas d'echantillon : il ne porte pas le gabarit du site
    if (r.echantillon && (explo.echantillons = explo.echantillons || []).length < GABARIT_ECHANTILLONS) {
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
      // Les dates de la page, relevees pendant qu'on l'a en main : la selection en a besoin
      if (r.page?.data) { p.page_publiee = dateDePublication(r.page.data); p.page_modifiee = dateDeMiseAJour(r.page.data); }
      explo.bruts.push(p);
      send({ type: 'ai-item', phase: 'ai1', title: p.title, quote: (p.evidence_quote || '').slice(0, 220), domain: hostOf(p.source_url) });
    }
    /* Les dossiers que la lecture a reconnus sur cette page. Ils sont deja
       juges pertinents : ils entrent tels quels, avec l'adresse de leur page,
       et se montrent a l'ecran au fur et a mesure. */
    for (const d of r.lu.dossiers || []) {
      if (state.mairie.pdfs.length >= PDF_TOTAL_MAX) break;
      if (state.mairie.pdfs.some((p) => p.url === d.url)) continue;
      state.mairie.pdfs.push(d);
      send({ type: 'finding', kind: 'pdf', title: d.label, domain: 'document officiel' });
    }
    /* Les liens que cette page recommande. La priorite ne decide plus de ce
       qu'on lira - la file est destinee a etre videe - seulement de l'ordre :
       une page designee par une page de projets a des chances de donner plus
       vite, autant commencer par elle. */
    for (const l of r.lu.suivants) proposer(l, PRIORITE[r.lu.interet] ?? 1);
    /* Tous les PDF croises sont notes : quand le site sera epuise, un seul
       jugement choisira ceux qui valent d'etre lus. */
    for (const d of r.documentsVus || []) {
      const vus = (explo.docsVus = explo.docsVus || []);
      if (vus.length >= DOCS_VUS_MAX) break;
      if (!vus.some((x) => x.url === d.url)) vus.push({ url: d.url, label: d.label || '', page: r.candidate.label || '' });
    }
    /* Les liens qu'on n'a PAS pu soumettre au modele, au-dela des 60 sieges,
       n'en disparaissent pas pour autant : sur une page qui parle
       d'amenagement, ils entrent en file a priorite basse. Elle est faite
       pour etre videe, et ses gardes bornent deja le cout. */
    if (r.lu.interet !== 'nulle' && r.horsSieges?.length) {
      for (const l of r.horsSieges) proposer(l, 0);
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
  };

  /* LECTEURS EN CONTINU, et non plus par vagues. Une vague de cinq attendait
     la plus lente de ses cinq pages avant d'en ouvrir une sixieme : une page
     lente (site qui traine, reprise de l'IA) immobilisait quatre places. Ici,
     cinq lecteurs puisent chacun dans la file des qu'ils ont fini, ce qui
     garde exactement cinq connexions ouvertes au plus, la mesure de
     VAGUE_TAILLE, sans temps mort. Chaque lecteur prend la meilleure
     candidate du moment : une page qui vient d'en recommander d'autres les
     fait passer devant sans attendre la fin d'une vague. */
  let enCours = 0;
  const enAttente = [];
  const reveiller = () => { while (enAttente.length) enAttente.shift()(); };
  const peutOuvrir = () => Date.now() - t0 < PHASE_BUDGET_MS
    && explo.pagesLues + enCours < EXPLO_PAGES_MAX
    && (!assezDeMatiere() || explo.repechageFait);
  const lecteur = async () => {
    while (peutOuvrir()) {
      const [candidate] = file.vague(1);
      if (!candidate) {
        // File vide pour l'instant : une lecture en cours peut encore la nourrir
        if (!enCours) break;
        await new Promise((ok) => enAttente.push(ok));
        continue;
      }
      enCours++;
      let r = null;
      try { r = await lireUne(candidate); } catch { r = { echec: candidate }; }
      enCours--;
      /* Les pages en echec sont MISES DE COTE, et ne retournent en file qu'a la
         FIN de la tranche : remises immediatement, elles restaient en tete du
         classement et etaient repiochees quelques secondes plus tard, dans la
         meme fenetre de coupure, ou leur seconde chance se consumait pour rien.
         Ce sont precisement les pages les plus prioritaires qui mouraient en
         premier. */
      if (r?.echec) echecs.push(r.echec);
      else if (r) traitees++;
      if (r?.doublon && process.env.DEMO_DUMP) console.log(`[demo-doublon] ${candidate.url} -> ${r.doublon}`);
      if (r && !r.echec && !r.ecartee) traiter(r);
      reveiller();
    }
    reveiller();
  };
  await Promise.all(Array.from({ length: VAGUE_TAILLE }, lecteur));
  explo.empreintes = [...empreintes];
  explo.aTrier = [...aTrier.values()];

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
    // Les liens decouverts pas encore tries font partie de ce qui reste
    const candidates = [...restantes.candidates.values(), ...(explo.aTrier || [])];
    explo.aTrier = [];
    const enOr = await repecherLesTitresEnOr(commune.nom, candidates);
    if (enOr.length) {
      /* La file du repechage prend l'hote de l'etage en cours : pendant
         l'etage intercommunal, une file a l'hote de la mairie refusait les
         pages repechees, qui ne sont pas sur son site. */
      const garde = new FileExploration({ hote: hoteEtage });
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
    explo.file = new FileExploration({ hote: hoteEtage }).serialiser();
  }

  /* Site de la commune epuise sans abondance (file vide et aucun lien en
     attente de tri) : c'est le moment de lire ses documents. Un seul
     jugement, sur le grand modele, avec la date du jour et la liste de ce que
     le site a deja livre : c'est lui qui decide si des documents valent
     encore d'etre lus, et lesquels. */
  if (!file.restantes && !explo.aTrier.length && !etageEpci && !explo.docsChoisis && !assezDeMatiere()
    && explo.tours < EXPLO_TOURS_MAX && (explo.docsVus || []).length) {
    explo.docsChoisis = true;
    const choisis = await choisirLesDocumentsALire(commune, explo.docsVus, explo.bruts.map((b) => b.title));
    explo.docsVus = [];
    const suite = FileExploration.restaurer(explo.file);
    let ajoutes = 0;
    for (const d of choisis) if (suite.ajouter(d.url, d.label, PRIORITE.forte + 1, { document: true })) ajoutes++;
    if (ajoutes) {
      explo.file = suite.serialiser();
      console.log(`[demo-generate] documents : ${ajoutes} PDF a lire sur le site de ${commune.nom}`);
      step('ai1', 'done', 'Lecture en cours', `site parcouru, lecture de ${ajoutes} document(s) officiel(s) : procès-verbaux, bulletins, dossiers`);
      state.__continue = true;
      return state;
    }
  }

  // Le site n'est parcouru que si la file ET les liens en attente de tri sont vides
  let fini = (!file.restantes && !explo.aTrier.length)
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

/* RAPPROCHEMENT ET VÉRIFICATION, en un seul jugement sur le fond.

   La lecture page par page décrit la même opération autant de fois qu'elle a
   de pages : la rubrique des projets, l'actualité qui annonce le chantier,
   l'arrêté de circulation, le plan de financement, l'avis de marché,
   l'inauguration. Elle laisse aussi passer ce qui n'a rien à faire sur une
   carte de projets (une antenne relais d'opérateur, un élagage, un projet de
   la commune voisine).

   Ces deux questions étaient traitées à part et sur les seuls titres : un tri
   lexical (mots communs, liste de mots sans caractère), un arbitrage des paires
   en doute, puis un contrôle des « résidus ». Mesure sur Vienne : 101
   descriptions donnaient 205 paires en doute, et la requalification de la
   place de l'Hôtel de Ville, lue sur trois pages, a été fondue dans la place
   François Mitterrand puis écartée. À Noyal, « Les Robinsons » et
   « Construction d'un nouvel accueil de loisirs », le même équipement,
   restaient deux fiches : rien dans les titres ne le disait, tout dans les
   descriptions.

   L'IA reçoit donc toutes les descriptions avec leur lieu, leur adresse, leur
   texte et leur page, et rend en une passe les opérations réelles (leurs
   membres, leur nom, la description qui les présente le mieux) et, pour
   chaque description écartée, sa raison. Le code ne juge rien : il vérifie que
   la réponse couvre chaque description une fois et une seule, puis fond. */
const RAPPROCHEMENT_MODEL = process.env.DEMO_RAPPROCHEMENT_MODEL || 'gpt-4.1';
/* Descriptions jugées dans un même appel. Au-delà, la liste est découpée en
   lots qui gardent ensemble les descriptions d'une même page, puis les
   opérations des lots sont rapprochées entre elles par le même jugement.
   Mesure sur Vienne : 108 descriptions en un seul appel, toutes rangées (une
   seule rangée deux fois, corrigée), pour 12 000 jetons lus. Le plafond reste
   proche de ce qui a été mesuré : au-delà, rien ne dit encore qu'un appel
   lit aussi bien le milieu de la liste. */
const RAPPROCHEMENT_LOT_MAX = Number(process.env.DEMO_RAPPROCHEMENT_LOT_MAX) || 120;
const RAISONS_D_ECART = {
  pas_une_operation: 'pas une opération d\'aménagement',
  hors_commune: 'hors de la commune',
  acte_administratif: 'simple acte administratif',
};
const RAPPROCHEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          membres: { type: 'array', items: { type: 'integer' }, description: 'Index de TOUTES les descriptions de cette opération.' },
          principal: { type: 'integer', description: 'Index, parmi les membres, de la description qui présente le mieux l\'opération dans son ensemble.' },
          titre: { type: 'string', description: 'Nom de l\'opération.' },
        },
        required: ['membres', 'principal', 'titre'],
      },
    },
    ecartes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer' },
          raison: { type: 'string', enum: Object.keys(RAISONS_D_ECART) },
          precision: { type: 'string', description: 'Quelques mots qui disent ce que c\'est.' },
        },
        required: ['index', 'raison', 'precision'],
      },
    },
  },
  required: ['operations', 'ecartes'],
};

function consigneRapprochement(communeNom) {
  return `Tu prépares la carte des projets d'aménagement de ${communeNom}. La lecture du site de la commune, de celui de son intercommunalité, des avis de marchés publics et de la presse a relevé les descriptions numérotées qui suivent. Une même opération y figure souvent plusieurs fois, parce que plusieurs pages en parlent : la présentation du projet, chaque étape du chantier, ses tranches, son plan de financement, sa concertation, l'arrêté qui ferme la rue pendant les travaux, l'avis de marché, l'inauguration.

Range chaque description, une fois et une seule, soit dans une opération, soit parmi les descriptions écartées.

Une opération est un aménagement physique et durable d'un lieu situé à ${communeNom} : construire, rénover, agrandir, requalifier un bâtiment, une voie, une place, un parc, un équipement ou un quartier, que ce soit annoncé, en cours ou livré récemment. Les petites opérations comptent aussi (une aire de jeux, la réfection d'une rue, une borne de recharge) : sur la carte d'un village, ce sont souvent les seules.

Mets dans la même opération toutes les descriptions du même objet au même endroit, même quand leurs titres ne se ressemblent pas : lis les descriptions, c'est là que tu verras qu'un équipement nommé par son nom propre et « la construction d'un nouvel équipement » près du même groupe scolaire sont la même chose. Un arrêté, un plan de financement, un avis de marché, une étude, un diagnostic, des fouilles, une protection réglementaire ou une concertation qui portent sur une opération de la liste rejoignent cette opération au lieu d'être écartés.

Deux objets distincts restent deux opérations, même voisins, même annoncés sur la même page et dans les mêmes termes : deux opérations qui portent chacune leur nom propre (deux zones d'aménagement, deux places, deux programmes de logements de maîtres d'ouvrage différents), une école et la rue qui la dessert, deux bâtiments d'un même quartier. Ne fonds deux descriptions que si elles désignent manifestement le même objet. Dans le doute, laisse-les séparées : fondre deux opérations en efface une de la carte.

Écarte une description, avec sa raison, seulement quand elle ne décrit aucune opération et ne se rattache à aucune opération de la liste :
- pas_une_operation : un événement, une animation, la présentation d'un équipement qui existe déjà (horaires, fonctionnement), un service, une aide, l'entretien courant (élagage, traitement des arbres, nettoyage), une réparation ponctuelle, ou l'intervention d'un opérateur ou d'un concessionnaire de réseau (antenne relais, électricité, gaz, télécommunications) ;
- hors_commune : l'opération se situe dans une autre commune ;
- acte_administratif : un acte qui ne s'accompagne d'aucun aménagement décrit dans la liste (un changement de stationnement ou de sens de circulation, une procédure ou une protection réglementaire sans travaux).

Donne à chaque opération le nom le plus juste, celui qu'un habitant reconnaît : ce qu'on fait et où, avec le nom propre de l'opération ou de l'équipement quand une description le donne (par exemple « Requalification de la place du Marché » ou « Construction de l'école des Tilleuls »). Une phrase nominale, sans le nom de la commune, sans date, sans tiret long, sans majuscules autres que celles des noms propres et des sigles. Le principal est la description qui présente le mieux l'opération dans son ensemble, de préférence une page de la commune plutôt qu'un avis de marché ou un arrêté.`;
}

/* Les lots gardent ensemble les descriptions d'une même page : une page qui
   décrit trois opérations voisines doit être lue d'un seul tenant pour qu'on
   les distingue. Les pages restent dans l'ordre de la lecture. */
function lotsParPage(projets, taille) {
  const parPage = new Map();
  for (const p of projets) {
    const cle = normaliserUrl(p.source_url);
    if (!parPage.has(cle)) parPage.set(cle, []);
    parPage.get(cle).push(p);
  }
  const lots = [];
  let courant = [];
  for (const groupe of parPage.values()) {
    if (courant.length && courant.length + groupe.length > taille) { lots.push(courant); courant = []; }
    courant.push(...groupe);
  }
  if (courant.length) lots.push(courant);
  return lots;
}

/* Un seul appel sur une liste qui tient dans un lot. La réponse est vérifiée
   avant d'être crue : une description revendiquée deux fois reste dans la
   première opération qui la nomme, une description à la fois rangée et écartée
   reste rangée, et une description oubliée devient une opération à elle seule.
   Dans les trois cas, le biais est de garder : une fiche de trop se voit, une
   fiche perdue ne se voit pas. */
async function jugerLeRapprochement(commune, projets) {
  const liste = projets.map((p, i) => ({
    index: i,
    titre: p.title || '',
    lieu: p.geo_query || p.place || '',
    adresse: p.address || '',
    description: p.description || '',
    page: p.source_url || '',
    ...(p.origine === 'marche' ? { avis_de_marche_du: p.marcheDate || '' } : {}),
    ...(p.origine === 'presse' ? { presse: true } : {}),
  }));
  let out;
  try {
    out = await openAIStructured(
      [{ role: 'system', content: consigneRapprochement(commune.nom) }, { role: 'user', content: JSON.stringify(liste) }],
      'rapprochement_operations', RAPPROCHEMENT_SCHEMA, 600 + 60 * projets.length, 150000, 0, RAPPROCHEMENT_MODEL, 3
    );
  } catch (e) {
    /* Sans jugement, chaque description garde sa fiche : des doublons se
       voient sur la carte, une opération effacée ne se voit pas. */
    console.warn(`[demo-generate] rapprochement indisponible, ${projets.length} description(s) gardees telles quelles :: ${e?.message}`);
    out = { operations: [], ecartes: [] };
  }

  const n = projets.length;
  const range = new Array(n).fill(false);
  const anomalies = { doubles: 0, oublies: 0, horsListe: 0 };
  const groupes = [];
  for (const op of out.operations || []) {
    const membres = [];
    for (const i of op.membres || []) {
      if (!Number.isInteger(i) || i < 0 || i >= n) { anomalies.horsListe++; continue; }
      if (range[i]) { if (!membres.includes(i)) anomalies.doubles++; continue; }
      range[i] = true;
      membres.push(i);
    }
    if (!membres.length) continue;
    const principal = membres.includes(op.principal) ? op.principal : membres[0];
    groupes.push({ membres: membres.map((i) => projets[i]), principal: projets[principal], titre: String(op.titre || '').trim() });
  }
  const ecartes = [];
  for (const e of out.ecartes || []) {
    const i = e.index;
    if (!Number.isInteger(i) || i < 0 || i >= n) { anomalies.horsListe++; continue; }
    if (range[i]) { anomalies.doubles++; continue; }
    range[i] = true;
    ecartes.push({ projet: projets[i], raison: e.raison, precision: String(e.precision || '').trim() });
  }
  for (let i = 0; i < n; i++) {
    if (range[i]) continue;
    anomalies.oublies++;
    groupes.push({ membres: [projets[i]], principal: projets[i], titre: '' });
  }
  if (anomalies.doubles || anomalies.oublies || anomalies.horsListe) {
    console.warn(`[demo-generate] rapprochement : reponse corrigee sur ${n} descriptions (${anomalies.doubles} rangee(s) deux fois, ${anomalies.oublies} oubliee(s), ${anomalies.horsListe} index hors liste)`);
  }
  /* Chaque opération garde la trace de TOUTES ses descriptions, avec la page
     et la date de chacune : la sélection qui suit juge l'opération sur ce que
     disent ses pages, la plus récente comprise, et non sur la seule description
     retenue par la fusion (la plus longue, souvent la plus ancienne). */
  const lues = (p) => p.descriptions_lues || [{
    titre: p.title || '', description: p.description || '', page: p.source_url || '',
    publiee: p.page_publiee || '', modifiee: p.page_modifiee || '', avis_du: p.marcheDate || '',
  }];
  return {
    projets: groupes.map((g) => ({
      ...fondre(g.membres, { titre: g.titre, principal: g.principal }),
      descriptions_lues: g.membres.flatMap(lues),
    })),
    ecartes,
  };
}

/**
 * Regroupe les descriptions par opération réelle et écarte ce qui n'en est pas.
 * Au-delà d'un lot, chaque lot est jugé à part, puis les opérations obtenues
 * sont rapprochées entre elles : une opération décrite par deux pages tombées
 * dans deux lots différents se retrouve ainsi au second tour.
 * @returns {Promise<{projets: Array<Object>, ecartes: Array<Object>}>}
 */
async function rapprocherLesDescriptions(commune, projets) {
  if (!projets.length) return { projets: [], ecartes: [] };
  if (projets.length <= RAPPROCHEMENT_LOT_MAX) return jugerLeRapprochement(commune, projets);
  const lots = lotsParPage(projets, RAPPROCHEMENT_LOT_MAX);
  const resultats = await inChunks(lots, 2, (lot) => jugerLeRapprochement(commune, lot));
  const operations = resultats.flatMap((r) => r.projets);
  const ecartes = resultats.flatMap((r) => r.ecartes);
  /* Le second tour ne porte que sur des opérations déjà fondues. S'il n'en
     réduit pas le nombre en dessous de la liste de départ, on s'arrête là :
     redécouper la même liste tournerait en rond. */
  if (operations.length >= projets.length) return { projets: operations, ecartes };
  const second = await rapprocherLesDescriptions(commune, operations);
  return { projets: second.projets, ecartes: [...ecartes, ...second.ecartes] };
}

/* DATES DES PAGES, pour la sélection.

   La lecture relève la date de publication et de mise à jour de chaque page
   qu'elle a en main ; il reste les pages de la presse, et les descriptions
   reprises d'un état enregistré avant ce relevé. Leur page est relue ici, une
   fois (la lecture est partagée avec la rédaction), dans un temps borné : une
   page qui ne répond pas laisse sa description sans date, ce que la sélection
   sait traiter. Les PDF ne sont pas relus : leur date de fichier n'est pas
   celle de leur contenu, qui l'écrit lui-même. */
const DATATION_BUDGET_MS = 10000;
async function daterLesPages(projets) {
  const aDater = [...new Set(projets
    .filter((p) => !p.page_publiee && !p.page_modifiee && p.origine !== 'marche' && /^https?:\/\//.test(p.source_url || '') && !estUnPdf(p.source_url))
    .map((p) => p.source_url))];
  if (!aDater.length) return;
  const dates = new Map();
  await inChunks(aDater, 8, async (url) => {
    const lu = await Promise.race([lireSource(url), new Promise((ok) => setTimeout(() => ok(null), 8000))]);
    if (lu) dates.set(url, lu);
  }, Date.now() + DATATION_BUDGET_MS);
  for (const p of projets) {
    const lu = dates.get(p.source_url);
    if (lu && !p.page_publiee && !p.page_modifiee) { p.page_publiee = lu.publiee || ''; p.page_modifiee = lu.modifiee || ''; }
  }
}

/* SÉLECTION DES PROJETS DE LA CARTE.

   Le rapprochement range les descriptions par opération ; il ne dit pas si
   l'opération a sa place sur la carte. Mesure du banc du 10/11/2026 (quatre
   communes, juges stricts) : environ une fiche sur deux était du remplissage.
   Cinq micro-fiches découpées dans une page de petits travaux de l'été 2025 à
   Saint-Genis-Laval (coussins berlinois, fosses d'arbres, un passage piéton),
   des pages de présentation de parcs (un city-stade rénové en 2024, des vignes
   plantées en 2013, un parcours santé de 2022), l'aire d'accueil des gens du
   voyage de Noyal ouverte en 2010, les moulins de Faugères restaurés en 1998.

   L'IA juge donc chaque opération sur trois questions, dans cet ordre : où en
   est-elle aujourd'hui (d'après la plus récente de ses pages, avec sa date),
   quelle est son ampleur à l'échelle de CETTE commune, et un habitant
   l'appellerait-il un projet de sa commune. Le code ne juge rien : il vérifie
   que chaque opération reçoit un verdict, garde celles qui n'en ont pas, et
   classe les gardées par ampleur. Pas de plafond : une ville qui mène trente
   projets réels les montre tous, un village qui en a trois les garde. */
const SELECTION_MODEL = process.env.DEMO_SELECTION_MODEL || RAPPROCHEMENT_MODEL;
const VERDICTS = {
  garder: 'projet de la commune',
  ancienne: 'opération achevée depuis longtemps',
  existant: 'présentation d\'un lieu qui existe',
  entretien: 'entretien ou réparation',
  ponctuelle: 'intervention ponctuelle sans suite',
  proposition: 'proposition sans décision',
  dispositif: 'dispositif ou service, pas un aménagement',
  recapitulatif: 'liste d\'opérations sans aménagement propre',
};
const AMPLEURS = ['structurante', 'notable', 'modeste', 'minime'];
const SELECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer' },
          meme_operation_que: { type: 'integer', description: 'Index d\'une AUTRE opération de la liste qui désigne manifestement le même objet au même endroit, ou -1.' },
          derniere_etape: { type: 'string', description: 'La plus récente étape que les descriptions rapportent, avec sa date telle qu\'elles l\'écrivent ou, à défaut, la date de la page ou du document qui la rapporte. Vide si rien n\'est daté.' },
          date_iso: { type: 'string', description: 'La date de cette étape sous la forme AAAA-MM-JJ, AAAA-MM ou AAAA. Vide si elle n\'est pas datée.' },
          etat: { type: 'string', enum: ['a_l_etude', 'annoncee', 'en_travaux', 'livree', 'abandonnee', 'inconnu'], description: 'Où en est l\'opération AUJOURD\'HUI.' },
          achevement_constate: { type: 'boolean', description: 'true si une description dit que l\'opération est achevée, livrée, ouverte ou inaugurée.' },
          suite_annoncee: { type: 'boolean', description: 'true si une description annonce une suite : une tranche, une phase, un équipement de plus.' },
          operation_d_ensemble: { type: 'boolean', description: 'true pour une opération d\'ensemble menée par tranches sur dix ans et plus (zone d\'aménagement, quartier en renouvellement urbain) ; false pour un bâtiment, une voie, une place, un parc.' },
          ampleur: { type: 'string', enum: AMPLEURS },
          /* La justification vient AVANT le verdict : écrite après, elle ne
             faisait que l'habiller ; écrite avant, elle l'oblige à appliquer
             la consigne (l'étape, sa date face aux bornes, la nature de
             l'opération) de la même façon pour toutes. */
          precision: { type: 'string', description: 'Une phrase qui applique la consigne : l\'étape retenue, sa date comparée aux dates repères, la nature de l\'opération.' },
          verdict: { type: 'string', enum: Object.keys(VERDICTS) },
        },
        required: ['index', 'meme_operation_que', 'derniere_etape', 'date_iso', 'etat', 'achevement_constate', 'suite_annoncee', 'operation_d_ensemble', 'ampleur', 'precision', 'verdict'],
      },
    },
  },
  required: ['operations'],
};

function consigneSelection(commune, aujourdhui) {
  const habitants = commune.population ? ` (${commune.population.toLocaleString('fr-FR')} habitants)` : '';
  /* Les bornes sont des dates calculées ici : comparer deux dates est sûr,
     compter des mois ne l'est pas (mesure sur Noyal : des travaux de novembre
     2024 donnés pour « 12 mois » en novembre 2026). */
  const ilYa = (mois) => { const d = new Date(); d.setMonth(d.getMonth() - mois); return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
  const [dixHuit, deux] = [ilYa(18), ilYa(24)];
  return `Nous sommes le ${aujourdhui}. Tu choisis les opérations qui figureront sur la carte des projets de ${commune.nom}${habitants}. Un élu qui ouvre cette carte doit y reconnaître les projets de sa commune : ce qu'un habitant appellerait un projet de sa commune, en préparation, en cours ou tout juste livré. Une carte encombrée d'opérations finies depuis longtemps, de présentations d'équipements ou de petits travaux de quelques jours cache les vrais projets.

Chaque opération t'est donnée avec toutes les descriptions relevées à son sujet, chacune avec sa page et, quand on la connaît, la date de publication de cette page, la date de sa dernière modification, la date de parution de l'avis de marché, et les documents PDF que porte la page (intitulé et adresse). Rends un verdict pour CHACUNE des opérations, de l'index 0 au dernier, sans en sauter aucune. Juge chaque opération dans l'ordre des champs.

meme_operation_que : le rapprochement qui a formé cette liste laisse parfois le même objet en deux opérations (un équipement nommé par son nom propre et « la construction d'un nouvel équipement » au même endroit). Si une autre opération de la liste désigne manifestement le même objet au même endroit, donne son index ; sinon -1. Deux objets voisins, ou une opération et la rue qui la dessert, restent distincts.

derniere_etape : la plus récente étape que les descriptions rapportent, datée. La date qui compte est celle que la description écrit ; à défaut, la date de publication d'une actualité, ou celle d'un document qui porte sur l'opération (souvent écrite dans son adresse, par exemple « /2022/06/ » pour juin 2022). Une page décrit SON présent, pas le nôtre : ce qu'une page de 2023 annonçait « pour juin » est passé, et une date écrite sans année se lit par rapport à la date de sa page. La date de modification d'une page dit seulement quand la page a été retouchée : une rubrique (finances, travaux, marchés) complétée cette année garde des informations anciennes, et cette date ne date jamais ce que la page décrit.

date_iso : la date de cette étape, sous la forme AAAA-MM-JJ, AAAA-MM ou AAAA (« rentrée 2025 » donne 2025-09, « été 2024 » 2024-07).

etat : où en est l'opération aujourd'hui, d'après cette étape.

achevement_constate, suite_annoncee, operation_d_ensemble : ce que disent les descriptions, sans rien supposer.

ampleur, à l'échelle de cette commune :
- structurante : elle transforme un quartier ou dote la commune d'un équipement majeur (zone d'aménagement, programme de renouvellement urbain, ligne de transport, nouveau groupe scolaire, grand équipement) ;
- notable : un bâtiment construit, agrandi ou rénové en profondeur, une rue, une place ou un parc réaménagé ;
- modeste : un aménagement durable mais limité (aire de jeux, borne de recharge, plateau ralentisseur, réfection d'une rue, rénovation d'un équipement sportif) ;
- minime : une intervention de quelques jours qui ne change pas durablement le lieu.
Dans un village de quelques centaines d'habitants, la réfection d'une rue ou une borne de recharge est notable ; dans une ville de plusieurs dizaines de milliers d'habitants, elle est modeste.

precision : une phrase qui applique la règle du verdict, en comparant la date de l'étape aux dates repères ci-dessous.

verdict :
- garder : un projet en préparation, en cours, ou livré il y a un an environ, c'est-à-dire en ${dixHuit} ou après, ou un projet livré dont une suite est annoncée ;
- ancienne : l'opération a été livrée avant ${dixHuit} et rien n'est annoncé après ; ou bien sa plus récente information est si ancienne que, compte tenu de la durée habituelle de ses études et de ses travaux, une opération de cette nature est forcément achevée depuis plus d'un an : quelques semaines de travaux annoncées avant ${deux}, un plan de financement, une demande de subvention ou un avis de marché de tels travaux daté d'avant ${deux}, un bâtiment dont les études étaient en cours il y a cinq ans ou plus. Ces documents sont datés : leur date suffit à juger. Seule une opération d'ensemble menée par tranches sur dix ans et plus (zone d'aménagement, quartier en renouvellement urbain, programme de renouvellement urbain) ne se tient pour achevée que si une description le dit (livraison, inauguration, clôture), car son échéance annoncée glisse souvent et un programme « jusqu'en 2024 » peut se poursuivre ; un bâtiment, même grand, n'en est pas une ;
- existant : la description présente un lieu ou un équipement qui existe déjà (son histoire, ses usages, son fonctionnement) sans travaux en préparation, en cours ou récents ;
- entretien : de l'entretien courant ou une réparation qui remet un lieu en état sans le transformer, et qu'un habitant de cette commune ne citerait pas comme un projet ;
- ponctuelle : une intervention de quelques jours sans suite (déplacer un ralentisseur, poser des bornes, fermer une rue une journée), même faite par la commune ;
- proposition : une idée soumise au vote ou à l'avis des habitants dont rien ne dit qu'elle a été retenue, ou un souhait sans décision. Une page qui soumet des idées au vote ne dit pas lesquelles l'ont emporté : si une autre description annonce les lauréats, seules celles-là sont des projets ;
- dispositif : une aide, un accompagnement, une campagne auprès des propriétaires, un service ou une démarche qui n'aménage aucun lieu précis ;
- recapitulatif : la description ne fait qu'énumérer des opérations distinctes (programme d'investissement, bilan de mandat, budget) sans décrire un aménagement à elle.

Applique la même mesure à toutes les opérations : deux opérations livrées à la même date reçoivent le même verdict. Une petite commune n'a parfois que trois projets, tous modestes : ce sont ses projets, garde-les. N'écarte une opération pour son âge que si une date le montre : sans date, garde-la. Dans le doute entre garder et écarter, garde.`;
}

/* VÉRIFICATION DE L'ÂGE PAR LE CALCUL.

   L'IA date la dernière étape de chaque opération et dit ce que les
   descriptions constatent ; comparer cette date à celle du jour est un calcul,
   et le code le refait. Mesure du banc du 10/11/2026, sur des consignes qui
   donnaient pourtant les dates repères en clair : l'école Jean Moulin de
   Vienne, livrée à la rentrée 2025, écartée comme ancienne ; un city-stade
   rénové au printemps 2024 gardé ; le renouvellement urbain de la Vallée de
   Gère écarté sur l'échéance « jusqu'en 2024 » d'une page de 2024, alors
   qu'aucune page ne le dit achevé. Le verdict de l'IA est corrigé dans ces
   seuls cas, où il contredit la règle qu'elle a reçue :
   - une opération d'ensemble n'est jamais tenue pour achevée sur une échéance,
     seulement sur un achèvement constaté ;
   - une opération dont la dernière étape a moins de FENETRE_LIVRAISON_MOIS
     n'est pas ancienne ;
   - une opération livrée, constatée achevée, sans suite annoncée, dont la
     livraison a plus de FENETRE_LIVRAISON_MOIS, est ancienne.
   Une date partielle se lit à la fin de sa période (« 2025 » vaut décembre
   2025) : dans le doute, l'opération paraît plus récente, donc gardée.

   La fenêtre traduit le « livré depuis un an environ » du propriétaire : un
   an, et six mois de marge pour l'« environ », ce qui garde une école livrée à
   la rentrée de l'an dernier. */
const FENETRE_LIVRAISON_MOIS = 18;
function ageEnMois(iso) {
  const d = dateIso(iso);
  if (!d) return null;
  const fin = new Date(Date.UTC(Number(d.annee), d.mois ? Number(d.mois) - 1 : 11, d.jour ? Number(d.jour) : 28, 12));
  return (Date.now() - fin.getTime()) / (30.44 * 86400000);
}
function verifierLAge(sel) {
  const age = ageEnMois(sel.date_iso);
  if (sel.verdict === 'ancienne' && sel.operation_d_ensemble && !sel.achevement_constate) {
    sel.verdict = 'garder'; sel.corrige = 'opération d\'ensemble dont aucune description ne constate l\'achèvement';
  } else if (sel.verdict === 'ancienne' && age !== null && age <= FENETRE_LIVRAISON_MOIS) {
    sel.verdict = 'garder'; sel.corrige = `dernière étape datée de ${Math.round(age)} mois`;
  } else if (sel.verdict === 'garder' && sel.etat === 'livree' && sel.achevement_constate && !sel.suite_annoncee
    && !sel.operation_d_ensemble && age !== null && age > FENETRE_LIVRAISON_MOIS) {
    sel.verdict = 'ancienne'; sel.corrige = `livrée il y a ${Math.round(age)} mois, sans suite annoncée`;
  }
}

/**
 * Juge chaque opération : actualité, ampleur, et place sur la carte.
 * @param {Array<{url: string, label: string, page: string}>} pdfs - documents retenus par la lecture, avec leur page
 * @returns {Promise<{gardees: Array<Object>, ecartees: Array<Object>}>}
 */
async function selectionnerLesProjets(commune, operations, pdfs = []) {
  if (!operations.length) return { gardees: [], ecartees: [] };
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateDe = (iso) => (iso ? dateLisible(iso) : '');
  const documentsDe = new Map();
  for (const d of pdfs) {
    const cle = normaliserUrl(d.page || '');
    if (!documentsDe.has(cle)) documentsDe.set(cle, []);
    documentsDe.get(cle).push({ intitule: d.label || nomDeFichier(d.url), adresse: d.url });
  }
  const fiche = (p, i) => ({
    index: i,
    titre: p.title || '',
    lieu: p.place || p.geo_query || '',
    descriptions: (p.descriptions_lues || [{ titre: p.title, description: p.description, page: p.source_url }]).map((d) => ({
      titre: d.titre || '',
      description: d.description || '',
      page: d.page || '',
      ...(d.avis_du ? { avis_de_marche_paru_le: d.avis_du } : {}),
      ...(d.publiee ? { page_publiee_le: dateDe(d.publiee) } : {}),
      ...(d.modifiee && d.modifiee !== d.publiee ? { page_modifiee_le: dateDe(d.modifiee) } : {}),
      ...(documentsDe.get(normaliserUrl(d.page || ''))?.length ? { documents_de_la_page: documentsDe.get(normaliserUrl(d.page || '')).slice(0, 10) } : {}),
    })),
  });
  const juger = (indices) => openAIStructured(
    [{ role: 'system', content: consigneSelection(commune, aujourdhui) }, { role: 'user', content: JSON.stringify(indices.map((i) => fiche(operations[i], i))) }],
    'selection_projets', SELECTION_SCHEMA, 800 + 150 * indices.length, 150000, 0, SELECTION_MODEL, 3
  );
  const verdicts = new Map();
  const ranger = (out, attendus) => {
    for (const v of out?.operations || []) {
      if (attendus.has(v.index) && !verdicts.has(v.index)) verdicts.set(v.index, v);
    }
  };
  const tous = operations.map((_, i) => i);
  try {
    ranger(await juger(tous), new Set(tous));
    /* Une longue liste revient parfois incomplète (mesure sur Noyal : 37
       verdicts pour 46 opérations, les neuf dernières sautées). Les oubliées
       sont jugées une seconde fois, seules, plutôt que gardées d'office. */
    const oubliees = tous.filter((i) => !verdicts.has(i));
    if (oubliees.length) ranger(await juger(oubliees), new Set(oubliees));
  } catch (e) {
    // Sans jugement, ce qui n'en a pas reçu est gardé : une fiche de trop se voit, une fiche perdue ne se voit pas
    console.warn(`[demo-generate] selection incomplete, ${operations.length - verdicts.size} operation(s) gardees sans verdict :: ${e?.message}`);
  }
  operations.forEach((p, i) => {
    const v = verdicts.get(i);
    p.selection = v
      ? {
        etat: v.etat, ampleur: v.ampleur, derniere_etape: String(v.derniere_etape || '').trim(), date_iso: String(v.date_iso || '').trim(),
        achevement_constate: Boolean(v.achevement_constate), suite_annoncee: Boolean(v.suite_annoncee), operation_d_ensemble: Boolean(v.operation_d_ensemble),
        verdict: VERDICTS[v.verdict] ? v.verdict : 'garder', precision: String(v.precision || '').trim(),
      }
      : { verdict: 'garder', precision: 'opération sans verdict, gardée' };
    verifierLAge(p.selection);
  });
  const rang = (p) => { const k = AMPLEURS.indexOf(p.selection.ampleur); return k < 0 ? AMPLEURS.length : k; };

  /* Les doublons signalés sont fondus, chaque groupe sous l'opération lue la
     première. L'opération fondue est gardée si l'un de ses membres l'est, avec
     la plus grande ampleur de ses membres gardés : une description ancienne du
     même équipement n'efface pas sa description actuelle. */
  const chef = operations.map((_, i) => i);
  const racine = (i) => (chef[i] === i ? i : (chef[i] = racine(chef[i])));
  for (const [i, v] of verdicts) {
    const j = v.meme_operation_que;
    if (Number.isInteger(j) && j >= 0 && j < operations.length && j !== i) {
      const [a, b] = [racine(i), racine(j)].sort((x, y) => x - y);
      chef[b] = a;
    }
  }
  const groupes = new Map();
  operations.forEach((p, i) => {
    const r = racine(i);
    if (!groupes.has(r)) groupes.set(r, []);
    groupes.get(r).push(p);
  });
  const fondues = [...groupes.values()].map((g) => {
    if (g.length === 1) return g[0];
    const gardes = g.filter((p) => p.selection.verdict === 'garder');
    const porteur = g[0];
    const op = fondre(g, { titre: porteur.title, principal: porteur });
    op.descriptions_lues = g.flatMap((p) => p.descriptions_lues || []);
    op.selection = gardes.length
      ? { ...[...gardes].sort((a, b) => rang(a) - rang(b))[0].selection, fondue_avec: g.slice(1).map((p) => p.title) }
      : { ...porteur.selection, fondue_avec: g.slice(1).map((p) => p.title) };
    return op;
  });
  const nFondues = operations.length - fondues.length;
  if (nFondues) console.log(`[demo-generate] selection : ${nFondues} doublon(s) fondu(s) :: ${fondues.filter((p) => p.selection.fondue_avec).map((p) => `${p.title} <- ${p.selection.fondue_avec.join(' ; ')}`).join(' | ')}`);
  const gardees = fondues.filter((p) => p.selection.verdict === 'garder');
  const ecartees = fondues.filter((p) => p.selection.verdict !== 'garder');
  if (verdicts.size < operations.length) console.warn(`[demo-generate] selection : ${operations.length - verdicts.size} operation(s) sans verdict, gardees`);
  /* Les plus structurantes d'abord : la localisation et l'illustration
     travaillent dans l'ordre de la liste, et une carte se lit par ses grands
     projets. À ampleur égale, l'ordre de la lecture est gardé. */
  gardees.sort((a, b) => rang(a) - rang(b));
  return { gardees, ecartees };
}

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

  /* Les avis de marches, en un appel : liste compacte, aucun risque de volume.
     Pendant ce temps, les pages encore sans date sont datees pour la selection. */
  const [avis] = await Promise.all([
    depouillerLesAvis(commune, boamp),
    daterLesPages([...(state.explo?.bruts || []), ...(state.presseProjets || [])]),
  ]);
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

  const retenus = bruts.filter((p) =>
    p.confidence !== 'basse'
    && (allowedUrls.has(normaliserUrl(p.source_url)) || allowedHosts.has(hostOf(p.source_url)))
  );

  /* RAPPROCHEMENT ET VÉRIFICATION : l'IA regroupe les descriptions par
     opération réelle et écarte ce qui n'en est pas une (voir
     rapprocherLesDescriptions). Elle juge aussi les interventions de
     concessionnaire de réseau, que des expressions régulières sur des noms de
     marques écartaient ici auparavant. */
  const { projets: operations, ecartes: nonRetenus } = await rapprocherLesDescriptions(commune, retenus);
  let projects = operations;
  const fusionnes = retenus.length - nonRetenus.length - projects.length;
  const parRaison = {};
  for (const e of nonRetenus) parRaison[e.raison] = (parRaison[e.raison] || 0) + 1;
  console.log(`[demo-generate] rapprochement : ${retenus.length} descriptions -> ${projects.length} operations (${fusionnes} fondue(s), ${nonRetenus.length} ecartee(s) : ${Object.entries(parRaison).map(([r, k]) => `${k} ${RAISONS_D_ECART[r] || r}`).join(', ') || 'aucune'})`);
  if (nonRetenus.length) {
    console.log(`[demo-generate] descriptions ecartees : ${nonRetenus.map((e) => `${e.projet.title} (${e.precision || RAISONS_D_ECART[e.raison]})`).join(' | ')}`);
  }

  /* SELECTION : ce qu'un habitant appellerait un projet de sa commune, actuel
     et significatif (voir selectionnerLesProjets). Elle passe avant
     l'arbitrage des marches, pour que la reserve d'avis qui peut regarnir une
     carte courte ne contienne que des operations retenues. */
  const { gardees, ecartees: horsCarte } = await selectionnerLesProjets(commune, projects, mairie.pdfs || []);
  projects = gardees;
  console.log(`[demo-generate] selection : ${gardees.length} operation(s) gardee(s), ${horsCarte.length} ecartee(s)`);
  for (const p of horsCarte) console.log(`[demo-selection] ecartee (${VERDICTS[p.selection.verdict]}, ${p.selection.ampleur || '?'}) ${p.title} :: ${p.selection.derniere_etape} :: ${p.selection.precision}${p.selection.corrige ? ` :: corrigé : ${p.selection.corrige}` : ''}`);
  for (const p of gardees) console.log(`[demo-selection] gardee (${p.selection.etat || '?'}, ${p.selection.ampleur || '?'}) ${p.title} :: ${p.selection.derniere_etape}${p.selection.corrige ? ` :: corrigé : ${p.selection.corrige}` : ''}`);
  state.stats.selection = {
    gardees: gardees.length,
    ecartees: horsCarte.map((p) => ({ titre: p.title, verdict: p.selection.verdict, ampleur: p.selection.ampleur, derniere_etape: p.selection.derniere_etape, precision: p.selection.precision, ...(p.selection.corrige ? { corrige: p.selection.corrige } : {}) })),
  };
  for (const p of [...gardees, ...horsCarte]) delete p.descriptions_lues;

  /* La matiere de l'article : l'extrait de la page qui presente le mieux
     l'operation, suivi des citations relevees mot pour mot sur ses autres
     pages. Chaque page de l'operation a ainsi sa phrase dans la matiere,
     au lieu de la seule page porteuse. */
  for (const p of projects) {
    const principal = (p.page_excerpt || [p.description, p.evidence_quote].filter(Boolean).join('\n\n'))
      .slice(0, SOURCE_EXCERPT_CHARS);
    const autres = (p.citations || [])
      .map((c) => c.citation)
      .filter((c) => c && !principal.includes(c));
    p.source_excerpt = [principal, ...autres.map((c) => `« ${c} »`)].join('\n\n');
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

/* ─── Affinage des emprises par les données nationales ─────────────────────

   Le geocodage pose souvent une epingle la ou la commune a un vrai contour :
   un perimetre de ZAC publie au Geoportail de l'urbanisme, l'emprise d'une
   ecole dans la BD TOPO, le trace d'une rue. Ces sources couvrent toute la
   France et ne demandent pas de cle. Mesure sur Noyal-Chatillon-sur-Seiche :
   la ZAC Centre-Ville etait dessinee comme une rue, celle de l'Ise comme une
   epingle, alors que leurs perimetres sont publies.

   L'IA dit d'abord quelle FORME a chaque projet sur une carte (perimetre
   d'operation, batiment, voie, ponctuel) ; on ne cherche ensuite que la forme
   annoncee, et seulement au pied de la position deja trouvee : on corrige un
   contour, jamais un emplacement. Une source qui ne repond pas laisse au
   projet sa geometrie d'origine. */
const EMPRISE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    formes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer' },
          forme: { type: 'string', enum: ['perimetre', 'batiment', 'voie', 'ponctuel'] },
        },
        required: ['index', 'forme'],
      },
    },
  },
  required: ['formes'],
};
const AFFINAGE_BUDGET_MS = 12000;
const GEOPF_WFS = 'https://data.geopf.fr/wfs/ows';
// Au-dela, une « emprise » n'est plus celle d'un equipement mais d'une zone entiere
const BATIMENT_SURFACE_MAX_M2 = 200000;
// Demi-cote de la recherche autour de la position trouvee (environ 200 m)
const RAYON_RECHERCHE_DEG = 0.0018;

async function formesDesProjets(commune, projets) {
  try {
    const system = `Pour chaque projet de ${commune.nom}, dis quelle forme il prend sur une carte : « perimetre » pour une opération d'aménagement d'ensemble sur tout un secteur (ZAC, lotissement, quartier en renouvellement, zone d'activités), « batiment » pour la construction ou la rénovation d'un bâtiment ou d'un équipement avec son terrain (école, gymnase, église, salle, crèche, mais aussi un immeuble ou une résidence, même situés dans une ZAC), « voie » pour des travaux sur une rue, une route, une piste cyclable, un pont ou un quai, « ponctuel » pour tout le reste (borne, plantation, mobilier, réseau enterré).`;
    const user = JSON.stringify(projets.map((p, i) => ({ index: i, titre: p.title, lieu: p.place || '', adresse: p.address || '', description: (p.description || '').slice(0, 240) })));
    const out = await openAIStructured([{ role: 'system', content: system }, { role: 'user', content: user }],
      'formes_projets', EMPRISE_SCHEMA, 1500, 30000, 0.1, OPENAI_MODEL_LIGHT, 2);
    const parIndex = new Map((out.formes || []).map((f) => [f.index, f.forme]));
    return projets.map((_, i) => parIndex.get(i) || 'ponctuel');
  } catch (e) {
    console.warn(`[demo-generate] formes des projets indisponibles :: ${e?.message}`);
    return projets.map(() => 'ponctuel');
  }
}

function anneauxDe(g) {
  if (g?.type === 'Polygon') return [g.coordinates[0]];
  if (g?.type === 'MultiPolygon') return g.coordinates.map((p) => p[0]);
  return [];
}
function pointDansAnneau([x, y], anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i]; const [xj, yj] = anneau[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}
const contientPoint = (g, pt) => anneauxDe(g).some((a) => pointDansAnneau(pt, a));
function surfaceM2(g) {
  let total = 0;
  for (const a of anneauxDe(g)) {
    const kx = 111320 * Math.cos(a[0][1] * Math.PI / 180); const ky = 110540;
    let s = 0;
    for (let i = 1; i < a.length; i++) s += (a[i - 1][0] * kx) * (a[i][1] * ky) - (a[i][0] * kx) * (a[i - 1][1] * ky);
    total += Math.abs(s) / 2;
  }
  return total;
}

// Perimetres de ZAC du Geoportail de l'urbanisme qui contiennent la position :
// une requete ponctuelle repond en une a deux secondes, la commune entiere en
// plus de dix (elle ramene aussi tous les zonages d'assainissement).
async function perimetreDeZac(pt) {
  const r = await fetchWithTimeout('https://apicarto.ign.fr/api/gpu/info-surf', {
    method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ geom: { type: 'Point', coordinates: pt } }),
  }, 8000);
  if (!r.ok) return null;
  const d = await lireJson(r, 8000, 20000000);
  return (d.features || []).filter((f) => f.properties?.typeinf === '02').map((f) => f.geometry)
    .sort((a, b) => surfaceM2(a) - surfaceM2(b))[0] || null;
}

async function wfsAutour(couche, [lng, lat], filtre = '') {
  const q = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: couche, OUTPUTFORMAT: 'application/json', COUNT: '200',
    CQL_FILTER: `BBOX(geometrie,${lat - RAYON_RECHERCHE_DEG},${lng - RAYON_RECHERCHE_DEG},${lat + RAYON_RECHERCHE_DEG},${lng + RAYON_RECHERCHE_DEG})${filtre}`,
  });
  const r = await fetchWithTimeout(`${GEOPF_WFS}?${q}`, { headers: UA }, 7000);
  if (!r.ok) return [];
  return (await lireJson(r, 7000, 8000000)).features || [];
}

// La plus petite zone d'interet de la BD TOPO (ecole, stade, eglise...) qui contient la position
async function empriseDeBatiment(pt) {
  const zones = (await wfsAutour('BDTOPO_V3:zone_d_activite_ou_d_interet', pt))
    .filter((f) => contientPoint(f.geometry, pt) && surfaceM2(f.geometry) <= BATIMENT_SURFACE_MAX_M2)
    .sort((a, b) => surfaceM2(a.geometry) - surfaceM2(b.geometry));
  return zones[0]?.geometry || null;
}

// La voie nommee de la BD TOPO, proche de la position, dont le projet cite le nom
async function traceDeVoie(pt, texte, insee) {
  const voies = await wfsAutour('BDTOPO_V3:voie_nommee', pt, insee ? ` AND insee_commune='${insee}'` : '');
  const meule = unaccentLower(texte);
  const nommees = voies.filter((f) => {
    const nom = unaccentLower(f.properties?.nom_voie_ban || '');
    const directeur = unaccentLower(f.properties?.mot_directeur || '');
    return nom && (meule.includes(nom) || (directeur.length >= 4 && meule.includes(directeur)));
  });
  return nommees.length === 1 ? nommees[0].geometry : null;
}

async function affinerLesEmprises(commune, located, bbox) {
  const echeance = Date.now() + AFFINAGE_BUDGET_MS;
  const formes = await formesDesProjets(commune, located);
  const besoin = (f, g) => ((f === 'perimetre' || f === 'batiment') && !/Polygon/.test(g.type))
    || (f === 'voie' && !/Line/.test(g.type));
  const aFaire = located.map((_, i) => i).filter((i) => besoin(formes[i], located[i].geometry));
  if (!aFaire.length) return 0;
  let affines = 0;
  await inChunks(aFaire, 6, async (i) => {
    if (Date.now() > echeance) return;
    const p = located[i];
    const c = centroidOf(p.geometry);
    const pt = [c.lng, c.lat];
    let g = null; let methode = null;
    try {
      if (formes[i] === 'perimetre') {
        g = await perimetreDeZac(pt);
        methode = 'perimetre';
      } else if (formes[i] === 'batiment') {
        g = await empriseDeBatiment(pt); methode = 'emprise';
      } else if (formes[i] === 'voie') {
        g = await traceDeVoie(pt, `${p.title} ${p.place || ''} ${p.address || ''} ${p.geo_query || ''}`, commune.code); methode = 'trace';
      }
    } catch { g = null; }
    // Même plafond que les lieux du répertoire : la forme est simplifiée
    // plutôt que refusée quand elle est trop lourde.
    const allegee = g && extentAcceptable(g, bbox) ? allegerLaGeometrie(g) : null;
    if (allegee) {
      p.geometry = allegee; p.method = methode; affines++;
    }
  }, echeance);
  return affines;
}

const METHOD_LABELS = {
  emprise: 'emprise réelle trouvée',
  trace: 'tracé réel trouvé',
  adresse: 'adresse précise',
  perimetre: 'périmètre officiel trouvé',
  lieu: 'lieu-dit officiel',
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

   Quatre étages, dans l'ordre :
   1. le répertoire des lieux nommés de la commune, relevé une seule fois dans
      la BD TOPO (voir releverLeRepertoire) ;
   2. le rattachement de chaque projet à l'un de ces lieux, par l'IA, en un
      appel découpé en lots parallèles ;
   3. l'assemblage : la vraie géométrie du lieu désigné, ou l'adresse BAN
      quand la source donne un numéro, puisqu'un numéro désigne un bâtiment et
      non la rue entière ;
   4. Nominatim, borné à dix requêtes, pour les lieux que la source écrit mais
      que le répertoire ne nomme pas (bâtiments, lieux de culte) ;
   5. la BAN sur les formulations du projet, pour les projets que l'IA n'a pas
      pu juger.
   Ce qui n'a toujours pas de lieu est écarté.

   Elle est DECOUPEE EN TRANCHES : chaque invocation travaille pendant un
   budget borne puis rend la main ; le client rappelle la meme phase, qui
   reprend a son etape. Le releve du repertoire et l'appel a l'IA tiennent
   chacun dans une tranche, l'affinage final dans la sienne.

   Elle parle AU FIL DE L'EAU : chaque projet part a l'ecran des qu'il est
   place, apres un dedoublonnage incremental qui n'affiche jamais une punaise
   absente de la carte finale. */
const PHASE_BUDGET_MS = 22000;
/* Deux fiches ne peuvent pas occuper le meme point : au-dela d'un projet, une
   position partagee est un repli du geocodeur, pas l'adresse du chantier. */
const POSITION_MIN_M = 45;
// Filet anti-boucle : au-dela, on finalise avec ce qu'on a plutot que de
// rappeler la phase indefiniment.
const GEO_MAX_TOURS = 14;
/* L'appel a l'IA ne part que s'il peut finir dans la tranche ; sinon il
   ouvre la suivante, qui commence avec un budget entier. */
const RATTACHEMENT_DEPART_MAX_MS = PHASE_BUDGET_MS - RATTACHEMENT_TIMEOUT_MS;
// Requetes Nominatim au plus par generation (une par seconde : dix secondes)
const NOMINATIM_MAX = 10;
// Un lot que l'IA n'a pas pu traiter est retente une fois a la tranche suivante.
const RATTACHEMENT_REPRISES = 1;
const GEO_VERSION = 2;

/* Brouillon ecrit par une version anterieure du code.
   L'etat de la phase voyage en base entre les tranches, et une mise en
   production peut tomber au milieu d'une generation. Un etat des anciens
   etages (annuaire d'adresses projet par projet) garde ses projets deja
   situes et renvoie ceux qui restent au repertoire ; les champs absents sont
   recrees, sinon un `.push` sur `undefined` fait echouer la reprise. */
function migrerEtatGeo(geo) {
  if (!geo) return geo;
  for (const k of ['titresFusionnes', 'titresSuperposes', 'titresAbandonnes', 'reste']) {
    if (!Array.isArray(geo[k])) geo[k] = [];
  }
  if (geo.version !== GEO_VERSION) {
    geo.version = GEO_VERSION;
    geo.etape = 'repertoire';
    geo.aTester = geo.reste.slice();
    delete geo.curseur;
    delete geo.lieuxIa;
  }
  if (!Array.isArray(geo.aTester)) geo.aTester = geo.reste.slice();
  if (!geo.choix) geo.choix = {};
  if (!geo.reprisesIa) geo.reprisesIa = 0;
  return geo;
}

const methodeDe = (g) => (/Line/.test(g.type) ? 'trace' : /Polygon/.test(g.type) ? 'emprise' : 'lieu');
// Les projets que l'IA a jugés : ceux-là ne repassent pas par la BAN (voir l'étage 4)
const jugeParLIa = (geo, i) => !!geo.choix?.[i];

async function coreGeo(send, step, state) {
  const { projects, bbox } = state;
  const communeShim = {
    nom: state.commune.nom,
    code: state.commune.code,
    centre: { coordinates: [state.commune.lng, state.commune.lat] },
  };

  // Etat de la phase, serialisable : il voyage d'une tranche a l'autre
  const geo = state.geo || (state.geo = {
    version: GEO_VERSION,
    etape: 'repertoire',
    // Indices des projets que l'etape en cours doit traiter
    aTester: projects.map((_, i) => i),
    // Indices encore sans position, tous etages confondus
    reste: projects.map((_, i) => i),
    /* Le repertoire compact : { n: nom, t: nature, c: couche, k: cle }. Ses
       geometries ne voyagent pas, elles sont relues par cle (repertoireDe). */
    lieux: null,
    // Reponse de l'IA par indice de projet : { lieux: [index], adresse: bool }
    choix: {},
    reprisesIa: 0,
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

  migrerEtatGeo(geo);
  state.located = state.located || [];
  geo.tours++;

  const premiereTranche = geo.tours === 1;
  if (premiereTranche) {
    step('geo', 'start', 'Localisation des projets', `${projects.length} projet(s) à situer parmi les lieux nommés des données nationales de l'IGN et les adresses officielles BAN`);
  } else {
    step('geo', 'start', 'Localisation des projets', `${state.located.length} situé(s), ${geo.reste.length} en cours...`);
  }

  /* Accepte un projet localisé : dédoublonnage incrémental, puis émission
     immédiate. Rend true si le projet a rejoint la carte. */
  const accepter = (i, loc) => {
    /* Une emprise géante ne tient pas dans le brouillon relu à chaque tranche :
       elle est simplifiée, et ne retombe en point que si la simplification ne
       suffit pas. */
    const allegee = allegerLaGeometrie(loc.geometry);
    const c = centroidOf(loc.geometry);
    loc.geometry = allegee || { type: 'Point', coordinates: [c.lng, c.lat] };
    const projet = { ...projects[i], ...loc };

    for (const deja of state.located) {
      const d = haversineM(centroidOf(deja.geometry), c);
      if (memeChantier(deja, projet, d)) {
        geo.fusionnes++;
        geo.titresFusionnes.push(projet.title);
        return false;
      }
      /* Une position DÉJÀ OCCUPÉE n'est pas celle de ce projet-ci.
         Mesuré sur Saint-Denis (974) : CINQ fiches avaient atterri sur
         exactement le même polygone, à la sixième décimale près. Ce n'étaient
         pas cinq projets voisins, mais cinq avis de marché sans lieu propre
         (« bâtiments communaux », « les écoles », « les cimetières »,
         « voiries ») rabattus sur le même repli. Un emplacement partagé par
         plusieurs projets n'est la position d'aucun. Le projet est donc
         écarté, et compté comme « emplacement non vérifiable ». */
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
  const ecoule = () => Date.now() - t0;
  const budgetEpuise = () => ecoule() > PHASE_BUDGET_MS;

  const etapeSuivante = (nom) => {
    geo.etape = nom;
    geo.aTester = geo.reste.slice();
  };

  while (geo.etape !== 'final' && !budgetEpuise() && geo.tours <= GEO_MAX_TOURS) {
    /* Etage 1 : le repertoire. Indisponible (Geoplateforme muette), la phase
       se rabat sur la BAN seule plutot que de tout ecarter. */
    if (geo.etape === 'repertoire') {
      if (!geo.lieux) {
        /* La recette de l'open data est jugée une seule fois, pendant que le
           relevé de l'IGN tourne : les deux tiennent ensemble dans la tranche.
           Elle reste ensuite dans l'état, pour que les tranches suivantes
           relisent les mêmes lieux sans refaire juger l'IA. */
        if (geo.recetteOuverte === undefined) {
          const [recette] = await Promise.all([
            recetteOuverteBornee(state.commune.code),
            repertoireDe(state.commune.code).catch(() => null),
          ]);
          geo.recetteOuverte = recette;
        }
        try {
          /* Une seconde chance apres une pause : le repertoire porte presque
             toute la localisation, et une coupure de quelques secondes (DNS
             muet, Geoplateforme saturee) suffisait a vider la carte. Mesure
             le 10/11/2026 : 48 projets attestes a Noyal, aucun situe. */
          const rep = await repertoireDe(state.commune.code, geo.recetteOuverte)
            .catch(async () => { await new Promise((ok) => setTimeout(ok, 3000)); return repertoireDe(state.commune.code, geo.recetteOuverte); });
          geo.lieux = rep.lieux;
        } catch (e) {
          console.warn(`[demo-generate] répertoire des lieux indisponible pour ${state.commune.nom} :: ${e?.message}`);
          geo.lieux = [];
        }
      }
      if (!geo.lieux.length) { etapeSuivante('ban'); continue; }
      const operations = geo.lieux.filter((l) => l.c === 'operation').length;
      step('geo', 'start', 'Localisation des projets', `${geo.lieux.length} lieux nommés de la commune relevés${operations ? `, dont ${operations} opération(s) d'aménagement publiées par les collectivités` : ''}, rattachement de ${geo.reste.length} projet(s)...`);
      etapeSuivante('rattachement');
      continue;
    }

    // Etage 2 : l'IA rattache les projets aux lieux du repertoire
    if (geo.etape === 'rattachement') {
      if (!geo.aTester.length) { geo.etape = 'assemblage'; geo.aTester = geo.reste.slice(); continue; }
      if (ecoule() > RATTACHEMENT_DEPART_MAX_MS) break;
      const res = await rattacherAuxLieux(state.commune, geo.lieux, projects, geo.aTester);
      const echoues = [];
      for (const i of geo.aTester) {
        const r = res.get(i);
        if (r) geo.choix[i] = r; else echoues.push(i);
      }
      if (echoues.length && geo.reprisesIa < RATTACHEMENT_REPRISES) {
        geo.reprisesIa++;
        geo.aTester = echoues;
        break;
      }
      geo.etape = 'assemblage';
      geo.aTester = geo.reste.slice();
      continue;
    }

    /* Etage 3 : l'assemblage. La geometrie du lieu designe, ou l'adresse BAN
       quand la source donne un numero que l'IA confirme comme celui du projet
       et que le lieu designe n'est qu'une voie (ou rien) : un numero designe
       un batiment, pas la rue entiere. */
    if (geo.etape === 'assemblage') {
      let rep;
      try { rep = await repertoireDe(state.commune.code, geo.recetteOuverte); } catch (e) {
        console.warn(`[demo-generate] répertoire des lieux à relire indisponible :: ${e?.message}`);
        etapeSuivante('ban');
        continue;
      }
      const lot = geo.aTester.slice();
      const adresses = await inChunks(lot, 8, async (i) => {
        const p = projects[i];
        if (!geo.choix[i]?.adresse || !AVEC_NUMERO_RE.test(String(p.address || ''))) return null;
        return banGeocode(p.address, communeShim, bbox);
      });
      lot.forEach((i, k) => {
        if (!geo.reste.includes(i)) return;
        const choix = geo.choix[i];
        const noms = (choix?.lieux || []).map((x) => geo.lieux[x]).filter(Boolean);
        const geoms = noms.map((l) => rep.geometries.get(l.k));
        const angle = choix?.croisement && geoms.every(Boolean) ? pointDeCroisement(geoms[0], geoms[1]) : null;
        const g = angle || fusionnerGeometries(geoms);
        const adresse = adresses[k];
        /* Le contour d'une opération publiée par la collectivité est son
           périmètre officiel, et l'écran le dit comme tel. */
        const perimetre = !angle && g && /Polygon/.test(g.type) && noms[0]?.c === 'operation';
        let loc = null;
        if (adresse && (!g || /Line/.test(g.type))) loc = adresse;
        // L'angle de deux rues est une adresse, pas un lieu-dit : il en prend le libellé à l'écran.
        else if (g) loc = { geometry: g, method: angle ? 'adresse' : perimetre ? 'perimetre' : methodeDe(g), lieu_repertoire: noms.map((l) => l.n).join(angle ? ' x ' : ' + ') };
        if (process.env.DEMO_DUMP) {
          console.log(`[demo-geo] "${projects[i].title}" « ${choix?.situation || ''} » -> ${loc ? `${loc.lieu_repertoire || `adresse ${projects[i].address}`} (${loc.method})` : 'aucun lieu'}`);
        }
        if (loc) { retirerDuReste(i); accepter(i, loc); }
      });
      /* Ce que le répertoire ne nomme pas, mais dont la source écrit le lieu,
         passe au dernier recours Nominatim (étage 4). Le lieu interrogé est
         la « situation » que l'IA a recopiée de la source, jamais le titre. */
      geo.etape = 'nominatim';
      geo.aTester = geo.reste
        .filter((i) => motsSignificatifs(geo.choix[i]?.situation || '', state.commune.nom).size > 0)
        .slice(0, NOMINATIM_MAX);
      continue;
    }

    /* Etage 4, Nominatim : un dernier recours, borné. La BD TOPO ne nomme ni
       les bâtiments ni la plupart des lieux de culte. Mesuré le 10/11/2026 :
       sans cet étage, l'église Saint-Christophe de Faugères et la Maison
       Ricard de Saint-Genis-Laval, situées par OpenStreetMap dans la version
       précédente, restaient sans emplacement. Une requête par seconde, imposée
       par sa politique d'usage, et au plus NOMINATIM_MAX requêtes par
       génération : l'étage ne peut plus occuper la moitié de la durée. */
    if (geo.etape === 'nominatim') {
      const i = geo.aTester.shift();
      if (i === undefined) { etapeSuivante('ban'); continue; }
      if (!geo.reste.includes(i)) continue;
      const hit = await nominatimLookup(geo.choix[i].situation, communeShim, bbox);
      if (process.env.DEMO_DUMP) console.log(`[demo-geo] nominatim « ${geo.choix[i].situation} » -> ${hit ? `${hit.method} ${hit.geometry.type}` : 'rien'}`);
      if (hit) { retirerDuReste(i); accepter(i, { ...hit, lieu_repertoire: `OpenStreetMap : ${geo.choix[i].situation}` }); }
      continue;
    }

    /* Etage 5, BAN sur les formulations du projet : officielle, scopee sur la
       commune, sans quota, en parallele. Elle ne sert qu'aux projets que l'IA
       n'a pas pu juger (repertoire ou IA indisponibles). Un projet pour lequel
       l'IA a repondu « aucun lieu » n'y passe pas : la BAN ne connait que des
       voies et des numeros, que le repertoire contient deja, et elle reprenait
       justement ce que l'IA avait ecarte. Mesure a Noyal (10/11/2026) : la
       « rue de Vern », adresse de la salle d'une reunion publique, devenait
       l'emplacement de l'operation Coeur de Ville, a 261 m de son perimetre. */
    if (geo.etape === 'ban') {
      geo.aTester = geo.aTester.filter((i) => !jugeParLIa(geo, i));
      const lot = geo.aTester.splice(0, 8);
      if (!lot.length) { geo.etape = 'final'; continue; }
      const trouves = await inChunks(lot, 8, async (i) => {
        for (const q of locationQueries(projects[i], state.commune.nom)) {
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
  }

  /* Budget epuise mais travail inacheve : on rend la main, la tranche suivante
     reprend exactement ou celle-ci s'arrete. L'affinage final a lui aussi sa
     tranche quand celle-ci n'a plus de quoi le tenir. */
  const resteAFaire = geo.etape !== 'final' || ecoule() > PHASE_BUDGET_MS - AFFINAGE_BUDGET_MS;
  if (resteAFaire && geo.tours < GEO_MAX_TOURS) {
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
    /* On repart uniquement sur les nouveaux venus, depuis le répertoire : il
       est déjà relevé, la tranche suivante passe donc tout de suite à l'IA. */
    geo.etape = 'repertoire';
    geo.reste = reserve.map((_, k) => depart + k);
    geo.aTester = geo.reste.slice();
    geo.reprisesIa = 0;
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

  const affines = await affinerLesEmprises(state.commune, located, bbox).catch((e) => {
    console.warn(`[demo-generate] affinage des emprises impossible :: ${e?.message}`);
    return 0;
  });
  if (affines) console.log(`[demo-generate] ${affines} emprise(s) affinée(s) par les données nationales`);

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

  /* Plus aucune photo « generique » d'un ouvrage du meme type, cherchee sur
     Wikimedia Commons par mots-cles. Ce repli posait sur une fiche une image
     d'un AUTRE lieu, choisie sans que personne ne la regarde. Mesure sur le banc
     d'essai du 10/11/2026 a Vienne : le projet de crematorium illustre par les
     fours d'Auschwitz, l'ecole Michel Servet par un lycee du Maryland, le siege
     de l'agglomeration par un immeuble de Londres. Une fiche sans image est
     honnete ; celle-la detruit la confiance dans toute la carte. */
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
   illustrations. Un article se lit, s'extrait puis s'écrit en cinq à quarante
   secondes selon le nombre de ses sources : vingt-cinq articles ne tiennent pas
   dans une invocation. Trois articles à la fois, pas davantage : le bac à sable
   des fonctions rompt ses connexions sortantes au-delà. */
const ARTICLES_CONCURRENCE = 3;

// Tiret cadratin ou demi-cadratin entre deux mots : une virgule ; en tete de ligne : rien
function sansTiretLong(texte) {
  if (typeof texte !== 'string') return texte;
  return texte
    .replace(/(\d)[ \t]*[\u2013\u2014][ \t]*(\d)/g, '$1-$2')
    .replace(/^([ \t]*)[\u2013\u2014][ \t]*/gm, '$1')
    .replace(/[ \t]*[\u2013\u2014][ \t]*/g, ', ')
    .replace(/,\s*,/g, ',');
}

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

  /* Trois places de redaction tenues en continu : chacune prend le projet
     suivant des qu'elle a fini le sien. Les vagues de trois attendaient leur
     article le plus lent avant d'en lancer d'autres, alors qu'un article prend
     de cinq a quarante secondes selon ses sources : les places liberees
     restaient vides jusqu'a la fin de la vague. Le nombre d'articles
     menes de front ne change pas, ni la regle de la tranche : une place ne
     prend plus de projet passe le budget de temps. */
  await Promise.all(Array.from({ length: ARTICLES_CONCURRENCE }, async () => {
    while (redac.curseur < located.length && Date.now() - t0 < PHASE_BUDGET_MS) {
      const i = redac.curseur++;
      let a = null;
      try {
        /* Les autres fiches de la carte partent avec le projet : l'extraction
           rend à chacune les passages qui la concernent (voir extraireLesFaits). */
        const autres = located.filter((_, k) => k !== i);
        const { markdown, description, etat } = await redigerArticle(state.commune, located[i], pdfs, autres);
        send({ type: 'article-item', title: located[i].title });
        a = { index: i, title: located[i].title, markdown, description, etat };
      } catch (e) {
        // Un article manquant est un manque, pas une panne : la fiche existe
        // quand même, avec sa description et sa photo.
        console.error(`[demo-generate] article "${located[i].title}" :`, e.message);
      }
      // Un rejeu de tranche ne doit pas creer de doublon
      if (!a || state.articles.some((x) => x.index === a.index)) continue;
      /* La description de la fiche venait de la page lue a l'exploration, au
         temps de cette page (« ouverture prevue en 2025 » pour un equipement
         ouvert en fevrier 2026). Celle du redacteur est ecrite depuis les faits
         verifies, a la date du jour : elle la remplace. */
      if (a.description) { located[a.index].description_lue = located[a.index].description; located[a.index].description = a.description; }
      delete a.description;
      state.articles.push(a);
    }
  }));
  // Les articles arrivent dans l'ordre ou ils finissent : rangés par projet
  state.articles.sort((x, y) => x.index - y.index);

  if (redac.curseur < located.length && redac.tours < GEO_MAX_TOURS) {
    step('articles', 'done', 'Rédaction en cours', `${state.articles.length} article(s) écrit(s)`);
    state.__continue = true;
    return state;
  }
  delete state.__continue;

  /* Les titres et descriptions viennent des pages lues, les articles du
     modele : les uns comme les autres portent des tirets longs (« Avenue
     General Leclerc – Tranche 3 »), que la charte d'ecriture des fiches
     exclut. Un tiret entre deux mots devient une virgule, partout ou le texte
     est publie. */
  for (const p of located) {
    p.title = sansTiretLong(p.title);
    p.description = sansTiretLong(p.description);
  }
  for (const a of state.articles) a.markdown = sansTiretLong(a.markdown);
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

/* Banc d'essai : DEMO_ETATS_DIR enregistre l'etat apres chaque tranche, tel
   que la production l'ecrirait dans demo_instances (meme serialisation). */
async function etatDuBanc(nom, state) {
  const dossier = process.env.DEMO_ETATS_DIR;
  if (!dossier || !state || process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const fs = await import('node:fs');
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(`${dossier}/${nom}.json`, corpsJson(state));
}

async function runSources(send, step, insee, ipHash, runState) {
  // cumulerTokens n'était appelé que par runPhase : la phase sources, qui
  // consomme pourtant de l'IA (choix du logo, tri des marchés), n'était jamais
  // comptée et le journal sous-estimait la dépense de toute une étape.
  /* Banc d'essai (voie locale seulement) : DEMO_REPRISE_ETAT repart d'un etat
     enregistre par une generation precedente, a la phase DEMO_REPRISE_DEPUIS
     (coreGeo, coreMedia ou coreRedact). Rejouer les dernieres phases sans
     refaire la lecture du site coute dix fois moins cher. */
  const reprise = !process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.DEMO_REPRISE_ETAT
    ? JSON.parse((await import('node:fs')).readFileSync(process.env.DEMO_REPRISE_ETAT, 'utf8'))
    : null;
  const state = reprise || cumulerTokens(await coreSources(send, step, insee, runState));
  if (!state) return;
  if (!reprise) await etatDuBanc('coreSources', state);
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
    const ordre = ['coreExplore', 'coreGeo', 'coreMedia', 'coreRedact'];
    const depuis = reprise ? ordre.indexOf(process.env.DEMO_REPRISE_DEPUIS) : 0;
    const enchainer = async (core, s) => {
      if (ordre.indexOf(core.name) < depuis) return s;
      let courant = s;
      /* Chaque phase s'arrete d'elle-meme (ses propres plafonds de tranches et
         de pages). La limite ici n'est qu'un garde-fou contre une boucle : a
         14 tours, elle coupait une exploration de metropole passee par
         l'etage intercommunal puis le repechage, et la localisation recevait
         un etat inacheve (Vienne, 10/11/2026). */
      for (let tour = 0; tour < 60 && courant; tour++) {
        courant = await core(send, step, courant);
        await etatDuBanc(`${core.name}-${tour}`, courant);
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

/* ─── Rejeu d'un espace déjà prêt ───

   Une commune déjà générée ouvrait directement l'écran de fin : le visiteur
   tapait son nom et recevait une carte toute faite, sans rien voir se
   construire. On lui rejoue désormais la construction avec ce qui est VRAI :
   les fiches publiées, leur emplacement, leur tracé et leur illustration,
   plus le logo et la couleur de la mairie. Aucune source ni citation n'est
   rejouée : elles ne sont plus conservées une fois l'espace publié, et en
   inventer serait mentir devant un élu.

   Tout est borné (6 s au plus) et rien n'est bloquant : un rejeu manqué rend
   simplement l'écran de fin d'avant. */
const REJEU_BUDGET_MS = 6000;
const LOGO_PAR_DEFAUT = /\/img\/logos\/classic_color\.png$/;

/* Point affiché pour une fiche : son repère ponctuel s'il a été publié, sinon
   le point de repère de son emprise, exactement comme à la génération. */
function pointDuRejeu(fc) {
  const features = (fc?.features || []).filter((f) => f?.geometry?.coordinates);
  if (!features.length) return null;
  const point = features.find((f) => f.geometry.type === 'Point');
  const emprise = features.find((f) => f.geometry.type !== 'Point') || null;
  const coords = point ? point.geometry.coordinates : pointDeRepere(emprise.geometry);
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  return { lng: coords[0], lat: coords[1], geometry: emprise ? emprise.geometry : null };
}

async function lireRejeu(ville) {
  const echeance = Date.now() + REJEU_BUDGET_MS;
  const fiches = new URL(`${SUPABASE_URL}/rest/v1/contribution_uploads`);
  fiches.searchParams.set('select', 'project_name,geojson_url,cover_url');
  fiches.searchParams.set('ville', `eq.${ville}`);
  fiches.searchParams.set('order', 'id.asc');
  const marque = new URL(`${SUPABASE_URL}/rest/v1/city_branding`);
  marque.searchParams.set('select', 'logo_url,primary_color');
  marque.searchParams.set('ville', `eq.${ville}`);
  const [rf, rb] = await Promise.all([
    fetchWithTimeout(fiches.toString(), { headers: serviceHeaders() }, 4000),
    fetchWithTimeout(marque.toString(), { headers: serviceHeaders() }, 4000).catch(() => null),
  ]);
  if (!rf.ok) return null;
  const lignes = await lireJson(rf);
  const branding = rb?.ok ? ((await lireJson(rb))[0] || null) : null;

  // Les tracés sont des fichiers de notre propre stockage, rien d'autre n'est lu
  const items = await inChunks(lignes, 8, async (l) => {
    if (!l.geojson_url || !String(l.geojson_url).startsWith(`${SUPABASE_URL}/`)) return null;
    try {
      const r = await fetchWithTimeout(l.geojson_url, {}, 4000);
      if (!r.ok) return null;
      const point = pointDuRejeu(await lireJson(r));
      if (!point) return null;
      return { title: l.project_name, cover: l.cover_url || null, ...point };
    } catch { return null; }
  }, echeance);

  return {
    items: items.filter(Boolean),
    logo: branding?.logo_url && !LOGO_PAR_DEFAUT.test(branding.logo_url) ? branding.logo_url : null,
    color: branding?.primary_color || null,
  };
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
  // L'icône du site ferme la cascade : elle n'est installée que si aucun logo
  // n'a pu l'être
  const candidatsLogo = [mairie.logoUrl, ...(mairie.logoCandidats || []), mairie.iconeUrl]
    .filter((u, i, tous) => u && tous.indexOf(u) === i)
    .slice(0, 6);
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
      /* Un logo SVG porte ses couleurs en clair : quand ni le site ni le juge
         visuel (qui ne lit pas les SVG) n'ont donné la couleur de la commune,
         elle se lit dans le fichier lui-même. */
      if (!mairie.themeColor && vrai.ext === 'svg') {
        const couleur = couleurDepuisSvg(new TextDecoder('utf-8', { fatal: false }).decode(img.data));
        if (couleur) mairie.themeColor = couleur;
      }
      createItem(candidat === mairie.iconeUrl ? 'Icône du site installée, faute de logo' : 'Logo de la mairie installé');
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
    // Code INSEE : c'est lui qui range l'espace dans son département et sa
    // région sur l'index /ville/
    insee: commune.code || null,
    logo_url: logoUrl || 'https://openprojets.com/home/img/logos/classic_color.png',
    /* La carte s'ouvre sur la MAIRIE, pas sur le centre géométrique du
       territoire. Sur une commune de montagne, les deux sont loin l'un de
       l'autre : à Mazamet, le centre du territoire tombe à trois kilomètres
       au sud, dans la Montagne Noire, et la ville n'apparaissait qu'en haut
       de l'écran. La mairie est presque toujours au cœur du bourg, et c'est
       déjà elle qui ancre le radar de l'écran de génération. Le centre
       géométrique reste le repli quand l'annuaire ne la situe pas. */
    center_lat: mairie.position?.lat ?? commune.lat,
    center_lng: mairie.position?.lng ?? commune.lng,
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
            step('exists', 'done', 'Espace déjà généré', 'Reconstruction sous vos yeux');
            const rejeu = await lireRejeu(already.ville).catch((e) => {
              console.warn(`[demo-generate] rejeu indisponible pour ${already.ville} :: ${e?.message}`);
              return null;
            });
            if (rejeu?.items.length) send({ type: 'replay', ...rejeu });
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
            /* La cle de kiosque leve les DEUX plafonds, pas seulement celui par
               adresse. Elle est secrete et n'est jamais publiee, donc le
               garde-fou qui protege la demo ouverte reste entier ; en revanche
               un lot de generations mene depuis un poste connu se faisait
               couper net au quatre-vingtieme run. Le plafond absolu, lui, ne
               bouge pas : il continue de bloquer toutes les phases au double de
               la limite, cle ou pas. */
            const plafondAtteint = kioskOk
              ? false
              : (global >= MAX_GLOBAL_PER_DAY || byIp >= MAX_PER_IP_PER_DAY);
            if (plafondAtteint) {
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
  coreAi,
  rapprocherLesDescriptions,
  daterLesPages,
  selectionnerLesProjets,
  verifierLAge,
  ageEnMois,
  dateDeLaSourceVerifiee,
  repartirLaPlace,
  lotsParPage,
  affinerLesEmprises,
  perimetreDeZac,
  empriseDeBatiment,
  traceDeVoie,
  contientPoint,
  surfaceM2,
  citationRetrouvee,
  pourCitation,
  sourcesDuProjet,
  extraireLesFaits,
  redigerArticle,
  INSEE_RE,
  findSiteLogo,
  attributHtml,
  couleurUtilisable,
  choisirLogoEtCouleur,
  couleurDepuisSvg,
  inChunks,
  repartirParRubrique,
  lireFluxBorne,
  lireJson,
  corpsJson,
  sansMoitieOrpheline,
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
  pointDuRejeu,
  REPERE_MIN_PX,
  arbitrerMarches,
  nomDistinctifEpci,
  MARCHES_CIBLE,
  typeImageReel,
  looksLikeCode,
  estPageTremplin,
  collectPageLinks,
  collectPdfLinks,
  nomDeFichier,
  migrerEtatGeo,
  coreGeo,
  nominatimLookup,
  communeDuResultat,
  motsSignificatifs,
  releverLeRepertoire,
  recetteOuverte,
  lieuxOuverts,
  repertoireDe,
  ressourceLisible,
  rattacherAuxLieux,
  allegerLaGeometrie,
  fusionnerGeometries,
  METHOD_LABELS,
  sansPrefixeGenerique,
  nomCoherent,
  positionDansLaCommune,
  locationQueries,
  adresseDeGuichet,
  AVEC_NUMERO_RE,
  unescapeBoamp,
  odonymesDe,
  distinctiveWords,
  CARTE_COURTE,
  deLaCommune,
  messageSansProjet,
  messageCarteCourte,
};
