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
  container.replaceChildren(emptyState({
    icon: 'fa-solid fa-lock',
    title: 'Réservé aux administrateurs',
    text: 'La configuration du module est réservée aux administrateurs de la collectivité.',
  }));
  return false;
}

/* ════════════════════════════════════════════════════════════════
   Réglages généraux
   ════════════════════════════════════════════════════════════════ */

export async function renderConfig(container) {
  if (!_gateAdmin(container)) return;

  /* Une lecture en échec rendrait un formulaire vide, dont l'enregistrement
     écraserait la configuration réelle de la ville : on refuse d'afficher. */
  let settings;
  try {
    settings = (await api.getParticiperSettings()) || {};
  } catch (e) {
    container.replaceChildren(emptyState({
      icon: 'fa-solid fa-triangle-exclamation',
      title: 'Réglages illisibles',
      text: `${e.message} - rechargez la page.`,
    }));
    return;
  }

  const field = (id, label, tip, input, optional = true) => `
    <div class="cw-field">
      <label class="cw-field__label" for="${id}">${label}${optional ? ' <span class="cw-optional">facultatif</span>' : ''}</label>
      ${input}
      ${tip ? `<div class="cw-field__tip">${tip}</div>` : ''}
    </div>`;
  const num = (id, value, min, max) => `<input class="cw-field__input" type="number" id="${id}" value="${value}" min="${min}" max="${max}">`;

  container.innerHTML = `
    ${subPageHeader({
      title: 'Réglages du module',
      subtitle: 'Comment les habitants déposent, et comment vous êtes prévenu.',
    })}

    <div class="cw-sections">
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-comment-dots"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Ce que voit l'habitant</h2>
            <p class="cw-section__desc">Les textes affichés sur la carte publique</p>
          </div>
        </div>
        <div class="cw-section__body">
          ${field('ptcfg-intro', 'Introduction du formulaire', 'Affichée en tête du panneau « Signaler ». Laissez vide pour le texte par défaut.',
            `<textarea class="cw-field__textarea" id="ptcfg-intro" rows="2" maxlength="500" placeholder="Signalez un problème ou une idée à votre collectivité, sans créer de compte.">${esc(settings.intro_text || '')}</textarea>`)}
          ${field('ptcfg-success', 'Message après envoi', 'Affiché juste après l\'envoi, avant que l\'habitant ne confirme son adresse.',
            `<textarea class="cw-field__textarea" id="ptcfg-success" rows="2" maxlength="500" placeholder="Ouvrez l'email que nous venons de vous envoyer et confirmez votre signalement.">${esc(settings.success_text || '')}</textarea>`)}
        </div>
      </section>

      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-bell"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Vos notifications</h2>
            <p class="cw-section__desc">Où arrivent les signalements et les rappels</p>
          </div>
        </div>
        <div class="cw-section__body">
          ${field('ptcfg-email', 'Email de la collectivité',
            'Reçoit chaque nouveau signalement, les rappels de non-traitement et les demandes de retrait. Sert aussi d\'adresse de réponse aux messages envoyés aux habitants.',
            `<input class="cw-field__input" type="email" id="ptcfg-email" maxlength="180" placeholder="participation@ma-commune.fr" value="${esc(settings.notify_email || '')}">`)}
          ${field('ptcfg-alerte', 'Me rappeler après (jours)',
            'Un signalement laissé sans réponse détruit la confiance : passé ce délai, vous recevez un rappel.',
            num('ptcfg-alerte', settings.alerte_jours ?? 7, 1, 90), false)}
        </div>
      </section>

      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-circle-pause"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Suspendre les dépôts</h2>
            <p class="cw-section__desc">Congés, vacance de poste, période électorale</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <div class="ptadm-switch-row">
              <label class="adm-switch">
                <input type="checkbox" id="ptcfg-paused" ${settings.paused ? 'checked' : ''}>
                <span class="adm-switch__track"></span>
              </label>
              <div class="ptadm-switch-row__text">
                <strong>Mode pause</strong>
                <span>Le formulaire est remplacé par un message. La carte et les pages de suivi restent consultables.</span>
              </div>
            </div>
          </div>
          ${field('ptcfg-pause-msg', 'Message affiché à la place du formulaire', '',
            `<textarea class="cw-field__textarea" id="ptcfg-pause-msg" rows="2" maxlength="300" placeholder="Les signalements reprendront le 1er septembre.">${esc(settings.pause_message || '')}</textarea>`)}
        </div>
      </section>

      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-shield-halved"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Garde-fous</h2>
            <p class="cw-section__desc">Limites anti-abus et durée de conservation</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="ptadm-config__grid">
            ${field('ptcfg-quota-email', 'Dépôts max par jour et par adresse', '', num('ptcfg-quota-email', settings.quota_email_jour ?? 5, 1, 100), false)}
            ${field('ptcfg-quota-ip', 'Dépôts max par jour et par connexion', '', num('ptcfg-quota-ip', settings.quota_ip_jour ?? 20, 1, 500), false)}
          </div>
          ${field('ptcfg-retention', 'Effacer les données personnelles après (mois)',
            'Une fois le signalement clos, l\'adresse email de l\'habitant et son empreinte de connexion sont effacées automatiquement. Le contenu publié, lui, reste en ligne.',
            num('ptcfg-retention', settings.retention_mois ?? 12, 1, 60), false)}
        </div>
      </section>

      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-rotate-left"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Valeurs par défaut</h2>
            <p class="cw-section__desc">Recréer les catégories et statuts manquants</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <div class="cw-field__tip">Vos personnalisations existantes sont conservées : seuls les éléments supprimés sont recréés.</div>
            <button class="adm-btn adm-btn--secondary" id="ptcfg-seed" style="align-self:flex-start">
              <i class="fa-solid fa-rotate-left"></i> Restaurer les valeurs par défaut
            </button>
          </div>
        </div>
      </section>
    </div>

    <div class="cw-footer">
      <a href="/admin/participer/" class="cw-footer__cancel" data-section="participer">
        <i class="fa-solid fa-arrow-left"></i> Retour
      </a>
      <button type="button" class="cw-footer__submit" id="ptcfg-save">
        <span>Enregistrer les réglages</span>
        <i class="fa-solid fa-check"></i>
      </button>
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
      title: 'Catégories de signalement',
      subtitle: 'Ce que les habitants peuvent signaler. Six à dix entrées suffisent : au-delà, le choix devient dissuasif.',
      action: '<button class="adm-btn adm-btn--primary" id="ptcat-add"><i class="fa-solid fa-plus"></i> Ajouter</button>',
    })}
    <div class="cw-sections">
      <section class="cw-section">
        <div class="cw-section__body cw-section__body--flush" id="ptcat-list"></div>
      </section>
    </div>`;

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
    <div class="adm-list-item ${cat.enabled ? '' : 'ptadm-row--off'}">
      <span class="ptadm-cat" style="--ptadm-color:${safeColor(cat.color)}"><i class="${esc(cat.icon_class)}"></i></span>
      <div class="adm-list-item__info">
        <div class="adm-list-item__name">${esc(cat.label)}</div>
        <div class="adm-list-item__meta">
          <code class="ptadm-key">${esc(cat.category_key)}</code>
          ${cat.help_text ? esc(cat.help_text) : ''}
        </div>
      </div>
      <div class="adm-list-item__actions">
        <label class="adm-switch" title="${cat.enabled ? 'Proposée aux habitants' : 'Masquée du formulaire'}">
          <input type="checkbox" data-toggle="${esc(cat.id)}" ${cat.enabled ? 'checked' : ''}>
          <span class="adm-switch__track"></span>
        </label>
        <button class="adm-btn adm-btn--ghost adm-btn--icon" data-edit="${esc(cat.id)}" aria-label="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button class="adm-btn adm-btn--ghost adm-btn--icon ptadm-delete" data-delete="${esc(cat.id)}" aria-label="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
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
      // Sans cette mise à jour, ouvrir ensuite le formulaire de la même ligne
      // réenverrait l'ancienne valeur et réactiverait la catégorie en silence
      cat.enabled = toggle.checked;
      invalidateRefData();
      toast(toggle.checked ? 'Catégorie proposée aux habitants' : 'Catégorie masquée', 'success');
    }
  });
}

