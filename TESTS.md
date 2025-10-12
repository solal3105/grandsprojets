# 🧪 Guide des tests Playwright - GrandsProjets

Ce guide vous explique comment utiliser les tests automatiques mis en place pour tester votre système de contribution.

## 📋 Table des matières

- [Installation](#installation)
- [Configuration](#configuration)
- [Lancer les tests](#lancer-les-tests)
- [Tests disponibles](#tests-disponibles)
- [Créer de nouveaux tests](#créer-de-nouveaux-tests)
- [Débogage](#débogage)
- [CI/CD](#cicd)

---

## 🚀 Installation

### 1. Installer les dépendances

```powershell
npm install
```

### 2. Installer les navigateurs Playwright

```powershell
npx playwright install
```

Cela télécharge Chromium, Firefox et WebKit pour les tests.

---

## ⚙️ Configuration

### Variables d'environnement

Créez un fichier `.env` à la racine du projet :

```powershell
copy .env.example .env
```

Puis éditez `.env` avec vos vrais comptes de test :

```env
# Utilisateur admin (accès complet)
TEST_ADMIN_EMAIL=votre-admin@test.local
TEST_ADMIN_PASSWORD=VotreMotDePasse123!

# Utilisateur invité (accès limité)
TEST_INVITED_EMAIL=votre-invite@test.local
TEST_INVITED_PASSWORD=VotreMotDePasse123!

# Utilisateur standard
TEST_USER_EMAIL=votre-user@test.local
TEST_USER_PASSWORD=VotreMotDePasse123!
```

⚠️ **Important** : Ces comptes doivent exister dans votre base Supabase avec les bons rôles.

### Créer les utilisateurs de test dans Supabase

1. Connectez-vous à votre console Supabase
2. Allez dans **Authentication** > **Users**
3. Créez les 3 utilisateurs (admin, invited, user)
4. Dans la table `profiles`, configurez leurs rôles et villes :

```sql
-- Admin avec accès global
UPDATE profiles 
SET role = 'admin', ville = ARRAY['global']
WHERE email = 'votre-admin@test.local';

-- Invité avec accès à Lyon
UPDATE profiles 
SET role = 'invited', ville = ARRAY['lyon']
WHERE email = 'votre-invite@test.local';

-- User avec accès à Lyon
UPDATE profiles 
SET role = 'user', ville = ARRAY['lyon']
WHERE email = 'votre-user@test.local';
```

---

## 🎯 Lancer les tests

### Tous les tests

```powershell
npm test
```

### Mode UI (recommandé pour débuter)

```powershell
npm run test:ui
```

Ouvre une interface graphique interactive où vous pouvez :
- ✅ Voir tous les tests
- ▶️ Les lancer un par un ou en groupe
- 🎬 Voir le navigateur rejouer les actions
- 🐛 Déboguer en direct

### Tests des contributions uniquement

```powershell
npm run test:contrib
```

### Mode debug (pas à pas)

```powershell
npm run test:debug
```

### Tests avec navigateur visible

```powershell
npm run test:headed
```

### Voir le rapport HTML des derniers tests

```powershell
npm run test:report
```

---

## 📝 Tests disponibles

### 1. Authentification et modale (`01-auth-and-modal.spec.js`)

**Scénarios testés :**
- ✅ Le bouton "Contribuer" est caché pour les non-connectés
- ✅ Connexion et visibilité du bouton
- ✅ Ouverture de la modale
- ✅ Fermeture avec bouton X et ESC
- ✅ Carte utilisateur avec infos correctes
- ✅ Déconnexion
- ✅ Options selon les rôles (admin vs invité)

**Lancer uniquement ces tests :**
```powershell
npx playwright test 01-auth-and-modal
```

### 2. Sélection de ville et landing (`02-city-selection-and-landing.spec.js`)

**Scénarios testés :**
- ✅ Sélecteur de ville fonctionnel
- ✅ Affichage des cartes d'action après sélection
- ✅ Navigation vers "Modifier mes contributions"
- ✅ Bouton Retour
- ✅ Changement de ville
- ✅ Bouton "Ajouter une structure" (admin)
- ✅ Accessibilité au clavier
- ✅ Persistence du choix

**Lancer uniquement ces tests :**
```powershell
npx playwright test 02-city-selection
```

### 3. Flux de création complet (`03-create-contribution-flow.spec.js`)

**Scénarios testés :**
- ✅ Ouverture modale de création
- ✅ Étape 1 : Infos de base (nom + catégorie)
- ✅ Validation des champs requis
- ✅ Navigation entre étapes (suivant/précédent)
- ✅ Étape 2 : Upload GeoJSON
- ✅ Étape 3 : Description, meta, markdown
- ✅ Étape 4 : Liens externes
- ✅ Flux complet minimial
- ✅ Fermeture en cours de saisie

**Lancer uniquement ces tests :**
```powershell
npx playwright test 03-create-contribution
```

### 4. Liste et filtres (`04-list-and-filters.spec.js`)

**Scénarios testés :**
- ✅ Chargement de la liste
- ✅ Recherche textuelle
- ✅ Recherche sans résultat
- ✅ Filtre par catégorie
- ✅ Tri par date (récentes/anciennes)
- ✅ Tri par nom (A→Z, Z→A)
- ✅ Filtre "Mes contributions uniquement"
- ✅ Combinaison de filtres
- ✅ Scroll infini
- ✅ Réinitialisation des filtres

**Lancer uniquement ces tests :**
```powershell
npx playwright test 04-list-and-filters
```

### 5. Édition de contribution (`05-edit-contribution.spec.js`)

**Scénarios testés :**
- ✅ Ouverture modale d'édition
- ✅ Pré-remplissage des données
- ✅ Modification du nom
- ✅ Navigation entre étapes en édition
- ✅ Préservation des modifications
- ✅ Annulation (fermeture modale)
- ✅ Affichage GeoJSON existant
- ✅ Ville non modifiable
- ✅ Bouton "Mettre à jour"

**Lancer uniquement ces tests :**
```powershell
npx playwright test 05-edit-contribution
```

---

## 🆕 Créer de nouveaux tests

### 1. Créer un nouveau fichier de test

```powershell
# Dans tests/contribution/
New-Item -Path "tests/contribution/06-mon-test.spec.js" -ItemType File
```

### 2. Structure de base

```javascript
import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import { openContributionModal, selectCity } from '../helpers/contribution.js';

test.describe('Mon nouveau test', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.user);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
  });

  test('Mon scénario de test', async ({ page }) => {
    // Votre code de test ici
    
    // Exemple : cliquer sur un bouton
    await page.click('#mon-bouton');
    
    // Exemple : vérifier qu'un élément est visible
    await expect(page.locator('#mon-element')).toBeVisible();
    
    // Exemple : vérifier un texte
    await expect(page.locator('.mon-titre')).toHaveText('Titre attendu');
  });
});
```

### 3. Utiliser le Codegen pour générer des tests

```powershell
npm run test:codegen
```

Une fenêtre s'ouvre :
1. Cliquez sur votre site normalement
2. Playwright génère le code automatiquement
3. Copiez-collez le code dans votre fichier de test

---

## 🐛 Débogage

### Voir les screenshots et vidéos d'échecs

Après un test échoué, ouvrez le rapport :

```powershell
npm run test:report
```

Vous verrez :
- 📸 Screenshots de chaque échec
- 🎥 Vidéos du test qui a échoué
- 📝 Logs détaillés de chaque action

### Mode debug pas à pas

```powershell
npm run test:debug
```

Cela ouvre l'inspecteur Playwright :
- ⏯️ Avancez ligne par ligne
- 🔍 Inspectez le DOM à chaque étape
- 🖱️ Testez des sélecteurs en direct

### Ajouter des pauses dans vos tests

```javascript
test('Mon test avec pause', async ({ page }) => {
  await page.goto('/');
  
  // Le navigateur se met en pause ici
  await page.pause();
  
  // Vous pouvez inspecter manuellement, puis reprendre
  await page.click('#mon-bouton');
});
```

### Prendre des screenshots manuels

```javascript
test('Mon test avec screenshot', async ({ page }) => {
  await page.goto('/');
  
  // Screenshot de la page entière
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
  
  // Screenshot d'un élément spécifique
  await page.locator('#mon-element').screenshot({ path: 'element-screenshot.png' });
});
```

---

## 🔧 Configuration avancée

### Lancer les tests sur un seul navigateur

```powershell
# Chromium uniquement
npx playwright test --project=chromium

# Firefox uniquement
npx playwright test --project=firefox

# WebKit (Safari) uniquement
npx playwright test --project=webkit
```

### Lancer un test spécifique

```powershell
# Par nom de fichier
npx playwright test 01-auth-and-modal

# Par nom de test
npx playwright test -g "Le bouton Contribuer"
```

### Mode parallèle vs séquentiel

```powershell
# Séquentiel (1 test à la fois)
npx playwright test --workers=1

# Parallèle (4 tests en même temps)
npx playwright test --workers=4
```

---

## 🚀 CI/CD avec Netlify

### Ajouter les tests au processus de build

Éditez `netlify.toml` :

```toml
[build]
  command = "npm install && npx playwright install --with-deps chromium && npm test && npm run build"
  publish = "."

[build.environment]
  # Variables d'environnement pour les tests
  TEST_ADMIN_EMAIL = "admin@test.local"
  TEST_ADMIN_PASSWORD = "xxx"
  TEST_USER_EMAIL = "user@test.local"
  TEST_USER_PASSWORD = "xxx"
```

⚠️ **Important** : Ne committez jamais les mots de passe ! Utilisez les variables d'environnement Netlify dans l'interface web.

### Ignorer les tests sur certaines branches

Dans `playwright.config.js`, ajoutez :

```javascript
// Ne pas lancer les tests sur les branches de preview
forbidOnly: !!process.env.CI && process.env.CONTEXT === 'production',
```

---

## 📊 Bonnes pratiques

### ✅ À faire

- **Toujours vérifier les assertions** : utilisez `expect()` systématiquement
- **Attendre les éléments** : utilisez `waitForSelector()` pour les éléments dynamiques
- **Nettoyer après les tests** : supprimez les données créées
- **Nommer clairement** : donnez des noms de tests explicites
- **Tester les cas d'erreur** : ne testez pas que le happy path

### ❌ À éviter

- **Hardcoder des IDs de base de données** : utilisez des noms ou créez des données de test
- **Sleep arbitraires** : préférez `waitForSelector()` à `waitForTimeout()`
- **Tests dépendants** : chaque test doit pouvoir tourner indépendamment
- **Sélecteurs fragiles** : préférez `data-testid` aux classes CSS changeantes

---

## 🎓 Ressources

- [Documentation Playwright](https://playwright.dev/docs/intro)
- [API Reference](https://playwright.dev/docs/api/class-test)
- [Exemples Playwright](https://github.com/microsoft/playwright/tree/main/examples)
- [Discord Playwright](https://discord.gg/playwright-807756831384403968)

---

## 🆘 Problèmes fréquents

### "Browser not found"

```powershell
npx playwright install
```

### "Timeout waiting for selector"

Augmentez le timeout :

```javascript
await page.waitForSelector('#mon-element', { timeout: 30000 }); // 30 secondes
```

### "Test failed but I don't see why"

Ouvrez le rapport HTML :

```powershell
npm run test:report
```

### Les tests passent en local mais échouent en CI

- Vérifiez les variables d'environnement
- Vérifiez que les utilisateurs de test existent en production
- Augmentez les timeouts pour les environnements lents

---

## 📞 Support

Pour toute question sur les tests :

1. Vérifiez ce guide
2. Consultez la [documentation Playwright](https://playwright.dev)
3. Ouvrez une issue avec le label `tests`

---

**Bon testing ! 🎉**
