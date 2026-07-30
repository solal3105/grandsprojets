/**
 * netlify/functions/lib/geojson-aggregate.mjs
 *
 * Squelette commun aux agrégateurs GeoJSON (contributions, travaux).
 *
 * Les deux fonctions faisaient la même chose sur 107 et 108 lignes dont 45
 * strictement identiques : garde OPTIONS, validation `ville`, requête PostgREST,
 * chargement des GeoJSON par lots, agrégation en une FeatureCollection. Seuls
 * variaient la table, les colonnes, la taille de lot et l'enrichissement.
 */

import { enrichGeoJSON } from '../../../modules/feature-enrich.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

const EMPTY_FC = JSON.stringify({ type: 'FeatureCollection', features: [] });

/** Même règle que SecurityUtils.isValidCityCode côté navigateur. */
const isValidCityCode = (code) => /^[a-z0-9-]+$/i.test(String(code ?? '').trim());

const json = (statusCode, body) => ({ statusCode, headers: CORS_HEADERS, body });

/**
 * Construit un handler d'agrégation GeoJSON.
 *
 * @param {Object} opts
 * @param {string} opts.table       - table PostgREST (contribution_uploads, city_travaux)
 * @param {string} opts.select      - colonnes à sélectionner (doit couvrir l'enrichisseur)
 * @param {Function} opts.enrich    - enrichContribution ou enrichTravaux
 * @param {number} [opts.batchSize] - GeoJSON chargés en parallèle par lot
 * @returns {Function} handler Netlify
 */
export function createGeoJSONAggregator({ table, select, enrich, batchSize = 25 }) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

    const ville = event.queryStringParameters?.ville;
    if (!ville || !isValidCityCode(ville)) {
      return json(400, JSON.stringify({ error: 'Paramètre ville invalide' }));
    }

    try {
      const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
      url.searchParams.set('select', select);
      url.searchParams.set('ville', `eq.${ville}`);
      url.searchParams.set('approved', 'eq.true');
      url.searchParams.set('order', 'created_at.desc');

      const resp = await fetch(url.toString(), { headers: SUPABASE_HEADERS });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        return json(502, JSON.stringify({ error: `Supabase ${resp.status}: ${txt}` }));
      }

      const rows = await resp.json();
      if (!rows.length) return json(200, EMPTY_FC);

      // Lots : serveur → Storage est du réseau interne, mais on évite quand même
      // d'ouvrir N connexions simultanées sur une ville qui a beaucoup de lignes.
      const allFeatures = [];
      for (let i = 0; i < rows.length; i += batchSize) {
        const results = await Promise.all(
          rows.slice(i, i + batchSize).map(async (row) => {
            if (!row.geojson_url) return [];
            try {
              const r = await fetch(row.geojson_url);
              if (!r.ok) return [];
              return enrichGeoJSON(await r.json(), enrich, row);
            } catch (e) {
              console.warn(`[${table}] GeoJSON illisible:`, e.message);
              return [];
            }
          })
        );
        for (const features of results) allFeatures.push(...features);
      }

      return json(200, JSON.stringify({ type: 'FeatureCollection', features: allFeatures }));
    } catch (e) {
      return json(500, JSON.stringify({ error: 'Erreur interne', message: e.message }));
    }
  };
}
