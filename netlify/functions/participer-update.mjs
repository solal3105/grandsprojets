/* ============================================================================
   FONCTION PARTICIPER-UPDATE - route /api/participer/update (POST, JWT)

   Toutes les mutations de l'équipe (contributeur de la ville, admin) passent
   ici : changement de statut, publication, rejet, doublon, suppression, accès
   photo. Jamais d'écriture directe du navigateur : le rôle est revérifié côté
   serveur (pattern ai-diagnostic), et chaque transition écrit son événement et
   expédie son email dans le même appel.

   Répartition des droits :
     - contributeur : set_statut (sauf rejete), photo_url
     - admin ville  : tout (publish, unpublish, rejete, delete)
   La responsabilité éditoriale (ce qui devient public) reste à l'admin.
   ============================================================================ */

import { isValidCityCode, getCorsHeaders, preflightResp, getAuthedUser, getProfile } from './lib/http.mjs';
import {
  UUID_RE, STATUT_KEYS, STATUTS_CLOS, TEAM_COLUMNS, BUCKET_PHOTOS, BUCKET_PUBLIC, SITE,
  jsonResp, hasServiceKey,
  svcSelect, svcUpdate, svcDelete, insertEvent,
  storageDownload, storageUpload, storageDelete, storageSignedUrl, publicStorageUrl,
  loadContext, loadStatuts,
  mailStatut,
} from './lib/participer-common.mjs';

const ACTIONS_ADMIN = new Set(['publish', 'unpublish', 'delete']);

// Chemin de la copie publique d'une photo dans le bucket `uploads`
const publicPhotoPath = (photoPath) => `participer/${photoPath}`;

/** @returns {Promise<boolean>} l'habitant a-t-il réellement été prévenu ? */
async function notifyStatusChange(row, statutKey, message, settings) {
  if (!row.email || !row.email_confirmed) return false;
  const statuts = await loadStatuts(row.ville);
  const st = statuts.find((s) => s.statut_key === statutKey);
  if (!st?.notify) return false;
  const mail = await mailStatut({
    to: row.email,
    reference: row.reference,
    statutLabel: st.label,
    message,
    suiviUrl: `${SITE}/?city=${row.ville}&participer_suivi=${row.suivi_token}`,
    replyTo: settings?.notify_email || null,
  });
  return mail.status === 'envoye';
}

