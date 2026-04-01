// modules/city-redirect.js
// Gestion de la redirection automatique vers la structure de l'utilisateur après connexion

;(function(win) {
  'use strict';

  /**
   * Affiche une popup de sélection de structure
   * @param {Array<string>} cities - Liste des codes structures accessibles
   * @returns {Promise<string|null>} - Code structure sélectionné ou null si annulé
   */
  async function showCitySelectionPopup(cities) {
    // Récupérer les infos des villes avec l'async pour avoir les logos depuis le cache ou Supabase
    const cityInfos = await Promise.all(cities.map(async (code) => {
      const info = await win.CityManager?.getCityInfoAsync?.(code) 
                || win.CityManager?.getCityInfo?.(code);
      return {
        code,
        name: info?.brand_name || code,
        logo: info?.logo_url || null
      };
    }));

    return new Promise((resolve) => {
      // Créer l'overlay
      const overlay = document.createElement('div');
      overlay.id = 'city-selection-overlay';
      overlay.className = 'gp-modal-overlay gp-modal--glass';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'city-selection-title');

      // Créer la modale
      const modal = document.createElement('div');
      modal.className = 'gp-modal gp-modal--compact';
      modal.setAttribute('role', 'document');

      // Header
      const header = document.createElement('div');
      header.className = 'gp-modal-header';
      header.innerHTML = `
        <h2 id="city-selection-title" class="gp-modal-title">
          <i class="fa-solid fa-building"></i>
          Sélectionnez votre structure
        </h2>
        <button type="button" class="gp-modal-close" aria-label="Fermer">&times;</button>
      `;

      // Body
      const body = document.createElement('div');
      body.className = 'gp-modal-body';
      
      const subtitle = document.createElement('p');
      subtitle.className = 'gp-modal-intro gp-text-center';
      subtitle.textContent = `Vous avez accès à ${cities.length} structure${cities.length > 1 ? 's' : ''}`;
      body.appendChild(subtitle);

      const list = document.createElement('div');
      list.className = 'gp-structure-list';

      cityInfos.forEach(city => {
        const card = document.createElement('button');
        card.className = 'gp-structure-card';
        card.dataset.city = city.code;
        card.setAttribute('type', 'button');

        // Logo ou initiale
        const visual = document.createElement('div');
        visual.className = 'gp-structure-card-visual';

        if (city.logo) {
          const img = document.createElement('img');
          img.src = city.logo;
          img.alt = city.name;
          img.loading = 'eager';
          img.addEventListener('error', () => {
            img.remove();
            const fallback = document.createElement('span');
            fallback.className = 'gp-structure-card-initial';
            fallback.textContent = city.name.charAt(0).toUpperCase();
            visual.appendChild(fallback);
          });
          visual.appendChild(img);
        } else {
          const initial = document.createElement('span');
          initial.className = 'gp-structure-card-initial';
          initial.textContent = city.name.charAt(0).toUpperCase();
          visual.appendChild(initial);
        }

        // Infos texte
        const info = document.createElement('div');
        info.className = 'gp-structure-card-info';
        
        const name = document.createElement('div');
        name.className = 'gp-structure-card-name';
        name.textContent = city.name;
        
        const code = document.createElement('div');
        code.className = 'gp-structure-card-code';
        code.textContent = city.code;
        
        info.appendChild(name);
        info.appendChild(code);

        // Flèche
        const arrow = document.createElement('div');
        arrow.className = 'gp-structure-card-arrow';
        arrow.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';

        card.appendChild(visual);
        card.appendChild(info);
        card.appendChild(arrow);
        list.appendChild(card);
      });

      body.appendChild(list);

      // Assembler
      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Handlers
      let resolved = false;
      const close = (city = null) => {
        if (resolved) return;
        resolved = true;
        win.ModalHelper?.close('city-selection-overlay');
        // Nettoyer le DOM (modale dynamique)
        setTimeout(() => overlay.remove(), 300);
        resolve(city);
      };

      // Clic sur les cartes
      list.querySelectorAll('.gp-structure-card').forEach(card => {
        card.addEventListener('click', () => close(card.dataset.city));
      });

      // Ouvrir avec ModalHelper
      win.ModalHelper?.open('city-selection-overlay', {
        focusTrap: true,
        dismissible: true,
        onClose: () => close(null)
      });

      // Focus sur la première carte
      setTimeout(() => {
        const first = list.querySelector('.gp-structure-card');
        if (first) first.focus();
      }, 100);
    });
  }

  /**
   * Redirige automatiquement vers la structure de l'utilisateur
   * @param {number} retryCount - Nombre de tentatives restantes
   */
  async function handleCityRedirect(retryCount = 5) {
    try {
      // Vérifier si la redirection est désactivée (pour debug)
      if (win.__DISABLE_CITY_REDIRECT === true) {
        console.log('[city-redirect] Redirect disabled by __DISABLE_CITY_REDIRECT flag');
        return;
      }

      // Vérifier si on est déjà sur une page structure
      const currentUrl = new URL(window.location.href);
      const currentCity = currentUrl.searchParams.get('city');
      
      // Si déjà sur une structure, ne rien faire
      if (currentCity) {
        return;
      }

      // Récupérer les villes de l'utilisateur
      const userVilles = win.__CONTRIB_VILLES;
      
      // Si __CONTRIB_VILLES n'est pas encore défini, réessayer
      if (userVilles === undefined && retryCount > 0) {
        setTimeout(() => handleCityRedirect(retryCount - 1), 200);
        return;
      }
      
      if (!userVilles || !Array.isArray(userVilles)) {
        return;
      }

      // Filtrer 'global' qui n'est pas une vraie structure
      const actualCities = userVilles.filter(v => v !== 'global');
      
      if (actualCities.length === 0) {
        return;
      }

      let targetCity = null;

      if (actualCities.length === 1) {
        // Une seule structure : redirection automatique
        targetCity = actualCities[0];
      } else {
        // Plusieurs structures : afficher la popup de sélection
        targetCity = await showCitySelectionPopup(actualCities);
        
        if (!targetCity) {
          return;
        }
      }

      // Rediriger vers la structure
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('city', targetCity);
      window.location.href = newUrl.href;

    } catch (error) {
      console.error('[city-redirect] Error during city redirect:', error);
    }
  }

  /**
   * Initialise le système de redirection automatique
   */
  function init() {

    // Écouter les changements d'état d'authentification
    if (win.AuthModule && typeof win.AuthModule.onAuthStateChange === 'function') {
      win.AuthModule.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          // handleCityRedirect va attendre que __CONTRIB_VILLES soit défini
          handleCityRedirect();
        }
      });
    }

    // Vérifier aussi la session actuelle au chargement
    if (win.AuthModule && typeof win.AuthModule.getSession === 'function') {
      win.AuthModule.getSession().then(({ data }) => {
        if (data?.session?.user) {
          handleCityRedirect();
        }
      }).catch(err => {
        console.error('[city-redirect] Error getting session:', err);
      });
    }
  }

  /**
   * Désactive temporairement la redirection automatique
   * Utile pour le debug
   */
  function disableRedirect() {
    win.__DISABLE_CITY_REDIRECT = true;
    console.log('[city-redirect] Auto-redirect disabled. Use CityRedirect.enableRedirect() to re-enable.');
  }

  /**
   * Réactive la redirection automatique
   */
  function enableRedirect() {
    win.__DISABLE_CITY_REDIRECT = false;
    console.log('[city-redirect] Auto-redirect enabled.');
  }

  // Export
  win.CityRedirect = {
    init,
    showCitySelectionPopup,
    handleCityRedirect,
    disableRedirect,
    enableRedirect
  };

})(window);
