// @ts-check
import { test, expect } from '@playwright/test';
import { dossierCase, reviewedCase, layeredCase } from './fixtures/diagnostic-dossiers.js';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../netlify/functions/lib/http.mjs';
import { dossierRow } from '../admin/sections/diagnostic/dossier/model.js';

const REPORT_ID = '10664342-ff7d-47fb-8c58-96b4e2fae211';
const NEXT_ID = '10664342-ff7d-47fb-8c58-96b4e2fae212';
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));
async function mockReports(page, dossier) {
  const rows = new Map([[REPORT_ID, { ...dossierRow(dossier), id: REPORT_ID, ville: 'test-e2e', created_at: dossier.capturedAt }]]);
  const writes = [];
  await page.route('**/rest/v1/diagnostic_reports**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      const row = { ...payload, id: NEXT_ID, created_at: new Date().toISOString() };
      rows.set(NEXT_ID, row); writes.push(row);
      await route.fulfill({ json: row, status: 201 });
    } else {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      await route.fulfill({ json: id ? rows.get(id) || null : [...rows.values()] });
    }
  });
  return { rows, writes };
}
async function open(page) { await waitForBoot(page, `/admin/diagnostic/${REPORT_ID}/`); await expect(page.locator('.dz-workspace')).toBeVisible(); }
const reviewResult = (data) => ({checked_ids:[...data.groups.map(g=>g.id),...(data.exclusions||[]).map(e=>`excluded:${e.ref}`)],corrections:[],recovered:[]});
function analysisResponse(data) {
  if (data.phase === 'review') return reviewResult(data);
  if (data.phase === 'read') return {groups:[{title:'Des situations rapportées',reading:'Des difficultés de circulation sont rapportées.',refs:data.observations.map(o=>o.id),caveat:'Les situations restent à vérifier.',question:''}],unclassified_refs:[]};
  if (data.phase === 'overview') return {text:'Des difficultés de circulation sont rapportées.',refs:data.readings.map(r=>r.id)};
  return {findings:data.groups.map(g=>({title:g.title,reading:g.reading,group_ids:[g.id],fact_ids:[],caveat:g.caveat,question:''}))};
}


 test.describe('12.10 - Dossier web, preuves et versions', () => {
  test('12.10.1 - Adresse autonome, preuves intégrales et brouillon récupéré après rechargement', async ({ page }) => {
    await mockReports(page, reviewedCase()); await open(page);
    await expect(page.locator('.dz-header h1')).toHaveText('Les abords de la gare');
    await page.locator('[data-view="findings"]').click();
    await page.locator('[data-finding-tab="reading-access"]').click();
    await page.locator('[data-evidence="reading-access"]').click();
    await expect(page.locator('.dz-dialog')).toBeVisible();
    await expect(page.locator('[data-evidence-count]')).toHaveText('6 observations.');
    await page.locator('[data-search]').fill('chaussée');
    await expect(page.locator('.dz-evidence')).toHaveCount(2);
    await page.locator('[data-close]').click();
    await page.locator('[data-edit]').first().click();
    await page.locator('[name="notes"]').fill('Vérifier le passage avec le service voirie.');
    await expect(page.locator('[data-save-state]')).toHaveText('Brouillon conservé sur cet appareil');
    await page.reload();
    await page.locator('[data-edit]').first().click();
    await expect(page.locator('[name="notes"]')).toHaveValue('Vérifier le passage avec le service voirie.');
  });
  test('12.10.2 - Enregistrer crée une nouvelle version sans modifier le document d’origine', async ({ page }) => {
    const state = await mockReports(page, reviewedCase()); await open(page);
    await page.locator('[data-edit]').first().click();
    await page.locator('[name="title"]').fill('La gare et ses accès');
    await page.locator('[data-editor-done]').click();
    await clearToasts(page); await page.locator('[data-save]').click();
    await expect(page).toHaveURL(new RegExp(`${NEXT_ID}/$`));
    await expect(page.locator('[data-save-state]')).toHaveText('Version 2 enregistrée');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].analysis.dossier.title).toBe('La gare et ses accès');
    expect(state.rows.get(REPORT_ID).analysis.dossier.title).toBe('Les abords de la gare');
    await page.reload();
    await expect(page.locator('.dz-header h1')).toHaveText('La gare et ses accès');
  });
  test('12.10.3 - Le PDF reprend les choix, les notes et les originaux sans relancer l’IA', async ({ page }) => {
    await mockReports(page, reviewedCase()); await open(page);
    let aiCalls = 0;
    await page.route('**/api/ai-diagnostic', route => { aiCalls++; return route.abort(); });
    await page.locator('[data-view="findings"]').click();
    await page.locator('.dz-finding-options summary').click();
    await page.locator('[data-include="reading-positive"]').uncheck();
    await page.locator('[data-edit]').first().click();
    await page.locator('[name="notes"]').fill('Visite prévue avec les agents.');
    await page.locator('[name="editorialSummary"]').fill('Notre visite doit préciser les conditions de passage aux abords de la gare.');
    await page.locator('[data-editor-done]').click();
    await page.evaluate(() => { window.__printCount = 0; window.print = () => { window.__didPrint = true; window.__printCount++; }; });
    await page.locator('[data-export]').click();
    await expect.poll(() => page.evaluate(() => window.__didPrint)).toBeTruthy();
    const printed = page.locator('.dz-print-host');
    await expect(printed.locator('[data-finding="reading-positive"]')).toHaveCount(0);
    await expect(printed.locator('[data-finding="reading-access"]')).toHaveCount(1);
    await expect(printed.locator('.dz-print-notes')).toContainText('Visite prévue');
    await expect(printed.locator('.dz-summary-credit')).toHaveText('Synthèse de la collectivité');
    await expect(printed.locator('.dz-lead')).toHaveText('Notre visite doit préciser les conditions de passage aux abords de la gare.');
    await expect(printed).toContainText('Le passage est étroit et les voitures essaient de doubler les vélos.');
    expect(aiCalls).toBe(0);
    expect(await page.evaluate(() => window.__printCount)).toBe(1);
    await expect(page.locator('.dz-dialog')).not.toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(printed).toHaveCount(0);
  });
  test('12.10.4 - Une panne au deuxième lot se reprend après rechargement sans relire le premier', async ({ page }) => {
    await mockReports(page, dossierCase('large').dossier);
    let readCalls = 0, fail = true;
    const ids = [];
    await page.route('**/api/ai-diagnostic', async route => {
      const data = route.request().postDataJSON();
      if (data.phase === 'read') {
        readCalls++;
        if (readCalls >= 2 && fail) return route.fulfill({status:502,json:{error:'Interruption simulée, reprenez la lecture.'}});
        ids.push(...data.observations.map(o=>o.id));
        return route.fulfill({json:{groups:[{title:'Des situations rapportées',reading:'Des difficultés de circulation sont rapportées.',refs:data.observations.map(o=>o.id),caveat:'Les situations restent à vérifier.',question:''}],unclassified_refs:[]}});
      }
      if(data.phase==='review')return route.fulfill({json:reviewResult(data)});
      if(data.phase==='overview')return route.fulfill({json:{text:'Des difficultés de circulation sont rapportées.',refs:data.readings.map(r=>r.id)}});
      return route.fulfill({json:{findings:data.groups.map(g=>({title:g.title,reading:g.reading,group_ids:[g.id],fact_ids:[],caveat:g.caveat,question:''}))}});
    });
    await open(page);
    await expect(page.locator('[data-analysis-status]')).toContainText('Interruption simulée');
    await expect(page.locator('[data-export]')).toBeDisabled();
    await expect(page.locator('[data-analyze]')).toHaveText('Reprendre l’analyse');
    expect(readCalls).toBe(4);
    fail = false; await page.reload();
    await expect(page.locator('#dz-sources .dz-method')).toContainText('410 textes examinés', {timeout:20000});
    expect(new Set(ids).size).toBe(410); expect(ids.length).toBe(410);
  });
  for (const kind of ['measures', 'empty', 'unknown']) test(`12.10.5 - Le cas ${kind} reste lisible et exportable`, async ({ page }) => {
    await mockReports(page, dossierCase(kind).dossier);
    let calls=0;
    await page.route('**/api/ai-diagnostic',route=>{calls++;return route.fulfill({json:analysisResponse(route.request().postDataJSON())});});
    await open(page);
    await expect(page.locator('[data-export]')).toBeEnabled();
    if(kind==='measures') { await page.locator('[data-view="findings"]').click(); await expect(page.locator('.dz-reference .dz-metrics')).toContainText('29,3'); await expect(page.locator('[data-analyze]')).toHaveCount(0); }
    if(kind==='empty') await expect(page.locator('.dz-lead')).toContainText('Aucune observation');
    if(kind!=='unknown') expect(calls).toBe(0);
    if(kind==='unknown') { await page.locator('[data-view="sources"]').click(); await expect(page.locator('.dz-source-register')).toContainText('Chargement échoué'); }
  });
  test('12.10.6 - Une adresse introuvable ne révèle aucune donnée', async ({page})=>{
    await mockReports(page, reviewedCase());
    await waitForBoot(page, '/admin/diagnostic/10664342-ff7d-47fb-8c58-96b4e2fae299/');
    await expect(page.locator('.dz-empty')).toContainText('introuvable');
    await expect(page.locator('.dz-workspace')).toHaveCount(0);
  });
  test('12.10.7 - La collectivité peut reformuler et réordonner sans changer les preuves', async ({ page }) => {
    await mockReports(page, reviewedCase()); await open(page);
    await page.locator('[data-view="findings"]').click();
    await page.locator('.dz-finding-options summary').click();
    await page.locator('[data-edit-finding="reading-positive"]').click();
    await page.locator('[data-finding-editor] [name="title"]').fill('La liaison dédiée est appréciée pour rejoindre la gare');
    await page.locator('[data-finding-editor] [name="reading"]').fill('Les retours décrivent un trajet agréable vers la gare.');
    await page.locator('[data-finding-editor] [type="submit"]').click();
    await expect(page.locator('.dz-constat.is-open h3')).toContainText('La liaison dédiée est appréciée');
    await expect(page.locator('.dz-finding .dz-summary-credit')).toContainText('collectivité');
    await page.locator('.dz-finding-options summary').click();
    await page.locator('[data-move-finding="reading-positive"][data-direction="1"]').click();
    await expect(page.locator('[data-finding-tab]').first()).toHaveAttribute('data-finding-tab','reading-access');
    await page.reload();
    await page.locator('[data-view="findings"]').click();
    await page.locator('[data-finding-tab="reading-positive"]').click();
    await expect(page.locator('.dz-finding-reading')).toHaveText('Les retours décrivent un trajet agréable vers la gare.');
    await expect(page.locator('[data-evidence="reading-positive"]')).toHaveText('Consulter les 2 observations');
  });
  test('12.10.8 - Depuis une zone vide, le dossier se crée sans appel IA et se rouvre', async ({ page }) => {
    const state = await mockReports(page, dossierCase('empty').dossier);
    await waitForBoot(page, '/admin/diagnostic/');
    await page.waitForSelector('.dg-dock');
    await page.evaluate(async () => {
      const { dossierCase } = await import('/tests/fixtures/diagnostic-dossiers.js');
      const { dg } = await import('/admin/sections/diagnostic/state.js');
      const { renderAnalysisPanel } = await import('/admin/sections/diagnostic/analysis.js');
      const { showTab } = await import('/admin/sections/diagnostic/panel.js');
      const fixture = dossierCase('empty');
      dg.selection = fixture.selection; dg.layers = fixture.layers; dg.runtime = fixture.runtime;
      renderAnalysisPanel(); showTab('analyse');
    });
    await page.locator('#dg-analyze').click();
    await expect(page).toHaveURL(new RegExp(`${NEXT_ID}/$`), {timeout:20000});
    await expect(page.locator('.dz-lead')).toContainText('Aucune observation');
    expect(state.writes).toHaveLength(1);
    const remainingDraft = await page.evaluate(async (familyId) => {
      const { store } = await import('/admin/store.js');
      const { readDraft, draftKey } = await import('/admin/sections/diagnostic/dossier/drafts.js');
      return readDraft(draftKey(store.user.id, store.city, `draft-${familyId}`));
    }, state.writes[0].analysis.dossier.familyId);
    expect(remainingDraft).toBeNull();
    await page.reload(); await expect(page.locator('.dz-workspace')).toBeVisible();
  });
  test('12.10.9 - Les cartes restent disponibles après rechargement', async ({page})=>{
    const dossier=reviewedCase();
    const url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=';
    dossier.figures.cover={url,bounds:dossier.zone.bbox,width:1000,height:680};
    await mockReports(page,dossier);await open(page);await page.reload();
    await expect(page.locator('#dz-overview image')).toHaveAttribute('href',url);
  });
  test('12.10.10 - Le JSON du dossier et ses images passent réellement par le RLS existant', async () => {
    const auth=JSON.parse(readFileSync('tests/.auth/admin.json','utf8'));
    const session=JSON.parse(auth.origins.flatMap(o=>o.localStorage).find(v=>v.name==='grandsprojets-auth').value);
    const client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${session.access_token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const dossier=reviewedCase();dossier.title='E2E - Persistance du dossier';
    dossier.figures.cover={url:'data:image/png;base64,AAAA',bounds:dossier.zone.bbox,width:1000,height:680};
    let id;
    try {
      const created=await client.from('diagnostic_reports').insert({...dossierRow(dossier),ville:'test-e2e',created_by:session.user.id}).select('id').single();
      expect(created.error).toBeNull();id=created.data.id;
      const read=await client.from('diagnostic_reports').select('*').eq('ville','test-e2e').eq('id',id).single();
      expect(read.error).toBeNull();expect(read.data.analysis.dossier).toEqual(dossier);
      const other=await client.from('diagnostic_reports').select('id').eq('ville','dossier-other-city').eq('id',id);
      expect(other.data).toEqual([]);
    } finally { if(id) await client.from('diagnostic_reports').delete().eq('id',id).eq('ville','test-e2e'); }
  });
  test('12.10.11 - Les rapports historiques gardent leur lecture et leur export', async ({page})=>{
    const state=await mockReports(page,reviewedCase());
    state.rows.get(REPORT_ID).analysis={resume:'Lecture conservée du rapport historique.',couches:[]};
    state.rows.get(REPORT_ID).stats={};
    await waitForBoot(page,`/admin/diagnostic/${REPORT_ID}/`);
    await page.locator('[data-legacy]').click();
    await expect(page.locator('.dg-report-doc')).toContainText('Lecture conservée du rapport historique.');
    await expect(page.locator('[data-rp-print]')).toBeVisible();
    await page.locator('[data-rp-close]').click();
    await expect(page.locator('.dg-report-doc')).toHaveCount(0);
  });
  test('12.10.12 - La lecture reste dégagée, les onglets sont accessibles au clavier et le retour restaure l’admin', async ({ page }) => {
    await mockReports(page, reviewedCase()); await open(page);
    await expect(page.locator('#dz-overview')).toBeVisible();
    await expect(page.locator('#dz-findings')).toBeHidden();
    await expect(page.locator('#dz-sources')).toBeHidden();
    await expect(page.locator('.adm-sidebar')).toBeHidden();
    await expect(page.locator('[data-editor]')).toHaveCount(0);
    await page.locator('[data-view="overview"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-view="findings"]')).toBeFocused();
    await expect(page.locator('#dz-findings')).toBeVisible();
    await expect(page.locator('#dz-overview')).toBeHidden();
    await expect(page.locator('[data-include]').first()).toBeHidden();
    await page.keyboard.press('End');
    await expect(page.locator('#dz-sources')).toBeVisible();
    await page.locator('[data-edit]').click();
    await page.locator('.dz-editor-export summary').click();
    await page.locator('[data-appendix]').check();
    await page.locator('[data-editor-done]').click();
    await page.evaluate(() => { window.print = () => {}; });
    await page.locator('[data-export]').click();
    await expect(page.locator('.dz-print-evidence h2')).toHaveText('Toutes les observations');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.locator('[data-back]').click();
    await expect(page.locator('.adm-sidebar')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/is-dossier-open/);
  });
  test('12.10.13 - Le dossier et ses outils restent utilisables sur un petit écran', async ({ page }) => {
    await page.setViewportSize({width:390,height:844});
    const dossier=reviewedCase(); dossier.title='Les cheminements du centre-bourg et les accès aux équipements publics';
    await mockReports(page,dossier); await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('[data-edit]').first().click();
    await expect(page.locator('.dz-dialog.is-editor')).toBeVisible();
    await page.locator('[name="notes"]').fill('Vérifier le passage devant l’école.');
    await page.locator('[data-editor-done]').click();
    await expect(page.locator('[data-notes-preview]')).toHaveText('Vérifier le passage devant l’école.');
    await page.locator('[data-view="findings"]').click();
    await page.locator('[data-finding-tab="reading-access"]').click();
    await expect(page.locator('#dz-active-finding .dz-finding-reading')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  test('12.10.14 - Le PDF relie ses citations aux preuves et reste clair depuis le thème sombre', async ({ page }) => {
    await mockReports(page,reviewedCase());await open(page);
    await page.evaluate(()=>{document.documentElement.dataset.theme='dark';window.print=()=>{};});
    await page.locator('[data-export]').click();
    const printed=page.locator('.dz-print-host');
    await expect(printed.locator('a[href="#dz-proof-o1"]').first()).toBeAttached();
    await expect(printed.locator('#dz-proof-o1')).toBeAttached();
    await expect(printed).toContainText('La chaussée abîmée oblige à se déporter dans la circulation.');
    await page.emulateMedia({media:'print'});
    const colors=await printed.locator('.dz-print').evaluate(el=>({ink:getComputedStyle(el).color,paper:getComputedStyle(el).backgroundColor}));
    expect(colors).toEqual({ink:'rgb(15, 23, 42)',paper:'rgb(255, 255, 255)'});
    await expect(printed.locator('.dz-print-cover')).toHaveCount(1);
  });
  test('12.10.15 - La création analyse automatiquement les témoignages avant de permettre le PDF', async ({page}) => {
    const state=await mockReports(page,dossierCase().dossier);
    const phases=[];
    let releaseRead, releaseOverview;
    const reading=new Promise(resolve=>{releaseRead=resolve;});
    const overview=new Promise(resolve=>{releaseOverview=resolve;});
    await page.route('**/api/ai-diagnostic',async route=>{
      const data=route.request().postDataJSON();phases.push(data.phase);
      expect(data.objective).toBe('Vérifier les accès avec une poussette.');
      if(data.phase==='read')await reading;
      if(data.phase==='review')return route.fulfill({json:reviewResult(data)});
      if(data.phase==='overview')await overview;
      await route.fulfill({json:analysisResponse(data)});
    });
    await waitForBoot(page,'/admin/diagnostic/');
    await page.waitForSelector('.dg-dock');
    await page.evaluate(async()=>{
      const {dossierCase}=await import('/tests/fixtures/diagnostic-dossiers.js');
      const {dg}=await import('/admin/sections/diagnostic/state.js');
      const {renderAnalysisPanel}=await import('/admin/sections/diagnostic/analysis.js');
      const {showTab}=await import('/admin/sections/diagnostic/panel.js');
      const fixture=dossierCase();
      dg.selection=fixture.selection;dg.layers=fixture.layers;dg.runtime=fixture.runtime;
      renderAnalysisPanel();showTab('analyse');
    });
    await expect(page.locator('#dg-analyze')).toHaveText('Analyser la zone');
    await page.locator('#dg-study-objective').fill('Vérifier les accès avec une poussette.');
    await page.locator('#dg-analyze').click();
    await expect(page).toHaveURL(new RegExp(`${NEXT_ID}/$`),{timeout:20000});
    await expect.poll(()=>phases).toEqual(['read']);
    await expect(page.locator('[data-analyze]')).toHaveCount(0);
    await expect(page.locator('[data-analysis-status]')).toContainText('Nous lisons les témoignages.');
    await expect(page.locator('[data-analysis-status] [role="progressbar"]')).toHaveAttribute('aria-valuenow', /^\d+$/);
    await expect(page.locator('[data-analysis-status] .dz-run__lot.is-current')).toHaveCount(1);
    await expect(page.locator('[data-export]')).toBeDisabled();
    await expect(page.locator('[data-save]')).toBeDisabled();
    await page.locator('[data-view="sources"]').click();
    await expect(page.locator('[data-analysis-status]')).toBeVisible();
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('.dz-print-host')).toContainText('L’analyse des témoignages n’est pas terminée');
    await expect(page.locator('.dz-print-host .dz-print-measures')).toHaveCount(0);
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    releaseRead();
    await expect.poll(()=>phases).toEqual(['read','review','overview']);
    await expect(page.locator('[data-analysis-status]')).toContainText('Nous rédigeons la synthèse.');
    await expect(page.locator('[data-analysis-status] .dz-run__final.is-current')).toHaveCount(1);
    await expect(page.locator('[data-analysis-status]')).toContainText('Il ne reste que la synthèse.');
    await expect(page.locator('[data-export]')).toBeDisabled();
    releaseOverview();
    await expect(page.locator('#dz-sources .dz-method')).toContainText('12 textes examinés');
    await expect(page.locator('[data-export]')).toBeEnabled();
    await page.locator('[data-view="overview"]').click();
    await expect(page.locator('#dz-overview .dz-recap')).toContainText('L’analyse est terminée : 12 textes examinés');
    await expect(page.locator('.dz-lead')).toHaveText('Des difficultés de circulation sont rapportées.');
    await page.locator('[data-save]').click();
    await expect(page.locator('[data-save-state]')).toHaveText('Version 2 enregistrée');
    expect(state.writes.at(-1).analysis.dossier.analysis.status).toBe('complete');
    await page.reload();await expect(page.locator('[data-export]')).toBeEnabled();
    expect(phases).toEqual(['read','review','overview']);
  });
  test('12.10.16 - Une analyse mise en pause reste obligatoire et peut reprendre sans quitter le dossier', async ({page})=>{
    await mockReports(page,dossierCase('rural').dossier);
    let first=true,release;
    const held=new Promise(resolve=>{release=resolve;});
    await page.route('**/api/ai-diagnostic',async route=>{
      if(first){first=false;await held;return route.abort().catch(()=>{});}
      return route.fulfill({json:analysisResponse(route.request().postDataJSON())});
    });
    await open(page);await page.locator('[data-pause]').click();release();
    await expect(page.locator('[data-analysis-status]')).toContainText('L’analyse est en pause');
    await expect(page.locator('[data-export]')).toBeDisabled();
    await page.locator('[data-analyze]').click();
    await expect(page.locator('[data-export]')).toBeEnabled();
    await expect(page.locator('#dz-sources .dz-method')).toContainText('2 textes examinés');
  });

  test('12.10.17 - Une coupure réseau se reprend et une synthèse développée ne déclenche pas de dépense supplémentaire',async({page})=>{
    await mockReports(page,dossierCase('rural').dossier);
    let reads=0,overviews=0;const corrections=[];
    await page.route('**/api/ai-diagnostic',route=>{
      const data=route.request().postDataJSON();
      if(data.phase==='read'&&++reads===1)return route.fulfill({status:503,json:{error:'Interruption réseau',retryable:true}});
      if(data.phase==='review')return route.fulfill({json:reviewResult(data)});
      if(data.phase==='overview'){
        overviews++;corrections.push(data.qualityIssue);
        if(overviews===1)return route.fulfill({json:{text:'Une synthèse beaucoup trop longue. '.repeat(20),refs:data.readings.map(r=>r.id)}});
      }
      return route.fulfill({json:analysisResponse(data)});
    });
    await open(page);
    await expect(page.locator('[data-analysis-status]')).toContainText('Nous reprenons la connexion.');
    await expect(page.locator('[data-export]')).toBeEnabled({timeout:15000});
    expect(reads).toBe(2);expect(overviews).toBe(1);expect(corrections[0]).toBeUndefined();
    await expect(page.locator('.dz-lead')).toHaveText('Une synthèse beaucoup trop longue. '.repeat(20).trim());
    await expect(page.locator('[data-analyze]')).toHaveCount(0);
  });
  test('12.10.18 - Les constats, les mesures et les sources ont chacun leur place',async({page})=>{
    await mockReports(page,reviewedCase());await open(page);
    await expect(page.locator('.dz-tabs [role="tab"]')).toHaveCount(3);
    await page.locator('[data-view="findings"]').click();
    await expect(page.locator('[data-finding-tab]')).toHaveCount(2);
    await expect(page.locator('#dz-findings')).not.toContainText('Les passages mesurés aux compteurs');
    await page.locator('[data-layer-tab="counter"]').click();
    await expect(page.locator('[data-measure="measure-counter"] .dz-metrics')).toContainText('1 240');
    await page.locator('.dz-finding-options summary').click();
    await page.locator('[data-include="measure-counter"]').uncheck();
    await page.evaluate(()=>window.print=()=>{});await page.locator('[data-export]').click();
    await expect(page.locator('.dz-print-host [data-finding="measure-counter"]')).toHaveCount(0);
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-view="findings"]').click();
    await page.locator('[data-layer-picker]').selectOption('voices');
    await page.locator('[data-finding-tab="reading-access"]').click();
    await expect(page.locator('.dz-constat.is-open h3')).toContainText('Des passages étroits');
    await page.locator('[data-view="sources"]').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });

  test('12.10.19 - La synthèse ne duplique ni les constats ni le registre des sources', async ({page}) => {
    const dossier = reviewedCase();
    await mockReports(page, dossier); await open(page);
    await expect(page.locator('.dz-tabs [role="tab"]')).toHaveText(['Synthèse', 'Analyses', 'Sources']);
    await expect(page.locator('[data-analysis-status]')).toBeHidden();
    await expect(page.locator('#dz-overview .dz-map')).toHaveCount(1);
    await expect(page.locator('#dz-overview [data-finding], #dz-overview [data-select], #dz-overview .dz-metrics')).toHaveCount(0);
    for (const f of dossier.findings) await expect(page.locator('#dz-overview')).not.toContainText(f.title);
    await page.locator('[data-view="sources"]').click();
    await expect(page.locator('.dz-source')).toHaveCount(dossier.sources.length);
    for (const source of dossier.sources) await expect(page.locator('.dz-source-name').filter({hasText:source.label})).toHaveCount(1);
    await expect(page.locator('#dz-sources .dz-sources-table, #dz-sources [data-appendix]')).toHaveCount(0);
    await expect(page.locator('.dz-reference:visible')).toHaveCount(0);
    await expect(page.locator('#dz-sources .dz-reference')).toHaveCount(0);
    await page.locator('[data-view="findings"]').click();
    await page.locator('[data-layer-tab="counter"]').click();
    await expect(page.locator('.dz-reference:visible')).toHaveCount(1);
    await expect(page.locator('.dz-reference:visible .dz-map, .dz-reference:visible .dz-map-unavailable')).toHaveCount(1);
  });

  test('12.10.20 - Une ancienne formule creuse est reprise sans relire les témoignages ni modifier la version enregistrée', async ({page}) => {
    const dossier = dossierCase('rural').dossier;
    const refs = dossier.observations.filter(o=>o.text).map(o=>o.id);
    const vague = 'Les secteurs animés sont associés à des besoins de stationnement vélo.';
    const group = {id:'b1-g1',title:vague,reading:'',observationIds:refs,sourceIds:[dossier.sources[0].id],factIds:[],caveat:'',question:''};
    dossier.analysis = {status:'complete',completedIds:refs,batches:{b1:{groups:[group],completedParts:refs.map(id=>`${id}:1`)}},synthesis:{0:[]}};
    dossier.findings = [{...group,id:'reading-old',kind:'testimony',included:true}];
    dossier.overview = {text:vague,findingIds:['reading-old']};
    const state = await mockReports(page,dossier); const phases=[];
    await page.route('**/api/ai-diagnostic',route=>{
      const data=route.request().postDataJSON(); phases.push(data.phase);
      return route.fulfill({json:data.phase==='review'?{checked_ids:data.groups.map(g=>g.id),recovered:[],corrections:[{title:'L’accès à l’arrêt de bus est difficile après la pluie.',reading:'Le chemin est décrit comme pénible lorsque le sol est mouillé.',id:'b1-g1',caveat:'',question:''}]}:{text:'L’accès à l’arrêt de bus est décrit comme difficile après la pluie.',refs:data.readings.map(r=>r.id)}});
    });
    await open(page); await expect(page.locator('[data-export]')).toBeEnabled();
    expect(phases).toEqual(['review','overview']);
    await expect(page.locator('.dz-workspace')).not.toContainText(vague);
    expect(state.writes).toHaveLength(0);
    await page.reload(); await expect(page.locator('[data-export]')).toBeEnabled();
    expect(phases).toEqual(['review','overview']);
  });

 });

