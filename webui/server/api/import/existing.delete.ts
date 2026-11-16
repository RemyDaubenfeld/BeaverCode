import { deleteExistingGguf } from '../../services/import.service';

// Supprime un fichier de ~/.ollama/gguf : DELETE { filename }
export default defineEventHandler(async (event) => {
  const { filename } = await readBody(event);
  if (!filename || typeof filename !== 'string' || !filename.toLowerCase().endsWith('.gguf')) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "filename" (.gguf) requis' });
  }
  try {
    await deleteExistingGguf(filename);
    return { success: true };
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Fichier introuvable' });
  }
});
