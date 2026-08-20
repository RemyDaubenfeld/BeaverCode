import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';

const OLLAMA_URL = 'http://localhost:11434';
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
 * bloc SYSTEM. Ignore volontairement FROM (choisi dynamiquement dans CreateModelModal,
 * cf. commentaire d'origine dans CreateModelfileModal.vue) et TEMPLATE (hors scope) —
 * couvre le format réellement utilisé dans les .modelfile existants (~/.ollama/modelfiles).
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
 * Sérialise des paramètres structurés (formulaire CreateModelfileModal) en fichier
 * .modelfile DSL, sans ligne FROM — ajoutée dynamiquement à la création du modèle
 * (CreateModelModal), pas figée dans le template.
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
 * Crée un modèle Ollama à partir d'un modèle de base existant (`from`) et des
 * paramètres/system extraits d'un .modelfile — API structurée d'Ollama, pas le DSL
 * texte brut (`modelfile: "..."` n'est plus accepté par `/api/create`, vérifié sur
 * Ollama 0.31.1 : "neither 'from' or 'files' was specified").
 */
export async function* createModelFromTemplate(
  name: string,
  fromModel: string,
  modelfileFilename: string
): AsyncGenerator<string> {
  try {
    const { parameters, system } = await readModelfile(modelfileFilename);

    const response = await fetch(`${OLLAMA_URL}/api/create`, {
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
  } catch (error) {
    yield JSON.stringify({ status: 'error', error: errorMessage(error) }) + '\n';
  }
}
