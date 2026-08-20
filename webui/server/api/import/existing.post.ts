import { Readable } from 'node:stream';
import { createModelStream, resolveExistingGguf } from '../../services/import.service';

export default defineEventHandler(async (event) => {
  const { name, filename } = await readBody(event);

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }
  if (!filename || typeof filename !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "filename" requis' });
  }

  let ggufPath: string;
  try {
    ggufPath = await resolveExistingGguf(filename);
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Fichier introuvable dans ~/.ollama/gguf' });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  return sendStream(event, Readable.from(createModelStream(name, ggufPath)));
});
