/** Document de zone versionné, indépendant du DOM et de l'analyse IA. */
import { persistedFigures } from './figure-store.js';
import { layerKind, layerMetrics, safeColor } from '../state.js';
import { sourceOfLayer } from '../sources.js';
import { aggregateMetrics, geometryBbox, toNumber } from '../data.js';
import { polygonAreaKm2 } from '../geometry.js';
import { sourceLink } from './presentation.js';
import { lengthKm, accidentsInsights, stravaInsights, cyclewaysInsights } from '../insights.js';
import { makeBatches } from './contract.mjs';

export const DOSSIER_VERSION = 2;
/** Exemple d'objet d'étude, le même dans le panneau Analyse et dans la personnalisation du dossier. */
export const OBJECTIVE_EXAMPLE = 'Par exemple : préparer une visite du quartier avec le service voirie.';
export const number = (value, digits = 1) => Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits });
const clean = (value) => String(value ?? '').trim();
const nonempty = (value) => value !== null && value !== undefined && value !== '';

export function observationText(feature, layer) {
  const popup = layer?.popup || {};
  // Un champ description déclaré est prioritaire sur une adresse plus longue.
  const fields = popup.fields || [];
  const preferred = fields.find((f) => /^(description|commentaire|comment|motif|texte|message)$/i.test(f));
  if (preferred && typeof feature.properties?.[preferred] === 'string') return clean(feature.properties[preferred]);
  return fields.filter((f) => f !== popup.title_field && !/adresse|address|date|heure|^rue$|commune|^nom$/i.test(f))
    .map((f) => feature.properties?.[f]).filter((v) => typeof v === 'string').map(clean).sort((a, b) => b.length - a.length)[0] || '';
}

function periodOf(layer, features) {
  const explicit = clean(layer.popup?.period);
  if (explicit) return { label: explicit, known: true };
  const years = new Set();
  for (const f of features) {
    const value = f.properties?.annee ?? f.properties?.year;
    if (/^(19|20)\d{2}$/.test(String(value))) years.add(Number(value));
  }
  if (!years.size) for (const y of `${layer.label || ''} ${layer.popup?.dataset || ''}`.match(/\b(?:19|20)\d{2}\b/g) || []) years.add(Number(y));
  const sorted = [...years].sort();
  const source = sourceOfLayer(layer)?.id;
  if (source === 'waze') return { label: 'À la date du relevé', known: true, instant: true };
  if (source === 'comptages') return { label: 'Période de calcul non renseignée', known: false };
  return { label: sorted.length ? sorted.join(', ') : 'Période non renseignée', known: Boolean(sorted.length), years: sorted };
}

/* Le fichier national code chaque usager par « oui » ou « non » : seul « oui »
   désigne un usager impliqué. La phrase ne dit que ce que la ligne établit. */
const involved = (value) => value === true || /^(oui|1|true)$/i.test(String(value ?? '').trim());
const GRAVITY = {
  'blesse hospitalise': 'La personne la plus gravement atteinte a été hospitalisée.',
  'blesse leger': 'La personne la plus gravement atteinte a été légèrement blessée.',
};
const plain = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// La gravité ne donne que l'état le plus grave : le nombre de morts vient de la colonne des tués.
const killed = (count) => {
  const n = Number(count);
  return n > 1 ? `${n} personnes ont été tuées.` : n === 1 ? 'Une personne a été tuée.' : 'Au moins une personne a été tuée.';
};
export function accidentDetail(p = {}) {
  const cyclist = involved(p.velo), pedestrian = involved(p.pieton);
  return [
    clean(p.adresse) ? `Le fichier national situe l’accident à cette adresse : ${clean(p.adresse)}.` : '',
    plain(p.gravite) === 'tue' ? killed(p.tues) : GRAVITY[plain(p.gravite)] || (clean(p.gravite) ? `Gravité relevée : ${clean(p.gravite).toLocaleLowerCase('fr-FR')}.` : ''),
    cyclist && pedestrian ? 'Un cycliste et un piéton étaient impliqués.' : cyclist ? 'Un cycliste était impliqué.' : pedestrian ? 'Un piéton était impliqué.' : '',
  ].filter(Boolean).join(' ');
}

