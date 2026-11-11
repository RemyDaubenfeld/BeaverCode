export interface TestBankEntry {
  id: string
  label: string
  prompt: string
  checks: {
    rules: string[]
    judge_criteria: string
  }
  tools?: unknown[]
  expected_tool?: string
  expected_answer?: string
  images?: string[]
}

export interface BenchmarkManifestTest {
  id: string
  label: string
  description: string
}

export interface BenchmarkManifestCategory {
  id: string
  tests: BenchmarkManifestTest[]
}

export interface BenchmarkManifest {
  categories: BenchmarkManifestCategory[]
  default_judge: string
  recommended?: Record<string, string[]>
}

export interface BenchmarkRunRequest {
  models: string[]
  testIds: string[]
  judgeModel: string | null
}

export interface BenchmarkTestResult {
  test_id: string
  label: string
  category: string
  score: number
  rule_score: number | null
  judge_score: number | null
  strengths: string
  weaknesses: string
  tokens: number
  tokens_per_sec: number
  elapsed_sec: number
  response_preview: string
}

export interface BenchmarkRunModelResult {
  model: string
  detected_types: string[]
  judge_model: string | null
  timestamp: string
  avg_score: number
  avg_tokens_per_sec: number
  total_tests: number
  verdict: string
  tests: BenchmarkTestResult[]
}

export interface BenchmarkRunFile {
  generated_at: string
  ollama_host: string
  models: BenchmarkRunModelResult[]
}

export interface BenchmarkRunSummary {
  id: string
  generated_at: string
  models: Array<{ name: string; avg_score: number; verdict: string }>
}

export type BenchmarkEvent =
  | ({ event: 'model_start'; model: string; detected_types: string[]; test_count: number; judge_model: string | null })
  | ({ event: 'test_result'; model: string } & BenchmarkTestResult)
  | ({ event: 'model_done'; model: string; avg_score: number; avg_tokens_per_sec: number; total_tests: number; verdict: string })
  | ({ event: 'error'; model: string | null; message: string })
  | ({ event: 'run_done'; output_path: string })
