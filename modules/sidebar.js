// modules/sidebar.js
// Sidebar controller — Level 1 module buttons (Carte / Travaux) + auth-aware bottom actions
// Delegates to NavPanel for Level 2/3 navigation.

;(function(win) {
  'use strict';

  const SidebarModule = {

    _sidebar: null,
    _activeModule: null, // 'carte' | 'travaux' | null

    /* ──────────────────────────────────────────────────────────────────── */
    /*  PUBLIC API                                                         */
    /* ──────────────────────────────────────────────────────────────────── */

    init() {
      this._sidebar = document.getElementById('gp-sidebar');
      if (!this._sidebar) return;

      this._updateAuthState();
      this._bindAuthListener();
      this._bindModules();
      this._bindActions();
      this._updateTravauxVisibility();

      // No default module active — panel starts closed, map visible
    },

    refreshAuth() {
      this._updateAuthState();
    },

    /**
     * Update travaux button visibility based on city config
     */
    _updateTravauxVisibility() {
      const travauxBtn = this._sidebar?.querySelector('[data-module="travaux"]');
      if (!travauxBtn) return;

      const travauxConfig = win._travauxConfig || {};
      if (travauxConfig.enabled === true) {
        travauxBtn.style.display = '';
      } else {
        travauxBtn.style.display = 'none';
      }
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  MODULE SWITCHING (Carte / Travaux)                                 */
    /* ──────────────────────────────────────────────────────────────────── */

    _bindModules() {
      const carteBtn = this._sidebar.querySelector('[data-module="carte"]');
      const travauxBtn = this._sidebar.querySelector('[data-module="travaux"]');

      if (carteBtn) {
        carteBtn.addEventListener('click', () => this._activateModule('carte'));
      }
      if (travauxBtn) {
        travauxBtn.addEventListener('click', () => this._activateModule('travaux'));
      }
    },

    _activateModule(mod) {
      // Same module: toggle collapse/expand
      if (this._activeModule === mod) {
        if (win.NavPanel?.isCollapsed()) {
          win.NavPanel.expand();
        } else if (win.NavPanel?.isOpen()) {
          win.NavPanel.collapse();
        }
        return;
      }

      this._activeModule = mod;

      // Update active state on sidebar buttons
      this._sidebar.querySelectorAll('.gp-sidebar__btn--module').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.module === mod);
      });

      // Delegate to NavPanel for Level 2
      if (win.NavPanel?.openModule) {
        win.NavPanel.openModule(mod);
      }
    },

    /**
     * Called by NavPanel when panel is closed to deactivate sidebar buttons
     */
    _deactivateModules() {
      this._activeModule = null;
      if (this._sidebar) {
        this._sidebar.querySelectorAll('.gp-sidebar__btn--module').forEach(btn => {
          btn.classList.remove('active');
        });
      }
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  AUTH STATE                                                         */
    /* ──────────────────────────────────────────────────────────────────── */

    _updateAuthState() {
      if (!this._sidebar) return;
      this._sidebar.setAttribute('data-connected', String(this._isConnected()));
    },

    _bindAuthListener() {
      if (win.AuthModule?.onAuthStateChange) {
        win.AuthModule.onAuthStateChange(() => this._updateAuthState());
      }
    },

    _isConnected() {
      if (win.AuthModule?.isAuthenticated) return win.AuthModule.isAuthenticated();
      const keys = Object.keys(localStorage);
      const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKey) {
        try {
          const d = JSON.parse(localStorage.getItem(sbKey));
          return !!(d?.access_token || d?.user);
        } catch { return false; }
      }
      return false;
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  BOTTOM ACTION BUTTONS                                              */
    /* ──────────────────────────────────────────────────────────────────── */

    _bindActions() {
      if (!this._sidebar) return;

      // City → toggle city panel
      this._bindAction('city', () => this._toggleCityPanel());

      // Theme → toggle dark mode
      this._bindAction('theme', () => {
        const themeBtn = this._sidebar.querySelector('[data-action="theme"]');
        const icon = themeBtn?.querySelector('i');
        
        if (win.ThemeManager?.toggle) {
          win.ThemeManager.toggle();
          // Update icon based on new state
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
          }
          if (themeBtn) {
            themeBtn.setAttribute('data-tooltip', isDark ? 'Mode clair' : 'Mode sombre');
          }
        } else if (win.toggleManager) {
          win.toggleManager.toggle('theme');
        }
        // Update 3D buildings colors + sky for new theme
        const map = win.MapModule?.map;
        if (map?.updateBuildings3DTheme) map.updateBuildings3DTheme();
        if (map?.updateSkyTheme) map.updateSkyTheme();
      });

      // Info → /home
      this._bindAction('info', () => { win.location.href = '/home'; });

      // Help → /home/aide
      this._bindAction('help', () => { win.location.href = '/home/aide'; });

      // Login → /login
      this._bindAction('login', () => { win.location.href = '/login'; });

      // Contribute → open contrib modal
      this._bindAction('contribute', () => {
        if (win.ContribModule?.open) {
          win.ContribModule.open();
        }
      });

      // Logout
      this._bindAction('logout', async () => {
        if (win.AuthModule?.signOut) {
          await win.AuthModule.signOut();
          win.location.href = '/';
        } else {
          win.location.href = '/logout';
        }
      });
    },

    _bindAction(name, handler) {
      const btn = this._sidebar.querySelector(`[data-action="${name}"]`);
      if (btn) btn.addEventListener('click', handler);
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  CITY PANEL                                                         */
    /* ──────────────────────────────────────────────────────────────────── */

    _cityPanelOpen: false,
    _cityClickOutsideHandler: null,

    _toggleCityPanel() {
      const panel = document.getElementById('city-menu');
      const btn = this._sidebar.querySelector('[data-action="city"]');
      if (!panel) return;

      if (this._cityPanelOpen) {
        this._closeCityPanel();
      } else {
        this._openCityPanel();
      }
    },

    _openCityPanel() {
      const panel = document.getElementById('city-menu');
      const btn = this._sidebar.querySelector('[data-action="city"]');
      if (!panel || this._cityPanelOpen) return;

      // Close any other open panels
      document.querySelectorAll('.dock-panel--open').forEach(p => {
        if (p.id !== 'city-menu') p.classList.remove('dock-panel--open');
      });

      // Position panel aligned with button
      const btnRect = btn.getBoundingClientRect();
      const sidebarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 80;
      
      panel.style.position = 'fixed';
      panel.style.left = `${sidebarW + 8}px`;
      panel.style.top = `${btnRect.top}px`;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
      panel.style.transform = 'none';
      
      // Open
      panel.classList.add('dock-panel--open');
      btn?.classList.add('active');
      this._cityPanelOpen = true;

      // Click outside to close
      this._cityClickOutsideHandler = (e) => {
        if (!panel.contains(e.target) && !btn?.contains(e.target)) {
          this._closeCityPanel();
        }
      };
      setTimeout(() => {
        document.addEventListener('click', this._cityClickOutsideHandler);
      }, 10);

      // Escape to close
      this._cityEscHandler = (e) => {
        if (e.key === 'Escape') this._closeCityPanel();
      };
      document.addEventListener('keydown', this._cityEscHandler);
    },

    _closeCityPanel() {
      const panel = document.getElementById('city-menu');
      const btn = this._sidebar.querySelector('[data-action="city"]');

      panel?.classList.remove('dock-panel--open');
      btn?.classList.remove('active');
      this._cityPanelOpen = false;

      if (this._cityClickOutsideHandler) {
        document.removeEventListener('click', this._cityClickOutsideHandler);
        this._cityClickOutsideHandler = null;
      }
      if (this._cityEscHandler) {
        document.removeEventListener('keydown', this._cityEscHandler);
        this._cityEscHandler = null;
      }
    }
  };

  win.SidebarModule = SidebarModule;

})(window);
