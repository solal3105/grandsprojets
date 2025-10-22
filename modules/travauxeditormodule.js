// modules/TravauxEditorModule.js
// Module pour éditer/créer des chantiers travaux avec dessin sur carte
const TravauxEditorModule = (() => {
  let drawnItems = null;
  let currentFeatures = [];
  let isDrawingMode = false;
  
  /**
   * Initialise Leaflet.Draw et configure les icônes
   */
  function initLeafletDraw() {
    if (!window.L || !window.L.Control || !window.L.Control.Draw) {
      console.error('[TravauxEditor] Leaflet.Draw non chargé. Ajouter CDN dans index.html');
      return false;
    }
    
    // Configurer le chemin des icônes Leaflet
    if (window.L.Icon && window.L.Icon.Default) {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'vendor/leaflet/images/marker-icon-2x.png',
        iconUrl: 'vendor/leaflet/images/marker-icon.png',
        shadowUrl: 'vendor/leaflet/images/marker-shadow.png'
      });
    }
    
    // Créer une FeatureGroup pour stocker les éléments dessinés
    if (!drawnItems) {
      drawnItems = new L.FeatureGroup();
      window.MapModule?.map.addLayer(drawnItems);
    }
    
    return true;
  }
  
  /**
   * Démarre le mode dessin (ÉTAPE 1)
   */
  function openEditor() {
    // Vérifier auth
    checkAuth().then(authOk => {
      if (!authOk) {
        alert('Vous devez être connecté et admin de la ville pour ajouter un chantier.');
        return;
      }
      
      // Vérifier Leaflet.Draw
      if (!initLeafletDraw()) {
        alert('Leaflet.Draw n\'est pas chargé. Impossible d\'ouvrir l\'éditeur.');
        return;
      }
      
      // Activer le mode dessin
      startDrawingMode();
    });
  }
  
  /**
   * Active le mode dessin sur la carte
   */
  function startDrawingMode() {
    if (isDrawingMode) return;
    
    isDrawingMode = true;
    currentFeatures = [];
    drawnItems.clearLayers();
    
    // Afficher le panel de dessin dans le submenu
    showDrawingInstructions();
    
    // Écouter les événements de dessin
    if (window.MapModule?.map) {
      window.MapModule.map.on(L.Draw.Event.CREATED, handleDrawCreated);
      window.MapModule.map.on(L.Draw.Event.EDITED, handleDrawEdited);
      window.MapModule.map.on(L.Draw.Event.DELETED, handleDrawDeleted);
    }
  }
  
  /**
   * Affiche le panel de dessin dans le submenu
   */
  function showDrawingInstructions() {
    const panel = document.getElementById('travaux-drawing-panel');
    if (!panel) {
      console.error('[TravauxEditor] Panel de dessin non trouvé');
      return;
    }
    
    // Afficher le panel
    panel.style.display = 'block';
    
    // Event listeners pour les outils de dessin
    const tools = panel.querySelectorAll('.travaux-draw-tool');
    tools.forEach(tool => {
      tool.addEventListener('click', () => {
        const toolType = tool.dataset.tool;
        activateDrawTool(toolType);
        
        // Marquer l'outil comme actif
        tools.forEach(t => t.classList.remove('active'));
        tool.classList.add('active');
      });
    });
    
    // Event listeners pour les boutons d'action
    const finishBtn = panel.querySelector('#travaux-finish-drawing');
    const cancelBtn = panel.querySelector('#travaux-cancel-drawing');
    
    if (finishBtn) finishBtn.addEventListener('click', finishDrawing);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelDrawing);
  }
  
  /**
   * Active un outil de dessin spécifique
   */
  function activateDrawTool(toolType) {
    if (!window.MapModule?.map || !drawnItems) return;
    
    const map = window.MapModule.map;
    
    // Options de dessin par défaut
    const drawOptions = {
      polyline: {
        shapeOptions: {
          color: '#3388ff',
          weight: 4
        }
      },
      polygon: {
        shapeOptions: {
          color: '#3388ff'
        }
      },
      marker: {},
      rectangle: {
        shapeOptions: {
          color: '#3388ff'
        }
      }
    };
    
    // Activer l'outil correspondant
    switch(toolType) {
      case 'polyline':
        new L.Draw.Polyline(map, drawOptions.polyline).enable();
        break;
      case 'polygon':
        new L.Draw.Polygon(map, drawOptions.polygon).enable();
        break;
      case 'marker':
        new L.Draw.Marker(map, drawOptions.marker).enable();
        break;
      case 'rectangle':
        new L.Draw.Rectangle(map, drawOptions.rectangle).enable();
        break;
    }
  }
  
  /**
   * Gère la création d'une feature
   */
  function handleDrawCreated(e) {
    const layer = e.layer;
    drawnItems.addLayer(layer);
    currentFeatures.push(layer.toGeoJSON());
    console.log('[TravauxEditor] Feature dessinée:', currentFeatures.length);
  }
  
  /**
   * Gère l'édition de features
   */
  function handleDrawEdited(e) {
    currentFeatures = [];
    drawnItems.eachLayer(layer => {
      currentFeatures.push(layer.toGeoJSON());
    });
    console.log('[TravauxEditor] Features éditées:', currentFeatures.length);
  }
  
  /**
   * Gère la suppression de features
   */
  function handleDrawDeleted(e) {
    currentFeatures = [];
    drawnItems.eachLayer(layer => {
      currentFeatures.push(layer.toGeoJSON());
    });
    console.log('[TravauxEditor] Features supprimées, reste:', currentFeatures.length);
  }
  
  /**
   * Termine le dessin et ouvre le formulaire (ÉTAPE 2)
   */
  function finishDrawing() {
    if (currentFeatures.length === 0) {
      alert('Veuillez dessiner au moins une géométrie sur la carte.');
      return;
    }
    
    // Retirer le mode dessin
    stopDrawingMode();
    
    // Ouvrir la modale avec le formulaire
    showFormModal();
  }
  
  /**
   * Annule le dessin
   */
  function cancelDrawing() {
    if (confirm('Annuler la création du chantier ?')) {
      stopDrawingMode();
      drawnItems.clearLayers();
      currentFeatures = [];
    }
  }
  
  /**
   * Désactive le mode dessin
   */
  function stopDrawingMode() {
    isDrawingMode = false;
    
    // Retirer les listeners de dessin
    if (window.MapModule?.map) {
      window.MapModule.map.off(L.Draw.Event.CREATED, handleDrawCreated);
      window.MapModule.map.off(L.Draw.Event.EDITED, handleDrawEdited);
      window.MapModule.map.off(L.Draw.Event.DELETED, handleDrawDeleted);
    }
    
    // Cacher le panel de dessin
    const panel = document.getElementById('travaux-drawing-panel');
    if (panel) {
      panel.style.display = 'none';
      
      // Retirer la classe active des outils
      const tools = panel.querySelectorAll('.travaux-draw-tool');
      tools.forEach(t => t.classList.remove('active'));
    }
  }
  
  /**
   * Vérifie l'authentification et les permissions
   */
  async function checkAuth() {
    try {
      const { data: { session } } = await window.supabaseService?.getClient()?.auth.getSession();
      if (!session?.user) return false;
      
      // Utiliser les variables globales définies par contrib.js (depuis table profiles)
      const role = window.__CONTRIB_ROLE || '';
      const userVilles = window.__CONTRIB_VILLES || [];
      const activeCity = (typeof window.getActiveCity === 'function') ? window.getActiveCity() : window.activeCity;
      
      // Vérifier si admin
      const isAdmin = role === 'admin';
      if (!isAdmin) return false;
      
      // Admin global: ville contient 'global'
      const isGlobalAdmin = Array.isArray(userVilles) && userVilles.includes('global');
      
      // Admin de la ville spécifique
      const isCityAdmin = Array.isArray(userVilles) && userVilles.includes(activeCity);
      
      console.log('[TravauxEditor] checkAuth:', { role, userVilles, activeCity, isGlobalAdmin, isCityAdmin });
      
      return isGlobalAdmin || isCityAdmin;
    } catch (err) {
      console.error('[TravauxEditor] Erreur vérification auth:', err);
      return false;
    }
  }
  
  /**
   * Affiche la modale de formulaire (ÉTAPE 2)
   */
  function showFormModal() {
    // Créer l'overlay si nécessaire
    let overlay = document.getElementById('travaux-form-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'travaux-form-overlay';
      overlay.className = 'gp-modal-overlay gp-modal--glass';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'travaux-form-title');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = `
        <div class="gp-modal" role="document">
          <header class="gp-modal-header">
            <h1 class="gp-modal-title" id="travaux-form-title">Informations du chantier</h1>
            <button class="btn-secondary gp-modal-close" aria-label="Fermer">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </header>
          <div class="gp-modal-body">
            <form id="travaux-editor-form" style="display:flex; flex-direction:column; gap:1em;">
              <div class="form-field">
                <label for="travaux-name">Nom du chantier *</label>
                <input type="text" id="travaux-name" name="name" required placeholder="Ex: Rénovation Rue de la République">
              </div>
              
              <div class="form-field">
                <label for="travaux-nature">Nature des travaux</label>
                <input type="text" id="travaux-nature" name="nature" placeholder="Ex: Réfection de chaussée">
              </div>
              
              <div class="form-field">
                <label for="travaux-etat">État</label>
                <select id="travaux-etat" name="etat">
                  <option value="">Non spécifié</option>
                  <option value="Prochain">Prochain</option>
                  <option value="Ouvert">Ouvert</option>
                  <option value="Terminé">Terminé</option>
                </select>
              </div>
              
              <div class="form-field">
                <label for="travaux-date-debut">Date début</label>
                <input type="date" id="travaux-date-debut" name="date_debut">
              </div>
              
              <div class="form-field">
                <label for="travaux-date-fin">Date fin</label>
                <input type="date" id="travaux-date-fin" name="date_fin">
              </div>
              
              <div class="form-field">
                <label for="travaux-localisation">Localisation</label>
                <input type="text" id="travaux-localisation" name="localisation" placeholder="Ex: Lyon 6e, Rue Victor Hugo">
              </div>
              
              <div class="form-field">
                <label for="travaux-description">Description</label>
                <textarea id="travaux-description" name="description" rows="3" placeholder="Détails supplémentaires..."></textarea>
              </div>
              
              <div id="travaux-editor-status" style="display:none; padding:1em; border-radius:8px; margin-top:1em;"></div>
              
              <div class="form-actions" style="display:flex; gap:1em; justify-content:flex-end; margin-top:1em;">
                <button type="button" class="btn-secondary" id="travaux-form-cancel">Annuler</button>
                <button type="submit" class="btn-primary" id="travaux-save">
                  <i class="fa-solid fa-check"></i> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      
      // Event listeners
      overlay.querySelector('#travaux-editor-form').addEventListener('submit', handleSave);
      overlay.querySelector('#travaux-form-cancel').addEventListener('click', () => {
        if (confirm('Annuler la création du chantier ? Les géométries dessinées seront perdues.')) {
          closeFormModal();
          drawnItems.clearLayers();
          currentFeatures = [];
        }
      });
    }
    
    // Ouvrir avec ModalHelper
    if (window.ModalHelper) {
      window.ModalHelper.open('travaux-form-overlay', {
        dismissible: false, // Forcer à utiliser les boutons
        onClose: () => {
          // Nettoyer si fermé
          const form = document.getElementById('travaux-editor-form');
          if (form) form.reset();
        }
      });
    }
  }
  
  /**
   * Ferme la modale de formulaire
   */
  function closeFormModal() {
    if (window.ModalHelper) {
      window.ModalHelper.close('travaux-form-overlay');
    }
  }
  
  /**
   * Gère la sauvegarde
   */
  async function handleSave(e) {
    e.preventDefault();
    
    const statusEl = document.getElementById('travaux-editor-status');
    const saveBtn = document.getElementById('travaux-save');
    
    try {
      // Les géométries ont déjà été dessinées à l'étape 1
      if (currentFeatures.length === 0) {
        showStatus('Erreur: aucune géométrie trouvée.', 'error');
        return;
      }
      
      // Récupérer les données du formulaire
      const formData = new FormData(e.target);
      const data = {
        name: formData.get('name'),
        nature: formData.get('nature') || '',
        etat: formData.get('etat') || '',
        date_debut: formData.get('date_debut') || null,
        date_fin: formData.get('date_fin') || null,
        localisation: formData.get('localisation') || '',
        description: formData.get('description') || ''
      };
      
      // Validation
      if (!data.name || data.name.trim() === '') {
        showStatus('Le nom du chantier est obligatoire.', 'error');
        return;
      }
      
      // Désactiver le bouton
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';
      showStatus('Enregistrement en cours...', 'info');
      
      // Construire le FeatureCollection
      const geojson = {
        type: 'FeatureCollection',
        features: currentFeatures
      };
      
      // Récupérer la ville active
      const activeCity = (typeof window.getActiveCity === 'function') ? window.getActiveCity() : window.activeCity;
      if (!activeCity) {
        throw new Error('Ville active non définie');
      }
      
      // Upload du GeoJSON
      showStatus('Upload du GeoJSON...', 'info');
      const geojsonUrl = await window.supabaseService.uploadTravauxGeoJSON(activeCity, geojson);
      
      // Créer l'entrée city_travaux
      showStatus('Création de l\'entrée...', 'info');
      const chantierData = {
        ville: activeCity,
        name: data.name.trim(),
        geojson_url: geojsonUrl,
        nature: data.nature,
        etat: data.etat,
        date_debut: data.date_debut,
        date_fin: data.date_fin,
        localisation: data.localisation,
        description: data.description,
        approved: true // Admin peut publier directement
      };
      
      await window.supabaseService.createCityTravaux(chantierData);
      
      showStatus('✅ Chantier créé avec succès !', 'success');
      
      // Recharger la couche travaux et fermer
      setTimeout(async () => {
        try {
          // Nettoyer les features dessinées
          drawnItems.clearLayers();
          currentFeatures = [];
          
          // Fermer la modale
          closeFormModal();
          
          // Recharger les données
          await window.DataModule?.loadLayer('travaux');
          
          // Recharger le submenu travaux si ouvert
          if (window.TravauxModule?.renderTravauxProjects) {
            await window.TravauxModule.renderTravauxProjects();
          }
        } catch (err) {
          console.error('[TravauxEditor] Erreur rechargement:', err);
        }
      }, 1500);
      
    } catch (err) {
      console.error('[TravauxEditor] Erreur sauvegarde:', err);
      showStatus(`❌ Erreur: ${err.message}`, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer';
    }
  }
  
  /**
   * Affiche un message de statut
   */
  function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('travaux-editor-status');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.style.padding = '1em';
    statusEl.style.borderRadius = '8px';
    statusEl.style.background = type === 'error' ? 'var(--danger-alpha-10)' : 
                                 type === 'success' ? 'var(--success-alpha-10)' : 
                                 'var(--info-alpha-10)';
    statusEl.style.color = type === 'error' ? 'var(--danger)' : 
                           type === 'success' ? 'var(--success)' : 
                           'var(--info)';
  }
  
  // API publique
  return {
    openEditor
  };
})();

// Exposer globalement
window.TravauxEditorModule = TravauxEditorModule;
