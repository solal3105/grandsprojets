/** Choix de présentation calculés depuis les preuves, sans réinterpréter les textes. */
export const findingNumber = (index) => String(index + 1).padStart(2, '0');
export const evidenceAnchor = (id) => `dz-proof-${encodeURIComponent(id)}`;
export const findingAnchor = (id) => `dz-constat-${encodeURIComponent(id)}`;
export const orderedFindings = (dossier) => [...dossier.findings.filter((f) => f.kind === 'testimony'), ...dossier.findings.filter((f) => f.kind !== 'testimony')];

/** Un ancien constat transversal n'est jamais dupliqué ni amputé de ses preuves.
 * Sa couche principale sert uniquement au rangement, avec une mention explicite. */
export function findingLayerId(dossier, finding) {
  if (finding.sourceIds.length === 1) return finding.sourceIds[0];
  const counts = new Map();
  for (const o of findingObservations(dossier, finding)) counts.set(o.sourceId, (counts.get(o.sourceId) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || finding.sourceIds[0];
}

export function layerAnalyses(dossier) {
  const completed = new Set(dossier.analysis.completedIds);
  return dossier.sources.map((source) => {
    const findings = dossier.findings.filter((f) => findingLayerId(dossier, f) === source.id);
    const observations = dossier.observations.filter((o) => o.sourceId === source.id);
    const readable = observations.filter((o) => o.text?.trim());
    const read = readable.filter((o) => completed.has(o.id)).length;
    const status = source.status !== 'ready' ? 'error' : !source.count ? 'empty'
      : source.kind === 'temoignages' && readable.length && (dossier.analysis.status !== 'complete' || read < readable.length) ? 'pending'
        : findings.length ? 'ready' : 'uninterpreted';
    return { source, findings, observations, readable: readable.length, read, status };
  });
}

/** Une provenance et une édition communes partagent leur notice. Les volumes
 * restent par couche : additionner des couches dérivées compterait des doublons. */
export function sourceRegister(dossier) {
  const groups = new Map();
  for (const source of dossier.sources) {
    const key = JSON.stringify([source.provenance || source.id, source.dataset || '', source.period.label, source.provider, source.url || '']);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(source);
  }
  return [...groups.values()];
}

/** L'ouverture privilégie une lecture développée, sans score de gravité.
 * Ce choix n'est appliqué qu'après l'analyse, jamais après un réordonnancement. */
export function initialFindingOrder(dossier) {
  const developed = (f) => f.kind === 'testimony' && (distinctTexts(findingObservations(dossier, f)).length > 1 || f.factIds.length > 0);
  return [...dossier.findings].sort((a, b) => Number(developed(b)) - Number(developed(a)));
}

export function findingObservations(dossier, finding) {
  const observations = new Map(dossier.observations.map((o) => [o.id, o]));
  return finding.observationIds.map((id) => observations.get(id)).filter(Boolean);
}

export function distinctTexts(observations) {
  return observations.filter((o, i, all) => o.text && all.findIndex((other) => other.text.trim() === o.text.trim()) === i);
}

export function findingFormat(dossier, finding) {
  const length = [finding.title, finding.reading, finding.caveat, finding.question].join('').length;
  return finding.kind === 'testimony' && distinctTexts(findingObservations(dossier, finding)).length <= 1 && !finding.factIds.length && length < 700 ? 'compact' : 'full';
}

/** Les pages rapprochent les constats courts, sans changer leur ordre éditorial. */
export function findingSheets(dossier) {
  const sheets = [];
  for (const finding of orderedFindings(dossier).filter((f) => f.included !== false && f.kind === 'testimony')) {
    const compact = findingFormat(dossier, finding) === 'compact';
    const previous = sheets.at(-1);
    if (compact && previous?.compact) previous.findings.push(finding);
    else sheets.push({ compact, findings: [finding] });
  }
  return sheets;
}

export function focusBounds(points) {
  const valid = points.filter((p) => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85);
  if (!valid.length) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [x, y] of valid) { west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y); }
  // Au moins 180 m autour d'un point isolé pour garder son contexte viaire.
  const dy = Math.max((north - south) * .12, 180 / 111320);
  const dx = Math.max((east - west) * .12, 180 / (111320 * Math.cos((north + south) * Math.PI / 360)));
  return [Math.max(-180, west - dx), Math.max(-85, south - dy), Math.min(180, east + dx), Math.min(85, north + dy)];
}

export function findingFigureKey(dossier, finding) {
  const bounds = focusBounds(findingObservations(dossier, finding).map((o) => o.point));
  return bounds ? `detail:${bounds.map((v) => v.toFixed(6)).join(':')}` : null;
}

export function sourceLink(value) {
  try {
    const url = new URL(value);
    // Ne pas exposer de jeton, de signature ou de lien privé dans un PDF.
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : '';
  } catch { return ''; }
}

export function proofGroups(observations) {
  const groups = new Map();
  for (const o of observations) {
    const key = JSON.stringify([o.sourceId, o.text]);
    if (!groups.has(key)) groups.set(key, { sourceId: o.sourceId, text: o.text, observations: [] });
    groups.get(key).observations.push(o);
  }
  return [...groups.values()];
}
