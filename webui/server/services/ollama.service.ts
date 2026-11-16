import { $fetch } from 'ofetch';

/**
 * Récupère la liste complète des modèles disponibles via Ollama
 * @returns {Promise<Array<{ name: string }>>} Liste des modèles
 */
export const getModelsList = async (): Promise<Array<{ name: string }>> => {
  try {
    const response = await $fetch<{ models: Array<{ name: string }> }>(
      'http://localhost:11434/api/tags'
    );
    return response.models || [];
    
  } catch (error) {
    console.error('Erreur lors de la récupération de la liste des modèles:', error);
    return [];
  }
};

/**
 * Récupère le modèle actuellement chargé (via api/ps)
 * @returns {Promise<{ name: string } | null>} Le modèle chargé, ou null
 */
export const getLoadedModel = async (): Promise<{ name: string } | null> => {
  try {
    const response = await $fetch<{ models: Array<{ name: string }> }>(
      'http://localhost:11434/api/ps'
    );
    return response.models?.[0] || null;
  } catch (error) {
    console.error('Erreur lors de la récupération du modèle chargé:', error);
    return null;
  }
};

/**
 * Supprime un modèle Ollama (`DELETE /api/delete`)
 * @param {string} name Nom (avec tag) du modèle à supprimer
 */
export const deleteModel = async (name: string): Promise<void> => {
  await $fetch('http://localhost:11434/api/delete', {
    method: 'DELETE',
    body: { model: name },
  });
};

// --- Estimation de la mémoire nécessaire pour charger un modèle -------------------------------
//
// Mémoire totale ≈ poids du modèle + KV cache + surcoût fixe.
// - Poids : la taille du modèle sur disque (`size` de /api/tags) — chargée telle quelle en mémoire.
// - KV cache : mémoire où le modèle garde les clés/valeurs d'attention de chaque token du contexte.
//   Elle grandit linéairement avec num_ctx :
//     num_ctx × nb_couches × nb_têtes_kv × (dim_clé + dim_valeur) × octets_par_valeur
//   Les dimensions viennent de `model_info` (/api/show), num_ctx des paramètres du modèle.
// - Surcoût : buffers de calcul de llama.cpp, petite marge proportionnelle.
//
// Calibré sur la RTX 3050 Ti (Ollama 0.31.1) en comparant avec `size` de /api/ps une fois chargé :
// poids + KV cache tombent à ±5 % du réel (qwen2.5-coder:1.5b 1.03 vs 1.03 Go, qwen3:4b 2.89 vs
// 2.74 Go, deepseek-r1:7b 4.58 vs 4.67 Go). La réserve VRAM d'Ollama est gérée côté client (useVramFit.js).

// Contexte utilisé par Ollama quand le modèle ne définit pas `num_ctx` (sans OLLAMA_CONTEXT_LENGTH)
const DEFAULT_NUM_CTX = 4096
// KV cache en f16 (défaut Ollama) = 2 octets par valeur ; q8_0 (OLLAMA_KV_CACHE_TYPE) diviserait par 2
const KV_BYTES_PER_VALUE = 2
const OVERHEAD_RATIO = 0.05

export interface MemoryEstimate {
  total_bytes: number
  weights_bytes: number
  kv_cache_bytes: number | null // null si l'architecture n'expose pas les dimensions nécessaires
  overhead_bytes: number
  num_ctx: number
  // MoE (Mixture of Experts) : seule une partie des poids est lue à chaque token
  total_params: number | null
  active_params: number | null // = total_params pour un modèle dense
  expert_count: number | null
  expert_used_count: number | null
}

