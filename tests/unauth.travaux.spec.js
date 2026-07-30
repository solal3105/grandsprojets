// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Module travaux : utilitaires et vues.
 *
 * travaux-views.js était couvert à 5 lignes sur 392, travaux-nav.js à 8 %,
 * travauxmodule.js à 34 %, alors que c'est un module produit entier. Les
 * builders reçoivent un conteneur et des données : on peut donc les appeler
 * avec un conteneur détaché et des chantiers de test, sans carte ni réseau.
 */

/** Charge la carte, où index.html expose TravauxModule et TravauxViews. */
async function ouvrirCarte(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.TravauxModule && window.TravauxViews,
    null,
    { timeout: 20000 },
  );
}

const mk = (id, nature, commune, etat, debut, fin) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [4.85, 45.75] },
  properties: {
    id, project_name: `Chantier ${id}`, nature_travaux: nature,
    commune, etat, date_debut: debut, date_fin: fin,
  },
});

/** Jeu de chantiers, passé en argument aux évaluations navigateur. */
const FEATURES = [
  mk(1, 'Voirie', 'Lyon', 'Ouvert', '2025-01-10', '2025-06-30'),
  mk(2, 'Voirie', 'Villeurbanne', 'Terminé', '2024-03-01', '2024-09-15'),
  mk(3, 'Réseaux', 'Lyon', 'Prochain', '2026-02-01', '2026-08-31'),
  mk(4, 'Espaces verts', 'Bron', 'Ouvert', '2025-05-01', '2025-12-31'),
];

const CHANTIERS = [
  { id: 'a1', name: 'Pont de la Guillotière', etat: 'Ouvert', approved: true, date_debut: '2025-01-01', date_fin: '2025-09-30' },
  { id: 'a2', name: 'Rue Garibaldi', etat: 'Prochain', approved: false, date_debut: '2026-01-01', date_fin: null },
  { id: 'a3', name: 'Quai Victor Augagneur', etat: 'Terminé', approved: true, date_debut: null, date_fin: '2024-12-31' },
];

