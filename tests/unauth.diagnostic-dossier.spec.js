import { test, expect } from '@playwright/test';
import { polygonAreaKm2, clipLines, intersectsRing, distanceToGeometryM } from '../admin/sections/diagnostic/geometry.js';
import { coverage, dossierSummary, dossierRow, analysisRequired, overviewMissing, accidentDetail, createDossier } from '../admin/sections/diagnostic/dossier/model.js';
import { makeBatches, validateBatchResult, validateSynthesis, validateOverview, assertGroundedWording, assertClearWording, BATCH_POINTS, BATCH_CHARS, TEXT_PART_CHARS, forecastAnalysis, MAX_CALLS_PER_GENERATION, HARD_LIMIT_MICRO, REQUEST_MAX_CHARS } from '../admin/sections/diagnostic/dossier/contract.mjs';
import { analyzeDossier, prepareWordingRefresh, prepareLayerRefresh, refreshOverview } from '../admin/sections/diagnostic/dossier/analyze.js';
import { pageHtml, printHtml, analysisStatus } from '../admin/sections/diagnostic/dossier/view.js';
import { validateDossierRequest, analyzeDossier as serveDossierImpl, buildDossierPayload, requestTimeoutMs } from '../netlify/functions/lib/diagnostic-dossier.mjs';
import { dossierCase, reviewedCase, layeredCase } from './fixtures/diagnostic-dossiers.js';
import { prepareFeatures } from '../admin/sections/diagnostic/data.js';
import { layerAnalyses, sourceRegister, findingSheets, findingFigureKey, focusBounds, sourceLink } from '../admin/sections/diagnostic/dossier/presentation.js';
import { recoverRequest, readAnalysisResponse, waitForRetry, NETWORK_MESSAGE } from '../admin/sections/diagnostic/dossier/recovery.js';
import { prepareFindingFigures } from '../admin/sections/diagnostic/dossier/figures.js';
import { storeFigures, loadFigures, persistedFigures } from '../admin/sections/diagnostic/dossier/figure-store.js';

const reviewResult = (body) => ({checked_ids:[...body.groups.map(g=>g.id),...(body.exclusions||[]).map(e=>`excluded:${e.ref}`)],corrections:[],recovered:[]});
const serveDossier = (body, key, headers) => serveDossierImpl({generationId:'10664342-ff7d-47fb-8c58-96b4e2fae215',familyId:'10664342-ff7d-47fb-8c58-96b4e2fae214',ville:'test-e2e',version:'terrain-2026-09-18',observations:[],...body},key,headers,{user:{id:'10664342-ff7d-47fb-8c58-96b4e2fae213'},budget:{reserve:async()=>({status:'reserved',call_id:'call',spent_micro:0,reserved_micro:50000,limit_micro:240000}),settle:async()=>({spent_micro:1000,reserved_micro:0,limit_micro:240000})}});

const ring = [[0,0],[1,0],[1,1],[0,1],[0,0]];
const readResult = (body) => body.phase === 'review' ? reviewResult(body) : ({groups:[{title:'Situation décrite',reading:'Les textes décrivent leurs observations.',refs:body.observations.map(o=>o.id),caveat:'La situation actuelle reste à vérifier.',question:''}],unclassified_refs:[]});

test.describe('0.68 - Dossiers de zone : périmètre et diversité des données',()=>{
  test('0.68.1 - La surface suit le polygone, même vide ou très petit',()=>{
    const square=polygonAreaKm2({type:'Polygon',coordinates:[ring]});
    const triangle=polygonAreaKm2({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]});
    expect(triangle/square).toBeCloseTo(.5,3);
    const tiny=polygonAreaKm2({type:'Polygon',coordinates:[[[0,0],[.00001,0],[.00001,.00001],[0,.00001],[0,0]]]});
    expect(tiny).toBeGreaterThan(0);expect(tiny).toBeLessThan(.00001);
  });
  test('0.68.2 - Un tronçon traversant sans sommet intérieur est retenu et découpé',()=>{
    const clipped=clipLines({type:'LineString',coordinates:[[-1,.5],[2,.5]]},ring);
    expect(clipped.coordinates).toEqual([[0,.5],[1,.5]]);
    expect(intersectsRing({type:'Polygon',coordinates:[[[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]]},ring)).toBe(true);
    expect(intersectsRing({type:'Point',coordinates:[1,.5]},ring)).toBe(true);
  });
  test('0.68.3 - La distance à une ligne proche ne dépend pas de ses sommets',()=>{
    expect(distanceToGeometryM([.5,.00001],{type:'LineString',coordinates:[[0,0],[1,0]]})).toBeLessThan(2);
  });
  for(const kind of ['dense','rural','measures','unknown','empty','large','accidents','strava'])test(`0.68.4 - Le cas ${kind} possède un dossier autonome et imprimable`,()=>{
    const {dossier}=dossierCase(kind);
    expect(dossier.zone.areaKm2).toBeGreaterThan(0);
    expect(pageHtml(dossier)).toContain(dossier.title);
    expect(printHtml(dossier)).toContain(dossier.title);
    if(analysisRequired(dossier)) { expect(printHtml(dossier)).toContain('L’analyse des témoignages n’est pas terminée'); expect(printHtml(dossier)).not.toContain('Les repères chiffrés'); }
    expect(dossierRow(dossier).analysis.dossier).toEqual(dossier);
    if(kind==='empty')expect(dossierSummary(dossier)).toContain('ne permet pas de conclure');
    if(kind==='measures'){expect(dossier.facts[0].value).toBeCloseTo(29.3);expect(dossier.analysis.status).toBe('unavailable');}
    if(kind==='accidents'){expect(dossier.sources[0].records).toHaveLength(2);expect(dossier.facts).toHaveLength(1);}
    if(kind==='strava'){expect(dossier.facts[0].value).toBe(36600);expect(dossier.facts[1].value).toBe(100);}
    if(kind==='unknown')expect(coverage(dossier).failed).toHaveLength(1);
  });
  test('0.68.5 - Des couches FUB ne deviennent pas des provenances indépendantes',()=>{
    const {dossier}=dossierCase('dense');
    dossier.sources.push({...dossier.sources[0],id:'another-fub',label:'Progrès constatés'});
    expect(coverage(dossier).providers).toBe(3);
  });
});

