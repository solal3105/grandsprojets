# Plan de tests — Espace administrateur

> **Objectif** : Couvrir exhaustivement l'admin (`/admin/`) avec Playwright.
> **2 comptes de test** sur une ville dédiée :
> - `admin@test` — rôle `admin`, accès à toutes les sections
> - `invited@test` — rôle `invited` (contributeur), accès limité

## État d'implémentation

| Section | Fichier | Tests | Statut |
|---|---|---|---|
| 0 · Auth & boot | `auth.setup.js`, `unauth.redirect.spec.js`, `admin.boot-nav.spec.js`, `admin.z-logout.spec.js` | 28 | ✅ Complet |
| 1 · Sidebar & nav | `admin.boot-nav.spec.js`, `invited.boot-nav.spec.js` | (inclus dans §0) | ✅ Complet |
| 2 · Contributions | `admin.contributions.spec.js`, `invited.contributions.spec.js` | 29 (1 skipped WebGL) | ✅ Complet |
| 3 · Catégories | `admin.categories.spec.js` | 16 | ✅ Complet |
| 4 · Utilisateurs | `admin.users.spec.js` | 17 | ✅ Complet |
| 5 · Travaux | `admin.travaux.spec.js` | 10 | ✅ Complet |
| 6 · Structure | `admin.structure.spec.js` | 20 | ✅ Complet |
| 7 · Composants transversaux | `admin.resilience.spec.js` | 4 | ✅ Partiel (couverts aussi indirectement) |
| 8 · Changement de ville | — | 0 | ⏭️ Skippé (nécessite 2e ville test) |
| 9 · Résilience | `admin.resilience.spec.js` | 5 | ✅ Complet |
| **Total** | | **~130** | |

### Bugs découverts et corrigés par les tests

- **`supabaseservice.js` l.51** : `sanitizeCity` rejetait les codes avec chiffres (`/^[a-z-]+$/i` → `/^[a-z0-9-]+$/i`)
- **`admin/sections/structure.js` `_doSave`** : `logo_url`, `dark_logo_url`, `favicon_url` envoyés comme `null` au lieu de `''` quand vides → violation NOT NULL constraint Supabase

---

## 0 · Authentification & boot

### 0.1 — Redirection non-authentifié
| # | Scénario | Attendu |
|---|----------|---------|
| 0.1.1 | Accéder à `/admin/` sans session | Redirect vers `/login/?redirect=/admin/` |
| 0.1.2 | Accéder à une sous-route (`/admin/categories/`) sans session | Redirect login avec bon `redirect` |
| 0.1.3 | Session expirée (token invalide) | Redirect vers `/login/` |

### 0.2 — Login et initialisation
| # | Scénario | Attendu |
|---|----------|---------|
| 0.2.1 | Login admin → arrivée sur `/admin/` | Splash disparaît, sidebar affichée, section contributions chargée |
| 0.2.2 | Login invited → arrivée sur `/admin/` | Splash disparaît, contributions chargées |
| 0.2.3 | Vérifier email affiché dans `#adm-user-email` | Correspond au compte connecté |
| 0.2.4 | Vérifier badge rôle dans `#adm-user-role` | "Admin" ou "Contributeur" selon le compte |

### 0.3 — Déconnexion
| # | Scénario | Attendu |
|---|----------|---------|
| 0.3.1 | Clic sur le bouton déconnexion (`#adm-logout`) | Redirect vers `/login/` |
| 0.3.2 | Après déconnexion, accéder à `/admin/` | Redirect vers `/login/` (session détruite) |

---

## 1 · Sidebar & navigation

### 1.1 — Visibilité des liens par rôle

#### Rôle admin
| # | Scénario | Attendu |
|---|----------|---------|
| 1.1.1 | Lien "Contributions" visible | ✅ Visible |
| 1.1.2 | Lien "Travaux" visible (`data-role="admin"`) | ✅ Visible |
| 1.1.3 | Lien "Catégories" visible (`data-role="admin"`) | ✅ Visible |
| 1.1.4 | Lien "Utilisateurs" visible (`data-role="admin"`) | ✅ Visible |
| 1.1.5 | Lien "Structure" visible (`data-role="admin"`) | ✅ Visible |
| 1.1.6 | Lien "Villes" masqué (`data-role="global"`) | ❌ Masqué (admin non-global) |

