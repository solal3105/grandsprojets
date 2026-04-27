;(function(win) {
  'use strict';

  /**
   * WebinarModal — Modale d'annonce webinaire (metropole-lyon uniquement).
   *
   * Dates actives (heure locale navigateur) :
   *   27 avril 2026 → inscription webinaire (demain à 11h)
   *   28 avril 2026 → retour webinaire / découvrir Open Projets
   *
   * Prévisualisation : ?preview-banner=1 ou ?preview-banner=2
   *   → ignore la date et le sessionStorage
   *
   * Fermeture : mémorisée en sessionStorage — ne réapparaît pas dans la session.
   * La modale s'ouvre avec un délai de 800ms (laisse la carte se charger d'abord).
   */

  const MODALS = [
    {
      type:    'webinar-1',
      preview: '1',
      isActive: (y, m, d) => y === 2026 && m === 4 && d === 27,
      eyebrow:  'Webinaire Gazette des Communes — demain à 11h',
      title:    'Comment mieux informer pour réduire les tensions&nbsp;?',
      desc:     'Travaux &amp; projets urbains : quelles pratiques pour tenir les citoyens informés et désamorcer les conflits&nbsp;? On en parle demain, <strong>mardi 28 avril à 11h</strong>, avec La Gazette des Communes.',
      date:     'Mardi 28 avril · 11h00',
      actions: [
        {
          label:   'S\'inscrire gratuitement',
          icon:    'fas fa-arrow-right',
          url:     'https://www.lagazettedescommunes.com/nos-webinaires/travaux-et-projets-urbains-comment-mieux-informer-pour-reduire-les-tensions-100078624/',
          primary: true,
        },
      ],
    },
    {
      type:    'webinar-2',
      preview: '2',
      isActive: (y, m, d) => y === 2026 && m === 4 && d === 28,
      eyebrow:  'Découvrez Open Projets',
      title:    'Vous venez du webinaire ?',
      desc:     'Open Projets aide les collectivités à <strong>mieux informer les citoyens</strong> sur les travaux et projets urbains — moins de tensions, plus de confiance.',
      date:     null,
      actions: [
        {
          label:   'Contactez-nous',
          icon:    'fas fa-envelope',
          url:     'https://openprojets.com/home/contact',
          primary: true,
        },
        {
          label:   'Découvrir Open Projets',
          icon:    'fas fa-map',
          url:     'https://openprojets.com/home/',
          primary: false,
        },
      ],
    },
  ];

  win.WebinarBanner = {

    init(city) {
      if (city !== 'metropole-lyon') return;

      const previewParam = new URLSearchParams(location.search).get('preview-banner');

      const now   = new Date();
      const year  = now.getFullYear();
      const month = now.getMonth() + 1;
      const day   = now.getDate();

      const content = MODALS.find(m =>
        previewParam ? m.preview === previewParam : m.isActive(year, month, day)
      );

      if (!content) return;

      const storageKey = `gp-webinar-modal-dismissed-${content.type}`;

      if (!previewParam) {
        try {
          if (sessionStorage.getItem(storageKey)) return;
        } catch (_) { /* sessionStorage indisponible → continuer */ }
      }

      // Délai avant ouverture : laisse la carte se charger
      setTimeout(() => this._open(content, previewParam ? null : storageKey), 800);
    },

    _open(content, storageKey) {
      // ── Overlay ──────────────────────────────────────────────────────────
      const overlay = document.createElement('div');
      overlay.className = 'wm-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', content.eyebrow);

      // ── Badge date ───────────────────────────────────────────────────────
      const dateBadge = content.date
        ? `<div class="wm-date-badge">
             <i class="fas fa-calendar-alt" aria-hidden="true"></i>
             ${content.date}
           </div>`
        : '';

      // ── Actions ──────────────────────────────────────────────────────────
      // URLs : constantes littérales, aucun contenu utilisateur
      const actionsHtml = content.actions.map(a => {
        const cls = `wm-btn wm-btn--${a.primary ? 'primary' : 'secondary'}`;
        return `<a href="${a.url}" class="${cls}" target="_blank" rel="noopener noreferrer">
          <i class="${a.icon}" aria-hidden="true"></i>
          ${a.label}
        </a>`;
      }).join('');

      overlay.innerHTML = `
        <div class="wm-panel">
          <button class="wm-close" aria-label="Fermer">
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
          <div class="wm-body">
            <div class="wm-eyebrow">
              <i class="fas fa-calendar-check" aria-hidden="true"></i>
              ${content.eyebrow}
            </div>
            <h2 class="wm-title">${content.title}</h2>
            <p class="wm-desc">${content.desc}</p>
            ${dateBadge}
            <div class="wm-actions">${actionsHtml}</div>
          </div>
          <div class="wm-footer">
            <button class="wm-dismiss">Plus tard</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Animer l'ouverture au prochain frame
      requestAnimationFrame(() => overlay.classList.add('wm-visible'));

      // ── Fermeture ────────────────────────────────────────────────────────
      const close = () => {
        if (storageKey) {
          try { sessionStorage.setItem(storageKey, '1'); } catch (_) { /* */ }
        }
        overlay.classList.remove('wm-visible');

        let done = false;
        const remove = () => {
          if (done) return;
          done = true;
          overlay.remove();
        };
        overlay.addEventListener('transitionend', remove, { once: true });
        setTimeout(remove, 450); // fallback headless
      };

      overlay.querySelector('.wm-close').addEventListener('click', close);
      overlay.querySelector('.wm-dismiss').addEventListener('click', close);

      // Clic sur l'overlay (hors panel) ferme aussi
      overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
      });

      // Echap ferme
      const onKeydown = e => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKeydown); }
      };
      document.addEventListener('keydown', onKeydown);
    },
  };

})(window);
