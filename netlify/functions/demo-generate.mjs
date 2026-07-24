/* ============================================================================
   FONCTION DEMO-GENERATE - route /api/demo-generate (SSE)

   Génère en direct l'espace de démo d'une commune : collecte multi-sources
   (site de la mairie + pages projets internes, presse locale lue en entier,
   marchés publics BOAMP), sélection par IA en deux passes (extraction avec
   citations, puis critique/fusion), géolocalisation hybride (emprises réelles
   OSM/Nominatim, sinon adresse BAN, sinon centre), création de l'espace
   complet aux couleurs de la commune (logo + theme-color du site officiel).

   Chaque étape et chaque trouvaille émettent un événement SSE consommé par
   l'écran /demo/ (mode salon). Villes créées sous le préfixe `essai-` :
   exclues du sitemap et du llms.txt, noindex (voir demo/README.md pour la
   désinstallation complète).

   Garde-fous : idempotence par commune, quotas jour par IP et global,
   projets rejetés si source non collectée, confiance basse ou hors commune.
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

/* ─── Helpers ─── */

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
  // Marge de 15 % : un projet en limite de commune reste valide
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

// Annuaire de l'administration (DILA) : site web officiel de la mairie
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

// Site de la mairie : identité (logo, couleur) + texte + pages internes projets/travaux
async function inspectMairieSite(siteUrl, onFinding) {
  const out = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [] };
  let html = '';
  let finalUrl = null;
  try {
    const r = await fetchWithTimeout(siteUrl, { headers: UA });
    if (!r.ok) return out;
    finalUrl = new URL(r.url);
    out.host = finalUrl.host;
    out.urls.push(r.url);
    html = (await r.text()).slice(0, 500000);
    out.pages.push({ url: r.url, title: 'Accueil du site de la mairie', text: stripHtml(html).slice(0, 5000) });
  } catch {
    return out;
  }

  // Couleur de marque : meta theme-color (écarte blanc/noir quasi purs)
  const color = /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,8})["']/.exec(html)
    || /<meta[^>]+content=["'](#[0-9a-fA-F]{3,8})["'][^>]+name=["']theme-color["']/.exec(html);
  if (color) {
    const hex = color[1].toLowerCase().slice(0, 7);
    if (!/^#(fff|ffffff|000|000000|f8f8f8|fefefe)$/.test(hex)) out.themeColor = hex;
  }

  // Logo : apple-touch-icon > icon le plus grand > /favicon.ico
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

  // Pages internes prometteuses : projets, travaux, urbanisme, aménagement
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
    try {
      const r = await fetchWithTimeout(link.url, { headers: UA }, 6000);
      if (!r.ok) continue;
      const text = stripHtml((await r.text()).slice(0, 400000)).slice(0, 5000);
      if (text.length > 400) {
        out.pages.push({ url: link.url, title: link.label, text });
        out.urls.push(link.url);
        onFinding?.({ kind: 'page', title: link.label, domain: out.host });
      }
    } catch { /* page suivante */ }
  }
  return out;
}

// Presse locale : flux RSS Google News, puis lecture des articles ouverts
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

  // Lecture du contenu des articles (par lots de 3, sites fermés ignorés)
  for (let i = 0; i < Math.min(items.length, 9); i += 3) {
    await Promise.all(items.slice(i, i + 3).map(async (item) => {
      try {
        const r = await fetchWithTimeout(item.link, { headers: UA }, 6000);
        if (!r.ok) return;
        item.finalUrl = r.url;
        const html = (await r.text()).slice(0, 400000);
        const ogDesc = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1];
        const body = stripHtml(html);
        item.text = [(ogDesc || ''), body.slice(0, 2500)].filter(Boolean).join(' | ');
        onFinding?.({ kind: 'article', title: item.title.replace(/ - [^-]+$/, ''), domain: hostOf(item.finalUrl || item.link) || item.source, date: item.date });
      } catch { /* article fermé : titre + extrait RSS suffisent */ }
    }));
  }
  return items;
}

// Marchés publics récents (BOAMP open data)
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

/* ─── IA : deux passes ─── */

