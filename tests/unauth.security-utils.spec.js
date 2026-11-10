// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
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
    // La ville vient du chemin : la résolution réécrirait la clé juste après
    // un effacement et masquerait le bug. Le contrôle est donc appelé à la
    // main, sur une ville à chiffre persistée.
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window._storageHealthCheck && window.SecurityUtils, null, { timeout: 20000 });

    const r = await page.evaluate(() => {
      localStorage.setItem('activeCity', 'test-e2e');
      const res = window._storageHealthCheck();
      return { issues: res.issues, stored: localStorage.getItem('activeCity') };
    });
    expect(r.stored).toBe('test-e2e');
    expect(r.issues.filter((i) => /activeCity/.test(i))).toEqual([]);
  });

  test('0.7.3 le health check nettoie toujours une valeur réellement invalide', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('activeCity', 'ville invalide/x'));

    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });

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
    // Le HTML de la carte, servi sous /ville/{ville}/{module} (la racine est le site)
    const html = await (await page.request.get('/ville/metropole-lyon/carte')).text();
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
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
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

  // Non-régression de l'audit du 11/10/2026 : une icône de chantier saisie par
  // un contributeur se rendait telle quelle dans le marqueur de la carte publique.
  test('0.8.4 normalizeIconClass et safeColor ne laissent passer aucun HTML', async ({ page }) => {
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.SecurityUtils?.safeColor && !!window.normalizeIconClass, { timeout: 15000 });

    const r = await page.evaluate(() => ({
      icone: window.normalizeIconClass('fa-solid"><img src=x onerror=alert(1)>'),
      iconeSure: window.normalizeIconClass('fa-solid fa-bus'),
      iconeNue: window.normalizeIconClass('fa-bus'),
      couleurPiege: window.SecurityUtils.safeColor('red" onclick="alert(1)', 'var(--primary)'),
      couleurUrl: window.SecurityUtils.safeColor('url(https://x.example/b)', ''),
      couleurHex: window.SecurityUtils.safeColor('#14AE5C'),
      couleurVar: window.SecurityUtils.safeColor('var(--color-warning)'),
    }));

    expect(r.icone).not.toMatch(/[<>"'=]/);
    expect(r.iconeSure).toBe('fa-solid fa-bus');
    expect(r.iconeNue).toBe('fa-solid fa-bus');
    expect(r.couleurPiege).toBe('var(--primary)');
    expect(r.couleurUrl).toBe('');
    expect(r.couleurHex).toBe('#14AE5C');
    expect(r.couleurVar).toBe('var(--color-warning)');
  });
  /**
   * Les deux essais suivants chargent les fichiers réels de la carte dans une
   * page vide, sans serveur ni base : la configuration de la ville est posée à
   * la main, piégée, et le rendu est lu dans le DOM.
   */
  async function pageDeRendu(page, script) {
    await page.goto('about:blank');
    await page.setContent('<!doctype html><html><body><div id="l2"></div><div id="l3"></div></body></html>');
    await page.evaluate(() => {
      window.__rendus = {};
      window.NavPanel = { registerModule: (cle, rendu) => { window.__rendus[cle] = rendu; } };
    });
    await page.addScriptTag({ path: 'modules/security-utils.js' });
    await page.addScriptTag({ path: script });
  }

  // La carte d'un projet sans image affiche l'icône de sa catégorie : elle passe
  // par la validation commune, comme la base la tient déjà (is_icon_class).
  test('0.8.5 la carte d’un projet ne laisse passer aucun HTML par l’icône de sa catégorie', async ({ page }) => {
    await pageDeRendu(page, 'modules/carte/carte-nav.js');
    const r = await page.evaluate(async () => {
      window.categoryIcons = [{
        category: 'mobilite',
        icon_class: 'fa-bus"><img src=x onerror="window.__xssIcone=1">',
        category_styles: { color: 'red" onmouseover="window.__xssCouleur=1' },
      }];
      window.supabaseService = { fetchProjectsByCategory: async () => [{ id: 7, project_name: 'Tramway T9' }] };
      window.CarteNav.register();
      const panel = { _level3: document.getElementById('l3'), _currentModule: 'carte' };
      await window.__rendus.carte.renderL3(panel, 'mobilite', { color: '' });
      await new Promise((ok) => setTimeout(ok, 200));
      const carte = panel._level3.querySelector('.project-card');
      return {
        cartes: panel._level3.querySelectorAll('.project-card').length,
        images: panel._level3.querySelectorAll('img').length,
        gestionnaires: [...panel._level3.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => a.name.startsWith('on'))).length,
        icone: carte?.querySelector('.card-hero i')?.className,
        xss: [window.__xssIcone, window.__xssCouleur],
      };
    });
    expect(r.cartes).toBe(1);
    expect(r.images).toBe(0);
    expect(r.gestionnaires).toBe(0);
    // Il ne reste que des caractères de nom de classe.
    expect(r.icone).toMatch(/^fa-solid fa-bus[\w\s-]*$/);
    expect(r.xss).toEqual([undefined, undefined]);
  });

  // La couleur du module Travaux, réglée par la ville, passe par la validation
  // commune avant d'entrer dans un attribut style (la base tient is_css_color).
  test('0.8.6 le panneau Travaux ne laisse passer aucun HTML par la couleur du module', async ({ page }) => {
    await pageDeRendu(page, 'modules/travaux/travaux-nav.js');
    const rendre = (couleur) => page.evaluate(async (color) => {
      window._cityModules = [{ module_key: 'travaux', enabled: true, icon_class: 'fa-solid fa-helmet-safety', config: { color } }];
      window.TravauxNav.register();
      const panel = { _level2: document.getElementById('l2'), _currentModule: 'travaux', _skeletonL2Items: () => '' };
      await window.__rendus.travaux.renderL2(panel);
      const boutons = [...panel._level2.querySelectorAll('.nav-panel__item')];
      return {
        boutons: boutons.length,
        gestionnaires: boutons.filter((b) => [...b.attributes].some((a) => a.name.startsWith('on'))).length,
        couleurs: [...new Set(boutons.map((b) => b.style.getPropertyValue('--item-color').trim()))],
      };
    }, couleur);

    const piege = await rendre('red" onmouseover="window.__xssTravaux=1" x="');
    expect(piege.boutons).toBeGreaterThan(0);
    expect(piege.gestionnaires).toBe(0);
    // Une couleur refusée laisse la couleur par défaut du module.
    expect(piege.couleurs).toEqual(['#FF6B35']);

    const reglee = await rendre('#2563EB');
    expect(reglee.couleurs).toEqual(['#2563EB']);
  });
  // Le texte d'un contributeur s'affiche dans la fiche et dans la console : il
  // ne porte aucune des accroches que nos écrans emploient.
  test('0.8.7 l’article d’un contributeur ne porte ni identifiant de nos écrans, ni classe, ni attribut data-*', async ({ page }) => {
    await page.goto('about:blank');
    await page.setContent('<!doctype html><html><head></head><body></body></html>');
    await page.addScriptTag({ path: 'modules/markdownutils.js' });
    // marked et DOMPurify viennent de leurs adresses réelles, comme sur le site
    await page.evaluate(() => window.MarkdownUtils.loadDeps());
    await page.waitForFunction(() => !!window.marked && !!window.DOMPurify, { timeout: 20000 });

    const r = await page.evaluate(() => {
      const md = [
        '## Le projet',
        '',
        '<a id="sp-toggle-approve" name="adm-slide-close" class="adm-btn adm-btn--primary" data-section="users" href="https://exemple.invalid/plan">Voir le plan</a>',
        '',
        '<div id="sp-contrib-map" data-close="1" style="position:fixed;inset:0">Un encart</div>',
        '',
        '::banner{type="info"}Attention aux travaux::',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
      ].join('\n');
      const box = document.createElement('div');
      box.innerHTML = window.MarkdownUtils.renderMarkdown(md).html;
      const tous = [...box.querySelectorAll('*')];
      return {
        ids: tous.filter((e) => e.id).map((e) => e.id),
        noms: tous.filter((e) => e.getAttribute('name')).map((e) => e.getAttribute('name')),
        classes: tous.filter((e) => e.hasAttribute('class')).length,
        styles: tous.filter((e) => e.hasAttribute('style')).length,
        donnees: tous.filter((e) => [...e.attributes].some((a) => a.name.startsWith('data-'))).length,
        lien: box.querySelector('a')?.getAttribute('href'),
        titre: box.querySelector('h2')?.textContent,
        tableau: box.querySelectorAll('table td').length,
        texte: box.textContent,
      };
    });

    // Les identifiants du texte sont préfixés : aucun ne peut être celui d'un écran
    expect(r.ids).toEqual(expect.arrayContaining(['user-content-sp-toggle-approve', 'user-content-sp-contrib-map']));
    expect(r.ids.every((id) => id.startsWith('user-content-'))).toBe(true);
    expect(r.noms.every((n) => n.startsWith('user-content-'))).toBe(true);
    expect(r.classes).toBe(0);
    expect(r.styles).toBe(0);
    expect(r.donnees).toBe(0);
    // Le contenu, lui, est rendu comme avant
    expect(r.lien).toBe('https://exemple.invalid/plan');
    expect(r.titre).toBe('Le projet');
    expect(r.tableau).toBe(2);
    expect(r.texte).toContain('Attention aux travaux');
    expect(r.texte).toContain('Un encart');
  });

  test('0.8.8 les boutons d’un panneau se relient dans son pied, pas dans son corps', async ({ page }) => {
    await page.goto('about:blank');
    await page.setContent('<!doctype html><html><body><div id="adm-slide-backdrop"></div><div id="adm-slide-panel"><div id="adm-slide-content"></div></div></body></html>');
    const source = fs.readFileSync('admin/components/ui.js', 'utf8');
    const r = await page.evaluate(async (code) => {
      const { slidePanel } = await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      const handle = slidePanel.open({
        title: 'Projet',
        body: '<a id="sp-toggle-approve" href="https://exemple.invalid/">Voir le plan</a>',
        footer: '<button id="sp-toggle-approve">Approuver</button>',
      });
      return {
        dansLePied: handle.footer.querySelector('#sp-toggle-approve')?.tagName,
        dansToutLePanneau: handle.content.querySelector('#sp-toggle-approve')?.tagName,
        sansPied: slidePanel.open({ title: 'Projet', body: '' }).footer,
      };
    }, source);
    expect(r.dansLePied).toBe('BUTTON');
    // Une recherche dans tout le panneau rendrait le premier élément, celui du corps
    expect(r.dansToutLePanneau).toBe('A');
    expect(r.sansPied).toBeNull();
  });

  /**
   * La connexion et la console ne s'affichent pas dans le cadre d'un autre site
   * (règle frame-ancestors de `_headers`, essai 0.58.1). Le bouton de la carte
   * doit donc sortir du cadre quand elle est intégrée ailleurs que dans Phaos.
   * Deux sites fictifs sont servis par interception, sans serveur, pour tous
   * les onglets du contexte : le nouvel onglet doit trouver sa page lui aussi.
   */
  async function deuxSites(page) {
    const contexte = page.context();
    const outils = fs.readFileSync('modules/security-utils.js', 'utf8');
    const html = (corps) => ({ contentType: 'text/html', body: `<!doctype html><html><body>${corps}</body></html>` });
    await contexte.route('https://carte.test/**', (route) => {
      const chemin = new URL(route.request().url()).pathname;
      if (chemin === '/modules/security-utils.js') return route.fulfill({ contentType: 'text/javascript', body: outils });
      if (chemin === '/carte') return route.fulfill(html('<script src="/modules/security-utils.js"></script>'));
      if (chemin === '/accueil') return route.fulfill(html('<iframe src="/carte"></iframe>'));
      return route.fulfill(html('page de compte'));
    });
    await contexte.route('https://hote.test/**', (route) => route.fulfill(html('<iframe src="https://carte.test/carte"></iframe>')));
  }

  const cadreDeLaCarte = async (page) => {
    await expect.poll(() => page.frames().some((f) => f.url() === 'https://carte.test/carte')).toBe(true);
    const cadre = page.frames().find((f) => f.url() === 'https://carte.test/carte');
    await cadre.waitForFunction(() => !!window.SecurityUtils);
    return cadre;
  };

  test('0.8.9 une carte intégrée dans un autre site ouvre la connexion dans un nouvel onglet', async ({ page }) => {
    await deuxSites(page);
    await page.goto('https://hote.test/');
    const cadre = await cadreDeLaCarte(page);
    const [onglet] = await Promise.all([
      page.waitForEvent('popup'),
      cadre.evaluate(() => window.SecurityUtils.openAccountPage('/login')),
    ]);
    await onglet.waitForURL('https://carte.test/login');
    // Le cadre, lui, n'a pas bougé : il n'afficherait qu'une page refusée
    expect(cadre.url()).toBe('https://carte.test/carte');
    expect(page.url()).toBe('https://hote.test/');
  });

  test('0.8.10 sur notre site, dans un cadre de notre site ou dans Phaos, la page s’ouvre sur place', async ({ page, context }) => {
    await deuxSites(page);
    const onglets = [];
    context.on('page', (p) => onglets.push(p));

    // Page de premier niveau
    await page.goto('https://carte.test/carte');
    await page.waitForFunction(() => !!window.SecurityUtils);
    await page.evaluate(() => window.SecurityUtils.openAccountPage('/admin/'));
    await page.waitForURL('https://carte.test/admin/');

    // Cadre d'une page de notre site (vitrines de l'accueil, écran de salon)
    await page.goto('https://carte.test/accueil');
    let cadre = await cadreDeLaCarte(page);
    await cadre.evaluate(() => window.SecurityUtils.openAccountPage('/login'));
    await expect.poll(() => page.frames().map((f) => f.url())).toContain('https://carte.test/login');
    expect(page.url()).toBe('https://carte.test/accueil');

    // Cadre de Phaos : la session vient de lui, la console s'ouvre dans son cadre
    await page.goto('https://hote.test/');
    cadre = await cadreDeLaCarte(page);
    await cadre.evaluate(() => {
      window.PhaosAuth = { isHost: () => true };
      window.SecurityUtils.openAccountPage('/admin/');
    });
    await expect.poll(() => page.frames().map((f) => f.url())).toContain('https://carte.test/admin/');
    expect(page.url()).toBe('https://hote.test/');

    expect(onglets).toEqual([]);
  });

  /**
   * Deux sorties où un texte saisi par quelqu'un d'autre est relu par une
   * machine : le filtre de recherche envoyé à la base, et le fichier CSV ouvert
   * dans un tableur. Les deux règles vivent dans security-utils.js.
   */
  const outils = async (page) => {
    await deuxSites(page);
    await page.goto('https://carte.test/carte');
    await page.waitForFunction(() => !!window.SecurityUtils);
  };

  test('0.8.11 le texte d’une recherche devient un motif, jamais de la grammaire de filtre', async ({ page }) => {
    await outils(page);
    const r = await page.evaluate(() => {
      const f = (texte) => window.SecurityUtils.ilikeAny(['description', 'adresse'], texte);
      return {
        adresse: f('12, rue de la Paix'),
        hostile: f('x%",id.gt.0,adresse.ilike."'),
        parentheses: f('and(id.gt.0)'),
        soulignement: f('rue_x'),
        espaces: f('   nid de poule  '),
        vide: [f(''), f('   '), f('%'), f(',()'), f(undefined), f(null)],
      };
    });
    // La virgule devient un joker : « 12, rue » retrouve toujours « 12, rue de la Paix »
    expect(r.adresse).toBe('description.ilike."%12% rue de la Paix%",adresse.ilike."%12% rue de la Paix%"');
    // Une saisie hostile ne ferme pas la valeur et n'ajoute aucune condition
    expect(r.hostile).toBe('description.ilike."%x%%%id.gt.0%adresse.ilike.%%",adresse.ilike."%x%%%id.gt.0%adresse.ilike.%%"');
    // Deux colonnes : deux valeurs entre guillemets, une seule virgule entre elles
    expect(r.hostile.match(/"/g)).toHaveLength(4);
    expect(r.hostile.match(/,/g)).toHaveLength(1);
    expect(r.parentheses).toBe('description.ilike."%and%id.gt.0%%",adresse.ilike."%and%id.gt.0%%"');
    expect(r.soulignement).toBe('description.ilike."%rue%x%",adresse.ilike."%rue%x%"');
    expect(r.espaces).toBe('description.ilike."%nid de poule%",adresse.ilike."%nid de poule%"');
    // Rien à chercher : pas de filtre du tout
    expect(r.vide).toEqual(['', '', '', '', '', '']);
  });

  test('0.8.12 une cellule de CSV qui commence comme une formule est lue comme du texte', async ({ page }) => {
    await outils(page);
    const r = await page.evaluate(() => [
      '=HYPERLINK("https://exemple.invalid";"Cliquez")', '+33 6 12 34 56 78', '-2+3', '@SUM(A1)', '\t=1+1', '- nid de poule',
      '-1.553621', -1.553621, '+47,2', 47.218, 'rue = 3', 'dit "bonjour"', '', null, undefined,
    ].map((v) => window.SecurityUtils.csvCell(v)));
    expect(r).toEqual([
      `"'=HYPERLINK(""https://exemple.invalid"";""Cliquez"")"`, `"'+33 6 12 34 56 78"`, `"'-2+3"`, `"'@SUM(A1)"`, `"'\t=1+1"`, `"'- nid de poule"`,
      // Un simple nombre reste un nombre : les longitudes de l'ouest sont négatives
      '"-1.553621"', '"-1.553621"', '"+47,2"', '"47.218"', '"rue = 3"', '"dit ""bonjour"""', '""', '""', '""',
    ]);
  });

  test('0.8.13 aucune recherche ni aucun export ne réécrit sa propre règle', async () => {
    // Test structurel, sur les fichiers du dépôt : un filtre `ilike` bâti à la
    // main avec le texte saisi, ou une cellule de CSV faite sur place.
    const dossiers = ['modules', 'admin'];
    const fichiers = dossiers.flatMap((d) => fs.readdirSync(d, { recursive: true })
      .filter((f) => String(f).endsWith('.js'))
      .map((f) => `${d}/${f}`))
      .filter((f) => f !== 'modules/security-utils.js');
    expect(fichiers.length).toBeGreaterThan(50);
    for (const fichier of fichiers) {
      const src = fs.readFileSync(fichier, 'utf8');
      expect(src, `${fichier} bâtit un filtre ilike avec une variable`).not.toMatch(/ilike\.["%*]*\$\{/);
      if (/text\/csv/.test(src)) expect(src, `${fichier} écrit un CSV sans csvCell`).toContain('SecurityUtils.csvCell');
    }
    const service = fs.readFileSync('modules/supabaseservice.js', 'utf8');
    expect(service.match(/SecurityUtils\.ilikeAny\(/g)).toHaveLength(2);
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
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });

    for (const chemin of ['/modules/supabaseservice.js', '/modules/uimodule.js', '/admin/sections/contributions.js']) {
      const src = await (await page.request.get(chemin)).text();
      // Une slugification locale se reconnaît à la séquence NFD + suppression des diacritiques
      expect(src, `${chemin} réimplémente une slugification`).not.toMatch(/normalize\(\s*['"]NFD['"]\s*\)/);
      expect(src, `${chemin} n'utilise pas SecurityUtils.slugify`).toContain('SecurityUtils.slugify');
    }
  });
});
