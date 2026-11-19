import { deleteConversation } from '../../../services/chat.service';

export default defineEventHandler(async (event) => {
  await deleteConversation(getRouterParam(event, 'id') ?? '');
  return { ok: true };
});
