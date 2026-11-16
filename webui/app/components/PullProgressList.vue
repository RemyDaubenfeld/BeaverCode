<template>
  <!-- Une seule ligne : une erreur à acquitter en priorité, sinon le téléchargement actif ; le suivant de la file apparaît ensuite -->
  <div v-if="current">
    <div class="flex items-center gap-4 rounded-bc border-2 border-bc-border-strong bg-bc-surface shadow-bc-hard-sm px-4 py-2 text-sm">
      <span
        v-if="entries.length > 1"
        class="shrink-0 font-mono text-xs text-bc-text-muted"
        :title="queuedCount ? `${queuedCount} en attente` : `${entries.length} téléchargements`"
      >
        1/{{ entries.length }}
      </span>
      <span class="font-mono text-bc-text-primary truncate max-w-xs" :title="current.tag">{{ current.tag }}</span>

      <template v-if="current.error">
        <span class="flex-1 text-xs text-bc-danger truncate" :title="current.error">{{ current.error }}</span>
        <button
          @click="dismissPull(current.tag)"
          class="text-xs text-bc-text-muted hover:text-bc-text-secondary underline"
        >
          OK
        </button>
      </template>

      <template v-else>
        <div class="flex-1 h-2 rounded-full bg-bc-surface-alt overflow-hidden">
          <div class="h-full rounded-full bg-bc-orange transition-[width] duration-300" :style="{ width: current.progress + '%' }" />
        </div>
        <span class="w-10 text-right font-mono text-xs text-bc-text-secondary">{{ current.progress }}%</span>
        <span class="w-40 text-xs text-bc-text-muted truncate" :title="current.status">{{ current.status }}</span>
        <button
          @click="cancelPull(current.tag)"
          title="Annuler le téléchargement"
          class="shrink-0 px-2 py-1 text-xs rounded border-2 border-bc-border-strong bg-bc-surface text-bc-danger shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Annuler
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
const { pulls, cancelPull, dismissPull } = usePulls()
const entries = computed(() => Object.values(pulls.value))
const current = computed(() =>
  entries.value.find((p) => p.error)
  ?? entries.value.find((p) => !p.queued)
  ?? entries.value[0]
  ?? null
)
const queuedCount = computed(() => entries.value.filter((p) => p.queued).length)
</script>
