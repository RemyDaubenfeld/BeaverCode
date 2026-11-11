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

# ─── Envoi d'un prompt ───────────────────────────────────────────────────────

def run_prompt(
    client: OllamaClient,
    model: str,
    prompt: str,
    system: str = "",
    force_cpu: bool = False,
    tools: list[dict] | None = None,
    images: list[str] | None = None,
    num_predict: int = DEFAULT_NUM_PREDICT,
) -> dict:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    options = {"temperature": DEFAULT_TEMPERATURE, "num_ctx": DEFAULT_NUM_CTX, "num_predict": num_predict}
    if force_cpu:
        options["num_gpu"] = 0

    start = time.time()
    full_text_parts = []
    final_chunk = None

    for chunk in client.chat(
        model=model,
        messages=messages,
        options=options,
        tools=tools,
        images=images,
    ):
        full_text_parts.append(chunk.content)
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

    return {
        "response": response_text,
        "tokens": eval_count,
        "elapsed_sec": round(elapsed, 2),
        "tokens_per_sec": tokens_per_sec,
        "tool_calls": tool_calls,
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
        result = run_prompt(client, judge_model, judge_prompt, system=JUDGE_SYSTEM, force_cpu=True, num_predict=400)
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

    manifest = {"categories": categories, "default_judge": DEFAULT_JUDGE}

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

    if stream_json:
        emit_json({
            "event": "model_start",
            "model": model,
            "detected_types": detected_types,
            "test_count": len(tests),
            "judge_model": judge_model,
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

        try:
            run = run_prompt(client, model, test["prompt"], tools=test.get("tools"), images=load_test_images(test))
        except Exception as e:
            if verbose:
                print(f"ERREUR ({e})")
            error_entry = {
                "test_id": test["id"],
                "label": test["label"],
                "category": next((k for k, v in TESTS.items() if any(t["id"] == test["id"] for t in v)), "unknown"),
                "score": 0, "rule_score": 0, "judge_score": None,
                "strengths": "", "weaknesses": f"Erreur : {e}",
                "tokens": 0, "tokens_per_sec": 0, "elapsed_sec": 0,
                "response_preview": f"ERREUR: {e}"
            }
            results.append(error_entry)
            if stream_json:
                emit_json({"event": "test_result", "model": model, **error_entry})
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
            "response_preview": response[:300] + "..." if len(response) > 300 else response
        }
        results.append(test_entry)
        if stream_json:
            emit_json({"event": "test_result", "model": model, **test_entry})

    avg_score = round(sum(r["score"] for r in results) / len(results), 2) if results else 0
    avg_tps = round(total_tokens / total_time, 1) if total_time > 0 else 0

    score_map = {5: "Excellent", 4: "Bon", 3: "Passable", 2: "Insuffisant", 1: "Inutilisable"}
    verdict = score_map.get(round(avg_score), "Passable")

    if stream_json:
        emit_json({
            "event": "model_done",
            "model": model,
            "avg_score": avg_score,
            "avg_tokens_per_sec": avg_tps,
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
        "timestamp": datetime.now().isoformat(),
        "avg_score": avg_score,
        "avg_tokens_per_sec": avg_tps,
        "total_tests": len(results),
        "verdict": verdict,
        "tests": results
    }

# ─── Export JSON ─────────────────────────────────────────────────────────────

def save_results(all_results: list[dict], output_path: str = "benchmark_results.json", quiet: bool = False):
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "ollama_host": OllamaClient().base_url,
            "models": all_results
        }, f, ensure_ascii=False, indent=2)
    if not quiet:
        print(f"\n  Résultats sauvegardés : {output_path}")

# ─── CLI ─────────────────────────────────────────────────────────────────────

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

    args = parser.parse_args()

    if args.manifest:
        print(json.dumps(build_manifest(args.models), ensure_ascii=False))
        return

    if args.no_judge:
        args.judge = None

    selected_tests = get_tests_by_ids(args.tests.split(",")) if args.tests else None

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
                tests=selected_tests,
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