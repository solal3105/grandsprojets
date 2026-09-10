// @ts-check
import { test, expect } from '@playwright/test';

/**
 * 0.67 - Ce que Google affiche : titres et descriptions de toutes les pages
 * publiques.
 *
 * Search Console montrait le 9 septembre 2026 que presque tous les titres
 * dépassaient la soixantaine de caractères affichée par Google, et que les
 * descriptions étaient coupées en plein milieu d'un mot. Les deux se
 * réintroduisent sans qu'on s'en aperçoive : rien ne casse à l'écran, seul le
 * résultat de recherche se dégrade. D'où ces bornes, vérifiées sur chaque
 * gabarit.
 */

const TITRE_MAX = 60;   // au-delà, Google coupe
const DESC_MAX = 160;   // idem pour la description

/** Adresses découvertes dans le plan du site : une ville, une fiche. */
let VILLE_URL = null;
let FICHE_URL = null;

test.beforeAll(async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const chemin = (u) => u.replace(/^https?:\/\/[^/]+/, '');
  VILLE_URL = chemin(locs.find(u => /\/ville\/[^/]+$/.test(u)) || '');
  FICHE_URL = chemin(locs.find(u => /\/fiche\/[^/]+\/[^/]+\/[^/]+$/.test(u)) || '');
});

/** Titre et description tels que servis au robot, avant tout JavaScript. */
async function metas(request, url) {
  const html = await (await request.get(url)).text();
  const decode = (s) => String(s || '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return {
    titre: decode(html.match(/<title>([^<]*)<\/title>/)?.[1] || ''),
    desc: decode(html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] || ''),
  };
}

test.describe('0.67 - Titres et descriptions dans les résultats de recherche', () => {
  const PAGES = [
    ['la carte de la ville par défaut', '/'],
    ['l\'index des villes', '/ville/'],
    ['les cartes des communes', '/cartes/'],
    ['la démo', '/demo/'],
    ['la vitrine', '/home/'],
    ['les fonctionnalités', '/home/fonctionnalites'],
    ['la page à propos', '/home/a-propos'],
    ['le centre d\'aide', '/home/aide'],
    ['les ressources', '/home/ressources'],
    ['la tarification', '/home2/tarification'],
  ];

  for (const [nom, url] of PAGES) {
    test(`0.67.1 - ${nom} tient dans un résultat de recherche`, async ({ request }) => {
      const { titre, desc } = await metas(request, url);
      expect(titre.length, `titre de ${url} : « ${titre} »`).toBeGreaterThan(0);
      expect(titre.length, `titre de ${url} : « ${titre} »`).toBeLessThanOrEqual(TITRE_MAX);
      expect(desc.length, `description de ${url}`).toBeGreaterThan(40);
      expect(desc.length, `description de ${url} : « ${desc} »`).toBeLessThanOrEqual(DESC_MAX);
      // Un seul suffixe après la barre verticale
      expect(titre.split('|').length, `titre de ${url}`).toBeLessThanOrEqual(2);
    });
  }

  test('0.67.2 - Le hub d\'une ville tient dans un résultat de recherche', async ({ request }) => {
    test.skip(!VILLE_URL, 'aucune ville dans le plan du site');
    const { titre, desc } = await metas(request, VILLE_URL);
    expect(titre.length).toBeLessThanOrEqual(TITRE_MAX);
    expect(titre).toContain('projets');
    expect(desc.length).toBeLessThanOrEqual(DESC_MAX);
    // La description est une phrase, pas une énumération des catégories brutes
    expect(desc).toContain('sur la carte.');
  });

  test('0.67.3 - Une fiche projet porte son nom puis sa collectivité', async ({ request }) => {
    test.skip(!FICHE_URL, 'aucune fiche dans le plan du site');
    const { titre, desc } = await metas(request, FICHE_URL);
    expect(titre.length).toBeGreaterThan(0);
    expect(titre.length).toBeLessThanOrEqual(TITRE_MAX);
    expect(titre.split('|').length).toBeLessThanOrEqual(2);
    expect(desc.length).toBeLessThanOrEqual(DESC_MAX);
  });

  test('0.67.4 - Aucune description ne coupe un mot en deux', async ({ request }) => {
    const urls = ['/', '/ville/', '/cartes/', '/home/', VILLE_URL].filter(Boolean);
    for (const url of urls) {
      const { desc } = await metas(request, url);
      // Ces pages composent elles-mêmes leur phrase : elle doit se terminer.
      expect(desc.endsWith('…'), `description de ${url} : « ${desc} »`).toBe(false);
      expect(/[.!?»]$/.test(desc), `description de ${url} : « ${desc} »`).toBe(true);
    }
  });
});
