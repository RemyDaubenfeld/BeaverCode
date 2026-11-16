<template>
  <aside class="flex justify-between h-screen w-56 shrink-0 flex-col border-r-2 border-bc-border-strong bg-bc-surface">
    <!-- haut : logo + navigation -->
    <div class="p-4">
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
    <!-- bas : panneau « Système » (matériel, Ollama, stockage), séparé de la navigation -->
    <div class="flex flex-col gap-1 border-t-2 border-bc-border-strong bg-bc-bg/40 p-4">
      <h2 class="mb-1 text-[10px] font-mono uppercase tracking-wide text-bc-text-muted">Système</h2>

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

      <!-- Ollama : en ligne + version -->
      <div class="mt-2 flex items-center gap-2 border-t border-bc-border pt-3 text-xs">
        <span
          class="size-2 shrink-0 rounded-full"
          :class="status == null ? 'bg-bc-text-muted' : status.online ? 'bg-bc-green' : 'bg-bc-danger'"
          aria-hidden="true"
        />
        <span v-if="status == null" class="text-bc-text-muted">Ollama…</span>
        <span v-else-if="status.online" class="font-mono text-bc-text-primary">Ollama {{ status.version }}</span>
        <span v-else class="font-mono text-bc-danger" :title="`Ollama ne répond pas sur ${status.url ?? 'l\'URL configurée'} (Paramétrage → WebUI)`">Ollama hors ligne</span>
      </div>

      <!-- Stockage : barre du disque (modèles Ollama / reste occupé / libre) + chiffres -->
      <div v-if="storage" class="mt-2 text-xs" :title="storageTooltip">
        <div class="flex items-center justify-between">
          <span class="text-bc-text-secondary">Modèles</span>
          <span class="font-mono font-medium text-bc-text-primary">{{ formatBytes(ollamaBytes) }}</span>
        </div>
        <div
          v-if="storage.disk_total_bytes"
          class="mt-1.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-bc-surface-alt"
          role="img"
          :aria-label="storageTooltip"
        >
          <div class="h-full rounded-full bg-bc-orange" :style="{ width: percent(ollamaBytes) }" />
          <div class="h-full rounded-full bg-bc-border" :style="{ width: percent(otherUsedBytes) }" />
        </div>
        <p v-if="storage.disk_free_bytes != null" class="mt-1 text-[10px] text-bc-text-muted">
          {{ formatBytes(storage.disk_free_bytes) }} libres sur {{ formatBytes(storage.disk_total_bytes) }}
        </p>
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
const { status } = useOllamaStatus()

const storage = computed(() => status.value?.storage ?? null)
// modèles Ollama (blobs, sans doublons) + GGUF importés gardés dans ~/.ollama/gguf
const ollamaBytes = computed(() => (storage.value?.models_bytes ?? 0) + (storage.value?.gguf_bytes ?? 0))
// le reste de l'espace occupé du disque (système, autres fichiers)
const otherUsedBytes = computed(() => {
  const s = storage.value
  if (!s?.disk_total_bytes || s.disk_free_bytes == null) return 0
  return Math.max(0, s.disk_total_bytes - s.disk_free_bytes - ollamaBytes.value)
})

const percent = (bytes) => `${Math.min(100, (bytes / storage.value.disk_total_bytes) * 100).toFixed(1)}%`

const storageTooltip = computed(() => {
  const s = storage.value
  if (!s) return ''
  const lines = [`Modèles Ollama : ${formatBytes(s.models_bytes)}`]
  if (s.partial_bytes > 0) {
    lines.push(`  dont ${formatBytes(s.partial_bytes)} de téléchargements interrompus (repris si on relance le téléchargement)`)
  }
  lines.push(`GGUF importés (~/.ollama/gguf) : ${formatBytes(s.gguf_bytes)}`)
  if (s.disk_total_bytes) {
    lines.push('', `Disque : ${formatBytes(s.disk_free_bytes)} libres sur ${formatBytes(s.disk_total_bytes)}`, 'Orange : modèles · gris : autres fichiers')
  }
  return lines.join('\n')
})

function formatBytes(bytes) {
  if (bytes == null) return '—'
  const go = bytes / 1024 ** 3
  if (go >= 1000) return `${(go / 1024).toFixed(1)} To`
  return go >= 10 ? `${Math.round(go)} Go` : `${go.toFixed(1)} Go`
}

function formatMB(mb) {
  if (mb == null) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`
}
</script>
