/* ============================================================================
   FONCTION PARTICIPER-GEOJSON - route /api/participer/geojson (GET, public)

   FeatureCollection des signalements PUBLIÉS d'une ville, avec libellés et
   couleurs de catégorie/statut joints côté serveur. Whitelist stricte de
   propriétés (publicProps) : jamais l'email, le hash d'IP ni les jetons.
   ============================================================================ */

import {
  VILLE_RE, PUBLIC_GET_CORS, jsonResp, hasServiceKey,
  svcSelect, loadCategories, loadStatuts, publicProps,
} from './lib/participer-common.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: PUBLIC_GET_CORS });
  if (req.method !== 'GET') return jsonResp(405, { error: 'Méthode non autorisée' });

  const ville = new URL(req.url).searchParams.get('ville') || '';
  if (!VILLE_RE.test(ville)) return jsonResp(400, { error: 'Paramètre ville invalide' });
  if (!hasServiceKey()) return jsonResp(503, { error: 'Service indisponible' });

  try {
    const [rows, categories, statuts] = await Promise.all([
      svcSelect('participer_signalements', {
        select: 'id,reference,category_key,statut_key,description,photo_url,lat,lng,adresse,created_at,updated_at',
        ville: `eq.${ville}`,
        published: 'eq.true',
        order: 'created_at.desc',
      }),
      loadCategories(ville),
      loadStatuts(ville),
    ]);

    const features = rows.map((row) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
      properties: publicProps(row, categories, statuts),
    }));
    return jsonResp(200, { type: 'FeatureCollection', features });
  } catch (e) {
    console.error('[participer-geojson] ::', e?.message);
    return jsonResp(500, { error: 'Erreur interne' });
  }
};

export const config = { path: '/api/participer/geojson' };
