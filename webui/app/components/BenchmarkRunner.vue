<template>
  <div>
    <!-- 1. Modèles -->
    <section class="mb-6">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-muted">1. Modèles à tester</h2>
        <span class="text-xs text-bc-text-muted">
          ({{ selectedModels.length }}/{{ modelList?.length ?? 0 }} sélectionnés<template v-if="hiddenSelectedCount">, dont {{ hiddenSelectedCount }} masqué{{ hiddenSelectedCount > 1 ? 's' : '' }}</template>)
        </span>
        <label class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            :checked="allModelsSelected"
            @change="toggleAllModels($event.target.checked)"
            class="accent-bc-orange"
            :disabled="running || !visibleModels.length"
          />
          Tout sélectionner
        </label>
        <label
          class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none"
          title="N'affiche que les modèles absents du comparatif (aucun test enregistré)"
        >
          <input type="checkbox" v-model="untestedOnly" class="accent-bc-orange" :disabled="running" />
          Non testés uniquement ({{ untestedCount }})
        </label>
      </div>
      <p v-if="!modelList" class="text-sm text-bc-text-muted">Chargement des modèles…</p>
      <details v-else class="group rounded-bc border border-bc-border bg-bc-surface-alt">
        <summary class="flex items-center gap-1.5 px-3 py-2 text-sm text-bc-text-muted cursor-pointer select-none">
          <span>Sélectionner modèles</span>
          <ChevronDownIcon class="w-4 h-4 text-bc-text-muted shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div class="border-t border-bc-border p-3">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-1.5 max-h-64 overflow-y-auto">
            <label
              v-for="model in visibleModels"
              :key="model.name"
              class="flex items-center gap-1.5 text-sm text-bc-text-secondary cursor-pointer select-none"
            >
              <input type="checkbox" :value="model.name" v-model="selectedModels" class="accent-bc-orange shrink-0" :disabled="running" />
              <span class="truncate font-mono" :title="model.name">{{ model.name }}</span>
              <span
                v-if="scores[model.name]"
                class="shrink-0 font-mono text-[10px]"
                :class="scoreColorClass(scores[model.name].avg_score)"
                :title="`Déjà testé : ${scores[model.name].total_tests} tests au comparatif`"
              >
                {{ scores[model.name].avg_score.toFixed(1) }}
              </span>
            </label>
            <p v-if="!visibleModels.length" class="col-span-full text-xs text-bc-text-muted">Tous les modèles ont déjà été testés.</p>
          </div>
        </div>
      </details>
    </section>

    <!-- 2. Tests -->
    <section class="mb-6">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-muted">2. Tests à lancer</h2>
        <span class="text-xs text-bc-text-muted">({{ selectedTests.length }}/{{ availableTestCount }} disponibles)</span>
        <label class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            :checked="allTestsSelected"
            @change="toggleAllTests($event.target.checked)"
            class="accent-bc-orange"
            :disabled="running || availableTestCount === 0"
          />
          Tout sélectionner
        </label>
        <button
          @click="showTestsManager = true"
          class="ml-auto px-2.5 py-1 text-xs rounded-bc bg-bc-surface text-bc-orange-light border-2 border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform duration-75 cursor-pointer"
        >
          Gérer les tests
        </button>
      </div>
      <p v-if="!manifest" class="text-sm text-bc-text-muted">Chargement des tests…</p>
      <div v-else class="space-y-4">
        <div v-for="group in capabilityGroups" :key="group.id">
          <h3 class="font-display text-xs font-medium uppercase tracking-wide text-bc-text-muted mb-1.5">{{ group.label }}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <details
              v-for="category in group.categories"
              :key="category.id"
              class="group rounded-bc border border-bc-border"
              :class="isCategoryAvailable(category) ? 'bg-bc-surface-alt' : 'bg-bc-surface-alt/40 opacity-40'"
            >
              <summary
                class="flex items-center gap-1.5 px-3 py-2 text-sm text-bc-text-muted select-none"
                :class="isCategoryAvailable(category) ? 'cursor-pointer' : 'cursor-default'"
                @click="onCategorySummaryClick(category, $event)"
              >
                <span class="flex items-center gap-1.5">
                  <component :is="categoryIcons[category.id] ?? defaultCategoryIcon" class="w-4 h-4 text-bc-text-muted shrink-0" />
                  {{ categoryLabels[category.id] ?? category.id }}
                  <span class="text-bc-text-muted text-xs">({{ countSelected(category) }}/{{ category.tests.length }})</span>
                </span>
                <ChevronDownIcon
                  v-if="isCategoryAvailable(category)"
                  class="w-4 h-4 text-bc-text-muted shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              <div class="border-t border-bc-border p-2 space-y-1">
                <label class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    :checked="isCategoryFullySelected(category)"
                    @change="toggleCategory(category, $event.target.checked)"
                    class="accent-bc-orange"
                    :disabled="running || !isCategoryAvailable(category)"
                  />
                  Tout sélectionner
                </label>
                <label
                  v-for="test in category.tests"
                  :key="test.id"
                  :title="test.description"
                  class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    :value="test.id"
                    v-model="selectedTests"
                    class="accent-bc-orange shrink-0"
                    :disabled="running || !isCategoryAvailable(category)"
                  />
                  <span class="truncate">{{ test.label }}</span>
                </label>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. Juge -->
    <section class="mb-6">
      <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-muted mb-2">3. Juge LLM</h2>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5 text-sm text-bc-text-secondary cursor-pointer select-none">
          <input type="checkbox" v-model="judgeEnabled" class="accent-bc-orange" :disabled="running" />
          Activer le juge
        </label>
        <select
          v-model="judgeModel"
          :disabled="!judgeEnabled || running"
          class="px-2 py-1 text-sm rounded-bc bg-bc-surface-alt border border-bc-border text-bc-text-muted font-mono disabled:opacity-40"
        >
          <option v-for="model in modelList" :key="model.name" :value="model.name">{{ model.name }}</option>
        </select>
        <p v-if="judgeEnabled && !defaultJudgeAvailable" class="text-xs text-bc-warning">
          Juge par défaut "{{ manifest?.default_judge }}" introuvable — choisis un autre modèle.
        </p>
      </div>
    </section>

    <!-- 4. Réglages de génération -->
    <section v-if="options" class="mb-6">
      <div class="flex items-center gap-1.5 mb-2">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-muted">4. Réglages de génération</h2>
        <!-- info-bulle explicative : à quoi servent ces réglages (et ce qu'ils ne font PAS). Affichée au
             survol ET au focus clavier (Tab), un title natif ne permettant ni gras ni liste -->
        <span class="group relative inline-flex">
          <button
            type="button"
            aria-label="À quoi servent les réglages de génération ?"
            aria-describedby="bench-options-help"
            class="text-bc-text-muted hover:text-bc-info focus:text-bc-info focus:outline-none cursor-help"
          >
            <InformationCircleIcon class="w-4 h-4" aria-hidden="true" />
          </button>
          <div
            id="bench-options-help"
            role="tooltip"
            class="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-100 absolute left-0 top-full z-20 mt-1.5 w-[28rem] max-w-[calc(100vw-2rem)] space-y-1.5 rounded-bc border-2 border-bc-border-strong bg-bc-surface px-3 py-2.5 text-xs font-normal normal-case tracking-normal leading-relaxed text-bc-text-secondary shadow-bc-hard-sm"
          >
            <p>
              Les conditions dans lesquelles les modèles passent les tests, <strong class="text-bc-text-primary">le temps de ce run uniquement</strong> :
              les modèles eux-mêmes ne sont pas modifiés (pour changer durablement leurs paramètres : page Modèles → fiche du modèle → Modifier).
            </p>
            <ul class="list-disc pl-4 space-y-0.5">
              <li><strong class="text-bc-text-primary">Comparer équitablement</strong> : avec les valeurs par défaut, tous les modèles sont testés dans les mêmes conditions — c'est ce qui rend leurs notes comparables.</li>
              <li><strong class="text-bc-text-primary">Tester un modèle tel que tu l'utilises</strong> : « valeur du modèle » applique les réglages de son modelfile (ex. un preset coder ou chat).</li>
              <li><strong class="text-bc-text-primary">Explorer</strong> : une température plus haute rend les réponses plus variées (plus basse : plus prévisibles) ; un contexte plus grand permet des prompts plus longs mais prend plus de VRAM ; « tokens max » coupe les réponses trop longues.</li>
            </ul>
          </div>
        </span>
      </div>

      <div class="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <label class="block text-xs text-bc-text-muted mb-1" for="bench-temperature">Température</label>
          <div class="flex items-center gap-2">
            <input
              id="bench-temperature"
              v-model.number="options.temperature"
              type="number" min="0" max="2" step="0.1"
              :disabled="running || modelDefault.temperature"
              class="w-20 px-2 py-1 text-sm rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-bc-text-primary disabled:opacity-40"
            />
            <label class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none">
              <input type="checkbox" v-model="modelDefault.temperature" class="accent-bc-orange" :disabled="running" />
              valeur du modèle
            </label>
          </div>
        </div>

        <div>
          <label class="block text-xs text-bc-text-muted mb-1" for="bench-num-ctx" title="Taille du contexte en tokens : plus elle est grande, plus le KV cache prend de VRAM">Contexte (num_ctx)</label>
          <div class="flex items-center gap-2">
            <input
              id="bench-num-ctx"
              v-model.number="options.num_ctx"
              type="number" min="1024" max="262144" step="1024" list="bench-ctx-sizes"
              :disabled="running || modelDefault.num_ctx"
              class="w-24 px-2 py-1 text-sm rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-bc-text-primary disabled:opacity-40"
            />
            <datalist id="bench-ctx-sizes">
              <option v-for="n in [2048, 4096, 8192, 16384, 32768]" :key="n" :value="n" />
            </datalist>
            <label
              class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none"
              title="Chaque modèle utilise le num_ctx de son modelfile (sinon le défaut d'Ollama, 4096)"
            >
              <input type="checkbox" v-model="modelDefault.num_ctx" class="accent-bc-orange" :disabled="running" />
              valeur du modèle
            </label>
          </div>
        </div>

        <div>
          <label class="block text-xs text-bc-text-muted mb-1" for="bench-num-predict" title="Plafond de tokens générés par réponse : coupe les modèles qui ne s'arrêtent jamais">Tokens max par réponse</label>
          <input
            id="bench-num-predict"
            v-model.number="options.num_predict"
            type="number" min="128" max="32768" step="128"
            :disabled="running"
            class="w-24 px-2 py-1 text-sm rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-bc-text-primary disabled:opacity-40"
          />
        </div>

        <button
          v-if="optionsChanged"
          @click="resetOptions"
          :disabled="running"
          class="text-xs text-bc-text-muted hover:text-bc-text-secondary underline"
        >
          Valeurs par défaut
        </button>
      </div>
      <p class="mt-2 text-xs text-bc-text-muted">
        Le juge garde ses propres réglages fixes. Les réglages sont enregistrés avec chaque résultat.
        <span v-if="optionsChanged" class="text-bc-warning">
          Réglages différents des valeurs par défaut : le comparatif mélangera des tests passés dans des conditions différentes.
        </span>
      </p>
      <p v-if="optionsError" class="mt-1 text-xs text-bc-danger">{{ optionsError }}</p>
    </section>

    <!-- Lancement -->
    <div class="flex items-center gap-3 mb-6">
      <p v-if="running" class="text-xs text-bc-text-muted">
        
      </p>
      <button
        @click="startRun"
        :disabled="running || !Object.keys(runPlan).length || !!optionsError"
        class="px-4 py-2 rounded-bc font-display font-semibold border-2 border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform duration-75 cursor-pointer disabled:cursor-not-allowed disabled:border-bc-border disabled:shadow-none"
        :class="running || !Object.keys(runPlan).length || optionsError
          ? 'bg-bc-surface-alt text-bc-text-muted'
          : 'bg-bc-green text-bc-ink'"
      >
      <span v-if="running" class="text-xs">
          Benchmark en cours...
      </span>
      <span v-else class="text-sm ">
        Lancer le benchmark
      </span>
        
      </button>
     
    </div>

    <p v-if="excludedCount > 0 && !running" class="-mt-4 mb-6 text-xs text-bc-text-muted">
      {{ excludedCount }} combinaison{{ excludedCount > 1 ? 's' : '' }} modèle × test écartée{{ excludedCount > 1 ? 's' : '' }} :
      le modèle n'a pas la capacité requise (ex. vision, appel d'outils).
    </p>

    <TestsManagerModal v-if="showTestsManager" @close="showTestsManager = false" @changed="loadManifest" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ChevronDownIcon, InformationCircleIcon } from '@heroicons/vue/24/outline'
