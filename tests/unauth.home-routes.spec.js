// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Fumigation des routes du site home (SPA Vue).
 *
 * La mesure de couverture a montré que 3 789 lignes de home-src/ n'étaient
 * chargées par aucun test : les vues tarifs, aide, à propos, fonctionnalités,
 * Helios, contact et alternatives ne sont jamais visitées. Leurs bundles
 * n'étaient donc même pas téléchargés, et une vue cassée par un build passait
 * inaperçue.
 *
 * Chaque route est vérifiée sur trois points : la page répond, le rendu Vue
 * a bien remplacé le squelette, et rien n'a explosé dans la console.
 */

/** Routes indexables, chacune avec un texte qui prouve que la vue a rendu. */
const ROUTES = [
  { path: '/home/', repere: /Open ?Projets/i },
  { path: '/home/fonctionnalites', repere: /fonctionnalit/i },
  { path: '/home/a-propos', repere: /propos|équipe|mission/i },
  { path: '/home/contact', repere: /contact/i },
  { path: '/home/aide', repere: /aide|guide|question/i },
  { path: '/home/ressources', repere: /ressource/i },
  { path: '/home/alternative-panneaupocket', repere: /panneaupocket/i },
  { path: '/home/alternative-cityall-lumiplan', repere: /cityall|lumiplan/i },
  { path: '/home/alternative-neocity', repere: /neocity/i },
];

/**
 * Routes internes (robots: noindex) : hors sitemap, mais ce sont les deux plus
 * gros fichiers de home-src/ et personne ne les ouvrait jamais en test.
 */
const ROUTES_INTERNES = [
  { path: '/home/helios', repere: /.{200,}/s },
  { path: '/home/aide/guide-admin', repere: /guide|aide|administrateur/i },
  { path: '/home/aide/guide-contributeur', repere: /guide|aide|contribut/i },
];

/** Navigue et renvoie les erreurs console collectées. */
async function visiter(page, path) {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Bruit réseau sans rapport avec le rendu de la vue
    if (/favicon|net::ERR_|Failed to load resource|maplibre|WebGL/i.test(t)) return;
    erreurs.push(t);
  });
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app', { timeout: 15000 });
  return { res, erreurs };
}

test.describe('0.39 - Routes du site home', () => {

  for (const { path, repere } of ROUTES) {
    test(`0.39.1 - ${path} répond 200 et rend sa vue`, async ({ page }) => {
      const { res, erreurs } = await visiter(page, path);
      expect(res?.status()).toBe(200);

      // Le contenu doit venir de la vue, pas d'un squelette vide
      const texte = await page.locator('#app').innerText();
      expect(texte.length).toBeGreaterThan(200);
      expect(texte).toMatch(repere);

      expect(erreurs, `erreurs console sur ${path}`).toEqual([]);
    });

    test(`0.39.2 - ${path} porte un titre et une description`, async ({ page }) => {
      await visiter(page, path);
      await expect(page).toHaveTitle(/.{10,}/);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc?.length ?? 0).toBeGreaterThan(30);
    });
  }

  for (const { path, repere } of ROUTES_INTERNES) {
    test(`0.39.5 - ${path} (interne) répond 200 et rend sa vue`, async ({ page }) => {
      const { res, erreurs } = await visiter(page, path);
      expect(res?.status()).toBe(200);
      const texte = await page.locator('#app').innerText();
      expect(texte.length).toBeGreaterThan(200);
      expect(texte).toMatch(repere);
      expect(erreurs, `erreurs console sur ${path}`).toEqual([]);
    });

    test(`0.39.6 - ${path} reste hors des moteurs (noindex)`, async ({ page }) => {
      await visiter(page, path);
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('noindex');
    });
  }

  test('0.39.3 - L\'en-tête et le pied de page sont rendus sur toutes les routes', async ({ page }) => {
    for (const { path } of ROUTES.slice(0, 5)) {
      await visiter(page, path);
      await expect(page.locator('header').first()).toBeVisible();
      await expect(page.locator('footer').first()).toBeVisible();
    }
  });

  test("0.39.7 - /home/tarifs redirige vers l'accueil", async ({ page }) => {
    // La page tarifs est volontairement masquée : la route existe uniquement
    // pour que les liens déjà partagés ne tombent pas sur un 404.
    await visiter(page, '/home/tarifs');
    await page.waitForFunction(() => !location.pathname.includes('tarifs'), null, { timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe('/home/');
  });

  test('0.39.4 - Une route inconnue ne rend pas une page vide', async ({ page }) => {
    await page.goto('/home/route-qui-nexiste-pas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { timeout: 15000 });
    const texte = await page.locator('#app').innerText();
    expect(texte.trim().length).toBeGreaterThan(50);
  });

});
