import { deleteTest } from '../../../services/testsBank.service';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "id" requis' });
  }

  try {
    await deleteTest(id);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de la suppression du test :', error);
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Échec de la suppression du test' });
  }
});
