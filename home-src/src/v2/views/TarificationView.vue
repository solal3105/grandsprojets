<template>
  <div>
    <!-- Ouverture : meme composition que les autres pages du site. La page
         est dans le menu et ouverte aux moteurs (titre et description dans le
         routeur, prérendu, JSON-LD par l'edge function home-seo). -->
    <section class="relative pt-36 pb-14 overflow-hidden">
      <HeroGround />
      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[820px] mx-auto text-center">
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[52px] leading-[1.06] tracking-tight-hero text-dark">
            Estimez le prix d'Open Projets pour votre collectivité
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[640px] mx-auto">
            Trois réglages suffisent : votre collectivité, les modules que vous activez et la durée
            de votre engagement. Les montants sont hors taxes.
          </p>
        </div>
      </div>
    </section>

    <section class="pb-20 sm:pb-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-10 items-start">

          <!-- Les trois réglages -->
          <div class="flex flex-col gap-6">

            <!-- 1. La population -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">1</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">Votre collectivité</h2>
              </div>

              <!-- La collectivité choisie : sa population sert à tous les modules,
                   et ses données publiques chiffrent Chantiers -->
              <div v-if="territoire" id="tarif-territoire" class="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gray-bg p-4 sm:p-5">
                <span class="flex items-center gap-3.5 min-w-0">
                  <span class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-pill"><MapPin class="w-[18px] h-[18px] text-dark" /></span>
                  <span class="min-w-0">
                    <span class="block font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark leading-tight">{{ territoire.nom }}</span>
                    <span class="block mt-0.5 text-sm text-gray-text">{{ descriptionTerritoire }}</span>
                  </span>
                </span>
                <button type="button" class="text-sm font-medium text-dark underline underline-offset-4 decoration-gray-300 hover:decoration-dark transition-colors" @click="effacerTerritoire">Changer de collectivité</button>
              </div>

              <template v-else>
                <div class="mt-6">
                  <TerritoireRecherche id="tarif-collectivite" :departements="retenus.includes('chantiers')" @choisir="(p) => choisirTerritoire(p, null, true)" />
                  <p v-if="chargementTerritoire && !parcoursOuvert" class="mt-3 inline-flex items-center gap-2 text-sm text-gray-muted" role="status"><Loader2 class="w-4 h-4 animate-spin" /> Lecture des chiffres publics de ce territoire</p>
                  <p v-if="erreurTerritoire && !parcoursOuvert" class="mt-3 text-sm text-primary-ink" role="alert">{{ erreurTerritoire }}</p>
                </div>

                <p class="mt-6 text-sm text-gray-muted">Ou indiquez directement un nombre d'habitants :</p>
              <div class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <label for="tarif-population" class="sr-only">Nombre d'habitants</label>
                <!-- Le champ porte sa propre valeur (v-model) : lie directement a
                     la population, chaque rendu declenche par l'animation des
                     montants remettait le nombre en place et effacait la frappe.
                     Sa largeur suit le nombre tape, pour que « habitants » le
                     suive sans vide. -->
                <input
                  id="tarif-population"
                  v-model="populationSaisie"
                  type="text"
                  inputmode="numeric"
                  :style="{ width: `${Math.max(2, String(populationSaisie).length) + 0.5}ch` }"
                  class="bg-transparent font-heading font-bold text-4xl sm:text-5xl tracking-tight text-dark tabular-nums outline-none border-b-2 border-transparent focus:border-primary transition-colors"
                  @blur="saisirPopulation()"
                  @keydown.enter.prevent="saisirPopulation(); $event.target.blur()"
                />
                <span class="text-gray-text text-lg">habitants</span>
              </div>

              <!-- Le curseur parcourt la population en logarithme : la moitie du
                   trajet est autour de 35 000 habitants, pas a 1,25 million -->
              <label for="tarif-curseur" class="sr-only">Population, au curseur</label>
              <input
                id="tarif-curseur"
                type="range" min="0" max="1000" step="1"
                :value="Math.round(curseur * 1000)"
                class="curseur mt-6 w-full"
                :style="{ '--part': `${(curseur * 100).toFixed(2)}%` }"
                @input="population = curseurVersPopulation($event.target.value / 1000)"
                @change="mesurer('pricing_population_entered', { population, source: 'slider' })"
              />
              <div class="mt-2 flex justify-between text-[11px] text-gray-muted tabular-nums">
                <span>{{ nombre(POPULATION.min) }}</span>
                <span>{{ nombre(POPULATION.max) }}</span>
              </div>

              <div class="mt-5 flex flex-wrap gap-2">
                <button
                  v-for="r in REPERES" :key="r.nom"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors"
                  :class="population === r.population
                    ? 'border-dark bg-dark text-white'
                    : 'border-gray-border bg-white text-dark hover:border-gray-300'"
                  @click="population = r.population; mesurer('pricing_population_entered', { population: r.population, source: 'preset' })"
                >
                  <span class="font-medium">{{ r.nom }}</span>
                  <span class="tabular-nums" :class="population === r.population ? 'text-white/70' : 'text-gray-muted'">{{ nombre(r.population) }}</span>
                </button>
              </div>
              </template>
            </div>

            <!-- 2. Les modules -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">2</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">Les modules que vous activez</h2>
              </div>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">
                Chaque module a son prix. Dès le deuxième, le plus cher d'entre eux baisse de 10 %
                par module ajouté.
              </p>

              <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div v-for="m in offre" :key="m.key" class="relative">
                <button
                  type="button"
                  role="switch"
                  :aria-checked="retenus.includes(m.key)"
                  :data-module="m.key"
                  class="group relative w-full h-full text-left rounded-2xl border-2 p-4 sm:p-5 transition duration-200"
                  :class="[retenus.includes(m.key)
                    ? 'border-dark bg-white shadow-card'
                    : 'border-gray-border bg-gray-bg hover:border-gray-300', m.key === 'chantiers' && retenus.includes(m.key) ? 'pb-16' : '']"
                  @click="basculer(m.key)"
                >
                  <span class="flex items-start justify-between gap-3">
                    <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="m.tone.bg">
                      <component :is="m.icon" class="w-[18px] h-[18px]" :class="m.tone.text" />
                    </span>
                    <span
                      class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                      :class="retenus.includes(m.key) ? 'border-dark bg-dark' : 'border-gray-300 bg-white'"
                      aria-hidden="true"
                    >
                      <Check v-if="retenus.includes(m.key)" class="w-3.5 h-3.5 text-white" />
                    </span>
                  </span>
                  <span class="mt-4 block font-heading font-bold text-base text-dark leading-tight">{{ m.name }}</span>
                  <span class="mt-1 block text-xs text-gray-muted leading-snug">{{ m.key === 'chantiers' ? taglineChantiers : m.tagline }}</span>
                  <span v-if="m.key !== 'chantiers' || chiffrage" class="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                    <span class="font-heading font-semibold text-lg text-dark tabular-nums" :class="{ 'line-through text-gray-muted font-normal': remiseSur(m.key) }">
                      {{ euros(prixModule(m.key)) }}
                    </span>
                    <span v-if="remiseSur(m.key)" class="font-heading font-semibold text-lg tabular-nums" :class="m.tone.text">
                      {{ euros(prixModule(m.key) * (1 - estimation.remiseModules.taux)) }}
                    </span>
                    <span class="text-xs text-gray-muted">/ mois HT</span>
                  </span>
                  <span v-else-if="m.key === 'chantiers' && !retenus.includes('chantiers')" class="mt-4 block text-xs font-medium text-mod-chantiers">Se chiffre sur votre territoire, en quelques questions</span>
                  <span
                    v-if="remiseSur(m.key)"
                    class="absolute -top-2.5 right-4 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                    :class="m.tone.socle"
                  >
                    -{{ pourcent(estimation.remiseModules.taux) }} sur le plus cher
                  </span>
                </button>
                <!-- Chantiers se chiffre par un parcours : ce bouton le rouvre, avec le même libellé que sous le calcul -->
                <button
                  v-if="m.key === 'chantiers' && retenus.includes('chantiers')"
                  id="tarif-chantiers-parametrer"
                  type="button"
                  class="absolute left-4 sm:left-5 bottom-4 inline-flex items-center gap-1.5 rounded-full border border-gray-border bg-white px-3 py-1.5 text-xs font-medium text-dark hover:border-dark transition-colors"
                  @click="ouvrirParcours('edit')"
                >
                  <SlidersHorizontal class="w-3.5 h-3.5" />
                  Modifier les réponses
                </button>
                </div>
              </div>

            </div>

            <!-- 3. L'engagement -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">3</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">La durée de votre engagement</h2>
              </div>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">
                Un engagement plus long baisse l'abonnement chaque année, pendant toute la durée.
              </p>

              <div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Durée d'engagement">
                <button
                  v-for="e in ENGAGEMENTS" :key="e.annees"
                  type="button"
                  role="radio"
                  :aria-checked="annees === e.annees"
                  :data-annees="e.annees"
                  class="rounded-2xl border-2 px-3 py-4 text-center transition duration-200"
                  :class="annees === e.annees
                    ? 'border-dark bg-dark text-white shadow-card'
                    : 'border-gray-border bg-gray-bg text-dark hover:border-gray-300'"
                  @click="annees = e.annees"
                >
                  <span class="block font-heading font-bold text-lg leading-none">{{ e.annees }} {{ e.annees > 1 ? 'ans' : 'an' }}</span>
                  <span class="mt-2 block text-xs" :class="annees === e.annees ? 'text-white/70' : 'text-gray-muted'">
                    {{ e.remise ? `-${pourcent(e.remise)} par an` : 'Plein tarif' }}
                  </span>
                </button>
              </div>
            </div>

            <!-- L'estimation à envoyer : un document A4 à enregistrer en PDF,
                 avec le destinataire et notre numéro de suivi. Rien n'est
                 enregistré : tout passe dans l'adresse du document. -->
            <form v-if="commercial" id="estimation-form" class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill" @submit.prevent="ouvrirEstimation">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-primary-ink text-white flex items-center justify-center"><FileText class="w-4 h-4" /></span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">Préparer l'estimation à envoyer</h2>
              </div>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">
                Un document d'une page, aux réglages ci-dessus, à enregistrer en PDF. Il indique qu'il
                s'agit d'une estimation, pas d'un devis.
              </p>
              <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label class="block">
                  <span class="block text-xs font-medium text-gray-text mb-1.5">Collectivité destinataire</span>
                  <input v-model="destinataire.collectivite" type="text" required maxlength="120" placeholder="Ville de ..." class="champ" />
                </label>
                <label class="block">
                  <span class="block text-xs font-medium text-gray-text mb-1.5">À l'attention de <span class="text-gray-muted">(facultatif)</span></span>
                  <input v-model="destinataire.contact" type="text" maxlength="120" placeholder="Prénom Nom, fonction" class="champ" />
                </label>
                <label class="block">
                  <span class="block text-xs font-medium text-gray-text mb-1.5">Notre numéro de suivi <span class="text-gray-muted">(facultatif)</span></span>
                  <input v-model="destinataire.suivi" type="text" maxlength="40" placeholder="EST-2026-001" class="champ" />
                </label>
                <label class="block">
                  <span class="block text-xs font-medium text-gray-text mb-1.5">Valable jusqu'au</span>
                  <input v-model="destinataire.valide" type="date" class="champ" />
                </label>
              </div>
              <button
                type="submit" v-tilt-btn
                class="mt-6 inline-flex items-center gap-2.5 bg-dark text-white text-[15px] font-medium px-6 py-3.5 rounded-full hover:bg-black transition-colors"
              >
                Voir le document
                <ArrowRight class="w-4 h-4" />
              </button>
            </form>
          </div>

          <!-- Le résultat, qui suit le défilement -->
          <aside class="lg:sticky lg:top-24">
            <div class="rounded-3xl bg-dark text-white p-6 sm:p-8 shadow-card">
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs font-semibold text-white/70">Votre estimation</span>
                <div class="inline-flex rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Période d'affichage">
                  <button
                    v-for="p in PERIODES" :key="p.cle"
                    type="button" role="radio" :aria-checked="periode === p.cle"
                    class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                    :class="periode === p.cle ? 'bg-white text-dark' : 'text-white/70 hover:text-white'"
                    @click="periode = p.cle"
                  >{{ p.label }}</button>
                </div>
              </div>

              <p class="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span id="tarif-principal" class="font-heading font-bold leading-none tracking-tight tabular-nums text-5xl sm:text-[56px]">{{ euros(principalAnime) }}</span>
                <span class="text-white/60 text-sm">HT {{ periode === 'mois' ? 'par mois' : 'par an' }}</span>
              </p>
              <p class="mt-2 text-sm text-white/60">
                <template v-if="retenus.length">
                  {{ retenus.length }} {{ retenus.length > 1 ? 'modules' : 'module' }}, engagement {{ annees }} {{ annees > 1 ? 'ans' : 'an' }},
                  {{ territoire ? `${territoire.nom}, ` : '' }}{{ nombre(population) }} habitants.
                </template>
                <template v-else>Choisissez au moins un module.</template>
              </p>


              <!-- Le détail : chaque module, puis les remises, puis le prix -->
              <dl class="mt-7 border-t border-white/10 text-sm">
                <div v-for="l in estimation.lignes" :key="l.cle" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">{{ moduleByKey[l.cle]?.name }}</dt>
                  <dd class="tabular-nums whitespace-nowrap">{{ euros(l.prix * facteur) }}</dd>
                </div>
                <div v-if="estimation.remiseModules.montant > 0" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Plusieurs modules, -{{ pourcent(estimation.remiseModules.taux) }} sur {{ moduleByKey[estimation.remiseModules.module]?.short }}</dt>
                  <dd class="tabular-nums whitespace-nowrap text-green">-{{ euros(estimation.remiseModules.montant * facteur) }}</dd>
                </div>
                <div v-if="estimation.remiseEngagement.montant > 0" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Engagement {{ annees }} ans, -{{ pourcent(estimation.remiseEngagement.taux) }}</dt>
                  <dd class="tabular-nums whitespace-nowrap text-green">-{{ euros(estimation.remiseEngagement.montant * facteur) }}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10 font-semibold">
                  <dt>Abonnement {{ periode === 'mois' ? 'mensuel' : 'annuel' }}</dt>
                  <dd id="tarif-abonnement" class="tabular-nums whitespace-nowrap">{{ euros(estimation.mensuel * facteur) }}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Mise en service, une fois<span v-if="estimation.setupOfferte" class="block text-xs text-white/50">Offerte aux communes de moins de {{ nombre(MISE_EN_SERVICE.offerteSous) }} habitants</span></dt>
                  <dd id="tarif-setup" class="tabular-nums whitespace-nowrap">{{ estimation.setupOfferte ? 'Offerte' : euros(estimation.setup) }}</dd>
                </div>
              </dl>

              <!-- Le total sur la durée, face aux seuils des marchés publics -->
              <div class="mt-6">
                <div class="flex items-baseline justify-between gap-4">
                  <span class="text-sm text-white/80">Total sur {{ annees }} {{ annees > 1 ? 'ans' : 'an' }}, mise en service comprise<br /><span class="text-xs text-white/50">C'est ce montant que la commande publique regarde</span></span>
                  <span id="tarif-total" class="font-heading font-bold tabular-nums whitespace-nowrap text-2xl">{{ euros(totalAnime) }} <span class="text-sm font-normal text-white/60">HT</span></span>
                </div>

                <div class="relative mt-4 h-2 rounded-full bg-white/10" aria-hidden="true">
                  <span
                    class="absolute inset-y-0 left-0 rounded-full transition-colors duration-500"
                    :class="jauge.classe"
                    :style="{ width: `${jauge.part}%` }"
                  />
                  <span
                    v-for="s in jauge.reperes" :key="s.montant"
                    class="absolute -top-1.5 h-5 w-px bg-white/60"
                    :style="{ left: `${s.part}%` }"
                  />
                </div>
                <div class="relative mt-1.5 h-4 text-[11px] text-white/60 tabular-nums" aria-hidden="true">
                  <span
                    v-for="s in jauge.reperes" :key="s.montant"
                    class="absolute -translate-x-1/2 whitespace-nowrap"
                    :style="{ left: `${s.part}%` }"
                  >{{ s.court }}</span>
                </div>

                <p
                  id="tarif-seuil"
                  class="mt-4 flex items-start gap-2.5 rounded-2xl p-3.5 text-sm leading-relaxed"
                  :class="jauge.encart"
                  role="status"
                >
                  <component :is="estimation.seuilDepasse ? AlertTriangle : ShieldCheck" class="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{{ estimation.seuilDepasse ? estimation.seuilDepasse.texte : SOUS_LES_SEUILS }}</span>
                </p>
              </div>

              <!-- Recevoir l'estimation par e-mail : la demande part par
                   /api/tarif-lead, qui envoie les montants et le lien du
                   document, l'équipe en copie invisible. -->
              <div id="tarif-envoi" class="mt-6 rounded-2xl bg-white/10 p-4">
                <p v-if="demande.envoyee" id="tarif-envoi-merci" class="text-sm leading-relaxed" role="status">
                  {{ demande.mailee ? `C'est envoyé à ${demande.email}.` : `Nous avons bien reçu votre demande : un membre de l'équipe vous écrit à ${demande.email}.` }}
                </p>
                <form v-else id="tarif-envoi-form" @submit.prevent="envoyerEstimation">
                  <p class="text-sm leading-relaxed">Recevez cette estimation par e-mail, avec le document à imprimer. Elle ne vous engage à rien.</p>
                  <div class="mt-3 grid grid-cols-1 gap-2">
                    <label class="block">
                      <span class="block text-xs font-medium text-white/70 mb-1.5">Adresse e-mail</span>
                      <input id="tarif-envoi-email" v-model="demande.email" type="email" required maxlength="160" autocomplete="email" placeholder="vous@votre-collectivite.fr" class="champ-sombre" />
                    </label>
                    <label class="block">
                      <span class="block text-xs font-medium text-white/70 mb-1.5">Téléphone, facultatif</span>
                      <input id="tarif-envoi-tel" v-model="demande.telephone" type="tel" maxlength="30" autocomplete="tel" placeholder="06 12 34 56 78" class="champ-sombre" />
                    </label>
                  </div>
                  <button
                    type="submit" :disabled="demande.envoi"
                    class="mt-3 w-full inline-flex items-center justify-center gap-2.5 bg-white text-dark text-[15px] font-medium px-6 py-3.5 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-60"
                  >
                    {{ demande.envoi ? 'Envoi en cours' : 'Recevoir l\'estimation par e-mail' }}
                    <ArrowRight v-if="!demande.envoi" class="w-4 h-4" />
                  </button>
                  <p v-if="demande.erreur" class="mt-2 text-xs text-amber" role="alert">{{ demande.erreur }}</p>
                  <p class="mt-2 text-xs text-white/70 leading-relaxed">Nous nous en servons pour vous répondre sur cette estimation, rien d'autre.</p>
                </form>
              </div>

              <router-link
                :to="{ hash: '#contact' }" v-tilt-btn
                class="mt-6 w-full inline-flex items-center justify-center gap-2.5 bg-primary-ink text-white text-[15px] font-medium px-6 py-4 rounded-full hover:bg-red-700 transition-colors"
              >
                Nous écrire à propos de cette estimation
                <ArrowRight class="w-4 h-4" />
              </router-link>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <!-- Ce que dit la commande publique. Chaque phrase renvoie a un article
         du code (voir data/tarification.mjs) : une collectivite lira cette
         page avec son service des marches. -->
    <section class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div>
            <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark">
              Ce que regarde la commande publique
            </h2>
            <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">
              Votre collectivité n'apprécie pas un abonnement à son prix mensuel, mais à ce qu'il
              lui coûtera en tout : le montant hors taxes sur toute la durée du marché, mise en
              service et reconductions comprises. C'est ce total que l'estimation compare aux
              seuils. Un marché sans terme, ou de plus de quatre ans, compte pour quarante-huit mois.
            </p>
            <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">
              Elle y ajoute les services de même nature qu'elle achète par ailleurs dans l'année :
              le seuil se juge sur son besoin, pas sur notre seule facture. Et dès 25 000 € HT, le
              marché est écrit.
            </p>
            <p class="mt-5 text-xs text-gray-muted leading-relaxed max-w-[520px]">
              Seuils en vigueur pour les collectivités depuis le 1er avril 2026 (décret 2025-1386,
              articles R2121-1 à R2121-7, R2122-8 et R2131-12 du code de la commande publique) et
              seuil européen 2026-2027. Ce n'est pas un conseil juridique : votre service des
              marchés tranche.
            </p>
          </div>

          <ol class="bg-gray-bg rounded-3xl border border-gray-border p-6 sm:p-8 flex flex-col gap-5">
            <li class="flex gap-4">
              <span class="w-3 h-3 mt-1.5 rounded-full bg-green shrink-0" aria-hidden="true" />
              <span>
                <span class="block font-heading font-bold text-base text-dark">Sous 60 000 € HT</span>
                <span class="block mt-1 text-sm text-gray-text leading-relaxed">Commande sans publicité ni mise en concurrence préalables. La collectivité retient une offre pertinente, fait bon usage des deniers publics et ne contracte pas toujours avec le même fournisseur.</span>
              </span>
            </li>
            <li v-for="s in SEUILS" :key="s.montant" class="flex gap-4">
              <span class="w-3 h-3 mt-1.5 rounded-full shrink-0" :class="s.montant === SEUILS[SEUILS.length - 1].montant ? 'bg-primary' : 'bg-amber'" aria-hidden="true" />
              <span>
                <span class="block font-heading font-bold text-base text-dark">À partir de {{ s.court }} HT : {{ s.nom.toLowerCase() }}</span>
                <span class="block mt-1 text-sm text-gray-text leading-relaxed">{{ s.texte }}</span>
              </span>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <ContactBlock />

    <ChantiersParcours
      v-model:ouvert="parcoursOuvert"
      :territoire="territoire"
      :reponses="reponsesChantiers"
      :chargement="chargementTerritoire"
      :erreur="erreurTerritoire"
      :deja-retenu="retenus.includes('chantiers')"
      @choisir-territoire="choisirTerritoire"
      @valider="validerChantiers"
      @abandonner="(etape) => mesurer('pricing_chantiers_wizard_abandoned', { step: etape, territory_key: territoire?.cle || null })"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, AlertTriangle, ShieldCheck, FileText, MapPin, Loader2, SlidersHorizontal } from 'lucide-vue-next'
