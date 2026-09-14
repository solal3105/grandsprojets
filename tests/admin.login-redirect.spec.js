// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Après la connexion, chacun arrive sur la carte de sa collectivité
 * (/ville/{ville}/carte), plus sur la racine, qui est le site vitrine.
 * Le compte administrateur de la suite a pour ville test-e2e.
 */
test.describe('1.9 - Arrivée après connexion', () => {

  test('1.9.1 - Un compte connecté qui ouvre la page de connexion est envoyé sur sa carte', async ({ page }) => {
    await page.goto('/login/', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/ville\/test-e2e\/carte$/, { timeout: 20000 });
    await expect(page.locator('#gp-sidebar')).toBeVisible({ timeout: 20000 });
  });
});
