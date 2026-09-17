// @ts-check
import { test, expect } from '@playwright/test';

const API = '**/data.geopf.fr/geocodage/search?*';
const CITY = { nom: 'Bourgoin-Jallieu', code: '38053', population: 28000,
  departement: { nom: 'Isère' }, centre: { type: 'Point', coordinates: [5.2745, 45.5866] } };
const FEATURES = [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [5.277663, 45.586162] },
    properties: { label: '12 Rue de la Liberté 38300 Bourgoin-Jallieu', name: '12 Rue de la Liberté',
      type: 'housenumber', postcode: '38300', city: CITY.nom, citycode: CITY.code } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [5.276, 45.585] },
    properties: { label: 'Rue de la Liberté 38300 Bourgoin-Jallieu', name: 'Rue de la Liberté',
      type: 'street', postcode: '38300', city: CITY.nom, citycode: CITY.code } },
  // Les lieux nommés de l'IGN ont un schéma différent de celui des adresses.
  { type: 'Feature', geometry: { type: 'Point', coordinates: [5.288217, 45.589966] },
    properties: { name: ['Stade Pierre Rajon'], toponym: 'Stade Pierre Rajon', _type: 'poi',
      postcode: ['38300'], city: [CITY.nom], citycode: [CITY.code] } },
];
const respond = (route, features = FEATURES) => route.fulfill({
  contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features }),
});

test.use({ viewport: { width: 1400, height: 950 }, reducedMotion: 'reduce' });

