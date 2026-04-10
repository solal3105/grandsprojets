const CATALOG = [
  { cls: 'fa-solid fa-helmet-safety',        cat: 'travaux',   label: 'Casque chantier',     kw: ['casque','chantier','travaux','sécurité','ouvrier'] },
  { cls: 'fa-solid fa-hammer',               cat: 'travaux',   label: 'Marteau',             kw: ['marteau','outil','frapper'] },
  { cls: 'fa-solid fa-wrench',               cat: 'travaux',   label: 'Clé à molette',       kw: ['clé','molette','réparation','plomberie'] },
  { cls: 'fa-solid fa-screwdriver',          cat: 'travaux',   label: 'Tournevis',           kw: ['tournevis','vissage','outil'] },
  { cls: 'fa-solid fa-screwdriver-wrench',   cat: 'travaux',   label: 'Outils',              kw: ['outils','maintenance','réparation'] },
  { cls: 'fa-solid fa-gears',                cat: 'travaux',   label: 'Engrenages',          kw: ['engrenage','technique','mécanique'] },
  { cls: 'fa-solid fa-gear',                 cat: 'travaux',   label: 'Engrenage',           kw: ['engrenage','réglage','configuration'] },
  { cls: 'fa-solid fa-trowel',               cat: 'travaux',   label: 'Truelle',             kw: ['truelle','maçon','béton','ciment'] },
  { cls: 'fa-solid fa-trowel-bricks',        cat: 'travaux',   label: 'Maçonnerie',          kw: ['mur','briques','maçon','construction'] },
  { cls: 'fa-solid fa-toolbox',              cat: 'travaux',   label: 'Boîte à outils',      kw: ['boîte','outils','bricolage'] },
  { cls: 'fa-solid fa-ban',                  cat: 'travaux',   label: 'Fermeture / Déviation',kw: ['barrière','fermeture','déviation','chantier','interdiction'] },
  { cls: 'fa-solid fa-triangle-exclamation', cat: 'travaux',   label: 'Attention',           kw: ['attention','danger','alerte','prudence'] },
  { cls: 'fa-solid fa-diamond',              cat: 'travaux',   label: 'Signalisation chantier',kw: ['cône','signal','déviation','travaux','chantier'] },
  { cls: 'fa-solid fa-truck-pickup',         cat: 'travaux',   label: 'Camion pickup',       kw: ['camion','véhicule','chantier'] },
  { cls: 'fa-solid fa-tractor',              cat: 'travaux',   label: 'Tracteur / Engin',    kw: ['tracteur','pelleteuse','engin','terrassement','chantier'] },
  { cls: 'fa-solid fa-faucet',               cat: 'travaux',   label: 'Robinet / Canalisation',kw: ['vanne','robinet','tuyau','eau','réseau','plomberie'] },
  { cls: 'fa-solid fa-ruler',                cat: 'travaux',   label: 'Règle',               kw: ['règle','mesure','dimensionner'] },
  { cls: 'fa-solid fa-ruler-combined',       cat: 'travaux',   label: 'Équerre',             kw: ['équerre','règle','mesure','architecture'] },
  { cls: 'fa-solid fa-person-digging',       cat: 'travaux',   label: 'Ouvrier',             kw: ['ouvrier','terrassement','pelle','travaux'] },
  { cls: 'fa-solid fa-hard-hat',             cat: 'travaux',   label: 'Chapeau dur',         kw: ['casque','ouvrier','chantier'] },

  { cls: 'fa-solid fa-bus',                  cat: 'transport', label: 'Bus',                 kw: ['bus','autobus','ligne','arrêt'] },
  { cls: 'fa-solid fa-train',                cat: 'transport', label: 'Train',               kw: ['train','gare','sncf','rail'] },
  { cls: 'fa-solid fa-train-subway',         cat: 'transport', label: 'Métro',               kw: ['métro','rer','souterrain'] },
  { cls: 'fa-solid fa-train-tram',           cat: 'transport', label: 'Tramway',             kw: ['tram','tramway','ligne'] },
  { cls: 'fa-solid fa-car',                  cat: 'transport', label: 'Voiture',             kw: ['voiture','auto','circulation','véhicule'] },
  { cls: 'fa-solid fa-car-side',             cat: 'transport', label: 'Voiture de côté',     kw: ['voiture','auto','profil'] },
  { cls: 'fa-solid fa-taxi',                 cat: 'transport', label: 'Taxi',                kw: ['taxi','véhicule','transport'] },
  { cls: 'fa-solid fa-truck',                cat: 'transport', label: 'Camion',              kw: ['camion','livraison','transport','fret'] },
  { cls: 'fa-solid fa-ferry',                cat: 'transport', label: 'Ferry',               kw: ['ferry','bateau','traversée','port'] },
  { cls: 'fa-solid fa-plane',                cat: 'transport', label: 'Avion',               kw: ['avion','aéroport','vol'] },
  { cls: 'fa-solid fa-road',                 cat: 'transport', label: 'Route',               kw: ['route','chaussée','voirie','axe'] },
  { cls: 'fa-solid fa-traffic-light',        cat: 'transport', label: 'Feu tricolore',       kw: ['feu','tricolore','carrefour','signalisation'] },
  { cls: 'fa-solid fa-signs-post',           cat: 'transport', label: 'Panneaux',            kw: ['panneau','signalisation','direction'] },
  { cls: 'fa-solid fa-gas-pump',             cat: 'transport', label: 'Station service',     kw: ['essence','carburant','station'] },

  { cls: 'fa-solid fa-bicycle',              cat: 'mobilite',  label: 'Vélo',                kw: ['vélo','bicyclette','piste','cyclable','vélos'] },
  { cls: 'fa-solid fa-person-biking',        cat: 'mobilite',  label: 'Cycliste',            kw: ['cycliste','vélo','piste','cyclable'] },
  { cls: 'fa-solid fa-person-walking',       cat: 'mobilite',  label: 'Piéton',              kw: ['piéton','marcheur','trottoir','accessibilité'] },
  { cls: 'fa-solid fa-wheelchair',           cat: 'mobilite',  label: 'PMR / Accessibilité', kw: ['pmr','handicap','fauteuil','accessibilité','mobilité'] },
  { cls: 'fa-solid fa-wheelchair-move',      cat: 'mobilite',  label: 'PMR en mouvement',    kw: ['pmr','handicap','accessibilité','mobilité'] },
  { cls: 'fa-solid fa-motorcycle',           cat: 'mobilite',  label: 'Moto',                kw: ['moto','deux roues','scooter'] },
  { cls: 'fa-solid fa-charging-station',     cat: 'mobilite',  label: 'Borne électrique',    kw: ['borne','électrique','recharge','ev','véhicule électrique'] },
  { cls: 'fa-solid fa-square-parking',       cat: 'mobilite',  label: 'Parking',             kw: ['parking','stationnement','parking'] },
  { cls: 'fa-solid fa-bolt',                 cat: 'mobilite',  label: 'Électrique',          kw: ['électrique','énergie','rapide','chargeur'] },
  { cls: 'fa-solid fa-person-running',       cat: 'mobilite',  label: 'Course à pied',       kw: ['course','jogging','sport','running'] },

  { cls: 'fa-solid fa-building',             cat: 'batiments', label: 'Immeuble',            kw: ['immeuble','bâtiment','bureau','résidence'] },
  { cls: 'fa-solid fa-building-columns',     cat: 'batiments', label: 'Institution',         kw: ['mairie','préfecture','institution','palais','monument'] },
  { cls: 'fa-solid fa-city',                 cat: 'batiments', label: 'Ville',               kw: ['ville','cité','urbain','skyline'] },
  { cls: 'fa-solid fa-house',                cat: 'batiments', label: 'Maison',              kw: ['maison','habitat','logement','résidentiel'] },
  { cls: 'fa-solid fa-house-chimney',        cat: 'batiments', label: 'Maison avec cheminée',kw: ['maison','cheminée','habitat','logement'] },
  { cls: 'fa-solid fa-hotel',                cat: 'batiments', label: 'Hôtel',               kw: ['hôtel','hébergement','tourisme','nuit'] },
  { cls: 'fa-solid fa-shop',                 cat: 'batiments', label: 'Commerce',            kw: ['commerce','boutique','magasin','boulangerie'] },
  { cls: 'fa-solid fa-store',                cat: 'batiments', label: 'Magasin',             kw: ['magasin','épicerie','commerce'] },
  { cls: 'fa-solid fa-hospital',             cat: 'batiments', label: 'Hôpital',             kw: ['hôpital','clinique','santé','médecin','urgences'] },
  { cls: 'fa-solid fa-school',               cat: 'batiments', label: 'École',               kw: ['école','primaire','collège','lycée','enseignement'] },
  { cls: 'fa-solid fa-graduation-cap',       cat: 'batiments', label: 'Université',          kw: ['université','fac','diplôme','études','campus'] },
  { cls: 'fa-solid fa-church',               cat: 'batiments', label: 'Église',              kw: ['église','culte','patrimoine','religion'] },
  { cls: 'fa-solid fa-landmark',             cat: 'batiments', label: 'Patrimoine',          kw: ['patrimoine','monument','historique','château'] },
  { cls: 'fa-solid fa-warehouse',            cat: 'batiments', label: 'Entrepôt',            kw: ['entrepôt','stockage','logistique','industriel'] },
  { cls: 'fa-solid fa-industry',             cat: 'batiments', label: 'Industrie',           kw: ['industrie','usine','cheminée','zone industrielle'] },
  { cls: 'fa-solid fa-tent',                 cat: 'batiments', label: 'Tente / Événement',   kw: ['tente','événement','marché','fête','festival'] },
  { cls: 'fa-solid fa-building-user',        cat: 'batiments', label: 'Accueil public',      kw: ['accueil','service public','mairie','guichet'] },

  { cls: 'fa-solid fa-bridge',               cat: 'infra',     label: 'Pont',                kw: ['pont','viaduc','ouvrage','passerelle'] },
  { cls: 'fa-solid fa-water',                cat: 'infra',     label: 'Eau / Réseau',        kw: ['eau','réseau','hydraulique','rivière','canal'] },
  { cls: 'fa-solid fa-fire',                 cat: 'infra',     label: 'Incendie',            kw: ['incendie','feu','pompier','urgence'] },
  { cls: 'fa-solid fa-fire-extinguisher',    cat: 'infra',     label: 'Extincteur / Incendie',kw: ['extincteur','bouche','incendie','pompier','réseau','sécurité'] },
  { cls: 'fa-solid fa-lightbulb',            cat: 'infra',     label: 'Éclairage',           kw: ['éclairage','lampadaire','lumière','électricité'] },
  { cls: 'fa-solid fa-plug',                 cat: 'infra',     label: 'Réseau électrique',   kw: ['électricité','réseau','prise','courant'] },
  { cls: 'fa-solid fa-wifi',                 cat: 'infra',     label: 'Wi-Fi / Numérique',   kw: ['wifi','internet','numérique','réseau','connexion'] },
  { cls: 'fa-solid fa-tower-cell',           cat: 'infra',     label: 'Antenne télécom',     kw: ['antenne','télécom','5g','réseau','signal'] },
  { cls: 'fa-solid fa-recycle',              cat: 'infra',     label: 'Recyclage',           kw: ['recyclage','déchet','tri','poubelle','ordures'] },
  { cls: 'fa-solid fa-dumpster',             cat: 'infra',     label: 'Benne',               kw: ['benne','déchets','enlèvement','ordures'] },
  { cls: 'fa-solid fa-solar-panel',          cat: 'infra',     label: 'Panneau solaire',     kw: ['solaire','photovoltaïque','énergie','renouvelable'] },
  { cls: 'fa-solid fa-wind',                 cat: 'infra',     label: 'Éolien',              kw: ['éolien','énergie','vent','renouvelable'] },
  { cls: 'fa-solid fa-tower-observation',    cat: 'infra',     label: 'Tour de surveillance',kw: ['surveillance','tour','observation','sécurité'] },

  { cls: 'fa-solid fa-tree',                 cat: 'nature',    label: 'Arbre',               kw: ['arbre','végétation','plantation','forêt','rue'] },
  { cls: 'fa-solid fa-leaf',                 cat: 'nature',    label: 'Nature / Vert',       kw: ['nature','végétation','vert','écologie','plan'] },
  { cls: 'fa-solid fa-seedling',             cat: 'nature',    label: 'Plantation',          kw: ['plantation','plante','végétalisation','jardin'] },
  { cls: 'fa-solid fa-clover',               cat: 'nature',    label: 'Fleur / Plante',      kw: ['fleur','plante','jardin','trèfle','parterre','embellissement'] },
  { cls: 'fa-solid fa-sun',                  cat: 'nature',    label: 'Soleil',              kw: ['soleil','météo','ensoleillement','chaleur'] },
  { cls: 'fa-solid fa-droplet',              cat: 'nature',    label: 'Eau',                 kw: ['eau','pluie','fontaine','assainissement'] },
  { cls: 'fa-solid fa-mountain',             cat: 'nature',    label: 'Relief',              kw: ['montagne','relief','topographie','altitude'] },
  { cls: 'fa-solid fa-person-hiking',        cat: 'nature',    label: 'Randonée',            kw: ['randonnée','sentier','nature','sport','ballade'] },
  { cls: 'fa-solid fa-mound',                cat: 'nature',    label: 'Tertre / Butte',      kw: ['butte','tertre','terrassement','relief'] },

  { cls: 'fa-solid fa-map-pin',              cat: 'general',   label: 'Épingle carte',       kw: ['épingle','point','lieu','localisation','carte'] },
  { cls: 'fa-solid fa-location-dot',         cat: 'general',   label: 'Localisation',        kw: ['localisation','adresse','lieu','géolocalisation'] },
  { cls: 'fa-solid fa-star',                 cat: 'general',   label: 'Favori / Intérêt',    kw: ['étoile','favoris','intérêt','important','notable'] },
  { cls: 'fa-solid fa-flag',                 cat: 'general',   label: 'Drapeau / Repère',    kw: ['drapeau','jalon','repère','signalisé'] },
  { cls: 'fa-solid fa-circle-info',          cat: 'general',   label: 'Information',         kw: ['info','information','renseignement','actualité'] },
  { cls: 'fa-solid fa-circle-exclamation',   cat: 'general',   label: 'Alerte',              kw: ['alerte','avertissement','urgent','attention'] },
  { cls: 'fa-solid fa-shield-halved',        cat: 'general',   label: 'Sécurité',            kw: ['sécurité','protection','police','garde'] },
  { cls: 'fa-solid fa-bell',                 cat: 'general',   label: 'Notification',        kw: ['notification','sonnerie','alarme','alerte'] },
  { cls: 'fa-solid fa-calendar-days',        cat: 'general',   label: 'Calendrier',          kw: ['calendrier','date','agenda','planning','rendez-vous'] },
  { cls: 'fa-solid fa-clock',                cat: 'general',   label: 'Horaires',            kw: ['heure','horaire','délai','durée','temps'] },
  { cls: 'fa-solid fa-users',                cat: 'general',   label: 'Habitants / Public',  kw: ['habitants','public','personnes','citoyens','communauté'] },
  { cls: 'fa-solid fa-vest',                 cat: 'general',   label: 'Agent / Technicien',  kw: ['agent','technicien','ouvrier','employé','gilet'] },
  { cls: 'fa-solid fa-envelope',             cat: 'general',   label: 'Contact / Courrier',  kw: ['courrier','email','contact','correspondance'] },
  { cls: 'fa-solid fa-phone',                cat: 'general',   label: 'Téléphone',           kw: ['téléphone','appel','contact','numéro'] },
  { cls: 'fa-solid fa-tag',                  cat: 'general',   label: 'Étiquette',           kw: ['étiquette','catégorie','tag','label','type'] },
  { cls: 'fa-solid fa-tags',                 cat: 'general',   label: 'Catégories',          kw: ['catégories','tags','types','filtres'] },
  { cls: 'fa-solid fa-folder',               cat: 'general',   label: 'Dossier',             kw: ['dossier','catégorie','ranger','classer'] },
  { cls: 'fa-solid fa-file-lines',           cat: 'general',   label: 'Document',            kw: ['document','fichier','dossier','rapport'] },
  { cls: 'fa-solid fa-clipboard-list',       cat: 'general',   label: 'Liste / Bilan',       kw: ['liste','bilan','rapport','compte-rendu'] },
  { cls: 'fa-solid fa-chart-bar',            cat: 'general',   label: 'Statistiques',        kw: ['stats','statistiques','données','graphique'] },
  { cls: 'fa-solid fa-bullhorn',             cat: 'general',   label: 'Communication',       kw: ['annonce','communication','alerte','information publique'] },
  { cls: 'fa-solid fa-comments',             cat: 'general',   label: 'Avis / Consultation', kw: ['avis','commentaires','consultation','participation'] },
  { cls: 'fa-solid fa-heart',                cat: 'general',   label: 'Bien-être',           kw: ['bien-être','santé','social','qualité de vie'] },
  { cls: 'fa-solid fa-music',                cat: 'general',   label: 'Culture / Musique',   kw: ['musique','culture','festival','événement'] },
  { cls: 'fa-solid fa-futbol',               cat: 'general',   label: 'Sport',               kw: ['sport','football','loisir','stade'] },
  { cls: 'fa-solid fa-dumbbell',             cat: 'general',   label: 'Fitness / Sport',     kw: ['fitness','sport','gym','santé'] },
  { cls: 'fa-solid fa-utensils',             cat: 'general',   label: 'Restauration',        kw: ['restaurant','repas','cantine','guinguette'] },
  { cls: 'fa-solid fa-mug-hot',              cat: 'general',   label: 'Café / Pause',        kw: ['café','pause','boisson','bar'] },
  { cls: 'fa-solid fa-book',                 cat: 'general',   label: 'Bibliothèque',        kw: ['bibliothèque','livre','lecture','médiathèque'] },
];

