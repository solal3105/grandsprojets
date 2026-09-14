// @ts-check
// Tests E2E de l'encart d'invitation (index.html inline + styles/gp-invite.css)
// et du rendu des crédits du fond de carte dans le panneau « Fond de carte ».
//
// Ce fichier remplace unauth.demo-banner.spec.js et unauth.essai-invite.spec.js :
// #demo-banner et #essai-invite ont fusionné en un composant à deux variantes.
//
// Contrat de visibilité :
//   - variante « demo »  sur l'espace de démonstration ('', default, metropole-lyon)
//   - variante « essai » sur les cartes générées au salon (/ville/essai-*/carte)
//   - rien sur un espace client, jamais en iframe (Phaos)
//   - après boot, main.js appelle window.__syncInvite(cityRésolue) - barrière
//     défensive qui MASQUE (jamais l'inverse) : un essai-* absent de VALID_CITIES
//     retombe sur metropole-lyon côté CityManager
//   - fermer REPLIE vers une pastille (gp-invite-collapsed = '1'), jamais ne masque
//
// Sections : 0.35 - Encart d'invitation · 0.36 - Crédits du fond de carte

import { test, expect } from '@playwright/test';

const COLLAPSE_KEY = 'gp-invite-collapsed';

// La carte de démonstration et une carte d'essai réellement présente en base
// (une ville inconnue ne charge plus la carte : l'edge carte-seo répond 404).
const DEMO = '/ville/metropole-lyon/carte';
const ESSAI = '/ville/essai-auray/carte';

/**
 * Attend que la carte soit chargée (Phase 6+), donc que la barrière défensive
 * post-boot ait eu lieu. Sans cette attente, un test peut passer avant elle.
 */
async function waitForMapBoot(page, path = DEMO) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector('#filters-toggle')?.getAttribute('data-ready') === 'true',
    { timeout: 25000 }
  );
}

const variante = (page, nom) => page.locator(`#gp-invite-card [data-variant="${nom}"]`);

