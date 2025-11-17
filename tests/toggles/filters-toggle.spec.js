import { test, expect } from '@playwright/test';

test.describe('Filters Toggle', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Visible avec icône fa-map, compteur .filter-count existe', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    await expect(toggle).toBeVisible();
    
    const icon = toggle.locator('i.fa-map');
    await expect(icon).toBeVisible();
    
    const counter = toggle.locator('.filter-count');
    await expect(counter).toBeAttached();
  });

  test('Click ouvre: #filters-container display: block', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    const container = page.locator('#filters-container');
    
    await toggle.click();
    
    const isVisible = await page.evaluate(() => {
      const el = document.querySelector('#filters-container');
      return window.getComputedStyle(el).display !== 'none';
    });
    
    expect(isVisible).toBe(true);
    await expect(container).toBeVisible();
  });

  test('Click ferme: display: none', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(300);
    
    // Fermer
    await toggle.click();
    await page.waitForTimeout(300);
    
    const isHidden = await page.evaluate(() => {
      const el = document.querySelector('#filters-container');
      return window.getComputedStyle(el).display === 'none';
    });
    
    expect(isHidden).toBe(true);
  });

  test('Clavier Enter: ouvre le panneau', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    const container = page.locator('#filters-container');
    
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    await expect(container).toBeVisible();
  });

  test('Clavier Space: ouvre le panneau', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    const container = page.locator('#filters-container');
    
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    
    await expect(container).toBeVisible();
  });

  test('Responsive: visible sur mobile et desktop', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });

  test('#dynamic-filters existe', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    await toggle.click();
    await page.waitForTimeout(300);
    
    const dynamicFilters = page.locator('#dynamic-filters');
    await expect(dynamicFilters).toBeAttached();
  });

  test('Pas de fermeture par click extérieur', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    const container = page.locator('#filters-container');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(300);
    await expect(container).toBeVisible();
    
    // Cliquer sur la carte
    await page.click('#map', { position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);
    
    // Doit rester ouvert
    await expect(container).toBeVisible();
  });
});
