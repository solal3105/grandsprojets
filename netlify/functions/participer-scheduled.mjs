/* ============================================================================
   FONCTION PARTICIPER-SCHEDULED - planifiée chaque jour (pas de route)

   Les trois tâches d'hygiène du module, dans la stack du repo (Netlify
   Scheduled Function, pas de pg_cron) :
     1. PURGE des dépôts jamais confirmés après 7 jours (ligne + photo) ;
     2. ANONYMISATION des signalements clos depuis plus de `retention_mois`
        (réglage par ville) : email et hash d'IP effacés, plus les contacts
        laissés dans les demandes de retrait. Le contenu publié reste (il
        n'est pas nominatif) ;
     3. ALERTE anti « module fantôme » : si des signalements confirmés restent
        au statut « nouveau » au-delà de `alerte_jours`, la mairie reçoit un
        rappel (au plus un tous les 6 jours, jalonné par last_alert_at).
   ============================================================================ */

import {
  BUCKET_PHOTOS, PURGE_AFTER_DAYS, hasServiceKey,
  svcSelect, svcUpdate, svcDelete, storageDelete, mailMairie,
} from './lib/participer-common.mjs';

const DAYS_BETWEEN_ALERTS = 6;
// Une URL PostgREST porte ~37 octets par identifiant : au-delà, la requête est
// rejetée et la purge ne passerait plus jamais
const DELETE_BATCH = 100;

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

/** N mois en arrière, sans le débordement de `setMonth` en fin de mois
    (31 mars moins 1 mois donnerait le 3 mars). */
function isoMonthsAgo(months) {
  const d = new Date();
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString();
}

async function purgeUnconfirmed() {
  const rows = await svcSelect('participer_signalements', {
    select: 'id,photo_path',
    email_confirmed: 'eq.false',
    created_at: `lt.${isoDaysAgo(PURGE_AFTER_DAYS)}`,
  });
  if (!rows.length) return 0;
  await storageDelete(BUCKET_PHOTOS, rows.map((r) => r.photo_path).filter(Boolean));
  for (let i = 0; i < rows.length; i += DELETE_BATCH) {
    const ids = rows.slice(i, i + DELETE_BATCH).map((r) => r.id);
    await svcDelete('participer_signalements', { id: `in.(${ids.join(',')})` });
  }
  return rows.length;
}

/** Une ville en échec ne doit pas priver les suivantes de leur anonymisation. */
async function forEachVille(settingsRows, nom, fn) {
  for (const s of settingsRows) {
    try {
      await fn(s);
    } catch (e) {
      console.error(`[participer-scheduled] ${nom} ${s.ville} ::`, e?.message);
    }
  }
}

async function anonymize(settingsRows) {
  let total = 0;
  await forEachVille(settingsRows, 'anonymisation', async (s) => {
    const seuil = isoMonthsAgo(s.retention_mois ?? 12);
    const maj = await svcUpdate('participer_signalements', {
      ville: `eq.${s.ville}`,
      closed_at: `lt.${seuil}`,
      anonymized_at: 'is.null',
    }, {
      email: null,
      ip_hash: null,
      anonymized_at: new Date().toISOString(),
    });
    total += maj.length;

    /* Les demandes de retrait portent le contact d'un tiers : même rétention.
       Sans filtre sur les colonnes elles-mêmes, sinon une demande sans email
       garderait son empreinte de connexion indéfiniment. */
    await svcUpdate('participer_events', {
      ville: `eq.${s.ville}`,
      type: 'eq.retrait_demande',
      created_at: `lt.${seuil}`,
    }, { contact_email: null, author_ip_hash: null });
  });
  return total;
}

async function alertUntreated(settingsRows) {
  let sent = 0;
  await forEachVille(settingsRows, 'alerte', async (s) => {
    if (!s.notify_email) return;
    if (s.last_alert_at && s.last_alert_at > isoDaysAgo(DAYS_BETWEEN_ALERTS)) return;
    const enAttente = await svcSelect('participer_signalements', {
      select: 'id',
      ville: `eq.${s.ville}`,
      statut_key: 'eq.nouveau',
      email_confirmed: 'eq.true',
      created_at: `lt.${isoDaysAgo(s.alerte_jours ?? 7)}`,
    });
    if (!enAttente.length) return;
    const mail = await mailMairie({
      to: s.notify_email,
      subject: `${enAttente.length} signalement(s) en attente de traitement`,
      lignes: [
        `${enAttente.length} signalement(s) de votre carte participative attendent un premier traitement depuis plus de ${s.alerte_jours ?? 7} jours.`,
        `Un signalement sans réponse détruit la confiance des habitants : un simple passage en « pris en compte » suffit à la maintenir.`,
      ],
    });
    // Jalonner sur un envoi échoué supprimerait l'alerte pour 6 jours de plus
    if (mail.status !== 'envoye') return;
    await svcUpdate('participer_settings', { ville: `eq.${s.ville}` }, { last_alert_at: new Date().toISOString() });
    sent += 1;
  });
  return sent;
}

export default async () => {
  if (!hasServiceKey()) {
    console.warn('[participer-scheduled] SUPABASE_SERVICE_ROLE_KEY absente : tâches sautées');
    return new Response('skipped', { status: 200 });
  }
  try {
    const settingsRows = await svcSelect('participer_settings', {
      select: 'ville,notify_email,alerte_jours,retention_mois,last_alert_at',
    });
    /* Chaque tâche est isolée : une purge en échec ne doit pas priver le module
       de son anonymisation (obligation de rétention) ni de son alerte
       anti « module fantôme ». Les échecs sont tracés, jamais silencieux. */
    const run = async (nom, tache) => {
      try {
        return await tache();
      } catch (e) {
        console.error(`[participer-scheduled] ${nom} en échec ::`, e?.message);
        return `échec (${e?.message || 'inconnu'})`;
      }
    };
    const purged = await run('purge', () => purgeUnconfirmed());
    const anonymized = await run('anonymisation', () => anonymize(settingsRows));
    const alerts = await run('alertes', () => alertUntreated(settingsRows));
    console.log(`[participer-scheduled] purges=${purged} anonymisés=${anonymized} alertes=${alerts}`);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[participer-scheduled] ::', e?.message);
    return new Response('error', { status: 500 });
  }
};

export const config = { schedule: '@daily' };
