// @ts-check
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import handler, { readRequest, generate } from '../netlify/functions/ai-generate.mjs';
import { isMemberOfVille, isAdminForVille } from '../netlify/functions/lib/http.mjs';
import { MODEL, SEARCH_MICRO, MAX_OUTPUT_TOKENS, dailyEnvelope, reserveFor, costOf } from '../netlify/functions/lib/redaction-budget.mjs';

/**
 * Budget de la rédaction assistée (/api/ai-generate).
 *
 * La fonction réserve chaque appel dans l'enveloppe du jour d'un compte pour
 * une ville, puis règle ce qu'il a coûté. Ces essais tournent en Node : la base
 * est un PGlite qui rejoue les migrations du budget, le service d'IA est un
 * faux `fetch`. Aucun appel réel, aucun coût.
 *
 * Le contrôle « ce compte fait-il partie de l'équipe de cette ville » se fait
 * avant, dans le handler. Il est essayé ici sur des profils simulés (0.94), et
 * sur les comptes de test réels dans admin.ai-endpoints.spec.js (14.2).
 */

const user = { id: '10664342-ff7d-47fb-8c58-96b4e2fae213' };
const other = { id: '2f0c9a51-6d0e-4a67-9d3b-5a1e8c7b4d10' };
const DAY = new Date('2026-11-10T10:00:00Z');

let db;
test.beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${user.id}'), ('${other.id}');`);
  for (const file of ['20260918090000_diagnostic_ai_budget.sql', '20260918095810_diagnostic_ai_runs_limit_1_dollar.sql', '20260923120200_diagnostic_plafond_appels.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
});
test.afterAll(async () => { await db?.close(); });

const budget = {
  reserve: async (p) => (await db.query('select public.reserve_diagnostic_ai($1,$2,$3,$4,$5,$6,$7,$8,$9) as value', [p.p_run, p.p_family, p.p_user, p.p_ville, p.p_hash, p.p_phase, p.p_model, p.p_reserve, p.p_floor])).rows[0].value,
  settle: async (p) => (await db.query('select public.settle_diagnostic_ai($1,$2,$3,$4,$5,$6) as value', [p.p_call, p.p_status, p.p_charge, p.p_usage, p.p_result, p.p_request_id])).rows[0].value,
};
const envelopeRow = async (userId, ville, date = DAY) => (await db.query('select * from public.diagnostic_ai_runs where id = $1', [dailyEnvelope(userId, ville, date)])).rows[0];
const callsOf = async (userId, ville, date = DAY) => (await db.query('select * from public.diagnostic_ai_calls where run_id = $1 order by created_at', [dailyEnvelope(userId, ville, date)])).rows;

/** Une demande valide, telle que le formulaire l'envoie. */
const demand = (overrides = {}) => readRequest({ project_name: 'Parc Blandan', category: 'Espaces verts', city: 'test-e2e', target: 'description', ...overrides });

/** Faux service : un flux SSE fait des événements donnés, et la trace de ce qu'il a reçu. */
function fakeAI(events, { status = 200, text = '' } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (status !== 200) return new Response(text, { status, headers: { 'x-request-id': 'req-refus' } });
    const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
    return new Response(body, { status: 200, headers: { 'x-request-id': 'req-essai' } });
  };
  return { fetch, calls };
}
const USAGE = { input_tokens: 9000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 120 };
const SEARCH = { type: 'response.output_item.added', item: { type: 'web_search_call' } };
const TEXT = { type: 'response.output_text.delta', delta: 'Un parc de 17 hectares.' };
const DONE = { type: 'response.completed', response: { usage: USAGE } };

/** Lance une génération et lit tout ce que le navigateur recevrait. */
async function run(request, ai, options = {}) {
  const res = await generate(request, { apiKey: 'cle-factice', corsHeaders: {}, user, budget, fetch: ai.fetch, now: DAY, ...options });
  const raw = await res.text();
  const events = res.headers.get('content-type') === 'text/event-stream'
    ? raw.split('\n\n').map((b) => b.replace(/^data: /, '').trim()).filter(Boolean).map((d) => (d === '[DONE]' ? d : JSON.parse(d)))
    : null;
  return { status: res.status, events, json: events ? null : JSON.parse(raw) };
}

