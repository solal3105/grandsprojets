/* ============================================================================
   EDGE FUNCTION - La page de tarification de la refonte, ouverte aux moteurs

   Toute la refonte /home2/ est servie avec « noindex, nofollow » par son HTML
   (home-src/index-v2.html) : c'est une version de travail qui ne doit pas
   être indexée en parallèle de /home/. L'estimateur de prix est l'exception :
   il n'existe nulle part ailleurs sur le site, il est dans le menu et dans le
   plan du site, et on veut qu'une recherche « prix Open Projets » y mène.

   Sur cette seule adresse (pas sur le document d'estimation en dessous), on
   remplace donc le robots, le titre et la description, et on ajoute canonical,
   Open Graph, Twitter et JSON-LD que l'HTML de la refonte ne porte pas.
   Titre en 60 caractères, description en 160, comme partout (docs/seo.md).
   ============================================================================ */

const BASE_ORIGIN = 'https://openprojets.com';
const CANONICAL = `${BASE_ORIGIN}/home2/tarification`;
const TITLE = 'Estimez le prix pour votre collectivité | Open Projets';
const DESCRIPTION = "Estimez le prix d'Open Projets en trois réglages : la taille de votre commune, les modules que vous activez et la durée d'engagement. Montants hors taxes.";
const OG_IMAGE = `${BASE_ORIGIN}/home/img/logos/square_white.png`;

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ORG_ID = `${BASE_ORIGIN}/home/#organization`;

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      name: TITLE,
      description: DESCRIPTION,
      url: CANONICAL,
      inLanguage: 'fr-FR',
      publisher: { '@id': ORG_ID },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Open Projets', item: `${BASE_ORIGIN}/home/` },
        { '@type': 'ListItem', position: 2, name: 'Tarification', item: CANONICAL },
      ],
    },
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: 'Open Projets',
      legalName: 'VAZY',
      url: `${BASE_ORIGIN}/home/`,
      logo: { '@type': 'ImageObject', url: `${BASE_ORIGIN}/home/img/logos/classic_color.png` },
    },
  ],
};

function injectMeta(html) {
  html = html.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/, '<meta name="robots" content="index, follow">');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>`);
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*"/, `$1${esc(DESCRIPTION)}"`);
  const extra = [
    `<link rel="canonical" href="${esc(CANONICAL)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(TITLE)}">`,
    `<meta property="og:description" content="${esc(DESCRIPTION)}">`,
    `<meta property="og:url" content="${esc(CANONICAL)}">`,
    `<meta property="og:image" content="${esc(OG_IMAGE)}">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(TITLE)}">`,
    `<meta name="twitter:description" content="${esc(DESCRIPTION)}">`,
    `<script type="application/ld+json">${JSON.stringify(JSON_LD)}</script>`,
  ].join('\n');
  return html.replace('</head>', `${extra}\n</head>`);
}

export default async (request, context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  return new Response(injectMeta(html), {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, max-age=600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'index, follow, max-snippet:-1, max-image-preview:large',
    },
  });
};

/* L'adresse exacte, avec ou sans barre finale. Pas de joker : le document
   d'estimation (/home2/tarification/estimation) doit rester hors index. */
export const config = { path: ['/home2/tarification', '/home2/tarification/'] };
