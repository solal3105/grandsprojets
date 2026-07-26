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

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const OPENAI_RESPONSES_URL = (process.env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com') + '/v1/responses';
const OPENAI_MODEL = process.env.DEMO_OPENAI_MODEL || 'gpt-4o';

const VILLE_PREFIX = 'essai-';
const MAX_PER_IP_PER_DAY = 15;
const MAX_GLOBAL_PER_DAY = 80;
const MAX_PHASE_ATTEMPTS = 2; // au-dela, la phase est declaree en echec (anti-boucle)
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

const STATUS_LABELS = { 'a-l-etude': "À l'étude", 'en-cours': 'En cours', 'livre': 'Livré', 'inconnu': '' };

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

const CANDIDATES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          summary: { type: 'string', description: 'Résumé factuel du projet, 25 mots maximum' },
          evidence_quote: { type: 'string', description: 'Citation exacte copiée mot pour mot depuis une source, une seule phrase, 200 caractères maximum' },
          source_url: { type: 'string', description: 'URL de la source fournie qui contient la citation' },
          place: { type: 'string', description: 'Lieu mentionné (rue, quartier, équipement), vide sinon' },
        },
        required: ['title', 'summary', 'evidence_quote', 'source_url', 'place'],
      },
    },
  },
  required: ['candidates'],
};

const FINAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projects: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Nom court et propre du projet, sans le nom de la commune' },
          description: { type: 'string', description: '2 à 4 phrases factuelles en français, dates si connues, aucun superlatif' },
          category_slug: { type: 'string', enum: Object.keys(CATEGORIES) },
          status: { type: 'string', enum: Object.keys(STATUS_LABELS) },
          place: { type: 'string', description: 'Lieu géocodable le plus précis (rue, quartier, équipement), vide si inconnu' },
          geo_query: { type: 'string', description: 'Requête optimale pour localiser CE projet sur OpenStreetMap dans la commune : adresse (n° + rue) si connue, sinon le nom EXACT de l\'équipement (ex : "Centre nautique Robert Sautin") ou du quartier/lieu-dit tel qu\'il apparaît sur une carte. Chaîne vide seulement si aucun lieu n\'est identifiable.' },
          source_url: { type: 'string' },
          confidence: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
        },
        required: ['title', 'description', 'category_slug', 'status', 'place', 'geo_query', 'source_url', 'confidence'],
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
    const sizes = /sizes=["'](\d+)/.exec(m[0])?.[1];
    iconCandidates.push({ href, score: (rel.includes('apple-touch') ? 1000 : 0) + (sizes ? parseInt(sizes, 10) : 16) });
  }
  iconCandidates.sort((a, b) => b.score - a.score);
  out.logoUrl = new URL(iconCandidates[0]?.href || '/favicon.ico', finalUrl).toString();
  // Le finding logo est émis par coreSources, une fois la couleur résolue
  // (meta theme-color, sinon couleur dominante du logo par vision IA)

  const links = [];
  const aRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  while ((m = aRe.exec(html)) !== null && links.length < 90) {
    const href = m[1];
    const label = stripHtml(m[2]).toLowerCase();
    const target = `${href} ${label}`.toLowerCase();
    if (/(projet|travaux|urbanisme|amenagement|aménagement|chantier|grand[s-]?projet|cadre[ -]de[ -]vie|renovation|rénovation|equipement|équipement|construction|amenager|concertation|mobilit|logement|ecoquartier|écoquartier|zac)/.test(target)) {
      try {
        const abs = new URL(href, finalUrl);
        if (abs.host === finalUrl.host && !links.some((l) => l.url === abs.toString())) {
          links.push({ url: abs.toString(), label: stripHtml(m[2]).slice(0, 80) || abs.pathname });
        }
      } catch { /* href invalide */ }
    }
  }
  // Sous-pages projets en parallèle : 5 pages ne doivent pas rallonger la phase
  const subPages = await inChunks(links.slice(0, 5), 5, async (link) => {
    const page = await fetchCapped(link.url, { headers: UA }, 6000, 400000);
    if (!page) return null;
    const text = stripHtml(page.data).slice(0, 5000);
    return { link, page, text };
  });
  for (const sp of subPages) {
    if (!sp) continue;
    collectPdfLinks(sp.page.data, sp.page.url, out.pdfs);
    collectImages(sp.page.data, sp.page.url, out.images);
    if (sp.text.length > 400) {
      out.pages.push({ url: sp.link.url, title: sp.link.label, text: sp.text });
      out.urls.push(sp.link.url);
      onFinding?.({ kind: 'page', title: sp.link.label, domain: out.host });
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
    item.text = [(ogDesc || ''), body.slice(0, 2500)].filter(Boolean).join(' | ');
    onFinding?.({ kind: 'article', title: item.title.replace(/ - [^-]+$/, ''), domain: hostOf(item.finalUrl || item.link) || item.source, date: item.date });
  });
  return items;
}

