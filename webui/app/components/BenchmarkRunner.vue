<template>
  <div>
    <!-- 1. Modèles -->
    <section class="mb-6">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-muted">1. Modèles à tester</h2>
        <span class="text-xs text-bc-text-muted">({{ selectedModels.length }}/{{ modelList?.length ?? 0 }} sélectionnés)</span>
        <label class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            :checked="allModelsSelected"
            @change="toggleAllModels($event.target.checked)"
            class="accent-bc-orange"
            :disabled="running || !modelList?.length"
          />
          Tout sélectionner
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
              v-for="model in modelList"
              :key="model.name"
              class="flex items-center gap-1.5 text-sm text-bc-text-secondary cursor-pointer select-none"
            >
              <input type="checkbox" :value="model.name" v-model="selectedModels" class="accent-bc-orange shrink-0" :disabled="running" />
              <span class="truncate font-mono" :title="model.name">{{ model.name }}</span>
            </label>
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

    <!-- Lancement -->
    <div class="flex items-center gap-3 mb-6">
      <p v-if="running" class="text-xs text-bc-text-muted">
        
      </p>
      <button
        @click="startRun"
        :disabled="running || selectedModels.length === 0 || selectedTests.length === 0"
        class="px-4 py-2 rounded-bc font-display font-semibold border-2 border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform duration-75 cursor-pointer disabled:cursor-not-allowed disabled:border-bc-border disabled:shadow-none"
        :class="running || selectedModels.length === 0 || selectedTests.length === 0
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

    <TestsManagerModal v-if="showTestsManager" @close="showTestsManager = false" @changed="loadManifest" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ChevronDownIcon } from '@heroicons/vue/24/outline'
import TestsManagerModal from './TestsManagerModal.vue'

const { modelList } = useModels()
const { categoryLabels, categoryCapability, capabilityGroupLabels, capabilityOrder, categoryIcons, defaultCategoryIcon } = useTestCategories()
const { running, runBenchmark } = useBenchmarkRun()

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

const allModelsSelected = computed(() => {
  return !!modelList.value?.length && selectedModels.value.length === modelList.value.length
})

function toggleAllModels(checked) {
  selectedModels.value = checked ? modelList.value.map((m) => m.name) : []
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

function startRun() {
  runBenchmark({
    models: selectedModels.value,
    testIds: selectedTests.value,
    judgeModel: judgeEnabled.value ? judgeModel.value : null,
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
