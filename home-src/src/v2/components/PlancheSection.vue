<template>
  <!-- Une planche : du texte d'un cote, une capture posee sur un socle de la
       couleur du module de l'autre. C'est la composition de l'accueil, reprise
       telle quelle dans les pages module pour que les deux se repondent.

       Le texte est fourni par l'appelant : cette planche ne sait que composer,
       elle ne decide jamais de ce qui est dit. -->
  <section class="planche py-16 sm:py-20 bg-white" :id="ancre">
    <div class="max-w-container mx-auto px-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div class="colonne" :class="inverse ? 'lg:order-2' : ''">
          <slot />
        </div>

        <!-- La couleur du module ne teinte que ce bloc : le texte reste sur
             blanc, et la capture claire se detache d'un socle profond. Le socle
             deborde vers le bord de la page, l'ecran a l'air de continuer
             au-dela.

             Trois plans glissent en sens inverse pendant tout le defilement :
             la figure retarde le plus, le socle suit, l'ecran devance. -->
        <figure
          class="socle relative rounded-[28px] px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12"
          :class="[tone.socle, inverse ? 'lg:order-1 lg:-ml-16 xl:-ml-24' : 'lg:-mr-16 xl:-mr-24']"
        >
          <SocleFormes :forme="forme" />
          <span class="absolute inset-0 rounded-[28px] bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
          <img
            :src="`${base}${capture.src}`"
            :alt="capture.alt"
            :width="capture.largeur" :height="capture.hauteur"
            loading="lazy" decoding="async"
            class="ecran relative w-full rounded-xl bg-white shadow-capture"
          />
        </figure>
      </div>
    </div>
  </section>
</template>

<script setup>
import SocleFormes from './SocleFormes.vue'

defineProps({
  tone: { type: Object, required: true },
  forme: { type: String, required: true },
  capture: { type: Object, required: true },
  // Une planche sur deux inverse le texte et l'image : sans cette alternance,
  // une suite de planches se lit comme une liste.
  inverse: { type: Boolean, default: false },
  ancre: { type: String, default: undefined },
})

const base = import.meta.env.BASE_URL
</script>

<style scoped>
.planche {
  --p: 0;
  --c: 0;
  /* Amplitude des trois plans. Sur un ecran large, le socle fait 500 pixels de
     haut et la capture peut le deborder franchement. Sur un telephone, texte et
     capture sont empiles et le socle ne fait guere plus que l'image : les memes
     valeurs sortaient la capture entierement de son cadre pendant le
     defilement. Le mouvement y est donc reduit, et la capture ne bascule pas. */
  --socle-y: 24px;
  --colonne-y: 0px;
  --ecran-y: -36px;
  --ecran-rx: 0deg;
  /* La capture sort de son socle par le haut et par le bas : seule la largeur
     est coupee, sinon le debordement lateral des socles creerait une barre de
     defilement horizontale. `clip` est la seule valeur qui laisse l'autre axe
     visible. */
  overflow-x: clip;
  overflow-y: visible;
}
@media (min-width: 1024px) {
  .planche { --socle-y: 96px; --colonne-y: -34px; --ecran-y: -122px; --ecran-rx: 3.4deg; }
}

.socle {
  transform: translate3d(0, calc(var(--p) * var(--socle-y)), 0);
  will-change: transform;
}
.colonne {
  transform: translate3d(0, calc(var(--p) * var(--colonne-y)), 0);
  will-change: transform;
}
.ecran {
  transform:
    perspective(1400px)
    translate3d(0, calc(var(--p) * var(--ecran-y)), 0)
    rotateX(calc(var(--p) * var(--ecran-rx)))
    scale(calc(0.93 + var(--c) * 0.07));
  transform-origin: 50% 50%;
  will-change: transform;
  transition: box-shadow .5s ease;
}
.socle:hover .ecran {
  box-shadow: 0 44px 90px -20px rgba(0, 0, 0, 0.30), 0 12px 30px -10px rgba(0, 0, 0, 0.14);
}

@media (prefers-reduced-motion: reduce) {
  .socle, .colonne, .ecran { transform: none; }
}
</style>
