const _routes = new Map();
let _currentSection = null;
let _container = null;
let _beforeNavigate = null;

export const router = {
  /** Register a route: path → render(container, params) */
  define(path, handler) {
    _routes.set(path, handler);
  },

  /** Set the DOM container for section rendering */
  setContainer(el) {
    _container = el;
  },

  /** Optional hook before navigation (return false to cancel) */
  setBeforeNavigate(fn) {
    _beforeNavigate = fn;
  },

  /** Navigate to a path programmatically */
  navigate(path, { replace = false, skipRender = false } = {}) {
    if (replace) {
      history.replaceState({}, '', path);
    } else {
      history.pushState({}, '', path);
    }
    if (!skipRender) _dispatch(path);
  },

  /** Get the currently active section key */
  get currentSection() { return _currentSection; },

  /** Start listening for navigation events */
  start() {
    // Handle back/forward
    window.addEventListener('popstate', () => _dispatch(location.pathname));

    // Intercept sidebar link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-section]');
      if (!link) return;
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href) router.navigate(href);
    });

    // Initial dispatch
    _dispatch(location.pathname);
  },
};

function _dispatch(pathname) {
  const section = _parseSectionFromPath(pathname);
  const handler = _routes.get(section) || _routes.get('contributions');

  if (_beforeNavigate && _beforeNavigate(_currentSection, section) === false) return;

  _currentSection = section;

  // Update active nav item
  document.querySelectorAll('.adm-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });

  // Render section
  if (_container && handler) {
    _container.innerHTML = '';
    handler(_container, _parseParams(pathname));
  }
}

function _parseSectionFromPath(pathname) {
  // /admin/contributions/123 → 'contributions'
  const segments = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
  return segments[0] || 'contributions';
}

function _parseParams(pathname) {
  const segments = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
  return {
    section: segments[0] || 'contributions',
    id: segments[1] || null,
    sub: segments[2] || null,
  };
}