test.describe('0.69 - Dossiers de zone : lecture complète, reprise et preuves',()=>{
  test('0.69.8 - Les extrapolations repérées en analyse réelle sont refusées',()=>{
    expect(()=>assertGroundedWording('Les trottoirs sont fréquemment occupés.', 'Le trottoir est occupé par une livraison.')).toThrow('fréquence');
    expect(()=>assertGroundedWording('Le trottoir est ponctuellement occupé.', 'Le trottoir est occupé par des livraisons.')).toThrow('fréquence');
    expect(()=>assertGroundedWording('Cela augmente les risques d’accidents.', 'Les voitures essaient de doubler.')).toThrow('risque');
    expect(()=>assertGroundedWording('Des retours signalent un stationnement souvent gênant.', 'Le stationnement est souvent gênant.')).not.toThrow();
  });
  test('0.69.9 - La synthèse reçoit tous les constats et leurs originaux sans résumés intermédiaires',async()=>{
    const {dossier}=dossierCase('large'); let overviewCalls=0;
    await analyzeDossier(dossier,{request:async(body)=>{
      if(body.phase==='read')return {groups:body.observations.map(o=>({title:'Observation documentée',reading:o.text,refs:[o.id],caveat:'',question:''})),unclassified_refs:[]};
      if(body.phase==='review')return reviewResult(body);
      if(body.phase==='synthesize')return {findings:[]};
      overviewCalls++;return {text:'Des difficultés de circulation sont rapportées, avec une liaison appréciée.',refs:body.readings.map(r=>r.id)};
    }});
    expect(dossier.analysis.status).toBe('complete');expect(dossier.overview.findingIds).toHaveLength(dossier.findings.length);expect(overviewCalls).toBe(1);
    expect(dossierSummary(dossier)).toBe(dossier.overview.text);
    dossier.findings.find(f=>f.id===dossier.overview.findingIds[0]).included=false;
    expect(dossierSummary(dossier)).not.toBe(dossier.overview.text);
  });
  test('0.69.1 - Plus de 300 textes et les textes longs sont conservés sans perte',()=>{
    const {dossier}=dossierCase('large');dossier.observations[0].text='Un texte complet. '.repeat(2000);
    const batches=makeBatches(dossier.observations);
    expect(batches.length).toBeGreaterThan(10);
    expect(batches.flatMap(b=>b.observations).filter(o=>o.originalId==='o1').map(o=>o.text).join('')).toBe(dossier.observations[0].text);
    for(const b of batches){expect(b.observations.length).toBeLessThanOrEqual(BATCH_POINTS);expect(b.observations.reduce((s,o)=>s+o.text.length,0)).toBeLessThanOrEqual(BATCH_CHARS);}
    // Un texte long ne bloque plus son dossier : chacun de ses morceaux passe les bornes du relais.
    for(const b of batches.filter(b=>b.observations.some(o=>o.originalId==='o1')))expect(validateDossierRequest({phase:'read',sources:[],observations:b.observations})).toBe('read');
  });
  test('0.69.2 - Les références inventées ne deviennent pas des preuves et les omissions sont signalées',()=>{
    const batch=makeBatches(dossierCase('rural').dossier.observations)[0];
    expect(()=>validateBatchResult({groups:[{title:'Inventé',refs:['absent']}],unclassified_refs:[]},batch)).toThrow('référence');
    const result=validateBatchResult(readResult(batch),batch);
    expect(result.groups[0].observationIds).toEqual(['o1','o2']);
    expect(()=>validateSynthesis({findings:[{title:'Mauvaise référence',group_ids:['absent'],fact_ids:['inventé']}]},result.groups,[])).toThrow('référence');
  });
  test('0.69.3 - Une panne puis une reprise ne relisent pas les lots terminés',async()=>{
    const {dossier}=dossierCase('large');let calls=0;
    await analyzeDossier(dossier,{request:async(body)=>{if(body.phase==='read')calls++;if(calls===2)throw new Error('Interruption réseau');return readResult(body);}});
    expect(dossier.analysis.status).toBe('partial');expect(dossier.analysis.completedIds).toHaveLength(BATCH_POINTS);
    const first=dossier.analysis.batches.b1;
    const sent=[];
    await analyzeDossier(dossier,{request:async(body)=>{if(body.phase==='read'){sent.push(...body.observations.map(o=>o.originalId));return readResult(body);}if(body.phase==='overview')return {text:'Les témoignages décrivent des difficultés de circulation, avec une liaison appréciée.',refs:body.readings.map(r=>r.id)};return reviewResult(body);}});
    expect(sent).not.toContain('o1');expect(dossier.analysis.batches.b1).toEqual(first);
    expect(coverage(dossier).read).toBe(410);expect(dossier.analysis.status).toBe('complete');
  });
  test('0.69.4 - Une interruption conserve le dossier factuel et ne déclare pas les textes lus',async()=>{
    const {dossier}=dossierCase('dense');const controller=new AbortController();controller.abort();
    await analyzeDossier(dossier,{signal:controller.signal,request:async()=>{throw new Error('Ne doit pas être appelé');}});
    expect(dossier.analysis.status).toBe('paused');expect(coverage(dossier).read).toBe(0);expect(dossier.facts.length).toBeGreaterThan(0);
  });
  test('0.69.5 - Le rendu échappe les données et refuse les images actives',()=>{
    const dossier=reviewedCase();dossier.title='<img src=x onerror=alert(1)>';dossier.observations[0].text='<script>malveillant</script>';
    dossier.figures.cover={url:'javascript:alert(1)',bounds:dossier.zone.bbox,width:1000,height:650};
    const html=pageHtml(dossier)+printHtml(dossier,{appendix:true});
    expect(html).not.toContain('<script>');expect(html).not.toContain('href="javascript:');expect(html).toContain('&lt;img');
  });
  test('0.69.6 - Les bornes serveur refusent les dépassements au lieu de tronquer',()=>{
    const batch=makeBatches(dossierCase('dense').dossier.observations)[0];
    expect(validateDossierRequest({phase:'read',sources:[],observations:batch.observations})).toBe('read');
    expect(()=>validateDossierRequest({phase:'read',sources:[],observations:Array.from({length:37},(_,i)=>({id:String(i),text:'a'}))})).toThrow();
    expect(()=>validateDossierRequest({phase:'read',sources:[],observations:[{id:'a',text:'x'.repeat(TEXT_PART_CHARS+1)}]})).toThrow();
    expect(validateDossierRequest({phase:'read',sources:[],observations:[{id:'a',text:'x'.repeat(TEXT_PART_CHARS)}]})).toBe('read');
  });
  test('0.69.7 - La sélection éditoriale du PDF ne supprime pas les données du dossier',()=>{
    const dossier=reviewedCase();const title=dossier.findings[0].title;dossier.findings[0].included=false;
    expect(pageHtml(dossier)).toContain(title);expect(printHtml(dossier)).not.toContain(`<h3>${title}</h3>`);
    expect(printHtml(dossier,{appendix:true})).toContain('Toutes les observations');
  });
  test('0.69.15 - Une lecture partielle ou une synthèse en attente ne produit pas de rapport',()=>{
    const dossier=reviewedCase();
    dossier.analysis.status='partial';
    dossier.editorialSummary='Une synthèse manuelle ne remplace pas la lecture des témoignages.';
    expect(analysisRequired(dossier)).toBe(true);
    expect(printHtml(dossier)).not.toContain('Les constats documentés');
    expect(dossierSummary(dossier)).not.toBe(dossier.editorialSummary);
    dossier.analysis.status='complete';dossier.analysis.completedIds.pop();
    expect(analysisRequired(dossier)).toBe(true);
    dossier.analysis.completedIds=dossier.observations.map(o=>o.id);
    expect(analysisRequired(dossier)).toBe(false);
    expect(printHtml(dossier)).toContain('Les constats documentés');
  });
  test('0.69.10 - Toutes les preuves retenues restent vérifiables dans le PDF court',()=>{
    const dossier=reviewedCase();
    const html=printHtml(dossier);
    for(const id of new Set(dossier.findings.flatMap(f=>f.observationIds))) expect(html).toContain(`id="dz-proof-${id}"`);
    expect(html).toContain('href="#dz-proof-o11"');
    expect(html).toContain('La chaussée abîmée oblige à se déporter dans la circulation.');
    expect(html).toContain('Repère A'); expect(html).not.toContain('Repère 1');
    expect(html).not.toContain('javascript:');
  });
  test('0.69.11 - Les constats courts partagent une feuille sans changer leur ordre',()=>{
    const dossier=reviewedCase();
    const base=dossier.findings[0];
    dossier.findings=[base,{...base,id:'other',title:'Une autre observation positive.'},dossier.findings[1]];
    const sheets=findingSheets(dossier);
    expect(sheets[0].findings.map(f=>f.id)).toEqual([base.id,'other']);
    expect(sheets[1].findings[0].id).toBe('reading-access');
    dossier.findings[0].included=false;
    expect(findingSheets(dossier)[0].findings.map(f=>f.id)).toEqual(['other']);
  });
  test('0.69.12 - Les cadrages sont conservés, réutilisés et annulables',async()=>{
    const dossier=reviewedCase();dossier.figures.cover={url:'image',basemap:'satellite'};
    let calls=0;
    const render=async(_selection,options)=>{calls++;expect(options.basemap).toBe('satellite');expect(options.focusBounds).toHaveLength(4);return {url:'zoom',bounds:options.focusBounds};};
    expect(await prepareFindingFigures(dossier,{render})).toBe(true);
    expect(calls).toBe(2);
    expect(dossier.figures[findingFigureKey(dossier,dossier.findings[0])].url).toBe('zoom');
    expect(await prepareFindingFigures(dossier,{render})).toBe(false);expect(calls).toBe(2);
    dossier.figures={cover:{url:'image'}};
    await prepareFindingFigures(dossier,{render,alive:()=>false});expect(calls).toBe(2);
    const point=[5.7,45.2], bounds=focusBounds([null,point]);
    expect(bounds[0]).toBeLessThan(point[0]);expect(bounds[2]).toBeGreaterThan(point[0]);
    expect(focusBounds([null,[NaN,5]])).toBeNull();
  });
  test('0.69.14 - Les lettres des cartes suivent exactement l’ordre des citations',()=>{
    const dossier=reviewedCase();
    const finding=dossier.findings.find(f=>f.id==='reading-access');
    finding.observationIds=['o2','o1'];
    const html=printHtml(dossier);
    expect(html).toContain('<title>Repère A : O2</title>');
    expect(html).toContain('<title>Repère B : O1</title>');
    dossier.observations.find(o=>o.id==='o2').point=null;
    expect(printHtml(dossier)).toContain('La lettre B situe la citation.');
  });
  test('0.69.13 - Les liens du PDF restent sûrs et ne pointent pas vers une version différente',()=>{
    const dossier=reviewedCase();
    const url='https://openprojets.com/admin/diagnostic/10664342-ff7d-47fb-8c58-96b4e2fae211/';
    expect(printHtml(dossier,{reportUrl:url})).toContain(`href="${url}"`);
    expect(printHtml(dossier,{reportUrl:url,draft:true})).not.toContain(`href="${url}"`);
    expect(sourceLink('https://example.com/data?token=secret')).toBe('');
    expect(sourceLink('javascript:alert(1)')).toBe('');
    expect(sourceLink('https://example.com/data')).toBe('https://example.com/data');
  });
});