#### Rôle invited
| # | Scénario | Attendu |
|---|----------|---------|
| 1.1.7 | Lien "Contributions" visible | ✅ Visible |
| 1.1.8 | Lien "Travaux" masqué | ❌ `hidden` |
| 1.1.9 | Lien "Catégories" masqué | ❌ `hidden` |
| 1.1.10 | Lien "Utilisateurs" masqué | ❌ `hidden` |
| 1.1.11 | Lien "Structure" masqué | ❌ `hidden` |
| 1.1.12 | Lien "Villes" masqué | ❌ `hidden` |

### 1.2 — Navigation entre sections (admin)
| # | Scénario | Attendu |
|---|----------|---------|
| 1.2.1 | Clic "Contributions" dans la sidebar | URL = `/admin/contributions/`, section rendue, lien `.active` |
| 1.2.2 | Clic "Travaux" | URL = `/admin/travaux/`, section rendue |
| 1.2.3 | Clic "Catégories" | URL = `/admin/categories/`, section rendue |
| 1.2.4 | Clic "Utilisateurs" | URL = `/admin/utilisateurs/` |
| 1.2.5 | Clic "Structure" | URL = `/admin/structure/` |
| 1.2.6 | Back/forward du navigateur | Section correcte re-rendue |
| 1.2.7 | URL directe `/admin/categories/` → refresh | Section catégories chargée au boot |

### 1.3 — Accès direct URL par rôle invited
| # | Scénario | Attendu |
|---|----------|---------|
| 1.3.1 | Invited accède à `/admin/categories/` directement | Le routeur rend la section normalement (pas de guard côté routeur). La page s'affiche — vérifier si les données chargent ou si l'API renvoie une erreur RLS |
| 1.3.2 | Invited accède à `/admin/utilisateurs/` directement | Idem — la section se rend, les données peuvent charger selon les RLS |
| 1.3.3 | Invited accède à `/admin/travaux/` directement | Idem |
| 1.3.4 | Invited accède à `/admin/structure/` directement | Idem |

### 1.4 — Sélecteur de ville
| # | Scénario | Attendu |
|---|----------|---------|
| 1.4.1 | Le select `#adm-city-select` contient la ville de test | Option présente et sélectionnée |
| 1.4.2 | La carte "Voir la carte" (`#adm-map-card`) pointe vers `/?city=<ville>` | `href` correct |
| 1.4.3 | Le nom de la ville apparaît dans `#adm-map-card-city` | Nom branding ou code ville |

### 1.5 — Mobile
| # | Scénario | Attendu |
|---|----------|---------|
| 1.5.1 | En viewport mobile (375px), sidebar masquée initialement | Sidebar n'a pas la class `open` |
| 1.5.2 | Clic sur le burger `#adm-menu-toggle` | Sidebar s'ouvre (class `open`), overlay visible |
| 1.5.3 | Clic sur un lien nav en mobile | Sidebar se referme, section change |
| 1.5.4 | Clic sur l'overlay | Sidebar se referme |

---

## 2 · Contributions

### 2.1 — Liste (admin)
| # | Scénario | Attendu |
|---|----------|---------|
| 2.1.1 | Arrivée sur `/admin/contributions/` | Titre "Contributions", sous-titre contient le nom de la ville, bouton "Nouvelle contribution" visible |
| 2.1.2 | Liste des contributions chargée | Skeletons → items rendus (`#contrib-list-body` non vide) |
| 2.1.3 | Chaque item affiche : nom, catégorie, date relative, badge statut | Vérifier la présence des éléments |
| 2.1.4 | Item approuvé : badge "Approuvée" (vert) | `.adm-badge--success` |
| 2.1.5 | Item en attente : badge "En attente" (jaune) | `.adm-badge--warning` |
| 2.1.6 | Boutons actions admin : approuver, détails (👁), supprimer (🗑) visibles | `data-action="approve"`, `data-action="detail"`, `data-action="delete"` |
| 2.1.7 | Bouton approuver absent si contribution déjà approuvée → bouton "Retirer" à la place | `data-action="unapprove"` avec icône `fa-rotate-left` |

### 2.2 — Filtres et recherche
| # | Scénario | Attendu |
|---|----------|---------|
| 2.2.1 | Onglet "Toutes" actif par défaut | `.adm-tab.active` data-status="" |
| 2.2.2 | Clic onglet "En attente" | Seuls les items non-approuvés affichés |
| 2.2.3 | Clic onglet "Approuvées" | Seuls les items approuvés affichés |
| 2.2.4 | Retour onglet "Toutes" | Tous les items affichés |
| 2.2.5 | Saisir dans la recherche (`#contrib-search`) | Liste filtrée après 350ms debounce |
| 2.2.6 | Filtre catégorie (`#contrib-filter-cat`) | Select peuplé des catégories, filtrage effectif |
| 2.2.7 | Tri "Plus récent" / "Plus ancien" / "Nom A-Z" | Ordre change dans la liste |
| 2.2.8 | Recherche sans résultat | Empty state "Aucune contribution" affiché |

