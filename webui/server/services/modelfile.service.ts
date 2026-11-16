import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { deleteModel } from './ollama.service';
import { renameModelInComparison } from './results.service';
import { getOllamaUrl } from './settings.service';

const MODELFILES_DIR = join(homedir(), '.ollama', 'modelfiles');

const ensureModelfilesDir = async () => {
  await mkdir(MODELFILES_DIR, { recursive: true });
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface ModelfileSummary {
  filename: string
  size: number
}

export const listModelfiles = async (): Promise<ModelfileSummary[]> => {
  await ensureModelfilesDir();
  const entries = await readdir(MODELFILES_DIR);
  const files = entries.filter((f) => f.toLowerCase().endsWith('.modelfile'));
  return Promise.all(
    files.map(async (filename) => {
      const { size } = await stat(join(MODELFILES_DIR, filename));
      return { filename, size };
    })
  );
};

export type ModelfileParameters = Record<string, string | number | string[]>;

export interface ParsedModelfile {
  parameters: ModelfileParameters
  system: string
}

/**
 * Parseur minimal du DSL Modelfile d'Ollama : extrait les lignes PARAMETER et le
 * bloc SYSTEM. Les .modelfile de ~/.ollama/modelfiles servent de PRESETS (jeux de paramètres
 * réutilisables d'un modèle à l'autre, chargés dans la fiche d'un modèle → « Modifier ») :
 * FROM est donc volontairement ignoré (le modèle est celui de la fiche), TEMPLATE aussi (hors scope).
 */
export const parseModelfile = (content: string): ParsedModelfile => {
  const parameters: ModelfileParameters = {};

  const tripleQuoted = content.match(/SYSTEM\s+"""([\s\S]*?)"""/);
  const singleQuoted = content.match(/SYSTEM\s+"([^"]*)"/);
  const system = tripleQuoted ? tripleQuoted[1].trim() : singleQuoted ? singleQuoted[1].trim() : '';

  const paramLineRegex = /^PARAMETER\s+(\S+)\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = paramLineRegex.exec(content))) {
    const key = match[1];
    let rawValue = match[2].trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      rawValue = rawValue.slice(1, -1);
    }
    const isNumeric = /^-?\d+(\.\d+)?$/.test(rawValue);
    const value: string | number = isNumeric ? Number(rawValue) : rawValue;

    if (key in parameters) {
      const existing = parameters[key];
      parameters[key] = Array.isArray(existing)
        ? [...existing, String(value)]
        : [String(existing), String(value)];
    } else {
      parameters[key] = value;
    }
  }

  return { parameters, system };
};

export const readModelfile = async (filename: string): Promise<ParsedModelfile> => {
  const safeName = basename(filename);
  const content = await readFile(join(MODELFILES_DIR, safeName), 'utf-8');
  return parseModelfile(content);
};

/**
 * Enregistre un preset (paramètres + prompt système saisis dans la fiche d'un modèle) en fichier
 * .modelfile DSL, sans ligne FROM : un preset s'applique à n'importe quel modèle. Écrase un preset
 * de même nom.
 */
export const saveModelfileTemplate = async (
  filename: string,
  parameters: ModelfileParameters,
  system: string
): Promise<string> => {
  await ensureModelfilesDir();
  const base = basename(filename);
  const safeName = base.toLowerCase().endsWith('.modelfile') ? base : `${base}.modelfile`;

  const lines: string[] = [];
  for (const [key, value] of Object.entries(parameters)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === '' || v === null || v === undefined) continue;
      const formatted = typeof v === 'string' && Number.isNaN(Number(v)) ? `"${v}"` : v;
      lines.push(`PARAMETER ${key} ${formatted}`);
    }
  }

  let body = lines.join('\n');
  if (system.trim()) {
    body += `${body ? '\n\n' : ''}SYSTEM """\n${system.trim()}\n"""\n`;
  }

  await writeFile(join(MODELFILES_DIR, safeName), body, 'utf-8');
  return safeName;
};

/**
 * Modifie les paramètres / le prompt système d'un modèle existant en le recréant à partir de
 * lui-même (`from: name`). Comportement d'Ollama 0.31.1, vérifié sur un modèle de test :
 * - les paramètres sont FUSIONNÉS clé par clé avec ceux du modèle : une clé envoyée remplace
 *   l'ancienne valeur (pour `stop`, toute la liste est remplacée), une clé absente est conservée
 *   → impossible de SUPPRIMER un paramètre par cette voie ;
 * - `system` non vide remplace le prompt système, vide ou absent le conserve ;
 * - template, licence, poids… sont conservés (seule la couche de paramètres change, les poids ne
 *   sont ni copiés ni réécrits : l'opération est instantanée même pour un modèle de 50 Go).
 * Avec `target` différent de `name`, le résultat est enregistré sous un NOUVEAU nom et le modèle
 * d'origine reste intact (les poids sont partagés entre les deux, pas dupliqués sur le disque).
 * Avec `rename` en plus, l'original est ensuite supprimé : Ollama n'a pas d'API de renommage, c'est
 * donc « copier sous le nouveau nom puis supprimer l'ancien ». La suppression n'a lieu que si la
 * création a réussi — en cas d'échec, l'original n'est jamais touché. Les résultats de benchmark
 * (leaderboard.json, indexé par nom) suivent le nouveau nom.
 */
export async function* updateModel(
  name: string,
  parameters: ModelfileParameters,
  system: string,
  target: string = name,
  rename = false
): AsyncGenerator<string> {
  try {
    let succeeded = false;
    for await (const line of streamCreate(target, name, parameters, system)) {
      const data = JSON.parse(line);
      if (data.error) throw new Error(data.error);
      if (data.status === 'success') succeeded = true;
      // le « success » final est retardé tant que le renommage n'est pas terminé
      if (!(rename && data.status === 'success')) yield line;
    }

    if (rename && target !== name) {
      if (!succeeded) throw new Error('Création du nouveau modèle non confirmée : original conservé');
      yield JSON.stringify({ status: `suppression de ${name}` }) + '\n';
      await deleteModel(name);
      await renameModelInComparison(name, target);
      yield JSON.stringify({ status: 'success' }) + '\n';
    }
  } catch (error) {
    yield JSON.stringify({ status: 'error', error: errorMessage(error) }) + '\n';
  }
}

// POST /api/create en streaming : relaie les lignes NDJSON de progression d'Ollama
async function* streamCreate(
  name: string,
  fromModel: string,
  parameters: ModelfileParameters,
  system: string
): AsyncGenerator<string> {
  const response = await fetch(`${getOllamaUrl()}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: name,
      from: fromModel,
      parameters: Object.keys(parameters).length ? parameters : undefined,
      system: system || undefined,
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
}
