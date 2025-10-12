# ✅ Fix : Affichage du markdown et documents en mode édition

## 🐛 Problèmes identifiés

1. **Markdown** : Ne se réaffichait pas en mode édition
2. **Documents PDF** : Ne s'affichaient pas dans la liste des documents existants

## 🔧 Corrections appliquées

### 1. Markdown - `contrib-create-form-v2.js`

**Problème** : Le code essayait de lire `data.markdown` mais la DB stocke `markdown_url`

**Solution** : Chargement du contenu depuis l'URL
```javascript
// Charger le markdown depuis l'URL
if (data.markdown_url && elements.mdEl) {
  fetch(data.markdown_url)
    .then(response => response.text())
    .then(mdContent => {
      elements.mdEl.value = mdContent;
    })
    .catch(err => {
      console.warn('[contrib-create-form-v2] Failed to load markdown:', err);
    });
}
```

### 2. Documents PDF - `supabaseservice.js`

**Problème** : La fonction `fetchConsultationDossiers` n'existait pas

**Solution** : Création de la fonction
```javascript
fetchConsultationDossiers: async function(projectName, category = null) {
  if (!projectName) return [];
  let query = supabaseClient
    .from('consultation_dossiers')
    .select('id, project_name, category, title, pdf_url')
    .eq('project_name', projectName)
    .order('id', { ascending: true });
  
  if (category) {
    query = query.eq('category', category);
  }
  
  const { data, error } = await query;
  if (error) {
    console.warn('[supabaseService] fetchConsultationDossiers error:', error);
    return [];
  }
  return data || [];
}
```

## ✅ Fonctionnement

### En mode édition (étape 1)
- ✅ Nom du projet pré-rempli
- ✅ Catégorie pré-remplie
- ✅ Meta pré-remplie
- ✅ Description pré-remplie
- ✅ **Markdown chargé depuis l'URL** (nouveau)
- ✅ URL officielle pré-remplie
- ✅ Cover affichée en preview

### En mode édition (étape 4)
- ✅ **Documents PDF existants listés** (nouveau)
- ✅ Possibilité de modifier le titre
- ✅ Possibilité de supprimer
- ✅ Possibilité d'ajouter de nouveaux documents

## 🧪 Test

1. Modifier une contribution existante avec markdown et documents
2. Le markdown doit apparaître dans le textarea
3. À l'étape 4, les documents PDF doivent être listés
4. Vous pouvez modifier les titres et supprimer des documents
