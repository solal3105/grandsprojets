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

// Aides HTTP génériques (CORS, réponses, JWT, rôle) : extraites dans http.mjs,
// ré-exportées ici pour que ai-generate et ai-diagnostic n'aient rien à changer.
// Import puis export en deux temps : le transformateur de Playwright compile
// mal la forme `export ... from` quand un spec importe ce fichier en Node.
import { getCorsHeaders, errResp, preflightResp, getAuthedUser, isAdminForVille } from './http.mjs';
export { getCorsHeaders, errResp, preflightResp, getAuthedUser, isAdminForVille };

// Passerelle IA Netlify : quand elle est active, OPENAI_API_KEY est un jeton
// de passerelle valable uniquement sur OPENAI_BASE_URL (jamais api.openai.com).
export const OPENAI_RESPONSES_URL =
  (process.env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com') + '/v1/responses';

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
 * @param {Function} [opts.onFin]           - (emit) => void ; dernier mot avant fermeture, appelé
 *                                            quel que soit le chemin de sortie (fin normale,
 *                                            plafond atteint, coupure) tant que [DONE] n'est pas parti
 * @param {Function} opts.onTimeoutMessage  - () => string|null ; message si timeout sans contenu
 * @param {Function} [opts.isDone]          - (ev) => bool ; l'événement termine le stream
 * @param {Function} opts.setReader         - (reader|null) => void ; expose le reader pour l'annulation
 * @param {Function} opts.clearTimeoutFn    - à appeler quand le stream se termine
 * @param {string} [opts.conseil400]
 * @returns {Response} la réponse SSE à retourner au client
 */
export function relayOpenAIStream(openaiRes, {
  tag, corsHeaders, onEvent, onFin, onTimeoutMessage, isDone, setReader, clearTimeoutFn, conseil400 = '',
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
        /* Dernier mot avant la fermeture. Ce qu'un appelant a accumulé au fil du
           flux - les sources citées, par exemple - doit pouvoir partir même
           quand aucun événement de fin n'arrive : génération arrêtée à son
           plafond de sortie, coupure réseau, délai dépassé alors que du texte
           était déjà reçu. Sans ce point d'accroche, ces cas perdaient
           silencieusement ce qui avait été relevé. */
        if (onFin && !doneSent) await onFin(emit);
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
