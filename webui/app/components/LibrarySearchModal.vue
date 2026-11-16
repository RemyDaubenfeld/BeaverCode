<template>
  <Modal @close="emit('close')">
    <template #header>Bibliothèque Ollama</template>

    <div class="flex gap-2 mb-1">
      <input
        v-model="query"
        @input="onInput"
        type="text"
        placeholder="Rechercher un modèle (ex: llama3, qwen2.5-coder)…"
        class="flex-1 px-3 py-2 rounded bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
      <button
        @click="scrapeLibrary"
        :disabled="scraping"
        title="Vérifier les nouveaux modèles sur ollama.com/library"
        class="shrink-0 px-3 py-2 text-xs rounded border-2 border-bc-border-strong bg-bc-surface text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed"
      >
        {{ scraping ? '…' : 'Actualiser la liste' }}
      </button>
    </div>
    <p v-if="scrapeMessage" class="text-xs mb-2" :class="scrapeError ? 'text-bc-danger' : 'text-bc-text-muted'">
      {{ scrapeMessage }}
    </p>

    <p v-if="loading" class="text-sm text-bc-text-muted">Recherche…</p>
    <p v-else-if="error" class="text-sm text-bc-danger">Erreur de recherche. Réessayez.</p>
    <p v-else-if="results.length === 0" class="text-sm text-bc-text-muted">Aucun résultat.</p>

    <ul v-else class="space-y-2">
      <li
        v-for="m in results"
        :key="m.model_identifier"
        class="flex items-start justify-between gap-3 rounded-bc border border-bc-border hover:bg-bc-surface-alt p-2"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-mono font-medium text-bc-text-primary">{{ m.model_name }}</span>
            <VramFitBadge
              v-if="libraryEstimate(m)"
              class="text-xs"
              :estimate="libraryEstimate(m)"
              :details="libraryEstimateDetails(m)"
            />
          </div>
          <p class="text-xs text-bc-text-muted truncate">{{ m.description }}</p>
          <div v-if="m.labels?.length" class="flex flex-wrap gap-1 mt-1">
            <button
              v-for="label in m.labels"
              :key="label"
              type="button"
              @click="selectedSize[m.model_identifier] = label"
              :disabled="isPulling(m)"
              class="font-mono text-[10px] px-1.5 py-0.5 rounded border disabled:cursor-not-allowed"
              :class="selectedSize[m.model_identifier] === label
                ? 'bg-bc-orange border-bc-orange-dark text-bc-ink'
                : 'bg-bc-surface-alt border-transparent text-bc-text-secondary hover:bg-bc-surface'"
            >
              {{ label }}
            </button>
          </div>
        </div>

        <div class="shrink-0 flex items-center gap-2">
          <button
            v-if="isPulling(m)"
            @click="cancelPull(tagFor(m))"
            title="Annuler le téléchargement"
            class="px-2 py-1 text-xs rounded border-2 border-bc-border-strong bg-bc-surface text-bc-danger shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Annuler
          </button>
          <button
            @click="pull(m)"
            :disabled="isPulling(m)"
            class="px-3 py-1 text-xs rounded border-2 border-bc-border-strong bg-bc-orange text-bc-ink shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-orange-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed"
          >
            <span v-if="isPulling(m) && pulls[tagFor(m)].queued">En attente</span>
            <span v-else-if="isPulling(m)" class="font-mono">{{ pulls[tagFor(m)].progress }}%</span>
            <span v-else>Télécharger</span>
          </button>
        </div>
      </li>
    </ul>

    <p v-if="pullError" class="text-sm text-bc-danger mt-3">{{ pullError }}</p>
    <p v-if="Object.keys(pulls).length" class="text-xs text-bc-text-muted mt-3">
      Vous pouvez fermer cette fenêtre : la progression reste visible sur la page Modèles.
    </p>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const emit = defineEmits(['close', 'pull-success'])

const query = ref('')
const results = ref([])
const loading = ref(false)
const error = ref(false)
const { pulls, startPull, cancelPull } = usePulls()
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

function tagFor(m) {
  const size = selectedSize[m.model_identifier]
  return size ? `${m.model_identifier}:${size.toLowerCase()}` : m.model_identifier
}

// en cours ou en file d'attente (une ligne en erreur n'empêche pas de relancer)
function isPulling(m) {
  const p = pulls.value[tagFor(m)]
  return !!p && !p.error
}

// Le téléchargement est géré par usePulls() : il continue même si la modale est fermée
async function pull(m) {
  const tag = tagFor(m)
  pullError.value = ''
  const ok = await startPull(tag)
  if (ok) {
    emit('pull-success', tag)
  } else if (pulls.value[tag]?.error) {
    pullError.value = pulls.value[tag].error
  }
}

// Estimation mémoire avant téléchargement : on ne connaît que le nombre de paramètres (label "7B"),
// pas le fichier ni l'architecture. Approximation pour la quantification par défaut d'Ollama (Q4_K_M,
// ~4.85 bits/paramètre ≈ 0.6 octet), plus un KV cache forfaitaire pour 4k de contexte (mesuré entre
// 0.1 et 0.6 Go selon les modèles) et la même marge de 5 % que côté serveur.
// Moins précis que l'estimation des modèles installés (calculée depuis /api/show).
const BYTES_PER_PARAM_Q4 = 0.6
const KV_CACHE_GUESS_BYTES = 0.4 * 1024 ** 3
const OVERHEAD_RATIO = 0.05

function libraryEstimate(m) {
  const size = selectedSize[m.model_identifier]
  const paramsB = size ? parseSizeB(size) : Infinity
  if (!Number.isFinite(paramsB)) return null // labels non numériques (ex. "e4b", "8x7b") : pas d'estimation
  const weightsBytes = paramsB * 1e9 * BYTES_PER_PARAM_Q4
  // sans le fichier, impossible de savoir si c'est un MoE : traité comme un modèle dense
  return {
    total_bytes: (weightsBytes + KV_CACHE_GUESS_BYTES) * (1 + OVERHEAD_RATIO),
    weights_bytes: weightsBytes,
  }
}

function libraryEstimateDetails(m) {
  const paramsB = parseSizeB(selectedSize[m.model_identifier])
  const go = (b) => `${(b / 1024 ** 3).toFixed(1)} Go`
  return [
    'Estimation approximative (avant téléchargement)',
    `Poids (${paramsB}B en Q4_K_M) : ${go(paramsB * 1e9 * BYTES_PER_PARAM_Q4)}`,
    `KV cache (~4k tokens) : ${go(KV_CACHE_GUESS_BYTES)}`,
    'Marge buffers : +5 %',
  ]
}
</script>
