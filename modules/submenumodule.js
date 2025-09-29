// modules/SubmenuModule.js
// Système unifié pour la construction des sous-menus basé uniquement sur contribution_uploads
const SubmenuModule = (() => {

  // Icônes: désormais pilotées par la DB via window.categoryConfig[cat].icon (voir main.js)

  // Fonction pour récupérer le label d'une catégorie depuis la source unique
  function getCategoryLabel(category) {
    return (window.categoryConfig && window.categoryConfig[category]
      ? window.categoryConfig[category].label
      : category);
  }

  // Sous-menus: même structure et mêmes classes; on ne génère pas de variantes de classes

  /**
   * Fonction générique pour rendre les projets d'une catégorie (avec setup du sous-menu)
   * @param {string} category - Catégorie des projets (velo, mobilite, urbanisme)
   */
  async function renderProjectsByCategory(category) {
    console.log(`[SubmenuModule] Rendu des projets pour la catégorie: ${category}`);
    
    // Configuration minimale dérivée de la catégorie (IDs uniquement)
    const cat = String(category || '').trim();
    if (!cat) {
      console.warn('[SubmenuModule] Catégorie vide ou invalide');
      return;
    }
    const config = {
      // On conserve uniquement l'ID du conteneur externe (déjà présent dans le DOM)
      submenuId: `${cat}-submenu`,
    };
    if (!config) {
      console.warn(`[SubmenuModule] Configuration non trouvée pour la catégorie: ${category}`);
      return;
    }

    // Setup du sous-menu (la fonction setupSubmenu n'est pas exposée, utiliser le fallback)
    const projectList = setupSubmenuFallback(config);
    
    if (!projectList) {
      console.warn(`[SubmenuModule] Impossible de configurer le sous-menu pour ${category}`);
      return;
    }

    try {
      // Récupérer les projets depuis contribution_uploads
      const projects = await window.supabaseService?.fetchProjectsByCategory(category);
      
      if (!projects || !Array.isArray(projects)) {
        console.warn(`[SubmenuModule] Aucun projet trouvé pour la catégorie: ${category}`);
        projectList.innerHTML = `<li class="no-projects">Aucun projet ${getCategoryLabel(category)} disponible.</li>`;
        return;
      }

      // Nettoyer la liste existante
      projectList.innerHTML = '';

      if (projects.length === 0) {
        projectList.innerHTML = `<li class="no-projects">Aucun projet ${getCategoryLabel(category)} disponible.</li>`;
        return;
      }

      // Trier les projets par nom (même logique que l'ancien système)
      const sortedProjects = projects.sort((a, b) => {
        const nameA = (a.project_name || '').toString();
        const nameB = (b.project_name || '').toString();
        return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
      });

      console.log(`[SubmenuModule] Rendu de ${sortedProjects.length} projets pour ${category}`);

      // Créer les éléments de liste pour chaque projet
      sortedProjects.forEach(project => {
        const listItem = createProjectListItem(project, category);
        projectList.appendChild(listItem);
      });

    } catch (error) {
      console.error(`[SubmenuModule] Erreur lors du rendu des projets pour ${category}:`, error);
      
      // Afficher un message d'erreur dans l'interface
      if (projectList) {
        projectList.innerHTML = `<li class="error-message">Erreur lors du chargement des projets ${getCategoryLabel(category)}.</li>`;
      }
    }
  }

  /**
   * Setup complet du sous-menu avec gestion des boutons
   */
  function setupSubmenuFallback(config) {
    const container = document.getElementById(config.submenuId);
    if (!container) return null;
    
    // Utiliser le même HTML que l'ancien système
    container.innerHTML = `
      <div class="detail-header-submenu">
        <div class="header-left">
          <button class="close-btn" aria-label="Fermer">
            <i class="fa-solid fa-xmark gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Fermer</span>
          </button>
        </div>
        <div class="header-right">
          <button class="gp-btn gp-btn--secondary submenu-toggle-btn" aria-label="Réduire" aria-expanded="true" aria-controls="${config.submenuId}">
            <i class="fa-solid fa-compress gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Réduire</span>
          </button>
        </div>
      </div>
      <div class="project-list"></div>
    `;
    
    // S'assurer que le sous-menu démarre en mode étendu
    resetSubmenuExpanded(config.submenuId);
    
    // Setup du bouton fermer
    const closeBtn = container.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const activeTab = document.querySelector('.nav-category.active');
        if (activeTab) activeTab.classList.remove('active');
        const submenu = document.getElementById(config.submenuId);
        if (submenu) submenu.style.display = 'none';
        if (window.NavigationModule?.resetToDefaultView) {
          window.NavigationModule.resetToDefaultView(undefined, { preserveMapView: true });
        }
      });
    }
    
    // Setup du bouton réduire/étendre
    const toggleBtn = container.querySelector('.submenu-toggle-btn');
    const panel = document.getElementById(config.submenuId);
    
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = toggleBtn.getAttribute('aria-expanded') === 'false';
        const iconEl = toggleBtn.querySelector('i');
        const labelEl = toggleBtn.querySelector('.gp-btn__label');
        
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
          // Reduce/collapse
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
    
    return container.querySelector('.project-list');
  }

  // Fonction helper pour réinitialiser l'état étendu du sous-menu
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
   * Crée un élément de liste pour un projet (style uniforme avec l'ancien système)
   * @param {Object} project - Données du projet depuis contribution_uploads
   * @param {string} category - Catégorie du projet
   * @returns {HTMLElement} - Élément li créé
   */
  function createProjectListItem(project, category) {
    // Utiliser la même logique de style que l'ancien système
    let iconClass = "";
    let pcClass = 'pc-default';
    
    // Déterminer l'icône et la classe de couleur selon la catégorie
    {
      const cfgIcon = (window.categoryConfig && window.categoryConfig[category] && window.categoryConfig[category].icon) || '';
      iconClass = cfgIcon;
      if (category === 'velo') pcClass = 'pc-velo';
      else if (category === 'urbanisme') pcClass = 'pc-urbanisme';
      else if (category === 'mobilite') pcClass = 'pc-tram';
      else pcClass = 'pc-default';
    }
    
    const li = document.createElement('li');
    li.classList.add('project-item');
    li.dataset.project = project.project_name;
    
    // Utiliser le même HTML que l'ancien système
    li.innerHTML = `
      <div class="project-color ${pcClass}">
        <i class="${iconClass}"></i>
      </div>
      <div class="project-info">
        <div class="project-name">${project.project_name || 'Projet sans nom'}</div>
        ${project.year ? `<div class="project-year">${project.year}</div>` : ''}
      </div>
      <div class="project-thumb" role="presentation"></div>
      <div class="project-arrow"><i class="fas fa-chevron-right"></i></div>
      <div class="hover-progress" aria-hidden="true"><div class="hover-progress__bar"></div></div>
    `;

    // Gestionnaire de clic
    const clickHandler = () => {
      if (window.NavigationModule?.showProjectDetail) {
        window.NavigationModule.showProjectDetail(project.project_name, category);
      } else {
        console.warn('[SubmenuModule] NavigationModule.showProjectDetail non disponible');
      }
    };
    
    li.addEventListener('click', clickHandler);
    
    // Fonctionnalités de survol (même logique que l'ancien système)
    li.addEventListener('mouseenter', () => { 
      scheduleProgress(li);
      scheduleShowCover(li, project.project_name, category);
    });
    li.addEventListener('mouseleave', () => { 
      cancelProgress(li);
      cancelShowCover(li);
    });

    return li;
  }

  // Fonctions de gestion du survol (copiées de l'ancien système)
  function scheduleShowCover(li, projectName, category) {
    cancelShowCover(li);
    li._coverHoverTimer = setTimeout(() => {
      if (category) {
        attachCoverThumbnail(li, projectName, category);
      }
      li.classList.add('show-thumb');
      // Next frame, ensure we measure and set the height var
      requestAnimationFrame(() => updateThumbHeight(li));
    }, 1000);
  }

  function cancelShowCover(li) {
    if (li._coverHoverTimer) {
      clearTimeout(li._coverHoverTimer);
      li._coverHoverTimer = null;
    }
    li.classList.remove('show-thumb');
  }

  function scheduleProgress(li) {
    cancelProgress(li);
    li._progressTimer = setTimeout(() => {
      li.classList.add('progress-visible');
      const bar = li.querySelector('.hover-progress__bar');
      if (!bar) return;
      // Reset transition and width to ensure replay
      bar.style.transition = 'none';
      bar.style.width = '0%';
      // Force reflow then animate to 100% over 700ms (1s total - 300ms delay)
      // eslint-disable-next-line no-unused-expressions
      bar.offsetHeight;
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

  // Cache et gestion des covers (même logique que l'ancien système)
  const coverCache = new Map();
  
  async function fetchCoverForProject(name, category) {
    const key = `${category}|${name}`;
    if (coverCache.has(key)) return coverCache.get(key);
    
    try {
      if (window.supabaseService?.fetchProjectByCategoryAndName) {
        const p = await window.supabaseService.fetchProjectByCategoryAndName(category, name);
        if (p?.cover_url) {
          coverCache.set(key, p.cover_url);
          return p.cover_url;
        }
      }
    } catch (error) {
      console.warn('Erreur lors de la récupération de la cover:', error);
    }
    coverCache.set(key, null);
    return null;
  }

  function attachCoverThumbnail(li, projectName, category) {
    const thumb = li.querySelector('.project-thumb');
    if (!thumb) return;
    // If an img already exists with a src, skip
    const existingImg = thumb.querySelector('img.project-thumb__img');
    if (existingImg && existingImg.getAttribute('src')) return;
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
      img.onload = () => {
        updateThumbHeight(li);
      };
      img.src = url;

      // Setup resize observer once to keep height in sync on responsive changes
      if (!li._thumbRO && typeof ResizeObserver !== 'undefined') {
        li._thumbRO = new ResizeObserver(() => updateThumbHeight(li));
        li._thumbRO.observe(thumb);
      }
    });
  }

  function updateThumbHeight(li) {
    const thumb = li.querySelector('.project-thumb');
    if (!thumb) return;
    const img = thumb.querySelector('img.project-thumb__img');
    const h = img ? img.getBoundingClientRect().height : thumb.getBoundingClientRect().height;
    const cap = 300;
    const clamped = Math.min(h, cap);
    if (clamped > 0) {
      li.style.setProperty('--thumb-height', `${clamped}px`);
    }
  }

  /**
   * Initialise tous les sous-menus basés sur les catégories disponibles
   */
  async function initializeAllSubmenus() {
    console.log('[SubmenuModule] Initialisation de tous les sous-menus');
    const categories = Object.keys(window.categoryConfig || {});
    
    for (const category of categories) {
      try {
        await renderProjectsByCategory(category);
      } catch (error) {
        console.error(`[SubmenuModule] Erreur lors de l'initialisation de ${category}:`, error);
      }
    }
  }

  /**
   * Met à jour un sous-menu spécifique
   * @param {string} category - Catégorie à mettre à jour
   */
  async function updateSubmenu(category) {
    await renderProjectsByCategory(category);
  }

  /**
   * Nettoie tous les sous-menus
   */
  function clearAllSubmenus() {
    console.log('[SubmenuModule] Nettoyage de tous les sous-menus');
    
    (Object.keys(window.categoryConfig || {})).forEach(category => {
      const container = document.getElementById(`${category}-submenu`);
      const projectList = container && container.querySelector('.project-list');
      if (projectList) projectList.innerHTML = '';
    });
  }

  // API publique du module
  return {
    renderProjectsByCategory,
    initializeAllSubmenus,
    updateSubmenu,
    clearAllSubmenus,
    getCategoryLabel
  };
})();

// Exposer le module globalement
window.SubmenuModule = SubmenuModule;
