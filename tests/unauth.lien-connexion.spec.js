// @ts-check
import { test, expect } from '@playwright/test';
import { demanderLienConnexion, composerMessageConnexion } from '../netlify/functions/lib/lien-connexion.mjs';
import { lienDeConnexion } from '../supabase/functions/invite-user/inviter.mjs';

/**
 * Liens de connexion qui résistent aux antivirus de messagerie.
 *
 * Bug d'origine (constaté le 17 novembre 2026, Grenoble Alpes Métropole) :
 * l'antivirus de la messagerie visite chaque lien reçu quelques secondes après
 * l'arrivée du mail. Le lien de Supabase ouvrait la session dès cette visite,
 * une seule fois : l'antivirus le consommait, et l'agent tombait sur « lien
 * expiré » à chaque essai. Personne à Grenoble n'a jamais pu se connecter.
 *
 * Désormais le lien mène à /login/ avec le jeton, et la session ne s'ouvre
 * qu'au clic sur « Me connecter ». Les tests 0.98.5 et 0.98.6 jouent la visite
 * d'un antivirus : la page s'affiche, rien n'est échangé.
 *
 * Section : 0.98 - Lien de connexion
 */

const ORIGINE = 'https://openprojets.com';

/** Services en doublure : comptes par adresse, journal des gestes. */
function services({ comptes = {}, reservation = 'reserved', panneJeton = null, envoi = { status: 'envoye' } } = {}) {
  const gestes = [];
  const envois = [];
  return {
    gestes,
    envois,
    s: {
      async reserver(email) { gestes.push(['reserver', email]); return reservation; },
      async trouverCompte(email) { gestes.push(['trouver', email]); return comptes[email] || null; },
      async fabriquerJeton(email, type) {
        gestes.push(['jeton', email, type]);
        if (panneJeton) throw new Error(panneJeton);
        return { jeton: 'h9', type };
      },
      async envoyer(m) { envois.push(m); return envoi; },
    },
  };
}

