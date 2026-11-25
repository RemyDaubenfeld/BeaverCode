export interface LibraryModel {
  model_identifier: string
  model_name: string
  description?: string
  labels?: string[]
  pulls?: number
  url?: string
}

export interface LibrarySearchResponse {
  models: LibraryModel[]
}

export interface LibraryRefreshResponse {
  added: number
  total: number
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
  error?: string
}

// Dépôt HuggingFace de fichiers GGUF (GET /api/library/hf?repo=user/repo)
export interface HfGgufFile {
  quant: string // ex. "Q4_K_M", "UD-Q4_K_XL" — sert de tag Ollama : hf.co/<repo>:<quant>
  filename: string
  size: number // octets (somme des morceaux si le fichier est découpé)
  split: boolean // découpé en plusieurs fichiers (00001-of-00003) : non téléchargeable par Ollama
  // pourquoi Ollama ne pourra pas le télécharger (fichier découpé, nom de quantification refusé par
  // HuggingFace…) ; null = téléchargeable
  unavailable: string | null
}

export interface HfRepo {
  repo: string
  gated: boolean // accès soumis à acceptation/connexion : le pull Ollama échouera
  downloads: number | null
  likes: number | null
  architecture: string | null
  total_params: number | null
  active_params: number | null // MoE : déduit du nom du dépôt (« 30B-A3B » → 3B), sinon = total
  context_length: number | null
  files: HfGgufFile[]
}

// Résultat de recherche HuggingFace (GET /api/library/hf/search?q=)
export interface HfSearchResult {
  repo: string
  downloads: number
  likes: number
  pipeline_tag: string | null // ex. "text-generation", "image-text-to-text" (vision)
  updated_at: string | null
}
