// @ts-check
// Tests E2E du module phaos-auth.js - comportement en iframe et en navigation directe.
//
// Couverture :
//   - Navigation directe (hors iframe) : PhaosAuth est no-op, carte chargée normalement
//   - Mode iframe avec postMessage token invalide : échange échoué → résilience → carte chargée
//
// Non testé en E2E (voir phaos-integration.md) :
//   - Timeout 15s (trop lent pour CI)
//   - Flow renouvellement TOKEN_EXPIRED → ID_TOKEN (nécessite un vrai token Azure)
//   - Session active après échange réussi (nécessite un vrai token Azure)
//
// Section : 0.4 - SSO Phaos / Module iframe

import { test, expect } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Attend que la carte soit chargée (Phase 6+) en navigation directe.
 * En mode iframe, le sidebar est le signal le plus stable.
 */
async function waitForMapBoot(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector('#filters-toggle')?.getAttribute('data-ready') === 'true',
    { timeout: 25000 }
  );
}

/**
 * Attend que la carte soit visible dans l'iframe embarquée.
 */
async function waitForIframeBoot(frame) {
  await frame.locator('#gp-sidebar').waitFor({ state: 'visible', timeout: 30000 });
  await frame.locator('#map').waitFor({ state: 'visible', timeout: 10000 });
}

// ─────────────────────────────────────────────────────────
// 0.4.1 - Navigation directe (hors iframe)
// ─────────────────────────────────────────────────────────
test.describe('0.4.1 - PhaosAuth : navigation directe (no-op)', () => {

  test('0.4.1.1 - Carte chargée normalement sans blocage phaos-auth', async ({ page }) => {
    // En navigation directe : window.self === window.top
    // → PhaosAuth.waitForSession() résout immédiatement
    // → aucun impact sur l'init normale
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await waitForMapBoot(page);

    expect(await page.locator('#gp-sidebar').isVisible()).toBe(true);

    // Pas d'erreur console liée à PhaosAuth
    const phaosErrors = errors.filter(e => e.includes('PhaosAuth'));
    expect(phaosErrors).toHaveLength(0);
  });

  test('0.4.1.2 - window.PhaosAuth exposé avec waitForSession', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => typeof window.PhaosAuth?.waitForSession === 'function',
      { timeout: 10000 }
    );
    const resolves = await page.evaluate(async () => {
      const result = await window.PhaosAuth.waitForSession();
      return result === undefined; // Promise.resolve() → undefined
    });
    expect(resolves).toBe(true);
  });

});

// ─────────────────────────────────────────────────────────
// 0.4.2 - Mode iframe avec token invalide (résilience)
// ─────────────────────────────────────────────────────────
test.describe('0.4.2 - PhaosAuth : iframe + token invalide → résilience', () => {

  test('0.4.2.1 - Carte chargée en mode iframe même si échange token échoue', async ({ page }) => {
    // La fixture phaos-host.html simule l'app Phaos :
    //   - Embarque la carte dans une iframe
    //   - Envoie un faux ID_TOKEN via postMessage (origin localhost:3001)
    //   - Le token est invalide → /api/auth/token retourne 400
    //   - phaos-auth.js résout quand même → carte chargée hors session
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/tests/fixtures/phaos-host.html', { waitUntil: 'domcontentloaded' });

    const frame = page.frameLocator('#map-frame');
    await waitForIframeBoot(frame);

    // La carte est visible dans l'iframe
    await expect(frame.locator('#gp-sidebar')).toBeVisible();
    await expect(frame.locator('#map')).toBeVisible();

    // Pas d'erreur critique (erreurs WebGL/MapLibre en headless sont normales)
    const criticalErrors = errors.filter(e =>
      !e.includes('WebGL') &&
      !e.includes('maplibregl') &&
      !e.includes('Failed to initialize WebGL')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('0.4.2.2 - Aucun loader infini après échec échange token', async ({ page }) => {
    await page.goto('/tests/fixtures/phaos-host.html', { waitUntil: 'domcontentloaded' });

    const frame = page.frameLocator('#map-frame');
    // Le sidebar doit apparaître en moins de 20s (bien avant le timeout de 15s phaos-auth
    // car le fake token provoque un rejet rapide < 1s qui résout la session Promise)
    await frame.locator('#gp-sidebar').waitFor({ state: 'visible', timeout: 20000 });

    // Aucun loader visible (si la Promise ne s'était pas résolue, le loader resterait)
    const loaderVisible = await frame.locator('#loading-screen, [data-loading="true"]')
      .isVisible()
      .catch(() => false);
    expect(loaderVisible).toBe(false);
  });

  test('0.4.2.3 - window.PhaosAuth détecte bien le mode iframe', async ({ page }) => {
    await page.goto('/tests/fixtures/phaos-host.html', { waitUntil: 'domcontentloaded' });

    // Attendre que phaos-auth.js ait initialisé PhaosAuth dans l'iframe.
    // Note : #gp-sidebar est dans le HTML statique (display:flex), donc waitFor({ state: 'visible' })
    // ne garantit pas que les scripts defer aient tourné. On attend directement la condition cible.
    await page.waitForFunction(() => {
      try {
        const iframe = document.querySelector('#map-frame');
        return typeof iframe?.contentWindow?.PhaosAuth?.waitForSession === 'function';
      } catch { return false; }
    }, { timeout: 30000 });

    // Si on arrive ici, la condition est déjà vraie - on l'évalue pour la lisibilité du rapport
    const phaosAuthExists = await page.evaluate(() => {
      try {
        const iframe = document.querySelector('#map-frame');
        return typeof iframe?.contentWindow?.PhaosAuth?.waitForSession === 'function';
      } catch { return false; }
    });
    expect(phaosAuthExists).toBe(true);
  });

  test('0.4.2.4 - Mode iframe détecté même avec document.referrer vide (régression Phaos QA/prod)', async ({ page }) => {
    // Régression : en prod, Phaos applique une Referrer-Policy stricte → document.referrer
    // est "" dans l'iframe. L'ancienne détection (PHAOS_ORIGINS.includes(referrer)) renvoyait
    // alors false → module no-op → le postMessage ID_TOKEN n'était jamais écouté → SSO cassé.
    // La détection ne doit plus dépendre du referrer : la sécurité vient de event.origin.
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('/tests/fixtures/phaos-host-noreferrer.html', { waitUntil: 'domcontentloaded' });

    const frame = page.frameLocator('#map-frame');
    await frame.locator('#gp-sidebar').waitFor({ state: 'visible', timeout: 30000 });

    // Précondition : le referrer est bien vide dans l'iframe (sinon le test ne prouve rien)
    const childFrame = page.frames().find(f => f.url().includes('city=metropole-lyon'));
    const referrer = await childFrame?.evaluate(() => document.referrer);
    expect(referrer).toBe('');

    // Malgré le referrer vide, le listener postMessage doit être actif et avoir reçu le token.
    // (avec l'ancien code, aucun log "[PhaosAuth] …" n'apparaissait car le module était no-op)
    await expect
      .poll(() => logs.some(l => l.includes('[PhaosAuth] ID_TOKEN reçu')), { timeout: 15000 })
      .toBe(true);
  });

});