import HeroGround from '../components/HeroGround.vue'
import ContactBlock from '../components/ContactBlock.vue'
import TerritoireRecherche from '../components/TerritoireRecherche.vue'
import ChantiersParcours from '../components/ChantiersParcours.vue'
import { chargerTerritoire, cleValide } from '../data/territoires.mjs'
import { chiffrerTerritoire, nomPresume } from '../data/voirie.mjs'
import { modules, moduleByKey } from '../data/modules.js'
import {
  POPULATION, REPERES, ENGAGEMENTS, SEUILS, SOUS_LES_SEUILS, MISE_EN_SERVICE,
  estimer, estTarife, prixUnitaire, poidsDe, curseurVersPopulation, populationVersCurseur, borner,
  euros, nombre, pourcent,
} from '../data/tarification.mjs'
import { useChiffreAnime } from '../composables/useChiffreAnime.js'
import { useModeCommercial } from '../composables/useModeCommercial.js'

const route = useRoute()
const router = useRouter()

/* Ce que les visiteurs règlent sur la page, mesuré dans PostHog (docs/analytics.md).
 * Un bloqueur de traceurs peut empêcher le module de se charger : rien n'en dépend. */
const mesurer = (evenement, proprietes) => window.OPAnalytics?.capture?.(evenement, proprietes)