### 2.3 — Approuver / Désapprouver (admin only)
| # | Scénario | Attendu |
|---|----------|---------|
| 2.3.1 | Clic bouton approuver sur un item en attente | Toast "Contribution approuvée", badge passe à "Approuvée", bouton change en "Retirer" |
| 2.3.2 | Clic bouton "Retirer l'approbation" | Toast "Approbation retirée", badge repasse en attente |
| 2.3.3 | Bouton désactivé pendant l'opération | `btn.disabled = true` pendant l'API call |

### 2.4 — Suppression
| # | Scénario | Attendu |
|---|----------|---------|
| 2.4.1 | Clic icône supprimer → dialog de confirmation | Dialog modale s'ouvre avec le nom du projet |
| 2.4.2 | Clic "Annuler" dans le dialog | Dialog fermée, rien ne change |
| 2.4.3 | Clic "Supprimer" dans le dialog | Contribution supprimée, toast succès, liste rechargée, item disparu |

### 2.5 — Détail (slide panel)
| # | Scénario | Attendu |
|---|----------|---------|
| 2.5.1 | Clic sur un item de la liste (row entière ou bouton "Détails") | Slide panel s'ouvre (`aria-hidden="false"`), titre = nom du projet, URL inchangée |
| 2.5.2 | Badge statut présent dans le panel | `.adm-badge--success` ou `--warning` |
| 2.5.3 | Badge catégorie affiché | `.adm-badge--info` avec le nom de la catégorie |
| 2.5.4 | Date de création affichée | `.sp-meta-item` avec icône calendrier |
| 2.5.5 | Ville affichée | `.sp-meta-item` avec icône building |
| 2.5.6 | URL officielle cliquable (si présente) | Lien `<a>` avec `target="_blank"` |
| 2.5.7 | Description affichée (si présente) | `.sp-description` visible |
| 2.5.8 | Mini-carte MapLibre (si GeoJSON) | `#sp-contrib-map` rendu, canvas MapLibre présent |
| 2.5.9 | Article markdown rendu (si présent) | `#sp-contrib-article` contient du HTML |
| 2.5.10 | Documents PDF listés (si présents) | `.sp-docs` avec liens `.sp-doc-link` |
| 2.5.11 | Footer : boutons "Supprimer", "Modifier", "Approuver" | Boutons fonctionnels |
| 2.5.12 | Clic bouton fermer (×) depuis ouverture par clic | Panel se ferme (`aria-hidden="true"`), URL reste `/admin/contributions/` |
| 2.5.13 | Clic backdrop | Panel se ferme |
| 2.5.14 | URL directe `/admin/contributions/{id}/` → ouvre le panel au boot | Liste rendue + panel ouvert automatiquement |
| 2.5.15 | Fermer le panel ouvert via URL directe | Panel se ferme, URL mise à jour vers `/admin/contributions/` via `router.navigate` |

