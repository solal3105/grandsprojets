import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';

/**
 * Tests du toggle "Contribuer" (contribute)
 * 
 * Comportement attendu:
 * - Caché pour les utilisateurs non connectés
 * - Visible pour les utilisateurs connectés (invited, admin)
 * - Click → Ouvre la modale de contribution
 * - Accessibilité ARIA
 */

test.describe('Toggle Contribute - Contribuer', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Le toggle contribute est caché pour les utilisateurs non connectés', async ({ page }) => {
    const toggle = page.locator('#contribute-toggle');
    
    // Le toggle ne devrait pas être visible
    await expect(toggle).toBeHidden();
  });

  test('Le toggle contribute est visible après connexion (invited)', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    
    // Le toggle devrait être visible
    await expect(toggle).toBeVisible({ timeout: 10000 });
    
    // Accessibilité ARIA
    await expect(toggle).toHaveAttribute('aria-label', /contribu/i);
    
    // Icône
    const icon = toggle.locator('i.fa-plus');
    await expect(icon).toBeVisible();
  });

  test('Le toggle contribute est visible après connexion (admin)', async ({ page }) => {
    // Se connecter en tant qu'admin
    await login(page, TEST_USERS.admin);
    
    const toggle = page.locator('#contribute-toggle');
    
    // Le toggle devrait être visible
    await expect(toggle).toBeVisible({ timeout: 10000 });
  });

  test('Click sur le toggle ouvre la modale de contribution', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    
    // Click sur le toggle
    await toggle.click();
    
    // Attendre que la modale se charge (lazy loading peut prendre du temps)
    // La modale contribution utilise un système custom, pas ToggleManager
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#contrib-overlay');
      return overlay && overlay.style.display !== 'none';
    }, { timeout: 15000 });
    
    // Vérifier que la modale est visible
    const modal = page.locator('#contrib-overlay');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('La modale contient le landing de sélection de ville', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await toggle.click();
    
    // Attendre chargement lazy
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#contrib-overlay');
      return overlay && overlay.style.display !== 'none';
    }, { timeout: 15000 });
    
    // Vérifier la présence du landing
    const landing = page.locator('#contrib-landing');
    await expect(landing).toBeVisible({ timeout: 10000 });
    
    // Vérifier la présence du sélecteur de ville
    const citySelect = page.locator('#landing-city-select');
    await expect(citySelect).toBeVisible();
  });

  test('Accessibilité clavier: Enter ouvre la modale', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Enter
    await page.keyboard.press('Enter');
    
    // Attendre chargement lazy
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#contrib-overlay');
      return overlay && overlay.style.display !== 'none';
    }, { timeout: 15000 });
    
    // Modale ouverte
    const modal = page.locator('#contrib-overlay');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('Accessibilité clavier: Space ouvre la modale', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Space
    await page.keyboard.press('Space');
    
    // Attendre chargement lazy
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#contrib-overlay');
      return overlay && overlay.style.display !== 'none';
    }, { timeout: 15000 });
    
    // Modale ouverte
    const modal = page.locator('#contrib-overlay');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('Le toggle reste visible après fermeture de la modale', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await toggle.click();
    
    // Attendre chargement lazy
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#contrib-overlay');
      return overlay && overlay.style.display !== 'none';
    }, { timeout: 15000 });
    
    // Fermer la modale
    const closeBtn = page.locator('#contrib-close, button:has-text("×")').first();
    await expect(closeBtn).toBeVisible({ timeout: 10000 });
    await closeBtn.click();
    
    // Attendre fermeture
    await page.waitForTimeout(500);
    
    // Le toggle devrait toujours être visible
    await expect(toggle).toBeVisible();
  });

  test('Toggle visible sur mobile et desktop (si connecté)', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible({ timeout: 5000 });
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible({ timeout: 5000 });
  });

  test('Le toggle disparaît après déconnexion', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    
    // Se déconnecter
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    
    // Retourner à l'accueil
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    
    // Le toggle devrait être caché
    await expect(toggle).toBeHidden();
  });

  test('Click multiple ne crée pas de modales multiples', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    
    // Cliquer plusieurs fois rapidement
    await toggle.click();
    await page.waitForTimeout(500);
    await toggle.click();
    await page.waitForTimeout(500);
    await toggle.click();
    
    // Attendre chargement
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#contrib-overlay');
      return overlay && overlay.style.display !== 'none';
    }, { timeout: 15000 });
    
    // Il ne devrait y avoir qu'une seule modale visible
    const modals = page.locator('#contrib-overlay:visible');
    const count = await modals.count();
    
    expect(count).toBeLessThanOrEqual(1);
  });

  test('Le toggle a un état pressed quand la modale est ouverte', async ({ page }) => {
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    
    // État initial
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    
    // Ouvrir la modale
    await toggle.click();
    
    // Attendre chargement lazy
    await page.waitForFunction(() => {
      const overlay = document.querySelector('#contrib-overlay');
      return overlay && overlay.style.display !== 'none';
    }, { timeout: 15000 });
    
    // État pressed
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
