// modules/city-redirect.js
// Gestion de la redirection automatique vers la ville de l'utilisateur après connexion

;(function(win) {
  'use strict';

  /**
   * Affiche une popup de sélection de ville
   * @param {Array<string>} cities - Liste des codes villes accessibles
   * @returns {Promise<string|null>} - Code ville sélectionné ou null si annulé
   */
  function showCitySelectionPopup(cities) {
    return new Promise((resolve) => {
      // Créer l'overlay avec le système unifié
      const overlay = document.createElement('div');
      overlay.id = 'city-selection-overlay';
      overlay.className = 'gp-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'city-selection-title');

      // Créer la modale
      const modal = document.createElement('div');
      modal.className = 'gp-modal gp-modal--compact';
      modal.setAttribute('role', 'document');

      // Récupérer les infos des villes depuis window.CityManager
      const cityInfos = cities.map(code => {
        const info = win.CityManager?.getCityInfo?.(code);
        return {
          code,
          name: info?.brand_name || code,
          logo: info?.logo_url || '/img/logos/default.svg'
        };
      });

      // Header
      const header = document.createElement('div');
      header.className = 'gp-modal-header';
      
      const title = document.createElement('h2');
      title.id = 'city-selection-title';
      title.className = 'gp-modal-title';
      title.innerHTML = '<i class="fa-solid fa-city" style="color:var(--info);margin-right:8px;"></i>Sélectionnez votre ville';
      
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'gp-modal-close';
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.innerHTML = '&times;';
      
      header.appendChild(title);
      header.appendChild(closeBtn);

      // Body
      const body = document.createElement('div');
      body.className = 'gp-modal-body';
      body.innerHTML = `
        <p style="margin:0 0 16px 0;color:var(--gray-500);text-align:center;">
          Vous avez accès à ${cities.length} ville${cities.length > 1 ? 's' : ''}
        </p>
        <div class="city-list" style="display:flex;flex-direction:column;gap:12px;">
          ${cityInfos.map(city => `
            <button 
              class="city-option btn-secondary" 
              data-city="${city.code}"
              style="
                display:flex;
                align-items:center;
                gap:16px;
                padding:16px;
                text-align:left;
                justify-content:flex-start;
              "
            >
              <img 
                src="${city.logo}" 
                alt="${city.name}"
                style="width:48px;height:48px;object-fit:contain;flex-shrink:0;border-radius:8px;"
                onerror="this.src='/img/logos/default.svg'"
              />
              <div style="flex:1;">
                <div style="font-weight:600;font-size:16px;margin-bottom:4px;">${win.SecurityUtils ? win.SecurityUtils.escapeHtml(city.name) : city.name}</div>
                <div style="font-size:13px;opacity:0.7;font-family:monospace;">${win.SecurityUtils ? win.SecurityUtils.escapeHtml(city.code) : city.code}</div>
              </div>
              <i class="fa-solid fa-arrow-right" style="color:var(--info);font-size:18px;"></i>
            </button>
          `).join('')}
        </div>
      `;

      // Footer
      const footer = document.createElement('div');
      footer.className = 'gp-modal-footer';
      
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Annuler';
      
      footer.appendChild(cancelBtn);

      // Assembler
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Handlers
      const close = (city = null) => {
        win.ModalHelper?.close('city-selection-overlay');
        resolve(city);
      };

      // Gérer les clics sur les villes
      body.querySelectorAll('.city-option').forEach(btn => {
        btn.addEventListener('click', () => {
          close(btn.dataset.city);
        });
      });

      // Gérer les fermetures
      closeBtn.addEventListener('click', () => close(null));
      cancelBtn.addEventListener('click', () => close(null));

      // Ouvrir avec ModalHelper
      win.ModalHelper?.open('city-selection-overlay', {
        focusTrap: true,
        dismissible: true,
        onClose: () => resolve(null)
      });

      // Focus sur la première ville
      setTimeout(() => {
        try { 
          const firstCity = body.querySelector('.city-option');
          if (firstCity) firstCity.focus();
        } catch(_) {}
      }, 100);
    });
  }

  /**
   * Redirige automatiquement vers la ville de l'utilisateur
   * @param {Object} session - Session Supabase
   * @param {number} retryCount - Nombre de tentatives restantes
   */
  async function handleCityRedirect(session, retryCount = 5) {
    try {
      // Vérifier si la redirection est désactivée (pour debug)
      if (win.__DISABLE_CITY_REDIRECT === true) {
        console.log('[city-redirect] Redirect disabled by __DISABLE_CITY_REDIRECT flag');
        return;
      }

      // Vérifier si on est déjà sur une page ville
      const currentUrl = new URL(window.location.href);
      const currentCity = currentUrl.searchParams.get('city');
      
      // Si déjà sur une ville, ne rien faire
      if (currentCity) {
        return;
      }

      // Récupérer les villes de l'utilisateur
      const userVilles = win.__CONTRIB_VILLES;
      
      // Si __CONTRIB_VILLES n'est pas encore défini, réessayer
      if (userVilles === undefined && retryCount > 0) {
        setTimeout(() => handleCityRedirect(session, retryCount - 1), 200);
        return;
      }
      
      if (!userVilles || !Array.isArray(userVilles)) {
        return;
      }

      // Filtrer 'global' qui n'est pas une vraie ville
      const actualCities = userVilles.filter(v => v !== 'global');
      
      if (actualCities.length === 0) {
        return;
      }

      let targetCity = null;

      if (actualCities.length === 1) {
        // Une seule ville : redirection automatique
        targetCity = actualCities[0];
      } else {
        // Plusieurs villes : afficher la popup de sélection
        targetCity = await showCitySelectionPopup(actualCities);
        
        if (!targetCity) {
          return;
        }
      }

      // Rediriger vers la ville
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
          handleCityRedirect(session);
        }
      });
    }

    // Vérifier aussi la session actuelle au chargement
    if (win.AuthModule && typeof win.AuthModule.getSession === 'function') {
      win.AuthModule.getSession().then(({ data }) => {
        if (data?.session?.user) {
          handleCityRedirect(data.session);
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
