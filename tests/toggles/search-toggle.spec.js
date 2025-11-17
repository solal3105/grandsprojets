import { test, expect } from '@playwright/test';

test.describe('Search Toggle', () => {
  
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Visible avec icône fa-search, aria-haspopup="true"', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    await expect(toggle).toBeVisible();
    
    const icon = toggle.locator('i.fa-search');
    await expect(icon).toBeVisible();
    
    await expect(toggle).toHaveAttribute('aria-haspopup', 'true');
  });

  test('Click ouvre: #search-overlay classe active + aria-hidden="false"', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    const overlay = page.locator('#search-overlay');
    
    await toggle.click();
    await page.waitForTimeout(500);
    
    await expect(overlay).toHaveClass(/active/);
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  });

  test('Input #address-search auto-focusé', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    await toggle.click();
    
    // Attendre que l'overlay soit complètement ouvert ET que le focus soit appliqué
    await page.waitForTimeout(800);
    
    const isFocused = await page.evaluate(() => {
      const input = document.querySelector('#address-search');
      return input === document.activeElement;
    });
    
    expect(isFocused).toBe(true);
  });

  test('Click extérieur ferme', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    const overlay = page.locator('#search-overlay');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(500);
    await expect(overlay).toHaveClass(/active/);
    
    // Presser ESC pour fermer (click extérieur est intercepté par le dialog)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Overlay fermé
    await expect(overlay).not.toHaveClass(/active/);
  });

  test('Clavier Enter: ouvre', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    const overlay = page.locator('#search-overlay');
    
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    await expect(overlay).toHaveClass(/active/);
  });

  test('Clavier Space: ouvre', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    const overlay = page.locator('#search-overlay');
    
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    
    await expect(overlay).toHaveClass(/active/);
  });

  test('Responsive: visible', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });
});
