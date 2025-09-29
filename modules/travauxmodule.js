// modules/TravauxModule.js
// Module spécialisé pour la gestion du sous-menu Travaux
const TravauxModule = (() => {

  /**
   * Fonction helper pour réinitialiser l'état étendu du sous-menu
   */
  function resetSubmenuExpanded(submenuId) {
    try {
      const panel = document.getElementById(submenuId);
      if (panel) {
        panel.style.removeProperty('max-height');
        panel.style.removeProperty('overflow');
        const toggleBtn = panel.querySelector('.submenu-toggle-btn');
        if (toggleBtn) {
          const iconEl = toggleBtn.querySelector('i');
          const labelEl = toggleBtn.querySelector('.gp-btn__label');
          if (iconEl) {
            if (iconEl.classList.contains('fa-expand')) iconEl.classList.replace('fa-expand','fa-compress');
            else iconEl.classList.add('fa-compress');
          }
          if (labelEl) labelEl.textContent = 'Réduire';
          toggleBtn.classList.remove('is-collapsed');
          toggleBtn.setAttribute('aria-expanded','true');
          toggleBtn.setAttribute('aria-label','Réduire');
        }
      }
    } catch (_) { /* no-op */ }
  }

  /**
   * Affichage des projets Travaux avec système de filtres avancé
   */
  async function renderTravauxProjects() {
    const submenu = document.getElementById('travaux-submenu');
    submenu.innerHTML = `
      <div class="detail-header-submenu">
        <div class="header-left">
          <button class="gp-btn gp-btn--danger close-btn" aria-label="Fermer">
            <i class="fa-solid fa-xmark gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Fermer</span>
          </button>
        </div>
        <div class="header-right">
          <button class="gp-btn gp-btn--secondary submenu-toggle-btn" aria-label="Réduire" aria-expanded="true" aria-controls="travaux-submenu">
            <i class="fa-solid fa-compress gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Réduire</span>
          </button>
        </div>
      </div>
      <div class="project-list"></div>
    `;
    
    // Always start expanded for Travaux when rendered
    resetSubmenuExpanded('travaux-submenu');

    // Simple exclusivity safeguard: ensure only category-related layers remain visible
    // This prevents timing issues when opening the menu without a full reset
    try {
      // Récupérer dynamiquement la catégorie depuis l'ID du submenu
      const categoryMatch = submenu.id.match(/^(.+)-submenu$/);
      const category = categoryMatch ? categoryMatch[1] : null;
      
      if (category) {
        const layersToDisplay = (window.categoryLayersMap && window.categoryLayersMap[category]) || [category];
        if (window.MapModule && window.MapModule.layers) {
          Object.keys(window.MapModule.layers).forEach(layerName => {
            if (!layersToDisplay.includes(layerName)) {
              try { window.MapModule.removeLayer(layerName); } catch(_) {}
            }
          });
        }
      }
    } catch (_) { /* noop */ }

    const listEl = submenu.querySelector('.project-list');

    // Gestionnaire d'événement pour le bouton de réduction/extension
    const travauxToggleBtn = submenu.querySelector('.submenu-toggle-btn');
    const travauxPanel = submenu;
    if (travauxToggleBtn && travauxPanel) {
      travauxToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = travauxToggleBtn.getAttribute('aria-expanded') === 'false';
        const iconEl = travauxToggleBtn.querySelector('i');
        const labelEl = travauxToggleBtn.querySelector('.gp-btn__label');
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
      const travauxSubmenu = document.getElementById('travaux-submenu');
      if (travauxSubmenu) {
        travauxSubmenu.style.display = 'none';
      }
      // Réinitialiser la vue sans spécifier de catégorie
      if (window.NavigationModule?.resetToDefaultView) {
        window.NavigationModule.resetToDefaultView(undefined, { preserveMapView: true });
      }
    });

    // Nettoyer les anciens filtres
    listEl.innerHTML = '';
    const oldFilterUX = document.getElementById('travaux-filters-ux');
    if (oldFilterUX) oldFilterUX.remove();
    const oldFilterContainer = document.getElementById('travaux-filters-container');
    if (oldFilterContainer) oldFilterContainer.remove();

    // Charger la couche 'travaux' si nécessaire (avec loader minimal)
    try {
      const hasData = !!(DataModule.layerData && DataModule.layerData['travaux'] && Array.isArray(DataModule.layerData['travaux'].features) && DataModule.layerData['travaux'].features.length);
      if (!hasData) {
        listEl.innerHTML = '<div class="gp-loading" aria-live="polite">Chargement des chantiers…</div>';
        if (typeof DataModule.loadLayer === 'function') {
          await DataModule.loadLayer('travaux');
        }
      }
    } catch (_) { /* noop */ }

    const travauxData = DataModule.layerData && DataModule.layerData['travaux'];
    if (!travauxData || !travauxData.features || travauxData.features.length === 0) {
      listEl.innerHTML = '';
      const li = document.createElement('li');
      li.textContent = 'Aucun chantier travaux à afficher.';
      listEl.appendChild(li);
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
      
    // Calcul du tri par nombre d'occurrences décroissant puis alphabétique pour nature_chantier
    const natureChantierCounts = {};
    features.forEach(f => {
      const nc = f.properties.nature_chantier;
      if (nc) natureChantierCounts[nc] = (natureChantierCounts[nc] || 0) + 1;
    });
    const natureChantiers = Object.keys(natureChantierCounts)
      .sort((a, b) => {
        if (natureChantierCounts[b] !== natureChantierCounts[a]) {
          return natureChantierCounts[b] - natureChantierCounts[a];
        }
        return a.localeCompare(b, 'fr');
      });
      
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

    // --- Refonte UX premium des filtres ---
    const filterUX = document.createElement('section');
    filterUX.id = 'travaux-filters-ux';
    filterUX.className = 'travaux-filters-ux';
    filterUX.innerHTML = `
      <div class="travaux-filters-header">
        <span class="travaux-filters-title"><i class="fa fa-filter"></i> Filtres</span>
        <span id="travaux-filters-count" class="travaux-filters-count"></span>
      </div>
      <div class="travaux-filters-badges" id="travaux-filters-badges"></div>
      <form class="travaux-filters-grid" autocomplete="off" tabindex="0">
        <div class="travaux-field">
          <label class="travaux-checkbox-label">
            <input type="checkbox" id="hide-reseaux" class="travaux-checkbox" checked>
            <span class="travaux-checkbox-custom"></span>
            Exclure les réseaux (gaz, eau, télécom, etc.)
          </label>
        </div>
        <div class="travaux-field">
          <label for="nature-travaux-select">Nature</label>
          <select id="nature-travaux-select"><option value="">Toutes</option>${natures.map(n => `<option value="${n}">${n} (${natureCounts[n]})</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="nature-chantier-select">Nature chantier</label>
          <select id="nature-chantier-select"><option value="">Toutes</option>${natureChantiers.map(n => `<option value="${n}">${n} (${natureChantierCounts[n]})</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="commune-select">Commune</label>
          <select id="commune-select"><option value="">Toutes</option>${communes.map(c => `<option value="${c}">${c} (${communeCounts[c]})</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="etat-select">Etat</label>
          <select id="etat-select"><option value="">Tous</option>${etats.map(e => `<option value="${e}">${e}</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="date-debut-input">Début après</label>
          <input id="date-debut-input" type="date" />
        </div>
        <div class="travaux-field">
          <label for="date-fin-input">Fin avant</label>
          <input id="date-fin-input" type="date" />
        </div>
        <div class="travaux-field travaux-reset">
          <button type="button" id="reset-all-filters" class="travaux-reset-btn"><i class="fa-solid fa-circle-xmark"></i> Réinitialiser</button>
        </div>
      </form>
    `;
    
    // Remplacer l'ancien container par le nouveau
    // Supprimer tout ancien container de filtres (évite le doublon lint)
    { const old = document.getElementById('travaux-filters-container'); if (old) old.remove(); }
    // S'assurer que le panel n'est inséré qu'une seule fois
    submenu.insertBefore(filterUX, listEl);

    // Récupérer les éléments pour la logique JS
    const selectNature = filterUX.querySelector('#nature-travaux-select');
    const selectNatureChantier = filterUX.querySelector('#nature-chantier-select');
    const selectCommune = filterUX.querySelector('#commune-select');
    const selectEtat = filterUX.querySelector('#etat-select');
    const inputDebut = filterUX.querySelector('#date-debut-input');
    const inputFin = filterUX.querySelector('#date-fin-input');
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
    
    const resetBtn = filterUX.querySelector('#reset-all-filters');
    const badgesContainer = filterUX.querySelector('#travaux-filters-badges');
    const countEl = filterUX.querySelector('#travaux-filters-count');

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
            case 'nature_chantier': 
              selectNatureChantier.value = ''; 
              break;
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
      if (selectNatureChantier.value) criteria.nature_chantier = selectNatureChantier.value;
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
        window.UIModule.applyFilter('travaux', criteria);
      }

      // 3. Récupérer les features filtrées (après application du filtre)
      let filtered = [];
      const travauxLayer = window.MapModule?.layers?.['travaux'];
      if (travauxLayer && typeof travauxLayer.eachLayer === 'function') {
        travauxLayer.eachLayer(layer => {
          if (layer.feature) filtered.push(layer.feature);
        });
      }
      if (filtered.length === 0 && window.DataModule?.layerData?.['travaux']) {
        filtered = window.DataModule.layerData['travaux'].features || [];
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
      const hasActiveFilter = !!(selectNature.value || selectNatureChantier.value || selectCommune.value || selectEtat.value || inputDebut.value || inputFin.value);
      resetBtn.style.display = hasActiveFilter ? '' : 'none';

      // Désormais, on ne remplit plus la liste : on n'affiche que les filtres
      listEl.innerHTML = '';
      // Aucun affichage de travaux, ni message "aucun travaux".
      // Le panel ne contient que les contrôles de filtre.
    }

    // Mise à jour des filtres et des options
    function updateFilterOptions() {
      // Mise à jour des options des sélecteurs
      selectNature.innerHTML = '<option value="">Toutes</option>' + 
        filterOptions(selectNature, natures, natureCounts);
      
      selectNatureChantier.innerHTML = '<option value="">Toutes</option>' + 
        filterOptions(selectNatureChantier, natureChantiers, natureChantierCounts);
      
      // Conserver la sélection actuelle si elle existe toujours
      if (selectNature.value) {
        const option = selectNature.querySelector(`option[value="${selectNature.value}"]`);
        if (!option) selectNature.value = '';
      }
      
      if (selectNatureChantier.value) {
        const option = selectNatureChantier.querySelector(`option[value="${selectNatureChantier.value}"]`);
        if (!option) selectNatureChantier.value = '';
      }
    }
    
    // Écouteurs d'événements pour les filtres
    [selectNature, selectNatureChantier, selectCommune, selectEtat, inputDebut, inputFin].forEach(el => {
      el.addEventListener('change', applyFiltersAndSync);
    });
    
    // Écouteur pour la case à cocher "Exclure les réseaux"
    hideReseauxCheckbox.addEventListener('change', () => {
      updateFilterOptions();
      applyFiltersAndSync();
    });
    
    resetBtn.addEventListener('click', () => {
      selectNature.value = '';
      selectNatureChantier.value = '';
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
