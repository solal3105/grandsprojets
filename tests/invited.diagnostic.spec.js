// @ts-check
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import diagnosticHandler from '../netlify/functions/ai-diagnostic.mjs';

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 12.5 - Diagnostic terrain : accès contributeur (invited)
// ─────────────────────────────────────────────────────────
test.describe('12.5 - Diagnostic terrain (invited)', () => {

  test('12.5.1 - Entrée sidebar masquée pour un contributeur', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="diagnostic"]')).toBeHidden();
  });

  test('12.5.2 - Accès direct par URL refusé', async ({ page }) => {
    await waitForBoot(page, '/admin/diagnostic/');
    await expect(page.locator('.adm-empty__title')).toContainText('Accès réservé');
    await expect(page.locator('.dg-dock')).toHaveCount(0);
  });
  test('12.5.3 - Les dossiers et leur analyse restent réservés aux administrateurs', async ({ page }) => {
    await waitForBoot(page, '/admin/diagnostic/10664342-ff7d-47fb-8c58-96b4e2fae211/');
    await expect(page.locator('.adm-empty__title')).toContainText('Accès réservé');
    // Netlify Dev transforme les réponses 403 de routes personnalisées en
    // repli HTML. On appelle le handler réel avec le vrai JWT contributeur.
    const auth = JSON.parse(readFileSync('tests/.auth/invited.json', 'utf8'));
    const session = JSON.parse(auth.origins.flatMap(o=>o.localStorage).find(v=>v.name==='grandsprojets-auth').value);
    const response = await diagnosticHandler(new Request('http://localhost:3001/api/ai-diagnostic', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({mode:'dossier',ville:'test-e2e',phase:'read',sources:[],observations:[{id:'o1',text:'Essai'}]})
    }));
    expect(response.status).toBe(403);
  });
});