/* Le mode commercial ouvre le document à préparer : voir composables/useModeCommercial.js */
const commercial = useModeCommercial(route, router)

/* Les modules qui ont un prix, dans l'ordre de la vitrine */
const offre = modules.filter((m) => estTarife(m.key))

const PERIODES = [
  { cle: 'mois', label: 'Par mois' },
  { cle: 'an', label: 'Par an' },
]

/* L'état vient de l'adresse quand elle en porte un : une estimation se
 * partage en copiant le lien. */
const depuisAdresse = () => {
  const q = route.query
  const cles = String(q.modules || '').split(',').filter((k) => estTarife(k))
  const a = Number(q.annees)
  const cle = cleValide(q.territoire) ? String(q.territoire) : null
  const km = Number(q.km)
  return {
    population: q.population ? borner(q.population) : POPULATION.defaut,
    retenus: cles.length ? cles : ['carte'],
    annees: ENGAGEMENTS.some((e) => e.annees === a) ? a : 3,
    territoire: cle,
    // Les réponses du parcours Chantiers, quand l'adresse en porte
    reponses: cle && cles.includes('chantiers')
      ? { cle, nom: ['commune', 'interco', 'communes'].includes(q.nom) ? String(q.nom) : null, km: km > 0 ? km : null, sans: q.sans ? String(q.sans).split(',') : [], usage: ['permissions', 'arretes'].includes(q.usage) ? String(q.usage) : null }
      : null,
  }
}
const initial = depuisAdresse()
const population = ref(initial.population)
const retenus = ref(initial.retenus)
const annees = ref(initial.annees)

