<template>

  <div class="relative flex items-center border-b-2 border-bc-border-strong bg-bc-surface px-4 py-2 text-sm text-bc-text-primary">
    <div class="absolute left-4 flex items-center">
      <button
        @click="showLoaded = true"
        class="rounded-bc px-2 py-1 text-sm font-mono text-bc-text-primary hover:bg-bc-surface-alt cursor-pointer"
      >
        {{ loadedModels.length }} modèle{{ loadedModels.length > 1 ? 's' : '' }} chargé{{ loadedModels.length > 1 ? 's' : '' }}
      </button>
      <LoadedModelsModal v-if="showLoaded" @close="showLoaded = false" />

      <button
        v-if="benchmarkModelOrder.length"
        @click="showResultsModal = true"
        class="ml-2 rounded-bc px-2 py-1 text-sm font-mono text-bc-text-primary hover:bg-bc-surface-alt cursor-pointer"
        :class="benchmarkRunning ? 'text-bc-orange animate-pulse' : ''"
      >
        {{ benchmarkRunning
          ? `Benchmark en cours… (${benchmarkGlobalProgressPercent}%)`
          : 'Voir le dernier run' }}
      </button>
      <BenchmarkResultsModal v-if="showResultsModal" />
    </div>
    <div class="mx-auto flex items-center gap-4 font-mono">
      <div class="flex items-center gap-1.5">
        <span>CPU : <span class="font-medium text-bc-text-primary">{{ cpuLoad ?? '—' }}%</span></span>
        <StatBarInline :percent="cpuLoad" />
      </div>

      <div class="flex items-center gap-1.5">
        <span>
          RAM : <span class="font-medium text-bc-text-primary">{{ ramLoad ?? '—' }}%</span>
          <span v-if="ramTotalMB"> ({{ formatMB(ramUsedMB) }} / {{ formatMB(ramTotalMB) }})</span>
        </span>
        <StatBarInline :percent="ramLoad" />
      </div>

      <span v-if="gpus.length === 0">GPU : <span class="font-medium text-bc-text-primary">aucun détecté</span></span>
      <div v-for="gpu in gpus" :key="gpu.model" class="flex items-center gap-1.5">
        <span>
          GPU : <span class="font-medium text-bc-text-primary">{{ gpu.loadPercent ?? '—' }}%</span>
          <span v-if="gpu.memoryTotalMB"> ({{ formatMB(gpu.memoryUsedMB) }} / {{ formatMB(gpu.memoryTotalMB) }})</span>
        </span>
        <StatBarInline :percent="gpu.loadPercent" />
      </div>
    </div>
  </div>
</template>

<script setup>
const { cpuLoad, ramLoad, ramUsedMB, ramTotalMB, gpus } = useHardware()
const { loadedModels } = useModels()
const {
  running: benchmarkRunning,
  modelOrder: benchmarkModelOrder,
  globalProgressPercent: benchmarkGlobalProgressPercent,
  showResultsModal,
} = useBenchmarkRun()

const showLoaded = ref(false)

function formatMB(mb) {
  if (mb == null) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`
}
</script>