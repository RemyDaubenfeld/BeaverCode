import { $fetch } from 'ofetch';
import { validateOllamaUrl } from '../../services/settings.service';

// Teste une URL d'Ollama AVANT de l'enregistrer : POST { url } → { ok, version } ou { ok: false, message }
export default defineEventHandler(async (event) => {
  const { url } = await readBody(event);
  const origin = validateOllamaUrl(url);
  try {
    const { version } = await $fetch<{ version: string }>(`${origin}/api/version`, { timeout: 3000 });
    return { ok: true, version };
  } catch {
    return { ok: false, message: `Aucun serveur Ollama ne répond sur ${origin}` };
  }
});
