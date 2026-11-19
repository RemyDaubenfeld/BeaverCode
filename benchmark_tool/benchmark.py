#!/usr/bin/env python3
"""
Ollama Model Benchmark — outil d'évaluation automatisée des modèles locaux

Usage (inchangé) :
    python benchmark.py --models qwen2.5-coder:7b gemma3:4b
    python benchmark.py --list-models
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime

# ollama_client.py vit à la racine du projet (partagé avec un futur backend
# Nitro qui pourrait aussi s'en servir pour l'onglet "Gestion des modèles"),
# pas seulement dans benchmark_tool/ — on ajoute donc explicitement le
# dossier parent au chemin d'import.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ollama_client import OllamaClient, encode_image_bytes
from lib.config import DEFAULT_JUDGE, DEFAULT_HOST, DEFAULT_TEMPERATURE, DEFAULT_NUM_CTX, DEFAULT_NUM_PREDICT
from lib.tests_bank import TESTS

# Dossier des images de test pour la catégorie "vision" — un test y référence
# ses images par nom de fichier (champ "images" du test, voir load_test_images()),
# pas par contenu inline dans tests_bank.json (JSON n'est pas fait pour du binaire).
VISION_ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "vision")

# ─── Utilitaires HTTP ────────────────────────────────────────────────────────
# MIGRÉ : ollama_request() a disparu — remplacé partout par des appels
# directs aux méthodes de OllamaClient (voir plus bas dans chaque fonction).

def list_local_models(client: OllamaClient) -> list[str]:
    try:
        return [m.name for m in client.list_models()]
    except Exception:
        return []

def model_exists(client: OllamaClient, model: str) -> bool:
    return model in list_local_models(client)

# ─── Options de génération ───────────────────────────────────────────────────
# Appliquées aux réponses des modèles TESTÉS. Valeurs par défaut : lib/config.py (variables
# d'environnement BENCHMARK_*), surchargeables en CLI (--temperature, --num-ctx, --num-predict,
# passés par la WebUI). Une valeur None = option non envoyée à Ollama → c'est le réglage du
# modelfile du modèle qui s'applique (ex. son propre num_ctx), sinon le défaut d'Ollama.
RUN_OPTIONS: dict = {
    "temperature": DEFAULT_TEMPERATURE,
    "num_ctx": DEFAULT_NUM_CTX,
    "num_predict": DEFAULT_NUM_PREDICT,
}

# Le JUGE garde des réglages fixes, indépendants des options du run : sa notation doit rester
# comparable d'un run à l'autre (un juge à température 1 noterait de façon plus aléatoire).
JUDGE_OPTIONS: dict = {
    "temperature": DEFAULT_TEMPERATURE,
    "num_ctx": DEFAULT_NUM_CTX,
}

# ─── Envoi d'un prompt ───────────────────────────────────────────────────────

def run_prompt(
    client: OllamaClient,
    model: str,
    prompt: str,
    system: str = "",
    force_cpu: bool = False,
    tools: list[dict] | None = None,
    images: list[str] | None = None,
    num_predict: int | None = None,
    options: dict | None = None,
    think: bool | None = None,
) -> dict:
    """`options` : options de génération (défaut : RUN_OPTIONS) ; `num_predict` les surcharge."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    options = dict(RUN_OPTIONS if options is None else options)
    if num_predict is not None:
        options["num_predict"] = num_predict
    options = {k: v for k, v in options.items() if v is not None}  # None = réglage du modèle
    if force_cpu:
        options["num_gpu"] = 0

    start = time.time()
    full_text_parts = []
    thinking_chars = 0
    final_chunk = None
    ttft = None  # temps jusqu'au PREMIER morceau de réponse (mesuré ici, côté client)

    for chunk in client.chat(
        model=model,
        messages=messages,
        options=options,
        tools=tools,
        images=images,
        think=think,
    ):
        if ttft is None and not chunk.done:
            ttft = time.time() - start
        full_text_parts.append(chunk.content)
        thinking_chars += len(chunk.thinking)
        if chunk.done:
            final_chunk = chunk

    elapsed = time.time() - start
    response_text = "".join(full_text_parts)

    # eval_count et tokens_per_second ne sont disponibles que sur le dernier
    # chunk (celui avec done=True) — voir la docstring de ChatChunk dans
    # ollama_client.py
    eval_count = final_chunk.eval_count if final_chunk and final_chunk.eval_count else 0
    if final_chunk and final_chunk.tokens_per_second:
        tokens_per_sec = round(final_chunk.tokens_per_second, 1)
    else:
        tokens_per_sec = round(eval_count / elapsed, 1) if elapsed > 0 else 0

    # tool_calls n'est présent que sur le chunk final (voir ChatChunk) — vide
    # si le modèle n'a rien appelé, ou si aucun `tools` n'a été fourni
    tool_calls = final_chunk.tool_calls if final_chunk else []

    # durées renvoyées par Ollama sur le dernier chunk (nanosecondes → secondes)
    def seconds(ns: int | None) -> float | None:
        return round(ns / 1e9, 3) if ns else None

    return {
        "response": response_text,
        "tokens": eval_count,
        "elapsed_sec": round(elapsed, 2),
        "tokens_per_sec": tokens_per_sec,
        "tool_calls": tool_calls,
        # TTFT = chargement du modèle + lecture du prompt (+ 1er token). Mesuré : qwen2.5:3b 4,08 s à
        # froid (dont 3,96 s de chargement), 0,21 s déjà chargé. Sans aucun morceau avant le chunk final
        # (réponse vide), on retombe sur la durée totale.
        "ttft_sec": round(ttft if ttft is not None else elapsed, 3),
        "load_sec": seconds(final_chunk.load_duration_ns) if final_chunk else None,
        "prompt_eval_sec": seconds(final_chunk.prompt_eval_duration_ns) if final_chunk else None,
        "prompt_tokens": final_chunk.prompt_eval_count if final_chunk else None,
        # pour diagnostiquer une réponse vide : le modèle a-t-il réfléchi, et s'est-il arrêté sur la limite ?
        "thinking_chars": thinking_chars,
        "done_reason": final_chunk.done_reason if final_chunk else None,
    }

