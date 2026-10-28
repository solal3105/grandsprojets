// @ts-check
import { test, expect } from '@playwright/test';
import submit from '../netlify/functions/participer-submit.mjs';
import confirm from '../netlify/functions/participer-confirm.mjs';
import { SITE, suiviUrlOf, transmettreDepots } from '../netlify/functions/lib/participer-common.mjs';
import {
  sitesAutorises, villesDuSite, siteDeLaVille, retourDuSite,
} from '../netlify/functions/lib/participer-sites.mjs';

/**
 * Module Participer - dépôt d'un signalement depuis le site d'une collectivité.
 *
 * Ni navigateur ni serveur : les fonctions sont importées directement et
 * `fetch` est remplacé par une base et un fournisseur d'email simulés. AUCUNE
 * ligne n'est écrite et AUCUN message ne part pendant ces tests.
 *
 * Ce qui compte :
 *  - une origine de site n'est acceptée que pour la ville à laquelle
 *    PARTICIPER_ORIGINES_SITES la rattache, et le refus tombe avant tout
 *    appel à la base ;
 *  - les motifs `*` ne valent qu'en développement local ;
 *  - l'adresse de retour ne peut désigner qu'une page d'un site de la ville
 *    (pas de redirection ouverte), et c'est elle que suivent l'accusé et la
 *    redirection de confirmation ;
 *  - les garde-fous existants (piège à robots, validation) restent devant.
 *
 * Section : 16.3
 */

const VILLE = 'pays-ozon';
const SITE_OZON = 'https://www.pays-ozon.fr';
const RETOUR = `${SITE_OZON}/signaler/suivi`;
const ORIGINES = `${VILLE}=${SITE_OZON},saint-symphorien=https://www.saint-symphorien.fr`;
const JETON_SUIVI = '6f1c2d3e-4b5a-4c6d-8e7f-901234567890';
const JETON_CONFIRM = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';

