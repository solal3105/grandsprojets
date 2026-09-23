import * as api from '../../../api.js';
import { store } from '../../../store.js';
import { router } from '../../../router.js';
import { esc, toast } from '../../../components/ui.js';
import { showLegacyReport } from '../legacy-report.js';
import { dossierRow, dossierSummary, analysisRequired, overviewMissing } from './model.js';
import { pageHtml, printHtml, layerHtml, analysisStatus, editorHtml, saveStateText } from './view.js';
import { analyzeDossier, prepareWordingRefresh, prepareLayerRefresh, refreshOverview } from './analyze.js';
import { draftKey, readDraft, writeDraft, removeDraft } from './drafts.js';
import { prepareFindingFigures } from './figures.js';
import { storeFigures, loadFigures } from './figure-store.js';
import { readAnalysisResponse } from './recovery.js';
import { layerAnalyses, findingLayerId } from './presentation.js';

let cleanup = null;
export function destroyDossierPage() { cleanup?.(); cleanup = null; }

/** Page autonome : son contenu ne dépend plus de la carte initiale ni de WebGL. */
export async function renderDossierPage(container, reportId, isAlive = () => true) {
  destroyDossierPage();
  const city = store.city, userId = store.user?.id;
  const previousTitle = document.title;
  document.body.classList.add('is-dossier-open');
  let disposed = false, controller = null, activeId = null, progress = null, draftTimer = null;
  let activeView = 'overview', activeLayerId = null, appendix = false;
  const layerSelection = new Map();
  let dossier, dirty = false, key = draftKey(userId, city, reportId), saving = false;
  // Dernier résultat de l'écriture du brouillon local : l'état affiché survit à un nouvel affichage.
  let localSaved = true;
  let figuresJob = null;
  // Version enregistrée à l'ouverture du dossier, avant la fin de son analyse :
  // elle reçoit l'analyse terminée pour qu'un collègue ou un autre appareil ne la repaie pas.
  let provisional = null;
  const isDraft = () => reportId === 'draft' || reportId.startsWith('draft-');
  const alive = () => !disposed && isAlive() && city === store.city;
  const dialog = document.createElement('dialog');
  dialog.className = 'dz-dialog';
  document.body.appendChild(dialog);
  let printRoot = null;
  const removePrint = () => { printRoot?.remove(); printRoot = null; };
  const preparePrint = () => {
    removePrint();
    printRoot = document.createElement('div');
    printRoot.className = 'dz-print-host';
    printRoot.innerHTML = printHtml(dossier, { appendix, draft: dirty || isDraft(), reportUrl: `${location.origin}/admin/diagnostic/${reportId}/` });
    document.body.appendChild(printRoot);
  };
  const beforePrint = () => { if (dossier && !printRoot) preparePrint(); };
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', removePrint);
  cleanup = () => {
    disposed = true; controller?.abort(); clearTimeout(draftTimer);
    if (dossier && dirty) void writeDraft(key, dossier);
    dialog.remove(); removePrint();
    document.title = previousTitle;
    document.body.classList.remove('is-dossier-open');
    window.removeEventListener('beforeprint', beforePrint);
    window.removeEventListener('afterprint', removePrint);
  };
  container.innerHTML = '<div class="dz-loading" role="status">Ouverture du dossier et de ses cartes…</div>';

  const checkpoint = async () => {
    dirty = true;
    localSaved = Boolean(await writeDraft(key, dossier));
    if (!alive()) return;
    const status = container.querySelector('[data-save-state]');
    if (status) status.textContent = saveStateText(dossier, { saved: false, local: localSaved });
  };

  function ensureFigures() {
    if (analysisRequired(dossier)) return Promise.resolve();
    if (!figuresJob) figuresJob = prepareFindingFigures(dossier, { alive }).then(async (changed) => {
      if (changed && alive()) { await checkpoint(); if (activeLayerId && activeView === 'findings') selectLayer(activeLayerId); }
    }).finally(() => { figuresJob = null; });
    return figuresJob;
  }

  const request = async (payload, signal) => {
    const res = await fetch('/api/ai-diagnostic', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(store.session?.access_token ? { Authorization: `Bearer ${store.session.access_token}` } : {}) },
      body: JSON.stringify({ ...payload, ville: city, mode: 'dossier' }),
    });
    return readAnalysisResponse(res);
  };

  function render() {
    if (!alive()) return;
    document.title = `${dossier.title || 'Dossier de zone'} · Diagnostic terrain`;
    const layers = layerAnalyses(dossier);
    activeLayerId ||= layers.find((l) => l.status !== 'empty')?.source.id;
    activeId = layerSelection.get(activeLayerId) ?? layers.find((l) => l.source.id === activeLayerId)?.findings[0]?.id;
    container.innerHTML = pageHtml(dossier, { activeId, activeLayerId, activeView, saved: !dirty && !isDraft(), local: localSaved, progress });

    container.querySelectorAll('[data-view], [data-open-view]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view || button.dataset.openView)));
    container.querySelector('.dz-tabs').addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...container.querySelectorAll('[data-view]')];
      const index = tabs.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectView(tabs[next].dataset.view); tabs[next].focus();
    });
    container.querySelector('.dz-layer-list')?.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = [...container.querySelectorAll('[data-layer-tab]:not(:disabled)')];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      selectLayer(items[next].dataset.layerTab); items[next].focus();
    });
    container.querySelector('[data-layer-picker]')?.addEventListener('change', (event) => selectLayer(event.target.value));
    wireLayers();
    wireFinding(); wireAnalysis();
    container.querySelectorAll('[data-all-evidence]').forEach((button) => button.addEventListener('click', () => showEvidence()));
    container.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', showEditor));
    container.querySelector('[data-export]').addEventListener('click', showExport);
    container.querySelector('[data-save]').addEventListener('click', save);
  }

  function selectView(view) {
    if (!['overview', 'findings', 'sources'].includes(view)) return;
    activeView = view;
    container.querySelectorAll('[data-view]').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.view === view));
      tab.tabIndex = tab.dataset.view === view ? 0 : -1;
    });
    container.querySelectorAll('.dz-section').forEach((section) => { section.hidden = section.id !== `dz-${view}`; });
  }

  function showEditor() {
    openDialog('Personnaliser le dossier', editorHtml(dossier, { appendix }), true);
    const editor = dialog.querySelector('[data-editor]');
    const objectiveBefore = dossier.objective || '';
    dossier.analysis.overviewObjective ??= objectiveBefore;
    // Sans texte à lire, aucune synthèse n'est rédigée : le bouton d'actualisation n'existe pas.
    const refresh = editor.querySelector('[data-refresh-overview]');
    if (refresh) refresh.hidden = Boolean(controller) || dossier.objective === dossier.analysis.overviewObjective;
    editor.querySelector('[name="objective"]').disabled = Boolean(controller);
    refresh?.addEventListener('click', async () => {
      if (controller) return;
      refreshOverview(dossier); dialog.close(); await checkpoint(); void run();
    });
    const appendixInput = editor.querySelector('[data-appendix]');
    appendixInput.addEventListener('change', () => { appendix = appendixInput.checked; });
    editor.addEventListener('submit', (event) => event.preventDefault());
    editor.querySelector('[data-editor-done]').addEventListener('click', () => dialog.close());
    editor.addEventListener('input', (event) => {
      const field = event.target.name;
      if (!['title', 'objective', 'notes', 'editorialSummary'].includes(field)) return;
      dossier[field] = event.target.value;
      dirty = true;
      clearTimeout(draftTimer); draftTimer = setTimeout(checkpoint, 250);
      if (field === 'title') {
        container.querySelector('.dz-header h1').textContent = dossier.title || 'Dossier de zone';
        document.title = `${dossier.title || 'Dossier de zone'} · Diagnostic terrain`;
      }
      if (field === 'objective') {
        const objective = container.querySelector('.dz-objective');
        if (refresh) refresh.hidden = dossier.objective === (dossier.analysis.overviewObjective ?? objectiveBefore);
        objective.textContent = dossier.objective; objective.hidden = !dossier.objective.trim();
      }
      if (field === 'editorialSummary') {
        // Quand la synthèse proposée manque, celle de la collectivité débloque l'export : la page se recompose.
        if (overviewMissing(dossier) && !controller) { render(); return; }
        container.querySelector('.dz-overview .dz-lead').textContent = dossierSummary(dossier);
        container.querySelector('[data-summary-credit]').hidden = !dossier.editorialSummary.trim();
      }
      if (field === 'notes') {
        container.querySelector('[data-field-note]').hidden = !dossier.notes.trim();
        container.querySelector('[data-notes-preview]').textContent = dossier.notes;
      }
      // L'état n'annonce « gardées » qu'une fois le brouillon réellement écrit (checkpoint).
    });
  }

  function wireLayers() {
    container.querySelectorAll('[data-back]').forEach((link) => { link.onclick = (event) => { event.preventDefault(); router.navigate('/admin/diagnostic/'); }; });
    container.querySelectorAll('[data-layer-tab], [data-open-layer]').forEach((button) => { button.onclick = () => {
      selectLayer(button.dataset.layerTab || button.dataset.openLayer);
      if (button.dataset.openLayer) container.querySelector('#dz-active-layer h2')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }; });
    container.querySelectorAll('[data-finding-tab]').forEach((button) => { button.onclick = () => {
      const id = button.dataset.findingTab;
      selectFinding(id, activeId === id);
      container.querySelector(`[data-finding-tab="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    }; });
    container.querySelectorAll('[data-source-link]').forEach((button) => { button.onclick = () => {
      selectView('sources');
      const details = container.querySelector(`[data-layer-source="${CSS.escape(button.dataset.sourceLink)}"]`)?.closest('details');
      if (details) { details.open = true; details.scrollIntoView({ behavior: 'smooth', block: 'center' }); details.querySelector('summary').focus({ preventScroll: true }); }
    }; });
    container.querySelectorAll('[data-layer-evidence]').forEach((button) => { button.onclick = () => showEvidence(null, button.dataset.layerEvidence); });
  }

  function selectLayer(id) {
    const layer = layerAnalyses(dossier).find((l) => l.source.id === id);
    if (!layer || layer.status === 'empty') return;
    activeLayerId = id;
    activeId = layerSelection.get(id) ?? layer.findings[0]?.id;
    selectView('findings');
    const picker = container.querySelector('[data-layer-picker]');
    if (picker) picker.value = id;
    container.querySelectorAll('[data-layer-tab]').forEach((button) => {
      if (button.dataset.layerTab === id) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    container.querySelector('#dz-active-layer').innerHTML = layerHtml(dossier, layer, activeId);
    wireLayers(); wireFinding();
    void ensureFigures();
  }

  function selectFinding(id, collapse = false) {
    const finding = dossier.findings.find((f) => f.id === id);
    if (!finding) return;
    const layerId = findingLayerId(dossier, finding);
    layerSelection.set(layerId, collapse ? false : id);
    selectLayer(layerId);
  }

  function wireFinding() {
    container.querySelectorAll('[data-edit-finding]').forEach((button) => { button.onclick = () => editFinding(button.dataset.editFinding); });
    container.querySelectorAll('[data-move-finding]').forEach((button) => { button.onclick = async () => {
      const current = dossier.findings.find((f) => f.id === button.dataset.moveFinding);
      const peers = dossier.findings.filter((f) => findingLayerId(dossier, f) === findingLayerId(dossier, current));
      const target = peers[peers.indexOf(current) + Number(button.dataset.direction)];
      if (!target) return;
      const from = dossier.findings.indexOf(current), to = dossier.findings.indexOf(target);
      [dossier.findings[from], dossier.findings[to]] = [target, current];
      activeId = current.id; layerSelection.set(activeLayerId, activeId); await checkpoint(); render();
      container.querySelector(`[data-finding-tab="${CSS.escape(current.id)}"]`)?.focus();
    }; });
    container.querySelectorAll('[data-evidence]').forEach((button) => { button.onclick = () => showEvidence(button.dataset.evidence); });
    container.querySelectorAll('[data-include]').forEach((input) => { input.onchange = async () => {
      const finding = dossier.findings.find((f) => f.id === input.dataset.include);
      finding.included = input.checked;
      await checkpoint();
      const tab = [...container.querySelectorAll('[data-finding-tab]')].find((el) => el.dataset.findingTab === finding.id);
      const label = tab?.querySelector('small');
      container.querySelector('.dz-overview .dz-lead').textContent = dossierSummary(dossier);
      if (label) label.hidden = finding.included;
    }; });
    if (analysisRequired(dossier)) container.querySelectorAll('[data-include], [data-move-finding], [data-edit-finding]').forEach((control) => { control.disabled = true; });
  }

  function editFinding(id) {
    const finding = dossier.findings.find((f) => f.id === id);
    if (!finding || analysisRequired(dossier) || saving) return;
    openDialog('Reformuler le constat', `<p>Votre reformulation sera attribuée à la collectivité. Les références, les citations et les chiffres conserveront leurs données d’origine.</p><form class="dz-editor" data-finding-editor><label>Titre du constat<input class="adm-input" name="title" maxlength="180" required value="${esc(finding.title)}"></label><label>Votre lecture<textarea class="adm-input" name="reading" rows="5" maxlength="3000" required>${esc(finding.reading)}</textarea></label><label>Nuance ou limite <span>Facultatif</span><textarea class="adm-input" name="caveat" rows="3" maxlength="1200">${esc(finding.caveat)}</textarea></label><label>Question à vérifier sur le terrain <span>Facultatif</span><textarea class="adm-input" name="question" rows="3" maxlength="800">${esc(finding.question)}</textarea></label><button class="adm-btn adm-btn--primary" type="submit">Valider la reformulation</button></form>`);
    dialog.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      if (!String(fields.get('title')).trim() || !String(fields.get('reading')).trim()) return;
      finding.generated ||= { title: finding.title, reading: finding.reading, caveat: finding.caveat, question: finding.question };
      for (const field of ['title', 'reading', 'caveat', 'question']) finding[field] = String(fields.get(field)).trim();
      finding.edited = true;
      // La synthèse automatique n'est plus valide après une reformulation.
      dossier.overview = null;
      activeId = id; layerSelection.set(activeLayerId, id); dialog.close(); await checkpoint(); render();
      container.querySelector(`[data-finding-tab="${CSS.escape(id)}"]`)?.focus();
    });
  }

  function wireAnalysis() {
    container.querySelector('[data-analyze]')?.addEventListener('click', run);
    container.querySelector('[data-pause]')?.addEventListener('click', () => controller?.abort());
  }

  async function run() {
    if (controller || saving || !alive() || !analysisRequired(dossier)) return;
    removePrint();
    controller = new AbortController();
    dossier.analysis.status = 'running';
    render();
    await analyzeDossier(dossier, { request, signal: controller.signal, checkpoint, progress: (value) => {
      progress = value;
      if (!alive()) return;
      const status = container.querySelector('[data-analysis-status]');
      status.innerHTML = analysisStatus(dossier, progress); wireAnalysis();
    } });
    controller = null; progress = null;
    if (!alive()) return;
    removePrint(); render();
    if (dossier.analysis.refreshError) {
      toast('La synthèse n’a pas pu être actualisée. La précédente est conservée ; vous pouvez réessayer depuis « Personnaliser ».', 'warning');
      dossier.analysis.refreshError = '';
    }
    await ensureFigures();
    await completeProvisionalVersion();
  }

  /* La version enregistrée à l'ouverture reçoit son analyse terminée, sans devenir
     une nouvelle version : ce n'est pas une modification de la collectivité. Les
     champs saisis entre-temps (nom, observations, synthèse) restent à enregistrer. */
  async function completeProvisionalVersion() {
    if (!provisional || isDraft() || analysisRequired(dossier) || dossier.analysis.status !== 'complete' || saving || !alive()) return;
    await storeFigures(dossier, api.uploadDiagnosticFigure);
    if (!alive()) return;
    const snapshot = structuredClone(dossier);
    for (const field of ['title', 'objective', 'notes', 'editorialSummary']) snapshot[field] = provisional[field];
    const { data, error } = await api.updateDiagnosticReport(reportId, dossierRow(snapshot));
    if (error || !data?.id || !alive()) return;
    const pending = ['title', 'objective', 'notes', 'editorialSummary'].some((field) => (dossier[field] || '') !== (provisional[field] || ''))
      || dossier.findings.some((f) => f.edited || f.included === false);
    provisional = null;
    if (pending) return;
    await removeDraft(key);
    dirty = false;
    const state = container.querySelector('[data-save-state]');
    if (state) state.textContent = `Version ${Number(dossier.revision) || 1} enregistrée`;
  }

  function openDialog(title, content, editor = false) {
    dialog.classList.toggle('is-editor', editor);
    dialog.innerHTML = `<header class="dz-dialog-header"><h2 id="dz-dialog-title">${esc(title)}</h2><button type="button" class="adm-btn adm-btn--ghost" data-close aria-label="Fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header><div class="dz-dialog-body">${content}</div>`;
    dialog.setAttribute('aria-labelledby', 'dz-dialog-title');
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    if (!dialog.open) dialog.showModal();
  }

  function showEvidence(findingId, layerId) {
    const finding = dossier.findings.find((f) => f.id === findingId);
    const selected = finding ? new Set(finding.observationIds) : null;
    const observations = dossier.observations.filter((o) => (!selected || selected.has(o.id)) && (!layerId || o.sourceId === layerId));
    openDialog(finding ? 'Les observations de ce constat' : layerId ? 'Les observations de ce jeu de données' : 'Les observations du dossier', `<p>Les textes sont conservés tels qu’ils figurent dans les données. Un point ne correspond pas nécessairement à une personne distincte.</p><label class="dz-search">Rechercher dans les observations<input type="search" class="adm-input" data-search placeholder="Un lieu, un mot, une référence…"></label><p data-evidence-count role="status"></p><div data-evidence-list></div><button type="button" class="adm-btn adm-btn--secondary" data-more>Afficher la suite</button>`);
    let count = 20;
    const draw = () => {
      const query = dialog.querySelector('[data-search]').value.toLocaleLowerCase('fr');
      const result = observations.filter((o) => `${o.id} ${o.title} ${o.text}`.toLocaleLowerCase('fr').includes(query));
      dialog.querySelector('[data-evidence-count]').textContent = `${result.length} observation${result.length > 1 ? 's' : ''}.`;
      dialog.querySelector('[data-evidence-list]').innerHTML = result.slice(0, count).map((o) => {
        const source = dossier.sources.find((s) => s.id === o.sourceId);
        return `<article class="dz-evidence"><header><b>${esc(o.id.toUpperCase())}</b><span>${esc(source?.label)} · ${esc(source?.period.label)}</span></header><h3>${esc(o.title)}</h3><p>${esc(o.text || 'Cette observation ne comporte pas de texte descriptif.')}</p><details><summary>Informations de la source</summary><dl>${o.fields.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl></details></article>`;
      }).join('') || '<p>Aucune observation ne correspond à cette recherche. Essayez un autre terme.</p>';
      dialog.querySelector('[data-more]').hidden = result.length <= count;
    };
    dialog.querySelector('[data-search]').addEventListener('input', () => { count = 20; draw(); });
    dialog.querySelector('[data-more]').addEventListener('click', () => { count += 20; draw(); });
    draw();
  }

  async function showExport() {
    const button = container.querySelector('[data-export]');
    if (button.disabled || analysisRequired(dossier)) return;
    const label = button.innerHTML;
    button.disabled = true; button.textContent = 'Préparation des cartes…';
    await ensureFigures();
    if (!alive()) return;
    preparePrint();
    await document.fonts?.ready;
    try { window.print(); }
    finally { button.disabled = false; button.innerHTML = label; }
  }

  async function save() {
    if (saving || !alive()) return;
    if (controller) { toast('Interrompez la lecture ou attendez sa fin avant d’enregistrer une version.', 'warning'); return; }
    if (!dossier.title.trim()) { showEditor(); dialog.querySelector('[name="title"]').focus(); toast('Donnez un nom au secteur avant d’enregistrer.', 'warning'); return; }
    saving = true;
    clearTimeout(draftTimer);
    const controls = [...container.querySelectorAll('input, textarea, button')].map((control) => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    const button = container.querySelector('[data-save]');
    button.disabled = true; button.textContent = 'Enregistrement…';
    await ensureFigures();
    if (!alive()) return;
    await storeFigures(dossier, api.uploadDiagnosticFigure);
    if (!alive()) return;
    const snapshot = structuredClone(dossier);
    snapshot.revision = (Number(snapshot.revision) || 1) + (isDraft() ? 0 : 1);
    try {
      const { data, error } = await api.saveDiagnosticReport(dossierRow(snapshot));
      if (error || !data?.id) throw error || new Error('Version non enregistrée');
      if (!alive()) return;
      await removeDraft(key);
      // Une version enregistrée par l'agent n'est plus la version provisoire à compléter.
      dossier = snapshot; dirty = false; reportId = data.id; key = draftKey(userId, city, reportId); provisional = null;
      router.navigate(`/admin/diagnostic/${reportId}/`, { replace: true, skipRender: true });
      render(); toast('La version et ses cartes sont enregistrées.', 'success');
    } catch (error) {
      console.warn('[diagnostic/dossier] Enregistrement:', error);
      toast('La version n’a pas pu être enregistrée. Réessayez avant de fermer le dossier.', 'error');
      await checkpoint();
    } finally {
      saving = false;
      controls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
      if (button.isConnected) { button.disabled = false; button.textContent = 'Enregistrer une version'; }
    }
  }

  try {
    if (isDraft()) dossier = await readDraft(key);
    else {
      const row = await api.getDiagnosticReport(reportId);
      if (!alive()) return;
      if (!row) throw new Error('Ce dossier est introuvable dans la collectivité sélectionnée.');
      if (!row.analysis?.dossier) {
        container.innerHTML = '<div class="dz-empty"><h1>Rapport historique</h1><p>Cette version utilise l’ancienne présentation. Son contenu d’origine est conservé.</p><button type="button" class="adm-btn adm-btn--primary" data-legacy>Ouvrir le rapport historique</button><a class="adm-btn adm-btn--secondary" href="/admin/diagnostic/" data-legacy-back>Revenir à la carte</a></div>';
        container.querySelector('[data-legacy]').addEventListener('click', () => showLegacyReport(row, null, new Date(row.created_at)));
        container.querySelector('[data-legacy-back]').addEventListener('click', (e) => { e.preventDefault(); router.navigate('/admin/diagnostic/'); });
        return;
      }
      dossier = row.analysis.dossier;
      if (analysisRequired(dossier)) provisional = { title: dossier.title, objective: dossier.objective, notes: dossier.notes, editorialSummary: dossier.editorialSummary };
      const draft = await readDraft(key);
      if (draft?.familyId === dossier.familyId && draft.city === city) { dossier = draft; dirty = true; }
    }
    if (!alive()) return;
    if (!dossier || dossier.schemaVersion !== 2 || dossier.city !== city) throw new Error('Ce dossier n’est pas disponible. Revenez à la carte pour en préparer un nouveau.');
    // Les images rangées dans le compartiment privé reviennent en mémoire, comme dans une ancienne version.
    await loadFigures(dossier, api.downloadDiagnosticFigure);
    if (!alive()) return;
    prepareLayerRefresh(dossier);
    prepareWordingRefresh(dossier);
    // Une ouverture reprend seulement une analyse interrompue (page fermée, pause).
    // Après une panne ou un refus, la reprise attend le clic de l'agent : rouvrir un
    // dossier ne déclenche jamais de dépense qu'il n'a pas demandée.
    if (analysisRequired(dossier) && !dossier.analysis.lastError) void run();
    else { render(); void completeProvisionalVersion(); }
  } catch (error) {
    if (!alive()) return;
    container.innerHTML = `<div class="dz-empty"><h1>Le dossier n’a pas pu être ouvert.</h1><p>${esc(error.message)}</p><a class="adm-btn adm-btn--primary" href="/admin/diagnostic/">Revenir au diagnostic</a></div>`;
  }
}
