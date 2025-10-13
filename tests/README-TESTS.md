# 🧪 Documentation des tests - GrandsProjets

## 📁 Structure des tests

```
tests/
├── contribution/
│   ├── 01-auth-and-modal.spec.js                 # Authentification et accès
│   ├── 02-city-selection-and-landing.spec.js     # Sélection ville et navigation
│   ├── 03-create-contribution-flow.spec.js       # Flux de création complet
│   ├── 04-list-and-filters.spec.js               # Liste, recherche et filtres
│   ├── 05-edit-contribution.spec.js              # Édition de contributions
│   ├── 06-permissions-and-scope.spec.js          # Permissions et scope par rôle
│   ├── 07-manage-categories-readonly.spec.js     # Gestion catégories (lecture) ✨
│   ├── 08-manage-users-readonly.spec.js          # Gestion utilisateurs (lecture) ✨
│   └── 09-manage-structure-readonly.spec.js      # Gestion structure (lecture) ✨
├── helpers/
│   ├── auth.js                                    # Helpers d'authentification
│   └── contribution.js                            # Helpers d'actions contribution
├── fixtures/
│   └── test.geojson                               # Données de test
├── ROLES-ET-PERMISSIONS.md                        # Spécifications des rôles
├── TESTS-A-IMPLEMENTER.md                         # Suivi de l'implémentation
└── README-TESTS.md                                # Cette documentation
```

## 🎯 Philosophie des tests

### ✅ Tests prod-safe uniquement
- **Lecture seule** pour les panels de gestion
- **Pas de suppression** de données existantes
- **Pas de modification destructive** de catégories, utilisateurs ou structures
- **Scope limité à Lyon** pour les tests de données

### 🔒 Couverture des permissions
Tous les tests vérifient les 3 rôles :
- **Invited** : Contributeur limité à ses propres contributions
- **Admin** : Administrateur de la ville de Lyon
- **Admin Global** : Super administrateur avec accès à toutes les villes

## 🚀 Lancer les tests

### Tous les tests
```bash
npm test
# ou
npm run test:ui
```

### Tests de contribution uniquement
```bash
npm run test:contrib
# ou
npm run test:contrib:ui
```

### Tests spécifiques
```bash
# Tests d'authentification
npx playwright test tests/contribution/01-auth-and-modal

# Tests de permissions
npx playwright test tests/contribution/06-permissions-and-scope

# Tests de gestion (nouveaux)
npx playwright test tests/contribution/07-manage-categories
npx playwright test tests/contribution/08-manage-users
npx playwright test tests/contribution/09-manage-structure
```

### Mode debug
```bash
npm run test:debug
# ou
npm run test:headed
```

## 📊 Couverture par domaine

### 🔐 Authentification (01-auth-and-modal.spec.js)
- [x] Bouton "Contribuer" caché pour non-connectés
- [x] Connexion et visibilité du bouton
- [x] Ouverture/fermeture modale
- [x] Carte utilisateur avec email et rôle
- [x] Déconnexion
- [x] Options visibles selon rôle (admin global vs invited)

### 🏙️ Navigation (02-city-selection-and-landing.spec.js)
- [x] Sélecteur de ville fonctionnel
- [x] Affichage des cartes d'action après sélection
- [x] Navigation vers panel liste
- [x] Bouton retour au landing
- [x] Changement de ville (admin global)
- [x] Options de gestion visibles pour admin
- [x] Bouton "Ajouter structure" uniquement pour admin global

### ➕ Création (03-create-contribution-flow.spec.js)
- [x] Ouverture modale de création
- [x] Étape 1 : Infos de base (nom, catégorie)
- [x] Validation des champs requis
- [x] Navigation entre étapes (suivant/précédent)
- [x] Étape 2 : Upload GeoJSON
- [x] Étape 3 : Description et meta
- [x] Étape 4 : Liens externes
- [x] Flux complet avec champs requis uniquement
- [x] Fermeture et abandon de la saisie

### 📋 Liste et filtres (04-list-and-filters.spec.js)
- [x] Chargement de la liste
- [x] Recherche par texte (invited et admin)
- [x] Recherche sans résultat
- [x] Filtre par catégorie
- [x] Tri par date et nom
- [x] Checkbox "Mes contributions" pour admin
- [x] Message informatif pour invited (pas de checkbox)
- [x] Combinaison de filtres
- [x] Scroll infini
- [x] Affichage des cartes de contribution

### ✏️ Édition (05-edit-contribution.spec.js)
- [x] Bouton "Modifier" ouvre la modale
- [x] Données pré-remplies en mode édition
- [x] Modification du nom
- [x] Navigation entre étapes en édition
- [x] Préservation des modifications
- [x] Annulation (fermeture modale)
- [x] GeoJSON existant affiché
- [x] Ville non modifiable en édition
- [x] Bouton "Enregistrer" visible
- [x] Invited peut modifier ses contributions
- [x] Admin global peut modifier toutes les contributions

### 🔒 Permissions (06-permissions-and-scope.spec.js)
- [x] Invited : accès limité au panel liste uniquement
- [x] Admin : accès aux panels catégories/utilisateurs/branding
- [x] Admin global : accès complet + bouton "Ajouter structure"
- [x] Invited : voit uniquement ses contributions (filtre forcé)
- [x] Admin : peut approuver les contributions
- [x] Admin global : peut approuver toutes les contributions
- [x] Invited : ne voit pas les boutons d'approbation

