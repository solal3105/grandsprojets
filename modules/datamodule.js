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
      if (layerName === 'voielyonnaise') {
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
      if (layerName === 'reseauProjeteSitePropre') {
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
      const supported = ['voielyonnaise', 'urbanisme', 'reseauProjeteSitePropre'];
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
    const config = window.layerInfoConfig && window.layerInfoConfig[layerName];
    if (config && config.displayFields && config.displayFields.length) {
      config.displayFields.forEach(field => {
        const label = (config.renameFields && config.renameFields[field]) || field;
        const value = props[field] || '';
        content += `<strong>${label}</strong> : ${value}<br>`;
      });
    } else {
      for (const key in props) {
        content += `<em>${key}</em> : ${props[key]}<br>`;
      }
    }
    return content;
  }

  // Génère le contenu du popup (carte ou cover)
  function generateTooltipContent(feature, layerName, variant = 'card') {
    const props = feature?.properties || {};
    const imgUrl = props.imgUrl;
    let title = '';
    if (layerName === 'voielyonnaise') {
      title = (props.line ? `Voie Lyonnaise ${props.line}` : (props.name || props.Name || ''));
    } else if (layerName === 'reseauProjeteSitePropre') {
      title = props.Name || props.name || '';
    } else if (layerName === 'urbanisme') {
      title = props.name || props.Name || '';
    } else {
      title = props.name || props.Name || props.line || '';
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
    const clickableLayers = ['voielyonnaise', 'transport', 'urbanisme', 'reseauProjeteSitePropre'];
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
        dashArray: layerName === 'voielyonnaise' ? '10, 5' : null
      };
    }
    
    return style;
  }

  // Renvoie le style d'une feature selon la couche et ses propriétés
  function getFeatureStyle(feature, layerName) {
    
    // Récupère le style par défaut depuis la configuration Supabase
    const baseStyle = getDefaultStyle(layerName) || {};
    
    // Applique des styles spécifiques selon le type de couche
    switch(layerName) {
      case 'metroFuniculaire':
        // Pour les métros et funiculaires, on utilise les couleurs spécifiques
        const metroColors = window.dataConfig?.metroColors || {};
        return {
          ...baseStyle,
          color: metroColors[feature.properties.ligne] || baseStyle.color || 'green',
          weight: baseStyle.weight || 3
        };
        
      case 'voielyonnaise':
        // Pour les voies lyonnaises, on gère l'état de réalisation
        const isDone = feature.properties?.status === 'done';
        return {
          ...baseStyle,
          fill: false,
          dashArray: isDone ? null : (baseStyle.dashArray || '5,5')
        };
        
      case 'reseauProjeteSitePropre':
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
          const d = safeDate(feature?.properties?.date_debut);
          const f = safeDate(feature?.properties?.date_fin);
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
  // Fonction utilitaire pour assombrir une couleur
  function darkenColor(color, factor = 0.5) {
    // Convertir la couleur en RVB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Assombrir
    const darkerR = Math.max(0, Math.round(r * (1 - factor)));
    const darkerG = Math.max(0, Math.round(g * (1 - factor)));
    const darkerB = Math.max(0, Math.round(b * (1 - factor)));

    // Reconvertir en hexadécimal
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
        layer.options.icon.options.className === 'camera-marker') {
      return;
    }
    
    // Tooltip personnalisé pour la couche 'travaux'
    if (layerName === 'travaux') {
      const props = feature.properties || {};
      // Construction du contenu du tooltip avec les champs demandés
      const tooltipContent = `
        <div class="travaux-tooltip-content">
          <div class="tt-row">
            <span class="icon">📍</span><span class="tt-label">Adresse</span><br>
            <span class="tt-value">${props.adresse ? props.adresse.replace(/\n/g, '<br>') : '-'}</span>
          </div>
          <div class="tt-row">
            <span class="icon">📅</span><span class="tt-label">Date des travaux prévue</span><br>
            <span class="tt-value">${(() => {
              const debut = props.date_debut;
              const fin = props.date_fin;
              const opts = { day: 'numeric', month: 'long', year: 'numeric' };
              const now = new Date();
              const safeDate = (v) => {
                const d = v ? new Date(v) : null;
                return d && !isNaN(d.getTime()) ? d : null;
              };

              if (debut && fin) {
                try {
                  const d = safeDate(debut);
                  const f = safeDate(fin);
                  if (d && f) {
                    const dStr = d.toLocaleDateString('fr-FR', opts);
                    const fStr = f.toLocaleDateString('fr-FR', opts);
                    // Calcul du pourcentage d'avancement entre d et f
                    let pctStr = '';
                    if (f.getTime() > d.getTime()) {
                      const total = f.getTime() - d.getTime();
                      const elapsed = now.getTime() - d.getTime();
                      const raw = Math.round((elapsed / total) * 100);
                      const clamped = Math.max(0, Math.min(100, raw));
                      pctStr = ` — ${clamped}%`;
                    }
                    return `du ${dStr} au ${fStr}${pctStr}`;
                  }
                  // Fallback si parsing invalide
                  return `${debut} au ${fin}`;
                } catch {
                  return `${debut} au ${fin}`;
                }
              } else if (debut) {
                try {
                  const d = safeDate(debut);
                  return d ? `le ${d.toLocaleDateString('fr-FR', opts)}` : debut;
                } catch {
                  return debut;
                }
              } else if (fin) {
                try {
                  const f = safeDate(fin);
                  return f ? `jusqu'au ${f.toLocaleDateString('fr-FR', opts)}` : fin;
                } catch {
                  return fin;
                }
              } else {
                return 'Non renseigné';
              }
            })()}</span>
            <div class="travaux-date-slider" data-debut="${props.date_debut || ''}" data-fin="${props.date_fin || ''}" aria-label="Curseur de date des travaux">
              <input class="travaux-range" type="range" min="0" max="100" value="${(() => {
                const d = props.date_debut ? new Date(props.date_debut) : null;
                const f = props.date_fin ? new Date(props.date_fin) : null;
                if (d && f && !isNaN(d) && !isNaN(f) && f.getTime() > d.getTime()) {
                  const now = new Date();
                  const total = f.getTime() - d.getTime();
                  const elapsed = now.getTime() - d.getTime();
                  const raw = Math.round((elapsed / total) * 100);
                  return Math.max(0, Math.min(100, raw));
                }
                return 0;
              })()}" />
              <div class="slider-label" aria-hidden="true"></div>
            </div>
          </div>
          <div class="tt-row">
            <span class="icon">🟢</span><span class="tt-label">État</span><br>
            <span class="tt-value">${props.etat || '-'}</span>
          </div>
          <div class="tt-row">
            <span class="icon">🚧</span><span class="tt-label">Nature chantier</span><br>
            <span class="tt-value">${props.nature_chantier || '-'}</span>
          </div>
          <div class="tt-row">
            <span class="icon">🛠️</span><span class="tt-label">Nature travaux</span><br>
            <span class="tt-value">${props.nature_travaux || '-'}</span>
          </div>
        </div>
      `;
      
      // Bind du popup au clic avec positionnement automatique
      layer.bindPopup(tooltipContent, {
        className: 'travaux-tooltip',
        closeButton: true,
        autoPan: true,
        autoPanPadding: [100, 20],
        maxWidth: 400
      });

      // Initialiser le curseur lors de l'ouverture du popup
      layer.on('popupopen', (e) => {
        try {
          const el = e.popup.getElement();
          if (!el) return;
          const wrap = el.querySelector('.travaux-date-slider');
          if (!wrap) return;
          const dStr = wrap.getAttribute('data-debut');
          const fStr = wrap.getAttribute('data-fin');
          const safeDate = (v) => {
            const d = v ? new Date(v) : null;
            return d && !isNaN(d.getTime()) ? d : null;
          };
          const d = safeDate(dStr);
          const f = safeDate(fStr);
          const input = wrap.querySelector('input[type="range"]');
          const label = wrap.querySelector('.slider-label');
          if (!d || !f || f.getTime() <= d.getTime()) {
            // Dates invalides -> masquer le contrôle
            wrap.style.display = 'none';
            return;
          }
          // Couleurs selon avancement (0% rouge -> 100% vert)
          const scale = ['#E1002A','#E71922','#ED3319','#F34C11','#F96608','#D08812','#A19225','#729B37','#43A54A','#14AE5C'];
          const colorFromPct = (pct) => {
            const idx = Math.max(0, Math.min(scale.length - 1, Math.round((pct / 100) * (scale.length - 1))));
            return scale[idx];
          };
          const update = () => {
            const pct = Math.max(0, Math.min(100, Number(input.value) || 0));
            const color = colorFromPct(pct);
            // Colorer la piste jusqu'au pourcentage et le pouce
            const gradient = `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #e9eef2 ${pct}%, #e9eef2 100%)`;
            input.style.background = gradient;
            // Colorer le thumb (WebKit/Firefox nécessitent CSS, mais on donne une teinte via filter si supportée)
            input.style.setProperty('--thumb-color', color);
            // Mettre à jour le label et sa position
            if (label) {
              label.textContent = `${pct}%`;
              // Position approx: calc(% - moitié du label)
              label.style.left = `calc(${pct}% - 12px)`;
            }
          };
          input.addEventListener('input', update);
          update();
        } catch (_) { /* silencieux */ }
      });
    }
    
    // Style au survol
    function highlightFeature(e) {
      const layer = e.target;
      layer.setStyle({
        weight: 5,
        color: '#ff0000',
        dashArray: '',
        fillOpacity: 0.7
      });
      
      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
      }
      
      // Mise à jour du panneau latéral si nécessaire
      if (window.updateSidePanel) {
        window.updateSidePanel(feature.properties);
      }
    }

    const isFiltered = Object.keys(FilterModule.get(layerName)).length > 0;
    const detailSupportedLayers = ['voielyonnaise', 'transport', 'urbanisme', 'reseauProjeteSitePropre'];

    // Ajout d'un gestionnaire de clic robuste
    layer.on('click', (e) => {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      
      const projectName = feature.properties.name || feature.properties.line || feature.properties.Name || feature.properties.LIBELLE;
      
      
      if (projectName) {
        // Mise en évidence du projet
        if (window.highlightProjectPath) {
          window.highlightProjectPath(layerName, projectName);
        }
        
        // Déterminer la catégorie
        let category = 'autre';
        if (layerName.includes('voielyonnaise')) category = 'velo';
        else if (layerName.includes('reseauProjete') || layerName.includes('metro') || layerName.includes('tramway')) category = 'transport';
        else if (layerName.includes('urbanisme')) category = 'urbanisme';
        
        
        // Appel direct de la fonction de détail
        if (window.NavigationModule?.showProjectDetail) {
          window.NavigationModule.showProjectDetail(projectName, category, e);
        } else if (window.handleFeatureClick) {
          window.handleFeatureClick(feature, layerName);
        }
      } else {
        console.warn('Projet sans nom détecté:', feature.properties);
      }
    });

    // Ajoute un style de survol si la couche supporte les fiches détails
    if (detailSupportedLayers.includes(layerName)) {
      // Fonction pour animer les pointillés
      const animateDashLine = (layer) => {
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
      };

      layer.on('mouseover', function(e) {
        // Identifier le projet du segment en fonction de la couche
        let currentProjectName;
        if (layerName === 'reseauProjeteSitePropre') {
          currentProjectName = feature.properties.Name || feature.properties.name;
        } else if (layerName === 'voielyonnaise') {
          currentProjectName = feature.properties.line;
        } else {
          currentProjectName = feature.properties.name || feature.properties.Name;
        }

        // Réinitialiser tous les styles de la couche
        geojsonLayer.eachLayer(otherLayer => {
          let otherProjectName;
          if (layerName === 'reseauProjeteSitePropre') {
            otherProjectName = otherLayer.feature.properties.Name || otherLayer.feature.properties.name;
          } else if (layerName === 'voielyonnaise') {
            otherProjectName = otherLayer.feature.properties.line;
          } else {
            otherProjectName = otherLayer.feature.properties.name || otherLayer.feature.properties.Name;
          }

          if (otherProjectName === currentProjectName) {
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
          const html = generateTooltipContent(feature, layerName);
          if (html) {
            closeHoverTooltip();
            window.__gpHoverTooltip = L.tooltip({
              className: 'gp-project-tooltip',
              direction: 'top',
              permanent: false,
              offset: [0, -12],
              opacity: 1,
              interactive: false
            }).setLatLng(e.latlng)
              .setContent(html)
              .addTo(MapModule.map);

            // Suivre la souris tant que l'on reste sur la même feature
            const moveHandler = (ev) => {
              if (window.__gpHoverTooltip) {
                window.__gpHoverTooltip.setLatLng(ev.latlng);
              }
            };
            layer.__gpMoveHandler = moveHandler;
            layer.on('mousemove', moveHandler);
          }
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

      if (!isClickablePath) {
        // Survol avec assombrissement de la couleur, sans changement de poids
        layer.on('mouseover', () => {
          const originalStyle = getFeatureStyle(feature, layerName);
          const darkerColor = darkenColor(originalStyle.color);
          
          safeSetStyle(layer, {
            ...originalStyle,
            color: darkerColor
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


    // Fonction pour animer les pointillés
    const animateDashLine = (layer) => {
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
    };

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
        const otherProjectName = otherLayer.feature.properties.line || otherLayer.feature.properties.name;
        
        if (otherProjectName === projectName) {
          if (typeof otherLayer.setStyle === 'function') {
            otherLayer.setStyle({
              color: 'red',
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
    layer.on('click', () => {
      // 1. Récupérer le nom du projet selon la couche
      let projectName;
      if (layerName === 'voielyonnaise') {
        projectName = feature.properties.line;
      } else if (layerName === 'reseauProjeteSitePropre') {
        projectName = feature.properties.Name;
      } else if (layerName === 'urbanisme') {
        projectName = feature.properties.name;
      } else {
        projectName = feature.properties.name || feature.properties.nom || feature.properties.Name;
      }

      // 2. Préparer le nom d'affichage (ajustement pour Voie Lyonnaise)
      let displayProjectName = projectName;
      if (layerName === 'voielyonnaise') {
        displayProjectName = "Voie Lyonnaise " + projectName;
      }

      // 3. Normalisation avancée du nom du projet
      const normalizedProjectName = displayProjectName
        .trim() // Supprime les espaces en début/fin
        .replace(/\s+/g, ' ') // Remplace les espaces multiples par un seul
        .replace(/[\u00A0\u1680\u2000-\u200D\u202F\u205F\u3000\uFEFF]/g, ' '); // Remplace les espaces insécables par des espaces normaux
      
      // Depuis la migration Markdown, nous laissons NavigationModule gérer l'affichage sans vérifier window.projectDetails


      // 4. Masquer toutes les autres couches
      Object.keys(MapModule.layers).forEach(l => {
        if (l !== layerName) {
          MapModule.removeLayer(l);
        }
      });

      // 5. Déterminer la clé de filtrage en fonction de la couche
      let filterKey;
      if (layerName === 'voielyonnaise') {
        filterKey = 'line';
      } else if (layerName === 'reseauProjeteSitePropre') {
        filterKey = 'Name';
      } else if (layerName === 'urbanisme') {
        filterKey = 'name';
      } else {
        filterKey = 'name';
      }

      // 6. Construire le critère de filtrage en s'assurant que projectName est une chaîne
      const filterCriteria = {};
      if (filterKey && projectName != null) {
        filterCriteria[filterKey] = String(projectName).toLowerCase();
      }

      // 7. Appliquer le filtre sur la couche cliquée
      UIModule.applyFilter(layerName, filterCriteria);

      // 3. Afficher la fiche détail
      UIModule.showDetailPanel(layerName, feature);

      // 4. Mettre en évidence le path du projet
      if (projectName) {
        highlightProjectPath(layerName, projectName);
      }

      UIModule.updateActiveFilterTagsForLayer(layerName);

      // 8. Déterminer la catégorie en fonction de la couche
      let category;
      if (layerName === 'urbanisme') {
        category = 'urbanisme';
      } else if (["planVelo", "amenagementCyclable", "voielyonnaise"].includes(layerName)) {
        category = 'velo';
      } else if (["metroFuniculaire", "tramway", "reseauProjeteSitePropre"].includes(layerName)) {
        category = 'transport';
      } else {
        category = 'transport'; // valeur par défaut
      }

      // 9. Afficher le détail du projet en passant la catégorie appropriée
      const projectDetailPanel = document.getElementById('project-detail');
      projectDetailPanel.dataset.filterLayer = layerName;
      NavigationModule.showProjectDetail(displayProjectName, category);

      // 10. Zoom sur la feature filtrée
      const filteredLayer = MapModule.layers[layerName];
      if (filteredLayer && typeof filteredLayer.getBounds === 'function') {
        const bounds = filteredLayer.getBounds();
        if (bounds && bounds.isValid()) {
          MapModule.map.fitBounds(bounds, { padding: [50, 50] });
        } else {
          console.warn("Les bounds calculés ne sont pas valides.");
        }
      } else {
        console.warn("La couche filtrée ne supporte pas getBounds.");
      }
    });
  }





  // Récupère les données d'une couche avec cache
  async function fetchLayerData(layerName) {
    // Vérification de l'URL
    const url = urlMap[layerName];
    if (!url) {
      throw new Error(`Aucune URL définie pour la couche: ${layerName}`);
    }
    
    // Clé de cache simple
    const cacheKey = `layer_${layerName}`;
    
    // Utilisation du cache
    return simpleCache.get(cacheKey, async () => {
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} sur ${layerName}`);
      }
      
      const data = await response.json();
      return data;
    });
  }


  // --- Création et ajout des couches GeoJSON ---

  // Crée la couche GeoJSON et l'ajoute à la carte
  function createGeoJsonLayer(layerName, data) {
    const criteria = FilterModule.get(layerName);
    
    // Définir les couches cliquables
    const clickableLayers = ['voielyonnaise', 'reseauProjeteSitePropre', 'urbanisme'];
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
        // Exclure tous les points sur l'accueil (aucun marqueur souhaité)
        if (feature && feature.geometry && feature.geometry.type === 'Point') {
          return false;
        }
        // 1. Vérifier les critères de filtrage standards
        const standardCriteriaMatch = Object.entries(criteria)
          .filter(([key]) => !key.startsWith('_')) // Exclure les critères spéciaux (commençant par _)
          .every(([key, value]) => 
            ("" + (feature.properties[key] || "")).toLowerCase() === String(value).toLowerCase()
          );
        
        // 2. Vérifier le filtre des réseaux si activé
        const hideReseaux = criteria._hideReseaux === true;
        if (hideReseaux) {
          const props = feature.properties || {};
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
          if (isLine && MapModule?.hitRenderer && MapModule?.hitPaneName) {
            const hit = L.geoJSON(feature, {
              renderer: MapModule.hitRenderer,
              pane: MapModule.hitPaneName,
              interactive: true,
              bubblingMouseEvents: false,
              style: {
                color: '#000',
                opacity: 0.001,
                weight: 24,
                lineCap: 'round',
                lineJoin: 'round'
              }
            });
            // Add to the same group so removal is automatic with the layer
            hit.addTo(geojsonLayer);

            // Forward pointer events from the hitline to the original visible layer
            const forward = (eventName) => {
              hit.on(eventName, (e) => {
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
            };
            ['click','mouseover','mouseout','mousemove','contextmenu','touchstart','touchend'].forEach(forward);
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
      .then(data => injectImgUrlsToFeatures(layerName, data))
      .then(enrichedData => {
        // Mise à jour des données en mémoire
        layerData[layerName] = enrichedData;

        // Suppression de l'ancienne couche si elle existe
        MapModule.removeLayer(layerName);

        // Création de la nouvelle couche après enrichissement (imgUrl dans properties)
        createGeoJsonLayer(layerName, enrichedData);
        return enrichedData;
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
  function getProjectDetails(projectName, category) {
    if (!projectName) {
      return null;
    }
    
    const normalizedName = projectName.toString().toLowerCase().trim();
    
    // Vérifier que layerData[category] est un tableau
    if (!Array.isArray(layerData[category])) {
      console.warn(`Aucun projet trouvé pour la catégorie: ${category}`, layerData);
      return null;
    }
    
    // Recherche du projet avec correspondance insensible à la casse
    const project = layerData[category].find(p => {
      if (!p || typeof p !== 'object' || !p.name) return false;
      return p.name.toString().toLowerCase().trim() === normalizedName;
    });
    
    if (!project) {
      console.warn(`Projet non trouvé: ${projectName} dans la catégorie ${category}`);
      return null;
    }
    
    return project;
  }

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
    generateTooltipContent,
    openCoverLightbox
  };
})();