/**
 * Paramètres réellement utilisés par token. Dans un MoE, chaque couche contient `expert_count`
 * experts (des petits réseaux feed-forward de 3 matrices : gate, up, down) et le routeur n'en
 * active que `expert_used_count` par token. Les experts non utilisés ne sont pas lus :
 *   params_experts = couches × nb_experts × 3 × embedding × ff_expert
 *   actifs = total − params_experts × (1 − experts_utilisés / nb_experts)
 * Ex. qwen3-coder:30b-a3b → 30.5B − 29.0B × 120/128 = 3.35B actifs (le « a3b » du nom).
 * Un expert partagé (`expert_shared_feed_forward_length`) est toujours actif : il reste dans le total.
 */
function computeParams(mi: ModelInfo) {
  const arch = mi['general.architecture']
  const get = (key: string) => mi[`${arch}.${key}`]
  const total = mi['general.parameter_count'] ?? null
  const expertCount = get('expert_count') ?? null
  const expertUsed = get('expert_used_count') ?? null
  const expertFf = get('expert_feed_forward_length')
  const blockCount = get('block_count')
  const embedding = get('embedding_length')

  if (!total || !expertCount || !expertUsed || !expertFf || !blockCount || !embedding) {
    return { total_params: total, active_params: total, expert_count: expertCount, expert_used_count: expertUsed }
  }
  const expertParams = blockCount * expertCount * 3 * embedding * expertFf
  const active = total - expertParams * (1 - expertUsed / expertCount)
  return {
    total_params: total,
    // garde-fou si les métadonnées ne collent pas à la formule (résultat négatif ou absurde)
    active_params: active > 0 && active <= total ? Math.round(active) : total,
    expert_count: expertCount,
    expert_used_count: expertUsed,
  }
}

// Les couches à « sliding window » (Gemma…) ne gardent que les N derniers tokens ; llama.cpp leur
// alloue la fenêtre + un batch de calcul (n_ubatch, 512 par défaut)
const SWA_EXTRA_TOKENS = 512

// Les infos d'un modèle ne changent que si son digest change : cache mémoire pour ne pas
// rappeler /api/show à chaque polling de la liste (toutes les 2 s). On met en cache la *promesse* :
// si un deuxième polling arrive pendant le premier calcul, il attend le même résultat au lieu de
// relancer les appels.
const estimateCache = new Map<string, { digest: string; promise: Promise<MemoryEstimate | null> }>()

type ModelInfo = Record<string, any>

const showModel = (name: string, verbose = false) =>
  $fetch<{ model_info?: ModelInfo; parameters?: string }>('http://localhost:11434/api/show', {
    method: 'POST',
    body: { model: name, verbose },
  })

/**
 * KV cache = somme sur chaque couche de : tokens gardés × têtes KV × (dim_clé + dim_valeur) × octets.
 * Calcul couche par couche car les architectures récentes mélangent :
 * - couches à attention complète (gardent tout le contexte) et à sliding window (gardent N tokens,
 *   avec des dimensions de tête parfois différentes : `key_length_swa`) ;
 * - un nombre de têtes KV variable par couche (`head_count_kv` en tableau) ;
 * - des couches qui partagent le KV d'une autre (`shared_kv_layers`, en fin de modèle) → rien à allouer.
 */
function computeKvCacheBytes(mi: ModelInfo, numCtx: number): number | null {
  const arch = mi['general.architecture']
  if (!arch) return null
  const get = (key: string) => mi[`${arch}.${key}`]

  const blockCount = get('block_count')
  const headCount = get('attention.head_count')
  const headCountKv = get('attention.head_count_kv') ?? headCount
  // dim_clé/dim_valeur par tête : explicites sur les modèles récents, sinon embedding / nb_têtes
  const fallbackDim = get('embedding_length') && headCount ? get('embedding_length') / headCount : null
  const keyLength = get('attention.key_length') ?? fallbackDim
  const valueLength = get('attention.value_length') ?? fallbackDim
  if (!blockCount || headCountKv == null || !keyLength || !valueLength) return null

  const slidingWindow = get('attention.sliding_window')
  const swaPattern = get('attention.sliding_window_pattern') // tableau de booléens, un par couche
  const sharedKvLayers = get('attention.shared_kv_layers') ?? 0

  let totalBytes = 0
  for (let layer = 0; layer < blockCount - sharedKvLayers; layer++) {
    const isSwa = !!slidingWindow && Array.isArray(swaPattern) && swaPattern[layer] === true
    const tokens = isSwa ? Math.min(numCtx, slidingWindow + SWA_EXTRA_TOKENS) : numCtx
    const heads = Array.isArray(headCountKv) ? headCountKv[layer] : headCountKv
    const dims = isSwa
      ? (get('attention.key_length_swa') ?? keyLength) + (get('attention.value_length_swa') ?? valueLength)
      : keyLength + valueLength
    totalBytes += tokens * heads * dims * KV_BYTES_PER_VALUE
  }
  return totalBytes
}

