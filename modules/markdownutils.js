// modules/MarkdownUtils.js
// Utilitaire global pour charger les dépendances Markdown et parser le front-matter
// Expose : window.MarkdownUtils { loadDeps, renderMarkdown, preprocessCustomMarkdown }

(function () {
  if (window.MarkdownUtils) return; // déjà chargé

  // -------- Chargement dynamique des dépendances --------
  // Une promesse par adresse : un second appel attend le chargement en cours au
  // lieu de conclure, à la seule vue de la balise, que le script est prêt. Une
  // balise en échec est retirée pour qu'un appel suivant puisse réessayer.
  const _loading = new Map();
  function loadScriptOnce(src) {
    if (_loading.has(src)) return _loading.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = resolve;
      s.onerror = (e) => { s.remove(); _loading.delete(src); reject(e); };
      document.head.appendChild(s);
    });
    _loading.set(src, p);
    return p;
  }


  async function loadDeps() {
    // marked (robust loading with CDN fallbacks - use specific versions to avoid CORS redirects)
    if (!window.marked) {
      const sources = [
        'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js'
      ];
      for (const src of sources) {
        if (window.marked) break;
        try { await loadScriptOnce(src); } catch (e) { console.debug('[markdown] CDN fallback:', e); }
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
    } catch (e) { console.debug('[markdown] marked config failed:', e); }

    // DOMPurify pour la sanitisation, version figée (une adresse sans version
    // suivait la dernière publication du paquet)
    if (!window.DOMPurify) {
      const sources = [
        'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js',
        'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js'
      ];
      for (const src of sources) {
        if (window.DOMPurify) break;
        try { await loadScriptOnce(src); } catch (e) { console.debug('[markdown] CDN fallback:', e); }
      }
    }
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
      const caption = data.caption ? `<figcaption>${data.caption}${data.credit ? ` - <em>${data.credit}</em>` : ''}</figcaption>` : '';
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
      try { html = window.marked(body); } catch (e) { console.debug('[markdown] marked parse fallback:', e); html = body; }
    } else {
      html = body;
    }
    // Le Markdown est écrit par des contributeurs : sans DOMPurify, on n'affiche
    // que du texte échappé, jamais le HTML brut (audit de sécurité du 11/10/2026).
    // Les éléments de formulaire et les styles sont refusés : ils permettraient
    // d'habiller un faux écran dans la fiche ou dans l'écran de modération.
    if (!(window.DOMPurify && typeof window.DOMPurify.sanitize === 'function')) {
      const text = String(body)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      return { attrs, html: `<p>${text.replace(/\n{2,}/g, '</p><p>')}</p>` };
    }
    const safeHtml = window.DOMPurify.sanitize(html, {
      ADD_TAGS: ['figure', 'figcaption'],
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
      FORBID_ATTR: ['style']
    });
    return { attrs, html: safeHtml };
  }

  // Méthode ensure() : charge le module et ses dépendances si nécessaire
  async function ensure() {
    await loadDeps();
  }

  // Exposition globale
  window.MarkdownUtils = { loadDeps, renderMarkdown, preprocessCustomMarkdown, ensure };
})();
