/**
 * Helpers pour les actions de contribution
 */

/**
 * Ouvrir la modale de contribution
 * @param {import('@playwright/test').Page} page
 */
export async function openContributionModal(page) {
  // Cliquer sur le bouton "Contribuer"
  await page.click('#nav-contribute');
  
  // Si une navigation se déclenche, attendre qu'elle se termine
  try {
    await page.waitForURL(/\?city=/, { timeout: 2000 });
    // Navigation détectée, attendre le chargement complet
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {
    // Pas de navigation, continuer
  }
  
  // Vérifier si la modale est déjà ouverte
  const modalAlreadyOpen = await page.locator('#contrib-overlay[aria-hidden="false"]').isVisible().catch(() => false);
  
  if (!modalAlreadyOpen) {
    // Re-cliquer pour charger et ouvrir la modale après navigation
    await page.click('#nav-contribute');
    
    // Attendre que la modale soit visible
    await page.waitForSelector('#contrib-overlay[aria-hidden="false"]', { state: 'visible', timeout: 10000 });
  }
  
  // Attendre que le landing soit chargé
  await page.waitForSelector('#contrib-landing', { state: 'visible', timeout: 5000 });
}

/**
 * Fermer la modale de contribution
 * @param {import('@playwright/test').Page} page
 */
export async function closeContributionModal(page) {
  // Cliquer sur le bouton fermer
  await page.click('#contrib-close');
  
  // Attendre que la modale soit cachée (vérifier que aria-hidden="true")
  // On utilise waitForFunction pour attendre que l'attribut change
  await page.waitForFunction(() => {
    const modal = document.querySelector('#contrib-overlay');
    return modal && modal.getAttribute('aria-hidden') === 'true';
  }, { timeout: 5000 });
}

/**
 * Sélectionner une ville dans le landing
 * @param {import('@playwright/test').Page} page
 * @param {string} cityName - Nom de la ville (ex: "lyon", "besancon")
 */
export async function selectCity(page, cityName) {
  // Attendre que le sélecteur de ville soit visible
  await page.waitForSelector('#landing-city-select', { state: 'visible' });
  
  // Sélectionner la ville
  await page.selectOption('#landing-city-select', cityName);
  
  // Attendre que les cartes d'action apparaissent
  await page.waitForSelector('#landing-cards', { state: 'visible', timeout: 5000 });
}

/**
 * Cliquer sur "Modifier mes contributions"
 * @param {import('@playwright/test').Page} page
 */
export async function clickEditContributions(page) {
  await page.click('#landing-edit');
  
  // Attendre que le panel liste soit visible
  await page.waitForSelector('#contrib-panel-list:not([hidden])', { state: 'visible', timeout: 5000 });
  
  // Attendre un peu pour laisser le temps à CityContext de se mettre à jour et à la liste de se charger
  await page.waitForTimeout(1000);
}

/**
 * Cliquer sur "Gérer les catégories"
 * @param {import('@playwright/test').Page} page
 */
export async function clickManageCategories(page) {
  await page.click('#landing-categories');
  
  // Attendre que le panel catégories soit visible
  await page.waitForSelector('#contrib-panel-categories:not([hidden])', { state: 'visible', timeout: 5000 });
}

/**
 * Cliquer sur "Gérer les utilisateurs"
 * @param {import('@playwright/test').Page} page
 */
export async function clickManageUsers(page) {
  await page.click('#landing-users');
  
  // Attendre que le panel utilisateurs soit visible
  await page.waitForSelector('#contrib-panel-users:not([hidden])', { state: 'visible', timeout: 5000 });
}

/**
 * Cliquer sur "Gérer ma structure"
 * Note: Le panel #contrib-panel-edit-city n'est pas encore implémenté
 * @param {import('@playwright/test').Page} page
 */
export async function clickEditCity(page) {
  await page.click('#landing-edit-city');
  
  // Attendre un peu pour que l'action se déclenche
  // Le panel edit-city n'est pas encore implémenté, donc on n'attend pas qu'il apparaisse
  await page.waitForTimeout(500);
}

/**
 * Ouvrir la modale de création de contribution
 * @param {import('@playwright/test').Page} page
 */
export async function openCreateModal(page) {
  // Attendre que le panel liste soit visible et chargé
  await page.waitForSelector('#contrib-panel-list:not([hidden])', { state: 'visible', timeout: 10000 });
  
  // Attendre que les actions du header soient créées (lazy loading)
  await page.waitForTimeout(1500);
  
  // Chercher le bouton créer dans le header (ID exact)
  const createBtn = page.locator('#contrib-list-create-btn');
  
  // Attendre que le bouton soit visible et cliquable
  await createBtn.waitFor({ state: 'visible', timeout: 10000 });
  
  // Cliquer sur le bouton
  await createBtn.click();
  
  // Attendre que la modale de création se charge (lazy loading du template)
  await page.waitForTimeout(1000);
  
  // Attendre que la modale de création soit visible
  await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { state: 'visible', timeout: 10000 });
  
  // Attendre que le formulaire soit chargé
  await page.waitForSelector('#contrib-form', { state: 'visible', timeout: 5000 });
  
  // Attendre que le stepper soit visible et initialisé
  await page.waitForSelector('#contrib-stepper', { state: 'visible', timeout: 5000 });
  
  // Attendre que l'étape 1 soit active
  await page.waitForSelector('#contrib-step-1-tab[aria-selected="true"]', { state: 'visible', timeout: 5000 });
}

