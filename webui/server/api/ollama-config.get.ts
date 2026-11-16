import { getOllamaConfig } from '../services/ollamaConfig.service';

// Configuration du serveur Ollama (variables OLLAMA_* connues uniquement, jamais l'environnement entier)
export default defineEventHandler(() => getOllamaConfig());
