// Netlify Function — Agrège les GeoJSON contributions côté serveur
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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const ville = event.queryStringParameters?.ville;
  if (!ville || !/^[a-z0-9-]+$/i.test(ville)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Paramètre ville invalide' }) };
  }

  try {
    // 1. Récupérer toutes les contributions approuvées de la ville
    const contribUrl = new URL('/rest/v1/contribution_uploads', SUPABASE_URL);
    contribUrl.searchParams.set('select', 'id,project_name,category,cover_url,description,markdown_url,ville,official_url,tags,geojson_url');
    contribUrl.searchParams.set('ville', `eq.${ville}`);
    contribUrl.searchParams.set('approved', 'eq.true');
    contribUrl.searchParams.set('order', 'created_at.desc');

    const contribResp = await fetch(contribUrl.toString(), { headers: SUPABASE_HEADERS });
    if (!contribResp.ok) {
      const txt = await contribResp.text().catch(() => '');
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: `Supabase ${contribResp.status}: ${txt}` }) };
    }

    const projects = await contribResp.json();
    if (!projects.length) {
      return { statusCode: 200, headers: CORS_HEADERS, body: EMPTY_FC };
    }

    // 2. Fetch tous les GeoJSON en parallèle (serveur → Storage = réseau interne, rapide)
    const BATCH_SIZE = 30;
    const allFeatures = [];

    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (project) => {
          if (!project.geojson_url) return [];
          try {
            const resp = await fetch(project.geojson_url);
            if (!resp.ok) return [];
            const geojson = await resp.json();

            const enrich = (f) => {
              if (!f.properties) f.properties = {};
              f.properties.id = project.id;
              f.properties.project_name = project.project_name;
              f.properties.category = project.category;
              f.properties.cover_url = project.cover_url || '';
              f.properties.description = project.description || '';
              f.properties.markdown_url = project.markdown_url || '';
              f.properties.ville = project.ville;
              f.properties.official_url = project.official_url || '';
              f.properties.tags = project.tags || [];
              return f;
            };

            if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
              return geojson.features.map(enrich);
            } else if (geojson.type === 'Feature') {
              return [enrich(geojson)];
            }
            return [];
          } catch {
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
