import { store } from './store.js';
import { router } from './router.js';
import * as api from './api.js';
import { initSidebar } from './components/sidebar.js';
import { renderContributions } from './sections/contributions.js';
import { renderCategories } from './sections/categories.js';
import { renderUsers } from './sections/users.js';
import { renderTravaux } from './sections/travaux.js';
import { renderStructure } from './sections/structure.js';
import { renderVilles } from './sections/villes.js';
import { toast } from './components/ui.js';

async function boot() {
  const splash = document.getElementById('adm-splash');

  try {
    // 1. Auth + profile
    const ok = await store.init();
    if (!ok) return; // redirected to /login/

    // 2. Sidebar (city selector, user info, role visibility)
    await initSidebar();

    // Apply branding color for the initial city
    _loadAndApplyBrandColor();

    // 3. Router
    const main = document.getElementById('adm-content');
    router.setContainer(main);

    router.define('contributions',  (c, p) => renderContributions(c, p));
    router.define('categories',     (c, p) => renderCategories(c, p));
    router.define('utilisateurs',   (c, p) => renderUsers(c, p));
    router.define('travaux',        (c, p) => renderTravaux(c, p));
    router.define('structure',      (c, p) => renderStructure(c, p));
    router.define('villes',         (c, p) => renderVilles(c, p));

    // Re-render current section when city changes
    store.subscribe(() => {
      _loadAndApplyBrandColor();
      const section = router.currentSection || 'contributions';
      const handler = {
        contributions: renderContributions,
        categories: renderCategories,
        utilisateurs: renderUsers,
        travaux: renderTravaux,
        structure: renderStructure,
        villes: renderVilles,
      }[section];
      if (handler && main) {
        main.innerHTML = '';
        const p = handler(main, { section, id: null, sub: null });
        // Remove refreshing class once section finishes loading
        if (p && typeof p.finally === 'function') {
          p.finally(() => {
            document.getElementById('adm-content')?.classList.remove('adm-content--refreshing');
          });
        }
      }
    });

    // 4. Start
    router.start();

    // Hide splash
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 300);
    }

  } catch (err) {
    console.error('[admin/app] Boot failed:', err);
    if (splash) splash.innerHTML = `<div style="color:#ef4444;text-align:center;padding:40px;"><p style="font-size:18px;font-weight:600;">Erreur de chargement</p><p style="margin-top:8px;">${err.message}</p><a href="/admin/" style="color:var(--primary);margin-top:16px;display:inline-block;">Réessayer</a></div>`;
    toast('Erreur de démarrage — vérifiez votre connexion', 'error');
  }
}

boot();

function _applyBrandColor(hex) {
  if (!hex) return;
  const m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex.trim());
  if (!m) return;
  document.documentElement.style.setProperty(
    '--adm-primary-rgb',
    `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
  );
}

async function _loadAndApplyBrandColor() {
  try {
    const branding = await api.getBranding();
    if (branding?.primary_color) _applyBrandColor(branding.primary_color);
    const logoSrc = branding?.logo_url || '/img/logos/classic_color-1.png';
    const logoAlt = branding?.brand_name || 'Grands Projets';
    const img = document.getElementById('adm-sidebar-logo');
    if (img) { img.src = logoSrc; img.alt = logoAlt; }
    const mobileImg = document.getElementById('adm-mobile-logo');
    if (mobileImg) { mobileImg.src = logoSrc; mobileImg.alt = logoAlt; }
    const mapCard = document.getElementById('adm-map-card');
    if (mapCard && store.city) {
      mapCard.href = `/?city=${encodeURIComponent(store.city)}`;
    }
    const mapCardCity = document.getElementById('adm-map-card-city');
    if (mapCardCity) mapCardCity.textContent = branding?.brand_name || store.city || '';
  } catch (e) { console.warn('[admin-app] loadAndApplyBrandColor', e); }
}
