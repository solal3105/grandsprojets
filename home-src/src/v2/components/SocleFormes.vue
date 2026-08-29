<template>
  <!-- Le decor du socle : une grande forme et un anneau, en blanc a peine
       pose sur la couleur. Le vocabulaire est le meme pour les cinq modules,
       seule la figure change : cercle, barre, triangle, arche, etoile. Elles
       sont dessinees au trait epais avec des jonctions arrondies, c'est ce qui
       leur donne l'arrondi Bauhaus sans dessiner chaque angle.

       Le conteneur decoupe a la forme du socle, mais il est distinct de
       l'ecran : la capture, elle, peut continuer a en sortir. -->
  <span class="formes" :class="{ 'formes--bande': compact }" aria-hidden="true">
    <svg class="forme forme--grande" viewBox="0 0 100 100">
      <circle v-if="forme === 'cercle'" cx="50" cy="50" r="40" />
      <rect v-else-if="forme === 'barre'" x="6" y="36" width="88" height="28" rx="14" />
      <polygon v-else-if="forme === 'triangle'" points="50,14 88,80 12,80" />
      <path v-else-if="forme === 'arche'" d="M12 78 A38 38 0 0 1 88 78 Z" />
      <polygon v-else-if="forme === 'etoile'" :points="etoileSixBranches" />
    </svg>

    <svg class="forme forme--anneau" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="38" />
    </svg>
  </span>
</template>

<script setup>
defineProps({
  forme: { type: String, required: true },
  // En bande, la figure se cale sur la hauteur : dans une ligne de sommaire,
  // une taille en pourcentage de largeur donnerait une forme demesuree.
  compact: { type: Boolean, default: false },
})

/* Etoile a six branches : six pointes et six creux alternes sur le meme
 * centre. Calcule une fois plutot que douze paires de coordonnees ecrites a la
 * main, qu'on ne saurait plus relire. */
const etoileSixBranches = Array.from({ length: 12 }, (_, i) => {
  const rayon = i % 2 === 0 ? 42 : 21
  const angle = (Math.PI / 6) * i - Math.PI / 2
  return `${(50 + rayon * Math.cos(angle)).toFixed(1)},${(50 + rayon * Math.sin(angle)).toFixed(1)}`
}).join(' ')
</script>

<style scoped>
.formes {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.forme {
  position: absolute;
  overflow: visible;
  fill: rgba(255, 255, 255, 0.17);
  stroke: rgba(255, 255, 255, 0.17);
  /* Le trait epais a jonctions arrondies EST l'arrondi des angles. */
  stroke-width: 12;
  stroke-linejoin: round;
  will-change: transform;
}

/* La grande forme est le plan le plus lointain : elle retarde plus que le
   socle. L'anneau devance le socle. Entre les deux, l'ecran. */
.forme--grande {
  top: -24%;
  right: -20%;
  width: 76%;
  height: auto;
  aspect-ratio: 1;
  transform: translate3d(0, calc(var(--p, 0) * 130px), 0) rotate(calc(var(--p, 0) * 10deg));
}

.forme--anneau {
  bottom: -16%;
  left: -9%;
  width: 36%;
  height: auto;
  aspect-ratio: 1;
  fill: none;
  stroke: rgba(255, 255, 255, 0.24);
  stroke-width: 9;
  transform: translate3d(0, calc(var(--p, 0) * -70px), 0);
}

/* Variante bande : meme vocabulaire, taille prise sur la hauteur de la ligne
   et figures largement recadrees par ses bords. */
.formes--bande .forme--grande {
  top: 50%;
  right: 3%;
  width: auto;
  height: 300%;
  transform: translate3d(0, -50%, 0) rotate(-8deg);
}
.formes--bande .forme--anneau {
  bottom: auto;
  top: 50%;
  left: 1%;
  width: auto;
  height: 190%;
  transform: translate3d(0, -50%, 0);
}

@media (prefers-reduced-motion: reduce) {
  .forme { transform: none; }
  .formes--bande .forme--grande,
  .formes--bande .forme--anneau { transform: translate3d(0, -50%, 0); }
}
</style>
