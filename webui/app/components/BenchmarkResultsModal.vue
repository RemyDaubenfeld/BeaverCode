<template>
  <Modal size="xl" @close="showResultsModal = false">
    <template #header>Résultats du benchmark</template>

    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <button
        v-if="running"
        @click="cancelBenchmark"
        class="px-3 py-1.5 text-sm rounded-bc bg-bc-danger text-bc-paper border-2 border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform duration-75 cursor-pointer"
      >
        Annuler
      </button>
      <span v-if="running" class="text-sm text-bc-text-secondary">
        Benchmark en cours… ({{ globalProgressPercent }}% — {{ modelsDoneCount }}/{{ modelOrder.length }} modèles)
        <template v-if="runWallSec != null">
          — depuis <span class="font-mono text-bc-text-primary" :title="wallTitle">{{ formatClock(runWallSec) }}</span>
        </template>
      </span>
      <span v-else-if="modelOrder.length" class="text-sm text-bc-text-secondary">
        <template v-if="runWallSec != null">
          Terminé en <span class="font-mono" :title="wallTitle">{{ formatClock(runWallSec) }}</span>
          (dont {{ formatDuration(totalElapsedSec) }} de génération)
        </template>
        <template v-else>Terminé en {{ formatDuration(totalElapsedSec) }}</template>
      </span>
      <button
        v-if="!running && modelOrder.length"
        @click="resetRun"
        class="ml-auto px-3 py-1.5 text-sm rounded-bc bg-bc-orange text-bc-ink border-2 border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform duration-75 cursor-pointer"
      >
        OK
      </button>
    </div>

    <div v-if="errorMessage" class="mb-3 flex flex-wrap items-center gap-2 rounded-bc border border-bc-danger-dark bg-bc-danger-tint px-3 py-2 text-sm text-bc-danger">
      <p class="flex-1">{{ errorMessage }}</p>
      <button
        v-if="blockedByOtherRun"
        @click="stopBenchmark"
        class="shrink-0 px-3 py-1.5 text-sm rounded-bc bg-bc-danger text-bc-paper border-2 border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform duration-75 cursor-pointer"
      >
        Arrêter le benchmark en cours
      </button>
    </div>

    <p v-if="modelOrder.length === 0" class="text-sm text-bc-text-secondary">En attente des premiers résultats…</p>

    <div v-else class="max-h-[65vh] overflow-y-auto space-y-2 pr-1">
      <details
        v-for="model in modelOrder"
        :key="model"
        class="group rounded-bc border-2 border-bc-border-strong bg-bc-surface"
        :open="expandedModels.has(model)"
        @toggle="onToggleModel(model, $event)"
      >
        <summary class="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none">
          <span class="flex items-center gap-1.5">
            <ChevronDownIcon class="w-4 h-4 text-bc-text-muted shrink-0 transition-transform group-open:rotate-180" />
            <span class="font-mono font-medium text-bc-text-primary">{{ model }}</span>
          </span>
          <span v-if="results[model].status === 'running'" class="text-xs font-mono text-bc-orange">
            {{ results[model].tests.length }} / {{ results[model].testCount }} tests… ({{ modelProgressPercent(model) }}%)
            · <span :title="wallTitle">{{ formatClock(modelWallSec(model)) }}</span>
            <span class="text-bc-text-secondary" title="Temps passé sur le test en cours (génération, puis passage du juge)">
              (test en cours : {{ formatClock(currentTestSec(model)) }})
            </span>
          </span>
          <span v-else-if="results[model].status === 'done'" class="text-sm">
            <span :class="scoreColorClass(results[model].avgScore)" class="font-mono font-medium">
              {{ results[model].avgScore }}/5 — {{ results[model].verdict }}
            </span>
            <span class="text-bc-text-secondary font-mono">
              (<template v-if="formatLatency(results[model].tests)"><span title="TTFT : temps avant le premier token, hors chargement (test qui a chargé le modèle écarté, médiane des autres). Chargement : temps de mise en mémoire du modèle, payé au premier test.">{{ formatLatency(results[model].tests) }}</span> · </template>{{ results[model].avgTokensPerSec }} tok/s, <span :title="modelWallSec(model) != null ? `${formatDuration(modelElapsedSec(model))} de génération, le reste : chargement du modèle et juge` : 'Somme des durées de génération'">{{ modelWallSec(model) != null ? formatClock(modelWallSec(model)) : formatDuration(modelElapsedSec(model)) }}</span><template v-if="results[model].skipped?.length">, {{ results[model].skipped.length }} ignoré{{ results[model].skipped.length > 1 ? 's' : '' }} : capacité absente</template>)
            </span>
          </span>
          <span v-else class="text-xs text-bc-text-secondary">en attente…</span>
        </summary>
        <div class="border-t border-bc-border px-3 pb-3">
          <div v-if="results[model].status === 'running'" class="h-1.5 w-full rounded-full bg-bc-surface-alt border border-bc-border overflow-hidden my-2">
            <div
              class="h-full rounded-full bg-bc-orange transition-all duration-300 ease-out"
              :style="{ width: modelProgressPercent(model) + '%' }"
            />
          </div>
          <table class="w-full text-xs text-bc-text-secondary border-collapse mt-2">
            <tbody>
              <tr v-for="test in results[model].tests" :key="test.test_id" class="border-t border-bc-border/60">
                <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap">{{ test.label }}</td>
                <td class="py-1 pr-3 whitespace-nowrap font-mono" :class="scoreColorClass(test.score)">
                  {{ '★'.repeat(test.score) }}{{ '☆'.repeat(5 - test.score) }}
                </td>
                <td class="py-1 pr-3 text-bc-text-secondary font-mono whitespace-nowrap">{{ test.tokens_per_sec }} tok/s</td>
                <td class="py-1 pr-3 text-bc-text-secondary font-mono whitespace-nowrap" :title="ttftTooltip(test)">TTFT {{ formatSeconds(test.ttft_sec) }}</td>
                <td class="py-1 pr-3 text-bc-text-secondary font-mono whitespace-nowrap">{{ formatDuration(test.elapsed_sec) }}</td>
                <td class="py-1 text-bc-text-secondary max-w-md truncate" :title="test.weaknesses">{{ test.weaknesses }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </Modal>
</template>

<script setup>
import { ChevronDownIcon } from '@heroicons/vue/24/outline'
import Modal from './Modal.vue'

const {
  running,
  errorMessage,
  results,
  modelOrder,
  expandedModels,
  showResultsModal,
  onToggleModel,
  modelProgressPercent,
  modelElapsedSec,
  totalElapsedSec,
  runWallSec,
  modelWallSec,
  currentTestSec,
  modelsDoneCount,
  globalProgressPercent,
  cancelBenchmark,
  stopBenchmark,
  blockedByOtherRun,
  resetRun,
} = useBenchmarkRun()

const { scoreColorClass, formatDuration, formatSeconds, ttftTooltip, formatLatency, formatClock } = useBenchmarkFormat()

const wallTitle = 'Temps réel écoulé : génération, chargement du modèle et passages du juge compris'

</script>
