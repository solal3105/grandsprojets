import { renderSitemap } from './lib/sitemap.mjs';

export default async () => renderSitemap('fiches');
export const config = { path: '/sitemap-fiches.xml' };
