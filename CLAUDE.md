# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler dans ce dépôt.

## Présentation

BeaverCode est une stack IA locale construite autour d'[Ollama](https://ollama.com) : une WebUI Nuxt pour gérer des modèles locaux et les benchmarker, plus un outil de benchmark en Python. Un harnais d'agent de codage (forké depuis OpenFox) est prévu mais pas encore intégré.

**Important :** `docs/`, `harnais/`, `mcp/` et `.claude/` sont tous dans `.gitignore` — ils existent sur le disque mais ne sont **pas suivis par git**. Seuls `webui/`, `ollama_client.py`, `README.md` et `.gitignore` font partie du dépôt. À garder en tête en raisonnant sur "ce qui a changé" via git — ces dossiers n'apparaîtront jamais dans les diffs ni le `git log`.

## Commandes

Toutes les commandes webui s'exécutent depuis `webui/` :

```bash
npm run dev       # serveur de dev sur http://localhost:3000
npm run build     # build de production
npm run generate  # génération statique
npm run preview   # prévisualisation du build de production
```

Aucune suite de tests ni linter n'est actuellement configuré pour `webui/`.

L'outil de benchmark se lance directement, pas via npm :

```bash
python benchmark_tool/benchmark.py --models qwen2.5-coder:7b gemma3:4b
python benchmark_tool/benchmark.py --list-models
python benchmark_tool/benchmark.py --manifest        # manifest JSON des tests disponibles, utilisé par la WebUI
```

Il nécessite `httpx` (`pip install httpx --break-system-packages`) et parle directement à Ollama, pas via le code TypeScript de la WebUI.

## Architecture

**Deux backends indépendants derrière un seul frontend Nuxt**, pas de bridge partagé :

- La **gestion des modèles** (bibliothèque/pull, import GGUF, création de modelfile, suppression) est 100% TypeScript dans `webui/server/`, qui appelle l'API HTTP d'Ollama (`localhost:11434`) directement. Il n'y a volontairement aucun bridge Python ici — `ollama_client.py` n'est *pas* utilisé pour ça.
- Le **benchmark** est piloté par `webui/server/services/benchmark.service.ts`, qui fait un `spawn()` de `benchmark_tool/benchmark.py` en sous-processus (variable d'env `PYTHON_BIN`, défaut `python3`) et stream son stdout (NDJSON, un événement JSON par ligne — voir `--stream-json`) vers le client. `ollama_client.py` (racine du dépôt) est un client partagé minimal utilisé uniquement par `benchmark_tool/`, exposant `list_models()` et `chat()` (avec un paramètre `images=` réservé pour une catégorie de benchmark `vision` pas encore écrite).

Cette séparation (Nitro → Ollama direct pour la gestion des modèles, Nitro → spawn Python pour le benchmark) est une divergence volontaire par rapport à un plan initial faisant tout passer par `ollama_client.py` ; ne pas réintroduire de bridge Python pour la gestion des modèles.

### Structure de `webui/` (Nuxt 4 + Vue 3 + Tailwind v4)

- `app/pages/` — pages routées : `index.vue` (dashboard/monitoring), `models.vue`, `benchmark.vue`, `chat.vue`, `settings.vue`, `logs.vue`
- `app/components/` — composants UI, notamment la famille de modales du benchmark (`BenchmarkRunner.vue`, `BenchmarkResultsView.vue`, `BenchmarkResultsModal.vue`, `BenchmarkRunViewModal.vue`, `BenchmarkModelTestsModal.vue`, `TestsManagerModal.vue`) et les modales de gestion de modèles (`CreateModelModal.vue`, `CreateModelfileModal.vue`, `ImportModelModal.vue`, `LibrarySearchModal.vue`, `LoadedModelsModal.vue`)
- `app/composables/` — logique réactive partagée (`useModels.js`, `useBenchmarkRun.js`, `useBenchmarkFormat.js`, `useTestCategories.js`, `useHardware.js`, `useSystem.js`)
- `server/api/` — endpoints HTTP Nitro, groupés par domaine (`benchmark/`, `import/`, `library/`, `model/`, `modelfiles/`)
- `server/services/` — la logique réelle derrière chaque groupe d'API (`ollama.service.ts`, `benchmark.service.ts`, `import.service.ts`, `library.service.ts`, `modelfile.service.ts`, `logs.service.ts`, `results.service.ts`, `testsBank.service.ts`)
- `server/types/` — types TS partagés (`benchmark.ts`, `library.ts`)

Les endpoints qui streament (progression du pull de modèle, lancement de benchmark) utilisent du NDJSON sur POST avec `fetch().body.getReader()` côté client, pas SSE/`EventSource`.

### Particularités de l'API Ollama à connaître

`/api/create` (Ollama 0.31.1) n'accepte ni `from: "<chemin disque arbitraire>"` ni un `modelfile:` en texte brut. Le flux qui fonctionne : hash SHA256 du GGUF → upload en tant que blob (`POST /api/blobs/sha256:<digest>`) → appel à `/api/create` avec `files: {"model.gguf": "sha256:<digest>"}` pour l'import GGUF, ou `from: "<modèle existant>"` + `parameters`/`system` structurés pour la création de modèle depuis un modelfile.

### Système de design

Le travail UI doit suivre la charte graphique BeaverCode (palette sombre et chaude, couleurs de marque orange/vert, bordures avec ombre dure 2px style "sticker", typographie à trois rôles — Space Grotesk/Inter/JetBrains Mono). La spec est appliquée par le sous-agent `beavercode-design` — à utiliser pour tout travail sous `webui/app/components/` ou `webui/app/pages/`. Note : `webui/app/assets/css/main.css` ne câble pas encore les tokens de marque dans un bloc `@theme` Tailwind v4, et une grande partie de l'UI existante utilise encore le gris/bleu par défaut de Tailwind au lieu des couleurs de marque — c'est une dérive connue, pas une régression à corriger sans réfléchir.

### Outil de benchmark (`benchmark_tool/`, Python, gitignored)

- `benchmark.py` — point d'entrée CLI et logique de scoring (règles + juge LLM optionnel via `benchmark-judge:latest`, surchargeable avec `BENCHMARK_JUDGE`)
- `lib/config.py` — réglages par défaut surchargeables par variable d'env (`OLLAMA_BASE_URL`, `BENCHMARK_TEMPERATURE`, `BENCHMARK_NUM_CTX`, `BENCHMARK_NUM_PREDICT`)
- `lib/tests_bank.py` — définition des cas de test par catégorie (code, chat, reasoning, security, code_style, tool_calling, etc.)
- `lib/metrics.py`, `lib/exports.py` — scoring/métriques et export des résultats
- Le modèle juge doit être texte seul — un juge multimodal (ex. basé sur `gemma4:e4b`) plante lors de l'offload CPU du projecteur vision (bug connu llama.cpp/Ollama).

## Notes issues du contexte précédent

- La gestion des modèles (import/création/suppression) est volontairement TypeScript uniquement ; ne pas suggérer de la passer en Python pour "cohérence de stack" — c'est déjà tranché.
- Il n'y a pas de dossier `models/` — supprimé ; les imports GGUF HuggingFace passent par la fonctionnalité d'import de la WebUI (`ImportModelModal.vue`) vers `~/.ollama/gguf/`.
