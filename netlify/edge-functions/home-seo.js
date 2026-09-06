/* ============================================================================
   EDGE FUNCTION - Injection SEO des pages home SPA
   
   Intercepte les requêtes sur les routes home (/, /fonctionnalites,
   /a-propos, /contact, /aide, /alternative-*) et injecte côté serveur :
   • <title>, meta description, OG tags, Twitter Cards
   • <link rel="canonical">
   • JSON-LD (WebPage + Organization)
   
   Le client-side Vue (Vue Router afterEach) prend le relais pour les
   interactions. Cette edge function garantit que les crawlers voient
   les bonnes metas sans JS.
   ============================================================================ */

const BASE_ORIGIN = 'https://openprojets.com';
const BASE = `${BASE_ORIGIN}/home`;

const DEFAULT = {
  title: 'La carte interactive des projets de votre collectivité | Open Projets',
  description: 'Publiez les projets urbains et les chantiers de votre commune sur une carte interactive à vos couleurs, sans développement. Vos habitants consultent sans compte.',
  canonical: `${BASE}/`,
};

// SEO par route (chemins relatifs à /home/) - breadcrumb = libellé court du
// fil d'Ariane (JSON-LD), le titre complet serait trop long dans les résultats
const PAGES = {
  '': DEFAULT,
  '/': DEFAULT,
  '/fonctionnalites': {
    breadcrumb: 'Fonctionnalités',
    title: 'Fonctionnalités : carte des projets, travaux, diagnostic | Open Projets',
    description: 'Fiches projet géolocalisées, module travaux pour les riverains, catégories et identité visuelle de votre collectivité, gestion d\'équipe, diagnostic de terrain par l\'IA.',
    canonical: `${BASE}/fonctionnalites`,
  },
  '/a-propos': {
    breadcrumb: 'À propos',
    title: 'À propos : un outil français et open source pour les collectivités | Open Projets',
    description: 'Open Projets est édité à Lyon par VAZY, Société à Mission. Code ouvert, hébergement en Europe, données sous le contrôle de votre collectivité.',
    canonical: `${BASE}/a-propos`,
  },
  '/contact': {
    breadcrumb: 'Contact',
    title: 'Demander une démo | Open Projets',
    description: 'Demandez une démonstration d\'Open Projets : nous préparons la carte de votre commune avant l\'appel et configurons votre espace ensemble, sans frais caché.',
    canonical: `${BASE}/contact`,
  },
  '/aide': {
    breadcrumb: 'Aide',
    title: 'Centre d\'aide : guides administrateur et contributeur | Open Projets',
    description: 'Comment publier un projet, gérer les catégories, inviter un agent ou activer le module travaux : les guides d\'utilisation d\'Open Projets, pour administrateurs et contributeurs.',
    canonical: `${BASE}/aide`,
  },
  '/confidentialite': {
    breadcrumb: 'Confidentialité',
    title: 'Confidentialité et mesure d\'audience - Open Projets',
    description: 'Ce qu\'Open Projets mesure sur ses espaces, ce qu\'il ne mesure pas, et comment refuser cette mesure en un clic depuis votre navigateur.',
    canonical: `${BASE}/confidentialite`,
  },
  '/alternative-panneaupocket': {
    breadcrumb: 'Alternative à PanneauPocket',
    title: 'Alternative à PanneauPocket : la carte des projets urbains | Open Projets',
    description: 'Vous utilisez PanneauPocket pour vos alertes ? Open Projets le complète avec une carte interactive de vos projets et chantiers, consultable sans application.',
    canonical: `${BASE}/alternative-panneaupocket`,
  },
  '/alternative-cityall-lumiplan': {
    breadcrumb: 'Alternative à CityAll',
    title: 'Alternative à CityAll (Lumiplan) : la carte web des projets | Open Projets',
    description: 'CityAll de Lumiplan est une app citoyenne mutualisée. Open Projets apporte la carte web de vos projets et chantiers, à vos couleurs, accessible sans application.',
    canonical: `${BASE}/alternative-cityall-lumiplan`,
  },
  '/alternative-neocity': {
    breadcrumb: 'Alternative à Neocity',
    title: 'Alternative à Neocity : la carte des projets sans app | Open Projets',
    description: 'Neocity est une app citoyenne complète. Open Projets apporte une carte web de vos projets et chantiers, accessible par lien ou QR code, sans installation.',
    canonical: `${BASE}/alternative-neocity`,
  },
  '/ressources': {
    breadcrumb: 'Ressources',
    title: 'Ressources : communiquer sur les projets de sa collectivité | Open Projets',
    description: 'Guides pratiques pour les communes : plan de mandat, carte des travaux, information des riverains. Des méthodes concrètes issues du terrain, sans jargon.',
    canonical: `${BASE}/ressources`,
  },
};

/* ─── Articles Ressources : metas dynamiques via le manifest généré au build ─── */

const MANIFEST_URL = `${BASE}/ressources/manifest.json`;
const MANIFEST_TTL_MS = 10 * 60 * 1000;
let manifestCache = { data: null, at: 0 };

async function getRessourcesManifest() {
  if (manifestCache.data && Date.now() - manifestCache.at < MANIFEST_TTL_MS) {
    return manifestCache.data;
  }
  try {
    const resp = await fetch(MANIFEST_URL);
    if (resp.ok) manifestCache = { data: await resp.json(), at: Date.now() };
  } catch { /* réseau : on garde le cache existant, même périmé */ }
  return manifestCache.data;
}

