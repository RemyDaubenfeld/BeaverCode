<template>
  <div>
    <div v-if="modelList" class="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-sm text-bc-text-secondary">
      <span class="text-xs text-bc-text-secondary whitespace-nowrap font-mono">
        <template v-if="isFiltered">
          {{ filteredModelList.length }} sur {{ modelList.length }} modèles
        </template>
        <template v-else>
          {{ modelList.length }} modèle{{ modelList.length > 1 ? 's' : '' }}
        </template>
      </span>
      <span class="text-xs uppercase tracking-wide text-bc-text-muted">Filtrer par capacité :</span>
      <label
        v-for="cap in capabilityColumns"
        :key="cap"
        class="flex items-center gap-1.5 cursor-pointer select-none"
      >
        <input
          type="checkbox"
          :value="cap"
          v-model="selectedCapabilities"
          class="accent-bc-orange"
        />
        {{ capabilityLabels[cap] }}
      </label>
      <input
        v-model="nameQuery"
        type="search"
        placeholder="Filtrer par nom (ex: qwen coder)…"
        title="Tous les mots doivent apparaître dans le nom ou la famille du modèle, dans n'importe quel ordre — Échap pour effacer"
        @keydown.esc="nameQuery = ''"
        class="w-72 px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-xs text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
      <button
        v-if="isFiltered"
        @click="selectedCapabilities = []; nameQuery = ''"
        class="text-xs text-bc-text-muted hover:text-bc-text-secondary underline"
      >
        Réinitialiser
      </button>
    </div>

    <div class="max-h-[80vh] overflow-auto rounded-bc border-2 border-bc-border-strong bg-bc-surface shadow-bc-hard">
      <table v-if="modelList" class="w-full text-sm text-bc-text-primary border-collapse">
        <thead class="sticky top-0 bg-bc-surface z-10">
          <tr class="text-left text-xs uppercase tracking-wide text-bc-text-muted border-b border-bc-border">
            <th class="py-2 pr-4 pl-4 font-medium">
              <button class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bc-text-secondary cursor-pointer" @click="toggleSort('name')">
                Nom <span class="font-mono" :class="sortKey === 'name' ? 'text-bc-orange' : 'text-bc-border-strong'">{{ sortIndicator('name') }}</span>
              </button>
            </th>
            <th class="py-2 px-4 font-medium">
              <button class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bc-text-secondary cursor-pointer" @click="toggleSort('size')">
                Taille <span class="font-mono" :class="sortKey === 'size' ? 'text-bc-orange' : 'text-bc-border-strong'">{{ sortIndicator('size') }}</span>
              </button>
            </th>
            <th class="py-2 px-4 font-medium" title="Mémoire estimée pour charger le modèle (poids + KV cache + surcoût), comparée à la VRAM utilisable">
              <button class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bc-text-secondary cursor-pointer" @click="toggleSort('vram')">
                VRAM <span class="font-mono" :class="sortKey === 'vram' ? 'text-bc-orange' : 'text-bc-border-strong'">{{ sortIndicator('vram') }}</span>
              </button>
            </th>
            <th class="py-2 px-4 font-medium">
              <button class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bc-text-secondary cursor-pointer" @click="toggleSort('params')">
                Paramètres <span class="font-mono" :class="sortKey === 'params' ? 'text-bc-orange' : 'text-bc-border-strong'">{{ sortIndicator('params') }}</span>
              </button>
            </th>
            <th class="py-2 px-4 font-medium">Quantification</th>
            <th class="py-2 px-4 font-medium">
              <button class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bc-text-secondary cursor-pointer" @click="toggleSort('context')">
                Contexte <span class="font-mono" :class="sortKey === 'context' ? 'text-bc-orange' : 'text-bc-border-strong'">{{ sortIndicator('context') }}</span>
              </button>
            </th>
            <th class="py-2 px-4 font-medium">
              <button class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bc-text-secondary cursor-pointer" @click="toggleSort('embedding')">
                Embedding <span class="font-mono" :class="sortKey === 'embedding' ? 'text-bc-orange' : 'text-bc-border-strong'">{{ sortIndicator('embedding') }}</span>
              </button>
            </th>
            <th class="py-2 px-4 font-medium">
              <button class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bc-text-secondary cursor-pointer" @click="toggleSort('score')">
                Benchmark <span class="font-mono" :class="sortKey === 'score' ? 'text-bc-orange' : 'text-bc-border-strong'">{{ sortIndicator('score') }}</span>
              </button>
            </th>
            <th
              v-for="cap in capabilityColumns"
              :key="cap"
              class="py-2 px-2 font-medium text-center"
              :title="cap"
            >
              {{ capabilityLabels[cap] }}
            </th>
            <th class="py-2 pl-4 pr-4 font-medium text-right"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="model in filteredModelList"
            :key="model.name"
            class="border-b border-bc-border bg-bc-surface-alt hover:bg-bc-surface cursor-pointer"
            title="Cliquer pour voir la fiche du modèle"
            @click="detailsModel = model.name; detailsNotice = ''"
          >
            <td class="py-2 pr-4 pl-4 text-bc-text-primary font-mono max-w-56 truncate" :title="model.name">
              {{ model.name }}
            </td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono whitespace-nowrap">{{ formatSize(model.size) }}</td>
            <td class="py-2 px-4 whitespace-nowrap">
              <VramFitBadge
                :estimate="model.memory_estimate"
                :details="memoryDetails(model.memory_estimate)"
              />
            </td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ model.details?.parameter_size ?? '—' }}</td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ model.details?.quantization_level ?? '—' }}</td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ formatContext(model.details?.context_length) }}</td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ model.details?.embedding_length ?? '—' }}</td>
            <td class="py-2 px-4 font-mono">
              <span
                v-if="scores[model.name]"
                :class="scoreColorClass(scores[model.name].avg_score)"
                :title="`${scores[model.name].total_tests} test${scores[model.name].total_tests > 1 ? 's' : ''} · ${scores[model.name].avg_tokens_per_sec} tok/s (contexte 8192)`"
              >
                {{ scores[model.name].avg_score.toFixed(1) }}/5
              </span>
              <span v-else class="text-bc-text-muted">—</span>
            </td>

            <td
              v-for="cap in capabilityColumns"
              :key="cap"
              class="py-2 px-2 text-center"
            >
              <svg
                v-if="model.capabilities?.includes(cap)"
                class="w-4 h-4 mx-auto text-bc-green"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <svg
                v-else
                class="w-4 h-4 mx-auto text-bc-text-muted"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </td>

            <td class="py-2 pl-4 pr-4 text-right">
              <button
                class="pr-3"
                @click.stop="$emit('delete-model', model.name)"
              >
                <TrashIcon class="w-4 h-4 cursor-pointer text-bc-danger" />
              </button>
            </td>
          </tr>
          <tr v-if="filteredModelList.length === 0">
            <td :colspan="9 + capabilityColumns.length" class="py-6 text-center text-bc-text-muted">
              Aucun modèle ne correspond aux filtres.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!modelList" class="text-bc-text-secondary">Chargement des modèles…</p>

    <!-- :key → changer de modèle recrée la fiche (nouvelle requête /api/model/show, onglets réinitialisés) -->
    <ModelDetailsModal
      v-if="detailsModel"
      :key="detailsModel"
      :name="detailsModel"
      :initial-tab="detailsNotice ? 'parameters' : 'overview'"
      :notice="detailsNotice"
      @close="detailsModel = null; detailsNotice = ''"
      @open-model="(n, notice) => { detailsModel = n; detailsNotice = notice }"
    />
  </div>
