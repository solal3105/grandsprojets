// modules/contrib/contrib-category-tags.js
// Gestion des tags disponibles pour les catégories

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let currentTags = [];          // Tableau des tags actuels
  let editingTagIndex = null;    // Index du tag en édition (null = création)

  // ============================================================================
  // DOM ELEMENTS
  // ============================================================================

  let elements = {};

  /**
   * Récupère et cache les éléments DOM
   */
  function cacheElements() {
    elements = {
      tagsList: document.getElementById('category-tags-list'),
      nameInput: document.getElementById('category-tag-name'),
      iconInput: document.getElementById('category-tag-icon'),
      colorInput: document.getElementById('category-tag-color'),
      addBtn: document.getElementById('category-add-tag-btn'),
      addBtnText: document.getElementById('category-add-tag-btn-text'),
      cancelBtn: document.getElementById('category-cancel-tag-btn'),
      editMessage: document.getElementById('category-tag-edit-message')
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Échappe les caractères HTML pour prévenir les XSS
   * @param {string} str - Chaîne à échapper
   * @returns {string} Chaîne échappée
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Valide une icône FontAwesome
   * @param {string} icon - Classe d'icône
   * @returns {boolean} True si valide
   */
  function isValidIcon(icon) {
    if (!icon || typeof icon !== 'string') return false;
    // Vérifie que c'est au format fa-xxx
    return /^fa-/.test(icon.trim());
  }

  /**
   * Valide une couleur hexadécimale
   * @param {string} color - Couleur hex
   * @returns {boolean} True si valide
   */
  function isValidColor(color) {
    if (!color || typeof color !== 'string') return false;
    return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  /**
   * Affiche la liste des tags
   */
  function renderTagsList() {
    if (!elements.tagsList) {
      console.warn('[ContribCategoryTags] Conteneur tags introuvable');
      return;
    }

    // Si aucun tag, le ::before CSS affichera "Aucun tag défini"
    if (currentTags.length === 0) {
      elements.tagsList.innerHTML = '';
      return;
    }

    // Générer le HTML pour chaque tag
    const html = currentTags.map((tag, index) => {
      const escapedName = escapeHtml(tag.name);
      const escapedIcon = escapeHtml(tag.icon);
      const escapedColor = escapeHtml(tag.color);

      return `
        <div class="category-tag-item" style="background-color: ${escapedColor};">
          <i class="fa-solid ${escapedIcon}"></i>
          <span>${escapedName}</span>
          <button type="button" 
                  class="category-tag-action" 
                  data-action="edit" 
                  data-index="${index}" 
                  title="Modifier ce tag"
                  aria-label="Modifier ${escapedName}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" 
                  class="category-tag-action" 
                  data-action="delete" 
                  data-index="${index}" 
                  title="Supprimer ce tag"
                  aria-label="Supprimer ${escapedName}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    }).join('');

    elements.tagsList.innerHTML = html;

    // Bind les event listeners sur les boutons
    bindTagActions();
  }

  /**
   * Bind les actions sur les tags (éditer, supprimer)
   */
  function bindTagActions() {
    if (!elements.tagsList) return;

    // Boutons d'édition
    elements.tagsList.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(btn.dataset.index);
        editTag(index);
      });
    });

    // Boutons de suppression
    elements.tagsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(btn.dataset.index);
        deleteTag(index);
      });
    });
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Ajoute ou modifie un tag
   */
  function addTag() {
    if (!elements.nameInput || !elements.iconInput || !elements.colorInput) {
      console.error('[ContribCategoryTags] Éléments du formulaire introuvables');
      return;
    }

    const name = elements.nameInput.value.trim();
    const icon = elements.iconInput.value.trim();
    const color = elements.colorInput.value.trim();

    // Validation du nom
    if (!name) {
      alert('Le nom du tag est requis.');
      elements.nameInput.focus();
      return;
    }

    // Validation de l'icône
    if (!isValidIcon(icon)) {
      alert('L\'icône doit être au format FontAwesome (ex: fa-tag).');
      elements.iconInput.focus();
      return;
    }

    // Validation de la couleur
    if (!isValidColor(color)) {
      alert('La couleur doit être au format hexadécimal (ex: #3B82F6).');
      elements.colorInput.focus();
      return;
    }

    // Vérifier les doublons (sauf si on édite le même tag)
    const isDuplicate = currentTags.some((t, idx) => {
      return idx !== editingTagIndex && t.name.toLowerCase() === name.toLowerCase();
    });

    if (isDuplicate) {
      alert('Un tag avec ce nom existe déjà.');
      elements.nameInput.focus();
      return;
    }

    // Créer l'objet tag
    const tag = { name, icon, color };

    if (editingTagIndex !== null) {
      // MODE ÉDITION : Mettre à jour le tag existant
      currentTags[editingTagIndex] = tag;
      console.log('[ContribCategoryTags] Tag modifié:', tag);
    } else {
      // MODE CRÉATION : Ajouter un nouveau tag
      currentTags.push(tag);
      console.log('[ContribCategoryTags] Tag ajouté:', tag);
    }

    // Réinitialiser le formulaire et l'état
    resetForm();
    updateFormState();
    renderTagsList();
  }

  /**
   * Passe en mode édition d'un tag
   * @param {number} index - Index du tag à éditer
   */
  function editTag(index) {
    if (index < 0 || index >= currentTags.length) {
      console.error('[ContribCategoryTags] Index invalide:', index);
      return;
    }

    const tag = currentTags[index];

    // Pré-remplir le formulaire
    if (elements.nameInput) elements.nameInput.value = tag.name;
    if (elements.iconInput) elements.iconInput.value = tag.icon;
    if (elements.colorInput) elements.colorInput.value = tag.color;

    // Passer en mode édition
    editingTagIndex = index;
    updateFormState();

    // Focus sur le champ nom
    if (elements.nameInput) elements.nameInput.focus();

    console.log('[ContribCategoryTags] Mode édition activé pour:', tag);
  }

  /**
   * Supprime un tag
   * @param {number} index - Index du tag à supprimer
   */
  function deleteTag(index) {
    if (index < 0 || index >= currentTags.length) {
      console.error('[ContribCategoryTags] Index invalide:', index);
      return;
    }

    const tag = currentTags[index];

    // Confirmation
    if (!confirm(`Supprimer le tag "${tag.name}" ?\n\nCette action ne peut pas être annulée.`)) {
      return;
    }

    // Supprimer le tag
    currentTags.splice(index, 1);
    console.log('[ContribCategoryTags] Tag supprimé:', tag);

    // Si on était en train d'éditer ce tag, réinitialiser
    if (editingTagIndex === index) {
      resetForm();
      updateFormState();
    } else if (editingTagIndex !== null && editingTagIndex > index) {
      // Ajuster l'index si nécessaire
      editingTagIndex--;
    }

    renderTagsList();
  }

  /**
   * Annule l'édition en cours
   */
  function cancelEdit() {
    resetForm();
    updateFormState();
    console.log('[ContribCategoryTags] Édition annulée');
  }

  /**
   * Réinitialise le formulaire
   */
  function resetForm() {
    if (elements.nameInput) elements.nameInput.value = '';
    if (elements.iconInput) elements.iconInput.value = 'fa-tag';
    if (elements.colorInput) elements.colorInput.value = '#3B82F6';

    editingTagIndex = null;
  }

  /**
   * Met à jour l'état visuel du formulaire (création vs édition)
   */
  function updateFormState() {
    const isEditing = editingTagIndex !== null;

    // Changer le texte du bouton
    if (elements.addBtnText) {
      elements.addBtnText.textContent = isEditing ? 'Enregistrer' : 'Ajouter le tag';
    }

    // Afficher/masquer le bouton Annuler
    if (elements.cancelBtn) {
      elements.cancelBtn.style.display = isEditing ? 'inline-block' : 'none';
    }

    // Afficher/masquer le message d'édition
    if (elements.editMessage) {
      elements.editMessage.style.display = isEditing ? 'block' : 'none';
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialise le module
   */
  function init() {
    console.log('[ContribCategoryTags] Initialisation...');

    // Cache les éléments DOM
    cacheElements();

    // Vérifier que les éléments existent
    if (!elements.addBtn || !elements.nameInput) {
      console.warn('[ContribCategoryTags] Éléments requis introuvables, initialisation annulée');
      return;
    }

    // Bind le bouton "Ajouter le tag"
    elements.addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addTag();
    });

    // Bind le bouton "Annuler"
    if (elements.cancelBtn) {
      elements.cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cancelEdit();
      });
    }

    // Bind Enter sur le champ nom
    if (elements.nameInput) {
      elements.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addTag();
        }
      });
    }

    console.log('[ContribCategoryTags] Module initialisé');
  }

  /**
   * Charge les tags d'une catégorie
   * @param {Array} tags - Tableau de tags [{name, icon, color}, ...]
   */
  function loadTags(tags) {
    if (!Array.isArray(tags)) {
      console.warn('[ContribCategoryTags] loadTags: paramètre invalide', tags);
      currentTags = [];
    } else {
      currentTags = tags.map(tag => ({
        name: tag.name || '',
        icon: tag.icon || 'fa-tag',
        color: tag.color || '#3B82F6'
      }));
    }

    console.log('[ContribCategoryTags] Tags chargés:', currentTags.length);

    renderTagsList();
  }

  /**
   * Récupère les tags actuels
   * @returns {Array} Copie du tableau de tags
   */
  function getTags() {
    return currentTags.map(tag => ({ ...tag }));
  }

  /**
   * Réinitialise tout
   */
  function reset() {
    currentTags = [];
    editingTagIndex = null;
    resetForm();
    updateFormState();
    renderTagsList();
    console.log('[ContribCategoryTags] Réinitialisation complète');
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribCategoryTags = {
    init,
    loadTags,
    getTags,
    reset
  };

  console.log('[ContribCategoryTags] Module chargé');

})(window);
