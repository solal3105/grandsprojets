import { test, expect } from '@playwright/test';
import { waitForModalOpen, waitForModalClosed, expectToggleState, expectToggleExpanded } from '../helpers/toggles.js';

/**
 * Tests du toggle "À propos" (info)
 * 
 * Comportement attendu:
 * - Visible sur desktop ET mobile
 * - Click → Ouvre modale "À propos" (display flex + aria-hidden false)
 * - Click extérieur → Ferme la modale
 * - ESC → Ferme la modale
 * - Accessibilité ARIA complète
 */

test.describe('Toggle Info - À propos', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Le toggle info est visible et accessible', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Visibilité
    await expect(toggle).toBeVisible();
    
    // Accessibilité ARIA
    await expect(toggle).toHaveAttribute('aria-label', /à propos/i);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-haspopup', 'true');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    
    // Icône
    const icon = toggle.locator('i.fa-info-circle');
    await expect(icon).toBeVisible();
  });

  test('Click sur le toggle ouvre la modale À propos', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Click sur le toggle
    await toggle.click();
    
    // Modale ouverte (display flex + aria-hidden false)
    await waitForModalOpen(page, '#about-overlay');
    
    // ARIA du toggle mis à jour
    await expectToggleState(page, '#info-toggle', true);
    await expectToggleExpanded(page, '#info-toggle', true);
    
    // Contenu de la modale présent
    const modalContent = page.locator('#about-overlay .gp-modal');
    await expect(modalContent).toBeVisible({ timeout: 2000 });
  });

  test('Click sur le bouton fermer ferme la modale', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Ouvrir la modale
    await toggle.click();
    await waitForModalOpen(page, '#about-overlay');
    
    // Cliquer sur le bouton fermer
    const closeBtn = page.locator('#about-overlay button.gp-modal-close, #about-overlay button:has-text("×")').first();
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    
    // Modale fermée
    await waitForModalClosed(page, '#about-overlay');
    
    // ARIA du toggle réinitialisé
    await expectToggleState(page, '#info-toggle', false);
    await expectToggleExpanded(page, '#info-toggle', false);
  });

  test('Click extérieur ferme la modale', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Ouvrir la modale
    await toggle.click();
    await waitForModalOpen(page, '#about-overlay');
    
    // Cliquer en dehors de la modale (sur l'overlay)
    await page.click('#about-overlay', { position: { x: 10, y: 10 } });
    
    // Modale fermée
    await waitForModalClosed(page, '#about-overlay');
    await expectToggleState(page, '#info-toggle', false);
  });

  test('Touche ESC ferme la modale', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Ouvrir la modale
    await toggle.click();
    await waitForModalOpen(page, '#about-overlay');
    
    // Appuyer sur ESC
    await page.keyboard.press('Escape');
    
    // Modale fermée
    await waitForModalClosed(page, '#about-overlay');
    await expectToggleState(page, '#info-toggle', false);
  });

  test('Accessibilité clavier: Enter ouvre la modale', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Enter
    await page.keyboard.press('Enter');
    
    // Modale ouverte
    await waitForModalOpen(page, '#about-overlay');
    await expectToggleState(page, '#info-toggle', true);
  });

  test('Accessibilité clavier: Space ouvre la modale', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Space
    await page.keyboard.press('Space');
    
    // Modale ouverte
    await waitForModalOpen(page, '#about-overlay');
    await expectToggleState(page, '#info-toggle', true);
  });

  test('La modale contient les informations attendues', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    await toggle.click();
    
    await waitForModalOpen(page, '#about-overlay');
    
    // Vérifier la présence de contenu clé
    const modalBody = page.locator('#about-overlay .gp-modal-body, #about-overlay .gp-modal');
    await expect(modalBody).toContainText(/grands projets/i);
  });

  test('Toggle visible sur mobile et desktop', async ({ page }) => {
    const toggle = page.locator('#info-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });
});
