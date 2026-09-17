# Carte postale : outil de salon

Une carte postale de la commune d'un prospect, imprimée sur place, sur un fond
IGN d'une autre époque.

**Autonome.** Tout le code tient dans ce dossier, aucune route serveur, aucune
clé d'API. Ouvrir `/carte-postale/` suffit.

## Le geste

1. On recherche une adresse, une rue, un lieu ou une commune dans le champ unique.
   La commune est retrouvée automatiquement à partir du résultat choisi.
2. La carte se centre sur le lieu. La vue aérienne de 1950-1965 s'affiche par
   défaut : c'est celle qui provoque la réaction, un centre-bourg entouré de
   champs là où il y a aujourd'hui des lotissements.
3. On remonte ou on descend le temps sur la frise. Le fond change **en fondu**.
4. On ajuste le cadrage en glissant sur la carte postale. On choisit le point
   de vue et on écrit l'inscription. Le même champ permet de changer de lieu.
5. On imprime, ou on télécharge l'image.

## Le paysage derrière l'objet

La **même carte**, au même endroit et à la même époque, remplit l'écran derrière
la carte postale, floutée et assombrie, un cran plus large. L'objet devient une
fenêtre de netteté découpée dans le territoire, au lieu d'un rectangle posé sur
un dégradé. Changer d'époque change les deux : sinon la fenêtre et le paysage
raconteraient deux histoires différentes.

Techniquement, deux cartes MapLibre. La seconde n'est pas interactive et se cale
par saut instantané à chaque mouvement de la première, donc sans décalage
perceptible ni risque de boucle. Elle est **facultative** : si le navigateur
refuse un second contexte WebGL, l'outil fonctionne exactement pareil, en moins
joli. Les tuiles sont partagées par le cache du navigateur, le coût réseau est
donc marginal.

## Parti pris d'interface

La carte postale n'est pas un aperçu posé à côté d'un éditeur : **elle est
l'éditeur**. Au survol, elle s'incline autour de son propre centre : au maximum
5 degrés horizontalement et 4 verticalement. Elle revient doucement à plat à la
sortie. Déplacer le pointeur sur les réglages ne la fait pas bouger.

Ce dernier point n'est pas décoratif. Une carte inclinée par une transformation
3D fausse les coordonnées que MapLibre lit du pointeur : le glissé dériverait.
Dès un appui ou un coup de molette sur la carte, l'objet revient donc à plat
avant que MapLibre lise le geste. Il reste stable jusqu'à la sortie du pointeur.
L'effet est désactivé sur écran tactile et avec la préférence de mouvement réduit.
Le lissage suit le temps écoulé et s'arrête au repos ; aucune boucle ne tourne
en continu pour cet effet.

## Format

**100 x 148 mm en portrait**, soit 1181 x 1748 pixels à 300 points par pouce.

L'impression ne passe PAS par la page : l'image est composée dans un canvas puis
imprimée seule, avec `@page { size: 100mm 148mm; margin: 0 }`. Le document tient
sur une page, sans marge ajoutée par le site. L'image est décodée avant l'ouverture
du dialogue et reste disponible jusqu'à sa fermeture (`afterprint`).

Le navigateur reçoit le format exact. Le pilote de l'imprimante peut toutefois
imposer son papier ou ses marges matérielles : choisir alors 100 x 148 mm,
une échelle de 100 % et le mode sans bordure si l'imprimante le propose.

Les proportions de l'écran et du papier sont tenues par les mêmes fractions.
`--cp-image` dans la feuille de style et `IMAGE_H` dans `postcard.js` doivent
rester égaux, sinon l'aperçu et le papier ne cadrent pas pareil.

Les informations du bandeau restent à au moins 5 mm du bord inférieur.
La mention IGN respecte ce retrait jusque sous les lettres descendantes,
afin de garder une marge de sécurité lors d'une impression sans bordure.

La capture augmente uniquement la densité de pixels de MapLibre avec
`setPixelRatio`. Le conteneur, le centre, le zoom et l'inclinaison restent
inchangés : agrandir le conteneur à zoom constant élargissait le cadrage.
La densité initiale est rétablie après la capture, même en cas d'échec.

