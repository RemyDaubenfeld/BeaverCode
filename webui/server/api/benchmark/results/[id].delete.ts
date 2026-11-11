import { deleteRun } from '../../../services/results.service';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "id" requis' });
  }

  try {
    await deleteRun(id);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de la suppression du run :', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec de la suppression du run' });
  }
});
