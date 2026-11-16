import { DEFAULT_OLLAMA_URL, getSettings } from '../services/settings.service';
import { getBenchmarkManifest } from '../services/benchmark.service';

// Réglages de la WebUI + valeurs par défaut (utilisées quand un réglage est vide)
export default defineEventHandler(async () => {
  const raw = await getBenchmarkManifest(undefined, false).catch(() => null);
  return {
    settings: getSettings(),
    defaults: {
      ollama_url: DEFAULT_OLLAMA_URL,
      default_judge: raw?.default_judge ?? null, // lib/config.py (BENCHMARK_JUDGE)
      benchmark_options: raw?.default_options ?? null, // lib/config.py (BENCHMARK_*)
    },
  };
});