/* Libellés des informations connues des sources du catalogue. Une colonne d'un
   fichier importé garde le nom que la collectivité lui a donné. */
const FIELD_LABELS = {
  reference: 'Référence', category_label: 'Catégorie', statut_label: 'Statut', adresse: 'Adresse', rue: 'Rue', commune: 'Commune',
  created_at: 'Date de dépôt', updated_at: 'Dernière mise à jour', description: 'Description', project_name: 'Nom', category: 'Catégorie',
  nature_travaux: 'Nature des travaux', etat: 'État', date_debut: 'Début', date_fin: 'Fin', nom: 'Nom', type: 'Type',
};
export const fieldLabel = (key) => FIELD_LABELS[key] || key;

function sourceRecord(layer, features, runtime, capturedAt) {
  const src = sourceOfLayer(layer);
  const rt = runtime.get(layer.id);
  const ramp = rt?.ramp;
  const legend = layer.style?.mode === 'category' ? Object.entries(layer.style.cat_colors || {}).map(([label, color]) => ({ label, color: safeColor(color) }))
    : ramp?.stops?.length ? ramp.stops.map((value, i) => ({ label: number(value), color: safeColor(ramp.colors[i]) }))
      : [{ label: layer.label || 'Données sélectionnées', color: safeColor(layer.style?.color) }];
  return {
    id: layer.id, label: layer.label || 'Données importées', catalogId: src?.id || null,
    // Une provenance commune n'est pas une preuve indépendante supplémentaire.
    provenance: src?.id || `import:${layer.id}`, provider: src?.name || 'Fichier ou source de la collectivité',
    credit: src?.credit || '', url: sourceLink(layer.popup?.source_url || src?.publicUrl), dataset: clean(layer.popup?.dataset), kind: layerKind(layer),
    count: features.length, total: rt?.features?.length || 0, status: rt?.status || 'unavailable',
    period: periodOf(layer, features), capturedAt,
    description: clean(layer.ai_context),
    geometryTypes: [...new Set(features.map((f) => f.geometry?.type).filter(Boolean))],
    legend, legendField: ramp?.stops?.length ? (src?.id === 'strava' ? 'Passages enregistrés' : src?.id === 'comptages' ? 'Passages par jour' : layerMetrics(layer).find((m) => m.field === layer.style.value_field)?.label || 'Valeur représentée') : '',
    records: src?.id === 'accidents' && features.length < 5 ? features.map((f) => ({
      title: clean(f.properties.date) || 'Date non renseignée',
      detail: accidentDetail(f.properties),
    })) : [],
  };
}

