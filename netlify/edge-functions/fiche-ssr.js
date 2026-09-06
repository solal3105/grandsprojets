/* ============================================================================
   EDGE FUNCTION - Pré-rendu SEO des fiches projet
   
   Intercepte les requêtes GET sur /fiche/{ville}/{categorySlug}/{projSlug}
   et injecte côté serveur :
   • <title>, meta description, OG, Twitter Cards
   • JSON-LD structuré (Article + BreadcrumbList)
   • Contenu sémantique HTML (visible par les crawlers)
   • Canonical URL
   
   Le client-side JS (fiche-v2.js) prend le relais pour la carte,
   les interactions, le markdown, etc.
   ============================================================================ */

// Helpers partagés avec ville-hub.js (échappement, troncature, markdown, URLs,
// accès PostgREST). Voir netlify/edge-functions/_lib/seo.js.
import {
  BASE_ORIGIN,
  escAttr,
  escHtml,
  truncate,
  humanize as humanizeCategory,
  stripMarkdown,
  safeUrl,
  safeHexColor,
  isValidCityCode,
  fetchRows,
} from './_lib/seo.js';

/* ─── Markdown → HTML (rendu serveur, sans dépendance) ───
   Sous-ensemble de ce que rend le client (marked + DOMPurify) : titres,
   gras/italique, liens, images, listes, citations, tableaux GFM et les
   directives ::content-image / ::banner. Tout le texte est échappé avant
   parsing - le HTML brut éventuel du markdown est affiché comme texte,
   pas interprété (équivalent strict de la sanitisation côté client). */

function stripFrontMatter(rawMd) {
  const fm = rawMd.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  // Ne retirer le bloc que s'il ressemble à du YAML (clé: valeur) - un document
  // qui commence par un séparateur --- ne doit pas voir son intro avalée
  if (!fm || !/^\w+\s*:/m.test(fm[1])) return rawMd;
  return rawMd.slice(fm[0].length);
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
      ? `<figcaption>${escHtml(data.caption)}${data.credit ? ` - <em>${escHtml(data.credit)}</em>` : ''}</figcaption>`
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

/** Emphase seule (gras/italique) - underscores intra-mot ignorés, comme en GFM */
function applyEmphasis(t) {
  t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^\w_])__(?=\S)([\s\S]*?\S)__(?![\w_])/g, '$1<strong>$2</strong>');
  t = t.replace(/\*(?=\S)([^*]*\S)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/(^|[^\w_])_(?=\S)([^_]*\S)_(?![\w_])/g, '$1<em>$2</em>');
  return t;
}

/** Inline markdown sur du texte déjà échappé HTML.
    Le code et le HTML généré (liens, images) sont mis de côté dans un stash
    pour que la passe d'emphase ne corrompe jamais un href/src ni du code. */
function mdInline(t) {
  const stash = [];
  const put = (html) => `@@GPMD@@I${stash.push(html) - 1}@@GPMD@@`;

  // 1. Code inline - contenu littéral, jamais retraité
  t = t.replace(/`([^`]+)`/g, (_, code) => put(`<code>${code}</code>`));

  // 2. Images puis liens - titre optionnel entre "…" ou '…' (échappés)
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:&quot;|&#x27;)[^)]*(?:&quot;|&#x27;))?\)/g, (_, alt, src) => {
    const u = safeUrl(src);
    return u ? put(`<img src="${u}" alt="${alt}" loading="lazy">`) : alt;
  });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:&quot;|&#x27;)[^)]*(?:&quot;|&#x27;))?\)/g, (_, text, href) => {
    const u = safeUrl(href);
    return u ? put(`<a href="${u}" rel="noopener noreferrer">${applyEmphasis(text)}</a>`) : text;
  });

  // 3. Autolinks - URLs nues transformées en liens (comme marked gfm côté client)
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)])/g, (_, pre, url) =>
    `${pre}${put(`<a href="${url}" rel="noopener noreferrer">${url}</a>`)}`);

  // 4. Emphase sur le texte restant (les URLs/code sont hors d'atteinte)
  t = applyEmphasis(t);

  // 5. Restaurer les fragments protégés (itératif : un lien peut contenir du code)
  let prev;
  do {
    prev = t;
    t = t.replace(/@@GPMD@@I(\d+)@@GPMD@@/g, (_, i) => stash[Number(i)] ?? '');
  } while (t !== prev);
  return t;
}

function renderTable(headerRow, bodyRows) {
  // Split sur | non échappé (support GFM \|) après retrait des pipes de bordure
  const parseRow = r => r.replace(/^\s*\||\|\s*$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  const head = parseRow(headerRow);
  // .table-wrapper = même conteneur overflow-x que le rendu client (.fv2-prose)
  let html = '<div class="table-wrapper"><table><thead><tr>' + head.map(c => `<th>${mdInline(c)}</th>`).join('') + '</tr></thead>';
  if (bodyRows.length) {
    html += '<tbody>' + bodyRows.map(r => '<tr>' + parseRow(r).map(c => `<td>${mdInline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
  }
  return html + '</table></div>';
}

