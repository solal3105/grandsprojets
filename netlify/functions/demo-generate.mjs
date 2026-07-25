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
          summary: { type: 'string' },
          evidence_quote: { type: 'string', description: 'Citation exacte, copiée mot pour mot depuis une source fournie' },
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

// Garde anti-SSRF : jamais de fetch sortant vers du privé/loopback
const PRIVATE_HOST_RE = /^(localhost$|.*\.local$|.*\.internal$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i;
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
    if (!r.ok || !r.body) return null;
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

async function inspectMairieSite(siteUrl, onFinding) {
  const out = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [] };
  const home = await fetchCapped(siteUrl, { headers: UA }, FETCH_TIMEOUT_MS, 500000);
  if (!home) return out;
  const finalUrl = new URL(home.url);
  out.host = finalUrl.host;
  out.urls.push(home.url);
  const html = home.data;
  out.pages.push({ url: home.url, title: 'Accueil du site de la mairie', text: stripHtml(html).slice(0, 5000) });
  collectPdfLinks(html, home.url, out.pdfs);

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
    const ogDesc = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1];
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

/* ─── IA : trois passes streamées ─── */

async function callOpenAI(system, user, schemaName, schema, maxTokens, onTitle) {
  const r = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: true,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
      max_output_tokens: maxTokens,
    }),
  }, 120000);
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`IA indisponible (${r.status}) ${errText.slice(0, 200)}`);
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let titlesSeen = 0;
  const TITLE_RE = /"title"\s*:\s*"((?:[^"\\]|\\.)+)"/g;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
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
  if (!full) throw new Error('Réponse IA vide');
  return JSON.parse(full);
}

// Le flux OpenAI revient parfois vide (aléa transitoire constaté en prod) :
// une passe streamée qui échoue est retentée une fois en mode non streamé
async function callOpenAIResilient(system, user, schemaName, schema, maxTokens, onTitle) {
  try {
    return await callOpenAI(system, user, schemaName, schema, maxTokens, onTitle);
  } catch (e) {
    console.error('[demo-generate] retry IA non streamé après :', e.message);
    const r = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
        max_output_tokens: maxTokens,
      }),
    }, 120000);
    if (!r.ok) throw new Error(`IA indisponible (${r.status})`);
    const data = await r.json();
    const text = data.output_text
      || data.output?.flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text;
    if (!text) throw new Error('Réponse IA vide (retry)');
    return JSON.parse(text);
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
  const out = await callOpenAI(system, `SOURCES :\n\n${bundle}`, 'candidats', CANDIDATES_SCHEMA, 5000, onTitle);
  return out.candidates || [];
}

async function selectProjects(commune, candidates, bundle, onTitle) {
  const system = `Tu es un rédacteur territorial exigeant. À partir des candidats extraits et des sources, compose la sélection finale des projets de ${commune.nom}. Retiens CHAQUE projet réel et distinct attesté par les sources : si 10 projets distincts sont vérifiés, rends-en 10 (jusqu'à 12). Ne vise pas un chiffre rond, ne résume pas la liste, n'élague pas les projets modestes. Règles :
- Uniquement des projets physiques et localisables DANS la commune, actuels (en cours, récents ou annoncés).
- Ne fusionne que deux entrées qui désignent EXACTEMENT le même projet au même endroit. Un parking, une résidence rénovée, un équipement (piscine, EHPAD, crématorium, médiathèque), une voie réaménagée, un espace public sont des projets DISTINCTS, même situés dans le même quartier.
- confidence "haute" si la citation atteste clairement le projet ; "moyenne" si l'information est réelle mais partielle ; "basse" seulement si douteux (il sera écarté).
- description : 2 à 4 phrases sobres et factuelles, dates si connues, zéro superlatif, en français impeccable.
- place : le lieu géocodable le plus précis mentionné (rue, quartier, équipement), chaîne vide sinon.
- geo_query : la MEILLEURE requête pour localiser ce projet sur une carte OpenStreetMap dans la commune. Adresse précise (n° + rue) si elle figure dans les sources, sinon le nom EXACT de l'équipement ou du quartier/lieu-dit. C'est ce texte qui sera envoyé au géocodeur : sois précis, fidèle au nom réel, sans le mot "projet" ni de verbe (écris "Centre nautique Robert Sautin", pas "Rénovation du centre nautique").
- source_url : reprends l'URL de la source qui atteste le projet.`;
  const user = `CANDIDATS :\n${JSON.stringify(candidates, null, 1)}\n\nSOURCES (pour vérification) :\n\n${bundle.slice(0, 30000)}`;
  const out = await callOpenAIResilient(system, user, 'selection_finale', FINAL_SCHEMA, 4200, onTitle);
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
  const out = await callOpenAIResilient(system, user, 'articles_projets', ARTICLES_SCHEMA, 5500, onTitle);
  return out.articles || [];
}

