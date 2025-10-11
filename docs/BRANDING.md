# Système de Branding par Ville

## Vue d'ensemble

Le système de branding permet aux administrateurs de personnaliser la couleur primaire pour chaque ville. Cette couleur est appliquée automatiquement lors du chargement de la page en fonction de la ville active.

## Architecture

### Base de données

**Table : `city_branding`**
```sql
- id (UUID) : Identifiant unique
- ville (TEXT) : Nom de la ville (unique)
- primary_color (TEXT) : Couleur primaire au format #RRGGBB
- updated_at (TIMESTAMP) : Date de dernière modification
- updated_by (UUID) : Utilisateur ayant effectué la modification
```

### Modules

1. **`modules/citybranding.js`**
   - Module principal de gestion du branding
   - Fonctions :
     - `getBrandingForCity(ville)` : Récupère la config pour une ville
     - `applyPrimaryColor(color)` : Applique la couleur au document
     - `loadAndApplyBranding(ville)` : Charge et applique automatiquement
     - `updateCityBranding(ville, color)` : Met à jour la config (admin)
     - `getAllBranding()` : Récupère toutes les configurations

2. **`modules/contrib/contrib-branding.js`**
   - Interface admin dans le menu des contributions
   - Onglet "🎨 Branding" visible uniquement pour les admins
   - Permet de modifier la couleur primaire pour chaque ville

### Flux de données

```
1. Page load → main.js
2. Ville active déterminée → CityManager
3. Branding chargé → CityBrandingModule.loadAndApplyBranding(city)
4. Couleur appliquée → document.documentElement.style.setProperty('--color-primary', color)
5. Toutes les variables CSS dérivées sont automatiquement mises à jour
```

## Utilisation

### Pour les administrateurs

1. Ouvrir le menu des contributions
2. Cliquer sur l'onglet "🎨 Branding"
3. Sélectionner une couleur avec le color picker ou saisir un code hex
4. Cliquer sur "Enregistrer"
5. La couleur est appliquée immédiatement si c'est la ville active

### Pour les développeurs

#### Charger le branding au démarrage

```javascript
import CityBrandingModule from './modules/citybranding.js';

// Charger et appliquer le branding pour une ville
await CityBrandingModule.loadAndApplyBranding('lyon');
```

#### Mettre à jour le branding

```javascript
// Mettre à jour la couleur primaire pour une ville
await CityBrandingModule.updateCityBranding('lyon', '#FF5733');
```

#### Récupérer toutes les configurations

```javascript
const brandings = await CityBrandingModule.getAllBranding();
console.log(brandings);
// [
//   { ville: 'lyon', primary_color: '#21b929', ... },
//   { ville: 'besancon', primary_color: '#FF5733', ... }
// ]
```

## Sécurité

### Row Level Security (RLS)

- **Lecture** : Publique (anon + authenticated)
- **Écriture** : Authentifié uniquement (authenticated)

### Validation

- Format de couleur : `#RRGGBB` (6 caractères hexadécimaux)
- Validation côté client et serveur

## Migration

Pour appliquer la migration :

```bash
# Via Supabase CLI
supabase db push

# Ou via l'interface Supabase
# SQL Editor → Copier le contenu de supabase/migrations/add_city_branding.sql
```

## Variables CSS affectées

Lorsque `--color-primary` est modifiée, toutes les variables dérivées sont automatiquement mises à jour :

- `--primary`
- `--primary-hover`
- `--primary-active`
- `--primary-light`
- `--primary-lighter`
- `--primary-alpha-*` (toutes les variantes avec transparence)

## Exemples de couleurs

```css
/* Vert (défaut) */
--color-primary: #21b929;

/* Bleu */
--color-primary: #2563EB;

/* Rouge */
--color-primary: #EF4444;

/* Jaune */
--color-primary: #ffdd00;

/* Violet */
--color-primary: #8B5CF6;
```

## Dépannage

### La couleur ne s'applique pas

1. Vérifier que la ville est correctement définie
2. Vérifier la console pour les erreurs
3. Vérifier que la table `city_branding` existe
4. Vérifier les permissions RLS

### La couleur ne persiste pas

1. Vérifier que l'utilisateur est authentifié
2. Vérifier les permissions de la table
3. Vérifier les logs Supabase

### L'onglet Branding n'apparaît pas

1. Vérifier que l'utilisateur est authentifié
2. Vérifier que le module `contrib-branding.js` est chargé
3. Vérifier la console pour les erreurs d'import

## Améliorations futures

- [ ] Gestion des permissions par rôle (admin vs user)
- [ ] Prévisualisation en temps réel
- [ ] Palette de couleurs prédéfinies
- [ ] Personnalisation d'autres couleurs (danger, info, warning)
- [ ] Historique des modifications
- [ ] Import/export de configurations
