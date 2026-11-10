// @ts-check
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import demoLead, { LIMITS as DEMO } from '../netlify/functions/demo-lead.mjs';
import tarifLead, { LIMITS as TARIF } from '../netlify/functions/tarif-lead.mjs';
import { ipHashOf } from '../netlify/functions/lib/public-mail.mjs';

/**
 * Les e-mails demandés sans compte : le lien d'une carte de démonstration
 * (/api/demo-lead) et l'estimation de /tarification (/api/tarif-lead).
 *
 * Chaque demande est inscrite en base avant d'agir (`reserve_public_mail`,
 * migration 20261110190000) : la base dit si le message part, si la demande
 * est gardée sans message ou si elle est ignorée. Ces essais tournent en Node : la base est un
 * PGlite qui rejoue la migration, le fournisseur d'e-mails et l'API de la base
 * sont un faux `fetch`. Aucun message réel ne part.
 */

const MIGRATION = 'supabase/migrations/20261110190000_envois_publics_plafonnes.sql';
const BASE = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const IP = '203.0.113.7';

let db;
test.beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(readFileSync(MIGRATION, 'utf8'));
});
test.afterAll(async () => { await db?.close(); });
test.beforeEach(async () => { await db.exec('truncate public.public_mail_requests'); });

const reserve = async (kind, ipHash, recipient, limits) => (await db.query(
  'select public.reserve_public_mail($1,$2,$3,$4,$5,$6) as value',
  [kind, ipHash, recipient, limits.ip, limits.recipient, limits.total],
)).rows[0].value;
const journal = async () => (await db.query('select * from public.public_mail_requests order by id')).rows;

/** Remplit le journal comme si `n` demandes avaient déjà été acceptées, leur message parti. */
const dejaReserves = (n, { kind = 'demo', ipHash = 'autre-origine', age = '1 hour' } = {}) => db.query(
  `insert into public.public_mail_requests (kind, ip_hash, recipient_hash, sent, created_at)
   select $1, $2, 'adresse-' || g, true, now() - $3::interval from generate_series(1, $4) g`,
  [kind, ipHash, age, n],
);

