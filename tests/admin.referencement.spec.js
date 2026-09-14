// @ts-check
import { test, expect } from '@playwright/test';
import {
  FILTERS, normalize, displayName, filterSpaces, summarize,
  stateLabel, changeLabel, fichesLabel, authorLabel, confirmCopy,
} from '../admin/sections/referencement/model.js';

/**
 * Référencement : la page, réservée aux super administrateurs, qui choisit
 * les espaces proposés aux moteurs de recherche (city_branding.indexable).
 *
 * Le compte de la suite est un administrateur de ville (test-e2e), pas un
 * super administrateur : la page lui est fermée (19.1) et la base refuse son
 * écriture quoi qu'il arrive (19.1.3). Pour parcourir l'écran complet, 19.2
 * fait croire au client qu'il est super administrateur en interceptant la
 * lecture du profil : la vue se charge (lecture ouverte), le journal reste
 * vide (RLS) et la bascule est refusée par la base (garde). C'est ce qu'on
 * veut prouver : l'interface ne suffit pas à changer le réglage.
 */

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

/** Le client se croit super administrateur : la lecture de SON profil est interceptée. */
async function pretendGlobalAdmin(page) {
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/profiles') && (url.searchParams.get('id') || '').startsWith('eq.'),
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ role: 'admin', ville: ['global', 'test-e2e'] }),
    }),
  );
}

async function goToReferencement(page) {
  await waitForBoot(page, '/admin/referencement/');
  await page.waitForFunction(() => {
    const el = document.querySelector('#idx-list');
    return !!el && !el.querySelector('.adm-skeleton');
  }, { timeout: 15000 });
}

/** Lecture directe en base avec la session du navigateur (client Supabase de l'admin). */
async function readIndexable(page, ville) {
  return page.evaluate(async (v) => {
    const client = window.AuthModule.getClient();
    const { data } = await client.from('city_branding').select('indexable').eq('ville', v).single();
    return data?.indexable;
  }, ville);
}

