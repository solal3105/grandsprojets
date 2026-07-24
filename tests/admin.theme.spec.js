// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigates to admin and waits for the boot sequence to complete.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 13.1 - Thème sombre (toggle sidebar)
// ─────────────────────────────────────────────────────────
test.describe('13.1 - Thème sombre (toggle sidebar)', () => {

  test('13.1.1 - Bouton toggle visible dans la sidebar', async ({ page }) => {
    await waitForBoot(page);
    const btn = page.locator('#adm-theme-toggle');
    await expect(btn).toBeVisible();
    await expect(btn.locator('i')).toHaveClass(/fa-moon|fa-sun/);
  });

  test('13.1.2 - Clic bascule en dark : data-theme, icône et libellé', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await waitForBoot(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.click('#adm-theme-toggle');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#adm-theme-toggle i')).toHaveClass(/fa-sun/);
    await expect(page.locator('#adm-theme-toggle')).toHaveAttribute('title', 'Mode clair');
  });

  test('13.1.3 - Second clic revient en light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await waitForBoot(page);
    await page.click('#adm-theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.click('#adm-theme-toggle');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#adm-theme-toggle i')).toHaveClass(/fa-moon/);
    await expect(page.locator('#adm-theme-toggle')).toHaveAttribute('title', 'Mode sombre');
  });

  test('13.1.4 - Préférence persistée dans localStorage et réappliquée au reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await waitForBoot(page);
    await page.click('#adm-theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBe('dark');

    await page.reload();
    // theme-init.js applique le thème avant le boot - pas de flash light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
    await expect(page.locator('#adm-theme-toggle i')).toHaveClass(/fa-sun/);
  });

  test('13.1.5 - Sans préférence sauvegardée, suit prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitForBoot(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBeNull();
  });

  test('13.1.6 - La préférence explicite prime sur prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await waitForBoot(page);
    await page.click('#adm-theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // L'OS repasse en light : la préférence explicite dark doit rester
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

});
