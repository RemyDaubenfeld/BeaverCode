<template class="min-h-screen ">
    <div class="flex items-center justify-center mt-15">
        <h1 class="text-8xl font-display font-semibold">BeaverCode</h1>
        <img src="/assets/img/logo.webp" alt=""  class="h-30 w-30 ml-4">
    </div>

    <div class="flex items-center justify-center mt-15">
      <div class="grid grid-cols-2 gap-7 max-w-2xl">
        <div class="flex flex-col h-70 w-70 items-center justify-center text-center border-2 border-bc-border-strong bg-bc-surface rounded-bc shadow-bc-hard p-4 text-bc-text-primary">
          <img class="h-30 w-30 mb-5" src="assets/img/cpu_color.webp" alt="CPU">
          <p class="font-medium mb-3">{{ cpuBrand ?? '—' }}</p>
          <p class="text-sm text-bc-text-secondary">{{ cpuPhysicalCores ?? '—' }} cœurs physiques / {{ cpuCores ?? '—' }} logiques</p>
        </div>

        <div class="flex flex-col h-70 w-70 items-center justify-center text-center border-2 border-bc-border-strong bg-bc-surface rounded-bc shadow-bc-hard p-4 text-bc-text-primary">
          <img class="h-30 w-30 mb-5" src="assets/img/ram_color.webp" alt="Ram">
          <p class="font-medium">{{ formatMB(ramTotalMB) }}</p>
        </div>

        <div v-if="gpus.length === 0" class="flex flex-col h-70 w-70 items-center justify-center text-center border-2 border-bc-border-strong bg-bc-surface rounded-bc shadow-bc-hard p-4 text-bc-text-primary">
          <p class="text-xs uppercase tracking-wide text-bc-text-secondary mb-1">GPU</p>
          <p class="font-medium">aucun détecté</p>
        </div>
        <div v-for="gpu in gpus" :key="gpu.model" class="flex flex-col h-70 w-70 items-center justify-center text-center border-2 border-bc-border-strong bg-bc-surface rounded-bc shadow-bc-hard p-4 text-bc-text-primary">
          <img class="h-30 w-30 mb-5" src="assets/img/gpu_color.webp" alt="GPU">
          <p class="font-medium mb-3">{{ gpu.model }}</p>
          <p class="text-sm text-bc-text-secondary">{{ formatMB(gpu.vramMB) }} VRAM</p>
        </div>
      </div>
    </div>
</template>

<script setup>
const { cpuBrand, cpuCores, cpuPhysicalCores, ramTotalMB, gpus } = useSystem()

function formatMB(mb) {
  if (mb == null) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`
}
</script>