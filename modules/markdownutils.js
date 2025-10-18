// modules/MarkdownUtils.js
// Utilitaire global pour charger les dépendances Markdown et parser le front-matter
// Expose : window.MarkdownUtils { loadDeps, renderMarkdown, preprocessCustomMarkdown }

(function () {
  if (window.MarkdownUtils) return; // déjà chargé

  // -------- Chargement dynamique des dépendances --------
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadStyleOnce(href) {
    return new Promise((resolve) => {
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.crossOrigin = 'anonymous';
      l.referrerPolicy = 'no-referrer';
      l.onload = resolve;
      document.head.appendChild(l);
    });
  }

  async function loadDeps() {
    // marked (robust loading with CDN fallbacks)
    if (!window.marked) {
      const sources = [
        'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
        'https://unpkg.com/marked@latest/marked.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js'
      ];
      for (const src of sources) {
        if (window.marked) break;
        try { await loadScriptOnce(src); } catch(_) {}
      }
    }
    // Configuration simple et robuste de marked
    try {
      if (window.marked?.setOptions) {
        window.marked.setOptions({
          gfm: true,
          breaks: false,
          headerIds: true,
          mangle: false,
          smartypants: true
        });
      }
    } catch (_) {}

    // DOMPurify pour la sanitisation
    if (!window.DOMPurify) {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js');
    }

    // Le CSS markdown est maintenant géré par gp-markdown-content.css
  }

  // -------- Pré-traitement markdown pour directives custom --------
  function preprocessCustomMarkdown(rawMd) {
    let md = rawMd;

    // ::content-image
    md = md.replace(/::content-image[\t\x20]*\n---([\s\S]*?)---\s*::/g, (_, yamlBlock) => {
      const lines = yamlBlock.split(/\n/).map(l => l.trim()).filter(Boolean);
      const data = {};
      lines.forEach(line => {
        const m = line.match(/^(\w+)\s*:\s*(.*)$/);
        if (m) data[m[1]] = m[2];
      });
      if (!data.imageUrl) return '';
      const caption = data.caption ? `<figcaption>${data.caption}${data.credit ? ` – <em>${data.credit}</em>` : ''}</figcaption>` : '';
      return `\n<figure class="content-image">\n  <img src="${data.imageUrl}" alt="${data.caption || ''}">\n  ${caption}\n</figure>\n`;
    });

    // ::banner{type="..."}
    md = md.replace(/::banner\{type="([^"]+)"\}([\s\S]*?)::/g, (_, type, inner) => {
      const htmlInner = inner.trim().replace(/\n+/g, ' ');
      return `\n<div class="banner banner-${type}">${htmlInner}</div>\n`;
    });

    // Nettoyages finaux
    md = md.replace(/^::$/gm, '');
    md = md.replace(/:[\w-]+-link\{[^}]+\}/g, '');
    return md;
  }

  // -------- Rendu Markdown + extraction front-matter --------
  function renderMarkdown(rawMd) {
    // Extraction simple du front-matter YAML (---) en tête du fichier
    let attrs = {};
    let body = rawMd;
    const fm = rawMd.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
    if (fm) {
      const yml = fm[1];
      body = rawMd.slice(fm[0].length);
      yml.split(/\r?\n/).forEach(line => {
        const m = line.match(/^(\w+)\s*:\s*(.*)$/);
        if (m) attrs[m[1]] = m[2];
      });

      // Sanitize: trim and strip stray quotes around values (e.g., cover paths)
      Object.keys(attrs).forEach(k => {
        let v = (attrs[k] ?? '').trim();
        // Remove wrapping quotes if both ends match
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1).trim();
        }
        // Remove any leftover trailing or leading unmatched quotes
        while (v.endsWith('"') || v.endsWith("'")) v = v.slice(0, -1).trim();
        while (v.startsWith('"') || v.startsWith("'")) v = v.slice(1).trim();
        attrs[k] = v;
      });
    }

    body = preprocessCustomMarkdown(body);
    // Support both modern marked (object with .parse) and legacy (callable function)
    let html;
    if (window.marked && typeof window.marked.parse === 'function') {
      html = window.marked.parse(body);
    } else if (typeof window.marked === 'function') {
      try { html = window.marked(body); } catch(_) { html = body; }
    } else {
      html = body;
    }
    // Sanitisation simple via DOMPurify (option 1, keep it simple)
    const safeHtml = (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function')
      ? window.DOMPurify.sanitize(html, { ADD_TAGS: ['figure', 'figcaption'] })
      : html;
    return { attrs, html: safeHtml };
  }

  // Exposition globale
  window.MarkdownUtils = { loadDeps, renderMarkdown, preprocessCustomMarkdown };
})();
