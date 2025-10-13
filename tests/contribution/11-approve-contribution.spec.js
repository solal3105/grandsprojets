/**
 * Tests d'approbation de contributions
 * Teste les permissions et le comportement de l'approbation/révocation
 * 
 * IMPORTANT : Ces tests créent leurs propres contributions de test (préfixées "TEST - ")
 * sur la ville de LYON uniquement, puis les approuvent/révoqu. Aucune donnée réelle n'est touchée.
 * 
 * RAPPEL DES PERMISSIONS :
 * - INVITED : NE PEUT PAS approuver (bouton masqué)
 * - ADMIN : PEUT approuver/révoquer les contributions de sa ville
 * - ADMIN GLOBAL : PEUT approuver/révoquer toutes les contributions
 * 
 * COMPORTEMENT :
 * - Les contributions approuvées sont visibles par toute l'équipe
 * - Les contributions en attente ne sont visibles que par leur créateur (+ admin)
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity,
  clickEditContributions,
  createTestContribution
} from '../helpers/contribution.js';

test.describe('Contribution - Approbation', () => {

  test('Admin voit le bouton d\'approbation et peut approuver', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Créer une contribution de test
    const testName = await createTestContribution(page, {
      name: 'Test Approbation Admin',
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
    await expect(testContrib).toBeVisible();
    
    // Vérifier que le bouton d'approbation est visible
    const approveBtn = testContrib.locator('.contrib-card__action--approve');
    await expect(approveBtn).toBeVisible();
    
    // Vérifier l'icône
    const icon = approveBtn.locator('i.fa-circle-check');
    await expect(icon).toBeVisible();
    
    console.log(`[Approve Admin] Test sur contribution: "${testName}"`);
    
    // Approuver la contribution
    await approveBtn.click();
    await page.waitForTimeout(1000);
    
    // Vérifier que le badge passe en "Approuvé"
    const approvedBadge = testContrib.locator('.contrib-card__badge--approved');
    await expect(approvedBadge).toBeVisible();
    
    console.log('[Approve Admin] ✓ Contribution approuvée avec succès');
    
    // Nettoyage : supprimer la contribution de test
    const deleteBtn = testContrib.locator('.contrib-card__action--delete');
    await deleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    const confirmBtn = page.locator('#delete-confirm-overlay button:has-text("Supprimer")');
    await confirmBtn.click();
    await page.waitForTimeout(2000);
    
    console.log('[Approve Admin] ✓ Contribution TEST nettoyée');
  });

  test('Invited ne voit PAS le bouton d\'approbation', async ({ page }) => {
    // Créer une contribution en admin, l'approuver, puis vérifier qu'invited ne voit pas le bouton d'approbation
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Créer et approuver une contribution
    const testName = await createTestContribution(page, {
      name: 'Test Invited No Approve',
      category: 'mobilite',
      city: 'lyon'
    });
    
    await page.click('#contrib-back');
    await page.waitForTimeout(500);
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    const testContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    const approveBtn = testContrib.locator('.contrib-card__action--approve');
    await approveBtn.click();
    await page.waitForTimeout(1000);
    
    // Se déconnecter et se connecter en invited
    await page.click('#contrib-close');
    await page.waitForTimeout(500);
    await page.click('#nav-logout');
    await page.waitForTimeout(1000);
    
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement"
    const checkbox = page.locator('#contrib-mine-only');
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    // Vérifier que la contribution approuvée est visible
    const invitedViewContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    const contribVisible = await invitedViewContrib.count();
    
    if (contribVisible > 0) {
      // Vérifier qu'il n'y a PAS de bouton d'approbation
      const approveBtnInvited = invitedViewContrib.locator('.contrib-card__action--approve');
      await expect(approveBtnInvited).toBeHidden();
      
      console.log('[Approve Invited] ✓ Ne voit PAS le bouton d\'approbation');
    }
    
    // Nettoyage
    await page.click('#contrib-close');
    await page.waitForTimeout(500);
    await page.click('#nav-logout');
    await page.waitForTimeout(1000);
    
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    const cleanupContrib = page.locator(`.contrib-card:has-text("${testName}")`);
    const deleteBtn = cleanupContrib.locator('.contrib-card__action--delete');
    await deleteBtn.click();
    await page.waitForSelector('#delete-confirm-overlay', { state: 'visible', timeout: 5000 });
    await page.locator('#delete-confirm-overlay button:has-text("Supprimer")').click();
    await page.waitForTimeout(2000);
    
    console.log('[Approve Invited] ✓ Contribution TEST nettoyée');
  });

  test('Admin global voit le bouton d\'approbation sur toutes les contributions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement" pour voir toutes les contributions
    const checkbox = page.locator('#contrib-mine-only');
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Compter les boutons d'approbation
    const approveButtons = page.locator('.contrib-card__action--approve');
    const approveCount = await approveButtons.count();
    
    console.log(`[Approve Admin Global] ${approveCount} boutons d'approbation sur ${itemCount} contributions`);
    
    // Admin global devrait avoir un bouton d'approbation sur TOUTES les contributions
    expect(approveCount).toBe(itemCount);
    
    console.log('[Approve Admin Global] Voit les boutons d\'approbation ✓');
  });

  test('Badge de statut change après approbation (simulation)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement"
    const checkbox = page.locator('#contrib-mine-only');
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Trouver une contribution en attente (non approuvée)
    const pendingContrib = page.locator('.contrib-card:has(.contrib-card__badge--pending)').first();
    const hasPending = await pendingContrib.count();
    
    if (hasPending === 0) {
      console.log('[Approve Badge] Aucune contribution en attente trouvée');
      // Chercher une contribution approuvée à la place
      const approvedContrib = page.locator('.contrib-card:has(.contrib-card__badge--approved)').first();
      const hasApproved = await approvedContrib.count();
      
      if (hasApproved === 0) {
        console.log('[Approve Badge] Aucune contribution trouvée avec badge de statut');
        test.skip();
        return;
      }
      
      // Vérifier le badge approuvé
      const approvedBadge = approvedContrib.locator('.contrib-card__badge--approved');
      await expect(approvedBadge).toBeVisible();
      
      const badgeText = await approvedBadge.textContent();
      expect(badgeText).toContain('Approuvé');
      
      console.log('[Approve Badge] Badge "Approuvé" correctement affiché ✓');
      return;
    }
    
    // Vérifier le badge "En attente"
    const pendingBadge = pendingContrib.locator('.contrib-card__badge--pending');
    await expect(pendingBadge).toBeVisible();
    
    const badgeText = await pendingBadge.textContent();
    expect(badgeText).toContain('attente');
    
    console.log('[Approve Badge] Badge "En attente" correctement affiché ✓');
    console.log('[Approve Badge] Note: Pour tester le changement de badge après clic, utiliser un environnement de test');
  });

  test('Bouton d\'approbation change d\'état selon le statut de la contribution', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement"
    const checkbox = page.locator('#contrib-mine-only');
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Chercher une contribution approuvée
    const approvedContrib = page.locator('.contrib-card:has(.contrib-card__badge--approved)').first();
    const hasApproved = await approvedContrib.count();
    
    if (hasApproved > 0) {
      // Vérifier que le bouton d'approbation a la classe "is-approved"
      const approveBtn = approvedContrib.locator('.contrib-card__action--approve');
      await expect(approveBtn).toHaveClass(/is-approved/);
      
      // Vérifier le title (devrait être "Révoquer l'approbation")
      const title = await approveBtn.getAttribute('title');
      expect(title).toMatch(/révoquer/i);
      
      console.log('[Approve Button State] Bouton correctement marqué comme "approuvé" ✓');
    }
    
    // Chercher une contribution en attente
    const pendingContrib = page.locator('.contrib-card:has(.contrib-card__badge--pending)').first();
    const hasPending = await pendingContrib.count();
    
    if (hasPending > 0) {
      // Vérifier que le bouton d'approbation n'a PAS la classe "is-approved"
      const approveBtn = pendingContrib.locator('.contrib-card__action--approve');
      const hasApprovedClass = await approveBtn.evaluate(el => el.classList.contains('is-approved'));
      expect(hasApprovedClass).toBe(false);
      
      // Vérifier le title (devrait être "Approuver")
      const title = await approveBtn.getAttribute('title');
      expect(title).toMatch(/approuver/i);
      
      console.log('[Approve Button State] Bouton correctement marqué comme "non approuvé" ✓');
    }
    
    if (hasApproved === 0 && hasPending === 0) {
      console.log('[Approve Button State] Aucune contribution avec badge de statut trouvée');
      test.skip();
    }
  });

  test('Contributions approuvées sont visibles par l\'équipe (invited)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement" pour voir les contributions approuvées de l'équipe
    const checkbox = page.locator('#contrib-mine-only');
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      console.log('[Approve Visibility] Aucune contribution trouvée');
      test.skip();
      return;
    }
    
    // Compter les contributions approuvées visibles (qui ne sont pas les siennes)
    const approvedOthers = page.locator('.contrib-card:has(.contrib-card__badge--approved)').filter({ 
      hasNot: page.locator('.contrib-card__badge--owner') 
    });
    const approvedOthersCount = await approvedOthers.count();
    
    console.log(`[Approve Visibility] ${approvedOthersCount} contribution(s) approuvée(s) d'autres utilisateurs visibles`);
    
    if (approvedOthersCount > 0) {
      // Vérifier qu'au moins une contribution approuvée d'un autre est visible
      const firstApproved = approvedOthers.first();
      await expect(firstApproved).toBeVisible();
      
      // Vérifier le badge approuvé
      const badge = firstApproved.locator('.contrib-card__badge--approved');
      await expect(badge).toBeVisible();
      
      console.log('[Approve Visibility] Invited voit les contributions approuvées de l\'équipe ✓');
    } else {
      console.log('[Approve Visibility] Aucune contribution approuvée d\'autres utilisateurs (normal si base vide)');
    }
    
    // Vérifier que les contributions en attente des autres ne sont PAS visibles
    const pendingOthers = page.locator('.contrib-card:has(.contrib-card__badge--pending)').filter({ 
      hasNot: page.locator('.contrib-card__badge--owner') 
    });
    const pendingOthersCount = await pendingOthers.count();
    
    console.log(`[Approve Visibility] ${pendingOthersCount} contribution(s) en attente d'autres utilisateurs (devrait être 0 pour invited)`);
    
    // Invited ne devrait PAS voir les contributions en attente des autres
    // (sauf si RLS mal configuré)
    expect(pendingOthersCount).toBe(0);
    
    console.log('[Approve Visibility] Invited ne voit PAS les contributions en attente des autres ✓');
  });
});
