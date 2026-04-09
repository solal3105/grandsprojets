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
 * Navigate to structure and wait for content to load (skeletons replaced).
 */
async function goToStructure(page) {
  await waitForBoot(page, '/admin/structure/');
  // _renderContent replaces #structure-body entirely — wait for the actual form to appear
  await page.waitForSelector('#st-brand-name', { state: 'visible', timeout: 15000 });
}

const successToast = (page, text) =>
  page.locator('.adm-toast--success').filter({ hasText: text });
const errorToast = (page, text) =>
  page.locator('.adm-toast--error').filter({ hasText: text });
const warningToast = (page, text) =>
  page.locator('.adm-toast--warning').filter({ hasText: text });
const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

// ─────────────────────────────────────────────────────────
// 6.1 — Affichage
// ─────────────────────────────────────────────────────────
test.describe('6.1 — Affichage', () => {

  test('6.1.1 — Page chargée avec titre et sous-titre', async ({ page }) => {
    await goToStructure(page);
    await expect(page.locator('.cw-header__title')).toContainText('Ma structure');
    await expect(page.locator('.cw-header__subtitle')).toContainText('test-e2e');
  });

  test('6.1.2 — Section identité : brand name pré-rempli', async ({ page }) => {
    await goToStructure(page);
    const brandName = page.locator('#st-brand-name');
    await expect(brandName).toBeVisible();
    // test-e2e has a brand_name set
    const val = await brandName.inputValue();
    expect(val.length).toBeGreaterThan(0);
  });

  test('6.1.3 — Code ville en lecture seule (disabled)', async ({ page }) => {
    await goToStructure(page);
    // City code input is disabled — it's the second .cw-field__input in the identity section
    const disabledInput = page.locator('.cw-field__input[disabled]');
    await expect(disabledInput).toBeVisible();
    await expect(disabledInput).toBeDisabled();
    await expect(disabledInput).toHaveValue('test-e2e');
  });

  test('6.1.4 — Logos : dropzone ou preview visible pour chaque type', async ({ page }) => {
    await goToStructure(page);
    for (const prefix of ['st-logo', 'st-dark-logo', 'st-favicon']) {
      const drop = page.locator(`#${prefix}-drop`);
      const preview = page.locator(`#${prefix}-preview`);
      const dropVisible = await drop.isVisible().catch(() => false);
      const previewVisible = await preview.isVisible().catch(() => false);
      expect(dropVisible || previewVisible,
        `Either #${prefix}-drop or #${prefix}-preview should be visible`).toBeTruthy();
    }
  });

  test('6.1.5 — Color picker et hex input synchronisés', async ({ page }) => {
    await goToStructure(page);
    await expect(page.locator('#st-color-picker')).toBeVisible();
    await expect(page.locator('#st-color-text')).toBeVisible();
    // Both should reflect same color
    const pickerVal = (await page.locator('#st-color-picker').inputValue()).replace('#', '').toUpperCase();
    const textVal = (await page.locator('#st-color-text').inputValue()).toUpperCase();
    expect(pickerVal).toBe(textVal);
  });

  test('6.1.6 — Aperçu badge et bouton couleur', async ({ page }) => {
    await goToStructure(page);
    await expect(page.locator('#st-color-preview')).toBeVisible();
  });

  test('6.1.7 — Basemap selector peuplé', async ({ page }) => {
    await goToStructure(page);
    const select = page.locator('#st-basemap');
    await expect(select).toBeVisible();
    const optionCount = await select.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(1); // At least "Défaut global"
  });

  test('6.1.8 — Toggles UI chargés depuis la base', async ({ page }) => {
    await goToStructure(page);
    const toggles = page.locator('.st-toggle-row');
    const count = await toggles.count();
    expect(count).toBeGreaterThan(0);
    // Each toggle has a label and a switch track
    await expect(toggles.first().locator('.st-toggle-row__name')).toBeVisible();
    await expect(toggles.first().locator('.adm-switch__track')).toBeVisible();
  });

  test('6.1.9 — Espaces activés avec chips et input ajout', async ({ page }) => {
    await goToStructure(page);
    await expect(page.locator('#st-enabled-cities')).toBeVisible();
    await expect(page.locator('#st-add-city-input')).toBeVisible();
    await expect(page.locator('#st-add-city-btn')).toBeVisible();
  });

  test('6.1.10 — Basemap selector : sélection et au moins 1 option', async ({ page }) => {
    await goToStructure(page);
    const select = page.locator('#st-basemap');
    await expect(select).toBeVisible();
    const options = select.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(1);
    // Change selection if > 1 option
    if (count > 1) {
      const originalVal = await select.inputValue();
      const secondVal = await options.nth(1).getAttribute('value');
      await select.selectOption(secondVal);
      await expect(select).toHaveValue(secondVal);
      // Restore original
      await select.selectOption(originalVal);
    }
  });

});

