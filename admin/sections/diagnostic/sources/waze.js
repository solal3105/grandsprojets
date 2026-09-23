/**
 * Diagnostic terrain - Waze for Cities (côté navigateur).
 * La collectivité colle le lien de son flux partenaire ; le relais serveur
 * (/api/sources/waze) le lit. Deux couches « url », rechargées à chaque
 * ouverture du diagnostic : alertes (points) et ralentissements (lignes).
 *
 * Sémantique du flux (spécification Waze Data Feed, aide Waze Partners) : le
 * retard d'un ralentissement est donné en secondes par rapport à la vitesse
 * libre, et vaut -1 quand la circulation est bloquée.
 */

import { store } from '../../../store.js';
import { SESSION_EXPIRED } from '../data.js';

/**
 * Chiffres de zone de chaque partie du flux, avec le libellé et l'unité que
 * le dossier affiche. Le nombre d'alertes n'y figure pas : aucune agrégation
 * « nombre » n'existe dans aggregateMetrics. La longueur des bouchons non
 * plus : leurs tracés sont coupés à la limite de la zone alors que la
 * longueur publiée par Waze est celle du bouchon entier, leur somme serait fausse.
 */
export const WAZE_METRICS = {
  alerts: [
    { field: 'confirmations', agg: 'sum', label: 'Confirmations des conducteurs', unit: 'confirmations' },
  ],
  jams: [
    { field: 'retard_s', agg: 'mean', min: 0, label: 'Retard moyen', unit: 'secondes' },
    { field: 'vitesse_kmh', agg: 'mean', label: 'Vitesse moyenne', unit: 'km/h' },
  ],
};

/** Partie du flux lue par une couche : 'alerts' ou 'jams'. */
export function wazePart(layer) {
  return /[?&]part=jams(&|$)/.test(String(layer?.source_ref || '')) ? 'jams' : 'alerts';
}

/** Adresse relayée d'une partie du flux, telle qu'enregistrée dans la couche. */
export function wazeLayerUrl(feedUrl, part, city = store.city) {
  return '/api/sources/waze?' + new URLSearchParams({ ville: city || '', feed: feedUrl, part });
}

/** Valide un lien de flux : nombre d'alertes et de ralentissements du moment. */
export async function checkWazeFeed(feedUrl, city = store.city) {
  const url = '/api/sources/waze?' + new URLSearchParams({ ville: city || '', feed: feedUrl, mode: 'check' });
  let res;
  try {
    res = await fetch(url, {
      headers: store.session?.access_token ? { Authorization: `Bearer ${store.session.access_token}` } : {},
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError'
      ? 'Le flux Waze a mis trop de temps à répondre. Réessayez dans quelques instants.'
      : 'La vérification n\'a pas pu joindre nos services. Vérifiez votre connexion, puis réessayez.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error(SESSION_EXPIRED);
  if (!res.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : `La vérification a échoué (erreur ${res.status}). Réessayez dans quelques minutes.`);
  return { alerts: Number(data.alerts) || 0, jams: Number(data.jams) || 0 };
}

/** Les deux couches d'un flux Waze. */
export function wazeLayerCfgs(feedUrl, city = store.city) {
  return [
    {
      part: 'alerts',
      source_ref: wazeLayerUrl(feedUrl, 'alerts', city),
      cfg: {
        label: 'Alertes Waze',
        group_label: 'Circulation',
        kind: 'reference',
        style: { mode: 'category', color: '#0EA5E9', category_field: 'type', radius: 5 },
        popup: { title_field: 'type', fields: ['precision', 'rue', 'commune', 'description', 'confirmations', 'signale_le'] },
        metrics: WAZE_METRICS.alerts.map((m) => ({ ...m })),
        ai_context: 'Alertes signalées en temps réel par les conducteurs Waze (accidents, dangers, routes fermées, embouteillages), flux Waze for Cities de la collectivité, telles qu\'au moment de l\'ouverture du diagnostic',
        default_on: true,
      },
    },
    {
      part: 'jams',
      source_ref: wazeLayerUrl(feedUrl, 'jams', city),
      cfg: {
        label: 'Ralentissements Waze',
        group_label: 'Circulation',
        kind: 'reference',
        style: { mode: 'graduated', color: '#DC2626', value_field: 'retard_s', radius: 3 },
        popup: { title_field: 'rue', fields: ['commune', 'vitesse_kmh', 'retard_s', 'longueur_m', 'niveau'] },
        metrics: WAZE_METRICS.jams.map((m) => ({ ...m })),
        ai_context: 'Ralentissements mesurés en temps réel par Waze (vitesse, retard en secondes, longueur du bouchon entier, circulation bloquée signalée comme telle), flux Waze for Cities de la collectivité, tels qu\'au moment de l\'ouverture du diagnostic',
        default_on: true,
      },
    },
  ];
}

/**
 * Chiffres de zone d'une couche Waze enregistrée avant ces réglages : la base
 * garde des chiffres sans libellé ni unité et une longueur additionnée à tort.
 * On les lit comme ceux d'une couche ajoutée aujourd'hui, sans réécrire la
 * base ; un libellé saisi par l'administrateur est conservé.
 */
export function upgradeWazeMetrics(layer) {
  const defaults = WAZE_METRICS[wazePart(layer)];
  const saved = Array.isArray(layer?.popup?.metrics) ? layer.popup.metrics : [];
  return saved
    .filter((m) => m && m.field !== 'longueur_m')
    .map((m) => {
      const known = defaults.find((d) => d.field === m.field && d.agg === m.agg);
      if (!known) return m;
      const out = { ...m };
      if (!out.label) out.label = known.label;
      if (!out.unit) out.unit = known.unit;
      if (known.min !== undefined && !Number.isFinite(out.min)) out.min = known.min;
      return out;
    });
}
