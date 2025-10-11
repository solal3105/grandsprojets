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

    TOGGLE_ORDER.forEach(key => {
      const config = TOGGLES_CONFIG[key];
      const element = document.getElementById(config.id);
      
      if (!element) {
        console.warn(`[ToggleManager] Element not found: ${config.id}`);
        return;
      }

      // Ajouter la classe commune
      element.classList.add('app-toggle');

      // Stocker la référence
      this.toggles.set(key, {
        element,
        config,
        state: config.defaultState
      });

      // Initialiser l'état
      this.state.set(key, config.defaultState);

      // Bind events
      this.bindToggleEvents(key, element, config);

      // Restaurer l'état persistant
      if (config.persistent) {
        this.restoreState(key);
      }

      // Appliquer l'accessibilité
      this.setupAccessibility(element, config);

      console.log(`[ToggleManager] ✓ ${key} initialized`);
    });

    this.initialized = true;
    console.log('[ToggleManager] All toggles initialized:', this.toggles.size);
  }

  /**
   * Bind les événements d'un toggle
   */
  bindToggleEvents(key, element, config) {
    // Click event
    element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
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
    if (!toggle) {
      console.warn(`[ToggleManager] Toggle not found: ${key}`);
      return;
    }

    const oldState = this.state.get(key);
    if (oldState === state) return; // Pas de changement

    this.state.set(key, state);
    
    // Update UI
    toggle.element.classList.toggle('active', state);
    toggle.element.setAttribute('aria-pressed', state.toString());
    
    if (toggle.config.hasMenu || toggle.config.hasOverlay || toggle.config.hasModal) {
      toggle.element.setAttribute('aria-expanded', state.toString());
    }

    // Update icon si nécessaire (ex: theme toggle)
    if (toggle.config.iconActive) {
      const icon = toggle.element.querySelector('i');
      if (icon) {
        icon.className = state 
          ? `fas ${toggle.config.iconActive}`
          : `fas ${toggle.config.icon}`;
      }
    }

    // Gestion des overlays/menus
    if (toggle.config.hasOverlay && toggle.config.overlaySelector) {
      const overlay = document.querySelector(toggle.config.overlaySelector);
      if (overlay) {
        overlay.classList.toggle('active', state);
        if (state) {
          overlay.style.display = 'flex';
        } else {
          overlay.style.display = 'none';
        }
      }
    }

    if (toggle.config.hasMenu && toggle.config.menuSelector) {
      const menu = document.querySelector(toggle.config.menuSelector);
      if (menu) {
        menu.classList.toggle('active', state);
      }
    }

    if (toggle.config.hasModal && toggle.config.modalSelector) {
      const modal = document.querySelector(toggle.config.modalSelector);
      if (modal) {
        modal.style.display = state ? 'flex' : 'none';
        modal.setAttribute('aria-hidden', (!state).toString());
      }
    }

    // Gestion du target element (ex: filters-container)
    if (toggle.config.targetElement) {
      const target = document.getElementById(toggle.config.targetElement);
      if (target) {
        target.style.display = state ? 'block' : 'none';
      }
    }

    // Persist state
    if (toggle.config.persistent) {
      const storageKey = toggle.config.storageKey || `toggle-${key}`;
      localStorage.setItem(storageKey, state.toString());
    }

    // Emit event
    this.emit(key, state);

    console.log(`[ToggleManager] ${key} state changed:`, state);
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
   * Destroy - cleanup
   */
  destroy() {
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