export default async (req) => {
  const cors = { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return preflightResp(cors);
  if (req.method !== 'POST') return jsonResp(405, { error: 'Méthode non autorisée' }, cors);

  // L'authentification se vérifie avec la clé anonyme : un appel non authentifié
  // reçoit 401 même si la clé de service manque (contexte netlify dev)
  const user = await getAuthedUser(req);
  if (!user) return jsonResp(401, { error: 'Non authentifié' }, cors);
  if (!hasServiceKey()) return jsonResp(503, { error: 'Service indisponible' }, cors);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: 'Corps de requête invalide' }, cors);
  }

  const ville = String(body?.ville || '').trim();
  const id = String(body?.id || '').trim();
  const action = String(body?.action || '').trim();
  if (!isValidCityCode(ville) || !UUID_RE.test(id)) return jsonResp(400, { error: 'Paramètres invalides' }, cors);

  // Rôle revérifié côté serveur : le gating de l'interface ne protège rien
  const profile = await getProfile(user);
  const isTeamMember = profile && (profile.villes.includes('global') || profile.villes.includes(ville));
  const isAdmin = isTeamMember && profile.role === 'admin';
  if (!isTeamMember) return jsonResp(403, { error: 'Réservé à l\'équipe de cette ville' }, cors);
  if (ACTIONS_ADMIN.has(action) && !isAdmin) return jsonResp(403, { error: 'Réservé aux administrateurs' }, cors);

  try {
    const [row] = await svcSelect('participer_signalements', {
      select: 'id,ville,reference,statut_key,photo_path,photo_url,published,email,email_confirmed,suivi_token,doublon_de',
      id: `eq.${id}`,
      ville: `eq.${ville}`,
      limit: '1',
    });
    if (!row) return jsonResp(404, { error: 'Signalement introuvable' }, cors);

    const ctx = await loadContext(ville);

    switch (action) {
      case 'set_statut': {
        const statutKey = String(body?.statut_key || '');
        if (!STATUT_KEYS.includes(statutKey)) return jsonResp(400, { error: 'Statut invalide' }, cors);
        const message = String(body?.message_public || '').trim().slice(0, 1000) || null;
        /* Le rejet engage la responsabilité éditoriale : admin, motif
           obligatoire. Seule la TRANSITION est gardée : un contributeur doit
           pouvoir ajouter un message sur un dossier déjà rejeté. */
        if (statutKey === 'rejete' && row.statut_key !== 'rejete') {
          if (!isAdmin) return jsonResp(403, { error: 'Le rejet est réservé aux administrateurs' }, cors);
          if (!message) return jsonResp(400, { error: 'Un motif est obligatoire pour un rejet' }, cors);
        }
        const patch = {
          statut_key: statutKey,
          closed_at: STATUTS_CLOS.has(statutKey) ? new Date().toISOString() : null,
          // Requalifier un doublon en autre chose doit couper le lien, sinon la
          // ligne continue de pointer un signalement qu'elle ne double plus
          ...(statutKey === 'doublon' ? {} : { doublon_de: null }),
        };
        if (statutKey === 'doublon') {
          const duplicateOf = String(body?.doublon_de || '');
          if (duplicateOf) {
            if (!UUID_RE.test(duplicateOf) || duplicateOf === id) return jsonResp(400, { error: 'Doublon invalide' }, cors);
            const [sourceRow] = await svcSelect('participer_signalements', {
              select: 'id', id: `eq.${duplicateOf}`, ville: `eq.${ville}`, limit: '1',
            });
            if (!sourceRow) return jsonResp(400, { error: 'Signalement d\'origine introuvable' }, cors);
            patch.doublon_de = duplicateOf;
          }
        }
        const [updated] = await svcUpdate('participer_signalements', { id: `eq.${id}`, select: TEAM_COLUMNS }, patch);
        await insertEvent({
          signalementId: id, ville, type: 'statut',
          oldStatut: row.statut_key, newStatut: statutKey,
          messagePublic: message, author: user.id,
        });
        const notifie = await notifyStatusChange(row, statutKey, message, ctx.settings);
        return jsonResp(200, { ok: true, signalement: updated, notifie }, cors);
      }

      case 'publish': {
        if (!row.email_confirmed) return jsonResp(400, { error: 'Signalement non confirmé par son auteur' }, cors);
        let photoUrl = row.photo_url;
        if (row.photo_path && !photoUrl) {
          const { bytes, contentType } = await storageDownload(BUCKET_PHOTOS, row.photo_path);
          await storageUpload(BUCKET_PUBLIC, publicPhotoPath(row.photo_path), bytes, contentType);
          photoUrl = publicStorageUrl(publicPhotoPath(row.photo_path));
        }
        const [updated] = await svcUpdate('participer_signalements', { id: `eq.${id}`, select: TEAM_COLUMNS }, {
          published: true,
          photo_url: photoUrl,
        });
        await insertEvent({ signalementId: id, ville, type: 'publication', author: user.id });
        return jsonResp(200, { ok: true, signalement: updated }, cors);
      }

      case 'unpublish': {
        if (row.photo_path) await storageDelete(BUCKET_PUBLIC, [publicPhotoPath(row.photo_path)]);
        const [updated] = await svcUpdate('participer_signalements', { id: `eq.${id}`, select: TEAM_COLUMNS }, {
          published: false,
          photo_url: null,
        });
        await insertEvent({ signalementId: id, ville, type: 'depublication', author: user.id });
        return jsonResp(200, { ok: true, signalement: updated }, cors);
      }

      case 'delete': {
        if (row.photo_path) {
          await storageDelete(BUCKET_PHOTOS, [row.photo_path]);
          await storageDelete(BUCKET_PUBLIC, [publicPhotoPath(row.photo_path)]);
        }
        await svcDelete('participer_signalements', { id: `eq.${id}` });
        /* Trace APRÈS la suppression effective, sans lien vers la ligne (elle
           n'existe plus) : la référence dans le message est le seul identifiant
           qui survive. Sans cette trace, plus personne ne sait qui a supprimé
           quoi, ni pour le contrôle interne ni face à une demande d'accès. */
        await insertEvent({
          signalementId: null, ville, type: 'suppression',
          oldStatut: row.statut_key,
          messagePublic: row.reference,
          author: user.id,
        });
        return jsonResp(200, { ok: true }, cors);
      }

      // Photo avant modération : URL signée courte sur le bucket privé
      case 'photo_url': {
        if (!row.photo_path) return jsonResp(404, { error: 'Pas de photo' }, cors);
        return jsonResp(200, { ok: true, url: await storageSignedUrl(BUCKET_PHOTOS, row.photo_path, 600) }, cors);
      }

      default:
        return jsonResp(400, { error: 'Action inconnue' }, cors);
    }
  } catch (e) {
    console.error('[participer-update] ::', e?.message);
    return jsonResp(500, { error: 'Opération impossible' }, cors);
  }
};

export const config = { path: '/api/participer/update' };
