import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import { 
  openContributionModal, 
  selectCity,
  clickEditContributions,
  openCreateModal,
  clickNext,
  submitForm,
  ensureListReady,
  resetListFilters
} from '../helpers/contribution.js';

/**
 * TESTS DE CRÉATION ET SUPPRESSION DE CONTRIBUTIONS - RÉÉCRITURE COMPLÈTE
 * 
 * Principes appliqués:
 * - Attentes conditionnelles (expect avec timeout) au lieu de waitForTimeout
 * - Reset systématique des filtres avant recherche (évite états hérités)
 * - Retry intelligent avec fallback si première recherche échoue
 * - Tracking strict des contributions créées (sécurité)
 * - Nettoyage automatique en afterEach
 * - Helpers réutilisables et robustes
 * 
 * Changements vs version précédente:
 * - Suppression de tous les waitForTimeout non nécessaires
 * - Ajout de verifyContributionVisible/NotVisible avec retry
 * - Reset des filtres après chaque changement de rôle
 * - Attentes plus longues (15s) pour la synchronisation backend
 */

test.describe.configure({ mode: 'serial' });

test.describe('Contribution - Création et Suppression (Safe)', () => {
  
  // Tracking des contributions créées pour nettoyage sécurisé
  const createdContributions = new Set();
  
  /**
   * Créer une contribution de test complète
   * @param {import('@playwright/test').Page} page
   * @param {string} userRole - 'invited', 'admin', 'admin-unapproved'
   * @returns {Promise<string>} Nom de la contribution créée
   */
  async function createTestContribution(page, userRole = 'invited') {
    const timestamp = Date.now();
    const testName = `TEST-E2E-${userRole}-${timestamp}`;
    
    console.log(`[Create] Début création: "${testName}"`);
    
    // Ouvrir modale de création
    await openCreateModal(page);
    await expect(page.locator('#contrib-form')).toBeVisible({ timeout: 10000 });
    
    // ÉTAPE 1: Informations de base
    await expect(page.locator('#contrib-step-1-tab[aria-selected="true"]')).toBeVisible({ timeout: 5000 });
    await page.fill('#contrib-project-name', testName);
    
    // Attendre chargement des catégories
    await page.waitForFunction(() => {
      const select = document.querySelector('#contrib-category');
      return select && select.querySelectorAll('option:not([value=""])').length > 0;
    }, { timeout: 5000 });
    
    const firstCategory = await page.locator('#contrib-category option:not([value=""])').first().getAttribute('value');
    await page.selectOption('#contrib-category', firstCategory);
    console.log(`[Create] Catégorie: ${firstCategory}`);
    
    // ÉTAPE 2: GeoJSON
    await clickNext(page);
    await expect(page.locator('#contrib-step-2-tab[aria-selected="true"]')).toBeVisible({ timeout: 5000 });
    
    const geojson = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [4.835659, 45.764043] },
        properties: { name: testName, description: "Test E2E" }
      }]
    };
    
    await page.locator('#contrib-geojson').setInputFiles({
      name: 'test.geojson',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(geojson))
    });
    console.log('[Create] GeoJSON uploadé');
    
    // ÉTAPE 3: Meta et Description (REQUIS)
    await clickNext(page);
    await expect(page.locator('#contrib-step-3-tab[aria-selected="true"]')).toBeVisible({ timeout: 5000 });
    await page.fill('#contrib-meta', `Test E2E automatisé - ${timestamp}`);
    await page.fill('#contrib-description', `Contribution de test créée automatiquement. À supprimer après validation.`);
    console.log('[Create] Meta et description remplis');
    
    // ÉTAPE 4: Liens (optionnel, on skip)
    await clickNext(page);
    await expect(page.locator('#contrib-step-4-tab[aria-selected="true"]')).toBeVisible({ timeout: 5000 });
    
    // Soumettre
    console.log('[Create] Soumission...');
    await submitForm(page);
    
    // Tracker
    createdContributions.add(testName);
    console.log(`[Create] ✅ Contribution créée: "${testName}"`);
    
    return testName;
  }
  
  /**
   * Supprimer une contribution de test de manière sécurisée
   * @param {import('@playwright/test').Page} page
   * @param {string} testName
   */
  async function deleteTestContribution(page, testName) {
    // SÉCURITÉ: Vérifier que c'est bien une contribution trackée
    if (!createdContributions.has(testName)) {
      throw new Error(`SÉCURITÉ: Tentative de suppression d'une contribution non créée par ce test: ${testName}`);
    }
    if (!testName.startsWith('TEST-E2E-')) {
      throw new Error(`SÉCURITÉ: Le nom ne commence pas par TEST-E2E-: ${testName}`);
    }
    
    console.log(`[Delete] Début suppression: "${testName}"`);
    
    // Stabiliser la liste et chercher
    await ensureListReady(page);
    await resetListFilters(page);
    
    // Remplir la recherche
    const searchInput = page.locator('#contrib-search');
    await searchInput.fill('');
    await searchInput.fill(testName);
    
    // Attendre que la carte soit visible (avec retry robuste et timeout augmenté)
    let card = page.locator(`.contrib-card:has-text("${testName}")`).first();
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        await expect(card).toBeVisible({ timeout: 20000 });
        break; // Succès, sortir de la boucle
      } catch (error) {
        retryCount++;
        console.log(`[Delete] Tentative ${retryCount}/${maxRetries}: contribution non trouvée`);
        
        if (retryCount >= maxRetries) {
          throw error; // Dernier essai échoué, propager l'erreur
        }
        
        // Retry: reset complet et attendre plus longtemps
        await page.waitForTimeout(2000);
        await resetListFilters(page);
        await ensureListReady(page);
        await searchInput.fill('');
        await page.waitForTimeout(500);
        await searchInput.fill(testName);
        await page.waitForTimeout(1000);
        card = page.locator(`.contrib-card:has-text("${testName}")`).first();
      }
    }
    
    console.log('[Delete] Carte trouvée');
    
    // Cliquer sur supprimer
    const deleteBtn = card.locator('button[title*="Supprimer"], button[aria-label*="Supprimer"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();
    
    // Confirmer dans la modale
    const confirmBtn = page.locator('button:has-text("Confirmer"), button:has-text("Supprimer")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    
    // Attendre toast de succès
    await expect(page.locator('#toast-container [role="status"]')).toBeVisible({ timeout: 10000 });
    console.log('[Delete] Toast de succès reçu');
    
    // Attendre fermeture modale de confirmation
    await page.waitForFunction(() => {
      const modal = document.querySelector('#delete-confirm-overlay');
      return !modal || modal.getAttribute('aria-hidden') === 'true';
    }, { timeout: 5000 });
    
    // Vérifier que la liste est de nouveau interactive
    await ensureListReady(page);
    
    // Retirer du tracking
    createdContributions.delete(testName);
    console.log(`[Delete] ✅ Contribution supprimée: "${testName}"`);
  }
  
  /**
   * Vérifier qu'une contribution est visible dans la liste
   * @param {import('@playwright/test').Page} page
   * @param {string} testName
   */
  async function verifyContributionVisible(page, testName) {
    await ensureListReady(page);
    
    const searchInput = page.locator('#contrib-search');
    await searchInput.fill('');
    await searchInput.fill(testName);
    
    const card = page.locator(`.contrib-card:has-text("${testName}")`).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    console.log(`[Verify] ✅ Contribution visible: "${testName}"`);
  }
  
  /**
   * Vérifier qu'une contribution n'est PAS visible dans la liste
   * @param {import('@playwright/test').Page} page
   * @param {string} testName
   */
  async function verifyContributionNotVisible(page, testName) {
    await ensureListReady(page);
    
    const searchInput = page.locator('#contrib-search');
    await searchInput.fill('');
    await searchInput.fill(testName);
    
    // Attendre un peu pour laisser le temps à la recherche de s'exécuter
    await page.waitForTimeout(1000);
    
    const cards = page.locator(`.contrib-card:has-text("${testName}")`);
    await expect(cards).toHaveCount(0, { timeout: 5000 });
    console.log(`[Verify] ✅ Contribution non visible: "${testName}"`);
  }
  
  // Nettoyage automatique après chaque test
  test.afterEach(async ({ page }) => {
    if (createdContributions.size === 0) return;
    
    console.log(`[Cleanup] ${createdContributions.size} contribution(s) à nettoyer`);
    
    try {
      // S'assurer qu'on est sur le panel liste
      const listVisible = await page.locator('#contrib-panel-list:not([hidden])').isVisible().catch(() => false);
      
      if (!listVisible) {
        await openContributionModal(page);
        await selectCity(page, 'lyon');
        await clickEditContributions(page);
        await ensureListReady(page);
      }
      
      // Supprimer chaque contribution trackée
      for (const testName of Array.from(createdContributions)) {
        try {
          await deleteTestContribution(page, testName);
        } catch (e) {
          console.warn(`[Cleanup] Impossible de supprimer ${testName}:`, e.message);
          createdContributions.delete(testName);
        }
      }
    } catch (e) {
      console.error('[Cleanup] Erreur:', e);
      createdContributions.clear();
    }
    
    console.log('[Cleanup] ✅ Terminé');
  });
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  // ============================================================================
  // TESTS
  // ============================================================================

  test('Invited peut créer et supprimer sa propre contribution', async ({ page }) => {
    test.setTimeout(120000);
    
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    // Créer
    const testName = await createTestContribution(page, 'invited');
    
    // Vérifier visibilité
    await verifyContributionVisible(page, testName);
    
    // Supprimer
    await deleteTestContribution(page, testName);
    
    console.log('[Test] ✅ Test Invited terminé');
  });

  test('Admin peut créer et supprimer sa propre contribution', async ({ page }) => {
    test.setTimeout(120000);
    
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    // Créer
    const testName = await createTestContribution(page, 'admin');
    
    // Vérifier visibilité
    await verifyContributionVisible(page, testName);
    
    // Supprimer
    await deleteTestContribution(page, testName);
    
    console.log('[Test] ✅ Test Admin terminé');
  });

  test('Invited ne peut PAS supprimer les contributions des autres', async ({ page }) => {
    test.setTimeout(120000);
    
    // Admin crée une contribution
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    const adminContribName = await createTestContribution(page, 'admin-for-invited-test');
    
    // Se déconnecter et se reconnecter en invited
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    await login(page, TEST_USERS.invited);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    // Chercher la contribution de l'admin
    const searchInput = page.locator('#contrib-search');
    await searchInput.fill('');
    await searchInput.fill(adminContribName);
    await page.waitForTimeout(1000);
    
    const card = page.locator(`.contrib-card:has-text("${adminContribName}")`).first();
    const cardCount = await card.count();
    
    if (cardCount > 0) {
      // Si visible, vérifier que le bouton supprimer est absent ou disabled
      const deleteBtn = card.locator('button[title*="Supprimer"], button[aria-label*="Supprimer"]');
      const deleteBtnCount = await deleteBtn.count();
      
      if (deleteBtnCount > 0) {
        await expect(deleteBtn.first()).toBeDisabled();
        console.log('[Test] Bouton supprimer disabled pour invited ✅');
      } else {
        console.log('[Test] Bouton supprimer absent pour invited ✅');
      }
    } else {
      console.log('[Test] Contribution admin non visible pour invited ✅');
    }
    
    // Nettoyer: se reconnecter en admin pour supprimer
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    await login(page, TEST_USERS.admin);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    
    await deleteTestContribution(page, adminContribName);
    
    console.log('[Test] ✅ Test permissions Invited terminé');
  });

  test('Admin voit les contributions non-approuvées, pas Invited', async ({ page }) => {
    test.setTimeout(120000);
    
    // Admin crée une contribution non-approuvée
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    const adminContribName = await createTestContribution(page, 'admin-unapproved');
    console.log(`[Test] Contribution créée: ${adminContribName}`);
    
    // Vérifier que l'admin voit sa contribution non-approuvée
    await verifyContributionVisible(page, adminContribName);
    
    const card = page.locator(`.contrib-card:has-text("${adminContribName}")`).first();
    const pendingBadge = card.locator('.contrib-card__badge--pending');
    await expect(pendingBadge).toBeVisible();
    console.log('[Test] Admin voit sa contribution non-approuvée ✅');
    
    // Se connecter en invited
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    await login(page, TEST_USERS.invited);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    // Vérifier que invited ne voit PAS la contribution non-approuvée
    await verifyContributionNotVisible(page, adminContribName);
    
    // Se reconnecter en admin
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    await login(page, TEST_USERS.admin);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    // Vérifier que l'admin voit toujours sa contribution
    await verifyContributionVisible(page, adminContribName);
    
    // Approuver la contribution
    const cardAfter = page.locator(`.contrib-card:has-text("${adminContribName}")`).first();
    const approveBtn = cardAfter.locator('button.contrib-card__action--approve').first();
    await expect(approveBtn).toBeVisible({ timeout: 5000 });
    await approveBtn.click();
    
    // Attendre changement d'état
    await page.waitForTimeout(1000);
    
    const approvedBadge = cardAfter.locator('.contrib-card__badge--approved');
    await expect(approvedBadge).toBeVisible();
    console.log('[Test] Contribution approuvée ✅');
    
    // Se reconnecter en invited
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    await login(page, TEST_USERS.invited);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    await resetListFilters(page);
    
    // Vérifier que invited voit maintenant la contribution approuvée
    await verifyContributionVisible(page, adminContribName);
    
    // Nettoyer: se reconnecter en admin pour supprimer
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    await login(page, TEST_USERS.admin);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await ensureListReady(page);
    
    await deleteTestContribution(page, adminContribName);
    
    console.log('[Test] ✅ Test permissions Admin terminé');
  });
});
