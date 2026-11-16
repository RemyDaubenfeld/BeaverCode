import { getModelsList, getLoadedModel, getMemoryEstimate } from '../services/ollama.service';

export default defineEventHandler(async () => {
  const models = await getModelsList();
  const loaded = await getLoadedModel();

  // estimation de la mémoire nécessaire au chargement (mise en cache par digest côté service)
  const withEstimates = await Promise.all(
    models.map(async (model: any) => ({
      ...model,
      memory_estimate: await getMemoryEstimate(model.name, model.digest, model.size),
    }))
  );

  return {
    models: withEstimates ?? null,
    loaded: loaded?.name ?? null,
  };
});
