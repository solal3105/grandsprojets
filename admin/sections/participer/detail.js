/* ============================================================================
   ADMIN Participer - détail d'un signalement (panneau latéral)

   Photo (URL signée tant que non publiée), mini-carte, historique complet,
   changement de statut avec message public, et actions de modération.
   Répartition des droits (revérifiée côté serveur par /api/participer/update) :
     - contributeur : changer le statut (sauf rejet)
     - admin        : tout (publier, dépublier, rejeter, supprimer)
   ============================================================================ */

import { store } from '../../store.js';
import * as api from '../../api.js';
import { esc, toast, confirm, slidePanel, formatDate } from '../../components/ui.js';
import { createMiniMap } from '../../components/minimap.js';
import { statutPill, categoryChip, stOf, catOf, safeColor } from './data.js';

const EVENT_LABELS = {
  creation: 'Signalement déposé',
  publication: 'Publié sur la carte',
  depublication: 'Retiré de la carte',
  suppression: 'Signalement supprimé',
  retrait_demande: 'Demande de retrait reçue',
  anonymisation: 'Données personnelles effacées',
};

// La checklist opposable avant toute publication : c'est la commune qui édite
const CHECKLIST_PUBLICATION = 'Avant de publier, vérifiez : aucun visage ni plaque '
  + 'd\'immatriculation lisible sur la photo, aucune donnée personnelle ni propos '
  + 'visant une personne identifiable dans le texte. Le contenu publié engage la collectivité.';

export function openDetail(row, ref, { onChange } = {}) {
  let mini = null;
  let closed = false;

  const handle = slidePanel.open({
    title: row.reference,
    body: _bodyHtml(row, ref),
    onClose: () => {
      closed = true;
      try { mini?.destroy?.(); } catch { /* carte déjà détruite */ }
    },
  });
  if (!handle) return;
  const { content } = handle;

  _loadPhoto(content, row);
  _loadEvents(content, row, ref);
  /* La carte est instanciée tout de suite mais la promesse ne se résout qu'au
     chargement du fond : refermer avant laisserait un contexte WebGL vivant, et
     le navigateur en recycle après une quinzaine. */
  _loadMiniMap(content, row, ref).then((m) => {
    if (closed) { try { m?.destroy?.(); } catch { /* déjà détruite */ } }
    else mini = m;
  });
  _bindActions(content, row, ref, { onChange, close: handle.close });
}

/* ── Corps du panneau ── */

function _bodyHtml(row, ref) {
  const st = stOf(ref, row.statut_key);
  /* Le rejet est réservé aux admins, mais un contributeur doit voir le statut
     courant d'un signalement déjà rejeté : sans cette exception, le select
     retomberait sur « Reçu » et un clic sur Appliquer rouvrirait le dossier. */
  const statutOptions = ref.statuts
    .filter((s) => store.isAdmin || s.statut_key !== 'rejete' || s.statut_key === row.statut_key)
    .map((s) => `<option value="${esc(s.statut_key)}" ${s.statut_key === row.statut_key ? 'selected' : ''}>${esc(s.label)}</option>`)
    .join('');

  return `
    <div class="ptadm-detail">
      <div class="ptadm-detail__pills">
        ${categoryChip(ref, row.category_key)}
        ${statutPill(ref, row.statut_key)}
        <span class="adm-badge ${row.published ? 'adm-badge--success' : 'adm-badge--neutral'}">${row.published ? 'Publié' : 'Non publié'}</span>
      </div>

      <div class="ptadm-detail__meta">
        Déposé le ${esc(formatDate(row.created_at))}
        ${row.closed_at ? ` · clos le ${esc(formatDate(row.closed_at))}` : ''}
        ${row.anonymized_at ? ' · anonymisé' : ''}
      </div>

      ${row.description ? `<p class="ptadm-detail__desc">${esc(row.description)}</p>` : '<p class="ptadm-detail__desc ptadm-detail__desc--empty">Aucune description.</p>'}

      <div class="ptadm-detail__photo" id="ptadm-photo" hidden>
        <img alt="Photo du signalement">
      </div>

      ${row.adresse ? `<div class="ptadm-detail__addr"><i class="fa-solid fa-location-dot"></i> ${esc(row.adresse)}</div>` : ''}
      <div class="ptadm-detail__map" id="ptadm-map"></div>

      <div class="ptadm-detail__events" id="ptadm-events">
        <div class="ptadm-detail__label"><i class="fa-solid fa-timeline"></i> Historique</div>
        <div class="adm-skeleton adm-skeleton--card"></div>
      </div>

      <div class="ptadm-detail__actions">
        <div class="ptadm-detail__label"><i class="fa-solid fa-arrow-right-arrow-left"></i> Changer le statut</div>
        <select class="adm-input" id="ptadm-statut">${statutOptions}</select>
        <textarea class="adm-input" id="ptadm-message" rows="2" maxlength="1000"
          placeholder="Message public pour l'habitant (envoyé par email${st?.notify === false ? ' si le statut le prévoit' : ''}, visible sur la page de suivi)"></textarea>
        <button class="adm-btn adm-btn--primary" id="ptadm-apply"><i class="fa-solid fa-check"></i> Appliquer</button>
      </div>

      ${store.isAdmin ? `
      <div class="ptadm-detail__admin">
        <div class="ptadm-detail__label"><i class="fa-solid fa-shield-halved"></i> Modération</div>
        <div class="ptadm-detail__admin-btns">
          ${row.published
            ? '<button class="adm-btn adm-btn--secondary" id="ptadm-unpublish"><i class="fa-solid fa-eye-slash"></i> Dépublier</button>'
            : '<button class="adm-btn adm-btn--primary" id="ptadm-publish"><i class="fa-solid fa-eye"></i> Publier sur la carte</button>'}
          <button class="adm-btn adm-btn--danger" id="ptadm-delete"><i class="fa-solid fa-trash"></i> Supprimer</button>
        </div>
      </div>` : ''}
    </div>`;
}