const CATEGORIES = [
  { id: 'travaux',   label: 'Travaux',       icon: 'fa-solid fa-helmet-safety' },
  { id: 'transport', label: 'Transport',     icon: 'fa-solid fa-bus' },
  { id: 'mobilite',  label: 'Mobilité',      icon: 'fa-solid fa-bicycle' },
  { id: 'batiments', label: 'Bâtiments',     icon: 'fa-solid fa-building' },
  { id: 'infra',     label: 'Infrastructure',icon: 'fa-solid fa-bridge' },
  { id: 'nature',    label: 'Nature',        icon: 'fa-solid fa-tree' },
  { id: 'general',   label: 'Général',       icon: 'fa-solid fa-star' },
];

const RECENT_KEY = 'adm-icon-recent';
const RECENT_MAX = 8;

function _getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { console.debug('[icon-picker] getRecents', e); return []; }
}
function _pushRecent(cls) {
  const list = _getRecents().filter(c => c !== cls);
  list.unshift(cls);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch (e) { console.debug('[icon-picker] pushRecent', e); }
}

let _popover = null;
let _state = { category: 'general', search: '', onSelect: null, inputEl: null, triggerEl: null };

export function setIconField(container, id, cls) {
  const input = container.querySelector(`#${id}`);
  const previewI = container.querySelector(`#${id}-btn .adm-ip-trigger__preview i`);
  if (input) input.value = cls;
  if (previewI) previewI.className = cls;
}

