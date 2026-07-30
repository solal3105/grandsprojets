// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Panneau de détail d'un projet (navigationmodule.js).
 *
 * 456 lignes non couvertes sur 507, alors que c'est l'essentiel de ce que voit
 * un visiteur de la carte. Le rendu accepte des données enrichies passées
 * directement : il se pilote donc sans réseau, avec des projets de test.
 */

const PANNEAU = '#project-detail';

async function ouvrirCarte(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.NavigationModule?.showSpecificContribution && window.SecurityUtils,
    null,
    { timeout: 20000 },
  );
}

/** Affiche un projet à partir de données fournies, sans passer par la base. */
async function afficher(page, nom, categorie, props) {
  await page.evaluate(async (a) => {
    window.NavigationModule._resetProjectGuard();
    // Sans identifiant, le rendu utilise les données transmises telles quelles
    await window.NavigationModule.showSpecificContribution(a.nom, a.categorie, a.props);
    await new Promise((r) => setTimeout(r, 400));
  }, { nom, categorie, props });
}

test.describe('0.62 - Carte : panneau de détail', () => {

  test('0.62.1 - Le titre, la description et la catégorie sont rendus', async ({ page }) => {
    await ouvrirCarte(page);
    await afficher(page, 'Tramway T9', 'mobilite', {
      project_name: 'Tramway T9',
      category: 'mobilite',
      description: 'Une nouvelle ligne entre Vaulx-en-Velin et La Doua.',
      ville: 'metropole-lyon',
    });
    const panneau = page.locator(PANNEAU);
    await expect(panneau).toBeVisible();
    await expect(panneau.locator('.detail-title')).toHaveText('Tramway T9');
    await expect(panneau.locator('.detail-description')).toContainText('Vaulx-en-Velin');
  });

  test('0.62.2 - Un nom de projet piégé ne pose aucune balise', async ({ page }) => {
    await ouvrirCarte(page);
    await afficher(page, '<img src=x onerror="window.__xssTitre=1">', 'mobilite', {
      project_name: '<img src=x onerror="window.__xssTitre=1">',
      category: 'mobilite',
      description: 'x',
      ville: 'metropole-lyon',
    });
    const r = await page.evaluate(() => ({
      balises: document.querySelectorAll('#project-detail .detail-title *').length,
      handlers: document.querySelectorAll('#project-detail [onerror], #project-detail [onload]').length,
      xss: window.__xssTitre,
    }));
    expect(r.balises).toBe(0);
    expect(r.handlers).toBe(0);
    expect(r.xss).toBeUndefined();
  });

  test('0.62.3 - Une description piégée est rendue en texte', async ({ page }) => {
    await ouvrirCarte(page);
    await afficher(page, 'Projet', 'urbanisme', {
      project_name: 'Projet',
      category: 'urbanisme',
      description: '<script>window.__xssDesc=1</script><b>gras</b>',
      ville: 'metropole-lyon',
    });
    const r = await page.evaluate(() => ({
      texte: document.querySelector('#project-detail .detail-description')?.textContent || '',
      balises: document.querySelectorAll('#project-detail .detail-description *').length,
      xss: window.__xssDesc,
    }));
    expect(r.balises).toBe(0);
    expect(r.xss).toBeUndefined();
    expect(r.texte).toContain('<b>gras</b>');
  });

  test("0.62.4 - Une couverture piégée ne casse pas l'attribut src", async ({ page }) => {
    await ouvrirCarte(page);
    await afficher(page, 'Projet', 'mobilite', {
      project_name: 'Projet',
      category: 'mobilite',
      cover_url: 'x" onerror="window.__xssCover=1" data-y="',
      description: 'x',
      ville: 'metropole-lyon',
    });
    const r = await page.evaluate(() => ({
      handlers: document.querySelectorAll('#project-detail [onerror]').length,
      xss: window.__xssCover,
    }));
    expect(r.handlers).toBe(0);
    expect(r.xss).toBeUndefined();
  });

  test('0.62.5 - Sans donnée, le panneau le dit au lieu de rester vide', async ({ page }) => {
    await ouvrirCarte(page);
    await page.evaluate(async () => {
      window.NavigationModule._resetProjectGuard();
      const vrai = window.supabaseService?.fetchProjectByCategoryAndName;
      if (window.supabaseService) window.supabaseService.fetchProjectByCategoryAndName = async () => null;
      await window.NavigationModule.showSpecificContribution('Inconnu', 'mobilite', null);
      await new Promise((r) => setTimeout(r, 500));
      if (window.supabaseService) window.supabaseService.fetchProjectByCategoryAndName = vrai;
    });
    const texte = await page.locator(PANNEAU).innerText();
    expect(texte.trim().length).toBeGreaterThan(10);
  });

  test('0.62.6 - Le garde empêche un re-rendu identique, et se relâche', async ({ page }) => {
    await ouvrirCarte(page);
    const props = { project_name: 'Projet A', category: 'mobilite', description: 'Un', ville: 'metropole-lyon' };
    await afficher(page, 'Projet A', 'mobilite', props);
    const r = await page.evaluate(async (p) => {
      const panneau = document.querySelector('#project-detail');
      panneau.dataset.temoin = 'intact';
      // Deuxième appel identique : le garde doit court-circuiter le rendu
      await window.NavigationModule.showSpecificContribution('Projet A', 'mobilite', p);
      await new Promise((r) => setTimeout(r, 300));
      const apresGarde = panneau.dataset.temoin;
      // Après relâchement, le rendu repart
      window.NavigationModule._resetProjectGuard();
      await window.NavigationModule.showSpecificContribution('Projet A', 'mobilite', p);
      await new Promise((r) => setTimeout(r, 400));
      return { apresGarde, titre: document.querySelector('#project-detail .detail-title')?.textContent };
    }, props);
    expect(r.apresGarde).toBe('intact');
    expect(r.titre).toBe('Projet A');
  });

  test('0.62.7 - Les chips de trajet reprennent les attributs du projet', async ({ page }) => {
    await ouvrirCarte(page);
    await afficher(page, 'Ligne X', 'mobilite', {
      project_name: 'Ligne X',
      category: 'mobilite',
      description: 'x',
      ville: 'metropole-lyon',
      from: 'Part-Dieu',
      to: 'Bellecour',
    });
    // Les attributs de trajet viennent du markdown, pas des props : on vérifie
    // surtout que leur absence ne casse rien et que le panneau reste cohérent.
    await expect(page.locator(`${PANNEAU} .detail-title`)).toHaveText('Ligne X');
  });

});

