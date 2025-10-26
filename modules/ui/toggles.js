/**
 * ToggleManager - Gestion centralisée des toggles de l'interface
 * Gère l'état, les événements et l'accessibilité de tous les boutons de contrôle
 */

import { TOGGLES_CONFIG, TOGGLE_ORDER } from './toggles-config.js';

class ToggleManager {
  constructor() {
    this.toggles = new Map();
    this.state = new Map();
    this.listeners = new Map();
    this.initialized = false;
  }

  /**
   * Initialise tous les toggles
   */
  init() {
    if (this.initialized) {
      console.warn('[ToggleManager] Already initialized');
      return;
    }

    console.log('[ToggleManager] Initializing toggles...');

    // Initialiser tous les toggles de TOGGLE_ORDER
    TOGGLE_ORDER.forEach(key => {
      this.initToggle(key);
    });

    // Initialiser contribute séparément (pas dans TOGGLE_ORDER mais géré normalement)
    this.initToggle('contribute');

    this.initialized = true;
    console.log('[ToggleManager] All toggles initialized:', this.toggles.size);

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
    
    // DÉSACTIVER PHYSIQUEMENT le bouton pendant l'initialisation
    element.classList.add('toggle-loading');
    element.setAttribute('aria-busy', 'true');
    element.disabled = true; // Désactiver le bouton HTML
    element.setAttribute('data-loading', 'true'); // Flag pour vérification supplémentaire

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
    
    // Attendre que tous les éléments associés soient chargés avant de retirer le loading
    this.waitForToggleReady(key, element, config);

    console.log(`[ToggleManager] ✓ ${key} initialized`);
  }

  /**
   * Attendre que le toggle soit complètement prêt avant de retirer le loading
   */
  async waitForToggleReady(key, element, config) {
    // Fonction pour activer le toggle
    const activateToggle = () => {
      element.classList.remove('toggle-loading');
      element.removeAttribute('aria-busy');
      element.removeAttribute('data-loading');
      element.disabled = false; // RÉACTIVER le bouton
      console.log(`[ToggleManager] ${key} ready and enabled`);
    };
    
    // Si le toggle n'a pas d'éléments associés (ex: theme), il est prêt immédiatement
    if (!config.overlaySelector && !config.menuSelector && !config.modalSelector && !config.targetElement) {
      activateToggle();
      return;
    }
    
    // Attendre que tous les éléments associés existent dans le DOM
    const checkInterval = setInterval(() => {
      if (this.validateToggleElements(key, config, true)) { // silent=true pendant polling
        clearInterval(checkInterval);
        activateToggle();
      }
    }, 100);
    
    // Timeout de sécurité après 10 secondes
    setTimeout(() => {
      clearInterval(checkInterval);
      if (element.hasAttribute('data-loading')) {
        console.warn(`[ToggleManager] ${key} timeout - forcing ready state`);
        activateToggle();
      }
    }, 10000);
  }

  /**
   * Bind les événements d'un toggle
   */
  bindToggleEvents(key, element, config) {
    // Click event avec protection contre les clics pendant l'initialisation
    element.addEventListener('click', (e) => {
      // TRIPLE VÉRIFICATION pour être absolument sûr
      if (element.disabled || 
          element.hasAttribute('data-loading') || 
          element.classList.contains('toggle-loading')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.warn('[ToggleManager] Toggle still loading, click blocked:', key);
        return false;
      }
      
      e.preventDefault();
      e.stopPropagation();
      this.toggle(key);
    });

    // Keyboard accessibility
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        // TRIPLE VÉRIFICATION pour être absolument sûr
        if (element.disabled || 
            element.hasAttribute('data-loading') || 
            element.classList.contains('toggle-loading')) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          console.warn('[ToggleManager] Toggle still loading, keyboard blocked:', key);
          return false;
        }
        
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
      console.log(`[ToggleManager] ${key} state restored:`, restoredState);
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

    toggle.element.style.display = visible ? 'flex' : 'none';
    console.log(`[ToggleManager] ${key} visibility set to:`, visible);
    
    // Le MutationObserver déclenchera automatiquement recalculatePositions()
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
    const isMobile = window.innerWidth <= 640;
    
    if (isMobile) {
      this.recalculateMobileLayout();
    } else {
      this.recalculateDesktopLayout();
    }
  }

  /**
   * Recalcule le layout mobile (barre horizontale)
   */
  recalculateMobileLayout() {
    const MOBILE_ORDER = ['info', 'location', 'search', 'theme', 'basemap', 'filters', 'contribute', 'login'];
    const visibleToggles = [];

    // Identifier les toggles visibles dans l'ordre mobile
    MOBILE_ORDER.forEach(key => {
      const toggle = this.toggles.get(key);
      if (toggle && this.isToggleVisible(toggle.element)) {
        visibleToggles.push({ key, element: toggle.element });
      }
    });

    const totalVisible = visibleToggles.length;
    if (totalVisible === 0) return;

    // Recalculer les positions (de gauche à droite)
    visibleToggles.forEach((toggle, index) => {
      const positionFromRight = totalVisible - 1 - index;
      const right = `calc(var(--toggle-offset-base) + var(--toggle-size) * ${positionFromRight})`;
      toggle.element.style.right = right;

      // Gérer les border-radius
      toggle.element.removeAttribute('data-edge');
      
      if (totalVisible === 1) {
        toggle.element.setAttribute('data-edge', 'both');
      } else if (index === 0) {
        toggle.element.setAttribute('data-edge', 'first');
      } else if (index === totalVisible - 1) {
        toggle.element.setAttribute('data-edge', 'last');
      }
    });

    console.log(`[ToggleManager] Mobile layout recalculated: ${totalVisible} toggles visible`);
  }

  /**
   * Recalcule le layout desktop (toggles espacés)
   */
  recalculateDesktopLayout() {
    const DESKTOP_ORDER = ['login', 'contribute', 'filters', 'basemap', 'theme', 'search', 'location', 'info'];
    const visibleToggles = [];

    // Identifier les toggles visibles dans l'ordre desktop
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

    console.log(`[ToggleManager] Desktop layout recalculated: ${visibleToggles.length} toggles visible`);
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
   * Observe les changements de visibilité et recalcule
   * Utilise MutationObserver pour détecter les changements de style
   */
  observeVisibilityChanges() {
    // Debounce pour éviter trop d'appels
    let debounceTimer;
    const debouncedRecalculate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.recalculatePositions();
      }, 50);
    };

    // Observer tous les toggles
    this.toggles.forEach((toggle) => {
      const observer = new MutationObserver(() => {
        debouncedRecalculate();
      });

      observer.observe(toggle.element, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // Stocker l'observer pour cleanup
      if (!this.observers) this.observers = [];
      this.observers.push(observer);
    });

    // Observer les resize de window avec debounce
    this.resizeHandler = () => debouncedRecalculate();
    window.addEventListener('resize', this.resizeHandler);
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
    console.log('[ToggleManager] Destroyed');
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
