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
      // Exclure certaines couches du chargement depuis la table 'layers'.
      // Ces couches sont désormais gérées via contribution_uploads par catégorie.
      const EXCLUDED = new Set(['velo', 'mobilite', 'urbanisme']);

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
        console.error('fetchLayersConfig error:', error);
        return [];
      }

      // A ce stade, on a UNIQUEMENT les couches de la ville active (ou globales si aucune ville),
      // ce qui garantit que les URLs ne réintroduisent pas des couches globales quand une ville est active.
      const rows = (data || []).filter(row => row && !EXCLUDED.has(row.name));

      // Correction styles: si une ville est active, récupérer les styles avec fallback global
      if (activeCity && rows.length > 0) {
        try {
          const names = Array.from(new Set(rows.map(r => r.name).filter(Boolean)));
          if (names.length > 0 && typeof win.supabaseService?.fetchLayerStylesByNames === 'function') {
            const styles = await win.supabaseService.fetchLayerStylesByNames(names);
            rows.forEach(r => {
              if (styles && Object.prototype.hasOwnProperty.call(styles, r.name)) {
                r.style = styles[r.name];
              }
            });
          }
        } catch (e) {
          console.warn('[supabaseService] fetchLayersConfig: fusion des styles (fallback) échouée:', e);
        }
      }

      return rows;
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
          console.error('[supabaseService] fetchLayerStylesByNames error:', error);
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
        console.warn('[supabaseService] fetchLayerStylesByNames exception:', e);
        return {};
      }
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
          console.error('[supabaseService] uploadConsultationPdfToStorage error:', upErr);
          throw upErr;
        }
        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        // Optionally patch row
        if (rowId && data && data.publicUrl) {
          try {
            await supabaseClient
              .from('contribution_uploads')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', rowId);
          } catch(_) {}
        }
        return data.publicUrl;
      } catch (e) {
        console.error('[supabaseService] uploadConsultationPdfToStorage exception:', e);
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
          console.warn('[supabaseService] listContributions error:', error);
          return { items: [], count: 0 };
        }
        return { items: data || [], count: typeof count === 'number' ? count : (data ? data.length : 0) };
      } catch (e) {
        console.warn('[supabaseService] listContributions exception:', e);
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
          console.warn('[supabaseService] getContributionById error:', error);
          return null;
        }
        return data || null;
      } catch (e) {
        console.warn('[supabaseService] getContributionById exception:', e);
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
          console.warn('[supabaseService] updateContribution error:', error);
          return { error };
        }
        return { data };
      } catch (e) {
        console.warn('[supabaseService] updateContribution exception:', e);
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
          console.warn('[supabaseService] setContributionApproved error:', error);
          return { error };
        }
        return { data };
      } catch (e) {
        console.warn('[supabaseService] setContributionApproved exception:', e);
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
            if (remErr) console.warn('[supabaseService] deleteContribution storage.remove warning:', remErr, remData);
          } catch (remEx) {
            console.warn('[supabaseService] deleteContribution storage.remove exception:', remEx);
          }
        }

        // 3) Supprimer les dossiers de concertation liés (par nom exact)
        try {
          const { error: delDocErr } = await supabaseClient
            .from('consultation_dossiers')
            .delete()
            .eq('project_name', row.project_name);
          if (delDocErr) console.warn('[supabaseService] deleteContribution dossiers warning:', delDocErr);
        } catch (docEx) {
          console.warn('[supabaseService] deleteContribution dossiers exception:', docEx);
        }

        // 4) Supprimer la ligne principale
        const { error: delErr } = await supabaseClient
          .from('contribution_uploads')
          .delete()
          .eq('id', id);
        if (delErr) {
          console.warn('[supabaseService] deleteContribution row error:', delErr);
          return { success: false, error: delErr };
        }

        return { success: true };
      } catch (e) {
        console.warn('[supabaseService] deleteContribution exception:', e);
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
        console.error('fetchMetroColors error:', error);
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
        console.error('fetchProjectPages error:', error);
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
        console.error('fetchAllProjects error:', error);
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
     * Récupère la configuration des filtres (catégories + items) depuis Supabase
     * @returns {Promise<Array<{category:string, items:Array<{id:string, layer:string, icon:string, label:string}>}>>}
     */
    fetchFiltersConfig: async function() {
      // 1) Charger la config des filtres (toutes villes)
      const { data, error } = await supabaseClient
        .from('filter_categories')
        .select(`
          id,
          category,
          filter_items (
            id,
            layer,
            icon,
            label
          )
        `)
        .order('id', { ascending: true })
        .order('id', { foreignTable: 'filter_items', ascending: true });

      if (error) {
        console.error('fetchFiltersConfig error:', error);
        return [];
      }

      // 2) Récupérer les couches actives pour la ville courante
      const activeCity = getActiveCity();
      let q = supabaseClient
        .from('layers')
        .select('name, ville');
      if (activeCity) {
        q = q.eq('ville', activeCity);
      } else {
        q = q.is('ville', null);
      }
      const { data: layerRows, error: layerErr } = await q;
      if (layerErr) {
        console.error('[supabaseService] fetchFiltersConfig layers error:', layerErr);
        return (data || []).map(cat => ({ category: cat.category, items: cat.filter_items }));
      }
      const allowedLayers = new Set((layerRows || []).map(r => r.name).filter(Boolean));

      // 3) Filtrer les items par couches autorisées et supprimer les catégories vides
      const filtered = (data || []).map(cat => {
        const items = (cat.filter_items || []).filter(it => allowedLayers.has(it.layer));
        return { category: cat.category, items };
      }).filter(cat => (cat.items && cat.items.length > 0));

      return filtered;
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
     * Insère des dossiers de concertation liés à un projet (facultatif).
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

        const { error } = await supabaseClient
          .from('contribution_uploads')
          .update(patch)
          .eq('id', rowId);
        if (error) console.warn('[supabaseService] logContributionUpload update error:', error);
        return { error: null };
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
          case 'fetchFiltersConfig':   prop = 'filtersConfig';  break;
          case 'fetchProjectFilterMapping':  prop = 'projectFilterMapping';  break;
          case 'fetchBasemaps':             prop = 'basemaps';             break;
          default:
            const name = key.replace(/^fetch/, '');
            prop = name[0].toLowerCase() + name.slice(1);
        }
        out[prop] = results[i];
        window[prop] = results[i];
      });
      return out;
    }
  };
})(window);
