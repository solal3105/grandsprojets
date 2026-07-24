/**
 * Uploader d'image réutilisable - dropzone (drag & drop + clic + clavier),
 * préview avec actions Remplacer/Retirer, gestion des ObjectURL et validation.
 *
 * Convention d'IDs (celle des sections ET des specs Playwright) :
 *   `${prefix}-zone`, `${prefix}-drop`, `${prefix}-file`, `${prefix}-preview`,
 *   `${prefix}-img`, `${prefix}-change-btn`
 *
 * Usage :
 *   html    : uploaderHTML({ prefix: 'cw-cover', initialUrl, ... })
 *   binding : bindUploader(container, { prefix: 'cw-cover', onFile, onRemove })
 */

import { esc, escAttr, toast } from './ui.js';

function _formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

export function uploaderHTML({
  prefix,
  accept = 'image/jpeg,image/png,image/webp',
  initialUrl = '',
  title = 'Glissez-déposez une image ici',
  hint = 'JPG, PNG, WebP',
  icon = 'fa-solid fa-cloud-arrow-up',
  small = false,          // variante compacte (favicon…)
  fit = 'cover',          // 'cover' (photo) | 'contain' (logo sur fond neutre)
  height = null,          // hauteur de préview en px
  previewBg = null,       // fond FIXE de préview (contexte cible du logo, pas le thème UI)
  removable = false,
  alt = '',
} = {}) {
  const hasUrl = !!initialUrl;
  const h = height || (small ? 100 : (fit === 'contain' ? 140 : 220));
  const styleVars = `--up-h:${h}px;${previewBg ? `--up-bg:${previewBg};` : ''}`;

  return `
    <div class="adm-uploader${small ? ' adm-uploader--sm' : ''}" id="${prefix}-zone">
      <div class="cw-drop-area${small ? ' cw-drop-area--sm' : ''}" id="${prefix}-drop"
           role="button" tabindex="0" aria-label="${escAttr(title)}" ${hasUrl ? 'hidden' : ''}>
        <div class="cw-drop-area__illustration"><i class="${escAttr(icon)}"></i></div>
        <div class="cw-drop-area__text">
          <span class="cw-drop-area__title">${esc(title)}</span>
          <span class="cw-drop-area__hint">ou <u>cliquez pour parcourir</u> - ${esc(hint)}</span>
        </div>
      </div>
      <div class="adm-uploader__preview adm-uploader__preview--${fit === 'contain' ? 'contain' : 'cover'}"
           id="${prefix}-preview" style="${styleVars}" ${hasUrl ? '' : 'hidden'}>
        <img id="${prefix}-img" src="${hasUrl ? escAttr(initialUrl) : ''}" alt="${escAttr(alt)}">
        <div class="adm-uploader__overlay">
          <button type="button" class="adm-uploader__btn" data-action="change" id="${prefix}-change-btn">
            <i class="fa-solid fa-camera"></i> Remplacer
          </button>
          ${removable ? `
          <button type="button" class="adm-uploader__btn adm-uploader__btn--danger" data-action="remove" aria-label="Retirer l'image" title="Retirer">
            <i class="fa-solid fa-trash"></i>
          </button>` : ''}
        </div>
        <span class="adm-uploader__chip" id="${prefix}-chip" hidden></span>
      </div>
      <input type="file" id="${prefix}-file" accept="${escAttr(accept)}" hidden>
    </div>`;
}

export function bindUploader(root, { prefix, onFile, onRemove, maxSizeMb = 10 } = {}) {
  const drop = root.querySelector(`#${prefix}-drop`);
  const input = root.querySelector(`#${prefix}-file`);
  const preview = root.querySelector(`#${prefix}-preview`);
  const img = root.querySelector(`#${prefix}-img`);
  const chip = root.querySelector(`#${prefix}-chip`);
  if (!drop || !input || !preview) return null;

  const setFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Le fichier doit être une image', 'error');
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast(`Image trop lourde (max ${maxSizeMb} Mo)`, 'error');
      return;
    }
    if (img) {
      if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(file);
    }
    if (chip) {
      chip.textContent = `${file.name} - ${_formatBytes(file.size)}`;
      chip.hidden = false;
    }
    preview.hidden = false;
    drop.hidden = true;
    onFile?.(file);
  };

  const clear = () => {
    if (img) {
      if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.src = '';
    }
    if (chip) chip.hidden = true;
    preview.hidden = true;
    drop.hidden = false;
  };

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    setFile(e.dataTransfer?.files?.[0]);
  });
  input.addEventListener('change', () => {
    setFile(input.files?.[0]);
    input.value = '';
  });

  preview.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'change') input.click();
    if (action === 'remove') { clear(); onRemove?.(); }
  });

  return { setFile, clear };
}
