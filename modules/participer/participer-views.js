// modules/participer/participer-views.js
// Module Participer - vues partagées : formulaire de dépôt, explorateur,
// couche carte, modal détail, page de suivi (deep-link ?participer_suivi=).
// Consommé par participer-nav.js (navigation) et main.js (deep-link Phase 8).
// Aucune écriture directe en base : tout passe par les routes /api/participer/*.

;(function(win) {
  'use strict';

  const API = '/api/participer';
  const LAYER_NAME = 'participer';

  const esc = (s) => win.SecurityUtils?.escapeHtml?.(s) ?? String(s ?? '');
  const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : 'var(--color-info)');
  const safeIcon = (i) => (win.normalizeIconClass ? win.normalizeIconClass(i, 'fa-circle-exclamation')
    : 'fa-solid fa-circle-exclamation');
  const activeCity = () => win.getActiveCity?.() ?? win.activeCity;
  const capture = (event, props) => win.OPAnalytics?.capture?.(event, props);

  /* Jeton de suivi : capturé au chargement puis retiré de la barre d'adresse
     au plus tôt, pour qu'il ne traîne ni dans l'historique ni dans les outils
     de mesure d'audience (PostHog le masque aussi côté capture). */
  let _pendingSuivi = null;
  let _pendingNotice = null;
  try {
    const sp = new URLSearchParams(win.location.search);
    _pendingSuivi = sp.get('participer_suivi') || null;
    _pendingNotice = sp.get('participer') || null;
    if (_pendingSuivi || _pendingNotice) {
      sp.delete('participer_suivi');
      sp.delete('participer');
      const rest = sp.toString();
      win.history.replaceState(null, '', win.location.pathname + (rest ? `?${rest}` : '') + win.location.hash);
    }
  } catch { /* URL exotique : tant pis pour le deep-link */ }

  /* ── Accès API ─────────────────────────────────────────────────── */

  async function apiGet(path) {
    const r = await fetch(`${API}${path}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  async function apiPost(path, payload) {
    const r = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  const _configCache = {};
  async function loadConfig(city) {
    if (!_configCache[city]) {
      _configCache[city] = apiGet(`/config?ville=${encodeURIComponent(city)}`)
        .catch((e) => { delete _configCache[city]; throw e; });
    }
    return _configCache[city];
  }

  /* ── Couche carte ──────────────────────────────────────────────── */

  let _layerCity = null;

  function markerIcon(props) {
    return win.L.divIcon({
      html: `<div class="pt-marker" style="--pt-color:${safeColor(props.statut_color)}"><i class="${safeIcon(props.category_icon)}"></i></div>`,
      className: 'pt-marker-container',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15],
    });
  }

  /** Charge (ou recharge) la couche des signalements publiés de la ville. */
  async function ensureLayer(city, { force = false } = {}) {
    if (!win.MapModule || !win.L) return;
    if (!force && _layerCity === city && win.MapModule.layers?.[LAYER_NAME]) return;
    try {
      const data = await apiGet(`/geojson?ville=${encodeURIComponent(city)}`);
      win.MapModule.removeLayer(LAYER_NAME);
      const layer = win.L.geoJSON(data, {
        pointToLayer: (feature, latlng) => win.L.marker(latlng, { icon: markerIcon(feature.properties) }),
        onEachFeature: (feature, lyr) => {
          lyr.on('click', () => openDetailById(city, feature.properties.id));
        },
      });
      layer.addTo(win.MapModule.map);
      win.MapModule.addLayer(LAYER_NAME, layer);
      _layerCity = city;
      _layerData[city] = data;
    } catch (e) {
      console.debug('[Participer] couche indisponible:', e?.message);
    }
  }

  const _layerData = {};
  function removeLayer() {
    win.MapModule?.removeLayer(LAYER_NAME);
    _layerCity = null;
  }

  /* ── Formulaire « Signaler » ───────────────────────────────────── */

  const _draft = { lat: null, lng: null, marker: null, category: null, photo: null, placing: false };
  let _mapClickBound = false;

  function _resetDraft() {
    if (_draft.marker) {
      try { win.MapModule?.map?.removeLayer(_draft.marker); } catch { /* déjà retirée */ }
    }
    Object.assign(_draft, { lat: null, lng: null, marker: null, category: null, photo: null, placing: false });
  }

  function _setPoint(lat, lng, container) {
    _draft.lat = lat;
    _draft.lng = lng;
    const map = win.MapModule?.map;
    if (map && win.L) {
      if (_draft.marker) { try { map.removeLayer(_draft.marker); } catch { /* déjà retirée */ } }
      const icon = win.L.divIcon({
        html: `<div class="pt-marker pt-marker--draft" style="--pt-color:var(--color-primary)"><i class="fa-solid fa-location-dot"></i></div>`,
        className: 'pt-marker-container',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      _draft.marker = win.L.marker([lat, lng], { icon }).addTo(map);
    }
    const hint = container?.querySelector('#pt-loc-hint');
    if (hint) {
      hint.innerHTML = `<i class="fa-solid fa-circle-check"></i> Point placé - touchez la carte pour le déplacer`;
      hint.classList.add('is-set');
    }
    _updateSubmitState(container);
  }

  function _bindMapClick() {
    _draft.placing = true;
    if (_mapClickBound) return;
    const map = win.MapModule?.map;
    if (!map) return;
    // Un seul écouteur pour toute la vie de la page : le drapeau `placing`
    // le neutralise dès que le formulaire n'est plus affiché (pas de off() sur le shim)
    map.on('click', (e) => {
      if (!_draft.placing || !e?.latlng) return;
      _setPoint(e.latlng.lat, e.latlng.lng, _formContainer());
    });
    _mapClickBound = true;
  }

  let _formRoot = null;
  const _formContainer = () => _formRoot;

  /** Ré-encode la photo via canvas : supprime les métadonnées EXIF (position
      du domicile...) et borne le poids. Toujours ré-encodée, jamais l'original. */
  async function _encodePhoto(file) {
    if (!String(file?.type || '').startsWith('image/')) return null;
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, 1600 / bitmap.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', 0.82);
    } finally {
      bitmap.close?.();
    }
  }

  function _updateSubmitState(container) {
    if (!container) return;
    const btn = container.querySelector('#pt-submit');
    if (!btn) return;
    const email = container.querySelector('#pt-email')?.value.trim() || '';
    const ok = _draft.lat != null && _draft.category && /^[^\s@]+@[^\s@,;]+\.[a-z]{2,}$/i.test(email);
    btn.disabled = !ok;
  }

  function buildSignaler(container, config) {
    _formRoot = container;
    _resetDraft();
    const settings = config.settings || {};

    if (settings.paused) {
      container.innerHTML = `
        <div class="nav-panel__empty pt-paused">
          <i class="fa-solid fa-circle-pause"></i>
          <span>${esc(settings.pause_message || 'Les dépôts sont momentanément suspendus.')}</span>
        </div>`;
      return;
    }

    const intro = settings.intro_text
      || 'Un problème, une idée sur l\'espace public ? Signalez-le à votre collectivité en moins de 2 minutes, sans créer de compte.';

    container.innerHTML = `
      <form class="pt-form" novalidate>
        <p class="pt-intro">${esc(intro)}</p>

        <div class="pt-step"><span class="pt-step__num">1</span><span>Où ?</span></div>
        <div class="pt-locate">
          <button type="button" class="pt-locate__btn" id="pt-geoloc"><i class="fa-solid fa-location-crosshairs"></i> Ma position</button>
          <div class="pt-locate__hint" id="pt-loc-hint"><i class="fa-solid fa-hand-pointer"></i> Touchez la carte pour placer le point</div>
        </div>
        <input class="pt-input" id="pt-adresse" maxlength="300" placeholder="Adresse ou précision (facultatif)" autocomplete="off">

        <div class="pt-step"><span class="pt-step__num">2</span><span>Quoi ?</span></div>
        <div class="pt-cats" id="pt-cats">
          ${(config.categories || []).map((c) => `
            <button type="button" class="pt-cat" data-key="${esc(c.category_key)}" style="--pt-color:${safeColor(c.color)}" title="${esc(c.help_text || '')}">
              <i class="${safeIcon(c.icon_class)}"></i><span>${esc(c.label)}</span>
            </button>`).join('')}
        </div>

        <div class="pt-step"><span class="pt-step__num">3</span><span>Précisez (facultatif)</span></div>
        <textarea class="pt-input pt-textarea" id="pt-desc" maxlength="1000" rows="3" placeholder="Décrivez en quelques mots"></textarea>
        <label class="pt-photo" id="pt-photo-label">
          <input type="file" id="pt-photo" accept="image/*" hidden>
          <i class="fa-solid fa-camera"></i><span id="pt-photo-text">Ajouter une photo</span>
        </label>
        <div class="pt-photo-preview" id="pt-photo-preview" hidden>
          <img alt="Aperçu de la photo">
          <button type="button" class="pt-photo-remove" aria-label="Retirer la photo"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="pt-step"><span class="pt-step__num">4</span><span>Pour vous tenir informé</span></div>
        <input class="pt-input" type="email" id="pt-email" maxlength="180" placeholder="Votre email (jamais public)" autocomplete="email" required>
        <input class="pt-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="pt-legal">Votre adresse sert uniquement à confirmer et suivre ce signalement. Elle n'est jamais publiée et sera supprimée au plus tard 12 mois après la clôture. <a href="/home/confidentialite" target="_blank" rel="noopener">En savoir plus</a></p>
        <p class="pt-urgence"><i class="fa-solid fa-triangle-exclamation"></i> En cas de danger immédiat, n'utilisez pas ce formulaire : appelez le 112.</p>

        <button type="submit" class="pt-submit" id="pt-submit" disabled>Envoyer mon signalement</button>
        <div class="pt-feedback" id="pt-feedback" role="alert" hidden></div>
      </form>`;

    _bindMapClick();

    container.querySelector('#pt-geoloc')?.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          _setPoint(pos.coords.latitude, pos.coords.longitude, container);
          try { win.MapModule?.map?.flyTo([pos.coords.latitude, pos.coords.longitude], 16); } catch { /* zoom conservé */ }
        },
        () => win.Toast?.show('Position indisponible - touchez la carte pour placer le point', 'warning'),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    container.querySelector('#pt-cats')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pt-cat');
      if (!btn) return;
      container.querySelectorAll('.pt-cat').forEach((b) => b.classList.toggle('is-active', b === btn));
      _draft.category = btn.dataset.key;
      _updateSubmitState(container);
    });

    const photoInput = container.querySelector('#pt-photo');
    const preview = container.querySelector('#pt-photo-preview');
    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await _encodePhoto(file);
        if (!dataUrl || dataUrl.length > 5.5 * 1024 * 1024) throw new Error('trop lourde');
        _draft.photo = dataUrl;
        preview.querySelector('img').src = dataUrl;
        preview.hidden = false;
        container.querySelector('#pt-photo-text').textContent = 'Changer la photo';
      } catch {
        _draft.photo = null;
        win.Toast?.show('Photo illisible ou trop lourde', 'error');
      }
    });
    preview?.querySelector('.pt-photo-remove')?.addEventListener('click', () => {
      _draft.photo = null;
      photoInput.value = '';
      preview.hidden = true;
      container.querySelector('#pt-photo-text').textContent = 'Ajouter une photo';
    });

    container.querySelector('#pt-email')?.addEventListener('input', () => _updateSubmitState(container));

    container.querySelector('.pt-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = container.querySelector('#pt-submit');
      const feedback = container.querySelector('#pt-feedback');
      btn.disabled = true;
      btn.textContent = 'Envoi en cours...';
      feedback.hidden = true;
      try {
        await apiPost('/submit', {
          ville: activeCity(),
          category_key: _draft.category,
          lat: _draft.lat,
          lng: _draft.lng,
          adresse: container.querySelector('#pt-adresse')?.value.trim() || null,
          description: container.querySelector('#pt-desc')?.value.trim() || null,
          email: container.querySelector('#pt-email')?.value.trim(),
          photo: _draft.photo,
          website: container.querySelector('.pt-hp')?.value || '',
        });
        capture('participer_submitted', { ville: activeCity(), category: _draft.category, photo: Boolean(_draft.photo) });
        const success = (config.settings?.success_text)
          || 'Dernière étape : ouvrez l\'email que nous venons de vous envoyer et confirmez votre signalement. Pensez à vérifier vos indésirables.';
        container.innerHTML = `
          <div class="pt-success">
            <i class="fa-solid fa-envelope-circle-check"></i>
            <h3>Presque fini !</h3>
            <p>${esc(success)}</p>
          </div>`;
        _resetDraft();
      } catch (err) {
        feedback.textContent = err.message || 'Envoi impossible - réessayez';
        feedback.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Envoyer mon signalement';
      }
    });
  }

  /** À appeler quand on quitte la vue Signaler : fige la pose de point. */
  function stopSignaler() {
    _draft.placing = false;
    _resetDraft();
  }

  /* ── Explorateur ───────────────────────────────────────────────── */

  function buildExplorer(container, config, city) {
    const data = _layerData[city];
    const features = data?.features || [];
    if (!features.length) {
      container.innerHTML = `
        <div class="nav-panel__empty">
          <i class="fa-solid fa-map-location-dot"></i>
          <span>Aucun signalement publié pour le moment</span>
        </div>`;
      return;
    }

    const statutsPresents = (config.statuts || [])
      .filter((s) => features.some((f) => f.properties.statut_key === s.statut_key));

    container.innerHTML = `
      <div class="pt-explorer">
        <div class="pt-explorer__count">${features.length} signalement${features.length > 1 ? 's' : ''}</div>
        <div class="pt-filters">
          <button class="pt-filter is-active" data-statut="">Tous</button>
          ${statutsPresents.map((s) => `
            <button class="pt-filter" data-statut="${esc(s.statut_key)}" style="--pt-color:${safeColor(s.color)}">${esc(s.label)}</button>`).join('')}
        </div>
        <div class="pt-list" id="pt-list"></div>
      </div>`;

    const list = container.querySelector('#pt-list');
    const renderList = (statutKey) => {
      const items = statutKey
        ? features.filter((f) => f.properties.statut_key === statutKey)
        : features;
      list.innerHTML = items.map((f) => {
        const p = f.properties;
        const date = p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return `
          <button class="pt-item" data-id="${esc(p.id)}">
            <span class="pt-item__icon" style="--pt-color:${safeColor(p.category_color)}"><i class="${safeIcon(p.category_icon)}"></i></span>
            <span class="pt-item__body">
              <span class="pt-item__title">${esc(p.category_label)}</span>
              ${p.description ? `<span class="pt-item__desc">${esc(String(p.description).slice(0, 90))}</span>` : ''}
              <span class="pt-item__meta">${esc(p.reference)}${date ? ` · ${date}` : ''}</span>
            </span>
            <span class="pt-statut-pill" style="--pt-color:${safeColor(p.statut_color)}">${esc(p.statut_label)}</span>
          </button>`;
      }).join('') || '<div class="nav-panel__empty"><span>Rien dans ce statut</span></div>';
    };
    renderList('');

    container.querySelector('.pt-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pt-filter');
      if (!btn) return;
      container.querySelectorAll('.pt-filter').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderList(btn.dataset.statut);
    });

    list?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pt-item');
      if (!btn) return;
      const feature = features.find((f) => f.properties.id === btn.dataset.id);
      if (feature) {
        const [lng, lat] = feature.geometry.coordinates;
        try { win.MapModule?.map?.flyTo([lat, lng], 16); } catch { /* zoom conservé */ }
      }
      openDetailById(city, btn.dataset.id);
    });
  }

  /* ── Modal détail (réutilise le panneau #project-detail) ───────── */

  const EVENT_LABELS = {
    creation: 'Signalement déposé',
    publication: 'Publié sur la carte',
  };

  function _eventsTimeline(events) {
    if (!events?.length) return '';
    return `
      <div class="pt-timeline">
        <div class="pt-timeline__label"><i class="fa-solid fa-timeline"></i> Suivi</div>
        ${events.map((ev) => {
          const date = ev.created_at ? new Date(ev.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
          const label = ev.type === 'statut' ? (ev.statut_label || ev.new_statut) : (EVENT_LABELS[ev.type] || ev.type);
          return `
            <div class="pt-timeline__item">
              <span class="pt-timeline__dot"></span>
              <div class="pt-timeline__body">
                <div class="pt-timeline__title">${esc(label)}<span class="pt-timeline__date">${esc(date)}</span></div>
                ${ev.message_public ? `<blockquote class="pt-timeline__msg">${esc(ev.message_public)}</blockquote>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function openParticiperModal({ own, signalement: s, events }) {
    const panel = document.getElementById('project-detail');
    if (!panel) return;

    const color = safeColor(s.category_color);
    const date = s.created_at ? new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    panel.innerHTML = `
      <div class="detail-overlay-btns">
        <button id="detail-back-btn" class="detail-back-floating" aria-label="Retour"><i class="fa-solid fa-arrow-left"></i></button>
        <button id="detail-close-btn" class="detail-close-floating" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="detail-scroll-body">
        <div class="detail-hero" style="--cat-color:${color}">
          <div class="detail-hero__grad"></div>
          <div class="detail-hero__travaux-icon"><i class="${safeIcon(s.category_icon)}"></i></div>
        </div>
        <div class="detail-content-wrap">
          ${own && s.email_confirmed === false ? `
          <div class="tw-detail-pending-banner">
            <i class="fa-solid fa-envelope"></i>
            <span>Confirmez votre adresse email pour transmettre ce signalement</span>
          </div>` : ''}
          ${own && s.published === false && s.email_confirmed !== false ? `
          <div class="tw-detail-pending-banner">
            <i class="fa-solid fa-clock"></i>
            <span>Transmis à votre collectivité - visible sur la carte après modération</span>
          </div>` : ''}
          <div class="detail-title-row">
            <span class="detail-cat-icon" style="--cat-color:${color}"><i class="${safeIcon(s.category_icon)}"></i></span>
            <div style="flex:1;min-width:0">
              <h3 class="detail-title">${esc(s.category_label)}</h3>
              <div class="detail-description" style="margin:4px 0 0">${esc(s.reference)}${date ? ` · ${date}` : ''}</div>
            </div>
            <span class="pt-statut-pill" style="--pt-color:${safeColor(s.statut_color)};flex-shrink:0">${esc(s.statut_label)}</span>
          </div>
          ${s.adresse ? `<div class="detail-chips"><span class="detail-chip"><i class="fa-solid fa-location-dot"></i>${esc(s.adresse)}</span></div>` : ''}
          ${s.photo_url ? `<img class="pt-detail-photo" src="${esc(s.photo_url)}" alt="Photo du signalement" loading="lazy">` : ''}
          ${s.description ? `<p class="detail-description" style="margin-top:14px">${esc(s.description)}</p>` : ''}
          ${_eventsTimeline(events)}
          ${own ? `
          <p class="pt-own-note"><i class="fa-solid fa-user-lock"></i> Cette page de suivi est personnelle : conservez l'email qui y mène.</p>` : `
          <div class="pt-retrait">
            <button type="button" class="pt-retrait__toggle" id="pt-retrait-toggle">Demander le retrait de ce contenu</button>
            <form class="pt-retrait__form" id="pt-retrait-form" hidden>
              <textarea class="pt-input pt-textarea" id="pt-retrait-motif" maxlength="500" rows="2" placeholder="Pourquoi ce contenu doit-il être retiré ?" required></textarea>
              <input class="pt-input" type="email" id="pt-retrait-email" maxlength="180" placeholder="Votre email pour la réponse (facultatif)">
              <button type="submit" class="pt-submit pt-submit--small">Transmettre à la collectivité</button>
            </form>
          </div>`}
        </div>
      </div>`;

    panel.style.setProperty('--cat-color', color);
    panel.style.display = 'flex';
    win.NavPanel?.collapse?.();

    const dismiss = () => {
      panel.style.display = 'none';
      panel.innerHTML = '';
      if (win.NavPanel?.getState?.()?.level > 0) win.NavPanel.expand();
    };
    panel.querySelector('#detail-back-btn')?.addEventListener('click', dismiss);
    panel.querySelector('#detail-close-btn')?.addEventListener('click', dismiss);

    panel.querySelector('#pt-retrait-toggle')?.addEventListener('click', () => {
      const form = panel.querySelector('#pt-retrait-form');
      if (form) form.hidden = !form.hidden;
    });
    panel.querySelector('#pt-retrait-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const motif = panel.querySelector('#pt-retrait-motif')?.value.trim();
      if (!motif) return;
      try {
        await apiPost('/retrait', {
          ville: activeCity(),
          id: s.id,
          motif,
          email: panel.querySelector('#pt-retrait-email')?.value.trim() || null,
        });
        win.Toast?.show('Demande transmise à la collectivité', 'success');
        panel.querySelector('.pt-retrait').innerHTML = '<p class="pt-own-note"><i class="fa-solid fa-circle-check"></i> Demande transmise - réponse sous un mois.</p>';
      } catch (err) {
        win.Toast?.show(err.message || 'Demande impossible', 'error');
      }
    });
  }

  async function openDetailById(city, id) {
    try {
      const data = await apiGet(`/detail?ville=${encodeURIComponent(city)}&id=${encodeURIComponent(id)}`);
      capture('participer_detail_opened', { ville: city });
      openParticiperModal(data);
    } catch (e) {
      win.Toast?.show(e.message || 'Signalement introuvable', 'error');
    }
  }

  async function openSuivi(token) {
    try {
      const data = await apiGet(`/detail?token=${encodeURIComponent(token)}`);
      openParticiperModal(data);
      const [lng, lat] = [data.signalement.lng, data.signalement.lat];
      if (lat != null) { try { win.MapModule?.map?.flyTo([lat, lng], 16); } catch { /* zoom conservé */ } }
    } catch (e) {
      win.Toast?.show(e.message || 'Lien de suivi invalide', 'error');
    }
  }

  /* ── Deep-link (appelé par main.js Phase 8) ────────────────────── */

  function handleUrlParams() {
    if (_pendingNotice === 'lien-invalide') win.Toast?.show('Ce lien de confirmation n\'est plus valide', 'warning', 6000);
    if (_pendingNotice === 'erreur') win.Toast?.show('Une erreur est survenue - réessayez', 'error', 6000);
    if (_pendingSuivi) {
      const token = _pendingSuivi;
      _pendingSuivi = null;
      openSuivi(token);
    }
    _pendingNotice = null;
  }

  win.ParticiperViews = {
    loadConfig,
    ensureLayer,
    removeLayer,
    buildSignaler,
    stopSignaler,
    buildExplorer,
    openDetailById,
    openSuivi,
    handleUrlParams,
  };

})(window);
