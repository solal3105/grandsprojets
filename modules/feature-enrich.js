/**
 * modules/feature-enrich.js
 *
 * Contrat unique « quelles propriétés porte une feature GeoJSON ».
 *
 * Ce fichier est chargé par DEUX runtimes :
 *   - le navigateur, via <script> dans index.html  → window.FeatureEnrich
 *   - les fonctions Netlify (Node), via import     → export nommés
 *
 * Raison d'être : chaque domaine a deux chemins de données qui doivent produire
 * exactement les mêmes propriétés, sinon la carte se comporte différemment selon
 * qu'un agrégateur serveur répond ou non.
 *
 *   contributions : netlify/functions/contributions-geojson.mjs
 *                   ↔ modules/datamodule.js (repli N+1 client)
 *   travaux       : netlify/functions/travaux-geojson.mjs
 *                   ↔ modules/supabaseservice.js loadCityTravauxGeoJSON (repli N+1)
 *
 * Le repli ne se déclenche qu'en incident, donc un écart ne se voit jamais en
 * développement. C'est exactement comme ça que `approved` et `created_by` se sont
 * retrouvés côté client seulement. Le test unauth.map « contrat d'enrichissement »
 * compare les deux chemins et échoue si l'un ajoute ou retire une propriété.
 */
;(function (root, factory) {
  const api = factory();
  // Node (fonctions Netlify) : esbuild convertit ce module.exports en export ESM
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api;
  // Navigateur (carte)
  if (root) root.FeatureEnrich = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Propriétés injectées sur chaque feature d'une contribution.
   * @param {Object} feature - feature GeoJSON, mutée sur place
   * @param {Object} project - ligne contribution_uploads
   * @returns {Object} la feature
   */
  function enrichContribution(feature, project) {
    if (!feature.properties) feature.properties = {};
    const p = feature.properties;
    p.id = project.id;
    p.project_name = project.project_name;
    p.category = project.category;
    p.cover_url = project.cover_url || '';
    p.description = project.description || '';
    p.markdown_url = project.markdown_url || '';
    p.ville = project.ville;
    p.official_url = project.official_url || '';
    p.tags = project.tags || [];
    return feature;
  }

  /**
   * Propriétés injectées sur chaque feature d'un chantier travaux.
   * `created_by` n'y figure pas : c'est un UUID d'utilisateur, sans consommateur,
   * et ces GeoJSON sont servis publiquement.
   * @param {Object} feature - feature GeoJSON, mutée sur place
   * @param {Object} chantier - ligne city_travaux
   * @returns {Object} la feature
   */
  function enrichTravaux(feature, chantier) {
    if (!feature.properties) feature.properties = {};
    const p = feature.properties;
    const loc = chantier.localisation || '';
    p.chantier_id = chantier.id;
    p.project_name = chantier.name;
    p.nature_travaux = chantier.nature || '';
    p.etat = chantier.etat || '';
    p.date_debut = chantier.date_debut || '';
    p.date_fin = chantier.date_fin || '';
    p.last_update = chantier.last_update || '';
    p.description = chantier.description || '';
    p.icon = chantier.icon || 'fa-solid fa-helmet-safety';
    p.approved = chantier.approved;
    p.commune = loc;
    p.adresse = loc;
    p.code_insee = '';
    return feature;
  }

  /** Colonnes que chaque chemin de données DOIT sélectionner pour enrichir. */
  const CONTRIBUTION_COLUMNS = 'id,project_name,category,cover_url,description,markdown_url,ville,official_url,tags,geojson_url';
  const TRAVAUX_COLUMNS = 'id,name,nature,etat,date_debut,date_fin,last_update,description,icon,localisation,approved,geojson_url';

  /**
   * Applique un enrichisseur à un GeoJSON quelconque (Feature ou FeatureCollection).
   * @param {Object} geojson
   * @param {Function} enrich - enrichContribution ou enrichTravaux
   * @param {Object} row - la ligne source
   * @returns {Array} les features enrichies
   */
  function enrichGeoJSON(geojson, enrich, row) {
    if (!geojson || typeof geojson !== 'object') return [];
    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
      return geojson.features.map(f => enrich(f, row));
    }
    if (geojson.type === 'Feature') return [enrich(geojson, row)];
    return [];
  }

  return {
    enrichContribution,
    enrichTravaux,
    enrichGeoJSON,
    CONTRIBUTION_COLUMNS,
    TRAVAUX_COLUMNS,
  };
});