test('12.11.1 - Une fiche par couche, des constats dépliables et des preuves ciblées', async ({page}) => {
  await mockReports(page,layeredCase()); await open(page);
  await page.locator('[data-open-view="findings"]').click();
  await expect(page.locator('[data-layer-tab]')).toHaveCount(7);
  await expect(page.locator('[data-layer-tab="empty"]')).toBeDisabled();
  await expect(page.locator('[data-layer-tab="empty"]')).toContainText('Aucune donnée dans cette zone');
  await page.locator('[data-layer-tab="voices"]').focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-layer-tab="agents"]')).toBeFocused();
  await expect(page.locator('.dz-layer-heading h2')).toHaveText('Observations des agents');
  await expect(page.locator('[data-finding-tab]')).toHaveCount(2);
  await page.locator('[data-finding-tab="reading-agent2"]').click();
  await expect(page.locator('[data-finding-tab="reading-agent2"]')).toHaveAttribute('aria-expanded','true');
  await page.locator('[data-evidence="reading-agent2"]').click();
  await expect(page.locator('[data-evidence-count]')).toHaveText('1 observation.');
  await expect(page.locator('.dz-evidence')).toContainText('nouveau banc');
  await page.locator('[data-close]').click();
  await page.locator('[data-layer-tab="counter"]').click();
  await expect(page.locator('#dz-active-layer .dz-metrics')).toContainText('1 240');
  await page.locator('[data-layer-tab="agents"]').click();
  await expect(page.locator('[data-finding-tab="reading-agent2"]')).toHaveAttribute('aria-expanded','true');
  await page.locator('[data-finding-tab="reading-agent2"]').click();
  await expect(page.locator('#dz-active-finding')).toHaveCount(0);
  await page.locator('[data-layer-evidence="agents"]').click();
  await expect(page.locator('[data-evidence-count]')).toHaveText('3 observations.');
});

