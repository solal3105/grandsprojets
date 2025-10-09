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
      // Créer l'overlay
      const overlay = document.createElement('div');
      overlay.className = 'city-redirect-overlay';
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        animation: fadeIn 0.2s ease;
        backdrop-filter: blur(4px);
      `;

      // Créer la popup
      const popup = document.createElement('div');
      popup.className = 'city-redirect-popup';
      popup.style.cssText = `
        background: white;
        border-radius: 20px;
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
      `;

      // Récupérer les infos des villes depuis window.CityManager
      const cityInfos = cities.map(code => {
        const info = win.CityManager?.getCityInfo?.(code);
        return {
          code,
          name: info?.brand_name || code,
          logo: info?.logo_url || '/img/logos/default.svg'
        };
      });

      popup.innerHTML = `
        <div style="padding:32px;text-align:center;">
          <div style="margin-bottom:24px;">
            <i class="fa-solid fa-city" style="font-size:48px;color:#1976d2;margin-bottom:16px;"></i>
            <h2 style="margin:0 0 8px 0;font-size:24px;color:#333;">Sélectionnez votre ville</h2>
            <p style="margin:0;color:#666;font-size:15px;">Vous avez accès à ${cities.length} ville${cities.length > 1 ? 's' : ''}</p>
          </div>

          <div class="city-list" style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
            ${cityInfos.map(city => `
              <button 
                class="city-option" 
                data-city="${city.code}"
                style="
                  display:flex;
                  align-items:center;
                  gap:16px;
                  padding:16px;
                  border:2px solid #e0e0e0;
                  border-radius:12px;
                  background:white;
                  cursor:pointer;
                  transition:all 0.2s;
                  text-align:left;
                "
                onmouseover="this.style.borderColor='#1976d2';this.style.background='#f5f9ff';"
                onmouseout="this.style.borderColor='#e0e0e0';this.style.background='white';"
              >
                <img 
                  src="${city.logo}" 
                  alt="${city.name}"
                  style="width:48px;height:48px;object-fit:contain;flex-shrink:0;"
                  onerror="this.src='/img/logos/default.svg'"
                />
                <div style="flex:1;">
                  <div style="font-weight:600;font-size:16px;color:#333;margin-bottom:4px;">${city.name}</div>
                  <div style="font-size:13px;color:#666;font-family:monospace;">${city.code}</div>
                </div>
                <i class="fa-solid fa-arrow-right" style="color:#1976d2;font-size:20px;"></i>
              </button>
            `).join('')}
          </div>

          <button 
            class="cancel-btn"
            style="
              padding:12px 24px;
              border:1px solid #ddd;
              border-radius:8px;
              background:white;
              color:#666;
              cursor:pointer;
              font-size:14px;
              transition:all 0.2s;
            "
            onmouseover="this.style.background='#f5f5f5';"
            onmouseout="this.style.background='white';"
          >
            Annuler
          </button>
        </div>
      `;

      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      // Ajouter les animations CSS
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `;
      document.head.appendChild(style);

      // Fonction de nettoyage
      const cleanup = () => {
        overlay.remove();
        style.remove();
      };

      // Gérer les clics sur les villes
      popup.querySelectorAll('.city-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const city = btn.dataset.city;
          cleanup();
          resolve(city);
        });
      });

      // Gérer l'annulation
      popup.querySelector('.cancel-btn').addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      // Fermer en cliquant sur l'overlay
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });
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
        console.log('[city-redirect] Already on a city page:', currentCity);
        return;
      }

      // Récupérer les villes de l'utilisateur
      const userVilles = win.__CONTRIB_VILLES;
      
      // Si __CONTRIB_VILLES n'est pas encore défini, réessayer
      if (userVilles === undefined && retryCount > 0) {
        console.log('[city-redirect] Waiting for __CONTRIB_VILLES to be defined, retrying in 200ms...');
        setTimeout(() => handleCityRedirect(session, retryCount - 1), 200);
        return;
      }
      
      if (!userVilles || !Array.isArray(userVilles)) {
        console.log('[city-redirect] No cities assigned to user');
        return;
      }

      // Filtrer 'global' qui n'est pas une vraie ville
      const actualCities = userVilles.filter(v => v !== 'global');
      
      if (actualCities.length === 0) {
        console.log('[city-redirect] User has global access but no specific cities');
        return;
      }

      console.log('[city-redirect] User cities:', actualCities);

      let targetCity = null;

      if (actualCities.length === 1) {
        // Une seule ville : redirection automatique
        targetCity = actualCities[0];
        console.log('[city-redirect] Single city, auto-redirecting to:', targetCity);
      } else {
        // Plusieurs villes : afficher la popup de sélection
        console.log('[city-redirect] Multiple cities, showing selection popup');
        targetCity = await showCitySelectionPopup(actualCities);
        
        if (!targetCity) {
          console.log('[city-redirect] User cancelled city selection');
          return;
        }
      }

      // Rediriger vers la ville
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('city', targetCity);
      
      console.log('[city-redirect] Redirecting to:', newUrl.href);
      window.location.href = newUrl.href;

    } catch (error) {
      console.error('[city-redirect] Error during city redirect:', error);
    }
  }

  /**
   * Initialise le système de redirection automatique
   */
  function init() {
    console.log('[city-redirect] Initializing city redirect system');

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
