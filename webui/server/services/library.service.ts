import { $fetch } from 'ofetch';
import * as cheerio from 'cheerio';
import type { LibraryModel, LibrarySearchResponse, LibraryRefreshResponse, HfRepo, HfGgufFile, HfSearchResult } from '../types/library';
import { getOllamaUrl } from './settings.service';

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
 * `signal` permet d'interrompre le pull côté Ollama (annulation depuis l'UI).
 */
export const pullModelStream = (model: string, signal?: AbortSignal): Promise<Response> => {
  return fetch(`${getOllamaUrl()}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal,
  });
};

// --- Dépôts HuggingFace ------------------------------------------------------------------------
//
// Ollama sait télécharger un GGUF directement depuis HuggingFace : `ollama pull hf.co/<user>/<repo>:<quant>`
// (HuggingFace sert un manifeste au format Ollama, le tag sélectionne le fichier dont le nom contient
// la quantification). Le pull lui-même passe donc par la file existante (usePulls → /api/library/pull) ;
// ici on liste seulement les fichiers GGUF du dépôt pour choisir une quantification en connaissant sa taille.

const HF_API_URL = 'https://huggingface.co/api/models';

// Fin du nom de fichier = quantification : Q4_K_M, IQ4_XS, UD-Q4_K_XL, BF16, F16, Q8_0…
const QUANT_REGEX = /[-._]((?:UD-)?(?:I?Q\d[A-Z0-9_]*|BF16|F16|F32))$/i;
// Fichier découpé : <nom>-00001-of-00003.gguf
const SPLIT_REGEX = /-(\d{5})-of-(\d{5})$/;

interface HfTreeEntry {
  type: 'file' | 'directory'
  path: string
  size: number
}

export class HfRepoError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

export async function getHfRepo(repo: string): Promise<HfRepo> {
  const [info, tree] = await Promise.all([
    $fetch<any>(`${HF_API_URL}/${repo}`),
    // recursive : certains dépôts rangent les gros modèles découpés dans des sous-dossiers (BF16/…)
    $fetch<HfTreeEntry[]>(`${HF_API_URL}/${repo}/tree/main`, { query: { recursive: true } }),
  ]).catch((error) => {
    // HuggingFace répond 401 (et non 404) pour un dépôt inexistant comme pour un dépôt privé
    const status = error?.response?.status;
    if (status === 401 || status === 404) throw new HfRepoError('Dépôt introuvable ou privé', 404);
    throw new HfRepoError('HuggingFace ne répond pas', 502);
  });

  // regroupe par quantification (les morceaux d'un fichier découpé n'en font qu'un)
  const byQuant = new Map<string, HfGgufFile>();
  for (const entry of tree) {
    if (entry.type !== 'file' || !entry.path.toLowerCase().endsWith('.gguf')) continue;
    const filename = entry.path.split('/').pop()!;
    // projecteur vision (mmproj-*.gguf) : pas un modèle à part entière, Ollama le récupère avec le modèle
    if (filename.toLowerCase().startsWith('mmproj')) continue;
    let stem = filename.slice(0, -'.gguf'.length);
    const split = SPLIT_REGEX.test(stem);
    stem = stem.replace(SPLIT_REGEX, '');
    const quant = QUANT_REGEX.exec(stem)?.[1];
    if (!quant) continue;
    const key = quant.toUpperCase();
    const existing = byQuant.get(key);
    if (existing) {
      existing.size += entry.size;
      existing.split ||= split;
    } else {
      byQuant.set(key, { quant, filename: entry.path, size: entry.size, split });
    }
  }

  const total = info.gguf?.total ?? null;
  return {
    repo: info.id ?? repo,
    gated: !!info.gated,
    downloads: info.downloads ?? null,
    likes: info.likes ?? null,
    architecture: info.gguf?.architecture ?? null,
    total_params: total,
    active_params: moeActiveParams(info.id ?? repo, total),
    context_length: info.gguf?.context_length ?? null,
    files: [...byQuant.values()].sort((a, b) => a.size - b.size),
  };
}

// HuggingFace ne donne pas les paramètres actifs d'un MoE (il faudrait lire les métadonnées du GGUF).
// Convention de nommage quasi universelle : « Qwen3-30B-A3B », « gemma-4-26B-A4B » → A3B = 3B actifs.
// Sans ce motif dans le nom, le modèle est traité comme dense (actifs = total).
function moeActiveParams(repo: string, total: number | null): number | null {
  const match = /[-_]A(\d+(?:\.\d+)?)B(?:[-_]|$)/i.exec(repo);
  if (!match || !total) return total;
  const active = Number(match[1]) * 1e9;
  return active < total ? active : total;
}

// Recherche de dépôts contenant des GGUF (le seul format qu'Ollama sait tirer de HuggingFace), triés
// par téléchargements. Sans texte : les dépôts GGUF les plus téléchargés.
export async function searchHf(query: string): Promise<HfSearchResult[]> {
  const models = await $fetch<any[]>(HF_API_URL, {
    query: { search: query.trim() || undefined, filter: 'gguf', sort: 'downloads', limit: 30 },
  }).catch(() => {
    throw new HfRepoError('HuggingFace ne répond pas', 502);
  });
  return models.map((m) => ({
    repo: m.id,
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    pipeline_tag: m.pipeline_tag ?? null,
    updated_at: m.lastModified ?? m.createdAt ?? null,
  }));
}
