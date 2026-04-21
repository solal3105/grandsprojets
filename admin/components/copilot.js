/**
 * Assistant de rédaction — IA contextuelle pour le wizard contribution.
 */

import { toast, esc } from './ui.js';
import { store } from '../store.js';

const SIGNALS = [
  { key: 'name',        label: 'Nom du projet',       icon: 'fa-font',       weight: 20 },
  { key: 'category',    label: 'Catégorie',            icon: 'fa-tag',        weight: 20 },
  { key: 'url',         label: 'Lien officiel',        icon: 'fa-link',       weight: 20 },
  { key: 'description', label: 'Description courte',   icon: 'fa-align-left', weight: 15 },
  { key: 'pdf',         label: 'Document PDF',         icon: 'fa-file-pdf',   weight: 15 },
  { key: 'cover',       label: 'Image de couverture',  icon: 'fa-image',      weight: 5  },
  { key: 'article',     label: 'Article rédigé',       icon: 'fa-newspaper',  weight: 5  },
];

function _availableSuggestions(ctx) {
  const out = [];
  if (ctx.name && ctx.category) {
    out.push({ target: 'description', label: ctx.description ? 'Regénérer la description' : 'Générer la description', icon: 'fa-align-left' });
    out.push({ target: 'article', label: "Générer l'article", icon: 'fa-newspaper' });
  }
  return out;
}

function _pickMessage(ctx) {
  if (!ctx.name || !ctx.category) return 'Renseignez au minimum le nom et la catégorie pour que je puisse vous aider.';
  if (ctx.url && ctx.description && ctx.article) return 'Le dossier est bien avancé ! Vous pouvez régénérer n\'importe quel contenu si besoin.';
  if (ctx.url && ctx.description) return "J'ai accès au site officiel et à la description. Je peux rédiger un article très précis.";
  if (ctx.url) return 'Je vais exploiter le lien officiel pour enrichir la génération.';
  if (ctx.description) return "J'ai la description. Ajoutez un lien officiel pour un résultat encore meilleur.";
  return "J'ai assez d'infos pour vous proposer du contenu. Ajoutez un lien officiel pour plus de précision.";
}