test.describe('0.43 - Travaux : utilitaires', () => {

  test('0.43.1 - parseTs rend un temps ou null, jamais NaN', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate(() => {
      const p = window.TravauxModule.parseTs;
      return { iso: p('2025-01-10'), vide: p(''), nul: p(null), absurde: p('pas une date') };
    });
    expect(r.iso).toBe(Date.UTC(2025, 0, 10));
    expect(r.vide).toBeNull();
    expect(r.nul).toBeNull();
    expect(r.absurde).toBeNull();
  });

  test('0.43.2 - enrichTimestamps borne les dates manquantes et reste idempotent', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate(() => {
      const f = [
        { properties: { date_debut: '2025-01-10', date_fin: '2025-06-30' } },
        { properties: { date_debut: null, date_fin: null } },
      ];
      window.TravauxModule.enrichTimestamps(f);
      const avant = f[0].properties._ts_debut;
      f[0].properties.date_debut = '1999-01-01';
      window.TravauxModule.enrichTimestamps(f);
      return {
        debut: f[0].properties._ts_debut,
        inchange: f[0].properties._ts_debut === avant,
        sansDebut: f[1].properties._ts_debut,
        sansFin: f[1].properties._ts_fin,
      };
    });
    expect(r.debut).toBe(Date.UTC(2025, 0, 10));
    // Deuxième passage : les horodatages déjà posés ne sont pas recalculés
    expect(r.inchange).toBe(true);
    // Un chantier sans date commence « depuis toujours » et ne finit jamais
    expect(r.sansDebut).toBe(0);
    expect(r.sansFin).toBeGreaterThan(Date.UTC(2200, 0, 1));
  });

  test('0.43.3 - uniqueSorted classe par fréquence puis par ordre alphabétique', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      window.TravauxModule.enrichTimestamps(features);
      return window.TravauxModule.uniqueSorted(features, 'nature_travaux');
    }, FEATURES);
    expect(r.values[0]).toBe('Voirie');
    expect(r.counts).toEqual({ 'Voirie': 2, 'Réseaux': 1, 'Espaces verts': 1 });
    expect(r.values.slice(1)).toEqual(['Espaces verts', 'Réseaux']);
  });

  test('0.43.4 - countAtTime ne compte que les chantiers ouverts à cet instant', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      window.TravauxModule.enrichTimestamps(features);
      const c = window.TravauxModule.countAtTime;
      return {
        mars2025: c(features, Date.UTC(2025, 2, 1)),
        juin2024: c(features, Date.UTC(2024, 5, 1)),
        an2030: c(features, Date.UTC(2030, 0, 1)),
      };
    }, FEATURES);
    expect(r.mars2025).toBe(1);
    expect(r.juin2024).toBe(1);
    expect(r.an2030).toBe(0);
  });

  test('0.43.5 - computeHistogram rend 60 seaux et supporte un intervalle nul', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      window.TravauxModule.enrichTimestamps(features);
      const h = window.TravauxModule.computeHistogram(features, Date.UTC(2024, 0, 1), Date.UTC(2027, 0, 1));
      return {
        n: h.length,
        max: Math.max(...h),
        somme: h.reduce((a, b) => a + b, 0),
        degenere: window.TravauxModule.computeHistogram(features, 100, 100),
      };
    }, FEATURES);
    expect(r.n).toBe(60);
    expect(r.max).toBeGreaterThan(0);
    expect(r.somme).toBeGreaterThan(0);
    // Bornes égales : que des zéros, pas une division par zéro
    expect(r.degenere.every((v) => v === 0)).toBe(true);
  });

  test('0.43.6 - applyStructuralFilter combine les critères sans tenir compte de la casse', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      const a = window.TravauxModule.applyStructuralFilter;
      return {
        nature: a(features, { nature_travaux: 'voirie' }).length,
        combine: a(features, { nature_travaux: 'Voirie', commune: 'Lyon' }).length,
        interne: a(features, { _ignore: 'xxx' }).length,
        aucun: a(features, { commune: 'Marseille' }).length,
      };
    }, FEATURES);
    expect(r.nature).toBe(2);
    expect(r.combine).toBe(1);
    // Les clés préfixées d'un souligné sont de l'état interne, pas un filtre
    expect(r.interne).toBe(4);
    expect(r.aucun).toBe(0);
  });

  test('0.43.7 - calcProgress reste borné entre 0 et 100', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate(() => {
      const p = window.TravauxModule.calcProgress;
      return {
        futur: p('2099-01-01', '2099-12-31'),
        passe: p('2000-01-01', '2000-12-31'),
        inverse: p('2025-12-31', '2025-01-01'),
        sansFin: p('2025-01-01', null),
        vide: p(null, null),
      };
    });
    expect(r.futur).toBe(0);
    expect(r.passe).toBe(100);
    // Fin avant début : pas de pourcentage négatif
    expect(r.inverse).toBe(0);
    expect(r.sansFin).toBe(0);
    expect(r.vide).toBe(0);
  });

  test("0.43.8 - getChantierDisplayName suit l'ordre de repli des champs", async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate(() => {
      const g = window.TravauxModule.getChantierDisplayName;
      return [
        g({ project_name: 'A', name: 'B', nature_travaux: 'C' }),
        g({ name: 'B', nature_travaux: 'C' }),
        g({ nature_travaux: 'C' }),
        g({ nature: 'D' }),
        g({}),
        g(null),
      ];
    });
    expect(r).toEqual(['A', 'B', 'C', 'D', '', '']);
  });

  test('0.43.9 - normalizeGeoJSON accepte toutes les formes et pose une clé par chantier', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate(() => {
      const n = window.TravauxModule.normalizeGeoJSON;
      return {
        collection: n({ type: 'FeatureCollection', features: [{ properties: { id: 1 } }] }).features.length,
        tableau: n([{ properties: { id: 2 } }]).features.length,
        feature: n({ type: 'Feature', properties: { id: 7 } }).features.length,
        nul: n(null).features.length,
        chaine: n('nimportequoi').features.length,
        cle: n([{ properties: { id: 42 } }]).features[0].properties.chantier_key,
        sansId: n([{ properties: {} }]).features[0].properties.chantier_key,
      };
    });
    expect(r.collection).toBe(1);
    expect(r.tableau).toBe(1);
    expect(r.feature).toBe(1);
    expect(r.nul).toBe(0);
    expect(r.chaine).toBe(0);
    expect(r.cle).toBe('travaux:feature:42');
    // Sans identifiant, la clé retombe sur la position, jamais sur undefined
    expect(r.sansId).toBe('travaux:auto:0');
  });

  test('0.43.10 - buildTimelineExpr laisse passer les entités sans horodatage', async ({ page }) => {
    await ouvrirCarte(page);
    const expr = await page.evaluate(() => window.TravauxModule.buildTimelineExpr(1000));
    expect(expr[0]).toBe('any');
    expect(expr[1]).toEqual(['!', ['has', '_ts_debut']]);
    expect(expr[2]).toEqual(['all', ['<=', ['get', '_ts_debut'], 1000], ['>=', ['get', '_ts_fin'], 1000]]);
  });

  test("0.43.11 - RÉGRESSION : un libellé de filtre piégé ne s'exécute pas", async ({ page }) => {
    await ouvrirCarte(page);
    // renderBadges pose le libellé du filtre en innerHTML, et la valeur vient
    // de la colonne nature_travaux : sans échappement, la base injecte du HTML.
    const r = await page.evaluate(() => {
      const c = document.createElement('div');
      document.body.appendChild(c);
      window.TravauxModule.renderBadges(
        c,
        { nature_travaux: '<img src=x onerror="window.__xssBadge=1">' },
        { etat: { value: '' } },
        () => {},
      );
      return { imgs: c.querySelectorAll('img').length, texte: c.textContent };
    });
    expect(r.imgs).toBe(0);
    expect(await page.evaluate(() => window.__xssBadge)).toBeUndefined();
    expect(r.texte).toContain('Nature');
  });

  test('0.43.12 - Un badge se retire au clic comme au clavier', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate(() => {
      const c = document.createElement('div');
      document.body.appendChild(c);
      let appels = 0;
      const els = { etat: { value: 'Ouvert' } };
      window.TravauxModule.renderBadges(c, { etat: 'Ouvert' }, els, () => { appels++; });
      const badge = c.querySelector('.travaux-badge');
      const label = badge.getAttribute('aria-label');
      badge.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return { label, appels, valeurApres: els.etat.value, affichage: c.style.display };
    });
    expect(r.label).toContain('Retirer filtre');
    expect(r.appels).toBe(1);
    expect(r.valeurApres).toBe('');
    expect(r.affichage).toBe('flex');
  });

  test('0.43.13 - Sans aucun critère, la zone de badges est masquée', async ({ page }) => {
    await ouvrirCarte(page);
    const affichage = await page.evaluate(() => {
      const c = document.createElement('div');
      document.body.appendChild(c);
      window.TravauxModule.renderBadges(c, { _interne: 'x' }, {}, () => {});
      return c.style.display;
    });
    expect(affichage).toBe('none');
  });

});