// Couleur dominante du logo par vision IA : quand la mairie n'expose pas de
// meta theme-color, l'espace prend quand même la couleur de la commune
async function dominantColorFromLogo(logoUrl) {
  try {
    const r = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: 'Donne la couleur dominante de ce logo en hexadécimal #RRGGBB, en ignorant blanc, noir et gris. Choisis la couleur de marque la plus saturée et identitaire.' },
            { type: 'input_image', image_url: logoUrl },
          ],
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'couleur_logo',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { color: { type: 'string' } },
              required: ['color'],
            },
            strict: true,
          },
        },
        max_output_tokens: 60,
      }),
    }, 25000);
    if (!r.ok) return null;
    const data = await r.json();
    const text = data.output_text
      || data.output?.flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text;
    const hex = JSON.parse(text || '{}').color?.toLowerCase();
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

async function locateProject(project, commune, bbox, index) {
  const center = { lng: commune.centre.coordinates[0], lat: commune.centre.coordinates[1] };

  // Requêtes de géocodage fournies par l'IA (geo_query optimisée pour la carte,
  // puis place mentionné dans les sources), dédoublonnées en gardant l'ordre
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

  // Dernier recours : répartir dans l'emprise RÉELLE de la commune (spirale
  // d'angle d'or) au lieu d'empiler les points sur le centre-ville
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

/* ─── Illustrations libres (Wikimedia Commons), pertinence jugée par l'IA ─── */

// Pré-filtre bon marché : jamais de blason/logo/carte/SVG envoyé à la vision
const COMMONS_BLOCKLIST = /(blason|logo|coat[_ ]of[_ ]arms|carte|\bmap\b|\bplan\b|flag|drapeau|armoiries|diagram|\.svg|\.tif|\.pdf)/i;

async function commonsCandidatesAt(lat, lng, radius) {
  const out = [];
  try {
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    u.searchParams.set('action', 'query');
    u.searchParams.set('format', 'json');
    u.searchParams.set('generator', 'geosearch');
    u.searchParams.set('ggscoord', `${lat}|${lng}`);
    u.searchParams.set('ggsradius', String(radius));
    u.searchParams.set('ggslimit', '8');
    u.searchParams.set('ggsnamespace', '6');
    u.searchParams.set('prop', 'imageinfo');
    u.searchParams.set('iiprop', 'url|extmetadata');
    u.searchParams.set('iiurlwidth', '1024');
    u.searchParams.set('origin', '*');
    const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
    if (!r.ok) return out;
    const data = await r.json();
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
  } catch { /* Commons indisponible */ }
  return out;
}

// Recherche Commons par texte : rattrape les photos taguées au nom du lieu
// mais pas géolocalisées à proximité (fréquent pour les équipements)
async function commonsTextCandidates(query) {
  const out = [];
  try {
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    u.searchParams.set('action', 'query');
    u.searchParams.set('format', 'json');
    u.searchParams.set('generator', 'search');
    u.searchParams.set('gsrsearch', query);
    u.searchParams.set('gsrnamespace', '6');
    u.searchParams.set('gsrlimit', '6');
    u.searchParams.set('prop', 'imageinfo');
    u.searchParams.set('iiprop', 'url|extmetadata');
    u.searchParams.set('iiurlwidth', '1024');
    u.searchParams.set('origin', '*');
    const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
    if (!r.ok) return out;
    const data = await r.json();
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
  } catch { /* Commons indisponible */ }
  return out;
}

// Images de la SOURCE du projet (article de presse, page mairie) : og:image
// et images de contenu. Ce sont les plus pertinentes car elles illustrent
// littéralement le projet. Démo : la licence n'est pas un critère ici.
const IMG_SKIP_RE = /(\.svg|sprite|logo|icone?|icon|avatar|pixel|placeholder|1x1|blank|spacer|button|share|facebook|twitter|instagram)/i;
async function sourceImageCandidates(url) {
  const out = [];
  const page = await fetchCapped(url, { headers: UA }, 6000, 500000);
  if (!page) return out;
  const html = page.data;
  const base = page.url;
  const credit = `Source : ${hostOf(base) || 'web'}`;
  const push = (src, title) => {
    if (!src) return;
    try {
      const abs = new URL(src, base).toString();
      if (/^https?:/.test(abs) && !IMG_SKIP_RE.test(abs) && !out.some((o) => o.url === abs)) {
        out.push({ url: abs, title, credit });
      }
    } catch { /* src invalide */ }
  };
  const og = /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(html)
    || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)
    || /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html);
  push(og?.[1], 'illustration de la source');
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m; let n = 0;
  while ((m = imgRe.exec(html)) !== null && n < 6) {
    push(m[1], 'image de la source');
    n++;
  }
  return out.slice(0, 5);
}

