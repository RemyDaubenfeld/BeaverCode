"""
exports.py

Export des résultats de benchmark en CSV et Markdown, en complément du
JSON déjà géré par save_results() dans benchmark.py.

Fichier séparé (et non fusionné dans benchmark.py), pour la même raison
que metrics.py : réutilisable tel quel par un futur endpoint Nitro qui
lit benchmark_results_merged.json directement.

Porté depuis Local-LLM-Comparator-main/a-porter/src/exports.py, adapté au
schéma réel de benchmark.py — stdlib `csv`/`io` uniquement (pas de pandas),
cohérent avec l'absence de dépendance lourde dans ce dossier (seul httpx
est utilisé, par ollama_client.py).
"""

from __future__ import annotations

import csv
import io
from typing import Any

from .metrics import results_dataframe_rows


def results_to_csv(all_results: list[dict[str, Any]]) -> str:
    """Une ligne par test (modèle × cas de test) — pratique pour un tableur."""
    rows = results_dataframe_rows(all_results)
    if not rows:
        return ""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def results_to_markdown(all_results: list[dict[str, Any]]) -> str:
    """Rapport lisible : un résumé par modèle, puis le détail de chaque test."""
    lines = ["# Rapport de benchmark", ""]
    for r in all_results:
        lines.append(f"## {r['model']}")
        lines.append(f"- Score moyen : {r.get('avg_score')}/5 — {r.get('verdict')}")
        lines.append(f"- Vitesse moyenne : {r.get('avg_tokens_per_sec')} tokens/s")
        lines.append(f"- Tests : {r.get('total_tests')}")
        lines.append("")
        for t in r.get("tests", []):
            lines.append(f"### {t.get('label')} ({t.get('category')}) — {t.get('score')}/5")
            if t.get("strengths"):
                lines.append(f"- Points forts : {t['strengths']}")
            if t.get("weaknesses"):
                lines.append(f"- Points faibles : {t['weaknesses']}")
            lines.append("")
    return "\n".join(lines)
