// modules/ficheprojet.js
// Fiche projet - Architecture moderne et maintenable

/* ===========================================================================
   CONFIGURATION
   =========================================================================== */

const FP_CONFIG = {
  PROD_ORIGIN: 'https://grandsprojets.netlify.app',
  DEFAULT_CATEGORY: 'velo',
  MAP_DEFAULT_ZOOM: 13,
  MAP_DEFAULT_CENTER: [45.764043, 4.835659] // Lyon
};

// Configuration des fonds de carte
window.basemaps = window.basemaps || [
  {
    label: 'Positron',
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    attribution: '© CartoDB'
  },
  {
    label: 'Dark Matter',
    theme: 'dark',
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
    attribution: '© CartoDB'
  }
];

/* ===========================================================================
   UTILITAIRES
   =========================================================================== */

/**
 * Récupère les paramètres URL
 */
function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    projectName: params.get('project') || '',
    category: params.get('cat') || FP_CONFIG.DEFAULT_CATEGORY,
    city: params.get('city') || null,
    isEmbed: params.get('embed') === 'true' || params.get('embed') === '1'
  };
}

/**
 * Convertit une URL relative en absolue
 */
function toAbsoluteURL(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return FP_CONFIG.PROD_ORIGIN + url;
  return url;
}

/**
 * Échappe les caractères HTML pour prévenir les XSS
 */
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Applique le SEO (meta tags)
 */
