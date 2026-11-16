<template>
  <Modal size="lg" @close="emit('close')">
    <template #header>HuggingFace</template>

    <input
      v-model="query"
      @input="onInput"
      type="text"
      placeholder="Rechercher un modèle GGUF (ex: qwen3 coder) ou coller un dépôt (hf.co/user/repo)…"
      class="w-full mb-3 px-3 py-2 rounded bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
    />

    <!-- dépôt choisi (clic sur un résultat ou dépôt collé) : ses quantifications -->
    <template v-if="repo">
      <button
        v-if="repoFromResults"
        @click="repo = null"
        class="mb-2 text-xs text-bc-orange-light hover:text-bc-orange"
      >
        ← Résultats
      </button>
      <HuggingFaceRepo :repo="repo" @pull-success="(tag) => emit('pull-success', tag)" />
    </template>

    <!-- résultats de recherche -->
    <template v-else>
      <p v-if="loading" class="text-sm text-bc-text-muted">Recherche…</p>
      <p v-else-if="error" class="text-sm text-bc-danger">{{ error }}</p>
      <p v-else-if="!results.length" class="text-sm text-bc-text-muted">Aucun dépôt GGUF trouvé.</p>
      <ul v-else class="space-y-1">
        <li v-for="r in results" :key="r.repo">
          <button
            @click="openRepo(r.repo)"
            class="w-full text-left flex items-center gap-3 rounded-bc border border-bc-border hover:bg-bc-surface-alt px-2 py-1.5 cursor-pointer"
          >
            <span class="flex-1 min-w-0 font-mono text-xs text-bc-text-primary truncate" :title="r.repo">{{ r.repo }}</span>
            <span
              v-if="r.pipeline_tag === 'image-text-to-text'"
              class="shrink-0 font-mono text-[10px] px-1 rounded border border-bc-border text-bc-text-muted"
            >
              vision
            </span>
            <span class="shrink-0 w-24 text-right font-mono text-xs text-bc-text-secondary" title="Téléchargements (30 derniers jours)">
              {{ formatCount(r.downloads) }} ↓
            </span>
            <span class="shrink-0 w-14 text-right font-mono text-xs text-bc-text-muted" title="Likes">
              {{ formatCount(r.likes) }} ♥
            </span>
          </button>
        </li>
      </ul>
    </template>

    <!-- import d'un fichier GGUF local (ex-fenêtre « Importer un modèle ») -->
    <div class="mt-4 border-t border-bc-border pt-3">
      <button
        @click="showImport = !showImport"
        class="text-xs uppercase tracking-wide text-bc-text-muted hover:text-bc-text-secondary"
      >
        {{ showImport ? '▾' : '▸' }} Importer un fichier GGUF local
      </button>
      <GgufImport v-if="showImport" class="mt-3" @imported="(name) => emit('pull-success', name)" />
    </div>

    <p v-if="Object.keys(pulls).length" class="text-xs text-bc-text-muted mt-3">
      Vous pouvez fermer cette fenêtre : la progression reste visible sur la page Modèles.
    </p>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'
import HuggingFaceRepo from './HuggingFaceRepo.vue'
import GgufImport from './GgufImport.vue'

const emit = defineEmits(['close', 'pull-success'])

const { pulls } = usePulls()

const query = ref('')
const results = ref([])
const loading = ref(false)
const error = ref('')
const repo = ref(null) // "<user>/<repo>" affiché
const repoFromResults = ref(false) // ouvert depuis la liste → bouton « Résultats »
const showImport = ref(false)
let debounceTimer = null

// Dépôt collé dans la recherche → "<user>/<repo>", sinon null. Formes acceptées :
//   https://huggingface.co/unsloth/Qwen3-4B-GGUF(/…)   hf.co/unsloth/Qwen3-4B-GGUF(:Q4_K_M)   unsloth/Qwen3-4B-GGUF
// (un éventuel :tag est ignoré : on affiche toutes les quantifications du dépôt)
function parseHfRepo(text) {
  const t = text.trim()
  const url = /^(?:https?:\/\/)?(?:www\.)?(?:huggingface\.co|hf\.co)\/([\w-][\w.-]*\/[\w-][\w.-]*)/i.exec(t)
  if (url) return url[1]
  const bare = /^([\w-][\w.-]*\/[\w-][\w.-]*)$/.exec(t)
  return bare ? bare[1] : null
}

async function search() {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/library/hf/search', { query: { q: query.value } })
    results.value = res.models ?? []
  } catch (e) {
    error.value = e?.data?.statusMessage ?? 'Erreur de recherche. Réessayez.'
  } finally {
    loading.value = false
  }
}

// temporisation : une requête HuggingFace quand on arrête de taper, pas une par lettre
function onInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const pasted = parseHfRepo(query.value)
    if (pasted) {
      repo.value = pasted
      repoFromResults.value = false
    } else {
      repo.value = null
      search()
    }
  }, 300)
}

function openRepo(r) {
  repo.value = r
  repoFromResults.value = true
}

function formatCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`
  return String(n)
}

// à l'ouverture : les dépôts GGUF les plus téléchargés
onMounted(search)
</script>
