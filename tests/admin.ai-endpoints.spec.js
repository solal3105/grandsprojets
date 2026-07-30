// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { isAdminForVille, getAuthedUser } from '../netlify/functions/lib/ai-common.mjs';

/**
 * Endpoints IA avec un JWT valide : validation du corps et contrôle du rôle.
 *
 * Aucun test de ce fichier n'atteint OpenAI. Chaque cas s'arrête sur une erreur
 * de validation, et le contrôle d'autorisation est vérifié en appelant
 * directement `isAdminForVille` (voir 14.2) plutôt que par HTTP.
 *
 * Pourquoi pas par HTTP pour le 403 : `netlify dev` traite un 403 renvoyé par une
 * fonction comme un « non trouvé » et réessaie /api/x.html, /api/x.htm,
 * /api/x/index.html, puis retombe sur la SPA. Le client reçoit alors 200
 * « Method Not Allowed ». La fonction, elle, renvoie bien 403 (visible dans le
 * log netlify dev). Asserter le 403 par HTTP testerait le serveur de dev.
 */

/** Jeton d'accès Supabase d'un compte de test, depuis l'état d'auth du projet. */
function tokenOf(who) {
  const state = JSON.parse(fs.readFileSync(`tests/.auth/${who}.json`, 'utf8'));
  for (const origin of state.origins || []) {
    for (const kv of origin.localStorage || []) {
      if (kv.name === 'grandsprojets-auth') return JSON.parse(kv.value).access_token;
    }
  }
  throw new Error(`Aucun jeton dans tests/.auth/${who}.json`);
}

/**
 * POST authentifié sur un endpoint IA.
 * `raw` part en Buffer : une chaîne serait ré-encodée en JSON par Playwright,
 * et le corps arriverait valide alors qu'on veut justement le rendre illisible.
 */
async function post(request, path, body, raw) {
  return request.post(path, {
    headers: {
      Authorization: `Bearer ${tokenOf('admin')}`,
      'Content-Type': 'application/json',
    },
    data: raw !== undefined ? Buffer.from(raw, 'utf8') : JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────
// 14 - Endpoints IA (requetes authentifiees)
// ─────────────────────────────────────────────────────────
test.describe('14.1 - Validation du corps avec un JWT valide', () => {

  test('14.1.1 - ai-generate : corps non JSON → 400', async ({ request }) => {
    const res = await post(request, '/api/ai-generate', null, 'ceci nest pas du json');
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('14.1.2 - ai-generate : ni project_name ni target → 400', async ({ request }) => {
    const res = await post(request, '/api/ai-generate', {});
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('project_name and target are required');
  });

  test('14.1.3 - ai-generate : project_name sans target → 400', async ({ request }) => {
    const res = await post(request, '/api/ai-generate', { project_name: 'Ligne T9' });
    expect(res.status()).toBe(400);
  });

  test('14.1.4 - ai-diagnostic : corps non JSON → 400', async ({ request }) => {
    const res = await post(request, '/api/ai-diagnostic', null, 'ceci nest pas du json');
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('14.1.5 - ai-diagnostic : ville hors format → 400 avant tout accès base', async ({ request }) => {
    const res = await post(request, '/api/ai-diagnostic', {
      ville: 'pas une ville !',
      sample: [{ i: 1, code: 'S1' }],
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Paramètre ville invalide');
  });

  test("14.1.6 - ai-diagnostic : ville en injection SQL → rejetée par le format", async ({ request }) => {
    const res = await post(request, '/api/ai-diagnostic', {
      ville: "test-e2e'; drop table profiles;--",
      sample: [{ i: 1, code: 'S1' }],
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Paramètre ville invalide');
  });

  test('14.1.7 - ai-diagnostic : aucun point → 400', async ({ request }) => {
    const res = await post(request, '/api/ai-diagnostic', { ville: 'test-e2e', sample: [] });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Aucun point à analyser');
  });

  test('14.1.8 - ai-diagnostic : points orphelins de toute source → 400', async ({ request }) => {
    // Ville autorisée, points présents, mais leurs codes ne correspondent à
    // aucune source décrite : le prompt mentirait sur son propre contenu.
    // Ce cas passe APRÈS le contrôle d'autorisation, donc il prouve aussi que
    // l'admin de test est bien reconnu sur sa structure.
    const res = await post(request, '/api/ai-diagnostic', {
      ville: 'test-e2e',
      layers: [],
      sample: [{ i: 1, code: 'S1', text: 'nid-de-poule' }],
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Aucun point à analyser');
  });

});

test.describe('14.2 - Contrôle du rôle (isAdminForVille, appel direct)', () => {

  test('14.2.1 - Un admin est reconnu sur sa propre structure', async () => {
    const user = await getAuthedUser(new Request('http://x', {
      headers: { authorization: `Bearer ${tokenOf('admin')}` },
    }));
    expect(user).not.toBeNull();
    expect(await isAdminForVille(user, 'test-e2e')).toBe(true);
  });

  test("14.2.2 - Un admin est refusé sur une structure qui n'est pas la sienne", async () => {
    const user = await getAuthedUser(new Request('http://x', {
      headers: { authorization: `Bearer ${tokenOf('admin')}` },
    }));
    expect(await isAdminForVille(user, 'metropole-lyon')).toBe(false);
  });

  test('14.2.3 - Un contributeur est refusé même sur sa propre structure', async () => {
    const user = await getAuthedUser(new Request('http://x', {
      headers: { authorization: `Bearer ${tokenOf('invited')}` },
    }));
    expect(user).not.toBeNull();
    expect(await isAdminForVille(user, 'test-e2e')).toBe(false);
  });

  test('14.2.4 - Un jeton invalide ne donne aucun utilisateur', async () => {
    const user = await getAuthedUser(new Request('http://x', {
      headers: { authorization: 'Bearer pas-un-vrai-jeton' },
    }));
    expect(user).toBeNull();
  });

  test('14.2.5 - Une requête sans en-tête Authorization ne donne aucun utilisateur', async () => {
    expect(await getAuthedUser(new Request('http://x'))).toBeNull();
  });

  test('14.2.6 - Un identifiant forgé ne contourne pas la lecture du profil', async () => {
    // Le jeton est valide mais l'id est celui de quelqu'un d'autre : la RLS ne
    // renvoie aucune ligne, donc aucun rôle, donc refus.
    const user = {
      id: '00000000-0000-0000-0000-000000000000',
      token: tokenOf('admin'),
    };
    expect(await isAdminForVille(user, 'test-e2e')).toBe(false);
  });

});