# ─── Images de test (catégorie "vision") ─────────────────────────────────────

def load_test_images(test: dict) -> list[str] | None:
    """Encode en base64 les images référencées par test["images"] (noms de
    fichiers dans VISION_ASSETS_DIR), format attendu par OllamaClient.chat().
    Renvoie None si le test n'a pas d'images (tous les tests non-vision)."""
    filenames = test.get("images")
    if not filenames:
        return None
    encoded = []
    for filename in filenames:
        path = os.path.join(VISION_ASSETS_DIR, os.path.basename(filename))
        with open(path, "rb") as f:
            encoded.append(encode_image_bytes(f.read()))
    return encoded

# ─── Scoring par règles ──────────────────────────────────────────────────────

def score_rules(response: str, rules: list[str]) -> tuple[int, list[str]]:
    found = []
    missing = []
    for rule in rules:
        if rule.lower() in response.lower():
            found.append(rule)
        else:
            missing.append(rule)
    score = round((len(found) / len(rules)) * 5) if rules else 3
    return score, missing

# ─── Scoring d'un appel d'outil (tests "tool_calling") ──────────────────────
# Contrairement aux autres tests (rules + juge), ceux-ci vérifient si le
# modèle a appelé le BON outil avec les BONS arguments — pas la qualité
# d'un texte libre.

def score_tool_call(tool_calls: list[dict], expected_tool: str) -> tuple[int, str, str]:
    """Renvoie (score, strengths, weaknesses) à partir des tool_calls renvoyés par le modèle."""
    if not tool_calls:
        return 1, "", f"Aucun outil appelé (attendu : {expected_tool})"

    names = [
        (call.get("function") or {}).get("name", "")
        for call in tool_calls
    ]
    if expected_tool not in names:
        return 2, "", f"Mauvais outil appelé : {', '.join(names) or '?'} (attendu : {expected_tool})"

    call = next(c for c in tool_calls if (c.get("function") or {}).get("name") == expected_tool)
    arguments = (call.get("function") or {}).get("arguments")
    if not arguments:
        return 3, f"Bon outil appelé ({expected_tool})", "Aucun argument fourni avec l'appel"

    return 5, f"Bon outil appelé ({expected_tool}) avec arguments : {arguments}", ""

# ─── Scoring par juge LLM ────────────────────────────────────────────────────

JUDGE_SYSTEM = """You are an objective evaluator of AI model responses.
You will receive a test prompt, the model's response, and evaluation criteria.
You must output ONLY a JSON object with exactly these fields:
{
  "score": <integer 1-5>,
  "strengths": "<one sentence>",
  "weaknesses": "<one sentence or 'none'>"
}
Scoring guide: 5=perfect, 4=good minor issues, 3=adequate missing points, 2=partial significant gaps, 1=poor/wrong.
No other text. No markdown. Only the JSON object."""

def score_with_judge(
    client: OllamaClient,
    judge_model: str,
    prompt: str,
    response: str,
    criteria: str,
    expected_answer: str | None = None,
) -> dict:
    # expected_answer sert notamment aux tests "vision" (voir load_test_images) :
    # le juge n'est volontairement PAS multimodal (voir la note sur benchmark-judge
    # plus haut dans le fichier), donc il ne voit jamais l'image — seulement le
    # texte produit par le modèle testé. On compense en donnant au juge une
    # réponse type à comparer, plutôt que de compter uniquement sur judge_criteria.
    expected_block = f"\n\nEXPECTED ANSWER (compare the response against this, some variation in wording is fine):\n{expected_answer}" if expected_answer else ""

    judge_prompt = f"""TEST PROMPT:
{prompt}

MODEL RESPONSE:
{response}

EVALUATION CRITERIA:
{criteria}{expected_block}

Evaluate and return the JSON object."""

    try:
        # Le juge ne doit sortir qu'un petit JSON (score + 2 phrases) — un plafond bas
        # évite qu'un modèle "thinking" (bloc <think> avant le JSON, voir nettoyage
        # plus bas) ne génère indéfiniment, surtout en CPU forcé (~5 tok/s observé).
        result = run_prompt(client, judge_model, judge_prompt, system=JUDGE_SYSTEM, force_cpu=True, num_predict=400, options=JUDGE_OPTIONS)
        raw = result["response"].strip()
        # Qwen3 (et d'autres modèles "thinking") peuvent émettre un bloc de
        # raisonnement AVANT le JSON, malgré la consigne du JUDGE_SYSTEM.
        # On le retire en premier, avant de nettoyer d'éventuels backticks
        # markdown, sinon json.loads() plante sur le texte parasite.
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        raw = re.sub(r"```json|```", "", raw).strip()
        parsed = json.loads(raw)
        return {
            "score": max(1, min(5, int(parsed.get("score", 3)))),
            "strengths": parsed.get("strengths", ""),
            "weaknesses": parsed.get("weaknesses", "")
        }
    except Exception as e:
        return {"score": 3, "strengths": "", "weaknesses": f"Erreur juge : {e}"}

