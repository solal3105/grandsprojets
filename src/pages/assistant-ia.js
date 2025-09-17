(function(){
    const pdfInput = document.getElementById('pdf-input');
    const pdfDrop = document.getElementById('pdf-drop');
    const pdfList = document.getElementById('pdf-list');

    const urlInput = document.getElementById('url-input');
    const addUrlBtn = document.getElementById('add-url');
    const urlList = document.getElementById('url-list');

    const notes = document.getElementById('notes');
    const notesCount = document.getElementById('notes-count');
    const continueBtn = document.getElementById('continue');
    const gridEl = document.getElementById('grid');
    const prepCard = document.getElementById('prep-card');
    // Google search UI (mock)
    const gq = document.getElementById('gq');
    const gsearch = document.getElementById('gsearch');
    const gresults = document.getElementById('gresults');
    // Modale
    const gmodal = document.getElementById('gmodal');
    const gmodalClose = document.getElementById('gmodal-close');
    const gmodalAdd = document.getElementById('gmodal-add');
    const gresultsModal = document.getElementById('gresults-modal');
    const gmodalError = document.getElementById('gmodal-error');
    // Modale progression
    const pmodal = document.getElementById('pmodal');
    const pmodalClose = document.getElementById('pmodal-close');
    const pmodalList = document.getElementById('pmodal-list');
    const pmodalDot = document.getElementById('pmodal-dot');
    const pmodalStatusText = document.getElementById('pmodal-status-text');
    // Bouton Générer dans la modale + champs générés
    const pmodalGenerate = document.getElementById('pmodal-generate');
    const pmodalGenerated = document.getElementById('pmodal-generated');
    const pseo = document.getElementById('pseo');
    const pdesc = document.getElementById('pdesc');
    // Cibles hors modale (section prep-title)
    const prepMeta = document.getElementById('prep-meta');
    const prepDescription = document.getElementById('prep-description');
    const prepMarkdown = document.getElementById('prep-markdown');
    const copyMdBtn = document.getElementById('copy-md');
    const togglePreviewBtn = document.getElementById('toggle-preview');
    const mdPreview = document.getElementById('md-preview');
    const copyMetaBtn = document.getElementById('copy-meta');
    const copyDescBtn = document.getElementById('copy-desc');
    const postGenHint = document.getElementById('post-gen-hint');
    // Panneau usage tokens
    const usagePanel = document.getElementById('usage-panel');
    const uPrompt = document.getElementById('u-prompt');
    const uCompletion = document.getElementById('u-completion');
    const uTotal = document.getElementById('u-total');
    const uMax = document.getElementById('u-max');
    const uSrcChars = document.getElementById('u-src-chars');
    const uSrcEst = document.getElementById('u-src-est');
    let upCount = 0; // compteur de votes utiles
    
    function updateProgress(){
      const bar = document.getElementById('gprogress-bar');
      const label = document.getElementById('gprogress-label');
      const capped = Math.min(upCount, 10);
      if(bar) bar.style.width = (capped * 10) + '%';
      if(label) label.textContent = capped + ' utiles (max 10)';
    }
    function showModalError(msg){
      if(!gmodalError) return;
      gmodalError.textContent = msg;
      gmodalError.removeAttribute('hidden');
      clearTimeout(gmodalError._t);
      gmodalError._t = setTimeout(()=>{ gmodalError.setAttribute('hidden',''); }, 2500);
    }
    let lastFocusedBeforeModal = null;

    const state = { pdfs: [], urls: [], notes: '', aggregated: '' };

    function renderPdfs(){
      pdfList.innerHTML = '';
      state.pdfs.forEach((file, i) => {
        const li = document.createElement('li');
        const left = document.createElement('span');
        left.className = 'name';
        left.textContent = file.name + ' (' + Math.round(file.size/1024) + ' Ko)';
        const rm = document.createElement('button');
        rm.className = 'btn secondary';
        rm.textContent = 'Retirer';
        rm.type = 'button';
        rm.onclick = () => { state.pdfs.splice(i,1); renderPdfs(); updateContinue(); };
        li.appendChild(left); li.appendChild(rm); pdfList.appendChild(li);
      });
    }

    function renderUrls(){
      urlList.innerHTML = '';
      state.urls.forEach((u, i) => {
        const li = document.createElement('li');
        const left = document.createElement('a');
        left.className = 'name';
        left.href = u; left.target = '_blank'; left.rel = 'noopener';
        left.textContent = u;
        const rm = document.createElement('button');
        rm.className = 'btn secondary';
        rm.textContent = 'Retirer';
        rm.type = 'button';
        rm.onclick = () => { state.urls.splice(i,1); renderUrls(); updateContinue(); };
        li.appendChild(left); li.appendChild(rm); urlList.appendChild(li);
      });
    }

    function updateContinue(){
      // Autoriser la génération si au moins un des contenus est présent:
      // - un PDF
      // - une URL saisie manuellement
      // - une note
      // - au moins un site ajouté depuis la recherche (présent dans #gresults)
      const sitesCount = gresults ? gresults.querySelectorAll('li.result-item').length : 0;
      const hasContent = (state.pdfs.length > 0)
        || (state.urls.length > 0)
        || ((state.notes && state.notes.trim().length > 0))
        || (sitesCount > 0);
      continueBtn.disabled = !hasContent;
    }

    // PDFs via input
    pdfInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      const pdfs = files.filter(f => f.type === 'application/pdf');
      state.pdfs.push(...pdfs);
      renderPdfs(); updateContinue();
      pdfInput.value = '';
    });

    // PDFs via drag & drop + click/keyboard
    ;['dragenter','dragover'].forEach(ev => pdfDrop.addEventListener(ev, (e)=>{ e.preventDefault(); pdfDrop.classList.add('dragover'); }));
    ;['dragleave','drop'].forEach(ev => pdfDrop.addEventListener(ev, (e)=>{ e.preventDefault(); pdfDrop.classList.remove('dragover'); }));
    pdfDrop.addEventListener('drop', (e) => {
      const dt = e.dataTransfer; if(!dt) return;
      const files = Array.from(dt.files || []);
      const pdfs = files.filter(f => f.type === 'application/pdf');
      state.pdfs.push(...pdfs); renderPdfs(); updateContinue();
    });
    pdfDrop.addEventListener('click', () => pdfInput.click());
    pdfDrop.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pdfInput.click(); } });

    // URLs
    function addUrl(){
      const v = (urlInput.value || '').trim();
      if(!v) return;
      try { new URL(v); } catch { urlInput.focus(); return; }
      state.urls.push(v); urlInput.value=''; renderUrls(); updateContinue();
    }
    addUrlBtn.addEventListener('click', addUrl);
    urlInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addUrl(); } });

    // Notes
    notes.addEventListener('input', () => {
      state.notes = notes.value;
      notesCount.textContent = (state.notes.length||0) + ' caractères';
      updateContinue();
    });

    // Init
    renderPdfs(); renderUrls(); updateContinue();
    // S'assurer que la modale est bien fermée au chargement
    (function(){ const el = document.getElementById('gmodal'); if(el && !el.hasAttribute('hidden')){ el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); } })();

    // Config PDF.js (worker)
    try { if(window.pdfjsLib && pdfjsLib.GlobalWorkerOptions){ pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; } } catch {}

    // Helpers extraction
    async function extractTextFromPdfFile(file){
      try {
        const buf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        const maxPages = Math.min(doc.numPages, 30); // limite préventive
        let out = `\n--- PDF: ${file.name} (${doc.numPages} pages, extrait ${maxPages}) ---\n`;
        for(let p=1; p<=maxPages; p++){
          const page = await doc.getPage(p);
          const tc = await page.getTextContent();
          const text = tc.items.map(it => it.str).join(' ');
          out += `\n[Page ${p}]\n` + text + '\n';
        }
        return out;
      } catch(e){
        return `\n--- PDF: ${file.name} ---\n[Erreur d'extraction PDF]`;
      }
    }

    function toReadableProxyUrl(raw){
      try{
        const u = new URL(raw);
        const path = (u.pathname || '') + (u.search || '') + (u.hash || '');
        return 'https://r.jina.ai/http://' + u.hostname + path;
      }catch{ return null; }
    }

    async function fetchReadableText(url){
      try{
        const proxied = toReadableProxyUrl(url);
        if(!proxied) return `\n--- URL: ${url} ---\n[URL invalide]`;
        const res = await fetch(proxied, { headers: { 'Accept': 'text/plain' } });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const txt = await res.text();
        return `\n--- URL: ${url} ---\n` + txt + '\n';
      }catch(e){
        return `\n--- URL: ${url} ---\n[Impossible de récupérer le contenu lisible]`;
      }
    }

    // Retrait de la section d'aperçu: on conserve uniquement l'agrégat en mémoire dans state.aggregated

    // Animations: shimmer (attente) et écriture typewriter + pop-in
    function startShimmer(el){
      if(!el) return;
      el.classList.add('shimmer');
      try { el.dataset.prevPlaceholder = el.placeholder || ''; } catch {}
      if('placeholder' in el) el.placeholder = 'Génération en cours…';
      if('value' in el) el.value = '';
    }
    function stopShimmer(el){
      if(!el) return;
      el.classList.remove('shimmer');
      try {
        if(el.dataset && 'prevPlaceholder' in el.dataset){ el.placeholder = el.dataset.prevPlaceholder; delete el.dataset.prevPlaceholder; }
      } catch {}
    }
    async function typewriter(el, text, delay=6){
      if(!el) return;
      el.classList.add('pop-in');
      if('value' in el) el.value = '';
      // Tape rapidement, puis colle la fin si trop long (performance)
      const maxSteps = 800; // limite de frappes visibles
      if(text.length <= maxSteps){
        for(let i=0; i<text.length; i++){
          el.value += text[i];
          if(i % 3 === 0) await new Promise(r=>setTimeout(r, delay));
        }
      } else {
        const head = text.slice(0, maxSteps);
        const tail = text.slice(maxSteps);
        for(let i=0; i<head.length; i++){
          el.value += head[i];
          if(i % 3 === 0) await new Promise(r=>setTimeout(r, delay));
        }
        el.value += tail; // colle le reste instantanément
      }
      setTimeout(()=> el.classList.remove('pop-in'), 420);
    }

    // Mock de recherche Google: juste pour illustrer le design (fallback)
    function renderMockResultsTo(container, query){
      container.innerHTML = '';
      const howMany = 20;
      if(!query){
        const li = document.createElement('li'); li.className='small'; li.textContent='Entrez des mots-clés puis cliquez sur Rechercher';
        container.appendChild(li); return;
      }
      for(let i=1;i<=howMany;i++){
        const li = document.createElement('li'); li.className='result-item card';
        const meta = document.createElement('div'); meta.className='meta';
        const fav = document.createElement('img'); fav.src='https://www.google.com/s2/favicons?domain=exemple.org'; fav.alt=''; meta.appendChild(fav);
        const host = document.createElement('span'); host.textContent='exemple.org'; meta.appendChild(host);
        li.appendChild(meta);
        const title = document.createElement('a'); title.className='title'; title.href='#'; title.target='_blank'; title.rel='noopener'; title.textContent = `[Mock] Résultat ${i} — ${query}`; li.appendChild(title);
        // URL complète masquée (affichage via host dans meta uniquement)
        const desc = document.createElement('div'); desc.className='snippet'; desc.textContent = 'Extrait d’aperçu… Le contenu réel sera rempli quand la recherche sera branchée.'; li.appendChild(desc);
        const actions = document.createElement('div'); actions.className='result-actions';
        const up = document.createElement('button'); up.type='button'; up.className='btn-icon'; up.setAttribute('data-vote','up'); up.innerText='👍 Utile';
        const down = document.createElement('button'); down.type='button'; down.className='btn-icon'; down.setAttribute('data-vote','down'); down.innerText='👎 Pas utile';
        actions.appendChild(up); actions.appendChild(down); li.appendChild(actions);
        container.appendChild(li);
      }
    }

    function openGModal(){
      lastFocusedBeforeModal = document.activeElement;
      gmodal.removeAttribute('hidden');
      gmodal.setAttribute('aria-hidden','false');
      gmodal.querySelector('.modal').focus();
    }
    function closeGModal(){
      gmodal.setAttribute('hidden','');
      gmodal.setAttribute('aria-hidden','true');
      if(lastFocusedBeforeModal && lastFocusedBeforeModal.focus){ lastFocusedBeforeModal.focus(); }
    }

    function openPModal(){
      lastFocusedBeforeModal = document.activeElement;
      pmodal.removeAttribute('hidden');
      pmodal.setAttribute('aria-hidden','false');
      pmodal.querySelector('.modal').focus();
    }
    function closePModal(){
      pmodal.setAttribute('hidden','');
      pmodal.setAttribute('aria-hidden','true');
      if(lastFocusedBeforeModal && lastFocusedBeforeModal.focus){ lastFocusedBeforeModal.focus(); }
    }

    async function doSearch(){
      const query = (gq.value || '').trim();
      gresultsModal.innerHTML = '';
      upCount = 0; updateProgress();
      gresultsModal.innerHTML = '<li class="result-item"><span class="spinner"></span> Chargement des résultats…</li>';
      openGModal();
      if(!query){
        gresultsModal.innerHTML = '<li class="small">Entrez des mots-clés puis lancez la recherche</li>';
        return;
      }
      try {
        const howMany = 20;
        const kl = 'fr-fr';

        // Endpoint HTML léger de DuckDuckGo + proxy CORS public AllOrigins
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(kl)}`;
        const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`;

        const res = await fetch(proxied, { headers: { 'Accept':'text/html' } });
        if(!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();

        // Parse HTML côté client
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const resultBlocks = Array.from(doc.querySelectorAll('.result'));
        const items = [];
        // Ne pas proposer dans la modale des liens déjà affichés sur la page
        const seenPage = new Set(Array.from(gresults.querySelectorAll('a')).map(a=> a.href));
        for(const block of resultBlocks){
          const a = block.querySelector('a.result__a');
          if(!a) continue;
          let href = a.getAttribute('href') || '';
          // DDG wrap: /l/?uddg=encoded
          try {
            const u = new URL(href, 'https://duckduckgo.com');
            const uddg = u.searchParams.get('uddg');
            if(uddg) href = decodeURIComponent(uddg);
          } catch {}
          const title = a.textContent?.trim() || href;
          const snippetEl = block.querySelector('.result__snippet');
          const snippet = (snippetEl?.textContent || '').replace(/\s+/g,' ').trim();
          let favicon = '';
          try { const { hostname } = new URL(href); favicon = `https://www.google.com/s2/favicons?domain=${hostname}`; } catch {}
          if(seenPage.has(href)) continue; // ignorer les doublons déjà sur la page
          items.push({ title, link: href, snippet, favicon });
          if(items.length >= howMany) break;
        }

        if(items.length === 0){
          gresultsModal.innerHTML = '<li class="small">Aucun résultat (proxy CORS indisponible ou SERP vide)</li>';
          return;
        }

        gresultsModal.innerHTML = '';
        items.forEach((it)=>{
          const li = document.createElement('li'); li.className='result-item';
          const meta = document.createElement('div'); meta.className='meta';
          if(it.favicon){ const img=document.createElement('img'); img.src=it.favicon; img.alt=''; img.decoding='async'; meta.appendChild(img); }
          try { const { hostname } = new URL(it.link); const host = document.createElement('span'); host.textContent = hostname; meta.appendChild(host); } catch {}
          li.appendChild(meta);
          const link = document.createElement('a'); link.className='title'; link.href = it.link; link.target = '_blank'; link.rel='noopener'; link.textContent = it.title || it.link; li.appendChild(link);
          // URL complète masquée (host déjà affiché dans meta)
          if(it.snippet){ const s = document.createElement('div'); s.className='snippet'; s.textContent = it.snippet; li.appendChild(s); }
          const actions = document.createElement('div'); actions.className='result-actions';
          const up = document.createElement('button'); up.type='button'; up.className='btn-icon'; up.setAttribute('data-vote','up'); up.innerText='👍 Utile';
          const down = document.createElement('button'); down.type='button'; down.className='btn-icon'; down.setAttribute('data-vote','down'); down.innerText='👎 Pas utile';
          actions.appendChild(up); actions.appendChild(down); li.appendChild(actions);
          gresultsModal.appendChild(li);
        });
      } catch (e) {
        // Fallback sur mock en cas d'erreur (proxy HS, CORS, rate limit)
        gresultsModal.innerHTML = '';
        renderMockResultsTo(gresultsModal, query);
      }
    }

    // Ouverture via bouton Rechercher / Enter sur le champ
    gsearch.addEventListener('click', doSearch);
    gq.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); doSearch(); }});

    // Continuer: ouvre la modale de progression, traite séquentiellement et affiche l'agrégat en bas
    continueBtn.addEventListener('click', async ()=>{
      state.aggregated = '';
      continueBtn.disabled = true;

      // Construire la liste des tâches
      const tasks = [];
      const trimmedNotes = (state.notes || '').trim();
      if(trimmedNotes){ tasks.push({ type:'notes', label:'Notes', data: trimmedNotes }); }
      for(const f of state.pdfs){ tasks.push({ type:'pdf', label: f.name, data: f }); }
      const usefulLinks = Array.from(gresults.querySelectorAll('a.title')).map(a=> ({ href:a.href, label: a.textContent || a.href })).filter(x=> !!x.href);
      const manualUrls = Array.from(state.urls || []).map(u=> ({ href:u, label:u }));
      const set = new Set();
      const urlTasks = [];
      [...usefulLinks, ...manualUrls].forEach(({href,label})=>{ if(!set.has(href)){ set.add(href); urlTasks.push({ type:'url', label, href }); } });
      tasks.push(...urlTasks);

      // Rendu initial des cartes
      pmodalList.innerHTML = '';
      tasks.forEach((t, idx)=>{
        const li = document.createElement('li'); li.className='pm-item'; li.id = 'pm-'+idx;
        const meta = document.createElement('div'); meta.className='meta';
        if(t.type==='url'){
          try{ const { hostname } = new URL(t.href); const fav=document.createElement('img'); fav.src='https://www.google.com/s2/favicons?domain='+hostname; fav.alt=''; meta.appendChild(fav); const host=document.createElement('span'); host.textContent=hostname; meta.appendChild(host);}catch{}
        } else if(t.type==='pdf'){
          const badge = document.createElement('span'); badge.className='pm-badge'; badge.textContent='PDF'; meta.appendChild(badge);
        } else if(t.type==='notes'){
          const badge = document.createElement('span'); badge.className='pm-badge'; badge.textContent='Notes'; meta.appendChild(badge);
        }
        li.appendChild(meta);
        const title = document.createElement('div'); title.className='pm-title'; title.textContent = t.type==='url' ? (t.label || t.href) : t.label; li.appendChild(title);
        const status = document.createElement('div'); status.className='pm-status'; status.innerHTML = '<span class="dot"></span><span>En attente…</span>'; li.appendChild(status);
        pmodalList.appendChild(li);
      });

      // Ouvrir la modale
      pmodalStatusText.textContent = 'Préparation en cours…';
      pmodalDot.style.background = '#f59e0b';
      pmodalClose.disabled = true;
      openPModal();

      // Exécution séquentielle
      let result = '';
      for(let i=0;i<tasks.length;i++){
        const t = tasks[i];
        const li = document.getElementById('pm-'+i);
        const st = li ? li.querySelector('.pm-status') : null;
        if(st){ st.querySelector('.dot').style.background = '#f59e0b'; st.querySelector('span:last-child').textContent = 'En cours…'; }
        try{
          if(t.type==='notes'){
            result += '\n--- NOTES ---\n' + t.data + '\n';
          } else if(t.type==='pdf'){
            result += await extractTextFromPdfFile(t.data);
          } else if(t.type==='url'){
            result += await fetchReadableText(t.href);
          }
          if(li){ li.classList.add('done'); const s = li.querySelector('.pm-status'); if(s){ s.innerHTML = '<span class="pm-check">✔</span><span>Terminé</span>'; } }
        } catch(e){
          if(st){ st.querySelector('span:last-child').textContent = 'Erreur'; }
        }
        state.aggregated = result; // mise à jour en mémoire
      }

      // Fin
      pmodalStatusText.textContent = 'Terminé';
      pmodalDot.style.background = '#10b981';
      pmodalClose.disabled = false;
      continueBtn.disabled = false;
      // Afficher le bouton Générer dans la modale seulement une fois fini
      if(pmodalGenerate){ pmodalGenerate.hidden = false; pmodalGenerate.focus(); }
    });

    if(pmodalGenerate){
      pmodalGenerate.addEventListener('click', async ()=>{
        const src = state.aggregated || '';
        // Fermer la modale immédiatement au clic
        closePModal();
        // Afficher la colonne de droite et repasser en layout 2 colonnes
        try{
          if(prepCard && prepCard.hasAttribute('hidden')) prepCard.removeAttribute('hidden');
          if(gridEl) gridEl.classList.remove('onecol');
        }catch{}
        try { console.log('[Gen] Start: cleanup & shimmer ON'); } catch {}
        // Lancer l'attente visuelle dans les champs de sortie
        // Réinitialiser les champs et masquer le message post-génération
        try{ prepMeta.value = ''; prepDescription.value=''; prepMarkdown.value=''; }catch{}
        if(postGenHint){ postGenHint.setAttribute('hidden',''); }
        // Cacher les boutons Copier/Aperçu tant que rien n'est prêt
        try{
          if(copyMetaBtn) copyMetaBtn.setAttribute('hidden','');
          if(copyDescBtn) copyDescBtn.setAttribute('hidden','');
          if(copyMdBtn) copyMdBtn.setAttribute('hidden','');
          if(togglePreviewBtn) togglePreviewBtn.setAttribute('hidden','');
        }catch{}
        let metaOk = false, descOk = false, artOk = false;
        startShimmer(prepMeta);
        startShimmer(prepDescription);
        startShimmer(prepMarkdown);
        // Masquer/vider le panneau usage avant nouvelle génération
        if(usagePanel){
          usagePanel.hidden = true;
          if(uPrompt) uPrompt.textContent = '-';
          if(uCompletion) uCompletion.textContent = '-';
          if(uTotal) uTotal.textContent = '-';
          if(uMax) uMax.textContent = '-';
          if(uSrcChars) uSrcChars.textContent = '-';
          if(uSrcEst) uSrcEst.textContent = '-';
          const uFinish = document.getElementById('u-finish');
          const uModel  = document.getElementById('u-model');
          const uProc   = document.getElementById('u-proc');
          const uRtRem  = document.getElementById('u-rt-rem');
          const uRtLim  = document.getElementById('u-rt-limit');
          const uVersion= document.getElementById('u-version');
          const uBodyMax= document.getElementById('u-body-max');
          if(uFinish) uFinish.textContent = '-';
          if(uModel) uModel.textContent = '-';
          if(uProc) uProc.textContent = '-';
          if(uRtRem) uRtRem.textContent = '-';
          if(uRtLim) uRtLim.textContent = '-';
          if(uVersion) uVersion.textContent = '-';
          if(uBodyMax) uBodyMax.textContent = '-';
        }

        // 1) Appels séquentiels via fonction Netlify (clé côté serveur)
        try{
          // Helper pour remplir le panneau usage
          const fillUsage = (u) => {
            if(!(u && usagePanel)) return;
            try { console.log('[Gen] USAGE', { prompt:u.prompt_tokens, completion:u.completion_tokens, total:u.total_tokens, max:u.max_tokens, finish:u.finish_reason, model:u.headers?.model, ms:u.headers?.processing_ms, mode:u.mode }); } catch {}
            if(uPrompt) uPrompt.textContent = (u.prompt_tokens ?? '-') + '';
            if(uCompletion) uCompletion.textContent = (u.completion_tokens ?? '-') + '';
            if(uTotal) uTotal.textContent = (u.total_tokens ?? '-') + '';
            if(uMax) uMax.textContent = (u.max_tokens ?? '-') + '';
            if(uSrcChars) uSrcChars.textContent = (u.source_chars ?? '-') + '';
            if(uSrcEst) uSrcEst.textContent = (u.source_est_tokens ?? '-') + '';
            const uFinish = document.getElementById('u-finish');
            const uModel  = document.getElementById('u-model');
            const uProc   = document.getElementById('u-proc');
            const uRtRem  = document.getElementById('u-rt-rem');
            const uRtLim  = document.getElementById('u-rt-limit');
            const uVersion= document.getElementById('u-version');
            const uBodyMax= document.getElementById('u-body-max');
            if(uVersion) uVersion.textContent = (u.version ?? '-') + '';
            if(uBodyMax) uBodyMax.textContent = (u.body_max_tokens ?? '-') + '';
            if(uFinish) uFinish.textContent = (u.finish_reason ?? '-') + '';
            const h = u.headers || {};
            if(uModel) uModel.textContent = (h.model ?? '-') + '';
            if(uProc) uProc.textContent = (h.processing_ms ?? '-') + '';
            if(uRtRem) uRtRem.textContent = (h.rate_remaining_tokens ?? '-') + '';
            if(uRtLim) uRtLim.textContent = (h.rate_limit_tokens ?? '-') + '';
            usagePanel.hidden = false;
          };
          // a) META
          try {
            try { console.log('[Gen] META -> call'); } catch {}
            const rMeta = await generateViaNetlify(src, 'meta');
            if(rMeta && rMeta.meta){ if(pseo) pseo.value = rMeta.meta; stopShimmer(prepMeta); await typewriter(prepMeta, rMeta.meta); }
            fillUsage(rMeta && rMeta.usage);
            try { console.log('[Gen] META -> ok'); } catch {}
            metaOk = !!(rMeta && rMeta.meta);
            if(metaOk && copyMetaBtn){ copyMetaBtn.removeAttribute('hidden'); }
          } catch(_) { stopShimmer(prepMeta); try { console.warn('[Gen] META -> error', _); } catch {} }

          // b) DESCRIPTION
          try {
            try { console.log('[Gen] DESC -> call'); } catch {}
            const rDesc = await generateViaNetlify(src, 'description');
            if(rDesc && rDesc.description){ if(pdesc) pdesc.value = rDesc.description; stopShimmer(prepDescription); await typewriter(prepDescription, rDesc.description); }
            fillUsage(rDesc && rDesc.usage);
            try { console.log('[Gen] DESC -> ok'); } catch {}
            descOk = !!(rDesc && rDesc.description);
            if(descOk && copyDescBtn){ copyDescBtn.removeAttribute('hidden'); }
          } catch(_) { stopShimmer(prepDescription); try { console.warn('[Gen] DESC -> error', _); } catch {} }

          // c) ARTICLE
          try {
            // Attente initiale pour réduire les 429, puis retry avec backoff si nécessaire
            const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
            // Mini UI: bandeau de tentative avec progression
            const ensureRetryBanner = ()=>{
              let host = prepMarkdown ? prepMarkdown.parentElement : null;
              if(!host) return null;
              let b = host.querySelector('.retry-banner');
              if(!b){
                b = document.createElement('div');
                b.className = 'retry-banner';
                b.innerHTML = '<span id="retry-text">Préparation de la nouvelle tentative…</span> <div class="retry-progress" aria-hidden="true"><span></span></div>';
                host.insertBefore(b, prepMarkdown);
              }
              return b;
            };
            const updateRetryBanner = (banner, attempt, total, remainingMs, totalMs)=>{
              if(!banner) return;
              const label = banner.querySelector('#retry-text');
              const bar = banner.querySelector('.retry-progress > span');
              const secs = Math.ceil(remainingMs/1000);
              if(label){
                if(secs <= 0){ label.textContent = 'Nouvelle tentative en cours...'; }
                else { label.textContent = `Nouvelle tentative dans ${secs}s · tentative ${attempt}/${total}`; }
              }
              if(bar){
                const pct = Math.min(100, Math.max(0, Math.round(((totalMs - remainingMs)/totalMs)*100)));
                bar.style.width = pct + '%';
              }
            };
            const removeRetryBanner = ()=>{
              try{
                const host = prepMarkdown ? prepMarkdown.parentElement : null;
                const b = host ? host.querySelector('.retry-banner') : null;
                if(b && b.parentElement) b.parentElement.removeChild(b);
              }catch{}
            };

            // Considérer 429 et 5xx comme réessayables, ainsi que certaines erreurs réseau
            const isRetriable = (msg)=>{
              if(!msg) return false;
              return /Netlify HTTP (429|500|502|503|504)/.test(msg) || /Failed to fetch|NetworkError|TypeError/i.test(msg);
            };

            let delay = 4000;
            // Afficher une première progression avant l'appel 1
            let banner = ensureRetryBanner();
            {
              const start = Date.now();
              let remaining = delay;
              updateRetryBanner(banner, 1, 3, remaining, delay);
              while(remaining > 0){
                await sleep(250);
                remaining = Math.max(0, delay - (Date.now()-start));
                updateRetryBanner(banner, 1, 3, remaining, delay);
              }
            }
            let success = false;
            for(let attempt=0; attempt<3; attempt++){
              try{
                try { console.log(`[Gen] ARTICLE -> call attempt ${attempt+1}/3`); } catch {}
                const rArt = await generateViaNetlify(src, 'article');
                if(rArt && rArt.article){ stopShimmer(prepMarkdown); await typewriter(prepMarkdown, rArt.article, 3); }
                fillUsage(rArt && rArt.usage);
                success = true;
                try { console.log('[Gen] ARTICLE -> ok'); } catch {}
                removeRetryBanner();
                artOk = !!(rArt && rArt.article);
                if(postGenHint && metaOk && descOk && artOk){ postGenHint.removeAttribute('hidden'); }
                if(artOk){ if(copyMdBtn) copyMdBtn.removeAttribute('hidden'); if(togglePreviewBtn) togglePreviewBtn.removeAttribute('hidden'); }
                break;
              }catch(err){
                const msg = (err && err.message) ? String(err.message) : '';
                if(isRetriable(msg)){
                  try { console.warn('[Gen] ARTICLE -> retryable error:', msg, '| retry after', delay, 'ms'); } catch {}
                  // Progression visuelle pendant l'attente avant la prochaine tentative
                  {
                    const start = Date.now();
                    let remaining = delay;
                    updateRetryBanner(banner, attempt+2, 3, remaining, delay);
                    while(remaining > 0){
                      await sleep(250);
                      remaining = Math.max(0, delay - (Date.now()-start));
                      updateRetryBanner(banner, attempt+2, 3, remaining, delay);
                    }
                  }
                  delay += 3000; // backoff augmenté
                  continue;
                }
                try { console.warn('[Gen] ARTICLE -> error (non-retryable)', err); } catch {}
                throw err;
              }
            }
            if(!success){
              stopShimmer(prepMarkdown);
              try{ prepMarkdown.value = 'Erreur temporaire (quota ou serveur): réessayez dans quelques secondes…'; }catch{}
              try { console.error('[Gen] ARTICLE -> failed after retries'); } catch {}
              removeRetryBanner();
            }
          } catch(_) { stopShimmer(prepMarkdown); }

          if(pmodalGenerated) pmodalGenerated.hidden = false; // sans effet visible si modale fermée
          try { console.log('[Gen] DONE'); } catch {}
          return;
        } catch(e){
          // En cas d'échec global: arrêter shimmer et prévenir
          stopShimmer(prepMeta);
          stopShimmer(prepDescription);
          stopShimmer(prepMarkdown);
          try { alert('Le service de génération est momentanément indisponible. Réessayez plus tard.'); } catch {}
        }
      });
    }

    // Copie Markdown
    if(copyMdBtn && prepMarkdown){
      copyMdBtn.addEventListener('click', async ()=>{
        try{ await navigator.clipboard.writeText(prepMarkdown.value || ''); copyMdBtn.textContent = 'Copié !'; setTimeout(()=> copyMdBtn.textContent='Copier', 1200); }catch{}
      });
    }
    // Boutons copier méta/description
    if(copyMetaBtn && prepMeta){
      copyMetaBtn.addEventListener('click', async ()=>{
        try{ await navigator.clipboard.writeText(prepMeta.value || ''); copyMetaBtn.textContent = 'Copié !'; setTimeout(()=> copyMetaBtn.textContent='Copier', 1200); }catch{}
      });
    }
    if(copyDescBtn && prepDescription){
      copyDescBtn.addEventListener('click', async ()=>{
        try{ await navigator.clipboard.writeText(prepDescription.value || ''); copyDescBtn.textContent = 'Copié !'; setTimeout(()=> copyDescBtn.textContent='Copier', 1200); }catch{}
      });
    }

    // Aperçu Markdown (rendu sécurisé)
    function renderMarkdownPreview(){
      if(!mdPreview) return;
      try{
        const raw = prepMarkdown.value || '';
        const html = window.marked ? marked.parse(raw) : raw;
        const safe = window.DOMPurify ? DOMPurify.sanitize(html) : html;
        mdPreview.innerHTML = safe;
      }catch{ mdPreview.textContent = prepMarkdown.value || ''; }
    }
    if(togglePreviewBtn && prepMarkdown && mdPreview){
      togglePreviewBtn.addEventListener('click', ()=>{
        const showingPreview = !mdPreview.hasAttribute('hidden');
        if(showingPreview){
          // Revenir à l'édition
          mdPreview.setAttribute('hidden','');
          prepMarkdown.removeAttribute('hidden');
          togglePreviewBtn.textContent = 'Aperçu';
        } else {
          // Afficher l'aperçu
          renderMarkdownPreview();
          prepMarkdown.setAttribute('hidden','');
          mdPreview.removeAttribute('hidden');
          togglePreviewBtn.textContent = 'Éditer';
        }
      });
      // Mise à jour live de l'aperçu quand on tape (si visible)
      prepMarkdown.addEventListener('input', ()=>{
        if(!mdPreview.hasAttribute('hidden')) renderMarkdownPreview();
      });
    }

    // Aucune demande de clé côté client: la génération passe uniquement par la fonction Netlify (clé en variable d'environnement)

    // Appel Netlify Functions
    async function generateViaNetlify(sourceText, mode='article'){
      const resp = await fetch('/.netlify/functions/openai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, mode })
      });
      if(!resp.ok){ throw new Error('Netlify HTTP '+resp.status); }
      const data = await resp.json();
      return { meta: data.meta || '', description: data.description || '', article: data.article || data.markdown || '', usage: data.usage || null };
    }

    

    // Fermeture modale progression
    pmodalClose.addEventListener('click', closePModal);
    pmodal.addEventListener('click', (e)=>{ if(e.target === pmodal) closePModal(); });

    // Fermeture
    gmodalClose.addEventListener('click', closeGModal);
    gmodal.addEventListener('click', (e)=>{ if(e.target === gmodal) closeGModal(); });
    document.addEventListener('keydown', (e)=>{ if(!gmodal.hasAttribute('hidden') && e.key==='Escape'){ closeGModal(); }});
    // Ajouter à la liste: ajoute uniquement les résultats marqués "Utile", puis ferme la modale
    gmodalAdd.addEventListener('click', ()=>{
      const ups = gresultsModal.querySelectorAll('li.result-item[data-vote="up"] a.title');
      if(!ups.length) return;
      const seen = new Set(Array.from(gresults.querySelectorAll('a')).map(a=> a.href));
      ups.forEach(a=>{
        if(!a.href || seen.has(a.href)) return;
        seen.add(a.href);
        const originLi = a.closest('li.result-item');
        const snippetEl = originLi ? originLi.querySelector('.snippet') : null;
        const out = document.createElement('li'); out.className='result-item card';
        const meta = document.createElement('div'); meta.className='meta';
        try{ const { hostname } = new URL(a.href); const fav=document.createElement('img'); fav.src = 'https://www.google.com/s2/favicons?domain='+hostname; fav.alt=''; meta.appendChild(fav); const host=document.createElement('span'); host.textContent=hostname; meta.appendChild(host);}catch{}
        out.appendChild(meta);
        const link = document.createElement('a'); link.className='title'; link.href=a.href; link.target='_blank'; link.rel='noopener'; link.textContent=a.textContent || a.href; out.appendChild(link);
        if(snippetEl && snippetEl.textContent){ const s=document.createElement('div'); s.className='snippet'; s.textContent=snippetEl.textContent; out.appendChild(s); }
        // Bouton retirer
        const rmWrap = document.createElement('div'); rmWrap.className='result-actions';
        const rmBtn = document.createElement('button'); rmBtn.type='button'; rmBtn.className='btn-icon'; rmBtn.setAttribute('data-remove','true'); rmBtn.textContent='Retirer';
        rmWrap.appendChild(rmBtn);
        out.appendChild(rmWrap);
        gresults.appendChild(out);
      });
      // Recalcule l'état du bouton Continuer en tenant compte des sites ajoutés
      updateContinue();
      closeGModal();
    });
    // Suppression d'un article de la section résultats (gresults)
    gresults.addEventListener('click', (e)=>{
      const btn = e.target.closest('button.btn-icon[data-remove="true"]');
      if(!btn) return;
      const li = btn.closest('li.result-item');
      if(li && li.parentElement){ li.parentElement.removeChild(li); updateContinue(); }
    });
    // Votes: mini-collapse + progression (cap à 10) et vote réversible (max 10 utiles)
    gresultsModal.addEventListener('click', (e)=>{
      const btn = e.target.closest('button.btn-icon');
      if(!btn) return;
      const li = btn.closest('.result-item');
      if(!li) return;
      const vote = btn.getAttribute('data-vote');
      const parent = btn.parentElement;
      const upBtn = parent.querySelector('button.btn-icon[data-vote="up"]');
      const downBtn = parent.querySelector('button.btn-icon[data-vote="down"]');
      const current = li.getAttribute('data-vote') || 'none';

      function setState(newState){
        // Reset visuals
        upBtn.setAttribute('aria-pressed','false');
        downBtn.setAttribute('aria-pressed','false');
        li.classList.remove('collapse-up','collapse-down','compact');
        // Apply
        if(newState === 'up'){
          upBtn.setAttribute('aria-pressed','true');
          li.classList.add('collapse-up','compact');
        } else if(newState === 'down'){
          downBtn.setAttribute('aria-pressed','true');
          li.classList.add('collapse-down','compact');
        }
        li.setAttribute('data-vote', newState);
      }

      // Transition du compteur selon changement d'état
      if(vote === 'up'){
        // Limiter à 10 éléments marqués utiles
        const currentUps = gresultsModal.querySelectorAll('li.result-item[data-vote="up"]').length;
        if(current !== 'up' && currentUps >= 10){
          showModalError('Limite atteinte: maximum 10 liens utiles.');
          return;
        }
        if(current === 'up') { upCount = Math.max(0, upCount - 1); setState('none'); }
        else if(current === 'down') { upCount = upCount + 1; setState('up'); }
        else /* none */ { upCount = upCount + 1; setState('up'); }
      } else { // vote === 'down'
        if(current === 'down') { setState('none'); }
        else if(current === 'up') { upCount = Math.max(0, upCount - 1); setState('down'); }
        else /* none */ { setState('down'); }
      }
      updateProgress();
    });
})();