<template>
  <Modal @close="emit('close')">
    <template #header>Créer un modèle</template>

    <button
      @click="createModelfile = true"
      class="mb-4 px-3 py-1.5 text-sm rounded-bc cursor-pointer bg-bc-surface text-bc-orange-light border-2 border-bc-orange shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
    >
      + Créer un modelfile
    </button>
    <CreateModelfileModal
      v-if="createModelfile"
      @close="createModelfile = false"
      @create-success="onModelfileCreated"
    />

    <div class="space-y-2 mb-4">
      <label class="block text-sm text-bc-text-secondary">Choisir un modelfile</label>
      <select
        v-model="selectedModelfile"
        class="w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-secondary focus:outline-none focus:border-bc-orange"
      >
        <option value="" disabled>
          {{ modelfiles.length ? 'Sélectionner un modelfile…' : 'Aucun modelfile trouvé' }}
        </option>
        <option v-for="f in modelfiles" :key="f.filename" :value="f.filename">
          {{ f.filename }}
        </option>
      </select>
    </div>

    <div class="space-y-2 mb-4">
      <label class="block text-sm text-bc-text-secondary">Choisir un modèle de base</label>
      <select
        v-model="selectedBaseModel"
        class="w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-secondary focus:outline-none focus:border-bc-orange"
      >
        <option value="" disabled>
          {{ modelList?.length ? 'Sélectionner un modèle…' : 'Aucun modèle installé' }}
        </option>
        <option v-for="m in modelList" :key="m.name" :value="m.name">
          {{ m.name }}
        </option>
      </select>
    </div>

    <label class="block text-sm text-bc-text-secondary mb-4">
      Nom du modèle
      <input
        v-model="modelName"
        type="text"
        placeholder="Nom du modèle (ex: mon-modele-custom)"
        class="mt-1 w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
    </label>

    <p v-if="validationError" class="text-sm text-bc-danger mb-3">{{ validationError }}</p>
    <p v-if="createError" class="text-sm text-bc-danger mb-3">{{ createError }}</p>

    <button
      @click="submit"
      :disabled="creating"
      class="w-full px-3 py-2 text-sm rounded-bc font-display font-semibold bg-bc-orange text-bc-ink border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:border-bc-border disabled:shadow-none disabled:cursor-not-allowed"
    >
      {{ creating ? statusLabel : 'Créer' }}
    </button>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'
import CreateModelfileModal from './CreateModelfileModal.vue'

const emit = defineEmits(['close', 'create-success'])

const { modelList } = useModels()

const createModelfile = ref(false)
const modelfiles = ref([])
const selectedModelfile = ref('')
const selectedBaseModel = ref('')
const modelName = ref('')
const creating = ref(false)
const statusLabel = ref('Création…')
const validationError = ref('')
const createError = ref('')

async function loadModelfiles() {
  try {
    const res = await $fetch('/api/modelfiles')
    modelfiles.value = res.files ?? []
  } catch {
    modelfiles.value = []
  }
}

onMounted(loadModelfiles)

async function onModelfileCreated(filename) {
  await loadModelfiles()
  selectedModelfile.value = filename
}

function validate() {
  if (!selectedModelfile.value) return 'Choisis un modelfile.'
  if (!selectedBaseModel.value) return 'Choisis un modèle de base.'
  if (!modelName.value.trim()) return 'Indique un nom pour le modèle.'
  return ''
}

async function submit() {
  validationError.value = validate()
  if (validationError.value) return

  creating.value = true
  createError.value = ''
  statusLabel.value = 'Création…'

  try {
    const response = await fetch('/api/modelfiles/create-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: modelName.value.trim(),
        fromModel: selectedBaseModel.value,
        modelfileFilename: selectedModelfile.value,
      }),
    })

    if (!response.ok || !response.body) throw new Error('Échec de la création')

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
        const data = JSON.parse(line)
        if (data.status) statusLabel.value = data.status
        if (data.error) throw new Error(data.error)
      }
    }

    emit('create-success', modelName.value.trim())
    emit('close')
  } catch (e) {
    createError.value = e.message ?? 'Erreur lors de la création'
  } finally {
    creating.value = false
  }
}
</script>
