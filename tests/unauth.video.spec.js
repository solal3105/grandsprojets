// @ts-check
import { test, expect } from '@playwright/test';

/**
 * L'écran de salon - /video
 *
 * Ce que ces tests garantissent :
 *  - la page est servie hors des moteurs, balise et en-tête compris, sans
 *    l'en-tête ni le pied de page du site ;
 *  - la vidéo tourne en boucle et démarre muette (les navigateurs refusent la
 *    lecture automatique avec le son), et le bouton du son la fait parler ;
 *  - un clic sur l'image met la vidéo en pause et la relance, sans jamais
 *    passer en plein écran ; le seul plein écran vise la page entière, tient
 *    quand on ouvre un écran, revient au geste suivant après une sortie
 *    imposée, et seul son bouton le quitte ;
 *  - rien de ce que montre un écran ne fait sortir du salon : ni plein écran
 *    à lui, ni nouvel onglet, ni navigation de la page entière ; le retour du
 *    navigateur ou de la tablette remonte d'un cran au lieu de quitter la page ;
 *  - chaque icône ouvre la chose elle-même sur tout l'écran, sous une seule
 *    barre : l'outil d'un module (jamais sa page de présentation), la
 *    reproduction du Diagnostic, l'écran des communes, la roue, les prix ;
 *  - le seul bouton de retour remonte d'un cran, jusque dans l'écran des
 *    communes (carte ouverte, emport, construction d'une carte), dont les
 *    propres retours et l'en-tête disparaissent ;
 *  - le générateur d'arrêtés s'ouvre en mode stand : le visiteur suivant ne
 *    retrouve pas le brouillon du précédent ;
 *  - un lien qui mènerait ailleurs reste fermé et le visiteur sait pourquoi,
 *    et le lot « carte de votre commune » de la roue ouvre l'écran des
 *    communes ;
 *  - après une minute sans geste, un rappel prévient, puis tout se referme et
 *    la vidéo repart.
 *
 * Les outils (espaces de démonstration, Chantiers, générateur d'arrêtés) et
 * les cartes des communes sont remplacés par des coquilles : aucun test ne
 * dépend de la production ni ne démarre l'application carte. Les messages
 * d'un cadre d'un autre site, invisibles pour nous, ne se testent pas ici.
 */

const OUTILS = {
  Carte: 'https://openprojets.com/ville/metropole-lyon/carte',
  Travaux: 'https://openprojets.com/ville/metropole-lyon/travaux',
  Signalement: 'https://openprojets.com/ville/villedelyon/participer',
  Chantiers: 'https://openprojets-chantiers.com/app/?demo',
};

const coquille = (titre) => ({
  status: 200,
  contentType: 'text/html; charset=utf-8',
  body: `<!doctype html><html lang="fr"><body><h1>${titre}</h1></body></html>`,
});

