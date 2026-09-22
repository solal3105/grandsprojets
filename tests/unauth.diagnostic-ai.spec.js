import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { analyzeDossier as serve, buildDossierPayload } from '../netlify/functions/lib/diagnostic-dossier.mjs';
import { reservedCost, usageCost } from '../netlify/functions/lib/diagnostic-budget.mjs';
import { makeBatches, validateBatchResult, validateReview, validateOverview, estimateAnalysisMicro, EXPECTED_BUDGET_MICRO, HARD_LIMIT_MICRO } from '../admin/sections/diagnostic/dossier/contract.mjs';
import { analyzeDossier, refreshOverview } from '../admin/sections/diagnostic/dossier/analyze.js';
import { ANALYSIS_VERSION } from '../admin/sections/diagnostic/dossier/quality.mjs';
import { dossierCase } from './fixtures/diagnostic-dossiers.js';

const user = {id:'10664342-ff7d-47fb-8c58-96b4e2fae213'};
const metadata = () => ({generationId:randomUUID(),familyId:randomUUID(),ville:'test-e2e',version:ANALYSIS_VERSION});
let db;
test.beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${user.id}');`);
  await db.exec(readFileSync('supabase/migrations/20260918090000_diagnostic_ai_budget.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260918095810_diagnostic_ai_runs_limit_1_dollar.sql','utf8'));
});
test.afterAll(async()=>{await db?.close();});
const reserve = async(p)=>(await db.query('select public.reserve_diagnostic_ai($1,$2,$3,$4,$5,$6,$7,$8,$9) as value',[p.p_run,p.p_family,p.p_user,p.p_ville,p.p_hash,p.p_phase,p.p_model,p.p_reserve,p.p_floor])).rows[0].value;
const settle = async(p)=>(await db.query('select public.settle_diagnostic_ai($1,$2,$3,$4,$5,$6) as value',[p.p_call,p.p_status,p.p_charge,p.p_usage,p.p_result,p.p_request_id])).rows[0].value;
const budget={reserve,settle};
const reservation = (overrides={})=>({p_run:randomUUID(),p_family:randomUUID(),p_user:user.id,p_ville:'test-e2e',p_hash:'first',p_phase:'read',p_model:'gpt-5.4-mini',p_reserve:480000,p_floor:65000,...overrides});
const body = ()=>({...metadata(),phase:'read',objective:'Préparer une visite accessible.',sources:[],observations:[{id:'o1:1',originalId:'o1',sourceId:'s',text:'Je demande du stationnement devant le marché.'}]});
const success = (output,usage={input_tokens:100,output_tokens:100})=>new Response(JSON.stringify({status:'completed',usage,output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}));
const reviewed = b=>({checked_ids:[...b.groups.map(g=>g.id),...(b.exclusions||[]).map(e=>`excluded:${e.ref}`)],corrections:[],recovered:[]});
const read = b=>({groups:[{title:'Du stationnement est demandé.',reading:'',caveat:'',question:'',refs:b.observations.map(o=>o.id)}],unclassified_refs:[],exclusions:[]});

