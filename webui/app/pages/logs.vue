<template>
  <div class="flex max-h-full flex-col px-6 py-4">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h1 class="font-display text-lg font-semibold text-bc-text-primary">Logs Ollama</h1>
        <span
          class="flex items-center gap-1.5 rounded border px-2.5 py-0.5 font-mono text-xs font-medium"
          :class="statusClasses"
        >
          <span class="size-1.5 rounded-full" :class="statusDotClasses" />
          {{ statusLabel }}
        </span>
        <span v-if="source" class="text-xs text-bc-text-muted">
          source : <span class="font-mono font-medium text-bc-text-secondary">{{ sourceLabel }}</span>
        </span>
      </div>

      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5 text-xs text-bc-text-muted">
          <input v-model="autoScroll" type="checkbox" class="rounded border-bc-border bg-bc-surface-alt" />
          Défilement auto
        </label>
        <button
          @click="clearLogs"
          class="rounded border-2 border-bc-border-strong bg-bc-surface px-3 py-1.5 text-sm text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          Effacer
        </button>
        <button
          v-if="status !== 'closed'"
          @click="stopLogs"
          class="rounded border-2 border-bc-border-strong bg-bc-surface px-3 py-1.5 text-sm text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          Arrêter
        </button>
        <button
          v-else
          @click="restartLogs"
          class="rounded border-2 border-bc-border-strong bg-bc-orange px-3 py-1.5 text-sm text-bc-ink shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-orange-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          Redémarrer
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="mb-3 rounded border border-bc-danger-dark bg-bc-danger-tint px-3 py-2 text-sm text-bc-danger">
      {{ errorMessage }}
    </p>

    <div
      ref="logContainer"
      class="flex-1 overflow-y-auto rounded border border-bc-border bg-bc-ink p-3 font-mono text-xs text-bc-green"
      @scroll="onScroll"
    >
      <p v-if="lines.length === 0 && !errorMessage" class="text-bc-text-muted">En attente de logs…</p>
      <div v-for="(line, i) in lines" :key="i" class="whitespace-pre-wrap break-all">{{ line }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const lines = ref([])
const status = ref('connecting') // connecting | connected | error | closed
const source = ref('')
const errorMessage = ref('')
const autoScroll = ref(true)
const logContainer = ref(null)

const MAX_LINES = 2000

let es = null

const statusLabel = computed(() => ({
  connecting: 'Connexion…',
  connected: 'En direct',
  error: 'Erreur',
  closed: 'Déconnecté',
}[status.value]))

const statusClasses = computed(() => ({
  connecting: 'bg-bc-warning-tint text-bc-warning border-bc-warning-dark',
  connected: 'bg-bc-green-tint text-bc-green border-bc-green-dark',
  error: 'bg-bc-danger-tint text-bc-danger border-bc-danger-dark',
  closed: 'bg-bc-surface-alt text-bc-text-secondary border-bc-border',
}[status.value]))

const statusDotClasses = computed(() => ({
  connecting: 'bg-bc-warning',
  connected: 'bg-bc-green',
  error: 'bg-bc-danger',
  closed: 'bg-bc-text-muted',
}[status.value]))

const sourceLabel = computed(() => ({
  docker: 'Docker',
  journalctl: 'systemd (journalctl)',
  file: 'fichier de logs',
}[source.value] || source.value))

function onScroll() {
  const el = logContainer.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
  autoScroll.value = atBottom
}

function clearLogs() {
  lines.value = []
}

function scrollToBottom() {
  if (!autoScroll.value) return
  nextTick(() => {
    const el = logContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function stopLogs() {
  es?.close()
  es = null
  status.value = 'closed'
}

function restartLogs() {
  connect()
}

function connect() {
  es?.close()
  errorMessage.value = ''
  status.value = 'connecting'
  es = new EventSource('/api/ollama-logs')

  es.addEventListener('source', (e) => {
    source.value = JSON.parse(e.data)
    status.value = 'connected'
  })

  es.onmessage = (e) => {
    status.value = 'connected'
    lines.value.push(JSON.parse(e.data))
    if (lines.value.length > MAX_LINES) {
      lines.value.splice(0, lines.value.length - MAX_LINES)
    }
    scrollToBottom()
  }

  es.addEventListener('error', (e) => {
    if (e.data) {
      try {
        errorMessage.value = JSON.parse(e.data)
      } catch {
        errorMessage.value = e.data
      }
    }
  })

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      status.value = 'closed'
    } else {
      status.value = 'error'
    }
  }
}

onMounted(connect)
onUnmounted(() => es?.close())
</script>
