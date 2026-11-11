"""
metrics.py

Agrégation des résultats de benchmark.py. Indépendant d'Ollama et de
benchmark.py — opère uniquement sur la structure JSON produite par
save_results() (voir benchmark.py) :
    {"generated_at", "ollama_host", "models": [
        {"model", "avg_score", "avg_tokens_per_sec", "total_tests",
         "verdict", "tests": [{"test_id", "label", "category", "score", ...}]}
    ]}

Fichier séparé (et non fusionné dans benchmark.py) car il n'a besoin de
rien de spécifique à l'orchestration du benchmark — un futur endpoint Nitro
qui lit directement benchmark_results_merged.json pourra l'utiliser sans
passer par benchmark.py.

Porté depuis Local-LLM-Comparator-main/a-porter/src/metrics.py, adapté au
schéma réel de benchmark.py : celui-ci ne fait qu'UN run par test (pas de
répétitions), donc pas de notion de "unique_outputs"/stabilité ici — la
catégorisation par `category` remplace cet axe d'analyse.
"""

from __future__ import annotations

from typing import Any


def leaderboard(all_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Classement par modèle, trié par score moyen décroissant."""
    rows = [
        {
            "model": r["model"],
            "avg_score": r.get("avg_score", 0),
            "avg_tokens_per_sec": r.get("avg_tokens_per_sec", 0),
            "total_tests": r.get("total_tests", 0),
            "verdict": r.get("verdict", "-"),
            "errors": sum(1 for t in r.get("tests", []) if t.get("score") == 0),
        }
        for r in all_results
    ]
    return sorted(rows, key=lambda row: row["avg_score"], reverse=True)


def category_breakdown(all_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Score moyen par catégorie de test (code, chat, tool_calling, ...), tous modèles confondus."""
    by_category: dict[str, list[int]] = {}
    for r in all_results:
        for t in r.get("tests", []):
            by_category.setdefault(t.get("category", "unknown"), []).append(t.get("score", 0))
    return sorted(
        (
            {
                "category": category,
                "avg_score": round(sum(scores) / len(scores), 2) if scores else 0,
                "count": len(scores),
            }
            for category, scores in by_category.items()
        ),
        key=lambda row: row["avg_score"],
        reverse=True,
    )


def results_dataframe_rows(all_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aplati chaque test de chaque modèle en une ligne — base pour exports.py (CSV/Markdown)."""
    rows: list[dict[str, Any]] = []
    for r in all_results:
        for t in r.get("tests", []):
            rows.append(
                {
                    "model": r["model"],
                    "test_id": t.get("test_id"),
                    "label": t.get("label"),
                    "category": t.get("category"),
                    "score": t.get("score"),
                    "rule_score": t.get("rule_score"),
                    "judge_score": t.get("judge_score"),
                    "tokens_per_sec": t.get("tokens_per_sec"),
                    "elapsed_sec": t.get("elapsed_sec"),
                    "strengths": t.get("strengths"),
                    "weaknesses": t.get("weaknesses"),
                }
            )
    return rows