test.describe('0.70 - Reprise automatique des analyses',()=>{
  test('0.70.1 - Les pannes transitoires se reprennent avec une attente bornée',async()=>{
    let calls=0;const waits=[];
    const value=await recoverRequest({},x=>x,{wait:async ms=>{waits.push(ms);},request:async()=>{calls++;if(calls<3)throw Object.assign(new Error('Indisponible'),{retryable:true});return 'lu';}});
    expect(value).toBe('lu');expect(calls).toBe(3);expect(waits).toEqual([1000,3000]);
    calls=0;await expect(recoverRequest({},x=>x,{wait:async()=>{},request:async()=>{calls++;throw Object.assign(new Error('Toujours indisponible'),{retryable:true});}})).rejects.toThrow('Toujours indisponible');expect(calls).toBe(3);
  });
  test('0.70.2 - Une erreur permanente ne déclenche pas de nouvelle requête',async()=>{
    let calls=0;
    await expect(recoverRequest({},x=>x,{request:async()=>{calls++;return readAnalysisResponse(new Response(JSON.stringify({error:'Crédits épuisés',retryable:false}),{status:502}));}})).rejects.toThrow('Crédits');
    expect(calls).toBe(1);
  });
  test('0.70.3 - Une formulation rejetée reçoit la correction précise',async()=>{
    const seen=[];
    const value=await recoverRequest({},result=>{if(result==='trop long')throw Object.assign(new Error('Longueur'),{issue:'overview_length'});return result;},{request:async body=>{seen.push(body);return seen.length===1?'trop long':'court';}});
    expect(value).toBe('court');expect(seen[1]).toMatchObject({retryReason:'quality',qualityIssue:'overview_length'});
  });
  test('0.70.4 - Les lots trop longs sont divisés et leurs étapes conservées',async()=>{
    const d=dossierCase().dossier;const calls=[];let fail=true;
    const request=async body=>{
      if(body.phase==='read'){
        calls.push(body.observations.map(o=>o.id));
        if(body.observations.length>6)throw Object.assign(new Error('Délai'),{code:'timeout',retryable:true});
        if(body.observations[0].originalId==='o7'&&fail)throw new Error('Pause du test');
        return readResult(body);
      }
      if(body.phase==='overview')return {text:'Les retours décrivent des situations de circulation.',refs:body.readings.map(r=>r.id)};
      return reviewResult(body);
    };
    await analyzeDossier(d,{request,wait:async()=>{}});
    expect(d.analysis.status).toBe('partial');expect(coverage(d).read).toBe(6);
    const restored=JSON.parse(JSON.stringify(d));fail=false;calls.length=0;
    await analyzeDossier(restored,{request,wait:async()=>{}});
    expect(restored.analysis.status).toBe('complete');expect(coverage(restored).read).toBe(12);
    expect(calls.flat()).not.toContain('o1:1');expect(restored.findings.filter(f=>f.kind==='testimony')).toHaveLength(2);
  });
  test('0.70.5 - Une pause arrête immédiatement une attente automatique',async()=>{
    const controller=new AbortController();const pending=waitForRetry(15000,controller.signal);controller.abort();
    await expect(pending).rejects.toMatchObject({name:'AbortError'});
  });
});

