<template>
  <div class="h-4 w-16 rounded-full border border-bc-border bg-bc-surface-alt overflow-hidden">
    <div
      class="h-full rounded-full transition-all duration-300 ease-out"
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
  if (clamped.value >= 90) return 'bg-bc-danger'
  if (clamped.value >= 70) return 'bg-bc-orange'
  return 'bg-bc-green'
})
</script>