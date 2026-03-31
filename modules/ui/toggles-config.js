/**
 * Configuration centralisée des toggles
 * Définit tous les boutons de contrôle de l'interface
 */

export const TOGGLES_CONFIG = {
  city: {
    id: 'city-toggle',
    icon: 'fa-city',
    label: 'Espace',
    ariaLabel: 'Changer d\'espace',
    position: 0,
    defaultState: false,
    hasDockPanel: true
  },

  filters: {
    id: 'filters-toggle',
    icon: 'fa-map',
    label: 'Filtres de carte',
    ariaLabel: 'Afficher ou masquer les filtres de carte',
    position: 0,
    hasCounter: true,
    counterSelector: '.filter-count',
    defaultState: false,
    hasDockPanel: true
  },
  
  mode3d: {
    id: 'mode3d-toggle',
    icon: 'fa-cube',
    iconActive: 'fa-cube',
    label: 'Mode 3D',
    ariaLabel: 'Activer ou désactiver le mode 3D (relief et bâtiments)',
    position: 1,
    persistent: true,
    defaultState: true,
    storageKey: 'mode-3d'
  },

  basemap: {
    id: 'basemap-toggle',
    icon: 'fa-globe',
    label: 'Fond de carte',
    ariaLabel: 'Changer le fond de carte',
    position: 2,
    defaultState: false,
    hasDockPanel: true
  },
  
  search: {
    id: 'search-toggle',
    icon: 'fa-search',
    label: 'Rechercher',
    ariaLabel: 'Rechercher une adresse',
    position: 3,
    defaultState: false,
    hasDockPanel: true
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
  
  actions: {
    id: 'actions-toggle',
    icon: 'fa-ellipsis-v',
    label: 'Menu',
    ariaLabel: 'Menu des actions',
    position: 5,
    defaultState: false,
    hasDockPanel: true,
    mobileOnly: true,
    // Never trimmed by the overflow algorithm — it IS the overflow entry point
    overflowExempt: true
  }
};

/**
 * Ordre d'affichage des toggles - SOURCE UNIQUE DE VÉRITÉ
 * Desktop: de droite à gauche | Mobile: de gauche à droite
 */
export const TOGGLE_ORDER = [
  'city',       // Sélecteur d'espace
  'filters',    // Filtres de carte
  'mode3d',     // Mode 3D (relief + bâtiments)
  'basemap',    // Fond de carte
  'search',     // Recherche
  'location',   // Ma position
  'actions'     // Menu actions (mobile only)
];

/**
 * Ordre inversé pour desktop (droite → gauche)
 */
export const DESKTOP_ORDER = [...TOGGLE_ORDER].reverse();
