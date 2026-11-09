/* ============================================================================
   INVITATION D'UN UTILISATEUR DANS UN ESPACE (console d'administration)

   Le cœur de la fonction Supabase « invite-user », sans réseau ni Supabase :
   index.ts lui passe un « annuaire » (les appels d'administration Auth et la
   table profiles) et un « facteur » (l'envoi d'e-mail). La suite Playwright
   importe ce fichier tel quel et lui donne des doublures, pour jouer chaque
   cas d'échec sans créer de compte ni envoyer de message.

   La règle qui gouverne tout le fichier : une invitation n'est réussie que si
   l'e-mail est parti. Le 3 novembre 2026, l'ancienne fonction créait le
   compte, échouait à envoyer le lien (« Signups not allowed for this
   instance ») puis répondait 200 : la console affichait « Invitation
   envoyée » et les deux agents de Grenoble Alpes Métropole n'ont jamais rien
   reçu. Ici, chaque échec remonte avec un statut d'erreur et une phrase
   lisible, et un compte créé pour une invitation qui n'a pas pu partir est
   supprimé : un nouvel essai repart de zéro.

   Trois situations, selon le compte qui porte déjà l'adresse :
   - aucun compte : un lien d'invitation est fabriqué (le compte naît avec),
     le profil reçoit le rôle et l'espace demandés, l'e-mail part ;
   - un compte jamais utilisé (aucune connexion) : c'est une relance, un lien
     de connexion neuf part, l'espace est ajouté au profil s'il manque ;
   - un compte déjà utilisé : l'espace est ajouté au profil s'il manque, aucun
     e-mail (la personne se connecte comme d'habitude).
   Le rôle d'un compte existant n'est jamais changé ici : un profil porte un
   seul rôle pour tous ses espaces, et le changer est le geste explicite du
   bouton « Promouvoir » de la console.
   ============================================================================ */

export const ROLES = ['admin', 'invited'];
const ROLE_LIBELLE = { admin: 'administrateur', invited: 'contributeur' };
const VILLE_VALIDE = /^[a-z0-9-]+$/i;
const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Erreur dont le message est montré tel quel dans la console. */
export class RefusInvitation extends Error {
  constructor(statut, message, detail) {
    super(message);
    this.statut = statut;
    if (detail) this.detail = detail;
  }
}

const normaliserEmail = (email) => String(email || '').trim().toLowerCase();

