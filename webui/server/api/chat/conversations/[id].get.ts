import { getConversation } from '../../../services/chat.service';

export default defineEventHandler((event) => getConversation(getRouterParam(event, 'id') ?? ''));
