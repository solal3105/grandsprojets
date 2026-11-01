// @ts-check
import { test, expect } from '@playwright/test';
import submit from '../netlify/functions/participer-submit.mjs';

/**
 * Dépôt d'un signalement citoyen (/api/participer/submit) de bout en bout,
 * contre une fausse base et un faux fournisseur d'email : aucun appel réseau.
 *
 * Les refus (email, catégorie, identifiant de navigateur) sont déjà couverts
 * par HTTP dans unauth.participer.spec.js ; ici, ce que personne ne vérifiait :
 * l'enregistrement réussi, ses trois issues et le nettoyage en cas d'échec.
 */

// Lues à chaque appel par la fonction (jamais au chargement du module)
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-test';
process.env.RESEND_API_KEY = 'cle-de-test';
process.env.PARTICIPER_IP_SALT = 'sel-de-test';

const PHOTO = `data:image/png;base64,${Buffer.from('png').toString('base64')}`;
const APPAREIL = '0b4a8f8e-1f2a-4c3b-9d5e-6f7a8b9c0d1e';

/**
 * Fausse base PostgREST + Storage + Resend. `etat` décrit la ville ; chaque
 * appel est consigné dans `appels` pour les vérifications.
 */
function installerFausseBase(etat = {}) {
  const e = {
    moduleActif: true,
    reglages: { notify_email: 'mairie@example.org' },
    categories: [{ category_key: 'voirie', label: 'Voirie', enabled: true }],
    compter: () => 0,
    insertionEchoue: false,
    mailEchoue: false,
    ...etat,
  };
  const appels = [];
  const reponse = (corps, init = {}) => new Response(JSON.stringify(corps), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

  globalThis.fetch = async (entree, init = {}) => {
    const url = new URL(String(entree));
    const methode = (init.method || 'GET').toUpperCase();
    const corps = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    const appel = { methode, chemin: url.pathname, params: Object.fromEntries(url.searchParams), corps };
    appels.push(appel);

    if (url.hostname === 'api.resend.com') {
      return e.mailEchoue ? new Response('refus', { status: 500 }) : reponse({ id: 'mail-1' });
    }
    const p = url.pathname;
    if (p === '/rest/v1/city_modules') return reponse(e.moduleActif === null ? [] : [{ enabled: e.moduleActif }]);
    if (p === '/rest/v1/participer_settings') return reponse(e.reglages ? [e.reglages] : []);
    if (p === '/rest/v1/participer_categories') return reponse(e.categories);
    if (p === '/rest/v1/participer_signalements' && methode === 'GET') {
      const n = e.compter(appel.params);
      return new Response('[]', { status: 200, headers: { 'content-range': `0-0/${n}` } });
    }
    if (p === '/rest/v1/rpc/participer_next_reference') return reponse('SIG-0042');
    if (p === '/rest/v1/participer_signalements' && methode === 'POST') {
      if (e.insertionEchoue) return new Response('violation', { status: 409 });
      return reponse([{ ...corps[0], confirm_token: 'jeton-confirmation', suivi_token: 'jeton-suivi', created_at: '2026-11-01T10:00:00Z' }]);
    }
    if (p === '/rest/v1/participer_signalements' && methode === 'PATCH') {
      return reponse([{ id: 'x', ville: 'test-e2e', reference: 'SIG-0042', category_key: 'voirie', adresse: null, suivi_token: 'jeton-suivi', created_at: '2026-11-01T10:00:00Z' }]);
    }
    if (p === '/rest/v1/participer_signalements' && methode === 'DELETE') return new Response(null, { status: 204 });
    if (p === '/rest/v1/participer_events') return reponse([{}]);
    if (p.startsWith('/storage/v1/object/')) return reponse({});
    throw new Error(`appel inattendu ${methode} ${p}`);
  };
  return appels;
}

function depot(corps) {
  return submit(new Request('https://openprojets.com/api/participer/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://openprojets.com' },
    body: JSON.stringify(corps),
  }), { ip: '203.0.113.7' });
}

const BASE = { ville: 'test-e2e', email: 'Habitant@Example.org', category_key: 'voirie', lat: 45.75, lng: 4.85, description: 'Nid de poule', adresse: '1 rue A' };

const appelsVers = (appels, chemin, methode) => appels.filter((a) => a.chemin === chemin && (!methode || a.methode === methode));
const mails = (appels) => appels.filter((a) => a.chemin === '/emails');

