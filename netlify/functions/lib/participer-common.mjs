/* ============================================================================
   SOCLE COMMUN DU MODULE PARTICIPER (signalements citoyens)

   Pas de route : importé par les fonctions participer-*. Porte tout ce qui est
   partagé : accès PostgREST et Storage avec la clé de service, chargement du
   contexte d'une ville (module actif, réglages, catégories, statuts), journal
   des événements, hash d'IP salé, et la composition des emails du module.

   Principe de sécurité : les tables participer_* n'ont AUCUNE policy anonyme.
   Toute écriture passe par ici, derrière la clé de service (pattern demo_runs),
   et l'email du signaleur ne sort JAMAIS vers le public.
   ============================================================================ */

import { SUPABASE_URL } from './http.mjs';
import { envoyerEmail, echapperHtml, EXPEDITEUR_DEFAUT } from './mail.mjs';

export { echapperHtml };

// Adresse publique du site : Netlify fournit URL (site de prod ou netlify dev)
export const SITE = (process.env.URL || 'https://openprojets.com').replace(/\/$/, '');

export const VILLE_RE = /^[a-z0-9-]+$/i;
// Volontairement permissif : ne pas rejeter une adresse réelle mal formée à la
// marge (même esprit que demo-lead).
export const EMAIL_RE = /^[^\s@]+@[^\s@,;]+\.[a-z]{2,}$/i;

export const STATUT_KEYS = ['nouveau', 'pris_en_compte', 'en_cours', 'resolu', 'rejete', 'hors_competence', 'doublon'];
// Statuts qui clôturent un signalement (déclenchent closed_at, donc le départ
// du compte à rebours d'anonymisation)
export const STATUTS_CLOS = new Set(['resolu', 'rejete', 'hors_competence', 'doublon']);
// Types d'événements montrés au public et à l'habitant sur sa page de suivi ;
// les autres (retrait_demande, anonymisation) restent internes
export const PUBLIC_EVENT_TYPES = new Set(['creation', 'statut', 'publication']);

export const BUCKET_PHOTOS = 'participer-photos';
// Les photos publiées sont copiées dans le bucket public existant, sous un
// préfixe dédié : une URL stable, servie comme n'importe quel asset
export const BUCKET_PUBLIC = 'uploads';
export const PHOTO_MIMES = new Set(['image/webp', 'image/jpeg', 'image/png']);
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/* ─── Réponses ─── */

// GET publics (config, geojson, detail) : ouverts comme les agrégateurs GeoJSON
export const PUBLIC_GET_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export function jsonResp(status, body, headers = PUBLIC_GET_CORS) {
  return new Response(JSON.stringify(body), { status, headers });
}

/* ─── Clé de service ─── */

export function hasServiceKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function serviceHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

async function pgError(r, contexte) {
  const txt = await r.text().catch(() => '');
  throw new Error(`[participer] ${contexte} ${r.status} :: ${txt.slice(0, 200)}`);
}

/** SELECT PostgREST. `params` = { select, ville: 'eq.x', ... } passés tels quels. */
export async function svcSelect(table, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), { headers: serviceHeaders() });
  if (!r.ok) await pgError(r, `select ${table}`);
  return r.json();
}

/** INSERT PostgREST. Rend les lignes créées. */
export async function svcInsert(table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!r.ok) await pgError(r, `insert ${table}`);
  return r.json();
}

/** UPDATE PostgREST filtré. Rend les lignes modifiées. */
export async function svcUpdate(table, filters, patch) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) await pgError(r, `update ${table}`);
  return r.json();
}

/** DELETE PostgREST filtré. */
export async function svcDelete(table, filters) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), { method: 'DELETE', headers: serviceHeaders() });
  if (!r.ok) await pgError(r, `delete ${table}`);
}

/** COUNT exact sans rapatrier les lignes. */
export async function svcCount(table, filters) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', 'id');
  for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    headers: serviceHeaders({ Prefer: 'count=exact', Range: '0-0' }),
  });
  if (!r.ok) await pgError(r, `count ${table}`);
  return parseInt((r.headers.get('content-range') || '0/0').split('/')[1] || '0', 10);
}

/** Appel RPC PostgREST (fonctions SQL). */
export async function svcRpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
  if (!r.ok) await pgError(r, `rpc ${fn}`);
  return r.json();
}

/* ─── Storage ─── */

export async function storageUpload(bucket, path, bytes, contentType) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!r.ok) await pgError(r, `storage upload ${bucket}/${path}`);
}

export async function storageDownload(bucket, path) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    headers: serviceHeaders(),
  });
  if (!r.ok) await pgError(r, `storage download ${bucket}/${path}`);
  return { bytes: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') || 'image/webp' };
}

