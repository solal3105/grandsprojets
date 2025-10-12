# 🔧 Fix : Bouton "Ajouter une ville" ne fonctionnait pas

## 🐛 Problème

Le bouton "Ajouter une ville" ne faisait rien au clic.

## 🔍 Diagnostic

### Code dans `contrib.js` (ligne 1012)
```javascript
case 'add-city-btn':
  const citiesElements = { citiesListEl, citiesStatusEl };
  ContribCitiesManagement.showAddCityModal?.(citiesElements);
  break;
```

### Exports dans `contrib-cities-management.js`
```javascript
win.ContribCitiesManagement = {
  loadCitiesList,
  showCityModal  // ❌ La fonction exportée s'appelle showCityModal
};
```

**❌ Problème** : Le code appelait `showAddCityModal()` mais la fonction exportée était `showCityModal`

## ✅ Solution

Ajout d'un alias `showAddCityModal` dans les exports :

```javascript
win.ContribCitiesManagement = {
  loadCitiesList,
  showCityModal,
  showAddCityModal: (elements) => showCityModal(null, elements) // ✅ Alias
};
```

## 🔍 Amélioration : Logs de debug

Ajout de logs dans `initializeCityMap()` pour faciliter le debug :

```javascript
console.log('[city-map] Elements found:', { 
  mapEl, coordsEl, searchInput, geolocateBtn, resetBtn 
});

// Check DOM elements
if (!mapEl) {
  console.error('[city-map] Map element #city-map not found');
  showToast('Erreur : élément carte introuvable', 'error');
  return null;
}
```

Ces logs permettront d'identifier rapidement si :
- Les éléments DOM ne sont pas trouvés
- Leaflet n'est pas chargé
- La carte ne s'initialise pas

## 🧪 Test

1. Se connecter en tant qu'admin
2. Aller dans "Gérer les villes"
3. Cliquer sur "Ajouter une ville"
4. ✅ La modale devrait s'ouvrir
5. ✅ La carte Leaflet devrait s'afficher
6. ✅ La console devrait afficher les logs de debug

## 📝 Fichiers modifiés

- `modules/contrib/contrib-cities-management.js`
  - Ligne 913 : Ajout de l'alias `showAddCityModal`
  - Ligne 471-477 : Ajout de logs de debug
