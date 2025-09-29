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

  function hideAllLayersExcept(keepLayerName) {
    try {
      const layersObj = window.MapModule?.layers || {};
      Object.keys(layersObj).forEach(name => {
        if (name !== keepLayerName) {
          try { window.MapModule.removeLayer(name); } catch(_) {}
        }
      });
    } catch(_) {}
  }

  async function ensureLayerLoaded(layerName) {
    if (!window.DataModule?.layerData?.[layerName]) {
      try {
        await window.DataModule.loadLayer(layerName);
      } catch (e) {
        throw e;
      }
    }
  }

  function loadOrCreateLayer(layerName) {
    if (DataModule.layerData && DataModule.layerData[layerName]) {
      DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
    } else {
      DataModule.loadLayer(layerName);
    }
  }

  async function applyContributionFilter(projectName, category) {
    const layerName = normalizeCategoryName(category);

    if (!layerName) {
      return;
    }

    try {
      await ensureLayerLoaded(layerName);
    } catch (e) {
      return;
    }

    hideAllLayersExcept(layerName);

    if (window.UIModule?.applyFilter && projectName) {
      window.UIModule.applyFilter(layerName, { project_name: projectName });
      if (window.UIModule.updateActiveFilterTagsForLayer) {
        window.UIModule.updateActiveFilterTagsForLayer(layerName);
      }
    }

    const layer = window.MapModule?.layers?.[layerName];
    if (layer && typeof layer.getBounds === 'function') {
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        window.MapModule.map.fitBounds(bounds, { padding: [100, 100] });
        setTimeout(() => { if (window.MapModule.map.getZoom() > 15) window.MapModule.map.setZoom(15); }, 300);
      }
    }

    return layerName; // Retourner le nom de couche pour compatibilité
  }

  /**
   * Affiche une contribution spécifique (filtrage + panneau de détail)
   * Utilisé pour les clics directs sur la carte
   */
  async function showSpecificContribution(projectName, category, contributionData = null) {
    await applyContributionFilter(projectName, category);
    showProjectDetail(projectName, category, null, contributionData);
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
  
  // Récupérer dynamiquement les sous-menus depuis les catégories
  const allCategories = getContributionLayers();
  allCategories.forEach(category => {
    const el = document.getElementById(`${category}-submenu`);
    if (el) {
      el.style.display = 'none';
    }
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
      }
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
      }
    } else if (!projectName) {
      panel.innerHTML = `
      <div style="padding: 2em; text-align: center; color: #666;">
        <h3>Projet non trouvé</h3>
        <p>Le projet "${projectName}" n'a pas été trouvé dans la base de données.</p>
        <p>Seuls les projets de la table contribution_uploads sont disponibles.</p>
      </div>
      `;
      return;
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

    // 1) Utiliser la route dynamique pour la fiche complète
    let fullPageUrl = null;
    try {
      const params = new URLSearchParams();
      if (category) params.set('cat', category);
      if (projectName) params.set('project', projectName);
      fullPageUrl = `/fiche/?${params.toString()}`;
    } catch (_) {
      fullPageUrl = `/fiche/?cat=${encodeURIComponent(category||'')}&project=${encodeURIComponent(projectName||'')}`;
    }

    panel.innerHTML = `
      <div class="detail-header-submenu">
        <div class="header-actions">
          <button id="detail-back-btn" class="gp-btn gp-btn--secondary" aria-label="Retour">
            <i class="fa-solid fa-arrow-left gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Retour</span>
          </button>
          <button id="detail-panel-toggle-btn" class="gp-btn gp-btn--secondary submenu-toggle-btn" aria-label="Réduire" aria-expanded="true" aria-controls="project-detail">
            <i class="fa-solid fa-compress gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Réduire</span>
          </button>
        </div>
      </div>
      <div class="project-title-container">
        <i class="fa-solid ${icons[category]||'fa-map'}"></i>
        <h3 class="project-title">${projectName}</h3>
      </div>
      ${fullPageUrl ? `<a href="${fullPageUrl}" class="detail-fullpage-btn">
         <i class="fa-solid fa-up-right-from-square"></i>Voir la fiche complète
        </a>` : ''}
      <div id="detail-content" class="markdown-body">${body}</div>`;
    
    // Ensure reduce button starts expanded state (compress icon + label)
    try {
      const _btn = document.getElementById('detail-panel-toggle-btn');
      const _ic = _btn?.querySelector('i');
      const _lbl = _btn?.querySelector('.gp-btn__label');
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
        overlay.innerHTML = `
          <div class="lightbox-content">
            <img src="${img.getAttribute('src')}" alt="${img.getAttribute('alt') || ''}">
            <button class="lightbox-close" aria-label="Fermer">
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
        const labelEl = toggleBtn.querySelector('.gp-btn__label');
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

    const backButton = document.getElementById('detail-back-btn');
    if (backButton) {
      backButton.onclick = () => NavigationModule.resetToDefaultView(category, { preserveMapView: true, updateHistory: true });
    }
  }catch(e){
    panel.innerHTML=`<h3>${projectName}</h3><p>Aucun détail disponible.</p>`;
  }

  await resolveAndApplyLayerFiltering(projectName, category);

  function normLoose(s) { return normalizeString(s).replace(/\s+/g, ''); }
  function restoreAllLayerOpacity() {
    try {
      const layersObj = window.MapModule?.layers || {};
      Object.keys(layersObj).forEach(name => {
        const layer = layersObj[name];
        if (!layer) return;
        window.DataModule?.safeSetStyle(layer, { opacity: 1, fillOpacity: 0.5 });
        if (typeof layer.setOpacity === 'function') {
          layer.setOpacity(1);
        }
      });
    } catch (_) { /* noop */ }
  }

  async function resolveAndApplyLayerFiltering(projectName, category) {
    // Déléguer à la fonction centralisée
    const layerName = await applyContributionFilter(projectName, category);
    
    // Assigner pour consommation ultérieure (compatibilité)
    if (layerName) {
      projectDetailPanel.dataset.filterLayer = layerName;
    }
  }

  // highlightProjectPaths supprimée - debug uniquement, non utilisée en production

}

  // Legacy code supprimé - createProjectClickHandler, renderVeloProjects, renderUrbanismeProjects, renderTravauxProjects
  // Désormais géré par SubmenuManager → SubmenuModule/TravauxModule

  /**
   * Réinitialise la vue à l'état par défaut de l'application
   * - Si une catégorie est fournie, affiche uniquement le sous-menu correspondant
   * - Sinon, affiche uniquement les couches par défaut
   * - Masque tous les panneaux et sous-menus non concernés
   * - Peut réinitialiser la vue de la carte (désactivable via options)
   * - Peut mettre à jour l'URL/historique (désactivable via options)
   * @param {string} [category] - Catégorie à afficher (optionnel)
   * @param {{ preserveMapView?: boolean, updateHistory?: boolean }} [options] - Options de réinitialisation
   */
  const resetToDefaultView = async (category, options = {}) => {
    const { preserveMapView = false, updateHistory = false } = options;
    console.log('Réinitialisation de la vue à l\'état par défaut');
    
    // 1. Masquer le panneau de détail
    const projectDetail = document.getElementById('project-detail');
    if (projectDetail) {
      projectDetail.style.display = 'none';
    }
    // Toujours restaurer l'opacité des couches au début du reset
    try { restoreAllLayerOpacity(); } catch(_) {}
    
    // Si une catégorie est spécifiée, afficher uniquement le sous-menu correspondant
    if (category) {
      // Définir les couches à afficher en fonction de la catégorie
      const layersToDisplay = (window.categoryLayersMap && window.categoryLayersMap[category]) || [category];
      
      // Masquer tous les sous-menus d'abord
      document.querySelectorAll('.submenu').forEach(menu => {
        menu.style.display = 'none';
      });
      
      // Afficher le sous-menu de la catégorie spécifiée
      const submenu = document.getElementById(`${category}-submenu`);
      if (submenu) {
        submenu.style.display = 'block';
        
        // Mettre à jour l'onglet actif
        document.querySelectorAll('.nav-category').forEach(tab => {
          if (tab.id === `nav-${category}`) {
            tab.classList.add('active');
          } else {
            tab.classList.remove('active');
          }
        });
        
        // 1. D'abord, réinitialiser tous les filtres
        FilterModule.resetAll();

        // 1.bis Nettoyer l'UI des filtres pour ces couches (tags + état visuel)
        try {
          layersToDisplay.forEach(layerName => {
            const filterItem = document.querySelector(`.filter-item[data-layer="${layerName}"]`);
            if (filterItem) filterItem.classList.remove('active-filter');
            if (window.UIModule?.resetLayerFilterWithoutRemoving) {
              window.UIModule.resetLayerFilterWithoutRemoving(layerName);
            }
          });
        } catch (e) {}

        Object.keys(MapModule.layers).forEach(layerName => {
          if (!layersToDisplay.includes(layerName)) {
            MapModule.removeLayer(layerName);
          } else {
            MapModule.removeLayer(layerName);
          }
        });

        layersToDisplay.forEach(layerName => {
          loadOrCreateLayer(layerName);
        });
        
        try { restoreAllLayerOpacity(); } catch(_) {}

        try {
          if (window.SubmenuManager?.renderSubmenu) {
            await window.SubmenuManager.renderSubmenu(category);
          }
        } catch (e) {
        }
        
        try {
          if (updateHistory && typeof history?.pushState === 'function') {
            const params = new URLSearchParams();
            params.set('cat', category);
            const newUrl = `${location.pathname}?${params.toString()}`;
            history.pushState({ cat: category }, '', newUrl);
          }
        } catch (_) { /* noop */ }

        return;
      }
    }
    
    document.querySelectorAll('.submenu').forEach(menu => {
      menu.style.display = 'none';
    });
    
    document.querySelectorAll('.nav-category.active').forEach(tab => {
      tab.classList.remove('active');
    });
    
    if (window.defaultLayers && window.defaultLayers.length > 0) {
      
      window.defaultLayers.forEach(layerName => {
        if (!window.MapModule.layers || !window.MapModule.layers[layerName]) {
          DataModule.loadLayer(layerName);
        }
      });
      
      if (window.MapModule && window.MapModule.layers && window.MapModule.map) {
        Object.keys(window.MapModule.layers).forEach(layerName => {
          const layer = window.MapModule.layers[layerName];
          if (layer) {
            if (window.defaultLayers.includes(layerName)) {
              if (!window.MapModule.map.hasLayer(layer)) {
                window.MapModule.map.addLayer(layer);
              }
            } else {
              if (window.MapModule.map.hasLayer(layer)) {
                window.MapModule.map.removeLayer(layer);
              }
            }
          }
        });
      }
      
      // Afficher à nouveau toutes les contributions par défaut
      try {
        const contributionLayers = CONTRIBUTION_LAYERS;
        contributionLayers.forEach(layerName => {
          // Réinitialiser l'état visuel du filtre et les tags si disponibles
          try {
            const filterItem = document.querySelector(`.filter-item[data-layer="${layerName}"]`);
            if (filterItem) filterItem.classList.add('active-filter');
            if (window.UIModule?.resetLayerFilterWithoutRemoving) {
              window.UIModule.resetLayerFilterWithoutRemoving(layerName);
            } else if (window.UIModule?.resetLayerFilter) {
              window.UIModule.resetLayerFilter(layerName);
            }
          } catch (_) { /* noop */ }

          loadOrCreateLayer(layerName);
          const lyr = window.MapModule.layers && window.MapModule.layers[layerName];
          if (lyr && window.MapModule.map && !window.MapModule.map.hasLayer(lyr)) {
            window.MapModule.map.addLayer(lyr);
          }
        });
      } catch (e) {
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