function mdToHtml(rawMd) {
  if (!rawMd) return '';
  const blocks = [];
  // Normaliser les fins de ligne (CRLF → LF) puis neutraliser la sentinelle -
  // en boucle, pour que des occurrences imbriquées ne se reforment pas
  let md = String(rawMd).replace(/\r\n?/g, '\n');
  let prev;
  do { prev = md; md = md.replace(/@@GPMD@@/g, ''); } while (md !== prev);
  md = stripFrontMatter(md);
  md = extractDirectives(md, blocks);
  md = escHtml(md);

  const lines = md.split('\n');
  const out = [];
  let para = [];
  let listType = null;
  let listItems = [];   // { text, sub: [] }
  let quote = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${mdInline(para.join(' '))}</p>`); para = []; } };
  const renderItems = items => items.map(i =>
    `<li>${mdInline(i.text)}${i.sub.length ? `<ul>${i.sub.map(s => `<li>${mdInline(s)}</li>`).join('')}</ul>` : ''}</li>`
  ).join('');
  const flushList = () => {
    if (listType) {
      out.push(`<${listType}>${renderItems(listItems)}</${listType}>`);
      listType = null; listItems = [];
    }
  };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote><p>${mdInline(quote.join(' '))}</p></blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) { flushAll(); continue; }

    // Placeholder de directive
    const ph = trimmed.match(/^@@GPMD@@B(\d+)@@GPMD@@$/);
    if (ph) { flushAll(); out.push(blocks[Number(ph[1])] || ''); continue; }

    // Bloc de code fencé ``` - contenu littéral (déjà échappé), sans inline
    if (/^(```|~~~)/.test(trimmed)) {
      flushAll();
      const fence = trimmed.slice(0, 3);
      const code = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(fence)) { code.push(lines[j]); j++; }
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      i = j; // saute aussi la ligne de clôture (ou s'arrête en fin de document)
      continue;
    }

    // Titres - niveau décalé de +1 : le h1 de la page est le nom du projet
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

    // Tableau GFM : ligne à pipes suivie d'une séparatrice (|---|--- ou ---|---).
    // On exige un | dans la séparatrice OU un | initial dans l'en-tête pour ne
    // pas confondre « texte | texte » suivi d'un --- (hr) avec un tableau.
    const sep = (lines[i + 1] || '').trim();
    if (trimmed.includes('|') && /^\|?[\s:|-]+\|?$/.test(sep) && sep.includes('-') &&
        (trimmed.startsWith('|') || sep.includes('|'))) {
      flushAll();
      const body = [];
      let j = i + 2; // saute l'en-tête et la séparatrice
      while (j < lines.length && lines[j].trim() && lines[j].includes('|')) { body.push(lines[j].trim()); j++; }
      out.push(renderTable(trimmed, body));
      i = j - 1;
      continue;
    }

    // Listes - un niveau d'imbrication (item indenté d'au moins 2 espaces)
    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushQuote();
      if (/^\s{2,}/.test(raw) && listType && listItems.length) {
        listItems[listItems.length - 1].sub.push((ul || ol)[1]);
        continue;
      }
      const type = ul ? 'ul' : 'ol';
      if (listType && listType !== type) flushList();
      listType = type;
      listItems.push({ text: (ul || ol)[1], sub: [] });
      continue;
    }

    flushList(); flushQuote();
    para.push(trimmed);
  }
  flushAll();
  return out.join('\n');
}

/* ─── Supabase REST helpers (fetchRows partagé avec ville-hub) ─── */

function fetchProjectBySlug(villeSlug, categorySlug, projSlug) {
  return fetchRows('contribution_uploads', {
    select: 'project_name,description,cover_url,official_url,geojson_url,markdown_url,category,category_slug,slug,ville,created_at',
    category_slug: `eq.${categorySlug}`,
    slug: `eq.${projSlug}`,
    ville: `eq.${villeSlug}`,
    approved: 'eq.true',
    limit: '1',
  }).then(rows => rows[0] || null);
}

/** Label d'une catégorie : la table category_icons n'a pas de colonne label,
    le nom EST le label (« renovation urbaine », « mobilités et voirie »). On le
    sert tel quel avec une majuscule initiale, comme le hub de la ville - la
    capitalisation de chaque mot (« Mobilités Et Voirie ») n'est pas française. */
function categoryLabel(category, categorySlug) {
  const raw = String(category || '').trim() || humanizeCategory(categorySlug);
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
}

/** Échappe les jokers PostgREST d'un motif ilike (% _ \). */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, c => `\\${c}`);
}

/**
 * Page de référence d'un projet saisi plusieurs fois (même ville, même nom,
 * même catégorie) : la plus ancienne. Le hub national « france » compte des
 * centaines de doublons avec un suffixe numérique de slug ; les autres pages
 * du groupe pointent vers celle-ci en canonical, et le sitemap ne liste
 * qu'elle (même règle dans netlify/functions/lib/projects-index.mjs).
 */
function fetchReferenceSibling(project) {
  return fetchRows('contribution_uploads', {
    select: 'slug,category_slug,ville',
    ville: `eq.${project.ville}`,
    category_slug: `eq.${project.category_slug}`,
    project_name: `ilike.${escapeLike(String(project.project_name || '').trim())}`,
    approved: 'eq.true',
    order: 'created_at.asc,id.asc',
    limit: '1',
  }).then(rows => rows[0] || null);
}

/**
 * Ancien format d'adresse, encore présent dans l'index de Google et dans des
 * liens partagés : /fiche/?cat={catégorie}&project={nom}&city={ville}.
 * Le client ne le comprend plus (il ne lit que le chemin) : ces visiteurs
 * tombaient sur « Projet introuvable ». Retourne le chemin canonique du projet
 * ou null. Avec plusieurs candidats : la ville demandée d'abord, puis la
 * catégorie demandée, puis le plus ancien (la page de référence).
 */
async function resolveLegacyUrl(searchParams) {
  const name = String(searchParams.get('project') || '').trim();
  if (!name || name.length > 200) return null;
  const city = String(searchParams.get('city') || '').trim().toLowerCase();
  const cat = String(searchParams.get('cat') || '').trim().toLowerCase();
  const catSlug = cat.replace(/\s+/g, '-');

  let rows = [];
  try {
    rows = await fetchRows('contribution_uploads', {
      select: 'ville,category,category_slug,slug,created_at',
      project_name: `ilike.${escapeLike(name)}`,
      approved: 'eq.true',
      order: 'created_at.asc,id.asc',
      limit: '20',
    });
  } catch (e) {
    console.error('[fiche-ssr] Résolution ancienne URL échouée :', e);
    return null;
  }

  const candidates = rows.filter(r => r.ville && r.category_slug && r.slug && isValidCityCode(r.ville));
  if (!candidates.length) return null;
  const score = r => (city && String(r.ville).toLowerCase() === city ? 2 : 0)
    + (cat && (String(r.category_slug).toLowerCase() === catSlug || String(r.category || '').toLowerCase() === cat) ? 1 : 0);
  candidates.sort((a, b) => score(b) - score(a)); // tri stable : l'ordre chronologique départage
  const best = candidates[0];
  return `/fiche/${encodeURIComponent(best.ville)}/${encodeURIComponent(best.category_slug)}/${encodeURIComponent(best.slug)}`;
}

/** Projets de la même catégorie DANS LE MÊME ESPACE (même règle que le
    client) : la fiche d'une collectivité ne renvoie pas vers les projets
    d'une autre, et le maillage reste à l'intérieur de son hub. */
function fetchRelatedProjects(category, excludeName, ville) {
  return fetchRows('contribution_uploads', {
    select: 'project_name,description,cover_url,slug,category_slug,ville',
    category: `eq.${category}`,
    ...(ville ? { ville: `eq.${ville}` } : {}),
    approved: 'eq.true',
    project_name: `neq.${excludeName}`,
    limit: '6',
    order: 'created_at.desc',
  });
}

function fetchCityBranding(ville) {
  if (!ville) return Promise.resolve(null);
  return fetchRows('city_branding', {
    select: 'brand_name,primary_color,logo_url',
    ville: `eq.${ville.toLowerCase()}`,
    limit: '1',
  }).then(rows => rows[0] || null);
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

function buildArticleJsonLd(project, category, catLabel, canonical, cityBrand, structureName, articlePlain) {
  const name = project.project_name;
  const defaultDesc = structureName
    ? `Découvrez ${name}, projet ${catLabel} porté par ${structureName}.`
    : `Découvrez le projet ${catLabel} : ${name}.`;
  const desc = truncate(stripMarkdown(project.description || '') || articlePlain || defaultDesc, 300);
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
  // Le parent d'une fiche est le hub de sa ville (et non la carte brute) :
  // niveau ville → /ville/{ville}, niveau catégorie → hub filtré (#c=slug).
  const hubUrl = ville ? `${BASE_ORIGIN}/ville/${encodeURIComponent(ville)}` : BASE_ORIGIN;
  const catUrl = (ville && project.category_slug)
    ? `${hubUrl}#c=${encodeURIComponent(project.category_slug)}`
    : hubUrl;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: structureName || catLabel,
        item: hubUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: catLabel,
        item: catUrl,
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
  const catLabelSafe = escHtml(catLabel);
  const structureNameSafe = escHtml(structureName || '');
  const ville = project.ville || '';
  const officialUrl = project.official_url || '';

  // Fil d'Ariane vers le hub de la ville (le vrai parent de la fiche)
  const hubHref = ville ? `/ville/${encodeURIComponent(ville)}` : '/';
  const catHref = (ville && project.category_slug)
    ? `${hubHref}#c=${encodeURIComponent(project.category_slug)}`
    : hubHref;
  const rootLabel = structureNameSafe || catLabelSafe;

  let html = `
<!-- Contenu pré-rendu côté serveur pour le référencement -->
<div id="fv2-ssr-content" class="fv2-ssr" aria-hidden="false">
  <article itemscope itemtype="https://schema.org/Article">
    <header>
      <nav aria-label="Fil d'Ariane" class="fv2-ssr__breadcrumb">
        <a href="${escAttr(hubHref)}">${rootLabel}</a> ›
        <a href="${escAttr(catHref)}">${catLabelSafe}</a> ›
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

  // Article complet si disponible (même logique que le client : la description
  // est masquée quand un markdown existe). .fv2-prose = typographie partagée
  // avec le rendu client - ne pas créer de ruleset dédié.
  if (articleHtml) {
    html += `
    <section class="fv2-ssr__article fv2-prose" itemprop="articleBody">
${articleHtml}
    </section>`;
  }
  // Description en repli si pas d'article OU si l'article n'a aucune prose
  // (ex : markdown réduit à une directive image) - ne jamais servir un bloc sans texte
  const articleText = articleHtml ? articleHtml.replace(/<[^>]*>/g, ' ').trim() : '';
  if (!articleText) {
    const desc = escHtml(stripMarkdown(project.description || ''));
    if (desc) {
      html += `
    <section>
      <p itemprop="description">${desc}</p>
    </section>`;
    }
  }

  if (officialUrl) {
    html += `
    <section>
      <p>Site officiel : <a href="${escAttr(safeUrl(officialUrl))}" rel="noopener noreferrer">${escHtml(officialUrl)}</a></p>
    </section>`;
  }

  if (project.cover_url) {
    html += `
    <figure>
      <img itemprop="image" src="${escAttr(project.cover_url)}" alt="${name}" loading="lazy" width="800" height="450">
    </figure>`;
  }

  // Projets liés - maillage interne (très important pour le SEO)
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
        <li><a href="${escAttr(rHref)}">${rName}</a>${rDesc ? ` - ${rDesc}` : ''}</li>`;
    }
    html += `
      </ul>
    </section>`;
  }

  // Lien vers le hub de la ville - maillage interne fiche → hub
  if (ville) {
    html += `
    <nav class="fv2-ssr__hub" aria-label="Navigation ville">
      <a href="${escAttr(hubHref)}">Tous les projets de ${rootLabel}</a>
    </nav>`;
  }

  // Lien de marque - ancre « Open Projets » sur chaque fiche (SERP de marque)
  html += `
    <footer class="fv2-ssr__brand">
      <span>Fiche publiée avec <a href="/home/">Open Projets</a>, la carte interactive des projets pour les collectivités.</span>
    </footer>`;

  html += `
  </article>
</div>`;

  return html;
}

