# Analyse du Bug - Modale d'Édition ne s'ouvre pas

## 🐛 Erreur

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#create-modal-overlay') to be visible
    18 × locator resolved to hidden <div aria-hidden="true" id="create-modal-overlay">
```

## 📊 Flux Actuel

### 1. Test clique sur "Modifier" (ligne 441)
```javascript
await editBtn.click();
```

### 2. Callback `sharedOnEdit` est appelé (contrib.js:1243-1259)
```javascript
const sharedOnEdit = async (item) => {
  try {
    console.log('[sharedOnEdit] Ouverture édition pour:', item);
    const row = await supabaseService.getContributionById(item.id);
    console.log('[sharedOnEdit] Données chargées:', row);
    if (row) {
      console.log('[sharedOnEdit] Appel de openCreateModal...');
      await openCreateModal('edit', row);  // ⬅️ ICI
      console.log('[sharedOnEdit] Modale ouverte avec succès');
    }
  } catch (e) {
    console.error('[sharedOnEdit] Erreur:', e);
    showToast('Erreur lors du chargement de la contribution.', 'error');
  }
};
```

### 3. `openCreateModal('edit', row)` est appelé (contrib.js:2187-2375)

**Étapes critiques** :
```javascript
async function openCreateModal(mode = 'create', data = {}) {
  // 1. Charger le template HTML si pas déjà chargé
  const loaded = await loadCreateModalTemplate();
  if (!loaded) {
    showToast('Erreur de chargement du formulaire', 'error');
    return;  // ⚠️ SORTIE SILENCIEUSE
  }
  
  // 2. Récupérer la ville depuis data.ville
  const selectedCity = data.ville || null;
  console.log('[openCreateModal] ✅ City from data.ville:', selectedCity);
  
  if (!selectedCity) {
    console.error('[openCreateModal] ❌ ERREUR: Aucune ville dans data.ville !');
    showToast('Erreur: Aucune ville sélectionnée', 'error');
    return;  // ⚠️ SORTIE SILENCIEUSE
  }
  
  // 3. Charger les catégories
  const categories = await supabaseService.getCategoryIconsByCity(selectedCity);
  
  // 4. Initialiser le formulaire
  formInstance = ContribCreateForm.initCreateForm({
    form,
    overlay,
    mode,
    data,
    onClose: closeModal,
    onSuccess,
    onRefreshList
  });
  
  // 5. Ouvrir la modale
  overlay.setAttribute('aria-hidden', 'false');
  overlay.inert = false;
  
  const modalInner = overlay.querySelector('.gp-modal');
  if (modalInner) {
    requestAnimationFrame(() => {
      modalInner.classList.add('is-open');
    });
  }
}
```

## 🔍 Points de Défaillance Possibles

### **A. Template HTML non chargé**
```javascript
const loaded = await loadCreateModalTemplate();
if (!loaded) {
  return;  // ❌ Modale ne s'ouvre pas
}
```

**Vérification** : Le template est-il déjà dans le DOM ?
- Si c'est le premier appel → `fetch('modules/contrib/contrib-create-modal.html')`
- Si déjà chargé → `createModalLoaded = true` → skip

**Problème potentiel** : 
- Erreur réseau lors du fetch
- Template HTML corrompu
- Container `#contrib-modal-container` absent

### **B. Ville manquante dans `data`**
```javascript
const selectedCity = data.ville || null;
if (!selectedCity) {
  showToast('Erreur: Aucune ville sélectionnée', 'error');
  return;  // ❌ Modale ne s'ouvre pas
}
```

**Vérification** : `row.ville` est-il présent ?
- `getContributionById()` retourne bien `{ ville: 'lyon', ... }` ?
- La colonne `ville` existe dans la DB ?
- La contribution a bien une ville assignée ?

**Problème potentiel** :
- Contribution créée avec `ville = null` (bug précédent corrigé ?)
- RLS Supabase ne retourne pas la colonne `ville`
- Mapping incorrect dans `getContributionById()`

### **C. Erreur lors du chargement des catégories**
```javascript
const categories = await supabaseService.getCategoryIconsByCity(selectedCity);
```

**Problème potentiel** :
- Exception non catchée qui empêche l'exécution de continuer
- Timeout sur la requête Supabase

### **D. Modale déjà ouverte / État incohérent**

**Problème potentiel** :
- `#create-modal-overlay` a `aria-hidden="true"` ET `inert="true"`
- Mais le code ne les réinitialise pas correctement
- Ou une erreur JS empêche l'exécution d'arriver à la ligne 2359

### **E. Panel Liste interfère**

