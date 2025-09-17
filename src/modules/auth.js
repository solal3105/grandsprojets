// modules/auth.js
export const AuthModule = (function(win){
  if (!win.supabase) {
    console.error('[AuthModule] Supabase CDN not loaded. Load @supabase/supabase-js before auth.js');
    return;
  }
  console.log("supabase : ", supabase);
  // Same project as other modules
  const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const authModule = {
    getClient: function() { return client; },

    getSession: async function() {
      try {
        return await client.auth.getSession();
      } catch (e) {
        console.warn('[AuthModule] getSession error:', e);
        return { data: { session: null }, error: e };
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

    // Passwordless via Magic Link (email)
    signInWithMagicLink: async function(email, redirectTo) {
      try {
        if (!email || typeof email !== 'string') {
          throw new Error('Email invalide');
        }
        return await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo || (win.location.origin + '/login/') }
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
        const { data: { session } } = await getSession();
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

  return authModule;
})(window);
