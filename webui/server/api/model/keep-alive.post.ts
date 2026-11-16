import { setKeepAlive } from '../../services/ollama.service';

// Garder un modèle chargé plus longtemps : POST { name, keep_alive: "30m" | "1h" | "4h" | -1 }
// Liste fermée de valeurs : le formulaire n'en propose pas d'autres, et ça évite de recharger un
// modèle par erreur avec une durée absurde.
const ALLOWED = new Set<string | number>(['30m', '1h', '4h', -1]);

export default defineEventHandler(async (event) => {
  const { name, keep_alive: keepAlive } = await readBody(event);

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "name" requis' });
  }
  if (!ALLOWED.has(keepAlive)) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "keep_alive" invalide (30m, 1h, 4h ou -1)' });
  }

  try {
    await setKeepAlive(name, keepAlive);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors du changement de keep_alive :', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec du changement de durée' });
  }
});