/** Les outils en production et les cartes des communes : des coquilles */
async function coquilles(page) {
  await page.route('https://openprojets.com/**', (route) => route.fulfill(coquille('Espace de démonstration')));
  await page.route('https://openprojets-chantiers.com/**', (route) => route.fulfill(coquille('Open Projets Chantiers')));
  await page.route((url) => /^\/ville\/essai-[a-z0-9-]+\/carte$/.test(url.pathname), (route) => route.fulfill(coquille('Carte')));
  await page.route('**/data.geopf.fr/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
  await page.route('**/api.qrserver.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
}

/** Le vrai écran de génération, avec un flux simulé (dans toutes les frames) */
async function generationSimulee(page) {
  await page.addInitScript(() => {
    class FauxEventSource {
      constructor(u) { this.url = u; window.__sse = this; }
      close() { /* le double ne tient aucune connexion */ }
    }
    window.EventSource = FauxEventSource;
  });
}

const INCONNUE = { nom: 'Trifouillis-les-Oies', code: '00002', population: 12000, departement: { nom: 'Nulle part' }, centre: { type: 'Point', coordinates: [2.1, 47.2] } };

const barre = (page) => page.getByRole('dialog');
const retour = (page) => barre(page).locator('.barre button').first();

/** Ouvre « Ma commune » et attend l'écran des communes, en mode salon */
async function ouvrirCommunes(page) {
  await page.getByRole('link', { name: 'Ma commune' }).click();
  await expect(barre(page).locator('iframe')).toHaveAttribute('src', '/cartes/?kiosk=1&salon=1');
  // Le cadre reste caché jusqu'à son chargement : on n'y touche qu'ensuite, comme un visiteur
  await expect(barre(page).locator('iframe')).toBeVisible();
  const cadre = page.frameLocator('.vue iframe');
  await expect(cadre.locator('body')).toHaveClass(/is-salon/);
  await expect(cadre.locator('#communes-liste .commune__lien').first()).toBeAttached();
  return cadre;
}

test.describe("0.76 Écran de salon - la page /video", () => {
  test.beforeEach(async ({ page }) => {
    await coquilles(page);
    await page.goto('/video', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('video')).toBeVisible();
  });

  test('0.76.1 la page est servie hors des moteurs, sans en-tête de site', async ({ page, request }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
    const reponse = await request.get('/video');
    expect(reponse.headers()['x-robots-tag']).toContain('noindex');
    await expect(page).toHaveTitle(/avant et après Open Projets/);
    await expect(page.locator('header nav')).toHaveCount(0);
  });

  test('0.76.2 la vidéo tourne en boucle et démarre muette', async ({ page }) => {
    const video = page.locator('video');
    await expect(video).toHaveAttribute('src', '/video/open-projets-avant-apres.mp4');
    await expect(video).toHaveAttribute('poster', '/video/open-projets-avant-apres.webp');
    const etat = await video.evaluate((v) => ({ loop: v.loop, muted: v.muted, autoplay: v.autoplay }));
    expect(etat).toEqual({ loop: true, muted: true, autoplay: true });
  });

  test('0.76.3 le bouton du son fait parler la vidéo, puis la fait taire', async ({ page }) => {
    const bouton = page.getByRole('button', { name: 'Activer le son' });
    await bouton.click();
    await expect(page.getByRole('button', { name: 'Couper le son' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('video').evaluate((v) => v.muted)).toBe(false);
    await page.getByRole('button', { name: 'Couper le son' }).click();
    expect(await page.locator('video').evaluate((v) => v.muted)).toBe(true);
  });

  test("0.76.4 les icônes mènent aux outils eux-mêmes, aux écrans du stand et aux prix", async ({ page }) => {
    for (const [nom, adresse] of Object.entries(OUTILS)) {
      await expect(page.getByRole('link', { name: nom, exact: true })).toHaveAttribute('href', adresse);
    }
    // Le Diagnostic n'a pas de démonstration publique : son lien reste sa page
    await expect(page.getByRole('link', { name: 'Diagnostic', exact: true })).toHaveAttribute('href', '/diagnostic');
    await expect(page.getByRole('link', { name: 'Ma commune' })).toHaveAttribute('href', 'https://openprojets.com/kiosk');
    await expect(page.getByRole('link', { name: 'Arrêtés' })).toHaveAttribute('href', 'https://openprojets-chantiers.com/arrete/');
    await expect(page.getByRole('link', { name: 'Roue des lots' })).toHaveAttribute('href', '/roue');
    await expect(page.getByRole('link', { name: 'Tarification' })).toHaveAttribute('href', '/tarification');
  });

  test("0.76.5 un clic sur l'image met en pause sans passer en plein écran", async ({ page }) => {
    const video = page.locator('video');
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
    await video.click();
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.getByRole('button', { name: 'Reprendre la vidéo' }).first().click();
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
  });

  test("0.76.6 le plein écran vise la page entière et tient quand on ouvre un écran", async ({ page }) => {
    await page.getByRole('button', { name: 'Passer en plein écran' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    await page.getByRole('link', { name: 'Carte', exact: true }).click();
    await expect(barre(page)).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    await retour(page).click();
    await page.getByRole('button', { name: 'Quitter le plein écran' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  });

  test("0.76.7 un module ouvre son outil sur tout l'écran, sous une seule barre, et la vidéo repart au retour", async ({ page }) => {
    const video = page.locator('video');
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
    await page.getByRole('link', { name: 'Travaux', exact: true }).click();
    const ecran = page.getByRole('dialog', { name: 'Travaux du quotidien' });
    await expect(ecran).toBeVisible();
    // L'outil lui-même, jamais la page de présentation du module
    await expect(ecran.locator('iframe')).toHaveAttribute('src', OUTILS.Travaux);
    await expect(page.frameLocator('.vue iframe').locator('h1')).toHaveText('Espace de démonstration');
    await expect(ecran).toContainText('Déplacez le curseur de la chronologie');
    // Sur tout l'écran, sans marge, une fois son entrée finie
    const fenetre = page.viewportSize();
    await expect.poll(async () => {
      const b = await ecran.boundingBox();
      return [b?.x, b?.y, Math.round(b?.width || 0), Math.round(b?.height || 0)];
    }).toEqual([0, 0, fenetre?.width, fenetre?.height]);
    await expect(page).toHaveURL(/\/video\?ecran=travaux$/);
    expect(await video.evaluate((v) => v.paused)).toBe(true);
    // Un seul bouton de retour, qui a le focus
    await expect(ecran.getByRole('button')).toHaveCount(1);
    await expect(ecran.getByRole('button', { name: 'Revenir à la vidéo' })).toBeFocused();
    await ecran.getByRole('button', { name: 'Revenir à la vidéo' }).click();
    await expect(ecran).toHaveCount(0);
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
  });

  test("0.76.8 le Diagnostic montre sa reproduction, et Échap rend la main au lien qui l'a ouvert", async ({ page }) => {
    const lien = page.getByRole('link', { name: 'Diagnostic', exact: true });
    await lien.click();
    const ecran = page.getByRole('dialog', { name: 'Diagnostic terrain' });
    await expect(ecran.getByText('cette vue reproduit son écran')).toBeVisible();
    await expect(ecran.locator('iframe')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(lien).toBeFocused();
  });

  test("0.76.9 la page de prix s'ouvre sans l'en-tête du site, et ses liens vers ailleurs restent fermés", async ({ page }) => {
    await page.getByRole('link', { name: 'Tarification' }).click();
    const ecran = page.getByRole('dialog', { name: "Estimer le prix d'Open Projets" });
    await expect(ecran.locator('iframe')).toHaveAttribute('src', '/tarification?salon=1');
    // Le cadre reste caché jusqu'à son chargement : on ne peut rien y toucher avant
    await expect(ecran.locator('iframe')).toBeVisible();
    const cadre = page.frameLocator('.vue iframe');
    await expect(cadre.locator('h1')).toContainText('Estimez le prix');
    await expect(cadre.locator('header nav')).toHaveCount(0);
    await expect(cadre.locator('footer')).toHaveCount(0);

    const cliquer = (href) => cadre.locator('body').evaluate((body, h) => {
      const a = body.ownerDocument.createElement('a');
      a.href = h;
      a.textContent = 'essai';
      body.appendChild(a);
      a.click();
      a.remove();
    }, href);
    await cliquer('/chantiers');
    await expect(ecran.getByRole('status')).toHaveText("Cette page ne s'ouvre pas sur l'écran du stand. Revenez à la vidéo pour ouvrir un autre écran.");
    await cliquer('https://exemple.invalid/ailleurs');
    await expect(ecran.getByRole('status')).toHaveText("Ce lien mène à un autre site, qui ne s'ouvre pas sur l'écran du stand.");
    expect(await cadre.locator('body').evaluate((b) => b.ownerDocument.location.pathname)).toBe('/tarification');
  });

  test("0.76.10 le lot « carte de votre commune » de la roue ouvre l'écran des communes", async ({ page }) => {
    await page.getByRole('link', { name: 'Roue des lots' }).click();
    await expect(barre(page).locator('iframe')).toBeVisible();
    const cadre = page.frameLocator('.vue iframe');
    await expect(cadre.getByRole('button', { name: 'Lancer la roue' })).toBeVisible();
    // Le plein écran est celui du salon, pas celui de la roue
    await expect(cadre.getByRole('button', { name: 'Passer en plein écran' })).toHaveCount(0);
    // Le lien du lot, tel que la roue le pose une fois la partie gagnée. Le
    // clic part après la réponse : il remplace la roue, et son cadre avec elle.
    await cadre.locator('body').evaluate((body) => {
      const a = body.ownerDocument.createElement('a');
      a.href = 'https://openprojets.com/kiosk';
      a.textContent = 'Voir la carte de votre commune';
      body.appendChild(a);
      setTimeout(() => a.click(), 0);
    });
    await expect(page.getByRole('dialog', { name: 'Voir la carte de votre commune' })).toBeVisible();
    await expect(barre(page).locator('iframe')).toHaveAttribute('src', '/cartes/?kiosk=1&salon=1');
  });

  test("0.76.11 dans l'écran des communes, le seul retour remonte d'un cran : l'emport, la carte, les communes, la vidéo", async ({ page }) => {
    const cadre = await ouvrirCommunes(page);
    // L'écran des communes n'affiche ni son en-tête ni ses propres retours
    await expect(cadre.locator('.entete')).toBeHidden();
    await expect(retour(page)).toHaveText('Revenir à la vidéo');

    const lien = cadre.locator('#communes-liste .commune__lien[href^="/ville/essai-"]').first();
    await lien.evaluate((a) => a.click());
    await expect(cadre.locator('#couche')).toBeVisible();
    await expect(cadre.locator('.couche__barre')).toBeHidden();
    const nom = (await cadre.locator('#couche-nom').textContent())?.trim() || '';
    expect(nom.length).toBeGreaterThan(1);
    await expect(page.locator('#titre-vue')).toHaveText(nom);
    await expect(retour(page)).toHaveText('Revenir aux communes');

    await barre(page).getByRole('button', { name: 'Emporter cette carte' }).click();
    await expect(cadre.locator('#emporter')).toBeVisible();
    await expect(cadre.locator('#emporter-fermer')).toBeHidden();
    await expect(retour(page)).toHaveText('Revenir à la carte');
    await expect(barre(page).getByRole('button', { name: 'Emporter cette carte' })).toHaveCount(0);

    await retour(page).click();
    await expect(cadre.locator('#emporter')).toBeHidden();
    await expect(retour(page)).toHaveText('Revenir aux communes');
    await retour(page).click();
    await expect(cadre.locator('#couche')).toBeHidden();
    await expect(page.locator('#titre-vue')).toHaveText('Voir la carte de votre commune');
    await expect(retour(page)).toHaveText('Revenir à la vidéo');
    await retour(page).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test("0.76.12 la construction d'une carte se suit sous la barre du salon, sans le retour de l'écran de génération", async ({ page }) => {
    await generationSimulee(page);
    await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('communes?nom=') ? [INCONNUE] : INCONNUE),
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const cadre = await ouvrirCommunes(page);
    await cadre.locator('#recherche-champ').click();
    await expect(cadre.locator('#saisie')).toBeVisible();
    await expect(cadre.locator('#saisie-fermer')).toBeHidden();
    await expect(retour(page)).toHaveText('Revenir aux communes');
    await cadre.locator('#saisie-champ').fill('Trif');
    await cadre.locator('#saisie-suggestions li').first().click();
    await expect(cadre.locator('#generation')).toBeVisible();
    const u = new URL(await cadre.locator('#generation-cadre').getAttribute('src') || '', 'http://stand.test');
    expect(u.searchParams.get('salon')).toBe('1');
    await expect(page.locator('#titre-vue')).toHaveText('Trifouillis-les-Oies');
    await expect(retour(page)).toHaveText('Revenir aux communes');
    const generation = cadre.frameLocator('#generation-cadre');
    await expect.poll(() => generation.locator('body').evaluate(() => !!window.__sse)).toBe(true);
    await expect(generation.locator('#btn-retour')).toBeHidden();
    await retour(page).click();
    await expect(cadre.locator('#generation')).toBeHidden();
    await expect(retour(page)).toHaveText('Revenir à la vidéo');
  });

  test("0.76.13 la clé du stand suit jusqu'à l'écran des communes", async ({ page }) => {
    await page.goto('/video?k=stand', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Ma commune' }).click();
    await expect(barre(page).locator('iframe')).toHaveAttribute('src', '/cartes/?kiosk=1&salon=1&k=stand');
  });

  test("0.76.14 ouvert seul, l'écran des communes garde son en-tête et ses retours", async ({ page }) => {
    await page.goto('/cartes/?kiosk=1&salon=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/is-kiosk/);
    await expect(page.locator('body')).not.toHaveClass(/is-salon/);
    await expect(page.locator('.entete')).toBeVisible();
  });

  test("0.76.15 le générateur d'arrêtés s'ouvre en mode stand, sans le brouillon du visiteur précédent", async ({ page }) => {
    await page.getByRole('link', { name: 'Arrêtés' }).click();
    const ecran = page.getByRole('dialog', { name: 'Générer un arrêté de circulation ou de voirie' });
    await expect(ecran.locator('iframe')).toHaveAttribute('src', 'https://openprojets-chantiers.com/arrete/?stand=1');
    await expect(ecran).toContainText('Créer mon arrêté gratuitement');
  });

  test("0.76.16 une sortie imposée du plein écran se répare au geste suivant, et seul son bouton le quitte", async ({ page }) => {
    const enPleinEcran = () => page.evaluate(() => document.fullscreenElement === document.documentElement);
    await page.getByRole('button', { name: 'Passer en plein écran' }).click();
    await expect.poll(enPleinEcran).toBe(true);
    // L'appareil en sort de lui-même (geste retour d'Android, Échap tenu)
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(enPleinEcran).toBe(false);
    // Le geste suivant, où qu'il soit, le rétablit
    await page.getByRole('link', { name: 'Diagnostic', exact: true }).click();
    await expect.poll(enPleinEcran).toBe(true);
    await retour(page).click();
    // Quitté par son bouton, il ne revient plus de lui-même
    await page.getByRole('button', { name: 'Quitter le plein écran' }).click();
    await expect.poll(enPleinEcran).toBe(false);
    await page.getByRole('link', { name: 'Diagnostic', exact: true }).click();
    await expect(barre(page)).toBeVisible();
    expect(await enPleinEcran()).toBe(false);
  });

  test("0.76.17 un geste dans un écran d'un autre site rétablit aussi le plein écran", async ({ page }) => {
    const enPleinEcran = () => page.evaluate(() => document.fullscreenElement === document.documentElement);
    await page.getByRole('button', { name: 'Passer en plein écran' }).click();
    await expect.poll(enPleinEcran).toBe(true);
    await page.getByRole('link', { name: 'Carte', exact: true }).click();
    await expect(barre(page).locator('iframe')).toBeVisible();
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(enPleinEcran).toBe(false);
    await page.frameLocator('.vue iframe').locator('h1').click();
    await expect.poll(enPleinEcran, { timeout: 4000 }).toBe(true);
  });

  test("0.76.18 rien de ce que montre un écran ne fait sortir du salon", async ({ page }) => {
    await page.getByRole('link', { name: 'Carte', exact: true }).click();
    const cadre = barre(page).locator('iframe');
    await expect(cadre).toBeVisible();
    // Ni plein écran à lui, qui déferait celui de la page, ni nouvel onglet, ni
    // navigation de la page entière
    const sandbox = (await cadre.getAttribute('sandbox')) || '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toMatch(/allow-popups|allow-top-navigation/);
    expect(await cadre.getAttribute('allow')).not.toContain('fullscreen');
    const outil = page.frameLocator('.vue iframe');
    expect(await outil.locator('body').evaluate(() => document.fullscreenEnabled)).toBe(false);
    await outil.locator('body').evaluate((body) => {
      for (const cible of ['_blank', '_top']) {
        const a = body.ownerDocument.createElement('a');
        a.href = 'https://exemple.invalid/ailleurs';
        a.target = cible;
        a.textContent = cible;
        body.appendChild(a);
        a.click();
      }
      window.open('https://exemple.invalid/fenetre');
    });
    await page.waitForTimeout(500);
    expect(page.context().pages()).toHaveLength(1);
    await expect(page).toHaveURL(/\/video\?ecran=carte$/);
    await expect(barre(page)).toBeVisible();
  });

  test("0.76.19 le retour du navigateur ou de la tablette remonte d'un cran au lieu de quitter la page", async ({ page }) => {
    // Un écran ouvert : le retour le referme
    await page.getByRole('link', { name: 'Travaux', exact: true }).click();
    await expect(page).toHaveURL(/ecran=travaux/);
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/video$/);

    // Dans l'écran des communes, le retour referme d'abord la carte ouverte
    const cadre = await ouvrirCommunes(page);
    await cadre.locator('#communes-liste .commune__lien[href^="/ville/essai-"]').first().evaluate((a) => a.click());
    await expect(retour(page)).toHaveText('Revenir aux communes');
    await page.goBack();
    await expect(cadre.locator('#couche')).toBeHidden();
    await expect(barre(page)).toBeVisible();
    await expect(retour(page)).toHaveText('Revenir à la vidéo');

    // Un écran refermé par son bouton laisse l'accueil derrière lui : un
    // retour de trop reste sur la page
    await retour(page).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/video/);
    await expect(page.locator('video')).toBeVisible();
  });
});

test.describe("0.76 Écran de salon - le retour à la vidéo", () => {
  test("0.76.20 après une minute sans geste, un rappel prévient, puis tout se referme et la vidéo repart", async ({ page }) => {
    await page.clock.install();
    await page.goto('/video', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Diagnostic', exact: true }).click();
    const ecran = page.getByRole('dialog', { name: 'Diagnostic terrain' });
    await expect(ecran).toBeVisible();

    await page.clock.fastForward(52_000);
    await expect(ecran.getByText(/Nous revenons à la vidéo dans \d+ secondes\./)).toBeVisible();
    await ecran.getByRole('button', { name: 'Rester sur cet écran' }).click();
    await expect(ecran.getByText(/Nous revenons à la vidéo/)).toHaveCount(0);

    await page.clock.fastForward(71_000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.locator('video').evaluate((v) => v.paused)).toBe(false);
  });
});
