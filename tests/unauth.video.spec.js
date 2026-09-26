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
 *  - hors plein écran, les deux sorties sont là : l'écran du stand et les
 *    pages des cinq modules.
 *
 * Le plein écran lui-même n'est pas couvert : Chromium sans fenêtre refuse
 * requestFullscreen hors d'un vrai geste de l'utilisateur.
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

  test("0.76.4 les sorties mènent à l'écran du stand et aux cinq modules", async ({ page }) => {
    const stand = page.getByRole('link', { name: /carte des projets de votre commune/ });
    await expect(stand).toHaveAttribute('href', 'https://openprojets.com/kiosk');
    const modules = page.locator('a[href="/carte"], a[href="/travaux"], a[href="/chantiers"], a[href="/participer"], a[href="/diagnostic"]');
    await expect(modules).toHaveCount(5);
    await page.locator('a[href="/travaux"]').click();
    await expect(page).toHaveURL(/\/travaux$/);
  });
});
