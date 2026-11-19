// @ts-check
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Le flux produits lu par ChatGPT (/flux-produits.jsonl et /flux-produits.csv),
 * écrit au build du site par home-src/scripts/flux-produits.mjs.
 *
 * Les règles sont celles de la spécification « Product feed schema »
 * d'OpenAI (https://developers.openai.com/commerce/specs/file-upload/products) :
 * les onze champs obligatoires sur chaque ligne, une disponibilité prise dans
 * la liste, un prix « montant CODE » à point décimal, des pays en codes ISO
 * majuscules, des adresses absolues. Les prix sont recalculés à la main
 * depuis la grille : le test vérifie le fichier, pas le code qui l'écrit.
 *
 * Section : 0.99 - Le flux produits pour ChatGPT
 */

const lireJsonl = (texte) => texte.trim().split('\n').map((l) => JSON.parse(l));

const OBLIGATOIRES = ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price', 'target_countries', 'store_country'];
const DISPONIBILITES = ['in_stock', 'out_of_stock', 'pre_order', 'backorder', 'unknown'];

/* La grille : 200 € HT par mois pour une unité de poids à 12 000 habitants,
 * en racine carrée de la population ; la plus petite commune chiffrée a 500
 * habitants. Chantiers part des arrêtés d'une commune de moins de 500. */
const annuelA500 = (poids) => Math.round(200 * Math.sqrt(500 / 12000) * poids * 12 * 100) / 100;
const PRIX_ATTENDUS = {
  'module-carte': annuelA500(1),
  'module-travaux': annuelA500(0.6),
  'module-participer': annuelA500(1),
  'module-diagnostic': annuelA500(0.8),
  'module-chantiers': 100,
  openarrete: 0,
};

/* Une lecture CSV minimale : guillemets, guillemets doublés, virgules et
 * retours à la ligne dans une cellule */
function lireCsv(texte) {
  const lignes = [];
  let ligne = [];
  let cellule = '';
  let entre = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entre) {
      if (c === '"' && texte[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') entre = false;
      else cellule += c;
    } else if (c === '"') entre = true;
    else if (c === ',') { ligne.push(cellule); cellule = ''; }
    else if (c === '\n') { ligne.push(cellule.replace(/\r$/, '')); lignes.push(ligne); ligne = []; cellule = ''; }
    else cellule += c;
  }
  const [entetes, ...corps] = lignes;
  return corps.map((cellules) => Object.fromEntries(entetes.map((e, j) => [e, cellules[j]])));
}

test.describe('0.99 - Le flux produits pour ChatGPT', () => {
  const jsonl = readFileSync('home/flux-produits.jsonl', 'utf8');
  const csv = readFileSync('home/flux-produits.csv', 'utf8');
  const produits = lireJsonl(jsonl);

  test('0.99.1 - les six produits, chacun une seule fois', () => {
    expect(produits.map((p) => p.item_id)).toEqual(Object.keys(PRIX_ATTENDUS));
  });

  test('0.99.2 - chaque ligne respecte la spécification', () => {
    for (const p of produits) {
      for (const champ of OBLIGATOIRES) expect(p[champ], `${p.item_id}.${champ}`).toBeTruthy();
      expect(p.title.length).toBeLessThanOrEqual(150);
      expect(p.description.length).toBeLessThanOrEqual(5000);
      expect(DISPONIBILITES).toContain(p.availability);
      expect(p.price).toMatch(/^\d+\.\d{2} EUR$/);
      expect(p.target_countries).toEqual(['FR']);
      expect(p.store_country).toBe('FR');
      for (const adresse of [p.url, p.image_url, p.seller_url]) expect(adresse).toMatch(/^https:\/\/[a-z0-9.-]+\//);
      // Texte brut, sans tiret long (règle du dépôt)
      expect(p.description).not.toMatch(/<[a-z]|[\u2013\u2014\u2015]/i);
      expect(p.title).not.toMatch(/[\u2013\u2014\u2015]/);
    }
  });

  test('0.99.3 - les prix sont les plus bas de la grille, et la description les répète', () => {
    for (const p of produits) {
      const attendu = PRIX_ATTENDUS[p.item_id];
      expect(Number(p.price.split(' ')[0]), p.item_id).toBeCloseTo(attendu, 2);
      if (attendu > 0) {
        const enFrancais = attendu.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        expect(p.description).toContain(`${enFrancais} € HT par an`);
        expect(p.description).toContain('https://openprojets.com/tarification');
      }
    }
  });

  test('0.99.4 - les images de nos modules existent dans le build', () => {
    for (const p of produits.filter((x) => x.image_url.startsWith('https://openprojets.com/'))) {
      const chemin = new URL(p.image_url).pathname; // /img/og/carte.jpg
      expect(existsSync(`home${chemin}`), chemin).toBe(true);
    }
  });

  test('0.99.5 - le CSV porte exactement les mêmes lignes que le JSONL', () => {
    const lignes = lireCsv(csv);
    expect(lignes.length).toBe(produits.length);
    lignes.forEach((l, i) => {
      for (const [champ, valeur] of Object.entries(produits[i])) {
        expect(l[champ], `${produits[i].item_id}.${champ}`).toBe(Array.isArray(valeur) ? JSON.stringify(valeur) : String(valeur));
      }
    });
  });

  test('0.99.6 - les deux fichiers sont servis à la racine du site', async ({ request }) => {
    const r1 = await request.get('/flux-produits.jsonl');
    expect(r1.status()).toBe(200);
    expect(lireJsonl(await r1.text())).toEqual(produits);
    const r2 = await request.get('/flux-produits.csv');
    expect(r2.status()).toBe(200);
    expect(await r2.text()).toBe(csv);
  });
  /* Non-régression du 19/11/2026 : « Disallow: /*.json » écartait aussi le
   * .jsonl, et un lecteur qui respecte robots.txt ne le lisait pas. Règle de
   * Google : la règle la plus longue qui correspond l'emporte, Allow à égalité. */
  test('0.99.7 - robots.txt laisse lire les deux fichiers', () => {
    const regles = readFileSync('robots.txt', 'utf8').split('\n')
      .map((l) => l.match(/^(Allow|Disallow):\s*(\S+)/)).filter(Boolean)
      .map(([, type, motif]) => ({ type, motif, re: new RegExp('^' + motif.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')) }));
    for (const chemin of ['/flux-produits.jsonl', '/flux-produits.csv']) {
      const gagnante = regles.filter((r) => r.re.test(chemin))
        .sort((a, b) => b.motif.length - a.motif.length || (a.type === 'Allow' ? -1 : 1))[0];
      expect(gagnante?.type ?? 'Allow', chemin).toBe('Allow');
    }
  });
});
