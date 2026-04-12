// @ts-check
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

/** Clean leftover E2E data from previous runs */
async function cleanupTravauxData() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  await sb.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  await sb.from('city_travaux').delete().eq('ville', 'test-e2e').like('name', 'E2E-%');
  await sb.from('city_modules').delete().eq('ville', 'test-e2e').eq('module_key', 'travaux');
}

test.beforeAll(async () => { await cleanupTravauxData(); });

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

/**
 * Navigate to travaux and wait for section to render.
 */
async function goToTravaux(page) {
  await waitForBoot(page, '/admin/travaux/');
}

/**
 * Navigate to travaux config page and wait for form to load.
 */
async function goToConfig(page) {
  await waitForBoot(page, '/admin/travaux/config/');
  // #twc-enabled is display:none (custom toggle) — wait for visible wrapper instead
  await page.waitForSelector('.twc-toggle-row', { timeout: 10000 });
}

const successToast = (page, text) =>
  page.locator('.adm-toast--success').filter({ hasText: text });

const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

// ─────────────────────────────────────────────────────────
// 5.1 — Scénarios de module
// ─────────────────────────────────────────────────────────
test.describe('5.1 — Scénarios de module', () => {

  test('5.1.1 — Config absente (scénario A "unconfigured")', async ({ page }) => {
    await goToTravaux(page);
    await expect(page.locator('.adm-page-title')).toContainText('Travaux');
    // Empty state for unconfigured module
    await expect(page.locator('.adm-module-empty__title')).toContainText('non configuré', { timeout: 10000 });
    // "Configurer" button present
    const configBtn = page.locator('.adm-btn--primary', { hasText: 'Configurer' });
    await expect(configBtn).toBeVisible();
  });

  test('5.1.2 — Module désactivé (scénario B) → empty state "désactivé"', async ({ page }) => {
    // Enable then disable to get scenario B
    await goToConfig(page);
    const enabledToggle = page.locator('#twc-enabled');
    // First enable
    if (!(await enabledToggle.isChecked())) {
      await enabledToggle.check({ force: true });
    }
    await page.locator('button[type="submit"]').scrollIntoViewIfNeeded();
    await page.locator('button[type="submit"]').click();
    await expect(successToast(page, 'Configuration sauvegardée')).toBeVisible({ timeout: 10000 });
    await clearToasts(page);

    // Now disable
    await goToConfig(page);
    await page.locator('#twc-enabled').uncheck({ force: true });
    await page.locator('button[type="submit"]').scrollIntoViewIfNeeded();
    await page.locator('button[type="submit"]').click();
    await expect(successToast(page, 'Configuration sauvegardée')).toBeVisible({ timeout: 10000 });
    await clearToasts(page);

    // Navigate to travaux list → should show disabled empty state
    await goToTravaux(page);
    await expect(page.locator('.adm-module-empty__title')).toContainText('désactivé', { timeout: 10000 });
    await expect(page.locator('.adm-btn--primary', { hasText: 'Activer le module' })).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────
// 5.6 — Configuration du module
// ─────────────────────────────────────────────────────────
test.describe('5.6 — Configuration du module', () => {

  test('5.6.1 — Page configuration accessible', async ({ page }) => {
    await goToConfig(page);
    await expect(page.locator('.cw-header__title')).toContainText('Configuration du module');
    await expect(page.locator('.cw-header__subtitle')).toContainText('test-e2e');
  });

  test('5.6.2 — Toggle activation visible', async ({ page }) => {
    await goToConfig(page);
    // The actual checkbox is display:none — assert the visible label/track
    await expect(page.locator('.twc-toggle-row .adm-switch__track')).toBeVisible();
    // And the hidden input should exist
    await expect(page.locator('#twc-enabled')).toBeAttached();
  });

  test('5.6.3 — Source picker : Base interne vs Flux externe', async ({ page }) => {
    await goToConfig(page);
    await expect(page.locator('.tw-source-option[data-val="city_travaux"]')).toBeVisible();
    await expect(page.locator('.tw-source-option[data-val="url"]')).toBeVisible();
  });

  test('5.6.4 — Sélection Flux externe → champ URL visible', async ({ page }) => {
    await goToConfig(page);
    await page.click('.tw-source-option[data-val="url"]');
    await expect(page.locator('#twc-url-group')).toBeVisible({ timeout: 3000 });
    // Switch back
    await page.click('.tw-source-option[data-val="city_travaux"]');
    await expect(page.locator('#twc-url-group')).toBeHidden();
  });

  test('5.6.6 — Couches associées : toggle items', async ({ page }) => {
    await goToConfig(page);
    const layers = page.locator('#twc-layers .adm-toggle-item');
    // If layers exist, at least one should be visible
    if (await layers.count() > 0) {
      await expect(layers.first()).toBeVisible();
    }
  });

  test('5.6.8 — Bouton retour', async ({ page }) => {
    await goToConfig(page);
    const backBtn = page.locator('.cw-footer__cancel');
    await expect(backBtn).toBeVisible();
  });

  test('5.6.9 — États personnalisables affichés', async ({ page }) => {
    await goToConfig(page);
    // Check for état option items (en_cours, prevu, termine, etc.)
    const etatOptions = page.locator('.tw-etat-option');
    if (await etatOptions.count() > 0) {
      await expect(etatOptions.first()).toBeVisible();
    }
  });

  test('5.6.10 — Save config → toast succès', async ({ page }) => {
    await goToConfig(page);
    // Ensure module is enabled (checkbox checked)
    const toggle = page.locator('#twc-enabled');
    const isChecked = await toggle.isChecked();
    if (!isChecked) {
      await toggle.check({ force: true });
    }
    await page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));
    const saveBtn = page.locator('button[type="submit"]');
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    await expect(page.locator('.adm-toast--success').filter({ hasText: 'Configuration sauvegardée' })).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────
// 5.2 — Onglets de statut (liste travaux)
// ─────────────────────────────────────────────────────────
test.describe('5.2 — Onglets de statut', () => {

  test('5.2.1 — Onglets "Tous", "En attente", "Approuvés" visibles', async ({ page }) => {
    await goToTravaux(page);
    // Wait for list to render (tabs only appear when module is enabled with list view)
    const tabs = page.locator('#travaux-tabs .adm-tab');
    const tabCount = await tabs.count();
    if (tabCount === 0) {
      test.skip(); // module may be in config-only mode
      return;
    }
    expect(tabCount).toBe(3);
    await expect(tabs.nth(0)).toContainText('Tous');
    await expect(tabs.nth(1)).toContainText('En attente');
    await expect(tabs.nth(2)).toContainText('Approuvés');
  });

  test('5.2.2 — Clic sur onglet "En attente" active le filtre', async ({ page }) => {
    await goToTravaux(page);
    const tabs = page.locator('#travaux-tabs .adm-tab');
    if (await tabs.count() === 0) { test.skip(); return; }

    // Click "En attente" tab
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    // "Tous" should no longer be active
    await expect(tabs.nth(0)).not.toHaveClass(/active/);
  });

  test('5.2.3 — Clic retour sur "Tous" restaure la liste complète', async ({ page }) => {
    await goToTravaux(page);
    const tabs = page.locator('#travaux-tabs .adm-tab');
    if (await tabs.count() === 0) { test.skip(); return; }

    // Switch to "Approuvés" then back to "Tous"
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveClass(/active/);
    await tabs.nth(0).click();
    await expect(tabs.nth(0)).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────────────────
// 5.x — Cycle complet : config → créer → lister → modifier → supprimer
// ─────────────────────────────────────────────────────────
test.describe('5.x — CRUD complet travaux', () => {

  test('Config → Créer → Liste → Approuver → Modifier → Supprimer', async ({ page }) => {
    const TEST_NAME = `E2E-Chantier-${Date.now()}`;
    const UPDATED_NAME = `${TEST_NAME}-Mod`;

    // ── 5.6.7 Configurer et activer le module ──
    await goToConfig(page);
    // Enable the module
    const enabledToggle = page.locator('#twc-enabled');
    const isChecked = await enabledToggle.isChecked();
    if (!isChecked) {
      await enabledToggle.check({ force: true });
    }
    // Ensure "Base interne" source selected
    await page.click('.tw-source-option[data-val="city_travaux"]');
    // Save config
    const saveConfigBtn = page.locator('button[type="submit"]');
    await saveConfigBtn.scrollIntoViewIfNeeded();
    await saveConfigBtn.click();
    await expect(successToast(page, 'Configuration sauvegardée')).toBeVisible({ timeout: 10000 });
    await clearToasts(page);

    // ── 5.4.1 Naviguer vers création ──
    await waitForBoot(page, '/admin/travaux/');
    // Now in normal mode — should show "Nouveau chantier" button
    const newBtn = page.locator('.adm-btn--primary', { hasText: 'Nouveau chantier' });
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    // Also "Configuration" button
    await expect(page.locator('.adm-btn--secondary', { hasText: 'Configuration' })).toBeVisible();
    await newBtn.click();
    await expect(page).toHaveURL(/\/admin\/travaux\/nouveau\//);
    await page.waitForSelector('#tw-name', { state: 'visible', timeout: 10000 });

    // ── 5.4.2–5.4.3 Formulaire de création ──
    await expect(page.locator('.cw-header__title')).toContainText('Nouveau chantier');
    await expect(page.locator('#tw-name')).toBeVisible();
    await expect(page.locator('#tw-nature')).toBeVisible();
    await expect(page.locator('#tw-localisation')).toBeVisible();
    await expect(page.locator('#tw-description')).toBeVisible();

    // ── 5.4.4–5.4.5 État picker ──
    const etatOptions = page.locator('.tw-etat-option');
    await expect(etatOptions).toHaveCount(4);
    // Default value should be "en_cours" (selected)
    await expect(page.locator('.tw-etat-option[data-val="en_cours"]')).toHaveClass(/selected/);
    await expect(page.locator('#tw-etat')).toHaveValue('en_cours');
    // Click "Prévu"
    await page.click('.tw-etat-option[data-val="prevu"]');
    await expect(page.locator('.tw-etat-option[data-val="prevu"]')).toHaveClass(/selected/);

    // ── 5.4.6 Dates ──
    await expect(page.locator('#tw-date-debut')).toBeVisible();
    await expect(page.locator('#tw-date-fin')).toBeVisible();

    // ── 5.4.9 Validation sans nom → erreur ──
    const submitBtn = page.locator('#tw-submit');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();
    await expect(page.locator('.adm-toast--error').filter({ hasText: 'nom du chantier est obligatoire' })).toBeVisible({ timeout: 5000 });
    await clearToasts(page);

    // ── Fill and submit ──
    await page.fill('#tw-name', TEST_NAME);
    await page.fill('#tw-nature', 'Voirie');
    await page.fill('#tw-localisation', 'Avenue E2E');

    // Import GeoJSON for location
    const fileToggle = page.locator('.cw-loc-toggle__btn[data-mode="file"]');
    await fileToggle.scrollIntoViewIfNeeded();
    await fileToggle.click();
    await expect(page.locator('#tw-geojson-drop')).toBeVisible({ timeout: 5000 });

    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [4.835, 45.764] }, properties: {} }]
    });
    await page.locator('#tw-geojson-file').setInputFiles({
      name: 'test.geojson', mimeType: 'application/json', buffer: Buffer.from(geojson),
    });
    await expect(page.locator('#tw-geojson-result')).toBeVisible({ timeout: 5000 });

    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();
    // Admin auto-approves
    await expect(successToast(page, 'Chantier créé')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/admin\/travaux\//, { timeout: 10000 });
    await clearToasts(page);

    // ── 5.2.1 Liste des chantiers ──
    await page.reload();
    await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
    // Wait for list to load
    await page.waitForFunction(() => {
      const body = document.querySelector('#travaux-list-body');
      return body && !body.querySelector('.adm-skeleton');
    }, { timeout: 15000 });

    const item = page.locator('.adm-list-item', { hasText: TEST_NAME });
    await expect(item).toBeVisible({ timeout: 15000 });
    await expect(item.locator('.adm-list-item__name')).toContainText(TEST_NAME);

    // ── 5.2.2 Badge état ──
    await expect(item.locator('.adm-badge--info')).toContainText('Prévu');

    // ── 5.2.4 Filtres tabs ──
    await expect(page.locator('#travaux-tabs .adm-tab[data-status=""]')).toHaveClass(/active/);

    // ── 5.2.5 Recherche ──
    await page.fill('#travaux-search', TEST_NAME);
    await page.waitForTimeout(500);
    await expect(page.locator('.adm-list-item', { hasText: TEST_NAME })).toBeVisible();

    // ── 5.2.6 Tri ──
    await page.fill('#travaux-search', '');
    await page.waitForTimeout(500);
    await expect(page.locator('#travaux-sort')).toBeVisible();

    // ── 5.3.2 Modifier ──
    await clearToasts(page);
    const editBtn = item.locator('[data-action="edit"]');
    await editBtn.click();
    await expect(page).toHaveURL(/\/admin\/travaux\/[a-f0-9-]+\//);
    await page.waitForSelector('#tw-name', { state: 'visible', timeout: 10000 });
    await expect(page.locator('.cw-header__title')).toContainText('Modifier le chantier');
    await expect(page.locator('#tw-name')).toHaveValue(TEST_NAME);

    // 5.5.6 — Change name and save
    await page.locator('#tw-name').clear();
    await page.locator('#tw-name').fill(UPDATED_NAME);
    // Verify the field has the new value before submitting
    await expect(page.locator('#tw-name')).toHaveValue(UPDATED_NAME);
    // force: needed because form footer may overlap with other UI elements
    await page.locator('#tw-submit').click({ force: true });
    await expect(successToast(page, 'Chantier mis à jour')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/admin\/travaux\//, { timeout: 10000 });
    await clearToasts(page);

    // ── 5.3.3–5.3.4 Supprimer ──
    await page.reload();
    await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => {
      const body = document.querySelector('#travaux-list-body');
      return body && !body.querySelector('.adm-skeleton');
    }, { timeout: 15000 });

    const updatedItem = page.locator('.adm-list-item', { hasText: UPDATED_NAME });
    await expect(updatedItem).toBeVisible({ timeout: 15000 });

    // Cancel delete first
    await updatedItem.locator('[data-action="delete"]').click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#adm-dialog-body')).toContainText('Supprimer ce chantier');
    await page.click('#adm-dialog-cancel');
    await expect(updatedItem).toBeVisible();

    // Confirm delete
    await updatedItem.locator('[data-action="delete"]').click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await page.click('#adm-dialog-confirm');
    await expect(successToast(page, 'Chantier supprimé')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.adm-list-item', { hasText: UPDATED_NAME })).toHaveCount(0, { timeout: 5000 });

    // ── Cleanup: disable the module to restore unconfigured-like state ──
    await clearToasts(page);
    await goToConfig(page);
    const toggle = page.locator('#twc-enabled');
    await toggle.uncheck({ force: true });
    const cfgSave = page.locator('button[type="submit"]');
    await cfgSave.scrollIntoViewIfNeeded();
    await cfgSave.click();
    await expect(successToast(page, 'Configuration sauvegardée')).toBeVisible({ timeout: 10000 });
  });

});
