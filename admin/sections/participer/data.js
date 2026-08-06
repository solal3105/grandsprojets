/* ============================================================================
   ADMIN Participer - référentiel partagé de la section

   Catégories et statuts de la ville active, chargés une fois par ville et
   partagés entre la file, le détail et la configuration, plus les petits
   builders HTML communs (pill de statut, chip de catégorie).
   ============================================================================ */

import * as api from '../../api.js';
import { esc } from '../../components/ui.js';

// Statuts qui clôturent un signalement (miroir de participer-common.mjs côté serveur)
export const STATUTS_CLOS = ['resolu', 'rejete', 'hors_competence', 'doublon'];

/* Les couleurs sont des DONNÉES (colonne `color`) : ces deux valeurs ne sont
   que les replis quand la base ne dit rien, alignés sur les défauts SQL. */
export const COULEUR_DEFAUT = '#14AE5C';
const COULEUR_NEUTRE = '#6B7280';

export const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : COULEUR_NEUTRE);

let _ref = { city: null, categories: [], statuts: [] };

/** Catégories + statuts de la ville, mémorisés jusqu'au changement de ville. */
export async function loadRefData(city, { force = false } = {}) {
  if (!force && _ref.city === city) return _ref;
  const [categories, statuts] = await Promise.all([
    api.getParticiperCategories(),
    api.getParticiperStatuts(),
  ]);
  _ref = { city, categories, statuts };
  return _ref;
}

export function invalidateRefData() {
  _ref = { city: null, categories: [], statuts: [] };
}

export const catOf = (ref, key) => ref.categories.find((c) => c.category_key === key) || null;
export const stOf = (ref, key) => ref.statuts.find((s) => s.statut_key === key) || null;

/** Pill de statut (pattern badge du design system, couleur du statut). */
export function statutPill(ref, statutKey) {
  const st = stOf(ref, statutKey);
  const color = safeColor(st?.color);
  return `<span class="ptadm-pill" style="--ptadm-color:${color}">${esc(st?.label || statutKey)}</span>`;
}

/** Chip de catégorie avec son icône. */
export function categoryChip(ref, categoryKey) {
  const cat = catOf(ref, categoryKey);
  const color = safeColor(cat?.color);
  return `<span class="ptadm-cat" style="--ptadm-color:${color}"><i class="${esc(cat?.icon_class || 'fa-solid fa-circle-exclamation')}"></i> ${esc(cat?.label || categoryKey)}</span>`;
}

/**
 * En-tête commun des sous-pages de configuration, sur le patron des autres
 * formulaires admin (cw-header + cw-back-link).
 */
export function subPageHeader({ title, subtitle, action = '' }) {
  return `
    <div class="cw-header">
      <div class="cw-header__top">
        <a href="/admin/participer/" class="cw-back-link" data-section="participer">
          <i class="fa-solid fa-arrow-left"></i><span>Participer</span>
        </a>
      </div>
      <div class="cw-header__main">
        <div class="cw-header__text">
          <h1 class="cw-header__title">${esc(title)}</h1>
          <p class="cw-header__subtitle">${esc(subtitle)}</p>
        </div>
        ${action}
      </div>
    </div>`;
}
