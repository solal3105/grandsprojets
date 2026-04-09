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
 * Navigate to contributions and wait for the list to load.
 */
async function goToContributions(page) {
  await waitForBoot(page, '/admin/contributions/');
  await page.waitForFunction(() => {
    const body = document.querySelector('#contrib-list-body');
    if (!body) return false;
    return !body.querySelector('.adm-skeleton');
  }, { timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 2.8 — Contributions (rôle invited)
// ─────────────────────────────────────────────────────────
test.describe('2.8 — Contributions (rôle invited)', () => {

  test('2.8.1 — Bouton "Nouvelle contribution" visible', async ({ page }) => {
    await goToContributions(page);
    await expect(page.locator('a[href="/admin/contributions/nouveau/"]')).toBeVisible();
  });

  test('2.8.2 — Pas de bouton approuver/désapprouver dans la liste', async ({ page }) => {
    await goToContributions(page);
    const items = page.locator('.adm-list-item');
    if (await items.count() === 0) return;
    await expect(page.locator('[data-action="approve"]')).toHaveCount(0);
    await expect(page.locator('[data-action="unapprove"]')).toHaveCount(0);
  });

  test('2.8.3 — Checkbox "Mes contributions" visible', async ({ page }) => {
    await goToContributions(page);
    await expect(page.locator('#contrib-mine-only')).toBeAttached();
  });

  test('2.8.5 — Section publication wizard : notice "Soumise à validation"', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });
    // No publish toggle for invited
    await expect(page.locator('#cw-publish')).toHaveCount(0);
    // Notice visible
    const notice = page.locator('#cw-sect-publish .cw-notice--info');
    await notice.scrollIntoViewIfNeeded();
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Soumise à validation');
  });

  test('2.8.4 — Checkbox "Mes contributions" filtre la liste', async ({ page }) => {
    await goToContributions(page);
    const checkbox = page.locator('#contrib-mine-only');
    await expect(checkbox).toBeAttached();
    const allCount = await page.locator('#contrib-list-body .adm-list-item').count();
    // Check the "Mes contributions" checkbox
    await checkbox.check({ force: true });
    await page.waitForTimeout(500);
    const myCount = await page.locator('#contrib-list-body .adm-list-item').count();
    // Filtered count should be <= all count
    expect(myCount).toBeLessThanOrEqual(allCount);
    // Uncheck to restore
    await checkbox.uncheck({ force: true });
    await page.waitForTimeout(500);
    const restoredCount = await page.locator('#contrib-list-body .adm-list-item').count();
    expect(restoredCount).toBe(allCount);
  });

  test('2.8.6–2.8.7 — Création par invited → en attente → suppression', async ({ page }) => {
    const TEST_NAME = `E2E-Invited-${Date.now()}`;

    await goToContributions(page);
    await page.click('a[href="/admin/contributions/nouveau/"]');
    await expect(page).toHaveURL(/\/admin\/contributions\/nouveau\//);
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });

    await page.fill('#cw-name', TEST_NAME);

    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) {
      await pill.click();
    } else {
      await page.fill('#cw-cat-text', 'Test');
    }

    // Import GeoJSON via file mode
    const fileBtn = page.locator('.cw-loc-toggle__btn[data-mode="file"]');
    await fileBtn.scrollIntoViewIfNeeded();
    await fileBtn.click();
    await expect(page.locator('#cw-loc-file')).toBeVisible({ timeout: 5000 });

    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [4.835, 45.764] }, properties: {} }]
    });
    await page.locator('#cw-geojson-file').setInputFiles({
      name: 'test.geojson', mimeType: 'application/json', buffer: Buffer.from(geojson),
    });
    await expect(page.locator('#cw-geojson-result')).toBeVisible({ timeout: 5000 });

    const submitBtn = page.locator('#cw-submit');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();
    await expect(page.locator('.adm-toast--success')).toContainText('Contribution créée', { timeout: 15000 });
    await expect(page).toHaveURL(/\/admin\/contributions\//, { timeout: 10000 });

    // Reload to force a fresh list fetch
    await page.reload();
    await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => {
      const b = document.querySelector('#contrib-list-body');
      return b && !b.querySelector('.adm-skeleton');
    }, { timeout: 15000 });

    // Item should show "En attente" badge
    const item = page.locator('.adm-list-item', { hasText: TEST_NAME });
    await expect(item).toBeVisible({ timeout: 15000 });
    await expect(item.locator('.adm-badge--warning')).toContainText('En attente');

    // Invited can delete own contributions
    await item.locator('[data-action="delete"]').click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await page.click('#adm-dialog-confirm');
    await expect(page.locator('.adm-toast--success')).toContainText('Contribution supprimée', { timeout: 10000 });
    await expect(page.locator('.adm-list-item', { hasText: TEST_NAME })).toHaveCount(0, { timeout: 5000 });
  });

  test('2.8.8 — Section publication : notice "Soumise à validation" (pas de toggle)', async ({ page }) => {
    await goToContributions(page);
    await page.click('a[href="/admin/contributions/nouveau/"]');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });

    const publishSection = page.locator('#cw-sect-publish');
    await publishSection.scrollIntoViewIfNeeded();
    await expect(publishSection).toBeVisible();
    // Invited sees notice, NOT the toggle
    await expect(publishSection.locator('.cw-notice--info')).toBeVisible();
    await expect(publishSection.locator('.cw-notice--info')).toContainText('Soumise à validation');
    await expect(page.locator('#cw-publish')).toHaveCount(0);
  });

  test('2.8.9 — Assistant de rédaction disponible pour invited', async ({ page }) => {
    await goToContributions(page);
    await page.click('a[href="/admin/contributions/nouveau/"]');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });

    // Copilot trigger should be visible for invited users too
    await expect(page.locator('.cp-trigger')).toBeVisible({ timeout: 5000 });
  });

});
