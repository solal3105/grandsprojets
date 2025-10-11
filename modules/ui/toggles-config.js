/**
 * Configuration centralisée des toggles
 * Définit tous les boutons de contrôle de l'interface
 */

export const TOGGLES_CONFIG = {
  filters: {
    id: 'filters-toggle',
    icon: 'fa-map',
    label: 'Filtres de carte',
    ariaLabel: 'Afficher ou masquer les filtres de carte',
    position: 0,
    hasCounter: true,
    counterSelector: '.filter-count',
    defaultState: false,
    targetElement: 'filters-container'
  },
  
  basemap: {
    id: 'basemap-toggle',
    icon: 'fa-globe',
    label: 'Fond de carte',
    ariaLabel: 'Changer le fond de carte',
    position: 1,
    hasMenu: true,
    menuSelector: '#basemap-menu',
    defaultState: false
  },
  
  theme: {
    id: 'theme-toggle',
    icon: 'fa-moon',
    iconActive: 'fa-sun',
    label: 'Mode sombre',
    ariaLabel: 'Basculer entre mode clair et mode sombre',
    position: 2,
    persistent: true, // Sauvegarde dans localStorage
    defaultState: false,
    storageKey: 'theme-dark-mode'
  },
  
  search: {
    id: 'search-toggle',
    icon: 'fa-search',
    label: 'Rechercher',
    ariaLabel: 'Rechercher une adresse',
    position: 3,
    hasOverlay: true,
    overlaySelector: '#search-overlay',
    defaultState: false
  },
  
  location: {
    id: 'location-toggle',
    icon: 'fa-location-arrow',
    label: 'Ma position',
    ariaLabel: 'Centrer la carte sur ma position',
    position: 4,
    mobileOnly: true,
    states: ['default', 'active', 'loading', 'error'],
    defaultState: false
  },
  
  info: {
    id: 'info-toggle',
    icon: 'fa-info-circle',
    label: 'À propos',
    ariaLabel: 'Afficher les informations à propos',
    position: 5,
    mobileOnly: false, // Visible sur desktop ET mobile
    hasModal: true,
    modalSelector: '#about-overlay',
    defaultState: false
  }
};

/**
 * Ordre d'affichage des toggles (de droite à gauche en desktop)
 */
export const TOGGLE_ORDER = [
  'filters',
  'basemap',
  'theme',
  'search',
  'location',
  'info'
];

/**
 * Ordre d'affichage mobile (de gauche à droite)
 */
export const MOBILE_ORDER = [
  'info',      // Position 0 (gauche, arrondi)
  'location',  // Position 1
  'search',    // Position 2
  'theme',     // Position 3
  'basemap',   // Position 4
  'filters'    // Position 5 (droite, arrondi)
];
