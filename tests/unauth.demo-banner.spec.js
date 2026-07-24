// @ts-check
// Tests E2E de la bannière démo (index.html inline + styles/demo-banner.css)
//
// Contrat de visibilité :
//   - Affichée UNIQUEMENT sur l'espace démo : ville résolue ∈ {vide, default, metropole-lyon}
//   - La ville est résolue en synchrone : path (route-config : /bilan, /annecy…) → ?city= →
//     localStorage.activeCity (réplique fail-safe de resolveActiveCity : tout path/?city= non
//     reconnu → pas de bannière)
//   - Jamais en iframe (espace client Phaos)
//   - Après boot, main.js appelle window.__syncDemoBanner(cityRésolue) - barrière défensive qui MASQUE
//     la bannière si la ville résolue n'est pas l'espace démo (jamais l'inverse)
//   - Fermeture persistée 7 jours (localStorage gp-demo-banner-dismissed = timestamp)
//
// Section : 0.30 - Bannière démo

import { test, expect } from '@playwright/test';

const DISMISS_KEY = 'gp-demo-banner-dismissed';

/**
 * Attend que la carte soit chargée (Phase 6+).
 */
async function waitForMapBoot(page, path = '/') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector('#filters-toggle')?.getAttribute('data-ready') === 'true',
    { timeout: 25000 }
  );
}

async function bannerDisplay(page) {
  return page.evaluate(() => {
    const el = document.getElementById('demo-banner');
    return el ? getComputedStyle(el).display : 'absent';
  });
}

async function bannerHeightVar(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--banner-h').trim()
  );
}

// ─────────────────────────────────────────────────────────
// 0.30.1 - Visibilité sur l'espace démo
// ─────────────────────────────────────────────────────────
test.describe('0.30.1 - Bannière démo : visibilité sur l\'espace démo', () => {

  test('0.30.1.1 - Visible sur / (espace démo par défaut)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#demo-banner')).toBeVisible();
    expect(await bannerHeightVar(page)).not.toBe('0px');
  });

  test('0.30.1.2 - Visible avec ?city=metropole-lyon explicite', async ({ page }) => {
    await waitForMapBoot(page, '/?city=metropole-lyon');
    await expect(page.locator('#demo-banner')).toBeVisible();
  });

  test('0.30.1.3 - Toujours visible après le boot complet (pas masquée par __syncDemoBanner)', async ({ page }) => {
    await waitForMapBoot(page);
    await expect(page.locator('#demo-banner')).toBeVisible();
  });

  test('0.30.1.4 - Visible sur /index.html (seul segment de path autorisé)', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#demo-banner')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 0.30.2 - Jamais sur un espace client
// ─────────────────────────────────────────────────────────
test.describe('0.30.2 - Bannière démo : jamais sur un espace client', () => {

  test('0.30.2.1 - Masquée avec ?city= client (ex. lumieres)', async ({ page }) => {
    await page.goto('/?city=lumieres', { waitUntil: 'domcontentloaded' });
    expect(await bannerDisplay(page)).toBe('none');
    expect(await bannerHeightVar(page)).toBe('0px');
  });

  test('0.30.2.2 - Masquée quand une ville cliente est persistée en localStorage', async ({ page }) => {
    // Un client dont la ville est en localStorage revient sur / sans ?city=
    await page.addInitScript(() => {
      try { localStorage.setItem('activeCity', 'lumieres'); } catch { /* no-op */ }
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await bannerDisplay(page)).toBe('none');
  });

  test('0.30.2.4 - Masquée sur une route ville par path (ex. /bilan, régression)', async ({ page }) => {
    // route-config.js mappe /bilan → rassemblees ; le catch-all _redirects sert index.html.
    // Avant ou après la redirection applyRedirect, la bannière doit être masquée -
    // poll résilient car applyRedirect peut naviguer pendant l'assertion.
    await page.goto('/bilan', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => {
      try { return await bannerDisplay(page); } catch { return 'navigation'; }
    }, { timeout: 5000 }).toBe('none');
  });

  test('0.30.2.3 - Jamais en iframe (espace embarqué type Phaos)', async ({ page, baseURL }) => {
    await page.setContent(`<iframe src="${baseURL}/" style="width:900px;height:600px"></iframe>`);
    const frame = page.frameLocator('iframe');
    await frame.locator('#gp-sidebar').waitFor({ state: 'visible', timeout: 30000 });
    await expect(frame.locator('#demo-banner')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────
// 0.30.3 - Copy et lien
// ─────────────────────────────────────────────────────────
test.describe('0.30.3 - Bannière démo : copy et attribution', () => {

  test('0.30.3.1 - Le copy ne promet pas « sans inscription » (régression)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const text = (await page.locator('#demo-banner').innerText()).toLowerCase();
    expect(text).not.toContain('sans inscription');
  });

  test('0.30.3.2 - Le CTA pointe vers /home/contact avec attribution ?ref=', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cta = page.locator('#demo-banner .demo-banner__cta');
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute('href');
    expect(href).toContain('/home/contact');
    expect(href).toContain('ref=demo-banner');
    // Lien externe sécurisé
    expect(await cta.getAttribute('rel')).toContain('noopener');
  });
});

// ─────────────────────────────────────────────────────────
// 0.30.4 - Fermeture et persistance
// ─────────────────────────────────────────────────────────
test.describe('0.30.4 - Bannière démo : fermeture persistée', () => {

  test('0.30.4.1 - Le clic sur (x) masque la bannière et libère --banner-h', async ({ page }) => {
    // Motion réduit : neutralise le délai d'entrée de 1,2 s (clic immédiat et
    // déterministe) et couvre le chemin prefers-reduced-motion du CSS
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#demo-banner')).toBeVisible();
    await page.locator('#demo-banner-close').click();
    await expect(page.locator('#demo-banner')).toBeHidden({ timeout: 2000 });
    expect(await bannerHeightVar(page)).toBe('0px');
    // Le dismiss est persisté avec un timestamp
    const stored = await page.evaluate((k) => localStorage.getItem(k), DISMISS_KEY);
    expect(Number(stored)).toBeGreaterThan(0);
  });

  test('0.30.4.2 - Dismiss récent → bannière absente au rechargement', async ({ page }) => {
    await page.addInitScript((k) => {
      try { localStorage.setItem(k, String(Date.now())); } catch { /* no-op */ }
    }, DISMISS_KEY);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await bannerDisplay(page)).toBe('none');
  });

  test('0.30.4.3 - Dismiss expiré (> 7 jours) → bannière réaffichée', async ({ page }) => {
    await page.addInitScript((k) => {
      try { localStorage.setItem(k, String(Date.now() - 8 * 24 * 3600 * 1000)); } catch { /* no-op */ }
    }, DISMISS_KEY);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#demo-banner')).toBeVisible();
  });
});
