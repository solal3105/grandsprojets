// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Helpers
 */

/** Projet réel connu en base (catégorie velo, ville metropole-lyon) */
let VALID_CAT = 'velo';
let VALID_PROJECT = '';
let VALID_CITY = '';

/**
 * Attend que la page fiche soit chargée et le JS hydraté.
 * Vérifie que soit le héro est rendu, soit l'erreur est affichée.
 */
async function waitForFicheBoot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Attendre que le JS init() ait touché le DOM
  await page.waitForFunction(
    () => {
      const hero = document.getElementById('fv2-hero');
      const error = document.getElementById('fv2-error');
      // L'init est terminé quand le skeleton a été remplacé ou l'erreur affichée
      return (hero && hero.querySelector('.fv2-hero__title')) ||
             (error && !error.hidden);
    },
    { timeout: 20000 }
  );
}

/**
 * Récupère un projet valide depuis la page pour les tests dynamiques.
 * On charge la fiche avec un projet connu et récupère les infos du DOM.
 */
async function discoverValidProject(page) {
  // On va d'abord passer par la carte pour trouver un projet existant
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Chercher un lien fiche dans la page, ou utiliser Supabase directement
  const projectSlug = await page.evaluate(async () => {
    const svc = window.supabaseService;
    if (!svc) return null;
    try {
      const { data } = await window.__supabaseClient
        .from('contribution_uploads')
        .select('project_name, category, ville')
        .eq('approved', true)
        .limit(1)
        .single();
      return data;
    } catch {
      return null;
    }
  });

  return projectSlug;
}

// ─────────────────────────────────────────────────────────
// Setup : récupérer un projet valide pour les tests
// ─────────────────────────────────────────────────────────
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  const found = await discoverValidProject(page);
  if (found) {
    VALID_PROJECT = found.project_name;
    VALID_CAT = found.category || 'velo';
    VALID_CITY = found.ville || '';
  }
  await page.close();
});

function ficheUrl(project, cat, city) {
  const params = new URLSearchParams();
  if (cat) params.set('cat', cat);
  if (project) params.set('project', project);
  if (city) params.set('city', city);
  return `/fiche/?${params.toString()}`;
}

/**
 * Attend que les related projects soient chargés (ou timeout = pas de related).
 * loadRelated() est appelé en dernier dans init(), après le markdown.
 */
async function waitForRelated(page) {
  await page.waitForFunction(
    () => {
      const block = document.getElementById('fv2-related-block');
      // Soit visible avec des cards, soit le fetch a eu le temps de se finir
      // On attend que related ait au moins 1 card OU que 5s se soient écoulées
      return (block && !block.hidden && block.querySelector('.fv2-related-card')) ||
             window.__fv2RelatedDone;
    },
    { timeout: 10000 }
  ).catch(() => {
    // Timeout = pas de related → ok
  });
}

// ═════════════════════════════════════════════════════════
// 0.6 — Page Fiche : chargement et structure de base
// ═════════════════════════════════════════════════════════
test.describe('0.6 — Fiche : chargement et structure', () => {

  test('0.6.1 — La page fiche se charge sans erreur console critique', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const critical = errors.filter(e =>
      !e.includes('WebGL') && !e.includes('maplibregl') && !e.includes('Failed to initialize WebGL')
    );
    expect(critical).toHaveLength(0);
  });

  test('0.6.2 — Le shell #fv2 est rendu', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2')).toBeVisible();
  });

  test('0.6.3 — La topbar est présente', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-topbar')).toBeVisible();
  });

  test('0.6.4 — Le hero est visible avec le titre du projet', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const hero = page.locator('#fv2-hero');
    await expect(hero).toBeVisible();
    const title = hero.locator('.fv2-hero__title');
    await expect(title).toBeVisible();
    const text = await title.textContent();
    expect(text.length).toBeGreaterThan(0);
  });

  test('0.6.5 — Le hero affiche un badge catégorie', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const badge = page.locator('.fv2-hero__badge');
    await expect(badge).toBeVisible();
    const text = await badge.textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('0.6.6 — Le body (main + aside) est visible', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-body')).toBeVisible();
    await expect(page.locator('#fv2-main')).toBeVisible();
    await expect(page.locator('#fv2-aside')).toBeVisible();
  });

  test('0.6.7 — La carte MapLibre est insérée dans le hero', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const map = page.locator('#fv2-map');
    await expect(map).toBeVisible();
    // MapLibre ajoute un canvas dans le conteneur
    const canvas = map.locator('canvas');
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });
});

