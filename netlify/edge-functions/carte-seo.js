/* ============================================================================
   EDGE FUNCTION - La carte d'une collectivité : /ville/{ville}/{module}

   Un seul HTML (index.html à la racine) sert les trois modules publics de
   toutes les villes. Ce qu'un robot doit lire dépend pourtant de la ville et
   du module : le titre, la description, l'adresse canonique, l'indexation
   (city_branding.indexable) et les données structurées. Cette fonction les
   pose à la volée, comme ville-hub le fait pour la page de la ville.

   • Ville inconnue → une page courte, hors index, qui renvoie vers l'index
     des villes. Servie en 200 : un 404 rendu par une edge function n'arrive
     pas au navigateur, Netlify reprend alors les règles de _redirects et
     servirait la coquille du hub sous cette adresse.
   • Module non activé sur la ville → 301 vers la carte de la ville : l'adresse
     n'existe pas, l'application ignorerait de toute façon le module.
   • Le HTML de départ porte des valeurs neutres : si cette fonction ne
     s'exécute pas, rien ne prétend être la carte d'une ville en particulier.
   ============================================================================ */

import {
  BASE_ORIGIN,
  escAttr,
  escHtml,
  fitTitle,
  fetchRows,
} from './_lib/seo.js';

const PUBLIC_MODULES = new Set(['carte', 'travaux', 'participer']);
const SLUG = /^[a-z0-9-]{1,60}$/;
const ORG_ID = `${BASE_ORIGIN}/#organization`;

/* Titre (60 caractères au plus) et description (160 au plus) par module. Le
   nom de la ville ouvre la phrase : « Métropole de Lyon : la carte… », pour ne
   jamais avoir à accorder un article devant un nom venu de la base. */
function metaFor(module, brand) {
  const nom = brand.trim();
  switch (module) {
    case 'travaux':
      return {
        title: fitTitle(`${nom} : les travaux en cours sur une carte`, 'Open Projets'),
        description: `${nom} : les chantiers en cours et à venir, avec leurs dates et leur emprise, sur une carte. Les riverains savent ce qui se passe dans leur rue.`,
        name: `Travaux en cours, ${nom}`,
      };
    case 'participer':
      return {
        title: fitTitle(`${nom} : signaler un problème sur la voie publique`, 'Open Projets'),
        description: `${nom} : signalez un problème sur l'espace public et suivez le traitement de votre signalement sur une carte, sans compte ni application.`,
        name: `Signalement, ${nom}`,
      };
    default:
      return {
        title: fitTitle(`${nom} : la carte des projets et des travaux`, 'Open Projets'),
        description: `${nom} : consultez les projets d'aménagement et les chantiers sur une carte. Chaque projet a sa fiche, son avancement et ses liens officiels.`,
        name: `Carte des projets et travaux, ${nom}`,
      };
  }
}

