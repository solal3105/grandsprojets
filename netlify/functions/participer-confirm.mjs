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
  SITE, jsonResp, hasServiceKey,
  svcSelect, svcUpdate, insertEvent, loadContext, loadCategories,
  mailAccuse, mailMairie,
} from './lib/participer-common.mjs';

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const redirect = (url) => new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'GET') return jsonResp(405, { error: 'Méthode non autorisée' });

  const token = new URL(req.url).searchParams.get('token') || '';
  if (!TOKEN_RE.test(token) || !hasServiceKey()) return redirect(`${SITE}/?participer=lien-invalide`);

  try {
    const [row] = await svcSelect('participer_signalements', {
      select: 'id,ville,reference,email,email_confirmed,suivi_token,category_key,adresse',
      confirm_token: `eq.${token}`,
      limit: '1',
    });
    if (!row) return redirect(`${SITE}/?participer=lien-invalide`);

    const suiviUrl = `${SITE}/?city=${row.ville}&participer_suivi=${row.suivi_token}`;
    if (row.email_confirmed) return redirect(suiviUrl);

    await svcUpdate('participer_signalements', { id: `eq.${row.id}` }, {
      email_confirmed: true,
      confirmed_at: new Date().toISOString(),
    });
    await insertEvent({ signalementId: row.id, ville: row.ville, type: 'creation', newStatut: 'nouveau' });

    const ctx = await loadContext(row.ville);
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
