<template>
  <Modal @close="emit('close')">
    <template #header>Importer un modèle</template>

    
    <div class="space-y-2 mb-3">
      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="mode === 'url'"
          @change="setMode('url')"
          class="accent-blue-600"
        />
        Depuis une URL
      </label>
      <input
        v-model="url"
        type="text"
        :disabled="mode !== 'url'"
        placeholder="https://huggingface.co/.../fichier.gguf"
        class="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-white/30 disabled:opacity-40"
      />
    </div>

    <div class="space-y-2 mb-4">
      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="mode === 'file'"
          @change="setMode('file')"
          class="accent-blue-600"
        />
        Fichier local
      </label>
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="fileInput?.click()"
          :disabled="mode !== 'file'"
          class="shrink-0 px-3 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200"
        >
          Parcourir…
        </button>
        <span class="text-xs text-gray-400 truncate">
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
      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="mode === 'existing'"
          @change="setMode('existing')"
          class="accent-blue-600"
        />
        Fichier déjà présent dans ~/.ollama/gguf
      </label>
      <select
        v-model="selectedExisting"
        :disabled="mode !== 'existing'"
        class="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-gray-200 focus:outline-none focus:border-white/30 disabled:opacity-40"
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
      <label>Nom du modèle</label>
      <input
        v-model="modelName"
        type="text"
        placeholder="Nom du modèle (ex: mon-modele-custom)"
        class="w-full mb-4 px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-white/30"
      />
    </div>
 


    <p v-if="validationError" class="text-sm text-red-400 mb-3">{{ validationError }}</p>
    <p v-if="importError" class="text-sm text-red-400 mb-3">{{ importError }}</p>

    <button
      @click="submit"
      :disabled="importing"
      class="w-full px-3 py-2 text-sm rounded bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"
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
