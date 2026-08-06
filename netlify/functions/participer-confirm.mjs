/* ============================================================================
   FONCTION PARTICIPER-CONFIRM - route /api/participer/confirm (GET)

   Aboutissement du lien reçu par email : confirme l'adresse du signaleur,
   consigne l'événement de création, expédie l'accusé de réception (référence
   + lien de suivi) et prévient la mairie. Idempotent : recliquer le lien
   renvoie simplement vers la page de suivi.

   Réponse en redirection : l'habitant arrive sur la carte, directement sur le
   détail de son signalement.
   ============================================================================ */

import {
  SITE, UUID_RE, jsonResp, hasServiceKey,
  svcSelect, svcUpdate, insertEvent, loadContext, loadCategories,
  mailAccuse, mailMairie,
} from './lib/participer-common.mjs';

const redirect = (url) => new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'GET') return jsonResp(405, { error: 'Méthode non autorisée' });

  const token = new URL(req.url).searchParams.get('token') || '';
  if (!UUID_RE.test(token) || !hasServiceKey()) return redirect(`${SITE}/?participer=lien-invalide`);

  try {
    const [row] = await svcSelect('participer_signalements', {
      select: 'id,ville,reference,email,email_confirmed,suivi_token,category_key,adresse',
      confirm_token: `eq.${token}`,
      limit: '1',
    });
    if (!row) return redirect(`${SITE}/?participer=lien-invalide`);

    // Module désactivé entre-temps : ne pas confirmer vers un suivi qui répondra 404
    const ctx = await loadContext(row.ville);
    if (!ctx.enabled) return redirect(`${SITE}/?participer=module-inactif`);

    const suiviUrl = `${SITE}/?city=${row.ville}&participer_suivi=${row.suivi_token}`;
    if (row.email_confirmed) return redirect(suiviUrl);

    /* Confirmation atomique : le filtre email_confirmed=false fait de cet
       UPDATE le point de sérialisation. Deux clics rapprochés (préchargement
       de lien, antivirus de messagerie) ne dupliquent donc ni l'événement de
       création ni les emails. */
    const updated = await svcUpdate('participer_signalements', {
      id: `eq.${row.id}`,
      email_confirmed: 'eq.false',
    }, {
      email_confirmed: true,
      confirmed_at: new Date().toISOString(),
    });
    /* Le jeton n'est PAS renouvelé : le lien reçu par email doit continuer de
       mener à la page de suivi quand l'habitant le rouvre. Le filtre
       email_confirmed=eq.false suffit à le rendre inopérant une deuxième fois
       (0 ligne modifiée = on redirige sans rien réexpédier). */
    if (!updated.length) return redirect(suiviUrl);

    await insertEvent({ signalementId: row.id, ville: row.ville, type: 'creation', newStatut: 'nouveau' });

    await mailAccuse({ to: row.email, reference: row.reference, suiviUrl, replyTo: ctx.settings?.notify_email || null });

    if (ctx.settings?.notify_email) {
      const categories = await loadCategories(row.ville);
      const catLabel = categories.find((c) => c.category_key === row.category_key)?.label || row.category_key;
      await mailMairie({
        to: ctx.settings.notify_email,
        subject: `Nouveau signalement ${row.reference}`,
        lignes: [
          `Un nouveau signalement vient d'être confirmé sur votre carte participative.`,
          `Référence : ${row.reference} - Catégorie : ${catLabel}${row.adresse ? ` - ${row.adresse}` : ''}`,
          `Il attend votre modération avant toute publication.`,
        ],
      });
    }

    console.log(`[participer-confirm] ${row.reference} confirmé (${row.ville})`);
    return redirect(suiviUrl);
  } catch (e) {
    console.error('[participer-confirm] ::', e?.message);
    return redirect(`${SITE}/?participer=erreur`);
  }
};

export const config = { path: '/api/participer/confirm' };
