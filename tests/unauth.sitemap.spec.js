// @ts-check
// Tests du plan du site (/sitemap.xml) et de sa cohérence avec /llms.txt.
// Utilise le request fixture Playwright (pas de navigateur, appels HTTP directs).
//
// Section : 0.66 - sitemap.xml

import { test, expect } from '@playwright/test';

const SITEMAP = '/sitemap.xml';
const LLMS = '/llms.txt';

/** Entrées <url> du sitemap : { loc, lastmod } */
function parseUrls(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: (m[1].match(/<loc>([^<]+)<\/loc>/) || [])[1] || '',
    lastmod: (m[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || '',
  }));
}

test.describe('0.66 - sitemap.xml : plan du site', () => {

  test('0.66.1 - GET → 200 en XML, jamais le fallback SPA', async ({ request }) => {
    const res = await request.get(SITEMAP);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('xml');
    const xml = await res.text();
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).not.toContain('<!DOCTYPE html>');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });

  test('0.66.2 - Les pages d\'entrée du site sont présentes, sans date inventée', async ({ request }) => {
    const urls = parseUrls(await (await request.get(SITEMAP)).text());
    const byLoc = new Map(urls.map((u) => [u.loc, u]));
    for (const path of ['/', '/home/', '/home/fonctionnalites', '/home/ressources', '/home/contact', '/ville/', '/cartes/', '/demo/']) {
      const entry = byLoc.get(`https://openprojets.com${path}`);
      expect(entry, path).toBeTruthy();
      // Une page statique n'a pas de <lastmod> : Google ignore les dates qu'il
      // constate fausses, puis toutes celles du site
      expect(entry?.lastmod, `lastmod sur ${path}`).toBe('');
    }
  });

  test('0.66.3 - Les fiches ne s\'arrêtent pas au premier millier de lignes de la base', async ({ request }) => {
    // PostgREST plafonne chaque réponse à 1 000 lignes : sans lecture paginée,
    // le sitemap ne contenait plus une seule fiche des collectivités réelles
    const urls = parseUrls(await (await request.get(SITEMAP)).text());
    const fiches = urls.filter((u) => u.loc.includes('/fiche/'));
    const villes = urls.filter((u) => /\/ville\/[a-z0-9-]+$/.test(u.loc));
    expect(fiches.length).toBeGreaterThan(1000);
    expect(villes.length).toBeGreaterThan(10);
    // Au moins une ville qui n'est pas une carte d'essai générée
    expect(villes.some((u) => !u.loc.includes('/ville/essai-'))).toBe(true);
  });

  test('0.66.4 - Aucune adresse en double, aucune entrée de test', async ({ request }) => {
    const urls = parseUrls(await (await request.get(SITEMAP)).text());
    const locs = urls.map((u) => u.loc);
    expect(new Set(locs).size).toBe(locs.length);
    expect(locs.every((l) => l.startsWith('https://openprojets.com/'))).toBe(true);
    expect(locs.some((l) => /\/fiche\/[^/]+\/[^/]+\/e2e[-_]/i.test(l))).toBe(false);
  });

  test('0.66.5 - Chaque fiche porte sa date et, quand elle en a une, son image', async ({ request }) => {
    const xml = await (await request.get(SITEMAP)).text();
    const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]).filter((b) => b.includes('/fiche/'));
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks.slice(0, 200)) {
      expect(b).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    }
    const withImage = blocks.filter((b) => b.includes('<image:image>'));
    expect(withImage.length).toBeGreaterThan(0);
    for (const b of withImage.slice(0, 200)) {
      expect(b).toMatch(/<image:loc>https?:\/\/[^<]+<\/image:loc>/);
    }
  });

  test('0.66.6 - llms.txt liste exactement les mêmes fiches que le sitemap', async ({ request }) => {
    const [xml, txt] = await Promise.all([
      request.get(SITEMAP).then((r) => r.text()),
      request.get(LLMS).then((r) => r.text()),
    ]);
    const fromSitemap = new Set(parseUrls(xml).map((u) => u.loc).filter((l) => l.includes('/fiche/')));
    const fromLlms = new Set([...txt.matchAll(/\]\((https:\/\/openprojets\.com\/fiche\/[^)]+)\)/g)].map((m) => m[1]));
    expect(fromLlms.size).toBe(fromSitemap.size);
    for (const l of fromLlms) expect(fromSitemap.has(l), l).toBe(true);
  });

  test('0.66.7 - Le sitemap et l\'index /ville/ relient les mêmes villes', async ({ request }) => {
    const [xml, html] = await Promise.all([
      request.get(SITEMAP).then((r) => r.text()),
      request.get('/ville/').then((r) => r.text()),
    ]);
    const fromSitemap = new Set(parseUrls(xml).map((u) => u.loc).filter((l) => /\/ville\/[a-z0-9-]+$/.test(l)).map((l) => l.split('/ville/')[1]));
    const fromIndex = new Set([...html.matchAll(/href="\/ville\/([a-z0-9-]+)"/g)].map((m) => m[1]));
    expect(fromIndex.size).toBe(fromSitemap.size);
    for (const v of fromSitemap) expect(fromIndex.has(v), v).toBe(true);
  });
});