async function fetchBoamp(communeNom, onFinding) {
  try {
    const url = new URL('https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records');
    url.searchParams.set('where', `search(objet, "${communeNom.replace(/"/g, '')}")`);
    url.searchParams.set('order_by', 'dateparution desc');
    url.searchParams.set('limit', '10');
    const r = await fetchWithTimeout(url.toString());
    if (!r.ok) return [];
    const data = await r.json();
    const rows = (data.results || [])
      .map((rec) => ({
        title: String(rec.objet || '').slice(0, 240),
        date: String(rec.dateparution || ''),
        link: rec.url_avis || 'https://www.boamp.fr/',
      }))
      .filter((x) => x.title);
    rows.slice(0, 7).forEach((x) => onFinding?.({ kind: 'boamp', title: x.title.slice(0, 110), date: x.date }));
    return rows;
  } catch {
    return [];
  }
}

/* ─── IA : API Responses (retry réseau, appel structuré + variante streamée) ─── */

// POST vers l'API Responses, avec retry sur erreur réseau ("fetch failed") et
// backoff croissant : survit aux coupures de socket transitoires (bursts)
async function postOpenAI(body, timeoutMs = 120000, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetchWithTimeout(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs);
    } catch (e) {
      lastErr = e;
      // e.cause.code precise la nature (ECONNRESET socket, ENOTFOUND dns...)
      console.warn(`[demo-generate] OpenAI fetch échec (${e?.message}${e?.cause?.code ? '/' + e.cause.code : ''}), retry ${i + 1}/${tries}`);
      await sleep(500 * (i + 1));
    }
  }
  throw lastErr;
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
async function openAIStructured(input, schemaName, schema, maxTokens, timeoutMs = 120000, temperature = 0.2) {
  const r = await postOpenAI({
    model: OPENAI_MODEL,
    input,
    text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
    max_output_tokens: maxTokens,
    temperature,
  }, timeoutMs);
  if (!r.ok) throw new Error(`IA indisponible (${r.status})`);
  const text = outputTextOf(JSON.parse(await readBody(r)));
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

function buildSourcesBundle({ mairie, news, boamp }) {
  const parts = [];
  for (const p of mairie.pages) {
    parts.push(`SOURCE OFFICIELLE [${p.url}] (${p.title}) :\n${p.text}`);
  }
  for (const n of news) {
    parts.push(`ARTICLE DE PRESSE [${n.finalUrl || n.link}] (${n.source || hostOf(n.finalUrl || n.link)}, ${n.date}) :\nTitre : ${n.title}\n${n.text || '(contenu non accessible, titre seul)'}`);
  }
  if (boamp.length) {
    parts.push('MARCHÉS PUBLICS BOAMP :\n' + boamp.map((b) => `- [${b.link}] (${b.date}) ${b.title}`).join('\n'));
  }
  return parts.join('\n\n---\n\n');
}

async function extractCandidates(commune, bundle, onTitle) {
  const system = `Tu dépouilles des sources web au sujet de la commune de ${commune.nom}. Extrais TOUS les projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES concernant cette commune précise (jusqu'à 24, sois exhaustif : ne laisse passer aucun projet réel mentionné dans les sources). Pour chacun : une citation exacte copiée mot pour mot d'une source (evidence_quote) et l'URL de cette source (source_url, obligatoirement une URL présente entre crochets dans les sources). Ignore : événements, politique, faits divers, autres communes, généralités sans projet.`;
  // Résilient : le flux OpenAI revient parfois vide (aléa constaté) -> une
  // passe non streamée en secours plutôt que d'interrompre toute la démo
  const out = await callOpenAIResilient(system, `SOURCES :\n\n${bundle}`, 'candidats', CANDIDATES_SCHEMA, 8000, onTitle);
  return out.candidates || [];
}

async function selectProjects(commune, candidates, bundle, onTitle) {
  const system = `Tu es un rédacteur territorial exigeant. À partir des candidats extraits et des sources, compose la sélection finale des projets de ${commune.nom}. Retiens CHAQUE projet réel et distinct attesté par les sources : si 10 projets distincts sont vérifiés, rends-en 10 (jusqu'à 12). Ne vise pas un chiffre rond, ne résume pas la liste, n'élague pas les projets modestes. Règles :
- Uniquement des projets physiques et localisables DANS la commune, actuels (en cours, récents ou annoncés).
- Ne fusionne que deux entrées qui désignent EXACTEMENT le même projet au même endroit. Un parking, une résidence rénovée, un équipement (piscine, EHPAD, crématorium, médiathèque), une voie réaménagée, un espace public sont des projets DISTINCTS, même situés dans le même quartier.
- confidence "haute" si la citation atteste clairement le projet ; "moyenne" si l'information est réelle mais partielle ; "basse" seulement si douteux (il sera écarté).
- status : "livre" si inauguré/achevé, "en-cours" si travaux engagés, "a-l-etude" si concertation/projet annoncé non démarré, "inconnu" si indéterminable.
- category_slug (catégorie dominante) : urbanisme (ZAC, aménagement large), renovation-urbaine (réhabilitation de quartier/logement social), mobilite (voirie, transport, pistes cyclables, gare), environnement (nature, eau, énergie), equipement-public (école, gymnase, médiathèque, hôpital), patrimoine (monument, église, château), economique (zone d'activité, commerces), logement, cadre-de-vie (espaces publics, parcs, places).
- description : 2 à 4 phrases sobres et factuelles, dates si connues, zéro superlatif, en français impeccable.
- place : le lieu géocodable le plus précis mentionné (rue, quartier, équipement), chaîne vide sinon.
- geo_query : la MEILLEURE requête pour localiser ce projet sur une carte OpenStreetMap dans la commune. Adresse précise (n° + rue) si elle figure dans les sources, sinon le nom EXACT de l'équipement ou du quartier/lieu-dit. C'est ce texte qui sera envoyé au géocodeur : sois précis, fidèle au nom réel, sans le mot "projet" ni de verbe (écris "Centre nautique Robert Sautin", pas "Rénovation du centre nautique").
- source_url : reprends l'URL de la source qui atteste le projet.`;
  const user = `CANDIDATS :\n${JSON.stringify(candidates, null, 1)}\n\nSOURCES (pour vérification) :\n\n${bundle.slice(0, 30000)}`;
  const out = await callOpenAIResilient(system, user, 'selection_finale', FINAL_SCHEMA, 6000, onTitle);
  return out.projects || [];
}

async function writeArticles(commune, projects, pdfs, onTitle) {
  const system = `Tu es un rédacteur territorial. Pour CHAQUE projet fourni (index conservé), écris un article markdown de 150 à 250 mots destiné aux habitants de ${commune.nom} : 2 phrases d'introduction, une section "## Ce qui change" (2 à 4 puces concrètes), une section "## Calendrier" seulement si des dates sont connues. Si un des documents PDF fournis correspond CLAIREMENT au projet, ajoute une section "## Documents" avec le lien markdown ; sinon aucune section Documents. Termine toujours par : *Fiche générée automatiquement à partir de sources publiques : [NOM_DU_MEDIA](URL_SOURCE).* Ton sobre et factuel, aucun superlatif, rien d'inventé au-delà des informations fournies.`;
  const user = `PROJETS :\n${JSON.stringify(projects.map((p, i) => ({
    index: i,
    title: p.title,
    description: p.description,
    status: STATUS_LABELS[p.status] || '',
    place: p.place,
    source_url: p.source_url,
    source_media: hostOf(p.source_url),
  })), null, 1)}\n\nDOCUMENTS PDF DISPONIBLES :\n${pdfs.length ? pdfs.map((p) => `- [${p.label}](${p.url})`).join('\n') : '(aucun)'}`;
  const out = await callOpenAIResilient(system, user, 'articles_projets', ARTICLES_SCHEMA, 9000, onTitle, 0.4);
  return out.articles || [];
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
    }], 'couleur_logo', HEX_COLOR_SCHEMA, 60, 25000);
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

