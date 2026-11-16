import { readdir, stat, statfs } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { $fetch } from 'ofetch'
import { getOllamaUrl } from '../services/settings.service'

// Statut d'Ollama + espace disque, pour le panneau « Système » de la barre latérale.
// GET /api/ollama → { online, version, storage: { models_bytes, partial_bytes, gguf_bytes, disk_total_bytes, disk_free_bytes } }

// Dossier des modèles d'Ollama : OLLAMA_MODELS s'il est défini (même variable que le serveur Ollama),
// sinon ~/.ollama/models. Les .gguf importés depuis la WebUI sont dans ~/.ollama/gguf (import.service.ts).
const MODELS_DIR = process.env.OLLAMA_MODELS || join(homedir(), '.ollama', 'models')
const GGUF_DIR = join(homedir(), '.ollama', 'gguf')

// Espace occupé par un dossier PLAT (pas de sous-dossiers à parcourir) : somme des fichiers.
// - Pour les modèles, on additionne les blobs plutôt que la taille de chaque modèle : Ollama ne stocke
//   qu'une fois un fichier partagé par plusieurs modèles (copie, modèle modifié depuis la fiche…),
//   additionner les tailles de /api/tags compterait ces poids plusieurs fois.
// - On compte l'espace ALLOUÉ (blocs × 512, comme `du`), pas la taille apparente : les téléchargements
//   interrompus (`sha256-…-partial*`, gardés par Ollama pour reprendre) sont des fichiers creux qui
//   réservent la taille finale sans l'occuper (mesuré : 35 Go apparents, 1,4 Go réellement occupés).
async function dirUsage(dir: string): Promise<{ bytes: number; partialBytes: number }> {
  try {
    const names = await readdir(dir)
    const entries = await Promise.all(
      names.map((n) => stat(join(dir, n)).then((s) => ({ n, used: s.isFile() ? s.blocks * 512 : 0 }), () => ({ n, used: 0 })))
    )
    return {
      bytes: entries.reduce((a, e) => a + e.used, 0),
      partialBytes: entries.filter((e) => e.n.includes('-partial')).reduce((a, e) => a + e.used, 0),
    }
  } catch {
    return { bytes: 0, partialBytes: 0 } // dossier absent ou illisible
  }
}

// Le stockage ne change qu'au téléchargement / à la suppression d'un modèle : cache de 30 s
let storageCache: { at: number; value: Record<string, number | null> } | null = null
const STORAGE_TTL_MS = 30_000

async function readStorage() {
  if (storageCache && Date.now() - storageCache.at < STORAGE_TTL_MS) return storageCache.value
  const [models, gguf, fs] = await Promise.all([
    dirUsage(join(MODELS_DIR, 'blobs')),
    dirUsage(GGUF_DIR),
    statfs(MODELS_DIR).catch(() => null),
  ])
  const value = {
    models_bytes: models.bytes,
    partial_bytes: models.partialBytes, // inclus dans models_bytes : téléchargements interrompus
    gguf_bytes: gguf.bytes,
    // disque qui contient le dossier des modèles (bsize × nb de blocs)
    disk_total_bytes: fs ? fs.blocks * fs.bsize : null,
    disk_free_bytes: fs ? fs.bavail * fs.bsize : null,
  }
  storageCache = { at: Date.now(), value }
  return value
}

export default defineEventHandler(async () => {
  const [version, storage] = await Promise.all([
    $fetch<{ version: string }>(getOllamaUrl('/api/version'), { timeout: 2000 })
      .then((r) => r.version)
      .catch(() => null),
    readStorage(),
  ])
  return { online: version != null, version, url: getOllamaUrl(), storage }
})
