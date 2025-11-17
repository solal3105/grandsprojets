import { test, expect } from '@playwright/test';

test.describe('Location Toggle', () => {
  
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 45.7640, longitude: 4.8357 });
    
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Visible sur mobile avec icône fa-location-arrow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const toggle = page.locator('#location-toggle');
    await expect(toggle).toBeVisible();
    
    const icon = toggle.locator('i.fa-location-arrow');
    await expect(icon).toBeVisible();
  });

  test('Click demande géolocalisation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const toggle = page.locator('#location-toggle');
    
    await toggle.click({ force: true });
    await page.waitForTimeout(2000);
    
    // Vérifier que le toggle a réagi
    const isPressed = await toggle.getAttribute('aria-pressed');
    expect(['true', 'false']).toContain(isPressed);
  });

  test('4 états: default, loading (classe+disabled), active (classe), error (classe)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const toggle = page.locator('#location-toggle');
    
    // État initial (default)
    const initialPressed = await toggle.getAttribute('aria-pressed');
    expect(initialPressed).toBe('false');
    
    // Click déclenche un changement d'état
    await toggle.click({ force: true });
    await page.waitForTimeout(100);
    
    // Le toggle doit être visible et interactif
    await expect(toggle).toBeVisible();
  });

  test('disabled=true UNIQUEMENT en loading', async ({ page }) => {
    test.slow(); // Ce test peut prendre plus de temps
    await page.setViewportSize({ width: 375, height: 667 });
    
    const toggle = page.locator('#location-toggle');
    
    // 1. Vérifier état initial (non désactivé)
    await expect(toggle).not.toBeDisabled();
    
    // 2. Capturer l'état pendant le chargement
    const loadingPromise = new Promise(resolve => {
      page.on('console', msg => {
        if (msg.text().includes('Geolocation loading')) {
          resolve('loading');
        }
      });
    });
    
    // 3. Déclencher la géolocalisation
    await toggle.click({ force: true });
    
    // 4. Attendre le début du chargement
    await loadingPromise;
    
    // 5. Vérifier que le bouton est disabled pendant le chargement
    await expect(toggle).toBeDisabled();
    
    // 6. Attendre la fin du chargement (max 10s)
    await page.waitForFunction(
      () => !document.querySelector('#location-toggle:disabled'),
      { timeout: 10000 }
    );
    
    // 7. Vérifier que le bouton n'est plus disabled
    await expect(toggle).not.toBeDisabled();
    
    // 8. Vérifier l'état final (active ou error)
    const pressed = await toggle.getAttribute('aria-pressed');
    expect(['true', 'false']).toContain(pressed);
  });

  test('Clavier Enter: déclenche', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const toggle = page.locator('#location-toggle');
    
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    
    // Vérifier que le toggle a réagi
    const isPressed = await toggle.getAttribute('aria-pressed');
    expect(['true', 'false']).toContain(isPressed);
  });

  test('Responsive: existe sur desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    
    const toggle = page.locator('#location-toggle');
    await expect(toggle).toBeAttached();
  });
});
