import { getModelDetails } from '../../services/ollama.service';

// Fiche détaillée d'un modèle : GET /api/model/show?name=qwen3:8b
export default defineEventHandler(async (event) => {
  const { name } = getQuery(event);

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }

  try {
    return await getModelDetails(name);
  } catch (error) {
    console.error(`Erreur lors de la lecture de la fiche de ${name} :`, error);
    throw createError({ statusCode: 502, statusMessage: 'Impossible de lire les informations du modèle' });
  }
});