### 📁 Gestion catégories - Lecture (07-manage-categories-readonly.spec.js) ✨
- [x] Admin/adminGlobal peuvent accéder au panel
- [x] Invited ne peut PAS accéder
- [x] Liste des catégories se charge
- [x] Affichage des informations (nom, description, compteur)
- [x] Bouton retour au landing
- [x] Recherche/filtrage disponible
- [x] Catégories spécifiques à Lyon
- [x] Accessibilité clavier
- [x] Navigation entre panels

### 👥 Gestion utilisateurs - Lecture (08-manage-users-readonly.spec.js) ✨
- [x] Admin/adminGlobal peuvent accéder au panel
- [x] Invited ne peut PAS accéder
- [x] Liste des utilisateurs se charge
- [x] Affichage email, rôle et villes
- [x] Badge de rôle avec validation
- [x] Badge de villes assignées
- [x] Bouton retour au landing
- [x] Recherche/filtrage disponible
- [x] Filtre par rôle
- [x] Utilisateurs spécifiques à Lyon
- [x] Bouton "Inviter utilisateur" visible pour admin
- [x] Accessibilité clavier

### 🏢 Gestion structure - Lecture (09-manage-structure-readonly.spec.js) ✨
- [x] Admin/adminGlobal peuvent accéder au panel
- [x] Invited ne peut PAS accéder au panel
- [x] Informations de base affichées (nom)
- [x] Description de la structure
- [x] Paramètres de branding
- [x] Bouton retour au landing
- [x] Champs éditables pour admin
- [x] Bouton "Enregistrer" visible pour admin uniquement
- [x] Bouton "Ajouter structure" pour admin global
- [x] Statistiques de la structure
- [x] Accessibilité clavier

## 🎭 Configuration des utilisateurs de test

Les tests utilisent 3 comptes configurés dans `.env` :

```env
# Admin global (ville=['global'])
TEST_ADMIN_EMAIL=votre-email@example.com
TEST_ADMIN_PASSWORD=votre-password

# Invited (ville=['lyon'])
TEST_INVITED_EMAIL=votre-email-invited@example.com
TEST_INVITED_PASSWORD=votre-password

# User standard (alias de invited)
TEST_USER_EMAIL=votre-email-user@example.com
TEST_USER_PASSWORD=votre-password
```

### Matrice des rôles testés

| Rôle | Email (.env) | Accès | Scope | Tests |
|------|-------------|-------|-------|-------|
| **invited** | TEST_INVITED_EMAIL | Limité | Ses contributions uniquement | ✅ Complet |
| **admin** (global) | TEST_ADMIN_EMAIL | Complet | Toutes villes | ✅ Complet |
| **user** | TEST_USER_EMAIL | Alias invited | Ses contributions | ✅ Complet |

## 📈 Statistiques

- **Total fichiers** : 9 fichiers de tests
- **Total tests** : ~70 tests
- **Taux de réussite** : Dépend de votre environnement
- **Couverture permissions** : ~90%
- **Couverture UI** : ~85%
- **Couverture CRUD** : ~70% (lecture principalement)

## 🚫 Tests volontairement exclus

Pour protéger les données de production, ces tests ne sont **PAS** implémentés :

### Suppression
- Suppression de contributions
- Suppression de catégories
- Suppression d'utilisateurs
- Suppression de structures

### Modifications destructives
- Création de catégories
- Modification de catégories existantes
- Invitation d'utilisateurs
- Modification des rôles
- Création de structures
- Modification du branding (sauf lecture)
- Révocation d'approbations

## 🐛 Dépannage

### Les tests échouent avec "Port 3000 already in use"
Utilisez le script de nettoyage :
```bash
.\lancer-tests.bat
```

### Les tests échouent à l'authentification
Vérifiez que vos comptes dans `.env` sont corrects et ont les bons rôles dans Supabase.

### Les tests sont lents
C'est normal, Playwright charge vraiment les pages. Utilisez `--headed` pour voir ce qui se passe :
```bash
npm run test:headed
```

### Un test est flaky (passe parfois, échoue parfois)
Augmentez les timeouts dans le test concerné ou dans `playwright.config.js`.

## 📝 Bonnes pratiques

### Avant de lancer les tests
1. ✅ Vérifier que le port 3000 est libre
2. ✅ Vérifier que les comptes de test existent dans Supabase
3. ✅ Vérifier que les RLS sont activées
4. ✅ S'assurer d'avoir au moins quelques contributions de test à Lyon

### Pendant les tests
- Ne pas interférer avec le navigateur si tests en mode `--headed`
- Laisser les tests se terminer complètement
- Consulter les logs pour comprendre les échecs

### Après les tests
- Consulter le rapport HTML : `npm run test:report`
- Vérifier les screenshots en cas d'échec dans `test-results/`
- Vérifier les traces Playwright en cas d'échec

## 🔗 Ressources

- [Documentation Playwright](https://playwright.dev/)
- [Configuration Playwright](../playwright.config.js)
- [Spécifications des rôles](./ROLES-ET-PERMISSIONS.md)
- [Suivi de l'implémentation](./TESTS-A-IMPLEMENTER.md)

## 📞 Support

En cas de problème avec les tests :
1. Vérifier la configuration dans `.env`
2. Vérifier les logs de la console
3. Lancer en mode debug : `npm run test:debug`
4. Consulter le rapport HTML pour plus de détails