function buildFacts(source, features, layer) {
  const facts = [];
  const add = (label, value, unit, note = '') => {
    if (!Number.isFinite(Number(value))) return;
    facts.push({ id: `m-${source.id}-${facts.length + 1}`, sourceId: source.id, label, value: Number(value), unit, note, period: source.period.label, periodKnown: source.period.known });
  };
  if (!features.length) return facts;
  if (source.catalogId === 'strava') {
    const s = stravaInsights(features);
    const maximum = features.reduce((max, f) => Math.max(max, toNumber(f.properties.total_trip_count) || 0), 0);
    const year = source.period.years?.length === 1 ? source.period.years[0] : null;
    add('Tronçon le plus emprunté', maximum, 'passages enregistrés', 'Maximum sur un tronçon ; les passages des tronçons ne sont pas additionnés.');
    if (year) {
      const days = new Date(Date.UTC(year + 1, 0, 1)) - new Date(Date.UTC(year, 0, 1));
      add('Moyenne sur ce tronçon', maximum / (days / 86400000), 'passages / jour', 'Moyenne calculée sur l’année entière, parmi les utilisateurs de Strava.');
    }
    add('Tronçons dans la zone', s.segments, 'tronçons', 'Un passage enregistré ne désigne pas une personne distincte.');
  } else if (source.catalogId === 'accidents') {
    const a = accidentsInsights(features);
    add('Accidents corporels recensés', a.count, 'accidents', 'Accidents enregistrés dans le BAAC ; aucun taux de risque ne peut être déduit sans mesure de l’exposition.');
    if (a.count < 5) return facts;
    add('Personnes tuées', a.tues, 'personnes');
    add('Blessés hospitalisés', a.hospitalises, 'personnes');
    add('Accidents impliquant un vélo', a.velo, 'accidents');
    add('Accidents impliquant un piéton', a.pieton, 'accidents', 'Les catégories peuvent concerner un même accident et ne s’additionnent pas.');
  } else if (source.catalogId === 'osm-cycleways') {
    const c = cyclewaysInsights(features);
    add('Aménagements dans le périmètre', features.reduce((s, f) => s + lengthKm(f.geometry), 0), 'km', 'Longueur mesurée à l’intérieur du périmètre, d’après OpenStreetMap.');
    for (const t of c.byType) add(t.type, t.km, 'km');
  } else if (source.catalogId === 'comptages') {
    for (const f of features) {
      const p = f.properties;
      if (nonempty(p.moyenne_journaliere)) add(clean(p.nom) || 'Compteur', p.moyenne_journaliere, 'passages / jour', `Moyenne publiée par le gestionnaire.${p.releve_le ? ` Relevé : ${clean(p.releve_le)}.` : ''} Les passages de plusieurs compteurs ne sont pas des personnes distinctes.`);
    }
  } else if (source.kind === 'reference') {
    const metrics = layerMetrics(layer);
    for (const m of aggregateMetrics(features, metrics)) {
      const config = metrics.find((x) => x.field === m.field && x.agg === m.agg);
      const operation = { sum: 'Total', mean: 'Moyenne', max: 'Maximum', count: 'Nombre' }[m.agg] || m.agg;
      // Le libellé d'une source est déjà une phrase complète (« Retard moyen », « Personnes tuées ») :
      // il n'est pas préfixé. Un chiffre sans libellé garde le nom de sa colonne, sans unité inventée.
      const label = config?.label || `${operation} de la colonne « ${m.field} »`;
      add(label, m.value, config?.unit || '', `Calcul sur ${number(m.n, 0)} valeurs renseignées.${config?.unit ? '' : ' Les données ne précisent pas l’unité de cette valeur.'}`);
    }
  }
  if (!facts.length && source.kind === 'reference') add('Éléments de cette source dans la zone', features.length, 'éléments', 'Nombre d’éléments de cette source dans le périmètre. Elle ne fournit pas d’autre chiffre exploitable.');
  return facts;
}

function measureFinding(source, facts) {
  const main = facts[0];
  if (!main) return null;
  const titles = {
    accidents: 'Les accidents recensés dans le secteur', strava: 'La fréquentation enregistrée sur les tronçons',
    'osm-cycleways': 'Les aménagements cyclables connus', comptages: 'Les passages mesurés aux compteurs', waze: 'La situation relevée par Waze',
  };
  return {
    id: `measure-${source.id}`, kind: 'measure', title: titles[source.catalogId] || source.label,
    reading: `${main.label} : ${number(main.value)}${main.unit ? ` ${main.unit}` : ''}.`,
    sourceIds: [source.id], factIds: facts.map((f) => f.id), observationIds: [],
    caveat: source.catalogId === 'strava' ? 'Ces données décrivent les utilisateurs de Strava et ne représentent pas tous les déplacements.'
      : source.catalogId === 'osm-cycleways' ? 'Un aménagement absent d’OpenStreetMap peut exister sur le terrain. La continuité et la qualité d’usage ne se déduisent pas de cette seule longueur.'
        : source.catalogId === 'accidents' ? 'Les accidents non enregistrés dans ce fichier ne sont pas connus du dossier. La période doit accompagner toute comparaison.'
          : source.catalogId === 'comptages' ? 'La période de calcul dépend de chaque gestionnaire. Sans série comparable, ces moyennes ne décrivent pas une évolution.' : '',
    question: '', included: true,
  };
}

