// @ts-check
// Tests E2E de l'encart d'invitation (index.html inline + styles/gp-invite.css)
// et du rendu des crédits du fond de carte dans le panneau « Fond de carte ».
//
// Ce fichier remplace unauth.demo-banner.spec.js et unauth.essai-invite.spec.js :
// #demo-banner et #essai-invite ont fusionné en un composant à deux variantes.
//
// Contrat de visibilité :
//   - variante « demo »  sur l'espace de démonstration ('', default, metropole-lyon)
//   - variante « essai » sur les cartes générées au salon (?city=essai-*)
//   - rien sur un espace client, jamais en iframe (Phaos)
//   - après boot, main.js appelle window.__syncInvite(cityRésolue) - barrière
//     défensive qui MASQUE (jamais l'inverse) : un essai-* absent de VALID_CITIES
//     retombe sur metropole-lyon côté CityManager
//   - fermer REPLIE vers une pastille (gp-invite-collapsed = '1'), jamais ne masque
//
// Sections : 0.35 - Encart d'invitation · 0.36 - Crédits du fond de carte

import { test, expect } from '@playwright/test';

const COLLAPSE_KEY = 'gp-invite-collapsed';

// Espace d'essai réellement présent en base (donc dans VALID_CITIES) : sans ça,
// CityManager retomberait sur metropole-lyon et la barrière masquerait l'encart.
const ESSAI = '/?city=essai-auray';

/**
 * Attend que la carte soit chargée (Phase 6+), donc que la barrière défensive
 * post-boot ait eu lieu. Sans cette attente, un test peut passer avant elle.
 */
async function waitForMapBoot(page, path = '/') {
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

  test('0.35.1.1 - Visible sur / (espace démo par défaut)', async ({ page }) => {
    await waitForMapBoot(page, '/');
    await expect(page.locator('#gp-invite-card')).toBeVisible();
    await expect(variante(page, 'demo')).toBeVisible();
    await expect(variante(page, 'essai')).toBeHidden();
  });

  test('0.35.1.2 - Visible avec ?city=metropole-lyon explicite', async ({ page }) => {
    await waitForMapBoot(page, '/?city=metropole-lyon');
    await expect(variante(page, 'demo')).toBeVisible();
  });

  test('0.35.1.3 - Visible sur /index.html (seul segment de path autorisé)', async ({ page }) => {
    await waitForMapBoot(page, '/index.html');
    await expect(variante(page, 'demo')).toBeVisible();
  });

  test('0.35.1.4 - Le CTA pointe vers /home/contact avec attribution ?ref=', async ({ page }) => {
    await waitForMapBoot(page, '/');
    await expect(variante(page, 'demo').locator('.gp-invite__cta'))
      .toHaveAttribute('href', /\/home\/contact\?ref=/);
  });

  test('0.35.1.5 - Le copy ne promet pas « sans inscription » (régression)', async ({ page }) => {
    await waitForMapBoot(page, '/');
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
      .toHaveAttribute('href', 'https://openprojets.com/home?ref=essai-invite');
    await expect(bloc.locator('.gp-invite__link'))
      .toHaveAttribute('href', 'https://openprojets.com/default');
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

  test('0.35.3.1 - Masqué avec ?city= client (ex. lumieres)', async ({ page }) => {
    await waitForMapBoot(page, '/?city=lumieres');
    await expect(page.locator('#gp-invite-card')).toBeHidden();
    await expect(page.locator('#gp-invite-pill')).toBeHidden();
  });

  test('0.35.3.2 - Masqué sur une route ville par path (ex. /bilan)', async ({ page }) => {
    await waitForMapBoot(page, '/bilan');
    await expect(page.locator('#gp-invite-card')).toBeHidden();
  });

  test('0.35.3.3 - Jamais en iframe (espace embarqué type Phaos)', async ({ page, baseURL }) => {
    await page.setContent(`<iframe src="${baseURL}/" style="width:900px;height:600px"></iframe>`);
    const frame = page.frameLocator('iframe');
    await frame.locator('#gp-sidebar').waitFor({ state: 'visible', timeout: 30000 });
    await expect(frame.locator('#gp-invite-card')).toBeHidden();
  });

  test('0.35.3.4 - Un essai inconnu bascule sur le message de la démo', async ({ page }) => {
    // essai-nexistepas-xyz n'est pas dans VALID_CITIES : CityManager résout
    // metropole-lyon. Le visiteur est donc bel et bien sur la démo Lyon, et
    // doit lire ce message-là - pas celui d'une carte d'essai qui n'existe pas.
    await waitForMapBoot(page, '/?city=essai-nexistepas-xyz');
    await expect(variante(page, 'essai')).toBeHidden();
    await expect(variante(page, 'demo')).toBeVisible();
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
    await waitForMapBoot(page, '/');
    await expect(page.locator('#gp-invite-card')).toBeVisible();

    const h = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--banner-h').trim()
    );
    expect(h).toBe('0px');
  });

  test('0.35.5.2 - L\'ancienne bannière n\'existe plus dans la page', async ({ page }) => {
    await waitForMapBoot(page, '/');
    await expect(page.locator('#demo-banner')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────
// 0.36 - Crédits du fond de carte
// ─────────────────────────────────────────────────────────
test.describe('0.36 - Crédits MapLibre dans le panneau Fond de carte', () => {

  test('0.36.1 - Les crédits vivent dans le pied du panneau, pas sur la carte', async ({ page }) => {
    await waitForMapBoot(page, '/');

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
    await waitForMapBoot(page, '/');
    await page.evaluate(() => window.UIModule?.initBasemapMenu());

    await page.locator('#basemap-toggle').click();
    await expect(page.locator('#basemap-menu')).toBeVisible();
    await expect(
      page.locator('#basemap-menu .dock-panel__credits-text')
    ).toBeVisible();
  });
});
