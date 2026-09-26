# Vidéos du site

Une seule copie de chaque vidéo, à la racine du site, servie sous `/video/`.
Elles ne passent pas par le dossier public du site vitrine : ce dossier est
recopié dans le build committé de `/home/`, la vidéo y pèserait deux fois
dans le dépôt.

- `open-projets-presentation.mp4` : la présentation des cinq modules, 4 min 54
  (H.264 1080p à 1,6 Mbit/s au plus, 31 Mo, son AAC, en-tête en tête de
  fichier pour une lecture avant la fin du téléchargement ; la page ne la
  demande qu'au clic). Montée dans l'atelier
  `~/grandsprojets/video-open-projets-v9/`, hors dépôt ; ce fichier est
  produit par `tools/web.sh` de l'atelier depuis le rendu définitif.
- `open-projets-presentation.webp` : l'affiche, image du montage à la
  septième seconde.
- `open-projets-avant-apres.mp4` : la vidéo rétro « avant / après », 2 min
  (H.264 1080p à 30 i/s, crf 26, 17,5 Mo, son AAC). Dessinée en pixels et
  sonorisée par le code dans l'atelier `~/grandsprojets/video-retro-open-projets/`,
  hors dépôt. Elle tourne en boucle sur la page `/video` (écran de salon,
  hors des moteurs, `home-src/src/v2/views/VideoView.vue`).
- `open-projets-avant-apres.webp` : son affiche, l'écran titre à 4,2 s.

La page qui l'embarque (bloc d'accueil du site) porte les données
structurées VideoObject et la transcription intégrale, dans
`home-src/src/v2/data/videoPresentation.js`. Les en-têtes de cache sont dans
`netlify.toml` (`/video/*`).