test('0.72.1 - Deux réservations partagent le plafond et conservent la réserve finale',async()=>{
  const p=reservation();const [a,b]=await Promise.all([reserve(p),reserve({...p,p_hash:'second'})]);
  expect(a.status).toBe('reserved');expect(b.status).toBe('budget');
  expect(b.reserved_micro).toBe(480000);expect(b.spent_micro).toBe(0);
  const final=await reserve({...p,p_hash:'final',p_phase:'overview',p_floor:0,p_reserve:100000});
  expect(final.status).toBe('reserved');
});
test('0.72.2 - Une réponse perdue se récupère sans nouvel appel et sans double débit',async()=>{
  const p=reservation(),r=await reserve(p);
  expect((await reserve(p)).status).toBe('busy');
  const payment={p_call:r.call_id,p_status:'complete',p_charge:1234,p_usage:{input_tokens:10,output_tokens:20},p_result:{groups:[]},p_request_id:'req-test'};
  await settle(payment);await settle(payment);
  expect(await reserve(p)).toMatchObject({status:'cached',result:{groups:[]},spent_micro:1234,reserved_micro:0});
  expect((await reserve({...p,p_ville:'autre-ville'})).status).toBe('forbidden');
  expect((await reserve({...p,p_user:randomUUID()})).status).toBe('forbidden');
});
test('0.72.3 - Une interruption inconnue conserve son coût maximal et une panne confirmée libère la réserve',async()=>{
  const p=reservation(),r=await reserve(p);
  expect(await settle({p_call:r.call_id,p_status:'uncertain',p_charge:0,p_usage:null,p_result:null,p_request_id:''})).toMatchObject({spent_micro:480000,reserved_micro:0});
  expect((await reserve(p)).status).toBe('budget');
  const next=reservation(),n=await reserve(next);
  await settle({p_call:n.call_id,p_status:'failed',p_charge:0,p_usage:null,p_result:null,p_request_id:''});
  expect((await reserve(next)).status).toBe('reserved');
});
test('0.72.4 - Les clients ne peuvent ni consulter ni falsifier le budget',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query('select * from public.diagnostic_ai_runs')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from public.diagnostic_ai_calls')).rejects.toThrow(/permission denied/);
      await expect(reserve(reservation())).rejects.toThrow(/permission denied/);
      await expect(settle({p_call:randomUUID(),p_status:'complete',p_charge:0,p_usage:null,p_result:null,p_request_id:''})).rejects.toThrow(/permission denied/);
    } finally {await db.exec('reset role');}
  }
});
test('0.72.5 - Les tokens de raisonnement ne sont pas facturés deux fois et le cache est compté',()=>{
  expect(usageCost('gpt-5.4-mini',{input_tokens:1000,input_tokens_details:{cached_tokens:500},output_tokens:1000,output_tokens_details:{reasoning_tokens:900}})).toBe(4913);
  expect(usageCost('gpt-5.4',null)).toBeNull();
  expect(reservedCost('gpt-5.4',1000,1000)).toBe(17660);
});
test('0.72.6 - Le relais suit le coût réel et réutilise le résultat après rechargement',async()=>{
  let generated=0;const b=body();
  const fetch=async url=>{if(url.endsWith('/input_tokens'))return new Response('{"input_tokens":100}');generated++;return success(read(b));};
  const run=()=>serve(b,'test',{}, {user,budget,fetch});
  expect(await (await run()).json()).toMatchObject({_usage:{spent_micro:525,reserved_micro:0}});
  expect(await (await run()).json()).toMatchObject({_usage:{spent_micro:525,reserved_micro:0}});
  expect(generated).toBe(1);
});
test('0.72.7 - Le relais refuse un appel avant le fournisseur quand le budget manque',async()=>{
  const b=body();let generated=0;
  const fetch=async url=>{if(url.endsWith('/input_tokens'))return new Response('{"input_tokens":1400000}');generated++;return success({});};
  const res=await serve(b,'test',{}, {user,budget,fetch});
  expect(res.status).toBe(409);expect(await res.json()).toMatchObject({code:'budget',retryable:false});expect(generated).toBe(0);
});
test('0.72.8 - Une sortie tronquée est payée et un usage inconnu reste réservé',async()=>{
  for(const usage of [{input_tokens:100,output_tokens:200},null]){
    const b=body();
    const fetch=async url=>url.endsWith('/input_tokens')?new Response('{"input_tokens":100}'):new Response(JSON.stringify({status:'incomplete',usage,output:[]}));
    const res=await serve(b,'test',{}, {user,budget,fetch});
    const result=await res.json();expect(result.code).toBe('incomplete');
    expect(result._usage.spent_micro).toBe(usage?975:reservedCost('gpt-5.4-mini',100,4000));
  }
});
test('0.72.9 - Un suivi indisponible empêche tout appel de génération',async()=>{
  let generated=0;const b=body();
  const fetch=async url=>{if(url.endsWith('/input_tokens'))return new Response('{"input_tokens":100}');generated++;return success({});};
  const res=await serve(b,'test',{}, {user,fetch,budget:{reserve:async()=>{throw Object.assign(new Error('Suivi indisponible'),{code:'accounting'});}}});
  expect(await res.json()).toMatchObject({code:'accounting',retryable:false});expect(generated).toBe(0);
});
test('0.72.10 - Les modèles, les preuves et les consignes suivent chaque étape',()=>{
  const b=body();
  expect(buildDossierPayload(b)).toMatchObject({model:'gpt-5.4-mini',reasoning:{effort:'low'}});
  const final=buildDossierPayload({...b,phase:'overview',readings:[]});
  expect(final).toMatchObject({model:'gpt-5.4',reasoning:{effort:'medium'}});
  expect(final.input[1].content).toContain(b.objective);expect(final.input[1].content).toContain(b.observations[0].text);
  expect(final.input[0].content).toContain('trois à cinq phrases');
});
test('0.72.11 - La vérification corrige un titre trompeur et récupère une observation utile',()=>{
  const batch=makeBatches([{id:'o1',sourceId:'s',text:'Je souhaite du stationnement vélo.'},{id:'o2',sourceId:'s',text:'Le détour accessible reste à vérifier.'}])[0];
  const parsed=validateBatchResult({groups:[{title:'Il n’existe aucun stationnement.',reading:'',caveat:'',question:'Comment installer des arceaux ?',refs:['o1:1']}],unclassified_refs:['o2:1'],exclusions:[{ref:'o2:1',reason:'no_information'}]},batch);
  const result=validateReview({checked_ids:['b1-g1','excluded:o2:1'],corrections:[{id:'b1-g1',title:'Du stationnement vélo est demandé.',reading:'',caveat:'',question:'Où les vélos sont-ils garés ?'}],recovered:[{title:'Le détour accessible reste à vérifier.',reading:'',caveat:'',question:'',refs:['o2:1']}]},parsed,batch);
  expect(result.groups).toHaveLength(2);expect(result.exclusions).toHaveLength(0);
  expect(result.groups[0].title).toBe('Du stationnement vélo est demandé.');
  expect(()=>validateReview({checked_ids:['b1-g1'],corrections:[],recovered:[]},parsed,batch)).toThrow('tous les constats');
});
test('0.72.12 - Références inventées, exclusions sans raison et fréquences dans les questions sont refusées',()=>{
  const b=makeBatches([{id:'o1',sourceId:'s',text:'Je souhaite du stationnement vélo.'}])[0];
  expect(()=>validateBatchResult({groups:[],unclassified_refs:['o1:1']},b)).toThrow('motif');
  expect(()=>validateBatchResult({groups:[{title:'Stationnement demandé.',refs:['o1:1','invented']}],unclassified_refs:[]},b)).toThrow('référence');
  expect(()=>validateBatchResult({groups:[{title:'Stationnement demandé.',refs:['o1:1'],question:'Pourquoi manque-t-il souvent des places ?'}],unclassified_refs:[]},b)).toThrow('fréquence');
});
test('0.72.13 - Les mesures conservent valeur, unité et période ; les synthèses développées restent entières',()=>{
  const inputs=[{id:'r',facts:[{id:'f',value:1240,unit:'passages / jour',period:'période inconnue'}]}];
  const out=validateOverview({text:'Le compteur indique {{fact:f}}.',refs:['r']},inputs);
  expect(out.text).toContain('1\u202f240 passages / jour (période inconnue)');
  expect(()=>validateOverview({text:'Le secteur compte 1 240 habitants par an.',refs:['r']},inputs)).toThrow('unité');
  expect(()=>validateOverview({text:'{{fact:invented}}',refs:['r']},inputs)).toThrow('mesure');
  const long='Les observations permettent de préparer la visite en tenant compte des conditions décrites. '.repeat(12).trim();
  expect(validateOverview({text:long,refs:['r']},inputs).text).toBe(long);
});
test('0.72.14 - Changer l’objet ne repaie pas les lectures et changer un texte invalide son cache',async()=>{
  const d=dossierCase('rural').dossier,seen=[];
  const request=async b=>{seen.push(b);return b.phase==='read'?read(b):b.phase==='review'?reviewed(b):{text:'Les observations décrivent les conditions de passage.',refs:b.readings.map(r=>r.id)};};
  await analyzeDossier(d,{request});expect(d.analysis.status).toBe('complete');
  const id=d.analysis.runId;seen.length=0;d.objective='Vérifier les accès avec une poussette.';refreshOverview(d);
  await analyzeDossier(d,{request});expect(seen.map(b=>b.phase)).toEqual(['overview']);expect(seen[0].objective).toBe(d.objective);expect(d.analysis.runId).toBe(id);
  expect(seen[0].observations.map(o=>o.text)).toEqual(d.observations.filter(o=>o.text).map(o=>o.text));
  seen.length=0;d.observations[0].text+=' Le passage est fermé le soir.';d.analysis.status='pending';
  await analyzeDossier(d,{request});expect(seen.map(b=>b.phase)).toEqual(['read','review','overview']);
});

