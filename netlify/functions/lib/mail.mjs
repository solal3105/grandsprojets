/* ============================================================================
   TRANSPORT EMAIL COMMUN

   Pas de route : ce fichier est importé par les fonctions qui expédient des
   messages (demo-mail.mjs, participer-common.mjs). Il ne porte AUCUN contenu
   de message : uniquement l'expédition.

   Deux fournisseurs reconnus, choisis par la variable d'environnement
   présente. Aucune dépendance : les deux exposent une API HTTP simple.
     - RESEND_API_KEY  -> api.resend.com
     - BREVO_API_KEY   -> api.brevo.com (hébergement européen)
   Sans clé, rien n'est envoyé et l'état `non_configure` est remonté : un
   destinataire ne doit jamais attendre un message qui ne part pas sans qu'on
   le sache.

   Le domaine d'expédition doit être vérifié chez le fournisseur, sinon les
   messages partent en indésirable ou sont refusés. C'est la seule étape que le
   code ne peut pas faire à votre place.
   ============================================================================ */

export const EXPEDITEUR_DEFAUT = 'Open Projets <bonjour@openprojets.com>';

// « Nom <adresse@domaine> » -> { nom, adresse }, pour Brevo qui les sépare
function decouperExpediteur(valeur) {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(valeur);
  if (m) return { nom: m[1] || 'Open Projets', adresse: m[2] };
  return { nom: 'Open Projets', adresse: valeur.trim() };
}

export const echapperHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

async function envoyerResend({ to, subject, text, html, from, replyTo, bcc }) {
  const body = {
    from,
    to: [to],
    subject,
    text,
    html,
    ...(replyTo.length ? { reply_to: replyTo } : {}),
    ...(bcc.length ? { bcc } : {}),
  };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
}

async function envoyerBrevo({ to, subject, text, html, from, replyTo, bcc }) {
  const exp = decouperExpediteur(from);
  // Brevo n'accepte qu'une seule adresse de réponse : on garde la première de
  // la liste. Une bascule vers Brevo perdrait donc les suivantes - à savoir.
  const reponse = replyTo[0] || null;
  const body = {
    sender: { name: exp.nom, email: exp.adresse },
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html,
    ...(reponse ? { replyTo: { email: decouperExpediteur(reponse).adresse } } : {}),
    ...(bcc.length ? { bcc: bcc.map((adresse) => ({ email: adresse })) } : {}),
  };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
}

/**
 * Expédie un message. Ne lève jamais : rend l'état à consigner.
 * @param {Object} opts
 * @param {string} opts.to        - destinataire unique
 * @param {string} opts.subject
 * @param {string} opts.text      - corps texte brut
 * @param {string} opts.html      - corps HTML
 * @param {string} [opts.from]    - « Nom <adresse> », domaine vérifié obligatoire
 * @param {string[]} [opts.replyTo]
 * @param {string[]} [opts.bcc]   - copies invisibles du destinataire
 * @returns {Promise<{ status: 'envoye'|'echec'|'non_configure', error?: string }>}
 */
export async function envoyerEmail({ to, subject, text, html, from = EXPEDITEUR_DEFAUT, replyTo = [], bcc = [] }) {
  if (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    console.warn('[mail] aucune clé de fournisseur (RESEND_API_KEY ou BREVO_API_KEY) : message non envoyé');
    return { status: 'non_configure' };
  }
  const donnees = { to, subject, text, html, from, replyTo, bcc };
  try {
    if (process.env.RESEND_API_KEY) await envoyerResend(donnees);
    else await envoyerBrevo(donnees);
    return { status: 'envoye' };
  } catch (e) {
    const error = String(e?.message || e).slice(0, 300);
    console.error(`[mail] échec d'envoi :: ${error}`);
    return { status: 'echec', error };
  }
}
