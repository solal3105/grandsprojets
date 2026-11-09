// @ts-check
import { test, expect } from '@playwright/test';
import { inviter, composerMessage, adresseDeRetour, villesDuProfil, RefusInvitation } from '../supabase/functions/invite-user/inviter.mjs';

/**
 * Invitation d'un utilisateur depuis la console (fonction Supabase invite-user).
 *
 * Le cœur de la fonction est importé tel quel, avec un annuaire et un facteur
 * en doublure : aucun compte n'est créé, aucun e-mail ne part. Chaque branche
 * est jouée, et surtout chaque échec.
 *
 * Bug d'origine (3 novembre 2026, Grenoble Alpes Métropole) : la fonction
 * créait le compte, échouait à envoyer le lien, puis répondait 200. La
 * console affichait « Invitation envoyée » et personne n'a rien reçu. Les
 * tests 0.92.4 à 0.92.7 rejouent ce scénario sous toutes ses formes : un
 * échec d'envoi doit TOUJOURS remonter en erreur.
 *
 * Section : 0.92 - Invitation des utilisateurs
 */

const ADMIN_GRENOBLE = { id: 'a1', role: 'admin', villes: ['grenoble'] };
const DOMAINES = ['openprojets.com', 'grandsprojets.com'];
const BASE = { appelant: ADMIN_GRENOBLE, email: 'Agent@Metropole.fr ', ville: 'grenoble', role: 'admin', origine: 'https://openprojets.com' };

/** Annuaire en mémoire : comptes par adresse, et journal des gestes. */
function annuaireFactice(comptes = {}, pannes = {}) {
  const gestes = [];
  const profils = {};
  const annuaire = {
    async trouverCompte(email) { gestes.push(['trouver', email]); return comptes[email] || null; },
    async lienInvitation(email, retour) {
      gestes.push(['lienInvitation', email, retour]);
      if (pannes.lienInvitation) throw new Error(pannes.lienInvitation);
      return { id: 'nouveau', lien: 'https://auth.exemple/verify?token=t1' };
    },
    async lienConnexion(email, retour, compte) {
      gestes.push(['lienConnexion', email, retour, compte.confirme]);
      if (pannes.lienConnexion) throw new Error(pannes.lienConnexion);
      return { lien: 'https://auth.exemple/verify?token=t2' };
    },
    async enregistrerProfil(id, profil) {
      gestes.push(['profil', id, profil]);
      if (pannes.profil) throw new Error(pannes.profil);
      profils[id] = profil;
    },
    async supprimerCompte(id) { gestes.push(['supprimer', id]); },
    async nomEspace(ville) { return ville === 'grenoble' ? 'Grenoble Alpes Métropole' : null; },
  };
  return { annuaire, gestes, profils };
}

/** Facteur factice : garde les messages, ou échoue comme Supabase le 3/11. */
function facteurFactice(panne) {
  const envois = [];
  const facteur = async (m) => {
    if (panne) throw new Error(panne);
    envois.push(m);
    return { id: `resend-${envois.length}` };
  };
  return { facteur, envois };
}