# ─── Détection du type de modèle ─────────────────────────────────────────────

def detect_model_type(model_name: str) -> list[str]:
    name = model_name.lower()
    types = []
    if any(k in name for k in ["coder", "code", "codestral", "deepseek-coder", "starcoder"]):
        types.append("code")
    if any(k in name for k in ["r1", "reason", "thinking", "qwq"]):
        types.append("reasoning")
    if any(k in name for k in ["vision", "vl", "llava", "bakllava"]):
        types.append("vision")
    if not types:
        types = ["chat", "code", "reasoning", "instruction_following"]
    else:
        types.append("instruction_following")
        if "chat" not in types:
            types.append("chat")
    return list(set(types))

# Catégories générales, applicables à n'importe quel modèle (pas seulement
# code/reasoning/vision) — toujours incluses, comme "instruction_following"
# l'était déjà. Portées depuis a-porter/src/benchmarks.py.
ALWAYS_INCLUDED_CATEGORIES = [
    "instruction_following",
    "summarization",
    "structured_extraction",
    "classification",
    "data_analysis",
    "translation",
    "tool_calling",
    "thinking",  # écarté ensuite pour les modèles sans la capacité « thinking » (REQUIRED_CAPABILITY)
]

def get_tests_for_model(model_name: str) -> list[dict]:
    types = detect_model_type(model_name)
    selected = []
    for t in types:
        selected.extend(TESTS.get(t, []))
    for category in ALWAYS_INCLUDED_CATEGORIES:
        for t in TESTS.get(category, []):
            if t not in selected:
                selected.append(t)
    return selected

# ─── Sélection manuelle de tests (UI) ────────────────────────────────────────

def get_tests_by_ids(ids: list[str]) -> list[dict]:
    """Sélection explicite de tests par id, utilisée quand --tests est fourni
    (au lieu de l'auto-détection get_tests_for_model())."""
    wanted = set(ids)
    selected = []
    for tests in TESTS.values():
        for t in tests:
            if t["id"] in wanted:
                selected.append(t)
    return selected

# ─── Manifest (catégories + tests + recommandations) ────────────────────────
# Consommé par la WebUI (server/services/benchmark.service.ts) pour peupler
# la sélection de tests sans dupliquer TESTS côté TypeScript.

def build_manifest(models: list[str] | None = None) -> dict:
    categories = [
        {
            "id": category,
            "tests": [
                {
                    "id": t["id"],
                    "label": t["label"],
                    "description": t["checks"].get("judge_criteria", ""),
                }
                for t in tests
            ],
        }
        for category, tests in TESTS.items()
    ]

    manifest = {
        "categories": categories,
        "default_judge": DEFAULT_JUDGE,
        # valeurs par défaut des options du run (lib/config.py), pour préremplir la WebUI
        "default_options": {
            "temperature": DEFAULT_TEMPERATURE,
            "num_ctx": DEFAULT_NUM_CTX,
            "num_predict": DEFAULT_NUM_PREDICT,
        },
    }

    if models:
        manifest["recommended"] = {
            model: list(dict.fromkeys(detect_model_type(model) + ALWAYS_INCLUDED_CATEGORIES))
            for model in models
        }

    return manifest

# ─── Sortie machine-parsable (--stream-json) ─────────────────────────────────
# Un objet JSON par ligne (flush immédiat), pensé pour un process parent (Nitro)
# plutôt qu'un terminal — voir build_manifest() pour le pendant statique
# (catégories/tests) consommé au chargement de l'UI, avant le lancement d'un run.

def emit_json(event: dict) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)

# ─── Benchmark principal ─────────────────────────────────────────────────────

# Capacité Ollama REQUISE par une catégorie de tests (les autres ne demandent que « completion ») — même
# liste que categoryRequiredCapabilities dans BenchmarkRunner.vue
REQUIRED_CAPABILITY = {"vision": "vision", "tool_calling": "tools", "thinking": "thinking"}

def test_category(test: dict) -> str:
    return next((k for k, v in TESTS.items() if any(t["id"] == test["id"] for t in v)), "unknown")

