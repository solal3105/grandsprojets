/** Entrée du dossier web et historique des versions. Les anciens PDF restent lisibles. */
import * as api from '../../api.js';
import { store } from '../../store.js';
import { router } from '../../router.js';
import { esc, escAttr, toast, slidePanel, formatDate, confirm } from '../../components/ui.js';
import { dg } from './state.js';
import { renderZoneFigure } from './figure.js';
import { createDossier, dossierRow, number } from './dossier/model.js';
import { draftKey, writeDraft, removeDraft } from './dossier/drafts.js';
import { focusBounds } from './dossier/presentation.js';

let preparing = false;

export async function openReport(button) {
  if (!dg.selection || preparing) return;
  preparing = true;
  const selection = dg.selection;
  const original = button?.innerHTML;
  const city = store.city;
  const dossier = createDossier({ selection, layers: dg.layers, runtime: dg.runtime, city, brand: dg.branding?.brand_name });
  dossier.objective = dg.container?.querySelector('#dg-study-objective')?.value.trim() || '';
  const update = (text) => { if (button?.isConnected) { button.disabled = true; button.textContent = text; } };
  try {
    update('Préparation de la carte…');
    dossier.figures.cover = await renderZoneFigure(selection, { layerIds: [], size: [1000, 680], compact: true, asset: true });
    // Une figure dédiée par source de référence, sans empiler des phénomènes
    // qui n'ont ni les mêmes unités ni les mêmes périodes.
    const mapped = dossier.sources.filter((s) => s.count && s.kind === 'reference');
    for (let i = 0; i < mapped.length; i++) {
      if (dg.selection !== selection || store.city !== city) return;
      update(`Préparation des cartes (${i + 1}/${mapped.length})…`);
      const points = [...selection.features, ...selection.context].filter((f) => f.__layerId === mapped[i].id).flatMap((f) => f.__bbox ? [f.__bbox.slice(0, 2), f.__bbox.slice(2, 4)] : f.__pt ? [f.__pt] : []);
      dossier.figures[mapped[i].id] = await renderZoneFigure(selection, { layerIds: [mapped[i].id], focusBounds: focusBounds(points), size: [640, 430], compact: true, asset: true });
    }
    if (dg.selection !== selection || store.city !== city) return;
    update('Enregistrement du dossier…');
    const draftId = `draft-${dossier.familyId}`;
    const key = draftKey(store.user?.id, city, draftId);
    const durable = await writeDraft(key, dossier);
    let reportId = draftId;
    try {
      const { data, error } = await api.saveDiagnosticReport(dossierRow(dossier));
      if (error || !data?.id) throw error || new Error('Enregistrement indisponible');
      reportId = data.id;
      await removeDraft(key);
    } catch {
      toast(durable ? 'Le dossier est conservé sur cet appareil. Vous pourrez réessayer de l’enregistrer depuis sa page.' : 'Le dossier reste disponible dans cet onglet. Enregistrez une version avant de le fermer.', 'warning');
    }
    if (dg.selection !== selection || store.city !== city) return;
    router.navigate(`/admin/diagnostic/${reportId}/`);
  } catch (error) {
    console.warn('[diagnostic/dossier] Préparation:', error);
    toast('Le dossier n’a pas pu être préparé. Réessayez depuis la zone sélectionnée.', 'error');
  } finally {
    preparing = false;
    if (button?.isConnected) { button.disabled = false; button.innerHTML = original; }
  }
}

export async function openReportsHistory() {
  const panel = slidePanel.open({ title: 'Dossiers de zone', body: '<div class="adm-skeleton adm-skeleton--card"></div>' });
  const city = store.city;
  const reports = await api.getDiagnosticReports(60);
  if (city !== store.city || !panel.content?.isConnected) return;
  const body = panel.content.querySelector('.adm-slide-panel__body');
  if (!reports.length) {
    body.innerHTML = '<div class="adm-empty"><div class="adm-empty__title">Aucun dossier enregistré</div><p class="adm-empty__text">Sélectionnez une zone sur la carte, puis ouvrez son dossier pour préparer votre analyse.</p></div>';
    return;
  }
  body.innerHTML = `<div class="dg-history">${reports.map((r) => `<div class="dg-history__row" data-id="${escAttr(r.id)}">
    <span class="dg-history__count">${number(r.stats?.sourceCount || 0, 0)}<small>sources</small></span>
    <span class="dg-history__txt"><span class="dg-history__title">${esc(r.title || 'Dossier de zone')}</span><span class="dg-history__meta">${esc(formatDate(r.created_at))}${r.stats?.revision ? ` · Version ${Number(r.stats.revision) || 1}` : ' · Ancien rapport'}</span></span>
    <button type="button" class="adm-btn adm-btn--secondary" data-open="${escAttr(r.id)}">Ouvrir</button>
    <button type="button" class="dg-row__act" data-delete="${escAttr(r.id)}" aria-label="Supprimer cette version"><i class="fa-solid fa-trash-can"></i></button>
  </div>`).join('')}</div>`;
  body.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => {
    panel.close(); router.navigate(`/admin/diagnostic/${button.dataset.open}/`);
  }));
  body.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!await confirm({ title: 'Supprimer cette version', message: 'Cette version du dossier sera supprimée. Les autres versions resteront disponibles.', confirmLabel: 'Supprimer la version', danger: true })) return;
    if (city !== store.city || !button.isConnected) return;
    const { success } = await api.deleteDiagnosticReport(button.dataset.delete);
    if (success) button.closest('.dg-history__row').remove();
    else toast('La version n’a pas pu être supprimée. Réessayez.', 'error');
  }));
}
