// modules/SubmenuModule.js
// Gestion unifiée des sous-menus de navigation par catégorie
const SubmenuModule = (() => {

  /**
   * Récupère le label d'affichage d'une catégorie
   * @param {string} category - Nom de la catégorie
   * @returns {string} Label à afficher
   */
  function getCategoryLabel(category) {
    if (!category) return 'projets';
    
    // Recherche dans categoryIcons (priorité)
    if (window.categoryIcons?.length) {
      const icon = window.categoryIcons.find(c => c.category === category);
      if (icon) return icon.label || icon.category || category;
    }
    
    // Fallback sur categoryConfig
    if (window.categoryConfig?.[category]?.label) {
      return window.categoryConfig[category].label;
    }
    
    return category;
  }

  /**
   * Affiche les projets d'une catégorie dans son sous-menu
   * @param {string} category - Catégorie des projets
   */
  async function renderProjectsByCategory(category) {
    const cat = String(category || '').trim();
    if (!cat) return;
    
    // Validation de la catégorie
    const categoryExists = window.categoryIcons?.some(c => c.category === cat);
    if (!categoryExists) {
      console.warn(`[SubmenuModule] Catégorie inconnue: ${cat}`);
      return;
    }

    // Setup du conteneur
    const projectList = setupSubmenuContainer({ category: cat });
    if (!projectList) {
      console.warn(`[SubmenuModule] Container introuvable pour ${cat}`);
      return;
    }

    try {
      // Récupération des projets
      const projects = await window.supabaseService?.fetchProjectsByCategory(cat);
      
      if (!projects?.length) {
        projectList.innerHTML = `<li class="no-projects">Aucun projet ${getCategoryLabel(cat)} disponible.</li>`;
        return;
      }

      // Nettoyage et rendu
      projectList.innerHTML = '';

      // Tri alphabétique
      projects.sort((a, b) => {
        const nameA = (a.project_name || '').toString();
        const nameB = (b.project_name || '').toString();
        return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
      });

      // Rendu des items
      projects.forEach(project => {
        projectList.appendChild(createProjectListItem(project, cat));
      });

    } catch (error) {
      console.error(`[SubmenuModule] Erreur rendu ${cat}:`, error);
      projectList.innerHTML = `<li class="error-message">Erreur lors du chargement des projets.</li>`;
    }
  }

  /**
   * Configure le conteneur du sous-menu (création HTML si nécessaire).
   * Délègue header/close/toggle à SubmenuManager.
   * @param {Object} config - Configuration avec category
   * @returns {HTMLElement|null} L'élément .project-list
   */
  function setupSubmenuContainer(config) {
    const container = document.querySelector(`.submenu[data-category="${config.category}"]`);
    if (!container) return null;
    
    // Vérifier si déjà initialisé
    let projectList = container.querySelector('.project-list');
    const alreadySetup = projectList && container.querySelector('.close-btn');
    
    if (!alreadySetup) {
      container.innerHTML = window.SubmenuManager.headerHTML() + '<ul class="project-list"></ul>';
      window.SubmenuManager.wireHeaderEvents(container);
      window.SubmenuManager.resetExpanded(container);
    }
    
    return container.querySelector('.project-list');
  }

  /**
   * Crée un item de liste pour un projet
   * @param {Object} project - Données du projet
   * @param {string} category - Catégorie
   * @returns {HTMLElement} Élément li
   */
  function createProjectListItem(project, category) {
    // Récupération icon et couleur
    const categoryIcon = window.categoryIcons?.find(c => c.category === category);
    let iconClass = categoryIcon?.icon_class || 'fa-layer-group';
    
    // Ajout fa-solid si manquant
    if (iconClass && !/^fa-(solid|regular|brands)/.test(iconClass)) {
      iconClass = `fa-solid ${iconClass}`;
    }
    
    // Extraction couleur
    let categoryColor = null;
    if (categoryIcon?.category_styles) {
      try {
        const styles = typeof categoryIcon.category_styles === 'string' 
          ? JSON.parse(categoryIcon.category_styles) 
          : categoryIcon.category_styles;
        categoryColor = styles.color || styles.fillColor;
      } catch (e) {
        console.warn(`[SubmenuModule] Parse error category_styles:`, e);
      }
    }
    
    const li = document.createElement('li');
    li.classList.add('project-item');
    li.dataset.project = project.project_name;
    
    // Vérifier si le projet a une cover_url
    const hasCover = !!(project.cover_url);
    
    // Styles inline
    const colorStyle = categoryColor ? `background: ${categoryColor}20; border-color: ${categoryColor};` : '';
    const iconColorStyle = categoryColor ? `color: ${categoryColor};` : '';
    
    // Construction HTML avec support image
    let visualHTML = '';
    if (hasCover) {
      // Afficher l'image de couverture
      visualHTML = `
        <div class="project-cover">
          <img src="${project.cover_url}" alt="${project.project_name}" loading="lazy" />
        </div>
      `;
    } else {
      // Afficher l'icône de catégorie
      visualHTML = `
        <div class="project-color" style="${colorStyle}">
          <i class="${iconClass}" style="${iconColorStyle}"></i>
        </div>
      `;
    }
    
    // Métadonnées (année, statut)
    let metaHTML = '';
    if (project.year || project.status) {
      metaHTML = '<div class="project-meta">';
      if (project.year) {
        metaHTML += `<div class="project-year">${project.year}</div>`;
      }
      if (project.status) {
        metaHTML += `<div class="project-status">${project.status}</div>`;
      }
      metaHTML += '</div>';
    }
    
    li.innerHTML = `
      ${visualHTML}
      <div class="project-info">
        <div class="project-name">${project.project_name || 'Projet sans nom'}</div>
        ${metaHTML}
      </div>
      <div class="project-arrow"><i class="fas fa-chevron-right"></i></div>
      <div class="hover-progress" aria-hidden="true"><div class="hover-progress__bar"></div></div>
      ${hasCover ? `<div class="project-thumb" role="presentation"><img class="project-thumb__img" src="${project.cover_url}" alt="" aria-hidden="true" /></div>` : ''}
    `;

    // Events
    li.addEventListener('click', () => {
      window.NavigationModule?.showProjectDetail(project.project_name, category);
    });
    
    li.addEventListener('mouseenter', () => { 
      // Toujours lancer la barre de progression (recentrement logique)
      scheduleProgress(li);
      // Ne lancer l'affichage de l'image que si cover_url existe
      if (hasCover) {
        scheduleShowCover(li, project.project_name, category);
      } else {
        // Pour les items sans image, juste le focus sur la feature
        scheduleFocusOnly(li, project.project_name, category);
      }
      // Highlight sur la carte sans centrage + fade out des autres
      window.NavigationModule?.highlightProjectOnMap(project.project_name, category, { panTo: false, fadeOthers: true });
    });
    
    li.addEventListener('mouseleave', () => { 
      cancelProgress(li);
      cancelShowCover(li);
      // Nettoyer le highlight seulement si le panel de détail n'est pas ouvert
      const detailPanel = document.getElementById('project-detail');
      const isPanelVisible = detailPanel && detailPanel.style.display === 'block';
      if (!isPanelVisible) {
        window.NavigationModule?.clearProjectHighlight();
      }
    });

    return li;
  }

  /**
   * Planifie l'affichage de la couverture au survol et focus sur la feature
   */
  function scheduleShowCover(li, projectName, category) {
    cancelShowCover(li);
    li._coverHoverTimer = setTimeout(() => {
      li.classList.add('show-thumb');
      requestAnimationFrame(() => updateThumbHeight(li));
      
      // Focus sur la feature associée avec offset adapté
      focusOnProjectFeature(projectName, category);
    }, 1000);
  }
  
  /**
   * Planifie uniquement le focus (pour items sans image)
   */
  function scheduleFocusOnly(li, projectName, category) {
    cancelShowCover(li);
    li._coverHoverTimer = setTimeout(() => {
      // Focus sur la feature associée avec offset adapté
      focusOnProjectFeature(projectName, category);
    }, 1000);
  }
  
  /**
   * Focus sur la feature d'un projet avec offset adapté selon la taille d'écran
   */
  function focusOnProjectFeature(projectName, category) {
    if (!window.MapModule?.map) return;
    
    try {
      // Récupérer la feature du projet
      const layers = window.MapModule.map._layers;
      let targetFeature = null;
      
      for (const layerId in layers) {
        const layer = layers[layerId];
        if (layer.feature && layer.feature.properties) {
          const props = layer.feature.properties;
          if (props.project_name === projectName || props.name === projectName) {
            targetFeature = layer;
            break;
          }
        }
      }
      
      if (!targetFeature) return;
      
      // Calculer l'offset selon la taille d'écran
      const isMobile = window.innerWidth <= 768;
      let paddingOptions;
      
      if (isMobile) {
        // Mobile : décalage vers le haut (barre de navigation en bas)
        paddingOptions = {
          paddingTopLeft: [0, 80],
          paddingBottomRight: [0, 0]
        };
      } else {
        // Desktop : décalage vers la droite (barre de navigation à gauche)
        paddingOptions = {
          paddingTopLeft: [200, 0],
          paddingBottomRight: [0, 0]
        };
      }
      
      // Focus sur la feature
      if (targetFeature.getBounds) {
        // Pour les polygones et lignes
        window.MapModule.map.fitBounds(targetFeature.getBounds(), {
          ...paddingOptions,
          maxZoom: 16,
          animate: true,
          duration: 0.5
        });
      } else if (targetFeature.getLatLng) {
        // Pour les points
        const latLng = targetFeature.getLatLng();
        const zoom = window.MapModule.map.getZoom();
        const targetZoom = Math.max(zoom, 15);
        
        window.MapModule.map.setView(latLng, targetZoom, {
          animate: true,
          duration: 0.5,
          ...paddingOptions
        });
      }
    } catch (error) {
      console.warn('[SubmenuModule] Erreur focus feature:', error);
    }
  }

  function cancelShowCover(li) {
    if (li._coverHoverTimer) {
      clearTimeout(li._coverHoverTimer);
      li._coverHoverTimer = null;
    }
    li.classList.remove('show-thumb');
  }

  /**
   * Planifie la barre de progression au survol
   */
  function scheduleProgress(li) {
    cancelProgress(li);
    li._progressTimer = setTimeout(() => {
      li.classList.add('progress-visible');
      const bar = li.querySelector('.hover-progress__bar');
      if (!bar) return;
      
      bar.style.transition = 'none';
      bar.style.width = '0%';
      bar.offsetHeight; // Force reflow
      bar.style.transition = 'width 700ms linear';
      bar.style.width = '100%';
    }, 300);
  }

  function cancelProgress(li) {
    if (li._progressTimer) {
      clearTimeout(li._progressTimer);
      li._progressTimer = null;
    }
    const bar = li.querySelector('.hover-progress__bar');
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
    }
    li.classList.remove('progress-visible');
  }

  /**
   * Cache des URLs de couverture
   */
  const coverCache = new Map();
  
  /**
   * Récupère l'URL de couverture d'un projet (avec cache)
   */
  async function fetchCoverForProject(name, category) {
    const key = `${category}|${name}`;
    if (coverCache.has(key)) return coverCache.get(key);
    
    try {
      const project = await window.supabaseService?.fetchProjectByCategoryAndName(category, name);
      const url = project?.cover_url || null;
      coverCache.set(key, url);
      return url;
    } catch (error) {
      console.warn('[SubmenuModule] Erreur récupération cover:', error);
      coverCache.set(key, null);
      return null;
    }
  }

  /**
   * Attache l'image de couverture à un item
   */
  function attachCoverThumbnail(li, projectName, category) {
    const thumb = li.querySelector('.project-thumb');
    if (!thumb) return;
    
    const existingImg = thumb.querySelector('img.project-thumb__img');
    if (existingImg?.getAttribute('src')) return;
    
    fetchCoverForProject(projectName, category).then(url => {
      if (!url) return;
      
      let img = existingImg;
      if (!img) {
        img = document.createElement('img');
        img.className = 'project-thumb__img';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        thumb.appendChild(img);
      }
      
      img.onload = () => updateThumbHeight(li);
      img.src = url;

      // Observer pour ajustement responsive
      if (!li._thumbRO && typeof ResizeObserver !== 'undefined') {
        li._thumbRO = new ResizeObserver(() => updateThumbHeight(li));
        li._thumbRO.observe(thumb);
      }
    });
  }

  /**
   * Met à jour la hauteur de la thumbnail
   */
  function updateThumbHeight(li) {
    const thumb = li.querySelector('.project-thumb');
    if (!thumb) return;
    
    const img = thumb.querySelector('img.project-thumb__img');
    const h = img ? img.getBoundingClientRect().height : thumb.getBoundingClientRect().height;
    const clamped = Math.min(h, 300);
    
    if (clamped > 0) {
      li.style.setProperty('--thumb-height', `${clamped}px`);
    }
  }

  /**
   * Initialise tous les sous-menus
   */
  async function initializeAllSubmenus() {
    const categories = Object.keys(window.categoryConfig || {});
    for (const category of categories) {
      try {
        await renderProjectsByCategory(category);
      } catch (error) {
        console.error(`[SubmenuModule] Erreur init ${category}:`, error);
      }
    }
  }

  /**
   * Met à jour un sous-menu spécifique
   */
  async function updateSubmenu(category) {
    await renderProjectsByCategory(category);
  }

  /**
   * Nettoie tous les sous-menus
   */
  function clearAllSubmenus() {
    document.querySelectorAll('.submenu').forEach(container => {
      const projectList = container.querySelector('.project-list');
      if (projectList) projectList.innerHTML = '';
    });
  }

  return {
    renderProjectsByCategory,
    initializeAllSubmenus,
    updateSubmenu,
    clearAllSubmenus,
    getCategoryLabel
  };
})();

window.SubmenuModule = SubmenuModule;