test.describe('0.44 - Travaux : vues chronologie et filtres', () => {

  // Chaque cas monte son propre conteneur détaché et un TM réel dont seul
  // l'appel à la carte est neutralisé : tout le reste du builder s'exécute.

  test("0.44.1 - La chronologie affiche le curseur, les bornes et l'histogramme", async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      window.TravauxModule.enrichTimestamps(features);
      window.TravauxViews.buildTimeline(container, features, TM);
      return {
        slider: !!container.querySelector('#np-tl-slider'),
        histogramme: container.querySelectorAll('#np-tl-histogram rect').length,
        min: container.querySelector('.np-chrono-label-min')?.textContent,
        max: container.querySelector('.np-chrono-label-max')?.textContent,
        compte: container.querySelector('#np-tl-count')?.textContent,
      };
    }, FEATURES);
    expect(r.slider).toBe(true);
    expect(r.histogramme).toBe(60);
    expect(r.min).toMatch(/2024/);
    expect(r.max).toMatch(/2026/);
    expect(r.compte).toMatch(/^\d+$/);
  });

  test('0.44.2 - Bouger le curseur recalcule le nombre de chantiers en cours', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      window.TravauxModule.enrichTimestamps(features);
      window.TravauxViews.buildTimeline(container, features, TM);
      const slider = container.querySelector('#np-tl-slider');
      const max = Number(slider.max);
      const comptes = [];
      const dates = [];
      for (let i = 0; i <= 20; i++) {
        slider.value = String(Math.round((i / 20) * max));
        slider.dispatchEvent(new Event('input'));
        comptes.push(Number(container.querySelector('#np-tl-count').textContent));
        dates.push(container.querySelector('#np-tl-date').textContent);
      }
      return { max, comptes, distinctes: new Set(dates).size };
    }, FEATURES);
    // La plage couvre mars 2024 à août 2026
    expect(r.max).toBeGreaterThan(700);
    // Le compte varie le long de la plage : deux chantiers se chevauchent
    // en mai-juin 2025, aucun trio ne coexiste dans ce jeu de données.
    expect(Math.max(...r.comptes)).toBe(2);
    expect(Math.min(...r.comptes)).toBe(0);
    expect(new Set(r.comptes).size).toBeGreaterThan(1);
    // Chaque position affiche sa propre date
    expect(r.distinctes).toBe(21);
  });

  test('0.44.3 - Sans aucune date, la chronologie le dit au lieu de planter', async ({ page }) => {
    await ouvrirCarte(page);
    const txt = await page.evaluate(() => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      window.TravauxViews.buildTimeline(container, [{ properties: { date_debut: null, date_fin: null } }], TM);
      return container.textContent;
    });
    expect(txt).toContain('Aucune date disponible');
  });

  test('0.44.4 - Les filtres listent les valeurs présentes avec leur compte', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      window.TravauxModule.enrichTimestamps(features);
      window.TravauxViews.buildFilters(container, features, TM);
      const opts = [...container.querySelectorAll('#np-f-nature-list .np-filter-option:not(.np-filter-option--all)')];
      return {
        natures: opts.map((b) => b.dataset.value),
        comptes: opts.map((b) => b.querySelector('.np-filter-option-count')?.textContent),
        etats: [...container.querySelectorAll('#np-f-etat option')].map((o) => o.value),
        total: container.querySelector('#np-f-count')?.textContent,
      };
    }, FEATURES);
    expect(r.natures).toEqual(['Voirie', 'Espaces verts', 'Réseaux']);
    expect(r.comptes).toEqual(['2', '1', '1']);
    expect(r.etats).toEqual(['', 'Ouvert', 'Prochain', 'Terminé']);
    expect(r.total).toBe('4');
  });

  test('0.44.5 - La recherche dans une liste de filtre masque les valeurs hors requête', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      window.TravauxModule.enrichTimestamps(features);
      window.TravauxViews.buildFilters(container, features, TM);
      const input = container.querySelector('#np-f-nature-search');
      input.value = 'voi';
      input.dispatchEvent(new Event('input'));
      return [...container.querySelectorAll('#np-f-nature-list .np-filter-option:not(.np-filter-option--all)')]
        .filter((b) => b.style.display !== 'none')
        .map((b) => b.dataset.value);
    }, FEATURES);
    expect(r).toEqual(['Voirie']);
  });

  test('0.44.6 - Choisir une nature réduit le compte et fait apparaître le badge', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      window.TravauxModule.enrichTimestamps(features);
      window.TravauxViews.buildFilters(container, features, TM);
      container.querySelector('#np-f-nature-list .np-filter-option[data-value="Voirie"]').click();
      return {
        compte: container.querySelector('#np-f-count')?.textContent,
        badges: container.querySelector('#np-f-badges')?.textContent,
        reset: container.querySelector('#np-f-reset')?.style.display,
      };
    }, FEATURES);
    expect(r.compte).toBe('2');
    expect(r.badges).toContain('Voirie');
    expect(r.reset).not.toBe('none');
  });

  test('0.44.7 - Réinitialiser rend les quatre chantiers', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate((features) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      window.TravauxModule.enrichTimestamps(features);
      window.TravauxViews.buildFilters(container, features, TM);
      container.querySelector('#np-f-nature-list .np-filter-option[data-value="Voirie"]').click();
      const reduit = container.querySelector('#np-f-count').textContent;
      container.querySelector('#np-f-reset').click();
      return { reduit, apres: container.querySelector('#np-f-count').textContent };
    }, FEATURES);
    expect(r.reduit).toBe('2');
    expect(r.apres).toBe('4');
  });

  test('0.44.8 - Une nature piégée ne pose aucune balise dans la liste', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await page.evaluate(() => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const TM = Object.assign({}, window.TravauxModule, { setMapTimelineFilter: () => {} });
      const features = [{
        properties: {
          nature_travaux: '<img src=x onerror="window.__xssFiltre=1">',
          commune: 'Lyon', etat: 'Ouvert',
          date_debut: '2025-01-01', date_fin: '2025-12-31',
        },
      }];
      window.TravauxModule.enrichTimestamps(features);
      window.TravauxViews.buildFilters(container, features, TM);
      return { imgs: container.querySelectorAll('img').length };
    });
    expect(r.imgs).toBe(0);
    expect(await page.evaluate(() => window.__xssFiltre)).toBeUndefined();
  });

});

