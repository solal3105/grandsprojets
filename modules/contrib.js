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
    let drawLayer = null;      // finalized geometry layer
    let drawActive = false;    // whether we are currently capturing points
    let drawType = null;       // 'LineString' | 'Polygon'
    let tempLine = null;       // preview line while drawing
    let tempPoly = null;       // preview polygon while drawing
    let drawPoints = [];       // collected LatLng points during drawing

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
      contribOverlay.addEventListener('click', (e) => {
        if (e.target === contribOverlay) {
          closeContrib();
        }
      });
    }

    // —— Minimal contribution form wiring ——
    const form = document.getElementById('contrib-form');
    const statusEl = document.getElementById('contrib-status');
    const addDocBtn = document.getElementById('contrib-doc-add');
    const docsFieldset = document.getElementById('contrib-docs');

    // Geometry input UI elements
    const geomModeFieldset = document.getElementById('contrib-geom-mode');
    const geomModeRadios = geomModeFieldset ? geomModeFieldset.querySelectorAll('input[name="contrib-geom-mode"]') : [];
    const fileRowEl = document.getElementById('contrib-file-row');
    const drawPanelEl = document.getElementById('contrib-draw-panel');
    const drawMapContainerId = 'contrib-draw-map';
    const drawBtnLine = document.getElementById('draw-line');
    const drawBtnPolygon = document.getElementById('draw-polygon');
    const drawBtnUndo = document.getElementById('draw-undo');
    const drawBtnFinish = document.getElementById('draw-finish');
    const drawBtnClear = document.getElementById('draw-clear');

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

    function initDrawMap() {
      if (drawMap || !drawPanelEl) return;
      try {
        const container = document.getElementById(drawMapContainerId);
        if (!container) return;
        // Initialise Leaflet map
        drawMap = L.map(drawMapContainerId).setView([45.75, 4.85], 12);
        // Choose basemap similar to main map
        const bmList = win.basemaps || [];
        const defaultBm = bmList.find(b => b.default === true) || bmList[0];
        let baseUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        let attribution = '&copy; OpenStreetMap contributors';
        if (defaultBm && defaultBm.url) {
          baseUrl = defaultBm.url;
          attribution = defaultBm.attribution || attribution;
        }
        L.tileLayer(baseUrl, { attribution }).addTo(drawMap);

        // Map click to add points while drawing
        drawMap.on('click', (e) => {
          if (!drawActive || !drawType) return;
          drawPoints.push(e.latlng);
          if (drawType === 'LineString') {
            if (!tempLine) {
              tempLine = L.polyline(drawPoints, { color: '#ff5722', weight: 4, dashArray: '4,4' }).addTo(drawMap);
            } else {
              tempLine.setLatLngs(drawPoints);
            }
          } else if (drawType === 'Polygon') {
            if (!tempPoly) {
              tempPoly = L.polygon(drawPoints, { color: '#ff5722', weight: 3, dashArray: '4,4', fillOpacity: 0.2 }).addTo(drawMap);
            } else {
              tempPoly.setLatLngs([drawPoints]);
            }
          }
        });
      } catch (e) {
        console.warn('[contrib] initDrawMap error:', e);
      }
    }

    function setGeomMode(mode) {
      const fileInput = document.getElementById('contrib-geojson');
      if (mode === 'draw') {
        if (fileRowEl) fileRowEl.style.display = 'none';
        if (fileInput) {
          fileInput.required = false;
          fileInput.disabled = true;
          try { fileInput.value = ''; } catch(_) {}
        }
        if (drawPanelEl) drawPanelEl.style.display = '';
        initDrawMap();
        setTimeout(() => { try { if (drawMap) drawMap.invalidateSize(); } catch(_){} }, 50);
        // Démarrer automatiquement le mode dessin (ligne par défaut)
        resetTemp();
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        drawActive = true;
        drawType = 'LineString';
        try { if (drawMap) drawMap.getContainer().style.cursor = 'crosshair'; } catch(_){ }
        setStatus('Mode dessin actif (ligne). Cliquez sur la carte pour ajouter des points.');
      } else {
        if (fileRowEl) fileRowEl.style.display = '';
        if (fileInput) { fileInput.required = true; fileInput.disabled = false; }
        if (drawPanelEl) drawPanelEl.style.display = 'none';
        // Revenir au mode fichier doit nettoyer tout dessin en cours
        try { clearAllDrawings(); } catch(_) {}
      }
    }

    function resetTemp() {
      drawPoints = [];
      if (tempLine) { try { drawMap.removeLayer(tempLine); } catch(_) {} tempLine = null; }
      if (tempPoly) { try { drawMap.removeLayer(tempPoly); } catch(_) {} tempPoly = null; }
    }

    function clearAllDrawings() {
      resetTemp();
      if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
      drawActive = false;
      drawType = null;
      try { if (drawMap) drawMap.getContainer().style.cursor = ''; } catch(_){}
    }

    // Buttons handlers
    if (drawBtnLine) {
      drawBtnLine.addEventListener('click', () => {
        resetTemp();
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        drawActive = true;
        drawType = 'LineString';
        try { if (drawMap) drawMap.getContainer().style.cursor = 'crosshair'; } catch(_){}
        setStatus('Mode dessin: ligne. Cliquez sur la carte pour ajouter des points.');
      });
    }
    if (drawBtnPolygon) {
      drawBtnPolygon.addEventListener('click', () => {
        resetTemp();
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        drawActive = true;
        drawType = 'Polygon';
        try { if (drawMap) drawMap.getContainer().style.cursor = 'crosshair'; } catch(_){}
        setStatus('Mode dessin: polygone. Cliquez sur la carte pour ajouter des points.');
      });
    }
    if (drawBtnUndo) {
      drawBtnUndo.addEventListener('click', () => {
        if (!drawPoints.length) return;
        drawPoints.pop();
        if (drawType === 'LineString' && tempLine) tempLine.setLatLngs(drawPoints);
        if (drawType === 'Polygon' && tempPoly) tempPoly.setLatLngs([drawPoints]);
      });
    }
    if (drawBtnFinish) {
      drawBtnFinish.addEventListener('click', () => {
        if (!drawType) return;
        if (drawType === 'LineString' && drawPoints.length < 2) {
          setStatus('Ajoutez au moins 2 points pour une ligne.', 'error');
          return;
        }
        if (drawType === 'Polygon' && drawPoints.length < 3) {
          setStatus('Ajoutez au moins 3 points pour un polygone.', 'error');
          return;
        }
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        if (drawType === 'LineString') {
          drawLayer = L.polyline(drawPoints, { color: '#1976d2', weight: 4 }).addTo(drawMap);
        } else {
          drawLayer = L.polygon(drawPoints, { color: '#1976d2', weight: 3, fillOpacity: 0.2 }).addTo(drawMap);
        }
        try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_){}
        resetTemp();
        drawActive = false;
        drawType = null;
        try { if (drawMap) drawMap.getContainer().style.cursor = ''; } catch(_){}
        setStatus('Géométrie finalisée. Vous pouvez soumettre la contribution.', 'success');
      });
    }
    if (drawBtnClear) {
      drawBtnClear.addEventListener('click', () => {
        clearAllDrawings();
        setStatus('Dessin effacé.');
      });
    }

    // Mode change listeners
    if (geomModeRadios && geomModeRadios.length) {
      geomModeRadios.forEach(r => {
        r.addEventListener('change', () => {
          const checked = Array.from(geomModeRadios).find(x => x.checked)?.value || 'file';
          setGeomMode(checked);
        });
      });
      // Initialize UI state
      const initialMode = Array.from(geomModeRadios).find(x => x.checked)?.value || 'file';
      setGeomMode(initialMode);
    }

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
      const grandlyonUrl = document.getElementById('contrib-grandlyon-url')?.value?.trim();
      const sytralUrl = document.getElementById('contrib-sytral-url')?.value?.trim();
      const meta = document.getElementById('contrib-meta')?.value?.trim();
      const description = document.getElementById('contrib-description')?.value?.trim();
      const mdTextRaw = document.getElementById('contrib-markdown')?.value || '';
      const geomMode = (function(){
        const r = geomModeRadios && geomModeRadios.length ? Array.from(geomModeRadios).find(x => x.checked) : null;
        return r ? r.value : 'file';
      })();

      if (!projectName || !category) {
        setStatus('Veuillez renseigner le nom et la catégorie.', 'error');
        return;
      }

      let fileForUpload = null;
      if (geomMode === 'file') {
        if (!fileInput || !fileInput.files?.length) {
          setStatus('Veuillez sélectionner un fichier GeoJSON.', 'error');
          return;
        }
        const file = fileInput.files[0];
        const nameLower = (file.name || '').toLowerCase();
        if (!nameLower.endsWith('.geojson') && !(file.type || '').includes('json')) {
          setStatus('Le fichier doit être un GeoJSON (.geojson ou JSON valide).', 'error');
          return;
        }
        fileForUpload = file;
      } else if (geomMode === 'draw') {
        if (!drawLayer) {
          setStatus('Veuillez dessiner une géométrie (ligne ou polygone) avant de soumettre.', 'error');
          return;
        }
        try {
          const feature = drawLayer.toGeoJSON();
          const feat = feature.type === 'Feature' ? feature : { type: 'Feature', properties: {}, geometry: feature };
          const fc = { type: 'FeatureCollection', features: [feat] };
          const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
          try {
            fileForUpload = new File([blob], `${slugify(projectName)}.geojson`, { type: 'application/geo+json' });
          } catch (_) {
            // Older browsers may not support File constructor; fallback to Blob
            fileForUpload = blob;
          }
        } catch (gerr) {
          setStatus('Impossible de convertir le dessin en GeoJSON.', 'error');
          return;
        }
      } else {
        setStatus('Mode de saisie inconnu.', 'error');
        return;
      }

      const coverFile = coverInput && coverInput.files && coverInput.files[0] ? coverInput.files[0] : null;

      setStatus('Envoi en cours…');
      if (submitBtn) submitBtn.disabled = true;

      try {
        // Ensure authenticated session
        const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
        if (!session || !session.user) return; // redirected

        // 0) Create a single DB row for this contribution (so both URLs land in the same row)
        let rowId = null;
        try {
          if (win.supabaseService && typeof win.supabaseService.createContributionRow === 'function') {
            rowId = await win.supabaseService.createContributionRow(projectName, category);
          }
        } catch (e) {
          console.warn('[contrib] createContributionRow error:', e);
        }
        if (!rowId) {
          setStatus("Impossible de créer l'entrée de contribution. Réessayez plus tard.", 'error');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        // 1) Upload GeoJSON (fichier importé ou dessiné) vers Supabase Storage
        await (win.supabaseService && win.supabaseService.uploadGeoJSONToStorage(fileForUpload, category, projectName, rowId));

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

        // 4) Optional meta/description patch
        if ((meta && meta.length) || (description && description.length)) {
          try {
            await (win.supabaseService && win.supabaseService.updateContributionMeta(rowId, meta, description));
          } catch (metaErr) {
            console.warn('[contrib] update meta/description warning:', metaErr);
          }
        }

        setStatus('Contribution enregistrée. Merci !', 'success');
        try { form.reset(); } catch(_) {}
        // Nettoyer l'état de dessin et remettre l'UI en mode fichier par défaut
        try { clearAllDrawings(); } catch(_) {}
        try { setGeomMode('file'); } catch(_) {}
        // Close after a short delay
        setTimeout(() => { try { closeContrib(); } catch(_) {} }, 900);
      } catch (err) {
        console.error('[contrib] submit error:', err);
        setStatus('Échec de l’envoi. Réessayez plus tard.', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    if (form) {
      form.addEventListener('submit', handleSubmit);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContrib);
  } else {
    setupContrib();
  }
})(window);
