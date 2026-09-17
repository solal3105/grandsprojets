// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Les cartes des communes (/cartes/) : la page qui montre toutes les cartes
 * construites par la démo. Rendue côté serveur par l'edge function `cartes`
 * (liste des communes avec un lien vers leur page ville, contour de la France,
 * commune vedette, JSON-LD, catalogue embarqué), et écran de salon en
 * ?kiosk=1 : rotation des scènes, veille, cartes ouvertes en couche, saisie
 * plein écran, panneau pour emporter la carte, génération d'une nouvelle
 * carte par l'écran /demo/ ouvert en couche (jamais à la place de la page :
 * la tablette resterait sinon hors du plein écran).
 *
 * Les cartes ouvertes en couche sont remplacées par une coquille : aucun test
 * ne démarre l'application carte (WebGL) dans l'iframe. L'écran de génération,
 * lui, est le vrai, avec un flux de génération simulé.
 *
 * Section : 0.38 - Les cartes des communes
 */

const KIOSK = '/cartes/?kiosk=1';

/** Une carte ouverte en couche, et une fiche : des coquilles */
const estUneCarte = (url) => /^\/ville\/(essai-[a-z0-9-]+|metropole-lyon)\/carte$/.test(url.pathname);
const estUneFiche = (url) => url.pathname.startsWith('/fiche/essai-test/');