test.describe('0.93 - Budget de la rédaction assistée', () => {

  test('0.93.1 - La demande est bornée avant tout appel', () => {
    expect(demand()).toMatchObject({ project_name: 'Parc Blandan', city: 'test-e2e', target: 'description', useWebSearch: true });
    expect(demand({ web_search: false }).useWebSearch).toBe(false);
    expect(demand({ project_name: '  Parc Blandan  ' }).project_name).toBe('Parc Blandan');
    expect(() => readRequest({})).toThrow('project_name and target are required');
    expect(() => demand({ project_name: 42 })).toThrow('project_name and target are required');
    expect(() => demand({ target: 'roman' })).toThrow('Paramètre target invalide');
    expect(() => demand({ city: '' })).toThrow('Aucune structure sélectionnée');
    expect(() => demand({ city: 'pas une ville !' })).toThrow('Paramètre city invalide');
    expect(() => demand({ project_name: 'x'.repeat(201) })).toThrow('Le champ project_name dépasse 200 caractères');
    expect(() => demand({ description: 'x'.repeat(1001) })).toThrow('Le champ description dépasse 1000 caractères');
    expect(() => demand({ official_url: 'javascript:alert(1)' })).toThrow('Paramètre official_url invalide');
    expect(demand({ official_url: 'https://www.grandlyon.com/parc' }).official_url).toBe('https://www.grandlyon.com/parc');
  });

  test('0.93.2 - L’enveloppe se déduit du compte, de la ville et du jour à Paris', async () => {
    const id = dailyEnvelope(user.id, 'test-e2e', DAY);
    expect(dailyEnvelope(user.id, 'test-e2e', new Date('2026-11-10T22:59:00Z'))).toBe(id);
    // 23 h 01 en temps universel, c'est déjà le lendemain à Paris en novembre.
    expect(dailyEnvelope(user.id, 'test-e2e', new Date('2026-11-10T23:01:00Z'))).not.toBe(id);
    expect(dailyEnvelope(user.id, 'autre-ville', DAY)).not.toBe(id);
    expect(dailyEnvelope(other.id, 'test-e2e', DAY)).not.toBe(id);
    // La base l'accepte comme identifiant.
    expect((await db.query('select $1::uuid as id', [id])).rows[0].id).toBe(id);
  });

  test('0.93.3 - Une génération est réservée, relayée, puis réglée à son coût réel', async () => {
    const ai = fakeAI([SEARCH, SEARCH, TEXT, DONE]);
    const request = demand({ city: 'ville-reglee' });
    const { status, events } = await run(request, ai);

    expect(status).toBe(200);
    expect(events).toEqual([{ status: 'searching' }, { status: 'searching' }, { content: TEXT.delta }, '[DONE]']);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].body).toMatchObject({ model: MODEL, stream: true, max_output_tokens: MAX_OUTPUT_TOKENS.description, tools: [{ type: 'web_search_preview' }] });

    // 8 000 jetons d'entrée, 1 000 relus, 120 écrits, deux recherches.
    const cost = 8000 * 2.5 + 1000 * 1.25 + 120 * 10 + 2 * SEARCH_MICRO;
    expect(costOf(USAGE, 2)).toBe(cost);
    const [call] = await callsOf(user.id, 'ville-reglee');
    expect(call).toMatchObject({ status: 'complete', phase: 'redaction-description', model: MODEL, request_id: 'req-essai' });
    expect(Number(call.charged_micro)).toBe(cost);
    expect(call.usage).toEqual(USAGE);
    expect(call.result).toBeNull();
    const row = await envelopeRow(user.id, 'ville-reglee');
    expect(row).toMatchObject({ user_id: user.id, ville: 'ville-reglee', calls: 1 });
    expect(Number(row.spent_micro)).toBe(cost);
    expect(Number(row.reserved_micro)).toBe(0);
  });

  test('0.93.4 - Sans recherche web, rien n’est réservé pour elle et le service ne reçoit pas l’outil', async () => {
    const prompts = ['consignes', 'demande'];
    expect(reserveFor('description', prompts, true) - reserveFor('description', prompts, false)).toBe(4 * SEARCH_MICRO);
    expect(reserveFor('article', prompts, false)).toBeGreaterThan(reserveFor('description', prompts, false));

    const ai = fakeAI([TEXT, DONE]);
    await run(demand({ city: 'ville-sans-recherche', web_search: false, target: 'article' }), ai);
    expect(ai.calls[0].body.tools).toBeUndefined();
    expect(ai.calls[0].body.max_output_tokens).toBe(MAX_OUTPUT_TOKENS.article);
    const [call] = await callsOf(user.id, 'ville-sans-recherche');
    expect(Number(call.reserved_micro)).toBeLessThan(SEARCH_MICRO);
    expect(Number(call.charged_micro)).toBe(costOf(USAGE, 0));
  });

  test('0.93.5 - La limite du jour arrête la demande avant le service, pour ce compte et cette ville seulement', async () => {
    const request = demand({ city: 'ville-pleine' });
    // Un jour déjà presque entièrement dépensé.
    const envelope = dailyEnvelope(user.id, 'ville-pleine', DAY);
    const first = await budget.reserve({ p_run: envelope, p_family: envelope, p_user: user.id, p_ville: 'ville-pleine', p_hash: randomUUID(), p_phase: 'redaction-article', p_model: MODEL, p_reserve: 950000, p_floor: 0 });
    await budget.settle({ p_call: first.call_id, p_status: 'complete', p_charge: 950000, p_usage: null, p_result: null, p_request_id: '' });

    const ai = fakeAI([TEXT, DONE]);
    const refused = await run(request, ai);
    expect(refused.status).toBe(429);
    expect(refused.json.error).toBe('Vous avez atteint la limite du jour de la rédaction assistée pour cette structure. Elle se renouvelle demain.');
    expect(ai.calls).toHaveLength(0);
    expect(await callsOf(user.id, 'ville-pleine')).toHaveLength(1);

    // Le lendemain, un autre compte, une autre ville : chacun a son enveloppe.
    expect((await run(request, ai, { now: new Date('2026-11-11T10:00:00Z') })).status).toBe(200);
    expect((await run(request, ai, { user: other })).status).toBe(200);
    expect((await run(demand({ city: 'ville-voisine' }), ai)).status).toBe(200);
    expect(ai.calls).toHaveLength(3);
  });

  test('0.93.6 - Un flux coupé avant son décompte coûte toute sa réserve', async () => {
    const ai = fakeAI([SEARCH, TEXT]);
    const { events } = await run(demand({ city: 'ville-coupee' }), ai);
    expect(events).toEqual([{ status: 'searching' }, { content: TEXT.delta }, '[DONE]']);
    const [call] = await callsOf(user.id, 'ville-coupee');
    expect(call.status).toBe('uncertain');
    expect(Number(call.charged_micro)).toBe(Number(call.reserved_micro));
    const row = await envelopeRow(user.id, 'ville-coupee');
    expect(Number(row.spent_micro)).toBe(Number(call.reserved_micro));
    expect(Number(row.reserved_micro)).toBe(0);
  });

  test('0.93.7 - Un texte arrêté à son plafond de sortie est réglé à ce qu’il a coûté', async () => {
    const ai = fakeAI([TEXT, { type: 'response.incomplete', response: { usage: USAGE } }]);
    await run(demand({ city: 'ville-plafond', web_search: false }), ai);
    const [call] = await callsOf(user.id, 'ville-plafond');
    expect(call.status).toBe('failed');
    expect(Number(call.charged_micro)).toBe(costOf(USAGE, 0));
  });

  test('0.93.8 - Un refus du service libère la réserve, une panne la garde', async () => {
    const refus = await run(demand({ city: 'ville-refus' }), fakeAI([], { status: 400, text: '{"error":{"message":"bad"}}' }));
    expect(refus.status).toBe(502);
    expect(refus.json.error).toBe('La demande a été refusée. Réessayez.');
    const [refused] = await callsOf(user.id, 'ville-refus');
    expect(refused).toMatchObject({ status: 'failed', request_id: 'req-refus' });
    expect(Number(refused.charged_micro)).toBe(0);
    expect(Number((await envelopeRow(user.id, 'ville-refus')).spent_micro)).toBe(0);

    const panne = await run(demand({ city: 'ville-panne' }), fakeAI([], { status: 503, text: 'indisponible' }));
    expect(panne.status).toBe(502);
    const [down] = await callsOf(user.id, 'ville-panne');
    expect(down.status).toBe('uncertain');
    expect(Number(down.charged_micro)).toBe(Number(down.reserved_micro));

    // Le service injoignable : l'appel est peut-être parti, sa réserve reste due.
    const perdu = await run(demand({ city: 'ville-perdue' }), { fetch: async () => { throw new TypeError('fetch failed'); } });
    expect(perdu.status).toBe(500);
    expect((await callsOf(user.id, 'ville-perdue'))[0].status).toBe('uncertain');
  });

  test('0.93.9 - Sans suivi du budget, rien ne part vers le service', async () => {
    const ai = fakeAI([TEXT, DONE]);
    const down = { reserve: async () => { throw new Error('base injoignable'); }, settle: async () => {} };
    const res = await run(demand({ city: 'ville-sans-suivi' }), ai, { budget: down });
    expect(res.status).toBe(503);
    expect(res.json.error).toBe('Le suivi du budget de la rédaction assistée est indisponible. Réessayez plus tard.');
    expect(ai.calls).toHaveLength(0);
  });

  test('0.93.10 - Un règlement qui échoue laisse la réserve comptée dans l’enveloppe', async () => {
    const ai = fakeAI([TEXT, DONE]);
    const fragile = { reserve: budget.reserve, settle: async () => { throw new Error('base injoignable'); } };
    const { status, events } = await run(demand({ city: 'ville-fragile' }), ai, { budget: fragile });
    expect(status).toBe(200);
    expect(events.at(-1)).toBe('[DONE]');
    const row = await envelopeRow(user.id, 'ville-fragile');
    expect(Number(row.reserved_micro)).toBeGreaterThan(0);
    expect(Number(row.spent_micro)).toBe(0);
  });

});

