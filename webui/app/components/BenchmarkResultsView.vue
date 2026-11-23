<template>
  <div>
    <!-- Historique des runs -->
    <section class="mb-8">
      <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-secondary mb-2">Runs enregistrés</h2>

      <p v-if="loadingRuns" class="text-sm text-bc-text-secondary">Chargement…</p>
      <p v-else-if="runsError" class="text-sm text-bc-danger">{{ runsError }}</p>
      <p v-else-if="runs.length === 0" class="text-sm text-bc-text-secondary">Aucun run enregistré pour l'instant — lance un benchmark depuis l'onglet Tests.</p>

      <div v-else class="max-h-[30vh] overflow-y-auto rounded-bc border-2 border-bc-border-strong bg-bc-surface shadow-bc-hard divide-y divide-bc-border">
        <div v-for="run in runs" :key="run.id" class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div class="min-w-0">
            <span class="text-bc-text-primary">{{ formatDate(run.generated_at) }}</span>
            <span class="ml-2 text-xs text-bc-text-secondary font-mono">
              {{ run.models.length }} modèle{{ run.models.length > 1 ? 's' : '' }} — {{ run.models.map((m) => m.name).join(', ') }}
            </span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button @click="viewingRunId = run.id" title="Voir les résultats" class="p-1.5 rounded-md text-bc-text-secondary hover:text-bc-text-primary hover:bg-bc-surface-alt cursor-pointer">
              <EyeIcon class="w-4 h-4" />
            </button>
            <button @click="removeRun(run.id)" :disabled="deletingId === run.id" title="Supprimer le fichier" class="p-1.5 rounded-md text-bc-danger/80 hover:text-bc-danger hover:bg-bc-surface-alt disabled:opacity-40 cursor-pointer">
              <TrashIcon class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <p v-if="deleteError" class="mt-2 text-sm text-bc-danger">{{ deleteError }}</p>
    </section>

    <!-- Comparatif -->
    <section>
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-secondary">Comparatif des modèles</h2>
        <button
          v-if="missingTotal"
          @click="completing = 'all'"
          :disabled="running"
          :title="running ? 'Un benchmark est déjà en cours' : 'Lancer, pour chaque modèle, les tests qu\'il peut passer mais qui manquent au comparatif'"
          class="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-bc border-2 border-bc-border-strong bg-bc-green text-xs font-semibold text-bc-ink shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
        >
          <PlusCircleIcon class="w-4 h-4" />
          Compléter {{ missingTotal }} test{{ missingTotal > 1 ? 's' : '' }} manquant{{ missingTotal > 1 ? 's' : '' }}
          ({{ missingModelCount }} modèle{{ missingModelCount > 1 ? 's' : '' }})
        </button>
        <div class="flex rounded-bc border-2 border-bc-border-strong overflow-hidden" :class="missingTotal ? '' : 'ml-auto'">
          <button
            @click="comparisonMode = 'global'"
            class="font-display px-3 py-1 text-xs cursor-pointer"
            :class="comparisonMode === 'global' ? 'bg-bc-orange text-bc-ink' : 'text-bc-text-secondary hover:bg-bc-surface-alt'"
          >
            Global
          </button>
          <button
            @click="comparisonMode = 'capability'"
            class="font-display px-3 py-1 text-xs cursor-pointer"
            :class="comparisonMode === 'capability' ? 'bg-bc-orange text-bc-ink' : 'text-bc-text-secondary hover:bg-bc-surface-alt'"
          >
            Par capacité
          </button>
        </div>
      </div>

      <!-- Confirmation avant de compléter : le plan peut représenter plusieurs heures -->
      <div v-if="completing && Object.keys(completionPlan).length" class="mb-3 rounded-bc border-2 border-bc-border-strong bg-bc-surface px-3 py-2.5 text-xs shadow-bc-hard">
        <p class="font-display mb-2 text-sm font-semibold text-bc-text-primary">
          Compléter {{ completionCount }} test{{ completionCount > 1 ? 's' : '' }}
          <span class="font-normal text-bc-text-secondary">— durée estimée ≈ {{ formatDuration(completionEstimate.total) }}<template v-if="completionEstimate.unknown">, plus {{ completionEstimate.unknown }} test{{ completionEstimate.unknown > 1 ? 's' : '' }} sans référence</template></span>
        </p>
        <table class="mb-2 w-full font-mono">
          <tbody>
            <tr v-for="(ids, model) in completionPlan" :key="model" class="border-t border-bc-border">
              <td class="py-1 pr-3 text-bc-text-secondary">{{ model }}</td>
              <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap">{{ ids.length }} test{{ ids.length > 1 ? 's' : '' }}</td>
              <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap">
                {{ completionEstimate.perModel[model] ? '≈ ' + formatDuration(completionEstimate.perModel[model]) : 'durée inconnue' }}
              </td>
              <td class="py-1 text-bc-text-secondary truncate max-w-md" :title="ids.join(', ')">{{ ids.join(', ') }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mb-1 text-bc-text-secondary">
          Réglages par défaut (Paramétrage) : <span class="font-mono text-bc-text-secondary">{{ formatRunOptions(manifest?.default_options) }}</span>
          · juge : <span class="font-mono text-bc-text-secondary">{{ completionJudge ?? 'aucun (règles uniquement)' }}</span>
        </p>
        <p class="mb-2 text-bc-text-secondary">
          Estimation : durée moyenne des tests déjà passés par le modèle (même catégorie si possible), hors temps du juge.
          Les tests de réflexion imposent leurs propres limites (8192 tokens, contexte 9216, {{ thinkingLimitText }} par passage).
        </p>
        <BenchmarkPowerWarning class="mb-2" />
        <div class="flex justify-end gap-2">
          <button @click="completing = null" class="px-2.5 py-1 rounded-bc border-2 border-bc-border text-bc-text-secondary hover:bg-bc-surface-alt cursor-pointer">Annuler</button>
          <button
            @click="startCompletion"
            :disabled="running"
            class="px-2.5 py-1 rounded-bc border-2 border-bc-border-strong bg-bc-orange font-semibold text-bc-ink shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
          >
            {{ running ? 'Benchmark en cours…' : 'Lancer' }}
          </button>
        </div>
      </div>

      <div v-if="comparison.length > 0" class="mb-3">
        <div class="relative max-w-xs">
          <MagnifyingGlassIcon class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-bc-text-muted" />
          <input
            v-model="modelSearch"
            type="text"
            placeholder="Rechercher un modèle…"
            class="w-full pl-8 pr-2 py-1.5 text-sm rounded-bc border-2 border-bc-border-strong bg-bc-surface text-bc-text-primary placeholder:text-bc-text-muted focus:outline-none focus:border-bc-orange"
          />
        </div>
      </div>

      <div v-if="comparisonMode === 'capability' && allCapabilityGroups.length > 1" class="flex items-center gap-1.5 flex-wrap mb-3">
        <button
          @click="capabilityFilter = null"
          class="font-display flex items-center gap-1 px-2.5 py-1 text-xs rounded-bc border-2 cursor-pointer"
          :class="capabilityFilter === null ? 'border-bc-border-strong bg-bc-orange text-bc-ink' : 'border-bc-border text-bc-text-secondary hover:bg-bc-surface-alt'"
        >
          Toutes
        </button>
        <button
          v-for="id in allCapabilityGroups"
          :key="id"
          @click="capabilityFilter = id"
          class="font-display flex items-center gap-1 px-2.5 py-1 text-xs rounded-bc border-2 cursor-pointer"
          :class="capabilityFilter === id ? 'border-bc-border-strong bg-bc-orange text-bc-ink' : 'border-bc-border text-bc-text-secondary hover:bg-bc-surface-alt'"
        >
          <component :is="capabilityGroupIcons[id] ?? defaultCategoryIcon" class="w-3.5 h-3.5 shrink-0" />
          {{ capabilityGroupLabels[id] ?? id }}
        </button>
      </div>

      <p v-if="loadingComparison" class="text-sm text-bc-text-secondary">Chargement…</p>
      <p v-else-if="comparisonError" class="text-sm text-bc-danger">{{ comparisonError }}</p>
      <p v-else-if="comparison.length === 0" class="text-sm text-bc-text-secondary">Pas encore de modèle testé.</p>
      <p v-else-if="filteredComparison.length === 0" class="text-sm text-bc-text-secondary">Aucun modèle ne correspond à « {{ modelSearch }} ».</p>

      <div v-else class="max-h-[60vh] overflow-y-auto pr-1">
      <!-- Vue globale : une paire de barres (score, tok/s) par modèle -->
      <div v-if="comparisonMode === 'global'" class="space-y-3">
        <div v-for="m in filteredComparison" :key="m.model" class="rounded-bc border border-bc-border bg-bc-surface-alt px-3 py-2">
          <div class="flex items-center justify-between text-sm mb-1.5">
            <span class="font-mono text-bc-text-primary">{{ m.model }}</span>
            <span class="flex items-center gap-2">
              <span :class="scoreColorClass(m.avg_score)" class="text-xs font-medium">
                {{ m.avg_score }}/5 — {{ m.verdict }}
                <span class="text-bc-text-secondary font-normal">({{ m.total_tests }} test{{ m.total_tests > 1 ? 's' : '' }})</span>
              </span>
              <button
                v-if="missingByModel[m.model]"
                @click="completing = m.model"
                :disabled="running"
                :title="`Compléter ${missingByModel[m.model].length} test${missingByModel[m.model].length > 1 ? 's' : ''} manquant${missingByModel[m.model].length > 1 ? 's' : ''}`"
                class="flex items-center gap-0.5 p-1 rounded-md text-bc-green hover:text-bc-text-primary hover:bg-bc-surface disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <PlusCircleIcon class="w-4 h-4" />
                <span class="font-mono text-xs">{{ missingByModel[m.model].length }}</span>
              </button>
              <button @click="viewingTestsModel = m.model" title="Voir le détail des tests" class="p-1 rounded-md text-bc-text-secondary hover:text-bc-text-primary hover:bg-bc-surface cursor-pointer">
                <ListBulletIcon class="w-4 h-4" />
              </button>
              <button @click="removeModelFromComparison(m.model)" :disabled="deletingModel === m.model" title="Retirer du comparatif" class="p-1 rounded-md text-bc-danger/80 hover:text-bc-danger hover:bg-bc-surface disabled:opacity-40 cursor-pointer">
                <TrashIcon class="w-4 h-4" />
              </button>
            </span>
          </div>
          <div class="flex items-center gap-2 mb-1">
            <span class="w-14 shrink-0 text-xs text-bc-text-secondary">Score</span>
            <div class="h-2 flex-1 rounded-full bg-bc-surface-alt border border-bc-border overflow-hidden">
              <div class="h-full rounded-full" :class="scoreBarBg(m.avg_score)" :style="{ width: (m.avg_score / 5) * 100 + '%' }" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-14 shrink-0 text-xs text-bc-text-secondary">Tok/s</span>
            <div class="h-2 flex-1 rounded-full bg-bc-surface-alt border border-bc-border overflow-hidden">
              <div class="h-full rounded-full bg-bc-info" :style="{ width: tokensBarWidth(m.avg_tokens_per_sec) + '%' }" />
            </div>
            <span class="w-16 shrink-0 text-right text-xs text-bc-text-secondary font-mono">{{ m.avg_tokens_per_sec }} tok/s</span>
          </div>
        </div>
      </div>

      <!-- Vue par capacité : un groupe de barres (une par modèle) pour chaque capacité,
           filtrable sur une seule capacité via capabilityFilter -->
      <div v-else class="space-y-5">
        <p v-if="filteredCapabilityBreakdown.length === 0" class="text-sm text-bc-text-secondary">Pas de résultat pour cette capacité.</p>
        <div v-for="group in filteredCapabilityBreakdown" :key="group.id">
          <h3 class="font-display flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-bc-text-secondary mb-1.5">
            <component :is="capabilityGroupIcons[group.id] ?? defaultCategoryIcon" class="w-4 h-4 shrink-0" />
            {{ capabilityGroupLabels[group.id] ?? group.id }}
          </h3>
          <div class="space-y-2">
            <div v-for="entry in group.entries" :key="entry.model" class="rounded-bc border border-bc-border bg-bc-surface-alt px-3 py-1.5">
              <div class="flex items-center justify-between gap-2 text-xs mb-1">
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="shrink-0 w-6 text-right font-mono"
                    :class="entry.rank === 1 ? 'font-semibold text-bc-orange-light' : 'text-bc-text-secondary'"
                    :title="entry.rank === 1 ? `Meilleur modèle en ${capabilityGroupLabels[group.id] ?? group.id}` : `${entry.rank}e en ${capabilityGroupLabels[group.id] ?? group.id}`"
                  >#{{ entry.rank }}</span>
                  <span class="truncate font-mono text-bc-text-secondary" :title="entry.model">{{ entry.model }}</span>
                </span>
                <span class="shrink-0 whitespace-nowrap flex items-center gap-1.5">
                  <span :class="scoreColorClass(entry.avgScore)" class="font-medium">{{ entry.avgScore.toFixed(1) }}/5</span>
                  <span class="text-bc-text-secondary font-mono">
                    — {{ entry.avgTokensPerSec.toFixed(1) }} tok/s ({{ entry.testCount }} test{{ entry.testCount > 1 ? 's' : '' }})
                  </span>
                  <button @click="viewingTestsModel = entry.model" title="Voir le détail des tests" class="p-1 rounded-md text-bc-text-secondary hover:text-bc-text-primary hover:bg-bc-surface cursor-pointer">
                    <ListBulletIcon class="w-3.5 h-3.5" />
                  </button>
                  <button @click="removeModelFromComparison(entry.model)" :disabled="deletingModel === entry.model" title="Retirer du comparatif" class="p-1 rounded-md text-bc-danger/80 hover:text-bc-danger hover:bg-bc-surface disabled:opacity-40 cursor-pointer">
                    <TrashIcon class="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-bc-surface border border-bc-border overflow-hidden">
                <div class="h-full rounded-full" :class="scoreBarBg(entry.avgScore)" :style="{ width: (entry.avgScore / 5) * 100 + '%' }" />
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>

    <BenchmarkRunViewModal v-if="viewingRunId" :id="viewingRunId" @close="viewingRunId = null" />
    <BenchmarkModelTestsModal
      v-if="viewingTestsData"
      :model="viewingTestsData.model"
      :tests="viewingTestsData.tests"
      :avg-score="viewingTestsData.avg_score"
      :avg-tokens-per-sec="viewingTestsData.avg_tokens_per_sec"
      :verdict="viewingTestsData.verdict"
      @close="viewingTestsModel = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { EyeIcon, TrashIcon, ListBulletIcon, MagnifyingGlassIcon, PlusCircleIcon } from '@heroicons/vue/24/outline'
import BenchmarkRunViewModal from './BenchmarkRunViewModal.vue'
import BenchmarkModelTestsModal from './BenchmarkModelTestsModal.vue'
import BenchmarkPowerWarning from './BenchmarkPowerWarning.vue'

const { scoreColorClass, formatDuration, formatRunOptions } = useBenchmarkFormat()
const { categoryCapability, capabilityGroupLabels, capabilityOrder, capabilityGroupIcons, defaultCategoryIcon, requiredCapabilities } = useTestCategories()
const { modelList } = useModels()
const { running, runBenchmark } = useBenchmarkRun()

const runs = ref([])
const loadingRuns = ref(true)
const runsError = ref('')
const deletingId = ref(null)
const deleteError = ref('')
const viewingRunId = ref(null)
const viewingTestsModel = ref(null)
const viewingTestsData = computed(() => comparison.value.find((m) => m.model === viewingTestsModel.value) ?? null)

const comparison = ref([])
const loadingComparison = ref(true)
const comparisonError = ref('')
const comparisonMode = ref('global')
const capabilityFilter = ref(null)
const modelSearch = ref('')
const deletingModel = ref(null)

async function loadRuns() {
  loadingRuns.value = true
  runsError.value = ''
  try {
    runs.value = await $fetch('/api/benchmark/results')
  } catch (e) {
    runsError.value = e.data?.statusMessage ?? 'Erreur lors du chargement des runs'
  } finally {
    loadingRuns.value = false
  }
}

async function loadComparison() {
  loadingComparison.value = true
  comparisonError.value = ''
  try {
    comparison.value = await $fetch('/api/benchmark/comparison')
  } catch (e) {
    comparisonError.value = e.data?.statusMessage ?? 'Erreur lors du chargement du comparatif'
  } finally {
    loadingComparison.value = false
  }
}

onMounted(() => {
  loadRuns()
  loadComparison()
  loadManifest()
})

// fin d'un benchmark (lancé d'ici ou de l'onglet Tests) : les runs et le comparatif ont changé
watch(running, (now, before) => {
  if (before && !now) {
    loadRuns()
    loadComparison()
  }
})

// --- Compléter les tests manquants
// Pour chaque modèle du comparatif encore installé : les tests de la banque qu'il PEUT passer (capacités Ollama
// réelles, même règle que l'onglet Tests) mais qui n'y figurent pas. Les tests en erreur, exclus du comparatif,
// en font donc partie, comme les tests ajoutés à la banque depuis son dernier run.
const manifest = ref(null)
// plafond de durée d'un passage de test « thinking » (THINKING_TIME_LIMIT_SEC, lib/config.py)
const thinkingLimitText = computed(() => {
  const s = manifest.value?.thinking_time_limit_sec
  return s ? `${Math.round(s / 60)} min` : '5 min'
})

async function loadManifest() {
  try {
    manifest.value = await $fetch('/api/benchmark/manifest')
  } catch {
    manifest.value = null // pas de manifest : pas de bouton, le reste du comparatif reste utilisable
  }
}

const testCategoryById = computed(() => {
  const map = {}
  for (const c of manifest.value?.categories ?? []) for (const t of c.tests) map[t.id] = c.id
  return map
})

const missingByModel = computed(() => {
  const out = {}
  if (!manifest.value || !modelList.value) return out
  for (const m of comparison.value) {
    const caps = modelList.value.find((x) => x.name === m.model)?.capabilities
    if (!caps) continue // supprimé d'Ollama depuis : impossible à relancer
    const done = new Set(m.tests.map((t) => t.test_id))
    const ids = manifest.value.categories
      .filter((c) => requiredCapabilities(c.id).every((cap) => caps.includes(cap)))
      .flatMap((c) => c.tests.map((t) => t.id))
      .filter((id) => !done.has(id))
    if (ids.length) out[m.model] = ids
  }
  return out
})

const missingTotal = computed(() => Object.values(missingByModel.value).reduce((n, ids) => n + ids.length, 0))
const missingModelCount = computed(() => Object.keys(missingByModel.value).length)

const completing = ref(null) // null | 'all' | nom d'un modèle

const completionPlan = computed(() => {
  if (completing.value === 'all') return missingByModel.value
  const ids = missingByModel.value[completing.value]
  return ids ? { [completing.value]: ids } : {}
})
const completionCount = computed(() => Object.values(completionPlan.value).reduce((n, ids) => n + ids.length, 0))

// Durée estimée d'un test manquant : moyenne des tests de la même catégorie déjà passés par ce modèle, sinon
// moyenne de tous ses tests. Une catégorie jamais passée (ex. les tests de réflexion, passés deux fois)
// peut donc être sous-estimée : l'ordre de grandeur compte plus que la précision.
const completionEstimate = computed(() => {
  const perModel = {}
  let total = 0
  let unknown = 0
  const avg = (tests) => tests.reduce((s, t) => s + (t.elapsed_sec ?? 0), 0) / tests.length
  for (const [model, ids] of Object.entries(completionPlan.value)) {
    const tests = comparison.value.find((m) => m.model === model)?.tests ?? []
    let sec = 0
    for (const id of ids) {
      const sameCategory = tests.filter((t) => t.category === testCategoryById.value[id])
      if (sameCategory.length) sec += avg(sameCategory)
      else if (tests.length) sec += avg(tests)
      else unknown++
    }
    perModel[model] = sec
    total += sec
  }
  return { perModel, total, unknown }
})

// juge par défaut (Paramétrage), s'il est installé ; sinon notation par règles seule
const completionJudge = computed(() => {
  const judge = manifest.value?.default_judge
  return judge && modelList.value?.some((m) => m.name === judge) ? judge : null
})

function startCompletion() {
  runBenchmark({
    plan: completionPlan.value,
    judgeModel: completionJudge.value,
    options: manifest.value?.default_options,
  })
  completing.value = null // la progression s'affiche dans la fenêtre du run en cours
}

// le modèle visé a disparu du plan (tests complétés, modèle supprimé) : on referme la confirmation
watch(completionPlan, (plan) => {
  if (completing.value && !Object.keys(plan).length) completing.value = null
})

const filteredComparison = computed(() => {
  const q = modelSearch.value.trim().toLowerCase()
  if (!q) return comparison.value
  return comparison.value.filter((m) => m.model.toLowerCase().includes(q))
})

async function removeModelFromComparison(model) {
  if (!confirm(`Retirer « ${model} » du comparatif ?`)) return
  deletingModel.value = model
  comparisonError.value = ''
  try {
    await $fetch(`/api/benchmark/comparison/${encodeURIComponent(model)}`, { method: 'DELETE' })
    if (viewingTestsModel.value === model) viewingTestsModel.value = null
    await loadComparison()
  } catch (e) {
    comparisonError.value = e.data?.statusMessage ?? 'Erreur lors de la suppression du modèle'
  } finally {
    deletingModel.value = null
  }
}

async function removeRun(id) {
  if (!confirm('Supprimer ce fichier de résultats ?')) return
  deletingId.value = id
  deleteError.value = ''
  try {
    await $fetch(`/api/benchmark/results/${id}`, { method: 'DELETE' })
    await loadRuns()
    await loadComparison()
  } catch (e) {
    deleteError.value = e.data?.statusMessage ?? 'Erreur lors de la suppression'
  } finally {
    deletingId.value = null
  }
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function scoreBarBg(score) {
  const map = { 1: 'bg-bc-danger', 2: 'bg-bc-orange', 3: 'bg-bc-warning', 4: 'bg-bc-green', 5: 'bg-bc-green-dark' }
  return map[Math.round(score)] ?? 'bg-bc-border'
}

const maxTokensPerSec = computed(() => Math.max(1, ...comparison.value.map((m) => m.avg_tokens_per_sec)))
function tokensBarWidth(tps) {
  return Math.min(100, (tps / maxTokensPerSec.value) * 100)
}

// Pour chaque modèle du comparatif, regroupe ses tests par capacité (via
// categoryCapability) et calcule le score/tok-s moyen par groupe — même
// principe que le regroupement de sélection des tests dans BenchmarkRunner,
// mais appliqué aux résultats plutôt qu'au manifest.
const capabilityBreakdown = computed(() => {
  const byGroup = {}
  for (const m of filteredComparison.value) {
    const perGroupTests = {}
    for (const test of m.tests) {
      const groupId = categoryCapability[test.category] ?? 'other'
      ;(perGroupTests[groupId] ??= []).push(test)
    }
    for (const [groupId, tests] of Object.entries(perGroupTests)) {
      const avgScore = tests.reduce((s, t) => s + t.score, 0) / tests.length
      const avgTokensPerSec = tests.reduce((s, t) => s + t.tokens_per_sec, 0) / tests.length
      ;(byGroup[groupId] ??= []).push({ model: m.model, avgScore, avgTokensPerSec, testCount: tests.length })
    }
  }
  // Classement PROPRE à chaque capacité : par note dans cette capacité (et non par note globale, qui
  // plaçait par ex. un modèle à 3,7/5 en raisonnement devant un autre à 4,0/5), puis à égalité par vitesse.
  // Les notes sont comparées arrondies au dixième, comme elles sont affichées : deux modèles affichés
  // « 4.0/5 » sont départagés par leur vitesse, pas par une différence invisible.
  const byScoreThenSpeed = (a, b) =>
    Math.round(b.avgScore * 10) - Math.round(a.avgScore * 10) || b.avgTokensPerSec - a.avgTokensPerSec
  return [...capabilityOrder, 'other']
    .filter((id) => byGroup[id]?.length)
    .map((id) => ({ id, entries: [...byGroup[id]].sort(byScoreThenSpeed).map((e, i) => ({ ...e, rank: i + 1 })) }))
})

const allCapabilityGroups = computed(() => capabilityBreakdown.value.map((g) => g.id))

const filteredCapabilityBreakdown = computed(() => {
  if (!capabilityFilter.value) return capabilityBreakdown.value
  return capabilityBreakdown.value.filter((g) => g.id === capabilityFilter.value)
})
</script>
