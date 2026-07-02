/* ============================================================================
   EDGE FUNCTION — Pré-rendu SEO des fiches projet
   
   Intercepte les requêtes GET sur /fiche/{ville}/{categorySlug}/{projSlug}
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
const BASE_ORIGIN = 'https://openprojets.com';

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

/* ─── Markdown → HTML (rendu serveur, sans dépendance) ───
   Sous-ensemble de ce que rend le client (marked + DOMPurify) : titres,
   gras/italique, liens, images, listes, citations, tableaux GFM et les
   directives ::content-image / ::banner. Tout le texte est échappé avant
   parsing — le HTML brut éventuel du markdown est affiché comme texte,
   pas interprété (équivalent strict de la sanitisation côté client). */

function safeUrl(url) {
  const u = String(url || '').trim();
  return /^(https?:|mailto:|\/|#)/i.test(u) ? u : '';
}

function stripFrontMatter(rawMd) {
  const fm = rawMd.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  return fm ? rawMd.slice(fm[0].length) : rawMd;
}

/** Directives custom → HTML final protégé par placeholders @@GPMD@@B{n}@@GPMD@@
    (résolus après échappement global du texte) */
function extractDirectives(md, blocks) {
  md = md.replace(/::content-image[\t\x20]*\n---([\s\S]*?)---\s*::/g, (_, yamlBlock) => {
    const data = {};
    yamlBlock.split(/\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const m = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (m) data[m[1]] = m[2];
    });
    const src = safeUrl(data.imageUrl);
    if (!src) return '';
    const caption = data.caption
      ? `<figcaption>${escHtml(data.caption)}${data.credit ? ` – <em>${escHtml(data.credit)}</em>` : ''}</figcaption>`
      : '';
    blocks.push(`<figure class="content-image"><img src="${escAttr(src)}" alt="${escAttr(data.caption || '')}" loading="lazy">${caption}</figure>`);
    return `\n@@GPMD@@B${blocks.length - 1}@@GPMD@@\n`;
  });

  md = md.replace(/::banner\{type="([^"]+)"\}([\s\S]*?)::/g, (_, type, inner) => {
    blocks.push(`<div class="banner banner-${escAttr(type)}">${mdInline(escHtml(inner.trim().replace(/\n+/g, ' ')))}</div>`);
    return `\n@@GPMD@@B${blocks.length - 1}@@GPMD@@\n`;
  });

  md = md.replace(/^::$/gm, '');
  md = md.replace(/:[\w-]+-link\{[^}]+\}/g, '');
  return md;
}

/** Inline markdown sur du texte déjà échappé HTML */
function mdInline(t) {
  // images ![alt](src)
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_, alt, src) => {
    const u = safeUrl(src);
    return u ? `<img src="${u}" alt="${alt}" loading="lazy">` : alt;
  });
  // liens [texte](url)
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_, text, href) => {
    const u = safeUrl(href);
    return u ? `<a href="${u}" rel="noopener noreferrer">${text}</a>` : text;
  });
  // gras puis italique
  t = t.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
  t = t.replace(/(\*|_)(?=\S)([^*_]*\S)\1/g, '<em>$2</em>');
  // code inline
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  return t;
}

