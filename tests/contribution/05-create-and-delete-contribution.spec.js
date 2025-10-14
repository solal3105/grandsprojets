import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import { 
  openContributionModal, 
  selectCity,
  clickEditContributions,
  openCreateModal,
  clickNext,
  searchContribution,
  deleteContribution
} from '../helpers/contribution.js';

/**
 * SÉCURITÉ : Ce test ne supprime QUE les contributions qu'il a créées
 * Chaque contribution de test a un nom unique avec timestamp
 * Un système de tracking garantit qu'on ne supprime jamais d'autres contributions
 */

test.describe('Contribution - Création et Suppression (Safe)', () => {
  
  // Tracking des contributions créées pour nettoyage sécurisé
  const createdContributions = new Set();
  
  /**
   * Helper : Créer une contribution de test avec toutes les étapes
   * @returns {Promise<string>} Le nom de la contribution créée
   */
  async function createSafeTestContribution(page, userRole = 'invited') {
    const timestamp = Date.now();
    const testName = `TEST-E2E-${userRole}-${timestamp}`;
    
    console.log(`[Test] Création de la contribution: "${testName}"`);
    
    // Ouvrir la modale de création
    await openCreateModal(page);
    
    // Attendre que le formulaire soit visible
    await page.waitForSelector('#contrib-form', { state: 'visible', timeout: 10000 });
    
    // Étape 1 : Informations de base
    await page.waitForSelector('#contrib-step-1-tab[aria-selected="true"]', { timeout: 5000 });
    await page.fill('#contrib-project-name', testName);
    
    // Attendre que les catégories soient chargées
    await page.waitForFunction(() => {
      const select = document.querySelector('#contrib-category');
      const options = select ? select.querySelectorAll('option:not([value=""])') : [];
      return options.length > 0;
    }, { timeout: 5000 });
    
    // Sélectionner la première catégorie disponible
    const firstCategory = await page.locator('#contrib-category option:not([value=""])').first().getAttribute('value');
    await page.selectOption('#contrib-category', firstCategory);
    
    console.log(`[Test] Catégorie sélectionnée: ${firstCategory}`);
    
    // Passer à l'étape 2
    await clickNext(page);
    await page.waitForSelector('#contrib-step-2-tab[aria-selected="true"]', { timeout: 5000 });
    
    // Étape 2 : Upload GeoJSON
    const geojsonContent = JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [4.835659, 45.764043] // Centre de Lyon
        },
        properties: {
          name: testName,
          description: "Contribution de test - À supprimer"
        }
      }]
    });
    
    const buffer = Buffer.from(geojsonContent);
    const fileInput = page.locator('#contrib-geojson');
    await fileInput.setInputFiles({
      name: 'test-e2e.geojson',
      mimeType: 'application/json',
      buffer: buffer
    });
    
    console.log('[Test] GeoJSON uploadé');
    
    // Attendre que le fichier soit traité
    await page.waitForTimeout(1000);
    
    // Passer à l'étape 3
    await clickNext(page);
    await page.waitForSelector('#contrib-step-3-tab[aria-selected="true"]', { timeout: 5000 });
    
    // Étape 3 : Meta et Description (REQUIS)
    await page.fill('#contrib-meta', `Test E2E automatisé - ${timestamp}`);
    await page.fill('#contrib-description', `Contribution de test créée automatiquement par les tests E2E. À supprimer après validation.`);
    
    console.log('[Test] Meta et description remplis');
    
    // Passer à l'étape 4
    await clickNext(page);
    await page.waitForSelector('#contrib-step-4-tab[aria-selected="true"]', { timeout: 5000 });
    
    // Étape 4 : Liens (optionnel, on peut skip)
    // Cliquer directement sur Enregistrer
    
    console.log('[Test] Soumission du formulaire...');
    
    // Soumettre
    await page.click('#contrib-submit');
    
    // Attendre le toast de succès (utilise role="status" pour les succès)
    await page.waitForSelector('#toast-container [role="status"]', { 
      state: 'visible', 
      timeout: 20000 
    });
    
    console.log('[Test] Toast de succès détecté');
    
    // Attendre que la modale se ferme
    await page.waitForFunction(() => {
      const modal = document.querySelector('#create-modal-overlay');
      return modal && modal.getAttribute('aria-hidden') === 'true';
    }, { timeout: 10000 });
    
    // Attendre le rafraîchissement automatique de la liste
    // (la liste est rafraîchie automatiquement après la création)
    await page.waitForTimeout(2000);
    
    console.log(`[Test] Contribution créée avec succès: "${testName}"`);
    
    // Tracker la contribution créée
    createdContributions.add(testName);
    
    return testName;
  }
  
  /**
   * Helper : Supprimer une contribution de test de manière sécurisée
   * Ne supprime QUE si la contribution est dans notre tracking
   */
  async function deleteSafeTestContribution(page, testName) {
    // SÉCURITÉ : Vérifier que c'est bien une contribution qu'on a créée
    if (!createdContributions.has(testName)) {
      throw new Error(`SÉCURITÉ : Tentative de suppression d'une contribution non créée par ce test: ${testName}`);
    }
    
    // DOUBLE SÉCURITÉ : Vérifier que le nom commence par TEST-E2E
    if (!testName.startsWith('TEST-E2E-')) {
      throw new Error(`SÉCURITÉ : Le nom ne commence pas par TEST-E2E-: ${testName}`);
    }
    
    console.log(`[Test] Suppression sécurisée de: "${testName}"`);
    
    // Chercher la contribution dans la liste
    await searchContribution(page, testName);
    await page.waitForTimeout(1000);
    
    // Vérifier que la contribution existe
    const card = page.locator(`.contrib-card:has-text("${testName}")`).first();
    await card.waitFor({ state: 'visible', timeout: 5000 });
    
    // Trouver et cliquer sur le bouton supprimer
    const deleteBtn = card.locator('button[title*="Supprimer"], button[aria-label*="Supprimer"]').first();
    await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });
    await deleteBtn.click();
    
    console.log('[Test] Bouton supprimer cliqué, attente de la confirmation...');
    
    // Attendre la modale de confirmation
    await page.waitForTimeout(500);
    
    // Confirmer la suppression
    const confirmBtn = page.locator('button:has-text("Confirmer"), button:has-text("Supprimer")').first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    await confirmBtn.click();
    
    console.log('[Test] Confirmation de suppression cliquée');
    
    // Attendre le toast de succès (utilise role="status" pour les succès)
    await page.waitForSelector('#toast-container [role="status"]', { 
      state: 'visible', 
      timeout: 10000 
    });
    
    console.log('[Test] Suppression confirmée par toast');
    
    // Attendre que la contribution disparaisse de la liste
    await page.waitForTimeout(2000);
    
    // Retirer du tracking
    createdContributions.delete(testName);
    
    console.log(`[Test] Contribution supprimée avec succès: "${testName}"`);
  }
  
  // Nettoyage après chaque test (sécurité supplémentaire)
  test.afterEach(async ({ page }) => {
    console.log('[Test] Nettoyage des contributions restantes...');
    
    // Si des contributions sont encore trackées, les supprimer
    if (createdContributions.size > 0) {
      console.log(`[Test] ${createdContributions.size} contribution(s) à nettoyer`);
      
      try {
        // S'assurer qu'on est sur le panel liste
        const listVisible = await page.locator('#contrib-panel-list:not([hidden])').isVisible().catch(() => false);
        
        if (!listVisible) {
          // Essayer d'ouvrir la modale et aller à la liste
          try {
            await openContributionModal(page);
            await selectCity(page, 'lyon');
            await clickEditContributions(page);
          } catch (e) {
            console.warn('[Test] Impossible d\'ouvrir la liste pour nettoyage:', e.message);
            createdContributions.clear();
            return;
          }
        }
        
        // Tenter de supprimer chaque contribution trackée
        for (const testName of Array.from(createdContributions)) {
          try {
            await deleteSafeTestContribution(page, testName);
          } catch (e) {
            console.warn(`[Test] Impossible de supprimer ${testName}:`, e.message);
            // Retirer quand même du tracking pour éviter les boucles infinies
            createdContributions.delete(testName);
          }
        }
      } catch (e) {
        console.error('[Test] Erreur lors du nettoyage:', e);
      }
    }
    
    console.log('[Test] Nettoyage terminé');
  });
  
  test.beforeEach(async ({ page }) => {
    // Aller sur la page d'accueil
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
  });

  test('Invited peut créer et supprimer sa propre contribution sur Lyon', async ({ page }) => {
    // Se connecter en tant qu'invited
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale de contribution
    await openContributionModal(page);
    
    // Sélectionner Lyon
    await selectCity(page, 'lyon');
    
    // Aller sur la liste des contributions
    await clickEditContributions(page);
    await page.waitForSelector('#contrib-panel-list:not([hidden])', { state: 'visible', timeout: 5000 });
    
    // Créer une contribution de test
    const testName = await createSafeTestContribution(page, 'invited');
    
    // Vérifier que la contribution apparaît dans la liste
    await searchContribution(page, testName);
    await page.waitForTimeout(1000);
    
    const card = page.locator(`.contrib-card:has-text("${testName}")`).first();
    await expect(card).toBeVisible();
    
    console.log('[Test] Contribution visible dans la liste ✅');
    
    // Supprimer la contribution
    await deleteSafeTestContribution(page, testName);
    
    // Vérifier que la contribution a disparu
    await searchContribution(page, testName);
    await page.waitForTimeout(1000);
    
    const cardAfterDelete = page.locator(`.contrib-card:has-text("${testName}")`);
    const count = await cardAfterDelete.count();
    expect(count).toBe(0);
    
    console.log('[Test] Contribution supprimée et disparue de la liste ✅');
  });

  test('Admin peut créer et supprimer sa propre contribution sur Lyon', async ({ page }) => {
    // Se connecter en tant qu'admin
    await login(page, TEST_USERS.admin);
    
    // Ouvrir la modale de contribution
    await openContributionModal(page);
    
    // Sélectionner Lyon
    await selectCity(page, 'lyon');
    
    // Aller sur la liste des contributions
    await clickEditContributions(page);
    await page.waitForSelector('#contrib-panel-list:not([hidden])', { state: 'visible', timeout: 5000 });
    
    // Créer une contribution de test
    const testName = await createSafeTestContribution(page, 'admin');
    
    // Vérifier que la contribution apparaît dans la liste
    await searchContribution(page, testName);
    await page.waitForTimeout(1000);
    
    const card = page.locator(`.contrib-card:has-text("${testName}")`).first();
    await expect(card).toBeVisible();
    
    console.log('[Test] Contribution visible dans la liste ✅');
    
    // Supprimer la contribution
    await deleteSafeTestContribution(page, testName);
    
    // Vérifier que la contribution a disparu
    await searchContribution(page, testName);
    await page.waitForTimeout(1000);
    
    const cardAfterDelete = page.locator(`.contrib-card:has-text("${testName}")`);
    const count = await cardAfterDelete.count();
    expect(count).toBe(0);
    
    console.log('[Test] Contribution supprimée et disparue de la liste ✅');
  });

  test('Invited ne peut PAS supprimer les contributions des autres utilisateurs', async ({ page }) => {
    // Se connecter en tant qu'admin pour créer une contribution
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Admin crée une contribution
    const adminContribName = await createSafeTestContribution(page, 'admin');
    
    // Se déconnecter
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    
    // Se reconnecter en tant qu'invited
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale et aller à la liste
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Chercher la contribution de l'admin
    await searchContribution(page, adminContribName);
    await page.waitForTimeout(1000);
    
    // Vérifier que la contribution existe
    const card = page.locator(`.contrib-card:has-text("${adminContribName}")`).first();
    const cardExists = await card.count();
    
    if (cardExists > 0) {
      // La contribution est visible, mais le bouton supprimer doit être absent ou disabled
      const deleteBtn = card.locator('button[title*="Supprimer"], button[aria-label*="Supprimer"]');
      const deleteBtnExists = await deleteBtn.count();
      
      if (deleteBtnExists > 0) {
        // Si le bouton existe, il doit être disabled
        await expect(deleteBtn.first()).toBeDisabled();
        console.log('[Test] Bouton supprimer disabled pour invited ✅');
      } else {
        console.log('[Test] Bouton supprimer absent pour invited ✅');
      }
    } else {
      console.log('[Test] Contribution admin non visible pour invited (filtré) ✅');
    }
    
    // Nettoyer : se reconnecter en admin pour supprimer la contribution
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Admin supprime sa contribution
    await deleteSafeTestContribution(page, adminContribName);
    
    console.log('[Test] Nettoyage de la contribution admin terminé ✅');
  });

  test('Admin voit les contributions non-approuvées des autres, pas Invited', async ({ page }) => {
    // Se connecter en tant qu'admin
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Admin crée une contribution (non-approuvée par défaut)
    const adminContribName = await createSafeTestContribution(page, 'admin-unapproved');
    console.log('[Test] Contribution admin créée:', adminContribName);
    
    // Vérifier que l'admin voit sa propre contribution non-approuvée
    await searchContribution(page, adminContribName);
    await page.waitForTimeout(1000);
    
    let card = page.locator(`.contrib-card:has-text("${adminContribName}")`).first();
    await expect(card).toBeVisible();
    
    // Vérifier le badge "En attente"
    const pendingBadge = card.locator('.contrib-card__badge--pending');
    await expect(pendingBadge).toBeVisible();
    console.log('[Test] Admin voit sa contribution non-approuvée ✅');
    
    // Se déconnecter et se connecter en tant qu'invited
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale et aller à la liste
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Attendre que la liste se charge complètement
    await page.waitForTimeout(2000);
    
    // Vérifier que invited ne voit PAS la contribution non-approuvée de l'admin
    await searchContribution(page, adminContribName);
    await page.waitForTimeout(1000);
    
    const cardCount = await page.locator(`.contrib-card:has-text("${adminContribName}")`).count();
    expect(cardCount).toBe(0);
    console.log('[Test] Invited ne voit PAS la contribution non-approuvée de l\'admin ✅');
    
    // Se reconnecter en tant qu'admin
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    
    // Ouvrir la modale et aller à la liste
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Attendre que la liste se charge complètement
    await page.waitForTimeout(2000);
    
    // Vider le champ de recherche au cas où il contiendrait quelque chose
    await page.fill('#contrib-search', '');
    await page.waitForTimeout(500);
    
    // Vérifier combien de contributions sont visibles avant la recherche
    const totalCards = await page.locator('.contrib-card').count();
    console.log(`[Test] Admin reconnecté: ${totalCards} contribution(s) visible(s) dans la liste`);
    
    // Vérifier que l'admin voit toujours la contribution
    await searchContribution(page, adminContribName);
    await page.waitForTimeout(1000);
    
    card = page.locator(`.contrib-card:has-text("${adminContribName}")`).first();
    
    // Si la contribution n'est pas visible, logger pour debug
    const isVisible = await card.isVisible().catch(() => false);
    if (!isVisible) {
      console.log(`[Test] ⚠️ Contribution "${adminContribName}" non trouvée après recherche`);
      console.log('[Test] Contributions visibles après recherche:', await page.locator('.contrib-card').count());
    }
    
    await expect(card).toBeVisible();
    console.log('[Test] Admin voit toujours sa contribution non-approuvée ✅');
    
    // Approuver la contribution
    const approveBtn = card.locator('button.contrib-card__action--approve').first();
    await approveBtn.waitFor({ state: 'visible', timeout: 5000 });
    await approveBtn.click();
    
    // Attendre que le bouton change d'état
    await page.waitForTimeout(1000);
    
    // Vérifier le badge "Approuvé"
    const approvedBadge = card.locator('.contrib-card__badge--approved');
    await expect(approvedBadge).toBeVisible();
    console.log('[Test] Contribution approuvée par l\'admin ✅');
    
    // Se reconnecter en tant qu'invited
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale et aller à la liste
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Attendre que la liste se charge complètement
    await page.waitForTimeout(2000);
    
    // Vérifier que invited voit maintenant la contribution approuvée
    await searchContribution(page, adminContribName);
    await page.waitForTimeout(1000);
    
    card = page.locator(`.contrib-card:has-text("${adminContribName}")`).first();
    await expect(card).toBeVisible();
    console.log('[Test] Invited voit maintenant la contribution approuvée ✅');
    
    // Nettoyage : se reconnecter en admin pour supprimer
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Attendre que la liste se charge complètement
    await page.waitForTimeout(2000);
    
    // Supprimer la contribution
    await deleteSafeTestContribution(page, adminContribName);
    console.log('[Test] Test des permissions terminé ✅');
  });
});
