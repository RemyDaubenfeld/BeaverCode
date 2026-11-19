import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOllamaUrl } from './settings.service';

// --- Chat manuel (page WebUI) ------------------------------------------------------------------
//
// Deux rôles :
// 1. relayer une requête de chat vers Ollama (`/api/chat`, en streaming) après validation ;
// 2. enregistrer les conversations, un fichier JSON par conversation dans webui/.data/conversations/
//    (dossier .data ignoré par git, comme settings.json : données locales à la machine).
//
// La conversation est construite côté client (composable useChat.js) et enregistrée en entier après
// chaque réponse : le serveur ne fait que valider et stocker, il n'a pas d'état.

const CONVERSATIONS_DIR = fileURLToPath(new URL('../../.data/conversations/', import.meta.url));

export interface ChatOptions {
  temperature: number | null // null = valeur du modèle (modelfile)
  num_ctx: number | null
  num_predict: number | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  model?: string // modèle qui a produit la réponse (on peut changer de modèle en cours de conversation)
  stats?: Record<string, number | string | null>
  error?: string
}

export interface Conversation {
  id: string
  title: string
  model: string | null
  system: string
  options: ChatOptions
  think: boolean
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface ChatRequest {
  model: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  system: string
  options: ChatOptions
  think: boolean | null // null = modèle sans capacité thinking : paramètre non envoyé
}

const fail = (message: string) => {
  throw createError({ statusCode: 400, statusMessage: message });
};
const isNum = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

// Mêmes bornes que les réglages du benchmark ; null = valeur du modèle pour chacun
export function validateChatOptions(o: unknown): ChatOptions {
  if (o == null) return { temperature: null, num_ctx: null, num_predict: null };
  const v = o as Record<string, unknown>;
  if (v.temperature != null && !isNum(v.temperature, 0, 2)) fail('Température invalide (0 à 2, ou valeur du modèle)');
  if (v.num_ctx != null && !(isNum(v.num_ctx, 512, 262144) && Number.isInteger(v.num_ctx))) fail('Contexte invalide (512 à 262144, ou valeur du modèle)');
  if (v.num_predict != null && !(isNum(v.num_predict, 16, 32768) && Number.isInteger(v.num_predict))) fail('Tokens max invalides (16 à 32768, ou valeur du modèle)');
  return {
    temperature: (v.temperature ?? null) as number | null,
    num_ctx: (v.num_ctx ?? null) as number | null,
    num_predict: (v.num_predict ?? null) as number | null,
  };
}

const MODEL_RE = /^[\w.:/-]+$/;

export function validateChatRequest(body: unknown): ChatRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.model !== 'string' || !MODEL_RE.test(b.model)) fail('Modèle invalide');
  if (!Array.isArray(b.messages) || !b.messages.length) fail('Aucun message');
  const messages = (b.messages as unknown[]).map((m) => {
    const msg = (m ?? {}) as Record<string, unknown>;
    if (msg.role !== 'user' && msg.role !== 'assistant') fail('Rôle de message invalide');
    if (typeof msg.content !== 'string') fail('Contenu de message invalide');
    return { role: msg.role as 'user' | 'assistant', content: msg.content as string };
  });
  if (messages[messages.length - 1]!.role !== 'user') fail('Le dernier message doit venir de l\'utilisateur');
  if (b.system != null && typeof b.system !== 'string') fail('Prompt système invalide');
  if (b.think != null && typeof b.think !== 'boolean') fail('Paramètre de réflexion invalide');
  return {
    model: b.model as string,
    messages,
    system: ((b.system as string | undefined) ?? '').trim(),
    options: validateChatOptions(b.options),
    think: (b.think ?? null) as boolean | null,
  };
}

/** Requête de chat en streaming vers Ollama ; `signal` coupe la génération (bouton Arrêter). */
export function chatStream(req: ChatRequest, signal: AbortSignal): Promise<Response> {
  // seules les options fixées partent : les autres gardent la valeur du modelfile
  const options = Object.fromEntries(Object.entries(req.options).filter(([, v]) => v !== null));
  const messages = req.system ? [{ role: 'system', content: req.system }, ...req.messages] : req.messages;
  const payload: Record<string, unknown> = { model: req.model, messages, stream: true, options };
  if (req.think !== null) payload.think = req.think;
  return fetch(getOllamaUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}

// --- Conversations enregistrées -----------------------------------------------------------------

// id généré côté client (date + aléa) : vérifié avant de servir de nom de fichier (pas de « ../ »)
const ID_RE = /^[\w-]{1,80}$/;

function conversationPath(id: string): string {
  if (!ID_RE.test(id)) throw createError({ statusCode: 400, statusMessage: 'Identifiant de conversation invalide' });
  return join(CONVERSATIONS_DIR, `${id}.json`);
}

export interface ConversationSummary {
  id: string
  title: string
  model: string | null
  message_count: number
  updated_at: string
}

export async function listConversations(): Promise<ConversationSummary[]> {
  let files: string[];
  try {
    files = (await readdir(CONVERSATIONS_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return []; // dossier pas encore créé : aucune conversation
  }
  const summaries: ConversationSummary[] = [];
  for (const file of files) {
    try {
      const c: Conversation = JSON.parse(await readFile(join(CONVERSATIONS_DIR, file), 'utf-8'));
      summaries.push({ id: c.id, title: c.title, model: c.model, message_count: c.messages.length, updated_at: c.updated_at });
    } catch {
      // fichier illisible (écriture interrompue…) : ignoré plutôt que de casser toute la liste
    }
  }
  return summaries.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getConversation(id: string): Promise<Conversation> {
  try {
    return JSON.parse(await readFile(conversationPath(id), 'utf-8'));
  } catch (e: any) {
    if (e?.statusCode) throw e;
    throw createError({ statusCode: 404, statusMessage: 'Conversation introuvable' });
  }
}

export function validateConversation(id: string, body: unknown): Conversation {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.id !== id) fail('Identifiant incohérent');
  if (typeof b.title !== 'string') fail('Titre invalide');
  if (b.model != null && (typeof b.model !== 'string' || !MODEL_RE.test(b.model))) fail('Modèle invalide');
  if (typeof b.system !== 'string') fail('Prompt système invalide');
  if (!Array.isArray(b.messages)) fail('Messages invalides');
  for (const m of b.messages as Array<Record<string, unknown>>) {
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m.content !== 'string') fail('Message invalide');
  }
  const now = new Date().toISOString();
  return {
    id,
    title: (b.title as string).slice(0, 200),
    model: (b.model ?? null) as string | null,
    system: b.system as string,
    options: validateChatOptions(b.options),
    think: b.think !== false,
    messages: b.messages as ChatMessage[],
    created_at: typeof b.created_at === 'string' ? b.created_at : now,
    updated_at: now,
  };
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  await mkdir(CONVERSATIONS_DIR, { recursive: true });
  await writeFile(conversationPath(conversation.id), JSON.stringify(conversation, null, 2) + '\n', 'utf-8');
}

// Renommage seul : updated_at inchangé, pour qu'un renommage ne fasse pas remonter la conversation en tête de liste
export async function renameConversation(id: string, title: unknown): Promise<string> {
  if (typeof title !== 'string' || !title.trim()) fail('Titre vide');
  const conversation = await getConversation(id);
  conversation.title = (title as string).trim().replace(/\s+/g, ' ').slice(0, 200);
  await saveConversation(conversation);
  return conversation.title;
}

export async function deleteConversation(id: string): Promise<void> {
  await rm(conversationPath(id), { force: true });
}
