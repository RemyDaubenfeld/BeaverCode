import { getLoadedModels } from '../../services/ollama.service';

export default defineEventHandler(async () => {
  const models = await getLoadedModels();
  return { models };
});
