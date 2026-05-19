<template>
  <div
    class="absolute right-[-60px] w-[700px] h-[700px] rounded-full pointer-events-none opacity-40 blur-[120px]"
    :class="top"
    :style="{ top: topOffset }"
  />
  <div
    class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] rounded-full pointer-events-none opacity-30 blur-[120px]"
    :class="bottom"
  />
</template>

<script setup>
defineProps({
  top: { type: String, default: 'blob-red' },
  bottom: { type: String, default: 'blob-purple' },
  topOffset: { type: String, default: '-124px' },
})
</script>
