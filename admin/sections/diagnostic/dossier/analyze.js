import { ANALYSIS_VERSION, fingerprint, originalsFor } from './quality.mjs';
import { makeBatches, validateBatchResult, validateOverview, validateReview, assertClearWording } from './contract.mjs';
import { initialFindingOrder } from './presentation.js';
import { recoverRequest, waitForRetry } from './recovery.js';

export function prepareLayerRefresh(dossier) {
  if (dossier.analysis.status !== 'complete' || !dossier.findings.some((f) => f.kind === 'testimony' && f.sourceIds.length > 1)) return false;
  // Une version retouchée conserve les arbitrages de la collectivité.
  if (dossier.findings.some((f) => f.edited || f.included === false)) return false;
  dossier.analysis.status = 'pending'; dossier.analysis.scopeVersion = null;
  dossier.overview = null;
  return true;
}

/** Les formulations anciennes reconnues comme creuses sont reprises depuis les
 * lectures conservées. Une sélection ou une reformulation manuelle reste intacte. */
export function prepareWordingRefresh(dossier) {
  const state = dossier.analysis;
  if (state.status !== 'complete' || dossier.findings.some((f) => f.edited || f.included === false)) return false;
  try {
    dossier.findings.filter((f) => f.kind === 'testimony').forEach((f) => assertClearWording(`${f.title} ${f.reading}`));
    assertClearWording(dossier.overview?.text);
    return false;
  } catch (error) {
    if (error.issue !== 'clarity') return false;
  }
  const parts = new Set(Object.values(state.batches || {}).flatMap((batch) => batch.completedParts));
  const batches = makeBatches(dossier.observations);
  if (!batches.length || batches.some((batch) => batch.observations.some((o) => !parts.has(o.id)))) return false;
  state.synthesis = {}; state.overviews = {}; state.reviews = {}; state.legacyReview = true;
  state.splits = Object.fromEntries(Object.entries(state.splits || {}).filter(([id]) => !id.startsWith('s')));
  state.status = 'pending'; state.error = ''; dossier.overview = null;
  return true;
}

/** Une modification de l'objet ne relit pas les observations déjà vérifiées. */
export function refreshOverview(dossier) {
  dossier.overview = null;
  dossier.analysis.overviews = {};
  dossier.analysis.overviewOnly = true;
  dossier.analysis.status = 'pending';
  dossier.analysis.error = '';
  dossier.analysis.lastError = null;
}