/** Supprime une liste de chemins. Ne lève pas : un orphelin Storage n'est pas bloquant. */
export async function storageDelete(bucket, paths) {
  if (!paths.length) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!r.ok) console.warn(`[participer] storage delete ${bucket} ${r.status}`);
  } catch (e) {
    console.warn('[participer] storage delete ::', e?.message);
  }
}

/** URL signée temporaire sur le bucket privé (consultation avant modération). */
export async function storageSignedUrl(bucket, path, expiresIn = 600) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ expiresIn }),
  });
  if (!r.ok) await pgError(r, `storage sign ${bucket}/${path}`);
  const { signedURL } = await r.json();
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

export function publicStorageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_PUBLIC}/${path}`;
}

/* ─── Contexte d'une ville ─── */

/**
 * Charge le contexte du module pour une ville : activation + réglages.
 * @returns {Promise<{enabled: boolean, settings: Object|null}>}
 */
export async function loadContext(ville) {
  const [modules, settings] = await Promise.all([
    svcSelect('city_modules', {
      select: 'enabled', ville: `eq.${ville}`, module_key: 'eq.participer', limit: '1',
    }),
    svcSelect('participer_settings', { select: '*', ville: `eq.${ville}`, limit: '1' }),
  ]);
  return { enabled: modules[0]?.enabled === true, settings: settings[0] || null };
}

export function loadCategories(ville, { enabledOnly = false } = {}) {
  const params = {
    select: 'category_key,label,icon_class,color,help_text,sort_order,enabled',
    ville: `eq.${ville}`,
    order: 'sort_order.asc',
  };
  if (enabledOnly) params.enabled = 'eq.true';
  return svcSelect('participer_categories', params);
}

export function loadStatuts(ville) {
  return svcSelect('participer_statuts', {
    select: 'statut_key,label,color,sort_order,notify',
    ville: `eq.${ville}`,
    order: 'sort_order.asc',
  });
}

/** Réglages exposables au public : jamais l'email de la mairie ni les quotas. */
export function publicSettings(settings) {
  return {
    intro_text: settings?.intro_text || null,
    success_text: settings?.success_text || null,
    paused: settings?.paused === true,
    pause_message: settings?.pause_message || null,
  };
}

/* ─── Sérialisation publique d'un signalement ─── */

/**
 * Propriétés servies au public pour un signalement PUBLIÉ. Whitelist stricte :
 * jamais email, ip_hash, tokens ni photo_path (bucket privé).
 */
export function publicProps(row, categories, statuts) {
  const cat = categories.find((c) => c.category_key === row.category_key);
  const st = statuts.find((s) => s.statut_key === row.statut_key);
  return {
    id: row.id,
    reference: row.reference,
    category_key: row.category_key,
    category_label: cat?.label || row.category_key,
    category_icon: cat?.icon_class || 'fa-solid fa-circle-exclamation',
    category_color: cat?.color || '#6B7280',
    statut_key: row.statut_key,
    statut_label: st?.label || row.statut_key,
    statut_color: st?.color || '#6B7280',
    description: row.description || null,
    photo_url: row.photo_url || null,
    adresse: row.adresse || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/* ─── Événements ─── */

export async function insertEvent({ signalementId, ville, type, oldStatut = null, newStatut = null, messagePublic = null, author = null }) {
  await svcInsert('participer_events', {
    signalement_id: signalementId,
    ville,
    type,
    old_statut: oldStatut,
    new_statut: newStatut,
    message_public: messagePublic,
    author,
  });
}

/* ─── Anti-abus ─── */

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash d'IP SALÉ : un SHA-256 d'IPv4 nue se brute-force en secondes. Le sel
 * vient de PARTICIPER_IP_SALT, à défaut de la clé de service (jamais publique).
 */
export async function hashIp(ip) {
  const salt = process.env.PARTICIPER_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'op-participer';
  return (await sha256Hex(`${salt}:${ip || 'inconnu'}`)).slice(0, 24);
}

/* ─── Emails du module ───────────────────────────────────────────────────────

   Transport commun lib/mail.mjs. Expéditeur : le domaine déjà vérifié du site
   (surchargeable par PARTICIPER_MAIL_FROM), réponse routée vers la mairie
   quand son adresse est configurée. L'habitant ne voit jamais d'adresse
   d'agent, la mairie ne voit jamais l'adresse de l'habitant dans les contenus
   publics. */

const from = () => process.env.PARTICIPER_MAIL_FROM || EXPEDITEUR_DEFAUT;

function htmlBase(corps) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td>
          <p style="margin:0 0 28px;">
            <img src="${SITE}/home/img/logos/classic_color.png" alt="Open Projets" width="132" style="width:132px;height:auto;border:0;display:block;">
          </p>
          ${corps}
          <hr style="border:0;border-top:1px solid #e6e6ea;margin:32px 0 16px;">
          <p style="margin:0;color:#8a8a96;font-size:12px;line-height:1.6;">
            Vous recevez ce message parce qu'un signalement a été déposé avec cette adresse
            sur la carte participative de votre collectivité. Votre adresse n'est jamais
            rendue publique.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const P = 'margin:0 0 16px;color:#4a4a55;font-size:15px;line-height:1.65;';
const BTN = 'display:inline-block;background:#FF0037;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px;';
const LINK_NOTE = 'margin:0 0 24px;color:#8a8a96;font-size:13px;word-break:break-all;';

function bouton(url, libelle) {
  const u = echapperHtml(url);
  return `<p style="margin:0 0 8px;"><a href="${u}" style="${BTN}">${echapperHtml(libelle)}</a></p>
