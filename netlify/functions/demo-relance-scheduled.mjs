/* ============================================================================
   FONCTION DEMO-RELANCE-SCHEDULED - planifiée chaque heure (pas de route)

   Envoie la relance personnelle de Solal deux jours ouvrés après une démo, le
   matin (heure de Paris). Le calendrier, le tri et le message sont dans
   `lib/demo-relance.mjs` ; ce fichier ne fait que lire les leads, décider et
   consigner.

   Une seule relance par adresse, jamais de séquence : une personne qui a fait
   trois démos reçoit une relance, qui parle de la dernière commune. L'état est
   écrit sur chaque ligne (`followup_status`), donc une relance ne part jamais
   deux fois et chaque adresse écartée garde son motif.

   `DEMO_RELANCE_ACTIVE=false` coupe l'envoi sans redéploiement.
   ============================================================================ */

import { hasServiceKey, svcSelect, svcUpdate } from './lib/participer-common.mjs';
import { echeance, envoyerRelance, motifDExclusion } from './lib/demo-relance.mjs';

const normaliser = (email) => String(email || '').trim().toLowerCase();

/** Consigne le même état sur toutes les lignes d'une adresse encore en attente. */
function consigner(ids, patch) {
  return svcUpdate('demo_leads', { id: `in.(${ids.join(',')})`, followup_status: 'eq.a_faire' }, patch);
}

export async function traiterRelances(maintenant = new Date()) {
  const bilan = { envoyees: 0, echecs: 0, ecartees: 0, en_attente: 0 };
  const enAttente = await svcSelect('demo_leads', {
    select: 'id,email,commune_nom,mail_status,created_at',
    followup_status: 'eq.a_faire',
    order: 'created_at.desc',
  });
  if (!enAttente.length) return bilan;

  // Adresses déjà relancées (une démo plus ancienne) et adresses qui nous ont
  // déjà écrit : les deux ferment la porte à une nouvelle relance
  const [dejaRelances, contacts] = await Promise.all([
    svcSelect('demo_leads', { select: 'email', followup_status: 'in.(envoye,echec)' }),
    svcSelect('contact_requests', { select: 'email' }),
  ]);
  const relances = new Set(dejaRelances.map((r) => normaliser(r.email)));
  const dejaEcrit = new Set(contacts.map((r) => normaliser(r.email)));

  // Une adresse = un groupe ; la démo la plus récente le représente
  const groupes = new Map();
  for (const lead of enAttente) {
    const cle = normaliser(lead.email);
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(lead);
  }

  for (const [email, leads] of groupes) {
    const ids = leads.map((l) => l.id);
    const recent = leads[0];
    try {
      const motif = relances.has(email) ? 'deja relance' : motifDExclusion(recent, dejaEcrit);
      if (motif) {
        await consigner(ids, { followup_status: 'ignore', followup_reason: motif });
        bilan.ecartees += 1;
        continue;
      }
      const quand = echeance(recent.created_at, maintenant);
      if (quand === 'attendre') {
        bilan.en_attente += 1;
        continue;
      }
      if (quand === 'perime') {
        await consigner(ids, { followup_status: 'ignore', followup_reason: 'trop ancien' });
        bilan.ecartees += 1;
        continue;
      }
      const mail = await envoyerRelance({
        email: recent.email.trim(),
        communeNom: recent.commune_nom,
        creeLe: recent.created_at,
      });
      if (mail.status === 'envoye') {
        await svcUpdate('demo_leads', { id: `eq.${recent.id}` }, {
          followup_status: 'envoye', followup_sent_at: maintenant.toISOString(),
        });
        // Les démos plus anciennes de la même adresse sont couvertes par celle-ci
        if (ids.length > 1) await consigner(ids.slice(1), { followup_status: 'ignore', followup_reason: 'doublon' });
        bilan.envoyees += 1;
      } else if (mail.status === 'echec') {
        // Pas de nouvel essai : une relance qui part trois fois n'a plus rien de naturel
        await consigner(ids, { followup_status: 'echec', followup_reason: mail.error || null });
        bilan.echecs += 1;
      }
      // non_configure : rien n'est consigné, la relance repartira une fois la clé posée
    } catch (e) {
      console.error(`[demo-relance] ${recent.id} ::`, e?.message);
    }
  }
  return bilan;
}

export default async () => {
  if (String(process.env.DEMO_RELANCE_ACTIVE || '').toLowerCase() === 'false') {
    console.log('[demo-relance] coupée par DEMO_RELANCE_ACTIVE');
    return new Response('off', { status: 200 });
  }
  if (!hasServiceKey()) {
    console.warn('[demo-relance] SUPABASE_SERVICE_ROLE_KEY absente : relances sautées');
    return new Response('skipped', { status: 200 });
  }
  try {
    const bilan = await traiterRelances();
    console.log(`[demo-relance] envoyées=${bilan.envoyees} échecs=${bilan.echecs} écartées=${bilan.ecartees} en attente=${bilan.en_attente}`);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[demo-relance] ::', e?.message);
    return new Response('error', { status: 500 });
  }
};

// Chaque heure à la 17e minute : la fenêtre du matin est vérifiée dans le
// code, et l'envoi ne tombe jamais pile sur une heure ronde.
export const config = { schedule: '17 * * * *' };
