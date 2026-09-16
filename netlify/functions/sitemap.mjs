import { BASE_ORIGIN } from './lib/projects-index.mjs';
import { xmlResponse } from './lib/sitemap.mjs';

// L'adresse déjà déclarée dans robots.txt et Search Console reste la même.
// Pas de lastmod sur l'index : la date de génération n'est pas une modification.
export default async () => xmlResponse([
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...['pages', 'villes', 'fiches'].map((section) =>
    `  <sitemap><loc>${BASE_ORIGIN}/sitemap-${section}.xml</loc></sitemap>`),
  '</sitemapindex>',
].join('\n'));

export const config = { path: '/sitemap.xml' };