export function renderIconField(id, value, defaultIcon = 'fa-solid fa-tag') {
  const cls = value || defaultIcon;
  return `<div class="adm-ip-field" data-ip-for="${id}">
    <button type="button" class="adm-ip-trigger" id="${id}-btn" aria-label="Choisir une icône" aria-haspopup="listbox">
      <div class="adm-ip-trigger__preview"><i class="${cls}"></i></div>
      <div class="adm-ip-trigger__text">
        <span class="adm-ip-trigger__hint">Cliquer pour changer l'icône</span>
      </div>
      <i class="fa-solid fa-chevron-down adm-ip-trigger__arrow"></i>
    </button>
    <input type="hidden" id="${id}" value="${cls}">
  </div>`;
}

export function bindIconField(container, id, opts = {}) {
  const btn = container.querySelector(`#${id}-btn`);
  const input = container.querySelector(`#${id}`);
  if (!btn || !input) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    _open({
      triggerEl: btn,
      inputEl: input,
      category: opts.category || 'general',
      onSelect: opts.onSelect || null,
    });
  });
}

function _open({ triggerEl, inputEl, category, onSelect }) {
  _state = { category, search: '', onSelect, inputEl, triggerEl };
  if (!_popover) _popover = _createPopover();
  _renderPopover();
  _positionPopover(triggerEl);
  _popover.hidden = false;
  requestAnimationFrame(() => _popover.classList.add('adm-ip-popover--open'));
  _popover.querySelector('.adm-ip-search')?.focus();
}