### 2.6 — Wizard de création (admin)
| # | Scénario | Attendu |
|---|----------|---------|
| 2.6.1 | Clic "Nouvelle contribution" → URL `/admin/contributions/nouveau/` | Formulaire affiché, titre "Nouvelle contribution" |
| 2.6.2 | Section "Identité" : champ nom obligatoire | Input `#cw-name` visible, label avec étoile |
| 2.6.3 | Pills de catégories chargées depuis l'API | `.cw-cat-pill` rendues |
| 2.6.4 | Sélection d'une catégorie | Pill highlighted (`.cw-cat-pill--selected`), hidden input mis à jour |
| 2.6.5 | Description : compteur de caractères fonctionne | `#cw-desc-count` se met à jour en temps réel, warning à >450 |
| 2.6.6 | Section "Image de couverture" : dropzone visible | `.cw-drop-area` visible |
| 2.6.7 | Upload image couverture (clic) | Aperçu affiché dans `#cw-cover-preview` |
| 2.6.8 | Section "Localisation" : toggle "Dessiner / Importer" | 2 boutons, "Dessiner" actif par défaut |
| 2.6.9 | Carte MapLibre chargée dans `#cw-map` | Canvas MapLibre visible |
| 2.6.10 | Outils de dessin : Point, Ligne, Zone disponibles | 3 boutons `.cw-dtb__tool` |
| 2.6.11 | Dessiner un point sur la carte | Feature créée, toolbar montre "Tracé enregistré" |
| 2.6.12 | Toggle vers "Importer un fichier" | Section draw masquée, dropzone GeoJSON visible |
| 2.6.13 | Upload fichier GeoJSON valide | Nom du fichier affiché, nombre de features détecté |
| 2.6.14 | Upload fichier non-GeoJSON | Toast erreur "Le fichier doit être un GeoJSON" |
| 2.6.15 | Section "Détails" : champ URL officielle | Input `#cw-official-url` de type URL |
| 2.6.16 | Toggle article markdown → éditeur Toast UI chargé | `#cw-editor` contient l'éditeur WYSIWYG |
| 2.6.17 | Ajout de documents PDF | Clic "Ajouter un PDF" → file picker → item dans `#cw-docs-list` |
| 2.6.18 | Section "Publication" (admin) : toggle "Publier immédiatement" | Switch `#cw-publish` visible et coché |
| 2.6.19 | Décocher publication → icône change (eye-slash) | Icône mise à jour |
| 2.6.20 | **Validation** : soumettre sans nom → erreur | Toast "Le nom du projet est obligatoire", focus sur le champ |
| 2.6.21 | **Validation** : soumettre sans catégorie → erreur | Toast "Veuillez choisir une catégorie" |
| 2.6.22 | **Validation** : soumettre sans tracé → erreur | Toast sur le tracé obligatoire |
| 2.6.23 | **Soumission complète** (nom + catégorie + tracé) | Bouton spinner, toast succès, redirect vers la liste |
| 2.6.24 | Bouton "Retour" (`href` contributions) | Retour à la liste sans créer |

### 2.7 — Wizard d'édition (admin)
| # | Scénario | Attendu |
|---|----------|---------|
| 2.7.1 | URL `/admin/contributions/modifier/{id}/` | Formulaire pré-rempli, titre "Modifier la contribution" |
| 2.7.2 | Champs remplis : nom, catégorie, description, URL | Valeurs de la contribution existante |
| 2.7.3 | GeoJSON existant : notice "GeoJSON existant" affichée | `.cw-notice--success` visible |
| 2.7.4 | Image existante : aperçu affiché | `#cw-cover-preview` visible |
| 2.7.5 | Article existant pré-chargé dans l'éditeur | Markdown récupéré et injecté |
| 2.7.6 | Modifier le nom → sauvegarder | Toast "Contribution mise à jour", retour à la liste |

### 2.8 — Contributions (rôle invited)
| # | Scénario | Attendu |
|---|----------|---------|
| 2.8.1 | Bouton "Nouvelle contribution" visible | ✅ Les invités peuvent créer |
| 2.8.2 | Pas de bouton approuver/désapprouver dans la liste | Absents — conditionné par `store.isAdmin` dans `_renderItem()` |
| 2.8.3 | Checkbox "Mes contributions" visible (`#contrib-mine-only`) | ✅ Visible pour les invités |
| 2.8.4 | Cocher "Mes contributions" → filtre actif | Seules les contributions du user affichées |
| 2.8.5 | Section "Publication" du wizard : notice "Soumise à validation" | Pas de toggle publish, notice info à la place |
| 2.8.6 | Création par invited → status "En attente" | contribution créée avec `approved: false` |
| 2.8.7 | Invited peut supprimer ses propres contributions | Bouton poubelle fonctionnel |

### 2.9 — Pagination
| # | Scénario | Attendu |
|---|----------|---------|
| 2.9.1 | Si >20 contributions, pagination visible | `#contrib-pagination` contient les boutons |
| 2.9.2 | Clic page suivante | Nouvelles contributions chargées |
| 2.9.3 | Info "1–20 sur N" correcte | Texte `.adm-pagination__info` juste |

---

## 3 · Catégories (admin only)

### 3.1 — Liste
| # | Scénario | Attendu |
|---|----------|---------|
| 3.1.1 | Arrivée sur `/admin/categories/` | Titre "Catégories", liste chargée |
| 3.1.2 | Chaque catégorie affiche : icône colorée, nom, couches associées | `.adm-cat-card` avec contenu correct |
| 3.1.3 | Boutons éditer et supprimer présents | `data-action="edit"`, `data-action="delete"` |
| 3.1.4 | Drag handle visible | `.adm-cat-card__drag` avec `fa-grip-vertical` |
| 3.1.5 | Liste vide → empty state "Aucune catégorie" | `.adm-empty` affiché |

