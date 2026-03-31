/**
 * ToggleManager — Unified toggle dock controller
 * State management, events, accessibility, overflow menu
 * Layout is handled entirely by CSS flexbox (no JS positioning)
 */

import { TOGGLES_CONFIG, TOGGLE_ORDER, DESKTOP_ORDER } from './toggles-config.js';

class ToggleManager {
  constructor() {
    this.toggles = new Map();
    this.state = new Map();
    this.listeners = new Map();
    this.initialized = false;
    this.overflowToggles = [];
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════════════ */

  init() {
    if (this.initialized) return;

    TOGGLE_ORDER.forEach(key => this.initToggle(key));

    this.initialized = true;
    this._bindResize();
    this.recalculate();
  }

  initToggle(key) {
    const config = TOGGLES_CONFIG[key];
    if (!config) return;

    const element = document.getElementById(config.id);
    if (!element) return;

    element.classList.add('app-toggle');

    this.toggles.set(key, { element, config, state: config.defaultState });
    this.state.set(key, config.defaultState);

    if (config.redirectUrl) {
      element.addEventListener('click', (e) => { e.preventDefault(); window.location.href = config.redirectUrl; });
    } else {
      this._bindToggleEvents(key, element, config);
    }

    if (config.persistent) this._restoreState(key);
    this._setupAria(element, config);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EVENT BINDING
     ═══════════════════════════════════════════════════════════════════════ */

  _bindToggleEvents(key, element, config) {
    element.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggle(key); });
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(key); }
    });

    if (config.hasOverlay || config.hasMenu || config.targetElement || config.hasDockPanel) {
      document.addEventListener('click', (e) => {
        // Find the associated panel element
        let panel = null;
        if (config.hasDockPanel) {
          panel = document.querySelector(`.dock-panel[data-toggle="${key}"]`);
        } else {
          const sel = config.overlaySelector || config.menuSelector;
          panel = sel ? document.querySelector(sel) : (config.targetElement ? document.getElementById(config.targetElement) : null);
        }
        const inside = (element.contains(e.target)) || (panel && panel.contains(e.target));
        if (!inside && this.getState(key)) this.setState(key, false);
      });
    }
  }

  _setupAria(element, config) {
    if (element.tagName !== 'BUTTON') {
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
    }
    element.setAttribute('aria-label', config.ariaLabel || config.label);
    if (config.hasMenu || config.hasOverlay || config.hasModal) {
      element.setAttribute('aria-haspopup', 'true');
      element.setAttribute('aria-expanded', 'false');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════════════ */

  toggle(key) {
    const t = this.toggles.get(key);
    if (!t) return;
    this.setState(key, !this.state.get(key));
  }

  setState(key, state) {
    const t = this.toggles.get(key);
    if (!t) return;
    if (this.state.get(key) === state) return;

    // When opening a panel, dismiss any open content overlays (submenus, detail panels)
    const opensPanel = t.config.hasMenu || t.config.hasOverlay || t.config.hasModal || t.config.targetElement || t.config.hasDockPanel;
    if (state && opensPanel) {
      const detail = document.getElementById('project-detail');
      if (detail) detail.style.display = 'none';
    }

    // Mutual exclusion: close other open toggles
    if (state && opensPanel) {
      this.toggles.forEach((other, otherKey) => {
        if (otherKey !== key && this.state.get(otherKey) &&
            (other.config.hasMenu || other.config.hasOverlay || other.config.hasModal || other.config.targetElement || other.config.hasDockPanel)) {
          this.setState(otherKey, false);
        }
      });
    }

    this.state.set(key, state);

    // ARIA
    t.element.setAttribute('aria-pressed', String(state));
    if (t.config.hasMenu || t.config.hasOverlay || t.config.hasModal || t.config.hasDockPanel) {
      t.element.setAttribute('aria-expanded', String(state));
    }

    // Icon swap (theme toggle)
    if (t.config.iconActive) {
      const icon = t.element.querySelector('i');
      if (icon) icon.className = state ? `fas ${t.config.iconActive}` : `fas ${t.config.icon}`;
    }

    // ── Unified dock-panel system ──
    // Any element with .dock-panel[data-toggle="<key>"] is handled here.
    const dockPanel = document.querySelector(`.dock-panel[data-toggle="${key}"]`);
    if (dockPanel) {
      if (state) this._positionPanelBelowDock(dockPanel, key);
      dockPanel.classList.toggle('dock-panel--open', state);
    }

    // ── Legacy: Overlay (non dock-panel) ──
    if (t.config.overlaySelector && !dockPanel) {
      const el = document.querySelector(t.config.overlaySelector);
      if (el) {
        if (state) this._positionPanelBelowDock(el, key);
        el.classList.toggle('active', state);
        el.style.display = state ? 'flex' : 'none';
        el.setAttribute('aria-hidden', String(!state));
      }
    }

    // ── Legacy: Menu (non dock-panel) ──
    if (t.config.menuSelector && !dockPanel) {
      const el = document.querySelector(t.config.menuSelector);
      if (el) {
        if (state) this._positionPanelBelowDock(el, key);
        el.classList.toggle('active', state);
      }
    }

    // Modal (about, etc. — not a dock-panel)
    if (t.config.modalSelector) {
      const modalId = t.config.modalSelector.replace('#', '');
      if (state) {
        if (window.ModalHelper?.open) {
          window.ModalHelper.open(modalId, {
            dismissible: true, lockScroll: true, focusTrap: true,
            onClose: () => { if (this.getState(key)) this.setState(key, false); }
          });
        } else {
          const m = document.querySelector(t.config.modalSelector);
          if (m) { m.style.display = 'flex'; m.setAttribute('aria-hidden', 'false'); }
        }
      } else {
        if (window.ModalHelper?.close) window.ModalHelper.close(modalId);
        else {
          const m = document.querySelector(t.config.modalSelector);
          if (m) { m.style.display = 'none'; m.setAttribute('aria-hidden', 'true'); }
        }
      }
    }

    // ── Legacy: Target element (non dock-panel) ──
    if (t.config.targetElement && !dockPanel) {
      const el = document.getElementById(t.config.targetElement);
      if (el) {
        if (state) this._positionPanelBelowDock(el, key);
        el.style.display = state ? 'block' : 'none';
      }
    }

    // Persist
    if (t.config.persistent) {
      localStorage.setItem(t.config.storageKey || `toggle-${key}`, String(state));
    }

    this._emit(key, state);
  }

  getState(key) { return this.state.get(key) || false; }

  _restoreState(key) {
    const t = this.toggles.get(key);
    if (!t) return;
    const saved = localStorage.getItem(t.config.storageKey || `toggle-${key}`);
    if (saved !== null) this.setState(key, saved === 'true');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LISTENERS
     ═══════════════════════════════════════════════════════════════════════ */

  on(key, callback) {
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(callback);
  }

  off(key, callback) {
    const list = this.listeners.get(key);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx > -1) list.splice(idx, 1);
  }

  _emit(key, state) {
    const list = this.listeners.get(key);
    if (list) list.forEach(cb => { try { cb(state); } catch (e) { console.error(`[ToggleManager] ${key}:`, e); } });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     COUNTER / SPECIAL STATE / READY / VISIBLE
     ═══════════════════════════════════════════════════════════════════════ */

  updateCounter(key, count) {
    const t = this.toggles.get(key);
    if (!t?.config.hasCounter) return;
    const counter = t.element.querySelector(t.config.counterSelector);
    if (counter) { counter.textContent = count; counter.style.display = count > 0 ? 'flex' : 'none'; }
  }

  setSpecialState(key, specialState) {
    const t = this.toggles.get(key);
    if (!t) return;
    if (t.config.states) t.config.states.forEach(s => t.element.classList.remove(s));
    if (specialState && specialState !== 'default') t.element.classList.add(specialState);
  }

  markReady(key) {
    const t = this.toggles.get(key);
    if (t) {
      t.element.setAttribute('data-ready', 'true');
      this.scheduleRecalculate();
    }
  }

  markNotReady(key) {
    const t = this.toggles.get(key);
    if (t) {
      t.element.setAttribute('data-ready', 'false');
      this.scheduleRecalculate();
    }
  }

  setVisible(key, visible) {
    const t = this.toggles.get(key);
    if (!t) return;
    t.element.setAttribute('data-branding-enabled', visible ? 'true' : 'false');
    t.element.style.display = visible ? 'flex' : 'none';
    this.recalculate();
    this._updateGroupVisibility();
  }

  isVisible(key) {
    const t = this.toggles.get(key);
    if (!t) return false;
    const s = window.getComputedStyle(t.element);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LAYOUT — Flexbox handles positioning; JS only manages overflow
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Get the minimum left edge the dock is allowed to reach.
   * On mobile the logo pill sits on the left; the dock must not overlap it.
   */
  _getMinDockLeft() {
    const isMobile = window.innerWidth <= 640;
    const logo = document.querySelector('.mobile-fixed-logo');
    if (!logo || !isMobile) return 0;
    const r = logo.getBoundingClientRect();
    // If logo is rendered, use its right edge + 8px gap
    if (r.width > 0) return r.right + 8;
    // Fallback: logo not yet laid out — estimate from CSS
    // left:10 + padding:~24 + img:~85 + gap:8 ≈ 127px
    return 127;
  }

  /**
   * Collect all toggle buttons that should be visible (ready + enabled).
   */
  _getEligibleToggles() {
    // (see _getTrimCandidates for the filtered subset used by the overflow algo)
    const eligible = [];
    TOGGLE_ORDER.forEach(key => {
      const t = this.toggles.get(key);
      if (!t) return;
      if (t.element.getAttribute('data-ready') === 'false') return;
      const brandAttr = t.element.getAttribute('data-branding-enabled');
      let show = true;
      if (brandAttr !== null) show = brandAttr === 'true';
      else if (key === 'contribute') show = this._isConnected();
      else if (key === 'login') show = !this._isConnected();
      if (show) eligible.push({ key, element: t.element, config: t.config });
    });
    return eligible;
  }

  /**
   * Subset of eligible buttons that may be moved into the overflow section.
   * Buttons with overflowExempt:true (i.e. actions-toggle) are always kept in the dock.
   */
  _getTrimCandidates(eligible) {
    return eligible.filter(({ config }) => !config.overflowExempt);
  }

  /** Debounced recalculate — batches rapid calls (markReady during init) */
  scheduleRecalculate() {
    if (this._recalcTimer) return;
    this._recalcTimer = requestAnimationFrame(() => {
      this._recalcTimer = null;
      this._doRecalculate();
    });
  }

  /** Immediate recalculate (used by resize handler & explicit calls) */
  recalculate() {
    if (this._recalcTimer) { cancelAnimationFrame(this._recalcTimer); this._recalcTimer = null; }
    this._doRecalculate();
  }

  _doRecalculate() {
    const isMobile = window.innerWidth <= 640;

    if (!isMobile) {
      // Desktop: all buttons fit, no overflow section needed
      this._restoreOverflowToggles();
      this._updateActionsOverflow();
      this._updateGroupVisibility();
      this._repositionOpenPanels();
      return;
    }

    const dock = document.getElementById('toggle-dock');
    if (!dock) return;

    const eligible   = this._getEligibleToggles();
    const candidates = this._getTrimCandidates(eligible); // excludes overflowExempt

    // Step 1: Show ALL eligible buttons
    eligible.forEach(({ element }) => {
      element.style.display = 'flex';
      element.removeAttribute('data-in-overflow');
    });
    this.overflowToggles = [];
    this._updateGroupVisibility();

    // Step 2: Does the dock overlap the logo pill?
    const minLeft = this._getMinDockLeft();

    // Step 3: Trim candidates from the END, one at a time, until the dock fits.
    // actions-toggle (overflowExempt) is never a victim — it IS the overflow entry point.
    // Minimum 3 visible buttons regardless.
    const overflowed = [];
    let safetyMax = candidates.length;
    while (safetyMax-- > 0) {
      const dockLeft = dock.getBoundingClientRect().left;
      const remaining = eligible.length - overflowed.length;
      if (dockLeft >= minLeft || remaining <= 3) break;

      const victim = candidates[candidates.length - 1 - overflowed.length];
      if (!victim) break;
      victim.element.style.display = 'none';
      victim.element.setAttribute('data-in-overflow', 'true');
      overflowed.push(victim);
      this._updateGroupVisibility();
    }

    // Step 4: Surface overflowed buttons inside the unified actions panel
    this.overflowToggles = overflowed;
    this._updateActionsOverflow();
    this._updateGroupVisibility();

    // Step 5: Keep any currently-open panel in sync with the (possibly changed) dock
    this._repositionOpenPanels();
  }

  _restoreOverflowToggles() {
    this.overflowToggles.forEach(({ element }) => {
      element.removeAttribute('data-in-overflow');
      const brandAttr = element.getAttribute('data-branding-enabled');
      element.style.display = (brandAttr === 'false') ? 'none' : 'flex';
    });
    this.overflowToggles = [];
  }

  _positionPanelBelowDock(panel, toggleKey) {
    const dock = document.getElementById('toggle-dock');
    if (!dock || !panel) return;
    const dockRect = dock.getBoundingClientRect();
    const panelRight = Math.round(window.innerWidth - dockRect.right);

    // JS is the single source of truth for all panel geometry.
    // Setting left:'auto' here cancels any CSS-set left (e.g. the ≤640px media
    // query) so the panel is always right-anchored to the dock, at every viewport.
    panel.style.top      = `${Math.round(dockRect.bottom + 8)}px`;
    panel.style.right    = `${panelRight}px`;
    panel.style.left     = 'auto';
    panel.style.minWidth = `${Math.round(dockRect.width)}px`;

    // Arrow caret: point to the centre of the toggle button
    const btn = toggleKey && this.toggles.get(toggleKey)?.element;
    if (btn) {
      const btnRect   = btn.getBoundingClientRect();
      const btnCenterX = btnRect.left + btnRect.width / 2;
      const arrowX    = dockRect.right - btnCenterX - 6; // 6 = half-arrow width
      panel.style.setProperty('--arrow-x', `${Math.max(8, Math.round(arrowX))}px`);
    }
  }

  /**
   * Re-run positioning for every currently-open dock panel.
   * Called at the end of every _doRecalculate() so resize / orientation change /
   * button-ready state changes always keep open panels in sync with the dock.
   */
  _repositionOpenPanels() {
    this.toggles.forEach((t, key) => {
      if (!this.state.get(key)) return;

      let panel = null;
      if (t.config.hasDockPanel) {
        panel = document.querySelector(`.dock-panel[data-toggle="${key}"]`);
      } else {
        const sel = t.config.overlaySelector || t.config.menuSelector;
        panel = sel
          ? document.querySelector(sel)
          : (t.config.targetElement ? document.getElementById(t.config.targetElement) : null);
      }

      if (panel) this._positionPanelBelowDock(panel, key);
    });
  }

  _updateGroupVisibility() {
    // No-op: groups removed, all buttons are direct children of dock
  }

  _bindResize() {
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.recalculate(), 100);
    });
    // Re-run after layout is fully painted so the logo pill is measurable
    requestAnimationFrame(() => requestAnimationFrame(() => this.recalculate()));
    window.addEventListener('load', () => this.recalculate(), { once: true });
  }

  _isConnected() {
    if (window.AuthModule?.isAuthenticated) return window.AuthModule.isAuthenticated();
    const keys = Object.keys(localStorage);
    const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (sbKey) { try { const d = JSON.parse(localStorage.getItem(sbKey)); return !!(d?.access_token || d?.user); } catch { return false; } }
    return false;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     UNIFIED ACTIONS PANEL — overflow section
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Sync the "Carte" overflow section inside #actions-panel with the current
   * set of overflowed dock buttons. Called after every layout recalculate.
   */
  _updateActionsOverflow() {
    const section   = document.getElementById('actions-overflow-section');
    const container = document.getElementById('actions-overflow-items');
    if (!section || !container) return;

    container.innerHTML = '';

    if (this.overflowToggles.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    this.overflowToggles.forEach(({ key, config }) => {
      const item = document.createElement('button');
      item.className = 'action-item';
      item.setAttribute('data-toggle-key', key);
      item.innerHTML = `
        <div class="action-item__icon"><i class="fas ${config.icon}" aria-hidden="true"></i></div>
        <span class="action-item__label">${config.label}</span>
      `;
      item.addEventListener('click', (e) => {
        // Stop propagation so the document-level "outside-click" listeners
        // registered by _bindToggleEvents don't see this event and immediately
        // close the panel we're about to open.
        e.stopPropagation();
        this.setState('actions', false);
        this._handleOverflowItem(key, config);
      });
      container.appendChild(item);
    });
  }

  _handleOverflowItem(key, config) {
    if (config.redirectUrl) { window.location.href = config.redirectUrl; return; }
    if (config.hasModal) {
      const id = config.modalSelector?.replace('#', '');
      if (id && window.ModalHelper) window.ModalHelper.open(id);
    } else {
      // For toggles whose action is owned by an external module that bound its
      // own click listener directly on the DOM button (e.g. GeolocationModule on
      // #location-toggle), calling this.toggle() only flips ARIA state without
      // triggering the real action. Clicking the button programmatically is the
      // correct way to fire all registered listeners, including the module's own.
      const t = this.toggles.get(key);
      if (t) t.element.click();
    }
  }

  _closeAllMenus() {
    document.querySelectorAll('.dock-panel.dock-panel--open').forEach(el => {
      el.classList.remove('dock-panel--open');
    });
    this.toggles.forEach((t, key) => {
      if (t.config.hasMenu || t.config.hasDockPanel) {
        this.state.set(key, false);
        t.element.setAttribute('aria-expanded', 'false');
        t.element.setAttribute('aria-pressed', 'false');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LEGACY COMPAT
     ═══════════════════════════════════════════════════════════════════════ */

  toggleSimpleVisibility(key, config) { this.setVisible(key, true); }
  recalculatePositions() { this.recalculate(); }
  triggerRecalculate() { requestAnimationFrame(() => this.recalculate()); }
  validateToggleElements() { return true; }

  /* ═══════════════════════════════════════════════════════════════════════
     DESTROY
     ═══════════════════════════════════════════════════════════════════════ */

  destroy() {
    this.toggles.clear();
    this.state.clear();
    this.listeners.clear();
    this.initialized = false;
  }
}

// Singleton
export const toggleManager = new ToggleManager();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => toggleManager.init());
} else {
  toggleManager.init();
}

window.toggleManager = toggleManager;
window.TOGGLES_CONFIG = TOGGLES_CONFIG;
