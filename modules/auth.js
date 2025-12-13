// modules/auth.js
;(function(win){
  if (!win.supabase) {
    console.error('[AuthModule] Supabase CDN not loaded. Load @supabase/supabase-js before auth.js');
    return;
  }

  // Réutiliser le client Supabase existant (créé par supabaseservice.js)
  // Évite le warning "Multiple GoTrueClient instances"
  const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
  
  // Réutiliser le client existant s'il existe déjà
  const client = win.__supabaseClient || supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  if (!win.__supabaseClient) {
    win.__supabaseClient = client;
  }

  // Cache pour la session (mis à jour par onAuthStateChange)
  let cachedSession = null;
  
  // Initialiser le cache avec la session actuelle
  client.auth.getSession().then(({ data }) => {
    cachedSession = data?.session || null;
  });
  
  // Écouter les changements pour maintenir le cache à jour
  client.auth.onAuthStateChange((event, session) => {
    cachedSession = session;
  });

  const AuthModule = {
    getClient: function() { return client; },

    /**
     * Vérifie si l'utilisateur est connecté (synchrone - utilise le cache)
     * @returns {boolean}
     */
    isAuthenticated: function() {
      return !!(cachedSession?.user);
    },
    
    /**
     * Retourne la session en cache (synchrone)
     * @returns {Object|null}
     */
    getCachedSession: function() {
      return cachedSession;
    },

    getSession: async function() {
      try {
        const result = await client.auth.getSession();
        // Mettre à jour le cache
        cachedSession = result.data?.session || null;
        return result;
      } catch (e) {
        console.warn('[AuthModule] getSession error:', e);
        return { data: { session: null }, error: e };
      }
    },

    /**
     * Récupère la session avec refresh automatique si expirée
     * Ne redirige JAMAIS - retourne simplement la session ou null
     * @returns {Promise<{session: Object|null, refreshed: boolean}>}
     */
    getSessionWithRefresh: async function() {
      try {
        // 1. Essayer de récupérer la session actuelle
        let result = await client.auth.getSession();
        let session = result.data?.session;
        
        // 2. Si pas de session ou token expiré, tenter un refresh
        if (!session) {
          try {
            const refreshResult = await client.auth.refreshSession();
            if (refreshResult.data?.session) {
              session = refreshResult.data.session;
              cachedSession = session;
              return { session, refreshed: true };
            }
          } catch (refreshErr) {
            // Refresh échoué silencieusement
          }
        }
        
        cachedSession = session || null;
        return { session: session || null, refreshed: false };
      } catch (e) {
        console.warn('[AuthModule] getSessionWithRefresh error:', e);
        return { session: null, refreshed: false };
      }
    },

    onAuthStateChange: function(callback) {
      try {
        return client.auth.onAuthStateChange((event, session) => callback && callback(event, session));
      } catch (e) {
        console.warn('[AuthModule] onAuthStateChange error:', e);
        return { data: { subscription: null }, error: e };
      }
    },

    signInWithGitHub: async function(redirectTo) {
      try {
        return await client.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: redirectTo || (win.location.origin + '/'),
            scopes: 'read:user,user:email'
          }
        });
      } catch (e) {
        console.warn('[AuthModule] signInWithGitHub error:', e);
        return { error: e };
      }
    },

    signInWithMagicLink: async function(email, redirectTo) {
      try {
        if (!email || typeof email !== 'string') {
          throw new Error('Email invalide');
        }
        return await client.auth.signInWithOtp({
          email,
          options: { 
            emailRedirectTo: redirectTo || (win.location.origin + '/login/'),
            shouldCreateUser: false
          }
        });
      } catch (e) {
        console.warn('[AuthModule] signInWithMagicLink error:', e);
        return { error: e };
      }
    },

    signOut: async function() {
      try {
        return await client.auth.signOut();
      } catch (e) {
        console.warn('[AuthModule] signOut error:', e);
        return { error: e };
      }
    },

    requireAuthOrRedirect: async function(loginUrl) {
      try {
        const { data: { session } } = await AuthModule.getSession();
        if (!session || !session.user) {
          win.location.href = loginUrl || '/login/';
          return null;
        }
        return session;
      } catch (_) {
        win.location.href = loginUrl || '/login/';
        return null;
      }
    }
  };

  win.AuthModule = AuthModule;
})(window);
