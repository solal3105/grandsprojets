<template>
  <!-- La couverture d'un guide : son titre, en grand, sur un aplat de couleur.
       C'est le titre lui-meme qui illustre l'article, il n'y a donc pas d'image
       a produire quand on en publie un nouveau. -->
  <div class="relative flex items-end overflow-hidden" :class="teinte.fond">
    <!-- Une photo posee dans src/assets/ressources/ est reprise ici, choisie de
         facon stable a partir du slug. Tant que le dossier est vide, l'aplat
         de couleur tient le role tout seul. -->
    <img
      v-if="photo"
      :src="photo" alt="" aria-hidden="true"
      class="absolute inset-0 w-full h-full object-cover"
      loading="lazy" decoding="async"
    />
    <!-- Le voile garantit le contraste du titre, quelle que soit la photo. -->
    <span
      class="absolute inset-0"
      :class="photo
        ? 'bg-gradient-to-t from-dark/90 via-dark/55 to-dark/15'
        : 'bg-gradient-to-br from-white/15 to-transparent'"
    />

    <div class="relative w-full" :class="interieur">
      <slot name="avant" />
      <span
        v-if="tag"
        class="inline-block mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75"
      >{{ tag }}</span>
      <component
        :is="niveau"
        class="font-heading font-bold text-white leading-[1.12] tracking-tight text-balance"
        :class="taille"
      >{{ titre }}</component>
      <slot name="apres" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  titre: { type: String, required: true },
  slug: { type: String, required: true },
  tag: { type: String, default: '' },
  teinte: { type: Object, required: true },
  // La liste porte des h2, la page d'article porte son h1 ailleurs : le niveau
  // se choisit au montage plutot que d'imposer un titre de plus.
  niveau: { type: String, default: 'h2' },
  // Le rang dans la liste fait tourner les photos : deux cartes voisines ne
  // tombent jamais sur la meme. Sans rang, le slug decide.
  rang: { type: Number, default: null },
  // La liste garde la couverture serree, la page d'article l'etale dans le
  // conteneur du site : seul l'habillage interieur change.
  interieur: { type: String, default: 'p-7 sm:p-8' },
  // Une couverture de carte et une ouverture d'article ne portent pas le titre
  // dans le meme corps : la premiere s'aligne sur ses voisines, la seconde
  // ouvre une page.
  echelle: { type: String, default: 'carte' },
})

/* Les photos sont facultatives : le glob renvoie un objet vide tant que le
 * dossier n'existe pas, et la couverture reste un aplat. */
const photos = Object.values(
  import.meta.glob('../assets/ressources/*.{jpg,jpeg,png,webp,avif}', { eager: true, import: 'default' })
)

const photo = computed(() => {
  if (!photos.length) return null
  if (props.rang !== null) return photos[props.rang % photos.length]
  let h = 0
  for (const c of props.slug) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return photos[h % photos.length]
})

// Un titre court respire, un titre long doit tenir dans la meme boite.
const taille = computed(() => {
  const n = props.titre.length
  if (props.echelle === 'article') {
    if (n < 46) return 'text-[34px] sm:text-[52px]'
    if (n < 70) return 'text-[30px] sm:text-[44px]'
    return 'text-[26px] sm:text-[38px]'
  }
  if (n < 46) return 'text-[30px] sm:text-[34px]'
  if (n < 70) return 'text-[25px] sm:text-[28px]'
  return 'text-[22px] sm:text-[24px]'
})
</script>
