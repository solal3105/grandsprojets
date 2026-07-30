// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Logique de l'outil carte postale.
 *
 * Le seul spec existant, unauth.carte-postale-visuel.spec.js, est un banc de
 * captures d'écran derrière `test.skip(!process.env.CP_VISUEL)` : sur un
 * `npm test` normal, les 735 lignes de carte-postale/ ne s'exécutaient jamais.
 *
 * Ce fichier couvre tout ce qui ne demande pas de juger une image : les époques,
 * la recherche de commune, la frise, l'inscription et la composition 300 dpi.
 * Les captures restent dans le banc visuel, elles y sont à leur place.
 */

test.use({ viewport: { width: 1400, height: 950 } });

const COMMUNES = [
  {
    nom: 'Bourgoin-Jallieu',
    code: '38053',
    population: 28000,
    departement: { nom: 'Isère' },
    centre: { type: 'Point', coordinates: [5.2745, 45.5866] },
  },
  {
    nom: 'Bourg-en-Bresse',
    code: '01053',
    population: 41000,
    departement: { nom: 'Ain' },
    centre: { type: 'Point', coordinates: [5.2257, 46.2051] },
  },
];

/**
 * Ouvre l'outil avec les appels externes neutralisés : l'annuaire des communes
 * est simulé, les tuiles et le QR sont coupés pour que le test ne dépende ni
 * du réseau ni des serveurs de l'IGN.
 */
async function ouvrir(page, communes = COMMUNES) {
  await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(communes),
  }));
  for (const externe of ['**/data.geopf.fr/**', '**/api.qrserver.com/**']) {
    await page.route(externe, (route) => route.abort());
  }
  await page.goto('/carte-postale/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Epoques && window.Postcard, null, { timeout: 15000 });
}

/** Saisit une commune et entre dans l'atelier (sans attendre les tuiles). */
async function entrer(page, saisie = 'Bourgoin') {
  await page.locator('#commune').fill(saisie);
  await page.locator('#suggestions li').first().waitFor({ timeout: 5000 });
  await page.locator('#suggestions li').first().click();
  await expect(page.locator('#etape-atelier')).toHaveClass(/is-actif/);
}

test.describe('0.40 - Carte postale : amorçage et époques', () => {

  test('0.40.1 - La page démarre et expose ses trois modules', async ({ page }) => {
    await ouvrir(page);
    await expect(page.locator('#carte-postale')).toBeVisible();
    const modules = await page.evaluate(() => ({
      epoques: Array.isArray(window.Epoques?.liste),
      postcard: typeof window.Postcard?.composer === 'function',
      scene: typeof window.Scene?.init === 'function',
    }));
    expect(modules).toEqual({ epoques: true, postcard: true, scene: true });
  });

  test('0.40.2 - Chaque époque porte un identifiant et une période', async ({ page }) => {
    await ouvrir(page);
    const liste = await page.evaluate(() => window.Epoques.liste.map((e) => ({
      id: e.id, periode: e.periode, annee: e.annee,
    })));
    expect(liste.length).toBeGreaterThan(3);
    for (const e of liste) {
      expect(e.id, JSON.stringify(e)).toMatch(/^[a-z0-9-]+$/);
      expect(e.periode?.length ?? 0).toBeGreaterThan(3);
    }
    // Une seule époque sans année : le présent
    expect(liste.filter((e) => !e.annee)).toHaveLength(1);
  });

  test('0.40.3 - La phrase du bandeau compte les années écoulées', async ({ page }) => {
    await ouvrir(page);
    const res = await page.evaluate(() => {
      const p = window.Epoques.punchline;
      return {
        datee: p({ annee: 1950 }, 2026),
        present: p({ annee: null }, 2026),
        vide: p(null, 2026),
        // Une époque de l'année en cours ne doit jamais afficher « 0 an »
        memeAnnee: p({ annee: 2026 }, 2026),
      };
    });
    expect(res.datee).toContain('76 ans');
    expect(res.present).toContain("aujourd'hui");
    expect(res.vide).toContain("aujourd'hui");
    expect(res.memeAnnee).toContain('1 ans');
    expect(res.memeAnnee).not.toContain('0 ans');
  });

  test('0.40.4 - Les légendes proposées reprennent le nom de la commune', async ({ page }) => {
    await ouvrir(page);
    const res = await page.evaluate(() => ({
      datee: window.Epoques.legendes('Vaulx-en-Velin', { annee: 1950, periode: '1950 - 1965' }),
      presente: window.Epoques.legendes('Vaulx-en-Velin', { annee: null, periode: "Aujourd'hui" }),
      sansNom: window.Epoques.legendes('', { annee: 1950, periode: '1950 - 1965' }),
      sansEpoque: window.Epoques.legendes('Vaulx-en-Velin', null),
    }));
    expect(res.datee.length).toBe(5);
    expect(res.presente.length).toBe(3);
    for (const l of res.datee) expect(l).toContain('Vaulx-en-Velin');
    expect(res.sansNom[0]).toContain('Votre commune');
    expect(res.sansEpoque).toEqual(['Vaulx-en-Velin']);
  });

});

