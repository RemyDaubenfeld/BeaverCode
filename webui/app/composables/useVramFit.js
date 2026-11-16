// Prédit la vitesse d'un modèle à partir de sa place en VRAM.
//
// Quand un modèle ne tient pas en VRAM, Ollama ne refuse pas de le charger : il met autant de
// couches que possible sur le GPU et le reste en RAM, calculé par le CPU. Le modèle tourne
// toujours, mais à chaque token le CPU doit relire en RAM les poids de ses couches — et la RAM est
// bien plus lente que la VRAM. La vitesse est donc limitée par :
//   octets lus en RAM par token = poids × part_active × part_hors_GPU
//   tok/s ≈ bande_passante_RAM / octets lus en RAM par token
// `part_active` vaut 1 pour un modèle dense ; pour un MoE seuls les experts utilisés sont lus
// (qwen3:30b-a3b : ~11 % des poids), d'où des « gros » modèles MoE presque aussi rapides que des 7B.
//
// VRAM utilisable = VRAM totale − VRAM occupée par AUTRE CHOSE qu'Ollama − réserve d'Ollama.
// On ne retire pas la VRAM des modèles déjà chargés par Ollama : pour charger un nouveau modèle,
// Ollama décharge les autres si la place manque.

// Ollama ne remplit jamais toute la VRAM (contexte CUDA, buffers, marge de sécurité) : mesuré sur
// la RTX 3050 Ti 4 Go, il place au plus ~2.6 Go de modèle sur GPU (qwen3:4b : 2.58 Go sur 2.74,
// deepseek-r1:7b : 2.49 Go sur 4.67) → environ 1 Go de réserve
const OLLAMA_RESERVE_BYTES = 1 * 1024 ** 3
// Bande passante RAM effective, calibrée sur les tok/s mesurés par le benchmark (médiane de 16
// modèles qui débordent de la VRAM : 15.2 Go/s ; ex. qwen3.6:27b prédit 1.1 tok/s, mesuré 1)
const RAM_BANDWIDTH_BYTES_PER_SEC = 15 * 1024 ** 3
// En dessous, un modèle devient pénible en usage interactif (500 tokens > 1 min 30)
const USABLE_MIN_TOKENS_PER_SEC = 5

export function useVramFit() {
  const { gpus, ramTotalMB } = useHardware()
  const { loadedModels } = useModels()

  const usableVramBytes = computed(() => {
    if (!gpus.value?.length) return 0
    // Ollama sait répartir un modèle sur plusieurs GPU : on additionne
    const totalMB = gpus.value.reduce((sum, g) => sum + g.memoryTotalMB, 0)
    const usedMB = gpus.value.reduce((sum, g) => sum + g.memoryUsedMB, 0)
    const ollamaBytes = (loadedModels.value ?? []).reduce((sum, m) => sum + (m.size_vram ?? 0), 0)
    const otherBytes = Math.max(0, usedMB * 1024 ** 2 - ollamaBytes)
    return Math.max(0, totalMB * 1024 ** 2 - otherBytes - OLLAMA_RESERVE_BYTES)
  })

  // estimate : { total_bytes, weights_bytes, active_params?, total_params? }
  // → { level: 'fast' | 'medium' | 'slow', gpuRatio, activeRatio, estimatedTokensPerSec, exceedsRam } ou null
  function vramFit(estimate) {
    if (!estimate?.total_bytes) return null
    const gpuRatio = Math.max(0, Math.min(1, usableVramBytes.value / estimate.total_bytes))
    const activeRatio = estimate.active_params && estimate.total_params
      ? estimate.active_params / estimate.total_params
      : 1

    // tout en VRAM : limité par la VRAM, pas de prédiction CPU à faire
    if (gpuRatio >= 1) {
      return { level: 'fast', gpuRatio, activeRatio, estimatedTokensPerSec: null, exceedsRam: false }
    }

    // Plus gros que VRAM + RAM : Ollama charge les poids en mmap, une partie est relue depuis le
    // disque à chaque token — bien plus lent que la RAM, la formule ne s'applique plus
    // (qwen3-coder-next, 54 Go pour 23 Go de RAM : prédit 7 tok/s par la formule, mesuré 2.8)
    const exceedsRam = !!ramTotalMB.value
      && estimate.total_bytes > usableVramBytes.value + ramTotalMB.value * 1024 ** 2
    if (exceedsRam) {
      return { level: 'slow', gpuRatio, activeRatio, estimatedTokensPerSec: null, exceedsRam }
    }

    const ramBytesPerToken = (estimate.weights_bytes ?? estimate.total_bytes) * activeRatio * (1 - gpuRatio)
    const estimatedTokensPerSec = RAM_BANDWIDTH_BYTES_PER_SEC / ramBytesPerToken
    const level = estimatedTokensPerSec >= USABLE_MIN_TOKENS_PER_SEC ? 'medium' : 'slow'
    return { level, gpuRatio, activeRatio, estimatedTokensPerSec, exceedsRam }
  }

  return { usableVramBytes, vramFit }
}
