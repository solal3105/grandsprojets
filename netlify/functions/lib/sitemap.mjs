/**
 * Sous-plans du site : pages et guides, villes et cartes, fiches et images.
 *
 * Une seule source d'inventaire, partagée avec /llms.txt : lib/projects-index.mjs
 * (lecture paginée de la base, filtres, doublons). Le découpage permet de
 * suivre séparément leur indexation dans Search Console.
 *
 * Pas de <lastmod> inventé : les pages statiques n'en portent pas (Google
 * ignore les dates qu'il constate fausses, et finit par ignorer toutes celles
 * du site), les fiches portent leur dernière modification éditoriale, les
 * villes la plus récente de leurs fiches, les guides leur mise à jour.
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
} from './projects-index.mjs';
import { projectModifiedAt } from '../../lib/project-seo.mjs';

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
];

// Les modules qui ont une adresse publique dans l'application d'une ville
const PUBLIC_MODULES = ['carte', 'travaux', 'participer'];

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Guides de la section Ressources : manifest écrit par le prerender du site. */
async function fetchRessources() {
  const resp = await fetch(`${BASE_ORIGIN}/ressources/manifest.json`);
  if (!resp.ok) throw new Error(`Manifest ressources ${resp.status}`);
  const list = await resp.json();
  if (!Array.isArray(list)) throw new Error('Manifest ressources invalide');
  return list.filter((a) => a?.slug);
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
    parts.push('    </image:image>');
  }
  parts.push('  </url>');
  return parts.join('\n');
}

export async function renderSitemap(section) {
  try {
    const urlset = [];
    if (section === 'pages') {
      const ressources = await fetchRessources();
      urlset.push(...STATIC_PAGES.map((path) => ({ loc: `${BASE_ORIGIN}${path}` })));
      for (const article of ressources) {
        urlset.push({
          loc: `${BASE_ORIGIN}/ressources/${encodeURIComponent(article.slug)}`,
          lastmod: toDay(article.updated || article.date),
        });
      }
    } else if (section === 'villes') {
      const [projects, cartes] = await Promise.all([fetchIndexableProjects(), fetchCartes()]);
      urlset.push({ loc: `${BASE_ORIGIN}/ville/` });
      for (const [ville, info] of groupByVille(projects)) {
        urlset.push({ loc: villeUrl(ville), lastmod: info.lastmod });
      }
      for (const loc of cartes) urlset.push({ loc });
    } else if (section === 'fiches') {
      const projects = await fetchIndexableProjects('cover_url');
      for (const p of projects) {
        const entry = { loc: ficheUrl(p), lastmod: toDay(projectModifiedAt(p)) };
        if (/^https?:\/\//i.test(String(p.cover_url || ''))) entry.image = { loc: p.cover_url };
        urlset.push(entry);
      }
    } else {
      return new Response('Plan du site inconnu', { status: 404 });
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      ...urlset.map(renderUrl),
      '</urlset>',
    ].join('\n');

    return xmlResponse(xml);
  } catch (e) {
    // Jamais un sitemap partiel en 200 : un 500 laisse aux moteurs la version
    // précédente, un inventaire tronqué leur ferait oublier des pages
    return new Response(`Sitemap generation failed: ${e?.message || e}`, { status: 500 });
  }
}

export function xmlResponse(xml) {
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
