/* ============================================================================
   FONCTION PARTICIPER-SUBMIT - route /api/participer/submit (POST)

   Dépôt d'un signalement SANS compte : c'est le seul canal d'écriture dans
   participer_signalements (clé de service, aucune policy anon). Le dépôt ne
   devient visible de la mairie qu'après confirmation de l'email (double
   opt-in, voir participer-confirm) : c'est à la fois l'anti-spam principal et
   le canal de suivi.

   Garde-fous : honeypot invisible (`website`), quotas journaliers par IP salée
   et par email (administrables dans participer_settings), photo bornée à 4 Mo
   après compression cliente, module activable/suspendable par ville.
   ============================================================================ */

import { isValidCityCode, getCorsHeaders, preflightResp } from './lib/http.mjs';
import {
  EMAIL_RE, PHOTO_MIMES, PHOTO_MAX_BYTES, BUCKET_PHOTOS, SITE,
  jsonResp, hasServiceKey, hashIp, loadContext, loadCategories,
  svcInsert, svcCount, svcDelete, svcRpc, storageUpload, storageDelete,
  mailConfirmation,
} from './lib/participer-common.mjs';

const DATA_URL_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;

export default async (req, context) => {
  const cors = { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return preflightResp(cors);
  if (req.method !== 'POST') return jsonResp(405, { error: 'Méthode non autorisée' }, cors);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: 'Corps de requête invalide' }, cors);
  }

  // Honeypot : un humain ne voit pas ce champ, un robot le remplit. On répond
  // comme si tout allait bien, sans rien enregistrer.
  if (String(body?.website || '').trim()) return jsonResp(200, { ok: true }, cors);

  // La validation d'entrée passe AVANT le contrôle de configuration : une
  // requête mal formée est refusée pour ce qu'elle est, que la base soit
  // joignable ou non. C'est aussi ce qui rend le contrat testable sans clés.
  const ville = String(body?.ville || '').trim();
  if (!isValidCityCode(ville)) return jsonResp(400, { error: 'Paramètre ville invalide' }, cors);

  const email = String(body?.email || '').trim().slice(0, 180);
  if (!EMAIL_RE.test(email)) return jsonResp(400, { error: 'Adresse e-mail invalide' }, cors);

  const categoryKey = String(body?.category_key || '').trim();
  if (!/^[a-z0-9-]+$/.test(categoryKey)) return jsonResp(400, { error: 'Catégorie invalide' }, cors);

  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return jsonResp(400, { error: 'Position invalide' }, cors);
  }

  const description = String(body?.description || '').trim().slice(0, 1000) || null;
  const adresse = String(body?.adresse || '').trim().slice(0, 300) || null;

  let photo = null;
  if (body?.photo) {
    const m = DATA_URL_RE.exec(String(body.photo));
    if (!m || !PHOTO_MIMES.has(m[1])) return jsonResp(400, { error: 'Photo invalide' }, cors);
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.byteLength > PHOTO_MAX_BYTES) return jsonResp(400, { error: 'Photo trop lourde (4 Mo max)' }, cors);
    photo = { bytes, mime: m[1], ext: m[1] === 'image/webp' ? 'webp' : m[1] === 'image/png' ? 'png' : 'jpg' };
  }

  if (!hasServiceKey()) {
    console.warn('[participer-submit] SUPABASE_SERVICE_ROLE_KEY absente : dépôt impossible');
    return jsonResp(503, { error: 'Dépôt indisponible' }, cors);
  }

  try {
    const ctx = await loadContext(ville);
    if (!ctx.enabled) return jsonResp(404, { error: 'Module non actif pour cette ville' }, cors);
    if (ctx.settings?.paused) {
      return jsonResp(403, { error: ctx.settings.pause_message || 'Les dépôts sont momentanément suspendus' }, cors);
    }

    const categories = await loadCategories(ville, { enabledOnly: true });
    if (!categories.some((c) => c.category_key === categoryKey)) {
      return jsonResp(400, { error: 'Catégorie inconnue' }, cors);
    }

    // Quotas journaliers, comptés sur la ville (les réglages sont par ville)
    const ipHash = await hashIp(context?.ip);
    const today = new Date().toISOString().slice(0, 10);
    const [byIp, byEmail] = await Promise.all([
      svcCount('participer_signalements', { ville: `eq.${ville}`, ip_hash: `eq.${ipHash}`, created_at: `gte.${today}` }),
      svcCount('participer_signalements', { ville: `eq.${ville}`, email: `eq.${email.toLowerCase()}`, created_at: `gte.${today}` }),
    ]);
    const quotaByIp = ctx.settings?.quota_ip_jour ?? 20;
    const quotaByEmail = ctx.settings?.quota_email_jour ?? 5;
    if (byIp >= quotaByIp || byEmail >= quotaByEmail) {
      return jsonResp(429, { error: 'Trop de signalements aujourd\'hui - réessayez demain' }, cors);
    }

    const id = crypto.randomUUID();
    let photoPath = null;
    if (photo) {
      photoPath = `${ville}/${id}.${photo.ext}`;
      await storageUpload(BUCKET_PHOTOS, photoPath, photo.bytes, photo.mime);
    }

    /* Si la référence ou l'insertion échoue après l'envoi de la photo, celle-ci
       n'est référencée par aucune ligne : plus rien ne la purgera jamais, alors
       que c'est la photo d'un habitant. */
    let row;
    try {
      const reference = await svcRpc('participer_next_reference', { p_ville: ville });
      [row] = await svcInsert('participer_signalements', {
        id,
        ville,
        reference,
        category_key: categoryKey,
        description,
        photo_path: photoPath,
        lat,
        lng,
        adresse,
        email: email.toLowerCase(),
        ip_hash: ipHash,
      });
    } catch (e) {
      if (photoPath) await storageDelete(BUCKET_PHOTOS, [photoPath]);
      throw e;
    }

    /* Sans le message de confirmation, le dépôt est un orphelin invisible de
       tous : mieux vaut le refuser franchement que laisser l'habitant croire
       qu'il a signalé quelque chose. */
    const reference = row.reference;
    const confirmUrl = `${SITE}/api/participer/confirm?token=${row.confirm_token}`;
    const mail = await mailConfirmation({ to: email, confirmUrl, replyTo: ctx.settings?.notify_email || null });
    if (mail.status !== 'envoye') {
      await svcDelete('participer_signalements', { id: `eq.${id}` });
      if (photoPath) await storageDelete(BUCKET_PHOTOS, [photoPath]);
      console.error(`[participer-submit] confirmation non expédiée (${mail.status}) : dépôt annulé`);
      return jsonResp(502, { error: 'Envoi du message de confirmation impossible - réessayez' }, cors);
    }

    console.log(`[participer-submit] ${reference} déposé pour ${ville} (confirmation envoyée)`);
    return jsonResp(200, { ok: true }, cors);
  } catch (e) {
    console.error('[participer-submit] ::', e?.message);
    return jsonResp(500, { error: 'Dépôt impossible' }, cors);
  }
};

export const config = { path: '/api/participer/submit' };
