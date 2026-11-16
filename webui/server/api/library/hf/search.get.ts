import { searchHf, HfRepoError } from '../../../services/library.service';

// Recherche de dépôts GGUF sur HuggingFace : GET /api/library/hf/search?q=qwen3 coder
export default defineEventHandler(async (event) => {
  const { q } = getQuery(event);
  try {
    return { models: await searchHf(typeof q === 'string' ? q : '') };
  } catch (error) {
    if (error instanceof HfRepoError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }
    throw error;
  }
});
