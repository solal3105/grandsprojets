# Registre des traitements : mesure d'audience et enregistrement de session

Fiche à jour au 16 septembre 2026. Elle décrit un seul traitement, celui de la
mesure d'audience des espaces Open Projets, enregistrement de session compris.
Les signalements déposés par les habitants sur une carte relèvent d'un autre
traitement, dont la collectivité est responsable.

## Responsable du traitement

VAZY, éditeur d'Open Projets, établi à Lyon. Les demandes d'accès, de
rectification et d'effacement arrivent par la page de contact du site
openprojets.com. À compléter avant diffusion à un client : forme juridique,
numéro d'immatriculation, adresse du siège et nom de la personne référente.

## Finalité

Savoir ce qui sert et ce qui gêne dans les espaces Open Projets, pour décider
quoi corriger et quoi développer. Concrètement : mesurer la fréquentation des
pages, repérer les projets et les catégories que les visiteurs ouvrent
réellement, suivre les demandes de démonstration venues du site, et comprendre
les blocages d'interface en regardant comment une visite s'est déroulée.

Aucune publicité, aucun reciblage, aucune revente, aucun suivi de la navigation
sur d'autres sites, aucune décision automatisée.

## Base légale

L'intérêt légitime de l'éditeur à améliorer son service. La mesure d'audience
anonyme relève de l'exemption de consentement prévue par la CNIL ;
l'enregistrement de session n'y entre pas, il est donc assumé, annoncé sur la
page de confidentialité et refusable en un clic depuis cette même page, sans
création de compte.

## Personnes concernées

Les visiteurs des espaces publics (site vitrine, cartes des collectivités,
fiches de projet, pages de ville, écran de démonstration) et les agents
connectés à un espace d'administration.

## Données traitées

Pour toute visite, la page consultée et l'espace d'où elle vient, le navigateur,
le type d'appareil et le pays, la provenance du visiteur, et les actions
mesurées une par une : projet ouvert, catégorie ouverte, module ouvert,
formulaire envoyé.

L'adresse IP est anonymisée à la collecte, côté serveur. Un identifiant de
visite est conservé sur l'appareil du visiteur pour ne pas compter deux fois la
même personne ; il est limité à notre domaine. Tant qu'une personne ne se
connecte pas, aucune fiche nominative n'est créée.

Pour un agent connecté à un espace d'administration, les actions sont rattachées
à son compte : identifiant technique, adresse électronique, rôle et collectivité.

L'enregistrement de session reproduit ce qui s'affiche à l'écran pendant la
visite, avec les journaux techniques du navigateur. Les saisies dans les champs
de formulaire sont masquées avant l'envoi, et un bloc de page peut être masqué
ou exclu entièrement. Le jeton d'authentification présent dans une adresse de
connexion est retiré avant l'envoi.

## Destinataires

L'équipe Open Projets seule. Aucun partage avec un tiers, aucune cession.

## Sous-traitants et hébergement

PostHog, hébergé dans l'Union européenne, pour la mesure et les enregistrements.
Les requêtes passent par notre propre domaine et non par un domaine tiers.

Google Analytics est conservé en parallèle pour le suivi du référencement : ce
service communique avec les serveurs de Google, c'est le seul appel externe de
mesure sur nos pages. Le refus exprimé sur la page de confidentialité le coupe
en même temps que le reste.

## Durées de conservation

Les enregistrements de session sont supprimés automatiquement au bout de trente
jours, réglage du projet. Les événements de mesure sont conservés pour l'analyse
de tendance sur la durée de rétention du service.

## Mesures de sécurité et de minimisation

Les enregistrements sont coupés d'eux-mêmes là où le visiteur ne pourrait pas
exprimer son refus, c'est-à-dire lorsqu'une carte est intégrée dans le site
d'une collectivité. Ils peuvent être coupés espace par espace. Le refus du
visiteur, le signal « Do Not Track » et le signal « Global Privacy Control » du
navigateur arrêtent toute collecte. Aucune adresse électronique et aucun nom de
personne ne figure dans les propriétés d'un événement.

## Droits des personnes

Le refus s'exerce en un clic sur openprojets.com/confidentialite, sans compte,
et s'applique aux deux outils sur tous les espaces ouverts depuis ce navigateur.
Il est conservé sur l'appareil, donc à renouveler après un changement de
navigateur ou un effacement des données de navigation. Ajouter `?tracking=off` à
n'importe quelle adresse du site produit le même effet. Les autres droits
s'exercent par la page de contact.

## Pour l'équipe

La description technique complète est dans `docs/analytics.md`. Toute évolution
de la mesure doit garder cette fiche, la page de confidentialité et le code en
accord : une page qui promet plus que ce que fait le produit se vérifie en
trente secondes.
