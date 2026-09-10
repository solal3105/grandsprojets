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

La page qui l'embarque (bloc d'accueil de la home2) porte les données
structurées VideoObject et la transcription intégrale, dans
`home-src/src/v2/data/videoPresentation.js`. Les en-têtes de cache sont dans
`netlify.toml` (`/video/*`).