Le test est dans le **panel liste** :
```javascript
await clickEditContributions(page);  // Ouvre le panel liste
await editBtn.click();               // Clique sur Modifier
```

**Problème potentiel** :
- La modale `#create-modal-overlay` est une **sous-modale** dans le panel liste
- Elle doit s'ouvrir PAR-DESSUS le panel liste
- Mais peut-être que le panel liste a `inert="true"` ou est caché ?

## 🎯 Pistes de Correction

### **1. Ajouter des logs détaillés**

Dans `openCreateModal()` :
```javascript
async function openCreateModal(mode = 'create', data = {}) {
  console.log('[openCreateModal] START - mode:', mode, 'data:', data);
  
  const loaded = await loadCreateModalTemplate();
  console.log('[openCreateModal] Template loaded:', loaded);
  if (!loaded) {
    console.error('[openCreateModal] FAILED: Template not loaded');
    showToast('Erreur de chargement du formulaire', 'error');
    return;
  }
  
  const overlay = document.getElementById('create-modal-overlay');
  console.log('[openCreateModal] Overlay found:', !!overlay);
  
  const selectedCity = data.ville || null;
  console.log('[openCreateModal] City:', selectedCity);
  if (!selectedCity) {
    console.error('[openCreateModal] FAILED: No city');
    showToast('Erreur: Aucune ville sélectionnée', 'error');
    return;
  }
  
  console.log('[openCreateModal] Loading categories...');
  const categories = await supabaseService.getCategoryIconsByCity(selectedCity);
  console.log('[openCreateModal] Categories loaded:', categories?.length);
  
  console.log('[openCreateModal] Initializing form...');
  formInstance = ContribCreateForm.initCreateForm({...});
  console.log('[openCreateModal] Form initialized:', !!formInstance);
  
  console.log('[openCreateModal] Opening modal...');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.inert = false;
  console.log('[openCreateModal] Modal opened - aria-hidden:', overlay.getAttribute('aria-hidden'));
}
```

### **2. Vérifier `getContributionById()`**

```javascript
// Dans supabaseservice.js
async function getContributionById(id) {
  const { data, error } = await supabaseClient
    .from('contribution_uploads')
    .select('*')  // ⚠️ Vérifier que 'ville' est bien retourné
    .eq('id', id)
    .single();
    
  console.log('[getContributionById] Result:', data);
  console.log('[getContributionById] ville:', data?.ville);
  
  return data;
}
```

### **3. Ajouter un try/catch global**

```javascript
const sharedOnEdit = async (item) => {
  try {
    console.log('[sharedOnEdit] START - item:', item);
    const row = await supabaseService.getContributionById(item.id);
    console.log('[sharedOnEdit] Row loaded:', row);
    
    if (row) {
      console.log('[sharedOnEdit] Calling openCreateModal...');
      await openCreateModal('edit', row);
      console.log('[sharedOnEdit] SUCCESS');
    } else {
      console.error('[sharedOnEdit] FAILED: No row');
    }
  } catch (e) {
    console.error('[sharedOnEdit] EXCEPTION:', e);
    console.error('[sharedOnEdit] Stack:', e.stack);
    showToast('Erreur lors du chargement de la contribution.', 'error');
  }
};
```

### **4. Attendre que la modale soit vraiment ouverte**

Dans le test :
```javascript
await editBtn.click();

// ❌ AVANT : Attendre immédiatement
await page.waitForSelector('#create-modal-overlay', { state: 'visible', timeout: 10000 });

// ✅ APRÈS : Attendre que aria-hidden passe à false
await page.waitForFunction(() => {
  const modal = document.querySelector('#create-modal-overlay');
  return modal && modal.getAttribute('aria-hidden') === 'false';
}, { timeout: 10000 });

// Puis attendre que .gp-modal ait la classe is-open
await page.waitForSelector('#create-modal-overlay .gp-modal.is-open', { 
  state: 'visible', 
  timeout: 5000 
});
```

### **5. Vérifier l'état du panel liste**

```javascript
// Dans le test, avant de cliquer sur Modifier
const panelList = await page.locator('#contrib-panel-list');
const isVisible = await panelList.isVisible();
const isInert = await panelList.evaluate(el => el.inert);
console.log('[Test] Panel liste - visible:', isVisible, 'inert:', isInert);
```

## 🔧 Correction Recommandée

**Étape 1** : Ajouter des logs dans `openCreateModal()` et `sharedOnEdit()`

**Étape 2** : Vérifier que `getContributionById()` retourne bien `ville`

**Étape 3** : Dans le test, attendre `aria-hidden="false"` au lieu de `state: 'visible'`

**Étape 4** : Ajouter un délai après le clic pour laisser le temps à l'async
