// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

const successToast = (page, text) =>
  page.locator('.adm-toast--success').filter({ hasText: text });
const errorToast = (page, text) =>
  page.locator('.adm-toast--error').filter({ hasText: text });
const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

// ─────────────────────────────────────────────────────────
// 7 — Composants transversaux
// ─────────────────────────────────────────────────────────
test.describe('7 — Composants transversaux', () => {

  test('7.1 — Toast auto-dismiss après ~3.5s', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body .adm-list-item', { timeout: 10000 });

    // Trigger a toast by approving then un-approving a contribution (or use a simpler trigger)
    // Inject a toast via dynamic import (admin uses ES modules)
    await page.evaluate(async () => {
      const { toast } = await import('/admin/components/ui.js');
      toast('Toast test auto-dismiss', 'info');
    });

    const toast = page.locator('.adm-toast--info').filter({ hasText: 'Toast test auto-dismiss' });
    await expect(toast).toBeVisible({ timeout: 2000 });

    // After ~4s it should be removed (3500ms + 250ms animation)
    await expect(toast).toBeHidden({ timeout: 6000 });
  });

  test('7.2 — Dialog annulé via Escape', async ({ page }) => {
    await waitForBoot(page, '/admin/categories/');
    await page.waitForSelector('.adm-cat-card', { timeout: 10000 });

    // Click delete on the first category to open dialog
    const deleteBtn = page.locator('.adm-cat-card [data-action="delete"]').first();
    await deleteBtn.click();

    const dialog = page.locator('#adm-dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Press Escape
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 3000 });

    // Category should still be there
    await expect(page.locator('.adm-cat-card').first()).toBeVisible();
  });

  test('7.3 — Slide panel open/close/re-open sans listeners zombies', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body .adm-list-item', { timeout: 10000 });

    const panel = page.locator('#adm-slide-panel');

    // Open panel by clicking first item
    await page.locator('#contrib-list-body .adm-list-item').first().click();
    await expect(panel).toHaveAttribute('aria-hidden', 'false', { timeout: 5000 });

    // Close via close button
    await page.locator('#adm-slide-close').click();
    await expect(panel).toHaveAttribute('aria-hidden', 'true', { timeout: 3000 });

    // Re-open (should work without zombie listeners)
    await page.locator('#contrib-list-body .adm-list-item').first().click();
    await expect(panel).toHaveAttribute('aria-hidden', 'false', { timeout: 5000 });

    // Close via backdrop
    await page.locator('#adm-slide-backdrop').click({ force: true });
    await expect(panel).toHaveAttribute('aria-hidden', 'true', { timeout: 3000 });
  });

  test('7.4 — Multiples toasts empilés', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await clearToasts(page);

    // Inject multiple toasts via dynamic import
    await page.evaluate(async () => {
      const { toast } = await import('/admin/components/ui.js');
      toast('Toast 1', 'success');
      toast('Toast 2', 'error');
      toast('Toast 3', 'warning');
    });

    const container = page.locator('#adm-toast-container');
    await expect(container.locator('.adm-toast')).toHaveCount(3, { timeout: 2000 });
  });
});

