// @ts-check
import { test, expect } from '@playwright/test';
import {
  REGLAGES, TOUR, mod, repartirCases, caseSousLanguette, creerRoue, lancer, avancer,
} from '../home-src/src/v2/roue/moteur.mjs';

/**
 * La roue des lots du stand - /roue
 *
 * Ce que ces tests garantissent :
 *  - le tirage est honnête : toutes les cases ont la même chance, la chance
 *    d'un lot est la part de la roue qu'il occupe, aucun geste mou ne peut
 *    viser une case et la roue s'arrête toujours franchement dans une case ;
 *  - la page est hors des moteurs, une partie lancée au bouton se termine sur
 *    le lot de la case où la roue s'arrête, et elle est comptée ;
 *  - un lot épuisé quitte la roue ;
 *  - l'écran de la vidéo ouvre la roue dans son panneau.
 *
 * Le son, la vibration et la fluidité sur la tablette du stand ne sont pas
 * couverts ici.
 */

const lots = [
  { key: 'a', parts: 3 }, { key: 'b', parts: 3 }, { key: 'c', parts: 3 }, { key: 'd', parts: 3 },
];

test.describe('0.77 La roue des lots - le tirage', () => {
  test('0.77.1 les lots sont entrelacés et occupent leur part de la roue', () => {
    const cases = repartirCases(lots);
    expect(cases).toHaveLength(12);
    for (let i = 0; i < cases.length; i++) {
      expect(cases[i].key).not.toBe(cases[(i + 1) % cases.length].key);
    }
    const inegal = repartirCases([{ key: 'a', parts: 1 }, { key: 'b', parts: 5 }, { key: 'c', parts: 0 }]);
    expect(inegal.filter((c) => c.key === 'a')).toHaveLength(1);
    expect(inegal.filter((c) => c.key === 'b')).toHaveLength(5);
    expect(inegal.some((c) => c.key === 'c')).toBe(false);
  });

  test('0.77.2 sur des milliers de lancers, chaque case sort aussi souvent que les autres', () => {
    // Un hasard reproductible, pour que le test ne dépende pas du tirage du jour.
    let graine = 42;
    const hasard = () => ((graine = (graine * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const n = 12;
    const sorties = Array.from({ length: n }, () => 0);
    const lancers = 2400;
    for (let k = 0; k < lancers; k++) {
      const roue = creerRoue(n, hasard() * TOUR);
      lancer(roue, (hasard() < 0.5 ? -1 : 1) * (6 + hasard() * 14), hasard);
      let t = 0;
      while (!roue.arretee && t < 60) { avancer(roue, 1 / 60); t += 1 / 60; }
      expect(roue.arretee).toBe(true);
      sorties[caseSousLanguette(roue.angle, n)]++;
    }
    const attendu = lancers / n;
    for (const s of sorties) {
      expect(s).toBeGreaterThan(attendu * 0.75);
      expect(s).toBeLessThan(attendu * 1.25);
    }
  });

  test("0.77.3 un geste mou est relancé, et la roue s'arrête toujours franchement dans une case", () => {
    const roue = creerRoue(12, 0);
    lancer(roue, 0.8, () => 0.5);
    expect(Math.abs(roue.vitesse)).toBeGreaterThanOrEqual(REGLAGES.vitesseMin * 0.94);
    for (let k = 0; k < 300; k++) {
      const r = creerRoue(12, Math.random() * TOUR);
      lancer(r, 9 + Math.random() * 8);
      while (!r.arretee) avancer(r, 1 / 30);
      // Sur des cases de 30 degrés, jamais à moins de 3 degrés d'une séparation.
      const q = mod(r.angle / (TOUR / 12), 1);
      expect(q).toBeGreaterThan(0.1);
      expect(q).toBeLessThan(0.9);
    }
  });
});

test.describe('0.78 La roue des lots - la page', () => {
  test('0.78.1 la page est servie hors des moteurs, sans en-tête de site', async ({ page, request }) => {
    await page.goto('/roue', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Tournez la roue et gagnez un lot/);
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
    const reponse = await request.get('/roue');
    expect(reponse.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('header nav')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'La roue fait gagner ces 4 lots.' })).toBeVisible();
  });

  test('0.78.2 une partie lancée au bouton finit sur un lot, et elle est comptée', async ({ page }) => {
    await page.clock.install();
    await page.goto('/roue', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('op-roue-v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Lancer la roue' }).click();
    await page.clock.runFor(20000);
    const titre = page.getByRole('heading', { name: /^Vous avez gagné/ });
    await expect(titre).toBeVisible();
    const gagne = await titre.textContent();
    await page.getByRole('button', { name: 'Ouvrir les réglages des lots' }).click();
    await expect(page.getByText('Une partie a été jouée sur cette tablette.')).toBeVisible();
    await expect(page.getByText('Ce lot a été gagné une fois sur cette tablette.')).toHaveCount(1);
    await page.getByRole('button', { name: 'Fermer les réglages' }).click();
    await page.getByRole('button', { name: 'Revenir à la roue' }).click();
    await expect(page.getByRole('heading', { name: 'Tournez la roue et gagnez un lot.' })).toBeVisible();
    expect(gagne).toMatch(/Vous avez gagné (un serre-pantalon|un couvre-selle|une carte postale de votre commune|la carte des projets de votre commune)\./);
  });

  test('0.78.3 un lot dont le stock tombe à zéro quitte la roue', async ({ page }) => {
    await page.goto('/roue', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('op-roue-v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ouvrir les réglages des lots' }).click();
    const stocks = page.getByLabel('Stock restant');
    for (const i of [0, 1, 2]) {
      await stocks.nth(i).fill('0');
      await stocks.nth(i).press('Tab');
    }
    await page.getByRole('button', { name: 'Fermer les réglages' }).click();
    await expect(page.getByRole('heading', { name: 'La roue fait gagner ce lot.' })).toBeVisible();
    await expect(page.locator('.lots li')).toHaveText(['La carte des projets de votre commune']);
    // Les réglages survivent au rechargement de la page.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.lots li')).toHaveCount(1);
    await page.evaluate(() => localStorage.removeItem('op-roue-v1'));
  });

  test("0.78.4 l'écran de la vidéo ouvre la roue dans son panneau", async ({ page }) => {
    await page.goto('/video', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Roue des lots' }).click();
    const panneau = page.getByRole('dialog', { name: 'La roue des lots' });
    await expect(panneau.locator('iframe')).toHaveAttribute('src', '/roue');
    await expect(page.frameLocator('iframe').getByRole('button', { name: 'Lancer la roue' })).toBeVisible();
  });
});
