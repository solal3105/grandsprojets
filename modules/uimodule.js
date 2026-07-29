// modules/UIModule.js
// Module de gestion de l'interface utilisateur : filtres et basemap rendering
(function(window, document) {

  // DOM element references (set during init)
  let basemapMenuEl = null;

  const initElements = () => {
    basemapMenuEl = document.getElementById('basemap-menu');
    return !!basemapMenuEl;
  };

  // Wire the filters close button to close through ToggleManager
  const initFiltersCloseBtn = () => {
    const container = document.getElementById('filters-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('#filters-close-btn');
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          window.toggleManager?.setState('filters', false);
        }
      });
    }
  };

  // Initialisation du module
  const init = (options = {}) => {
    if (!initElements()) {
      console.debug('[UIModule] Impossible d\'initialiser les éléments DOM');
      return false;
    }

    initFiltersCloseBtn();

    if (options.basemaps) {
      initBasemapMenu(options.basemaps);
    }

    // Stop propagation inside panels (so ToggleManager's outside-click doesn't close them)
    document.getElementById('filters-container')?.addEventListener('click', (e) => e.stopPropagation());
    basemapMenuEl?.addEventListener('click', (e) => e.stopPropagation());

    return true;
  };
  
  // Fonction pour mettre à jour les fonds de carte après le chargement initial
  const updateBasemaps = (basemaps) => {
    if (!basemaps || !Array.isArray(basemaps) || basemaps.length === 0) {
      return false;
    }
    window.basemaps = basemaps;
    return true;
  };
  
  /* ── Crédits du fond de carte ──────────────────────────────────────────────
     Les crédits s'affichaient en bas à gauche de la carte, là où l'encart
     d'invitation vient les recouvrir. Ils sont désormais rendus dans le pied du
     panneau « Fond de carte », à côté du choix qu'ils documentent - au même
     endroit quelle que soit la largeur d'écran.

     On ne déplace PAS le nœud de MapLibre dans le panneau : il arrive avec sa
     propre structure et ses propres classes, qu'il faudrait ensuite combattre en
     CSS. On lit son contenu et on rend NOTRE markup, aux tokens du design
     system. MapLibre reste la source de vérité (il connaît les sources
     réellement chargées) ; un MutationObserver nous tient à jour à chaque
     changement de style ou de fond, ce qu'une copie figée ne ferait pas.

     Le contenu est reconstruit nœud par nœud, pas injecté en innerHTML : seuls
     le texte et les liens sont conservés, les URL passant par
     SecurityUtils.sanitizeUrl. Les attributions viennent de `basemaps_v2` et des
     styles distants, donc de données qu'on ne veut pas exécuter aveuglément.

     Le contrôle d'origine n'est masqué qu'une fois notre rendu réussi et non
     vide : si quoi que ce soit échoue, les crédits restent visibles sur la
     carte. L'attribution est une obligation de licence, et ces crédits ont déjà
     disparu une fois lors de la migration MapLibre - la section 0.19 des tests
     est née de cet incident. */
  let observateurCredits = null;

  const sourceCredits = () => document.querySelector('.maplibregl-ctrl-attrib-inner');

  // Reconstruit le contenu dans notre markup. Rend false si rien à afficher.
  const rendreCredits = (source, cible) => {
    const fragment = document.createDocumentFragment();
    source.childNodes.forEach((noeud) => {
      if (noeud.nodeType === Node.TEXT_NODE) {
        fragment.appendChild(document.createTextNode(noeud.textContent));
        return;
      }
      if (noeud.nodeName === 'A') {
        const url = window.SecurityUtils?.sanitizeUrl?.(noeud.getAttribute('href')) || '';
        const lien = document.createElement('a');
        lien.textContent = noeud.textContent;
        if (url) {
          lien.href = url;
          lien.target = '_blank';
          lien.rel = 'noopener noreferrer';
        }
        fragment.appendChild(lien);
        return;
      }
      // Tout le reste (balises inattendues d'un style distant) : texte seul
      fragment.appendChild(document.createTextNode(noeud.textContent || ''));
    });

    if (!fragment.textContent.trim()) return false;
    cible.replaceChildren(fragment);
    return true;
  };

  const brancherCredits = (cible) => {
    observateurCredits?.disconnect();

    const brancher = () => {
      const source = sourceCredits();
      if (!source || !rendreCredits(source, cible)) return false;

      // Notre rendu tient : on peut retirer celui de la carte
      const controle = source.closest('.maplibregl-ctrl-attrib');
      if (controle) controle.style.display = 'none';

      // Changement de fond ou de style : MapLibre réécrit, on suit
      observateurCredits = new MutationObserver(() => rendreCredits(source, cible));
      observateurCredits.observe(source, { childList: true, subtree: true, characterData: true });
      return true;
    };

    if (brancher()) return;
    /* Le contrôle n'existe pas encore : la carte pose ses contrôles au `load`,
       qui peut arriver après ce menu. Quelques essais, puis on renonce - les
       crédits restent alors sur la carte, ce qui est la bonne panne. */
    let essais = 0;
    const timer = setInterval(() => {
      if (brancher() || ++essais > 20) clearInterval(timer);
    }, 150);
  };

  // Initialisation du menu des fonds de carte
  const initBasemapMenu = (basemaps = null) => {
    const menu = basemapMenuEl;
    if (!menu) return false;

    // Le pied de crédits est reconstruit plus bas : l'observateur qui l'alimente
    // est rebranché sur le nouveau nœud par brancherCredits.
    menu.innerHTML = '';

    // Utiliser les basemaps fournis en paramètre ou ceux de window
    const availableBasemaps = basemaps || window.basemaps;
    
    // Vérification de l'existence des basemaps
    if (!availableBasemaps || !Array.isArray(availableBasemaps) || availableBasemaps.length === 0) {
      return false;
    }
    
    // Header
    const header = document.createElement('div');
    header.className = 'dock-panel__header';
    header.innerHTML = `
      <span class="dock-panel__title">Fond de carte</span>
      <button class="dock-panel__close" aria-label="Fermer le menu des fonds de carte"><i class="fas fa-times"></i></button>
    `;
    header.querySelector('.dock-panel__close').addEventListener('click', (e) => {
      e.stopPropagation();
      window.toggleManager?.setState('basemap', false);
    });
    menu.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'dock-panel__body';
    menu.appendChild(body);
    
    // Sélectionner le basemap par défaut:
    // 1. window._cityPreferredBasemap (depuis city_branding.default_basemap)
    // 2. Basemap avec default: true
    // 3. Premier basemap de la liste
    let defaultBm = null;
    const cityPreferred = window._cityPreferredBasemap;
    if (cityPreferred) {
      defaultBm = availableBasemaps.find(b => b.name === cityPreferred);
    }
    if (!defaultBm) {
      defaultBm = availableBasemaps.find(b => b.is_default) || availableBasemaps[0];
    }
    
    let previewLayer = null;
    let currentActiveBasemap = defaultBm;
    
    // Fonction pour obtenir le basemap actuellement actif
    const getActiveBasemap = () => {
      const activeTile = body.querySelector('.dock-panel__item.is-active');
      if (!activeTile) return currentActiveBasemap;
      
      const activeLabel = activeTile.querySelector('.dock-panel__item-label')?.textContent.trim();
      const activeMap = availableBasemaps.find(b => b.label === activeLabel);
      return activeMap || currentActiveBasemap;
    };
    
    availableBasemaps.forEach(bm => {
      const tile = document.createElement('div');
      tile.className = 'dock-panel__item';
      const iconClass = bm.icon || 'fa-layer-group';
      tile.innerHTML = `
        <span class="dock-panel__item-icon"><i class="fas ${iconClass}"></i></span>
        <span class="dock-panel__item-label">${bm.label}</span>
      `;
      if (bm.label === defaultBm.label) tile.classList.add('is-active');

      let hoverTimer = null;
      let isPreviewActive = false;

      // Survol : démarre le timer pour preview
      tile.addEventListener('mouseenter', () => {
        if (tile.classList.contains('is-active')) return;
        
        hoverTimer = setTimeout(() => {
          previewLayer = L.createBasemapLayer(bm);
          window.MapModule?.setBaseLayer(previewLayer);
          isPreviewActive = true;
        }, 1000);
      });

      // Quitter le survol : annule et restaure
      tile.addEventListener('mouseleave', () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        
        if (isPreviewActive) {
          const activeBasemap = getActiveBasemap();
          const activeLayer = L.createBasemapLayer(activeBasemap);
          window.MapModule?.setBaseLayer(activeLayer);
          isPreviewActive = false;
        }
      });

      // Clic : applique définitivement le fond
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        
        const layer = L.createBasemapLayer(bm);
        window.MapModule?.setBaseLayer(layer);
        currentActiveBasemap = bm;
        
        body.querySelectorAll('.dock-panel__item')
          .forEach(t => t.classList.remove('is-active'));
        tile.classList.add('is-active');
        isPreviewActive = false;
        
        setTimeout(() => window.toggleManager?.setState('basemap', false), 300);
      });

      body.appendChild(tile);
    });

    // Pied : les crédits du fond de carte, sous le choix qu'ils documentent
    const footer = document.createElement('div');
    footer.className = 'dock-panel__credits';
    footer.innerHTML = `
      <span class="dock-panel__credits-label">Données</span>
      <p class="dock-panel__credits-text"></p>
    `;
    menu.appendChild(footer);
    brancherCredits(footer.querySelector('.dock-panel__credits-text'));
  };

  /**
   * Affiche le panneau de détail pour une feature
   * @param {string} layerName - Nom de la couche
   * @param {Object} feature - Feature sélectionnée
   * @param {{ updateHistory?: boolean }} [options]
   */
  const showDetailPanel = (layerName, feature, options = {}) => {
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
    if (window.NavigationModule?.showProjectDetail) {
      const props = feature.properties || {};
      
      // Utiliser project_name en priorité (injecté par fetchLayerData depuis contribution_uploads)
      let projectName = props.project_name || props.name || props.Name || props.line || props.LIBELLE;
      let category = props.category; // Catégorie directement depuis contribution_uploads
      
      // Fallback sur la détection par layerName si pas de catégorie
      if (!category) {
        if (layerName.includes('velo')) category = 'velo';
        else if (layerName.includes('mobilite') || layerName.includes('metro') || layerName.includes('tramway')) category = 'mobilite';
        else if (layerName.includes('urbanisme')) category = 'urbanisme';
        else category = 'autre';
      }
      
      if (projectName) {
        // GUARD: Éviter la boucle infinie history.pushState → popstate → showDetailPanel
        const currentParams = new URLSearchParams(location.search);
        const currentProject = currentParams.get('project');
        const projSlug = slugify(projectName);
        
        // Ne mettre à jour l'URL QUE si elle a changé
        const shouldUpdateUrl = updateHistory && currentProject !== projSlug;
        
        if (shouldUpdateUrl) {
          try {
            // CRITICAL: Activer le flag pour bloquer popstate pendant la navigation manuelle
            if (window._setManualNavigation) {
              window._setManualNavigation(true);
            }
            
            const catForUrl = category || (layerName.includes('velo') ? 'velo'
              : (layerName.includes('urbanisme') ? 'urbanisme'
              : ((layerName.includes('mobilite') || layerName.includes('metro') || layerName.includes('tramway')) ? 'mobilite' : 'autre')));
            const params = new URLSearchParams();
            params.set('cat', catForUrl);
            params.set('project', projSlug);
            const cityForUrl = props.ville || new URLSearchParams(location.search).get('city') || window.supabaseService?.getActiveCity?.() || '';
            if (cityForUrl) params.set('city', cityForUrl);
            const newUrl = `${location.pathname}?${params.toString()}`;
            history.pushState({ cat: catForUrl, project: projSlug, city: cityForUrl }, '', newUrl);
            
            // Désactiver le flag après un court délai (pour laisser popstate se déclencher si besoin)
            setTimeout(() => {
              if (window._setManualNavigation) {
                window._setManualNavigation(false);
              }
            }, 100);
          } catch(err) {
            console.error('[UIModule] Error pushing URL:', err);
            // Toujours désactiver le flag en cas d'erreur
            if (window._setManualNavigation) {
              window._setManualNavigation(false);
            }
          }
        }

        window.NavigationModule.showProjectDetail(projectName, category, null, props);
      } else {
        console.debug('[UIModule] No project name found');
      }
    } else {
      console.debug('[UIModule] NavigationModule.showProjectDetail not available');
    }
  };

  // Met à jour le style du bouton de basemap actif
  const setActiveBasemap = (basemapLabel) => {
    const menu = document.getElementById('basemap-menu');
    if (!menu) return;
    menu.querySelectorAll('.dock-panel__item').forEach(tile => {
      const label = tile.querySelector('.dock-panel__item-label')?.textContent.trim();
      tile.classList.toggle('is-active', label === basemapLabel);
    });
  };

  // Exposition de l'API
  const UIModule = {
    setActiveBasemap,
    showDetailPanel,
    init,
    initBasemapMenu,
    updateBasemaps
  };

  // L'initialisation est maintenant gérée par main.js après le chargement du DOM
  // init() sera appelé explicitement quand tous les éléments sont prêts

  // Publication globale
  window.UIModule = UIModule;
})(window, document);