/* Délégué à la slugification du projet : elle seule traite les ligatures
   (« Cœur » donne « coeur », là où une décomposition simple laisse « c-ur ») et
   reste alignée sur la fonction Postgres du même nom. La clé de catégorie est
   plafonnée à 40 caractères comme son champ de saisie. */
const _slugify = (s) => window.SecurityUtils.slugify(s).slice(0, 40);

function _openCategoryForm(cat, onSaved) {
  const isNew = !cat;
  const handle = slidePanel.open({
    title: isNew ? 'Nouvelle catégorie' : `Modifier « ${cat.label} »`,
    body: `
      <div class="ptadm-form">
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-label">Libellé <span class="cw-required">*</span></label>
          <input class="cw-field__input" id="ptc-label" maxlength="80" value="${esc(cat?.label || '')}" placeholder="Ex : Cheminement coupé ou dangereux">
        </div>
        ${isNew ? `
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-key">Clé technique <span class="cw-required">*</span></label>
          <input class="cw-field__input" id="ptc-key" maxlength="40" placeholder="cheminement" pattern="[a-z0-9-]+">
          <div class="cw-field__tip">Minuscules, chiffres et tirets. Définitive après création.</div>
        </div>` : ''}
        <div class="cw-field">
          <label class="cw-field__label">Icône</label>
          ${renderIconField('ptc-icon', cat?.icon_class, 'fa-solid fa-circle-exclamation')}
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-color">Couleur</label>
          <input type="color" class="ptadm-color" id="ptc-color" value="${safeColor(cat?.color)}">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-help">Texte d'aide</label>
          <input class="cw-field__input" id="ptc-help" maxlength="160" value="${esc(cat?.help_text || '')}" placeholder="Affiché au survol de la catégorie">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="ptc-order">Ordre d'affichage</label>
          <input class="cw-field__input" type="number" id="ptc-order" value="${cat?.sort_order ?? 0}" min="0" max="99">
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
      color: content.querySelector('#ptc-color')?.value || null,
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
      title: 'Affichage des statuts',
      subtitle: 'Le cycle de vie est fixe : vous en choisissez les mots, les couleurs et les notifications.',
    })}
    <div class="cw-sections">
      <section class="cw-section">
        <div class="cw-section__body cw-section__body--flush" id="ptst-list">
          ${statuts.length ? '' : '<div class="cw-field__tip" style="padding:20px;">Aucun statut. Restaurez les valeurs par défaut depuis les réglages.</div>'}
          ${statuts.map((st) => `
            <div class="adm-list-item">
              <span class="ptadm-pill" style="--ptadm-color:${safeColor(st.color)}">${esc(st.label)}</span>
              <div class="adm-list-item__info">
                <div class="adm-list-item__meta">
                  <code class="ptadm-key">${esc(st.statut_key)}</code>
                  ${st.notify ? '<span class="ptadm-notify"><i class="fa-solid fa-envelope"></i> prévient l\'habitant</span>' : '<span class="ptadm-notify ptadm-notify--off"><i class="fa-solid fa-envelope-open"></i> sans email</span>'}
                </div>
              </div>
              <div class="adm-list-item__actions">
                <button class="adm-btn adm-btn--ghost adm-btn--icon" data-edit="${esc(st.id)}" aria-label="Modifier"><i class="fa-solid fa-pen"></i></button>
              </div>
            </div>`).join('')}
        </div>
      </section>
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
          <input class="cw-field__input" id="pts-label" maxlength="60" value="${esc(st.label)}">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="pts-color">Couleur</label>
          <input type="color" class="ptadm-color" id="pts-color" value="${safeColor(st.color)}">
        </div>
        <div class="cw-field">
          <label class="cw-field__label" for="pts-order">Ordre d'affichage</label>
          <input class="cw-field__input" type="number" id="pts-order" value="${st.sort_order ?? 0}" min="0" max="99">
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