/* La collectivité choisie, chargée depuis les données publiques. Sa
 * population remplace le nombre d'habitants pour tous les modules. */
const territoire = ref(null)
const chargementTerritoire = ref(false)
const erreurTerritoire = ref('')
const reponsesChantiers = ref(initial.reponses)
const parcoursOuvert = ref(false)

/* `reponses` : celles que le parcours transmet en passant d'une commune à son
 * intercommunalité ; `depuisPage` : une collectivité choisie sur la page, qui
 * relance les questions de Chantiers quand le module est coché */
async function choisirTerritoire(p, reponses = null, depuisPage = false) {
  erreurTerritoire.value = ''
  if (!p) { territoire.value = null; return }
  chargementTerritoire.value = true
  try {
    const t = await chargerTerritoire(p.cle)
    territoire.value = t
    population.value = borner(t.population)
    if (!destinataire.value.collectivite) destinataire.value.collectivite = t.nom
    if (reponses) {
      reponsesChantiers.value = { cle: t.cle, ...reponses, km: null, sans: [] }
    } else if (retenus.value.includes('chantiers') && reponsesChantiers.value?.cle !== t.cle) {
      // Une nouvelle collectivité avec Chantiers coché : les données publiques
      // pré-remplissent, et les questions se reposent
      reponsesChantiers.value = { cle: t.cle, nom: nomPresume(t), usage: reponsesChantiers.value?.usage || null, km: null, sans: [] }
      if (depuisPage) ouvrirParcours('territory_changed')
    }
    mesurer('pricing_territory_selected', { territory_key: t.cle, territory_name: t.nom, territory_type: t.type, population: t.population, source: depuisPage ? 'page' : 'wizard' })
  } catch (err) {
    console.error('[Tarification] territoire illisible :', err)
    erreurTerritoire.value = "Nous n'avons pas pu lire les chiffres publics de ce territoire. Réessayez dans un instant, ou indiquez un nombre d'habitants."
  } finally {
    chargementTerritoire.value = false
  }
}

