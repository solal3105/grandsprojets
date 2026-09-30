/* ============================================================================
   FONCTION PARTICIPER-CONFIRM - route /api/participer/confirm (GET)

   Aboutissement du lien reçu par email : confirme l'adresse du signaleur et
   transmet le dépôt à la collectivité, avec tous les dépôts encore en attente
   faits depuis le même navigateur avec la même adresse (une série de points
   signalés à la suite ne demande qu'un clic). Consigne l'événement de création
   de chacun, expédie un seul accusé (références + liens de suivi) et prévient
   la mairie une fois. Idempotent : recliquer le lien renvoie simplement vers
   la page de suivi.

   Réponse en redirection : l'habitant arrive sur la carte, directement sur le
   détail du signalement dont il a ouvert le lien.
   ============================================================================ */

import {
  SITE, UUID_RE, jsonResp, hasServiceKey,
  svcSelect, loadContext, suiviUrlOf, transmettreDepots,
} from './lib/participer-common.mjs';

const redirect = (url) => new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'GET') return jsonResp(405, { error: 'Méthode non autorisée' });

  const token = new URL(req.url).searchParams.get('token') || '';
  if (!UUID_RE.test(token) || !hasServiceKey()) return redirect(`${SITE}/?participer=lien-invalide`);

  try {
    const [row] = await svcSelect('participer_signalements', {
      select: 'id,ville,email,email_confirmed,suivi_token,appareil_hash',
      confirm_token: `eq.${token}`,
      limit: '1',
    });
    if (!row) return redirect(`${SITE}/?participer=lien-invalide`);

    // Module désactivé entre-temps : ne pas confirmer vers un suivi qui répondra 404
    const ctx = await loadContext(row.ville);
    if (!ctx.enabled) return redirect(`${SITE}/?participer=module-inactif`);

    const suiviUrl = suiviUrlOf(row.ville, row.suivi_token);
    if (row.email_confirmed) return redirect(suiviUrl);

    /* Le jeton n'est PAS renouvelé : le lien reçu par email doit continuer de
       mener à la page de suivi quand l'habitant le rouvre. Le filtre
       email_confirmed=false de transmettreDepots suffit à le rendre inopérant
       une deuxième fois (rien de transmis = on redirige sans rien réexpédier). */
    const transmis = await transmettreDepots(row, ctx);
    if (transmis.length) {
      console.log(`[participer-confirm] ${transmis.map((s) => s.reference).join(', ')} confirmé(s) (${row.ville})`);
    }
    return redirect(suiviUrl);
  } catch (e) {
    console.error('[participer-confirm] ::', e?.message);
    return redirect(`${SITE}/?participer=erreur`);
  }
};

export const config = { path: '/api/participer/confirm' };
