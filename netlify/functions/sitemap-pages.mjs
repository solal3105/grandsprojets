import { renderSitemap } from './lib/sitemap.mjs';

export default async () => renderSitemap('pages');
export const config = { path: '/sitemap-pages.xml' };
