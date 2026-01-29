// ============================================================================
// article-view.js - Vue magazine/news des contributions
// Affichage en tuiles avec filtres par catégorie
// ============================================================================

;(function(win) {
  'use strict';

  const ARTICLE_PARAM = 'article';
  const ARTICLE_VALUE = 'oui';
  
  let miniMaps = [];
  let currentFilter = 'all';
  let allContributions = [];
  let categoryIcons = [];

  /**
   * Vérifie si on est en mode article
   * @returns {boolean}
   */
  function isArticleMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get(ARTICLE_PARAM) === ARTICLE_VALUE;
  }

  /**
   * Initialise la vue article
   */
  async function init() {
    if (!isArticleMode()) return false;

    console.log('[ArticleView] Mode article détecté');
    
    // Masquer l'interface carte normale
    hideMapInterface();
    
    // Créer le conteneur article
    createArticleContainer();
    
    // Charger les données
    await loadData();
    
    // Rendre la vue
    render();
    
    // Setup scroll listener pour la barre sticky
    setupScrollListener();
    
    return true;
  }

  /**
   * Cache l'interface carte normale
   */
  function hideMapInterface() {
    const elementsToHide = [
      '#map',
      '#left-nav',
      '#project-detail',
      '#city-toggle',
      '#city-menu',
      '#info-toggle',
      '#location-toggle',
      '#search-toggle',
      '#contribute-toggle',
      '#theme-toggle',
      '#basemap-toggle',
      '#basemap-menu',
      '#filters-toggle',
      '#filters-container',
      '#login-toggle',
      '#overflow-toggle',
      '#overflow-menu',
      '.mobile-fixed-logo'
    ];
    
    elementsToHide.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) el.style.display = 'none';
    });
    
    // Remettre le body en mode normal (pas de overflow hidden)
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    
    const container = document.getElementById('container');
    if (container) {
      container.style.height = 'auto';
      container.style.overflow = 'visible';
    }
  }

  /**
   * Crée le conteneur principal de la vue article
   */
  function createArticleContainer() {
    const container = document.getElementById('container') || document.body;
    
    const articleView = document.createElement('div');
    articleView.id = 'article-view';
    articleView.className = 'article-view';
    
    container.appendChild(articleView);
  }

  /**
   * Charge les données depuis Supabase
   */
  async function loadData() {
    try {
      // Charger les contributions
      if (win.supabaseService?.fetchAllProjects) {
        allContributions = await win.supabaseService.fetchAllProjects() || [];
      }
      
      // Charger les icônes de catégories
      if (win.supabaseService?.fetchCategoryIcons) {
        categoryIcons = await win.supabaseService.fetchCategoryIcons() || [];
      }
      
      console.log('[ArticleView] Données chargées:', {
        contributions: allContributions.length,
        categories: categoryIcons.length
      });
    } catch (err) {
      console.error('[ArticleView] Erreur chargement données:', err);
    }
  }

  /**
   * Obtient l'icône pour une catégorie
   */
  function getCategoryIcon(category) {
    const found = categoryIcons.find(c => c.category === category);
    if (found?.icon_class) {
      let iconClass = found.icon_class;
      if (!iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) {
        iconClass = 'fa-solid ' + iconClass;
      }
      return iconClass;
    }
    return 'fa-solid fa-folder';
  }

  /**
   * Obtient les catégories uniques avec leurs compteurs
   */
  function getCategories() {
    const cats = {};
    allContributions.forEach(c => {
      if (c.category) {
        cats[c.category] = (cats[c.category] || 0) + 1;
      }
    });
    
    // Trier par ordre d'affichage des categoryIcons
    const sortedCats = Object.keys(cats).sort((a, b) => {
      const orderA = categoryIcons.find(c => c.category === a)?.display_order || 999;
      const orderB = categoryIcons.find(c => c.category === b)?.display_order || 999;
      return orderA - orderB;
    });
    
    return sortedCats.map(cat => ({
      name: cat,
      count: cats[cat],
      icon: getCategoryIcon(cat)
    }));
  }

  /**
   * Filtre les contributions
   */
  function getFilteredContributions() {
    if (currentFilter === 'all') return allContributions;
    return allContributions.filter(c => c.category === currentFilter);
  }

  /**
   * Rend la vue complète
   */
  function render() {
    const container = document.getElementById('article-view');
    if (!container) return;
    
    const categories = getCategories();
    const filteredContribs = getFilteredContributions();
    const cityName = getCityDisplayName();
    
    container.innerHTML = `
      ${renderHero(cityName, allContributions.length, categories.length)}
      ${renderFilters(categories)}
      ${renderGrid(filteredContribs)}
      ${renderBackButton()}
    `;
    
    // Bind events
    bindFilterEvents();
    bindCardEvents();
    
    // Initialiser les mini-cartes après un court délai
    setTimeout(() => initMiniMaps(), 100);
  }

  /**
   * Obtient le nom d'affichage de la ville
   */
  function getCityDisplayName() {
    const city = (typeof win.getActiveCity === 'function') ? win.getActiveCity() : null;
    if (!city) return 'Tous les projets';
    
    // Capitaliser et formater
    return city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /**
   * Rend le hero header
   */
  function renderHero(cityName, totalCount, categoryCount) {
    return `
      <header class="article-hero">
        <div class="article-hero-content">
          <div class="article-hero-badge">
            <i class="fa-solid fa-map-location-dot"></i>
            <span>Grands Projets</span>
          </div>
          <h1 class="article-hero-title">${escapeHtml(cityName)}</h1>
          <p class="article-hero-subtitle">
            Découvrez tous les projets d'urbanisme et de mobilité de votre territoire
          </p>
          <div class="article-hero-stats">
            <div class="article-hero-stat">
              <div class="article-hero-stat-number">${totalCount}</div>
              <div class="article-hero-stat-label">Projets</div>
            </div>
            <div class="article-hero-stat">
              <div class="article-hero-stat-number">${categoryCount}</div>
              <div class="article-hero-stat-label">Catégories</div>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  /**
   * Rend la barre de filtres
   */
  function renderFilters(categories) {
    const filteredCount = getFilteredContributions().length;
    
    const filterButtons = categories.map(cat => `
      <button class="article-filter-btn ${currentFilter === cat.name ? 'active' : ''}" 
              data-category="${escapeHtml(cat.name)}">
        <i class="${cat.icon}"></i>
        <span>${escapeHtml(cat.name)}</span>
        <span class="article-filter-count">(${cat.count})</span>
      </button>
    `).join('');
    
    return `
      <nav class="article-filters-wrapper" role="navigation" aria-label="Filtres par catégorie">
        <div class="article-filters">
          <span class="article-filters-label">Filtrer :</span>
          <button class="article-filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-category="all">
            <i class="fa-solid fa-border-all"></i>
            <span>Tous</span>
          </button>
          ${filterButtons}
          <span class="article-filters-count">
            <strong>${filteredCount}</strong> projet${filteredCount > 1 ? 's' : ''}
          </span>
        </div>
      </nav>
    `;
  }

  /**
   * Rend la grille de cartes
   */
  function renderGrid(contributions) {
    if (!contributions || contributions.length === 0) {
      return `
        <div class="article-grid-wrapper">
          <div class="article-grid">
            <div class="article-empty">
              <div class="article-empty-icon">
                <i class="fa-solid fa-folder-open"></i>
              </div>
              <h3 class="article-empty-title">Aucun projet trouvé</h3>
              <p class="article-empty-text">
                Il n'y a pas encore de projet dans cette catégorie. Revenez bientôt !
              </p>
            </div>
          </div>
        </div>
      `;
    }
    
    const cards = contributions.map((contrib, index) => renderCard(contrib, index)).join('');
    
    return `
      <main class="article-grid-wrapper">
        <div class="article-grid" role="list">
          ${cards}
        </div>
      </main>
    `;
  }

  /**
   * Rend une carte de contribution
   */
  function renderCard(contrib, index) {
    const title = contrib.project_name || 'Projet sans nom';
    const description = contrib.description || contrib.meta || '';
    const category = contrib.category || '';
    const coverUrl = contrib.cover_url || '';
    const tags = Array.isArray(contrib.tags) ? contrib.tags.slice(0, 3) : [];
    const hasGeojson = !!contrib.geojson_url;
    
    const categoryIcon = getCategoryIcon(category);
    
    // Générer un ID unique pour la mini-carte
    const mapId = `article-map-${index}`;
    
    return `
      <article class="article-card" 
               role="listitem"
               data-project="${escapeHtml(title)}"
               data-category="${escapeHtml(category)}"
               data-geojson="${escapeHtml(contrib.geojson_url || '')}">
        <div class="article-card-media">
          ${coverUrl ? `
            <img class="article-card-cover" 
                 src="${escapeHtml(coverUrl)}" 
                 alt="${escapeHtml(title)}"
                 loading="lazy"
                 onerror="this.parentElement.innerHTML='<div class=\\'article-card-cover-placeholder\\'><i class=\\'fa-solid fa-image\\'></i><span>Image non disponible</span></div>'"
            />
          ` : `
            <div class="article-card-cover-placeholder">
              <i class="fa-solid fa-city"></i>
              <span>Pas d'image</span>
            </div>
          `}
          ${hasGeojson ? `
            <div class="article-card-map" id="${mapId}" data-geojson="${escapeHtml(contrib.geojson_url)}"></div>
          ` : ''}
          <div class="article-card-category">
            <i class="${categoryIcon}"></i>
            <span>${escapeHtml(category)}</span>
          </div>
        </div>
        <div class="article-card-content">
          <h2 class="article-card-title">${escapeHtml(title)}</h2>
          ${description ? `<p class="article-card-description">${escapeHtml(description)}</p>` : ''}
          ${tags.length > 0 ? `
            <div class="article-card-tags">
              ${tags.map(tag => `<span class="article-card-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="article-card-footer">
            <div class="article-card-meta">
              ${hasGeojson ? `
                <span class="article-card-meta-item">
                  <i class="fa-solid fa-map"></i>
                  <span>Carte</span>
                </span>
              ` : ''}
              ${coverUrl ? `
                <span class="article-card-meta-item">
                  <i class="fa-solid fa-image"></i>
                  <span>Photo</span>
                </span>
              ` : ''}
            </div>
            <span class="article-card-cta">
              Voir le projet
              <i class="fa-solid fa-arrow-right"></i>
            </span>
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Rend le bouton retour
   */
  function renderBackButton() {
    // Construire l'URL sans le paramètre article
    const url = new URL(window.location.href);
    url.searchParams.delete(ARTICLE_PARAM);
    const backUrl = url.toString();
    
    return `
      <a href="${backUrl}" class="article-back-btn" aria-label="Retour à la carte">
        <i class="fa-solid fa-map-location-dot"></i>
        <span>Voir la carte</span>
      </a>
    `;
  }

  /**
   * Bind les événements des filtres
   */
  function bindFilterEvents() {
    document.querySelectorAll('.article-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.category;
        
        // Re-render la grille et les filtres
        const container = document.getElementById('article-view');
        if (container) {
          // Détruire les mini-cartes existantes
          destroyMiniMaps();
          
          // Mettre à jour l'affichage
          const categories = getCategories();
          const filteredContribs = getFilteredContributions();
          
          // Mettre à jour les boutons actifs
          document.querySelectorAll('.article-filter-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.category === currentFilter);
          });
          
          // Mettre à jour le compteur
          const countEl = document.querySelector('.article-filters-count');
          if (countEl) {
            const count = filteredContribs.length;
            countEl.innerHTML = `<strong>${count}</strong> projet${count > 1 ? 's' : ''}`;
          }
          
          // Mettre à jour la grille
          const gridWrapper = container.querySelector('.article-grid-wrapper');
          if (gridWrapper) {
            gridWrapper.outerHTML = renderGrid(filteredContribs);
            bindCardEvents();
            setTimeout(() => initMiniMaps(), 100);
          }
        }
      });
    });
  }

  /**
   * Bind les événements des cartes
   */
  function bindCardEvents() {
    document.querySelectorAll('.article-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Ne pas naviguer si clic sur la mini-carte
        if (e.target.closest('.article-card-map')) return;
        
        const projectName = card.dataset.project;
        const category = card.dataset.category;
        
        // Construire l'URL de la fiche projet
        const url = `/fiche/?category=${encodeURIComponent(category)}&project=${encodeURIComponent(projectName)}`;
        window.location.href = url;
      });
    });
  }

  /**
   * Initialise les mini-cartes Leaflet
   */
  function initMiniMaps() {
    if (typeof L === 'undefined') {
      console.warn('[ArticleView] Leaflet non disponible');
      return;
    }
    
    document.querySelectorAll('.article-card-map[data-geojson]').forEach(async (mapEl) => {
      const geojsonUrl = mapEl.dataset.geojson;
      if (!geojsonUrl || mapEl.dataset.initialized === 'true') return;
      
      try {
        // Créer la mini-carte
        const map = L.map(mapEl, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          touchZoom: false
        });
        
        // Ajouter un fond de carte simple
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(map);
        
        // Charger le GeoJSON
        const response = await fetch(geojsonUrl);
        if (!response.ok) throw new Error('GeoJSON non trouvé');
        
        const geojson = await response.json();
        
        // Ajouter le GeoJSON avec style
        const layer = L.geoJSON(geojson, {
          style: {
            color: '#14AE5C',
            weight: 3,
            opacity: 0.9,
            fillColor: '#14AE5C',
            fillOpacity: 0.3
          },
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 6,
              fillColor: '#14AE5C',
              color: '#fff',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.8
            });
          }
        }).addTo(map);
        
        // Ajuster la vue
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [10, 10] });
        }
        
        mapEl.dataset.initialized = 'true';
        miniMaps.push(map);
        
      } catch (err) {
        console.warn('[ArticleView] Erreur mini-carte:', err);
        mapEl.style.display = 'none';
      }
    });
  }

  /**
   * Détruit les mini-cartes existantes
   */
  function destroyMiniMaps() {
    miniMaps.forEach(map => {
      try {
        map.remove();
      } catch (e) {}
    });
    miniMaps = [];
  }

  /**
   * Setup du listener de scroll pour l'effet sticky
   */
  function setupScrollListener() {
    const wrapper = document.querySelector('.article-filters-wrapper');
    if (!wrapper) return;
    
    let ticking = false;
    
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          wrapper.classList.toggle('scrolled', window.scrollY > 100);
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /**
   * Échappe le HTML
   */
  function escapeHtml(str) {
    if (!str) return '';
    if (win.SecurityUtils?.escapeHtml) {
      return win.SecurityUtils.escapeHtml(str);
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Met à jour les meta SEO pour la vue article
   */
  function updateSEOMeta() {
    const cityName = getCityDisplayName();
    const count = allContributions.length;
    
    // Mettre à jour le title
    document.title = `${count} projets urbains à ${cityName} | Grands Projets`;
    
    // Mettre à jour la meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content = `Découvrez les ${count} projets d'urbanisme et de mobilité à ${cityName} : tramway, aménagements, travaux et plus encore sur GrandsProjets.com`;
    }
    
    // Mettre à jour Open Graph
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.content = `${count} projets urbains à ${cityName} | Grands Projets`;
    }
    
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      ogDesc.content = `Découvrez les ${count} projets d'urbanisme et de mobilité à ${cityName} sur GrandsProjets.com`;
    }
    
    // Ajouter JSON-LD pour la liste d'articles
    addStructuredData();
  }

  /**
   * Ajoute les données structurées JSON-LD
   */
  function addStructuredData() {
    const cityName = getCityDisplayName();
    
    // Supprimer l'ancien script s'il existe
    const existing = document.getElementById('article-view-jsonld');
    if (existing) existing.remove();
    
    const items = allContributions.slice(0, 20).map((contrib, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'item': {
        '@type': 'Article',
        'name': contrib.project_name || 'Projet',
        'description': contrib.description || contrib.meta || '',
        'url': `${window.location.origin}/fiche/?category=${encodeURIComponent(contrib.category || '')}&project=${encodeURIComponent(contrib.project_name || '')}`,
        'image': contrib.cover_url || ''
      }
    }));
    
    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': `Projets urbains - ${cityName}`,
      'description': `Liste des projets d'urbanisme et de mobilité à ${cityName}`,
      'numberOfItems': allContributions.length,
      'itemListElement': items
    };
    
    const script = document.createElement('script');
    script.id = 'article-view-jsonld';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonld);
    document.head.appendChild(script);
  }

  // Exposer le module
  win.ArticleView = {
    isArticleMode,
    init,
    updateSEOMeta
  };

})(window);
