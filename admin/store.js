let _session = null;
let _profile = null;
let _city = null;
let _listeners = [];

function _notify() {
  for (const fn of _listeners) {
    try { fn(store); } catch (e) { console.error('[admin/store] listener error:', e); }
  }
}

function _persistCity(code) {
  try { localStorage.setItem('adm-selected-city', code); } catch (e) { console.debug('[admin-store] persistCity', e); }
}

function _loadCity() {
  try { return localStorage.getItem('adm-selected-city') || null; } catch (e) { console.debug('[admin-store] loadCity', e); return null; }
}

export const store = {
  get session()      { return _session; },
  get user()         { return _session?.user ?? null; },
  get profile()      { return _profile; },
  get role()         { return _profile?.role ?? ''; },
  get isAdmin()      { return _profile?.role === 'admin'; },
  get isInvited()    { return _profile?.role === 'invited'; },
  get villes()       { return Array.isArray(_profile?.ville) ? _profile.ville : []; },
  get isGlobalAdmin(){ return store.isAdmin && store.villes.includes('global'); },
  get city()         { return _city; },

  get authenticated(){ return !!_session?.user; },

  setCity(code) {
    if (!code || _city === code) return;
    _city = code;
    _persistCity(code);
    _notify();
  },

  async init() {
    const AuthModule = window.AuthModule;
    if (!AuthModule) throw new Error('AuthModule not loaded');

    // Get current session
    const { data } = await AuthModule.getSession();
    _session = data?.session ?? null;

    if (!_session?.user) {
      window.location.href = '/login/?redirect=/admin/';
      return false;
    }

    // Fetch profile
    const client = AuthModule.getClient();
    const { data: profile, error } = await client
      .from('profiles')
      .select('role, ville')
      .eq('id', _session.user.id)
      .single();

    if (error) {
      console.error('[admin/store] Failed to load profile:', error);
      _profile = { role: 'invited', ville: [] };
    } else {
      _profile = profile;
    }

    // Resolve city
    const savedCity = _loadCity();
    const userVilles = store.villes.filter(v => v !== 'global');

    if (savedCity && (store.isGlobalAdmin || userVilles.includes(savedCity))) {
      _city = savedCity;
    } else if (userVilles.length === 1) {
      _city = userVilles[0];
      _persistCity(_city);
    } else if (userVilles.length > 0) {
      _city = userVilles[0];
      _persistCity(_city);
    }

    // Listen for auth changes (session lost → redirect)
    AuthModule.onAuthStateChange((_event, session) => {
      _session = session;
      if (!session?.user) {
        window.location.href = '/login/?redirect=/admin/';
      }
    });

    return true;
  },

  subscribe(fn) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(f => f !== fn); };
  },
};
