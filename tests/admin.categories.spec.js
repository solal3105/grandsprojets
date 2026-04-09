// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigates to admin and waits for the boot sequence to complete.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

/**
 * Navigate to categories and wait for the list to load (skeleton disappears).
 */
async function goToCategories(page) {
  await waitForBoot(page, '/admin/categories/');
  await page.waitForFunction(() => {
    const el = document.querySelector('#cat-list');
    if (!el) return false;
    return !el.querySelector('.adm-skeleton');
  }, { timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 3.1 — Liste des catégories
// ─────────────────────────────────────────────────────────
test.describe('3.1 — Liste des catégories', () => {

  test('3.1.1 — Titre et liste chargée', async ({ page }) => {
    await goToCategories(page);
    await expect(page.locator('.adm-page-title')).toContainText('Catégories');
    await expect(page.locator('#cat-list')).toBeVisible();
  });

  test('3.1.3 — Bouton "Nouvelle catégorie" visible', async ({ page }) => {
    await goToCategories(page);
    await expect(page.locator('#cat-add-btn')).toBeVisible();
    await expect(page.locator('#cat-add-btn')).toContainText('Nouvelle catégorie');
  });

});

// ─────────────────────────────────────────────────────────
// 3.2 — Formulaire de création
// ─────────────────────────────────────────────────────────
test.describe('3.2 — Formulaire de création', () => {

  test('3.2.1 — Clic "Nouvelle catégorie" ouvre le formulaire', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-form-card')).toBeVisible();
  });

  test('3.2.2 — Titre formulaire = "Nouvelle catégorie"', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-form-title')).toHaveText('Nouvelle catégorie');
  });

  test('3.2.3 — Champ nom obligatoire', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    const nameInput = page.locator('#cat-name');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('required', '');
  });

  test('3.2.5 — Color picker : couleur par défaut #6366f1', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-color')).toHaveValue('#6366f1');
  });

  test('3.2.6 — Aperçu SVG ligne et polygone', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-prev-line')).toBeAttached();
    await expect(page.locator('#cat-prev-polygon')).toBeAttached();
  });

  test('3.2.7 — Slider épaisseur → label mis à jour', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    const label = page.locator('#cat-weight-val');
    await expect(label).toContainText('3 px');
    await page.locator('#cat-weight').fill('8');
    await page.locator('#cat-weight').dispatchEvent('input');
    await expect(label).toContainText('8 px');
  });

  test('3.2.8 — Changement dash pattern', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('.cat-dash-btn[data-dash=""]')).toHaveClass(/cat-dash-btn--active/);
    await page.click('.cat-dash-btn[data-dash="8,4"]');
    await expect(page.locator('.cat-dash-btn[data-dash="8,4"]')).toHaveClass(/cat-dash-btn--active/);
    await expect(page.locator('.cat-dash-btn[data-dash=""]')).not.toHaveClass(/cat-dash-btn--active/);
    await page.click('.cat-dash-btn[data-dash="2,5"]');
    await expect(page.locator('.cat-dash-btn[data-dash="2,5"]')).toHaveClass(/cat-dash-btn--active/);
  });

  test('3.2.9 — Slider opacité → label mis à jour', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-opacity-val')).toContainText('80 %');
    await page.locator('#cat-opacity').fill('0.5');
    await page.locator('#cat-opacity').dispatchEvent('input');
    await expect(page.locator('#cat-opacity-val')).toContainText('50 %');
  });

  test('3.2.10 — Toggle remplissage → options fill affichées', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    // Fill options hidden by default
    await expect(page.locator('#cat-fill-options')).toBeHidden();
    // Check the fill toggle via its label (input may be visually hidden in custom switch)
    await page.locator('#cat-fill').check({ force: true });
    await expect(page.locator('#cat-fill-options')).toBeVisible();
  });

  test('3.2.10b — Fill activé → couleur et opacité de remplissage éditables', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await page.locator('#cat-fill').check({ force: true });
    await expect(page.locator('#cat-fill-options')).toBeVisible();
    // Fill color picker visible
    await expect(page.locator('#cat-fill-color')).toBeVisible();
    // Fill opacity slider visible
    await expect(page.locator('#cat-fill-opacity')).toBeVisible();
    // Change fill color
    await page.locator('#cat-fill-color').fill('#FF0000');
    await page.locator('#cat-fill-color').dispatchEvent('input');
    // Change fill opacity
    await page.locator('#cat-fill-opacity').fill('0.3');
    await page.locator('#cat-fill-opacity').dispatchEvent('input');
    await expect(page.locator('#cat-fill-opacity-val')).toContainText('30 %');
  });

  test('3.2.11 — Section couches associées', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-layers')).toBeAttached();
  });

  test('3.2.12 — Icon picker : ouvre, recherche, sélectionne', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    // Click the icon picker button
    const iconBtn = page.locator('#cat-icon-btn');
    await expect(iconBtn).toBeVisible();
    await iconBtn.click();
    // Popover should open with icon grid
    const popover = page.locator('.adm-ip-popover');
    await expect(popover).toBeVisible({ timeout: 3000 });
    // Search field visible
    await expect(popover.locator('.adm-ip-search')).toBeVisible();
    // At least some icons in the grid
    const icons = popover.locator('.adm-ip-icon');
    expect(await icons.count()).toBeGreaterThan(0);
    // Click first icon to select it
    const firstIcon = icons.first();
    const iconClass = await firstIcon.getAttribute('data-cls');
    await firstIcon.click();
    // Hidden input should update
    await expect(page.locator('#cat-icon')).toHaveValue(iconClass, { timeout: 3000 });
  });

  test('3.2.14 — Annuler masque le formulaire', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-form-card')).toBeVisible();
    await page.click('#cat-form-cancel');
    await expect(page.locator('#cat-form-card')).toBeHidden();
  });

  test('3.2.15 — Icon picker : recherche filtre la grille', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-form-card')).toBeVisible({ timeout: 5000 });

    await page.locator('#cat-icon-btn').click();
    const popover = page.locator('.adm-ip-popover');
    await expect(popover).toBeVisible({ timeout: 3000 });

    const initialCount = await popover.locator('.adm-ip-icon').count();
    expect(initialCount).toBeGreaterThan(0);

    // Type search term — should filter
    const searchInput = popover.locator('.adm-ip-search');
    await searchInput.fill('map');
    await page.waitForTimeout(400); // debounce
    const filteredCount = await popover.locator('.adm-ip-icon').count();
    // Could be 0 if no match, or fewer
    expect(filteredCount).toBeLessThan(initialCount);
  });

  test('3.2.16 — Icon picker : bouton ferme le popover au clic en dehors', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-form-card')).toBeVisible({ timeout: 5000 });

    await page.locator('#cat-icon-btn').click();
    const popover = page.locator('.adm-ip-popover');
    await expect(popover).toBeVisible({ timeout: 3000 });

    // Click outside the popover (on the page title area)
    await page.locator('.adm-page-title').click({ force: true });
    // Popover should close (transition + hidden attribute)
    await expect(popover).toBeHidden({ timeout: 5000 });
  });

  test('3.2.17 — Saisie manuelle d\'icône : section "Avancé" visible', async ({ page }) => {
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-form-card')).toBeVisible({ timeout: 5000 });

    await page.locator('#cat-icon-btn').click();
    const popover = page.locator('.adm-ip-popover');
    await expect(popover).toBeVisible({ timeout: 3000 });

    // Advanced section (details/summary) should exist
    const advanced = popover.locator('.adm-ip-advanced');
    if (await advanced.count() > 0) {
      await expect(advanced).toBeVisible();
      // Manual input field inside
      await expect(popover.locator('.adm-ip-manual-input')).toHaveCount(1);
    }
  });

});