/**
 * Remplir l'étape 1 du formulaire (Infos)
 * @param {import('@playwright/test').Page} page
 * @param {Object} data - { projectName, category }
 */
export async function fillStep1(page, data) {
  const { projectName, category } = data;
  
  // Vérifier qu'on est sur l'étape 1
  await page.waitForSelector('#contrib-step-1-tab[aria-selected="true"]');
  
  // Remplir le nom du projet
  await page.fill('#contrib-project-name', projectName);
  
  // Attendre que les catégories soient chargées
  const categorySelect = page.locator('#contrib-category');
  await page.waitForTimeout(1000);
  
  // Vérifier que le select n'est plus disabled et qu'il a des options
  await categorySelect.waitFor({ state: 'attached' });
  
  // Attendre que des options soient disponibles
  await page.waitForFunction(() => {
    const select = document.querySelector('#contrib-category');
    const options = select ? select.querySelectorAll('option:not([value=""])') : [];
    return options.length > 0;
  }, { timeout: 5000 });
  
  // Sélectionner la catégorie (soit par valeur, soit la première disponible)
  try {
    await page.selectOption('#contrib-category', category);
  } catch {
    // Si la catégorie n'existe pas, sélectionner la première option disponible
    const firstOption = await categorySelect.locator('option:not([value=""])').first().getAttribute('value');
    if (firstOption) {
      await page.selectOption('#contrib-category', firstOption);
    }
  }
}

/**
 * Passer à l'étape suivante
 * @param {import('@playwright/test').Page} page
 */
export async function clickNext(page) {
  // Dans la create modal, le bouton est #contrib-next (pas #contrib-next-footer)
  await page.click('#contrib-next');
  
  // Attendre un peu pour la transition
  await page.waitForTimeout(500);
}

/**
 * Revenir à l'étape précédente
 * @param {import('@playwright/test').Page} page
 */
export async function clickPrevious(page) {
  // Dans la create modal, le bouton est #contrib-prev (pas #contrib-prev-footer)
  await page.click('#contrib-prev');
  
  // Attendre un peu pour la transition
  await page.waitForTimeout(500);
}

/**
 * Uploader un fichier GeoJSON (étape 2)
 * @param {import('@playwright/test').Page} page
 * @param {string} filePath - Chemin vers le fichier GeoJSON
 */
export async function uploadGeoJSON(page, filePath) {
  // Vérifier qu'on est sur l'étape 2
  await page.waitForSelector('#contrib-step-2-tab[aria-selected="true"]');
  
  // Uploader le fichier (le vrai ID est #contrib-geojson)
  const fileInput = page.locator('#contrib-geojson');
  await fileInput.setInputFiles(filePath);
  
  // Attendre que le fichier soit chargé
  // Vérifier que le nom du fichier apparaît dans l'UI
  await page.waitForTimeout(1000);
  
  // Vérifier que le fichier est bien sélectionné
  const dzFilename = page.locator('#contrib-dz-filename');
  await dzFilename.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
    console.log('Filename element not visible, but file should be selected');
  });
}

