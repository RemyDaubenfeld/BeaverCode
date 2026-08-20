import { Readable } from 'node:stream';
import { createModelFromTemplate } from '../../services/modelfile.service';

export default defineEventHandler(async (event) => {
  const { name, fromModel, modelfileFilename } = await readBody(event);

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }
  if (!fromModel || typeof fromModel !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "fromModel" requis' });
  }
  if (!modelfileFilename || typeof modelfileFilename !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "modelfileFilename" requis' });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  return sendStream(event, Readable.from(createModelFromTemplate(name, fromModel, modelfileFilename)));
});
