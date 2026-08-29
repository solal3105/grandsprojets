import CarteLive from './CarteLive.vue'
import TravauxLive from './TravauxLive.vue'
import ParticiperLive from './ParticiperLive.vue'
import ChantiersShowcase from './ChantiersShowcase.vue'
import DiagnosticShowcase from './DiagnosticShowcase.vue'

/* Ce que la vitrine montre pour chaque module.
 *
 * Quatre modules sont montres EN DIRECT : l'outil lui-meme, dans une iframe.
 * Trois ouvrent une ville de demonstration sur le bon module par ?module=,
 * Chantiers ouvre son espace de travail, dont l'accueil propose une
 * demonstration sans compte. Rien a maintenir, rien qui puisse diverger du
 * produit.
 *
 * Le Diagnostic ne peut pas l'etre, et sa vitrine le dit au lieu de le laisser
 * croire : il vit dans l'admin, derriere un compte. C'est une reproduction. */
export const showcases = {
  carte: CarteLive,
  travaux: TravauxLive,
  participer: ParticiperLive,
  chantiers: ChantiersShowcase,
  diagnostic: DiagnosticShowcase,
}
