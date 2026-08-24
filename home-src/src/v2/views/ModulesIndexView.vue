<template>
  <div>
    <section class="relative pt-36 pb-20 overflow-hidden">
      <HeroGround />
      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[720px] mx-auto text-center">
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] tracking-tight-hero text-dark">
            Quatre modules partagent un seul espace
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed">
            Chacun s'active indépendamment, sur le même socle et la même identité visuelle.
          </p>
        </div>
      </div>
    </section>

    <ModuleSelector />
    <ValueChain />
    <DemoChoice />
    <ContactBlock />
  </div>
</template>

<script setup>
import HeroGround from '../components/HeroGround.vue'
import ModuleSelector from '../components/ModuleSelector.vue'
import ValueChain from '../components/ValueChain.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'
</script>
