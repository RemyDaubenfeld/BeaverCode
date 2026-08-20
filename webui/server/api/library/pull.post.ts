import { pullModelStream } from '../../services/library.service';

export default defineEventHandler(async (event) => {
  const { model } = getQuery(event);
  if (!model || typeof model !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "model" requis' });
  }

  const ollamaResponse = await pullModelStream(model);

  if (!ollamaResponse.ok || !ollamaResponse.body) {
    throw createError({
      statusCode: ollamaResponse.status || 502,
      statusMessage: `Échec du pull Ollama pour "${model}"`,
    });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  return sendStream(event, ollamaResponse.body);
});
