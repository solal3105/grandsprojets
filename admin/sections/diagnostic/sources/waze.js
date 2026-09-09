/**
 * Diagnostic terrain - Waze for Cities (côté navigateur).
 * La collectivité colle le lien de son flux partenaire ; le relais serveur
 * (/api/sources/waze) le lit. Deux couches « url », rechargées à chaque
 * ouverture du diagnostic : alertes (points) et ralentissements (lignes).
 */

import { store } from '../../../store.js';

/** Adresse relayée d'une partie du flux, telle qu'enregistrée dans la couche. */
export function wazeLayerUrl(feedUrl, part) {
  return '/api/sources/waze?' + new URLSearchParams({ ville: store.city || '', feed: feedUrl, part });
}

/** Valide un lien de flux : nombre d'alertes et de ralentissements du moment. */
export async function checkWazeFeed(feedUrl) {
  const url = '/api/sources/waze?' + new URLSearchParams({ ville: store.city || '', feed: feedUrl, mode: 'check' });
  const res = await fetch(url, {
    headers: store.session?.access_token ? { Authorization: `Bearer ${store.session.access_token}` } : {},
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Vérification impossible (HTTP ${res.status})`);
  return { alerts: Number(data.alerts) || 0, jams: Number(data.jams) || 0 };
}

/** Les deux couches d'un flux Waze. */
export function wazeLayerCfgs(feedUrl) {
  return [
    {
      part: 'alerts',
      source_ref: wazeLayerUrl(feedUrl, 'alerts'),
      cfg: {
        label: 'Alertes Waze',
        group_label: 'Circulation',
        kind: 'reference',
        style: { mode: 'category', color: '#0EA5E9', category_field: 'type', radius: 5 },
        popup: { title_field: 'type', fields: ['precision', 'rue', 'commune', 'description', 'confirmations', 'signale_le'] },
        metrics: [{ field: 'confirmations', agg: 'sum' }],
        ai_context: 'Alertes signalées en temps réel par les conducteurs Waze (accidents, dangers, routes fermées, embouteillages), flux Waze for Cities de la collectivité, telles qu\'au moment de l\'ouverture du diagnostic',
        default_on: true,
      },
    },
    {
      part: 'jams',
      source_ref: wazeLayerUrl(feedUrl, 'jams'),
      cfg: {
        label: 'Ralentissements Waze',
        group_label: 'Circulation',
        kind: 'reference',
        style: { mode: 'graduated', color: '#DC2626', value_field: 'retard_s', radius: 3 },
        popup: { title_field: 'rue', fields: ['commune', 'vitesse_kmh', 'retard_s', 'longueur_m', 'niveau'] },
        metrics: [{ field: 'retard_s', agg: 'mean' }, { field: 'vitesse_kmh', agg: 'mean' }, { field: 'longueur_m', agg: 'sum' }],
        ai_context: 'Ralentissements mesurés en temps réel par Waze (vitesse, retard, longueur), flux Waze for Cities de la collectivité, tels qu\'au moment de l\'ouverture du diagnostic',
        default_on: true,
      },
    },
  ];
}
