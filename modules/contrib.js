// modules/contrib.js
;(function (win) {
  function setupContrib() {
    const contribToggle   = document.getElementById('nav-contribute');
    const contribOverlay  = document.getElementById('contrib-overlay');
    const contribCloseBtn = document.getElementById('contrib-close');
    const contribModal    = contribOverlay ? contribOverlay.querySelector('.gp-modal') : null;

    let contribLastFocus  = null;
    let contribCloseTimer = null;

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

    function setStatus(msg, kind = 'info') {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.color = kind === 'error' ? 'var(--danger, #b00020)' : (kind === 'success' ? 'var(--success, #2e7d32)' : '');
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

      if (!projectName || !category || !fileInput || !fileInput.files?.length) {
        setStatus('Veuillez renseigner le nom, la catégorie et sélectionner un fichier GeoJSON.', 'error');
        return;
      }

      // Basic validation for file type
      const file = fileInput.files[0];
      const coverFile = coverInput && coverInput.files && coverInput.files[0] ? coverInput.files[0] : null;
      const nameLower = (file.name || '').toLowerCase();
      if (!nameLower.endsWith('.geojson') && !(file.type || '').includes('json')) {
        setStatus('Le fichier doit être un GeoJSON (.geojson ou JSON valide).', 'error');
        return;
      }

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

        // 1) Upload GeoJSON to Supabase Storage
        await (win.supabaseService && win.supabaseService.uploadGeoJSONToStorage(file, category, projectName, rowId));

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
