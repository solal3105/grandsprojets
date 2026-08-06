/* ============================================================================
   MESSAGE ENVOYÉ AU VISITEUR QUI LAISSE SON ADRESSE (démo salon)

   Pas de route : ce fichier est importé par `demo-lead.mjs`. Il ne fait rien
   d'autre que composer le message ; l'expédition (Resend/Brevo) est portée par
   le transport commun `lib/mail.mjs`.
   ============================================================================ */

import { envoyerEmail, echapperHtml as echapper, EXPEDITEUR_DEFAUT } from './mail.mjs';

const SITE = 'https://openprojets.com';

const from = () => process.env.DEMO_MAIL_FROM || EXPEDITEUR_DEFAUT;

/* `DEMO_MAIL_REPLY_TO` accepte plusieurs adresses séparées par des virgules.
   Le message invite le visiteur à répondre pour ne plus être contacté : cette
   réponse doit tomber devant toute l'équipe, pas dans une boîte que personne ne
   relève ce jour-là. Le domaine d'expédition n'a pas d'enregistrement MX, donc
   sans cette liste la sortie d'opposition promise n'aboutit nulle part. */
const replyTo = () => String(process.env.DEMO_MAIL_REPLY_TO || '')
  .split(',')
  .map((a) => a.trim())
  .filter(Boolean);

/* ─── Le message ───────────────────────────────────────────────────────────

   Trois choses, dans cet ordre : le lien qu'on a promis, ce qu'est vraiment
   cette carte, puis ce que fait Open Projets.

   Le deuxième point n'est pas négociable : la carte a été fabriquée sans la
   commune, à partir de sources publiques. Le message le dit franchement, sinon
   un élu qui y trouve une erreur nous l'imputera. C'est aussi le meilleur
   argument commercial : ce qui manque est précisément ce que la collectivité
   apporterait. */

function sujet(communeNom) {
  return communeNom
    ? `La carte des projets de ${communeNom}`
    : 'La carte des projets de votre commune';
}

function corpsTexte({ communeNom, spaceUrl, projectsCount }) {
  const nom = communeNom || 'votre commune';
  const compte = Number.isFinite(projectsCount) && projectsCount > 0
    ? `${projectsCount} projets y figurent.`
    : '';
  return [
    `Bonjour,`,
    ``,
    `Voici la carte des projets de ${nom}, telle qu'elle a été générée devant vous :`,
    spaceUrl,
    compte,
    ``,
    `CE QUE VOUS Y TROUVEZ`,
    ``,
    `Cette carte a été construite en quelques minutes, sans votre collectivité,`,
    `à partir des seules sources publiques : le site de la mairie, la presse`,
    `locale et les avis de marchés publics. Chaque projet retenu cite la phrase`,
    `exacte qui l'atteste, et tout projet dont l'emplacement n'a pas pu être`,
    `vérifié a été écarté plutôt qu'approximé.`,
    ``,
    `Elle est donc forcément incomplète : ce qui n'est pas publié en ligne n'y`,
    `est pas. C'est précisément la différence avec un espace alimenté par vos`,
    `équipes, à partir de vos documents.`,
    ``,
    `CE QUE FAIT OPEN PROJETS`,
    ``,
    `Open Projets est la carte interactive qu'une collectivité déploie pour`,
    `informer ses administrés. Commune, intercommunalité ou métropole publient`,
    `leurs projets d'aménagement et leurs chantiers sur une carte publique à`,
    `leurs couleurs.`,
    ``,
    `- Vos équipes ajoutent les projets : géolocalisation, fiche, photo, en`,
    `  quelques clics et sans formation.`,
    `- La carte adopte votre identité : couleurs, logotype et fond de carte.`,
    `- Vos habitants consultent sans compte, sans inscription et sans`,
    `  téléchargement.`,
    ``,
    `Des modules complètent la carte selon vos besoins : suivi des travaux,`,
    `assistant de rédaction, sécurité routière, diagnostic de terrain.`,
    ``,
    `POUR ALLER PLUS LOIN`,
    ``,
    `Fonctionnalités : ${SITE}/home/fonctionnalites`,
    `Nous écrire : ${SITE}/home/contact`,
    ``,
    `Si vous souhaitez la même carte avec vos projets réels, écrivez-nous : la`,
    `reprise de vos documents se fait en quelques jours.`,
    ``,
    `--`,
    `Vous recevez ce message parce que vous avez demandé le lien de cette carte`,
    `sur openprojets.com/demo. Répondez simplement à ce message pour ne plus`,
    `être contacté.`,
  ].filter((l) => l !== null).join('\n');
}

