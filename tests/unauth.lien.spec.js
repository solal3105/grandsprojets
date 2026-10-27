// @ts-check
import { test, expect } from '@playwright/test';
import { analyserCible, validerCible } from '../home-src/src/lib/utm.mjs';

/**
 * La fabrique de liens de l'équipe commerciale - /lien
 *
 * Ce que ces tests garantissent :
 *  - le lien produit porte exactement les marqueurs attendus, mis au propre
 *    (c'est toute la raison d'être de la page : « Instagram », « instagram »
 *    et « insta » ne doivent pas devenir trois canaux dans PostHog) ;
 *  - une adresse qui n'est pas la nôtre est refusée, et un lien déjà marqué
 *    recollé ne se retrouve pas avec deux jeux de marqueurs ;
 *  - la page reste hors des moteurs et hors du plan du site ;
 *  - une adresse courte inconnue explique ce qui se passe au lieu de renvoyer
 *    le visiteur sur une page blanche.
 *
 * La création d'une vraie adresse courte n'est pas couverte : elle demande la
 * clé de service Supabase, absente en local.
 */

/** Renseigne les quatre réglages de la page et rend le lien affiché. */
async function fabriquer(page, { cible, support, campagne, auteur }) {
  await page.fill('#lien-cible', cible);
  if (support) await page.click(`[data-support="${support}"]`);
  if (campagne !== undefined) await page.fill('#lien-campagne', campagne);
  if (auteur !== undefined) await page.fill('#lien-auteur', auteur);
  await expect(page.locator('#lien-resultat')).toBeVisible();
  return (await page.locator('#lien-resultat').innerText()).trim();
}

test.describe('0.74 Fabrique de liens - la page /lien', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/lien', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try { localStorage.removeItem('op.lien.historique'); localStorage.removeItem('op.lien.auteur'); } catch { /* navigation privée */ }
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lien-cible')).toBeVisible();
  });

  test('0.74.1 la page est servie et reste hors des moteurs', async ({ page, request }) => {
    await expect(page.locator('h1')).toContainText('Fabriquez un lien');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
    // La balise n'existe qu'après le JavaScript : l'en-tête, lui, part avec la
    // première réponse, donc un robot qui ne rend pas les pages la voit aussi.
    const entete = await request.get('/lien');
    expect(entete.headers()['x-robots-tag']).toContain('noindex');
  });

  test('0.74.2 le support choisi fixe la source et la nature du lien', async ({ page }) => {
    const lien = await fabriquer(page, {
      cible: 'https://openprojets.com/carte',
      support: 'linkedin-post',
      campagne: 'Salon des maires 2026',
      auteur: 'Solal',
    });
    const url = new URL(lien);
    expect(url.origin + url.pathname).toBe('https://openprojets.com/carte');
    expect(url.searchParams.get('utm_source')).toBe('linkedin');
    expect(url.searchParams.get('utm_medium')).toBe('social');
    expect(url.searchParams.get('utm_campaign')).toBe('salon-des-maires-2026');
    expect(url.searchParams.get('utm_content')).toBe('solal');
  });

  test('0.74.3 accents, majuscules et ponctuation sont mis au propre', async ({ page }) => {
    const lien = await fabriquer(page, {
      cible: 'openprojets.com/tarification',
      support: 'email-prospection',
      campagne: "Relance budget « 2027 » !",
      auteur: 'Amélie',
    });
    const url = new URL(lien);
    expect(url.protocol).toBe('https:');
    expect(url.searchParams.get('utm_campaign')).toBe('relance-budget-2027');
    expect(url.searchParams.get('utm_content')).toBe('amelie');
  });

  test('0.74.4 une adresse qui n\'est pas la nôtre est refusée', async ({ page }) => {
    await page.fill('#lien-cible', 'https://exemple.fr/une-page');
    await page.click('[data-support="linkedin-post"]');
    await expect(page.locator('#lien-cible-erreur')).toBeVisible();
    await expect(page.locator('#lien-resultat')).toHaveCount(0);
    await expect(page.locator('#lien-attente')).toBeVisible();
  });

  test('0.74.5 un lien déjà marqué ne reçoit pas deux jeux de marqueurs', async ({ page }) => {
    const lien = await fabriquer(page, {
      cible: 'https://openprojets.com/carte?utm_source=instagram&utm_medium=social&ville=lyon',
      support: 'newsletter',
      campagne: 'Voeux 2027',
      auteur: 'Solal',
    });
    expect(lien.match(/utm_source=/g)).toHaveLength(1);
    const url = new URL(lien);
    expect(url.searchParams.get('utm_source')).toBe('newsletter');
    expect(url.searchParams.get('utm_medium')).toBe('email');
    // Les paramètres qui ne sont pas des marqueurs restent en place
    expect(url.searchParams.get('ville')).toBe('lyon');
  });

  test('0.74.6 un support absent de la liste se saisit à la main', async ({ page }) => {
    await page.fill('#lien-cible', 'https://openprojets.com/');
    await page.click('[data-support="autre"]');
    await page.fill('#lien-autre-nom', 'Annuaire des Solutions');
    await page.selectOption('#lien-autre-nature', 'referral');
    await page.fill('#lien-campagne', 'Référencement partenaires');
    const url = new URL((await page.locator('#lien-resultat').innerText()).trim());
    expect(url.searchParams.get('utm_source')).toBe('annuaire-des-solutions');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
  });

  test('0.74.7 le lien copié se retrouve dans l\'historique après rechargement', async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await fabriquer(page, {
      cible: 'https://openprojets.com/travaux',
      support: 'salon',
      campagne: 'Salon des maires 2026',
      auteur: 'Solal',
    });
    await page.click('#lien-copier');
    await expect(page.locator('#lien-historique li')).toHaveCount(1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lien-historique li')).toHaveCount(1);
    await expect(page.locator('#lien-historique li').first()).toContainText('Salon des maires 2026');
    // Le prénom aussi est retenu : on ne le retape pas chaque matin.
    await expect(page.locator('#lien-auteur')).toHaveValue('Solal');
  });
});