/* Chantiers reste coché : il se rechiffre sur la prochaine collectivité */
function effacerTerritoire() {
  territoire.value = null
}

const descriptionTerritoire = computed(() => {
  const t = territoire.value
  if (!t) return ''
  const habitants = `${nombre(t.population)} habitants`
  if (t.type === 'departement') return `Département · ${habitants}`
  if (t.type === 'epci') return `Intercommunalité de ${t.communes.length} communes · ${habitants}`
  return t.epci ? `Commune · ${t.epci.nom} · ${habitants}` : `Commune · ${habitants}`
})

/* Le prix de Chantiers : le modèle par espace, sur les réponses du parcours */
const chiffrage = computed(() => {
  const t = territoire.value
  const r = reponsesChantiers.value
  return t && r && r.cle === t.cle ? chiffrerTerritoire(t, r) : null
})
const taglineChantiers = computed(() => {
  if (!retenus.value.includes('chantiers')) return moduleByKey.chantiers?.tagline
  if (!chiffrage.value) return territoire.value || chargementTerritoire.value ? 'Lecture des chiffres publics du territoire.' : 'Choisissez votre collectivité pour le chiffrer.'
  const t = territoire.value
  if (t.type === 'commune' && chiffrage.value.org === 'toute') return `Les arrêtés de ${t.nom}, dans l'espace de son intercommunalité.`
  const n = chiffrage.value.espaces.length
  const seul = { permissions: ' Permissions de voirie seules.', arretes: ' Arrêtés de circulation seuls.' }[chiffrage.value.usage] || ''
  return (n > 1 ? `${n} espaces, un par commune.` : `Un espace pour ${chiffrage.value.espaces[0].nom}.`) + seul
})