### 3.2 — Création
| # | Scénario | Attendu |
|---|----------|---------|
| 3.2.1 | Clic "Nouvelle catégorie" | Formulaire déroulé (`#cat-form-card` visible) |
| 3.2.2 | Titre formulaire = "Nouvelle catégorie" | `#cat-form-title` correct |
| 3.2.3 | Champ nom obligatoire | `#cat-name required` |
| 3.2.4 | Icon picker : champ + bouton de sélection | `.icon-picker__btn` visible |
| 3.2.5 | Color picker : couleur par défaut #6366F1 | `#cat-color` value = `#6366f1` |
| 3.2.6 | Aperçu SVG (ligne + polygone) | `#cat-prev-line` et `#cat-prev-polygon` rendus |
| 3.2.7 | Slider épaisseur → label mis à jour | `#cat-weight-val` change en temps réel |
| 3.2.8 | Changement dash pattern (Plein/Tirets/Points) | Bouton actif change, SVG mis à jour |
| 3.2.9 | Slider opacité → label mis à jour | `#cat-opacity-val` change |
| 3.2.10 | Toggle remplissage → options de fill affichées | `#cat-fill-options` visible |
| 3.2.11 | Section "Couches associées" affiche les layers disponibles | `#cat-layers` peuplé |
| 3.2.12 | Clic sur une couche → toggle active | Class `active` toggle |
| 3.2.13 | Soumettre le formulaire | Catégorie créée, toast succès, liste mise à jour, formulaire masqué |
| 3.2.14 | Annuler → formulaire masqué | `#cat-form-card hidden` |

### 3.3 — Édition
| # | Scénario | Attendu |
|---|----------|---------|
| 3.3.1 | Clic bouton éditer sur une catégorie | Formulaire ouvert, titre "Modifier — {nom}" |
| 3.3.2 | Champs pré-remplis (nom, icône, couleur) | Valeurs de la catégorie existante |
| 3.3.3 | Styles de tracé pré-remplis (épaisseur, dash, opacité, fill) | Valeurs des `category_styles` |
| 3.3.4 | Couches associées pré-sélectionnées | Items avec class `active` |
| 3.3.5 | Soumettre les modifications | Toast "Catégorie mise à jour", liste rafraîchie |

### 3.4 — Suppression
| # | Scénario | Attendu |
|---|----------|---------|
| 3.4.1 | Clic supprimer → dialog confirmation | Message contient le nom de la catégorie |
| 3.4.2 | Confirmer → suppression | Toast succès, catégorie disparait de la liste |
| 3.4.3 | Annuler → rien ne change | Dialog fermée |

### 3.5 — Drag & drop (réordonnement)
| # | Scénario | Attendu |
|---|----------|---------|
| 3.5.1 | Drag une catégorie vers le bas | L'item se déplace visuellement (`.is-dragging`) |
| 3.5.2 | Drop → ordre persisté | Toast "Ordre sauvegardé", API `updateCategory` appelée |
| 3.5.3 | Refresh après réordonnement → nouvel ordre conservé | Ordre identique au reload |

---

## 4 · Utilisateurs (admin only)

### 4.1 — Liste
| # | Scénario | Attendu |
|---|----------|---------|
| 4.1.1 | Arrivée `/admin/utilisateurs/` | Titre, bouton "Inviter", tabs rôles |
| 4.1.2 | Liste des utilisateurs chargée | `.adm-user-row` rendus |
| 4.1.3 | Chaque user affiche : avatar, email, badge rôle, villes, date | Éléments présents |
| 4.1.4 | Bouton "Promouvoir"/"Rétrograder" selon le rôle actuel | Label dynamique |

### 4.2 — Filtres
| # | Scénario | Attendu |
|---|----------|---------|
| 4.2.1 | Tab "Tous" actif par défaut | `.adm-tab.active` data-role="all" |
| 4.2.2 | Tab "Admins" → filtre admin | Seuls les admins affichés |
| 4.2.3 | Tab "Contributeurs" → filtre invited | Seuls les invités affichés |
| 4.2.4 | Recherche par email | Filtrage instantané (250ms debounce) |
| 4.2.5 | Aucun résultat → empty state | `.adm-empty` affiché |

