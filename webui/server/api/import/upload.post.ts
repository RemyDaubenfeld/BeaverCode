import { Readable } from 'node:stream';
import { saveUploadedGguf, createModelStream } from '../../services/import.service';

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event);
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: 'Formulaire multipart requis' });
  }

  const fileEntry = form.find((f) => f.name === 'file');
  const nameEntry = form.find((f) => f.name === 'name');

  if (!fileEntry?.data || !fileEntry.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Fichier .gguf requis' });
  }
  if (!nameEntry?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }

  const name = nameEntry.data.toString('utf-8');

  let ggufPath: string;
  try {
    ggufPath = await saveUploadedGguf(fileEntry.filename, fileEntry.data);
  } catch (error) {
    console.error("Erreur lors de l'écriture du GGUF uploadé :", error);
    throw createError({ statusCode: 502, statusMessage: "Échec de l'enregistrement du fichier" });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  return sendStream(event, Readable.from(createModelStream(name, ggufPath)));
});
