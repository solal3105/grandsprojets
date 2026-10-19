// @ts-check
import { test, expect } from '@playwright/test';

/**
 * 0.87 - Aperçus de lien (Teams, Slack, LinkedIn...)
 * Non-régression : /favicon.ico tombait sur le repli du site et renvoyait une
 * page HTML, et l'image de partage était un logo blanc sur fond transparent,
 * invisible sur la carte blanche d'un aperçu.
 */

test.describe('0.87 - Aperçus de lien', () => {
  test('0.87.1 - /favicon.ico et /apple-touch-icon.png sont des images', async ({ page }) => {
    for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/img/logos/icon-192.png']) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'] || '', path).not.toContain('text/html');
    }
  });

  test('0.87.2 - Chaque page de module partage sa propre image', async ({ page }) => {
    for (const key of ['carte', 'travaux', 'participer', 'chantiers', 'diagnostic']) {
      const html = await (await page.request.get(`/${key}`)).text();
      const og = html.match(/property="og:image"\s+content="([^"]*)"/)?.[1] || '';
      expect(og, key).toBe(`https://openprojets.com/img/og/${key}.jpg`);
      const image = await page.request.get(`/img/og/${key}.jpg`);
      expect(image.headers()['content-type'] || '', key).toContain('image/jpeg');
    }
  });

  test('0.87.3 - Les autres pages partagent l\'image générale', async ({ page }) => {
    for (const path of ['/', '/tarification']) {
      const html = await (await page.request.get(path)).text();
      const og = html.match(/property="og:image"\s+content="([^"]*)"/)?.[1] || '';
      expect(og, path).toBe('https://openprojets.com/img/og/open-projets.jpg');
    }
  });
});
