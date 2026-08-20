<template>

  <div class="relative flex items-center border border-white/10 bg-gray-900 px-4 py-2 text-sm text-gray-200">
    <div class="absolute left-4 flex items-center">
      Modèle chargé :
      <span class="ml-1 font-medium text-white">{{ modelName ?? 'aucun' }}</span>
    </div>
    <div class="mx-auto flex items-center gap-4">
      <div class="flex items-center gap-1.5">
        <span>CPU : <span class="font-medium text-white">{{ cpuLoad ?? '—' }}%</span></span>
        <StatBarInline :percent="cpuLoad" />
      </div>

      <div class="flex items-center gap-1.5">
        <span>
          RAM : <span class="font-medium text-white">{{ ramLoad ?? '—' }}%</span>
          <span v-if="ramTotalMB"> ({{ formatMB(ramUsedMB) }} / {{ formatMB(ramTotalMB) }})</span>
        </span>
        <StatBarInline :percent="ramLoad" />
      </div>

      <span v-if="gpus.length === 0">GPU : <span class="font-medium text-white">aucun détecté</span></span>
      <div v-for="gpu in gpus" :key="gpu.model" class="flex items-center gap-1.5">
        <span>
          GPU : <span class="font-medium text-white">{{ gpu.loadPercent ?? '—' }}%</span>
          <span v-if="gpu.memoryTotalMB"> ({{ formatMB(gpu.memoryUsedMB) }} / {{ formatMB(gpu.memoryTotalMB) }})</span>
        </span>
        <StatBarInline :percent="gpu.loadPercent" />
      </div>
    </div>
  </div>
</template>

<script setup>
const { cpuLoad, ramLoad, ramUsedMB, ramTotalMB, gpus } = useHardware()
const { modelName } = useModels()

function formatMB(mb) {
  if (mb == null) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`
}
</script>