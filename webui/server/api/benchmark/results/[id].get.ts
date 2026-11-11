import { getRun } from '../../../services/results.service';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre "id" requis' });
  }

  const run = await getRun(id);
  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'Run introuvable' });
  }
  return run;
});
