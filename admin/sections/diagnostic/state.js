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
  participer: {
    label: 'Signalements des habitants',
    description: 'Les signalements publiés par les habitants depuis la carte',
    icon: 'fa-solid fa-comment-dots',
    endpoint: '/api/participer/geojson',
    defaults: {
      style: { mode: 'category', color: '#DC2626', category_field: 'category_label', radius: 5 },
      popup: { title_field: 'reference', fields: ['category_label', 'statut_label', 'description', 'adresse'] },
      ai_context: 'Signalements publiés par les habitants depuis la carte de la structure, avec leur description',
    },
  },
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
 * Nature d'une couche - ce qu'en fait l'analyse de zone.
 * - temoignages : des points qui disent quelque chose (signalements, avis,
 *   relevés). L'analyse les lit un par un, dans la limite de MAX_ANALYSIS_POINTS.
 * - reference : des données chiffrées ou de contexte (comptages, mesures,
 *   zonages). Elles s'affichent, produisent les chiffres de zone, et sont
 *   données au modèle comme contexte ; elles ne comptent jamais dans le plafond.
 * La nature et les chiffres de zone vivent dans le jsonb `popup` de la couche
 * (ce que la couche expose : champs de popup, nature, métriques) - aucune
 * colonne dédiée n'est requise.
 */
export const LAYER_KINDS = {
  temoignages: {
    label: 'Témoignages',
    hint: 'Des points qui disent quelque chose : signalements, avis, relevés. L\'analyse les lit un par un.',
  },
  reference: {
    label: 'Données de référence',
    hint: 'Des comptages, mesures ou zonages. Ils s\'affichent sur la carte et donnent les chiffres de la zone, sans être lus point par point.',
  },
};

/** Nature effective d'une couche ('temoignages' par défaut). */
export function layerKind(layer) {
  return layer?.popup?.kind === 'reference' ? 'reference' : 'temoignages';
}

/** Chiffres de zone configurés d'une couche : [{ field, agg }]. */
export function layerMetrics(layer) {
  const list = layer?.popup?.metrics;
  return Array.isArray(list) ? list.filter((m) => m && typeof m.field === 'string' && m.field) : [];
}

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
    runtime: new Map(), // id → { status, features, count, fields, visible, error, ramp }
    heatmapOn: false,
    darkBase: false, // fond assombri, activé de lui-même quand une carte de flux est chargée
    basemap: 'plan', // 'plan' (OpenStreetMap) ou 'satellite' (photographies aériennes IGN)
    buildings3D: true, // relief bâti, visible à partir du zoom 15
    wiredPopups: new Set(), // ids de layers carte dont la popup est déjà câblée
    // Hooks posés par diagnostic.js (évitent un import circulaire) : la
    // sélection doit être recalculée quand les couches visibles changent.
    onSelectionStale: null,
    // Territoire de l'espace (commune, intercommunalité), résolu à la demande.
    territory: null,
    // Sélection lasso.
    lasso: { armed: false, drawing: false, points: [] },
    // features = témoignages retenus (comptés dans le plafond), context =
    // entités des couches de référence retenues (chiffres de zone).
    selection: null, // { features, context, polygon, bbox, areaKm2 }
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
