<template>
  <Modal size="xl" @close="emit('close')">
    <template #header>{{ view === 'form' ? (editingId ? 'Modifier le test' : 'Nouveau test') : 'Gérer les tests' }}</template>

    <!-- ───────────────────────── Liste ───────────────────────── -->
    <div v-if="view === 'list'">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs text-bc-text-muted">{{ totalTestCount }} tests, {{ groupedCategories.length }} groupes</p>
        <button
          @click="startCreate"
          class="px-3 py-1.5 text-sm rounded-bc border-2 border-bc-border-strong shadow-bc-hard-sm bg-bc-orange text-bc-ink cursor-pointer transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          + Nouveau test
        </button>
      </div>

      <p v-if="loading" class="text-sm text-bc-text-muted">Chargement…</p>
      <p v-else-if="loadError" class="text-sm text-bc-danger">{{ loadError }}</p>

      <div v-else class="max-h-[65vh] overflow-y-auto space-y-4 pr-1">
        <div v-for="group in groupedCategories" :key="group.id">
          <h3 class="font-display text-xs font-medium uppercase tracking-wide text-bc-text-muted mb-1.5">{{ group.label }}</h3>
          <div class="space-y-2">
            <div v-for="category in group.categories" :key="category.id" class="rounded-bc border border-bc-border bg-bc-surface-alt">
              <div class="px-3 py-1.5 text-xs font-medium text-bc-text-secondary border-b border-bc-border">
                {{ categoryLabels[category.id] ?? category.id }}
                <span class="text-bc-text-muted">({{ category.tests.length }})</span>
              </div>
              <details v-for="test in category.tests" :key="test.id" class="group border-t border-bc-border first:border-t-0">
                <summary class="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer select-none">
                  <span class="flex items-center gap-2 min-w-0" :title="test.id">
                    <component :is="categoryIcons[category.id] ?? defaultCategoryIcon" class="w-4 h-4 text-bc-text-muted shrink-0" />
                    <span class="text-bc-text-primary truncate">{{ test.label }}</span>
                    <ChevronDownIcon class="w-4 h-4 text-bc-text-muted shrink-0 transition-transform group-open:rotate-180" />
                  </span>
                  <span class="flex items-center gap-2 shrink-0">
                    <button @click.stop.prevent="startEdit(category.id, test)" class="text-xs text-bc-text-muted hover:text-bc-text-primary cursor-pointer">
                      Modifier
                    </button>
                    <button @click.stop.prevent="remove(test.id)" :disabled="deletingId === test.id" class="text-xs text-bc-danger/80 hover:text-bc-danger disabled:opacity-40 cursor-pointer">
                      {{ deletingId === test.id ? '…' : 'Supprimer' }}
                    </button>
                  </span>
                </summary>
                <div class="px-3 pb-3 text-xs text-bc-text-muted space-y-1.5">
                  <p><span class="text-bc-text-secondary">Prompt :</span> <span class="whitespace-pre-wrap">{{ test.prompt }}</span></p>
                  <p v-if="test.checks?.rules?.length"><span class="text-bc-text-secondary">Mots-clés :</span> {{ test.checks.rules.join(', ') }}</p>
                  <p v-if="test.checks?.judge_criteria"><span class="text-bc-text-secondary">Critères juge :</span> {{ test.checks.judge_criteria }}</p>
                  <p v-if="test.expected_tool"><span class="text-bc-text-secondary">Outil attendu :</span> {{ test.expected_tool }}</p>
                  <p v-if="test.expected_answer"><span class="text-bc-text-secondary">Réponse attendue :</span> {{ test.expected_answer }}</p>
                  <p v-if="test.images?.length"><span class="text-bc-text-secondary">Images :</span> {{ test.images.join(', ') }}</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      <p v-if="deleteError" class="mt-3 text-sm text-bc-danger">{{ deleteError }}</p>
    </div>

    <!-- ───────────────────────── Formulaire ───────────────────────── -->
    <div v-else>
      <button @click="view = 'list'" class="text-xs text-bc-text-muted hover:text-bc-text-primary mb-3 cursor-pointer">← Retour à la liste</button>

      <div class="grid grid-cols-2 gap-3 mb-3">
        <label class="text-xs text-bc-text-secondary">
          Catégorie (groupe de capacité)
          <select v-model="form.group" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary">
            <option v-for="id in capabilityOrder" :key="id" :value="id">{{ capabilityGroupLabels[id] }}</option>
          </select>
        </label>
        <label class="text-xs text-bc-text-secondary">
          Sous-catégorie
          <select v-model="form.category" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary">
            <option v-for="id in categoriesForGroup" :key="id" :value="id">{{ categoryLabels[id] ?? id }}</option>
          </select>
        </label>
      </div>

      <label class="block text-xs text-bc-text-secondary mb-3">
        Identifiant (unique, sans espace)
        <input v-model="form.id" type="text" placeholder="ex: code_sort_list" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>

      <label class="block text-xs text-bc-text-secondary mb-3">
        Libellé
        <input v-model="form.label" type="text" placeholder="ex: Tri d'une liste" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary" />
      </label>

      <label class="block text-xs text-bc-text-secondary mb-3">
        Prompt
        <textarea v-model="form.prompt" rows="5" placeholder="Instruction envoyée au modèle testé…" class="mt-1 w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted resize-y"></textarea>
      </label>

      <label class="block text-xs text-bc-text-secondary mb-3">
        Mots-clés attendus (séparés par des virgules, scoring par règles)
        <input v-model="form.rules" type="text" placeholder="def, return, ->" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary" />
      </label>

      <label class="block text-xs text-bc-text-secondary mb-3">
        Critères d'évaluation pour le juge LLM
        <textarea v-model="form.judgeCriteria" rows="3" placeholder="Sur quoi le juge doit-il évaluer la réponse ?" class="mt-1 w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted resize-y"></textarea>
      </label>

      <label class="block text-xs text-bc-text-secondary mb-3">
        Réponse type attendue (optionnel)
        <textarea v-model="form.expectedAnswer" rows="2" placeholder="Le juge compare la réponse du modèle à ceci, en plus des critères ci-dessus" class="mt-1 w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted resize-y"></textarea>
      </label>

      <template v-if="form.category === 'tool_calling'">
        <label class="block text-xs text-bc-text-secondary mb-3">
          Nom de l'outil attendu
          <input v-model="form.expectedTool" type="text" placeholder="get_weather" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
        </label>
        <label class="block text-xs text-bc-text-secondary mb-3">
          Schéma JSON des outils (tableau, format Ollama)
          <textarea v-model="form.toolsJson" rows="6" placeholder='[{"type":"function","function":{...}}]' class="mt-1 w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted font-mono resize-y"></textarea>
        </label>
      </template>

      <label v-if="form.category === 'vision'" class="block text-xs text-bc-text-secondary mb-3">
        Images (noms de fichiers, séparés par des virgules)
        <input v-model="form.images" type="text" placeholder="portrait_1.jpg, paysage_1.jpg" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
        <span class="block mt-1 text-bc-text-muted normal-case">Les fichiers doivent déjà être placés dans <code>benchmark_tool/assets/vision/</code></span>
      </label>

      <p v-if="formError" class="text-sm text-bc-danger mb-3">{{ formError }}</p>

      <button
        @click="submit"
        :disabled="saving"
        class="w-full px-3 py-2 text-sm rounded-bc border-2 cursor-pointer transition-transform duration-75"
        :class="saving
          ? 'bg-bc-surface-alt text-bc-text-muted border-bc-border cursor-not-allowed'
          : 'bg-bc-orange text-bc-ink border-bc-border-strong shadow-bc-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'"
      >
        {{ saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Créer le test' }}
      </button>
    </div>
  </Modal>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ChevronDownIcon } from '@heroicons/vue/24/outline'
import Modal from './Modal.vue'

const emit = defineEmits(['close', 'changed'])

const { categoryLabels, categoryCapability, capabilityGroupLabels, capabilityOrder, knownCategories, categoryIcons, defaultCategoryIcon } = useTestCategories()

const view = ref('list')
const bank = ref({}) // { [category]: TestBankEntry[] }
const loading = ref(true)
const loadError = ref('')
const deletingId = ref(null)
const deleteError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    bank.value = await $fetch('/api/benchmark/tests')
  } catch (e) {
    loadError.value = e.data?.statusMessage ?? 'Erreur lors du chargement des tests'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const totalTestCount = computed(() => Object.values(bank.value).reduce((sum, tests) => sum + tests.length, 0))

const groupedCategories = computed(() => {
  const byGroup = {}
  for (const categoryId of knownCategories) {
    const tests = bank.value[categoryId]
    if (!tests?.length) continue
    const groupId = categoryCapability[categoryId] ?? 'other'
    ;(byGroup[groupId] ??= []).push({ id: categoryId, tests })
  }
  return [...capabilityOrder, 'other']
    .filter((id) => byGroup[id]?.length)
    .map((id) => ({ id, label: id === 'other' ? 'Autres' : capabilityGroupLabels[id], categories: byGroup[id] }))
})

const categoriesForGroup = computed(() => knownCategories.filter((id) => (categoryCapability[id] ?? 'other') === form.group))

const emptyForm = () => ({
  group: 'completion',
  category: 'chat',
  id: '',
  label: '',
  prompt: '',
  rules: '',
  judgeCriteria: '',
  expectedAnswer: '',
  expectedTool: '',
  toolsJson: '',
  images: '',
})

const form = reactive(emptyForm())
const editingId = ref(null)

// Quand le groupe de capacité change, la sous-catégorie sélectionnée peut ne
// plus appartenir à ce groupe — on retombe alors sur la première disponible.
watch(
  () => form.group,
  () => {
    if (!categoriesForGroup.value.includes(form.category)) {
      form.category = categoriesForGroup.value[0] ?? ''
    }
  }
)
const formError = ref('')
const saving = ref(false)

function startCreate() {
  Object.assign(form, emptyForm())
  editingId.value = null
  formError.value = ''
  view.value = 'form'
}

function startEdit(categoryId, test) {
  editingId.value = test.id
  Object.assign(form, {
    group: categoryCapability[categoryId] ?? 'completion',
    category: categoryId,
    id: test.id,
    label: test.label,
    prompt: test.prompt,
    rules: (test.checks?.rules ?? []).join(', '),
    judgeCriteria: test.checks?.judge_criteria ?? '',
    expectedAnswer: test.expected_answer ?? '',
    expectedTool: test.expected_tool ?? '',
    toolsJson: test.tools ? JSON.stringify(test.tools, null, 2) : '',
    images: (test.images ?? []).join(', '),
  })
  formError.value = ''
  view.value = 'form'
}

async function submit() {
  formError.value = ''
  if (!form.id.trim() || !form.label.trim() || !form.prompt.trim()) {
    formError.value = 'Identifiant, libellé et prompt sont requis.'
    return
  }
  if (!/^[a-z0-9_]+$/.test(form.id.trim())) {
    formError.value = "L'identifiant ne doit contenir que des lettres minuscules, chiffres et underscores."
    return
  }

  let tools
  if (form.category === 'tool_calling' && form.toolsJson.trim()) {
    try {
      tools = JSON.parse(form.toolsJson)
    } catch {
      formError.value = 'Le schéma JSON des outils est invalide.'
      return
    }
  }

  const test = {
    id: form.id.trim(),
    label: form.label.trim(),
    prompt: form.prompt,
    checks: {
      rules: form.rules.split(',').map((r) => r.trim()).filter(Boolean),
      judge_criteria: form.judgeCriteria.trim(),
    },
    ...(tools ? { tools } : {}),
    ...(form.expectedTool.trim() ? { expected_tool: form.expectedTool.trim() } : {}),
    ...(form.expectedAnswer.trim() ? { expected_answer: form.expectedAnswer.trim() } : {}),
    ...(form.category === 'vision' && form.images.trim()
      ? { images: form.images.split(',').map((f) => f.trim()).filter(Boolean) }
      : {}),
  }

  saving.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/benchmark/tests/${editingId.value}`, { method: 'PUT', body: { category: form.category, test } })
    } else {
      await $fetch('/api/benchmark/tests', { method: 'POST', body: { category: form.category, test } })
    }
    await load()
    emit('changed')
    view.value = 'list'
  } catch (e) {
    formError.value = e.data?.statusMessage ?? "Erreur lors de l'enregistrement"
  } finally {
    saving.value = false
  }
}

async function remove(id) {
  if (!confirm(`Supprimer le test "${id}" ?`)) return
  deletingId.value = id
  deleteError.value = ''
  try {
    await $fetch(`/api/benchmark/tests/${id}`, { method: 'DELETE' })
    await load()
    emit('changed')
  } catch (e) {
    deleteError.value = e.data?.statusMessage ?? 'Erreur lors de la suppression'
  } finally {
    deletingId.value = null
  }
}
</script>
