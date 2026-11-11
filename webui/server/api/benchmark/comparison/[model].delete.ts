import { deleteModelFromComparison } from '../../../services/results.service';

export default defineEventHandler(async (event) => {
  const model = getRouterParam(event, 'model');
  if (!model) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "model" requis' });
  }

  try {
    await deleteModelFromComparison(decodeURIComponent(model));
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de la suppression du modèle du comparatif :', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec de la suppression du modèle' });
  }
});
