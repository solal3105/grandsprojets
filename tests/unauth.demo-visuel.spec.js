// @ts-check
/**
 * Banc d'essai VISUEL de l'écran de fin de la démo salon.
 *
 * Il n'assert presque rien : son rôle est de piloter le VRAI code (EventSource
 * remplacé par un double, puis messages SSE injectés) dans chacune des
 * variations de l'écran, et d'en produire une capture. C'est le seul moyen de
 * voir ce qu'un visiteur voit, état par état.
 *
 * Hors suite par défaut : il produit des images, il ne garde pas un contrat.
 * Lancement : DEMO_VISUEL=1 npx playwright test tests/unauth.demo-visuel.spec.js
 * Captures   : test-results/demo-done/
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SORTIE = path.join(process.cwd(), 'test-results', 'demo-done');

test.skip(!process.env.DEMO_VISUEL, 'Banc visuel : lancer avec DEMO_VISUEL=1');

// Double d'EventSource : demo.js croit parler au serveur, on lui écrit le script
const DOUBLE_SSE = () => {
  class FauxEventSource {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      window.__sse = this;
      (window.__sseUrls = window.__sseUrls || []).push(url);
    }
    close() { this.readyState = 2; }
  }
  window.EventSource = FauxEventSource;
  window.__envoyer = (obj) => {
    if (window.__sse?.onmessage) window.__sse.onmessage({ data: JSON.stringify(obj) });
  };
};

const COMMUNE = { nom: 'Oyonnax', code: '01283', population: 22000, centre: { type: 'Point', coordinates: [5.655, 46.257] } };

/** Amène l'écran jusqu'à l'état « terminé », sans aucun appel réseau réel. */
async function allerJusquAuDone(page, doneMsg, { kiosk = false } = {}) {
  await page.addInitScript(DOUBLE_SSE);
  // L'autocomplétion officielle est court-circuitée : le banc doit être hermétique
  await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(route.request().url().includes('communes?nom=') ? [COMMUNE] : COMMUNE),
  }));
  await page.route('**/api.qrserver.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    // 1x1 transparent : le QR réel n'apporte rien au jugement de mise en page
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  }));

  await page.goto(`/demo/${kiosk ? '?kiosk=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#commune-input').fill('Oyonnax');
  await page.locator('#suggestions li').first().click();
  await page.waitForFunction(() => window.__sse);
  await page.evaluate((msg) => window.__envoyer(msg), doneMsg);
  // Le survol final est sauté (pas de WebGL en headless), l'écran arrive direct
  await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
  await page.waitForTimeout(900);
}

const DONE_NEUF = {
  type: 'done',
  url: '/?city=essai-oyonnax',
  ville: 'essai-oyonnax',
  communeNom: 'Oyonnax',
  communeInsee: '01283',
  projectsCount: 27,
  stats: { sources: 34, verified: 27, precise: 22, illustrated: 15 },
};

const DONE_EXISTANT = {
  type: 'done',
  url: '/?city=essai-oyonnax',
  ville: 'essai-oyonnax',
  communeNom: 'Oyonnax',
  communeInsee: '01283',
  existing: true,
};

test.beforeAll(() => fs.mkdirSync(SORTIE, { recursive: true }));

const ECRANS = [
  { nom: '1600x1000', width: 1600, height: 1000 },
  { nom: '1080x1920-kiosque', width: 1080, height: 1920 },
  { nom: '390x844-mobile', width: 390, height: 844 },
];

for (const ecran of ECRANS) {
  test.describe(`Écran de fin - ${ecran.nom}`, () => {
    test.use({ viewport: { width: ecran.width, height: ecran.height } });

    test(`génération neuve - ${ecran.nom}`, async ({ page }) => {
      await allerJusquAuDone(page, DONE_NEUF);
      await page.locator('.done').screenshot({ path: `${SORTIE}/${ecran.nom}-neuf.png` });
    });

    test(`espace déjà généré - ${ecran.nom}`, async ({ page }) => {
      await allerJusquAuDone(page, DONE_EXISTANT);
      await page.locator('.done').screenshot({ path: `${SORTIE}/${ecran.nom}-existant.png` });
      // Le bouton de relance DOIT être là : c'est tout l'intérêt de cet état
      await expect(page.locator('#btn-regen')).toBeVisible();
    });

    test(`adresse envoyée - ${ecran.nom}`, async ({ page }) => {
      await page.route('**/api/demo-lead', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: '{"ok":true}',
      }));
      await allerJusquAuDone(page, DONE_NEUF);
      await page.locator('#lead-email').fill('maire@oyonnax.fr');
      await page.locator('#lead-submit').click();
      await expect(page.locator('#lead-thanks')).toBeVisible();
      await page.waitForTimeout(600);
      await page.locator('.done').screenshot({ path: `${SORTIE}/${ecran.nom}-merci.png` });
    });

    test(`adresse refusée - ${ecran.nom}`, async ({ page }) => {
      await allerJusquAuDone(page, DONE_NEUF);
      await page.locator('#lead-email').fill('pas-une-adresse');
      await page.locator('#lead-submit').click();
      await expect(page.locator('#lead-error')).toBeVisible();
      await page.locator('.done').screenshot({ path: `${SORTIE}/${ecran.nom}-erreur.png` });
    });

    test(`adresse passée - ${ecran.nom}`, async ({ page }) => {
      await allerJusquAuDone(page, DONE_NEUF);
      await page.locator('#lead-skip').click();
      await expect(page.locator('#lead-form')).toBeHidden();
      await page.waitForTimeout(400);
      await page.locator('.done').screenshot({ path: `${SORTIE}/${ecran.nom}-passe.png` });
    });
  });
}
