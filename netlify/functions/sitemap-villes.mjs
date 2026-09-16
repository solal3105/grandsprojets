import { renderSitemap } from './lib/sitemap.mjs';

export default async () => renderSitemap('villes');
export const config = { path: '/sitemap-villes.xml' };
