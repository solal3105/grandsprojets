import L from 'leaflet';
import { FilterModule } from './filtermodule.js';
import { MapModule } from './mapmodule.js';
import { DataModule } from './datamodule.js';
import { NavigationModule } from './navigationmodule.js';


// modules/UIModule.js
// Module de gestion de l'interface utilisateur : filtres et popups
export const UIModule = (function() {
  // État global des popups
  const popupState = {
    filter: { isOpen: false, element: null },
    basemap: { isOpen: false, element: null }
  };

  // Initialisation des éléments du DOM
  let filterToggle, basemapToggle;

  const initElements = () => {
    popupState.filter.element = document.getElementById('filters-container');
    popupState.basemap.element = document.getElementById('basemap-menu');
    filterToggle = document.getElementById('filters-toggle');
    basemapToggle = document.getElementById('basemap-toggle');

    if (!popupState.filter.element || !popupState.basemap.element || !filterToggle || !basemapToggle) {
      console.error('Éléments du DOM non trouvés');
      return false;
    }
    return true;
  };

  // Ferme tous les popups sauf celui spécifié
  const closeOtherPopups = (currentPopup) => {
    Object.entries(popupState).forEach(([key, popup]) => {
      if (key !== currentPopup && popup.element) {
        popup.isOpen = false;
        if (key === 'filter') {
          popup.element.style.display = 'none';
        } else {
          popup.element.classList.remove('open');
        }
      }
    });
  };

  // Gestionnaire de clic en dehors des popups
  const handleClickOutside = (event) => {
    const isClickInsideFilter = popupState.filter.element?.contains(event.target);
    const isClickOnFilterToggle = filterToggle?.contains(event.target);
    const isClickInsideBasemap = popupState.basemap.element?.contains(event.target);
    const isClickOnBasemapToggle = basemapToggle?.contains(event.target);

    if (!isClickInsideFilter && !isClickOnFilterToggle) {
      popupState.filter.isOpen = false;
      popupState.filter.element.style.display = 'none';
    }

    if (!isClickInsideBasemap && !isClickOnBasemapToggle) {
      popupState.basemap.isOpen = false;
      popupState.basemap.element.classList.remove('open');
    }
  };
  /**
   * Affiche ou masque les sous-filtres pour une couche donnée.
   * @param {string} layerName - Nom de la couche.
   */
  const toggleSubFilters = layerName => {
    console.log('toggleSubFilters called for', layerName);
    const filterItem = document.querySelector(`.filter-item[data-layer="${layerName}"]`);
    const container  = document.querySelector(`.subfilters-container[data-layer="${layerName}"]`);
    console.log('toggleSubFilters: elements:', {filterItem, container});
    console.log('toggleSubFilters: elements:', filterItem, container);
  if (!filterItem || !container) {
        console.log('toggleSubFilters: missing DOM elements for', layerName, {filterItem, container});
        return;
      }

    // Basculer l'état du filtre
    filterItem.classList.toggle('active-filter');
      console.log('toggleSubFilters: active-filter state for', layerName, filterItem.classList.contains('active-filter'));

    // Si le filtre n'est pas actif, masquer les sous-filtres
    if (!filterItem.classList.contains('active-filter')) {
      container.style.display = 'none';
      MapModule.removeLayer(layerName);
      return;
    }

    // Afficher le panneau et construire le contenu
    buildSubFilters(layerName);
  };

  /**
   * Construit le contenu des sous-filtres pour une couche SANS modifier l'état actif du filtre.
   * Utilisé par le clic sur l'icône ⚙️ pour éviter de désactiver la couche.
   * @param {string} layerName
   */
  const buildSubFilters = (layerName) => {
    const container = document.querySelector(`.subfilters-container[data-layer="${layerName}"]`);
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = '<p>Chargement des sous-filtres...</p>';

    const render = (features) => {
      const list = Array.isArray(features) ? features : [];
      if (!list.length) {
        container.innerHTML = '<p>Aucune donnée disponible pour filtrer.</p>';
        return;
      }
      container.innerHTML = '';
      // layer_info_config supprimé: utiliser directement les propriétés du GeoJSON
      const keys = Object.keys(list[0].properties || {});

      keys.forEach(key => {
        const values = [...new Set(list.map(f => f.properties?.[key]))]
          .filter(v => v != null)
          .sort();
        const group = document.createElement('div');
        group.className = 'filter-group';
        const label = document.createElement('label');
        label.textContent = key;
        label.htmlFor = `filter-${layerName}-${key}`;
        group.appendChild(label);

        let input;
        if (typeof values[0] === 'number') {
          input = document.createElement('input');
          input.type = 'range';
          input.min = Math.min(...values);
          input.max = Math.max(...values);
          input.value = input.min;
        } else {
          input = document.createElement('select');
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Tous';
          input.appendChild(defaultOpt);
          values.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            input.appendChild(opt);
          });
        }
        input.id = `filter-${layerName}-${key}`;
        input.dataset.field = key;
        input.addEventListener('change', () => applyFilter(layerName, getCurrentCriteria(layerName)));
        group.appendChild(input);
        container.appendChild(group);
      });
    };

    // Utiliser les données déjà chargées si disponibles, sinon charger
    const cached = DataModule.layerData?.[layerName]?.features;
    if (Array.isArray(cached)) {
      render(cached);
    } else {
      console.log('buildSubFilters: loading layer', layerName);
      DataModule.loadLayer(layerName)
        .then(data => {
          console.log('buildSubFilters: loadLayer resolved for', layerName, data);
          render(data.features || []);
        })
        .catch(err => {
          console.error('Erreur lors du chargement de la couche:', err);
          container.innerHTML = '<p>Impossible de charger la couche.</p>';
        });
    }
  };

  /**
   * Récupère les critères de filtre actuellement sélectionnés.
   * @param {string} layerName
   * @returns {Object} Critères de filtrage
   */
  const getCurrentCriteria = layerName => {
    const container = document.querySelector(`.subfilters-container[data-layer=\"${layerName}\"]`);
    const criteria = {};
    if (!container) return criteria;
    container.querySelectorAll('[data-field]').forEach(el => {
      const val = el.value;
      if (val !== '' && val != null) {
        criteria[el.dataset.field] = el.value;
      }
    });
    return criteria;
  };

  /**
   * Met à jour l'affichage des tags de filtres actifs pour une couche.
   * @param {string} layerName
   */
  const updateActiveFilterTagsForLayer = layerName => {
    const tagsContainer = document.querySelector(`.active-filter-tags[data-layer=\"${layerName}\"]`);
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';

    const criteria = FilterModule.get(layerName);
    Object.entries(criteria).forEach(([key, value]) => {
      const tag = document.createElement('span');
      tag.className = 'active-filter-tag';
      
      // Afficher 'Exclure les réseaux' pour le filtre _hideReseaux
      const displayText = key === '_hideReseaux' ? 'Exclure les réseaux' : value;
      tag.textContent = `${displayText} `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '&times;';
      btn.style.cssText = 'margin-left:4px;border:none;background:none;cursor:pointer;';
      btn.addEventListener('click', () => {
        delete criteria[key];
        FilterModule.set(layerName, criteria);
        DataModule.loadLayer(layerName).then(() => {
          updateActiveFilterTagsForLayer(layerName);
        });
      });

      tag.appendChild(btn);
      tagsContainer.appendChild(tag);
    });
  };

  /**
   * Applique les critères de filtre et recharge la couche.
   */
  const applyFilter = (layerName, criteria) => {
    FilterModule.set(layerName, criteria);
    MapModule.removeLayer(layerName);
    DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
    updateActiveFilterTagsForLayer(layerName);
  };

  /**
   * Réinitialise le filtre d'une couche et recharge la carte.
   */
  const resetLayerFilter = layerName => {
    FilterModule.reset(layerName);
    MapModule.removeLayer(layerName);
    updateActiveFilterTagsForLayer(layerName);
  };

  /**
   * Réinitialise le filtre sans retirer la couche de la carte.
   */
  const resetLayerFilterWithoutRemoving = layerName => {
    FilterModule.reset(layerName);
    updateActiveFilterTagsForLayer(layerName);
  };

  /**
   * Affiche ou masque les popups (filtres ou basemap).
   * @param {'filter'|'basemap'} popupType
   */
  const togglePopup = (popupType) => {
    if (!popupState[popupType] || !popupState[popupType].element) {
      console.warn(`Type de popup invalide ou élément non trouvé: ${popupType}`);
      return;
    }

    // Basculer l'état d'ouverture
    popupState[popupType].isOpen = !popupState[popupType].isOpen;
    const target = popupState[popupType];

    // Fermer les autres popups
    closeOtherPopups(popupType);

    // Mettre à jour l'affichage
    if (popupType === 'filter') {
      if (target.isOpen) {
        target.element.style.display = 'block';
        const rect = filterToggle.getBoundingClientRect();
        target.element.style.top = `${rect.bottom + 10}px`;
        target.element.style.right = `${window.innerWidth - rect.right}px`;
      } else {
        target.element.style.display = 'none';
      }
    } else { // basemap
      target.element.classList.toggle('open', target.isOpen);
    }
  };

  // Initialisation du module
  const init = (options = {}) => {
    if (!initElements()) return false;
    
    // Initialisation du menu basemap si les fonds sont disponibles
    if (options.basemaps) {
      initBasemapMenu(options.basemaps);
    }
    
    // Ajout du gestionnaire de clic en dehors des popups
    document.addEventListener('click', handleClickOutside);
    
    // Empêcher la propagation des clics à l'intérieur des popups
    popupState.filter.element?.addEventListener('click', (e) => e.stopPropagation());
    popupState.basemap.element?.addEventListener('click', (e) => e.stopPropagation());
    
    return true;
  };
  
  // Fonction pour mettre à jour les fonds de carte après le chargement initial
  const updateBasemaps = (basemaps) => {
    if (!basemaps || !Array.isArray(basemaps) || basemaps.length === 0) {
      console.warn('Aucun fond de carte valide fourni');
      return false;
    }
    window.basemaps = basemaps;
    initBasemapMenu(basemaps);
    return true;
  };
  
  // Initialisation du menu des fonds de carte
  const initBasemapMenu = (basemaps = null) => {
    const menu = popupState.basemap.element;
    if (!menu) return false;
    
    menu.innerHTML = '';
    
    // Utiliser les basemaps fournis en paramètre ou ceux de window
    const availableBasemaps = basemaps || window.basemaps;
    
    // Vérification de l'existence des basemaps
    if (!availableBasemaps || !Array.isArray(availableBasemaps) || availableBasemaps.length === 0) {
      console.warn('Aucun fond de carte valide disponible');
      return false;
    }
    
    const defaultBm = availableBasemaps.find(b => b.default) || availableBasemaps[0];
    
    availableBasemaps.forEach(bm => {
      const tile = document.createElement('div');
      tile.className = 'basemap-tile';
      tile.textContent = bm.label;
      if (bm.label === defaultBm.label) tile.classList.add('active-basemap');

      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        const layer = L.tileLayer(bm.url, { attribution: bm.attribution });
        MapModule?.setBaseLayer(layer);
        
        // Mise à jour de l'état visuel
        document.querySelectorAll('.basemap-tile')
          .forEach(t => t.classList.remove('active-basemap'));
        tile.classList.add('active-basemap');
        
        // Fermer le menu après la sélection
        togglePopup('basemap');
      });

      menu.appendChild(tile);
    });
  };

  /**
   * Affiche le panneau de détail pour une feature
   * @param {string} layerName - Nom de la couche
   * @param {Object} feature - Feature sélectionnée
   * @param {{ updateHistory?: boolean }} [options]
   */
  const showDetailPanel = (layerName, feature, options = {}) => {
    console.log('Affichage du détail pour:', { layerName, feature });
    const { updateHistory = true } = options;
    // Utilitaire local de slugification (harmonisé avec les autres modules)
    const slugify = (str) => String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    
    // Vérifier si NavigationModule est disponible
    if (NavigationModule?.showProjectDetail) {
      const props = feature.properties || {};
      
      // Utiliser project_name en priorité (injecté par fetchLayerData depuis contribution_uploads)
      let projectName = props.project_name || props.name || props.Name || props.line || props.LIBELLE;
      let category = props.category; // Catégorie directement depuis contribution_uploads
      
      // Fallback sur la détection par layerName si pas de catégorie
      if (!category) {
        if (layerName.includes('voielyonnaise')) category = 'velo';
        else if (layerName.includes('reseauProjete') || layerName.includes('metro') || layerName.includes('tramway')) category = 'transport';
        else if (layerName.includes('urbanisme')) category = 'urbanisme';
        else category = 'autre';
      }
      
      if (projectName) {
        // Ajustement du nom d'affichage pour Voie Lyonnaise
        let displayName = projectName;
        if (layerName.includes('voielyonnaise') && !projectName.startsWith('Voie Lyonnaise')) {
          displayName = `Voie Lyonnaise ${projectName}`;
        }
        
        // Passer directement les données enrichies à showProjectDetail
        NavigationModule.showProjectDetail(displayName, category, null, props);

        // Mettre à jour l'URL pour refléter l'état courant (sauf si désactivé)
        try {
          if (updateHistory && typeof history?.pushState === 'function') {
            const catForUrl = category || (layerName.includes('voielyonnaise') ? 'velo'
              : (layerName.includes('urbanisme') ? 'urbanisme'
              : (layerName.includes('reseauProjete') || layerName.includes('metro') || layerName.includes('tramway')) ? 'transport' : 'autre'));
            const projSlug = slugify(displayName);
            const params = new URLSearchParams();
            params.set('cat', catForUrl);
            params.set('project', projSlug);
            const newUrl = `${location.pathname}?${params.toString()}`;
            history.pushState({ cat: catForUrl, project: projSlug }, '', newUrl);
          }
        } catch(_) { /* noop */ }
      } else {
        console.warn('Nom de projet non trouvé dans les properties:', props);
      }
    } else {
      console.warn('NavigationModule non disponible pour afficher les détails');
    }
  };

  // Met à jour le style du bouton de basemap actif
  const setActiveBasemap = (basemapLabel) => {
    const tiles = document.querySelectorAll('.basemap-tile');
    tiles.forEach(tile => {
      if (tile.textContent === basemapLabel) {
        tile.classList.add('active-basemap');
      } else {
        tile.classList.remove('active-basemap');
      }
    });
  };

  // Initialisation au chargement du module
  init();

  return {
    toggleSubFilters,
    buildSubFilters,
    updateActiveFilterTagsForLayer,
    setActiveBasemap,
    showDetailPanel,
    applyFilter,
    resetLayerFilter,
    resetLayerFilterWithoutRemoving,
    togglePopup,
    init,
    initBasemapMenu, // Exposer la fonction initBasemapMenu
    updateBasemaps   // Exposer la fonction updateBasemaps
  };
})();