### 4.3 — Invitation
| # | Scénario | Attendu |
|---|----------|---------|
| 4.3.1 | Clic "Inviter" → formulaire visible | `#users-invite-card` visible, focus sur email |
| 4.3.2 | Champ email requis, de type `email` | Validation HTML native |
| 4.3.3 | Onglets rôle : "Contributeur" actif par défaut | `data-invite-role="invited"` a class `active` |
| 4.3.4 | Switcher vers rôle "Admin" | Tab active change, hidden input = "admin" |
| 4.3.5 | Soumettre invitation valide | Toast succès "Invitation envoyée à {email}", formulaire masqué, liste rafraîchie |
| 4.3.6 | Inviter un email déjà membre | Toast info "{email} a déjà accès à cette structure" |
| 4.3.7 | Inviter un email existant sur autre ville | Toast succès "{email} ajouté à la structure" |
| 4.3.8 | Annuler → formulaire masqué et reset | Email vide, rôle revient à "Contributeur" |

### 4.4 — Changement de rôle
| # | Scénario | Attendu |
|---|----------|---------|
| 4.4.1 | Clic "Promouvoir" sur un contributeur | Dialog "Promouvoir en Admin" |
| 4.4.2 | Confirmer promotion | Toast "Rôle mis à jour : admin", badge change |
| 4.4.3 | Clic "Rétrograder" sur un admin | Dialog "Rétrograder en Contributeur" (style danger) |
| 4.4.4 | Confirmer rétrogradation | Toast succès, badge change |
| 4.4.5 | Annuler → rien | Dialog fermée |

---

## 5 · Travaux (admin only)

### 5.1 — Scénarios de module
| # | Scénario | Attendu |
|---|----------|---------|
| 5.1.1 | Config absente (scénario A "unconfigured") | Empty state "Module non configuré", lien "Configurer" |
| 5.1.2 | Config `enabled: false` (scénario B "disabled") | Empty state "Module désactivé", lien "Activer" |
| 5.1.3 | Config normale (scénario C) | Liste des chantiers, bouton "Nouveau chantier" |
| 5.1.4 | Config `source_type: 'url'` avec URL (scénario D "opendata") | Banner info "Source open data", pas de bouton "Nouveau" |
| 5.1.5 | Config `source_type: 'url'` sans URL (scénario E) | Banner warning "URL non définie" |

### 5.2 — Liste (scénario normal)
| # | Scénario | Attendu |
|---|----------|---------|
| 5.2.1 | Liste des chantiers chargée | Items rendus avec icône, nom, état, nature, dates, localisation |
| 5.2.2 | Badge état selon `etat` (en_cours → `--success`, prevu → `--info`, termine → `--neutral`, a_venir → `--warning`) | Badges avec label + icône conformes à `ETAT_LABELS` |
| 5.2.3 | Chantier non approuvé → badge "En attente" | `.adm-badge--warning` + "En attente" |
| 5.2.4 | Filtre onglet "Tous" / "En attente" / "Approuvés" | Filtrage client-side correct |
| 5.2.5 | Recherche textuelle | Filtre par nom, nature, localisation |
| 5.2.6 | Tri (plus récent, plus ancien, nom A-Z) | Ordre change |

### 5.3 — Actions chantiers
| # | Scénario | Attendu |
|---|----------|---------|
| 5.3.1 | Clic "Approuver" sur chantier en attente | Toast succès, badge mis à jour |
| 5.3.2 | Clic "Modifier" | Navigation vers `/admin/travaux/{id}/`, formulaire pré-rempli |
| 5.3.3 | Clic "Supprimer" → dialog confirmation | Message avec le nom du chantier |
| 5.3.4 | Confirmer suppression | Toast succès, chantier disparu de la liste |

### 5.4 — Création d'un chantier
| # | Scénario | Attendu |
|---|----------|---------|
| 5.4.1 | URL `/admin/travaux/nouveau/` | Formulaire "Nouveau chantier" |
| 5.4.2 | Champ nom obligatoire, placeholder | `#tw-name` visible |
| 5.4.3 | Champs facultatifs : nature, adresse, description | Présents |
| 5.4.4 | Picker d'état : 4 options (En cours, Prévu, Terminé, À venir) | `.tw-etat-option` rendues |
| 5.4.5 | Sélection d'un état | Option highlighted, hidden input mis à jour |
| 5.4.6 | Champs dates début/fin | Inputs `type="date"` |
| 5.4.7 | Section localisation : carte MapLibre + outils de dessin | Identique au wizard contributions |
| 5.4.8 | Icon picker pour l'icône du chantier | `.icon-picker` avec défaut `fa-helmet-safety` |
| 5.4.9 | **Validation** : soumettre sans nom → erreur | Toast + focus sur le champ |
| 5.4.10 | Soumission complète → admin = auto-approuvé | `data.approved = true` (via `store.isAdmin`) |
| 5.4.11 | Toast succès + redirect vers la liste | URL = `/admin/travaux/` |

