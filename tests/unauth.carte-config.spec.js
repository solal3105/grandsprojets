// @ts-check
import { test, expect } from '@playwright/test';
import '../modules/carte/carte-config.js';

/**
 * Démarrage de la carte : les calculs purs sortis de main.js (initApp).
 * Avant, ils n'étaient vérifiés qu'indirectement, par le chargement complet de
 * la carte. Aucun navigateur ni réseau ici.
 */
const C = /** @type {any} */ (globalThis).CarteConfig;

test.describe('0.90 - Démarrage de la carte : couches, styles et catégories', () => {

  test('0.90.1 - Données de départ absentes ou partielles : toujours des tableaux', () => {
    expect(C.normalizeInitData(undefined)).toEqual({ layersConfig: [], basemaps: [], categoryIcons: [], cityModules: [] });
    expect(C.normalizeInitData({ layersConfig: null, basemaps: [{ name: 'osm' }], categoryIcons: 'x' }))
      .toEqual({ layersConfig: [], basemaps: [{ name: 'osm' }], categoryIcons: [], cityModules: [] });
  });

  test('0.90.2 - Relance seulement quand fonds de carte ET couches manquent', () => {
    expect(C.isEmptyInitData(null)).toBe(true);
    expect(C.isEmptyInitData({ basemaps: [], layersConfig: [] })).toBe(true);
    expect(C.isEmptyInitData({ basemaps: [{}], layersConfig: [] })).toBe(false);
    expect(C.isEmptyInitData({ basemaps: [], layersConfig: [{}] })).toBe(false);
  });

  test('0.90.3 - Seules les couches de la ville active sont gardées', () => {
    const maps = C.buildLayerMaps([
      { name: 'tram', url: 'u1', style: { color: 'red' }, is_default: true, ville: 'lyon', icon: 'fa-tram', icon_color: '#f00' },
      { name: 'bus', url: 'u2', ville: 'lyon' },
      { name: 'autre', url: 'u3', is_default: true, ville: 'grenoble' },
      { name: 'orpheline', url: 'u4', is_default: true, ville: null },
      { name: 'vide', url: 'u5', ville: '' },
    ], 'lyon');
    expect(maps).toEqual({
      urlMap: { tram: 'u1', bus: 'u2' },
      styleMap: { tram: { color: 'red' } },
      iconMap: { tram: 'fa-tram' },
      iconColorMap: { tram: '#f00' },
      defaultLayers: ['tram'],
    });
  });

  test('0.90.4 - Style de catégorie : écrase sa couche, sert de base aux autres', () => {
    const styleMap = { velo: { color: 'gris', weight: 2 }, pistes: { weight: 5 } };
    C.mergeCategoryStyles(styleMap,
      { velo: { color: 'vert' }, vide: {} },
      [{ category: 'velo', layers_to_display: ['velo', 'pistes', 'arceaux'] }]);
    expect(styleMap).toEqual({
      velo: { color: 'vert', weight: 2 },
      pistes: { color: 'vert', weight: 5 },
      arceaux: { color: 'vert' },
    });
  });

  test('0.90.5 - Catégories : fiches + couches seules, sans travaux, rangées', () => {
    const { categories, activeIcons } = C.buildActiveCategories(
      [{ category: 'velo' }, { category: 'travaux' }, { category: 'velo' }, { category: null }, { category: 'inconnue' }],
      [
        { category: 'velo', display_order: 2 },
        { category: 'transports', display_order: 1, layers_to_display: ['tram'] },
        { category: 'sans-couche', display_order: 0, layers_to_display: [] },
      ]);
    expect(categories).toEqual(['velo', 'inconnue', 'transports']);
    expect(activeIcons.map((i) => i.category)).toEqual(['transports', 'velo', 'inconnue']);
    // Une catégorie sans ligne category_icons : icône générique, après les autres
    expect(activeIcons[2]).toEqual({ category: 'inconnue', icon_class: 'fa-solid fa-layer-group', display_order: 101 });
  });

  test('0.90.6 - Modules à couches ajoutés, entrée travaux garantie', () => {
    expect(C.addModuleLayers({ velo: ['velo'] }, [
      { module_key: 'travaux', config: { layers_to_display: ['travaux', 'chantiers-lourds'] } },
      { module_key: 'participer', config: {} },
    ])).toEqual({ velo: ['velo'], travaux: ['travaux', 'chantiers-lourds'] });
    expect(C.addModuleLayers({}, null)).toEqual({ travaux: ['travaux'] });
  });

  test('0.90.7 - Plan de chargement : couches par défaut puis contributions, sans doublon', () => {
    const plan = C.planLayerLoading(
      [{ category: 'velo', id: 1 }, { category: 'velo', id: 2 }, { category: 'urbanisme', id: 3 }, { category: 'travaux', id: 4 }],
      ['velo', 'urbanisme', 'transports'],
      ['tram', 'velo']);
    expect(plan.byCategory).toEqual({
      velo: [{ category: 'velo', id: 1 }, { category: 'velo', id: 2 }],
      urbanisme: [{ category: 'urbanisme', id: 3 }],
    });
    expect(plan.layersToLoad).toEqual(['tram', 'velo', 'urbanisme']);
    expect(plan.contribCategories).toEqual(['velo', 'urbanisme']);
    expect(plan.urlLayers).toEqual(['tram']);
  });
});
