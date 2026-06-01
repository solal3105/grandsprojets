/* ============================================================================
   EDGE FUNCTION — Injection SEO des pages home SPA
   
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
  title: 'Open Projets — La carte interactive pour votre collectivité',
  description: 'Open Projets transforme vos projets urbains en carte interactive. Publiez vos projets, informez vos habitants — sans une ligne de code.',
  canonical: `${BASE}/`,
};

// SEO par route (chemins relatifs à /home/)
const PAGES = {
  '': DEFAULT,
  '/': DEFAULT,
  '/fonctionnalites': {
    title: 'Fonctionnalités — Open Projets',
    description: 'Contributions citoyennes, module travaux, catégories personnalisées, branding, gestion d\'équipe — toutes les fonctionnalités d\'Open Projets.',
    canonical: `${BASE}/fonctionnalites`,
  },
  '/a-propos': {
    title: 'À propos — Open Projets',
    description: 'Open Projets transforme les données publiques en information citoyenne, accessible et transparente pour tous.',
    canonical: `${BASE}/a-propos`,
  },
  '/contact': {
    title: 'Contact — Open Projets',
    description: 'Demandez une démo d\'Open Projets. On configure votre espace ensemble, en moins d\'une heure.',
    canonical: `${BASE}/contact`,
  },
  '/aide': {
    title: 'Aide — Open Projets',
    description: 'Guides d\'utilisation et documentation pour administrateurs et contributeurs Open Projets.',
    canonical: `${BASE}/aide`,
  },
  '/alternative-panneaupocket': {
    title: 'Alternative à PanneauPocket : la carte des projets urbains | Open Projets',
    description: 'Vous utilisez PanneauPocket pour vos alertes ? Open Projets le complète avec une carte interactive de vos projets et chantiers, consultable sans application.',
    canonical: `${BASE}/alternative-panneaupocket`,
  },
  '/alternative-cityall-lumiplan': {
    title: 'Alternative à CityAll (Lumiplan) : la carte web des projets | Open Projets',
    description: 'CityAll de Lumiplan est une app citoyenne mutualisée. Open Projets apporte la carte web de vos projets et chantiers, à vos couleurs, accessible sans application.',
    canonical: `${BASE}/alternative-cityall-lumiplan`,
  },
  '/alternative-neocity': {
    title: 'Alternative à Neocity : la carte des projets sans app | Open Projets',
    description: 'Neocity est une app citoyenne complète. Open Projets apporte une carte web de vos projets et chantiers, accessible par lien ou QR code, sans installation.',
    canonical: `${BASE}/alternative-neocity`,
  },
};

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildJsonLd(meta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description: meta.description,
    url: meta.canonical,
    inLanguage: 'fr-FR',
    publisher: {
      '@type': 'Organization',
      name: 'Open Projets',
      url: `${BASE_ORIGIN}/home/`,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_ORIGIN}/home/img/logos/classic_color.png`,
      },
    },
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
  const path = url.pathname.replace(/^\/home/, '') || '/';

  const meta = PAGES[path];
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
    '/home/alternative-panneaupocket',
    '/home/alternative-cityall-lumiplan',
    '/home/alternative-neocity',
  ],
};