// ═════════════════════════════════════════════════════════
// 0.7 — Fiche : SEO et méta-données
// ═════════════════════════════════════════════════════════
test.describe('0.7 — Fiche : SEO et méta-données', () => {

  test('0.7.1 — Le titre de la page contient le nom du projet', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const title = await page.title();
    expect(title).toContain(VALID_PROJECT);
  });

  test('0.7.2 — La meta description est renseignée', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const desc = await page.getAttribute('meta[name="description"]', 'content');
    expect(desc).toBeTruthy();
    expect(desc.length).toBeGreaterThan(10);
  });

  test('0.7.3 — OG title contient le nom du projet', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
    expect(ogTitle).toContain(VALID_PROJECT);
  });

  test('0.7.4 — OG image est définie', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const ogImage = await page.getAttribute('meta[property="og:image"]', 'content');
    expect(ogImage).toBeTruthy();
    expect(ogImage).toMatch(/^https?:\/\//);
  });

  test('0.7.5 — OG url contient le canonical avec cat et project', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const ogUrl = await page.getAttribute('meta[property="og:url"]', 'content');
    expect(ogUrl).toContain('/fiche/');
    expect(ogUrl).toContain(`cat=${encodeURIComponent(VALID_CAT)}`);
    expect(ogUrl).toContain(`project=${encodeURIComponent(VALID_PROJECT)}`);
  });

  test('0.7.6 — Twitter card est summary_large_image', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const card = await page.getAttribute('meta[name="twitter:card"]', 'content');
    expect(card).toBe('summary_large_image');
  });

  test('0.7.7 — Twitter title contient le nom du projet', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const twTitle = await page.getAttribute('meta[name="twitter:title"]', 'content');
    expect(twTitle).toContain(VALID_PROJECT);
  });

  test('0.7.8 — Canonical URL est bien définie et pointe vers openprojets.com', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const canonical = await page.getAttribute('link[rel="canonical"]', 'href');
    expect(canonical).toContain('openprojets.com/fiche/');
    expect(canonical).toContain(`project=${encodeURIComponent(VALID_PROJECT)}`);
  });

  test('0.7.9 — JSON-LD Article est présent et valide', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const jsonLd = await page.evaluate(() => {
      const el = document.getElementById('fiche-jsonld');
      if (!el) return null;
      try { return JSON.parse(el.textContent); } catch { return null; }
    });
    expect(jsonLd).toBeTruthy();
    expect(jsonLd['@type']).toBe('Article');
    expect(jsonLd.headline).toBe(VALID_PROJECT);
    expect(jsonLd.url).toContain('/fiche/');
    expect(jsonLd.publisher).toBeTruthy();
    expect(jsonLd.publisher['@type']).toBe('Organization');
  });

  test('0.7.10 — Alternate hreflang=fr est défini', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const alt = await page.getAttribute('link[rel="alternate"][hreflang="fr"]', 'href');
    expect(alt).toContain('/fiche/');
  });

  test('0.7.11 — OG description est renseignée côté client', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const ogDesc = await page.getAttribute('meta[property="og:description"]', 'content');
    expect(ogDesc).toBeTruthy();
    expect(ogDesc.length).toBeGreaterThan(5);
  });

  test('0.7.12 — Twitter description est renseignée côté client', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const twDesc = await page.getAttribute('meta[name="twitter:description"]', 'content');
    expect(twDesc).toBeTruthy();
    expect(twDesc.length).toBeGreaterThan(5);
  });

  test('0.7.13 — La meta theme-color est présente', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const tc = await page.getAttribute('meta[name="theme-color"]', 'content');
    expect(tc).toBeTruthy();
    expect(tc).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('0.7.14 — OG type est article', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const ogType = await page.getAttribute('meta[property="og:type"]', 'content');
    expect(ogType).toBe('article');
  });

  test('0.7.15 — OG locale est fr_FR', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const locale = await page.getAttribute('meta[property="og:locale"]', 'content');
    expect(locale).toBe('fr_FR');
  });
});

// ═════════════════════════════════════════════════════════
// 0.8 — Fiche : SSR (pré-rendu serveur)
// ═════════════════════════════════════════════════════════
test.describe('0.8 — Fiche : SSR', () => {

  test('0.8.1 — Le bloc SSR est injecté par l\'edge function (contient <h1>)', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    // On fait un fetch brut HTTP pour obtenir le HTML servi avant JS
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    expect(html).toContain('id="fv2-ssr-content"');
    expect(html).toContain('itemprop="headline"');
    expect(html).toContain(VALID_PROJECT);
  });

  test('0.8.2 — Le SSR contient le fil d\'Ariane (breadcrumb)', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    expect(html).toContain('fv2-ssr__breadcrumb');
    expect(html).toContain('Fil d\'Ariane');
  });

  test('0.8.3 — Le SSR contient un JSON-LD BreadcrumbList', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test('0.8.4 — Après hydratation JS, le SSR est masqué (.is-hydrated)', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const ssrBlock = page.locator('#fv2-ssr-content');
    // Le SSR block doit exister et avoir la classe is-hydrated
    if (await ssrBlock.count() > 0) {
      await expect(ssrBlock).toHaveClass(/is-hydrated/);
    }
  });

  test('0.8.5 — Le SSR injecte les meta OG côté serveur', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    // OG title doit contenir le nom du projet dans le HTML brut (avant JS)
    const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]*)"/);
    expect(ogTitleMatch).toBeTruthy();
    expect(ogTitleMatch[1]).toContain(VALID_PROJECT);
  });

  test('0.8.6 — Le SSR injecte la canonical URL côté serveur', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    const canonicalMatch = html.match(/rel="canonical"\s+href="([^"]*)"/);
    expect(canonicalMatch).toBeTruthy();
    expect(canonicalMatch[1]).toContain('openprojets.com/fiche/');
    expect(canonicalMatch[1]).toContain(`project=${encodeURIComponent(VALID_PROJECT)}`);
  });

  test('0.8.7 — Le SSR injecte le <title> dynamique', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    expect(titleMatch).toBeTruthy();
    expect(titleMatch[1]).toContain(VALID_PROJECT);
  });

  test('0.8.8 — Sans paramètre project, pas de SSR injecté', async ({ page }) => {
    const response = await page.request.get('/fiche/');
    const html = await response.text();
    // Pas de bloc SSR quand il n'y a pas de projet
    expect(html).not.toContain('id="fv2-ssr-content"');
  });

  test('0.8.9 — Le SSR contient itemprop="description"', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    expect(html).toContain('itemprop="description"');
  });

  test('0.8.10 — Le SSR contient les projets similaires en maillage interne', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    // Le SSR doit contenir « Projets similaires » si des projets existent dans la même catégorie
    if (html.includes('Projets similaires')) {
      // Vérifier que les liens related pointent vers /fiche/
      expect(html).toMatch(/href="\/fiche\/\?cat=/);
    }
  });

  test('0.8.11 — Le SSR contient la cover image si disponible', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    // Si le SSR contient une image itemprop="image", elle doit avoir un src
    const imgMatch = html.match(/itemprop="image"\s+src="([^"]*)"/);
    if (imgMatch) {
      expect(imgMatch[1]).toMatch(/^https?:\/\//);
    }
  });

  test('0.8.12 — Le SSR contient le lien officiel si official_url existe', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    // Si le SSR contient "Site officiel", le lien doit être présent
    if (html.includes('Site officiel')) {
      expect(html).toMatch(/rel="noopener noreferrer"/);
    }
  });
});

