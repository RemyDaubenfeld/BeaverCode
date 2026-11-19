<template>
  <aside class="flex flex-col gap-5 text-sm">
    <!-- Modèle -->
    <div>
      <label for="chat-model" class="font-display mb-1.5 block text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">Modèle</label>
      <select
        id="chat-model"
        v-model="conversation.model"
        :disabled="disabled"
        class="w-full rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1.5 font-mono text-xs text-bc-text-primary focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option :value="null" disabled>Choisir un modèle…</option>
        <option v-for="m in chatModels" :key="m.name" :value="m.name">{{ m.name }}</option>
      </select>
      <p v-if="conversation.model && !modelInstalled" class="mt-1 text-xs text-bc-warning">
        Ce modèle n'est plus installé : choisis-en un autre pour continuer.
      </p>
      <div v-if="capabilities.length" class="mt-1.5 flex flex-wrap gap-1">
        <span
          v-for="cap in capabilities"
          :key="cap"
          class="rounded-md border border-bc-border bg-bc-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-bc-text-secondary"
        >{{ cap }}</span>
      </div>
    </div>

    <!-- Réflexion (modèles thinking uniquement) -->
    <div v-if="canThink">
      <label class="flex cursor-pointer select-none items-center justify-between gap-3">
        <span>
          <span class="font-display block text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">Réflexion</span>
          <span class="text-xs text-bc-text-secondary">{{ conversation.think ? 'Le modèle réfléchit avant de répondre' : 'Réponse directe, sans réflexion' }}</span>
        </span>
        <input v-model="conversation.think" type="checkbox" :disabled="disabled" class="h-4 w-4 accent-bc-orange disabled:cursor-not-allowed" />
      </label>
    </div>

    <!-- Prompt système -->
    <div>
      <label for="chat-system" class="font-display mb-1.5 block text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">Prompt système</label>
      <textarea
        id="chat-system"
        v-model="conversation.system"
        :disabled="disabled"
        rows="5"
        placeholder="Vide : prompt système du modèle (modelfile)"
        class="w-full resize-y rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1.5 text-xs text-bc-text-primary placeholder:text-bc-text-muted focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>

    <!-- Réglages de génération : null = valeur du modèle -->
    <div>
      <h3 class="font-display mb-1.5 text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">Génération</h3>
      <div class="space-y-2.5">
        <div v-for="field in fields" :key="field.key">
          <div class="mb-1 flex items-center justify-between gap-2">
            <label :for="`chat-${field.key}`" class="text-xs text-bc-text-secondary" :title="field.help">{{ field.label }}</label>
            <label class="flex cursor-pointer select-none items-center gap-1.5 text-xs text-bc-text-secondary">
              <input
                type="checkbox"
                class="accent-bc-orange"
                :disabled="disabled"
                :checked="conversation.options[field.key] === null"
                @change="toggleModelValue(field, $event.target.checked)"
              />
              valeur du modèle
            </label>
          </div>
          <input
            :id="`chat-${field.key}`"
            v-model.number="conversation.options[field.key]"
            type="number"
            :min="field.min" :max="field.max" :step="field.step"
            :disabled="disabled || conversation.options[field.key] === null"
            :placeholder="modelValueText(field)"
            class="w-full rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1 font-mono text-xs text-bc-text-primary placeholder:text-bc-text-muted focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
      <p v-if="optionsError" class="mt-1.5 text-xs text-bc-danger">{{ optionsError }}</p>
      <p class="mt-2 text-xs leading-relaxed text-bc-text-secondary">
        Changer le contexte recharge le modèle. Pour un modèle à réflexion, la réflexion compte dans « Tokens max ».
      </p>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  conversation: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})

const { modelList } = useModels()

// modèles capables de converser (pas les modèles d'embedding seuls)
const chatModels = computed(() => (modelList.value ?? []).filter((m) => m.capabilities?.includes('completion')))
const current = computed(() => modelList.value?.find((m) => m.name === props.conversation.model) ?? null)
const modelInstalled = computed(() => !modelList.value || !!current.value)
const capabilities = computed(() => current.value?.capabilities ?? [])
const canThink = computed(() => capabilities.value.includes('thinking'))

const fields = [
  { key: 'temperature', label: 'Température', min: 0, max: 2, step: 0.1, fallback: 0.7, help: 'Plus haute : réponses plus variées ; plus basse : plus prévisibles' },
  { key: 'num_ctx', label: 'Contexte (num_ctx)', min: 512, max: 262144, step: 1024, fallback: 8192, help: 'Taille de la mémoire de la conversation en tokens ; plus grande = plus de VRAM' },
  { key: 'num_predict', label: 'Tokens max', min: 16, max: 32768, step: 256, fallback: 4096, help: 'Longueur maximale d\'une réponse (réflexion comprise)' },
]

function toggleModelValue(field, useModel) {
  props.conversation.options[field.key] = useModel ? null : field.fallback
}

function modelValueText(field) {
  return field.key === 'num_predict' ? 'illimité (valeur du modèle)' : 'valeur du modèle'
}

// mêmes bornes que la validation serveur (chat.service.ts)
const optionsError = computed(() => {
  for (const f of fields) {
    const v = props.conversation.options[f.key]
    if (v === null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max || (f.key !== 'temperature' && !Number.isInteger(v))) {
      return `${f.label} : entre ${f.min} et ${f.max}${f.key !== 'temperature' ? ' (nombre entier)' : ''}.`
    }
  }
  return ''
})

defineExpose({ optionsError, canThink })
</script>
