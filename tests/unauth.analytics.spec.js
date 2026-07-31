// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Mesure d'audience PostHog - module partagé modules/analytics.js
 *
 * Ce que ces tests garantissent :
 *  - le module est bien chargé sur chaque espace, avec le bon identifiant d'espace ;
 *  - AUCUN événement n'est émis depuis un navigateur piloté (Playwright, prérendu
 *    du home) : sans ce garde-fou, chaque exécution de la suite fausserait les
 *    statistiques de production ;
 *  - le refus du visiteur est enregistré et respecté.
 */

/** Espaces publics branchés, avec l'identifiant attendu. L'admin, inaccessible
 *  sans session, est couvert par tests/admin.boot-nav.spec.js. */
const SPACES = [
  { n: 1, path: '/', space: 'carte' },
  { n: 2, path: '/demo/', space: 'demo' },
  { n: 3, path: '/fiche/', space: 'fiche' },
  { n: 4, path: '/login/', space: 'login' },
  { n: 5, path: '/logout/', space: 'logout' },
  { n: 6, path: '/carte-postale/', space: 'carte-postale' },
  { n: 7, path: '/ville/', space: 'ville' },
  { n: 8, path: '/home/', space: 'home' },
];

/** SPA : leurs pages vues sont émises par leur routeur, jamais automatiquement. */
const SPA = [
  { n: 1, path: '/home/', space: 'home' },
];

/** Attend que le module partagé se soit exposé sur window. */
async function waitForAnalytics(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.OPAnalytics, null, { timeout: 15000 });
}

test.describe('15.1 Mesure d\'audience - chargement par espace', () => {
  for (const { n, path, space } of SPACES) {
    test(`15.1.${n} ${path} charge le module avec l'espace "${space}"`, async ({ page }) => {
      await waitForAnalytics(page, path);
      expect(await page.evaluate(() => window.OPAnalytics.space())).toBe(space);
    });
  }

  for (const { n, path, space } of SPA) {
    // Sans cet attribut, PostHog compterait la page d'entrée en plus de celle
    // qu'émet le routeur : toutes les sessions de la SPA seraient doublées.
    test(`15.1.${8 + n} ${path} (${space}) déclare ses pages vues en manuel`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const attr = await page.getAttribute('script[data-op-space]', 'data-op-pageview');
      expect(attr).toBe('manual');
    });
  }

  test('15.1.10 le module précède le bundle applicatif du home', async ({ page }) => {
    // Les scripts différés s'exécutent dans l'ordre du document : si la balise
    // arrive après le bundle Vue, la page vue initiale de /home/ est perdue.
    await page.goto('/home/', { waitUntil: 'domcontentloaded' });
    const ordre = await page.evaluate(() => {
      const scripts = [...document.head.querySelectorAll('script[src]')];
      return {
        analytics: scripts.findIndex(s => s.src.includes('/modules/analytics.js')),
        bundle: scripts.findIndex(s => s.type === 'module'),
      };
    });
    expect(ordre.analytics).toBeGreaterThanOrEqual(0);
    expect(ordre.bundle).toBeGreaterThanOrEqual(0);
    expect(ordre.analytics).toBeLessThan(ordre.bundle);
  });
});

test.describe('15.2 Mesure d\'audience - garde-fous', () => {
  test('15.2.1 aucun événement n\'est émis depuis un navigateur piloté', async ({ page }) => {
    // Toute requête vers le proxy PostHog est une fuite de données de test.
    const captures = [];
    await page.route('**/ph/**', (route) => {
      captures.push(route.request().url());
      return route.abort();
    });

    await waitForAnalytics(page, '/');
    await page.evaluate(() => window.OPAnalytics.capture('test_ne_doit_jamais_partir'));
    await page.waitForTimeout(1000);

    expect(await page.evaluate(() => window.OPAnalytics.isEnabled())).toBe(false);
    expect(captures).toEqual([]);
  });

  test('15.2.2 le motif est bien le pilotage du navigateur, pas un effet de bord', async ({ page }) => {
    // Assertion volontairement exacte : c'est elle qui prouve que le garde-fou
    // navigator.webdriver est le PREMIER évalué. Si on le retirait, le motif
    // deviendrait un autre (clé absente, environnement local) et ce test
    // tomberait, au lieu de rester vert par accident.
    await waitForAnalytics(page, '/');
    expect(await page.evaluate(() => window.OPAnalytics.disabledReason()))
      .toBe('navigateur piloté (tests ou prérendu)');
  });

  test('15.2.3 aucun script tiers de mesure n\'est chargé', async ({ page }) => {
    const thirdParty = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/i\.posthog\.com|posthog-assets/.test(url)) thirdParty.push(url);
    });
    await waitForAnalytics(page, '/');
    await page.waitForTimeout(500);
    expect(thirdParty).toEqual([]);
  });
});

test.describe('15.3 Mesure d\'audience - refus du visiteur', () => {
  test('15.3.1 ?tracking=off enregistre le refus', async ({ page }) => {
    await waitForAnalytics(page, '/?tracking=off');
    expect(await page.evaluate(() => window.OPAnalytics.isOptedOut())).toBe(true);
    expect(await page.evaluate(() => window.OPAnalytics.isEnabled())).toBe(false);
  });

  test('15.3.2 le refus persiste d\'une page à l\'autre', async ({ page }) => {
    await waitForAnalytics(page, '/?tracking=off');
    await waitForAnalytics(page, '/fiche/');
    expect(await page.evaluate(() => window.OPAnalytics.isOptedOut())).toBe(true);
  });

  test('15.3.3 ?tracking=on lève le refus', async ({ page }) => {
    await waitForAnalytics(page, '/?tracking=off');
    await waitForAnalytics(page, '/?tracking=on');
    expect(await page.evaluate(() => window.OPAnalytics.isOptedOut())).toBe(false);
  });

  test('15.3.4 optOut() puis optIn() bascule l\'état stocké', async ({ page }) => {
    await waitForAnalytics(page, '/');
    await page.evaluate(() => window.OPAnalytics.optOut());
    expect(await page.evaluate(() => window.OPAnalytics.isOptedOut())).toBe(true);
    await page.evaluate(() => window.OPAnalytics.optIn());
    expect(await page.evaluate(() => window.OPAnalytics.isOptedOut())).toBe(false);
  });
});

test.describe('15.4 Page de confidentialité', () => {
  test('15.4.1 la page expose le bouton de refus et reflète l\'état', async ({ page }) => {
    await page.goto('/home/confidentialite', { waitUntil: 'domcontentloaded' });

    const bouton = page.getByRole('button', { name: /mesure d'audience/i });
    await expect(bouton).toBeVisible({ timeout: 15000 });
    await expect(bouton).toHaveText(/Refuser la mesure d'audience/);

    await bouton.click();
    await expect(bouton).toHaveText(/Réactiver la mesure d'audience/);
    expect(await page.evaluate(() => localStorage.getItem('op_analytics_optout'))).toBe('1');

    await bouton.click();
    await expect(bouton).toHaveText(/Refuser la mesure d'audience/);
    expect(await page.evaluate(() => localStorage.getItem('op_analytics_optout'))).toBeNull();
  });

  test('15.4.2 la page est atteignable depuis le pied de page du home', async ({ page }) => {
    await page.goto('/home/', { waitUntil: 'domcontentloaded' });
    const lien = page.locator('footer a[href="/home/confidentialite"]').first();
    await expect(lien).toBeVisible({ timeout: 15000 });
  });
});
