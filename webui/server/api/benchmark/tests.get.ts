import { listTests } from '../../services/testsBank.service';

export default defineEventHandler(async () => {
  try {
    return await listTests();
  } catch (error) {
    console.error('Erreur lors de la lecture de la banque de tests :', error);
    throw createError({ statusCode: 502, statusMessage: 'Échec de la lecture de la banque de tests' });
  }
});
