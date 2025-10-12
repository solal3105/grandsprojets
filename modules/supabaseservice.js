// modules/supabaseService.js
;(function(win){
  // 1️⃣ Initialise le client Supabase via le global `supabase` chargé par CDN
  const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
 
  // Helper: slugify (réutilisé pour les chemins Storage)
  const slugify = (str) => String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/["'`´]/g, '')
    .replace(/&/g, ' et ')
    .replace(/[^a-zA-Z0-9\s-\/]/g, '')
    .replace(/\s*\/\s*/g, '-')
    .replace(/[-_]+/g, '-')
    .replace(/\s+/g, '-')
    .trim()
    .toLowerCase();

  // Helper: sanitizeCity → retourne '' si la ville n'est pas valide ou vide
  function sanitizeCity(raw) {
    try {
      const v = String(raw || '').toLowerCase().trim();
      // Traiter explicitement 'default' comme absence de ville
      if (v === 'default') return '';
      if (!v) return '';
      // Si un validateur global existe, l'utiliser
      if (typeof win.isValidCity === 'function') {
        return win.isValidCity(v) ? v : '';
      }
      // À défaut, accepter seulement [a-z-] pour éviter les valeurs numériques accidentelles
      return (/^[a-z-]+$/i.test(v)) ? v : '';
    } catch (_) { return ''; }
  }

  // Helper: get active city with delegation to global resolver when available
  const getActiveCity = () => {
    try {
      if (typeof win.getActiveCity === 'function') {
        const v = win.getActiveCity();
        const s = sanitizeCity(v);
        if (s) return s;
      }
      if (win.activeCity && String(win.activeCity).trim()) {
        const s = sanitizeCity(win.activeCity);
        if (s) return s;
      }
      const url = new URL(win.location.href);
      const c = url.searchParams.get('city');
      return sanitizeCity(c);
    } catch (_) { return ''; }
  };

  // 2️⃣ Expose supabaseService sur window
  win.supabaseService = {
    /**
     * Récupère toutes les couches dans la table 'layers'
     * @returns {Promise<Array<{name:string, url:string, style:string, is_default:boolean}>>}
     */
    fetchLayersConfig: async function() {
      // Plus d'exclusions - toutes les couches sont maintenant dans la table layers

      // Récupérer la ville active
      const activeCity = getActiveCity();

      // Construire la requête et filtrer par ville
      let q = supabaseClient
        .from('layers')
        .select('name, url, style, is_default, ville');

      if (activeCity) {
        q = q.eq('ville', activeCity);
      } else {
        // Si aucune ville n'est sélectionnée, on n'affiche que les couches "globales"
        q = q.is('ville', null);
      }

      const { data, error } = await q;

      if (error) {
        return [];
      }

      // A ce stade, on a UNIQUEMENT les couches de la ville active (ou globales si aucune ville),
      // ce qui garantit que les URLs ne réintroduisent pas des couches globales quand une ville est active.
      return (data || [])
        .filter(row => row && row.name)
        .map(row => {
          // Parser le style JSON si c'est une string
          let parsedStyle = row.style;
          if (typeof row.style === 'string') {
            try {
              parsedStyle = JSON.parse(row.style);
            } catch (e) {
              parsedStyle = {};
            }
          }
          
          return {
            name: row.name,
            url: row.url || '',
            style: parsedStyle,
            is_default: row.is_default || false,
            ville: row.ville
          };
        });
    },

    /**
     * Récupère uniquement les styles pour une liste de couches données depuis la table 'layers'.
     * N'inclut PAS les URLs afin d'éviter tout chargement legacy non souhaité.
     * @param {string[]} names - Liste des noms de couches.
     * @returns {Promise<Record<string, any>>} mapping { name: style }
     */
    fetchLayerStylesByNames: async function(names) {
      try {
        if (!Array.isArray(names) || names.length === 0) return {};

        const activeCity = getActiveCity();

        let q = supabaseClient
          .from('layers')
          .select('name, style, ville')
          .in('name', names);

        if (activeCity) {
          // Important: pour les STYLES, on accepte un fallback global (ville IS NULL)
          // afin d'éviter de perdre le style si aucune variante ville n'existe.
          // On ne mélange pas les URL ici, uniquement les styles.
          q = q.or(`ville.eq.${activeCity},ville.is.null`);
        } else {
          q = q.is('ville', null);
        }

        const { data, error } = await q;
        if (error) {
          return {};
        }
        // Si doublons (ville spécifique + global), privilégier la valeur spécifique à la ville
        const out = {};
        (data || []).forEach(row => {
          if (!row || !row.name) return;
          const hasAlready = Object.prototype.hasOwnProperty.call(out, row.name);
          if (!hasAlready) {
            // Première occurrence (peut être globale ou ville)
            out[row.name] = row.style;
          } else {
            // Si l'entrée existante provient du global (inconnu ici), remplacer par la version ville si dispo
            if (row.ville === activeCity) out[row.name] = row.style;
          }
        });
        return out;
      } catch (e) {
        return {};
      }
    },

    /**
     * Récupère les catégories et leurs icônes depuis la table 'category_icons'
     * @returns {Promise<Array<{category:string, icon_class:string, display_order:number, layers_to_display:string[]}>>}
     */
    fetchCategoryIcons: async function() {
      try {
        const activeCity = getActiveCity();

        // Récupérer les catégories spécifiques à la ville ET les fallbacks globaux (ville = '' ou null)
        let q = supabaseClient
          .from('category_icons')
          .select('category, icon_class, display_order, layers_to_display, category_styles, ville')
          .order('display_order', { ascending: true });

        if (activeCity) {
          // Inclure les lignes pour la ville active OU les lignes sans ville (fallback global)
          q = q.or(`ville.eq.${activeCity},ville.eq.,ville.is.null`);
        } else {
          q = q.or('ville.eq.,ville.is.null');
        }

        const { data, error } = await q;

        if (error) {
          console.warn('[supabaseService] fetchCategoryIcons error:', error);
          return [];
        }

        const filtered = (data || []).filter(row => row && row.category);
        
        // Dédupliquer : priorité aux configs spécifiques à la ville sur les fallbacks globaux
        const categoryMap = new Map();
        
        // D'abord, ajouter les fallbacks globaux (ville vide ou null)
        filtered.forEach(row => {
          if (!row.ville || row.ville === '') {
            categoryMap.set(row.category, row);
          }
        });
        
        // Ensuite, écraser avec les configs spécifiques à la ville (priorité)
        filtered.forEach(row => {
          if (row.ville && row.ville !== '') {
            categoryMap.set(row.category, row);
          }
        });
        
        return Array.from(categoryMap.values()).sort((a, b) => a.display_order - b.display_order);
      } catch (e) {
        console.error('[supabaseService] fetchCategoryIcons exception:', e);
        return [];
      }
    },

    /**
     * Construit le mapping catégorie → layers depuis les données de category_icons
     * Le layer de la catégorie elle-même est toujours inclus automatiquement
     * @param {Array<{category:string, layers_to_display:string[]}>} categoryIcons - Données depuis fetchCategoryIcons
     * @returns {Object<string, string[]>} - Ex: { 'mobilite': ['mobilite', 'metro', 'tram'], 'urbanisme': ['urbanisme'] }
     */
    buildCategoryLayersMap: function(categoryIcons) {
      const map = {};
      
      if (!Array.isArray(categoryIcons)) {
        console.warn('[supabaseService] buildCategoryLayersMap: categoryIcons n\'est pas un tableau');
        return map;
      }

      categoryIcons.forEach(cat => {
        if (!cat || !cat.category) return;
        
        const layers = [];
        
        // Toujours inclure le layer de la catégorie elle-même en premier
        layers.push(cat.category);
        
        // Ajouter les layers additionnels depuis layers_to_display (s'ils existent)
        if (Array.isArray(cat.layers_to_display) && cat.layers_to_display.length > 0) {
          cat.layers_to_display.forEach(layerName => {
            // Éviter les doublons (si layers_to_display contient déjà le nom de la catégorie)
            if (layerName !== cat.category && !layers.includes(layerName)) {
              layers.push(layerName);
            }
          });
        }
        
        map[cat.category] = layers;
      });

      return map;
    },

    /**
     * Construit le mapping catégorie → styles depuis les données de category_icons
     * @param {Array<{category:string, category_styles:Object}>} categoryIcons - Données depuis fetchCategoryIcons
     * @returns {Object<string, Object>} - Ex: { 'urbanisme': {fill: true, color: '#3F52F3', ...}, 'mobilite': {color: '#8C368C', ...} }
     */
    buildCategoryStylesMap: function(categoryIcons) {
      const map = {};
      
      if (!Array.isArray(categoryIcons)) {
        console.warn('[supabaseService] buildCategoryStylesMap: categoryIcons n\'est pas un tableau');
        return map;
      }

      categoryIcons.forEach(cat => {
        if (!cat || !cat.category) return;
        
        // Si category_styles existe et n'est pas vide, l'ajouter au mapping
        if (cat.category_styles && typeof cat.category_styles === 'object' && Object.keys(cat.category_styles).length > 0) {
          map[cat.category] = cat.category_styles;
        }
      });

      return map;
    },

    /**
     * Téléverse un PDF de dossier de concertation vers Supabase Storage
     * Bucket: uploads
     * Path:   pdfs/projects/<cat>/<name>-<ts>.pdf
     * @param {File|Blob} file
     * @param {string} categoryLayer
     * @param {string} projectName
     * @param {number} rowId
     * @returns {Promise<string>} publicUrl
     */
    uploadConsultationPdfToStorage: async function(file, categoryLayer, projectName, rowId) {
      try {
        if (!file || !categoryLayer || !projectName) throw new Error('Paramètres manquants');
        const safeCat = slugify(categoryLayer);
        const safeName = slugify(projectName);
        const ts = Date.now();
        const path = `pdfs/projects/${safeCat}/${safeName}-${ts}.pdf`;
        const bucket = 'uploads';
        const contentType = 'application/pdf';
        const { error: upErr } = await supabaseClient
          .storage
          .from(bucket)
          .upload(path, file, { upsert: false, contentType });
        if (upErr) {
          throw upErr;
        }
        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
      } catch (e) {
        throw e;
      }
    },

    /**
     * Liste les contributions avec filtres, recherche, tri et pagination.
     * @param {Object} params
     * @param {string} [params.search] - texte recherché dans project_name/meta/description
     * @param {string} [params.category] - mobilite | urbanisme | velo
     * @param {number} [params.page=1]
     * @param {number} [params.pageSize=10]
     * @param {boolean} [params.mineOnly=true] - limiter aux contributions de l'utilisateur courant
     * @param {string} [params.sortBy='created_at']
     * @param {'asc'|'desc'} [params.sortDir='desc']
     * @returns {Promise<{items:Array, count:number}>}
     */
    listContributions: async function(params) {
      try {
        const {
          search = '',
          category,
          page = 1,
          pageSize = 10,
          mineOnly = true,
          sortBy = 'created_at',
          sortDir = 'desc',
          city
        } = params || {};

        const from = Math.max(0, (page - 1) * pageSize);
        const to = from + Math.max(1, pageSize) - 1;

        let query = supabaseClient
          .from('contribution_uploads')
          .select('id, project_name, category, geojson_url, cover_url, markdown_url, meta, description, approved, created_at, created_by, ville', { count: 'exact' });

        if (category) query = query.eq('category', category);

        const activeCity = sanitizeCity(city) || getActiveCity();
        if (activeCity) {
          query = query.eq('ville', activeCity);
        } else {
          // Si aucune ville active, ne montrer que les projets globaux (ville IS NULL)
          query = query.is('ville', null);
        }

        if (search && search.trim()) {
          const s = search.trim();
          // OR ilike on multiple text columns
          const orExpr = [
            `project_name.ilike.%${s}%`,
            `meta.ilike.%${s}%`,
            `description.ilike.%${s}%`
          ].join(',');
          query = query.or(orExpr);
        }

        if (mineOnly) {
          try {
            const { data: userData } = await supabaseClient.auth.getUser();
            const uid = userData && userData.user ? userData.user.id : null;
            if (uid) query = query.eq('created_by', uid);
          } catch (_) {}
        }

        // Sorting (map 'updated_at' -> 'created_at' and guard allowed columns)
        if (sortBy) {
          const mapped = (sortBy === 'updated_at') ? 'created_at' : sortBy;
          const allowedSorts = ['created_at', 'project_name', 'category', 'id'];
          const orderColumn = allowedSorts.includes(mapped) ? mapped : 'created_at';
          query = query.order(orderColumn, { ascending: (String(sortDir).toLowerCase() === 'asc') });
        }

        // Pagination
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) {
          return { items: [], count: 0 };
        }
        return { items: data || [], count: typeof count === 'number' ? count : (data ? data.length : 0) };
      } catch (e) {
        return { items: [], count: 0 };
      }
    },

    /**
     * Retourne une contribution par son id.
     * @param {number} id
     * @returns {Promise<object|null>}
     */
    getContributionById: async function(id) {
      try {
        if (!id) return null;
        const { data, error } = await supabaseClient
          .from('contribution_uploads')
          .select('*')
          .eq('id', id)
          .single();
        if (error) {
            return null;
        }
        return data || null;
      } catch (e) {
        return null;
      }
    },

    /**
     * Met à jour une contribution. RLS côté base doit contrôler les permissions.
     * @param {number} id
     * @param {Object} patch - champs autorisés: project_name, category, meta, description, geojson_url, cover_url, markdown_url
     * @returns {Promise<{data?:object,error?:any}>}
     */
    updateContribution: async function(id, patch) {
      try {
        if (!id || !patch || typeof patch !== 'object') return { error: new Error('invalid args') };
        // Sanitize fields
        const allowed = ['project_name', 'category', 'meta', 'description', 'geojson_url', 'cover_url', 'markdown_url', 'ville', 'official_url'];
        const body = {};
        allowed.forEach(k => { if (patch[k] !== undefined) body[k] = patch[k]; });
        if (Object.keys(body).length === 0) return { data: null };
        const { data, error } = await supabaseClient
          .from('contribution_uploads')
          .update(body)
          .eq('id', id)
          .select('*')
          .single();
        if (error) {
          return { error };
        }
        return { data };
      } catch (e) {
        return { error: e };
      }
    },

    /**
     * Met à jour le statut d'approbation d'une contribution (admin uniquement côté UI; RLS doit le faire respecter côté DB).
     * @param {number} id
     * @param {boolean} approved
     * @returns {Promise<{data?:object,error?:any}>}
     */
    setContributionApproved: async function(id, approved) {
      try {
        if (!id || typeof approved !== 'boolean') return { error: new Error('invalid args') };
        const { data, error } = await supabaseClient
          .from('contribution_uploads')
          .update({ approved })
          .eq('id', id)
          .select('id, approved')
          .single();
        if (error) {
          return { error };
        }
        return { data };
      } catch (e) {
        return { error: e };
      }
    },

    /**
     * Supprime une contribution et nettoie les éléments associés:
     * - Fichiers Storage (geojson/cover/markdown) dans le bucket 'uploads'
     * - Dossiers de concertation liés au project_name
     * - Ligne dans contribution_uploads
     * RLS/Storage doivent autoriser la suppression pour les utilisateurs authentifiés.
     * @param {number} id
     * @returns {Promise<{success:boolean, error?:any}>}
     */
    deleteContribution: async function(id) {
      try {
        if (!id) return { success: false, error: new Error('invalid id') };

        // 1) Récupérer la ligne pour connaître project_name et URLs
        const row = await this.getContributionById(id);
        if (!row) return { success: false, error: new Error('not found') };

        const urls = [row.geojson_url, row.cover_url, row.markdown_url].filter(Boolean);
        const bucket = 'uploads';

        // Helper: extraire le chemin Storage à partir d'une URL publique
        const toStoragePath = (url) => {
          try {
            if (!url) return null;
            const marker = '/object/public/';
            const i = url.indexOf(marker);
            if (i === -1) return null;
            const after = url.slice(i + marker.length); // e.g. 'uploads/geojson/projects/...'
            const prefix = 'uploads/';
            return after.startsWith(prefix) ? after.slice(prefix.length) : null; // path relative to bucket
          } catch (_) {
            return null;
          }
        };

        // 2) Supprimer les fichiers Storage s'ils existent
        const paths = urls.map(toStoragePath).filter(Boolean);
        if (paths.length) {
          try {
            const { data: remData, error: remErr } = await supabaseClient
              .storage
              .from(bucket)
              .remove(paths);
          } catch (remEx) {
          }
        }

        // 3) Supprimer les dossiers de concertation liés (par nom exact)
        try {
          const { error: delDocErr } = await supabaseClient
            .from('consultation_dossiers')
            .delete()
            .eq('project_name', row.project_name);
        } catch (docEx) {
        }

        // 4) Supprimer la ligne principale
        const { error: delErr } = await supabaseClient
          .from('contribution_uploads')
          .delete()
          .eq('id', id);
        if (delErr) {
          return { success: false, error: delErr };
        }

        return { success: true };
      } catch (e) {
        return { success: false, error: e };
      }
    },

    /**
     * Récupère la config des couleurs métro
     * @returns {Promise<Record<string,string>>} ex : { A: '#F15A24', B: '#8C368C', … }
     */
    fetchMetroColors: async function() {
      const { data, error } = await supabaseClient
        .from('metro_colors')
        .select('ligne, color');
      if (error) {
        return {};
      }
      // Normaliser les clés en MAJUSCULE pour simplifier la résolution côté front
      return (data || []).reduce((acc, { ligne, color }) => {
        const key = String(ligne ?? '').trim().toUpperCase();
        if (key) acc[key] = color;
        return acc;
      }, {});
    },

    // fetchMobilityData: removed (legacy). Mobility catalog table is no longer consumed by the UI.

    /**
     * Récupère le mapping projet → URL de fiche
     * @returns {Promise<Record<string,string>>}
     */
    fetchProjectPages: async function() {
      const { data, error } = await supabaseClient
        .from('project_pages')
        .select('project_name, page_url');
      if (error) {
        return {};
      }
      return data.reduce((acc, { project_name, page_url }) => {
        acc[project_name] = page_url;
        return acc;
      }, {});
    },


    /**
     * Récupère tous les projets depuis contribution_uploads
     * @returns {Promise<Array<{project_name:string, category:string, geojson_url:string, cover_url:string, markdown_url:string, meta:string, description:string}>>}
     */
    fetchAllProjects: async function() {
      const activeCity = getActiveCity();
      let q = supabaseClient
        .from('contribution_uploads')
        .select('project_name, category, geojson_url, cover_url, markdown_url, meta, description, ville')
        .order('created_at', { ascending: false });
      try {
        const { data: userData } = await supabaseClient.auth.getUser();
        const uid = userData && userData.user ? userData.user.id : null;
        if (uid) {
          q = q.or(`approved.eq.true,created_by.eq.${uid}`);
        } else {
          q = q.eq('approved', true);
        }
      } catch(_) {
        q = q.eq('approved', true);
      }
      if (activeCity) {
        q = q.eq('ville', activeCity);
      } else {
        // Pas de ville sélectionnée → projets globaux uniquement
        q = q.is('ville', null);
      }
      const { data, error } = await q;
      if (error) {
        return [];
      }
      return data; 
    },

    /**
     * Récupère les projets par catégorie depuis contribution_uploads
     * @param {string} category - La catégorie de projets à récupérer
     * @returns {Promise<Array<{project_name:string, category:string, geojson_url:string, cover_url:string, markdown_url:string, meta:string, description:string}>>}
     */
    fetchProjectsByCategory: async function(category) {
      const activeCity = getActiveCity();
      let q = supabaseClient
        .from('contribution_uploads')
        .select('project_name, category, geojson_url, cover_url, markdown_url, meta, description, ville')
        .eq('category', category)
        .order('created_at', { ascending: false });
      try {
        const { data: userData } = await supabaseClient.auth.getUser();
        const uid = userData && userData.user ? userData.user.id : null;
        if (uid) {
          q = q.or(`approved.eq.true,created_by.eq.${uid}`);
        } else {
          q = q.eq('approved', true);
        }
      } catch(_) {
        q = q.eq('approved', true);
      }
      if (activeCity) {
        q = q.eq('ville', activeCity);
      } else {
        q = q.is('ville', null);
      }
      const { data, error } = await q;
      if (error) {
        console.error('fetchProjectsByCategory error:', error);
        return [];
      }
      return data; 
    },

    /**
     * Récupère un projet par catégorie ET nom exact (strict, sans normalisation)
     * @param {string} category
     * @param {string} projectName
     * @returns {Promise<Object|null>}
     */
    fetchProjectByCategoryAndName: async function(category, projectName) {
      try {
        if (!category || !projectName) return null;
        let q = supabaseClient
          .from('contribution_uploads')
          .select('project_name, category, geojson_url, cover_url, markdown_url, meta, description, official_url')
          .eq('category', category)
          .eq('project_name', projectName)
          .limit(1);
        try {
          const { data: userData } = await supabaseClient.auth.getUser();
          const uid = userData && userData.user ? userData.user.id : null;
          if (uid) {
            q = q.or(`approved.eq.true,created_by.eq.${uid}`);
          } else {
            q = q.eq('approved', true);
          }
        } catch(_) {
          q = q.eq('approved', true);
        }
        const { data, error } = await q.maybeSingle();
        if (error) {
          console.warn('[supabaseService] fetchProjectByCategoryAndName error:', error);
          return null;
        }
        return data || null;
      } catch (e) {
        console.warn('[supabaseService] fetchProjectByCategoryAndName exception:', e);
        return null;
      }
    },

    /**
     * Charge les données GeoJSON depuis les URLs stockées dans contribution_uploads
     * et les fusionne avec les couches existantes
     * @param {string} layerName - Nom de la couche cible
     * @param {string} category - Catégorie des projets à charger
     * @returns {Promise<Object>} - Données GeoJSON fusionnées
     */
    loadContributionGeoJSON: async function(layerName, category, options) {
      try {
        const opts = options || {};
        const normalize = (str) => String(str || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '')
          .trim();

        // 1) Récupérer les projets de la catégorie
        let projects = await this.fetchProjectsByCategory(category);

        // 1.a Filtrage au niveau projet si projectName fourni (réduit le nombre de fetch)
        if (opts.projectName) {
          const target = normalize(opts.projectName);
          projects = projects.filter(p => normalize(p.project_name) === target);
        }

        const geojsonFeatures = [];

        // 2) Charger chaque GeoJSON en parallèle
        const loadPromises = projects
          .filter(project => project.geojson_url)
          .map(async (project) => {
            try {
              const response = await fetch(project.geojson_url);
              if (!response.ok) {
                console.warn(`Impossible de charger le GeoJSON pour ${project.project_name}:`, response.status);
                return null;
              }
              const geojson = await response.json();

              // Ajouter les métadonnées du projet aux features
              if (geojson.type === 'FeatureCollection' && geojson.features) {
                geojson.features.forEach(feature => {
                  if (!feature.properties) feature.properties = {};
                  feature.properties.project_name = project.project_name;
                  feature.properties.category = project.category;
                  feature.properties.cover_url = project.cover_url;
                  feature.properties.markdown_url = project.markdown_url;
                  feature.properties.meta = project.meta;
                  feature.properties.description = project.description;
                });
                return geojson.features;
              } else if (geojson.type === 'Feature') {
                if (!geojson.properties) geojson.properties = {};
                geojson.properties.project_name = project.project_name;
                geojson.properties.category = project.category;
                geojson.properties.cover_url = project.cover_url;
                geojson.properties.markdown_url = project.markdown_url;
                geojson.properties.meta = project.meta;
                geojson.properties.description = project.description;
                return [geojson];
              }
              return null;
            } catch (error) {
              console.error(`Erreur lors du chargement du GeoJSON pour ${project.project_name}:`, error);
              return null;
            }
          });

        const results = await Promise.all(loadPromises);
        results.forEach(features => {
          if (features) geojsonFeatures.push(...features);
        });

        // 3) Filtrage au niveau feature
        let filtered = geojsonFeatures;
        // 3.a Par nom de projet (fallback/garantie)
        if (opts.projectName) {
          const targetProj = normalize(opts.projectName);
          const before = filtered.length;
          filtered = filtered.filter(f => {
            const props = (f && f.properties) ? f.properties : {};
            const candidate = normalize(props.project_name || props.name || props.nom || props.Name || props.NOM || '');
            return candidate === targetProj;
          });
          if (before !== filtered.length) {
            try { console.debug(`[supabaseService] projectName filter applied: ${filtered.length}/${before}`); } catch(_) {}
          }
        }

        // 3.b Par clé/valeur
        if (opts.filterKey && (opts.filterValue !== undefined && opts.filterValue !== null)) {
          const normKey = normalize(String(opts.filterKey)).replace(/\s+/g, '');
          const normVal = normalize(String(opts.filterValue)).replace(/\s+/g, '');
          filtered = filtered.filter(f => {
            const props = (f && f.properties) ? f.properties : {};
            const matchedKey = Object.keys(props).find(k => normalize(k).replace(/\s+/g, '') === normKey) || (Object.prototype.hasOwnProperty.call(props, opts.filterKey) ? opts.filterKey : null);
            if (!matchedKey) return false;
            const v = props[matchedKey];
            if (v === undefined || v === null) return false;
            return normalize(String(v)).replace(/\s+/g, '') === normVal;
          });
        }

        return {
          type: 'FeatureCollection',
          features: filtered
        };
      } catch (error) {
        console.error('loadContributionGeoJSON error:', error);
        return {
          type: 'FeatureCollection',
          features: []
        };
      }
    },

    /**
     * Récupère les items de filtres depuis filter_items pour les labels et icônes
     * @returns {Promise<Array>}
     */
    fetchFilterItems: async function() {
      const activeCity = getActiveCity();
      let q = supabaseClient
        .from('filter_items')
        .select('id, layer, icon, label');
      
      if (activeCity) {
        // Joindre avec layers pour filtrer par ville
        const { data: layerRows, error: layerErr } = await supabaseClient
          .from('layers')
          .select('name, ville')
          .eq('ville', activeCity);
        
        if (layerErr) {
          console.error('[supabaseService] fetchFilterItems layers error:', layerErr);
          const { data, error } = await q;
          return error ? [] : (data || []);
        }
        
        const allowedLayers = new Set((layerRows || []).map(r => r.name).filter(Boolean));
        const { data, error } = await q;
        if (error) {
          console.error('[supabaseService] fetchFilterItems error:', error);
          return [];
        }
        return (data || []).filter(item => allowedLayers.has(item.layer));
      } else {
        const { data, error } = await q;
        if (error) {
          console.error('[supabaseService] fetchFilterItems error:', error);
          return [];
        }
        return data || [];
      }
    },
    
    // fetchProjectFilterMapping: removed (legacy). Filtering relies on filter_categories/filter_items and GeoJSON properties.

    // fetchProjectColors: removed (legacy). Project colors are not used by the UI anymore.


    // (legacy retiré) fetchLayerInfoConfig supprimée: l'UI et les tooltips utilisent désormais uniquement les propriétés du GeoJSON

    /**
     * (legacy retiré) Ancienne résolution d'URL GrandLyon supprimée.
     */

    /**
     * (legacy retiré) Ancienne résolution d'URL Sytral supprimée.
     */

    // (Auth helpers migrated to modules/auth.js)

    /**
     * Récupère la liste des fonds de carte depuis Supabase.
     * @returns {Promise<Array<{name:string,url:string,attribution:string,label:string}>>}
     */
    fetchBasemaps: async function() {
      const { data, error } = await supabaseClient
        .from('basemaps')
        .select('*');
      if (error) {
        console.error('[supabaseService] ❌ fetchBasemaps error:', error);
        return [];
      }
      return data;
    },

    /**
     * Récupère les infos de branding pour une ville donnée.
     * Table: public.city_branding(ville, brand_name, logo_url, dark_logo_url, favicon_url)
     * @param {string} ville
     * @returns {Promise<{ville:string,brand_name?:string,logo_url:string,dark_logo_url?:string,favicon_url?:string}|null>}
     */
    getCityBranding: async function(ville) {
      try {
        const v = String(ville || '').trim();
        if (!v) return null;
        const { data, error } = await supabaseClient
          .from('city_branding')
          .select('ville, brand_name, logo_url, dark_logo_url, favicon_url, center_lat, center_lng, zoom')
          .eq('ville', v)
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('[supabaseService] getCityBranding error:', error);
          return null;
        }
        return data || null;
      } catch (e) {
        console.warn('[supabaseService] getCityBranding exception:', e);
        return null;
      }
    },

    /**
     * Retourne la liste des villes valides (distinctes) depuis la base.
     * Source principale: city_branding.ville
     * Fallback: union de layers.ville et contribution_uploads.ville
     * @returns {Promise<string[]>}
     */
    getValidCities: async function() {
      try {
        const norm = (v) => String(v || '').toLowerCase().trim();
        const set = new Set();

        // 1) Source principale: city_branding
        try {
          const { data, error } = await supabaseClient
            .from('city_branding')
            .select('ville');
          if (!error && Array.isArray(data)) {
            data.forEach(r => { const v = norm(r && r.ville); if (v) set.add(v); });
          } else if (error) {
            console.warn('[supabaseService] getValidCities city_branding error:', error);
          }
        } catch (e1) {
          console.warn('[supabaseService] getValidCities city_branding exception:', e1);
        }

        // 2) Fallback: layers.ville
        try {
          const { data, error } = await supabaseClient
            .from('layers')
            .select('ville');
          if (!error && Array.isArray(data)) {
            data.forEach(r => { const v = norm(r && r.ville); if (v) set.add(v); });
          } else if (error) {
            console.warn('[supabaseService] getValidCities layers error:', error);
          }
        } catch (e2) {
          console.warn('[supabaseService] getValidCities layers exception:', e2);
        }

        // 3) Fallback: contribution_uploads.ville
        try {
          const { data, error } = await supabaseClient
            .from('contribution_uploads')
            .select('ville');
          if (!error && Array.isArray(data)) {
            data.forEach(r => { const v = norm(r && r.ville); if (v) set.add(v); });
          } else if (error) {
            console.warn('[supabaseService] getValidCities contribution_uploads error:', error);
          }
        } catch (e3) {
          console.warn('[supabaseService] getValidCities contribution_uploads exception:', e3);
        }

        return Array.from(set);
      } catch (e) {
        console.warn('[supabaseService] getValidCities exception (global):', e);
        return [];
      }
    },

    /**
     * Retourne les dossiers de concertation pour un projet donné.
     * Ne commence pas par "fetch" pour éviter l'appel automatique dans initAllData.
     * @param {string} projectName
     * @returns {Promise<Array<{title:string, pdf_url:string, project_name:string}>>}
     */
    getConsultationDossiersByProject: async function(projectName) {
      try {
        if (!projectName) return [];
        // Strict only: exact equality on project_name
        const q = await supabaseClient
          .from('consultation_dossiers')
          .select('id, title, pdf_url, project_name')
          .eq('project_name', projectName)
          .order('title', { ascending: true });
        if (q.error) {
          console.error('[supabaseService] ❌ getConsultationDossiersByProject exact error:', q.error);
          return [];
        }
        return Array.isArray(q.data) ? q.data : [];
      } catch (e) {
        console.error('[supabaseService] ❌ getConsultationDossiersByProject exception:', e);
        return [];
      }
    },

    /**
     * Met à jour le titre d'un dossier de concertation.
     * @param {number|string} id
     * @param {string} newTitle
     * @returns {Promise<boolean>}
     */
    updateConsultationDossierTitle: async function(id, newTitle) {
      try {
        if (!id) throw new Error('id requis');
        const { error } = await supabaseClient
          .from('consultation_dossiers')
          .update({ title: newTitle })
          .eq('id', id);
        if (error) { console.error('[supabaseService] updateConsultationDossierTitle error:', error); return false; }
        return true;
      } catch (e) {
        console.error('[supabaseService] updateConsultationDossierTitle exception:', e);
        return false;
      }
    },

    /**
     * Supprime un dossier de concertation par id.
     * @param {number|string} id
     * @returns {Promise<boolean>}
     */
    deleteConsultationDossier: async function(id) {
      try {
        if (!id) throw new Error('id requis');
        const { error } = await supabaseClient
          .from('consultation_dossiers')
          .delete()
          .eq('id', id);
        if (error) { console.error('[supabaseService] deleteConsultationDossier error:', error); return false; }
        return true;
      } catch (e) {
        console.error('[supabaseService] deleteConsultationDossier exception:', e);
        return false;
      }
    },

    /**
     * Met à jour l'URL (pdf_url) d'un dossier de concertation.
     * @param {number|string} id
     * @param {string} newUrl
     * @returns {Promise<boolean>}
     */
    updateConsultationDossierUrl: async function(id, newUrl) {
      try {
        if (!id) throw new Error('id requis');
        const { error } = await supabaseClient
          .from('consultation_dossiers')
          .update({ pdf_url: newUrl })
          .eq('id', id);
        if (error) { console.error('[supabaseService] updateConsultationDossierUrl error:', error); return false; }
        return true;
      } catch (e) {
        console.error('[supabaseService] updateConsultationDossierUrl exception:', e);
        return false;
      }
    },

    /**
     * Upload d'un PDF de concertation dans Storage et retourne son URL publique.
     * @param {File|Blob} file - PDF
     * @param {string} projectName
     * @returns {Promise<string>} publicUrl
     */
    uploadConsultationPdf: async function(file, projectName) {
      try {
        if (!file || !projectName) throw new Error('Paramètres manquants');
        const lower = (file.name || '').toLowerCase();
        const ext = lower.endsWith('.pdf') ? '.pdf' : '.pdf';
        const contentType = 'application/pdf';
        const safeName = slugify(projectName || 'projet');
        const ts = Date.now();
        const path = `docs/consultation/${safeName}-${ts}${ext}`;
        const bucket = 'uploads';
        const { error: upErr } = await supabaseClient
          .storage
          .from(bucket)
          .upload(path, file, { upsert: false, contentType });
        if (upErr) { console.error('[supabaseService] uploadConsultationPdf error:', upErr); throw upErr; }
        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
      } catch (e) {
        console.error('[supabaseService] uploadConsultationPdf exception:', e);
        throw e;
      }
    },

    /**
     * Upload d'un fichier GeoJSON dans le bucket Storage 'uploads' et retourne son URL publique.
     * Le chemin est dérivé de la catégorie et d'un slug du nom de projet.
     * @param {File|Blob} file
     * @param {string} categoryLayer - mobilite | urbanisme | velo
     * @param {string} projectName
     * @param {number} rowId
     * @returns {Promise<string>} publicUrl
     */
    uploadGeoJSONToStorage: async function(file, categoryLayer, projectName, rowId) {
      try {
        if (!file || !categoryLayer || !projectName) throw new Error('Paramètres manquants');
        const safeCat = slugify(categoryLayer);
        const safeName = slugify(projectName);
        const ts = Date.now();
        const path = `geojson/projects/${safeCat}/${safeName}-${ts}.geojson`;
        const bucket = 'uploads';
        const { error: upErr } = await supabaseClient
          .storage
          .from(bucket)
          .upload(path, file, { upsert: false, contentType: 'application/geo+json' });
        if (upErr) {
          console.error('[supabaseService] uploadGeoJSONToStorage error:', upErr);
          throw upErr;
        }
        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        // Log applicatif minimal: renseigne geojson_url
        try {
          if (win.supabaseService && typeof win.supabaseService.logContributionUpload === 'function') {
            await win.supabaseService.logContributionUpload(projectName, categoryLayer, data.publicUrl, 'geojson', rowId);
          }
        } catch (logErr) {
          console.warn('[supabaseService] logContributionUpload (geojson) warning:', logErr);
        }
        return data.publicUrl;
      } catch (e) {
        console.error('[supabaseService] uploadGeoJSONToStorage exception:', e);
        throw e;
      }
    },

    /**
     * Upload d'une image de cover dans le bucket Storage 'uploads' et retourne son URL publique.
     * Le chemin est dérivé de la catégorie et d'un slug du nom de projet.
     * @param {File|Blob} file
     * @param {string} categoryLayer - mobilite | urbanisme | velo
     * @param {string} projectName
     * @returns {Promise<string>} publicUrl
     */
    uploadCoverToStorage: async function(file, categoryLayer, projectName, rowId) {
      try {
        if (!file || !categoryLayer || !projectName) throw new Error('Paramètres manquants');
        const safeCat = slugify(categoryLayer);
        const safeName = slugify(projectName);

        // Déterminer l'extension à partir du nom/type de fichier
        const lower = (file.name || '').toLowerCase();
        const ext = (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
          ? '.jpg'
          : (lower.endsWith('.webp') ? '.webp' : '.png'); // éviter svg pour sécurité
        const contentType = (file.type && file.type.startsWith('image/'))
          ? file.type
          : ({ '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' })[ext];

        const ts = Date.now();
        const path = `img/cover/${safeCat}/${safeName}-${ts}${ext}`;
        const bucket = 'uploads';

        const { error: upErr } = await supabaseClient
          .storage
          .from(bucket)
          .upload(path, file, { upsert: false, contentType });
        if (upErr) {
          console.error('[supabaseService] uploadCoverToStorage error:', upErr);
          throw upErr;
        }

        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        try {
          if (win.supabaseService && typeof win.supabaseService.logContributionUpload === 'function') {
            await win.supabaseService.logContributionUpload(projectName, categoryLayer, data.publicUrl, 'cover', rowId);
          }
        } catch (logErr) {
          console.warn('[supabaseService] logContributionUpload (cover) warning:', logErr);
        }
        return data.publicUrl;
      } catch (e) {
        console.error('[supabaseService] uploadCoverToStorage exception:', e);
        throw e;
      }
    },

    /**
     * (legacy retiré) Ancien upsert de lien GrandLyon supprimé.
     */

    /**
     * (legacy retiré) Ancien upsert de lien Sytral supprimé.
     */

    /**
     * Récupère les documents de consultation pour un projet.
     * @param {string} projectName
     * @param {string|null} category - optionnel, pour filtrer par catégorie
     * @returns {Promise<Array>}
     */
    fetchConsultationDossiers: async function(projectName, category = null) {
      try {
        if (!projectName) return [];
        let query = supabaseClient
          .from('consultation_dossiers')
          .select('id, project_name, category, title, pdf_url')
          .eq('project_name', projectName)
          .order('id', { ascending: true });
        
        if (category) {
          query = query.eq('category', category);
        }
        
        const { data, error } = await query;
        if (error) {
          console.warn('[supabaseService] fetchConsultationDossiers error:', error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.warn('[supabaseService] fetchConsultationDossiers exception:', e);
        return [];
      }
    },

    /**
     * Insère plusieurs lignes de consultation_dossiers (dossiers de concertation).
     * @param {string} projectName
     * @param {string} category
     * @param {Array<{title:string,pdf_url:string}>} docs
     */
    insertConsultationDossiers: async function(projectName, category, docs) {
      try {
        if (!projectName || !category || !Array.isArray(docs) || !docs.length) return { error: null };
        const rows = docs
          .filter(d => d && d.title && d.pdf_url)
          .map(d => ({ project_name: projectName, category, title: d.title, pdf_url: d.pdf_url }));
        if (!rows.length) return { error: null };
        const { error } = await supabaseClient
          .from('consultation_dossiers')
          .insert(rows);
        if (error) {
          console.warn('[supabaseService] insertConsultationDossiers insert error:', error);
        }
        return { error: null };
      } catch (e) {
        console.warn('[supabaseService] insertConsultationDossiers exception:', e);
        return { error: e };
      }
    },

    /**
     * Crée la ligne contribution (une seule par soumission) et retourne son id.
     * Remplit created_by avec l'UUID de l'utilisateur connecté.
     * @param {string} projectName
     * @param {string} category
     * @param {string|null} city - code collectivité (peut être null)
     * @param {string} [meta]
     * @param {string} [description]
     * @param {string} [officialUrl]
     */
    createContributionRow: async function(projectName, category, city, meta, description, officialUrl) {
      try {
        if (!projectName || !category) throw new Error('Paramètres manquants');
        let createdBy = null;
        try {
          const { data: userData } = await supabaseClient.auth.getUser();
          if (userData && userData.user) createdBy = userData.user.id;
        } catch (_) {}
        const baseRow = {
          project_name: projectName,
          category,
          ville: (function(){
            const s = sanitizeCity(city);
            return s ? s : null;
          })(),
          meta: (meta && meta.trim()) ? meta.trim() : null,
          description: (description && description.trim()) ? description.trim() : null,
          official_url: (officialUrl && officialUrl.trim()) ? officialUrl.trim() : null
        };
        if (createdBy) baseRow.created_by = createdBy;
        const { data, error } = await supabaseClient
          .from('contribution_uploads')
          .insert(baseRow)
          .select('id')
          .single();
        if (error) {
          console.warn('[supabaseService] createContributionRow insert error:', error);
          throw error;
        }
        return data?.id;
      } catch (e) {
        console.warn('[supabaseService] createContributionRow exception:', e);
        throw e;
      }
    },

    /**
     * Liste des villes distinctes présentes dans la base pour alimenter le sélecteur.
     * Source: contribution_uploads.ville (filtrées, non null/non vide), dédupliquées côté client.
     * @returns {Promise<string[]>}
     */
    listCities: async function() {
      try {
        const { data, error } = await supabaseClient
          .from('contribution_uploads')
          .select('ville');
        if (error) {
          console.warn('[supabaseService] listCities error:', error);
          return [];
        }
        const vals = Array.isArray(data) ? data.map(r => (r && r.ville ? String(r.ville).trim() : '')) : [];
        const uniq = Array.from(new Set(vals.filter(v => !!v)));
        // tri alpha pour UX stable
        uniq.sort((a,b) => a.localeCompare(b));
        return uniq;
      } catch (e) {
        console.warn('[supabaseService] listCities exception:', e);
        return [];
      }
    },

    /**
     * Journalise une contribution dans 'contribution_uploads' en remplissant directement
     * geojson_url ou cover_url, et en rattachant l'UUID de l'utilisateur connecté dans created_by.
     * Si rowId est fourni, effectue un UPDATE de cette ligne (une seule ligne par contribution).
     * @param {string} projectName
     * @param {string} category
     * @param {string} url
     * @param {'geojson'|'cover'|'markdown'} kind
     * @param {number} [rowId]
     */
    logContributionUpload: async function(projectName, category, url, kind, rowId) {
      try {
        if (!rowId) {
          const err = new Error('rowId required');
          console.warn('[supabaseService] logContributionUpload:', err.message);
          return { error: err };
        }
        if (!url || !kind) return { error: null };

        const patch = (kind === 'geojson')
          ? { geojson_url: url }
          : (kind === 'cover')
            ? { cover_url: url }
            : (kind === 'markdown')
              ? { markdown_url: url }
              : null;
        if (!patch) return { error: null };

        const { data, error } = await supabaseClient
          .from('contribution_uploads')
          .update(patch)
          .eq('id', rowId)
          .select('id');
        if (error) {
          console.warn('[supabaseService] logContributionUpload update error:', error);
          return { error };
        }
        return { data, error: null };
      } catch (e) {
        console.warn('[supabaseService] logContributionUpload exception:', e);
        return { error: e };
      }
    },

    /**
     * Upload d'un contenu Markdown dans le bucket Storage 'uploads' et retourne son URL publique.
     * Le chemin est dérivé de la catégorie et d'un slug du nom de projet.
     * @param {File|Blob} fileOrBlob
     * @param {string} categoryLayer - mobilite | urbanisme | velo
     * @param {string} projectName
     * @param {number} rowId
     * @returns {Promise<string>} publicUrl
     */
    uploadMarkdownToStorage: async function(fileOrBlob, categoryLayer, projectName, rowId) {
      try {
        if (!fileOrBlob || !categoryLayer || !projectName) throw new Error('Paramètres manquants');
        const safeCat = slugify(categoryLayer);
        const safeName = slugify(projectName);
        const ts = Date.now();
        const path = `md/projects/${safeCat}/${safeName}-${ts}.md`;
        const bucket = 'uploads';
        const { error: upErr } = await supabaseClient
          .storage
          .from(bucket)
          .upload(path, fileOrBlob, { upsert: false, contentType: 'text/markdown' });
        if (upErr) {
          console.error('[supabaseService] uploadMarkdownToStorage error:', upErr);
          throw upErr;
        }
        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        try {
          if (win.supabaseService && typeof win.supabaseService.logContributionUpload === 'function') {
            await win.supabaseService.logContributionUpload(projectName, categoryLayer, data.publicUrl, 'markdown', rowId);
          }
        } catch (logErr) {
          console.warn('[supabaseService] logContributionUpload (markdown) warning:', logErr);
        }
        return data.publicUrl;
      } catch (e) {
        console.error('[supabaseService] uploadMarkdownToStorage exception:', e);
        throw e;
      }
    },

    /**
     * Met à jour les champs meta et description sur la ligne de contribution.
     * Les champs vides/indéfinis ne sont pas patchés.
     * @param {number} rowId
     * @param {string} [meta]
     * @param {string} [description]
     * @returns {Promise<{error:null|any}>}
     */
    updateContributionMeta: async function(rowId, meta, description) {
      try {
        if (!rowId) return { error: new Error('rowId required') };
        const patch = {};
        if (meta && meta.trim()) patch.meta = meta.trim();
        if (description && description.trim()) patch.description = description.trim();
        if (Object.keys(patch).length === 0) return { error: null };
        const { error } = await supabaseClient
          .from('contribution_uploads')
          .update(patch)
          .eq('id', rowId);
        if (error) console.warn('[supabaseService] updateContributionMeta update error:', error);
        return { error: null };
      } catch (e) {
        console.warn('[supabaseService] updateContributionMeta exception:', e);
        return { error: e };
      }
    },


    /**
     * Charge toutes les données fetch* en parallèle,
     * injecte window.<nom> et retourne un objet agrégé (ex: { layersConfig, metroColors, mobilityData, filtersConfig, basemaps, ... }).
     * Note: projectPages (legacy) n'est plus chargé automatiquement.
     * @returns {Promise<Record<string, any>>}
     */
    initAllData: async function() {
      const svc = this;
      // 1️⃣ repérer toutes les méthodes commençant par 'fetch' (sauf celles à exclure de l'auto-chargement)
      const fetchers = Object
        .entries(svc)
        .filter(([key, fn]) => key.startsWith('fetch') && typeof fn === 'function')
        // Exclure les fetchers non nécessaires au démarrage
        .filter(([key]) => !['fetchUrbanismeProjects', 'fetchMobiliteProjects', 'fetchVoielyonnaiseProjects', 'fetchAllProjects', 'fetchProjectsByCategory', 'fetchProjectByCategoryAndName', 'fetchProjectPages'].includes(key));

      // 2️⃣ appeler tous les fetchers en parallèle
      const results = await Promise.all(
        fetchers.map(([_, fn]) => fn.call(svc))
      );

      // 3️⃣ construire l'objet de retour et injecter sur window
      const out = {};
      fetchers.forEach(([key], i) => {
        // map 'fetchLayersConfig' → 'layersConfig'
        let prop;
        switch(key) {
          case 'fetchLayersConfig': prop = 'layersConfig'; break;
          case 'fetchMetroColors':   prop = 'metroColors';   break;
          case 'fetchProjectPages':  prop = 'projectPages';  break;
          case 'fetchBasemaps':             prop = 'basemaps';             break;
          default:
            const name = key.replace(/^fetch/, '');
            prop = name[0].toLowerCase() + name.slice(1);
        }
        out[prop] = results[i];
        window[prop] = results[i];
      });
      return out;
    },

    /**
     * Expose le client Supabase pour usage interne
     * @returns {Object} Client Supabase
     */
    getClient() {
      return supabaseClient;
    },

    // ==================== CRUD pour category_icons ====================

    /**
     * Crée une nouvelle catégorie dans category_icons
     * @param {Object} categoryData - {category, icon_class, display_order, ville}
     * @returns {Promise<{success:boolean, data?:Object, error?:string}>}
     */
    async createCategoryIcon(categoryData) {
      try {
        const { category, icon_class, display_order, ville, layers_to_display, category_styles } = categoryData;
        if (!category || !icon_class || !ville) {
          return { success: false, error: 'Champs requis manquants' };
        }

        const insertData = {
          category: String(category).toLowerCase().trim(),
          icon_class: String(icon_class).trim(),
          display_order: parseInt(display_order) || 100,
          ville: String(ville).toLowerCase().trim()
        };

        // Ajouter layers_to_display si fourni
        if (Array.isArray(layers_to_display)) {
          insertData.layers_to_display = layers_to_display;
        }

        // Ajouter category_styles si fourni
        if (category_styles && typeof category_styles === 'object') {
          insertData.category_styles = category_styles;
        }

        const { data, error } = await supabaseClient
          .from('category_icons')
          .insert([insertData])
          .select()
          .single();

        if (error) {
          console.error('[supabaseService] createCategoryIcon error:', error);
          return { success: false, error: error.message };
        }

        return { success: true, data };
      } catch (e) {
        console.error('[supabaseService] createCategoryIcon exception:', e);
        return { success: false, error: e.message };
      }
    },

    /**
     * Met à jour une catégorie existante dans category_icons
     * @param {string} ville - Ville de la catégorie
     * @param {string} originalCategory - Nom original de la catégorie (clé primaire)
     * @param {Object} updates - {category?, icon_class?, display_order?}
     * @returns {Promise<{success:boolean, data?:Object, error?:string}>}
     */
    async updateCategoryIcon(ville, originalCategory, updates) {
      try {
        // Permettre ville = '' pour les catégories globales, mais ville doit être définie (pas null/undefined)
        if (ville === null || ville === undefined || !originalCategory) {
          return { success: false, error: 'Ville et catégorie requises' };
        }

        const normalizedVille = String(ville).toLowerCase().trim();
        const normalizedOriginal = String(originalCategory).toLowerCase().trim();
        const newCategory = updates.category !== undefined ? String(updates.category).toLowerCase().trim() : normalizedOriginal;
        
        // Si le nom de la catégorie change, on doit supprimer et recréer (clé primaire)
        if (newCategory !== normalizedOriginal) {
          // Récupérer les données actuelles
          const { data: existing, error: fetchError } = await supabaseClient
            .from('category_icons')
            .select('*')
            .eq('ville', normalizedVille)
            .eq('category', normalizedOriginal)
            .single();

          if (fetchError || !existing) {
            console.error('[supabaseService] updateCategoryIcon fetch error:', fetchError);
            return { success: false, error: 'Catégorie introuvable' };
          }

          // ÉTAPE 1 : Mettre à jour les contributions qui utilisent cette catégorie
          console.log('[supabaseService] Updating contributions with category:', { ville: normalizedVille, oldCategory: normalizedOriginal, newCategory });
          const { data: updatedContribs, error: updateContribsError } = await supabaseClient
            .from('contribution_uploads')
            .update({ category: newCategory })
            .eq('ville', normalizedVille)
            .eq('category', normalizedOriginal)
            .select('id');

          if (updateContribsError) {
            console.error('[supabaseService] updateCategoryIcon: error updating contributions:', updateContribsError);
            return { success: false, error: 'Erreur lors de la mise à jour des contributions: ' + updateContribsError.message };
          }

          console.log('[supabaseService] Updated', updatedContribs?.length || 0, 'contributions');

          // ÉTAPE 2 : Supprimer l'ancienne catégorie
          const { error: deleteError } = await supabaseClient
            .from('category_icons')
            .delete()
            .eq('ville', normalizedVille)
            .eq('category', normalizedOriginal);

          if (deleteError) {
            console.error('[supabaseService] updateCategoryIcon delete error:', deleteError);
            // Rollback : remettre l'ancien nom dans les contributions
            await supabaseClient
              .from('contribution_uploads')
              .update({ category: normalizedOriginal })
              .eq('ville', normalizedVille)
              .eq('category', newCategory);
            return { success: false, error: deleteError.message };
          }

          // ÉTAPE 3 : Créer la nouvelle catégorie avec le nouveau nom
          const insertData = {
            ville: normalizedVille,
            category: newCategory,
            icon_class: updates.icon_class !== undefined ? String(updates.icon_class).trim() : existing.icon_class,
            display_order: updates.display_order !== undefined ? parseInt(updates.display_order) || 100 : existing.display_order
          };
          
          // Ajouter layers_to_display si fourni, sinon garder l'existant
          if (updates.layers_to_display !== undefined) {
            insertData.layers_to_display = updates.layers_to_display;
          } else if (existing.layers_to_display) {
            insertData.layers_to_display = existing.layers_to_display;
          }
          
          // Ajouter category_styles si fourni, sinon garder l'existant
          if (updates.category_styles !== undefined) {
            insertData.category_styles = updates.category_styles;
          } else if (existing.category_styles) {
            insertData.category_styles = existing.category_styles;
          }
          
          const { data, error: insertError } = await supabaseClient
            .from('category_icons')
            .insert([insertData])
            .select()
            .single();

          if (insertError) {
            console.error('[supabaseService] updateCategoryIcon insert error:', insertError);
            // Rollback : remettre l'ancien nom dans les contributions et recréer l'ancienne catégorie
            await supabaseClient
              .from('contribution_uploads')
              .update({ category: normalizedOriginal })
              .eq('ville', normalizedVille)
              .eq('category', newCategory);
            await supabaseClient
              .from('category_icons')
              .insert([existing]);
            return { success: false, error: insertError.message };
          }

          return { success: true, data, updatedContributions: updatedContribs?.length || 0 };
        } else {
          // Mise à jour simple (pas de changement de nom)
          // D'abord vérifier que la ligne existe
          const { data: existing, error: checkError } = await supabaseClient
            .from('category_icons')
            .select('*')
            .eq('ville', normalizedVille)
            .eq('category', normalizedOriginal)
            .maybeSingle();

          if (checkError) {
            console.error('[supabaseService] updateCategoryIcon check error:', checkError);
            return { success: false, error: checkError.message };
          }

          if (!existing) {
            console.error('[supabaseService] updateCategoryIcon: category not found', { ville: normalizedVille, category: normalizedOriginal });
            return { success: false, error: `La catégorie "${normalizedOriginal}" n'existe pas pour la ville "${normalizedVille}"` };
          }

          const payload = {};
          if (updates.icon_class !== undefined) payload.icon_class = String(updates.icon_class).trim();
          if (updates.display_order !== undefined) payload.display_order = parseInt(updates.display_order) || 100;
          if (updates.layers_to_display !== undefined) {
            payload.layers_to_display = updates.layers_to_display;
          }
          if (updates.category_styles !== undefined) {
            payload.category_styles = updates.category_styles;
          }
          payload.updated_at = new Date().toISOString();

          const { data, error } = await supabaseClient
            .from('category_icons')
            .update(payload)
            .eq('ville', normalizedVille)
            .eq('category', normalizedOriginal)
            .select();

          if (error) {
            console.error('[supabaseService] updateCategoryIcon error:', error);
            return { success: false, error: error.message };
          }

          if (!data || data.length === 0) {
            console.error('[supabaseService] updateCategoryIcon: UPDATE affected 0 rows');
            return { success: false, error: 'Aucune ligne mise à jour. Vérifiez les permissions RLS.' };
          }

          return { success: true, data: data[0] };
        }
      } catch (e) {
        console.error('[supabaseService] updateCategoryIcon exception:', e);
        return { success: false, error: e.message };
      }
    },

    /**
     * Supprime une catégorie de category_icons
     * @param {string} ville - Ville de la catégorie
     * @param {string} category - Nom de la catégorie
     * @returns {Promise<{success:boolean, error?:string}>}
     */
    async deleteCategoryIcon(ville, category) {
      try {
        if (!ville || !category) {
          return { success: false, error: 'Ville et catégorie requises' };
        }

        const { error } = await supabaseClient
          .from('category_icons')
          .delete()
          .eq('ville', String(ville).toLowerCase().trim())
          .eq('category', String(category).toLowerCase().trim());

        if (error) {
          console.error('[supabaseService] deleteCategoryIcon error:', error);
          return { success: false, error: error.message };
        }

        return { success: true };
      } catch (e) {
        console.error('[supabaseService] deleteCategoryIcon exception:', e);
        return { success: false, error: e.message };
      }
    },

    /**
     * Récupère toutes les catégories pour une ville donnée
     * @param {string} ville - Ville (optionnel, utilise activeCity si non fourni)
     * @returns {Promise<Array>}
     */
    async getCategoryIconsByCity(ville) {
      try {
        // Utiliser ville si elle est définie (même si c'est ''), sinon getActiveCity()
        const targetCity = ville !== undefined ? ville : getActiveCity();
        if (targetCity === undefined || targetCity === null) {
          console.warn('[supabaseService] getCategoryIconsByCity: pas de ville spécifiée');
          return [];
        }

        const { data, error } = await supabaseClient
          .from('category_icons')
          .select('*')
          .eq('ville', String(targetCity).toLowerCase().trim())
          .order('display_order', { ascending: true });

        if (error) {
          console.error('[supabaseService] getCategoryIconsByCity error:', error);
          return [];
        }

        return data || [];
      } catch (e) {
        console.error('[supabaseService] getCategoryIconsByCity exception:', e);
        return [];
      }
    },

    // ========================================================================
    // USER MANAGEMENT (Admin only)
    // ========================================================================

    /**
     * Récupère les utilisateurs visibles par l'admin connecté
     * @returns {Promise<Array>} Liste des utilisateurs avec email, role, ville, created_at
     */
    async getVisibleUsers() {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
          console.error('[supabaseService] getVisibleUsers: not authenticated');
          return [];
        }
        
        // Récupérer le profil de l'admin connecté
        const { data: adminProfile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('role, ville')
          .eq('id', user.id)
          .single();
        
        if (profileError || !adminProfile) {
          console.error('[supabaseService] getVisibleUsers: failed to get admin profile', profileError);
          return [];
        }
        
        // Vérifier que l'utilisateur est admin
        if (adminProfile.role !== 'admin') {
          console.error('[supabaseService] getVisibleUsers: user is not admin');
          return [];
        }
        
        // Récupérer les villes de l'admin (déjà un array JavaScript natif depuis Supabase)
        let adminVilles = [];
        if (adminProfile.ville) {
          if (Array.isArray(adminProfile.ville)) {
            adminVilles = adminProfile.ville;
          } else {
            // Fallback si c'est une string ou autre
            console.warn('[supabaseService] getVisibleUsers: ville is not an array, converting');
            adminVilles = [adminProfile.ville];
          }
        }
        
        const isGlobalAdmin = Array.isArray(adminVilles) && adminVilles.includes('global');
        
        console.log('[supabaseService] getVisibleUsers: admin villes:', adminVilles, 'isGlobal:', isGlobalAdmin);
        
        // Récupérer tous les utilisateurs (sauf soi-même) avec leur email via la fonction
        const { data: allUsers, error: usersError } = await supabaseClient
          .rpc('get_profiles_with_email');
        
        if (usersError) {
          console.error('[supabaseService] getVisibleUsers: failed to get users', usersError);
          return [];
        }
        
        // Filtrer pour exclure l'utilisateur connecté et parser ville
        const filteredUsers = (allUsers || [])
          .filter(u => u.id !== user.id)
          .map(u => {
            // Parser ville - peut être soit JSON array soit PostgreSQL array format
            let parsedVille = u.ville;
            if (typeof u.ville === 'string' && u.ville) {
              // Si c'est un PostgreSQL array format: {lyon,divonne}
              if (u.ville.startsWith('{') && u.ville.endsWith('}')) {
                const content = u.ville.slice(1, -1); // Enlever { et }
                parsedVille = content ? content.split(',') : [];
              } else {
                // Sinon essayer de parser comme JSON
                try {
                  parsedVille = JSON.parse(u.ville);
                } catch (e) {
                  // Si le parsing échoue, garder la valeur originale
                }
              }
            }
            return { ...u, ville: parsedVille };
          });
        
        console.log('[supabaseService] getVisibleUsers: fetched', filteredUsers.length, 'users from get_profiles_with_email');
        
        // Filtrer selon les permissions (la fonction a déjà filtré par admin, mais on filtre encore par ville si nécessaire)
        let visibleUsers = filteredUsers;
        
        if (!isGlobalAdmin) {
          // Admin ville : filtrer uniquement les utilisateurs avec au moins une ville commune
          console.log('[supabaseService] getVisibleUsers: filtering by cities, admin has:', adminVilles);
          visibleUsers = filteredUsers.filter(u => {
            if (!u.ville) {
              console.log('[supabaseService] User', u.id, 'has no ville');
              return false;
            }
            
            // ville doit être un array
            if (!Array.isArray(u.ville)) {
              console.log('[supabaseService] User', u.id, 'ville is not an array:', typeof u.ville, u.ville);
              return false;
            }
            
            console.log('[supabaseService] User', u.id, 'has villes:', u.ville);
            
            // Vérifier s'il y a au moins une ville en commun
            const hasMatch = adminVilles.some(adminCity => u.ville.includes(adminCity));
            console.log('[supabaseService] User', u.id, 'match:', hasMatch);
            return hasMatch;
          });
          console.log('[supabaseService] getVisibleUsers: after filtering:', visibleUsers.length, 'users');
        } else {
          console.log('[supabaseService] getVisibleUsers: global admin, showing all users');
        }
        
        // Les emails sont déjà dans les données depuis la vue profiles_with_email
        const result = visibleUsers.map(u => ({
          id: u.id,
          email: u.email || `User ${u.id.substring(0, 8)}...`,
          role: u.role,
          ville: u.ville,
          created_at: u.created_at
        }));
        
        console.log('[supabaseService] getVisibleUsers: returning', result.length, 'users');
        
        return result;
      } catch (e) {
        console.error('[supabaseService] getVisibleUsers exception:', e);
        return [];
      }
    },

    /**
     * Modifie le rôle d'un utilisateur (admin ↔ invited)
     * @param {string} targetUserId - ID de l'utilisateur cible
     * @param {string} newRole - Nouveau rôle ('admin' ou 'invited')
     * @returns {Promise<boolean>} True si succès
     */
    async updateUserRole(targetUserId, newRole) {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }
        
        if (!['admin', 'invited'].includes(newRole)) {
          throw new Error('Invalid role: must be admin or invited');
        }
        
        // Empêcher l'auto-modification
        if (user.id === targetUserId) {
          throw new Error('Cannot modify your own role');
        }
        
        // Récupérer le profil de l'admin
        const { data: adminProfile, error: adminError } = await supabaseClient
          .from('profiles')
          .select('role, ville')
          .eq('id', user.id)
          .single();
        
        if (adminError || !adminProfile || adminProfile.role !== 'admin') {
          throw new Error('Unauthorized: caller is not admin');
        }
        
        // Récupérer les villes de l'admin (déjà un array JavaScript natif depuis Supabase)
        let adminVilles = [];
        if (adminProfile.ville) {
          if (Array.isArray(adminProfile.ville)) {
            adminVilles = adminProfile.ville;
          } else {
            adminVilles = [adminProfile.ville];
          }
        }
        
        const isGlobalAdmin = Array.isArray(adminVilles) && adminVilles.includes('global');
        
        // Récupérer le profil de la cible
        const { data: targetProfile, error: targetError } = await supabaseClient
          .from('profiles')
          .select('role, ville')
          .eq('id', targetUserId)
          .single();
        
        if (targetError || !targetProfile) {
          throw new Error('Target user not found');
        }
        
        // Si le rôle est déjà celui demandé, ne rien faire
        if (targetProfile.role === newRole) {
          return true;
        }
        
        // Si admin global, autoriser directement
        if (!isGlobalAdmin) {
          // Admin ville : vérifier qu'il y a au moins une ville commune
          if (!targetProfile.ville) {
            throw new Error('Target user has no cities assigned');
          }
          
          let targetVilles = [];
          if (Array.isArray(targetProfile.ville)) {
            targetVilles = targetProfile.ville;
          } else if (targetProfile.ville) {
            targetVilles = [targetProfile.ville];
          }
          
          const hasSharedCity = adminVilles.some(adminCity => targetVilles.includes(adminCity));
          
          if (!hasSharedCity) {
            throw new Error('Unauthorized: no shared cities with target user');
          }
        }
        
        // Mettre à jour le rôle
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({ role: newRole })
          .eq('id', targetUserId);
        
        if (updateError) {
          console.error('[supabaseService] updateUserRole error:', updateError);
          throw new Error(updateError.message);
        }
        
        return true;
      } catch (e) {
        console.error('[supabaseService] updateUserRole exception:', e);
        throw e;
      }
    },

    // ========================================================================
    // USER INVITATION (Admin only)
    // ========================================================================

    /**
     * Récupère les villes disponibles pour l'admin connecté
     * @returns {Promise<Array<{value: string, label: string}>>} Liste des villes disponibles
     */
    async getAvailableCities() {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
          console.error('[supabaseService] getAvailableCities: not authenticated');
          return [];
        }

        // Récupérer le profil de l'admin
        const { data: adminProfile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('role, ville')
          .eq('id', user.id)
          .single();

        if (profileError || !adminProfile || adminProfile.role !== 'admin') {
          console.error('[supabaseService] getAvailableCities: user is not admin');
          return [];
        }

        // Parser les villes
        let adminVilles = [];
        if (adminProfile.ville) {
          if (Array.isArray(adminProfile.ville)) {
            adminVilles = adminProfile.ville;
          } else {
            adminVilles = [adminProfile.ville];
          }
        }

        const isGlobalAdmin = adminVilles.includes('global');

        // Si admin global, récupérer toutes les villes depuis city_branding
        if (isGlobalAdmin) {
          const { data: cities, error: citiesError } = await supabaseClient
            .from('city_branding')
            .select('ville, brand_name')
            .order('ville', { ascending: true });

          if (citiesError) {
            console.error('[supabaseService] getAvailableCities: failed to fetch city_branding', citiesError);
            return [];
          }

          if (!cities || cities.length === 0) {
            console.warn('[supabaseService] getAvailableCities: no cities found in city_branding');
            return [];
          }

          // Retourner les villes avec leur brand_name
          return cities.map(city => ({
            value: city.ville,
            label: city.brand_name || (city.ville.charAt(0).toUpperCase() + city.ville.slice(1))
          }));
        }

        // Si admin ville, retourner uniquement ses villes
        return adminVilles
          .filter(v => v !== 'global')
          .map(v => ({
            value: v,
            label: v.charAt(0).toUpperCase() + v.slice(1) // Capitaliser
          }));

      } catch (e) {
        console.error('[supabaseService] getAvailableCities exception:', e);
        return [];
      }
    },

    /**
     * Invite un nouvel utilisateur
     * @param {string} email - Email de l'utilisateur à inviter
     * @param {Array<string>} villes - Liste des villes à assigner
     * @param {string} role - Rôle de l'utilisateur ('admin' ou 'invited')
     * @returns {Promise<Object>} Résultat de l'invitation
     */
    async inviteUser(email, villes, role = 'invited') {
      try {
        // Utiliser fetch directement pour avoir le détail complet des erreurs
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          throw new Error('Not authenticated');
        }

        const response = await fetch(`${supabaseClient.supabaseUrl}/functions/v1/invite-user`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': supabaseClient.supabaseKey
          },
          body: JSON.stringify({ email, villes, role })
        });

        const data = await response.json();

        console.log('[supabaseService] inviteUser response:', { status: response.status, data });

        if (!response.ok) {
          const errorMessage = data.error || data.details || `HTTP ${response.status}: ${response.statusText}`;
          throw new Error(errorMessage);
        }

        if (data.error) {
          throw new Error(data.error);
        }

        return data;
      } catch (e) {
        console.error('[supabaseService] inviteUser exception:', e);
        throw e;
      }
    },

    // ============================================================================
    // CITIES MANAGEMENT (Admin Global only)
    // ============================================================================

    /**
     * Récupère toutes les villes pour la gestion (admin global)
     * @returns {Promise<Array>}
     */
    async getAllCitiesForManagement() {
      try {
        const { data, error } = await supabaseClient
          .from('city_branding')
          .select('*')
          .order('ville', { ascending: true });

        if (error) {
          console.error('[supabaseService] getAllCitiesForManagement error:', error);
          throw error;
        }

        // Récupérer le nombre d'admins par ville
        const { data: profiles, error: profilesError } = await supabaseClient
          .from('profiles')
          .select('ville, role');

        if (!profilesError && profiles) {
          // Compter les admins par ville
          const adminCounts = {};
          
          profiles.forEach(profile => {
            if (profile.role === 'admin' && profile.ville) {
              const villes = Array.isArray(profile.ville) ? profile.ville : [profile.ville];
              villes.forEach(ville => {
                if (ville && ville !== 'global') {
                  adminCounts[ville] = (adminCounts[ville] || 0) + 1;
                }
              });
            }
          });

          // Ajouter le compteur à chaque ville
          (data || []).forEach(city => {
            city.admin_count = adminCounts[city.ville] || 0;
          });
        }

        return data || [];
      } catch (e) {
        console.error('[supabaseService] getAllCitiesForManagement exception:', e);
        throw e;
      }
    },

    /**
     * Crée une nouvelle ville
     * @param {Object} cityData - Données de la ville
     * @returns {Promise<Object>}
     */
    async createCity(cityData) {
      try {
        const { data, error } = await supabaseClient
          .from('city_branding')
          .insert([cityData])
          .select()
          .single();

        if (error) {
          console.error('[supabaseService] createCity error:', error);
          throw error;
        }

        return data;
      } catch (e) {
        console.error('[supabaseService] createCity exception:', e);
        throw e;
      }
    },

    /**
     * Met à jour une ville existante
     * @param {string} ville - Code ville
     * @param {Object} cityData - Nouvelles données
     * @returns {Promise<Object>}
     */
    async updateCity(ville, cityData) {
      try {
        const { data, error } = await supabaseClient
          .from('city_branding')
          .update(cityData)
          .eq('ville', ville)
          .select()
          .single();

        if (error) {
          console.error('[supabaseService] updateCity error:', error);
          throw error;
        }

        return data;
      } catch (e) {
        console.error('[supabaseService] updateCity exception:', e);
        throw e;
      }
    },

    /**
     * Supprime une ville
     * @param {string} ville - Code ville
     * @returns {Promise<void>}
     */
    async deleteCity(ville) {
      try {
        const { error } = await supabaseClient
          .from('city_branding')
          .delete()
          .eq('ville', ville);

        if (error) {
          console.error('[supabaseService] deleteCity error:', error);
          throw error;
        }
      } catch (e) {
        console.error('[supabaseService] deleteCity exception:', e);
        throw e;
      }
    }
  };
})(window);
