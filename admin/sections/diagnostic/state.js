/**
 * Diagnostic terrain — état partagé de la section.
 * Un seul objet mutable `dg`, réinitialisé à chaque entrée dans la section
 * (et détruit à la sortie via destroyDiagnostic).
 */

export const PALETTE = [
  '#DC2626', '#2563EB', '#16A34A', '#F59E0B', '#0F766E', '#4E2BFF',
  '#B45309', '#0EA5E9', '#DB2777', '#65A30D', '#9333EA', '#0891B2',
];

// Couleurs des niveaux de gravité (1 → 5) et des niveaux de zone.
export const SEVERITY_COLORS = { 1: '#94A3B8', 2: '#5AAB7D', 3: '#F2B327', 4: '#F97316', 5: '#DC2626' };
export const LEVEL_COLORS = { 'Faible': '#5AAB7D', 'Modéré': '#F2B327', 'Élevé': '#F97316', 'Critique': '#DC2626' };

// Sources internes Open Projets proposées par le wizard (catalogue technique,
// la configuration réelle de chaque couche vit en base).
export const INTERNAL_SOURCES = {
  contributions: {
    label: 'Projets publiés',
    description: 'Les projets Open Projets approuvés de la structure',
    icon: 'fa-solid fa-map-pin',
    endpoint: '/.netlify/functions/contributions-geojson',
    defaults: {
      polarity: 'neutre',
      style: { mode: 'category', color: '#2563EB', category_field: 'category', radius: 5 },
      popup: { title_field: 'project_name', fields: ['category', 'description'] },
      ai_context: 'Projets urbains publiés sur la carte Open Projets de la structure',
    },
  },
  travaux: {
    label: 'Travaux en cours',
    description: 'Les chantiers du module Travaux de la structure',
    icon: 'fa-solid fa-helmet-safety',
    endpoint: '/.netlify/functions/travaux-geojson',
    defaults: {
      polarity: 'neutre',
      style: { mode: 'single', color: '#F59E0B', radius: 5 },
      popup: { title_field: 'project_name', fields: ['nature_travaux', 'etat', 'description'] },
      ai_context: 'Chantiers et travaux de voirie en cours déclarés par la structure',
    },
  },
};

export const DEFAULT_STYLE = { mode: 'single', color: PALETTE[1], radius: 4 };

function _blankState() {
  return {
    container: null,
    map: null,
    mapReady: false,
    branding: null,
    // Config des couches (lignes diagnostic_layers) + données chargées par id.
    layers: [],
    runtime: new Map(), // id → { status, features, count, fields, visible, error }
    heatmapOn: false,
    // Sélection lasso.
    lasso: { armed: false, drawing: false, points: [] },
    selection: null, // { features, polygon, bbox, areaKm2 }
    // Analyse IA.
    analysis: null, // { resume, insights, level, statsTxt, corrTxt }
    aiSample: null,
    abortCtrl: null,
    insightFilter: 'all',
    // Divers UI.
    cleanupFns: [],
  };
}

export const dg = _blankState();

export function resetState() {
  Object.assign(dg, _blankState());
}

/** Enregistre un nettoyage à exécuter au destroy (listeners globaux, overlays…). */
export function onCleanup(fn) {
  dg.cleanupFns.push(fn);
}
