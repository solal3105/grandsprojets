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
  await page.route('**/data.geopf.fr/geocodage/search?*', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ features: communes.map((city) => ({
      type: 'Feature', geometry: city.centre,
      properties: { name: city.nom, label: city.nom, city: city.nom, citycode: city.code,
        population: city.population, context: city.departement?.nom, type: 'municipality' },
    })) }),
  }));
  await page.goto('/carte-postale/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Epoques && window.Postcard, null, { timeout: 15000 });
}

/** Saisit une commune et entre dans l'atelier (sans attendre les tuiles). */
async function entrer(page, saisie = 'Bourgoin') {
  await page.locator('#address').fill(saisie);
  await page.locator('#address-results [role="option"]').first().waitFor({ timeout: 5000 });
  await page.locator('#address-results [role="option"]').first().click();
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

  test('0.41.1 - Trois caractères suffisent à faire apparaître les suggestions', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#address').fill('Bou');
    const items = page.locator('#address-results [role="option"]');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Bourgoin-Jallieu');
    await expect(items.first()).toContainText('Isère');
  });

  test('0.41.2 - Un seul caractère ne déclenche aucune suggestion', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#address').fill('B');
    await page.waitForTimeout(500);
    await expect(page.locator('#address-results')).toBeHidden();
  });

  test('0.41.3 - Échap referme la liste', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#address').fill('Bourgoin');
    await page.locator('#address-results [role="option"]').first().waitFor({ timeout: 5000 });
    await page.locator('#address').press('Escape');
    await expect(page.locator('#address-results')).toBeHidden();
  });

  test('0.41.4 - Flèche bas puis Entrée sélectionne la deuxième commune', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#address').fill('Bourg');
    await page.locator('#address-results [role="option"]').first().waitFor({ timeout: 5000 });
    await page.locator('#address').press('ArrowDown');
    await page.locator('#address').press('ArrowDown');
    await page.locator('#address').press('Enter');
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
    await page.locator('#address').fill('Piegee');
    await page.locator('#address-results [role="option"]').first().waitFor({ timeout: 5000 });
    expect(await page.locator('#address-results [role="option"] img').count()).toBe(0);
    expect(await page.locator('#address-results [role="option"] b').count()).toBe(0);
    await page.locator('#address-results [role="option"]').first().click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('0.41.6 - Une panne de l\'annuaire ne casse pas la page', async ({ page }) => {
    await page.route('**/geo.api.gouv.fr/**', (route) => route.abort());
    await page.route('**/data.geopf.fr/**', (route) => route.abort());
    await page.goto('/carte-postale/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Epoques, null, { timeout: 15000 });
    await page.locator('#address').fill('Bourgoin');
    await page.waitForTimeout(600);
    await expect(page.locator('#address-results')).toBeHidden();
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrir(page);
    await entrer(page);
    await page.evaluate(() => document.fonts.ready);
    const cassini = page.locator('.epoque[data-id="cassini"]');
    await cassini.scrollIntoViewIfNeeded();
    const before = await cassini.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    // Quitter le champ de recherche ne doit pas déplacer le bouton sous le curseur.
    expect(await cassini.boundingBox()).toEqual(before);
    await page.mouse.up();
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

  test("0.42.6 - L'image d'impression sort en 1181 x 1748 (300 dpi)", async ({ page }) => {
    await ouvrir(page);
    const dims = await page.evaluate(async () => {
      const c = await window.Postcard.composer({
        imageCarte: null,
        inscription: 'Bourgoin-Jallieu, 1950 - 1965',
        punchline: window.Epoques.punchline({ annee: 1957 }, 2026),
      });
      return { l: c.width, h: c.height, type: c.toDataURL('image/png').slice(0, 22) };
    });
    expect(dims.l).toBe(1181);
    expect(dims.h).toBe(1748);
    expect(dims.type).toBe('data:image/png;base64,');
  });

  test('0.42.7 - La composition tient sans image ni inscription', async ({ page }) => {
    await ouvrir(page);
    const ok = await page.evaluate(async () => {
      try {
        const c = await window.Postcard.composer({
          imageCarte: null, inscription: '', punchline: '',
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

  test('0.42.9 - Le bandeau affiche le contact et un QR local vers le site', async ({ page }) => {
    await ouvrir(page);
    await entrer(page);
    await expect(page.locator('#cp-email')).toHaveText('contact@vazy.app');
    await expect(page.locator('#cp-email')).toHaveAttribute('href', 'mailto:contact@vazy.app');
    await expect(page.locator('#cp-phone')).toHaveText('07 60 77 16 13');
    await expect(page.locator('#cp-phone')).toHaveAttribute('href', 'tel:0760771613');
    await expect(page.locator('#cp-qr-link')).toHaveAttribute('href', 'https://openprojets.com/l/carte-postale');
    await expect(page.locator('#cp-qr-img')).toHaveAttribute('src', '/carte-postale/qr-carte-postale.svg');
    await expect(page.locator('#cp-punchline')).toHaveText(
      `Cette carte a ${new Date().getFullYear() - 1957} ans.À vous d'écrire la suite.`,
    );
    await expect(page.locator('.cp__bandeau')).not.toContainText("Publiez vos projets");
    await expect(page.locator('.cp__bandeau')).not.toContainText('/demo');
    await expect(page.locator('.cp__qr .cp__site')).toHaveText('openprojets.com');
    await expect(page.locator('.cp__mots')).not.toContainText('openprojets.com');
    await expect(page.locator('.cp__qr')).not.toContainText('Découvrez');
    // Le service QR externe est bloqué par ouvrir(), le SVG local doit rester lisible.
    await expect.poll(() => page.locator('#cp-qr-img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test('0.42.10 - Le contact est aussi peint dans la carte imprimée', async ({ page }) => {
    await ouvrir(page);
    const painted = await page.evaluate(async () => {
      const texts = [];
      const bounds = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        texts.push(text);
        const metrics = this.measureText(text);
        bounds.push({ text, bottom: args[1] + metrics.actualBoundingBoxDescent });
        return original.call(this, text, ...args);
      };
      try {
        await window.Postcard.composer({
          imageCarte: null, inscription: 'Bourgoin-Jallieu',
          punchline: window.Epoques.punchline({ annee: 1957 }, 2026),
        });
        return { texts, bounds, height: window.Postcard.hauteur };
      } finally {
        CanvasRenderingContext2D.prototype.fillText = original;
      }
    });
    expect(painted.texts).toEqual(expect.arrayContaining([
      'Cette carte a 69 ans.', "À vous d'écrire la suite.", 'contact@vazy.app', '07 60 77 16 13', 'openprojets.com',
    ]));
    expect(painted.texts.join(' ')).not.toMatch(/Publiez vos projets|\/demo|Découvrez|le site\./);
    // Au moins 5 mm sous toute information, descendantes des lettres comprises.
    for (const { text, bottom } of painted.bounds) {
      expect(painted.height - bottom, `Marge basse sous « ${text} »`).toBeGreaterThanOrEqual(5 * 300 / 25.4);
    }
  });

  for (const width of [1400, 430]) {
    test(`0.42.11 - Une seule page de 100 x 148 mm, écran de ${width} px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 950 });
      await ouvrir(page);
      await page.evaluate(async () => {
        window.print = () => {};
        const canvas = await window.Postcard.composer({
          imageCarte: null, inscription: 'Bourgoin-Jallieu',
          punchline: window.Epoques.punchline({ annee: 1957 }, 2026),
        });
        await window.Postcard.imprimer(canvas);
      });
      await page.clock.install();
      await page.clock.fastForward(2000);
      // L'image ne disparaît pas pendant le choix du papier dans le dialogue.
      await expect(page.locator('#sortie')).toHaveJSProperty('hidden', false);
      await expect(page.locator('#sortie-img')).toHaveJSProperty('naturalHeight', 1748);
      const pdf = await page.pdf({
        path: testInfo.outputPath('carte-postale.pdf'),
        preferCSSPageSize: true,
        printBackground: true,
      });
      const content = pdf.toString('latin1');
      expect(content.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
      const mediaBox = content.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
      expect(mediaBox).not.toBeNull();
      // Chromium arrondit les dimensions au pixel CSS avant l'écriture du PDF.
      expect(Math.abs(Number(mediaBox[1]) * 25.4 / 72 - 100)).toBeLessThan(0.3);
      expect(Math.abs(Number(mediaBox[2]) * 25.4 / 72 - 148)).toBeLessThan(0.3);
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await expect(page.locator('#sortie')).toHaveJSProperty('hidden', true);
    });
  }

  test('0.42.12 - Un QR absent empêche une impression incomplète', async ({ page }) => {
    await ouvrir(page);
    await page.route('**/qr-carte-postale.svg', (route) => route.abort());
    const message = await page.evaluate(async () => {
      try {
        await window.Postcard.composer({ imageCarte: null, inscription: '', punchline: '' });
        return null;
      } catch (error) { return error.message; }
    });
    expect(message).toContain('QR code');
  });

  for (const [width, pitch, bearing] of [[1400, 0, 0], [1400, 52, -18], [430, 70, 24]]) {
    test(`0.42.13 - Le cadrage reste identique pendant l'export (${width} px, ${pitch} degrés)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 950 });
      // Accès à la vraie carte dans ce test seulement, sans changer son moteur.
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
      await ouvrir(page);
      await page.waitForFunction(() => window.postcardTestMap?.loaded());
      const capture = await page.evaluate(async ({ pitch, bearing }) => {
        const map = window.postcardTestMap;
        map.jumpTo({ center: [4.908, 45.762], zoom: 15.2, pitch, bearing });
        const sample = () => {
          const { clientWidth: w, clientHeight: h } = map.getContainer();
          return {
            width: w, height: h, center: map.getCenter().toArray(),
            zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(),
            // Ces points géographiques doivent occuper exactement les mêmes
            // places dans l'image, y compris avec une perspective rasante.
            landmarks: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]]
              .map(([x, y]) => map.unproject([x * w, y * h]).toArray()),
          };
        };
        const before = sample();
        const ratio = map.getPixelRatio();
        const canvas = map.getCanvas();
        const original = canvas.toDataURL;
        let during;
        canvas.toDataURL = function (...args) {
          during = sample();
          return original.apply(this, args);
        };
        try {
          const dataUrl = await window.Scene.capturer(window.Postcard.imageLargeur, window.Postcard.imageHauteur);
          const image = new Image();
          image.src = dataUrl;
          await image.decode();
          const after = sample();
          const restoredRatio = map.getPixelRatio();
          // Une relecture refusée ne doit pas laisser le rendu en haute densité.
          canvas.toDataURL = () => { throw new Error('Échec simulé de la capture'); };
          const failed = await window.Scene.capturer(window.Postcard.imageLargeur, window.Postcard.imageHauteur);
          return {
            before, during, after, ratio, restoredRatio, failed,
            failedRatio: map.getPixelRatio(), afterFailure: sample(),
            imageWidth: image.naturalWidth, imageHeight: image.naturalHeight,
          };
        } finally {
          canvas.toDataURL = original;
        }
      }, { pitch, bearing });
      expect(capture.during).toEqual(capture.before);
      expect(capture.after).toEqual(capture.before);
      expect(capture.afterFailure).toEqual(capture.before);
      expect(capture.restoredRatio).toBe(capture.ratio);
      expect(capture.failedRatio).toBe(capture.ratio);
      expect(capture.failed).toBeNull();
      // Le cadrage reste fixe mais l'image gagne bien en définition.
      expect(capture.imageWidth).toBeGreaterThanOrEqual(1180);
      expect(capture.imageHeight).toBeGreaterThanOrEqual(1223);
    });
  }

  test('0.42.14 - Le téléphone et la source gardent leur marge de sécurité', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrir(page);
    await entrer(page);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 430, 1180, 1400]) {
      await page.setViewportSize({ width, height: 950 });
      await expect.poll(() => page.evaluate(() => (
        document.querySelector('.cp__credit').getBoundingClientRect().top
        - document.getElementById('cp-phone').getBoundingClientRect().bottom
      )), { message: `Téléphone et mention IGN à ${width} px` }).toBeGreaterThan(0);
      const margin = await page.evaluate(() => {
        const card = document.querySelector('.cp__objet').getBoundingClientRect();
        const credit = document.querySelector('.cp__credit').getBoundingClientRect();
        return (card.bottom - credit.bottom) / card.width * 100;
      });
      expect(margin, `Marge basse de la source à ${width} px`).toBeGreaterThanOrEqual(4.99);
      if (width === 430 || width === 1400) {
        await page.locator('#carte-postale').screenshot({ path: testInfo.outputPath(`marge-source-${width}.png`) });
      }
    }
  });

});

test.describe('0.43 - Carte postale : mouvement au survol', () => {
  const readTilt = (page) => page.locator('.cp__objet').evaluate((element) => ({
    x: parseFloat(element.style.getPropertyValue('--rx')) || 0,
    y: parseFloat(element.style.getPropertyValue('--ry')) || 0,
  }));
  const expectFlat = (page) => expect.poll(() => readTilt(page)).toEqual({ x: 0, y: 0 });

  test('0.43.1 - La rotation suit le centre de la carte et revient à plat à la sortie', async ({ page }, testInfo) => {
    await ouvrir(page);
    const box = await page.locator('#carte-postale').boundingBox();
    await page.mouse.move(1380, 20);
    await expectFlat(page);
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.15);
    await expect.poll(async () => (await readTilt(page)).y).toBeGreaterThan(3);
    const upperRight = await readTilt(page);
    expect(upperRight.x).toBeGreaterThan(2);
    expect(upperRight.x).toBeLessThanOrEqual(4);
    expect(upperRight.y).toBeLessThanOrEqual(5);
    await page.screenshot({ path: testInfo.outputPath('rotation-haut-droite.png') });

    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.85);
    await expect.poll(async () => (await readTilt(page)).y).toBeLessThan(-3);
    expect((await readTilt(page)).x).toBeLessThan(-2);
    await page.screenshot({ path: testInfo.outputPath('rotation-bas-gauche.png') });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => Math.abs((await readTilt(page)).y)).toBeLessThan(0.05);
    await expect.poll(async () => Math.abs((await readTilt(page)).x)).toBeLessThan(0.05);

    await page.mouse.move(1380, 20);
    await expectFlat(page);
    await expect(page.locator('#carte-postale')).not.toHaveClass(/is-tilting/);
  });

  test('0.43.2 - Le zoom et le glisser gardent la carte à plat pendant le cadrage', async ({ page }) => {
    await ouvrir(page);
    await entrer(page);
    const box = await page.locator('#carte-postale').boundingBox();
    const x = box.x + box.width * 0.8;
    const y = box.y + box.height * 0.2;
    await page.mouse.move(x, y);
    await expect.poll(async () => (await readTilt(page)).y).toBeGreaterThan(2);
    await page.mouse.wheel(0, 40);
    await expectFlat(page);
    await page.mouse.move(x - 30, y + 30);
    await expectFlat(page);

    await page.mouse.move(1380, 20);
    await page.mouse.move(x, y);
    await expect.poll(async () => (await readTilt(page)).y).toBeGreaterThan(2);
    await page.mouse.down();
    // Dès l'appui, sans attendre une transition qui fausserait les coordonnées.
    expect(await readTilt(page)).toEqual({ x: 0, y: 0 });
    await page.mouse.move(x - 60, y + 40, { steps: 5 });
    await expectFlat(page);
    await page.mouse.up();
    await page.mouse.move(x - 40, y + 20);
    await expectFlat(page);
  });

  test('0.43.3 - La préférence de mouvement réduit arrête immédiatement la rotation', async ({ page }) => {
    await ouvrir(page);
    const box = await page.locator('#carte-postale').boundingBox();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
    await expect.poll(async () => (await readTilt(page)).y).toBeGreaterThan(2);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectFlat(page);
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
    await expectFlat(page);
    await expect(page.locator('.cp__objet')).toHaveCSS('transform', 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: no-preference)').matches);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
    await expect.poll(async () => (await readTilt(page)).y).toBeGreaterThan(2);
  });

  test.describe('Écran tactile', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 900 } });

    test('0.43.4 - La carte reste à plat sans survol précis', async ({ page }) => {
      await ouvrir(page);
      const box = await page.locator('#carte-postale').boundingBox();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
      await expectFlat(page);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expectFlat(page);
    });
  });
});