test('0.70.6 - Le relais distingue les délais, les quotas et transmet les corrections',async()=>{
  const previous=globalThis.fetch;
  const body={phase:'read',sources:[],observations:[{id:'o1:1',originalId:'o1',sourceId:'s',text:'Un chemin étroit.'}]};
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:429});
    expect(await (await serveDossier(body,'test',{})).json()).toMatchObject({code:'configuration',retryable:false});
    globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429,headers:{'Retry-After':'5'}});
    const limited=await serveDossier(body,'test',{});
    expect(limited.headers.get('Retry-After')).toBe('5');
    expect(await limited.json()).toMatchObject({code:'service',retryable:true});
    globalThis.fetch=async()=>{throw new DOMException('Temps écoulé','TimeoutError');};
    expect(await (await serveDossier(body,'test',{})).json()).toMatchObject({code:'timeout',retryable:true});
    let sent;
    globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'{"text":"Lecture courte.","refs":["r1"]}'}]}]}));};
    const repaired=await serveDossier({phase:'overview',sources:[],readings:[{id:'r1',reading:'Lecture documentée.'}],retryReason:'quality',qualityIssue:'overview_length'},'test',{});
    expect(repaired.status).toBe(200);expect(sent.input[0].content).toContain('La synthèse précédente était trop longue');
  } finally {globalThis.fetch=previous;}
});


test('0.70.7 - Une association abstraite est refusée, une demande concrète reste fidèle', () => {
  const vague = 'Les secteurs animés sont associés à des besoins de stationnement vélo.';
  expect(() => assertClearWording(vague)).toThrow(/nommer la demande/);
  expect(() => assertClearWording('Des places vélo sont demandées près du marché.')).not.toThrow();
  const batch = makeBatches([{id:'o1',sourceId:'s1',text:'Il faudrait pouvoir garer son vélo près du marché.'}])[0];
  const result = {groups:[{title:vague,reading:'',refs:['o1:1'],caveat:'',question:''}],unclassified_refs:[]};
  expect(() => validateBatchResult(result,batch)).toThrow(/nommer la demande/);
});

test('0.70.8 - La reprise des formulations respecte les choix et les modifications de la collectivité', () => {
  for (const field of [{edited:true},{included:false}]) {
    const dossier=reviewedCase(); Object.assign(dossier.findings[0],field,{title:'Les secteurs animés sont associés à des besoins de stationnement vélo.'});
    const before=structuredClone(dossier);
    expect(prepareWordingRefresh(dossier)).toBe(false);
    expect(dossier).toEqual(before);
  }
  const dossier=reviewedCase();
  expect(prepareWordingRefresh(dossier)).toBe(false);
});


test('0.70.9 - Une lecture sans paragraphe conserve le titre comme preuve de la synthèse', () => {
  const result=validateOverview({text:'La liaison est régulièrement utilisée selon les retours.',refs:['r1']},[{id:'r1',title:'La liaison est régulièrement utilisée selon les retours.',reading:''}]);
  expect(result.findingIds).toEqual(['r1']);
});

test('0.71.1 - Les lectures restent par couche et la synthèse reçoit aussi les mesures', async () => {
  const dossier = layeredCase(); dossier.analysis = {status:'pending',batches:{},synthesis:{},completedIds:[]};
  dossier.findings = dossier.findings.filter((f) => f.kind === 'measure');
  // L'ordre entrelacé d'une sélection cartographique ne mélange pas les lots.
  dossier.observations.sort((a, b) => a.id.length - b.id.length);
  const seen = [];
  await analyzeDossier(dossier, {request:async (body) => {
    seen.push(body);
    if (body.phase === 'read') {
      expect(new Set(body.observations.map((o) => o.sourceId)).size).toBe(1);
      return readResult(body);
    }
    if (body.phase === 'review') {
      const ids = new Set(body.groups.flatMap((g) => g.sourceIds));
      expect(ids.size).toBe(1);
      return reviewResult(body);
    }
    expect(body.readings.some((r) => r.kind === 'measure' && r.facts.some((f) => f.sourceId === 'strava'))).toBe(true);
    expect(new Set(body.readings.flatMap((r) => r.sources.map((s) => s.id))).size).toBeGreaterThan(2);
    return {text:'Les données décrivent les usages du secteur.',refs:body.readings.map((r) => r.id)};
  }});
  expect(dossier.analysis.status).toBe('complete');
  expect(dossier.findings.every((f) => f.sourceIds.length === 1)).toBe(true);
  expect(dossier.analysis.completedIds).toHaveLength(14);
  expect(seen.filter((r) => r.phase === 'review')).toHaveLength(2);
  const calls = seen.length;
  await analyzeDossier(dossier, {request:async () => {throw new Error('Aucune étape terminée ne doit être relancée.');}});
  expect(dossier.analysis.status).toBe('complete'); expect(seen).toHaveLength(calls);
});

test('0.71.2 - Les anciennes lectures mixtes sont reprises sans confondre les identifiants de lots', async () => {
  const dossier = layeredCase(), all = dossier.observations.filter((o) => o.text);
  const mixed = {id:'mixed',kind:'testimony',title:'Ancienne lecture croisée.',reading:'',sourceIds:['voices','agents'],observationIds:all.map((o) => o.id),factIds:[],included:true};
  dossier.findings = [mixed];
  dossier.analysis.batches = {b1:{groups:[mixed],completedParts:all.map((o) => `${o.id}:1`)}};
  expect(prepareLayerRefresh(dossier)).toBe(true);
  const read = [];
  await analyzeDossier(dossier,{request:async (body) => {
    if (body.phase === 'read') { read.push(...body.observations.map((o) => o.originalId)); return readResult(body); }
    if (body.phase === 'review') return reviewResult(body);
    if (body.phase === 'synthesize') return {findings:[]};
    return {text:'Les textes décrivent les expériences rapportées.',refs:body.readings.map((r) => r.id)};
  }});
  expect(dossier.analysis.status).toBe('complete');
  expect(new Set(read)).toEqual(new Set(all.map((o) => o.id)));
  expect(dossier.findings.every((f) => f.sourceIds.length === 1)).toBe(true);
  const edited = layeredCase(); edited.findings = [{...mixed,edited:true}];
  expect(prepareLayerRefresh(edited)).toBe(false);
  expect(layerAnalyses(edited).flatMap((l) => l.findings)).toEqual(edited.findings);
});

test('0.71.3 - Les couches vides, en erreur et sans constat ont des états distincts', () => {
  const dossier = layeredCase();
  const layers = layerAnalyses(dossier);
  expect(layers.find((l) => l.source.id === 'empty').status).toBe('empty');
  expect(layers.find((l) => l.source.id === 'missing').status).toBe('error');
  expect(layers.find((l) => l.source.id === 'agents').findings).toHaveLength(2);
  dossier.findings = dossier.findings.filter((f) => !f.sourceIds.includes('agents'));
  expect(layerAnalyses(dossier).find((l) => l.source.id === 'agents').status).toBe('uninterpreted');
  const html = pageHtml(dossier);
  expect(html).toContain('data-layer-tab="empty" aria-controls="dz-active-layer"  disabled');
});

test('0.71.4 - Une même source peut alimenter plusieurs couches sans doublon de notice', () => {
  const dossier = layeredCase(), source = dossier.sources[0];
  dossier.sources.push({...source,id:'fub-other',label:'Autre couche du même Baromètre'});
  const register = sourceRegister(dossier);
  expect(register).toHaveLength(dossier.sources.length - 1);
  expect(register.find((r) => r[0].id === source.id).map((s) => s.id)).toEqual([source.id,'fub-other']);
});

