// modules/contrib/contrib-tags.js
// Gestion du système de tags pour les contributions

;(function(win) {
  'use strict';

  /**
   * Récupère les tags disponibles pour une catégorie depuis category_icons
   * @param {string} category - Nom de la catégorie
   * @returns {Array} Liste des tags [{name, color, icon}, ...]
   */
  function getAvailableTagsForCategory(category) {
    if (!category || !window.categoryIcons) return [];
    
    const categoryIcon = window.categoryIcons.find(c => c.category === category);
    
    if (!categoryIcon || !categoryIcon.available_tags) return [];
    
    // Parser si c'est une string JSON
    try {
      const tags = typeof categoryIcon.available_tags === 'string'
        ? JSON.parse(categoryIcon.available_tags)
        : categoryIcon.available_tags;
      
      return Array.isArray(tags) ? tags : [];
    } catch (e) {
      console.warn('[ContribTags] Erreur parse available_tags:', e);
      return [];
    }
  }

  /**
   * Affiche les tags sélectionnables pour une catégorie
   * @param {string} category - Nom de la catégorie
   */
  function renderTagsSelector(category) {
    const container = document.getElementById('contrib-tags-container');
    const group = document.getElementById('contrib-tags-group');
    
    if (!container || !group) {
      console.warn('[ContribTags] Conteneur tags introuvable');
      return;
    }

    // Si pas de catégorie, masquer la section
    if (!category) {
      group.style.display = 'none';
      return;
    }

    // Charger les tags disponibles
    const availableTags = getAvailableTagsForCategory(category);

    // Si aucun tag disponible, masquer la section
    if (availableTags.length === 0) {
      group.style.display = 'none';
      return;
    }

    // Afficher la section
    group.style.display = 'block';

    // Générer les checkboxes
    const tagsHTML = availableTags.map((tag, index) => {
      const tagId = `tag-${category}-${index}`;
      const tagColor = tag.color || 'var(--primary)';
      const tagIcon = tag.icon || 'fa-tag';
      
      return `
        <input 
          type="checkbox" 
          id="${tagId}" 
          class="tag-checkbox" 
          value="${escapeHtml(tag.name)}"
          data-tag-color="${tagColor}"
        >
        <label 
          for="${tagId}" 
          class="tag-label"
          style="--tag-color: ${tagColor};"
          tabindex="0"
          role="button"
          aria-pressed="false"
        >
          <i class="fa-solid ${tagIcon}"></i>
          <span>${escapeHtml(tag.name)}</span>
          <i class="fa-solid fa-check"></i>
        </label>
      `;
    }).join('');

    container.innerHTML = tagsHTML;

    // Ajouter support clavier
    addKeyboardSupport();
  }

  /**
   * Ajoute le support clavier pour les tags
   */
  function addKeyboardSupport() {
    const labels = document.querySelectorAll('.tag-label');
    
    labels.forEach(label => {
      // Gestion du clavier
      label.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const checkbox = document.getElementById(label.getAttribute('for'));
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            label.setAttribute('aria-pressed', checkbox.checked);
          }
        }
      });
      
      // Mise à jour aria-pressed au clic
      label.addEventListener('click', () => {
        setTimeout(() => {
          const checkbox = document.getElementById(label.getAttribute('for'));
          if (checkbox) {
            label.setAttribute('aria-pressed', checkbox.checked);
          }
        }, 0);
      });
    });
  }

  /**
   * Récupère les tags sélectionnés
   * @returns {Array<string>} Liste des tags sélectionnés
   */
  function getSelectedTags() {
    const checkboxes = document.querySelectorAll('.tag-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
  }

  /**
   * Pré-remplit les tags (pour l'édition)
   * @param {Array<string>} tags - Liste des tags à cocher
   */
  function setSelectedTags(tags) {
    if (!Array.isArray(tags)) return;
    
    const checkboxes = document.querySelectorAll('.tag-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = tags.includes(checkbox.value);
      const label = document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) {
        label.setAttribute('aria-pressed', checkbox.checked);
      }
    });
  }

  /**
   * Réinitialise la sélection des tags
   */
  function resetTags() {
    const checkboxes = document.querySelectorAll('.tag-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
      const label = document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) {
        label.setAttribute('aria-pressed', 'false');
      }
    });
  }

  /**
   * Initialise le système de tags
   */
  function init() {
    const categorySelect = document.getElementById('contrib-category');
    
    if (!categorySelect) {
      console.warn('[ContribTags] Select catégorie introuvable');
      return;
    }

    console.log('[ContribTags] Initialisation du système de tags');

    // Écouter les changements de catégorie
    categorySelect.addEventListener('change', () => {
      const category = categorySelect.value;
      console.log('[ContribTags] Changement catégorie:', category);
      resetTags(); // Réinitialiser avant d'afficher les nouveaux tags
      renderTagsSelector(category);
    });

    // Affichage initial si une catégorie est déjà sélectionnée
    if (categorySelect.value) {
      renderTagsSelector(categorySelect.value);
    }
  }

  /**
   * Échappe les caractères HTML
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // API publique
  win.ContribTags = {
    init,
    renderTagsSelector,
    getSelectedTags,
    setSelectedTags,
    resetTags,
    getAvailableTagsForCategory
  };

  console.log('[ContribTags] Module chargé');

})(window);
