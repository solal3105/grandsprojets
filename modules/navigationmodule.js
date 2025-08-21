// modules/NavigationModule.js
const NavigationModule = (() => {
  const projectDetailPanel = document.getElementById('project-detail');

  // Utilitaire pour normaliser les chaînes
  function normalizeString(str) {
    // Vérification explicite du type
    if (str === null || str === undefined) return "";
    
    // Conversion en chaîne si ce n'est pas déjà une chaîne
    const strValue = String(str);

    // 1) Normaliser les diacritiques (NFD) puis les supprimer (ex: î -> i, é -> e)
    // 2) Unifier les apostrophes et guillemets typographiques vers l'apostrophe simple
    // 3) Normaliser les tirets (– —) vers le tiret simple, puis réduire à un espace pour la comparaison souple
    // 4) Réduire les espaces (y compris insécables), trim et toLowerCase
    return strValue
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/[\u2018\u2019\u2032]/g, "'") // curly/smart quotes to straight apostrophe
      .replace(/[\u201C\u201D\u2033]/g, '"') // curly double quotes to straight double quote
      .replace(/[\u2013\u2014]/g, '-') // en/em dashes to hyphen
      .replace(/['"`´]/g, "'") // unify remaining quotes to apostrophe
      .replace(/\u00A0/g, ' ') // nbsp to space
      .replace(/[^a-zA-Z0-9\s-]/g, '') // drop other punct for robust compare
      .replace(/[-_]+/g, ' ') // treat dashes/underscores as spaces
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Fonction utilitaire pour ajuster la vue de la carte
  function zoomOutOnLoadedLayers() {
    let combinedBounds = null;
    Object.values(MapModule.layers).forEach(layer => {
      if (typeof layer.getBounds === "function") {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          combinedBounds = combinedBounds ? combinedBounds.extend(bounds) : bounds;
        }
      }
    });
    if (combinedBounds) {
      MapModule.map.fitBounds(combinedBounds, { padding: [100, 100] });
    } else {
      MapModule.map.setView([45.75, 4.85], 12);
    }
  }



/**
 * Affiche les détails d'un projet dans le panneau latéral
 * @param {string} projectName - Nom du projet à afficher
 * @param {string} category - Catégorie du projet (velo, transport, mobilite, urbanisme)
 * @param {Event} [event] - Événement de clic (optionnel)
 */
async function showProjectDetail(projectName, category, event) {
  console.group('=== showProjectDetail ===');
  console.log('Paramètres initiaux:', { projectName, category });
  
  // Gestion de l'événement si fourni
  if (event?.stopPropagation) {
    event.stopPropagation();
    console.log('Événement de clic arrêté');
  }
  
  // Masquer tous les sous-menus
  const submenus = ['velo', 'transport', 'mobilite', 'urbanisme'];
  console.log('Masquage des sous-menus:', submenus);
  submenus.forEach(id => {
    const el = document.getElementById(`${id}-submenu`);
    if (el) {
      el.style.display = 'none';
      console.log(`Sous-menu masqué: ${id}`);
    }
  });
  
  // Ajuster le style du panneau de navigation
  const leftNav = document.getElementById('left-nav');
  if (leftNav) {
    leftNav.style.borderRadius = window.innerWidth < 1024 
      ? '0 0 20px 20px' 
      : '20px 0 0 20px';
    console.log('Style du panneau de navigation ajusté');
  }

  // Fonction utilitaire pour créer des slugs
  const slugify = str => String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Ne garder que les caractères alphanumériques, espaces et tirets
    .trim()
    .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
    .replace(/-+/g, '-'); // Éviter les tirets multiples

  // Déterminer la catégorie effective
  const effectiveCat = (category === 'transport') ? 'mobilite' : category;
  console.log('Catégorie effective:', effectiveCat);
  
  // Construire le chemin du fichier Markdown
  let mdPath;
  if (effectiveCat === 'velo') {
    const numMatch = projectName.match(/(\d+)/);
    mdPath = numMatch 
      ? `pages/velo/ligne-${numMatch[1]}.md`
      : `pages/velo/${slugify(projectName)}.md`;
  } else {
    const subfolder = effectiveCat === 'mobilite' ? 'mobilite' : 'urbanisme';
    mdPath = `pages/${subfolder}/${slugify(projectName)}.md`;
  }
  console.log('Chemin du fichier Markdown construit:', mdPath);

  // Afficher le panneau de chargement
  const panel = document.getElementById('project-detail');
  panel.innerHTML = '<p style="padding:1em">Chargement…</p>';
  panel.style.display = 'block';
  // Reset collapse state when opening a new project detail
  panel.style.removeProperty('max-height');
  panel.style.removeProperty('overflow');
  console.log('Panneau de chargement affiché');

  try {
    console.log('Tentative de chargement du fichier:', mdPath);
    const response = await fetch(mdPath);
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
    }
    
    const md = await response.text();
    console.log('Fichier chargé avec succès, taille:', `${(md.length / 1024).toFixed(2)} KB`);

    /**
     * Charge les utilitaires Markdown si nécessaire
     */
    async function ensureMarkdownUtils() {
      console.log('Vérification des utilitaires Markdown...');
      
      if (!window.MarkdownUtils) {
        console.log('MarkdownUtils non trouvé, chargement en cours...');
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/modules/MarkdownUtils.js';
          script.onload = () => {
            console.log('MarkdownUtils chargé avec succès');
            resolve();
          };
          script.onerror = () => {
            const error = new Error('Échec du chargement de MarkdownUtils');
            console.error(error);
            reject(error);
          };
          document.head.appendChild(script);
        });
      }
      
      if (window.MarkdownUtils?.loadDeps) {
        console.log('Chargement des dépendances Markdown...');
        await window.MarkdownUtils.loadDeps();
        console.log('Dépendances Markdown chargées');
      }
    }

    await ensureMarkdownUtils();
    console.log('Traitement du contenu Markdown...');
    const { attrs, html } = window.MarkdownUtils.renderMarkdown(md);
    console.log('Contenu Markdown traité avec succès');
    // Résolution robuste de l'URL d'illustration (fonctionne en sous-chemin et en file://)
    const resolveAssetUrl = (u) => {
      try {
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u; // URL absolue distante
        if (location.protocol === 'file:' && u.startsWith('/')) {
          // En file://, les chemins absolus "/img/..." ne fonctionnent pas -> rendre relatif
          return '.' + u;
        }
        if (u.startsWith('/')) {
          // Hébergement sous sous-chemin: préfixer par le répertoire courant
          const baseDir = location.pathname.replace(/[^\/]*$/, ''); // conserve le dossier
          return (baseDir.endsWith('/') ? baseDir.slice(0, -1) : baseDir) + u;
        }
        return u; // déjà relatif
      } catch(_) { return u; }
    };

    const extractFirstImageSrc = (markup) => {
      try {
        if (!markup) return null;
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        const img = doc.querySelector('img');
        const src = img?.getAttribute('src') || img?.getAttribute('data-src');
        return src || null;
      } catch(_) { return null; }
    };

    let body='';
    // On ne garde que la couverture, les chips et la description
    const coverCandidate = attrs.cover || extractFirstImageSrc(html);
    if (coverCandidate) {
      const coverUrl = resolveAssetUrl(coverCandidate);
      body+=`
      <div class="project-cover-wrap">
        <img class="project-cover" src="${coverUrl}" alt="${attrs.name||''}">
        <button class="cover-extend-btn" aria-label="Agrandir l'image" title="Agrandir">
          <i class="fa fa-up-right-and-down-left-from-center" aria-hidden="true"></i>
        </button>
      </div>`;
    }
    const chips=[];
    if(attrs.from||attrs.to) chips.push(`<span class="chip chip-route">${attrs.from||''}${attrs.to?` → ${attrs.to}`:''}</span>`);
    if(attrs.trafic) chips.push(`<span class="chip chip-trafic">${attrs.trafic}</span>`);
    if(chips.length) body+=`<div class="project-chips">${chips.join('')}</div>`;
    if(attrs.description) body+=`<p class="project-description">${attrs.description}</p>`;

    const icons={velo:'fa-bicycle',mobilite:'fa-bus-alt',transport:'fa-bus-alt',urbanisme:'fa-city'};
    
    // Vérifier si une fiche complète existe pour ce projet
    let fullPageUrl = null;
    if (window.projectPages) {
      fullPageUrl = window.projectPages[projectName] || null;
      if (!fullPageUrl) {
        const normalizedProjectName = normalizeString(projectName);
        const matchingKey = Object.keys(window.projectPages).find(k => normalizeString(k) === normalizedProjectName);
        if (matchingKey) fullPageUrl = window.projectPages[matchingKey];
      }
    }

    // Si une URL est fournie par projectPages, on la valide
    if (fullPageUrl) {
      try {
        const head = await fetch(fullPageUrl, { method: 'HEAD' });
        if (!head.ok) {
          // Essayer une variante sans accents/ponctuation sur le nom de fichier (basename)
          const normalizeBase = (s) => String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // accents
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // retirer ponctuation (apostrophes, etc.)
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
          try {
            const urlObj = new URL(fullPageUrl, window.location.origin);
            const parts = urlObj.pathname.split('/');
            const file = parts.pop();
            if (file) {
              const decoded = (() => { try { return decodeURIComponent(file); } catch { return file; } })();
              const dot = decoded.lastIndexOf('.');
              const base = dot >= 0 ? decoded.slice(0, dot) : decoded;
              const ext  = dot >= 0 ? decoded.slice(dot) : '';
              const altFile = `${normalizeBase(base)}${ext || '.html'}`;
              const altPath = [...parts, altFile].join('/');
              const altUrl = `${urlObj.origin}${altPath.startsWith('/') ? '' : '/'}${altPath}`;
              const headAlt = await fetch(altUrl, { method: 'HEAD' });
              if (headAlt.ok) {
                fullPageUrl = altUrl;
              } else {
                fullPageUrl = null; // laisser le fallback mdPath prendre le relais
              }
            }
          } catch (_) {
            fullPageUrl = null;
          }
        }
      } catch (_) {
        fullPageUrl = null;
      }
    }

    // Fallback: si aucune URL trouvée dans projectPages, tenter la page HTML déduite du chemin MD
    if (!fullPageUrl && typeof mdPath === 'string') {
      const htmlCandidate = mdPath.replace(/\.md$/, '.html');
      try {
        const head = await fetch(htmlCandidate, { method: 'HEAD' });
        if (head.ok) {
          fullPageUrl = htmlCandidate;
        }
      } catch (e) {
        // silencieux: si HEAD échoue, on n'affiche pas le bouton
      }
    }
    
    panel.innerHTML = `
      <div class="detail-header-project-list">
        <div class="detail-header-top project-header-container" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:.5rem;">
          <button id="detail-back-btn">Retour</button>
          <button id="detail-toggle-btn" style="display:none; margin:0 1rem; background:none; border:none; cursor:pointer;"><i class="fas fa-chevron-down"></i></button>
        </div>
        <div style="display:flex; align-items:center; gap:.5rem;">
          <button id="detail-close-btn">✖</button>
        </div>
      </div>
      <div class="project-title-container">
        <i class="fas ${icons[category]||'fa-map'}"></i>
        <h3 class="project-title">${projectName}</h3>
      </div>
        ${fullPageUrl ? `<a href="${fullPageUrl}" class="detail-fullpage-btn">
           <i class="fas fa-external-link-alt"></i>Voir la fiche complète
          </a>` : ''}
      </div>
      <div id="detail-content" class="markdown-body">${body}</div>`;
    
    // Ensure toggle icon starts in 'down' state on each open
    try {
      const _btn = document.getElementById('detail-toggle-btn');
      const _ic = _btn?.querySelector('i');
      if (_ic) { _ic.classList.remove('fa-chevron-up'); _ic.classList.add('fa-chevron-down'); }
    } catch(_) {}

    // Le bouton de thème du panneau de détail a été supprimé; aucune synchronisation nécessaire ici.
    let themeObserver = null;

    // Styles déplacés dans style.css (cover overlay + lightbox)

    // Wire up Extend button in this panel
    (function(){
      const content = panel.querySelector('#detail-content');
      const coverWrap = content?.querySelector('.project-cover-wrap');
      if (!coverWrap) return;
      const btn = coverWrap.querySelector('.cover-extend-btn');
      const img = coverWrap.querySelector('img.project-cover');
      const openLightbox = () => {
        const overlay = document.createElement('div');
        overlay.className = 'cover-lightbox';
        overlay.innerHTML = `
          <div class="lightbox-content">
            <img src="${img.getAttribute('src')}" alt="${img.getAttribute('alt') || ''}">
            <button class="lightbox-close" aria-label="Fermer">
              <i class="fa fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        `;
        document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.lightbox-close').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        // Set initial focus for accessibility
        const closeBtn = overlay.querySelector('.lightbox-close');
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      };
      btn?.addEventListener('click', openLightbox);
    })();

    // Wire up "Voir la fiche complète" to open a modal by default (preserve modifier/middle click)
    (function(){
      const cta = panel.querySelector('.detail-fullpage-btn');
      if (!cta) return;
      const url = cta.getAttribute('href');
      const title = projectName || 'Fiche projet';

      function openFicheModal() {
        const overlay = document.createElement('div');
        overlay.className = 'pdf-lightbox';
        overlay.innerHTML = `
          <div class="lightbox-content" role="dialog" aria-modal="true" aria-label="${title}">
            <div class="lightbox-header">
              <span class="lightbox-title">${title}</span>
              <div style="display:flex; gap:8px; align-items:center; margin-left:auto;">
                <a href="${url}" target="_blank" rel="noopener" title="Ouvrir dans un nouvel onglet" aria-label="Ouvrir dans un nouvel onglet" style="display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 10px; border-radius:10px; border:1px solid var(--border); background: var(--tooltip-bg); color: var(--text); text-decoration:none;">
                  <i class="fa fa-external-link-alt" aria-hidden="true"></i>
                  Nouvel onglet
                </a>
                <button class="lightbox-close" aria-label="Fermer"><i class="fa fa-xmark" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="lightbox-body">
              <iframe class="pdf-frame" src="${url}" title="${title}"></iframe>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.lightbox-close').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
      }

      cta.addEventListener('click', (e) => {
        // Allow middle click or modifier keys to open in new tab/window
        if (e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openFicheModal();
      });
    })();

    /**
     * Gestionnaire d'événement pour le bouton de fermeture du panneau de détail.
     * Effectue les opérations suivantes :
     * 1. Masque le panneau de détail
     * 2. Réinitialise le style de la navigation latérale
     * 3. Ferme tous les sous-menus
     * 4. Réinitialise tous les filtres actifs
     * 5. Nettoie les couches actuelles de la carte
     * 6. Recharge et affiche les couches par défaut
     * 7. Met à jour l'interface utilisateur
     */
    document.getElementById('detail-close-btn').onclick = () => {
      console.log('=== DÉBUT GESTIONNAIRE DE FERMETURE ===');
      // Déconnecter l'observer du thème si actif
      if (themeObserver) { try { themeObserver.disconnect(); } catch (_) {} themeObserver = null; }
      
      // 1. Cacher le panneau de détail
      panel.style.display = 'none';
      
      // 2. Réinitialiser le style du panneau latéral gauche
      const leftNav = document.getElementById('left-nav');
      if (leftNav) {
        leftNav.style.borderRadius = '20px';
      }
      
      // 2bis. Réinitialiser les états actifs de la navigation (boutons catégories)
      try {
        document.querySelectorAll('#left-nav .nav-category.active').forEach(btn => btn.classList.remove('active'));
      } catch (_) { /* no-op */ }

      // 3. Fermer tous les sous-menus (vélo, transport, mobilité, urbanisme)
      ['velo', 'transport', 'mobilite', 'urbanisme'].forEach(id => {
        const submenu = document.getElementById(`${id}-submenu`);
        if (submenu) submenu.style.display = 'none';
      });
      
      // 4. Réinitialiser les filtres
      // 4.1 Réinitialiser les filtres de couches individuels via UIModule
      if (window.UIModule && window.UIModule.resetLayerFilter) {
        document.querySelectorAll('.filter-item').forEach(item => {
          const layer = item.dataset.layer;
          window.UIModule.resetLayerFilter(layer);
          item.classList.remove('active-filter');
        });
      }
      
      // 4.2 Réinitialiser tous les filtres via FilterModule
      if (window.FilterModule && window.FilterModule.resetAll) {
        window.FilterModule.resetAll();
      }
      
      // 5. Gestion des couches de la carte
      // 5.1 Récupérer la liste des couches par défaut
      const defaultLayers = window.defaultLayers || [];
      console.log('Couches par défaut configurées:', defaultLayers);
      console.log('Couches disponibles dans MapModule.layers:', Object.keys(MapModule.layers));
      
      // 5.2 Retirer toutes les couches actuellement visibles de la carte
      Object.keys(MapModule.layers).forEach(layerName => {
        const layer = MapModule.layers[layerName];
        if (MapModule.map.hasLayer(layer)) {
          console.log(`Retrait de la couche: ${layerName}`);
          MapModule.map.removeLayer(layer);
        }
      });
      
      // 5.3 Charger et afficher les couches par défaut
      defaultLayers.forEach(layerName => {
        try {
          // Si la couche n'est pas déjà chargée, on la charge via DataModule
          if (!MapModule.layers[layerName]) {
            console.log(`Chargement de la couche: ${layerName}`);
            if (window.DataModule && window.DataModule.loadLayer) {
              window.DataModule.loadLayer(layerName);
            } else {
              console.error('Impossible de charger la couche: DataModule.loadLayer non disponible');
              return;
            }
          }
          
          // Ajouter la couche à la carte si elle n'y est pas déjà
          const layer = MapModule.layers[layerName];
          if (layer && !MapModule.map.hasLayer(layer)) {
            console.log(`Ajout de la couche: ${layerName}`);
            MapModule.map.addLayer(layer);
            
            // Mettre à jour visuellement l'état actif du filtre correspondant
            const filterItem = document.querySelector(`.filter-item[data-layer="${layerName}"]`);
            if (filterItem) {
              filterItem.classList.add('active-filter');
            }
          }
        } catch (error) {
          console.error(`Erreur lors du chargement de la couche ${layerName}:`, error);
        }
      });
      
      console.log('=== FIN GESTIONNAIRE DE FERMETURE ===');
      
      // 6. Ne pas modifier le zoom/centrage actuel pour éviter le dézoom total
      
      // 7. Nettoyer les sélections visuelles
      document.querySelectorAll('.selected').forEach(el => {
        el.classList.remove('selected');
      });
      
      // 8. Mettre à jour l'interface utilisateur pour refléter l'état actuel
      if (window.UIModule && window.UIModule.updateLayerControls) {
        window.UIModule.updateLayerControls();
      }
    };

    // Toggle collapse control
    const toggleBtn = document.getElementById('detail-toggle-btn');
    if (window.innerWidth < 1024 && toggleBtn) {
      toggleBtn.style.display = 'inline-block';
      toggleBtn.addEventListener('click', () => {
        if (panel.style.maxHeight) {
          panel.style.removeProperty('max-height');
          panel.style.removeProperty('overflow');
          toggleBtn.querySelector('i').classList.replace('fa-chevron-up', 'fa-chevron-down');
        } else {
          // console.log(panel);
          panel.style.setProperty('max-height', '10vh', 'important');
          panel.style.setProperty('overflow', 'hidden', 'important');
          toggleBtn.querySelector('i').classList.replace('fa-chevron-down', 'fa-chevron-up');
        }
      });
    }

    // Configuration du bouton retour pour utiliser la fonction de réinitialisation
    const backButton = document.getElementById('detail-back-btn');
    if (backButton) {
      backButton.onclick = () => NavigationModule.resetToDefaultView(category);
    }
  }catch(e){
    console.error('Erreur markdown:',e);
    panel.innerHTML=`<h3>${projectName}</h3><p>Aucun détail disponible.</p>`;
  }

  // Résoudre et appliquer le filtrage pour la couche cible (tolérant)
  await resolveAndApplyLayerFiltering(projectName, category);

  /*
   * Fonction pour animer les pointillés
   * @param {Object} layer - La couche à animer
   */
  function animateDashLine(layer) {
    let dashOffset = 0;
    const animateInterval = setInterval(() => {
      if (typeof layer.setStyle === 'function') {
        layer.setStyle({
          color: 'red',
          dashArray: '10, 10',
          dashOffset: dashOffset,
          weight: 5
        });
      }
      dashOffset = (dashOffset + 1) % 20;
    }, 100);
    return animateInterval;
  }

  // ————————————————————————————————————————————————
  // Résolution robuste de la couche + filtrage tolérant
  // ————————————————————————————————————————————————
  function normLoose(s) { return normalizeString(s).replace(/\s+/g, ''); }

  function getProjectFilterConfig(projectName) {
    try {
      if (!window.projectFilterMapping || typeof window.projectFilterMapping !== 'object') return null;
      const target = normLoose(projectName);
      // 1) Essai direct (clé exacte)
      if (window.projectFilterMapping[projectName]) return window.projectFilterMapping[projectName];
      // 2) Correspondance tolérante sur les clés
      const matchKey = Object.keys(window.projectFilterMapping).find(k => normLoose(k) === target);
      return matchKey ? window.projectFilterMapping[matchKey] : null;
    } catch (e) {
      console.warn('[NavigationModule] getProjectFilterConfig error:', e);
      return null;
    }
  }

  function findMatchingPropertyKey(props, desiredKey) {
    if (!props || typeof props !== 'object' || !desiredKey) return null;
    const want = normLoose(desiredKey);
    // match en ignorant casse/accents/espaces
    return Object.keys(props).find(k => normLoose(k) === want) || (Object.prototype.hasOwnProperty.call(props, desiredKey) ? desiredKey : null);
  }

  async function resolveAndApplyLayerFiltering(projectName, category) {
    const effectiveCat = (category === 'transport') ? 'mobilite' : category;
    const projLoose = normLoose(projectName);
    let config = getProjectFilterConfig(projectName);

    // Déterminer la couche cible
    let layerName = config?.layer
      || (effectiveCat === 'urbanisme' ? 'urbanisme'
      : (effectiveCat === 'velo' ? 'voielyonnaise'
      : (effectiveCat === 'mobilite' ? 'reseauProjeteSitePropre' : null)));

    if (!layerName) {
      console.warn('[NavigationModule] Aucune couche cible déduite pour', { projectName, category });
      return;
    }

    // Assigner pour consommation ultérieure (ex: fermeture, reset)
    projectDetailPanel.dataset.filterLayer = layerName;

    // S'assurer que la couche est chargée
    if (!window.DataModule?.layerData?.[layerName]) {
      try {
        await window.DataModule.loadLayer(layerName);
      } catch (e) {
        console.error('[NavigationModule] Échec du chargement de la couche', layerName, e);
        return;
      }
    }

    const data = window.DataModule.layerData[layerName];
    const features = (data && data.features) ? data.features : [];
    if (!features.length) {
      console.warn('[NavigationModule] Aucune feature dans la couche', layerName);
      return;
    }

    // Déterminer clé/valeur exactes pour le filtrage simple de DataModule
    let actualKey = null;
    let actualVal = null;

    // 1) Si on dispose d'une config (clé/valeur), essayer de retrouver la clé réelle et une valeur existante
    if (config?.key && config?.value != null) {
      for (const f of features) {
        const props = f && f.properties ? f.properties : {};
        const k = findMatchingPropertyKey(props, config.key);
        if (!k) continue;
        const v = props[k];
        if (v == null) continue;
        if (normLoose(String(v)) === normLoose(String(config.value))) {
          actualKey = k;
          actualVal = v; // utiliser la valeur exacte trouvée dans les données
          break;
        }
      }
    }

    // 2) Urbanisme: matcher sur name/nom ≈ projectName
    if ((!actualKey || actualVal == null) && layerName === 'urbanisme') {
      const nameKeys = ['name', 'nom', 'Name', 'NOM'];
      for (const f of features) {
        const props = f && f.properties ? f.properties : {};
        for (const candidate of nameKeys) {
          const k = findMatchingPropertyKey(props, candidate);
          if (!k) continue;
          const v = props[k];
          if (v != null && normLoose(String(v)) === projLoose) {
            actualKey = k;
            actualVal = v;
            break;
          }
        }
        if (actualKey) break;
      }
    }

    // 3) Vélo: tenter d'extraire le numéro de ligne, sinon fallback sur name/nom
    if ((!actualKey || actualVal == null) && layerName === 'voielyonnaise') {
      const m = String(projectName).match(/(\d+)/);
      if (m) {
        const targetLine = m[1];
        for (const f of features) {
          const props = f && f.properties ? f.properties : {};
          const k = findMatchingPropertyKey(props, 'line');
          if (!k) continue;
          const v = props[k];
          if (v != null && normLoose(String(v)) === normLoose(String(targetLine))) {
            actualKey = k;
            actualVal = v;
            break;
          }
        }
      }
      if (!actualKey) {
        // fallback sur name/nom
        const nameKeys = ['name', 'nom'];
        for (const f of features) {
          const props = f && f.properties ? f.properties : {};
          for (const candidate of nameKeys) {
            const k = findMatchingPropertyKey(props, candidate);
            if (!k) continue;
            const v = props[k];
            if (v != null && normLoose(String(v)) === projLoose) {
              actualKey = k;
              actualVal = v;
              break;
            }
          }
          if (actualKey) break;
        }
      }
    }

    // 4) Autres couches (mobilité): tenter name/nom/libellé
    if ((!actualKey || actualVal == null) && (layerName !== 'voielyonnaise' && layerName !== 'urbanisme')) {
      const nameKeys = ['name', 'nom', 'libelle', 'libellé', 'Libelle', 'Libellé'];
      for (const f of features) {
        const props = f && f.properties ? f.properties : {};
        for (const candidate of nameKeys) {
          const k = findMatchingPropertyKey(props, candidate);
          if (!k) continue;
          const v = props[k];
          if (v != null && normLoose(String(v)) === projLoose) {
            actualKey = k;
            actualVal = v;
            break;
          }
        }
        if (actualKey) break;
      }
    }

    if (actualKey && actualVal != null) {
      console.log('[NavigationModule] Filtrage appliqué (clé/val trouvées):', { layerName, actualKey, actualVal });
      if (window.UIModule?.applyFilter) {
        window.UIModule.applyFilter(layerName, { [actualKey]: actualVal });
        window.UIModule.updateActiveFilterTagsForLayer?.(layerName);
      }
      const layer = window.MapModule?.layers?.[layerName];
      if (layer && typeof layer.getBounds === 'function') {
        const b = layer.getBounds();
        if (b.isValid()) {
          window.MapModule.map.fitBounds(b, { padding: [100, 100] });
          setTimeout(() => { if (window.MapModule.map.getZoom() > 15) window.MapModule.map.setZoom(15); }, 300);
        }
      }
      // Ne laisser visible que la couche cible
      Object.keys(window.MapModule.layers).forEach(l => { if (l !== layerName) window.MapModule.removeLayer(l); });
    } else {
      console.warn('[NavigationModule] Impossible de déterminer une clé/valeur de filtrage pour', { projectName, layerName, category });
    }
  }

  // Fonction pour filtrer et styliser les paths
  function highlightProjectPaths(projectName) {
    const normalizedProjectName = normalizeString(projectName);
    console.log("Nom du projet normalisé:", normalizedProjectName);

    // Liste des couches à vérifier
    const layersToCheck = ['voielyonnaise', 'reseauProjeteSitePropre', 'urbanisme'];

    layersToCheck.forEach(layerName => {
      const geojsonLayer = MapModule.layers[layerName];
      
      if (!geojsonLayer) {
        console.warn(`Couche ${layerName} non trouvée`);
        return;
      }

      console.log(`Recherche dans la couche ${layerName}`);



      // Parcourir chaque feature de la couche
      geojsonLayer.eachLayer(featureLayer => {
        const featureName = normalizeString(
          featureLayer.feature.properties.line || 
          featureLayer.feature.properties.name || 
          ''
        );

        console.log(`Comparaison: ${featureName} === ${normalizedProjectName}`);

        if (featureName === normalizedProjectName) {
          console.log("Path correspondant trouvé !");
        }
      });
    });
  }
  
  // Appeler la fonction de mise en évidence (debug visuel non bloquant)
  try { highlightProjectPaths(projectName); } catch(_) {}

  // Afficher le panneau de détail
  projectDetailPanel.classList.add('visible');

}






  // ————————————————————————————————————————————————
  // Helpers partagés pour les sous-menus (en-tête, fermeture, clic projet)
  // ————————————————————————————————————————————————
  function setupSubmenu(containerId, { title, closeBtnId, navId, submenuId, listId, removeAllActiveTabs = false }) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    container.innerHTML = `
      <div class="detail-header-submenu">
        <h2>${title}</h2>
        <button id="${closeBtnId}" class="close-btn" aria-label="Fermer">✖</button>
      </div>
      <div id="${listId}" class="project-list"></div>
    `;
    const closeBtn = container.querySelector(`#${closeBtnId}`);
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (removeAllActiveTabs) {
          document.querySelectorAll('.nav-category').forEach(tab => tab.classList.remove('active'));
        } else {
          const activeTab = document.querySelector('.nav-category.active');
          if (activeTab && activeTab.id === navId) {
            activeTab.classList.remove('active');
          }
        }
        const submenu = document.getElementById(submenuId);
        if (submenu) submenu.style.display = 'none';
        resetToDefaultView();
      });
    }
    return document.getElementById(listId);
  }

  function createAndAppendHeader(containerEl, { title, closeBtnId, navId, submenuId, removeAllActiveTabs = false }) {
    if (!containerEl) return null;
    const header = document.createElement('div');
    header.className = 'detail-header-submenu project-header-container';
    header.innerHTML = `
      <h2>${title}</h2>
      <button id="${closeBtnId}" class="close-btn" aria-label="Fermer">✖</button>
    `;
    containerEl.appendChild(header);
    const closeBtn = header.querySelector(`#${closeBtnId}`);
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (removeAllActiveTabs) {
          document.querySelectorAll('.nav-category').forEach(tab => tab.classList.remove('active'));
        } else {
          const activeTab = document.querySelector('.nav-category.active');
          if (activeTab && activeTab.id === navId) {
            activeTab.classList.remove('active');
          }
        }
        const submenu = document.getElementById(submenuId);
        if (submenu) submenu.style.display = 'none';
        resetToDefaultView();
      });
    }
    return header;
  }

  function createProjectClickHandler(p, category, submenuId, applyLegacyMapping = true) {
    return () => {
      const submenu = document.getElementById(submenuId);
      if (submenu) submenu.style.display = 'none';
      if (applyLegacyMapping && window.projectFilterMapping && window.projectFilterMapping[p.name]) {
        const config = window.projectFilterMapping[p.name];
        projectDetailPanel.dataset.filterLayer = config.layer;
      }
      showProjectDetail(p.name, category);
      if (applyLegacyMapping && window.projectFilterMapping && window.projectFilterMapping[p.name]) {
        const config = window.projectFilterMapping[p.name];
        const applyConfig = () => {
          UIModule.applyFilter(config.layer, { [config.key]: config.value });
          UIModule.updateActiveFilterTagsForLayer(config.layer);
          const layer = MapModule.layers[config.layer];
          if (layer && typeof layer.getBounds === "function") {
            const bounds = layer.getBounds();
            if (bounds.isValid()) {
              MapModule.map.fitBounds(bounds, { padding: [100, 100] });
              setTimeout(() => {
                if (MapModule.map.getZoom() > 15) {
                  MapModule.map.setZoom(15);
                }
              }, 300);
            }
          }
        };
        if (!DataModule.layerData[config.layer]) {
          DataModule.loadLayer(config.layer).then(applyConfig);
        } else {
          applyConfig();
        }
      }
    };
  }


  const renderTransportProjects = () => {
    const listEl = setupSubmenu('transport-submenu', {
      title: 'Projets de Transport',
      closeBtnId: 'transport-close-btn',
      navId: 'nav-transport',
      submenuId: 'transport-submenu',
      listId: 'transport-project-list'
    });
    if (!listEl) return;
    // Combiner les projets de tram et de bus
    const projects = [...window.mobilityData.tram, ...window.mobilityData.bus];
    projects.forEach(p => {
      const li = createProjectItem(p, createProjectClickHandler(p, 'transport', 'transport-submenu', true), 'transport');
      listEl.appendChild(li);
    });
  };

  const renderVeloProjects = () => {
    const listEl = setupSubmenu('velo-submenu', {
      title: 'Projets Vélo',
      closeBtnId: 'velo-close-btn',
      navId: 'nav-velo',
      submenuId: 'velo-submenu',
      listId: 'velo-project-list'
    });
    if (!listEl) return;
    const projects = window.mobilityData.velo;
    projects.forEach(p => {
      const li = createProjectItem(p, createProjectClickHandler(p, 'velo', 'velo-submenu', true), 'velo');
      listEl.appendChild(li);
    });
  };


  // Affichage des onglets pour Urbanisme
  const renderUrbanismeTabs = () => {
    if (!window.urbanismeProjects) {
      console.error("urbanismeProjects is undefined");
      return;
    }
    const container = document.getElementById('urbanisme-tabs');
    container.innerHTML = '';
    
    // Ajout de l'en-tête avec le bouton de fermeture (via helper)
    createAndAppendHeader(container, {
      title: "Projets d'Urbanisme",
      closeBtnId: 'urbanisme-close-btn',
      navId: 'nav-urbanisme',
      submenuId: 'urbanisme-submenu',
      removeAllActiveTabs: true
    });
    
    // Contenu du sélecteur de ville
    const select = document.createElement('select');
    select.id = 'urbanisme-select';
    select.className = 'submenu-select';
    const villes = ["Tout", ...Array.from(new Set(window.urbanismeProjects.map(p => p.city))).sort()];
    villes.forEach(ville => {
      const option = document.createElement('option');
      option.value = ville.toLowerCase();
      option.textContent = ville;
      select.appendChild(option);
    });
    select.addEventListener('change', (e) => {
      renderUrbanismeProjects(e.target.value);
    });
    container.appendChild(select);
    renderUrbanismeProjects(select.value);
  };

  // Affichage des projets d'Urbanisme
  const renderUrbanismeProjects = (tabName = 'tout') => {
    if (!window.urbanismeProjects) {
      console.error("urbanismeProjects is undefined");
      return;
    }
    const listEl = document.getElementById('urbanisme-project-list');
    listEl.innerHTML = '';
    const projects = tabName === 'tout'
      ? window.urbanismeProjects
      : window.urbanismeProjects.filter(p => p.city.toLowerCase() === tabName);
    projects.forEach(p => {
      const li = createProjectItem(p, () => {
        document.getElementById('urbanisme-submenu').style.display = 'none';
        // Laisser showProjectDetail résoudre la couche et appliquer le filtrage de manière robuste
        showProjectDetail(p.name, "urbanisme");
      }, 'urbanisme');
      listEl.appendChild(li);
    });
  };

  // --- Helpers: slugify and cover fetching from Markdown ---
  const slugify = (str) => String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  function getMarkdownPathByCategory(name, category) {
    if (!name) return null;
    const slug = slugify(name);
    if (category === 'urbanisme') return `pages/urbanisme/${slug}.md`;
    if (category === 'transport' || category === 'mobilite') return `pages/mobilite/${slug}.md`;
    if (category === 'velo') {
      // Try to match files like pages/velo/ligne-1.md by extracting the first number
      const m = String(name).match(/(\d+)/);
      if (m) {
        return `pages/velo/ligne-${m[1]}.md`;
      }
      return `pages/velo/${slug}.md`;
    }
    return null;
  }

  function extractCoverFromMarkdown(md) {
    try {
      const fm = md.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
      if (!fm) return null;
      const yml = fm[1];
      let cover = null;
      yml.split(/\r?\n/).forEach(line => {
        const m = line.match(/^(\w+)\s*:\s*(.*)$/);
        if (m && m[1] === 'cover') {
          let v = String(m[2] || '').trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          cover = v;
        }
      });
      return cover || null;
    } catch (_) { return null; }
  }

  const coverCache = new Map(); // key: `${category}|${name}` -> url|null
  async function fetchCoverForProject(name, category) {
    const key = `${category}|${name}`;
    if (coverCache.has(key)) return coverCache.get(key);
    const mdPath = getMarkdownPathByCategory(name, category);
    if (!mdPath) { coverCache.set(key, null); return null; }
    try {
      const res = await fetch(mdPath, { cache: 'force-cache' });
      if (!res.ok) { coverCache.set(key, null); return null; }
      const txt = await res.text();
      const cover = extractCoverFromMarkdown(txt);
      coverCache.set(key, cover || null);
      return cover || null;
    } catch (_) {
      coverCache.set(key, null);
      return null;
    }
  }

  function attachCoverThumbnail(li, projectName, category) {
    const thumb = li.querySelector('.project-thumb');
    if (!thumb) return;
    // If an img already exists with a src, skip
    const existingImg = thumb.querySelector('img.project-thumb__img');
    if (existingImg && existingImg.getAttribute('src')) return;
    fetchCoverForProject(projectName, category).then(url => {
      if (!url) return;
      let img = existingImg;
      if (!img) {
        img = document.createElement('img');
        img.className = 'project-thumb__img';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        thumb.appendChild(img);
      }
      img.onload = () => {
        // Measure computed height and set CSS var on the li to reserve space
        updateThumbHeight(li);
      };
      img.src = url;

      // Setup resize observer once to keep height in sync on responsive changes
      if (!li._thumbRO && typeof ResizeObserver !== 'undefined') {
        li._thumbRO = new ResizeObserver(() => updateThumbHeight(li));
        li._thumbRO.observe(thumb);
      }
    });
  }

  function updateThumbHeight(li) {
    const thumb = li.querySelector('.project-thumb');
    if (!thumb) return;
    const img = thumb.querySelector('img.project-thumb__img');
    const h = img ? img.getBoundingClientRect().height : thumb.getBoundingClientRect().height;
    const cap = 300;
    const clamped = Math.min(h, cap);
    if (clamped > 0) {
      li.style.setProperty('--thumb-height', `${clamped}px`);
    }
  }

  // Delayed hover logic: show cover after 1s hover, hide on leave
  function scheduleShowCover(li, projectName, category) {
    cancelShowCover(li);
    li._coverHoverTimer = setTimeout(() => {
      if (category) {
        attachCoverThumbnail(li, projectName, category);
      }
      li.classList.add('show-thumb');
      // Next frame, ensure we measure and set the height var
      requestAnimationFrame(() => updateThumbHeight(li));
    }, 1000);
  }

  function cancelShowCover(li) {
    if (li._coverHoverTimer) {
      clearTimeout(li._coverHoverTimer);
      li._coverHoverTimer = null;
    }
    li.classList.remove('show-thumb');
  }

  // Delayed progress bar: appear after 0.3s, fill until 1s total
  function scheduleProgress(li) {
    cancelProgress(li);
    li._progressTimer = setTimeout(() => {
      li.classList.add('progress-visible');
      const bar = li.querySelector('.hover-progress__bar');
      if (!bar) return;
      // Reset transition and width to ensure replay
      bar.style.transition = 'none';
      bar.style.width = '0%';
      // Force reflow then animate to 100% over 700ms (1s total - 300ms delay)
      // eslint-disable-next-line no-unused-expressions
      bar.offsetHeight;
      bar.style.transition = 'width 700ms linear';
      bar.style.width = '100%';
    }, 300);
  }

  function cancelProgress(li) {
    if (li._progressTimer) {
      clearTimeout(li._progressTimer);
      li._progressTimer = null;
    }
    const bar = li.querySelector('.hover-progress__bar');
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
    }
    li.classList.remove('progress-visible');
  }

  // Fonction de création d'un item de liste pour un projet
  const createProjectItem = (p, onClick, category = null) => {
    let iconClass = "";
    if (p.year) { // Projet de mobilité
      if (window.mobilityData.tram && window.mobilityData.tram.find(item => item.name === p.name)) {
        iconClass = "fas fa-train-tram";
      } else if (window.mobilityData.bus && window.mobilityData.bus.find(item => item.name === p.name)) {
        iconClass = "fas fa-bus";
      } else if (window.mobilityData.velo && window.mobilityData.velo.find(item => item.name === p.name)) {
        iconClass = "fas fa-bicycle";
      } else {
        iconClass = "fas fa-map";
      }
    } else { // Projet urbain
      iconClass = "fas fa-city";
    }
    
    // Determine CSS class for project color swatch; CSS variables will provide colors
    let pcClass = 'pc-default';
    if (iconClass === "fas fa-train-tram") {
      pcClass = 'pc-tram';
    } else if (iconClass === "fas fa-bus") {
      pcClass = 'pc-bus';
    } else if (iconClass === "fas fa-bicycle") {
      pcClass = 'pc-velo';
    } else if (iconClass === "fas fa-city") {
      pcClass = 'pc-urbanisme';
    } else {
      pcClass = 'pc-default';
    }
    
    const li = document.createElement('li');
    li.classList.add('project-item');
    li.dataset.project = p.name;
    
    li.innerHTML = `
      <div class="project-color ${pcClass}">
        <i class="${iconClass}"></i>
      </div>
      <div class="project-info">
        <div class="project-name">${p.name}</div>
        ${p.year ? `<div class="project-year">${p.year}</div>` : ''}
      </div>
      <div class="project-thumb" role="presentation"></div>
      <div class="project-arrow"><i class="fas fa-chevron-right"></i></div>
      <div class="hover-progress" aria-hidden="true"><div class="hover-progress__bar"></div></div>
    `;

    
    li.addEventListener('click', onClick);
    // Show cover only after 1s hover, hide when leaving
    if (category) {
      li.addEventListener('mouseenter', () => { 
        scheduleProgress(li);
        scheduleShowCover(li, p.name, category);
      });
      li.addEventListener('mouseleave', () => { 
        cancelProgress(li);
        cancelShowCover(li);
      });
    }
    
    return li;
  };

  // Affichage des projets Travaux
  const renderTravauxProjects = () => {
    const submenu = document.getElementById('travaux-submenu');
    submenu.innerHTML = `
      <div class="detail-header-submenu">
        <h2>Chantiers en cours</h2>
        <div>
        <button id="travaux-toggle-btn" style="display:none; color:grey; background:none; border:none; cursor:pointer; margin-right:1rem;"><i class="fas fa-chevron-down"></i></button>
        <button id="travaux-close-btn" class="close-btn" aria-label="Fermer">✖</button>
        </div>
      </div>
      <div id="travaux-project-list" class="project-list"></div>
    `;
    
    const listEl = document.getElementById('travaux-project-list');
    
    // Gestionnaire d'événement pour le bouton de bascule
    const travauxToggleBtn = document.getElementById('travaux-toggle-btn');
    const travauxPanel = document.querySelector('#travaux-submenu');
    
    if (window.innerWidth < 1024 && travauxToggleBtn && travauxPanel) {
      travauxToggleBtn.style.display = 'inline-block';
      travauxToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (travauxPanel.style.maxHeight) {
          travauxPanel.style.removeProperty('max-height');
          travauxPanel.style.removeProperty('overflow');
          travauxToggleBtn.querySelector('i').classList.replace('fa-chevron-up', 'fa-chevron-down');
        } else {
          travauxPanel.style.setProperty('max-height', '10vh', 'important');
          travauxPanel.style.setProperty('overflow', 'hidden', 'important');
          travauxToggleBtn.querySelector('i').classList.replace('fa-chevron-down', 'fa-chevron-up');
        }
      });
    }

    // Gestionnaire d'événement pour le bouton de fermeture
    document.getElementById('travaux-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      // Désactiver l'onglet travaux actif
      const activeTab = document.querySelector('.nav-category.active');
      if (activeTab && activeTab.id === 'nav-travaux') {
        activeTab.classList.remove('active');
      }
      // Masquer explicitement le sous-menu travaux
      const travauxSubmenu = document.getElementById('travaux-submenu');
      if (travauxSubmenu) {
        travauxSubmenu.style.display = 'none';
      }
      // Réinitialiser la vue sans spécifier de catégorie
      resetToDefaultView();
    });
    
    listEl.innerHTML = '';
    // Nettoyer les anciens filtres
    const oldFilterUX = document.getElementById('travaux-filters-ux');
    if (oldFilterUX) oldFilterUX.remove();
    const oldFilterContainer = document.getElementById('travaux-filters-container');
    if (oldFilterContainer) oldFilterContainer.remove();

    const travauxData = DataModule.layerData && DataModule.layerData['travaux'];
    if (!travauxData || !travauxData.features || travauxData.features.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Aucun chantier travaux à afficher.';
      listEl.appendChild(li);
      return;
    }

    // --- Génération des valeurs uniques pour chaque filtre ---
    const features = travauxData.features;
    const getUniques = key => [...new Set(features.map(f => f.properties[key]).filter(Boolean))].sort();
    // Calcul du tri par nombre d'occurrences décroissant puis alphabétique
    const natureCounts = {};
    features.forEach(f => {
      const n = f.properties.nature_travaux;
      if (n) natureCounts[n] = (natureCounts[n] || 0) + 1;
    });
    const natures = Object.keys(natureCounts)
      .sort((a, b) => {
        if (natureCounts[b] !== natureCounts[a]) {
          return natureCounts[b] - natureCounts[a];
        }
        return a.localeCompare(b, 'fr');
      });
    // Calcul du tri par nombre d'occurrences décroissant puis alphabétique pour nature_chantier
    const natureChantierCounts = {};
    features.forEach(f => {
      const nc = f.properties.nature_chantier;
      if (nc) natureChantierCounts[nc] = (natureChantierCounts[nc] || 0) + 1;
    });
    const natureChantiers = Object.keys(natureChantierCounts)
      .sort((a, b) => {
        if (natureChantierCounts[b] !== natureChantierCounts[a]) {
          return natureChantierCounts[b] - natureChantierCounts[a];
        }
        return a.localeCompare(b, 'fr');
      });
    // Calcul du tri par nombre d'occurrences décroissant puis alphabétique pour commune
    const communeCounts = {};
    features.forEach(f => {
      const c = f.properties.commune;
      if (c) communeCounts[c] = (communeCounts[c] || 0) + 1;
    });
    const communes = Object.keys(communeCounts)
      .sort((a, b) => {
        if (communeCounts[b] !== communeCounts[a]) {
          return communeCounts[b] - communeCounts[a];
        }
        return a.localeCompare(b, 'fr');
      });
    const etats = getUniques('etat');
    // Dates
    const dateDebuts = features.map(f => f.properties.date_debut).filter(Boolean).sort();
    const dateFins = features.map(f => f.properties.date_fin).filter(Boolean).sort();
    const majDates = features.map(f => f.properties.last_update).filter(Boolean).sort();

    // --- Refonte UX premium des filtres ---
    const filterUX = document.createElement('section');
    filterUX.id = 'travaux-filters-ux';
    filterUX.className = 'travaux-filters-ux';
    filterUX.innerHTML = `
      <div class="travaux-filters-header">
        <span class="travaux-filters-title"><i class="fa fa-filter"></i> Filtres</span>
        <span id="travaux-filters-count" class="travaux-filters-count"></span>
      </div>
      <div class="travaux-filters-badges" id="travaux-filters-badges"></div>
      <form class="travaux-filters-grid" autocomplete="off" tabindex="0">
        <div class="travaux-field">
          <label class="travaux-checkbox-label">
            <input type="checkbox" id="hide-reseaux" class="travaux-checkbox" checked>
            <span class="travaux-checkbox-custom"></span>
            Exclure les réseaux (gaz, eau, télécom, etc.)
          </label>
        </div>
        <div class="travaux-field">
          <label for="nature-travaux-select">Nature</label>
          <select id="nature-travaux-select"><option value="">Toutes</option>${natures.map(n => `<option value="${n}">${n} (${natureCounts[n]})</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="nature-chantier-select">Nature chantier</label>
          <select id="nature-chantier-select"><option value="">Toutes</option>${natureChantiers.map(n => `<option value="${n}">${n} (${natureChantierCounts[n]})</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="commune-select">Commune</label>
          <select id="commune-select"><option value="">Toutes</option>${communes.map(c => `<option value="${c}">${c} (${communeCounts[c]})</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="etat-select">Etat</label>
          <select id="etat-select"><option value="">Tous</option>${etats.map(e => `<option value="${e}">${e}</option>`).join('')}</select>
        </div>
        <div class="travaux-field">
          <label for="date-debut-input">Début après</label>
          <input id="date-debut-input" type="date" />
        </div>
        <div class="travaux-field">
          <label for="date-fin-input">Fin avant</label>
          <input id="date-fin-input" type="date" />
        </div>
        <div class="travaux-field travaux-reset">
          <button type="button" id="reset-all-filters" class="travaux-reset-btn"><i class="fa fa-times-circle"></i> Réinitialiser</button>
        </div>
      </form>
    `;
    // Remplacer l'ancien container par le nouveau
    // Supprimer tout ancien container de filtres (évite le doublon lint)
    { const old = document.getElementById('travaux-filters-container'); if (old) old.remove(); }
    // S'assurer que le panel n'est inséré qu'une seule fois
submenu.insertBefore(filterUX, listEl);

    // Récupérer les éléments pour la logique JS
    const selectNature = filterUX.querySelector('#nature-travaux-select');
    const selectNatureChantier = filterUX.querySelector('#nature-chantier-select');
    const selectCommune = filterUX.querySelector('#commune-select');
    const selectEtat = filterUX.querySelector('#etat-select');
    const inputDebut = filterUX.querySelector('#date-debut-input');
    const inputFin = filterUX.querySelector('#date-fin-input');
    const hideReseauxCheckbox = filterUX.querySelector('#hide-reseaux');
    
    // Fonction pour filtrer les options des sélecteurs
    function filterOptions(selectElement, options, counts) {
      const hideReseaux = hideReseauxCheckbox.checked;
      const reseauxKeywords = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'assainissement', 'hydraulique', 'sondage'];
      
      return options
        .filter(option => !hideReseaux || !reseauxKeywords.some(keyword => 
          option.toLowerCase().includes(keyword)
        ))
        .map(option => `<option value="${option}">${option} (${counts[option]})</option>`)
        .join('');
    }
    
    const resetBtn = filterUX.querySelector('#reset-all-filters');
    const badgesContainer = filterUX.querySelector('#travaux-filters-badges');
    const countEl = filterUX.querySelector('#travaux-filters-count');
    // (plus besoin de submenu.insertBefore(filterContainer, listEl))

    // --- UX : badges de filtres actifs ---
    function renderActiveBadges(criteria) {
      badgesContainer.innerHTML = '';
      const labels = {
        nature_travaux: 'Nature',
        nature_chantier: 'Nature Chantier',
        commune: 'Commune',
        etat: 'État',
        date_debut: 'Début >',
        date_fin: 'Fin <',
        _hideReseaux: 'Réseaux exclus'
      };
      
      Object.entries(criteria).forEach(([key, val]) => {
        if (val === undefined || val === '' || val === null) return;
        const badge = document.createElement('span');
        badge.className = 'gpv2-filter-badge';
        badge.setAttribute('tabindex', '0');
        badge.setAttribute('role', 'button');
        
        // Pour le filtre _hideReseaux, on affiche toujours 'Exclure les réseaux'
        const displayText = key === '_hideReseaux' ? 'Exclure les réseaux' : (labels[key] || key);
        badge.setAttribute('aria-label', `Retirer filtre ${displayText}`);
        badge.innerHTML = `<i class='fa fa-times'></i> <strong>${displayText}</strong>`;
        badge.addEventListener('click', () => {
          // Retirer le filtre correspondant
          switch (key) {
            case '_hideReseaux':
              hideReseauxCheckbox.checked = false;
              break;
            case 'nature_travaux': 
              selectNature.value = ''; 
              break;
            case 'nature_chantier': 
              selectNatureChantier.value = ''; 
              break;
            case 'commune': 
              selectCommune.value = ''; 
              break;
            case 'etat': 
              selectEtat.value = ''; 
              break;
            case 'date_debut': 
              inputDebut.value = ''; 
              break;
            case 'date_fin': 
              inputFin.value = ''; 
              break;
          }
          applyFiltersAndSync();
        });
        badge.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') badge.click();
        });
        badgesContainer.appendChild(badge);
      });
      badgesContainer.style.display = Object.keys(criteria).length > 0 ? 'flex' : 'none';
    }

    // Fonction utilitaire pour vérifier si un texte contient des mots-clés de réseaux
    function isReseau(text) {
      if (!text) return false;
      const reseauxKeywords = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'electricite', 'assainissement'];
      return reseauxKeywords.some(keyword => 
        String(text).toLowerCase().includes(keyword.toLowerCase())
      );
    }

    // --- Fonction de synchronisation filtre panel <-> carte ---
    function applyFiltersAndSync() {
      // 1. Récupérer les critères depuis les inputs du panel
      // Construire dynamiquement les critères (ne garder que les champs renseignés)
      const criteria = {};
      if (selectNature.value) criteria.nature_travaux = selectNature.value;
      if (selectNatureChantier.value) criteria.nature_chantier = selectNatureChantier.value;
      if (selectCommune.value) criteria.commune = selectCommune.value;
      if (selectEtat.value) criteria.etat = selectEtat.value;
      if (inputDebut.value) criteria.date_debut = inputDebut.value;
      if (inputFin.value) criteria.date_fin = inputFin.value;
      
      // 2. Appliquer le filtre à la carte (Leaflet)
      // On ajoute le filtre des réseaux aux critères si la case est cochée
      const hideReseaux = hideReseauxCheckbox.checked;
      if (hideReseaux) {
        criteria._hideReseaux = true; // Marqueur spécial pour le filtre personnalisé
      }
      
      UIModule.applyFilter('travaux', criteria);

      // 3. Récupérer les features filtrées (après application du filtre)
      let filtered = [];
      const travauxLayer = MapModule.layers && MapModule.layers['travaux'];
      if (travauxLayer && typeof travauxLayer.eachLayer === 'function') {
        travauxLayer.eachLayer(layer => {
          if (layer.feature) filtered.push(layer.feature);
        });
      }
      if (filtered.length === 0 && DataModule.layerData && DataModule.layerData['travaux']) {
        filtered = DataModule.layerData['travaux'].features || [];
      }
      
      // 4. Si le filtre des réseaux est actif, filtrer les résultats
      if (hideReseaux) {
        filtered = filtered.filter(feature => {
          const props = feature.properties || {};
          return !isReseau(props.nature_travaux) && !isReseau(props.nature_chantier);
        });
      }

      // Affichage dynamique des badges de filtres actifs
      renderActiveBadges(criteria);
      // Compteur de résultats filtrés (features sur la carte)
      countEl.textContent = `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`;
      countEl.style.display = 'inline-block';
      // Accessibilité : aria-live pour le compteur
      countEl.setAttribute('aria-live', 'polite');

      // Affichage conditionnelle du bouton Réinitialiser
      const hasActiveFilter = !!(selectNature.value || selectNatureChantier.value || selectCommune.value || selectEtat.value || inputDebut.value || inputFin.value);
      resetBtn.style.display = hasActiveFilter ? '' : 'none';

      // Désormais, on ne remplit plus la liste : on n'affiche que les filtres
      listEl.innerHTML = '';
      // Aucun affichage de travaux, ni message "aucun travaux".
      // Le panel ne contient que les contrôles de filtre.
    }

    // Mise à jour des filtres et des options
    function updateFilterOptions() {
      // Mise à jour des options des sélecteurs
      selectNature.innerHTML = '<option value="">Toutes</option>' + 
        filterOptions(selectNature, natures, natureCounts);
      
      selectNatureChantier.innerHTML = '<option value="">Toutes</option>' + 
        filterOptions(selectNatureChantier, natureChantiers, natureChantierCounts);
      
      // Conserver la sélection actuelle si elle existe toujours
      if (selectNature.value) {
        const option = selectNature.querySelector(`option[value="${selectNature.value}"]`);
        if (!option) selectNature.value = '';
      }
      
      if (selectNatureChantier.value) {
        const option = selectNatureChantier.querySelector(`option[value="${selectNatureChantier.value}"]`);
        if (!option) selectNatureChantier.value = '';
      }
    }
    
    // Écouteurs d'événements pour les filtres
    [selectNature, selectNatureChantier, selectCommune, selectEtat, inputDebut, inputFin].forEach(el => {
      el.addEventListener('change', applyFiltersAndSync);
    });
    
    // Écouteur pour la case à cocher "Exclure les réseaux"
    hideReseauxCheckbox.addEventListener('change', () => {
      updateFilterOptions();
      applyFiltersAndSync();
    });
    resetBtn.addEventListener('click', () => {
      selectNature.value = '';
      selectNatureChantier.value = '';
      selectCommune.value = '';
      selectEtat.value = '';
      inputDebut.value = '';
      inputFin.value = '';
      applyFiltersAndSync();
    });

    // Affichage initial
    updateFilterOptions();
    applyFiltersAndSync();
  };

  /**
   * Réinitialise la vue à l'état par défaut de l'application
   * - Si une catégorie est fournie, affiche uniquement le sous-menu correspondant
   * - Sinon, affiche uniquement les couches par défaut
   * - Masque tous les panneaux et sous-menus non concernés
   * - Réinitialise la vue de la carte
   * @param {string} [category] - Catégorie à afficher (optionnel)
   */
  const resetToDefaultView = (category) => {
    console.log('Réinitialisation de la vue à l\'état par défaut');
    
    // 1. Masquer le panneau de détail
    const projectDetail = document.getElementById('project-detail');
    if (projectDetail) {
      projectDetail.style.display = 'none';
    }
    
    // Si une catégorie est spécifiée, afficher uniquement le sous-menu correspondant
    if (category) {
      // Définir les couches à afficher en fonction de la catégorie
      const layersToDisplay = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS[category]) || [];
      
      // Masquer tous les sous-menus d'abord
      document.querySelectorAll('.submenu').forEach(menu => {
        menu.style.display = 'none';
      });
      
      // Afficher le sous-menu de la catégorie spécifiée
      const submenu = document.getElementById(`${category}-submenu`);
      if (submenu) {
        submenu.style.display = 'block';
        
        // Mettre à jour l'onglet actif
        document.querySelectorAll('.nav-category').forEach(tab => {
          if (tab.id === `nav-${category}`) {
            tab.classList.add('active');
          } else {
            tab.classList.remove('active');
          }
        });
        
        // 1. D'abord, réinitialiser tous les filtres
        FilterModule.resetAll();

        // 1.bis Nettoyer l'UI des filtres pour ces couches (tags + état visuel)
        try {
          layersToDisplay.forEach(layerName => {
            // Enlever l'état visuel actif du bouton de filtre
            const filterItem = document.querySelector(`.filter-item[data-layer="${layerName}"]`);
            if (filterItem) filterItem.classList.remove('active-filter');
            // Effacer les tags de filtres actifs
            if (window.UIModule?.resetLayerFilterWithoutRemoving) {
              window.UIModule.resetLayerFilterWithoutRemoving(layerName);
            }
          });
        } catch (e) { console.warn('Nettoyage UI filtres (non bloquant):', e); }

        // 2. Parcourir les couches actuellement chargées et supprimer tout pour repartir propre
        Object.keys(MapModule.layers).forEach(layerName => {
          if (!layersToDisplay.includes(layerName)) {
            // Couche hors catégorie -> retirer
            MapModule.removeLayer(layerName);
          } else {
            // Couche de la catégorie -> retirer pour forcer une recréation sans filtre
            MapModule.removeLayer(layerName);
          }
        });

        // 3. Recharger proprement les couches de la catégorie (sans filtre)
        layersToDisplay.forEach(layerName => {
          if (DataModule.layerData && DataModule.layerData[layerName]) {
            DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
          } else {
            DataModule.loadLayer(layerName);
          }
        });
        
        // 4. Rendre le contenu du sous-menu correspondant (minimal fix)
        try {
          if (category === 'velo') {
            renderVeloProjects();
          } else if (category === 'transport') {
            renderTransportProjects();
          } else if (category === 'urbanisme') {
            renderUrbanismeTabs();
          } else if (category === 'travaux') {
            renderTravauxProjects();
          }
        } catch (e) {
          console.warn('[NavigationModule] rendu sous-menu échoué (non bloquant):', e);
        }
        
        return; // Ne pas continuer avec la réinitialisation complète
      }
    }
    
    // Si on arrive ici, c'est qu'aucune catégorie valide n'a été fournie
    // ou qu'une réinitialisation complète est nécessaire
    document.querySelectorAll('.submenu').forEach(menu => {
      menu.style.display = 'none';
    });
    
    // Désactiver tous les onglets actifs
    document.querySelectorAll('.nav-category.active').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // Restaurer les couches par défaut depuis la configuration globale
    if (window.defaultLayers && window.defaultLayers.length > 0) {
      console.log('Restauration des couches par défaut:', window.defaultLayers);
      
      // Charger les couches par défaut si elles ne sont pas déjà chargées
      window.defaultLayers.forEach(layerName => {
        if (!window.MapModule.layers || !window.MapModule.layers[layerName]) {
          DataModule.loadLayer(layerName);
        }
      });
      
      // S'assurer que seules les couches par défaut sont visibles
      if (window.MapModule && window.MapModule.layers && window.MapModule.map) {
        Object.keys(window.MapModule.layers).forEach(layerName => {
          const layer = window.MapModule.layers[layerName];
          if (layer) {
            if (window.defaultLayers.includes(layerName)) {
              if (!window.MapModule.map.hasLayer(layer)) {
                window.MapModule.map.addLayer(layer);
              }
            } else {
              if (window.MapModule.map.hasLayer(layer)) {
                window.MapModule.map.removeLayer(layer);
              }
            }
          }
        });
      }
    }
    
    // Réinitialiser le zoom et la position de la carte
    if (window.NavigationModule && window.NavigationModule.zoomOutOnLoadedLayers) {
      window.NavigationModule.zoomOutOnLoadedLayers();
    }
    
    // Réinitialiser les sélections
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    
    // Mettre à jour l'interface utilisateur
    if (window.UIModule && window.UIModule.updateLayerControls) {
      window.UIModule.updateLayerControls();
    }
    
    // Réinitialiser la bordure de la navigation
    const leftNav = document.getElementById('left-nav');
    if (leftNav) {
      leftNav.style.borderRadius = '20px';
    }
  }

  // Exposer les fonctions publiques du module
  const publicAPI = { 
    showProjectDetail, 
    zoomOutOnLoadedLayers, 
    renderTransportProjects, 
    renderVeloProjects, 
    renderUrbanismeTabs, 
    renderUrbanismeProjects, 
    renderTravauxProjects,
    resetToDefaultView
  };
  
  // Exposer le module globalement
  window.NavigationModule = publicAPI;
  
  return publicAPI;
})();