### 5.5 — Édition d'un chantier
| # | Scénario | Attendu |
|---|----------|---------|
| 5.5.1 | URL `/admin/travaux/{id}/` | Formulaire pré-rempli avec données existantes |
| 5.5.2 | Nom, nature, adresse, description remplis | Valeurs de la base |
| 5.5.3 | État pré-sélectionné | Bonne option `.selected` |
| 5.5.4 | Dates pré-remplies | Formats `YYYY-MM-DD` |
| 5.5.5 | GeoJSON existant affiché sur la carte | Features visibles sur la carte |
| 5.5.6 | Modifier et sauvegarder | Toast "Chantier mis à jour" |

### 5.6 — Configuration du module
| # | Scénario | Attendu |
|---|----------|---------|
| 5.6.1 | URL `/admin/travaux/config/` | Page configuration affichée |
| 5.6.2 | Toggle activation → label live "Visible"/"Masqué" | Le texte se met à jour en temps réel |
| 5.6.3 | Source picker : "Base interne" vs "Flux externe" | 2 options radio, bonne pré-sélection |
| 5.6.4 | Sélection "Flux externe" → champ URL visible | `#twc-url-group` visible |
| 5.6.5 | Icon picker pour icône par défaut | Défaut `fa-helmet-safety` |
| 5.6.6 | Couches associées : toggle items | `.adm-toggle-item` cliquables |
| 5.6.7 | Sauvegarder la config | Toast "Configuration sauvegardée" |
| 5.6.8 | Bouton "Retour" | Retour à la liste travaux |

### 5.7 — Scénario open data (read-only)
| # | Scénario | Attendu |
|---|----------|---------|
| 5.7.1 | Pas de bouton "Nouveau chantier" | Bouton absent |
| 5.7.2 | Pas de boutons éditer/supprimer/approuver | Badge "Legacy" à la place |
| 5.7.3 | Pas d'onglets de statut | `#travaux-tabs` absent |
| 5.7.4 | Accès URL `/admin/travaux/nouveau/` → redirect vers liste | Navigation forcée |

---

## 6 · Structure (admin only)

### 6.1 — Affichage
| # | Scénario | Attendu |
|---|----------|---------|
| 6.1.1 | Arrivée `/admin/structure/` | Titre "Ma structure", sous-titre mention la ville |
| 6.1.2 | Section identité : champ nom affiché pré-rempli | `#st-brand-name` contient le brand_name |
| 6.1.3 | Code ville en lecture seule (disabled) | Input disabled |
| 6.1.4 | Logos existants affichés en preview | `#st-logo-preview` visible si URL existante |
| 6.1.5 | Color picker et hex input synchronisés | Valeur identique |
| 6.1.6 | Aperçu badge + bouton avec la couleur | `#st-color-preview` coloré |
| 6.1.7 | Basemap selector peuplé | Options chargées |
| 6.1.8 | Toggles UI chargés depuis la base | `.st-toggle-row` rendus avec switch |
| 6.1.9 | Cities activées affichées en chips | `.st-city-chip` pour chaque ville |

### 6.2 — Modifications
| # | Scénario | Attendu |
|---|----------|---------|
| 6.2.1 | Changer la couleur via le picker | Hex input + preview se mettent à jour |
| 6.2.2 | Saisir un hex dans le champ texte | Color picker se synchronise |
| 6.2.3 | Upload logo clair (drag & drop ou clic) | Preview mis à jour, dropzone masquée |
| 6.2.4 | Upload logo sombre | Idem |
| 6.2.5 | Upload favicon | Idem |
| 6.2.6 | Bouton "Changer" sur un logo existant | File picker s'ouvre |
| 6.2.7 | Bouton "Supprimer" sur un logo existant | Preview masqué, dropzone réaffichée |
| 6.2.8 | Toggle un contrôle UI ON/OFF | Switch change d'état |
| 6.2.9 | Clic sur la ligne entière du toggle (pas juste le switch) | Même effet — toggle l'état |
| 6.2.10 | Ajouter un espace activé via l'input | Chip ajoutée |
| 6.2.11 | Ajouter un code invalide (caractères spéciaux) | Nettoyé en minuscules/tirets |
| 6.2.12 | Ajouter un code déjà présent | Toast "Espace déjà ajouté" |
| 6.2.13 | Supprimer un chip de ville (×) | Chip retirée |

