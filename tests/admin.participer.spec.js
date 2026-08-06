// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Section admin Participer - file de traitement et configuration.
 *
 * Couvre : le rendu de la file (onglets, recherche, export), les réglages,
 * le CRUD des catégories et l'édition de l'affichage des statuts, sur la
 * ville de test `test-e2e` (seedée).
 *
 * NON testable ici : les actions sur un signalement réel (publication, statut,
 * suppression) - elles exigeraient un dépôt confirmé par email. Le contrat des
 * endpoints est couvert par unauth.participer.spec.js.
 */

async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

async function goToList(page) {
  await waitForBoot(page, '/admin/participer/');
  await expect(page.locator('.adm-page-title')).toContainText('Participer', { timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 17.1 - File de traitement
// ─────────────────────────────────────────────────────────
test.describe('17.1 - File de traitement', () => {

  test('17.1.1 - La file se charge avec ses onglets', async ({ page }) => {
    await goToList(page);
    for (const label of ['À traiter', 'En cours', 'Clos', 'Tous']) {
      await expect(page.locator('.adm-tab', { hasText: label })).toBeVisible();
    }
    await expect(page.locator('#pt-search')).toBeVisible();
    await expect(page.locator('#pt-export-btn')).toBeVisible();
  });

  test('17.1.2 - Un admin voit les liens de configuration', async ({ page }) => {
    await goToList(page);
    for (const href of ['/admin/participer/config/', '/admin/participer/categories/', '/admin/participer/statuts/']) {
      await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
    }
  });

  test('17.1.3 - Le changement d\'onglet recharge la liste', async ({ page }) => {
    await goToList(page);
    await page.locator('.adm-tab', { hasText: 'Tous' }).click();
    await expect(page.locator('.adm-tab', { hasText: 'Tous' })).toHaveClass(/active/);
    // Liste ou état vide : la file rend toujours quelque chose
    await expect(page.locator('#pt-list-body .adm-card, #pt-list-body .adm-empty').first()).toBeVisible({ timeout: 15000 });
  });
});

// ─────────────────────────────────────────────────────────
// 17.2 - Réglages
// ─────────────────────────────────────────────────────────
test.describe('17.2 - Réglages', () => {

  test('17.2.1 - La page affiche tous les paramètres', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/config/');
    await expect(page.locator('.adm-page-title')).toContainText('Réglages', { timeout: 15000 });
    for (const id of ['ptcfg-intro', 'ptcfg-success', 'ptcfg-email', 'ptcfg-paused', 'ptcfg-quota-email', 'ptcfg-quota-ip', 'ptcfg-alerte', 'ptcfg-retention']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
  });

  test('17.2.2 - L\'enregistrement des réglages aboutit', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/config/');
    await expect(page.locator('#ptcfg-save')).toBeVisible({ timeout: 15000 });
    await clearToasts(page);
    await page.locator('#ptcfg-save').click();
    await expect(page.locator('.adm-toast--success')).toContainText('enregistrés', { timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────
// 17.3 - Catégories
// ─────────────────────────────────────────────────────────
test.describe('17.3 - Catégories', () => {

  test('17.3.1 - Les catégories seedées sont listées', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/categories/');
    await expect(page.locator('.adm-page-title')).toContainText('Catégories', { timeout: 15000 });
    await expect(page.locator('#ptcat-list .adm-list-item').first()).toBeVisible({ timeout: 15000 });
    expect(await page.locator('#ptcat-list .adm-list-item').count()).toBeGreaterThanOrEqual(6);
  });

  test('17.3.2 - Création puis suppression d\'une catégorie', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/categories/');
    await expect(page.locator('#ptcat-add')).toBeVisible({ timeout: 15000 });

    // Libellé unique : le test reste rejouable même après un échec à mi-course
    const label = `Test E2E ${Date.now()}`;
    await page.locator('#ptcat-add').click();
    const panel = page.locator('#adm-slide-content');
    await expect(panel.locator('#ptc-label')).toBeVisible();
    await panel.locator('#ptc-label').fill(label);
    // La clé technique se déduit du libellé
    await expect(panel.locator('#ptc-key')).toHaveValue(/test-e2e-\d+/);
    await clearToasts(page);
    await panel.locator('#ptc-save').click();
    await expect(page.locator('.adm-toast--success')).toContainText('créée', { timeout: 10000 });

    const row = page.locator('#ptcat-list .adm-list-item', { hasText: label });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Suppression (dialogue de confirmation global)
    await clearToasts(page);
    await row.locator('[data-delete]').click();
    await page.locator('#adm-dialog-confirm').click();
    await expect(page.locator('.adm-toast--success')).toContainText('supprimée', { timeout: 10000 });
    await expect(page.locator('#ptcat-list .adm-list-item', { hasText: label })).toHaveCount(0, { timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────
// 17.4 - Statuts
// ─────────────────────────────────────────────────────────
test.describe('17.4 - Statuts', () => {

  test('17.4.1 - Les 7 statuts sont listés', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/statuts/');
    await expect(page.locator('.adm-page-title')).toContainText('statuts', { timeout: 15000 });
    await expect(page.locator('#ptst-list .adm-list-item')).toHaveCount(7, { timeout: 15000 });
  });

  test('17.4.2 - Le libellé d\'un statut est personnalisable (clé immuable)', async ({ page }) => {
    await waitForBoot(page, '/admin/participer/statuts/');
    const row = page.locator('#ptst-list .adm-list-item', { hasText: 'resolu' });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.locator('[data-edit]').click();

    const panel = page.locator('#adm-slide-content');
    await expect(panel.locator('#pts-label')).toBeVisible();
    const original = await panel.locator('#pts-label').inputValue();

    await panel.locator('#pts-label').fill('Réglé (test)');
    await clearToasts(page);
    await panel.locator('#pts-save').click();
    await expect(page.locator('.adm-toast--success')).toContainText('mis à jour', { timeout: 10000 });
    await expect(page.locator('#ptst-list .ptadm-pill', { hasText: 'Réglé (test)' })).toBeVisible({ timeout: 10000 });

    // Remise en état : la ville de test reste propre pour les autres specs
    await page.locator('#ptst-list .adm-list-item', { hasText: 'resolu' }).locator('[data-edit]').click();
    await panel.locator('#pts-label').fill(original);
    await clearToasts(page);
    await panel.locator('#pts-save').click();
    await expect(page.locator('.adm-toast--success')).toContainText('mis à jour', { timeout: 10000 });
  });
});
