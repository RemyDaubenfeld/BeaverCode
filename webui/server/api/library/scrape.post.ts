import { refreshLibrary } from '../../services/library.service';

export default defineEventHandler(async () => {
  try {
    return await refreshLibrary();
  } catch (error) {
    console.error('Erreur lors du scraping de ollama.com/library:', error);
    throw createError({ statusCode: 502, statusMessage: "Échec de la mise à jour depuis ollama.com" });
  }
});
