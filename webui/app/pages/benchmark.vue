<template>
  <div class="px-6 py-4">
    <div class="flex gap-1.5 mb-4 border-b-2 border-bc-border-strong">
      <button
        @click="tab = 'tests'"
        class="px-4 py-2.5 text-sm font-mono -mb-0.5 cursor-pointer rounded-t-bc border-2 border-b-0"
        :class="tab === 'tests' ? 'border-bc-border-strong bg-bc-bg text-bc-orange-light relative top-0.5' : 'border-transparent text-bc-text-muted hover:text-bc-text-secondary'"
      >
        Tests
      </button>
      <button
        @click="tab = 'resultats'"
        class="px-4 py-2.5 text-sm font-mono -mb-0.5 cursor-pointer rounded-t-bc border-2 border-b-0"
        :class="tab === 'resultats' ? 'border-bc-border-strong bg-bc-bg text-bc-orange-light relative top-0.5' : 'border-transparent text-bc-text-muted hover:text-bc-text-secondary'"
      >
        Résultats
      </button>
    </div>

    <BenchmarkRunner v-if="tab === 'tests'" />
    <BenchmarkResultsView v-else />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BenchmarkRunner from '~/components/BenchmarkRunner.vue'
import BenchmarkResultsView from '~/components/BenchmarkResultsView.vue'

const tab = ref('tests')
</script>
