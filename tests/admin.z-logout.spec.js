// @ts-check
import { test, expect } from '@playwright/test';

/**
 * 0.3 — Déconnexion
 *
 * ⚠ Ce fichier DOIT être exécuté EN DERNIER parmi les tests admin
 *   car signOut() révoque le token côté serveur.
 *   Le préfixe "z-" garantit l'ordre alphabétique.
 */

async function waitForBoot(page) {
  await page.goto('/admin/');
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

test.describe('0.3 — Déconnexion', () => {

  test('0.3.1 + 0.3.2 — Déconnexion et session détruite', async ({ page }) => {
    await waitForBoot(page);

    // 0.3.1 — Clic déconnexion → redirect /login/
    await page.click('#adm-logout');
    await page.waitForURL('**/login/**', { timeout: 10000 });
    expect(page.url()).toContain('/login/');

    // 0.3.2 — Après déconnexion, /admin/ redirige vers /login/
    await page.goto('/admin/', { waitUntil: 'commit' });
    await page.waitForURL('**/login/**', { timeout: 15000 });
    expect(page.url()).toContain('/login/');
  });

});