async function computeMemoryEstimate(name: string, sizeBytes: number): Promise<MemoryEstimate | null> {
  try {
    let show = await showModel(name)
    let mi = show.model_info ?? {}
    // Sans `verbose`, /api/show remplace les tableaux par null (dont sliding_window_pattern et
    // head_count_kv par couche). La réponse verbose pèse ~17 Mo (vocabulaire du tokenizer inclus) :
    // on ne la demande que pour les modèles à sliding window, les seuls qui en ont besoin.
    const arch = mi['general.architecture']
    if (arch && mi[`${arch}.attention.sliding_window`]) {
      show = await showModel(name, true)
      mi = show.model_info ?? {}
    }

    // `parameters` est le texte des PARAMETER du modelfile, ex. "num_ctx    16384\ntemperature 0.6"
    const ctxMatch = /^num_ctx\s+(\d+)/m.exec(show.parameters ?? '')
    const numCtx = ctxMatch ? Number(ctxMatch[1]) : DEFAULT_NUM_CTX
    const kvCacheBytes = computeKvCacheBytes(mi, numCtx)

    const overheadBytes = Math.round((sizeBytes + (kvCacheBytes ?? 0)) * OVERHEAD_RATIO)
    return {
      total_bytes: sizeBytes + (kvCacheBytes ?? 0) + overheadBytes,
      weights_bytes: sizeBytes,
      kv_cache_bytes: kvCacheBytes,
      overhead_bytes: overheadBytes,
      num_ctx: numCtx,
      ...computeParams(mi),
    }
  } catch (error) {
    console.error(`Erreur lors de l'estimation mémoire de ${name}:`, error)
    return null
  }
}

export const getMemoryEstimate = (
  name: string,
  digest: string,
  sizeBytes: number,
): Promise<MemoryEstimate | null> => {
  const cached = estimateCache.get(name)
  if (cached?.digest === digest) return cached.promise

  const promise = computeMemoryEstimate(name, sizeBytes)
  estimateCache.set(name, { digest, promise })
  // en cas d'échec (Ollama indisponible…), on oublie le résultat pour réessayer au prochain appel
  promise.then((estimate) => { if (!estimate) estimateCache.delete(name) })
  return promise
};

export interface LoadedModelInfo {
  name: string
  size_vram: number
  expires_at: string
  context_length?: number
}

/**
 * Liste tous les modèles actuellement chargés en mémoire (VRAM/RAM) via `/api/ps`.
 */
export const getLoadedModels = async (): Promise<LoadedModelInfo[]> => {
  try {
    const response = await $fetch<{ models: LoadedModelInfo[] }>(
      'http://localhost:11434/api/ps'
    );
    return response.models ?? [];
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles chargés:', error);
    return [];
  }
};

/**
 * Décharge un modèle de la mémoire immédiatement (`keep_alive: 0` sur `/api/generate`,
 * mécanisme officiel d'Ollama pour forcer un unload sans attendre l'expiration naturelle).
 */
export const unloadModel = async (name: string): Promise<void> => {
  await $fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: { model: name, keep_alive: 0 },
  });
};