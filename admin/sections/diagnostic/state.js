/**
 * Diagnostic terrain - état partagé de la section.
 * Un seul objet mutable `dg`, réinitialisé à chaque entrée dans la section
 * (et détruit à la sortie via destroyDiagnostic).
 */

export const PALETTE = [
  '#DC2626', '#2563EB', '#16A34A', '#F59E0B', '#0F766E', '#4E2BFF',
  '#B45309', '#0EA5E9', '#DB2777', '#65A30D', '#9333EA', '#0891B2',
];


// Sources internes Open Projets proposées par le wizard (catalogue technique,
// la configuration réelle de chaque couche vit en base).
export const INTERNAL_SOURCES = {
  contributions: {
    label: 'Projets publiés',
    description: 'Les projets Open Projets approuvés de la structure',
    icon: 'fa-solid fa-map-pin',
    endpoint: '/.netlify/functions/contributions-geojson',
    defaults: {
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
      style: { mode: 'single', color: '#F59E0B', radius: 5 },
      popup: { title_field: 'project_name', fields: ['nature_travaux', 'etat', 'description'] },
      ai_context: 'Chantiers et travaux de voirie en cours déclarés par la structure',
    },
  },
};

export const DEFAULT_STYLE = { mode: 'single', color: PALETTE[1], radius: 4 };

/**
 * Nombre maximal de points analysables en une fois. L'IA lit l'INTÉGRALITÉ des
 * points sélectionnés : au-delà de ce seuil la requête ne tiendrait plus dans
 * la fenêtre de contexte du modèle, et l'analyse serait un sondage déguisé.
 * L'analyse porte donc sur une intersection, un carrefour ou un tronçon.
 */
export const MAX_ANALYSIS_POINTS = 300;

// Les couleurs de couches viennent de la config en base : ne jamais les
// injecter telles quelles dans un attribut style sans validation.
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%deg]+\)|[a-zA-Z]{3,20})$/;
export function safeColor(color, fallback = '#2563EB') {
  return COLOR_RE.test(String(color || '')) ? String(color) : fallback;
}

function _blankState() {
  return {
    container: null,
    map: null,
    mapReady: false,
    branding: null,
    // Config des couches (lignes diagnostic_layers) + données chargées par id.
    layers: [],
    layersLoadFailed: false,
    runtime: new Map(), // id → { status, features, count, fields, visible, error }
    heatmapOn: false,
    buildings3D: true, // relief bâti, visible à partir du zoom 15
    wiredPopups: new Set(), // ids de layers carte dont la popup est déjà câblée
    // Hooks posés par diagnostic.js (évitent un import circulaire) : la
    // sélection doit être recalculée quand les couches visibles changent.
    onSelectionStale: null,
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
