/**
 * netlify/functions/lib/ai-common.mjs
 *
 * Socle commun aux fonctions qui relaient OpenAI en SSE (ai-generate, ai-diagnostic).
 *
 * Les deux fichiers partageaient 88 lignes significatives strictement identiques :
 * constantes Supabase et passerelle, CORS, `errResp`, `friendlyAIError`, la
 * vérification du JWT, et surtout la boucle de relais SSE (~90 lignes) recopiée
 * mot pour mot. Seuls diffèrent les événements écoutés et les messages.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

// Passerelle IA Netlify : quand elle est active, OPENAI_API_KEY est un jeton
// de passerelle valable uniquement sur OPENAI_BASE_URL (jamais api.openai.com).
export const OPENAI_RESPONSES_URL =
  (process.env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com') + '/v1/responses';

const ALLOWED_ORIGINS = [
  'https://openprojets.com',
  'http://localhost:3001',
  'http://localhost:8888',
];

export function getCorsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export function errResp(status, error, corsHeaders) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Message utilisateur (français) pour une erreur du service IA.
 * @param {number} status - Statut HTTP OpenAI/passerelle (0 si inconnu)
 * @param {string} raw - Corps d'erreur brut (JSON OpenAI ou texte)
 * @param {string} [conseil400] - Complément propre à l'appelant pour le cas 400
 */
export function friendlyAIError(status, raw, conseil400 = '') {
  let code = '';
  let msg = '';
  try {
    const parsed = JSON.parse(raw);
    code = parsed.error?.code || parsed.error?.type || '';
    msg = parsed.error?.message || '';
  } catch { msg = String(raw || ''); }
  const s = Number(status) || 0;
  if (code === 'insufficient_quota' || /quota|billing|credit/i.test(`${code} ${msg}`)) {
    return 'Crédits du service IA épuisés - vérifiez la facturation OpenAI ou les crédits de la passerelle IA Netlify.';
  }
  if (s === 429 || code === 'rate_limit_exceeded') return 'Service IA saturé (limite de débit atteinte) - réessayez dans quelques instants.';
  if (s === 401 || s === 403) return 'Authentification au service IA refusée - clé API ou jeton de passerelle IA Netlify invalide ou expiré.';
  if (s === 402) return 'Crédits du service IA épuisés - vérifiez la facturation.';
  if (s === 404 || code === 'model_not_found') return 'Modèle IA indisponible - vérifiez la configuration.';
  if (s === 400) return `Requête refusée par le service IA - réessayez${conseil400 ? ` ; ${conseil400}` : ''}.`;
  if (s >= 500) return 'Service IA temporairement indisponible - réessayez dans quelques instants.';
  return `Service IA indisponible${s ? ` (HTTP ${s})` : ''} - réessayez.`;
}

/**
 * Vérifie le JWT Supabase de la requête.
 * @param {Request} req
 * @returns {Promise<{id: string, token: string}|null>} l'utilisateur, ou null
 */
export async function getAuthedUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id, token } : null;
  } catch { return null; }
}

/**
 * L'utilisateur est-il admin de cette ville (ou admin global) ?
 * Lecture de son propre profil sous RLS.
 */
export async function isAdminForVille(user, ville) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,ville`,
      { headers: { 'Authorization': `Bearer ${user.token}`, 'apikey': SUPABASE_ANON_KEY } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile || profile.role !== 'admin') return false;
    const villes = Array.isArray(profile.ville) ? profile.ville : [];
    return villes.includes('global') || villes.includes(ville);
  } catch { return false; }
}

/**
 * Relaie un stream OpenAI (Responses API) vers notre format SSE.
 *
 * L'appelant ne fournit que ce qui lui est propre : comment traduire un événement
 * OpenAI en événements client (`onEvent`), et le message à émettre si le délai
 * expire sans contenu.
 *
 * @param {Response} openaiRes - réponse OpenAI en streaming
 * @param {Object} opts
 * @param {string} opts.tag                 - préfixe de log ('ai-generate'…)
 * @param {Object} opts.corsHeaders
 * @param {Function} opts.onEvent           - (ev, emit) => 'stop'|void ; emit(objet) écrit un
 *                                            événement SSE, 'stop' termine le relais
 * @param {Function} opts.onTimeoutMessage  - () => string|null ; message si timeout sans contenu
 * @param {Function} [opts.isDone]          - (ev) => bool ; l'événement termine le stream
 * @param {Function} opts.setReader         - (reader|null) => void ; expose le reader pour l'annulation
 * @param {Function} opts.clearTimeoutFn    - à appeler quand le stream se termine
 * @param {string} [opts.conseil400]
 * @returns {Response} la réponse SSE à retourner au client
 */
export function relayOpenAIStream(openaiRes, {
  tag, corsHeaders, onEvent, onTimeoutMessage, isDone, setReader, clearTimeoutFn, conseil400 = '',
}) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = (s) => new TextEncoder().encode(s);

  (async () => {
    const reader = openaiRes.body.getReader();
    setReader(reader);
    const decoder = new TextDecoder();
    let buffer = '';
    let doneSent = false;
    let emitCount = 0;

    const emit = async (obj) => {
      emitCount++;
      await writer.write(enc(`data: ${JSON.stringify(obj)}\n\n`));
    };
    void emitCount; // compteur de diagnostic ; l'appelant suit son propre décompte
    const sendDone = async () => {
      if (doneSent) return;
      await writer.write(enc('data: [DONE]\n\n'));
      doneSent = true;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);

          if (data === '[DONE]') { await sendDone(); continue; }

          try {
            const ev = JSON.parse(data);

            // Erreur remontée par OpenAI en cours de stream (quota, etc.)
            if (ev.type === 'error') {
              console.error(`[${tag}] OpenAI stream error:`, JSON.stringify(ev.error || {}));
              await emit({ error: friendlyAIError(0, JSON.stringify({ error: ev.error }), conseil400) });
              await sendDone();
              return;
            }

            const suite = await onEvent(ev, emit);
            if (suite === 'stop') { await sendDone(); return; }

            const fin = isDone ? isDone(ev) : (ev.type === 'response.completed' || ev.type === 'response.failed');
            if (fin && !doneSent) {
              console.log(`[${tag}] Terminé - type=${ev.type} événements=${emitCount}`);
              clearTimeoutFn();
              await sendDone();
            }
          } catch (parseErr) {
            console.warn(`[${tag}] Erreur parse event:`, parseErr.message, '| data:', data.slice(0, 200));
          }
        }
      }
    } catch (err) {
      console.error(`[${tag}] Stream error:`, err.name, err.message);
    } finally {
      clearTimeoutFn();
      setReader(null);
      try {
        const msg = onTimeoutMessage();
        if (msg && !doneSent) await emit({ error: msg });
        await sendDone();
        await writer.close();
      } catch { /* writer déjà fermé */ }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
