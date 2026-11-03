/* ============================================================================
   FONCTION PARTICIPER-SUBMIT - route /api/participer/submit (POST)

   Dépôt d'un signalement SANS compte : c'est le seul canal d'écriture dans
   participer_signalements (clé de service, aucune policy anon). Le dépôt ne
   devient visible de la mairie qu'après confirmation de l'email (double
   opt-in, voir participer-confirm) : c'est à la fois l'anti-spam principal et
   le canal de suivi.

   Le navigateur joint à chaque dépôt un identifiant tiré au hasard
   (`appareil`, facultatif). Trois issues, rendues dans `etat` :
     - `transmis` : un signalement confirmé porte déjà cette adresse et ce
       navigateur, l'adresse est prouvée, le dépôt part sans nouvel email ;
     - `ajoute` : un dépôt de moins d'une heure attend déjà sa confirmation
       depuis ce navigateur avec cette adresse, le lien envoyé le transmettra
       aussi, aucun email ne part ;
     - `a_confirmer` : l'email de confirmation part, comme sans identifiant.

   Garde-fous : honeypot invisible (`website`), quotas journaliers par IP salée
   et par email (administrables dans participer_settings), photo bornée à 4 Mo
   après compression cliente, module activable/suspendable par ville.
   ============================================================================ */

import { isValidCityCode } from './lib/http.mjs';
import {
  EMAIL_RE, PHOTO_MIMES, PHOTO_MAX_BYTES, BUCKET_PHOTOS, SITE,
  UUID_RE, LOT_FENETRE_MINUTES,
  jsonResp, hasServiceKey, hashIp, hashAppareil, loadContext, loadCategories, lireDepotPublic,
  svcInsert, svcCount, svcDelete, svcRpc, storageUpload, storageDelete,
  mailConfirmation, transmettreDepots,
} from './lib/participer-common.mjs';

const DATA_URL_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const PHOTO_EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const TABLE = 'participer_signalements';

/**
 * Valide et normalise le corps d'un dépôt, sans accès à la base : une requête
 * mal formée est refusée pour ce qu'elle est, que la base soit joignable ou
 * non. Pure, testée cas par cas.
 * @returns {{ error: string } | { depot: Object }}
 */
export function lireSignalement(body) {
  const ville = String(body?.ville || '').trim();
  if (!isValidCityCode(ville)) return { error: 'Paramètre ville invalide' };

  const email = String(body?.email || '').trim().slice(0, 180);
  if (!EMAIL_RE.test(email)) return { error: 'Adresse e-mail invalide' };

  const categoryKey = String(body?.category_key || '').trim();
  if (!/^[a-z0-9-]+$/.test(categoryKey)) return { error: 'Catégorie invalide' };

  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: 'Position invalide' };
  }

  // Absent : un email par dépôt. Présent : un UUID, rien d'autre (il finit
  // dans une empreinte, pas dans une requête).
  const appareil = body?.appareil == null ? '' : String(body.appareil).trim();
  if (appareil && !UUID_RE.test(appareil)) return { error: 'Identifiant de navigateur invalide' };

  let photo = null;
  if (body?.photo) {
    const m = DATA_URL_RE.exec(String(body.photo));
    if (!m || !PHOTO_MIMES.has(m[1])) return { error: 'Photo invalide' };
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.byteLength > PHOTO_MAX_BYTES) return { error: 'Photo trop lourde (4 Mo max)' };
    photo = { bytes, mime: m[1], ext: PHOTO_EXT[m[1]] };
  }

  return {
    depot: {
      ville, email, emailNorm: email.toLowerCase(), categoryKey, lat, lng, appareil, photo,
      description: String(body?.description || '').trim().slice(0, 1000) || null,
      adresse: String(body?.adresse || '').trim().slice(0, 300) || null,
    },
  };
}

/** Quotas journaliers, comptés sur la ville (les réglages sont par ville). */
async function quotaAtteint({ ville, emailNorm }, ipHash, settings) {
  const today = new Date().toISOString().slice(0, 10);
  const [byIp, byEmail] = await Promise.all([
    svcCount(TABLE, { ville: `eq.${ville}`, ip_hash: `eq.${ipHash}`, created_at: `gte.${today}` }),
    svcCount(TABLE, { ville: `eq.${ville}`, email: `eq.${emailNorm}`, created_at: `gte.${today}` }),
  ]);
  return byIp >= (settings?.quota_ip_jour ?? 20) || byEmail >= (settings?.quota_email_jour ?? 5);
}

/**
 * Ce navigateur est-il reconnu pour cette adresse, ou une série est-elle en
 * cours ? Un signalement anonymisé n'a plus d'adresse : il ne compte plus, la
 * reconnaissance s'éteint avec la rétention.
 */
async function reconnaissance({ ville, emailNorm }, appareilHash) {
  if (!appareilHash) return { reconnu: false, serieEnCours: false };
  const memes = { ville: `eq.${ville}`, email: `eq.${emailNorm}`, appareil_hash: `eq.${appareilHash}` };
  const depuis = new Date(Date.now() - LOT_FENETRE_MINUTES * 60000).toISOString();
  const [confirmes, recents] = await Promise.all([
    svcCount(TABLE, { ...memes, email_confirmed: 'eq.true' }),
    svcCount(TABLE, { ...memes, email_confirmed: 'eq.false', created_at: `gte.${depuis}` }),
  ]);
  return { reconnu: confirmes > 0, serieEnCours: recents > 0 };
}