</template>

<script setup>
import { TrashIcon } from '@heroicons/vue/24/solid'
defineEmits(['delete-model'])

const { modelList } = useModels()

// modèle dont la fiche détaillée est ouverte (clic sur une ligne)
const detailsModel = ref(null)
const detailsNotice = ref('')
const { scoreColorClass } = useBenchmarkFormat()

// notes du comparatif de benchmark (leaderboard.json), indexées par nom de modèle
const { data: comparison } = useFetch('/api/benchmark/comparison', { default: () => [] })
const scores = computed(() =>
  Object.fromEntries((comparison.value ?? []).map((entry) => [entry.model, entry]))
)

// capacités qu'on veut afficher en colonnes, avec un label court (icône/lettre)
const capabilityLabels = {
  completion: 'Comp.',
  tools: 'Tools',
  thinking: 'Think',
  vision: 'Vision',
  embedding: 'Embed',
  insert: 'Insert',
}
const capabilityColumns = Object.keys(capabilityLabels)

// capacités cochées dans le filtre — un modèle est affiché s'il possède AU MOINS UNE des capacités sélectionnées
const selectedCapabilities = ref([])

// tri par colonne : un clic trie la colonne (croissant), un deuxième inverse, un troisième revient à l'ordre d'Ollama
const sortKey = ref(null)
const sortDir = ref('asc')