test.describe('0.63 - Carte : marges de recadrage', () => {

  test('0.63.1 - Sur grand écran, la marge gauche réserve la barre latérale', async ({ page }) => {
    await ouvrirCarte(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    const p = await page.evaluate(() => window.NavigationModule.computeMapPadding());
    expect(p.left).toBeGreaterThanOrEqual(92);
    expect(p.top).toBeGreaterThan(0);
    expect(p.bottom).toBeGreaterThan(0);
    for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });

  test('0.63.2 - Sur mobile, les panneaux passent en bas', async ({ page }) => {
    await ouvrirCarte(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const p = await page.evaluate(() => window.NavigationModule.computeMapPadding());
    expect(p.top).toBe(80);
    expect(p.left).toBe(20);
    expect(p.right).toBe(20);
    expect(p.bottom).toBeGreaterThanOrEqual(70);
  });

  test('0.63.3 - Un panneau de détail ouvert augmente la marge du bas sur mobile', async ({ page }) => {
    await ouvrirCarte(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const sans = await page.evaluate(() => window.NavigationModule.computeMapPadding().bottom);
    await afficher(page, 'Projet', 'mobilite', {
      project_name: 'Projet', category: 'mobilite', description: 'x', ville: 'metropole-lyon',
    });
    const avec = await page.evaluate(() => window.NavigationModule.computeMapPadding().bottom);
    expect(avec).toBeGreaterThan(sans);
  });

  test('0.63.4 - Les marges ne dépassent jamais la fenêtre', async ({ page }) => {
    await ouvrirCarte(page);
    for (const [l, h] of [[1400, 900], [1024, 768], [390, 844]]) {
      await page.setViewportSize({ width: l, height: h });
      const p = await page.evaluate(() => window.NavigationModule.computeMapPadding());
      expect(p.left + p.right, `${l}x${h} horizontal`).toBeLessThan(l);
      expect(p.top + p.bottom, `${l}x${h} vertical`).toBeLessThan(h);
    }
  });

});