function injectIntoHtml(html, project, category, catLabel, canonical, related, cityBrand, articleHtml, articlePlain) {
  const name = project.project_name;
  const structureName = cityBrand?.brand_name
    || (project.ville ? humanizeCategory(project.ville) : '');

  const defaultDesc = structureName
    ? `Découvrez ${name}, projet ${catLabel} porté par ${structureName}.`
    : `Découvrez ${name}, un projet ${catLabel}.`;
  // Description : celle du projet, sinon un extrait de l'article, sinon le générique
  const metaDesc = truncate(stripMarkdown(project.description || '') || articlePlain || defaultDesc, 160);
  // Image de partage = cover du projet si elle existe, sinon fallback générique
  const cover = project.cover_url || `${BASE_ORIGIN}/img/cover/meta.png`;
  const titleSuffix = structureName ? ` | ${structureName}` : '';

  // ⚠️  Toujours passer une FONCTION à html.replace() quand le remplacement
  // contient du contenu projet/article : une chaîne y ferait interpréter
  // les séquences $ ($&, $`, $') comme motifs de remplacement JavaScript.

  // 1. <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    () => `<title>${escHtml(name)} - ${escHtml(catLabel)}${escHtml(titleSuffix)}</title>`
  );

  // 2. Meta description
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(metaDesc)}"`
  );

  // 3. Open Graph - site_name dynamique (nom de la structure)
  const ogSiteName = structureName || 'Open Projets';
  html = html.replace(
    /(<meta\s+property="og:site_name"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(ogSiteName)}"`
  );

  html = html.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(name)} - ${escAttr(catLabel)}${structureName ? ' | ' + escAttr(structureName) : ''}"`
  );
  html = html.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(metaDesc)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:image"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(cover)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(canonical)}"`
  );

  // 4. Twitter Cards
  html = html.replace(
    /(<meta\s+name="twitter:title"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(name)} - ${escAttr(catLabel)}${structureName ? ' | ' + escAttr(structureName) : ''}"`
  );
  html = html.replace(
    /(<meta\s+name="twitter:description"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(metaDesc)}"`
  );
  html = html.replace(
    /(<meta\s+name="twitter:image"\s+content=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(cover)}"`
  );

  // 5. Canonical URL
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(canonical)}"`
  );
  html = html.replace(
    /(<link\s+rel="alternate"\s+hreflang="fr"\s+href=")[^"]*"/,
    (_, p1) => `${p1}${escAttr(canonical)}"`
  );

  // 6. JSON-LD - remplacer le bloc statique
  const articleLd = buildArticleJsonLd(project, category, catLabel, canonical, cityBrand, structureName, articlePlain);
  const breadcrumbLd = buildBreadcrumbJsonLd(project, category, catLabel, canonical, structureName, project.ville);
  // < encodé en < : un contenu contenant </script> ne peut pas fermer
  // le bloc JSON-LD et injecter du HTML (XSS stocké)
  const ldJson = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
  const jsonLdBlock = `<script type="application/ld+json" id="fiche-jsonld">${ldJson(articleLd)}</script>
  <script type="application/ld+json">${ldJson(breadcrumbLd)}</script>`;

  html = html.replace(
    /<script\s+type="application\/ld\+json"\s+id="fiche-jsonld">[^<]*<\/script>/,
    () => jsonLdBlock
  );

  // 7. Couleur de marque de la ville (même traitement que ville-hub).
  // Sans ça, la page est servie avec le vert par défaut du fichier statique puis
  // corrigée par fiche-v2.js après le fetch branding : barre de navigateur et
  // accents affichent brièvement la marque d'une autre collectivité.
  const brandColor = safeHexColor(cityBrand?.primary_color);
  if (brandColor) {
    html = html.replace(/(<meta\s+name="theme-color"\s+content=")[^"]*"/, (_, p1) => `${p1}${brandColor}"`);
    html = html.replace('</head>', () => `  <style id="fv2-brand">:root { --color-primary: ${brandColor}; }</style>\n</head>`);
  }

  // 8. Contenu sémantique SSR - injecter juste après <body>
  const ssrBlock = buildSsrContentBlock(project, category, catLabel, related, cityBrand, structureName, articleHtml);
  html = html.replace('<body>', () => `<body>\n${ssrBlock}`);

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

  // Sans les 3 segments attendus : soit une adresse de l'ancien format à
  // rediriger (301, définitif : les moteurs reportent l'historique de la page),
  // soit la coquille /fiche/ nue, servie en 200 mais jamais indexée - sinon
  // Google la retenait comme canonical de toutes les anciennes adresses.
  if (!villeSlug || !categorySlug || !projSlug) {
    const target = await resolveLegacyUrl(url.searchParams);
    if (target) {
      return new Response(null, {
        status: 301,
        headers: { Location: target, 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
      });
    }
    const response = await context.next();
    return new Response(response.body, {
      status: response.status,
      headers: { ...Object.fromEntries(response.headers.entries()), 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  // Lancer le fetch de la page statique immédiatement : il ne dépend d'aucune
  // donnée Supabase - l'aller-retour origin recouvre les fetchs et le rendu
  const responsePromise = context.next();

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
    const response = await responsePromise;
    return new Response(response.body, {
      status: 200,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  // Récupérer projets liés + branding ville + page de référence + article markdown en parallèle
  const catLabel = categoryLabel(project.category, project.category_slug);
  let reference = null;
  let articleMd = '';
  try {
    [related, cityBrand, reference, articleMd] = await Promise.all([
      fetchRelatedProjects(project.category, project.project_name, project.ville),
      fetchCityBranding(project.ville),
      fetchReferenceSibling(project),
      fetchMarkdownArticle(project.markdown_url),
    ]);
  } catch (e) {
    console.error('[fiche-ssr] Fetch related/branding/reference failed:', e);
  }

  // Conversion markdown → HTML + texte brut (jamais bloquante : en cas d'échec,
  // repli sur la description seule)
  let articleHtml = '';
  let articlePlain = '';
  try {
    articleHtml = mdToHtml(articleMd);
    if (articleMd) {
      // Texte brut de l'article - repli pour les meta descriptions quand
      // le projet n'a pas de description propre
      articlePlain = stripMarkdown(
        stripFrontMatter(String(articleMd).replace(/\r\n?/g, '\n'))
          .replace(/::content-image[\t\x20]*\n---[\s\S]*?---\s*::/g, ' ')
          .replace(/::banner\{[^}]*\}/g, ' ')
      );
    }
  } catch (e) {
    console.error('[fiche-ssr] Rendu markdown échoué:', e);
  }

  // Récupérer la réponse d'origine (page statique, fetch lancé en amont)
  const response = await responsePromise;
  let html = await response.text();

  // Canonical URL - format propre /fiche/{ville}/{category_slug}/{slug}.
  // Un doublon (même ville, nom, catégorie) désigne la page de référence du
  // groupe : la page reste servie et indexable, Google consolide sur l'autre.
  const ref = (reference?.slug && reference?.category_slug && reference?.ville) ? reference : project;
  const canonical = `${BASE_ORIGIN}/fiche/${encodeURIComponent(ref.ville)}/${encodeURIComponent(ref.category_slug)}/${encodeURIComponent(ref.slug)}`;

  // Injecter le SEO dans le HTML
  html = injectIntoHtml(html, project, project.category, catLabel, canonical, related, cityBrand, articleHtml, articlePlain);

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