async function openSearch(page) {
  await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify([CITY]),
  }));
  await page.route('**/data.geopf.fr/**', (route) => route.abort());
  await page.route(API, (route) => respond(route));
  // Instrumentation du vrai moteur de carte uniquement dans le test.
  await page.route('**/carte-postale/app.js?*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `
      maplibregl.Map = class extends maplibregl.Map {
        constructor(options) {
          super(options);
          if (options.container === 'map') window.postcardTestMap = this;
        }
      };
      ${await response.text()}
    ` });
  });
  await page.goto('/carte-postale/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.postcardTestMap?.loaded());
  await expect(page.locator('#address')).toBeEnabled();
  await expect(page.locator('#address')).toBeVisible();
  await expect(page.locator('#commune')).toHaveCount(0);
  await expect(page.locator('#etape-atelier')).toBeHidden();
}

async function search(page, query = '12 rue de la Liberté') {
  await page.locator('#address').fill(query);
  await expect(page.locator('#address-results [role="option"]').first()).toBeVisible();
}

async function expectCenter(page, lng, lat) {
  // La projection et le trajet animé arrondissent légèrement les coordonnées.
  await expect.poll(() => page.evaluate(() => window.postcardTestMap.isMoving())).toBe(false);
  await expect.poll(async () => {
    const center = await page.evaluate(() => window.Scene.centre());
    return Math.hypot(center.lng - lng, center.lat - lat);
  }).toBeLessThan(1e-7);
}

test.describe('0.44 - Carte postale : recherche d’adresse', () => {
  test('0.44.0 - Une adresse saisie dès l’accueil retrouve la commune sans étape intermédiaire', async ({ page }) => {
    await openSearch(page);
    const request = page.waitForRequest(API);
    await search(page, '12 rue de la Liberté Bourgoin');
    expect(new URL((await request).url()).searchParams.has('citycode')).toBe(false);
    await page.getByRole('option', { name: '12 Rue de la Liberté 38300 Bourgoin-Jallieu', exact: true }).click();
    await expect(page.locator('#entete-commune')).toHaveText(CITY.nom);
    await expect(page.locator('#inscription')).toHaveValue(`${CITY.nom}, 1950 - 1965`);
    await expect(page.locator('#etape-atelier')).toBeVisible();
    await expect(page.locator('#search-intro')).toBeHidden();
    await expect(page.getByRole('combobox')).toHaveCount(1);
    await expectCenter(page, 5.277663, 45.586162);
  });

  test('0.44.1 - Une adresse centre la carte en conservant époque, angle et inscription', async ({ page }) => {
    await openSearch(page);
    await search(page);
    await page.locator('#address').press('Enter');
    await expect(page.locator('#entete-commune')).toHaveText(CITY.nom);
    await expectCenter(page, 5.277663, 45.586162);
    await page.locator('#inscription').fill('Notre quartier en 1957');
    await page.getByRole('button', { name: 'Rasant', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.postcardTestMap.isMoving())).toBe(false);
    const angle = await page.evaluate(() => ({
      pitch: window.postcardTestMap.getPitch(), bearing: window.postcardTestMap.getBearing(),
    }));
    const request = page.waitForRequest(API);
    await search(page);
    const params = new URL((await request).url()).searchParams;
    expect(params.has('citycode')).toBe(false);
    expect(params.get('index')).toBe('address,poi');
    expect(params.get('q')).toBe('12 rue de la Liberté');
    await page.getByRole('option', { name: '12 Rue de la Liberté 38300 Bourgoin-Jallieu', exact: true }).click();
    await expectCenter(page, 5.277663, 45.586162);
    const camera = await page.evaluate(() => ({
      zoom: window.postcardTestMap.getZoom(), pitch: window.postcardTestMap.getPitch(),
      bearing: window.postcardTestMap.getBearing(),
    }));
    expect(camera.zoom).toBeCloseTo(17, 6);
    expect(camera.pitch).toBeCloseTo(angle.pitch, 6);
    expect(camera.bearing).toBeCloseTo(angle.bearing, 6);
    await expect(page.locator('#inscription')).toHaveValue('Notre quartier en 1957');
    await expect(page.locator('#cp-inscription')).toHaveText('Notre quartier en 1957');
    await expect(page.locator('.epoque.is-actif')).toHaveAttribute('data-id', 'photo-1950');
    await expect(page.locator('#address-results')).toBeHidden();
    await expect(page.locator('#map .maplibregl-marker')).toHaveCount(0);
  });

  test('0.44.2 - Les rues et les lieux se choisissent aussi au clavier', async ({ page }) => {
    await openSearch(page);
    await search(page, 'liberté');
    const input = page.locator('#address');
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'address-option-1');
    await expect(page.locator('#address-option-1')).toHaveAttribute('aria-selected', 'true');
    await input.press('Enter');
    await expectCenter(page, 5.276, 45.585);
    expect(await page.evaluate(() => window.postcardTestMap.getZoom())).toBeCloseTo(16, 6);
    await search(page, 'stade');
    await input.press('ArrowUp');
    await input.press('Enter');
    await expect(input).toHaveValue('Stade Pierre Rajon 38300 Bourgoin-Jallieu');
    await expectCenter(page, 5.288217, 45.589966);
  });

  test('0.44.3 - Une saisie courte ne déclenche pas de requête et Échap ferme les propositions', async ({ page }) => {
    await openSearch(page);
    let requests = 0;
    page.on('request', (request) => { if (request.url().includes('/geocodage/search')) requests++; });
    await page.locator('#address').fill('ru');
    await page.waitForTimeout(350);
    expect(requests).toBe(0);
    await search(page);
    await page.locator('#address').press('Escape');
    await expect(page.locator('#address-results')).toBeHidden();
    await expect(page.locator('#address')).toHaveAttribute('aria-expanded', 'false');
  });

  test('0.44.4 - Les réponses tardives ne rouvrent pas une recherche abandonnée', async ({ page }) => {
    await openSearch(page);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(API, async (route) => { await gate; await respond(route); });
    const requested = page.waitForRequest(API);
    await page.locator('#address').fill('ancienne rue');
    await requested;
    await page.locator('#address').fill('');
    release();
    await page.waitForTimeout(350);
    await expect(page.locator('#address-results')).toBeHidden();
    await expect(page.locator('#address-status')).toBeEmpty();
    await expect(page.locator('#etape-atelier')).toBeHidden();
  });

  test('0.44.5 - Aucun résultat et une panne proposent une suite utile', async ({ page }) => {
    await openSearch(page);
    await page.route(API, (route) => respond(route, []));
    await page.locator('#address').fill('rue inconnue');
    await expect(page.locator('#address-status')).toContainText('Essayez sans numéro');
    await page.route(API, (route) => route.fulfill({ status: 503, body: '' }));
    await page.locator('#address').fill('rue indisponible');
    await expect(page.locator('#address-status')).toContainText('Appuyez sur Entrée pour réessayer');
    await page.route(API, (route) => respond(route));
    await page.locator('#address').press('Enter');
    await expect(page.locator('#address-results [role="option"]')).toHaveCount(3);
  });

  test('0.44.6 - Les libellés externes restent du texte et les coordonnées invalides sont ignorées', async ({ page }) => {
    await openSearch(page);
    const label = '<img src=x onerror=window.__addressXss=1>';
    await page.route(API, (route) => respond(route, [
      { ...FEATURES[0], properties: { ...FEATURES[0].properties, name: label, label } },
      { ...FEATURES[1], geometry: { type: 'Point', coordinates: [999, 45] } },
    ]));
    await search(page);
    await expect(page.locator('#address-results [role="option"]')).toHaveCount(1);
    await expect(page.locator('#address-results img')).toHaveCount(0);
    await expect(page.locator('#address-results')).toContainText(label);
    expect(await page.evaluate(() => window.__addressXss)).toBeUndefined();
  });

  test('0.44.8 - Une nouvelle adresse change automatiquement de commune et garde le texte personnalisé', async ({ page }) => {
    await openSearch(page);
    await search(page);
    await page.locator('#address').press('Enter');
    await expect(page.locator('#inscription')).toHaveValue(`${CITY.nom}, 1950 - 1965`);
    await page.locator('#inscription').fill('Notre futur quartier');
    await page.locator('.epoque[data-id="cassini"]').click();
    await page.route(API, (route) => respond(route, [{ ...FEATURES[0],
      geometry: { type: 'Point', coordinates: [4.908, 45.762] },
      properties: { label: 'Rue de la Soie 69100 Villeurbanne', name: 'Rue de la Soie',
        city: 'Villeurbanne', citycode: '69266', postcode: '69100', type: 'street' },
    }]));
    await page.locator('#btn-autre').click();
    await expect(page.locator('#address')).toBeFocused();
    await search(page, 'rue de la Soie Villeurbanne');
    await page.locator('#address').press('Enter');
    await expect(page.locator('#entete-commune')).toHaveText('Villeurbanne');
    await expect(page.locator('#inscription')).toHaveValue('Notre futur quartier');
    await expect(page.locator('.epoque.is-actif')).toHaveAttribute('data-id', 'cassini');
    await expect(page.locator('#legendes')).toContainText('Villeurbanne');
    await expectCenter(page, 4.908, 45.762);
  });

  test('0.44.9 - Une commune proposée par deux index apparaît une seule fois', async ({ page }) => {
    await openSearch(page);
    await page.route(API, (route) => respond(route, [
      { geometry: CITY.centre, properties: { name: [CITY.nom], category: ['administratif', 'commune'],
        postcode: ['38300'], citycode: [CITY.code], extrafields: { population: '28000' }, _type: 'poi' } },
      { geometry: CITY.centre, properties: { name: CITY.nom, city: CITY.nom, citycode: CITY.code, type: 'municipality' } },
    ]));
    await search(page, 'Bourgoin');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.locator('#address').press('Enter');
    await expect(page.locator('#entete-commune')).toHaveText(CITY.nom);
    await expectCenter(page, ...CITY.centre.coordinates);
    expect(await page.evaluate(() => window.postcardTestMap.getZoom())).toBeCloseTo(14.2, 6);
  });

  test('0.44.10 - Un lieu sans commune renseignée est rattaché automatiquement par ses coordonnées', async ({ page }) => {
    await openSearch(page);
    await page.route(API, (route) => respond(route, [{ ...FEATURES[2],
      properties: { name: ['Stade Pierre Rajon'], _type: 'poi' },
    }]));
    const lookup = page.waitForRequest('**/geo.api.gouv.fr/communes?*');
    await search(page, 'Stade Pierre Rajon');
    await page.locator('#address').press('Enter');
    const params = new URL((await lookup).url()).searchParams;
    expect(params.get('lat')).toBe('45.589966');
    expect(params.get('lon')).toBe('5.288217');
    await expect(page.locator('#entete-commune')).toHaveText(CITY.nom);
    await expectCenter(page, 5.288217, 45.589966);
  });

  for (const width of [1400, 430]) {
    test(`0.44.7 - La liste reste utilisable à ${width} px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 950 });
      await openSearch(page);
      await search(page);
      await page.locator('#address-search').screenshot({ path: testInfo.outputPath(`recherche-adresse-${width}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.getByRole('option', { name: 'Stade Pierre Rajon 38300 Bourgoin-Jallieu' }).click();
      await expect(page.locator('#address-status')).toContainText('La carte est centrée');
      await page.getByRole('button', { name: 'Imprimer', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: 'Imprimer', exact: true })).toBeVisible();
    });
  }
});
