// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Tests de non-régression sécurité - helpers d'échappement/URL de l'admin.
 *
 * Contexte : audit de sécurité (2026-07). Deux failles corrigées ici :
 *  - #4 (HIGH) : `esc()` n'échappait PAS les guillemets → breakout d'attribut
 *    (XSS stocké zéro-clic via cover_url : `x" onerror="…`).
 *  - #5/#11 (HIGH/MED) : `href`/`src` construits depuis la base sans filtrage de
 *    schéma → `javascript:` exécutable. `sanitizeUrl()` bloque désormais.
 *
 * Le module `admin/components/ui.js` est importé tel quel dans la page (son
 * top-level ne touche pas le DOM), donc on teste le code RÉELLEMENT livré.
 * Aucun accès base : ces assertions portent sur des fonctions pures.
 */

/** Charge les helpers depuis le module admin réel, dans le contexte navigateur. */
async function loadUi(page) {
  await page.goto('/admin/', { waitUntil: 'domcontentloaded' });
  return page.evaluate(async () => {
    const m = await import('/admin/components/ui.js');
    const { esc, escAttr, sanitizeUrl } = m;
    return {
      escDouble: esc('x" onerror="alert(1)'),
      escSingle: esc("a'b"),
      escAngleAmp: esc('<script>&'),
      escAttrDouble: escAttr('x" onerror="y'),
      imgHasBreakout: /onerror="/.test(`<img src="${esc('x" onerror="alert(1)')}" alt="">`),
      urlJs: sanitizeUrl('javascript:alert(1)'),
      urlJsCase: sanitizeUrl('JaVaScRiPt:alert(1)'),
      urlJsTrim: sanitizeUrl('  javascript:alert(1) '),
      urlData: sanitizeUrl('data:text/html,<script>x</script>'),
      urlHttps: sanitizeUrl('https://o.com/x?a=1&b=2'),
      urlRel: sanitizeUrl('/fiche/x'),
      urlMailto: sanitizeUrl('mailto:a@b.c'),
      urlEmpty: sanitizeUrl(''),
    };
  });
}

test.describe('0.6 - SecurityUtils admin (échappement + URL)', () => {
  // 0.6.1 - esc() échappe les guillemets (cœur du fix #4)
  test('0.6.1 esc() échappe " et \' (pas de breakout d\'attribut)', async ({ page }) => {
    const r = await loadUi(page);
    expect(r.escDouble).toBe('x&quot; onerror=&quot;alert(1)');
    expect(r.escSingle).toBe('a&#39;b');
    expect(r.escAngleAmp).toBe('&lt;script&gt;&amp;');
    expect(r.escAttrDouble).toBe('x&quot; onerror=&quot;y');
    // Preuve directe : plus aucun onerror=" injectable dans un <img src="…">
    expect(r.imgHasBreakout).toBe(false);
  });

  // 0.6.2 - sanitizeUrl() bloque les schémas dangereux
  test('0.6.2 sanitizeUrl() bloque javascript:/data: (fix #5/#11)', async ({ page }) => {
    const r = await loadUi(page);
    expect(r.urlJs).toBe('');
    expect(r.urlJsCase).toBe('');
    expect(r.urlJsTrim).toBe('');
    expect(r.urlData).toBe('');
  });

  // 0.6.3 - sanitizeUrl() préserve les URLs légitimes
  test('0.6.3 sanitizeUrl() garde http(s)/relatif/mailto', async ({ page }) => {
    const r = await loadUi(page);
    expect(r.urlHttps).toBe('https://o.com/x?a=1&b=2');
    expect(r.urlRel).toBe('/fiche/x');
    expect(r.urlMailto).toBe('mailto:a@b.c');
    expect(r.urlEmpty).toBe('');
  });
});

