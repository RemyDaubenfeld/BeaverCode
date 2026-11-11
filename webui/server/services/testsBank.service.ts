import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { TestBankEntry } from '../types/benchmark';

// webui/server/services/testsBank.service.ts -> repo root/benchmark_tool/lib/tests_bank.json
// Fichier partagé avec benchmark_tool/lib/tests_bank.py (voir sa docstring) :
// on lit/écrit directement le JSON, aucun aller-retour par un process Python
// n'est nécessaire pour du CRUD pur.
const TESTS_BANK_PATH = fileURLToPath(new URL('../../../benchmark_tool/lib/tests_bank.json', import.meta.url));

// Catégories fixes reconnues par le reste du système (labels, regroupement par
// capacité, capacités requises — voir BenchmarkRunner.vue). On ne permet pas
// d'en créer de nouvelles depuis l'UI : une catégorie inconnue n'aurait ni
// libellé ni regroupement côté frontend.
export const KNOWN_CATEGORIES = [
  'code',
  'chat',
  'reasoning',
  'instruction_following',
  'summarization',
  'structured_extraction',
  'classification',
  'data_analysis',
  'translation',
  'security',
  'code_style',
  'tool_calling',
  'vision',
] as const;

type TestsBank = Record<string, TestBankEntry[]>;

async function readBank(): Promise<TestsBank> {
  const raw = await readFile(TESTS_BANK_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeBank(bank: TestsBank): Promise<void> {
  await writeFile(TESTS_BANK_PATH, JSON.stringify(bank, null, 2) + '\n', 'utf-8');
}

export async function listTests(): Promise<TestsBank> {
  return readBank();
}

export async function createTest(category: string, test: TestBankEntry): Promise<void> {
  if (!KNOWN_CATEGORIES.includes(category as (typeof KNOWN_CATEGORIES)[number])) {
    throw new Error(`Catégorie inconnue : ${category}`);
  }
  const bank = await readBank();
  const allIds = Object.values(bank).flat().map((t) => t.id);
  if (allIds.includes(test.id)) {
    throw new Error(`Un test avec l'id "${test.id}" existe déjà`);
  }
  bank[category] ??= [];
  bank[category].push(test);
  await writeBank(bank);
}

export async function updateTest(originalId: string, category: string, test: TestBankEntry): Promise<void> {
  if (!KNOWN_CATEGORIES.includes(category as (typeof KNOWN_CATEGORIES)[number])) {
    throw new Error(`Catégorie inconnue : ${category}`);
  }
  const bank = await readBank();
  if (test.id !== originalId) {
    const allIds = Object.values(bank).flat().map((t) => t.id);
    if (allIds.includes(test.id)) {
      throw new Error(`Un test avec l'id "${test.id}" existe déjà`);
    }
  }

  let found = false;
  for (const key of Object.keys(bank)) {
    const idx = bank[key].findIndex((t) => t.id === originalId);
    if (idx !== -1) {
      bank[key].splice(idx, 1);
      found = true;
      break;
    }
  }
  if (!found) throw new Error(`Test "${originalId}" introuvable`);

  bank[category] ??= [];
  bank[category].push(test);
  await writeBank(bank);
}

export async function deleteTest(id: string): Promise<void> {
  const bank = await readBank();
  let found = false;
  for (const key of Object.keys(bank)) {
    const idx = bank[key].findIndex((t) => t.id === id);
    if (idx !== -1) {
      bank[key].splice(idx, 1);
      found = true;
      break;
    }
  }
  if (!found) throw new Error(`Test "${id}" introuvable`);
  await writeBank(bank);
}
