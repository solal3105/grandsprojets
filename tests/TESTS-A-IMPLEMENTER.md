# 🧪 Tests à implémenter

## ✅ Tests déjà implémentés

### 01-auth-and-modal.spec.js
- [x] Authentification et ouverture modale (tous rôles)

### 02-city-selection-and-landing.spec.js
- [x] Sélection de ville et navigation landing
- [x] Admin voit les options de gestion
- [x] Bouton "Ajouter une structure" pour admin global

### 03-create-contribution-flow.spec.js
- [x] Flux de création complet (tous rôles)

### 04-list-and-filters.spec.js
- [x] Liste des contributions se charge
- [x] Recherche pour invited
- [x] Recherche pour admin
- [x] Filtre "Mes contributions uniquement" pour admin
- [x] Message pour invited (pas de checkbox)

### 05-edit-contribution.spec.js
- [x] Édition de contribution

### 06-permissions-and-scope.spec.js
- [x] Tests de permissions UI par rôle
- [x] Tests de scope et visibilité
- [x] Tests d'approbation par rôle

### 07-manage-categories-readonly.spec.js ✨ **NOUVEAU**
- [x] Accès au panel catégories (admin/adminGlobal)
- [x] Refus d'accès pour invited
- [x] Liste des catégories se charge
- [x] Affichage des informations catégories
- [x] Navigation et retour au landing
- [x] Recherche/filtrage catégories
- [x] Scope ville (catégories spécifiques à Lyon)
- [x] Accessibilité clavier

### 08-manage-users-readonly.spec.js ✨ **NOUVEAU**
- [x] Accès au panel utilisateurs (admin/adminGlobal)
- [x] Refus d'accès pour invited
- [x] Liste des utilisateurs se charge
- [x] Affichage email, rôle et villes
- [x] Navigation et retour au landing
- [x] Recherche/filtrage utilisateurs
- [x] Scope ville (utilisateurs spécifiques à Lyon)
- [x] Accessibilité clavier

### 09-manage-structure-readonly.spec.js ✨ **NOUVEAU**
- [x] Accès au panel structure (admin/adminGlobal uniquement)
- [x] Refus d'accès pour invited
- [x] Affichage informations de base
- [x] Affichage branding
- [x] Champs éditables pour admin
- [x] Bouton "Enregistrer" visible pour admin uniquement
- [x] Bouton "Ajouter structure" pour admin global
- [x] Navigation et accessibilité

---

## ❌ Tests manquants (volontairement exclus - destructifs en prod)

### 02-city-selection-and-landing.spec.js
- [x] **Admin global** : Peut voir le bouton "Gérer les villes"
- [x] **Admin** : Ne peut PAS voir le bouton "Ajouter une structure"
- [x] **Admin** : Ne peut PAS voir le bouton "Gérer les villes"

### 04-list-and-filters.spec.js
- [x] **Invited** : Ne voit QUE ses contributions (→ 06-permissions-and-scope.spec.js)
- [~] **Admin** : Voit toutes les contributions de sa ville uniquement (skip - nécessite admin ville)
- [x] **Admin global** : Voit les contributions de toutes les villes
- [x] **Admin** : Peut approuver les contributions (→ 06-permissions-and-scope.spec.js)
- [x] **Admin global** : Peut approuver les contributions (→ 06-permissions-and-scope.spec.js)

### 05-edit-contribution.spec.js
- [x] **Invited** : Peut modifier uniquement ses contributions
- [x] **Invited** : Ne peut PAS modifier les contributions des autres (vérifié via scope forcé)
- [~] **Admin** : Peut modifier toutes les contributions de sa ville (skip - nécessite admin ville)
- [~] **Admin** : Ne peut PAS modifier les contributions d'une autre ville (skip - nécessite admin ville)
- [x] **Admin global** : Peut modifier les contributions de toutes les villes

### ❌ Tests volontairement NON implémentés (destructifs en production)

#### Suppression de contributions
- [ ] **Invited** : Peut supprimer ses propres contributions
- [ ] **Invited** : Ne peut PAS supprimer les contributions des autres
- [ ] **Admin** : Peut supprimer toutes les contributions de sa ville
- [ ] **Admin global** : Peut supprimer toutes les contributions

#### Gestion des catégories (modification/suppression)
- [ ] **Admin** : Peut créer une catégorie
- [ ] **Admin** : Peut modifier une catégorie existante
- [ ] **Admin** : Peut supprimer une catégorie

