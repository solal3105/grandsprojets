/* ============================================================================
   ADMIN - Section Participer (signalements citoyens) - point d'entrée

   Routes :
     /admin/participer/             file de traitement (admin + contributeur)
     /admin/participer/config/      réglages du module (admin)
     /admin/participer/categories/  catégories de signalement (admin)
     /admin/participer/statuts/     affichage des statuts (admin)

   Le gros de la section vit dans le sous-dossier participer/ (modèle
   diagnostic) : list.js, detail.js, config.js, data.js.
   ============================================================================ */

import { store } from '../store.js';
import { renderList } from './participer/list.js';
import { renderConfig, renderCategoriesAdmin, renderStatutsAdmin } from './participer/config.js';

export async function renderParticiper(container, params) {
  /* Gate in-render (pattern diagnostic.js) : la file contient des données
     personnelles de citoyens - le masquage du menu ne suffit pas, et la RLS
     reste la barrière finale. */
  if (!store.isAdmin && !store.isInvited) {
    container.innerHTML = `
      <div class="adm-empty">
        <div class="adm-empty__icon"><i class="fa-solid fa-lock"></i></div>
        <div class="adm-empty__title">Accès réservé</div>
        <div class="adm-empty__text">Cette section est réservée à l'équipe de la collectivité.</div>
      </div>`;
    return;
  }

  const sub = params?.id || null;
  if (sub === 'config') return renderConfig(container);
  if (sub === 'categories') return renderCategoriesAdmin(container);
  if (sub === 'statuts') return renderStatutsAdmin(container);
  return renderList(container);
}
