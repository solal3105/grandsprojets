// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 12.5 — Diagnostic terrain : accès contributeur (invited)
// ─────────────────────────────────────────────────────────
test.describe('12.5 — Diagnostic terrain (invited)', () => {

  test('12.5.1 — Entrée sidebar masquée pour un contributeur', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="diagnostic"]')).toBeHidden();
  });

  test('12.5.2 — Accès direct par URL refusé', async ({ page }) => {
    await waitForBoot(page, '/admin/diagnostic/');
    await expect(page.locator('.adm-empty__title')).toContainText('Accès réservé');
    await expect(page.locator('.dg-dock')).toHaveCount(0);
  });
});
