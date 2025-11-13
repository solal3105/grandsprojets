// modules/geolocation.js

window.GeolocationModule = (() => {
  let userLocationMarker = null;
  let userLocationCircle = null;
  let map = null;

  // Initialiser le module avec une référence à la carte
  function init(mapInstance) {
    
    if (!mapInstance) {
      console.error('❌ ERREUR: Aucune instance de carte fournie au module de géolocalisation');
      return;
    }
    
    map = mapInstance;
    
    const locationButton = document.getElementById('location-toggle');
    
    if (!locationButton) {
      console.error('❌ ERREUR: Bouton de localisation introuvable dans le DOM');
      return;
    }
    
    // Désactiver si non supporté ou contexte non sécurisé (HTTP non-localhost)
    const geolocationSupported = ('geolocation' in navigator) && window.isSecureContext;
    if (!geolocationSupported) {
      locationButton.disabled = true;
      locationButton.classList.add('is-disabled');
      locationButton.setAttribute('aria-disabled', 'true');
      locationButton.setAttribute('title', 'La localisation n\'est pas disponible sur cet appareil ou dans ce contexte.');
      // Rendu visuel minimal sans CSS dédié
      locationButton.style.opacity = '0.5';
      locationButton.style.cursor = 'not-allowed';
      return;
    }
    
    locationButton.onclick = handleLocationButtonClick;
    
    // Mark toggle as ready once module is initialized
    if (window.toggleManager) {
      window.toggleManager.markReady('location');
    }
  }
  
  // Vérifier si la géolocalisation est disponible
  function isGeolocationAvailable() {
    return 'geolocation' in navigator;
  }

  // Vérifier si la géolocalisation est autorisée
  function checkGeolocationPermission() {
    return new Promise((resolve) => {
      if (!isGeolocationAvailable()) {
        resolve({ isAvailable: false, message: 'La géolocalisation n\'est pas supportée par votre navigateur' });
        return;
      }

      navigator.permissions?.query({ name: 'geolocation' })
        .then(permissionStatus => {
          if (permissionStatus.state === 'denied') {
            resolve({ 
              isAvailable: false, 
              message: 'La géolocalisation a été refusée. Veuillez autoriser l\'accès à votre position dans les paramètres de votre navigateur.' 
            });
          } else if (permissionStatus.state === 'prompt') {
            resolve({ 
              isAvailable: true, 
              message: 'Veuvez-vous autoriser l\'accès à votre position ?' 
            });
          } else {
            resolve({ isAvailable: true, message: '' });
          }
        })
        .catch(() => {
          // Si l'API de permissions n'est pas disponible, on continue quand même
          resolve({ isAvailable: true, message: '' });
        });
    });
  }

  // Gérer le clic sur le bouton de localisation
  async function handleLocationButtonClick(event) {
    
    // Empêcher le comportement par défaut
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    
    const locationButton = document.getElementById('location-toggle');
    
    if (!locationButton) {
      console.error('❌ ERREUR: Bouton de localisation introuvable dans le DOM');
      return;
    }
    
    
    
    // Vérifier les permissions
    const { isAvailable, message } = await checkGeolocationPermission();
    
    if (!isAvailable) {
      showGeolocationError('Géolocalisation indisponible', message);
      return;
    }
    
    // Afficher l'indicateur de chargement
    locationButton.disabled = true; // éviter les doubles clics pendant la recherche
    locationButton.classList.add('loading');
    locationButton.setAttribute('title', 'Recherche de votre position...');
    
    // Démarrer la géolocalisation avec un timeout réduit
    const geolocationOptions = {
      enableHighAccuracy: true,
      timeout: 8000, // Réduit à 8 secondes pour une réponse plus rapide
      maximumAge: 0
    };
    
    // Créer un timeout pour gérer le cas où la géolocalisation prend trop de temps
    const timeoutId = setTimeout(() => {
      handleGeolocationError({ 
        code: 3, 
        message: 'La demande de géolocalisation a pris trop de temps. Vérifiez votre connexion Internet ou essayez dans un endroit plus dégagé.' 
      });
    }, 10000); // Timeout après 10 secondes
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        handleGeolocationSuccess(position);
      },
      (error) => {
        clearTimeout(timeoutId);
        handleGeolocationError(error);
      },
      geolocationOptions
    );
  }
  
  // Gérer le succès de la géolocalisation
  function handleGeolocationSuccess(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const userLocation = [latitude, longitude];
    const locationButton = document.getElementById('location-toggle');
    
    if (!map || !locationButton) return;
    
    // Supprimer l'ancien marqueur et cercle s'ils existent
    clearLocationMarkers();
    
    // Créer un marqueur pour la position de l'utilisateur
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    userLocationMarker = L.marker(userLocation, {
      icon: L.divIcon({
        html: `<i class="fas fa-map-marker-alt" style="color: ${primaryColor}; font-size: 24px;"></i>`,
        className: 'user-location-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24]
      })
    }).addTo(map);
    
    // Créer un cercle pour représenter la précision
    userLocationCircle = L.circle(userLocation, {
      color: primaryColor,
      fillColor: primaryColor,
      fillOpacity: 0.2,
      radius: accuracy
    }).addTo(map);
    
    // Centrer la carte sur la position de l'utilisateur avec un zoom adapté
    const zoom = accuracy > 1000 ? 14 : 16;
    map.setView(userLocation, zoom);
    
    // Mettre à jour l'état du bouton
    updateButtonState('success', 'Votre position');
    // Réactiver le bouton après succès
    locationButton.disabled = false;
    
    // Réinitialiser l'état après 5 secondes
    setTimeout(() => {
      updateButtonState('idle', 'Centrer sur ma position');
    }, 5000);
  }
  
  // Gérer les erreurs de géolocalisation
  function handleGeolocationError(error) {
    console.error('Erreur de géolocalisation:', error);
    
    let errorMessage = 'Impossible de déterminer votre position';
    let errorDetails = '';
    
    // Déterminer le message d'erreur en fonction du code d'erreur
    switch(error.code) {
      case 1: // PERMISSION_DENIED
        errorMessage = 'Accès à la localisation refusé';
        errorDetails = 'Vous avez refusé la demande de géolocalisation. Pour l\'activer, mettez à jour les paramètres de votre navigateur.';
        break;
      case 2: // POSITION_UNAVAILABLE
        errorMessage = 'Localisation indisponible';
        errorDetails = 'Votre position n\'a pas pu être déterminée. Vérifiez votre connexion Internet et assurez-vous que le GPS est activé si vous êtes à l\'extérieur.';
        break;
      case 3: // TIMEOUT
        errorMessage = 'Délai dépassé';
        errorDetails = 'La recherche de votre position a pris trop de temps. Vérifiez votre connexion Internet ou réessayez dans un endroit plus dégagé.';
        break;
      default:
        errorDetails = error.message || 'Une erreur inconnue est survenue lors de la tentative de géolocalisation.';
    }
    
    console.warn(`Erreur de géolocalisation (${error.code}): ${error.message}`);
    
    // Mettre à jour l'interface utilisateur avec le message d'erreur
    updateButtonState('error', errorMessage);
    
    // Afficher une notification plus détaillée
    showGeolocationError(errorMessage, errorDetails);
    
    // Réactiver le bouton après erreur
    const locationButton = document.getElementById('location-toggle');
    if (locationButton) {
      locationButton.disabled = false;
    }
    
    // Réinitialiser l'état après 8 secondes
    setTimeout(() => {
      updateButtonState('idle', 'Centrer sur ma position');
    }, 8000);
  }
  
  // Mettre à jour l'état du bouton
  function updateButtonState(state, message) {
    const locationButton = document.getElementById('location-toggle');
    if (!locationButton) return;
    
    // Réinitialiser les classes d'état
    locationButton.classList.remove('loading', 'active', 'error');
    
    // Appliquer la classe d'état appropriée
    if (state !== 'idle') {
      locationButton.classList.add(state);
    }
    
    // Mettre à jour le titre
    if (message) {
      locationButton.setAttribute('title', message);
    }
  }
  
  // Effacer les marqueurs de localisation
  function clearLocationMarkers() {
    if (userLocationMarker && map) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    
    if (userLocationCircle && map) {
      map.removeLayer(userLocationCircle);
      userLocationCircle = null;
    }
  }
  
  // Afficher un message d'erreur
  function showGeolocationError(title, message) {
    // Vérifier si une notification existe déjà pour éviter les doublons
    const existingNotification = document.getElementById('geolocation-notification');
    if (existingNotification) {
      document.body.removeChild(existingNotification);
    }
    
    // Créer l'élément de notification
    const notification = document.createElement('div');
    notification.id = 'geolocation-notification';
    notification.className = 'geolocation-notification';
    notification.innerHTML = `
      <div class="geolocation-notification-content">
        <div class="geolocation-notification-header">
          <i class="fas fa-exclamation-triangle"></i>
          <h4>${title}</h4>
          <button class="geolocation-notification-close">&times;</button>
        </div>
        <p>${message}</p>
      </div>
    `;
    
    // Accessibilité et styles inline minimalistes pour garantir l'affichage à l'écran
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'polite');
    // Positionner la notification dans la fenêtre (évite qu'elle soit "hors page")
    Object.assign(notification.style, {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: '16px',
      zIndex: '2147483647',
      maxWidth: 'min(560px, 90vw)',
      width: 'auto',
      boxSizing: 'border-box',
      padding: '0',
      margin: '0',
      background: 'transparent',
      border: 'none',
      pointerEvents: 'auto',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      opacity: '1'
    });
    const contentEl = notification.querySelector('.geolocation-notification-content');
    if (contentEl) {
      Object.assign(contentEl.style, {
        background: '#fff',
        color: '#111',
        boxShadow: '0 8px 24px var(--black-alpha-18)',
        borderRadius: '12px',
        padding: '12px 14px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        fontSize: '14px',
        lineHeight: '1.4'
      });
    }
    const headerEl = notification.querySelector('.geolocation-notification-header');
    if (headerEl) {
      Object.assign(headerEl.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px'
      });
    }
    const titleEl = notification.querySelector('h4');
    if (titleEl) {
      Object.assign(titleEl.style, { margin: '0', fontSize: '15px', fontWeight: '600' });
    }
    const closeBtn = notification.querySelector('.geolocation-notification-close');
    if (closeBtn) {
      Object.assign(closeBtn.style, { border: 'none', background: 'transparent', fontSize: '18px', cursor: 'pointer', marginLeft: 'auto' });
    }
    
    // Ajouter la notification au document
    document.body.appendChild(notification);
    
    // Gérer la fermeture de la notification
    const closeButton = notification.querySelector('.geolocation-notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        // Animation de sortie légère sans dépendre d'une feuille de style
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, 8px)';
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
        }, 200);
      });
    }
    
    // Fermer automatiquement après 8 secondes
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, 8px)';
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
        }, 200);
      }
    }, 8000);
  }
  
  // API publique
  return {
    init: init,
    handleLocationButtonClick: handleLocationButtonClick, // Exposer la fonction pour le HTML
    // Exposer les fonctions nécessaires
    isGeolocationAvailable: isGeolocationAvailable,
    checkGeolocationPermission: checkGeolocationPermission,
    handleGeolocationSuccess: handleGeolocationSuccess,
    handleGeolocationError: handleGeolocationError,
    clearLocationMarkers: clearLocationMarkers
  };
})();
