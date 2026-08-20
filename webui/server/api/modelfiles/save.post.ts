import { saveModelfileTemplate } from '../../services/modelfile.service';

export default defineEventHandler(async (event) => {
  const { filename, parameters, system } = await readBody(event);

  if (!filename || typeof filename !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "filename" requis' });
  }

  try {
    const savedFilename = await saveModelfileTemplate(filename, parameters ?? {}, system ?? '');
    return { filename: savedFilename };
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du modelfile :", error);
    throw createError({ statusCode: 502, statusMessage: "Échec de l'enregistrement du modelfile" });
  }
});