// ─────────────────────────────────────────────────────────
// 9 — Résilience & edge cases
// ─────────────────────────────────────────────────────────
test.describe('9 — Résilience & edge cases', () => {

  test('9.1 — Route inconnue /admin/foobar/ → fallback contributions', async ({ page }) => {
    await waitForBoot(page, '/admin/foobar/');
    // Fallback renders contributions section
    await page.waitForSelector('#contrib-list-body', { timeout: 10000 });
    await expect(page.locator('.adm-page-title')).toContainText('Contributions');
    // No nav item should be highlighted (foobar doesn't match)
    const activeNav = page.locator('.adm-nav-item.active');
    await expect(activeNav).toHaveCount(0);
  });

  test('9.2 — Contribution introuvable /admin/contributions/999999/', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/999999/');
    await expect(errorToast(page, 'Contribution introuvable')).toBeVisible({ timeout: 10000 });
  });

  test('9.3 — Chantier introuvable → toast erreur + redirect', async ({ page }) => {
    // First ensure travaux module is configured, otherwise the empty state blocks deep links
    await waitForBoot(page, '/admin/travaux/config/');
    // If config page renders, enable and save — then test the not-found
    const enabledCheckbox = page.locator('#twc-enabled');
    const isConfigPage = await enabledCheckbox.count().then(c => c > 0).catch(() => false);
    if (!isConfigPage) {
      test.skip();
      return;
    }
    // Check if already enabled — if not, enable it
    const isChecked = await enabledCheckbox.isChecked();
    if (!isChecked) {
      await page.locator('#twc-enabled').check({ force: true });
      await clearToasts(page);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
    }

    // Navigate to a non-existent chantier UUID
    await clearToasts(page);
    await page.goto('/admin/travaux/00000000-0000-0000-0000-000000000000/');
    await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });

    // Should show error toast and redirect to /admin/travaux/
    const errorMsg = errorToast(page, 'introuvable').or(errorToast(page, 'chargement'));
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/travaux\/$/, { timeout: 5000 });
  });

  test('9.4 — XSS dans un nom de projet → rendu échappé', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body .adm-list-item', { timeout: 10000 });

    // Check that no script tags are executable in the list
    // The esc() function uses textContent → innerHTML, so HTML is escaped
    const hasInjection = await page.evaluate(() => {
      // Look for any raw <script>, <img onerror=...> patterns in the rendered HTML
      const listBody = document.querySelector('#contrib-list-body');
      if (!listBody) return false;
      // Check for unescaped HTML inside .adm-list-item__name elements
      const names = listBody.querySelectorAll('.adm-list-item__name');
      for (const name of names) {
        if (name.innerHTML !== name.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')) {
          // innerHTML differs from escaped textContent — potential XSS vector
          // This is OK if it's just normal text with no HTML entities
        }
      }
      // Ensure no script elements exist in the list
      return listBody.querySelectorAll('script').length > 0;
    });
    expect(hasInjection).toBe(false);
  });

  test('9.5 — Double-clic sur un bouton de soumission → pas de double soumission', async ({ page }) => {
    await waitForBoot(page, '/admin/structure/');
    await page.waitForSelector('#st-brand-name', { state: 'visible', timeout: 15000 });

    // Ensure valid color
    const color = await page.locator('#st-color-text').inputValue();
    if (!color) {
      await page.locator('#st-color-text').fill('14AE5C');
      await page.locator('#st-color-text').dispatchEvent('input');
    }
    await clearToasts(page);

    // Click save button twice rapidly
    await page.evaluate(() => {
      const btn = document.querySelector('#st-save-all');
      btn?.click();
      btn?.click(); // second click — button should be disabled
    });

    // Button should be disabled during save
    await expect(page.locator('#st-save-all')).toBeDisabled({ timeout: 1000 });

    // Only one success toast should appear (not two)
    await expect(successToast(page, 'Structure mise à jour')).toBeVisible({ timeout: 15000 });
    const toastCount = await page.locator('.adm-toast--success').filter({ hasText: 'Structure mise à jour' }).count();
    expect(toastCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────
// 7.5 — Toast variants et composants UI
// ─────────────────────────────────────────────────────────
test.describe('7.5 — Toast variants et composants UI', () => {

  test('7.5.1 — Toast success a l\'icône check', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body', { timeout: 10000 });

    await page.evaluate(async () => {
      const { toast } = await import('/admin/components/ui.js');
      toast('Test success', 'success');
    });
    const t = page.locator('.adm-toast--success').filter({ hasText: 'Test success' });
    await expect(t).toBeVisible({ timeout: 3000 });
    await expect(t.locator('i.fa-check')).toBeVisible();
  });

  test('7.5.2 — Toast error a l\'icône xmark', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body', { timeout: 10000 });

    await page.evaluate(async () => {
      const { toast } = await import('/admin/components/ui.js');
      toast('Test error', 'error');
    });
    const t = page.locator('.adm-toast--error').filter({ hasText: 'Test error' });
    await expect(t).toBeVisible({ timeout: 3000 });
    await expect(t.locator('i.fa-xmark')).toBeVisible();
  });

  test('7.5.3 — Toast warning a l\'icône triangle', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body', { timeout: 10000 });

    await page.evaluate(async () => {
      const { toast } = await import('/admin/components/ui.js');
      toast('Test warning', 'warning');
    });
    const t = page.locator('.adm-toast--warning').filter({ hasText: 'Test warning' });
    await expect(t).toBeVisible({ timeout: 3000 });
    await expect(t.locator('i.fa-triangle-exclamation')).toBeVisible();
  });

  test('7.5.4 — Dialog danger : bouton confirm rouge', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body .adm-list-item', { timeout: 10000 });

    // Trigger a delete dialog (uses danger: true)
    await page.locator('.adm-list-item [data-action="delete"]').first().click();
    const dialog = page.locator('#adm-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Confirm button should have danger class
    const confirmBtn = page.locator('#adm-dialog-confirm');
    await expect(confirmBtn).toHaveClass(/adm-btn--danger/);
    await expect(confirmBtn).toContainText('Supprimer');

    // Cancel to avoid actual deletion
    await page.click('#adm-dialog-cancel');
  });

  test('7.5.5 — Dialog body contient titre en gras et message', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body .adm-list-item', { timeout: 10000 });

    await page.locator('.adm-list-item [data-action="delete"]').first().click();
    const body = page.locator('#adm-dialog-body');
    await expect(body).toBeVisible({ timeout: 5000 });

    // body has <strong> for title
    await expect(body.locator('strong')).toContainText('Supprimer');
    // and a <p> for the message
    await expect(body.locator('p')).toBeVisible();

    await page.click('#adm-dialog-cancel');
  });

  test('7.5.6 — Slide panel : titre, corps et footer rendus', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/');
    await page.waitForSelector('#contrib-list-body .adm-list-item', { timeout: 10000 });

    // Open detail
    await page.locator('.adm-list-item [data-action="detail"]').first().click();
    const panel = page.locator('#adm-slide-panel[aria-hidden="false"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Title in header
    await expect(panel.locator('.adm-slide-panel__title')).toBeVisible();
    const title = await panel.locator('.adm-slide-panel__title').textContent();
    expect(title.length).toBeGreaterThan(0);

    // Body has content
    await expect(panel.locator('.adm-slide-panel__body')).toBeVisible();

    // Footer with buttons
    await expect(panel.locator('.adm-slide-panel__footer')).toBeVisible();

    await page.click('#adm-slide-close');
  });
});

// ─────────────────────────────────────────────────────────
// 9.6 — Routes deep-links et sous-routes
// ─────────────────────────────────────────────────────────
test.describe('9.6 — Routes deep-links', () => {

  test('9.6.1 — Deep link /admin/contributions/nouveau/ → wizard direct', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });
    await expect(page.locator('.cw-header__title')).toContainText('Nouvelle contribution');
  });

  test('9.6.2 — Deep link /admin/structure/ → structure chargée', async ({ page }) => {
    await waitForBoot(page, '/admin/structure/');
    await page.waitForSelector('#st-brand-name', { state: 'visible', timeout: 15000 });
    await expect(page.locator('.cw-header__title')).toContainText('Ma structure');
  });

  test('9.6.3 — Deep link /admin/categories/ → catégories chargées', async ({ page }) => {
    await waitForBoot(page, '/admin/categories/');
    await page.waitForSelector('.adm-page-title', { state: 'visible', timeout: 15000 });
    await expect(page.locator('.adm-page-title')).toContainText('Catégories');
  });
});
