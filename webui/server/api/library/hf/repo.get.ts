import { getHfRepo, HfRepoError } from '../../../services/library.service';

// Fichiers GGUF d'un dépôt HuggingFace : GET /api/library/hf/repo?repo=unsloth/Qwen3-4B-GGUF
export default defineEventHandler(async (event) => {
  const { repo } = getQuery(event);
  // <user>/<repo> : lettres, chiffres, . _ - (évite d'appeler une URL arbitraire sur huggingface.co)
  if (typeof repo !== 'string' || !/^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(repo)) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "repo" invalide (attendu : utilisateur/dépôt)' });
  }

  try {
    return await getHfRepo(repo);
  } catch (error) {
    if (error instanceof HfRepoError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }
    throw error;
  }
});