/** Les résultats validés sont liés aux textes, aux sources et à la version des consignes. */
export async function analyzeDossier(dossier, { request, signal, checkpoint = async () => {}, progress = () => {}, wait = waitForRetry }) {
  const batches = makeBatches(dossier.observations), state = dossier.analysis;
  state.batches ||= {}; state.reviews ||= {}; state.overviews ||= {}; state.splits ||= {};
  state.synthesis ||= {};
  state.runId ||= crypto.randomUUID();
  state.status = 'running'; state.error = '';
  let step = {};
  const report = (value) => { step = value; progress(value); };
  const notify = (value) => { state.recoveries = (state.recoveries || 0) + 1; progress({ ...step, ...value }); };
  const sourcesFor = (ids) => dossier.sources.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, label: s.label, provider: s.provider, period: s.period.label, description: s.description }));
  const divide = (batch) => { const middle = Math.ceil(batch.observations.length / 2); return [{ id: `${batch.id}.a`, observations: batch.observations.slice(0, middle) }, { id: `${batch.id}.b`, observations: batch.observations.slice(middle) }]; };
  const leaves = (batch) => state.splits[batch.id] && batch.observations.length > 1 ? divide(batch).flatMap(leaves) : [batch];
  const completed = () => {
    const parts = new Set(Object.values(state.batches).flatMap((b) => b.completedParts));
    state.completedIds = dossier.observations.filter((o) => {
      const fragments = batches.flatMap((b) => b.observations).filter((part) => part.originalId === o.id);
      return fragments.length && fragments.every((part) => parts.has(part.id));
    }).map((o) => o.id);
  };
  const publish = () => {
    const groups = batches.flatMap(leaves).flatMap((batch) => (state.reviews[batch.id] || state.batches[batch.id])?.groups || []);
    // Les arbitrages humains survivent à une nouvelle synthèse de l'objet.
    const edited = new Map(dossier.findings.filter((f) => f.edited || f.included === false).map((f) => [f.id, f]));
    dossier.findings = [...dossier.findings.filter((f) => f.kind !== 'testimony'), ...groups.map((g) => edited.get(`reading-${g.id}`) || { ...g, id: `reading-${g.id}`, kind: 'testimony', included: true })];
    dossier.findings = initialFindingOrder(dossier);
  };
  const send = async (payload, requestSignal) => {
    const result = await request({ ...payload, objective: dossier.objective || '', generationId: state.runId, familyId: dossier.familyId, version: ANALYSIS_VERSION }, requestSignal);
    if (result?._usage) state.usage = result._usage;
    return result;
  };
  const checkedRequest = (payload, validate, splittable = false) => recoverRequest(payload, validate, { request: send, signal, wait, notify, splittable });
  const abort = () => { if (signal?.aborted) throw new DOMException('Analyse interrompue', 'AbortError'); };
  const readBatch = async (batch, depth = 0) => {
    abort();
    if (state.splits[batch.id] && batch.observations.length > 1) { for (const child of divide(batch)) await readBatch(child, depth + 1); return; }
    const sources = sourcesFor(new Set(batch.observations.map((o) => o.sourceId)));
    const hash = await fingerprint([ANALYSIS_VERSION, batch.observations, sources]);
    const legacy = state.batches[batch.id];
    if (state.legacyReview && legacy && !legacy.fingerprint && legacy.completedParts.length === batch.observations.length && batch.observations.every((o) => legacy.completedParts.includes(o.id))) {
      legacy.fingerprint = hash; legacy.exclusions ||= [];
      for (const group of legacy.groups) group.partIds = batch.observations.filter((o) => group.observationIds.includes(o.originalId)).map((o) => o.id);
    }
    if (state.batches[batch.id]?.fingerprint !== hash) { delete state.batches[batch.id]; delete state.reviews[batch.id]; }
    if (!state.batches[batch.id]) {
      try {
        state.batches[batch.id] = { ...await checkedRequest({ phase: 'read', observations: batch.observations, sources }, (result) => validateBatchResult(result, batch), batch.observations.length > 1 && depth < 1), fingerprint: hash };
      } catch (error) {
        // Une seule division : les erreurs de sens ne doivent pas engendrer un arbre de dépenses.
        if (signal?.aborted || !['timeout', 'incomplete'].includes(error.code) || batch.observations.length < 2 || depth >= 1) throw error;
        state.splits[batch.id] = true; notify({ recovery: 'split' }); await checkpoint();
        for (const child of divide(batch)) await readBatch(child, depth + 1);
        return;
      }
      completed(); publish(); await checkpoint();
    }
    if (state.reviews[batch.id]?.fingerprint !== hash) {
      report({ ...step, phase: 'review' });
      const read = state.batches[batch.id];
      state.reviews[batch.id] = { ...await checkedRequest({ phase: 'review', observations: batch.observations, groups: read.groups, exclusions: read.exclusions || [], sources }, (result) => validateReview(result, read, batch)), fingerprint: hash };
      publish(); await checkpoint();
    }
  };
  try {
    // Enregistrer l'identifiant avant le premier appel, même si sa réponse se perd.
    await checkpoint();
    const validIds = new Set(batches.flatMap(leaves).map((b) => b.id));
    for (const cache of [state.batches, state.reviews]) for (const id of Object.keys(cache)) if (!validIds.has(id)) delete cache[id];
    for (let i = 0; !state.overviewOnly && i < batches.length; i++) {
      report({ phase: 'read', current: i + 1, total: batches.length });
      await readBatch(batches[i]);
    }
    if (!state.overviewOnly) publish();
    const findings = dossier.findings.filter((f) => f.included !== false);
    const inputs = findings.map((f) => ({ id: f.id, title: f.title, reading: f.reading, caveat: f.caveat, question: f.question, kind: f.kind, observationIds: f.observationIds, sources: sourcesFor(new Set(f.sourceIds)), facts: dossier.facts.filter((fact) => f.factIds.includes(fact.id)) }));
    if (inputs.length) {
      const observations = originalsFor(findings, dossier.observations);
      const payload = { phase: 'overview', sources: [], readings: inputs, observations };
      const hash = await fingerprint([ANALYSIS_VERSION, dossier.objective || '', payload]);
      report({ phase: 'overview', current: 1, total: 1 });
      if (!state.overviews[hash]) state.overviews[hash] = await checkedRequest(payload, (result) => validateOverview(result, inputs, observations));
      dossier.overview = state.overviews[hash];
      state.overviewObjective = dossier.objective || '';
    }
    if (!state.overviewOnly) completed();
    state.overviewOnly = false; state.status = 'complete'; state.pipelineVersion = ANALYSIS_VERSION; state.lastError = null;
  } catch (error) {
    if (!state.overviewOnly) completed();
    state.status = signal?.aborted ? 'paused' : 'partial';
    state.error = signal?.aborted ? '' : error.message;
    if (error.usage) state.usage = error.usage;
    state.lastError = signal?.aborted ? null : { code: error.code || 'unknown', phase: step.phase, at: new Date().toISOString() };
  }
  await checkpoint();
  return dossier;
}