function corpsHtml({ communeNom, spaceUrl, projectsCount }) {
  const nom = echapper(communeNom || 'votre commune');
  const url = echapper(spaceUrl);
  const compte = Number.isFinite(projectsCount) && projectsCount > 0
    ? ` ${projectsCount} projets y figurent.`
    : '';
  // Styles en ligne : les clients de messagerie ignorent les feuilles externes
  const p = 'margin:0 0 16px;color:#4a4a55;font-size:15px;line-height:1.65;';
  const h = 'margin:32px 0 12px;color:#101014;font-size:17px;font-weight:600;';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td>
          <!-- La marque en tete : un message sans expediteur visible se lit
               comme un message suspect. Le texte de remplacement porte le nom,
               les clients qui bloquent les images affichent donc quand meme
               « Open Projets ». -->
          <p style="margin:0 0 28px;">
            <img src="${SITE}/home/img/logos/classic_color.png" alt="Open Projets" width="132" style="width:132px;height:auto;border:0;display:block;">
          </p>
          <p style="${p}">Bonjour,</p>
          <p style="${p}">Voici la carte des projets de <strong>${nom}</strong>, telle qu'elle a été générée devant vous.${compte}</p>

          <p style="margin:0 0 8px;">
            <a href="${url}" style="display:inline-block;background:#FF0037;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px;">Ouvrir la carte</a>
          </p>
          <p style="margin:0 0 24px;color:#8a8a96;font-size:13px;word-break:break-all;">${url}</p>

          <h2 style="${h}">Ce que vous y trouvez</h2>
          <p style="${p}">Cette carte a été construite en quelques minutes, <strong>sans votre collectivité</strong>, à partir des seules sources publiques : le site de la mairie, la presse locale et les avis de marchés publics.</p>
          <p style="${p}">Chaque projet retenu cite la phrase exacte qui l'atteste, et tout projet dont l'emplacement n'a pas pu être vérifié a été écarté plutôt qu'approximé.</p>
          <p style="${p}">Elle est donc forcément incomplète : ce qui n'est pas publié en ligne n'y est pas. C'est précisément la différence avec un espace alimenté par vos équipes, à partir de vos documents.</p>

          <h2 style="${h}">Ce que fait Open Projets</h2>
          <p style="${p}">Open Projets est la carte interactive qu'une collectivité déploie pour informer ses administrés. Commune, intercommunalité ou métropole publient leurs projets d'aménagement et leurs chantiers sur une carte publique à leurs couleurs.</p>
          <ul style="margin:0 0 16px;padding-left:20px;color:#4a4a55;font-size:15px;line-height:1.65;">
            <li style="margin-bottom:8px;"><strong>Vos équipes ajoutent les projets</strong> : géolocalisation, fiche, photo, en quelques clics et sans formation.</li>
            <li style="margin-bottom:8px;"><strong>La carte adopte votre identité</strong> : couleurs, logotype et fond de carte.</li>
            <li><strong>Vos habitants consultent sans compte</strong>, sans inscription et sans téléchargement.</li>
          </ul>
          <p style="${p}">Des modules complètent la carte selon vos besoins : suivi des travaux, assistant de rédaction, sécurité routière, diagnostic de terrain.</p>

          <h2 style="${h}">Pour aller plus loin</h2>
          <p style="${p}">
            <a href="${SITE}/home/fonctionnalites" style="color:#FF0037;">Les fonctionnalités</a> &nbsp;·&nbsp;
            <a href="${SITE}/home/contact" style="color:#FF0037;">Nous écrire</a>
          </p>
          <p style="${p}">Si vous souhaitez la même carte avec vos projets réels, écrivez-nous : la reprise de vos documents se fait en quelques jours.</p>

          <hr style="border:0;border-top:1px solid #e6e6ea;margin:32px 0 16px;">
          <p style="margin:0;color:#8a8a96;font-size:12px;line-height:1.6;">
            Vous recevez ce message parce que vous avez demandé le lien de cette carte sur openprojets.com/demo.
            Répondez simplement à ce message pour ne plus être contacté.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ─── Expédition ─── */

/**
 * Expédie le message au visiteur. Ne lève jamais : rend l'état à consigner.
 * @returns {Promise<{ status: 'envoye'|'echec'|'non_configure', error?: string }>}
 */
export async function envoyerMessageDemo({ email, communeNom, spaceUrl, projectsCount }) {
  if (!spaceUrl) return { status: 'echec', error: 'aucune adresse d espace a envoyer' };

  const donnees = { communeNom, spaceUrl, projectsCount };
  const resultat = await envoyerEmail({
    to: email,
    subject: sujet(communeNom),
    text: corpsTexte(donnees),
    html: corpsHtml(donnees),
    from: from(),
    replyTo: replyTo(),
  });
  if (resultat.status === 'envoye') {
    console.log(`[demo-mail] message envoyé pour ${communeNom || 'commune inconnue'}`);
  }
  return resultat;
}