def error_entry(test: dict, message: str, run: dict | None = None) -> dict:
    """Entrée de résultat d'un test que le modèle n'a pas pu mener à bien (plantage, délai, réflexion coupée…).
    `error: True` la distingue d'une vraie mauvaise réponse : elle est relançable depuis la WebUI."""
    return {
        "test_id": test["id"],
        "label": test["label"],
        "category": test_category(test),
        "score": 0, "rule_score": 0, "judge_score": None,
        "strengths": "", "weaknesses": message,
        "tokens": run["tokens"] if run else 0,
        "tokens_per_sec": run["tokens_per_sec"] if run else 0,
        "elapsed_sec": run["elapsed_sec"] if run else 0,
        "ttft_sec": run["ttft_sec"] if run else None,
        "load_sec": run["load_sec"] if run else None,
        "prompt_eval_sec": run["prompt_eval_sec"] if run else None,
        "prompt_tokens": run["prompt_tokens"] if run else None,
        "response_preview": f"ERREUR: {message}",
        "options": dict(RUN_OPTIONS),
        "error": True,
    }

# ─── Tests « thinking » ──────────────────────────────────────────────────────
# Problèmes à réponse unique (dénombrement, énigme à contraintes, trace de code, plus court chemin, calcul
# de date), vérifiée EXACTEMENT, sans juge : le juge est un petit modèle sans réflexion, il se tromperait
# sur ces problèmes. Chaque test est passé deux fois par le même modèle, réflexion activée puis coupée
# (paramètre `think` d'Ollama) : la note vient du passage AVEC réflexion, la comparaison mesure ce que la
# réflexion apporte et ce qu'elle coûte (tokens, secondes).

# La réflexion compte dans la limite de tokens : 1024 (défaut) coupe la plupart des modèles en pleine
# réflexion (qwen3.5:4b : 4 742 caractères de réflexion pour une énigme simple). Plafond seulement : un
# modèle qui conclut plus tôt ne coûte rien de plus.
THINKING_MIN_PREDICT = 8192
# Le CONTEXTE doit aussi contenir prompt + réflexion + réponse. Mesuré le 18/11 : qwen3.5:4b avec
# « contexte = valeur du modèle » (4096) s'arrêtait à prompt + réponse = 4096 tokens pile sur les 5 tests,
# bien avant les 8192 de num_predict. On fixe donc le contexte, le même pour les deux passages (le changer
# entre deux requêtes oblige Ollama à recharger le modèle).
THINKING_MIN_CTX = THINKING_MIN_PREDICT + 1024

def limit_reason(run: dict, options: dict) -> str:
    """Pourquoi une génération s'est arrêtée sur `done_reason: length` : limite de tokens ou contexte plein."""
    predict = options.get("num_predict")
    if predict and run["tokens"] >= predict:
        return f"limite « Tokens max » atteinte ({predict} tokens)"
    used = (run["prompt_tokens"] or 0) + run["tokens"]
    return f"contexte plein ({used} tokens, prompt + réponse)"

def normalize_answer(text: str) -> str:
    """« **D, B, F, C, A, E** » → « DBFCAE », « 2027-10-12 » → « 20271012 » : seuls lettres et chiffres comptent."""
    return re.sub(r"[^0-9A-Za-z]", "", text).upper()

def extract_answer(response: str) -> str | None:
    """Réponse finale = DERNIÈRE ligne « ANSWER: … » (le modèle peut en écrire une provisoire avant de se corriger)."""
    matches = re.findall(r"ANSWER\s*\**\s*:\s*\**\s*(.+)", response, flags=re.IGNORECASE)
    return normalize_answer(matches[-1]) if matches else None

def describe_pass(label: str, passed: dict) -> str:
    if "error" in passed:
        return f"{label} : {passed['error']}"
    if passed["correct"]:
        verdict = "juste"
    elif passed.get("endless"):
        verdict = "réflexion sans fin, pas de réponse"
    else:
        verdict = "faux" if passed["answer"] else "pas de ligne ANSWER"
    return f"{label} : {verdict} ({passed['tokens']} tokens, {passed['elapsed_sec']:.0f} s)"