import TestsManagerModal from './TestsManagerModal.vue'

const { modelList } = useModels()
const { categoryLabels, categoryCapability, capabilityGroupLabels, capabilityOrder, categoryIcons, defaultCategoryIcon } = useTestCategories()
const { running, runBenchmark } = useBenchmarkRun()
const { scoreColorClass } = useBenchmarkFormat()

// Notes du comparatif (leaderboard.json) par modèle : un modèle absent n'a jamais été testé.
// Rechargées à la fin de chaque run, pour qu'un modèle qui vient d'être testé quitte le filtre.
const { data: comparison, refresh: refreshComparison } = useFetch('/api/benchmark/comparison', { default: () => [] })
const scores = computed(() => Object.fromEntries((comparison.value ?? []).map((e) => [e.model, e])))
watch(running, (isRunning, wasRunning) => { if (wasRunning && !isRunning) refreshComparison() })

const untestedOnly = ref(false)
const visibleModels = computed(() =>
  (modelList.value ?? []).filter((m) => !untestedOnly.value || !scores.value[m.name])
)
const untestedCount = computed(() => (modelList.value ?? []).filter((m) => !scores.value[m.name]).length)
// modèles cochés mais masqués par le filtre : ils seront quand même testés, on le signale
const hiddenSelectedCount = computed(() => {
  const visible = new Set(visibleModels.value.map((m) => m.name))
  return selectedModels.value.filter((name) => !visible.has(name)).length
})

