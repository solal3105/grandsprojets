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
      // Toujours afficher l'écran d'accueil (choix Créer / Modifier)
      try { showLanding(); } catch(_) {}
    };

    const contribEscHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeContrib();
      }
    };

    if (contribToggle) {
      // Masquer/afficher le bouton "Contribuer" selon l'état d'authentification
      const applyContribVisibility = (session) => {
        try {
          const isAuthed = !!(session && session.user);
          if (contribToggle) contribToggle.style.display = isAuthed ? '' : 'none';
          // Si l'utilisateur se déconnecte pendant que la modale est ouverte, la fermer
          if (!isAuthed && contribOverlay && contribOverlay.getAttribute('aria-hidden') === 'false') {
            closeContrib();
          }
        } catch (_) { /* noop */ }
      };

      // Détection du rôle via table public.profiles (source de vérité)
      let __currentSession = null;
      let __isAdmin = false;
      let __userRole = '';
      const getUserRoleFromProfiles = async (session) => {
        try {
          const userId = session && session.user ? session.user.id : null;
          if (!userId) return '';
          const client = (win.AuthModule && typeof win.AuthModule.getClient === 'function') ? win.AuthModule.getClient() : null;
          if (!client) return '';
          const { data, error } = await client.from('profiles').select('role').eq('id', userId).single();
          if (error) return '';
          return (data && data.role ? String(data.role) : '').toLowerCase();
        } catch (_) { return ''; }
      };
      const updateRoleState = async (session) => {
        __currentSession = session || null;
        __userRole = await getUserRoleFromProfiles(__currentSession);
        __isAdmin = (__userRole === 'admin');
        try { win.__CONTRIB_IS_ADMIN = __isAdmin; } catch(_) {}
        try { win.__CONTRIB_ROLE = __userRole; } catch(_) {}
        applyRoleConstraints();
      };

      // État initial
      try {
        if (win.AuthModule && typeof win.AuthModule.getSession === 'function') {
          win.AuthModule.getSession().then(({ data }) => { applyContribVisibility(data?.session); return updateRoleState(data?.session); }).catch(() => { applyContribVisibility(null); return updateRoleState(null); });
        }
      } catch (_) { /* noop */ }

      // Mises à jour dynamiques
      try {
        if (win.AuthModule && typeof win.AuthModule.onAuthStateChange === 'function') {
          win.AuthModule.onAuthStateChange((_event, session) => { applyContribVisibility(session); updateRoleState(session); });
        }
      } catch (_) { /* noop */ }

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
    // Flag to ensure we load the city code list only at Step 1 and only once
    let citiesPopulatedOnce = false;

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
      `;
      const helper = drawPanelEl.querySelector('.helper');
      if (helper) helper.after(toolbar); else drawPanelEl.prepend(toolbar);
      // Bind actions
      toolbar.querySelector('#btn-draw-line')?.addEventListener('click', () => startManualDraw('line'));
      toolbar.querySelector('#btn-draw-poly')?.addEventListener('click', () => startManualDraw('polygon'));
      toolbar.querySelector('#btn-undo-point')?.addEventListener('click', () => undoManualPoint());
      toolbar.querySelector('#btn-finish')?.addEventListener('click', () => finishManualDraw());
      toolbar.querySelector('#btn-clear-geom')?.addEventListener('click', () => clearManualGeometry());
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

      // Logic of visibility
      const hasFinal = !!drawLayer; // a finalized geometry exists
      // State A: initial (no active draw, no points, no final) OR active but 0 point -> show line/polygon
      const showChoice = (!active && !hasPoints && !hasFinal) || (active && !hasPoints);
      if (btnLine) btnLine.style.display = showChoice ? '' : 'none';
      if (btnPoly) btnPoly.style.display = showChoice ? '' : 'none';

      // State B: editing (after first point) -> show undo/finish/clear
      const showEdit = active && hasPoints;
      if (btnUndo) btnUndo.style.display = showEdit ? '' : 'none';
      if (btnFinish) btnFinish.style.display = showEdit ? '' : 'none';
      if (btnClear) btnClear.style.display = showEdit ? '' : 'none';

      // State C: finalized (not active, has final) -> show only clear
      if (!active && hasFinal) {
        if (btnLine) btnLine.style.display = 'none';
        if (btnPoly) btnPoly.style.display = 'none';
        if (btnUndo) btnUndo.style.display = 'none';
        if (btnFinish) btnFinish.style.display = 'none';
        if (btnClear) btnClear.style.display = '';
      }

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
      // Removed informational status
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
        showToast(`Ajoutez au moins ${minPts} points avant de terminer.`, 'error');
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
      // Removed informational status after finalize
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
      // Removed informational status on cancel
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
      // Removed informational status on clear
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
    const stepTab4 = document.getElementById('contrib-step-4-tab');
    const prevBtn  = document.getElementById('contrib-prev');
    const nextBtn  = document.getElementById('contrib-next');
    const submitBtn = document.getElementById('contrib-submit');

    let currentStep = 1; // 1..4

    function queryStepEls(n) {
      return Array.from(document.querySelectorAll(`.contrib-step-${n}`));
    }

    function setStepHeaderActive(n) {
      const tabs = [stepTab1, stepTab2, stepTab3, stepTab4];
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
      if (nextBtn) nextBtn.style.display = (n < 4) ? '' : 'none';
      if (submitBtn) submitBtn.style.display = (n === 4) ? '' : 'none';
    }

    function showOnlyStep(n) {
      [1,2,3,4].forEach(i => {
        queryStepEls(i).forEach(el => { el.style.display = (i === n) ? '' : 'none'; });
      });
    }

    function validateStep1() {
      const nameEl = document.getElementById('contrib-project-name');
      const catEl  = document.getElementById('contrib-category');
      const hasName = !!(nameEl && nameEl.value && nameEl.value.trim());
      const hasCat  = !!(catEl && catEl.value);
      const ok = hasName && hasCat;
      if (!ok) {
        showToast('Veuillez renseigner le nom et la catégorie.', 'error');
      }
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
        if (!ok) showToast('Veuillez sélectionner un fichier GeoJSON.', 'error');
        return ok;
      }
      // draw mode
      const ok = hasDrawGeometry();
      if (!ok) showToast('Veuillez dessiner une géométrie puis terminer.', 'error');
      return ok;
    }

    function validateStep3() {
      const meta = document.getElementById('contrib-meta')?.value?.trim();
      const desc = document.getElementById('contrib-description')?.value?.trim();
      const ok = !!meta && !!desc;
      if (!ok) showToast('Renseignez Meta et Description avant de continuer.', 'error');
      return ok;
    }

    function canGoToStep(target) {
      if (target <= 1) return true;
      if (target === 2) return validateStep1();
      if (target === 3) return validateStep1() && validateStep2();
      if (target === 4) return validateStep1() && validateStep2() && validateStep3();
      return false;
    }

    function setStep(n, opts = {}) {
      const { force = false } = opts || {};
      if (!force && !canGoToStep(n)) return;
      currentStep = Math.min(4, Math.max(1, n));
      showOnlyStep(currentStep);
      // Re-apply role constraints because showOnlyStep() resets display on step elements
      try { applyRoleConstraints(); } catch(_) {}
      setStepHeaderActive(currentStep);
      updateStepButtons(currentStep);

      // Met à jour uniquement l'état visuel du stepper (classes)
      // La barre de progression dédiée a été retirée pour privilégier le stepper existant

      // Charger le code collectivité UNIQUEMENT à l'étape 1, et une seule fois
      if (currentStep === 1 && !citiesPopulatedOnce) {
        try { populateCities(); citiesPopulatedOnce = true; } catch(_) {}
      }

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
            // Removed informational status when entering draw mode
          } else {
            // Mode fichier: masquer le panneau de dessin et afficher le champ fichier
            if (drawPanelEl) drawPanelEl.style.display = 'none';
            if (fileRowEl) fileRowEl.style.display = '';
          }
        } catch(_) {}
        // En mode édition, précharger la géométrie à l'entrée en étape 2
        (async () => {
          try {
            if (!currentEditId) return;
            if (editGeojsonUrl) {
              return preloadGeometryOnMap(editGeojsonUrl);
            }
            // Fallback: recharger la ligne pour obtenir la dernière geojson_url
            if (win.supabaseService && typeof win.supabaseService.getContributionById === 'function') {
              const row = await win.supabaseService.getContributionById(currentEditId);
              const url = row && row.geojson_url ? row.geojson_url : null;
              if (url) { editGeojsonUrl = url; await preloadGeometryOnMap(url); }
            }
          } catch (_) {}
        })();
      }

      // Charger/rafraîchir les dossiers liés à l'entrée en étape 4 (nom courant du projet)
      if (currentStep === 4) {
        try {
          const nameEl = document.getElementById('contrib-project-name');
          const pname = nameEl && nameEl.value ? nameEl.value.trim() : '';
          clearExistingDossiers();
          if (pname) { renderExistingDossiers(pname); }
        } catch (_) {}
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
    if (stepTab4) stepTab4.addEventListener('click', () => onClickStepTab(4));

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
    let editGeojsonUrl = null; // holds existing geojson url during edit
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

    // —— Official project link (single field, all categories) ——
    const officialInput = document.getElementById('contrib-official-url');

    function slugify(str) {
      return (str || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'geom';
    }

    function setStatus(msg, kind = 'info') {
      // Deprecated: we avoid using inline status area; only show errors as toasts
      if (kind === 'error' && msg) {
        try { showToast(msg, 'error'); } catch(_) {}
      }
      // Do not mutate #contrib-status anymore
      if (statusEl) { try { statusEl.textContent = ''; } catch(_) {} }
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
        try {
          // Force mineOnly for any non-admin before first load
          const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : '';
          const isAdmin = role === 'admin';
          if (!isAdmin) {
            try { if (listMineOnlyEl) { listMineOnlyEl.checked = true; } } catch(_) {}
            listState.mineOnly = true;
          } else {
            listState.mineOnly = !!(listMineOnlyEl && listMineOnlyEl.checked);
          }
          if (listEl && !listState.items.length) listResetAndLoad();
        } catch(_) {}
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
    function applyRoleConstraints() {
      try {
        const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : __userRole;
        const isInvited = role === 'invited';
        const isAdmin = role === 'admin';

        // City field visibility/requirement by role (no forced default value here)
        try {
          const cityInput = document.getElementById('contrib-city');
          const cityRow = cityInput ? cityInput.closest('.form-row') : null;
          const cityLabel = cityRow ? cityRow.querySelector('label[for="contrib-city"]') : null;
          if (cityRow && cityInput) {
            if (isAdmin) {
              cityRow.style.display = '';
              try { cityInput.required = false; } catch(_) {}
              if (cityLabel) cityLabel.textContent = 'Code collectivité';
            } else {
              // Hide for non-admins and remove requirement
              cityRow.style.display = 'none';
              try { cityInput.required = false; } catch(_) {}
            }
          }
        } catch(_) {}

        if (!isAdmin) {
          // Forcer mineOnly côté état et UI pour tous les non-admin
          if (listMineOnlyEl) {
            listMineOnlyEl.checked = true;
            try {
              listMineOnlyEl.checked = true;
              listMineOnlyEl.disabled = true;
              listMineOnlyEl.title = 'Limité à mes contributions (imposé par votre rôle)';
            } catch(_) {}
          }
          try { listState.mineOnly = true; } catch(_) {}
          // If list panel is visible and already loaded, refresh with mineOnly
          try { if (panelList && !panelList.hidden) { listResetAndLoad(); } } catch(_) {}
        } else {
          // Rétablir l'UI si l'utilisateur est admin
          if (listMineOnlyEl) {
            try { listMineOnlyEl.disabled = false; } catch(_) {}
          }
          try { listState.mineOnly = !!(listMineOnlyEl && listMineOnlyEl.checked); } catch(_) {}
        }
      } catch(_) {}
    }
    function setListStatus(msg) {
      if (listStatusEl) listStatusEl.textContent = msg || '';
    }

    // Empty state helpers for contribution list
    function clearEmptyState() {
      try {
        if (!listEl) return;
        const empty = listEl.querySelector('.contrib-empty');
        if (empty) empty.remove();
      } catch(_) {}
    }
    function renderEmptyState() {
      try {
        if (!listEl) return;
        clearEmptyState();
        const wrap = document.createElement('div');
        wrap.className = 'contrib-empty';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;color:#546e7a;text-align:center;gap:14px;min-height:220px;';
        wrap.innerHTML = `
          <div class="empty-illu" aria-hidden="true" style="font-size:42px;color:#90a4ae"><i class="fa-regular fa-folder-open"></i></div>
          <div class="empty-title" style="font-size:18px;font-weight:600;color:#37474f">Aucune contribution pour le moment</div>
          <div class="empty-sub" style="font-size:14px;opacity:0.8;max-width:520px">Créez votre première contribution pour proposer un projet et le visualiser sur la carte.</div>
          <div><button type="button" id="btn-empty-create" class="gp-btn" style="padding:8px 14px;border-radius:10px;background:#1976d2;color:#fff;border:none;cursor:pointer;box-shadow:0 3px 10px rgba(25,118,210,0.3);">Créer une contribution</button></div>
        `;
        if (listSentinel && listSentinel.parentNode === listEl) {
          listEl.insertBefore(wrap, listSentinel);
        } else {
          listEl.appendChild(wrap);
        }
        const btn = wrap.querySelector('#btn-empty-create');
        if (btn) btn.addEventListener('click', () => { try { activateTab('create'); setStep(1, { force: true }); } catch(_) {} });
      } catch(_) {}
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
      const cover = item.cover_url
        ? `<div class="contrib-thumb"><img src="${item.cover_url}" alt="" /></div>`
        : `<div class="contrib-thumb contrib-thumb--placeholder" aria-hidden="true"><i class="fa fa-file-image-o" aria-hidden="true"></i></div>`;
      const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
      el.innerHTML = `
        ${cover}
        <div class="contrib-item-right">
          <div class="contrib-item-main" role="button" tabindex="0">
            <div class="contrib-title-row">
              <span class="contrib-title">${item.project_name || '(sans nom)'} <span class="contrib-category">· ${item.category || ''}</span></span>
              ${item.approved === true
                ? '<span class="badge-approved">Approuvé</span>'
                : '<span class="badge-pending">En attente</span>'}
            </div>
            <div class="contrib-meta">Créé le: ${when}</div>
            ${item.meta ? `<div class="contrib-extra">${item.meta}</div>` : ''}
          </div>
          <div class="contrib-item-actions">
            <button type="button" class="contrib-item-delete" aria-label="Supprimer" title="Supprimer">
              <i class="fa fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `;
      // Runtime enforcement: ensure two-column structure and no horizontal overflow
      try {
        // Clamp parent list horizontal overflow
        const parentList = document.getElementById('contrib-list');
        if (parentList) { parentList.style.overflowX = 'hidden'; parentList.style.maxWidth = '100%'; }

        // Ensure thumb exists as first column
        let thumb = el.querySelector('.contrib-thumb');
        if (!thumb) {
          thumb = document.createElement('div');
          thumb.className = 'contrib-thumb contrib-thumb--placeholder';
          thumb.setAttribute('aria-hidden', 'true');
          thumb.innerHTML = '<i class="fa fa-file-image-o" aria-hidden="true"></i>';
          el.insertBefore(thumb, el.firstChild);
        }

        // Ensure right wrapper exists and contains main + actions
        let right = el.querySelector('.contrib-item-right');
        let main = el.querySelector('.contrib-item-main');
        let actions = el.querySelector('.contrib-item-actions');
        if (!right) {
          right = document.createElement('div');
          right.className = 'contrib-item-right';
          el.appendChild(right);
        }
        if (main && main.parentElement !== right) right.appendChild(main);
        if (actions && actions.parentElement !== right) right.appendChild(actions);

        // Force grid as last resort to beat conflicting rules
        el.style.display = 'grid';
        el.style.gridTemplateColumns = '96px minmax(0, 1fr)';
        el.style.alignItems = 'center';
        el.style.width = '100%';
        el.style.boxSizing = 'border-box';

        // Right column overflow safeguards
        right.style.display = 'flex';
        right.style.flexDirection = 'column';
        right.style.gap = '8px';
        right.style.minWidth = '0';
        right.style.maxWidth = '100%';

        if (main) { main.style.minWidth = '0'; main.style.maxWidth = '100%'; }
      } catch(_) {}
      const main = el.querySelector('.contrib-item-main');
      const delBtn = el.querySelector('.contrib-item-delete');

      // — Admin-only: toggle approved —
      try {
        const isAdmin = !!win.__CONTRIB_IS_ADMIN;
        if (isAdmin) {
          const actions = el.querySelector('.contrib-item-actions');
          if (actions) {
            const wrap = document.createElement('label');
            wrap.className = 'contrib-approve-toggle';
            wrap.title = 'Basculer le statut approuvé';
            wrap.innerHTML = `<input type="checkbox" class="contrib-item-approve" ${item.approved ? 'checked' : ''} aria-label="Approuvé"/> <span>Approuvé</span>`;
            actions.prepend(wrap);
            const checkbox = wrap.querySelector('.contrib-item-approve');
            const badgeApproved = () => el.querySelector('.badge-approved');
            const badgePending = () => el.querySelector('.badge-pending');
            checkbox.addEventListener('change', async () => {
              const newVal = !!checkbox.checked;
              // disable during save
              checkbox.disabled = true;
              try {
                const res = await (win.supabaseService && win.supabaseService.setContributionApproved(item.id, newVal));
                if (res && !res.error) {
                  item.approved = newVal;
                  // Update badges
                  try {
                    const bA = badgeApproved(); const bP = badgePending();
                    if (newVal) {
                      if (!bA && bP) { bP.outerHTML = '<span class="badge-approved">Approuvé</span>'; }
                    } else {
                      if (!bP && bA) { bA.outerHTML = '<span class="badge-pending">En attente</span>'; }
                    }
                  } catch(_) {}
                  showToast('Statut mis à jour.', 'success');
                } else {
                  // revert
                  checkbox.checked = !newVal;
                  showToast("Impossible de mettre à jour l'approbation.", 'error');
                }
              } catch (_) {
                checkbox.checked = !newVal;
                showToast("Erreur lors de la mise à jour de l'approbation.", 'error');
              } finally {
                checkbox.disabled = false;
              }
            });
          }
        }
      } catch(_) {}
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
      clearEmptyState();
      setListStatus('');
      await listLoadMore();
    }

    async function listLoadMore() {
      if (listState.loading || listState.done) return;
      listState.loading = true;
      setListStatus('Chargement…');
      try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
      // Insert skeletons on first page for better perceived performance
      try {
        if (listEl && listState.page === 1) {
          const skelCount = Math.min(6, listState.pageSize);
          for (let i = 0; i < skelCount; i++) {
            const s = document.createElement('div');
            s.className = 'contrib-skel';
            s.innerHTML = `
              <div class="skel-thumb"></div>
              <div>
                <div class="skel-line skel-line--lg"></div>
                <div class="skel-line skel-line--md"></div>
                <div class="skel-line skel-line--sm"></div>
              </div>
            `;
            if (listSentinel && listSentinel.parentNode === listEl) {
              listEl.insertBefore(s, listSentinel);
            } else {
              listEl.appendChild(s);
            }
          }
        }
      } catch(_) {}
      try {
        const { search, category, sortBy, sortDir, page, pageSize, mineOnly } = listState;
        const res = await (win.supabaseService && win.supabaseService.listContributions({
          search, category, page, pageSize, mineOnly, sortBy, sortDir
        }));
        const items = (res && res.items) ? res.items : [];
        // Clear skeletons once data arrives (or not)
        try { if (listEl) listEl.querySelectorAll('.contrib-skel').forEach(n => n.remove()); } catch(_) {}
        if (!items.length) {
          if (page === 1) { setListStatus(''); renderEmptyState(); }
          listState.done = true;
        } else {
          setListStatus('');
          clearEmptyState();
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
        // Ensure skeletons are cleared on error as well
        try { if (listEl) listEl.querySelectorAll('.contrib-skel').forEach(n => n.remove()); } catch(_) {}
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
    // Trigger immediate search on Enter
    if (listSearchEl) listSearchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        listState.search = listSearchEl.value || '';
        listResetAndLoad();
      }
    });
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
      const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : __userRole;
      if (role === 'invited') {
        // Empêcher toute modification et forcer coché
        listMineOnlyEl.checked = true;
        listState.mineOnly = true;
        return; // pas de reset inutile
      }
      listState.mineOnly = !!listMineOnlyEl.checked;
      debouncedReset();
    });

    // Initialize infinite scroll once
    initInfiniteScroll();

    // —— Edit mode helpers ——
    const cancelEditBtn = document.getElementById('contrib-cancel-edit');
    // Hide cancel-edit button permanently; back button handles exit
    if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    const deleteEditBtn = document.getElementById('contrib-delete');
    const coverPreview  = document.getElementById('contrib-cover-preview');

    // —— Cover preview + dropzone + compression ——
    let coverCompressedFile = null;
    (function setupCoverDropzone(){
      try {
        const coverInput = document.getElementById('contrib-cover');
        if (!coverInput || !coverPreview) return;

        // Hide native input like step 2
        try { coverInput.style.display = 'none'; } catch(_){}

        // Build same structure as step 2 dropzone
        coverPreview.classList.add('file-dropzone');
        coverPreview.setAttribute('role', 'button');
        coverPreview.setAttribute('tabindex', '0');
        coverPreview.setAttribute('aria-label', 'Déposer une image de couverture ou cliquer pour choisir');
        coverPreview.innerHTML = `
          <div class="dz-text">
            <div class="dz-title">Déposez votre image de couverture</div>
            <div class="dz-sub">… ou cliquez pour choisir un fichier</div>
          </div>
          <div class="dz-selected">
            <span class="dz-icon" aria-hidden="true"><i class="fa-regular fa-image"></i></span>
            <span class="dz-filename" id="cover-dz-filename"></span>
          </div>
        `;
        const coverDzFilenameEl = coverPreview.querySelector('#cover-dz-filename');
        // Create simple meta text (compression info)
        let dzMeta = coverPreview.querySelector('.dz-meta');
        if (!dzMeta) {
          dzMeta = document.createElement('div');
          dzMeta.className = 'dz-meta';
          dzMeta.style.marginTop = '8px';
          dzMeta.style.fontSize = '12px';
          dzMeta.innerHTML = `<div class="dz-info" aria-live="polite"></div>`;
          coverPreview.appendChild(dzMeta);
        }
        const dzInfo = coverPreview.querySelector('.dz-info');

        // Same interactions as step 2
        const openPicker = () => { try { coverInput.click(); } catch(_){} };
        coverPreview.addEventListener('click', openPicker);
        coverPreview.addEventListener('keydown', (e)=>{
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
        });

        ['dragenter','dragover'].forEach(ev => coverPreview.addEventListener(ev, (e)=>{
          e.preventDefault(); e.stopPropagation(); coverPreview.classList.add('is-dragover');
        }));
        ;['dragleave','dragend','drop'].forEach(ev => coverPreview.addEventListener(ev, (e)=>{
          e.preventDefault(); e.stopPropagation(); coverPreview.classList.remove('is-dragover');
        }));

        coverPreview.addEventListener('drop', (e)=>{
          const dt = e.dataTransfer; if (!dt) return;
          const f = dt.files && dt.files[0]; if (!f) return;
          processCoverFile(f);
        });

        coverInput.addEventListener('change', ()=>{
          const f = coverInput.files && coverInput.files[0];
          if (f) processCoverFile(f);
        });

        function processCoverFile(file){
          try {
            const type = (file.type||'').toLowerCase();
            if (!/image\/(png|jpe?g|webp)/.test(type)) {
              showToast('Image invalide (png, jpg, webp)', 'error');
              return;
            }
            // Create preview first
            const url = URL.createObjectURL(file);
            renderPreview(url, ''); // no filename displayed
            // Compress
            compressImage(file).then((compressed)=>{
              coverCompressedFile = compressed || file;
              try {
                const before = file.size / (1024*1024);
                const after = (coverCompressedFile && coverCompressedFile.size ? coverCompressedFile.size : file.size) / (1024*1024);
                if (dzInfo) dzInfo.textContent = `image compressée de ${before.toFixed(2)} Mo à ${after.toFixed(2)} Mo`;
              } catch(_){}
            }).catch(()=>{ coverCompressedFile = file; });
          } catch (e) {
            console.warn('[contrib] processCoverFile error', e);
            showToast("Impossible de lire l'image.", 'error');
          }
        }

        function renderPreview(objectUrl, filename){
          try {
            // Switch to selected state and show filename + thumbnail
            if (coverDzFilenameEl) {
              try { coverDzFilenameEl.textContent = ''; } catch(_){ }
            }
            coverPreview.classList.add('has-file');
            // Thumbnail
            let thumb = coverPreview.querySelector('img.dz-thumb');
            if (!thumb) {
              thumb = document.createElement('img');
              thumb.className = 'dz-thumb';
              thumb.alt = 'Aperçu de la cover';
              thumb.style.maxHeight = '140px';
              thumb.style.maxWidth = '100%';
              thumb.style.borderRadius = '10px';
              thumb.style.boxShadow = '0 6px 16px rgba(0,0,0,0.18)';
              thumb.style.transform = 'rotate(-0.75deg)';
              thumb.style.transition = 'transform 0.2s ease';
              // place thumbnail inside dz-selected, replacing icon
              const sel = coverPreview.querySelector('.dz-selected');
              if (sel) {
                const icon = sel.querySelector('.dz-icon');
                if (icon) { try { icon.remove(); } catch(_){} }
                sel.prepend(thumb);
              } else {
                coverPreview.appendChild(thumb);
              }
            }
            thumb.src = objectUrl;
          } catch(_){ }
        }

        // Expose for edit-mode prefill
        try { win.__contribRenderCoverPreview = (u, n) => renderPreview(u, n); } catch(_){}

        function compressImage(file){
          return new Promise((resolve)=>{
            try {
              const img = new Image();
              img.onload = () => {
                try {
                  const maxDim = 2000; // milder resize
                  let { width, height } = img;
                  const ratio = Math.min(1, maxDim / Math.max(width, height));
                  const canvas = document.createElement('canvas');
                  canvas.width = Math.round(width * ratio);
                  canvas.height = Math.round(height * ratio);
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  const preferType = 'image/webp';
                  const fallbackType = 'image/jpeg';
                  const quality = 0.9; // milder compression
                  const toBlobType = (canvas.toDataURL(preferType).indexOf('data:image/webp') === 0) ? preferType : fallbackType;
                  canvas.toBlob((blob)=>{
                    if (!blob) { resolve(file); return; }
                    try {
                      const ext = toBlobType === 'image/webp' ? 'webp' : 'jpg';
                      const name = (file.name || 'cover').replace(/\.[^.]+$/, '') + '.' + ext;
                      const compressed = new File([blob], name, { type: toBlobType, lastModified: Date.now() });
                      resolve(compressed);
                    } catch(_) { resolve(file); }
                  }, toBlobType, quality);
                } catch(_) { resolve(file); }
              };
              img.onerror = () => resolve(file);
              img.src = URL.createObjectURL(file);
            } catch(_) { resolve(file); }
          });
        }
      } catch (e) {
        console.warn('[contrib] setupCoverDropzone error:', e);
      }
    })();

    // —— Meta/Description char limits ——
    (function setupCharLimits(){
      const META_MAX = 160;
      const DESC_MAX = 500;

      initLimit('contrib-meta', META_MAX);
      initLimit('contrib-description', DESC_MAX);

      function initLimit(fieldId, max) {
        const el = document.getElementById(fieldId);
        if (!el) return;
        // Overlay at bottom-right of the field (avoid overlapping helper <small>)
        const row = el.closest('.form-row') || el.parentElement;
        if (row && !row.style.position) row.style.position = 'relative';
        const help = (row ? row.querySelector('small') : null);

        // container for tiny progress (top) + counter (below), aligned right
        const wrap = document.createElement('div');
        wrap.className = 'char-hud';
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'flex-end';
        wrap.style.gap = '4px';
        wrap.style.position = 'absolute';
        wrap.style.right = '8px';
        wrap.style.bottom = help ? '28px' : '6px';
        wrap.style.pointerEvents = 'none';

        const progOuter = document.createElement('div');
        progOuter.className = 'char-prog';
        progOuter.style.height = '2px';
        progOuter.style.width = '80px';
        progOuter.style.borderRadius = '999px';
        progOuter.style.background = 'rgba(0,0,0,0.08)';
        progOuter.style.position = 'relative';

        const progInner = document.createElement('div');
        progInner.className = 'char-prog-fill';
        progInner.style.height = '100%';
        progInner.style.width = '0%';
        progInner.style.borderRadius = '999px';
        progInner.style.background = 'rgba(33,150,243,0.6)';
        progInner.style.transition = 'width 0.1s linear';
        progOuter.appendChild(progInner);

        const counter = document.createElement('div');
        counter.className = 'char-counter';
        counter.style.fontSize = '11px';
        counter.style.opacity = '0.65';
        counter.id = `${fieldId}-counter`;

        wrap.appendChild(progOuter);
        wrap.appendChild(counter);
        if (row) { row.appendChild(wrap); } else { el.insertAdjacentElement('afterend', wrap); }
        try { el.setAttribute('aria-describedby', counter.id); } catch(_){}

        const clamp = () => {
          let v = el.value || '';
          if (v.length > max) {
            v = v.slice(0, max);
            el.value = v;
          }
          const used = v.length;
          const pct = Math.max(0, Math.min(100, (used / max) * 100));
          const remaining = Math.max(0, max - used);
          counter.textContent = `${remaining}`;
          progInner.style.width = `${pct}%`;
        };

        // init + bind
        clamp();
        el.addEventListener('input', clamp);
        el.addEventListener('blur', clamp);
      }
    })();

    function setEditUI(on) {
      const submitBtn = document.getElementById('contrib-submit');
      const nameEl = document.getElementById('contrib-project-name');
      if (submitBtn) submitBtn.querySelector('span')?.replaceChildren(document.createTextNode(on ? 'Enregistrer' : 'Envoyer'));
      // cancelEditBtn hidden globally (handled by Back button)
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
      // Pré-remplir le lien officiel si présent
      try {
        if (officialInput) officialInput.value = row.official_url || '';
      } catch(_) {}
      if (citySel && row && row.ville) {
        try {
          const v = String(row.ville).trim();
          // Si l'option n'existe pas encore (villes non chargées), l'ajouter de manière temporaire
          if (!Array.from(citySel.options).some(opt => String(opt.value) === v)) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            citySel.appendChild(opt);
          }
          citySel.value = v;
        } catch(_) {}
      }
      if (metaEl) metaEl.value = row.meta || '';
      if (descEl) descEl.value = row.description || '';
      if (coverPreview) {
        try {
          if (row.cover_url && typeof win.__contribRenderCoverPreview === 'function') {
            win.__contribRenderCoverPreview(row.cover_url, 'cover.jpg');
          } else if (row.cover_url) {
            // Fallback minimal preview if renderer not yet ready
            coverPreview.innerHTML = `<img src="${row.cover_url}" alt="Aperçu cover" style="max-height:80px;border-radius:6px;"/>`;
          } else {
            coverPreview.classList.remove('has-file');
            const fn = coverPreview.querySelector('#cover-dz-filename');
            if (fn) fn.textContent = '';
            const sel = coverPreview.querySelector('.dz-selected');
            if (sel && !sel.querySelector('.dz-icon')) {
              const icon = document.createElement('span');
              icon.className = 'dz-icon';
              icon.setAttribute('aria-hidden','true');
              icon.innerHTML = '<i class="fa-regular fa-image"></i>';
              sel.prepend(icon);
            }
            const thumb = coverPreview.querySelector('img.dz-thumb');
            if (thumb) thumb.remove();
          }
        } catch(_){}
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
      editGeojsonUrl = row && row.geojson_url ? row.geojson_url : null;
      prefillForm(row);
      setStatus('Mode édition. Modifiez et cliquez sur Enregistrer.');
      setEditUI(true);
      // En modification, démarrer explicitement au début du stepper (étape 1)
      try { setStep(1, { force: true }); } catch(_) {}
      // Les dossiers liés seront chargés dynamiquement à l'entrée en étape 4
    }

    function exitEditMode() {
      currentEditId = null;
      editGeojsonUrl = null;
      try { form.reset(); } catch(_) {}
      if (coverPreview) coverPreview.innerHTML = '';
      setEditUI(false);
      setStatus('');
      try { clearAllDrawings(); } catch(_) {}
      try { setGeomMode('file'); } catch(_) {}
      try { clearExistingDossiers(); } catch(_) {}
    }

    // cancelEditBtn removed; Back button already exits edit mode

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
        // Important: wait for the map to be initialized before adding layers
        try { await initDrawMap(); } catch(_) {}
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
      row.className = 'doc-card is-idle';
      row.innerHTML = `
        <div class="doc-card__header">
          <input type="text" class="doc-title" placeholder="Titre du document PDF" />
        </div>
        <div class="doc-card__body">
          <input type="file" class="doc-file" accept="application/pdf" style="display:none" />
          <div class="file-dropzone doc-dropzone" role="button" tabindex="0" aria-label="Déposer un fichier PDF ou cliquer pour choisir">
            <div class="dz-text">
              <div class="dz-title">Déposez votre PDF</div>
              <div class="dz-sub">… ou cliquez pour choisir un fichier</div>
            </div>
            <div class="dz-selected">
              <span class="dz-icon" aria-hidden="true"><i class="fa-regular fa-file-pdf"></i></span>
              <span class="dz-filename doc-filename"></span>
            </div>
          </div>
        </div>
        <div class="doc-card__footer">
          <span class="doc-status" aria-live="polite"></span>
          <button type="button" class="doc-remove gp-btn gp-btn-ghost" aria-label="Supprimer cette pièce">Supprimer</button>
        </div>
      `;
      const removeBtn = row.querySelector('.doc-remove');
      const fileInput = row.querySelector('.doc-file');
      const fileNameEl = row.querySelector('.doc-filename');
      const dropzoneEl = row.querySelector('.doc-dropzone');
      // Remove
      if (removeBtn) removeBtn.addEventListener('click', () => row.remove());
      // File selection via dialog
      function onPicked() {
        const f = fileInput.files && fileInput.files[0];
        fileNameEl.textContent = f ? f.name : '';
        row.classList.toggle('has-file', !!f);
        dropzoneEl?.classList.toggle('has-file', !!f);
      }
      if (fileInput) fileInput.addEventListener('change', onPicked);
      // Dropzone interactions
      if (dropzoneEl) {
        const openPicker = () => { fileInput?.click(); };
        dropzoneEl.addEventListener('click', openPicker);
        dropzoneEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
        });
        dropzoneEl.addEventListener('dragover', (e) => { e.preventDefault(); dropzoneEl.classList.add('is-dragover'); });
        dropzoneEl.addEventListener('dragenter', (e) => { e.preventDefault(); dropzoneEl.classList.add('is-dragover'); });
        dropzoneEl.addEventListener('dragleave', () => dropzoneEl.classList.remove('is-dragover'));
        dropzoneEl.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzoneEl.classList.remove('is-dragover');
          const dt = e.dataTransfer; if (!dt) return;
          const files = dt.files; if (!files || !files.length) return;
          if (fileInput && !fileInput.disabled) { fileInput.files = files; fileInput.dispatchEvent(new Event('change', { bubbles:true })); }
        });
      }
      return row;
    }

    function collectDocs() {
      if (!docsFieldset) return [];
      const rows = docsFieldset.querySelectorAll('.doc-card');
      const out = [];
      rows.forEach((row) => {
        const title = row.querySelector('.doc-title')?.value?.trim();
        const file = row.querySelector('.doc-file')?.files?.[0] || null;
        if (title && file) out.push({ title, file });
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
        // Grille conteneur pour cards
        const grid = document.createElement('div');
        grid.className = 'cards-grid existing-docs-grid';
        existingDocsEl.appendChild(grid);
        // État chargement
        const load = document.createElement('div');
        load.className = 'cards-loading';
        load.textContent = 'Recherche des dossiers liés…';
        grid.appendChild(load);
        if (!win.supabaseService || typeof win.supabaseService.getConsultationDossiersByProject !== 'function') return;
        const dossiers = await win.supabaseService.getConsultationDossiersByProject(projectName);
        try { load.remove(); } catch(_) {}
        if (!Array.isArray(dossiers) || dossiers.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'card-empty-state';
          empty.textContent = 'Aucun dossier lié trouvé pour ce projet.';
          grid.appendChild(empty);
          return;
        }
        const uniq = new Map();
        dossiers.forEach(d => {
          if (d && d.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d);
        });
        const docs = Array.from(uniq.values());
        if (!docs.length) {
          const empty = document.createElement('div');
          empty.className = 'card-empty-state';
          empty.textContent = 'Aucun dossier lié trouvé pour ce projet.';
          grid.appendChild(empty);
          return;
        }
        // Build cards with actions
        docs.forEach(d => {
          const card = document.createElement('article');
          card.className = 'existing-doc-card';
          card.dataset.id = d.id != null ? String(d.id) : '';
          card.dataset.url = d.pdf_url || '';
          const header = document.createElement('div');
          header.className = 'existing-doc-card__header';
          const icon = document.createElement('span');
          icon.className = 'doc-icon';
          icon.innerHTML = '<i class="fa-regular fa-file-pdf" aria-hidden="true"></i>';
          const title = document.createElement('h3');
          title.className = 'existing-doc-card__title';
          const link = document.createElement('a');
          link.href = d.pdf_url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = d.title || d.pdf_url;
          // Avoid toggling actions when clicking the link
          link.addEventListener('click', (e) => { e.stopPropagation(); });
          title.appendChild(link);
          header.appendChild(icon);
          header.appendChild(title);
          card.appendChild(header);

          const actions = document.createElement('div');
          actions.className = 'existing-doc-card__actions';
          // Icon-only buttons always visible
          const btnPreview = document.createElement('button');
          btnPreview.type = 'button';
          btnPreview.className = 'icon-btn icon-btn--view';
          btnPreview.setAttribute('aria-label', 'Prévisualiser');
          btnPreview.innerHTML = '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
          const btnEdit = document.createElement('button');
          btnEdit.type = 'button';
          btnEdit.className = 'icon-btn icon-btn--edit';
          btnEdit.setAttribute('aria-label', 'Modifier');
          btnEdit.innerHTML = '<i class="fa-regular fa-pen-to-square" aria-hidden="true"></i>';
          const btnDelete = document.createElement('button');
          btnDelete.type = 'button';
          btnDelete.className = 'icon-btn icon-btn--delete';
          btnDelete.setAttribute('aria-label', 'Supprimer');
          btnDelete.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
          actions.appendChild(btnPreview);
          actions.appendChild(btnEdit);
          actions.appendChild(btnDelete);
          card.appendChild(actions);

          btnPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = d.pdf_url;
            if (url) window.open(url, '_blank', 'noopener');
          });

          btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            // Inline simple editor: edit URL or upload a new PDF
            let editor = card.querySelector('.inline-edit-url');
            if (editor) { editor.remove(); }
            editor = document.createElement('div');
            editor.className = 'inline-edit-url';
            const currentUrl = d.pdf_url || '';
            editor.innerHTML = `
              <div class="inline-edit-url__row">
                <input type="url" class="edit-url-input" placeholder="https://…" value="${currentUrl.replace(/"/g, '&quot;')}">
              </div>
              <button type="button" class="gp-btn gp-btn--secondary pick-pdf inline-edit-url__full">Choisir PDF…</button>
              <div class="inline-edit-url__actions">
                <button type="button" class="gp-btn gp-btn-ghost cancel-edit">Annuler</button>
                <button type="button" class="gp-btn gp-btn--primary save-url">Enregistrer</button>
              </div>
              <input type="file" class="hidden-pdf" accept="application/pdf" style="display:none" />
              <div class="inline-edit-url__status" aria-live="polite"></div>
            `;
            card.appendChild(editor);

            const input = editor.querySelector('.edit-url-input');
            const statusEl = editor.querySelector('.inline-edit-url__status');
            const hiddenPicker = editor.querySelector('.hidden-pdf');
            const projectName = document.getElementById('contrib-project-name')?.value?.trim() || 'projet';

            const setLoading = (on) => { editor.classList.toggle('is-loading', !!on); };
            const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg || ''; };

            editor.querySelector('.cancel-edit')?.addEventListener('click', (ev) => {
              ev.stopPropagation(); editor.remove();
            });

            editor.querySelector('.save-url')?.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              try {
                if (!win.supabaseService || typeof win.supabaseService.updateConsultationDossierUrl !== 'function') return;
                const newUrl = input.value.trim();
                if (!newUrl) { setStatus('URL invalide.'); return; }
                setLoading(true); setStatus('Mise à jour…');
                const ok = await win.supabaseService.updateConsultationDossierUrl(d.id, newUrl);
                setLoading(false);
                if (ok) {
                  d.pdf_url = newUrl;
                  link.href = newUrl;
                  // On garde le texte (titre), seul le lien change
                  setStatus('URL mise à jour.');
                  setTimeout(() => editor.remove(), 800);
                } else {
                  setStatus('Échec de la mise à jour.');
                }
              } catch (_) {
                setLoading(false); setStatus('Erreur lors de la mise à jour.');
              }
            });

            editor.querySelector('.pick-pdf')?.addEventListener('click', (ev) => {
              ev.stopPropagation(); hiddenPicker?.click();
            });

            hiddenPicker?.addEventListener('change', async () => {
              const f = hiddenPicker.files && hiddenPicker.files[0];
              if (!f) return;
              try {
                if (!win.supabaseService || typeof win.supabaseService.uploadConsultationPdf !== 'function' || typeof win.supabaseService.updateConsultationDossierUrl !== 'function') return;
                setLoading(true); setStatus('Téléversement du PDF…');
                const publicUrl = await win.supabaseService.uploadConsultationPdf(f, projectName);
                setStatus('Mise à jour du lien…');
                const ok = await win.supabaseService.updateConsultationDossierUrl(d.id, publicUrl);
                setLoading(false);
                if (ok) {
                  d.pdf_url = publicUrl;
                  link.href = publicUrl;
                  setStatus('PDF mis à jour.');
                  setTimeout(() => editor.remove(), 800);
                } else {
                  setStatus('Échec de la mise à jour.');
                }
              } catch (_) {
                setLoading(false); setStatus('Erreur pendant le téléversement.');
              }
            });
          });

          btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            // Inline confirmation UI
            let confirmBar = card.querySelector('.inline-confirm');
            if (confirmBar) { confirmBar.remove(); }
            confirmBar = document.createElement('div');
            confirmBar.className = 'inline-confirm';
            confirmBar.innerHTML = `
              <span class="inline-confirm__text">Supprimer ce document ?</span>
              <div class="inline-confirm__actions">
                <button type="button" class="gp-btn gp-btn--danger confirm-delete">Supprimer</button>
                <button type="button" class="gp-btn gp-btn--secondary cancel-delete">Annuler</button>
              </div>
            `;
            card.appendChild(confirmBar);

            const onCancel = (ev) => { ev.stopPropagation(); confirmBar.remove(); };
            const onConfirm = async (ev) => {
              ev.stopPropagation();
              try {
                if (!win.supabaseService || typeof win.supabaseService.deleteConsultationDossier !== 'function') return;
                // Optional: loading state
                confirmBar.classList.add('is-loading');
                const ok = await win.supabaseService.deleteConsultationDossier(d.id);
                if (ok) {
                  card.remove();
                } else {
                  confirmBar.classList.remove('is-loading');
                  confirmBar.querySelector('.inline-confirm__text').textContent = 'Échec de la suppression.';
                }
              } catch (_) {
                confirmBar.classList.remove('is-loading');
                confirmBar.querySelector('.inline-confirm__text').textContent = 'Erreur lors de la suppression.';
              }
            };

            confirmBar.querySelector('.cancel-delete')?.addEventListener('click', onCancel);
            confirmBar.querySelector('.confirm-delete')?.addEventListener('click', onConfirm);
          });

          grid.appendChild(card);
        });
      } catch (e) {
        console.warn('[contrib] renderExistingDossiers error:', e);
        try {
          // Afficher un état d'erreur discret
          if (existingDocsEl) {
            const err = document.createElement('div');
            err.className = 'card-error-state';
            err.textContent = 'Impossible de charger les dossiers liés pour le moment.';
            existingDocsEl.appendChild(err);
          }
        } catch(_) {}
      }
    }

    // Helper: ensure docs fieldset hosts a grid and an Add CTA card
    function ensureDocsGrid() {
      if (!docsFieldset) return null;
      let grid = docsFieldset.querySelector('.cards-grid.docs-grid');
      if (!grid) {
        grid = document.createElement('div');
        grid.className = 'cards-grid docs-grid';
        // Move any existing .doc-card children into the grid
        const existing = Array.from(docsFieldset.querySelectorAll(':scope > .doc-card'));
        existing.forEach(el => grid.appendChild(el));
        // Place grid AFTER existing docs block if present, else append at end
        const existingBlock = docsFieldset.querySelector('#contrib-existing-docs');
        if (existingBlock && existingBlock.parentNode === docsFieldset) {
          existingBlock.insertAdjacentElement('afterend', grid);
        } else {
          docsFieldset.appendChild(grid);
        }
      }
      return grid;
    }

    function createAddDocCtaCard() {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'cta-card add-doc-cta';
      cta.innerHTML = '<span class="cta-icon"><i class="fa-solid fa-plus" aria-hidden="true"></i></span><span class="cta-label">Ajouter un document</span>';
      cta.addEventListener('click', () => {
        const grid = ensureDocsGrid();
        if (!grid) return;
        const row = createDocRow();
        // Insert before CTA itself
        grid.insertBefore(row, cta);
        // Focus the newly added title field
        row.querySelector('.doc-title')?.focus();
      });
      return cta;
    }

    // Initialize Add Document CTA behavior
    if (docsFieldset) {
      const grid = ensureDocsGrid();
      if (grid) {
        // Ensure CTA is present at the end of the grid
        const existingCta = grid.querySelector('.add-doc-cta');
        if (!existingCta) grid.appendChild(createAddDocCtaCard());
      }
    }

    if (addDocBtn && docsFieldset) {
      // Keep backward-compat: clicking legacy button adds a card before it
      addDocBtn.addEventListener('click', () => {
        const grid = ensureDocsGrid();
        const row = createDocRow();
        if (grid) {
          const cta = grid.querySelector('.add-doc-cta');
          if (cta) grid.insertBefore(row, cta); else grid.appendChild(row);
        } else {
          docsFieldset.insertBefore(row, addDocBtn);
        }
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
      const officialUrl = document.getElementById('contrib-official-url')?.value?.trim();
      const meta = document.getElementById('contrib-meta')?.value?.trim();
      const description = document.getElementById('contrib-description')?.value?.trim();
      const mdTextRaw = document.getElementById('contrib-markdown')?.value || '';
      const geomMode = (function(){
        const r = geomModeRadios && geomModeRadios.length ? Array.from(geomModeRadios).find(x => x.checked) : null;
        return r ? r.value : 'file';
      })();

      const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : __userRole;
      if (!projectName || !category) {
        setStatus('Veuillez renseigner le nom et la catégorie.', 'error');
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

      // Prefer compressed cover produced by setupCoverDropzone
      const coverFile = (typeof coverCompressedFile !== 'undefined' && coverCompressedFile)
        ? coverCompressedFile
        : (coverInput && coverInput.files && coverInput.files[0] ? coverInput.files[0] : null);

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
              const cityToCreate = (role === 'admin') ? (city || null) : null;
              rowId = await win.supabaseService.createContributionRow(
                projectName,
                category,
                cityToCreate,
                meta,
                description,
                officialUrl
              );
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

        // 2) Optional consultation dossiers (upload PDFs then insert URLs)
        const docEntries = collectDocs();
        if (docEntries.length) {
          const uploaded = [];
          for (const d of docEntries) {
            try {
              const url = await (win.supabaseService && win.supabaseService.uploadConsultationPdfToStorage(d.file, category, projectName, rowId));
              if (url) uploaded.push({ title: d.title, pdf_url: url });
            } catch (pdfErr) {
              console.warn('[contrib] upload PDF error:', pdfErr);
            }
          }
          if (uploaded.length) {
            await win.supabaseService.insertConsultationDossiers(projectName, category, uploaded);
          }
        }

        // 3) Patch core fields (edit or create) — inclut official_url
        try {
          await (win.supabaseService && win.supabaseService.updateContribution(rowId, {
            project_name: projectName,
            category: category,
            ville: (role === 'invited' ? null : (role === 'admin' ? (city || null) : null)),
            official_url: officialUrl || null,
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

    // Populate city selector from DB and default to active city (called ONLY at Step 1)
    async function populateCities() {
      try {
        if (!cityEl || !win.supabaseService) return;
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
        // Append fetched cities; keep existing default from HTML ("Aucun")
        const cityOptions = (Array.isArray(cities) ? cities : []).map(c => `<option value="${c}">${c}</option>`).join('');
        if (cityOptions) cityEl.insertAdjacentHTML('beforeend', cityOptions);
      } catch (err) {
        console.warn('[contrib] populateCities error:', err);
        if (cityEl && !cityEl.options.length) {
          cityEl.innerHTML = '<option value="" selected>Aucun</option>';
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

    // Ne pas charger les villes ici: cela sera fait uniquement à l'étape 1 via setStep()

    // Ensure tab default is Create only if landing is not visible
    // Ne pas écraser l'écran d'accueil (Créer / Modifier)
    try {
      const landingVisible = landingEl && landingEl.hidden === false;
      if (!landingVisible) {
        activateTab('create');
      }
    } catch(_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContrib);
  } else {
    setupContrib();
  }
})(window);