// ═════════════════════════════════════════════════════════
// 0.9 — Fiche : états d'erreur
// ═════════════════════════════════════════════════════════
test.describe('0.9 — Fiche : états d\'erreur', () => {

  test('0.9.1 — Sans paramètre project → erreur "Projet introuvable"', async ({ page }) => {
    await page.goto('/fiche/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => { const e = document.getElementById('fv2-error'); return e && !e.hidden; },
      { timeout: 15000 }
    );
    const error = page.locator('#fv2-error');
    await expect(error).toBeVisible();
    const title = page.locator('#fv2-error-title');
    await expect(title).toContainText('introuvable');
  });

  test('0.9.2 — Sans paramètre project → hero et body masqués', async ({ page }) => {
    await page.goto('/fiche/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => { const e = document.getElementById('fv2-error'); return e && !e.hidden; },
      { timeout: 15000 }
    );
    // Le hero et body doivent être cachés
    const heroHidden = await page.evaluate(() => document.getElementById('fv2-hero')?.hidden);
    const bodyHidden = await page.evaluate(() => document.getElementById('fv2-body')?.hidden);
    expect(heroHidden).toBe(true);
    expect(bodyHidden).toBe(true);
  });

  test('0.9.3 — Projet inexistant → erreur affichée', async ({ page }) => {
    await page.goto('/fiche/?cat=velo&project=projet-qui-nexiste-pas-xyz-999', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => { const e = document.getElementById('fv2-error'); return e && !e.hidden; },
      { timeout: 15000 }
    );
    const error = page.locator('#fv2-error');
    await expect(error).toBeVisible();
    await expect(page.locator('#fv2-error-title')).toContainText('introuvable');
    await expect(page.locator('#fv2-error-msg')).toContainText('projet-qui-nexiste-pas-xyz-999');
  });

  test('0.9.4 — Erreur affiche le bouton retour à la carte', async ({ page }) => {
    await page.goto('/fiche/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => { const e = document.getElementById('fv2-error'); return e && !e.hidden; },
      { timeout: 15000 }
    );
    const btn = page.locator('#fv2-btn-back-error');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Retour');
    const href = await btn.getAttribute('href');
    expect(href).toBeTruthy();
  });

  test('0.9.5 — Catégorie invalide avec projet inexistant → erreur', async ({ page }) => {
    await page.goto('/fiche/?cat=categorie-bizarre&project=rien', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => { const e = document.getElementById('fv2-error'); return e && !e.hidden; },
      { timeout: 15000 }
    );
    await expect(page.locator('#fv2-error')).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════
// 0.10 — Fiche : bouton retour contextuel
// ═════════════════════════════════════════════════════════
test.describe('0.10 — Fiche : bouton retour contextuel', () => {

  test('0.10.1 — Le bouton retour est visible dans la topbar', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const btn = page.locator('#fv2-btn-back');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Retour');
  });

  test('0.10.2 — Le bouton retour conserve la ville dans le href', async ({ page }) => {
    test.skip(!VALID_PROJECT || !VALID_CITY, 'Projet ou ville non disponible');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const href = await page.locator('#fv2-btn-back').getAttribute('href');
    expect(href).toContain(`city=${VALID_CITY}`);
  });

  test('0.10.3 — Le bouton retour conserve la catégorie si non default', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    // Si la catégorie n'est pas "velo" (default), elle doit apparaître dans le href
    if (VALID_CAT !== 'velo') {
      await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
      const href = await page.locator('#fv2-btn-back').getAttribute('href');
      expect(href).toContain(`cat=${VALID_CAT}`);
    } else {
      // Si c'est velo (default), cat ne doit PAS être dans le href
      await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
      const href = await page.locator('#fv2-btn-back').getAttribute('href');
      expect(href).not.toContain('cat=velo');
    }
  });

  test('0.10.4 — Sans ville ni catégorie → href contient project slug uniquement', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    // On force cat=velo (default) et pas de city
    await waitForFicheBoot(page, `/fiche/?cat=velo&project=${encodeURIComponent(VALID_PROJECT)}`);
    const href = await page.locator('#fv2-btn-back').getAttribute('href');
    // buildBackUrl inclut toujours project= dans le href, pas de city ni cat (velo = default)
    expect(href).toContain('project=');
    expect(href).not.toContain('city=');
    expect(href).not.toContain('cat=');
  });

  test('0.10.5 — Le bouton retour erreur a le même href contextuel', async ({ page }) => {
    const url = '/fiche/?cat=urbanisme&city=test-ville';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => { const e = document.getElementById('fv2-error'); return e && !e.hidden; },
      { timeout: 15000 }
    );
    const href = await page.locator('#fv2-btn-back-error').getAttribute('href');
    expect(href).toContain('city=test-ville');
    expect(href).toContain('cat=urbanisme');
  });
});

