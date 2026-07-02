/* ============================================================================
   EDGE FUNCTION — Hub ville : /ville/{ville}

   Rend côté serveur la liste complète des projets d'une ville :
   • <title>, meta description, OG/Twitter, canonical, robots
   • JSON-LD (CollectionPage + ItemList + BreadcrumbList)
   • Contenu HTML complet : en-tête, tags catégories, grille de cards,
     section carte (initialisée côté client), CTA vers la carte interactive
   • Couleur primaire de la ville injectée en <style> (zéro flash)

   Le client (ville/ville-hub.js) n'ajoute que l'interactivité :
   filtrage par tags, bascule Liste/Carte, thème. Pas de double rendu.

   ⚠️  Toujours passer une FONCTION à html.replace() quand le remplacement
   contient du contenu venant de la base : une chaîne y ferait interpréter
   les séquences $ ($&, $`, $') comme motifs de remplacement JavaScript.
   ============================================================================ */

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
const BASE_ORIGIN = 'https://openprojets.com';

// Plafond de rendu : au-delà, la liste est tronquée aux plus récents et un
// lien renvoie vers la carte interactive (seule 'france' dépasse aujourd'hui)
const MAX_PROJECTS = 200;

/* ─── Helpers ─── */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };

function escAttr(str) {
  return String(str || '').replace(/[&"<>]/g, c => ESC_MAP[c]);
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ESC_MAP[c]);
}

/** Tronque un texte à ~maxLen caractères sur une coupure de mot */
function truncate(text, maxLen = 160) {
  if (!text || text.length <= maxLen) return text || '';
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '…';
}

/** Transforme un slug en label lisible : "metropole-lyon" → "Metropole Lyon" */
function humanize(slug) {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Supprime les marqueurs markdown pour obtenir du texte brut */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/>\s*/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^(https?:|mailto:|#)/i.test(u)) return u;
  // Chemins relatifs au site — mais pas les URLs protocol-relative (//host)
  if (u.startsWith('/') && !/^\/[/\\]/.test(u)) return u;
  return '';
}

/** URL absolue http(s) — pour og:image (les scrapers ignorent le relatif) */
function absUrl(url) {
  const u = safeUrl(url);
  if (!u) return '';
  if (u.startsWith('/')) return BASE_ORIGIN + u;
  return /^https?:/i.test(u) ? u : '';
}

const SUPABASE_HOST = new URL(SUPABASE_URL).host;

/** URL de fichier Storage : restreinte à l'hôte Supabase (le geojson est
    fetché par le client — empêche un geojson_url forgé de baliser un tiers) */
function safeStorageUrl(url) {
  const u = safeUrl(url);
  if (!u) return '';
  try { return new URL(u, BASE_ORIGIN).host === SUPABASE_HOST ? u : ''; }
  catch { return ''; }
}

/** N'autorise que les ancres http(s) dans une attribution ; tout le reste
    (scripts, <img onerror>, styles) est réduit à son texte — la valeur vient
    de basemaps_v2 mais finit en innerHTML dans AttributionControl */
function sanitizeAttribution(html) {
  return String(html || '')
    .replace(/<(?!\/?a\b)[^>]*>/gi, '')
    .replace(/<a\b[^>]*>/gi, tag => {
      const m = tag.match(/href\s*=\s*["']?(https?:\/\/[^"'\s>]+)/i);
      return m ? `<a href="${m[1].replace(/"/g, '&quot;')}" rel="noopener noreferrer" target="_blank">` : '';
    })
    .replace(/<\/a>/gi, '</a>');
}

/** Valide une classe d'icône Font Awesome venant de la base */
function safeIconClass(cls) {
  const c = String(cls || '').trim();
  return /^[a-z0-9 -]{1,60}$/i.test(c) ? c : 'fa-solid fa-layer-group';
}

/** Valide une couleur hex venant de la base */
function safeHexColor(color) {
  const c = String(color || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(c) ? c : '';
}

/** Mêmes exclusions que sitemap.mjs — entrées de test e2e */
function isTestEntry(name, cat) {
  const n = String(name || '').toLowerCase();
  const c = String(cat || '').toLowerCase();
  return n.startsWith('e2e-') || n.startsWith('e2e_') || n.startsWith('test ') || n === 'test'
    || c.startsWith('e2e-') || c.startsWith('e2e_');
}

/** Headers du shell statique privés de leurs validateurs de cache : on sert un
    corps réécrit (≠ du shell), donc son ETag/Last-Modified ne doivent pas fuiter
    — sinon une revalidation renverrait 304 + corps vide → page blanche cachée */
function safeShellHeaders(response) {
  const h = Object.fromEntries(response.headers.entries());
  delete h.etag;
  delete h['last-modified'];
  delete h.age;
  // On repose systématiquement ces headers : les retirer évite qu'une clé
  // minuscule du shell coexiste avec la clé capitalisée qu'on ajoute
  // (Headers fusionnerait les deux valeurs en une liste)
  delete h['cache-control'];
  delete h['content-type'];
  return h;
}

/* ─── Supabase REST ─── */

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

async function fetchRows(path, params) {
  const url = new URL(`/rest/v1/${path}`, SUPABASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), { headers: supaHeaders });
  if (!resp.ok) return [];
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

function fetchProjects(ville) {
  return fetchRows('contribution_uploads', {
    select: 'project_name,description,cover_url,category,category_slug,slug,ville,created_at,geojson_url',
    ville: `eq.${ville}`,
    approved: 'eq.true',
    order: 'created_at.desc',
    limit: String(MAX_PROJECTS + 1), // +1 pour détecter la troncature
  });
}

function fetchCityBranding(ville) {
  return fetchRows('city_branding', {
    select: 'brand_name,logo_url,dark_logo_url,primary_color,center_lat,center_lng,zoom',
    ville: `eq.${ville}`,
    limit: '1',
  }).then(rows => rows[0] || null);
}

function fetchCategoryIcons(ville) {
  return fetchRows('category_icons', {
    select: 'category,icon_class,display_order,category_styles',
    ville: `eq.${ville}`,
    order: 'display_order.asc',
  });
}

/** Module travaux de la ville (le label est piloté par l'admin, jamais hardcodé) */
function fetchTravauxModule(ville) {
  return fetchRows('city_modules', {
    select: 'label',
    ville: `eq.${ville}`,
    module_key: 'eq.travaux',
    enabled: 'eq.true',
    limit: '1',
  }).then(rows => (rows.length > 0 ? { enabled: true, label: rows[0].label || 'Travaux' } : { enabled: false, label: '' }));
}

/** Fonds de carte actifs (mêmes données que l'app carte via uimodule) */
function fetchBasemaps() {
  return fetchRows('basemaps_v2', {
    select: 'name,label,kind,url,style_url,attribution,theme',
    active: 'eq.true',
    order: 'sort_order.asc',
  });
}

/* ─── Agrégation catégories ─── */

/**
 * Groupe les projets par catégorie, enrichis par category_icons
 * (icône, couleur, ordre — données pilotées par la base, jamais hardcodées).
 */
function buildCategories(projects, categoryIcons) {
  const iconByCategory = new Map(categoryIcons.map(ci => [ci.category, ci]));
  const cats = new Map();

  for (const p of projects) {
    if (!p.category || !p.category_slug) continue;
    if (!cats.has(p.category_slug)) {
      const ci = iconByCategory.get(p.category);
      cats.set(p.category_slug, {
        slug: p.category_slug,
        label: p.category,
        icon: safeIconClass(ci?.icon_class),
        color: safeHexColor(ci?.category_styles?.color),
        order: Number.isFinite(ci?.display_order) ? ci.display_order : 999,
        count: 0,
      });
    }
    cats.get(p.category_slug).count += 1;
  }

  return [...cats.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fr'));
}

/* ─── JSON-LD ─── */

function buildJsonLd(villeSlug, villeLabel, metaDesc, canonical, projects) {
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Les grands projets de ${villeLabel}`,
    description: metaDesc,
    url: canonical,
    inLanguage: 'fr',
    isPartOf: { '@type': 'WebSite', name: 'Open Projets', url: BASE_ORIGIN },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: projects.length,
      itemListElement: projects.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.project_name,
        url: `${BASE_ORIGIN}/fiche/${encodeURIComponent(p.ville)}/${encodeURIComponent(p.category_slug)}/${encodeURIComponent(p.slug)}`,
      })),
    },
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Open Projets', item: BASE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: villeLabel, item: canonical },
    ],
  };
  return { collection, breadcrumb };
}

/* ─── Rendu HTML ─── */

function renderCard(p) {
  const name = escHtml(p.project_name);
  const href = `/fiche/${encodeURIComponent(p.ville)}/${encodeURIComponent(p.category_slug)}/${encodeURIComponent(p.slug)}`;
  const excerpt = escHtml(truncate(stripMarkdown(p.description || ''), 160));
  const cover = safeUrl(p.cover_url);
  const geojson = safeStorageUrl(p.geojson_url);
  const color = safeHexColor(p._catColor);
  // Texte agrégé pour la recherche client (nom + catégorie + description)
  const haystack = escAttr(`${p.project_name} ${p.category} ${stripMarkdown(p.description || '')}`.toLowerCase());

  const media = cover
    ? `<img src="${escAttr(cover)}" alt="" loading="lazy" width="480" height="270">`
    : `<span class="vh-card__ph" aria-hidden="true"><i class="${escAttr(p._catIcon)}"></i></span>`;

  return `
      <article class="vh-card" data-cat="${escAttr(p.category_slug)}"${color ? ` style="--cat-color:${color}"` : ''}${geojson ? ` data-geojson="${escAttr(geojson)}"` : ''} data-name="${escAttr(p.project_name)}" data-url="${escAttr(href)}" data-search="${haystack}">
        <a class="vh-card__link" href="${escAttr(href)}">
          <figure class="vh-card__media">${media}<span class="vh-card__grad" aria-hidden="true"></span></figure>
          <div class="vh-card__body">
            <span class="vh-card__pill"><i class="${escAttr(p._catIcon)}" aria-hidden="true"></i>${escHtml(p.category)}</span>
            <h2 class="vh-card__title">${name}</h2>
            ${excerpt ? `<p class="vh-card__excerpt">${excerpt}</p>` : ''}
            <span class="vh-card__more">Voir le projet <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
          </div>
        </a>
      </article>`;
}

function renderTag(cat) {
  return `
          <button type="button" class="vh-tag" data-cat="${escAttr(cat.slug)}" aria-pressed="false"${cat.color ? ` style="--tag-color:${cat.color}"` : ''}>
            <span class="vh-tag__dot" aria-hidden="true"></span>
            <span>${escHtml(cat.label)}</span>
            <span class="vh-tag__count">${cat.count}</span>
          </button>`;
}

function buildContent({ villeSlug, villeLabel, projects, categories, branding, truncated, travaux }) {
  const n = projects.length;
  const mapAppUrl = `/?city=${encodeURIComponent(villeSlug)}`;
  const multiCat = categories.length > 1;
  const showSearch = n > 8; // la recherche n'a de sens qu'au-delà d'une poignée de projets
  const projectWord = n > 1 ? 'projets' : 'projet';

  const dataAttrs = [
    `data-ville="${escAttr(villeSlug)}"`,
    `data-label="${escAttr(villeLabel)}"`,
    `data-map-url="${escAttr(mapAppUrl)}"`,
    branding?.center_lat != null ? `data-center-lat="${escAttr(String(branding.center_lat))}"` : '',
    branding?.center_lng != null ? `data-center-lng="${escAttr(String(branding.center_lng))}"` : '',
    branding?.zoom != null ? `data-zoom="${escAttr(String(branding.zoom))}"` : '',
    branding?.logo_url ? `data-logo="${escAttr(safeUrl(branding.logo_url))}"` : '',
    branding?.dark_logo_url ? `data-logo-dark="${escAttr(safeUrl(branding.dark_logo_url))}"` : '',
  ].filter(Boolean).join(' ');

  // Héros : la carte de la ville en fond (hydratée par le client), titre + CTA
  // par-dessus un dégradé. Le fond dégradé reste visible si la carte ne charge pas.
  const hero = `
      <header class="vh-hero" id="vh-hero">
        <div class="vh-hero__map" id="vh-hero-map" aria-hidden="true"></div>
        <div class="vh-hero__scrim" aria-hidden="true"></div>
        <div class="vh-hero__inner">
          <nav class="vh-breadcrumb" aria-label="Fil d'Ariane">
            <a href="/">Open Projets</a>
            <span aria-hidden="true">›</span>
            <span aria-current="page">${escHtml(villeLabel)}</span>
          </nav>
          <h1 class="vh-hero__title">Les grands projets de ${escHtml(villeLabel)}</h1>
          <p class="vh-hero__intro">${n} ${projectWord}${multiCat ? ` dans ${categories.length} catégories` : ''} — description, avancement et carte pour chaque projet.</p>
          <a class="vh-cta" id="vh-open-map" href="${escAttr(mapAppUrl)}">
            <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i>
            <span>Ouvrir la carte interactive${travaux.enabled ? ' et les travaux' : ''}</span>
          </a>
        </div>
      </header>`;

  // Barre de filtres : chips catégories (si &gt;1), recherche (si beaucoup),
  // et compteur de résultats annoncé aux lecteurs d'écran
  const filterbar = `
      <div class="vh-filterbar" id="vh-filterbar">
        ${multiCat ? `
        <div class="vh-tags" role="group" aria-label="Filtrer par catégorie">
          <button type="button" class="vh-tag is-active" data-cat="" aria-pressed="true">
            <span>Tous</span><span class="vh-tag__count">${n}</span>
          </button>${categories.map(renderTag).join('')}
        </div>` : ''}
        <div class="vh-filterbar__end">
          ${showSearch ? `
          <label class="vh-search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" id="vh-search" placeholder="Rechercher un projet…" aria-label="Rechercher un projet" autocomplete="off">
          </label>` : ''}
          <p class="vh-count" id="vh-count" role="status" aria-live="polite">${n} ${projectWord}</p>
        </div>
      </div>`;

  return `
    <div class="vh-content" id="vh-content" ${dataAttrs}>
${hero}
${filterbar}

      <section class="vh-grid" id="vh-grid" aria-label="Projets de la ville">${projects.map(renderCard).join('')}
      </section>

      <p class="vh-empty" id="vh-empty" hidden>
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        Aucun projet ne correspond à cette recherche.
      </p>

      ${truncated ? `<p class="vh-note">Les ${MAX_PROJECTS} projets les plus récents sont affichés — l'intégralité est explorable sur la carte interactive.</p>` : ''}

      <footer class="vh-foot">
        <span class="vh-foot__b2b">Vous représentez une collectivité ?
          <a href="/home/">Découvrir Open Projets</a>
        </span>
      </footer>

    </div>`;
}

/* ─── Injection dans la coquille ─── */

function injectIntoHtml(html, { villeLabel, metaDesc, canonical, ogImage, jsonLd, brandColor, basemapsJson, content }) {
  const title = `${villeLabel} : les grands projets urbains à suivre | Open Projets`;

  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escHtml(title)}</title>`);
  html = html.replace(/(<meta\s+name="robots"\s+content=")[^"]*"/, (_, p1) => `${p1}index, follow, max-image-preview:large, max-snippet:-1"`);
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(metaDesc)}"`);
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*"/, (_, p1) => `${p1}${escAttr(canonical)}"`);
  html = html.replace(/(<link\s+rel="alternate"\s+hreflang="fr"\s+href=")[^"]*"/, (_, p1) => `${p1}${escAttr(canonical)}"`);
  html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(title)}"`);
  html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(metaDesc)}"`);
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(canonical)}"`);
  html = html.replace(/(<meta\s+property="og:image"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(ogImage)}"`);
  html = html.replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(title)}"`);
  html = html.replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(metaDesc)}"`);
  html = html.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(ogImage)}"`);

  // JSON-LD : CollectionPage + ItemList, puis BreadcrumbList.
  // < encodé en < : un project_name contenant </script> ne peut pas
  // fermer le bloc et injecter du HTML (XSS stocké)
  const ldJson = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
  const jsonLdBlock = `<script type="application/ld+json" id="vh-jsonld">${ldJson(jsonLd.collection)}</script>
  <script type="application/ld+json">${ldJson(jsonLd.breadcrumb)}</script>`;
  html = html.replace(/<script\s+type="application\/ld\+json"\s+id="vh-jsonld">[^<]*<\/script>/, () => jsonLdBlock);

  // Couleur primaire de la ville — injectée avant </head> pour un rendu sans flash
  if (brandColor) {
    html = html.replace(/(<meta\s+name="theme-color"\s+content=")[^"]*"/, (_, p1) => `${p1}${brandColor}"`);
    html = html.replace('</head>', () => `  <style id="vh-brand">:root { --color-primary: ${brandColor}; }</style>\n</head>`);
  }

  // Fonds de carte (basemaps_v2) — injectés pour la vue carte, sans fetch client
  // (les < du JSON sont encodés en < : aucun </script> ne peut s'échapper)
  if (basemapsJson) {
    html = html.replace('</head>', () => `  <script id="vh-basemaps">window.basemaps = ${basemapsJson};</script>\n</head>`);
  }

  // Contenu principal
  html = html.replace(/<!--VH:CONTENT-START-->[\s\S]*?<!--VH:CONTENT-END-->/, () => content);

  return html;
}

/* ═══════════════ EDGE FUNCTION HANDLER ═══════════════ */

export default async (request, context) => {
  const url = new URL(request.url);

  // Format strict : /ville/{ville} — tout segment supplémentaire est refusé
  // (sinon /ville/x/n-importe-quoi servirait un duplicata indexable du hub)
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  let villeSlug = '';
  try {
    villeSlug = decodeURIComponent(parts[1] || '').toLowerCase();
  } catch {
    // percent-encoding invalide (/ville/%zz) → coquille, jamais de 500
    return await context.next();
  }

  // Slug absent/invalide ou segments en trop → coquille statique (noindex par défaut)
  if (!villeSlug || parts.length > 2 || !/^[a-z0-9-]{1,60}$/.test(villeSlug)) {
    return await context.next();
  }

  // Lancer le fetch de la page statique immédiatement : il ne dépend d'aucune
  // donnée Supabase — l'aller-retour origin recouvre les fetchs et le rendu
  const responsePromise = context.next();

  let projects = [];
  let branding = null;
  let categoryIcons = [];
  let travaux = { enabled: false, label: '' };
  let basemaps = [];
  try {
    [projects, branding, categoryIcons, travaux, basemaps] = await Promise.all([
      fetchProjects(villeSlug),
      fetchCityBranding(villeSlug),
      fetchCategoryIcons(villeSlug),
      fetchTravauxModule(villeSlug),
      fetchBasemaps(),
    ]);
  } catch (e) {
    console.error('[ville-hub] Fetch Supabase échoué:', e);
  }

  // La fenêtre de fetch (MAX+1) déborde dès qu'il y a plus de MAX projets
  // réels : on mesure la troncature AVANT le filtre pour ne rien masquer
  const truncated = projects.length > MAX_PROJECTS;
  projects = projects
    .filter(p => p.project_name && p.category_slug && p.slug && !isTestEntry(p.project_name, p.category))
    .slice(0, MAX_PROJECTS);

  // Ville sans projet → coquille servie en 200 mais jamais indexée.
  // On repart des headers du shell en retirant les validateurs de cache
  // (sinon une revalidation 304 renverrait un corps vide).
  if (projects.length === 0) {
    const response = await responsePromise;
    return new Response(response.body, {
      status: 200,
      headers: { ...safeShellHeaders(response), 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  const categories = buildCategories(projects, categoryIcons);
  const catBySlug = new Map(categories.map(c => [c.slug, c]));
  for (const p of projects) {
    const cat = catBySlug.get(p.category_slug);
    p._catIcon = cat?.icon || 'fa-solid fa-layer-group';
    p._catColor = cat?.color || '';
  }

  const villeLabel = branding?.brand_name || humanize(villeSlug);
  const canonical = `${BASE_ORIGIN}/ville/${encodeURIComponent(villeSlug)}`;
  const metaDesc = truncate(
    `Les ${projects.length} grands projets de ${villeLabel} : ${categories.map(c => c.label).join(', ')}. Description, avancement et carte pour chaque projet.`,
    160
  );
  const ogImage = absUrl(projects.find(p => p.cover_url)?.cover_url)
    || absUrl(branding?.logo_url)
    || `${BASE_ORIGIN}/img/cover/meta.png`;
  const brandColor = safeHexColor(branding?.primary_color);
  const jsonLd = buildJsonLd(villeSlug, villeLabel, metaDesc, canonical, projects);
  const content = buildContent({ villeSlug, villeLabel, projects, categories, branding, truncated, travaux });

  // Basemaps assainis (champs attendus uniquement) pour la vue carte client
  const basemapsSafe = basemaps
    .filter(b => b && (safeUrl(b.style_url) || safeUrl(b.url)))
    .map(b => ({
      name: String(b.name || ''),
      label: String(b.label || ''),
      kind: b.kind === 'raster' ? 'raster' : 'vector',
      url: safeUrl(b.url),
      style_url: safeUrl(b.style_url),
      attribution: sanitizeAttribution(b.attribution),
      theme: b.theme === 'dark' ? 'dark' : 'light',
    }));
  const basemapsJson = basemapsSafe.length
    ? JSON.stringify(basemapsSafe).replace(/</g, '\\u003c')
    : '';

  const response = await responsePromise;
  let html = await response.text();

  // Garde-fou : si l'origin a répondu sans corps (304/vide), servir tel quel
  // plutôt qu'une page blanche — le client réessaiera sans validateur
  if (!html) {
    return new Response(response.body, {
      status: response.status === 304 ? 200 : response.status,
      headers: { ...safeShellHeaders(response), 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  html = injectIntoHtml(html, { villeLabel, metaDesc, canonical, ogImage, jsonLd, brandColor, basemapsJson, content });

  return new Response(html, {
    status: 200,
    headers: {
      ...safeShellHeaders(response),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, max-age=60, stale-while-revalidate=600',
      'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1',
    },
  });
};

export const config = {
  path: '/ville/*',
  // Ne pas exécuter pour les assets statiques
  excludedPath: ['/ville/*.css', '/ville/*.js', '/ville/*.map'],
  // Honore le Cache-Control retourné (sinon la réponse edge n'est pas cachée
  // par le CDN et chaque hit refait les requêtes Supabase + le rendu)
  cache: 'manual',
};
