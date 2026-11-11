import { createTest } from '../../services/testsBank.service';
import type { TestBankEntry } from '../../types/benchmark';

export default defineEventHandler(async (event) => {
  const { category, test } = await readBody(event);

  if (!category || typeof category !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "category" requis' });
  }
  if (!test || typeof test !== 'object' || !test.id || !test.label || !test.prompt) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètres "test.id", "test.label" et "test.prompt" requis' });
  }

  const entry: TestBankEntry = {
    id: test.id,
    label: test.label,
    prompt: test.prompt,
    checks: {
      rules: Array.isArray(test.checks?.rules) ? test.checks.rules : [],
      judge_criteria: test.checks?.judge_criteria ?? '',
    },
    ...(test.tools ? { tools: test.tools } : {}),
    ...(test.expected_tool ? { expected_tool: test.expected_tool } : {}),
    ...(test.expected_answer ? { expected_answer: test.expected_answer } : {}),
    ...(Array.isArray(test.images) && test.images.length ? { images: test.images } : {}),
  };

  try {
    await createTest(category, entry);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de la création du test :', error);
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Échec de la création du test' });
  }
});