def run_thinking_test(client: OllamaClient, model: str, test: dict) -> dict:
    expected = [normalize_answer(a) for a in str(test.get("expected_answer", "")).split("|") if a.strip()]
    think_options = {
        **RUN_OPTIONS,
        "num_predict": max(RUN_OPTIONS.get("num_predict") or 0, THINKING_MIN_PREDICT),
        "num_ctx": max(RUN_OPTIONS.get("num_ctx") or 0, THINKING_MIN_CTX),
    }
    plain_options = {**RUN_OPTIONS, "num_ctx": think_options["num_ctx"]}

    def one_pass(think: bool, options: dict) -> tuple[dict | None, dict]:
        try:
            run = run_prompt(client, model, test["prompt"], options=options, think=think)
        except Exception as e:
            return None, {"error": f"erreur ({e})"}
        answer = extract_answer(run["response"])
        endless = False
        if answer is None and run["done_reason"] == "length":
            predict = options.get("num_predict")
            if not (predict and run["tokens"] >= predict):
                # contexte plein : problème de réglage, pas du modèle → erreur relançable
                return run, {"error": f"{limit_reason(run, options)} avant la réponse"}
            # Limite « Tokens max » atteinte sans conclure : dans un test de réflexion, c'est un VRAI résultat
            # (échec noté 1/5), pas une mesure manquante. Vu le 19/11 : qwen3.5:4b, 8192 tokens sur un calcul
            # de date, 40 « Wait » dans sa réflexion et aucun calcul mené au bout.
            endless = True
        return run, {
            "correct": answer is not None and answer in expected,
            "answer": answer,
            "endless": endless,
            "tokens": run["tokens"],
            "elapsed_sec": run["elapsed_sec"],
            "thinking_chars": run["thinking_chars"],
        }

    run, with_think = one_pass(True, think_options)
    if "error" in with_think:
        # mesure impossible (plantage, contexte plein…) : test en erreur, relançable
        return {**error_entry(test, f"Avec réflexion : {with_think['error']}", run), "options": think_options}

    # sans réflexion : réglages normaux du run. Certains modèles ne savent pas couper leur réflexion →
    # simple mention, la note n'en dépend pas
    _, without_think = one_pass(False, plain_options)

    score = 5 if with_think["correct"] else 1
    parts = [describe_pass("Avec réflexion", with_think), describe_pass("Sans réflexion", without_think)]
    if "error" not in without_think:
        if with_think["correct"] and not without_think["correct"]:
            parts.append("la réflexion fait la différence")
        elif with_think["correct"] and without_think["correct"]:
            parts.append(f"juste même sans réflexion, {with_think['tokens'] - without_think['tokens']} tokens de plus sans gain")
        elif not with_think["correct"] and without_think["correct"]:
            parts.append("la réflexion l'a induit en erreur")
    if not with_think["correct"] and with_think["answer"]:
        parts.append(f"répond {with_think['answer']}, attendu {expected[0] if expected else '?'}")

    response = run["response"]
    return {
        "test_id": test["id"],
        "label": test["label"],
        "category": test_category(test),
        "score": score,
        "rule_score": score,
        "judge_score": None,
        "strengths": " ; ".join(parts) if with_think["correct"] else "",
        "weaknesses": "" if with_think["correct"] else " ; ".join(parts),
        "tokens": run["tokens"],
        "tokens_per_sec": run["tokens_per_sec"],
        "elapsed_sec": run["elapsed_sec"],
        "ttft_sec": run["ttft_sec"],
        "load_sec": run["load_sec"],
        "prompt_eval_sec": run["prompt_eval_sec"],
        "prompt_tokens": run["prompt_tokens"],
        "response_preview": response[:300] + "..." if len(response) > 300 else response,
        "options": think_options,
        # détail des deux passages, pour un affichage dédié plus tard
        "think_compare": {"with": with_think, "without": without_think},
    }

def latency_summary(tests: list[dict]) -> tuple[float | None, float | None]:
    """(TTFT « à chaud », temps de chargement) d'un modèle sur ses tests.

    Seul le premier test d'un modèle paie son chargement en mémoire (qwen2.5:3b : TTFT 4,3 s dont 4,2 s de
    chargement, puis 0,2 s pour les tests suivants). On rapporte donc séparément :
    - le chargement : le plus long `load_sec` des tests ;
    - le TTFT : médiane des tests SANS celui qui a payé le chargement (celui au plus long `load_sec`) —
      une simple médiane ne suffit pas sur peu de tests (sur 2, c'est la moyenne des deux). Si le modèle
      était déjà chargé, écarter un test à chaud parmi d'autres ne change presque rien.
    Même calcul côté WebUI pour le comparatif (latencySummary() dans results.service.ts).
    """
    timed = [t for t in tests if t.get("ttft_sec") is not None]
    loads = [t["load_sec"] for t in timed if t.get("load_sec") is not None]
    load_max = round(max(loads), 3) if loads else None
    if len(timed) >= 2 and loads:
        cold = max(timed, key=lambda t: t.get("load_sec") or 0)
        timed = [t for t in timed if t is not cold]
    ttfts = sorted(t["ttft_sec"] for t in timed)
    if not ttfts:
        return None, load_max
    mid = len(ttfts) // 2
    median = ttfts[mid] if len(ttfts) % 2 else (ttfts[mid - 1] + ttfts[mid]) / 2
    return round(median, 3), load_max

