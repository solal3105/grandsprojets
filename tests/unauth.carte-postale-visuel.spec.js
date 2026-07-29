// @ts-check
/**
 * Banc VISUEL de l'outil carte postale.
 *
 * Il pilote le vrai outil et capture chaque état, plus l'image d'impression
 * composée en 300 points par pouce. C'est le seul moyen de juger un objet dont
 * tout l'intérêt est l'apparence.
 *
 * Hors suite par défaut.
 * Lancement : CP_VISUEL=1 npx playwright test tests/unauth.carte-postale-visuel.spec.js
 * Captures   : test-results/carte-postale/
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SORTIE = path.join(process.cwd(), 'test-results', 'carte-postale');

test.skip(!process.env.CP_VISUEL, 'Banc visuel : lancer avec CP_VISUEL=1');
test.use({ viewport: { width: 1500, height: 1000 } });
test.setTimeout(180000);

const COMMUNE = {
  nom: 'Bourgoin-Jallieu',
  code: '38053',
  population: 28000,
  departement: { nom: 'Isère' },
  centre: { type: 'Point', coordinates: [5.2745, 45.5866] },
};

test.beforeAll(() => fs.mkdirSync(SORTIE, { recursive: true }));

async function ouvrir(page) {
  await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([COMMUNE]),
  }));
  await page.goto('/carte-postale/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
}

async function entrerDansAtelier(page) {
  await page.locator('#commune').fill('Bourgoin');
  await page.locator('#suggestions li').first().click();
  await expect(page.locator('#etape-atelier')).toHaveClass(/is-actif/);
  // La plongée dure quelques secondes, puis les tuiles IGN arrivent
  await page.waitForTimeout(11000);
}

test('01 - ecran d accueil, la carte postale flotte au centre', async ({ page }) => {
  await ouvrir(page);
  await page.mouse.move(1150, 320);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SORTIE}/01-accueil.png` });
  await expect(page.locator('#carte-postale')).toBeVisible();
});

test('02 - atelier, vue aerienne 1950-1965', async ({ page }) => {
  await ouvrir(page);
  await entrerDansAtelier(page);
  await page.screenshot({ path: `${SORTIE}/02-atelier-1950.png` });
  await page.locator('#carte-postale').screenshot({ path: `${SORTIE}/02b-objet.png` });
});

test('03 - changement d epoque : Cassini puis aujourd hui', async ({ page }) => {
  await ouvrir(page);
  await entrerDansAtelier(page);
  await page.locator('.epoque[data-id="cassini"]').click();
  await page.waitForTimeout(9000);
  await page.locator('#carte-postale').screenshot({ path: `${SORTIE}/03a-cassini.png` });
  // Le fond doit avoir changé d'époque en même temps que la carte postale :
  // sinon la fenêtre et le paysage racontent deux histoires différentes.
  await page.screenshot({ path: `${SORTIE}/03c-cassini-page.png` });
  await page.locator('.epoque[data-id="aujourdhui"]').click();
  await page.waitForTimeout(9000);
  await page.locator('#carte-postale').screenshot({ path: `${SORTIE}/03b-aujourdhui.png` });
});

/* Trois largeurs : le poste du stand, un portable, un telephone. */
for (const [nom, l, h] of [['1500', 1500, 1000], ['1180', 1180, 820], ['430', 430, 900]]) {
  test(`05 - responsive ${nom}`, async ({ page }) => {
    await page.setViewportSize({ width: l, height: h });
    await ouvrir(page);
    await entrerDansAtelier(page);
    await page.screenshot({ path: `${SORTIE}/05-responsive-${nom}.png`, fullPage: l < 1100 });
  });
}

/**
 * Le rendu qui compte vraiment : l'image composée à 300 points par pouce,
 * celle qui part à l'imprimante et au téléchargement.
 */
test('04 - image d impression 300 dpi', async ({ page }) => {
  await ouvrir(page);
  await entrerDansAtelier(page);
  await page.locator('#inscription').fill('Bourgoin-Jallieu, vue du ciel, 1950 - 1965');
  await page.waitForTimeout(400);

  const dataUrl = await page.evaluate(async () => {
    const image = await window.Scene.capturer(window.Postcard.imageLargeur, window.Postcard.imageHauteur);
    const c = await window.Postcard.composer({
      imageCarte: image,
      inscription: document.getElementById('inscription').value,
      punchline: window.Epoques.punchline(window.Epoques.liste.find((e) => e.id === 'photo-1950'), new Date().getFullYear()),
      telephone: '06 12 34 56 78',
      cibleQr: 'https://openprojets.com/demo/',
    });
    return { url: c.toDataURL('image/png'), l: c.width, h: c.height };
  });

  expect(dataUrl.l).toBe(1181);
  expect(dataUrl.h).toBe(1772);
  fs.writeFileSync(`${SORTIE}/04-impression-300dpi.png`, Buffer.from(dataUrl.url.split(',')[1], 'base64'));
});
