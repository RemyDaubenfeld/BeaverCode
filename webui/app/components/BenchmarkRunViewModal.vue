<template>
  <Modal size="xl" @close="emit('close')">
    <template #header>Résultats du run — {{ formatDate(run?.generated_at) }}</template>
    <template #actions>
      <button
        v-if="run"
        @click="downloadJson"
        title="Télécharger le JSON"
        class="p-1.5 rounded-md text-bc-text-secondary hover:text-bc-text-primary hover:bg-bc-surface-alt cursor-pointer"
      >
        <ArrowDownTrayIcon class="w-4 h-4" />
      </button>
    </template>

    <p v-if="loading" class="text-sm text-bc-text-secondary">Chargement…</p>
    <p v-else-if="error" class="text-sm text-bc-danger">{{ error }}</p>

    <p v-if="run && !loading && !error" class="mb-2 text-xs text-bc-text-secondary">
      Réglages : <span class="font-mono text-bc-text-secondary">{{ formatRunOptions(run.options) }}</span>
    </p>

    <!-- Relance des tests ratés : chaque modèle relance SES tests ratés, avec les réglages et le juge de ce run
         (résultats comparables à ceux qu'ils remplacent dans le comparatif) -->
    <div v-if="run && !loading && !error" class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-bc border border-bc-border px-3 py-2 text-xs">
      <span class="text-bc-text-secondary">Relancer :</span>
      <label class="flex items-center gap-1.5 text-bc-text-secondary cursor-pointer select-none">
        <input v-model="retryCriterion" type="radio" value="errors" class="accent-bc-orange" />
        les tests en erreur
      </label>
      <label class="flex items-center gap-1.5 text-bc-text-secondary cursor-pointer select-none">
        <input v-model="retryCriterion" type="radio" value="low" class="accent-bc-orange" />
        en erreur ou notés ≤ 2/5
      </label>
      <button
        @click="retry"
        :disabled="running || !retryCount"
        :title="retryTitle"
        class="ml-auto px-2.5 py-1 rounded-bc border-2 border-bc-border-strong bg-bc-orange font-semibold text-bc-ink shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed"
      >
        {{ running ? 'Benchmark en cours…' : retryCount ? `Relancer ${retryCount} test${retryCount > 1 ? 's' : ''}` : 'Aucun test à relancer' }}
      </button>
      <p v-if="missingModels.length" class="w-full text-bc-warning">
        Modèle{{ missingModels.length > 1 ? 's' : '' }} supprimé{{ missingModels.length > 1 ? 's' : '' }} depuis ce run, ignoré{{ missingModels.length > 1 ? 's' : '' }} : {{ missingModels.join(', ') }}
      </p>
    </div>
    <!-- condition explicite, pas v-else : un v-else se rattache au v-if juste au-dessus (le bandeau de relance),
         pas au « Chargement… », et s'afficherait pendant le chargement, quand run est encore null -->
    <div v-if="run && !loading && !error" class="max-h-[70vh] overflow-y-auto space-y-2 pr-1">
      <details v-for="model in run.models" :key="model.model" class="group rounded-bc border border-bc-border bg-bc-surface-alt" open>
        <summary class="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none">
          <span class="flex items-center gap-1.5">
            <ChevronDownIcon class="w-4 h-4 text-bc-text-muted shrink-0 transition-transform group-open:rotate-180" />
            <span class="font-mono font-medium text-bc-text-primary">{{ model.model }}</span>
          </span>
          <span class="text-sm">
            <span :class="scoreColorClass(model.avg_score)" class="font-medium">{{ model.avg_score }}/5 — {{ model.verdict }}</span>
            <span class="text-bc-text-secondary">(<template v-if="formatLatency(model.tests)"><span title="TTFT : temps avant le premier token, hors chargement (test qui a chargé le modèle écarté, médiane des autres). Chargement : temps de mise en mémoire du modèle, payé au premier test.">{{ formatLatency(model.tests) }}</span> · </template>{{ model.avg_tokens_per_sec }} tok/s)</span>
          </span>
        </summary>
        <div class="border-t border-bc-border px-3 pb-3">
          <table class="w-full text-xs text-bc-text-secondary border-collapse mt-2 font-mono">
            <tbody>
              <tr
                v-for="test in model.tests"
                :key="test.test_id"
                class="border-t border-bc-border"
                :class="isFailed(test) ? 'bg-bc-danger-tint/60' : ''"
              >
                <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap">{{ test.label }}</td>
                <td class="py-1 pr-3 whitespace-nowrap" :class="scoreColorClass(test.score)">
                  {{ '★'.repeat(test.score) }}{{ '☆'.repeat(5 - test.score) }}
                </td>
                <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap">{{ test.tokens_per_sec }} tok/s</td>
                <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap" :title="ttftTooltip(test)">TTFT {{ formatSeconds(test.ttft_sec) }}</td>
                <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap">{{ formatDuration(test.elapsed_sec) }}</td>
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
import { ref, computed, onMounted } from 'vue'
import { ChevronDownIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import Modal from './Modal.vue'

const props = defineProps({ id: { type: String, required: true } })
const emit = defineEmits(['close'])

const { scoreColorClass, formatDuration, formatRunOptions, formatSeconds, ttftTooltip, formatLatency } = useBenchmarkFormat()

const { running, runBenchmark } = useBenchmarkRun()
const { modelList } = useModels()

const run = ref(null)

// --- Relance des tests ratés
const retryCriterion = ref('errors') // 'errors' | 'low'

// en erreur : marqueur explicite des runs récents, sinon repli sur le texte d'erreur des runs plus anciens
const isError = (test) => test.error === true || (test.response_preview ?? '').startsWith('ERREUR')
const isFailed = (test) => isError(test) || (retryCriterion.value === 'low' && test.score <= 2)

const installed = computed(() => new Set((modelList.value ?? []).map((m) => m.name)))
// modèles du run supprimés depuis : on ne peut pas les relancer
const missingModels = computed(() =>
  (run.value?.models ?? [])
    .filter((m) => m.tests.some(isFailed) && modelList.value && !installed.value.has(m.model))
    .map((m) => m.model)
)

// { modèle: [ids des tests ratés] } — uniquement les modèles encore installés qui ont des tests ratés
const retryPlan = computed(() => {
  const plan = {}
  for (const m of run.value?.models ?? []) {
    if (!installed.value.has(m.model)) continue
    const ids = m.tests.filter(isFailed).map((t) => t.test_id)
    if (ids.length) plan[m.model] = ids
  }
  return plan
})
const retryCount = computed(() => Object.values(retryPlan.value).reduce((n, ids) => n + ids.length, 0))

// le juge du run d'origine (identique pour tous ses modèles) ; null = run noté par règles uniquement
const runJudge = computed(() => run.value?.models.find((m) => m.judge_model)?.judge_model ?? null)

const retryTitle = computed(() =>
  `Relance avec les réglages de ce run (${formatRunOptions(run.value?.options)}) et son juge (${runJudge.value ?? 'règles uniquement'}). `
  + 'Les nouveaux résultats remplacent les anciens dans le comparatif ; ce run-ci reste dans l\'historique.'
)

function retry() {
  runBenchmark({
    plan: retryPlan.value,
    judgeModel: runJudge.value,
    // runs antérieurs à l'enregistrement des réglages : défauts de lib/config.py
    options: run.value.options ?? undefined,
  })
  emit('close') // la progression s'affiche dans la fenêtre du run en cours (BenchmarkResultsModal)
}
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    run.value = await $fetch(`/api/benchmark/results/${props.id}`)
  } catch (e) {
    error.value = e.data?.statusMessage ?? 'Erreur lors du chargement du run'
  } finally {
    loading.value = false
  }
})

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function downloadJson() {
  if (!run.value) return
  const blob = new Blob([JSON.stringify(run.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `benchmark-run-${props.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
