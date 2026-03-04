<template>
  <section class="relative bg-gray-bg pt-36 pb-24 overflow-hidden">
    <!-- Decorative blobs -->
    <div class="absolute top-[-124px] right-[-60px] w-[700px] h-[700px] blob-red opacity-40 blur-[120px] rounded-full pointer-events-none" />
    <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-purple opacity-30 blur-[120px] rounded-full pointer-events-none" />

    <div class="relative max-w-container mx-auto px-6">
      <!-- Text content -->
      <div class="max-w-[896px] mx-auto text-center">
        <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
          La carte interactive que votre collectivité déploie pour
          <span class="text-gradient"> informer ses administrés</span>
        </h1>

        <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[609px] mx-auto">
          Commune, intercommunalité ou métropole : publiez vos projets d'aménagement et vos chantiers sur une carte publique à vos couleurs, consultable par tous, sans inscription.
        </p>

        <!-- CTAs -->
        <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <router-link
            to="/contact"
            class="inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/20"
          >
            Demander une démo
            <ArrowRight class="w-4 h-4" />
          </router-link>

          <a
            href="https://grandsprojets.com"
            target="_blank"
            class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
          >
            <MapIcon class="w-4 h-4" />
            Voir l'exemple Lyon
            <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
          </a>
        </div>
      </div>

      <!-- Browser mockup -->
      <div class="mt-12 max-w-[896px] mx-auto">
        <div class="rounded-xl border border-gray-border bg-white shadow-2xl shadow-black/5 overflow-hidden">
          <!-- Browser bar -->
          <div class="flex items-center px-4 h-[46px] border-b border-gray-100 bg-gray-50">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-red-400" />
              <span class="w-2 h-2 rounded-full bg-amber" />
              <span class="w-2 h-2 rounded-full bg-green-400" />
            </div>
            <div class="mx-auto bg-white border border-gray-200 rounded-full px-6 py-1.5 text-xs text-gray-400">
              votre-collectivite.openprojets.com
            </div>
          </div>
          <!-- Screenshot -->
          <div class="aspect-[894/380] bg-gray-100">
            <img
              src="https://www.figma.com/api/mcp/asset/87e83e28-8f92-4d8b-8592-b219c1c63faf"
              alt="Aperçu carte Open Projets"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>

        <!-- Badge -->
        <div class="mt-4 inline-flex items-center gap-3 bg-white rounded-xl shadow-lg shadow-black/5 border border-gray-border px-4 py-3">
          <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <MapPin class="w-4 h-4 text-primary" />
          </div>
          <div class="text-left">
            <p class="text-[11px] text-gray-400 leading-tight">Espace démonstration</p>
            <p class="text-[13px] font-medium text-dark leading-tight">Métropole de Lyon</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, MapIcon, MapPin } from 'lucide-vue-next'
</script>
