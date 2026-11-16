// Compte à rebours avant déchargement des modèles chargés (`expires_at` de /api/ps).
// Une horloge partagée (une seule minuterie pour toute l'app) fait avancer les comptes à rebours
// chaque seconde ; la liste des modèles, elle, n'est rafraîchie que toutes les 2 s (useModels).

let timer = null

// au-delà, c'est un keep_alive: -1 (Ollama fixe l'expiration en 2319)
const UNLIMITED_AFTER_MS = 365 * 24 * 3600 * 1000

export function useKeepAlive() {
  const now = useState('keep-alive-now', () => Date.now())

  onMounted(() => {
    if (!timer) timer = setInterval(() => { now.value = Date.now() }, 1000)
  })

  // → { text, unlimited, expired, remainingMs }
  function remaining(expiresAt) {
    const ms = new Date(expiresAt).getTime() - now.value
    if (!Number.isFinite(ms)) return { text: '—', unlimited: false, expired: false, remainingMs: null }
    if (ms > UNLIMITED_AFTER_MS) return { text: 'illimité', unlimited: true, expired: false, remainingMs: ms }
    // juste après un déchargement, /api/ps liste encore le modèle avec une expiration ≈ maintenant
    if (ms <= 0) return { text: 'déchargement…', unlimited: false, expired: true, remainingMs: 0 }
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = String(totalSec % 60).padStart(2, '0')
    return { text: h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${s}`, unlimited: false, expired: false, remainingMs: ms }
  }

  return { now, remaining }
}