#### Gestion des utilisateurs (modification)
- [ ] **Admin** : Peut inviter un utilisateur
- [ ] **Admin** : Peut modifier le rôle d'un utilisateur
- [ ] **Admin** : Ne peut PAS rétrograder un autre admin
- [ ] **Admin global** : Peut rétrograder/promouvoir des utilisateurs

#### Gestion des structures (création/suppression)
- [ ] **Admin global** : Peut créer une nouvelle structure
- [ ] **Admin global** : Peut supprimer une structure
- [ ] **Admin** : Peut modifier le branding de sa structure

#### Révocation d'approbation
- [ ] **Admin** : Peut révoquer l'approbation d'une contribution
- [ ] **Admin global** : Peut révoquer l'approbation d'une contribution

---

## 📝 Résumé de l'implémentation

### P0 - Critique (sécurité)
1. ✅ Vérifier que invited ne voit QUE ses contributions
2. ⏸️ Vérifier que admin ne voit QUE les contributions de sa ville (skip - nécessite compte admin ville)
3. ✅ Vérifier que invited ne peut PAS modifier les contributions des autres

### P1 - Important (fonctionnalités)
1. ✅ Tests d'approbation pour admin et admin global
2. ✅ Tests de scope pour admin global
3. ✅ Tests de permissions UI (boutons visibles/cachés)

### P2 - Nice to have (complétude)
1. ✅ Tests des panneaux de gestion (lecture seule)
2. ✅ Tests de navigation entre panels
3. ✅ Tests d'accessibilité clavier

---

## 📊 Résumé de l'implémentation

### ✅ Tests implémentés (prod-safe, lecture seule)

**Total : 9 fichiers de tests | ~70 tests**

#### Authentification et accès (01-auth-and-modal.spec.js)
- Authentification par rôle
- Visibilité du bouton "Contribuer"
- Ouverture/fermeture modale
- Affichage carte utilisateur

#### Navigation (02-city-selection-and-landing.spec.js)
- Sélection de ville
- Affichage des cartes selon rôle
- Bouton "Ajouter structure" pour admin global

#### Création (03-create-contribution-flow.spec.js)
- Flux complet de création
- Navigation entre étapes
- Upload GeoJSON
- Validation des champs

#### Liste et filtres (04-list-and-filters.spec.js)
- Liste des contributions
- Recherche et filtres
- Tri
- Checkbox "Mes contributions" selon rôle

#### Édition (05-edit-contribution.spec.js)
- Édition de contribution
- Pré-remplissage des données
- Navigation dans le formulaire
- Permissions par rôle

#### Permissions et scope (06-permissions-and-scope.spec.js)
- Accès aux panels selon rôle
- Boutons d'approbation
- Scope de visibilité
- Messages informatifs

#### Gestion catégories - Lecture (07-manage-categories-readonly.spec.js) ✨
- Accès au panel par rôle
- Liste des catégories
- Recherche/filtrage
- Scope ville

#### Gestion utilisateurs - Lecture (08-manage-users-readonly.spec.js) ✨
- Accès au panel par rôle
- Liste des utilisateurs
- Affichage email, rôle, villes
- Scope ville

#### Gestion structure - Lecture (09-manage-structure-readonly.spec.js) ✨
- Accès au panel (admin/adminGlobal uniquement)
- Refus d'accès pour invited
- Affichage informations
- Champs éditables pour admin
- Bouton "Ajouter structure" pour admin global

### 🔒 Couverture par rôle

- **Invited** : Scope limité ✅, Pas d'accès panels gestion ✅, Modification ses contributions ✅
- **Admin** : Accès panels gestion ✅, Scope Lyon ✅, Approbation ✅
- **Admin global** : Accès complet ✅, Scope global ✅, Création structure (UI) ✅

### ⏸️ Tests skipped (nécessitent un compte admin ville)
- Admin ville : Scope limité à sa ville
- Admin ville : Ne peut pas accéder aux autres villes
- Admin ville : Boutons de gestion visibles mais pas "Gérer les villes"

### 📝 Pour activer les tests skipped
Ajouter dans `.env` :
```env
TEST_ADMIN_CITY_EMAIL=solal.gendrin+testadmincity@gmail.com
TEST_ADMIN_CITY_PASSWORD=XR12@12,123456
```

Puis retirer les `.skip()` des tests concernés.
