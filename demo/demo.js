/* ============================================================================
   ÉCRAN DÉMO SALON - /demo/demo.js
   Flow immersif : mode attract (globe + machine à écrire), génération en
   quatre phases SSE enchaînées sans couture, HUD flottant sur la carte
   (pilule de statut, fil d'activité, barre de progression), chorégraphie
   WebGL (plongée, relief 3D, orbite IA, épingles étiquetées), écran final
   avec statistiques du recensement, QR code et bouton vers l'espace.
   Mode kiosque : ?kiosk=1 (pas de redirection auto, retour attract).
   ============================================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const screens = { input: $('screen-input'), progress: $('screen-progress'), done: $('screen-done') };
  const input = $('commune-input');
  const suggestionsEl = $('suggestions');
  const feedEl = $('feed');
  const KIOSK = new URLSearchParams(window.location.search).get('kiosk') === '1';

  let es = null;
  let selectedIndex = -1;
  let suggestions = [];
  let redirectTimer = null;
  let debounceTimer = null;
  let typeTimer = null;
  let currentCommune = null;

  const hasFx = window.MapFX && window.MapFX.init();

  const show = (name) => {
    Object.values(screens).forEach((s) => s.classList.remove('is-active'));
    screens[name].classList.add('is-active');
  };

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ─── Mode attract ─── */

  const DEMO_NAMES = ['Bourg-en-Bresse', 'Oyonnax', 'Ambérieu-en-Bugey', 'Belley', 'Gex', 'Meximieux', 'Trévoux'];
  let typeIdx = 0;

  function typewriter() {
    if (document.activeElement === input && input.value) return;
    const name = DEMO_NAMES[typeIdx % DEMO_NAMES.length];
    let i = 0;
    let phase = 'typing';
    const tick = () => {
      if (document.activeElement === input && input.value) { input.placeholder = 'Tapez le nom de votre commune'; return; }
      if (phase === 'typing') {
        i++;
        input.placeholder = name.slice(0, i) + '|';
        if (i >= name.length) { phase = 'hold'; typeTimer = setTimeout(tick, 1600); return; }
        typeTimer = setTimeout(tick, 90 + Math.random() * 70);
      } else if (phase === 'hold') {
        phase = 'erasing';
        typeTimer = setTimeout(tick, 40);
      } else {
        i--;
        input.placeholder = name.slice(0, i) + '|';
        if (i <= 0) { typeIdx++; typeTimer = setTimeout(typewriter, 700); return; }
        typeTimer = setTimeout(tick, 34);
      }
    };
    tick();
  }

  function attractStart() {
    if (hasFx) window.MapFX.attractStart();
    clearTimeout(typeTimer);
    typewriter();
  }

  /* ─── Autocomplétion ─── */

  async function fetchSuggestions(q) {
    if (q.length < 2) { renderSuggestions([]); return; }
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=departement,population,centre&boost=population&limit=6`);
      renderSuggestions(r.ok ? await r.json() : []);
    } catch { renderSuggestions([]); }
  }

  function renderSuggestions(list) {
    suggestions = list;
    selectedIndex = -1;
    if (!list.length) { suggestionsEl.hidden = true; suggestionsEl.innerHTML = ''; return; }
    suggestionsEl.innerHTML = list.map((c, i) => `
      <li data-i="${i}">
        <span class="s-name">${escapeHtml(c.nom)}</span>
        <span class="s-meta">${escapeHtml(c.departement?.nom || '')} · ${(c.population || 0).toLocaleString('fr-FR')} hab.</span>
      </li>`).join('');
    suggestionsEl.hidden = false;
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(input.value.trim()), 180);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!suggestions.length) return;
      selectedIndex = (selectedIndex + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      [...suggestionsEl.children].forEach((li, i) => li.classList.toggle('is-selected', i === selectedIndex));
    } else if (e.key === 'Enter') {
      const c = suggestions[selectedIndex >= 0 ? selectedIndex : 0];
      if (c) start(c);
    } else if (e.key === 'Escape') {
      renderSuggestions([]);
    }
  });

  suggestionsEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) start(suggestions[parseInt(li.dataset.i, 10)]);
  });

  /* ─── HUD : pilule de statut, progression, fil d'activité ─── */

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICONS = {
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    mairie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    presse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V9"/><path d="M12 6h6M12 10h6M12 14h6M12 18h6"/></svg>',
    marche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
    ia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg>',
    verif: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    plume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    fusee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  };

  // Poids de progression par étape (barre du haut)
  const STEP_PCT = {
    resolve: 6, mairie: 18, news: 34, boamp: 40, ai1: 54, ai2: 66,
    geo: 76, media: 85, articles: 92, exists: 90, create: 95, covers: 97, publish: 100,
  };

  function setProgress(pct) {
    $('topline-fill').style.width = `${Math.min(100, pct)}%`;
  }

  function setPill(label, detail, done) {
    $('hud-label').textContent = label;
    $('hud-detail').textContent = detail || '';
    $('hud-icon').innerHTML = done ? `<span class="hud-check">${CHECK_SVG}</span>` : '<span class="spinner"></span>';
  }

  const FEED_MAX = 6;
  function addFeed(icon, title, meta, ok) {
    const li = document.createElement('li');
    if (ok) li.className = 'feed--ok';
    li.innerHTML = `
      <span class="feed__icon">${ICONS[icon] || ICONS.file}</span>
      <span class="feed__text">
        <span class="feed__title">${escapeHtml(title)}</span>
        ${meta ? `<span class="feed__meta">${escapeHtml(meta)}</span>` : ''}
      </span>`;
    feedEl.appendChild(li);
    const items = [...feedEl.children];
    items.slice(0, Math.max(0, items.length - 3)).forEach((el) => el.classList.add('is-old'));
    while (feedEl.children.length > FEED_MAX) {
      const first = feedEl.firstElementChild;
      first.classList.add('is-gone');
      setTimeout(() => first.remove(), 600);
      if (feedEl.children.length > FEED_MAX + 3) first.remove();
    }
    return li;
  }

  const aiCounts = { ai1: 0, ai2: 0 };
  let currentStepLabel = '';

  function onStep({ id, status, label, detail }) {
    if (STEP_PCT[id]) setProgress(status === 'start' ? STEP_PCT[id] - 5 : STEP_PCT[id]);
    if (status === 'start') {
      currentStepLabel = label;
      setPill(label, detail, false);
    } else {
      setPill(label, detail, true);
      addFeed(status === 'skip' ? 'file' : 'verif', label, detail, status === 'done');
    }
    // Chorégraphie : l'IA réfléchit = la caméra orbite autour de la commune
    if (hasFx) {
      if (id === 'ai1' && status === 'start') window.MapFX.orbitStart();
      if (id === 'geo' && status === 'start') window.MapFX.orbitStop();
    }
  }

  const FINDING_ICON = { logo: 'mairie', page: 'file', pdf: 'file', article: 'presse', boamp: 'marche' };

  function onFinding(f) {
    if (f.kind === 'logo') {
      if (f.color) {
        document.documentElement.style.setProperty('--accent', f.color);
        if (hasFx) window.MapFX.setAccent(f.color);
      }
      const li = addFeed('mairie', f.title, f.color ? `identité récupérée · ${f.color}` : 'site officiel');
      if (f.iconUrl) {
        const img = document.createElement('img');
        img.src = f.iconUrl;
        img.onerror = () => img.remove();
        li.querySelector('.feed__icon').replaceChildren(img);
      }
      return;
    }
    addFeed(FINDING_ICON[f.kind] || 'file', f.title, [f.domain, f.date].filter(Boolean).join(' · '));
  }

  function onAiItem(msg) {
    aiCounts[msg.phase] = (aiCounts[msg.phase] || 0) + 1;
    addFeed('ia', msg.title, msg.phase === 'ai1' ? 'projet repéré' : 'projet retenu');
    $('hud-detail').textContent = msg.phase === 'ai1'
      ? `${aiCounts.ai1} projet(s) repéré(s) dans les sources...`
      : `${aiCounts.ai2} projet(s) retenus et vérifiés...`;
  }

  function onProjects(items) {
    items.forEach((p, i) => {
      setTimeout(() => addFeed('verif', p.title, [p.category_slug.replace(/-/g, ' '), p.status].filter(Boolean).join(' · '), true), i * 260);
    });
  }

  function onGeoItem(g) {
    addFeed('pin', g.title, g.label || g.method, g.method !== 'centre');
    if (hasFx && typeof g.lat === 'number') {
      window.MapFX.addProject({ lat: g.lat, lng: g.lng, geometry: g.geometry, precise: g.method !== 'centre', title: g.title });
    }
  }

  /* ─── Génération (phases SSE enchaînées sans couture) ─── */

  function openStream(url) {
    es = new EventSource(url);
    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'step') onStep(msg);
      else if (msg.type === 'finding') onFinding(msg);
      else if (msg.type === 'ai-item') onAiItem(msg);
      else if (msg.type === 'media-item') addFeed('photo', msg.title, msg.credit);
      else if (msg.type === 'cover-item') addFeed('photo', msg.title, 'illustration installée', true);
      else if (msg.type === 'article-item') addFeed('plume', msg.title, 'article rédigé');
      else if (msg.type === 'create-item') addFeed('fusee', msg.label, '', true);
      else if (msg.type === 'projects') onProjects(msg.items || []);
      else if (msg.type === 'geo-item') onGeoItem(msg);
      else if (msg.type === 'phase') { es.close(); es = null; openStream(`/api/demo-generate?phase=${encodeURIComponent(msg.next)}&ville=${encodeURIComponent(msg.ville)}`); }
      else if (msg.type === 'done') { es.close(); es = null; onDone(msg); }
      else if (msg.type === 'error') { es.close(); es = null; onError(msg.message, msg.debug); }
    };
    es.onerror = () => {
      if (es) { es.close(); es = null; onError('La connexion a été interrompue. Réessayez.'); }
    };
  }

  function start(commune) {
    currentCommune = commune;
    renderSuggestions([]);
    input.blur();
    clearTimeout(typeTimer);
    feedEl.innerHTML = '';
    aiCounts.ai1 = 0; aiCounts.ai2 = 0;
    setProgress(2);
    setPill('Préparation...', '', false);
    $('hud-commune').textContent = commune.nom;
    $('hud-error').hidden = true;
    show('progress');

    if (hasFx && commune.centre) {
      window.MapFX.focusCommune({
        lat: commune.centre.coordinates[1],
        lng: commune.centre.coordinates[0],
        population: commune.population || 0,
      });
      fetch(`https://geo.api.gouv.fr/communes/${commune.code}?format=geojson&geometry=contour`)
        .then((r) => (r.ok ? r.json() : null))
        .then((f) => f?.geometry && window.MapFX.drawContour(f.geometry))
        .catch(() => { /* contour décoratif */ });
    }

    openStream(`/api/demo-generate?commune=${encodeURIComponent(commune.code)}`);
  }

  function onDone(msg) {
    const targetUrl = new URL(msg.url, window.location.origin).toString();
    $('done-commune').textContent = msg.communeNom || currentCommune?.nom || '';
    $('done-detail').textContent = msg.existing
      ? 'Cet espace avait déjà été généré : le voici.'
      : `Recensement terminé : ${msg.projectsCount} projets publiés sur la carte.`;
    $('btn-open').href = targetUrl;
    if (KIOSK) $('btn-open').target = '_blank';
    $('qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(targetUrl)}`;

    if (msg.stats) {
      $('stat-sources').textContent = msg.stats.sources;
      $('stat-verified').textContent = msg.stats.verified;
      $('stat-precise').textContent = msg.stats.precise;
      $('stat-illustrated').textContent = msg.stats.illustrated;
      $('done-stats').hidden = false;
    } else {
      $('done-stats').hidden = true;
    }

    if (hasFx) window.MapFX.finale(0);
    show('done');

    if (KIOSK) {
      let remaining = 90;
      const tick = () => {
        $('countdown').textContent = `L'écran revient à l'accueil dans ${remaining} s`;
        if (remaining-- <= 0) { reset(); return; }
        redirectTimer = setTimeout(tick, 1000);
      };
      tick();
    } else {
      let remaining = 12;
      const tick = () => {
        $('countdown').textContent = `Ouverture automatique de la carte dans ${remaining} s`;
        if (remaining-- <= 0) { window.location.href = targetUrl; return; }
        redirectTimer = setTimeout(tick, 1000);
      };
      tick();
    }
  }

  function onError(message, debug) {
    if (debug) console.error('[demo-generate]', debug);
    $('progress-error').textContent = message;
    $('hud-error').hidden = false;
    setPill(currentStepLabel || 'Génération interrompue', '', true);
    if (KIOSK) redirectTimer = setTimeout(reset, 60000);
  }

  function reset() {
    clearTimeout(redirectTimer);
    if (es) { es.close(); es = null; }
    input.value = '';
    feedEl.innerHTML = '';
    setProgress(0);
    document.documentElement.style.removeProperty('--accent');
    if (hasFx) window.MapFX.reset();
    show('input');
    attractStart();
    if (!KIOSK) input.focus();
  }

  $('btn-retry').addEventListener('click', reset);
  $('btn-again').addEventListener('click', reset);

  /* ─── Lancement ─── */

  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get('commune');
  if (codeParam && /^\d{2}[0-9ABab]\d{2}$/.test(codeParam)) {
    fetch(`https://geo.api.gouv.fr/communes/${codeParam.toUpperCase()}?fields=nom,code,population,centre`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return attractStart();
        if (params.get('auto') === '1') start(c);
        else { input.value = c.nom; attractStart(); }
      })
      .catch(() => attractStart());
  } else {
    attractStart();
  }
})();
