/* ============================================================================
   MESSAGE ENVOYÉ À QUI DEMANDE SON ESTIMATION PAR E-MAIL SUR L'ESTIMATEUR

   Pas de route : ce fichier est importé par `tarif-lead.mjs`. Il compose le
   message ; l'expédition est portée par le transport commun `lib/mail.mjs`.

   Le message reprend les montants que le visiteur a vus à l'écran, donne le
   lien du document d'estimation à imprimer, et dit clairement que ce n'est
   pas un devis et que cela n'engage à rien.

   L'équipe reçoit ce message en copie invisible, à l'identique : c'est à la
   fois la notification (« quelqu'un a demandé une estimation ») et ce qu'il
   faut pour rappeler en sachant ce que la personne a sous les yeux.
   ============================================================================ */

import { envoyerEmail, echapperHtml as echapper, EXPEDITEUR_DEFAUT } from './mail.mjs';
import { estimer, euros, nombre } from '../../../home-src/src/v2/data/tarification.mjs';

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

/* Ce que le message rappelle : les réglages et les montants vus à l'écran.
   `prix` porte le prix mensuel de Chantiers calculé par la page, `territoire`
   la collectivité choisie ({ cle, nom }), `reponses` les réponses du parcours
   Chantiers ({ nom, usage, km, sans }), pour que les liens rouvrent la même
   estimation. */
