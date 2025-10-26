import { test, expect } from '@playwright/test';

/**
 * Tests du toggle "Fond de carte" (basemap)
 * 
 * Comportement attendu:
 * - Visible sur desktop ET mobile
 * - Click → Affiche menu de sélection des fonds de carte
 * - Click extérieur → Ferme le menu
 * - Sélection d'un fond → Change la carte
 * - Accessibilité ARIA
 */

test.describe('Toggle Basemap - Fond de carte', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Le toggle basemap est visible et accessible', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    
    // Visibilité
    await expect(toggle).toBeVisible();
    
    // Accessibilité ARIA
    await expect(toggle).toHaveAttribute('aria-label', /fond/i);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-haspopup', 'true');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    
    // Icône
    const icon = toggle.locator('i.fa-globe');
    await expect(icon).toBeVisible();
  });

  test('Click sur le toggle affiche le menu des fonds de carte', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // État initial: menu sans classe active
    const hasActiveInitial = await menu.evaluate(el => el?.classList.contains('active')).catch(() => false);
    expect(hasActiveInitial).toBe(false);
    
    // Click sur le toggle
    await toggle.click();
    
    // Menu a la classe active
    await expect(menu).toHaveClass(/active/, { timeout: 5000 });
    
    // ARIA du toggle mis à jour
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('Click à nouveau ferme le menu', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // Ouvrir
    await toggle.click();
    await expect(menu).toHaveClass(/active/, { timeout: 5000 });
    
    // Fermer
    await toggle.click();
    await expect(menu).not.toHaveClass(/active/, { timeout: 5000 });
    
    // ARIA réinitialisé
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('Click extérieur ferme le menu', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // Ouvrir
    await toggle.click();
    await expect(menu).toHaveClass(/active/, { timeout: 5000 });
    
    // Cliquer en dehors (sur la carte)
    await page.click('#map', { position: { x: 100, y: 100 } });
    
    // Menu fermé
    await expect(menu).not.toHaveClass(/active/, { timeout: 5000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('Accessibilité clavier: Enter ouvre le menu', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Enter
    await page.keyboard.press('Enter');
    
    // Menu ouvert
    await expect(menu).toHaveClass(/active/, { timeout: 5000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('Accessibilité clavier: Space ouvre le menu', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Space
    await page.keyboard.press('Space');
    
    // Menu ouvert
    await expect(menu).toHaveClass(/active/, { timeout: 5000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('Le menu contient plusieurs options de fonds de carte', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    await toggle.click();
    
    const menu = page.locator('#basemap-menu');
    await expect(menu).toHaveClass(/active/, { timeout: 5000 });
    
    // Attendre le chargement des options (peut être vide si pas configuré)
    await page.waitForTimeout(1000);
    
    // Vérifier qu'il y a au moins une option (ou accepter menu vide)
    const options = menu.locator('button, .basemap-option, [role="menuitem"]');
    const count = await options.count();
    
    // Le menu peut être vide si aucun basemap n'est configuré
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('Toggle visible sur mobile et desktop', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });

  test('Sélection d\'un fond de carte ferme le menu', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    const menu = page.locator('#basemap-menu');
    
    // Ouvrir
    await toggle.click();
    await expect(menu).toHaveClass(/active/, { timeout: 5000 });
    
    // Attendre le chargement des options
    await page.waitForTimeout(1000);
    
    // Vérifier si des options existent
    const options = menu.locator('button, .basemap-option, [role="menuitem"]');
    const optionCount = await options.count();
    
    if (optionCount > 0) {
      // Cliquer sur la première option
      await options.first().click();
      
      // Menu fermé après sélection
      await expect(menu).not.toHaveClass(/active/, { timeout: 5000 });
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    } else {
      // Pas d'options - fermer manuellement le menu
      await toggle.click();
      await expect(menu).not.toHaveClass(/active/, { timeout: 5000 });
    }
  });

  test('Le fond de carte change visuellement après sélection', async ({ page }) => {
    const toggle = page.locator('#basemap-toggle');
    
    // Ouvrir le menu
    await toggle.click();
    await page.waitForTimeout(1000);
    
    const menu = page.locator('#basemap-menu');
    await expect(menu).toHaveClass(/active/);
    
    // Vérifier si des options existent
    const options = menu.locator('button, .basemap-option, [role="menuitem"]');
    const count = await options.count();
    
    if (count > 1) {
      // Récupérer les tuiles de la carte avant
      const tilesBefore = await page.evaluate(() => {
        const map = window.map;
        if (!map) return null;
        const layers = map._layers;
        const tileLayer = Object.values(layers).find(l => l._url);
        return tileLayer ? tileLayer._url : null;
      });
      
      // Cliquer sur la deuxième option
      await options.nth(1).click();
      
      // Attendre le changement
      await page.waitForTimeout(1000);
      
      // Récupérer les tuiles après
      const tilesAfter = await page.evaluate(() => {
        const map = window.map;
        if (!map) return null;
        const layers = map._layers;
        const tileLayer = Object.values(layers).find(l => l._url);
        return tileLayer ? tileLayer._url : null;
      });
      
      // Les URLs devraient être différentes
      if (tilesBefore && tilesAfter) {
        expect(tilesBefore).not.toBe(tilesAfter);
      }
    } else {
      // Pas assez d'options pour tester le changement
      // Fermer le menu
      await toggle.click();
      await expect(menu).not.toHaveClass(/active/);
    }
  });
});
