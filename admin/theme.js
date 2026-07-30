// Thème clair/sombre de l'admin.
// La logique d'état (localStorage 'theme', sync OS, data-theme) est déléguée à
// window.ThemeManager (module partagé avec la carte, chargé par index.html) -
// ce module ne gère que l'UI admin : bouton toggle et thème du Toast UI Editor.

const LABELS = { dark: 'Mode clair', light: 'Mode sombre' };
const ICONS  = { dark: 'fa-solid fa-sun', light: 'fa-solid fa-moon' };

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function syncToggleButton() {
  const btn = document.getElementById('adm-theme-toggle');
  if (!btn) return;
  const theme = currentTheme();
  const icon = btn.querySelector('i');
  if (icon) icon.className = ICONS[theme];
  btn.title = LABELS[theme];
  btn.setAttribute('aria-label', LABELS[theme]);
}

// Le Toast UI Editor applique son thème sombre via la classe .toastui-editor-dark
// sur son conteneur racine - on la synchronise sur les éditeurs déjà montés
// (ceux créés après coup reçoivent l'option `theme` à l'instanciation).
function syncEditorTheme() {
  const dark = currentTheme() === 'dark';
  document.querySelectorAll('.toastui-editor-defaultUI').forEach((el) => {
    el.classList.toggle('toastui-editor-dark', dark);
  });
}

export function initTheme() {
  window.ThemeManager?.init();
  window.ThemeManager?.startOSThemeSync?.();
  syncToggleButton();

  document.getElementById('adm-theme-toggle')?.addEventListener('click', () => {
    window.ThemeManager?.toggle();
  });

  // data-theme change via le toggle OU la sync OS → observer l'attribut
  const observer = new MutationObserver(() => {
    syncToggleButton();
    syncEditorTheme();
    document.dispatchEvent(new CustomEvent('adm:themechange', { detail: { theme: currentTheme() } }));
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
