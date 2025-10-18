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
    <div class="gp-card gp-card--media">
      <div class="gp-card-media">
        <img src="${absoluteUrl}" alt="${projectName}" loading="lazy">
        <button class="gp-card-media-action" aria-label="Agrandir l'image" data-lightbox-image="${absoluteUrl}">
          <i class="fa fa-expand" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `;
}

/**
 * Crée une card Description
 */
function createDescriptionCard(description) {
  if (!description) return '';

  return `
    <div class="gp-card gp-card--info">
      <div class="gp-card-header">
        <i class="fa-solid fa-info-circle" aria-hidden="true"></i>
        <h3>Description du projet</h3>
      </div>
      <div class="gp-card-body">
        <p>${description}</p>
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
    <div class="gp-card gp-card--link">
      <div class="gp-card-header">
        <i class="fa-solid fa-bookmark" aria-hidden="true"></i>
        <h3>Site de référence</h3>
      </div>
      <div class="gp-card-body">
        <div class="gp-card-link-preview">
          <img src="${faviconUrl}" alt="" onerror="this.style.display='none'">
          <span>${domain}</span>
        </div>
      </div>
      <div class="gp-card-footer">
        <a href="${url}" target="_blank" rel="noopener" class="btn-primary">
          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
          Ouvrir le site
        </a>
        <button type="button" class="btn-secondary" data-qr-url="${url}" data-qr-domain="${domain}">
          <i class="fa-solid fa-qrcode" aria-hidden="true"></i>
          QR Code
        </button>
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
        <div class="gp-card-grid-item gp-card-grid-item--vertical">
          <div class="gp-card-grid-item-header">
            <div class="gp-card-grid-item-icon">
              <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
            </div>
            <div class="gp-card-grid-item-content">
              <h4 class="gp-card-grid-item-title">${title}</h4>
            </div>
          </div>
          <div class="gp-card-grid-item-actions">
            <button type="button" class="btn-primary btn-small" data-pdf-preview="${pdfUrl}" data-pdf-title="${title}">
              <i class="fa-solid fa-eye" aria-hidden="true"></i>
              Prévisualiser
            </button>
            <a class="btn-secondary btn-small" href="${pdfUrl}" target="_blank" rel="noopener" download title="Télécharger" aria-label="Télécharger ${title}">
              <i class="fa-solid fa-download" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="gp-card gp-card--documents">
        <div class="gp-card-header">
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
          <h3>Documents de concertation</h3>
        </div>
        <div class="gp-card-body">
          <div class="gp-card-grid">
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
    overlay.innerHTML = `
      <img class="lightbox-image" src="" alt="Image agrandie">
      <button class="lightbox-close" aria-label="Fermer">×</button>
    `;
    document.body.appendChild(overlay);

    // Event close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('lightbox-close')) {
        overlay.classList.remove('active');
      }
    });

    // Event ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
      }
    });
  }

  overlay.querySelector('.lightbox-image').src = imageUrl;
  overlay.classList.add('active');
}

/**
 * Ouvre la modal QR Code
 */
