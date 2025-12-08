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
    states: ['default', 'active', 'loading', 'error'],
    defaultState: false
  },
  
  city: {
    id: 'city-toggle',
    icon: 'fa-bars',
    label: 'Espace',
    ariaLabel: 'Changer votre espace',
    position: 6,
    hasMenu: true,
    menuSelector: '#city-menu',
    defaultState: false
  },
  
  info: {
    id: 'info-toggle',
    icon: 'fa-info-circle',
    label: 'À propos',
    ariaLabel: 'Afficher les informations à propos',
    position: 5,
    hasModal: true,
    modalSelector: '#about-overlay',
    defaultState: false
  },
  
  contribute: {
    id: 'contribute-toggle',
    icon: 'fa-plus',
    label: 'Contribuer',
    ariaLabel: 'Proposer une contribution',
    position: 7,
    defaultState: false
  },
  
  login: {
    id: 'login-toggle',
    icon: 'fa-user',
    label: 'Connexion',
    ariaLabel: 'Se connecter ou s\'inscrire',
    position: 8,
    redirectUrl: '/login',
    defaultState: false
  },
  
  overflow: {
    id: 'overflow-toggle',
    icon: 'fa-ellipsis-h',
    label: 'Plus',
    ariaLabel: 'Plus d\'options',
    position: 99, // Toujours en dernier
    hasMenu: true,
    menuSelector: '#overflow-menu',
    defaultState: false,
    mobileOnly: true // N'apparaît que sur mobile
  }
};

/**
 * Ordre d'affichage des toggles - SOURCE UNIQUE DE VÉRITÉ
 * Desktop: de droite à gauche | Mobile: de gauche à droite
 */
export const TOGGLE_ORDER = [
  'filters',    // Desktop: droite, Mobile: position 5
  'basemap',    // Desktop: , Mobile: position 4
  'theme',      // Desktop: , Mobile: position 3
  'search',     // Desktop: , Mobile: position 2
  'location',   // Desktop: , Mobile: position 1
  'city',       // Desktop: , Mobile: juste après location
  'info',       // Desktop: gauche, Mobile: position 0
  'login',      // Desktop: extrême gauche, Mobile: position 6
  'contribute'  // Desktop: extrême gauche, Mobile: position 7
];

/**
 * Ordre inversé pour desktop (droite → gauche)
 */
export const DESKTOP_ORDER = [...TOGGLE_ORDER].reverse();
