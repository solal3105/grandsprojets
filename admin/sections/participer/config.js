/* ============================================================================
   ADMIN Participer - configuration du module (admin uniquement)

   Trois sous-pages : réglages généraux, catégories de signalement (CRUD
   complet), affichage des statuts (libellé/couleur/notification - les clés
   machine sont immuables, le cycle de vie est un invariant produit).
   ============================================================================ */

import { store } from '../../store.js';
import * as api from '../../api.js';
import { esc, toast, confirm, slidePanel, emptyState } from '../../components/ui.js';
import { renderIconField, bindIconField } from '../../components/icon-picker.js';
import { invalidateRefData, safeColor, subPageHeader } from './data.js';

function _gateAdmin(container) {
  if (store.isAdmin) return true;
  container.innerHTML = `
    <div class="adm-empty">
      <div class="adm-empty__icon"><i class="fa-solid fa-lock"></i></div>
      <div class="adm-empty__title">Réservé aux administrateurs</div>
    </div>`;
  return false;
}

/* ════════════════════════════════════════════════════════════════
   Réglages généraux
   ════════════════════════════════════════════════════════════════ */

export async function renderConfig(container) {
  if (!_gateAdmin(container)) return;
  const settings = (await api.getParticiperSettings()) || {};

  const field = (id, label, tip, input) => `
    <div class="cw-field">
      <label class="cw-field__label" for="${id}">${label}</label>
      ${input}
      ${tip ? `<div class="cw-field__tip">${tip}</div>` : ''}
    </div>`;
  const num = (id, value, min, max) => `<input class="adm-input" type="number" id="${id}" value="${value}" min="${min}" max="${max}">`;

  container.innerHTML = `
    ${subPageHeader({
      icon: 'fa-solid fa-gear',
      title: 'Réglages Participer',
      subtitle: `Fonctionnement du module pour ${store.city}`,
    })}
    <div class="adm-card ptadm-config">
      ${field('ptcfg-intro', 'Texte d\'introduction du formulaire', 'Affiché en tête du panneau « Signaler » sur la carte publique.',
        `<textarea class="adm-input" id="ptcfg-intro" rows="2" maxlength="500">${esc(settings.intro_text || '')}</textarea>`)}
      ${field('ptcfg-success', 'Message de confirmation', 'Affiché après l\'envoi du formulaire (avant la confirmation par email).',
        `<textarea class="adm-input" id="ptcfg-success" rows="2" maxlength="500">${esc(settings.success_text || '')}</textarea>`)}
      ${field('ptcfg-email', 'Email de la collectivité', 'Reçoit les nouveaux signalements, les alertes et les demandes de retrait. Sert aussi d\'adresse de réponse aux emails envoyés aux habitants.',
        `<input class="adm-input" type="email" id="ptcfg-email" maxlength="180" value="${esc(settings.notify_email || '')}">`)}

      <div class="cw-field">
        <div class="ptadm-switch-row">
          <label class="adm-switch">
            <input type="checkbox" id="ptcfg-paused" ${settings.paused ? 'checked' : ''}>
            <span class="adm-switch__track"></span>
          </label>
          <span><strong>Mode pause</strong> - suspendre les nouveaux dépôts (congés, vacance de poste, période électorale). La carte et le suivi restent visibles.</span>
        </div>
        <textarea class="adm-input" id="ptcfg-pause-msg" rows="2" maxlength="300" placeholder="Message affiché à la place du formulaire">${esc(settings.pause_message || '')}</textarea>
      </div>

      <div class="ptadm-config__grid">
        ${field('ptcfg-quota-email', 'Dépôts max / jour / email', '', num('ptcfg-quota-email', settings.quota_email_jour ?? 5, 1, 100))}
        ${field('ptcfg-quota-ip', 'Dépôts max / jour / connexion', '', num('ptcfg-quota-ip', settings.quota_ip_jour ?? 20, 1, 500))}
        ${field('ptcfg-alerte', 'Alerte « non traité » (jours)', 'Email de rappel si des signalements restent sans traitement.', num('ptcfg-alerte', settings.alerte_jours ?? 7, 1, 90))}
        ${field('ptcfg-retention', 'Effacement des données perso (mois après clôture)', 'Email et empreinte de connexion effacés automatiquement.', num('ptcfg-retention', settings.retention_mois ?? 12, 1, 60))}
      </div>

      <div class="cw-footer">
        <button class="adm-btn adm-btn--secondary" id="ptcfg-seed"><i class="fa-solid fa-rotate-left"></i> Restaurer catégories et statuts par défaut</button>
        <button class="adm-btn adm-btn--primary" id="ptcfg-save"><i class="fa-solid fa-check"></i> Enregistrer</button>
      </div>
    </div>`;

  container.querySelector('#ptcfg-save')?.addEventListener('click', async () => {
    const val = (id) => container.querySelector(`#${id}`)?.value.trim() || null;
    const intVal = (id, fallback) => {
      const n = parseInt(container.querySelector(`#${id}`)?.value, 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const { error } = await api.saveParticiperSettings({
      intro_text: val('ptcfg-intro'),
      success_text: val('ptcfg-success'),
      notify_email: val('ptcfg-email'),
      paused: container.querySelector('#ptcfg-paused')?.checked === true,
      pause_message: val('ptcfg-pause-msg'),
      quota_email_jour: intVal('ptcfg-quota-email', 5),
      quota_ip_jour: intVal('ptcfg-quota-ip', 20),
      alerte_jours: intVal('ptcfg-alerte', 7),
      retention_mois: intVal('ptcfg-retention', 12),
    });
    if (error) toast('Erreur : ' + error.message, 'error');
    else toast('Réglages enregistrés', 'success');
  });

  container.querySelector('#ptcfg-seed')?.addEventListener('click', async () => {
    const ok = await confirm({
      title: 'Restaurer les valeurs par défaut ?',
      message: 'Les catégories et statuts par défaut manquants seront recréés. Vos personnalisations existantes sont conservées.',
      confirmLabel: 'Restaurer',
    });
    if (!ok) return;
    const { error } = await api.seedParticiper();
    if (error) toast('Erreur : ' + error.message, 'error');
    else { invalidateRefData(); toast('Valeurs par défaut restaurées', 'success'); }
  });
}

/* ════════════════════════════════════════════════════════════════
   Catégories de signalement
   ════════════════════════════════════════════════════════════════ */

export async function renderCategoriesAdmin(container) {
  if (!_gateAdmin(container)) return;

  container.innerHTML = `
    ${subPageHeader({
      icon: 'fa-solid fa-tags',
      title: 'Catégories de signalement',
      subtitle: 'Ce que les habitants peuvent signaler - libellé, icône, couleur, ordre',
    })}
    <div class="adm-page-header__actions" style="margin-bottom:12px;">
      <button class="adm-btn adm-btn--primary" id="ptcat-add"><i class="fa-solid fa-plus"></i> Ajouter une catégorie</button>
    </div>
    <div class="adm-card" id="ptcat-list"></div>`;

  container.querySelector('#ptcat-add')?.addEventListener('click', () => _openCategoryForm(null, () => renderCategoriesAdmin(container)));
  await _renderCategoryList(container);
}

async function _renderCategoryList(container) {
  const body = container.querySelector('#ptcat-list');
  if (!body) return;
  const categories = await api.getParticiperCategories();

  if (!categories.length) {
    body.innerHTML = '';
    body.appendChild(emptyState({
      icon: 'fa-solid fa-tags',
      title: 'Aucune catégorie',
      text: 'Ajoutez une catégorie, ou restaurez les valeurs par défaut depuis les réglages.',
    }));
    return;
  }

  body.innerHTML = categories.map((cat) => `
    <div class="adm-list-item">
      <span class="ptadm-cat" style="--ptadm-color:${safeColor(cat.color)}"><i class="${esc(cat.icon_class)}"></i></span>
      <div class="adm-list-item__info">
        <div class="adm-list-item__name">${esc(cat.label)}</div>
        <div class="adm-list-item__meta">${esc(cat.category_key)}${cat.help_text ? ` · ${esc(cat.help_text)}` : ''}</div>
      </div>
      <label class="adm-switch" title="${cat.enabled ? 'Proposée aux habitants' : 'Masquée du formulaire'}">
        <input type="checkbox" data-toggle="${esc(cat.id)}" ${cat.enabled ? 'checked' : ''}>
        <span class="adm-switch__track"></span>
      </label>
      <button class="adm-btn adm-btn--ghost adm-btn--icon" data-edit="${esc(cat.id)}" aria-label="Modifier"><i class="fa-solid fa-pen"></i></button>
      <button class="adm-btn adm-btn--ghost adm-btn--icon" data-delete="${esc(cat.id)}" aria-label="Supprimer"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('');

  body.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const cat = categories.find((c) => c.id === editBtn.dataset.edit);
      if (cat) _openCategoryForm(cat, () => renderCategoriesAdmin(container));
      return;
    }
    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      const cat = categories.find((c) => c.id === delBtn.dataset.delete);
      if (!cat) return;
      const ok = await confirm({
        title: `Supprimer « ${cat.label} » ?`,
        message: 'Les signalements existants de cette catégorie garderont leur clé mais perdront leur libellé. Préférez la désactivation.',
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      const { error } = await api.deleteParticiperCategory(cat.id);
      if (error) toast('Erreur : ' + error.message, 'error');
      else { invalidateRefData(); toast('Catégorie supprimée', 'success'); renderCategoriesAdmin(container); }
    }
  });

  body.addEventListener('change', async (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (!toggle) return;
    const cat = categories.find((c) => c.id === toggle.dataset.toggle);
    if (!cat) return;
    const { error } = await api.upsertParticiperCategory({ ...cat, enabled: toggle.checked });
    if (error) {
      toggle.checked = !toggle.checked;
      toast('Erreur : ' + error.message, 'error');
    } else {
      invalidateRefData();
      toast(toggle.checked ? 'Catégorie proposée aux habitants' : 'Catégorie masquée', 'success');
    }
  });
}

const _slugify = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

function _openCategoryForm(cat, onSaved) {
  const isNew = !cat;
  const handle = slidePanel.open({
    title: isNew ? 'Nouvelle catégorie' : `Modifier « ${cat.label} »`,
    body: `
      <div class="ptadm-form">
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-label">Libellé <span class="cw-required">*</span></label>
          <input class="adm-input" id="ptc-label" maxlength="80" value="${esc(cat?.label || '')}" placeholder="Ex : Cheminement coupé ou dangereux">
        </div>
        ${isNew ? `
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-key">Clé technique <span class="cw-required">*</span></label>
          <input class="adm-input" id="ptc-key" maxlength="40" placeholder="cheminement" pattern="[a-z0-9-]+">
          <div class="cw-field__tip">Minuscules, chiffres et tirets. Définitive après création.</div>
        </div>` : ''}
        <div class="cw-field">
          <label class="cw-field__label">Icône</label>
          ${renderIconField('ptc-icon', cat?.icon_class, 'fa-solid fa-circle-exclamation')}
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-color">Couleur</label>
          <input type="color" class="adm-input ptadm-color" id="ptc-color" value="${safeColor(cat?.color || '#14AE5C')}">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-help">Texte d'aide</label>
          <input class="adm-input" id="ptc-help" maxlength="160" value="${esc(cat?.help_text || '')}" placeholder="Affiché au survol de la catégorie">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-order">Ordre d'affichage</label>
          <input class="adm-input" type="number" id="ptc-order" value="${cat?.sort_order ?? 0}" min="0" max="99">
        </div>
      </div>`,
    footer: `<button class="adm-btn adm-btn--primary" id="ptc-save"><i class="fa-solid fa-check"></i> ${isNew ? 'Créer' : 'Enregistrer'}</button>`,
  });
  if (!handle) return;
  const { content, close } = handle;

  bindIconField(content, 'ptc-icon', { category: 'general' });

  const labelInput = content.querySelector('#ptc-label');
  const keyInput = content.querySelector('#ptc-key');
  if (isNew && labelInput && keyInput) {
    labelInput.addEventListener('input', () => {
      if (!keyInput.dataset.touched) keyInput.value = _slugify(labelInput.value);
    });
    keyInput.addEventListener('input', () => { keyInput.dataset.touched = '1'; });
  }

  content.querySelector('#ptc-save')?.addEventListener('click', async () => {
    const label = labelInput?.value.trim();
    if (!label) { toast('Le libellé est obligatoire', 'warning'); return; }
    const categoryKey = isNew ? _slugify(keyInput?.value.trim()) : cat.category_key;
    if (isNew && !categoryKey) { toast('La clé technique est obligatoire', 'warning'); return; }
    const { error } = await api.upsertParticiperCategory({
      id: cat?.id,
      category_key: categoryKey,
      label,
      icon_class: content.querySelector('#ptc-icon')?.value || 'fa-solid fa-circle-exclamation',
      color: content.querySelector('#ptc-color')?.value || '#14AE5C',
      help_text: content.querySelector('#ptc-help')?.value.trim() || null,
      sort_order: parseInt(content.querySelector('#ptc-order')?.value, 10) || 0,
      enabled: cat?.enabled !== undefined ? cat.enabled : true,
    });
    if (error) {
      toast(/duplicate|unique/i.test(error.message) ? 'Cette clé technique existe déjà' : 'Erreur : ' + error.message, 'error');
      return;
    }
    invalidateRefData();
    toast(isNew ? 'Catégorie créée' : 'Catégorie mise à jour', 'success');
    close();
    onSaved?.();
  });
}

/* ════════════════════════════════════════════════════════════════
   Affichage des statuts
   ════════════════════════════════════════════════════════════════ */

export async function renderStatutsAdmin(container) {
  if (!_gateAdmin(container)) return;

  const statuts = await api.getParticiperStatuts();

  container.innerHTML = `
    ${subPageHeader({
      icon: 'fa-solid fa-list-check',
      title: 'Affichage des statuts',
      subtitle: 'Libellés, couleurs et notifications - le cycle de vie lui-même est fixe',
    })}
    <div class="adm-card" id="ptst-list">
      ${statuts.length ? '' : '<div style="padding:20px;color:var(--text-secondary);">Aucun statut - restaurez les valeurs par défaut depuis les réglages.</div>'}
      ${statuts.map((st) => `
        <div class="adm-list-item">
          <span class="ptadm-pill" style="--ptadm-color:${safeColor(st.color)}">${esc(st.label)}</span>
          <div class="adm-list-item__info">
            <div class="adm-list-item__meta">${esc(st.statut_key)}${st.notify ? ' · notifie l\'habitant par email' : ' · sans notification'}</div>
          </div>
          <button class="adm-btn adm-btn--ghost adm-btn--icon" data-edit="${esc(st.id)}" aria-label="Modifier"><i class="fa-solid fa-pen"></i></button>
        </div>`).join('')}
    </div>`;

  container.querySelector('#ptst-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    const st = statuts.find((s) => s.id === btn.dataset.edit);
    if (st) _openStatutForm(st, () => renderStatutsAdmin(container));
  });
}

function _openStatutForm(st, onSaved) {
  const handle = slidePanel.open({
    title: `Statut « ${st.statut_key} »`,
    body: `
      <div class="ptadm-form">
        <div class="cw-field">
          <label class="cw-field__label" for="pts-label">Libellé affiché <span class="cw-required">*</span></label>
          <input class="adm-input" id="pts-label" maxlength="60" value="${esc(st.label)}">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="pts-color">Couleur</label>
          <input type="color" class="adm-input ptadm-color" id="pts-color" value="${safeColor(st.color)}">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="pts-order">Ordre d'affichage</label>
          <input class="adm-input" type="number" id="pts-order" value="${st.sort_order ?? 0}" min="0" max="99">
        </div>
        <div class="cw-field">
          <div class="ptadm-switch-row">
            <label class="adm-switch">
              <input type="checkbox" id="pts-notify" ${st.notify ? 'checked' : ''}>
              <span class="adm-switch__track"></span>
            </label>
            <span>Prévenir l'habitant par email quand ce statut est appliqué</span>
          </div>
        </div>
      </div>`,
    footer: `<button class="adm-btn adm-btn--primary" id="pts-save"><i class="fa-solid fa-check"></i> Enregistrer</button>`,
  });
  if (!handle) return;
  const { content, close } = handle;

  content.querySelector('#pts-save')?.addEventListener('click', async () => {
    const label = content.querySelector('#pts-label')?.value.trim();
    if (!label) { toast('Le libellé est obligatoire', 'warning'); return; }
    const { error } = await api.updateParticiperStatut(st.id, {
      label,
      color: content.querySelector('#pts-color')?.value || st.color,
      sort_order: parseInt(content.querySelector('#pts-order')?.value, 10) || 0,
      notify: content.querySelector('#pts-notify')?.checked === true,
    });
    if (error) { toast('Erreur : ' + error.message, 'error'); return; }
    invalidateRefData();
    toast('Statut mis à jour', 'success');
    close();
    onSaved?.();
  });
}