/**
 * Enregistre la photo puis la ligne. Si la référence ou l'insertion échoue
 * après l'envoi de la photo, celle-ci n'est référencée par aucune ligne : plus
 * rien ne la purgerait jamais, alors que c'est la photo d'un habitant.
 */
async function enregistrer(d, ipHash, appareilHash) {
  const id = crypto.randomUUID();
  let photoPath = null;
  if (d.photo) {
    photoPath = `${d.ville}/${id}.${d.photo.ext}`;
    await storageUpload(BUCKET_PHOTOS, photoPath, d.photo.bytes, d.photo.mime);
  }
  try {
    const reference = await svcRpc('participer_next_reference', { p_ville: d.ville });
    const [row] = await svcInsert(TABLE, {
      id,
      ville: d.ville,
      reference,
      category_key: d.categoryKey,
      description: d.description,
      photo_path: photoPath,
      lat: d.lat,
      lng: d.lng,
      adresse: d.adresse,
      email: d.emailNorm,
      ip_hash: ipHash,
      appareil_hash: appareilHash,
    });
    return { id, row, photoPath };
  } catch (e) {
    if (photoPath) await storageDelete(BUCKET_PHOTOS, [photoPath]);
    throw e;
  }
}

export default async (req, context) => {
  const requete = await lireDepotPublic(req);
  if (requete.reponse) return requete.reponse;
  const { cors, body } = requete;

  const lu = lireSignalement(body);
  if (lu.error) return jsonResp(400, { error: lu.error }, cors);
  const d = lu.depot;

  if (!hasServiceKey()) {
    console.warn('[participer-submit] SUPABASE_SERVICE_ROLE_KEY absente : dépôt impossible');
    return jsonResp(503, { error: 'Dépôt indisponible' }, cors);
  }

  try {
    const ctx = await loadContext(d.ville);
    if (!ctx.enabled) return jsonResp(404, { error: 'Module non actif pour cette ville' }, cors);
    if (ctx.settings?.paused) {
      return jsonResp(403, { error: ctx.settings.pause_message || 'Les dépôts sont momentanément suspendus' }, cors);
    }
    const categories = await loadCategories(d.ville, { enabledOnly: true });
    if (!categories.some((c) => c.category_key === d.categoryKey)) {
      return jsonResp(400, { error: 'Catégorie inconnue' }, cors);
    }

    const ipHash = await hashIp(context?.ip);
    if (await quotaAtteint(d, ipHash, ctx.settings)) {
      return jsonResp(429, { error: 'Trop de signalements aujourd\'hui - réessayez demain' }, cors);
    }

    const appareilHash = d.appareil ? await hashAppareil(d.appareil) : null;
    const { reconnu, serieEnCours } = await reconnaissance(d, appareilHash);
    const { id, row, photoPath } = await enregistrer(d, ipHash, appareilHash);
    const { reference } = row;

    /* Adresse déjà prouvée depuis ce navigateur : transmis tout de suite. Si
       la transmission échoue, on retombe sur l'email de confirmation plutôt
       que de laisser un dépôt en attente que personne ne confirmera. */
    if (reconnu) {
      try {
        await transmettreDepots(row, ctx);
        console.log(`[participer-submit] ${reference} transmis pour ${d.ville} (navigateur reconnu)`);
        return jsonResp(200, { ok: true, etat: 'transmis', reference }, cors);
      } catch (e) {
        console.error(`[participer-submit] ${reference} transmission directe impossible, confirmation par email ::`, e?.message);
      }
    } else if (serieEnCours) {
      const enAttente = await svcCount(TABLE, {
        ville: `eq.${d.ville}`, email: `eq.${d.emailNorm}`, appareil_hash: `eq.${appareilHash}`, email_confirmed: 'eq.false',
      });
      console.log(`[participer-submit] ${reference} déposé pour ${d.ville} (rejoint une série, ${enAttente} en attente)`);
      return jsonResp(200, { ok: true, etat: 'ajoute', en_attente: enAttente }, cors);
    }

    /* Sans le message de confirmation, le dépôt est un orphelin invisible de
       tous : mieux vaut le refuser franchement que laisser l'habitant croire
       qu'il a signalé quelque chose. */
    const mail = await mailConfirmation({
      to: d.email,
      confirmUrl: `${SITE}/api/participer/confirm?token=${row.confirm_token}`,
      replyTo: ctx.settings?.notify_email || null,
      groupe: Boolean(appareilHash),
    });
    if (mail.status !== 'envoye') {
      await svcDelete(TABLE, { id: `eq.${id}` });
      if (photoPath) await storageDelete(BUCKET_PHOTOS, [photoPath]);
      console.error(`[participer-submit] confirmation non expédiée (${mail.status}) : dépôt annulé`);
      return jsonResp(502, { error: 'Envoi du message de confirmation impossible - réessayez' }, cors);
    }

    console.log(`[participer-submit] ${reference} déposé pour ${d.ville} (confirmation envoyée)`);
    return jsonResp(200, { ok: true, etat: 'a_confirmer' }, cors);
  } catch (e) {
    console.error('[participer-submit] ::', e?.message);
    return jsonResp(500, { error: 'Dépôt impossible' }, cors);
  }
};

export const config = { path: '/api/participer/submit' };
