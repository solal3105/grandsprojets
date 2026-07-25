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

/* ─── Schémas de sortie IA ─── */

const CANDIDATES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      maxItems: 20,
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
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Nom court et propre du projet, sans le nom de la commune' },
          description: { type: 'string', description: '2 à 4 phrases factuelles en français, dates si connues, aucun superlatif' },
          category_slug: { type: 'string', enum: Object.keys(CATEGORIES) },
          status: { type: 'string', enum: Object.keys(STATUS_LABELS) },
          place: { type: 'string', description: 'Lieu géocodable le plus précis (rue, quartier, équipement), vide si inconnu' },
          source_url: { type: 'string' },
          confidence: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
        },
        required: ['title', 'description', 'category_slug', 'status', 'place', 'source_url', 'confidence'],
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
      maxItems: 10,
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
  onFinding?.({ kind: 'logo', title: out.host, iconUrl: out.logoUrl, color: out.themeColor });

  const links = [];
  const aRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  while ((m = aRe.exec(html)) !== null && links.length < 60) {
    const href = m[1];
    const label = stripHtml(m[2]).toLowerCase();
    const target = `${href} ${label}`.toLowerCase();
    if (/(projet|travaux|urbanisme|amenagement|aménagement|chantier|grand[s-]?projet|cadre[ -]de[ -]vie)/.test(target)) {
      try {
        const abs = new URL(href, finalUrl);
        if (abs.host === finalUrl.host && !links.some((l) => l.url === abs.toString())) {
          links.push({ url: abs.toString(), label: stripHtml(m[2]).slice(0, 80) || abs.pathname });
        }
      } catch { /* href invalide */ }
    }
  }
  for (const link of links.slice(0, 3)) {
    const page = await fetchCapped(link.url, { headers: UA }, 6000, 400000);
    if (!page) continue;
    const text = stripHtml(page.data).slice(0, 5000);
    collectPdfLinks(page.data, page.url, out.pdfs);
    if (text.length > 400) {
      out.pages.push({ url: link.url, title: link.label, text });
      out.urls.push(link.url);
      onFinding?.({ kind: 'page', title: link.label, domain: out.host });
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
    `"${communeNom}" (travaux OR chantier) ${departement || ''}`,
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
      while ((m = itemRe.exec(xml)) !== null && items.length < 14) {
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

  await inChunks(items.slice(0, 9), 3, async (item) => {
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
    url.searchParams.set('limit', '8');
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
    rows.slice(0, 5).forEach((x) => onFinding?.({ kind: 'boamp', title: x.title.slice(0, 110), date: x.date }));
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
  const system = `Tu dépouilles des sources web au sujet de la commune de ${commune.nom}. Extrais TOUS les projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES concernant cette commune précise (jusqu'à 20). Pour chacun : une citation exacte copiée mot pour mot d'une source (evidence_quote) et l'URL de cette source (source_url, obligatoirement une URL présente entre crochets dans les sources). Ignore : événements, politique, faits divers, autres communes, généralités sans projet.`;
  const out = await callOpenAI(system, `SOURCES :\n\n${bundle}`, 'candidats', CANDIDATES_SCHEMA, 4000, onTitle);
  return out.candidates || [];
}

async function selectProjects(commune, candidates, bundle, onTitle) {
  const system = `Tu es un rédacteur territorial exigeant. À partir des candidats extraits et des sources, compose la sélection finale des projets de ${commune.nom} (5 à 10 si la matière le permet, moins sinon). Règles :
- Uniquement des projets physiques et localisables DANS la commune, actuels (en cours, récents ou annoncés). Fusionne les doublons.
- confidence "haute" seulement si la citation atteste clairement le projet ; "basse" si douteux (il sera écarté).
- description : 2 à 4 phrases sobres et factuelles, dates si connues, zéro superlatif, en français impeccable.
- place : le lieu géocodable le plus précis mentionné (rue, quartier, équipement), chaîne vide sinon.
- source_url : reprends l'URL de la source qui atteste le projet.`;
  const user = `CANDIDATS :\n${JSON.stringify(candidates, null, 1)}\n\nSOURCES (pour vérification) :\n\n${bundle.slice(0, 30000)}`;
  const out = await callOpenAIResilient(system, user, 'selection_finale', FINAL_SCHEMA, 3200, onTitle);
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
  const out = await callOpenAIResilient(system, user, 'articles_projets', ARTICLES_SCHEMA, 4500, onTitle);
  return out.articles || [];
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

async function locateProject(project, commune, bbox, index) {
  const center = { lng: commune.centre.coordinates[0], lat: commune.centre.coordinates[1] };
  if (project.place) {
    try {
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.searchParams.set('q', `${project.place}, ${commune.nom}`);
      u.searchParams.set('format', 'jsonv2');
      u.searchParams.set('polygon_geojson', '1');
      u.searchParams.set('countrycodes', 'fr');
      u.searchParams.set('limit', '1');
      const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
      if (r.ok) {
        const results = await r.json();
        const hit = results[0];
        if (hit?.geojson && (hit.display_name || '').toLowerCase().includes(commune.nom.toLowerCase().slice(0, 8))) {
          const g = hit.geojson;
          if (['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'].includes(g.type) && geometryInBbox(g, bbox)) {
            return { geometry: g, method: g.type.includes('Line') ? 'trace' : 'emprise' };
          }
          if (g.type === 'Point' && geometryInBbox(g, bbox)) {
            return { geometry: g, method: 'adresse' };
          }
        }
      }
    } catch { /* Nominatim indisponible : BAN ensuite */ }
    await sleep(1050); // politique d'usage Nominatim : 1 requête/seconde

    try {
      const u = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(project.place)}&citycode=${commune.code}&limit=1`;
      const r = await fetchWithTimeout(u);
      if (r.ok) {
        const d = await r.json();
        const f = d.features?.[0];
        if (f && f.properties?.score > 0.35 && geometryInBbox(f.geometry, bbox)) {
          return { geometry: f.geometry, method: 'adresse' };
        }
      }
    } catch { /* BAN indisponible : centre ensuite */ }
  }
  const angle = (index * 2 * Math.PI) / 10;
  return {
    geometry: { type: 'Point', coordinates: [center.lng + 0.004 * Math.cos(angle), center.lat + 0.003 * Math.sin(angle)] },
    method: 'centre',
  };
}

/* ─── Illustrations libres (Wikimedia Commons) ─── */

const COMMONS_BLOCKLIST = /(blason|logo|carte|map|flag|armoiries|plan[_ ]de|\.svg|\.tif|\.pdf)/i;

async function commonsImageAt(lat, lng, radius) {
  try {
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    u.searchParams.set('action', 'query');
    u.searchParams.set('format', 'json');
    u.searchParams.set('generator', 'geosearch');
    u.searchParams.set('ggscoord', `${lat}|${lng}`);
    u.searchParams.set('ggsradius', String(radius));
    u.searchParams.set('ggslimit', '5');
    u.searchParams.set('ggsnamespace', '6');
    u.searchParams.set('prop', 'imageinfo');
    u.searchParams.set('iiprop', 'url|extmetadata');
    u.searchParams.set('iiurlwidth', '1200');
    u.searchParams.set('origin', '*');
    const r = await fetchWithTimeout(u.toString(), { headers: UA }, 7000);
    if (!r.ok) return null;
    const data = await r.json();
    const pages = Object.values(data?.query?.pages || {});
    for (const page of pages) {
      if (COMMONS_BLOCKLIST.test(page.title || '')) continue;
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;
      const meta = info.extmetadata || {};
      const artist = stripHtml(meta.Artist?.value || '').slice(0, 60) || 'auteur inconnu';
      const license = meta.LicenseShortName?.value || 'licence libre';
      return { url: info.thumburl, credit: `${artist}, Wikimedia Commons (${license})` };
    }
  } catch { /* Commons indisponible : pas d'illustration */ }
  return null;
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
    const bits = [];
    if (mairie.host) bits.push(mairie.host);
    if (mairie.logoUrl) bits.push('logo récupéré');
    if (mairie.themeColor) bits.push('couleur de la commune détectée');
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

async function coreGeoMedia(send, step, state) {
  const { projects, bbox } = state;
  const communeShim = {
    nom: state.commune.nom,
    code: state.commune.code,
    centre: { coordinates: [state.commune.lng, state.commune.lat] },
  };

  step('geo', 'start', 'Localisation des projets', 'Emprises réelles OpenStreetMap, adresses officielles BAN');
  const located = [];
  const METHOD_LABELS = { emprise: 'emprise réelle trouvée', trace: 'tracé réel trouvé', adresse: 'adresse précise', centre: 'placé au centre-ville' };
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

  step('media', 'start', 'Recherche d\'illustrations libres de droits', 'Wikimedia Commons : photos prises sur place');
  let communeFallbackImg = null;
  const images = await inChunks(located.map((p, i) => ({ p, i })), 4, async ({ p }) => {
    const c = centroidOf(p.geometry);
    return commonsImageAt(c.lat, c.lng, 350);
  });
  let illustrated = 0;
  for (let i = 0; i < located.length; i++) {
    let img = images[i];
    if (!img) {
      if (communeFallbackImg === null) {
        communeFallbackImg = await commonsImageAt(state.commune.lat, state.commune.lng, 2500) || false;
      }
      img = communeFallbackImg || null;
    }
    if (img) {
      located[i].coverSrc = img.url;
      located[i].coverCredit = img.credit;
      illustrated++;
      send({ type: 'media-item', title: located[i].title, credit: img.credit });
    }
  }
  step('media', illustrated ? 'done' : 'skip', 'Illustrations trouvées', `${illustrated}/${located.length} projets illustrés (photos libres de droits)`);

  state.located = located;
  state.projects = [];
  state.stats.verified = located.length;
  state.stats.precise = precise;
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
    const s3 = await coreGeoMedia(send, step, s2);
    await coreRedact(send, step, s3);
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
  const state = await coreGeoMedia(send, step, instance.payload);
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
  createItem('Navigation et catégories configurées');

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
          const RESUME = { 'draft-sources': 'ai', 'draft-ai': 'locate', 'draft-media': 'redact', 'draft': 'create' };
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
