import { getComparison } from '../../services/results.service';

export default defineEventHandler(async () => {
  try {
    return await getComparison();
  } catch (error) {
    console.error('Erreur lors du calcul du comparatif de benchmark :', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec du calcul du comparatif' });
  }
});
