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
   * Décimales conservées sur les coordonnées.
   * Les sources produisent du 4.916739860490708 (15 décimales, soit 0,1 micron)
   * là où 6 décimales valent 11 cm, très en dessous de ce qu'un rendu
   * cartographique distingue. Les décimales excédentaires pesaient 94 Ko sur le
   * seul agrégat des contributions de metropole-lyon.
   *
   * L'arrondi est fait dans les deux enrichisseurs plutôt que dans enrichGeoJSON,
   * parce que le repli client des travaux appelle `enrichTravaux` directement :
   * le placer plus haut aurait fait diverger les deux chemins travaux, ce que ce
   * fichier existe précisément pour empêcher.
   */
  const COORD_PRECISION = 6;

  /** Arrondit récursivement une géométrie GeoJSON, en place. */
  function roundCoords(c) {
    if (!Array.isArray(c)) return c;
    if (typeof c[0] === 'number') {
      for (let i = 0; i < c.length; i++) {
        if (typeof c[i] === 'number') c[i] = +c[i].toFixed(COORD_PRECISION);
      }
      return c;
    }
    for (let i = 0; i < c.length; i++) roundCoords(c[i]);
    return c;
  }

  /**
   * Propriétés injectées sur chaque feature d'une contribution.
   *
   * Strictement les quatre champs que la carte lit sur une feature :
   *   id           → ouverture du détail (NavigationModule.showProjectDetailById)
   *   project_name → titre du survol, clé de regroupement multi-features
   *   category     → icône du marqueur, routage du clic
   *   cover_url    → vignette du survol et préchargement des images
   *
   * Tout le reste (description, markdown_url, official_url, tags, ville) était
   * recopié sur CHAQUE feature du projet : « Voie Lyonnaise 10 » compte 85
   * features, donc 85 copies de sa description. Sur metropole-lyon cela faisait
   * 218 Ko de doublons purs et 55 % du poids de l'agrégat, pour des champs que
   * seul le panneau de détail utilise - or il recharge de toute façon la ligne
   * complète via getContributionById / fetchProjectByCategoryAndName au moment
   * du clic. Ne rien rajouter ici sans un consommateur réel côté feature.
   *
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
    roundCoords(feature.geometry && feature.geometry.coordinates);
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
    roundCoords(feature.geometry && feature.geometry.coordinates);
    return feature;
  }

  /** Colonnes que chaque chemin de données DOIT sélectionner pour enrichir. */
  const CONTRIBUTION_COLUMNS = 'id,project_name,category,cover_url,geojson_url';
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
