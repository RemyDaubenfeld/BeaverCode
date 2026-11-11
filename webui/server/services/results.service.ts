import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULTS_DIR } from './benchmark.service';
import type { BenchmarkRunFile, BenchmarkRunModelResult, BenchmarkRunSummary, BenchmarkTestResult } from '../types/benchmark';

// Comparatif des modèles : persisté à part des fichiers de run (un modèle
// gardé "le mieux placé" doit rester dans le comparatif même si on supprime
// le run qui l'a produit — voir syncLeaderboardFromRun(), appelé à la fin de
// chaque run, jamais par deleteRun()). Situé à côté de results/ plutôt que
// dedans pour ne pas être listé comme un run par listRunFiles().
const LEADERBOARD_PATH = fileURLToPath(new URL('../../../benchmark_tool/leaderboard.json', import.meta.url));

async function readRunFile(filename: string): Promise<BenchmarkRunFile | null> {
  try {
    const raw = await readFile(join(RESULTS_DIR, filename), 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Fichier corrompu ou run interrompu avant d'avoir pu écrire — ignoré
    // plutôt que de faire planter tout le listing.
    return null;
  }
}

async function listRunFiles(): Promise<string[]> {
  try {
    const entries = await readdir(RESULTS_DIR);
    return entries.filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    return [];
  }
}

function idToFilename(id: string): string {
  // basename() : protection contre la traversée de chemin (même pattern que
  // resolveExistingGguf() dans import.service.ts).
  const safe = basename(id);
  return safe.endsWith('.json') ? safe : `${safe}.json`;
}

export async function listRuns(): Promise<BenchmarkRunSummary[]> {
  const files = await listRunFiles();
  const summaries: BenchmarkRunSummary[] = [];

  for (const filename of files) {
    const run = await readRunFile(filename);
    if (!run) continue;
    summaries.push({
      id: filename.replace(/\.json$/, ''),
      generated_at: run.generated_at,
      models: run.models.map((m) => ({ name: m.model, avg_score: m.avg_score, verdict: m.verdict })),
    });
  }

  return summaries;
}

export async function getRun(id: string): Promise<(BenchmarkRunFile & { id: string }) | null> {
  const run = await readRunFile(idToFilename(id));
  if (!run) return null;
  return { ...run, id };
}

export async function deleteRun(id: string): Promise<void> {
  await unlink(join(RESULTS_DIR, idToFilename(id)));
}

async function readLeaderboard(): Promise<Record<string, BenchmarkRunModelResult>> {
  try {
    const raw = await readFile(LEADERBOARD_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Premier lancement après cette fonctionnalité (ou fichier supprimé à la
    // main) : reconstruit une fois depuis les runs déjà présents sur disque,
    // puis persiste le résultat pour ne plus avoir à rescanner ensuite.
    const rebuilt = await rebuildLeaderboardFromRuns();
    await writeLeaderboard(rebuilt);
    return rebuilt;
  }
}

async function writeLeaderboard(leaderboard: Record<string, BenchmarkRunModelResult>): Promise<void> {
  await writeFile(LEADERBOARD_PATH, JSON.stringify(leaderboard, null, 2) + '\n', 'utf-8');
}

const VERDICT_BY_SCORE: Record<number, string> = {
  5: 'Excellent',
  4: 'Bon',
  3: 'Passable',
  2: 'Insuffisant',
  1: 'Inutilisable',
};

// Fusionne un résultat de modèle dans le comparatif au niveau du test, pas du
// modèle entier : un test déjà présent (même test_id) est remplacé par le
// nouveau résultat, un test inédit est ajouté — les autres tests déjà
// enregistrés pour ce modèle sont conservés. Sans ça, retester un modèle sur
// un seul test effaçait tout l'historique des autres tests du comparatif.
function mergeModelResult(existing: BenchmarkRunModelResult | undefined, incoming: BenchmarkRunModelResult): BenchmarkRunModelResult {
  const testsById = new Map<string, BenchmarkTestResult>();
  for (const t of existing?.tests ?? []) testsById.set(t.test_id, t);
  for (const t of incoming.tests) testsById.set(t.test_id, t);
  const tests = [...testsById.values()];

  const totalTests = tests.length;
  const avgScore = totalTests ? Math.round((tests.reduce((s, t) => s + t.score, 0) / totalTests) * 100) / 100 : 0;
  const totalTokens = tests.reduce((s, t) => s + t.tokens, 0);
  const totalTime = tests.reduce((s, t) => s + t.elapsed_sec, 0);
  const avgTokensPerSec = totalTime > 0 ? Math.round((totalTokens / totalTime) * 10) / 10 : 0;

  return {
    model: incoming.model,
    detected_types: incoming.detected_types,
    judge_model: incoming.judge_model,
    timestamp: !existing || incoming.timestamp > existing.timestamp ? incoming.timestamp : existing.timestamp,
    avg_score: avgScore,
    avg_tokens_per_sec: avgTokensPerSec,
    total_tests: totalTests,
    verdict: VERDICT_BY_SCORE[Math.round(avgScore)] ?? 'Passable',
    tests,
  };
}

async function rebuildLeaderboardFromRuns(): Promise<Record<string, BenchmarkRunModelResult>> {
  // Du plus ancien au plus récent, pour que mergeModelResult empile les runs
  // dans l'ordre chronologique (un test rejoué dans un run plus récent
  // remplace bien la version plus ancienne, pas l'inverse).
  const files = [...(await listRunFiles())].reverse();
  const merged: Record<string, BenchmarkRunModelResult> = {};

  for (const filename of files) {
    const run = await readRunFile(filename);
    if (!run) continue;
    for (const modelResult of run.models) {
      merged[modelResult.model] = mergeModelResult(merged[modelResult.model], modelResult);
    }
  }

  return merged;
}

// Appelé une fois un run terminé (voir run.post.ts) : fusionne les tests de
// ce run dans le comparatif existant, sans jamais rien retirer — la seule
// façon de faire disparaître un modèle (ou un test précis) du comparatif est
// de le retester, pas de supprimer un vieux fichier de run.
export async function syncLeaderboardFromRun(runId: string): Promise<void> {
  const run = await readRunFile(idToFilename(runId));
  if (!run) return;

  const leaderboard = await readLeaderboard();
  for (const modelResult of run.models) {
    leaderboard[modelResult.model] = mergeModelResult(leaderboard[modelResult.model], modelResult);
  }
  await writeLeaderboard(leaderboard);
}

export async function getComparison(): Promise<BenchmarkRunModelResult[]> {
  const leaderboard = await readLeaderboard();
  return Object.values(leaderboard).sort((a, b) => b.avg_score - a.avg_score);
}

// Retire un modèle du comparatif uniquement — les fichiers de run qui
// contiennent ses résultats ne sont pas touchés (même logique inverse que
// syncLeaderboardFromRun : le comparatif et l'historique des runs sont deux
// choses indépendantes). Si le modèle est retesté plus tard, il réapparaît.
export async function deleteModelFromComparison(model: string): Promise<void> {
  const leaderboard = await readLeaderboard();
  delete leaderboard[model];
  await writeLeaderboard(leaderboard);
}
