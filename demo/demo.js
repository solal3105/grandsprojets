/* ============================================================================
   ÉCRAN DÉMO SALON - /demo/demo.js
   Autocomplétion des communes (geo.api.gouv.fr), génération en direct via SSE
   (/api/demo-generate), journal d'étapes avec trouvailles, thématisation aux
   couleurs de la commune, QR code final et redirection vers l'espace créé.
   ============================================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const screens = { input: $('screen-input'), progress: $('screen-progress'), done: $('screen-done') };
  const input = $('commune-input');
  const suggestionsEl = $('suggestions');
  const stepsEl = $('steps');

  let es = null;
  let selectedIndex = -1;
  let suggestions = [];
  let redirectTimer = null;
  let debounceTimer = null;

  const show = (name) => {
    Object.values(screens).forEach((s) => s.classList.remove('is-active'));
    screens[name].classList.add('is-active');
  };

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ─── Autocomplétion ─── */

  async function fetchSuggestions(q) {
    if (q.length < 2) { renderSuggestions([]); return; }
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=departement,population&boost=population&limit=6`);
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
      // Thématisation en direct : l'écran prend les couleurs de la commune
      if (f.color) document.documentElement.style.setProperty('--accent', f.color);
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

  // Titres révélés en direct pendant que l'IA écrit (passes 1 et 2)
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

  // Chips génériques des étapes illustrations / articles
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

  // Sous-étapes de la création d'espace (logo, branding, fiche par fiche)
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
    box.innerHTML = ''; // remplace les titres bruts streamés par les fiches finales
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
    if (!box) return;
    const precise = g.method !== 'centre';
    const chip = document.createElement('span');
    chip.className = `finding${precise ? ' finding--geo-ok' : ''}`;
    chip.innerHTML = `
      <span class="finding__title">${escapeHtml(g.title)}</span>
      <span class="finding__meta">${escapeHtml(g.label || g.method)}</span>`;
    box.appendChild(chip);
  }

  /* ─── Génération ─── */

  function start(commune) {
    renderSuggestions([]);
    input.blur();
    stepsEl.innerHTML = '';
    $('progress-error').hidden = true;
    $('btn-retry').hidden = true;
    $('progress-commune').textContent = commune.nom;
    show('progress');

    es = new EventSource(`/api/demo-generate?commune=${encodeURIComponent(commune.code)}`);
    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'step') upsertStep(msg);
      else if (msg.type === 'finding') addFinding(msg);
      else if (msg.type === 'ai-item') addAiItem(msg);
      else if (msg.type === 'media-item') addSubItem('media', msg.title, msg.credit);
      else if (msg.type === 'article-item') addSubItem('articles', msg.title, 'article rédigé');
      else if (msg.type === 'create-item') addCreateItem(msg);
      else if (msg.type === 'projects') revealProjects(msg.items || []);
      else if (msg.type === 'geo-item') addGeoItem(msg);
      else if (msg.type === 'done') { es.close(); es = null; onDone(msg, commune); }
      else if (msg.type === 'error') { es.close(); es = null; onError(msg.message, msg.debug); }
    };
    es.onerror = () => {
      // Pas de reconnexion automatique : une génération = un déclenchement
      if (es) { es.close(); es = null; onError('La connexion a été interrompue. Réessayez.'); }
    };
  }

  function onDone(msg, commune) {
    const targetUrl = new URL(msg.url, window.location.origin).toString();
    $('done-commune').textContent = msg.communeNom || commune.nom;
    $('done-detail').textContent = msg.existing
      ? 'Cet espace avait déjà été généré : le voici.'
      : `${msg.projectsCount} projets trouvés dans les sources publiques, cartographiés et publiés.`;
    $('btn-open').href = targetUrl;
    $('qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(targetUrl)}`;
    show('done');

    let remaining = 12;
    const tick = () => {
      $('countdown').textContent = `Ouverture automatique de la carte dans ${remaining} s`;
      if (remaining-- <= 0) { window.location.href = targetUrl; return; }
      redirectTimer = setTimeout(tick, 1000);
    };
    tick();
  }

  function onError(message, debug) {
    if (debug) console.error('[demo-generate]', debug);
    const el = $('progress-error');
    el.textContent = message;
    el.hidden = false;
    $('btn-retry').hidden = false;
  }

  function reset() {
    clearTimeout(redirectTimer);
    if (es) { es.close(); es = null; }
    input.value = '';
    show('input');
    input.focus();
  }

  $('btn-retry').addEventListener('click', reset);
  $('btn-again').addEventListener('click', reset);

  /* ─── Lancement direct par URL (?commune=CODE_INSEE&nom=...&auto=1) ─── */

  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get('commune');
  if (codeParam && /^\d{2}[0-9ABab]\d{2}$/.test(codeParam)) {
    const nom = params.get('nom') || 'votre commune';
    if (params.get('auto') === '1') start({ code: codeParam.toUpperCase(), nom });
    else { input.value = nom; }
  }
})();
