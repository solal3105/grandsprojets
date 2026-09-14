// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Les adresses du site depuis la mise en ligne du site vitrine à la racine
 * (septembre 2026) :
 *  - la carte d'une collectivité vit sur /ville/{ville}/{module}, avec son
 *    titre par ville et par module (edge carte-seo) ;
 *  - toutes les anciennes adresses partagées continuent de mener quelque part :
 *    /home/…, /home2/…, /?city=…, /default et les espaces en un seul segment.
 *
 * Les redirections Netlify (_redirects) et les edge functions tournent dans
 * `netlify dev` : ces tests les exercent réellement, sans navigateur quand
 * une requête suffit.
 */

const MAP = '/ville/metropole-lyon/carte';

/** Suit une redirection à la main : le statut et la destination, sans la suivre. */
async function redirection(request, path) {
  const res = await request.get(path, { maxRedirects: 0 });
  return { status: res.status(), vers: res.headers()['location'] || '' };
}

test.describe('0.70 - Anciennes adresses du site vitrine', () => {

  for (const [de, vers] of [
    ['/home/', '/'],
    ['/home', '/'],
    ['/home/a-propos', '/a-propos'],
    ['/home/ressources/qr-code-panneau-chantier', '/ressources/qr-code-panneau-chantier'],
    ['/home/helios', '/helios'],
    ['/home2', '/'],
    ['/home2/', '/'],
    ['/home2/tarification', '/tarification'],
    ['/home2/modules/travaux', '/travaux'],
  ]) {
    test(`0.70.1 - ${de} redirige (301) vers ${vers}`, async ({ request }) => {
      const r = await redirection(request, de);
      expect(r.status).toBe(301);
      expect(new URL(r.vers, 'http://localhost').pathname).toBe(vers);
    });
  }

  test('0.70.2 - Les anciennes images du site restent servies (courriels déjà envoyés)', async ({ request }) => {
    const r = await redirection(request, '/home/img/logos/classic_color.png');
    expect(r.status).toBe(301);
    expect(new URL(r.vers, 'http://localhost').pathname).toBe('/img/logos/classic_color.png');
    const img = await request.get('/img/logos/classic_color.png');
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toContain('image/png');
  });

  test('0.70.3 - Les pages du site sont servies prérendues, avec leurs assets', async ({ request }) => {
    const page = await request.get('/tarification');
    expect(page.status()).toBe(200);
    const html = await page.text();
    expect(html).toContain('<title>Estimez le prix pour votre collectivité | Open Projets</title>');
    const src = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
    expect(src, 'le bundle du site est référencé depuis /assets/').toBeTruthy();
    const js = await request.get(String(src));
    expect(js.status()).toBe(200);
    expect(js.headers()['content-type'] || '').toContain('javascript');
    // Le cache immuable de /assets/* vient de _headers, que netlify dev
    // n'applique pas aux fichiers : il se vérifie en production.
  });
});

test.describe('0.71 - Anciennes adresses de la carte', () => {

  for (const [de, vers] of [
    ['/?city=besancon', '/ville/besancon/carte'],
    ['/?city=default', MAP],
    ['/?city=besancon&module=travaux', '/ville/besancon/travaux'],
    ['/?city=besancon&module=inconnu', '/ville/besancon/carte'],
    ['/default', MAP],
    ['/bilan', '/ville/rassemblees/carte'],
    ['/besancon', '/ville/besancon/carte'],
  ]) {
    test(`0.71.1 - ${de} redirige (301) vers ${vers}`, async ({ request }) => {
      const r = await redirection(request, de);
      expect(r.status).toBe(301);
      const url = new URL(r.vers, 'http://localhost');
      expect(url.pathname).toBe(vers);
    });
  }

  test('0.71.1b - La barre finale sert la même carte, avec la même canonical', async ({ request }) => {
    const res = await request.get('/ville/besancon/carte/');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<link rel="canonical" href="https://openprojets.com/ville/besancon/carte">');
  });

  test('0.71.2 - Les paramètres de projet suivent la redirection', async ({ request }) => {
    const r = await redirection(request, '/?city=besancon&cat=urbanisme&project=ecoquartier-vauban');
    expect(r.status).toBe(301);
    const url = new URL(r.vers, 'http://localhost');
    expect(url.pathname).toBe('/ville/besancon/carte');
    expect(url.searchParams.get('cat')).toBe('urbanisme');
    expect(url.searchParams.get('project')).toBe('ecoquartier-vauban');
    expect(url.searchParams.has('city')).toBe(false);
  });

  test('0.71.3 - Un lien de projet sans ville était la carte de Lyon', async ({ request }) => {
    const r = await redirection(request, '/?cat=urbanisme&project=rillieux-la-pape-ville-nouvelle');
    expect(r.status).toBe(301);
    const url = new URL(r.vers, 'http://localhost');
    expect(url.pathname).toBe(MAP);
    expect(url.searchParams.get('project')).toBe('rillieux-la-pape-ville-nouvelle');
  });

  test('0.71.4 - La racine sans paramètre est le site, pas la carte', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="app"');
    expect(html).not.toContain('id="gp-sidebar"');
  });
});

