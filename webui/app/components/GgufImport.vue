<template>
  <div class="space-y-3">
    <p class="text-xs text-bc-text-secondary">
      Pour un GGUF qui n'est pas sur HuggingFace (ou un fichier découpé, qu'Ollama ne sait pas télécharger) : le fichier est enregistré dans
      <span class="font-mono">~/.ollama/gguf</span> puis transformé en modèle Ollama.
    </p>

    <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer">
      <input v-model="mode" type="radio" value="file" class="accent-bc-orange" />
      Fichier de mon ordinateur
    </label>
    <div v-if="mode === 'file'" class="flex items-center gap-2 pl-6">
      <button
        type="button"
        @click="fileInput?.click()"
        class="shrink-0 px-3 py-1 text-xs rounded-md border-2 border-bc-border-strong bg-bc-surface text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        Parcourir…
      </button>
      <span class="text-xs text-bc-text-secondary truncate">{{ selectedFile?.name ?? 'Aucun fichier sélectionné' }}</span>
      <input ref="fileInput" type="file" accept=".gguf" class="hidden" @change="onFileSelected" />
    </div>

    <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer">
      <input v-model="mode" type="radio" value="existing" class="accent-bc-orange" />
      Fichier déjà présent dans <span class="font-mono">~/.ollama/gguf</span>
    </label>
    <select
      v-if="mode === 'existing'"
      v-model="selectedExisting"
      class="ml-6 w-[calc(100%-1.5rem)] px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border text-xs text-bc-text-primary focus:outline-none focus:border-bc-orange"
    >
      <option value="" disabled>{{ existingFiles.length ? 'Sélectionner un fichier…' : 'Aucun fichier .gguf trouvé' }}</option>
      <option v-for="f in existingFiles" :key="f.filename" :value="f.filename">
        {{ f.filename }} ({{ formatSize(f.size) }})
      </option>
    </select>

    <!-- contenu de ~/.ollama/gguf : signale les doublons de ce qu'Ollama stocke déjà, pour libérer la place -->
    <ul v-if="existingFiles.length" class="space-y-1">
      <li
        v-for="f in existingFiles"
        :key="f.filename"
        class="flex items-center gap-2 rounded-bc border border-bc-border px-2 py-1 text-xs"
      >
        <span class="flex-1 min-w-0 truncate font-mono text-bc-text-primary" :title="f.filename">{{ f.filename }}</span>
        <span class="shrink-0 font-mono text-bc-text-secondary">{{ formatSize(f.size) }}</span>
        <span
          v-if="f.imported_by.length"
          class="shrink-0 font-mono text-[10px] px-1 rounded-md border border-bc-green text-bc-green"
          :title="`Déjà importé : utilisé par ${f.imported_by.join(', ')}. Ollama en garde sa propre copie, ce fichier peut être supprimé sans casser ces modèles.`"
        >
          déjà importé ({{ f.imported_by.length }})
        </span>
        <!-- suppression en deux clics (le navigateur n'affiche pas de confirm() dans toutes les configurations) -->
        <button
          @click="confirmDelete === f.filename ? deleteFile(f) : (confirmDelete = f.filename)"
          @blur="confirmDelete = null"
          :disabled="deleting === f.filename"
          :title="f.imported_by.length ? 'Supprimer ce doublon pour libérer la place' : 'Attention : aucun modèle n\'utilise ce fichier, il faudra le retélécharger pour l\'importer'"
          class="shrink-0 px-1.5 py-0.5 rounded-md border text-[10px] disabled:opacity-40"
          :class="confirmDelete === f.filename ? 'border-bc-danger bg-bc-danger text-bc-paper' : 'border-bc-border text-bc-text-secondary hover:border-bc-danger hover:text-bc-danger'"
        >
          {{ deleting === f.filename ? '…' : confirmDelete === f.filename ? 'Confirmer' : 'Supprimer' }}
        </button>
      </li>
    </ul>

    <div class="flex items-center gap-2">
      <input
        v-model="modelName"
        type="text"
        placeholder="Nom du modèle (ex: mon-modele:q4_k_m)"
        class="flex-1 min-w-0 px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-xs text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
      <button
        @click="submit"
        :disabled="importing"
        class="shrink-0 px-3 py-1 text-xs rounded-md border-2 border-bc-border-strong bg-bc-orange text-bc-ink shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-orange-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed"
      >
        {{ importing ? `Import… ${progress}%` : 'Importer' }}
      </button>
    </div>

    <p v-if="error" class="text-sm text-bc-danger">{{ error }}</p>
    <p v-if="success" class="text-sm text-bc-green">{{ success }}</p>
  </div>
</template>

<script setup>
const emit = defineEmits(['imported'])

const mode = ref('file') // 'file' | 'existing'
const selectedFile = ref(null)
const fileInput = ref(null)
const existingFiles = ref([])
const selectedExisting = ref('')
const modelName = ref('')
const importing = ref(false)
const progress = ref(0)
const error = ref('')
const success = ref('')

async function loadExisting() {
  try {
    const res = await $fetch('/api/import/existing')
    existingFiles.value = res.files ?? []
  } catch {
    existingFiles.value = []
  }
}
onMounted(loadExisting)

const confirmDelete = ref(null) // nom du fichier en attente de confirmation
const deleting = ref(null)

async function deleteFile(f) {
  deleting.value = f.filename
  error.value = ''
  success.value = ''
  try {
    await $fetch('/api/import/existing', { method: 'DELETE', body: { filename: f.filename } })
    if (selectedExisting.value === f.filename) selectedExisting.value = ''
    success.value = `${f.filename} supprimé (${formatSize(f.size)} libérés).`
    await loadExisting()
  } catch (e) {
    error.value = e?.data?.statusMessage ?? 'Échec de la suppression.'
  } finally {
    deleting.value = null
    confirmDelete.value = null
  }
}

function onFileSelected(e) {
  selectedFile.value = e.target.files[0] ?? null
}

function formatSize(bytes) {
  const go = bytes / 1024 ** 3
  return go >= 0.1 ? `${go.toFixed(1)} Go` : `${(bytes / 1024 ** 2).toFixed(0)} Mo`
}

function validate() {
  if (mode.value === 'file') {
    if (!selectedFile.value) return 'Sélectionne un fichier.'
    if (!selectedFile.value.name.toLowerCase().endsWith('.gguf')) return 'Le fichier doit être au format .gguf.'
  } else if (!selectedExisting.value) {
    return 'Sélectionne un fichier dans la liste.'
  }
  if (!modelName.value.trim()) return 'Indique un nom pour le modèle.'
  return ''
}

async function submit() {
  error.value = validate()
  success.value = ''
  if (error.value) return

  const name = modelName.value.trim()
  importing.value = true
  progress.value = 0
  try {
    let response
    if (mode.value === 'file') {
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      formData.append('name', name)
      response = await fetch('/api/import/upload', { method: 'POST', body: formData })
    } else {
      response = await fetch('/api/import/existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filename: selectedExisting.value }),
      })
    }
    if (!response.ok || !response.body) throw new Error("Échec de l'import")

    // progression NDJSON : hash + envoi du blob à Ollama, puis création du modèle
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
    success.value = `Modèle ${name} importé.`
    modelName.value = ''
    await loadExisting() // le fichier passe « déjà importé »
    emit('imported', name)
  } catch (e) {
    error.value = e.message ?? "Erreur lors de l'import"
  } finally {
    importing.value = false
  }
}
</script>
