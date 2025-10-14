# Migration : Corriger les contributions avec ville = null

## Problème

Certaines contributions ont été créées avec `ville = null` à cause d'un bug dans `contrib-form.js` (ligne 416) qui mettait `ville: null` pour les invited lors de l'update.

Ces contributions :
- ❌ Ne peuvent pas être éditées (modale ne s'ouvre pas)
- ❌ Ne sont pas filtrées correctement par ville
- ❌ Peuvent causer des erreurs dans les requêtes

## Solution Appliquée

### 1. **Correction du Bug** ✅
- `contrib-form.js` : Ne plus écraser `ville` avec `null` lors de l'update
- `contrib.js` : Fallback sur `__CONTRIB_ACTIVE_CITY` si `data.ville` est `null`
- `contrib-form.js` : Auto-correction lors de l'édition si `ville = null`

### 2. **Migration des Données Existantes**

#### Option A : Via Supabase Dashboard (Recommandé)

```sql
-- Voir combien de contributions ont ville = null
SELECT COUNT(*) 
FROM contribution_uploads 
WHERE ville IS NULL;

-- Voir les détails
SELECT id, project_name, category, created_at, created_by
FROM contribution_uploads 
WHERE ville IS NULL
ORDER BY created_at DESC;

-- ⚠️ ATTENTION : Cette requête met TOUTES les contributions null à 'lyon'
-- Adapter selon votre cas d'usage
UPDATE contribution_uploads
SET ville = 'lyon'
WHERE ville IS NULL;

-- Vérification
SELECT COUNT(*) 
FROM contribution_uploads 
WHERE ville IS NULL;
-- Devrait retourner 0
```

#### Option B : Via Script Node.js

Créer un fichier `scripts/fix-ville-null.js` :

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixVilleNull() {
  console.log('🔍 Recherche des contributions avec ville = null...');
  
  const { data: nullVilleContribs, error } = await supabase
    .from('contribution_uploads')
    .select('id, project_name, category, created_by')
    .is('ville', null);
    
  if (error) {
    console.error('❌ Erreur:', error);
    return;
  }
  
  console.log(`📊 ${nullVilleContribs.length} contribution(s) trouvée(s)`);
  
  if (nullVilleContribs.length === 0) {
    console.log('✅ Aucune correction nécessaire');
    return;
  }
  
  // Afficher les contributions
  console.table(nullVilleContribs);
  
  // Demander confirmation
  console.log('\n⚠️  Ces contributions seront mises à jour avec ville = "lyon"');
  console.log('Appuyez sur Ctrl+C pour annuler, ou Entrée pour continuer...');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  // Mettre à jour
  console.log('🔧 Mise à jour...');
  
  for (const contrib of nullVilleContribs) {
    const { error: updateError } = await supabase
      .from('contribution_uploads')
      .update({ ville: 'lyon' })
      .eq('id', contrib.id);
      
    if (updateError) {
      console.error(`❌ Erreur pour ID ${contrib.id}:`, updateError);
    } else {
      console.log(`✅ ID ${contrib.id} (${contrib.project_name}) mis à jour`);
    }
  }
  
  console.log('✅ Migration terminée');
}

fixVilleNull().catch(console.error);
```

Exécuter :
```bash
node scripts/fix-ville-null.js
```

#### Option C : Correction Automatique au Runtime

Le code actuel dans `contrib-form.js` (lignes 424-431) corrige automatiquement `ville = null` lors de l'édition d'une contribution.

**Avantages** :
- ✅ Pas besoin de migration manuelle
- ✅ Correction progressive au fur et à mesure des éditions

**Inconvénients** :
- ❌ Les contributions jamais éditées restent avec `ville = null`
- ❌ Peut causer des problèmes de filtrage en attendant

## Recommandation

**Exécuter la migration SQL via Supabase Dashboard** pour corriger immédiatement toutes les contributions existantes :

```sql
UPDATE contribution_uploads
SET ville = 'lyon'
WHERE ville IS NULL;
```

Puis vérifier :
```sql
SELECT id, project_name, ville 
FROM contribution_uploads 
ORDER BY created_at DESC 
LIMIT 20;
```

Toutes les contributions devraient maintenant avoir une ville assignée ! ✅
