import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

const OLLAMA_URL = 'http://localhost:11434';
// ~/.ollama/modelfiles reste dédié aux Modelfiles (déjà utilisé par models/setup_hf_models.sh) ;
// les .gguf importés depuis la WebUI vivent dans un dossier séparé.
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
}

/**
 * Liste les .gguf déjà présents dans GGUF_DIR — pour permettre de créer un modèle
 * sans re-transférer un fichier déjà téléchargé/importé précédemment.
 */
export const listExistingGguf = async (): Promise<ExistingGguf[]> => {
  await ensureGgufDir();
  const entries = await readdir(GGUF_DIR);
  const ggufFiles = entries.filter((f) => f.toLowerCase().endsWith('.gguf'));
  const withSizes = await Promise.all(
    ggufFiles.map(async (filename) => {
      const { size } = await stat(join(GGUF_DIR, filename));
      return { filename, size };
    })
  );
  return withSizes;
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

/**
 * Télécharge un GGUF depuis une URL vers GGUF_DIR en yieldant des lignes NDJSON
 * de progression, puis enchaîne automatiquement sur la création du modèle Ollama.
 * Les erreurs sont émises comme ligne NDJSON `{"error": ...}` plutôt que de faire
 * échouer le flux : la connexion streamée est déjà ouverte à ce stade.
 */
export async function* downloadGgufFromUrl(url: string, name: string): AsyncGenerator<string> {
  let dest: string;

  try {
    await ensureGgufDir();
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || `${name}.gguf`);
    dest = join(GGUF_DIR, filename);

    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Échec du téléchargement (HTTP ${response.status})`);
    }

    const total = Number(response.headers.get('content-length') ?? 0);
    let downloaded = 0;
    const fileStream = createWriteStream(dest);
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloaded += value.length;
        fileStream.write(value);
        const progress = total ? Math.round((downloaded / total) * 100) : 0;
        yield JSON.stringify({ status: 'downloading', progress }) + '\n';
      }
    } finally {
      fileStream.end();
      await finished(fileStream);
    }
  } catch (error) {
    yield JSON.stringify({ status: 'error', error: errorMessage(error) }) + '\n';
    return;
  }

  yield* createModelStream(name, dest);
}

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
  const response = await fetch(`${OLLAMA_URL}/api/blobs/sha256:${digest}`, {
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

    const response = await fetch(`${OLLAMA_URL}/api/create`, {
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