async function ressourceMeta(path) {
  const slug = path.split('/')[2];
  if (!slug) return null;
  const manifest = await getRessourcesManifest();
  const article = manifest?.find((a) => a.slug === slug);
  if (!article) return null;
  return {
    title: `${article.title} | Open Projets`,
    description: article.description,
    canonical: `${BASE}/ressources/${article.slug}`,
    article,
  };
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Organisation complète : désambiguïse « Open Projets » (vs OpenProject) dans
// le Knowledge Graph. sameAs = profils publics vérifiés de l'éditeur VAZY.
const ORG_ID = `${BASE_ORIGIN}/home/#organization`;
const ORGANIZATION = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Open Projets',
  legalName: 'VAZY',
  description: 'Open Projets est la carte interactive des projets urbains et des chantiers des collectivités, éditée par VAZY, Société à Mission lyonnaise.',
  url: `${BASE_ORIGIN}/home/`,
  logo: {
    '@type': 'ImageObject',
    url: `${BASE_ORIGIN}/home/img/logos/classic_color.png`,
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Lyon',
    addressCountry: 'FR',
  },
  sameAs: [
    'https://fr.linkedin.com/company/vazyapp',
    'https://vazy.app/',
  ],
};

/** Fil d'Ariane : Accueil › Ressources › Article, ou Accueil › Page. */
function buildBreadcrumb(meta) {
  const items = [{ name: 'Open Projets', item: `${BASE}/` }];
  if (meta.article) {
    items.push({ name: 'Ressources', item: `${BASE}/ressources` });
    items.push({ name: meta.article.title, item: meta.canonical });
  } else if (meta.canonical !== `${BASE}/`) {
    items.push({ name: meta.breadcrumb || meta.title.replace(/\s*[|-]\s*Open Projets\s*$/, ''), item: meta.canonical });
  }
  if (items.length < 2) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.item })),
  };
}

function buildJsonLd(meta) {
  const page = meta.article
    ? {
        '@type': 'Article',
        headline: meta.article.title,
        description: meta.description,
        url: meta.canonical,
        mainEntityOfPage: meta.canonical,
        datePublished: meta.article.date,
        dateModified: meta.article.updated || meta.article.date,
        inLanguage: 'fr-FR',
        image: `${BASE_ORIGIN}/home/img/logos/square_white.png`,
        author: { '@id': ORG_ID },
        publisher: { '@id': ORG_ID },
      }
    : {
        '@type': 'WebPage',
        name: meta.title,
        description: meta.description,
        url: meta.canonical,
        inLanguage: 'fr-FR',
        publisher: { '@id': ORG_ID },
      };

  const breadcrumb = buildBreadcrumb(meta);
  return {
    '@context': 'https://schema.org',
    '@graph': breadcrumb ? [page, breadcrumb, ORGANIZATION] : [page, ORGANIZATION],
  };
}

function injectMeta(html, meta) {
  const { title, description, canonical } = meta;
  const ogImage = `${BASE_ORIGIN}/home/img/logos/square_white.png`;

  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${esc(title)}</title>`
  );
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*"/,
    `$1${esc(description)}"`
  );
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*"/,
    `$1${esc(canonical)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*"/,
    `$1${esc(title)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*"/,
    `$1${esc(description)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*"/,
    `$1${esc(canonical)}"`
  );
  html = html.replace(
    /(<meta\s+property="og:image"\s+content=")[^"]*"/,
    `$1${esc(ogImage)}"`
  );
  html = html.replace(
    /(<meta\s+name="twitter:title"\s+content=")[^"]*"/,
    `$1${esc(title)}"`
  );
  html = html.replace(
    /(<meta\s+name="twitter:description"\s+content=")[^"]*"/,
    `$1${esc(description)}"`
  );

  // Injecter JSON-LD juste avant </head>
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(buildJsonLd(meta))}</script>`;
  html = html.replace('</head>', `${jsonLd}\n</head>`);

  return html;
}

export default async (request, context) => {
  const url = new URL(request.url);

  // Extraire le path relatif à /home (ex: "/home/alternative-panneaupocket" → "/alternative-panneaupocket")
  // Slash final normalisé : "/ressources/" et "/ressources" doivent matcher la même entrée
  const path = url.pathname.replace(/^\/home/, '').replace(/\/+$/, '') || '/';

  let meta = PAGES[path];
  if (!meta && path.startsWith('/ressources/')) meta = await ressourceMeta(path);
  // Route inconnue ou asset → passer
  if (!meta) return await context.next();

  const response = await context.next();
  // Ne traiter que le HTML
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const enriched = injectMeta(html, meta);

  return new Response(enriched, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, max-age=600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'index, follow, max-snippet:-1, max-image-preview:large',
    },
  });
};

export const config = {
  path: [
    '/home/',
    '/home/fonctionnalites',
    '/home/a-propos',
    '/home/contact',
    '/home/aide',
    '/home/confidentialite',
    '/home/alternative-panneaupocket',
    '/home/alternative-cityall-lumiplan',
    '/home/alternative-neocity',
    '/home/ressources',
    '/home/ressources/*',
  ],
};
