// @ts-check
import { test, expect } from '@playwright/test';

/**
 * L'écran de salon - /video
 *
 * Ce que ces tests garantissent :
 *  - la page est servie hors des moteurs, balise et en-tête compris, sans
 *    l'en-tête ni le pied de page du site ;
 *  - la vidéo tourne en boucle et démarre muette (les navigateurs refusent la
 *    lecture automatique avec le son), et le bouton du son la fait parler ;
 *  - un clic sur l'image met la vidéo en pause et la relance, sans jamais
 *    passer en plein écran : seul le bouton du lecteur le fait ;
 *  - les sorties sont là, l'écran du stand et les pages des cinq modules, et
 *    une page s'ouvre dans un panneau posé sur la vidéo, qui se met en pause
 *    pendant la visite et repart quand on revient.
 */

test.describe("0.76 Écran de salon - la page /video", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/video', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('video')).toBeVisible();
  });

  test('0.76.1 la page est servie hors des moteurs, sans en-tête de site', async ({ page, request }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
    const reponse = await request.get('/video');
    expect(reponse.headers()['x-robots-tag']).toContain('noindex');
    await expect(page).toHaveTitle(/avant et après Open Projets/);
    await expect(page.locator('header nav')).toHaveCount(0);
  });

  test('0.76.2 la vidéo tourne en boucle et démarre muette', async ({ page }) => {
    const video = page.locator('video');
    await expect(video).toHaveAttribute('src', '/video/open-projets-avant-apres.mp4');
    await expect(video).toHaveAttribute('poster', '/video/open-projets-avant-apres.webp');
    const etat = await video.evaluate((v) => ({ loop: v.loop, muted: v.muted, autoplay: v.autoplay }));
    expect(etat).toEqual({ loop: true, muted: true, autoplay: true });
  });

  test('0.76.3 le bouton du son fait parler la vidéo, puis la fait taire', async ({ page }) => {
    const bouton = page.getByRole('button', { name: 'Activer le son' });
    await bouton.click();
    await expect(page.getByRole('button', { name: 'Couper le son' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('video').evaluate((v) => v.muted)).toBe(false);
    await page.getByRole('button', { name: 'Couper le son' }).click();
    expect(await page.locator('video').evaluate((v) => v.muted)).toBe(true);
  });

  test("0.76.4 les icônes mènent à l'écran du stand, à la roue et aux cinq modules", async ({ page }) => {
    const stand = page.getByRole('link', { name: 'Ma commune' });
    await expect(stand).toHaveAttribute('href', 'https://openprojets.com/kiosk');
    const modules = page.locator('a[href="/carte"], a[href="/travaux"], a[href="/chantiers"], a[href="/participer"], a[href="/diagnostic"]');
    await expect(modules).toHaveCount(5);
    for (const nom of ['Carte', 'Travaux', 'Chantiers', 'Signalement', 'Diagnostic']) {
      await expect(page.getByRole('link', { name: nom, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Roue des lots' })).toHaveAttribute('href', '/roue');
  });

  test("0.76.5 un clic sur l'image met en pause sans passer en plein écran", async ({ page }) => {
    const video = page.locator('video');
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
    await video.click();
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.getByRole('button', { name: 'Reprendre la vidéo' }).first().click();
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
  });

  test('0.76.6 le bouton du plein écran agrandit le lecteur, commandes comprises', async ({ page }) => {
    await page.getByRole('button', { name: 'Passer en plein écran' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('lecteur'))).toBe(true);
    await page.getByRole('button', { name: 'Quitter le plein écran' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  });

  test("0.76.7 un module s'ouvre dans un panneau sur la vidéo, qui repart au retour", async ({ page }) => {
    const video = page.locator('video');
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
    await page.locator('a[href="/travaux"]').click();
    const panneau = page.getByRole('dialog', { name: 'Travaux du quotidien' });
    await expect(panneau).toBeVisible();
    await expect(panneau.locator('iframe')).toHaveAttribute('src', '/travaux');
    await expect(page.frameLocator('iframe').locator('h1')).toContainText('rue rouvre');
    await expect(page).toHaveURL(/\/video$/);
    expect(await video.evaluate((v) => v.paused)).toBe(true);
    await expect(panneau.getByRole('button', { name: 'Revenir à la vidéo' })).toBeFocused();
    await panneau.getByRole('button', { name: 'Passer en plein écran' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('role'))).toBe('dialog');
    await panneau.getByRole('button', { name: 'Revenir à la vidéo' }).click();
    await expect(panneau).toHaveCount(0);
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
  });

  test('0.76.8 Échap referme le panneau et rend la main au lien qui l\'a ouvert', async ({ page }) => {
    const lien = page.locator('a[href="/diagnostic"]');
    await lien.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(lien).toBeFocused();
  });
});
