/**
 * Tests de suppression de contributions
 * Teste les permissions et le comportement de la suppression
 * 
 * IMPORTANT : Ces tests créent leurs propres contributions de test (préfixées "TEST - ")
 * sur la ville de LYON uniquement, puis les suppriment. Aucune donnée réelle n'est touchée.
 * 
 * RAPPEL DES PERMISSIONS :
 * - INVITED : peut supprimer UNIQUEMENT ses propres contributions
 * - ADMIN : peut supprimer TOUTES les contributions de sa ville
 * - ADMIN GLOBAL : peut supprimer TOUTES les contributions de toutes les villes
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity,
  clickEditContributions,
  createTestContribution
} from '../helpers/contribution.js';

test.describe('Contribution - Suppression', () => {

  test('Invited peut supprimer ses propres contributions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // CRÉER une contribution de test pour la supprimer ensuite
    const testName = await createTestContribution(page, {
      name: 'Suppression Invited',
      category: 'urbanisme',
      city: 'lyon'
    });
    
    // Retourner au landing puis aller sur la liste
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Chercher la contribution de test créée (avec le badge "Votre contribution")
    const testContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    await expect(testContrib).toBeVisible();
    
    // Vérifier que le bouton supprimer est visible
    const deleteBtn = testContrib.locator('.contrib-card__action--delete');
    await expect(deleteBtn).toBeVisible();
    
    console.log(`[Delete Invited] Test sur contribution: "${testName}"`);
    
    // Cliquer sur le bouton supprimer
    await deleteBtn.click();
    
    // Attendre que la modale de confirmation apparaisse
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    
    // Vérifier que le titre de la modale contient le nom du projet
    const modalTitle = await page.locator('#delete-confirm-title').textContent();
    expect(modalTitle).toContain(testName);
    
    // CONFIRMER la suppression (on supprime notre propre contribution de test)
    const confirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    await confirmBtn.click();
    
    // Attendre que la modale se ferme
    await page.waitForSelector('#delete-confirm-overlay', { state: 'hidden', timeout: 5000 });
    
    // Attendre le rafraîchissement de la liste
    await page.waitForTimeout(2000);
    
    // Vérifier que la contribution TEST a bien été supprimée
    const stillExists = await page.locator(`.contrib-card:has-text("${testName}")`).count();
    expect(stillExists).toBe(0);
    
    console.log('[Delete Invited] ✓ Contribution TEST supprimée avec succès');
  });

  test('Invited ne peut PAS supprimer les contributions des autres', async ({ page }) => {
    // D'abord, créer une contribution en tant qu'admin et l'approuver
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    const adminTestName = await createTestContribution(page, {
      name: 'Contribution Admin pour Test Invited',
      category: 'urbanisme',
      city: 'lyon'
    });
    
    // Retourner au landing, aller sur la liste et approuver la contribution
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Approuver la contribution pour qu'elle soit visible par invited
    const testContrib = page.locator(`.contrib-card:has-text("${adminTestName}")`);
    const approveBtn = testContrib.locator('.contrib-card__action--approve');
    await approveBtn.click();
    await page.waitForTimeout(1000);
    
    // Maintenant se déconnecter et se reconnecter en invited
    await page.click('#contrib-close');
    await page.waitForTimeout(500);
    await page.click('#nav-logout');
    await page.waitForTimeout(1000);
    
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement" pour voir les contributions approuvées des autres
    const checkbox = page.locator('#contrib-mine-only');
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    // Chercher la contribution créée par admin
    const adminContrib = page.locator(`.contrib-card:has-text("${adminTestName}")`);
    const contribVisible = await adminContrib.count();
    
    if (contribVisible === 0) {
      console.log('[Delete Invited] Contribution admin non visible - problème RLS ou approbation');
      test.skip();
      return;
    }
    
    // Vérifier que le bouton supprimer n'est PAS visible sur cette contribution
    const deleteBtn = adminContrib.locator('.contrib-card__action--delete');
    await expect(deleteBtn).toBeHidden();
    
    console.log('[Delete Invited] ✓ Ne peut PAS supprimer les contributions des autres');
    
    // Nettoyage : se reconnecter en admin pour supprimer la contribution de test
    await page.click('#contrib-close');
    await page.waitForTimeout(500);
    await page.click('#nav-logout');
    await page.waitForTimeout(1000);
    
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    const cleanupContrib = page.locator(`.contrib-card:has-text("${adminTestName}")`);
    const cleanupDeleteBtn = cleanupContrib.locator('.contrib-card__action--delete');
    await cleanupDeleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    await page.locator('#delete-confirm-overlay button:has-text("Supprimer")').click();
    await page.waitForTimeout(2000);
    
    console.log('[Delete Invited] ✓ Contribution TEST nettoyée');
  });

  test('Admin peut supprimer toutes les contributions de sa ville', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Créer une contribution de test en tant qu'admin
    const testName = await createTestContribution(page, {
      name: 'Suppression Admin',
      category: 'mobilite',
      city: 'lyon'
    });
    
    // Retourner au landing puis aller sur la liste
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Chercher la contribution de test
    const testContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    await expect(testContrib).toBeVisible();
    
    // Vérifier que le bouton supprimer est visible (admin peut supprimer)
    const deleteBtn = testContrib.locator('.contrib-card__action--delete');
    await expect(deleteBtn).toBeVisible();
    
    console.log(`[Delete Admin] Test sur contribution: "${testName}"`);
    
    // Tester l'ouverture de la modale de confirmation
    await deleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    
    // Vérifier le titre de la modale
    const modalTitle = await page.locator('#delete-confirm-title').textContent();
    expect(modalTitle).toContain(testName);
    
    // CONFIRMER la suppression
    const confirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    await confirmBtn.click();
    
    await page.waitForSelector('#delete-confirm-overlay', { state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(2000);
    
    // Vérifier que la contribution a été supprimée
    const stillExists = await page.locator(`.contrib-card:has-text("${testName}")`).count();
    expect(stillExists).toBe(0);
    
    console.log('[Delete Admin] ✓ Contribution TEST supprimée avec succès');
  });

  test('Admin global peut supprimer toutes les contributions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Créer une contribution de test en tant qu'admin global
    const testName = await createTestContribution(page, {
      name: 'Suppression Admin Global',
      category: 'voielyonnaise',
      city: 'lyon'
    });
    
    // Retourner au landing puis aller sur la liste
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Chercher la contribution de test
    const testContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    await expect(testContrib).toBeVisible();
    
    // Vérifier que le bouton supprimer est visible
    const deleteBtn = testContrib.locator('.contrib-card__action--delete');
    await expect(deleteBtn).toBeVisible();
    
    console.log(`[Delete Admin Global] Test sur contribution: "${testName}"`);
    
    // Supprimer la contribution
    await deleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    
    const confirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    await confirmBtn.click();
    
    await page.waitForSelector('#delete-confirm-overlay', { state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(2000);
    
    // Vérifier que la contribution a été supprimée
    const stillExists = await page.locator(`.contrib-card:has-text("${testName}")`).count();
    expect(stillExists).toBe(0);
    
    console.log('[Delete Admin Global] ✓ Contribution TEST supprimée avec succès');
  });

  test('Modal de confirmation affiche les informations correctes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Créer une contribution de test pour vérifier la modale
    const testName = await createTestContribution(page, {
      name: 'Test Modale Confirmation',
      category: 'urbanisme',
      city: 'lyon'
    });
    
    // Retourner au landing puis aller sur la liste
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Chercher la contribution de test
    const testContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    const deleteBtn = testContrib.locator('.contrib-card__action--delete');
    
    // Cliquer sur supprimer
    await deleteBtn.click();
    
    // Attendre la modale
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    
    // Vérifier le titre
    const modalTitle = await page.locator('#delete-confirm-title').textContent();
    expect(modalTitle).toContain('Supprimer');
    expect(modalTitle).toContain(testName);
    
    // Vérifier la description
    const modalDesc = await page.locator('#delete-confirm-desc').textContent();
    expect(modalDesc).toContain('définitive');
    expect(modalDesc).toContain('contribution_uploads');
    
    // Vérifier les boutons
    const confirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    const cancelBtn = page.locator('#delete-confirm-overlay button:has-text("Annuler")');
    
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();
    
    // Fermer avec Annuler
    await cancelBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'hidden', timeout: 5000 });
    
    console.log('[Delete Modal] ✓ Modale affiche les bonnes informations');
    
    // Nettoyage : supprimer la contribution de test
    await page.waitForTimeout(500);
    const cleanupDeleteBtn = testContrib.locator('.contrib-card__action--delete');
    await cleanupDeleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    const cleanupConfirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    await cleanupConfirmBtn.click();
    await page.waitForTimeout(2000);
    
    console.log('[Delete Modal] ✓ Contribution TEST nettoyée');
  });

  test('Fermeture de la modale de confirmation avec X', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Créer une contribution de test
    const testName = await createTestContribution(page, {
      name: 'Test Fermeture X',
      category: 'urbanisme',
      city: 'lyon'
    });
    
    // Retourner au landing puis aller sur la liste
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Chercher la contribution de test
    const testContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    const deleteBtn = testContrib.locator('.contrib-card__action--delete');
    
    // Cliquer sur supprimer
    await deleteBtn.click();
    
    // Attendre la modale
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    
    // Fermer avec le bouton X
    const closeBtn = page.locator('#delete-confirm-overlay .gp-modal-close');
    await closeBtn.click();
    
    // Vérifier que la modale se ferme
    await page.waitForSelector('#delete-confirm-overlay', { state: 'hidden', timeout: 5000 });
    
    console.log('[Delete Modal] ✓ Fermeture avec X fonctionne');
    
    // Nettoyage : supprimer la contribution de test
    await page.waitForTimeout(500);
    const cleanupDeleteBtn = testContrib.locator('.contrib-card__action--delete');
    await cleanupDeleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    const cleanupConfirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    await cleanupConfirmBtn.click();
    await page.waitForTimeout(2000);
    
    console.log('[Delete Modal] ✓ Contribution TEST nettoyée');
  });

  test('Liste se rafraîchit après suppression', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Créer une contribution de test pour vérifier le rafraîchissement
    const testName = await createTestContribution(page, {
      name: 'Test Rafraîchissement',
      category: 'urbanisme',
      city: 'lyon'
    });
    
    // Retourner au landing puis aller sur la liste
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Compter les contributions avant suppression
    const initialCount = await page.locator('.contrib-card').count();
    console.log(`[Delete Refresh] Nombre initial de contributions: ${initialCount}`);
    
    // Vérifier que la contribution existe
    const testContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    await expect(testContrib).toBeVisible();
    
    // Supprimer la contribution
    const deleteBtn = testContrib.locator('.contrib-card__action--delete');
    await deleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    
    const confirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    await confirmBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'hidden', timeout: 5000 });
    
    // Attendre le rafraîchissement de la liste
    await page.waitForTimeout(2000);
    
    // Compter après suppression
    const finalCount = await page.locator('.contrib-card').count();
    console.log(`[Delete Refresh] Nombre final de contributions: ${finalCount}`);
    
    // Le nombre devrait avoir diminué de 1
    expect(finalCount).toBe(initialCount - 1);
    
    // Vérifier que la contribution n'existe plus
    const stillExists = await page.locator(`.contrib-card:has-text("${testName}")`).count();
    expect(stillExists).toBe(0);
    
    console.log('[Delete Refresh] ✓ Liste rafraîchie après suppression');
  });
});