test.describe('0.92 - Invitation des utilisateurs', () => {

  test('0.92.1 - Nouvelle adresse : compte créé, profil posé, e-mail parti avec le lien', async () => {
    const { annuaire, gestes, profils } = annuaireFactice();
    const { facteur, envois } = facteurFactice();
    const r = await inviter(BASE, { annuaire, facteur, domaines: DOMAINES });

    expect(r).toEqual({ statut: 'invite', email: 'agent@metropole.fr', role: 'admin', envoi: { id: 'resend-1' } });
    expect(profils.nouveau).toEqual({ role: 'admin', ville: ['grenoble'] });
    expect(gestes).toContainEqual(['lienInvitation', 'agent@metropole.fr', 'https://openprojets.com/login/']);
    expect(envois).toHaveLength(1);
    expect(envois[0].a).toBe('agent@metropole.fr');
    expect(envois[0].objet).toBe('Invitation à rejoindre Grenoble Alpes Métropole sur Open Projets');
    expect(envois[0].texte).toContain('https://auth.exemple/verify?token=t1');
    expect(envois[0].html).toContain('href="https://auth.exemple/verify?token=t1"');
    expect(envois[0].texte).toContain('accès administrateur');
  });

  test('0.92.2 - Compte jamais ouvert : relance avec un lien neuf, rôle existant gardé', async () => {
    const compte = { id: 'c1', confirme: false, aDejaUtiliseSonCompte: false, profil: { role: 'invited', ville: ['grenoble'] } };
    const { annuaire, gestes } = annuaireFactice({ 'agent@metropole.fr': compte });
    const { facteur, envois } = facteurFactice();
    const r = await inviter(BASE, { annuaire, facteur, domaines: DOMAINES });

    expect(r.statut).toBe('relance');
    expect(r.role).toBe('invited');
    expect(r.roleDemande).toBe('admin');
    expect(gestes.find((g) => g[0] === 'lienInvitation')).toBeUndefined();
    expect(gestes).toContainEqual(['lienConnexion', 'agent@metropole.fr', 'https://openprojets.com/login/', false]);
    expect(gestes.find((g) => g[0] === 'profil')).toBeUndefined();
    expect(envois[0].objet).toBe('Votre accès à Grenoble Alpes Métropole sur Open Projets');
    expect(envois[0].texte).toContain('accès contributeur');
  });

  test('0.92.3 - Compte déjà utilisé : espace ajouté sans e-mail, ou déjà membre', async () => {
    const compte = { id: 'c2', confirme: true, aDejaUtiliseSonCompte: true, profil: { role: 'invited', ville: ['lyon'] } };
    const { annuaire, profils } = annuaireFactice({ 'agent@metropole.fr': compte });
    const { facteur, envois } = facteurFactice();
    const r = await inviter(BASE, { annuaire, facteur, domaines: DOMAINES });
    expect(r.statut).toBe('ajoute');
    expect(profils.c2).toEqual({ role: 'invited', ville: ['lyon', 'grenoble'] });
    expect(envois).toHaveLength(0);

    const membre = { ...compte, profil: { role: 'admin', ville: ['grenoble'] } };
    const deux = annuaireFactice({ 'agent@metropole.fr': membre });
    const r2 = await inviter(BASE, { annuaire: deux.annuaire, facteur, domaines: DOMAINES });
    expect(r2.statut).toBe('deja-membre');
    expect(deux.gestes.find((g) => g[0] === 'profil')).toBeUndefined();
  });

  test('0.92.4 - Non-régression du 3/11 : envoi refusé = erreur, et le compte créé est retiré', async () => {
    const { annuaire, gestes } = annuaireFactice();
    const { facteur } = facteurFactice('Signups not allowed for this instance');
    const erreur = await inviter(BASE, { annuaire, facteur, domaines: DOMAINES }).catch((e) => e);

    expect(erreur).toBeInstanceOf(RefusInvitation);
    expect(erreur.statut).toBe(502);
    expect(erreur.message).toContain("n'a pas pu partir");
    expect(erreur.detail).toBe('Signups not allowed for this instance');
    expect(gestes).toContainEqual(['supprimer', 'nouveau']);
  });

  test('0.92.5 - Lien d\'invitation impossible à créer = erreur, aucun e-mail', async () => {
    const { annuaire } = annuaireFactice({}, { lienInvitation: 'Signups not allowed for this instance' });
    const { facteur, envois } = facteurFactice();
    const erreur = await inviter(BASE, { annuaire, facteur, domaines: DOMAINES }).catch((e) => e);
    expect(erreur).toBeInstanceOf(RefusInvitation);
    expect(erreur.statut).toBe(502);
    expect(envois).toHaveLength(0);
  });

  test('0.92.6 - Profil impossible à enregistrer = erreur, compte retiré, aucun e-mail', async () => {
    const { annuaire, gestes } = annuaireFactice({}, { profil: 'permission denied' });
    const { facteur, envois } = facteurFactice();
    const erreur = await inviter(BASE, { annuaire, facteur, domaines: DOMAINES }).catch((e) => e);
    expect(erreur).toBeInstanceOf(RefusInvitation);
    expect(envois).toHaveLength(0);
    expect(gestes).toContainEqual(['supprimer', 'nouveau']);
  });

  test('0.92.7 - Relance : lien ou envoi en panne = erreur, le compte existant n\'est pas supprimé', async () => {
    const compte = { id: 'c1', confirme: true, aDejaUtiliseSonCompte: false, profil: { role: 'admin', ville: ['grenoble'] } };
    for (const [pannesAnnuaire, panneFacteur] of [[{ lienConnexion: 'boom' }, null], [{}, 'Resend 403']]) {
      const { annuaire, gestes } = annuaireFactice({ 'agent@metropole.fr': compte }, pannesAnnuaire);
      const { facteur } = facteurFactice(panneFacteur);
      const erreur = await inviter(BASE, { annuaire, facteur, domaines: DOMAINES }).catch((e) => e);
      expect(erreur).toBeInstanceOf(RefusInvitation);
      expect(erreur.statut).toBe(502);
      expect(gestes.find((g) => g[0] === 'supprimer')).toBeUndefined();
    }
  });

  test('0.92.8 - Droits : contributeur, admin d\'un autre espace, entrées invalides', async () => {
    const { annuaire, gestes } = annuaireFactice();
    const { facteur } = facteurFactice();
    const deps = { annuaire, facteur, domaines: DOMAINES };
    const cas = [
      [{ ...BASE, appelant: { id: 'x', role: 'invited', villes: ['grenoble'] } }, 403],
      [{ ...BASE, appelant: null }, 403],
      [{ ...BASE, appelant: { id: 'x', role: 'admin', villes: ['lyon'] } }, 403],
      [{ ...BASE, email: 'pas-une-adresse' }, 400],
      [{ ...BASE, role: 'superadmin' }, 400],
      [{ ...BASE, ville: 'global' }, 400],
      [{ ...BASE, ville: 'gre noble' }, 400],
    ];
    for (const [entree, statut] of cas) {
      const erreur = await inviter(entree, deps).catch((e) => e);
      expect(erreur, JSON.stringify(entree)).toBeInstanceOf(RefusInvitation);
      expect(erreur.statut).toBe(statut);
    }
    // Aucun refus n'a touché à l'annuaire
    expect(gestes).toHaveLength(0);

    // Un administrateur global invite partout
    const r = await inviter({ ...BASE, appelant: { id: 'g', role: 'admin', villes: '{global}' } }, deps);
    expect(r.statut).toBe('invite');
  });

  test('0.92.9 - Adresse de retour : nos domaines et le poste local seulement', async () => {
    expect(adresseDeRetour('https://grandsprojets.com', DOMAINES)).toBe('https://grandsprojets.com/login/');
    expect(adresseDeRetour('http://localhost:3001', DOMAINES)).toBe('http://localhost:3001/login/');
    expect(adresseDeRetour('https://site-piege.fr', DOMAINES)).toBe('https://openprojets.com/login/');
    expect(adresseDeRetour('', DOMAINES)).toBe('https://openprojets.com/login/');
  });

  test('0.92.10 - Message : sans tiret long, lien échappé dans le HTML, villes lues sous toutes leurs formes', async () => {
    const m = composerMessage({ type: 'invitation', espace: 'A & B', role: 'invited', lien: 'https://x/?a=1&b="2"', connexion: 'https://openprojets.com/login/' });
    expect(m.texte + m.html + m.objet).not.toMatch(/[\u2013\u2014\u2015]/);
    expect(m.html).toContain('A &amp; B');
    expect(m.html).toContain('href="https://x/?a=1&amp;b=&quot;2&quot;"');
    expect(villesDuProfil('{grenoble,lyon}')).toEqual(['grenoble', 'lyon']);
    expect(villesDuProfil(['lyon'])).toEqual(['lyon']);
    expect(villesDuProfil(null)).toEqual([]);
  });
});