// ─────────────────────────────────────────────────────────
// 19.1 - Accès : administrateur de ville
// ─────────────────────────────────────────────────────────
test.describe('19.1 - Référencement : fermé à un administrateur de ville', () => {

  test('19.1.1 - Le lien Référencement est masqué dans la navigation', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="referencement"]')).toBeHidden();
  });

  test('19.1.2 - L\'adresse directe affiche la page réservée, sans liste', async ({ page }) => {
    await waitForBoot(page, '/admin/referencement/');
    await expect(page.locator('.adm-page-title')).toContainText('Référencement');
    await expect(page.locator('#idx-reserved')).toContainText('réservée aux super administrateurs');
    await expect(page.locator('#idx-list')).toHaveCount(0);
    await expect(page.locator('.idx-row')).toHaveCount(0);
  });

  test('19.1.3 - La base refuse le changement même en appel direct (garde)', async ({ page }) => {
    await waitForBoot(page);
    // test-e2e est retiré des moteurs : proposer l'espace serait un vrai changement.
    // Si la garde tombait, la ligne basculerait pour de bon : le test le verrait
    // à la lecture qui suit, et la valeur serait à remettre à la main.
    const result = await page.evaluate(async () => {
      const client = window.AuthModule.getClient();
      const { error } = await client
        .from('city_branding')
        .update({ indexable: true })
        .eq('ville', 'test-e2e')
        .select('ville, indexable');
      return { message: error?.message || null, code: error?.code || null };
    });
    expect(result.message, JSON.stringify(result)).toContain('super administrateur');
    expect(await readIndexable(page, 'test-e2e')).toBe(false);
  });

  test('19.1.4 - Le journal est invisible, la vue d\'ensemble lisible sans le dernier changement', async ({ page }) => {
    await waitForBoot(page);
    const { logCount, logError, row, rowError } = await page.evaluate(async () => {
      const client = window.AuthModule.getClient();
      const log = await client.from('city_indexing_log').select('id');
      const overview = await client.from('city_indexing_overview').select('*').eq('ville', 'test-e2e').single();
      return {
        logCount: (log.data || []).length,
        logError: log.error?.message || null,
        row: overview.data,
        rowError: overview.error?.message || null,
      };
    });
    expect(logError).toBeNull();
    expect(logCount).toBe(0);
    expect(rowError).toBeNull();
    expect(row.ville).toBe('test-e2e');
    expect(row.indexable).toBe(false);
    expect(typeof row.fiches_publiques).toBe('number');
    // Le dernier changement vient du journal : la RLS le cache à ce compte
    expect(row.last_changed_at).toBeNull();
    expect(row.last_changed_by_email).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// 19.2 - L'écran complet (client qui se croit super administrateur)
// ─────────────────────────────────────────────────────────
test.describe('19.2 - Référencement : l\'écran', () => {

  test.beforeEach(async ({ page }) => {
    await pretendGlobalAdmin(page);
  });

  test('19.2.1 - Titre, explication, chiffres et liste avec test-e2e retiré des moteurs', async ({ page }) => {
    await goToReferencement(page);
    await expect(page.locator('.adm-nav-item[data-section="referencement"]')).toBeVisible();
    await expect(page.locator('.adm-page-title')).toContainText('Référencement');
    await expect(page.locator('.adm-page-subtitle')).toContainText('moteurs de recherche');
    await expect(page.locator('.idx-intro')).toContainText('plan du site');

    const tiles = page.locator('.idx-stat');
    await expect(tiles).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(tiles.nth(i).locator('.idx-stat__value')).toHaveText(/^\d[\d   ]*$/);
    }

    const row = page.locator('.idx-row[data-ville="test-e2e"]');
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-indexable', 'false');
    await expect(row.locator('.adm-badge--neutral')).toHaveText('Retiré des moteurs');
    await expect(row.locator('.adm-badge--info')).toHaveText('test-e2e');
    await expect(row.locator('.adm-list-item__meta')).toContainText('fiche');
    await expect(row.locator('input[data-action="toggle"]')).not.toBeChecked();
    await expect(row.locator('input[data-action="toggle"]')).toHaveAttribute('aria-label', /aux moteurs de recherche$/);
  });

  test('19.2.2 - La recherche filtre par nom ou par code, et dit quand rien ne correspond', async ({ page }) => {
    await goToReferencement(page);
    const total = await page.locator('.idx-row').count();
    expect(total).toBeGreaterThan(1);

    await page.fill('#idx-search', 'TEST-E2E');
    await expect(page.locator('.idx-row[data-ville="test-e2e"]')).toBeVisible();
    const villes = await page.locator('.idx-row').evaluateAll((els) => els.map((el) => el.getAttribute('data-ville')));
    for (const v of villes) expect(v).toContain('test-e2e');

    await page.fill('#idx-search', 'zzz-inexistant-zzz');
    await expect(page.locator('#idx-list .adm-empty__title')).toHaveText('Aucun espace ne correspond à cette recherche');
    await expect(page.locator('.idx-row')).toHaveCount(0);

    await page.fill('#idx-search', '');
    await expect(page.locator('.idx-row')).toHaveCount(total);
  });

  test('19.2.3 - Les onglets séparent les espaces proposés des espaces retirés', async ({ page }) => {
    await goToReferencement(page);
    const total = await page.locator('.idx-row').count();

    await page.click('#idx-tabs [data-filter="off"]');
    await expect(page.locator('#idx-tabs [data-filter="off"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.idx-row[data-ville="test-e2e"]')).toBeVisible();
    await expect(page.locator('.idx-row[data-indexable="true"]')).toHaveCount(0);
    const retires = await page.locator('.idx-row').count();

    await page.click('#idx-tabs [data-filter="on"]');
    await expect(page.locator('.idx-row[data-indexable="false"]')).toHaveCount(0);
    const proposes = await page.locator('.idx-row').count();
    expect(proposes + retires).toBe(total);

    await page.click('#idx-tabs [data-filter="all"]');
    await expect(page.locator('.idx-row')).toHaveCount(total);
  });

  test('19.2.4 - La bascule demande confirmation en nommant l\'espace ; annuler ne change rien', async ({ page }) => {
    await goToReferencement(page);
    const row = page.locator('.idx-row[data-ville="test-e2e"]');
    await row.locator('.adm-switch__track').click();

    const dialog = page.locator('#adm-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#adm-dialog-body')).toContainText(/Proposer .* aux moteurs de recherche \?/);
    await expect(page.locator('#adm-dialog-body')).toContainText('plan du site');
    await expect(page.locator('#adm-dialog-confirm')).toHaveText('Proposer aux moteurs');

    await page.click('#adm-dialog-cancel');
    await expect(dialog).toBeHidden();
    await expect(row.locator('input[data-action="toggle"]')).not.toBeChecked();
    await expect(row).toHaveAttribute('data-indexable', 'false');
  });

  test('19.2.5 - Confirmer sans être vraiment super administrateur : la base refuse, l\'écran le dit et revient en arrière', async ({ page }) => {
    await goToReferencement(page);
    await clearToasts(page);
    const row = page.locator('.idx-row[data-ville="test-e2e"]');
    await row.locator('.adm-switch__track').click();
    await page.click('#adm-dialog-confirm');

    await expect(page.locator('.adm-toast--error')).toContainText('super administrateur');
    await expect(row.locator('input[data-action="toggle"]')).not.toBeChecked();
    await expect(row.locator('input[data-action="toggle"]')).toBeEnabled();
    await expect(row).toHaveAttribute('data-indexable', 'false');
    expect(await readIndexable(page, 'test-e2e')).toBe(false);
  });

  test('19.2.6 - Le journal explique son état vide (ce compte ne voit pas les changements)', async ({ page }) => {
    await goToReferencement(page);
    await expect(page.locator('#idx-log .adm-empty__title')).toHaveText('Aucun changement enregistré pour l\'instant');
  });
});

