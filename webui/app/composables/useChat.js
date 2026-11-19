import { ref, computed } from 'vue'

// État du chat manuel (page WebUI), au niveau du module comme useBenchmarkRun.js : une réponse en cours de
// génération continue de s'afficher si on change de page et qu'on revient (le flux HTTP n'est pas coupé par
// la navigation, seulement par « Arrêter »).
//
// Une conversation est construite ici puis enregistrée EN ENTIER côté serveur (PUT) après chaque réponse —
// le serveur ne garde aucun état entre deux requêtes.

const conversations = ref([]) // résumés { id, title, model, message_count, updated_at }
const conversation = ref(null) // conversation ouverte (voir newConversation)
const streaming = ref(false)
const errorMessage = ref('')
let abortController = null

const DEFAULT_TITLE = 'Nouvelle conversation'
const DEFAULT_OPTIONS = () => ({ temperature: null, num_ctx: null, num_predict: null }) // null = valeur du modèle

function newId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
}

function newConversation(model = null) {
  // reprend les réglages de la conversation précédente : on enchaîne souvent plusieurs essais avec le même modèle
  const previous = conversation.value
  conversation.value = {
    id: newId(),
    title: DEFAULT_TITLE,
    model: model ?? previous?.model ?? null,
    system: previous?.system ?? '',
    options: previous ? { ...previous.options } : DEFAULT_OPTIONS(),
    think: previous?.think ?? true,
    messages: [],
    created_at: new Date().toISOString(),
  }
  errorMessage.value = ''
}

async function loadConversations() {
  try {
    conversations.value = await $fetch('/api/chat/conversations')
  } catch {
    conversations.value = []
  }
}

async function openConversation(id) {
  if (streaming.value) return
  errorMessage.value = ''
  try {
    conversation.value = await $fetch(`/api/chat/conversations/${id}`)
  } catch (e) {
    errorMessage.value = e.data?.statusMessage ?? 'Impossible d\'ouvrir la conversation'
  }
}

async function deleteConversation(id) {
  await $fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' })
  if (conversation.value?.id === id) newConversation()
  await loadConversations()
}

// Renomme une conversation, ouverte ou non. Pas encore enregistrée (aucune réponse) : titre changé localement,
// il partira avec le premier enregistrement.
async function renameConversation(id, title) {
  const clean = (title ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
  if (!clean) return
  if (conversation.value?.id === id) conversation.value.title = clean
  const summary = conversations.value.find((c) => c.id === id)
  if (!summary) return
  const previous = summary.title
  summary.title = clean
  try {
    await $fetch(`/api/chat/conversations/${id}`, { method: 'PATCH', body: { title: clean } })
  } catch (e) {
    summary.title = previous
    if (conversation.value?.id === id) conversation.value.title = previous
    errorMessage.value = e.data?.statusMessage ?? 'Renommage impossible'
  }
}

async function saveConversation() {
  const c = conversation.value
  if (!c?.messages.length) return // conversation vide : rien à garder
  try {
    await $fetch(`/api/chat/conversations/${c.id}`, { method: 'PUT', body: c })
    await loadConversations()
  } catch (e) {
    errorMessage.value = e.data?.statusMessage ?? 'Conversation non enregistrée'
  }
}

// Stats d'une réponse, à partir du dernier morceau d'Ollama (durées en nanosecondes) et du TTFT mesuré ici
function buildStats(done, ttftSec, model) {
  const s = (ns) => (ns ? ns / 1e9 : null)
  const evalSec = s(done.eval_duration)
  return {
    model,
    tokens: done.eval_count ?? null,
    tokens_per_sec: done.eval_count && evalSec ? Math.round((done.eval_count / evalSec) * 10) / 10 : null,
    prompt_tokens: done.prompt_eval_count ?? null,
    // TTFT côté navigateur : envoi → premier morceau de texte ou de réflexion (chargement du modèle compris)
    ttft_sec: ttftSec,
    load_sec: s(done.load_duration),
    total_sec: s(done.total_duration),
    done_reason: done.done_reason ?? null, // « length » = coupé par la limite de tokens ou de contexte
  }
}

// `think` : true/false pour un modèle à réflexion, null sinon (paramètre non envoyé à Ollama)
async function send(text, { think }) {
  const c = conversation.value
  if (!c || streaming.value || !c.model) return
  if (text != null) {
    const content = text.trim()
    if (!content) return
    c.messages.push({ role: 'user', content })
    // titre automatique tiré du premier message, sauf si la conversation a déjà été renommée
    if (c.messages.length === 1 && c.title === DEFAULT_TITLE) c.title = content.replace(/\s+/g, ' ').slice(0, 60)
  }
  await generate(think)
}

// Régénère la dernière réponse (même historique, éventuellement un autre modèle ou d'autres réglages)
async function regenerate({ think }) {
  const c = conversation.value
  if (!c || streaming.value) return
  if (c.messages.at(-1)?.role === 'assistant') c.messages.pop()
  if (c.messages.at(-1)?.role !== 'user') return
  await generate(think)
}

async function generate(think) {
  const c = conversation.value
  errorMessage.value = ''
  streaming.value = true
  // historique envoyé AVANT d'ajouter la réponse en cours ; les réponses en erreur n'en font pas partie
  const history = c.messages
    .filter((m) => !m.error)
    .map((m) => ({ role: m.role, content: m.content }))
  c.messages.push({ role: 'assistant', content: '', thinking: '', model: c.model })
  const reply = c.messages.at(-1) // objet réactif : chaque morceau reçu met l'affichage à jour

  abortController = new AbortController()
  const startedAt = performance.now()
  let ttftSec = null
  let lastChunk = null

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: c.model, messages: history, system: c.system, options: c.options, think }),
      signal: abortController.signal,
    })
    if (!response.ok || !response.body) {
      const detail = await response.json().catch(() => null)
      throw new Error(detail?.statusMessage || detail?.message || 'Échec de la requête de chat')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const chunk = JSON.parse(line)
        // erreur en cours de flux (ex. CUDA out of memory) : Ollama envoie {"error": "..."} après un statut 200
        if (chunk.error) throw new Error(chunk.error)
        const piece = chunk.message?.content ?? ''
        const thought = chunk.message?.thinking ?? ''
        if ((piece || thought) && ttftSec === null) ttftSec = (performance.now() - startedAt) / 1000
        reply.content += piece
        reply.thinking += thought
        if (chunk.done) lastChunk = chunk
      }
    }
    if (lastChunk) reply.stats = buildStats(lastChunk, ttftSec, c.model)
  } catch (e) {
    if (e.name === 'AbortError') {
      reply.stats = { model: c.model, ttft_sec: ttftSec, total_sec: (performance.now() - startedAt) / 1000, done_reason: 'stopped' }
    } else {
      reply.error = e.message ?? 'Erreur pendant la génération'
    }
  } finally {
    if (!reply.thinking) delete reply.thinking
    streaming.value = false
    abortController = null
    await saveConversation()
  }
}

function stop() {
  abortController?.abort()
}

const canRegenerate = computed(() => {
  const msgs = conversation.value?.messages ?? []
  return !streaming.value && msgs.length >= 2 && msgs.at(-1).role === 'assistant'
})

export function useChat() {
  return {
    conversations,
    conversation,
    streaming,
    errorMessage,
    canRegenerate,
    newConversation,
    loadConversations,
    openConversation,
    deleteConversation,
    renameConversation,
    send,
    regenerate,
    stop,
  }
}