export function createDossier({ selection, layers, runtime, city, brand, capturedAt = new Date().toISOString(), id = crypto.randomUUID() }) {
  const all = [...(selection.features || []), ...(selection.context || [])];
  const byLayer = new Map();
  for (const f of all) { if (!byLayer.has(f.__layerId)) byLayer.set(f.__layerId, []); byLayer.get(f.__layerId).push(f); }
  const active = layers.filter((l) => runtime.get(l.id)?.visible || byLayer.has(l.id));
  const sources = active.map((l) => sourceRecord(l, byLayer.get(l.id) || [], runtime, capturedAt));
  const observations = [];
  for (const f of selection.features || []) {
    const layer = layers.find((l) => l.id === f.__layerId);
    const source = sources.find((s) => s.id === f.__layerId);
    if (!source) continue;
    const p = f.properties || {};
    observations.push({
      id: `o${observations.length + 1}`, sourceId: source.id,
      title: clean(p[layer?.popup?.title_field]) || source.label,
      text: observationText(f, layer), point: f.__pt?.slice(0, 2) || null,
      fields: (layer?.popup?.fields || []).filter((key) => nonempty(p[key])).map((key) => ({ label: fieldLabel(key), value: clean(p[key]) })),
    });
  }
  const facts = sources.flatMap((s) => buildFacts(s, byLayer.get(s.id) || [], layers.find((l) => l.id === s.id)));
  const findings = sources.map((s) => measureFinding(s, facts.filter((f) => f.sourceId === s.id))).filter(Boolean);
  return {
    schemaVersion: DOSSIER_VERSION, familyId: id, revision: 1, city, brand: brand || city, capturedAt,
    title: 'Dossier de zone', objective: '', notes: '',
    zone: { polygon: selection.polygon, bbox: geometryBbox(selection.polygon) || selection.bbox, areaKm2: polygonAreaKm2(selection.polygon) },
    sources, observations, facts, findings, figures: {},
    analysis: { status: observations.some((o) => o.text) ? 'pending' : 'unavailable', batches: {}, synthesis: {}, completedIds: [], error: '' },
  };
}

export function coverage(dossier) {
  const readable = dossier.observations.filter((o) => o.text);
  const completed = new Set(dossier.analysis.completedIds || []);
  const cited = new Set(dossier.findings.filter((f) => f.kind === 'testimony').flatMap((f) => f.observationIds));
  return {
    observations: dossier.observations.length, readable: readable.length,
    read: readable.filter((o) => completed.has(o.id)).length,
    cited: readable.filter((o) => cited.has(o.id)).length,
    providers: new Set(dossier.sources.filter((s) => s.count).map((s) => s.provenance)).size,
    failed: dossier.sources.filter((s) => s.status !== 'ready'),
    unknownPeriods: dossier.sources.filter((s) => s.count && !s.period.known),
  };
}

/** Chaque lot a été lu puis relu : les constats sont établis, seule la synthèse peut manquer. */
export function readingComplete(dossier) {
  const state = dossier.analysis || {};
  const leaves = (id, size) => (state.splits?.[id] && size > 1
    ? [...leaves(`${id}.a`, Math.ceil(size / 2)), ...leaves(`${id}.b`, Math.floor(size / 2))]
    : [id]);
  return makeBatches(dossier.observations).every((batch) => leaves(batch.id, batch.observations.length).every((id) => state.batches?.[id] && state.reviews?.[id]));
}

