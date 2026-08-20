import { deleteModel } from '../services/ollama.service';

export default defineEventHandler(async (event) => {
  const { name } = await readBody(event);

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }

  try {
    await deleteModel(name);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de la suppression du modèle :', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec de la suppression du modèle' });
  }
});
