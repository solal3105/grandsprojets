import CarteLive from './CarteLive.vue'
import TravauxLive from './TravauxLive.vue'
import ParticiperLive from './ParticiperLive.vue'
import DiagnosticShowcase from './DiagnosticShowcase.vue'

/* Ce que la vitrine montre pour chaque module.
 *
 * Trois modules sont montres EN DIRECT : l'outil lui-meme, dans une iframe
 * ouverte sur le bon module par ?module=. Rien a maintenir, rien qui puisse
 * diverger du produit.
 *
 * Le Diagnostic ne peut pas l'etre : il vit dans l'admin, derriere
 * authentification. C'est le seul qui reste une reproduction. */
export const showcases = {
  carte: CarteLive,
  travaux: TravauxLive,
  participer: ParticiperLive,
  diagnostic: DiagnosticShowcase,
}