function applySEO(projectName, attrs, category) {
  try {
    // Title
    document.title = `${projectName} – Grands Projets`;

    // Description
    if (attrs.description) {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = attrs.description;
    }

    // Open Graph
    const ogTags = [
      { property: 'og:title', content: projectName },
      { property: 'og:description', content: attrs.description || '' },
      { property: 'og:image', content: toAbsoluteURL(attrs.cover) || `${FP_CONFIG.PROD_ORIGIN}/img/logomin.png` },
      { property: 'og:type', content: 'article' }
    ];

    ogTags.forEach(tag => {
      let meta = document.querySelector(`meta[property="${tag.property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', tag.property);
        document.head.appendChild(meta);
      }
      meta.content = tag.content;
    });
  } catch (e) {
    console.warn('[SEO] Erreur application SEO:', e);
  }
}

/* ===========================================================================
   GÉNÉRATION GP-CARDS
   =========================================================================== */

/**
 * Crée une card Cover (image du projet)
 */
function createCoverCard(coverUrl, projectName) {
  if (!coverUrl) return '';

  const absoluteUrl = toAbsoluteURL(coverUrl);
  
  return `
    <figure class="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary-alpha-10)] to-white dark:to-gray-800 shadow-lg hover:shadow-xl transition-all duration-300" style="margin-bottom: 16px;">
      <div class="aspect-[16/9] overflow-hidden">
        <img src="${absoluteUrl}" 
             alt="${escapeHTML(projectName)}" 
             loading="lazy"
             class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700">
      </div>
      
      <div class="absolute inset-0 bg-gradient-to-t from-[var(--primary)]/60 via-[var(--primary)]/0 to-[var(--primary)]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <button type="button"
              class="absolute bottom-3 right-3 w-10 h-10 flex items-center justify-center bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-xl opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all duration-300"
              data-lightbox-image="${absoluteUrl}"
              aria-label="Agrandir l'image">
        <i class="fa fa-expand text-[var(--primary)] text-sm" aria-hidden="true"></i>
      </button>
    </figure>
  `;
}

/**
 * Crée une card Description
 */
function createDescriptionCard(description) {
  if (!description) return '';

  return `
    <div class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary-alpha-10)] via-white to-white dark:via-gray-800 dark:to-gray-800 border border-[var(--primary-alpha-20)] dark:border-gray-700 shadow-md hover:shadow-lg transition-all duration-300" style="margin-bottom: 16px;">
      <div class="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[var(--primary-alpha-20)] to-transparent rounded-full blur-2xl"></div>
      
      <div class="relative p-4">
        <div class="flex items-center gap-2.5 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-md shadow-[var(--primary-alpha-25)]">
            <i class="fa-solid fa-info-circle text-white text-base" aria-hidden="true"></i>
          </div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Description</h3>
        </div>
        <p class="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">${escapeHTML(description)}</p>
      </div>
    </div>
  `;
}

/**
 * Crée une card Lien officiel + QR Code
 */
function createOfficialLinkCard(url) {
  if (!url) return '';

  let domain = '';
  try {
    const urlObj = new URL(url);
    domain = urlObj.hostname.replace('www.', '');
  } catch (e) {
    domain = url;
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  
  return `
    <div class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary-alpha-10)] via-white to-white dark:via-gray-800 dark:to-gray-800 border border-[var(--primary-alpha-20)] dark:border-gray-700 shadow-md hover:shadow-lg transition-all duration-300" style="margin-bottom: 16px;">
      <div class="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-[var(--primary-alpha-20)] to-transparent rounded-full blur-2xl"></div>
      
      <div class="relative p-4">
        <div class="flex items-center gap-2.5 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-md shadow-[var(--primary-alpha-25)]">
            <i class="fa-solid fa-bookmark text-white text-base" aria-hidden="true"></i>
          </div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Site officiel</h3>
        </div>
        
        <a href="${url}" 
           target="_blank" 
           rel="noopener noreferrer"
           class="flex items-center gap-3 p-3 bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm border border-gray-200 dark:border-gray-600 rounded-xl hover:border-[var(--primary-alpha-35)] hover:bg-white dark:hover:bg-gray-700 hover:shadow-md transition-all duration-300 group/link"
           aria-label="Ouvrir le site">
          <img src="${faviconUrl}" alt="" class="w-8 h-8 flex-shrink-0 rounded-lg" onerror="this.style.display='none'">
          <span class="flex-1 font-semibold text-sm text-gray-900 dark:text-white break-words group-hover/link:text-[var(--primary)] transition-colors">${escapeHTML(domain)}</span>
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] text-white group-hover/link:scale-110 transition-transform">
            <i class="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true"></i>
          </div>
        </a>
      </div>
    </div>
  `;
}

/**
 * Crée les cards Documents PDF
 */
async function createDocumentsCards(projectName) {
  try {
    // Récupérer les documents de concertation
    if (!window.supabaseService?.getConsultationDossiersByProject) {
      console.warn('[Documents] Service non disponible');
      return '';
    }
    
    const dossiers = await window.supabaseService.getConsultationDossiersByProject(projectName);
    if (!Array.isArray(dossiers) || dossiers.length === 0) return '';
    
    // Dédupliquer par pdf_url
    const uniq = new Map();
    dossiers.forEach(d => {
      if (d && d.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d);
    });
    const docs = Array.from(uniq.values());
    if (docs.length === 0) return '';

    const docItems = docs.map(doc => {
      const title = doc.title || (doc.pdf_url ? doc.pdf_url.split('/').pop() : 'Document PDF');
      const pdfUrl = toAbsoluteURL(doc.pdf_url);

      return `
        <div class="group/doc relative overflow-hidden rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-[var(--primary-alpha-35)] hover:shadow-md transition-all duration-300">
          <div class="p-4">
            <div class="flex items-start gap-3 mb-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-md shadow-[var(--primary-alpha-25)] flex-shrink-0">
                <i class="fa-solid fa-file-pdf text-white text-base" aria-hidden="true"></i>
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white leading-snug">${escapeHTML(title)}</h4>
              </div>
            </div>
            
            <div class="flex gap-2">
              <button type="button" 
                      class="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] hover:from-[var(--primary-hover)] hover:to-[var(--primary-active)] text-white text-xs font-semibold rounded-lg shadow-md shadow-[var(--primary-alpha-25)] hover:shadow-lg hover:shadow-[var(--primary-alpha-35)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all duration-300"
                      data-pdf-preview="${pdfUrl}" 
                      data-pdf-title="${escapeHTML(title)}">
                <i class="fa-solid fa-eye text-xs" aria-hidden="true"></i>
                Voir
              </button>
              <a href="${pdfUrl}" 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 download
                 class="inline-flex items-center justify-center w-10 h-10 bg-gray-100 dark:bg-gray-600 hover:bg-[var(--primary-alpha-10)] dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 hover:text-[var(--primary)] rounded-lg hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all duration-300"
                 title="Télécharger"
                 aria-label="Télécharger ${escapeHTML(title)}">
                <i class="fa-solid fa-download text-xs" aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary-alpha-10)] via-white to-white dark:via-gray-800 dark:to-gray-800 border border-[var(--primary-alpha-20)] dark:border-gray-700 shadow-md hover:shadow-lg transition-all duration-300" style="margin-bottom: 16px;">
        <div class="absolute bottom-0 right-0 w-24 h-24 bg-gradient-to-br from-[var(--primary-alpha-20)] to-transparent rounded-full blur-2xl"></div>
        
        <div class="relative p-4">
          <div class="flex items-center gap-2.5 mb-4">
            <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-md shadow-[var(--primary-alpha-25)]">
              <i class="fa-solid fa-file-pdf text-white text-base" aria-hidden="true"></i>
            </div>
            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Documents</h3>
          </div>
          
          <div class="grid grid-cols-1 gap-3">
            ${docItems}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    console.warn('[Documents] Erreur chargement documents:', e);
    return '';
  }
}

/* ===========================================================================
   MODALES
   =========================================================================== */

/**
 * Ouvre la lightbox image
 */
function openLightbox(imageUrl) {
  let overlay = document.getElementById('image-lightbox-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'image-lightbox-overlay';
    overlay.className = 'hidden fixed inset-0 z-[10000] bg-black/95 items-center justify-center cursor-zoom-out';
    
    overlay.innerHTML = `
      <img class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" 
           src="" 
           alt="Image agrandie">
      
      <button type="button"
              class="absolute top-5 right-5 w-11 h-11 flex items-center justify-center bg-white/90 backdrop-blur-lg rounded-full text-gray-900 text-2xl hover:bg-white hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white transition-all"
              aria-label="Fermer">
        ×
      </button>
    `;
    
    document.body.appendChild(overlay);
    
    // Fonction de fermeture réutilisable
    const closeLightbox = () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
    };
    
    // Event click (une seule fois)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.tagName === 'BUTTON') {
        closeLightbox();
      }
    });
    
    // Event ESC (une seule fois, avec vérification)
    const handleEscape = (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('flex')) {
        closeLightbox();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    
    // Stocker la référence pour cleanup si nécessaire
    overlay._handleEscape = handleEscape;
  }
  
  overlay.querySelector('img').src = imageUrl;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
}


