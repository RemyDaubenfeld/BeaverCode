// Téléchargements de modèles, partagés entre la modale Bibliothèque et la page Modèles :
// l'état survit à la fermeture de la modale et au changement de page.
// Les pulls passent par une file d'attente : un seul téléchargement actif à la fois,
// pour que toute la bande passante aille au modèle en cours.
// Les AbortController et la file ne sont pas sérialisables, ils restent hors du useState.
const controllers = new Map()
const waiting = [] // { tag, resolve }
let running = false

// Messages d'erreur de HuggingFace (en anglais, relayés tels quels par Ollama) → explication en français,
// le message d'origine gardé à la fin. Messages constatés le 25/11 sur les dépôts concernés.
const PULL_ERROR_HINTS = [
  [/specified tag is not available/i, "aucun modèle de ce dépôt ne porte cette quantification (souvent un fichier annexe — brouillon, projecteur vision — pris pour une quantification)"],
  [/not a valid quantization scheme/i, "HuggingFace refuse ce nom de quantification (il n'accepte que les noms de llama.cpp, ex. Q4_K_M plutôt que Q4_K ou Q4_K_L)"],
  [/sharded GGUF/i, "fichier découpé en plusieurs morceaux : Ollama ne sait pas encore les télécharger depuis HuggingFace"],
  [/not GGUF or is not compatible/i, "ce dépôt ne contient pas de modèle GGUF utilisable par llama.cpp"],
  [/rate limit/i, "HuggingFace limite temporairement les requêtes depuis ta connexion : réessayer dans quelques minutes"],
]

function explainPullError(message) {
  const hint = PULL_ERROR_HINTS.find(([pattern]) => pattern.test(message))
  return hint ? `${hint[1]} (« ${message} »)` : message
}

export function usePulls() {
  // tag -> { tag, progress, status, error, queued }
  const pulls = useState('model-pulls', () => ({}))

  // Ajoute un pull à la file ; la promesse se résout (true/false) quand ce pull se termine
  function startPull(tag) {
    const existing = pulls.value[tag]
    if (existing && !existing.error) return Promise.resolve(false)

    pulls.value[tag] = { tag, progress: 0, status: 'En attente', error: '', queued: true }
    return new Promise((resolve) => {
      waiting.push({ tag, resolve })
      processQueue()
    })
  }

  async function processQueue() {
    if (running || waiting.length === 0) return
    running = true
    const job = waiting.shift()
    const ok = await runPull(job.tag)
    job.resolve(ok)
    running = false
    processQueue()
  }

  async function runPull(tag) {
    const controller = new AbortController()
    controllers.set(tag, controller)
    Object.assign(pulls.value[tag], { queued: false, status: 'Démarrage…' })

    try {
      const response = await fetch(`/api/library/pull?model=${encodeURIComponent(tag)}`, {
        method: 'POST',
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error('Échec du téléchargement')

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
          const data = JSON.parse(line)
          if (data.error) throw new Error(explainPullError(data.error))
          const entry = pulls.value[tag]
          if (data.status) entry.status = data.status
          if (data.total && data.completed) {
            entry.progress = Math.round((data.completed / data.total) * 100)
          }
        }
      }

      delete pulls.value[tag]
      return true
    } catch (e) {
      if (controller.signal.aborted) {
        delete pulls.value[tag]
      } else if (pulls.value[tag]) {
        pulls.value[tag].error = e.message ?? 'Erreur lors du téléchargement'
      }
      return false
    } finally {
      controllers.delete(tag)
    }
  }

  // Annule le pull en cours, ou retire un pull encore en attente de la file
  function cancelPull(tag) {
    if (controllers.has(tag)) {
      controllers.get(tag).abort()
      return
    }
    const index = waiting.findIndex((job) => job.tag === tag)
    if (index !== -1) {
      const [job] = waiting.splice(index, 1)
      delete pulls.value[tag]
      job.resolve(false)
    }
  }

  // Retire une ligne en erreur une fois consultée
  function dismissPull(tag) {
    delete pulls.value[tag]
  }

  return { pulls, startPull, cancelPull, dismissPull }
}