test.describe('0.95 - Envois sans compte : la règle tenue par la base', () => {

  const limites = { ip: 4, recipient: 2, total: 6 };

  test('0.95.1 - Une même adresse ne reçoit pas plus que son plafond, quelle que soit l’origine', async () => {
    expect(await reserve('demo', 'ip-a', 'elue@mairie.fr', limites)).toBe('reserved');
    expect(await reserve('demo', 'ip-b', '  Elue@Mairie.FR ', limites)).toBe('reserved');
    expect(await reserve('demo', 'ip-c', 'elue@mairie.fr', limites)).toBe('recipient');
    // Une autre adresse passe ; la demande retenue est inscrite, sans message
    expect(await reserve('demo', 'ip-c', 'dgs@mairie.fr', limites)).toBe('reserved');
    expect((await journal()).map((l) => l.sent)).toEqual([true, true, false, true]);
  });

  test('0.95.2 - Une même origine ne déclenche pas plus que son plafond', async () => {
    for (let i = 0; i < limites.ip; i++) expect(await reserve('demo', 'ip-a', `a${i}@mairie.fr`, limites)).toBe('reserved');
    expect(await reserve('demo', 'ip-a', 'suivante@mairie.fr', limites)).toBe('ip');
    // Une demande ignorée ne s'inscrit pas, et une autre origine n'est pas gênée
    expect(await journal()).toHaveLength(limites.ip);
    expect(await reserve('demo', 'ip-b', 'suivante@mairie.fr', limites)).toBe('reserved');
  });

  test('0.95.2b - Le plafond d’une origine compte ses demandes, que leur message soit parti ou non', async () => {
    await dejaReserves(limites.recipient, { ipHash: 'ailleurs' });
    await db.exec("update public.public_mail_requests set recipient_hash = encode(sha256(convert_to('elue@mairie.fr', 'UTF8')), 'hex')");
    // La même origine redemande une adresse déjà au plafond : gardée sans message, puis ignorée
    for (let i = 0; i < limites.ip; i++) expect(await reserve('demo', 'ip-a', 'elue@mairie.fr', limites)).toBe('recipient');
    expect(await reserve('demo', 'ip-a', 'elue@mairie.fr', limites)).toBe('ip');
    expect(await reserve('demo', 'ip-a', 'une-autre@mairie.fr', limites)).toBe('ip');
    expect((await journal()).filter((l) => l.ip_hash === 'ip-a')).toHaveLength(limites.ip);
  });

  test('0.95.3 - Le formulaire entier a son plafond, chaque formulaire le sien', async () => {
    for (let i = 0; i < limites.total; i++) expect(await reserve('demo', `ip-${i}`, `a${i}@mairie.fr`, limites)).toBe('reserved');
    expect(await reserve('demo', 'ip-neuve', 'neuve@mairie.fr', limites)).toBe('total');
    expect(await reserve('tarif', 'ip-neuve', 'neuve@mairie.fr', limites)).toBe('reserved');
    // Les demandes gardées sans message ne consomment pas le plafond des messages
    await db.exec("update public.public_mail_requests set created_at = now() - interval '25 hours' where sent and kind = 'demo' and ip_hash = 'ip-0'");
    expect(await reserve('demo', 'ip-autre', 'autre@mairie.fr', limites)).toBe('reserved');
  });

  test('0.95.4 - Le décompte porte sur vingt-quatre heures, le journal sur trente jours', async () => {
    await dejaReserves(limites.total, { age: '25 hours' });
    await dejaReserves(2, { age: '31 days' });
    expect(await reserve('demo', 'ip-a', 'elue@mairie.fr', limites)).toBe('reserved');
    const lignes = await journal();
    // Les deux lignes de plus de trente jours ont été retirées au passage
    expect(lignes).toHaveLength(limites.total + 1);
  });

  test('0.95.5 - Le journal ne garde ni adresse ni IP, et rien n’y est ouvert au navigateur', async () => {
    await reserve('demo', await ipHashOf(IP), 'elue@mairie.fr', limites);
    const [ligne] = await journal();
    expect(JSON.stringify(ligne)).not.toContain('mairie');
    expect(JSON.stringify(ligne)).not.toContain(IP);
    expect(ligne.recipient_hash).toMatch(/^[0-9a-f]{64}$/);
    const droits = (await db.query(`
      select r as role,
             has_function_privilege(r, 'public.reserve_public_mail(text,text,text,integer,integer,integer)', 'execute') as fonction,
             has_table_privilege(r, 'public.public_mail_requests', 'select') as lecture,
             has_table_privilege(r, 'public.public_mail_requests', 'insert') as ecriture
      from unnest(array['anon','authenticated','service_role']) r order by 1`)).rows;
    expect(droits).toEqual([
      { role: 'anon', fonction: false, lecture: false, ecriture: false },
      { role: 'authenticated', fonction: false, lecture: false, ecriture: false },
      { role: 'service_role', fonction: true, lecture: false, ecriture: false },
    ]);
    expect((await db.query("select relrowsecurity from pg_class where relname = 'public_mail_requests'")).rows[0].relrowsecurity).toBe(true);
  });

});

/**
 * Les deux fonctions, appelées comme Netlify les appelle. Le faux `fetch` joue
 * la base (la réservation passe par le PGlite) et le fournisseur d'e-mails.
 */
