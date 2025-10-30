// modules/contrib/contrib-upload-v2.js
// Version refactorisée - Cover et Documents upload

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let coverCompressedFile = null;
  let coverDropzoneInstance = null; // Instance unique de la dropzone cover

  // ============================================================================
  // IMAGE COMPRESSION
  // ============================================================================

  /**
   * Compresse une image
   */
  function compressImage(file) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 2000;
            let { width, height } = img;
            const ratio = Math.min(1, maxDim / Math.max(width, height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const preferType = 'image/webp';
            const fallbackType = 'image/jpeg';
            const quality = 0.9;
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
  // COVER UPLOAD - Pattern propre avec instance unique
  // ============================================================================

  /**
   * Crée une instance de dropzone cover (appelée une seule fois)
   */
  function createCoverDropzoneInstance(coverDropzone, coverInput) {
    const cleanupCallbacks = [];

    function attachListener(el, evt, handler, opts) {
      el.addEventListener(evt, handler, opts);
      cleanupCallbacks.push(() => el.removeEventListener(evt, handler, opts));
    }

    // Créer les éléments d'info
    let dzInfo = coverDropzone.querySelector('.dz-info');
    if (!dzInfo) {
      const dzMeta = document.createElement('div');
      dzMeta.className = 'dz-meta';
      dzMeta.style.cssText = 'margin-top:8px;font-size:12px;';
      dzInfo = document.createElement('div');
      dzInfo.className = 'dz-info';
      dzInfo.setAttribute('aria-live', 'polite');
      dzMeta.appendChild(dzInfo);
      coverDropzone.appendChild(dzMeta);
    }

    // Fonction de traitement du fichier
    function processCoverFile(file) {
      try {
        const type = (file.type || '').toLowerCase();
        if (!/image\/(png|jpe?g|webp)/.test(type)) {
          if (win.ContribUtils?.showToast) {
            win.ContribUtils.showToast('Image invalide (png, jpg, webp)', 'error');
          }
          return;
        }
        
        // Preview immédiate
        const url = URL.createObjectURL(file);
        renderPreview(url, file.name);
        
        // Compression
        compressImage(file).then((compressed) => {
          coverCompressedFile = compressed || file;
          try {
            const before = file.size / (1024*1024);
            const after = coverCompressedFile.size / (1024*1024);
            if (dzInfo) dzInfo.textContent = `Image compressée de ${before.toFixed(2)} Mo à ${after.toFixed(2)} Mo`;
          } catch(_) {}
        }).catch(() => { coverCompressedFile = file; });
      } catch (e) {
        console.warn('[contrib-upload-v2] processCoverFile error', e);
        if (win.ContribUtils?.showToast) {
          win.ContribUtils.showToast("Impossible de lire l'image.", 'error');
        }
      }
    }

    function renderPreview(objectUrl, filename) {
      try {
        coverDropzone.classList.add('has-file');
        
        const dzText = coverDropzone.querySelector('.dz-text');
        if (dzText) dzText.style.display = 'none';
        
        let previewContainer = coverDropzone.querySelector('.dz-preview-container');
        if (!previewContainer) {
          previewContainer = document.createElement('div');
          previewContainer.className = 'dz-preview-container';
          previewContainer.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;';
          coverDropzone.appendChild(previewContainer);
        }
        
        let thumb = previewContainer.querySelector('img.dz-thumb');
        if (!thumb) {
          thumb = document.createElement('img');
          thumb.className = 'dz-thumb';
          thumb.alt = 'Aperçu de la cover';
          thumb.style.cssText = 'max-height:160px;max-width:100%;border-radius:10px;box-shadow:0 6px 16px var(--black-alpha-18);object-fit:contain;';
          previewContainer.appendChild(thumb);
        }
        thumb.src = objectUrl;
        
        let fileLabel = previewContainer.querySelector('.dz-file-label');
        if (!fileLabel) {
          fileLabel = document.createElement('div');
          fileLabel.className = 'dz-file-label';
          fileLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.9rem;opacity:0.75;';
          fileLabel.innerHTML = '<i class="fa-regular fa-image" style="opacity:0.6;"></i><span class="dz-file-name"></span>';
          previewContainer.appendChild(fileLabel);
        }
        const fileNameSpan = fileLabel.querySelector('.dz-file-name');
        if (fileNameSpan) fileNameSpan.textContent = filename || 'Image sélectionnée';
      } catch(err) {
        console.warn('[contrib-upload-v2] renderPreview error:', err);
      }
    }

    // Interactions - attachées une seule fois
    const openPicker = () => { try { coverInput.click(); } catch(_) {} };
    
    attachListener(coverDropzone, 'click', openPicker);
    attachListener(coverDropzone, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { 
        e.preventDefault(); 
        openPicker(); 
      }
    });

    ['dragenter','dragover'].forEach(ev => {
      attachListener(coverDropzone, ev, (e) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        coverDropzone.classList.add('is-dragover');
      });
    });
    
    ['dragleave','dragend','drop'].forEach(ev => {
      attachListener(coverDropzone, ev, (e) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        coverDropzone.classList.remove('is-dragover');
      });
    });

    attachListener(coverDropzone, 'drop', (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const f = dt.files && dt.files[0];
      if (!f) return;
      processCoverFile(f);
    });

    attachListener(coverInput, 'change', () => {
      const f = coverInput.files && coverInput.files[0];
      if (f) processCoverFile(f);
    });

    console.log('[contrib-upload-v2] Cover dropzone instance created');

    // API publique de l'instance
    return {
      reset() {
        coverDropzone.classList.remove('has-file');
        const dzText = coverDropzone.querySelector('.dz-text');
        if (dzText) dzText.style.display = '';
        const previewContainer = coverDropzone.querySelector('.dz-preview-container');
        if (previewContainer) previewContainer.remove();
        if (dzInfo) dzInfo.textContent = '';
        coverCompressedFile = null;
      },
      
      destroy() {
        console.log('[contrib-upload-v2] Destroying cover dropzone instance');
        cleanupCallbacks.forEach(cb => {
          try { cb(); } catch(_) {}
        });
        cleanupCallbacks.length = 0;
        this.reset();
      }
    };
  }

  /**
   * Initialise l'upload de cover (API publique)
   */
  function initCoverUpload(elements) {
    const { coverInput } = elements || {};
    const dropzone = document.getElementById('contrib-cover-dropzone');
    
    if (!dropzone || !coverInput) {
      console.warn('[contrib-upload-v2] initCoverUpload: elements not found');
      return null;
    }

    // Si une instance existe, la détruire proprement
    if (coverDropzoneInstance) {
      coverDropzoneInstance.destroy();
    }

    // Créer une nouvelle instance
    coverDropzoneInstance = createCoverDropzoneInstance(dropzone, coverInput);
    return coverDropzoneInstance;
  }

  /**
   * Récupère le fichier cover compressé
   */
  function getCoverFile() {
    return coverCompressedFile;
  }

  /**
   * Réinitialise le fichier cover
   */
  function resetCoverFile() {
    coverCompressedFile = null;
    if (coverDropzoneInstance) {
      coverDropzoneInstance.reset();
    }
  }

  // ============================================================================
  // DOCUMENT ROWS (PDF) - Pattern propre avec délégation
  // ============================================================================

  /**
   * Crée une ligne de document PDF
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
        <button type="button" class="doc-remove btn-ghost" aria-label="Supprimer cette pièce">Supprimer</button>
      </div>
    `;

    const removeBtn = row.querySelector('.doc-remove');
    const fileInput = row.querySelector('.doc-file');
    const fileNameEl = row.querySelector('.doc-filename');
    const dropzoneEl = row.querySelector('.doc-dropzone');

    // Remove button
    removeBtn?.addEventListener('click', () => row.remove());

    // File selection
    function onPicked() {
      const f = fileInput?.files?.[0];
      if (fileNameEl) fileNameEl.textContent = f ? f.name : '';
      row.classList.toggle('has-file', !!f);
      dropzoneEl?.classList.toggle('has-file', !!f);
    }
    
    fileInput?.addEventListener('change', onPicked);

    // Dropzone interactions
    if (dropzoneEl && fileInput) {
      const openPicker = () => fileInput.click();
      
      dropzoneEl.addEventListener('click', openPicker);
      dropzoneEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { 
          e.preventDefault(); 
          openPicker(); 
        }
      });
      
      dropzoneEl.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        dropzoneEl.classList.add('is-dragover'); 
      });
      
      dropzoneEl.addEventListener('dragenter', (e) => { 
        e.preventDefault(); 
        dropzoneEl.classList.add('is-dragover'); 
      });
      
      dropzoneEl.addEventListener('dragleave', () => 
        dropzoneEl.classList.remove('is-dragover')
      );
      
      dropzoneEl.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzoneEl.classList.remove('is-dragover');
        const files = e.dataTransfer?.files;
        if (files?.length && fileInput) {
          fileInput.files = files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    return row;
  }

  /**
   * Collecte tous les documents PDF
   */
  function collectDocs(docsFieldset) {
    if (!docsFieldset) return [];
    
    const rows = docsFieldset.querySelectorAll('.doc-card');
    const out = [];
    
    rows.forEach((row) => {
      const title = row.querySelector('.doc-title')?.value?.trim();
      const file = row.querySelector('.doc-file')?.files?.[0];
      if (title && file) {
        out.push({ title, file });
      }
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
    initCoverUpload,
    getCoverFile,
    resetCoverFile,
    
    // Document rows
    createDocRow,
    collectDocs
  };

})(window);
