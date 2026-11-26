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
// lancement refusé (409) parce qu'un autre run tourne : la fenêtre propose de l'arrêter
const blockedByOtherRun = ref(false)
let abortController = null

// Chronomètre (temps réel, horloge du navigateur) : début du run, puis début/fin de chaque modèle et début du
// test en cours. Contrairement à modelElapsedSec (somme des durées de génération), il compte TOUT : chargement
// du modèle, passages du juge, tests plantés. `now` avance chaque seconde pendant le run pour l'affichage.
// Perdu au rechargement de la page (comme le reste de l'état du run).
const runStartedAt = ref(null)
const runEndedAt = ref(null)
const now = ref(Date.now())
let ticker = null

function startTicker() {
  clearInterval(ticker)
  now.value = Date.now()
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
}

function stopTicker() {
  clearInterval(ticker)
  ticker = null
  now.value = Date.now()
}

// secondes écoulées entre deux instants (ms) ; fin absente = encore en cours
function wallSec(startedAt, endedAt) {
  if (!startedAt) return null
  return Math.max(0, Math.floor(((endedAt ?? now.value) - startedAt) / 1000))
}

const runWallSec = computed(() => wallSec(runStartedAt.value, runEndedAt.value))
const modelWallSec = (model) => wallSec(results[model]?.startedAt, results[model]?.endedAt)
// test en cours : depuis le dernier résultat reçu (ou le début du modèle pour le premier test)
const currentTestSec = (model) => results[model]?.status === 'running' ? wallSec(results[model].testStartedAt) : null

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
  // chaque modèle peut avoir son propre nombre de tests (relance des tests ratés : plan par modèle)
  const totalPlanned = modelOrder.value.reduce((sum, m) => sum + (results[m]?.testCount ?? 0), 0)
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
        startedAt: Date.now(),
        endedAt: null,
        testStartedAt: Date.now(),
      }
      expandedModels.value.add(event.model)
      break
    case 'test_result':
      if (results[event.model]) {
        results[event.model].tests.push(event)
        results[event.model].testStartedAt = Date.now()
      }
      break
    case 'model_done':
      if (results[event.model]) {
        Object.assign(results[event.model], {
          status: 'done',
          endedAt: Date.now(),
          avgScore: event.avg_score,
          avgTokensPerSec: event.avg_tokens_per_sec,
          verdict: event.verdict,
        })
      }
      break
    case 'tests_skipped':
      // tests écartés par Python faute de capacité (garde-fou, la WebUI filtre déjà) : gardés pour affichage
      if (results[event.model]) results[event.model].skipped = event.test_ids
      break
    case 'error':
      errorMessage.value = event.message
      break
  }
}

// `plan` (optionnel) : { modèle: [ids de tests] } — tests propres à chaque modèle, remplace models/testIds
async function runBenchmark({ models, testIds, judgeModel, options, plan }) {
  if (plan) {
    models = Object.keys(plan)
    testIds = []
  }
  running.value = true
  errorMessage.value = ''
  blockedByOtherRun.value = false
  showResultsModal.value = true
  Object.keys(results).forEach((k) => delete results[k])
  expandedModels.value = new Set()
  modelOrder.value = [...models]
  for (const model of modelOrder.value) {
    results[model] = { status: 'pending', testCount: plan ? plan[model].length : testIds.length, tests: [] }
  }
  abortController = new AbortController()
  runStartedAt.value = Date.now()
  runEndedAt.value = null
  startTicker()

  try {
    const response = await fetch('/api/benchmark/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan ? { plan, judgeModel, options } : { models, testIds, judgeModel, options }),
      signal: abortController.signal,
    })
    if (!response.ok || !response.body) {
      // message du serveur (ex. 409 « un benchmark est déjà en cours ») plutôt qu'un message générique
      const detail = await response.json().catch(() => null)
      blockedByOtherRun.value = response.status === 409
      throw new Error(detail?.statusMessage || detail?.message || 'Échec du lancement du benchmark')
    }

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
    runEndedAt.value = Date.now()
    // run coupé (annulation, erreur) : le modèle en cours s'arrête aussi au chronomètre
    for (const model of modelOrder.value) {
      if (results[model]?.startedAt && !results[model].endedAt) results[model].endedAt = runEndedAt.value
    }
    stopTicker()
  }
}

// Couper le flux suffit normalement (le serveur arrête le script à la fermeture de la connexion) ; l'appel à
// /stop arrête en plus un run que cette page ne suit pas (lancé avant un rechargement)
async function cancelBenchmark() {
  abortController?.abort()
  await stopBenchmark()
}

async function stopBenchmark() {
  try {
    await $fetch('/api/benchmark/stop', { method: 'POST' })
    blockedByOtherRun.value = false
    errorMessage.value = ''
  } catch {
    errorMessage.value = "Impossible d'arrêter le benchmark en cours"
  }
}

// Efface le dernier run consulté (bouton "OK" de BenchmarkResultsModal) : au
// contraire de la simple fermeture (@close, qui ne fait que masquer la
// modale), ceci vide modelOrder — ce qui fait aussi disparaître le bouton
// "Voir le dernier run" de Monitoring.vue, dont l'affichage dépend de
// modelOrder.length.
function resetRun() {
  Object.keys(results).forEach((k) => delete results[k])
  modelOrder.value = []
  runStartedAt.value = null
  runEndedAt.value = null
  expandedModels.value = new Set()
  errorMessage.value = ''
  blockedByOtherRun.value = false
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
    runWallSec,
    modelWallSec,
    currentTestSec,
    modelsDoneCount,
    globalProgressPercent,
    runBenchmark,
    cancelBenchmark,
    stopBenchmark,
    blockedByOtherRun,
    resetRun,
  }
}
