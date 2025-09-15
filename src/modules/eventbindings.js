import { FilterModule } from './filtermodule.js';
import { MapModule } from './mapmodule.js';
import { UIModule } from './uimodule.js';
import { DataModule } from './datamodule.js';
import { NavigationModule } from './navigationmodule.js';

// modules/EventBindings.js
export const EventBindingsModule = (() => {

  const handleNavigation = (menu, layersToDisplay) => {
  // 0. Toggle “active” on the clicked nav button
  document.querySelectorAll('.nav-category').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`nav-${menu}`).classList.add('active');
    // Masquer complètement le panneau de détail du projet
    const projectDetailPanel = document.getElementById('project-detail');
    if (projectDetailPanel) {
      projectDetailPanel.classList.remove('visible');
      projectDetailPanel.style.display = 'none';
    }
    
    // Réinitialiser les filtres
    document.querySelectorAll('.filter-item').forEach(item => {
      item.classList.remove('active-filter');
      const layer = item.dataset.layer;
      UIModule.resetLayerFilter(layer);
    });
    FilterModule.resetAll();

    // Réinitialiser le style de la navigation gauche
    const leftNav = document.getElementById('left-nav');
    if (leftNav) {
      if (window.innerWidth < 1024) {
    leftNav.style.borderRadius = '0 0 20px 20px';
  } else {
    leftNav.style.borderRadius = '20px 0 0 20px';
  }
    }

    // Gestion des couches à afficher
    if (Array.isArray(layersToDisplay)) {
      // Retirer les couches non désirées
      Object.keys(MapModule.layers).forEach(layerName => {
        if (!layersToDisplay.includes(layerName)) {
          MapModule.removeLayer(layerName);
        }
      });
      // Charger les couches désirées
      layersToDisplay.forEach(layerName => {
        if (!MapModule.layers[layerName]) {
          if (DataModule.layerData && DataModule.layerData[layerName]) {
            DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
          } else {
            DataModule.loadLayer(layerName);
          }
        }
      });
    }

    // Lancer l’affichage des projets selon le menu sélectionné
    if (menu === 'transport') {
      NavigationModule.renderTransportProjects();
    } else if (menu === 'velo') {
      NavigationModule.renderVeloProjects();
    } else if (menu === 'urbanisme') {
      NavigationModule.renderUrbanismeProjects();
    } else if (menu === 'travaux') {
      NavigationModule.renderTravauxProjects();
      // Assurer la présence de la légende de progression
      ensureTravauxLegend();
    }
  };

  // Insère une card de légende dans le sous-menu Travaux (une seule fois)
  const ensureTravauxLegend = () => {
    try {
      const container = document.getElementById('travaux-submenu');
      if (!container) return;
      if (container.querySelector('#travaux-legend-card')) return; // déjà présent

      const list = container.querySelector('#travaux-project-list');
      const card = document.createElement('div');
      card.id = 'travaux-legend-card';
      card.className = 'legend-card travaux-legend-card';
      card.innerHTML = `
        <div class="legend-header">
          <i class="fa-solid fa-gauge-high" aria-hidden="true"></i>
          <span class="legend-title">Avancement des travaux</span>
        </div>
        <div class="legend-gradient" aria-hidden="true"></div>
        <div class="legend-scale" aria-hidden="true">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>`;

      // Insérer la card avant la liste
      if (list && list.parentNode) {
        list.parentNode.insertBefore(card, list);
      } else {
        container.prepend(card);
      }
    } catch (_) { /* silencieux */ }
  };

  // Gestion des contrôles de filtres
  const bindFilterControls = () => {
    // 5. Clic en-dehors → fermer tous les sous-panneaux
    document.addEventListener('click', e => {
      if (!e.target.closest('.filter-item') && !e.target.closest('.subfilters-container')) {
        document.querySelectorAll('.subfilters-container').forEach(sub => sub.style.display = 'none');
      }
    });

    // 1. Réinitialisation globale
    const resetBtn = document.getElementById('reset-all-filters');
    resetBtn.addEventListener('click', () => {
      document.querySelectorAll('.filter-item').forEach(item => {
        const layer = item.dataset.layer;
        item.classList.remove('active-filter');
        UIModule.resetLayerFilter(layer);
        const sub = document.querySelector(`.subfilters-container[data-layer="${layer}"]`);
        if (sub) sub.style.display = 'none';
      });
      FilterModule.resetAll();
    });

    // 2. Clic sur un filtre (pas le ⚙️) : active/désactive sans ouvrir le panneau
    document.querySelectorAll('.filter-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.settings-btn')) return;
        const layer = item.dataset.layer;
        const sub = document.querySelector(`.subfilters-container[data-layer="${layer}"]`);

        if (!item.classList.contains('active-filter')) {
          // Activation
          if (DataModule.layerData?.[layer]) {
            DataModule.createGeoJsonLayer(layer, DataModule.layerData[layer]);
          } else {
            DataModule.loadLayer(layer);
          }
          item.classList.add('active-filter');
        } else {
          // Désactivation
          item.classList.remove('active-filter');
          MapModule.removeLayer(layer);
          UIModule.resetLayerFilter(layer);
          if (sub) sub.style.display = 'none';
        }
      });
    });

    // 3. Clic sur ⚙️ : active si besoin, puis bascule le panneau
    document.querySelectorAll('.settings-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const layer = btn.dataset.layer;
        const item  = document.querySelector(`.filter-item[data-layer="${layer}"]`);
        const sub   = document.querySelector(`.subfilters-container[data-layer="${layer}"]`);

        // Si déjà ouvert, fermer simplement
        if (sub && !(sub.style.display === 'none' || getComputedStyle(sub).display === 'none')) {
          sub.style.display = 'none';
          return;
        }

        // Assurer l'activation de la couche si nécessaire
        if (!item.classList.contains('active-filter')) {
          if (DataModule.layerData?.[layer]) {
            DataModule.createGeoJsonLayer(layer, DataModule.layerData[layer]);
          } else {
            DataModule.loadLayer(layer);
          }
          item.classList.add('active-filter');
        }

        // Construire et afficher les sous-filtres
        if (UIModule?.buildSubFilters) {
          UIModule.buildSubFilters(layer);
        } else if (sub) {
          sub.style.display = 'block';
        }
      });
    });
  };

  // Récupération des boutons de navigation
  const navTransport = document.getElementById('nav-transport');
  const navVelo = document.getElementById('nav-velo');
  const navUrbanisme = document.getElementById('nav-urbanisme');
  const navTravaux = document.getElementById('nav-travaux');

  navTransport.addEventListener('click', () => {
    // Appeler la navigation pour Transport
    const transportLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.transport)
      || ['metroFuniculaire', 'tramway', 'reseauProjeteSitePropre'];
    handleNavigation('transport', transportLayers);
    // Afficher le sous-menu transport et masquer les autres
    document.getElementById('transport-submenu').style.display = 'block';
    document.getElementById('velo-submenu').style.display = 'none';
    document.getElementById('urbanisme-submenu').style.display = 'none';
    document.getElementById('travaux-submenu').style.display = 'none';
  });

  navVelo.addEventListener('click', () => {
    const veloLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.velo)
      || ['planVelo', 'voielyonnaise'];
    handleNavigation('velo', veloLayers);
    document.getElementById('velo-submenu').style.display = 'block';
    document.getElementById('transport-submenu').style.display = 'none';
    document.getElementById('urbanisme-submenu').style.display = 'none';
    document.getElementById('travaux-submenu').style.display = 'none';
  });

  navUrbanisme.addEventListener('click', () => {
    const urbLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.urbanisme)
      || ['urbanisme'];
    handleNavigation('urbanisme', urbLayers);
    document.getElementById('urbanisme-submenu').style.display = 'block';
    document.getElementById('transport-submenu').style.display = 'none';
    document.getElementById('velo-submenu').style.display = 'none';
    document.getElementById('travaux-submenu').style.display = 'none';
  });

  navTravaux.addEventListener('click', () => {
    const trvxLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.travaux)
      || ['travaux'];
    handleNavigation('travaux', trvxLayers);
    document.getElementById('travaux-submenu').style.display = 'block';
    document.getElementById('transport-submenu').style.display = 'none';
    document.getElementById('velo-submenu').style.display = 'none';
    document.getElementById('urbanisme-submenu').style.display = 'none';
    // Sécurité: s'assurer que la légende est présente après clic direct
    ensureTravauxLegend();
  });

  return {
    bindFilterControls,
    handleNavigation
  };
})();
