// modules/contrib.js
;(function (win) {
  function setupContrib() {
    const contribToggle   = document.getElementById('nav-contribute');
    const contribOverlay  = document.getElementById('contrib-overlay');
    const contribCloseBtn = document.getElementById('contrib-close');
    const contribModal    = contribOverlay ? contribOverlay.querySelector('.gp-modal') : null;

    let contribLastFocus  = null;
    let contribCloseTimer = null;

    // Drawing state for geometry input (modale contribution)
    let drawMap = null;
    let drawLayer = null;      // finalized geometry layer (L.Layer, e.g., L.Polyline or L.Polygon)
    let drawLayerDirty = false; // whether current drawLayer was created/modified by user during this session
    // Manual draw state (fallback when Geoman is not used)
    let manualDraw = { active: false, type: null, points: [], tempLayer: null };
    // Basemap + city branding state for draw map
    let drawBaseLayer = null;
    let basemapsCache = null;

    const closeContrib = () => {
      if (!contribOverlay) return;
      if (contribCloseTimer) { clearTimeout(contribCloseTimer); contribCloseTimer = null; }
      if (contribModal) contribModal.classList.remove('is-open');
      contribOverlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', contribEscHandler);
      document.body.style.overflow = '';
      contribCloseTimer = setTimeout(() => {
        contribOverlay.style.display = 'none';
        if (contribLastFocus && typeof contribLastFocus.focus === 'function') {
          try { contribLastFocus.focus(); } catch (_) {}
        }
      }, 180);
    };

    const openContrib = () => {
      if (!contribOverlay) return;
      if (contribCloseTimer) { clearTimeout(contribCloseTimer); contribCloseTimer = null; }
      contribLastFocus = document.activeElement;
      contribOverlay.style.display = 'flex';
      contribOverlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => { if (contribModal) contribModal.classList.add('is-open'); });
      // Focus sur le bouton fermer pour l’accessibilité
      if (contribCloseBtn && typeof contribCloseBtn.focus === 'function') {
        try { contribCloseBtn.focus(); } catch (_) {}
      }
      document.addEventListener('keydown', contribEscHandler);
      // Assurer le bon rendu de la carte de dessin si visible
      setTimeout(() => {
        try { if (drawMap) drawMap.invalidateSize(); } catch (_) {}
      }, 200);
      // Afficher l'écran d'accueil lors de la première ouverture de la session
      try {
        const seen = sessionStorage.getItem('contribLandingSeen') === '1';
        if (!seen) {
          showLanding();
        } else {
          // Initialiser par défaut sur l'onglet Créer et l'étape 1
          try { activateTab('create'); } catch(_) {}
          try { setStep(1, { force: true }); } catch(_) {}
        }
      } catch(_) {}
    };

    const contribEscHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeContrib();
      }
    };

    if (contribToggle) {
      contribToggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
          if (session && session.user) {
            openContrib();
          }
        } catch (_) {
          // En cas d'erreur de session, on redirige vers la connexion
          win.location.href = '/login/';
        }
      });
    }

    if (contribCloseBtn) {
      contribCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContrib();
      });
    }

    if (contribOverlay) {
      // Empêcher la fermeture lors d'un glisser-sélection depuis la modale vers l'extérieur
      let overlayMouseDownOnSelf = false;
      contribOverlay.addEventListener('mousedown', (e) => {
        overlayMouseDownOnSelf = (e.target === contribOverlay);
      });
      contribOverlay.addEventListener('mouseup', (e) => {
        if (overlayMouseDownOnSelf && e.target === contribOverlay) {
          closeContrib();
        }
        overlayMouseDownOnSelf = false;
      });
    }

    // —— Minimal contribution form wiring ——
    const form = document.getElementById('contrib-form');
    const statusEl = document.getElementById('contrib-status');
    const cityEl = document.getElementById('contrib-city');
    const addDocBtn = document.getElementById('contrib-doc-add');
    const docsFieldset = document.getElementById('contrib-docs');
    const existingDocsEl = document.getElementById('contrib-existing-docs');

    // Geometry input UI elements
    const geomModeFieldset = document.getElementById('contrib-geom-mode');
    const geomModeRadios = geomModeFieldset ? geomModeFieldset.querySelectorAll('input[name="contrib-geom-mode"]') : [];
    const fileRowEl = document.getElementById('contrib-file-row');
    const drawPanelEl = document.getElementById('contrib-draw-panel');
    const dropzoneEl = document.getElementById('contrib-dropzone');
    const dzFilenameEl = document.getElementById('contrib-dz-filename');
    const geomCardFile = document.getElementById('geom-card-file');
    const geomCardDraw = document.getElementById('geom-card-draw');
    const drawMapContainerId = 'contrib-draw-map';
    // Geoman removed: manual drawing only

    function onMapClick(e) {
      if (!manualDraw.active || !drawMap) return;
      try {
        manualDraw.points.push(e.latlng);
        updateTempShape();
        updateManualButtons();
      } catch(_) {}
    }

    function clearGuide() {
      try {
        if (manualDraw && manualDraw.guideLayer && drawMap) {
          drawMap.removeLayer(manualDraw.guideLayer);
        }
      } catch(_) {}
      if (manualDraw) manualDraw.guideLayer = null;
    }

    function onMapMouseMove(e) {
      // Show a dashed guide only in line mode with at least one point
      if (!drawMap || !manualDraw.active || manualDraw.type !== 'line' || manualDraw.points.length === 0) {
        clearGuide();
        return;
      }
      const last = manualDraw.points[manualDraw.points.length - 1];
      if (!last) { clearGuide(); return; }
      const coords = [last, e.latlng];
      // Replace previous guide with a dashed preview segment
      clearGuide();
      try {
        manualDraw.guideLayer = L.polyline(coords, {
          color: '#1976d2',
          weight: 2,
          opacity: 0.7,
          dashArray: '6,6'
        }).addTo(drawMap);
      } catch(_) {}
    }

    function ensureManualToolbar() {
      if (!drawPanelEl) return;
      let toolbar = drawPanelEl.querySelector('#contrib-manual-draw-controls');
      // If toolbar already exists, ensure it is visible again
      if (toolbar) {
        try { toolbar.style.display = ''; } catch(_) {}
        updateManualButtons();
        return;
      }
      toolbar = document.createElement('div');
      toolbar.id = 'contrib-manual-draw-controls';
      toolbar.className = 'draw-controls';
      toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0 8px;flex-wrap:wrap;';
      toolbar.innerHTML = `
        <button type="button" class="gp-btn" id="btn-draw-line" title="Tracer une ligne"><i class="fa-solid fa-route" aria-hidden="true"></i> Ligne</button>
        <button type="button" class="gp-btn" id="btn-draw-poly" title="Tracer un polygone"><i class="fa-solid fa-draw-polygon" aria-hidden="true"></i> Polygone</button>
        <span style="width:1px;height:24px;background:rgba(0,0,0,0.08);"></span>
        <button type="button" class="gp-btn" id="btn-undo-point" title="Annuler le dernier point"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Annuler point</button>
        <button type="button" class="gp-btn" id="btn-finish" title="Terminer le tracé"><i class="fa-solid fa-check" aria-hidden="true"></i> Terminer</button>
        <button type="button" class="gp-btn" id="btn-clear-geom" title="Effacer la géométrie"><i class="fa-solid fa-trash" aria-hidden="true"></i> Effacer</button>
        <button type="button" class="gp-btn" id="btn-restart" title="Recommencer"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Recommencer</button>
      `;
      const helper = drawPanelEl.querySelector('.helper');
      if (helper) helper.after(toolbar); else drawPanelEl.prepend(toolbar);
      // Bind actions
      toolbar.querySelector('#btn-draw-line')?.addEventListener('click', () => startManualDraw('line'));
      toolbar.querySelector('#btn-draw-poly')?.addEventListener('click', () => startManualDraw('polygon'));
      toolbar.querySelector('#btn-undo-point')?.addEventListener('click', () => undoManualPoint());
      toolbar.querySelector('#btn-finish')?.addEventListener('click', () => finishManualDraw());
      toolbar.querySelector('#btn-clear-geom')?.addEventListener('click', () => clearManualGeometry());
      toolbar.querySelector('#btn-restart')?.addEventListener('click', () => clearManualGeometry());
      updateManualButtons();
    }

    function updateManualButtons() {
      const toolbar = drawPanelEl?.querySelector('#contrib-manual-draw-controls');
      if (!toolbar) return;
      const hasPoints = manualDraw.points.length > 0;
      const active = manualDraw.active === true;
      const btnLine = toolbar.querySelector('#btn-draw-line');
      const btnPoly = toolbar.querySelector('#btn-draw-poly');
      const btnUndo = toolbar.querySelector('#btn-undo-point');
      const btnFinish = toolbar.querySelector('#btn-finish');
      const btnClear = toolbar.querySelector('#btn-clear-geom');
      const btnRestart = toolbar.querySelector('#btn-restart');

      // Logic of visibility
      const hasFinal = !!drawLayer; // a finalized geometry exists
      const showChoice = (!active && !hasPoints && !hasFinal) || (active && !hasPoints); // show Line/Polygon until first point is placed
      if (btnLine) btnLine.style.display = showChoice ? '' : 'none';
      if (btnPoly) btnPoly.style.display = showChoice ? '' : 'none';

      const showEdit = active && hasPoints; // after first point, show only undo/finish/clear
      if (btnUndo) btnUndo.style.display = showEdit ? '' : 'none';
      if (btnFinish) btnFinish.style.display = showEdit ? '' : 'none';
      if (btnClear) btnClear.style.display = showEdit ? '' : 'none';

      const showRestart = (!active && hasFinal);
      if (btnRestart) btnRestart.style.display = showRestart ? '' : 'none';

      // Enabled state
      if (btnUndo) btnUndo.disabled = !(active && hasPoints);
      if (btnFinish) btnFinish.disabled = !(active && (manualDraw.type === 'line' ? manualDraw.points.length >= 2 : manualDraw.points.length >= 3));
    }

    function startManualDraw(type) {
      try { if (!drawMap) initDrawMap(); } catch(_) {}
      if (!drawMap) return;
      // Reset current temp
      clearManualTemp();
      manualDraw.active = true;
      manualDraw.type = type === 'polygon' ? 'polygon' : 'line';
      manualDraw.points = [];
      try { drawMap.doubleClickZoom.disable(); } catch(_) {}
      setStatus(`Mode ${manualDraw.type === 'line' ? 'ligne' : 'polygone'}: cliquez sur la carte pour ajouter des points. Terminez avec "Terminer".`);
      updateManualButtons();
    }

    function updateTempShape() {
      if (!drawMap) return;
      // Remove previous temp layer
      if (manualDraw.tempLayer) { try { drawMap.removeLayer(manualDraw.tempLayer); } catch(_) {}
        manualDraw.tempLayer = null; }
      if (!manualDraw.points.length) return;
      const style = { color: '#1976d2', weight: 3, fillOpacity: 0.2 };
      if (manualDraw.type === 'polygon') {
        manualDraw.tempLayer = L.polygon(manualDraw.points, style).addTo(drawMap);
      } else {
        manualDraw.tempLayer = L.polyline(manualDraw.points, style).addTo(drawMap);
      }
    }

    function undoManualPoint() {
      if (!manualDraw.active || manualDraw.points.length === 0) return;
      manualDraw.points.pop();
      updateTempShape();
      updateManualButtons();
    }

    function finishManualDraw() {
      if (!manualDraw.active) return;
      const minPts = manualDraw.type === 'line' ? 2 : 3;
      if (manualDraw.points.length < minPts) {
        setStatus(`Ajoutez au moins ${minPts} points avant de terminer.`, 'error');
        return;
      }
      // Remove existing finalized layer
      if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
      // Finalized style: change color to confirm state
      const style = manualDraw.type === 'polygon'
        ? { color: '#2e7d32', weight: 3, fillOpacity: 0.25, fillColor: '#2e7d32' }
        : { color: '#2e7d32', weight: 3, opacity: 0.9 };
      if (manualDraw.type === 'polygon') {
        drawLayer = L.polygon(manualDraw.points, style).addTo(drawMap);
      } else {
        drawLayer = L.polyline(manualDraw.points, style).addTo(drawMap);
      }
      try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_) {}
      drawLayerDirty = true;
      setStatus('Géométrie finalisée. Cliquez sur Recommencer si vous souhaitez refaire.');
      cancelManualDraw(true);
      updateManualButtons();
    }

    function cancelManualDraw(keepStatus = false) {
      manualDraw.active = false;
      manualDraw.type = null;
      manualDraw.points = [];
      clearManualTemp();
      clearGuide();
      try { drawMap.doubleClickZoom.enable(); } catch(_) {}
      if (!keepStatus) setStatus('Mode dessin manuel désactivé.');
      updateManualButtons();
    }

    function clearManualTemp() {
      if (manualDraw.tempLayer) { try { drawMap.removeLayer(manualDraw.tempLayer); } catch(_) {} manualDraw.tempLayer = null; }
    }

    function clearManualGeometry() {
      // Clear both temp and finalized layers, and return to initial choice state
      clearManualTemp();
      if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
      drawLayerDirty = false;
      cancelManualDraw(true); // resets active/type/points
      setStatus('Géométrie effacée. Choisissez Ligne ou Polygone.');
      updateManualButtons();
    }
    
    // —— Basemap and city helpers for the draw map ——
    function pickDefaultBasemap(list) {
      if (!Array.isArray(list) || !list.length) return null;
      return list.find(b => b && (b.default === true || b.is_default === true)) || list[0];
    }
    
    async function ensureBasemaps() {
      if (Array.isArray(basemapsCache) && basemapsCache.length) return basemapsCache;
      let res = [];
      try {
        if (win.supabaseService && typeof win.supabaseService.fetchBasemaps === 'function') {
          res = await win.supabaseService.fetchBasemaps();
        }
      } catch (e) {
        console.warn('[contrib] ensureBasemaps fetchBasemaps error:', e);
      }
      if (!Array.isArray(res) || !res.length) {
        res = Array.isArray(win.basemaps) ? win.basemaps : [];
      }
      basemapsCache = res;
      return res;
    }
    
    function setDrawBaseLayer(bm) {
      if (!drawMap) return;
      try { if (drawBaseLayer) drawMap.removeLayer(drawBaseLayer); } catch(_) {}
      drawBaseLayer = null;
      const url = bm && bm.url ? bm.url : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const attribution = (bm && bm.attribution) || '&copy; OpenStreetMap contributors';
      try { drawBaseLayer = L.tileLayer(url, { attribution }).addTo(drawMap); } catch (e) { console.warn('[contrib] setDrawBaseLayer error:', e); }
    }
    
    function buildContribBasemapMenu(basemaps, activeBm) {
      try {
        if (!drawPanelEl || !Array.isArray(basemaps) || !basemaps.length) return;
        let menu = drawPanelEl.querySelector('#contrib-basemap-menu');
        if (menu) { try { menu.remove(); } catch(_) {} }
        menu = document.createElement('div');
        menu.id = 'contrib-basemap-menu';
        menu.setAttribute('role', 'group');
        menu.setAttribute('aria-label', 'Fond de carte');
        menu.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;';
        basemaps.forEach((bm) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'gp-btn basemap-tile';
          btn.textContent = bm.label || bm.name || 'Fond';
          btn.style.cssText = 'padding:4px 8px;border-radius:8px;border:1px solid rgba(0,0,0,0.2);background:#fff;cursor:pointer;font-size:12px;';
          const isActive = activeBm && ((activeBm.label && bm.label === activeBm.label) || (activeBm.url && bm.url === activeBm.url));
          if (isActive) { btn.style.background = '#e3f2fd'; btn.setAttribute('aria-pressed', 'true'); }
          btn.addEventListener('click', () => {
            setDrawBaseLayer(bm);
            try { menu.querySelectorAll('button').forEach(b => { b.style.background = '#fff'; b.removeAttribute('aria-pressed'); }); } catch(_) {}
            btn.style.background = '#e3f2fd';
            btn.setAttribute('aria-pressed', 'true');
          });
          menu.appendChild(btn);
        });
        const helper = drawPanelEl.querySelector('.helper');
        if (helper) helper.after(menu); else drawPanelEl.prepend(menu);
      } catch (e) {
        console.warn('[contrib] buildContribBasemapMenu error:', e);
      }
    }
    
    async function applyCityBranding(ville) {
      try {
        if (!drawMap || !ville || !win.supabaseService || typeof win.supabaseService.getCityBranding !== 'function') return;
        const branding = await win.supabaseService.getCityBranding(ville);
        if (!branding) return;
        // Accept multiple shapes: {center_lat, center_lng, zoom} OR {center:[lat,lng], zoom}
        let lat = null, lng = null, zoom = 12;
        if (typeof branding.zoom === 'number') zoom = branding.zoom;
        if (Array.isArray(branding.center) && branding.center.length >= 2) {
          lat = Number(branding.center[0]);
          lng = Number(branding.center[1]);
        } else if ('center_lat' in branding || 'lat' in branding) {
          lat = Number(branding.center_lat ?? branding.lat);
          lng = Number(branding.center_lng ?? branding.lng);
        }
        if (isFinite(lat) && isFinite(lng)) {
          try { drawMap.setView([lat, lng], zoom || drawMap.getZoom()); } catch(_) {}
        }
      } catch (e) {
        console.warn('[contrib] applyCityBranding error:', e);
      }
    }

    // Stepper UI elements
    const stepperEl = document.getElementById('contrib-stepper');
    const stepTab1 = document.getElementById('contrib-step-1-tab');
    const stepTab2 = document.getElementById('contrib-step-2-tab');
    const stepTab3 = document.getElementById('contrib-step-3-tab');
    const prevBtn  = document.getElementById('contrib-prev');
    const nextBtn  = document.getElementById('contrib-next');
    const submitBtn = document.getElementById('contrib-submit');

    let currentStep = 1; // 1..3

    function queryStepEls(n) {
      return Array.from(document.querySelectorAll(`.contrib-step-${n}`));
    }

    function setStepHeaderActive(n) {
      const tabs = [stepTab1, stepTab2, stepTab3];
      tabs.forEach((t, idx) => {
        if (!t) return;
        const stepIndex = idx + 1;
        const isActive = stepIndex === n;
        const isComplete = stepIndex < n;
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        t.tabIndex = isActive ? 0 : -1;
        try {
          t.classList.toggle('is-current', isActive);
          t.classList.toggle('is-complete', isComplete);
        } catch(_) {}
      });
    }

    function updateStepButtons(n) {
      if (prevBtn) prevBtn.style.display = (n > 1) ? '' : 'none';
      if (nextBtn) nextBtn.style.display = (n < 3) ? '' : 'none';
      if (submitBtn) submitBtn.style.display = (n === 3) ? '' : 'none';
    }

    function showOnlyStep(n) {
      [1,2,3].forEach(i => {
        queryStepEls(i).forEach(el => { el.style.display = (i === n) ? '' : 'none'; });
      });
    }

    function validateStep1() {
      const nameEl = document.getElementById('contrib-project-name');
      const catEl  = document.getElementById('contrib-category');
      const cityElSel = document.getElementById('contrib-city');
      const ok = !!(nameEl && nameEl.value && nameEl.value.trim()) && !!(catEl && catEl.value) && !!(cityElSel && cityElSel.value);
      if (!ok) setStatus('Veuillez renseigner nom, catégorie et ville.', 'error');
      else setStatus('');
      return ok;
    }

    function hasDrawGeometry() {
      // Consider a geometry present if drawLayer exists or user created/loaded one
      return !!(drawLayer) || !!drawLayerDirty;
    }

    function validateStep2() {
      const mode = Array.from(geomModeRadios || []).find(r => r.checked)?.value || 'file';
      if (mode === 'file') {
        const fileInput = document.getElementById('contrib-geojson');
        const ok = !!(fileInput && fileInput.files && fileInput.files.length > 0);
        if (!ok) setStatus('Veuillez sélectionner un fichier GeoJSON.', 'error'); else setStatus('');
        return ok;
      }
      // draw mode
      const ok = hasDrawGeometry();
      if (!ok) setStatus('Veuillez dessiner une géométrie puis terminer.', 'error'); else setStatus('');
      return ok;
    }

    function canGoToStep(target) {
      if (target <= 1) return true;
      if (target === 2) return validateStep1();
      if (target === 3) return validateStep1() && validateStep2();
      return false;
    }

    function setStep(n, opts = {}) {
      const { force = false } = opts || {};
      if (!force && !canGoToStep(n)) return;
      currentStep = Math.min(3, Math.max(1, n));
      showOnlyStep(currentStep);
      setStepHeaderActive(currentStep);
      updateStepButtons(currentStep);

      // Met à jour uniquement l'état visuel du stepper (classes)
      // La barre de progression dédiée a été retirée pour privilégier le stepper existant

      // Assurer l'initialisation de la carte et des contrôles de dessin dès l'entrée en étape 2
      if (currentStep === 2) {
        try {
          const mode = Array.from(geomModeRadios || []).find(r => r.checked)?.value || 'file';
          if (mode === 'draw') {
            if (drawPanelEl) drawPanelEl.style.display = '';
            if (fileRowEl) fileRowEl.style.display = 'none';
            initDrawMap();
            setTimeout(() => { try { if (drawMap) drawMap.invalidateSize(); } catch(_){} }, 50);
            // Manual drawing only
            ensureManualToolbar();
            cancelManualDraw(true);
            setStatus('Mode dessin manuel actif. Choisissez Ligne ou Polygone puis cliquez sur la carte.');
          } else {
            // Mode fichier: masquer le panneau de dessin et afficher le champ fichier
            if (drawPanelEl) drawPanelEl.style.display = 'none';
            if (fileRowEl) fileRowEl.style.display = '';
          }
        } catch(_) {}
      }

      // Focus first focusable in the step
      try {
        const stepEls = queryStepEls(currentStep);
        const firstInput = stepEls.map(el => el.querySelector('input, select, textarea, button')).find(Boolean);
        if (firstInput && firstInput.focus) firstInput.focus();
      } catch(_){}
    }

    function onClickStepTab(targetStep) {
      setStep(targetStep);
    }

    if (stepTab1) stepTab1.addEventListener('click', () => onClickStepTab(1));
    if (stepTab2) stepTab2.addEventListener('click', () => onClickStepTab(2));
    if (stepTab3) stepTab3.addEventListener('click', () => onClickStepTab(3));
    if (prevBtn)  prevBtn.addEventListener('click', () => setStep(currentStep - 1));
    if (nextBtn)  nextBtn.addEventListener('click', () => setStep(currentStep + 1));

    // Panels & list state (tabs supprimés)
    const panelCreate  = document.getElementById('contrib-panel-create');
    const panelList    = document.getElementById('contrib-panel-list');
    const backBtn      = document.getElementById('contrib-back');
    // Landing elements
    const landingEl = document.getElementById('contrib-landing');
    const landingCreateBtn = document.getElementById('landing-create');
    const landingEditBtn = document.getElementById('landing-edit');
    const listEl       = document.getElementById('contrib-list');
    const listStatusEl = document.getElementById('contrib-list-status');
    const listSearchEl = document.getElementById('contrib-search');
    const listCatEl    = document.getElementById('contrib-filter-category');
    const listSortEl   = document.getElementById('contrib-sort');
    const listSentinel = document.getElementById('contrib-list-sentinel');
    const listMineOnlyEl = document.getElementById('contrib-mine-only');

    let currentEditId = null; // when set, the form is in edit mode
    let listState = {
      search: '',
      category: '',
      sortBy: 'created_at',
      sortDir: 'desc',
      page: 1,
      pageSize: 10,
      mineOnly: false,
      loading: false,
      done: false,
      items: []
    };

    // —— Official links fields visibility by category ——
    const createCatEl = document.getElementById('contrib-category');
    const grandlyonInput = document.getElementById('contrib-grandlyon-url');
    const sytralInput = document.getElementById('contrib-sytral-url');
    const grandlyonRow = grandlyonInput ? grandlyonInput.closest('.form-row') : null;
    const sytralRow = sytralInput ? sytralInput.closest('.form-row') : null;

    function updateOfficialLinkRows(category) {
      const cat = category || '';
      if (grandlyonRow) grandlyonRow.hidden = cat !== 'urbanisme';
      if (sytralRow) sytralRow.hidden = cat !== 'mobilite';
      if (grandlyonInput) grandlyonInput.disabled = cat !== 'urbanisme';
      if (sytralInput) sytralInput.disabled = cat !== 'mobilite';
    }

    if (createCatEl) {
      // Initial state based on default selection
      try { updateOfficialLinkRows(createCatEl.value || ''); } catch(_) {}
      createCatEl.addEventListener('change', (e) => {
        try { updateOfficialLinkRows((e && e.target && e.target.value) || ''); } catch(_) {}
      });
    }

    function slugify(str) {
      return (str || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'geom';
    }

    function setStatus(msg, kind = 'info') {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.color = kind === 'error' ? 'var(--danger, #b00020)' : (kind === 'success' ? 'var(--success, #2e7d32)' : '');
    }

    // —— Accessible toast notifications ——
    const toastContainer = document.getElementById('toast-container');
    function showToast(message, kind = 'info') {
      if (!toastContainer || !message) return;
      const toast = document.createElement('div');
      const isError = kind === 'error';
      const isSuccess = kind === 'success';
      toast.setAttribute('role', isError ? 'alert' : 'status');
      toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
      toast.style.cssText = 'min-width:200px;max-width:360px;padding:10px 12px;border-radius:8px;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.15);font-size:14px;';
      toast.style.background = isError ? '#c62828' : (isSuccess ? '#2e7d32' : '#455a64');
      toast.textContent = message;
      toastContainer.appendChild(toast);
      setTimeout(() => {
        try { toast.style.opacity = '0'; toast.style.transition = 'opacity 200ms'; } catch(_){ }
        setTimeout(() => { try { toast.remove(); } catch(_){} }, 220);
      }, 4200);
    }

    async function initDrawMap() {
      if (drawMap || !drawPanelEl) return;
      try {
        const container = document.getElementById(drawMapContainerId);
        if (!container) return;
        // Load basemaps and pick "Mode couleur" when available
        const bmList = await ensureBasemaps();
        const colorBm = Array.isArray(bmList)
          ? (bmList.find(b => ((b.label || b.name || '').toLowerCase().includes('mode couleur'))) || pickDefaultBasemap(bmList))
          : null;
        // Initialise Leaflet map with a safe temporary view (updated by city branding)
        drawMap = L.map(drawMapContainerId, { center: [45.75, 4.85], zoom: 12 });
        try { drawMap.whenReady(() => setTimeout(() => { try { drawMap.invalidateSize(); } catch(_) {} }, 60)); } catch(_) {}
        setDrawBaseLayer(colorBm);
        // Ensure no basemap menu is displayed in contribution modal
        try { drawPanelEl.querySelector('#contrib-basemap-menu')?.remove(); } catch(_) {}
        // Attach a single map click handler for manual drawing
        drawMap.on('click', onMapClick);
        drawMap.on('mousemove', onMapMouseMove);
        drawMap.on('mouseout', () => clearGuide());
        // Center by selected/active city when available
        const selectedCity = (cityEl && cityEl.value) ? cityEl.value.trim() : (win.activeCity || '').trim();
        if (selectedCity) { await applyCityBranding(selectedCity); }
      } catch (e) {
        console.warn('[contrib] initDrawMap error:', e);
      }
    }

    // —— Tabs logic (ARIA, keyboard) ——
    function activateTab(which) {
      const isCreate = which === 'create';
      if (panelCreate) panelCreate.hidden = !isCreate;
      if (panelList) panelList.hidden = isCreate;
      // bouton retour visible quand on est hors landing
      if (backBtn) backBtn.style.display = '';

      if (!isCreate) {
        // ensure list is initialized
        try { if (listEl && !listState.items.length) listResetAndLoad(); } catch(_) {}
        // focus first tabbable in list filters
        try { listSearchEl && listSearchEl.focus(); } catch(_) {}
      } else {
        // focus close button for accessibility or project name
        const nameEl = document.getElementById('contrib-project-name');
        try { (nameEl && nameEl.focus && nameEl.focus()); } catch(_) {}
      }
    }

    // —— Landing helpers ——
    const tabsContainer = document.querySelector('#contrib-overlay .contrib-tabs');
    function showLanding() {
      try {
        if (landingEl) landingEl.hidden = false;
        if (tabsContainer) tabsContainer.style.display = 'none';
        if (panelCreate) panelCreate.hidden = true;
        if (panelList) panelList.hidden = true;
        if (backBtn) backBtn.style.display = 'none';
      } catch(_) {}
    }
    function hideLanding() {
      try {
        if (landingEl) landingEl.hidden = true;
        if (tabsContainer) tabsContainer.style.display = '';
        if (backBtn) backBtn.style.display = '';
      } catch(_) {}
    }
    function chooseLanding(target) {
      try { sessionStorage.setItem('contribLandingSeen', '1'); } catch(_) {}
      hideLanding();
      if (target === 'list') {
        activateTab('list');
      } else {
        activateTab('create');
        try { setStep(1, { force: true }); } catch(_) {}
      }
    }

    // Bind landing buttons
    if (landingCreateBtn) landingCreateBtn.addEventListener('click', () => chooseLanding('create'));
    if (landingEditBtn) landingEditBtn.addEventListener('click', () => chooseLanding('list'));
    if (backBtn) backBtn.addEventListener('click', () => showLanding());

    // —— List helpers ——
    function setListStatus(msg) {
      if (listStatusEl) listStatusEl.textContent = msg || '';
    }

    // —— Custom delete confirmation modal ——
    function toStorageRelPathFromPublicUrl(url) {
      try {
        if (!url) return null;
        const marker = '/object/public/';
        const i = url.indexOf(marker);
        if (i === -1) {
          // fallback to basename
          try { return new URL(url, win.location.href).pathname.split('/').slice(-1)[0] || url; } catch (_) { return String(url); }
        }
        const after = url.slice(i + marker.length); // e.g., 'uploads/geojson/...'
        const prefix = 'uploads/';
        return after.startsWith(prefix) ? after.slice(prefix.length) : after;
      } catch (_) {
        return null;
      }
    }

    function openDeleteConfirmModal(details) {
      const { id, projectName, filePaths = [], dossiersCount = 0 } = details || {};
      return new Promise((resolve) => {
        console.log('[contrib] openDeleteConfirmModal', { id, projectName, filePaths, dossiersCount });
        const lastFocus = document.activeElement;

        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'presentation');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';

        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'delc-title');
        modal.setAttribute('aria-describedby', 'delc-desc');
        modal.style.cssText = 'max-width:560px;width:92%;background:#fff;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,0.25);padding:16px 18px;font-size:15px;color:#263238;';

        const title = document.createElement('h2');
        title.id = 'delc-title';
        title.textContent = `Supprimer la contribution ${projectName ? `« ${projectName} »` : `#${id}`} ?`;
        title.style.cssText = 'margin:0 0 8px 0;font-size:18px;';

        const desc = document.createElement('div');
        desc.id = 'delc-desc';
        desc.innerHTML = `
          <p>Cette action est définitive. Elle supprimera les éléments suivants :</p>
          <ul style="margin:0 0 8px 18px;">
            <li>La ligne <code>contribution_uploads</code> (id : <strong>#${id}</strong>)</li>
            ${filePaths.length ? filePaths.map(p => `<li>Fichier de stockage : <code>${p}</code></li>`).join('') : '<li>Aucun fichier de stockage associé.</li>'}
            <li>Dossiers de concertation liés : <strong>${dossiersCount}</strong></li>
          </ul>
          <p>Voulez-vous continuer ?</p>
        `;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:12px;';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Annuler';
        cancelBtn.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.15);background:#fff;';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = 'Supprimer';
        confirmBtn.style.cssText = 'padding:8px 12px;border-radius:8px;border:0;background:#c62828;color:#fff;';

        const close = (result) => {
          try { document.removeEventListener('keydown', onKey); } catch(_){}
          try { overlay.remove(); } catch(_){}
          try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch(_){}
          resolve(!!result);
        };

        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); close(false); }
          if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
        };

        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        modal.appendChild(title);
        modal.appendChild(desc);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        try { document.addEventListener('keydown', onKey); } catch(_){}
        try { cancelBtn.focus(); } catch(_){}
      });
    }

    // Shared delete flow for both list items and edit button
    async function doDeleteContribution(id, projectName) {
      try {
        console.log('[contrib] doDeleteContribution called', { id, projectName });
        if (!id) { console.log('[contrib] doDeleteContribution: missing id, abort'); return; }
        // Fetch row details for richer confirmation content
        let row = null;
        try { row = await (win.supabaseService && win.supabaseService.getContributionById(id)); } catch(_) {}
        const effectiveName = (row && row.project_name) || projectName || '';
        const filePaths = [];
        try {
          if (row && row.geojson_url) { const p = toStorageRelPathFromPublicUrl(row.geojson_url); if (p) filePaths.push(p); }
          if (row && row.cover_url)   { const p = toStorageRelPathFromPublicUrl(row.cover_url);   if (p) filePaths.push(p); }
          if (row && row.markdown_url){ const p = toStorageRelPathFromPublicUrl(row.markdown_url);if (p) filePaths.push(p); }
        } catch(_) {}
        let dossiersCount = 0;
        try {
          if (effectiveName && win.supabaseService && typeof win.supabaseService.getConsultationDossiersByProject === 'function') {
            const ds = await win.supabaseService.getConsultationDossiersByProject(effectiveName);
            if (Array.isArray(ds)) dossiersCount = ds.length;
          }
        } catch(_) {}
        console.log('[contrib] showing custom delete confirm modal');
        const ok = await openDeleteConfirmModal({ id, projectName: effectiveName, filePaths, dossiersCount });
        console.log('[contrib] confirm response', ok);
        if (!ok) { console.log('[contrib] user canceled deletion'); return; }
        setListStatus('Suppression en cours…');
        console.log('[contrib] set aria-busy on list');
        try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
        // Ensure authenticated session
        console.log('[contrib] requesting session via AuthModule.requireAuthOrRedirect');
        const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
        console.log('[contrib] session result', { hasSession: !!session, hasUser: !!(session && session.user) });
        if (!session || !session.user) { console.log('[contrib] no session/user, likely redirected to /login, aborting'); return; } // redirected
        console.log('[contrib] calling supabaseService.deleteContribution', { id });
        const result = await (win.supabaseService && win.supabaseService.deleteContribution(id));
        console.log('[contrib] deleteContribution result', result);
        setListStatus('');
        if (!result || result.success !== true) {
          console.log('[contrib] deletion failed branch');
          showToast('Échec de la suppression.', 'error');
          return;
        }
        // If we were editing this row, exit edit mode
        if (currentEditId === id) {
          console.log('[contrib] deleting currently edited item, exiting edit mode', { currentEditId });
          try { exitEditMode(); } catch(_) {}
          setStatus('Contribution supprimée.', 'success');
        }
        showToast('Contribution supprimée.', 'success');
        console.log('[contrib] deletion success toast shown');
        // Refresh list if visible
        if (panelList && !panelList.hidden) { console.log('[contrib] refreshing list after delete'); listResetAndLoad(); }
      } catch (e) {
        console.warn('[contrib] delete error:', e);
        showToast('Erreur lors de la suppression.', 'error');
      } finally {
        try { if (listEl) { listEl.removeAttribute('aria-busy'); console.log('[contrib] cleaned aria-busy on list'); } } catch(_) {}
      }
    }

    function renderItem(item) {
      const el = document.createElement('div');
      el.className = 'contrib-list-item';
      el.setAttribute('role', 'listitem');
      el.style.display = 'flex';
      el.style.gap = '10px';
      el.style.width = '100%';
      el.style.textAlign = 'left';
      el.style.padding = '8px';
      el.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
      const cover = item.cover_url ? `<img src="${item.cover_url}" alt="" style="width:54px;height:40px;object-fit:cover;border-radius:4px;"/>` : '';
      const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
      el.innerHTML = `
        ${cover}
        <div class="contrib-item-main" role="button" tabindex="0" style="flex:1 1 auto; cursor:pointer;">
          <div style="font-weight:600;">${item.project_name || '(sans nom)'} <span style="font-size:0.85em;opacity:0.75;">· ${item.category || ''}</span></div>
          <div style="font-size:0.85em;opacity:0.8;">Créé le: ${when}</div>
          ${item.meta ? `<div style=\"font-size:0.85em;opacity:0.85;\">${item.meta}</div>` : ''}
        </div>
        <div class="contrib-item-actions" style="display:flex; align-items:center;">
          <button type="button" class="contrib-item-delete" aria-label="Supprimer" title="Supprimer"
            style="padding:6px 8px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; background:#fff; color:#c62828;">
            <i class="fa fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
      const main = el.querySelector('.contrib-item-main');
      const delBtn = el.querySelector('.contrib-item-delete');
      if (main) main.addEventListener('click', async () => {
        try {
          setListStatus('Chargement…');
          const row = await (win.supabaseService && win.supabaseService.getContributionById(item.id));
          setListStatus('');
          if (row) {
            enterEditMode(row);
            activateTab('create');
          }
        } catch (e) {
          setListStatus('Erreur de chargement.');
          showToast('Erreur lors du chargement de la contribution.', 'error');
        }
      });
      if (main) main.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          main.click();
        }
      });
      if (delBtn) delBtn.addEventListener('click', (ev) => {
        console.log('[contrib] click delete in listing', { id: item.id, project_name: item.project_name });
        ev.stopPropagation();
        doDeleteContribution(item.id, item.project_name);
      });
      return el;
    }

    async function listResetAndLoad() {
      if (!listEl) return;
      listEl.innerHTML = '';
      // Keep sentinel at end
      if (listSentinel) listEl.appendChild(listSentinel);
      listState.page = 1; listState.done = false; listState.items = [];
      await listLoadMore();
    }

    async function listLoadMore() {
      if (listState.loading || listState.done) return;
      listState.loading = true;
      setListStatus('Chargement…');
      try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
      try {
        const { search, category, sortBy, sortDir, page, pageSize, mineOnly } = listState;
        const res = await (win.supabaseService && win.supabaseService.listContributions({
          search, category, page, pageSize, mineOnly, sortBy, sortDir
        }));
        const items = (res && res.items) ? res.items : [];
        if (!items.length) {
          if (page === 1) setListStatus('Aucune contribution.');
          listState.done = true;
        } else {
          setListStatus('');
          listState.items.push(...items);
          items.forEach(it => {
            const node = renderItem(it);
            if (listSentinel && listSentinel.parentNode === listEl) {
              listEl.insertBefore(node, listSentinel);
            } else {
              listEl.appendChild(node);
            }
          });
          listState.page += 1;
          if (items.length < listState.pageSize) listState.done = true;
        }
      } catch (e) {
        setListStatus('Erreur lors du chargement.');
        showToast('Erreur lors du chargement des contributions.', 'error');
      } finally {
        listState.loading = false;
        try { if (listEl) listEl.removeAttribute('aria-busy'); } catch(_) {}
      }
    }

    let io = null;
    function initInfiniteScroll() {
      if (!listEl || !listSentinel) return;
      try { if (io) { io.disconnect(); io = null; } } catch(_) {}
      io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) listLoadMore();
        });
      }, { root: listEl, threshold: 0.1 });
      io.observe(listSentinel);
    }

    // Filters listeners with debounce
    let debounceTimer = null;
    function debouncedReset() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { listResetAndLoad(); }, 250);
    }
    if (listSearchEl) listSearchEl.addEventListener('input', () => { listState.search = listSearchEl.value || ''; debouncedReset(); });
    if (listCatEl) listCatEl.addEventListener('change', () => { listState.category = listCatEl.value || ''; debouncedReset(); });
    if (listSortEl) listSortEl.addEventListener('change', () => {
      const v = listSortEl.value || 'created_at:desc';
      const [by, dir] = v.split(':');
      const mapped = (by === 'updated_at') ? 'created_at' : (by || 'created_at');
      listState.sortBy = mapped;
      listState.sortDir = (dir === 'asc') ? 'asc' : 'desc';
      debouncedReset();
    });
    if (listMineOnlyEl) listMineOnlyEl.addEventListener('change', () => {
      listState.mineOnly = !!listMineOnlyEl.checked;
      debouncedReset();
    });

    // Initialize infinite scroll once
    initInfiniteScroll();

    // —— Edit mode helpers ——
    const cancelEditBtn = document.getElementById('contrib-cancel-edit');
    const deleteEditBtn = document.getElementById('contrib-delete');
    const coverPreview  = document.getElementById('contrib-cover-preview');

    function setEditUI(on) {
      const submitBtn = document.getElementById('contrib-submit');
      const nameEl = document.getElementById('contrib-project-name');
      if (submitBtn) submitBtn.querySelector('span')?.replaceChildren(document.createTextNode(on ? 'Enregistrer' : 'Envoyer'));
      if (cancelEditBtn) cancelEditBtn.style.display = on ? '' : 'none';
      if (deleteEditBtn) deleteEditBtn.style.display = on ? '' : 'none';
      if (nameEl) nameEl.focus();
    }

    function prefillForm(row) {
      const nameEl = document.getElementById('contrib-project-name');
      const catEl  = document.getElementById('contrib-category');
      const citySel = document.getElementById('contrib-city');
      const metaEl = document.getElementById('contrib-meta');
      const descEl = document.getElementById('contrib-description');
      const mdEl   = document.getElementById('contrib-markdown');
      if (nameEl) nameEl.value = row.project_name || '';
      if (catEl) catEl.value = row.category || '';
      // Mettre à jour l'affichage des champs de liens officiels selon la catégorie pré-remplie
      try { updateOfficialLinkRows(catEl ? catEl.value : (row.category || '')); } catch(_) {}
      if (citySel && row && row.ville) {
        try { citySel.value = row.ville; } catch(_) {}
      }
      if (metaEl) metaEl.value = row.meta || '';
      if (descEl) descEl.value = row.description || '';
      if (coverPreview) {
        coverPreview.innerHTML = row.cover_url ? `<img src="${row.cover_url}" alt="Aperçu cover" style="max-height:80px;border-radius:6px;"/>` : '';
      }
      // Try fetching markdown content
      if (mdEl) {
        mdEl.value = '';
        if (row.markdown_url) {
          fetch(row.markdown_url).then(r => r.ok ? r.text() : '').then(txt => { if (typeof txt === 'string') mdEl.value = txt; }).catch(()=>{});
        }
      }
      // Geometry inputs: reset file and drawings (loading from server handled separately)
      const fileInput = document.getElementById('contrib-geojson');
      if (fileInput) { try { fileInput.value = ''; } catch(_){} }
      try { clearAllDrawings(); } catch(_) {}
    }

    function enterEditMode(row) {
      currentEditId = row.id;
      prefillForm(row);
      setStatus('Mode édition. Modifiez et cliquez sur Enregistrer.');
      setEditUI(true);
      // Preload server-side geometry on map if available
      if (row && row.geojson_url) {
        preloadGeometryOnMap(row.geojson_url);
      }
      // Load existing consultation dossiers related to the project name
      try { clearExistingDossiers(); renderExistingDossiers(row.project_name); } catch(_) {}
    }

    function exitEditMode() {
      currentEditId = null;
      try { form.reset(); } catch(_) {}
      if (coverPreview) coverPreview.innerHTML = '';
      setEditUI(false);
      setStatus('');
      try { clearAllDrawings(); } catch(_) {}
      try { setGeomMode('file'); } catch(_) {}
      try { clearExistingDossiers(); } catch(_) {}
    }

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        exitEditMode();
      });
    }

    if (deleteEditBtn) {
      deleteEditBtn.addEventListener('click', async () => {
        console.log('[contrib] click delete in edit mode', { currentEditId });
        if (!currentEditId) { console.log('[contrib] deleteEditBtn: no currentEditId, abort'); return; }
        const projectName = document.getElementById('contrib-project-name')?.value?.trim();
        console.log('[contrib] edit mode delete: resolved projectName', { projectName });
        await doDeleteContribution(currentEditId, projectName);
      });
    }

    function setGeomMode(mode) {
      const fileInput = document.getElementById('contrib-geojson');
      // Sync radios and cards visual state
      try {
        if (geomModeRadios && geomModeRadios.length) {
          geomModeRadios.forEach(r => { r.checked = (r.value === mode); });
        }
        if (geomCardFile && geomCardDraw) {
          const isDraw = mode === 'draw';
          geomCardFile.classList.toggle('is-active', !isDraw);
          geomCardDraw.classList.toggle('is-active', isDraw);
          geomCardFile.setAttribute('aria-pressed', (!isDraw).toString());
          geomCardDraw.setAttribute('aria-pressed', isDraw.toString());
        }
      } catch(_){}
      if (mode === 'draw') {
        if (fileRowEl) { fileRowEl.style.display = 'none'; fileRowEl.classList.remove('reveal'); }
        if (fileInput) {
          fileInput.required = false;
          fileInput.disabled = true;
          try { fileInput.value = ''; } catch(_) {}
        }
        if (drawPanelEl) { drawPanelEl.style.display = ''; drawPanelEl.classList.add('reveal'); }
        initDrawMap();
        setTimeout(() => { try { if (drawMap) drawMap.invalidateSize(); } catch(_){} }, 50);
        // Manual drawing only
        ensureManualToolbar();
        cancelManualDraw(true);
        setStatus('Mode dessin manuel actif. Choisissez Ligne ou Polygone puis cliquez sur la carte.');
        // Nettoyer couche précédente
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        drawLayerDirty = false;
      } else {
        if (fileRowEl) { fileRowEl.style.display = ''; fileRowEl.classList.add('reveal'); }
        if (fileInput) { fileInput.required = true; fileInput.disabled = false; }
        if (drawPanelEl) { drawPanelEl.style.display = 'none'; drawPanelEl.classList.remove('reveal'); }
        // Revenir au mode fichier doit nettoyer tout dessin en cours
        try { clearAllDrawings(); } catch(_) {}
        try {
          cancelManualDraw(true);
          const manualTb = drawPanelEl && drawPanelEl.querySelector('#contrib-manual-draw-controls');
          if (manualTb) manualTb.style.display = 'none';
        } catch(_){ }
      }
      // Après un changement de mode, si on est en étape 2, re-valider l'étape
      if (currentStep === 2) {
        try { validateStep2(); } catch(_) {}
      }
    }

    function clearAllDrawings() {
      if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
      drawLayerDirty = false;
      try {
        cancelManualDraw(true);
      } catch(_){ }
    }

    // Preload existing geometry into the draw map in edit mode
    async function preloadGeometryOnMap(url) {
      try {
        setStatus('Chargement de la géométrie…');
        // Switch UI to draw mode and ensure map exists
        const drawRadio = Array.from(geomModeRadios || []).find(r => r.value === 'draw');
        if (drawRadio) { drawRadio.checked = true; }
        setGeomMode('draw');
        // Nettoyer et afficher uniquement la géométrie existante
        try { clearAllDrawings(); } catch(_) {}
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('GeoJSON non accessible');
        const gj = await resp.json();
        const style = { color: '#1976d2', weight: 3, fillOpacity: 0.2 };
        const pointToLayer = (feature, latlng) => L.circleMarker(latlng, { radius: 5, color: '#1976d2', weight: 2, fillOpacity: 0.7 });
        drawLayer = L.geoJSON(gj, { style, pointToLayer }).addTo(drawMap);
        try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_){ }
        drawLayerDirty = false; // Loaded from server; don't re-upload unless user redraws
        setStatus('Géométrie chargée depuis la contribution.', 'success');
      } catch (err) {
        console.warn('[contrib] preloadGeometryOnMap error:', err);
        setStatus('Impossible de charger la géométrie existante.', 'error');
        showToast('Impossible de charger la géométrie existante.', 'error');
      }
    }
    // Dessin manuel uniquement: pas d'intégration Leaflet-Geoman

    // Mode change listeners
    if (geomModeRadios && geomModeRadios.length) {
      geomModeRadios.forEach(r => {
        r.addEventListener('change', () => {
          const checked = Array.from(geomModeRadios).find(x => x.checked)?.value || 'file';
          setGeomMode(checked);
        });
      });
    }
    // Card click listeners
    if (geomCardFile) geomCardFile.addEventListener('click', () => setGeomMode('file'));
    if (geomCardDraw) geomCardDraw.addEventListener('click', () => setGeomMode('draw'));
    // Initialize UI state
    const initialMode = (Array.from(geomModeRadios || []).find(x => x.checked)?.value) || 'file';
    setGeomMode(initialMode);

    // Dropzone: clic + drag&drop léger pour GeoJSON
    (function setupDropzone(){
      const fileInput = document.getElementById('contrib-geojson');
      if (!dropzoneEl || !fileInput) return;
      const openPicker = () => { if (!fileInput.disabled) fileInput.click(); };
      dropzoneEl.addEventListener('click', openPicker);
      dropzoneEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
      });
      const updateName = () => {
        const f = fileInput.files && fileInput.files[0];
        if (dzFilenameEl) dzFilenameEl.textContent = f ? f.name : '';
        if (dropzoneEl) dropzoneEl.classList.toggle('has-file', !!f);
      };
      fileInput.addEventListener('change', () => { updateName(); try { validateStep2(); } catch(_){} });
      ['dragenter','dragover'].forEach(ev => dropzoneEl.addEventListener(ev, (e)=>{
        e.preventDefault(); e.stopPropagation(); dropzoneEl.classList.add('is-dragover');
      }));
      ['dragleave','dragend','drop'].forEach(ev => dropzoneEl.addEventListener(ev, (e)=>{
        e.preventDefault(); e.stopPropagation(); dropzoneEl.classList.remove('is-dragover');
      }));
      dropzoneEl.addEventListener('drop', (e)=>{
        const dt = e.dataTransfer; if (!dt) return;
        const files = dt.files; if (!files || !files.length) return;
        if (!fileInput.disabled) { fileInput.files = files; fileInput.dispatchEvent(new Event('change', { bubbles:true })); }
      });
    })();

    function createDocRow() {
      const row = document.createElement('div');
      row.className = 'doc-row';
      row.innerHTML = `
        <input type="text" class="doc-title" placeholder="Titre du document PDF" />
        <input type="url" class="doc-url" placeholder="URL du PDF (https://...)" />
        <button type="button" class="doc-remove" aria-label="Supprimer">&times;</button>
      `;
      const removeBtn = row.querySelector('.doc-remove');
      removeBtn?.addEventListener('click', () => {
        row.remove();
      });
      return row;
    }

    function collectDocs() {
      if (!docsFieldset) return [];
      const rows = docsFieldset.querySelectorAll('.doc-row');
      const out = [];
      rows.forEach((row) => {
        const title = row.querySelector('.doc-title')?.value?.trim();
        const url = row.querySelector('.doc-url')?.value?.trim();
        if (title && url) out.push({ title, pdf_url: url });
      });
      return out;
    }

    // —— Existing consultation dossiers (display-only in edit mode) ——
    function clearExistingDossiers() {
      if (existingDocsEl) existingDocsEl.innerHTML = '';
    }

    async function renderExistingDossiers(projectName) {
      try {
        if (!existingDocsEl || !projectName) return;
        existingDocsEl.innerHTML = '';
        if (!win.supabaseService || typeof win.supabaseService.getConsultationDossiersByProject !== 'function') return;
        const dossiers = await win.supabaseService.getConsultationDossiersByProject(projectName);
        if (!Array.isArray(dossiers) || dossiers.length === 0) return;
        const uniq = new Map();
        dossiers.forEach(d => {
          if (d && d.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d);
        });
        const docs = Array.from(uniq.values());
        if (!docs.length) return;
        // Build a simple list
        const wrap = document.createElement('div');
        wrap.className = 'existing-docs-wrap';
        const title = document.createElement('div');
        title.textContent = 'Dossiers liés trouvés :';
        title.style.cssText = 'font-weight:600;margin:4px 0;';
        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:0;padding-left:18px;';
        docs.forEach(d => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = d.pdf_url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = d.title || d.pdf_url;
          li.appendChild(a);
          ul.appendChild(li);
        });
        wrap.appendChild(title);
        wrap.appendChild(ul);
        existingDocsEl.appendChild(wrap);
      } catch (e) {
        console.warn('[contrib] renderExistingDossiers error:', e);
      }
    }

    if (addDocBtn && docsFieldset) {
      addDocBtn.addEventListener('click', () => {
        const row = createDocRow();
        // Insert before the add button
        docsFieldset.insertBefore(row, addDocBtn);
      });
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (!form) return;

      const submitBtn = document.getElementById('contrib-submit');
      const projectName = document.getElementById('contrib-project-name')?.value?.trim();
      const category = document.getElementById('contrib-category')?.value;
      const fileInput = document.getElementById('contrib-geojson');
      const coverInput = document.getElementById('contrib-cover');
      const city = document.getElementById('contrib-city')?.value?.trim();
      const grandlyonUrl = document.getElementById('contrib-grandlyon-url')?.value?.trim();
      const sytralUrl = document.getElementById('contrib-sytral-url')?.value?.trim();
      const meta = document.getElementById('contrib-meta')?.value?.trim();
      const description = document.getElementById('contrib-description')?.value?.trim();
      const mdTextRaw = document.getElementById('contrib-markdown')?.value || '';
      const geomMode = (function(){
        const r = geomModeRadios && geomModeRadios.length ? Array.from(geomModeRadios).find(x => x.checked) : null;
        return r ? r.value : 'file';
      })();

      if (!projectName || !category || !city) {
        setStatus('Veuillez renseigner le nom, la catégorie et la ville.', 'error');
        return;
      }

      // Build potential GeoJSON upload only when creating or when explicitly provided in edit
      let fileForUpload = null;
      if (!currentEditId || (currentEditId && (geomMode === 'file' ? (fileInput && fileInput.files && fileInput.files.length) : (!!drawLayer && drawLayerDirty)))) {
        if (geomMode === 'file') {
          if (!fileInput || !fileInput.files?.length) {
            if (!currentEditId) { setStatus('Veuillez sélectionner un fichier GeoJSON.', 'error'); return; }
          } else {
            const file = fileInput.files[0];
            const nameLower = (file.name || '').toLowerCase();
            if (!nameLower.endsWith('.geojson') && !(file.type || '').includes('json')) {
              setStatus('Le fichier doit être un GeoJSON (.geojson ou JSON valide).', 'error');
              return;
            }
            fileForUpload = file;
          }
        } else if (geomMode === 'draw') {
          if (!drawLayer) {
            if (!currentEditId) { setStatus('Veuillez dessiner une géométrie (ligne ou polygone) avant de soumettre.', 'error'); return; }
          } else {
            try {
              const feature = drawLayer.toGeoJSON();
              const feat = feature.type === 'Feature' ? feature : { type: 'Feature', properties: {}, geometry: feature };
              const fc = { type: 'FeatureCollection', features: Array.isArray(feature.features) ? feature.features : [feat] };
              const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
              try { fileForUpload = new File([blob], `${slugify(projectName)}.geojson`, { type: 'application/geo+json' }); }
              catch (_) { fileForUpload = blob; }
            } catch (gerr) {
              setStatus('Impossible de convertir le dessin en GeoJSON.', 'error');
              return;
            }
          }
        } else {
          setStatus('Mode de saisie inconnu.', 'error');
          return;
        }
      }

      const coverFile = coverInput && coverInput.files && coverInput.files[0] ? coverInput.files[0] : null;

      setStatus('Envoi en cours…');
      if (submitBtn) submitBtn.disabled = true;
      try { if (form) form.setAttribute('aria-busy', 'true'); } catch(_) {}

      try {
        // Ensure authenticated session
        const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
        if (!session || !session.user) return; // redirected

        let rowId = currentEditId;
        if (!currentEditId) {
          // 0) Create row (create mode)
          try {
            if (win.supabaseService && typeof win.supabaseService.createContributionRow === 'function') {
              rowId = await win.supabaseService.createContributionRow(projectName, category, city);
            }
          } catch (e) {
            console.warn('[contrib] createContributionRow error:', e);
          }
          if (!rowId) {
            setStatus("Impossible de créer l'entrée de contribution. Réessayez plus tard.", 'error');
            showToast("Création impossible pour le moment.", 'error');
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
        }

        // 1) Upload GeoJSON (fichier importé ou dessiné) vers Supabase Storage
        if (fileForUpload) {
          await (win.supabaseService && win.supabaseService.uploadGeoJSONToStorage(fileForUpload, category, projectName, rowId));
        }

        // 1b) Optional cover upload (non-blocking)
        if (coverFile) {
          try {
            await (win.supabaseService && win.supabaseService.uploadCoverToStorage(coverFile, category, projectName, rowId));
          } catch (coverErr) {
            console.warn('[contrib] cover upload error (non bloquant):', coverErr);
          }
        }

        // 1c) Optional Markdown upload (non-blocking)
        const mdText = (mdTextRaw || '').trim();
        if (mdText) {
          try {
            const mdBlob = new Blob([mdText], { type: 'text/markdown' });
            await (win.supabaseService && win.supabaseService.uploadMarkdownToStorage(mdBlob, category, projectName, rowId));
          } catch (mdErr) {
            console.warn('[contrib] markdown upload error (non bloquant):', mdErr);
          }
        }

        // 2) Optional links
        if (category === 'urbanisme' && grandlyonUrl) {
          await win.supabaseService.upsertGrandLyonLink(projectName, grandlyonUrl);
        }
        if (category === 'mobilite' && sytralUrl) {
          await win.supabaseService.upsertSytralLink(projectName, sytralUrl);
        }

        // 3) Optional consultation dossiers
        const docs = collectDocs();
        if (docs.length) {
          await win.supabaseService.insertConsultationDossiers(projectName, category, docs);
        }

        // 4) Patch core fields (edit or create)
        try {
          await (win.supabaseService && win.supabaseService.updateContribution(rowId, {
            project_name: projectName,
            category: category,
            ville: city,
            meta: meta || null,
            description: description || null
          }));
        } catch (patchErr) {
          console.warn('[contrib] updateContribution warning:', patchErr);
        }

        if (currentEditId) {
          setStatus('Modifications enregistrées.', 'success');
          showToast('Modifications enregistrées.', 'success');
          // Emit event for refresh
          try { window.dispatchEvent(new CustomEvent('contribution:updated', { detail: { id: rowId, project_name: projectName, category } })); } catch(_) {}
          // Keep modal open but exit edit mode
          exitEditMode();
          // Refresh list if visible
          if (panelList && !panelList.hidden) listResetAndLoad();
        } else {
          setStatus('Contribution enregistrée. Merci !', 'success');
          showToast('Contribution enregistrée. Merci !', 'success');
          try { form.reset(); } catch(_) {}
          // Nettoyer l'état de dessin et remettre l'UI en mode fichier par défaut
          try { clearAllDrawings(); } catch(_) {}
          try { setGeomMode('file'); } catch(_) {}
          // Close after a short delay
          setTimeout(() => { try { closeContrib(); } catch(_) {} }, 900);
        }
      } catch (err) {
        console.error('[contrib] submit error:', err);
        setStatus('Échec de l’envoi. Réessayez plus tard.', 'error');
        showToast('Échec de l’envoi de la contribution.', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        try { if (form) form.removeAttribute('aria-busy'); } catch(_) {}
      }
    }

    if (form) {
      form.addEventListener('submit', handleSubmit);
    }

    // Populate city selector from DB and default to active city
    async function populateCities() {
      try {
        if (!cityEl || !win.supabaseService) return;
        // temporary placeholder
        cityEl.innerHTML = '<option value="" disabled selected>Chargement…</option>';
        let cities = [];
        try {
          if (typeof win.supabaseService.getValidCities === 'function') {
            cities = await win.supabaseService.getValidCities();
          }
        } catch (e1) {
          console.warn('[contrib] populateCities getValidCities error:', e1);
        }
        if ((!Array.isArray(cities) || !cities.length) && typeof win.supabaseService.listCities === 'function') {
          try { cities = await win.supabaseService.listCities(); } catch (e2) { console.warn('[contrib] populateCities listCities fallback error:', e2); }
        }
        const options = (Array.isArray(cities) && cities.length ? cities : ['lyon']).map(c => `<option value="${c}">${c}</option>`).join('');
        cityEl.innerHTML = options;
        // default selection
        const active = (win.activeCity || '').trim();
        if (active) {
          try { cityEl.value = active; } catch(_) {}
        }
      } catch (err) {
        console.warn('[contrib] populateCities error:', err);
        if (cityEl && !cityEl.options.length) {
          cityEl.innerHTML = '<option value="lyon" selected>lyon</option>';
        }
      }
    }

    // Recenter draw map on city change
    if (cityEl) {
      cityEl.addEventListener('change', async () => {
        try {
          const v = (cityEl.value || '').trim();
          if (v) await applyCityBranding(v);
        } catch (_) {}
      });
    }

    try { populateCities(); } catch(_) {}

    // Ensure tab default is Create when opening
    // Open handler already focuses close btn; we set tab states explicitly here
    activateTab('create');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContrib);
  } else {
    setupContrib();
  }
})(window);
