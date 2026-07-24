// Données des pages SEO « Alternative à … ».
// Ajouter un concurrent = une entrée ici + une route dans router/index.js.
// Le produit Open Projets (piliers + showcase) est décrit une seule fois dans
// AlternativeView.vue - ici on ne décrit que ce qui est propre à chaque concurrent.
// Tous les faits sur les concurrents sont sourcés (voir `sources` de chaque entrée).

const BASE = 'https://openprojets.com/home'

export const alternatives = {
  panneaupocket: {
    slug: 'alternative-panneaupocket',
    referrer: 'alt-panneaupocket',
    competitor: 'PanneauPocket',
    seo: {
      title: 'Alternative à PanneauPocket : la carte des projets urbains | Open Projets',
      description:
        "Vous utilisez PanneauPocket pour vos alertes ? Open Projets le complète avec une carte interactive de vos projets et chantiers, consultable sans application.",
      canonical: `${BASE}/alternative-panneaupocket`,
    },
    hero: {
      eyebrow: 'La carte interactive des projets de territoire',
      titleLine1: "L'alternative à PanneauPocket",
      titleLine2: 'pour la carte de vos projets',

      gradient: 'text-gradient',
      intro:
        "PanneauPocket diffuse très bien vos alertes et vos actualités du quotidien. Open Projets répond à un autre besoin : montrer où se passent vos projets d'aménagement et vos travaux, sur une carte publique à vos couleurs - consultable par tous, sans application à télécharger.",
    },
    // Ce que le concurrent fait bien - reconnu honnêtement
    context: {
      title: "PanneauPocket, et pourquoi tant de communes l'utilisent",
      intro:
        "PanneauPocket s'est imposé pour de bonnes raisons : c'est simple, abordable et efficace pour la communication d'urgence et du quotidien.",
      strengths: [
        "Notifications push instantanées (alerte météo, coupure d'eau, événement)",
        'Prise en main immédiate par les agents, sans compétence technique',
        'Agenda, informations pratiques et signalements citoyens',
        'Une présence mobile pour les petites communes à budget maîtrisé',
      ],
    },
    // Le pont : ce que le concurrent ne couvre pas, où Open Projets prend le relais
    bridge: {
      title: 'Là où Open Projets prend le relais',
      desc:
        "Dans PanneauPocket, l'information vit dans un flux : un message sur un chantier remonte quelques jours, puis laisse place au suivant. Pour un projet d'aménagement qui dure des mois, vos habitants ont besoin d'une information localisée et permanente. C'est exactement le rôle d'Open Projets - une carte où chaque projet a sa fiche, son statut et son calendrier, accessible à tout moment depuis un simple lien ou un QR code sur la palissade.",
    },
    comparison: {
      title: 'Deux usages complémentaires',
      intro: "Sur la communication des projets de territoire, voici ce qu'Open Projets apporte en plus.",
      competitorLabel: 'PanneauPocket',
      rows: [
        { label: 'Carte géographique des projets', op: 'Cœur du produit', comp: false },
        { label: 'Fiche projet (photos, statut, dates)', op: 'Natif', comp: false },
        { label: "Suivi d'avancement des travaux", op: 'Planifié → en cours → terminé', comp: false },
        { label: 'Information permanente, pas un flux', op: 'Oui', comp: false },
        { label: "Accès sans télécharger d'application", op: 'Lien, QR code, iframe', comp: 'Via l\'app' },
        { label: 'Intégration sur votre site (iframe)', op: 'Natif', comp: false },
        { label: 'Carte à vos couleurs, sur votre domaine', op: 'Marque blanche', comp: false },
      ],
    },
    coexist: {
      title: 'Les deux fonctionnent très bien ensemble',
      desc: "Gardez PanneauPocket pour vos alertes et l'actualité du quotidien. Ajoutez Open Projets pour la carte permanente de vos projets - PanneauPocket peut même renvoyer vers votre carte via un lien.",
    },
    sources: [
      { label: 'panneaupocket.com/fonctionnalites', url: 'https://www.panneaupocket.com/fonctionnalites/' },
      { label: 'panneaupocket.com/mairies', url: 'https://www.panneaupocket.com/mairies/' },
    ],
  },

  cityall: {
    slug: 'alternative-cityall-lumiplan',
    referrer: 'alt-cityall',
    competitor: 'CityAll (Lumiplan)',
    seo: {
      title: 'Alternative à CityAll (Lumiplan) : la carte web des projets | Open Projets',
      description:
        "CityAll de Lumiplan est une app citoyenne mutualisée. Open Projets apporte la carte web de vos projets et chantiers, à vos couleurs, accessible sans application.",
      canonical: `${BASE}/alternative-cityall-lumiplan`,
    },
    hero: {
      eyebrow: 'La carte interactive des projets de territoire',
      titleLine1: "L'alternative à CityAll",
      titleLine2: 'pour la carte web de vos projets',

      gradient: 'text-gradient-green',
      intro:
        "CityAll est l'application citoyenne de Lumiplan, pensée pour donner une présence mobile aux communes. Open Projets répond à un autre besoin : une carte web de vos projets d'aménagement et de vos chantiers, à votre nom, consultable par tous sans installer d'application.",
    },
    context: {
      title: 'CityAll, et pourquoi des collectivités choisissent Lumiplan',
      intro:
        "Lumiplan est un acteur sérieux de la smart city, et CityAll a de vrais atouts pour une commune qui veut une présence mobile sans développer sa propre application.",
      strengths: [
        'Une application citoyenne clé en main, mutualisée entre communes',
        'Notifications, informations pratiques et participation citoyenne',
        "L'écosystème Lumiplan : panneaux d'information, mobilité, accompagnement",
        'Un acteur établi, avec une vraie capacité de support',
      ],
    },
    bridge: {
      title: 'Là où Open Projets prend le relais',
      desc:
        "CityAll diffuse l'information dans une application mutualisée, où votre commune est l'un des canaux. Pour rendre vos projets d'aménagement vraiment lisibles, il faut une carte à votre nom, où chaque chantier est localisé avec sa fiche et son avancement - et accessible sans rien installer. C'est le rôle d'Open Projets : votre carte, vos couleurs, votre domaine, ouverte d'un simple lien ou QR code.",
    },
    comparison: {
      title: 'Deux approches complémentaires',
      intro: "Sur la communication cartographique des projets, voici ce qu'Open Projets apporte en plus.",
      competitorLabel: 'CityAll (Lumiplan)',
      rows: [
        { label: 'Carte géographique des projets', op: 'Cœur du produit', comp: false },
        { label: 'Fiche projet (photos, statut, dates)', op: 'Natif', comp: false },
        { label: "Suivi d'avancement des travaux", op: 'Planifié → en cours → terminé', comp: false },
        { label: "Accès sans télécharger d'application", op: 'Lien, QR code, iframe', comp: 'Via l\'app' },
        { label: 'Espace 100 % à votre nom', op: 'Marque blanche dédiée', comp: 'App mutualisée' },
        { label: 'Intégration sur votre site (iframe)', op: 'Natif', comp: false },
        { label: "Mise à jour en autonomie par l'agent", op: 'No-code, immédiat', comp: '-' },
      ],
    },
    coexist: {
      title: 'Compatible avec votre écosystème Lumiplan',
      desc: "Vos panneaux, bornes et application restent en place. Open Projets s'ajoute comme couche cartographique web de vos projets, accessible depuis un lien ou un QR code - sans rien changer à l'existant.",
    },
    sources: [
      { label: 'lumiplan.com/carte-identite', url: 'https://www.lumiplan.com/carte-identite/' },
      { label: 'lumiplan.com/smart-city/applications-mobiles-mairie', url: 'https://www.lumiplan.com/smart-city/applications-mobiles-mairie/' },
    ],
  },

  neocity: {
    slug: 'alternative-neocity',
    referrer: 'alt-neocity',
    competitor: 'Neocity',
    seo: {
      title: 'Alternative à Neocity : la carte des projets sans app | Open Projets',
      description:
        "Neocity est une app citoyenne complète. Open Projets apporte une carte web de vos projets et chantiers, accessible par lien ou QR code, sans installation.",
      canonical: `${BASE}/alternative-neocity`,
    },
    hero: {
      eyebrow: 'La carte interactive des projets de territoire',
      titleLine1: "L'alternative à Neocity",
      titleLine2: 'pour une carte sans application',

      gradient: 'text-gradient',
      intro:
        "Neocity est une application citoyenne riche, idéale pour entretenir une relation mobile avec ses habitants. Open Projets répond à un besoin plus précis : rendre vos projets et chantiers visibles sur une carte web, ouverte d'un simple lien ou QR code - sans demander à personne d'installer une application.",
    },
    context: {
      title: "Neocity, et pourquoi des mairies l'adoptent",
      intro:
        "Neocity est une application citoyenne complète. Pour une commune qui veut une relation mobile multidimensionnelle avec ses habitants, c'est une solution sérieuse.",
      strengths: [
        'Plus de 40 modules : signalements, démarches, agenda, alertes…',
        "Une vraie dynamique d'engagement et de réengagement citoyen",
        'Hébergement en France, conformité RGPD / RGAA',
        'Un acteur établi avec une offre large sur le marché des communes',
      ],
    },
    bridge: {
      title: 'Là où Open Projets prend le relais',
      desc:
        "Dans Neocity, la carte et les travaux vivent à l'intérieur de l'application : pour les voir, le citoyen doit l'avoir installée. Or beaucoup d'habitants ne franchissent jamais cette étape. Open Projets prend le relais sur le web : un riverain scanne un QR code sur la palissade et voit la fiche du chantier dans son navigateur, immédiatement. Et votre carte s'intègre en iframe sur le site de la mairie.",
    },
    comparison: {
      title: 'Deux approches complémentaires',
      intro: "Sur l'accès des habitants à la carte des projets, voici ce qu'Open Projets apporte en plus.",
      competitorLabel: 'Neocity',
      rows: [
        { label: "Accès à la carte sans installer d'app", op: 'Lien, QR code, iframe', comp: 'App requise' },
        { label: 'QR code → fiche dans le navigateur', op: 'Immédiat', comp: 'App à installer' },
        { label: 'Intégration iframe (site, ENT)', op: 'Natif', comp: false },
        { label: 'Carte des projets comme cœur du produit', op: 'Oui', comp: 'Un module parmi 40+' },
        { label: 'Fiche projet (photos, statut, dates)', op: 'Natif', comp: 'Via l\'app' },
        { label: 'Espace 100 % à votre nom, sur le web', op: 'Marque blanche', comp: 'Application mobile uniquement' },
        { label: "Mise à jour en autonomie par l'agent", op: 'No-code, immédiat', comp: 'Back-office' },
      ],
    },
    coexist: {
      title: 'Complémentaire de votre application',
      desc: "Gardez Neocity pour les notifications, signalements et démarches. Ajoutez Open Projets comme carte web de vos projets : un lien depuis l'app ou un QR code sur le terrain suffit pour y accéder, sans installation.",
    },
    sources: [
      { label: 'neocity.fr', url: 'https://neocity.fr/' },
      { label: 'neocity.fr/tarifs-application-mobile-ville', url: 'https://neocity.fr/tarifs-application-mobile-ville/' },
    ],
  },
}