export class Copilot {
  constructor(container, opts = {}) {
    this._container = container;
    this._footer = opts.footer;
    this._city = opts.city || '';
    this._open = false;
    this._messages = [];
    this._generating = false;
    this._genStatus = '';
    this._abortCtrl = null;
    this._getWizState = opts.getWizState || (() => ({}));
    this._onInsert = opts.onInsert || (() => {});
    this._pollTimer = null;
    this._lastBadge = 0;
    this._destroyed = false;
    this._webSearch = true;
    this._expanded = false;
    this._backdrop = null;
    this._panelPrevParent = null;
    this._panelPrevSibling = null;

    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (this._expanded) { this._setExpanded(false); e.stopPropagation(); }
        else if (this._open) this._toggle(false);
      }
    };
    this._onClickOutside = (e) => {
      if (!this._open || this._expanded) return;
      if (this._panelEl && !this._panelEl.contains(e.target) && !this._btn.contains(e.target)) {
        this._toggle(false);
      }
    };

    this._render();
    this._startPolling();
    document.addEventListener('keydown', this._onKeyDown, true);
    document.addEventListener('pointerdown', this._onClickOutside);
  }

  destroy() {
    this._destroyed = true;
    this._stopPolling();
    this._abortCtrl?.abort();
    if (this._expanded) this._setExpanded(false);
    this._backdrop?.remove();
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('pointerdown', this._onClickOutside);
    if (this._liveHandler) {
      this._container.removeEventListener('input', this._liveHandler);
      this._container.removeEventListener('change', this._liveHandler);
    }
    this._panelEl?.remove();
    this._btn?.remove();
  }

  _render() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cp-trigger';
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span class="cp-trigger__label">Assistant</span><span class="cp-trigger__badge" id="cp-badge" hidden></span>';
    this._btn = btn;

    const submitBtn = this._footer?.querySelector('#cw-submit');
    if (submitBtn) this._footer.insertBefore(btn, submitBtn);
    else this._footer?.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'cp-panel';
    panel.id = 'cp-panel';
    panel.hidden = true;
    panel.innerHTML = [
      '<div class="cp-panel__header">',
      '  <span class="cp-panel__title"><i class="fa-solid fa-wand-magic-sparkles"></i> Assistant de rédaction</span>',
      '  <div class="cp-panel__header-actions">',
      '    <button class="cp-panel__expand" type="button" aria-label="Agrandir"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>',
      '    <button class="cp-panel__close" type="button" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>',
      '  </div>',
      '</div>',
      '<div class="cp-panel__sticky" id="cp-sticky" hidden></div>',
      '<div class="cp-panel__body" id="cp-body"></div>',
    ].join('\n');
    this._panelEl = panel;
    if (this._footer) {
      this._footer.appendChild(panel);
    } else if (this._footer?.parentNode) {
      this._footer.parentNode.insertBefore(panel, this._footer);
    }

    btn.addEventListener('click', () => this._toggle());

    panel.querySelector('.cp-panel__header').addEventListener('click', (e) => {
      if (e.target.closest('.cp-panel__close')) this._toggle(false);
      if (e.target.closest('.cp-panel__expand')) this._toggleExpand();
    });

    panel.querySelector('#cp-body').addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const action = t.dataset.action;
      if (action === 'generate') this._generate(t.dataset.target);
      if (action === 'copy') this._copy(parseInt(t.dataset.idx));
      if (action === 'insert') this._insert(parseInt(t.dataset.idx));
      if (action === 'stop') this._abortCtrl?.abort();
      if (action === 'toggle-web') { this._webSearch = !this._webSearch; this._updatePanel(); }
    });

    this._liveHandler = () => { if (this._open) this._updatePanel(); };
    this._container.addEventListener('input', this._liveHandler);
    this._container.addEventListener('change', this._liveHandler);
  }

  _toggle(force) {
    this._open = force !== undefined ? force : !this._open;
    this._panelEl.hidden = !this._open;
    if (this._open) {
      const badge = this._btn.querySelector('#cp-badge');
      if (badge) badge.hidden = true;
      this._updatePanel();
    } else {
      if (this._expanded) this._setExpanded(false);
    }
  }

  _toggleExpand() { this._setExpanded(!this._expanded); }

  _setExpanded(val) {
    this._expanded = val;
    const panel = this._panelEl;
    const icon = panel.querySelector('.cp-panel__expand i');

    if (val) {
      if (!this._backdrop) {
        this._backdrop = document.createElement('div');
        this._backdrop.className = 'cp-backdrop';
        this._backdrop.addEventListener('click', () => this._setExpanded(false));
        document.body.appendChild(this._backdrop);
      }
      this._panelPrevSibling = panel.nextSibling;
      this._panelPrevParent = panel.parentNode;
      document.body.appendChild(panel);
      panel.classList.add('cp-panel--expanded');
      if (icon) icon.className = 'fa-solid fa-down-left-and-up-right-to-center';
    } else {
      this._backdrop?.remove();
      this._backdrop = null;
      panel.classList.remove('cp-panel--expanded');
      if (this._panelPrevParent) {
        this._panelPrevParent.insertBefore(panel, this._panelPrevSibling || null);
        this._panelPrevParent = null;
        this._panelPrevSibling = null;
      }
      if (icon) icon.className = 'fa-solid fa-up-right-and-down-left-from-center';
    }
    const body = panel.querySelector('#cp-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  _startPolling() { this._pollTimer = setInterval(() => this._checkBadge(), 2000); }
  _stopPolling() { clearInterval(this._pollTimer); }

  _readContext() {
    const wiz = this._getWizState();
    const c = this._container;
    return {
      name: (c.querySelector('#cw-name')?.value || '').trim(),
      category: (c.querySelector('#cw-category')?.value || c.querySelector('#cw-cat-text')?.value || '').trim(),
      description: (c.querySelector('#cw-description')?.value || '').trim(),
      url: (c.querySelector('#cw-official-url')?.value || '').trim(),
      pdf: !!(wiz.docs?.length),
      cover: !!(wiz.coverFile || wiz.editItem?.cover_url),
      article: !!(wiz.markdownText || wiz._mdEditor?.getMarkdown()?.trim()),
    };
  }

  _computeCompletion(ctx) {
    return SIGNALS.reduce((t, s) => t + (ctx[s.key] ? s.weight : 0), 0);
  }

  _checkBadge() {
    if (this._open || this._generating) return;
    const ctx = this._readContext();
    const count = _availableSuggestions(ctx).length;
    const badge = this._btn.querySelector('#cp-badge');
    if (!badge) return;
    if (count > 0 && count !== this._lastBadge) {
      badge.textContent = count;
      badge.hidden = false;
      badge.classList.remove('cp-pulse');
      void badge.offsetWidth;
      badge.classList.add('cp-pulse');
    } else if (count === 0) {
      badge.hidden = true;
    }
    this._lastBadge = count;
  }

  _updatePanel() {
    const panel = this._panelEl;
    const body = panel.querySelector('#cp-body');
    const sticky = panel.querySelector('#cp-sticky');
    const ctx = this._readContext();
    const pct = this._computeCompletion(ctx);
    const sugg = _availableSuggestions(ctx);
    const msg = _pickMessage(ctx);
    const hasMessages = this._messages.length > 0;

    sticky.hidden = !hasMessages;
    if (hasMessages) {
      sticky.innerHTML = '<div class="cp-bar">' +
        '<div class="cp-bar__signals">' + SIGNALS.map(s =>
          '<i class="cp-bar__icon fa-solid ' + (ctx[s.key] ? 'fa-circle-check cp-bar__icon--on' : 'fa-circle-xmark cp-bar__icon--off') + '" title="' + s.label + '"></i>'
        ).join('') + '</div>' +
        '<div class="cp-bar__track"><div class="cp-bar__fill" style="width:' + pct + '%"></div></div>' +
        '<span class="cp-bar__pct">' + pct + '%</span></div>';
    }

    let html = '';

    if (!hasMessages) {
      html += '<div class="cp-completion-card">' +
        '<div class="cp-completion-card__header"><span class="cp-completion-card__title">Complétion du dossier</span><span class="cp-completion-card__pct">' + pct + '%</span></div>' +
        '<div class="cp-completion-card__track"><div class="cp-completion-card__fill" style="width:' + pct + '%"></div></div>' +
        '<div class="cp-completion-card__signals">' + SIGNALS.map(s =>
          '<div class="cp-signal ' + (ctx[s.key] ? 'cp-signal--on' : 'cp-signal--off') + '">' +
          '<i class="fa-solid ' + (ctx[s.key] ? 'fa-circle-check' : 'fa-circle-xmark') + '"></i>' +
          '<span>' + s.label + '</span></div>'
        ).join('') + '</div>' +
        '<div class="cp-completion-card__footer">' +
        '<button class="cp-web-toggle ' + (this._webSearch ? 'cp-web-toggle--on' : 'cp-web-toggle--off') + '" data-action="toggle-web" type="button">' +
        '<i class="fa-solid fa-globe"></i> ' + (this._webSearch ? 'Recherche web activée' : 'Recherche web désactivée') + '</button></div></div>';
    }

    if (hasMessages) {
      html += '<div class="cp-messages">';
      this._messages.forEach((m, i) => {
        if (m.type === 'bot') {
          html += '<div class="cp-msg cp-msg--bot">' + esc(m.text) + '</div>';
        } else if (m.type === 'result') {
          const streaming = m.streaming;
          let srcHtml = '';
          if (m.sources?.length) {
            srcHtml = '<div class="cp-sources"><span class="cp-sources__label"><i class="fa-solid fa-globe"></i> Sources consultées</span><div class="cp-sources__list">' +
              m.sources.map(s => '<a class="cp-sources__link" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>' + esc(s.title || s.url) + '</span></a>').join('') +
              '</div></div>';
          }
          html += '<div class="cp-msg cp-msg--result"><div class="cp-msg__content ' + (streaming ? 'cp-msg--streaming' : '') + '" id="cp-result-' + i + '">' + this._renderMarkdown(m.text) + '</div>' +
            srcHtml +
            (!streaming ? '<div class="cp-msg__actions"><button class="cp-action-btn" data-action="copy" data-idx="' + i + '"><i class="fa-regular fa-copy"></i> Copier</button><button class="cp-action-btn cp-action-btn--primary" data-action="insert" data-idx="' + i + '" data-target="' + m.target + '"><i class="fa-solid fa-arrow-right-to-bracket"></i> Insérer</button></div>' : '') +
            '</div>';
        }
      });
      html += '</div>';
    }

    if (!this._generating) {
      html += '<div class="cp-msg cp-msg--bot">' + esc(msg) + '</div>';
    }

    if (this._generating) {
      html += '<div class="cp-generating"><div class="cp-generating__dots"><span></span><span></span><span></span></div>' +
        '<span class="cp-gen-status">' + esc(this._genStatus || 'Génération en cours…') + '</span>' +
        '<button class="cp-generating__stop" data-action="stop" title="Arrêter"><i class="fa-solid fa-stop"></i></button></div>';
    }

    if (!this._generating && sugg.length > 0) {
      html += '<div class="cp-suggestions">';
      sugg.forEach(s => {
        html += '<button class="cp-suggest-btn" data-action="generate" data-target="' + s.target + '"><i class="fa-solid ' + s.icon + '"></i> ' + s.label + '</button>';
      });
      html += '</div>';
    }

    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
  }

  _renderMarkdown(text) {
    return esc(text)
      .replace(/^### (.+)$/gm, '<strong style="font-size:13px;display:block;margin-top:12px;">$1</strong>')
      .replace(/^## (.+)$/gm, '<strong style="font-size:14px;display:block;margin-top:14px;">$1</strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<span style="display:block;padding-left:12px;">• $1</span>')
      .replace(/^\d+\. (.+)$/gm, function(_, c) { return '<span style="display:block;padding-left:12px;">' + c + '</span>'; })
      .replace(/\n/g, '<br>');
  }

  _stripCitations(text) {
    return text
      // Lignes contenant uniquement un lien Markdown [texte](url) (émis par le web search)
      // Exclure les images ![ qui sont voulues dans les articles
      .replace(/^[ \t]*(?!!)\[[^\]\n]+\]\(https?:\/\/[^)\n]+\)[ \t]*\n*/gm, '')
      // Citations inline entre parenthèses : ([texte](url))
      .replace(/\s*\(\[[^\]]*\]\(https?:\/\/[^)]+\)\)/g, '')
      // Références numériques [1], [2]…
      .replace(/\s*\[\d+\]/g, '')
      // Lignes vides en tête après nettoyage
      .replace(/^\n+/, '')
      .trim();
  }

  _renderSources(container, sources) {
    let el = container.querySelector('.cp-sources');
    if (!el) {
      el = document.createElement('div');
      el.className = 'cp-sources';
      const actions = container.querySelector('.cp-msg__actions');
      container.insertBefore(el, actions || null);
    }
    el.innerHTML = '<span class="cp-sources__label"><i class="fa-solid fa-globe"></i> Sources consultées</span>' +
      '<div class="cp-sources__list">' + sources.map(s =>
        '<a class="cp-sources__link" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>' + esc(s.title || s.url) + '</span></a>'
      ).join('') + '</div>';
  }

  async _generate(target) {
    if (this._generating) return;
    const ctx = this._readContext();
    if (!ctx.name || !ctx.category) {
      toast("Renseignez le nom et la catégorie d'abord", 'warning');
      return;
    }

    this._generating = true;
    this._genStatus = 'Génération en cours…';
    this._abortCtrl = new AbortController();

    this._messages.push({ type: 'bot', text: target === 'description'
      ? 'Je recherche des informations et rédige la description…'
      : "Je recherche des informations et rédige l'article…" });

    const resultIdx = this._messages.length;
    this._messages.push({ type: 'result', text: '', target, streaming: true });
    this._updatePanel();

    try {
      const payload = {
        project_name: ctx.name,
        category: ctx.category,
        description: ctx.description,
        official_url: ctx.url,
        city: this._city,
        target,
        web_search: this._webSearch,
      };

      const headers = { 'Content-Type': 'application/json' };
      const token = store.session?.access_token;
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const res = await fetch('/api/ai-generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: this._abortCtrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'HTTP ' + res.status);
      }

      const panel = this._panelEl;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);

            if (parsed.content) {
              if (!fullText) {
                this._genStatus = 'Rédaction en cours…';
                const statusEl = panel.querySelector('.cp-gen-status');
                if (statusEl) statusEl.textContent = this._genStatus;
              }
              fullText += parsed.content;
              const cleanText = this._stripCitations(fullText);
              this._messages[resultIdx].text = cleanText;
              const el = panel.querySelector('#cp-result-' + resultIdx);
              if (el) {
                el.innerHTML = this._renderMarkdown(cleanText);
                const b = el.closest('#cp-body');
                if (b) b.scrollTop = b.scrollHeight;
              }
            }

            if (parsed.status === 'searching') {
              this._genStatus = 'Recherche sur le web…';
              const statusEl = panel.querySelector('.cp-gen-status');
              if (statusEl) statusEl.textContent = this._genStatus;
            }

            if (parsed.sources?.length) {
              this._messages[resultIdx].sources = parsed.sources;
              const rw = panel.querySelector('#cp-result-' + resultIdx)?.closest('.cp-msg--result');
              if (rw) this._renderSources(rw, parsed.sources);
            }
          } catch { /* skip */ }
        }
      }

      this._messages[resultIdx].streaming = false;
      this._messages[resultIdx].text = this._stripCitations(this._messages[resultIdx].text);
      this._generating = false;
      this._updatePanel();

    } catch (err) {
      this._generating = false;
      if (err.name === 'AbortError') {
        this._messages[resultIdx].streaming = false;
        if (!this._messages[resultIdx].text) {
          this._messages.splice(resultIdx, 1);
          this._messages.push({ type: 'bot', text: 'Génération interrompue.' });
        }
      } else {
        this._messages.splice(resultIdx, 1);
        this._messages.push({ type: 'bot', text: 'Erreur : ' + err.message });
      }
      this._updatePanel();
    }
  }

  _copy(idx) {
    const msg = this._messages[idx];
    if (!msg) return;
    navigator.clipboard.writeText(msg.text).then(() => toast('Copié', 'success'));
  }

  _insert(idx) {
    const msg = this._messages[idx];
    if (!msg) return;
    this._onInsert(msg.target, msg.text);
  }
}
