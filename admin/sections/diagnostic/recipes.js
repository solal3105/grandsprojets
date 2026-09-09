/**
 * Diagnostic terrain - formats de données reconnus.
 *
 * Une « recette » décrit un export que l'on sait reconnaître à ses colonnes,
 * et la configuration complète à appliquer d'office : jointure, filtre,
 * colonnes utiles, nature, style, chiffres de zone, contexte pour l'IA.
 * L'administrateur dépose le dossier tel quel, l'outil annonce ce qu'il a
 * reconnu et tout est prêt ; chaque réglage reste modifiable.
 *
 * Le catalogue est technique (règles de détection) ; il n'est propre à aucun
 * client. Ajouter un format = ajouter une entrée, sans toucher au wizard.
 */

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export const RECIPES = [
  {
    id: 'strava-metro-edges',
    name: 'Strava Metro - flux par tronçon',
    // Signature : champs du fichier géographique et colonnes du tableau.
    geoFields: ['edgeUID'],
    tableColumns: ['edge_uid', 'year', 'total_trip_count'],
    join: {
      layerKey: 'edgeUID',
      tableKey: 'edge_uid',
      filterColumn: 'year',
      filterLabel: 'Années',
      filterRule: 'latest', // la dernière année disponible
      columns: [
        'total_trip_count', 'forward_trip_count', 'reverse_trip_count',
        'forward_commute_trip_count', 'reverse_commute_trip_count',
        'forward_average_speed_meters_per_second', 'reverse_average_speed_meters_per_second',
        'ebike_ride_count',
      ],
    },
    keepGeoFields: ['edgeUID'],
    layer: {
      label: 'Flux Strava {value}',
      group_label: 'Mobilité',
      kind: 'reference',
      style: { mode: 'graduated', value_field: 'total_trip_count', color: '#DC2626', radius: 3 },
      popup: { title_field: '', fields: ['total_trip_count', 'forward_trip_count', 'reverse_trip_count', 'ebike_ride_count'] },
      metrics: [
        { field: 'total_trip_count', agg: 'sum' },
        { field: 'ebike_ride_count', agg: 'sum' },
        { field: 'forward_average_speed_meters_per_second', agg: 'mean' },
      ],
      ai_context: 'Passages par tronçon de rue sur une année, comptés par Strava Metro à partir des déplacements enregistrés par les utilisateurs de l\'application (échantillon de pratiquants, pas un comptage exhaustif)',
    },
  },
];

/**
 * Trouve la recette dont la signature est entièrement présente.
 * @param {{geoFields: string[], tableHeaders: string[]}} ctx
 */
export function matchRecipe({ geoFields = [], tableHeaders = [] }) {
  const g = new Set(geoFields.map(norm));
  const t = new Set(tableHeaders.map(norm));
  return RECIPES.find((r) =>
    r.geoFields.every((f) => g.has(norm(f))) && r.tableColumns.every((c) => t.has(norm(c)))
  ) || null;
}

/** Nom réel d'une colonne du tableau, à la casse et aux séparateurs près. */
export function resolveColumn(headers, wanted) {
  return headers.find((h) => norm(h) === norm(wanted)) || '';
}
