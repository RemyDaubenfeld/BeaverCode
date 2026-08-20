import { Readable } from 'node:stream';
import { downloadGgufFromUrl } from '../../services/import.service';

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event);
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: 'Formulaire multipart requis' });
  }

  const urlEntry = form.find((f) => f.name === 'url');
  const nameEntry = form.find((f) => f.name === 'name');

  if (!urlEntry?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "url" requis' });
  }
  if (!nameEntry?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }

  const url = urlEntry.data.toString('utf-8');
  const name = nameEntry.data.toString('utf-8');

  try {
    new URL(url);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'URL invalide' });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  return sendStream(event, Readable.from(downloadGgufFromUrl(url, name)));
});