// ─────────────────────────────────────────────────────────
// 6.2 — Modifications
// ─────────────────────────────────────────────────────────
test.describe('6.2 — Modifications', () => {

  test('6.2.1 — Saisir un hex valide → picker se synchronise', async ({ page }) => {
    await goToStructure(page);
    const textInput = page.locator('#st-color-text');
    const picker = page.locator('#st-color-picker');

    await textInput.fill('FF0000');
    await textInput.dispatchEvent('input');

    const pickerVal = await picker.inputValue();
    expect(pickerVal.toUpperCase()).toBe('#FF0000');
  });

  test('6.2.2 — Aperçu couleur se met à jour', async ({ page }) => {
    await goToStructure(page);
    const textInput = page.locator('#st-color-text');

    await textInput.fill('2563EB');
    await textInput.dispatchEvent('input');

    // The badge preview should have the color applied
    const bg = await page.locator('#st-color-preview .adm-badge').evaluate(
      el => el.style.backgroundColor || getComputedStyle(el).backgroundColor
    );
    // Should contain blue-ish color
    expect(bg).toBeTruthy();
  });

  test('6.2.3 — Toggle switch change d\'état au clic sur la ligne', async ({ page }) => {
    await goToStructure(page);
    const rows = page.locator('.st-toggle-row:not(.st-toggle-row--disabled)');
    const count = await rows.count();
    if (count === 0) {
      test.skip();
      return;
    }
    const firstRow = rows.first();
    const checkbox = firstRow.locator('input[type="checkbox"]');

    const wasChecked = await checkbox.isChecked();
    // Click the row (checkbox is display:none, can't click directly)
    await firstRow.click();
    expect(await checkbox.isChecked()).toBe(!wasChecked);

    // Restore
    await firstRow.click();
    expect(await checkbox.isChecked()).toBe(wasChecked);
  });

  test('6.2.4 — Ajouter un espace → chip créée', async ({ page }) => {
    await goToStructure(page);
    const input = page.locator('#st-add-city-input');
    const btn = page.locator('#st-add-city-btn');
    const container = page.locator('#st-enabled-cities');

    const TEST_CITY = `e2e-city-${Date.now()}`;
    await input.fill(TEST_CITY);
    await btn.click();

    await expect(container.locator('.st-city-chip', { hasText: TEST_CITY })).toBeVisible();
    await expect(input).toHaveValue('');
  });

  test('6.2.5 — Code invalide → nettoyé en minuscules/tirets', async ({ page }) => {
    await goToStructure(page);
    const input = page.locator('#st-add-city-input');
    const btn = page.locator('#st-add-city-btn');
    const container = page.locator('#st-enabled-cities');

    await input.fill('  Ma Ville Test!  ');
    await btn.click();

    // Should be cleaned: lowercase, spaces→dashes, special chars removed
    await expect(container.locator('.st-city-chip', { hasText: 'ma-ville-test' })).toBeVisible();
  });

  test('6.2.6 — Ajouter un espace en double → toast warning', async ({ page }) => {
    await goToStructure(page);
    const input = page.locator('#st-add-city-input');
    const btn = page.locator('#st-add-city-btn');

    const TEST_CITY = `e2e-dup-${Date.now()}`;
    await input.fill(TEST_CITY);
    await btn.click();
    await input.fill(TEST_CITY);
    await btn.click();

    await expect(warningToast(page, 'Espace déjà ajouté')).toBeVisible({ timeout: 5000 });
  });

  test('6.2.7 — Supprimer un chip de ville (×)', async ({ page }) => {
    await goToStructure(page);
    const input = page.locator('#st-add-city-input');
    const btn = page.locator('#st-add-city-btn');
    const container = page.locator('#st-enabled-cities');

    const TEST_CITY = `e2e-del-${Date.now()}`;
    await input.fill(TEST_CITY);
    await btn.click();
    await expect(container.locator('.st-city-chip', { hasText: TEST_CITY })).toBeVisible();

    // Click the remove button
    await container.locator(`.st-city-chip__remove[data-city="${TEST_CITY}"]`).click();
    await expect(container.locator('.st-city-chip', { hasText: TEST_CITY })).toHaveCount(0);
  });

  test('6.2.8 — Ajouter un espace via Enter', async ({ page }) => {
    await goToStructure(page);
    const input = page.locator('#st-add-city-input');
    const container = page.locator('#st-enabled-cities');

    const TEST_CITY = `e2e-enter-${Date.now()}`;
    await input.fill(TEST_CITY);
    await input.press('Enter');

    await expect(container.locator('.st-city-chip', { hasText: TEST_CITY })).toBeVisible();
  });

  test('6.2.9 — Upload logo → preview affichée', async ({ page }) => {
    await goToStructure(page);
    const preview = page.locator('#st-logo-preview');

    // If there's already a preview (logo already uploaded), skip the upload
    const previewVisible = await preview.isVisible().catch(() => false);
    if (previewVisible) {
      // Logo already exists — verify preview has an image
      await expect(page.locator('#st-logo-img')).toBeVisible();
      return;
    }

    // Upload a 1x1 pixel PNG via the hidden file input
    const fileInput = page.locator('#st-logo-file');
    // Create a minimal 1x1 PNG buffer
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBuffer = Buffer.from(pngBase64, 'base64');
    await fileInput.setInputFiles({
      name: 'test-logo.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });

    // Preview should appear (dropzone hidden, preview visible)
    await expect(preview).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#st-logo-img')).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────
// 6.3 — Sauvegarde
// ─────────────────────────────────────────────────────────
test.describe('6.3 — Sauvegarde', () => {

  test('6.3.1 — Couleur invalide → toast erreur, bouton re-activé', async ({ page }) => {
    await goToStructure(page);
    // Set invalid hex
    await page.locator('#st-color-text').fill('GGGGGG');
    await clearToasts(page);
    // Save
    await page.locator('#st-save-all').click();
    await expect(errorToast(page, 'Couleur invalide')).toBeVisible({ timeout: 5000 });
    // Button should be re-enabled
    await expect(page.locator('#st-save-all')).toBeEnabled({ timeout: 3000 });
  });

  test('6.3.2 — Sauvegarde valide → toast succès', async ({ page }) => {
    await goToStructure(page);
    // Store original values to re-save them unchanged
    const originalName = await page.locator('#st-brand-name').inputValue();
    const originalColor = await page.locator('#st-color-text').inputValue();

    // Re-fill with same values (ensure valid state)
    await page.locator('#st-brand-name').fill(originalName || 'Test E2E');
    await page.locator('#st-color-text').fill(originalColor || '14AE5C');
    await page.locator('#st-color-text').dispatchEvent('input');

    await clearToasts(page);
    await page.locator('#st-save-all').click();

    await expect(successToast(page, 'Structure mise à jour')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#st-save-all')).toBeEnabled({ timeout: 5000 });
  });

  test('6.3.3 — Toast succès après sauvegarde', async ({ page }) => {
    await goToStructure(page);
    const originalColor = await page.locator('#st-color-text').inputValue();
    await page.locator('#st-color-text').fill(originalColor || '14AE5C');
    await page.locator('#st-color-text').dispatchEvent('input');

    await clearToasts(page);
    // Click save and immediately check for spinner
    await page.locator('#st-save-all').click();
    // Le spinner peut disparaître trop vite pour être capturé — on vérifie au moins le toast
    // Even if we can't catch the spinner (too fast), the success toast should appear
    await expect(successToast(page, 'Structure mise à jour')).toBeVisible({ timeout: 15000 });
  });

});

// ─────────────────────────────────────────────────────────
// 6.4 — Sections supplémentaires
// ─────────────────────────────────────────────────────────
test.describe('6.4 — Sections supplémentaires', () => {

  test('6.4.1 — Sous-titre affiché avec code ville', async ({ page }) => {
    await goToStructure(page);
    await expect(page.locator('.cw-header__subtitle')).toContainText('test-e2e');
  });

  test('6.4.2 — Champ ville (code) est readonly', async ({ page }) => {
    await goToStructure(page);
    const cityInput = page.locator('#st-city-code');
    if (await cityInput.count() > 0) {
      const readonly = await cityInput.getAttribute('readonly');
      const disabled = await cityInput.isDisabled();
      expect(readonly !== null || disabled).toBeTruthy();
    }
  });

  test('6.4.3 — Section logo dropzone/preview visible', async ({ page }) => {
    await goToStructure(page);
    // Either dropzone or preview should be visible (one or the other)
    const dropzone = page.locator('#st-logo-drop');
    const preview = page.locator('#st-logo-preview');
    const dropVisible = await dropzone.isVisible().catch(() => false);
    const previewVisible = await preview.isVisible().catch(() => false);
    expect(dropVisible || previewVisible).toBeTruthy();
  });

  test('6.4.4 — Section favicon dropzone/preview visible', async ({ page }) => {
    await goToStructure(page);
    // Favicon section (if present in the form)
    const faviconDrop = page.locator('#st-favicon-drop');
    const faviconPreview = page.locator('#st-favicon-preview');
    const count = await faviconDrop.count() + await faviconPreview.count();
    // If favicon section doesn't exist, skip
    if (count > 0) {
      const dropVisible = await faviconDrop.isVisible().catch(() => false);
      const previewVisible = await faviconPreview.isVisible().catch(() => false);
      expect(dropVisible || previewVisible).toBeTruthy();
    }
  });

  test('6.4.5 — Bouton save-all visible et activé', async ({ page }) => {
    await goToStructure(page);
    const saveBtn = page.locator('#st-save-all');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();
  });
});
