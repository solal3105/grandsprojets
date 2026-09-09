import { ref } from 'vue'

/* Qui voit le tarif exact sur l'estimateur.
 *
 * Par défaut, la page et le document montrent une fourchette, et le tarif
 * exact se demande : le visiteur laisse son adresse (fonction /api/tarif-lead),
 * l'équipe le rappelle. Rien ne se déverrouille à l'écran pour lui.
 *
 * L'équipe commerciale, elle, ouvre la page avec `?commercial=1` : le tarif
 * exact s'affiche, l'accès est retenu dans ce navigateur (le document
 * d'estimation et les visites suivantes le gardent), et le paramètre est
 * retiré de l'adresse aussitôt lu. Un lien copié ensuite pour un prospect ne
 * le transporte pas : le prospect retrouve la fourchette chez lui.
 *
 * Ce n'est pas un secret : la grille est publique dans le code. C'est une
 * règle de présentation, le prix s'annonce dans un échange. */

const CLE = 'op_tarif_exact'
export const PARAM_COMMERCIAL = 'commercial'

function lire() {
  try { return localStorage.getItem(CLE) === '1' } catch { return false }
}

const exact = ref(lire())

function accorder() {
  exact.value = true
  try { localStorage.setItem(CLE, '1') } catch { /* navigation privée : l'accès vaut pour la page ouverte */ }
}

/* `?commercial=0` : revenir à ce que voit un visiteur, pour vérifier la page
 * publique depuis le même navigateur */
function retirer() {
  exact.value = false
  try { localStorage.removeItem(CLE) } catch { /* rien à retirer */ }
}

export function useTarifExact(route, router) {
  const demande = route.query[PARAM_COMMERCIAL]
  if (demande === '1' || demande === '0') {
    if (demande === '1') accorder()
    else retirer()
    const query = { ...route.query }
    delete query[PARAM_COMMERCIAL]
    router.replace({ query })
  }
  return exact
}
