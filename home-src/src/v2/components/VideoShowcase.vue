<template>
  <!-- La vidéo de présentation, à la place de l'outil en direct.
       Rien n'est chargé avant le clic : l'affiche est une image légère, la
       vidéo n'est demandée qu'au moment où le visiteur veut la voir, et le
       serveur la sert par morceaux (lecture immédiate, sans attendre la fin
       du téléchargement).
       Les moteurs ne regardent pas une vidéo : ils lisent les données
       structurées VideoObject posées dans la page et la transcription, qui
       est le texte dit, mot pour mot. -->
  <figure class="max-w-[896px] mx-auto">
    <div class="video-cadre">
      <video
        v-if="lecture"
        ref="lecteur"
        class="video-lecteur"
        :src="src"
        :poster="poster"
        controls
        autoplay
        playsinline
        preload="metadata"
        :title="videoPresentation.nom"
        @ended="lecture = false"
      />
      <button
        v-else
        type="button"
        class="video-affiche group"
        :aria-label="`Lancer la vidéo : ${videoPresentation.nom} (${dureeLisible})`"
        @click="lancer"
      >
        <img :src="poster" :alt="videoPresentation.description" width="1920" height="1080" fetchpriority="high" decoding="async" />
        <span class="video-bouton">
          <span class="video-rond"><Play class="w-7 h-7 fill-current" /></span>
          <span class="video-libelle">Regarder la présentation <span class="video-duree">{{ dureeLisible }}</span></span>
        </span>
      </button>
    </div>

    <figcaption class="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 text-[13px] text-gray-text">
      <span>Cinq modules, un seul projet suivi de l'annonce au bilan. Sous-titres inclus.</span>
      <button type="button" class="video-transcription-lien" :aria-expanded="transcriptionOuverte" @click="transcriptionOuverte = !transcriptionOuverte">
        <FileText class="w-3.5 h-3.5" />
        {{ transcriptionOuverte ? 'Masquer la transcription' : 'Lire la transcription' }}
      </button>
    </figcaption>

    <!-- La transcription reste dans la page, repliée : les moteurs la lisent
         dans les deux cas, le visiteur ne la voit que s'il la demande. -->
    <div v-show="transcriptionOuverte" class="video-transcription">
      <p v-for="(p, i) in videoPresentation.transcription" :key="i">{{ p }}</p>
    </div>
  </figure>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Play, FileText } from 'lucide-vue-next'
import { videoPresentation, videoUrl, afficheUrl } from '../data/videoPresentation.js'

/* Les fichiers sont à la racine du site, pas dans le dossier de la page. */
const src = videoPresentation.fichier
const poster = videoPresentation.affiche

const lecture = ref(false)
const lecteur = ref(null)
const transcriptionOuverte = ref(false)

const dureeLisible = computed(() => {
  const m = Math.floor(videoPresentation.duree / 60), s = Math.round(videoPresentation.duree % 60)
  return `${m} min ${String(s).padStart(2, '0')}`
})

const lancer = () => {
  lecture.value = true
  window.OPAnalytics?.capture?.('video_presentation_lancee', { duree: videoPresentation.duree })
}

/* Durée au format ISO 8601, celui que les données structurées attendent. */
const dureeIso = () => {
  const m = Math.floor(videoPresentation.duree / 60), s = Math.round(videoPresentation.duree % 60)
  return `PT${m}M${s}S`
}

/* Les données structurées sont posées à l'arrivée et retirées au départ :
   une seule page porte cette vidéo. */
let balise = null
onMounted(() => {
  balise = document.createElement('script')
  balise.type = 'application/ld+json'
  balise.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: videoPresentation.nom,
    description: videoPresentation.description,
    thumbnailUrl: [afficheUrl()],
    uploadDate: videoPresentation.publieLe,
    duration: dureeIso(),
    contentUrl: videoUrl(),
    inLanguage: 'fr-FR',
    transcript: videoPresentation.transcription.join('\n\n'),
    publisher: { '@type': 'Organization', name: 'Open Projets', url: 'https://openprojets.com/home/' },
  })
  document.head.appendChild(balise)
})
onUnmounted(() => { balise?.remove(); balise = null })
</script>

<style scoped>
.video-cadre {
  position: relative; aspect-ratio: 16 / 9; border-radius: 18px; overflow: hidden; background: #0A0A0E;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 22px 60px -30px rgba(0, 0, 0, 0.45), 0 4px 16px -8px rgba(0, 0, 0, 0.08);
}
.video-lecteur { display: block; width: 100%; height: 100%; }
.video-affiche { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: pointer; position: relative; }
.video-affiche img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
.video-affiche:hover img { transform: scale(1.02); }
.video-affiche::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(10, 10, 14, 0.55) 0%, rgba(10, 10, 14, 0) 45%);
}
.video-bouton {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 1;
  display: flex; flex-direction: column; align-items: center; gap: 14px; color: #fff;
}
.video-rond {
  display: inline-flex; align-items: center; justify-content: center; width: 84px; height: 84px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(12px); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s;
}
.video-affiche:hover .video-rond, .video-affiche:focus-visible .video-rond { transform: scale(1.08); background: rgba(255, 255, 255, 0.24); }
.video-affiche:focus-visible { outline: 3px solid #FF0037; outline-offset: -3px; }
.video-libelle { font-size: 15px; font-weight: 500; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6); }
.video-duree { margin-left: 6px; padding: 2px 9px; border-radius: 999px; background: rgba(255, 255, 255, 0.16); font-size: 12px; }
.video-transcription-lien { display: inline-flex; align-items: center; gap: 6px; color: #C4002A; font-weight: 500; background: none; border: 0; padding: 0; cursor: pointer; }
.video-transcription-lien:hover { text-decoration: underline; }
.video-transcription { margin-top: 16px; padding: 20px 24px; border-radius: 14px; background: #fff; border: 1px solid rgba(0, 0, 0, 0.08); font-size: 14px; line-height: 1.65; color: #555; }
.video-transcription p + p { margin-top: 12px; }
</style>
