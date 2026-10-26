/** Relais de l'assistant « Demander » du diagnostic terrain : une étape par appel
 * (comprendre la demande, puis rédiger la réponse), chacune réservée puis soldée dans
 * le budget en base comme le dossier de zone. Le rôle et la ville sont contrôlés par l'appelant. */
import { OPENAI_RESPONSES_URL, errResp, friendlyAIError } from './ai-common.mjs';
import { ASSISTANT_VERSION, validateAssistantRequest, buildAssistantPayload } from '../../../admin/sections/diagnostic/assistant/contract.mjs';
import { maskPersonalData } from '../../../admin/sections/diagnostic/dossier/contract.mjs';
import { createBudgetStore, requestHash, usageCost, reservedCost } from './diagnostic-budget.mjs';

const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Les textes des habitants partent sans coordonnées de contact ni lien. */
function maskTexts(data) {
  if (!Array.isArray(data.couches)) return data;
  return { ...data, couches: data.couches.map((c) => (Array.isArray(c?.textes) ? { ...c, textes: c.textes.map((t) => ({ ...t, texte: maskPersonalData(t?.texte) })) } : c)) };
}

export async function answerAssistant(body, apiKey, corsHeaders, options = {}) {
  let phase, reservation, budget;
  const started = Date.now(), fetchAI = options.fetch || globalThis.fetch;
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const failure = (code, message, retryable, status = 502) => {
    console.warn('[diagnostic/assistant] Échec', { phase, code, status, durationMs: Date.now() - started });
    return response({ error: message, code, retryable }, status);
  };
  try { phase = validateAssistantRequest(body); }
  catch (error) { return errResp(400, error.message, corsHeaders); }
  if (!uuid(body.conversationId) || !uuid(options.user?.id)) return failure('configuration', 'La conversation ne possède pas d’identifiant valide. Ouvrez une nouvelle question.', false, 400);
  if (body.version !== ASSISTANT_VERSION) return failure('configuration', 'L’assistant a été mis à jour. Rechargez la page pour continuer.', false, 409);
  const payload = buildAssistantPayload({ ...body, data: phase === 'write' ? maskTexts(body.data) : body.data });
  const settle = async (status, charge, usage, result, requestId = '') => {
    await budget.settle({ p_call: reservation.call_id, p_status: status, p_charge: charge, p_usage: usage, p_result: result, p_request_id: requestId });
    reservation = null;
  };
  try {
    budget = options.budget || createBudgetStore();
    // Sans comptage exact, la taille en octets majore les jetons d'entrée.
    const tokens = new TextEncoder().encode(JSON.stringify(payload.input)).length;
    reservation = await budget.reserve({ p_run: body.conversationId, p_family: body.conversationId, p_user: options.user.id, p_ville: body.ville,
      p_hash: requestHash({ version: ASSISTANT_VERSION, payload, turn: body.turn || 0 }), p_phase: `assistant_${phase}`, p_model: payload.model,
      p_reserve: reservedCost(payload.model, tokens, payload.max_output_tokens), p_floor: 0 });
    if (reservation.status === 'cached') return response(reservation.result);
    if (reservation.status === 'budget') return failure('budget', 'Cette conversation a atteint sa limite de dépense. Ouvrez une nouvelle question pour continuer.', false, 409);
    if (reservation.status === 'forbidden') return failure('forbidden', 'Cette conversation appartient à un autre utilisateur ou à une autre structure.', false, 403);
    if (reservation.status === 'busy') { reservation = null; return failure('busy', 'Une réponse est déjà en cours. Patientez quelques secondes.', true, 409); }
    if (reservation.status !== 'reserved' || !reservation.call_id) { reservation = null; throw Object.assign(new Error('Le suivi du budget n’a pas autorisé cet appel. Réessayez plus tard.'), { code: 'accounting' }); }
    const res = await fetchAI(OPENAI_RESPONSES_URL, { method: 'POST', signal: AbortSignal.timeout(options.local ? 24000 : 40000), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const requestId = res.headers.get('x-request-id') || '';
    if (!res.ok) {
      const raw = await res.text();
      await settle(res.status >= 500 || res.status === 408 ? 'uncertain' : 'failed', 0, null, null, requestId);
      const retryable = [408, 429, 500, 502, 503, 504].includes(res.status);
      return failure(retryable ? 'service' : 'configuration', friendlyAIError(res.status, raw), retryable);
    }
    const result = await res.json(), cost = usageCost(payload.model, result.usage);
    const raw = (result.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { /* Une réponse incomplète reste comptabilisée. */ }
    const refused = (result.output || []).flatMap((o) => o.content || []).some((c) => c.type === 'refusal');
    const complete = result.status === 'completed' && parsed && !refused;
    await settle(cost === null ? 'uncertain' : complete ? 'complete' : 'failed', cost || 0, result.usage || null, complete ? parsed : null, requestId);
    console.info('[diagnostic/assistant] Usage', { phase, model: payload.model, costMicro: cost, requestId, durationMs: Date.now() - started });
    if (refused) return failure('refusal', 'Le service n’a pas pu traiter cette demande.', false);
    if (!complete) return failure('incomplete', 'La réponse n’a pas pu être terminée. Réessayez.', true);
    return response({ ...parsed, _cost: cost });
  } catch (error) {
    if (reservation?.call_id) {
      try { await settle('uncertain', 0, null, null); }
      catch { return failure('accounting', 'Le suivi du dernier appel est interrompu. Réessayez plus tard.', false); }
    }
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    const code = typeof error.code === 'string' ? error.code : '';
    return failure(code || (timeout ? 'timeout' : 'service'), code ? error.message : timeout ? 'Le service a dépassé le délai de réponse. Réessayez.' : 'La connexion au service a été interrompue.', error.retryable ?? !code);
  }
}
