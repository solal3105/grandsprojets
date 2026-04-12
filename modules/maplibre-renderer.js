/**
 * MapLibre GL Native Renderer
 * Gère les sources/layers MapLibre GL natifs pour les features GeoJSON et markers.
 */

;(function(win) {
  'use strict';

  // Couleur par défaut : résoud var(--color-primary) en hex à chaque appel
  const _defaultColor = () =>
    win.L?._resolveColor?.('var(--color-primary)') || '#14AE5C';

  const MapLibreRenderer = {
    /**
     * Ajoute une source GeoJSON à MapLibre GL
     */
    addGeoJSONSource(mlMap, sourceId, geojsonData) {
      if (!mlMap || !sourceId || !geojsonData) return;

      // Supprimer la source si elle existe déjà
      if (mlMap.getSource(sourceId)) {
        mlMap.removeSource(sourceId);
      }

      // Ajouter la nouvelle source
      mlMap.addSource(sourceId, {
        type: 'geojson',
        data: geojsonData,
        generateId: true // Important pour feature-state
      });
    },

    /**
     * Ajoute des layers MapLibre GL pour une source GeoJSON
     * Gère automatiquement les différents types de géométries
     */
    addGeoJSONLayers(mlMap, sourceId, layerName, style = {}) {
      if (!mlMap || !sourceId || !layerName) return;

      const dc = _defaultColor();
      const {
        lineColor = dc,
        lineWidth = 3,
        fillColor = dc,
        fillOpacity = 0.2,
        circleColor = dc,
        circleRadius = 8
      } = style;

      // Layer pour les polygones
      const fillLayerId = `${layerName}-fill`;
      if (!mlMap.getLayer(fillLayerId)) {
        mlMap.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': fillColor,
            'fill-opacity': fillOpacity
          }
        });
      }

      // Layer pour les contours de polygones
      const lineLayerId = `${layerName}-line`;
      if (!mlMap.getLayer(lineLayerId)) {
        mlMap.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          filter: ['any',
            ['==', ['geometry-type'], 'Polygon'],
            ['==', ['geometry-type'], 'LineString']
          ],
          paint: {
            'line-color': lineColor,
            'line-width': lineWidth
          }
        });
      }

      // Layer pour les points (cercles)
      const circleLayerId = `${layerName}-circle`;
      if (!mlMap.getLayer(circleLayerId)) {
        mlMap.addLayer({
          id: circleLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': circleColor,
            'circle-radius': circleRadius,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
    },

    /**
     * Supprime complètement un layer (source + tous les layers associés)
     */
    removeLayer(mlMap, layerName) {
      if (!mlMap || !layerName) return;

      const layerIds = [
        `${layerName}-fill`,
        `${layerName}-line`,
        `${layerName}-circle`,
        `${layerName}-symbol`
      ];

      layerIds.forEach(id => {
        if (mlMap.getLayer(id)) {
          mlMap.removeLayer(id);
        }
      });

      // Supprimer la source
      if (mlMap.getSource(layerName)) {
        mlMap.removeSource(layerName);
      }
    },

    /**
     * Filtre les features d'une source selon des critères
     * Utilise les filtres MapLibre GL natifs (très performant)
     */
    applyFilter(mlMap, layerName, criteria) {
      if (!mlMap || !layerName || !criteria) return;

      const layerIds = [
        `${layerName}-fill`,
        `${layerName}-line`,
        `${layerName}-circle`
      ];

      // Construire le filtre MapLibre GL
      const filters = ['all'];
      
      Object.entries(criteria).forEach(([key, value]) => {
        if (!key.startsWith('_')) {
          filters.push(['==', ['get', key], value]);
        }
      });

      // Appliquer le filtre à tous les layers
      layerIds.forEach(id => {
        if (mlMap.getLayer(id)) {
          mlMap.setFilter(id, filters.length > 1 ? filters : null);
        }
      });
    },

    /**
     * Change le style d'un layer dynamiquement
     */
    updateStyle(mlMap, layerName, style) {
      if (!mlMap || !layerName || !style) return;

      const { lineColor, lineWidth, fillColor, fillOpacity, circleColor, circleRadius } = style;

      if (lineColor && mlMap.getLayer(`${layerName}-line`)) {
        mlMap.setPaintProperty(`${layerName}-line`, 'line-color', lineColor);
      }
      if (lineWidth && mlMap.getLayer(`${layerName}-line`)) {
        mlMap.setPaintProperty(`${layerName}-line`, 'line-width', lineWidth);
      }
      if (fillColor && mlMap.getLayer(`${layerName}-fill`)) {
        mlMap.setPaintProperty(`${layerName}-fill`, 'fill-color', fillColor);
      }
      if (fillOpacity !== undefined && mlMap.getLayer(`${layerName}-fill`)) {
        mlMap.setPaintProperty(`${layerName}-fill`, 'fill-opacity', fillOpacity);
      }
      if (circleColor && mlMap.getLayer(`${layerName}-circle`)) {
        mlMap.setPaintProperty(`${layerName}-circle`, 'circle-color', circleColor);
      }
      if (circleRadius && mlMap.getLayer(`${layerName}-circle`)) {
        mlMap.setPaintProperty(`${layerName}-circle`, 'circle-radius', circleRadius);
      }
    },

    /**
     * Récupère toutes les features d'une source
     */
    getFeatures(mlMap, sourceId) {
      if (!mlMap || !sourceId) return [];
      
      const source = mlMap.getSource(sourceId);
      if (!source || !source._data) return [];
      
      return source._data.features || [];
    }
  };

  win.MapLibreRenderer = MapLibreRenderer;

})(window);