/**
 * Remplir l'étape 3 (Options - Description et Meta)
 * @param {import('@playwright/test').Page} page
 * @param {Object} data - { description, meta, markdownContent }
 */
export async function fillStep3(page, data) {
  const { description, meta, markdownContent } = data;
  
  // Vérifier qu'on est sur l'étape 3
  await page.waitForSelector('#contrib-step-3-tab[aria-selected="true"]');
  
  if (description) {
    await page.fill('#contrib-description', description);
  }
  
  if (meta) {
    await page.fill('#contrib-meta', meta);
  }
  
  if (markdownContent) {
    // Le vrai ID est #contrib-markdown (pas #contrib-markdown-content)
    await page.fill('#contrib-markdown', markdownContent);
  }
}

/**
 * Uploader une image de couverture
 * @param {import('@playwright/test').Page} page
 * @param {string} imagePath - Chemin vers l'image
 */
export async function uploadCoverImage(page, imagePath) {
  // Le vrai ID est #contrib-cover (pas #file-cover)
  const fileInput = page.locator('#contrib-cover');
  await fileInput.setInputFiles(imagePath);
  
  // Attendre que le fichier soit sélectionné (il y a un #contrib-cover-filename qui devrait s'afficher)
  await page.waitForTimeout(1000);
}

/**
 * Remplir l'étape 4 (Liens)
 * @param {import('@playwright/test').Page} page
 * @param {Object} data - { officialLink }
 */
export async function fillStep4(page, data) {
  const { officialLink } = data;
  
  // Vérifier qu'on est sur l'étape 4
  await page.waitForSelector('#contrib-step-4-tab[aria-selected="true"]');
  
  if (officialLink) {
    // Le vrai ID est #contrib-official-url (pas #contrib-official-link)
    await page.fill('#contrib-official-url', officialLink);
  }
}

/**
 * Soumettre le formulaire
 * @param {import('@playwright/test').Page} page
 */
export async function submitForm(page) {
  // Cliquer sur le bouton Enregistrer (le vrai ID est #contrib-submit)
  await page.click('#contrib-submit');
  
  // Attendre le toast de succès (utilise role="status" pour les succès)
  await page.waitForSelector('#toast-container [role="status"]', { timeout: 15000 });
  
  // Attendre que la modale se ferme (vérifier que aria-hidden="true")
  await page.waitForFunction(() => {
    const modal = document.querySelector('#create-modal-overlay');
    return modal && modal.getAttribute('aria-hidden') === 'true';
  }, { timeout: 5000 });
}

/**
 * Rechercher une contribution dans la liste
 * @param {import('@playwright/test').Page} page
 * @param {string} searchTerm
 */
export async function searchContribution(page, searchTerm) {
  // Attendre que le champ de recherche soit visible et éditable
  const searchInput = page.locator('#contrib-search');
  await searchInput.waitFor({ state: 'visible', timeout: 10000 });
  
  // Remplir le champ
  await searchInput.fill(searchTerm);
  
  // Attendre un peu pour le debounce
  await page.waitForTimeout(500);
}

/**
 * Filtrer par catégorie
 * @param {import('@playwright/test').Page} page
 * @param {string} category
 */
export async function filterByCategory(page, category) {
  await page.selectOption('#contrib-filter-category', category);
  
  // Attendre un peu pour le debounce
  await page.waitForTimeout(500);
}

/**
 * Trier la liste
 * @param {import('@playwright/test').Page} page
 * @param {string} sortOption - Ex: "updated_at:desc", "project_name:asc"
 */
export async function sortList(page, sortOption) {
  await page.selectOption('#contrib-sort', sortOption);
  
  // Attendre un peu pour le rechargement
  await page.waitForTimeout(500);
}

/**
 * Cocher "Mes contributions uniquement"
 * @param {import('@playwright/test').Page} page
 * @param {boolean} checked
 */
