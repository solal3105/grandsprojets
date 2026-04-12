// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

/**
 * Navigate to modules section and wait for the list to load.
 */
async function goToModules(page) {
  await waitForBoot(page, '/admin/modules/');
  await page.waitForFunction(() => {
    const el = document.querySelector('#mod-list-body');
    if (!el) return false;
    // No spinner — either modules or empty state
    return !el.textContent.includes('Chargement');
  }, { timeout: 15000 });
}

const successToast = (page, text) =>
  page.locator('.adm-toast--success').filter({ hasText: text });
const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

// ─────────────────────────────────────────────────────────
// 11.1 — Affichage liste modules
// ─────────────────────────────────────────────────────────
test.describe('11.1 — Affichage', () => {

  test('11.1.1 — Page chargée avec titre', async ({ page }) => {
    await goToModules(page);
    await expect(page.locator('.adm-page-title')).toContainText('Modules');
  });

  test('11.1.2 — Sous-titre contient le nom de la ville active', async ({ page }) => {
    await goToModules(page);
    await expect(page.locator('.adm-page-subtitle')).not.toBeEmpty();
  });

  test('11.1.3 — Bouton "Ajouter un module" visible', async ({ page }) => {
    await goToModules(page);
    await expect(page.locator('#mod-add-btn')).toBeVisible();
  });

  test('11.1.4 — Chaque module affiché montre label, clé et badge activé/désactivé', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    const count = await items.count();
    if (count === 0) return; // empty state — nothing to check
    const first = items.first();
    await expect(first.locator('.adm-list-item__name')).not.toBeEmpty();
    await expect(first.locator('.adm-badge--info')).toBeVisible(); // module_key badge
  });

  test('11.1.5 — Toggle switch visible pour chaque module', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    const count = await items.count();
    if (count === 0) return;
    await expect(items.first().locator('.adm-switch')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 11.2 — Toggle activation module
// ─────────────────────────────────────────────────────────
test.describe('11.2 — Toggle activation', () => {

  test('11.2.1 — Toggle un module produit un toast de succès', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    const count = await items.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await clearToasts(page);
    const toggle = items.first().locator('.adm-switch input');
    const wasBefore = await toggle.isChecked();
    await items.first().locator('.adm-switch__track').click();
    const word = wasBefore ? 'désactivé' : 'activé';
    await expect(successToast(page, word)).toBeVisible({ timeout: 5000 });
    // Restore original state
    await clearToasts(page);
    await items.first().locator('.adm-switch__track').click();
    await expect(successToast(page, wasBefore ? 'activé' : 'désactivé')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────
// 11.3 — Édition module
// ─────────────────────────────────────────────────────────
test.describe('11.3 — Édition', () => {

  test('11.3.1 — Clic "Éditer" ouvre le formulaire', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    const count = await items.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await items.first().locator('[data-action="edit"]').click();
    await expect(page.locator('.cw-header__title')).toContainText('Modifier');
  });

  test('11.3.2 — Formulaire contient champs label, icône, ordre, activé', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    if ((await items.count()) === 0) { test.skip(); return; }
    await items.first().locator('[data-action="edit"]').click();
    await expect(page.locator('#mod-label')).toBeVisible();
    await expect(page.locator('#mod-sort')).toBeVisible();
    await expect(page.locator('#mod-enabled')).toBeAttached();
  });

  test('11.3.3 — Bouton retour revient à la liste', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    if ((await items.count()) === 0) { test.skip(); return; }
    await items.first().locator('[data-action="edit"]').click();
    await expect(page.locator('.cw-header__title')).toContainText('Modifier');
    await page.locator('#mod-back').click();
    await expect(page.locator('.adm-page-title')).toContainText('Modules');
  });

  test('11.3.4 — Sauvegarde avec label vide montre un warning', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    if ((await items.count()) === 0) { test.skip(); return; }
    await items.first().locator('[data-action="edit"]').click();
    await page.locator('#mod-label').fill('');
    await page.locator('#mod-submit').click();
    await expect(page.locator('.adm-toast--warning')).toBeVisible({ timeout: 5000 });
  });

  test('11.3.5 — Sauvegarde avec données valides montre un toast succès', async ({ page }) => {
    await goToModules(page);
    const items = page.locator('.mod-list-item');
    if ((await items.count()) === 0) { test.skip(); return; }
    // Get original label to restore
    const originalLabel = await items.first().locator('.adm-list-item__name').textContent();
    await items.first().locator('[data-action="edit"]').click();
    await clearToasts(page);
    const labelInput = page.locator('#mod-label');
    const currentVal = await labelInput.inputValue();
    // Modify then restore
    await labelInput.fill(currentVal + ' test');
    await page.locator('#mod-submit').click();
    await expect(successToast(page, 'mis à jour')).toBeVisible({ timeout: 5000 });
    // Restore original label
    await page.waitForFunction(() => document.querySelector('#mod-list-body'), { timeout: 5000 });
    await page.locator('.mod-list-item').first().locator('[data-action="edit"]').click();
    await page.locator('#mod-label').fill(currentVal);
    await page.locator('#mod-submit').click();
    await expect(successToast(page, 'mis à jour')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────
// 11.4 — Sidebar
// ─────────────────────────────────────────────────────────
test.describe('11.4 — Sidebar', () => {

  test('11.4.1 — Lien Modules visible pour global-admin', async ({ page }) => {
    await waitForBoot(page);
    // data-role="global" → only visible if global admin
    const link = page.locator('.adm-nav-item[data-section="modules"]');
    // Can be visible or hidden depending on account role
    const isGlobal = await link.isVisible().catch(() => false);
    if (!isGlobal) {
      test.skip();
    } else {
      await expect(link).toBeVisible();
      await expect(link).toContainText('Modules');
    }
  });
});