// --- Réglages de génération (préremplis depuis manifest.default_options, cf. lib/config.py)
const options = ref(null) // { temperature, num_ctx, num_predict } tels que saisis
const modelDefault = reactive({ temperature: false, num_ctx: false }) // cochée = ne pas imposer de valeur

function resetOptions() {
  const d = manifest.value?.default_options
  if (!d) return
  options.value = { temperature: d.temperature ?? 0.2, num_ctx: d.num_ctx ?? 8192, num_predict: d.num_predict }
  modelDefault.temperature = d.temperature == null
  modelDefault.num_ctx = d.num_ctx == null
}

// valeurs réellement envoyées : null pour « valeur du modèle »
const runOptions = computed(() => options.value && {
  temperature: modelDefault.temperature ? null : options.value.temperature,
  num_ctx: modelDefault.num_ctx ? null : options.value.num_ctx,
  num_predict: options.value.num_predict,
})

const optionsChanged = computed(() => {
  const d = manifest.value?.default_options
  const o = runOptions.value
  return !!d && !!o && (o.temperature !== d.temperature || o.num_ctx !== d.num_ctx || o.num_predict !== d.num_predict)
})

// mêmes bornes que la validation serveur (run.post.ts)
const optionsError = computed(() => {
  const o = runOptions.value
  if (!o) return ''
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
  if (o.temperature !== null && !(isNum(o.temperature) && o.temperature >= 0 && o.temperature <= 2)) return 'Température : entre 0 et 2.'
  if (o.num_ctx !== null && !(Number.isInteger(o.num_ctx) && o.num_ctx >= 512 && o.num_ctx <= 262144)) return 'Contexte : nombre entier entre 512 et 262144.'
  if (!(Number.isInteger(o.num_predict) && o.num_predict >= 16 && o.num_predict <= 32768)) return 'Tokens max : nombre entier entre 16 et 32768.'
  return ''
})

