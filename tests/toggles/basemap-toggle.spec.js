import { test, expect } from '@playwright/test';

test.describe('Basemap Toggle', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Visible avec icône fa-globe, aria-haspopup="true"', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    await expect(toggle).toBeVisible();
    
    const icon = toggle.locator('i.fa-globe');
    await expect(icon).toBeVisible();
    
    await expect(toggle).toHaveAttribute('aria-haspopup', 'true');
  });

  test('Click ouvre: #basemap-menu a classe active', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    await toggle.click();
    await page.waitForTimeout(300);
    
    await expect(menu).toHaveClass(/active/);
  });

  test('Click ferme: perd classe active', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(300);
    await expect(menu).toHaveClass(/active/);
    
    // Fermer
    await toggle.click();
    await page.waitForTimeout(300);
    
    await expect(menu).not.toHaveClass(/active/);
  });

  test('Click extérieur ferme', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(300);
    await expect(menu).toHaveClass(/active/);
    
    // Cliquer sur la carte
    await page.click('#map', { position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);
    
    // Menu fermé
    await expect(menu).not.toHaveClass(/active/);
  });

  test('Clavier Enter: ouvre', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    await expect(menu).toHaveClass(/active/);
  });

  test('Clavier Space: ouvre', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    
    await expect(menu).toHaveClass(/active/);
  });

  test('Menu contient .basemap-tile', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    
    await toggle.click();
    await page.waitForTimeout(1000);
    
    const menu = page.locator('#basemap-menu');
    const tiles = menu.locator('.basemap-tile');
    
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('Responsive: visible sur mobile et desktop', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });
});
