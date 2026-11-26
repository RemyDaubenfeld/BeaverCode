<template>

  <!-- 3 colonnes : gauche | centre | droite. Les colonnes latérales (1fr) se partagent l'espace restant à parts
       égales, donc le bloc central reste centré ; mais chacune garde au minimum la largeur de son contenu, donc
       les blocs se poussent au lieu de se chevaucher quand la barre rétrécit (avant : gauche et droite en
       `absolute`, ils passaient par-dessus CPU / RAM / GPU). -->
  <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-6 border-b-2 border-bc-border-strong bg-bc-surface px-4 py-2 text-sm text-bc-text-primary whitespace-nowrap">
    <div class="flex items-center justify-self-start">
      <button
        @click="showLoaded = true"
        class="rounded-bc px-2 py-1 text-sm font-mono text-bc-text-primary hover:bg-bc-surface-alt cursor-pointer"
      >
        {{ loadedModels.length }} modèle{{ loadedModels.length > 1 ? 's' : '' }} chargé{{ loadedModels.length > 1 ? 's' : '' }}
        <span
          v-if="nextUnload"
          class="text-bc-text-secondary"
          :title="`${nextUnload.name} se décharge dans ${nextUnload.text}`"
        >
          · {{ nextUnload.text }}
        </span>
      </button>
      <LoadedModelsModal v-if="showLoaded" @close="showLoaded = false" />

      <button
        v-if="benchmarkModelOrder.length"
        @click="showResultsModal = true"
        class="ml-2 rounded-bc px-2 py-1 text-sm font-mono text-bc-text-primary hover:bg-bc-surface-alt cursor-pointer"
        :class="benchmarkRunning ? 'text-bc-orange animate-pulse' : ''"
      >
        {{ benchmarkRunning
          ? `Benchmark ${benchmarkGlobalProgressPercent} %${benchmarkRunWallSec != null ? ` · ${formatClock(benchmarkRunWallSec)}` : ''}`
          : 'Voir le dernier run' }}
      </button>
      <BenchmarkResultsModal v-if="showResultsModal" />
    </div>
    <div class="flex items-center gap-10 font-mono">
      <div class="flex items-center gap-1.5">
        <span>CPU : <span class="font-medium text-bc-text-primary">{{ cpuLoad ?? '—' }}%</span></span>
        <Sparkline :values="history.cpu" :capacity="HISTORY_SIZE" label="CPU" :color-class="loadClass(cpuLoad)" />
      </div>

      <div class="flex items-center gap-1.5">
        <span>
          RAM : <span class="font-medium text-bc-text-primary">{{ ramLoad ?? '—' }}%</span>
          <span v-if="ramTotalMB"> ({{ formatMB(ramUsedMB) }} / {{ formatMB(ramTotalMB) }})</span>
        </span>
        <Sparkline :values="history.ram" :capacity="HISTORY_SIZE" label="RAM" :color-class="loadClass(ramLoad)" />
      </div>

      <span v-if="gpus.length === 0">GPU : <span class="font-medium text-bc-text-primary">aucun détecté</span></span>
      <div v-for="gpu in gpus" :key="gpu.model" class="flex items-center gap-1.5">
        <span>
          GPU : <span class="font-medium text-bc-text-primary">{{ gpu.loadPercent ?? '—' }}%</span>
          <span v-if="gpu.memoryTotalMB"> ({{ formatMB(gpu.memoryUsedMB) }} / {{ formatMB(gpu.memoryTotalMB) }})</span>
        </span>
        <Sparkline :values="history.gpu[gpu.model]?.load ?? []" :capacity="HISTORY_SIZE" label="GPU" :color-class="loadClass(gpu.loadPercent)" />
      </div>
    </div>
    <!-- état thermique / électrique du GPU, fixé à droite (symétrique du bloc de gauche) -->
    <div class="flex items-center justify-self-end gap-8 font-mono">
      <template v-for="gpu in gpus" :key="gpu.model">
        <div v-if="gpu.temperatureC != null" class="flex items-center gap-1.5">
          <!-- valeur en blanc comme le reste de la barre : seule la courbe porte la couleur du seuil -->
          <span
            class="font-medium text-bc-text-primary"
            title="Température du GPU (bridage du driver vers 87 °C sur une RTX de portable)"
          >
            {{ gpu.temperatureC }} °C
          </span>
          <!-- échelle fixe 30–95 °C : plage utile d'un GPU de portable (repos ≈ 45, bridage ≈ 87) -->
          <Sparkline
            :values="history.gpu[gpu.model]?.temp ?? []"
            :capacity="HISTORY_SIZE"
            :min="30"
            :max="95"
            unit=" °C"
            label="Température GPU"
            :width="40"
            :color-class="temperatureClass(gpu.temperatureC)"
          />
          <span
            v-if="gpu.thermalThrottle"
            class="text-[10px] px-1 rounded-md border border-bc-danger text-bc-danger"
            title="Le GPU baisse ses fréquences parce qu'il est trop chaud : les tok/s chutent"
          >
            bridé (chaleur)
          </span>
        </div>

        <div v-if="gpu.powerW != null" class="flex items-center gap-1.5">
          <span :title="gpu.powerLimitW ? `Consommation / limite de puissance appliquée (${gpu.powerLimitW} W)` : 'Consommation'">
            <span class="font-medium text-bc-text-primary">{{ Math.round(gpu.powerW) }}</span><template v-if="gpu.powerLimitW"> / {{ Math.round(gpu.powerLimitW) }}</template> W
          </span>
          <!-- échelle fixe 0 → limite de puissance appliquée (60 W ici) : le haut de la courbe = la limite -->
          <Sparkline
            v-if="gpu.powerLimitW"
            :values="history.gpu[gpu.model]?.power ?? []"
            :capacity="HISTORY_SIZE"
            :min="0"
            :max="gpu.powerLimitW"
            unit=" W"
            label="Consommation GPU"
            :width="40"
            :color-class="loadClass((gpu.powerW / gpu.powerLimitW) * 100)"
          />
          <span
            v-if="gpu.powerCapped && !gpu.thermalThrottle"
            class="text-[10px] px-1 rounded-md border border-bc-border text-bc-text-secondary"
            title="Le GPU tourne à sa limite de puissance : normal sous forte charge, il ne peut pas aller plus vite"
          >
            limite W
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { HISTORY_SIZE } from '~/composables/useHardware'

