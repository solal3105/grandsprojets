// modules/TravauxModule.js
void (() => {

  // ─── Constants ────────────────────────────────────────────────
  const LAYER_NAME = 'travaux';
  const TS_MIN = 0;              // sentinel: started in the distant past
  const TS_MAX = 9999999999999;  // sentinel: never ends
  const HISTOGRAM_BUCKETS = 60;
  // ─── Utilities ────────────────────────────────────────────────
  const parseTs = v => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  };
  const fmtShort = d => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  const fmtFull  = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  function getChantierDisplayName(props) {
    const p = props || {};
    return p.project_name || p.name || p.nature_travaux || p.nature || p.nature_chantier || '';
  }

  function inferChantierIdentity(props, feature) {
    const p = props || {};
    if (p.chantier_key != null && p.chantier_key !== '') return String(p.chantier_key);
    if (p.chantier_id != null && p.chantier_id !== '') return `chantier:${p.chantier_id}`;

    const candidates = [
      p.id,
      p.ID,
      p.objectid,
      p.OBJECTID,
      p.objectId,
      p.gid,
      p.GID,
      p.fid,
      p.FID,
      p.globalid,
      p.GLOBALID,
      feature?.id,
    ];

    for (const value of candidates) {
      if (value != null && value !== '') return `feature:${value}`;
    }
    return null;
  }

  function ensureFeatureKeys(features, sourceTag = 'travaux') {
    const list = Array.isArray(features) ? features : [];
    list.forEach((feature, index) => {
      if (!feature || typeof feature !== 'object') return;
      if (!feature.properties || typeof feature.properties !== 'object') feature.properties = {};
      const props = feature.properties;
      const identity = inferChantierIdentity(props, feature);
      props.chantier_key = identity ? `${sourceTag}:${identity}` : `${sourceTag}:auto:${index}`;
    });
    return list;
  }

  function normalizeGeoJSON(data, sourceTag = 'travaux') {
    if (!data || typeof data !== 'object') {
      return { type: 'FeatureCollection', features: [] };
    }
    if (Array.isArray(data)) {
      return { type: 'FeatureCollection', features: ensureFeatureKeys(data, sourceTag) };
    }
    if (data.type === 'Feature') {
      return { type: 'FeatureCollection', features: ensureFeatureKeys([data], sourceTag) };
    }
    if (data.type === 'FeatureCollection') {
      const features = Array.isArray(data.features) ? data.features : [];
      data.features = ensureFeatureKeys(features, sourceTag);
      return data;
    }
    return { type: 'FeatureCollection', features: [] };
  }

  // Add _ts_debut / _ts_fin to feature properties (idempotent)
  function enrichTimestamps(features) {
    for (const f of features) {
      const p = f.properties;
      if (p._ts_debut !== undefined) continue;
      p._ts_debut = parseTs(p.date_debut) ?? TS_MIN;
      p._ts_fin   = parseTs(p.date_fin)   ?? TS_MAX;
    }
  }

  // ─── Histogram ────────────────────────────────────────────────
  function computeHistogram(features, minTs, maxTs) {
    if (maxTs <= minTs) return Array.from({length: HISTOGRAM_BUCKETS}, () => 0);
    const step = (maxTs - minTs) / HISTOGRAM_BUCKETS;
    const counts = Array.from({length: HISTOGRAM_BUCKETS}, () => 0);
    for (const f of features) {
      const d = f.properties._ts_debut;
      const e = f.properties._ts_fin;
      const lo = Math.max(0, Math.floor((d - minTs) / step));
      const hi = Math.min(HISTOGRAM_BUCKETS - 1, Math.floor((e - minTs) / step));
      for (let i = lo; i <= hi; i++) counts[i]++;
    }
    return counts;
  }

  function renderHistogramSVG(container, counts) {
    if (!container) return;
    const peak = Math.max(...counts, 1);
    const bw = 100 / counts.length;
    const gap = bw * 0.15;
    const rects = counts.map((c, i) => {
      const h = (c / peak) * 100;
      return `<rect x="${i * bw + gap / 2}" y="${100 - h}" width="${bw - gap}" height="${h}" rx="0.5"/>`;
    }).join('');
    container.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${rects}</svg>`;
  }

  // ─── Local counting (no map query) ────────────────────────────
  function applyStructuralFilter(features, criteria) {
    return features.filter(f => {
      const p = f.properties;
      for (const [k, v] of Object.entries(criteria)) {
        if (k.startsWith('_')) continue;
        if (String(p[k] || '').toLowerCase() !== String(v).toLowerCase()) return false;
      }
      return true;
    });
  }

  function countAtTime(filtered, time) {
    let n = 0;
    for (const f of filtered) {
      const p = f.properties;
      if (p._ts_debut <= time && p._ts_fin >= time) n++;
    }
    return n;
  }

  // ─── MapLibre timeline filter (GPU-side, no layer rebuild) ────
  function buildTimelineExpr(ts) {
    return [
      'any',
      ['!', ['has', '_ts_debut']],
      ['all',
        ['<=', ['get', '_ts_debut'], ts],
        ['>=', ['get', '_ts_fin'], ts]
      ]
    ];
  }

  function setMapTimelineFilter(ts) {
    const mlMap = window.MapModule?.map?._mlMap || window.MapModule?.map;
    if (!mlMap || !L?._sourcePool) return;
    L._sourcePool.setFilter(mlMap, buildTimelineExpr(ts));
  }

  // ─── Unique sorted values with counts ─────────────────────────
  function uniqueSorted(features, key) {
    const counts = {};
    for (const f of features) {
      const v = f.properties[key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    const values = Object.keys(counts).sort((a, b) =>
      counts[b] - counts[a] || a.localeCompare(b, 'fr')
    );
    return { values, counts };
  }

  function optionsHTML(values, counts) {
    return values
      .map(v => `<option value="${v}">${v} (${counts[v]})</option>`)
      .join('');
  }


  // ─── Badges ───────────────────────────────────────────────────
  function renderBadges(container, criteria, els, onChange) {
    container.innerHTML = '';
    const labels = { nature_travaux: 'Nature', commune: 'Commune', etat: 'État' };
    for (const [key, val] of Object.entries(criteria)) {
      if (!val || key.startsWith('_')) continue;
      const badge = document.createElement('span');
      badge.className = 'travaux-badge';
      badge.tabIndex = 0;
      badge.role = 'button';
      const text = `${labels[key] || key}: ${val}`;
      badge.setAttribute('aria-label', `Retirer filtre ${text}`);
      badge.innerHTML = `${text} <i class='fa-solid fa-xmark'></i>`;
      const remove = () => {
        if (key === 'nature_travaux') {
          if (els.natureCtrl) els.natureCtrl.setValue('');
          else if (els.nature) els.nature.value = '';
        } else if (key === 'commune') {
          if (els.communeCtrl) els.communeCtrl.setValue('');
          else if (els.commune) els.commune.value = '';
        } else if (key === 'etat') {
          els.etat.value = '';
        }
        onChange();
      };
      badge.addEventListener('click', remove);
      badge.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') remove(); });
      container.appendChild(badge);
    }
    const visible = Object.entries(criteria).some(([k, v]) => v && !k.startsWith('_'));
    container.style.display = visible ? 'flex' : 'none';
  }


  // ─── Progress helpers (shared with DataModule) ─────────────────────────
  function safeDate(v) {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  }

  function calcProgress(dateDebut, dateFin) {
    const debut = safeDate(dateDebut);
    const fin   = safeDate(dateFin);
    if (!(debut && fin) || fin <= debut) return 0;
    return Math.max(0, Math.min(100, Math.round(((new Date() - debut) / (fin - debut)) * 100)));
  }

  function calcGradient(pct) {
    if (pct <= 50) {
      const r = (pct / 50) * 100;
      return `linear-gradient(90deg, var(--danger) 0%, var(--danger) ${100 - r}%, var(--warning) 100%)`;
    }
    const r = ((pct - 50) / 50) * 100;
    return `linear-gradient(90deg, var(--warning) 0%, var(--warning) ${100 - r}%, var(--success) 100%)`;
  }

  // API publique — utilities for NavPanel custom renderers
  window.TravauxModule = {
    LAYER_NAME,
    enrichTimestamps,
    uniqueSorted,
    optionsHTML,
    computeHistogram,
    renderHistogramSVG,
    applyStructuralFilter,
    countAtTime,
    setMapTimelineFilter,
    renderBadges,
    parseTs,
    fmtShort,
    fmtFull,
    buildTimelineExpr,
    safeDate,
    calcProgress,
    calcGradient,
    getChantierDisplayName,
    ensureFeatureKeys,
    normalizeGeoJSON,
  };
  return window.TravauxModule;
})();