function validerChantiers(reponses) {
  reponsesChantiers.value = reponses
  if (!retenus.value.includes('chantiers')) {
    retenus.value = offre.filter((m) => m.key === 'chantiers' || retenus.value.includes(m.key)).map((m) => m.key)
  }
  const c = chiffrage.value
  mesurer('pricing_chantiers_configured', {
    territory_key: territoire.value?.cle, territory_name: territoire.value?.nom,
    usage: c?.usage || 'both', subscriber: reponses.nom || null, organisation: c?.org,
    km: reponses.km ?? null, communes_excluded: reponses.sans?.length || 0,
    spaces: c?.espaces.length, annual_price: c ? Math.round(c.annuel) : null,
  })
}
const periode = ref('mois')

const curseur = computed(() => populationVersCurseur(population.value))

/* Ce que montre le champ : le nombre formaté, ou ce que le visiteur tape */
const populationSaisie = ref(nombre(population.value))
watch(population, (p) => { populationSaisie.value = nombre(p) })

function saisirPopulation() {
  const n = Number(String(populationSaisie.value).replace(/[^\d]/g, ''))
  if (n) {
    population.value = borner(n)
    mesurer('pricing_population_entered', { population: population.value, typed: n, source: 'typed' })
  }
  populationSaisie.value = nombre(population.value)
}

