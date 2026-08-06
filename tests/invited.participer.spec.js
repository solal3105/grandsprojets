// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Section admin Participer - gating du rôle contributeur (invited).
 *
 * Le contributeur est l'agent de terrain : il voit la file et change les
 * statuts, mais la configuration et la modération restent aux administrateurs.
 * La répartition est aussi revérifiée côté serveur (/api/participer/update) -
 * ici on garantit que l'interface ne promet rien d'interdit.
 */

async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

test.describe('18.1 - Contributeur', () => {

  test('18.1.1 - La file est accessible, sans liens de configuration', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/');
    await expect(page.locator('.adm-page-title')).toContainText('Participer', { timeout: 15000 });
    await expect(page.locator('a[href="/admin/participer/config/"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/participer/categories/"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/participer/statuts/"]')).toHaveCount(0);
    // L'export reste disponible : les agents en ont besoin sur le terrain
    await expect(page.locator('#pt-export-btn')).toBeVisible();
  });

  test('18.1.2 - Les pages de configuration sont verrouillées', async ({ page }) => {
    for (const path of ['/admin/participer/config/', '/admin/participer/categories/', '/admin/participer/statuts/']) {
      await waitForBoot(page, path);
      await expect(page.locator('.adm-empty__title')).toContainText('Réservé', { timeout: 15000 });
    }
  });

  test('18.1.3 - Le lien Participer figure dans le menu', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/');
    const link = page.locator('.adm-nav-item[data-section="participer"]');
    await expect(link).toBeVisible();
  });
});