async function callOpenAI(system, user, schemaName, schema, maxTokens) {
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
  }, 90000);
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`IA indisponible (${r.status}) ${errText.slice(0, 200)}`);
  }
  const data = await r.json();
  const text = data.output_text
    || data.output?.flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text;
  if (!text) throw new Error('Réponse IA vide');
  return JSON.parse(text);
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

async function extractCandidates(commune, bundle) {
  const system = `Tu dépouilles des sources web au sujet de la commune de ${commune.nom}. Extrais TOUS les projets d'aménagement, de travaux ou d'équipement CONCRETS et PHYSIQUES concernant cette commune précise (jusqu'à 20). Pour chacun : une citation exacte copiée mot pour mot d'une source (evidence_quote) et l'URL de cette source (source_url, obligatoirement une URL présente entre crochets dans les sources). Ignore : événements, politique, faits divers, autres communes, généralités sans projet.`;
  const out = await callOpenAI(system, `SOURCES :\n\n${bundle}`, 'candidats', CANDIDATES_SCHEMA, 4000);
  return out.candidates || [];
}

async function selectProjects(commune, candidates, bundle) {
  const system = `Tu es un rédacteur territorial exigeant. À partir des candidats extraits et des sources, compose la sélection finale des projets de ${commune.nom} (5 à 10 si la matière le permet, moins sinon). Règles :
- Uniquement des projets physiques et localisables DANS la commune, actuels (en cours, récents ou annoncés). Fusionne les doublons.
- confidence "haute" seulement si la citation atteste clairement le projet ; "basse" si douteux (il sera écarté).
- description : 2 à 4 phrases sobres et factuelles, dates si connues, zéro superlatif, en français impeccable.
- place : le lieu géocodable le plus précis mentionné (rue, quartier, équipement), chaîne vide sinon.
- source_url : reprends l'URL de la source qui atteste le projet.`;
  const user = `CANDIDATS :\n${JSON.stringify(candidates, null, 1)}\n\nSOURCES (pour vérification) :\n\n${bundle.slice(0, 30000)}`;
  const out = await callOpenAI(system, user, 'selection_finale', FINAL_SCHEMA, 3200);
  return out.projects || [];
}

/* ─── Localisation hybride : emprise OSM > adresse BAN > centre ─── */

