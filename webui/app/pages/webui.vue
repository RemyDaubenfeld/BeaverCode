<template>
  <div class="flex h-full gap-5 px-6 pb-6">
    <!-- Conversations enregistrées -->
    <ChatConversationList
      class="hidden w-60 shrink-0 lg:flex"
      :conversations="conversations"
      :current-id="conversation?.id ?? null"
      :disabled="streaming"
      @new="newConversation()"
      @open="openConversation"
      @delete="deleteConversation"
      @rename="renameConversation"
    />

    <!-- Fil de la conversation + saisie -->
    <section v-if="conversation" class="flex min-w-0 flex-1 flex-col rounded-bc border-2 border-bc-border-strong bg-bc-surface shadow-bc-hard">
      <header class="flex items-center gap-3 border-b border-bc-border px-4 py-2.5">
        <ChatTitleInput
          v-if="editingTitle"
          :value="conversation.title"
          class="font-display flex-1 font-semibold"
          @save="(title) => { editingTitle = false; renameConversation(conversation.id, title) }"
          @cancel="editingTitle = false"
        />
        <h1 v-else class="min-w-0 flex-1">
          <button
            type="button"
            @click="editingTitle = true"
            title="Renommer la conversation"
            class="group flex max-w-full items-center gap-1.5 rounded-md text-left cursor-pointer"
          >
            <span class="font-display truncate text-sm font-semibold text-bc-text-primary">{{ conversation.title }}</span>
            <PencilSquareIcon class="h-3.5 w-3.5 shrink-0 text-bc-text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        </h1>
        <button
          type="button"
          @click="showSettings = !showSettings"
          :aria-pressed="showSettings"
          title="Modèle, réflexion, prompt système, réglages"
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-pointer"
          :class="showSettings ? 'bg-bc-surface-alt text-bc-text-primary' : 'text-bc-text-secondary hover:text-bc-text-primary hover:bg-bc-surface-alt'"
        >
          <AdjustmentsHorizontalIcon class="h-4 w-4" />
          <span class="font-mono">{{ conversation.model ?? 'aucun modèle' }}</span>
        </button>
      </header>

      <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto px-4 py-4" @scroll="onScroll">
        <div v-if="!conversation.messages.length" class="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-bc-text-secondary">
          <ChatBubbleLeftRightIcon class="h-8 w-8 text-bc-text-muted" />
          <p>Discute avec un modèle installé pour le tester à la main.</p>
          <p class="text-xs">Entrée pour envoyer · Maj + Entrée pour un retour à la ligne</p>
        </div>
        <div v-else class="mx-auto max-w-3xl space-y-5">
          <ChatMessage
            v-for="(message, i) in conversation.messages"
            :key="i"
            :message="message"
            :live="streaming && i === conversation.messages.length - 1"
          />
        </div>
      </div>

      <div class="border-t border-bc-border px-4 py-3">
        <p v-if="errorMessage" class="mx-auto mb-2 max-w-3xl text-sm text-bc-danger">{{ errorMessage }}</p>
        <div class="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref="input"
            v-model="draft"
            rows="1"
            :placeholder="conversation.model ? `Message à ${conversation.model}…` : 'Choisis d\'abord un modèle (bouton en haut à droite)'"
            :disabled="!conversation.model"
            @keydown.enter.exact.prevent="submit"
            @input="autoGrow"
            class="max-h-48 min-h-[2.5rem] flex-1 resize-none rounded-bc border-2 border-bc-border-strong bg-bc-surface-alt px-3 py-2 text-sm text-bc-text-primary placeholder:text-bc-text-muted focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            v-if="canRegenerate"
            type="button"
            @click="regenerate({ think: thinkParam })"
            :disabled="!!settingsError"
            title="Régénérer la dernière réponse (avec le modèle et les réglages actuels)"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-bc border-2 border-bc-border-strong bg-bc-surface text-bc-orange-light shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowPathIcon class="h-4 w-4" />
          </button>
          <button
            v-if="streaming"
            type="button"
            @click="stop"
            class="h-10 shrink-0 rounded-bc border-2 border-bc-border-strong bg-bc-danger px-4 text-sm font-semibold text-bc-paper shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
          >
            Arrêter
          </button>
          <button
            v-else
            type="button"
            @click="submit"
            :disabled="!canSend"
            :title="settingsError || ''"
            class="h-10 shrink-0 rounded-bc border-2 border-bc-border-strong bg-bc-orange px-4 text-sm font-semibold text-bc-ink shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
          >
            Envoyer
          </button>
        </div>
      </div>
    </section>

    <!-- Réglages de la conversation -->
    <ChatSettings
      v-if="conversation && showSettings"
      ref="settings"
      class="w-72 shrink-0 overflow-y-auto rounded-bc border-2 border-bc-border-strong bg-bc-surface p-4 shadow-bc-hard"
      :conversation="conversation"
      :disabled="streaming"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { AdjustmentsHorizontalIcon, ArrowPathIcon, ChatBubbleLeftRightIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'

const {
  conversations, conversation, streaming, errorMessage, canRegenerate,
  newConversation, loadConversations, openConversation, deleteConversation, renameConversation, send, regenerate, stop,
} = useChat()
const { modelName, modelList } = useModels()

const draft = ref('')
const editingTitle = ref(false)
const showSettings = ref(true)
const settings = ref(null)
const scroller = ref(null)
const input = ref(null)

onMounted(() => {
  loadConversations()
  if (!conversation.value) newConversation()
})

// pas encore de modèle choisi : le modèle chargé en mémoire s'il y en a un (réponse immédiate), sinon le premier
watch([modelList, conversation], () => {
  const c = conversation.value
  if (!c || c.model || !modelList.value?.length) return
  const chat = modelList.value.filter((m) => m.capabilities?.includes('completion'))
  c.model = chat.find((m) => m.name === modelName.value)?.name ?? chat[0]?.name ?? null
}, { immediate: true })

const canThinkModel = computed(() =>
  !!modelList.value?.find((m) => m.name === conversation.value?.model)?.capabilities?.includes('thinking')
)
// true/false pour un modèle à réflexion ; null sinon (paramètre non envoyé : Ollama refuse `think` pour un modèle qui n'a pas la capacité)
const thinkParam = computed(() => (canThinkModel.value ? conversation.value.think : null))

const settingsError = computed(() => settings.value?.optionsError ?? '')
const canSend = computed(() => !!conversation.value?.model && !!draft.value.trim() && !settingsError.value && !streaming.value)

async function submit() {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  await nextTick()
  autoGrow()
  stickToBottom = true
  await send(text, { think: thinkParam.value })
  input.value?.focus()
}

function autoGrow() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// --- Défilement : suit la réponse en cours tant que l'utilisateur est en bas du fil ; s'il remonte lire
// plus haut, on ne le ramène pas de force
let stickToBottom = true
function onScroll() {
  const el = scroller.value
  if (el) stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
function scrollToBottom() {
  const el = scroller.value
  if (el && stickToBottom) el.scrollTop = el.scrollHeight
}
const lastMessage = computed(() => {
  const m = conversation.value?.messages.at(-1)
  return m ? `${conversation.value.messages.length}:${m.content.length}:${m.thinking?.length ?? 0}` : ''
})
watch(lastMessage, () => nextTick(scrollToBottom))
watch(() => conversation.value?.id, () => {
  editingTitle.value = false
  stickToBottom = true
  nextTick(scrollToBottom)
})
</script>
