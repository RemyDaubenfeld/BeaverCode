import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execFileAsync = promisify(execFile);

// --- Configuration du serveur Ollama (variables OLLAMA_*) ---------------------------------------
//
// Ollama lit sa configuration dans ses variables d'environnement, celles du PROCESSUS OLLAMA — pas
// celles du serveur Nitro. Selon l'installation, on les lit :
//   1. Docker  : `docker inspect` du conteneur (OLLAMA_DOCKER_CONTAINER, défaut « ollama ») — cas de cette machine
//   2. systemd : `systemctl show ollama -p Environment`
//   3. sinon   : la dernière ligne « server config » des logs d'Ollama n'est pas accessible ici sans source de
//               logs ; on retombe sur les valeurs par défaut d'Ollama.
//
// ⚠️ L'environnement d'un conteneur contient souvent bien d'autres choses (ici REDIS_PASSWORD, variables
// AnythingLLM…) : on ne garde QUE les variables Ollama connues ci-dessous, jamais l'environnement entier.

export interface OllamaVariable {
  name: string
  value: string | null // valeur définie, ou null = non définie (valeur par défaut d'Ollama)
  default: string
  description: string
}

export interface OllamaConfig {
  source: 'docker' | 'systemd' | 'defaults'
  variables: OllamaVariable[]
  // variables OLLAMA_* définies mais inconnues d'Ollama (sans effet), ex. OLLAMA_NUM_GPU
  unknown: string[]
  // valeurs dérivées utilisées par l'estimation mémoire (ollama.service.ts)
  kv_cache_type: 'f16' | 'q8_0' | 'q4_0'
  kv_bytes_per_value: number
  default_num_ctx: number
}

// Variables lues par le serveur Ollama 0.31 (liste de sa ligne de log « server config ») qui comptent pour
// cette WebUI, avec leur défaut et leur effet
const KNOWN: Array<Omit<OllamaVariable, 'value'>> = [
  { name: 'OLLAMA_KV_CACHE_TYPE', default: 'f16', description: 'Format du KV cache (mémoire du contexte) : f16 (2 octets par valeur), q8_0 (≈ 1, divise sa taille par 2), q4_0 (≈ 0,56). Nécessite la flash attention, sinon ignoré.' },
  { name: 'OLLAMA_FLASH_ATTENTION', default: 'false', description: 'Flash attention : calcul de l\'attention plus économe en mémoire. Requis pour compresser le KV cache.' },
  { name: 'OLLAMA_CONTEXT_LENGTH', default: '4096', description: 'Contexte par défaut des modèles dont le modelfile ne fixe pas num_ctx (0 = défaut d\'Ollama, 4096).' },
  { name: 'OLLAMA_KEEP_ALIVE', default: '5m', description: 'Durée pendant laquelle un modèle reste chargé après sa dernière utilisation.' },
  { name: 'OLLAMA_MAX_LOADED_MODELS', default: '3 × nb de GPU', description: 'Nombre maximal de modèles chargés en mémoire en même temps.' },
  { name: 'OLLAMA_NUM_PARALLEL', default: '1', description: 'Requêtes traitées en parallèle par modèle (chacune réserve son propre KV cache).' },
  { name: 'OLLAMA_GPU_OVERHEAD', default: '0', description: 'Mémoire GPU (octets) laissée libre par Ollama en plus de sa marge habituelle.' },
  { name: 'OLLAMA_SCHED_SPREAD', default: 'false', description: 'Répartir un modèle sur tous les GPU au lieu d\'en remplir un au maximum.' },
  { name: 'OLLAMA_LOAD_TIMEOUT', default: '5m', description: 'Délai maximal de chargement d\'un modèle avant abandon.' },
  { name: 'OLLAMA_MAX_QUEUE', default: '512', description: 'Nombre maximal de requêtes en attente.' },
  { name: 'OLLAMA_HOST', default: '127.0.0.1:11434', description: 'Adresse d\'écoute du serveur Ollama.' },
  { name: 'OLLAMA_MODELS', default: '~/.ollama/models', description: 'Dossier des modèles.' },
  { name: 'OLLAMA_NOPRUNE', default: 'false', description: 'Ne pas supprimer au démarrage les fichiers de modèles inutilisés.' },
  { name: 'OLLAMA_DEBUG', default: 'false', description: 'Logs détaillés.' },
];
// variables lues par Ollama mais sans intérêt ici (on ne les signale pas comme inconnues)
const IGNORED = new Set([
  'OLLAMA_ORIGINS', 'OLLAMA_NOHISTORY', 'OLLAMA_NO_CLOUD', 'OLLAMA_REMOTES', 'OLLAMA_VULKAN', 'OLLAMA_EDITOR',
  'OLLAMA_GO_TEMPLATE', 'OLLAMA_IGPU_ENABLE', 'OLLAMA_LLM_LIBRARY', 'OLLAMA_MAX_TRANSFER_STREAMS',
  'OLLAMA_DEBUG_LOG_REQUESTS', 'OLLAMA_MULTIUSER_CACHE', 'OLLAMA_NEW_ENGINE', 'OLLAMA_INTEL_GPU',
]);

