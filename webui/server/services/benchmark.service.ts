import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkManifest, BenchmarkRunRequest } from '../types/benchmark';
import { getOllamaUrl, getSettings } from './settings.service';

const execFileAsync = promisify(execFile);

// webui/server/services/benchmark.service.ts -> repo root/benchmark_tool/benchmark.py
const BENCHMARK_SCRIPT = fileURLToPath(new URL('../../../benchmark_tool/benchmark.py', import.meta.url));
const PYTHON_BIN = process.env.BENCHMARK_PYTHON_BIN || 'python3';

// Un fichier JSON par run (voir save_results() dans benchmark.py, appelé via
// --output) — l'historique complet est gardé, contrairement à l'ancien
// comportement où chaque run écrasait le précédent benchmark_results.json.
// Partagé avec results.service.ts, qui liste/lit/supprime ces fichiers.
export const RESULTS_DIR = fileURLToPath(new URL('../../../benchmark_tool/results/', import.meta.url));

// Le benchmark Python lit l'URL d'Ollama dans OLLAMA_BASE_URL (lib/config.py) : on lui passe celle des
// réglages de la WebUI, pour que gestion des modèles et benchmark parlent au même serveur
const pythonEnv = () => ({ ...process.env, OLLAMA_BASE_URL: getOllamaUrl() });

export type LogEmitter = {
  runId: string;
  onLine: (cb: (line: string) => void) => void;
  onClose: (cb: () => void) => void;
  stop: () => void;
};

// `withSettings: false` → défauts bruts de lib/config.py (affichés dans Paramétrage quand un réglage est vide)
export async function getBenchmarkManifest(models?: string[], withSettings = true): Promise<BenchmarkManifest> {
  const args = [BENCHMARK_SCRIPT, '--manifest'];
  if (models && models.length > 0) {
    args.push('--models', ...models);
  }
  const { stdout } = await execFileAsync(PYTHON_BIN, args, { timeout: 15000, maxBuffer: 10 * 1024 * 1024, env: pythonEnv() });
  const manifest: BenchmarkManifest = JSON.parse(stdout.trim());
  // les réglages de la WebUI (Paramétrage) priment sur les défauts de lib/config.py
  if (!withSettings) return manifest;
  const settings = getSettings();
  if (settings.default_judge) manifest.default_judge = settings.default_judge;
  if (settings.benchmark_options) manifest.default_options = settings.benchmark_options;
  return manifest;
}

// Un benchmark Python tourne-t-il déjà ? On interroge les PROCESSUS, pas une variable du serveur : le 18/11,
// deux runs se sont retrouvés en parallèle sur le même modèle. Le premier avait perdu sa page (rechargement de
// page ou du serveur de dev), qui avait réactivé le bouton de lancement alors que le processus Python
// continuait. Une variable en mémoire aurait été remise à zéro par ce même rechargement.
// Motif `pgrep`/`pkill` d'un run lancé par la WebUI : l'interpréteur Python suivi du script et de --stream-json
// (`^\S*python\S* ` : écarte les shells dont la ligne de commande contient le chemin, ex. un `grep benchmark.py`).
// Il reconnaît aussi un run lancé avant un rechargement de Nitro, que le serveur ne référence plus.
const RUN_PATTERN = `^\\S*python\\S* ${BENCHMARK_SCRIPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} --stream-json`;

export async function isBenchmarkRunning(): Promise<boolean> {
  try {
    await execFileAsync('pgrep', ['-f', RUN_PATTERN], { timeout: 3000 });
    return true;
  } catch {
    return false; // code 1 : aucun processus
  }
}

// Arrête tout run en cours (SIGTERM), y compris un run orphelin dont le navigateur a perdu la trace
// (page rechargée, Nitro relancé). Renvoie false s'il n'y avait rien à arrêter.
export async function stopBenchmark(): Promise<boolean> {
  try {
    await execFileAsync('pkill', ['-f', RUN_PATTERN], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export function runBenchmarkStream(params: BenchmarkRunRequest): LogEmitter {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const runId = `run_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outputPath = join(RESULTS_DIR, `${runId}.json`);

  const args = [BENCHMARK_SCRIPT, '--stream-json', '--quiet', '--output', outputPath];

  if (params.plan) {
    // un seul argument JSON (spawn sans shell : pas d'interprétation des caractères spéciaux)
    args.push('--plan', JSON.stringify(params.plan));
  } else {
    args.push('--models', ...params.models);
    if (params.testIds.length > 0) {
      args.push('--tests', params.testIds.join(','));
    }
  }
  // options de génération (absentes → défauts de lib/config.py côté Python) ; null → « model »
  if (params.options) {
    const { temperature, num_ctx, num_predict } = params.options;
    args.push('--temperature', temperature == null ? 'model' : String(temperature));
    args.push('--num-ctx', num_ctx == null ? 'model' : String(num_ctx));
    args.push('--num-predict', String(num_predict));
  }
  if (params.judgeModel) {
    args.push('--judge', params.judgeModel);
  } else {
    args.push('--no-judge');
  }

  const proc = spawn(PYTHON_BIN, args, { env: pythonEnv() });
  const listeners: Array<(line: string) => void> = [];
  const closeListeners: Array<() => void> = [];

  const emit = (buf: Buffer) => {
    buf
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => listeners.forEach((cb) => cb(line)));
  };

  proc.stdout.on('data', emit);
  proc.stderr.on('data', (chunk) => {
    const message = chunk.toString('utf8').trim();
    if (message) {
      const line = JSON.stringify({ event: 'error', model: null, message });
      listeners.forEach((cb) => cb(line));
    }
  });
  proc.on('close', () => closeListeners.forEach((cb) => cb()));

  return {
    runId,
    onLine: (cb) => listeners.push(cb),
    onClose: (cb) => closeListeners.push(cb),
    stop: () => proc.kill(),
  };
}