function _close() {
  if (!_popover || _popover.hidden) return;
  _popover.classList.remove('adm-ip-popover--open');
  // Fallback : si transitionend ne se déclenche pas (ex. environnement headless),
  // on masque l'élément après la durée de la transition (0.18s + marge).
  let done = false;
  const hide = () => { if (!done && _popover) { done = true; _popover.hidden = true; } };
  _popover.addEventListener('transitionend', hide, { once: true });
  setTimeout(hide, 250);
}

function _select(cls) {
  if (_state.inputEl) {
    _state.inputEl.value = cls;
    _state.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    _state.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Update the trigger preview
  if (_state.triggerEl) {
    const ico = _state.triggerEl.querySelector('.adm-ip-trigger__preview i');
    if (ico) ico.className = cls;
  }
  _pushRecent(cls);
  if (typeof _state.onSelect === 'function') _state.onSelect(cls);
  _close();
}

function _createPopover() {
  const el = document.createElement('div');
  el.className = 'adm-ip-popover';
  el.hidden = true;
  el.setAttribute('role', 'listbox');
  el.setAttribute('aria-label', 'Choisir une icône');
  document.body.appendChild(el);

  // Global click-outside — guard against detached targets (happens when _renderPopover rebuilds innerHTML)
  document.addEventListener('click', (e) => {
    if (_popover && !_popover.hidden &&
        e.target.isConnected &&
        !_popover.contains(e.target) &&
        !_state.triggerEl?.contains(e.target)) {
      _close();
    }
  });
  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _popover && !_popover.hidden) _close();
  });

  return el;
}