export async function toggleMineOnly(page, checked = true) {
  const checkbox = page.locator('#contrib-mine-only');
  
  if (checked) {
    await checkbox.check();
  } else {
    await checkbox.uncheck();
  }
  
  // Attendre un peu pour le rechargement
  await page.waitForTimeout(500);
}

/**
 * Cliquer sur le bouton éditer d'une contribution
 * @param {import('@playwright/test').Page} page
 * @param {string} projectName - Nom du projet à éditer
 */
export async function editContribution(page, projectName) {
  // Trouver la contribution et cliquer sur éditer
  const editBtn = page.locator(`.contrib-card:has-text("${projectName}") button[title*="Modifier"]`).first();
  await editBtn.click();
  
  // Attendre que la modale d'édition s'ouvre
  await page.waitForSelector('#create-modal-overlay[aria-hidden="false"]', { state: 'visible', timeout: 10000 });
}

/**
 * Supprimer une contribution
 * @param {import('@playwright/test').Page} page
 * @param {string} projectName - Nom du projet à supprimer
 */
export async function deleteContribution(page, projectName) {
  // Trouver la contribution et cliquer sur supprimer
  const deleteBtn = page.locator(`.contrib-card:has-text("${projectName}") button[title*="Supprimer"]`).first();
  await deleteBtn.click();
  
  // Confirmer la suppression dans la modale de confirmation
  await page.click('button:has-text("Confirmer")');
  
  // Attendre le toast de succès (utilise role="status" pour les succès)
  await page.waitForSelector('#toast-container [role="status"]', { timeout: 10000 });
}

/**
 * Créer une contribution de test (avec préfixe TEST pour identification)
 * @param {import('@playwright/test').Page} page
 * @param {Object} options - Options de la contribution
 * @param {string} options.name - Nom du projet (sera préfixé par "TEST - ")
 * @param {string} options.category - Catégorie (urbanisme, mobilite, voielyonnaise)
 * @param {string} options.city - Ville (doit être "lyon" pour tests safe)
 * @returns {Promise<string>} Le nom complet avec préfixe TEST
 */
export async function createTestContribution(page, options = {}) {
  const {
    name = `Projet Test ${Date.now()}`,
    category = 'urbanisme',
    city = 'lyon'
  } = options;
  
  const testName = `TEST - ${name}`;
  
  // Ouvrir la modale de création (utilise la fonction existante)
  await openCreateModal(page);
  
  // Étape 1 : Informations de base
  await page.fill('#contrib-project-name', testName);
  
  // Attendre que les catégories soient chargées
  await page.waitForFunction(() => {
    const select = document.querySelector('#contrib-category');
    const options = select ? select.querySelectorAll('option:not([value=""])') : [];
    return options.length > 0;
  }, { timeout: 5000 });
  
  await page.selectOption('#contrib-category', category);
  
  // Passer à l'étape 2
  await page.click('#contrib-next');
  await page.waitForTimeout(500);
  
  // Étape 2 : Upload GeoJSON (fichier minimal)
  const geojsonContent = JSON.stringify({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [4.835659, 45.764043] // Lyon
      },
      properties: {
        name: testName
      }
    }]
  });
  
  // Créer un fichier temporaire
  const buffer = Buffer.from(geojsonContent);
  const fileInput = page.locator('#contrib-geojson-file');
  await fileInput.setInputFiles({
    name: 'test.geojson',
    mimeType: 'application/json',
    buffer: buffer
  });
  
  // Attendre le chargement
  await page.waitForTimeout(1000);
  
  // Passer à l'étape 3
  await page.click('#contrib-next');
  await page.waitForTimeout(500);
  
  // Étape 3 : Cover et Markdown (optionnels, on skip)
  await page.click('#contrib-next');
  await page.waitForTimeout(500);
  
  // Étape 4 : Récapitulatif - Soumettre
  await page.click('#contrib-submit');
  
  // Attendre le toast de succès (utilise role="status" pour les succès)
  await page.waitForSelector('#toast-container [role="status"]', { timeout: 10000 });
  
  // Attendre que la modale se ferme et que la liste se rafraîchisse
  await page.waitForTimeout(2000);
  
  console.log(`[Test Helper] Contribution créée: "${testName}"`);
  
  return testName;
}
