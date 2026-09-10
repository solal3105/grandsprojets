/* ============================================================================
   MESSAGE ENVOYÉ À QUI DEMANDE LE TARIF EXACT SUR L'ESTIMATEUR

   Pas de route : ce fichier est importé par `tarif-lead.mjs`. Il compose le
   message ; l'expédition est portée par le transport commun `lib/mail.mjs`.

   Le message ne donne JAMAIS le tarif exact : il rappelle ce que le visiteur a
   réglé et la fourchette qu'il a vue, et dit qu'un membre de l'équipe le
   contacte. C'est l'équipe qui annonce le prix, en connaissant le dossier.

   L'équipe reçoit ce message en copie invisible, à l'identique : c'est à la
   fois la notification (« quelqu'un a demandé un tarif ») et ce qu'il faut
   pour rappeler en sachant ce que la personne a sous les yeux.
   ============================================================================ */

import { envoyerEmail, echapperHtml as echapper, EXPEDITEUR_DEFAUT } from './mail.mjs';
import { estimer, eurosFourchette, nombre } from '../../../home-src/src/v2/data/tarification.mjs';

const SITE = 'https://openprojets.com';

/* Les noms des modules, tels que la vitrine les écrit (home-src/src/v2/data/
   modules.js, que l'on ne peut pas importer ici : il dépend de Vue). */
export const NOMS_MODULES = {
  carte: 'Carte des projets urbains',
  travaux: 'Travaux du quotidien',
  participer: 'Signalement',
  diagnostic: 'Diagnostic terrain',
  chantiers: 'Chantiers et arrêtés',
};

const from = () => process.env.TARIF_MAIL_FROM || EXPEDITEUR_DEFAUT;

/* Les réponses du visiteur doivent tomber devant l'équipe : même liste que la
   démo salon si rien de spécifique n'est réglé. */
const replyTo = () => String(process.env.TARIF_MAIL_REPLY_TO || process.env.DEMO_MAIL_REPLY_TO || '')
  .split(',')
  .map((a) => a.trim())
  .filter(Boolean);

/* Copie invisible pour l'équipe : la variable ABSENTE donne le repli, la
   variable VIDE coupe la copie (même logique que DEMO_MAIL_BCC). */
const BCC_DEFAUT = ['loic@vazy.app', 'solal@vazy.app', 'arnaud@vazy.app'];

const bcc = () => {
  const brut = process.env.TARIF_MAIL_BCC;
  const liste = brut === undefined ? BCC_DEFAUT : String(brut).split(',');
  return liste.map((a) => a.trim()).filter(Boolean);
};