/**
 * Ouvre la prévisualisation PDF
 */
function openPDFPreview(pdfUrl, title) {
  const overlay = document.getElementById('pdf-preview-overlay');
  if (!overlay) {
    console.error('[PDF Preview] Modal overlay not found');
    return;
  }

  const titleEl = overlay.querySelector('#pdf-preview-title');
  const iframe = overlay.querySelector('#pdf-preview-frame');

  if (titleEl) titleEl.textContent = title || 'Prévisualisation du document';
  if (iframe) iframe.src = pdfUrl;

  if (window.ModalHelper) {
    // ModalHelper.open() attend un ID (string), pas un élément DOM
    window.ModalHelper.open('pdf-preview-overlay');
  } else {
    overlay.style.display = 'flex';
  }
}

/* ===========================================================================
   CARTE LEAFLET
   =========================================================================== */

/**
 * Initialise la carte Leaflet
 */
async function initProjectMap(containerId, projectName, category) {
  try {
    console.log('[Carte] Initialisation...', { containerId, projectName, category });
    
    if (!window.L) {
      console.error('[Carte] ❌ Leaflet non chargé');
      return;
    }
    console.log('[Carte] ✓ Leaflet chargé');

    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[Carte] ❌ Container non trouvé:', containerId);
      return;
    }
    console.log('[Carte] ✓ Container trouvé:', container);

    // Créer la carte
    console.log('[Carte] Création de la carte...');
    const map = window.L.map(containerId, {
      center: FP_CONFIG.MAP_DEFAULT_CENTER,
      zoom: FP_CONFIG.MAP_DEFAULT_ZOOM,
      zoomControl: true
    });
    console.log('[Carte] ✓ Carte créée');

    // Ajouter le fond de carte selon le thème
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    console.log('[Carte] Thème actuel:', currentTheme);
    
    // Utiliser OpenStreetMap par défaut en mode clair
    let basemap;
    if (currentTheme === 'light') {
      basemap = {
        label: 'OpenStreetMap',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors'
      };
      console.log('[Carte] Mode clair : OpenStreetMap par défaut');
    } else {
      // Mode sombre : utiliser ThemeManager
      if (window.ThemeManager && window.ThemeManager.findBasemapForTheme) {
        basemap = window.ThemeManager.findBasemapForTheme(currentTheme);
      }
      if (!basemap) {
        basemap = {
          label: 'CartoDB Dark',
          url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
          attribution: '© CartoDB'
        };
      }
      console.log('[Carte] Mode sombre :', basemap.label);
    }
    
    console.log('[Carte] Ajout du fond de carte:', basemap.label, basemap.url);
    const baseLayer = window.L.tileLayer(basemap.url, {
      attribution: basemap.attribution || '',
      maxZoom: 19
    }).addTo(map);
    console.log('[Carte] ✓ Fond de carte ajouté');
    
    // Stocker pour sync thème et référence globale
    window.ficheProjectMap = map;
    window.__fpMap = map;
    window.__fpBaseLayer = baseLayer;
    
    // Écouter les changements de thème
    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const newTheme = document.documentElement.getAttribute('data-theme');
            console.log('[Carte] Changement de thème détecté:', newTheme);
            
            // Changer le fond de carte
            if (window.ThemeManager && window.__fpMap && window.__fpBaseLayer) {
              const newBasemap = window.ThemeManager.findBasemapForTheme(newTheme);
              if (newBasemap) {
                console.log('[Carte] Mise à jour du fond de carte:', newBasemap.label);
                window.__fpMap.removeLayer(window.__fpBaseLayer);
                window.__fpBaseLayer = window.L.tileLayer(newBasemap.url, {
                  attribution: newBasemap.attribution || '',
                  maxZoom: 19
                }).addTo(window.__fpMap);
              }
            }
          }
        });
      });
      
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    // Charger le GeoJSON du projet
    try {
      // 1. Récupérer l'URL du GeoJSON depuis le projet
      const project = await window.supabaseService?.fetchProjectByCategoryAndName(category, projectName);
      if (!project?.geojson_url) {
        console.warn('[Carte] Pas de GeoJSON pour ce projet');
        return map;
      }
      
      // 2. Fetch le GeoJSON
      const response = await fetch(project.geojson_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const geojsonData = await response.json();
      
      if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
        const layer = window.L.geoJSON(geojsonData, {
          style: (feature) => {
            // Utiliser les styles depuis layerstyles.js
            if (window.getFeatureStyle) {
              return window.getFeatureStyle(feature, category);
            }
            return {
              color: 'var(--primary)',
              weight: 3,
              opacity: 0.8,
              fillOpacity: 0.3
            };
          },
          onEachFeature: (feature, layer) => {
            // Camera markers uniquement : bind événements spéciaux
            if (feature.properties?.imgUrl && window.CameraMarkers) {
              window.CameraMarkers.bindCameraMarkerEvents(feature, layer);
            }
            
            // Ne pas bind d'événements ni de tooltips sur les paths (lignes/polygones)
          },
          pointToLayer: (feature, latlng) => {
            // Camera markers pour les points avec images
            if (feature.properties?.imgUrl && window.CameraMarkers) {
              const color = feature.properties.color || '#666';
              return window.CameraMarkers.createCameraMarker(latlng, 'markerPane', color);
            }
            // Ne pas créer de marker pour les points sans image
            return null;
          }
        }).addTo(map);

        // Zoom sur le GeoJSON
        map.fitBounds(layer.getBounds(), { padding: [50, 50] });
        
        // Initialiser le contrôle du zoom pour les camera markers
        if (window.CameraMarkers) {
          window.CameraMarkers.initZoomControl(map);
          console.log('[Carte] ✓ Contrôle zoom camera markers initialisé');
        }
      }
    } catch (e) {
      console.warn('[Carte] Erreur chargement GeoJSON:', e);
    }

    return map;
  } catch (e) {
    console.error('[Carte] Erreur initialisation:', e);
  }
}