const sortValues = {
  name: (m) => m.name?.toLowerCase(),
  size: (m) => m.size,
  vram: (m) => m.memory_estimate?.total_bytes,
  params: (m) => parseParameterSize(m.details?.parameter_size),
  context: (m) => m.details?.context_length,
  embedding: (m) => m.details?.embedding_length,
  score: (m) => scores.value[m.name]?.avg_score,
}

function toggleSort(key) {
  if (sortKey.value !== key) {
    sortKey.value = key
    sortDir.value = 'asc'
  } else if (sortDir.value === 'asc') {
    sortDir.value = 'desc'
  } else {
    sortKey.value = null
  }
}

function sortIndicator(key) {
  if (sortKey.value !== key) return '↕'
  return sortDir.value === 'asc' ? '↑' : '↓'
}

// "3.1B" → 3.1e9, "475.29M" → 4.7529e8
function parseParameterSize(value) {
  const match = /^([\d.]+)\s*([KMBT]?)$/i.exec(value?.trim() ?? '')
  if (!match) return null
  const units = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
  return parseFloat(match[1]) * units[match[2].toUpperCase()]
}

// filtre par nom : chaque mot tapé doit apparaître dans le nom ou la famille du modèle, dans
// n'importe quel ordre (« qwen coder » trouve « qwen3-coder-next:latest »)
const nameQuery = ref('')
const queryWords = computed(() => nameQuery.value.toLowerCase().split(/\s+/).filter(Boolean))
const isFiltered = computed(() => selectedCapabilities.value.length > 0 || queryWords.value.length > 0)

function matchesName(model) {
  const haystack = `${model.name} ${model.details?.family ?? ''}`.toLowerCase()
  return queryWords.value.every((word) => haystack.includes(word))
}

const filteredModelList = computed(() => {
  if (!modelList.value) return []
  let list = modelList.value.filter((model) =>
    matchesName(model)
    && (selectedCapabilities.value.length === 0
      || selectedCapabilities.value.some((cap) => model.capabilities?.includes(cap)))
  )

  if (sortKey.value) {
    const getValue = sortValues[sortKey.value]
    const dir = sortDir.value === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      const va = getValue(a)
      const vb = getValue(b)
      // valeurs manquantes toujours en bas, quel que soit le sens
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string') return va.localeCompare(vb) * dir
      return (va - vb) * dir
    })
  }
  return list
})

function formatSize(bytes) {
  if (bytes == null) return '—'
  const go = bytes / 1024 ** 3
  return `${go.toFixed(1)} Go`
}

// lignes de détail de l'info-bulle VRAM
function memoryDetails(estimate) {
  if (!estimate) return []
  const go = (b) => `${(b / 1024 ** 3).toFixed(1)} Go`
  return [
    `Poids : ${go(estimate.weights_bytes)}`,
    estimate.kv_cache_bytes != null
      ? `KV cache (${formatContext(estimate.num_ctx)} tokens, ${estimate.kv_cache_type ?? 'f16'}) : ${go(estimate.kv_cache_bytes)}`
      : 'KV cache : non estimable pour cette architecture',
    `Marge buffers (5 %) : ${go(estimate.overhead_bytes)}`,
  ]
}

function formatContext(tokens) {
  if (tokens == null) return '—'
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : tokens
}
</script>
