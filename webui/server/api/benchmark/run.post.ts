import { runBenchmarkStream } from '../../services/benchmark.service';
import { syncLeaderboardFromRun } from '../../services/results.service';
import type { BenchmarkRunRequest } from '../../types/benchmark';

export default defineEventHandler(async (event) => {
  const body = await readBody<BenchmarkRunRequest>(event);

  if (!body?.models?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun modèle sélectionné' });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');

  const emitter = runBenchmarkStream({
    models: body.models,
    testIds: body.testIds ?? [],
    judgeModel: body.judgeModel ?? null,
  });

  emitter.onLine((line) => {
    event.node.res.write(line + '\n');
  });

  emitter.onClose(() => {
    event.node.res.end();
    // Le comparatif est persisté à part des fichiers de run (voir
    // results.service.ts) : même annulé en cours de route, si le run a eu le
    // temps d'écrire des résultats partiels, ils restent pris en compte.
    syncLeaderboardFromRun(emitter.runId).catch((error) => {
      console.error('Erreur lors de la mise à jour du comparatif :', error);
    });
  });
  event.node.req.on('close', () => emitter.stop());

  return new Promise((resolve) => {
    event.node.res.on('finish', resolve);
  });
});
