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
  const FOCUS_DELAY = 800; // ms before panning map on hover

  function createProjectListItem(project, category) {
    const categoryIcon = window.categoryIcons?.find(c => c.category === category);
    let iconClass = categoryIcon?.icon_class || 'fa-layer-group';
    if (iconClass && !/^fa-(solid|regular|brands)/.test(iconClass)) {
      iconClass = `fa-solid ${iconClass}`;
    }
    
    let categoryColor = null;
    if (categoryIcon?.category_styles) {
      try {
        const styles = typeof categoryIcon.category_styles === 'string' 
          ? JSON.parse(categoryIcon.category_styles) 
          : categoryIcon.category_styles;
        categoryColor = styles.color || styles.fillColor;
      } catch (_) {}
    }
    
    const li = document.createElement('li');
    li.classList.add('project-card');
    li.dataset.project = project.project_name;
    if (categoryColor) li.style.setProperty('--card-accent', categoryColor);
    
    const hasCover = !!(project.cover_url);
    const colorBg = categoryColor || 'var(--primary)';
    
    const heroHTML = hasCover
      ? `<div class="card-hero"><img src="${project.cover_url}" alt="" loading="lazy"/><div class="card-hero-grad"></div></div>`
      : `<div class="card-hero card-hero--icon" style="background:linear-gradient(135deg, ${colorBg}22 0%, ${colorBg}08 100%)"><i class="${iconClass}" style="color:${colorBg}"></i><div class="card-hero-grad"></div></div>`;
    
    const name = project.project_name || 'Projet sans nom';
    
    li.innerHTML = `
      ${heroHTML}
      <div class="card-body">
        <span class="card-title">${name}</span>
        <span class="card-arrow"><i class="fa-solid fa-arrow-right"></i></span>
      </div>
    `;

    // Click → open detail
    li.addEventListener('click', () => {
      window.NavigationModule?.showProjectDetail(project.project_name, category);
    });
    
    // Hover → instant highlight, delayed pan with visual feedback
    let focusTimer = null;
    li.addEventListener('mouseenter', () => {
      window.NavigationModule?.highlightProjectOnMap(project.project_name, category, { panTo: false, fadeOthers: true });
      focusTimer = setTimeout(() => {
        li.classList.add('focusing');
        window.NavigationModule?.highlightProjectOnMap(project.project_name, category, { panTo: true, fadeOthers: true });
      }, FOCUS_DELAY);
    });
    
    li.addEventListener('mouseleave', () => {
      if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
      li.classList.remove('focusing');
      const detailPanel = document.getElementById('project-detail');
      if (!detailPanel || detailPanel.style.display !== 'block') {
        window.NavigationModule?.clearProjectHighlight();
      }
    });

    return li;
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