/** Tous les textes sont lus et relus, mais la synthèse n'a pas pu être rédigée. */
export function overviewMissing(dossier) {
  const c = coverage(dossier);
  return c.readable > 0 && c.read === c.readable && dossier.analysis.status !== 'complete' && dossier.analysis.status !== 'running' && readingComplete(dossier);
}

/** Un rapport avec des témoignages attend leur lecture et leur synthèse complètes.
 * Quand tous les textes sont lus et relus mais que la synthèse n'a pas pu être
 * rédigée, celle que la collectivité écrit elle-même suffit à publier le dossier :
 * elle remplace la synthèse, jamais la lecture des témoignages. */
export function analysisRequired(dossier) {
  const c = coverage(dossier);
  if (!c.readable) return false;
  if (c.read < c.readable) return true;
  if (dossier.analysis.status === 'complete') return false;
  return !(overviewMissing(dossier) && dossier.editorialSummary?.trim());
}

export function dossierSummary(dossier) {
  // Arrêtée au plafond d'un dossier, l'analyse ne reprend pas : le résumé ne le propose pas.
  const stopped = dossier.analysis.lastError?.code === 'budget';
  if (analysisRequired(dossier)) return overviewMissing(dossier)
    ? `Tous les textes sont lus, mais la synthèse n’a pas pu être rédigée. ${stopped ? 'Écrivez' : 'Reprenez l’analyse, ou écrivez'} votre propre synthèse dans « Personnaliser » pour exporter le dossier.`
    : stopped ? 'L’analyse s’est arrêtée à la limite prévue pour un dossier : ce dossier n’aura pas de synthèse. Ses observations et ses mesures restent consultables.'
    : 'La synthèse sera disponible après l’analyse de tous les témoignages. Les observations et les mesures restent consultables pendant sa préparation.';
  if (dossier.editorialSummary?.trim()) return dossier.editorialSummary.trim();
  const c = coverage(dossier);
  const overview = dossier.overview;
  if (dossier.analysis.status === 'complete' && overview?.text && overview.findingIds?.every((id) => dossier.findings.some((f) => f.id === id && f.included !== false))) return overview.text;
  if (!dossier.sources.some((s) => s.count)) return 'Aucune observation des sources retenues ne se trouve dans ce périmètre. Ce dossier décrit sa couverture ; il ne permet pas de conclure sur la situation du terrain.';
  if (!c.readable) return 'Le dossier rassemble les mesures et les données disponibles dans le périmètre. Aucun texte de témoignage n’est disponible pour compléter cette lecture.';
  const count = dossier.findings.filter((f) => f.kind === 'testimony' && f.included !== false).length;
  return count ? `${count === 1 ? 'Le constat retenu est documenté' : `Les ${number(count, 0)} constats retenus sont documentés`} par les témoignages. Aucune synthèse d’ensemble n’a été conservée pour cette sélection.`
    : 'Les textes ont été examinés, sans constat suffisamment étayé à regrouper. Les observations restent consultables dans leur intégralité.';
}

/** Ligne de `diagnostic_reports` : le document entier, ses images réduites à leur emplacement quand elles sont rangées dans le compartiment privé (figure-store.js). */
export function dossierRow(dossier) {
  return {
    title: dossier.title, zone: { polygon: dossier.zone.polygon, bbox: dossier.zone.bbox, area_km2: dossier.zone.areaKm2 },
    point_count: dossier.observations.length,
    stats: { schemaVersion: DOSSIER_VERSION, familyId: dossier.familyId, revision: dossier.revision, findings: dossier.findings.filter((f) => f.included !== false).length, sourceCount: dossier.sources.length },
    // Les images déposées dans le compartiment privé ne sont enregistrées que par leur emplacement.
    analysis: { dossier: { ...dossier, figures: persistedFigures(dossier.figures, dossier.city) } },
  };
}