test.describe('0.98 - Lien de connexion', () => {

  test('0.98.1 - Le lien mène à notre page avec le jeton, jamais à Supabase', async () => {
    expect(lienDeConnexion('https://openprojets.com/login/', { jeton: 'abc', type: 'magiclink' }))
      .toBe('https://openprojets.com/login/?token_hash=abc&type=magiclink');
    // Une adresse de retour qui porterait déjà une requête est nettoyée
    expect(lienDeConnexion('http://localhost:3001/login/?x=1#y', { jeton: 'a b', type: 'invite' }))
      .toBe('http://localhost:3001/login/?token_hash=a+b&type=invite');
    expect(() => lienDeConnexion('https://openprojets.com/login/', { jeton: '', type: 'invite' })).toThrow();
    expect(() => lienDeConnexion('https://openprojets.com/login/', { jeton: 'a', type: 'recovery' })).toThrow();
  });

  test('0.98.2 - Compte confirmé : un jeton de connexion, un message, le lien vers /login/', async () => {
    const { s, gestes, envois } = services({ comptes: { 'agent@metropole.fr': { confirme: true } } });
    const r = await demanderLienConnexion({ email: ' Agent@Metropole.fr ', origine: ORIGINE }, s);
    expect(r).toEqual({ issue: 'envoye' });
    // La réservation passe avant la recherche du compte
    expect(gestes.map((g) => g[0])).toEqual(['reserver', 'trouver', 'jeton']);
    expect(gestes).toContainEqual(['jeton', 'agent@metropole.fr', 'magiclink']);
    expect(envois).toHaveLength(1);
    expect(envois[0].a).toBe('agent@metropole.fr');
    expect(envois[0].texte).toContain('https://openprojets.com/login/?token_hash=h9&type=magiclink');
    expect(envois[0].html).toContain('href="https://openprojets.com/login/?token_hash=h9&amp;type=magiclink"');
    expect(envois[0].texte).not.toContain('supabase.co');
    expect(envois[0].texte).toContain('« Me connecter »');
  });

  test('0.98.3 - Compte jamais confirmé : un jeton d\'invitation', async () => {
    const { s, gestes } = services({ comptes: { 'a@b.fr': { confirme: false } } });
    expect(await demanderLienConnexion({ email: 'a@b.fr', origine: ORIGINE }, s)).toEqual({ issue: 'envoye' });
    expect(gestes).toContainEqual(['jeton', 'a@b.fr', 'invite']);
  });

  test('0.98.4 - Adresse inconnue, plafond, panne : rien ne part, l\'issue le dit', async () => {
    let t = services();
    expect(await demanderLienConnexion({ email: 'inconnu@x.fr', origine: ORIGINE }, t.s)).toEqual({ issue: 'inconnu' });
    expect(t.envois).toHaveLength(0);

    for (const reservation of ['recipient', 'ip', 'total']) {
      t = services({ comptes: { 'a@b.fr': { confirme: true } }, reservation });
      expect(await demanderLienConnexion({ email: 'a@b.fr', origine: ORIGINE }, t.s)).toEqual({ issue: 'plafond' });
      // Au plafond, on ne cherche même pas le compte
      expect(t.gestes.map((g) => g[0])).toEqual(['reserver']);
    }

    // Base des plafonds injoignable : le lien part quand même
    t = services({ comptes: { 'a@b.fr': { confirme: true } }, reservation: 'unavailable' });
    expect((await demanderLienConnexion({ email: 'a@b.fr', origine: ORIGINE }, t.s)).issue).toBe('envoye');

    t = services({ comptes: { 'a@b.fr': { confirme: true } }, panneJeton: 'boom' });
    expect((await demanderLienConnexion({ email: 'a@b.fr', origine: ORIGINE }, t.s)).issue).toBe('echec');
    expect(t.envois).toHaveLength(0);

    t = services({ comptes: { 'a@b.fr': { confirme: true } }, envoi: { status: 'non_configure' } });
    expect((await demanderLienConnexion({ email: 'a@b.fr', origine: ORIGINE }, t.s)).issue).toBe('echec');

    t = services();
    expect(await demanderLienConnexion({ email: 'pas-une-adresse', origine: ORIGINE }, t.s)).toEqual({ issue: 'invalide' });
    expect(t.gestes).toHaveLength(0);

    // Un domaine qui n'est pas le nôtre ne peut pas détourner le lien
    t = services({ comptes: { 'a@b.fr': { confirme: true } } });
    await demanderLienConnexion({ email: 'a@b.fr', origine: 'https://site-piege.fr' }, t.s);
    expect(t.envois[0].texte).toContain('https://openprojets.com/login/?token_hash=');

    const m = composerMessageConnexion({ lien: 'https://openprojets.com/login/?token_hash=x&type=magiclink', connexion: 'https://openprojets.com/login/' });
    expect(m.texte + m.html + m.objet).not.toMatch(/[–—―]/);
  });

  /** Compte les échanges de jeton envoyés à Supabase, et répond à leur place. */
  async function surveillerVerify(page, reponse) {
    const appels = [];
    await page.route(/\/auth\/v1\/verify/, async (route) => {
      appels.push(route.request().postDataJSON?.() || {});
      await route.fulfill(reponse);
    });
    return appels;
  }

  test('0.98.5 - Non-régression du 17/11 : visiter le lien n\'échange pas le jeton', async ({ page }) => {
    const appels = await surveillerVerify(page, { status: 403, contentType: 'application/json', body: '{"code":403,"error_code":"otp_expired","msg":"Email link is invalid or has expired"}' });
    // La visite d'un antivirus : la page se charge, scripts compris, sans clic
    await page.goto('/login/?token_hash=h-antivirus&type=magiclink', { waitUntil: 'networkidle' });
    await expect(page.locator('#confirm-btn')).toBeVisible();
    await expect(page.locator('#email-form')).toBeHidden();
    await page.waitForTimeout(1500);
    expect(appels).toHaveLength(0);
  });

  test('0.98.6 - Le clic sur « Me connecter » échange le jeton, une seule fois', async ({ page }) => {
    const appels = await surveillerVerify(page, { status: 403, contentType: 'application/json', body: '{"code":403,"error_code":"otp_expired","msg":"Email link is invalid or has expired"}' });
    await page.goto('/login/?token_hash=h-agent&type=invite', { waitUntil: 'domcontentloaded' });
    await page.locator('#confirm-btn').click();
    await expect(page.locator('#status')).toContainText('déjà servi ou a expiré');
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatchObject({ token_hash: 'h-agent', type: 'invite' });
    // Le jeton quitte l'adresse, le formulaire revient pour en demander un autre
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('#email-form')).toBeVisible();
    await expect(page.locator('#link-confirm')).toBeHidden();
  });

  test('0.98.7 - Un type de lien inconnu laisse la page de connexion telle quelle', async ({ page }) => {
    await page.goto('/login/?token_hash=x&type=recovery', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email-form')).toBeVisible();
    await expect(page.locator('#link-confirm')).toBeHidden();
  });

  test('0.98.8 - Demander un lien passe par notre fonction, chaque issue a sa phrase', async ({ page }) => {
    let issue = 'envoye';
    const corps = [];
    await page.route('**/api/lien-connexion', async (route) => {
      corps.push(route.request().postDataJSON());
      const statut = { envoye: 200, inconnu: 404, plafond: 429, echec: 502 }[issue];
      await route.fulfill({ status: statut, contentType: 'application/json', body: JSON.stringify({ issue }) });
    });
    let otp = 0;
    await page.route(/\/auth\/v1\/otp/, (route) => { otp += 1; return route.abort(); });

    const attendus = {
      envoye: 'cliquez sur « Me connecter »',
      inconnu: 'Aucun compte ne porte cette adresse',
      plafond: 'Trop de liens demandés',
      echec: "Le lien n'a pas pu partir",
    };
    for (const [cas, phrase] of Object.entries(attendus)) {
      issue = cas;
      await page.goto('/login/', { waitUntil: 'domcontentloaded' });
      await page.fill('#email-input', 'agent@metropole.fr');
      await page.locator('#magic-btn').click();
      await expect(page.locator('#status')).toContainText(phrase);
    }
    expect(corps.every((c) => c.email === 'agent@metropole.fr')).toBe(true);
    // Supabase n'envoie plus rien lui-même
    expect(otp).toBe(0);
  });
});
