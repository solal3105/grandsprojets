/* ============================================================================
   EDGE FUNCTION — Pré-rendu SEO des fiches projet
   
   Intercepte les requêtes GET sur /fiche/?cat=…&project=…
   et injecte côté serveur :
   • <title>, meta description, OG, Twitter Cards
   • JSON-LD structuré (Article + BreadcrumbList)
   • Contenu sémantique HTML (visible par les crawlers)
   • Canonical URL
   
   Le client-side JS (fiche-v2.js) prend le relais pour la carte,
   les interactions, le markdown, etc.
   ============================================================================ */

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
const BASE_ORIGIN = 'https://grandsprojets.com';

/* ─── Helpers ─── */

function escAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Tronque un texte à ~maxLen caractères sur une coupure de mot */
function truncate(text, maxLen = 160) {
  if (!text || text.length <= maxLen) return text || '';
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '…';
}

/** Transforme un slug en label lisible : "mobilite" → "Mobilite", "sport-culture" → "Sport Culture" */
function humanizeCategory(slug) {
  if (!slug) return '';
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Supprime les marqueurs markdown pour obtenir du texte brut */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // liens → texte seul
    .replace(/#{1,6}\s*/g, '')               // titres
    .replace(/(\*\*|__)(.*?)\1/g, '$2')      // gras
    .replace(/(\*|_)(.*?)\1/g, '$2')         // italique
    .replace(/`{1,3}[^`]*`{1,3}/g, '')       // code inline/bloc
    .replace(/>\s*/g, '')                    // blockquotes
    .replace(/[-*+]\s+/g, '')               // listes
    .replace(/\n{2,}/g, ' ')                // sauts de ligne multiples
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─── Supabase REST helpers ─── */

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

async function fetchProject(category, projectName) {
  const url = new URL('/rest/v1/contribution_uploads', SUPABASE_URL);
  url.searchParams.set(
    'select',
    'project_name,description,cover_url,official_url,geojson_url,markdown_url,category,ville,created_at'
  );
  url.searchParams.set('category', `eq.${category}`);
  url.searchParams.set('project_name', `eq.${projectName}`);
  url.searchParams.set('approved', 'eq.true');
  url.searchParams.set('limit', '1');

  const resp = await fetch(url.toString(), { headers: supaHeaders });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** Récupère le label d'une catégorie depuis category_icons pour une ville donnée */
async function fetchCategoryLabel(category, ville) {
  if (!category) return humanizeCategory(category);
  const url = new URL('/rest/v1/category_icons', SUPABASE_URL);
  url.searchParams.set('select', 'category');
  url.searchParams.set('category', `eq.${category}`);
  if (ville) url.searchParams.set('ville', `eq.${ville}`);
  url.searchParams.set('limit', '1');

  try {
    const resp = await fetch(url.toString(), { headers: supaHeaders });
    if (!resp.ok) return humanizeCategory(category);
    const rows = await resp.json();
    // La table n'a pas de colonne label — le nom de la catégorie EST le label
    // On retourne une version humanisée
    if (rows?.[0]?.category) return humanizeCategory(rows[0].category);
  } catch { /* fallback */ }
  return humanizeCategory(category);
}

async function fetchRelatedProjects(category, excludeName) {
  const url = new URL('/rest/v1/contribution_uploads', SUPABASE_URL);
  url.searchParams.set('select', 'project_name,description,cover_url');
  url.searchParams.set('category', `eq.${category}`);
  url.searchParams.set('approved', 'eq.true');
  url.searchParams.set('project_name', `neq.${excludeName}`);
  url.searchParams.set('limit', '6');
  url.searchParams.set('order', 'created_at.desc');

  const resp = await fetch(url.toString(), { headers: supaHeaders });
  if (!resp.ok) return [];
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchCityBranding(ville) {
  if (!ville) return null;
  const url = new URL('/rest/v1/city_branding', SUPABASE_URL);
  url.searchParams.set('select', 'brand_name,primary_color,logo_url');
  url.searchParams.set('city_code', `eq.${ville.toLowerCase()}`);
  url.searchParams.set('limit', '1');

  const resp = await fetch(url.toString(), { headers: supaHeaders });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/* ─── JSON-LD builders ─── */

function buildArticleJsonLd(project, category, catLabel, canonical, cityBrand, structureName) {
  const name = project.project_name;
  const defaultDesc = structureName
    ? `Découvrez ${name}, projet ${catLabel} porté par ${structureName}.`
    : `Découvrez le projet ${catLabel} : ${name}.`;
  const desc = truncate(stripMarkdown(project.description || defaultDesc), 300);
  const cover = project.cover_url || `${BASE_ORIGIN}/img/cover/meta.png`;
  const created = project.created_at ? new Date(project.created_at).toISOString() : undefined;

  const publisherName = structureName || 'Carte des projets';
  const publisherLogo = cityBrand?.logo_url || `${BASE_ORIGIN}/img/logo.svg`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: name,
    description: desc,
    url: canonical,
    image: cover,
    inLanguage: 'fr',
    articleSection: catLabel,
    publisher: {
      '@type': 'Organization',
      name: publisherName,
      url: BASE_ORIGIN,
      logo: {
        '@type': 'ImageObject',
        url: publisherLogo,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
  };

  if (created) {
    ld.datePublished = created;
    ld.dateModified = created;
  }

  if (structureName) {
    ld.about = {
      '@type': 'Organization',
      name: structureName,
    };
  }

  return ld;
}

function buildBreadcrumbJsonLd(project, category, catLabel, canonical, structureName, ville) {
  const rootName = structureName || catLabel;
  const rootUrl = ville
    ? `${BASE_ORIGIN}/?city=${encodeURIComponent(ville)}`
    : BASE_ORIGIN;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: rootName,
        item: rootUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: catLabel,
        item: `${BASE_ORIGIN}/?cat=${encodeURIComponent(category)}${ville ? `&city=${encodeURIComponent(ville)}` : ''}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: project.project_name,
        item: canonical,
      },
    ],
  };
}

