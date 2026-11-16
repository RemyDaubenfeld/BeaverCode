import { readModelfile } from '../../services/modelfile.service';

// Contenu d'un preset : GET /api/modelfiles/read?filename=coder.modelfile → { parameters, system }
export default defineEventHandler(async (event) => {
  const { filename } = getQuery(event);
  if (!filename || typeof filename !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "filename" requis' });
  }

  try {
    // readModelfile ne garde que le nom de fichier (basename) : pas de lecture hors ~/.ollama/modelfiles
    return await readModelfile(filename);
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Preset introuvable' });
  }
});