function basculer(cle) {
  const i = retenus.value.indexOf(cle)
  if (i >= 0) retenus.value = retenus.value.filter((k) => k !== cle)
  // Chantiers ne s'ajoute qu'au bout de son parcours, qui pose ses questions
  else if (cle === 'chantiers' && !chiffrage.value) ouvrirParcours('module_checked')
  else retenus.value = offre.filter((m) => m.key === cle || retenus.value.includes(m.key)).map((m) => m.key)
}

const estimation = computed(() => estimer({
  population: population.value,
  modules: retenus.value,
  annees: annees.value,
  prix: chiffrage.value ? { chantiers: chiffrage.value.mensuel } : {},
}))
// Le module qui porte la remise multi-modules, quand il y en a une
const remiseSur = (cle) => estimation.value.remiseModules.taux > 0 && estimation.value.remiseModules.module === cle
const prixModule = (cle) => (cle === 'chantiers' ? chiffrage.value?.mensuel || 0 : prixUnitaire(population.value) * poidsDe(cle))

/* L'estimation par e-mail : une adresse, un téléphone si l'on veut, et les
 * réglages du moment. La fonction /api/tarif-lead prévient l'équipe, envoie
 * l'accusé de réception et range la demande avec les demandes de contact.
 * `mailee` dit si l'accusé est bien parti : l'écran ne promet un message que
 * s'il a eu lieu. */
const demande = ref({ email: '', telephone: '', envoi: false, envoyee: false, mailee: false, erreur: '' })

async function envoyerEstimation() {
  demande.value.envoi = true
  demande.value.erreur = ''
  try {
    const r = await fetch('/api/tarif-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: demande.value.email.trim(),
        telephone: demande.value.telephone.trim(),
        population: population.value,
        modules: retenus.value,
        annees: annees.value,
        ...(territoire.value ? { territoire: { cle: territoire.value.cle, nom: territoire.value.nom } } : {}),
        ...(retenus.value.includes('chantiers') && chiffrage.value
          ? { chantiers: { mensuel: Math.round(chiffrage.value.mensuel * 100) / 100, espaces: chiffrage.value.espaces.length, organisation: chiffrage.value.org, reponses: reponsesChantiers.value } }
          : {}),
      }),
    })
    const corps = await r.json().catch(() => ({}))
    if (!r.ok || !corps.ok) throw new Error(corps.error || `HTTP ${r.status}`)
    demande.value.envoyee = true
    demande.value.mailee = corps.mailed === true
    window.OPAnalytics?.capture('tarif_demande_envoyee', { has_phone: !!demande.value.telephone.trim(), modules: retenus.value.length, annees: annees.value })
  } catch (err) {
    console.error('[Tarification] demande de tarif refusée :', err)
    demande.value.erreur = "Nous n'avons pas pu envoyer votre demande. Réessayez dans un instant, ou écrivez-nous par le formulaire en bas de page."
  } finally {
    demande.value.envoi = false
  }
}
const facteur = computed(() => (periode.value === 'mois' ? 1 : 12))
const principal = computed(() => estimation.value.mensuel * facteur.value)
const principalAnime = useChiffreAnime(principal)
const total = computed(() => estimation.value.total)
const totalAnime = useChiffreAnime(total)

/* La jauge du total : son échelle s'étend juste assez pour que le dernier
 * seuil et le total tiennent dedans, et la couleur dit où l'on en est. */
const jauge = computed(() => {
  const plafond = Math.max(SEUILS[1].montant * 1.35, total.value * 1.15)
  const depasses = SEUILS.filter((s) => total.value >= s.montant).length
  return {
    part: Math.min(100, (total.value / plafond) * 100),
    classe: depasses === 0 ? 'bg-green' : depasses < SEUILS.length ? 'bg-amber' : 'bg-primary',
    encart: depasses === 0 ? 'bg-white/5 text-white/70' : depasses < SEUILS.length ? 'bg-amber/15 text-amber' : 'bg-primary/20 text-white',
    // Un seuil hors de l'échelle n'est pas dessiné : il apparaît quand le total s'en approche
    reperes: SEUILS.filter((s) => s.montant <= plafond).map((s) => ({ ...s, part: (s.montant / plafond) * 100 })),
  }
})

