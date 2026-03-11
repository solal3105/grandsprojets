# Guide Grands Projets

> Guide simple pour utiliser la plateforme de gestion des projets urbains

---

## Sommaire

1. [Vous êtes Administrateur ?](#vous-êtes-administrateur)
2. [Vous êtes Contributeur ?](#vous-êtes-contributeur)

---

# Vous êtes Administrateur ? 

> Vous gérez une structure et pouvez valider les projets, inviter des utilisateurs et configurer la plateforme

## 🚀 Je veux me connecter

### Première connexion
1. **Ouvrez l'email** que vous avez reçu
2. **Cliquez sur "Se connecter"**
3. ✅ **Vous êtes connecté** (pas de mot de passe)
4. ⏰ **Session** : 1 heure avec rafraîchissement automatique

### Problèmes de connexion
- **Page blanche** → Rechargez (F5) et recliquez sur le lien email

---

## 📋 Je veux accéder aux outils d'administration

1. **Cliquez sur** le bouton **"Proposer une contribution"** (+) en bas à droite
2. **Sélectionnez votre structure** dans le menu déroulant en haut
3. **Choisissez une action** parmi les cartes disponibles :
   - 📝 **Modifier mes contributions**
   - 🏷️ **Gérer les catégories**
   - 👥 **Gérer les utilisateurs**
   - 🏢 **Gérer ma structure** (non fonctionnel)

---

## 👥 Je veux gérer les utilisateurs

### Inviter un nouvel utilisateur
1. **Cliquez sur** "Gérer les utilisateurs"
2. **Cliquez sur** "Inviter un utilisateur" (en haut)
3. **Remplissez** :
   - Email (obligatoire)
   - Rôle : Admin 🛡️ ou Invité 👤
   - Structure à assigner
4. **Cliquez sur** "Inviter"
5. ✅ **Confirmation** : Toast vert

### Gérer les utilisateurs existants
- **Promouvoir** : Flèche ↑ (Invité → Admin)
- **Rétrograder** : Flèche ↓ (Admin → Invité)
- **Rechercher** : Barre de recherche par email
- **Informations visibles** : Email, rôle, structures, date, ⚠️ si sans structure

### Tableau des permissions
| Rôle | Peut valider | Peut inviter | Peut gérer catégories |
|------|-------------|-------------|---------------------|
| **Admin** | ✅ | ✅ | ✅ |
| **Invité** | ❌ | ❌ | ❌ |

---

## 📝 Je veux gérer les contributions

### Approuver une contribution
1. **Cliquez sur** "Modifier mes contributions"
2. **Repérez** les projets avec badge 🟠 "En attente"
3. **Cliquez sur** la coche ✓ du projet
4. ✅ **Le projet devient** "Approuvé" (vert) et apparaît sur la carte

### Modifier une contribution
1. **Dans la liste**, cliquez sur le crayon ✏️
2. **Modifiez** les informations nécessaires
3. **Naviguez** entre les 4 étapes du formulaire
4. **Cliquez sur** "Enregistrer"

### Supprimer une contribution
1. **Cliquez sur** la corbeille 🗑️
2. **Confirmez** dans la boîte de dialogue
3. ⚠️ **Action irréversible**

### Créer une nouvelle contribution
1. **Cliquez sur** le bouton "Créer" (en haut)
2. **Remplissez les 4 étapes** :
   - Étape 1 : Titre, description, catégorie, tags
   - Étape 2 : Localisation (fichier OU dessin)
   - Étape 3 : Style et confirmation
   - Étape 4 : Documents
3. **Cliquez sur** "Enregistrer"

### Tableau des actions sur projets
| Action | Icône | Résultat |
|--------|------|----------|
| **Approuver/Révoquer** | ✓ | Change le statut |
| **Modifier** | ✏️ | Ouvre l'édition |
| **Supprimer** | 🗑️ | Supprime définitivement |

### Outils de recherche
- 🔍 **Recherche** : Par nom de projet
- 📂 **Filtrer** : Par catégorie
- 📊 **Trier** : Par date ou nom
- 👤 **"Mes contributions"** : Vos projets uniquement

---

## 🏷️ Je veux gérer les catégories

### Modifier une catégorie
1. **Cliquez sur** "Gérer les catégories"
2. **Cliquez sur** la catégorie à modifier
3. **Changez** :
   - Nom de la catégorie
   - Icône FontAwesome
   - Couleur
   - Tags disponibles
4. **Cliquez sur** "Enregistrer"

### Gérer les tags d'une catégorie
- **Ajouter un tag** : Nom + icône + couleur
- **Modifier un tag** : Cliquez sur le crayon ✏️
- **Supprimer un tag** : Cliquez sur la ×
- ✅ **Pas de doublons** : Vérification automatique

### Limitations
- ❌ **Impossible de créer** de nouvelles catégories
- ❌ **Bouton "Nouvelle catégorie"** non fonctionnel

---

## 🔧 Je veux configurer les travaux

### Activer/Désactiver les travaux
1. **Dans** "Gérer les catégories", descendez en bas
2. **Cliquez sur** l'interrupteur
3. ✅ **Auto-save** : Sauvegardé immédiatement

### Configurer la source
- **"Données de la ville"** (par défaut)
- **"URL personnalisée"** : Champ qui apparaît dynamiquement

### Autres options
- **Types de travaux** à afficher
- **Périodes** : En cours, à venir, terminés
- ✅ **Toutes modifications sauvegardées automatiquement**

---

## 🏢 Je veux gérer ma structure (Admin global uniquement)

### Créer une nouvelle structure
1. **Cherchez** le bouton "Ajouter une nouvelle structure"
2. **Remplissez** :
   - Logo principal (obligatoire)
   - Logo mode sombre (optionnel)
   - Favicon (optionnel)
   - Position sur la carte
   - Villes activées

### Configurer les logos
- **Formats** : SVG, PNG, JPG, WEBP (max 2MB)
- **Upload** : Cliquez ou glissez-déposez
- **Aperçu** : Immédiat après sélection

### Configurer la carte
- **Déplacez** la carte pour centrer la vue
- **Zoom** : Ajustez avec la molette
- **Coordonnées** : Affichées en temps réel
- ✅ **Position sauvegardée** automatiquement

---

## 🎯 Je veux connaître les astuces

### Raccourcis pratiques
- **Double-clic** → Modification directe
- **Recherche** → Résultats instantanés
- **Filtres** → Combinables

### Bonnes pratiques
- ✅ Approuvez rapidement
- 📝 Catégories claires
- 🗺️ Vérifiez la localisation
- 📄 Descriptions détaillées

---

## ⚠️ Limitations importantes

### Non disponible
- ❌ "Gérer ma structure"
- ❌ Créer des catégories
- ❌ Modifier logos/couleurs

### Messages d'alerte
- "Nouvelle catégorie" → Bouton inexistant
- ⚠️ Utilisateurs sans structure

---

## 📊 Mes informations

### Visible en haut
- **Email** de connexion
- **Rôle** : Admin 🛡️ ou Invité 👤
- **Structures** : Badges des villes
- **Déconnexion**

---

# Vous êtes Contributeur ?

> Vous pouvez proposer des projets et gérer uniquement vos propres contributions

## 🚀 Je veux me connecter

### Première connexion
1. **Ouvrez l'email** que vous avez reçu
2. **Cliquez sur "Se connecter"**
3. ✅ **Vous êtes connecté** (pas de mot de passe)
4. ⏰ **Session** : 1 heure avec rafraîchissement automatique

### Problèmes de connexion
- **Page blanche** → Rechargez (F5) et recliquez sur le lien email

---

## 📋 Je veux accéder à mes contributions

1. **Cliquez sur** le bouton **"Proposer une contribution"** (+) en bas à droite
2. **Choisissez** votre structure dans le menu déroulant
3. **Cliquez sur** la carte **"Modifier mes contributions"**

### Message spécial
> "Vous voyez vos contributions et celles approuvées de votre équipe. Vous ne pouvez modifier que les vôtres."

---

## 📝 Je veux proposer un nouveau projet

### Étape par étape
1. **Dans "Modifier mes contributions"**, cliquez sur **"Créer"** (en haut)
2. **Remplissez les 4 étapes** :
   - **Étape 1** : Titre, description, catégorie, tags
   - **Étape 2** : Localisation (fichier OU dessin)
   - **Étape 3** : Confirmation du style
   - **Étape 4** : Documents (PDF, images)
3. **Cliquez sur** "Enregistrer"
4. ✅ **Votre projet apparaît** avec le statut 🟠 "En attente"

### Tableau des étapes
| Étape | Description | Obligatoire |
|-------|-------------|-------------|
| **1** | Informations de base | Titre, description |
| **2** | Localisation sur carte | Fichier GeoJSON OU dessin |
| **3** | Style et catégorie | Confirmation |
| **4** | Documents | Optionnel |

---

## ✏️ Je veux modifier mon projet

1. **Dans la liste**, trouvez votre projet (badge bleu "Votre contribution")
2. **Cliquez sur** le crayon ✏️
3. **Modifiez** ce que vous voulez
4. **Naviguez** entre les étapes avec les tabs
5. **Cliquez sur** "Enregistrer"

### Ce que vous pouvez modifier
- ✅ **Titre et description**
- ✅ **Catégorie et tags**
- ✅ **Localisation**
- ✅ **Documents**
- ❌ **Statut** : Seul un admin peut approuver

---

## 🗑️ Je veux supprimer mon projet

1. **Cliquez sur** la corbeille 🗑️ de votre projet
2. **Confirmez** dans la boîte de dialogue
3. ⚠️ **Action irréversible**

---

## 🔍 Je veux trouver mes projets

### Outils de recherche
- **Recherche** : Tapez le nom du projet
- **Filtrer par catégorie** : Sélectionnez un type
- **Trier** : Par date (récent/ancien) ou par nom (A→Z/Z→A)
- **"Mes contributions uniquement"** : Coché par défaut pour vous

### Statuts des projets
- 🟠 **En attente** : En cours de validation par un admin
- ✅ **Approuvé** : Visible sur la carte publique

---

## 🎯 Je veux connaître mes droits

### Ce que vous POUVEZ faire
- ✅ **Proposer** des nouveaux projets
- ✅ **Modifier** uniquement VOS projets
- ✅ **Supprimer** uniquement VOS projets
- ✅ **Voir** les projets approuvés de votre structure
- ✅ **Ajouter/retirer** des documents

### Ce que vous NE POUVEZ PAS faire
- ❌ **Approuver** des projets (réservé aux admins)
- ❌ **Modifier** les projets des autres
- ❌ **Voir** les projets en attente des autres
- ❌ **Gérer les catégories**
- ❌ **Inviter des utilisateurs**

---

## 🎯 Astuces pour contributeurs

### Bonnes pratiques
- 📝 **Descriptions détaillées** pour faciliter la validation
- 🗺️ **Localisation précise** sur la carte
- 📄 **Ajoutez des documents** pour illustrer votre projet
- 🏷️ **Utilisez les tags** si disponibles

### Raccourcis
- **Double-clic** sur votre projet → Modification directe
- **Défilement infini** : Les projets se chargent automatiquement
- **Recherche temps réel** : Résultats instantanés

---

# Pour tous les utilisateurs

> Fonctionnalités communes aux administrateurs et contributeurs

### Formulaire de création de projet

#### Étape 1 : Informations
- **Titre** (obligatoire)
- **Description** détaillée
- **Catégorie** (menu déroulant)
- **Tags** : Cases à cocher stylées selon la catégorie

#### Étape 2 : Localisation
- **Mode Fichier** : Upload GeoJSON (drag & drop supporté)
- - Validation automatique du fichier
- - Affichage du nombre d'entités
- **Mode Dessin** : Toolbar complète avec :
  - Ligne 📏, Polygone ⬡, Point 📍
  - Boutons Annuler, Terminer, Effacer
  - Helper visuel animé

#### Étape 3 : Catégorie et style
- Confirmation de la catégorie choisie
- Visualisation de l'icône et de la couleur

#### Étape 4 : Documents
- **Ajouter** : PDF, images, liens
- **Gérer** : Modifier le titre, supprimer
- **Aperçu** : Cartes individuelles pour chaque document

### Navigation et performance

- **Défilement infini** : Chargement automatique des projets
- **Double-clic** : Ouvre directement en modification
- **Lazy loading** : Images chargées au défilement
- **Recherche temps réel** : Résultats instantanés

---

## ⚠️ Limitations connues

### Fonctionnalités non développées
- **"Gérer ma structure"** : Bouton présent mais non fonctionnel
- **Création de catégories** : Impossible via l'interface
- **Modification du logo/couleurs** : Non disponible actuellement

### Messages d'avertissement
- Si aucune catégorie : "Cliquez sur 'Nouvelle catégorie' pour en créer une" (mais le bouton n'existe pas)
- Utilisateurs sans structure : Badge d'avertissement ⚠️

---

## Fonctionnalités supplémentaires

### Informations sur votre compte

En haut de la fenêtre de contribution, vous pouvez voir :
- **Votre email** de connexion
- **Votre rôle** (Admin ou Invité)
- **Vos structures** assignées
- **Bouton "Se déconnecter"** pour fermer votre session

### Ajouter une nouvelle structure (admin global uniquement)

Si vous êtes administrateur global :
1. En haut à côté du sélecteur de structure, un bouton **"Ajouter une nouvelle structure"** peut apparaître
2. Ce bouton vous permet de créer une nouvelle ville/structure

#### Gestion des logos de structure

Quand vous créez ou modifiez une structure, vous pouvez gérer plusieurs images :

**Logo principal** (obligatoire) :
- **Formats acceptés** : SVG, PNG, JPG, WEBP
- **Taille maximale** : 2MB
- **Upload** : Cliquez ou glissez-déposez
- **Aperçu** : Affiché immédiatement après sélection
- **Suppression** : Bouton "Supprimer" disponible

**Logo mode sombre** (optionnel) :
- Mêmes formats et taille que le logo principal
- **Aperçu spécial** : Affiché sur fond sombre pour visualiser
- **Utilité** : Pour les thèmes sombres de l'interface

**Favicon** (optionnel) :
- Petite icône pour l'onglet du navigateur
- **Formats** : SVG, PNG, ICO
- **Taille recommandée** : 32x32px

**Processus d'upload** :
1. Cliquez sur la zone d'upload
2. Sélectionnez votre fichier
3. Prévisualisation instantanée
4. Validation du format et de la taille
5. Upload avec progression affichée sur le bouton
6. Mise à jour automatique si c'est la ville active

**Gestion des erreurs** :
- Message si format non supporté
- Message si fichier trop lourd
- Logo requis pour valider le formulaire

#### Configuration de la carte de la ville

Quand vous créez/modifiez une structure, une carte interactive s'affiche :

**Initialisation de la carte** :
- **Centre par défaut** : Lat 45.7578, Lng 4.8320 (Lyon)
- **Zoom par défaut** : 12
- **Ville existante** : Recharge la dernière position sauvegardée

**Interaction avec la carte** :
- **Déplacement** : Faites glisser la carte pour changer le centre
- **Zoom** : Utilisez la molette ou les boutons de zoom
- **Position automatique** : La position est sauvegardée automatiquement

**Informations affichées** :
- **Coordonnées** : Lat, Lng avec 4 décimales
- **Niveau de zoom** : Affiché en temps réel
- **Mise à jour** : Les valeurs changent quand vous déplacez la carte

**Sauvegarde de la position** :
- Quand vous sauvegardez la ville, la position actuelle est enregistrée
- Les utilisateurs verront la carte centrée sur cet endroit
- Utile pour positionner la vue par défaut sur votre ville

#### Villes activées et administrateurs

**Gestion des villes activées** :
- Dans le formulaire de ville, vous pouvez choisir quelles autres villes sont **activées**
- **Liste déroulante** avec toutes les villes disponibles
- **Cases à cocher** pour activer/désactiver
- **Logos affichés** pour reconnaître facilement chaque ville
- **Sauvegarde automatique** de la configuration

**Comptage des administrateurs** :
- Chaque carte de ville affiche le **nombre d'admins**
- **Badge d'avertissement** ⚠️ si aucune ville n'est activée
- **Carte spéciale** si une ville n'a pas d'admin assigné
- **Information visuelle** : "0 admin" affiché en rouge

**Informations sur la carte de ville** :
- **Nom complet** de la ville (brand_name)
- **Code interne** de la ville
- **Coordonnées** du centre
- **Niveau de zoom** configuré
- **Nombre d'admins** assignés
- **Bouton de zoom** pour recentrer

### Configuration détaillée des travaux

Dans **"Gérer les catégories"**, la section "Configuration Travaux" permet de :

- **Activer/Désactiver** l'affichage des travaux avec un interrupteur
- **Déplier les options** avec le chevron ↓
- **Configurer la source des données** (choisir où chercher les infos travaux)
- **Définir les types de travaux** à afficher
- **Configurer les périodes** (travaux en cours, à venir, terminés)

##### Sauvegarde automatique

**Toutes les modifications sont sauvegardées automatiquement !**

- **Toggle principal** : Sauvegardé immédiatement au changement
- **Champs texte** : Sauvegardés après 800ms d'inactivité (debounce)
- **Radio buttons** : Sauvegardés instantanément
- **URL personnalisée** : Validée et sauvegardée automatiquement

**Feedback de sauvegarde** :
- ✅ **Message vert** : "Modifications enregistrées automatiquement"
- ❌ **Message rouge** : En cas d'erreur de sauvegarde
- **Pas de bouton sauvegarder** : Tout est automatique !

**Options de configuration** :
- **Source des données** : 
  - "Données de la ville" (par défaut)
  - "URL personnalisée" (champ qui apparaît dynamiquement)
- **URL personnalisée** :
  - Champ texte qui s'affiche si vous choisissez cette option
  - Validation automatique de l'URL
  - Sauvegarde automatique
- **Ordre d'affichage** :
  - Champ numérique pour définir l'ordre
  - Sauvegardé automatiquement

---

## Astuces et raccourcis

### Gagner du temps

- **Double-cliquer** sur un projet l'ouvre directement en modification
- **La recherche** fonctionne en temps réel : commencez à taper et les résultats apparaissent
- **Les filtres se combinent** : vous pouvez rechercher ET filtrer par catégorie en même temps

### Bonnes pratiques

- **Approuvez rapidement** les projets pour encourager les contributeurs
- **Utilisez des noms clairs** pour vos catégories
- **Vérifiez bien** la localisation sur la carte avant d'approuver
- **Ajoutez une description** détaillée à chaque projet

### Pour les super-admins

- Vous pouvez **gérer plusieurs structures** sans vous déconnecter
- Utilisez le sélecteur en haut pour basculer rapidement entre les villes
- Les utilisateurs sans structure assignée apparaissent avec un ⚠️

---

## États spéciaux et messages d'information

### Quand il n'y a pas de contenu

Le système affiche des messages clairs quand les listes sont vides :

- **Aucune contribution** : 
  - Icône 📁 dossier ouvert
  - Message : "Aucune contribution pour le moment"
  - Conseil : "Créez votre première contribution pour proposer un projet et le visualiser sur la carte"

- **Aucune catégorie** :
  - Message : "Aucune catégorie pour cette ville"
  - Note : "Cliquez sur 'Nouvelle catégorie' pour en créer une" (mais le bouton n'existe pas encore)

- **Aucun utilisateur** :
  - Message : "Aucun utilisateur ne partage vos structures"

### Navigation dans les fenêtres

Les fenêtres de contribution utilisent une navigation intuitive :
- **Bouton "Retour"** (←) : Apparaît quand vous entrez dans un sous-menu
- **Bouton "Fermer"** (×) : Toujours visible en haut à droite pour fermer la fenêtre
- **Effet de verre** : Le fond est légèrement flou pour mieux se concentrer

### Messages de confirmation et d'état

- **Invitation envoyée** : ✅ Toast vert de confirmation
- **Modifications travaux** : ✅ "Modifications enregistrées automatiquement"
- **Statut travaux** : Badge "Activé"/"Désactivé" qui change en temps réel
- **Chargement** : 🔄 Icône spinner pendant les opérations

---

## Créer une contribution : Le formulaire complet

### Les 4 étapes du formulaire

Quand vous cliquez sur **"Créer"**, un formulaire en 4 étapes s'ouvre :

#### Étape 1 : Informations principales
- **Titre du projet** (obligatoire)
- **Description** détaillée
- **Catégorie** (choix parmi celles disponibles)
- **Tags de catégorie** : Options supplémentaires (voir ci-dessous)
- Si aucune catégorie n'existe : 
  - Admins : Lien "Créer une catégorie" 
  - Invités : Message "Contactez votre administrateur"

##### Tags de contribution

**Quand sont-ils affichés ?**
- Seulement après avoir choisi une catégorie
- Uniquement si la catégorie a des tags définis
- La section se masque automatiquement si aucun tag disponible

**Comment fonctionnent les tags ?**
- **Cases à cocher** avec style moderne
- **Icône + couleur** personnalisées pour chaque tag
- **Sélection multiple** possible
- **Support clavier** complet (Tab, Entrée, Espace)

**Apparence des tags** :
- **Non sélectionné** : Fond blanc avec bordure de la couleur du tag
- **Sélectionné** : Fond de la couleur du tag avec texte blanc
- **Icône coche** ✓ qui apparaît quand sélectionné
- **Effet de survol** pour meilleure interactivité

**Exemples de tags** :
- Pour catégorie "Tramway" : "En construction", "En étude", "Ligne A", "Ligne B"
- Pour catégorie "Vélo" : "Piste cyclable", "Bande cyclable", "Double sens"

**Comportement automatique** :
- Changement de catégorie → Réinitialisation des tags
- Les nouveaux tags apparaissent avec animation
- Sauvegarde automatique avec la contribution

#### Étape 2 : Localisation sur la carte
Deux modes disponibles :
- **📁 Fichier GeoJSON** : Uploadez un fichier de géométrie
- **✏️ Dessiner sur la carte** : Tracez directement la zone

##### Outils de dessin disponibles
Quand vous choisissez "Dessiner", une toolbar complète apparaît :

**Types de tracés** :
- **Ligne** 📏 : Pour tracer des itinéraires
- **Polygone** ⬡ : Pour délimiter une zone
- **Point** 📍 : Pour marquer un emplacement précis

**Actions de contrôle** :
- **Annuler** ↶ : Supprime le dernier point placé
- **Terminer** ✓ : Valide le tracé en cours
- **Effacer** 🗑️ : Supprime toute la géométrie

##### Comment dessiner ?
1. Choisissez un type de tracé (ligne/polygone/point)
2. Cliquez sur la carte pour placer les points
3. Utilisez "Annuler" si vous faites une erreur
4. Cliquez "Terminer" quand vous avez fini
5. Un message de confirmation s'affiche ✅

##### Aide visuelle
- **Message d'instruction** : Indique quoi faire en temps réel
- **Helper animé** : Cercle pulsant au centre de la carte
- **Boutons activés** : Seuls les boutons pertinents sont cliquables
- **Statut en direct** : "Choisissez un type de tracé" → "Cliquez sur la carte..." → "Tracé terminé"

##### Validation automatique
- La géométrie est vérifiée automatiquement
- Message d'erreur si le tracé est invalide
- Impossible de passer à l'étape 3 sans géométrie valide

##### Mode Fichier GeoJSON
**Comment uploader un fichier ?**
- **Cliquez sur la zone** : Ouvre le sélecteur de fichiers
- **Glissez-déposez** : Déposez directement le fichier dans la zone
- **Formats acceptés** : Uniquement les fichiers .geojson ou .json valides

**Feedback visuel** :
- **Fichier valide** : ✅ Icône verte avec détails du contenu
  - Nombre de points, lignes, polygones détectés
  - Ex: "1 polygone, 0 ligne, 0 point"
- **Fichier invalide** : ❌ Icône rouge d'erreur
  - Message "GeoJSON invalide ou vide"
  - Toast d'erreur supplémentaire

**États de la dropzone** :
- **Normal** : Bordure pointillée grise
- **Dragover** : Bordure bleue quand vous survolez avec un fichier
- **Has-file** : Change d'apparence quand un fichier est sélectionné

**Validation automatique** :
- Le fichier est analysé immédiatement après sélection
- Vérification de la structure GeoJSON
- Comptage des entités (features)
- Affichage des statistiques

#### Étape 3 : Catégorie et style
- Confirmation de la catégorie choisie
- Icône et couleur de la catégorie
- Visualisation du rendu sur la carte

#### Étape 4 : Documents
- **Ajouter des documents** : PDF, images, liens
- **Documents existants** : Liste des fichiers déjà uploadés
- Bouton pour supprimer des documents
- Message "Aucun document existant" si vide

##### Gestion détaillée des documents

**Documents existants** :
- **Carte individuelle** pour chaque document avec :
  - Icône 📄 (PDF) ou autre selon le type
  - **Titre modifiable** : Cliquez sur le titre pour le changer
  - **Bouton "Enregistrer"** : Apparaît seulement si vous modifiez le titre
  - **Bouton "Supprimer"** 🗑️ : Pour enlever le document

**Modification du titre** :
1. Cliquez sur le champ du titre
2. Modifiez le texte
3. Le bouton "Enregistrer" apparaît automatiquement
4. Cliquez "Enregistrer" pour sauvegarder

**Types de fichiers supportés** :
- PDF (avec icône dédiée)
- Images (PNG, JPG, etc.)
- Autres formats selon le système

**Feedback utilisateur** :
- **Suppression** : Confirmation avant de supprimer
- **Sauvegarde** : Toast de confirmation "Titre mis à jour"
- **Erreur** : Message si problème lors de l'opération

### Navigation dans le formulaire

- **Tabs en haut** : Cliquez sur les étapes pour naviguer
- **Boutons "Précédent/Suivant"** : Navigation linéaire
- **Validation automatique** : Impossible de passer à l'étape suivante si l'actuelle est incomplète
- **Bouton "Enregistrer"** : Visible seulement à la dernière étape

### Messages d'aide et erreurs

- **Champs requis** : Message rouge si oubli
- **Géométrie invalide** : Instructions spécifiques selon le mode
- **Format de fichier** : Indications pour le GeoJSON
- **Succès** : Toast vert de confirmation

---

## Personnaliser votre page

### ⚠️ Important : Fonctionnalités en développement

Certaines options de personnalisation ne sont pas encore accessibles :
- **"Gérer ma structure"** : Bouton non fonctionnel pour le moment
- **Modification du logo et des couleurs** : Non disponible actuellement

### Ce qui fonctionne déjà

#### Gérer les catégories de projets

1. Cliquez sur **"Proposer une contribution"** en bas à droite
2. Choisissez **"Gérer les catégories"**
3. Les catégories existantes s'affichent avec leurs icônes et couleurs
4. Vous pouvez **modifier** ou **supprimer** les catégories existantes
5. ⚠️ **Impossible de créer une nouvelle catégorie** : cette fonctionnalité n'est pas encore disponible

### Tags des catégories

Quand vous modifiez une catégorie, vous pouvez gérer des tags :

#### À quoi servent les tags ?
- Les tags sont des **étiquettes personnalisées** pour affiner les catégories
- Exemples : "Piste cyclable", "Zone piétonne", "Travaux 2024"
- Ils apparaissent avec **icône et couleur** personnalisées

#### Gérer les tags
- **Ajouter un tag** :
  - Nom (obligatoire)
  - Icône FontAwesome (ex: fa-tag)
  - Couleur (sélecteur de couleur)
- **Modifier un tag** : Cliquez sur le crayon ✏️
- **Supprimer un tag** : Cliquez sur la × (avec confirmation)
- **Annuler l'édition** : Bouton "Annuler" qui apparaît en mode modification

#### Détails techniques
- Les tags s'affichent sous forme de badges colorés
- Pas de doublons possibles (vérification automatique)
- Bouton "Ajouter le tag" devient "Enregistrer" en mode édition

#### Afficher les travaux en cours

1. Dans **"Gérer les catégories"**, descendez en bas
2. Vous trouverez une section **"Configuration Travaux"**
3. Activez l'option et créez des types de travaux

---

## Problèmes courants et solutions

### "La page est blanche"
- **Solution** : Rechargez la page (touche F5) et recliquez sur le lien dans votre email

### "Je ne vois pas ma structure dans le menu"
- **Solution** : Vous n'avez pas encore les droits. Contactez le support pour vous ajouter

### "Je ne peux pas valider un projet"
- **Solution** : Vérifiez que vous avez bien sélectionné la bonne structure dans le menu déroulant

### "Les projets n'apparaissent pas sur la carte"
- **Solution 1** : Vérifiez que le projet est bien "Approuvé" (pas "En attente")
- **Solution 2** : Vérifiez que la catégorie est visible dans les filtres (bouton 🗺️ en bas)

### "Mon logo ne s'affiche pas"
- **Solution** : Vérifiez que le fichier n'est pas trop gros (moins de 2MB) et au bon format (PNG ou SVG)

---

## Besoin d'aide ?

Pour toute question :

📧 **Email** : solal.gendrin@gmail.com

Pensez à préciser :
- Votre email d'administrateur
- Le nom de votre structure
- Une capture d'écran si possible

---

## Détails visuels et accessibilité

### Couleurs et icônes utilisées

- **Vert ✓** : Projets approuvés, succès
- **Orange 🕐** : Projets en attente
- **Bleu 👤** : Vos propres contributions
- **Rouge 🗑️** : Actions de suppression
- **Gris ⚠️** : Avertissements et informations

### Accessibilité

- **Navigation au clavier** : Tous les boutons sont accessibles avec Tab
- **Lecteurs d'écran** : Messages aria-label pour décrire les actions
- **Contrastes** : Respect des normes d'accessibilité
- **Messages d'état** : Informations annoncées aux technologies d'assistance

---

## Vos premiers pas

Pour commencer :

1. ✅ Connectez-vous avec le lien reçu par email
2. ✅ Cliquez sur "Proposer une contribution" en bas à droite
3. ✅ Sélectionnez votre structure en haut de la fenêtre
4. ✅ Regardez les projets en attente
5. ✅ Approuvez un projet pour tester
6. ✅ Invitez votre premier collaborateur

**Et voilà ! Vous êtes prêt à utiliser Grands Projets**

---

# Pour tous les utilisateurs

> Fonctionnalités communes aux administrateurs et contributeurs

## Détails visuels et accessibilité

### Couleurs et icônes utilisées

- **Vert ✓** : Projets approuvés, succès
- **Orange 🕐** : Projets en attente
- **Bleu 👤** : Vos propres contributions
- **Rouge 🗑️** : Actions de suppression
- **Gris ⚠️** : Avertissements et informations

### Accessibilité

- **Navigation au clavier** : Tous les boutons sont accessibles avec Tab
- **Lecteurs d'écran** : Messages aria-label pour décrire les actions
- **Contrastes** : Respect des normes d'accessibilité
- **Messages d'état** : Informations annoncées aux technologies d'assistance

---

## Vos premiers pas

Pour commencer :

1. ✅ Connectez-vous avec le lien reçu par email
2. ✅ Cliquez sur "Proposer une contribution" en bas à droite
3. ✅ Sélectionnez votre structure en haut de la fenêtre
4. ✅ Explorez les fonctionnalités selon votre rôle

**Et voilà ! Vous êtes prêt à utiliser Grands Projets** 🎉

---

*Mis à jour en mars 2026*
