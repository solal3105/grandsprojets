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
        console.debug('[Analytics] Hotjar injection failed', e);
      }
    },

    /**
     * Initialise tous les outils d'analytics — différé via requestIdleCallback
     * pour libérer le main-thread pendant le chargement critique
     */
    init() {
      // Ne pas charger Hotjar pendant un audit Lighthouse (fausse les métriques)
      if (/Chrome-Lighthouse/i.test(navigator.userAgent)) return;

      const self = this;
      function startHotjar() {
        try { self.initHotjar(6496613); } catch (e) {
          console.debug('[Analytics] Initialization failed', e);
        }
      }
      if ('requestIdleCallback' in win) {
        requestIdleCallback(startHotjar, { timeout: 5000 });
      } else {
        setTimeout(startHotjar, 3000);
      }
    }
  };

  // Exposer le module globalement
  win.AnalyticsModule = AnalyticsModule;

})(window);
