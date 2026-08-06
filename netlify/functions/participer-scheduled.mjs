/* ============================================================================
   FONCTION PARTICIPER-SCHEDULED - planifiée chaque jour (pas de route)

   Les trois tâches d'hygiène du module, dans la stack du repo (Netlify
   Scheduled Function, pas de pg_cron) :
     1. PURGE des dépôts jamais confirmés après 7 jours (ligne + photo) ;
     2. ANONYMISATION des signalements clos depuis plus de `retention_mois`
        (réglage par ville) : email et hash d'IP effacés, le contenu publié
        reste (il n'est pas nominatif) ;
     3. ALERTE anti « module fantôme » : si des signalements confirmés restent
        au statut « nouveau » au-delà de `alerte_jours`, la mairie reçoit un
        rappel (au plus un tous les 6 jours, jalonné par last_alert_at).
   ============================================================================ */

import {
  BUCKET_PHOTOS, hasServiceKey,
  svcSelect, svcUpdate, svcDelete, storageDelete, mailMairie,
} from './lib/participer-common.mjs';

const JOURS_AVANT_PURGE = 7;
const JOURS_ENTRE_ALERTES = 6;

const isoIlYaJours = (jours) => new Date(Date.now() - jours * 86400000).toISOString();

function isoIlYaMois(mois) {
  const d = new Date();
  d.setMonth(d.getMonth() - mois);
  return d.toISOString();
}

async function purgerNonConfirmes() {
  const rows = await svcSelect('participer_signalements', {
    select: 'id,photo_path',
    email_confirmed: 'eq.false',
    created_at: `lt.${isoIlYaJours(JOURS_AVANT_PURGE)}`,
  });
  if (!rows.length) return 0;
  await storageDelete(BUCKET_PHOTOS, rows.map((r) => r.photo_path).filter(Boolean));
  await svcDelete('participer_signalements', { id: `in.(${rows.map((r) => r.id).join(',')})` });
  return rows.length;
}

async function anonymiser(settingsRows) {
  let total = 0;
  for (const s of settingsRows) {
    const maj = await svcUpdate('participer_signalements', {
      ville: `eq.${s.ville}`,
      closed_at: `lt.${isoIlYaMois(s.retention_mois ?? 12)}`,
      anonymized_at: 'is.null',
    }, {
      email: null,
      ip_hash: null,
      anonymized_at: new Date().toISOString(),
    });
    total += maj.length;
  }
  return total;
}

async function alerter(settingsRows) {
  let envoyees = 0;
  for (const s of settingsRows) {
    if (!s.notify_email) continue;
    if (s.last_alert_at && s.last_alert_at > isoIlYaJours(JOURS_ENTRE_ALERTES)) continue;
    const enAttente = await svcSelect('participer_signalements', {
      select: 'id',
      ville: `eq.${s.ville}`,
      statut_key: 'eq.nouveau',
      email_confirmed: 'eq.true',
      created_at: `lt.${isoIlYaJours(s.alerte_jours ?? 7)}`,
    });
    if (!enAttente.length) continue;
    await mailMairie({
      to: s.notify_email,
      subject: `${enAttente.length} signalement(s) en attente de traitement`,
      lignes: [
        `${enAttente.length} signalement(s) de votre carte participative attendent un premier traitement depuis plus de ${s.alerte_jours ?? 7} jours.`,
        `Un signalement sans réponse détruit la confiance des habitants : un simple passage en « pris en compte » suffit à la maintenir.`,
      ],
    });
    await svcUpdate('participer_settings', { ville: `eq.${s.ville}` }, { last_alert_at: new Date().toISOString() });
    envoyees += 1;
  }
  return envoyees;
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
    const [purges, anonymises, alertes] = [
      await purgerNonConfirmes(),
      await anonymiser(settingsRows),
      await alerter(settingsRows),
    ];
    console.log(`[participer-scheduled] purges=${purges} anonymisés=${anonymises} alertes=${alertes}`);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[participer-scheduled] ::', e?.message);
    return new Response('error', { status: 500 });
  }
};

export const config = { schedule: '@daily' };