// ═════════════════════════════════════════════════════════
// 0.11 — Fiche : thème sombre / clair
// ═════════════════════════════════════════════════════════
test.describe('0.11 — Fiche : thème', () => {

  test('0.11.1 — Le bouton thème est visible', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-btn-theme')).toBeVisible();
  });

  test('0.11.2 — Clic thème change data-theme sur <html>', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = page.locator('html');
    const initial = await html.getAttribute('data-theme');
    await page.locator('#fv2-btn-theme').click();
    const after = await html.getAttribute('data-theme');
    expect(after).not.toBe(initial);
    expect(['dark', 'light']).toContain(after);
  });

  test('0.11.3 — L\'icône du bouton thème bascule (moon ↔ sun)', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const btn = page.locator('#fv2-btn-theme');
    const icon = btn.locator('i');
    const before = await icon.getAttribute('class');
    await btn.click();
    const after = await icon.getAttribute('class');
    expect(after).not.toBe(before);
    const toggled = (before.includes('moon') && after.includes('sun')) ||
                    (before.includes('sun') && after.includes('moon'));
    expect(toggled).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════
// 0.12 — Fiche : bouton partage (copie URL)
// ═════════════════════════════════════════════════════════
test.describe('0.12 — Fiche : partage', () => {

  test('0.12.1 — Le bouton partage est visible', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-btn-share')).toBeVisible();
  });

  test('0.12.2 — Clic partage ajoute la classe is-copied et l\'icône check', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));

    // Grant clipboard permission for the test
    await page.context().grantPermissions(['clipboard-write', 'clipboard-read']);

    const btn = page.locator('#fv2-btn-share');
    await btn.click();
    // L'icône doit passer sur check
    await expect(btn.locator('i')).toHaveClass(/fa-check/, { timeout: 2000 });
    await expect(btn).toHaveClass(/is-copied/);
  });

  test('0.12.3 — Après 2s, l\'icône revient à fa-link', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await page.context().grantPermissions(['clipboard-write', 'clipboard-read']);

    const btn = page.locator('#fv2-btn-share');
    await btn.click();
    await expect(btn.locator('i')).toHaveClass(/fa-check/);
    // Attendre que l'icône revienne à link
    await expect(btn.locator('i')).toHaveClass(/fa-link/, { timeout: 4000 });
    await expect(btn).not.toHaveClass(/is-copied/);
  });
});

// ═════════════════════════════════════════════════════════
// 0.13 — Fiche : contenu principal (description, cover, prose)
// ═════════════════════════════════════════════════════════
test.describe('0.13 — Fiche : contenu principal', () => {

  test('0.13.1 — Le bloc description est affiché ou masqué correctement', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Attendre que l'init async (branding + DataModule) soit terminé et que
    // renderDescription ait été appelé (il tourne après loadBranding)
    await page.waitForFunction(
      () => {
        const desc = document.getElementById('fv2-desc-block');
        if (!desc) return true;
        // Soit masqué (markdown ou pas de desc), soit contient un <p>
        return desc.hidden || desc.querySelector('.fv2-desc') !== null;
      },
      { timeout: 10000 }
    );
    const descBlock = page.locator('#fv2-desc-block');
    const isHidden = await descBlock.evaluate(el => el.hidden);
    if (!isHidden) {
      // Si visible, doit contenir le paragraphe de description
      await expect(descBlock.locator('.fv2-desc')).toBeVisible();
    }
    // Si masqué, c'est que le markdown prend le relais → ok
  });

  test('0.13.2 — La photo de couverture est affichée si disponible', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (!isHidden) {
      const img = page.locator('#fv2-cover-img');
      const src = await img.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).toMatch(/^https?:\/\//);
    }
  });

  test('0.13.3 — Le bouton expand cover est présent si cover affichée', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (!isHidden) {
      await expect(page.locator('#fv2-btn-cover-expand')).toBeVisible();
    }
  });

  test('0.13.4 — Le bloc prose est affiché si markdown disponible', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Wait a bit for markdown to load asynchronously
    await page.waitForTimeout(3000);
    const proseBlock = page.locator('#fv2-prose-block');
    const isHidden = await proseBlock.evaluate(el => el.hidden);
    if (!isHidden) {
      const prose = page.locator('#fv2-prose');
      const html = await prose.innerHTML();
      expect(html.trim().length).toBeGreaterThan(0);
    }
  });

  test('0.13.5 — Le topbar title contient le nom du projet', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const topTitle = page.locator('#fv2-topbar-title');
    const text = await topTitle.textContent();
    expect(text).toBe(VALID_PROJECT);
  });

  test('0.13.6 — La cover image a un alt = nom du projet', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (!isHidden) {
      const alt = await page.locator('#fv2-cover-img').getAttribute('alt');
      expect(alt).toBe(VALID_PROJECT);
    }
  });
});

