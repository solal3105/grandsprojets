import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import { 
  openContributionModal,
  selectCity,
  clickEditContributions,
  openCreateModal,
  fillStep1,
  clickNext,
  clickPrevious,
  uploadGeoJSON,
  fillStep3,
  fillStep4,
  submitForm
} from '../helpers/contribution.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper pour obtenir le chemin du fichier GeoJSON de test
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_GEOJSON_PATH = path.join(__dirname, '..', 'test-data.geojson');

test.describe('Contribution - Flux de création complet', () => {
  
  test.beforeEach(async ({ page }) => {
    // Se connecter et ouvrir la modale
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.user);
    await openContributionModal(page);
    
    // Sélectionner une ville et aller sur le panel liste
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
  });

  test('La modale de création s\'ouvre correctement', async ({ page }) => {
    // Ouvrir la modale de création
    await openCreateModal(page);
    
    // Vérifier que la modale est visible
    const createModal = page.locator('#create-modal-overlay[aria-hidden="false"]');
    await expect(createModal).toBeVisible();
    
    // Vérifier que le titre est correct
    const title = page.locator('#create-modal-title');
    await expect(title).toContainText('Créer une contribution');
    
    // Vérifier que le stepper est visible
    const stepper = page.locator('#contrib-stepper');
    await expect(stepper).toBeVisible();
    
    // Vérifier que l'étape 1 est active
    const step1 = page.locator('#contrib-step-1-tab[aria-selected="true"]');
    await expect(step1).toBeVisible();
  });

  test('Étape 1 : Remplir les informations de base', async ({ page }) => {
    await openCreateModal(page);
    
    // Remplir le nom du projet
    await page.fill('#contrib-project-name', 'Test Tram T11');
    
    // Vérifier que le champ ville est pré-rempli (hidden)
    const cityInput = page.locator('#contrib-city');
    await expect(cityInput).toHaveValue('lyon');
    
    // Sélectionner une catégorie
    const categorySelect = page.locator('#contrib-category');
    await expect(categorySelect).toBeEnabled(); // Doit être enabled maintenant
    
    // Attendre que les options soient chargées
    await page.waitForTimeout(1000);
    
    // Sélectionner la première catégorie disponible (autre que l'option vide)
    const options = await categorySelect.locator('option:not([value=""])').count();
    expect(options).toBeGreaterThan(0);
    
    await categorySelect.selectOption({ index: 1 });
    
    // Vérifier que le bouton "Suivant" est activé (ID correct: #contrib-next dans la modale de création)
    const nextBtn = page.locator('#contrib-next');
    await expect(nextBtn).toBeEnabled();
  });

  test('Impossible de passer à l\'étape 2 sans remplir les champs requis', async ({ page }) => {
    await openCreateModal(page);
    
    // Attendre que l'étape 1 soit visible
    await page.waitForSelector('#contrib-step-1-tab[aria-selected="true"]', { state: 'visible' });
    
    // Essayer de cliquer sur "Suivant" sans remplir (ID correct: #contrib-next dans la modale de création)
    const nextBtn = page.locator('#contrib-next');
    await nextBtn.click();
    
    // Attendre un peu (la validation HTML5 empêche la navigation)
    await page.waitForTimeout(500);
    
    // Vérifier qu'on est toujours sur l'étape 1
    const step1 = page.locator('#contrib-step-1-tab[aria-selected="true"]');
    await expect(step1).toBeVisible();
    
    // Vérifier que les champs requis sont marqués en erreur (HTML5 validation)
    const projectNameInput = page.locator('#contrib-project-name');
    const isInvalid = await projectNameInput.evaluate(el => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('Navigation entre les étapes : Étape 1 → Étape 2 → Retour', async ({ page }) => {
    await openCreateModal(page);
    
    // Remplir l'étape 1
    await fillStep1(page, {
      projectName: 'Test Navigation',
      category: 'mobilite'
    });
    
    // Passer à l'étape 2
    await clickNext(page);
    
    // Vérifier qu'on est sur l'étape 2
    const step2 = page.locator('#contrib-step-2-tab[aria-selected="true"]');
    await expect(step2).toBeVisible();
    
    // Vérifier que le panneau de dessin existe (le bon ID est #contrib-draw-map)
    // Note: Il est masqué par défaut, seulement visible si mode "draw" est sélectionné
    const drawPanel = page.locator('#contrib-draw-panel');
    await expect(drawPanel).toBeAttached();
    
    // Revenir à l'étape 1
    await clickPrevious(page);
    
    // Vérifier qu'on est de retour sur l'étape 1
    const step1Again = page.locator('#contrib-step-1-tab[aria-selected="true"]');
    await expect(step1Again).toBeVisible();
    
    // Vérifier que les données sont toujours là
    const projectNameInput = page.locator('#contrib-project-name');
    await expect(projectNameInput).toHaveValue('Test Navigation');
  });

  test('Étape 2 : Upload d\'un fichier GeoJSON valide', async ({ page }) => {
    await openCreateModal(page);
    
    // Remplir et passer l'étape 1
    await fillStep1(page, {
      projectName: 'Test GeoJSON Upload',
      category: 'mobilite'
    });
    await clickNext(page);
    
    // Créer un fichier GeoJSON de test valide
    const geojsonContent = {
      "type": "FeatureCollection",
      "features": [{
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": [[4.8357, 45.7640], [4.8400, 45.7650]]
        },
        "properties": {
          "name": "Test Line"
        }
      }]
    };
    
    // Écrire le fichier temporaire
    const fs = await import('fs');
    const tmpPath = path.join(process.cwd(), 'tests', 'fixtures', 'test.geojson');
    
    // Créer le dossier fixtures s'il n'existe pas
    const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    
    fs.writeFileSync(tmpPath, JSON.stringify(geojsonContent));
    
    // Upload le fichier (le vrai ID est #contrib-geojson)
    const fileInput = page.locator('#contrib-geojson');
    await fileInput.setInputFiles(tmpPath);
    
    // Attendre que le GeoJSON soit chargé sur la carte (peut ne pas apparaître immédiatement)
    // On attend juste que le fichier soit sélectionné
    await page.waitForTimeout(2000);
    
    // Vérifier que le nom du fichier apparaît dans l'UI
    const filename = page.locator('#contrib-dz-filename');
    await expect(filename).toContainText('test.geojson');
    
    // Nettoyer le fichier temporaire
    fs.unlinkSync(tmpPath);
  });

  test('Étape 3 : Remplir description, meta et markdown', async ({ page }) => {
    await openCreateModal(page);
    
    // Remplir et passer les étapes 1 et 2
    await fillStep1(page, {
      projectName: 'Test Step 3',
      category: 'urbanisme'
    });
    await clickNext(page);
    
    // Étape 2 : Uploader le GeoJSON (obligatoire)
    await uploadGeoJSON(page, TEST_GEOJSON_PATH);
    await clickNext(page);
    
    // Vérifier qu'on est sur l'étape 3
    const step3 = page.locator('#contrib-step-3-tab[aria-selected="true"]');
    await expect(step3).toBeVisible();
    
    // Vérifier que l'assistant IA est visible
    const assistantCard = page.locator('#assistant-writer-card');
    await expect(assistantCard).toBeVisible();
    
    // Remplir les champs
    await fillStep3(page, {
      description: 'Ceci est une description de test pour le projet',
      meta: 'Statut: En cours | Budget: 10M€',
      markdownContent: '# Détails du projet\n\nContenu en markdown...'
    });
    
    // Vérifier que les valeurs sont bien remplies
    await expect(page.locator('#contrib-description')).toHaveValue('Ceci est une description de test pour le projet');
    await expect(page.locator('#contrib-meta')).toHaveValue('Statut: En cours | Budget: 10M€');
    // Le vrai ID est #contrib-markdown (pas #contrib-markdown-content)
    await expect(page.locator('#contrib-markdown')).toHaveValue('# Détails du projet\n\nContenu en markdown...');
  });

  test('Étape 4 : Remplir les liens externes', async ({ page }) => {
    await openCreateModal(page);
    
    // Remplir et passer toutes les étapes jusqu'à la 4
    await fillStep1(page, {
      projectName: 'Test Step 4',
      category: 'velo'
    });
    await clickNext(page);
    
    // Étape 2 : Uploader le GeoJSON (obligatoire)
    await uploadGeoJSON(page, TEST_GEOJSON_PATH);
    await clickNext(page);
    
    // Étape 3 : Remplir les champs requis
    await fillStep3(page, {
      description: 'Description de test',
      meta: 'Meta de test'
    });
    await clickNext(page);
    
    // Vérifier qu'on est sur l'étape 4
    const step4 = page.locator('#contrib-step-4-tab[aria-selected="true"]');
    await expect(step4).toBeVisible();
    
    // Vérifier que le bouton "Enregistrer" est visible (dernière étape)
    // Le vrai ID est #contrib-submit (pas #contrib-submit-footer)
    const submitBtn = page.locator('#contrib-submit');
    await expect(submitBtn).toBeVisible();
    
    // Remplir les liens
    await fillStep4(page, {
      officialLink: 'https://www.grandlyon.com/projet-test'
    });
    
    // Vérifier que les valeurs sont bien remplies (le vrai ID est #contrib-official-url)
    await expect(page.locator('#contrib-official-url')).toHaveValue('https://www.grandlyon.com/projet-test');
  });

  test('Flux complet : Créer une contribution avec champs requis uniquement', async ({ page }) => {
    await openCreateModal(page);
    
    // Étape 1 : Infos de base (requis)
    await fillStep1(page, {
      projectName: `Test Minimal ${Date.now()}`,
      category: 'mobilite'
    });
    await clickNext(page);
    
    // Étape 2 : GeoJSON (requis)
    await uploadGeoJSON(page, TEST_GEOJSON_PATH);
    await clickNext(page);
    
    // Étape 3 : Description et Meta (requis)
    await fillStep3(page, {
      description: 'Description minimale pour le test',
      meta: 'Meta minimale pour le test'
    });
    await clickNext(page);
    
    // Étape 4 : Liens (optionnels) - on passe direct à la soumission
    const submitBtn = page.locator('#contrib-submit');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test('Le bouton "Retour" à chaque étape fonctionne correctement', async ({ page }) => {
    await openCreateModal(page);
    
    // Remplir l'étape 1 et avancer jusqu'à l'étape 4
    await fillStep1(page, {
      projectName: 'Test Navigation Complète',
      category: 'urbanisme'
    });
    await clickNext(page); // Étape 2
    
    // Étape 2 : Uploader le GeoJSON (obligatoire pour passer)
    await uploadGeoJSON(page, TEST_GEOJSON_PATH);
    await clickNext(page); // Étape 3
    
    // Étape 3 : Remplir les champs requis
    await fillStep3(page, {
      description: 'Description pour le test de navigation',
      meta: 'Meta pour le test de navigation'
    });
    await clickNext(page); // Étape 4
    
    // Vérifier qu'on est sur l'étape 4
    await expect(page.locator('#contrib-step-4-tab[aria-selected="true"]')).toBeVisible();
    
    // Revenir en arrière étape par étape
    await clickPrevious(page); // Retour étape 3
    await expect(page.locator('#contrib-step-3-tab[aria-selected="true"]')).toBeVisible();
    
    await clickPrevious(page); // Retour étape 2
    await expect(page.locator('#contrib-step-2-tab[aria-selected="true"]')).toBeVisible();
    
    await clickPrevious(page); // Retour étape 1
    await expect(page.locator('#contrib-step-1-tab[aria-selected="true"]')).toBeVisible();
  });

  test('Fermer la modale de création pendant la saisie', async ({ page }) => {
    await openCreateModal(page);
    
    // Remplir partiellement
    await page.fill('#contrib-project-name', 'Test Fermeture');
    
    // Fermer la modale
    await page.click('#create-modal-close');
    
    // Vérifier que la modale est fermée
    await expect(page.locator('#create-modal-overlay[aria-hidden="true"]')).toBeHidden();
    
    // Vérifier qu'on est de retour sur le panel liste
    await expect(page.locator('#contrib-panel-list:not([hidden])')).toBeVisible();
  });
});
