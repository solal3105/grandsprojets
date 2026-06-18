/**
 * fdlm-layer-toggles.js — Widget de toggle de couches spécifique à fdlm
 * TEMPORAIRE — supprimer ce fichier + son <script> dans index.html
 *              + l'appel FdlmLayerToggles?.init() dans main.js pour nettoyer
 *
 * Dépendances : window.DataModule, window.MapModule, window.CityManager
 * Init : appelé par main.js après DataModule.initConfig() (Phase 4)
 */
window.FdlmLayerToggles = (() => {

  // Couches gérées par ce widget — configurable ici
  const TOGGLEABLE_LAYERS = [
    { name: 'Fontaines', label: 'Fontaines' },
  ];

  const CITY = 'fdlm';

  let container = null;
  let splashEl = null;
  let splashTimer = null;
  // État des toggles : { [layerName]: boolean }
  const state = {};

  const SPLASH_ON  = 'img/fdlm/fontaines_activees.jpeg';
  const SPLASH_OFF = 'img/fdlm/fontaines_desactivees.png';

  function showSplash(src) {
    if (!splashEl) {
      splashEl = document.createElement('div');
      splashEl.className = 'fdlm-splash';
      const img = document.createElement('img');
      img.className = 'fdlm-splash__img';
      img.alt = '';
      splashEl.appendChild(img);
      splashEl.addEventListener('click', () => hideSplash());
      document.body.appendChild(splashEl);
    }
    splashEl.querySelector('img').src = src;
    splashEl.classList.add('is-visible');
    clearTimeout(splashTimer);
    splashTimer = setTimeout(() => hideSplash(), 1500);
  }

  function hideSplash() {
    clearTimeout(splashTimer);
    splashEl?.classList.remove('is-visible');
  }

  function getActiveCity() {
    return window.CityManager?.getActiveCity?.() || '';
  }

  function isLayerOnMap(layerName) {
    return !!(window.MapModule?.layers?.[layerName]);
  }

  async function enableLayer(layerName) {
    const DM = window.DataModule;
    const MM = window.MapModule;
    if (!DM || !MM) return;

    // Données déjà en cache (preloadLayer lancé en Phase 5 de main.js)
    await DM.preloadLayer(layerName);
    const data = DM.layerData[layerName];
    if (!data) return;

    if (!isLayerOnMap(layerName)) {
      DM.createGeoJsonLayer(layerName, data);
    }
  }

  function disableLayer(layerName) {
    window.MapModule?.removeLayer?.(layerName);
  }

  function setButtonState(btn, active) {
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
    const label = btn.querySelector('.fdlm-layer-toggles__btn-label');
    if (label) label.textContent = active ? `Masquer les ${btn.dataset.layerLabel.toLowerCase()}` : `Afficher les ${btn.dataset.layerLabel.toLowerCase()}`;
    btn.title = label?.textContent || '';
  }

  function buildButton(layerDef) {
    const iconClass = window.iconMap?.[layerDef.name] || 'fas fa-layer-group';
    const iconColor = window.iconColorMap?.[layerDef.name] || 'var(--color-primary)';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fdlm-layer-toggles__btn';
    btn.dataset.layer = layerDef.name;
    btn.dataset.layerLabel = layerDef.label;
    btn.setAttribute('aria-pressed', 'false');

    btn.innerHTML = `
      <span class="fdlm-layer-toggles__btn-icon">
        <i class="${window.SecurityUtils?.escapeHtml?.(iconClass) || iconClass}" aria-hidden="true"></i>
      </span>
      <span class="fdlm-layer-toggles__btn-label">${window.SecurityUtils?.escapeHtml?.(layerDef.label) || layerDef.label}</span>
    `;

    // Couleur de l'icône (désactivée, elle suit le token CSS)
    btn.querySelector('.fdlm-layer-toggles__btn-icon').style.setProperty('--layer-color', iconColor);

    // État initial : actif si le layer est déjà sur la carte (is_default)
    const active = isLayerOnMap(layerDef.name);
    state[layerDef.name] = active;
    setButtonState(btn, active);

    btn.addEventListener('click', async () => {
      const isActive = state[layerDef.name];
      if (isActive) {
        disableLayer(layerDef.name);
        state[layerDef.name] = false;
        setButtonState(btn, false);
        showSplash(SPLASH_OFF);
      } else {
        setButtonState(btn, true); // optimistic
        state[layerDef.name] = true;
        await enableLayer(layerDef.name);
        // Re-sync si le chargement a échoué
        state[layerDef.name] = isLayerOnMap(layerDef.name);
        setButtonState(btn, state[layerDef.name]);
        if (state[layerDef.name]) showSplash(SPLASH_ON);
      }
    });

    return btn;
  }

  function mount() {
    if (container) return;

    container = document.createElement('div');
    container.className = 'fdlm-layer-toggles';
    container.setAttribute('aria-label', 'Couches de la carte');

    TOGGLEABLE_LAYERS.forEach(layerDef => {
      container.appendChild(buildButton(layerDef));
    });

    document.body.appendChild(container);
  }

  function unmount() {
    container?.remove();
    container = null;
  }

  /**
   * Point d'entrée — appelé par main.js après DataModule.initConfig()
   * Se monte uniquement si la ville active est fdlm.
   */
  function init() {
    if (getActiveCity() !== CITY) return;
    // Attendre que le DOM soit prêt (main.js appelle déjà après DOMContentLoaded)
    mount();
  }

  return { init, mount, unmount };
})();