test('0.72.15 - Une quantité citée en lettres dans un original reste vérifiable après reformulation',()=>{
  const inputs=[{id:'r',observationIds:['o1'],reading:'Des voitures sont présentes.'}];
  const observations=[{id:'o1',text:'À 16 h 30, deux voitures étaient sur le trottoir.'}];
  expect(validateOverview({text:'Une visite à 16 h 30 a observé 2 voitures sur le trottoir.',refs:['r']},inputs,observations).text).toContain('2 voitures');
  expect(()=>validateOverview({text:'La visite a observé 30 voitures.',refs:['r']},inputs,[])).toThrow('chiffre');
});
test('0.72.16 - Le coût est estimé avant le premier appel, à partir du nombre de textes',()=>{
  expect(estimateAnalysisMicro(0)).toBe(0);expect(estimateAnalysisMicro('abc')).toBe(0);
  expect(estimateAnalysisMicro(1)).toBe(71000);expect(estimateAnalysisMicro(36)).toBe(106000);
  // Le budget prévu couvre une zone ordinaire ; l'arrêt est nettement plus haut et le plafond de la base le suit
  expect(estimateAnalysisMicro(170)).toBeLessThanOrEqual(EXPECTED_BUDGET_MICRO);expect(estimateAnalysisMicro(171)).toBeGreaterThan(EXPECTED_BUDGET_MICRO);
  expect(HARD_LIMIT_MICRO).toBeGreaterThanOrEqual(4*EXPECTED_BUDGET_MICRO);
  expect(readFileSync('supabase/migrations/20260918095810_diagnostic_ai_runs_limit_1_dollar.sql','utf8')).toContain(`default ${HARD_LIMIT_MICRO}`);
});
