// @ts-check
import { test, expect } from '@playwright/test';

/**
 * 0.26 - Hub ville : /ville/{ville}
 * Page rendue côté serveur par l'edge function ville-hub (liste des projets
 * d'une ville, tags catégories, vue carte) + enrichissement client.
 */

/** @type {{ville: string, catSlug: string} | null} */
let CITY = null; // ville réelle découverte en base (avec au moins 1 projet approuvé)

async function discoverCity(page) {
  await page.goto('/ville/metropole-lyon/carte', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // Mêmes contraintes que l'edge function ville-hub (sinon la ville découverte
  // pourrait être filtrée → hub servi en noindex et toute la suite échoue) :
  // ville + category_slug + slug non nuls, hors entrées e2e/test, slug
  // minuscule, et espace ouvert aux moteurs (city_branding.indexable).
  return page.evaluate(async () => {
    if (!window.supabaseService) return null;
    try {
      const { data: hidden } = await window.__supabaseClient
        .from('city_branding')
        .select('ville')
        .eq('indexable', false);
      const horsIndex = new Set((hidden || []).map(b => String(b.ville || '').toLowerCase()));
      const { data } = await window.__supabaseClient
        .from('contribution_uploads')
        .select('ville, category_slug, slug, project_name')
        .eq('approved', true)
        .not('ville', 'is', null)
        .not('category_slug', 'is', null)
        .not('slug', 'is', null)
        .not('slug', 'ilike', 'e2e-%')
        .not('slug', 'ilike', 'test%')
        .not('project_name', 'ilike', 'e2e%')
        .not('project_name', 'ilike', 'test%')
        .limit(200);
      const row = Array.isArray(data)
        ? data.find(r => r.ville && r.ville === r.ville.toLowerCase() && !horsIndex.has(r.ville))
        : null;
      return row ? { ville: row.ville, catSlug: row.category_slug } : null;
    } catch {
      return null;
    }
  });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  CITY = await discoverCity(page);
  await page.close();
});

const hubUrl = () => `/ville/${encodeURIComponent(CITY?.ville || '')}`;

