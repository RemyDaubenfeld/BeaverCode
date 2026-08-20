import { $fetch } from 'ofetch';
import * as cheerio from 'cheerio';
import type { LibraryModel, LibrarySearchResponse, LibraryRefreshResponse } from '../types/library';

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_LIBRARY_URL = 'https://ollama.com/library';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { models: LibraryModel[]; fetchedAt: number } | null = null;

/**
 * Scrape ollama.com/library en direct, sans aucune écriture disque.
 *
 * ⚠️ Dépend de la structure HTML de ollama.com, non documentée officiellement —
 * peut casser si le site change de markup. Repères utilisés (vérifiés manuellement
 * sur le HTML réel) : chaque carte modèle est un `a[href^="/library/"]` contenant un
 * `h2` (nom) suivi d'un `p` (description), et des badges `span.rounded-md` pour les
 * tailles/capacités — les badges de taille utilisent spécifiquement la classe couleur
 * `bg-[#ddf4ff]`, ce qui les distingue des badges de capacité (vision/tools/thinking…).
 */
const scrapeOllamaLibrary = async (): Promise<LibraryModel[]> => {
  const html = await $fetch<string>(OLLAMA_LIBRARY_URL, { responseType: 'text', timeout: 15000 });
  const $ = cheerio.load(html);

  const scraped: LibraryModel[] = [];
  const seen = new Set<string>();

  $('a[href^="/library/"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? '';
    const identifier = href.replace(/^\/library\//, '').trim();
    if (!identifier || identifier.includes(':') || identifier.includes('/') || seen.has(identifier)) return;
    seen.add(identifier);

    const name = $el.find('h2').text().replace(/\s+/g, ' ').trim() || identifier;
    const description = $el.find('h2 + p').text().replace(/\s+/g, ' ').trim();
    const labels = $el
      .find('span.rounded-md')
      .filter((_, s) => ($(s).attr('class') ?? '').includes('#ddf4ff'))
      .map((_, s) => $(s).text().trim().toUpperCase())
      .get()
      .filter(Boolean);

    scraped.push({
      model_identifier: identifier,
      model_name: name,
      description: description || undefined,
      labels,
      url: `${OLLAMA_LIBRARY_URL}/${identifier}`,
    });
  });

  return scraped;
};

/**
 * Renvoie la liste de modèles courante : scrape en direct si le cache mémoire
 * (5 min) est expiré, sinon renvoie le cache. En cas d'échec du scrape (site
 * ollama.com down, réseau coupé), retombe sur le cache existant même expiré
 * s'il y en a un — sinon l'erreur remonte (pas de secours local : si la source
 * est injoignable, il n'y a de toute façon rien de nouveau à proposer).
 */
const getLibraryModels = async (): Promise<LibraryModel[]> => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  try {
    const models = await scrapeOllamaLibrary();
    cache = { models, fetchedAt: Date.now() };
    return models;
  } catch (error) {
    console.error('Erreur lors du scraping de ollama.com/library:', error);
    if (cache) return cache.models;
    throw error;
  }
};

export const searchLibrary = async (query: string): Promise<LibrarySearchResponse> => {
  const models = await getLibraryModels();
  const filtered = models.filter((m) =>
    !query || m.model_name.toLowerCase().includes(query.toLowerCase())
  );
  return { models: filtered };
};

/**
 * Force un nouveau scrape (ignore le cache) et compare avec le précédent
 * scrape connu de ce processus pour signaler les modèles nouvellement apparus.
 * Rien n'est persisté sur disque — le résultat ne vit qu'en mémoire.
 */
export const refreshLibrary = async (): Promise<LibraryRefreshResponse> => {
  const previousIds = new Set((cache?.models ?? []).map((m) => m.model_identifier));
  const models = await scrapeOllamaLibrary();
  const added = models.filter((m) => !previousIds.has(m.model_identifier)).length;
  cache = { models, fetchedAt: Date.now() };
  return { added, total: models.length };
};

/**
 * Lance un pull de modèle sur Ollama et retourne la réponse HTTP brute
 * (streaming NDJSON) telle quelle, pour relais direct par le handler Nitro.
 */
export const pullModelStream = (model: string): Promise<Response> => {
  return fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  });
};
