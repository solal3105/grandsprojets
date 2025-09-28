// Module de gestion des données et de l'interface utilisateur

// Cache ultra-simple en mémoire
const simpleCache = {
    _cache: {},
    _hits: 0,
    _misses: 0,
    _ttl: 600000, // Durée de vie des entrées : 10 minutes
    
    // Récupère ou met en cache le résultat d'une fonction asynchrone
    async get(key, fetchFn) {
      // Tentative de récupération depuis le cache
      if (key in this._cache) {
        const entry = this._cache[key];
  
        // Gestion d’expiration (TTL)
        if (entry && Date.now() - entry.timestamp < this._ttl) {
          this._hits++;
          return entry.value ?? entry.promise; // value si déjà résolu, sinon promesse en cours
        }
        // Entrée expirée ➜ suppression
        delete this._cache[key];
      }
  
      // Pas en cache ou expiré ➜ appel réseau (miss)
      this._misses++;
  
      // Lancer immédiatement l’appel réseau et stocker la promesse pour mutualiser les requêtes concurrentes
      const fetchPromise = (async () => {
        try {
          const data = await fetchFn();
          // Remplacer la promesse par la valeur finale + horodatage
          this._cache[key] = { value: data, timestamp: Date.now() };
          return data;
        } catch (error) {
          // Nettoyer l’entrée pour éviter de bloquer sur une erreur
          delete this._cache[key];
          throw error;
        }
      })();
  
      // Stockage de la promesse avant sa résolution
      this._cache[key] = { promise: fetchPromise, timestamp: Date.now() };
      return fetchPromise;
    },
    
    // Pour vider tout le cache
    clear() {
      const count = Object.keys(this._cache).length;
      this._cache = {};
      this._hits = 0;
      this._misses = 0;
      return count;
    },
    
    // Méthode de débogage désactivée en production
    debug() {
      // Fonctionnalité de débogage désactivée
      return {
        size: Object.keys(this._cache).length,
        hits: this._hits,
        misses: this._misses,
        keys: []
      };
    }
  };
  
  // Exposer pour le débogage
  // window.debugCache = simpleCache;
  
  window.DataModule = (function() {
    /**
     * Gestionnaire de cache générique et réutilisable
     * Limite la taille du cache et gère les entrées
     */
    class CacheManager {
      constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
      }
  
      /**
       * Ajoute une entrée au cache avec gestion de la taille
       * @param {string} key - Clé de l'entrée
       * @param {*} value - Valeur à stocker
       */
      set(key, value) {
        try {
          // Si le cache est plein, supprime l'entrée la plus ancienne
          if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
          }
          this.cache.set(key, {
            value: value,
            timestamp: Date.now()
          });
        } catch (error) {
        }
      }
  
      /**
       * Récupère une valeur du cache
       * @param {string} key - Clé de l'entrée
       * @returns {*|null} Valeur stockée ou null
       */
      get(key) {
        const entry = this.cache.get(key);
        return entry ? entry.value : null;
      }
  
      /**
       * Vide complètement le cache
       */
      clear() {
        this.cache.clear();
      }
    }
  
    // Caches spécifiques pour différents types de données
    const urlCache = new CacheManager(50);     // Cache pour URLs
    const styleCache = new CacheManager(30);   // Cache pour styles
  
    // Variables internes pour stocker les configurations
    let urlMap = {};
    let styleMap = {};
    let defaultLayers = [];
    let layerData = {};   
  
  
  // Exposer une méthode d'initialisation
  function initConfig({ urlMap: u, styleMap: s, defaultLayers: d }) {
    // Initialisation silencieuse en production
    urlMap = u || {};
    styleMap = s || {};
    defaultLayers = d || [];
    
    // Vérification silencieuse en production
  }
  
    // --- Helpers: résolution des covers depuis les fichiers Markdown ---
  
    // Slugify harmonisé avec ficheprojet.js
    const slugify = (str) => String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // enlever les accents
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // retirer la ponctuation
      .trim()
      .replace(/\s+/g, '-') // espaces -> tirets
      .replace(/-+/g, '-')   // éviter les doubles tirets
      .replace(/^-+|-+$/g, ''); // trim des tirets
  
    // Caches simples pour éviter des fetchs répétés
    const coverCache = new Map(); // path -> coverUrl|null
    const coverPromiseCache = new Map(); // path -> Promise<string|null>
  
    function cleanQuoted(value) {
      let v = String(value ?? '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1).trim();
      }
      while (v.endsWith('"') || v.endsWith("'")) v = v.slice(0, -1).trim();
      while (v.startsWith('"') || v.startsWith("'")) v = v.slice(1).trim();
      return v;
    }
  
    // Extrait la valeur de 'cover' depuis le front-matter YAML en tête de fichier
    function extractCoverFromMarkdown(md) {
      try {
        const fm = md.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
        if (!fm) return null;
        const yml = fm[1];
        let cover = null;
        yml.split(/\r?\n/).forEach(line => {
          const m = line.match(/^(\w+)\s*:\s*(.*)$/);
          if (m) {
            const key = m[1];
            const val = cleanQuoted(m[2]);
            if (key === 'cover') cover = val;
          }
        });
        return cover || null;
      } catch (_) { return null; }
    }
  
    // Détermine le chemin Markdown attendu pour une feature selon sa couche
    function getMarkdownPathForFeature(layerName, props) {
      try {
        if (!props) return null;
        if (layerName === 'velo') {
          const line = props.line || props.Line || props.ligne;
          if (!line) return null;
          const n = String(line).trim().replace(/\D+/g, '');
          if (!n) return null;
          return `/pages/velo/ligne-${n}.md`;
        }
        if (layerName === 'urbanisme') {
          const name = props.name || props.Name;
          if (!name) return null;
          return `/pages/urbanisme/${slugify(name)}.md`;
        }
        if (layerName === 'mobilite') {
          const name = props.Name || props.name;
          if (!name) return null;
          return `/pages/mobilite/${slugify(name)}.md`;
        }
        // Autres couches: pas de mapping par défaut
        return null;
      } catch (_) { return null; }
    }
  
    // Récupère (avec cache) l'URL de cover pour un chemin Markdown donné
    function fetchCoverForPath(markdownPath) {
      if (!markdownPath) return Promise.resolve(null);
      if (coverCache.has(markdownPath)) {
        return Promise.resolve(coverCache.get(markdownPath));
      }
      if (coverPromiseCache.has(markdownPath)) {
        return coverPromiseCache.get(markdownPath);
      }
      const p = fetch(markdownPath)
        .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(txt => extractCoverFromMarkdown(txt))
        .catch(() => null)
        .then(cover => {
          coverCache.set(markdownPath, cover || null);
          coverPromiseCache.delete(markdownPath);
          return cover || null;
        });
      coverPromiseCache.set(markdownPath, p);
      return p;
    }
  
    // Enrichit les features d'une couche avec properties.imgUrl si possible
    async function injectImgUrlsToFeatures(layerName, data) {
      try {
        // Ne traiter que les couches pertinentes
        const supported = ['velo', 'urbanisme', 'mobilite'];
        if (!supported.includes(layerName)) return data;
  
        // Récupération de la liste de features selon la forme du GeoJSON
        const isFC = data && data.type === 'FeatureCollection' && Array.isArray(data.features);
        const features = isFC ? data.features : (Array.isArray(data) ? data : []);
        if (!features || features.length === 0) return data;
  
        // 1) Collecter les chemins Markdown uniques
        const pathToIndices = new Map();
        features.forEach((f, idx) => {
          const p = f && f.properties ? f.properties : {};
          const mdPath = getMarkdownPathForFeature(layerName, p);
          if (mdPath) {
            if (!pathToIndices.has(mdPath)) pathToIndices.set(mdPath, []);
            pathToIndices.get(mdPath).push(idx);
          }
        });
        if (pathToIndices.size === 0) return data;
  
        // 2) Récupérer toutes les covers en parallèle
        const tasks = Array.from(pathToIndices.keys()).map(async (mdPath) => {
          const cover = await fetchCoverForPath(mdPath);
          if (!cover) return;
          const idxs = pathToIndices.get(mdPath) || [];
          idxs.forEach(i => {
            try {
              if (!features[i].properties) features[i].properties = {};
              features[i].properties.imgUrl = cover;
            } catch (_) {}
          });
        });
        await Promise.all(tasks);
        return data;
      } catch (_) {
        return data;
      }
    }
  
    // --- Génération de contenu pour le tooltip ---
    
    // Construit le contenu HTML pour les champs à afficher
    function buildTooltipFields(props, layerName) {
      let content = "";
      // layer_info_config supprimé: utiliser toutes les propriétés telles quelles
      for (const key in props) {
        content += `<em>${key}</em> : ${props[key]}<br>`;
      }
      return content;
    }
  
    // Génère le contenu du popup (carte ou cover)
    async function generateTooltipContent(feature, layerName, variant = 'card') {
      const props = feature?.properties || {};
      
      // Les données sont maintenant directement dans les properties depuis fetchLayerData
      let imgUrl = props.cover_url || props.imgUrl;
      let title = props.project_name || props.name || props.Name || props.line || '';
      
      // Ajustement du titre pour Voie Lyonnaise
      if (layerName === 'velo' && props.project_name && !title.startsWith('Voie Lyonnaise')) {
        title = `Voie Lyonnaise ${props.project_name}`;
      }
  
      // Simple échappement pour éviter l'injection HTML
      const esc = (s) => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
  
      const titleHtml = esc(title);
  
      // Si aucune donnée exploitable, ne rien afficher
      if (!titleHtml && !imgUrl) return '';
  
      // Variante "cover" (utilisée pour les marqueurs caméra)
      if (variant === 'cover' && imgUrl) {
        return `
          <div class="project-cover-wrap project-cover-wrap--popup">
            <img class="project-cover" src="${esc(imgUrl)}" alt="${titleHtml || 'Illustration'}">
            ${titleHtml ? `<div class="gp-card-title" style="margin-top:8px">${titleHtml}</div>` : ''}
          </div>
        `;
      }
  
      const imgHtml = imgUrl
        ? `<div class=\"gp-card-media\"><img src=\"${esc(imgUrl)}\" alt=\"${titleHtml || 'Illustration'}\"/></div>`
        : `<div class=\"gp-card-media gp-card-media--placeholder\"></div>`;
  
      // Afficher un petit CTA uniquement pour les couches cliquables
      const clickableLayers = ['velo', 'urbanisme', 'mobilite'];
      const showCta = clickableLayers.includes(layerName);
  
      return `
        <div class=\"gp-card\">
          ${imgHtml}
          <div class=\"gp-card-body\">
            ${titleHtml ? `<div class=\"gp-card-title\">${titleHtml}</div>` : ''}
            ${showCta ? `
              <div class=\"gp-card-cta\" role=\"note\" aria-hidden=\"true\">
                <i class=\"fa-solid fa-hand-pointer\" aria-hidden=\"true\"></i>
                <span>Cliquez pour en savoir plus</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  
    // --- Gestion du style et des événements ---
  
    // Renvoie le style par défaut pour une couche
    function getDefaultStyle(layerName) {
      
      const style = styleMap[layerName];
      // Si pas de style spécifique, retourner un style par défaut
      if (!style) {
        console.warn(`Aucun style trouvé pour la couche ${layerName}, utilisation d'un style par défaut`);
        return {
          color: '#3498db',
          weight: 3,
          opacity: 0.8,
          fill: false,
          dashArray: layerName === 'velo' ? '10, 5' : null
        };
      }
      
      return style;
    }
  
    // Renvoie le style d'une feature selon la couche et ses propriétés
    function getFeatureStyle(feature, layerName) {
      
      // Récupère le style par défaut depuis la configuration Supabase
      const baseStyle = getDefaultStyle(layerName) || {};
      const p = feature?.properties || null;
      if (!p) {
        // Si la feature ou ses propriétés sont absentes, revenir au style par défaut
        return baseStyle;
      }
      
      // Styles explicites pour les couches PLU / Emplacement Réservé (polygones)
      if (layerName === 'emplacementReserve' || /plu|emplacement|reserve/i.test(layerName)) {
        return {
          ...baseStyle,
          // S'assurer que le contour reste visible
          stroke: baseStyle.stroke !== false,
          color: baseStyle.color || '#3F52F3',
          weight: (baseStyle.weight ?? 2),
          opacity: (baseStyle.opacity ?? 0.9),
          // Remplissage lisible
          fill: (baseStyle.fill !== undefined ? baseStyle.fill : true),
          fillColor: baseStyle.fillColor || 'rgba(63,82,243,0.15)',
          fillOpacity: (baseStyle.fillOpacity ?? 0.3),
          dashArray: baseStyle.dashArray || null
        };
      }
  
      // Applique des styles spécifiques selon le type de couche
      switch(layerName) {
        case 'metroFuniculaire':
          // Pour les métros et funiculaires, on utilise les couleurs spécifiques
          // Gérer les variations de nom de propriété selon les sources (ligne/LIGNE/Line)
          {
            const metroColors = window.dataConfig?.metroColors || {};
            const rawLine = p.ligne || p.LIGNE || p.Line;
            let lineColor = null;
            if (rawLine != null) {
              const upper = String(rawLine).toUpperCase();
              // Clé compacte (retire préfixes et espaces): LIGNE/METRO/M/L. + espaces
              const compact = upper.replace(/^LIGNE\s+|^METRO\s+|^M\s*|^L\.?\s*/,'').replace(/\s+/g,'');
              if (metroColors[compact]) {
                lineColor = metroColors[compact];
              } else {
                // Token simple (F1/F2/A/B/C/D)
                const token = upper.match(/F\d|[A-Z]/);
                if (token && metroColors[token[0]]) lineColor = metroColors[token[0]];
              } 
            }
            return {
              ...baseStyle,
              color: lineColor || baseStyle.color || '#3F52F3',
              weight: baseStyle.weight || 3
            };
          }
          
        case 'velo':
          // Pour les voies lyonnaises, on gère l'état de réalisation
          const isDone = p.status === 'done';
          return {
            ...baseStyle,
            fill: false,
            dashArray: isDone ? null : (baseStyle.dashArray || '5,5')
          };
          
        case 'mobilite':
          // Pour le réseau projeté, on s'assure que le style est cohérent
          return {
            ...baseStyle,
            weight: baseStyle.weight || 2,
            dashArray: baseStyle.dashArray || '4,4',
            color: baseStyle.color || '#8C368C'
          };
          
        case 'urbanisme':
          // Pour l'urbanisme, on s'assure que le remplissage est cohérent
          return {
            ...baseStyle,
            fill: baseStyle.fill !== undefined ? baseStyle.fill : true,
            fillColor: baseStyle.fillColor || '#999',
            color: baseStyle.color || '#3F52F3',
            weight: baseStyle.weight || 2
          };
          
        case 'travaux':
          // Coloration en fonction de l'avancement calculé (date_debut -> date_fin)
          try {
            const safeDate = (v) => {
              const d = v ? new Date(v) : null;
              return d && !isNaN(d.getTime()) ? d : null;
            };
            const d = safeDate(p.date_debut);
            const f = safeDate(p.date_fin);
            const now = new Date();
            // Palette 0% -> 100% (10 paliers) — inversée (0% rouge, 100% vert)
            const scale = [
              '#E1002A', // 0% rouge
              '#E71922',
              '#ED3319',
              '#F34C11',
              '#F96608', // ~50% orange vif
              '#D08812',
              '#A19225',
              '#729B37',
              '#43A54A',
              '#14AE5C'  // 100% vert
            ];
            let color = baseStyle.color || '#FFA500'; // fallback si dates invalides
            if (d && f && f.getTime() > d.getTime()) {
              const total = f.getTime() - d.getTime();
              const elapsed = now.getTime() - d.getTime();
              const pct = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
              const idx = Math.round((pct / 100) * (scale.length - 1)); // 0..9
              color = scale[idx];
            }
            return {
              ...baseStyle,
              color,
            };
          } catch (_) {
            return baseStyle;
          }
        
        default:
          // Pour les autres couches, on retourne le style de base
          return baseStyle;
      }
    }
  
    // Applique un style de manière sécurisée à une couche
    // Fonction utilitaire: parse une couleur CSS en objet RGB
    function parseColorToRgb(color) {
      if (!color) return null;
      const c = String(color).trim();
      // Hex court ou long
      const hexMatch = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
          hex = hex.split('').map(ch => ch + ch).join('');
        }
        return {
          r: parseInt(hex.substring(0,2), 16),
          g: parseInt(hex.substring(2,4), 16),
          b: parseInt(hex.substring(4,6), 16)
        };
      }
      // rgb/rgba
      const rgbMatch = c.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i);
      if (rgbMatch) {
        const clamp = (n) => Math.max(0, Math.min(255, parseInt(n, 10)));
        return {
          r: clamp(rgbMatch[1]),
          g: clamp(rgbMatch[2]),
          b: clamp(rgbMatch[3])
        };
      }
      return null; // Format non géré (nom CSS), on abandonne proprement
    }
  
    // Fonction utilitaire pour assombrir une couleur (hex ou rgb/rgba). Retourne la couleur d'origine si non gérable.
    function darkenColor(color, factor = 0.5) {
      const rgb = parseColorToRgb(color);
      if (!rgb) return color;
      const darkerR = Math.max(0, Math.round(rgb.r * (1 - factor)));
      const darkerG = Math.max(0, Math.round(rgb.g * (1 - factor)));
      const darkerB = Math.max(0, Math.round(rgb.b * (1 - factor)));
      return `#${darkerR.toString(16).padStart(2, '0')}${darkerG.toString(16).padStart(2, '0')}${darkerB.toString(16).padStart(2, '0')}`;
    }
  
    function safeSetStyle(layer, style) {
      if (layer && typeof layer.setStyle === 'function') {
        layer.setStyle(style);
      } else if (layer && typeof layer.eachLayer === 'function') {
        layer.eachLayer(innerLayer => {
          if (typeof innerLayer.setStyle === 'function') {
            innerLayer.setStyle(style);
          }
        });
      }
    }
  
    // Ferme proprement le tooltip de survol projet s'il existe
    function closeHoverTooltip() {
      try {
        if (window.__gpHoverTooltip && MapModule?.map) {
          MapModule.map.removeLayer(window.__gpHoverTooltip);
        }
      } catch (e) { /* noop */ }
      window.__gpHoverTooltip = null;
    }
  
    // Ouvre une lightbox overlay pour afficher l'image en grand (utilisée par les popups caméra)
    function openCoverLightbox(imgUrl, title = '') {
      try {
        const overlay = document.createElement('div');
        overlay.className = 'cover-lightbox';
        overlay.innerHTML = `
          <div class="lightbox-content">
            <img src="${imgUrl}" alt="${title}">
            <button class="lightbox-close" aria-label="Fermer">
              <i class="fa fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        `;
        document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.lightbox-close')?.addEventListener('click', close);
        document.addEventListener('keydown', onKey);
      } catch(_) {}
    }
  
    // Lie les événements (tooltip, mouseover, click, etc.) à une feature
    function bindFeatureEvents(layer, feature, geojsonLayer, layerName) {
      // Ne pas attacher d'événements aux marqueurs caméra
      if (layer.options && layer.options.icon && layer.options.icon.options && 
          layer.options.icon.options.className === 'legacy-camera-removed') {
        return;
      }
      
      // Tooltip personnalisé pour la couche 'travaux'
      if (layerName === 'travaux') {
        const props = feature.properties || {};
        const safeDate = (v) => {
          const d = v ? new Date(v) : null;
          return d && !isNaN(d.getTime()) ? d : null;
        };
        const debut = safeDate(props.date_debut);
        const fin = safeDate(props.date_fin);
        const now = new Date();
        const dateFmt = (d) => d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
        const durationDays = (debut && fin && fin > debut) ? Math.max(1, Math.round((fin - debut) / 86400000)) : null;
        const progressPct = (() => {
          if (!(debut && fin) || fin <= debut) return 0;
          const total = fin - debut;
          const elapsed = now - debut;
          return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
        })();
        const endColor = progressPct >= 100 ? '#14AE5C' : '#F59E0B';
        const gradientBg = `linear-gradient(90deg, #E1002A 0%, ${endColor} 100%)`;
        const todayPct = (() => {
          if (!(debut && fin) || fin <= debut) return 0;
          const total = fin - debut;
          return Math.max(0, Math.min(100, ((now - debut) / total) * 100));
        })();
        const commune = props.commune || props.ville || props.COMMUNE || '';
        const titre = props.nature_travaux || 'Chantier';
        const etat = props.etat || '—';
        const etatClass = (() => {
          const e = (etat || '').toLowerCase();
          if (e.includes('ouver')) return 'etat--ouvert';
          if (e.includes('prochain')) return 'etat--prochain';
          if (e.includes('termin')) return 'etat--termine';
          return 'etat--neutre';
        })();
        const adrs = (props.adresse || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  
        // HTML bento structure
        const tooltipContent = `
          <div class="gp-travaux glass">
            <div class="gp-hero">
              <div class="hero-left">
                <span class="hero-icon">🚧</span>
                <div>
                  <div class="hero-title">${titre || 'Travaux'}</div>
                  <div class="hero-sub">${commune || ''}</div>
                </div>
              </div>
              <span class="etat-pill ${etatClass}">${etat}</span>
            </div>
  
            <div class="gp-bento">
              <section class="tile tile--etat tile--timeline span-2">
                <h3>Avancement</h3>
                <div class="timeline">
                  <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}" aria-label="Avancement des travaux">
                    <div class="fill" data-target="${progressPct}" style="width:0%; background:${gradientBg}; box-shadow: 0 0 10px ${progressPct>=100 ? 'rgba(20,174,92,0.25)' : 'rgba(245,158,11,0.25)'}"></div>
                    <div class="today" style="left:${todayPct}%; background:${endColor}; box-shadow: 0 0 0 3px ${progressPct>=100 ? 'rgba(20,174,92,0.25)' : 'rgba(245,158,11,0.25)'}, 0 0 10px ${progressPct>=100 ? 'rgba(20,174,92,0.4)' : 'rgba(245,158,11,0.4)'};"></div>
                  </div>
                  <div class="dates">
                    <span>${debut ? dateFmt(debut) : '-'}</span>
                    <span>${fin ? dateFmt(fin) : '-'}</span>
                  </div>
                  <div class="meta">
                    <span>${durationDays ? `${durationDays} jours` : ''}</span>
                    <span>${progressPct}%</span>
                  </div>
                </div>
              </section>
  
              <section class="tile">
                <h3>Natures</h3>
                <div class="badges">
                  ${props.nature_chantier ? `<span class="badge">${props.nature_chantier}</span>` : ''}
                  ${props.nature_travaux ? `<span class="badge">${props.nature_travaux}</span>` : ''}
                </div>
              </section>
  
              <section class="tile">
                <h3>Adresses</h3>
                <ul class="addresses ${adrs.length > 5 ? 'collapsed' : ''}">
                  ${adrs.map((a)=>`<li><span>${a}</span></li>`).join('')}
                </ul>
                <div class="tile-actions">
                  ${adrs.length>5 ? '<button class="toggle-addresses">Voir plus</button>' : ''}
                </div>
              </section>
            </div>
          </div>
        `;
        
        // Ouvrir un modal avec flou d'arrière-plan au lieu d'un popup Leaflet
        const openTravauxModal = (html) => {
          try {
            // Overlay
            const overlay = document.createElement('div');
            overlay.className = 'gp-modal-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.innerHTML = `
              <div class="gp-modal gp-travaux-modal">
                <div class="gp-modal-header">
                  <div class="gp-modal-title">Détails du chantier</div>
                  <button class="gp-modal-close" aria-label="Fermer">✖</button>
                </div>
                <div class="gp-modal-body">
                  ${html}
                </div>
              </div>
            `;
            document.body.appendChild(overlay);
            // Accessibility: link dialog to title
            const titleEl = overlay.querySelector('.gp-modal-title');
            if (titleEl) {
              const titleId = `gp-modal-title-${Date.now()}`;
              titleEl.id = titleId;
              overlay.setAttribute('aria-labelledby', titleId);
            }
  
            // Prevent background scroll while modal is open
            let prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
  
            // Focus trap within the modal
            const modalRoot = overlay.querySelector('.gp-modal');
            const focusableSelector = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
            const focusables = Array.from(modalRoot?.querySelectorAll(focusableSelector) || []).filter(el => !el.hasAttribute('disabled'));
            const firstFocusable = focusables[0];
            const lastFocusable = focusables[focusables.length - 1];
            const previouslyFocused = document.activeElement;
  
            const trapTab = (e) => {
              if (e.key !== 'Tab' || focusables.length === 0) return;
              if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                  e.preventDefault();
                  lastFocusable?.focus();
                }
              } else {
                if (document.activeElement === lastFocusable) {
                  e.preventDefault();
                  firstFocusable?.focus();
                }
              }
            };
            overlay.addEventListener('keydown', trapTab);
  
            // Set initial focus to close button or first focusable
            (overlay.querySelector('.gp-modal-close') || firstFocusable)?.focus();
  
            const close = () => {
              try {
                document.removeEventListener('keydown', onKey);
                overlay.removeEventListener('keydown', trapTab);
                // Restore background scroll
                document.body.style.overflow = prevOverflow || '';
                // Restore previous focus
                if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                  setTimeout(() => previouslyFocused.focus(), 0);
                }
                overlay.remove();
              } catch(_) {}
            };
            const onKey = (ev) => { if (ev.key === 'Escape') close(); };
            document.addEventListener('keydown', onKey);
  
            // Fermer en cliquant hors du modal
            overlay.addEventListener('click', (ev) => {
              if (ev.target === overlay) close();
            });
            overlay.querySelector('.gp-modal-close')?.addEventListener('click', close);
  
            // Initialisations spécifiques Bento
            const modalEl = overlay.querySelector('.gp-travaux');
            if (modalEl) {
              // Progress bar animation
              const fill = modalEl.querySelector('.timeline .fill');
              const target = Number(fill?.getAttribute('data-target') || 0);
              if (fill && !isNaN(target)) {
                requestAnimationFrame(() => {
                  fill.style.width = '0%';
                  setTimeout(()=>{ fill.style.width = `${target}%`; }, 40);
                });
              }
  
              // Addresses toggle/copy
              const ul = modalEl.querySelector('.addresses');
              const toggleBtn = modalEl.querySelector('.toggle-addresses');
              toggleBtn?.addEventListener('click', () => {
                ul?.classList.toggle('collapsed');
                if (toggleBtn.textContent.includes('plus')) toggleBtn.textContent = 'Voir moins';
                else toggleBtn.textContent = 'Voir plus';
              });
  
            }
          } catch(_) { /* noop */ }
        };
  
        // Clic sur la feature: ouvrir le modal et marquer l'événement comme géré
        layer.on('click', (evt) => {
          try {
            if (evt && evt.originalEvent) {
              evt.originalEvent.__gpHandledTravaux = true;
            }
          } catch(_) {}
          openTravauxModal(tooltipContent);
        });
      }
      
      const isFiltered = Object.keys(FilterModule.get(layerName)).length > 0;
      const detailSupportedLayers = ['velo', 'urbanisme', 'mobilite'];
      const noInteractLayers = ['planVelo', 'amenagementCyclable'];
  
      // Tooltip générique (ou spécifique) pour les couches non cliquables (paths/polygones)
      try {
        if (layerName !== 'travaux' && typeof layer.bindTooltip === 'function') {
          const p = (feature && feature.properties) || {};
          const geomType = (feature && feature.geometry && feature.geometry.type) || '';
          const isPathOrPoly = /LineString|Polygon/i.test(geomType);
          const projectNameGuess = p?.project_name || p?.name || p?.line || p?.Name || p?.LIBELLE;
          const isDetailSupported = detailSupportedLayers.includes(layerName);
          const isClickable = isDetailSupported && !!projectNameGuess;
          if (!isClickable && isPathOrPoly) {
            const esc = (s) => String(s || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\"/g, '&quot;')
              .replace(/'/g, '&#39;');
            const title = projectNameGuess || p?.titre || p?.title || '';
            let inner;
  
            // Règles spécifiques par couche
            if (layerName === 'bus') {
              const val = p.bus || p.BUS || p.Bus || '';
              inner = `<div class="gp-tt-body">${esc(`bus ${val}`)}</div>`;
            } else if (layerName === 'metroFuniculaire') {
              const ligne = p.ligne || p.LIGNE || p.Line || '';
              const isFuni = String(ligne).toUpperCase() === 'F1' || String(ligne).toUpperCase() === 'F2';
              const label = isFuni ? `Funiculaire ${ligne}` : `Métro ${ligne}`;
              inner = `<div class="gp-tt-body">${esc(label)}</div>`;
            } else if (layerName === 'tramway') {
              const val = p.tramway || p.ligne || p.LIGNE || '';
              inner = `<div class="gp-tt-body">${esc(`Tramway ${val}`)}</div>`;
            } else if (layerName === 'emplacementReserve' || /plu|emplacement|reserve/i.test(layerName)) {
              const raw = (p.type ?? p.TYPE ?? p.Type ?? p.libelle ?? p.LIBELLE ?? p.code ?? p.CODE ?? p.typologie ?? '').toString().trim();
              const normalizeKey = (s) => s
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
                .toUpperCase()
                .replace(/[^A-Z]/g, ''); // remove spaces, dashes, underscores, etc.
              const key = normalizeKey(raw);
              const map = {
                // Primary codes
                'ELARVOIE': 'Élargissement de voirie',
                'CREAVOIE': 'Création de voirie',
                'CARREF': 'Aménagement de carrefour',
                'EQUIPUBL': 'Équipements publics',
                'MAILPLANTE': 'Mail planté / espace vert',
                // Common variations/synonyms (defensive)
                'ELARGVOIE': 'Élargissement de voirie',
              };
              const label = map[key] || raw || '';
              inner = `<div class="gp-tt-body">${esc(`Objectif : ${label}`)}</div>`;
            } else {
              // Fallback générique précédent
              let fieldsHtml = '';
              try { fieldsHtml = buildTooltipFields(p, layerName) || ''; } catch (_) {}
              inner = `
                ${title ? `<div class="gp-tt-title">${esc(title)}</div>` : ''}
                <div class="gp-tt-body">${fieldsHtml}</div>
              `;
            }
            // Désactiver la tooltip au survol pour certaines couches
            if (layerName !== 'planVelo' && layerName !== 'amenagementCyclable') {
              layer.bindTooltip(inner, {
                className: 'gp-path-tooltip',
                sticky: true,
                direction: 'auto',
                // Les lignes ayant une épaisseur fine, sticky améliore la UX
                // offset est géré automatiquement par Leaflet
              });
            }
          }
        }
      } catch (_) { /* noop */ }
  
      // (clic géré plus bas dans la fonction; ici rien à faire)
      
      // Helper: animation de pointillés (dédupliqué)
      function animateDashLine(layer) {
        let dashOffset = 0;
        const animateInterval = setInterval(() => {
          if (typeof layer.setStyle === 'function') {
            layer.setStyle({
              dashArray: '10, 10',
              dashOffset: dashOffset
            });
          }
          dashOffset = (dashOffset + 1) % 20;
        }, 100);
        return animateInterval;
      }
  
      // Ajoute un style de survol si la couche supporte les fiches détails
      if (detailSupportedLayers.includes(layerName)) {
        layer.on('mouseover', function(e) {
          // Identifier le projet du segment en fonction de la couche
          let currentProjectNameRaw;
          const p = (feature && feature.properties) || {};
          if (layerName === 'mobilite') {
            currentProjectNameRaw = p.Name || p.name || p.project_name;
          } else if (layerName === 'velo') {
            currentProjectNameRaw = p.line;
          } else {
            currentProjectNameRaw = p.name || p.Name || p.project_name;
          }
          const currentProjectName = currentProjectNameRaw ? String(currentProjectNameRaw).trim() : '';
  
          // Réinitialiser tous les styles de la couche et stopper d'éventuelles animations en cours
          geojsonLayer.eachLayer(otherLayer => {
            const originalStyle = getFeatureStyle(otherLayer.feature, layerName);
            if (typeof otherLayer.setStyle === 'function') {
              otherLayer.setStyle(originalStyle);
            }
            if (otherLayer.dashInterval) {
              try { clearInterval(otherLayer.dashInterval); } catch (_) {}
              otherLayer.dashInterval = null;
            }
          });
  
          // Si on ne dispose pas d'un identifiant de projet fiable, n'accentuer que la feature survolée
          if (!currentProjectName) {
            try {
              const originalStyle = getFeatureStyle(feature, layerName);
              safeSetStyle(layer, {
                ...originalStyle,
                color: darkenColor(originalStyle.color || '#3388ff', 0.2),
                weight: (originalStyle.weight || 3) + 2,
                dashArray: '10, 10',
                opacity: 1,
                fillOpacity: originalStyle.fillOpacity || 0.2
              });
              layer.dashInterval = animateDashLine(layer);
            } catch (_) { /* noop */ }
            return;
          }
  
          // Mettre en évidence tous les segments correspondant au même projet
          geojsonLayer.eachLayer(otherLayer => {
            let otherProjectNameRaw;
            const op = (otherLayer && otherLayer.feature && otherLayer.feature.properties) || {};
            // Utiliser project_name en priorité pour toutes les catégories
            otherProjectNameRaw = op.project_name || op.name || op.Name || op.line;
            const otherProjectName = otherProjectNameRaw ? String(otherProjectNameRaw).trim() : '';
  
            if (otherProjectName && otherProjectName === currentProjectName) {
              if (typeof otherLayer.setStyle === 'function') {
                // Récupérer le style d'origine
                const originalStyle = getFeatureStyle(otherLayer.feature, layerName);
  
                // Créer un style de surbrillance basé sur le style d'origine
                otherLayer.setStyle({
                  color: darkenColor(originalStyle.color || '#3388ff', 0.2), // Assombrir légèrement la couleur d'origine
                  weight: (originalStyle.weight || 3) + 2, // Épaissir le trait de 2px
                  dashArray: '10, 10',
                  opacity: 1,
                  fillOpacity: originalStyle.fillOpacity || 0.2
                });
  
                // Ajouter l'animation de pointillés
                otherLayer.dashInterval = animateDashLine(otherLayer);
              }
            }
          });
  
          // Afficher un tooltip riche (image + titre) pour le projet lié
          try {
            generateTooltipContent(feature, layerName).then(html => {
              if (html) {
                closeHoverTooltip();
                window.__gpHoverTooltip = L.tooltip({
                  className: 'gp-project-tooltip',
                  direction: 'top',
                  permanent: false,
                  offset: [0, -12],
                  opacity: 1,
                  // Rendre cliquable pour ouvrir la fiche projet (mobile/desktop)
                  interactive: true
                }).setLatLng(e.latlng)
                  .setContent(html)
                  .addTo(MapModule.map);
  
                // Rendre le tooltip cliquable pour ouvrir la fiche détail
                try {
                  const el = window.__gpHoverTooltip && typeof window.__gpHoverTooltip.getElement === 'function'
                    ? window.__gpHoverTooltip.getElement()
                    : null;
                  if (el) {
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', (ev) => {
                      try { ev.preventDefault(); ev.stopPropagation(); } catch(_) {}
                      try {
                        // Réutiliser la logique existante du clic sur la couche
                        if (layer && typeof layer.fire === 'function') {
                          layer.fire('click');
                        } else if (window.UIModule && typeof window.UIModule.showDetailPanel === 'function') {
                          window.UIModule.showDetailPanel(layerName, feature);
                        }
                      } catch(_) { /* noop */ }
                    });
                  }
                } catch(_) { /* noop */ }
  
                // Suivre la souris tant que l'on reste sur la même feature
                const moveHandler = (ev) => {
                  if (window.__gpHoverTooltip) {
                    window.__gpHoverTooltip.setLatLng(ev.latlng);
                  }
                };
                layer.__gpMoveHandler = moveHandler;
                layer.on('mousemove', moveHandler);
              }
            }).catch(err => {
              // silencieux en production
            });
          } catch (err) {
            // silencieux en production
          }
        });
  
        layer.on('mouseout', function(e) {
          // Restaurer les styles originaux de tous les segments
          geojsonLayer.eachLayer(otherLayer => {
            const originalStyle = getFeatureStyle(otherLayer.feature, layerName);
            
            if (typeof otherLayer.setStyle === 'function') {
              otherLayer.setStyle(originalStyle);
              
              // Arrêter l'animation de pointillés
              if (otherLayer.dashInterval) {
                clearInterval(otherLayer.dashInterval);
              }
            }
          });
  
          // Fermer le tooltip et détacher le suivi
          if (layer.__gpMoveHandler) {
            layer.off('mousemove', layer.__gpMoveHandler);
            delete layer.__gpMoveHandler;
          }
          closeHoverTooltip();
        });
      }
  
      if (!isFiltered) {
        // Différencier le comportement selon que le path est cliquable ou non
        const isClickablePath = detailSupportedLayers.includes(layerName);
  
        if (!isClickablePath && !noInteractLayers.includes(layerName)) {
          // Survol avec assombrissement de la couleur, sans changement de poids
          layer.on('mouseover', () => {
            const originalStyle = getFeatureStyle(feature, layerName);
            const darkerColor = darkenColor(originalStyle.color);
            
            safeSetStyle(layer, {
              ...originalStyle,
              color: darkerColor || originalStyle.color,
              // S'assurer que le contour reste actif et lisible
              stroke: originalStyle.stroke !== false,
              weight: (originalStyle.weight ?? 2)
            });
          });
  
          layer.on('mouseout', () => {
            // Restaurer le style original
            safeSetStyle(layer, getFeatureStyle(feature, layerName));
          });
        } else {
          // Conserver l'ancienne logique pour les paths cliquables
          layer.on('mouseover', () => {
            safeSetStyle(layer, { weight: 5 });
          });
          layer.on('mouseout', () => {
            if (typeof geojsonLayer.resetStyle === 'function') {
              geojsonLayer.resetStyle(layer);
            } else {
              safeSetStyle(layer, getDefaultStyle(layerName));
            }
            // Sécurité: fermer un éventuel tooltip
            if (layer.__gpMoveHandler) {
              layer.off('mousemove', layer.__gpMoveHandler);
              delete layer.__gpMoveHandler;
            }
            closeHoverTooltip();
          });
        }
      }
  
  
      // (animateDashLine duplicate removed; using the earlier helper)
  
      // Fonction pour mettre en évidence le projet
      const highlightProjectPath = (layerName, projectName) => {
        const geojsonLayer = MapModule.layers[layerName];
        
        // Réinitialiser tous les styles
        geojsonLayer.eachLayer(otherLayer => {
          const originalStyle = getFeatureStyle(otherLayer.feature, layerName);
          
          if (typeof otherLayer.setStyle === 'function') {
            otherLayer.setStyle(originalStyle);
            
            // Arrêter les animations précédentes
            if (otherLayer.dashInterval) {
              clearInterval(otherLayer.dashInterval);
            }
          }
        });
  
        // Sélectionner et mettre en évidence les segments du projet
        geojsonLayer.eachLayer(otherLayer => {
          const op = (otherLayer && otherLayer.feature && otherLayer.feature.properties) || {};
          const otherProjectName = op.project_name || op.name || op.Name || op.line;
          
          if (otherProjectName === projectName) {
            if (typeof otherLayer.setStyle === 'function') {
              otherLayer.setStyle({
                weight: 5,
                dashArray: '10, 10'
              });
              
              // Ajouter l'animation de pointillés
              otherLayer.dashInterval = animateDashLine(otherLayer);
            }
          }
        });
      };
  
      // Gestion du clic sur la feature
      if (!noInteractLayers.includes(layerName)) layer.on('click', () => {
        const p = (feature && feature.properties) || {};
        const rawProjectName = p.project_name || p.name || p.Name || p.line;

        if (!rawProjectName) {
          console.warn('Nom de projet non trouvé dans les properties:', p);
          return;
        }

        // Construire un critère de filtrage
        const criteria = {};
        if (p.project_name) {
          criteria.project_name = p.project_name;
        } else if (layerName === 'velo' && (p.line || p.ligne || p.Line)) {
          criteria.line = p.line || p.ligne || p.Line;
        } else if (p.Name) {
          criteria.Name = p.Name;
        } else if (p.name) {
          criteria.name = p.name;
        }
  
        // 3. Nettoyer la carte: retirer toutes les autres couches que celle cliquée
        try {
          Object.keys(MapModule.layers || {}).forEach((lname) => {
            if (lname !== layerName) {
              try { MapModule.removeLayer(lname); } catch (_) { /* noop */ }
            }
          });
        } catch (_) { /* noop */ }
  
        // 4. Filtrer visuellement sans recréer la couche (préserve les styles)
        try {
          const currentLayer = MapModule.layers[layerName];
          if (currentLayer) {
            // Masquer toutes les features qui ne correspondent pas au projet cliqué
            currentLayer.eachLayer(otherLayer => {
              const op = (otherLayer && otherLayer.feature && otherLayer.feature.properties) || {};
              const otherProjectName = op.project_name || op.name || op.Name || op.line;
              
              if (otherProjectName !== rawProjectName) {
                // Masquer les autres projets
                if (typeof otherLayer.setStyle === 'function') {
                  otherLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                }
              }
            });
          }
          // Définir le filtre pour la cohérence avec le système
          FilterModule.set(layerName, criteria);
        } catch (_) { /* noop */ }
  
        // Actions post-clic
        const actions = [
          () => UIModule.showDetailPanel(layerName, feature),
          () => highlightProjectPath(layerName, rawProjectName),
          () => UIModule.updateActiveFilterTagsForLayer(layerName)
        ];
        actions.forEach(action => { try { action(); } catch (_) {} });
  
        // 8. Zoomer sur l'étendue du projet filtré
        try {
          const filteredLayer = MapModule.layers[layerName];
          if (filteredLayer && typeof filteredLayer.getBounds === 'function') {
            const bounds = filteredLayer.getBounds();
            if (bounds && bounds.isValid()) {
              MapModule.map.fitBounds(bounds, { padding: [50, 50] });
            }
          }
        } catch (_) { /* noop */ }
      });
    }
  
  
  
  
  
    // Récupère les données d'une couche avec cache
    async function fetchLayerData(layerName) {
      // Clé de cache simple
      const cacheKey = `layer_${layerName}`;
      
      // Utilisation du cache
      return simpleCache.get(cacheKey, async () => {
        // Couches de contributions (chargées depuis contribution_uploads)
        const contributionCategories = ['urbanisme', 'velo', 'mobilite'];
        
        if (contributionCategories.includes(layerName)) {
          // Charger depuis contribution_uploads
          if (window.supabaseService?.fetchProjectsByCategory) {
            try {
              const contributionProjects = await window.supabaseService.fetchProjectsByCategory(layerName);
              
              // Construire un FeatureCollection depuis contribution_uploads
              const features = [];
              
              for (const project of contributionProjects) {
                if (project.geojson_url) {
                  try {
                    const geoResponse = await fetch(project.geojson_url);
                    if (geoResponse.ok) {
                      const geoData = await geoResponse.json();
                      
                      // Traiter selon le type de GeoJSON
                      if (geoData.type === 'FeatureCollection' && geoData.features) {
                        // Enrichir chaque feature avec les métadonnées du projet
                        geoData.features.forEach(feature => {
                          if (!feature.properties) feature.properties = {};
                          // Injecter les métadonnées directement dans les properties
                          feature.properties.project_name = project.project_name;
                          feature.properties.category = project.category;
                          feature.properties.cover_url = project.cover_url;
                          feature.properties.description = project.description;
                          feature.properties.markdown_url = project.markdown_url;
                          feature.properties.imgUrl = project.cover_url; // Pour compatibilité tooltip
                        });
                        features.push(...geoData.features);
                      } else if (geoData.type === 'Feature') {
                        // Feature unique
                        if (!geoData.properties) geoData.properties = {};
                        geoData.properties.project_name = project.project_name;
                        geoData.properties.category = project.category;
                        geoData.properties.cover_url = project.cover_url;
                        geoData.properties.description = project.description;
                        geoData.properties.markdown_url = project.markdown_url;
                        geoData.properties.imgUrl = project.cover_url;
                        features.push(geoData);
                      }
                    }
                  } catch (error) {
                    console.warn(`Erreur lors du chargement du GeoJSON pour ${project.project_name}:`, error);
                  }
                }
              }
              
              if (features.length > 0) {
                return {
                  type: 'FeatureCollection',
                  features: features
                };
              }
            } catch (error) {
              console.warn(`Erreur lors du chargement depuis contribution_uploads pour ${layerName}:`, error);
            }
          }
          
          // Pas de données trouvées pour cette catégorie
          console.warn(`Aucune donnée trouvée pour la catégorie: ${layerName}`);
          return { type: 'FeatureCollection', features: [] };
        } else {
          // Couches legacy (tramway, métro, etc.) - charger depuis les fichiers GeoJSON
          const url = urlMap[layerName];
          if (!url) {
            throw new Error(`Aucune URL définie pour la couche legacy: ${layerName}`);
          }
          
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} sur ${layerName}`);
          }
          
          const data = await response.json();
          return data;
        }
      });
    }
  
  
    // --- Création et ajout des couches GeoJSON ---
  
    // Crée la couche GeoJSON et l'ajoute à la carte
    function createGeoJsonLayer(layerName, data) {
      const criteria = FilterModule.get(layerName);
      
      // Définir les couches cliquables
      const clickableLayers = ['velo', 'mobilite', 'urbanisme'];
      const isClickable = clickableLayers.includes(layerName);
      
      // Créer un panneau personnalisé pour les couches cliquables
      if (isClickable) {
        if (!window.clickableLayersPane) {
          window.clickableLayersPane = MapModule.map.createPane('clickableLayers');
          window.clickableLayersPane.style.zIndex = 650; // Au-dessus des tuiles mais en dessous des popups
        }
      }
      
      // Fonction utilitaire pour vérifier si un texte contient des mots-clés de réseaux
      const isReseau = (text) => {
        if (!text) return false;
        const reseauxKeywords = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'electricite', 'assainissement'];
        return reseauxKeywords.some(keyword => 
          String(text).toLowerCase().includes(keyword.toLowerCase())
        );
      };
  
      const geojsonLayer = L.geoJSON(null, {
        pane: isClickable ? 'clickableLayers' : 'overlayPane',  // Utiliser le panneau personnalisé pour les couches cliquables
        filter: feature => {
          const props = (feature && feature.properties) || {};
          // Détection de page: sur l'index on masque tous les markers (Point),
          // sur les fiches (/fiche/) on conserve les Points de contribution.
          try {
            const path = (location && location.pathname) ? location.pathname : '';
            const isFichePage = path.includes('/fiche/');
            if (!isFichePage) {
              // Index: masquer toutes les features de type Point
              if (feature && feature.geometry && feature.geometry.type === 'Point') {
                return false;
              }
            } else {
              // Fiche: ne masquer que les Points legacy (sans project_name)
              if (feature && feature.geometry && feature.geometry.type === 'Point') {
                const isContribution = !!props.project_name;
                if (!isContribution) return false;
              }
            }
          } catch (_) { /* noop */ }
          // 1. Vérifier les critères de filtrage standards
          const standardCriteriaMatch = Object.entries(criteria)
            .filter(([key]) => !key.startsWith('_')) // Exclure les critères spéciaux (commençant par _)
            .every(([key, value]) => 
              ("" + (props[key] || "")).toLowerCase() === String(value).toLowerCase()
            );
          
          // 2. Vérifier le filtre des réseaux si activé
          const hideReseaux = criteria._hideReseaux === true;
          if (hideReseaux) {
            const isFeatureReseau = isReseau(props.nature_travaux) || isReseau(props.nature_chantier);
            return standardCriteriaMatch && !isFeatureReseau;
          }
          
          return standardCriteriaMatch;
        },
        style: feature => getFeatureStyle(feature, layerName),
        onEachFeature: (feature, layer) => {
          bindFeatureEvents(layer, feature, geojsonLayer, layerName);
  
          // Add an invisible wide "hitline" above the visible path for easier interactions on lines
          try {
            const g = feature && feature.geometry;
            const t = g && g.type;
            const isLine = t === 'LineString' || t === 'MultiLineString';
            // Create hitline only for clickable layers (those that open a project sheet)
            if (isLine && isClickable && MapModule?.hitRenderer && MapModule?.hitPaneName) {
              const hit = L.geoJSON(feature, {
                renderer: MapModule.hitRenderer,
                pane: MapModule.hitPaneName,
                interactive: true,
                bubblingMouseEvents: false,
                style: {
                  // Invisible mais interactif (large zone de clic)
                  color: '#000',
                  opacity: 0.001,
                  weight: 24,
                  lineCap: 'round',
                  lineJoin: 'round'
                }
              });
              // Add directly to map to ensure it renders in its pane regardless of parent layer
              hit.addTo(MapModule.map);
  
              // Forward pointer events from each hit sublayer to the original visible layer
              const forward = (eventName) => {
                hit.eachLayer(h => {
                  h.on(eventName, (e) => {
                    try {
                      if (e && e.originalEvent) {
                        e.originalEvent.preventDefault?.();
                        e.originalEvent.stopPropagation?.();
                      }
                      layer.fire(eventName, {
                        latlng: e.latlng,
                        layerPoint: e.layerPoint,
                        containerPoint: e.containerPoint,
                        originalEvent: e.originalEvent,
                        target: layer,
                        propagatedFrom: 'hitline'
                      });
                    } catch (_) { /* noop */ }
                  });
                });
              };
              // Rétablit l'animation au survol en relayant aussi hover/move
              ['click', 'touchstart', 'mouseover', 'mouseout', 'mousemove'].forEach(forward);
  
              // Keep lifecycle in sync: remove hitline when original layer is removed
              layer.on('remove', () => {
                try { MapModule.map.removeLayer(hit); } catch (_) { /* noop */ }
              });
            }
          } catch (_) { /* noop */ }
        }
      });
  
      geojsonLayer.addData(data);
      geojsonLayer.addTo(MapModule.map);
      MapModule.addLayer(layerName, geojsonLayer);
  
      // Surcharge du style après filtrage pour toutes les features visibles
      if (criteria && Object.keys(criteria).length > 0) {
        geojsonLayer.eachLayer(f => {
          if (typeof f.setStyle === 'function') {
            f.setStyle({ weight: 4 });
          }
        });
      }
    }
  
    // --- Fonctions publiques de chargement et préchargement des couches ---
  
    // Charge une couche (depuis le cache ou le réseau) et l'ajoute à la carte
    function loadLayer(layerName) {
      return fetchLayerData(layerName)
        .then(finalData => {
          // Mise à jour des données en mémoire
          layerData[layerName] = finalData;

          // Suppression de l'ancienne couche si elle existe
          MapModule.removeLayer(layerName);

          // Création de la nouvelle couche
          createGeoJsonLayer(layerName, finalData);
          return finalData;
        })
        .catch(err => {
          throw err; // Propager l'erreur
        });
    }
  
    // Préccharge les données d'une couche sans l'ajouter à la carte
    function preloadLayer(layerName) {
      return fetchLayerData(layerName)
        .then(data => {
          layerData[layerName] = data; // Mise en mémoire
          return data;
        })
        .catch(err => {
          throw err; // Propager l'erreur
        });
    }
  
    // Récupère les détails d'un projet
    async function getProjectDetails(projectName, category) {
      if (!projectName) {
        return null;
      }
      
      // Normalisation robuste: comparer sur des slugs (sans accents/ponctuation, insensible à la casse)
      const normalizedName = projectName.toString().toLowerCase().trim();
      const normalizedSlug = slugify(projectName);
      
      // Récupérer directement depuis contribution_uploads
      if (window.supabaseService?.fetchProjectsByCategory) {
        try {
          const category_clean = (category || '').toString().toLowerCase().trim();
          const contributionProjects = await window.supabaseService.fetchProjectsByCategory(category_clean);
          const contributionProject = Array.isArray(contributionProjects)
            ? contributionProjects.find(p => p?.project_name && slugify(p.project_name) === normalizedSlug)
            : null;
          
          if (contributionProject) {
            return {
              name: contributionProject.project_name,
              category: contributionProject.category,
              geojson_url: contributionProject.geojson_url,
              cover_url: contributionProject.cover_url,
              markdown_url: contributionProject.markdown_url,
              meta: contributionProject.meta,
              description: contributionProject.description,
              source: 'contribution_uploads'
            };
          }
        } catch (error) {
          console.warn('Erreur lors de la recherche dans contribution_uploads:', error);
        }
      }
      
      console.warn(`Projet non trouvé dans contribution_uploads: ${projectName} dans la catégorie ${category}`);
      return null;
    }
  
    // findFeatureByProjectName supprimée - remplacée par supabaseService.fetchProjectByCategoryAndName
  
    // Exposer les fonctions nécessaires
    return {
      initConfig, 
      layerData, 
      loadLayer, 
      preloadLayer, 
      createGeoJsonLayer, 
      getProjectDetails,
      getFeatureStyle,  // Exposer explicitement getFeatureStyle
      getDefaultStyle,  // Exposer aussi getDefaultStyle pour le débogage
      bindFeatureEvents,
      generateTooltipContent
      // openCoverLightbox supprimée - non utilisée
    };
  })();