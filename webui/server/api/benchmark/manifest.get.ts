import { getBenchmarkManifest } from '../../services/benchmark.service';

export default defineEventHandler(async (event) => {
  const { models } = getQuery(event);
  const modelList = typeof models === 'string' && models.length > 0 ? models.split(',') : undefined;

  try {
    return await getBenchmarkManifest(modelList);
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Impossible de charger le manifest de benchmark : ${(error as Error).message}`,
    });
  }
});
