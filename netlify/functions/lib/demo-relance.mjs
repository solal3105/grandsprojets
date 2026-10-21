/* ============================================================================
   RELANCE PERSONNELLE APRÈS UNE DÉMO

   Pas de route : ce fichier est importé par `demo-relance-scheduled.mjs`. Il
   porte le calendrier (quand relancer), le tri (qui relancer) et le message ;
   l'expédition passe par le transport commun `lib/mail.mjs`.

   Le message doit se lire comme un mail écrit à la main par Solal : texte
   brut, aucun HTML, aucun logo, aucun lien suivi, aucune signature de marque.
   C'est ce qui le distingue du premier message (le lien, aux couleurs d'Open
   Projets) et ce qui lui donne une chance d'obtenir une réponse.
   ============================================================================ */

import { envoyerEmail } from './mail.mjs';

const ZONE = 'Europe/Paris';

/** Jours ouvrés entre la démo et la relance. */
export const DELAI_JOURS_OUVRES = 2;
/** Fenêtre d'envoi, heure de Paris : le matin, quand on lit ses mails. */
export const HEURE_DEBUT = 9;
export const HEURE_FIN = 12;
/** Au-delà, une relance tombée en panne ne part plus : elle arriverait trop
    tard pour sembler naturelle. */
export const PEREMPTION_JOURS = 7;

/* Jours fériés à date fixe. Les fêtes mobiles (lundi de Pâques, Ascension,
   Pentecôte) ne sont pas suivies : une relance un lundi de Pâques n'a rien de
   grave, une table à tenir à jour chaque année si. */
const FERIES_FIXES = new Set(['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25']);

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Date, heure et jour de la semaine d'un instant, lus à Paris. */
export function heureDeParis(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const semaine = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return {
    jour: `${parts.year}-${parts.month}-${parts.day}`,
    heure: Number(parts.hour),
    semaine,
  };
}

/** Jour de calendrier « AAAA-MM-JJ » décalé de n jours (sans fuseau). */
function decaler(jour, n) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function estOuvre(jour) {
  const semaine = new Date(`${jour}T12:00:00Z`).getUTCDay();
  return semaine !== 0 && semaine !== 6 && !FERIES_FIXES.has(jour.slice(5));
}

/** Jour (à Paris) où la relance devient due : deux jours ouvrés après la démo. */
export function jourDeRelance(creeLe) {
  let jour = heureDeParis(new Date(creeLe)).jour;
  let restants = DELAI_JOURS_OUVRES;
  while (restants > 0) {
    jour = decaler(jour, 1);
    if (estOuvre(jour)) restants -= 1;
  }
  return jour;
}

/**
 * La relance de ce lead part-elle maintenant ?
 * Rend 'attendre', 'envoyer' ou 'perime'.
 */
export function echeance(creeLe, maintenant = new Date()) {
  const ici = heureDeParis(maintenant);
  const ageJours = (maintenant - new Date(creeLe)) / 86400000;
  if (ageJours > PEREMPTION_JOURS) return 'perime';
  if (ici.jour < jourDeRelance(creeLe)) return 'attendre';
  // Échéance passée, mais on n'écrit qu'un jour ouvré, le matin
  if (!estOuvre(ici.jour) || ici.heure < HEURE_DEBUT || ici.heure >= HEURE_FIN) return 'attendre';
  return 'envoyer';
}

/** Jour de la semaine de la démo, tel qu'on le dirait : « mercredi ». */
export function jourDeLaDemo(creeLe) {
  return JOURS[heureDeParis(new Date(creeLe)).semaine];
}

/* ─── Qui relancer ──────────────────────────────────────────────────────── */

const DOMAINES_EQUIPE = ['vazy.app', 'openprojets.com', 'grandsprojets.com'];
const ADRESSES_EQUIPE = ['solal.gendrin@gmail.com', 'adresse3105@hotmail.fr'];
// Adresses jetables ou de test : personne ne lira la relance
const DOMAINES_FACTICES = /(^|\.)(yopmail\.[a-z]+|toto\.fr|test\.[a-z]+|example\.[a-z]+|exemple\.[a-z]+|mailinator\.com)$/i;

/**
 * Motif pour lequel ce lead ne doit pas être relancé, ou null.
 * @param {Object} lead - ligne de demo_leads
 * @param {Set<string>} dejaEcrit - adresses (minuscules) qui nous ont écrit par le formulaire
 */
export function motifDExclusion(lead, dejaEcrit = new Set()) {
  const email = String(lead.email || '').trim().toLowerCase();
  const domaine = email.split('@')[1] || '';
  if (ADRESSES_EQUIPE.includes(email) || DOMAINES_EQUIPE.includes(domaine)) return 'equipe';
  if (DOMAINES_FACTICES.test(domaine)) return 'adresse factice';
  // Le premier message n'est pas arrivé : relancer quelqu'un qui n'a jamais eu
  // son lien serait incompréhensible
  if (lead.mail_status !== 'envoye') return 'premier message non envoye';
  if (!String(lead.commune_nom || '').trim()) return 'commune inconnue';
  if (dejaEcrit.has(email)) return 'nous a deja ecrit';
  return null;
}

/* ─── Le message ───────────────────────────────────────────────────────── */

export function composerRelance({ communeNom, creeLe }) {
  const commune = String(communeNom).trim();
  return {
    subject: `Votre carte de ${commune}`,
    text: [
      'Bonjour,',
      '',
      `J'ai vu que vous aviez fait la carte des projets de ${commune} sur Open Projets ${jourDeLaDemo(creeLe)}, et je suis curieux de savoir ce qui vous a amené à découvrir l'outil.`,
      '',
      `C'était par simple curiosité, ou vous avez un projet en tête pour ${commune} ?`,
      '',
      'Qu\'en avez-vous pensé ?',
      '',
      'Bonne journée,',
      'Solal',
    ].join('\n'),
  };
}

/* ─── Expédition ───────────────────────────────────────────────────────── */

const liste = (valeur, defaut) => String(valeur === undefined ? defaut : valeur)
  .split(',')
  .map((a) => a.trim())
  .filter(Boolean);

/* Expéditeur et réponses réglables sans redéploiement. Les réponses vont dans
   la vraie boîte de Solal tant que openprojets.com ne reçoit pas de courrier ;
   la copie invisible lui montre exactement ce qui est parti, comme un message
   envoyé de sa main le ferait. */
const from = () => process.env.DEMO_RELANCE_FROM || 'Solal Gendrin <solal@openprojets.com>';
const replyTo = () => liste(process.env.DEMO_RELANCE_REPLY_TO, 'solal@vazy.app');
const bcc = () => liste(process.env.DEMO_RELANCE_BCC, 'solal@vazy.app');

/** Expédie la relance. Ne lève jamais : rend l'état à consigner. */
export function envoyerRelance({ email, communeNom, creeLe }) {
  const { subject, text } = composerRelance({ communeNom, creeLe });
  // Pas de `html` : un message texte seul est ce qu'envoie une personne
  return envoyerEmail({ to: email, subject, text, from: from(), replyTo: replyTo(), bcc: bcc() });
}