// ═════════════════════════════════════════════════════════
// 0.14 — Fiche : sidebar (aside)
// ═════════════════════════════════════════════════════════
test.describe('0.14 — Fiche : sidebar', () => {

  test('0.14.1 — Le brand card est affiché si branding ville existe', async ({ page }) => {
    test.skip(!VALID_PROJECT || !VALID_CITY, 'Projet ou ville non disponible');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Attendre le branding async
    await page.waitForTimeout(3000);
    const brandCard = page.locator('#fv2-brand-card');
    const isHidden = await brandCard.evaluate(el => el.hidden);
    if (!isHidden) {
      const logo = page.locator('#fv2-city-logo');
      const src = await logo.getAttribute('src');
      expect(src).toBeTruthy();
      const name = page.locator('#fv2-city-name');
      const text = await name.textContent();
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('0.14.2 — Le link card est affiché si official_url existe', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const linkCard = page.locator('#fv2-link-card');
    const isHidden = await linkCard.evaluate(el => el.hidden);
    if (!isHidden) {
      const href = await linkCard.getAttribute('href');
      expect(href).toMatch(/^https?:\/\//);
      expect(href).not.toBe('#');
      await expect(linkCard).toHaveAttribute('target', '_blank');
      await expect(linkCard).toHaveAttribute('rel', /noopener/);
      // Domain affiché
      const domain = page.locator('#fv2-link-domain');
      const text = await domain.textContent();
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('0.14.3 — Le docs card est affiché si documents existent', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const docsCard = page.locator('#fv2-docs-card');
    const isHidden = await docsCard.evaluate(el => el.hidden);
    if (!isHidden) {
      // Doit contenir au moins un doc
      const docs = page.locator('#fv2-docs .fv2-doc');
      const count = await docs.count();
      expect(count).toBeGreaterThan(0);
      // Chaque doc a un titre et des boutons
      const firstDoc = docs.first();
      await expect(firstDoc.locator('.fv2-doc__title')).toBeVisible();
      await expect(firstDoc.locator('.fv2-doc__btn')).toHaveCount(2); // view + download
    }
  });

  test('0.14.4 — Le topbar logo s\'affiche après chargement du branding', async ({ page }) => {
    test.skip(!VALID_PROJECT || !VALID_CITY, 'Projet ou ville non disponible');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Attendre le branding
    await page.waitForFunction(
      () => {
        const logo = document.getElementById('fv2-topbar-logo');
        return logo && (logo.classList.contains('has-logo') || logo.hidden);
      },
      { timeout: 10000 }
    );
    const topLogo = page.locator('#fv2-topbar-logo');
    const hasLogo = await topLogo.evaluate(el => el.classList.contains('has-logo'));
    if (hasLogo) {
      await expect(topLogo).not.toHaveAttribute('hidden');
      const src = await page.locator('#fv2-topbar-logo-img').getAttribute('src');
      expect(src).toBeTruthy();
    }
  });

  test('0.14.5 — Le lien officiel a un favicon Google', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const linkCard = page.locator('#fv2-link-card');
    const isHidden = await linkCard.evaluate(el => el.hidden);
    if (!isHidden) {
      const src = await page.locator('#fv2-link-favicon').getAttribute('src');
      expect(src).toContain('google.com/s2/favicons');
    }
  });
});

// ═════════════════════════════════════════════════════════
// 0.15 — Fiche : lightbox
// ═════════════════════════════════════════════════════════
test.describe('0.15 — Fiche : lightbox', () => {

  test('0.15.1 — Lightbox est fermée par défaut', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const lb = page.locator('#fv2-lightbox');
    await expect(lb).toHaveAttribute('aria-hidden', 'true');
    await expect(lb).not.toHaveClass(/is-open/);
  });

  test('0.15.2 — Clic sur la cover ouvre la lightbox', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de cover image pour ce projet');
      return;
    }
    await page.locator('#fv2-btn-cover-expand').click();
    const lb = page.locator('#fv2-lightbox');
    await expect(lb).toHaveClass(/is-open/, { timeout: 2000 });
    await expect(lb).toHaveAttribute('aria-hidden', 'false');
    // L'image de la lightbox doit être renseignée
    const src = await page.locator('#fv2-lb-img').getAttribute('src');
    expect(src).toBeTruthy();
  });

  test('0.15.3 — Clic sur le bouton ferme la lightbox', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de cover image pour ce projet');
      return;
    }
    // Ouvrir
    await page.locator('#fv2-btn-cover-expand').click();
    await expect(page.locator('#fv2-lightbox')).toHaveClass(/is-open/);
    // Fermer via bouton close
    await page.locator('.fv2-lightbox__close').click();
    await expect(page.locator('#fv2-lightbox')).not.toHaveClass(/is-open/, { timeout: 2000 });
  });

  test('0.15.4 — Escape ferme la lightbox', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de cover image pour ce projet');
      return;
    }
    await page.locator('#fv2-btn-cover-expand').click();
    await expect(page.locator('#fv2-lightbox')).toHaveClass(/is-open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#fv2-lightbox')).not.toHaveClass(/is-open/, { timeout: 2000 });
  });

  test('0.15.5 — Ouvrir la lightbox bloque le scroll body', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de cover image pour ce projet');
      return;
    }
    // Ouvrir la lightbox
    await page.locator('#fv2-btn-cover-expand').click();
    await expect(page.locator('#fv2-lightbox')).toHaveClass(/is-open/);
    // Le body doit avoir overflow: hidden
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
    // Fermer → overflow doit revenir à vide
    await page.locator('.fv2-lightbox__close').click();
    await expect(page.locator('#fv2-lightbox')).not.toHaveClass(/is-open/, { timeout: 2000 });
    const overflowAfter = await page.evaluate(() => document.body.style.overflow);
    expect(overflowAfter).toBe('');
  });

  test('0.15.6 — Clic sur le fond de la lightbox (hors image) la ferme', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const coverBlock = page.locator('#fv2-cover-block');
    const isHidden = await coverBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de cover image pour ce projet');
      return;
    }
    await page.locator('#fv2-btn-cover-expand').click();
    await expect(page.locator('#fv2-lightbox')).toHaveClass(/is-open/);
    // Clic dans le coin supérieur gauche de la lightbox (pas sur l'image)
    const lb = page.locator('#fv2-lightbox');
    const box = await lb.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 5, box.y + 5);
    }
    await expect(page.locator('#fv2-lightbox')).not.toHaveClass(/is-open/, { timeout: 2000 });
  });
});