const manifest = ref(null)
const selectedModels = ref([])
const selectedTests = ref([])
const judgeEnabled = ref(true)
const judgeModel = ref('')
const showTestsManager = ref(false)

// Le manifest (catégories/tests/juge par défaut) est statique — il ne dépend
// plus des modèles sélectionnés, un seul fetch au montage suffit. La
// disponibilité par modèle est calculée en local via availableCategoryIds
// (vraies capacités Ollama), pas par le champ "recommended" du manifest
// (heuristique par nom côté Python — voir la note sur categoryRequiredCapabilities
// plus bas pour pourquoi ce champ n'est plus utilisé ici).
async function loadManifest() {
  const data = await $fetch('/api/benchmark/manifest')
  manifest.value = data

  if (!judgeModel.value && data.default_judge) {
    judgeModel.value = data.default_judge
  }
  // premier chargement seulement : « Gérer les tests » recharge le manifest sans toucher aux réglages
  if (!options.value) resetOptions()
}

// Capacités RÉELLEMENT requises sur un modèle pour pouvoir lancer les tests
// d'une catégorie, vérifiées via `model.capabilities` — renvoyé nativement par
// `/api/tags` (completion, tools, thinking, vision, embedding, insert, voir
// ModelList.vue). Différent de categoryCapability (qui ne sert qu'au
// regroupement visuel) : ex. "reasoning" est affiché sous "Thinking" mais ne
// nécessite pas réellement la capacité "thinking" pour tourner (un prompt de
// raisonnement classique passe par un simple /api/chat) — seul "completion"
// est requis. Sans ce garde-fou basé sur les vraies capacités, un modèle
// embedding-only (capabilities: ["embedding"]) tombait dans le fallback
// générique de l'heuristique par nom côté Python et se voyait proposer TOUS
// les tests, alors qu'il ne peut générer aucun texte.
const categoryRequiredCapabilities = {
  code: ['completion'],
  chat: ['completion'],
  reasoning: ['completion'],
  instruction_following: ['completion'],
  summarization: ['completion'],
  structured_extraction: ['completion'],
  classification: ['completion'],
  data_analysis: ['completion'],
  translation: ['completion'],
  security: ['completion'],
  code_style: ['completion'],
  tool_calling: ['completion', 'tools'],
  vision: ['completion', 'vision'],
}

