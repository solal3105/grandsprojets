// @ts-check
// Tests E2E de l'invitation des espaces d'essai (index.html inline + styles/essai-invite.css)
//
// Contrat de visibilité :
//   - Affichée UNIQUEMENT sur un espace d'essai : ville résolue = essai-*
//   - Jamais sur l'espace démo (/ et ?city=metropole-lyon), où #demo-banner règne
//   - Jamais en iframe (espace client Phaos)
//   - Après boot, main.js appelle window.__syncEssaiInvite(cityRésolue) - barrière
//     défensive qui MASQUE si la ville résolue n'est pas un essai (jamais l'inverse) :
//     un essai-* absent de VALID_CITIES retombe sur metropole-lyon côté CityManager
//   - Fermer REPLIE vers une pastille (gp-essai-invite-collapsed = '1'), jamais ne masque :
//     le visiteur de salon doit toujours pouvoir revenir au lien
//
// Section : 0.35 - Invitation espaces d'essai

import { test, expect } from '@playwright/test';

const COLLAPSE_KEY = 'gp-essai-invite-collapsed';

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

// ─────────────────────────────────────────────────────────
// 0.35.1 - Visibilité
// ─────────────────────────────────────────────────────────
test.describe('0.35.1 - Invitation essai : visibilité', () => {

  test('0.35.1.1 - Visible sur un espace d\'essai', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await expect(page.locator('#essai-invite-card')).toBeVisible();
  });

  test('0.35.1.2 - Absente sur l\'espace démo par défaut', async ({ page }) => {
    await waitForMapBoot(page, '/');
    await expect(page.locator('#essai-invite-card')).toBeHidden();
    await expect(page.locator('#essai-invite-pill')).toBeHidden();
  });

  test('0.35.1.3 - Absente sur ?city=metropole-lyon', async ({ page }) => {
    await waitForMapBoot(page, '/?city=metropole-lyon');
    await expect(page.locator('#essai-invite-card')).toBeHidden();
  });

  test('0.35.1.4 - Jamais en iframe (espace embarqué type Phaos)', async ({ page, baseURL }) => {
    await page.setContent(`<iframe src="${baseURL}${ESSAI}" style="width:900px;height:600px"></iframe>`);
    const frame = page.frameLocator('iframe');
    await frame.locator('#gp-sidebar').waitFor({ state: 'visible', timeout: 30000 });
    await expect(frame.locator('#essai-invite-card')).toBeHidden();
  });

  test('0.35.1.5 - Un essai inconnu retombe sur la démo : la barrière masque', async ({ page }) => {
    // essai-nexistepas n'est pas dans VALID_CITIES : CityManager résout
    // metropole-lyon, __syncEssaiInvite doit alors masquer l'encart.
    await waitForMapBoot(page, '/?city=essai-nexistepas-xyz');
    await expect(page.locator('#essai-invite-card')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.2 - Exclusivité avec la bannière démo
// ─────────────────────────────────────────────────────────
test.describe('0.35.2 - Invitation essai : jamais en concurrence', () => {

  test('0.35.2.1 - Sur un essai, la bannière démo reste absente', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await expect(page.locator('#essai-invite-card')).toBeVisible();
    await expect(page.locator('#demo-banner')).toBeHidden();
  });

  test('0.35.2.2 - Sur la démo, c\'est la bannière et pas l\'encart', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#demo-banner')).toBeVisible();
    await expect(page.locator('#essai-invite-card')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.3 - Repli et réouverture
// ─────────────────────────────────────────────────────────
test.describe('0.35.3 - Invitation essai : repli réversible', () => {

  test('0.35.3.1 - Fermer replie vers la pastille, sans tout masquer', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await expect(page.locator('#essai-invite-card')).toBeVisible();

    await page.locator('#essai-invite-close').click();

    // Le point du design : fermer ne fait jamais disparaître le rappel.
    await expect(page.locator('#essai-invite-card')).toBeHidden();
    await expect(page.locator('#essai-invite-pill')).toBeVisible();
  });

  test('0.35.3.2 - La pastille rouvre la carte', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await page.locator('#essai-invite-close').click();
    await expect(page.locator('#essai-invite-pill')).toBeVisible();

    await page.locator('#essai-invite-pill').click();

    await expect(page.locator('#essai-invite-card')).toBeVisible();
    await expect(page.locator('#essai-invite-pill')).toBeHidden();
  });

  test('0.35.3.3 - Le repli est retenu au rechargement', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await page.locator('#essai-invite-close').click();
    await expect(page.locator('#essai-invite-pill')).toBeVisible();

    expect(await page.evaluate((k) => localStorage.getItem(k), COLLAPSE_KEY)).toBe('1');

    await waitForMapBoot(page, ESSAI);
    await expect(page.locator('#essai-invite-pill')).toBeVisible();
    await expect(page.locator('#essai-invite-card')).toBeHidden();
  });

  test('0.35.3.4 - Rouvrir efface la préférence de repli', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    await page.locator('#essai-invite-close').click();
    await page.locator('#essai-invite-pill').click();
    await expect(page.locator('#essai-invite-card')).toBeVisible();

    expect(await page.evaluate((k) => localStorage.getItem(k), COLLAPSE_KEY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// 0.35.4 - Contenu et liens
// ─────────────────────────────────────────────────────────
test.describe('0.35.4 - Invitation essai : contenu', () => {

  test('0.35.4.1 - Les deux destinations demandées sont proposées', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    const card = page.locator('#essai-invite-card');

    await expect(card.locator('.essai-invite__cta')).toHaveAttribute(
      'href', 'https://openprojets.com/home?ref=essai-invite'
    );
    await expect(card.locator('.essai-invite__link')).toHaveAttribute(
      'href', 'https://openprojets.com/default'
    );
  });

  test('0.35.4.2 - La carte dit qu\'elle est incomplète, sans la commune', async ({ page }) => {
    await waitForMapBoot(page, ESSAI);
    const texte = (await page.locator('#essai-invite-card').innerText()).toLowerCase();

    // Même franchise que le message envoyé au visiteur : une carte bâtie sans
    // la collectivité ne doit jamais se présenter comme officielle.
    expect(texte).toContain('sources publiques');
    expect(texte).toContain('sans la commune');
  });
});
