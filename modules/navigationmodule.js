// modules/NavigationModule.js
const NavigationModule = (() => {
  const projectDetailPanel = document.getElementById('project-detail');
  
  function normalizeString(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/['"\`´]/g, "'")
      .replace(/\u00A0/g, ' ')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  
  // Fonction helper pour obtenir les catégories de contribution dynamiquement
  const getContributionLayers = () => {
    return (typeof window.getAllCategories === 'function') ? window.getAllCategories() : [];
  };

  function normalizeCategoryName(category) {
    return (category === 'transport') ? 'mobilite' : category;
  }

  /**
   * Récupère les layers associés à une catégorie depuis categoryLayersMap
   * @param {string} category - Nom de la catégorie
   * @returns {string[]} - Liste des layers à afficher
   */
  function getCategoryLayers(category) {
    const normalized = normalizeCategoryName(category);
    return window.categoryLayersMap?.[normalized] || [normalized];
  }

  /**
   * S'assure qu'un layer est chargé (données en mémoire)
   * @param {string} layerName - Nom du layer
   */
  async function ensureLayerLoaded(layerName) {
    if (!window.DataModule?.layerData?.[layerName]) {
      try {
        await window.DataModule.loadLayer(layerName);
      } catch (e) {
        console.warn(`[NavigationModule] Erreur chargement layer ${layerName}:`, e);
        throw e;
      }
    }
  }

  /**
   * S'assure que tous les layers d'une catégorie sont chargés
   * @param {string} category - Nom de la catégorie
   */
  async function ensureCategoryLayersLoaded(category) {
    const layers = getCategoryLayers(category);
    console.log(`[NavigationModule] Chargement layers pour catégorie "${category}":`, layers);
    
    for (const layerName of layers) {
      try {
        await ensureLayerLoaded(layerName);
      } catch (e) {
        console.warn(`[NavigationModule] Impossible de charger ${layerName}`);
      }
    }
  }

  /**
   * Affiche tous les layers d'une catégorie sur la carte
   * @param {string} category - Nom de la catégorie
   */
  async function showCategoryLayers(category) {
    console.log(`[NavigationModule] ========== showCategoryLayers START ==========`);
    console.log(`[NavigationModule] Catégorie: "${category}"`);
    
    const layers = getCategoryLayers(category);
    console.log(`[NavigationModule] Layers à afficher:`, layers);
    
    // Reset les filtres
    if (window.FilterModule?.resetAll) {
      console.log(`[NavigationModule] Reset des filtres`);
      FilterModule.resetAll();
    }
    
    // Pour chaque layer, vérifier s'il existe déjà avec des données
    for (const layerName of layers) {
      const existingLayer = window.MapModule?.layers?.[layerName];
      
      // Compter les features existantes sur la carte
      let existingFeaturesCount = 0;
      if (existingLayer && typeof existingLayer.getLayers === 'function') {
        existingFeaturesCount = existingLayer.getLayers().length;
      }
      
      console.log(`[NavigationModule] Layer "${layerName}": ${existingFeaturesCount} features sur la carte`);
      
      // Si le layer existe déjà avec des données, le garder
      if (existingFeaturesCount > 0) {
        console.log(`[NavigationModule] ✅ Layer "${layerName}" conservé (${existingFeaturesCount} features)`);
        // S'assurer qu'il est visible
        if (window.MapModule?.map && !MapModule.map.hasLayer(existingLayer)) {
          MapModule.map.addLayer(existingLayer);
        }
        continue;
      }
      
      // Sinon, essayer de charger les données
      console.log(`[NavigationModule] Chargement du layer "${layerName}"...`);
      try {
        await ensureLayerLoaded(layerName);
      } catch (e) {
        console.warn(`[NavigationModule] ⚠️ Impossible de charger "${layerName}":`, e);
      }
    }
    
    // Log état final
    const finalLayers = Object.keys(window.MapModule?.layers || {});
    console.log(`[NavigationModule] Layers sur la carte après:`, finalLayers);
    
    // Compter les features visibles
    finalLayers.forEach(ln => {
      const layer = window.MapModule?.layers?.[ln];
      if (layer && typeof layer.getLayers === 'function') {
        console.log(`[NavigationModule] Layer "${ln}": ${layer.getLayers().length} features sur la carte`);
      }
    });
    
    console.log(`[NavigationModule] ========== showCategoryLayers END ==========`);
  }

  function loadOrCreateLayer(layerName) {
    if (DataModule.layerData && DataModule.layerData[layerName]) {
      DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
    } else {
      DataModule.loadLayer(layerName);
    }
  }

  /**
   * Affiche une contribution spécifique (panneau de détail + zoom)
   * Utilisé pour les clics directs sur la carte
   * @param {string} projectName - Nom du projet
   * @param {string} category - Catégorie de la contribution
   * @param {Object} contributionData - Données de la contribution (optionnel)
   */
  async function showSpecificContribution(projectName, category, contributionData = null) {
    console.log(`[NavigationModule] ========== showSpecificContribution START ==========`);
    console.log(`[NavigationModule] Projet: "${projectName}"`);
    console.log(`[NavigationModule] Catégorie: "${category}"`);
    console.log(`[NavigationModule] Données contribution:`, contributionData);
    
    const layerName = normalizeCategoryName(category);
    console.log(`[NavigationModule] Layer normalisé: "${layerName}"`);
    
    // Log état AVANT
    console.log(`[NavigationModule] Layers sur la carte AVANT:`, Object.keys(window.MapModule?.layers || {}));
    
    // S'assurer que le layer est chargé
    try {
      await ensureLayerLoaded(layerName);
      console.log(`[NavigationModule] ✅ Layer "${layerName}" chargé`);
    } catch (e) {
      console.warn('[NavigationModule] ⚠️ Layer non disponible:', e);
    }
    
    // Zoomer sur la contribution si on a ses coordonnées
    if (contributionData && window.MapModule?.map) {
      const map = MapModule.map;
      
      // Chercher la feature correspondante dans le layer pour zoomer
      const layer = MapModule.layers?.[layerName];
      if (layer && typeof layer.eachLayer === 'function') {
        let found = false;
        layer.eachLayer((featureLayer) => {
          const props = featureLayer.feature?.properties || {};
          if (props.project_name === projectName || props.name === projectName) {
            found = true;
            console.log(`[NavigationModule] 🔍 Feature trouvée pour zoom:`, props.project_name);
            // Zoomer sur cette feature
            if (typeof featureLayer.getBounds === 'function') {
              const bounds = featureLayer.getBounds();
              if (bounds.isValid()) {
                console.log(`[NavigationModule] 🗺️ Zoom sur bounds:`, bounds);
                map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16 });
              }
            } else if (typeof featureLayer.getLatLng === 'function') {
              console.log(`[NavigationModule] 🗺️ Zoom sur point:`, featureLayer.getLatLng());
              map.setView(featureLayer.getLatLng(), 16);
            }
          }
        });
        if (!found) {
          console.warn(`[NavigationModule] ⚠️ Feature "${projectName}" non trouvée dans le layer`);
        }
      }
    }
    
    // Log état APRÈS
    console.log(`[NavigationModule] Layers sur la carte APRÈS:`, Object.keys(window.MapModule?.layers || {}));
    
    // Afficher le panneau de détail
    console.log(`[NavigationModule] Affichage panneau de détail...`);
    showProjectDetail(projectName, category, null, contributionData);
    
    console.log(`[NavigationModule] ========== showSpecificContribution END ==========`);
  }

  // Fonction utilitaire pour ajuster la vue de la carte
  function zoomOutOnLoadedLayers() {
    let combinedBounds = null;
    Object.values(MapModule.layers).forEach(layer => {
      if (typeof layer.getBounds === "function") {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          combinedBounds = combinedBounds ? combinedBounds.extend(bounds) : bounds;
        }
      }
    });
    if (combinedBounds) {
      MapModule.map.fitBounds(combinedBounds, { padding: [100, 100] });
    } else {
      MapModule.map.setView([45.75, 4.85], 12);
    }
  }

  async function showProjectDetail(projectName, category, event, enrichedProps = null) {
  
  if (event?.stopPropagation) {
    event.stopPropagation();
  }
  
  // Masquer tous les sous-menus
  document.querySelectorAll('.submenu').forEach(el => {
    el.style.display = 'none';
  });
  
  const leftNav = document.getElementById('left-nav');
  if (leftNav) {
    leftNav.style.borderRadius = window.innerWidth < 1024 
      ? '0 0 20px 20px' 
      : '20px 0 0 20px';
  }

  const resolveAssetUrl = (u) => {
    try {
      if (!u) return u;
      if (/^https?:\/\//i.test(u)) return u;
      if (location.protocol === 'file:' && u.startsWith('/')) {
        return '.' + u;
      }
      if (u.startsWith('/')) {
        const baseDir = location.pathname.replace(/[^\/]*$/, '');
        return (baseDir.endsWith('/') ? baseDir.slice(0, -1) : baseDir) + u;
      }
      return u;
    } catch(_) { return u; }
  };

  const effectiveCat = (category === 'velo' ? 'velo' : category);

  const panel = document.getElementById('project-detail');
  panel.innerHTML = '<p style="padding:1em">Chargement…</p>';
  panel.style.display = 'block';
  panel.style.removeProperty('max-height');
  panel.style.removeProperty('overflow');

  // Debug: vérifier la couleur primaire
  const computedPrimary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
  if (!computedPrimary || computedPrimary === '') {
    console.warn('[NavigationModule] --color-primary not set, applying city branding...');
    const currentCity = new URLSearchParams(location.search).get('city');
    if (currentCity && window.CityBrandingModule) {
      await window.CityBrandingModule.loadAndApplyBranding(currentCity, true);
    }
  }

  try {
    let contributionProject = null;
    
    if (enrichedProps) {
      contributionProject = {
        project_name: enrichedProps.project_name,
        category: enrichedProps.category,
        cover_url: enrichedProps.cover_url,
        description: enrichedProps.description,
        markdown_url: enrichedProps.markdown_url
      };
    } else if (window.supabaseService?.fetchProjectByCategoryAndName) {
      try {
        contributionProject = await window.supabaseService.fetchProjectByCategoryAndName(effectiveCat, projectName);
      } catch (error) {
        console.warn('[NavigationModule] Error fetching project:', error);
      }
    }

    // Vérifier si contributionProject existe avant d'accéder à ses propriétés
    if (!contributionProject) {
      panel.innerHTML = `
      <div style="padding: 2em; text-align: center; color: #666;">
        <h3>Projet non trouvé</h3>
        <p>Le projet "${projectName}" n'a pas été trouvé dans la base de données.</p>
        <p>Seuls les projets de la table contribution_uploads sont disponibles.</p>
      </div>
      `;
      return;
    }

    projectName = contributionProject.project_name;
    category = contributionProject.category;
    cover_url = contributionProject.cover_url;
    let description = contributionProject.description;
    let markdown_url = contributionProject.markdown_url;

    let markdown = null;
    let usedContribution = false;

    if (markdown_url) {
      try {
        const response = await fetch(markdown_url);
        if (response.ok) {
          markdown = await response.text();
          usedContribution = true;
        }
      } catch (error) {
        console.warn('[NavigationModule] Error fetching markdown:', error);
      }
    }
    
    async function ensureMarkdownUtils() {
      
      if (!window.MarkdownUtils) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/modules/MarkdownUtils.js';
          script.onload = () => {
            resolve();
          };
          script.onerror = () => {
            const error = new Error('Échec du chargement de MarkdownUtils');
            reject(error);
          };
          document.head.appendChild(script);
        });
      }
      
      if (window.MarkdownUtils?.loadDeps) {
        await window.MarkdownUtils.loadDeps();
      }
    }

    let attrs = {};
    let html = '';
    if (markdown) {
      await ensureMarkdownUtils();
      ({ attrs, html } = window.MarkdownUtils.renderMarkdown(markdown));
    }
    

    const extractFirstImageSrc = (markup) => {
      try {
        if (!markup) return null;
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        const img = doc.querySelector('img');
        const src = img?.getAttribute('src') || img?.getAttribute('data-src');
        return src || null;
      } catch(_) { return null; }
    };

    let body='';
    // Utiliser les données de contribution_uploads en priorité
    const coverCandidate = cover_url || attrs.cover || extractFirstImageSrc(html);
    if (coverCandidate) {
      const coverUrl = resolveAssetUrl(coverCandidate);
      body+=`
      <div class="project-cover-wrap">
        <img class="project-cover" src="${coverUrl}" alt="${attrs.name||projectName||''}">
        <button class="cover-extend-btn" aria-label="Agrandir l'image" title="Agrandir">
          <i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>
        </button>
      </div>`;
    }
    const chips=[];
    if(attrs.from||attrs.to) chips.push(`<span class="chip chip-route">${attrs.from||''}${attrs.to?` → ${attrs.to}`:''}</span>`);
    if(attrs.trafic) chips.push(`<span class="chip chip-trafic">${attrs.trafic}</span>`);
    if(chips.length) body+=`<div class="project-chips">${chips.join('')}</div>`;
    
    // Utiliser description de contribution_uploads en priorité
    description = description || attrs.description;
    if(description) body+=`<p class="project-description">${description}</p>`;

    const icons={velo:'fa-bicycle',mobilite:'fa-train-tram',urbanisme:'fa-building'};

    // Construire l'URL de la fiche complète
    const params = new URLSearchParams();
    if (category) params.set('cat', category);
    if (projectName) params.set('project', projectName);
    const currentCity = new URLSearchParams(location.search).get('city');
    if (currentCity) params.set('city', currentCity);
    const fullPageUrl = `/fiche/?${params.toString()}`;

    panel.innerHTML = `
      <div class="detail-header-submenu">
        <div class="header-actions">
          <button id="detail-back-btn" class="btn-secondary detail-back-btn" aria-label="Retour">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
            <span>Retour</span>
          </button>
          <button id="detail-panel-toggle-btn" class="btn-secondary submenu-toggle-btn" aria-label="Réduire" aria-expanded="true" aria-controls="project-detail">
            <i class="fa-solid fa-compress" aria-hidden="true"></i>
            <span>Réduire</span>
          </button>
        </div>
      </div>
      <div class="project-title-container">
        <i class="fa-solid ${icons[category]||'fa-map'}"></i>
        <h3 class="project-title">${window.SecurityUtils ? window.SecurityUtils.escapeHtml(projectName) : projectName}</h3>
      </div>
      ${fullPageUrl ? `<a href="${fullPageUrl}" class="detail-fullpage-btn">
         <i class="fa-solid fa-up-right-from-square"></i>Voir la fiche complète
        </a>` : ''}
      <div id="detail-content" class="markdown-body">${body}</div>`;
    
    // Ensure reduce button starts expanded state (compress icon + label)
    try {
      const _btn = document.getElementById('detail-panel-toggle-btn');
      const _ic = _btn?.querySelector('i');
      const _lbl = _btn?.querySelector('span');
      if (_ic) { _ic.classList.remove('fa-expand'); _ic.classList.add('fa-compress'); }
      if (_lbl) _lbl.textContent = 'Réduire';
      _btn?.classList.remove('is-collapsed');
      if (_btn) { _btn.setAttribute('aria-expanded', 'true'); _btn.setAttribute('aria-label', 'Réduire'); }
    } catch(_) {}

    // Le bouton de thème du panneau de détail a été supprimé; aucune synchronisation nécessaire ici.
    let themeObserver = null;

    // Styles déplacés dans style.css (cover overlay + lightbox)

    // Wire up Extend button in this panel
    (function(){
      const content = panel.querySelector('#detail-content');
      const coverWrap = content?.querySelector('.project-cover-wrap');
      if (!coverWrap) return;
      const btn = coverWrap.querySelector('.cover-extend-btn');
      const img = coverWrap.querySelector('img.project-cover');
      const openLightbox = () => {
        const overlay = document.createElement('div');
        overlay.className = 'cover-lightbox';
        // Sécurisé avec SecurityUtils
        const safeSrc = window.SecurityUtils ? window.SecurityUtils.sanitizeUrl(img.getAttribute('src')) : img.getAttribute('src');
        const safeAlt = window.SecurityUtils ? window.SecurityUtils.escapeAttribute(img.getAttribute('alt') || '') : (img.getAttribute('alt') || '');
        overlay.innerHTML = `
          <div class="lightbox-content">
            <img src="${safeSrc}" alt="${safeAlt}">
            <button class="btn-secondary lightbox-close" aria-label="Fermer">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        `;
        document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.lightbox-close').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        // Set initial focus for accessibility
        const closeBtn = overlay.querySelector('.lightbox-close');
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      };
      btn?.addEventListener('click', openLightbox);
    })();

    // Wire up "Voir la fiche complète": navigation native vers la route dynamique (pas de modal)
    (function(){
      const cta = panel.querySelector('.detail-fullpage-btn');
      if (!cta) return;
      // Ne pas intercepter le clic: laisser la navigation gérer l'historique/SEO
    })();

    // (Bouton fermer supprimé)

    // Toggle collapse control (all sizes)
    const toggleBtn = document.getElementById('detail-panel-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const iconEl = toggleBtn.querySelector('i');
        const labelEl = toggleBtn.querySelector('span');
        const isCollapsed = toggleBtn.getAttribute('aria-expanded') === 'false';
        if (isCollapsed) {
          // Expand
          panel.style.removeProperty('max-height');
          panel.style.removeProperty('overflow');
          if (iconEl) {
            if (iconEl.classList.contains('fa-expand')) iconEl.classList.replace('fa-expand', 'fa-compress');
            else iconEl.classList.add('fa-compress');
          }
          if (labelEl) labelEl.textContent = 'Réduire';
          toggleBtn.classList.remove('is-collapsed');
          toggleBtn.setAttribute('aria-expanded', 'true');
          toggleBtn.setAttribute('aria-label', 'Réduire');
        } else {
          // Collapse
          panel.style.setProperty('max-height', '10vh', 'important');
          panel.style.setProperty('overflow', 'hidden', 'important');
          if (iconEl && iconEl.classList.contains('fa-compress')) iconEl.classList.replace('fa-compress', 'fa-expand');
          if (labelEl) labelEl.textContent = 'Développer';
          toggleBtn.classList.add('is-collapsed');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', 'Développer');
        }
      });
    }

    // Bouton "Retour" : affiche toutes les contributions de la catégorie
    const backButton = document.getElementById('detail-back-btn');
    if (backButton) {
      backButton.onclick = () => NavigationModule.resetToDefaultView(category, { preserveMapView: true, updateHistory: true });
    }
    
    // Bouton "Fermer" : ferme le panneau et affiche toutes les contributions de toutes les catégories
    const closeButton = document.getElementById('detail-close-btn');
    if (closeButton) {
      closeButton.onclick = () => NavigationModule.resetToDefaultView(null, { preserveMapView: false, updateHistory: true });
    }
  }catch(e){
    console.error('[NavigationModule] Error in showProjectDetail:', e);
    const safeProjectName = window.SecurityUtils ? window.SecurityUtils.escapeHtml(projectName) : projectName;
    panel.innerHTML=`<h3>${safeProjectName}</h3><p>Aucun détail disponible.</p>`;
  }

  // Stocker la catégorie pour le bouton retour
  if (category) {
    projectDetailPanel.dataset.filterLayer = normalizeCategoryName(category);
  }

  function normLoose(s) { return normalizeString(s).replace(/\s+/g, ''); }

}

  // Legacy code supprimé - createProjectClickHandler, renderVeloProjects, renderUrbanismeProjects, renderTravauxProjects
  // Désormais géré par SubmenuManager → SubmenuModule/TravauxModule

  /**
   * Restaure l'opacité normale de tous les layers
   */
  function restoreAllLayerOpacity() {
    try {
      const layersObj = window.MapModule?.layers || {};
      Object.keys(layersObj).forEach(name => {
        const layer = layersObj[name];
        if (!layer) return;
        window.DataModule?.safeSetStyle?.(layer, { opacity: 1, fillOpacity: 0.5 });
        if (typeof layer.setOpacity === 'function') {
          layer.setOpacity(1);
        }
      });
    } catch (_) { /* noop */ }
  }

  /**
   * Réinitialise la vue à l'état par défaut de l'application
   * 
   * COMPORTEMENTS :
   * - Avec category : Affiche toutes les contributions de la catégorie (bouton "Retour")
   * - Sans category : Affiche tous les layers par défaut + contributions (bouton "Fermer")
   * 
   * @param {string} [category] - Catégorie à afficher (optionnel)
   * @param {{ preserveMapView?: boolean, updateHistory?: boolean }} [options] - Options
   */
  const resetToDefaultView = async (category, options = {}) => {
    const { preserveMapView = false, updateHistory = false } = options;
    
    console.log(`[NavigationModule] ========== resetToDefaultView START ==========`);
    console.log(`[NavigationModule] Catégorie: "${category || 'AUCUNE (fermeture totale)'}"`);
    console.log(`[NavigationModule] Options:`, options);
    console.log(`[NavigationModule] Layers sur la carte AVANT:`, Object.keys(window.MapModule?.layers || {}));
    
    // 1. Masquer le panneau de détail
    const projectDetail = document.getElementById('project-detail');
    if (projectDetail) {
      console.log(`[NavigationModule] Masquage panneau de détail`);
      projectDetail.style.display = 'none';
    }
    
    // 2. Restaurer l'opacité de tous les layers
    console.log(`[NavigationModule] Restauration opacité layers`);
    restoreAllLayerOpacity();
    
    // ========================================
    // CAS 1 : Retour vers une catégorie spécifique (bouton "Retour")
    // ========================================
    if (category) {
      console.log(`[NavigationModule] 🔙 CAS 1: Retour vers catégorie "${category}"`);
      console.log(`[NavigationModule] categoryLayersMap:`, window.categoryLayersMap);
      
      // Masquer tous les submenus puis afficher celui de la catégorie
      document.querySelectorAll('.submenu').forEach(menu => menu.style.display = 'none');
      const submenu = document.querySelector(`.submenu[data-category="${category}"]`);
      if (submenu) submenu.style.display = 'block';
      
      // Activer l'onglet de navigation
      document.querySelectorAll('.nav-category').forEach(tab => {
        tab.classList.toggle('active', tab.id === `nav-${category}`);
      });
      
      // Afficher TOUS les layers de cette catégorie (sans filtre)
      console.log(`[NavigationModule] Appel showCategoryLayers("${category}")...`);
      await showCategoryLayers(category);
      
      // Rafraîchir le submenu
      try {
        console.log(`[NavigationModule] Rafraîchissement submenu "${category}"...`);
        if (window.SubmenuManager?.renderSubmenu) {
          await window.SubmenuManager.renderSubmenu(category);
        }
      } catch (e) {
        console.error('[resetToDefaultView] Erreur render submenu:', e);
      }
      
      // Mettre à jour l'historique
      if (updateHistory) {
        try {
          const params = new URLSearchParams();
          params.set('cat', category);
          history.pushState({ cat: category }, '', `${location.pathname}?${params}`);
        } catch (_) {}
      }
      
      // Log état final CAS 1
      console.log(`[NavigationModule] Layers sur la carte APRÈS (CAS 1):`, Object.keys(window.MapModule?.layers || {}));
      console.log(`[NavigationModule] ========== resetToDefaultView END (CAS 1) ==========`);
      return;
    }
    
    // ========================================
    // CAS 2 : Fermeture totale (retour à l'état initial) - bouton "Fermer"
    // ========================================
    console.log(`[NavigationModule] ❌ CAS 2: Fermeture totale`);
    console.log(`[NavigationModule] defaultLayers:`, window.defaultLayers);
    console.log(`[NavigationModule] Toutes les catégories:`, getContributionLayers());
    
    // Masquer tous les submenus
    document.querySelectorAll('.submenu').forEach(menu => menu.style.display = 'none');
    document.querySelectorAll('.nav-category.active').forEach(tab => tab.classList.remove('active'));
    
    // Reset les filtres
    if (window.FilterModule?.resetAll) {
      console.log(`[NavigationModule] Reset des filtres`);
      FilterModule.resetAll();
    }
    
    // Charger et afficher les layers par défaut
    if (window.defaultLayers && window.defaultLayers.length > 0) {
      console.log(`[NavigationModule] Chargement ${window.defaultLayers.length} layers par défaut...`);
      for (const layerName of window.defaultLayers) {
        try {
          console.log(`[NavigationModule] Chargement layer par défaut: "${layerName}"`);
          await ensureLayerLoaded(layerName);
          const layer = window.MapModule?.layers?.[layerName];
          if (layer && window.MapModule?.map && !window.MapModule.map.hasLayer(layer)) {
            console.log(`[NavigationModule] Ajout layer "${layerName}" à la carte`);
            window.MapModule.map.addLayer(layer);
          }
        } catch (e) {
          console.warn(`[resetToDefaultView] Erreur chargement layer ${layerName}:`, e);
        }
      }
    }
    
    // Charger et afficher toutes les contributions (toutes catégories)
    const contributionCategories = getContributionLayers();
    console.log(`[NavigationModule] Chargement ${contributionCategories.length} catégories de contributions...`);
    for (const cat of contributionCategories) {
      try {
        console.log(`[NavigationModule] Chargement catégorie: "${cat}"`);
        await showCategoryLayers(cat);
      } catch (e) {
        console.warn(`[resetToDefaultView] Erreur affichage catégorie ${cat}:`, e);
      }
    }
    
    if (!preserveMapView) {
      if (window.NavigationModule && window.NavigationModule.zoomOutOnLoadedLayers) {
        window.NavigationModule.zoomOutOnLoadedLayers();
      }
    }
    
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    
    if (window.UIModule && window.UIModule.updateLayerControls) {
      window.UIModule.updateLayerControls();
    }
    
    const leftNav = document.getElementById('left-nav');
    if (leftNav) {
      leftNav.style.borderRadius = '20px';
    }

    try {
      if (updateHistory && typeof history?.pushState === 'function') {
        const params = new URLSearchParams();
        if (category) params.set('cat', category);
        const newQuery = params.toString();
        const newUrl = `${location.pathname}${newQuery ? `?${newQuery}` : ''}`;
        history.pushState(category ? { cat: category } : null, '', newUrl);
      }
    } catch (_) { /* noop */ }
    
    // Log état final CAS 2
    console.log(`[NavigationModule] Layers sur la carte APRÈS (CAS 2):`, Object.keys(window.MapModule?.layers || {}));
    // Compter les features
    Object.keys(window.MapModule?.layers || {}).forEach(ln => {
      const layer = window.MapModule?.layers?.[ln];
      if (layer && typeof layer.getLayers === 'function') {
        console.log(`[NavigationModule] Layer "${ln}": ${layer.getLayers().length} features`);
      }
    });
    console.log(`[NavigationModule] ========== resetToDefaultView END (CAS 2) ==========`);
  }

  const publicAPI = { 
    showProjectDetail, 
    showSpecificContribution,
    zoomOutOnLoadedLayers, 
    resetToDefaultView
  };
  
  window.NavigationModule = publicAPI;
  
  return publicAPI;
})();
