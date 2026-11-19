import { renameConversation } from '../../../services/chat.service';

// Renomme une conversation enregistrée (body : { title })
export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: unknown }>(event);
  return { title: await renameConversation(getRouterParam(event, 'id') ?? '', body?.title) };
});
