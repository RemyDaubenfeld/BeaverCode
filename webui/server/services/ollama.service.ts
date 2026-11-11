import { $fetch } from 'ofetch';

/**
 * Récupère la liste complète des modèles disponibles via Ollama
 * @returns {Promise<Array<{ name: string }>>} Liste des modèles
 */
export const getModelsList = async (): Promise<Array<{ name: string }>> => {
  try {
    const response = await $fetch<{ models: Array<{ name: string }> }>(
      'http://localhost:11434/api/tags'
    );
    return response.models || [];
    
  } catch (error) {
    console.error('Erreur lors de la récupération de la liste des modèles:', error);
    return [];
  }
};

/**
 * Récupère le modèle actuellement chargé (via api/ps)
 * @returns {Promise<{ name: string } | null>} Le modèle chargé, ou null
 */
export const getLoadedModel = async (): Promise<{ name: string } | null> => {
  try {
    const response = await $fetch<{ models: Array<{ name: string }> }>(
      'http://localhost:11434/api/ps'
    );
    return response.models?.[0] || null;
  } catch (error) {
    console.error('Erreur lors de la récupération du modèle chargé:', error);
    return null;
  }
};

/**
 * Supprime un modèle Ollama (`DELETE /api/delete`)
 * @param {string} name Nom (avec tag) du modèle à supprimer
 */
export const deleteModel = async (name: string): Promise<void> => {
  await $fetch('http://localhost:11434/api/delete', {
    method: 'DELETE',
    body: { model: name },
  });
};

export interface LoadedModelInfo {
  name: string
  size_vram: number
  expires_at: string
  context_length?: number
}

/**
 * Liste tous les modèles actuellement chargés en mémoire (VRAM/RAM) via `/api/ps`.
 */
export const getLoadedModels = async (): Promise<LoadedModelInfo[]> => {
  try {
    const response = await $fetch<{ models: LoadedModelInfo[] }>(
      'http://localhost:11434/api/ps'
    );
    return response.models ?? [];
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles chargés:', error);
    return [];
  }
};

/**
 * Décharge un modèle de la mémoire immédiatement (`keep_alive: 0` sur `/api/generate`,
 * mécanisme officiel d'Ollama pour forcer un unload sans attendre l'expiration naturelle).
 */
export const unloadModel = async (name: string): Promise<void> => {
  await $fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: { model: name, keep_alive: 0 },
  });
};