/**
 * Assistant IA - Version clean
 * Pure Tailwind + Systèmes unifiés existants
 * Pas de CSS custom
 */

(function() {
  'use strict';
  
  // Configuration
  const LIMITS = {
    MAX_PDF_SIZE: 10 * 1024 * 1024,
    MAX_PDFS: 5,
    MAX_URLS: 20,
    MAX_SEARCH_RESULTS: 10,
  };
  
  const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    INITIAL_DELAY: 2000,
    MAX_DELAY: 10000,
    BACKOFF_MULTIPLIER: 2,
  };
  
  // Parser le délai recommandé par OpenAI dans une erreur 429
  function parseOpenAIRetryDelay(errorMessage) {
    try {
      // Chercher "Please try again in X.XXXs"
      const match = errorMessage.match(/try again in ([0-9.]+)s/);
      if (match && match[1]) {
        const seconds = parseFloat(match[1]);
        return Math.ceil(seconds * 1000) + 500; // Ajouter 500ms de marge
      }
    } catch {}
    return null;
  }
  
  // Afficher un message à l'utilisateur dans l'interface
  function showUserFeedback(message, type = 'info') {
    if ($.genStatusText) {
      const emoji = type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️';
      $.genStatusText.textContent = `${emoji} ${message}`;
    }
  }
  
  // Fonction de retry universelle avec backoff exponentiel et gestion spéciale 429
  async function retryWithBackoff(fn, context, maxRetries = RETRY_CONFIG.MAX_RETRIES) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Retry] Tentative ${attempt}/${maxRetries} pour ${context}`);
        const result = await fn();
        if (attempt > 1) {
          console.log(`[Retry] ✅ Succès à la tentative ${attempt} pour ${context}`);
          showUserFeedback(`Contenu généré avec succès (tentative ${attempt})`, 'info');
        }
        return result;
      } catch (err) {
        lastError = err;
        console.warn(`[Retry] ⚠️ Échec tentative ${attempt}/${maxRetries} pour ${context}:`, err.message);
        
        if (attempt < maxRetries) {
          let delay;
          let userMessage;
          
          // Détection spécifique erreur 429 (Rate Limit OpenAI)
          if (err.message && err.message.includes('429')) {
            const openAIDelay = parseOpenAIRetryDelay(err.message);
            if (openAIDelay) {
              delay = openAIDelay;
              const seconds = Math.ceil(delay / 1000);
              userMessage = `Limite OpenAI atteinte, nouvelle tentative dans ${seconds}s...`;
              console.log(`[Retry] 🚦 Rate limit OpenAI détecté, attente recommandée: ${delay}ms`);
            } else {
              delay = Math.min(
                RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1),
                RETRY_CONFIG.MAX_DELAY
              );
              userMessage = `Limite API atteinte, réessai dans ${Math.ceil(delay/1000)}s...`;
            }
          }
          // Détection timeout
          else if (err.message && (err.message.includes('timeout') || err.message.includes('timed out'))) {
            delay = 3000; // Court délai pour timeout
            userMessage = `Timeout détecté, optimisation et réessai...`;
            console.log(`[Retry] ⏱️ Timeout détecté, réessai avec délai court`);
          }
          // Backoff normal pour autres erreurs
          else {
            delay = Math.min(
              RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1),
              RETRY_CONFIG.MAX_DELAY
            );
            userMessage = `Erreur réseau, réessai dans ${Math.ceil(delay/1000)}s...`;
          }
          
          showUserFeedback(userMessage, 'warning');
          console.log(`[Retry] ⏳ Attente de ${delay}ms avant nouvelle tentative...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Dernière tentative échouée
          if (err.message && err.message.includes('429')) {
            showUserFeedback('Limite API atteinte, utilisation du contenu de secours', 'warning');
          } else if (err.message && (err.message.includes('timeout') || err.message.includes('timed out'))) {
            showUserFeedback('Génération trop longue, utilisation du contenu de secours', 'warning');
          } else {
            showUserFeedback('Échec de génération, utilisation du contenu de secours', 'error');
          }
        }
      }
    }
    console.error(`[Retry] ❌ Échec définitif après ${maxRetries} tentatives pour ${context}:`, lastError);
    throw lastError;
  }
  
  // Helper pour attendre
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  // État
  const state = {
    currentStep: 1,
    pdfs: [],
    urls: [],
    notes: '',
    searchResults: [],
    aggregated: '',
    upCount: 0,
    isProcessing: false,
  };
  
  // DOM
  const $ = {
    step1Circle: document.getElementById('step1-circle'),
    step1Label: document.getElementById('step1-label'),
    step2Circle: document.getElementById('step2-circle'),
    step2Label: document.getElementById('step2-label'),
    divider1: document.getElementById('divider1'),
    step1Content: document.getElementById('step1-content'),
    step2Content: document.getElementById('step2-content'),
    btnNextStep: document.getElementById('btn-next-step'),
    btnPrevStep: document.getElementById('btn-prev-step'),
    btnNewGeneration: document.getElementById('btn-new-generation'),
    sourceCount: document.getElementById('source-count'),
    pdfInput: document.getElementById('pdf-input'),
    pdfDrop: document.getElementById('pdf-drop'),
    pdfList: document.getElementById('pdf-list'),
    urlInput: document.getElementById('url-input'),
    addUrlBtn: document.getElementById('add-url'),
    urlList: document.getElementById('url-list'),
    notes: document.getElementById('notes'),
    notesCount: document.getElementById('notes-count'),
    gq: document.getElementById('gq'),
    gsearch: document.getElementById('gsearch'),
    gresults: document.getElementById('gresults'),
    gresultsModal: document.getElementById('gresults-modal'),
    gmodalAdd: document.getElementById('gmodal-add'),
    gmodalError: document.getElementById('gmodal-error'),
    gprogressBar: document.getElementById('gprogress-bar'),
    gprogressLabel: document.getElementById('gprogress-label'),
    genProgressContainer: document.getElementById('gen-progress-container'),
    genStatusText: document.getElementById('gen-status-text'),
    genPercentage: document.getElementById('gen-percentage'),
    genProgressBar: document.getElementById('gen-progress-bar'),
    resultsContainer: document.getElementById('results-container'),
    prepMeta: document.getElementById('prep-meta'),
    prepDescription: document.getElementById('prep-description'),
    prepMarkdown: document.getElementById('prep-markdown'),
    metaChars: document.getElementById('meta-chars'),
    descChars: document.getElementById('desc-chars'),
    articleChars: document.getElementById('article-chars'),
    copyMetaBtn: document.getElementById('copy-meta'),
    copyDescBtn: document.getElementById('copy-desc'),
    copyMdBtn: document.getElementById('copy-md'),
    togglePreviewBtn: document.getElementById('toggle-preview'),
    mdPreview: document.getElementById('md-preview'),
  };
  
  // PDF.js config
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  
  // Utilitaires
  function showToast(msg, duration = 3000) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'fixed bottom-4 right-4 bg-[var(--danger-lighter)] text-[var(--danger)] border border-[var(--danger-light)] px-4 py-3 rounded-lg shadow-lg max-w-sm z-50 transition-opacity';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.style.opacity = '0', duration);
  }
  
  function updateSourceCount() {
    const count = state.pdfs.length + state.urls.length + (state.notes.trim() ? 1 : 0) + state.searchResults.length;
    $.sourceCount.textContent = count === 0 ? '0 source' : count === 1 ? '1 source' : `${count} sources`;
    $.btnNextStep.disabled = count === 0;
  }
  
  // Navigation
  function goToStep(step) {
    state.currentStep = step;
    
    if (step === 1) {
      $.step1Circle.className = 'w-10 h-10 rounded-full flex items-center justify-center font-semibold border-2 border-[var(--primary)] bg-[var(--primary)] text-[var(--text-on-primary)] transition-all';
      $.step1Label.className = 'text-sm font-medium text-[var(--primary)]';
      $.step2Circle.className = 'w-10 h-10 rounded-full flex items-center justify-center font-semibold border-2 border-[var(--border-medium)] bg-[var(--surface-base)] text-[var(--text-tertiary)] transition-all';
      $.step2Label.className = 'text-sm font-medium text-[var(--text-tertiary)]';
      $.divider1.className = 'w-12 h-0.5 bg-[var(--border-medium)] transition-colors';
      $.step1Content.classList.remove('hidden');
      $.step2Content.classList.add('hidden');
    } else {
      $.step1Circle.className = 'w-10 h-10 rounded-full flex items-center justify-center font-semibold border-2 border-[var(--primary)] bg-[var(--primary)] text-[var(--text-on-primary)] transition-all';
      $.step1Label.className = 'text-sm font-medium text-[var(--primary)]';
      $.step2Circle.className = 'w-10 h-10 rounded-full flex items-center justify-center font-semibold border-2 border-[var(--primary)] bg-[var(--primary)] text-[var(--text-on-primary)] transition-all';
      $.step2Label.className = 'text-sm font-medium text-[var(--primary)]';
      $.divider1.className = 'w-12 h-0.5 bg-[var(--primary)] transition-colors';
      $.step1Content.classList.add('hidden');
      $.step2Content.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  
  $.btnNextStep.addEventListener('click', async () => {
    if (state.isProcessing) return;
    goToStep(2);
    await startGeneration();
  });
  
  $.btnPrevStep.addEventListener('click', () => goToStep(1));
  
  $.btnNewGeneration.addEventListener('click', () => {
    $.prepMeta.value = '';
    $.prepDescription.value = '';
    $.prepMarkdown.value = '';
    $.mdPreview.classList.add('hidden');
    $.prepMarkdown.classList.remove('hidden');
    goToStep(1);
  });
  
  // PDFs
  function renderPdfs() {
    $.pdfList.innerHTML = '';
    state.pdfs.forEach((file, i) => {
      const li = document.createElement('li');
      li.className = 'flex items-center justify-between gap-2 p-2 border border-[var(--border-light)] rounded-lg bg-[var(--surface-elevated)]';
      li.innerHTML = `
        <span class="flex-1 truncate text-sm">${file.name} (${Math.round(file.size/1024)} Ko)</span>
        <button class="btn-secondary btn-small" data-idx="${i}">Retirer</button>
      `;
      li.querySelector('button').onclick = () => {
        state.pdfs.splice(i, 1);
        renderPdfs();
        updateSourceCount();
      };
      $.pdfList.appendChild(li);
    });
    updateSourceCount();
  }
  
  function addPdfs(files) {
    const pdfs = files.filter(f => f.type === 'application/pdf');
    if (pdfs.length === 0) return showToast('❌ Aucun PDF valide');
    if (state.pdfs.length + pdfs.length > LIMITS.MAX_PDFS) return showToast(`⚠️ Maximum ${LIMITS.MAX_PDFS} PDFs`);
    
    const names = new Set(state.pdfs.map(f => f.name));
    const toAdd = pdfs.filter(p => {
      if (names.has(p.name)) { showToast(`⚠️ "${p.name}" déjà ajouté`); return false; }
      if (p.size > LIMITS.MAX_PDF_SIZE) { showToast(`❌ "${p.name}" trop volumineux`); return false; }
      return true;
    });
    
    if (toAdd.length > 0) {
      state.pdfs.push(...toAdd);
      renderPdfs();
    }
  }
  
  $.pdfInput.onchange = e => { addPdfs([...e.target.files]); $.pdfInput.value = ''; };
  $.pdfDrop.onclick = () => $.pdfInput.click();
  $.pdfDrop.ondragover = e => { e.preventDefault(); $.pdfDrop.classList.add('bg-[var(--primary-alpha-30)]'); };
  $.pdfDrop.ondragleave = e => { e.preventDefault(); $.pdfDrop.classList.remove('bg-[var(--primary-alpha-30)]'); };
  $.pdfDrop.ondrop = e => {
    e.preventDefault();
    $.pdfDrop.classList.remove('bg-[var(--primary-alpha-30)]');
    addPdfs([...e.dataTransfer.files]);
  };
  
  // URLs
  function renderUrls() {
    $.urlList.innerHTML = '';
    state.urls.forEach((url, i) => {
      const li = document.createElement('li');
      li.className = 'flex items-center justify-between gap-2 p-2 border border-[var(--border-light)] rounded-lg bg-[var(--surface-elevated)]';
      li.innerHTML = `
        <a href="${url}" target="_blank" class="flex items-center gap-1.5 flex-1 truncate text-sm text-[var(--primary)] hover:underline">
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          ${url}
        </a>
        <button class="btn-secondary btn-small" data-idx="${i}">Retirer</button>
      `;
      li.querySelector('button').onclick = () => {
        state.urls.splice(i, 1);
        renderUrls();
        updateSourceCount();
      };
      $.urlList.appendChild(li);
    });
    updateSourceCount();
  }
  
  function addUrl() {
    const url = $.urlInput.value.trim();
    if (!url) return;
    try { new URL(url); } catch { return showToast('❌ URL invalide'); }
    if (state.urls.includes(url)) return showToast('⚠️ URL déjà ajoutée');
    if (state.urls.length >= LIMITS.MAX_URLS) return showToast(`⚠️ Maximum ${LIMITS.MAX_URLS} URLs`);
    state.urls.push(url);
    $.urlInput.value = '';
    renderUrls();
  }
  
  $.addUrlBtn.onclick = addUrl;
  $.urlInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } };
  
  // Notes
  $.notes.oninput = () => {
    state.notes = $.notes.value;
    $.notesCount.textContent = `${state.notes.length} caractères`;
    updateSourceCount();
  };
  
  // Recherche
  async function doSearch() {
    const query = $.gq.value.trim();
    if (!query) return;
    
    $.gresultsModal.innerHTML = '<li class="p-3 text-center"><div class="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto"></div></li>';
    ModalHelper.open('gmodal', { dismissible: true });
    
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=fr-fr`;
      const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`;
      const res = await fetch(proxied);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const results = [...doc.querySelectorAll('.result')].slice(0, 20);
      
      $.gresultsModal.innerHTML = '';
      results.forEach(r => {
        const a = r.querySelector('a.result__a');
        if (!a) return;
        let href = a.href;
        try {
          const u = new URL(href, 'https://duckduckgo.com');
          const uddg = u.searchParams.get('uddg');
          if (uddg) href = decodeURIComponent(uddg);
        } catch {}
        
        const title = a.textContent?.trim() || href;
        const snippet = r.querySelector('.result__snippet')?.textContent?.trim() || '';
        
        const li = document.createElement('li');
        li.className = 'flex flex-col gap-2 p-3 border border-[var(--border-light)] rounded-xl bg-[var(--surface-elevated)] hover:shadow-sm transition-all';
        li.innerHTML = `
          <a href="${href}" target="_blank" class="flex items-start gap-1.5 font-bold text-[var(--text-primary)] hover:underline">
            <svg class="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            <span>${title}</span>
          </a>
          ${snippet ? `<div class="text-sm text-[var(--text-secondary)] ml-5">${snippet}</div>` : ''}
          <div class="flex gap-2 ml-5">
            <button class="px-3 py-1 text-xs border border-[var(--border-medium)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors" data-vote="up">👍 Utile</button>
            <button class="px-3 py-1 text-xs border border-[var(--border-medium)] rounded-lg hover:bg-[var(--surface-hover)]" data-vote="down">👎 Pas utile</button>
          </div>
        `;
        $.gresultsModal.appendChild(li);
      });
    } catch {
      $.gresultsModal.innerHTML = '<li class="p-3 text-center text-sm text-[var(--text-tertiary)]">Recherche indisponible (CORS)</li>';
    }
  }
  
  $.gsearch.onclick = doSearch;
  $.gq.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
  
  // Votes
  $.gresultsModal.onclick = e => {
    const btn = e.target.closest('button[data-vote]');
    if (!btn) return;
    const li = btn.closest('li');
    const vote = btn.dataset.vote;
    const current = li.dataset.vote || 'none';
    
    if (vote === 'up') {
      if (current === 'up') {
        li.dataset.vote = 'none';
        li.classList.remove('bg-[var(--primary-lighter)]', 'border-[var(--primary-light)]', 'ring-2', 'ring-[var(--primary-light)]');
        state.upCount--;
      } else {
        const ups = $.gresultsModal.querySelectorAll('li[data-vote="up"]').length;
        if (ups >= 10 && current !== 'up') return showToast('⚠️ Maximum 10 liens');
        li.dataset.vote = 'up';
        li.classList.add('bg-[var(--primary-lighter)]', 'border-[var(--primary-light)]', 'ring-2', 'ring-[var(--primary-light)]');
        li.classList.remove('bg-[var(--danger-lighter)]', 'border-[var(--danger-light)]', 'ring-[var(--danger-light)]');
        if (current !== 'up') state.upCount++;
      }
    } else {
      if (current === 'down') {
        li.dataset.vote = 'none';
        li.classList.remove('bg-[var(--danger-lighter)]', 'border-[var(--danger-light)]', 'ring-2', 'ring-[var(--danger-light)]');
      } else {
        li.dataset.vote = 'down';
        li.classList.add('bg-[var(--danger-lighter)]', 'border-[var(--danger-light)]', 'ring-2', 'ring-[var(--danger-light)]');
        li.classList.remove('bg-[var(--primary-lighter)]', 'border-[var(--primary-light)]', 'ring-2', 'ring-[var(--primary-light)]');
        if (current === 'up') state.upCount--;
      }
    }
    
    const capped = Math.min(state.upCount, 10);
    $.gprogressBar.style.width = `${capped * 10}%`;
    $.gprogressLabel.textContent = `${capped} utiles (max 10)`;
  };
  
  $.gmodalAdd.onclick = () => {
    const ups = $.gresultsModal.querySelectorAll('li[data-vote="up"] a');
    ups.forEach(a => {
      const title = a.querySelector('span')?.textContent || a.textContent;
      if (!state.searchResults.find(r => r.url === a.href)) {
        state.searchResults.push({ url: a.href, title });
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between gap-2 p-2 border border-[var(--border-light)] rounded-lg bg-[var(--surface-elevated)]';
        li.innerHTML = `
          <a href="${a.href}" target="_blank" class="flex items-center gap-1.5 flex-1 truncate text-sm text-[var(--primary)] hover:underline">
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            ${title}
          </a>
          <button class="btn-secondary btn-small">Retirer</button>
        `;
        li.querySelector('button').onclick = () => {
          state.searchResults = state.searchResults.filter(r => r.url !== a.href);
          li.remove();
          updateSourceCount();
        };
        $.gresults.appendChild(li);
      }
    });
    updateSourceCount();
    ModalHelper.close('gmodal');
  };
  
  // Extraction & Génération
  async function extractPdf(file) {
    console.log(`[PDF] 📄 Début extraction "${file.name}" (${Math.round(file.size/1024)} Ko)`);
    
    return retryWithBackoff(async () => {
      try {
        const buf = await file.arrayBuffer();
        console.log(`[PDF] 📦 Buffer chargé : ${buf.byteLength} octets`);
        
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        const totalPages = doc.numPages;
        const maxPages = Math.min(totalPages, 30);
        console.log(`[PDF] 📖 Document ouvert : ${totalPages} pages (extraction max: ${maxPages})`);
        
        let text = `\n--- PDF: ${file.name} (${totalPages} pages) ---\n`;
        let extractedChars = 0;
        
        for (let i = 1; i <= maxPages; i++) {
          try {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(it => it.str).join(' ');
            text += pageText + '\n';
            extractedChars += pageText.length;
            
            if (i % 5 === 0 || i === maxPages) {
              console.log(`[PDF] 📄 Pages ${i}/${maxPages} extraites (${extractedChars} caractères)`);
            }
          } catch (pageErr) {
            console.warn(`[PDF] ⚠️ Erreur page ${i}, on continue:`, pageErr.message);
            text += `[Page ${i}: erreur d'extraction]\n`;
          }
        }
        
        console.log(`[PDF] ✅ Extraction terminée : ${extractedChars} caractères extraits`);
        return text;
      } catch (err) {
        console.error(`[PDF] ❌ Erreur extraction:`, {
          file: file.name,
          size: file.size,
          error: err.message,
          stack: err.stack
        });
        throw err;
      }
    }, `extraction PDF "${file.name}"`, 2).catch(err => {
      console.error(`[PDF] 💥 Échec définitif extraction "${file.name}", retour texte minimal`);
      return `\n--- PDF: ${file.name} ---\n[Erreur d'extraction après plusieurs tentatives]\n`;
    });
  }
  
  async function fetchUrl(url) {
    console.log(`[URL] 🔗 Début récupération : ${url}`);
    
    const proxies = [
      { name: 'Jina.ai', buildUrl: (u, protocol) => `https://r.jina.ai/${protocol}${u.hostname}${u.pathname}${u.search}${u.hash}` },
      { name: 'AllOrigins', buildUrl: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u.href)}` },
      { name: 'Direct', buildUrl: (u) => u.href }
    ];
    
    return retryWithBackoff(async () => {
      const u = new URL(url);
      const protocol = u.protocol === 'https:' ? 'https://' : 'http://';
      
      for (let i = 0; i < proxies.length; i++) {
        const proxy = proxies[i];
        try {
          const proxiedUrl = proxy.buildUrl(u, protocol);
          console.log(`[URL] 🌐 Tentative proxy ${proxy.name} (${i+1}/${proxies.length})`);
          
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          
          const res = await fetch(proxiedUrl, { 
            headers: { 'Accept': 'text/plain' },
            signal: controller.signal
          });
          clearTimeout(timeout);
          
          if (!res.ok) {
            console.warn(`[URL] ⚠️ ${proxy.name} HTTP ${res.status}`);
            if (i < proxies.length - 1) continue;
            throw new Error(`HTTP ${res.status}`);
          }
          
          const text = await res.text();
          console.log(`[URL] ✅ Contenu récupéré via ${proxy.name} : ${text.length} caractères`);
          return `\n--- URL: ${url} (via ${proxy.name}) ---\n${text}\n`;
        } catch (err) {
          console.warn(`[URL] ⚠️ Échec ${proxy.name}:`, err.message);
          if (i === proxies.length - 1) throw err;
        }
      }
    }, `récupération URL "${url}"`, 2).catch(err => {
      console.error(`[URL] 💥 Échec définitif récupération "${url}" après tous les proxies`);
      return `\n--- URL: ${url} ---\n[Contenu non disponible après plusieurs tentatives]\n`;
    });
  }
  
  async function generateContent(text, mode, attemptNumber = 1) {
    const startTime = Date.now();
    
    // Récupérer le contexte de ville et thème
    const activeCity = window.activeCity || (window.CityManager?.getActiveCity?.()) || 'global';
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    
    console.log(`[API] 📡 Appel Netlify Function pour mode "${mode}" (tentative ${attemptNumber})`);
    console.log(`[API] 📍 Contexte: ville=${activeCity}, thème=${theme}`);
    console.log(`[API] 📊 Taille initiale : ${text.length} caractères (${Math.round(text.length/1024)} Ko, ~${Math.ceil(text.length/4)} tokens)`);
    
    // TOUJOURS limiter la taille pour éviter timeout (pas seulement après échec)
    let contentToSend = text;
    let maxChars;
    
    // Limites adaptées par mode et tentative
    if (mode === 'article') {
      // Article : limite agressive pour éviter timeout de 30s
      maxChars = attemptNumber === 1 ? 40000 : 30000;  // Réduit encore plus si retry
    } else if (mode === 'description') {
      maxChars = 20000;
    } else {
      maxChars = 15000;  // meta
    }
    
    if (text.length > maxChars) {
      contentToSend = text.substring(0, maxChars) + '\n\n[Contenu tronqué pour optimisation]';
      console.log(`[API] ✂️ Contenu réduit : ${text.length} → ${contentToSend.length} chars (~${Math.ceil(contentToSend.length/4)} tokens)`);
      if (attemptNumber > 1) {
        showUserFeedback(`Optimisation maximale pour tentative ${attemptNumber}...`, 'info');
      }
    } else {
      console.log(`[API] ✅ Taille acceptable : ${contentToSend.length} chars < ${maxChars} limit`);
    }
    
    return retryWithBackoff(async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout
        
        console.log(`[API] 🚀 Envoi requête pour mode "${mode}" avec contexte...`);
        const res = await fetch('/.netlify/functions/openai-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: contentToSend, 
            mode,
            context: {
              city: activeCity,
              theme: theme
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        
        const duration = Date.now() - startTime;
        console.log(`[API] 📥 Réponse HTTP ${res.status} ${res.statusText} (${duration}ms)`);
        
        if (!res.ok) {
          let errorText;
          try {
            errorText = await res.text();
          } catch {
            errorText = 'Impossible de lire le corps de l\'erreur';
          }
          console.error(`[API] ❌ Erreur HTTP ${res.status}:`, {
            status: res.status,
            statusText: res.statusText,
            error: errorText,
            duration: duration
          });
          throw new Error(`HTTP ${res.status}: ${errorText}`);
        }
        
        const data = await res.json();
        console.log(`[API] ✅ Données reçues pour mode "${mode}" (${duration}ms)`);
        
        // Logs détaillés pour diagnostic timeout
        if (data.usage) {
          console.log(`[API] 📊 Usage OpenAI:`, {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
            source_chars: data.usage.source_chars,
            duration_ms: duration,
            tokens_per_second: data.usage.completion_tokens ? Math.round(data.usage.completion_tokens / (duration / 1000)) : 0
          });
        }
        
        console.log(`[API] 📦 Résultat:`, {
          hasData: !!data,
          keys: Object.keys(data),
          contentLength: JSON.stringify(data).length,
          duration_category: duration < 10000 ? 'Rapide' : duration < 20000 ? 'Normal' : duration < 30000 ? 'Lent' : 'TIMEOUT RISK'
        });
        return data;
      } catch (err) {
        const duration = Date.now() - startTime;
        console.error(`[API] ❌ Erreur lors de l'appel API pour mode "${mode}" (${duration}ms):`, {
          message: err.message,
          stack: err.stack,
          name: err.name,
          type: err.constructor.name
        });
        throw err;
      }
    }, `génération IA mode "${mode}"`, 3);
  }
  
  async function startGeneration() {
    console.log('[Generation] 🚀 Démarrage de la génération');
    state.isProcessing = true;
    $.genProgressContainer.classList.remove('hidden');
    $.resultsContainer.classList.add('hidden');
    
    // Extraction
    console.log('[Generation] 📁 Phase 1/4 : Extraction des sources');
    $.genStatusText.textContent = '📁 Extraction des sources (notes, PDFs, URLs)...';
    $.genPercentage.textContent = '0%';
    $.genProgressBar.style.width = '0%';
    
    let text = '';
    let sourceCount = 0;
    
    if (state.notes) {
      console.log('[Generation] 📝 Ajout des notes (' + state.notes.length + ' caractères)');
      text += `\n--- NOTES ---\n${state.notes}\n`;
      sourceCount++;
    }
    
    for (const pdf of state.pdfs) {
      console.log('[Generation] 📄 Extraction PDF : ' + pdf.name);
      $.genStatusText.textContent = `📄 Extraction du PDF "${pdf.name}"...`;
      try {
        text += await extractPdf(pdf);
        sourceCount++;
        console.log('[Generation] ✅ PDF extrait : ' + pdf.name);
      } catch (err) {
        console.error('[Generation] ❌ Erreur extraction PDF "' + pdf.name + '":', err);
      }
    }
    
    const allUrls = [...state.urls, ...state.searchResults.map(r => r.url)];
    for (let i = 0; i < allUrls.length; i++) {
      const url = allUrls[i];
      console.log('[Generation] 🔗 Récupération URL (' + (i+1) + '/' + allUrls.length + ') : ' + url);
      $.genStatusText.textContent = `🔗 Récupération URL ${i+1}/${allUrls.length}...`;
      try {
        text += await fetchUrl(url);
        sourceCount++;
        console.log('[Generation] ✅ URL récupérée : ' + url);
      } catch (err) {
        console.error('[Generation] ❌ Erreur récupération URL "' + url + '":', err);
      }
    }
    
    console.log('[Generation] ✅ Extraction terminée : ' + sourceCount + ' sources (' + text.length + ' caractères)');
    $.genPercentage.textContent = '25%';
    $.genProgressBar.style.width = '25%';
    
    // Méta
    console.log('[Generation] 🎯 Phase 2/4 : Génération méta description SEO');
    $.genStatusText.textContent = '🎯 Génération de la méta description SEO (160 caractères)...';
    let metaAttempts = 0;
    try {
      const meta = await generateContent(text, 'meta', ++metaAttempts);
      const metaText = meta.meta || meta.description || '';
      $.prepMeta.value = metaText;
      $.metaChars.textContent = metaText.length;
      console.log('[Generation] ✅ Méta générée : ' + metaText.length + ' caractères');
      if (metaText.length === 0) {
        console.warn('[Generation] ⚠️ Méta vide, génération d\'un fallback');
        $.prepMeta.value = 'Contenu généré par IA à partir de vos sources.';
      }
    } catch (err) {
      const errorType = err.message.includes('429') ? 'Limite API' : 
                         err.message.includes('timeout') ? 'Timeout' : 'Erreur réseau';
      console.error('[Generation] ❌ Erreur génération méta:', {
        error: err.message,
        stack: err.stack,
        type: err.constructor.name,
        errorType
      });
      console.log('[Generation] 🔄 Application du fallback pour la méta');
      showUserFeedback(`${errorType} - Méta générée en mode secours`, 'warning');
      $.prepMeta.value = 'Contenu généré automatiquement à partir de vos sources.';
      $.metaChars.textContent = $.prepMeta.value.length;
    }
    $.genPercentage.textContent = '50%';
    $.genProgressBar.style.width = '50%';
    console.log('[Generation] ✅ Phase 2/4 terminée (méta)');
    
    // Description
    console.log('[Generation] 📝 Phase 3/4 : Génération description courte');
    $.genStatusText.textContent = '📝 Génération de la description courte (450 caractères)...';
    let descAttempts = 0;
    try {
      const desc = await generateContent(text, 'description', ++descAttempts);
      const descText = desc.description || desc.text || '';
      $.prepDescription.value = descText;
      $.descChars.textContent = descText.length;
      console.log('[Generation] ✅ Description générée : ' + descText.length + ' caractères');
      if (descText.length === 0) {
        console.warn('[Generation] ⚠️ Description vide, génération d\'un fallback');
        $.prepDescription.value = 'Description automatique basée sur l\'analyse de vos sources (PDFs, URLs et notes).';
      }
    } catch (err) {
      const errorType = err.message.includes('429') ? 'Limite API' : 
                         err.message.includes('timeout') ? 'Timeout' : 'Erreur réseau';
      console.error('[Generation] ❌ Erreur génération description:', {
        error: err.message,
        stack: err.stack,
        type: err.constructor.name,
        errorType
      });
      console.log('[Generation] 🔄 Application du fallback pour la description');
      showUserFeedback(`${errorType} - Description générée en mode secours`, 'warning');
      $.prepDescription.value = 'Description automatique basée sur l\'analyse de vos sources.';
      $.descChars.textContent = $.prepDescription.value.length;
    }
    $.genPercentage.textContent = '75%';
    $.genProgressBar.style.width = '75%';
    console.log('[Generation] ✅ Phase 3/4 terminée (description)');
    
    // Article
    console.log('[Generation] 📚 Phase 4/4 : Génération article Markdown complet');
    $.genStatusText.textContent = '📚 Génération de l\'article complet en Markdown...';
    let articleAttempts = 0;
    try {
      const article = await generateContent(text, 'article', ++articleAttempts);
      const articleText = article.article || article.markdown || article.content || '';
      $.prepMarkdown.value = articleText;
      $.articleChars.textContent = articleText.length;
      console.log('[Generation] ✅ Article généré : ' + articleText.length + ' caractères');
      if (articleText.length === 0) {
        console.warn('[Generation] ⚠️ Article vide, génération d\'un fallback');
        $.prepMarkdown.value = '# Article généré automatiquement\n\nBasé sur l\'analyse de vos sources.';
      }
    } catch (err) {
      const errorType = err.message.includes('429') ? 'Limite API OpenAI atteinte' : 
                         err.message.includes('timeout') ? 'Génération trop longue (timeout)' : 'Erreur de connexion';
      console.error('[Generation] ❌ Erreur génération article:', {
        error: err.message,
        stack: err.stack,
        type: err.constructor.name,
        errorType
      });
      console.log('[Generation] 🔄 Application du fallback pour l\'article');
      showUserFeedback(`${errorType} - Article généré en mode secours`, 'warning');
      
      // Fallback plus détaillé avec info sur l'erreur
      $.prepMarkdown.value = '# Article généré automatiquement\n\n' +
        `> ⚠️ **Note**: ${errorType}. L\'article ci-dessous est généré en mode secours.\n\n` +
        'Contenu basé sur l\'analyse de vos sources (PDFs, URLs, notes).\n\n' +
        '## Sources analysées\n\n' +
        `- ${state.pdfs.length} PDF(s)\n` +
        `- ${state.urls.length + state.searchResults.length} URL(s)\n` +
        (state.notes ? '- Notes personnelles\n' : '') +
        '\n## Que faire ?\n\n' +
        '- **Si limite API**: Attendez quelques minutes et régénérez\n' +
        '- **Si timeout**: Réduisez le nombre de sources ou la taille des PDFs\n' +
        '- **Si erreur réseau**: Vérifiez votre connexion et réessayez\n';
      $.articleChars.textContent = $.prepMarkdown.value.length;
    }
    
    $.genPercentage.textContent = '100%';
    $.genProgressBar.style.width = '100%';
    console.log('[Generation] ✅ Phase 4/4 terminée (article)');
    
    // Vérification finale
    const hasAnyContent = $.prepMeta.value.length > 0 || $.prepDescription.value.length > 0 || $.prepMarkdown.value.length > 0;
    if (!hasAnyContent) {
      console.error('[Generation] 💥 CRITIQUE : Aucun contenu généré, fallback ultime');
      $.prepMeta.value = 'Génération de contenu';
      $.prepDescription.value = 'Contenu généré à partir de vos sources.';
      $.prepMarkdown.value = '# Contenu généré\n\nAnalyse de vos sources en cours.';
    }
    
    // Déterminer si tout a réussi ou si on a des fallbacks
    const hasRealMeta = !$.prepMeta.value.includes('généré automatiquement');
    const hasRealDesc = !$.prepDescription.value.includes('Description automatique');
    const hasRealArticle = !$.prepMarkdown.value.includes('mode secours');
    const allSuccess = hasRealMeta && hasRealDesc && hasRealArticle;
    
    if (allSuccess) {
      console.log('[Generation] ✨ Génération terminée avec succès complet');
      showUserFeedback('✅ Tous les contenus générés avec succès', 'info');
    } else {
      console.warn('[Generation] ⚠️ Génération terminée avec fallbacks:', {
        meta: hasRealMeta ? 'OK' : 'Fallback',
        description: hasRealDesc ? 'OK' : 'Fallback',
        article: hasRealArticle ? 'OK' : 'Fallback'
      });
      const fallbackCount = [hasRealMeta, hasRealDesc, hasRealArticle].filter(v => !v).length;
      showUserFeedback(`⚠️ Génération terminée (${fallbackCount} contenu(s) en mode secours)`, 'warning');
    }
    
    console.log('[Generation] 📊 Résumé final:', {
      meta: $.prepMeta.value.length + ' caractères' + (hasRealMeta ? '' : ' [fallback]'),
      description: $.prepDescription.value.length + ' caractères' + (hasRealDesc ? '' : ' [fallback]'),
      article: $.prepMarkdown.value.length + ' caractères' + (hasRealArticle ? '' : ' [fallback]'),
      totalSources: sourceCount,
      successRate: allSuccess ? '100%' : `${Math.round(([hasRealMeta, hasRealDesc, hasRealArticle].filter(v => v).length / 3) * 100)}%`
    });
    
    setTimeout(() => {
      $.genProgressContainer.classList.add('hidden');
      $.resultsContainer.classList.remove('hidden');
      state.isProcessing = false;
      console.log('[Generation] 🎉 Interface mise à jour, prêt pour l\'utilisateur');
    }, 500);
  }
  
  // Copie
  $.copyMetaBtn.onclick = async () => {
    await navigator.clipboard.writeText($.prepMeta.value);
    $.copyMetaBtn.textContent = 'Copié !';
    setTimeout(() => $.copyMetaBtn.textContent = 'Copier', 1200);
  };
  
  $.copyDescBtn.onclick = async () => {
    await navigator.clipboard.writeText($.prepDescription.value);
    $.copyDescBtn.textContent = 'Copié !';
    setTimeout(() => $.copyDescBtn.textContent = 'Copier', 1200);
  };
  
  $.copyMdBtn.onclick = async () => {
    await navigator.clipboard.writeText($.prepMarkdown.value);
    $.copyMdBtn.textContent = 'Copié !';
    setTimeout(() => $.copyMdBtn.textContent = 'Copier', 1200);
  };
  
  // Aperçu avec styles markdown complets
  $.togglePreviewBtn.onclick = () => {
    if ($.mdPreview.classList.contains('hidden')) {
      console.log('[Preview] 👁️ Génération de l\'aperçu HTML');
      
      // Parser le markdown
      const html = marked.parse($.prepMarkdown.value);
      const sanitized = DOMPurify.sanitize(html);
      
      // Wrapper avec l'ID pour les styles CSS
      $.mdPreview.innerHTML = `<div id="project-markdown-content">${sanitized}</div>`;
      
      // Ajouter les icônes aux liens externes
      const contentDiv = $.mdPreview.querySelector('#project-markdown-content');
      if (contentDiv) {
        const links = contentDiv.querySelectorAll('a[href^="http"]');
        links.forEach(link => {
          // Icône SVG externe inline
          const icon = document.createElement('svg');
          icon.className = 'external-icon inline-block';
          icon.setAttribute('width', '12');
          icon.setAttribute('height', '12');
          icon.setAttribute('fill', 'none');
          icon.setAttribute('stroke', 'currentColor');
          icon.setAttribute('viewBox', '0 0 24 24');
          icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>';
          link.appendChild(icon);
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
        });
      }
      
      $.mdPreview.classList.remove('hidden');
      $.prepMarkdown.classList.add('hidden');
      $.togglePreviewBtn.textContent = 'Éditer';
      console.log('[Preview] ✅ Aperçu affiché avec styles complets');
    } else {
      $.mdPreview.classList.add('hidden');
      $.prepMarkdown.classList.remove('hidden');
      $.togglePreviewBtn.textContent = 'Aperçu';
    }
  };
  
  // Init
  console.log('[Assistant IA] 🚀 Initialisation...');
  console.log('[Assistant IA] 📋 Configuration:', {
    limits: LIMITS,
    retryConfig: RETRY_CONFIG
  });
  
  renderPdfs();
  renderUrls();
  updateSourceCount();
  
  console.log('[Assistant IA] ✅ Ready - Toutes les sécurités activées');
  console.log('[Assistant IA] 🛡️ Système de retry : actif (3 tentatives max, backoff exponentiel)');
  console.log('[Assistant IA] 🔄 Fallbacks : actifs sur toutes les générations');
})();
