import { getModelsList, getLoadedModel } from '../services/ollama.service';

export default defineEventHandler(async () => {
  const models = await getModelsList();
  const loaded = await getLoadedModel();

  return {
    models: models ?? null,
    loaded: loaded?.name ?? null,
  };
});