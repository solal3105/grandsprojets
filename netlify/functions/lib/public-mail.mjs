/**
 * Les e-mails demandés sans compte (lien d'une démonstration, estimation) :
 * chaque demande est inscrite en base avant d'agir, par `reserve_public_mail`
 * (migration 20261110190000). La base compte, sur vingt-quatre heures, ce
 * qu'une même origine a demandé, ce qu'une même adresse a reçu et ce que le
 * formulaire entier a envoyé, et dit quoi faire de la demande :
 *
 *   - `reserved` : le message part ;
 *   - `recipient` ou `total` : la demande est gardée, sans message (l'adresse
 *     ou le formulaire a atteint son plafond de messages) ;
 *   - `ip` : la demande est ignorée (l'origine a atteint son plafond).
 *
 * Une panne de la base ne fait pas perdre une demande : sans réponse, le
 * message part quand même (`unavailable`), puisqu'il est alors la seule trace
 * que l'équipe en garde. Les refus, eux, ne viennent que de la base.
 */

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';

export async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** L'empreinte d'une adresse IP, celle que `demo_leads.ip_hash` porte déjà. */
export const ipHashOf = async (ip) => (await sha256Hex(ip || 'inconnu')).slice(0, 24);

/**
 * @param {{ kind: string, ipHash: string, email: string, limits: { ip: number, recipient: number, total: number } }} send
 * @returns {Promise<'reserved'|'recipient'|'ip'|'total'|'unavailable'>}
 */
export async function reservePublicMail({ kind, ipHash, email, limits }) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return 'unavailable';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserve_public_mail`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_kind: kind,
        p_ip_hash: ipHash,
        p_recipient: email,
        p_max_ip: limits.ip,
        p_max_recipient: limits.recipient,
        p_max_total: limits.total,
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const status = await r.json();
    if (!['reserved', 'recipient', 'ip', 'total'].includes(status)) throw new Error('réponse inattendue');
    return status;
  } catch (e) {
    console.error(`[public-mail] réservation impossible (${kind}) :: ${e?.message}`);
    return 'unavailable';
  }
}

/** Vrai quand la demande est à traiter : tout sauf une origine au plafond. */
export const mayKeep = (status) => status !== 'ip';

/** Vrai quand le message peut partir : réservé, ou base injoignable. */
export const maySend = (status) => status === 'reserved' || status === 'unavailable';

/** Ce qu'on note à la place de l'issue d'un envoi quand un plafond l'a retenu. */
export const heldMail = (status) => ({ status: 'echec', error: `plafond des vingt-quatre heures (${status})` });
