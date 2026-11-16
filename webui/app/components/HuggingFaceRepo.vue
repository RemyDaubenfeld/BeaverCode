<template>
  <div>
    <p v-if="loading" class="text-sm text-bc-text-muted">Lecture du dépôt HuggingFace…</p>
    <p v-else-if="error" class="text-sm text-bc-danger">{{ error }}</p>

    <template v-else-if="info">
      <div class="mb-3 rounded-bc border border-bc-border p-2">
        <div class="font-mono text-sm text-bc-text-primary break-all">hf.co/{{ info.repo }}</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-bc-text-muted">
          <span v-if="info.architecture">Architecture <span class="font-mono text-bc-text-secondary">{{ info.architecture }}</span></span>
          <span v-if="info.total_params">Paramètres <span class="font-mono text-bc-text-secondary">{{ formatParams(info.total_params) }}</span></span>
          <span v-if="isMoe">MoE <span class="font-mono text-bc-text-secondary">{{ formatParams(info.active_params) }} actifs</span></span>
          <span v-if="info.context_length">Contexte <span class="font-mono text-bc-text-secondary">{{ formatCtx(info.context_length) }}</span></span>
          <span v-if="info.downloads != null">{{ info.downloads.toLocaleString('fr-FR') }} téléchargements</span>
        </div>
        <p v-if="info.gated" class="mt-2 text-xs text-bc-warning">
          Dépôt à accès restreint (licence à accepter sur HuggingFace) : Ollama ne pourra pas le télécharger sans compte configuré.
        </p>
      </div>

      <p v-if="!info.files.length" class="text-sm text-bc-text-muted">
        Aucun fichier GGUF dans ce dépôt (Ollama ne télécharge depuis HuggingFace que des modèles au format GGUF ; cherche un dépôt dont le nom finit souvent par « -GGUF »).
      </p>

      <ul v-else class="space-y-1">
        <li
          v-for="f in info.files"
          :key="f.quant"
          class="flex items-center gap-3 rounded-bc border border-bc-border hover:bg-bc-surface-alt px-2 py-1.5"
        >
          <span class="w-28 shrink-0 font-mono text-xs text-bc-text-primary" :title="f.filename">{{ f.quant }}</span>
          <span class="w-16 shrink-0 font-mono text-xs text-bc-text-secondary">{{ formatGo(f.size) }}</span>
          <VramFitBadge
            class="text-xs flex-1 min-w-0"
            :estimate="estimate(f)"
            :details="details(f)"
            :show-size="false"
          />

          <span v-if="f.split" class="shrink-0 text-xs text-bc-text-muted" title="Ollama ne sait pas encore télécharger un GGUF découpé en plusieurs fichiers depuis HuggingFace">
            découpé, non supporté
          </span>
          <template v-else>
            <button
              v-if="isPulling(f)"
              @click="cancelPull(tagFor(f))"
              title="Annuler le téléchargement"
              class="shrink-0 px-2 py-0.5 text-xs rounded border-2 border-bc-border-strong bg-bc-surface text-bc-danger shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Annuler
            </button>
            <button
              @click="pull(f)"
              :disabled="isPulling(f) || isInstalled(f)"
              class="shrink-0 w-24 px-2 py-0.5 text-xs rounded border-2 border-bc-border-strong bg-bc-orange text-bc-ink shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-orange-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed"
            >
              <span v-if="isInstalled(f)">Installé</span>
              <span v-else-if="isPulling(f) && pulls[tagFor(f)].queued">En attente</span>
              <span v-else-if="isPulling(f)" class="font-mono">{{ pulls[tagFor(f)].progress }}%</span>
              <span v-else>Télécharger</span>
            </button>
          </template>
        </li>
      </ul>
      <p v-if="pullError" class="text-sm text-bc-danger mt-3">{{ pullError }}</p>
    </template>
  </div>
</template>

<script setup>
import { estimateFromWeights, KV_CACHE_GUESS_BYTES } from '~/composables/useVramFit'

const props = defineProps({
  repo: { type: String, required: true }, // "<user>/<repo>"
})
const emit = defineEmits(['pull-success'])

const { pulls, startPull, cancelPull } = usePulls()
const { modelList } = useModels()

const info = ref(null)
const loading = ref(false)
const error = ref('')
const pullError = ref('')

// le dépôt change à chaque frappe dans la recherche (déjà temporisée par la modale) : on ignore la
// réponse d'une requête dépassée par une plus récente
let requestId = 0
watch(() => props.repo, async (repo) => {
  const id = ++requestId
  loading.value = true
  error.value = ''
  info.value = null
  try {
    const res = await $fetch('/api/library/hf/repo', { query: { repo } })
    if (id === requestId) info.value = res
  } catch (e) {
    if (id === requestId) error.value = e?.data?.statusMessage ?? 'Erreur lors de la lecture du dépôt.'
  } finally {
    if (id === requestId) loading.value = false
  }
}, { immediate: true })

const isMoe = computed(() => info.value?.active_params && info.value.active_params < info.value.total_params)

// tag Ollama : hf.co/<user>/<repo>:<quantification>
const tagFor = (f) => `hf.co/${info.value.repo}:${f.quant}`

function isPulling(f) {
  const p = pulls.value[tagFor(f)]
  return !!p && !p.error
}

// Ollama peut stocker le nom avec une autre casse que celle tapée : comparaison insensible à la casse
function isInstalled(f) {
  const tag = tagFor(f).toLowerCase()
  return (modelList.value ?? []).some((m) => m.name.toLowerCase() === tag)
}

async function pull(f) {
  const tag = tagFor(f)
  pullError.value = ''
  const ok = await startPull(tag)
  if (ok) emit('pull-success', tag)
  else if (pulls.value[tag]?.error) pullError.value = pulls.value[tag].error
}

// ici on connaît la taille exacte du fichier, contrairement à la bibliothèque Ollama
const estimate = (f) => estimateFromWeights(f.size, {
  active_params: info.value.active_params,
  total_params: info.value.total_params,
})

const details = (f) => [
  'Estimation avant téléchargement',
  `Poids (fichier ${f.quant}) : ${formatGo(f.size)}`,
  `KV cache (~4k tokens) : ${formatGo(KV_CACHE_GUESS_BYTES)}`,
  'Marge buffers : +5 %',
]

function formatGo(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(1)} Go`
}
function formatParams(n) {
  return `${(n / 1e9).toFixed(1)}B`
}
function formatCtx(n) {
  return n >= 1024 ? `${Math.round(n / 1024)}k` : String(n)
}
</script>