async function gotoHub(page) {
  await page.goto(hubUrl(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#vh-content', { timeout: 15000 });
}

// ═════════════════════════════════════════════════════════
// 0.26 - Hub ville : SSR (pré-rendu edge)
// ═════════════════════════════════════════════════════════
test.describe('0.26 - Hub ville : SSR', () => {

  test('0.26.1 - Title, canonical et robots index sont injectés côté serveur', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    const response = await page.request.get(hubUrl());
    // Ne pas utiliser toContain('index') : 'noindex' le contiendrait aussi
    expect(response.headers()['x-robots-tag']).toMatch(/^index/);
    const html = await response.text();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || '';
    expect(title).toContain('projets');
    expect(title).toContain('Open Projets');
    const canonical = html.match(/rel="canonical"\s+href="([^"]*)"/)?.[1] || '';
    expect(canonical).toBe(`https://openprojets.com/ville/${encodeURIComponent(CITY.ville)}`);
    expect(html).toMatch(/<meta name="robots" content="index, follow/);
  });

  test('0.26.2 - JSON-LD CollectionPage + ItemList + BreadcrumbList', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    const response = await page.request.get(hubUrl());
    const html = await response.text();
    expect(html).toContain('"@type":"CollectionPage"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    // Chaque élément de la liste pointe vers une fiche
    expect(html).toMatch(/"url":"https:\/\/openprojets\.com\/fiche\/[^"]+"/);
  });

  test('0.26.3 - Les cards projets sont rendues avec des liens crawlables vers les fiches', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    const response = await page.request.get(hubUrl());
    const html = await response.text();
    const cards = html.match(/class="vh-card"/g) || [];
    expect(cards.length).toBeGreaterThan(0);
    const links = html.match(new RegExp(`href="/fiche/${CITY.ville}/[^"]+"`, 'g')) || [];
    expect(links.length).toBeGreaterThan(0);
    // h1 unique : le titre de page (les cards utilisent h2)
    expect((html.match(/<h1[^>]*>/g) || []).length).toBe(1);
  });

  test('0.26.4 - Les tags catégories portent des compteurs', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    const response = await page.request.get(hubUrl());
    const html = await response.text();
    // Au moins le tag « Tous » + 1 catégorie
    const tags = html.match(/class="vh-tag[ "]/g) || [];
    expect(tags.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/class="vh-tag__count">\d+</);
  });

  test('0.26.5 - Ville inconnue → 200 avec X-Robots-Tag noindex', async ({ page }) => {
    const response = await page.request.get('/ville/ville-inexistante-xyz-999');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  });

  test('0.26.6 - /ville/ sans slug → index de toutes les villes, indexable', async ({ page }) => {
    const response = await page.request.get('/ville/');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toMatch(/^index/);
    const html = await response.text();
    expect(html).toMatch(/<meta name="robots" content="index/);
    expect(html).toContain('<link rel="canonical" href="https://openprojets.com/ville/">');
    expect(html).toMatch(/<title>[^<]*par ville[^<]*<\/title>/);
    // Le hub de la ville découverte est relié depuis l'index, avec son compte
    if (CITY) {
      expect(html).toContain(`href="/ville/${encodeURIComponent(CITY.ville)}"`);
    }
    expect(html).toMatch(/class="vh-ville__count">\d+ projets?</);
    // JSON-LD : une ItemList des villes
    expect(html).toMatch(/"@type":"ItemList","numberOfItems":\d+/);
  });

  test('0.26.6b - /ville/ : chaque ville reliée répond en 200 et indexable (échantillon)', async ({ page }) => {
    const html = await (await page.request.get('/ville/')).text();
    const villes = [...html.matchAll(/href="\/ville\/([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(villes.length).toBeGreaterThan(1);
    for (const v of villes.slice(0, 3)) {
      const r = await page.request.get(`/ville/${v}`);
      expect(r.status(), v).toBe(200);
      expect(r.headers()['x-robots-tag'], v).toMatch(/^index/);
    }
  });

  test('0.26.6c - /ville/ : les villes sont rangées par région, la plus fournie en tête', async ({ page }) => {
    const html = await (await page.request.get('/ville/')).text();
    // Une section par région, chacune avec son titre et son décompte
    const sections = [...html.matchAll(/class="vh-ix-region" id="region-([a-z0-9]+)"/g)].map(m => m[1]);
    expect(sections.length).toBeGreaterThan(1);
    expect(new Set(sections).size).toBe(sections.length); // pas deux fois la même
    expect(html).toMatch(/class="vh-ix-region__name">[^<]+</);
    expect(html).toMatch(/class="vh-ix-region__meta" data-villes="\d+">[^<]*villes?,/);
    // Un h2 par région, et toujours un seul h1
    expect((html.match(/<h2 class="vh-ix-region__title">/g) || []).length).toBe(sections.length);
    expect((html.match(/<h1[^>]*>/g) || []).length).toBe(1);
    // Les régions vont de la plus fournie à la moins fournie
    const villesParRegion = [...html.matchAll(/data-villes="(\d+)"/g)].map(m => Number(m[1]));
    expect([...villesParRegion].sort((a, b) => b - a)).toEqual(villesParRegion);
    // Les raccourcis de région mènent bien à une section existante
    const ancres = [...html.matchAll(/class="vh-ix-nav__link" href="#region-([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ancres).toEqual(sections);
    // Chaque ville porte son département
    expect(html).toMatch(/class="vh-ville__dep">[^<]+</);
  });

  test('0.26.6d - /ville/ : la carte de France est rendue côté serveur, un point par ville', async ({ page }) => {
    const html = await (await page.request.get('/ville/')).text();
    expect(html).toContain('class="vh-ixmap"');
    // Le tracé de la France et les points sont dans le HTML, sans librairie
    expect(html).toMatch(/class="vh-ixmap__land" d="M[-\d.,LZM]+"/);
    const pins = [...html.matchAll(/class="vh-ixmap__pin" href="\/ville\/([a-z0-9-]+)"/g)].map(m => m[1]);
    const cartes = [...html.matchAll(/class="vh-ville" data-ville="([a-z0-9-]+)"/g)].map(m => m[1]);
    expect(pins.length).toBeGreaterThan(1);
    // Chaque point correspond à une ville de la liste, et réciproquement
    expect([...pins].sort()).toEqual([...cartes].sort());
    // Chaque point est nommé pour les lecteurs d'écran
    expect(html).toMatch(/class="vh-ixmap__pin"[^>]*aria-label="[^"]+, \d+ projets?"/);
  });

  test('0.26.6e - /ville/ : la recherche filtre la liste et la carte', async ({ page }) => {
    await page.goto('/ville/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vh-ix-q');
    const total = await page.locator('.vh-ville').count();
    expect(total).toBeGreaterThan(5);

    // Le nom d'une ville présente : une seule reste, les autres points s'estompent
    const nom = (await page.locator('.vh-ville__name').first().textContent()).trim();
    await page.fill('#vh-ix-q', nom);
    // Le filtrage passe par requestAnimationFrame : on attend qu'il ait mordu
    await expect.poll(() => page.locator('.vh-ville:not([hidden])').count()).toBeLessThan(total);
    expect(await page.locator('.vh-ville:not([hidden])').count()).toBeGreaterThan(0);
    expect(await page.locator('.vh-ixmap__pin.is-dimmed').count()).toBeGreaterThan(0);
    // Le titre de la région annonce le nombre trouvé, pas le nombre total
    await expect(page.locator('.vh-ix-region:not([hidden]) .vh-ix-region__meta').first()).toContainText(' sur ');
    await expect(page.locator('#vh-ix-empty')).toBeHidden();

    // Un nom qui n'existe pas : état vide qui dit quoi faire ensuite
    await page.fill('#vh-ix-q', 'zzzzqqqq');
    await expect(page.locator('#vh-ix-empty')).toBeVisible();
    await expect(page.locator('#vh-ix-count')).toHaveText('Aucune ville');

    // Champ vidé : tout revient, compteurs de région compris
    await page.fill('#vh-ix-q', '');
    await expect.poll(() => page.locator('.vh-ville:not([hidden])').count()).toBe(total);
    await expect(page.locator('.vh-ix-region__meta').first()).not.toContainText(' sur ');
  });

  test('0.26.6f - /ville/ : la barre du haut renvoie à l\'accueil, pas à « la carte »', async ({ page }) => {
    const html = await (await page.request.get('/ville/')).text();
    expect(html).toContain('<span>Accueil</span>');
    expect(html).toMatch(/id="vh-btn-back"[^>]*aria-label="Revenir à l'accueil/);
  });

  test('0.26.7 - Le sitemap référence le hub de la ville', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    const response = await page.request.get('/sitemap.xml');
    const xml = await response.text();
    expect(xml).toContain(`https://openprojets.com/ville/${encodeURIComponent(CITY.ville)}`);
  });

  test('0.26.8 - JSON-LD : les < sont échappés (pas de sortie de <script>)', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    const response = await page.request.get(hubUrl());
    const html = await response.text();
    // Isole les blocs JSON-LD : aucun ne doit contenir un < littéral non échappé
    const blocks = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) {
      const body = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      expect(body).not.toContain('<');
    }
  });

  test('0.26.9 - og:image est une URL absolue', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    const response = await page.request.get(hubUrl());
    const html = await response.text();
    const og = html.match(/property="og:image"\s+content="([^"]*)"/)?.[1] || '';
    expect(og).toMatch(/^https:\/\//);
  });

  // Note : le cas « percent-encoding invalide » (/ville/%zz) est géré par un
  // try/catch autour de decodeURIComponent dans l'edge function, mais n'est pas
  // testable ici - netlify-cli (dev) plante lui-même sur ces URLs, en amont de
  // la fonction. En production, le runtime edge les route normalement.
});

