/** Reprises bornées : une pause interrompt aussi l'attente entre deux appels. */
export function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new DOMException('Analyse interrompue', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

export async function readAnalysisResponse(response) {
  const data = await response.json().catch(() => null);
  if (response.ok && data) return data;
  const retryable = data?.retryable ?? (response.ok || [408, 429, 500, 502, 503, 504].includes(response.status));
  const message = data?.error || (response.status === 401 ? 'Votre session a expiré. Reconnectez-vous pour reprendre l’analyse.' : 'Le service d’analyse est momentanément indisponible.');
  const retryHeader = response.headers.get('Retry-After');
  const delay = Number(retryHeader) * 1000 || Date.parse(retryHeader) - Date.now() || 0;
  throw Object.assign(new Error(message), { retryable, code: data?.code || 'service', status: response.status, usage: data?._usage, retryAfter: Math.min(30000, Math.max(0, delay)) });
}

export async function recoverRequest(payload, validate, { request, signal, notify = () => {}, wait = waitForRetry, splittable = false }) {
  let issue = '', details = {}, repairs = 0, failures = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Analyse interrompue', 'AbortError');
    let result;
    try {
      result = await request({ ...payload, ...(issue ? { retryReason: 'quality', qualityIssue: issue, qualityDetails: details } : {}) }, signal);
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
      if (repairs >= 1) throw error;
      repairs++; issue = error.issue || 'format'; details = error.details || {};
      notify({ recovery: 'quality', attempt: repairs, attempts: 1 });
    }
  }
}