// ═════════════════════════════════════════════════════════
// 0.16 — Fiche : overlay PDF
// ═════════════════════════════════════════════════════════
test.describe('0.16 — Fiche : overlay PDF', () => {

  test('0.16.1 — L\'overlay PDF est fermé par défaut', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const ov = page.locator('#fv2-ov-pdf');
    await expect(ov).toHaveAttribute('aria-hidden', 'true');
    await expect(ov).not.toHaveClass(/is-open/);
  });

  test('0.16.2 — Clic sur l\'icône view d\'un doc ouvre l\'overlay PDF', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const docsCard = page.locator('#fv2-docs-card');
    const isHidden = await docsCard.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de documents pour ce projet');
      return;
    }
    // Clic sur le premier bouton view (icône œil)
    const viewBtn = page.locator('#fv2-docs .fv2-doc__btn').first();
    await viewBtn.click();
    const ov = page.locator('#fv2-ov-pdf');
    await expect(ov).toHaveClass(/is-open/, { timeout: 2000 });
    await expect(ov).toHaveAttribute('aria-hidden', 'false');
    // Le titre du PDF est renseigné
    const title = await page.locator('#fv2-pdf-title').textContent();
    expect(title.trim().length).toBeGreaterThan(0);
    // L'iframe a une src
    const src = await page.locator('#fv2-pdf-frame').getAttribute('src');
    expect(src).toBeTruthy();
  });

  test('0.16.3 — Bouton fermer de l\'overlay PDF le ferme', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const docsCard = page.locator('#fv2-docs-card');
    const isHidden = await docsCard.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de documents pour ce projet');
      return;
    }
    // Ouvrir
    await page.locator('#fv2-docs .fv2-doc__btn').first().click();
    await expect(page.locator('#fv2-ov-pdf')).toHaveClass(/is-open/);
    // Fermer
    await page.locator('#fv2-ov-pdf [data-close]').click();
    await expect(page.locator('#fv2-ov-pdf')).not.toHaveClass(/is-open/, { timeout: 2000 });
  });
});

// ═════════════════════════════════════════════════════════
// 0.17 — Fiche : projets similaires (related)
// ═════════════════════════════════════════════════════════
test.describe('0.17 — Fiche : projets similaires', () => {

  test('0.17.1 — Le bloc related est affiché si des projets similaires existent', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await waitForRelated(page);
    const relatedBlock = page.locator('#fv2-related-block');
    const isHidden = await relatedBlock.evaluate(el => el.hidden);
    if (!isHidden) {
      const cards = page.locator('#fv2-related .fv2-related-card');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  test('0.17.2 — Les cards related ont un lien vers /fiche/', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await waitForRelated(page);
    const relatedBlock = page.locator('#fv2-related-block');
    const isHidden = await relatedBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de projets similaires');
      return;
    }
    const firstCard = page.locator('#fv2-related .fv2-related-card').first();
    const href = await firstCard.getAttribute('href');
    expect(href).toContain('/fiche/');
    expect(href).toContain('cat=');
    expect(href).toContain('project=');
  });

  test('0.17.3 — Les cards related contiennent le nom du projet', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await waitForRelated(page);
    const relatedBlock = page.locator('#fv2-related-block');
    const isHidden = await relatedBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de projets similaires');
      return;
    }
    const firstName = page.locator('#fv2-related .fv2-related-card__name').first();
    const text = await firstName.textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('0.17.4 — Les cards related conservent la ville dans le href', async ({ page }) => {
    test.skip(!VALID_PROJECT || !VALID_CITY, 'Projet ou ville non disponible');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await waitForRelated(page);
    const relatedBlock = page.locator('#fv2-related-block');
    const isHidden = await relatedBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de projets similaires');
      return;
    }
    const firstCard = page.locator('#fv2-related .fv2-related-card').first();
    const href = await firstCard.getAttribute('href');
    expect(href).toContain(`city=`);
  });

  test('0.17.5 — Les cards related n\'incluent pas le projet actuel', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await waitForRelated(page);
    const relatedBlock = page.locator('#fv2-related-block');
    const isHidden = await relatedBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de projets similaires');
      return;
    }
    const names = await page.locator('#fv2-related .fv2-related-card__name').allTextContents();
    for (const name of names) {
      expect(name.trim()).not.toBe(VALID_PROJECT);
    }
  });
});

// ═════════════════════════════════════════════════════════
// 0.18 — Fiche : topbar scroll
// ═════════════════════════════════════════════════════════
test.describe('0.18 — Fiche : topbar scroll', () => {

  test('0.18.1 — La topbar n\'a pas la classe is-scrolled au chargement', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-topbar')).not.toHaveClass(/is-scrolled/);
  });

  test('0.18.2 — Après scroll la topbar a la classe is-scrolled', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Scroller au-delà de la hauteur du héro
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500); // attendre le RAF
    await expect(page.locator('#fv2-topbar')).toHaveClass(/is-scrolled/, { timeout: 3000 });
  });
});

