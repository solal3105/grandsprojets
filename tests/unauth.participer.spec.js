// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Module Participer (signalements citoyens) - carte publique et endpoints.
 *
 * Ce que ces tests garantissent :
 *  - le module activé pour une ville fait apparaître son bouton et son panneau ;
 *  - le formulaire public porte ses garde-fous (honeypot hors écran, email
 *    obligatoire, mention urgence, lien confidentialité) ;
 *  - les endpoints publics valident leurs entrées et, surtout, ne servent
 *    JAMAIS une donnée personnelle (email, hash d'IP, jetons) - test de fuite.
 *
 * Ville dédiée `test-e2e` : module activé + catégories/statuts seedés.
 * Aucun test ne fait de dépôt valide : un vrai dépôt enverrait un email et
 * créerait une ligne en production.
 *
 * NON testable ici (WebGL/flux email) : le placement du point par clic carte,
 * le parcours complet dépôt → confirmation → modération.
 */

const CITY = 'test-e2e';
const API = '/api/participer';

async function openParticiperPanel(page) {
  await page.goto(`/?city=${CITY}`, { waitUntil: 'domcontentloaded' });
  const btn = page.locator(`.gp-sidebar__btn--module[data-module="participer"]`);
  await expect(btn).toBeVisible({ timeout: 20000 });
  await btn.click();
  await expect(page.locator('.nav-panel__item[data-section="participer-signaler"]')).toBeVisible({ timeout: 15000 });
}

test.describe('16.1 Participer - carte publique', () => {

  test('16.1.1 le bouton du module apparaît dans la barre latérale', async ({ page }) => {
    await page.goto(`/?city=${CITY}`, { waitUntil: 'domcontentloaded' });
    const btn = page.locator(`.gp-sidebar__btn--module[data-module="participer"]`);
    await expect(btn).toBeVisible({ timeout: 20000 });
    await expect(btn).toHaveAttribute('aria-label', 'Participer');
  });

  test('16.1.2 le panneau propose Signaler et Explorer', async ({ page }) => {
    await openParticiperPanel(page);
    await expect(page.locator('.nav-panel__item[data-section="participer-explorer"]')).toBeVisible();
    // Visiteur anonyme : pas d'entrée « Traitement » (réservée à l'équipe)
    await expect(page.locator('.nav-panel__item[data-admin-link]')).toHaveCount(0);
  });

  test('16.1.3 le formulaire porte ses garde-fous', async ({ page }) => {
    await openParticiperPanel(page);
    await page.locator('.nav-panel__item[data-section="participer-signaler"]').click();
    const form = page.locator('.pt-form');
    await expect(form).toBeVisible({ timeout: 15000 });

    // Les 6 catégories seedées, l'email obligatoire, la mention urgence
    await expect(form.locator('.pt-cat')).toHaveCount(6);
    await expect(form.locator('#pt-email')).toHaveAttribute('type', 'email');
    await expect(form.locator('.pt-urgence')).toContainText('112');
    await expect(form.locator('.pt-legal a')).toHaveAttribute('href', '/home/confidentialite');

    // Honeypot : présent dans le DOM mais invisible pour un humain
    const hp = form.locator('.pt-hp');
    await expect(hp).toHaveCount(1);
    await expect(hp).not.toBeInViewport();
  });

  test('16.1.4 envoyer reste désactivé tant que le dépôt est incomplet', async ({ page }) => {
    await openParticiperPanel(page);
    await page.locator('.nav-panel__item[data-section="participer-signaler"]').click();
    const form = page.locator('.pt-form');
    await expect(form).toBeVisible({ timeout: 15000 });

    const submit = form.locator('#pt-submit');
    await expect(submit).toBeDisabled();
    // Email + catégorie ne suffisent pas : il manque le point sur la carte
    await form.locator('#pt-email').fill('habitant@example.org');
    await form.locator('.pt-cat').first().click();
    await expect(submit).toBeDisabled();
  });

  test('16.1.5 la vue Explorer se rend (liste ou état vide)', async ({ page }) => {
    await openParticiperPanel(page);
    await page.locator('.nav-panel__item[data-section="participer-explorer"]').click();
    await expect(page.locator('.pt-explorer, .nav-panel__empty').first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('16.2 Participer - endpoints publics', () => {

  test('16.2.1 config sert l\'activation, les catégories et les statuts', async ({ request }) => {
    const r = await request.get(`${API}/config?ville=${CITY}`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.enabled).toBe(true);
    expect(body.categories.length).toBeGreaterThanOrEqual(1);
    expect(body.statuts).toHaveLength(7);
    // Les réglages exposés sont la whitelist publique, rien d'autre
    expect(body.settings).not.toHaveProperty('notify_email');
    expect(body.settings).not.toHaveProperty('quota_ip_jour');
  });

  test('16.2.2 config refuse une ville invalide', async ({ request }) => {
    const r = await request.get(`${API}/config?ville=<script>`);
    expect(r.status()).toBe(400);
  });

  test('16.2.3 submit refuse un email invalide', async ({ request }) => {
    const r = await request.post(`${API}/submit`, {
      data: { ville: CITY, category_key: 'chantier', lat: 45.7, lng: 4.8, email: 'pas-un-email' },
    });
    expect(r.status()).toBe(400);
  });

  test('16.2.4 submit refuse une catégorie inconnue', async ({ request }) => {
    const r = await request.post(`${API}/submit`, {
      data: { ville: CITY, category_key: 'inexistante', lat: 45.7, lng: 4.8, email: 'habitant@example.org' },
    });
    expect(r.status()).toBe(400);
  });

  test('16.2.5 submit avec honeypot rempli répond ok sans rien créer', async ({ request }) => {
    const r = await request.post(`${API}/submit`, {
      data: {
        ville: CITY, category_key: 'chantier', lat: 45.7, lng: 4.8,
        email: 'robot@example.org', website: 'https://spam.example',
      },
    });
    expect(r.status()).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  test('16.2.6 geojson ne fuit JAMAIS une donnée personnelle', async ({ request }) => {
    const r = await request.get(`${API}/geojson?ville=${CITY}`);
    expect(r.status()).toBe(200);
    const raw = await r.text();
    const body = JSON.parse(raw);
    expect(body.type).toBe('FeatureCollection');
    // Test de fuite : aucune de ces clés ne doit exister dans la réponse
    for (const interdit of ['"email"', 'ip_hash', 'confirm_token', 'suivi_token', 'photo_path']) {
      expect(raw).not.toContain(interdit);
    }
  });

  test('16.2.7 detail valide ses paramètres', async ({ request }) => {
    expect((await request.get(`${API}/detail?token=pas-un-uuid`)).status()).toBe(400);
    expect((await request.get(`${API}/detail?ville=${CITY}&id=00000000-0000-4000-8000-000000000000`)).status()).toBe(404);
  });

  test('16.2.8 update exige une authentification', async ({ request }) => {
    const r = await request.post(`${API}/update`, {
      data: { action: 'set_statut', ville: CITY, id: '00000000-0000-4000-8000-000000000000', statut_key: 'resolu' },
    });
    expect(r.status()).toBe(401);
  });

  test('16.2.9 retrait exige un motif', async ({ request }) => {
    const r = await request.post(`${API}/retrait`, {
      data: { ville: CITY, id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(r.status()).toBe(400);
  });
});
