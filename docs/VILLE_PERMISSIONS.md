# Gestion des permissions par ville

## Vue d'ensemble

Les utilisateurs avec les rôles `invited` et `admin` peuvent avoir des permissions limitées à certaines villes spécifiques. Cela permet de déléguer la gestion de contributions à des utilisateurs locaux sans leur donner accès à toutes les villes.

## Structure de la base de données

### Table `profiles`

La colonne `ville` a été ajoutée à la table `profiles` :

```sql
ville text[] DEFAULT NULL
```

- **Type** : Array de codes ville (text[])
- **Valeurs possibles** :
  - `NULL` : L'utilisateur peut éditer **toutes les villes** (admin global)
  - `ARRAY['lyon']` : L'utilisateur peut éditer uniquement Lyon
  - `ARRAY['lyon', 'besancon']` : L'utilisateur peut éditer Lyon et Besançon

### Migration

La migration se trouve dans : `supabase/migrations/add_ville_to_profiles.sql`

## Utilisation côté JavaScript

### Variables globales

Après authentification, les variables suivantes sont disponibles :

```javascript
window.__CONTRIB_ROLE      // 'admin', 'invited', ou ''
window.__CONTRIB_VILLES    // null (toutes) ou ['lyon', 'besancon']
window.__CONTRIB_IS_ADMIN  // boolean
```

### Fonction helper

Une fonction helper est disponible pour vérifier les permissions :

```javascript
window.canEditVille('lyon')  // true ou false
```

**Logique :**
1. Si l'utilisateur n'a pas le rôle `admin` ou `invited` → `false`
2. Si `__CONTRIB_VILLES` est `null` → `true` (admin global)
3. Si `__CONTRIB_VILLES` contient le code ville → `true`
4. Sinon → `false`

### Exemple d'utilisation

```javascript
// Vérifier avant de permettre l'édition d'une contribution
const villeCode = 'lyon';
if (window.canEditVille(villeCode)) {
  // Autoriser l'édition
  showEditButton();
} else {
  // Masquer ou désactiver l'édition
  hideEditButton();
}

// Filtrer les contributions éditables
const contributions = await fetchContributions();
const editableContributions = contributions.filter(c => 
  window.canEditVille(c.ville)
);
```

## Configuration des utilisateurs

### Exemples SQL

```sql
-- Admin global (peut éditer toutes les villes)
UPDATE public.profiles 
SET ville = NULL 
WHERE email = 'superadmin@example.com';

-- Admin local Lyon uniquement
UPDATE public.profiles 
SET ville = ARRAY['lyon'] 
WHERE email = 'admin.lyon@example.com';

-- Contributeur invité pour Lyon et Besançon
UPDATE public.profiles 
SET ville = ARRAY['lyon', 'besancon'] 
WHERE email = 'contributor@example.com';
```

### Via l'interface admin (à implémenter)

Un panneau d'administration pourrait permettre de :
1. Lister tous les utilisateurs
2. Modifier leur rôle
3. Sélectionner les villes autorisées via des checkboxes

## Codes ville

Les codes ville doivent correspondre aux valeurs utilisées dans l'application :

- `'lyon'` : Lyon
- `'besancon'` : Besançon
- (Ajouter d'autres villes au besoin)

## Sécurité

### RLS (Row Level Security)

⚠️ **Important** : Cette fonctionnalité côté client doit être complétée par des politiques RLS côté Supabase pour garantir la sécurité.

Exemple de politique RLS pour `contribution_uploads` :

```sql
-- Politique de lecture : tout le monde peut lire
CREATE POLICY "Public read access" ON public.contribution_uploads
FOR SELECT USING (true);

-- Politique d'écriture : uniquement les utilisateurs autorisés pour cette ville
CREATE POLICY "Authenticated users can insert for their cities" 
ON public.contribution_uploads
FOR INSERT 
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE (role = 'admin' OR role = 'invited')
    AND (ville IS NULL OR ville @> ARRAY[contribution_uploads.ville])
  )
);

-- Politique de mise à jour : uniquement les utilisateurs autorisés pour cette ville
CREATE POLICY "Authenticated users can update for their cities" 
ON public.contribution_uploads
FOR UPDATE 
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE (role = 'admin' OR role = 'invited')
    AND (ville IS NULL OR ville @> ARRAY[contribution_uploads.ville])
  )
);
```

## TODO

- [ ] Implémenter l'interface admin pour gérer les permissions
- [ ] Ajouter les politiques RLS côté Supabase
- [ ] Filtrer la liste des contributions dans le panneau "Modifier" selon les permissions
- [ ] Afficher un message d'erreur si l'utilisateur tente d'éditer une ville non autorisée
- [ ] Ajouter des tests unitaires pour `canEditVille()`