// ─────────────────────────────────────────────────────────
// 19.3 - Le modèle, sans écran
// ─────────────────────────────────────────────────────────
test.describe('19.3 - Référencement : calculs et textes', () => {

  const ROWS = [
    { ville: 'metropole-lyon', brand_name: 'Métropole de Lyon', indexable: true, fiches_publiques: 312 },
    { ville: 'france', brand_name: 'Carte de france des projets', indexable: false, fiches_publiques: 700 },
    { ville: 'essai-albi', brand_name: 'Albi', indexable: true, fiches_publiques: 0 },
    { ville: 'test-e2e', brand_name: '', indexable: false, fiches_publiques: 1 },
  ];

  test('19.3.1 - La recherche ignore la casse et les accents, sur le nom comme sur le code', () => {
    expect(normalize('  Métropole DE Lyon ')).toBe('metropole de lyon');
    expect(filterSpaces(ROWS, { query: 'METROPOLE' }).map((r) => r.ville)).toEqual(['metropole-lyon']);
    expect(filterSpaces(ROWS, { query: 'métro' }).map((r) => r.ville)).toEqual(['metropole-lyon']);
    expect(filterSpaces(ROWS, { query: 'essai' }).map((r) => r.ville)).toEqual(['essai-albi']);
    expect(filterSpaces(ROWS, { query: 'zzz' })).toEqual([]);
  });

  test('19.3.2 - Les onglets filtrent, et la liste est triée par code', () => {
    expect(filterSpaces(ROWS).map((r) => r.ville)).toEqual(['essai-albi', 'france', 'metropole-lyon', 'test-e2e']);
    expect(filterSpaces(ROWS, { filter: FILTERS.on }).map((r) => r.ville)).toEqual(['essai-albi', 'metropole-lyon']);
    expect(filterSpaces(ROWS, { filter: FILTERS.off }).map((r) => r.ville)).toEqual(['france', 'test-e2e']);
    expect(filterSpaces(ROWS, { filter: FILTERS.off, query: 'test' }).map((r) => r.ville)).toEqual(['test-e2e']);
    // Un réglage absent (ancienne ligne) compte comme proposé : c'est la valeur par défaut en base
    expect(filterSpaces([{ ville: 'x', brand_name: 'X' }], { filter: FILTERS.on })).toHaveLength(1);
  });

  test('19.3.3 - Les chiffres de tête séparent espaces et fiches, proposés et retirés', () => {
    expect(summarize(ROWS)).toEqual({ proposes: 2, retires: 2, fichesProposees: 312, fichesRetirees: 701 });
    expect(summarize([])).toEqual({ proposes: 0, retires: 0, fichesProposees: 0, fichesRetirees: 0 });
  });

  test('19.3.4 - Les libellés sont des phrases, avec le bon pluriel', () => {
    expect(displayName(ROWS[3])).toBe('test-e2e');
    expect(displayName(ROWS[0])).toBe('Métropole de Lyon');
    expect(stateLabel(true)).toBe('Proposé aux moteurs');
    expect(stateLabel(false)).toBe('Retiré des moteurs');
    expect(changeLabel(false)).toBe('retiré des moteurs');
    expect(fichesLabel(0)).toBe('Aucune fiche publique');
    expect(fichesLabel(1)).toBe('1 fiche publique');
    expect(fichesLabel(2)).toBe('2 fiches publiques');
    expect(fichesLabel(1234)).toMatch(/^1[   ]234 fiches publiques$/);
    expect(authorLabel('solal@example.org')).toBe('par solal@example.org');
    expect(authorLabel(null)).toBe('depuis la base');
  });

  test('19.3.5 - La confirmation nomme l\'espace, la conséquence, et le bouton dit ce qui va se passer', () => {
    const off = confirmCopy(ROWS[0], false);
    expect(off.title).toBe('Retirer Métropole de Lyon des moteurs de recherche ?');
    expect(off.message).toContain('ses 312 fiches publiques');
    expect(off.message).toContain('restent consultables par lien');
    expect(off.confirmLabel).toBe('Retirer des moteurs');

    const on = confirmCopy(ROWS[1], true);
    expect(on.title).toBe('Proposer Carte de france des projets aux moteurs de recherche ?');
    expect(on.message).toContain('reviendront dans le plan du site');
    expect(on.confirmLabel).toBe('Proposer aux moteurs');

    // Sans fiche, on ne parle que de la page de ville
    const empty = confirmCopy(ROWS[2], false);
    expect(empty.message.startsWith('Sa page de ville sortira')).toBe(true);
    expect(empty.message).not.toContain('fiche');
  });
});
