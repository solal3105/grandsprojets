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
      let resolved = false;

      const dismiss = (city = null) => {
        if (resolved) return;
        resolved = true;
        document.removeEventListener('keydown', onKey);
        overlay.classList.remove('cs-visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        resolve(city);
      };

      // Overlay backdrop
      const overlay = document.createElement('div');
      overlay.className = 'cs-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'cs-title');

      // Panel
      const panel = document.createElement('div');
      panel.className = 'cs-panel';

      // Header
      const header = document.createElement('div');
      header.className = 'cs-header';
      header.innerHTML = `
        <span class="cs-eyebrow">Bienvenue</span>
        <h2 id="cs-title" class="cs-title">Choisissez votre espace</h2>
        <p class="cs-subtitle">${cities.length} espace${cities.length > 1 ? 's' : ''} disponible${cities.length > 1 ? 's' : ''}</p>
      `;

      // Cards list
      const list = document.createElement('div');
      list.className = 'cs-list';
      list.setAttribute('role', 'list');

      cityInfos.forEach((city, i) => {
        const card = document.createElement('button');
        card.className = 'cs-card';
        card.dataset.city = city.code;
        card.setAttribute('type', 'button');
        card.setAttribute('role', 'listitem');
        card.style.animationDelay = `${120 + i * 60}ms`;

        const safeName = win.SecurityUtils?.escapeHtml(city.name) || city.name;
        const initial = city.name.charAt(0).toUpperCase();
        const safeLogoUrl = city.logo ? (win.SecurityUtils?.sanitizeUrl(city.logo) || city.logo) : null;

        card.innerHTML = `
          <div class="cs-card-logo">
            ${safeLogoUrl
              ? `<img src="${safeLogoUrl}" alt="${safeName}" loading="eager">`
              : `<span class="cs-initial">${initial}</span>`}
          </div>
          <div class="cs-card-body">
            <div class="cs-card-name">${safeName}</div>
            <div class="cs-card-code">${city.code}</div>
          </div>
          <div class="cs-card-arrow"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></div>
        `;

        // Fallback logo → initiale
        const img = card.querySelector('img');
        if (img) {
          img.addEventListener('error', () => {
            img.parentElement.innerHTML = `<span class="cs-initial">${initial}</span>`;
          });
        }

        card.addEventListener('click', () => dismiss(city.code));
        list.appendChild(card);
      });

      panel.appendChild(header);
      panel.appendChild(list);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      // Dismiss on backdrop click
      overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(null); });

      // Dismiss on ESC
      const onKey = (e) => { if (e.key === 'Escape') dismiss(null); };
      document.addEventListener('keydown', onKey);

      // Animate in (double rAF ensures transition fires)
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('cs-visible')));

      // Focus first card
      setTimeout(() => list.querySelector('.cs-card')?.focus(), 250);
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