### 6.3 — Sauvegarde
| # | Scénario | Attendu |
|---|----------|---------|
| 6.3.1 | Clic "Enregistrer les modifications" | Bouton spinner, uploads effectués, toast succès |
| 6.3.2 | Couleur invalide (pas 6 caractères hex) | Toast erreur couleur |
| 6.3.3 | Upload logo échoue (réseau) | Toast erreur upload, bouton re-activé |
| 6.3.4 | Sauvegarde met à jour le branding en live | Couleur primaire de l'interface admin change |
| 6.3.5 | Logo sidebar se met à jour | `#adm-sidebar-logo` src change |

---

## 7 · Composants transversaux

### 8.1 — Toasts
| # | Scénario | Attendu |
|---|----------|---------|
| 8.1.1 | Toast succès (vert) | `.adm-toast--success` visible ~3.5s puis s'efface |
| 8.1.2 | Toast erreur (rouge) | `.adm-toast--error` |
| 8.1.3 | Toast warning (orange) | `.adm-toast--warning` |
| 8.1.4 | Toast info (bleu) | `.adm-toast--info` |
| 8.1.5 | Multiples toasts simultanés | Empilés dans `#adm-toast-container` |

### 8.2 — Dialog de confirmation
| # | Scénario | Attendu |
|---|----------|---------|
| 8.2.1 | Dialog s'ouvre en modal (`showModal`) | `<dialog>` `.adm-dialog` affichée |
| 8.2.2 | Titre et message corrects | Contenu dans `#adm-dialog-body` |
| 8.2.3 | Bouton "Annuler" → résout `false` | Dialog fermée |
| 8.2.4 | Bouton "Confirmer" → résout `true` | Dialog fermée |
| 8.2.5 | Touche Escape → résout `false` | Dialog fermée |
| 8.2.6 | Mode `danger: true` → bouton rouge | `.adm-btn--danger` |

### 8.3 — Slide panel
| # | Scénario | Attendu |
|---|----------|---------|
| 8.3.1 | Ouverture : `aria-hidden="false"` | Panel visible avec animation |
| 8.3.2 | Titre affiché | `.adm-slide-panel__title` correct |
| 8.3.3 | Corps et footer rendus | `.adm-slide-panel__body`, `.adm-slide-panel__footer` |
| 8.3.4 | Bouton × ferme le panel | `aria-hidden="true"` |
| 8.3.5 | Clic backdrop ferme le panel | Idem |

### 8.4 — Icon picker
| # | Scénario | Attendu |
|---|----------|---------|
| 8.4.1 | Bouton ouvre le picker | Panel `.icon-picker__dropdown` visible |
| 8.4.2 | Recherche filtre les icônes | Résultats mis à jour |
| 8.4.3 | Clic sur une icône → champ mis à jour | `<input>` value change, preview change |
| 8.4.4 | Reset button remet l'icône par défaut | Valeur et preview reviennent au défaut |

### 8.5 — Skeleton loading
| # | Scénario | Attendu |
|---|----------|---------|
| 8.5.1 | Pendant le chargement, skeletons visibles | `.adm-skeleton` présents |
| 8.5.2 | Après chargement, skeletons remplacés | `.adm-skeleton` absents, contenu réel affiché |

---

## 8 · Changement de ville (admin)

| # | Scénario | Attendu |
|---|----------|---------|
| 9.1 | Changer de ville dans le select sidebar | Section courante se re-rend avec les données de la nouvelle ville |
| 9.2 | Les contributions affichées correspondent à la nouvelle ville | Sous-titre "Gérer les contributions de {nouvelle-ville}" |
| 9.3 | Les catégories chargées sont celles de la nouvelle ville | Liste catégories différente |
| 9.4 | Le branding/logo sidebar se met à jour | Logo et couleur changent |
| 9.5 | La carte "Voir la carte" pointe vers la nouvelle ville | `href` mis à jour |

---

## 9 · Résilience & edge cases

| # | Scénario | Attendu |
|---|----------|---------|
| 10.1 | Route inconnue `/admin/foobar/` | Fallback vers la section contributions |
| 10.2 | Contribution introuvable `/admin/contributions/999999/` | Toast "Contribution introuvable" |
| 10.3 | Chantier introuvable `/admin/travaux/999999/` | Toast "Chantier introuvable", redirect |
| 10.4 | Soumettre un formulaire alors que l'API est lente | Bouton disabled + spinner pendant le chargement |
| 10.5 | Double-clic sur un bouton de soumission | Pas de double soumission (`disabled` immédiat) |
| 10.6 | Ouvrir un slide panel, le fermer, re-ouvrir | Panel fonctionne à chaque fois, pas de listeners zombies |
| 10.7 | XSS dans un nom de projet (ex : `<img onerror=alert(1)>`) | Rendu échappé via `esc()`, pas d'exécution |