test.describe('0.72 - La carte d\'une collectivité : titre par ville et par module', () => {

  test('0.72.1 - /ville/metropole-lyon/carte porte le titre, la description et la canonical de Lyon', async ({ request }) => {
    const res = await request.get(MAP);
    expect(res.status()).toBe(200);
    expect(res.headers()['x-robots-tag'] || '').toContain('index, follow');
    const html = await res.text();
    const titre = html.match(/<title>([^<]*)<\/title>/)?.[1] || '';
    expect(titre).toContain('Métropole de Lyon');
    expect(titre.length).toBeLessThanOrEqual(60);
    expect(html).toMatch(/<meta\s+name="robots"\s+content="index, follow[^"]*"/);
    expect(html).toContain(`<link rel="canonical" href="https://openprojets.com${MAP}">`);
    expect(html).toContain(`<meta property="og:url" content="https://openprojets.com${MAP}">`);
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@id":"https://openprojets.com/#organization"');
    // Le HTML de départ ne parle plus d'une ville en particulier
    expect(html).not.toContain('https://openprojets.com/home/');
  });

  test('0.72.2 - Le module travaux a son propre titre, ou renvoie vers la carte s\'il n\'est pas activé', async ({ request }) => {
    const res = await request.get('/ville/metropole-lyon/travaux', { maxRedirects: 0 });
    if (res.status() === 301) {
      expect(new URL(res.headers()['location'] || '', 'http://localhost').pathname).toBe(MAP);
      return;
    }
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1] || '').toContain('travaux');
    expect(html).toContain('<link rel="canonical" href="https://openprojets.com/ville/metropole-lyon/travaux">');
  });

  test('0.72.3 - Un espace retiré des moteurs le reste sur sa carte', async ({ request }) => {
    // france : city_branding.indexable = false depuis le 8 septembre 2026
    // (docs/seo.md). Pas test-e2e : l'écran Référencement de l'admin bascule
    // son réglage dans ses propres tests.
    const res = await request.get('/ville/france/carte');
    expect(res.status()).toBe(200);
    expect(res.headers()['x-robots-tag'] || '').toContain('noindex');
    expect(await res.text()).toMatch(/<meta\s+name="robots"\s+content="noindex, follow"/);
  });

  test('0.72.4 - Une ville inconnue ne charge aucune carte : une page hors index, avec le chemin vers les villes', async ({ request }) => {
    const res = await request.get('/ville/ville-qui-nexiste-pas-xyz/carte');
    expect(res.status()).toBe(200);
    expect(res.headers()['x-robots-tag'] || '').toContain('noindex');
    const html = await res.text();
    expect(html).toContain("Cette carte n'existe pas");
    expect(html).toContain('href="/ville/"');
    expect(html).not.toContain('id="gp-sidebar"');
  });

  test('0.72.5 - Le HTML de la carte est le même pour chaque module : scripts et styles en absolu', async ({ request }) => {
    const html = await (await request.get('/ville/test-e2e/carte')).text();
    expect(html).toContain('src="/main.js"');
    expect(html).toContain('href="/styles/00-colors.css"');
    expect(html).not.toMatch(/src="modules\//);
  });
});

test.describe('0.72b - Les scripts de la carte se chargent depuis la racine', () => {

  test('0.72.6 - Les modules chargés à la demande arrivent quel que soit le chemin de la page', async ({ page }) => {
    // Régression : quatre modules étaient demandés en chemin relatif
    // (modules/…), ce qui ne se voyait pas tant que la carte vivait à la
    // racine. Sous /ville/{ville}/carte, ils partaient chercher
    // /ville/{ville}/modules/… et recevaient du HTML.
    const refus = [];
    page.on('console', (m) => { if (/Refused to execute script/i.test(m.text())) refus.push(m.text()); });
    await page.goto('/ville/test-e2e/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.NavigationModule?.showSpecificContribution && window.SearchModule && window.GeolocationModule && window.FeatureInteractions,
      null,
      { timeout: 20000 },
    );
    expect(refus).toEqual([]);
  });
});

test.describe('0.73 - L\'adresse suit le module ouvert', () => {

  // test-e2e a le module participer activé (et pas travaux)
  test('0.73.1 - Ouvrir un module réécrit le chemin, sans entrée d\'historique', async ({ page }) => {
    await page.goto('/ville/test-e2e/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 20000 });
    const participer = page.locator('.gp-sidebar__btn--module[data-module="participer"]');
    await expect(participer).toBeVisible({ timeout: 20000 });
    const avant = await page.evaluate(() => history.length);
    await participer.click();
    await page.waitForFunction(() => location.pathname === '/ville/test-e2e/participer', null, { timeout: 10000 });
    expect(await page.evaluate(() => history.length)).toBe(avant);
  });

  test('0.73.2 - Arriver sur /ville/{ville}/participer ouvre le module', async ({ page }) => {
    await page.goto('/ville/test-e2e/participer', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 20000 });
    const participer = page.locator('.gp-sidebar__btn--module[data-module="participer"]');
    await expect(participer).toHaveClass(/active/, { timeout: 20000 });
    await expect(page.locator('#nav-panel')).toHaveAttribute('data-module', 'participer');
    // L'adresse reste celle du module
    expect(new URL(page.url()).pathname).toBe('/ville/test-e2e/participer');
  });

  test('0.73.3 - Un module non activé sur la ville renvoie vers sa carte', async ({ request }) => {
    const res = await request.get('/ville/test-e2e/travaux', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(new URL(res.headers()['location'] || '', 'http://localhost').pathname).toBe('/ville/test-e2e/carte');
  });
});