def benchmark_model(
    client: OllamaClient,
    model: str,
    judge_model: str | None = None,
    verbose: bool = True,
    tests: list[dict] | None = None,
    stream_json: bool = False,
) -> dict:
    if not model_exists(client, model):
        if stream_json:
            emit_json({"event": "error", "model": model, "message": f"Modèle '{model}' introuvable"})
        else:
            print(f"  ✗ Modèle '{model}' introuvable. Lance : ollama pull {model}")
        return None

    if tests is None:
        tests = get_tests_for_model(model)
    detected_types = detect_model_type(model)

    # Un test de vision envoyé à un modèle qui ne voit pas (ou d'appel d'outils à un modèle sans « tools »)
    # renvoie une réponse vide, qui était quand même notée : on ne lance que les tests dont le modèle a la
    # capacité requise. (Garde-fou côté Python : la WebUI filtre déjà avant, mais la CLI non.)
    try:
        capabilities = set(client.capabilities(model))
    except Exception:
        capabilities = None  # Ollama ne répond pas sur /api/show : on ne filtre pas
    if capabilities is not None:
        skipped = [t["id"] for t in tests if REQUIRED_CAPABILITY.get(test_category(t), "completion") not in capabilities]
        if skipped:
            tests = [t for t in tests if t["id"] not in skipped]
            if stream_json:
                emit_json({"event": "tests_skipped", "model": model, "test_ids": skipped,
                           "message": f"{len(skipped)} test(s) ignoré(s) : capacité absente du modèle"})
            else:
                print(f"  ⚠  {len(skipped)} test(s) ignoré(s) (capacité absente) : {', '.join(skipped)}")

    if stream_json:
        emit_json({
            "event": "model_start",
            "model": model,
            "detected_types": detected_types,
            "test_count": len(tests),
            "judge_model": judge_model,
            "options": RUN_OPTIONS,
        })
    else:
        print(f"\n{'═'*60}")
        print(f"  Modèle : {model}")
        print(f"  Type détecté : {', '.join(detected_types)}")
        print(f"  Tests : {len(tests)}  |  Juge : {judge_model or 'règles uniquement'}")
        print(f"{'─'*60}")

    results = []
    total_tokens = 0
    total_time = 0

    for test in tests:
        if verbose:
            print(f"  [{test['id']}] {test['label']}... ", end="", flush=True)

        expected_tool = test.get("expected_tool")

        if test_category(test) == "thinking":
            entry = run_thinking_test(client, model, test)
            if not entry.get("error"):
                total_tokens += entry["tokens"]
                total_time += entry["elapsed_sec"]
            if verbose:
                print(f"{entry['score']}/5 — {entry['strengths'] or entry['weaknesses']}")
            results.append(entry)
            if stream_json:
                emit_json({"event": "test_result", "model": model, **entry})
            continue

        try:
            run = run_prompt(client, model, test["prompt"], tools=test.get("tools"), images=load_test_images(test))
        except Exception as e:
            if verbose:
                print(f"ERREUR ({e})")
            message = f"Erreur : {e}"
            if "out of memory" in str(e).lower():
                # vu le 17/11 sur les tests de vision : l'encodage de l'image demande de la mémoire GPU en plus
                # du modèle déjà chargé, et llama-server plante
                message += (" — mémoire GPU insuffisante (avec une image, l'encodeur vision en demande en plus du "
                            "modèle) : décharger les autres modèles, ou réduire le contexte, puis relancer")
            entry = error_entry(test, message)
            results.append(entry)
            if stream_json:
                emit_json({"event": "test_result", "model": model, **entry})
            continue

        # Réponse vide (hors tests d'appel d'outils, où l'appel remplace le texte) : jamais notée par les
        # règles ni le juge — une règle « ne contient pas X » passe sur un texte vide, et le juge notait
        # jusqu'à 4/5 une réponse absente.
        if not expected_tool and not run["response"].strip():
            if run["done_reason"] == "length" and run["thinking_chars"]:
                # Modèle à raisonnement coupé PENDANT sa réflexion : la limite de tokens compte aussi la
                # réflexion (qwen3.5:4b : 4 742 caractères de réflexion, 0 de réponse, avec 1024 tokens max).
                # Mesure invalide, pas un échec du modèle → erreur relançable avec une limite plus haute.
                message = (f"Réflexion non terminée : {limit_reason(run, RUN_OPTIONS)} avant la réponse — "
                           "augmenter « Tokens max » (ou le contexte) pour les modèles à raisonnement")
                entry = error_entry(test, message, run)
            else:
                entry = {**error_entry(test, "Réponse vide", run), "error": False, "response_preview": ""}
            if verbose:
                print(entry["weaknesses"])
            results.append(entry)
            if stream_json:
                emit_json({"event": "test_result", "model": model, **entry})
            continue

        total_tokens += run["tokens"]
        total_time += run["elapsed_sec"]

        response = run["response"]
        checks = test["checks"]

        if expected_tool:
            # Tests "tool_calling" : scorés sur l'appel d'outil, pas sur le texte
            # (voir score_tool_call() — pas de rule_score/judge_score ici)
            final_score, strengths, weaknesses = score_tool_call(run["tool_calls"], expected_tool)
            rule_score = None
            judge_result = None
        else:
            rule_score, missing = score_rules(response, checks["rules"])

            judge_result = None
            if judge_model:
                judge_result = score_with_judge(
                    client,
                    judge_model,
                    test["prompt"],
                    response,
                    checks["judge_criteria"],
                    expected_answer=test.get("expected_answer"),
                )
                final_score = round(judge_result["score"] * 0.6 + rule_score * 0.4)
            else:
                final_score = rule_score
            strengths = judge_result["strengths"] if judge_result else ""
            weaknesses = judge_result["weaknesses"] if judge_result else ", ".join(missing) if missing else ""

        if verbose:
            stars = "★" * final_score + "☆" * (5 - final_score)
            print(f"{stars} ({run['tokens_per_sec']} t/s)")

        test_entry = {
            "test_id": test["id"],
            "label": test["label"],
            "category": next((k for k, v in TESTS.items() if any(t["id"] == test["id"] for t in v)), "unknown"),
            "score": final_score,
            "rule_score": rule_score,
            "judge_score": judge_result["score"] if judge_result else None,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "tokens": run["tokens"],
            "tokens_per_sec": run["tokens_per_sec"],
            "elapsed_sec": run["elapsed_sec"],
            "ttft_sec": run["ttft_sec"],
            "load_sec": run["load_sec"],
            "prompt_eval_sec": run["prompt_eval_sec"],
            "prompt_tokens": run["prompt_tokens"],
            "response_preview": response[:300] + "..." if len(response) > 300 else response,
            # réglages avec lesquels CE test a été passé : le comparatif (leaderboard.json) fusionne des
            # tests de runs différents, chaque test doit donc porter les siens
            "options": dict(RUN_OPTIONS),
        }
        results.append(test_entry)
        if stream_json:
            emit_json({"event": "test_result", "model": model, **test_entry})

    # Tests en erreur (plantage, réflexion coupée…) exclus de la moyenne : ce ne sont pas des mauvaises
    # réponses mais des mesures manquantes, à relancer
    scored = [r for r in results if not r.get("error")]
    avg_score = round(sum(r["score"] for r in scored) / len(scored), 2) if scored else 0
    avg_tps = round(total_tokens / total_time, 1) if total_time > 0 else 0
    ttft_med, load_max = latency_summary(results)

    score_map = {5: "Excellent", 4: "Bon", 3: "Passable", 2: "Insuffisant", 1: "Inutilisable"}
    verdict = score_map.get(round(avg_score), "Passable") if scored else "En erreur"

    if stream_json:
        emit_json({
            "event": "model_done",
            "model": model,
            "avg_score": avg_score,
            "avg_tokens_per_sec": avg_tps,
            "median_ttft_sec": ttft_med,
            "load_sec": load_max,
            "total_tests": len(results),
            "verdict": verdict,
        })
    else:
        print(f"\n  Score moyen : {avg_score}/5 — {verdict}")
        print(f"  Vitesse moyenne : {avg_tps} tokens/sec")

    return {
        "model": model,
        "detected_types": detected_types,
        "judge_model": judge_model,
        "options": dict(RUN_OPTIONS),
        "timestamp": datetime.now().isoformat(),
        "avg_score": avg_score,
        "avg_tokens_per_sec": avg_tps,
        "median_ttft_sec": ttft_med,
        "load_sec": load_max,
        "total_tests": len(results),
        "verdict": verdict,
        "tests": results
    }

