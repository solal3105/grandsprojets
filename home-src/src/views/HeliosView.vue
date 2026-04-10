<template>
  <div class="helios-page">
    <!-- ═══ HERO ═══ -->
    <section class="relative bg-gray-bg pt-20 pb-24 overflow-hidden">
      <div class="absolute top-[-124px] right-[-60px] w-[700px] h-[700px] blob-red opacity-40 blur-[120px] rounded-full pointer-events-none" />
      <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-purple opacity-30 blur-[120px] rounded-full pointer-events-none" />

      <div class="relative max-w-container mx-auto px-6">
        <!-- Co-branding logos -->
        <div class="flex items-center justify-center gap-5 mb-14">
          <img :src="`${base}img/logos/classic_color.png`" alt="Open Projets" class="h-9 w-auto" />
          <span class="text-gray-300 text-2xl font-extralight select-none">&times;</span>
          <img :src="`${base}img/partners/helios-logo.png`" alt="Helios" class="h-9 w-auto" />
        </div>

        <div class="max-w-[896px] mx-auto text-center">
          <span class="inline-flex items-center gap-2 text-[11px] font-semibold text-gray-text/40 uppercase tracking-[0.18em] mb-8">
            <span class="w-5 h-px bg-gray-border" />
            Partenariat exclusif
            <span class="w-5 h-px bg-gray-border" />
          </span>

          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Vos chantiers sur le terrain.
            <span class="text-gradient"> Visibles par tous.</span>
          </h1>

          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[609px] mx-auto">
            En tant que partenaire Helios, vous bénéficiez d'un accès privilégié à <strong class="text-dark">Open Projets</strong> — la carte interactive qui rend vos aménagements, travaux de voirie et projets urbains accessibles à chaque habitant, en temps réel.
          </p>
          <p class="mt-3 text-xs text-gray-text/50 tracking-wide">
            Déploiement en 1 heure · Aucune compétence technique requise · Sans engagement
          </p>

          <!-- CTAs -->
          <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="mailto:commercial@helios-marquage.fr" v-tilt-btn
              class="group inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/20">
              Contacter le commercial Helios
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </a>
            <router-link to="/" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border hover:border-gray-300 transition-colors">
              En savoir plus sur Open Projets
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
            </router-link>
          </div>
        </div>

        <!-- Browser mockup -->
        <div class="mt-14 max-w-[896px] mx-auto">
          <div class="rounded-xl border border-gray-border bg-white shadow-2xl shadow-black/5 overflow-hidden">
            <!-- Browser chrome -->
            <div class="flex items-center px-4 h-[46px] border-b border-gray-100 bg-gray-50 gap-3">
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span class="w-2.5 h-2.5 rounded-full bg-amber" />
                <span class="w-2.5 h-2.5 rounded-full" style="background:#5AAB7D" />
              </div>
              <div class="flex-1 bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-500 flex items-center gap-1.5 min-w-0">
                <Lock class="w-3 h-3 text-gray-300 shrink-0" />
                <span class="truncate">openprojets.com/votre-collectivite</span>
              </div>
              <RotateCw class="w-3.5 h-3.5 text-gray-300 shrink-0" />
            </div>
            <!-- Iframe -->
            <div class="relative bg-gray-100" style="height: 480px; overflow: hidden;">
              <iframe
                src="https://openprojets.com/default"
                title="Aperçu Open Projets"
                class="absolute top-0 left-0 border-0"
                style="width: calc(100% / 0.65); height: calc(100% / 0.65); transform: scale(0.65); transform-origin: top left;"
                loading="lazy"
              />
            </div>
          </div>
          <!-- Badge -->
          <div class="mt-4 flex items-center justify-center">
            <div class="inline-flex items-center gap-3 bg-white rounded-xl shadow-lg shadow-black/5 border border-gray-border px-4 py-2.5">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background-color: rgba(90,171,125,0.09)">
                <MapPin class="w-4 h-4" style="color:#5AAB7D" />
              </div>
              <div class="text-left">
                <p class="text-[11px] text-gray-400 leading-tight">Espace démonstration</p>
                <p class="text-[13px] font-medium text-dark leading-tight">Métropole de Lyon</p>
              </div>
              <span class="ml-2 relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                <span class="relative inline-flex rounded-full h-2 w-2" style="background:#5AAB7D" />
              </span>
              <span class="text-[11px] text-gray-400 font-medium">Live</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ TRUST BAR ═══ -->
    <section class="bg-white border-y border-gray-100 py-5">
      <div class="max-w-container mx-auto px-6 flex flex-wrap items-center justify-center gap-8 sm:gap-16">
        <div v-for="item in trustItems" :key="item.label" class="group flex items-center gap-2.5 cursor-default">
          <component :is="item.icon" class="w-3.5 h-3.5 text-primary transition-all duration-200 group-hover:scale-125 group-hover:-rotate-12" />
          <span class="text-[13px] text-gray-text tracking-wide transition-colors duration-200 group-hover:text-dark">{{ item.label }}</span>
        </div>
      </div>
    </section>

    <!-- ═══ LE CONSTAT — before/after table ═══ -->
    <section class="py-24 bg-white overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[680px] mx-auto text-center mb-16 reveal" :ref="setRevealRef(0)">
          <span class="inline-flex items-center gap-2.5 text-xs font-semibold text-amber uppercase tracking-widest mb-5">
            <span class="w-5 h-px bg-amber inline-block" />
            Le constat
          </span>
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
            Des millions d'euros investis dans l'espace public,
            <span class="text-gradient-green"> des administrés qui ne prennent pas la mesure des investissements.</span>
          </h2>
          <p class="mt-6 text-gray-text text-base leading-relaxed max-w-[560px] mx-auto">
            Marquage au sol, aménagements cyclables, requalification de voirie — les projets se concrétisent sur le terrain, mais l'information reste dans des comptes rendus. Les citoyens découvrent les travaux au dernier moment.
          </p>
        </div>

        <!-- Desktop + Mobile wrapper (single reveal ref) -->
        <div class="reveal" :ref="setRevealRef(1)">

        <!-- Desktop: Before / After table -->
        <div class="hidden sm:block max-w-[920px] mx-auto">
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[#F5F5F5]">
              <ArrowRight class="w-2.5 h-2.5 text-[#AAAAAA]" />
              <span class="text-xs font-bold uppercase tracking-widest text-[#AAAAAA]">Ce que vous faites déjà</span>
            </div>
            <div class="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-primary-light">
              <Check class="w-3 h-3 text-primary" />
              <span class="text-xs font-bold uppercase tracking-widest text-primary/70">En plus avec Open Projets</span>
            </div>
          </div>
          <div class="rounded-2xl overflow-hidden border border-gray-border shadow-lg shadow-black/8">
            <div v-for="(pair, i) in pairs" :key="i" class="group grid grid-cols-2" :class="{ 'border-t border-gray-border': i > 0 }">
              <div class="flex items-start gap-4 px-8 py-5 bg-[#FAFAFA] group-hover:bg-[#F3F3F3] transition-colors duration-200">
                <ArrowRight class="w-3 h-3 text-[#AAAAAA] shrink-0 mt-1" />
                <div>
                  <p class="text-[#2a2a2a] font-semibold text-base">{{ pair.before.title }}</p>
                  <p class="text-[#AAAAAA] text-sm leading-relaxed mt-1.5 max-h-0 overflow-hidden opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300">{{ pair.before.sub }}</p>
                </div>
              </div>
              <div class="flex items-start gap-4 px-8 py-5 bg-white border-l border-gray-border group-hover:bg-gray-bg transition-colors duration-200">
                <Check class="w-3.5 h-3.5 text-primary shrink-0 mt-1" />
                <div>
                  <p class="text-dark font-semibold text-base">{{ pair.after.title }}</p>
                  <p class="text-gray-text text-sm leading-relaxed mt-1.5 max-h-0 overflow-hidden opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300">{{ pair.after.sub }}</p>
                  <span class="inline-flex items-center mt-3 text-[11px] font-medium text-gray-text/50 bg-gray-bg border border-gray-border px-2.5 py-0.5 rounded-full">{{ pair.feature }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Mobile: Stacked cards -->
        <div class="sm:hidden space-y-3">
          <div v-for="(pair, i) in pairs" :key="'m'+i" class="rounded-2xl border border-gray-border overflow-hidden">
            <div class="flex items-start gap-3 px-5 py-5 bg-[#FAFAFA]">
              <ArrowRight class="w-3 h-3 text-[#AAAAAA] shrink-0 mt-0.5" />
              <div>
                <p class="text-[10px] font-bold uppercase text-[#AAAAAA] mb-1.5">Ce que vous faites</p>
                <p class="text-[#2a2a2a] font-semibold text-sm">{{ pair.before.title }}</p>
                <p class="text-[#AAAAAA] text-xs leading-relaxed mt-1">{{ pair.before.sub }}</p>
              </div>
            </div>
            <div class="flex items-start gap-3 px-5 py-5 bg-white border-t border-gray-border">
              <Check class="w-3 h-3 text-primary shrink-0 mt-0.5" />
              <div>
                <p class="text-[10px] font-bold uppercase text-primary/60 mb-1.5">En plus avec Open Projets</p>
                <p class="text-dark font-semibold text-sm">{{ pair.after.title }}</p>
                <p class="text-gray-text text-xs leading-relaxed mt-1">{{ pair.after.sub }}</p>
                <span class="inline-flex items-center mt-2.5 text-[10px] font-semibold text-gray-text/50 bg-gray-bg border border-gray-border px-2 py-0.5 rounded-full">{{ pair.feature }}</span>
              </div>
            </div>
          </div>
        </div>

        </div><!-- end reveal wrapper -->
      </div>
    </section>

    <!-- ═══ 3 PILIERS ═══ -->
    <section class="py-24 bg-gray-bg overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[680px] mx-auto text-center mb-16 reveal" :ref="setRevealRef(2)">
          <span class="inline-flex items-center gap-2.5 text-xs font-semibold text-primary uppercase tracking-widest mb-5">
            <span class="w-5 h-px bg-primary inline-block" />
            3 cas d'usage clés
          </span>
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
            Un outil,
            <span class="text-gradient"> trois bénéfices immédiats.</span>
          </h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 reveal" :ref="setRevealRef(3)">
          <div v-for="(pillar, i) in pillars" :key="i" :ref="setCardRef(i)" class="card-tilt" @mousemove="(e) => onMouseMove(e, i)" @mouseleave="onMouseLeave(i)">
            <div class="group relative bg-white rounded-2xl border border-gray-border overflow-hidden h-full transition-shadow duration-300 hover:shadow-xl">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="shineStyles[i]" />
              <div class="absolute top-0 left-0 right-0 h-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-2xl" :style="{ background: pillar.gradient }" />

              <!-- Image area -->
              <div class="h-52 bg-gray-100 relative overflow-hidden">
                <img :src="`${base}img/features/${pillar.image}`" :alt="pillar.title" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" loading="lazy" />
                <div class="absolute inset-0 overflow-hidden pointer-events-none">
                  <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-in-out" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-white/18 via-transparent to-white/45" />
                <span class="absolute top-4 right-4 font-heading font-bold text-4xl text-white/80 drop-shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:text-white">{{ String(i + 1).padStart(2, '0') }}</span>
              </div>

              <div class="p-8 relative z-20">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110" :class="pillar.bgClass">
                  <component :is="pillar.icon" class="w-6 h-6" :class="pillar.iconClass" />
                </div>
                <h3 class="font-heading font-bold text-xl text-dark mb-3">{{ pillar.title }}</h3>
                <p class="text-sm text-gray-text leading-relaxed mb-5">{{ pillar.desc }}</p>
                <ul class="space-y-3">
                  <li v-for="feat in pillar.features" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                    <Check class="w-4 h-4 text-primary shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                    <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ FEATURE: Suivi de chantier ═══ -->
    <section class="py-14 sm:py-20 lg:py-28 bg-white overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="setRevealRef(4)">
          <div>
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-amber/15 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110">
                <HardHat class="w-3.5 h-3.5 text-amber" />
              </span>
              <span class="text-xs font-bold text-amber uppercase tracking-widest">Suivi de chantier</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Chaque chantier Helios, localisé et suivi en temps réel.
            </h2>
            <p class="mt-5 text-gray-text text-base leading-relaxed">
              Marquage au sol, signalisation, aménagements cyclables — chaque intervention est localisée sur la carte avec ses dates, sa progression et ses zones d'impact. Vos riverains savent précisément ce qui se passe, et quand ça finit.
            </p>
            <ul class="mt-8 space-y-3.5">
              <li v-for="feat in chantierFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                <Check class="w-4 h-4 text-primary shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
              </li>
            </ul>
          </div>
          <div class="image-tilt" :ref="setImgRef(0)" @mousemove="(e) => onImgMove(e, 0)" @mouseleave="onImgLeave(0)">
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.10);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[0]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/2.jpeg`" alt="Module suivi de chantier" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ FEATURE: Communication interne ═══ -->
    <section class="py-14 sm:py-20 lg:py-28 bg-gray-bg overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="setRevealRef(5)">
          <div class="image-tilt order-2 lg:order-1" :ref="setImgRef(1)" @mousemove="(e) => onImgMove(e, 1)" @mouseleave="onImgLeave(1)">
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.10);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[1]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/1.jpeg`" alt="Interface de gestion des projets" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>
          <div class="order-1 lg:order-2">
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-purple/10 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110">
                <Building class="w-3.5 h-3.5 text-purple" />
              </span>
              <span class="text-xs font-bold text-purple uppercase tracking-widest">Communication interne</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Un référentiel partagé entre vos services.
            </h2>
            <p class="mt-5 text-gray-text text-base leading-relaxed">
              Urbanisme, voirie, espaces verts, communication — chaque service publie et consulte les mêmes projets, sur la même carte. Plus de doublons, plus de mails perdus : une source unique et toujours à jour.
            </p>
            <ul class="mt-8 space-y-3.5">
              <li v-for="feat in interneFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                <Check class="w-4 h-4 text-primary shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ FEATURE: Communication externe ═══ -->
    <section class="py-14 sm:py-20 lg:py-28 bg-white overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="setRevealRef(6)">
          <div>
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-green/15 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110">
                <Users class="w-3.5 h-3.5 text-green" />
              </span>
              <span class="text-xs font-bold text-green uppercase tracking-widest">Communication externe</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Vos administrés informés, sans effort.
            </h2>
            <p class="mt-5 text-gray-text text-base leading-relaxed">
              Fini les appels au standard. La carte publique est consultable 24h/24, sans inscription, sur mobile comme sur desktop. Chaque habitant retrouve les projets de son quartier en quelques secondes — et comprend ce qui change, pourquoi, et quand.
            </p>
            <ul class="mt-8 space-y-3.5">
              <li v-for="feat in externeFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                <Check class="w-4 h-4 text-primary shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
              </li>
            </ul>
          </div>
          <div class="image-tilt" :ref="setImgRef(2)" @mousemove="(e) => onImgMove(e, 2)" @mouseleave="onImgLeave(2)">
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.10);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[2]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/feature-consultation.jpeg`" alt="Carte publique consultable" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ COMMENT ÇA MARCHE ═══ -->
    <section class="py-24 bg-gray-bg overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[680px] mx-auto text-center mb-16 reveal" :ref="setRevealRef(7)">
          <span class="inline-flex items-center gap-2.5 text-xs font-semibold text-primary uppercase tracking-widest mb-5">
            <span class="w-5 h-px bg-primary inline-block" />
            Déploiement
          </span>
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
            Opérationnel en une heure,
            <span class="text-gradient"> sans compétence technique.</span>
          </h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 reveal" :ref="setRevealRef(8)">
          <div v-for="(step, i) in steps" :key="i" :ref="setStepRef(i)" class="card-tilt" @mousemove="(e) => onStepMove(e, i)" @mouseleave="onStepLeave(i)">
            <div class="group relative bg-white rounded-2xl border border-gray-border overflow-hidden h-full transition-shadow duration-300 hover:shadow-xl">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="stepShines[i]" />
              <div class="h-52 bg-gray-100 relative overflow-hidden">
                <img :src="`${base}img/features/${step.image}`" :alt="step.title" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" loading="lazy" />
                <div class="absolute inset-0 overflow-hidden pointer-events-none">
                  <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-in-out" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-white/18 via-transparent to-white/45" />
                <span class="absolute top-4 right-4 font-heading font-bold text-4xl text-white/80 drop-shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:text-white">{{ step.num }}</span>
              </div>
              <div class="p-6 relative z-20">
                <h3 class="font-heading font-semibold text-lg text-dark mb-2">{{ step.title }}</h3>
                <p class="text-sm text-gray-text leading-relaxed">{{ step.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ GARANTIES ═══ -->
    <section class="py-24 bg-white overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[680px] mx-auto text-center mb-16 reveal" :ref="setRevealRef(9)">
          <span class="inline-flex items-center gap-2.5 text-xs font-semibold text-gray-text/40 uppercase tracking-widest mb-5">
            <span class="w-5 h-px bg-gray-border inline-block" />
            Garanties
          </span>
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
            Français, souverain, open source.
            <span class="text-gradient-green"> Aucun compromis.</span>
          </h2>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 reveal" :ref="setRevealRef(10)">
          <div v-for="g in guarantees" :key="g.title" class="group flex flex-col items-start gap-4 rounded-2xl border border-gray-border bg-gray-bg p-7 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-default">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" :class="g.bgClass">
              <component :is="g.icon" class="w-5 h-5" :class="g.iconClass" />
            </div>
            <div>
              <h4 class="font-heading font-semibold text-base text-dark mb-1">{{ g.title }}</h4>
              <p class="text-sm text-gray-text leading-relaxed">{{ g.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ CTA FINAL ═══ -->
    <section class="relative py-32 bg-dark overflow-hidden">
      <div class="absolute inset-0 cta-glow">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blob-red blur-[160px] rounded-full" />
      </div>
      <div class="relative max-w-container mx-auto px-6 text-center">
        <div class="flex items-center justify-center gap-5 mb-10">
          <img :src="`${base}img/logos/square_white.png`" alt="Open Projets" class="h-10 w-auto opacity-80" />
          <span class="text-white/30 text-2xl font-extralight select-none">&times;</span>
          <img :src="`${base}img/partners/helios-logo.png`" alt="Helios" class="h-10 w-auto invert brightness-200" />
        </div>
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[52px] leading-tight tracking-tight text-white">
          Prêt à rendre vos projets
          <br />
          <span class="text-gradient">visibles par tous ?</span>
        </h2>
        <p class="mt-6 text-white/60 text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
          Contactez votre commercial Helios pour activer Open Projets sur votre territoire. Déploiement en une heure, accompagnement inclus.
        </p>
        <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="mailto:commercial@helios-marquage.fr" v-tilt-btn class="group inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-all duration-200 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40">
            Contacter le commercial Helios
            <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </a>
          <router-link to="/" v-tilt-btn class="inline-flex items-center gap-2.5 bg-white/10 text-white text-sm font-medium px-7 py-4 rounded-full border border-white/20 hover:bg-white/20 transition-all duration-200">
            En savoir plus sur Open Projets
            <ArrowUpRight class="w-3.5 h-3.5 text-white/60" />
          </router-link>
        </div>
      </div>
    </section>

    <!-- ═══ FOOTER MINIMAL ═══ -->
    <footer class="bg-dark border-t border-white/10 py-8">
      <div class="max-w-container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3 text-white/40 text-sm">
          <img :src="`${base}img/logos/square_white.png`" alt="Open Projets" class="h-6 w-auto opacity-60" />
          <span>&copy; {{ new Date().getFullYear() }} Open Projets — VAZY, Société à Mission</span>
        </div>
        <a href="https://openprojets.com/home/" class="text-sm text-white/40 hover:text-white transition-colors">openprojets.com</a>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import {
  ArrowRight, ArrowUpRight, Check,
  MapPin, HardHat, Users,
  ShieldCheck, Github, Server, Unlock,
  Zap, Building, Lock, RotateCw,
} from 'lucide-vue-next'

const base = import.meta.env.BASE_URL

// ── Trust bar ───────────────────────────────────────────────────────────────────
const trustItems = [
  { icon: ShieldCheck, label: 'RGPD Conforme' },
  { icon: Github, label: 'Open Source' },
  { icon: Server, label: 'Hébergement UE' },
  { icon: Zap, label: 'Aucune formation requise' },
  { icon: Unlock, label: 'Sans engagement ni dépendance' },
]

// ── Before / After pairs ────────────────────────────────────────────────────────
const pairs = [
  {
    before: {
      title: 'Un chantier Helios démarre sur la commune',
      sub: "L'info reste dans les échanges de mails entre services. Les riverains ne sont pas prévenus.",
    },
    after: {
      title: 'Le chantier est localisé sur la carte avec dates et avancement',
      sub: 'Les riverains consultent la carte et comprennent ce qui se passe sur leur rue.',
    },
    feature: 'Module Travaux',
  },
  {
    before: {
      title: 'Vous informez via réunions et comptes rendus PDF',
      sub: 'Les documents circulent mal. Les élus manquent de visuels concrets pour communiquer.',
    },
    after: {
      title: 'Chaque projet est visible en un clic, avec fiche et photos',
      sub: 'Les élus partagent un lien unique lors des réunions publiques et comités.',
    },
    feature: 'Carte publique',
  },
  {
    before: {
      title: 'Plusieurs services gèrent des projets en parallèle',
      sub: "Pas de vue d'ensemble. Les doublons passent inaperçus.",
    },
    after: {
      title: 'Tous les projets sur une carte unique, partagée entre services',
      sub: 'Urbanisme, voirie, espaces verts — chacun publie et consulte les mêmes données.',
    },
    feature: 'Gestion multi-services',
  },
  {
    before: {
      title: 'Les habitants appellent le standard pour savoir ce qui se passe',
      sub: 'Le secrétariat passe du temps à répondre aux mêmes questions.',
    },
    after: {
      title: "L'information est accessible 24h/24, sans appeler",
      sub: 'Carte consultable sur mobile, sans inscription. Recherche par quartier.',
    },
    feature: 'Consultation citoyenne',
  },
  {
    before: {
      title: 'Les projets votés en conseil restent dans les archives',
      sub: 'Aucune visibilité publique sur les engagements tenus.',
    },
    after: {
      title: 'Les projets sont publiés dès la décision actée',
      sub: "Transparence sur les engagements de mandat. Suivi d'avancement visible par tous.",
    },
    feature: 'Transparence',
  },
]

// ── 3 pillars ───────────────────────────────────────────────────────────────────
const pillars = [
  {
    icon: HardHat,
    title: 'Suivi de chantier',
    image: '2.jpeg',
    desc: "Localisez chaque intervention Helios sur la carte. Dates, zones d'impact, progression — les riverains sont informés en temps réel, les services suivent l'avancement.",
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
    gradient: 'linear-gradient(to right, #F2B327, #5AAB7D)',
    features: [
      'Zones de chantier dessinées sur la carte',
      'Barre de progression en temps réel',
      'Dates de début / fin visibles par tous',
    ],
  },
  {
    icon: Building,
    title: 'Coordination inter-services',
    image: '5.jpeg',
    desc: "Urbanisme, voirie, espaces verts — tous vos services publient et consultent les mêmes projets. Une source de vérité unique qui évite les doublons et les mails perdus.",
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
    gradient: 'linear-gradient(to right, #4E2BFF, #7C3AED)',
    features: [
      "Gestion d'équipe avec rôles (admin / contributeur)",
      'Catégories personnalisées par service',
      'Vue cartographique consolidée de tout le territoire',
    ],
  },
  {
    icon: Users,
    title: 'Information citoyenne',
    image: 'feature-consultation.jpeg',
    desc: "Carte publique, sans inscription, accessible sur mobile. Chaque habitant retrouve les projets de son quartier en quelques secondes. Fini les appels au standard.",
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
    gradient: 'linear-gradient(to right, #5AAB7D, #2563EB)',
    features: [
      'Filtres par catégorie et recherche textuelle',
      'Géolocalisation pour voir les projets autour de soi',
      'Fiches détaillées avec images et descriptions',
    ],
  },
]

// ── Feature section lists ───────────────────────────────────────────────────────
const chantierFeats = [
  'Zone de chantier dessinée directement sur la carte',
  'Barre de progression et dates prévisionnelles',
  'Mises à jour en temps réel par les agents terrain',
  'Historique complet des modifications',
  'Notification des riverains via la carte publique',
]

const interneFeats = [
  'Chaque service publie dans ses catégories dédiées',
  'Vue cartographique consolidée de tous les projets en cours',
  'Rôles contributeur / admin pour structurer les droits',
  'Filtres croisés par catégorie, état, et date',
  "Aucune dépendance DSI — tout se configure dans l'admin",
]

const externeFeats = [
  'Carte publique consultable sans inscription ni téléchargement',
  'Responsive : fonctionne sur mobile, tablette et desktop',
  'Géolocalisation pour afficher les projets de son quartier',
  'Fiches complètes avec images, descriptions et liens',
  'Lien partageable en un clic lors des réunions publiques',
]

// ── Steps ───────────────────────────────────────────────────────────────────────
const steps = [
  {
    num: '01',
    image: '4.jpeg',
    title: 'On configure votre espace',
    desc: 'Logo, couleurs, fond de carte — votre identité visuelle est appliquée en quelques clics. Votre carte ressemble à votre collectivité.',
  },
  {
    num: '02',
    image: '1.jpeg',
    title: 'Vos équipes publient',
    desc: 'Interface intuitive : dessiner une zone, remplir une fiche, ajouter une photo. Aucune compétence technique requise.',
  },
  {
    num: '03',
    image: 'feature-consultation.jpeg',
    title: 'Vos habitants consultent',
    desc: 'La carte est publique, sans inscription, accessible sur mobile. Chaque citoyen voit les projets et travaux de son quartier.',
  },
]

// ── Guarantees ──────────────────────────────────────────────────────────────────
const guarantees = [
  {
    icon: MapPin,
    title: 'Entreprise française',
    desc: 'Développé à Lyon, inscrit au RCS. Équipe locale, décision locale.',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
  },
  {
    icon: ShieldCheck,
    title: 'Données souveraines',
    desc: 'Hébergement UE, zéro traceur, RGPD natif. Export complet à tout moment.',
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
  },
  {
    icon: Github,
    title: 'Open source',
    desc: 'Code public, licence permissive. Aucun enfermement propriétaire possible.',
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
  },
  {
    icon: Unlock,
    title: 'Sans engagement',
    desc: 'Tarif transparent, sans frais cachés. Vous restez libre, toujours.',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
  },
]

// ── Ref setters (for template refs in v-for) ────────────────────────────────────
const revealEls = ref([])
const cardEls = ref([])
const imgEls = ref([])
const stepEls = ref([])

function setRevealRef(i) {
  return (el) => { revealEls.value[i] = el }
}
function setCardRef(i) {
  return (el) => { cardEls.value[i] = el }
}
function setImgRef(i) {
  return (el) => { imgEls.value[i] = el }
}
function setStepRef(i) {
  return (el) => { stepEls.value[i] = el }
}

// ── Card tilt + glare (pillars) ─────────────────────────────────────────────────
const shineStyles = reactive([{}, {}, {}])

function onMouseMove(e, i) {
  const el = cardEls.value[i]
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  el.style.transition = 'transform 0.08s ease'
  el.style.transform = 'perspective(700px) rotateX(' + (-y * 7) + 'deg) rotateY(' + (x * 7) + 'deg) translateZ(10px)'
  shineStyles[i] = {
    background: 'radial-gradient(circle at ' + ((x + 0.5) * 100) + '% ' + ((y + 0.5) * 100) + '%, rgba(255,255,255,0.2) 0%, transparent 60%)',
  }
}

function onMouseLeave(i) {
  const el = cardEls.value[i]
  if (!el) return
  el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
  el.style.transform = ''
  shineStyles[i] = {}
}

// ── Image tilt (feature sections) ───────────────────────────────────────────────
const imgShines = reactive([{}, {}, {}])

function onImgMove(e, i) {
  const el = imgEls.value[i]
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  el.style.transition = 'transform 0.08s ease'
  el.style.transform = 'perspective(900px) rotateX(' + (-y * 5) + 'deg) rotateY(' + (x * 5) + 'deg) translateZ(8px)'
  imgShines[i] = {
    background: 'radial-gradient(circle at ' + ((x + 0.5) * 100) + '% ' + ((y + 0.5) * 100) + '%, rgba(255,255,255,0.15) 0%, transparent 60%)',
  }
}

function onImgLeave(i) {
  const el = imgEls.value[i]
  if (!el) return
  el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
  el.style.transform = ''
  imgShines[i] = {}
}

// ── Step cards tilt ─────────────────────────────────────────────────────────────
const stepShines = reactive([{}, {}, {}])

function onStepMove(e, i) {
  const el = stepEls.value[i]
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  el.style.transition = 'transform 0.08s ease'
  el.style.transform = 'perspective(700px) rotateX(' + (-y * 7) + 'deg) rotateY(' + (x * 7) + 'deg) translateZ(10px)'
  stepShines[i] = {
    background: 'radial-gradient(circle at ' + ((x + 0.5) * 100) + '% ' + ((y + 0.5) * 100) + '%, rgba(255,255,255,0.2) 0%, transparent 60%)',
  }
}

function onStepLeave(i) {
  const el = stepEls.value[i]
  if (!el) return
  el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
  el.style.transform = ''
  stepShines[i] = {}
}

// ── Scroll reveal ───────────────────────────────────────────────────────────────
onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  )
  revealEls.value.forEach((el) => { if (el) observer.observe(el) })
})
</script>

<style scoped>
.card-tilt,
.image-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}

.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.65s ease, transform 0.65s cubic-bezier(0.23, 1, 0.32, 1);
}
.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@keyframes cta-pulse {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.28; }
}
.cta-glow {
  animation: cta-pulse 7s ease-in-out infinite;
}
</style>
