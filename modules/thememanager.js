// modules/thememanager.js
// Gestion du thème clair/sombre avec synchronisation système et basemaps

;(function(win) {
  'use strict';

  const ThemeManager = {
    osThemeMediaQuery: null,
    osThemeHandler: null,

    /**
     * Détermine le thème initial selon les préférences système
     */
    getInitialTheme() {
      const prefersDark = win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    },

    /**
     * Applique le thème et met à jour l'UI
     * Désactive temporairement les transitions pour un changement instantané
     */
    applyTheme(theme) {
      const root = document.documentElement;
      
      // Désactiver toutes les transitions temporairement
      root.classList.add('theme-transitioning');
      
      // Changer le thème (data-theme pour notre CSS + classe dark pour Tailwind)
      root.setAttribute('data-theme', theme);
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }

      // Mettre à jour l'icône du bouton toggle
      const iconEl = document.querySelector('#theme-toggle i');
      if (iconEl) {
        iconEl.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }

      const toggleEl = document.getElementById('theme-toggle');
      if (toggleEl) {
        toggleEl.title = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
        toggleEl.setAttribute('aria-label', toggleEl.title);
        toggleEl.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      }
      
      // Forcer un reflow pour appliquer les changements
      void root.offsetHeight;
      
      // Réactiver les transitions après un court délai
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove('theme-transitioning');
        });
      });
    },

    /**
     * Trouve un fond de carte adapté au thème courant
     */
    findBasemapForTheme(theme) {
      const list = window.basemaps || [];
      if (!Array.isArray(list) || list.length === 0) return null;
      const lc = (s) => String(s || '').toLowerCase();

      // 1) Propriété explicite `theme` si fournie par la base ("dark" | "light")
      let bm = list.find(b => lc(b.theme) === theme);
      if (bm) return bm;

      // 2) Heuristiques sur les labels/noms
      const darkKeys = ['dark', 'noir', 'sombre', 'night', 'nuit'];
      const lightKeys = ['light', 'clair', 'day', 'jour', 'positron', 'osm', 'streets', 'standard'];
      const keys = theme === 'dark' ? darkKeys : lightKeys;
      bm = list.find(b => keys.some(k => lc(b.label).includes(k) || lc(b.name).includes(k)));
      if (bm) return bm;

      return null;
    },

    /**
     * Applique le fond de carte correspondant au thème
     * SAUF si la ville a un basemap configuré (window._cityPreferredBasemap)
     */
    syncBasemapToTheme(theme) {
      try {
        // Si la ville a un basemap configuré, ne pas le changer automatiquement
        // L'admin a choisi ce basemap, il prime sur le thème
        if (window._cityPreferredBasemap) {
          return;
        }
        
        const bm = this.findBasemapForTheme(theme);
        if (!bm) return;

        const layer = L.tileLayer(bm.url, { attribution: bm.attribution });
        if (window.MapModule?.setBaseLayer) {
          window.MapModule.setBaseLayer(layer);
        }
        if (window.UIModule?.setActiveBasemap) {
          window.UIModule.setActiveBasemap(bm.label);
        }
      } catch (e) {
        console.warn('[ThemeManager] Erreur lors du changement de fond de carte', e);
      }
    },

    /**
     * Vérifie si l'utilisateur a une préférence sauvegardée
     */
    hasSavedPreference() {
      try {
        const v = localStorage.getItem('theme');
        return v === 'dark' || v === 'light';
      } catch (_) { 
        return false; 
      }
    },

    /**
     * Démarre la synchronisation avec les préférences système
     */
    startOSThemeSync() {
      try {
        // Ne pas synchroniser si l'utilisateur a une préférence explicite
        if (this.hasSavedPreference()) return;
        if (!win.matchMedia) return;

        if (!this.osThemeMediaQuery) {
          this.osThemeMediaQuery = win.matchMedia('(prefers-color-scheme: dark)');
        }

        const applyFromOS = () => {
          const next = this.osThemeMediaQuery.matches ? 'dark' : 'light';
          this.applyTheme(next);
          
          // Aligner le fond de carte
          try { 
            this.syncBasemapToTheme(next); 
          } catch (_) {}
          
          // Mettre à jour le logo selon le thème
          try { 
            if (win.CityManager?.updateLogoForCity) {
              win.CityManager.updateLogoForCity(win.activeCity); 
            }
          } catch (_) {}
        };

        // Appliquer immédiatement
        applyFromOS();

        // Écouter les changements
        this.osThemeHandler = applyFromOS;
        if (typeof this.osThemeMediaQuery.addEventListener === 'function') {
          this.osThemeMediaQuery.addEventListener('change', this.osThemeHandler);
        } else if (typeof this.osThemeMediaQuery.addListener === 'function') {
          this.osThemeMediaQuery.addListener(this.osThemeHandler);
        }
      } catch (_) {}
    },

    /**
     * Arrête la synchronisation avec les préférences système
     */
    stopOSThemeSync() {
      try {
        if (!this.osThemeMediaQuery) return;
        
        if (this.osThemeHandler) {
          if (typeof this.osThemeMediaQuery.removeEventListener === 'function') {
            this.osThemeMediaQuery.removeEventListener('change', this.osThemeHandler);
          } else if (typeof this.osThemeMediaQuery.removeListener === 'function') {
            this.osThemeMediaQuery.removeListener(this.osThemeHandler);
          }
        }
        
        this.osThemeMediaQuery = null;
        this.osThemeHandler = null;
      } catch (_) {}
    },

    /**
     * Initialise le thème au chargement
     */
    init() {
      try {
        const stored = localStorage.getItem('theme');
        if (stored === 'dark' || stored === 'light') {
          this.applyTheme(stored);
          return;
        }
      } catch (_) {}

      // Sinon, utiliser la préférence système
      const initial = this.getInitialTheme();
      this.applyTheme(initial);
    },

    /**
     * Bascule entre les thèmes
     */
    toggle() {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      
      this.applyTheme(next);
      this.syncBasemapToTheme(next);
      
      // Mettre à jour le logo
      if (win.CityManager?.updateLogoForCity) {
        win.CityManager.updateLogoForCity(win.activeCity);
      }
      
      try { 
        localStorage.setItem('theme', next); 
      } catch(_) {}
      
      try { 
        this.stopOSThemeSync(); 
      } catch(_) {}
    }
  };

  // Exposer le module globalement
  win.ThemeManager = ThemeManager;

})(window);