test('0.71.5 - La synthèse refuse les chiffres inventés et les changements de milliers en millions', () => {
  const inputs = [{id:'counter',title:'Compteur de la gare',facts:[{value:1240,unit:'passages / jour',period:'2026'}]}];
  const validate = (text) => validateOverview({text,refs:['counter']}, inputs);
  expect(validate('Le compteur relève 1 240 passages par jour en 2026.').text).toContain('1 240');
  expect(validate('Le compteur relève 1\u202f240 passages par jour.').text).toContain('1\u202f240');
  for (const text of ['Le compteur relève 1,24 million de passages par jour.', 'Un million de passages sont relevés.', 'Le compteur relève 2 480 passages par jour.']) {
    expect(() => validate(text)).toThrow('chiffre');
  }
  expect(() => validateOverview({text:'Le compteur relève 1 240 passages par jour.',refs:['other']}, [...inputs,{id:'other',title:'Observations des agents'}])).toThrow('chiffre');
  expect(() => validateOverview({text:'Les relevés indiquent 1,24 million de passages.',refs:['sum']}, [{id:'sum',reading:'Le compteur relève 1 240 passages par jour.'}])).toThrow('chiffre');
  expect(() => validateOverview({text:'Le secteur comprend 1,03 km de pistes.',refs:['ways']}, [{id:'ways',facts:[{value:1.029231,unit:'km'}]}])).not.toThrow();
  expect(() => validateOverview({text:'La température est de -2,3 °C.',refs:['temp']}, [{id:'temp',facts:[{value:-2.3,unit:'°C'}]}])).not.toThrow();
  expect(() => validateOverview({text:'La température est de 2,3 °C.',refs:['temp']}, [{id:'temp',facts:[{value:-2.3,unit:'°C'}]}])).toThrow('chiffre');
});


/* ── 0.73 : rapprochement des constats, reprises et confidentialité ── */
const THEMES = ['Des véhicules occupent la bande cyclable.', 'Des piétons traversent la piste cyclable.'];
// Un groupe par lot, sur deux sujets qui alternent : sans rapprochement, chaque lot ferait son constat.
const lotOf = (body) => Math.floor((Number(body.observations[0].originalId.slice(1)) - 1) / BATCH_POINTS);
const readByLot = (body) => body.phase === 'review' ? reviewResult(body) : ({groups:[{title:THEMES[lotOf(body) % 2],reading:'',refs:body.observations.map(o=>o.id),caveat:'',question:''}],unclassified_refs:[]});
const mergeByTitle = (body) => {
  const byTitle = new Map();
  for (const g of body.groups) { if (!byTitle.has(g.title)) byTitle.set(g.title, []); byTitle.get(g.title).push(g.id); }
  return {findings:[...byTitle].map(([title, ids]) => ({title, reading:'', group_ids:ids, fact_ids:[], caveat:'', question:''}))};
};
const overviewOf = (body) => ({text:'Des témoignages décrivent l’occupation des espaces cyclables et des traversées de piétons.',refs:body.readings.map(r=>r.id)});
/** Deux textes par lot sur un même sujet : chaque lot de douze porte les deux sujets alternés par lot. */
const themedCase = () => {
  const {dossier} = dossierCase('large');
  dossier.observations.forEach((o, i) => { if (o.sourceId === 'voices') o.text = `${THEMES[Math.floor(i / BATCH_POINTS) % 2]} Relevé ${i + 1}.`; });
  return dossier;
};