test('12.11.2 - Une erreur reste accessible et la notice renvoie vers la bonne analyse', async ({page}) => {
  await mockReports(page,layeredCase()); await open(page);
  await page.locator('[data-view="findings"]').click();
  await page.locator('[data-layer-tab="missing"]').click();
  await expect(page.locator('.dz-layer-empty')).toContainText('Son contenu dans la zone est inconnu');
  await expect(page.locator('.dz-layer-empty [data-back]')).toBeVisible();
  await page.locator('[data-layer-tab="strava"]').click();
  await page.locator('[data-source-link="strava"]').click();
  await expect(page.locator('[data-source="strava"]')).toHaveAttribute('open','');
  await expect(page.locator('#dz-sources .dz-metrics, #dz-sources .dz-map')).toHaveCount(0);
  await page.locator('[data-open-layer="strava"]').click();
  await expect(page.locator('#dz-findings')).toBeVisible();
  await expect(page.locator('.dz-layer-heading h2')).toHaveText('Strava Metro 2024');
  await expect(page.locator('#dz-active-layer')).toContainText('36 600');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('[data-layer-picker] option[value="empty"]')).toHaveJSProperty('disabled', true);
  await page.locator('[data-layer-picker]').selectOption('missing');
  await expect(page.locator('.dz-layer-empty')).toContainText('n’a pas pu être chargée');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('12.11.3 - Un chiffre déformé est corrigé avant de rendre la synthèse et le PDF disponibles', async ({page}) => {
  await mockReports(page, dossierCase().dossier);
  const overviews = [], phases = [];
  await page.route('**/api/ai-diagnostic', async (route) => {
    const body = route.request().postDataJSON(); phases.push(body.phase);
    if (body.phase !== 'overview') return route.fulfill({json:analysisResponse(body)});
    overviews.push(body);
    await route.fulfill({json:{
      text:overviews.length === 1 ? 'Le compteur relève 1,24 million de passages par jour.' : 'Le compteur relève 1 240 passages par jour. Sa période de calcul reste à préciser.',
      refs:body.readings.map((r) => r.id),
    }});
  });
  await open(page);
  await expect(page.locator('[data-export]')).toBeEnabled();
  expect(overviews).toHaveLength(2);
  expect(overviews[1].qualityIssue).toBe('numbers');
  expect(phases).toEqual(['read','review','overview','overview']);
  await expect(page.locator('.dz-lead')).toContainText('1 240 passages');
  await expect(page.locator('.dz-lead')).not.toContainText('million');
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('[data-export]').click();
  await expect(page.locator('.dz-print-host .dz-lead')).toContainText('1 240 passages');
  await expect(page.locator('.dz-print-host')).not.toContainText('million');
});

test('12.12.1 - Actualiser l’objet conserve les constats et ne relance que la synthèse',async({page})=>{
  const dossier=reviewedCase(),seen=[];
  await mockReports(page,dossier);
  await page.route('**/api/ai-diagnostic',route=>{
    const body=route.request().postDataJSON();seen.push(body);
    return route.fulfill({json:{text:'Le cheminement après la pluie doit être examiné avec une poussette.',refs:body.readings.map(r=>r.id)}});
  });
  await open(page);await page.locator('[data-edit]').first().click();
  await expect(page.locator('[data-refresh-overview]')).toBeHidden();
  await page.locator('[name="objective"]').fill('Préparer une visite avec une poussette.');
  await page.locator('[data-refresh-overview]').click();
  await expect(page.locator('[data-export]')).toBeEnabled();
  await expect(page.locator('.dz-lead')).toContainText('poussette');
  expect(seen.map(b=>b.phase)).toEqual(['overview']);
  expect(seen[0].objective).toBe('Préparer une visite avec une poussette.');
  expect(new Set(seen[0].observations.map(o=>o.id))).toEqual(new Set(dossier.findings.flatMap(f=>f.observationIds)));
  await page.reload();await expect(page.locator('[data-export]')).toBeEnabled();
  expect(seen).toHaveLength(1);
});
test('12.12.2 - Le budget atteint conserve les données sans relance automatique après rechargement',async({page})=>{
  await mockReports(page,dossierCase('rural').dossier);let calls=0;
  await page.route('**/api/ai-diagnostic',route=>{calls++;return route.fulfill({status:409,json:{code:'budget',retryable:false,error:'Le budget ne permet pas de poursuivre. Choisissez une zone plus petite.',_usage:{spent_micro:170000,reserved_micro:0,limit_micro:240000}}});});
  await open(page);
  await expect(page.locator('[data-analysis-status]')).toContainText('budget');
  await expect(page.locator('[data-analyze]')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Choisir une zone plus petite'})).toBeVisible();
  await expect(page.locator('[data-export]')).toBeDisabled();
  await page.reload();await expect(page.locator('[data-analysis-status]')).toContainText('budget');
  expect(calls).toBe(1);
  await page.locator('[data-view="sources"]').click();
  await expect(page.locator('.dz-source-register')).toBeVisible();
});
