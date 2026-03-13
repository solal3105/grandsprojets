// modules/TravauxModule.js
const TravauxModule = (() => {

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
      ${window.SubmenuManager.headerHTML({ extraHTML: '<div class="header-center"></div>' })}
      
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
    
    // Démarrer en mode étendu + attacher close/toggle via SubmenuManager
    window.SubmenuManager.resetExpanded(submenu);
    window.SubmenuManager.wireHeaderEvents(submenu);

    // Exclusivité des layers : ne garder que ceux de la catégorie travaux
    try {
      const category = submenu.dataset.category;
      if (category) {
        const layersToDisplay = window.categoryLayersMap?.[category] || [];
        if (window.MapModule?.layers) {
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
    const hasFeatures = travauxData && travauxData.features && travauxData.features.length > 0;
    
    if (!hasFeatures) {
      if (projectListEl) {
        projectListEl.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = 'Aucun chantier travaux à afficher.';
        projectListEl.appendChild(li);
      }
      // NE PAS return ici - on doit quand même afficher le bouton "Ajouter"
      // pour permettre la création du premier chantier
    }

    // --- Génération des valeurs uniques pour chaque filtre (seulement si données) ---
    const features = hasFeatures ? travauxData.features : [];
    
    let natures = [];
    let natureCounts = {};
    let communes = [];
    let communeCounts = {};
    let etats = [];
    
    if (hasFeatures) {
      const getUniques = key => [...new Set(features.map(f => f.properties[key]).filter(Boolean))].sort();
      
      // Calcul du tri par nombre d'occurrences décroissant puis alphabétique
      features.forEach(f => {
        const n = f.properties.nature_travaux;
        if (n) natureCounts[n] = (natureCounts[n] || 0) + 1;
      });
      natures = Object.keys(natureCounts)
        .sort((a, b) => {
          if (natureCounts[b] !== natureCounts[a]) {
            return natureCounts[b] - natureCounts[a];
          }
          return a.localeCompare(b, 'fr');
        });
        
      // Calcul du tri par nombre d'occurrences décroissant puis alphabétique pour commune
      features.forEach(f => {
        const c = f.properties.commune;
        if (c) communeCounts[c] = (communeCounts[c] || 0) + 1;
      });
      communes = Object.keys(communeCounts)
        .sort((a, b) => {
          if (communeCounts[b] !== communeCounts[a]) {
            return communeCounts[b] - communeCounts[a];
          }
          return a.localeCompare(b, 'fr');
        });
        
      etats = getUniques('etat');
    }

    // --- Panneau Travaux redesigné ---
    const filterUX = document.createElement('section');
    filterUX.id = 'travaux-filters-ux';
    filterUX.className = 'travaux-panel';
    filterUX.innerHTML = `
      <!-- Card Ajouter (cachée par défaut, visible si admin) -->
      <div class="travaux-add-card" style="display:none;">
        <span class="add-card-label">Ajouter un chantier</span>
        <button class="add-card-btn travaux-add-btn btn-primary">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
      
      ${hasFeatures ? `
      <!-- Timeline hero -->
      <div class="travaux-timeline" id="travaux-timeline">
        <div class="timeline-hero">
          <span class="timeline-count" id="timeline-count">0</span>
          <span class="timeline-count-label">chantier(s) ouvert(s) le</span>
          <span class="timeline-date" id="timeline-date-label"></span>
        </div>
        <input type="range" id="travaux-date-slider" class="timeline-slider" />
        <div class="timeline-range-labels">
          <span id="timeline-min-label"></span>
          <span id="timeline-max-label"></span>
        </div>
      </div>
      
      <!-- Compact filters -->
      <div class="travaux-filters-row">
        <select id="nature-select" class="travaux-select" aria-label="Nature">
          <option value="">Nature</option>
          ${natures.map(n => `<option value="${n}">${n} (${natureCounts[n]})</option>`).join('')}
        </select>
        <select id="commune-select" class="travaux-select" aria-label="Commune">
          <option value="">Commune</option>
          ${communes.map(c => `<option value="${c}">${c} (${communeCounts[c]})</option>`).join('')}
        </select>
        <select id="etat-select" class="travaux-select" aria-label="État">
          <option value="">État</option>
          ${etats.map(e => `<option value="${e}">${e}</option>`).join('')}
        </select>
      </div>
      
      <!-- Options row -->
      <div class="travaux-options-row">
        <label class="travaux-switch-label">
          <input type="checkbox" id="hide-reseaux">
          <span>Exclure réseaux</span>
        </label>
        <button type="button" id="reset-filters" class="travaux-reset-btn" style="display:none;">
          <i class="fa-solid fa-rotate-left"></i> Réinitialiser
        </button>
      </div>
      
      <!-- Active filter badges -->
      <div id="filters-tags" class="travaux-tags"></div>
      ` : ''}
    `;
    
    // Remplacer l'ancien container par le nouveau
    // Supprimer tout ancien container de filtres (évite le doublon lint)
    { const old = document.getElementById('travaux-filters-container'); if (old) old.remove(); }
    // S'assurer que le panel n'est inséré qu'une seule fois
    submenu.insertBefore(filterUX, projectListEl);

    // Gestionnaire pour la card "Ajouter un chantier" (après insertion du filterUX dans le DOM)
    const addCard = filterUX.querySelector('.travaux-add-card');
    if (addCard) {
      // Récupérer la ville active
      const activeCity = (typeof window.getActiveCity === 'function') 
        ? window.getActiveCity() 
        : (window.activeCity || null);
      
      // Déterminer si les données sont éditables via travaux_config
      // Par défaut, si pas de config = éditable (city_travaux implicite)
      // Non éditable SEULEMENT si source_type === 'url' explicitement
      let isEditableSource = true;
      
      try {
        const config = await window.supabaseService?.getTravauxConfig(activeCity);
        // Seul cas non éditable : source explicitement définie comme URL externe
        if (config && config.source_type === 'url') {
          isEditableSource = false;
        }
      } catch (err) {
        console.warn('[TravauxModule] Erreur récupération config travaux:', err);
        // En cas d'erreur, on laisse éditable par défaut
      }
      
      // Si source non éditable (URL externe), retirer la card
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

    // Récupérer les éléments pour la logique JS (seulement si filtres présents)
    if (!hasFeatures) {
      // Pas de données = pas de filtres, on s'arrête ici
      return;
    }
    
    const selectNature = filterUX.querySelector('#nature-select');
    const selectCommune = filterUX.querySelector('#commune-select');
    const selectEtat = filterUX.querySelector('#etat-select');
    const timelineSlider = filterUX.querySelector('#travaux-date-slider');
    const timelineDateLabel = filterUX.querySelector('#timeline-date-label');
    const timelineCountEl = filterUX.querySelector('#timeline-count');
    const timelineMinLabel = filterUX.querySelector('#timeline-min-label');
    const timelineMaxLabel = filterUX.querySelector('#timeline-max-label');
    const hideReseauxCheckbox = filterUX.querySelector('#hide-reseaux');
    const resetBtn = filterUX.querySelector('#reset-filters');
    const badgesContainer = filterUX.querySelector('#filters-tags');

    // --- Timeline slider setup ---
    // Range = min(date_debut) → max(date_fin) so it covers only actual data
    let timelineMinDate = null;
    let timelineMaxDate = null;
    let timelineEnabled = false;
    {
      const starts = [];
      const ends = [];
      features.forEach(f => {
        const p = f.properties || {};
        if (p.date_debut) { const d = new Date(p.date_debut); if (!isNaN(d)) starts.push(d); }
        if (p.date_fin) { const d = new Date(p.date_fin); if (!isNaN(d)) ends.push(d); }
      });
      if (starts.length > 0) {
        timelineMinDate = new Date(Math.min(...starts));
        // Use max(date_fin) if available, otherwise max(date_debut) + 6 months
        timelineMaxDate = ends.length > 0
          ? new Date(Math.max(...ends))
          : new Date(Math.max(...starts) + 180 * 86400000);
        // Ensure at least 30 days range
        if (timelineMaxDate - timelineMinDate < 30 * 86400000) {
          timelineMaxDate = new Date(timelineMinDate.getTime() + 30 * 86400000);
        }
        timelineEnabled = true;
      }
    }

    const fmtShort = (d) => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    const fmtFull = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    if (timelineEnabled && timelineSlider) {
      const totalDays = Math.round((timelineMaxDate - timelineMinDate) / 86400000);
      timelineSlider.min = 0;
      timelineSlider.max = totalDays;
      // Default to today (clamped to range)
      const today = new Date();
      const todayOffset = Math.round((today - timelineMinDate) / 86400000);
      timelineSlider.value = Math.max(0, Math.min(totalDays, todayOffset));
      timelineMinLabel.textContent = fmtShort(timelineMinDate);
      timelineMaxLabel.textContent = fmtShort(timelineMaxDate);
    } else if (timelineSlider) {
      const tlEl = filterUX.querySelector('#travaux-timeline');
      if (tlEl) tlEl.style.display = 'none';
    }

    function getSliderDate() {
      if (!timelineEnabled || !timelineSlider) return new Date();
      const offset = parseInt(timelineSlider.value, 10);
      return new Date(timelineMinDate.getTime() + offset * 86400000);
    }

    // Fonction utilitaire pour vérifier si un texte contient des mots-clés de réseaux
    function isReseau(text) {
      if (!text) return false;
      const kw = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'electricite', 'assainissement'];
      return kw.some(k => String(text).toLowerCase().includes(k));
    }

    // Fonction pour filtrer les options des sélecteurs
    function filterOptions(opts, counts) {
      const hideReseaux = hideReseauxCheckbox.checked;
      const kw = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'assainissement', 'hydraulique', 'sondage'];
      return opts
        .filter(o => !hideReseaux || !kw.some(k => o.toLowerCase().includes(k)))
        .map(o => `<option value="${o}">${o} (${counts[o]})</option>`)
        .join('');
    }

    // --- Badges de filtres actifs ---
    function renderActiveBadges(criteria) {
      badgesContainer.innerHTML = '';
      const labels = { nature_travaux: 'Nature', commune: 'Commune', etat: 'État', _hideReseaux: 'Sans réseaux' };
      Object.entries(criteria).forEach(([key, val]) => {
        if (val === undefined || val === '' || val === null || key === '_timeline') return;
        const badge = document.createElement('span');
        badge.className = 'travaux-badge';
        badge.setAttribute('tabindex', '0');
        badge.setAttribute('role', 'button');
        const text = key === '_hideReseaux' ? 'Sans réseaux' : `${labels[key] || key}: ${val}`;
        badge.setAttribute('aria-label', `Retirer filtre ${text}`);
        badge.innerHTML = `${text} <i class='fa-solid fa-xmark'></i>`;
        badge.addEventListener('click', () => {
          switch (key) {
            case '_hideReseaux': hideReseauxCheckbox.checked = false; break;
            case 'nature_travaux': selectNature.value = ''; break;
            case 'commune': selectCommune.value = ''; break;
            case 'etat': selectEtat.value = ''; break;
          }
          applyFiltersAndSync();
        });
        badge.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') badge.click(); });
        badgesContainer.appendChild(badge);
      });
      badgesContainer.style.display = Object.keys(criteria).filter(k => k !== '_timeline').length > 0 ? 'flex' : 'none';
    }

    // --- Fonction de synchronisation filtre panel <-> carte ---
    function applyFiltersAndSync() {
      const criteria = {};
      if (selectNature.value) criteria.nature_travaux = selectNature.value;
      if (selectCommune.value) criteria.commune = selectCommune.value;
      if (selectEtat.value) criteria.etat = selectEtat.value;
      const hideReseaux = hideReseauxCheckbox.checked;
      if (hideReseaux) criteria._hideReseaux = true;

      if (window.UIModule?.applyFilter) {
        const mapped = (window.categoryLayersMap && window.categoryLayersMap['travaux']) || [];
        const travauxLayerName = mapped[0] || 'travaux';
        window.UIModule.applyFilter(travauxLayerName, criteria);
      }

      // Récupérer les features filtrées
      let filtered = [];
      const mapped = (window.categoryLayersMap && window.categoryLayersMap['travaux']) || [];
      const travauxLayerName = mapped[0] || 'travaux';
      const travauxLayer = window.MapModule?.layers?.[travauxLayerName];
      if (travauxLayer && typeof travauxLayer.eachLayer === 'function') {
        travauxLayer.eachLayer(layer => { if (layer.feature) filtered.push(layer.feature); });
      }
      if (filtered.length === 0 && window.DataModule?.layerData?.[travauxLayerName]) {
        filtered = window.DataModule.layerData[travauxLayerName].features || [];
      }

      if (hideReseaux) {
        filtered = filtered.filter(f => {
          const p = f.properties || {};
          return !isReseau(p.nature_travaux) && !isReseau(p.nature_chantier);
        });
      }

      // Timeline date filter
      if (timelineEnabled && timelineSlider) {
        const selectedDate = getSliderDate();
        const selTime = selectedDate.getTime();
        filtered = filtered.filter(f => {
          const p = f.properties || {};
          const deb = p.date_debut ? new Date(p.date_debut) : null;
          const fin = p.date_fin ? new Date(p.date_fin) : null;
          if (!deb || isNaN(deb)) return true;
          if (deb.getTime() > selTime) return false;
          if (fin && !isNaN(fin) && fin.getTime() < selTime) return false;
          return true;
        });
        criteria._timeline = fmtFull(selectedDate);
      }

      // Update timeline hero
      if (timelineDateLabel) timelineDateLabel.textContent = fmtFull(getSliderDate());
      if (timelineCountEl) timelineCountEl.textContent = filtered.length;

      renderActiveBadges(criteria);

      const hasActiveFilter = !!(selectNature.value || selectCommune.value || selectEtat.value || hideReseaux);
      resetBtn.style.display = hasActiveFilter ? '' : 'none';

      projectListEl.innerHTML = '';
    }

    // Mise à jour des filtres et des options
    function updateFilterOptions() {
      const savedNature = selectNature.value;
      selectNature.innerHTML = '<option value="">Nature</option>' + filterOptions(natures, natureCounts);
      if (savedNature) {
        const opt = selectNature.querySelector(`option[value="${savedNature}"]`);
        if (opt) selectNature.value = savedNature; else selectNature.value = '';
      }
    }

    // Écouteurs d'événements
    [selectNature, selectCommune, selectEtat].forEach(el => el.addEventListener('change', applyFiltersAndSync));

    if (timelineSlider && timelineEnabled) {
      timelineSlider.addEventListener('input', applyFiltersAndSync);
    }

    hideReseauxCheckbox.addEventListener('change', () => {
      updateFilterOptions();
      applyFiltersAndSync();
    });

    resetBtn.addEventListener('click', () => {
      selectNature.value = '';
      selectCommune.value = '';
      selectEtat.value = '';
      hideReseauxCheckbox.checked = false;
      if (timelineSlider && timelineEnabled) {
        const today = new Date();
        const todayOffset = Math.round((today - timelineMinDate) / 86400000);
        const totalDays = parseInt(timelineSlider.max, 10);
        timelineSlider.value = Math.max(0, Math.min(totalDays, todayOffset));
      }
      updateFilterOptions();
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