/* Ce que le message rappelle : les réglages et la fourchette vue à l'écran */
export function resumer({ population, modules, annees }) {
  const e = estimer({ population, modules, annees });
  const noms = e.lignes.map((l) => NOMS_MODULES[l.cle] || l.cle);
  return {
    habitants: nombre(e.population),
    modules: noms,
    annees: e.annees,
    mensuel: eurosFourchette(e.mensuel),
    total: eurosFourchette(e.total),
    lien: `${SITE}/home2/tarification?population=${e.population}&modules=${e.lignes.map((l) => l.cle).join(',')}&annees=${e.annees}`,
  };
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function corpsTexte({ resume, telephone }) {
  return [
    `Bonjour,`,
    ``,
    `Nous avons bien reçu votre demande de tarif pour Open Projets. Voici ce que`,
    `vous avez indiqué :`,
    ``,
    `- Une collectivité de ${resume.habitants} habitants`,
    `- ${resume.modules.length > 1 ? 'Les modules' : 'Le module'} : ${resume.modules.join(', ')}`,
    `- Un engagement de ${pluriel(resume.annees, 'an')}`,
    `- La fourchette affichée : de ${resume.mensuel} HT par mois, soit de ${resume.total} HT`,
    `  sur la durée, mise en service comprise`,
    ``,
    `Un membre de l'équipe vous communique le tarif exact et répond à vos`,
    `questions. Vous pouvez aussi répondre directement à ce message.`,
    telephone ? `Vous nous avez laissé le ${telephone} : nous vous y appellerons si c'est plus simple.` : null,
    ``,
    `Retrouver votre estimation : ${resume.lien}`,
    ``,
    `CE QUE FAIT OPEN PROJETS`,
    ``,
    `Open Projets est la carte interactive qu'une collectivité déploie pour`,
    `informer ses habitants : les projets d'aménagement et les chantiers sur`,
    `une carte publique à ses couleurs, que chacun consulte sans compte. Des`,
    `modules la complètent : travaux du quotidien, signalement, diagnostic`,
    `terrain, chantiers et arrêtés.`,
    ``,
    `Fonctionnalités : ${SITE}/home/fonctionnalites`,
    ``,
    `--`,
    `Vous recevez ce message parce que vous avez demandé un tarif sur`,
    `openprojets.com. Répondez simplement à ce message pour ne plus être`,
    `contacté.`,
  ].filter((l) => l !== null).join('\n');
}

function corpsHtml({ resume, telephone }) {
  const p = 'margin:0 0 16px;color:#4a4a55;font-size:15px;line-height:1.65;';
  const h = 'margin:32px 0 12px;color:#101014;font-size:17px;font-weight:600;';
  const li = 'margin-bottom:8px;';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td>
          <p style="margin:0 0 28px;">
            <img src="${SITE}/home/img/logos/classic_color.png" alt="Open Projets" width="132" style="width:132px;height:auto;border:0;display:block;">
          </p>
          <p style="${p}">Bonjour,</p>
          <p style="${p}">Nous avons bien reçu votre demande de tarif pour Open Projets. Voici ce que vous avez indiqué :</p>
          <ul style="margin:0 0 16px;padding-left:20px;color:#4a4a55;font-size:15px;line-height:1.65;">
            <li style="${li}">Une collectivité de <strong>${echapper(resume.habitants)} habitants</strong></li>
            <li style="${li}">${resume.modules.length > 1 ? 'Les modules' : 'Le module'} : <strong>${echapper(resume.modules.join(', '))}</strong></li>
            <li style="${li}">Un engagement de <strong>${pluriel(resume.annees, 'an')}</strong></li>
            <li>La fourchette affichée : <strong>de ${echapper(resume.mensuel)} HT par mois</strong>, soit de ${echapper(resume.total)} HT sur la durée, mise en service comprise</li>
          </ul>
          <p style="${p}">Un membre de l'équipe vous communique le tarif exact et répond à vos questions. Vous pouvez aussi répondre directement à ce message.${telephone ? ` Vous nous avez laissé le <strong>${echapper(telephone)}</strong> : nous vous y appellerons si c'est plus simple.` : ''}</p>

          <p style="margin:0 0 8px;">
            <a href="${echapper(resume.lien)}" style="display:inline-block;background:#FF0037;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px;">Retrouver votre estimation</a>
          </p>
          <p style="margin:0 0 24px;color:#8a8a96;font-size:13px;word-break:break-all;">${echapper(resume.lien)}</p>

          <h2 style="${h}">Ce que fait Open Projets</h2>
          <p style="${p}">Open Projets est la carte interactive qu'une collectivité déploie pour informer ses habitants : les projets d'aménagement et les chantiers sur une carte publique à ses couleurs, que chacun consulte sans compte. Des modules la complètent : travaux du quotidien, signalement, diagnostic terrain, chantiers et arrêtés.</p>
          <p style="${p}"><a href="${SITE}/home/fonctionnalites" style="color:#FF0037;">Les fonctionnalités</a></p>

          <hr style="border:0;border-top:1px solid #e6e6ea;margin:32px 0 16px;">
          <p style="margin:0;color:#8a8a96;font-size:12px;line-height:1.6;">
            Vous recevez ce message parce que vous avez demandé un tarif sur openprojets.com.
            Répondez simplement à ce message pour ne plus être contacté.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Expédie le message au demandeur, l'équipe en copie invisible. Ne lève
 * jamais : rend l'état à consigner.
 * @returns {Promise<{ status: 'envoye'|'echec'|'non_configure', error?: string }>}
 */
export async function envoyerMessageTarif({ email, telephone, population, modules, annees }) {
  const resume = resumer({ population, modules, annees });
  if (!resume.modules.length) return { status: 'echec', error: 'aucun module retenu' };
  const donnees = { resume, telephone: String(telephone || '').trim() };
  const resultat = await envoyerEmail({
    to: email,
    subject: 'Votre demande de tarif Open Projets',
    text: corpsTexte(donnees),
    html: corpsHtml(donnees),
    from: from(),
    replyTo: replyTo(),
    bcc: bcc(),
  });
  if (resultat.status === 'envoye') {
    console.log(`[tarif-mail] message envoyé (${resume.habitants} habitants, ${resume.modules.length} module(s), ${bcc().length} copie(s) interne(s))`);
  }
  return resultat;
}