// Octets par valeur du KV cache selon son format. q8_0 / q4_0 stockent des paquets de 32 valeurs avec une
// échelle de 2 octets : 34/32 et 18/32. Vérifié sur qwen3:8b en contexte 32k (q8_0) : estimé 7,62 Go,
// réel 7,56 Go (avec f16 : 9,83 Go estimés, +30 %).
const KV_BYTES: Record<OllamaConfig['kv_cache_type'], number> = { f16: 2, q8_0: 34 / 32, q4_0: 18 / 32 };

async function readDockerEnv(): Promise<Record<string, string> | null> {
  const container = process.env.OLLAMA_DOCKER_CONTAINER || 'ollama';
  try {
    const { stdout } = await execFileAsync('docker', ['inspect', '-f', '{{json .Config.Env}}', container], { timeout: 3000 });
    const list: string[] = JSON.parse(stdout.trim());
    return Object.fromEntries(list.map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
  } catch {
    return null; // pas de Docker, ou pas de conteneur de ce nom
  }
}

async function readSystemdEnv(): Promise<Record<string, string> | null> {
  if (platform() !== 'linux') return null;
  try {
    // « Environment=OLLAMA_HOST=0.0.0.0 OLLAMA_KEEP_ALIVE=30m » (vide si le service n'existe pas)
    const { stdout } = await execFileAsync('systemctl', ['show', 'ollama', '-p', 'Environment', '-p', 'LoadState'], { timeout: 3000 });
    if (!/LoadState=loaded/.test(stdout)) return null;
    const line = /^Environment=(.*)$/m.exec(stdout)?.[1] ?? '';
    return Object.fromEntries(
      line.split(/\s+/).filter((kv) => kv.includes('=')).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])
    );
  } catch {
    return null;
  }
}

const isTrue = (v: string | null | undefined) => !!v && /^(1|true|yes|on)$/i.test(v.trim());

function buildConfig(source: OllamaConfig['source'], env: Record<string, string>): OllamaConfig {
  const variables = KNOWN.map((k) => ({ ...k, value: env[k.name] ?? null }));
  const known = new Set(KNOWN.map((k) => k.name));
  const unknown = Object.keys(env).filter((n) => n.startsWith('OLLAMA_') && !known.has(n) && !IGNORED.has(n)).sort();

  // le format du KV cache n'est appliqué qu'avec la flash attention (sinon Ollama reste en f16)
  const requested = (env.OLLAMA_KV_CACHE_TYPE ?? 'f16').toLowerCase();
  const kvType: OllamaConfig['kv_cache_type'] =
    isTrue(env.OLLAMA_FLASH_ATTENTION) && (requested === 'q8_0' || requested === 'q4_0') ? requested : 'f16';

  const ctx = Number(env.OLLAMA_CONTEXT_LENGTH);
  return {
    source,
    variables,
    unknown,
    kv_cache_type: kvType,
    kv_bytes_per_value: KV_BYTES[kvType],
    default_num_ctx: Number.isInteger(ctx) && ctx > 0 ? ctx : 4096,
  };
}

// La configuration ne change qu'au redémarrage d'Ollama : cache d'une minute
let cache: { at: number; promise: Promise<OllamaConfig> } | null = null;
const TTL_MS = 60_000;

export function getOllamaConfig(): Promise<OllamaConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = (async () => {
    const docker = await readDockerEnv();
    if (docker) return buildConfig('docker', docker);
    const systemd = await readSystemdEnv();
    if (systemd) return buildConfig('systemd', systemd);
    return buildConfig('defaults', {});
  })();
  cache = { at: Date.now(), promise };
  return promise;
}
