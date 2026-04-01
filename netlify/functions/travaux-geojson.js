// Netlify Edge Function — Agrège les GeoJSON travaux côté serveur
// Évite N+1 requêtes client : 1 seule requête → FeatureCollection complète

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=120, s-maxage=300'
};

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json'
};

const EMPTY_FC = JSON.stringify({ type: 'FeatureCollection', features: [] });

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const ville = event.queryStringParameters?.ville;
  if (!ville || !/^[a-z0-9-]+$/i.test(ville)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Paramètre ville invalide' }) };
  }

  try {
    // 1. Fetch chantiers approuvés (SELECT colonnes utiles uniquement)
    const chantiersUrl = new URL('/rest/v1/city_travaux', SUPABASE_URL);
    chantiersUrl.searchParams.set('select', 'id,name,nature,etat,date_debut,date_fin,last_update,description,icon,localisation,geojson_url');
    chantiersUrl.searchParams.set('ville', `eq.${ville}`);
    chantiersUrl.searchParams.set('approved', 'eq.true');
    chantiersUrl.searchParams.set('order', 'created_at.desc');

    const chantiersResp = await fetch(chantiersUrl.toString(), { headers: SUPABASE_HEADERS });
    if (!chantiersResp.ok) {
      const txt = await chantiersResp.text().catch(() => '');
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: `Supabase ${chantiersResp.status}: ${txt}` }) };
    }

    const chantiers = await chantiersResp.json();
    if (!chantiers.length) {
      return { statusCode: 200, headers: CORS_HEADERS, body: EMPTY_FC };
    }

    // 2. Fetch tous les GeoJSON en parallèle (serveur → Storage = réseau interne, ultra-rapide)
    const BATCH_SIZE = 20;
    const allFeatures = [];

    for (let i = 0; i < chantiers.length; i += BATCH_SIZE) {
      const batch = chantiers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (chantier) => {
          if (!chantier.geojson_url) return [];
          try {
            const resp = await fetch(chantier.geojson_url);
            if (!resp.ok) return [];
            const geojson = await resp.json();
            if (!Array.isArray(geojson.features)) return [];

            // Enrichir chaque feature avec les métadonnées du chantier
            const loc = chantier.localisation || '';
            for (const feature of geojson.features) {
              if (!feature.properties) feature.properties = {};
              feature.properties.chantier_id = chantier.id;
              feature.properties.project_name = chantier.name;
              feature.properties.nature_travaux = chantier.nature || '';
              feature.properties.etat = chantier.etat || '';
              feature.properties.date_debut = chantier.date_debut || '';
              feature.properties.date_fin = chantier.date_fin || '';
              feature.properties.last_update = chantier.last_update || '';
              feature.properties.description = chantier.description || '';
              feature.properties.icon = chantier.icon || 'fa-solid fa-helmet-safety';
              feature.properties.commune = loc;
              feature.properties.adresse = loc;
              feature.properties.code_insee = '';
            }
            return geojson.features;
          } catch (e) {
            console.warn('[netlify] fetch chantier geojson', e);
            return [];
          }
        })
      );
      for (const features of results) {
        allFeatures.push(...features);
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ type: 'FeatureCollection', features: allFeatures })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Erreur interne', message: e.message })
    };
  }
};
