import { saveConversation, validateConversation } from '../../../services/chat.service';

// Enregistre une conversation entière (créée ou mise à jour), envoyée par le client après chaque réponse
export default defineEventHandler(async (event) => {
  const conversation = validateConversation(getRouterParam(event, 'id') ?? '', await readBody(event));
  await saveConversation(conversation);
  return { updated_at: conversation.updated_at };
});
