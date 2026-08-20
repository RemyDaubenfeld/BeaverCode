<template>
  <Modal @close="emit('close')">
    <template #header>Bibliothèque Ollama</template>

    <div class="flex gap-2 mb-1">
      <input
        v-model="query"
        @input="onInput"
        type="text"
        placeholder="Rechercher un modèle (ex: llama3, qwen2.5-coder)…"
        class="flex-1 px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-white/30"
      />
      <button
        @click="scrapeLibrary"
        :disabled="scraping"
        title="Vérifier les nouveaux modèles sur ollama.com/library"
        class="shrink-0 px-3 py-2 text-xs rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200"
      >
        {{ scraping ? '…' : 'Actualiser la liste' }}
      </button>
    </div>
    <p v-if="scrapeMessage" class="text-xs mb-2" :class="scrapeError ? 'text-red-400' : 'text-gray-400'">
      {{ scrapeMessage }}
    </p>

    <p v-if="loading" class="text-sm text-gray-400">Recherche…</p>
    <p v-else-if="error" class="text-sm text-red-400">Erreur de recherche. Réessayez.</p>
    <p v-else-if="results.length === 0" class="text-sm text-gray-400">Aucun résultat.</p>

    <ul v-else class="space-y-2">
      <li
        v-for="m in results"
        :key="m.model_identifier"
        class="flex items-start justify-between gap-3 rounded border border-white/5 hover:bg-white/5 p-2"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-gray-200">{{ m.model_name }}</span>
            <span
              v-if="isLikelyTooLarge(m)"
              title="Peut dépasser la VRAM disponible (4 Go)"
              class="text-amber-400"
            >
              <ExclamationTriangleIcon class="w-4 h-4" />
            </span>
          </div>
          <p class="text-xs text-gray-500 truncate">{{ m.description }}</p>
          <div v-if="m.labels?.length" class="flex flex-wrap gap-1 mt-1">
            <button
              v-for="label in m.labels"
              :key="label"
              type="button"
              @click="selectedSize[m.model_identifier] = label"
              :disabled="pullingId !== null"
              class="text-[10px] px-1.5 py-0.5 rounded border disabled:cursor-not-allowed"
              :class="selectedSize[m.model_identifier] === label
                ? 'bg-blue-600/80 border-blue-500 text-white'
                : 'bg-white/10 border-transparent text-gray-300 hover:bg-white/20'"
            >
              {{ label }}
            </button>
          </div>
        </div>

        <button
          @click="pull(m)"
          :disabled="pullingId !== null"
          class="shrink-0 px-3 py-1 text-xs rounded bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"
        >
          <span v-if="pullingId === m.model_identifier">{{ progress }}%</span>
          <span v-else-if="pullingId !== null">…</span>
          <span v-else>Télécharger</span>
        </button>
      </li>
    </ul>

    <p v-if="pullError" class="text-sm text-red-400 mt-3">{{ pullError }}</p>
  </Modal>
</template>

<script setup>
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import Modal from './Modal.vue'

const emit = defineEmits(['close', 'pull-success'])

const query = ref('')
const results = ref([])
const loading = ref(false)
const error = ref(false)
const pullingId = ref(null)
const progress = ref(0)
const pullError = ref('')
const selectedSize = reactive({})
const scraping = ref(false)
const scrapeMessage = ref('')
const scrapeError = ref(false)
let debounceTimer = null

async function search() {
  loading.value = true
  error.value = false
  try {
    const res = await $fetch('/api/library/search', { query: { q: query.value } })
    results.value = res.models ?? []
    for (const m of results.value) {
      if (!selectedSize[m.model_identifier]) {
        selectedSize[m.model_identifier] = smallestLabel(m.labels)
      }
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

// Choisit le plus petit paramétrage par défaut (le plus susceptible de tenir en 4 Go de VRAM)
function smallestLabel(labels) {
  if (!labels?.length) return null
  return [...labels].sort((a, b) => parseSizeB(a) - parseSizeB(b))[0]
}

function parseSizeB(label) {
  const match = /^(\d+(\.\d+)?)B$/i.exec(label.trim())
  return match ? parseFloat(match[1]) : Infinity
}

function onInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(search, 300)
}

onMounted(search)

async function scrapeLibrary() {
  scraping.value = true
  scrapeMessage.value = ''
  scrapeError.value = false
  try {
    const res = await $fetch('/api/library/scrape', { method: 'POST' })
    scrapeMessage.value = res.added > 0
      ? `${res.added} nouveau${res.added > 1 ? 'x' : ''} modèle${res.added > 1 ? 's' : ''} ajouté${res.added > 1 ? 's' : ''}.`
      : 'Aucun nouveau modèle.'
    await search()
  } catch {
    scrapeError.value = true
    scrapeMessage.value = 'Erreur lors de la mise à jour depuis ollama.com.'
  } finally {
    scraping.value = false
  }
}

async function pull(m) {
  const size = selectedSize[m.model_identifier]
  const tag = size ? `${m.model_identifier}:${size.toLowerCase()}` : m.model_identifier

  pullingId.value = m.model_identifier
  progress.value = 0
  pullError.value = ''
  try {
    const response = await fetch(`/api/library/pull?model=${encodeURIComponent(tag)}`, {
      method: 'POST',
    })
    if (!response.ok || !response.body) throw new Error('Échec du téléchargement')

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
        if (data.total && data.completed) {
          progress.value = Math.round((data.completed / data.total) * 100)
        }
        if (data.error) throw new Error(data.error)
      }
    }
    emit('pull-success', tag)
  } catch (e) {
    pullError.value = e.message ?? 'Erreur lors du téléchargement'
  } finally {
    pullingId.value = null
    progress.value = 0
  }
}

// Heuristique VRAM (RTX 3050, 4 Go) : au-delà de ~8B paramètres pour la taille
// actuellement sélectionnée, le modèle dépasse généralement 4 Go et nécessite un offload CPU.
function isLikelyTooLarge(m) {
  const size = selectedSize[m.model_identifier]
  if (size) return parseSizeB(size) > 8
  return (m.labels ?? []).some((l) => parseSizeB(l) > 8)
}
</script>
