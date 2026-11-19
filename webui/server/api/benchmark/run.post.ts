import { isBenchmarkRunning, runBenchmarkStream } from '../../services/benchmark.service';
import { syncLeaderboardFromRun } from '../../services/results.service';
import type { BenchmarkRunOptions, BenchmarkRunRequest } from '../../types/benchmark';

// Bornes des options : au-delà, la valeur est une erreur de saisie (et `spawn` reçoit des arguments
// sûrs : uniquement des nombres validés, jamais du texte libre)
function validateOptions(options: unknown): BenchmarkRunOptions | undefined {
  if (options == null) return undefined;
  const o = options as Record<string, unknown>;
  const inRange = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (o.temperature !== null && !inRange(o.temperature, 0, 2)) {
    throw createError({ statusCode: 400, statusMessage: 'Température invalide (0 à 2, ou valeur du modèle)' });
  }
  if (o.num_ctx !== null && !(inRange(o.num_ctx, 512, 262144) && Number.isInteger(o.num_ctx))) {
    throw createError({ statusCode: 400, statusMessage: 'Contexte invalide (512 à 262144, ou valeur du modèle)' });
  }
  if (!(inRange(o.num_predict, 16, 32768) && Number.isInteger(o.num_predict))) {
    throw createError({ statusCode: 400, statusMessage: 'Tokens max invalides (16 à 32768)' });
  }
  return { temperature: o.temperature as number | null, num_ctx: o.num_ctx as number | null, num_predict: o.num_predict as number };
}

// Plan de relance : { "<modèle>": ["<id de test>", …] } — noms et ids vérifiés (pas de texte arbitraire
// transmis à Python), au moins un test par modèle
function validatePlan(plan: unknown): Record<string, string[]> | undefined {
  if (plan == null) return undefined;
  const invalid = () => createError({ statusCode: 400, statusMessage: 'Plan de tests invalide' });
  if (typeof plan !== 'object' || Array.isArray(plan)) throw invalid();
  const entries = Object.entries(plan as Record<string, unknown>);
  if (!entries.length) throw invalid();
  for (const [model, ids] of entries) {
    if (!/^[\w.:/-]+$/.test(model)) throw invalid();
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'string' && /^[\w-]+$/.test(id))) throw invalid();
  }
  return plan as Record<string, string[]>;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<BenchmarkRunRequest>(event);

  const plan = validatePlan(body?.plan);
  if (!plan && !body?.models?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Aucun modèle sélectionné' });
  }
  // validé AVANT d'ouvrir le flux NDJSON : une erreur 400 doit partir comme une réponse normale
  const options = validateOptions(body.options);
  // deux runs à la fois se partagent le GPU (chacun deux fois plus lent) et empêchent Ollama de décharger le modèle
  if (await isBenchmarkRunning()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Un benchmark est déjà en cours (peut-être lancé avant un rechargement de la page) : attendre sa fin ou l\'arrêter avant d\'en lancer un autre',
    });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');

  const emitter = runBenchmarkStream({
    models: plan ? Object.keys(plan) : body.models,
    testIds: body.testIds ?? [],
    judgeModel: body.judgeModel ?? null,
    options,
    plan,
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
  // Annulation (le navigateur coupe la connexion) : écouter la RÉPONSE, pas la requête. `req` émet « close »
  // dès que son corps est lu (Node ≥ 16), donc avant même cet écouteur : le script n'était jamais arrêté.
  // `res` émet « close » à la coupure de la connexion, ou après la fin normale (writableFinished vaut alors true).
  event.node.res.on('close', () => {
    if (!event.node.res.writableFinished) emitter.stop();
  });

  return new Promise((resolve) => {
    event.node.res.on('finish', resolve);
  });
});