test.describe('0.74 Fabrique de liens - les adresses courtes', () => {
  test('0.74.8 une adresse courte inconnue explique ce qui se passe', async ({ page }) => {
    const reponse = await page.goto('/l/cette-adresse-nexiste-pas', { waitUntil: 'domcontentloaded' });
    expect(reponse?.status()).toBe(404);
    await expect(page.locator('h1')).toContainText("Ce lien n'existe pas");
    await expect(page.locator('a[href="https://openprojets.com/"]')).toBeVisible();
    expect(reponse?.headers()['x-robots-tag']).toContain('noindex');
  });

  test('0.74.9 ni la fabrique ni les adresses courtes ne sont dans le plan du site', async ({ request }) => {
    const xml = await (await request.get('/sitemap-pages.xml')).text();
    expect(xml).not.toContain('openprojets.com/lien');
    expect(xml).not.toContain('openprojets.com/l/');
  });
});

/* Ce que le serveur enregistre derrière une adresse courte.
 *
 * Non-régression : la première version enregistrait la cible nettoyée de ses
 * marqueurs, si bien que /l/{code} redirigeait vers une page nue et que la
 * visite n'était plus rattachée à sa campagne. Deux lectures d'adresse
 * cohabitent donc, et elles ne sont pas interchangeables. */
test.describe('0.74 Fabrique de liens - ce que garde une adresse courte', () => {
  const marquee = 'https://openprojets.com/carte?utm_source=salon&utm_medium=terrain&utm_campaign=amif-2026';

  test('0.74.10 la cible enregistrée garde ses marqueurs intacts', () => {
    const { url } = validerCible(marquee);
    expect(url.searchParams.get('utm_source')).toBe('salon');
    expect(url.searchParams.get('utm_medium')).toBe('terrain');
    expect(url.searchParams.get('utm_campaign')).toBe('amif-2026');
  });

  test('0.74.11 la saisie du commercial, elle, est débarrassée des marqueurs', () => {
    const { url } = analyserCible(marquee);
    expect(url.searchParams.get('utm_source')).toBeNull();
    expect(url.toString()).toBe('https://openprojets.com/carte');
  });

  test('0.74.12 le serveur refuse de raccourcir une page qui n\'est pas la nôtre', async ({ request }) => {
    const r = await request.post('/api/lien-court', {
      data: { code: 'essai-refus', target_url: 'https://exemple.fr/une-page' },
    });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toContain("n'est pas la nôtre");
  });
});
