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

      // Mettre à jour l'icône du bouton theme dans la sidebar
      const sidebarThemeBtn = document.querySelector('.gp-sidebar [data-action="theme"]');
      if (sidebarThemeBtn) {
        const icon = sidebarThemeBtn.querySelector('i');
        if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        sidebarThemeBtn.setAttribute('data-tooltip', theme === 'dark' ? 'Mode clair' : 'Mode sombre');
      }
      
      // Invalider le cache de couleurs CSS résolues (MapLibre compat)
      if (window.L?.clearColorCache) window.L.clearColorCache();

      // Repeindre toutes les couches MapLibre (données, bâtiments 3D, ciel)
      if (window.MapModule?.map?.onThemeChanged) {
        window.MapModule.map.onThemeChanged();
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

        // Change le fond de carte via le compat shim (raster ou vectoriel selon bm.kind)
        const layer = L.createBasemapLayer(bm);
        window.MapModule?.setBaseLayer?.(layer);
        window.UIModule?.setActiveBasemap?.(bm.label);
      } catch (e) {
        console.debug('[ThemeManager] Erreur lors du changement de fond de carte', e);
      }
    },

    /**
     * Vérifie si l'utilisateur a une préférence sauvegardée
     */
    hasSavedPreference() {
      try {
        const v = localStorage.getItem('theme');
        return v === 'dark' || v === 'light';
      } catch (e) { 
        console.debug('[theme] localStorage read failed:', e);
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
          
          try { 
            this.syncBasemapToTheme(next); 
          } catch (e) { console.debug('[theme] basemap sync failed:', e); }
          
          try { 
            if (win.CityManager?.updateLogoForCity) {
              win.CityManager.updateLogoForCity(win.CityManager.getActiveCity()); 
            }
          } catch (e) { console.debug('[theme] logo update failed:', e); }
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
      } catch (e) { console.debug('[theme] OS theme sync setup failed:', e); }
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
      } catch (e) { console.debug('[theme] OS theme sync cleanup failed:', e); }
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
      } catch (e) { console.debug('[theme] localStorage read failed:', e); }

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
        win.CityManager.updateLogoForCity(win.CityManager.getActiveCity());
      }
      
      try { 
        localStorage.setItem('theme', next); 
      } catch (e) { console.debug('[theme] localStorage write failed:', e); }
      
      try { 
        this.stopOSThemeSync(); 
      } catch (e) { console.debug('[theme] OS sync stop failed:', e); }
    }
  };

  // Exposer le module globalement
  win.ThemeManager = ThemeManager;

})(window);
