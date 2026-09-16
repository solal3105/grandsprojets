// @ts-check
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resourceSeo } from '../home-src/src/lib/resource-seo.mjs';
import { projectModifiedAt, fetchProjectResponse } from '../netlify/lib/project-seo.mjs';
import { groupByVille } from '../netlify/functions/lib/projects-index.mjs';
import { renderSitemap } from '../netlify/functions/lib/sitemap.mjs';
import ficheSsr from '../netlify/edge-functions/fiche-ssr.js';

const contentDir = 'home-src/src/content/ressources';
const articles = readdirSync(contentDir).filter((name) => name.endsWith('.md')).map((name) => {
  const text = readFileSync(`${contentDir}/${name}`, 'utf8');
  return {
    slug: name.replace(/\.md$/, ''),
    title: text.match(/^title: (.*)$/m)?.[1] || '',
    description: text.match(/^description: (.*)$/m)?.[1] || '',
  };
});

test.describe('0.75 - Métadonnées automatiques et dates éditoriales', () => {
  test('0.75.1 - Tous les guides et les futurs textes longs respectent les limites', () => {
    for (const article of [...articles, {
      title: 'Un nouveau guide sans sous-titre '.repeat(10), description: 'Texte sans ponctuation '.repeat(30),
    }, { title: 'x'.repeat(200), description: 'y'.repeat(200) }]) {
      const meta = resourceSeo(article);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.title.length).toBeLessThanOrEqual(60);
      expect(meta.description.length).toBeLessThanOrEqual(160);
      expect(meta.title.split('|').length).toBeLessThanOrEqual(2);
    }
    expect(resourceSeo({ title: 'QGIS en mairie : un sous-titre beaucoup trop long pour tenir dans le résultat', description: 'Une phrase entière. ' + 'Suite '.repeat(50) }))
      .toEqual({ title: 'QGIS en mairie | Open Projets', description: 'Une phrase entière.' });
  });

  test('0.75.2 - Une modification ancienne remonte la date du hub sans changer la publication', () => {
    const old = { ville: 'essai-paris', created_at: '2025-01-01', content_updated_at: '2026-09-16T08:30:00Z' };
    const recent = { ville: 'essai-paris', created_at: '2026-09-01' };
    expect(projectModifiedAt(old)).toBe('2026-09-16T08:30:00.000Z');
    expect(groupByVille([recent, old]).get('essai-paris')).toEqual({ count: 2, lastmod: '2026-09-16' });
    expect(projectModifiedAt({ created_at: '2026-09-01', content_updated_at: 'invalide' })).toBe('2026-09-01T00:00:00.000Z');
    expect(projectModifiedAt({ created_at: null })).toBeNull();
  });

  test('0.75.3 - Avant migration, seul le champ de date absent déclenche le repli', async () => {
    const original = globalThis.fetch;
    const calls = [];
    try {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        return calls.length === 1
          ? Response.json({ code: '42703', message: 'column contribution_uploads.content_updated_at does not exist' }, { status: 400 })
          : Response.json([{ created_at: '2025-01-01' }]);
      };
      const url = 'https://example.test/rest/v1/contribution_uploads?select=created_at,content_updated_at&offset=1000';
      expect((await fetchProjectResponse(url, {})).status).toBe(200);
      expect(calls[1].searchParams.get('select')).toBe('created_at');
      expect(calls[1].searchParams.get('offset')).toBe('1000');
      let retries = 0;
      globalThis.fetch = async () => { retries++; return new Response('Accès interdit', { status: 403 }); };
      expect((await fetchProjectResponse(url, {})).status).toBe(403);
      expect(retries).toBe(1);
    } finally { globalThis.fetch = original; }
  });

  test('0.75.4 - Sitemap et JSON-LD reprennent la modification, les essais restent indexables', async () => {
    const original = globalThis.fetch;
    const project = {
      project_name: 'Un projet', category: 'urbanisme', category_slug: 'urbanisme', slug: 'un-projet',
      ville: 'essai-paris', description: 'Un projet recensé à Paris.', created_at: '2025-01-01T00:00:00Z',
      content_updated_at: '2026-09-16T08:30:00Z', cover_url: 'https://example.test/image.jpg?a=1&b=2',
    };
    try {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contribution_uploads')) return Response.json([project]);
        if (url.pathname.endsWith('/city_branding')) return Response.json(url.searchParams.has('indexable')
          ? [] : [{ brand_name: 'Paris', indexable: true, logo_url: 'https://example.test/paris.png' }]);
        return Response.json([]);
      };
      const xml = await (await renderSitemap('fiches')).text();
      expect(xml).toContain('/fiche/essai-paris/urbanisme/un-projet');
      expect(xml).toContain('<lastmod>2026-09-16</lastmod>');
      expect(xml).toContain('image.jpg?a=1&amp;b=2');
      expect(xml).not.toContain('<image:title>');
      const shell = readFileSync('fiche/index.html', 'utf8');
      const response = await ficheSsr(new Request('https://openprojets.com/fiche/essai-paris/urbanisme/un-projet'), {
        next: async () => new Response(shell, { headers: { 'Content-Type': 'text/html' } }),
      });
      const html = await response.text();
      const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => JSON.parse(m[1])).find((item) => item['@type'] === 'Article');
      expect(ld.datePublished).toBe('2025-01-01T00:00:00.000Z');
      expect(ld.dateModified).toBe('2026-09-16T08:30:00.000Z');
      expect(ld.publisher.name).toBe('Open Projets');
      expect(ld.publisher.logo.url).not.toContain('paris.png');
      expect(response.headers.get('X-Robots-Tag')).toMatch(/^index/);
      expect(html).toContain('sans participation de la commune');
    } finally { globalThis.fetch = original; }
  });

  test('0.75.5 - Un manifest indisponible ne fait pas disparaître les guides du sitemap', async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response('Indisponible', { status: 503 });
      expect((await renderSitemap('pages')).status).toBe(500);
    } finally { globalThis.fetch = original; }
  });

  test('0.75.6 - Tous les guides servis ont les mêmes métadonnées que le prérendu', async ({ request, page }) => {
    for (const article of articles) {
      const response = await request.get(`/ressources/${article.slug}`);
      expect(response.status()).toBe(200);
      const html = await response.text();
      // Le DOM décode les entités comme le navigateur, sans dépendre de leur graphie.
      await page.setContent(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''));
      const meta = resourceSeo(article);
      await expect(page).toHaveTitle(meta.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', meta.description);
      await expect(page.locator('h1')).toHaveText(article.title);
      const prerendered = readFileSync(`home/ressources/${article.slug}.html`, 'utf8');
      expect(prerendered.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(html.match(/<title>([^<]*)<\/title>/)?.[1]);
    }
  });

  test('0.75.7 - En navigation client, les métadonnées suivent le guide sans raccourcir le H1', async ({ page }) => {
    const article = articles.find((a) => a.slug === 'carte-plan-de-mandat-2026-2032');
    await page.goto('/ressources');
    await page.locator(`a[href="/ressources/${article.slug}"]`).first().click();
    await expect(page).toHaveTitle(resourceSeo(article).title);
    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', resourceSeo(article).description);
  });

  test('0.75.8 - Les hubs d’essai décrivent un recensement, avec indexation conservée', async ({ request }) => {
    const response = await request.get('/ville/essai-paris');
    const html = await response.text();
    expect(response.headers()['x-robots-tag']).toMatch(/^index/);
    expect(html).toContain('projets recensés sur le territoire de Paris');
    expect(html).not.toContain('Paris publie');
    expect(html).toContain('sans participation de la commune');
  });

  test('0.75.9 - La provenance d’une fiche reste visible après le rendu client', async ({ page, request }) => {
    const path = '/fiche/essai-paris/patrimoine/fouille-dans-la-cour-de-la-conciergerie';
    const html = await (await request.get(path)).text();
    const article = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((item) => item['@type'] === 'Article');
    expect(article.publisher.name).toBe('Open Projets');
    expect(article.about.name).toBe('Paris');
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#fv2-provenance')).toBeVisible();
    await expect(page.locator('#fv2-provenance')).toContainText('publiée par Open Projets');
    await page.goto('/fiche/metropole-lyon/urbanisme/parc-aux-herissons', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#fv2-provenance')).toBeHidden();
  });
});