test.describe('0.45 - Travaux : vues administrateur et contributeur', () => {

  /**
   * Neutralise les sources de données pour que le builder rende sans réseau :
   * seule la couche de données est simulée, tout le rendu est le vrai.
   */
  async function rendre(page, { chantiers, methode = 'fetchCityTravaux', ville = 'test-e2e', stale = false, vue = 'buildAdmin', avant = '' }) {
    return page.evaluate(async (a) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      if (a.avant) container.innerHTML = a.avant;
      window.CityManager = window.CityManager || {};
      window.CityManager.getActiveCity = () => a.ville;
      window.supabaseService = window.supabaseService || {};
      window.supabaseService[a.methode] = async () => a.chantiers;
      await window.TravauxViews[a.vue](container, { isStale: () => a.stale });
      return {
        html: container.innerHTML,
        texte: container.textContent,
        total: container.querySelector('.np-admin-hero-count')?.textContent ?? null,
        items: container.querySelectorAll('.np-admin-item').length,
        enAttente: container.querySelectorAll('.np-admin-item--pending').length,
        onglets: [...container.querySelectorAll('.np-tab')].map((t) => t.dataset.tab),
        ajouter: !!container.querySelector('#np-admin-add'),
        imgs: container.querySelectorAll('.np-admin-item img').length,
      };
    }, { chantiers, methode, ville, stale, vue, avant });
  }

  test('0.45.1 - La vue admin liste les chantiers et compte ceux en attente', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await rendre(page, { chantiers: CHANTIERS });
    expect(r.total).toBe('3');
    expect(r.items).toBe(3);
    expect(r.enAttente).toBe(1);
    expect(r.onglets).toEqual(['all', 'pending']);
    expect(r.ajouter).toBe(true);
  });

  test('0.45.2 - Sans ville active, la vue admin le signale', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await rendre(page, { chantiers: CHANTIERS, ville: null });
    expect(r.texte).toContain('Ville non définie');
  });

  test('0.45.3 - RÉGRESSION : un nom de chantier piégé ne pose aucune balise', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await rendre(page, {
      chantiers: [{ id: 'x', name: '<img src=x onerror="window.__xssAdmin=1">', etat: 'Ouvert', approved: true }],
    });
    expect(r.imgs).toBe(0);
    expect(await page.evaluate(() => window.__xssAdmin)).toBeUndefined();
  });

  test('0.45.4 - Sans aucun chantier, la vue admin propose quand même d\'en ajouter', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await rendre(page, { chantiers: [] });
    expect(r.total).toBe('0');
    expect(r.items).toBe(0);
    expect(r.ajouter).toBe(true);
    // Pas d'onglets quand il n'y a rien à répartir
    expect(r.onglets).toEqual([]);
  });

  test('0.45.5 - La vue contributeur compte les propositions', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await rendre(page, { chantiers: CHANTIERS, methode: 'fetchMyTravaux', vue: 'buildContributor' });
    expect(r.total).toBe('3');
    expect(r.onglets.length).toBeGreaterThan(0);
  });

  test('0.45.6 - Sans proposition, la vue contributeur affiche un état vide', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await rendre(page, { chantiers: [], methode: 'fetchMyTravaux', vue: 'buildContributor' });
    expect(r.texte).toContain('Aucune proposition');
  });

  test('0.45.7 - Un rendu périmé est abandonné avant de peindre', async ({ page }) => {
    await ouvrirCarte(page);
    const r = await rendre(page, { chantiers: CHANTIERS, stale: true });
    expect(r.html).not.toContain('np-admin-hero-count');
  });

});