function _renderPopover() {
  const recents = _getRecents();
  const tabs = [
    ...(recents.length > 0 ? [{ id: 'recent', label: 'Récents', icon: 'fa-solid fa-clock-rotate-left' }] : []),
    ...CATEGORIES,
  ];

  _popover.innerHTML = `
    <!-- Search -->
    <div class="adm-ip-search-wrap">
      <i class="fa-solid fa-magnifying-glass adm-ip-search-ico"></i>
      <input class="adm-ip-search" type="text" placeholder="Rechercher… (vélo, chantier, eau…)" autocomplete="off" value="${_esc(_state.search)}">
      <button type="button" class="adm-ip-search-clear"${_state.search ? '' : ' hidden'}><i class="fa-solid fa-xmark"></i></button>
    </div>
    <!-- Tabs -->
    <div class="adm-ip-tabs" role="tablist">
      ${tabs.map(t => `
        <button type="button" class="adm-ip-tab ${_state.category === t.id ? 'adm-ip-tab--active' : ''}" 
          data-cat="${t.id}" role="tab" aria-selected="${_state.category === t.id}">
          <i class="${t.icon}"></i><span>${t.label}</span>
        </button>`).join('')}
    </div>
    <!-- Grid -->
    <div class="adm-ip-grid-wrap">
      <div class="adm-ip-grid" role="group"></div>
      <div class="adm-ip-empty" hidden>
        <i class="fa-solid fa-face-frown-open"></i>
        <span>Aucune icône trouvée</span>
      </div>
    </div>
    <!-- Advanced (collapsed) -->
    <details class="adm-ip-advanced">
      <summary class="adm-ip-advanced__trigger">
        <i class="fa-solid fa-code"></i> Saisir une classe manuellement
      </summary>
      <div class="adm-ip-advanced__body">
        <div class="adm-ip-advanced__row">
          <input type="text" class="adm-ip-manual-input" placeholder="fa-solid fa-xxx" spellcheck="false">
          <button type="button" class="adm-ip-manual-apply">Appliquer</button>
        </div>
        <a class="adm-ip-advanced__link" href="https://fontawesome.com/search?o=r&m=free" target="_blank" rel="noopener">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Parcourir Font Awesome Free
        </a>
      </div>
    </details>
  `;

  _bindPopoverEvents();
  _renderGrid();
}

