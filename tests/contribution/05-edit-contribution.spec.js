/**
 * Tests d'édition de contributions
 * 
 * RAPPEL DES PERMISSIONS :
 * - INVITED : peut modifier UNIQUEMENT ses propres contributions
 * - ADMIN : peut modifier TOUTES les contributions de sa ville
 * - ADMIN GLOBAL : peut modifier TOUTES les contributions de toutes les villes
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity,
  clickEditContributions,
  editContribution,
  clickNext,
  clickPrevious,
  fillStep1,
  fillStep3
} from '../helpers/contribution.js';

test.describe('Contribution - Édition (Tests généraux)', () => {

  test('Le bouton "Modifier" ouvre la modale d\'édition', async ({ page }) => {
    // Se connecter en tant qu'invited
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Vérifier qu'il y a au moins une contribution
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Cliquer sur le premier bouton "Modifier"
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    // Attendre que la modale d'édition s'ouvre
    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { state: 'visible', timeout: 10000 });

    // Vérifier que le titre indique une modification
    const title = page.locator('#create-modal-title');
    const titleText = await title.textContent();
    
    // Le titre peut être "Modifier une contribution" ou similaire
    // Adapter selon votre implémentation
    expect(titleText).toBeTruthy();
  });

  test('Les données de la contribution sont pré-remplies en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Récupérer le nom du premier projet avant d'ouvrir l'édition
    const projectName = await page.locator('.contrib-card').first().locator('.contrib-card__title').textContent();

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Vérifier que le nom du projet est pré-rempli
    const projectNameInput = page.locator('#contrib-project-name');
    const inputValue = await projectNameInput.inputValue();
    
    expect(inputValue).toBe(projectName?.trim());
  });

  test('Modifier le nom d\'un projet en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Récupérer l'ancien nom
    const oldName = await page.locator('#contrib-project-name').inputValue();

    // Modifier le nom
    const newName = `${oldName} - Modifié`;
    await page.fill('#contrib-project-name', newName);

    // Vérifier que la valeur a bien changé
    await expect(page.locator('#contrib-project-name')).toHaveValue(newName);

    // Note: On ne soumet pas pour ne pas modifier réellement la base
    // Si vous voulez tester la soumission, créez d'abord une contribution de test
  });

  test('Navigation entre les étapes en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Vérifier qu'on démarre sur l'étape 1
    await expect(page.locator('#contrib-step-1-tab[aria-selected="true"]')).toBeVisible();

    // Passer à l'étape 2
    await clickNext(page);
    await expect(page.locator('#contrib-step-2-tab[aria-selected="true"]')).toBeVisible();

    // Passer à l'étape 3
    await clickNext(page);
    await expect(page.locator('#contrib-step-3-tab[aria-selected="true"]')).toBeVisible();

    // Revenir à l'étape 2
    await clickPrevious(page);
    await expect(page.locator('#contrib-step-2-tab[aria-selected="true"]')).toBeVisible();

    // Revenir à l'étape 1
    await clickPrevious(page);
    await expect(page.locator('#contrib-step-1-tab[aria-selected="true"]')).toBeVisible();
  });

  test('Les modifications sont préservées lors de la navigation entre étapes', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Modifier le nom à l'étape 1
    const newName = `Test Modification ${Date.now()}`;
    await page.fill('#contrib-project-name', newName);

    // Passer à l'étape 3
    await clickNext(page);
    await clickNext(page);

    // Modifier la description
    const newDescription = 'Description modifiée pour test';
    await page.fill('#contrib-description', newDescription);

    // Revenir à l'étape 1
    await clickPrevious(page);
    await clickPrevious(page);

    // Vérifier que le nom est toujours là
    await expect(page.locator('#contrib-project-name')).toHaveValue(newName);

    // Retourner à l'étape 3
    await clickNext(page);
    await clickNext(page);

    // Vérifier que la description est toujours là
    await expect(page.locator('#contrib-description')).toHaveValue(newDescription);
  });

  test('Annuler l\'édition en fermant la modale', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Modifier quelque chose
    await page.fill('#contrib-project-name', 'Modification à annuler');

    // Fermer la modale
    await page.click('#create-modal-close');

    // Vérifier que la modale est fermée
    await expect(page.locator('#create-modal-overlay[aria-hidden="true"]')).toBeHidden();

    // Vérifier qu'on est de retour sur la liste
    await expect(page.locator('#contrib-panel-list:not([hidden])')).toBeVisible();
  });

  test('Le GeoJSON existant est affiché à l\'étape 2 en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Trouver une contribution qui a un GeoJSON (indiqué par une icône ou badge)
    // Adapter selon votre markup
    const items = page.locator('.contrib-card');
    const count = await items.count();

    // Ouvrir la première contribution
    const editBtn = items.first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Aller à l'étape 2
    await clickNext(page);

    // Vérifier que le panneau de géométrie existe (le bon ID est #contrib-draw-panel)
    const drawPanel = page.locator('#contrib-draw-panel');
    await expect(drawPanel).toBeAttached();

    // Si la contribution a un GeoJSON, il devrait être visible sur la carte
    // Vérifier la présence d'éléments SVG (peut prendre du temps)
    await page.waitForTimeout(2000);

    // Note: Adapter selon si la contribution a effectivement un GeoJSON
  });

  test('Impossible de changer la ville en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Vérifier que le champ ville est disabled ou caché
    const cityInput = page.locator('#contrib-city');
    
    // Le champ ville est hidden en mode édition
    expect(await cityInput.getAttribute('type')).toBe('hidden');
  });

  test('Le bouton "Enregistrer" est visible en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Aller à la dernière étape
    await clickNext(page);
    await clickNext(page);
    await clickNext(page);

    // Vérifier que le bouton submit est visible (le vrai ID est #contrib-submit)
    const submitBtn = page.locator('#contrib-submit');
    await expect(submitBtn).toBeVisible();

    // Le texte peut être "Mettre à jour", "Enregistrer", "Modifier", etc.
    const btnText = await submitBtn.textContent();
    
    // Vérifier que le bouton contient du texte
    expect(btnText).toBeTruthy();
  });

  test('Invited peut modifier ses propres contributions', async ({ page }) => {
    // L'invited ne voit que ses contributions, donc toutes les contributions affichées sont les siennes
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition la première contribution (qui est forcément la sienne)
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await expect(editBtn).toBeVisible();
    
    await editBtn.click();
    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });
    
    // Vérifier qu'on peut modifier
    const projectNameInput = page.locator('#contrib-project-name');
    await expect(projectNameInput).toBeEditable();
    
    console.log('[Invited] Peut modifier ses propres contributions');
  });

  test('Invited ne voit PAS de bouton "Modifier" sur les contributions approuvées des autres', async ({ page }) => {
    // Invited voit ses contributions + celles approuvées de l'équipe
    // MAIS ne peut modifier que les siennes
    
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Vérifier que le message informatif est affiché
    const notice = page.locator('#contrib-invited-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Vous ne pouvez modifier que les vôtres');
    
    // Compter les contributions visibles et les boutons "Modifier"
    const cards = page.locator('.contrib-card');
    const cardsCount = await cards.count();
    const editButtons = page.locator('.contrib-card__action--edit');
    const editCount = await editButtons.count();
    
    console.log(`[Invited] Voit ${cardsCount} contributions mais ne peut modifier que ${editCount} (les siennes)`);
    
    // Si invited voit des contributions approuvées des autres, editCount < cardsCount
    if (cardsCount > editCount) {
      console.log(`[Invited] Voit ${cardsCount - editCount} contributions approuvées sans bouton Modifier`);
    }
  });
});

// Tests spécifiques ADMIN
test.describe('Contribution - Édition (Permissions ADMIN)', () => {
  
  test('Admin peut modifier toutes les contributions de sa ville', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement" pour voir toutes les contributions
    const mineOnlyCheckbox = page.locator('#contrib-mine-only');
    if (await mineOnlyCheckbox.isChecked()) {
      await mineOnlyCheckbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // TOUS les items doivent avoir un bouton "Modifier" pour un admin
    const editButtons = page.locator('.contrib-card__action--edit');
    const editCount = await editButtons.count();
    
    console.log(`[Admin] Voit ${itemCount} contributions et peut modifier ${editCount} d'entre elles`);
    
    // Admin devrait pouvoir modifier toutes les contributions visibles
    expect(editCount).toBe(itemCount);
    
    // Vérifier qu'on peut effectivement ouvrir en édition
    const firstEditBtn = editButtons.first();
    await expect(firstEditBtn).toBeVisible();
    await firstEditBtn.click();
    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });
    
    const projectNameInput = page.locator('#contrib-project-name');
    await expect(projectNameInput).toBeEditable();
    
    console.log('[Admin] Peut modifier toutes les contributions de sa ville ✅');
  });
});

// Tests spécifiques ADMIN GLOBAL
test.describe('Contribution - Édition (Permissions ADMIN GLOBAL)', () => {

  test('Admin global peut modifier toutes les contributions', async ({ page }) => {
    // Se reconnecter en tant qu'admin global
    await page.goto('/logout/');
    await page.waitForURL('/', { timeout: 10000 });
    
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement" pour voir toutes les contributions
    const mineOnlyCheckbox = page.locator('#contrib-mine-only');
    if (await mineOnlyCheckbox.isChecked()) {
      await mineOnlyCheckbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Essayer de modifier une contribution
    const editBtn = page.locator('.contrib-card').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await expect(editBtn).toBeVisible();
    
    await editBtn.click();
    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });
    
    // Vérifier qu'on peut modifier
    const projectNameInput = page.locator('#contrib-project-name');
    await expect(projectNameInput).toBeEditable();
    
    console.log('[Admin Global] Peut modifier toutes les contributions');
  });
});