/* ===========================================================================
   RENDU CONTENU
   =========================================================================== */

/**
 * Génère la structure HTML de la fiche
 */
function generateFicheHTML(projectName, isEmbed) {
  return `
    <div class="min-h-screen bg-white dark:bg-gray-900">
      ${!isEmbed ? `
      <header class="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border-b border-gray-200/50 dark:border-gray-700/50 shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <!-- Retour -->
            <div class="flex items-center">
              <a href="/" class="group inline-flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] hover:from-[var(--primary-hover)] hover:to-[var(--primary-active)] text-white rounded-xl shadow-md shadow-[var(--primary-alpha-25)] hover:shadow-lg hover:shadow-[var(--primary-alpha-35)] transition-all duration-300" aria-label="Retour à l'accueil">
                <i class="fa fa-arrow-left text-sm group-hover:-translate-x-1 transition-transform duration-300" aria-hidden="true"></i>
                <span class="text-sm font-semibold">Retour</span>
              </a>
            </div>
            
            <!-- Titre projet -->
            <div class="flex-1 flex items-center justify-center px-6">
              <h1 class="text-base md:text-lg font-bold text-gray-900 dark:text-white text-center truncate max-w-2xl">${escapeHTML(projectName)}</h1>
            </div>
            
            <!-- Actions + Logo -->
            <div class="flex items-center gap-3">
              <!-- Bouton Partager -->
              <button type="button" id="btn-share-link" class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors" aria-label="Partager" title="Partager le lien">
                <i class="fa-solid fa-share-nodes text-sm"></i>
              </button>
              
              <!-- Bouton Dark Mode -->
              <button type="button" id="btn-toggle-theme" class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors" aria-label="Changer de thème" title="Changer de thème">
                <i class="fa-solid fa-moon text-sm"></i>
              </button>
              
              <!-- Logo ville -->
              <div id="city-logo-container" class="flex items-center">
                <div id="city-logo" class="h-10 w-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </header>
      ` : ''}
      
      <!-- Layout unique : tout en colonne sur mobile, 2 colonnes sur desktop -->
      <div class="md:grid md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_400px] md:h-[calc(100vh-48px)]">
        
        <!-- Article principal -->
        <article class="overflow-y-auto">
          <div class="max-w-3xl mx-auto px-3 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
            
            <!-- Carte sticky qui se réduit au scroll -->
            <div id="project-map-container" class="group relative sticky top-16 z-10 mb-20 md:mb-24 h-[300px] md:h-[400px] rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5 dark:ring-white/5 transition-all duration-300" style="box-shadow: 0px -50px 50px 100px white; --tw-shadow: 0px -50px 50px 100px white;">
              <style>
                .dark #project-map-container {
                  box-shadow: 0px -50px 50px 100px #0f172a !important;
                }
              </style>
              <div id="project-map" class="w-full h-full"></div>
              
              <!-- Bouton Agrandir (visible au survol) -->
              <button type="button" id="btn-expand-map" class="absolute top-3 right-3 z-[1000] w-10 h-10 flex items-center justify-center bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-xl opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all duration-300" aria-label="Agrandir la carte" title="Agrandir la carte">
                <i class="fa-solid fa-expand text-[var(--primary)] text-sm"></i>
              </button>
            </div>
            
            <!-- Markdown content -->
            <div id="project-markdown-content"></div>
            
          </div>
        </article>

        <!-- Sidebar desktop uniquement -->
        <aside class="max-md:hidden overflow-y-auto p-4 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 space-y-4" id="fiche-sidebar">
        </aside>
      </div>
      
      <!-- Bottom Navigation Mobile -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-gray-700 shadow-2xl safe-area-bottom">
        <div class="flex items-center justify-around px-2 py-2">
          <button type="button" 
                  id="btn-modal-cover"
                  class="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all duration-300 hover:bg-[var(--primary-alpha-10)] active:scale-95"
                  aria-label="Voir l'image">
            <div class="w-11 h-11 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-lg shadow-[var(--primary-alpha-25)]">
              <i class="fa-solid fa-image text-white text-lg"></i>
            </div>
            <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">Image</span>
          </button>
          
          <button type="button" 
                  id="btn-modal-info"
                  class="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all duration-300 hover:bg-[var(--primary-alpha-10)] active:scale-95"
                  aria-label="Informations">
            <div class="w-11 h-11 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-lg shadow-[var(--primary-alpha-25)]">
              <i class="fa-solid fa-info-circle text-white text-lg"></i>
            </div>
            <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">Infos</span>
          </button>
          
          <button type="button" 
                  id="btn-modal-link"
                  class="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all duration-300 hover:bg-[var(--primary-alpha-10)] active:scale-95"
                  aria-label="Site officiel">
            <div class="w-11 h-11 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-lg shadow-[var(--primary-alpha-25)]">
              <i class="fa-solid fa-link text-white text-lg"></i>
            </div>
            <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">Site</span>
          </button>
          
          <button type="button" 
                  id="btn-modal-docs"
                  class="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all duration-300 hover:bg-[var(--primary-alpha-10)] active:scale-95"
                  aria-label="Documents">
            <div class="w-11 h-11 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] shadow-lg shadow-[var(--primary-alpha-25)]">
              <i class="fa-solid fa-file-pdf text-white text-lg"></i>
            </div>
            <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">Docs</span>
          </button>
        </div>
      </nav>
      
      <!-- Modale Carte Agrandie -->
      <div id="modal-map-fullscreen" class="gp-modal-overlay">
        <div class="gp-modal gp-modal--xlarge" style="max-width: 95vw; max-height: 95vh;">
          <div class="gp-modal-header">
            <div class="gp-modal-title">Carte du projet</div>
            <button class="btn-secondary gp-modal-close">×</button>
          </div>
          <div class="gp-modal-body" style="height: 80vh; padding: 0;">
            <div id="project-map-fullscreen" style="width: 100%; height: 100%;"></div>
          </div>
        </div>
      </div>
      
      <!-- Modales pour les cards -->
      <div id="modal-cover" class="gp-modal-overlay">
        <div class="gp-modal max-w-2xl">
          <div class="gp-modal-header">
            <div class="gp-modal-title">Image du projet</div>
            <button class="btn-secondary gp-modal-close">×</button>
          </div>
          <div class="gp-modal-body" id="modal-cover-content"></div>
        </div>
      </div>
      
      <div id="modal-info" class="gp-modal-overlay">
        <div class="gp-modal">
          <div class="gp-modal-header">
            <div class="gp-modal-title">Description</div>
            <button class="btn-secondary gp-modal-close">×</button>
          </div>
          <div class="gp-modal-body" id="modal-info-content"></div>
        </div>
      </div>
      
      <div id="modal-link" class="gp-modal-overlay">
        <div class="gp-modal">
          <div class="gp-modal-header">
            <div class="gp-modal-title">Site officiel</div>
            <button class="btn-secondary gp-modal-close">×</button>
          </div>
          <div class="gp-modal-body" id="modal-link-content"></div>
        </div>
      </div>
      
      <div id="modal-docs" class="gp-modal-overlay">
        <div class="gp-modal">
          <div class="gp-modal-header">
            <div class="gp-modal-title">Documents</div>
            <button class="btn-secondary gp-modal-close">×</button>
          </div>
          <div class="gp-modal-body" id="modal-docs-content"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render le contenu markdown
 */
async function renderMarkdown(markdownUrl, container) {
  try {
    const response = await fetch(markdownUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const markdown = await response.text();
    
    // Parser avec MarkdownUtils
    if (window.MarkdownUtils) {
      const { html } = window.MarkdownUtils.renderMarkdown(markdown);
      container.innerHTML = html;
      
      // Post-traitement : Ajouter des classes aux éléments générés
      enhanceMarkdownElements(container);
    } else {
      // Fallback si MarkdownUtils pas disponible
      container.innerHTML = `<p>${markdown}</p>`;
    }
  } catch (e) {
    console.error('[Markdown] Erreur chargement:', e);
    container.innerHTML = `<p class="error">Erreur de chargement du contenu.</p>`;
  }
}

/**
 * Améliore les éléments markdown générés
 */
function enhanceMarkdownElements(container) {
  // Tableaux : Ajouter wrapper pour scroll horizontal
  container.querySelectorAll('table').forEach(table => {
    if (!table.parentElement.classList.contains('table-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper overflow-x-auto my-8';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
  
  // Images : Ajouter loading lazy si pas déjà présent
  container.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading')) {
      img.setAttribute('loading', 'lazy');
    }
  });
  
  // Liens externes : Ajouter target blank et icône
  container.querySelectorAll('a[href^="http"]').forEach(link => {
    if (!link.hostname.includes(window.location.hostname)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      if (!link.querySelector('.external-icon')) {
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-arrow-up-right-from-square text-xs ml-1 external-icon';
        link.appendChild(icon);
      }
    }
  });
  
  // Code blocks : Ajouter bouton copier
  container.querySelectorAll('pre code').forEach(code => {
    const pre = code.parentElement;
    if (!pre.querySelector('.copy-button')) {
      const button = document.createElement('button');
      button.className = 'copy-button absolute top-2 right-2 px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-colors';
      button.innerHTML = '<i class="fa-solid fa-copy"></i>';
      button.onclick = () => {
        navigator.clipboard.writeText(code.textContent);
        button.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => button.innerHTML = '<i class="fa-solid fa-copy"></i>', 2000);
      };
      pre.style.position = 'relative';
      pre.appendChild(button);
    }
  });
}

/* ===========================================================================
   EVENTS
   =========================================================================== */

/**
 * Bind tous les événements de la page
 */
function bindEvents() {
  // Lightbox images
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lightbox-image]');
    if (btn) {
      e.preventDefault();
      const imageUrl = btn.dataset.lightboxImage;
      openLightbox(imageUrl);
    }
  });

  // PDF Preview
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pdf-preview]');
    if (btn) {
      e.preventDefault();
      const pdfUrl = btn.dataset.pdfPreview;
      const title = btn.dataset.pdfTitle;
      openPDFPreview(pdfUrl, title);
    }
  });
}

/* ===========================================================================
   INITIALISATION PRINCIPALE
   =========================================================================== */

async function initFicheProjet() {
  try {
    console.log('[FicheProjet] Initialisation...');

    // 1. Initialiser le thème (lecture localStorage + préférences système)
    if (window.ThemeManager) {
      window.ThemeManager.init();
      console.log('[FicheProjet] ✓ Thème initialisé');
    }

    // 2. Charger MarkdownUtils si nécessaire
    if (!window.MarkdownUtils) {
      console.warn('[FicheProjet] MarkdownUtils non chargé');
    } else {
      await window.MarkdownUtils.loadDeps();
    }

    // 3. Récupérer les paramètres
    const { projectName, category, city, isEmbed } = getURLParams();
    
    if (!projectName) {
      document.getElementById('project-article').innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h1>Projet non spécifié</h1>
          <p>Veuillez fournir un paramètre <code>?project=nom-du-projet</code></p>
        </div>
      `;
      return;
    }

    console.log('[FicheProjet] Projet:', projectName, '| Catégorie:', category);

    // 3. Charger les données depuis Supabase
    let projectData = null;
    try {
      projectData = await window.supabaseService?.fetchProjectByCategoryAndName(category, projectName);
      window.__fpContributionProject = projectData || null;
    } catch (e) {
      console.error('[FicheProjet] Erreur chargement données:', e);
    }

    if (!projectData) {
      document.getElementById('project-article').innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h1>Projet introuvable</h1>
          <p>Le projet "${projectName}" n'existe pas dans la catégorie "${category}"</p>
        </div>
      `;
      return;
    }

    // 4. Appliquer le city branding
    let branding = null;
    try {
      if (window.CityBrandingModule) {
        await window.CityBrandingModule.loadAndApplyBranding(city);
        // Récupérer le branding pour le logo
        if (window.supabaseService?.getCityBranding) {
          branding = await window.supabaseService.getCityBranding(city);
        }
      }
    } catch (e) {
      console.warn('[FicheProjet] Erreur city branding:', e);
    }

    // 5. Générer la structure HTML
    const article = document.getElementById('project-article');
    article.innerHTML = generateFicheHTML(projectName, isEmbed);
    
    // 6. Injecter le logo de la ville dans le header
    if (!isEmbed) {
      const logoContainer = document.getElementById('city-logo');
      if (logoContainer && branding && branding.logo_url) {
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const logoUrl = (theme === 'dark' && branding.dark_logo_url) ? branding.dark_logo_url : branding.logo_url;
        const logoAlt = branding.brand_name || city;
        
        logoContainer.innerHTML = `<img src="${logoUrl}" alt="${logoAlt}" class="h-full w-auto object-contain" />`;
      }
    }

    // 6. Appliquer SEO
    applySEO(projectName, {
      description: projectData.description || '',
      cover: projectData.cover_url || '',
      meta: projectData.meta || ''
    }, category);

    // 7. Générer les GP-Cards individuellement
    const coverCard = createCoverCard(projectData.cover_url, projectName);
    const descriptionCard = createDescriptionCard(projectData.description);
    const linkCard = createOfficialLinkCard(projectData.official_url);
    const docsCard = await createDocumentsCards(projectName);
    
    console.log('[FicheProjet] Cards générées:', {
      cover: !!coverCard,
      description: !!descriptionCard,
      link: !!linkCard,
      docs: !!docsCard
    });
    
    // Injecter dans la sidebar desktop (toutes les cards avec espacement)
    const sidebar = document.getElementById('fiche-sidebar');
    if (sidebar) {
      const allCards = [coverCard, descriptionCard, linkCard, docsCard].filter(Boolean);
      sidebar.innerHTML = allCards.join('');
      console.log('[FicheProjet] Cards injectées dans sidebar:', allCards.length);
      console.log('[FicheProjet] Sidebar HTML length:', sidebar.innerHTML.length);
      console.log('[FicheProjet] Sidebar classes:', sidebar.className);
      console.log('[FicheProjet] Sidebar display:', window.getComputedStyle(sidebar).display);
    } else {
      console.warn('[FicheProjet] Sidebar non trouvée');
    }
    
    // Injecter dans les modales mobiles (une card par modale)
    const modalCoverContent = document.getElementById('modal-cover-content');
    const modalInfoContent = document.getElementById('modal-info-content');
    const modalLinkContent = document.getElementById('modal-link-content');
    const modalDocsContent = document.getElementById('modal-docs-content');
    
    if (modalCoverContent) modalCoverContent.innerHTML = coverCard || '<p class="text-gray-500 text-center py-8">Aucune image disponible</p>';
    if (modalInfoContent) modalInfoContent.innerHTML = descriptionCard || '<p class="text-gray-500 text-center py-8">Aucune description disponible</p>';
    if (modalLinkContent) modalLinkContent.innerHTML = linkCard || '<p class="text-gray-500 text-center py-8">Aucun site officiel</p>';
    if (modalDocsContent) modalDocsContent.innerHTML = docsCard || '<p class="text-gray-500 text-center py-8">Aucun document disponible</p>';
    
    // Masquer les boutons de la bottom bar si pas de contenu
    const btnCover = document.getElementById('btn-modal-cover');
    const btnInfo = document.getElementById('btn-modal-info');
    const btnLink = document.getElementById('btn-modal-link');
    const btnDocs = document.getElementById('btn-modal-docs');
    
    if (btnCover && !coverCard) btnCover.style.display = 'none';
    if (btnInfo && !descriptionCard) btnInfo.style.display = 'none';
    if (btnLink && !linkCard) btnLink.style.display = 'none';
    if (btnDocs && !docsCard) btnDocs.style.display = 'none';

    // 8. Cover blur background
    if (projectData.cover_url) {
      const article = document.querySelector('.fiche-projet-article');
      if (article) {
        article.classList.add('has-cover-bg');
        article.style.setProperty('--cover-bg', `url('${toAbsoluteURL(projectData.cover_url)}')`);
      }
    }

    // 9. Charger le markdown
    const markdownContainer = document.getElementById('project-markdown-content');
    if (projectData.markdown_url) {
      await renderMarkdown(projectData.markdown_url, markdownContainer);
    } else {
      markdownContainer.innerHTML = '';
    }

    // 10. Initialiser la carte
    await initProjectMap('project-map', projectName, category);

    // 11. Bind les événements
    bindEvents();
    
    // 12. Bind les événements de la bottom bar mobile
    bindBottomBarEvents();
    
    // 13. Initialiser le comportement de la carte sticky
    initStickyMapBehavior();
    
    // 14. Bind les événements du header (partage, dark mode)
    bindHeaderEvents();
    
    // 15. Bind l'événement d'agrandissement de la carte
    bindMapExpandEvent(projectName, category);
    
    // 16. Initialiser la classe dark pour Tailwind
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    console.log('[FicheProjet] Initialisation terminée ✓');

  } catch (e) {
    console.error('[FicheProjet] Erreur fatale:', e);
    document.getElementById('project-article').innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <h1>Erreur</h1>
        <p>Une erreur est survenue lors du chargement de la fiche projet.</p>
        <pre style="text-align: left; background: #f5f5f5; padding: 20px; border-radius: 8px; overflow: auto;">${e.message}</pre>
      </div>
    `;
  }
}

