<template>
  <aside class="flex justify-between h-screen w-56 shrink-0 flex-col border-r-2 border-bc-border-strong bg-bc-surface p-4">
    <div>
      <div class="mb-6 flex justify-center px-2 text-lg font-display font-semibold text-bc-text-primary">
        <img  src="assets/img/BeaverCode_logo.webp" alt="Logo BeaverCode">
      </div>

      <nav class="flex flex-col gap-1">
        <NuxtLink
          v-for="item in navigation"
          :key="item.href"
          :to="item.href"
          class="flex items-center gap-3 rounded-bc px-3 py-2 text-sm font-mono font-medium text-bc-text-secondary hover:bg-bc-surface-alt hover:text-bc-text-primary"
          active-class="bg-bc-surface-alt text-bc-orange-light border border-bc-orange"
        >
          <component :is="item.icon" class="size-5" aria-hidden="true" />
          {{ item.name }}
        </NuxtLink>
      </nav>
    </div>
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2 py-2 text-bc-text-primary">
        <img class="size-12 shrink-0" src="assets/img/cpu_color.webp" alt="CPU">
        <div class="min-w-0 flex-1 text-center">
          <p class="mb-1 text-xs font-medium">{{ cpuBrand ?? '—' }}</p>
          <p class="text-[10px] text-bc-text-secondary">{{ cpuPhysicalCores ?? '—' }} cœurs / {{ cpuCores ?? '—' }} threads</p>
        </div>
      </div>

      <div class="flex items-center gap-2 py-2 text-bc-text-primary">
        <img class="size-12 shrink-0" src="assets/img/ram_color.webp" alt="RAM">
        <div class="min-w-0 flex-1 text-center">
          <p class="mb-1 text-xs font-medium">{{ formatMB(ramTotalMB) }} RAM</p>
        </div>
      </div>

      <div v-if="gpus.length === 0" class="flex items-center gap-2 py-2 text-bc-text-primary">
        <img class="size-12 shrink-0" src="assets/img/gpu_color.webp" alt="GPU">
        <div class="min-w-0 flex-1 text-center">
          <p class="mb-1 text-xs font-medium">Aucun GPU</p>
          <p class="text-[10px] text-bc-text-secondary">Non détecté</p>
        </div>
      </div>

      <div v-for="gpu in gpus" :key="gpu.model" class="flex items-center gap-2 py-2 text-bc-text-primary">
        <img class="size-12 shrink-0" src="assets/img/gpu_color.webp" alt="GPU">
        <div class="min-w-0 flex-1 text-center">
          <p class="mb-1 text-xs font-medium">{{ gpu.model }}</p>
          <p class="text-[10px] text-bc-text-secondary">{{ formatMB(gpu.vramMB) }} VRAM</p>
        </div>
      </div>
    </div>
    
  </aside>
</template>

<script setup>
import { HomeIcon, ChartBarIcon, ChatBubbleLeftRightIcon, CircleStackIcon, ExclamationCircleIcon, WrenchScrewdriverIcon } from '@heroicons/vue/24/outline'

const navigation = [
  { name: 'WebUI', href: '/webui', icon: ChatBubbleLeftRightIcon },
  { name: 'Modèles', href: '/models', icon: CircleStackIcon },
  { name: 'Benchmark', href: '/benchmark', icon: ChartBarIcon },
  { name: 'Paramètrage', href: '/settings', icon: WrenchScrewdriverIcon},
  { name: 'Logs', href: '/logs', icon: ExclamationCircleIcon }
]

const { cpuBrand, cpuCores, cpuPhysicalCores, ramTotalMB, gpus } = useSystem()

function formatMB(mb) {
  if (mb == null) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`
}
</script>
