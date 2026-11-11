"""
tests_bank.py

Charge la banque de cas de test du benchmark depuis tests_bank.json (prompts +
critères de scoring, organisés par catégorie). Le JSON est le format partagé
avec la WebUI (webui/server/services/testsBank.service.ts) : la modale
"Gérer les tests" y lit/écrit directement le même fichier, sans passer par
Python — TESTS reflète donc toujours l'état créé/modifié/supprimé depuis l'UI.
"""

from __future__ import annotations

import json
from pathlib import Path

_TESTS_BANK_PATH = Path(__file__).parent / "tests_bank.json"

with open(_TESTS_BANK_PATH, encoding="utf-8") as f:
    TESTS: dict[str, list[dict]] = json.load(f)
