// modules/supabaseService.js
;(function(win){
  // 1️⃣ Initialise le client Supabase via le global `supabase` chargé par CDN
  const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // 2️⃣ Expose supabaseService sur window
  win.supabaseService = {
    /**
     * Récupère toutes les couches dans la table 'layers'
     * @returns {Promise<Array<{name:string, url:string, style:string, is_default:boolean}>>}
     */
    fetchLayersConfig: async function() {
      const { data, error } = await supabaseClient
        .from('layers')
        .select('name, url, style, is_default');
      
      if (error) {
        console.error('fetchLayersConfig error:', error);
        return [];
      }
      
      return data;
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
      return data.reduce((acc, { ligne, color }) => {
        acc[ligne] = color;
        return acc;
      }, {});
    },

    /**
     * Récupère toutes les données de mobilité (tram/bus/velo)
     * @returns {Promise<{tram:Array, bus:Array, velo:Array}>}
     */
    fetchMobilityData: async function() {
      const { data, error } = await supabaseClient
        .from('mobility_data')
        .select('category, name, year, status');
      if (error) {
        console.error('fetchMobilityData error:', error);
        return { tram: [], bus: [], velo: [] };
      }
      return data.reduce((acc, { category, name, year, status }) => {
        if (!acc[category]) acc[category] = [];
        acc[category].push({ name, year, status });
        return acc;
      }, { tram: [], bus: [], velo: [] });
    },

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
     * Récupère la liste des projets d'urbanisme
     * @returns {Promise<Array<{name:string, city:string}>>}
     */
    fetchUrbanismeProjects: async function() {
      const { data, error } = await supabaseClient
        .from('urbanisme_projects')
        .select('name, city');
      if (error) {
        console.error('fetchUrbanismeProjects error:', error);
        return [];
      }
      return data; 
    },



    /**
     * Récupère la configuration des filtres (catégories + items) depuis Supabase
     * @returns {Promise<Array<{category:string, items:Array<{id:string, layer:string, icon:string, label:string}>}>>}
     */
    fetchFiltersConfig: async function() {
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
        .order('id', {
          foreignTable: 'filter_items',
          ascending: true
        });
    
      if (error) {
        console.error('fetchFiltersConfig error:', error);
        return [];
      }
    
      // On renvoie juste [{ category, items }, …]
      return data.map(cat => ({
        category: cat.category,
        items: cat.filter_items
      }));
    },

    fetchProjectFilterMapping: async function() {
      const { data, error } = await supabaseClient
        .from('project_filter_mapping')
        .select('*');

      if (error) {
        console.error('fetchProjectFilterMapping error:', error);
        return {};
      }

      return data.reduce((acc, row) => {
        acc[row.project_name] = {
          layer: row.layer,
          key:   row.key,
          value: row.value
        };
        return acc;
      }, {});
    },

    /**
     * Récupère les couleurs de projet depuis Supabase.
     * @returns {Promise<Object>} un objet { [name]: { background, icon } }
     */
    fetchProjectColors: async function() {
      const { data, error } = await supabaseClient
        .from('project_colors')
        .select('*');
    
      if (error) {
        console.error('fetchProjectColors error:', error);
        return {};
      }
    
      return data.reduce((acc, row) => {
        acc[row.name] = {
          background: row.background,
          icon:       row.icon
        };
        return acc;
      }, {});
    },


    /**
     * Récupère la configuration des infos de couche depuis Supabase.
     * @returns {Promise<Object>} 
     *   { [layer]: { displayFields: string[], renameFields: { [orig]: string } } }
     */
    fetchLayerInfoConfig: async function() {

      const { data, error } = await supabaseClient
        .from('layer_info_config')
        .select(`
          layer,
          layer_display_fields (
            field_name,
            field_order
          ),
          layer_rename_fields (
            original_name,
            display_name
          )
        `)
        .order('layer', { ascending: true })
        .order('field_order', {
          foreignTable: 'layer_display_fields',
          ascending: true
        });

      if (error) {
        console.error('[supabaseService] ❌ fetchLayerInfoConfig error:', error);
        return {};
      }


      const formatted = data.reduce((acc, row) => {
        acc[row.layer] = {
          displayFields: (row.layer_display_fields || [])
            .sort((a, b) => a.field_order - b.field_order)
            .map(f => f.field_name),
          renameFields: (row.layer_rename_fields || [])
            .reduce((m, r) => {
              m[r.original_name] = r.display_name;
              return m;
            }, {})
        };
        return acc;
      }, {});

      return formatted;
    },

    /**
     * Retourne l'URL GrandLyon pour un projet d'urbanisme donné.
     * Utilise une table 'grandlyon_project_links' (project_name, project_slug, url).
     * @param {string} projectName
     * @returns {Promise<string|null>} URL si trouvée, sinon null
     */
    getGrandLyonUrlByProject: async function(projectName) {
      try {
        if (!projectName) return null;
        const slug = (function slugify(str) {
          return String(str || '')
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
        })(projectName);

        // 1) try by slug
        let { data, error } = await supabaseClient
          .from('grandlyon_project_links')
          .select('url')
          .eq('project_slug', slug)
          .limit(1)
          .maybeSingle();
        if (error) console.warn('[supabaseService] getGrandLyonUrlByProject slug query error:', error);
        if (data?.url) return data.url;

        // 2) fallback exact (case-insens) by name
        const byName = await supabaseClient
          .from('grandlyon_project_links')
          .select('url')
          .ilike('project_name', projectName)
          .limit(1)
          .maybeSingle();
        if (byName.error) console.warn('[supabaseService] getGrandLyonUrlByProject name query error:', byName.error);
        return byName.data?.url || null;
      } catch (e) {
        console.warn('[supabaseService] getGrandLyonUrlByProject exception:', e);
        return null;
      }
    },

    /**
     * Retourne l'URL Sytral pour un projet de mobilité donné.
     * Utilise une table 'sytral_project_links' (id, project_name, url).
     * @param {string} projectName
     * @returns {Promise<string|null>} URL si trouvée, sinon null
     */
    getSytralUrlByProject: async function(projectName) {
      try {
        if (!projectName) return null;
        // Table minimale: recherche sur project_name (insensible à la casse)
        const { data, error } = await supabaseClient
          .from('sytral_project_links')
          .select('url')
          .ilike('project_name', projectName)
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('[supabaseService] getSytralUrlByProject query error:', error);
          return null;
        }
        return data?.url || null;
      } catch (e) {
        console.warn('[supabaseService] getSytralUrlByProject exception:', e);
        return null;
      }
    },

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
     * Retourne les dossiers de concertation pour un projet donné.
     * Ne commence pas par "fetch" pour éviter l'appel automatique dans initAllData.
     * @param {string} projectName
     * @returns {Promise<Array<{title:string, pdf_url:string, project_name:string}>>}
     */
    getConsultationDossiersByProject: async function(projectName) {
      try {
        if (!projectName) return [];
        // Helpers for tolerant matching
        const normalize = (str) => String(str || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // strip accents
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ') // keep alnum
          .trim()
          .replace(/\s+/g, ' ');
        const tokens = normalize(projectName).split(' ').filter(t => t.length >= 3);

        // 1) Exact match
        let q1 = await supabaseClient
          .from('consultation_dossiers')
          .select('title, pdf_url, project_name')
          .eq('project_name', projectName)
          .order('title', { ascending: true });
        if (q1.error) {
          console.error('[supabaseService] ❌ getConsultationDossiersByProject exact error:', q1.error);
        }
        if (q1.data && q1.data.length) return q1.data;

        // 2) Case-insensitive partial with ILIKE on the whole name
        let q2 = await supabaseClient
          .from('consultation_dossiers')
          .select('title, pdf_url, project_name')
          .ilike('project_name', `%${projectName}%`)
          .order('title', { ascending: true });
        if (q2.error) {
          console.error('[supabaseService] ❌ getConsultationDossiersByProject ilike error:', q2.error);
        }
        if (q2.data && q2.data.length) return q2.data;

        // 3) Token-based OR of ILIKE predicates (up to 3 tokens)
        if (tokens.length) {
          const orExpr = tokens.slice(0, 3)
            .map(t => `project_name.ilike.%${t}%`)
            .join(',');
          let q3 = await supabaseClient
            .from('consultation_dossiers')
            .select('title, pdf_url, project_name')
            .or(orExpr)
            .order('title', { ascending: true });
          if (q3.error) {
            console.error('[supabaseService] ❌ getConsultationDossiersByProject tokens error:', q3.error);
          }
          if (q3.data && q3.data.length) return q3.data;
        }

        // 4) Client-side fuzzy: fetch all (bounded) and match by normalized token overlap
        const q4 = await supabaseClient
          .from('consultation_dossiers')
          .select('title, pdf_url, project_name')
          .limit(500);
        if (q4.error) {
          console.error('[supabaseService] ❌ getConsultationDossiersByProject fallback fetch-all error:', q4.error);
          return [];
        }
        const wanted = new Set(tokens);
        const scored = (q4.data || []).map(row => {
          const rowTokens = new Set(normalize(row.project_name).split(' ').filter(t => t.length >= 3));
          let score = 0;
          wanted.forEach(t => { if (rowTokens.has(t)) score++; });
          return { row, score };
        }).filter(x => x.score > 0);
        scored.sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title));
        return scored.map(x => x.row);
      } catch (e) {
        console.error('[supabaseService] ❌ getConsultationDossiersByProject exception:', e);
        return [];
      }
    },

    /**
     * Charge toutes les données fetch* en parallèle,
     * injecte window.<nom> et retourne un objet { layersConfig, metroColors, mobilityData, projectPages }
     * @returns {Promise<Record<string, any>>}
     */
    initAllData: async function() {
      const svc = this;
      // 1️⃣ repérer toutes les méthodes commençant par 'fetch'
      const fetchers = Object
        .entries(svc)
        .filter(([key, fn]) => key.startsWith('fetch') && typeof fn === 'function');

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
          case 'fetchMobilityData':  prop = 'mobilityData';  break;
          case 'fetchProjectPages':  prop = 'projectPages';  break;
          case 'fetchFiltersConfig':   prop = 'filtersConfig';  break;
          case 'fetchProjectFilterMapping':  prop = 'projectFilterMapping';  break;
          case 'fetchProjectColors':        prop = 'projectColors';        break;
          case 'fetchLayerInfoConfig':       prop = 'layerInfoConfig';       break;
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