const { cpuLoad, ramLoad, ramUsedMB, ramTotalMB, gpus, history } = useHardware()
const { loadedModels } = useModels()
const {
  running: benchmarkRunning,
  modelOrder: benchmarkModelOrder,
  globalProgressPercent: benchmarkGlobalProgressPercent,
  runWallSec: benchmarkRunWallSec,
  showResultsModal,
} = useBenchmarkRun()
const { formatClock } = useBenchmarkFormat()

const showLoaded = ref(false)

// prochain modèle à se décharger (le plus proche de l'expiration) → compte à rebours dans la barre
const { remaining } = useKeepAlive()
const nextUnload = computed(() => {
  const items = loadedModels.value.map((m) => ({ name: m.name, ...remaining(m.expires_at) }))
  if (!items.length) return null
  const timed = items.filter((i) => !i.unlimited).sort((a, b) => a.remainingMs - b.remainingMs)
  return timed[0] ?? items[0] // tous illimités → « illimité »
})

// même code couleur que l'ancienne jauge : vert → orange (≥ 70 %) → rouge (≥ 90 %), selon la valeur ACTUELLE
// (sert aussi pour la consommation, en % de la limite de puissance appliquée)
function loadClass(percent) {
  if (percent >= 90) return 'text-bc-danger'
  if (percent >= 70) return 'text-bc-orange'
  return 'text-bc-green'
}

// Seuils pour un GPU de portable : le driver commence à brider vers 87 °C (RTX 30xx mobile)
function temperatureClass(t) {
  if (t >= 85) return 'text-bc-danger'
  if (t >= 75) return 'text-bc-warning'
  return 'text-bc-green'
}

function formatMB(mb) {
  if (mb == null) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`
}
</script>