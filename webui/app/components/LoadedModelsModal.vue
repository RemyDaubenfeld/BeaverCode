<template>
  <Modal @close="emit('close')">
    <template #header>Modèles chargés en mémoire</template>

    <p v-if="loadedModels.length === 0" class="text-sm text-bc-text-secondary">Aucun modèle chargé.</p>

    <ul v-else class="space-y-2">
      <li
        v-for="m in loadedModels"
        :key="m.name"
        class="rounded-bc border border-bc-border bg-bc-surface-alt px-3 py-2 text-sm"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <span class="font-mono font-medium text-bc-text-primary">{{ m.name }}</span>
            <span class="ml-2 text-xs text-bc-text-secondary">
              {{ m.size_vram > 0 ? `${formatSize(m.size_vram)} VRAM` : 'CPU' }}
            </span>
          </div>
          <button
            @click="unload(m.name)"
            :disabled="busyName === m.name || remaining(m.expires_at).expired"
            class="shrink-0 px-2.5 py-1 text-xs rounded-bc border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none bg-bc-danger text-bc-paper disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:border-bc-border disabled:shadow-none disabled:cursor-not-allowed"
          >
            {{ busyName === m.name && busyAction === 'unload' ? 'Déchargement…' : 'Décharger' }}
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
          <span class="text-bc-text-muted">Déchargement dans</span>
          <span
            class="font-mono"
            :class="remaining(m.expires_at).unlimited ? 'text-bc-green' : 'text-bc-text-primary'"
          >
            {{ remaining(m.expires_at).text }}
          </span>
          <span class="ml-auto text-bc-text-muted" :title="keepAliveHint">Garder chargé :</span>
          <button
            v-for="opt in keepAliveOptions"
            :key="opt.value"
            @click="keepAlive(m.name, opt.value)"
            :disabled="busyName === m.name || remaining(m.expires_at).expired"
            :title="keepAliveHint"
            class="px-1.5 py-0.5 rounded border border-bc-border font-mono text-bc-text-secondary hover:border-bc-orange hover:text-bc-orange-light disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {{ opt.label }}
          </button>
        </div>
      </li>
    </ul>

    <p v-if="loadedModels.length" class="mt-3 text-xs text-bc-text-muted">{{ keepAliveHint }}</p>
    <p v-if="actionError" class="mt-3 text-sm text-bc-danger">{{ actionError }}</p>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const emit = defineEmits(['close'])

const { loadedModels, refresh } = useModels()
const { remaining } = useKeepAlive()

const keepAliveOptions = [
  { label: '30 min', value: '30m' },
  { label: '1 h', value: '1h' },
  { label: '4 h', value: '4h' },
  { label: '∞', value: -1 },
]
const keepAliveHint = 'La durée repart de zéro à chaque utilisation du modèle (chat, benchmark…), avec le délai par défaut d\'Ollama : « garder chargé » vaut jusqu\'à la prochaine requête.'

const busyName = ref(null)
const busyAction = ref(null) // 'unload' | 'keep'
const actionError = ref('')

async function run(name, action, request) {
  busyName.value = name
  busyAction.value = action
  actionError.value = ''
  try {
    await request()
    await refresh()
  } catch (e) {
    actionError.value = e.data?.statusMessage ?? 'Erreur lors de l\'opération'
  } finally {
    busyName.value = null
    busyAction.value = null
  }
}

const unload = (name) => run(name, 'unload', () => $fetch('/api/model/unload', { method: 'POST', body: { name } }))
const keepAlive = (name, value) => run(name, 'keep', () => $fetch('/api/model/keep-alive', { method: 'POST', body: { name, keep_alive: value } }))

function formatSize(bytes) {
  const go = bytes / 1024 ** 3
  return `${go.toFixed(1)} Go`
}
</script>
