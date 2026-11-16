import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { getOllamaUrl } from './settings.service';

// ~/.ollama/modelfiles reste dédié aux presets de paramètres (modelfile.service.ts) ;
// les .gguf importés depuis la WebUI vivent dans un dossier séparé.
// Les modèles HuggingFace ne passent plus par ici : pull direct hf.co/… (library.service.ts).
const GGUF_DIR = join(homedir(), '.ollama', 'gguf');

const ensureGgufDir = async () => {
  await mkdir(GGUF_DIR, { recursive: true });
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Écrit un fichier GGUF uploadé (déjà en mémoire, cf. limite connue des uploads
 * multipart sur de gros fichiers) dans GGUF_DIR, et retourne son chemin.
 */
export const saveUploadedGguf = async (filename: string, data: Buffer): Promise<string> => {
  await ensureGgufDir();
  const dest = join(GGUF_DIR, filename);
  await writeFile(dest, data);
  return dest;
};

export interface ExistingGguf {
  filename: string
  size: number
  // modèles Ollama dont les poids ont exactement la taille de ce fichier → le fichier est déjà importé
  // (Ollama en garde sa propre copie dans ses blobs) et peut être supprimé sans casser ces modèles
  imported_by: string[]
}

const MODELS_DIR = process.env.OLLAMA_MODELS || join(homedir(), '.ollama', 'models');

/**
 * Taille des poids (couche `application/vnd.ollama.image.model`) → modèles qui les utilisent, lu dans les
 * manifestes d'Ollama : <MODELS_DIR>/manifests/<registre>/<espace>/<modèle>/<tag> (un JSON par modèle).
 *
 * On compare par TAILLE et non par empreinte : à l'import, Ollama réécrit l'en-tête du GGUF (ordre des
 * métadonnées), le blob n'a donc pas la même empreinte SHA-256 que le fichier d'origine — vérifié sur
 * gemma4-heretic.Q4_K_M.gguf : même taille, 500 octets d'en-tête différents sur 16,8 Go, poids identiques.
 * À l'octet près sur des fichiers de plusieurs Go, la taille suffit à identifier le fichier.
 */
async function modelLayerSizes(): Promise<Map<number, string[]>> {
  const bySize = new Map<number, string[]>();
  const root = join(MODELS_DIR, 'manifests');
  const list = (dir: string) => readdir(dir).catch(() => [] as string[]);

  for (const registry of await list(root)) {
    for (const namespace of await list(join(root, registry))) {
      for (const model of await list(join(root, registry, namespace))) {
        for (const tag of await list(join(root, registry, namespace, model))) {
          try {
            const manifest = JSON.parse(await readFile(join(root, registry, namespace, model, tag), 'utf-8'));
            const weights = manifest.layers?.find((l: any) => l.mediaType === 'application/vnd.ollama.image.model');
            if (!weights) continue;
            // nom tel qu'Ollama l'affiche : « x:tag » pour la bibliothèque officielle, sinon avec le chemin
            const name = registry === 'registry.ollama.ai'
              ? `${namespace === 'library' ? '' : `${namespace}/`}${model}:${tag}`
              : `${registry}/${namespace}/${model}:${tag}`;
            bySize.set(weights.size, [...(bySize.get(weights.size) ?? []), name]);
          } catch {
            // manifeste illisible : ignoré
          }
        }
      }
    }
  }
  return bySize;
}

/**
 * Liste les .gguf présents dans GGUF_DIR — pour créer un modèle sans re-transférer un fichier, et
 * signaler ceux déjà importés (doublons de ce qu'Ollama stocke déjà dans ses blobs).
 */
export const listExistingGguf = async (): Promise<ExistingGguf[]> => {
  await ensureGgufDir();
  const [entries, layerSizes] = await Promise.all([readdir(GGUF_DIR), modelLayerSizes()]);
  const ggufFiles = entries.filter((f) => f.toLowerCase().endsWith('.gguf'));
  return Promise.all(
    ggufFiles.map(async (filename) => {
      const { size } = await stat(join(GGUF_DIR, filename));
      return { filename, size, imported_by: (layerSizes.get(size) ?? []).sort() };
    })
  );
};

/** Supprime un .gguf de GGUF_DIR (les modèles déjà importés n'en dépendent pas, cf. listExistingGguf). */
export const deleteExistingGguf = async (filename: string): Promise<void> => {
  // basename() : le nom vient du client, pas de sortie de GGUF_DIR possible (« ../ »)
  await unlink(join(GGUF_DIR, basename(filename)));
};

/**
 * Résout un nom de fichier choisi parmi listExistingGguf() vers un chemin absolu
 * dans GGUF_DIR — `basename()` neutralise toute tentative de traversée de chemin
 * (`../`) puisque le nom vient du client.
 */
export const resolveExistingGguf = async (filename: string): Promise<string> => {
  const safeName = basename(filename);
  const path = join(GGUF_DIR, safeName);
  await stat(path); // lève si le fichier n'existe pas
  return path;
};

const sha256File = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });

/**
 * Enregistre le GGUF comme blob Ollama (`/api/blobs/sha256:<digest>`), requis
 * avant `/api/create` — passer `from: <chemin>` avec un chemin de fichier arbitraire
 * échoue (`"invalid model name"`, vérifié sur Ollama 0.31.1) : la référence `from`
 * n'accepte qu'un nom de modèle déjà connu d'Ollama, pas un chemin sur le disque.
 */
const uploadBlob = async (ggufPath: string, digest: string): Promise<void> => {
  const stream = createReadStream(ggufPath);
  const response = await fetch(`${getOllamaUrl()}/api/blobs/sha256:${digest}`, {
    method: 'POST',
    body: Readable.toWeb(stream) as ReadableStream,
    duplex: 'half',
  } as RequestInit);

  if (!response.ok) {
    throw new Error(`Échec de l'envoi du blob (HTTP ${response.status})`);
  }
};

/**
 * Lance la création du modèle Ollama depuis un GGUF local : hash, upload en tant
 * que blob, puis `/api/create` avec `files` (et non `from`, cf. note ci-dessus).
 * Relaie les lignes NDJSON reçues d'Ollama. Erreurs émises en NDJSON
 * (`{"error": ...}`) plutôt que par exception, pour ne pas casser le flux déjà ouvert.
 */
export async function* createModelStream(name: string, ggufPath: string): AsyncGenerator<string> {
  try {
    yield JSON.stringify({ status: 'computing digest' }) + '\n';
    const digest = await sha256File(ggufPath);

    yield JSON.stringify({ status: 'uploading blob' }) + '\n';
    await uploadBlob(ggufPath, digest);

    const response = await fetch(`${getOllamaUrl()}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: name,
        files: { 'model.gguf': `sha256:${digest}` },
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Échec de la création du modèle (HTTP ${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) yield line + '\n';
      }
    }
  } catch (error) {
    yield JSON.stringify({ status: 'error', error: errorMessage(error) }) + '\n';
  }
}