## Recherche d'adresse

`address.js` interroge le [géocodage de la Géoplateforme IGN](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/)
avec les index `address,poi`, sur toute la France, dès l'accueil.
Les propositions arrivent après trois caractères ; les flèches et Entrée
permettent de choisir au clavier, Échap ferme la liste. Les requêtes dépassées
sont annulées et ne peuvent pas rouvrir une liste fermée. Le résultat fournit
le nom et le code INSEE de la commune. S'ils manquent ou si un lieu couvre
plusieurs communes, geo.api.gouv.fr les retrouve automatiquement par coordonnées.
Les communes présentes dans les deux index n'apparaissent qu'une fois.
Le choix recentre la carte et actualise la commune sans changer l'époque,
l'inclinaison ou une inscription personnalisée. L'inscription par défaut indique
la commune et la période. Elle suit automatiquement les changements de lieu et
d'époque, tout comme le modèle choisi parmi les suggestions. Une saisie manuelle
suspend ce suivi ; choisir une suggestion le réactive.
Aucun repère supplémentaire n'apparaît sur la carte imprimée.

## Les époques

Neuf fonds servis par la Géoplateforme IGN, du XVIIIe siècle à aujourd'hui.
Chaque ligne de `epoques.js` a été vérifiée par un vrai appel de tuile. Deux
pièges y sont documentés : les photographies historiques n'exposent pas le style
`normal` mais `BDORTHOHISTORIQUE`, et leur grille de tuiles diffère de celle des
couches courantes.

La couche 1980-1995 est déclarée par l'IGN mais ne sert aucune tuile (404 sur
Bourgoin-Jallieu, Paris, Vannes et Montpellier) : elle est absente de la liste.

**La couverture ancienne est inégale selon les communes.** Quand l'IGN ne sert
rien à cet endroit, l'outil le dit et grise l'époque, au lieu d'afficher un
carré vide.

## Deux pièges techniques, pour qui reprendra ce code

**Le relief est absent, et c'est une décision.** Les tuiles de terrain utilisées
par `/demo/` ne renvoient aucun en-tête CORS. Dès qu'elles alimentent la scène,
le navigateur « teinte » le canvas et refuse toute relecture : la capture
d'impression revient vide, sans erreur visible. Y renoncer garde l'outil dans un
seul dossier et garantit que l'aperçu est exactement ce qui sera imprimé.

**La capture se lit PENDANT le rendu, pas après.** `preserveDrawingBuffer` ne
suffit pas : une fois la trame composée, le tampon peut être vidé et
`toDataURL` rend alors une image parfaitement vide, sans la moindre erreur.
Mesuré ici : un PNG de 48 Ko dont tous les pixels étaient noirs. On demande donc
un nouveau dessin et on lit depuis l'événement `render`.

## Contact et QR code

`Postcard.contact` dans `postcard.js` fournit `contact@vazy.app`,
`07 60 77 16 13` et l'adresse
`https://openprojets.com/l/carte-postale` à l'aperçu et à l'image imprimée.
Le QR est embarqué dans `qr-carte-postale.svg`, sans service tiers au moment
d'imprimer. Il mesure 24 mm, avec une zone blanche de quatre modules de chaque
côté et une correction d'erreur M. L'adresse du site est aussi écrite en clair.

Si la cible change, régénérer aussi le SVG avec `qrcode-generator`, déjà installé
dans `home-src` : `qrcode(0, 'M')`, `addData(url)`, `make()`, puis
`createSvgTag({ cellSize: 6, margin: 24, title: 'Ouvrir le site Open Projets' })`.

## Banc de captures

Hors suite par défaut, il produit les rendus de chaque état et l'image
d'impression réelle :

```bash
CP_VISUEL=1 npx playwright test tests/unauth.carte-postale-visuel.spec.js
```

Sortie dans `test-results/carte-postale/`.

## Mention légale

`Fond de carte © IGN, Géoplateforme` figure sur la carte. Elle est obligatoire.