/* Le parcours Chantiers : chaque ouverture est mesurée avec ce qui l'a déclenchée */
function ouvrirParcours(declencheur) {
  parcoursOuvert.value = true
  mesurer('pricing_chantiers_wizard_opened', { trigger: declencheur, territory_key: territoire.value?.cle || null })
}

/* L'état réglé, une fois le visiteur arrêté une seconde et demie : ce qu'il a
 * vraiment regardé, sans un événement par cran de curseur */
let mesureReglages = null
watch([population, retenus, annees, periode, territoire, reponsesChantiers], () => {
  clearTimeout(mesureReglages)
  mesureReglages = setTimeout(() => mesurer('pricing_settings_changed', {
    population: population.value,
    territory_key: territoire.value?.cle || null,
    territory_name: territoire.value?.nom || null,
    modules: retenus.value,
    years: annees.value,
    period: periode.value,
    chantiers_usage: retenus.value.includes('chantiers') ? chiffrage.value?.usage || 'both' : null,
    chantiers_annual_price: retenus.value.includes('chantiers') && chiffrage.value ? Math.round(chiffrage.value.annuel) : null,
    monthly_price: Math.round(estimation.value.mensuel),
    commercial_view: commercial.value,
  }), 1500)
}, { deep: true })

/* L'adresse suit les réglages, sans empiler d'historique : une estimation
 * se partage en copiant le lien, territoire et réponses Chantiers compris */
function requete() {
  const q = { population: String(population.value), modules: retenus.value.join(','), annees: String(annees.value) }
  if (territoire.value) q.territoire = territoire.value.cle
  const r = reponsesChantiers.value
  if (territoire.value && r?.cle === territoire.value.cle && retenus.value.includes('chantiers')) {
    if (r.nom) q.nom = r.nom
    if (r.km) q.km = String(r.km)
    if (r.sans?.length) q.sans = r.sans.join(',')
    if (r.usage) q.usage = r.usage
  }
  return q
}
watch([population, retenus, annees, territoire, reponsesChantiers], () => {
  router.replace({ query: requete() })
})

onMounted(() => {
  if (initial.territoire) choisirTerritoire({ cle: initial.territoire })
  else if (!route.query.population) router.replace({ query: requete() })
})

/* Le destinataire de l'estimation. La validité par défaut : soixante jours. */
const dansSoixanteJours = () => {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  return d.toISOString().slice(0, 10)
}
const destinataire = ref({
  collectivite: String(route.query.collectivite || ''),
  contact: String(route.query.contact || ''),
  suivi: String(route.query.suivi || ''),
  valide: String(route.query.valide || dansSoixanteJours()),
})

function ouvrirEstimation() {
  mesurer('pricing_estimate_document_opened', { modules: retenus.value, years: annees.value, territory_key: territoire.value?.cle || null })
  const q = { ...requete(), collectivite: destinataire.value.collectivite.trim() }
  if (destinataire.value.contact.trim()) q.contact = destinataire.value.contact.trim()
  if (destinataire.value.suivi.trim()) q.suivi = destinataire.value.suivi.trim()
  if (destinataire.value.valide) q.valide = destinataire.value.valide
  router.push({ name: 'estimation', query: q })
}

</script>

<style scoped>
.champ {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: #FAFAFA;
  font-size: 15px;
  color: #111111;
  outline: none;
  transition: border-color 0.2s ease;
}
.champ:focus { border-color: #FF0037; background: #ffffff; }
/* Le même champ, posé sur la carte sombre du résultat */
.champ-sombre {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 15px;
  color: #ffffff;
  outline: none;
  transition: border-color 0.2s ease;
}
.champ-sombre::placeholder { color: rgba(255, 255, 255, 0.45); }
.champ-sombre:focus { border-color: #ffffff; }
/* Le curseur : une piste fine, remplie jusqu'au curseur, et un bouton rond
   assez large pour le pouce. */
.curseur {
  -webkit-appearance: none;
  appearance: none;
  height: 28px;
  background: transparent;
  cursor: pointer;
}
.curseur::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, #111111 var(--part), rgba(0, 0, 0, 0.08) var(--part));
}
.curseur::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
}
.curseur::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: #111111;
}
.curseur::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 28px;
  height: 28px;
  margin-top: -11px;
  border-radius: 999px;
  background: #ffffff;
  border: 2px solid #111111;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s ease;
}
.curseur::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #ffffff;
  border: 2px solid #111111;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.curseur:active::-webkit-slider-thumb { transform: scale(1.12); }
.curseur:focus-visible { outline: 2px solid #FF0037; outline-offset: 6px; border-radius: 999px; }
</style>
