import { ref, reactive, computed } from 'vue'

// État du run de benchmark en cours (ou du dernier run), partagé entre
// BenchmarkRunner.vue (page Tests, qui le déclenche) et Monitoring.vue (barre
// globale, toujours montée — voir app.vue) : état module-level plutôt que
// useState local à un composant, pour survivre à un changement de page (le
// benchmark tourne côté serveur via un stream HTTP, la navigation ne doit pas
// couper l'affichage de sa progression).

const running = ref(false)
const errorMessage = ref('')
const results = reactive({})
const modelOrder = ref([])
const expandedModels = ref(new Set())
const showResultsModal = ref(false)
let totalSelectedTests = 0
let abortController = null

function modelProgressPercent(model) {
  const entry = results[model]
  if (!entry?.testCount) return 0
  return Math.round((entry.tests.length / entry.testCount) * 100)
}

function modelElapsedSec(model) {
  return (results[model]?.tests ?? []).reduce((sum, t) => sum + (t.elapsed_sec ?? 0), 0)
}

const totalElapsedSec = computed(() => {
  return modelOrder.value.reduce((sum, model) => sum + modelElapsedSec(model), 0)
})

const modelsDoneCount = computed(() => {
  return modelOrder.value.filter((m) => results[m]?.status === 'done').length
})

const globalProgressPercent = computed(() => {
  const totalPlanned = modelOrder.value.length * totalSelectedTests
  if (!totalPlanned) return 0
  const completed = modelOrder.value.reduce((sum, m) => sum + (results[m]?.tests.length ?? 0), 0)
  return Math.round((completed / totalPlanned) * 100)
})

function onToggleModel(model, event) {
  if (event.target.open) {
    expandedModels.value.add(model)
  } else {
    expandedModels.value.delete(model)
  }
}

function handleEvent(event) {
  switch (event.event) {
    case 'model_start':
      if (!results[event.model]) {
        modelOrder.value.push(event.model)
      }
      results[event.model] = {
        ...results[event.model],
        status: 'running',
        detectedTypes: event.detected_types,
        testCount: event.test_count,
        tests: [],
      }
      expandedModels.value.add(event.model)
      break
    case 'test_result':
      results[event.model]?.tests.push(event)
      break
    case 'model_done':
      if (results[event.model]) {
        Object.assign(results[event.model], {
          status: 'done',
          avgScore: event.avg_score,
          avgTokensPerSec: event.avg_tokens_per_sec,
          verdict: event.verdict,
        })
      }
      break
    case 'error':
      errorMessage.value = event.message
      break
  }
}

async function runBenchmark({ models, testIds, judgeModel }) {
  running.value = true
  errorMessage.value = ''
  showResultsModal.value = true
  Object.keys(results).forEach((k) => delete results[k])
  expandedModels.value = new Set()
  modelOrder.value = [...models]
  totalSelectedTests = testIds.length
  for (const model of modelOrder.value) {
    results[model] = { status: 'pending', testCount: testIds.length, tests: [] }
  }
  abortController = new AbortController()

  try {
    const response = await fetch('/api/benchmark/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models, testIds, judgeModel }),
      signal: abortController.signal,
    })
    if (!response.ok || !response.body) throw new Error('Échec du lancement du benchmark')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        handleEvent(JSON.parse(line))
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      errorMessage.value = e.message ?? 'Erreur pendant le benchmark'
    }
  } finally {
    running.value = false
  }
}

function cancelBenchmark() {
  abortController?.abort()
}

// Efface le dernier run consulté (bouton "OK" de BenchmarkResultsModal) : au
// contraire de la simple fermeture (@close, qui ne fait que masquer la
// modale), ceci vide modelOrder — ce qui fait aussi disparaître le bouton
// "Voir le dernier run" de Monitoring.vue, dont l'affichage dépend de
// modelOrder.length.
function resetRun() {
  Object.keys(results).forEach((k) => delete results[k])
  modelOrder.value = []
  expandedModels.value = new Set()
  errorMessage.value = ''
  showResultsModal.value = false
}

export function useBenchmarkRun() {
  return {
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
    runBenchmark,
    cancelBenchmark,
    resetRun,
  }
}
