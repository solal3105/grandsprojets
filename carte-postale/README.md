# Carte postale : outil de salon

Une carte postale de la commune d'un prospect, imprimée sur place, sur un fond
IGN d'une autre époque.

**Autonome.** Tout le code tient dans ce dossier, aucune route serveur, aucune
clé d'API. Ouvrir `/carte-postale/` suffit.

## Le geste

1. On tape le nom de la commune (autocomplétion officielle geo.api.gouv.fr).
2. La carte plonge sur la commune. La vue aérienne de 1950-1965 s'affiche par
   défaut : c'est celle qui provoque la réaction, un centre-bourg entouré de
   champs là où il y a aujourd'hui des lotissements.
3. On remonte ou on descend le temps sur la frise. Le fond change **en fondu**.
4. On cadre en glissant sur la carte postale elle-même, on choisit le point de
   vue, on écrit l'inscription.
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
l'éditeur**. Elle flotte au centre, en perspective, suit le pointeur et accroche
la lumière. Au survol elle se met à plat pour se laisser cadrer.

Ce dernier point n'est pas décoratif. Une carte inclinée par une transformation
3D fausse les coordonnées que MapLibre lit du pointeur : le glissé dériverait.
La mise à plat au survol résout le problème en le transformant en geste.

## Format

**10 x 15 cm en portrait**, soit 1181 x 1772 pixels à 300 points par pouce.

L'impression ne passe PAS par la page : l'image est composée dans un canvas puis
imprimée seule, avec `@page { size: 100mm 150mm; margin: 0 }`. Ce qui est
téléchargé et ce qui sort de l'imprimante sont donc le même objet, indépendant
du navigateur, de ses marges et du pilote.

Les proportions de l'écran et du papier sont tenues par les mêmes fractions.
`--cp-image` dans la feuille de style et `IMAGE_H` dans `postcard.js` doivent
rester égaux, sinon l'aperçu et le papier ne cadrent pas pareil.

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

## À renseigner

`TELEPHONE` en tête de `app.js`. Vide, la ligne n'apparaît ni à l'écran ni à
l'impression : mieux vaut pas de numéro qu'un numéro faux sur un objet qu'on
laisse entre les mains d'un élu.

## Banc de captures

Hors suite par défaut, il produit les rendus de chaque état et l'image
d'impression réelle :

```bash
CP_VISUEL=1 npx playwright test tests/unauth.carte-postale-visuel.spec.js
```

Sortie dans `test-results/carte-postale/`.

## Mention légale

`Fond de carte © IGN, Géoplateforme` figure sur la carte. Elle est obligatoire.
