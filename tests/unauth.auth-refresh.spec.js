// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Refresh proactif et dégradation gracieuse (modules/auth.js).
 *
 * L'en-tête du module annonce trois garanties : refresh toutes les 4 minutes,
 * refresh immédiat au retour sur l'onglet, et basculement propre en mode non
 * connecté après trois échecs. Aucune n'était vérifiée, et le chemin d'échec
 * est justement celui qui compte : c'est lui qui évite l'écran blanc.
 */

/**
 * Charge la carte et installe `window.__pilote(mode)`, qui remplace le client
 * Supabase par un client dont on choisit le comportement :
 *   'ok'     → refresh réussi
 *   'erreur' → refreshSession renvoie une erreur
 *   'leve'   → refreshSession lève (réseau coupé)
 */
async function ouvrir(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AuthModule?.forceRefresh, null, { timeout: 20000 });
  await page.evaluate(() => {
    const client = window.AuthModule.getClient();
    if (!window.__vraiAuth) window.__vraiAuth = client.auth;
    window.__appels = 0;
    window.__pilote = (mode, delaiMs = 0) => {
      client.auth = Object.assign(Object.create(window.__vraiAuth), {
        refreshSession: async () => {
          window.__appels++;
          if (delaiMs) await new Promise((r) => setTimeout(r, delaiMs));
          if (mode === 'leve') throw new Error('reseau coupe');
          if (mode === 'erreur') return { data: null, error: { message: 'refresh_token_not_found' } };
          return {
            data: { session: { user: { id: 'u1' }, expires_at: Math.floor(Date.now() / 1000) + 3600 } },
            error: null,
          };
        },
        getSession: async () => ({ data: { session: null } }),
      });
    };
  });
}

test.describe('0.61 - Auth : refresh de session', () => {

  test('0.61.1 - Un refresh réussi met la session en cache', async ({ page }) => {
    await ouvrir(page);
    const r = await page.evaluate(async () => {
      window.__pilote('ok');
      const ok = await window.AuthModule.forceRefresh();
      return { ok, authentifie: window.AuthModule.isAuthenticated(), appels: window.__appels };
    });
    expect(r.ok).toBe(true);
    expect(r.authentifie).toBe(true);
    expect(r.appels).toBe(1);
  });

  test('0.61.2 - Un refresh en échec ne détruit pas la session du premier coup', async ({ page }) => {
    await ouvrir(page);
    const r = await page.evaluate(async () => {
      window.__pilote('ok');
      await window.AuthModule.forceRefresh();
      window.__pilote('erreur');
      const premier = await window.AuthModule.forceRefresh();
      return { premier, encoreAuthentifie: window.AuthModule.isAuthenticated() };
    });
    expect(r.premier).toBe(false);
    // Un échec isolé est un incident réseau, pas une déconnexion
    expect(r.encoreAuthentifie).toBe(true);
  });

  test('0.61.3 - Trois échecs consécutifs font basculer en mode non connecté', async ({ page }) => {
    await ouvrir(page);
    const r = await page.evaluate(async () => {
      window.__pilote('ok');
      await window.AuthModule.forceRefresh();
      window.__CONTRIB_ROLE = 'admin';
      window.__CONTRIB_IS_ADMIN = true;
      window.__CONTRIB_VILLES = ['lyon'];
      window.__pilote('erreur');
      const etats = [];
      for (let i = 0; i < 3; i++) {
        await window.AuthModule.forceRefresh();
        etats.push(window.AuthModule.isAuthenticated());
      }
      return {
        etats,
        role: window.__CONTRIB_ROLE,
        admin: window.__CONTRIB_IS_ADMIN,
        villes: window.__CONTRIB_VILLES,
      };
    });
    expect(r.etats).toEqual([true, true, false]);
    // Le basculement remet à plat tout ce qui accordait des droits
    expect(r.role).toBe('');
    expect(r.admin).toBe(false);
    expect(r.villes).toBeNull();
  });

  test('0.61.4 - RÉGRESSION : un refresh qui LÈVE compte comme un échec', async ({ page }) => {
    await ouvrir(page);
    // La branche catch incrémentait le compteur sans jamais tester le seuil :
    // réseau coupé, le compteur montait à l'infini et le basculement gracieux
    // n'arrivait jamais. C'est le scénario même de l'écran blanc.
    const r = await page.evaluate(async () => {
      window.__pilote('ok');
      await window.AuthModule.forceRefresh();
      window.__CONTRIB_ROLE = 'admin';
      window.__pilote('leve');
      const etats = [];
      for (let i = 0; i < 3; i++) {
        await window.AuthModule.forceRefresh();
        etats.push(window.AuthModule.isAuthenticated());
      }
      return { etats, role: window.__CONTRIB_ROLE };
    });
    expect(r.etats).toEqual([true, true, false]);
    expect(r.role).toBe('');
  });

  test("0.61.5 - Un succès remet le compteur d'échecs à zéro", async ({ page }) => {
    await ouvrir(page);
    const r = await page.evaluate(async () => {
      window.__pilote('ok');
      await window.AuthModule.forceRefresh();
      window.__pilote('erreur');
      await window.AuthModule.forceRefresh();
      await window.AuthModule.forceRefresh();
      // Deux échecs, puis une reprise : le crédit doit repartir de zéro
      window.__pilote('ok');
      await window.AuthModule.forceRefresh();
      window.__pilote('erreur');
      const etats = [];
      for (let i = 0; i < 2; i++) {
        await window.AuthModule.forceRefresh();
        etats.push(window.AuthModule.isAuthenticated());
      }
      return etats;
    });
    // Sans remise à zéro, le deuxième échec aurait atteint le seuil
    expect(r).toEqual([true, true]);
  });

  test("0.61.6 - Trois refresh concurrents ne provoquent qu'un seul appel réseau", async ({ page }) => {
    await ouvrir(page);
    const r = await page.evaluate(async () => {
      window.__appels = 0;
      window.__pilote('ok', 120);
      await Promise.all([
        window.AuthModule.forceRefresh(),
        window.AuthModule.forceRefresh(),
        window.AuthModule.forceRefresh(),
      ]);
      return window.__appels;
    });
    expect(r).toBe(1);
  });

  test('0.61.7 - Les constantes de rythme correspondent à ce qui est annoncé', async ({ page }) => {
    await ouvrir(page);
    // 4 min de vérification, 10 min de marge avant expiration, 3 échecs :
    // ces trois valeurs sont le contrat du module, écrit dans son en-tête.
    const src = await page.evaluate(async () => {
      const r = await fetch('/modules/auth.js');
      return r.text();
    });
    expect(src).toContain('CHECK_INTERVAL_MS = 4 * 60 * 1000');
    expect(src).toContain('REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000');
    expect(src).toContain('MAX_REFRESH_FAILURES = 3');
  });

});