// ═════════════════════════════════════════════════════════
// 0.19 — Fiche : gestion des paramètres URL
// ═════════════════════════════════════════════════════════
test.describe('0.19 — Fiche : paramètres URL', () => {

  test('0.19.1 — cat absent → catégorie par défaut "velo" utilisée', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    // Charger sans cat mais avec le cat réel du projet (sinon le fetch échoue si le projet n'est pas dans la catégorie velo)
    await page.goto(`/fiche/?project=${encodeURIComponent(VALID_PROJECT)}&city=${VALID_CITY}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const hero = document.getElementById('fv2-hero');
        const error = document.getElementById('fv2-error');
        return (hero && hero.querySelector('.fv2-hero__title')) ||
               (error && !error.hidden);
      },
      { timeout: 20000 }
    );
    // Le résultat dépend de la catégorie réelle du projet :
    // - si le projet est en catégorie "velo" → la fiche charge normalement
    // - sinon → le fetch échoue car cat par défaut = velo ≠ cat réelle → erreur affichée
    const errorShown = await page.evaluate(() => !document.getElementById('fv2-error')?.hidden);
    if (!errorShown) {
      const badge = page.locator('.fv2-hero__badge');
      const text = await badge.textContent();
      expect(text.trim().length).toBeGreaterThan(0);
    }
    // Dans les deux cas, la page ne doit pas crasher
  });

  test('0.19.2 — city est optionnel et la page charge sans', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    // Charger sans city
    await waitForFicheBoot(page, `/fiche/?cat=${VALID_CAT}&project=${encodeURIComponent(VALID_PROJECT)}`);
    // La page doit se charger normalement
    await expect(page.locator('.fv2-hero__title')).toBeVisible();
  });

  test('0.19.3 — Caractères spéciaux dans project sont gérés', async ({ page }) => {
    // Un projet avec caractères encodés
    await page.goto('/fiche/?cat=velo&project=projet%20avec%20espaces', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const hero = document.getElementById('fv2-hero');
        const error = document.getElementById('fv2-error');
        return (hero && hero.querySelector('.fv2-hero__title')) ||
               (error && !error.hidden);
      },
      { timeout: 15000 }
    );
    // Pas de crash, la page affiche soit le projet soit l'erreur
    const errVisible = await page.evaluate(() => !document.getElementById('fv2-error')?.hidden);
    const heroTitle = await page.locator('.fv2-hero__title').count();
    expect(errVisible || heroTitle > 0).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════
// 0.20 — Fiche : accessibilité
// ═════════════════════════════════════════════════════════
test.describe('0.20 — Fiche : accessibilité', () => {

  test('0.20.1 — Le bouton retour a un aria-label', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-btn-back')).toHaveAttribute('aria-label', 'Retour à la carte');
  });

  test('0.20.2 — Le bouton thème a un aria-label', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-btn-theme')).toHaveAttribute('aria-label', 'Changer le thème');
  });

  test('0.20.3 — Le bouton partage a un aria-label', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-btn-share')).toHaveAttribute('aria-label', 'Copier le lien');
  });

  test('0.20.4 — La lightbox a aria-hidden=true par défaut', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-lightbox')).toHaveAttribute('aria-hidden', 'true');
  });

  test('0.20.5 — L\'overlay PDF a aria-hidden=true par défaut', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('#fv2-ov-pdf')).toHaveAttribute('aria-hidden', 'true');
  });

  test('0.20.6 — La page a le lang=fr', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('0.20.7 — Le bouton expand cover a un aria-label', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const btn = page.locator('#fv2-btn-cover-expand');
    if (await btn.isVisible()) {
      await expect(btn).toHaveAttribute('aria-label', 'Agrandir la photo');
    }
  });

  test('0.20.8 — Les boutons close des overlays ont aria-label', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const pdfClose = page.locator('#fv2-ov-pdf .fv2-overlay__close');
    await expect(pdfClose).toHaveAttribute('aria-label', 'Fermer');
    const lbClose = page.locator('.fv2-lightbox__close');
    await expect(lbClose).toHaveAttribute('aria-label', 'Fermer');
  });
});

// ═════════════════════════════════════════════════════════
// 0.21 — Fiche : noscript
// ═════════════════════════════════════════════════════════
test.describe('0.21 — Fiche : noscript', () => {

  test('0.21.1 — Le fallback noscript est dans le HTML', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const response = await page.request.get(ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const html = await response.text();
    expect(html).toContain('<noscript>');
    expect(html).toContain('JavaScript requis');
  });
});

// ═════════════════════════════════════════════════════════
// 0.22 — Fiche : navigation vers related
// ═════════════════════════════════════════════════════════
test.describe('0.22 — Fiche : navigation', () => {

  test('0.22.1 — Clic sur un related card navigue vers une autre fiche', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    await waitForRelated(page);
    const relatedBlock = page.locator('#fv2-related-block');
    const isHidden = await relatedBlock.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'Pas de projets similaires');
      return;
    }
    const firstCard = page.locator('#fv2-related .fv2-related-card').first();
    const targetHref = await firstCard.getAttribute('href');
    await firstCard.click();
    await page.waitForURL('**/fiche/**', { timeout: 10000 });
    expect(page.url()).toContain('/fiche/');
    // L'URL doit contenir un paramètre project différent
    const url = new URL(page.url());
    const newProject = url.searchParams.get('project');
    expect(newProject).toBeTruthy();
    expect(newProject).not.toBe(VALID_PROJECT);
  });

  test('0.22.2 — Le bouton retour a un href valide vers la carte', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const btn = page.locator('#fv2-btn-back');
    const href = await btn.getAttribute('href');
    // Vérifier que le href ne pointe pas vers /fiche/ (il ramène à la carte)
    expect(href).toBeTruthy();
    expect(href).not.toContain('/fiche/');
    expect(href).toMatch(/^\//);
  });
});

// ═════════════════════════════════════════════════════════
// 0.23 — Fiche : sécurité
// ═════════════════════════════════════════════════════════
test.describe('0.23 — Fiche : sécurité', () => {

  test('0.23.1 — Le link card a rel=noopener noreferrer', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const linkCard = page.locator('#fv2-link-card');
    const isHidden = await linkCard.evaluate(el => el.hidden);
    if (!isHidden) {
      const rel = await linkCard.getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });

  test('0.23.2 — Le contenu du titre est échappé (pas de HTML brut)', async ({ page }) => {
    // Tenter un nom de projet avec injection
    await page.goto('/fiche/?cat=velo&project=<script>alert(1)</script>', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const hero = document.getElementById('fv2-hero');
        const error = document.getElementById('fv2-error');
        return (hero && hero.querySelector('.fv2-hero__title')) ||
               (error && !error.hidden);
      },
      { timeout: 15000 }
    );
    // Vérifier qu'il n'y a pas de script injecté dans le DOM
    const hasScript = await page.evaluate(() => {
      return document.querySelectorAll('script[src*="alert"]').length > 0 ||
             document.body.innerHTML.includes('<script>alert');
    });
    expect(hasScript).toBe(false);
  });

  test('0.23.3 — Les documents ont target=_blank avec noopener', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const docsCard = page.locator('#fv2-docs-card');
    const isHidden = await docsCard.evaluate(el => el.hidden);
    if (!isHidden) {
      const dlLinks = page.locator('#fv2-docs a[target="_blank"]');
      const count = await dlLinks.count();
      for (let i = 0; i < count; i++) {
        const rel = await dlLinks.nth(i).getAttribute('rel');
        expect(rel).toContain('noopener');
      }
    }
  });
});

// ═════════════════════════════════════════════════════════
// 0.24 — Fiche : hydratation client (régression)
//
// Ces tests ciblent spécifiquement le cas où le SSR injecte
// du contenu mais où l'hydratation JS échoue silencieusement
// (ex : exception non capturée dans `fetchProjectByCategoryAndName`).
// Sans ces tests, le bug est invisible car les assertions des
// autres blocs sont gardées par `if (!isHidden)` qui passe dès
// que le bloc n'a pas été révélé par le code client.
// ═════════════════════════════════════════════════════════
test.describe('0.24 — Fiche : hydratation client (régression)', () => {

  test('0.24.1 — Aucune exception console lors de l\'init (fetch projet)', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    const consoleErrors = [];
    page.on('console', m => {
      if (m.type() === 'error' || m.type() === 'debug') {
        const t = m.text();
        // On cible spécifiquement les exceptions du service Supabase
        if (t.includes('supabaseService') && t.includes('exception')) {
          consoleErrors.push(t);
        }
      }
    });
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // L'init appelle fetchProjectByCategoryAndName et getConsultationDossiersByProject
    await page.waitForTimeout(2000);
    expect(consoleErrors, `Exceptions rencontrées : ${consoleErrors.join(' | ')}`).toHaveLength(0);
  });

  test('0.24.2 — Le SSR est masqué (is-hydrated) après boot réussi', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Attendre que le flag d'hydratation soit posé
    await page.waitForFunction(
      () => document.getElementById('fv2-ssr-content')?.classList.contains('is-hydrated'),
      { timeout: 10000 }
    );
    const hydrated = await page.evaluate(() =>
      document.getElementById('fv2-ssr-content')?.classList.contains('is-hydrated')
    );
    expect(hydrated).toBe(true);
  });

  test('0.24.3 — Le hero client (non-SSR) est rendu avec titre non vide', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    const title = page.locator('#fv2-hero .fv2-hero__title');
    await expect(title).toBeVisible();
    const text = (await title.textContent() || '').trim();
    expect(text.length).toBeGreaterThan(0);
    // Le titre rendu doit correspondre au project_name
    expect(text).toBe(VALID_PROJECT);
  });

  test('0.24.4 — fetchProjectByCategoryAndName retourne un objet (pas de throw)', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await page.goto('/fiche/?cat=' + encodeURIComponent(VALID_CAT) + '&project=' + encodeURIComponent(VALID_PROJECT), { waitUntil: 'domcontentloaded' });
    // Attendre que supabaseService soit dispo
    await page.waitForFunction(() => !!window.supabaseService?.fetchProjectByCategoryAndName, { timeout: 10000 });
    const result = await page.evaluate(async ([cat, proj]) => {
      try {
        const r = await window.supabaseService.fetchProjectByCategoryAndName(cat, proj);
        return { ok: true, hasData: !!r, projectName: r?.project_name || null };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, [VALID_CAT, VALID_PROJECT]);
    expect(result.ok, `Exception: ${result.error}`).toBe(true);
    expect(result.hasData).toBe(true);
    expect(result.projectName).toBe(VALID_PROJECT);
  });

  test('0.24.5 — Les blocs principaux sont révélés (non-hidden) après hydratation', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Attente du pipeline complet (branding + docs + markdown)
    await page.waitForTimeout(5000);

    const state = await page.evaluate(() => {
      const get = id => document.getElementById(id);
      return {
        heroTitle: get('fv2-hero')?.querySelector('.fv2-hero__title')?.textContent?.trim() || '',
        // Au moins un des trois blocs de contenu (desc | cover | prose) doit être visible
        descVisible: !get('fv2-desc-block')?.hidden,
        coverVisible: !get('fv2-cover-block')?.hidden,
        proseVisible: !get('fv2-prose-block')?.hidden,
        // Le map container doit avoir un canvas MapLibre
        mapHasCanvas: !!get('fv2-map')?.querySelector('canvas'),
      };
    });

    expect(state.heroTitle.length, 'hero title is empty').toBeGreaterThan(0);
    expect(
      state.descVisible || state.coverVisible || state.proseVisible,
      `Aucun bloc de contenu visible (desc=${state.descVisible}, cover=${state.coverVisible}, prose=${state.proseVisible})`
    ).toBe(true);
    expect(state.mapHasCanvas, 'La carte MapLibre n\'a pas été initialisée').toBe(true);
  });

  test('0.24.6 — L\'ordre DOM est : hero → main (desc/cover/prose) → related', async ({ page }) => {
    test.skip(!VALID_PROJECT, 'Aucun projet trouvé en base');
    await waitForFicheBoot(page, ficheUrl(VALID_PROJECT, VALID_CAT, VALID_CITY));
    // Vérifie l'ordre DOM source (pas visuel)
    const order = await page.evaluate(() => {
      const ids = ['fv2-hero', 'fv2-desc-block', 'fv2-cover-block', 'fv2-prose-block', 'fv2-related-block'];
      const positions = ids.map(id => {
        const el = document.getElementById(id);
        if (!el) return -1;
        // compareDocumentPosition via index dans un flattened tree
        return Array.from(document.querySelectorAll('*')).indexOf(el);
      });
      return positions;
    });
    // Tous les éléments présents doivent être en ordre croissant (aucun -1 pour hero)
    expect(order[0]).toBeGreaterThan(-1); // hero existe toujours
    let last = order[0];
    for (let i = 1; i < order.length; i++) {
      if (order[i] === -1) continue;
      expect(order[i], `Élément ${i} précède le précédent (ordre cassé)`).toBeGreaterThan(last);
      last = order[i];
    }
  });
});
