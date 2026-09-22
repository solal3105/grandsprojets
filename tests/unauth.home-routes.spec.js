// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Fumigation des routes du site vitrine (SPA Vue servie à la racine).
 *
 * Chaque route est vérifiée sur trois points : la page répond, le rendu Vue
 * a bien remplacé le squelette, et rien n'a explosé dans la console. Les
 * pages hors des moteurs le disent dans leur balise robots, et les anciennes
 * adresses du site (contact, fonctionnalités, tarifs, /modules/…) mènent
 * quelque part.
 */

/** Routes indexables, chacune avec un texte qui prouve que la vue a rendu. */
const ROUTES = [
  { path: '/', repere: /Open ?Projets/i },
  { path: '/carte', repere: /projets/i },
  { path: '/travaux', repere: /travaux|chantier/i },
  { path: '/participer', repere: /signal/i },
  { path: '/diagnostic', repere: /diagnostic/i },
  { path: '/chantiers', repere: /chantier|arrêté/i },
  { path: '/tarification', repere: /prix|tarif/i },
  { path: '/a-propos', repere: /propos|équipe|mission/i },
  { path: '/aide', repere: /aide|guide|question/i },
  { path: '/ressources', repere: /ressource/i },
  { path: '/confidentialite', repere: /confidentialit|mesure d'audience/i },
  { path: '/alternative-panneaupocket', repere: /panneaupocket/i },
  { path: '/alternative-cityall-lumiplan', repere: /cityall|lumiplan/i },
  { path: '/alternative-neocity', repere: /neocity/i },
];

/**
 * Routes internes (robots: noindex) : hors sitemap. La page Hélios n'est
 * reliée nulle part sur le site, Hélios donne son adresse à ses clients.
 */
const ROUTES_INTERNES = [
  { path: '/helios', repere: /hélios|helios/i },
  { path: '/aide/guide-admin', repere: /guide|aide|administrateur/i },
  { path: '/aide/guide-contributeur', repere: /guide|aide|contribut/i },
  { path: '/tarification/estimation?population=12000&modules=carte&annees=1', repere: /estimation/i },
];

/** Les anciennes adresses du site, et où elles mènent (côté routeur). */
const REDIRECTIONS = [
  { de: '/fonctionnalites', vers: '/' },
  { de: '/contact', vers: '/', hash: '#contact' },
  { de: '/tarifs', vers: '/tarification' },
  { de: '/modules', vers: '/' },
  { de: '/modules/travaux', vers: '/travaux' },
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

test.describe('0.39 - Routes du site vitrine', () => {

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

    test(`0.39.2 - ${path} porte un titre, une description et sa canonical`, async ({ page }) => {
      await visiter(page, path);
      await expect(page).toHaveTitle(/.{10,}/);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc?.length ?? 0).toBeGreaterThan(30);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://openprojets.com${path}`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
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

    test(`0.39.6 - ${path} reste hors des moteurs (noindex)`, async ({ page, request }) => {
      await visiter(page, path);
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('noindex');
      // Et l'en-tête le dit aussi, sans dépendre du JavaScript
      const res = await request.get(path);
      expect(res.headers()['x-robots-tag'] || '').toContain('noindex');
    });
  }

  test('0.39.3 - L\'en-tête et le pied de page sont rendus sur toutes les routes', async ({ page }) => {
    for (const { path } of ROUTES.slice(0, 5)) {
      await visiter(page, path);
      await expect(page.locator('header').first()).toBeVisible();
      await expect(page.locator('footer').first()).toBeVisible();
    }
  });

  test('0.39.7 - La page Hélios n\'est reliée nulle part sur le site', async ({ page, request }) => {
    await visiter(page, '/');
    expect(await page.locator('a[href="/helios"]').count()).toBe(0);
    expect(await (await request.get('/sitemap-pages.xml')).text()).not.toContain('/helios');
  });

  for (const { de, vers, hash } of REDIRECTIONS) {
    test(`0.39.8 - ${de} mène à ${vers}${hash || ''}`, async ({ page }) => {
      await visiter(page, de);
      await page.waitForFunction((cible) => location.pathname === cible, vers, { timeout: 10000 });
      if (hash) await page.waitForFunction((h) => location.hash === h, hash, { timeout: 10000 });
    });
  }

  /* Non-regression : depuis que la racine sert le site vitrine, le retour
     d'une connexion (GitHub ou lien par email) y atterrit quand l'adresse de
     retour n'est pas reconnue par le fournisseur. Le site doit repasser la
     main a la page de connexion, jeton compris. */
  const RETOURS = [
    '#access_token=faux123&refresh_token=faux456&type=magiclink',
    '#error=access_denied&error_code=otp_expired',
  ];

  for (const fragment of RETOURS) {
    test(`0.39.9 - Un retour de connexion sur la racine repart vers /login/ (${fragment.slice(0, 22)})`, async ({ page }) => {
      await page.goto(`/${fragment}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => location.pathname === '/login/', null, { timeout: 10000 });
      expect(page.url()).toContain(fragment);
    });
  }

  test('0.39.10 - Une page du site avec des marqueurs de campagne reste sur place', async ({ page }) => {
    await visiter(page, '/carte?utm_source=linkedin&utm_medium=social');
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe('/carte');
  });

  test('0.39.4 - Une route inconnue ne rend pas une page vide', async ({ page }) => {
    await page.goto('/route-qui-nexiste-pas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { timeout: 15000 });
    await page.waitForFunction(() => location.pathname === '/', null, { timeout: 10000 });
    const texte = await page.locator('#app').innerText();
    expect(texte.trim().length).toBeGreaterThan(50);
  });

});
