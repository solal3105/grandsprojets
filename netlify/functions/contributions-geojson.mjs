// Netlify Function - Agrège les GeoJSON contributions côté serveur
// Évite N+1 requêtes client : 1 seule requête → FeatureCollection complète
//
// Le squelette (CORS, validation ville, requête, lots, agrégation) est partagé
// avec travaux-geojson.mjs ; l'enrichissement des features est partagé avec le
// repli client de datamodule.js. Voir modules/feature-enrich.js.

import { createGeoJSONAggregator } from './lib/geojson-aggregate.mjs';
import { enrichContribution, CONTRIBUTION_COLUMNS } from '../../modules/feature-enrich.js';

export const handler = createGeoJSONAggregator({
  table: 'contribution_uploads',
  select: CONTRIBUTION_COLUMNS,
  enrich: enrichContribution,
  batchSize: 30,
});
