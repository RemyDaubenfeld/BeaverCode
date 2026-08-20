<template>
  <div class="h-4 w-16 border border-white/10 bg-gray-800 overflow-hidden">
    <div
      class="h-full transition-all duration-300 ease-out"
      :class="barColor"
      :style="{ width: clamped + '%' }"
    />
  </div>
</template>

<script setup>
const props = defineProps({
  percent: { type: Number, default: null }
})

// on clamp entre 0 et 100 (et 0 si valeur absente/nulle)
const clamped = computed(() => {
  if (props.percent == null) return 0
  return Math.min(100, Math.max(0, props.percent))
})

// vert -> orange -> rouge selon la charge, supprime si tu veux rester en vert fixe
const barColor = computed(() => {
  if (clamped.value >= 90) return 'bg-red-500'
  if (clamped.value >= 70) return 'bg-orange-400'
  return 'bg-green-500'
})
</script>