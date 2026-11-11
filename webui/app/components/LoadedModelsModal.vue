<template>
  <Modal @close="emit('close')">
    <template #header>Modèles chargés en mémoire</template>

    <p v-if="loadedModels.length === 0" class="text-sm text-bc-text-secondary">Aucun modèle chargé.</p>

    <ul v-else class="space-y-2">
      <li
        v-for="m in loadedModels"
        :key="m.name"
        class="flex items-center justify-between gap-3 rounded-bc border border-bc-border bg-bc-surface-alt px-3 py-2 text-sm"
      >
        <div class="min-w-0">
          <span class="font-mono font-medium text-bc-text-primary">{{ m.name }}</span>
          <span class="ml-2 text-xs text-bc-text-secondary">
            {{ m.size_vram > 0 ? `${formatSize(m.size_vram)} VRAM` : 'CPU' }}
          </span>
        </div>
        <button
          @click="unload(m.name)"
          :disabled="unloadingName === m.name"
          class="shrink-0 px-2.5 py-1 text-xs rounded-bc border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none bg-bc-danger text-bc-paper disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:border-bc-border disabled:shadow-none disabled:cursor-not-allowed"
        >
          {{ unloadingName === m.name ? 'Déchargement…' : 'Décharger' }}
        </button>
      </li>
    </ul>

    <p v-if="unloadError" class="mt-3 text-sm text-bc-danger">{{ unloadError }}</p>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const emit = defineEmits(['close'])

const { loadedModels, refresh } = useModels()

const unloadingName = ref(null)
const unloadError = ref('')

async function unload(name) {
  unloadingName.value = name
  unloadError.value = ''
  try {
    await $fetch('/api/model/unload', { method: 'POST', body: { name } })
    await refresh()
  } catch (e) {
    unloadError.value = e.data?.statusMessage ?? 'Erreur lors du déchargement'
  } finally {
    unloadingName.value = null
  }
}

function formatSize(bytes) {
  const go = bytes / 1024 ** 3
  return `${go.toFixed(1)} Go`
}
</script>