/** Liste des villes d'un profil, quelle que soit sa forme en base (tableau ou texte). */
export function villesDuProfil(ville) {
  if (Array.isArray(ville)) return ville.filter(Boolean);
  if (typeof ville === 'string' && ville.trim()) {
    const brut = ville.trim();
    if (brut.startsWith('{') || brut.startsWith('[')) {
      return brut.replace(/^[{[]|[}\]]$/g, '').split(',').map((v) => v.replace(/"/g, '').trim()).filter(Boolean);
    }
    return [brut];
  }
  return [];
}

/**
 * Adresse de retour du lien : la page de connexion du domaine d'où l'on invite,
 * si ce domaine est l'un des nôtres. Sinon, celle du domaine principal.
 */
export function adresseDeRetour(origine, domainesAutorises) {
  const principal = `https://${domainesAutorises[0]}/login/`;
  try {
    const url = new URL(origine);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (local || domainesAutorises.includes(url.hostname)) return `${url.origin}/login/`;
  } catch { /* origine absente ou illisible : domaine principal */ }
  return principal;
}

/**
 * Le message d'invitation ou de relance, en texte et en HTML.
 * `lien` est le lien d'activation à usage unique fabriqué par Supabase Auth.
 */
export function composerMessage({ type, espace, role, lien, connexion }) {
  const libelle = ROLE_LIBELLE[role] || 'contributeur';
  const objet = type === 'relance'
    ? `Votre accès à ${espace} sur Open Projets`
    : `Invitation à rejoindre ${espace} sur Open Projets`;
  const intro = type === 'relance'
    ? `Voici un nouveau lien pour ouvrir votre accès ${libelle} à l'espace ${espace} sur Open Projets.`
    : `Vous êtes invité à rejoindre l'espace ${espace} sur Open Projets, avec un accès ${libelle}.`;
  const lignes = [
    'Bonjour,',
    '',
    intro,
    '',
    `Ouvrez ce lien pour activer votre accès : ${lien}`,
    '',
    "Ce lien est personnel et ne sert qu'une fois. Par la suite, vous vous connecterez avec votre adresse e-mail sur "
      + `${connexion}, sans mot de passe : un lien de connexion vous sera envoyé à chaque fois.`,
    '',
    "Si vous ne vous attendiez pas à ce message, vous pouvez l'ignorer.",
    '',
    "L'équipe Open Projets",
  ];
  const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p = (t) => `<p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">${t}</p>`;
  const html = [
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#f9fafb;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;">',
    p('Bonjour,'),
    p(echapper(intro)),
    `<p style="margin:0 0 20px;"><a href="${echapper(lien)}" style="display:inline-block;padding:12px 22px;background:#FF0037;color:#ffffff;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Activer mon accès</a></p>`,
    p(echapper("Ce lien est personnel et ne sert qu'une fois. Par la suite, vous vous connecterez avec votre adresse e-mail sur ")
      + `<a href="${echapper(connexion)}" style="color:#FF0037;">${echapper(connexion.replace(/^https?:\/\//, ''))}</a>`
      + echapper(', sans mot de passe : un lien de connexion vous sera envoyé à chaque fois.')),
    p(echapper("Si vous ne vous attendiez pas à ce message, vous pouvez l'ignorer.")),
    p(echapper("L'équipe Open Projets")),
    '</div></body></html>',
  ].join('');
  return { objet, texte: lignes.join('\n'), html };
}

/**
 * Invite `email` dans l'espace `ville` avec le rôle `role`, à la demande de
 * `appelant` ({ id, role, villes }).
 *
 * annuaire : {
 *   trouverCompte(email) -> { id, confirme, aDejaUtiliseSonCompte, profil: { role, ville } } | null
 *   lienInvitation(email, retour) -> { id, lien }   (crée le compte)
 *   lienConnexion(email, retour, compte) -> { lien } (compte existant, jamais ouvert)
 *   enregistrerProfil(id, { role, ville })
 *   supprimerCompte(id)
 *   nomEspace(ville) -> string | null
 * }
 * facteur : ({ a, objet, texte, html }) -> { id }   (lève une erreur si l'envoi échoue)
 *
 * Rend { statut, ... } : 'invite' ou 'relance' (e-mail parti, avec envoi.id),
 * 'ajoute' (espace ajouté sans e-mail), 'deja-membre'. Lève RefusInvitation sinon.
 */
export async function inviter({ appelant, email, ville, role, origine }, { annuaire, facteur, domaines }) {
  const adresse = normaliserEmail(email);
  if (!EMAIL_VALIDE.test(adresse)) throw new RefusInvitation(400, "L'adresse e-mail n'est pas valide.");
  if (!ROLES.includes(role)) throw new RefusInvitation(400, 'Le rôle demandé est inconnu.');
  if (!VILLE_VALIDE.test(String(ville || '')) || ville === 'global') throw new RefusInvitation(400, "L'espace demandé n'est pas valide.");

  if (!appelant || appelant.role !== 'admin') {
    throw new RefusInvitation(403, 'Seul un administrateur peut inviter quelqu\'un.');
  }
  const villesAppelant = villesDuProfil(appelant.villes);
  if (!villesAppelant.includes('global') && !villesAppelant.includes(ville)) {
    throw new RefusInvitation(403, `Vous n'administrez pas l'espace ${ville}.`);
  }

  const retour = adresseDeRetour(origine, domaines);
  const espace = (await annuaire.nomEspace(ville)) || ville;
  const connexion = retour;

  const existant = await annuaire.trouverCompte(adresse);

  if (!existant) {
    let compte;
    try {
      compte = await annuaire.lienInvitation(adresse, retour);
    } catch (e) {
      throw new RefusInvitation(502, "Le lien d'invitation n'a pas pu être créé. Aucun compte n'a été ouvert.", e.message);
    }
    try {
      await annuaire.enregistrerProfil(compte.id, { role, ville: [ville] });
      const message = composerMessage({ type: 'invitation', espace, role, lien: compte.lien, connexion });
      const envoi = await facteur({ a: adresse, ...message });
      return { statut: 'invite', email: adresse, role, envoi: { id: envoi?.id || null } };
    } catch (e) {
      // Pas de compte fantôme : sans e-mail, personne ne pourrait l'ouvrir, et
      // il bloquerait une nouvelle invitation à la même adresse.
      await annuaire.supprimerCompte(compte.id).catch(() => {});
      throw new RefusInvitation(502, `L'e-mail d'invitation n'a pas pu partir. Aucun compte n'a été ouvert, vous pouvez réessayer.`, e.message);
    }
  }

  const villes = villesDuProfil(existant.profil?.ville);
  const manque = !villes.includes(ville) && !villes.includes('global');
  const roleActuel = existant.profil?.role || 'invited';
  if (manque) {
    try {
      await annuaire.enregistrerProfil(existant.id, { role: roleActuel, ville: [...villes, ville] });
    } catch (e) {
      throw new RefusInvitation(502, "L'espace n'a pas pu être ajouté à ce compte.", e.message);
    }
  }

  if (existant.aDejaUtiliseSonCompte) {
    return { statut: manque ? 'ajoute' : 'deja-membre', email: adresse, role: roleActuel };
  }

  // Compte jamais ouvert : l'invitation précédente n'a pas servi, on en renvoie une.
  let lien;
  try {
    ({ lien } = await annuaire.lienConnexion(adresse, retour, existant));
  } catch (e) {
    throw new RefusInvitation(502, "Le lien de connexion n'a pas pu être créé.", e.message);
  }
  try {
    const message = composerMessage({ type: 'relance', espace, role: roleActuel, lien, connexion });
    const envoi = await facteur({ a: adresse, ...message });
    return { statut: 'relance', email: adresse, role: roleActuel, roleDemande: role, envoi: { id: envoi?.id || null } };
  } catch (e) {
    throw new RefusInvitation(502, "L'e-mail n'a pas pu partir. Le compte existe toujours, vous pouvez renvoyer l'invitation.", e.message);
  }
}
