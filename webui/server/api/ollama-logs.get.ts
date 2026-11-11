import { openOllamaLogStream } from '../services/logs.service';

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/event-stream');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  setResponseHeader(event, 'Connection', 'keep-alive');
  event.node.res.flushHeaders?.();

  let emitter;
  try {
    emitter = await openOllamaLogStream();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    event.node.res.write(`event: error\ndata: ${JSON.stringify(message)}\n\n`);
    event.node.res.end();
    return;
  }

  event.node.res.write(`event: source\ndata: ${JSON.stringify(emitter.source)}\n\n`);

  emitter.onLine((line) => {
    event.node.res.write(`data: ${JSON.stringify(line)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    event.node.res.write(`: heartbeat\n\n`);
  }, 15000);

  event.node.req.on('close', () => {
    clearInterval(heartbeat);
    emitter.stop();
  });

  return new Promise(() => {});
});