/* ===========================================================================
   BOTTOM BAR MOBILE - ÉVÉNEMENTS
   =========================================================================== */

/**
 * Bind les événements de la bottom bar mobile
 */
function bindBottomBarEvents() {
  // Bouton Image
  const btnCover = document.getElementById('btn-modal-cover');
  if (btnCover) {
    btnCover.addEventListener('click', () => {
      if (window.ModalHelper) {
        window.ModalHelper.open('modal-cover', {
          dismissible: true,
          lockScroll: true
        });
      }
    });
  }
  
  // Bouton Infos
  const btnInfo = document.getElementById('btn-modal-info');
  if (btnInfo) {
    btnInfo.addEventListener('click', () => {
      if (window.ModalHelper) {
        window.ModalHelper.open('modal-info', {
          dismissible: true,
          lockScroll: true
        });
      }
    });
  }
  
  // Bouton Site
  const btnLink = document.getElementById('btn-modal-link');
  if (btnLink) {
    btnLink.addEventListener('click', () => {
      if (window.ModalHelper) {
        window.ModalHelper.open('modal-link', {
          dismissible: true,
          lockScroll: true
        });
      }
    });
  }
  
  // Bouton Documents
  const btnDocs = document.getElementById('btn-modal-docs');
  if (btnDocs) {
    btnDocs.addEventListener('click', () => {
      if (window.ModalHelper) {
        window.ModalHelper.open('modal-docs', {
          dismissible: true,
          lockScroll: true
        });
      }
    });
  }
}

