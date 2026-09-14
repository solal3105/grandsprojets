/**
 * Référencement : la partie sans écran.
 *
 * Tout ce qui se calcule ou se formule à partir des lignes de la vue
 * city_indexing_overview vit ici, sans DOM ni appel réseau, pour être testé
 * en pur JS (tests/admin.referencement.spec.js, section 19.3).
 *
 * Une ligne : { ville, brand_name, indexable, fiches_publiques,
 *               last_changed_at, last_changed_by_email }
 */

export const FILTERS = Object.freeze({ all: 'all', on: 'on', off: 'off' });

/** Minuscules, sans accents : la recherche ne dépend ni de la casse ni des accents. */
export function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Nom affiché d'un espace : son nom de marque, sinon son code. */
export function displayName(row) {
  return (row?.brand_name || '').trim() || row?.ville || '';
}

/**
 * Lignes triées par code, puis restreintes par l'onglet (proposés / retirés)
 * et par la recherche (nom ou code, casse et accents ignorés).
 */
export function filterSpaces(rows, { query = '', filter = FILTERS.all } = {}) {
  const q = normalize(query);
  return [...(rows || [])]
    .filter((r) => {
      if (filter === FILTERS.on && r.indexable === false) return false;
      if (filter === FILTERS.off && r.indexable !== false) return false;
      if (!q) return true;
      return normalize(r.ville).includes(q) || normalize(r.brand_name).includes(q);
    })
    .sort((a, b) => String(a.ville).localeCompare(String(b.ville), 'fr'));
}

/** Les quatre chiffres de tête : espaces et fiches, proposés ou retirés. */
export function summarize(rows) {
  const out = { proposes: 0, retires: 0, fichesProposees: 0, fichesRetirees: 0 };
  for (const r of rows || []) {
    const n = Number(r.fiches_publiques) || 0;
    if (r.indexable === false) { out.retires += 1; out.fichesRetirees += n; }
    else { out.proposes += 1; out.fichesProposees += n; }
  }
  return out;
}

export function stateLabel(indexable) {
  return indexable === false ? 'Retiré des moteurs' : 'Proposé aux moteurs';
}

/** Même idée, en minuscules, pour l'intérieur d'une phrase. */
export function changeLabel(indexable) {
  return indexable === false ? 'retiré des moteurs' : 'proposé aux moteurs';
}

export function fichesLabel(n) {
  const count = Number(n) || 0;
  if (count === 0) return 'Aucune fiche publique';
  if (count === 1) return '1 fiche publique';
  return `${count.toLocaleString('fr-FR')} fiches publiques`;
}

/** Qui a fait le changement : une adresse, sinon la base elle-même. */
export function authorLabel(email) {
  return email ? `par ${email}` : 'depuis la base';
}

/**
 * Textes du dialogue de confirmation : l'espace est nommé, la conséquence
 * aussi, et le bouton dit ce qui va se passer.
 */
export function confirmCopy(row, next) {
  const name = displayName(row);
  const n = Number(row?.fiches_publiques) || 0;
  if (next) {
    return {
      title: `Proposer ${name} aux moteurs de recherche ?`,
      message: n > 0
        ? `Sa page de ville et ses ${fichesLabel(n)} reviendront dans le plan du site et pourront apparaître dans les résultats de recherche.`
        : 'Sa page de ville reviendra dans le plan du site et pourra apparaître dans les résultats de recherche.',
      confirmLabel: 'Proposer aux moteurs',
    };
  }
  return {
    title: `Retirer ${name} des moteurs de recherche ?`,
    message: n > 0
      ? `Sa page de ville et ses ${fichesLabel(n)} sortiront du plan du site et signaleront aux moteurs qu'elles ne doivent plus apparaître dans les résultats. Elles restent consultables par lien.`
      : 'Sa page de ville sortira du plan du site et signalera aux moteurs qu\'elle ne doit plus apparaître dans les résultats. Elle reste consultable par lien.',
    confirmLabel: 'Retirer des moteurs',
  };
}
