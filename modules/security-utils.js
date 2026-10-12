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
     * Couleur CSS sûre à placer dans un attribut style : hexadécimal, variable
     * CSS, rgb()/hsl() numériques ou nom de couleur. Toute autre valeur (qui
     * pourrait fermer l'attribut ou appeler une adresse) est remplacée.
     * @param {string} value - Couleur venue de la base
     * @param {string} [fallback] - Valeur rendue si la couleur est refusée
     * @returns {string}
     */
    safeColor: function(value, fallback = '') {
      const v = String(value ?? '').trim();
      if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
      if (/^var\(--[a-z0-9-]+\)$/i.test(v)) return v;
      if (/^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(v)) return v;
      if (/^[a-z]{3,20}$/i.test(v)) return v;
      return fallback;
    },

    /**
     * Valide et nettoie une URL pour éviter javascript: ou data: schemes malveillants
     * @param {string} url - URL à valider
     * @returns {string} - URL sécurisée ou chaîne vide si dangereuse
     */
    sanitizeUrl: function(url) {
      if (!url) return '';
      const urlStr = String(url).trim();
      
      // Approche allowlist : seuls les schémas sûrs sont autorisés
      // Les URL relatives (/, #, ?) sont acceptées
      if (urlStr.startsWith('/') || urlStr.startsWith('#') || urlStr.startsWith('?')) {
        return urlStr;
      }
      
      try {
        const parsed = new URL(urlStr);
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
          return urlStr;
        }
      } catch {
        // URL relative sans / initial (ex: "page.html") - accepter si pas de scheme dangereux
        if (!/^[a-z][a-z0-9+.-]*:/i.test(urlStr)) return urlStr;
      }
      
      console.warn('[SecurityUtils] URL dangereuse bloquée:', url);
      return '';
    },

    /**
     * Valide un code ville (colonne `ville` : city_branding, layers, contribution_uploads…).
     * SOURCE DE VÉRITÉ unique - ne pas réécrire cette expression ailleurs.
     * Les chiffres sont autorisés : `test-e2e` existe en base, et rien n'interdit
     * `paris-14` ou `essai-lyon7`. Une variante qui les refuserait ferait diverger
     * la persistance (localStorage) de la résolution (CityManager).
     * Le pendant serveur est dans netlify/functions/_shared/ (même expression).
     * @param {string} code
     * @returns {boolean}
     */
    isValidCityCode: function(code) {
      return /^[a-z0-9-]+$/i.test(String(code ?? '').trim());
    },

    /**
     * Slugifie un texte. RÉPLIQUE EXACTE de la fonction Postgres `public.slugify()`,
     * qui est la source de vérité : c'est le trigger `trg_contribution_slugs` qui
     * remplit `contribution_uploads.slug` et `.category_slug`, colonnes lues par
     * l'edge function SEO pour construire les URLs /fiche/{ville}/{cat}/{slug}.
     *
     *   substring(
     *     regexp_replace(
     *       regexp_replace(lower(unaccent(input)), '[^a-z0-9]+', '-', 'g'),
     *       '^-|-$', '', 'g'),
     *     1, 60)
     *
     * Toute divergence ici produit des chemins Storage qui ne correspondent plus
     * aux slugs publics. Ne pas réécrire cette fonction ailleurs.
     *
     * `normalize('NFD')` ne décompose que les caractères précomposés, pas les
     * ligatures : `unaccent('Cœur')` donne « Coeur » là où NFD seul laisse « C_ur ».
     * Deux projets en base sont concernés (« Sacré-Cœur », « Cœur de Ville »), d'où
     * la table de correspondance ci-dessous, relevée sur `unaccent()` lui-même.
     * @param {string} input
     * @returns {string}
     */
    slugify: function(input) {
      return String(input ?? '')
        .replace(/[œŒ]/g, 'oe')
        .replace(/[æÆ]/g, 'ae')
        .replace(/ß/g, 'ss')
        .replace(/[øØ]/g, 'o')
        .replace(/[łŁ]/g, 'l')
        .replace(/[đĐðÐ]/g, 'd')
        .replace(/[þÞ]/g, 'th')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
    }
  };

  /**
   * Normalise une classe d'icône FontAwesome en ajoutant 'fa-solid' si aucun préfixe FA n'est présent
   * @param {string} iconClass - Classe d'icône (ex: 'fa-bus' ou 'fa-solid fa-bus')
   * @param {string} fallback - Classe par défaut si iconClass est vide
   * @returns {string} Classe normalisée (ex: 'fa-solid fa-bus')
   */
  function normalizeIconClass(iconClass, fallback) {
    // La classe vient souvent de la base (saisie par une ville ou un
    // contributeur) et finit dans un attribut class, parfois sans échappement :
    // on ne garde que les caractères d'un nom de classe, ce qui la rend sûre
    // partout où elle passe (audit de sécurité du 11/10/2026).
    const clean = (v) => String(v || '').replace(/[^\w\s-]/g, '').trim();
    const cls = clean(iconClass) || clean(fallback) || 'fa-solid fa-map-marker';
    if (cls.includes('fa-solid') || cls.includes('fa-regular') || cls.includes('fa-brands')) return cls;
    return `fa-solid ${cls}`;
  }

  // Exposer globalement
  win.SecurityUtils = SecurityUtils;
  win.normalizeIconClass = normalizeIconClass;

})(window);
