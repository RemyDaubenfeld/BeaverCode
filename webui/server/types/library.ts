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
