/**
 * ToggleManager - Gestion centralisée des toggles de l'interface
 * Gère l'état, les événements et l'accessibilité de tous les boutons de contrôle
 */

import { TOGGLES_CONFIG, TOGGLE_ORDER, DESKTOP_ORDER } from './toggles-config.js';

class ToggleManager {
  constructor() {
    this.toggles = new Map();
    this.state = new Map();
    this.listeners = new Map();
    this.initialized = false;
    this.overflowToggles = []; // Toggles cachés dans le menu overflow
    this.MAX_MOBILE_TOGGLES = 4; // Nombre max de toggles visibles sur mobile
    this._blockRecalculate = false; // Flag pour bloquer les recalculs temporairement
    this._recalculateScheduled = false; // Flag pour éviter les recalculs multiples
  }

  /**
   * Initialise tous les toggles
   */
  init() {
    if (this.initialized) {
      console.warn('[ToggleManager] Already initialized');
      return;
    }

    // Initialiser tous les toggles de TOGGLE_ORDER
    TOGGLE_ORDER.forEach(key => {
      this.initToggle(key);
    });
    
    // Initialiser le toggle overflow (spécial - pas dans TOGGLE_ORDER)
    this.initOverflowToggle();

    this.initialized = true;

    // Observer les changements de visibilité
    this.observeVisibilityChanges();

    // Calcul initial des positions
    this.recalculatePositions();
  }

  /**
   * Initialise un toggle individuel
   */
  initToggle(key) {
    const config = TOGGLES_CONFIG[key];
    if (!config) {
      console.warn(`[ToggleManager] Config not found: ${key}`);
      return;
    }

    const element = document.getElementById(config.id);
    
    if (!element) {
      console.warn(`[ToggleManager] Element not found: ${config.id}`);
      return;
    }

    // Ajouter la classe commune
    element.classList.add('app-toggle');
    
    // NOTE: Ne PAS appeler toggleSimpleVisibility ici !
    // La visibilité de login/contribute sera gérée par CityBrandingModule.applyTogglesConfig()
    // qui a accès au cache de session AuthModule

    // Stocker la référence
    this.toggles.set(key, {
      element,
      config,
      state: config.defaultState
    });

    // Initialiser l'état
    this.state.set(key, config.defaultState);

    // Bind events (sauf si redirectUrl - géré manuellement dans main.js)
    if (!config.redirectUrl) {
      this.bindToggleEvents(key, element, config);
    }

    // Restaurer l'état persistant
    if (config.persistent) {
      this.restoreState(key);
    }

    // Appliquer l'accessibilité
    this.setupAccessibility(element, config);
    
    // NOTE: markReady(key) doit être appelé par chaque module quand il est vraiment prêt
    // Ne pas appeler automatiquement ici pour éviter que les toggles soient cliquables
    // avant que leurs modules respectifs soient initialisés
  }

