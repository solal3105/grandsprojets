/* ============================================================================
   EDGE FUNCTION - Le site vitrine : données structurées et en-têtes

   Le site est prérendu page par page (home-src/scripts/prerender.mjs) : le
   HTML servi porte déjà le titre, la description et l'adresse canonique de
   chaque page. Cette fonction ajoute ce que le rendu client ne produit pas :
   • le JSON-LD (WebPage ou Article, BreadcrumbList, Organization),
   • l'image de partage,
   • les en-têtes de cache et d'indexation.

   Les titres et descriptions sont définis DEUX fois : ici et dans
   home-src/src/v2/router.js. Les deux doivent rester identiques (docs/seo.md).
   ============================================================================ */

import { resourceSeo } from '../../home-src/src/lib/resource-seo.mjs';

const BASE_ORIGIN = 'https://openprojets.com';

const DEFAULT = {
  title: 'La carte des projets de votre collectivité | Open Projets',
  description: 'Publiez les projets urbains et les chantiers de votre commune sur une carte à vos couleurs, sans développement. Vos habitants consultent sans compte.',
  canonical: `${BASE_ORIGIN}/`,
};

// SEO par adresse - breadcrumb = libellé court du fil d'Ariane (JSON-LD), le
// titre complet serait trop long dans les résultats
const PAGES = {
  '/': DEFAULT,
  '/carte': {
    breadcrumb: 'Carte des projets urbains',
    title: 'Carte des projets urbains de votre commune | Open Projets',
    description: "Chaque projet d'aménagement a sa fiche publique, avec sa propre adresse, sur une carte à vos couleurs. Vos habitants la consultent sans compte ni application.",
    canonical: `${BASE_ORIGIN}/carte`,
  },
  '/travaux': {
    breadcrumb: 'Travaux du quotidien',
    title: 'Les travaux du quotidien sur une carte | Open Projets',
    description: 'Chaque chantier affiche son emprise, ses dates et son avancement sur la carte de votre commune. Les riverains savent ce qui se passe sans appeler la mairie.',
    canonical: `${BASE_ORIGIN}/travaux`,
  },
  '/participer': {
    breadcrumb: 'Signalement',
    title: 'Le signalement des habitants sur une carte | Open Projets',
    description: 'Un habitant signale un problème en deux minutes, sans créer de compte. Vous décidez de ce qui devient public et vous suivez le traitement sur la carte.',
    canonical: `${BASE_ORIGIN}/participer`,
  },
  '/chantiers': {
    breadcrumb: 'Chantiers et arrêtés',
    title: 'Chantiers et arrêtés de voirie en ligne | Open Projets',
    description: "Les entreprises déposent leurs demandes en ligne, vos services instruisent dans un fil daté, et chaque chantier est suivi jusqu'à la réouverture de la rue.",
    canonical: `${BASE_ORIGIN}/chantiers`,
  },
  '/diagnostic': {
    breadcrumb: 'Diagnostic terrain',
    title: "Le diagnostic de terrain assisté par l'IA | Open Projets",
    description: "Tracez une zone : l'IA lit chaque point qu'elle contient et vous rend une synthèse sourcée, des signalements aux comptages et aux aménagements cyclables.",
    canonical: `${BASE_ORIGIN}/diagnostic`,
  },
  '/tarification': {
    breadcrumb: 'Tarification',
    title: 'Estimez le prix pour votre collectivité | Open Projets',
    description: "Estimez le prix d'Open Projets en trois réglages : la taille de votre commune, les modules que vous activez et la durée d'engagement. Montants hors taxes.",
    canonical: `${BASE_ORIGIN}/tarification`,
  },
  '/a-propos': {
    breadcrumb: 'À propos',
    title: 'Open Projets, un outil français et open source',
    description: 'Open Projets est édité à Lyon par VAZY, Société à Mission. Code ouvert, hébergement en Europe, données sous le contrôle de votre collectivité.',
    canonical: `${BASE_ORIGIN}/a-propos`,
  },
  '/aide': {
    breadcrumb: 'Aide',
    title: "Centre d'aide : les guides d'utilisation | Open Projets",
    description: "Comment publier un projet, gérer les catégories, inviter un agent ou activer le module travaux : les guides d'Open Projets, administrateur et contributeur.",
    canonical: `${BASE_ORIGIN}/aide`,
  },
  '/confidentialite': {
    breadcrumb: 'Confidentialité',
    title: "Confidentialité et mesure d'audience | Open Projets",
    description: "Ce qu'Open Projets mesure sur ses espaces, ce qu'il ne mesure pas, et comment refuser cette mesure en un clic depuis votre navigateur.",
    canonical: `${BASE_ORIGIN}/confidentialite`,
  },
  '/alternative-panneaupocket': {
    breadcrumb: 'Alternative à PanneauPocket',
    title: 'Alternative à PanneauPocket | Open Projets',
    description: 'Vous utilisez PanneauPocket pour vos alertes ? Open Projets le complète avec une carte interactive de vos projets et chantiers, consultable sans application.',
    canonical: `${BASE_ORIGIN}/alternative-panneaupocket`,
  },
  '/alternative-cityall-lumiplan': {
    breadcrumb: 'Alternative à CityAll',
    title: 'Alternative à CityAll (Lumiplan) | Open Projets',
    description: 'CityAll de Lumiplan est une app citoyenne mutualisée. Open Projets apporte la carte web de vos projets et chantiers, à vos couleurs, sans application.',
    canonical: `${BASE_ORIGIN}/alternative-cityall-lumiplan`,
  },
  '/alternative-neocity': {
    breadcrumb: 'Alternative à Neocity',
    title: 'Alternative à Neocity | Open Projets',
    description: 'Neocity est une app citoyenne complète. Open Projets apporte une carte web de vos projets et chantiers, accessible par lien ou QR code, sans installation.',
    canonical: `${BASE_ORIGIN}/alternative-neocity`,
  },
  '/ressources': {
    breadcrumb: 'Ressources',
    title: 'Communiquer sur les projets de sa commune | Open Projets',
    description: 'Guides pratiques pour les communes : plan de mandat, carte des travaux, information des riverains. Des méthodes concrètes issues du terrain, sans jargon.',
    canonical: `${BASE_ORIGIN}/ressources`,
  },
};