test.describe('0.91 - Dépôt d\'un signalement citoyen, de bout en bout', () => {
  const fetchOrigine = globalThis.fetch;
  test.afterEach(() => { globalThis.fetch = fetchOrigine; });

  test('0.91.1 - Dépôt simple : enregistré, email de confirmation, issue a_confirmer', async () => {
    const appels = installerFausseBase();
    const r = await depot(BASE);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, etat: 'a_confirmer' });

    const [insertion] = appelsVers(appels, '/rest/v1/participer_signalements', 'POST');
    expect(insertion.corps[0]).toMatchObject({
      ville: 'test-e2e', reference: 'SIG-0042', category_key: 'voirie', description: 'Nid de poule',
      adresse: '1 rue A', lat: 45.75, lng: 4.85, email: 'habitant@example.org', photo_path: null, appareil_hash: null,
    });
    expect(insertion.corps[0].ip_hash).toMatch(/^[0-9a-f]{24}$/);
    const [mail] = mails(appels);
    expect(mail.corps.to).toEqual(['Habitant@Example.org']);
    expect(JSON.stringify(mail.corps)).toContain('/api/participer/confirm?token=jeton-confirmation');
    expect(appelsVers(appels, '/rest/v1/participer_signalements', 'DELETE')).toHaveLength(0);
  });

  test('0.91.2 - Photo : envoyée dans le compartiment privé, chemin rangé par ville', async () => {
    const appels = installerFausseBase();
    const r = await depot({ ...BASE, photo: PHOTO });
    expect(r.status).toBe(200);
    const upload = appels.find((a) => a.chemin.startsWith('/storage/v1/object/participer-photos/') && a.methode === 'POST');
    expect(upload?.chemin).toMatch(/^\/storage\/v1\/object\/participer-photos\/test-e2e\/[0-9a-f-]{36}\.png$/);
    const [insertion] = appelsVers(appels, '/rest/v1/participer_signalements', 'POST');
    expect(insertion.corps[0].photo_path).toMatch(/^test-e2e\/[0-9a-f-]{36}\.png$/);
  });

  test('0.91.3 - Navigateur reconnu : transmis tout de suite, sans email de confirmation', async () => {
    const appels = installerFausseBase({ compter: (f) => (f.email_confirmed === 'eq.true' ? 1 : 0) });
    const r = await depot({ ...BASE, appareil: APPAREIL });
    expect(await r.json()).toEqual({ ok: true, etat: 'transmis', reference: 'SIG-0042' });
    expect(appelsVers(appels, '/rest/v1/participer_signalements', 'PATCH')).toHaveLength(1);
    expect(appelsVers(appels, '/rest/v1/participer_events', 'POST')).toHaveLength(1);
    // Accusé à l'habitant + alerte à la mairie, pas de lien de confirmation
    expect(mails(appels)).toHaveLength(2);
    expect(JSON.stringify(mails(appels))).not.toContain('participer/confirm');
  });

  test('0.91.4 - Série en cours depuis ce navigateur : rejoint la série, aucun email', async () => {
    const appels = installerFausseBase({
      compter: (f) => (f.email_confirmed === 'eq.false' ? (f.created_at ? 1 : 3) : 0),
    });
    const r = await depot({ ...BASE, appareil: APPAREIL });
    expect(await r.json()).toEqual({ ok: true, etat: 'ajoute', en_attente: 3 });
    expect(mails(appels)).toHaveLength(0);
  });

  test('0.91.5 - Email de confirmation impossible : dépôt et photo effacés, 502', async () => {
    const appels = installerFausseBase({ mailEchoue: true });
    const r = await depot({ ...BASE, photo: PHOTO });
    expect(r.status).toBe(502);
    expect(appelsVers(appels, '/rest/v1/participer_signalements', 'DELETE')).toHaveLength(1);
    expect(appels.some((a) => a.chemin === '/storage/v1/object/participer-photos' && a.methode === 'DELETE')).toBe(true);
  });

  test('0.91.6 - Insertion refusée après l\'envoi de la photo : la photo est effacée, 500', async () => {
    const appels = installerFausseBase({ insertionEchoue: true });
    const r = await depot({ ...BASE, photo: PHOTO });
    expect(r.status).toBe(500);
    expect(appels.some((a) => a.chemin === '/storage/v1/object/participer-photos' && a.methode === 'DELETE')).toBe(true);
    expect(mails(appels)).toHaveLength(0);
  });

  test('0.91.7 - Quotas du jour atteints : 429, rien n\'est enregistré', async () => {
    const appels = installerFausseBase({ reglages: { quota_email_jour: 2 }, compter: (f) => (f.email ? 2 : 0) });
    const r = await depot(BASE);
    expect(r.status).toBe(429);
    expect(appelsVers(appels, '/rest/v1/participer_signalements', 'POST')).toHaveLength(0);
  });

  test('0.91.8 - Module inactif (404), dépôts suspendus (403 avec le message de la ville)', async () => {
    installerFausseBase({ moduleActif: false });
    expect((await depot(BASE)).status).toBe(404);

    installerFausseBase({ reglages: { paused: true, pause_message: 'Reprise lundi' } });
    const r = await depot(BASE);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Reprise lundi' });
  });

  test('0.91.9 - Robot (champ piège rempli) : réponse normale, rien n\'est enregistré', async () => {
    const appels = installerFausseBase();
    const r = await depot({ ...BASE, website: 'http://spam.example' });
    expect(await r.json()).toEqual({ ok: true });
    expect(appels).toHaveLength(0);
  });

  test('0.91.10 - Entrées invalides refusées avant tout accès à la base', async () => {
    const appels = installerFausseBase();
    const cas = [
      [{ ...BASE, ville: 'Ville Invalide!' }, 'Paramètre ville invalide'],
      [{ ...BASE, email: 'pas-un-email' }, 'Adresse e-mail invalide'],
      [{ ...BASE, category_key: 'Voirie !' }, 'Catégorie invalide'],
      [{ ...BASE, lat: 91 }, 'Position invalide'],
      [{ ...BASE, lng: 'x' }, 'Position invalide'],
      [{ ...BASE, appareil: 'pas-un-uuid' }, 'Identifiant de navigateur invalide'],
      [{ ...BASE, photo: 'data:image/gif;base64,AAAA' }, 'Photo invalide'],
    ];
    for (const [corps, erreur] of cas) {
      const r = await depot(corps);
      expect(r.status, erreur).toBe(400);
      expect(await r.json()).toEqual({ error: erreur });
    }
    expect(appels).toHaveLength(0);
  });

  test('0.91.11 - Catégorie inconnue de la ville : 400 après lecture des catégories', async () => {
    installerFausseBase();
    const r = await depot({ ...BASE, category_key: 'eclairage' });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Catégorie inconnue' });
  });
});