// Candidats autour du projet : d'abord les images de sa source (les plus
// pertinentes), puis le geosearch Commons, complété par une recherche texte
// si besoin. Dédupliqués, plafonnés. Le juge vision tranche ensuite.
async function gatherImageCandidates(project, communeNom, lat, lng) {
  const fromSource = project.source_url ? await sourceImageCandidates(project.source_url) : [];
  const near = await commonsCandidatesAt(lat, lng, 300);
  const wide = (fromSource.length + near.length) >= 4 ? [] : await commonsCandidatesAt(lat, lng, 750);
  let pool = [...fromSource, ...near, ...wide];
  if (pool.length < 3) {
    const q = `${project.place || project.title} ${communeNom}`.trim();
    pool = [...pool, ...await commonsTextCandidates(q)];
  }
  const seen = new Set();
  const all = [];
  for (const c of pool) {
    if (seen.has(c.url) || all.length >= 6) continue;
    seen.add(c.url);
    all.push(c);
  }
  return all;
}

// L'IA REGARDE vraiment les photos et choisit celle qui illustre ce projet
// précis, ou aucune (-1). C'est le juge de pertinence : mieux vaut rien qu'une
// image hors sujet. Coût vision assumé, la crédibilité de la démo prime.
async function pickBestImageWithAI(project, communeNom, candidates) {
  if (!candidates.length) return null;
  try {
    const content = [{
      type: 'input_text',
      text: `Projet urbain à ${communeNom} : "${project.title}". ${project.description || ''}${project.place ? ` Lieu concerné : ${project.place}.` : ''}\n\nVoici ${candidates.length} photo(s) numérotée(s) de 0 à ${candidates.length - 1}. Choisis l'index de celle qui illustre le mieux CE lieu ou CE projet (le bâtiment, la rue, le quartier ou l'équipement concerné, ou une vue représentative du secteur). Si aucune ne correspond vraiment, réponds -1. Ne choisis jamais par défaut : une photo hors sujet est pire que pas de photo.`,
    }];
    candidates.forEach((c, i) => {
      content.push({ type: 'input_text', text: `Image ${i} - ${c.title}` });
      content.push({ type: 'input_image', image_url: c.url });
    });
    const r = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [{ role: 'user', content }],
        text: {
          format: {
            type: 'json_schema',
            name: 'choix_image',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { best_index: { type: 'integer' } },
              required: ['best_index'],
            },
            strict: true,
          },
        },
        max_output_tokens: 60,
      }),
    }, 25000);
    if (!r.ok) return null;
    const data = await r.json();
    const text = data.output_text
      || data.output?.flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text;
    const idx = JSON.parse(text || '{}').best_index;
    if (typeof idx !== 'number' || idx < 0 || idx >= candidates.length) return null;
    return candidates[idx];
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

  step('mairie', 'start', 'Visite du site officiel de la mairie');
  const site = await findMairieWebsite(insee);
  let mairie = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [], pdfs: [] };
  if (site) {
    mairie = await inspectMairieSite(site, finding);
    // Identité visuelle : theme-color du site, sinon couleur dominante du logo
    if (!mairie.themeColor && mairie.logoUrl) {
      mairie.themeColor = await dominantColorFromLogo(mairie.logoUrl);
    }
    if (mairie.host) {
      finding({ kind: 'logo', title: mairie.host, iconUrl: mairie.logoUrl, color: mairie.themeColor });
    }
    const bits = [];
    if (mairie.host) bits.push(mairie.host);
    if (mairie.logoUrl) bits.push('logo récupéré');
    if (mairie.themeColor) bits.push('couleurs de la commune extraites');
    if (mairie.pages.length > 1) bits.push(`${mairie.pages.length - 1} page(s) projets lue(s)`);
    if (mairie.pdfs.length) bits.push(`${mairie.pdfs.length} document(s) officiel(s)`);
    step('mairie', mairie.host ? 'done' : 'skip', 'Site officiel de la mairie', bits.join(' · ') || 'non exploitable');
  } else {
    step('mairie', 'skip', 'Site officiel de la mairie', "non renseigné dans l'annuaire officiel");
  }

  step('news', 'start', 'Lecture de la presse locale');
  const news = await fetchLocalNews(commune.nom, commune.departement?.nom, finding);
  step('news', news.length ? 'done' : 'skip', 'Presse locale', `${news.length} article(s) récents analysés`);

  step('boamp', 'start', 'Consultation des marchés publics (BOAMP)');
  const boamp = await fetchBoamp(commune.nom, finding);
  step('boamp', boamp.length ? 'done' : 'skip', 'Marchés publics', `${boamp.length} avis trouvé(s)`);

  if (!mairie.pages.length && !news.length && !boamp.length) {
    send({ type: 'error', message: `Pas assez de sources publiques exploitables pour ${commune.nom}. Passez nous voir : on prépare la carte avec vous, avec vos documents.` });
    return null;
  }

  const sourcesCount = mairie.pages.length + news.length + (boamp.length ? 1 : 0);
  return {
    commune: {
      nom: commune.nom,
      code: commune.code,
      population: commune.population || 0,
      lat: commune.centre.coordinates[1],
      lng: commune.centre.coordinates[0],
    },
    bbox,
    mairie: { host: mairie.host, logoUrl: mairie.logoUrl, themeColor: mairie.themeColor, pdfs: mairie.pdfs, pages: mairie.pages, urls: mairie.urls },
    news,
    boamp,
    stats: { sources: sourcesCount, news: news.length, boamp: boamp.length },
  };
}

