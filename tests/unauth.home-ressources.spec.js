// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Section Ressources du site home (/home/ressources) + garantie prerender.
 *
 * Les pages home sont prerendues au build (home-src/scripts/prerender.mjs) :
 * le HTML servi contient le contenu complet sans exécution JavaScript. Les
 * tests 0.31.4 et 0.31.5 vérifient cette garantie avec le JS désactivé
 * (c'est ce que voient GPTBot/ClaudeBot/PerplexityBot, qui ne rendent pas
 * le JS). Aucune dépendance auth : projet unauth.
 */

const ARTICLE_SLUG = 'carte-plan-de-mandat-2026-2032';
const ARTICLE_PATH = `/home/ressources/${ARTICLE_SLUG}`;

test.describe('Ressources - liste', () => {
  test('0.31.1 - /home/ressources affiche la liste avec au moins un article', async ({ page }) => {
    await page.goto('/home/ressources', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Communiquer sur les projets');
    const card = page.locator(`a[href="${ARTICLE_PATH}"]`).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('plan de mandat');
  });

  test('0.31.2 - le lien Ressources est présent dans la navigation du site home', async ({ page }) => {
    await page.goto('/home/', { waitUntil: 'domcontentloaded' });
    const navLink = page.locator('header a[href="/home/ressources"]').first();
    await expect(navLink).toBeVisible();
  });
});

test.describe('Ressources - article', () => {
  test('0.31.3 - la page article rend le titre, les metas et le contenu', async ({ page }) => {
    await page.goto(ARTICLE_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('plan de mandat 2026-2032');
    await expect(page).toHaveTitle(/plan de mandat 2026-2032.*Open Projets/);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', `https://openprojets.com${ARTICLE_PATH}`);
    // Corps de l'article rendu (markdown -> HTML)
    await expect(page.locator('.prose-op h2').first()).toBeVisible();
    // Navigation retour vers la liste
    await expect(page.locator(`a[href="/home/ressources"]`).first()).toBeVisible();
  });

  test('0.31.4 - prerender : le contenu de l\'article est servi sans JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ARTICLE_PATH, { waitUntil: 'domcontentloaded' });
    // Sans JS : le HTML doit déjà contenir H1 + contenu complet (garantie crawlers IA)
    await expect(page.locator('h1')).toContainText('plan de mandat 2026-2032');
    const wordCount = await page.evaluate(() => document.body.innerText.split(/\s+/).length);
    expect(wordCount).toBeGreaterThan(800);
    await context.close();
  });

  test('0.31.5 - prerender : la home sert son contenu texte sans JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/home/', { waitUntil: 'domcontentloaded' });
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    const wordCount = await page.evaluate(() => document.body.innerText.split(/\s+/).length);
    expect(wordCount).toBeGreaterThan(300);
    await context.close();
  });

  test('0.31.6 - le manifest des ressources est servi et référence l\'article', async ({ request }) => {
    const resp = await request.get('/home/ressources/manifest.json');
    expect(resp.ok()).toBeTruthy();
    const manifest = await resp.json();
    const article = manifest.find((a) => a.slug === ARTICLE_SLUG);
    expect(article).toBeTruthy();
    expect(article.title).toContain('plan de mandat');
    expect(article.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