async function coquilles(page) {
  await page.route(estUneCarte, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="fr"><body><h1>Carte</h1>
      <a id="dehors" href="https://exemple.invalid/ailleurs" target="_blank">Ailleurs</a>
      <a id="dedans" href="/fiche/essai-test/cat/projet" target="_blank">Une fiche</a></body></html>`,
  }));
  await page.route(estUneFiche, (route) => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="fr"><body><h1>Fiche</h1></body></html>',
  }));
}

/** Le vrai écran de génération, avec un flux simulé : le double d'EventSource
 *  vaut dans toutes les frames de la page, `window.__envoyer` y joue le serveur */
async function generationSimulee(page) {
  await page.addInitScript(() => {
    class FauxEventSource {
      constructor(u) { this.url = u; window.__sse = this; }
      close() { /* le double ne tient aucune connexion */ }
    }
    window.EventSource = FauxEventSource;
    window.__envoyer = (o) => window.__sse?.onmessage?.({ data: JSON.stringify(o) });
  });
  await page.route('**/api.qrserver.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
}

/** Lance depuis la saisie du stand la génération d'une commune inconnue et
 *  rend la frame de l'écran de génération, prête à recevoir des messages */
async function lancerGeneration(page) {
  await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(route.request().url().includes('communes?nom=') ? [INCONNUE] : INCONNUE),
  }));
  await page.locator('#recherche-champ').click();
  await page.locator('#saisie-champ').fill('Trif');
  await page.locator('#saisie-suggestions li').first().click();
  await expect(page.locator('#generation')).toBeVisible();
  // La frame n'a pas encore quitté about:blank au moment où la couche s'affiche
  const frame = await (await page.locator('#generation-cadre').elementHandle()).contentFrame();
  expect(frame).toBeTruthy();
  await frame.waitForURL(/\/demo\//);
  await frame.waitForFunction(() => window.__sse);
  return frame;
}

async function catalogueDe(page) {
  return page.evaluate(() => JSON.parse(document.getElementById('catalogue')?.textContent || '{}'));
}

// Un JPEG d'un pixel tient lieu de vue aérienne : le service de l'IGN n'est jamais appelé
const PIXEL_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
async function cielFactice(page) {
  await page.route('**/data.geopf.fr/**', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: PIXEL_JPEG }));
}

async function ouvrirKiosque(page, url = KIOSK) {
  await cielFactice(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveClass(/is-kiosk/);
  await expect(page.locator('#communes-liste .commune__lien').first()).toBeVisible();
}

/** Même construction de slug que la page, pour choisir une commune reconnue */
function slugDeCommune(nom) {
  return String(nom || '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const geoDouble = (page, communes) => page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(communes),
}));

const INCONNUE = { nom: 'Trifouillis-les-Oies', code: '00002', population: 12000, departement: { nom: 'Nulle part' }, centre: { type: 'Point', coordinates: [2.1, 47.2] } };

// ═════════════════════════════════════════════════════════
// 0.38 - Rendu serveur
// ═════════════════════════════════════════════════════════
test.describe('0.38 - Les cartes des communes : rendu serveur', () => {
  test('0.38.1 - la page est pré-rendue avec les vrais comptes et un lien par commune', async ({ page }) => {
    await page.goto('/cartes/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Les cartes des projets de \d+ communes/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://openprojets.com/cartes/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index, follow/);
    const liens = page.locator('#communes-liste .commune__lien');
    expect(await liens.count()).toBeGreaterThan(10);
    // Chaque commune mène à sa page ville (référencement) ; la Métropole ouvre la liste
    await expect(liens.first()).toHaveAttribute('href', '/ville/metropole-lyon');
    await expect(liens.nth(1)).toHaveAttribute('href', /^\/ville\/essai-/);
    expect(await page.locator('#points circle.point').count()).toBeGreaterThan(10);
    await expect(page.locator('#compte')).toBeVisible();
    await expect(page.locator('#compte')).toContainText(/\d+ communes ont déjà la leur/);
    // La France vue du ciel arrive avec la page : une seule image, à la taille de l'écran
    await expect(page.locator('#ciel-france-image')).toHaveAttribute('src', /data\.geopf\.fr\/wms-r\/wms\?.*ORTHOIMAGERY\.ORTHOPHOTOS.*WIDTH=1920/);
  });

  test('0.38.2 - le catalogue embarqué et le JSON-LD décrivent les mêmes communes', async ({ page }) => {
    await page.goto('/cartes/', { waitUntil: 'domcontentloaded' });
    const catalogue = await catalogueDe(page);
    expect(Array.isArray(catalogue.villes)).toBe(true);
    expect(catalogue.villes.length).toBeGreaterThan(10);
    expect(catalogue.totaux.communes).toBe(catalogue.villes.length);
    expect(catalogue.villes[0].slug).toMatch(/^essai-/);
    // Les photos de notre storage sont demandées réduites : jamais 1 Mo par photo
    for (const f of catalogue.villes.flatMap((v) => v.fiches)) {
      if (f.image.includes('supabase.co')) expect(f.image).toMatch(/\/render\/image\/public\/.*width=800/);
    }
    const blocs = await page.locator('script[type="application/ld+json"]').allTextContents();
    const collection = blocs.map((t) => JSON.parse(t)).find((o) => o['@type'] === 'CollectionPage');
    expect(collection).toBeTruthy();
    expect(collection.mainEntity.numberOfItems).toBe(catalogue.villes.length);
    expect(collection.mainEntity.itemListElement[0].url).toMatch(/^https:\/\/openprojets\.com\/ville\/essai-/);
  });

  test('0.38.3 - la commune vedette est mise en scène, la Métropole de Lyon à part, et rien ne tourne', async ({ page }) => {
    await page.goto('/cartes/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#scene-ville .ville__nom')).not.toBeEmpty();
    expect(await page.locator('#scene-ville .tirage').count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#scene-ville .bouton--ville')).toHaveAttribute('href', /^\/ville\/essai-[a-z0-9-]+\/carte$/);
    await expect(page.locator('.lyon__inner .ville__nom')).toContainText('Métropole de Lyon');
    await expect(page.locator('body')).not.toHaveClass(/is-kiosk/);
    await expect(page.locator('#theme-toggle')).toBeHidden();
    await expect(page.locator('#recherche-champ')).not.toHaveAttribute('readonly', '');
  });
});

// ═════════════════════════════════════════════════════════
// 0.38 - Le stand
// ═════════════════════════════════════════════════════════
test.describe('0.38 - Les cartes des communes : le stand', () => {
  test('0.38.4 - les scènes se relaient toutes seules et reviennent à l\'accueil', async ({ page }) => {
    await page.clock.install();
    await ouvrirKiosque(page);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'accueil');
    await expect(page.locator('#scene-accueil')).toHaveClass(/is-active/);
    // Le champ de la page n'ouvre pas de clavier : la saisie se fait plein écran
    await expect(page.locator('#recherche-champ')).toHaveAttribute('readonly', '');
    await expect(page.locator('.pied')).toBeHidden();

    // Après l'accueil, une commune de la vitrine : sa vue du ciel, ses tirages, son point allumé
    await page.clock.runFor(15500);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'ville');
    await expect(page.locator('#scene-ville')).toHaveClass(/is-active/);
    await expect(page.locator('.ciel__calque--ville.is-on')).toHaveCount(1);
    await expect(page.locator('#ciel-france')).toHaveClass(/is-plongee/);
    expect(await page.locator('#scene-ville .tirage').count()).toBeGreaterThanOrEqual(1);
    const slug = await page.locator('#scene-ville .scene__tirages').getAttribute('data-ville');
    expect(slug).toMatch(/^essai-/);
    const point = page.locator(`.point[data-ville="${slug}"]`);
    if (await point.count()) await expect(point).toHaveClass(/is-on/);

    // Trois communes, puis « comment ça marche », puis l'accueil de nouveau.
    // Chaque scène attend sa vue du ciel avant d'armer la suivante : une avance
    // d'horloge par scène.
    for (let i = 0; i < 2; i += 1) {
      await page.clock.runFor(12500);
      await expect(page.locator('body')).toHaveAttribute('data-scene', 'ville');
      await expect(page.locator('#scene-ville')).toHaveClass(/is-active/);
    }
    await page.clock.runFor(12500);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'comment');
    await expect(page.locator('#scene-comment')).toHaveClass(/is-active/);
    await expect(page.locator('#ciel-france')).not.toHaveClass(/is-plongee/);
    await page.clock.runFor(11500);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'accueil');
  });

  test('0.38.5 - un geste retient la scène, puis la rotation repart de l\'accueil', async ({ page }) => {
    await page.clock.install();
    await ouvrirKiosque(page);
    await page.clock.runFor(2000);
    await page.mouse.click(400, 300);
    // Sans ce geste, l'accueil aurait cédé la place à 15 s
    await page.clock.runFor(17000);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'accueil');
    // Vingt secondes de calme : la rotation reprend, toujours depuis l'accueil
    await page.clock.runFor(5000);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'accueil');
    await page.clock.runFor(15500);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'ville');
  });

  test('0.38.6 - une commune du ruban s\'ouvre en couche, rien n\'en sort, et elle se referme', async ({ page }) => {
    await coquilles(page);
    await ouvrirKiosque(page);
    const lien = page.locator('#communes-liste .commune__lien[href^="/ville/essai-"]').first();
    const slug = await lien.getAttribute('data-ville');
    const nom = await lien.getAttribute('data-nom');
    await lien.click();
    await expect(page.locator('#couche')).toBeVisible();
    await expect(page.locator('#couche-nom')).toHaveText(nom || '');
    await expect(page.locator('#couche-cadre')).toHaveAttribute('src', `/ville/${slug}/carte`);
    expect(new URL(page.url()).pathname).toBe('/cartes/');

    // Un lien vers un autre site est neutralisé, et le visiteur sait pourquoi ;
    // un nouvel onglet est ramené dans le cadre
    const cadre = page.frameLocator('#couche-cadre');
    await expect(cadre.locator('h1')).toHaveText('Carte');
    await expect(page.locator('#lien-bloque')).toBeHidden();
    await cadre.locator('#dehors').click();
    await expect(cadre.locator('h1')).toHaveText('Carte');
    await expect(page.locator('#lien-bloque')).toBeVisible();
    await expect(page.locator('#lien-bloque')).toContainText('ne s\'ouvrent pas sur cet écran');
    await cadre.locator('#dedans').click();
    await expect(cadre.locator('h1')).toHaveText('Fiche');
    expect(page.context().pages().length).toBe(1);

    await page.locator('#couche-retour').click();
    await expect(page.locator('#couche')).toBeHidden();
    await expect(page.locator('#couche-cadre')).toHaveAttribute('src', 'about:blank');
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'accueil');
  });

  test('0.38.7 - sans geste, une carte ouverte prévient puis rend l\'écran à l\'accueil', async ({ page }) => {
    await page.clock.install();
    await coquilles(page);
    await ouvrirKiosque(page);
    await page.locator('#communes-liste .commune__lien[href^="/ville/essai-"]').first().click();
    await expect(page.locator('#couche')).toBeVisible();
    await page.clock.runFor(60000);
    await expect(page.locator('#veille')).toBeHidden();
    await page.clock.runFor(7000);
    await expect(page.locator('#veille')).toBeVisible();
    await expect(page.locator('#veille')).toContainText('revient à l\'accueil');
    // Un geste suffit à rester
    await page.locator('#couche-nom').click();
    await page.clock.runFor(2000);
    await expect(page.locator('#veille')).toBeHidden();
    // Puis, plus rien : la carte se referme, l'accueil reprend
    await page.clock.runFor(76000);
    await expect(page.locator('#couche')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'accueil');
  });

  test('0.38.8 - la saisie plein écran distingue une carte déjà construite d\'une carte à construire', async ({ page }) => {
    await coquilles(page);
    await ouvrirKiosque(page);
    const catalogue = await catalogueDe(page);
    const connue = catalogue.villes.find((v) => v.lat != null && v.lng != null && `essai-${slugDeCommune(v.nom)}` === v.slug);
    expect(connue).toBeTruthy();
    await geoDouble(page, [
      { nom: connue.nom, code: '00001', departement: { nom: 'Quelque part' }, centre: { type: 'Point', coordinates: [connue.lng, connue.lat] } },
      INCONNUE,
    ]);
    await page.locator('#recherche-champ').click();
    await expect(page.locator('#saisie')).toBeVisible();
    await expect(page.locator('#saisie-champ')).toBeFocused();
    // Derrière la saisie, seul le ciel reste : la scène, la recherche et le ruban s'effacent
    await expect(page.locator('#scene-accueil')).toBeHidden();
    await expect(page.locator('#recherche')).toBeHidden();
    await expect(page.locator('#communes-liste')).toBeHidden();
    await page.locator('#saisie-champ').fill('Tri');
    const lignes = page.locator('#saisie-suggestions li');
    await expect(lignes).toHaveCount(2);
    await expect(lignes.nth(0).locator('.s-etat')).toHaveText('Sa carte existe, elle s\'ouvre');
    // 12 000 habitants : la durée annoncée est celle des communes moyennes
    await expect(lignes.nth(1).locator('.s-etat')).toHaveText('À construire, 3 à 4 minutes');
    await lignes.nth(0).click();
    await expect(page.locator('#couche')).toBeVisible();
    await expect(page.locator('#couche-cadre')).toHaveAttribute('src', `/ville/${connue.slug}/carte`);
    await expect(page.locator('#saisie')).toBeHidden();
    await page.locator('#couche-retour').click();
    await expect(page.locator('#scene-accueil')).toBeVisible();
  });

  test('0.38.9 - une commune sans carte se construit en couche, la page reste en place, puis sa carte s\'ouvre', async ({ page }) => {
    await coquilles(page);
    await generationSimulee(page);
    await ouvrirKiosque(page, '/cartes/?kiosk=1&k=stand');
    const frame = await lancerGeneration(page);
    // L'écran de génération est ouvert PAR-DESSUS la page, jamais à sa place :
    // la tablette ne sort pas du plein écran
    expect(new URL(page.url()).pathname).toBe('/cartes/');
    const u = new URL(await page.locator('#generation-cadre').getAttribute('src') || '', 'http://stand.test');
    expect(u.pathname).toBe('/demo/');
    expect(u.searchParams.get('commune')).toBe('00002');
    expect(u.searchParams.get('auto')).toBe('1');
    expect(u.searchParams.get('kiosk')).toBe('1');
    expect(u.searchParams.get('k')).toBe('stand');
    expect(u.searchParams.get('retour')).toBe('/cartes/?kiosk=1&k=stand');
    await expect(page.locator('#saisie')).toBeHidden();

    // La génération aboutit : l'adresse est donnée, « Découvrir l'espace »
    // ouvre la carte construite en couche, dans la page des cartes
    await frame.evaluate((m) => window.__envoyer(m), {
      type: 'done', url: '/?city=essai-trifouillis-les-oies', ville: 'essai-trifouillis-les-oies',
      communeNom: 'Trifouillis-les-Oies', communeInsee: '00002', projectsCount: 7,
      stats: { sources: 20, verified: 7, precise: 7, illustrated: 4 },
    });
    await expect(frame.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await frame.locator('#lead-email').fill('vazy');
    await frame.locator('#lead-submit').click();
    await expect(frame.locator('#btn-open')).toBeVisible();
    await frame.locator('#btn-open').click();
    await expect(page.locator('#generation')).toBeHidden();
    await expect(page.locator('#generation-cadre')).toHaveAttribute('src', 'about:blank');
    await expect(page.locator('#couche')).toBeVisible();
    await expect(page.locator('#couche-nom')).toHaveText('Trifouillis-les-Oies');
    await expect(page.locator('#couche-cadre')).toHaveAttribute('src', '/ville/essai-trifouillis-les-oies/carte');
    expect(new URL(page.url()).pathname).toBe('/cartes/');
    expect(page.context().pages().length).toBe(1);
  });

  test('0.38.10 - « Revenir à l\'accueil » depuis l\'écran de génération referme la couche et la rotation repart', async ({ page }) => {
    await coquilles(page);
    await generationSimulee(page);
    await ouvrirKiosque(page);
    const frame = await lancerGeneration(page);
    await expect(frame.locator('#btn-retour')).toBeVisible();
    await frame.locator('#btn-retour').click();
    await expect(page.locator('#generation')).toBeHidden();
    await expect(page.locator('#couche')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'accueil');
    await expect(page.locator('#scene-accueil')).toHaveClass(/is-active/);
    expect(new URL(page.url()).pathname).toBe('/cartes/');
  });

  test('0.38.11 - emporter une carte : un code à scanner, et le lien par e-mail', async ({ page }) => {
    await coquilles(page);
    await ouvrirKiosque(page);
    let recu = null;
    await page.route('**/api/demo-lead', (route) => {
      recu = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stored: true, mailed: true }) });
    });
    const lien = page.locator('#communes-liste .commune__lien[href^="/ville/essai-"]').first();
    const slug = await lien.getAttribute('data-ville');
    await lien.click();
    await page.locator('#couche-emporter').click();
    await expect(page.locator('#emporter')).toBeVisible();
    const qr = await page.locator('#emporter-qr').getAttribute('src');
    expect(decodeURIComponent(qr || '')).toContain(`https://openprojets.com/ville/${slug}/carte`);
    // Une adresse incomplète est refusée sur place, sans rien envoyer
    await page.locator('#emporter-email').fill('maire@ville');
    await page.locator('#emporter-envoyer').click();
    await expect(page.locator('#emporter-erreur')).toBeVisible();
    expect(recu).toBeNull();
    await page.locator('#emporter-email').fill('maire@ville.fr');
    await page.locator('#emporter-envoyer').click();
    await expect(page.locator('#emporter-merci')).toHaveText('Merci, le lien part sur votre adresse.');
    expect(recu.ville).toBe(slug);
    expect(recu.kiosk).toBe(true);
  });

  test('0.38.12 - la Métropole de Lyon s\'emporte par le code seulement', async ({ page }) => {
    await coquilles(page);
    await ouvrirKiosque(page);
    await page.locator('#communes-liste .commune__lien[href="/ville/metropole-lyon"]').click();
    await expect(page.locator('#couche-nom')).toHaveText('Métropole de Lyon');
    await page.locator('#couche-emporter').click();
    await expect(page.locator('#emporter')).toHaveClass(/is-sans-mail/);
    await expect(page.locator('#emporter-form')).toBeHidden();
    await expect(page.locator('#emporter-qr')).toBeVisible();
  });

  test('0.38.13 - au retour de l\'écran de génération, la carte demandée s\'ouvre d\'elle-même', async ({ page }) => {
    await coquilles(page);
    await ouvrirKiosque(page, '/cartes/?kiosk=1&ouvrir=essai-trifouillis&nom=Trifouillis');
    await expect(page.locator('#couche')).toBeVisible();
    await expect(page.locator('#couche-nom')).toHaveText('Trifouillis');
    await expect(page.locator('#couche-cadre')).toHaveAttribute('src', '/ville/essai-trifouillis/carte');
    await page.locator('#couche-retour').click();
    await expect(page.locator('#couche')).toBeHidden();
    // L'adresse est nettoyée : un rechargement ne rouvrirait pas cette carte
    expect(new URL(page.url()).search).toBe('?kiosk=1');
  });

  test('0.38.14 - sur le stand, aucun lien ne quitte la page, et le visiteur sait pourquoi', async ({ page }) => {
    await ouvrirKiosque(page);
    await expect(page.locator('#lien-bloque')).toBeHidden();
    await page.locator('.entete__logo').click();
    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname).toBe('/cartes/');
    await expect(page.locator('body')).toHaveClass(/is-kiosk/);
    await expect(page.locator('#lien-bloque')).toBeVisible();
    await expect(page.locator('#lien-bloque')).toContainText('openprojets.com');
  });

  test('0.38.15 - après génération, la destination sert la vraie application carte', async ({ page }) => {
    await generationSimulee(page);
    await ouvrirKiosque(page);
    // Aucun double sur la destination : une coquille sur /essai-* masquait
    // le retour au site vitrine depuis le changement des routes publiques.
    const ville = (await catalogueDe(page)).villes[0];
    const frame = await lancerGeneration(page);
    await frame.evaluate((ville) => window.__envoyer({
      type: 'done', url: `/?city=${ville.slug}`, ville: ville.slug,
      communeNom: ville.nom, projectsCount: ville.total,
    }), ville);
    await expect(frame.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await frame.locator('#lead-email').fill('vazy');
    await frame.locator('#lead-submit').click();
    await frame.locator('#btn-open').click();
    await expect(page.locator('#generation')).toBeHidden();
    await expect(page.locator('#couche-cadre')).toHaveAttribute('src', `/ville/${ville.slug}/carte`);
    const carte = page.frameLocator('#couche-cadre');
    await expect(carte.locator('#map')).toHaveAttribute('role', 'application');
    await expect(carte.locator('script[src="/main.js"]')).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe('/cartes/');
    expect(page.context().pages()).toHaveLength(1);
  });

  test('0.38.16 - changer de format conserve la saisie puis la génération en cours', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1280 });
    await generationSimulee(page);
    await ouvrirKiosque(page);
    await page.locator('#recherche-champ').click();
    await page.locator('#saisie-champ').fill('Trif');
    // Un clavier peut réduire la hauteur au point de changer le ratio CSS.
    await page.setViewportSize({ width: 800, height: 480 });
    await expect(page.locator('#saisie')).toBeVisible();
    await expect(page.locator('#saisie-champ')).toHaveValue('Trif');
    await page.locator('#saisie-fermer').click();
    const frame = await lancerGeneration(page);
    await page.setViewportSize({ width: 800, height: 1280 });
    await expect(page.locator('#generation')).toBeVisible();
    await expect(frame.locator('#screen-progress')).toHaveClass(/is-active/);
    await frame.locator('#btn-retour').click();
    await expect(page.locator('#generation')).toBeHidden();
    await expect(page.locator('#ciel-france-image')).toHaveAttribute('src', /WIDTH=1080/);
  });

  test('0.38.17 - une réponse tardive ne réapparaît pas après fermeture de la saisie', async ({ page }) => {
    let pending;
    await page.route('**/geo.api.gouv.fr/**', (route) => { pending = route; });
    await ouvrirKiosque(page);
    await page.locator('#recherche-champ').click();
    await page.locator('#saisie-champ').fill('Trif');
    await expect.poll(() => Boolean(pending)).toBe(true);
    await page.locator('#saisie-fermer').click();
    await page.locator('#recherche-champ').click();
    const response = page.waitForResponse('**/geo.api.gouv.fr/**');
    await pending.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([INCONNUE]) });
    await (await response).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('#saisie-champ')).toHaveValue('');
    await expect(page.locator('#saisie-suggestions li')).toHaveCount(0);
    await expect(page.locator('#saisie-suggestions')).toBeHidden();
  });

  test('0.38.18 - une nouvelle frappe retire les résultats du nom précédent', async ({ page }) => {
    await generationSimulee(page);
    await geoDouble(page, [INCONNUE]);
    await ouvrirKiosque(page);
    await page.locator('#recherche-champ').click();
    await page.locator('#saisie-champ').fill('Trif');
    await expect(page.locator('#saisie-suggestions li[data-index]')).toHaveCount(1);
    await page.route('**/geo.api.gouv.fr/**', (route) => route.abort());
    await page.locator('#saisie-champ').fill('Paris');
    await page.locator('#saisie-champ').press('Enter');
    await expect(page.locator('#generation')).toBeHidden();
    await expect(page.locator('#saisie')).toBeVisible();
    await expect(page.locator('#saisie-suggestions')).toContainText('recherche est indisponible');
  });

  test('0.38.19 - la recherche distingue une panne réseau et permet de réessayer', async ({ page }) => {
    await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({ status: 503, body: '' }));
    await ouvrirKiosque(page);
    await page.locator('#recherche-champ').click();
    await page.locator('#saisie-champ').fill('Trif');
    await expect(page.locator('#saisie-suggestions')).toContainText('recherche est indisponible');
    await geoDouble(page, [INCONNUE]);
    await page.locator('#saisie-champ').fill('Trifou');
    await expect(page.locator('#saisie-suggestions li[data-index]')).toHaveCount(1);
  });

  for (const [width, height] of [[800, 480], [600, 960]]) {
    test(`0.38.20 - emporter la carte reste utilisable à ${width} x ${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await coquilles(page);
      await generationSimulee(page);
      await ouvrirKiosque(page, '/cartes/?kiosk=1&ouvrir=essai-vandoeuvre-les-nancy&nom=Vand%C5%93uvre-l%C3%A8s-Nancy');
      for (const selector of ['#couche-retour', '#couche-emporter']) {
        const box = await page.locator(selector).boundingBox();
        expect.soft(box.x).toBeGreaterThanOrEqual(0);
        expect.soft(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.locator('#couche-emporter').click();
      await expect(page.locator('#emporter')).toBeVisible();
      for (const selector of ['#emporter-fermer', '#emporter-email', '#emporter-envoyer']) {
        const control = page.locator(selector);
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        expect.soft(box.x).toBeGreaterThanOrEqual(0);
        expect.soft(box.x + box.width).toBeLessThanOrEqual(width);
        expect.soft(box.y).toBeGreaterThanOrEqual(0);
        expect.soft(box.y + box.height).toBeLessThanOrEqual(height);
      }
      const field = await page.locator('#emporter-email').evaluate((input) => {
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d');
        context.font = `${style.fontSize} ${style.fontFamily}`;
        return { text: context.measureText(input.placeholder).width,
          space: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
      });
      expect.soft(field.text).toBeLessThanOrEqual(field.space);
      await page.screenshot({ path: testInfo.outputPath(`emporter-${width}.png`) });
      await page.locator('#emporter-fermer').click();
      await expect(page.locator('#emporter')).toBeHidden();
    });
  }
});