function _bindPopoverEvents() {
  const searchEl = _popover.querySelector('.adm-ip-search');
  const clearBtn = _popover.querySelector('.adm-ip-search-clear');
  let _t;

  // Search — only update grid, never rebuild full HTML
  searchEl?.addEventListener('input', (e) => {
    clearTimeout(_t);
    _t = setTimeout(() => {
      _state.search = e.target.value.trim().toLowerCase();
      if (clearBtn) clearBtn.hidden = !_state.search;
      _renderGrid();
      // Restore focus (not needed if we don't rebuild, but kept as safety)
      if (document.activeElement !== searchEl) searchEl?.focus();
    }, 180);
  });

  // Clear search
  clearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    _state.search = '';
    if (searchEl) searchEl.value = '';
    clearBtn.hidden = true;
    _renderGrid();
    searchEl?.focus();
  });

  // Tabs — stopPropagation prevents click bubbling to the click-outside handler
  // Only update active states + re-render grid, never rebuild full HTML
  _popover.querySelectorAll('.adm-ip-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      _state.category = tab.dataset.cat;
      _state.search = '';
      if (searchEl) searchEl.value = '';
      if (clearBtn) clearBtn.hidden = true;
      _popover.querySelectorAll('.adm-ip-tab').forEach(t => {
        t.classList.toggle('adm-ip-tab--active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      _renderGrid();
    });
  });

  // Manual apply
  const manualInput = _popover.querySelector('.adm-ip-manual-input');
  _popover.querySelector('.adm-ip-manual-apply')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const val = manualInput?.value?.trim();
    if (val) _select(val);
  });
  manualInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const val = manualInput.value.trim(); if (val) _select(val); }
  });
}

