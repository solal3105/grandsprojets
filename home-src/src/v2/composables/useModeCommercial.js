import { ref } from 'vue'

/* Le mode commercial de l'estimateur.
 *
 * Les prix sont exacts pour tout le monde. Le mode commercial n'ouvre plus
 * que l'outil de l'équipe : le document d'estimation à préparer pour une
 * collectivité, avec son destinataire et notre numéro de suivi.
 *
 * L'équipe ouvre la page avec `?commercial=1` : le mode est retenu dans ce
 * navigateur, et le paramètre est retiré de l'adresse aussitôt lu, pour qu'un
 * lien copié ne le transporte pas. `?commercial=0` le retire. La clé garde son
 * ancien nom, pour les navigateurs de l'équipe qui l'ont déjà. */

const CLE = 'op_tarif_exact'
export const PARAM_COMMERCIAL = 'commercial'

function lire() {
  try { return localStorage.getItem(CLE) === '1' } catch { return false }
}

const commercial = ref(lire())

function accorder() {
  commercial.value = true
  try { localStorage.setItem(CLE, '1') } catch { /* navigation privée : le mode vaut pour la page ouverte */ }
}

function retirer() {
  commercial.value = false
  try { localStorage.removeItem(CLE) } catch { /* rien à retirer */ }
}

export function useModeCommercial(route, router) {
  const demande = route.query[PARAM_COMMERCIAL]
  if (demande === '1' || demande === '0') {
    if (demande === '1') accorder()
    else retirer()
    const query = { ...route.query }
    delete query[PARAM_COMMERCIAL]
    router.replace({ query })
  }
  return commercial
}
