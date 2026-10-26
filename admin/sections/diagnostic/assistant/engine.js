/**
 * Diagnostic terrain - assistant « Demander » : un tour de conversation.
 * 1. Le modèle lit la demande et dit où chercher (étape « plan »).
 * 2. Le navigateur trouve le lieu, calcule la zone et les chiffres de chaque
 *    couche (zone.mjs), et les grands axes si on les demande.
 * 3. Le modèle rédige à partir de ces seuls chiffres et textes (étape « write »),
 *    puis les références qu'il cite sont vérifiées.
 */

import { layerKind } from '../state.js';
import { sourceOfLayer } from '../sources.js';
import { ASSISTANT_VERSION } from './contract.mjs';
import { chooseRadius, zoneFacts, fitFacts, axesFacts, checkRefs } from './zone.mjs';
import { resolvePlace, fetchAxes } from './place.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const plainAnswer = (text) => String(text || '').replace(/\s*\[\[[^\]]*\]\]/g, '').slice(0, 500);

/** Ce que le modèle sait des tours précédents : la question, la zone réellement étudiée, le début de la réponse. */
export function historyOf(turns) {
  return turns.filter((t) => t.answer || t.error).slice(-4).map((t) => ({
    question: t.question,
    zone_etudiee: t.zone ? { lieu: t.zone.label, type: t.zone.type, rayon_m: t.zone.radius } : null,
    reponse: t.error ? `Échec : ${t.error}` : plainAnswer(t.answer),
  }));
}

/** Phrase qui décrit la zone, reprise telle quelle dans la réponse. */
export function zoneSentence(zone) {
  if (!zone) return 'Tout le territoire';
  const r = zone.radius >= 1000 ? `${String(Math.round(zone.radius / 100) / 10).replace('.', ',')} km` : `${zone.radius} m`;
  if (zone.type === 'commune') return zone.radius ? `${zone.label} et ${r} autour` : zone.label;
  return `${r} autour de ${zone.label}`;
}

/** Rayon du tour : celui demandé, sinon celui du même lieu au tour précédent ; une commune entière n'a pas de marge. */
function radiusFor(requested, place, previous) {
  if (Number(requested) > 0) return chooseRadius(requested, place.geometry);
  if (Number.isFinite(previous)) return previous;
  return place.type === 'commune' ? 0 : chooseRadius(null, place.geometry);
}

/**
 * Joue un tour.
 * @param {object} ctx - { question, turns, layers, featuresOf, branding, territory, request, onStep, signal, turnIndex }
 * @returns {Promise<object>} le tour enregistré
 */
export async function runTurn(ctx) {
  const { question, turns, layers, featuresOf, branding, territory, request, onStep = () => {}, signal } = ctx;
  const turn = { question, at: new Date().toISOString(), cost: 0 };
  const call = async (phase, data) => {
    const out = await request({ version: ASSISTANT_VERSION, phase, question, data, turn: ctx.turnIndex }, signal);
    turn.cost += Number(out?._cost) || 0;
    return out;
  };

  onStep('Je lis la demande');
  const plan = await call('plan', {
    territoire: {
      commune: territory?.commune?.nom || '',
      intercommunalite: territory?.epci?.nom || '',
      communes: (territory?.epci?.communes || []).slice(0, 80).map((c) => c.nom),
    },
    couches: layers.map((l) => ({ id: l.id, couche: l.label, nature: layerKind(l), source: sourceOfLayer(l)?.id || '' })),
    historique: historyOf(turns),
  });
  turn.plan = { action: plan.action, intention: plan.intention, lieu: plan.lieu, couches: plan.couches, grands_axes: plan.grands_axes };
  if (plan.action !== 'chercher') {
    turn.answer = plan.reponse_directe || 'Je réponds aux questions sur les données du diagnostic de votre territoire : signalements, accidents, aménagements, comptages, autour d\'un lieu ou sur tout le territoire.';
    return turn;
  }

  // Une suite qui garde le même lieu ne refait pas la recherche, et garde son rayon.
  const previous = [...turns].reverse().find((t) => t.zone !== undefined && !t.error);
  const same = previous?.zone && norm(previous.plan?.lieu?.texte) === norm(plan.lieu.texte) && previous.plan?.lieu?.type === plan.lieu.type;
  let place;
  if (same) place = previous.zone;
  else if (plan.lieu.type === 'territoire' || plan.lieu.type === 'aucun') place = null;
  else {
    onStep(plan.lieu.type === 'siege' ? 'Je cherche l\'adresse du siège' : `Je cherche « ${plan.lieu.texte} »`);
    place = await resolvePlace(plan.lieu, branding, { signal });
  }
  const zone = place ? {
    label: place.label, adresse: place.adresse || '', type: place.type, geometry: place.geometry,
    radius: radiusFor(plan.rayon_m, place, same ? previous.zone.radius : null),
  } : null;
  turn.zone = zone;

  const known = new Set(layers.map((l) => l.id));
  const wanted = (plan.couches || []).filter((id) => known.has(id));
  const selected = wanted.length ? layers.filter((l) => wanted.includes(l.id)) : layers;
  turn.layerIds = selected.map((l) => l.id);

  let axes = [];
  if (plan.grands_axes && zone) {
    onStep('Je cherche les grands axes de la zone');
    try { axes = await fetchAxes(zone.geometry, zone.radius, { signal }); } catch (e) { if (signal?.aborted) throw e; axes = []; }
  }

  onStep(`Je lis ${selected.length} couche${selected.length > 1 ? 's' : ''} : ${zone ? zoneSentence(zone) : 'tout le territoire'}`);
  const facts = fitFacts((texts) => {
    const z = zoneFacts(selected, featuresOf, zone?.geometry || null, zone?.radius || 0, { texts });
    return { ...z, extra: axesFacts(axes, z.couches, z.refs, z.members) };
  });
  turn.counts = Object.fromEntries(facts.couches.map((c) => [c.id, c.nombre_dans_la_zone]));

  onStep('Je rédige la réponse');
  const written = await call('write', {
    intention: plan.intention,
    explication: plan.explication || '',
    zone: zone
      ? { description: zoneSentence(zone), lieu: zone.label, adresse_trouvee: zone.adresse, rayon_m: zone.radius }
      : { description: 'Tout le territoire de l\'espace', rayon_m: null },
    couches: facts.couches.map(({ id: _id, ...c }) => c),
    ...(axes.length ? { grands_axes: facts.extra, rayon_rattachement_axe_m: 35 } : {}),
  });
  const checked = checkRefs(written.reponse, facts.refs);
  turn.answer = checked.text;
  turn.refs = Object.fromEntries(checked.used.map((ref) => {
    const r = facts.refs.get(ref);
    const c = facts.couches.find((x) => x.id === r.layerId);
    const item = (c?.textes || c?.exemples || []).find((x) => x.ref === ref);
    return [ref, { layer: r.layerId, at: r.feature.geometry.coordinates, text: item?.texte || '', distance: Math.round(r.distance) }];
  }));
  return turn;
}