/* ─── HTML injection ─── */

function buildSsrContentBlock(project, category, catLabel, related, cityBrand, structureName) {
  const name = escHtml(project.project_name);
  const desc = escHtml(stripMarkdown(project.description || ''));
  const catLabelSafe = escHtml(catLabel);
  const structureNameSafe = escHtml(structureName || '');
  const ville = project.ville || '';
  const officialUrl = project.official_url || '';

  const rootHref = ville ? `/?city=${encodeURIComponent(ville)}` : '/';
  const rootLabel = structureNameSafe || catLabelSafe;

  let html = `
<!-- Contenu pré-rendu côté serveur pour le référencement -->
<div id="fv2-ssr-content" class="fv2-ssr" aria-hidden="false">
  <article itemscope itemtype="https://schema.org/Article">
    <header>
      <nav aria-label="Fil d'Ariane" class="fv2-ssr__breadcrumb">
        <a href="${escAttr(rootHref)}">${rootLabel}</a> › 
        <span>${catLabelSafe}</span> › 
        <span>${name}</span>
      </nav>
      <h1 itemprop="headline">${name}</h1>
      <div class="fv2-ssr__meta">
        <span>Catégorie : <strong>${catLabelSafe}</strong></span>`;

  if (structureNameSafe) {
    html += `
        <span> · <strong>${structureNameSafe}</strong></span>`;
  }

  html += `
      </div>
    </header>`;

  if (desc) {
    html += `
    <section>
      <p itemprop="description">${desc}</p>
    </section>`;
  }

  if (officialUrl) {
    html += `
    <section>
      <p>Site officiel : <a href="${escAttr(officialUrl)}" rel="noopener noreferrer">${escHtml(officialUrl)}</a></p>
    </section>`;
  }

  if (project.cover_url) {
    html += `
    <figure>
      <img itemprop="image" src="${escAttr(project.cover_url)}" alt="${name}" loading="lazy" width="800" height="450">
    </figure>`;
  }

  // Projets liés — maillage interne (très important pour le SEO)
  if (related && related.length > 0) {
    html += `
    <section>
      <h2>Projets similaires en ${catLabelSafe}</h2>
      <ul>`;
    for (const r of related) {
      const rName = escHtml(r.project_name);
      const rHref = `/fiche/?cat=${encodeURIComponent(category)}&project=${encodeURIComponent(r.project_name)}${ville ? `&city=${encodeURIComponent(ville)}` : ''}`;
      const rDesc = r.description ? escHtml(truncate(r.description, 120)) : '';
      html += `
        <li><a href="${escAttr(rHref)}">${rName}</a>${rDesc ? ` — ${rDesc}` : ''}</li>`;
    }
    html += `
      </ul>
    </section>`;
  }

  html += `
  </article>
</div>`;

  return html;
}