test.describe('0.73 - Rapprochement des constats, reprises et confidentialité', () => {
  test('0.73.1 - Les constats d’une source lue en plusieurs lots sont rapprochés avec leurs textes d’origine', async () => {
    const dossier = themedCase(), phases = [], merges = [];
    await analyzeDossier(dossier, {request: async (body) => {
      phases.push(body.phase);
      if (body.phase === 'synthesize') { merges.push(body); return mergeByTitle(body); }
      return body.phase === 'overview' ? overviewOf(body) : readByLot(body);
    }});
    expect(dossier.analysis.status).toBe('complete');
    const lots = makeBatches(dossier.observations).length;
    expect(merges).toHaveLength(1);
    expect(merges[0].groups).toHaveLength(lots);
    // Le rapprochement voit les textes d'origine, pas seulement les titres.
    expect(merges[0].observations.length).toBe(dossier.observations.filter(o=>o.sourceId==='voices').length);
    expect(phases.indexOf('synthesize')).toBeGreaterThan(phases.lastIndexOf('review'));
    expect(phases.at(-1)).toBe('overview');
    const readings = dossier.findings.filter(f=>f.kind==='testimony');
    expect(readings.map(f=>f.title).sort()).toEqual([...THEMES].sort());
    // Les preuves restent calculées par le code : chaque texte appartient à son constat.
    expect(readings.reduce((n,f)=>n+f.observationIds.length,0)).toBe(merges[0].observations.length);
    expect(dossier.overview.findingIds).toEqual(expect.arrayContaining(readings.map(f=>f.id)));
  });

  test('0.73.2 - Un rapprochement conservé n’est pas redemandé et un groupe omis reste un constat', async () => {
    const dossier = themedCase(); let merges = 0, fail = true;
    const request = async (body) => {
      if (body.phase === 'synthesize') { merges++; const merged = mergeByTitle(body); merged.findings[0].group_ids = merged.findings[0].group_ids.slice(1); return merged; }
      if (body.phase === 'overview') { if (fail) throw Object.assign(new Error('Service indisponible'), {code:'configuration',retryable:false}); return overviewOf(body); }
      return readByLot(body);
    };
    await analyzeDossier(dossier, {request});
    expect(dossier.analysis.status).toBe('partial'); expect(merges).toBe(1);
    // Trois constats : deux sujets réunis, et le groupe que le modèle a oublié, gardé à part entière.
    expect(dossier.findings.filter(f=>f.kind==='testimony')).toHaveLength(3);
    fail = false;
    await analyzeDossier(dossier, {request});
    expect(dossier.analysis.status).toBe('complete'); expect(merges).toBe(1);
  });

  test('0.73.3 - Un rapprochement impossible laisse les constats lus et le dossier aboutit', async () => {
    const dossier = themedCase();
    await analyzeDossier(dossier, {request: async (body) => {
      if (body.phase === 'synthesize') throw Object.assign(new Error('Le service n’a pas pu analyser ces textes.'), {code:'refusal',retryable:false});
      return body.phase === 'overview' ? overviewOf(body) : readByLot(body);
    }});
    expect(dossier.analysis.status).toBe('complete');
    expect(dossier.analysis.mergeFailures).toEqual({voices:'refusal'});
    expect(dossier.findings.filter(f=>f.kind==='testimony')).toHaveLength(makeBatches(dossier.observations).length);
    expect(printHtml(dossier)).toContain('n’ont pas pu être rapprochés');
  });

  test('0.73.4 - Une version reprise par un collègue démarre une nouvelle génération au lieu de rester bloquée', async () => {
    const {dossier} = dossierCase('dense'); dossier.analysis.runId = '10664342-ff7d-47fb-8c58-96b4e2fae299';
    const runs = [];
    await analyzeDossier(dossier, {request: async (body) => {
      runs.push(body.generationId);
      if (body.generationId === '10664342-ff7d-47fb-8c58-96b4e2fae299') throw Object.assign(new Error('Cette génération appartient à un autre dossier ou utilisateur.'), {code:'forbidden',retryable:false});
      return body.phase === 'overview' ? overviewOf(body) : readResult(body);
    }});
    expect(dossier.analysis.status).toBe('complete');
    expect(dossier.analysis.runId).not.toBe('10664342-ff7d-47fb-8c58-96b4e2fae299');
    expect(runs.filter(id=>id==='10664342-ff7d-47fb-8c58-96b4e2fae299')).toHaveLength(1);
  });

  test('0.73.5 - Une actualisation de la synthèse qui échoue rend la précédente', async () => {
    const {dossier} = dossierCase('dense');
    await analyzeDossier(dossier, {request: async (body) => body.phase === 'overview' ? overviewOf(body) : readResult(body)});
    const before = dossier.overview.text;
    dossier.objective = 'Préparer une visite avec le service voirie.'; refreshOverview(dossier);
    await analyzeDossier(dossier, {request: async (body) => {
      if (body.phase === 'overview') throw Object.assign(new Error('Le service a dépassé le délai de réponse.'), {code:'configuration',retryable:false});
      throw new Error('Aucune lecture ne doit être refaite.');
    }});
    expect(dossier.analysis.status).toBe('complete');
    expect(dossier.overview.text).toBe(before);
    expect(dossier.analysis.refreshError).toContain('délai');
    expect(analysisRequired(dossier)).toBe(false);
  });

  test('0.73.6 - Seule une lecture complète et relue permet d’exporter avec la synthèse de la collectivité', async () => {
    const {dossier} = dossierCase('dense');
    await analyzeDossier(dossier, {request: async (body) => {
      if (body.phase === 'overview') throw Object.assign(new Error('Refus'), {code:'configuration',retryable:false});
      return readResult(body);
    }});
    expect(dossier.analysis.status).toBe('partial'); expect(overviewMissing(dossier)).toBe(true);
    expect(analysisRequired(dossier)).toBe(true);
    expect(dossierSummary(dossier)).toContain('Personnaliser');
    dossier.editorialSummary = 'Le secteur de la gare concentre des difficultés de passage et une liaison appréciée.';
    expect(analysisRequired(dossier)).toBe(false);
    expect(printHtml(dossier)).toContain('Les constats documentés');
    expect(dossierSummary(dossier)).toBe(dossier.editorialSummary);
    // Une relecture manquante ne se remplace pas par une synthèse manuelle.
    delete dossier.analysis.reviews.b1;
    expect(overviewMissing(dossier)).toBe(false); expect(analysisRequired(dossier)).toBe(true);
  });

  test('0.73.7 - Les coordonnées de contact et les liens ne partent pas chez le fournisseur d’IA', () => {
    const text = 'Appelez-moi au 06 12 34 56 78 ou écrivez à jean.dupont@example.fr, photo : https://exemple.fr/p.jpg?token=abc';
    const observation = {id:'o1:1',originalId:'o1',sourceId:'s',title:'Signalement de jean.dupont@example.fr',text,fields:[{label:'Contact',value:'+33 6 12 34 56 78'}]};
    const base = {generationId:'10664342-ff7d-47fb-8c58-96b4e2fae215',familyId:'10664342-ff7d-47fb-8c58-96b4e2fae214',ville:'test-e2e',sources:[]};
    const payloads = [
      buildDossierPayload({...base,phase:'read',observations:[observation]}),
      buildDossierPayload({...base,phase:'review',observations:[observation],groups:[{id:'b1-g1',title:'T',reading:'',caveat:'',question:'',partIds:['o1:1']}],exclusions:[]}),
      buildDossierPayload({...base,phase:'synthesize',groups:[{id:'b1-g1',title:'T',reading:'',caveat:'',question:'',observationIds:['o1']}],observations:[{id:'o1',text}]}),
      buildDossierPayload({...base,phase:'overview',readings:[{id:'r',observationIds:['o1']}],observations:[{id:'o1',sourceId:'s',text,fields:[]}]}),
    ];
    for (const payload of payloads) {
      const sent = payload.input[1].content;
      for (const secret of ['06 12 34 56 78','jean.dupont@example.fr','+33 6 12 34 56 78','token=abc']) expect(sent).not.toContain(secret);
      expect(sent).toContain('[numéro de téléphone]');
    }
    expect(payloads[0].input[1].content).toContain('[adresse électronique]');
    expect(payloads[0].input[1].content).toContain('[lien]');
  });

  test('0.73.8 - Le délai d’attente suit l’étape en production et reste sous la coupure du serveur local', () => {
    expect(requestTimeoutMs('overview')).toBe(48000); expect(requestTimeoutMs('synthesize')).toBe(48000);
    expect(requestTimeoutMs('read')).toBe(30000); expect(requestTimeoutMs('review')).toBe(30000);
    for (const phase of ['read','review','synthesize','overview']) expect(requestTimeoutMs(phase, true)).toBe(24000);
  });

  test('0.73.9 - Un accident listé ne mentionne un cycliste ou un piéton que si le fichier l’indique', () => {
    expect(accidentDetail({adresse:'Avenue Leclerc',gravite:'Blessé léger',velo:'non',pieton:'non'})).not.toMatch(/cycliste|piéton/);
    expect(accidentDetail({gravite:'Blessé hospitalisé',velo:'oui',pieton:'non'})).toBe('La personne la plus gravement atteinte a été hospitalisée. Un cycliste était impliqué.');
    // La gravité ne dit que l'état le plus grave : le nombre de morts vient de la colonne des tués.
    expect(accidentDetail({gravite:'Tué',tues:2})).toBe('2 personnes ont été tuées.');
    expect(accidentDetail({gravite:'Tué',tues:1})).toBe('Une personne a été tuée.');
    expect(accidentDetail({gravite:'Tué'})).toBe('Au moins une personne a été tuée.');
    const ring = [[5.708,45.180],[5.724,45.180],[5.724,45.195],[5.708,45.195],[5.708,45.180]];
    const layer = {id:'baac',label:'Accidents corporels 2024',popup:{source:'accidents',kind:'reference',fields:[]},style:{}};
    const features = prepareFeatures({features:[{type:'Feature',geometry:{type:'Point',coordinates:[5.713,45.185]},properties:{date:'01/04/2024',annee:2024,gravite:'Blessé léger',velo:'non',pieton:'non'}}]}).map(f=>({...f,__layerId:'baac'}));
    const dossier = createDossier({selection:{polygon:{type:'Polygon',coordinates:[ring]},features:[],context:features},layers:[layer],runtime:new Map([['baac',{features,visible:true,status:'ready'}]]),city:'test-e2e',brand:'Essai',capturedAt:'2026-09-23T10:00:00Z',id:'case-accident'});
    expect(dossier.sources[0].records[0].detail).not.toMatch(/cycliste|piéton|Vélo impliqué/);
    expect(printHtml(dossier)).not.toContain('Vélo impliqué');
  });

  test('0.73.10 - Les fréquences et les unités sont contrôlées contre les textes d’origine', () => {
    for (const [text, evidence] of [['Les voitures doublent souvent.','Les voitures essaient de doubler.'],['Les vélos sont régulièrement serrés.','Les vélos sont serrés.']]) {
      expect(() => assertGroundedWording(text, evidence)).toThrow();
    }
    // Le mot est admis quand un texte d'origine l'emploie, même sous une forme voisine.
    expect(() => assertGroundedWording('Des dépassements ont lieu régulièrement.', 'Les voitures doublent de façon régulière.')).not.toThrow();
    const inputs = [{id:'r',title:'Un passage étroit est décrit.',reading:'',observationIds:['o3'],facts:[{id:'f',value:1240,unit:'passages / jour',period:'2025'}]}];
    // L'unité juste doit suivre la valeur, pas seulement figurer ailleurs dans le texte.
    expect(() => validateOverview({text:'Le compteur relève 1 240 passages / jour, soit 1 240 habitants.',refs:['r']}, inputs, [{id:'o3',text:'Les voitures doublent.'}])).toThrow('unité');
    // Un mot présent dans un témoignage cité reste permis, même si la lecture l'a reformulé.
    expect(() => validateOverview({text:'Des voitures doublent souvent dans le passage.',refs:['r']}, inputs, [{id:'o3',text:'Les voitures doublent souvent ici.'}])).not.toThrow();
  });

  test('0.73.11 - Un chiffre sans libellé garde le nom de sa colonne, sans unité inventée', () => {
    const {dossier} = dossierCase('measures');
    const layer = {id:'raw',label:'Relevés importés',popup:{kind:'reference',fields:[],metrics:[{field:'retard_s',agg:'mean'}]},style:{}};
    const ring = [[5.708,45.180],[5.724,45.180],[5.724,45.195],[5.708,45.195],[5.708,45.180]];
    const features = prepareFeatures({features:[{type:'Feature',geometry:{type:'Point',coordinates:[5.713,45.185]},properties:{retard_s:120}}]}).map(f=>({...f,__layerId:'raw'}));
    const raw = createDossier({selection:{polygon:{type:'Polygon',coordinates:[ring]},features:[],context:features},layers:[layer],runtime:new Map([['raw',{features,visible:true,status:'ready'}]]),city:'test-e2e',brand:'Essai',capturedAt:'2026-09-23T10:00:00Z',id:'case-raw'});
    expect(raw.facts[0].label).toBe('Moyenne de la colonne « retard_s »');
    // Un libellé fourni par la source est repris tel quel, sans « Moyenne : » devant.
    const named = createDossier({selection:{polygon:{type:'Polygon',coordinates:[ring]},features:[],context:features},layers:[{...layer,popup:{...layer.popup,metrics:[{field:'retard_s',agg:'mean',label:'Retard moyen',unit:'secondes'}]}}],runtime:new Map([['raw',{features,visible:true,status:'ready'}]]),city:'test-e2e',brand:'Essai',capturedAt:'2026-09-23T10:00:00Z',id:'case-named'});
    expect(named.facts[0].label).toBe('Retard moyen');
    expect(raw.facts[0].unit).toBe('');
    expect(printHtml(raw)).not.toContain('unité non renseignée');
    expect(dossier.facts.some(f=>f.unit==='°C')).toBe(true);
  });

  test('0.73.12 - Une zone qui ne pourrait pas aller jusqu’à sa synthèse est refusée avant le premier appel', async () => {
    const texts = (n, L = 75) => Array.from({length:n},(_,i)=>({id:`o${i+1}`,sourceId:'s',text:'x'.repeat(L),fields:[]}));
    expect(forecastAnalysis(texts(124)).fits).toBe(true);
    expect(forecastAnalysis(texts(700))).toMatchObject({fits:false,reason:'budget'});
    expect(forecastAnalysis(texts(1000)).fits).toBe(false);
    expect(forecastAnalysis(texts(400,600))).toMatchObject({fits:false,reason:'size'});
    // Une zone acceptée tient dans les bornes du relais : appels, plafond et taille de la synthèse.
    for (const [n, L] of [[124,75],[500,75],[250,300]]) {
      const f = forecastAnalysis(texts(n, L));
      expect(f.fits, `${n} textes de ${L} caractères`).toBe(true);
      expect(f.calls).toBeLessThanOrEqual(MAX_CALLS_PER_GENERATION); expect(f.peakMicro).toBeLessThanOrEqual(HARD_LIMIT_MICRO); expect(f.overviewChars).toBeLessThanOrEqual(REQUEST_MAX_CHARS);
    }
    // La zone refusée pour sa taille l'aurait été par le relais à la dernière étape.
    const long = texts(400, 600);
    expect(() => validateDossierRequest({phase:'overview',sources:[],readings:[{id:'r',kind:'testimony',observationIds:long.map(o=>o.id),sources:[],facts:[]}],observations:long})).toThrow('trop de textes');
    // La prévision reprend exactement les textes d'origine que la chaîne envoie à la synthèse.
    const dossier = themedCase(); let sent;
    await analyzeDossier(dossier, {request: async (body) => {
      if (body.phase === 'overview') { sent = body; return overviewOf(body); }
      return body.phase === 'synthesize' ? mergeByTitle(body) : readByLot(body);
    }});
    expect(Math.abs(JSON.stringify(sent.observations).length - forecastAnalysis(dossier.observations).originalsChars)).toBeLessThanOrEqual(sent.observations.length + 2);
  });

  test('0.73.13 - Un constat réuni mal formulé retrouve ses groupes sans faire tomber le rapprochement', () => {
    const group = (id, title, observationId) => ({ id, title, reading: '', caveat: '', question: '', observationIds: [observationId], sourceIds: ['s'], factIds: [] });
    const groups = [group('b1-g1', 'Des voitures stationnent sur la bande cyclable.', 'o1'), group('b2-g1', 'Des livraisons occupent la bande cyclable.', 'o2'), group('b3-g1', 'Des voitures empruntent la voie bus.', 'o3'), group('b4-g1', 'Une voie bus est empruntée par des taxis.', 'o4')];
    const observations = [{ id: 'o1', text: 'Voitures garées sur la bande.' }, { id: 'o2', text: 'Camions de livraison sur la bande.' }, { id: 'o3', text: 'Les voitures prennent la voie bus.' }, { id: 'o4', text: 'Des taxis dans la voie bus.' }];
    const merged = validateSynthesis({ findings: [
      { title: 'La bande cyclable est occupée par des véhicules à l’arrêt.', reading: '', caveat: '', question: '', group_ids: ['b1-g1', 'b2-g1'], fact_ids: [] },
      // « fréquemment » n'est dans aucun texte : ce constat seul est écarté.
      { title: 'La voie bus est fréquemment empruntée.', reading: '', caveat: '', question: '', group_ids: ['b3-g1', 'b4-g1'], fact_ids: [] },
    ] }, groups, [], observations);
    expect(merged.map((f) => f.id)).toEqual(['reading-b1-g1-b2-g1', 'reading-b3-g1', 'reading-b4-g1']);
    expect(merged[0].observationIds).toEqual(['o1', 'o2']);
    // Si rien de réuni ne tient, la correction est redemandée.
    expect(() => validateSynthesis({ findings: [{ title: 'La voie bus est fréquemment empruntée.', reading: '', caveat: '', question: '', group_ids: ['b3-g1', 'b4-g1'], fact_ids: [] }] }, groups, [], observations)).toThrow('fréquence');
    // Des numéros de textes recopiés parmi les mesures sont ignorés au lieu de faire refuser la réponse (rapprochement réel du 23/09/2026).
    const withTexts = validateSynthesis({ findings: [{ title: 'La bande cyclable est occupée par des véhicules à l’arrêt.', reading: '', caveat: '', question: '', group_ids: ['b1-g1', 'b2-g1'], fact_ids: ['o1', 'o2'] }] }, groups, [], observations);
    expect(withTexts[0].factIds).toEqual([]);
  });

  test('0.73.15 - Les images d’un dossier sont rangées par empreinte, enregistrées par leur emplacement et rechargées à l’identique', async () => {
    const jpeg = `data:image/jpeg;base64,${Buffer.from('carte de la zone').toString('base64')}`;
    const png = `data:image/png;base64,${Buffer.from('carte d’une source').toString('base64')}`;
    const dossier = { city: 'test-e2e', figures: { cover: { url: jpeg, width: 1000, height: 680 }, copie: { url: jpeg, width: 640, height: 430 }, source: { url: png, width: 640, height: 430 } } };
    const bucket = new Map();
    const result = await storeFigures(dossier, async (path, blob) => { bucket.set(path, new Uint8Array(await blob.arrayBuffer())); });
    expect(result).toEqual({ stored: 3, failed: 0 });
    // Deux images identiques partagent le même fichier.
    expect(dossier.figures.cover.path).toBe(dossier.figures.copie.path);
    expect(dossier.figures.cover.path).toMatch(/^test-e2e\/figures\/[0-9a-f]{64}\.jpg$/);
    expect(dossier.figures.source.path).toMatch(/\.png$/);
    expect(bucket.size).toBe(2);
    // La version n'enregistre que l'emplacement ; une image non déposée y reste entière.
    const saved = persistedFigures({ ...dossier.figures, inline: { url: jpeg } }, 'test-e2e');
    expect(saved.cover.url).toBeUndefined(); expect(saved.cover.width).toBe(1000); expect(saved.inline.url).toBe(jpeg);
    // Un emplacement d'une autre ville n'est ni enregistré comme tel ni relu.
    expect(persistedFigures({ ailleurs: { path: `grenoble/figures/${'a'.repeat(64)}.jpg`, url: jpeg } }, 'test-e2e').ailleurs.url).toBe(jpeg);
    const reopened = { city: 'test-e2e', figures: structuredClone(saved) };
    reopened.figures.perdue = { path: `test-e2e/figures/${'b'.repeat(64)}.jpg` };
    // Une lecture qui échoue une fois est retentée ; une image absente reste absente.
    const failedOnce = new Set();
    const loading = await loadFigures(reopened, async (path) => {
      if (!bucket.has(path)) throw new Error('introuvable');
      if (!failedOnce.has(path)) { failedOnce.add(path); throw new Error('erreur passagère'); }
      return new Blob([bucket.get(path)]);
    }, { retryDelay: 0 });
    expect(loading).toEqual({ loaded: 3, failed: 1 });
    expect(reopened.figures.cover.url).toBe(jpeg); expect(reopened.figures.source.url).toBe(png);
    expect(reopened.figures.perdue.url).toBeUndefined();
    // Un dépôt refusé laisse l'image dans la version.
    const refused = { city: 'test-e2e', figures: { cover: { url: jpeg } } };
    expect(await storeFigures(refused, async () => { throw new Error('refusé'); })).toEqual({ stored: 0, failed: 1 });
    expect(dossierRow({ ...reviewedCase(), city: 'test-e2e', figures: refused.figures }).analysis.dossier.figures.cover.url).toBe(jpeg);
  });

  test('0.73.16 - Une coupure de connexion s’explique en français, sans le message brut du navigateur', async () => {
    let calls = 0;
    const offline = recoverRequest({ phase: 'read' }, (r) => r, { request: async () => { calls++; throw new TypeError('Failed to fetch'); }, wait: async () => {} });
    await expect(offline).rejects.toMatchObject({ message: NETWORK_MESSAGE, code: 'network' });
    expect(calls).toBe(3);
    // Un dossier enregistré avec l'ancien message brut affiche la même phrase.
    const { dossier } = dossierCase('dense');
    Object.assign(dossier.analysis, { status: 'partial', error: 'Failed to fetch', lastError: { code: 'unknown', phase: 'synthesize' } });
    const html = analysisStatus(dossier);
    expect(html).toContain('La connexion à Internet a été interrompue');
    expect(html).not.toContain('Failed to fetch');
  });

  test('0.73.17 - Une étape encore en cours côté serveur est attendue jusqu’à sa fin, puis relue sans être repayée', async () => {
    const busy = () => Object.assign(new Error('Cette étape est déjà en cours.'), { code: 'busy', retryable: true, retryAfter: 10000 });
    let calls = 0; const waits = [], notes = [];
    // La coupure de la plateforme, puis l'étape encore en cours, puis son résultat mis en mémoire.
    const result = await recoverRequest({ phase: 'overview' }, (r) => r, {
      request: async () => { calls++; if (calls === 1) throw Object.assign(new Error('Délai dépassé'), { retryable: true, code: 'service' }); if (calls < 6) throw busy(); return { text: 'ok' }; },
      wait: async (ms) => { waits.push(ms); }, notify: (n) => notes.push(n.recovery),
    });
    expect(result).toEqual({ text: 'ok' });
    expect(notes).toEqual(['network', 'wait', 'wait', 'wait', 'wait']);
    expect(waits.slice(1)).toEqual([10000, 10000, 10000, 10000]);
    // Au-delà d'une minute d'attente, l'étape est rendue à l'agent.
    let tries = 0;
    await expect(recoverRequest({ phase: 'overview' }, (r) => r, { request: async () => { tries++; throw busy(); }, wait: async () => {} })).rejects.toMatchObject({ code: 'busy' });
    expect(tries).toBe(9);
  });

  test('0.73.14 - Un mot d’une autre écriture n’entre dans un constat que si un texte d’origine en contient', () => {
    expect(() => assertGroundedWording('La gêne prend des formes שונות selon les lieux.', 'Les voitures doublent.')).toThrow('écriture');
    expect(() => assertGroundedWording('Le panneau porte l’inscription « שלום ».', 'Le panneau dit שלום à l’entrée.')).not.toThrow();
    // Les accents, les guillemets français, les symboles et les chiffres restent de la même écriture.
    expect(() => assertGroundedWording('Élan : « 30 km/h », 5 € ; µ, °, œ, ’.', '')).not.toThrow();
    const batch = makeBatches([{ id: 'o1', sourceId: 's', text: 'Les voitures doublent dans la rue.' }])[0];
    expect(() => validateBatchResult({ groups: [{ title: 'Des dépassements sont décrits.', reading: '', caveat: 'La gêne prend des formes שונות.', question: '', refs: ['o1:1'] }], unclassified_refs: [] }, batch)).toThrow('écriture');
  });
});
