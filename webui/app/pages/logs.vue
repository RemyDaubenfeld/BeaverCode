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
          <input v-model="autoScroll" type="checkbox" class="rounded border-bc-border bg-bc-surface-alt accent-bc-orange" />
          Défilement auto
        </label>
        <button
          @click="downloadLogs"
          :disabled="!lines.length"
          :title="isFiltered ? `Télécharge les ${visibleLines.length} lignes affichées (filtres appliqués)` : 'Télécharge toutes les lignes reçues'"
          class="rounded border-2 border-bc-border-strong bg-bc-surface px-3 py-1.5 text-sm text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Télécharger
        </button>
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

    <!-- Filtres : catégorie (d'où vient la ligne), niveau (gravité), recherche texte -->
    <div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <div class="flex items-center gap-1.5">
        <span class="uppercase tracking-wide text-bc-text-muted">Catégorie :</span>
        <button
          v-for="c in CATEGORIES"
          :key="c.id"
          @click="toggle(shownCategories, c.id)"
          :title="c.hint"
          class="rounded border px-2 py-0.5 font-mono"
          :class="shownCategories.has(c.id) ? 'border-bc-orange text-bc-orange-light bg-bc-orange-tint' : 'border-bc-border text-bc-text-muted line-through'"
        >
          {{ c.label }} <span class="opacity-70">{{ counts.category[c.id] }}</span>
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="uppercase tracking-wide text-bc-text-muted">Niveau :</span>
        <button
          v-for="l in LEVELS"
          :key="l.id"
          @click="toggle(shownLevels, l.id)"
          class="rounded border px-2 py-0.5 font-mono"
          :class="shownLevels.has(l.id) ? l.activeClass : 'border-bc-border text-bc-text-muted line-through'"
        >
          {{ l.label }} <span class="opacity-70">{{ counts.level[l.id] }}</span>
        </button>
      </div>

      <input
        v-model="query"
        type="search"
        placeholder="Rechercher (ex: error, qwen3, /api/chat)…"
        title="Insensible à la casse — Échap pour effacer"
        @keydown.esc="query = ''"
        class="w-64 px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />

      <span class="font-mono text-bc-text-muted">
        {{ visibleLines.length }}<template v-if="isFiltered"> / {{ lines.length }}</template> ligne{{ visibleLines.length > 1 ? 's' : '' }}
      </span>
      <button v-if="isFiltered" @click="resetFilters" class="text-bc-text-muted hover:text-bc-text-secondary underline">
        Réinitialiser
      </button>
    </div>

    <p v-if="errorMessage" class="mb-3 rounded border border-bc-danger-dark bg-bc-danger-tint px-3 py-2 text-sm text-bc-danger">
      {{ errorMessage }}
    </p>

    <div
      ref="logContainer"
      class="flex-1 overflow-y-auto rounded border border-bc-border bg-bc-ink p-3 font-mono text-xs"
      @scroll="onScroll"
    >
      <p v-if="lines.length === 0 && !errorMessage" class="text-bc-text-muted">En attente de logs…</p>
      <p v-else-if="visibleLines.length === 0" class="text-bc-text-muted">Aucune ligne ne correspond aux filtres.</p>
      <div
        v-for="line in visibleLines"
        :key="line.id"
        class="whitespace-pre-wrap break-all"
        :class="lineClass(line)"
      >
        <!-- recherche : le texte trouvé est surligné -->
        <template v-for="(part, i) in highlight(line.raw)" :key="i"><mark v-if="part.match" class="bg-bc-orange text-bc-ink rounded-sm">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'

// Garde les N dernières lignes : sur cette machine, ~80 % des lignes sont des requêtes HTTP (le polling
// de la WebUI toutes les 2 s), 2000 lignes ne couvraient que quelques minutes
const MAX_LINES = 5000

// --- Catégories et niveaux --------------------------------------------------------------------
// Trois formats de lignes dans les logs d'Ollama (analysé sur 5000 lignes du conteneur Docker) :
// - Ollama lui-même : `time=… level=INFO source=… msg="…"`
// - les requêtes HTTP reçues (framework Gin) : `[GIN] 2026/11/16 - 16:21:19 | 200 | 18µs | 127.0.0.1 | GET "/api/ps"`
// - le moteur llama.cpp (llama-server) : `print_info: …`, `llama_model_loader: …`, `warning: …`
const CATEGORIES = [
  { id: 'ollama', label: 'Ollama', hint: 'Événements du serveur Ollama (chargement de modèle, mémoire, erreurs…)' },
  { id: 'engine', label: 'Moteur', hint: 'Sortie du moteur llama.cpp : chargement des tenseurs, KV cache, contexte…' },
  { id: 'http', label: 'HTTP', hint: 'Requêtes reçues par Ollama — en majorité le polling de cette WebUI (/api/ps, /api/tags toutes les 2 s), masquées par défaut' },
]
const LEVELS = [
  { id: 'error', label: 'Erreur', activeClass: 'border-bc-danger text-bc-danger bg-bc-danger-tint' },
  { id: 'warn', label: 'Avert.', activeClass: 'border-bc-warning text-bc-warning bg-bc-warning-tint' },
  { id: 'info', label: 'Info', activeClass: 'border-bc-border-strong text-bc-text-secondary bg-bc-surface-alt' },
  { id: 'debug', label: 'Debug', activeClass: 'border-bc-border-strong text-bc-text-secondary bg-bc-surface-alt' },
]

// Une ligne brute → { id, raw, category, level }
let nextLineId = 0
function parseLine(raw) {
  const line = { id: nextLineId++, raw, category: 'engine', level: 'info' }

  const levelMatch = /\blevel=(ERROR|WARN|INFO|DEBUG|TRACE)\b/.exec(raw)
  if (levelMatch) {
    line.category = 'ollama'
    line.level = { ERROR: 'error', WARN: 'warn', INFO: 'info', DEBUG: 'debug', TRACE: 'debug' }[levelMatch[1]]
    return line
  }

  // [GIN] … | 200 | … : niveau d'après le code HTTP (5xx erreur serveur, 4xx requête refusée)
  const gin = /^\[GIN\][^|]*\|\s*(\d{3})\s*\|/.exec(raw)
  if (gin) {
    line.category = 'http'
    const code = Number(gin[1])
    line.level = code >= 500 ? 'error' : code >= 400 ? 'warn' : 'info'
    return line
  }

  // moteur : pas de niveau explicite, on se fie aux mots-clés (ex. « warning: no usable GPU found »)
  if (/\b(error|fail(ed|ure)?|fatal|panic|abort(ed)?)\b/i.test(raw)) line.level = 'error'
  else if (/\bwarn(ing)?\b/i.test(raw)) line.level = 'warn'
  return line
}

// --- État ------------------------------------------------------------------------------------
const lines = ref([])
const status = ref('connecting') // connecting | connected | reconnecting | error | closed
const source = ref('')
const errorMessage = ref('')
const autoScroll = ref(true)
const logContainer = ref(null)

const shownCategories = reactive(new Set(['ollama', 'engine']))
const shownLevels = reactive(new Set(['error', 'warn', 'info', 'debug']))
const query = ref('')

function toggle(set, id) {
  set.has(id) ? set.delete(id) : set.add(id)
}

function resetFilters() {
  shownCategories.clear()
  ;['ollama', 'engine'].forEach((c) => shownCategories.add(c))
  shownLevels.clear()
  LEVELS.forEach((l) => shownLevels.add(l.id))
  query.value = ''
}

const isFiltered = computed(() =>
  shownCategories.size < CATEGORIES.length || shownLevels.size < LEVELS.length || !!query.value.trim()
)

const visibleLines = computed(() => {
  const q = query.value.trim().toLowerCase()
  return lines.value.filter((l) =>
    shownCategories.has(l.category)
    && shownLevels.has(l.level)
    && (!q || l.raw.toLowerCase().includes(q))
  )
})

// compteurs affichés sur les boutons de filtre (sur toutes les lignes reçues)
const counts = computed(() => {
  const category = { ollama: 0, engine: 0, http: 0 }
  const level = { error: 0, warn: 0, info: 0, debug: 0 }
  for (const l of lines.value) {
    category[l.category]++
    level[l.level]++
  }
  return { category, level }
})

function lineClass(line) {
  if (line.level === 'error') return 'text-bc-danger'
  if (line.level === 'warn') return 'text-bc-warning'
  if (line.category === 'ollama') return 'text-bc-green'
  return line.category === 'http' ? 'text-bc-text-muted' : 'text-bc-text-secondary'
}

// découpe une ligne en morceaux surlignés / non surlignés selon la recherche
function highlight(text) {
  const q = query.value.trim()
  if (!q) return [{ text, match: false }]
  const parts = []
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  let pos = 0
  let idx
  while ((idx = lower.indexOf(needle, pos)) !== -1) {
    if (idx > pos) parts.push({ text: text.slice(pos, idx), match: false })
    parts.push({ text: text.slice(idx, idx + needle.length), match: true })
    pos = idx + needle.length
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), match: false })
  return parts
}