test.describe('0.41 - Carte postale : recherche de commune', () => {

  test('0.41.1 - Deux caractères suffisent à faire apparaître les suggestions', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#commune').fill('Bourgoin');
    const items = page.locator('#suggestions li');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Bourgoin-Jallieu');
    await expect(items.first()).toContainText('Isère');
  });

  test('0.41.2 - Un seul caractère ne déclenche aucune suggestion', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#commune').fill('B');
    await page.waitForTimeout(500);
    await expect(page.locator('#suggestions')).toBeHidden();
  });

  test('0.41.3 - Échap referme la liste', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#commune').fill('Bourgoin');
    await page.locator('#suggestions li').first().waitFor({ timeout: 5000 });
    await page.locator('#commune').press('Escape');
    await expect(page.locator('#suggestions')).toBeHidden();
  });

  test('0.41.4 - Flèche bas puis Entrée sélectionne la deuxième commune', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#commune').fill('Bourg');
    await page.locator('#suggestions li').first().waitFor({ timeout: 5000 });
    await page.locator('#commune').press('ArrowDown');
    await page.locator('#commune').press('ArrowDown');
    await page.locator('#commune').press('Enter');
    await expect(page.locator('#etape-atelier')).toHaveClass(/is-actif/);
    await expect(page.locator('#entete-commune')).toHaveText('Bourg-en-Bresse');
  });

  test("0.41.5 - Un nom de commune piégé n'injecte pas de balise", async ({ page }) => {
    await ouvrir(page, [{
      nom: '<img src=x onerror=window.__xss=1>Piegee',
      code: '00000',
      population: 1,
      departement: { nom: '<b>Dept</b>' },
      centre: { type: 'Point', coordinates: [4.85, 45.75] },
    }]);
    await page.locator('#commune').fill('Piegee');
    await page.locator('#suggestions li').first().waitFor({ timeout: 5000 });
    expect(await page.locator('#suggestions li img').count()).toBe(0);
    expect(await page.locator('#suggestions li b').count()).toBe(0);
    await page.locator('#suggestions li').first().click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('0.41.6 - Une panne de l\'annuaire ne casse pas la page', async ({ page }) => {
    await page.route('**/geo.api.gouv.fr/**', (route) => route.abort());
    await page.route('**/data.geopf.fr/**', (route) => route.abort());
    await page.goto('/carte-postale/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Epoques, null, { timeout: 15000 });
    await page.locator('#commune').fill('Bourgoin');
    await page.waitForTimeout(600);
    await expect(page.locator('#suggestions')).toBeHidden();
    await expect(page.locator('#carte-postale')).toBeVisible();
  });

});

test.describe('0.42 - Carte postale : atelier et composition', () => {

  test('0.42.1 - La frise porte un bouton par époque', async ({ page }) => {
    await ouvrir(page);
    await entrer(page);
    const attendu = await page.evaluate(() => window.Epoques.liste.length);
    await expect(page.locator('#frise .epoque')).toHaveCount(attendu);
  });

  test("0.42.2 - L'atelier s'ouvre sur la vue aérienne des années 1950", async ({ page }) => {
    await ouvrir(page);
    await entrer(page);
    await expect(page.locator('.epoque[data-id="photo-1950"]')).toHaveClass(/is-actif/);
  });

  test("0.42.3 - Changer d'époque déplace l'état actif", async ({ page }) => {
    await ouvrir(page);
    await entrer(page);
    await page.locator('.epoque[data-id="cassini"]').click();
    await expect(page.locator('.epoque[data-id="cassini"]')).toHaveClass(/is-actif/);
    await expect(page.locator('.epoque[data-id="photo-1950"]')).not.toHaveClass(/is-actif/);
  });

  test("0.42.4 - L'inscription saisie se reporte sur la carte postale", async ({ page }) => {
    await ouvrir(page);
    await entrer(page);
    // Pré-remplie avec le nom de la commune
    await expect(page.locator('#cp-inscription')).toHaveText('Bourgoin-Jallieu');
    await page.locator('#inscription').fill('Souvenir de Bourgoin-Jallieu, 1957');
    await expect(page.locator('#cp-inscription')).toHaveText('Souvenir de Bourgoin-Jallieu, 1957');
  });

  test("0.42.5 - L'inscription est posée en texte, jamais en HTML", async ({ page }) => {
    await ouvrir(page);
    await entrer(page);
    await page.locator('#inscription').fill('<b>gras</b>');
    await expect(page.locator('#cp-inscription')).toHaveText('<b>gras</b>');
    expect(await page.locator('#cp-inscription b').count()).toBe(0);
  });

  test("0.42.6 - L'image d'impression sort en 1181 x 1772 (300 dpi)", async ({ page }) => {
    await ouvrir(page);
    const dims = await page.evaluate(async () => {
      const c = await window.Postcard.composer({
        imageCarte: null,
        inscription: 'Bourgoin-Jallieu, 1950 - 1965',
        punchline: window.Epoques.punchline({ annee: 1957 }, 2026),
        telephone: '06 12 34 56 78',
        cibleQr: 'https://openprojets.com/demo/',
      });
      return { l: c.width, h: c.height, type: c.toDataURL('image/png').slice(0, 22) };
    });
    expect(dims.l).toBe(1181);
    expect(dims.h).toBe(1772);
    expect(dims.type).toBe('data:image/png;base64,');
  });

  test('0.42.7 - La composition tient sans image ni inscription', async ({ page }) => {
    await ouvrir(page);
    const ok = await page.evaluate(async () => {
      try {
        const c = await window.Postcard.composer({
          imageCarte: null, inscription: '', punchline: '', telephone: '', cibleQr: '',
        });
        return c.width > 0 && c.height > 0;
      } catch { return false; }
    });
    expect(ok).toBe(true);
  });

  test("0.42.8 - Les proportions annoncées de la zone image sont cohérentes", async ({ page }) => {
    await ouvrir(page);
    const p = await page.evaluate(() => ({
      largeur: window.Postcard.largeur,
      hauteur: window.Postcard.hauteur,
      imageLargeur: window.Postcard.imageLargeur,
      imageHauteur: window.Postcard.imageHauteur,
    }));
    expect(p.imageLargeur).toBe(p.largeur);
    expect(p.imageHauteur).toBeGreaterThan(0);
    expect(p.imageHauteur).toBeLessThan(p.hauteur);
  });

});
