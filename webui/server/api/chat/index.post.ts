import { buildOllamaPayload, chatStream, validateChatRequest } from '../../services/chat.service';

// Chat manuel : relaie la requête vers Ollama et renvoie son flux NDJSON tel quel (un morceau JSON par ligne :
// message.content / message.thinking, puis un dernier morceau `done` avec les durées et compteurs de tokens).
// Le client lit le flux avec fetch().body.getReader(), comme le pull de modèle et le benchmark.
// Une ligne est ajoutée EN TÊTE du flux : {"beavercode_request": <corps envoyé à Ollama>}, pour la vue
// « requête brute » du chat (le navigateur voit ainsi exactement ce qu'Ollama a reçu, sans le reconstruire).
export default defineEventHandler(async (event) => {
  const req = validateChatRequest(await readBody(event));

  // Bouton « Arrêter » : le navigateur coupe la connexion → on coupe la requête vers Ollama, qui arrête la
  // génération. Écoute de la RÉPONSE : la requête émet « close » dès la lecture de son corps (voir run.post.ts).
  const controller = new AbortController();
  event.node.res.on('close', () => controller.abort());

  const payload = buildOllamaPayload(req);
  let ollamaResponse: Response;
  try {
    ollamaResponse = await chatStream(payload, controller.signal);
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Ollama injoignable' });
  }
  if (!ollamaResponse.ok || !ollamaResponse.body) {
    // ex. 404 « model not found » : Ollama renvoie {"error": "..."}
    const detail = await ollamaResponse.json().catch(() => null);
    throw createError({ statusCode: ollamaResponse.status || 502, statusMessage: detail?.error ?? 'Échec de la requête de chat' });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  const head = new TextEncoder().encode(JSON.stringify({ beavercode_request: payload }) + '\n');
  const reader = ollamaResponse.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) { ctrl.enqueue(head); },
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) ctrl.close();
      else ctrl.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return sendStream(event, stream);
});