/**
 * 0.7 - Validateur de code ville, source de vérité unique.
 *
 * Contexte : audit DRY (2026-07). Trois expressions régulières coexistaient pour
 * valider un code ville, et elles avaient divergé :
 *   - main.js (health check)      : /^[a-z-]+$/i     → refusait les chiffres
 *   - supabaseservice.sanitizeCity: /^[a-z0-9-]+$/i  → les acceptait
 *   - admin/sections/villes.js    : /^[a-z0-9_-]+$/  → acceptait aussi `_`
 *
 * Conséquence : pour une ville dont le code contient un chiffre (`test-e2e` en
 * base, ou un futur `paris-14`), le health check effaçait `activeCity` du
 * localStorage à chaque boot. L'utilisateur perdait son espace dès qu'il
 * revenait sur une URL sans `?city=`.
 */
test.describe('0.7 - Code ville : un seul validateur', () => {

  test('0.7.1 isValidCityCode accepte les chiffres et refuse le reste', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.SecurityUtils?.isValidCityCode, { timeout: 15000 });

    const r = await page.evaluate(() => {
      const f = window.SecurityUtils.isValidCityCode;
      return {
        lyon: f('metropole-lyon'),
        avecChiffre: f('test-e2e'),      // existe réellement en base
        futur: f('paris-14'),
        essai: f('essai-lyon7'),
        underscore: f('ville_test'),     // refusé : le message admin ne l'annonce pas
        slash: f('a/b'),
        espace: f('a b'),
        vide: f(''),
        nul: f(null),
        pointVirgule: f('lyon;drop'),
      };
    });

    expect(r.lyon).toBe(true);
    expect(r.avecChiffre).toBe(true);
    expect(r.futur).toBe(true);
    expect(r.essai).toBe(true);
    expect(r.underscore).toBe(false);
    expect(r.slash).toBe(false);
    expect(r.espace).toBe(false);
    expect(r.vide).toBe(false);
    expect(r.nul).toBe(false);
    expect(r.pointVirgule).toBe(false);
  });

  test('0.7.2 le health check ne détruit plus une ville contenant un chiffre', async ({ page }) => {
    // Pré-condition : une ville à chiffre est persistée, comme après une visite ?city=
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('activeCity', 'test-e2e'));

    // Rechargement SANS ?city= : c'est le scénario où le bug se manifestait
    // (le paramètre d'URL masquait l'effacement en réécrivant la clé juste après).
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#filters-toggle')?.getAttribute('data-ready') === 'true',
      { timeout: 20000 }
    );

    // La ville a survécu au health check de la Phase 0b
    expect(await page.evaluate(() => localStorage.getItem('activeCity'))).toBe('test-e2e');
    // …et c'est bien elle qui est active, pas le repli metropole-lyon
    expect(await page.evaluate(() => window.CityManager?.getActiveCity())).toBe('test-e2e');
  });

  test('0.7.3 le health check nettoie toujours une valeur réellement invalide', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('activeCity', 'ville invalide/x'));

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#filters-toggle')?.getAttribute('data-ready') === 'true',
      { timeout: 20000 }
    );

    // La valeur corrompue a été retirée puis remplacée par la ville réellement résolue
    const stored = await page.evaluate(() => localStorage.getItem('activeCity'));
    expect(stored).not.toBe('ville invalide/x');
    expect(await page.evaluate(() => window.SecurityUtils.isValidCityCode(localStorage.getItem('activeCity') || 'x'))).toBe(true);
  });

  test('0.7.4 aucun consommateur ne réintroduit sa propre expression', async ({ page }) => {
    // Test structurel : c'est la divergence des copies qui a produit le bug, donc
    // on vérifie qu'il ne reste qu'une seule expression, dans security-utils.js.
    // Les fichiers sont lus tels qu'ils sont SERVIS, pas depuis le disque.
    const consommateurs = ['/main.js', '/modules/supabaseservice.js', '/admin/sections/villes.js'];

    // Reconnaît /^[a-z-]+$/, /^[a-z0-9-]+$/ et /^[a-z0-9_-]+$/, les trois variantes
    // qui coexistaient. Ne matche pas ESSAI_RE (/^essai-[…]/), qui a un autre rôle.
    const REGEX_CODE_VILLE = /\/\^\[a-z[^\]]*\]\+\$\//g;

    for (const chemin of consommateurs) {
      const src = await (await page.request.get(chemin)).text();

      const locales = src.match(REGEX_CODE_VILLE) || [];
      expect(locales, `${chemin} contient encore une regex de code ville locale : ${locales.join(', ')}`).toHaveLength(0);

      // …et il doit bien déléguer au validateur partagé
      expect(src, `${chemin} n'appelle pas isValidCityCode`).toContain('isValidCityCode');
    }

    // La source de vérité, elle, la contient - et une seule fois
    const utils = await (await page.request.get('/modules/security-utils.js')).text();
    expect(utils).toContain('isValidCityCode');
    expect(utils.match(REGEX_CODE_VILLE) || []).toHaveLength(1);
  });
});

