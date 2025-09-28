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

  // Comparateur naturel pour les libellés avec numéro en fin (ex: "Voie Lyonnaise 2" < "Voie Lyonnaise 10")
  function naturalCompareByName(aName, bName) {
    const a = (aName || '').toString();
    const b = (bName || '').toString();
    const rx = /(\d+)\s*$/;
    const am = a.match(rx);
    const bm = b.match(rx);
    const abase = a.replace(rx, '').trim();
    const bbase = b.replace(rx, '').trim();
    // D'abord comparer le préfixe textuel (insensible à la casse/accents)
    const baseCmp = abase.localeCompare(bbase, 'fr', { sensitivity: 'base' });
    if (baseCmp !== 0) return baseCmp;
    // Si même préfixe, comparer les numéros finaux s'ils existent tous les deux
    if (am && bm) {
      const ai = parseInt(am[1], 10);
      const bi = parseInt(bm[1], 10);
      if (ai !== bi) return ai - bi;
    }
    // Sinon, fallback sur la comparaison locale complète
    return a.localeCompare(b, 'fr', { sensitivity: 'base' });
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
   * @param {string} category - Catégorie du projet (velo, mobilite, urbanisme)
   * @param {Event} [event] - Événement de clic (optionnel)
   */
  async function showProjectDetail(projectName, category, event, enrichedProps = null) {
  console.group('=== showProjectDetail ===');
  console.log('Paramètres initiaux:', { projectName, category });
  
  // Gestion de l'événement si fourni
  if (event?.stopPropagation) {
    event.stopPropagation();
    console.log('Événement de clic arrêté');
  }
  
  // Masquer tous les sous-menus
  const submenus = ['velo', 'mobilite', 'urbanisme'];
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

  // Déterminer la catégorie effective (catégorie directe)
  const effectiveCat = (category === 'velo' ? 'velo' : category);
  console.log('Catégorie effective:', effectiveCat);

  // Afficher le panneau de chargement
  const panel = document.getElementById('project-detail');
  panel.innerHTML = '<p style="padding:1em">Chargement…</p>';
  panel.style.display = 'block';
  // Reset collapse state when opening a new project detail
  panel.style.removeProperty('max-height');
  panel.style.removeProperty('overflow');
  console.log('Panneau de chargement affiché');

  try {
    // 1️⃣ Utiliser les données enrichies si disponibles, sinon chercher dans contribution_uploads
    let contributionProject = null;
    
    if (enrichedProps) {
      // Utiliser directement les données enrichies depuis les properties de la feature
      contributionProject = {
        project_name: enrichedProps.project_name,
        category: enrichedProps.category,
        cover_url: enrichedProps.cover_url,
        description: enrichedProps.description,
        markdown_url: enrichedProps.markdown_url
      };
      console.log('Utilisation des données enrichies depuis les properties:', contributionProject);
    } else if (window.supabaseService?.fetchProjectByCategoryAndName) {
      // Recherche stricte: catégorie + nom exact
      try {
        contributionProject = await window.supabaseService.fetchProjectByCategoryAndName(effectiveCat, projectName);
        console.log('Projet trouvé (strict) dans contribution_uploads:', contributionProject);
      } catch (error) {
        console.warn('Erreur lors de la recherche stricte dans contribution_uploads:', error);
      }
    }

    //A partir de là contributionProject est toujours définit on utilise que ca

    projectName = contributionProject.project_name;
    category = contributionProject.category;
    cover_url = contributionProject.cover_url;
    let description = contributionProject.description;
    let markdown_url = contributionProject.markdown_url;

    let markdown = null;
    let usedContribution = false;

    // 2️⃣ Si trouvé dans contribution_uploads et qu'il a une markdown_url, l'utiliser
    if (markdown_url) {
      try {
        console.log('Chargement du markdown depuis contribution_uploads:', markdown_url);
        const response = await fetch(markdown_url);
        if (response.ok) {
          markdown = await response.text();
          usedContribution = true;
          console.log('Markdown chargé depuis contribution_uploads, taille:', `${(markdown.length / 1024).toFixed(2)} KB`);
        }
      } catch (error) {
        console.warn('Erreur lors du chargement du markdown depuis contribution_uploads:', error);
      }
    } else if (!projectName) {
      panel.innerHTML = `
      <div style="padding: 2em; text-align: center; color: #666;">
        <h3>Projet non trouvé</h3>
        <p>Le projet "${projectName}" n'a pas été trouvé dans la base de données.</p>
        <p>Seuls les projets de la table contribution_uploads sont disponibles.</p>
      </div>
      `;
      console.groupEnd();
      return;
    }
    
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

    // Traiter le markdown uniquement s'il existe; sinon continuer avec attrs/html vides
    let attrs = {};
    let html = '';
    if (markdown) {
      await ensureMarkdownUtils();
      console.log('Traitement du contenu Markdown...');
      ({ attrs, html } = window.MarkdownUtils.renderMarkdown(markdown));
      console.log('Contenu Markdown traité avec succès');
    }
    

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
    // Utiliser les données de contribution_uploads en priorité
    const coverCandidate = cover_url || attrs.cover || extractFirstImageSrc(html);
    if (coverCandidate) {
      const coverUrl = resolveAssetUrl(coverCandidate);
      body+=`
      <div class="project-cover-wrap">
        <img class="project-cover" src="${coverUrl}" alt="${attrs.name||projectName||''}">
        <button class="cover-extend-btn" aria-label="Agrandir l'image" title="Agrandir">
          <i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>
        </button>
      </div>`;
    }
    const chips=[];
    if(attrs.from||attrs.to) chips.push(`<span class="chip chip-route">${attrs.from||''}${attrs.to?` → ${attrs.to}`:''}</span>`);
    if(attrs.trafic) chips.push(`<span class="chip chip-trafic">${attrs.trafic}</span>`);
    if(chips.length) body+=`<div class="project-chips">${chips.join('')}</div>`;
    
    // Utiliser description de contribution_uploads en priorité
    description = description || attrs.description;
    if(description) body+=`<p class="project-description">${description}</p>`;

    const icons={velo:'fa-bicycle',mobilite:'fa-train-tram',urbanisme:'fa-building'};

    // 1) Utiliser la route dynamique pour la fiche complète
    let fullPageUrl = null;
    try {
      const params = new URLSearchParams();
      if (category) params.set('cat', category);
      if (projectName) params.set('project', projectName);
      fullPageUrl = `/fiche/?${params.toString()}`;
    } catch (_) {
      fullPageUrl = `/fiche/?cat=${encodeURIComponent(category||'')}&project=${encodeURIComponent(projectName||'')}`;
    }

    panel.innerHTML = `
      <div class="detail-header-submenu">
        <div class="header-actions">
          <button id="detail-back-btn" class="gp-btn gp-btn--secondary" aria-label="Retour">
            <i class="fa-solid fa-arrow-left gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Retour</span>
          </button>
          <button id="detail-panel-toggle-btn" class="gp-btn gp-btn--secondary submenu-toggle-btn" aria-label="Réduire" aria-expanded="true" aria-controls="project-detail">
            <i class="fa-solid fa-compress gp-btn__icon" aria-hidden="true"></i>
            <span class="gp-btn__label">Réduire</span>
          </button>
        </div>
      </div>
      <div class="project-title-container">
        <i class="fa-solid ${icons[category]||'fa-map'}"></i>
        <h3 class="project-title">${projectName}</h3>
      </div>
      ${fullPageUrl ? `<a href="${fullPageUrl}" class="detail-fullpage-btn">
         <i class="fa-solid fa-up-right-from-square"></i>Voir la fiche complète
        </a>` : ''}
      <div id="detail-content" class="markdown-body">${body}</div>`;
    
    // Ensure reduce button starts expanded state (compress icon + label)
    try {
      const _btn = document.getElementById('detail-panel-toggle-btn');
      const _ic = _btn?.querySelector('i');
      const _lbl = _btn?.querySelector('.gp-btn__label');
      if (_ic) { _ic.classList.remove('fa-expand'); _ic.classList.add('fa-compress'); }
      if (_lbl) _lbl.textContent = 'Réduire';
      _btn?.classList.remove('is-collapsed');
      if (_btn) { _btn.setAttribute('aria-expanded', 'true'); _btn.setAttribute('aria-label', 'Réduire'); }
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
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
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

    // Wire up "Voir la fiche complète": navigation native vers la route dynamique (pas de modal)
    (function(){
      const cta = panel.querySelector('.detail-fullpage-btn');
      if (!cta) return;
      // Ne pas intercepter le clic: laisser la navigation gérer l'historique/SEO
    })();

    // (Bouton fermer supprimé)

    // Toggle collapse control (all sizes)
    const toggleBtn = document.getElementById('detail-panel-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const iconEl = toggleBtn.querySelector('i');
        const labelEl = toggleBtn.querySelector('.gp-btn__label');
        const isCollapsed = toggleBtn.getAttribute('aria-expanded') === 'false';
        if (isCollapsed) {
          // Expand
          panel.style.removeProperty('max-height');
          panel.style.removeProperty('overflow');
          if (iconEl) {
            if (iconEl.classList.contains('fa-expand')) iconEl.classList.replace('fa-expand', 'fa-compress');
            else iconEl.classList.add('fa-compress');
          }
          if (labelEl) labelEl.textContent = 'Réduire';
          toggleBtn.classList.remove('is-collapsed');
          toggleBtn.setAttribute('aria-expanded', 'true');
          toggleBtn.setAttribute('aria-label', 'Réduire');
        } else {
          // Collapse
          panel.style.setProperty('max-height', '10vh', 'important');
          panel.style.setProperty('overflow', 'hidden', 'important');
          if (iconEl && iconEl.classList.contains('fa-compress')) iconEl.classList.replace('fa-compress', 'fa-expand');
          if (labelEl) labelEl.textContent = 'Développer';
          toggleBtn.classList.add('is-collapsed');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', 'Développer');
        }
      });
    }

    // Configuration du bouton retour pour utiliser la fonction de réinitialisation
    const backButton = document.getElementById('detail-back-btn');
    if (backButton) {
      backButton.onclick = () => NavigationModule.resetToDefaultView(category, { preserveMapView: true, updateHistory: true });
    }
  }catch(e){
    console.error('Erreur markdown:',e);
    panel.innerHTML=`<h3>${projectName}</h3><p>Aucun détail disponible.</p>`;
  }

  // Résoudre et appliquer le filtrage pour la couche cible (tolérant)
  await resolveAndApplyLayerFiltering(projectName, category);

  // animateDashLine removed (dead code; deduped and color application removed)

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

  // Applique un effet d'atténuation (dimming) aux couches non sélectionnées
  // pour conserver leur visibilité tout en mettant en avant la couche ciblée
  function dimNonSelectedLayers(selectedLayerName, options = {}) {
    const { opacity = 0.2, fillOpacity = 0.1 } = options;
    try {
      const layersObj = window.MapModule?.layers || {};
      Object.keys(layersObj).forEach(name => {
        const layer = layersObj[name];
        if (!layer) return;
        if (name === selectedLayerName) {
          // Remettre plein contraste sur la couche sélectionnée
          // On n'écrase que les opacités pour ne pas perdre le style existant
          window.DataModule?.safeSetStyle(layer, { opacity: 1, fillOpacity: 0.5 });
          if (typeof layer.setOpacity === 'function') {
            layer.setOpacity(1);
          }
        } else {
          // Atténuer les autres couches
          window.DataModule?.safeSetStyle(layer, { opacity, fillOpacity });
          if (typeof layer.setOpacity === 'function') {
            layer.setOpacity(opacity);
          }
        }
      });
    } catch (_) { /* noop */ }
  }

  // Restaure l'opacité normale sur toutes les couches connues
  function restoreAllLayerOpacity() {
    try {
      const layersObj = window.MapModule?.layers || {};
      Object.keys(layersObj).forEach(name => {
        const layer = layersObj[name];
        if (!layer) return;
        window.DataModule?.safeSetStyle(layer, { opacity: 1, fillOpacity: 0.5 });
        if (typeof layer.setOpacity === 'function') {
          layer.setOpacity(1);
        }
      });
    } catch (_) { /* noop */ }
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
      // Masquer toutes les autres couches pour ne garder que le projet sélectionné visible
      try {
        const layersObj = window.MapModule?.layers || {};
        Object.keys(layersObj).forEach(name => {
          if (name !== layerName) {
            try { window.MapModule.removeLayer(name); } catch(_) { /* noop */ }
          }
        });
      } catch(_) { /* noop */ }
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
  
  // Code mort supprimé - highlightProjectPaths orphelin

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

  // renderVeloProjects supprimée - remplacée par SubmenuModule.renderProjectsByCategory('velo')

  // renderUrbanismeProjects supprimée - remplacée par SubmenuModule.renderProjectsByCategory('urbanisme')

  // (ancienne version supprimée)

  // (Helpers legacy supprimés: slugify, getMarkdownPathByCategory, extractCoverFromMarkdown)
  // coverCache supprimé - désormais dans SubmenuModule

  // renderTravauxProjects déplacée vers TravauxModule

  /**
   * Réinitialise la vue à l'état par défaut de l'application
   * - Si une catégorie est fournie, affiche uniquement le sous-menu correspondant
   * - Sinon, affiche uniquement les couches par défaut
   * - Masque tous les panneaux et sous-menus non concernés
   * - Peut réinitialiser la vue de la carte (désactivable via options)
   * - Peut mettre à jour l'URL/historique (désactivable via options)
   * @param {string} [category] - Catégorie à afficher (optionnel)
   * @param {{ preserveMapView?: boolean, updateHistory?: boolean }} [options] - Options de réinitialisation
   */
  const resetToDefaultView = (category, options = {}) => {
    const { preserveMapView = false, updateHistory = false } = options;
    console.log('Réinitialisation de la vue à l\'état par défaut');
    
    // 1. Masquer le panneau de détail
    const projectDetail = document.getElementById('project-detail');
    if (projectDetail) {
      projectDetail.style.display = 'none';
    }
    // Toujours restaurer l'opacité des couches au début du reset
    try { restoreAllLayerOpacity(); } catch(_) {}
    
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
        
        // Restaurer l'opacité normale (au cas où des couches restent en mémoire)
        try { restoreAllLayerOpacity(); } catch(_) {}

        // 4. Rendre le contenu du sous-menu correspondant (minimal fix)
        try {
          if (category === 'travaux') {
            if (window.TravauxModule?.renderTravauxProjects) {
              window.TravauxModule.renderTravauxProjects();
            }
          } else {
            // Utiliser le nouveau système unifié pour les autres catégories
            if (window.SubmenuModule?.renderProjectsByCategory) {
              window.SubmenuModule.renderProjectsByCategory(category);
            }
          }
        } catch (e) {
          console.warn('[NavigationModule] rendu sous-menu échoué (non bloquant):', e);
        }
        
        // Mettre à jour l'URL/historique avec uniquement la catégorie (sans project)
        try {
          if (updateHistory && typeof history?.pushState === 'function') {
            const params = new URLSearchParams();
            params.set('cat', category);
            const newUrl = `${location.pathname}?${params.toString()}`;
            history.pushState({ cat: category }, '', newUrl);
          }
        } catch (_) { /* noop */ }

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
      
      // Afficher à nouveau toutes les contributions par défaut (urbanisme, voielyonnaise, reseauProjeteSitePropre)
      try {
        const contributionLayers = ['urbanisme', 'voielyonnaise', 'reseauProjeteSitePropre'];
        contributionLayers.forEach(layerName => {
          // Réinitialiser l'état visuel du filtre et les tags si disponibles
          try {
            const filterItem = document.querySelector(`.filter-item[data-layer="${layerName}"]`);
            if (filterItem) filterItem.classList.add('active-filter');
            if (window.UIModule?.resetLayerFilterWithoutRemoving) {
              window.UIModule.resetLayerFilterWithoutRemoving(layerName);
            } else if (window.UIModule?.resetLayerFilter) {
              window.UIModule.resetLayerFilter(layerName);
            }
          } catch (_) { /* noop */ }

          // (Re)créer/charger la couche si nécessaire
          if (DataModule.layerData && DataModule.layerData[layerName]) {
            DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
          } else {
            DataModule.loadLayer(layerName);
          }

          // S'assurer qu'elle est visible sur la carte
          const lyr = window.MapModule.layers && window.MapModule.layers[layerName];
          if (lyr && window.MapModule.map && !window.MapModule.map.hasLayer(lyr)) {
            window.MapModule.map.addLayer(lyr);
          }
        });
      } catch (e) {
        console.warn('[NavigationModule] restauration des contributions échouée (non bloquant):', e);
      }
    }
    
    // Réinitialiser le zoom et la position de la carte (sauf si préservé)
    if (!preserveMapView) {
      if (window.NavigationModule && window.NavigationModule.zoomOutOnLoadedLayers) {
        window.NavigationModule.zoomOutOnLoadedLayers();
      }
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

    // Mettre à jour l'URL/historique pour refléter la sortie du détail
    // - Si une catégorie est fournie, on conserve ?cat=<category> (sans project)
    // - Sinon, on nettoie l'URL (aucun paramètre)
    try {
      if (updateHistory && typeof history?.pushState === 'function') {
        const params = new URLSearchParams();
        if (category) params.set('cat', category);
        const newQuery = params.toString();
        const newUrl = `${location.pathname}${newQuery ? `?${newQuery}` : ''}`;
        history.pushState(category ? { cat: category } : null, '', newUrl);
      }
    } catch (_) { /* noop */ }
  }

  // Exposer les fonctions publiques du module
  const publicAPI = { 
    showProjectDetail, 
    zoomOutOnLoadedLayers, 
    resetToDefaultView
    // renderMobiliteProjects, renderVeloProjects, renderUrbanismeProjects supprimées
    // -> remplacées par SubmenuModule.renderProjectsByCategory()
    // renderTravauxProjects déplacée vers TravauxModule
  };
  
  // Exposer le module globalement
  window.NavigationModule = publicAPI;
  
  return publicAPI;
})();