# ─── Export JSON ─────────────────────────────────────────────────────────────

def save_results(all_results: list[dict], output_path: str = "benchmark_results.json", quiet: bool = False):
    # Recrée le dossier s'il a disparu pendant le run (ex. `git rm` de results/ : git supprime
    # aussi le dossier devenu vide) — sinon des heures de tests sont perdues au moment d'écrire.
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "ollama_host": OllamaClient().base_url,
            "options": RUN_OPTIONS,
            "models": all_results
        }, f, ensure_ascii=False, indent=2)
    if not quiet:
        print(f"\n  Résultats sauvegardés : {output_path}")

# ─── CLI ─────────────────────────────────────────────────────────────────────

def option_value(cast):
    """Type argparse : un nombre, ou « model » → None (laisser le réglage du modelfile du modèle)."""
    def parse(value: str):
        return None if value == "model" else cast(value)
    return parse

def main():
    parser = argparse.ArgumentParser(
        description="Benchmark automatisé de modèles Ollama",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples :
  python ollama_benchmark.py --list-models
  python ollama_benchmark.py --models qwen2.5-coder:7b
  python ollama_benchmark.py --models qwen2.5-coder:7b gemma3:4b --judge llama3.2:3b
  python ollama_benchmark.py --models qwen2.5-coder:7b --output mes_tests.json
        """
    )
    parser.add_argument("--models", nargs="+", help="Modèles à tester (ex: qwen2.5-coder:7b gemma3:4b)")
    parser.add_argument("--judge", default=DEFAULT_JUDGE, help=f"Modèle juge (défaut : {DEFAULT_JUDGE})")
    parser.add_argument("--no-judge", action="store_true", help="Désactive le juge LLM (scoring par règles uniquement)")
    parser.add_argument("--tests", help="IDs de tests à lancer, séparés par des virgules (défaut : auto-détection par modèle)")
    parser.add_argument("--output", default="benchmark_results.json", help="Fichier JSON de sortie")
    parser.add_argument("--list-models", action="store_true", help="Liste les modèles Ollama disponibles")
    # --manifest : dump JSON des catégories/tests (+ recommandations si --models
    # fourni) sans lancer d'inférence — consommé par la WebUI, voir build_manifest().
    parser.add_argument("--manifest", action="store_true", help="Affiche le manifest JSON des tests disponibles et quitte")
    parser.add_argument("--stream-json", action="store_true", help="Émet un événement JSON par ligne au lieu de la sortie décorative (pour un process parent)")
    parser.add_argument("--quiet", action="store_true", help="Moins de verbosité")
    # MIGRÉ : nouvel argument, absent avant. OLLAMA_BASE était une constante figée ;
    # avec OllamaClient, il devient trivial de le rendre configurable en CLI.
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"URL du serveur Ollama (défaut : {DEFAULT_HOST})")
    # Options de génération des modèles testés (voir RUN_OPTIONS) — « model » = ne pas imposer de valeur,
    # le réglage du modelfile du modèle s'applique
    parser.add_argument("--temperature", type=option_value(float), default=DEFAULT_TEMPERATURE,
                        help=f"Température des modèles testés, ou « model » (défaut : {DEFAULT_TEMPERATURE})")
    parser.add_argument("--num-ctx", type=option_value(int), default=DEFAULT_NUM_CTX,
                        help=f"Taille du contexte, ou « model » (défaut : {DEFAULT_NUM_CTX})")
    parser.add_argument("--plan", help='Tests par modèle en JSON, ex. \'{"qwen3:8b": ["code_fizzbuzz"], "gemma4:12b": ["chat_explain"]}\' (remplace --models/--tests)')
    parser.add_argument("--num-predict", type=int, default=DEFAULT_NUM_PREDICT,
                        help=f"Nombre max de tokens générés par réponse (défaut : {DEFAULT_NUM_PREDICT})")

    args = parser.parse_args()
    RUN_OPTIONS.update(temperature=args.temperature, num_ctx=args.num_ctx, num_predict=args.num_predict)

    if args.manifest:
        print(json.dumps(build_manifest(args.models), ensure_ascii=False))
        return

    if args.no_judge:
        args.judge = None

    selected_tests = get_tests_by_ids(args.tests.split(",")) if args.tests else None

    # --plan : une liste de tests PROPRE À CHAQUE MODÈLE (relance des tests ratés d'un run, où chaque modèle
    # a raté des tests différents) — remplace --models/--tests
    plan: dict[str, list[dict]] | None = None
    if args.plan:
        raw_plan = json.loads(args.plan)
        plan = {model: get_tests_by_ids(ids) for model, ids in raw_plan.items()}
        args.models = list(plan)

    with OllamaClient(base_url=args.host) as client:

        if args.list_models:
            models = list_local_models(client)
            if models:
                print("Modèles Ollama disponibles :")
                for m in models:
                    types = ", ".join(detect_model_type(m))
                    print(f"  {m:<40} [{types}]")
            else:
                print("Aucun modèle trouvé ou Ollama non démarré.")
            return

        if not args.models:
            parser.print_help()
            return

        if not args.stream_json:
            print(f"\nOllama Benchmark — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
            print(f"Hôte : {args.host}")

        if args.judge and not model_exists(client, args.judge):
            if args.stream_json:
                emit_json({"event": "error", "model": None, "message": f"Juge '{args.judge}' introuvable — scoring par règles uniquement"})
            elif args.judge == DEFAULT_JUDGE:
                print(f"\n  ⚠  Juge par défaut '{DEFAULT_JUDGE}' introuvable.")
                print(f"     Crée-le avec : ollama create benchmark-judge -f Modelfile.judge")
                print(f"     Ou précise un autre juge : --judge <modèle>")
                print(f"     Le benchmark continuera avec le scoring par règles uniquement.\n")
            else:
                print(f"\n  ⚠  Juge '{args.judge}' introuvable — scoring par règles uniquement.\n")
            args.judge = None

        all_results = []
        for model in args.models:
            result = benchmark_model(
                client,
                model,
                judge_model=args.judge,
                verbose=not args.quiet and not args.stream_json,
                tests=plan[model] if plan else selected_tests,
                stream_json=args.stream_json,
            )
            if result:
                all_results.append(result)
                # Écrit après chaque modèle plutôt qu'une seule fois à la fin :
                # si le run est annulé (ou plante) en cours de route, les
                # modèles déjà testés restent sur disque et n'ont pas besoin
                # d'être relancés.
                save_results(all_results, args.output, quiet=True)

    if all_results:
        if args.stream_json:
            emit_json({"event": "run_done", "output_path": args.output})
        elif not args.quiet:
            print(f"\n  Résultats sauvegardés : {args.output}")

        if not args.stream_json:
            if len(all_results) > 1:
                print(f"\n{'═'*60}")
                print("  Classement final")
                print(f"{'─'*60}")
                ranked = sorted(all_results, key=lambda x: x["avg_score"], reverse=True)
                for i, r in enumerate(ranked, 1):
                    bar = "█" * int(r["avg_score"] * 4) + "░" * (20 - int(r["avg_score"] * 4))
                    print(f"  {i}. {r['model']:<35} {bar} {r['avg_score']}/5")

            print(f"\n  Ouvre benchmark_report.html pour le rapport visuel.")
            print(f"  (charge le fichier {args.output})\n")

if __name__ == "__main__":
    main()