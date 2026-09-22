import { renderZoneFigure } from '../figure.js';
import { findingFigureKey, findingObservations, focusBounds } from './presentation.js';

/** Les zooms sont conservés avec la version, sans recharger les données sources. */
export async function prepareFindingFigures(dossier, { alive = () => true, progress = () => {}, render = renderZoneFigure } = {}) {
  if (!dossier.figures.cover?.url) return false;
  const pending = new Map();
  for (const finding of dossier.findings.filter((f) => f.kind === 'testimony')) {
    const key = findingFigureKey(dossier, finding);
    if (key && !dossier.figures[key]?.url) pending.set(key, focusBounds(findingObservations(dossier, finding).map((o) => o.point)));
  }
  let changed = false, current = 0;
  for (const [key, bounds] of pending) {
    if (!alive()) break;
    progress(++current, pending.size);
    const asset = await render({ polygon: dossier.zone.polygon, features: [], context: [] }, {
      layerIds: [], focusBounds: bounds, size: [640, 430], compact: true, asset: true, basemap: dossier.figures.cover.basemap || 'plan',
    });
    if (!alive()) break;
    if (asset?.url) { dossier.figures[key] = asset; changed = true; }
    // Un fond indisponible ne doit pas faire attendre huit secondes par constat.
    if (!asset?.url || asset.complete === false) break;
  }
  return changed;
}
