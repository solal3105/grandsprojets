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
  const brand = $('kiosk-brand');
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const KIOSK = URL_PARAMS.get('kiosk') === '1';
  const KIOSK_KEY = URL_PARAMS.get('k') || '';
  /* `regen=1` dans le lien demande de REFAIRE le recensement d'une commune déjà
     générée. Le paramètre était documenté et lu par le serveur, mais la page ne
     le transmettait jamais : le lien de relance n'avait aucun effet. Il ne vaut
     que pour la PREMIÈRE génération de la session : taper ensuite une autre
     commune ne doit pas la régénérer à l'insu du visiteur. */
  let regenEnAttente = URL_PARAMS.get('regen') === '1';
  const kioskParam = KIOSK_KEY ? `&k=${encodeURIComponent(KIOSK_KEY)}` : '';

  let es = null;
  let selectedIndex = -1;
  let suggestions = [];
  let redirectTimer = null;
  let debounceTimer = null;
  let typeTimer = null;
  let currentCommune = null;
  let startTime = 0;
  // Dernier résultat livré : sert au formulaire d'adresse et à la relance
  let lastDone = null;
  /* Le web public ne documente aucun projet de la commune. Il n'y a alors pas
     de résultat livré, mais l'adresse est quand même recueillie : ce drapeau
     distingue « zéro projet trouvé » de « génération jamais arrivée au bout »,
     que `lastDone` seul confondrait. */
  let sansProjet = false;
  let leadTimer = null;

  const hasFx = window.MapFX && window.MapFX.init();

  const show = (name) => {
    Object.values(screens).forEach((s) => s.classList.remove('is-active'));
    screens[name].classList.add('is-active');
    /* Le bandeau de marque n'a de place que sur l'écran de saisie : dès la
       génération lancée, le HUD occupe le haut de l'écran et le logo se
       retrouve derrière l'interface au lieu de la coiffer. */
    if (brand) brand.hidden = name !== 'input';
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
  // Projets survolés au final, et ce qu'on a refusé d'afficher
  let tourPoints = [];
  const rejected = {};

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
    create: 4, covers: 4, publish: 4,
    // 'exists' volontairement absent : lors d'une reprise, ce step precede un
    // retour a une phase anterieure ; le mapper a 4 bloquerait le stepper monotone
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
    // Position officielle de la mairie : elle ancre le radar et les arcs. Elle
    // arrive avant les autres trouvailles, donc avant que le balayage n'ait eu
    // le temps de tourner longtemps au mauvais endroit.
    if (f.kind === 'mairie-position') {
      if (hasFx) window.MapFX.setMairie({ lat: f.lat, lng: f.lng });
      return;
    }
    if (hasFx) window.MapFX.pulseSource();
    if (f.kind === 'logo') {
      if (f.color) {
        document.documentElement.style.setProperty('--accent', f.color);
        if (hasFx) window.MapFX.setAccent(f.color);
      }
      // Logo de la mairie posé à côté du nom de la commune dans le HUD
      if (f.iconUrl) {
        const logo = $('hud-logo');
        logo.onerror = () => { logo.hidden = true; };
        logo.src = f.iconUrl;
        logo.hidden = false;
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
    // La PREUVE : la phrase exacte relevée dans la source. C'est ce qui fait la
    // différence entre « une IA a produit une liste » et « nous avons lu ceci ».
    if (g.quote) showQuote(g.quote, g.media);
    if (hasFx && typeof g.lat === 'number') {
      window.MapFX.addProject({ lat: g.lat, lng: g.lng, geometry: g.geometry, precise: true, title: g.title });
      tourPoints.push({ lat: g.lat, lng: g.lng, title: g.title, surface: g.geometry ? 2 : 1 });
      // Un arc par source qui atteste le projet, coloré selon sa nature : ils
      // convergent sur la punaise, le recoupement devient visible
      (g.sources || []).forEach((kind, i) => {
        setTimeout(() => window.MapFX.pulseSource(kind, { lat: g.lat, lng: g.lng }), i * 220);
      });
    }
  }

  /* Bandeau de preuve : la citation reste affichée quelques secondes, le temps
     d'être lue, puis s'efface. Un seul bandeau à l'écran, le plus récent. */
  let quoteTimer = null;
  function showQuote(texte, media) {
    const box = $('quote');
    if (!box) return;
    $('quote-text').textContent = `« ${texte} »`;
    $('quote-media').textContent = media ? `relevé sur ${media}` : 'source publique';
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('is-on'));
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => {
      box.classList.remove('is-on');
      setTimeout(() => { box.hidden = true; }, 600);
    }, 5200);
  }

  // Titre du projet que la caméra vient survoler, en grand au centre
  function showFlyover(p) {
    const el = $('flyover');
    if (!el) return;
    if (!p) { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 600); return; }
    $('flyover-title').textContent = p.title || '';
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-on'));
  }

  // Ce qu'on REFUSE : un projet sans emplacement vérifiable, une photo hors
  // sujet. L'afficher est un gage de rigueur que personne d'autre ne donne.
  function onRejected(msg) {
    const el = $('rejected');
    if (!el) return;
    rejected[msg.kind] = msg.count;
    const bouts = [];
    if (rejected.position) bouts.push(`${rejected.position} projet${rejected.position > 1 ? 's' : ''} écarté${rejected.position > 1 ? 's' : ''}, emplacement non vérifiable`);
    // Un doublon n'est PAS un emplacement non vérifiable : le projet était
    // parfaitement situé, c'est la fiche qui faisait double emploi. Les
    // confondre revenait à mentir à l'écran sur le motif du rejet.
    if (rejected.doublon) bouts.push(`${rejected.doublon} fiche${rejected.doublon > 1 ? 's' : ''} fusionnée${rejected.doublon > 1 ? 's' : ''}, même chantier vu par deux sources`);
    if (rejected.photo) bouts.push(`${rejected.photo} fiche${rejected.photo > 1 ? 's' : ''} sans photo : aucune image du projet trouvée`);
    // Un avis de marché écarté n'est pas une fiche ratée : c'est une fiche
    // faible qu'on refuse parce que la commune documente déjà mieux.
    if (rejected.marche) bouts.push(`${rejected.marche} avis de marché écarté${rejected.marche > 1 ? 's' : ''} : la commune documente déjà ses projets`);
    el.textContent = bouts.join('  ·  ');
    el.hidden = !bouts.length;
  }

  /* Avertissement de carte courte. Le visiteur apprend AVANT l'arrivée que sa
     carte comptera peu de projets : ne le dire qu'à l'écran de fin, où son
     adresse e-mail lui est demandée, reviendrait à lui faire payer une
     surprise. La génération, elle, continue normalement. */
  function showNotice(message) {
    const el = $('hud-notice');
    if (!el || !message) return;
    el.textContent = message;
    el.hidden = false;
  }

  /* Remet l'écran de fin dans sa présentation par défaut, celle d'une carte
     publiée. Sans ce nettoyage, une commune dont le web ne dit rien laisserait
     son titre, sa loupe et ses libellés de formulaire à la commune suivante. */
  const EMBLEMES = ['carte', 'loupe', 'reprise', 'demain'];

  function resetIssue() {
    sansProjet = false;
    const notice = $('hud-notice');
    if (notice) { notice.hidden = true; notice.textContent = ''; }
    $('done-card').classList.remove('done--sans-espace');
    EMBLEMES.forEach((e) => { $(`embleme-${e}`).hidden = e !== 'carte'; });
    $('done-titre-avant').textContent = 'La carte de ';
    $('done-titre-apres').textContent = ' est prête';
    $('lead-label').textContent = 'Votre adresse e-mail pour ouvrir cette carte';
    $('lead-submit').textContent = 'Accéder';
    $('btn-regen').textContent = 'Refaire le recensement';
    $('btn-again').textContent = 'Autre commune';
  }

  /* Ce que l'écran dit de l'origine d'une illustration. La vue aérienne se
     revendique : montrer le lieu exact du chantier est un argument devant un
     élu qui connaît sa commune, pas un pis-aller à masquer.
     `generique` est l'ancien champ, conservé le temps qu'une génération lancée
     avant une mise en ligne se termine. */
  const LIBELLES_ILLUSTRATION = {
    photo: 'illustration trouvée',
    aerien: 'vue aérienne du lieu exact',
    generique: 'illustration générique du type d\'ouvrage',
  };

  function onMediaItem(msg) {
    bumpCounter('illustres');
    const origine = msg.source || (msg.generique ? 'generique' : 'photo');
    tick('photo', msg.title, LIBELLES_ILLUSTRATION[origine] || LIBELLES_ILLUSTRATION.photo);
    if (hasFx && typeof msg.lat === 'number' && msg.coverSrc) {
      window.MapFX.attachPhoto(msg.lat, msg.lng, msg.coverSrc);
    }
  }

  /* ─── Génération (phases SSE enchaînées, reprise automatique) ─── */

  const MAX_RESUMES = 4;
  /* Plafond DUR de reprises pour une génération, tous cycles confondus. Le
     compteur par phase ci-dessous se recharge à chaque phase franchie, ce qui
     est voulu pour une longue génération. Mais il rendait aussi possible une
     boucle sans fin : une erreur relançait `phase=analyse`, le serveur
     répondait par un événement `phase` de reprise, le compteur repartait à
     zéro, et le cycle recommençait indéfiniment en repayant l'IA. Ce
     second compteur, lui, n'est remis à zéro qu'au lancement d'une commune. */
  const MAX_RESUMES_TOTAL = 12;
  let resumeAttempts = 0;
  let resumeTotal = 0;
  // Phase en cours, pour reprendre là où on en est plutôt que tout au début
  let currentPhase = null;
  let currentVille = null;
  /* La reprise ciblée n'est tentée QU'UNE FOIS par phase. Si elle échoue, la
     suivante repasse par la route d'analyse, seule capable de retrouver la
     bonne phase depuis n'importe quel état et de débloquer un verrou resté en
     place. Viser la phase en aveugle à chaque tentative supprimait ce filet. */
  let repriseCibleeTentee = false;

  function openStream(url) {
    es = new EventSource(url);
    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      // Journal navigateur : suivre le déroulé et diagnostiquer un blocage
      if (msg.type === 'step') console.log(`%c[demo] ${msg.id} ${msg.status}`, 'color:#1977b7;font-weight:600', msg.label, msg.detail || '');
      else if (msg.type === 'phase') console.log('%c[demo] → phase suivante : ' + msg.next, 'color:#8B5CF6;font-weight:600', msg.ville);
      else if (msg.type === 'error') console.warn(`[demo] ERREUR ${msg.retryable ? '(nouvelle tentative)' : '(definitive)'} :`, msg.message, msg.debug || '');
      else if (msg.type === 'done') console.log('%c[demo] ✓ TERMINÉ', 'color:#22c583;font-weight:600', `${msg.projectsCount ?? ''} projets`, msg.url);
      // Compteur remis à zéro sur une PHASE achevée seulement. Le remettre sur
      // chaque `step` permettait une boucle sans fin : une phase qui échoue
      // toujours après avoir émis ses premières étapes rechargeait son crédit
      // de reprises à chaque tentative.
      if (msg.type === 'phase') {
        resumeAttempts = 0;
        currentPhase = msg.next;
        currentVille = msg.ville;
        repriseCibleeTentee = false;
      }
      if (msg.type === 'step') onStep(msg);
      else if (msg.type === 'finding') onFinding(msg);
      else if (msg.type === 'ai-item') onAiItem(msg);
      else if (msg.type === 'media-item') onMediaItem(msg);
      else if (msg.type === 'cover-item') tick('photo', msg.title, 'illustration installée');
      else if (msg.type === 'article-item') tick('plume', msg.title, 'article rédigé');
      else if (msg.type === 'create-item') tick('fusee', msg.label, '');
      else if (msg.type === 'projects') onProjects(msg.items || []);
      else if (msg.type === 'geo-item') onGeoItem(msg);
      else if (msg.type === 'rejected') onRejected(msg);
      else if (msg.type === 'phase') {
        es.close(); es = null;
        setPill($('hud-label').textContent || 'Analyse en cours...', 'Étape suivante...', false);
        openStream(`/api/demo-generate?phase=${encodeURIComponent(msg.next)}&ville=${encodeURIComponent(msg.ville)}`);
      }
      else if (msg.type === 'done') { es.close(); es = null; onDone(msg); }
      else if (msg.type === 'notice') showNotice(msg.message);
      else if (msg.type === 'error') {
        es.close(); es = null;
        if (msg.retryable) tryResume(msg.debug);
        else onError(msg.message, msg.debug, msg.kind);
      }
    };
    es.onerror = () => {
      if (!es) return;
      console.warn('[demo] connexion SSE interrompue, tentative de reprise');
      es.close();
      es = null;
      tryResume();
    };
  }

  function tryResume(debug) {
    if (debug) console.error('[demo-generate]', debug);
    if (currentCommune && resumeAttempts < MAX_RESUMES && resumeTotal < MAX_RESUMES_TOTAL) {
      resumeAttempts++;
      resumeTotal++;
      console.warn(`[demo] reprise automatique ${resumeAttempts}/${MAX_RESUMES} (${resumeTotal}/${MAX_RESUMES_TOTAL} au total) pour ${currentCommune.nom}`);
      tick('fusee', 'Reconnexion...', `reprise automatique (${resumeAttempts}/${MAX_RESUMES})`);
      setTimeout(() => {
        if (!es && screens.progress.classList.contains('is-active')) {
          /* Première tentative : viser directement la phase en cours, c'est le
             chemin le plus court. Tentatives suivantes : repasser par la route
             d'analyse, qui sait retrouver la bonne phase depuis n'importe quel
             état et débloquer un verrou laissé par une invocation tuée. */
          const cible = currentPhase && currentVille && !repriseCibleeTentee;
          if (cible) repriseCibleeTentee = true;
          openStream(cible
            ? `/api/demo-generate?phase=${encodeURIComponent(currentPhase)}&ville=${encodeURIComponent(currentVille)}`
            : `/api/demo-generate?commune=${encodeURIComponent(currentCommune.code)}${kioskParam}`);
        }
      }, 1800);
    } else {
      onError('La génération n\'a pas abouti malgré plusieurs tentatives. Réessayez, ou passez nous voir pour une démo guidée.');
    }
  }

  // `regen` refait le recensement d'une commune déjà générée au lieu d'ouvrir
  // l'espace existant. L'adresse de l'espace ne change pas.
  function start(commune, { regen = false } = {}) {
    const relance = regen || regenEnAttente;
    regenEnAttente = false;
    currentCommune = commune;
    resumeAttempts = 0;
    resumeTotal = 0;
    currentPhase = null;
    currentVille = null;
    repriseCibleeTentee = false;
    startTime = Date.now();
    lastDone = null;
    window.OPAnalytics?.capture('demo_generation_started', {
      municipality: commune.nom,
      municipality_insee: commune.code,
      population: commune.population || null,
      kiosk: KIOSK,
      regen: relance,
    });
    resetLead();
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
    $('hud-logo').hidden = true;
    $('hud-logo').removeAttribute('src');
    resetIssue();
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

    openStream(`/api/demo-generate?commune=${encodeURIComponent(commune.code)}${kioskParam}${relance ? '&regen=1' : ''}`);
  }

  /* Trois situations, trois textes. Sur une carte courte, le compte rendu de
     performance (« 2 projets recensés, vérifiés et publiés en 1 min 40 »)
     sonnerait comme un aveu. On dit alors ce que le web public documente, puis
     ce que les documents de la commune permettraient d'y ajouter : le manque
     appartient aux sources en ligne, jamais à la commune. */
  function detailDeFin(msg, elapsedTxt) {
    if (msg.existing) return 'Cet espace avait déjà été généré : le voici.';
    if (!msg.courte) return `${msg.projectsCount} projets recensés, vérifiés et publiés en ${elapsedTxt}.`;
    const trouve = msg.projectsCount > 1 ? `${msg.projectsCount} projets documentés` : 'un seul projet documenté';
    return `Nous avons trouvé ${trouve} dans les sources publiques de votre commune. `
      + 'Vous en menez certainement davantage, et vos délibérations, votre PLU et vos marchés en cours '
      + 'nous permettront de les ajouter à cette carte en quelques jours.';
  }

  function onDone(msg) {
    lastDone = msg;
    // L'espace généré porte le même identifiant de ville que les autres espaces :
    // sans cet appel, le tunnel de démo serait invisible dans une analyse par ville.
    window.OPAnalytics?.setCity(msg.ville);
    const targetUrl = new URL(msg.url, window.location.origin).toString();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const elapsedTxt = elapsed >= 60 ? `${Math.floor(elapsed / 60)} min ${String(elapsed % 60).padStart(2, '0')} s` : `${elapsed} s`;
    window.OPAnalytics?.capture('demo_generation_completed', {
      municipality: msg.communeNom || currentCommune?.nom || null,
      municipality_insee: msg.communeInsee || currentCommune?.code || null,
      projects_count: msg.projectsCount ?? null,
      duration_seconds: elapsed,
      existing: !!msg.existing,
      kiosk: KIOSK,
    });
    $('done-commune').textContent = msg.communeNom || currentCommune?.nom || '';
    $('done-detail').textContent = detailDeFin(msg, elapsedTxt);
    $('btn-open').href = targetUrl;
    if (KIOSK) $('btn-open').target = '_blank';
    $('qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(targetUrl)}`;
    /* Toute commune de la démo est un espace d'ESSAI : elle doit pouvoir être
       refaite depuis zéro à tout moment, pas seulement quand on retombe sur un
       espace déjà généré. On remontre ainsi une commune après une amélioration
       du système, et on rejoue une génération décevante devant le prospect,
       sans changer le lien déjà envoyé. */
    $('btn-regen').hidden = !currentCommune;
    resetLead();

    if (msg.stats) {
      $('stat-sources').textContent = msg.stats.sources;
      $('stat-verified').textContent = msg.stats.verified;
      $('stat-precise').textContent = msg.stats.precise;
      $('stat-illustrated').textContent = msg.stats.illustrated;
      $('done-stats').hidden = false;
    } else {
      $('done-stats').hidden = true;
    }

    finishStages();
    setProgress(100);

    /* Survol final avant l'écran de fin. La caméra plonge sur les projets les
       plus marquants, titre affiché en grand, puis remonte en vue d'ensemble.
       Sans lui, trois minutes de montée retombaient sur un recadrage statique.
       L'écran de fin n'apparaît qu'après, ou tout de suite si rien à survoler. */
    const phares = tourPoints
      .slice()
      .sort((a, b) => b.surface - a.surface)
      .slice(0, 3);

    /* Le compte à rebours n'est PAS lancé à la fin de la génération : rediriger
       un visiteur pendant qu'il tape son adresse serait le meilleur moyen de
       n'en récolter aucune. Il démarre une fois l'adresse donnée, avec un filet
       de sécurité pour qu'un écran de salon ne reste jamais planté sur une
       commune que plus personne ne regarde. Le filet part à l'affichage de
       l'écran de fin, pas avant : le survol dure une quinzaine de secondes. */
    startCountdown.cible = targetUrl;
    const terminer = () => {
      showFlyover(null);
      show('done');
      // Le champ prend le focus : sur un écran de salon avec clavier, c'est ce
      // qui transforme une case affichée en question posée.
      try { $('lead-email').focus(); } catch { /* champ absent */ }
      armerFiletLead();
    };
    if (hasFx && phares.length && !msg.existing) {
      window.MapFX.tour(phares, showFlyover, terminer);
    } else {
      if (hasFx) window.MapFX.finale();
      terminer();
    }
  }

  /* ─── Récupération de l'adresse en fin de parcours ─── */

  // Filet de sécurité : sans geste du visiteur, l'écran de salon reprend son cycle.
  const LEAD_ABANDON_MS = 120000;
  const EMAIL_RE = /^[^\s@]+@[^\s@,;]+\.[a-z]{2,}$/i;
  /* Porte de service de celui qui tient le stand : ce code tapé dans le champ
     de l'adresse ouvre l'espace sans adresse ni envoi. Il ne s'affiche nulle
     part et n'est comparé qu'en entier, pour qu'une vraie adresse contenant
     le mot parte bien en lead. */
  const LEAD_BYPASS = 'vazy';

  /* Filet de sécurité : le visiteur est parti sans répondre. L'écran de salon
     doit alors se rendre au visiteur suivant, mais il ne DÉVERROUILLE pas
     l'espace pour autant : l'adresse est la condition d'accès, l'attente ne
     peut pas en tenir lieu. Hors kiosque, la page reste simplement sur la
     question, personne n'a besoin qu'on la lui reprenne. */
  function armerFiletLead() {
    clearTimeout(leadTimer);
    if (!KIOSK) return;
    leadTimer = setTimeout(reset, LEAD_ABANDON_MS);
  }

  // Affiche ou efface le motif de refus, en accordant le champ au message
  function setLeadError(message) {
    const champ = document.querySelector('.lead__field');
    $('lead-error').textContent = message || '';
    $('lead-error').hidden = !message;
    if (champ) champ.classList.toggle('is-error', Boolean(message));
  }

  function resetLead() {
    clearTimeout(leadTimer);
    const form = $('lead-form');
    if (!form) return;
    form.hidden = false;
    // La suite de l'écran (accès à l'espace, QR code) reste couverte tant
    // qu'aucune adresse n'est donnée : c'est ce qui fait qu'on demande vraiment
    // l'adresse au lieu de la proposer à côté d'un bouton qui emmène ailleurs.
    $('done-suite').hidden = true;
    $('lead-email').value = '';
    $('lead-email').disabled = false;
    $('lead-submit').disabled = false;
    setLeadError('');
    $('lead-thanks').hidden = true;
    $('countdown').textContent = '';
  }

  /* Déverrouille l'espace : le formulaire cède la place à l'accès et au QR
     code. Deux entrées seulement, une adresse valide envoyée ou le code de
     service du stand. */
  function closeLead(merci) {
    clearTimeout(leadTimer);
    const form = $('lead-form');
    if (form) form.hidden = true;
    $('lead-thanks').hidden = !merci;
    $('done-suite').hidden = false;
    startCountdown();
  }

  function startCountdown() {
    clearTimeout(redirectTimer);
    const targetUrl = startCountdown.cible;
    if (!targetUrl) return;
    // Le compte a rebours n'est jamais lance seul : il est declenche par
    // closeLead, une fois l'espace deverrouille.
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

  $('lead-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(leadTimer);
    // Un compte à rebours déjà parti ne doit pas emporter le visiteur pendant
    // l'envoi de son adresse
    clearTimeout(redirectTimer);
    $('countdown').textContent = '';
    const email = $('lead-email').value.trim();
    /* Porte de service : rien n'est enregistré, rien n'est mesuré, l'espace
       s'ouvre. C'est ce qui permet de montrer la suite de la démo sans salir
       la table des leads avec une adresse de service. */
    if (email.toLowerCase() === LEAD_BYPASS) {
      setLeadError('');
      closeLead(false);
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setLeadError(email
        ? 'Cette adresse ne semble pas valide.'
        : 'Votre adresse e-mail est nécessaire pour ouvrir la carte.');
      $('lead-email').focus();
      // Le filet repart : le visiteur peut aussi renoncer en ne faisant rien
      armerFiletLead();
      return;
    }
    setLeadError('');
    $('lead-email').disabled = true;
    $('lead-submit').disabled = true;
    /* Le remerciement dit ce qui s'est REELLEMENT passe. Promettre un lien qui
       ne part pas serait la pire fin de demo possible : le visiteur attend un
       message qui n'arrivera jamais. */
    let envoye = false;
    try {
      const r = await fetch('/api/demo-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          ville: lastDone?.ville || '',
          communeNom: lastDone?.communeNom || currentCommune?.nom || '',
          communeInsee: lastDone?.communeInsee || currentCommune?.code || '',
          /* Zéro projet documenté est une information, pas une absence de
             mesure : la relance commerciale doit savoir qu'elle s'adresse à une
             commune dont la carte reste entièrement à construire. */
          projectsCount: lastDone?.projectsCount ?? (sansProjet ? 0 : null),
          kiosk: KIOSK,
        }),
      });
      envoye = r.ok && (await r.json().catch(() => ({}))).mailed === true;
    } catch {
      // Un enregistrement raté ne doit pas gâcher la fin de la démo : on
      // remercie quand même, le visiteur a fait sa part.
      console.warn('[demo] enregistrement de l\'adresse impossible');
    }
    // Le lead de la démo salon : l'événement le plus important du tunnel.
    // Seul le fait qu'une adresse ait été laissée est mesuré, jamais l'adresse.
    window.OPAnalytics?.capture('demo_lead_submitted', {
      municipality: lastDone?.communeNom || currentCommune?.nom || null,
      mailed: envoye,
      kiosk: KIOSK,
    });
    $('lead-thanks-texte').textContent = envoye
      ? 'Merci, le lien part sur votre adresse.'
      : 'Merci, votre adresse est bien enregistrée.';
    closeLead(true);
  });

  /* Taper dans le champ suspend le filet ET annule un compte à rebours déjà
     lancé : personne ne doit être redirigé en pleine saisie. Sans l'annulation
     de `redirectTimer`, le visiteur qui revenait au champ après les 45 s se
     faisait quand même emporter par la redirection en cours. */
  $('lead-email').addEventListener('input', () => {
    clearTimeout(leadTimer);
    clearTimeout(redirectTimer);
    $('countdown').textContent = '';
    // Le refus s'efface dès la première correction : le laisser affiché pendant
    // que le visiteur retape son adresse le fait douter pour rien.
    if (!$('lead-error').hidden) setLeadError('');
    armerFiletLead();
  });

  /* Le web public ne documente aucun projet de la commune. Ce parcours ne se
     termine PAS sur l'écran d'échec : il rejoint l'écran de fin dans une autre
     présentation. C'était le seul chemin qui laissait repartir un visiteur sans
     rien lui demander, alors que sa commune est précisément celle à qui une
     carte manque le plus. */
  /* Les issues qui n'ouvrent AUCUN espace. Elles partagent le même écran, la
     même demande d'adresse et la même sortie : ce qui les distingue tient dans
     cette table, jamais dans le code qui les affiche.

     Aucune ne passe plus par un bandeau d'erreur. Le visiteur vient d'attendre
     trois minutes devant sa commune : lui rendre une vignette rouge et un
     bouton « Recommencer », qui ne recommençait d'ailleurs rien puisqu'il
     ramenait à la saisie, était la pire fin possible. */
  const CONSTATS = {
    'sans-projet': {
      embleme: 'loupe',
      titreAvant: 'Les projets de ',
      titreApres: ' ne sont pas encore documentés en ligne',
      lead: 'Votre adresse e-mail pour que nous préparions votre carte',
      relance: 'Refaire le recensement',
      // Le texte vient du serveur : il nomme la commune et enchaîne sur l'offre
      detail: null,
    },
    quota: {
      embleme: 'demain',
      titreAvant: 'Le recensement de ',
      titreApres: ' attendra demain',
      lead: 'Votre adresse e-mail pour recevoir la carte demain',
      relance: 'Refaire le recensement',
      detail: "Nous avons atteint notre nombre de générations pour aujourd'hui. "
        + 'Laissez-nous votre adresse et nous lançons la carte demain matin, '
        + 'puis nous vous envoyons son lien.',
    },
    technique: {
      embleme: 'reprise',
      titreAvant: 'Le recensement de ',
      titreApres: " s'est interrompu",
      lead: 'Votre adresse e-mail pour que nous reprenions la carte',
      relance: 'Réessayer cette commune',
      /* Le message du serveur parle de brouillons et de phases : c'est utile
         dans la console, illisible pour un maire. On lui dit ce qui le
         concerne, et ce qu'on lui propose. */
      detail: "Notre machine n'a pas pu terminer la carte, et nous préférons ne rien vous montrer "
        + "plutôt qu'un travail à moitié fait. Laissez-nous votre adresse et nous la reprendrons "
        + "de notre côté, puis nous vous préviendrons dès qu'elle sera en ligne.",
    },
  };

  /* Fin de parcours sans espace à ouvrir. Elle rejoint l'écran de fin dans une
     autre présentation, au lieu de laisser le visiteur devant un constat sec :
     c'était le seul chemin qui le laissait repartir sans qu'on lui demande
     rien. */
  function terminerSurUnConstat(motif, message) {
    const c = CONSTATS[motif] || CONSTATS.technique;
    sansProjet = motif === 'sans-projet';
    resetLead();
    $('done-card').classList.add('done--sans-espace');
    EMBLEMES.forEach((e) => { $(`embleme-${e}`).hidden = e !== c.embleme; });
    $('done-titre-avant').textContent = c.titreAvant;
    $('done-commune').textContent = currentCommune?.nom || '';
    $('done-titre-apres').textContent = c.titreApres;
    $('done-detail').textContent = c.detail || message;
    $('done-stats').hidden = true;
    $('btn-regen').hidden = !currentCommune;
    $('btn-regen').textContent = c.relance;
    $('btn-again').textContent = 'Essayer une autre commune';
    $('lead-label').textContent = c.lead;
    $('lead-submit').textContent = 'Envoyer';
    /* Ici l'adresse est DEMANDÉE, elle n'est pas exigée. Aucun espace n'attend
       derrière, et retenir un visiteur devant une porte qui n'ouvre sur rien
       serait un marché de dupes : la sortie reste donc offerte d'emblée. */
    $('done-suite').hidden = false;
    if (hasFx) { window.MapFX.scanStop(); window.MapFX.orbitStop(); }
    finishStages();
    setProgress(100);
    show('done');
    try { $('lead-email').focus(); } catch { /* champ absent */ }
    armerFiletLead();
  }

  function onError(message, debug, kind) {
    if (debug) console.error('[demo-generate]', debug);
    // Le message technique reste consultable, il ne s'affiche simplement plus
    if (!CONSTATS[kind]) console.warn('[demo] fin technique :', message);
    window.OPAnalytics?.capture('demo_generation_failed', {
      municipality: currentCommune?.nom || null,
      municipality_insee: currentCommune?.code || null,
      phase: currentPhase || null,
      // Sans ce motif, l'analyse confond une panne technique avec une commune
      // dont le web public ne dit rien : deux situations sans rapport.
      reason: CONSTATS[kind] ? kind : 'technique',
      resume_attempts: resumeTotal,
      kiosk: KIOSK,
    });
    terminerSurUnConstat(CONSTATS[kind] ? kind : 'technique', message);
  }

  function reset() {
    clearTimeout(redirectTimer);
    clearTimeout(leadTimer);
    if (es) { es.close(); es = null; }
    lastDone = null;
    startCountdown.cible = null;
    resetLead();
    $('btn-regen').hidden = true;
    input.value = '';
    renderSuggestions([]);
    counters = {};
    $('counters').innerHTML = '';
    tickerQueue = [];
    tickerBusy = false;
    resetStages();
    // Preuve, refus et survol : sans ce nettoyage, la commune suivante
    // heritait de la citation et du compteur d'ecartes de la precedente
    tourPoints = [];
    Object.keys(rejected).forEach((k) => delete rejected[k]);
    clearTimeout(quoteTimer);
    resetIssue();
    ['quote', 'rejected', 'flyover'].forEach((id) => {
      const el = $(id);
      if (el) { el.hidden = true; el.classList.remove('is-on'); }
    });
    $('hud-logo').hidden = true;
    $('hud-logo').removeAttribute('src');
    progressPct = 0;
    setProgress(0);
    ['stat-sources', 'stat-verified', 'stat-precise', 'stat-illustrated'].forEach((id) => { $(id).textContent = '0'; });
    document.documentElement.style.removeProperty('--accent');
    if (hasFx) window.MapFX.reset();
    show('input');
    attractStart();
    if (!KIOSK) input.focus();
  }

  $('btn-again').addEventListener('click', reset);
  // Liaison unique : posée dans onDone(), elle s'empilait à chaque génération
  // et un seul clic émettait autant d'événements que de communes déjà jouées.
  $('btn-open').addEventListener('click', () => {
    window.OPAnalytics?.capture('demo_space_opened', { municipality: lastDone?.communeNom || null });
  });

  // Refaire le recensement d'une commune déjà générée : l'adresse de l'espace
  // ne change pas, ses fiches sont remplacées.
  $('btn-regen').addEventListener('click', () => {
    if (!currentCommune) return;
    clearTimeout(redirectTimer);
    clearTimeout(leadTimer);
    start(currentCommune, { regen: true });
  });

  /* ─── Lancement ─── */

  // Meme motif que la fonction serveur : la lettre des codes corses est en
  // DEUXIEME position (2A004), pas en troisieme.
  const INSEE_RE = /^(?:\d{2}|2[AB])\d{3}$/i;
  const codeParam = URL_PARAMS.get('commune');
  if (codeParam && INSEE_RE.test(codeParam)) {
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
