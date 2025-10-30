// modules/TravauxModule.js
const TravauxModule = (() => {

  /**
   * Fonction helper pour réinitialiser l'état étendu du sous-menu
   */
  function resetSubmenuExpanded(panelId) {
    const panel = document.getElementById(panelId);
    try {
      if (panel) {
        panel.style.removeProperty('max-height');
        panel.style.removeProperty('overflow');
        const toggleBtn = panel.querySelector('.submenu-toggle-btn');
        if (toggleBtn) {
          const iconEl = toggleBtn.querySelector('i');
          const labelEl = toggleBtn.querySelector('span');
          if (iconEl && iconEl.classList.contains('fa-expand')) iconEl.classList.replace('fa-expand', 'fa-compress');
          if (labelEl) labelEl.textContent = 'Réduire';
          toggleBtn.classList.remove('is-collapsed');
          toggleBtn.setAttribute('aria-expanded', 'true');
          toggleBtn.setAttribute('aria-label', 'Réduire');
        }
      }
    } catch (_) { /* noop */ }
  }

  /**
   * Affichage des projets Travaux avec système de filtres avancé
   */
  async function renderTravauxProjects() {
    const submenu = document.querySelector('.submenu[data-category="travaux"]');
    
    if (!submenu) {
      console.warn('[TravauxModule] Submenu travaux introuvable');
      return;
    }
    
    // Récupérer la liste avant reconstruction (pour nettoyage initial)
    let projectListEl = submenu.querySelector('.project-list');

    submenu.innerHTML = `
      <div class="detail-header-submenu">
        <div class="header-left">
          <button class="btn-secondary close-btn" aria-label="Fermer">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            <span>Fermer</span>
          </button>
        </div>
        <div class="header-center">
        </div>
        <div class="header-right">
          <button class="btn-secondary submenu-toggle-btn" aria-label="Réduire" aria-expanded="true">
            <i class="fa-solid fa-compress" aria-hidden="true"></i>
            <span>Réduire</span>
          </button>
        </div>
      </div>
      
      <!-- Zone de dessin (cachée par défaut) -->
      <div id="travaux-drawing-panel" class="travaux-drawing-panel">
        <!-- Header avec statut -->
        <div class="travaux-drawing-header">
          <div class="travaux-drawing-status">
            <div class="status-icon">
              <i class="fa-solid fa-pen-to-square"></i>
            </div>
            <div class="status-content">
              <h3 class="status-title">Mode dessin activé</h3>
              <p class="status-description">
                Dessinez la zone du chantier sur la carte puis renseignez les informations
              </p>
            </div>
          </div>
        </div>
        
        <!-- Outils de dessin avec cards modernes -->
        <div class="travaux-tools-section">
          <h4 class="tools-section-title">
            <i class="fa-solid fa-pencil"></i> Outils de dessin
          </h4>
          <div class="travaux-tools-grid">
            <button id="draw-polyline" class="travaux-draw-tool" data-tool="polyline">
              <div class="tool-icon">
                <i class="fa-solid fa-route"></i>
              </div>
              <div class="tool-content">
                <span class="tool-name">Ligne</span>
                <span class="tool-hint">Tracé linéaire</span>
              </div>
            </button>
            <button id="draw-polygon" class="travaux-draw-tool" data-tool="polygon">
              <div class="tool-icon">
                <i class="fa-solid fa-draw-polygon"></i>
              </div>
              <div class="tool-content">
                <span class="tool-name">Polygone</span>
                <span class="tool-hint">Zone fermée</span>
              </div>
            </button>
            <button id="draw-marker" class="travaux-draw-tool" data-tool="marker">
              <div class="tool-icon">
                <i class="fa-solid fa-location-dot"></i>
              </div>
              <div class="tool-content">
                <span class="tool-name">Point</span>
                <span class="tool-hint">Localisation</span>
              </div>
            </button>
          </div>
        </div>
        
        <!-- Aide contextuelle -->
        <div class="travaux-drawing-help">
          <i class="fa-solid fa-lightbulb"></i>
          <span>Cliquez sur un outil puis dessinez sur la carte. Vous pouvez dessiner plusieurs formes.</span>
        </div>
        
        <!-- Actions -->
        <div class="travaux-drawing-actions">
          <button id="travaux-cancel-drawing" class="btn-secondary btn-large">
            <i class="fa-solid fa-xmark"></i>
            <span>Annuler</span>
          </button>
          <button id="travaux-finish-drawing" class="btn-primary btn-large" disabled>
            <i class="fa-solid fa-arrow-right"></i>
            <span>Continuer</span>
          </button>
        </div>
      </div>
      
      <ul class="project-list"></ul>
    `;
    
    // Always start expanded for Travaux when rendered
    resetSubmenuExpanded(submenu);

    // Simple exclusivity safeguard: ensure only category-related layers remain visible
    // This prevents timing issues when opening the menu without a full reset
    try {
      // Récupérer la catégorie depuis data-category
      const category = submenu.dataset.category;
      
      if (category) {
        const layersToDisplay = window.categoryLayersMap?.[category] || [];
        if (window.MapModule && window.MapModule.layers) {
          Object.keys(window.MapModule.layers).forEach(layerName => {
            if (!layersToDisplay.includes(layerName)) {
              try { window.MapModule.removeLayer(layerName); } catch(_) {}
            }
          });
        }
      }
    } catch (_) { /* noop */ }

    // Récupérer à nouveau la liste après reconstruction du DOM
    projectListEl = submenu.querySelector('.project-list');

    // Gestionnaire d'événement pour le bouton de réduction/extension
    const travauxToggleBtn = submenu.querySelector('.submenu-toggle-btn');
    const travauxPanel = submenu;
    if (travauxToggleBtn && travauxPanel) {
      travauxToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = travauxToggleBtn.getAttribute('aria-expanded') === 'false';
        const iconEl = travauxToggleBtn.querySelector('i');
        const labelEl = travauxToggleBtn.querySelector('span');
        if (isCollapsed) {
          // Expand
          travauxPanel.style.removeProperty('max-height');
          travauxPanel.style.removeProperty('overflow');
          if (iconEl) {
            if (iconEl.classList.contains('fa-expand')) iconEl.classList.replace('fa-expand', 'fa-compress');
            else iconEl.classList.add('fa-compress');
          }
          if (labelEl) labelEl.textContent = 'Réduire';
          travauxToggleBtn.classList.remove('is-collapsed');
          travauxToggleBtn.setAttribute('aria-expanded', 'true');
          travauxToggleBtn.setAttribute('aria-label', 'Réduire');
        } else {
          // Reduce/collapse
          travauxPanel.style.setProperty('max-height', '10vh', 'important');
          travauxPanel.style.setProperty('overflow', 'hidden', 'important');
          if (iconEl && iconEl.classList.contains('fa-compress')) iconEl.classList.replace('fa-compress', 'fa-expand');
          if (labelEl) labelEl.textContent = 'Développer';
          travauxToggleBtn.classList.add('is-collapsed');
          travauxToggleBtn.setAttribute('aria-expanded', 'false');
          travauxToggleBtn.setAttribute('aria-label', 'Développer');
        }
      });
    }

    // Gestionnaire d'événement pour le bouton de fermeture
    submenu.querySelector('.close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      // Désactiver l'onglet travaux actif
      const activeTab = document.querySelector('.nav-category.active');
      if (activeTab && activeTab.id === 'nav-travaux') {
        activeTab.classList.remove('active');
      }
      // Masquer explicitement le sous-menu travaux
      const travauxSubmenu = document.querySelector('.submenu[data-category="travaux"]');
      if (travauxSubmenu) {
        travauxSubmenu.style.display = 'none';
      }
      
      // Restaurer le border-radius de la nav (comportement identique aux autres submenus)
      const leftNav = document.getElementById('left-nav');
      if (leftNav) leftNav.style.borderRadius = '20px';
      
      // Réafficher les couches par défaut et les contributions (même logique que SubmenuModule)
      window.FilterModule?.resetAll();
      // Reset carte
      if (window.MapModule?.layers) {
        Object.keys(window.MapModule.layers).forEach(l => window.MapModule.removeLayer(l));
      }
      // Affichage couches par défaut + contributions depuis le cache
      const displayed = new Set();
      if (window.allContributions?.length) {
        const cats = [...new Set(window.allContributions.map(c => c.category))];
        cats.forEach(cat => {
          if (window.DataModule?.layerData?.[cat]) {
            window.DataModule.createGeoJsonLayer(cat, window.DataModule.layerData[cat]);
            displayed.add(cat);
          }
        });
      }
      window.defaultLayers?.forEach(layer => {
        if (!displayed.has(layer) && window.DataModule?.layerData?.[layer]) {
          window.DataModule.createGeoJsonLayer(layer, window.DataModule.layerData[layer]);
        }
      });
    });

    // Nettoyer les anciens filtres
    if (projectListEl) projectListEl.innerHTML = '';
    const oldFilterUX = document.getElementById('travaux-filters-ux');
    if (oldFilterUX) oldFilterUX.remove();
    const oldFilterContainer = document.getElementById('travaux-filters-container');
    if (oldFilterContainer) oldFilterContainer.remove();

    // Un seul layer "travaux", la source est déterminée par travaux_config
    const layerToLoad = 'travaux';
    
    // Charger la couche si nécessaire (avec loader minimal)
    try {
      const hasData = !!(DataModule.layerData && DataModule.layerData[layerToLoad] && Array.isArray(DataModule.layerData[layerToLoad].features) && DataModule.layerData[layerToLoad].features.length);
      if (!hasData) {
        if (projectListEl) projectListEl.innerHTML = '<div class="gp-loading" aria-live="polite">Chargement des chantiers…</div>';
        if (typeof DataModule.loadLayer === 'function') {
          await DataModule.loadLayer(layerToLoad);
        }
      }
    } catch (_) { /* noop */ }

    const travauxData = DataModule.layerData && DataModule.layerData[layerToLoad];
    if (!travauxData || !travauxData.features || travauxData.features.length === 0) {
      if (projectListEl) {
        projectListEl.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = 'Aucun chantier travaux à afficher.';
        projectListEl.appendChild(li);
      }
      return;
    }

    // --- Génération des valeurs uniques pour chaque filtre ---
    const features = travauxData.features;
    const getUniques = key => [...new Set(features.map(f => f.properties[key]).filter(Boolean))].sort();
    
    // Calcul du tri par nombre d'occurrences décroissant puis alphabétique
    const natureCounts = {};
    features.forEach(f => {
      const n = f.properties.nature_travaux;
      if (n) natureCounts[n] = (natureCounts[n] || 0) + 1;
    });
    const natures = Object.keys(natureCounts)
      .sort((a, b) => {
        if (natureCounts[b] !== natureCounts[a]) {
          return natureCounts[b] - natureCounts[a];
        }
        return a.localeCompare(b, 'fr');
      });
      
    // Note: nature_chantier supprimé (doublon de nature_travaux)
      
    // Calcul du tri par nombre d'occurrences décroissant puis alphabétique pour commune
    const communeCounts = {};
    features.forEach(f => {
      const c = f.properties.commune;
      if (c) communeCounts[c] = (communeCounts[c] || 0) + 1;
    });
    const communes = Object.keys(communeCounts)
      .sort((a, b) => {
        if (communeCounts[b] !== communeCounts[a]) {
          return communeCounts[b] - communeCounts[a];
        }
        return a.localeCompare(b, 'fr');
      });
      
    const etats = getUniques('etat');
    
    // Dates
    const dateDebuts = features.map(f => f.properties.date_debut).filter(Boolean).sort();
    const dateFins = features.map(f => f.properties.date_fin).filter(Boolean).sort();
    const majDates = features.map(f => f.properties.last_update).filter(Boolean).sort();

    // --- Filtres ultra-clean ---
    const filterUX = document.createElement('section');
    filterUX.id = 'travaux-filters-ux';
    filterUX.innerHTML = `
      <!-- Card Ajouter (cachée par défaut, visible si admin) -->
      <div class="travaux-add-card" style="display:none;">
        <span class="add-card-label">Ajouter un chantier</span>
        <button class="add-card-btn travaux-add-btn btn-primary">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
      
      <!-- Header -->
      <div class="filters-header">
        <h3 class="filters-title">Filtres</h3>
        <span id="filters-count" class="filters-count"></span>
      </div>
      
      <!-- Tags actifs -->
      <div id="filters-tags" class="filters-tags"></div>
      
      <!-- Formulaire -->
      <form class="filters-form" autocomplete="off">
        
        <!-- Exclure réseaux (switch simple) -->
        <label class="filter-switch">
          <input type="checkbox" id="hide-reseaux" checked>
          <span class="switch-slider"></span>
          <span class="switch-label">Exclure les réseaux</span>
        </label>
        
        <!-- Nature -->
        <div class="filter-group">
          <label for="nature-select">
            <i class="fa-solid fa-hammer"></i>
            <span>Nature</span>
          </label>
          <select id="nature-select">
            <option value="">Toutes</option>
            ${natures.map(n => `<option value="${n}">${n} (${natureCounts[n]})</option>`).join('')}
          </select>
        </div>
        
        <!-- Commune -->
        <div class="filter-group">
          <label for="commune-select">
            <i class="fa-solid fa-location-dot"></i>
            <span>Commune</span>
          </label>
          <select id="commune-select">
            <option value="">Toutes</option>
            ${communes.map(c => `<option value="${c}">${c} (${communeCounts[c]})</option>`).join('')}
          </select>
        </div>
        
        <!-- État -->
        <div class="filter-group">
          <label for="etat-select">
            <i class="fa-solid fa-circle-info"></i>
            <span>État</span>
          </label>
          <select id="etat-select">
            <option value="">Tous</option>
            ${etats.map(e => `<option value="${e}">${e}</option>`).join('')}
          </select>
        </div>
        
        <!-- Date début -->
        <div class="filter-group">
          <label for="date-debut">
            <i class="fa-solid fa-calendar-plus"></i>
            <span>Début</span>
          </label>
          <input id="date-debut" type="date" />
        </div>
        
        <!-- Date fin -->
        <div class="filter-group">
          <label for="date-fin">
            <i class="fa-solid fa-calendar-check"></i>
            <span>Fin</span>
          </label>
          <input id="date-fin" type="date" />
        </div>
        
        <!-- Reset -->
        <button type="button" id="reset-filters" class="btn-secondary btn-small">
          Réinitialiser
        </button>
        
      </form>
    `;
    
    // Remplacer l'ancien container par le nouveau
    // Supprimer tout ancien container de filtres (évite le doublon lint)
    { const old = document.getElementById('travaux-filters-container'); if (old) old.remove(); }
    // S'assurer que le panel n'est inséré qu'une seule fois
    submenu.insertBefore(filterUX, projectListEl);

    // Gestionnaire pour la card "Ajouter un chantier" (après insertion du filterUX dans le DOM)
    const addCard = filterUX.querySelector('.travaux-add-card');
    if (addCard) {
      // Déterminer si les données sont éditables via travaux_config
      let isEditableSource = false;
      
      try {
        const config = await window.supabaseService?.getTravauxConfig(activeCity);
        isEditableSource = config?.source_type === 'city_travaux';
      } catch (err) {
        console.warn('[TravauxModule] Erreur récupération config travaux:', err);
        isEditableSource = false;
      }
      
      // Si source non éditable, retirer la card
      if (!isEditableSource) {
        addCard.remove();
      } else {
        // Source éditable (city_travaux) : vérifier si admin pour afficher la card
        addCard.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.TravauxEditorModule?.openEditor) {
            window.TravauxEditorModule.openEditor();
          } else {
            console.warn('[TravauxModule] TravauxEditorModule non chargé');
          }
        });
        
        // Vérifier si l'utilisateur est authentifié et admin de la ville
        try {
          const session = await window.supabaseService?.getClient()?.auth.getSession();
          if (session?.data?.session?.user) {
            const role = window.__CONTRIB_ROLE || '';
            const userVilles = window.__CONTRIB_VILLES || [];
            
            const isAdmin = role === 'admin';
            if (isAdmin) {
              const isGlobalAdmin = Array.isArray(userVilles) && userVilles.includes('global');
              const isCityAdmin = Array.isArray(userVilles) && userVilles.includes(activeCity);
              
              // Afficher la card si admin global OU admin de cette ville
              if (isGlobalAdmin || isCityAdmin) {
                addCard.style.display = 'flex';
              }
            }
          }
        } catch (err) {
          console.warn('[TravauxModule] Erreur vérification auth:', err);
        }
      }
    }

    // Récupérer les éléments pour la logique JS
    const selectNature = filterUX.querySelector('#nature-select');
    const selectCommune = filterUX.querySelector('#commune-select');
    const selectEtat = filterUX.querySelector('#etat-select');
    const inputDebut = filterUX.querySelector('#date-debut');
    const inputFin = filterUX.querySelector('#date-fin');
    const hideReseauxCheckbox = filterUX.querySelector('#hide-reseaux');
    
    // Fonction pour filtrer les options des sélecteurs
    function filterOptions(selectElement, options, counts) {
      const hideReseaux = hideReseauxCheckbox.checked;
      const reseauxKeywords = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'assainissement', 'hydraulique', 'sondage'];
      
      return options
        .filter(option => !hideReseaux || !reseauxKeywords.some(keyword => 
          option.toLowerCase().includes(keyword)
        ))
        .map(option => `<option value="${option}">${option} (${counts[option]})</option>`)
        .join('');
    }
    
    const resetBtn = filterUX.querySelector('#reset-filters');
    const badgesContainer = filterUX.querySelector('#filters-tags');
    const countEl = filterUX.querySelector('#filters-count');

    // --- UX : badges de filtres actifs ---
    function renderActiveBadges(criteria) {
      badgesContainer.innerHTML = '';
      const labels = {
        nature_travaux: 'Nature',
        nature_chantier: 'Nature Chantier',
        commune: 'Commune',
        etat: 'État',
        date_debut: 'Début >',
        date_fin: 'Fin <',
        _hideReseaux: 'Réseaux exclus'
      };
      
      Object.entries(criteria).forEach(([key, val]) => {
        if (val === undefined || val === '' || val === null) return;
        const badge = document.createElement('span');
        badge.className = 'gpv2-filter-badge';
        badge.setAttribute('tabindex', '0');
        badge.setAttribute('role', 'button');
        
        // Pour le filtre _hideReseaux, on affiche toujours 'Exclure les réseaux'
        const displayText = key === '_hideReseaux' ? 'Exclure les réseaux' : (labels[key] || key);
        badge.setAttribute('aria-label', `Retirer filtre ${displayText}`);
        badge.innerHTML = `<i class='fa-solid fa-xmark'></i> <strong>${displayText}</strong>`;
        badge.addEventListener('click', () => {
          // Retirer le filtre correspondant
          switch (key) {
            case '_hideReseaux':
              hideReseauxCheckbox.checked = false;
              break;
            case 'nature_travaux': 
              selectNature.value = ''; 
              break;
            // nature_chantier supprimé (doublon)
            case 'commune': 
              selectCommune.value = ''; 
              break;
            case 'etat': 
              selectEtat.value = ''; 
              break;
            case 'date_debut': 
              inputDebut.value = ''; 
              break;
            case 'date_fin': 
              inputFin.value = ''; 
              break;
          }
          applyFiltersAndSync();
        });
        badge.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') badge.click();
        });
        badgesContainer.appendChild(badge);
      });
      badgesContainer.style.display = Object.keys(criteria).length > 0 ? 'flex' : 'none';
    }

    // Fonction utilitaire pour vérifier si un texte contient des mots-clés de réseaux
    function isReseau(text) {
      if (!text) return false;
      const reseauxKeywords = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'electricite', 'assainissement'];
      return reseauxKeywords.some(keyword => 
        String(text).toLowerCase().includes(keyword.toLowerCase())
      );
    }

    // --- Fonction de synchronisation filtre panel <-> carte ---
    function applyFiltersAndSync() {
      // 1. Récupérer les critères depuis les inputs du panel
      // Construire dynamiquement les critères (ne garder que les champs renseignés)
      const criteria = {};
      if (selectNature.value) criteria.nature_travaux = selectNature.value;
      if (selectCommune.value) criteria.commune = selectCommune.value;
      if (selectEtat.value) criteria.etat = selectEtat.value;
      if (inputDebut.value) criteria.date_debut = inputDebut.value;
      if (inputFin.value) criteria.date_fin = inputFin.value;
      
      // 2. Appliquer le filtre à la carte (Leaflet)
      // On ajoute le filtre des réseaux aux critères si la case est cochée
      const hideReseaux = hideReseauxCheckbox.checked;
      if (hideReseaux) {
        criteria._hideReseaux = true; // Marqueur spécial pour le filtre personnalisé
      }
      
      if (window.UIModule?.applyFilter) {
        const mapped = (window.categoryLayersMap && window.categoryLayersMap['travaux']) || [];
        const travauxLayerName = mapped[0] || 'travaux';
        window.UIModule.applyFilter(travauxLayerName, criteria);
      }

      // 3. Récupérer les features filtrées (après application du filtre)
      let filtered = [];
      const mapped = (window.categoryLayersMap && window.categoryLayersMap['travaux']) || [];
      const travauxLayerName = mapped[0] || 'travaux';
      const travauxLayer = window.MapModule?.layers?.[travauxLayerName];
      if (travauxLayer && typeof travauxLayer.eachLayer === 'function') {
        travauxLayer.eachLayer(layer => {
          if (layer.feature) filtered.push(layer.feature);
        });
      }
      if (filtered.length === 0 && window.DataModule?.layerData?.[travauxLayerName]) {
        filtered = window.DataModule.layerData[travauxLayerName].features || [];
      }
      
      // 4. Si le filtre des réseaux est actif, filtrer les résultats
      if (hideReseaux) {
        filtered = filtered.filter(feature => {
          const props = feature.properties || {};
          return !isReseau(props.nature_travaux) && !isReseau(props.nature_chantier);
        });
      }

      // Affichage dynamique des badges de filtres actifs
      renderActiveBadges(criteria);
      // Compteur de résultats filtrés (features sur la carte)
      countEl.textContent = `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`;
      countEl.style.display = 'inline-block';
      // Accessibilité : aria-live pour le compteur
      countEl.setAttribute('aria-live', 'polite');

      // Affichage conditionnelle du bouton Réinitialiser
      const hasActiveFilter = !!(selectNature.value || selectCommune.value || selectEtat.value || inputDebut.value || inputFin.value);
      resetBtn.style.display = hasActiveFilter ? '' : 'none';

      // Désormais, on ne remplit plus la liste : on n'affiche que les filtres
      projectListEl.innerHTML = '';
      // Aucun affichage de travaux, ni message "aucun travaux".
      // Le panel ne contient que les contrôles de filtre.
    }

    // Mise à jour des filtres et des options
    function updateFilterOptions() {
      // Mise à jour des options des sélecteurs
      selectNature.innerHTML = '<option value="">Toutes</option>' + 
        filterOptions(selectNature, natures, natureCounts);
      
      // Conserver la sélection actuelle si elle existe toujours
      if (selectNature.value) {
        const option = selectNature.querySelector(`option[value="${selectNature.value}"]`);
        if (!option) selectNature.value = '';
      }
    }
    
    // Écouteurs d'événements pour les filtres
    [selectNature, selectCommune, selectEtat, inputDebut, inputFin].forEach(el => {
      el.addEventListener('change', applyFiltersAndSync);
    });
    
    // Écouteur pour la case à cocher "Exclure les réseaux"
    hideReseauxCheckbox.addEventListener('change', () => {
      updateFilterOptions();
      applyFiltersAndSync();
    });
    
    resetBtn.addEventListener('click', () => {
      selectNature.value = '';
      selectCommune.value = '';
      selectEtat.value = '';
      inputDebut.value = '';
      inputFin.value = '';
      applyFiltersAndSync();
    });

    // Affichage initial
    updateFilterOptions();
    applyFiltersAndSync();
  }

  // API publique du module
  const publicAPI = {
    renderTravauxProjects
  };

  // Exposer le module globalement
  window.TravauxModule = publicAPI;

  return publicAPI;
})();