/**
 * 0.8 - Aucun repli ne doit désactiver l'échappement.
 *
 * Contexte : audit DRY (2026-07). Neuf sites écrivaient
 * `SecurityUtils ? SecurityUtils.escapeHtml : (s => String(s || ''))`, c'est-à-dire
 * « si le module d'échappement manque, n'échappe rien ». Ce n'était pas exploitable
 * (security-utils.js est toujours chargé), mais la posture était fail-open : une
 * absence du module aurait laissé passer du contenu utilisateur brut dans innerHTML
 * au lieu d'interrompre. Le bon modèle est celui de feature-interactions.js :
 * `const esc = window.SecurityUtils.escapeHtml;` qui lève si le module manque.
 */
test.describe('0.8 - Échappement : pas de repli fail-open', () => {

  test('0.8.1 aucun module carte ne prévoit de repli non échappant', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const modules = [
      '/modules/carte/carte-nav.js',
      '/modules/citymanager.js',
      '/modules/navigationmodule.js',
      '/modules/lightbox.js',
      '/modules/travaux/travaux-views.js',
    ];

    for (const chemin of modules) {
      const src = await (await page.request.get(chemin)).text();

      // Motif interdit : un ternaire ou un ?? qui contourne SecurityUtils
      const replis = src.match(/SecurityUtils\s*(\?[^.]|\?\.)[^;\n]*(:|\?\?)/g) || [];
      expect(replis, `${chemin} garde un repli d'échappement : ${replis.join(' | ')}`).toHaveLength(0);
    }
  });

  test('0.8.2 security-utils.js est chargé avant ses consommateurs', async ({ page }) => {
    const html = await (await page.request.get('/')).text();
    const posUtils = html.indexOf('modules/security-utils.js');
    expect(posUtils, 'security-utils.js absent de index.html').toBeGreaterThan(-1);

    // Tout module qui référence SecurityUtils au chargement doit venir après
    for (const m of ['modules/travaux/travaux-views.js', 'modules/citymanager.js', 'modules/carte/carte-nav.js', 'modules/lightbox.js']) {
      const pos = html.indexOf(m);
      expect(pos, `${m} absent de index.html`).toBeGreaterThan(-1);
      expect(pos, `${m} est chargé AVANT security-utils.js`).toBeGreaterThan(posUtils);
    }
  });

  test('0.8.3 escapeHtml échappe bien les cinq caractères', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.SecurityUtils?.escapeHtml, { timeout: 15000 });

    const r = await page.evaluate(() => ({
      complet: window.SecurityUtils.escapeHtml(`x' onerror=alert(1) "y <b>&`),
      // escapeAttribute doit couvrir les mêmes caractères
      attribut: window.SecurityUtils.escapeAttribute(`x' "y <b>&`),
    }));

    // L'apostrophe DOIT être échappée : c'est ce que les anciens replis laissaient passer
    expect(r.complet).not.toContain("'");
    expect(r.complet).not.toContain('"');
    expect(r.complet).not.toContain('<');
    expect(r.attribut).not.toContain("'");
    expect(r.attribut).not.toContain('"');
  });
});