function notFound(villeSlug) {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Cette carte n'existe pas | Open Projets</title>
  <link rel="icon" type="image/png" href="/img/logos/favicon.png" sizes="32x32">
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #111; background: #FAFAFA; }
    main { max-width: 560px; margin: 0 auto; padding: 96px 24px; }
    h1 { font-size: 28px; line-height: 1.2; margin: 0 0 16px; }
    p { font-size: 16px; line-height: 1.6; color: #555; margin: 0 0 24px; }
    a { color: #C4002A; }
  </style>
</head>
<body>
  <main>
    <h1>Cette carte n'existe pas</h1>
    <p>Aucune collectivité ne répond à l'adresse « ${escHtml(villeSlug)} ». Elle a peut-être changé de nom, ou le lien a été mal recopié.</p>
    <p><a href="/ville/">Voir toutes les collectivités qui ont une carte</a> · <a href="/">Découvrir Open Projets</a></p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
}

function injectMeta(html, { title, description, canonical, robots, jsonLd }) {
  const rep = (re, value) => { html = html.replace(re, () => value); };
  rep(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`);
  rep(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${escAttr(description)}">`);
  rep(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/, `<meta name="robots" content="${escAttr(robots)}">`);
  rep(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${escAttr(canonical)}">`);
  rep(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escAttr(title)}">`);
  rep(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escAttr(description)}">`);
  rep(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${escAttr(canonical)}">`);
  rep(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${escAttr(title)}">`);
  rep(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${escAttr(description)}">`);
  // Les hreflang pointent l'adresse canonique de la page, pas la racine
  html = html.replace(/(<link\s+rel="alternate"\s+hreflang="[^"]+"\s+href=")[^"]*"/g, (_, p1) => `${p1}${escAttr(canonical)}"`);
  // Le h1 masqué et le bloc noscript nomment la ville
  rep(/<h1 class="visually-hidden">[^<]*<\/h1>/, `<h1 class="visually-hidden">${escHtml(title)}</h1>`);
  // Données structurées : celles de la page remplacent le bloc statique
  rep(/<script type="application\/ld\+json" id="site-jsonld">[\s\S]*?<\/script>/, `<script type="application/ld+json" id="site-jsonld">${JSON.stringify(jsonLd)}</script>`);
  return html;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  let villeSlug = '';
  try {
    villeSlug = decodeURIComponent(parts[1] || '').toLowerCase();
  } catch {
    return await context.next(); // percent-encoding invalide : jamais de 500
  }
  const module = String(parts[2] || '').toLowerCase();
  if (!SLUG.test(villeSlug) || !PUBLIC_MODULES.has(module)) return await context.next();

  // La page de départ et les données de la ville, en parallèle
  const [response, brandingRows, moduleRows] = await Promise.all([
    context.next(),
    fetchRows('city_branding', { select: 'ville,brand_name,indexable', ville: `eq.${villeSlug}`, limit: '1' }),
    fetchRows('city_modules', { select: 'module_key,enabled', ville: `eq.${villeSlug}` }),
  ]);

  const branding = brandingRows?.[0];
  if (!branding) return notFound(villeSlug);

  const enabled = new Set((moduleRows || []).filter((m) => m.enabled).map((m) => String(m.module_key)));
  // La carte reste l'adresse de repli d'une ville : un module non activé y renvoie
  if (module !== 'carte' && !enabled.has(module)) {
    return Response.redirect(`${url.origin}/ville/${villeSlug}/carte${url.search}`, 301);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const brand = String(branding.brand_name || villeSlug);
  const meta = metaFor(module, brand);
  const canonical = `${BASE_ORIGIN}/ville/${encodeURIComponent(villeSlug)}/${module}`;
  const indexable = branding.indexable !== false;
  const robots = indexable ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' : 'noindex, follow';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: meta.name,
        description: meta.description,
        url: canonical,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        inLanguage: 'fr',
        image: `${BASE_ORIGIN}/img/cover/meta.png`,
        browserRequirements: 'Requires JavaScript. Requires WebGL.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        author: { '@id': ORG_ID },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Open Projets', item: `${BASE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: brand, item: `${BASE_ORIGIN}/ville/${encodeURIComponent(villeSlug)}` },
          { '@type': 'ListItem', position: 3, name: meta.name, item: canonical },
        ],
      },
      {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: 'Open Projets',
        legalName: 'VAZY',
        url: `${BASE_ORIGIN}/`,
        logo: { '@type': 'ImageObject', url: `${BASE_ORIGIN}/img/logos/classic_color.png` },
        sameAs: ['https://fr.linkedin.com/company/vazyapp', 'https://vazy.app/'],
      },
    ],
  };

  const html = injectMeta(await response.text(), { ...meta, canonical, robots, jsonLd });
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  headers.set('X-Robots-Tag', indexable ? 'index, follow, max-snippet:-1, max-image-preview:large' : 'noindex, follow');
  return new Response(html, { status: response.status === 304 ? 200 : response.status, headers });
};

export const config = { path: ['/ville/:ville/carte', '/ville/:ville/travaux', '/ville/:ville/participer'] };
