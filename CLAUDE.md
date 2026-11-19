# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler dans ce dépôt.

## Présentation

BeaverCode est une stack IA locale construite autour d'[Ollama](https://ollama.com) : une WebUI Nuxt pour gérer des modèles locaux et les benchmarker, plus un outil de benchmark en Python. Un harnais d'agent de codage (forké depuis OpenFox) est prévu mais pas encore intégré.

**Important :** `docs/`, `harnais/`, `mcp/` et `.claude/` sont tous dans `.gitignore` — ils existent sur le disque mais ne sont **pas suivis par git**. Font partie du dépôt : `webui/`, `benchmark_tool/` (code, banque de tests, images de vision — **mais pas** ses données locales `results/` et `leaderboard*.json`, ignorées), `ollama_client.py`, `CLAUDE.md`, `README.md` et `.gitignore`. À garder en tête en raisonnant sur "ce qui a changé" via git — ces dossiers n'apparaîtront jamais dans les diffs ni le `git log`.

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
python benchmark_tool/benchmark.py --models qwen3:8b --temperature 0.7 --num-ctx model --num-predict 2048  # options de génération (« model » = réglage du modelfile)
python benchmark_tool/benchmark.py --plan '{"qwen3:8b": ["chat_explain"], "gemma4:12b": ["code_fizzbuzz"]}'  # tests propres à chaque modèle (relance des tests ratés)
```

Il nécessite `httpx` (`pip install httpx --break-system-packages`) et parle directement à Ollama, pas via le code TypeScript de la WebUI.

## Architecture

**Deux backends indépendants derrière un seul frontend Nuxt**, pas de bridge partagé :

- La **gestion des modèles** (bibliothèques Ollama et HuggingFace/pull, import GGUF local, modification/copie/renommage, presets, suppression) est 100% TypeScript dans `webui/server/`, qui appelle l'API HTTP d'Ollama (`localhost:11434`) directement. Il n'y a volontairement aucun bridge Python ici — `ollama_client.py` n'est *pas* utilisé pour ça.
- Le **benchmark** est piloté par `webui/server/services/benchmark.service.ts`, qui fait un `spawn()` de `benchmark_tool/benchmark.py` en sous-processus (variable d'env `PYTHON_BIN`, défaut `python3`) et stream son stdout (NDJSON, un événement JSON par ligne — voir `--stream-json`) vers le client. `ollama_client.py` (racine du dépôt) est un client partagé minimal utilisé uniquement par `benchmark_tool/`, exposant `list_models()` et `chat()` (dont le dernier morceau porte les durées d'Ollama : génération, chargement, lecture du prompt — utilisées pour le tok/s et le TTFT) (avec un paramètre `images=` réservé pour une catégorie de benchmark `vision` pas encore écrite).

Cette séparation (Nitro → Ollama direct pour la gestion des modèles, Nitro → spawn Python pour le benchmark) est une divergence volontaire par rapport à un plan initial faisant tout passer par `ollama_client.py` ; ne pas réintroduire de bridge Python pour la gestion des modèles.

### Structure de `webui/` (Nuxt 4 + Vue 3 + Tailwind v4)

- `app/pages/` — pages routées : `webui.vue` (chat manuel), `models.vue`, `benchmark.vue`, `settings.vue`, `logs.vue` (le monitoring est dans la barre globale `Monitoring.vue`, visible sur toutes les pages)
- `app/components/` — composants UI, notamment la famille de modales du benchmark (`BenchmarkRunner.vue`, `BenchmarkResultsView.vue`, `BenchmarkResultsModal.vue`, `BenchmarkRunViewModal.vue`, `BenchmarkModelTestsModal.vue`, `TestsManagerModal.vue`) et les modales de gestion de modèles (`LibrarySearchModal.vue` pour la bibliothèque Ollama, `HuggingFaceModal.vue` + `HuggingFaceRepo.vue` + `GgufImport.vue` pour HuggingFace et l'import de GGUF local, `ModelDetailsModal.vue` + `ModelParametersEditor.vue` pour la fiche d'un modèle — modification des paramètres, copie, renommage, presets —, `LoadedModelsModal.vue`) et celles du chat (`ChatMessage.vue`, `ChatSettings.vue`, `ChatConversationList.vue`)
- `app/composables/` — logique réactive partagée (`useModels.js`, `useChat.js`, `useBenchmarkRun.js`, `useBenchmarkFormat.js`, `useTestCategories.js`, `useHardware.js`, `useSystem.js`)
- `server/api/` — endpoints HTTP Nitro, groupés par domaine (`benchmark/`, `chat/`, `import/`, `library/`, `model/`, `modelfiles/`)
- `server/services/` — la logique réelle derrière chaque groupe d'API (`ollama.service.ts`, `chat.service.ts`, `benchmark.service.ts`, `import.service.ts`, `library.service.ts`, `modelfile.service.ts`, `logs.service.ts`, `results.service.ts`, `testsBank.service.ts`)
- `server/types/` — types TS partagés (`benchmark.ts`, `library.ts`)
- Réglages de la WebUI (URL d'Ollama, juge et options par défaut du benchmark) : `server/services/settings.service.ts`, fichier `webui/.data/settings.json` (non suivi par git). **Toujours appeler Ollama via `getOllamaUrl('/api/…')`**, jamais une URL `localhost:11434` en dur ; le benchmark Python la reçoit par `OLLAMA_BASE_URL`

Le **chat** (page WebUI) : `POST /api/chat` relaie vers `/api/chat` d'Ollama et renvoie son flux NDJSON tel quel ; l'état vit dans `useChat.js` (niveau module, survit à un changement de page) ; chaque conversation est enregistrée en entier après chaque réponse dans `webui/.data/conversations/<id>.json` (non suivi par git). Le Markdown des réponses passe par `app/utils/markdown.js` (`markdown-it` avec `html: false` — le HTML écrit par un modèle n'est jamais interprété, ne pas l'activer : le rendu part dans un `v-html` — et `highlight.js`).

Les endpoints qui streament (progression du pull de modèle, lancement de benchmark, chat) utilisent du NDJSON sur POST avec `fetch().body.getReader()` côté client, pas SSE/`EventSource`. Pour détecter une annulation côté serveur, écouter `event.node.res.on('close')`, **jamais** `req.on('close')` (émis dès la lecture du corps de la requête, avant l'annulation).

### Particularités de l'API Ollama à connaître

`/api/create` (Ollama 0.31.1) n'accepte ni `from: "<chemin disque arbitraire>"` ni un `modelfile:` en texte brut. Le flux qui fonctionne : hash SHA256 du GGUF → upload en tant que blob (`POST /api/blobs/sha256:<digest>`) → appel à `/api/create` avec `files: {"model.gguf": "sha256:<digest>"}` pour l'import GGUF, ou `from: "<modèle existant>"` + `parameters`/`system` structurés pour modifier/copier/renommer un modèle (Ollama **fusionne** les paramètres envoyés avec ceux du modèle : impossible d'en supprimer un par cette voie). Les modèles HuggingFace se tirent directement avec `/api/pull` sur `hf.co/<user>/<repo>:<quant>` (pas de GGUF découpé).

### Configuration d'Ollama sur cette machine

Ollama tourne dans **Docker** (conteneur `ollama`, d'où les chemins `/root/.ollama/…` et les fichiers appartenant à root dans `~/.ollama`). Sa configuration (variables `OLLAMA_*`) est lue par `server/services/ollamaConfig.service.ts` (`docker inspect`, sinon systemd) et affichée dans Paramétrage. Points qui comptent : `OLLAMA_KV_CACHE_TYPE=q8_0` + `OLLAMA_FLASH_ATTENTION=1` (KV cache deux fois plus petit qu'en f16 — pris en compte par l'estimation mémoire), `OLLAMA_KEEP_ALIVE=30m`. L'environnement du conteneur contient aussi des secrets d'autres services : ne jamais en exposer d'autres variables que la liste fixe du service.

### Système de design

Le travail UI doit suivre la charte graphique BeaverCode (palette sombre et chaude, couleurs de marque orange/vert, bordures avec ombre dure 2px style "sticker", typographie à trois rôles — Space Grotesk/Inter/JetBrains Mono). La spec est appliquée par le sous-agent `beavercode-design` — à utiliser pour tout travail sous `webui/app/components/` ou `webui/app/pages/`. Les tokens de marque sont câblés dans le bloc `@theme` de `webui/app/assets/css/main.css`, et l'UI n'utilise plus aucune couleur Tailwind par défaut (passe globale du 19/11). Règles issues de cette passe : le focus clavier passe par **une seule** règle `:focus-visible` globale dans `main.css` (ne pas ajouter de classes `focus-visible:outline-*` par élément) ; `text-bc-text-muted` (~2,9:1, sous le seuil AA) est réservé au décoratif (placeholders, états désactivés, icônes, séparateurs) — tout texte à lire est au moins en `text-bc-text-secondary`.

### Outil de benchmark (`benchmark_tool/`, Python, suivi par git sauf `results/` et `leaderboard*.json`)

- `benchmark.py` — point d'entrée CLI et logique de scoring (règles + juge LLM optionnel via `benchmark-judge:latest`, surchargeable avec `BENCHMARK_JUDGE`)
- `lib/config.py` — réglages par défaut surchargeables par variable d'env (`OLLAMA_BASE_URL`, `BENCHMARK_TEMPERATURE`, `BENCHMARK_NUM_CTX`, `BENCHMARK_NUM_PREDICT`) ; les trois options de génération sont aussi surchargeables en CLI (`--temperature`, `--num-ctx`, `--num-predict`, passés par la WebUI) et enregistrées avec chaque résultat (`options` du run, du modèle et de chaque test). Le juge garde des réglages fixes (`JUDGE_OPTIONS`)
- `lib/tests_bank.py` — charge `lib/tests_bank.json`, les cas de test par catégorie (code, chat, reasoning, security, code_style, tool_calling, vision, thinking…), aussi édités depuis la WebUI (« Gérer les tests »). Les tests `thinking` (modèles ayant la capacité) sont vérifiés exactement sur la ligne `ANSWER:` (`expected_answer`, sans juge) et passés deux fois, réflexion activée puis coupée (`think` d'Ollama, `run_thinking_test()`)
- `lib/metrics.py`, `lib/exports.py` — scoring/métriques et export des résultats
- Le modèle juge doit être texte seul — un juge multimodal (ex. basé sur `gemma4:e4b`) plante lors de l'offload CPU du projecteur vision (bug connu llama.cpp/Ollama).

## Notes issues du contexte précédent

- La gestion des modèles (import/création/suppression) est volontairement TypeScript uniquement ; ne pas suggérer de la passer en Python pour "cohérence de stack" — c'est déjà tranché.
- Il n'y a pas de dossier `models/` — supprimé ; les modèles HuggingFace se téléchargent depuis la fenêtre HuggingFace de la WebUI (pull direct `hf.co/…`), les GGUF locaux s'importent depuis cette même fenêtre (`GgufImport.vue`) vers `~/.ollama/gguf/`. `~/.ollama/modelfiles/` contient des presets de paramètres (sans `FROM`) chargés depuis la fiche d'un modèle.
