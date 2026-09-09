/**
 * Diagnostic terrain - observatoires publics Eco-Compteur en France.
 * Chaque organisme qui publie ses compteurs sur une page publique Eco-Visio
 * a un identifiant ; il n'existe pas d'annuaire officiel. Cette liste vient
 * d'un relevé public des pages ouvertes (janvier 2026) : identifiant, nom et
 * emprise des compteurs (lng/lat min et max). Elle sert à ne consulter que
 * les observatoires dont l'emprise touche le territoire. Le réseau national
 * (Réseau vélo et marche, plateforme nationale des fréquentations) est
 * toujours consulté. À compléter à la main quand un observatoire manque.
 */

export const NATIONAL_ORGANISME = 891; // Réseau vélo et marche

export const ECO_VISIO_ORGANISMES = [
  { id: 891, nom: "Réseau vélo et marche", bbox: [-4.789, 42.493, 8.165, 51.076] },
  { id: 4586, nom: "Bike Count Display Interactive Map", bbox: [-5.636, 41.307, 9.984, 51.99] },
  { id: 6062, nom: "Compteurs vélos CD 92 ", bbox: [2.153, 48.741, 2.335, 48.945] },
  { id: 3902, nom: "Grand Lyon", bbox: [4.719, 45.694, 4.991, 45.797] },
  { id: 137, nom: "Département d'Ille et Vilaine - Espaces Naturels", bbox: [-2.179, 47.69, -1.132, 48.71] },
  { id: 120, nom: "Observatoire des mobilités", bbox: [5.569, 45.138, 5.956, 45.363] },
  { id: 5689, nom: "Communauté Urbaine Le Havre Seine Métropole", bbox: [0.089, 49.459, 0.377, 49.554] },
  { id: 236, nom: "Page Web Publique - CD83", bbox: [5.727, 43.107, 6.725, 43.761] },
  { id: 692, nom: "Grand Chambéry", bbox: [5.884, 45.555, 5.983, 45.598] },
  { id: 3686, nom: "COMMUNAUTE AGGLO ANNECY", bbox: [6.011, 45.804, 6.206, 46.005] },
  { id: 40, nom: "ADT_Ardeche", bbox: [4.187, 44.355, 4.816, 45.132] },
  { id: 382, nom: "Eco-compteur", bbox: [-3.464, 45.089, 8.694, 51.477] },
  { id: 20, nom: "CRT Centre-Val de Loire", bbox: [0.068, 46.963, 3.057, 48.524] },
  { id: 5948, nom: "Le Grand Chalon Agglomération", bbox: [4.802, 46.76, 4.897, 46.929] },
  { id: 5542, nom: "Meurthe & Moselle Etude de fréquentation des itinéraires du PDIPR", bbox: [5.727, 48.401, 6.819, 49.489] },
  { id: 873, nom: "Page Publique données mobilités Syndicat Mixte du Lac d'Annecy", bbox: [6.143, 45.766, 6.364, 45.88] },
  { id: 7780, nom: "Page Publique Plus PNR Périgord Limousin", bbox: [0.685, 45.528, 0.962, 45.749] },
  { id: 5326, nom: "Trégor Bicyclette", bbox: [-3.479, 43.343, -1.781, 48.76] },
];
