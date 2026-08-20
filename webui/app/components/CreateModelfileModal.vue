<template>
  <Modal @close="emit('close')">
    <template #header>Créer un modelfile</template>

    <p class="text-xs text-gray-500 mb-4">
      Un modelfile = un profil réutilisable (paramètres + system prompt), sans modèle de base
      figé — tu choisiras le modèle de base au moment de créer un modèle avec.
    </p>

    <input
      v-model="filename"
      type="text"
      placeholder="Nom du modelfile (ex: coder)"
      class="w-full mb-4 px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-white/30"
    />

    <div class="grid grid-cols-2 gap-3 mb-4">
      <label class="text-xs text-gray-400">
        Contexte (num_ctx)
        <input v-model="params.num_ctx" type="number" placeholder="4096" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
      <label class="text-xs text-gray-400">
        Tokens générés (num_predict)
        <input v-model="params.num_predict" type="number" placeholder="4096" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
      <label class="text-xs text-gray-400">
        Threads CPU (num_thread)
        <input v-model="params.num_thread" type="number" placeholder="6" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
      <label class="text-xs text-gray-400">
        Batch (num_batch)
        <input v-model="params.num_batch" type="number" placeholder="512" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
      <label class="text-xs text-gray-400">
        Température
        <input v-model="params.temperature" type="number" step="0.1" placeholder="0.7" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
      <label class="text-xs text-gray-400">
        top_p
        <input v-model="params.top_p" type="number" step="0.1" placeholder="0.9" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
      <label class="text-xs text-gray-400">
        top_k
        <input v-model="params.top_k" type="number" placeholder="40" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
      <label class="text-xs text-gray-400">
        presence_penalty
        <input v-model="params.presence_penalty" type="number" step="0.1" placeholder="1.5" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
      </label>
    </div>

    <label class="block text-xs text-gray-400 mb-4">
      Stop (séparés par des virgules)
      <input v-model="stopTokens" type="text" placeholder="&lt;|im_end|&gt;, &lt;|im_start|&gt;" class="mt-1 w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-gray-200" />
    </label>

    <label class="block text-xs text-gray-400 mb-4">
      System prompt
      <textarea
        v-model="system"
        rows="8"
        placeholder="Tu es un assistant..."
        class="mt-1 w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-white/30 resize-y"
      ></textarea>
    </label>

    <p v-if="error" class="text-sm text-red-400 mb-3">{{ error }}</p>

    <button
      @click="submit"
      :disabled="saving"
      class="w-full px-3 py-2 text-sm rounded bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"
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
