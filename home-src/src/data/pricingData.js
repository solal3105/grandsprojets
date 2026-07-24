import { markRaw } from 'vue'
import {
  HardHat, Sparkles, ShieldAlert, ClipboardCheck,
  MapPin, Building2, Users,
} from 'lucide-vue-next'

// ── Prix catalogue HT ────────────────────────────────────────────────────────
export const BASE_PRICES = {
  setup: 1200,   // ponctuel
  carte: 1500,   // /an
  module: 1000,  // /an
}

// Coef minorant modules = 0.7 × coefEdition (varie avec la tranche)
export const COEF_MODULE = 0.7
// Coef setup = coefEdition × 0.3
export const COEF_SETUP = 0.3

// ── Tranches de population ───────────────────────────────────────────────────
export const populationTranches = [
  { id: 't1', label: '< 2 000',           coef: 1.0 },
  { id: 't2', label: '2 000 - 5 000',     coef: 1.2 },
  { id: 't3', label: '5 001 - 15 000',    coef: 1.5 },
  { id: 't4', label: '15 001 - 50 000',   coef: 2.0 },
  { id: 't5', label: '50 001 - 100 000',  coef: 2.6 },
  { id: 't6', label: '100 001 - 250 000', coef: 3.2 },
  { id: 't7', label: '250 001 - 500 000', coef: 3.8 },
  { id: 't8', label: '> 500 000',         coef: 4.4 },
]

// ── Modules ──────────────────────────────────────────────────────────────────
export const pricingModules = [
  {
    id: 'travaux',
    label: 'Travaux',
    desc: 'Carte des chantiers en temps réel. Renseignez et communiquez sur tous les travaux du territoire.',
    icon: markRaw(HardHat),
    available: true,
  },
  {
    id: 'ia',
    label: 'Assistant IA',
    desc: "Rédigez vos articles depuis vos documents internes. L'IA génère un brouillon, vous validez.",
    icon: markRaw(Sparkles),
    available: true,
  },
  {
    id: 'securite',
    label: 'Sécurité Routière',
    desc: 'Zones accidentogènes cartographiées à partir des données BAAC, FUB et constructeurs automobiles.',
    icon: markRaw(ShieldAlert),
    available: false,
  },
  {
    id: 'audit',
    label: 'Audit terrain',
    desc: "Les usagers remontent directement depuis la carte les problèmes qu'ils constatent sur le terrain.",
    icon: markRaw(ClipboardCheck),
    available: false,
  },
]

// ── Profils types (carte seule, sans modules) ────────────────────────────────
export const pricingProfiles = [
  {
    label: 'Commune rurale',
    pop: '< 5 000 hab.',
    icon: markRaw(MapPin),
    trancheIndex: 0,
    monthlyFrom: 125,
    setupFrom: 360,
    highlight: false,
    accentClass: 'text-green',
    accentBorderClass: 'border-green',
    iconBgClass: 'bg-green/10',
    features: [
      'Carte interactive publique',
      'Projets et articles illimités',
      'Interface admin intuitive',
      'Support par email',
    ],
  },
  {
    label: 'Ville moyenne',
    pop: '5 000 - 50 000 hab.',
    icon: markRaw(Building2),
    badge: 'Le plus courant',
    trancheIndex: 2,
    monthlyFrom: 188,
    setupFrom: 540,
    highlight: true,
    accentClass: 'text-primary',
    accentBorderClass: 'border-primary',
    iconBgClass: 'bg-primary-10',
    features: [
      'Tout le niveau précédent',
      'Espaces secondaires (communes liées)',
      'Modules fonctionnels disponibles',
      'Accompagnement à l\'onboarding',
    ],
  },
  {
    label: 'Grande collectivité',
    pop: '50 000 - 500 000 hab.',
    icon: markRaw(Users),
    trancheIndex: 4,
    monthlyFrom: 325,
    setupFrom: 936,
    highlight: false,
    accentClass: 'text-purple',
    accentBorderClass: 'border-purple',
    iconBgClass: 'bg-purple/10',
    features: [
      'Tout le niveau précédent',
      "Jusqu'à 20 espaces secondaires",
      'Tous les modules fonctionnels',
      'Support prioritaire dédié',
    ],
  },
]