function injectIntoHtml(html, project, category, catLabel, canonical, related, cityBrand) {
  const name = project.project_name;
  const structureName = cityBrand?.brand_name
    || (project.ville ? humanizeCategory(project.ville) : '');

  const defaultDesc = structureName
    ? `Découvrez ${name}, projet ${catLabel} porté par ${structureName}.`
    : `Découvrez ${name}, un projet ${catLabel}.`;
  const metaDesc = truncate(stripMarkdown(project.description || defaultDesc), 160);
  // Image de partage = cover du projet si elle existe, sinon fallback générique
  const cover = project.cover_url || `${BASE_ORIGIN}/img/cover/meta.png`;
  const titleSuffix = structureName ? ` | ${structureName}` : '';

  // 1. <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escHtml(name)} – ${escHtml(catLabel)}${escHtml(titleSuffix)}</title>`
  );

  // 2. Meta description
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*"/,
    `$1${escAttr(metaDesc)}"`
  );

  // 3. Open Graph — site_name dynamique (nom de la structure)
  const ogSiteName = structureName || 'Carte des projets';
  html = html.replace(
    /(<meta\s+property="og:site_name"\s+content=")[^"]*"/,
    `$1${escAttr(ogSiteName)}"`
  );

  html = html.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*"/,
    `$1${escAttr(name)} – ${escAttr(catLabel)}${structureName ? ' | ' + escAttr(structureName) : ''}"`
  );
  html = html.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*"/,
    `$1${escAttr(metaDesc)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:image"\s+content=")[^"]*"/,
    `$1${escAttr(cover)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*"/,
    `$1${escAttr(canonical)}"`
  );

  // 4. Twitter Cards
  html = html.replace(
    /(<meta\s+name="twitter:title"\s+content=")[^"]*"/,
    `$1${escAttr(name)} – ${escAttr(catLabel)}${structureName ? ' | ' + escAttr(structureName) : ''}"`
  );
  html = html.replace(
    /(<meta\s+name="twitter:description"\s+content=")[^"]*"/,
    `$1${escAttr(metaDesc)}"`
  );
  html = html.replace(
    /(<meta\s+name="twitter:image"\s+content=")[^"]*"/,
    `$1${escAttr(cover)}"`
  );

  // 5. Canonical URL
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*"/,
    `$1${escAttr(canonical)}"`
  );
  html = html.replace(
    /(<link\s+rel="alternate"\s+hreflang="fr"\s+href=")[^"]*"/,
    `$1${escAttr(canonical)}"`
  );

  // 6. JSON-LD — remplacer le bloc statique
  const articleLd = buildArticleJsonLd(project, category, catLabel, canonical, cityBrand, structureName);
  const breadcrumbLd = buildBreadcrumbJsonLd(project, category, catLabel, canonical, structureName, project.ville);
  const jsonLdBlock = `<script type="application/ld+json" id="fiche-jsonld">${JSON.stringify(articleLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`;

  html = html.replace(
    /<script\s+type="application\/ld\+json"\s+id="fiche-jsonld">[^<]*<\/script>/,
    jsonLdBlock
  );

  // 7. Contenu sémantique SSR — injecter juste après <body>
  const ssrBlock = buildSsrContentBlock(project, category, catLabel, related, cityBrand, structureName);
  html = html.replace('<body>', `<body>\n${ssrBlock}`);

  return html;
}

/* ═══════════════ EDGE FUNCTION HANDLER ═══════════════ */

export default async (request, context) => {
  const url = new URL(request.url);
  const projectName = url.searchParams.get('project');
  const category = url.searchParams.get('cat') || 'velo';

  // Sans paramètre project, servir la page statique telle quelle
  if (!projectName) {
    return await context.next();
  }

  // Récupérer les données du projet depuis Supabase
  let project = null;
  let related = [];
  let cityBrand = null;

  try {
    project = await fetchProject(category, projectName);
  } catch (e) {
    console.error('[fiche-ssr] Fetch project failed:', e);
  }

  // Pas de projet trouvé → servir la page statique (le JS client affichera l'erreur)
  if (!project) {
    return await context.next();
  }

  // Récupérer projets liés + branding ville + label catégorie en parallèle
  let catLabel = '';
  try {
    [related, cityBrand, catLabel] = await Promise.all([
      fetchRelatedProjects(category, project.project_name),
      fetchCityBranding(project.ville),
      fetchCategoryLabel(category, project.ville),
    ]);
  } catch (e) {
    console.error('[fiche-ssr] Fetch related/branding/label failed:', e);
    catLabel = catLabel || humanizeCategory(category);
  }

  // Récupérer la réponse d'origine (page statique)
  const response = await context.next();
  let html = await response.text();

  // Construire la canonical URL (toujours inclure la ville si disponible)
  const ville = project.ville || '';
  const canonical = `${BASE_ORIGIN}/fiche/?cat=${encodeURIComponent(category)}&project=${encodeURIComponent(project.project_name)}${ville ? `&city=${encodeURIComponent(ville)}` : ''}`;

  // Injecter le SEO dans le HTML
  html = injectIntoHtml(html, project, category, catLabel, canonical, related, cityBrand);

  // Retourner la page enrichie avec cache court (les données changent)
  return new Response(html, {
    status: 200,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, max-age=60, stale-while-revalidate=600',
      'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1',
    },
  });
};

export const config = {
  path: '/fiche/',
  // Ne pas exécuter pour les assets statiques
  excludedPath: ['/fiche/*.css', '/fiche/*.js', '/fiche/*.map'],
};
