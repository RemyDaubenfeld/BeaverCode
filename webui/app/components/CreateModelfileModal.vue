<template>
  <Modal @close="emit('close')">
    <template #header>Créer un modelfile</template>

    <p class="text-xs text-bc-text-muted mb-4">
      Un modelfile = un profil réutilisable (paramètres + system prompt), sans modèle de base
      figé — tu choisiras le modèle de base au moment de créer un modèle avec.
    </p>

    <input
      v-model="filename"
      type="text"
      placeholder="Nom du modelfile (ex: coder)"
      class="w-full mb-4 px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
    />

    <div class="grid grid-cols-2 gap-3 mb-4">
      <label class="text-xs text-bc-text-secondary">
        Contexte (num_ctx)
        <input v-model="params.num_ctx" type="number" placeholder="4096" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
      <label class="text-xs text-bc-text-secondary">
        Tokens générés (num_predict)
        <input v-model="params.num_predict" type="number" placeholder="4096" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
      <label class="text-xs text-bc-text-secondary">
        Threads CPU (num_thread)
        <input v-model="params.num_thread" type="number" placeholder="6" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
      <label class="text-xs text-bc-text-secondary">
        Batch (num_batch)
        <input v-model="params.num_batch" type="number" placeholder="512" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
      <label class="text-xs text-bc-text-secondary">
        Température
        <input v-model="params.temperature" type="number" step="0.1" placeholder="0.7" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
      <label class="text-xs text-bc-text-secondary">
        top_p
        <input v-model="params.top_p" type="number" step="0.1" placeholder="0.9" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
      <label class="text-xs text-bc-text-secondary">
        top_k
        <input v-model="params.top_k" type="number" placeholder="40" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
      <label class="text-xs text-bc-text-secondary">
        presence_penalty
        <input v-model="params.presence_penalty" type="number" step="0.1" placeholder="1.5" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
      </label>
    </div>

    <label class="block text-xs text-bc-text-secondary mb-4">
      Stop (séparés par des virgules)
      <input v-model="stopTokens" type="text" placeholder="&lt;|im_end|&gt;, &lt;|im_start|&gt;" class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary font-mono" />
    </label>

    <label class="block text-xs text-bc-text-secondary mb-4">
      System prompt
      <textarea
        v-model="system"
        rows="8"
        placeholder="Tu es un assistant..."
        class="mt-1 w-full px-3 py-2 rounded-bc bg-bc-surface-alt border border-bc-border text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange resize-y"
      ></textarea>
    </label>

    <p v-if="error" class="text-sm text-bc-danger mb-3">{{ error }}</p>

    <button
      @click="submit"
      :disabled="saving"
      class="w-full px-3 py-2 text-sm rounded-bc font-display font-semibold bg-bc-orange text-bc-ink border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:border-bc-border disabled:shadow-none disabled:cursor-not-allowed"
    >
      {{ saving ? 'Enregistrement…' : 'Créer le modelfile' }}
    </button>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const emit = defineEmits(['close', 'create-success'])

const filename = ref('')
const params = reactive({
  num_ctx: '',
  num_predict: '',
  num_thread: '',
  num_batch: '',
  temperature: '',
  top_p: '',
  top_k: '',
  presence_penalty: '',
})
const stopTokens = ref('')
const system = ref('')
const saving = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!filename.value.trim()) {
    error.value = 'Indique un nom pour le modelfile.'
    return
  }

  const parameters = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null) parameters[key] = Number(value)
  }
  const stops = stopTokens.value.split(',').map((s) => s.trim()).filter(Boolean)
  if (stops.length) parameters.stop = stops

  saving.value = true
  try {
    const res = await $fetch('/api/modelfiles/save', {
      method: 'POST',
      body: { filename: filename.value.trim(), parameters, system: system.value },
    })
    emit('create-success', res.filename)
    emit('close')
  } catch (e) {
    error.value = e.data?.statusMessage ?? "Erreur lors de l'enregistrement"
  } finally {
    saving.value = false
  }
}
</script>
