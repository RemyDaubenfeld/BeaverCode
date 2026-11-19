import { listConversations } from '../../../services/chat.service';

// Liste des conversations enregistrées (résumés, la plus récente d'abord)
export default defineEventHandler(() => listConversations());
