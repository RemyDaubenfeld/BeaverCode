import { listRuns } from '../../services/results.service';

export default defineEventHandler(async () => {
  try {
    return await listRuns();
  } catch (error) {
    console.error('Erreur lors de la lecture des résultats de benchmark :', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec de la lecture des résultats' });
  }
});