async function locateProject(project, commune, bbox, index) {
  const center = { lng: commune.centre.coordinates[0], lat: commune.centre.coordinates[1] };
  if (project.place) {
    // 1. Nominatim avec emprise réelle (polygone de bâtiment, tracé de rue...)
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
    await sleep(1100); // politique d'usage Nominatim : 1 requête/seconde

    // 2. Adresse BAN
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
  // 3. Anneau autour du centre (évite l'empilement)
  const angle = (index * 2 * Math.PI) / 10;
  return {
    geometry: { type: 'Point', coordinates: [center.lng + 0.004 * Math.cos(angle), center.lat + 0.003 * Math.sin(angle)] },
    method: 'centre',
  };
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

async function insertRows(table, rows) {
  const r = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...serviceHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Insertion ${table} : ${r.status} ${t.slice(0, 200)}`);
  }
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

async function existingInstance(insee) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/demo_instances`);
  url.searchParams.set('select', 'ville,commune_nom');
  url.searchParams.set('commune_insee', `eq.${insee}`);
  const r = await fetchWithTimeout(url.toString(), { headers: serviceHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

/* ─── Handler SSE ─── */

export default async (req, context) => {
  const url = new URL(req.url);
  const insee = (url.searchParams.get('commune') || '').toUpperCase();

  if (!/^\d{2}[0-9AB]\d{2}$/.test(insee)) {
    return new Response(JSON.stringify({ error: 'Paramètre commune invalide (code INSEE attendu)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const step = (id, status, label, detail = '') => send({ type: 'step', id, status, label, detail });
      const finding = (f) => send({ type: 'finding', ...f });
      const t0 = Date.now();

      // Battement de cœur : sans octets pendant ~30 s (appels IA), la réponse
      // streamée est coupée par l'infrastructure. Un commentaire SSE toutes les
      // 5 s maintient la connexion (ignoré par EventSource côté client).
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping ${Date.now() - t0}\n\n`)); } catch { /* flux fermé */ }
      }, 5000);

      try {
        // 0. Idempotence + quotas
        const already = await existingInstance(insee);
        if (already) {
          step('resolve', 'done', 'Commune reconnue', already.commune_nom);
          step('exists', 'done', 'Espace déjà généré', 'Redirection vers la carte existante');
          send({ type: 'done', url: `/?city=${already.ville}`, ville: already.ville, communeNom: already.commune_nom, existing: true });
          controller.close();
          return;
        }
        const ipHash = (await sha256Hex(context?.ip || 'inconnu')).slice(0, 24);
        const [byIp, global] = await Promise.all([countToday('ip_hash', ipHash), countToday(null, null)]);
        if (global >= MAX_GLOBAL_PER_DAY || byIp >= MAX_PER_IP_PER_DAY) {
          send({ type: 'error', message: 'Le quota de démonstrations du jour est atteint. Contactez-nous pour une démo guidée.' });
          controller.close();
          return;
        }

        // 1. Commune
        step('resolve', 'start', 'Recherche de la commune');
        const commune = await resolveCommune(insee);
        if (!commune?.centre) {
          send({ type: 'error', message: 'Commune introuvable. Vérifiez la saisie.' });
          controller.close();
          return;
        }
        const bbox = bboxOfContour(commune.contour);
        step('resolve', 'done', 'Commune reconnue',
          `${commune.nom} · ${commune.departement?.nom || ''} · ${(commune.population || 0).toLocaleString('fr-FR')} habitants`);

        // 2. Site de la mairie (identité + pages projets)
        step('mairie', 'start', 'Visite du site officiel de la mairie');
        const site = await findMairieWebsite(insee);
        let mairie = { pages: [], logoUrl: null, themeColor: null, host: null, urls: [] };
        if (site) {
          mairie = await inspectMairieSite(site, finding);
          const bits = [];
          if (mairie.host) bits.push(mairie.host);
          if (mairie.logoUrl) bits.push('logo récupéré');
          if (mairie.themeColor) bits.push('couleur de la commune détectée');
          if (mairie.pages.length > 1) bits.push(`${mairie.pages.length - 1} page(s) projets lue(s)`);
          step('mairie', mairie.host ? 'done' : 'skip', 'Site officiel de la mairie', bits.join(' · ') || 'non exploitable');
        } else {
          step('mairie', 'skip', 'Site officiel de la mairie', "non renseigné dans l'annuaire officiel");
        }

        // 3. Presse locale (lecture des articles)
        step('news', 'start', 'Lecture de la presse locale');
        const news = await fetchLocalNews(commune.nom, commune.departement?.nom, finding);
        step('news', news.length ? 'done' : 'skip', 'Presse locale', `${news.length} article(s) récents analysés`);

        // 4. Marchés publics
        step('boamp', 'start', 'Consultation des marchés publics (BOAMP)');
        const boamp = await fetchBoamp(commune.nom, finding);
        step('boamp', boamp.length ? 'done' : 'skip', 'Marchés publics', `${boamp.length} avis trouvé(s)`);

        if (!mairie.pages.length && !news.length && !boamp.length) {
          send({ type: 'error', message: `Pas assez de sources publiques exploitables pour ${commune.nom}. Passez nous voir : on prépare la carte avec vous, avec vos documents.` });
          controller.close();
          return;
        }

        // 5. IA passe 1 : extraction exhaustive avec citations
        step('ai1', 'start', 'Dépouillement des sources par l\'IA');
        const bundle = buildSourcesBundle({ mairie, news, boamp });
        const candidates = await extractCandidates(commune, bundle);
        step('ai1', 'done', 'Sources dépouillées', `${candidates.length} projet(s) candidat(s) repéré(s)`);

        // 6. IA passe 2 : critique, fusion, rédaction
        step('ai2', 'start', 'Sélection et vérification des projets');
        let projects = candidates.length ? await selectProjects(commune, candidates, bundle) : [];

        // Verrous serveur : source réellement collectée + confiance suffisante
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
          controller.close();
          return;
        }
        step('ai2', 'done', 'Projets vérifiés', `${projects.length} projets attestés par les sources`);
        send({ type: 'projects', items: projects.map((p) => ({ title: p.title, category_slug: p.category_slug, status: STATUS_LABELS[p.status] || '' })) });

        // 7. Localisation hybride
        step('geo', 'start', 'Localisation des projets');
        const located = [];
        const METHOD_LABELS = { emprise: 'emprise réelle trouvée', trace: 'tracé réel trouvé', adresse: 'adresse précise', centre: 'placé au centre-ville' };
        for (let i = 0; i < projects.length; i++) {
          const loc = await locateProject(projects[i], commune, bbox, i);
          located.push({ ...projects[i], ...loc });
          send({ type: 'geo-item', title: projects[i].title, method: loc.method, label: METHOD_LABELS[loc.method] });
        }
        const real = located.filter((p) => p.method !== 'centre').length;
        step('geo', 'done', 'Projets localisés', `${real}/${located.length} emplacements précis`);

        // 8. Création de l'espace
        step('create', 'start', `Création de l'espace de ${commune.nom}`);
        const ville = `${VILLE_PREFIX}${slugify(commune.nom)}`;

        let logoUrl = null;
        if (mairie.logoUrl) {
          try {
            const ir = await fetchWithTimeout(mairie.logoUrl, { headers: UA });
            if (ir.ok) {
              const ct = ir.headers.get('content-type') || 'image/png';
              if (/image|icon|octet/.test(ct)) {
                const ext = ct.includes('svg') ? 'svg' : ct.includes('jpeg') ? 'jpg' : ct.includes('ico') ? 'ico' : 'png';
                logoUrl = await uploadToStorage(`branding/${ville}/logo.${ext}`, await ir.arrayBuffer(), ct);
              }
            }
          } catch { /* logo facultatif */ }
        }

        const population = commune.population || 0;
        // zoom entier (contrainte du schéma city_branding)
        const zoom = population > 100000 ? 12 : population > 20000 ? 13 : population > 5000 ? 14 : 15;
        await insertRows('city_branding', [{
          ville,
          brand_name: commune.nom,
          // logo_url et primary_color sont NOT NULL : replis neutres si la
          // mairie n'a ni favicon exploitable ni meta theme-color
          logo_url: logoUrl || 'https://openprojets.com/home/img/logos/classic_color.png',
          center_lat: commune.centre.coordinates[1],
          center_lng: commune.centre.coordinates[0],
          zoom,
          primary_color: mairie.themeColor || '#14AE5C',
          enabled_toggles: ['filters', 'basemap', 'theme', 'search', 'info'],
          travaux: false,
        }]);
        await insertRows('city_modules', [{
          ville, module_key: 'carte', label: 'Menu', icon_class: 'fas fa-map', sort_order: 0, enabled: true, config: {},
        }]);

        const rows = [];
        for (const p of located) {
          const slug = `${slugify(p.title)}-${Math.random().toString(36).slice(2, 6)}`;
          const fc = {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: p.geometry, properties: { name: p.title } }],
          };
          const geojsonUrl = await uploadToStorage(`demo/${ville}/${slug}.geojson`, JSON.stringify(fc), 'application/json');
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
            tags: statusLabel ? [statusLabel] : null,
            approved: true,
          });
        }
        await insertRows('contribution_uploads', rows);
        await insertRows('demo_instances', [{
          ville,
          commune_insee: insee,
          commune_nom: commune.nom,
          ip_hash: ipHash,
          projects_count: rows.length,
          duration_ms: Date.now() - t0,
        }]);
        step('create', 'done', 'Espace créé', `${rows.length} projets sur la carte de ${commune.nom}`);

        send({ type: 'done', url: `/?city=${ville}`, ville, communeNom: commune.nom, projectsCount: rows.length });
      } catch (err) {
        console.error('[demo-generate]', err);
        send({ type: 'error', message: 'Un imprévu est survenu pendant la génération. Réessayez, ou passez nous voir pour une démo guidée.' });
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
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = { path: '/api/demo-generate' };