function renderTable(rows) {
  const parseRow = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const head = parseRow(rows[0]);
  const body = rows.slice(2).map(parseRow);
  let html = '<table><thead><tr>' + head.map(c => `<th>${mdInline(c)}</th>`).join('') + '</tr></thead>';
  if (body.length) {
    html += '<tbody>' + body.map(r => '<tr>' + r.map(c => `<td>${mdInline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
  }
  return html + '</table>';
}

function mdToHtml(rawMd) {
  if (!rawMd) return '';
  const blocks = [];
  let md = stripFrontMatter(rawMd).replace(/@@GPMD@@/g, '');
  md = extractDirectives(md, blocks);
  md = escHtml(md);

  const lines = md.split(/\r?\n/);
  const out = [];
  let para = [];
  let listType = null;
  let listItems = [];
  let quote = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${mdInline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => {
    if (listType) {
      out.push(`<${listType}>` + listItems.map(i => `<li>${mdInline(i)}</li>`).join('') + `</${listType}>`);
      listType = null; listItems = [];
    }
  };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote><p>${mdInline(quote.join(' '))}</p></blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!trimmed) { flushAll(); continue; }

    // Placeholder de directive
    const ph = trimmed.match(/^@@GPMD@@B(\d+)@@GPMD@@$/);
    if (ph) { flushAll(); out.push(blocks[Number(ph[1])] || ''); continue; }

    // Titres — niveau décalé de +1 : le h1 de la page est le nom du projet
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushAll();
      const lvl = Math.min(h[1].length + 1, 6);
      out.push(`<h${lvl}>${mdInline(h[2].replace(/\s#+\s*$/, ''))}</h${lvl}>`);
      continue;
    }

    // Séparateur horizontal
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushAll(); out.push('<hr>'); continue; }

    // Citation (le « > » est déjà échappé en &gt;)
    const q = trimmed.match(/^&gt;\s?(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }

    // Tableau GFM : ligne |...| suivie d'une ligne séparatrice |---|
    if (trimmed.startsWith('|') && lines[i + 1] && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      flushAll();
      const rows = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) { rows.push(lines[j].trim()); j++; }
      out.push(renderTable(rows));
      i = j - 1;
      continue;
    }

    // Listes
    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushQuote();
      const type = ul ? 'ul' : 'ol';
      if (listType && listType !== type) flushList();
      listType = type;
      listItems.push((ul || ol)[1]);
      continue;
    }

    flushList(); flushQuote();
    para.push(trimmed);
  }
  flushAll();
  return out.join('\n');
}

/* ─── Supabase REST helpers ─── */

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

async function fetchProjectBySlug(villeSlug, categorySlug, projSlug) {
  const url = new URL('/rest/v1/contribution_uploads', SUPABASE_URL);
  url.searchParams.set(
    'select',
    'project_name,description,cover_url,official_url,geojson_url,markdown_url,category,category_slug,slug,ville,created_at'
  );
  url.searchParams.set('category_slug', `eq.${categorySlug}`);
  url.searchParams.set('slug', `eq.${projSlug}`);
  url.searchParams.set('ville', `eq.${villeSlug}`);
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
  url.searchParams.set('select', 'project_name,description,cover_url,slug,category_slug,ville');
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

/** Télécharge l'article markdown du projet (URL publique Supabase Storage) */
async function fetchMarkdownArticle(markdownUrl) {
  const u = String(markdownUrl || '').trim();
  if (!/^https:\/\//i.test(u)) return '';
  try {
    const resp = await fetch(u, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return '';
    const md = await resp.text();
    // Garde-fou taille : au-delà, on retombe sur la description seule
    return md.length > 200000 ? '' : md;
  } catch {
    return '';
  }
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

  const publisherName = structureName || 'Open Projets';
  const publisherLogo = cityBrand?.logo_url || `${BASE_ORIGIN}/img/logos/classic_color-1.png`;

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
        item: `${BASE_ORIGIN}/${ville ? `?city=${encodeURIComponent(ville)}` : ''}`,
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

function buildSsrContentBlock(project, category, catLabel, related, cityBrand, structureName, articleHtml) {
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

  // Article complet si disponible, sinon description seule
  // (même logique que le client : la description est masquée quand un markdown existe)
  if (articleHtml) {
    html += `
    <section class="fv2-ssr__article" itemprop="articleBody">
${articleHtml}
    </section>`;
  } else if (desc) {
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
      const rVille = r.ville || ville;
      const rHref = (r.slug && r.category_slug && rVille)
        ? `/fiche/${encodeURIComponent(rVille)}/${encodeURIComponent(r.category_slug)}/${encodeURIComponent(r.slug)}`
        : '/';
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

function injectIntoHtml(html, project, category, catLabel, canonical, related, cityBrand, articleHtml) {
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
  const ogSiteName = structureName || 'Open Projets';
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
  const ssrBlock = buildSsrContentBlock(project, category, catLabel, related, cityBrand, structureName, articleHtml);
  html = html.replace('<body>', `<body>\n${ssrBlock}`);

  return html;
}

/* ═══════════════ EDGE FUNCTION HANDLER ═══════════════ */

export default async (request, context) => {
  const url = new URL(request.url);

  // Parse les segments du path : /fiche/{ville}/{categorySlug}/{projSlug}
  // decodeURIComponent nécessaire : url.pathname conserve le percent-encoding (%C3%A9 → é)
  // sans décodage, la lookup Supabase échoue pour les villes/slugs avec accents
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  // parts[0] = 'fiche', parts[1] = ville, parts[2] = categorySlug, parts[3] = projSlug
  const villeSlug    = decodeURIComponent(parts[1] || '');
  const categorySlug = decodeURIComponent(parts[2] || '');
  const projSlug     = decodeURIComponent(parts[3] || '');

  // Si l'URL n'a pas les 3 segments attendus → servir la page statique telle quelle
  if (!villeSlug || !categorySlug || !projSlug) {
    return await context.next();
  }

  // Récupérer les données du projet depuis Supabase
  let project = null;
  let related = [];
  let cityBrand = null;

  try {
    project = await fetchProjectBySlug(villeSlug, categorySlug, projSlug);
  } catch (e) {
    console.error('[fiche-ssr] Fetch project failed:', e);
  }

  // Pas de projet trouvé → servir la page normalement (200) mais avec noindex
  // ⚠️  Ne pas retourner 404 : le JS client (fiche-v2.js) doit s'exécuter
  //     pour afficher l'écran d'erreur côté navigateur.
  if (!project) {
    const response = await context.next();
    return new Response(response.body, {
      status: 200,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  // Récupérer projets liés + branding ville + label catégorie + article markdown en parallèle
  let catLabel = '';
  let articleMd = '';
  try {
    [related, cityBrand, catLabel, articleMd] = await Promise.all([
      fetchRelatedProjects(project.category, project.project_name),
      fetchCityBranding(project.ville),
      fetchCategoryLabel(project.category, project.ville),
      fetchMarkdownArticle(project.markdown_url),
    ]);
  } catch (e) {
    console.error('[fiche-ssr] Fetch related/branding/label failed:', e);
    catLabel = catLabel || humanizeCategory(categorySlug);
  }

  // Conversion markdown → HTML (jamais bloquante : en cas d'échec, description seule)
  let articleHtml = '';
  try {
    articleHtml = mdToHtml(articleMd);
  } catch (e) {
    console.error('[fiche-ssr] Rendu markdown échoué:', e);
  }

  // Récupérer la réponse d'origine (page statique)
  const response = await context.next();
  let html = await response.text();

  // Canonical URL — format propre /fiche/{ville}/{category_slug}/{slug}
  const canonical = `${BASE_ORIGIN}/fiche/${encodeURIComponent(project.ville)}/${encodeURIComponent(project.category_slug)}/${encodeURIComponent(project.slug)}`;

  // Injecter le SEO dans le HTML
  html = injectIntoHtml(html, project, project.category, catLabel, canonical, related, cityBrand, articleHtml);

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
  path: ['/fiche/', '/fiche/*/*/*'],
  // Ne pas exécuter pour les assets statiques
  excludedPath: ['/fiche/*.css', '/fiche/*.js', '/fiche/*.map'],
};