// --- En-tête de statut ---------------------------------------------------------------------
const statusLabel = computed(() => ({
  connecting: 'Connexion…',
  connected: 'En direct',
  reconnecting: 'Reconnexion…',
  error: 'Erreur',
  closed: 'Déconnecté',
}[status.value]))

const statusClasses = computed(() => ({
  connecting: 'bg-bc-warning-tint text-bc-warning border-bc-warning-dark',
  connected: 'bg-bc-green-tint text-bc-green border-bc-green-dark',
  reconnecting: 'bg-bc-warning-tint text-bc-warning border-bc-warning-dark',
  error: 'bg-bc-danger-tint text-bc-danger border-bc-danger-dark',
  closed: 'bg-bc-surface-alt text-bc-text-secondary border-bc-border',
}[status.value]))

const statusDotClasses = computed(() => ({
  connecting: 'bg-bc-warning',
  connected: 'bg-bc-green',
  reconnecting: 'bg-bc-warning',
  error: 'bg-bc-danger',
  closed: 'bg-bc-text-muted',
}[status.value]))

const sourceLabel = computed(() => ({
  docker: 'Docker',
  journalctl: 'systemd (journalctl)',
  file: 'fichier de logs',
}[source.value] || source.value))

// --- Défilement --------------------------------------------------------------------------------
function onScroll() {
  const el = logContainer.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
  autoScroll.value = atBottom
}

