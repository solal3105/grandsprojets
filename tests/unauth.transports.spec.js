// @ts-check
import { test, expect } from '@playwright/test';
import { reseauEnGeojson } from '../netlify/functions/lib/transit-osm.mjs';

/**
 * Couche réseau de transport en commun (lib/transit-osm.mjs + carte).
 *
 * Le fichier de réseau est construit depuis OpenStreetMap : chaque tracé porte
 * sa couleur (`_color`, lue nativement par le rendu) et son nom. Plus aucune
 * table de correspondance de couleurs par ville : ces tests figent le contrat
 * de la donnée, puis vérifient que la carte expose la catégorie et son message.
 *
 * La construction est testée hors réseau, sur des réponses Overpass forgées :
 * le service public sature par vagues, un test qui l'appellerait serait
 * intermittent par construction.
 */

/** Réponse Overpass minimale : une relation de ligne avec ses tronçons. */
function relation(id, tags, ways) {
  return {
    type: 'relation',
    id,
    tags,
    members: ways.map(([wayId, geometry]) => ({ type: 'way', ref: wayId, geometry })),
  };
}

const SEG_A = [{ lat: 45.76, lon: 4.88 }, { lat: 45.761, lon: 4.881 }];
const SEG_B = [{ lat: 45.761, lon: 4.881 }, { lat: 45.762, lon: 4.882 }];

test.describe('0.64 - Réseau de transport : construction du fichier', () => {

  test('0.64.1 - Seules les lignes à couleur officielle sont retenues', () => {
    const fc = reseauEnGeojson({
      elements: [
        relation(1, { route: 'bus', ref: 'C3', colour: '#8A5FA0', network: 'TCL' }, [[10, SEG_A]]),
        relation(2, { route: 'bus', ref: 'JD141', network: 'TCL' }, [[11, SEG_B]]),
        relation(3, { route: 'bus', ref: 'X', colour: 'javascript:alert(1)', network: 'TCL' }, [[12, SEG_B]]),
      ],
    });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.ref).toBe('C3');
  });

  test('0.64.2 - Deux sens d\'une même ligne ne font qu\'une entité, chaque rue comptée une fois', () => {
    const fc = reseauEnGeojson({
      elements: [
        relation(1, { route: 'bus', ref: '69', colour: '#662782', network: 'TCL' }, [[10, SEG_A], [11, SEG_B]]),
        relation(2, { route: 'bus', ref: '69', colour: '#662782', network: 'TCL' }, [[11, SEG_B], [10, SEG_A]]),
      ],
    });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toHaveLength(2);
  });

  test('0.64.3 - La couleur voyage dans la donnée (_color) et le nom porte le mode', () => {
    const fc = reseauEnGeojson({
      elements: [
        relation(1, { route: 'subway', ref: 'A', colour: '#E4001C', network: 'TCL' }, [[10, SEG_A]]),
      ],
    });
    const p = fc.features[0].properties;
    expect(p._color).toBe('#E4001C');
    expect(p.colour).toBe('#E4001C');
    expect(p.name).toBe('Métro A');
    expect(p.mode).toBe('rail');
  });

  test('0.64.4 - Une géométrie découpée est coupée au trou, jamais reliée par un trait fantôme', () => {
    const troue = [SEG_A[0], SEG_A[1], null, SEG_B[0], SEG_B[1]];
    const fc = reseauEnGeojson({
      elements: [
        relation(1, { route: 'bus', ref: '5', colour: '#0080C0', network: 'Rubis' }, [[10, troue]]),
      ],
    });
    expect(fc.features[0].geometry.coordinates).toHaveLength(2);
  });

  test('0.64.5 - Même numéro sur deux réseaux distincts = deux lignes', () => {
    const fc = reseauEnGeojson({
      elements: [
        relation(1, { route: 'bus', ref: '1', colour: '#004080', network: 'Rubis' }, [[10, SEG_A]]),
        relation(2, { route: 'bus', ref: '1', colour: '#AA0000', network: 'Saônibus' }, [[11, SEG_B]]),
      ],
    });
    expect(fc.features).toHaveLength(2);
  });

  test('0.64.6 - Le rail est trié après les bus (dessiné au-dessus sur la carte)', () => {
    const fc = reseauEnGeojson({
      elements: [
        relation(1, { route: 'tram', ref: 'T1', colour: '#95368C', network: 'TCL' }, [[10, SEG_A]]),
        relation(2, { route: 'bus', ref: 'C3', colour: '#8A5FA0', network: 'TCL' }, [[11, SEG_B]]),
      ],
    });
    expect(fc.features.map((f) => f.properties.mode)).toEqual(['road', 'rail']);
  });

});

test.describe('0.65 - Réseau de transport : la carte expose le filtre', () => {

  // Même amorçage que unauth.map.spec.js : la racine, dont la ville par
  // défaut est metropole-lyon (un `?city=` explicite ne boote pas en local)
  async function waitForMapBoot(page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelector('#filters-toggle')?.getAttribute('data-ready') === 'true',
      { timeout: 20000 }
    );
  }

  test('0.65.1 - La catégorie du réseau apparaît et sa couche est raccordée', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });
    const cat = page.locator('.nav-panel__item[data-category="transports en commun"]');
    await expect(cat).toBeVisible({ timeout: 10000 });
    // La catégorie est bien raccordée à la couche de données du réseau
    const layers = await page.evaluate(() => window.categoryLayersMap?.['transports en commun'] || []);
    expect(layers).toContain('transports');
  });

  test('0.65.2 - Une catégorie sans fiches mais avec des couches le dit, au lieu d\'annoncer un vide', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });
    const cat = page.locator('.nav-panel__item[data-category="transports en commun"]');
    await expect(cat).toBeVisible({ timeout: 10000 });
    await cat.click();
    await expect(page.locator('#nav-panel')).toHaveAttribute('data-level', '3', { timeout: 5000 });
    await expect(page.locator('.nav-panel__empty')).toContainText('directement sur la carte', { timeout: 10000 });
  });

});
