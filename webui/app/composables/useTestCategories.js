import {
  CodeBracketIcon,
  ChatBubbleLeftRightIcon,
  LightBulbIcon,
  ListBulletIcon,
  DocumentTextIcon,
  CodeBracketSquareIcon,
  TagIcon,
  ChartBarIcon,
  LanguageIcon,
  WrenchScrewdriverIcon,
  CommandLineIcon,
  EyeIcon,
  CircleStackIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  PaintBrushIcon,
  PhotoIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/vue/24/outline'

// Métadonnées d'affichage des catégories de test du benchmark — partagées
// entre BenchmarkRunner.vue (sélection de tests) et TestsManagerModal.vue
// (CRUD de la banque de tests), pour ne pas dupliquer ces tables des deux
// côtés. Les catégories elles-mêmes sont fixes côté backend (voir
// KNOWN_CATEGORIES dans webui/server/services/testsBank.service.ts) — créer
// une nouvelle catégorie nécessite d'ajouter une entrée ici ET côté serveur.

export const categoryLabels = {
  code: 'Code',
  chat: 'Chat',
  reasoning: 'Raisonnement',
  instruction_following: "Suivi d'instructions",
  summarization: 'Résumé',
  structured_extraction: 'Extraction structurée',
  classification: 'Classification',
  data_analysis: 'Analyse de données',
  translation: 'Traduction',
  security: 'Sécurité',
  code_style: 'Style de code',
  tool_calling: "Appel d'outils",
  vision: 'Vision',
}

// Capacité de modèle associée à chaque catégorie de test — mêmes 6 capacités
// que celles affichées en colonnes dans ModelList.vue (completion, tools,
// thinking, vision, embedding, insert). Une catégorie absente de cette table
// tombe dans le groupe "Autres".
export const categoryCapability = {
  code: 'completion',
  chat: 'completion',
  reasoning: 'thinking',
  instruction_following: 'completion',
  summarization: 'completion',
  structured_extraction: 'completion',
  classification: 'completion',
  data_analysis: 'completion',
  translation: 'completion',
  security: 'completion',
  code_style: 'completion',
  tool_calling: 'tools',
  vision: 'vision',
}

export const capabilityGroupLabels = {
  completion: 'Completion',
  tools: "Appel d'outils",
  thinking: 'Raisonnement (thinking)',
  vision: 'Vision',
  embedding: 'Embedding',
  insert: 'Insertion (FIM)',
}
export const capabilityOrder = ['completion', 'tools', 'thinking', 'vision', 'embedding', 'insert']

// Icône par groupe de capacité (distinct de categoryIcons, qui est indexé par
// catégorie de test — code/chat/reasoning/... — pas par capacité).
export const capabilityGroupIcons = {
  completion: CommandLineIcon,
  tools: WrenchScrewdriverIcon,
  thinking: LightBulbIcon,
  vision: EyeIcon,
  embedding: CircleStackIcon,
  insert: PuzzlePieceIcon,
}

// Catégories acceptées à la création/modification d'un test (voir
// KNOWN_CATEGORIES côté serveur — tenu en synchro manuellement).
export const knownCategories = [
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
]

// Icône par catégorie de test — repérer le type de test en un coup d'œil
// dans la liste de sélection (BenchmarkRunner.vue) et dans la gestion des
// tests (TestsManagerModal.vue).
export const categoryIcons = {
  code: CodeBracketIcon,
  chat: ChatBubbleLeftRightIcon,
  reasoning: LightBulbIcon,
  instruction_following: ListBulletIcon,
  summarization: DocumentTextIcon,
  structured_extraction: CodeBracketSquareIcon,
  classification: TagIcon,
  data_analysis: ChartBarIcon,
  translation: LanguageIcon,
  security: ShieldCheckIcon,
  code_style: PaintBrushIcon,
  tool_calling: WrenchScrewdriverIcon,
  vision: PhotoIcon,
}
export const defaultCategoryIcon = QuestionMarkCircleIcon

export function useTestCategories() {
  return { categoryLabels, categoryCapability, capabilityGroupLabels, capabilityOrder, knownCategories, categoryIcons, capabilityGroupIcons, defaultCategoryIcon }
}
