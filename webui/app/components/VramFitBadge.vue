<template>
  <span v-if="fit" class="inline-flex items-center gap-1.5 whitespace-nowrap" :title="tooltip">
    <CheckCircleIcon v-if="fit.level === 'fast'" class="w-4 h-4 shrink-0 text-bc-green" />
    <ExclamationTriangleIcon v-else-if="fit.level === 'medium'" class="w-4 h-4 shrink-0 text-bc-warning" />
    <XCircleIcon v-else class="w-4 h-4 shrink-0 text-bc-danger" />
    <span v-if="showSize" class="font-mono text-bc-text-secondary">{{ formatGo(estimate.total_bytes) }}</span>
    <span
      v-if="isMoe"
      class="font-mono text-[10px] px-1 rounded border border-bc-border text-bc-text-muted whitespace-nowrap"
    >
      MoE {{ formatParams(estimate.active_params) }}
    </span>
  </span>
  <span v-else class="text-bc-text-muted">—</span>
</template>

<script setup>
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/vue/24/solid'

const props = defineProps({
  // { total_bytes, weights_bytes, active_params?, total_params? }
  estimate: { type: Object, default: null },
  // détail optionnel affiché dans l'info-bulle (lignes "libellé : valeur")
  details: { type: Array, default: () => [] },
  showSize: { type: Boolean, default: true },
})

const { usableVramBytes, vramFit } = useVramFit()
const fit = computed(() => vramFit(props.estimate))
const isMoe = computed(() => fit.value && fit.value.activeRatio < 1)

const labels = {
  fast: 'Tient entièrement en VRAM : rapide',
  medium: 'Déborde en RAM : ralenti mais utilisable',
  slow: 'Déborde largement en RAM : très lent',
}

const tooltip = computed(() => {
  if (!fit.value) return ''
  const lines = [
    fit.value.exceedsRam ? 'Plus gros que VRAM + RAM : poids relus depuis le disque, extrêmement lent' : labels[fit.value.level],
    `~${Math.round(fit.value.gpuRatio * 100)} % sur GPU`,
  ]
  if (fit.value.estimatedTokensPerSec != null) {
    lines.push(`Vitesse estimée : ~${fit.value.estimatedTokensPerSec.toFixed(0)} tok/s (limitée par la RAM)`)
  }
  if (isMoe.value) {
    lines.push(
      `MoE : ${formatParams(props.estimate.active_params)} actifs sur ${formatParams(props.estimate.total_params)}`
      + ` (${Math.round(fit.value.activeRatio * 100)} % des poids lus par token)`
    )
  }
  return [
    ...lines,
    '',
    ...props.details,
    `Total estimé : ${formatGo(props.estimate.total_bytes)}`,
    `VRAM utilisable par Ollama : ${formatGo(usableVramBytes.value)}`,
  ].join('\n')
})

function formatGo(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(1)} Go`
}

function formatParams(n) {
  return `${(n / 1e9).toFixed(1)}B`
}
</script>