/* ===========================================================================
   STICKY MAP BEHAVIOR
   =========================================================================== */

/**
 * Réduit la hauteur de la carte au scroll (smooth, sans clignotement)
 */
function initStickyMapBehavior() {
  const mapContainer = document.getElementById('project-map-container');
  const article = mapContainer?.closest('article');
  
  if (!mapContainer || !article) return;
  
  let isReduced = false;
  let ticking = false;
  let isTransitioning = false; // Empêche les changements pendant la transition
  
  article.addEventListener('scroll', () => {
    if (!ticking && !isTransitioning) {
      window.requestAnimationFrame(() => {
        const scrollTop = article.scrollTop;
        
        // Scroll > 200px : réduire (seuil encore plus haut)
        if (scrollTop > 200 && !isReduced) {
          isTransitioning = true;
          mapContainer.classList.remove('h-[300px]', 'md:h-[400px]');
          mapContainer.classList.add('h-[200px]', 'md:h-[250px]');
          isReduced = true;
          
          // Débloquer après la transition (300ms)
          setTimeout(() => { isTransitioning = false; }, 350);
        }
        // Scroll < 50px : restaurer (hystérésis large)
        else if (scrollTop < 50 && isReduced) {
          isTransitioning = true;
          mapContainer.classList.remove('h-[200px]', 'md:h-[250px]');
          mapContainer.classList.add('h-[300px]', 'md:h-[400px]');
          isReduced = false;
          
          // Débloquer après la transition (300ms)
          setTimeout(() => { isTransitioning = false; }, 350);
        }
        
        ticking = false;
      });
      ticking = true;
    }
  });
}

