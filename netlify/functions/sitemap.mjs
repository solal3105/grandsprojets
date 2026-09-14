/**
 * /sitemap.xml - plan du site pour les moteurs de recherche.
 *
 * Une seule source d'inventaire, partagée avec /llms.txt : lib/projects-index.mjs
 * (lecture paginée de la base, filtres, doublons). Les pages y figurent dans
 * l'ordre : site vitrine, guides Ressources, index des villes et pages de
 * chaque ville, cartes des collectivités (un module public par adresse), puis
 * les fiches (avec leur image de couverture pour Google Images).
 *
 * Pas de <lastmod> inventé : les pages statiques n'en portent pas (Google
 * ignore les dates qu'il constate fausses, et finit par ignorer toutes celles
 * du site), les fiches portent leur date de création, les villes la date de
 * leur fiche la plus récente, les guides leur date de mise à jour.
 */

import {
  BASE_ORIGIN,
  fetchAllRows,
  fetchIndexableProjects,
  fetchNoindexVilles,
  groupByVille,
  ficheUrl,
  villeUrl,
  toDay,
} from './lib/projects-index.mjs';

// Pages du site vitrine et pages d'entrée, dans l'ordre de lecture souhaité
const STATIC_PAGES = [
  '/',
  '/carte',
  '/travaux',
  '/participer',
  '/chantiers',
  '/diagnostic',
  '/tarification',
  '/ressources',
  '/a-propos',
  '/aide',
  '/alternative-panneaupocket',
  '/alternative-cityall-lumiplan',
  '/alternative-neocity',
  '/confidentialite',
  '/cartes/',
  '/demo/',
  '/ville/',
];

// Les modules qui ont une adresse publique dans l'application d'une ville
const PUBLIC_MODULES = ['carte', 'travaux', 'participer'];

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Guides de la section Ressources : manifest écrit par le prerender du site. */
async function fetchRessources() {
  try {
    const resp = await fetch(`${BASE_ORIGIN}/ressources/manifest.json`);
    if (!resp.ok) return [];
    const list = await resp.json();
    return Array.isArray(list) ? list.filter((a) => a?.slug) : [];
  } catch {
    return []; // pas de manifest : sitemap sans les guides
  }
}

/**
 * Les cartes des collectivités : /ville/{ville}/{module}, pour chaque espace
 * qui n'est pas retiré des moteurs et chaque module public activé. La carte
 * est toujours là ; les travaux et le signalement seulement si la ville les a
 * activés (city_modules).
 */
async function fetchCartes() {
  const [villes, modules, noindex] = await Promise.all([
    fetchAllRows('city_branding', { select: 'ville', order: 'ville.asc' }),
    fetchAllRows('city_modules', { select: 'ville,module_key', enabled: 'eq.true', order: 'ville.asc' }),
    fetchNoindexVilles(),
  ]);
  const enabled = new Map();
  for (const m of modules) {
    const ville = String(m?.ville || '').toLowerCase();
    if (!ville) continue;
    if (!enabled.has(ville)) enabled.set(ville, new Set());
    enabled.get(ville).add(String(m.module_key));
  }
  const urls = [];
  for (const v of villes) {
    const ville = String(v?.ville || '').toLowerCase();
    if (!ville || noindex.has(ville)) continue;
    for (const module of PUBLIC_MODULES) {
      if (module !== 'carte' && !enabled.get(ville)?.has(module)) continue;
      urls.push(`${BASE_ORIGIN}/ville/${encodeURIComponent(ville)}/${module}`);
    }
  }
  return urls;
}

function renderUrl(u) {
  const parts = ['  <url>', `    <loc>${escapeXml(u.loc)}</loc>`];
  if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
  if (u.image) {
    parts.push('    <image:image>');
    parts.push(`      <image:loc>${escapeXml(u.image.loc)}</image:loc>`);
    if (u.image.title) parts.push(`      <image:title>${escapeXml(u.image.title)}</image:title>`);
    if (u.image.caption) parts.push(`      <image:caption>${escapeXml(u.image.caption)}</image:caption>`);
    parts.push('    </image:image>');
  }
  parts.push('  </url>');
  return parts.join('\n');
}

export default async (_request, _context) => {
  try {
    const [projects, ressources, cartes] = await Promise.all([
      fetchIndexableProjects('cover_url'),
      fetchRessources(),
      fetchCartes(),
    ]);

    const urlset = STATIC_PAGES.map((path) => ({ loc: `${BASE_ORIGIN}${path}` }));

    for (const article of ressources) {
      urlset.push({
        loc: `${BASE_ORIGIN}/ressources/${encodeURIComponent(article.slug)}`,
        lastmod: toDay(article.updated || article.date),
      });
    }

    for (const [ville, info] of groupByVille(projects)) {
      urlset.push({ loc: villeUrl(ville), lastmod: info.lastmod });
    }

    for (const loc of cartes) urlset.push({ loc });

    for (const p of projects) {
      const entry = { loc: ficheUrl(p), lastmod: toDay(p.created_at) };
      // Extension image : uniquement des URLs absolues, seules valables ici
      if (/^https?:\/\//i.test(String(p.cover_url || ''))) {
        entry.image = {
          loc: p.cover_url,
          title: p.project_name,
          caption: p.description ? String(p.description).replace(/\s+/g, ' ').trim().slice(0, 200) : undefined,
        };
      }
      urlset.push(entry);
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      ...urlset.map(renderUrl),
      '</urlset>',
    ].join('\n');

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (e) {
    // Jamais un sitemap partiel en 200 : un 500 laisse aux moteurs la version
    // précédente, un inventaire tronqué leur ferait oublier des pages
    return new Response(`Sitemap generation failed: ${e?.message || e}`, { status: 500 });
  }
};

export const config = {
  path: '/sitemap.xml',
};
