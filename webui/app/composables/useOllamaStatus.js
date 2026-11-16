// Statut d'Ollama (en ligne + version) et stockage, pour le panneau « Système » de la barre latérale.
// Interrogé toutes les 10 s : assez pour voir Ollama tomber ou revenir, sans charger le serveur
// (le stockage est de plus mis en cache 30 s côté serveur).
let interval = null
const POLL_MS = 10_000

export function useOllamaStatus() {
  const status = useState('ollama-status', () => null) // { online, version, storage } ou null (pas encore chargé)

  async function refresh() {
    try {
      status.value = await $fetch('/api/ollama')
    } catch {
      // serveur Nuxt injoignable : on garde le dernier état connu
    }
  }

  onMounted(() => {
    if (!interval) {
      refresh()
      interval = setInterval(refresh, POLL_MS)
    }
  })

  return { status, refresh }
}
