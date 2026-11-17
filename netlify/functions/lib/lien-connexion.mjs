/* ============================================================================
   LIEN DE CONNEXION DEMANDÉ SUR /login/

   Le cœur de la fonction `lien-connexion`, sans réseau : la fonction lui passe
   la réservation des e-mails publics, la recherche du compte, la fabrication
   du jeton et l'envoi. La suite Playwright lui donne des doublures.

   Pourquoi ce n'est plus Supabase qui envoie le lien : son lien ouvre la
   session dès qu'on le visite, une seule fois. Le 17 novembre 2026, on a vu
   que l'antivirus de messagerie de Grenoble Alpes Métropole visite chaque lien
   reçu quelques secondes après l'arrivée du mail : il consommait le lien, et
   l'agent tombait sur « lien expiré » à chaque essai. Ici, le jeton est
   fabriqué par Supabase sans envoi (generateLink) et le lien mène à notre page
   de connexion, qui n'ouvre la session qu'au clic sur « Me connecter »
   (`lienDeConnexion`, le même que celui des invitations).

   La demande passe d'abord par la réservation des e-mails publics (règle du
   dépôt pour tout formulaire public qui écrit à l'adresse saisie) : une
   origine qui insiste est ignorée, une adresse ne reçoit qu'un nombre borné
   de liens par jour.
   ============================================================================ */

import { adresseDeRetour, lienDeConnexion } from '../../../supabase/functions/invite-user/inviter.mjs';
import { echapperHtml } from './mail.mjs';

export const DOMAINES = ['openprojets.com', 'www.openprojets.com', 'grandsprojets.com', 'www.grandsprojets.com'];

/* Ce que la page accepte en vingt-quatre heures, compté par la base. Par
   adresse, en messages : une personne qui a perdu son lien en redemande, sans
   qu'une adresse puisse être inondée. Par origine, en demandes : un service
   entier passe souvent par la même adresse IP. */
export const LIMITS = { ip: 40, recipient: 8, total: 400 };

const EMAIL_RE = /^[^\s@]+@[^\s@,;]+\.[a-z]{2,}$/i;

/** Le message : un bouton vers la page de connexion, et ce qu'il faut y faire. */
export function composerMessageConnexion({ lien, connexion }) {
  const objet = 'Votre lien de connexion à Open Projets';
  const texte = [
    'Bonjour,',
    '',
    `Ouvrez ce lien, puis cliquez sur « Me connecter » : ${lien}`,
    '',
    "Ce lien est personnel et vaut pour une connexion. S'il a déjà servi ou a expiré, demandez-en un autre sur "
      + `${connexion}.`,
    '',
    "Si vous n'avez pas demandé à vous connecter, vous pouvez ignorer ce message.",
    '',
    "L'équipe Open Projets",
  ].join('\n');
  const p = (t) => `<p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">${t}</p>`;
  const html = [
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#f9fafb;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;">',
    p('Bonjour,'),
    p(echapperHtml('Voici votre lien pour vous connecter à Open Projets.')),
    `<p style="margin:0 0 20px;"><a href="${echapperHtml(lien)}" style="display:inline-block;padding:12px 22px;background:#FF0037;color:#ffffff;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Ouvrir la page de connexion</a></p>`,
    p(echapperHtml("Sur la page qui s'ouvre, cliquez sur « Me connecter ». Ce lien est personnel et vaut pour une connexion. S'il a déjà servi ou a expiré, demandez-en un autre sur ")
      + `<a href="${echapperHtml(connexion)}" style="color:#FF0037;">${echapperHtml(connexion.replace(/^https?:\/\//, ''))}</a>.`),
    p(echapperHtml("Si vous n'avez pas demandé à vous connecter, vous pouvez ignorer ce message.")),
    p(echapperHtml("L'équipe Open Projets")),
    '</div></body></html>',
  ].join('');
  return { objet, texte, html };
}

/**
 * Traite une demande de lien. Rend l'issue que la page affiche :
 *   - 'envoye'   : le message est parti ;
 *   - 'inconnu'  : aucun compte ne porte cette adresse (rien n'est envoyé) ;
 *   - 'plafond'  : trop de demandes pour cette adresse ou cette origine ;
 *   - 'invalide' : adresse illisible ;
 *   - 'echec'    : le jeton ou l'envoi a échoué.
 *
 * services : {
 *   reserver(email) -> 'reserved'|'recipient'|'ip'|'total'|'unavailable'
 *   trouverCompte(email) -> { confirme } | null
 *   fabriquerJeton(email, type) -> { jeton, type }
 *   envoyer({ a, objet, texte, html }) -> { status: 'envoye'|'echec'|'non_configure', error? }
 * }
 */
export async function demanderLienConnexion({ email, origine }, services) {
  const adresse = String(email || '').trim().toLowerCase().slice(0, 180);
  if (!EMAIL_RE.test(adresse)) return { issue: 'invalide' };

  const reservation = await services.reserver(adresse);
  if (!['reserved', 'unavailable'].includes(reservation)) return { issue: 'plafond' };

  const compte = await services.trouverCompte(adresse);
  if (!compte) return { issue: 'inconnu' };

  const retour = adresseDeRetour(origine, DOMAINES);
  let lien;
  try {
    // Adresse jamais confirmée : son invitation n'a pas servi, on en refait une.
    lien = lienDeConnexion(retour, await services.fabriquerJeton(adresse, compte.confirme ? 'magiclink' : 'invite'));
  } catch (e) {
    return { issue: 'echec', detail: `jeton : ${e?.message || e}` };
  }
  const message = composerMessageConnexion({ lien, connexion: retour });
  const envoi = await services.envoyer({ a: adresse, ...message });
  if (envoi?.status !== 'envoye') return { issue: 'echec', detail: `envoi : ${envoi?.status}${envoi?.error ? ` ${envoi.error}` : ''}` };
  return { issue: 'envoye' };
}