// ─────────────────────────────────────────────────────────
// 0.35.1 - Variante démonstration (ex-#demo-banner)
// ─────────────────────────────────────────────────────────
test.describe('0.35.1 - Encart : variante démonstration', () => {

  test('0.35.1.1 - Visible sur la carte de démonstration', async ({ page }) => {
    await waitForMapBoot(page, DEMO);
    await expect(page.locator('#gp-invite-card')).toBeVisible();
    await expect(variante(page, 'demo')).toBeVisible();
    await expect(variante(page, 'essai')).toBeHidden();
  });

  test('0.35.1.2 - Visible en arrivant par l\'ancienne adresse ?city=metropole-lyon', async ({ page }) => {
    // L'edge carte-legacy redirige vers /ville/metropole-lyon/carte
    await waitForMapBoot(page, '/?city=metropole-lyon');
    expect(new URL(page.url()).pathname).toBe(DEMO);
    await expect(variante(page, 'demo')).toBeVisible();
  });

  test('0.35.1.4 - Le CTA pointe vers le formulaire de l\'accueil avec attribution ?ref=', async ({ page }) => {
    await waitForMapBoot(page, DEMO);
    await expect(variante(page, 'demo').locator('.gp-invite__cta'))
      .toHaveAttribute('href', 'https://openprojets.com/?ref=demo-banner#contact');
  });

  test('0.35.1.5 - Le copy ne promet pas « sans inscription » (régression)', async ({ page }) => {
    await waitForMapBoot(page, DEMO);
    const texte = (await variante(page, 'demo').innerText()).toLowerCase();
    expect(texte).not.toContain('sans inscription');
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.2 - Variante carte d'essai
// ─────────────────────────────────────────────────────────
test.describe('0.35.2 - Encart : variante carte d\'essai', () => {

  test('0.35.2.1 - Visible sur un espace d\'essai', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await expect(page.locator('#gp-invite-card')).toBeVisible();
    await expect(variante(page, 'essai')).toBeVisible();
    await expect(variante(page, 'demo')).toBeHidden();
  });

  test('0.35.2.2 - Les deux destinations demandées sont proposées', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    const bloc = variante(page, 'essai');
    await expect(bloc.locator('.gp-invite__cta'))
      .toHaveAttribute('href', 'https://openprojets.com/?ref=essai-invite');
    await expect(bloc.locator('.gp-invite__link'))
      .toHaveAttribute('href', 'https://openprojets.com/ville/metropole-lyon/carte');
  });

  test('0.35.2.3 - La carte dit qu\'elle est incomplète, sans la commune', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    const texte = (await variante(page, 'essai').innerText()).toLowerCase();

    // Même franchise que le message envoyé au visiteur : une carte bâtie sans
    // la collectivité ne doit jamais se présenter comme officielle.
    expect(texte).toContain('sources publiques');
    expect(texte).toContain('sans la commune');
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.3 - Jamais sur un espace client
// ─────────────────────────────────────────────────────────
test.describe('0.35.3 - Encart : la barrière défensive tranche', () => {

  test('0.35.3.1 - Masqué sur un espace client (ex. lumieres)', async ({ page }) => {
    await waitForMapBoot(page, '/ville/lumieres/carte');
    await expect(page.locator('#gp-invite-card')).toBeHidden();
    await expect(page.locator('#gp-invite-pill')).toBeHidden();
  });

  test('0.35.3.2 - Masqué en arrivant par une ancienne adresse client (ex. /bilan)', async ({ page }) => {
    await waitForMapBoot(page, '/bilan');
    expect(new URL(page.url()).pathname).toBe('/ville/rassemblees/carte');
    await expect(page.locator('#gp-invite-card')).toBeHidden();
  });

  test('0.35.3.3 - Jamais en iframe (espace embarqué type Phaos)', async ({ page, baseURL }) => {
    await page.setContent(`<iframe src="${baseURL}${DEMO}" style="width:900px;height:600px"></iframe>`);
    const frame = page.frameLocator('iframe');
    await frame.locator('#gp-sidebar').waitFor({ state: 'visible', timeout: 30000 });
    await expect(frame.locator('#gp-invite-card')).toBeHidden();
  });

  test('0.35.3.4 - Un essai inconnu par l\'ancienne adresse ne charge aucune carte', async ({ page }) => {
    // essai-nexistepas-xyz n'existe pas en base : l'ancienne adresse est
    // redirigée vers /ville/essai-nexistepas-xyz/carte, où l'edge carte-seo
    // sert une page « cette carte n'existe pas » (hors index) au lieu de la
    // démo Lyon sous un mauvais nom.
    const res = await page.goto('/?city=essai-nexistepas-xyz', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);
    expect(res?.headers()['x-robots-tag'] || '').toContain('noindex');
    expect(new URL(page.url()).pathname).toBe('/ville/essai-nexistepas-xyz/carte');
    await expect(page.locator('#gp-invite-card')).toHaveCount(0);
    await expect(page.locator('a[href="/ville/"]')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.4 - Repli et réouverture
// ─────────────────────────────────────────────────────────
test.describe('0.35.4 - Encart : repli réversible', () => {

  test('0.35.4.1 - Fermer replie vers la pastille, sans tout masquer', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await expect(page.locator('#gp-invite-card')).toBeVisible();

    await page.locator('#gp-invite-close').click();

    // Le point du design : fermer ne fait jamais disparaître le rappel.
    await expect(page.locator('#gp-invite-card')).toBeHidden();
    await expect(page.locator('#gp-invite-pill')).toBeVisible();
  });

  test('0.35.4.2 - La pastille rouvre la carte', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await page.locator('#gp-invite-close').click();
    await expect(page.locator('#gp-invite-pill')).toBeVisible();

    await page.locator('#gp-invite-pill').click();

    await expect(page.locator('#gp-invite-card')).toBeVisible();
    await expect(page.locator('#gp-invite-pill')).toBeHidden();
  });

  test('0.35.4.3 - Le repli est retenu au rechargement', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await page.locator('#gp-invite-close').click();
    await expect(page.locator('#gp-invite-pill')).toBeVisible();

    expect(await page.evaluate((k) => localStorage.getItem(k), COLLAPSE_KEY)).toBe('1');

    await waitForMapBoot(page, ESSAI);
    await expect(page.locator('#gp-invite-pill')).toBeVisible();
    await expect(page.locator('#gp-invite-card')).toBeHidden();
  });

  test('0.35.4.4 - Rouvrir efface la préférence de repli', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await page.locator('#gp-invite-close').click();
    await page.locator('#gp-invite-pill').click();
    await expect(page.locator('#gp-invite-card')).toBeVisible();

    expect(await page.evaluate((k) => localStorage.getItem(k), COLLAPSE_KEY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.5 - Le layout n'est plus décalé
// ─────────────────────────────────────────────────────────
test.describe('0.35.5 - Encart : plus aucun décalage de layout', () => {

  test('0.35.5.1 - --banner-h reste à 0px sur l\'espace démo (régression)', async ({ page }) => {
    // L'ancienne barre haute posait --banner-h à 40px et poussait sidebar, dock
    // et fiche projet vers le bas. L'encart flotte : plus rien ne bouge.
    await waitForMapBoot(page);
    await expect(page.locator('#gp-invite-card')).toBeVisible();

    const h = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--banner-h').trim()
    );
    expect(h).toBe('0px');
  });

  test('0.35.5.2 - L\'ancienne bannière n\'existe plus dans la page', async ({ page }) => {
    await waitForMapBoot(page);
    await expect(page.locator('#demo-banner')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.6 - L'encart flotte vraiment, y compris sur téléphone
// ─────────────────────────────────────────────────────────
test.describe('0.35.6 - Encart : ancrage en bas de l\'écran', () => {

  test('0.35.6.1 - La règle de positionnement est bien appliquée (régression)', async ({ page }) => {
    // Un « */ » au milieu du commentaire d'en-tête de gp-invite.css fermait le
    // commentaire trop tôt, et la récupération d'erreur du parseur avalait la
    // règle `#gp-invite` juste derrière : l'encart retombait en position static,
    // donc en haut de la page, par-dessus le logo et le dock.
    await waitForMapBoot(page, DEMO);
    await expect(page.locator('#gp-invite-card')).toBeVisible();

    const pos = await page.evaluate(() =>
      getComputedStyle(document.getElementById('gp-invite')).position
    );
    expect(pos).toBe('fixed');
  });

  test.describe('sur un écran de téléphone', () => {
    test.use({ viewport: { width: 390, height: 664 } });

    test('0.35.6.2 - Posé en bas, sans recouvrir le logo ni le dock', async ({ page }) => {
      await waitForMapBoot(page, DEMO);
      const carte = page.locator('#gp-invite-card');
      await expect(carte).toBeVisible();

      const encart = await carte.boundingBox();
      const dock = await page.locator('.toggle-dock').boundingBox();
      expect(encart).not.toBeNull();
      expect(dock).not.toBeNull();

      // Il est ancré en bas, juste au-dessus de la capsule de navigation.
      expect(encart.y + encart.height).toBeGreaterThan(664 - 120);
      expect(encart.y + encart.height).toBeLessThan(664);
      // Et il commence sous le dock, qui garde son coin.
      expect(encart.y).toBeGreaterThan(dock.y + dock.height);
    });
  });
});

// ─────────────────────────────────────────────────────────
// 0.36 - Crédits du fond de carte
// ─────────────────────────────────────────────────────────
test.describe('0.36 - Crédits MapLibre dans le panneau Fond de carte', () => {

  test('0.36.1 - Les crédits vivent dans le pied du panneau, pas sur la carte', async ({ page }) => {
    await waitForMapBoot(page);

    await page.locator('#basemap-toggle').click();
    await expect(page.locator('#basemap-menu')).toBeVisible();

    const credits = page.locator('#basemap-menu .dock-panel__credits-text');
    await expect(credits).toBeVisible();
    expect((await credits.innerText()).trim().length).toBeGreaterThan(0);

    // Le contrôle d'origine est retiré de la vue, le coin appartient à l'encart
    await expect(page.locator('#map .maplibregl-ctrl-attrib')).toBeHidden();
  });

  test('0.36.2 - Les crédits survivent à une reconstruction du panneau', async ({ page }) => {
    // initBasemapMenu fait `innerHTML = ''` : sans la mise à l'abri du nœud,
    // les crédits disparaîtraient définitivement au second appel.
    await waitForMapBoot(page);
    await page.evaluate(() => window.UIModule?.initBasemapMenu());

    await page.locator('#basemap-toggle').click();
    await expect(page.locator('#basemap-menu')).toBeVisible();
    await expect(
      page.locator('#basemap-menu .dock-panel__credits-text')
    ).toBeVisible();
  });
});
