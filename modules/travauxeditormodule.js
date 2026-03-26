// modules/TravauxEditorModule.js
// Création et modification de chantiers (mode dessin + formulaire unifié)
const TravauxEditorModule = (() => {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const DEFAULT_ICON = 'fa-solid fa-helmet-safety';

  const MSG = {
    AUTH_REQUIRED: "Vous devez être connecté et admin de la ville.",
    DRAW_MISSING:  "Leaflet.Draw n'est pas chargé.",
    NOT_FOUND:     'Chantier introuvable',
    LOAD_ERROR:    'Erreur lors du chargement du chantier',
    NAME_REQUIRED: 'Le nom du chantier est obligatoire.',
    SAVE_OK:       'Chantier créé avec succès',
    UPDATE_OK:     'Chantier modifié avec succès',
    SAVE_ERR:      '❌ Erreur lors de la sauvegarde',
    UPDATE_ERR:    '❌ Erreur lors de la mise à jour',
    CANCEL_CREATE: 'Annuler la création ? Les géométries dessinées seront perdues.',
    CANCEL_EDIT:   'Annuler les modifications ?',
  };

  const ICON_PRESETS = [
    { icon: 'fa-solid fa-helmet-safety',        label: 'Casque' },
    { icon: 'fa-solid fa-road-barrier',          label: 'Barrière' },
    { icon: 'fa-solid fa-triangle-exclamation',  label: 'Attention' },
    { icon: 'fa-solid fa-hammer',                label: 'Marteau' },
    { icon: 'fa-solid fa-wrench',                label: 'Clé' },
    { icon: 'fa-solid fa-truck-pickup',          label: 'Camion' },
    { icon: 'fa-solid fa-trowel',                label: 'Truelle' },
    { icon: 'fa-solid fa-gears',                 label: 'Engrenages' },
    { icon: 'fa-solid fa-plug',                  label: 'Électricité' },
    { icon: 'fa-solid fa-droplet',               label: 'Eau' },
    { icon: 'fa-solid fa-fire-flame-simple',     label: 'Gaz' },
    { icon: 'fa-solid fa-tree',                  label: 'Espaces verts' },
  ];

  // ── Module state ───────────────────────────────────────────────────────────
  let drawnItems = null;
  let currentFeatures = [];
  let isDrawingMode = false;

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function _checkAuth() {
    try {
      const { data: { session } } = await window.supabaseService?.getClient()?.auth.getSession();
      if (!session?.user) return false;
      const role   = window.__CONTRIB_ROLE   || '';
      const villes = window.__CONTRIB_VILLES || [];
      const city   = window.getActiveCity?.() ?? window.activeCity;
      return role === 'admin' && (villes.includes('global') || villes.includes(city));
    } catch {
      return false;
    }
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────
  function _initDraw() {
    if (!window.L?.Control?.Draw) return false;
    try { delete L.Icon.Default.prototype._getIconUrl; } catch {}
    L.Icon.Default.mergeOptions({ iconRetinaUrl: '', iconUrl: '', shadowUrl: '' });
    if (!drawnItems) {
      drawnItems = new L.FeatureGroup();
      window.MapModule?.map.addLayer(drawnItems);
    }
    return true;
  }

  function _startDrawing() {
    if (isDrawingMode) return;
    isDrawingMode = true;
    currentFeatures = [];
    drawnItems.clearLayers();
    _attachDrawEvents();
    _showDrawPanel();
  }

  function _stopDrawing() {
    isDrawingMode = false;
    _detachDrawEvents();
    const panel = document.getElementById('travaux-drawing-panel');
    if (panel) {
      panel.style.display = 'none';
      panel.querySelectorAll('.travaux-draw-tool').forEach(b => b.classList.remove('active'));
    }
    document.getElementById('travaux-filters-ux')?.style.removeProperty('display');
  }

  function _attachDrawEvents() {
    const map = window.MapModule?.map;
    if (!map) return;
    map.on(L.Draw.Event.CREATED, _onDrawCreated);
    map.on(L.Draw.Event.EDITED,  _onDrawEdited);
    map.on(L.Draw.Event.DELETED, _onDrawEdited);
  }

  function _detachDrawEvents() {
    const map = window.MapModule?.map;
    if (!map) return;
    map.off(L.Draw.Event.CREATED, _onDrawCreated);
    map.off(L.Draw.Event.EDITED,  _onDrawEdited);
    map.off(L.Draw.Event.DELETED, _onDrawEdited);
  }

  function _onDrawCreated(e) {
    const layer = e.layer;
    if (layer instanceof L.Marker) {
      layer.setIcon(window.createCustomMarkerIcon(null, DEFAULT_ICON, 'var(--color-warning)'));
    }
    drawnItems.addLayer(layer);
    currentFeatures.push(layer.toGeoJSON());
    _syncDrawUI();
  }

  function _onDrawEdited() {
    currentFeatures = [];
    drawnItems.eachLayer(l => currentFeatures.push(l.toGeoJSON()));
    _syncDrawUI();
  }

  function _activateTool(type) {
    const map = window.MapModule?.map;
    if (!map || !drawnItems) return;
    let tool;
    if (type === 'polyline') {
      tool = new L.Draw.Polyline(map, { shapeOptions: { color: '#3388ff', weight: 4 } });
    } else if (type === 'polygon') {
      tool = new L.Draw.Polygon(map, { shapeOptions: { color: '#3388ff' } });
    } else if (type === 'marker') {
      const icon = window.createCustomMarkerIcon(null, DEFAULT_ICON, 'var(--color-warning)');
      tool = new L.Draw.Marker(map, { icon });
    }
    tool?.enable();
  }

  function _syncDrawUI() {
    const btn  = document.getElementById('travaux-finish-drawing');
    const help = document.querySelector('.travaux-drawing-help span');
    if (!btn) return;
    btn.disabled = currentFeatures.length === 0;
    if (help) {
      help.innerHTML = currentFeatures.length > 0
        ? `<strong>${currentFeatures.length}</strong> forme(s). Cliquez sur "Continuer".`
        : 'Dessinez sur la carte puis cliquez sur "Continuer".';
    }
  }

  function _showDrawPanel() {
    const panel = document.getElementById('travaux-drawing-panel');
    if (!panel) return; // optional nav-panel UI
    document.getElementById('travaux-filters-ux')?.style.setProperty('display', 'none');
    panel.style.display = 'block';

    panel.querySelectorAll('.travaux-draw-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.travaux-draw-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activateTool(btn.dataset.tool);
      });
    });

    panel.querySelector('#travaux-finish-drawing')?.addEventListener('click', _finishDrawing);
    panel.querySelector('#travaux-cancel-drawing')?.addEventListener('click', () => {
      if (confirm(MSG.CANCEL_CREATE)) {
        _stopDrawing();
        drawnItems.clearLayers();
        currentFeatures = [];
      }
    });
  }

  function _finishDrawing() {
    if (!currentFeatures.length) {
      window.ContribUtils?.showToast('Dessinez au moins une géométrie.', 'error');
      return;
    }
    _stopDrawing();
    _openFormModal(null);
  }

  // ── Icon selector (shared by create and edit modes) ────────────────────────
  function _initIconSelector(overlay, currentIcon) {
    const icon    = currentIcon || DEFAULT_ICON;
    const input   = overlay.querySelector('#tw-icon');
    const preview = overlay.querySelector('#tw-icon-preview');
    const presets = overlay.querySelector('#tw-icon-presets');
    const picker  = overlay.querySelector('#tw-picker-btn');
    if (!input || !preview || !presets) return;

    const set = (ic) => {
      input.value       = ic;
      preview.className = ic;
      presets.querySelectorAll('.tw-preset').forEach(b =>
        b.classList.toggle('tw-preset--active', b.dataset.icon === ic)
      );
    };

    presets.innerHTML = ICON_PRESETS.map(p =>
      `<button type="button" class="travaux-icon-preset tw-preset"` +
      ` data-icon="${p.icon}" title="${p.label}"><i class="${p.icon}"></i></button>`
    ).join('');

    presets.querySelectorAll('.tw-preset').forEach(b =>
      b.addEventListener('click', () => set(b.dataset.icon))
    );

    if (picker && window.GPIconPicker) {
      picker.addEventListener('click', () => window.GPIconPicker.open(input, set));
    }

    input.addEventListener('change', () => set(input.value));
    set(icon);
  }

  // ── Form modal (create + edit unified) ────────────────────────────────────
  function _buildFormHTML(chantier) {
    const edit = chantier != null;
    // Normalize: date fields may arrive as ISO timestamp "2024-01-15T00:00:00"
    const v = (key) => {
      if (!edit) return '';
      const raw = chantier[key];
      if (!raw) return '';
      if (key === 'date_debut' || key === 'date_fin') return String(raw).slice(0, 10);
      return raw;
    };
    const sel  = (val) => chantier?.etat === val ? 'selected' : '';
    const iconVal = v('icon') || DEFAULT_ICON;

    const editAlert = edit
      ? `<div class="form-alert form-alert--warning">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div><strong>Modification du tracé impossible</strong>
            <p>Pour modifier le tracé, supprimez ce chantier et recréez-en un.</p></div>
        </div>`
      : '';

    return `
      <div class="gp-modal gp-modal--large" role="document">
        <header class="gp-modal-header">
          <div class="modal-header-content">
            <div class="modal-icon"><i class="fa-solid ${edit ? 'fa-pen-to-square' : 'fa-helmet-safety'}"></i></div>
            <div><h1 class="gp-modal-title" id="travaux-form-title">
              ${edit ? 'Modifier le chantier' : 'Informations du chantier'}
            </h1></div>
          </div>
          <button class="btn-secondary gp-modal-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="gp-modal-body">
          ${editAlert}
          <form id="tw-form" class="travaux-form">

            <div class="form-section">
              <h3 class="form-section-title"><i class="fa-solid fa-circle-info"></i> Informations principales</h3>
              <div class="form-grid">
                <div class="form-field form-field--full">
                  <label for="tw-name" class="form-label">
                    <span class="label-text">Nom du chantier</span>
                    <span class="label-required">*</span>
                  </label>
                  <input type="text" id="tw-name" name="name" class="form-input" required
                    placeholder="Ex: Rénovation Rue de la République" value="${v('name')}">
                </div>
                <div class="form-field">
                  <label for="tw-nature" class="form-label"><span class="label-text">Nature des travaux</span></label>
                  <input type="text" id="tw-nature" name="nature" class="form-input"
                    placeholder="Ex: Réfection de chaussée" list="tw-nature-list" value="${v('nature')}">
                  <datalist id="tw-nature-list">
                    <option value="Réfection de chaussée">
                    <option value="Travaux de voirie">
                    <option value="Réseaux (eau, gaz, électricité)">
                    <option value="Aménagement urbain">
                    <option value="Construction">
                  </datalist>
                </div>
                <div class="form-field">
                  <label for="tw-etat" class="form-label"><span class="label-text">État</span></label>
                  <select id="tw-etat" name="etat" class="form-select">
                    <option value="" ${!chantier?.etat ? 'selected' : ''}>Non spécifié</option>
                    <option value="Prochain" ${sel('Prochain')}>🟡 Prochain</option>
                    <option value="Ouvert"   ${sel('Ouvert')}>🔴 En cours</option>
                    <option value="Terminé"  ${sel('Terminé')}>🟢 Terminé</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="form-section">
              <h3 class="form-section-title"><i class="fa-solid fa-icons"></i> Icône du marqueur</h3>
              <div class="form-field">
                <label class="form-label">
                  <span class="label-text">Choisissez une icône pour identifier ce chantier sur la carte</span>
                </label>
                <input type="hidden" id="tw-icon" name="icon" value="${iconVal}">
                <div class="travaux-icon-selector">
                  <div class="travaux-icon-preview">
                    <div class="gp-custom-marker" style="--marker-color: var(--color-warning);">
                      <i id="tw-icon-preview" class="${iconVal}"></i>
                    </div>
                    <span class="travaux-icon-preview-label">Aperçu</span>
                  </div>
                  <div class="travaux-icon-presets" id="tw-icon-presets"></div>
                  <button type="button" class="btn-secondary btn-small" id="tw-picker-btn">
                    <i class="fa-solid fa-ellipsis"></i> Plus d'icônes
                  </button>
                </div>
              </div>
            </div>

            <div class="form-section">
              <h3 class="form-section-title"><i class="fa-solid fa-calendar-days"></i> Période des travaux</h3>
              <div class="form-grid form-grid--2">
                <div class="form-field">
                  <label for="tw-debut" class="form-label"><span class="label-text">Date de début</span></label>
                  <input type="date" id="tw-debut" name="date_debut" class="form-input" value="${v('date_debut')}">
                </div>
                <div class="form-field">
                  <label for="tw-fin" class="form-label"><span class="label-text">Date de fin (prévue)</span></label>
                  <input type="date" id="tw-fin" name="date_fin" class="form-input" value="${v('date_fin')}">
                </div>
              </div>
            </div>

            <div class="form-section">
              <h3 class="form-section-title"><i class="fa-solid fa-location-dot"></i> Localisation et détails</h3>
              <div class="form-grid">
                <div class="form-field form-field--full">
                  <label for="tw-loc" class="form-label"><span class="label-text">Localisation</span></label>
                  <input type="text" id="tw-loc" name="localisation" class="form-input"
                    placeholder="Ex: Lyon 6e, Rue Victor Hugo" value="${v('localisation')}">
                </div>
                <div class="form-field form-field--full">
                  <label for="tw-desc" class="form-label">
                    <span class="label-text">Description</span>
                    <span class="label-hint">Impact, déviations éventuelles…</span>
                  </label>
                  <textarea id="tw-desc" name="description" class="form-textarea" rows="4"
                    placeholder="Impact, déviations...">${v('description')}</textarea>
                </div>
              </div>
            </div>

            <div id="tw-status" class="form-status" style="display:none"></div>

            <div class="form-actions">
              <button type="button" class="btn-secondary btn-large" id="tw-cancel">
                <i class="fa-solid fa-xmark"></i> <span>Annuler</span>
              </button>
              <button type="submit" class="btn-primary btn-large" id="tw-save">
                <i class="fa-solid fa-floppy-disk"></i>
                <span>${edit ? 'Enregistrer les modifications' : 'Enregistrer le chantier'}</span>
              </button>
            </div>

          </form>
        </div>
      </div>`;
  }

  function _openFormModal(chantier) {
    const edit      = chantier != null;
    const cancelMsg = edit ? MSG.CANCEL_EDIT : MSG.CANCEL_CREATE;

    document.getElementById('travaux-form-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id        = 'travaux-form-overlay';
    overlay.className = 'gp-modal-overlay gp-modal--glass';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'travaux-form-title');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = _buildFormHTML(chantier);
    document.body.appendChild(overlay);

    const dismiss = edit
      ? () => { if (confirm(cancelMsg)) _closeFormModal(); }
      : () => {
          if (confirm(cancelMsg)) {
            _closeFormModal();
            drawnItems?.clearLayers();
            currentFeatures = [];
          }
        };

    overlay.querySelector('#tw-cancel').addEventListener('click', dismiss);
    overlay.querySelector('.gp-modal-close').addEventListener('click', dismiss);
    overlay.querySelector('#tw-form').addEventListener('submit', e => _handleSubmit(e, chantier?.id ?? null));

    _initIconSelector(overlay, chantier?.icon ?? DEFAULT_ICON);

    window.ModalHelper?.open('travaux-form-overlay', {
      dismissible: false,
      onClose: () => overlay.querySelector('#tw-form')?.reset(),
    });
  }

  function _closeFormModal() {
    window.ModalHelper?.close('travaux-form-overlay');
  }

  // ── Status feedback ────────────────────────────────────────────────────────
  function _showStatus(message, type) {
    const el = document.getElementById('tw-status');
    if (!el) return;
    el.textContent   = message;
    el.className     = `form-status status--${type || 'info'}`;
    el.style.display = 'block';
  }

  // ── Submit handler (create + edit unified) ─────────────────────────────────
  async function _handleSubmit(e, chantierId) {
    e.preventDefault();
    const isEdit  = chantierId != null;
    const saveBtn = document.getElementById('tw-save');
    const saveLbl = isEdit ? 'Enregistrer les modifications' : 'Enregistrer le chantier';

    try {
      if (!isEdit && !currentFeatures.length) {
        _showStatus('Aucune géométrie trouvée.', 'error');
        return;
      }

      const fd   = new FormData(e.target);
      const name = (fd.get('name') || '').trim();
      if (!name) { _showStatus(MSG.NAME_REQUIRED, 'error'); return; }

      const data = {
        name,
        nature:       fd.get('nature')       || '',
        etat:         fd.get('etat')         || '',
        date_debut:   fd.get('date_debut')   || null,
        date_fin:     fd.get('date_fin')     || null,
        localisation: fd.get('localisation') || '',
        description:  fd.get('description')  || '',
        icon:         fd.get('icon')         || DEFAULT_ICON,
      };

      saveBtn.disabled  = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement&hellip;';
      _showStatus('Enregistrement en cours…', 'info');

      if (isEdit) {
        await window.supabaseService.updateCityTravaux(chantierId, data);
      } else {
        const city = window.getActiveCity?.() ?? window.activeCity;
        if (!city) throw new Error('Ville active non définie');
        const geojsonUrl = await window.supabaseService.uploadTravauxGeoJSON(city, {
          type: 'FeatureCollection', features: currentFeatures,
        });
        await window.supabaseService.createCityTravaux({
          ville: city, geojson_url: geojsonUrl, approved: true, ...data,
        });
        drawnItems.clearLayers();
        currentFeatures = [];
      }

      _closeFormModal();
      await window.DataModule?.reloadLayer?.('travaux');
      window.ContribUtils?.showToast(isEdit ? MSG.UPDATE_OK : MSG.SAVE_OK, 'success');

    } catch (err) {
      console.error('[TravauxEditor]', err);
      _showStatus(isEdit ? MSG.UPDATE_ERR : MSG.SAVE_ERR, 'error');
      saveBtn.disabled  = false;
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>${saveLbl}</span>`;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  /**
   * Ouvre l'éditeur en mode création (avec dessin sur carte).
   */
  async function openEditor() {
    if (!await _checkAuth()) {
      window.ContribUtils?.showToast(MSG.AUTH_REQUIRED, 'error');
      return;
    }
    if (!_initDraw()) {
      window.ContribUtils?.showToast(MSG.DRAW_MISSING, 'error');
      return;
    }
    _startDrawing();
  }

  /**
   * Ouvre l'éditeur en mode modification pour un chantier existant.
   * @param {string|number} chantierId  ID du chantier à modifier
   */
  async function openEditorForEdit(chantierId) {
    try {
      const chantier = await window.supabaseService.getCityTravauxById(chantierId);
      if (!chantier) { window.ContribUtils?.showToast(MSG.NOT_FOUND, 'error'); return; }
      if (!await _checkAuth()) { window.ContribUtils?.showToast(MSG.AUTH_REQUIRED, 'error'); return; }
      _openFormModal(chantier);
    } catch {
      window.ContribUtils?.showToast(MSG.LOAD_ERROR, 'error');
    }
  }

  window.TravauxEditorModule = { openEditor, openEditorForEdit };
  return window.TravauxEditorModule;
})();