export function resumer({ population, modules, annees, prix = {}, territoire = null, reponses = null }) {
  const e = estimer({ population, modules, annees, prix });
  const noms = e.lignes.map((l) => NOMS_MODULES[l.cle] || l.cle);
  const reglages = new URLSearchParams({ population: String(e.population), modules: e.lignes.map((l) => l.cle).join(','), annees: String(e.annees) });
  if (territoire?.cle) reglages.set('territoire', territoire.cle);
  if (reponses?.nom) reglages.set('nom', reponses.nom);
  if (reponses?.usage) reglages.set('usage', reponses.usage);
  if (reponses?.km) reglages.set('km', String(reponses.km));
  if (reponses?.sans?.length) reglages.set('sans', reponses.sans.join(','));
  const document = new URLSearchParams(reglages);
  if (territoire?.nom) document.set('collectivite', territoire.nom);
  return {
    habitants: nombre(e.population),
    collectivite: territoire?.nom || '',
    modules: noms,
    annees: e.annees,
    mensuel: euros(e.mensuel),
    setup: euros(e.setup),
    total: euros(e.total),
    lien: `${SITE}/tarification?${reglages}`,
    document: `${SITE}/tarification/estimation?${document}`,
  };
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function corpsTexte({ resume, telephone }) {
  return [
    `Bonjour,`,
    ``,
    `Voici l'estimation que vous avez préparée pour Open Projets :`,
    ``,
    `- ${resume.collectivite ? `${resume.collectivite}, ${resume.habitants} habitants` : `Une collectivité de ${resume.habitants} habitants`}`,
    `- ${resume.modules.length > 1 ? 'Les modules' : 'Le module'} : ${resume.modules.join(', ')}`,
    `- Un engagement de ${pluriel(resume.annees, 'an')}`,
    `- L'abonnement : ${resume.mensuel} HT par mois`,
    `- La mise en service : ${resume.setup} HT, une seule fois`,
    `- Le total sur ${pluriel(resume.annees, 'an')} : ${resume.total} HT, mise en service comprise`,
    ``,
    `Cette estimation n'est pas un devis et ne vous engage pas. Un devis vous`,
    `sera adressé après un échange sur votre besoin.`,
    ``,
    `Le document d'estimation, à imprimer ou enregistrer en PDF :`,
    resume.document,
    ``,
    `Pour en parler, répondez simplement à ce message.`,
    telephone ? `Vous nous avez laissé le ${telephone} : nous vous y appellerons si c'est plus simple.` : null,
    ``,
    `Modifier votre estimation : ${resume.lien}`,
    ``,
    `CE QUE FAIT OPEN PROJETS`,
    ``,
    `Open Projets est la carte interactive qu'une collectivité déploie pour`,
    `informer ses habitants : les projets d'aménagement et les chantiers sur`,
    `une carte publique à ses couleurs, que chacun consulte sans compte. Des`,
    `modules la complètent : travaux du quotidien, signalement, diagnostic`,
    `terrain, chantiers et arrêtés.`,
    ``,
    `Les modules : ${SITE}/#modules`,
    ``,
    `--`,
    `Vous recevez ce message parce que vous avez demandé votre estimation sur`,
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
            <img src="${SITE}/img/logos/classic_color.png" alt="Open Projets" width="132" style="width:132px;height:auto;border:0;display:block;">
          </p>
          <p style="${p}">Bonjour,</p>
          <p style="${p}">Voici l'estimation que vous avez préparée pour Open Projets :</p>
          <ul style="margin:0 0 16px;padding-left:20px;color:#4a4a55;font-size:15px;line-height:1.65;">
            <li style="${li}">${resume.collectivite ? `<strong>${echapper(resume.collectivite)}</strong>, ${echapper(resume.habitants)} habitants` : `Une collectivité de <strong>${echapper(resume.habitants)} habitants</strong>`}</li>
            <li style="${li}">${resume.modules.length > 1 ? 'Les modules' : 'Le module'} : <strong>${echapper(resume.modules.join(', '))}</strong></li>
            <li style="${li}">Un engagement de <strong>${pluriel(resume.annees, 'an')}</strong></li>
            <li style="${li}">L'abonnement : <strong>${echapper(resume.mensuel)} HT par mois</strong></li>
            <li style="${li}">La mise en service : <strong>${echapper(resume.setup)} HT</strong>, une seule fois</li>
            <li>Le total sur ${pluriel(resume.annees, 'an')} : <strong>${echapper(resume.total)} HT</strong>, mise en service comprise</li>
          </ul>
          <p style="margin:0 0 16px;padding:14px 16px;border:2px solid #101014;border-radius:12px;color:#101014;font-size:15px;line-height:1.6;"><strong>Cette estimation n'est pas un devis et ne vous engage pas.</strong> Un devis vous sera adressé après un échange sur votre besoin.</p>
          <p style="${p}">Pour en parler, répondez simplement à ce message.${telephone ? ` Vous nous avez laissé le <strong>${echapper(telephone)}</strong> : nous vous y appellerons si c'est plus simple.` : ''}</p>

          <p style="margin:0 0 8px;">
            <a href="${echapper(resume.document)}" style="display:inline-block;background:#FF0037;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px;">Voir le document d'estimation</a>
          </p>
          <p style="margin:0 0 24px;color:#8a8a96;font-size:13px;">À imprimer ou à enregistrer en PDF. <a href="${echapper(resume.lien)}" style="color:#8a8a96;">Modifier l'estimation</a></p>

          <h2 style="${h}">Ce que fait Open Projets</h2>
          <p style="${p}">Open Projets est la carte interactive qu'une collectivité déploie pour informer ses habitants : les projets d'aménagement et les chantiers sur une carte publique à ses couleurs, que chacun consulte sans compte. Des modules la complètent : travaux du quotidien, signalement, diagnostic terrain, chantiers et arrêtés.</p>
          <p style="${p}"><a href="${SITE}/#modules" style="color:#FF0037;">Les modules</a></p>

          <hr style="border:0;border-top:1px solid #e6e6ea;margin:32px 0 16px;">
          <p style="margin:0;color:#8a8a96;font-size:12px;line-height:1.6;">
            Vous recevez ce message parce que vous avez demandé votre estimation sur openprojets.com.
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
export async function envoyerMessageTarif({ email, telephone, population, modules, annees, prix, territoire, reponses }) {
  const resume = resumer({ population, modules, annees, prix, territoire, reponses });
  if (!resume.modules.length) return { status: 'echec', error: 'aucun module retenu' };
  const donnees = { resume, telephone: String(telephone || '').trim() };
  const resultat = await envoyerEmail({
    to: email,
    subject: 'Votre estimation Open Projets',
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