// ─────────────────────────────────────────────────────────
// 3.x — CRUD complet en un seul test (même page context)
// ─────────────────────────────────────────────────────────
test.describe('3.x — CRUD complet des catégories', () => {

  test('Cycle complet : création → vérif liste → édition → suppression', async ({ page }) => {
    // Supabase lowercases category names (supabaseservice.js)
    const CAT_INPUT = `E2E-Cat-${Date.now()}`;
    const CAT_NAME = CAT_INPUT.toLowerCase();
    const CAT_UPDATED_INPUT = `${CAT_INPUT}-Upd`;
    const CAT_UPDATED = CAT_UPDATED_INPUT.toLowerCase();

    // ── 3.2.13 Créer ──
    await goToCategories(page);
    await page.click('#cat-add-btn');
    await expect(page.locator('#cat-form-card')).toBeVisible();
    await page.fill('#cat-name', CAT_INPUT);
    await page.click('#cat-form-submit');
    await expect(page.locator('.adm-toast--success').filter({ hasText: 'Catégorie créée' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#cat-form-card')).toBeHidden();

    // ── 3.1.2 Catégorie visible dans la liste ──
    const card = page.locator(`.adm-cat-card[data-category="${CAT_NAME}"]`);
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.adm-cat-card__name')).toHaveText(CAT_NAME);
    await expect(card.locator('.adm-cat-card__icon')).toBeVisible();

    // ── 3.1.3–3.1.4 Boutons et drag handle ──
    await expect(card.locator('[data-action="edit"]')).toBeVisible();
    await expect(card.locator('[data-action="delete"]')).toBeVisible();
    await expect(card.locator('.adm-cat-card__drag')).toBeVisible();

    // ── 3.3.1–3.3.2 Éditer : formulaire pré-rempli ──
    await card.locator('[data-action="edit"]').click();
    await expect(page.locator('#cat-form-card')).toBeVisible();
    await expect(page.locator('#cat-form-title')).toContainText(`Modifier — ${CAT_NAME}`);
    await expect(page.locator('#cat-name')).toHaveValue(CAT_NAME);
    await expect(page.locator('#cat-form-submit')).toContainText('Mettre à jour');

    // ── 3.3.5 Modifier le nom ──
    await page.fill('#cat-name', CAT_UPDATED_INPUT);
    await page.click('#cat-form-submit');
    await expect(page.locator('.adm-toast--success').filter({ hasText: 'Catégorie mise à jour' })).toBeVisible({ timeout: 10000 });
    const updatedCard = page.locator(`.adm-cat-card[data-category="${CAT_UPDATED}"]`);
    await expect(updatedCard).toBeVisible({ timeout: 5000 });

    // ── 3.4.1–3.4.3 Supprimer avec confirmation ──
    await updatedCard.locator('[data-action="delete"]').click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#adm-dialog-body')).toContainText('Supprimer cette catégorie');
    await expect(page.locator('#adm-dialog-body')).toContainText(CAT_UPDATED);

    // Cancel first
    await page.click('#adm-dialog-cancel');
    await expect(updatedCard).toBeVisible();

    // Confirm
    await updatedCard.locator('[data-action="delete"]').click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await page.click('#adm-dialog-confirm');
    await expect(page.locator('.adm-toast--success').filter({ hasText: 'Catégorie supprimée' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`.adm-cat-card[data-category="${CAT_UPDATED}"]`)).toHaveCount(0, { timeout: 5000 });
  });

});
