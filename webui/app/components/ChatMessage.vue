<template>
  <!-- Message de l'utilisateur : texte brut, aligné à droite -->
  <div v-if="message.role === 'user'" class="flex justify-end">
    <div class="max-w-[80%] whitespace-pre-wrap break-words rounded-bc border-2 border-bc-border-strong bg-bc-orange-tint px-3.5 py-2.5 text-sm text-bc-text-primary shadow-bc-hard-sm">
      {{ message.content }}
    </div>
  </div>

  <!-- Réponse du modèle : réflexion repliable, Markdown, stats -->
  <div v-else class="group">
    <div v-if="message.thinking" class="mb-2">
      <button
        type="button"
        @click="showThinking = !showThinking"
        class="flex items-center gap-1.5 rounded-md text-xs text-bc-text-secondary hover:text-bc-text-primary cursor-pointer"
        :aria-expanded="showThinking"
      >
        <LightBulbIcon class="w-4 h-4" :class="thinkingLive ? 'text-bc-warning animate-pulse' : ''" />
        <span>{{ thinkingLive ? 'Réflexion en cours…' : 'Réflexion' }}</span>
        <span class="font-mono">({{ thinkingWords }} mots)</span>
        <ChevronDownIcon class="w-3.5 h-3.5 transition-transform" :class="showThinking ? 'rotate-180' : ''" />
      </button>
      <div
        v-if="showThinking"
        class="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-bc-border pl-3 text-xs leading-relaxed text-bc-text-secondary"
      >{{ message.thinking }}</div>
    </div>

    <div
      v-if="message.content"
      class="bc-markdown text-sm text-bc-text-secondary"
      @click="onMarkdownClick"
      v-html="html"
    />
    <p v-else-if="live && !message.thinking" class="flex items-center gap-2 text-sm text-bc-text-secondary">
      <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-bc-orange" />
      {{ waitingLabel }}
    </p>

    <p v-if="message.error" class="mt-2 rounded-bc border border-bc-danger-dark bg-bc-danger-tint px-3 py-2 text-sm text-bc-danger">
      {{ message.error }}
    </p>
    <p v-if="cutWarning" class="mt-2 rounded-bc border border-bc-warning-dark bg-bc-warning-tint px-3 py-1.5 text-xs text-bc-warning">
      {{ cutWarning }}
    </p>

    <div v-if="!live" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-bc-text-secondary">
      <span v-for="part in statParts" :key="part.label" :title="part.title">{{ part.label }}</span>
      <button
        v-if="message.content"
        type="button"
        @click="copy(message.content, 'message')"
        class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center gap-1 rounded-md hover:text-bc-text-primary cursor-pointer transition-opacity"
        title="Copier la réponse (Markdown)"
      >
        <ClipboardDocumentIcon class="w-3.5 h-3.5" />
        {{ copied === 'message' ? 'copié' : 'copier' }}
      </button>
      <button
        v-if="hasRaw"
        type="button"
        @click="emit('raw')"
        class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center gap-1 rounded-md hover:text-bc-text-primary cursor-pointer transition-opacity"
        title="Voir la requête envoyée à Ollama et sa réponse brute"
      >
        <CodeBracketIcon class="w-3.5 h-3.5" />
        requête brute
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LightBulbIcon, ChevronDownIcon, ClipboardDocumentIcon, CodeBracketIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  message: { type: Object, required: true },
  live: { type: Boolean, default: false }, // réponse en cours de génération
  hasRaw: { type: Boolean, default: false }, // requête brute disponible (réponses générées dans cette session)
})
const emit = defineEmits(['raw'])

const html = computed(() => renderMarkdown(props.message.content))

// --- Réflexion : dépliée tant que le modèle réfléchit sans avoir commencé sa réponse, repliée ensuite
// (une fois, automatiquement ; l'utilisateur peut ensuite la rouvrir)
const thinkingLive = computed(() => props.live && !props.message.content)
const showThinking = ref(thinkingLive.value)
watch(thinkingLive, (now, before) => {
  if (before && !now) showThinking.value = false
  if (now) showThinking.value = true
})
const thinkingWords = computed(() => (props.message.thinking ?? '').split(/\s+/).filter(Boolean).length)

const waitingLabel = computed(() => 'En attente du modèle… (le premier message peut prendre du temps : chargement en mémoire)')

// --- Stats sous la réponse
const fmtSec = (s) => (s == null ? null : s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`)

const statParts = computed(() => {
  const s = props.message.stats
  const parts = []
  if (props.message.model) parts.push({ label: props.message.model, title: 'Modèle qui a produit cette réponse' })
  if (!s) return parts
  if (s.tokens != null) parts.push({ label: `${s.tokens} tokens`, title: 'Tokens générés (réflexion comprise)' })
  if (s.tokens_per_sec != null) parts.push({ label: `${s.tokens_per_sec} tok/s`, title: 'Vitesse de génération (hors lecture du prompt)' })
  if (s.ttft_sec != null) {
    const load = s.load_sec >= 0.5 ? ` dont chargement ${fmtSec(s.load_sec)}` : ''
    parts.push({ label: `TTFT ${fmtSec(s.ttft_sec)}${load}`, title: 'Temps avant le premier token, mesuré par le navigateur. Le chargement du modèle en mémoire est compté dedans quand il a eu lieu.' })
  }
  if (s.prompt_tokens != null) parts.push({ label: `contexte ${s.prompt_tokens} tok`, title: 'Tokens du prompt envoyé (prompt système + historique + message)' })
  if (s.total_sec != null) parts.push({ label: fmtSec(s.total_sec), title: s.continued ? 'Durée de la dernière suite' : 'Durée totale' })
  if (s.continued) parts.push({ label: `continuée ×${s.continued}`, title: 'Réponse prolongée avec « Continuer » : les stats sont celles de la dernière suite' })
  return parts
})

const cutWarning = computed(() => {
  const reason = props.message.stats?.done_reason
  if (reason === 'stopped') return 'Génération arrêtée.'
  if (reason === 'length') {
    return props.message.content
      ? 'Réponse coupée : limite « Tokens max » ou contexte plein.'
      : 'Aucune réponse : la limite « Tokens max » (ou le contexte) a été atteinte pendant la réflexion. Monte « Tokens max » ou coupe la réflexion, puis régénère.'
  }
  return ''
})

// --- Copier (réponse entière, ou un bloc de code via son bouton « Copier »)
const copied = ref(null)
async function copy(text, key) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    setTimeout(() => { if (copied.value === key) copied.value = null }, 1500)
  } catch {
    // presse-papiers refusé (contexte non sécurisé) : rien à faire de plus
  }
}

// boutons « Copier » des blocs de code, générés dans le HTML Markdown (voir utils/markdown.js)
function onMarkdownClick(event) {
  const button = event.target.closest('[data-copy-code]')
  if (!button) return
  const code = button.closest('pre')?.querySelector('code')?.textContent ?? ''
  navigator.clipboard.writeText(code).then(() => {
    button.textContent = 'Copié'
    setTimeout(() => { button.textContent = 'Copier' }, 1500)
  }).catch(() => {})
}
</script>
