/** Reprises bornées : une pause interrompt aussi l'attente entre deux appels. */
export function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new DOMException('Analyse interrompue', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

/* Réponses techniques du relais, écrites pour les développeurs : l'agent lit une
   phrase qui dit quoi faire. Les autres messages du relais lui sont déjà destinés. */
const TECHNICAL = {
  'Method not allowed': 'La demande n’a pas pu être envoyée. Rechargez la page, puis reprenez l’analyse.',
  'Invalid JSON': 'La demande n’a pas pu être envoyée. Rechargez la page, puis reprenez l’analyse.',
  'OPENAI_API_KEY not configured': 'Nous n’avons pas pu nous connecter au service d’analyse. Ce qui est déjà fait est conservé. Si le message revient, écrivez-nous depuis openprojets.com/contact.',
};
export async function readAnalysisResponse(response) {
  const data = await response.json().catch(() => null);
  if (response.ok && data) return data;
  const retryable = data?.retryable ?? (response.ok || [408, 429, 500, 502, 503, 504].includes(response.status));
  const message = response.status === 401 ? 'Votre session a expiré. Reconnectez-vous, puis reprenez l’analyse : ce qui est fait est conservé.'
    : TECHNICAL[data?.error] || data?.error || 'Le service d’analyse est momentanément indisponible. Ce qui est fait est conservé ; reprenez l’analyse dans quelques minutes.';
  const retryHeader = response.headers.get('Retry-After');
  const delay = Number(retryHeader) * 1000 || Date.parse(retryHeader) - Date.now() || 0;
  throw Object.assign(new Error(message), { retryable, code: data?.code || 'service', status: response.status, usage: data?._usage, retryAfter: Math.min(30000, Math.max(0, delay)) });
}

/** Le numéro d'essai ne sert qu'à distinguer deux demandes identiques : une réponse
 * refusée ne doit jamais revenir telle quelle de la mémoire du service. */
export async function recoverRequest(payload, validate, { request, signal, notify = () => {}, wait = waitForRetry, splittable = false, attempt = 0, onReject = () => {}, repairs = 1 }) {
  let issue = '', details = {}, repaired = 0, failures = 0, tries = attempt;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Analyse interrompue', 'AbortError');
    let result;
    try {
      result = await request({ ...payload, ...(tries ? { attempt: tries } : {}), ...(issue ? { retryReason: 'quality', qualityIssue: issue, qualityDetails: details } : {}) }, signal);
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      if (splittable && ['timeout', 'incomplete'].includes(error.code)) throw error;
      if (!(error.retryable || error instanceof TypeError) || failures >= 2) throw error;
      failures++;
      notify({ recovery: 'network', attempt: failures, attempts: 2 });
      await wait(Math.max(error.retryAfter || 0, failures === 1 ? 1000 : 3000), signal);
      continue;
    }
    if (signal?.aborted) throw new DOMException('Analyse interrompue', 'AbortError');
    try { return validate(result); }
    catch (error) {
      error.code = 'quality';
      onReject(++tries);
      if (repaired >= repairs) throw error;
      repaired++; issue = error.issue || 'format'; details = error.details || {};
      notify({ recovery: 'quality', attempt: repaired, attempts: repairs });
    }
  }
}
