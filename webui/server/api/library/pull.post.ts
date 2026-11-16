import { pullModelStream } from '../../services/library.service';

export default defineEventHandler(async (event) => {
  const { model } = getQuery(event);
  if (!model || typeof model !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "model" requis' });
  }

  // Si le client coupe la connexion (bouton Annuler), on coupe aussi la requête vers Ollama,
  // qui arrête alors le téléchargement (les blobs partiels sont conservés pour une reprise).
  const controller = new AbortController();
  event.node.res.on('close', () => controller.abort());

  const ollamaResponse = await pullModelStream(model, controller.signal);

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