function openQRCode(url, domain) {
  console.log('[QR Code] Initialisation...', { url, domain });
  
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  console.log('[QR Code] URL générée:', qrCodeUrl);
  
  let modal = document.getElementById('qr-code-modal');
  
  if (!modal) {
    console.log('[QR Code] Création de la modale...');
    modal = document.createElement('div');
    modal.id = 'qr-code-modal';
    modal.className = 'gp-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="gp-modal">
        <div class="gp-modal-header">
          <div class="gp-modal-title">QR Code - ${domain}</div>
          <button class="btn-secondary gp-modal-close" aria-label="Fermer">×</button>
        </div>
        <div class="gp-modal-body">
          <div class="qr-code-container">
            <img src="${qrCodeUrl}" alt="QR Code pour ${domain}" class="qr-code-image">
            <p class="qr-code-description">Scannez ce QR code avec votre téléphone pour ouvrir le site</p>
            <div class="qr-code-url">${url}</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    console.log('[QR Code] ✓ Modale créée et ajoutée au DOM');
  } else {
    console.log('[QR Code] Modale existante trouvée, mise à jour...');
    modal.querySelector('.gp-modal-title').textContent = `QR Code - ${domain}`;
    modal.querySelector('.qr-code-image').src = qrCodeUrl;
    modal.querySelector('.qr-code-url').textContent = url;
    console.log('[QR Code] ✓ Modale mise à jour');
  }

  console.log('[QR Code] Vérification ModalHelper...', { 
    modalHelperExists: !!window.ModalHelper,
    modalElement: modal,
    modalId: modal.id
  });

  if (window.ModalHelper) {
    console.log('[QR Code] Ouverture via ModalHelper avec ID:', modal.id);
    try {
      // ModalHelper.open() attend un ID (string), pas un élément DOM
      window.ModalHelper.open('qr-code-modal');
      console.log('[QR Code] ✓ Modale ouverte avec ModalHelper');
    } catch (e) {
      console.error('[QR Code] ❌ Erreur ModalHelper:', e);
      modal.style.display = 'flex';
      console.log('[QR Code] → Fallback: display flex appliqué');
    }
  } else {
    console.warn('[QR Code] ⚠️ ModalHelper non disponible, fallback...');
    modal.style.display = 'flex';
    console.log('[QR Code] ✓ Modale affichée avec fallback');
  }
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

    // Ajouter le fond de carte selon le thème (utilise ThemeManager)
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    console.log('[Carte] Thème actuel:', currentTheme);
    
    // Utiliser ThemeManager pour trouver le bon basemap
    let basemap = null;
    if (window.ThemeManager && window.ThemeManager.findBasemapForTheme) {
      basemap = window.ThemeManager.findBasemapForTheme(currentTheme);
      console.log('[Carte] Basemap trouvé via ThemeManager:', basemap);
    }
    
    // Fallback si ThemeManager pas disponible
    if (!basemap) {
      const basemaps = window.basemaps || [];
      basemap = basemaps.find(b => b.theme === currentTheme) || basemaps[0];
      console.log('[Carte] Basemap fallback:', basemap);
    }
    
    if (basemap) {
      console.log('[Carte] Ajout du fond de carte:', basemap.label, basemap.url);
      const baseLayer = window.L.tileLayer(basemap.url, {
        attribution: basemap.attribution || '',
        maxZoom: 19
      }).addTo(map);
      console.log('[Carte] ✓ Fond de carte ajouté');
      
      // Stocker pour sync thème
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
    } else {
      console.error('[Carte] ❌ Aucun basemap trouvé');
    }

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
    <div class="fiche-projet${isEmbed ? ' is-embed' : ''}">
      ${!isEmbed ? `
      <header class="fiche-projet-header">
        <a href="/" class="project-v2-back btn-secondary" aria-label="Retour à l'accueil">
          <i class="fa fa-arrow-left" aria-hidden="true"></i>
          <span>Retour</span>
        </a>
        <h1 class="fiche-projet-title">${projectName}</h1>
      </header>
      ` : ''}
      <div class="fiche-projet-main">
        <div class="fiche-projet-map">
          <div id="project-map"></div>
        </div>
        <aside class="fiche-projet-sidebar" id="fiche-sidebar">
          <!-- GP-Cards seront injectées ici -->
        </aside>
        <article class="fiche-projet-article">
          <div id="project-markdown-content" class="markdown-body"></div>
        </article>
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
    } else {
      // Fallback si MarkdownUtils pas disponible
      container.innerHTML = `<p>${markdown}</p>`;
    }
  } catch (e) {
    console.error('[Markdown] Erreur chargement:', e);
    container.innerHTML = `<p class="error">Erreur de chargement du contenu.</p>`;
  }
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

  // QR Code - Vérifier présence des boutons au chargement
  setTimeout(() => {
    const qrButtons = document.querySelectorAll('[data-qr-url]');
    console.log(`[QR Code] ${qrButtons.length} bouton(s) QR Code trouvé(s) dans le DOM`);
    if (qrButtons.length > 0) {
      qrButtons.forEach((btn, index) => {
        console.log(`[QR Code] Bouton ${index + 1}:`, {
          element: btn,
          url: btn.dataset.qrUrl,
          domain: btn.dataset.qrDomain
        });
      });
    }
  }, 500);

  // QR Code - Listener de clic
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qr-url]');
    if (btn) {
      console.log('[QR Code] Clic détecté sur bouton QR Code');
      console.log('[QR Code] Élément cliqué:', btn);
      console.log('[QR Code] Datasets:', {
        qrUrl: btn.dataset.qrUrl,
        qrDomain: btn.dataset.qrDomain
      });
      
      e.preventDefault();
      const url = btn.dataset.qrUrl;
      const domain = btn.dataset.qrDomain;
      
      if (!url) {
        console.error('[QR Code] ❌ URL manquante dans data-qr-url');
        return;
      }
      
      openQRCode(url, domain);
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

    if (!projectData || !projectData.markdown_url) {
      document.getElementById('project-article').innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h1>Projet introuvable</h1>
          <p>Le projet "${projectName}" n'existe pas dans la catégorie "${category}"</p>
        </div>
      `;
      return;
    }

    // 4. Appliquer le city branding
    try {
      if (window.CityBrandingModule) {
        await window.CityBrandingModule.loadAndApplyBranding(city);
      }
    } catch (e) {
      console.warn('[FicheProjet] Erreur city branding:', e);
    }

    // 5. Générer la structure HTML
    const article = document.getElementById('project-article');
    article.innerHTML = generateFicheHTML(projectName, isEmbed);

    // 6. Appliquer SEO
    applySEO(projectName, {
      description: projectData.description || '',
      cover: projectData.cover_url || '',
      meta: projectData.meta || ''
    }, category);

    // 7. Générer les GP-Cards dans la sidebar
    const sidebar = document.getElementById('fiche-sidebar');
    const cardsHTML = [
      createCoverCard(projectData.cover_url, projectName),
      createDescriptionCard(projectData.description),
      createOfficialLinkCard(projectData.official_url),
      await createDocumentsCards(projectName)
    ].filter(Boolean).join('');
    
    sidebar.innerHTML = cardsHTML;

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
    await renderMarkdown(projectData.markdown_url, markdownContainer);

    // 10. Initialiser la carte
    await initProjectMap('project-map', projectName, category);

    // 11. Bind les événements
    bindEvents();

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
   DÉMARRAGE
   =========================================================================== */

document.addEventListener('DOMContentLoaded', initFicheProjet);
