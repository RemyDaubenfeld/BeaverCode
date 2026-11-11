<template>
  <div>
    <div v-if="modelList" class="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-sm text-bc-text-secondary">
      <span class="text-xs text-bc-text-secondary whitespace-nowrap font-mono">
        <template v-if="selectedCapabilities.length">
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
      <button
        v-if="selectedCapabilities.length"
        @click="selectedCapabilities = []"
        class="text-xs text-bc-text-muted hover:text-bc-text-secondary underline"
      >
        Réinitialiser
      </button>
    </div>

    <div class="max-h-[80vh] overflow-auto rounded-bc border-2 border-bc-border-strong bg-bc-surface shadow-bc-hard">
      <table v-if="modelList" class="w-full text-sm text-bc-text-primary border-collapse">
        <thead class="sticky top-0 bg-bc-surface z-10">
          <tr class="text-left text-xs uppercase tracking-wide text-bc-text-muted border-b border-bc-border">
            <th class="py-2 pr-4 pl-4 font-medium">Nom</th>
            <th class="py-2 px-4 font-medium">Taille</th>
            <th class="py-2 px-4 font-medium">Paramètres</th>
            <th class="py-2 px-4 font-medium">Quantification</th>
            <th class="py-2 px-4 font-medium">Contexte</th>
            <th class="py-2 px-4 font-medium">Embedding</th>
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
            class="border-b border-bc-border bg-bc-surface-alt hover:bg-bc-surface"
          >
            <td class="py-2 pr-4 pl-4 text-bc-text-primary font-mono max-w-xs truncate" :title="model.name">
              {{ model.name }}
            </td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ formatSize(model.size) }}</td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ model.details?.parameter_size ?? '—' }}</td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ model.details?.quantization_level ?? '—' }}</td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ formatContext(model.details?.context_length) }}</td>
            <td class="py-2 px-4 text-bc-text-secondary font-mono">{{ model.details?.embedding_length ?? '—' }}</td>

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
                @click="$emit('delete-model', model.name)"
              >
                <TrashIcon class="w-4 h-4 cursor-pointer text-bc-danger" />
              </button>
            </td>
          </tr>
          <tr v-if="filteredModelList.length === 0">
            <td :colspan="7 + capabilityColumns.length" class="py-6 text-center text-bc-text-muted">
              Aucun modèle ne correspond aux capacités sélectionnées.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!modelList" class="text-bc-text-secondary">Chargement des modèles…</p>
  </div>
</template>

<script setup>
import { TrashIcon } from '@heroicons/vue/24/solid'
defineEmits(['delete-model'])

const { modelList } = useModels()

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

const filteredModelList = computed(() => {
  if (!modelList.value) return []
  if (selectedCapabilities.value.length === 0) return modelList.value
  return modelList.value.filter((model) =>
    selectedCapabilities.value.some((cap) => model.capabilities?.includes(cap))
  )
})

function formatSize(bytes) {
  if (bytes == null) return '—'
  const go = bytes / 1024 ** 3
  return `${go.toFixed(1)} Go`
}

function formatContext(tokens) {
  if (tokens == null) return '—'
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : tokens
}
</script>
