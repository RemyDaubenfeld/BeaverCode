<template>
  <Modal size="xl" @close="emit('close')">
    <template #header>{{ model }} — détail des tests</template>

    <div class="flex items-center gap-2 mb-3 text-sm">
      <span :class="scoreColorClass(avgScore)" class="font-medium">{{ avgScore }}/5 — {{ verdict }}</span>
      <span class="text-bc-text-muted font-mono">({{ avgTokensPerSec }} tok/s, {{ tests.length }} test{{ tests.length > 1 ? 's' : '' }})</span>
    </div>

    <div class="max-h-[70vh] overflow-y-auto">
      <table class="w-full text-xs text-bc-text-secondary border-collapse">
        <tbody>
          <tr v-for="test in tests" :key="test.test_id" class="border-t border-bc-border/60">
            <td class="py-1.5 pr-3 text-bc-text-secondary whitespace-nowrap">{{ test.label }}</td>
            <td class="py-1.5 pr-3 whitespace-nowrap font-mono" :class="scoreColorClass(test.score)">
              {{ '★'.repeat(test.score) }}{{ '☆'.repeat(5 - test.score) }}
            </td>
            <td class="py-1.5 pr-3 text-bc-text-muted font-mono whitespace-nowrap">{{ test.tokens_per_sec }} tok/s</td>
            <td class="py-1.5 pr-3 text-bc-text-muted font-mono whitespace-nowrap">{{ formatDuration(test.elapsed_sec) }}</td>
            <td class="py-1.5 text-bc-text-muted max-w-md truncate" :title="test.weaknesses">{{ test.weaknesses }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

defineProps({
  model: { type: String, required: true },
  tests: { type: Array, required: true },
  avgScore: { type: Number, required: true },
  avgTokensPerSec: { type: Number, required: true },
  verdict: { type: String, required: true },
})
const emit = defineEmits(['close'])

const { scoreColorClass, formatDuration } = useBenchmarkFormat()
</script>
