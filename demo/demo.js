/* ============================================================================
   ÉCRAN DÉMO SALON - /demo/demo.js
   Flow complet : mode attract (globe + machine à écrire), autocomplétion des
   communes, génération en deux phases SSE (analyse puis création) avec
   chorégraphie carte (plongée, contour, orbite IA, épingles en direct),
   écran final : statistiques du recensement, QR code, bouton vers l'espace.
   Mode kiosque : ?kiosk=1 (pas de redirection auto, retour attract).
   ============================================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const screens = { input: $('screen-input'), progress: $('screen-progress'), done: $('screen-done') };
  const input = $('commune-input');
  const suggestionsEl = $('suggestions');
  const stepsEl = $('steps');
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

  /* ─── Mode attract : le champ se tape des noms de communes tout seul ─── */

  const DEMO_NAMES = ['Bourg-en-Bresse', 'Oyonnax', 'Ambérieu-en-Bugey', 'Belley', 'Gex', 'Meximieux', 'Trévoux'];
  let typeIdx = 0;

  function typewriter() {
    if (document.activeElement === input && input.value) return; // l'utilisateur a pris la main
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

  /* ─── Journal d'étapes ─── */

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const SKIP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg>';

  function upsertStep({ id, status, label, detail }) {
    let li = document.getElementById(`step-${id}`);
    if (!li) {
      li = document.createElement('li');
      li.className = 'step';
      li.id = `step-${id}`;
      li.innerHTML = `
        <span class="step__icon"></span>
        <span class="step__label"></span>
        <span class="step__detail"></span>
        <span class="step__findings" hidden></span>`;
      stepsEl.appendChild(li);
    }
    li.querySelector('.step__label').textContent = label;
    if (detail) li.querySelector('.step__detail').textContent = detail;
    const icon = li.querySelector('.step__icon');
    if (status === 'start') icon.innerHTML = '<span class="spinner"></span>';
    else if (status === 'done') icon.innerHTML = `<span class="step__check">${CHECK_SVG}</span>`;
    else if (status === 'skip') icon.innerHTML = `<span class="step__skip">${SKIP_SVG}</span>`;
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    // Chorégraphie carte : l'IA réfléchit = la caméra orbite autour de la commune
    if (hasFx) {
      if (id === 'ai1' && status === 'start') window.MapFX.orbitStart();
      if (id === 'geo' && status === 'start') window.MapFX.orbitStop();
    }
    return li;
  }

  function currentFindingsContainer(stepId) {
    const li = document.getElementById(`step-${stepId}`);
    if (!li) return null;
    const box = li.querySelector('.step__findings');
    box.hidden = false;
    return box;
  }

  const FINDING_STEP = { logo: 'mairie', page: 'mairie', pdf: 'mairie', article: 'news', boamp: 'boamp' };

  function addFinding(f) {
    const box = currentFindingsContainer(FINDING_STEP[f.kind] || 'news');
    if (!box) return;
    const chip = document.createElement('span');
    chip.className = 'finding';
    if (f.kind === 'logo') {
      // Thématisation en direct : l'écran et la carte prennent la couleur de la commune
      if (f.color) {
        document.documentElement.style.setProperty('--accent', f.color);
        if (hasFx) window.MapFX.setAccent(f.color);
      }
      chip.innerHTML = `
        ${f.iconUrl ? `<img src="${escapeHtml(f.iconUrl)}" alt="" onerror="this.remove()">` : ''}
        <span class="finding__title">${escapeHtml(f.title)}</span>
        ${f.color ? `<span class="finding__swatch" style="background:${escapeHtml(f.color)}"></span>` : ''}`;
    } else {
      chip.innerHTML = `
        <span class="finding__title">${escapeHtml(f.title)}</span>
        <span class="finding__meta">${escapeHtml([f.domain, f.date].filter(Boolean).join(' · '))}</span>`;
    }
    box.appendChild(chip);
  }

  const aiCounts = { ai1: 0, ai2: 0 };
  function addAiItem(msg) {
    const box = currentFindingsContainer(msg.phase);
    if (!box) return;
    aiCounts[msg.phase] = (aiCounts[msg.phase] || 0) + 1;
    const chip = document.createElement('span');
    chip.className = 'finding finding--project';
    chip.innerHTML = `<span class="finding__title">${escapeHtml(msg.title)}</span>`;
    box.appendChild(chip);
    const li = document.getElementById(`step-${msg.phase}`);
    if (li) {
      li.querySelector('.step__detail').textContent = msg.phase === 'ai1'
        ? `${aiCounts.ai1} projet(s) repéré(s) dans les sources...`
        : `${aiCounts.ai2} projet(s) retenus et vérifiés...`;
    }
  }

  function addSubItem(stepId, title, meta) {
    const box = currentFindingsContainer(stepId);
    if (!box) return;
    const chip = document.createElement('span');
    chip.className = 'finding';
    chip.innerHTML = `
      <span class="finding__title">${escapeHtml(title)}</span>
      ${meta ? `<span class="finding__meta">${escapeHtml(meta)}</span>` : ''}`;
    box.appendChild(chip);
  }

  function addCreateItem(msg) {
    const box = currentFindingsContainer('create');
    if (!box) return;
    const chip = document.createElement('span');
    chip.className = 'finding finding--geo-ok';
    chip.innerHTML = `<span class="finding__title">${escapeHtml(msg.label)}</span>`;
    box.appendChild(chip);
  }

  function revealProjects(items) {
    const box = currentFindingsContainer('ai2');
    if (!box) return;
    box.innerHTML = '';
    items.forEach((p, i) => {
      setTimeout(() => {
        const chip = document.createElement('span');
        chip.className = 'finding finding--project';
        chip.innerHTML = `
          <span class="finding__badge">${escapeHtml(p.category_slug.replace(/-/g, ' '))}</span>
          <span class="finding__title">${escapeHtml(p.title)}</span>
          ${p.status ? `<span class="finding__meta">${escapeHtml(p.status)}</span>` : ''}`;
        box.appendChild(chip);
      }, i * 320);
    });
  }

  function addGeoItem(g) {
    const box = currentFindingsContainer('geo');
    if (box) {
      const precise = g.method !== 'centre';
      const chip = document.createElement('span');
      chip.className = `finding${precise ? ' finding--geo-ok' : ''}`;
      chip.innerHTML = `
        <span class="finding__title">${escapeHtml(g.title)}</span>
        <span class="finding__meta">${escapeHtml(g.label || g.method)}</span>`;
      box.appendChild(chip);
    }
    // L'épingle tombe sur la carte, l'emprise réelle s'embrase
    if (hasFx && typeof g.lat === 'number') {
      window.MapFX.addProject({ lat: g.lat, lng: g.lng, geometry: g.geometry, precise: g.method !== 'centre' });
    }
  }

  /* ─── Génération (deux phases SSE enchaînées) ─── */

  function openStream(url) {
    es = new EventSource(url);
    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'step') upsertStep(msg);
      else if (msg.type === 'finding') addFinding(msg);
      else if (msg.type === 'ai-item') addAiItem(msg);
      else if (msg.type === 'media-item') addSubItem('media', msg.title, msg.credit);
      else if (msg.type === 'cover-item') addSubItem('covers', msg.title, 'illustration installée');
      else if (msg.type === 'article-item') addSubItem('articles', msg.title, 'article rédigé');
      else if (msg.type === 'create-item') addCreateItem(msg);
      else if (msg.type === 'projects') revealProjects(msg.items || []);
      else if (msg.type === 'geo-item') addGeoItem(msg);
      else if (msg.type === 'phase') { es.close(); es = null; openStream(`/api/demo-generate?phase=create&ville=${encodeURIComponent(msg.ville)}`); }
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
    stepsEl.innerHTML = '';
    aiCounts.ai1 = 0; aiCounts.ai2 = 0;
    $('progress-error').hidden = true;
    $('btn-retry').hidden = true;
    $('progress-commune').textContent = commune.nom;
    show('progress');

    // Chorégraphie : plongée cinématique sur la commune + contour illuminé
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
      // Mode salon : pas de redirection, l'écran revient à l'accueil tout seul
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
    const el = $('progress-error');
    el.textContent = message;
    el.hidden = false;
    $('btn-retry').hidden = false;
    if (KIOSK) redirectTimer = setTimeout(reset, 60000);
  }

  function reset() {
    clearTimeout(redirectTimer);
    if (es) { es.close(); es = null; }
    input.value = '';
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
    // Lien direct (prospection ou salon) : on résout la commune puis on lance
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
