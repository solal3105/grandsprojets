// modules/analytics.js
// Gestion des outils d'analytics (Hotjar, etc.)

;(function(win) {
  'use strict';

  const AnalyticsModule = {
    /**
     * Initialise Hotjar avec l'ID fourni
     * @param {number} hjid - ID Hotjar
     */
    initHotjar(hjid) {
      try {
        if (!hjid) return;
        
        // Vérifier si Hotjar est déjà initialisé
        if (win._hjSettings && win._hjSettings.hjid === hjid) return;
        if (document.querySelector('script[src*="static.hotjar.com/c/hotjar-"]')) return;
        
        // Injection du script Hotjar
        (function(h, o, t, j, a, r) {
          h.hj = h.hj || function() { (h.hj.q = h.hj.q || []).push(arguments); };
          h._hjSettings = { hjid: hjid, hjsv: 6 };
          a = o.getElementsByTagName('head')[0];
          r = o.createElement('script');
          r.async = 1;
          r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
          a.appendChild(r);
        })(win, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
      } catch (e) {
        console.warn('[Analytics] Hotjar injection failed', e);
      }
    },

    /**
     * Initialise tous les outils d'analytics
     */
    init() {
      try {
        // Hotjar ID pour ce projet
        this.initHotjar(6496613);
      } catch (e) {
        console.warn('[Analytics] Initialization failed', e);
      }
    }
  };

  // Exposer le module globalement
  win.AnalyticsModule = AnalyticsModule;

})(window);
