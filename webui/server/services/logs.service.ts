import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync, openSync, closeSync, readSync } from 'node:fs';
import { watch, type FSWatcher } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export type LogEmitter = {
  source: 'docker' | 'journalctl' | 'file';
  onLine: (cb: (line: string) => void) => void;
  stop: () => void;
};

async function dockerContainerRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('docker', ['inspect', '-f', '{{.State.Running}}', name], { timeout: 3000 });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function journalctlUnitExists(unit: string): Promise<boolean> {
  if (platform() !== 'linux') return false;
  try {
    await execFileAsync('journalctl', ['-u', unit, '-n', '1', '--no-pager'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function defaultLogFilePath(): string {
  if (platform() === 'win32') {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Ollama', 'server.log');
  }
  return join(homedir(), '.ollama', 'logs', 'server.log');
}

function startProcessSource(source: 'docker' | 'journalctl', command: string, args: string[]): LogEmitter {
  const proc = spawn(command, args);
  const listeners: Array<(line: string) => void> = [];
  const emit = (buf: Buffer) => {
    buf
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => listeners.forEach((cb) => cb(line)));
  };
  proc.stdout?.on('data', emit);
  proc.stderr?.on('data', emit);
  return {
    source,
    onLine: (cb) => listeners.push(cb),
    stop: () => proc.kill(),
  };
}

function startFileTailSource(filePath: string): LogEmitter {
  const listeners: Array<(line: string) => void> = [];
  let position = 0;
  try {
    position = statSync(filePath).size;
  } catch {
    position = 0;
  }

  const initialChunkSize = Math.min(position, 20_000);
  const startPos = position - initialChunkSize;
  let pendingInitial: string[] = [];
  if (initialChunkSize > 0) {
    const fd = openSync(filePath, 'r');
    const initialBuf = Buffer.alloc(initialChunkSize);
    readSync(fd, initialBuf, 0, initialChunkSize, startPos);
    closeSync(fd);
    pendingInitial = initialBuf.toString('utf8').split(/\r?\n/).filter(Boolean);
  }

  let watcher: FSWatcher;
  try {
    watcher = watch(filePath, { persistent: true }, () => {
      try {
        const newSize = statSync(filePath).size;
        if (newSize < position) {
          position = 0;
        }
        if (newSize > position) {
          const fd = openSync(filePath, 'r');
          const len = newSize - position;
          const buf = Buffer.alloc(len);
          readSync(fd, buf, 0, len, position);
          closeSync(fd);
          position = newSize;
          buf
            .toString('utf8')
            .split(/\r?\n/)
            .filter(Boolean)
            .forEach((line) => listeners.forEach((cb) => cb(line)));
        }
      } catch {
        // lecture transitoire ratée (rotation de fichier...), on ignore
      }
    });
  } catch (error) {
    throw new Error(`Impossible de surveiller le fichier de logs ${filePath}: ${(error as Error).message}`);
  }

  return {
    source: 'file',
    onLine: (cb) => {
      listeners.push(cb);
      pendingInitial.forEach((line) => cb(line));
      pendingInitial = [];
    },
    stop: () => watcher.close(),
  };
}

/**
 * Détecte automatiquement comment Ollama tourne (Docker, service systemd,
 * ou process natif écrivant dans un fichier) et retourne un flux de logs.
 */
export async function openOllamaLogStream(): Promise<LogEmitter> {
  const containerName = process.env.OLLAMA_DOCKER_CONTAINER || 'ollama';
  if (await dockerContainerRunning(containerName)) {
    return startProcessSource('docker', 'docker', ['logs', '-f', '--tail', '200', containerName]);
  }

  if (await journalctlUnitExists('ollama')) {
    return startProcessSource('journalctl', 'journalctl', ['-u', 'ollama', '-f', '-n', '200', '--no-pager']);
  }

  const filePath = process.env.OLLAMA_LOG_FILE || defaultLogFilePath();
  if (existsSync(filePath)) {
    return startFileTailSource(filePath);
  }

  throw new Error(
    `Impossible de trouver les logs d'Ollama (ni conteneur Docker "${containerName}", ni service systemd "ollama", ni fichier "${filePath}"). Définis la variable d'environnement OLLAMA_LOG_FILE si Ollama écrit ailleurs.`
  );
}
