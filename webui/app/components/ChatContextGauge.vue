<template>
  <!-- Jauge de contexte : tokens de la prochaine requête par rapport à num_ctx. Au-delà, Ollama jette
       silencieusement le début de l'historique — le modèle « oublie » sans le signaler. -->
  <div v-if="numCtx" class="flex items-center gap-2 text-[11px]" :title="tooltip">
    <div
      class="h-1.5 w-24 overflow-hidden rounded-full border border-bc-border bg-bc-surface-alt"
      role="meter"
      :aria-valuenow="used"
      aria-valuemin="0"
      :aria-valuemax="numCtx"
      aria-label="Contexte utilisé"
    >
      <div class="h-full rounded-full" :class="barClass" :style="{ width: Math.min(100, ratio * 100) + '%' }" />
    </div>
    <span class="font-mono" :class="textClass">≈ {{ fmt(used) }} / {{ fmt(numCtx) }} tokens</span>
    <span v-if="ratio >= 1" class="text-bc-danger">contexte dépassé : le début de la conversation sera oublié</span>
    <span v-else-if="ratio >= WARN" class="text-bc-warning">contexte presque plein</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  conversation: { type: Object, required: true },
  draft: { type: String, default: '' },
  numCtx: { type: Number, default: null }, // contexte effectif : réglé dans la conversation, sinon celui du modèle
})

const WARN = 0.8
// Ollama n'expose pas de comptage de tokens : estimation à ~3,5 caractères par token (prudente pour le
// français et le code ; l'anglais est plutôt à 4)
const estimate = (text) => Math.ceil((text?.length ?? 0) / 3.5)
const fmt = (n) => n.toLocaleString('fr-FR')

// Base : le compte RÉEL du dernier échange (tokens du prompt envoyé, mesurés par Ollama) + la réponse qui a
// suivi (estimée : son compte réel inclut la réflexion, qui n'est pas renvoyée dans l'historique). Puis estimation
// de ce qui vient après (messages sans stats, message en cours de saisie). Sans échange mesuré : tout estimé.
const used = computed(() => {
  const msgs = props.conversation.messages.filter((m) => !m.error)
  let lastMeasured = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && msgs[i].stats?.prompt_tokens != null) { lastMeasured = i; break }
  }
  let total
  let rest
  if (lastMeasured >= 0) {
    total = msgs[lastMeasured].stats.prompt_tokens + estimate(msgs[lastMeasured].content)
    rest = msgs.slice(lastMeasured + 1)
  } else {
    total = estimate(props.conversation.system)
    rest = msgs
  }
  // ~4 tokens d'enrobage par message (balises de rôle du template)
  for (const m of rest) total += estimate(m.content) + 4
  if (props.draft.trim()) total += estimate(props.draft) + 4
  return total
})

const ratio = computed(() => (props.numCtx ? used.value / props.numCtx : 0))
const barClass = computed(() => (ratio.value >= 1 ? 'bg-bc-danger' : ratio.value >= WARN ? 'bg-bc-warning' : 'bg-bc-green-dark'))
const textClass = computed(() => (ratio.value >= 1 ? 'text-bc-danger' : ratio.value >= WARN ? 'text-bc-warning' : 'text-bc-text-secondary'))
const tooltip = computed(() =>
  'Taille estimée de la prochaine requête (prompt système + historique + message en cours) par rapport au contexte. '
  + 'La réponse du modèle doit aussi y tenir. Au-delà, Ollama supprime le début de l\'historique sans prévenir : '
  + 'le modèle oublie le début de la conversation.'
)
</script>
