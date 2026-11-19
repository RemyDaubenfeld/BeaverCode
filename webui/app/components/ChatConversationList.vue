<template>
  <nav class="flex min-h-0 flex-col" aria-label="Conversations">
    <button
      type="button"
      @click="emit('new')"
      :disabled="disabled"
      class="mb-3 flex items-center justify-center gap-1.5 rounded-bc border-2 border-bc-border-strong bg-bc-orange px-3 py-1.5 text-sm font-semibold text-bc-ink shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
    >
      <PlusIcon class="h-4 w-4" />
      Nouvelle conversation
    </button>

    <p v-if="!conversations.length" class="px-1 text-xs text-bc-text-secondary">Aucune conversation enregistrée.</p>

    <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
      <li v-for="c in conversations" :key="c.id">
        <div
          class="group flex items-center gap-1 rounded-bc border px-2 py-1.5"
          :class="c.id === currentId ? 'border-bc-orange bg-bc-orange-tint' : 'border-transparent hover:bg-bc-surface-alt'"
        >
          <ChatTitleInput
            v-if="editingId === c.id"
            :value="c.title"
            class="flex-1"
            @save="(title) => { editingId = null; emit('rename', c.id, title) }"
            @cancel="editingId = null"
          />
          <button
            v-else
            type="button"
            @click="emit('open', c.id)"
            @dblclick="editingId = c.id"
            :disabled="disabled"
            class="min-w-0 flex-1 rounded-md text-left disabled:cursor-not-allowed cursor-pointer"
            :title="c.title"
          >
            <span class="block truncate text-sm" :class="c.id === currentId ? 'text-bc-text-primary' : 'text-bc-text-secondary'">{{ c.title }}</span>
            <span class="block truncate font-mono text-[10px] text-bc-text-secondary">{{ formatDate(c.updated_at) }} · {{ c.model ?? '—' }}</span>
          </button>
          <button
            v-if="editingId !== c.id"
            type="button"
            @click="editingId = c.id"
            title="Renommer la conversation"
            class="shrink-0 rounded-md p-1 text-bc-text-secondary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-bc-text-primary cursor-pointer"
          >
            <PencilSquareIcon class="h-3.5 w-3.5" />
          </button>
          <!-- suppression en deux temps, sans confirm() : 1er clic arme, 2e clic supprime -->
          <button
            type="button"
            @click="onDelete(c.id)"
            :disabled="disabled"
            :title="armedId === c.id ? 'Cliquer encore pour supprimer' : 'Supprimer la conversation'"
            class="shrink-0 rounded-md p-1 cursor-pointer disabled:cursor-not-allowed"
            :class="armedId === c.id ? 'bg-bc-danger text-bc-paper' : 'text-bc-danger/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-bc-danger'"
          >
            <TrashIcon class="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { ref } from 'vue'
import { PlusIcon, TrashIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'

defineProps({
  conversations: { type: Array, required: true },
  currentId: { type: String, default: null },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['new', 'open', 'delete', 'rename'])

const editingId = ref(null) // conversation en cours de renommage (crayon ou double-clic)

const armedId = ref(null)
let disarmTimer = null

function onDelete(id) {
  if (armedId.value === id) {
    armedId.value = null
    emit('delete', id)
    return
  }
  armedId.value = id
  clearTimeout(disarmTimer)
  disarmTimer = setTimeout(() => { armedId.value = null }, 3000)
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
</script>