async function coreAi(send, step, state) {
  const { commune, mairie, news, boamp } = state;
  const bundle = buildSourcesBundle({ mairie, news, boamp });
  const words = Math.round(bundle.length / 6);

  step('ai1', 'start', 'Dépouillement des sources par l\'IA', `${state.stats.sources} sources, ~${words.toLocaleString('fr-FR')} mots à lire`);
  const candidates = await extractCandidates(commune, bundle, (title) => send({ type: 'ai-item', phase: 'ai1', title }));
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
  projects = projects.filter((p) =>
    p.confidence !== 'basse' && (allowedUrls.has(p.source_url) || allowedHosts.has(hostOf(p.source_url)))
  );

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
  for (let i = 0; i < projects.length; i++) {
    const loc = await locateProject(projects[i], communeShim, bbox, i);
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
  step('geo', 'done', 'Projets localisés', `${precise}/${located.length} emplacements précis`);

  state.located = located;
  state.projects = [];
  state.stats.verified = located.length;
  state.stats.precise = precise;
  return state;
}

// Phase ILLUSTRATIONS : candidats Commons puis juge visuel IA, projet par projet
async function coreMedia(send, step, state) {
  const { located } = state;
  step('media', 'start', 'Recherche des illustrations des projets', 'Chaque image est choisie par l\'IA selon le sujet');
  const images = await inChunks(located, 3, async (p) => {
    const c = centroidOf(p.geometry);
    const candidates = await gatherImageCandidates(p, state.commune.nom, c.lat, c.lng);
    return pickBestImageWithAI(p, state.commune.nom, candidates);
  });
  let illustrated = 0;
  for (let i = 0; i < located.length; i++) {
    // Pas de photo de repli hors sujet : sans illustration pertinente, on
    // n'en met aucune (une vignette qui ne colle pas casse la crédibilité)
    const img = images[i];
    if (img) {
      located[i].coverSrc = img.url;
      located[i].coverCredit = img.credit;
      illustrated++;
      const c = centroidOf(located[i].geometry);
      // coverSrc + coordonnées : le front pose la photo directement sur la carte
      send({ type: 'media-item', title: located[i].title, credit: img.credit, coverSrc: img.url, lat: c.lat, lng: c.lng });
    }
  }
  step('media', illustrated ? 'done' : 'skip', 'Illustrations trouvées', `${illustrated}/${located.length} projets illustrés (image choisie par l'IA)`);

  state.located = located;
  state.stats.illustrated = illustrated;
  return state;
}

async function coreRedact(send, step, state) {
  const communeShim = {
    nom: state.commune.nom,
    code: state.commune.code,
    centre: { coordinates: [state.commune.lng, state.commune.lat] },
  };
  step('articles', 'start', 'Rédaction des articles de présentation', 'Un article sourcé par projet, avec les documents officiels');
  let articles = [];
  try {
    articles = await writeArticles(communeShim, state.located, state.mairie.pdfs, (title) => send({ type: 'article-item', title }));
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

async function runAi(send, step, ville) {
  const instance = await getInstance({ ville });
  if (!instance?.payload || instance.status !== 'draft-sources') {
    send({ type: 'error', message: 'Analyse introuvable : relancez la génération.' });
    return;
  }
  const state = await coreAi(send, step, instance.payload);
  if (!state) {
    // Échec définitif (sources insuffisantes) : statut failed, plus aucun
    // appel IA ne sera refait pour cette commune tant que le brouillon vit
    await updateInstance(ville, { status: 'failed', payload: null });
    return;
  }
  await updateInstance(ville, { status: 'draft-ai', payload: state });
  send({ type: 'phase', next: 'locate', ville });
}

async function runLocate(send, step, ville) {
  const instance = await getInstance({ ville });
  if (!instance?.payload || instance.status !== 'draft-ai') {
    send({ type: 'error', message: 'Analyse introuvable : relancez la génération.' });
    return;
  }
  const state = await coreGeo(send, step, instance.payload);
  await updateInstance(ville, { status: 'draft-locate', payload: state });
  send({ type: 'phase', next: 'media', ville });
}

async function runMedia(send, step, ville) {
  const instance = await getInstance({ ville });
  if (!instance?.payload || instance.status !== 'draft-locate') {
    send({ type: 'error', message: 'Analyse introuvable : relancez la génération.' });
    return;
  }
  const state = await coreMedia(send, step, instance.payload);
  await updateInstance(ville, { status: 'draft-media', payload: state });
  send({ type: 'phase', next: 'redact', ville });
}

async function runRedact(send, step, ville) {
  const instance = await getInstance({ ville });
  if (!instance?.payload || instance.status !== 'draft-media') {
    send({ type: 'error', message: 'Analyse introuvable : relancez la génération.' });
    return;
  }
  const state = await coreRedact(send, step, instance.payload);
  await updateInstance(ville, { status: 'draft', payload: state });
  send({ type: 'phase', next: 'create', ville });
}

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
  const rows = [];
  for (let i = 0; i < located.length; i++) {
    const p = located[i];
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
    rows.push({
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
    });
  }
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
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const step = (id, status, label, detail = '') => send({ type: 'step', id, status, label, detail });
      const t0 = Date.now();
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping ${Date.now() - t0}\n\n`)); } catch { /* flux fermé */ }
      }, 5000);

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
        console.error('[demo-generate]', err);
        send({
          type: 'error',
          message: 'Un imprévu est survenu pendant la génération. Réessayez, ou passez nous voir pour une démo guidée.',
          retryable: true,
          // Détail technique uniquement si le diagnostic est activé côté env
          ...(process.env.DEMO_DEBUG === '1' ? { debug: String(err?.message || err).slice(0, 180) } : {}),
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
