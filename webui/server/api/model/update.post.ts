import { Readable } from 'node:stream';
import { updateModel } from '../../services/modelfile.service';

// Modifie les paramètres / le prompt système d'un modèle existant (NDJSON de progression)
// Body : { name, parameters: { temperature: 0.6, stop: ["<|im_end|>"], … }, system?: string, target?: string }
// `target` absent ou égal à `name` → le modèle est écrasé ; sinon le résultat est enregistré sous ce nouveau nom
// `rename: true` (avec `target`) → l'original est supprimé après création réussie du nouveau modèle
export default defineEventHandler(async (event) => {
  const { name, parameters, system, target, rename } = await readBody(event);

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }
  if (parameters != null && (typeof parameters !== 'object' || Array.isArray(parameters))) {
    throw createError({ statusCode: 400, statusMessage: '"parameters" doit être un objet' });
  }
  if (target != null && (typeof target !== 'string' || !target.trim())) {
    throw createError({ statusCode: 400, statusMessage: '"target" doit être un nom de modèle' });
  }

  setResponseHeader(event, 'Content-Type', 'application/x-ndjson');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  return sendStream(
    event,
    Readable.from(updateModel(name, parameters ?? {}, typeof system === 'string' ? system : '', target?.trim() || name, rename === true))
  );
});