// BAN (adresses officielles), scopé sur la commune : rapide, sans quota
async function banGeocode(q, commune, bbox) {
  try {
    const u = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&citycode=${commune.code}&limit=1`;
    const r = await fetchWithTimeout(u);
    if (r.ok) {
      const f = (await r.json()).features?.[0];
      if (f && f.properties?.score > 0.35 && geometryInBbox(f.geometry, bbox)) {
        return { geometry: f.geometry, method: 'adresse' };
      }
    }
  } catch { /* BAN indisponible */ }
  return null;
}

// Géocodage complet d'une requête : Nominatim (emprises/tracés réels) puis BAN
async function geocodeOne(q, commune, bbox) {
  try {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('q', `${q}, ${commune.nom}`);
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('polygon_geojson', '1');
    u.searchParams.set('countrycodes', 'fr');
    u.searchParams.set('limit', '1');
    const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
    if (r.ok) {
      const hit = (await r.json())[0];
      if (hit?.geojson && (hit.display_name || '').toLowerCase().includes(commune.nom.toLowerCase().slice(0, 8))) {
        const g = hit.geojson;
        if (['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'].includes(g.type) && geometryInBbox(g, bbox)) {
          return { geometry: g, method: g.type.includes('Line') ? 'trace' : 'emprise' };
        }
        if (g.type === 'Point' && geometryInBbox(g, bbox)) return { geometry: g, method: 'adresse' };
      }
    }
  } catch { /* Nominatim indisponible : BAN ensuite */ }
  await sleep(1050); // politique d'usage Nominatim : 1 requête/seconde
  return banGeocode(q, commune, bbox);
}

// Répartition de repli dans l'emprise RÉELLE de la commune (spirale d'angle
// d'or) au lieu d'empiler les points sur le centre-ville
function scatterInCommune(center, bbox, index) {
  if (bbox) {
    const halfW = (bbox.maxLng - bbox.minLng) * 0.30;
    const halfH = (bbox.maxLat - bbox.minLat) * 0.30;
    const a = index * 2.399963; // angle d'or : dispersion régulière non alignée
    const rad = 0.35 + 0.6 * (((index * 7) % 11) / 11);
    return {
      geometry: { type: 'Point', coordinates: [center.lng + Math.cos(a) * halfW * rad, center.lat + Math.sin(a) * halfH * rad] },
      method: 'centre',
    };
  }
  const angle = (index * 2 * Math.PI) / 12;
  return {
    geometry: { type: 'Point', coordinates: [center.lng + 0.004 * Math.cos(angle), center.lat + 0.003 * Math.sin(angle)] },
    method: 'centre',
  };
}

// allowNetwork=false (budget de temps dépassé) : repli direct, aucun appel réseau
async function locateProject(project, commune, bbox, index, allowNetwork = true) {
  const center = { lng: commune.centre.coordinates[0], lat: commune.centre.coordinates[1] };
  if (allowNetwork) {
    // Requêtes de géocodage fournies par l'IA (geo_query optimisée, puis place),
    // dédoublonnées en gardant l'ordre
    const seen = new Set();
    const queries = [];
    for (const q of [project.geo_query, project.place]) {
      const t = String(q || '').trim();
      if (t.length >= 3 && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); queries.push(t); }
    }
    for (const q of queries) {
      const hit = await geocodeOne(q, commune, bbox);
      if (hit) return hit;
    }
  }
  return scatterInCommune(center, bbox, index);
}

/* ─── Illustrations libres (Wikimedia Commons), pertinence jugée par l'IA ─── */

// Pré-filtre bon marché : jamais de blason/logo/carte/SVG envoyé à la vision
const COMMONS_BLOCKLIST = /(blason|logo|coat[_ ]of[_ ]arms|carte|\bmap\b|\bplan\b|flag|drapeau|armoiries|diagram|\.svg|\.tif|\.pdf)/i;

// Mappe une réponse Commons (query.pages) en candidats {url,title,credit},
// filtrés par la blocklist (blasons, logos, cartes...)
function commonsPagesToCandidates(data) {
  const out = [];
  for (const page of Object.values(data?.query?.pages || {})) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const meta = info.extmetadata || {};
    const title = String(page.title || '').replace(/^File:/i, '');
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
async function gatherImageCandidates(project, communeNom, lat, lng, mairieImages = []) {
  // Les deux collectes independantes en parallele (un RTT economise par projet)
  const [fromSource, near] = await Promise.all([
    project.source_url ? sourceImageCandidates(project.source_url) : Promise.resolve([]),
    commonsCandidatesAt(lat, lng, 300),
  ]);
  // Images des pages "grands projets" de la mairie : souvent les vrais visuels
  const fromMairie = mairieImages.slice(0, 8).map((url) => ({ url, title: 'Visuel du site de la mairie', credit: `Source : ${communeNom}` }));
  const wide = (fromSource.length + near.length) >= 4 ? [] : await commonsCandidatesAt(lat, lng, 750);
  let pool = [...fromSource, ...fromMairie, ...near, ...wide];
  if (pool.length < 3) {
    const q = `${project.place || project.title} ${communeNom}`.trim();
    pool = [...pool, ...await commonsTextCandidates(q)];
  }
  const seen = new Set();
  const all = [];
  for (const c of pool) {
    if (seen.has(c.url) || all.length >= 8) continue;
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
      content.push({ type: 'input_image', image_url: c.url });
    });
    const out = await openAIStructured([{ role: 'user', content }], 'choix_image', IMAGE_CHOICE_SCHEMA, 60, 30000);
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
      // Identité visuelle : theme-color du site, sinon couleur dominante du logo
      if (!m.themeColor && m.logoUrl) m.themeColor = await dominantColorFromLogo(m.logoUrl);
      if (m.host) finding({ kind: 'logo', title: m.host, iconUrl: m.logoUrl, color: m.themeColor });
      const bits = [];
      if (m.host) bits.push(m.host);
      if (m.logoUrl) bits.push('logo récupéré');
      if (m.themeColor) bits.push('couleurs de la commune extraites');
      if (m.pages.length > 1) bits.push(`${m.pages.length - 1} page(s) projets lue(s)`);
      if (m.pdfs.length) bits.push(`${m.pdfs.length} document(s) officiel(s)`);
      step('mairie', m.host ? 'done' : 'skip', 'Site officiel de la mairie', bits.join(' · ') || 'non exploitable');
      return m;
    })(),
    (async () => {
      const n = await fetchLocalNews(commune.nom, commune.departement?.nom, finding);
      step('news', n.length ? 'done' : 'skip', 'Presse locale', `${n.length} article(s) récents analysés`);
      return n;
    })(),
    (async () => {
      const b = await fetchBoamp(commune.nom, finding);
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

  console.log(`[demo-generate] ai1 depouillement ${commune.nom} : ~${words} mots`);
  step('ai1', 'start', 'Dépouillement des sources par l\'IA', `${state.stats.sources} sources, ~${words.toLocaleString('fr-FR')} mots à lire`);
  const candidates = await extractCandidates(commune, bundle, (title) => send({ type: 'ai-item', phase: 'ai1', title }));
  console.log(`[demo-generate] ai1 -> ${candidates.length} candidats`);
  step('ai1', 'done', 'Sources dépouillées', `${candidates.length} projet(s) candidat(s) repéré(s)`);

  step('ai2', 'start', 'Sélection et vérification des projets', 'Chaque projet doit citer sa source mot pour mot');
  let projects = candidates.length
    ? await selectProjects(commune, candidates, bundle, (title) => send({ type: 'ai-item', phase: 'ai2', title }))
    : [];

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
  console.log(`[demo-generate] ai2 -> ${projects.length} projets retenus (${beforeFilter} avant filtre source, ${candidates.length} candidats)`);

  if (projects.length < 3) {
    send({ type: 'error', message: `Les sources publiques ne suffisent pas pour une carte fidèle de ${commune.nom} (${projects.length} projet(s) vérifié(s)). Avec vos documents, la carte complète se monte en quelques jours : parlons-en.` });
    return null;
  }
  step('ai2', 'done', 'Projets vérifiés', `${projects.length} projets attestés par les sources`);
  send({ type: 'projects', items: projects.map((p) => ({ title: p.title, category_slug: p.category_slug, status: STATUS_LABELS[p.status] || '' })) });

  state.projects = projects;
  state.stats.words = words;
  state.stats.candidates = candidates.length;
  // Le paquet de sources ne sert plus : on allège le brouillon
  state.mairie.pages = [];
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
  const located = [];
  const METHOD_LABELS = { emprise: 'emprise réelle trouvée', trace: 'tracé réel trouvé', adresse: 'adresse précise', centre: 'position approchée dans la commune' };
  // Budget de temps : Nominatim (1 req/s) etant lent, on borne la phase pour
  // ne jamais faire expirer l'invocation ; au-dela, repli reparti sans reseau
  const GEO_BUDGET_MS = 32000;
  const geoStart = Date.now();
  for (let i = 0; i < projects.length; i++) {
    const allowNetwork = Date.now() - geoStart < GEO_BUDGET_MS;
    const loc = await locateProject(projects[i], communeShim, bbox, i, allowNetwork);
    const c = centroidOf(loc.geometry);
    // Plafond aussi au stockage : une emprise Nominatim géante retombe en point
    if (JSON.stringify(loc.geometry).length >= 15000) {
      loc.geometry = { type: 'Point', coordinates: [c.lng, c.lat] };
    }
    located.push({ ...projects[i], ...loc });
    send({
      type: 'geo-item',
      title: projects[i].title,
      method: loc.method,
      label: METHOD_LABELS[loc.method],
      category_slug: projects[i].category_slug,
      lat: c.lat,
      lng: c.lng,
      geometry: (loc.method !== 'centre' && loc.geometry.type !== 'Point') ? loc.geometry : null,
    });
  }
  const precise = located.filter((p) => p.method !== 'centre').length;
  console.log(`[demo-generate] geo ${state.commune.nom}: ${precise}/${located.length} localisés précisément`);
  step('geo', 'done', 'Projets localisés', `${precise}/${located.length} emplacements précis`);

  state.located = located;
  state.projects = [];
  state.stats.verified = located.length;
  state.stats.precise = precise;
  return state;
}

// Phase ILLUSTRATIONS : candidats (sources + mairie + Commons) puis juge visuel
async function coreMedia(send, step, state) {
  const { located } = state;
  const mairieImages = state.mairie?.images || [];
  console.log(`[demo-generate] media: ${located.length} projets, ${mairieImages.length} images mairie en pool`);
  step('media', 'start', 'Recherche des illustrations des projets', 'Chaque image est choisie par l\'IA selon le sujet');
  const images = await inChunks(located, 6, async (p) => {
    const c = centroidOf(p.geometry);
    const candidates = await gatherImageCandidates(p, state.commune.nom, c.lat, c.lng, mairieImages);
    return pickBestImageWithAI(p, state.commune.nom, candidates);
  });
  let illustrated = 0;
  const usedCovers = new Set(); // pas deux fois la même image sur des fiches différentes
  for (let i = 0; i < located.length; i++) {
    // Pas de photo de repli hors sujet : sans illustration pertinente, on
    // n'en met aucune (une vignette qui ne colle pas casse la crédibilité)
    const img = images[i];
    if (img && !usedCovers.has(img.url)) {
      usedCovers.add(img.url);
      located[i].coverSrc = img.url;
      located[i].coverCredit = img.credit;
      illustrated++;
      const c = centroidOf(located[i].geometry);
      // coverSrc + coordonnées : le front pose la photo directement sur la carte
      send({ type: 'media-item', title: located[i].title, credit: img.credit, coverSrc: img.url, lat: c.lat, lng: c.lng });
    }
  }
  console.log(`[demo-generate] media: ${illustrated}/${located.length} illustrés`);
  step('media', illustrated ? 'done' : 'skip', 'Illustrations trouvées', `${illustrated}/${located.length} projets illustrés (image choisie par l'IA)`);

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
  const state = await core(send, step, instance.payload);
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
      const img = await fetchCapped(p.coverSrc, { headers: UA }, FETCH_TIMEOUT_MS, 4500000, true);
      if (!img) return null;
      const ct = img.headers.get('content-type') || 'image/jpeg';
      const url = await uploadToStorage(`demo/${ville}/${slugs[i]}-cover.jpg`, img.data, ct);
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
    const statusLabel = STATUS_LABELS[p.status] || '';
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
      tags: statusLabel ? [statusLabel] : null,
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
          // Idempotence : reprendre là où une génération précédente s'est arrêtée
          let already = await getInstance({ commune_insee: insee });
          // Échec définitif frais : réponse immédiate sans re-brûler d'appels IA ;
          // au-delà de 7 jours, on repart de zéro (de nouvelles sources existent)
          if (already?.status === 'failed') {
            const ageMs = Date.now() - new Date(already.created_at).getTime();
            if (ageMs < 7 * 24 * 3600 * 1000) {
              step('resolve', 'done', 'Commune reconnue', already.commune_nom);
              send({ type: 'error', message: `Les sources publiques ne suffisent pas encore pour une carte fidèle de ${already.commune_nom}. Avec vos documents, la carte complète se monte en quelques jours : parlons-en.` });
              controller.close();
              return;
            }
            await deleteWhere('demo_instances', { ville: `eq.${already.ville}` });
            already = null;
          }
          const RESUME = { 'draft-sources': 'ai', 'draft-ai': 'locate', 'draft-locate': 'media', 'draft-media': 'redact', 'draft': 'create' };
          if (already?.status === 'ready') {
            step('resolve', 'done', 'Commune reconnue', already.commune_nom);
            step('exists', 'done', 'Espace déjà généré', 'On vous y emmène');
            send({ type: 'done', url: `/?city=${already.ville}`, ville: already.ville, communeNom: already.commune_nom, existing: true });
          } else if (RESUME[already?.status]) {
            step('resolve', 'done', 'Commune reconnue', already.commune_nom);
            step('exists', 'done', 'Analyse déjà engagée', 'Reprise là où elle s\'était arrêtée');
            send({ type: 'phase', next: RESUME[already.status], ville: already.ville });
          } else {
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
              await updateInstance(villeParam, { status: 'failed', payload: null });
              retryable = false;
              console.error(`[demo-generate] ${villeParam} declaree en ECHEC apres ${attempts} tentatives sur phase=${phase}`);
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
