<template>
  <Modal size="xl" @close="emit('close')">
    <template #header>Résultats du run — {{ formatDate(run?.generated_at) }}</template>
    <template #actions>
      <button
        v-if="run"
        @click="downloadJson"
        title="Télécharger le JSON"
        class="p-1.5 rounded text-bc-text-muted hover:text-bc-text-primary hover:bg-bc-surface-alt cursor-pointer"
      >
        <ArrowDownTrayIcon class="w-4 h-4" />
      </button>
    </template>

    <p v-if="loading" class="text-sm text-bc-text-muted">Chargement…</p>
    <p v-else-if="error" class="text-sm text-bc-danger">{{ error }}</p>

    <div v-else class="max-h-[70vh] overflow-y-auto space-y-2 pr-1">
      <details v-for="model in run.models" :key="model.model" class="group rounded-bc border border-bc-border bg-bc-surface-alt" open>
        <summary class="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none">
          <span class="flex items-center gap-1.5">
            <ChevronDownIcon class="w-4 h-4 text-bc-text-muted shrink-0 transition-transform group-open:rotate-180" />
            <span class="font-mono font-medium text-bc-text-primary">{{ model.model }}</span>
          </span>
          <span class="text-sm">
            <span :class="scoreColorClass(model.avg_score)" class="font-medium">{{ model.avg_score }}/5 — {{ model.verdict }}</span>
            <span class="text-bc-text-muted">({{ model.avg_tokens_per_sec }} tok/s)</span>
          </span>
        </summary>
        <div class="border-t border-bc-border px-3 pb-3">
          <table class="w-full text-xs text-bc-text-muted border-collapse mt-2 font-mono">
            <tbody>
              <tr v-for="test in model.tests" :key="test.test_id" class="border-t border-bc-border">
                <td class="py-1 pr-3 text-bc-text-secondary whitespace-nowrap">{{ test.label }}</td>
                <td class="py-1 pr-3 whitespace-nowrap" :class="scoreColorClass(test.score)">
                  {{ '★'.repeat(test.score) }}{{ '☆'.repeat(5 - test.score) }}
                </td>
                <td class="py-1 pr-3 text-bc-text-muted whitespace-nowrap">{{ test.tokens_per_sec }} tok/s</td>
                <td class="py-1 pr-3 text-bc-text-muted whitespace-nowrap">{{ formatDuration(test.elapsed_sec) }}</td>
                <td class="py-1 text-bc-text-muted max-w-md truncate" :title="test.weaknesses">{{ test.weaknesses }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </Modal>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ChevronDownIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import Modal from './Modal.vue'

const props = defineProps({ id: { type: String, required: true } })
const emit = defineEmits(['close'])

const { scoreColorClass, formatDuration } = useBenchmarkFormat()

const run = ref(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    run.value = await $fetch(`/api/benchmark/results/${props.id}`)
  } catch (e) {
    error.value = e.data?.statusMessage ?? 'Erreur lors du chargement du run'
  } finally {
    loading.value = false
  }
})

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function downloadJson() {
  if (!run.value) return
  const blob = new Blob([JSON.stringify(run.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `benchmark-run-${props.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