const VARIABLES = ['PARTICIPER_ORIGINES_SITES', 'NETLIFY_DEV', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY'];
const envReel = Object.fromEntries(VARIABLES.map((k) => [k, process.env[k]]));
const fetchReel = globalThis.fetch;

test.beforeEach(() => {
  process.env.PARTICIPER_ORIGINES_SITES = ORIGINES;
  delete process.env.NETLIFY_DEV;
  delete process.env.BREVO_API_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-service-de-test';
  process.env.RESEND_API_KEY = 'cle-de-test';
  // Tout appel non prévu par un test le fait échouer
  globalThis.fetch = async (url) => { throw new Error(`appel réseau inattendu : ${url}`); };
});

test.afterEach(() => {
  globalThis.fetch = fetchReel;
  for (const [k, v] of Object.entries(envReel)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/**
 * Base et fournisseur d'email simulés. Rend la liste des appels, corps décodé.
 * `lignes` : la ligne de participer_signalements que rendent les lectures et
 * la mise à jour de transmission.
 */
function simuler({ lignes = [] } = {}) {
  const appels = [];
  const json = (corps, init = {}) => new Response(JSON.stringify(corps), {
    status: 200, ...init, headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const methode = init.method || 'GET';
    const corps = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    appels.push({ url: u, methode, corps });
    if (u.hostname === 'api.resend.com') return json({ id: 'faux' });
    const table = u.pathname.replace('/rest/v1/', '');
    if (table === 'city_modules') return json([{ enabled: true }]);
    if (table === 'participer_settings') return json([{ notify_email: null }]);
    if (table === 'participer_categories') return json([{ category_key: 'voirie', label: 'Voirie' }]);
    if (table === 'rpc/participer_next_reference') return json('OZO-2026-0001');
    if (table === 'participer_events') return json([]);
    if (table === 'participer_signalements') {
      if (methode === 'POST') return json([{ ...corps[0], reference: 'OZO-2026-0001', confirm_token: JETON_CONFIRM }]);
      if (methode === 'PATCH') return json(lignes);
      if (init.headers?.Prefer === 'count=exact') return json([], { headers: { 'content-range': '*/0' } });
      return json(lignes);
    }
    throw new Error(`appel réseau inattendu : ${url}`);
  };
  return appels;
}

function depot(corps, origine = SITE_OZON) {
  return new Request('https://openprojets.com/api/participer/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origine ? { Origin: origine } : {}) },
    body: JSON.stringify({
      ville: VILLE, email: 'habitant@example.org', category_key: 'voirie', lat: 45.67, lng: 4.95, ...corps,
    }),
  });
}

const contexte = { ip: '203.0.113.7' };

test.describe('16.3 Participer - dépôt depuis le site d\'une collectivité', () => {

  test('16.3.1 la liste rattache chaque origine à sa ville et ignore les entrées mal écrites', () => {
    process.env.PARTICIPER_ORIGINES_SITES = `${ORIGINES}, sans-adresse, Ville Fausse=https://x.fr, ozon=https://a.fr/chemin, ozon=http://non-chiffre.fr`;
    const sites = sitesAutorises();
    expect(sites.map((s) => `${s.ville}=${s.origine}`)).toEqual([
      `${VILLE}=${SITE_OZON}`,
      'saint-symphorien=https://www.saint-symphorien.fr',
    ]);
    expect([...villesDuSite(SITE_OZON)]).toEqual([VILLE]);
    expect(siteDeLaVille(SITE_OZON, 'saint-symphorien')).toBe(false);
    expect(villesDuSite('https://pays-ozon.fr').size).toBe(0);
  });

  test('16.3.2 les motifs et la ville * ne valent qu\'en développement local', () => {
    process.env.PARTICIPER_ORIGINES_SITES = '*=http://*.localhost:3000';
    expect(sitesAutorises()).toEqual([]);
    expect(siteDeLaVille('http://pays-ozon.localhost:3000', VILLE)).toBe(false);

    process.env.NETLIFY_DEV = 'true';
    expect(siteDeLaVille('http://pays-ozon.localhost:3000', VILLE)).toBe(true);
    // Un seul niveau de sous-domaine, le même port et le même schéma
    expect(siteDeLaVille('http://a.b.localhost:3000', VILLE)).toBe(false);
    expect(siteDeLaVille('http://pays-ozon.localhost:3001', VILLE)).toBe(false);
    expect(siteDeLaVille('https://pays-ozon.localhost:3000', VILLE)).toBe(false);
    expect(siteDeLaVille('http://localhost:3000', VILLE)).toBe(false);
  });

  test('16.3.3 le préflight répond à l\'origine d\'un site autorisé, pas à une autre', async () => {
    const preflight = (origine) => submit(new Request('https://openprojets.com/api/participer/submit', {
      method: 'OPTIONS', headers: { Origin: origine },
    }), contexte);
    const ok = await preflight(SITE_OZON);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE_OZON);
    expect(ok.headers.get('vary')).toBe('Origin');

    const inconnu = await preflight('https://www.site-inconnu.fr');
    expect(inconnu.headers.get('access-control-allow-origin')).toBe('https://openprojets.com');
  });

  test('16.3.4 un site ne dépose pas dans une autre ville, et la base n\'est pas appelée', async () => {
    const r = await submit(depot({ ville: 'saint-symphorien' }), contexte);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toContain('rattaché');
  });

  test('16.3.5 une adresse de retour hors des sites de la ville est refusée', async () => {
    for (const retour of [
      'https://www.saint-symphorien.fr/suivi',
      'https://evil.example/suivi',
      'javascript:alert(1)',
      `https://moi:secret@www.pays-ozon.fr/suivi`,
      `${SITE_OZON}/${'a'.repeat(500)}`,
    ]) {
      const r = await submit(depot({ retour }), contexte);
      expect(r.status, retour).toBe(400);
      expect((await r.json()).error).toContain('retour');
    }
  });

  test('16.3.6 le piège à robots reste devant, même depuis un site', async () => {
    const r = await submit(depot({ website: 'http://spam.example', ville: 'saint-symphorien' }), contexte);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  test('16.3.7 le dépôt garde la page de retour et compte l\'IP du visiteur', async () => {
    const appels = simuler();
    const r = await submit(depot({ retour: `${RETOUR}?onglet=suivi#haut` }), contexte);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, etat: 'a_confirmer' });
    expect(r.headers.get('access-control-allow-origin')).toBe(SITE_OZON);

    const insertion = appels.find((a) => a.methode === 'POST' && a.url.pathname.endsWith('/participer_signalements'));
    expect(insertion?.corps[0].retour_url).toBe(`${RETOUR}?onglet=suivi`);
    expect(insertion?.corps[0].ip_hash).toMatch(/^[0-9a-f]{24}$/);

    // Le lien de confirmation passe toujours par notre serveur
    const mail = appels.find((a) => a.url.hostname === 'api.resend.com');
    expect(mail?.corps.text).toContain(`${SITE}/api/participer/confirm?token=${JETON_CONFIRM}`);
  });

  test('16.3.8 l\'accusé mène à la page du site, ou à la carte si le site a été retiré', async () => {
    const ligne = {
      id: 'a', ville: VILLE, reference: 'OZO-2026-0001', category_key: 'voirie', adresse: null,
      suivi_token: JETON_SUIVI, retour_url: RETOUR, created_at: '2026-10-29T10:00:00Z',
    };
    let appels = simuler({ lignes: [ligne] });
    await transmettreDepots({ id: 'a', ville: VILLE, email: 'habitant@example.org' }, { settings: {} });
    let mail = appels.find((a) => a.url.hostname === 'api.resend.com');
    expect(mail?.corps.text).toContain(`${RETOUR}?participer_suivi=${JETON_SUIVI}`);

    process.env.PARTICIPER_ORIGINES_SITES = 'saint-symphorien=https://www.saint-symphorien.fr';
    appels = simuler({ lignes: [ligne] });
    await transmettreDepots({ id: 'a', ville: VILLE, email: 'habitant@example.org' }, { settings: {} });
    mail = appels.find((a) => a.url.hostname === 'api.resend.com');
    expect(mail?.corps.text).toContain(`${SITE}/ville/${VILLE}/participer?participer_suivi=${JETON_SUIVI}`);
    expect(mail?.corps.text).not.toContain(SITE_OZON);
  });

  test('16.3.9 le lien de confirmation ramène sur la page du site', async () => {
    simuler({
      lignes: [{
        id: 'a', ville: VILLE, email: 'habitant@example.org', email_confirmed: true,
        suivi_token: JETON_SUIVI, appareil_hash: null, retour_url: RETOUR,
      }],
    });
    const r = await confirm(new Request(`https://openprojets.com/api/participer/confirm?token=${JETON_CONFIRM}`));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe(`${RETOUR}?participer_suivi=${JETON_SUIVI}`);
  });

  test('16.3.10 sans retour, les liens restent ceux de la carte', () => {
    expect(suiviUrlOf(VILLE, JETON_SUIVI)).toBe(`${SITE}/ville/${VILLE}/participer?participer_suivi=${JETON_SUIVI}`);
    expect(retourDuSite('', VILLE)).toBeNull();
  });
});
