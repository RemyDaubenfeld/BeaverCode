<template>
  <Modal @close="emit('close')">
    <template #header>Importer un modèle</template>

    
    <div class="space-y-2 mb-3">
      <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="mode === 'url'"
          @change="setMode('url')"
          class="accent-bc-orange"
        />
        Depuis une URL
      </label>
      <input
        v-model="url"
        type="text"
        :disabled="mode !== 'url'"
        placeholder="https://huggingface.co/.../fichier.gguf"
        class="w-full px-3 py-2 rounded bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange disabled:opacity-40"
      />
    </div>

    <div class="space-y-2 mb-4">
      <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="mode === 'file'"
          @change="setMode('file')"
          class="accent-bc-orange"
        />
        Fichier local
      </label>
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="fileInput?.click()"
          :disabled="mode !== 'file'"
          class="shrink-0 px-3 py-1.5 text-xs rounded border-2 border-bc-border-strong bg-bc-surface text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed"
        >
          Parcourir…
        </button>
        <span class="text-xs text-bc-text-muted truncate">
          {{ selectedFile?.name ?? 'Aucun fichier sélectionné' }}
        </span>
        <input
          ref="fileInput"
          type="file"
          accept=".gguf"
          class="hidden"
          @change="onFileSelected"
        />
      </div>
    </div>

    <div class="space-y-2 mb-4">
      <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="mode === 'existing'"
          @change="setMode('existing')"
          class="accent-bc-orange"
        />
        Fichier déjà présent dans ~/.ollama/gguf
      </label>
      <select
        v-model="selectedExisting"
        :disabled="mode !== 'existing'"
        class="w-full px-3 py-2 rounded bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary focus:outline-none focus:border-bc-orange disabled:opacity-40"
      >
        <option value="" disabled>
          {{ existingFiles.length ? 'Sélectionner un fichier…' : 'Aucun fichier .gguf trouvé' }}
        </option>
        <option v-for="f in existingFiles" :key="f.filename" :value="f.filename">
          {{ f.filename }} ({{ formatSize(f.size) }})
        </option>
      </select>
    </div>

    <div>
      <label class="text-sm text-bc-text-secondary">Nom du modèle</label>
      <input
        v-model="modelName"
        type="text"
        placeholder="Nom du modèle (ex: mon-modele-custom)"
        class="w-full mb-4 px-3 py-2 rounded bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
    </div>



    <p v-if="validationError" class="text-sm text-bc-danger mb-3">{{ validationError }}</p>
    <p v-if="importError" class="text-sm text-bc-danger mb-3">{{ importError }}</p>

    <button
      @click="submit"
      :disabled="importing"
      class="w-full px-3 py-2 text-sm rounded border-2 border-bc-border-strong bg-bc-orange text-bc-ink shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-orange-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed"
    >
      {{ importing ? `Import… ${progress}%` : 'Importer' }}
    </button>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const emit = defineEmits(['close', 'pull-success'])

const modelName = ref('')
const mode = ref(null) // 'url' | 'file' | 'existing' | null
const url = ref('')
const selectedFile = ref(null)
const fileInput = ref(null)
const existingFiles = ref([])
const selectedExisting = ref('')
const importing = ref(false)
const progress = ref(0)
const validationError = ref('')
const importError = ref('')

onMounted(async () => {
  try {
    const res = await $fetch('/api/import/existing')
    existingFiles.value = res.files ?? []
  } catch {
    existingFiles.value = []
  }
})

// Coche = choix de la source ; cocher l'une décoche l'autre (un seul mode actif à la fois)
function setMode(target) {
  mode.value = mode.value === target ? null : target
}

function onFileSelected(e) {
  selectedFile.value = e.target.files[0] ?? null
}

function formatSize(bytes) {
  const go = bytes / 1024 ** 3
  return go >= 0.1 ? `${go.toFixed(1)} Go` : `${(bytes / 1024 ** 2).toFixed(0)} Mo`
}

function validate() {
  if (!modelName.value.trim()) return 'Indique un nom pour le modèle.'
  if (!mode.value) return 'Coche une source : URL ou fichier local.'

  if (mode.value === 'url') {
    if (!url.value.trim()) return 'Indique une URL.'
    try {
      new URL(url.value)
    } catch {
      return 'URL invalide.'
    }
    if (!url.value.toLowerCase().endsWith('.gguf')) return "L'URL doit pointer vers un fichier .gguf."
  }

  if (mode.value === 'file') {
    if (!selectedFile.value) return 'Sélectionne un fichier.'
    if (!selectedFile.value.name.toLowerCase().endsWith('.gguf')) return 'Le fichier doit être au format .gguf.'
  }

  if (mode.value === 'existing') {
    if (!selectedExisting.value) return 'Sélectionne un fichier dans la liste.'
  }

  return ''
}

async function submit() {
  validationError.value = validate()
  if (validationError.value) return

  importing.value = true
  progress.value = 0
  importError.value = ''

  try {
    let response
    if (mode.value === 'url') {
      const formData = new FormData()
      formData.append('url', url.value)
      formData.append('name', modelName.value)
      response = await fetch('/api/import/url', { method: 'POST', body: formData })
    } else if (mode.value === 'file') {
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      formData.append('name', modelName.value)
      response = await fetch('/api/import/upload', { method: 'POST', body: formData })
    } else {
      response = await fetch('/api/import/existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName.value, filename: selectedExisting.value }),
      })
    }

    if (!response.ok || !response.body) throw new Error("Échec de l'import")

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
        if (data.progress !== undefined) progress.value = data.progress
        if (data.total && data.completed) progress.value = Math.round((data.completed / data.total) * 100)
        if (data.error) throw new Error(data.error)
      }
    }

    emit('pull-success', modelName.value)
    emit('close')
  } catch (e) {
    importError.value = e.message ?? "Erreur lors de l'import"
  } finally {
    importing.value = false
    progress.value = 0
  }
}
</script>