  /**
   * Bind les événements d'un toggle
   */
  bindToggleEvents(key, element, config) {
    // Click event simple
    element.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggle(key);
    });

    // Keyboard accessibility
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle(key);
      }
    });

    // Gestion des overlays/menus - fermeture au clic extérieur
    if (config.hasOverlay || config.hasMenu) {
      document.addEventListener('click', (e) => {
        const isToggle = e.target === element || element.contains(e.target);
        const overlaySelector = config.overlaySelector || config.menuSelector;
        const overlay = overlaySelector ? document.querySelector(overlaySelector) : null;
        const isOverlay = overlay && (e.target === overlay || overlay.contains(e.target));
        
        if (!isToggle && !isOverlay && this.getState(key)) {
          this.setState(key, false);
        }
      });
    }
  }

  /**
   * Valide que tous les éléments associés au toggle existent
   * Retourne true si aucun élément requis OU si tous les éléments requis existent
   * @param {boolean} silent - Si true, ne log pas les warnings (pour vérifications pendant chargement)
   */
  validateToggleElements(key, config, silent = false) {
    let hasRequiredElements = false;
    let allRequiredElementsExist = true;
    
    // Vérifier overlay
    if (config.overlaySelector) {
      hasRequiredElements = true;
      const overlay = document.querySelector(config.overlaySelector);
      if (!overlay) {
        if (!silent) {
          console.warn(`[ToggleManager] Overlay not found for ${key}:`, config.overlaySelector);
        }
        allRequiredElementsExist = false;
      }
    }
    
    // Vérifier menu
    if (config.menuSelector) {
      hasRequiredElements = true;
      const menu = document.querySelector(config.menuSelector);
      if (!menu) {
        if (!silent) {
          console.warn(`[ToggleManager] Menu not found for ${key}:`, config.menuSelector);
        }
        allRequiredElementsExist = false;
      }
    }
    
    // Vérifier modal
    if (config.modalSelector) {
      hasRequiredElements = true;
      const modal = document.querySelector(config.modalSelector);
      if (!modal) {
        if (!silent) {
          console.warn(`[ToggleManager] Modal not found for ${key}:`, config.modalSelector);
        }
        allRequiredElementsExist = false;
      }
    }
    
    // Vérifier target element
    if (config.targetElement) {
      hasRequiredElements = true;
      const target = document.getElementById(config.targetElement);
      if (!target) {
        if (!silent) {
          console.warn(`[ToggleManager] Target element not found for ${key}:`, config.targetElement);
        }
        allRequiredElementsExist = false;
      }
    }
    
    // Si pas d'éléments requis (ex: theme toggle), toujours valide
    if (!hasRequiredElements) {
      return true;
    }
    
    return allRequiredElementsExist;
  }

  /**
   * Setup accessibilité ARIA
   */
  setupAccessibility(element, config) {
    // Si ce n'est pas un button, ajouter les attributs nécessaires
    if (element.tagName !== 'BUTTON') {
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
    }
    
    element.setAttribute('aria-label', config.ariaLabel || config.label);
    element.setAttribute('aria-pressed', 'false');
    
    // Si c'est un toggle avec menu/overlay
    if (config.hasMenu || config.hasOverlay || config.hasModal) {
      element.setAttribute('aria-haspopup', 'true');
      element.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Toggle un bouton
   */
  toggle(key) {
    const toggle = this.toggles.get(key);
    if (!toggle) {
      console.warn(`[ToggleManager] Toggle not found: ${key}`);
      return;
    }

    const newState = !this.state.get(key);
    this.setState(key, newState);
  }

  /**
   * Définit l'état d'un toggle
   */
  setState(key, state) {
    const toggle = this.toggles.get(key);
    if (!toggle) return;

    const oldState = this.state.get(key);
    if (oldState === state) return;

    this.state.set(key, state);
    
    // Update ARIA
    toggle.element.setAttribute('aria-pressed', state.toString());
    if (toggle.config.hasMenu || toggle.config.hasOverlay || toggle.config.hasModal) {
      toggle.element.setAttribute('aria-expanded', state.toString());
    }

    // Update icon (theme toggle)
    if (toggle.config.iconActive) {
      const icon = toggle.element.querySelector('i');
      if (icon) {
        icon.className = state ? `fas ${toggle.config.iconActive}` : `fas ${toggle.config.icon}`;
      }
    }

    // Overlays/menus/modals
    if (toggle.config.overlaySelector) {
      const overlay = document.querySelector(toggle.config.overlaySelector);
      if (overlay) {
        overlay.classList.toggle('active', state);
        overlay.style.display = state ? 'flex' : 'none';
        overlay.setAttribute('aria-hidden', (!state).toString());
      }
    }

    if (toggle.config.menuSelector) {
      const menu = document.querySelector(toggle.config.menuSelector);
      if (menu) menu.classList.toggle('active', state);
    }

    if (toggle.config.modalSelector) {
      const modalId = toggle.config.modalSelector.replace('#', '');
      
      if (state) {
        // Ouvrir avec ModalHelper pour gestion complète
        if (window.ModalHelper && typeof window.ModalHelper.open === 'function') {
          window.ModalHelper.open(modalId, {
            dismissible: true,
            lockScroll: true,
            focusTrap: true,
            onClose: () => {
              // Synchroniser l'état du toggle quand la modal se ferme
              if (this.getState(key)) {
                this.setState(key, false);
              }
            }
          });
        } else {
          // Fallback si ModalHelper pas disponible
          const modal = document.querySelector(toggle.config.modalSelector);
          if (modal) {
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
          }
        }
      } else {
        // Fermer avec ModalHelper
        if (window.ModalHelper && typeof window.ModalHelper.close === 'function') {
          window.ModalHelper.close(modalId);
        } else {
          // Fallback
          const modal = document.querySelector(toggle.config.modalSelector);
          if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
          }
        }
      }
    }

    if (toggle.config.targetElement) {
      const target = document.getElementById(toggle.config.targetElement);
      if (target) target.style.display = state ? 'block' : 'none';
    }

    // Persist
    if (toggle.config.persistent) {
      localStorage.setItem(toggle.config.storageKey || `toggle-${key}`, state.toString());
    }

    // Emit
    this.emit(key, state);
  }

  /**
   * Récupère l'état d'un toggle
   */
  getState(key) {
    return this.state.get(key) || false;
  }

  /**
   * Restaure l'état depuis localStorage
   */
  restoreState(key) {
    const toggle = this.toggles.get(key);
    if (!toggle) return;

    const storageKey = toggle.config.storageKey || `toggle-${key}`;
    const saved = localStorage.getItem(storageKey);
    
    if (saved !== null) {
      const restoredState = saved === 'true';
      this.setState(key, restoredState);
    }
  }

  /**
   * Écoute les changements d'état
   */
  on(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);
  }

  /**
   * Retire un listener
   */
  off(key, callback) {
    if (!this.listeners.has(key)) return;
    const listeners = this.listeners.get(key);
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Émet un événement
   */
  emit(key, state) {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(state);
        } catch (error) {
          console.error(`[ToggleManager] Error in listener for ${key}:`, error);
        }
      });
    }
  }

  /**
   * Update counter (pour filters)
   */
  updateCounter(key, count) {
    const toggle = this.toggles.get(key);
    if (!toggle || !toggle.config.hasCounter) return;

    const counterSelector = toggle.config.counterSelector;
    const counter = toggle.element.querySelector(counterSelector);
    
    if (counter) {
      counter.textContent = count;
      counter.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  /**
   * Set special state (ex: loading, error pour location)
   */
  setSpecialState(key, specialState) {
    const toggle = this.toggles.get(key);
    if (!toggle) return;

    // Remove all special states
    if (toggle.config.states) {
      toggle.config.states.forEach(state => {
        toggle.element.classList.remove(state);
      });
    }

    // Add new state
    if (specialState && specialState !== 'default') {
      toggle.element.classList.add(specialState);
    }
  }

  /**
   * Marque un toggle comme prêt à être utilisé (visible)
   * Utilisé lors de l'initialisation d'un module dépendant
   * @param {string} key - Clé du toggle
   */
  markReady(key) {
    const toggle = this.toggles.get(key);
    if (!toggle) {
      console.warn(`[ToggleManager] Toggle not found for markReady: ${key}`);
      return;
    }
    
    toggle.element.setAttribute('data-ready', 'true');
  }

  /**
   * Marque un toggle comme non-prêt (masqué)
   * Utilisé pour désactiver temporairement un toggle
   * @param {string} key - Clé du toggle
   */
  markNotReady(key) {
    const toggle = this.toggles.get(key);
    if (!toggle) {
      console.warn(`[ToggleManager] Toggle not found for markNotReady: ${key}`);
      return;
    }
    
    toggle.element.setAttribute('data-ready', 'false');
  }

  /**
   * Affiche ou masque un toggle
   * @param {string} key - Clé du toggle
   * @param {boolean} visible - true pour afficher, false pour masquer
   */
  setVisible(key, visible) {
    const toggle = this.toggles.get(key);
    if (!toggle) {
      console.warn(`[ToggleManager] Toggle not found: ${key}`);
      return;
    }

    // Stocker l'état "activé par branding" pour le mode overflow
    toggle.element.setAttribute('data-branding-enabled', visible ? 'true' : 'false');
    
    // Ne pas changer le display si le toggle est en overflow (géré par recalculateMobileLayout)
    if (toggle.element.getAttribute('data-in-overflow') !== 'true') {
      toggle.element.style.display = visible ? 'flex' : 'none';
    }
    
    // Déclencher un recalcul des positions
    this.triggerRecalculate();
  }

  /**
   * Vérifie si un toggle est actuellement visible
   * @param {string} key - Clé du toggle
   * @returns {boolean}
   */
  isVisible(key) {
    const toggle = this.toggles.get(key);
    if (!toggle) return false;
    
    return this.isToggleVisible(toggle.element);
  }

  /**
   * Recalcule les positions et border-radius des toggles visibles
   * Appelé automatiquement quand un toggle est masqué/affiché
   */
  recalculatePositions() {
    // Bloquer les recalculs si le flag est actif
    if (this._blockRecalculate) return;
    
    const isMobile = window.innerWidth <= 640;
    
    if (isMobile) {
      this.recalculateMobileLayout();
    } else {
      this.recalculateDesktopLayout();
    }
  }

  /**
   * Recalcule le layout mobile (barre horizontale)
   * Si plus de MAX_MOBILE_TOGGLES toggles, affiche les premiers + bouton overflow
   */
  recalculateMobileLayout() {
    const eligibleToggles = [];
    const overflowToggle = this.toggles.get('overflow');

    // Identifier les toggles qui DEVRAIENT être visibles
    // Utilise data-branding-enabled si défini, sinon les règles par défaut
    TOGGLE_ORDER.forEach(key => {
      const toggle = this.toggles.get(key);
      if (!toggle) return;
      
      // Vérifier l'éligibilité : branding d'abord, sinon règles par défaut
      const brandingEnabled = toggle.element.getAttribute('data-branding-enabled');
      let isEligible;
      
      if (brandingEnabled !== null) {
        // Configuration branding active
        isEligible = brandingEnabled === 'true';
      } else {
        // Pas de branding, appliquer les règles par défaut
        isEligible = true;
        if (key === 'contribute') {
          isEligible = this.isUserConnected();
        } else if (key === 'login') {
          isEligible = !this.isUserConnected();
        }
      }
      
      if (isEligible) {
        eligibleToggles.push({ key, element: toggle.element, config: toggle.config });
      }
    });
    
    const visibleToggles = eligibleToggles;

    const totalVisible = visibleToggles.length;
    if (totalVisible === 0) {
      // Masquer le toggle overflow s'il n'y a rien
      if (overflowToggle) {
        overflowToggle.element.style.display = 'none';
      }
      return;
    }

    // Déterminer si on a besoin du mode overflow
    const needsOverflow = totalVisible > this.MAX_MOBILE_TOGGLES;
    
    if (needsOverflow && overflowToggle) {
      // Mode overflow : afficher les premiers toggles + bouton "..."
      const displayedToggles = visibleToggles.slice(0, this.MAX_MOBILE_TOGGLES - 1);
      this.overflowToggles = visibleToggles.slice(this.MAX_MOBILE_TOGGLES - 1);
      
      // Masquer les toggles en overflow
      this.overflowToggles.forEach(t => {
        t.element.style.display = 'none';
        t.element.setAttribute('data-in-overflow', 'true');
      });
      
      // Afficher et positionner le toggle overflow
      overflowToggle.element.style.display = 'flex';
      overflowToggle.element.classList.add('app-toggle');
      
      // Positionner les toggles affichés + overflow
      const totalDisplayed = displayedToggles.length + 1; // +1 pour overflow
      
      displayedToggles.forEach((toggle, index) => {
        toggle.element.style.display = 'flex';
        toggle.element.removeAttribute('data-in-overflow');
        
        const positionFromRight = totalDisplayed - 1 - index;
        toggle.element.style.right = `calc(var(--toggle-offset-base) + var(--toggle-size) * ${positionFromRight})`;
        toggle.element.removeAttribute('data-edge');
        
        if (index === 0) {
          toggle.element.setAttribute('data-edge', 'first');
        }
      });
      
      // Positionner le toggle overflow en dernier (à droite)
      overflowToggle.element.style.right = 'var(--toggle-offset-base)';
      overflowToggle.element.removeAttribute('data-edge');
      overflowToggle.element.setAttribute('data-edge', 'last');
      
      // Mettre à jour le menu overflow
      this.updateOverflowMenu();
      
    } else {
      // Mode normal : tous les toggles sont visibles
      this.overflowToggles = [];
      
      // Masquer le toggle overflow
      if (overflowToggle) {
        overflowToggle.element.style.display = 'none';
        this.closeOverflowMenu();
      }
      
      // Réafficher et positionner tous les toggles
      visibleToggles.forEach((toggle, index) => {
        toggle.element.style.display = 'flex';
        toggle.element.removeAttribute('data-in-overflow');
        
        const positionFromRight = totalVisible - 1 - index;
        toggle.element.style.right = `calc(var(--toggle-offset-base) + var(--toggle-size) * ${positionFromRight})`;
        toggle.element.removeAttribute('data-edge');
        
        if (totalVisible === 1) {
          toggle.element.setAttribute('data-edge', 'both');
        } else if (index === 0) {
          toggle.element.setAttribute('data-edge', 'first');
        } else if (index === totalVisible - 1) {
          toggle.element.setAttribute('data-edge', 'last');
        }
      });
    }
  }

  /**
   * Recalcule le layout desktop (toggles espacés)
   */
  recalculateDesktopLayout() {
    // Masquer le toggle overflow en desktop
    const overflowToggle = this.toggles.get('overflow');
    if (overflowToggle) {
      overflowToggle.element.style.display = 'none';
      this.closeOverflowMenu();
    }
    
    // Réafficher les toggles qui étaient en overflow
    // Respecter data-branding-enabled pour la visibilité
    this.overflowToggles.forEach(({ key, element }) => {
      element.removeAttribute('data-in-overflow');
      // Réappliquer la visibilité selon data-branding-enabled (géré par CityBranding)
      const brandingEnabled = element.getAttribute('data-branding-enabled');
      if (brandingEnabled !== null) {
        element.style.display = brandingEnabled === 'true' ? 'flex' : 'none';
      }
    });
    this.overflowToggles = [];
    
    const visibleToggles = [];

    // Identifier les toggles visibles dans l'ordre desktop (droite → gauche)
    DESKTOP_ORDER.forEach(key => {
      const toggle = this.toggles.get(key);
      if (toggle && this.isToggleVisible(toggle.element)) {
        visibleToggles.push({ key, element: toggle.element });
      }
    });

    // Recalculer les positions (de droite à gauche)
    visibleToggles.forEach((toggle, index) => {
      const right = `calc(var(--toggle-offset-base) + var(--toggle-gap) * ${index})`;
      toggle.element.style.right = right;
      
      // Pas de border-radius en desktop (cercles complets)
      toggle.element.removeAttribute('data-edge');
    });
  }

  /**
   * Vérifie si un toggle est visible
   */
  isToggleVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /**
   * Gère la visibilité SIMPLE des toggles
   * - contribute : visible SEULEMENT si connecté
   * - login : visible SEULEMENT si non connecté  
   * - TOUS les autres : toujours visibles
   */
  toggleSimpleVisibility(key, config) {
    const element = document.getElementById(config.id);
    if (!element) return;

    let isVisible = true;

    // Seules les 2 exceptions simples
    if (key === 'contribute') {
      // Visible seulement si connecté
      isVisible = this.isUserConnected();
    } else if (key === 'login') {
      // Visible seulement si non connecté
      isVisible = !this.isUserConnected();
    }

    // Appliquer la visibilité (aucune complexité mobile/desktop)
    element.style.display = isVisible ? 'flex' : 'none';
  }

  /**
   * Vérifie si l'utilisateur est connecté (synchrone - utilise le cache)
   * Note: Pour une vérification async précise, utiliser AuthModule.getSession()
   */
  isUserConnected() {
    // Méthode 1: Vérifier via AuthModule si disponible (cache interne)
    if (window.AuthModule?.isAuthenticated) {
      return window.AuthModule.isAuthenticated();
    }
    
    // Méthode 2: Vérifier le localStorage Supabase (clé correcte)
    // Supabase stocke la session avec un préfixe sb-<project-ref>-auth-token
    const keys = Object.keys(localStorage);
    const supabaseKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (supabaseKey) {
      try {
        const data = JSON.parse(localStorage.getItem(supabaseKey));
        return !!(data?.access_token || data?.user);
      } catch {
        return false;
      }
    }
    
    return false;
  }

  /**
   * Observe les changements de visibilité et recalcule
   * NOTE: On n'utilise PAS MutationObserver car il crée des boucles infinies
   * Les recalculs sont déclenchés explicitement par setVisible() et resize
   */
  observeVisibilityChanges() {
    // Seulement observer les resize de window
    let resizeTimer;
    this.resizeHandler = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!this._blockRecalculate) {
          this.recalculatePositions();
        }
      }, 100);
    };
    window.addEventListener('resize', this.resizeHandler);
  }
  
  /**
   * Déclenche un recalcul des positions (à appeler après setVisible)
   */
  triggerRecalculate() {
    if (this._blockRecalculate) return;
    
    // Utiliser requestAnimationFrame pour éviter les boucles
    if (this._recalculateScheduled) return;
    this._recalculateScheduled = true;
    
    requestAnimationFrame(() => {
      this._recalculateScheduled = false;
      if (!this._blockRecalculate) {
        this.recalculatePositions();
      }
    });
  }

  /**
   * Initialise le toggle overflow (bouton "...")
   */
  initOverflowToggle() {
    const config = TOGGLES_CONFIG.overflow;
    if (!config) return;
    
    const element = document.getElementById(config.id);
    if (!element) return;
    
    // Ajouter la classe commune
    element.classList.add('app-toggle');
    
    // Stocker la référence
    this.toggles.set('overflow', {
      element,
      config,
      state: false
    });
    
    // Initialiser l'état
    this.state.set('overflow', false);
    
    // Setup accessibilité
    this.setupAccessibility(element, config);
    
    // Bind events pour ouvrir/fermer le menu
    element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleOverflowMenu();
    });
    
    // Fermer le menu au clic extérieur
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('overflow-menu');
      if (menu && !element.contains(e.target) && !menu.contains(e.target)) {
        this.closeOverflowMenu();
      }
    });
    
    // Marquer comme prêt
    element.setAttribute('data-ready', 'true');
  }
  
  /**
   * Toggle le menu overflow
   */
  toggleOverflowMenu() {
    const isOpen = this.state.get('overflow');
    if (isOpen) {
      this.closeOverflowMenu();
    } else {
      this.openOverflowMenu();
    }
  }
  
  /**
   * Ouvre le menu overflow
   */
  openOverflowMenu() {
    const menu = document.getElementById('overflow-menu');
    const toggle = this.toggles.get('overflow');
    if (!menu || !toggle) return;
    
    // Fermer tous les autres menus ouverts (city-menu, basemap-menu, etc.)
    this.closeAllMenus();
    
    // Utiliser display pour contrôler la visibilité
    menu.style.display = 'block';
    menu.setAttribute('aria-hidden', 'false');
    toggle.element.setAttribute('aria-expanded', 'true');
    this.state.set('overflow', true);
  }
  
  /**
   * Ferme tous les menus ouverts (city-menu, basemap-menu, etc.)
   */
  closeAllMenus() {
    // Fermer le city-menu
    const cityMenu = document.getElementById('city-menu');
    if (cityMenu) {
      cityMenu.classList.remove('active');
    }
    
    // Fermer le basemap-menu
    const basemapMenu = document.getElementById('basemap-menu');
    if (basemapMenu) {
      basemapMenu.classList.remove('active');
    }
    
    // Réinitialiser l'état des toggles avec menu
    this.toggles.forEach((toggle, key) => {
      if (toggle.config.hasMenu && key !== 'overflow') {
        this.state.set(key, false);
        toggle.element.setAttribute('aria-expanded', 'false');
      }
    });
  }
  
  /**
   * Ferme le menu overflow
   */
  closeOverflowMenu() {
    const menu = document.getElementById('overflow-menu');
    const toggle = this.toggles.get('overflow');
    if (!menu) return;
    
    // Utiliser display pour contrôler la visibilité
    menu.style.display = 'none';
    menu.setAttribute('aria-hidden', 'true');
    if (toggle) {
      toggle.element.setAttribute('aria-expanded', 'false');
    }
    this.state.set('overflow', false);
  }
  
  /**
   * Met à jour le contenu du menu overflow avec les toggles cachés
   */
  updateOverflowMenu() {
    const menu = document.getElementById('overflow-menu');
    if (!menu) return;
    
    const content = menu.querySelector('.overflow-menu-content');
    if (!content) return;
    
    // Vider le menu
    content.innerHTML = '';
    
    // Ajouter chaque toggle en overflow
    this.overflowToggles.forEach(({ key, config }) => {
      const item = document.createElement('button');
      item.className = 'overflow-menu-item';
      item.setAttribute('data-toggle-key', key);
      item.setAttribute('aria-label', config.ariaLabel || config.label);
      
      // Icône
      const icon = document.createElement('i');
      icon.className = `fas ${config.icon}`;
      
      // Label
      const label = document.createElement('span');
      label.className = 'overflow-menu-label';
      label.textContent = config.label;
      
      item.appendChild(icon);
      item.appendChild(label);
      
      // Event : déclencher l'action du toggle original
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleOverflowItemClick(key, config);
      });
      
      content.appendChild(item);
    });
  }
  
  /**
   * Gère le clic sur un item du menu overflow
   */
  handleOverflowItemClick(key, config) {
    // Bloquer les recalculs pendant toute l'opération
    this._blockRecalculate = true;
    
    // Fermer le menu overflow
    this.closeOverflowMenu();
    
    // Exécuter l'action
    if (config.redirectUrl) {
      window.location.href = config.redirectUrl;
      return; // Pas besoin de débloquer, on quitte la page
    }
    
    if (config.hasModal) {
      const modalId = config.modalSelector?.replace('#', '');
      if (modalId) {
        window.ModalHelper?.open?.(modalId) || window.ModalManager?.open?.(modalId);
      }
    } else if (config.hasMenu) {
      const targetMenu = document.querySelector(config.menuSelector);
      if (targetMenu) {
        targetMenu.classList.add('active');
      }
    } else {
      // Pour tous les autres cas (overlay, toggle simple), déclencher le clic
      // sur l'élément original après l'avoir temporairement affiché
      const toggle = this.toggles.get(key);
      if (toggle?.element) {
        // L'élément est masqué (data-in-overflow), on doit le rendre cliquable
        const wasHidden = toggle.element.style.display === 'none';
        if (wasHidden) {
          toggle.element.style.display = 'flex';
          toggle.element.style.opacity = '0';
          toggle.element.style.pointerEvents = 'none';
        }
        
        // Déclencher le clic
        toggle.element.click();
        
        // Re-masquer après un court délai
        if (wasHidden) {
          setTimeout(() => {
            toggle.element.style.display = 'none';
            toggle.element.style.opacity = '';
            toggle.element.style.pointerEvents = '';
          }, 50);
        }
      }
    }
    
    // Débloquer les recalculs après 200ms
    setTimeout(() => {
      this._blockRecalculate = false;
    }, 200);
  }

  /**
   * Destroy - cleanup
   */
  destroy() {
    // Cleanup observers
    if (this.observers) {
      this.observers.forEach(obs => obs.disconnect());
      this.observers = [];
    }

    // Cleanup resize handler
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    this.toggles.clear();
    this.state.clear();
    this.listeners.clear();
    this.initialized = false;
  }
}

// Export singleton
export const toggleManager = new ToggleManager();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    toggleManager.init();
  });
} else {
  toggleManager.init();
}

// Export pour usage global
window.toggleManager = toggleManager;
window.TOGGLES_CONFIG = TOGGLES_CONFIG;
