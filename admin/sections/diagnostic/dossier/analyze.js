import { ANALYSIS_VERSION, fingerprint, originalsFor } from './quality.mjs';
import { makeBatches, validateBatchResult, validateOverview, validateReview, validateSynthesis, assertClearWording, SYNTHESIS_GROUPS, SYNTHESIS_TEXT_CHARS, SYNTHESIS_TOTAL_CHARS } from './contract.mjs';
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

/** Signature synchrone des groupes d'une couche : un rapprochement n'est
 * réutilisé que pour les groupes exacts qu'il a reçus. */
export function groupsSignature(groups) {
  const value = JSON.stringify([ANALYSIS_VERSION, groups.map((g) => [g.id, g.title, g.reading, g.caveat, g.question, g.observationIds])]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `${value.length}:${hash.toString(16)}`;
}

/** Les groupes d'une couche partent ensemble au rapprochement, avec leurs textes
 * d'origine ; seule une couche très volumineuse est découpée en ensembles. */
export function synthesisChunks(groups, observations) {
  const texts = new Map(observations.map((o) => [o.id, o.text || '']));
  const size = (g) => JSON.stringify([g.title, g.reading, g.caveat, g.question]).length
    + g.observationIds.reduce((sum, id) => sum + Math.min(SYNTHESIS_TEXT_CHARS, (texts.get(id) || '').length) + 24, 0);
  const chunks = [];
  let current = [], total = 0;
  for (const group of groups) {
    const weight = size(group);
    if (current.length && (current.length >= SYNTHESIS_GROUPS || total + weight > SYNTHESIS_TOTAL_CHARS)) { chunks.push(current); current = []; total = 0; }
    current.push(group); total += weight;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Une modification de l'objet ne relit pas les observations déjà vérifiées.
 * La synthèse précédente est gardée de côté : si la nouvelle échoue, elle revient. */
export function refreshOverview(dossier) {
  if (dossier.overview) dossier.analysis.previousOverview = dossier.overview;
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
  state.synthesis ||= {}; state.attempts ||= {};
  state.runId ||= crypto.randomUUID();
  state.status = 'running'; state.error = ''; state.refreshError = '';
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
  /* Les groupes lus, rangés par couche dans l'ordre des lots. Une couche lue en
     plusieurs lots doit être rapprochée : un même sujet a pu y donner plusieurs groupes. */
  const layerGroups = () => {
    const layers = new Map();
    for (const batch of batches) {
      const layerId = batch.observations[0]?.sourceId;
      if (!layers.has(layerId)) layers.set(layerId, { lots: 0, groups: [] });
      const layer = layers.get(layerId);
      layer.lots++;
      for (const leaf of leaves(batch)) layer.groups.push(...((state.reviews[leaf.id] || state.batches[leaf.id])?.groups || []));
    }
    return layers;
  };
  const publish = () => {
    const readings = [];
    for (const [layerId, layer] of layerGroups()) {
      const merged = state.synthesis[layerId];
      if (merged?.signature && merged.signature === groupsSignature(layer.groups)) readings.push(...merged.findings);
      else readings.push(...layer.groups.map((g) => ({ ...g, id: `reading-${g.id}`, kind: 'testimony', included: true })));
    }
    // Les arbitrages humains survivent à une nouvelle synthèse de l'objet.
    const edited = new Map(dossier.findings.filter((f) => f.edited || f.included === false).map((f) => [f.id, f]));
    dossier.findings = [...dossier.findings.filter((f) => f.kind !== 'testimony'), ...readings.map((f) => edited.get(f.id) || f)];
    dossier.findings = initialFindingOrder(dossier);
  };
  const sendOnce = async (payload, requestSignal) => {
    const result = await request({ ...payload, objective: dossier.objective || '', generationId: state.runId, familyId: dossier.familyId, version: ANALYSIS_VERSION }, requestSignal);
    if (result?._usage) state.usage = result._usage;
    return result;
  };
  const send = async (payload, requestSignal) => {
    try { return await sendOnce(payload, requestSignal); }
    catch (error) {
      // Une version reprise par un collègue ne peut pas prolonger la génération d'un
      // autre compte : une nouvelle génération reprend là où le dossier s'est arrêté.
      if (error.code !== 'forbidden' || state.runRenewedFor === state.runId) throw error;
      state.runId = crypto.randomUUID(); state.runRenewedFor = state.runId;
      await checkpoint();
      return sendOnce(payload, requestSignal);
    }
  };
  // Les essais refusés d'une étape sont conservés : une reprise redemande une vraie réponse.
  const checkedRequest = (payload, validate, { key, splittable = false, repairs = 1 }) => recoverRequest(payload, validate, {
    request: send, signal, wait, notify, splittable, repairs,
    attempt: state.attempts[key] || 0, onReject: (value) => { state.attempts[key] = value; },
  });
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
        state.batches[batch.id] = { ...await checkedRequest({ phase: 'read', observations: batch.observations, sources }, (result) => validateBatchResult(result, batch), { key: `read:${batch.id}`, splittable: batch.observations.length > 1 && depth < 1 }), fingerprint: hash };
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
      state.reviews[batch.id] = { ...await checkedRequest({ phase: 'review', observations: batch.observations, groups: read.groups, exclusions: read.exclusions || [], sources }, (result) => validateReview(result, read, batch), { key: `review:${batch.id}` }), fingerprint: hash };
      publish(); await checkpoint();
    }
  };
  /* Rapprochement : les groupes de tous les lots d'une couche sont réunis quand ils
     décrivent la même situation. Les preuves de chaque constat restent calculées
     par le code à partir des groupes cités ; un groupe oublié reste un constat. */
  const mergeLayers = async () => {
    const pending = [...layerGroups()].filter(([, layer]) => layer.lots > 1 && layer.groups.length > 1);
    for (let i = 0; i < pending.length; i++) {
      const [layerId, { groups }] = pending[i];
      const signature = groupsSignature(groups);
      if (state.synthesis[layerId]?.signature === signature) continue;
      report({ phase: 'synthesize', current: i + 1, total: pending.length });
      const sources = sourcesFor(new Set([layerId]));
      const chunks = synthesisChunks(groups, dossier.observations);
      const findings = [];
      let calls = 0;
      // Un ensemble trop long pour le délai du service est repris en deux moitiés, une seule fois.
      const mergeChunk = async (chunk, key, depth = 0) => {
        abort();
        const observations = originalsFor(chunk, dossier.observations).map(({ id, text }) => ({ id, text: String(text || '').slice(0, SYNTHESIS_TEXT_CHARS) }));
        const payload = { phase: 'synthesize', sources, observations, facts: [],
          groups: chunk.map(({ id, title, reading, caveat, question, observationIds }) => ({ id, title, reading, caveat, question, observationIds })) };
        const splittable = chunk.length > 12 && depth < 1;
        try {
          const merged = await checkedRequest(payload, (result) => validateSynthesis(result, chunk, [], dossier.observations), { key, splittable });
          calls++;
          return merged;
        } catch (error) {
          if (signal?.aborted || !splittable || !['timeout', 'incomplete'].includes(error.code)) throw error;
          notify({ recovery: 'split' });
          const middle = Math.ceil(chunk.length / 2);
          return [...await mergeChunk(chunk.slice(0, middle), `${key}.a`, depth + 1), ...await mergeChunk(chunk.slice(middle), `${key}.b`, depth + 1)];
        }
      };
      try {
        for (let c = 0; c < chunks.length; c++) findings.push(...await mergeChunk(chunks[c], `synthesize:${layerId}:${c}`));
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError' || ['budget', 'forbidden', 'configuration'].includes(error.code)) throw error;
        // Un rapprochement impossible n'empêche pas le dossier : les constats de la
        // couche restent tels qu'ils ont été lus, et la méthode le signale.
        state.mergeFailures = { ...state.mergeFailures, [layerId]: error.code || 'unknown' };
        await checkpoint();
        continue;
      }
      if (state.mergeFailures) delete state.mergeFailures[layerId];
      state.synthesis[layerId] = { signature, chunks: calls, findings };
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
    if (!state.overviewOnly) { publish(); await mergeLayers(); publish(); }
    const findings = dossier.findings.filter((f) => f.included !== false);
    const inputs = findings.map((f) => ({ id: f.id, title: f.title, reading: f.reading, caveat: f.caveat, question: f.question, kind: f.kind, observationIds: f.observationIds, sources: sourcesFor(new Set(f.sourceIds)), facts: dossier.facts.filter((fact) => f.factIds.includes(fact.id)) }));
    if (inputs.length) {
      const observations = originalsFor(findings, dossier.observations);
      const payload = { phase: 'overview', sources: [], readings: inputs, observations };
      const hash = await fingerprint([ANALYSIS_VERSION, dossier.objective || '', payload]);
      report({ phase: 'overview', current: 1, total: 1 });
      // La conclusion a droit à une reprise de plus : c'est la seule étape que personne ne peut contourner.
      if (!state.overviews[hash]) state.overviews[hash] = await checkedRequest(payload, (result) => validateOverview(result, inputs, observations), { key: `overview:${hash}`, repairs: 2 });
      dossier.overview = state.overviews[hash];
      state.overviewObjective = dossier.objective || '';
    }
    if (!state.overviewOnly) completed();
    state.overviewOnly = false; state.previousOverview = null;
    state.status = 'complete'; state.pipelineVersion = ANALYSIS_VERSION; state.lastError = null;
  } catch (error) {
    if (!state.overviewOnly) completed();
    state.status = signal?.aborted ? 'paused' : 'partial';
    state.error = signal?.aborted ? '' : error.message;
    if (error.usage) state.usage = error.usage;
    state.lastError = signal?.aborted ? null : { code: error.code || 'unknown', phase: step.phase, at: new Date().toISOString() };
    // Une actualisation de la synthèse qui échoue rend la précédente : le dossier reste complet.
    if (state.overviewOnly && state.previousOverview && !signal?.aborted) {
      dossier.overview = state.previousOverview;
      state.refreshError = error.message;
      state.overviewOnly = false; state.previousOverview = null;
      state.status = 'complete'; state.lastError = null; state.error = '';
    }
  }
  await checkpoint();
  return dossier;
}