// ═════════════════════════════════════════════════════════
// 0.27 - Hub ville : interactions client
// ═════════════════════════════════════════════════════════
test.describe('0.27 - Hub ville : interactions', () => {

  test('0.27.1 - Filtrer par tag masque les autres cards et pose le hash', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    const tag = page.locator('.vh-tag:not([data-cat=""])').first();
    const slug = await tag.getAttribute('data-cat');
    const expected = parseInt(await tag.locator('.vh-tag__count').textContent() || '0', 10);
    await tag.click();
    await expect(tag).toHaveClass(/is-active/);
    await expect(tag).toHaveAttribute('aria-pressed', 'true');
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('.vh-card')].filter(c => !c.hidden).length
    );
    expect(visible).toBe(expected);
    expect(page.url()).toContain(`#c=${slug}`);
  });

  test('0.27.2 - Le hash #c={slug} filtre dès le chargement', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    const slug = await page.locator('.vh-tag:not([data-cat=""])').first().getAttribute('data-cat');
    await page.goto(`${hubUrl()}#c=${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vh-content');
    await expect(page.locator(`.vh-tag[data-cat="${slug}"]`)).toHaveClass(/is-active/);
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('.vh-card')].some(c => c.hidden)
    );
    // Au moins une card d'une autre catégorie est masquée (sauf ville monocat)
    const catCount = await page.locator('.vh-tag:not([data-cat=""])').count();
    if (catCount > 1) expect(hidden).toBe(true);
  });

  test('0.27.3 - Le tag « Tous » réaffiche toutes les cards', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    await page.locator('.vh-tag:not([data-cat=""])').first().click();
    await page.locator('.vh-tag[data-cat=""]').click();
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('.vh-card')].some(c => c.hidden)
    );
    expect(hidden).toBe(false);
    expect(page.url()).not.toContain('#c=');
  });

  test('0.27.4 - La carte-héros s\'initialise (MapLibre chargé après le rendu)', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    // La carte enrichit le héros après le premier paint (requestIdleCallback)
    const canvas = page.locator('#vh-hero-map canvas');
    await expect(canvas).toBeAttached({ timeout: 30000 });
    await expect(page.locator('#vh-hero-map')).toHaveClass(/is-ready/, { timeout: 30000 });
  });

  test('0.27.5 - La recherche filtre les cards et met à jour le compteur', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    const search = page.locator('#vh-search');
    // La recherche n'apparaît qu'au-delà d'un seuil de projets
    const hasSearch = await search.count() > 0;
    test.skip(!hasSearch, 'Trop peu de projets pour afficher la recherche');
    // Un terme improbable ne matche rien → état vide + compteur à 0
    await search.fill('zzzzxxxqqq');
    await expect(page.locator('#vh-empty')).toBeVisible();
    await expect(page.locator('#vh-count')).toHaveText(/^0 projet/);
    // Vidé → toutes les cards réapparaissent (le filtrage est débouncé via rAF)
    await search.fill('');
    await expect(page.locator('#vh-empty')).toBeHidden();
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('.vh-card')].some(c => c.hidden)
    );
    expect(hidden).toBe(false);
  });

  test('0.27.6 - Le compteur de résultats suit le filtre catégorie', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    const tag = page.locator('.vh-tag:not([data-cat=""])').first();
    const expected = parseInt(await tag.locator('.vh-tag__count').textContent() || '0', 10);
    await tag.click();
    await expect(page.locator('#vh-count')).toHaveText(new RegExp(`^${expected} projet`));
  });

  test('0.27.7 - Le bouton thème bascule data-theme', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    const html = page.locator('html');
    const initial = await html.getAttribute('data-theme');
    await page.locator('#vh-btn-theme').click();
    const after = await html.getAttribute('data-theme');
    expect(after).not.toBe(initial);
    expect(['dark', 'light']).toContain(after);
  });

  test('0.27.8 - Le CTA « Ouvrir la carte » pointe vers l\'app de la ville', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    const href = await page.locator('#vh-open-map').getAttribute('href');
    expect(href).toBe(`/ville/${CITY.ville}/carte`);
    // Le lien retour de la topbar mène toujours à la carte de la ville
    expect(await page.locator('#vh-btn-back').getAttribute('href')).toBe(`/ville/${CITY.ville}/carte`);
  });

  test('0.27.9 - Le CTA carte transporte le filtre catégorie actif', async ({ page }) => {
    test.skip(!CITY, 'Aucune ville trouvée en base');
    await gotoHub(page);
    const tag = page.locator('.vh-tag:not([data-cat=""])').first();
    const slug = await tag.getAttribute('data-cat');
    await tag.click();
    const href = await page.locator('#vh-open-map').getAttribute('href');
    expect(href).toContain(`/ville/${CITY.ville}/carte?`);
    expect(href).toContain(`cat=${slug}`);
  });
});
