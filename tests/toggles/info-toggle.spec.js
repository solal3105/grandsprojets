import { test, expect } from '@playwright/test';

test.describe('Info Toggle', () => {
  
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

  test('Visible avec icône fa-info-circle, aria-haspopup="true"', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    await expect(toggle).toBeVisible();
    
    const icon = toggle.locator('i.fa-info-circle');
    await expect(icon).toBeVisible();
    
    await expect(toggle).toHaveAttribute('aria-haspopup', 'true');
  });

  test('Click ouvre: #about-overlay display visible + aria-hidden="false"', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    const overlay = page.locator('#about-overlay');
    
    await toggle.click();
    await page.waitForTimeout(500);
    
    const isVisible = await page.evaluate(() => {
      const el = document.querySelector('#about-overlay');
      return window.getComputedStyle(el).display !== 'none';
    });
    
    expect(isVisible).toBe(true);
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  });

  test('Bouton .gp-modal-close ferme', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    const overlay = page.locator('#about-overlay');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(500);
    
    // Fermer avec bouton
    const closeBtn = page.locator('#about-overlay .gp-modal-close').first();
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    await page.waitForTimeout(500);
    
    // Vérifier fermeture
    await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  test('Click extérieur ferme', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    const overlay = page.locator('#about-overlay');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(500);
    
    // Cliquer sur l'overlay (en dehors de la modale)
    await page.click('#about-overlay', { position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
    
    // Vérifier fermeture
    const isHidden = await page.evaluate(() => {
      const el = document.querySelector('#about-overlay');
      const ariaHidden = el.getAttribute('aria-hidden');
      return ariaHidden === 'true' || window.getComputedStyle(el).display === 'none';
    });
    
    expect(isHidden).toBe(true);
  });

  test('ESC ferme', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    const overlay = page.locator('#about-overlay');
    
    // Ouvrir
    await toggle.click();
    await page.waitForTimeout(500);
    
    // Appuyer sur ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Vérifier fermeture
    await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  test('Clavier Enter: ouvre', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    const overlay = page.locator('#about-overlay');
    
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  });

  test('Clavier Space: ouvre', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    const overlay = page.locator('#about-overlay');
    
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  });
});
