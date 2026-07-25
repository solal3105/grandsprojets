/* ============================================================================
   ÉCRAN DÉMO SALON - /demo/demo.js
   Flow immersif : mode attract (France en respiration + machine à écrire),
   génération en phases SSE enchaînées avec reprise automatique, HUD intégré
   à la carte (pilule de statut, compteurs de recensement, ticker une ligne),
   chorégraphie WebGL (plongée, radar, arcs de collecte, zoom par projet,
   photos posées sur la carte), écran final avec statistiques et QR code.
   Mode kiosque : ?kiosk=1 (pas de redirection auto, retour attract).
   ============================================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const screens = { input: $('screen-input'), progress: $('screen-progress'), done: $('screen-done') };
  const input = $('commune-input');
  const suggestionsEl = $('suggestions');
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const KIOSK = URL_PARAMS.get('kiosk') === '1';
  const KIOSK_KEY = URL_PARAMS.get('k') || '';
  const kioskParam = KIOSK_KEY ? `&k=${encodeURIComponent(KIOSK_KEY)}` : '';

  let es = null;
  let selectedIndex = -1;
  let suggestions = [];
  let redirectTimer = null;
  let debounceTimer = null;
  let typeTimer = null;
  let currentCommune = null;
  let startTime = 0;

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

  let suggestSeq = 0;
  async function fetchSuggestions(q) {
    if (q.length < 2) { renderSuggestions([]); return; }
    const seq = ++suggestSeq;
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=departement,population,centre&boost=population&limit=6`);
      const list = r.ok ? await r.json() : [];
      if (seq === suggestSeq) renderSuggestions(list); // ignorer les réponses périmées
    } catch { if (seq === suggestSeq) renderSuggestions([]); }
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
    if (!input.value && screens.input.classList.contains('is-active')) {
      clearTimeout(typeTimer);
      typewriter();
    }
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
      else if (input.value.trim().length >= 2) {
        clearTimeout(debounceTimer);
        fetchSuggestions(input.value.trim()).then(() => { if (suggestions[0]) start(suggestions[0]); });
      }
    } else if (e.key === 'Escape') {
      renderSuggestions([]);
    }
  });

  suggestionsEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) start(suggestions[parseInt(li.dataset.i, 10)]);
  });

  /* ─── HUD : pilule, progression, compteurs, ticker ─── */

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICONS = {
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

  const STEP_PCT = {
    resolve: 6, mairie: 18, news: 34, boamp: 40, ai1: 54, ai2: 66,
    geo: 76, media: 84, articles: 90, exists: 20, create: 93, covers: 95, publish: 98,
  };

  let progressPct = 0;
  function setProgress(pct) {
    progressPct = pct <= 2 ? pct : Math.max(progressPct, pct);
    $('topline-fill').style.width = `${Math.min(100, progressPct)}%`;
  }

  function setPill(label, detail, done) {
    $('hud-label').textContent = label;
    $('hud-detail').textContent = detail || '';
    $('hud-icon').innerHTML = done ? `<span class="hud-check">${CHECK_SVG}</span>` : '<span class="spinner"></span>';
  }

  // Compteurs cumulés du recensement, rendus uniquement quand ils vivent
  const COUNTER_DEFS = [
    ['sources', 'sources'],
    ['articles', 'articles lus'],
    ['docs', 'docs officiels'],
    ['marches', 'marchés'],
    ['candidats', 'candidats'],
    ['verifies', 'vérifiés'],
    ['localises', 'localisés'],
    ['illustres', 'illustrés'],
  ];
  let counters = {};

  function bumpCounter(key, value) {
    counters[key] = value !== undefined ? value : (counters[key] || 0) + 1;
    const box = $('counters');
    let el = document.getElementById(`counter-${key}`);
    if (!el) {
      el = document.createElement('span');
      el.className = 'counter';
      el.id = `counter-${key}`;
      const label = COUNTER_DEFS.find(([k]) => k === key)?.[1] || key;
      el.innerHTML = `<span class="counter__n">0</span><span class="counter__l">${label}</span>`;
      // Ordre stable, indépendant de l'ordre d'apparition
      const order = COUNTER_DEFS.findIndex(([k]) => k === key);
      const next = [...box.children].find((c) => COUNTER_DEFS.findIndex(([k]) => `counter-${k}` === c.id) > order);
      box.insertBefore(el, next || null);
    }
    const n = el.querySelector('.counter__n');
    n.textContent = counters[key];
    n.classList.remove('is-bump');
    requestAnimationFrame(() => n.classList.add('is-bump'));
  }

  // Ticker : une seule trouvaille à la fois, file d'attente à débit régulier
  let tickerQueue = [];
  let tickerBusy = false;

  function tick(icon, text, meta, iconUrl) {
    tickerQueue.push({ icon, text, meta, iconUrl });
    if (tickerQueue.length > 5) tickerQueue.splice(0, tickerQueue.length - 5);
    if (!tickerBusy) nextTick();
  }

  function nextTick() {
    const item = tickerQueue.shift();
    if (!item) { tickerBusy = false; return; }
    tickerBusy = true;
    const t = $('ticker');
    $('ticker-icon').innerHTML = item.iconUrl
      ? `<img src="${escapeHtml(item.iconUrl)}" alt="" onerror="this.remove()">`
      : (ICONS[item.icon] || ICONS.file);
    $('ticker-text').textContent = item.text;
    $('ticker-meta').textContent = item.meta || '';
    t.classList.remove('is-swap');
    requestAnimationFrame(() => t.classList.add('is-swap'));
    setTimeout(nextTick, 1500);
  }

  // Stepper : chaque step interne appartient à l'une des 5 phases visibles.
  // L'avancement est monotone (on ne recule jamais d'une phase).
  const stepperEl = $('stepper');
  const STAGE_OF = {
    resolve: 0, mairie: 0, news: 0, boamp: 0,
    ai1: 1, ai2: 1,
    geo: 2,
    media: 3, articles: 3,
    exists: 4, create: 4, covers: 4, publish: 4,
  };
  let curStage = -1;

  function setStage(idx) {
    if (idx == null || idx <= curStage) return;
    curStage = idx;
    [...stepperEl.children].forEach((li, i) => {
      li.classList.toggle('is-done', i < idx);
      li.classList.toggle('is-current', i === idx);
    });
  }

  function finishStages() {
    curStage = 99;
    [...stepperEl.children].forEach((li) => { li.classList.add('is-done'); li.classList.remove('is-current'); });
  }

  function resetStages() {
    curStage = -1;
    [...stepperEl.children].forEach((li) => li.classList.remove('is-done', 'is-current'));
  }

  function onStep({ id, status, label, detail }) {
    if (STAGE_OF[id] !== undefined) setStage(STAGE_OF[id]);
    if (STEP_PCT[id]) setProgress(status === 'start' ? STEP_PCT[id] - 5 : STEP_PCT[id]);
    if (status === 'start') setPill(label, detail, false);
    else {
      setPill(label, detail, true);
      tick('verif', label, detail);
    }
    if (hasFx) {
      if (id === 'mairie' && status === 'start') window.MapFX.scanStart();
      if (id === 'ai1' && status === 'start') window.MapFX.orbitStart();
      if (id === 'geo' && status === 'start') { window.MapFX.scanStop(); window.MapFX.orbitStop(); }
    }
  }

  function onFinding(f) {
    if (hasFx) window.MapFX.pulseSource();
    if (f.kind === 'logo') {
      if (f.color) {
        document.documentElement.style.setProperty('--accent', f.color);
        if (hasFx) window.MapFX.setAccent(f.color);
      }
      bumpCounter('sources');
      tick('mairie', f.title, f.color ? `identité et couleurs récupérées · ${f.color}` : 'site officiel', f.iconUrl);
      return;
    }
    if (f.kind === 'article') { bumpCounter('sources'); bumpCounter('articles'); tick('presse', f.text || f.title, [f.domain, f.date].filter(Boolean).join(' · ')); }
    else if (f.kind === 'pdf') { bumpCounter('docs'); tick('file', f.title, 'document officiel'); }
    else if (f.kind === 'page') { bumpCounter('sources'); tick('mairie', f.title, f.domain); }
    else if (f.kind === 'boamp') { bumpCounter('marches'); tick('marche', f.title, f.date); }
  }

  function onAiItem(msg) {
    if (msg.phase === 'ai1') { bumpCounter('candidats'); tick('ia', msg.title, 'projet repéré'); }
    else { tick('verif', msg.title, 'projet retenu'); }
    $('hud-detail').textContent = msg.phase === 'ai1'
      ? `${counters.candidats || 0} projet(s) repéré(s) dans les sources...`
      : 'vérification des sources projet par projet...';
  }

  function onProjects(items) {
    bumpCounter('verifies', items.length);
    items.forEach((p, i) => {
      setTimeout(() => tick('verif', p.title, [p.category_slug.replace(/-/g, ' '), p.status].filter(Boolean).join(' · ')), i * 260);
    });
  }

  function onGeoItem(g) {
    bumpCounter('localises');
    tick('pin', g.title, g.label || g.method);
    if (hasFx && typeof g.lat === 'number') {
      window.MapFX.addProject({ lat: g.lat, lng: g.lng, geometry: g.geometry, precise: g.method !== 'centre', title: g.title });
    }
  }

  function onMediaItem(msg) {
    bumpCounter('illustres');
    tick('photo', msg.title, 'photo libre trouvée sur place');
    if (hasFx && typeof msg.lat === 'number' && msg.coverSrc) {
      window.MapFX.attachPhoto(msg.lat, msg.lng, msg.coverSrc);
    }
  }

  /* ─── Génération (phases SSE enchaînées, reprise automatique) ─── */

  const MAX_RESUMES = 4;
  let resumeAttempts = 0;

  function openStream(url) {
    es = new EventSource(url);
    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'step' || msg.type === 'phase') resumeAttempts = 0;
      if (msg.type === 'step') onStep(msg);
      else if (msg.type === 'finding') onFinding(msg);
      else if (msg.type === 'ai-item') onAiItem(msg);
      else if (msg.type === 'media-item') onMediaItem(msg);
      else if (msg.type === 'cover-item') tick('photo', msg.title, 'illustration installée');
      else if (msg.type === 'article-item') tick('plume', msg.title, 'article rédigé');
      else if (msg.type === 'create-item') tick('fusee', msg.label, '');
      else if (msg.type === 'projects') onProjects(msg.items || []);
      else if (msg.type === 'geo-item') onGeoItem(msg);
      else if (msg.type === 'phase') {
        es.close(); es = null;
        setPill($('hud-label').textContent || 'Analyse en cours...', 'Étape suivante...', false);
        openStream(`/api/demo-generate?phase=${encodeURIComponent(msg.next)}&ville=${encodeURIComponent(msg.ville)}`);
      }
      else if (msg.type === 'done') { es.close(); es = null; onDone(msg); }
      else if (msg.type === 'error') {
        es.close(); es = null;
        if (msg.retryable) tryResume(msg.debug);
        else onError(msg.message, msg.debug);
      }
    };
    es.onerror = () => {
      if (!es) return;
      es.close();
      es = null;
      tryResume();
    };
  }

  function tryResume(debug) {
    if (debug) console.error('[demo-generate]', debug);
    if (currentCommune && resumeAttempts < MAX_RESUMES) {
      resumeAttempts++;
      tick('fusee', 'Reconnexion...', `reprise automatique (${resumeAttempts}/${MAX_RESUMES})`);
      setTimeout(() => {
        if (!es && screens.progress.classList.contains('is-active')) {
          openStream(`/api/demo-generate?commune=${encodeURIComponent(currentCommune.code)}${kioskParam}`);
        }
      }, 1800);
    } else {
      onError('La génération n\'a pas abouti malgré plusieurs tentatives. Réessayez, ou passez nous voir pour une démo guidée.');
    }
  }

  function start(commune) {
    currentCommune = commune;
    resumeAttempts = 0;
    startTime = Date.now();
    clearTimeout(debounceTimer);
    renderSuggestions([]);
    input.blur();
    clearTimeout(typeTimer);
    counters = {};
    $('counters').innerHTML = '';
    tickerQueue = [];
    tickerBusy = false;
    $('ticker-icon').innerHTML = '';
    $('ticker-text').textContent = `Recensement de ${commune.nom} en cours...`;
    $('ticker-meta').textContent = '';
    resetStages();
    progressPct = 0;
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

    openStream(`/api/demo-generate?commune=${encodeURIComponent(commune.code)}${kioskParam}`);
  }

  function onDone(msg) {
    const targetUrl = new URL(msg.url, window.location.origin).toString();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const elapsedTxt = elapsed >= 60 ? `${Math.floor(elapsed / 60)} min ${String(elapsed % 60).padStart(2, '0')} s` : `${elapsed} s`;
    $('done-commune').textContent = msg.communeNom || currentCommune?.nom || '';
    $('done-detail').textContent = msg.existing
      ? 'Cet espace avait déjà été généré : le voici.'
      : `${msg.projectsCount} projets recensés, vérifiés et publiés en ${elapsedTxt}.`;
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

    if (hasFx) window.MapFX.finale();
    finishStages();
    setProgress(100);
    show('done');

    if (KIOSK) {
      let remaining = 90;
      const tickDown = () => {
        $('countdown').textContent = `L'écran revient à l'accueil dans ${remaining} s`;
        if (remaining-- <= 0) { reset(); return; }
        redirectTimer = setTimeout(tickDown, 1000);
      };
      tickDown();
    } else {
      let remaining = 12;
      const tickDown = () => {
        $('countdown').textContent = `Ouverture automatique de la carte dans ${remaining} s`;
        if (remaining-- <= 0) { window.location.href = targetUrl; return; }
        redirectTimer = setTimeout(tickDown, 1000);
      };
      tickDown();
    }
  }

  function onError(message, debug) {
    if (debug) console.error('[demo-generate]', debug);
    $('progress-error').textContent = message;
    $('hud-error').hidden = false;
    $('hud-label').textContent = 'Génération interrompue';
    $('hud-detail').textContent = '';
    $('hud-icon').innerHTML = '<span class="hud-x">!</span>';
    if (hasFx) { window.MapFX.scanStop(); window.MapFX.orbitStop(); }
    if (KIOSK) redirectTimer = setTimeout(reset, 60000);
  }

  function reset() {
    clearTimeout(redirectTimer);
    if (es) { es.close(); es = null; }
    input.value = '';
    renderSuggestions([]);
    counters = {};
    $('counters').innerHTML = '';
    tickerQueue = [];
    tickerBusy = false;
    resetStages();
    progressPct = 0;
    setProgress(0);
    ['stat-sources', 'stat-verified', 'stat-precise', 'stat-illustrated'].forEach((id) => { $(id).textContent = '0'; });
    document.documentElement.style.removeProperty('--accent');
    if (hasFx) window.MapFX.reset();
    show('input');
    attractStart();
    if (!KIOSK) input.focus();
  }

  $('btn-retry').addEventListener('click', reset);
  $('btn-again').addEventListener('click', reset);

  /* ─── Lancement ─── */

  const codeParam = URL_PARAMS.get('commune');
  if (codeParam && /^\d{2}[0-9ABab]\d{2}$/.test(codeParam)) {
    fetch(`https://geo.api.gouv.fr/communes/${codeParam.toUpperCase()}?fields=nom,code,population,centre`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return attractStart();
        if (URL_PARAMS.get('auto') === '1') start(c);
        else { input.value = c.nom; attractStart(); }
      })
      .catch(() => attractStart());
  } else {
    attractStart();
  }
})();
