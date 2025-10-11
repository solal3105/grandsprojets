// modules/contrib/contrib-upload.js
// Gestion de l'upload des fichiers (cover, docs, compression)

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let coverCompressedFile = null;

  // ============================================================================
  // IMAGE COMPRESSION
  // ============================================================================

  /**
   * Compresse une image
   * @param {File} file - Fichier image à compresser
   * @returns {Promise<File>} Fichier compressé
   */
  function compressImage(file) {
    return new Promise((resolve) => {
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
            canvas.toBlob((blob) => {
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

  // ============================================================================
  // COVER UPLOAD
  // ============================================================================

  /**
   * Configure la dropzone pour l'upload de cover
   * @param {HTMLElement} coverPreview - Élément de prévisualisation
   * @param {HTMLInputElement} coverInput - Input file
   */
  function setupCoverDropzone(coverPreview, coverInput) {
    try {
      if (!coverInput || !coverPreview) return;

      // Hide native input
      try { coverInput.style.display = 'none'; } catch(_) {}

      // Build dropzone structure
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

      // Create meta text (compression info)
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

      // Interactions
      const openPicker = () => { try { coverInput.click(); } catch(_) {} };
      coverPreview.addEventListener('click', openPicker);
      coverPreview.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
      });

      ['dragenter','dragover'].forEach(ev => coverPreview.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation(); coverPreview.classList.add('is-dragover');
      }));
      ['dragleave','dragend','drop'].forEach(ev => coverPreview.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation(); coverPreview.classList.remove('is-dragover');
      }));

      coverPreview.addEventListener('drop', (e) => {
        const dt = e.dataTransfer; if (!dt) return;
        const f = dt.files && dt.files[0]; if (!f) return;
        processCoverFile(f);
      });

      coverInput.addEventListener('change', () => {
        const f = coverInput.files && coverInput.files[0];
        if (f) processCoverFile(f);
      });

      function processCoverFile(file) {
        try {
          const type = (file.type || '').toLowerCase();
          if (!/image\/(png|jpe?g|webp)/.test(type)) {
            if (win.ContribUtils?.showToast) {
              win.ContribUtils.showToast('Image invalide (png, jpg, webp)', 'error');
            }
            return;
          }
          // Create preview first
          const url = URL.createObjectURL(file);
          renderPreview(url, '');
          // Compress
          compressImage(file).then((compressed) => {
            coverCompressedFile = compressed || file;
            try {
              const before = file.size / (1024*1024);
              const after = (coverCompressedFile && coverCompressedFile.size ? coverCompressedFile.size : file.size) / (1024*1024);
              if (dzInfo) dzInfo.textContent = `image compressée de ${before.toFixed(2)} Mo à ${after.toFixed(2)} Mo`;
            } catch(_) {}
          }).catch(() => { coverCompressedFile = file; });
        } catch (e) {
          console.warn('[contrib-upload] processCoverFile error', e);
          if (win.ContribUtils?.showToast) {
            win.ContribUtils.showToast("Impossible de lire l'image.", 'error');
          }
        }
      }

      function renderPreview(objectUrl, filename) {
        try {
          // Switch to selected state
          if (coverDzFilenameEl) {
            try { coverDzFilenameEl.textContent = ''; } catch(_) {}
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
            thumb.style.boxShadow = '0 6px 16px var(--black-alpha-18)';
            thumb.style.transform = 'rotate(-0.75deg)';
            thumb.style.transition = 'transform 0.2s ease';
            // place thumbnail inside dz-selected, replacing icon
            const sel = coverPreview.querySelector('.dz-selected');
            if (sel) {
              const icon = sel.querySelector('.dz-icon');
              if (icon) { try { icon.remove(); } catch(_) {} }
              sel.prepend(thumb);
            } else {
              coverPreview.appendChild(thumb);
            }
          }
          thumb.src = objectUrl;
        } catch(_) {}
      }

      // Expose for edit-mode prefill
      try { win.__contribRenderCoverPreview = (u, n) => renderPreview(u, n); } catch(_) {}

    } catch (e) {
      console.warn('[contrib-upload] setupCoverDropzone error:', e);
    }
  }

  /**
   * Récupère le fichier cover compressé
   * @returns {File|null} Fichier compressé ou null
   */
  function getCoverFile() {
    return coverCompressedFile;
  }

  /**
   * Réinitialise le fichier cover
   */
  function resetCoverFile() {
    coverCompressedFile = null;
  }

  // ============================================================================
  // DOCUMENT ROWS (PDF)
  // ============================================================================

  /**
   * Crée une ligne de document PDF
   * @returns {HTMLElement} Élément DOM de la ligne
   */
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
        if (fileInput && !fileInput.disabled) { 
          fileInput.files = files; 
          fileInput.dispatchEvent(new Event('change', { bubbles:true })); 
        }
      });
    }

    return row;
  }

  /**
   * Collecte tous les documents PDF
   * @param {HTMLElement} docsFieldset - Conteneur des documents
   * @returns {Array} Liste des documents {title, file}
   */
  function collectDocs(docsFieldset) {
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

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribUpload = {
    // Image compression
    compressImage,
    
    // Cover upload
    setupCoverDropzone,
    getCoverFile,
    resetCoverFile,
    
    // Document rows
    createDocRow,
    collectDocs
  };

})(window);
