import { searchLibrary } from '../../services/library.service';

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event);
  try {
    return await searchLibrary(typeof q === 'string' ? q : '');
  } catch (error) {
    console.error('Erreur lors de la recherche dans la bibliothèque:', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec de la récupération depuis ollama.com' });
  }
});