// Une catégorie est disponible si AU MOINS UN des modèles sélectionnés possède
// TOUTES les capacités qu'elle requiert.
const availableCategoryIds = computed(() => {
  if (!manifest.value || !modelList.value) return new Set()
  const selected = modelList.value.filter((m) => selectedModels.value.includes(m.name))
  const available = new Set()
  for (const category of manifest.value.categories) {
    const required = categoryRequiredCapabilities[category.id] ?? ['completion']
    const hasCapableModel = selected.some((m) => required.every((cap) => m.capabilities?.includes(cap)))
    if (hasCapableModel) available.add(category.id)
  }
  return available
})

function isCategoryAvailable(category) {
  return availableCategoryIds.value.has(category.id)
}

// Regroupe les catégories du manifest par capacité (voir categoryCapability),
// dans l'ordre de capabilityOrder puis "Autres" pour ce qui ne correspond à
// aucune capacité connue — un groupe sans catégorie n'est pas affiché.
const capabilityGroups = computed(() => {
  if (!manifest.value) return []
  const byCapability = {}
  for (const category of manifest.value.categories) {
    const capability = categoryCapability[category.id] ?? 'other'
    ;(byCapability[capability] ??= []).push(category)
  }
  return [...capabilityOrder, 'other']
    .filter((id) => byCapability[id]?.length)
    .map((id) => ({
      id,
      label: id === 'other' ? 'Autres' : capabilityGroupLabels[id],
      categories: byCapability[id],
    }))
})

// Empêche le <details> de s'ouvrir/fermer (comportement natif au clic sur <summary>)
// tant que la catégorie n'est pas disponible pour les modèles sélectionnés.
function onCategorySummaryClick(category, event) {
  if (!isCategoryAvailable(category)) {
    event.preventDefault()
  }
}

// Garde selectedTests synchronisé avec la disponibilité des catégories :
// - une catégorie qui vient de devenir disponible (nouveau modèle sélectionné) a
//   tous ses tests auto-cochés par défaut
// - une catégorie qui redevient indisponible (modèle désélectionné) a ses tests
//   décochés
// Un désélectionnement manuel d'un test dans une catégorie déjà disponible n'est
// pas ré-écrasé — seuls les tests des catégories NOUVELLEMENT disponibles sont
// auto-sélectionnés (voir previousAvailableCategoryIds).
let previousAvailableCategoryIds = new Set()