/* ─── Guides Ressources : metas dynamiques via le manifest généré au build ─── */

const MANIFEST_URL = `${BASE_ORIGIN}/ressources/manifest.json`;
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
    ...resourceSeo(article),
    canonical: `${BASE_ORIGIN}/ressources/${article.slug}`,
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
// Le même @id est posé par la carte (carte-seo) et les fiches (fiche-ssr).
const ORG_ID = `${BASE_ORIGIN}/#organization`;
const ORGANIZATION = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Open Projets',
  legalName: 'VAZY',
  description: 'Open Projets est la carte interactive des projets urbains et des chantiers des collectivités, éditée par VAZY, Société à Mission lyonnaise.',
  url: `${BASE_ORIGIN}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${BASE_ORIGIN}/img/logos/classic_color.png`,
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

/** Fil d'Ariane : Accueil › Ressources › Guide, ou Accueil › Page. */
function buildBreadcrumb(meta) {
  const items = [{ name: 'Open Projets', item: `${BASE_ORIGIN}/` }];
  if (meta.article) {
    items.push({ name: 'Ressources', item: `${BASE_ORIGIN}/ressources` });
    items.push({ name: meta.article.title, item: meta.canonical });
  } else if (meta.canonical !== `${BASE_ORIGIN}/`) {
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
        image: `${BASE_ORIGIN}/img/logos/square_white.png`,
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
  const ogImage = `${BASE_ORIGIN}/img/logos/square_white.png`;
  // Toujours une FONCTION de remplacement : une chaîne y ferait interpréter
  // les séquences $ du contenu comme motifs de remplacement JavaScript. La
  // fonction reçoit le début de balise capturé et le complète.
  const rep = (re, value) => { html = html.replace(re, (_, debut) => `${debut}${value}"`); };

  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`);
  rep(/(<meta\s+name="description"\s+content=")[^"]*"/, esc(description));
  rep(/(<link\s+rel="canonical"\s+href=")[^"]*"/, esc(canonical));
  rep(/(<meta\s+property="og:title"\s+content=")[^"]*"/, esc(title));
  rep(/(<meta\s+property="og:description"\s+content=")[^"]*"/, esc(description));
  rep(/(<meta\s+property="og:url"\s+content=")[^"]*"/, esc(canonical));
  rep(/(<meta\s+property="og:image"\s+content=")[^"]*"/, esc(ogImage));
  rep(/(<meta\s+name="twitter:title"\s+content=")[^"]*"/, esc(title));
  rep(/(<meta\s+name="twitter:description"\s+content=")[^"]*"/, esc(description));

  // Injecter JSON-LD juste avant </head>
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(buildJsonLd(meta))}</script>`;
  html = html.replace('</head>', () => `${jsonLd}\n</head>`);

  return html;
}

export default async (request, context) => {
  const url = new URL(request.url);

  // Barre finale normalisée : "/ressources/" et "/ressources" sont la même page
  const path = url.pathname.replace(/\/+$/, '') || '/';

  let meta = PAGES[path];
  if (!meta && path.startsWith('/ressources/')) meta = await ressourceMeta(path);
  // Adresse inconnue (guide absent, manifest.json…) → passer
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
    '/',
    '/carte',
    '/travaux',
    '/participer',
    '/chantiers',
    '/diagnostic',
    '/tarification',
    '/a-propos',
    '/aide',
    '/confidentialite',
    '/alternative-panneaupocket',
    '/alternative-cityall-lumiplan',
    '/alternative-neocity',
    '/ressources',
    '/ressources/*',
  ],
};