/* ── Chargements asynchrones ── */

async function _loadPhoto(content, row) {
  if (!row.photo_path && !row.photo_url) return;
  const box = content.querySelector('#ptadm-photo');
  if (!box) return;
  try {
    let url = row.photo_url;
    if (!url) {
      // Photo non publiée : URL signée courte sur le bucket privé
      const res = await api.participerAction('photo_url', row.id);
      url = res.url;
    }
    if (url) {
      box.querySelector('img').src = url;
      box.hidden = false;
    }
  } catch (e) {
    console.debug('[admin/participer] photo indisponible:', e?.message);
  }
}

async function _loadEvents(content, row, ref) {
  const box = content.querySelector('#ptadm-events');
  if (!box) return;
  try {
    const events = await api.getParticiperEvents(row.id);
    const items = events.map((ev) => {
      const label = ev.type === 'statut'
        ? (stOf(ref, ev.new_statut)?.label || ev.new_statut)
        : (EVENT_LABELS[ev.type] || ev.type);
      return `
        <div class="ptadm-event ${ev.type === 'retrait_demande' ? 'ptadm-event--alert' : ''}">
          <span class="ptadm-event__dot"></span>
          <div class="ptadm-event__body">
            <div class="ptadm-event__title">${esc(label)}<span class="ptadm-event__date">${esc(formatDate(ev.created_at))}</span></div>
            ${ev.message_public ? `<div class="ptadm-event__msg">${esc(ev.message_public)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    box.innerHTML = `<div class="ptadm-detail__label"><i class="fa-solid fa-timeline"></i> Historique</div>${items || '<div class="ptadm-detail__meta">Aucun événement.</div>'}`;
  } catch {
    box.innerHTML = '';
  }
}

async function _loadMiniMap(content, row, ref) {
  const box = content.querySelector('#ptadm-map');
  if (!box || row.lat == null || row.lng == null) return null;
  try {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    return await createMiniMap({
      container: box,
      center: [row.lng, row.lat],
      zoom: 16,
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [row.lng, row.lat] }, properties: {} }],
      },
      fallbackColor: safeColor(catOf(ref, row.category_key)?.color),
      theme,
      pitch: 0,
      bearing: 0,
    });
  } catch (e) {
    // WebGL indisponible (headless...) : le détail reste pleinement utilisable
    console.debug('[admin/participer] mini-carte indisponible:', e?.message);
    box.hidden = true;
    return null;
  }
}

/* ── Actions ── */

function _bindActions(content, row, ref, { onChange, close }) {
  const refresh = (updated) => {
    onChange?.();
    close();
    if (updated) openDetail(updated, ref, { onChange });
  };

  content.querySelector('#ptadm-apply')?.addEventListener('click', async () => {
    const statutKey = content.querySelector('#ptadm-statut')?.value;
    const message = content.querySelector('#ptadm-message')?.value.trim() || null;
    if (statutKey === 'rejete' && !message) {
      toast('Un motif est obligatoire pour un rejet', 'warning');
      return;
    }
    try {
      const res = await api.participerAction('set_statut', row.id, { statut_key: statutKey, message_public: message });
      // Le serveur seul sait si le message est réellement parti (adresse
      // confirmée, statut notifiant, anonymisation déjà passée)
      toast(`Statut appliqué${res.notifie ? ' - l\'habitant est prévenu par email' : ''}`, 'success');
      refresh(res.signalement);
    } catch (e) {
      toast(e.message || 'Opération impossible', 'error');
    }
  });

  content.querySelector('#ptadm-publish')?.addEventListener('click', async () => {
    const ok = await confirm({
      title: 'Publier ce signalement ?',
      message: CHECKLIST_PUBLICATION,
      confirmLabel: 'Publier',
    });
    if (!ok) return;
    try {
      const res = await api.participerAction('publish', row.id);
      toast('Signalement publié sur la carte', 'success');
      refresh(res.signalement);
    } catch (e) {
      toast(e.message || 'Publication impossible', 'error');
    }
  });

  content.querySelector('#ptadm-unpublish')?.addEventListener('click', async () => {
    try {
      const res = await api.participerAction('unpublish', row.id);
      toast('Signalement retiré de la carte', 'success');
      refresh(res.signalement);
    } catch (e) {
      toast(e.message || 'Opération impossible', 'error');
    }
  });

  content.querySelector('#ptadm-delete')?.addEventListener('click', async () => {
    const ok = await confirm({
      title: 'Supprimer définitivement ?',
      message: `Le signalement ${row.reference}, sa photo et son historique seront effacés. L'habitant n'en sera pas informé.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.participerAction('delete', row.id);
      toast('Signalement supprimé', 'success');
      onChange?.();
      close();
    } catch (e) {
      toast(e.message || 'Suppression impossible', 'error');
    }
  });
}