/**
 * Remplace `fetch` le temps d'un essai : l'authentification et la lecture du
 * profil répondent ce que l'essai décide, tout autre appel est noté et refusé.
 */
async function withProfile(profile, body) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    const { pathname } = new URL(String(url));
    seen.push(pathname);
    if (pathname === '/auth/v1/user') return Response.json({ id: user.id });
    if (pathname === '/rest/v1/profiles') return Response.json(profile ? [profile] : []);
    return new Response('hors essai', { status: 418 });
  };
  try { return await body(seen); }
  finally { globalThis.fetch = real; }
}
const PROFILES = {
  'administrateur de la ville': { role: 'admin', ville: ['test-e2e'] },
  'administrateur de plusieurs villes': { role: 'admin', ville: ['autre-ville', 'test-e2e'] },
  'super administrateur': { role: 'admin', ville: ['global'] },
  'contributeur de la ville': { role: 'invited', ville: ['test-e2e'] },
  'administrateur d’une autre ville': { role: 'admin', ville: ['autre-ville'] },
  'administrateur sans ville': { role: 'admin', ville: [] },
  'contributeur d’une autre ville': { role: 'invited', ville: ['autre-ville'] },
  'contributeur sans ville': { role: 'invited', ville: null },
  'contributeur marqué global': { role: 'invited', ville: ['global'] },
  'rôle inconnu dans la ville': { role: 'visiteur', ville: ['test-e2e'] },
  'compte sans profil': null,
};
const MEMBERS = ['administrateur de la ville', 'administrateur de plusieurs villes', 'super administrateur', 'contributeur de la ville'];
const ADMINS = MEMBERS.filter((name) => name !== 'contributeur de la ville');
const post = (body, token = 'jeton') => new Request('http://localhost/api/ai-generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

test.describe('0.94 - Qui peut demander une rédaction assistée', () => {

  test('0.94.1 - L’équipe de la ville, administrateurs et contributeurs, et personne d’autre', async () => {
    for (const [name, profile] of Object.entries(PROFILES)) {
      await withProfile(profile, async () => {
        expect(await isMemberOfVille({ id: user.id, token: 'jeton' }, 'test-e2e'), name).toBe(MEMBERS.includes(name));
        // La règle des administrateurs, que le diagnostic emploie, n'a pas bougé.
        expect(await isAdminForVille({ id: user.id, token: 'jeton' }, 'test-e2e'), name).toBe(ADMINS.includes(name));
      });
    }
  });

  test('0.94.2 - Un compte hors de l’équipe est refusé avant toute réserve et tout appel au service', async () => {
    const body = { project_name: 'Parc Blandan', city: 'test-e2e', target: 'description' };
    for (const name of Object.keys(PROFILES).filter((n) => !MEMBERS.includes(n))) {
      await withProfile(PROFILES[name], async (seen) => {
        const res = await handler(post(body));
        expect(res.status, name).toBe(403);
        expect((await res.json()).error, name).toBe('Réservé à l’équipe de cette structure');
        expect(seen, name).toEqual(['/auth/v1/user', '/rest/v1/profiles']);
      });
    }
  });

  test('0.94.3 - Sans session, ou avec une demande hors bornes, le profil n’est même pas lu', async () => {
    await withProfile(PROFILES['administrateur de la ville'], async (seen) => {
      expect((await handler(post({ project_name: 'Parc Blandan', city: 'test-e2e', target: 'description' }, ''))).status).toBe(401);
      expect(seen).toEqual([]);
      const sansVille = await handler(post({ project_name: 'Parc Blandan', target: 'description' }));
      expect(sansVille.status).toBe(400);
      expect((await sansVille.json()).error).toBe('Aucune structure sélectionnée');
      const tropLong = await handler(post({ project_name: 'x'.repeat(5000), city: 'test-e2e', target: 'article' }));
      expect(tropLong.status).toBe(400);
      expect(seen).toEqual(['/auth/v1/user', '/auth/v1/user']);
    });
  });

});