/* ===========================================================================
   HEADER EVENTS (Partage + Dark Mode)
   =========================================================================== */

/**
 * Bind les événements du header
 */
function bindHeaderEvents() {
  // Bouton Partager
  const btnShare = document.getElementById('btn-share-link');
  if (btnShare) {
    btnShare.addEventListener('click', async () => {
      try {
        const url = window.location.href;
        await navigator.clipboard.writeText(url);
        
        // Feedback visuel
        const originalHTML = btnShare.innerHTML;
        btnShare.innerHTML = '<i class="fa-solid fa-check text-sm text-green-600"></i>';
        btnShare.classList.add('bg-green-100');
        
        setTimeout(() => {
          btnShare.innerHTML = originalHTML;
          btnShare.classList.remove('bg-green-100');
        }, 2000);
        
        // Toast notification (si disponible)
        if (window.showToast) {
          window.showToast('Lien copié !', 'success');
        }
      } catch (e) {
        console.error('[Share] Erreur copie lien:', e);
        if (window.showToast) {
          window.showToast('Erreur lors de la copie', 'error');
        }
      }
    });
  }
  
  // Bouton Dark Mode
  const btnTheme = document.getElementById('btn-toggle-theme');
  if (btnTheme) {
    // Mettre à jour l'icône selon le thème actuel
    const updateThemeIcon = () => {
      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      const icon = btnTheme.querySelector('i');
      if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-sun text-sm' : 'fa-solid fa-moon text-sm';
      }
    };
    
    updateThemeIcon();
    
    btnTheme.addEventListener('click', () => {
      if (window.ThemeManager?.toggle) {
        window.ThemeManager.toggle();
        
        // Ajouter/retirer la classe 'dark' pour Tailwind
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        
        updateThemeIcon();
        
        // Recharger la carte avec le bon basemap
        const mapContainer = document.getElementById('project-map');
        if (mapContainer && window.ficheProjectMap) {
          updateMapBasemap();
        }
      }
    });
  }
}

