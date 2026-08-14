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
import { isValidCityCode } from './http.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

/** Préflight et erreurs : jamais mis en cache. */
const CORS_HEADERS = { ...BASE_HEADERS, 'Cache-Control': 'no-store' };

/**
 * Réponses 200 : uniquement des données publiques (`approved=true`), qui changent
 * quelques fois par semaine. En `no-store`, chaque visiteur déclenchait une
 * exécution froide refaisant 1 requête PostgREST plus N téléchargements Storage,
 * soit 0,7 à 1,2 s de TTFB mesuré sur trois appels consécutifs. Le CDN sert
 * désormais la quasi-totalité des appels, et `stale-while-revalidate` fait que
 * même la première requête après expiration ne paie pas l'agrégation.
 * Contrepartie : une contribution fraîchement approuvée met jusqu'à 5 min à
 * apparaître, ce qui reste sous le TTL de 10 min du cache client de datamodule.
 */
const CACHE_HEADERS = {
  ...BASE_HEADERS,
  'Cache-Control': 'public, max-age=60',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
};

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

const EMPTY_FC = JSON.stringify({ type: 'FeatureCollection', features: [] });

const json = (statusCode, body) => ({ statusCode, headers: CORS_HEADERS, body });
const jsonCached = (body) => ({ statusCode: 200, headers: CACHE_HEADERS, body });

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
      if (!rows.length) return jsonCached(EMPTY_FC);

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

      return jsonCached(JSON.stringify({ type: 'FeatureCollection', features: allFeatures }));
    } catch (e) {
      return json(500, JSON.stringify({ error: 'Erreur interne', message: e.message }));
    }
  };
}
