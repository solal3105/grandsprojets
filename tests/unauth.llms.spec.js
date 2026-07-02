// @ts-check
// Tests de la Netlify Function GET /llms.txt (référencement IA / standard llmstxt.org)
// Utilise le request fixture Playwright (pas de navigateur, appels HTTP directs).
//
// Section : 0.25 — llms.txt

import { test, expect } from '@playwright/test';

const ENDPOINT = '/llms.txt';

test.describe('0.25 — llms.txt : génération dynamique', () => {

  test('0.25.1 — GET → 200 en text/plain markdown, pas le fallback SPA', async ({ request }) => {
    const res = await request.get(ENDPOINT);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/plain');

    const body = await res.text();
    // Le point critique : ne PAS servir le HTML de la carte (ancien comportement soft-200)
    expect(body).not.toContain('<!DOCTYPE html>');
    expect(body.startsWith('# Open Projets')).toBe(true);
  });

  test('0.25.2 — structure : résumé, pages principales et ressources', async ({ request }) => {
    const body = await (await request.get(ENDPOINT)).text();

    // Blockquote de description (format llms.txt)
    expect(body).toContain('> Open Projets');
    expect(body).toContain('## Pages principales');
    expect(body).toContain('https://openprojets.com/home/');
    expect(body).toContain('## Ressources');
    expect(body).toContain('https://openprojets.com/sitemap.xml');
  });

  test('0.25.3 — liste des fiches projets par ville avec URLs absolues', async ({ request }) => {
    const body = await (await request.get(ENDPOINT)).text();

    // Au moins une section ville et au moins un lien de fiche
    expect(body).toMatch(/^## Projets — .+$/m);
    expect(body).toMatch(/^- \[.+\]\(https:\/\/openprojets\.com\/fiche\/[a-z0-9-]+\/[^)]+\)/m);
  });

  test('0.25.4 — les entrées de test E2E sont exclues', async ({ request }) => {
    const body = await (await request.get(ENDPOINT)).text();

    // Mêmes exclusions que le sitemap : projets préfixés e2e-/e2e_
    expect(body).not.toMatch(/\[e2e[-_]/i);
  });
});