function _renderGrid() {
  const grid = _popover.querySelector('.adm-ip-grid');
  const empty = _popover.querySelector('.adm-ip-empty');
  if (!grid) return;

  let icons;
  if (_state.search) {
    // Search takes priority over category tab
    const q = _state.search;
    icons = CATALOG.filter(e =>
      e.label.toLowerCase().includes(q) ||
      e.cls.toLowerCase().includes(q) ||
      e.kw.some(k => k.includes(q))
    );
  } else if (_state.category === 'recent') {
    icons = _getRecents().map(cls => CATALOG.find(e => e.cls === cls) || { cls, label: cls, kw: [] }).filter(Boolean);
  } else {
    icons = CATALOG.filter(e => e.cat === _state.category);
  }

  // Toggle empty state via CSS class (not `hidden` attr, which the display:flex rule would override)
  if (icons.length === 0) {
    grid.innerHTML = '';
    empty.classList.add('adm-ip-empty--visible');
    return;
  }
  empty.classList.remove('adm-ip-empty--visible');

  const currentVal = _state.inputEl?.value || '';
  grid.innerHTML = icons.map(entry => `
    <button type="button" class="adm-ip-icon ${entry.cls === currentVal ? 'adm-ip-icon--selected' : ''}"
      data-cls="${entry.cls}" title="${_esc(entry.label)}" role="option" aria-selected="${entry.cls === currentVal}">
      <i class="${entry.cls}"></i>
      <span>${_esc(entry.label)}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.adm-ip-icon').forEach(btn => {
    btn.addEventListener('click', () => _select(btn.dataset.cls));
  });
}

function _positionPopover(trigger) {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const popW = 440;
  const popH = 480;
  const gap = 8;

  // Horizontal: align left edge with trigger, constrain to viewport
  let left = rect.left + window.scrollX;
  if (left + popW > vw - 12) left = vw - popW - 12;
  if (left < 12) left = 12;

  // Vertical: prefer below, flip above if not enough room
  let top, openUp = false;
  if (rect.bottom + gap + popH <= vh) {
    top = rect.bottom + window.scrollY + gap;
  } else if (rect.top - gap - popH >= 0) {
    top = rect.top + window.scrollY - gap - popH;
    openUp = true;
  } else {
    top = rect.bottom + window.scrollY + gap;
  }

  _popover.style.left = `${left}px`;
  _popover.style.top = `${top}px`;
  _popover.style.width = `${popW}px`;
  _popover.classList.toggle('adm-ip-popover--up', openUp);
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
