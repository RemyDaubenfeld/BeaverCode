import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Réglages de la WebUI ----------------------------------------------------------------------
//
// Enregistrés dans webui/.data/settings.json (dossier .data déjà ignoré par git : ce sont des réglages
// locaux, propres à chaque machine). Un réglage à null = valeur par défaut :
// - ollama_url        : http://localhost:11434
// - default_judge     : DEFAULT_JUDGE de benchmark_tool/lib/config.py (benchmark-judge:latest)
// - benchmark_options : DEFAULT_TEMPERATURE / NUM_CTX / NUM_PREDICT de lib/config.py
//
// Lu une fois puis gardé en mémoire : getOllamaUrl() est appelé à chaque requête vers Ollama (plusieurs
// fois par seconde avec le polling), relire le fichier à chaque fois serait inutile.

const SETTINGS_PATH = fileURLToPath(new URL('../../.data/settings.json', import.meta.url));

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export interface BenchmarkOptionsSetting {
  temperature: number | null // null = valeur du modèle
  num_ctx: number | null
  num_predict: number
  seed?: number | null // null = aléatoire ; absente = défaut de lib/config.py
}

export interface WebUiSettings {
  ollama_url: string | null
  default_judge: string | null
  benchmark_options: BenchmarkOptionsSetting | null
}

const EMPTY: WebUiSettings = { ollama_url: null, default_judge: null, benchmark_options: null };

let current: WebUiSettings | null = null;

export function getSettings(): WebUiSettings {
  if (!current) {
    try {
      current = { ...EMPTY, ...JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) };
    } catch {
      current = { ...EMPTY }; // pas encore de fichier (premier lancement) : tout par défaut
    }
  }
  return current!;
}

export function saveSettings(settings: WebUiSettings): void {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  current = settings;
}

/** URL du serveur Ollama (sans « / » final), suivie de `path` : getOllamaUrl('/api/tags') */
export function getOllamaUrl(path = ''): string {
  return (getSettings().ollama_url || DEFAULT_OLLAMA_URL).replace(/\/+$/, '') + path;
}

// --- Validation (PUT /api/settings) -------------------------------------------------------------

const fail = (message: string) => {
  throw createError({ statusCode: 400, statusMessage: message });
};

export function validateOllamaUrl(url: unknown): string {
  if (typeof url !== 'string') fail('URL d\'Ollama invalide');
  let parsed: URL;
  try {
    parsed = new URL(url as string);
  } catch {
    fail('URL d\'Ollama invalide (ex. http://localhost:11434)');
  }
  if (!['http:', 'https:'].includes(parsed!.protocol)) fail('L\'URL d\'Ollama doit commencer par http:// ou https://');
  // origine seule (schéma + hôte + port) : les chemins /api/... sont ajoutés par la WebUI
  return parsed!.origin;
}

export function validateSettings(body: unknown): WebUiSettings {
  const b = (body ?? {}) as Record<string, unknown>;

  const ollamaUrl = b.ollama_url == null || b.ollama_url === '' ? null : validateOllamaUrl(b.ollama_url);

  let judge: string | null = null;
  if (b.default_judge != null && b.default_judge !== '') {
    if (typeof b.default_judge !== 'string' || !/^[\w.:/-]+$/.test(b.default_judge)) fail('Nom de modèle juge invalide');
    judge = b.default_judge as string;
  }

  let options: BenchmarkOptionsSetting | null = null;
  if (b.benchmark_options != null) {
    const o = b.benchmark_options as Record<string, unknown>;
    const inRange = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    if (o.temperature !== null && !inRange(o.temperature, 0, 2)) fail('Température invalide (0 à 2, ou valeur du modèle)');
    if (o.num_ctx !== null && !(inRange(o.num_ctx, 512, 262144) && Number.isInteger(o.num_ctx))) fail('Contexte invalide (512 à 262144, ou valeur du modèle)');
    if (!(inRange(o.num_predict, 16, 32768) && Number.isInteger(o.num_predict))) fail('Tokens max invalides (16 à 32768)');
    if (o.seed !== undefined && o.seed !== null && !(inRange(o.seed, 0, 2147483647) && Number.isInteger(o.seed))) fail('Seed invalide (entier de 0 à 2147483647, ou aléatoire)');
    options = { temperature: o.temperature as number | null, num_ctx: o.num_ctx as number | null, num_predict: o.num_predict as number,
      ...(o.seed !== undefined ? { seed: o.seed as number | null } : {}) };
  }

  return { ollama_url: ollamaUrl, default_judge: judge, benchmark_options: options };
}
