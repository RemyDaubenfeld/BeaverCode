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
      </span>
      <span v-else-if="modelOrder.length" class="text-sm text-bc-text-secondary">
        Terminé en {{ formatDuration(totalElapsedSec) }}
      </span>
      <button
        v-if="!running && modelOrder.length"
        @click="resetRun"
        class="ml-auto px-3 py-1.5 text-sm rounded-bc bg-bc-orange text-bc-ink border-2 border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform duration-75 cursor-pointer"
      >
        OK
      </button>
    </div>

    <p v-if="errorMessage" class="mb-3 rounded-bc border border-bc-danger-dark bg-bc-danger-tint px-3 py-2 text-sm text-bc-danger">
      {{ errorMessage }}
    </p>

    <p v-if="modelOrder.length === 0" class="text-sm text-bc-text-muted">En attente des premiers résultats…</p>

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
          </span>
          <span v-else-if="results[model].status === 'done'" class="text-sm">
            <span :class="scoreColorClass(results[model].avgScore)" class="font-mono font-medium">
              {{ results[model].avgScore }}/5 — {{ results[model].verdict }}
            </span>
            <span class="text-bc-text-muted font-mono">
              ({{ results[model].avgTokensPerSec }} tok/s, {{ formatDuration(modelElapsedSec(model)) }})
            </span>
          </span>
          <span v-else class="text-xs text-bc-text-muted">en attente…</span>
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
                <td class="py-1 pr-3 text-bc-text-muted font-mono whitespace-nowrap">{{ test.tokens_per_sec }} tok/s</td>
                <td class="py-1 pr-3 text-bc-text-muted font-mono whitespace-nowrap">{{ formatDuration(test.elapsed_sec) }}</td>
                <td class="py-1 text-bc-text-muted max-w-md truncate" :title="test.weaknesses">{{ test.weaknesses }}</td>
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
  modelsDoneCount,
  globalProgressPercent,
  cancelBenchmark,
  resetRun,
} = useBenchmarkRun()

const { scoreColorClass, formatDuration } = useBenchmarkFormat()
</script>
