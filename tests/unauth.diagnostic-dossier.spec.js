import { test, expect } from '@playwright/test';
import { polygonAreaKm2, clipLines, intersectsRing, distanceToGeometryM } from '../admin/sections/diagnostic/geometry.js';
import { coverage, dossierSummary, dossierRow, analysisRequired } from '../admin/sections/diagnostic/dossier/model.js';
import { makeBatches, validateBatchResult, validateSynthesis, validateOverview, assertGroundedWording, assertClearWording, BATCH_POINTS } from '../admin/sections/diagnostic/dossier/contract.mjs';
import { analyzeDossier, prepareWordingRefresh, prepareLayerRefresh } from '../admin/sections/diagnostic/dossier/analyze.js';
import { pageHtml, printHtml } from '../admin/sections/diagnostic/dossier/view.js';
import { validateDossierRequest, analyzeDossier as serveDossierImpl } from '../netlify/functions/lib/diagnostic-dossier.mjs';
import { dossierCase, reviewedCase, layeredCase } from './fixtures/diagnostic-dossiers.js';
import { layerAnalyses, sourceRegister, findingSheets, findingFigureKey, focusBounds, sourceLink } from '../admin/sections/diagnostic/dossier/presentation.js';
import { recoverRequest, readAnalysisResponse, waitForRetry } from '../admin/sections/diagnostic/dossier/recovery.js';
import { prepareFindingFigures } from '../admin/sections/diagnostic/dossier/figures.js';

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
    for(const b of batches){expect(b.observations.length).toBeLessThanOrEqual(36);expect(b.observations.reduce((s,o)=>s+o.text.length,0)).toBeLessThanOrEqual(28000);}
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
    expect(()=>validateDossierRequest({phase:'read',sources:[],observations:[{id:'a',text:'x'.repeat(10001)}]})).toThrow();
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
