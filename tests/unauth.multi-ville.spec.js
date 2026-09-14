// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Multi-ville : le cœur du produit, et le mécanisme le moins testé.
 *
 * Le nom, le code et le logo d'une structure viennent de `city_branding`,
 * donc d'un administrateur : tout ce qui en sort est traité comme du contenu
 * non fiable. La popup de sélection de structure (section 0.58) a disparu avec
 * les adresses /ville/{ville}/carte : la page de connexion envoie chacun sur
 * sa carte.
 */

test.describe('0.59 - Multi-ville : branding appliqué au document', () => {

  test('0.59.1 - Seule une couleur hexadécimale à 6 chiffres est appliquée', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CityBrandingModule, null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const lire = () => document.documentElement.style.getPropertyValue('--color-primary');
      const B = window.CityBrandingModule;
      B.applyPrimaryColor('#123456');
      const valide = lire();
      const refuses = [];
      for (const c of ['#FFF', 'red', 'rgb(1,2,3)', '#12345', '#1234567',
        '#123456; background:url(javascript:alert(1))', 'var(--x)', '', null, undefined]) {
        B.applyPrimaryColor(c);
        refuses.push(lire());
      }
      return { valide, refuses };
    });
    expect(r.valide).toBe('#123456');
    // Aucune valeur refusée n'a écrasé la précédente
    expect(r.refuses.every((v) => v === '#123456')).toBe(true);
  });

  test('0.59.2 - Un favicon à schéma dangereux retombe sur le favicon par défaut', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CityBrandingModule, null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const B = window.CityBrandingModule;
      const lire = () => document.querySelector('link[rel="icon"]')?.getAttribute('href') || '';
      B.applyFavicon('javascript:alert(1)');
      const apresDanger = lire();
      B.applyFavicon(null);
      const apresNull = lire();
      B.applyFavicon('/img/logos/custom.png');
      return { apresDanger, apresNull, apresValide: lire() };
    });
    expect(r.apresDanger).not.toContain('javascript:');
    expect(r.apresDanger).toContain('favicon.png');
    expect(r.apresNull).toContain('favicon.png');
    expect(r.apresValide).toBe('/img/logos/custom.png');
  });

  test('0.59.3 - Le favicon et son pendant Apple restent alignés', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CityBrandingModule, null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      window.CityBrandingModule.applyFavicon('/img/logos/x.png');
      return {
        icon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
        apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
      };
    });
    expect(r.icon).toBe('/img/logos/x.png');
    expect(r.apple).toBe('/img/logos/x.png');
  });

});

test.describe('0.60 - Multi-ville : résolution de la structure active', () => {

  test('0.60.1 - getActiveCity valide toujours le code renvoyé', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.supabaseService && window.CityManager, null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const vrai = window.CityManager.getActiveCity;
      const out = {};
      try {
        for (const [nom, valeur] of Object.entries({
          valide: 'metropole-lyon',
          chiffres: 'paris-14',
          injection: 'lyon/../autre-ville',
          espace: 'lyon autre',
          pointVirgule: 'lyon;drop',
          accent: 'métropole',
          vide: '',
        })) {
          window.CityManager.getActiveCity = () => valeur;
          out[nom] = window.supabaseService.getActiveCity();
        }
      } finally {
        window.CityManager.getActiveCity = vrai;
      }
      return out;
    });
    expect(r.valide).toBe('metropole-lyon');
    expect(r.chiffres).toBe('paris-14');
    // Aucun code hors format ne ressort tel quel : il ne doit jamais atteindre
    // une requête PostgREST portant sur la colonne `ville`.
    for (const cle of ['injection', 'espace', 'pointVirgule', 'accent']) {
      expect(r[cle], cle).not.toBe(cle);
      expect(/^[a-z0-9-]*$/i.test(r[cle]), `${cle} -> ${r[cle]}`).toBe(true);
    }
  });

  test('0.60.2 - Sans aucune source, la structure par défaut est servie', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.supabaseService, null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const vraiCM = window.CityManager;
      const vraiActive = window.activeCity;
      try {
        window.CityManager = undefined;
        window.activeCity = undefined;
        return window.supabaseService.getActiveCity();
      } finally {
        window.CityManager = vraiCM;
        window.activeCity = vraiActive;
      }
    });
    expect(r).toBe('metropole-lyon');
  });

  test('0.60.3 - Sans CityManager, window.activeCity prend le relais', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.supabaseService, null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const vraiCM = window.CityManager;
      const vraiActive = window.activeCity;
      try {
        window.CityManager = undefined;
        window.activeCity = 'ville-de-secours';
        const relais = window.supabaseService.getActiveCity();
        window.activeCity = 'ville invalide !';
        return { relais, invalide: window.supabaseService.getActiveCity() };
      } finally {
        window.CityManager = vraiCM;
        window.activeCity = vraiActive;
      }
    });
    expect(r.relais).toBe('ville-de-secours');
    expect(r.invalide).not.toBe('ville invalide !');
  });

  test('0.60.4 - Le code de structure lu dans l\'URL est validé', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CityManager?.parseCityFromPath, null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const p = (chemin) => window.CityManager.parseCityFromPath(chemin);
      return {
        simple: p('/metropole-lyon/'),
        racine: p('/'),
        traversee: p('/../../etc/passwd'),
        injection: p('/<img src=x>/'),
      };
    });
    for (const [cle, valeur] of Object.entries(r)) {
      if (!valeur) continue;
      expect(/^[a-z0-9-]+$/i.test(valeur), `${cle} -> ${valeur}`).toBe(true);
    }
  });

});