function syncSelectedTestsWithAvailability() {
  if (!manifest.value) return
  const currentAvailable = availableCategoryIds.value

  const newlyAvailable = manifest.value.categories.filter(
    (c) => currentAvailable.has(c.id) && !previousAvailableCategoryIds.has(c.id)
  )
  if (newlyAvailable.length > 0) {
    const newlyAvailableTestIds = newlyAvailable.flatMap((c) => c.tests.map((t) => t.id))
    selectedTests.value = [...new Set([...selectedTests.value, ...newlyAvailableTestIds])]
  }

  const availableTestIds = new Set(
    manifest.value.categories
      .filter((c) => currentAvailable.has(c.id))
      .flatMap((c) => c.tests.map((t) => t.id))
  )
  selectedTests.value = selectedTests.value.filter((id) => availableTestIds.has(id))

  previousAvailableCategoryIds = new Set(currentAvailable)
}

const defaultJudgeAvailable = ref(true)
watch([manifest, modelList], () => {
  if (!manifest.value?.default_judge || !modelList.value) return
  defaultJudgeAvailable.value = modelList.value.some((m) => m.name === manifest.value.default_judge)
})

watch(availableCategoryIds, syncSelectedTestsWithAvailability)

onMounted(loadManifest)

// « Tout sélectionner » agit sur les modèles AFFICHÉS (avec le filtre : tous les non testés)
const allModelsSelected = computed(() => {
  return visibleModels.value.length > 0 && visibleModels.value.every((m) => selectedModels.value.includes(m.name))
})

function toggleAllModels(checked) {
  const visible = visibleModels.value.map((m) => m.name)
  selectedModels.value = checked
    ? [...new Set([...selectedModels.value, ...visible])]
    : selectedModels.value.filter((name) => !visible.includes(name))
}

const availableTestIds = computed(() => {
  if (!manifest.value) return []
  return manifest.value.categories
    .filter((c) => isCategoryAvailable(c))
    .flatMap((c) => c.tests.map((t) => t.id))
})

const availableTestCount = computed(() => availableTestIds.value.length)

const allTestsSelected = computed(() => {
  return availableTestIds.value.length > 0 && availableTestIds.value.every((id) => selectedTests.value.includes(id))
})

function toggleAllTests(checked) {
  selectedTests.value = checked ? [...availableTestIds.value] : []
}

function countSelected(category) {
  return category.tests.filter((t) => selectedTests.value.includes(t.id)).length
}

// Plan par modèle : chaque modèle ne reçoit que les tests sélectionnés dont il a la capacité requise.
// Avant, la même liste partait à tous les modèles dès qu'UN modèle sélectionné avait la capacité : les tests
// de vision envoyés à un modèle qui ne voit pas revenaient vides… et étaient notés jusqu'à 4/5.
const testCategory = computed(() => {
  const map = {}
  for (const c of manifest.value?.categories ?? []) for (const t of c.tests) map[t.id] = c.id
  return map
})

const runPlan = computed(() => {
  const plan = {}
  for (const name of selectedModels.value) {
    const caps = modelList.value?.find((m) => m.name === name)?.capabilities ?? []
    const ids = selectedTests.value.filter((id) =>
      (categoryRequiredCapabilities[testCategory.value[id]] ?? ['completion']).every((cap) => caps.includes(cap))
    )
    if (ids.length) plan[name] = ids
  }
  return plan
})

// combinaisons modèle × test écartées faute de capacité (affichées sous le bouton de lancement)
const excludedCount = computed(() =>
  selectedModels.value.length * selectedTests.value.length
  - Object.values(runPlan.value).reduce((n, ids) => n + ids.length, 0)
)

function startRun() {
  runBenchmark({
    plan: runPlan.value,
    judgeModel: judgeEnabled.value ? judgeModel.value : null,
    options: runOptions.value,
  })
}

function isCategoryFullySelected(category) {
  return category.tests.length > 0 && category.tests.every((t) => selectedTests.value.includes(t.id))
}

function toggleCategory(category, checked) {
  const ids = category.tests.map((t) => t.id)
  if (checked) {
    selectedTests.value = [...new Set([...selectedTests.value, ...ids])]
  } else {
    selectedTests.value = selectedTests.value.filter((id) => !ids.includes(id))
  }
}
</script>