<p style="${LINK_NOTE}">${u}</p>`;
}

async function expedier({ to, subject, text, html, replyTo }) {
  return envoyerEmail({
    to, subject, text,
    html: htmlBase(html),
    from: from(),
    replyTo: replyTo ? [replyTo] : [],
  });
}

/** 1er message : lien de confirmation du dépôt. */
export function mailConfirmation({ to, confirmUrl, replyTo }) {
  return expedier({
    to,
    replyTo,
    subject: 'Confirmez votre signalement',
    text: [
      'Bonjour,',
      '',
      'Vous venez de déposer un signalement sur la carte participative de votre collectivité.',
      'Pour le transmettre, confirmez votre adresse en ouvrant ce lien :',
      confirmUrl,
      '',
      'Sans confirmation sous 7 jours, le signalement sera supprimé.',
      "Si vous n'êtes pas à l'origine de ce dépôt, ignorez simplement ce message.",
    ].join('\n'),
    html: `<p style="${P}">Bonjour,</p>
<p style="${P}">Vous venez de déposer un signalement sur la carte participative de votre collectivité. Pour le transmettre, confirmez votre adresse :</p>
${bouton(confirmUrl, 'Confirmer mon signalement')}
<p style="${P}">Sans confirmation sous 7 jours, le signalement sera supprimé. Si vous n'êtes pas à l'origine de ce dépôt, ignorez simplement ce message.</p>`,
  });
}

/** Accusé de réception après confirmation, avec référence et lien de suivi. */
export function mailAccuse({ to, reference, suiviUrl, replyTo }) {
  return expedier({
    to,
    replyTo,
    subject: `Signalement ${reference} bien reçu`,
    text: [
      'Bonjour,',
      '',
      `Votre signalement a bien été transmis. Sa référence est ${reference}.`,
      'Vous pouvez suivre son traitement à tout moment ici :',
      suiviUrl,
      '',
      'Vous serez informé par email à chaque étape de son traitement.',
    ].join('\n'),
    html: `<p style="${P}">Bonjour,</p>
<p style="${P}">Votre signalement a bien été transmis. Sa référence est <strong>${echapperHtml(reference)}</strong>.</p>
${bouton(suiviUrl, 'Suivre mon signalement')}
<p style="${P}">Vous serez informé par email à chaque étape de son traitement.</p>`,
  });
}

/** Notification d'un changement de statut, avec l'éventuel message de la collectivité. */
export function mailStatut({ to, reference, statutLabel, message, suiviUrl, replyTo }) {
  const msg = String(message || '').trim();
  return expedier({
    to,
    replyTo,
    subject: `Signalement ${reference} : ${statutLabel}`,
    text: [
      'Bonjour,',
      '',
      `Votre signalement ${reference} est maintenant : ${statutLabel}.`,
      ...(msg ? ['', 'Message de votre collectivité :', msg] : []),
      '',
      'Le détail et l\'historique complet :',
      suiviUrl,
    ].join('\n'),
    html: `<p style="${P}">Bonjour,</p>
<p style="${P}">Votre signalement <strong>${echapperHtml(reference)}</strong> est maintenant : <strong>${echapperHtml(statutLabel)}</strong>.</p>
${msg ? `<p style="${P}">Message de votre collectivité :</p><blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #FF0037;color:#4a4a55;font-size:15px;line-height:1.65;">${echapperHtml(msg)}</blockquote>` : ''}
${bouton(suiviUrl, 'Voir le détail')}`,
  });
}

/** Message interne à la mairie (nouveau signalement, alerte, demande de retrait). */
export function mailMairie({ to, subject, lignes }) {
  const adminUrl = `${SITE}/admin/participer/`;
  return expedier({
    to,
    subject,
    text: [...lignes, '', 'Traiter dans votre espace :', adminUrl].join('\n'),
    html: `${lignes.map((l) => `<p style="${P}">${echapperHtml(l)}</p>`).join('\n')}
${bouton(adminUrl, 'Ouvrir l\'espace de traitement')}`,
  });
}
