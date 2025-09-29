// modules/appconfig.js
// Configuration globale de l'application (basemaps par défaut, etc.)

;(function(win) {
  'use strict';

  const AppConfig = {
    /**
     * Configuration des fonds de carte par défaut
     */
    defaultBasemaps: [
      {
        label: 'OSM',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        default: true,
        theme: 'light'
      },
      {
        label: 'Positron',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB',
        theme: 'light'
      },
      {
        label: 'Dark Matter',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB',
        theme: 'dark'
      }
    ],

    /**
     * Initialise la configuration des basemaps si non définie
     */
    initBasemaps() {
      if (!win.basemaps || win.basemaps.length === 0) {
        win.basemaps = this.defaultBasemaps;
      }
    },

    /**
     * Initialise toute la configuration de l'application
     */
    init() {
      this.initBasemaps();
    }
  };

  // Exposer le module globalement
  win.AppConfig = AppConfig;

})(window);
