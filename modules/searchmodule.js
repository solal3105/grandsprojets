// modules/searchmodule.js
window.SearchModule = (() => {
  // Reference to the map instance
  let map;
  // Reference to the current marker
  let currentMarker = null;
  // Reference to the search input
  let searchInput;
  // Reference to the search results container
  let searchResults;
  // Reference to the search overlay
  let searchOverlay;
  // Reference to the search toggle button
  let searchToggle;
  // Timeout for debouncing search
  let searchTimeout;

  /**
   * Initialize the search module
   * @param {Object} mapInstance - The Leaflet map instance
   */
  function init(mapInstance) {
    map = mapInstance;
    
    // Get DOM elements
    searchToggle = document.getElementById('search-toggle');
    searchInput = document.getElementById('address-search');
    searchResults = document.getElementById('search-results');
    searchOverlay = document.getElementById('search-overlay');

    if (!searchToggle || !searchInput || !searchResults || !searchOverlay) {
      console.error('Search elements not found');
      return;
    }

    // Add event listeners
    setupEventListeners();
    
    // Mark toggle as ready once module is initialized
    if (window.toggleManager) {
      window.toggleManager.markReady('search');
    }
  }

  /**
   * Set up event listeners for the search functionality
   */
  function setupEventListeners() {
    // Listen to ToggleManager instead of direct click
    if (window.toggleManager) {
      window.toggleManager.on('search', (isOpen) => {
        if (isOpen) {
          openSearchOverlay();
        } else {
          closeSearchOverlay();
        }
      });
    }
    
    // Handle search input
    searchInput.addEventListener('input', handleSearchInput);
    
    // Handle search result clicks
    searchResults.addEventListener('click', handleResultClick);
    
    // Close search when clicking outside
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) {
        if (window.toggleManager) {
          window.toggleManager.setState('search', false);
        }
      }
    });
    
    // Handle Enter key press
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstResult = searchResults.querySelector('.search-result-item');
        if (firstResult) {
          firstResult.click();
        }
      } else if (e.key === 'Escape') {
        if (window.toggleManager) {
          window.toggleManager.setState('search', false);
        }
      }
    });
  }

  /**
   * Open the search overlay
   */
  function openSearchOverlay() {
    if (!searchOverlay) return;
    
    // Close the project detail panel while searching
    try {
      if (window.NavigationModule && typeof window.NavigationModule.resetToDefaultView === 'function') {
        window.NavigationModule.resetToDefaultView(undefined, { preserveMapView: true });
      }
    } catch (_) {}

    // Utiliser ModalHelper pour une gestion unifiée
    window.ModalHelper.open('search-overlay', {
      dismissible: true,
      lockScroll: true,
      focusTrap: true,
      onOpen: () => {
        // Focus the input après l'animation
        if (searchInput) searchInput.focus();
      },
      onClose: () => {
        clearSearchResults();
        if (searchInput) searchInput.value = '';
      }
    });
  }

  /**
   * Close the search overlay
   */
  function closeSearchOverlay() {
    if (!searchOverlay) return;
    
    // Utiliser ModalHelper pour une gestion unifiée
    window.ModalHelper.close('search-overlay');
  }

  /**
   * Handle search input with debouncing
   */
  function handleSearchInput() {
    const query = searchInput.value.trim();
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Clear results if query is empty
    if (query.length === 0) {
      clearSearchResults();
      return;
    }
    
    // Set a new timeout (debounce)
    searchTimeout = setTimeout(() => {
      searchAddress(query);
    }, 300);
  }

  /**
   * Search for an address using the French Adresse API
   * @param {string} query - The search query
   */
  async function searchAddress(query) {
    try {
      // Show loading state
      searchResults.innerHTML = '<div class="search-result-item">Recherche en cours...</div>';
      searchResults.classList.add('visible');
      
      // Optionnel : utiliser le centre actuel de la carte comme biais local
      const center = (map && map.getCenter) ? map.getCenter() : null;
      const params = new URLSearchParams({
        q: query,
        limit: '6',
        autocomplete: '1'
      });

      if (center) {
        params.set('lat', String(center.lat));
        params.set('lon', String(center.lng));
      }

      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Erreur de recherche');
      }
      
      const data = await response.json();
      const results = data.features || [];
      
      if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item">Aucune adresse trouvée. Essayez une autre requête.</div>';
        return;
      }
      
      // Display results
      displaySearchResults(results);
      
    } catch (error) {
      console.error('Erreur lors de la recherche d\'adresse:', error);
      searchResults.innerHTML = '<div class="search-result-item error">Erreur lors de la recherche. Veuillez réessayer.</div>';
    }
  }

  /**
   * Display search results in the UI
   * @param {Array} results - Array of search results from Addok
   */
  function displaySearchResults(results) {
    searchResults.innerHTML = '';
    
    results.forEach(result => {
      const { properties, geometry } = result;
      const [lon, lat] = geometry.coordinates;
      
      const resultItem = document.createElement('div');
      resultItem.className = 'search-result-item';
      resultItem.dataset.lat = lat;
      resultItem.dataset.lon = lon;
      resultItem.dataset.displayName = properties.label;
      // Conserver des détails pour enrichir la popup
      resultItem.dataset.city = properties.city || '';
      resultItem.dataset.postcode = properties.postcode || '';
      resultItem.dataset.street = (properties.name || '').toString();
      
      // Format address components
      const { name, city, postcode, context } = properties;
      const street = name || '';
      const cityInfo = [postcode, city].filter(Boolean).join(' ');
      
      resultItem.innerHTML = `
        <h4>${street}</h4>
        <p>${cityInfo}</p>
      `;
      
      searchResults.appendChild(resultItem);
    });
    
    searchResults.classList.add('visible');
  }

  /**
   * Handle click on a search result
   * @param {Event} e - The click event
   */
  function handleResultClick(e) {
    const resultItem = e.target.closest('.search-result-item');
    if (!resultItem) return;
    
    const lat = parseFloat(resultItem.dataset.lat);
    const lon = parseFloat(resultItem.dataset.lon);
    const displayName = resultItem.dataset.displayName;
    const subtitle = [resultItem.dataset.postcode, resultItem.dataset.city].filter(Boolean).join(' ');
    
    // Center the map on the selected location
    map.setView([lat, lon], 16);
    
    // Add or update the marker
    addMarker(lat, lon, displayName, subtitle);
    
    // Close the search overlay
    closeSearchOverlay();
  }

  /**
   * Add a marker to the map at the specified coordinates
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} title - Marker title/tooltip
   */
  function addMarker(lat, lng, title, subtitle = '') {
    // Remove existing marker if it exists
    if (currentMarker) {
      map.removeLayer(currentMarker);
    }
    
    // Create a custom icon
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    const customIcon = L.divIcon({
      html: `<i class="fas fa-map-marker-alt" style="color: ${primaryColor}; font-size: 32px;"></i>`,
      className: 'custom-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
    
    // Add the new marker
    // Injecter une feuille de style minimale pour rendre la wrapper Leaflet transparente
    if (!document.getElementById('gp-popup-style')) {
      const style = document.createElement('style');
      style.id = 'gp-popup-style';
      style.textContent = `
        .gp-popup .leaflet-popup-content-wrapper{background:transparent; box-shadow:none; border:none;}
        .gp-popup .leaflet-popup-tip{background:transparent; box-shadow:none; border:none;}
        .gp-popup .leaflet-popup-close-button{display:none !important;}
      `;
      document.head.appendChild(style);
    }

    const popupHtml = `
      <div style="min-width:220px; background:var(--white-alpha-85); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border-radius:12px; box-shadow:0 8px 24px var(--black-alpha-18); padding:12px 14px;">
        <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${title}</div>
        ${subtitle ? `<div style=\"color:#555; font-size:13px; margin-bottom:8px;\">${subtitle}</div>` : ''}
        <div style="font-family:monospace; font-size:12px; color:#666;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
      </div>
    `;
    currentMarker = L.marker([lat, lng], { icon: customIcon })
      .addTo(map)
      .bindPopup(popupHtml, { maxWidth: 280, className: 'gp-popup' })
      .openPopup();
  }

  /**
   * Clear the search results
   */
  function clearSearchResults() {
    searchResults.innerHTML = '';
    searchResults.classList.remove('visible');
  }

  // Public API
  return {
    init,
    openSearchOverlay,
    closeSearchOverlay
  };
})();
