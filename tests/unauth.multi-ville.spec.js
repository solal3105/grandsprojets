// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Multi-ville : le cœur du produit, et le mécanisme le moins testé.
 *
 * Le nom, le code et le logo d'une structure viennent de `city_branding`,
 * donc d'un administrateur. Deux d'entre eux étaient injectés sans échappement
 * dans la popup de sélection de structure : une collectivité pouvait donc
 * atteindre l'écran d'une autre. Les cas 0.58.1 et 0.58.2 figent la correction.
 */

/** PNG 1x1 transparent, pour que toute image demandée se charge vraiment. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Charge la carte et remplace la source de branding par une source contrôlée.
 * Toute image se charge : sans cela le gestionnaire d'erreur remplace le logo
 * par l'initiale et l'attribut src disparaît avant d'avoir pu être inspecté.
 */
async function ouvrirAvecBranding(page, infos) {
  await page.route(/\.(png|jpg|jpeg|svg|webp)|logo|onerror/i, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.CityRedirect && window.CityManager && window.SecurityUtils,
    null,
    { timeout: 20000 },
  );
  await page.evaluate((table) => {
    window.CityManager.getCityInfoAsync = async (code) => table[code] || null;
    window.CityManager.getCityInfo = (code) => table[code] || null;
  }, infos);
}

/** Ouvre la popup pour ces codes et rend la main après le rendu. */
async function ouvrirPopup(page, codes) {
  return page.evaluate(async (liste) => {
    window.CityRedirect.showCitySelectionPopup(liste);
    await new Promise((r) => setTimeout(r, 350));
    const list = document.querySelector('.cs-list');
    return {
      cartes: document.querySelectorAll('.cs-card').length,
      html: list?.innerHTML || '',
      noms: [...document.querySelectorAll('.cs-card-name')].map((e) => e.textContent),
      codes: [...document.querySelectorAll('.cs-card-code')].map((e) => e.textContent),
      srcs: [...document.querySelectorAll('.cs-card img')].map((e) => e.getAttribute('src')),
      attributsInjectes: document.querySelectorAll('.cs-card [onerror], .cs-card [onload], .cs-card [onclick]').length,
      balisesInjectees: document.querySelectorAll('.cs-card-name *, .cs-card-code *').length,
    };
  }, codes);
}

test.describe('0.58 - Multi-ville : popup de sélection de structure', () => {

  test("0.58.1 - RÉGRESSION : un logo piégé ne casse pas l'attribut src", async ({ page }) => {
    // sanitizeUrl seul laissait passer cette valeur, qu'il prend pour une URL
    // relative. C'est escapeAttribute qui referme l'attribut.
    await ouvrirAvecBranding(page, {
      piegee: { brand_name: 'Piegee', logo_url: 'x" onerror="window.__xssLogo=1" data-y="' },
    });
    const r = await ouvrirPopup(page, ['piegee']);
    expect(r.attributsInjectes).toBe(0);
    expect(await page.evaluate(() => window.__xssLogo)).toBeUndefined();
    // La charge reste enfermée dans la valeur de l'attribut, guillemets échappés
    expect(r.srcs[0]).toContain('onerror');
    expect(r.html).toContain('&quot;');
  });

  test('0.58.2 - RÉGRESSION : un code de structure piégé ne pose aucune balise', async ({ page }) => {
    await ouvrirAvecBranding(page, {});
    const r = await ouvrirPopup(page, ['<img src=x onerror="window.__xssCode=1">']);
    expect(r.balisesInjectees).toBe(0);
    expect(await page.evaluate(() => window.__xssCode)).toBeUndefined();
    expect(r.codes[0]).toContain('<img');
  });

  test("0.58.3 - Un nom de structure piégé s'affiche en texte", async ({ page }) => {
    await ouvrirAvecBranding(page, {
      a: { brand_name: '<b>Grand</b> Lyon', logo_url: null },
    });
    const r = await ouvrirPopup(page, ['a']);
    expect(r.balisesInjectees).toBe(0);
    expect(r.noms[0]).toBe('<b>Grand</b> Lyon');
  });

  test('0.58.4 - Un logo à schéma dangereux est écarté au profit de l\'initiale', async ({ page }) => {
    await ouvrirAvecBranding(page, {
      a: { brand_name: 'Alpha', logo_url: 'javascript:alert(1)' },
      b: { brand_name: 'Beta', logo_url: 'data:text/html,<script>alert(1)</script>' },
    });
    const r = await ouvrirPopup(page, ['a', 'b']);
    expect(r.srcs).toEqual([]);
    expect(r.html).not.toContain('javascript:');
    expect(r.html).not.toContain('data:text/html');
    expect(r.html).toContain('cs-initial');
  });

  test('0.58.5 - Un logo légitime est bien posé', async ({ page }) => {
    await ouvrirAvecBranding(page, {
      a: { brand_name: 'Alpha', logo_url: 'https://exemple.fr/logo.png' },
    });
    const r = await ouvrirPopup(page, ['a']);
    expect(r.srcs).toEqual(['https://exemple.fr/logo.png']);
  });

  test("0.58.6 - Sans nom de marque, le code sert de libellé", async ({ page }) => {
    await ouvrirAvecBranding(page, { 'metropole-lyon': null });
    const r = await ouvrirPopup(page, ['metropole-lyon']);
    expect(r.noms[0]).toBe('metropole-lyon');
    expect(r.codes[0]).toBe('metropole-lyon');
  });

  test('0.58.7 - Une carte est rendue par structure et le clic résout son code', async ({ page }) => {
    await ouvrirAvecBranding(page, {
      a: { brand_name: 'Alpha', logo_url: null },
      b: { brand_name: 'Beta', logo_url: null },
      c: { brand_name: 'Gamma', logo_url: null },
    });
    // Une seule popup ouverte : deux superposées feraient porter le clic sur
    // la mauvaise, et le test passerait pour la mauvaise raison.
    const r = await page.evaluate(async () => {
      const promesse = window.CityRedirect.showCitySelectionPopup(['a', 'b', 'c']);
      await new Promise((r) => setTimeout(r, 350));
      const rendu = {
        cartes: document.querySelectorAll('.cs-card').length,
        noms: [...document.querySelectorAll('.cs-card-name')].map((e) => e.textContent),
      };
      document.querySelector('.cs-card[data-city="b"]').click();
      return { ...rendu, choisi: await promesse };
    });
    expect(r.cartes).toBe(3);
    expect(r.noms).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(r.choisi).toBe('b');
  });

  test('0.58.8 - La redirection se désarme et se réarme', async ({ page }) => {
    await ouvrirAvecBranding(page, {});
    const etats = await page.evaluate(() => {
      window.CityRedirect.disableRedirect();
      const apresArret = window.__DISABLE_CITY_REDIRECT;
      window.CityRedirect.enableRedirect();
      return { apresArret, apresReprise: window.__DISABLE_CITY_REDIRECT };
    });
    expect(etats.apresArret).toBe(true);
    expect(etats.apresReprise).toBe(false);
  });

});

test.describe('0.59 - Multi-ville : branding appliqué au document', () => {

  test('0.59.1 - Seule une couleur hexadécimale à 6 chiffres est appliquée', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
