/** Cas synthétiques contrastés. Aucun de ces dossiers ne décrit une collectivité réelle. */
import { createDossier } from '../../admin/sections/diagnostic/dossier/model.js';
import { prepareFeatures } from '../../admin/sections/diagnostic/data.js';

export function dossierCase(kind = 'dense') {
  const ring = [[5.708,45.180],[5.724,45.180],[5.724,45.195],[5.708,45.195],[5.708,45.180]];
  const layers = [], selected = [], runtime = new Map();
  const add = (id, label, source, nature, items, metrics = []) => {
    const layer = { id, label, popup: { source, kind: nature, fields: ['description','nom','adresse'], metrics }, style: { color: '#2563EB' } };
    const features = prepareFeatures({ features: items }).map((f) => ({ ...f, __layerId: id }));
    layers.push(layer); selected.push(...features); runtime.set(id, { features, count: features.length, visible: true, status: 'ready' });
  };
  const point = (description, i = 0, properties = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [5.713 + i * .0003,45.185 + i * .00015] }, properties: { description, ...properties } });
  if (kind === 'dense' || kind === 'large') {
    const texts = ['Le passage est étroit et les voitures essaient de doubler les vélos.', 'Au redémarrage au feu, les véhicules serrent les vélos sur la droite.', 'Le trottoir est occupé par les livraisons devant le passage.', 'La liaison dédiée rend le trajet vers la gare plus agréable.', 'La chaussée abîmée oblige à se déporter dans la circulation.', 'Le cheminement piéton est difficile à suivre au croisement.'];
    add('voices','Retours des habitants 2025','fub','temoignages', Array.from({ length: kind === 'large' ? 410 : 12 }, (_, i) => point(texts[i % texts.length], i % 30)));
    add('counter','Compteur de la gare','comptages','reference',[point('', 5, { nom: 'Passerelle de la gare', moyenne_journaliere: 1240, releve_le: '2026-09-16' })]);
    add('cycleways','Aménagements cyclables','osm-cycleways','reference',[{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[5.710,45.183],[5.720,45.189]] }, properties: { type: 'Piste cyclable' } }]);
  } else if (kind === 'accidents') {
    add('baac','Accidents corporels 2024','accidents','reference',[point('',1,{date:'01/04/2024',annee:2024,adresse:'Rue de démonstration',gravite:'Blessé léger'}),point('',2,{date:'02/05/2024',annee:2024,adresse:'Autre voie',gravite:'Blessé hospitalisé'})]);
  } else if (kind === 'strava') {
    add('strava','Strava Metro 2024','strava','reference',[point('',1,{year:2024,total_trip_count:36600}),point('',2,{year:2024,total_trip_count:18300})],[{field:'total_trip_count',agg:'sum'}]);
  } else if (kind === 'rural') {
    add('rural','Observations des agents','','temoignages',[point('Le chemin vers l’arrêt de bus est difficile à emprunter après la pluie.', 1),point('Le nouveau banc est apprécié près de la mairie.', 20),point('', 9)]);
  } else if (kind === 'measures') {
    add('temperature','Mesures de température 2025','','reference',[point('',0,{temperature:27.4}),point('',10,{temperature:31.2})],[{ field:'temperature', agg:'mean', label:'Température relevée',unit:'°C' }]);
  } else if (kind === 'unknown') {
    add('custom','Inventaire de la collectivité','','temoignages',[point('Équipement en bon état, vérification réalisée par le service.',1),point('',2)]);
    runtime.set('missing',{status:'error',visible:true,features:[]}); layers.push({id:'missing',label:'Données non chargées',popup:{kind:'reference'}});
  } else if (kind === 'empty') {
    add('empty','Inventaire des équipements','','reference',[]);
  }
  const selection = { polygon: {type:'Polygon',coordinates:[ring]}, features: selected.filter(f=>layers.find(l=>l.id===f.__layerId).popup.kind==='temoignages'),context:selected.filter(f=>layers.find(l=>l.id===f.__layerId).popup.kind==='reference') };
  const dossier=createDossier({selection,layers,runtime,city:'test-e2e',brand:'Collectivité de démonstration',capturedAt:'2026-09-16T10:00:00Z',id:`case-${kind}`});
  dossier.title={accidents:'Les événements recensés',strava:'La fréquentation enregistrée',dense:'Les abords de la gare',large:'Le territoire intercommunal',rural:'Les cheminements du bourg',measures:'La chaleur dans les espaces publics',unknown:'Le secteur des équipements',empty:'Le secteur à documenter'}[kind];
  dossier.objective='Dossier d’essai sur des données synthétiques.';
  return {dossier,selection,layers,runtime};
}

export function reviewedCase() {
  const {dossier}=dossierCase('dense');
  dossier.analysis.status='complete'; dossier.analysis.completedIds=dossier.observations.map(o=>o.id);
  dossier.findings.unshift({id:'reading-access',kind:'testimony',title:'Des passages étroits compliquent la cohabitation avec les véhicules',reading:'Plusieurs observations décrivent une difficulté à conserver sa place dans la circulation : dépassements dans un passage étroit, redémarrage au feu et déport pour éviter la chaussée abîmée. Ces textes éclairent des situations vécues ; ils ne mesurent pas la largeur disponible ni la fréquence des incidents.',sourceIds:['voices'],factIds:[],observationIds:['o1','o2','o5','o7','o8','o11'],caveat:'La localisation commune des situations et leur état actuel restent à vérifier. Les témoignages portent sur l’édition 2025.',question:'Où les vélos doivent-ils se déporter, et comment se déroule le redémarrage au feu ?',included:true});
  dossier.findings.unshift({id:'reading-positive',kind:'testimony',title:'La liaison vers la gare est appréciée',reading:'Des retours apprécient la liaison dédiée pour rejoindre la gare. Cette expérience positive mérite d’être conservée dans la lecture du secteur, aux côtés des difficultés signalées sur les accès.',sourceIds:['voices'],factIds:[],observationIds:['o4','o10'],caveat:'Ces appréciations ne renseignent pas tous les usages ni tous les horaires.',question:'',included:true});
  return dossier;
}

export function layeredCase() {
  const dossier = reviewedCase();
  const rural = dossierCase('rural').dossier;
  const observations = rural.observations.map((o, i) => ({ ...o, id: `agent${i + 1}`, sourceId: 'agents' }));
  const agents = { ...rural.sources[0], id: 'agents', label: 'Observations des agents' };
  const strava = dossierCase('strava').dossier;
  dossier.sources.splice(1, 0, dossierCase('empty').dossier.sources[0], agents);
  dossier.sources.push(...strava.sources, dossierCase('unknown').dossier.sources.find((s) => s.id === 'missing'));
  dossier.observations.push(...observations);
  dossier.facts.push(...strava.facts);
  dossier.findings.push(...strava.findings, ...observations.filter((o) => o.text).map((o) => ({ id: `reading-${o.id}`, kind: 'testimony', title: o.text, reading: '', sourceIds: ['agents'], observationIds: [o.id], factIds: [], included: true, caveat: '', question: '' })));
  dossier.analysis.completedIds = dossier.observations.filter((o) => o.text).map((o) => o.id);
  dossier.overview = { text: 'La liaison vers la gare est appréciée. Les retours des habitants et des agents décrivent des difficultés de passage, notamment après la pluie sur le chemin vers le bus.', findingIds: ['reading-positive', 'reading-access', 'reading-agent1'] };
  return dossier;
}