/**
 * 0.9 - Slugification : une seule règle, celle de Postgres.
 *
 * Contexte : audit DRY (2026-07). Cinq slugify coexistaient pour trois résultats
 * différents. La source de vérité est la fonction Postgres `public.slugify()`,
 * appelée par le trigger `trg_contribution_slugs` qui remplit `slug` et
 * `category_slug` - colonnes qui construisent les URLs /fiche/{ville}/{cat}/{slug}.
 * La variante de supabaseservice.js (chemins Storage) traduisait `&` en « et » et
 * ne tronquait pas à 60 : le projet « Alexandre billard & friends… » a un chemin
 * Storage `alexandre-billard-et-friends-…` pour un slug public
 * `alexandre-billard-friends-…`.
 */
test.describe('0.9 - Slugification alignée sur Postgres', () => {

  test('0.9.1 SecurityUtils.slugify reproduit la colonne slug sur les données réelles', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__supabaseClient && !!window.SecurityUtils?.slugify, { timeout: 15000 });

    const r = await page.evaluate(async () => {
      const { data } = await window.__supabaseClient
        .from('contribution_uploads')
        .select('project_name, slug, category, category_slug')
        .not('slug', 'is', null)
        .limit(200);

      const ecarts = [];
      for (const row of data || []) {
        // Le trigger suffixe `-{id}` en cas de collision : on ignore ces lignes,
        // le suffixe n'est pas produit par slugify() elle-même.
        const attendu = window.SecurityUtils.slugify(row.project_name);
        if (row.slug !== attendu && !row.slug.startsWith(attendu + '-')) {
          ecarts.push({ nom: row.project_name, base: row.slug, js: attendu });
        }
        if (row.category_slug) {
          const attenduCat = window.SecurityUtils.slugify(row.category);
          if (row.category_slug !== attenduCat) {
            ecarts.push({ nom: row.category, base: row.category_slug, js: attenduCat });
          }
        }
      }
      return { total: (data || []).length, ecarts: ecarts.slice(0, 10) };
    });

    expect(r.total, 'aucune ligne à comparer').toBeGreaterThan(10);
    expect(r.ecarts, `écarts JS vs Postgres : ${JSON.stringify(r.ecarts, null, 2)}`).toHaveLength(0);
  });

  test('0.9.2 les cas qui faisaient diverger les variantes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.SecurityUtils?.slugify, { timeout: 15000 });

    const r = await page.evaluate(() => {
      const f = window.SecurityUtils.slugify;
      return {
        // `&` : l'ancienne variante Storage écrivait « et », pas Postgres
        esperluette: f('Alexandre billard & friends @ la barge NON STOP'),
        // `/` : l'ancienne variante Storage le gardait comme séparateur
        slash: f('Parc / Jardin'),
        // apostrophe typographique
        apostrophe: f('Aménagement du bourg d’Edern'),
        // troncature à 60, appliquée APRÈS le nettoyage des tirets
        long: f('Accompagnement d\'une école dans sa mobilité à l\'échelle du quartier d\'hellemmes'),
        accents: f('Éco-quartier Été 2030'),
        vide: f(''),
        nul: f(null),
        bordures: f('---Projet---'),
      };
    });

    expect(r.esperluette).toBe('alexandre-billard-friends-la-barge-non-stop');
    expect(r.slash).toBe('parc-jardin');
    expect(r.apostrophe).toBe('amenagement-du-bourg-d-edern');
    expect(r.long).toBe('accompagnement-d-une-ecole-dans-sa-mobilite-a-l-echelle-du-q');
    expect(r.long.length).toBeLessThanOrEqual(60);
    expect(r.accents).toBe('eco-quartier-ete-2030');
    expect(r.vide).toBe('');
    expect(r.nul).toBe('');
    expect(r.bordures).toBe('projet');
  });

  test('0.9.3 aucun module ne réimplémente sa propre slugification', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    for (const chemin of ['/modules/supabaseservice.js', '/modules/uimodule.js', '/admin/sections/contributions.js']) {
      const src = await (await page.request.get(chemin)).text();
      // Une slugification locale se reconnaît à la séquence NFD + suppression des diacritiques
      expect(src, `${chemin} réimplémente une slugification`).not.toMatch(/normalize\(\s*['"]NFD['"]\s*\)/);
      expect(src, `${chemin} n'utilise pas SecurityUtils.slugify`).toContain('SecurityUtils.slugify');
    }
  });
});
