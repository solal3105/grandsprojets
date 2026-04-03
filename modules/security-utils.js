// modules/security-utils.js
// Utilitaires de sécurité pour prévenir les vulnérabilités XSS

;(function(win) {
  'use strict';

  const SecurityUtils = {
    /**
     * Échappe les caractères HTML dangereux pour prévenir les attaques XSS
     * @param {string} unsafe - Texte non sécurisé provenant de l'utilisateur ou d'une source externe
     * @returns {string} - Texte échappé sûr pour insertion dans HTML
     */
    escapeHtml: function(unsafe) {
      if (unsafe === null || unsafe === undefined) return '';
      return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    /**
     * Échappe les caractères pour utilisation dans un attribut HTML
     * @param {string} unsafe - Texte non sécurisé
     * @returns {string} - Texte échappé pour attribut
     */
    escapeAttribute: function(unsafe) {
      if (unsafe === null || unsafe === undefined) return '';
      return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },

    /**
     * Valide et nettoie une URL pour éviter javascript: ou data: schemes malveillants
     * @param {string} url - URL à valider
     * @returns {string} - URL sécurisée ou chaîne vide si dangereuse
     */
    sanitizeUrl: function(url) {
      if (!url) return '';
      const urlStr = String(url).trim().toLowerCase();
      
      // Bloquer les schemes dangereux
      if (urlStr.startsWith('javascript:') || 
          urlStr.startsWith('data:text/html') ||
          urlStr.startsWith('vbscript:')) {
        console.warn('[SecurityUtils] URL dangereuse bloquée:', url);
        return '';
      }
      
      return url;
    }
  };

  /**
   * Normalise une classe d'icône FontAwesome en ajoutant 'fa-solid' si aucun préfixe FA n'est présent
   * @param {string} iconClass - Classe d'icône (ex: 'fa-bus' ou 'fa-solid fa-bus')
   * @param {string} fallback - Classe par défaut si iconClass est vide
   * @returns {string} Classe normalisée (ex: 'fa-solid fa-bus')
   */
  function normalizeIconClass(iconClass, fallback) {
    const cls = iconClass || fallback || 'fa-solid fa-map-marker';
    if (cls.includes('fa-solid') || cls.includes('fa-regular') || cls.includes('fa-brands')) return cls;
    return `fa-solid ${cls}`;
  }

  // Exposer globalement
  win.SecurityUtils = SecurityUtils;
  win.normalizeIconClass = normalizeIconClass;

})(window);