function scrollToBottom() {
  if (!autoScroll.value) return
  nextTick(() => {
    const el = logContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function clearLogs() {
  lines.value = []
}

// --- Téléchargement : les lignes affichées (filtres appliqués), en texte brut ----------------
function downloadLogs() {
  const text = visibleLines.value.map((l) => l.raw).join('\n') + '\n'
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ollama-logs-${new Date().toISOString().replace(/[:.]/g, '-')}${isFiltered.value ? '-filtre' : ''}.log`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Flux SSE + reconnexion automatique --------------------------------------------------------
// Si le flux se coupe (Ollama ou le serveur WebUI redémarré, veille…), on se reconnecte tout seul avec
// un délai croissant (2 s, 4 s, 8 s… plafonné à 30 s), sauf après un « Arrêter » volontaire.
let es = null
let reconnectTimer = null
let reconnectDelay = 2000
let stoppedByUser = false

function stopLogs() {
  stoppedByUser = true
  clearTimeout(reconnectTimer)
  es?.close()
  es = null
  status.value = 'closed'
}

function restartLogs() {
  stoppedByUser = false
  reconnectDelay = 2000
  connect()
}

function scheduleReconnect() {
  if (stoppedByUser) return
  status.value = 'reconnecting'
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
}

function connect() {
  es?.close()
  errorMessage.value = ''
  if (status.value !== 'reconnecting') status.value = 'connecting'
  es = new EventSource('/api/ollama-logs')

  es.addEventListener('source', (e) => {
    source.value = JSON.parse(e.data)
    status.value = 'connected'
    reconnectDelay = 2000
  })

  es.onmessage = (e) => {
    status.value = 'connected'
    lines.value.push(parseLine(JSON.parse(e.data)))
    if (lines.value.length > MAX_LINES) {
      lines.value.splice(0, lines.value.length - MAX_LINES)
    }
    scrollToBottom()
  }

  // erreur envoyée par le serveur (logs introuvables) : pas de reconnexion, le message l'explique
  es.addEventListener('error', (e) => {
    if (e.data) {
      try {
        errorMessage.value = JSON.parse(e.data)
      } catch {
        errorMessage.value = e.data
      }
      stoppedByUser = true
      es?.close()
      status.value = 'error'
    }
  })

  // coupure du flux : reconnexion automatique
  es.onerror = () => {
    if (errorMessage.value) return
    es?.close()
    scheduleReconnect()
  }
}

onMounted(connect)
onUnmounted(() => {
  stoppedByUser = true
  clearTimeout(reconnectTimer)
  es?.close()
})
</script>
