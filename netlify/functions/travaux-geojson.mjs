// Netlify Function - Agrège les GeoJSON travaux côté serveur
// Évite N+1 requêtes client : 1 seule requête → FeatureCollection complète
//
// Le squelette (CORS, validation ville, requête, lots, agrégation) est partagé
// avec contributions-geojson.mjs ; l'enrichissement des features est partagé
// avec le repli client de supabaseservice.loadCityTravauxGeoJSON.
// Voir modules/feature-enrich.js.

import { createGeoJSONAggregator } from './lib/geojson-aggregate.mjs';
import { enrichTravaux, TRAVAUX_COLUMNS } from '../../modules/feature-enrich.js';

export const handler = createGeoJSONAggregator({
  table: 'city_travaux',
  select: TRAVAUX_COLUMNS,
  enrich: enrichTravaux,
  batchSize: 20,
});
