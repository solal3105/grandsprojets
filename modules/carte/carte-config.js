// modules/carte/carte-config.js
// Calculs purs du démarrage de la carte (main.js, phases 3 à 5.5) : à partir
// de ce que renvoie Supabase, quelles couches, quels styles, quelles
// catégories afficher. Aucun accès au DOM ni au réseau : testé sans navigateur
// (tests/unauth.carte-config.spec.js).
(function (root) {
  'use strict';

  const asArray = (v) => (Array.isArray(v) ? v : []);

  /**
   * Chaque phase parcourt ces tableaux : un `undefined` ferait échouer le
   * démarrage et afficherait le bandeau rouge.
   */
  function normalizeInitData(data) {
    const d = data || {};
    return {
      layersConfig: asArray(d.layersConfig),
      basemaps: asArray(d.basemaps),
      categoryIcons: asArray(d.categoryIcons),
      cityModules: asArray(d.cityModules),
    };
  }

  /** Résultat anormalement vide (panne réseau au démarrage) : à relancer. */
  function isEmptyInitData(data) {
    const empty = (v) => !v || (Array.isArray(v) && v.length === 0);
    return empty(data?.basemaps) && empty(data?.layersConfig);
  }

  /**
   * Couches de la ville active, rangées par usage. Une couche sans ville
   * (ancienne ligne à `ville` vide) n'est jamais affichée.
   */
  function buildLayerMaps(layersConfig, city) {
    const maps = { urlMap: {}, styleMap: {}, iconMap: {}, iconColorMap: {}, defaultLayers: [] };
    for (const { name, url, style, is_default, ville, icon, icon_color } of asArray(layersConfig)) {
      if (!ville || ville !== city) continue;
      if (url) maps.urlMap[name] = url;
      if (style) maps.styleMap[name] = style;
      if (icon) maps.iconMap[name] = icon;
      if (icon_color) maps.iconColorMap[name] = icon_color;
      if (is_default) maps.defaultLayers.push(name);
    }
    return maps;
  }

  /**
   * Fusionne les styles de catégorie dans les styles de couche (modifie
   * `styleMap`). Le style d'une catégorie écrase celui de sa couche du même
   * nom ; pour ses autres couches (layers_to_display), il sert de base que le
   * style propre de la couche complète.
   * @param {Object} styleMap - styles par couche
   * @param {Object} categoryStyles - styles par catégorie (buildCategoryStylesMap)
   * @param {Array} categoryIcons - lignes category_icons
   */
  function mergeCategoryStyles(styleMap, categoryStyles, categoryIcons) {
    for (const [category, categoryStyle] of Object.entries(categoryStyles || {})) {
      if (!categoryStyle || Object.keys(categoryStyle).length === 0) continue;
      styleMap[category] = { ...styleMap[category], ...categoryStyle };
      const icon = asArray(categoryIcons).find((i) => i.category === category);
      for (const layerName of asArray(icon?.layers_to_display)) {
        if (layerName !== category) styleMap[layerName] = { ...categoryStyle, ...styleMap[layerName] };
      }
    }
    return styleMap;
  }

  /**
   * Catégories du panneau carte : celles qui ont des fiches et celles qui
   * n'existent que par leurs couches (transports, open data…), hors travaux,
   * rangées par display_order. Une catégorie sans ligne category_icons reçoit
   * une icône générique, après les catégories configurées.
   */
  function buildActiveCategories(contributions, categoryIcons) {
    const icons = asArray(categoryIcons);
    const withData = asArray(contributions).map((c) => c.category).filter(Boolean);
    const withLayers = icons
      .filter((i) => Array.isArray(i.layers_to_display) && i.layers_to_display.length)
      .map((i) => i.category);
    const categories = [...new Set([...withData, ...withLayers])].filter((cat) => cat !== 'travaux');
    const activeIcons = categories
      .map((category, index) => icons.find((i) => i.category === category) || {
        category,
        icon_class: 'fa-solid fa-layer-group',
        display_order: 100 + index,
      })
      .sort((a, b) => a.display_order - b.display_order);
    return { categories, activeIcons };
  }

  /**
   * Complète le mapping catégorie → couches avec les modules qui déclarent
   * des couches, et garantit une entrée `travaux` (modifie `layersMap`).
   */
  function addModuleLayers(layersMap, cityModules) {
    for (const mod of asArray(cityModules)) {
      if (mod.config?.layers_to_display?.length) layersMap[mod.module_key] = mod.config.layers_to_display;
    }
    if (!layersMap.travaux) layersMap.travaux = ['travaux'];
    return layersMap;
  }

  /**
   * Contributions regroupées par catégorie affichée, et ordre de chargement :
   * couches par défaut et catégories de contributions, sans doublon. Les
   * catégories de contributions attendent l'agrégat préchargé, les autres
   * couches (URL/WFS) partent tout de suite.
   */
  function planLayerLoading(contributions, categories, defaultLayers) {
    const byCategory = {};
    for (const contrib of asArray(contributions)) {
      const cat = contrib.category;
      if (cat && categories.includes(cat)) (byCategory[cat] ||= []).push(contrib);
    }
    const contribLayers = Object.keys(byCategory);
    const layersToLoad = [...new Set([...asArray(defaultLayers), ...contribLayers])];
    return {
      byCategory,
      layersToLoad,
      contribCategories: layersToLoad.filter((l) => contribLayers.includes(l)),
      urlLayers: layersToLoad.filter((l) => !contribLayers.includes(l)),
    };
  }

  root.CarteConfig = {
    normalizeInitData,
    isEmptyInitData,
    buildLayerMaps,
    mergeCategoryStyles,
    buildActiveCategories,
    addModuleLayers,
    planLayerLoading,
  };
})(typeof window !== 'undefined' ? window : globalThis);
