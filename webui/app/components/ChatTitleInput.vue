<template>
  <!-- Champ de renommage d'une conversation : Entrée ou clic ailleurs = valider, Échap = annuler -->
  <input
    ref="field"
    v-model="draft"
    type="text"
    maxlength="200"
    aria-label="Nouveau titre de la conversation"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @blur="commit"
    class="min-w-0 rounded-md border border-bc-orange bg-bc-surface-alt px-1.5 py-0.5 text-sm text-bc-text-primary focus:outline-none"
  />
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'

const props = defineProps({ value: { type: String, required: true } })
const emit = defineEmits(['save', 'cancel'])

const draft = ref(props.value)
const field = ref(null)
let done = false // Entrée puis blur (le champ disparaît) : ne valider qu'une fois

onMounted(async () => {
  await nextTick()
  field.value?.focus()
  field.value?.select()
})

function commit() {
  if (done) return
  done = true
  const title = draft.value.trim()
  // titre vide ou inchangé : simple annulation
  if (!title || title === props.value) emit('cancel')
  else emit('save', title)
}

function cancel() {
  if (done) return
  done = true
  emit('cancel')
}
</script>