/**
 * Met à jour le basemap de la carte selon le thème
 */
function updateMapBasemap() {
  if (!window.ficheProjectMap) return;
  
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const map = window.ficheProjectMap;
  
  // Retirer l'ancien basemap
  map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer) {
      map.removeLayer(layer);
    }
  });
  
  // Ajouter le nouveau basemap
  let basemapConfig;
  if (theme === 'light') {
    // Carte par défaut Leaflet (OpenStreetMap)
    basemapConfig = {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors'
    };
  } else {
    // Carte sombre
    basemapConfig = window.ThemeManager?.getBasemapForTheme('dark') || {
      url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
      attribution: '© CartoDB'
    };
  }
  
  L.tileLayer(basemapConfig.url, {
    attribution: basemapConfig.attribution,
    maxZoom: 19
  }).addTo(map);
}

/* ===========================================================================
   MAP EXPAND (Modale plein écran)
   =========================================================================== */

/**
 * Bind l'événement d'agrandissement de la carte
 */
function bindMapExpandEvent(projectName, category) {
  const btnExpand = document.getElementById('btn-expand-map');
  if (!btnExpand) return;
  
  btnExpand.addEventListener('click', async () => {
    if (!window.ModalHelper) return;
    
    // Ouvrir la modale
    window.ModalHelper.open('modal-map-fullscreen', {
      dismissible: true,
      lockScroll: true,
      onOpen: async () => {
        // Créer une nouvelle carte dans la modale
        const container = document.getElementById('project-map-fullscreen');
        if (!container || !window.L) return;
        
        // Nettoyer si une carte existe déjà
        container.innerHTML = '';
        
        // Créer la carte fullscreen
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        let basemap;
        if (theme === 'light') {
          basemap = {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors'
          };
        } else {
          basemap = {
            url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
            attribution: '© CartoDB'
          };
        }
        
        const mapFullscreen = window.L.map('project-map-fullscreen', {
          center: window.ficheProjectMap?.getCenter() || FP_CONFIG.MAP_DEFAULT_CENTER,
          zoom: window.ficheProjectMap?.getZoom() || FP_CONFIG.MAP_DEFAULT_ZOOM,
          zoomControl: true
        });
        
        window.L.tileLayer(basemap.url, {
          attribution: basemap.attribution,
          maxZoom: 19
        }).addTo(mapFullscreen);
        
        // Copier les layers de la carte principale
        if (window.ficheProjectMap) {
          window.ficheProjectMap.eachLayer((layer) => {
            if (layer instanceof window.L.GeoJSON || layer instanceof window.L.Marker) {
              layer.addTo(mapFullscreen);
            }
          });
        }
        
        // Invalider la taille après un court délai
        setTimeout(() => mapFullscreen.invalidateSize(), 100);
        
        // Stocker pour nettoyage
        window.__fullscreenMap = mapFullscreen;
      },
      onClose: () => {
        // Nettoyer la carte fullscreen
        if (window.__fullscreenMap) {
          window.__fullscreenMap.remove();
          window.__fullscreenMap = null;
        }
      }
    });
  });
}

/* ===========================================================================
   DÉMARRAGE
   =========================================================================== */

document.addEventListener('DOMContentLoaded', initFicheProjet);
