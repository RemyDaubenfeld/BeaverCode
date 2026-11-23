<template>
  <Modal size="lg" @close="emit('close')">
    <template #header>Requête brute</template>

    <p class="mb-3 text-xs leading-relaxed text-bc-text-secondary">
      Ce que BeaverCode a envoyé à Ollama (<span class="font-mono">POST /api/chat</span>) pour cette réponse, et le
      dernier morceau renvoyé par Ollama. Le template montre comment le modèle met en forme les messages ; Ollama ne
      renvoie pas le texte final une fois le template appliqué.
    </p>

    <div class="space-y-4">
      <section v-for="block in blocks" :key="block.title">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <h3 class="font-display text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">{{ block.title }}</h3>
          <button
            type="button"
            @click="copy(block)"
            class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-bc-text-secondary hover:bg-bc-surface-alt hover:text-bc-text-primary cursor-pointer"
          >
            <ClipboardDocumentIcon class="h-3.5 w-3.5" />
            {{ copied === block.title ? 'copié' : 'copier' }}
          </button>
        </div>
        <p v-if="block.note" class="mb-1.5 text-xs text-bc-text-secondary">{{ block.note }}</p>
        <pre class="max-h-72 overflow-auto rounded-bc border-2 border-bc-border-strong bg-bc-ink p-3 font-mono text-[11px] leading-relaxed text-bc-text-primary shadow-bc-hard-sm">{{ block.text }}</pre>
      </section>
    </div>
  </Modal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ClipboardDocumentIcon } from '@heroicons/vue/24/outline'
import Modal from './Modal.vue'

const props = defineProps({
  exchange: { type: Object, required: true }, // { request, done } — voir rawExchanges dans useChat.js
  template: { type: String, default: null }, // template du modèle (fiche du modèle, /api/show)
})
const emit = defineEmits(['close'])

const ns = (v) => (v == null ? null : `${(v / 1e9).toFixed(2)} s`)

const blocks = computed(() => {
  const list = [{ title: 'Requête envoyée', text: JSON.stringify(props.exchange.request, null, 2) }]
  const d = props.exchange.done
  if (d) {
    list.push({
      title: 'Dernier morceau de la réponse',
      // durées d'Ollama en nanosecondes : traduites en secondes pour la lecture
      note: `Durées : total ${ns(d.total_duration)}, chargement ${ns(d.load_duration)}, lecture du prompt ${ns(d.prompt_eval_duration)}, génération ${ns(d.eval_duration)}.`,
      text: JSON.stringify(d, null, 2),
    })
  } else {
    list.push({ title: 'Dernier morceau de la réponse', text: 'Pas de morceau final : génération arrêtée, ou erreur avant la fin.' })
  }
  if (props.template) list.push({ title: 'Template du modèle', text: props.template })
  return list
})

const copied = ref(null)
async function copy(block) {
  try {
    await navigator.clipboard.writeText(block.text)
    copied.value = block.title
    setTimeout(() => { if (copied.value === block.title) copied.value = null }, 1500)
  } catch {
    // presse-papiers refusé : rien à faire de plus
  }
}
</script>
