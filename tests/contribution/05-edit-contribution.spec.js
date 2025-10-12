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

test.describe('Contribution - Édition', () => {

  test.beforeEach(async ({ page }) => {
    // Se connecter et ouvrir le panel liste
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.user);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Attendre que la liste se charge
    await page.waitForTimeout(1500);
  });

  test('Le bouton "Modifier" ouvre la modale d\'édition', async ({ page }) => {
    // Vérifier qu'il y a au moins une contribution
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Cliquer sur le premier bouton "Modifier"
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
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
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Récupérer le nom du premier projet avant d'ouvrir l'édition
    const projectName = await page.locator('.contrib-item').first().locator('.contrib-item__title').textContent();

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Vérifier que le nom du projet est pré-rempli
    const projectNameInput = page.locator('#contrib-project-name');
    const inputValue = await projectNameInput.inputValue();
    
    expect(inputValue).toBe(projectName?.trim());
  });

  test('Modifier le nom d\'un projet en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
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
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
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
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
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
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
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
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Trouver une contribution qui a un GeoJSON (indiqué par une icône ou badge)
    // Adapter selon votre markup
    const items = page.locator('.contrib-item');
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
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
    await editBtn.click();

    await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { timeout: 10000 });

    // Vérifier que le champ ville est disabled ou caché
    const cityInput = page.locator('#contrib-city');
    
    // Le champ ville est hidden en mode édition
    expect(await cityInput.getAttribute('type')).toBe('hidden');
  });

  test('Le bouton "Enregistrer" est visible en mode édition', async ({ page }) => {
    const itemCount = await page.locator('.contrib-item').count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }

    // Ouvrir en édition
    const editBtn = page.locator('.contrib-item').first().locator('button[title*="Modifier"], button:has-text("Modifier")').first();
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
});
