import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkManifest, BenchmarkRunRequest } from '../types/benchmark';

const execFileAsync = promisify(execFile);

// webui/server/services/benchmark.service.ts -> repo root/benchmark_tool/benchmark.py
const BENCHMARK_SCRIPT = fileURLToPath(new URL('../../../benchmark_tool/benchmark.py', import.meta.url));
const PYTHON_BIN = process.env.BENCHMARK_PYTHON_BIN || 'python3';

// Un fichier JSON par run (voir save_results() dans benchmark.py, appelé via
// --output) — l'historique complet est gardé, contrairement à l'ancien
// comportement où chaque run écrasait le précédent benchmark_results.json.
// Partagé avec results.service.ts, qui liste/lit/supprime ces fichiers.
export const RESULTS_DIR = fileURLToPath(new URL('../../../benchmark_tool/results/', import.meta.url));

export type LogEmitter = {
  runId: string;
  onLine: (cb: (line: string) => void) => void;
  onClose: (cb: () => void) => void;
  stop: () => void;
};

export async function getBenchmarkManifest(models?: string[]): Promise<BenchmarkManifest> {
  const args = [BENCHMARK_SCRIPT, '--manifest'];
  if (models && models.length > 0) {
    args.push('--models', ...models);
  }
  const { stdout } = await execFileAsync(PYTHON_BIN, args, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout.trim());
}

export function runBenchmarkStream(params: BenchmarkRunRequest): LogEmitter {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const runId = `run_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outputPath = join(RESULTS_DIR, `${runId}.json`);

  const args = [BENCHMARK_SCRIPT, '--models', ...params.models, '--stream-json', '--quiet', '--output', outputPath];

  if (params.testIds.length > 0) {
    args.push('--tests', params.testIds.join(','));
  }
  if (params.judgeModel) {
    args.push('--judge', params.judgeModel);
  } else {
    args.push('--no-judge');
  }

  const proc = spawn(PYTHON_BIN, args);
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