test.describe('0.96 - Envois sans compte : les deux formulaires', () => {

  const fetchReel = globalThis.fetch;
  const env = { ...process.env };
  let mails;
  let lignes;
  let baseEnPanne;

  test.beforeEach(() => {
    mails = [];
    lignes = { demo_leads: [], contact_requests: [] };
    baseEnPanne = false;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-service-factice';
    process.env.RESEND_API_KEY = 'cle-de-test';
    delete process.env.BREVO_API_KEY;
    globalThis.fetch = async (url, init = {}) => {
      const adresse = String(url);
      const corps = init.body ? JSON.parse(init.body) : null;
      if (adresse === 'https://api.resend.com/emails') { mails.push(corps); return new Response('{}', { status: 200 }); }
      if (!adresse.startsWith(BASE)) throw new Error(`appel inattendu : ${adresse}`);
      if (baseEnPanne) return new Response('panne', { status: 503 });
      const chemin = new URL(adresse).pathname;
      if (chemin === '/rest/v1/rpc/reserve_public_mail') {
        const statut = await reserve(corps.p_kind, corps.p_ip_hash, corps.p_recipient, { ip: corps.p_max_ip, recipient: corps.p_max_recipient, total: corps.p_max_total });
        return new Response(JSON.stringify(statut), { status: 200 });
      }
      if (chemin === '/rest/v1/demo_runs') return new Response('[]', { status: 200 });
      const table = chemin.replace('/rest/v1/', '');
      if (init.method === 'POST' && lignes[table]) { lignes[table].push(...corps); return new Response(null, { status: 201 }); }
      throw new Error(`appel inattendu à la base : ${init.method || 'GET'} ${chemin}`);
    };
  });

  test.afterEach(() => {
    globalThis.fetch = fetchReel;
    process.env = { ...env };
  });

  const appel = async (fonction, route, corps, ip = IP) => {
    const res = await fonction(new Request(`https://openprojets.com${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    }), { ip });
    return { status: res.status, json: await res.json() };
  };
  const demo = (email, ip) => appel(demoLead, '/api/demo-lead', { email, ville: 'essai-trifouillis', communeNom: 'Trifouillis', projectsCount: 12 }, ip);
  const tarif = (email, ip) => appel(tarifLead, '/api/tarif-lead', { email, population: 12000, modules: ['carte', 'travaux'], annees: 3 }, ip);

  test('0.96.1 - Le lien d’une démonstration part, et son envoi est inscrit au journal', async () => {
    const r = await demo('elue@mairie.fr');
    expect(r).toEqual({ status: 200, json: { ok: true, stored: true, mailed: true } });
    expect(mails.map((m) => m.to)).toEqual([['elue@mairie.fr']]);
    expect(lignes.demo_leads[0]).toMatchObject({ email: 'elue@mairie.fr', mail_status: 'envoye', ip_hash: await ipHashOf(IP) });
    expect((await journal()).map((l) => [l.kind, l.ip_hash, l.sent])).toEqual([['demo', await ipHashOf(IP), true]]);
  });

  test('0.96.2 - Au plafond d’une adresse, elle est gardée sans message et sans promesse de lien', async () => {
    for (let i = 0; i < DEMO.recipient; i++) expect((await demo('elue@mairie.fr', `198.51.100.${i}`)).json.mailed).toBe(true);
    const r = await demo('elue@mairie.fr', '198.51.100.200');
    expect(r).toEqual({ status: 200, json: { ok: true, stored: true, mailed: false } });
    expect(mails).toHaveLength(DEMO.recipient);
    // Gardée avec un premier message non envoyé : la relance ne partira pas (demo-relance.mjs)
    expect(lignes.demo_leads.at(-1)).toMatchObject({ email: 'elue@mairie.fr', mail_status: 'echec', mail_sent_at: null });
    expect(lignes.demo_leads.at(-1).mail_error).toContain('plafond');
  });

  test('0.96.3 - Au plafond d’une origine, la réponse reste neutre : ni message, ni ligne', async () => {
    await dejaReserves(DEMO.ip, { ipHash: await ipHashOf(IP) });
    const r = await demo('elue@mairie.fr');
    expect(r).toEqual({ status: 200, json: { ok: true, stored: false } });
    expect(mails).toEqual([]);
    expect(lignes.demo_leads).toEqual([]);
    // Une autre origine n'est pas gênée
    expect((await demo('elue@mairie.fr', '198.51.100.9')).json.mailed).toBe(true);
  });

  test('0.96.4 - Au plafond du formulaire entier, les adresses sont gardées sans message', async () => {
    await dejaReserves(DEMO.total);
    const r = await demo('elue@mairie.fr');
    expect(r.json).toEqual({ ok: true, stored: true, mailed: false });
    expect(mails).toEqual([]);
  });

  test('0.96.4b - Une origine qui insiste sur une adresse au plafond finit ignorée : plus aucune ligne', async () => {
    for (let i = 0; i < DEMO.recipient; i++) await demo('elue@mairie.fr', `198.51.100.${i}`);
    for (let i = 0; i < DEMO.ip; i++) expect((await demo('elue@mairie.fr')).json).toEqual({ ok: true, stored: true, mailed: false });
    expect((await demo('elue@mairie.fr')).json).toEqual({ ok: true, stored: false });
    expect(mails).toHaveLength(DEMO.recipient);
    expect(lignes.demo_leads).toHaveLength(DEMO.recipient + DEMO.ip);
  });

  test('0.96.5 - L’estimation : trois messages par adresse, puis la demande est gardée sans message', async () => {
    for (let i = 0; i < TARIF.recipient; i++) expect((await tarif('dgs@mairie.fr')).json).toEqual({ ok: true, stored: true, mailed: true });
    expect((await tarif('dgs@mairie.fr')).json).toEqual({ ok: true, stored: true, mailed: false });
    expect(mails).toHaveLength(TARIF.recipient);
    expect(lignes.contact_requests).toHaveLength(TARIF.recipient + 1);
    // L'équipe lit dans la demande pourquoi aucun message n'est parti
    expect(lignes.contact_requests.at(-1).message).toContain('plafond des vingt-quatre heures (recipient)');
    // Le plafond d'un formulaire ne déborde pas sur l'autre
    expect((await demo('dgs@mairie.fr')).json.mailed).toBe(true);
  });

  test('0.96.6 - L’estimation a aussi un plafond par origine : la réponse reste neutre, ni message, ni ligne', async () => {
    await dejaReserves(TARIF.ip, { kind: 'tarif', ipHash: await ipHashOf(IP) });
    expect((await tarif('dgs@mairie.fr')).json).toEqual({ ok: true, stored: false, mailed: false });
    expect(mails).toEqual([]);
    expect(lignes.contact_requests).toEqual([]);
  });

  test('0.96.6b - Au plafond du formulaire entier, une demande d’estimation n’est pas perdue', async () => {
    await dejaReserves(TARIF.total, { kind: 'tarif' });
    expect((await tarif('dgs@mairie.fr')).json).toEqual({ ok: true, stored: true, mailed: false });
    expect(mails).toEqual([]);
    expect(lignes.contact_requests).toHaveLength(1);
    expect(lignes.contact_requests[0]).toMatchObject({ email: 'dgs@mairie.fr', referrer: 'tarification' });
  });

  test('0.96.7 - Base injoignable : la demande d’estimation part quand même, c’est sa seule trace', async () => {
    baseEnPanne = true;
    const r = await tarif('dgs@mairie.fr');
    expect(r.json).toEqual({ ok: true, stored: false, mailed: true });
    expect(mails.map((m) => m.to)).toEqual([['dgs@mairie.fr']]);
  });

  test('0.96.8 - Une demande mal formée est refusée avant toute réservation', async () => {
    expect((await demo('pas-une-adresse')).status).toBe(400);
    expect((await tarif('pas-une-adresse')).status).toBe(400);
    expect(await journal()).toEqual([]);
  });

});
