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
    },

    /**
     * Crée un élément texte sécurisé (alternative à innerHTML)
     * @param {string} tag - Tag HTML (ex: 'div', 'p', 'span')
     * @param {string} text - Contenu texte
     * @param {string} className - Classes CSS optionnelles
     * @returns {HTMLElement} - Élément DOM sécurisé
     */
    createSafeElement: function(tag, text, className = '') {
      const el = document.createElement(tag);
      el.textContent = text; // textContent échappe automatiquement
      if (className) el.className = className;
      return el;
    }
  };

  // Exposer globalement
  win.SecurityUtils = SecurityUtils;

})(window);
