/**
 * /sitemap.xml - plan du site pour les moteurs de recherche.
 *
 * Une seule source d'inventaire, partagée avec /llms.txt : lib/projects-index.mjs
 * (lecture paginée de la base, filtres, doublons). Les pages y figurent dans
 * l'ordre : accueil et site vitrine, guides Ressources, index des villes et
 * hubs de chaque ville, puis les fiches (avec leur image de couverture pour
 * Google Images).
 *
 * Pas de <lastmod> inventé : les pages statiques n'en portent pas (Google
 * ignore les dates qu'il constate fausses, et finit par ignorer toutes celles
 * du site), les fiches portent leur date de création, les villes la date de
 * leur fiche la plus récente, les guides leur date de mise à jour.
 */

import {
  BASE_ORIGIN,
  fetchIndexableProjects,
  groupByVille,
  ficheUrl,
  villeUrl,
  toDay,
} from './lib/projects-index.mjs';

// Pages du site vitrine et pages d'entrée, dans l'ordre de lecture souhaité
const STATIC_PAGES = [
  '/',
  '/home/',
  '/home/fonctionnalites',
  '/home/ressources',
  '/home/a-propos',
  '/home/contact',
  '/home/aide',
  '/home/alternative-panneaupocket',
  '/home/alternative-cityall-lumiplan',
  '/home/alternative-neocity',
  '/home/confidentialite',
  '/cartes/',
  '/demo/',
  '/ville/',
];

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Guides de la section Ressources : manifest écrit par le prerender du home. */
async function fetchRessources() {
  try {
    const resp = await fetch(`${BASE_ORIGIN}/home/ressources/manifest.json`);
    if (!resp.ok) return [];
    const list = await resp.json();
    return Array.isArray(list) ? list.filter((a) => a?.slug) : [];
  } catch {
    return []; // pas de manifest : sitemap sans les guides
  }
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
    const [projects, ressources] = await Promise.all([
      fetchIndexableProjects('cover_url'),
      fetchRessources(),
    ]);

    const urlset = STATIC_PAGES.map((path) => ({ loc: `${BASE_ORIGIN}${path}` }));

    for (const article of ressources) {
      urlset.push({
        loc: `${BASE_ORIGIN}/home/ressources/${encodeURIComponent(article.slug)}`,
        lastmod: toDay(article.updated || article.date),
      });
    }

    for (const [ville, info] of groupByVille(projects)) {
      urlset.push({ loc: villeUrl(ville), lastmod: info.lastmod });
    }

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
