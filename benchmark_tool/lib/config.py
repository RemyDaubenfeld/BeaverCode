"""
config.py

Réglages par défaut du benchmark, surchargeables par variable d'environnement
pour ne pas avoir à modifier le code (ex: pointer vers un autre hôte Ollama
ou un autre juge sans toucher benchmark.py).
"""

from __future__ import annotations

import os

# Modèle utilisé comme juge LLM (voir score_with_judge() dans benchmark.py).
# Le créer avec : ollama create benchmark-judge -f Modelfile.judge
DEFAULT_JUDGE = os.getenv("BENCHMARK_JUDGE", "benchmark-judge:latest")

# URL du serveur Ollama à interroger.
DEFAULT_HOST = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Options de génération appliquées à chaque prompt de test (voir run_prompt()
# dans benchmark.py).
DEFAULT_TEMPERATURE = float(os.getenv("BENCHMARK_TEMPERATURE", "0.2"))
DEFAULT_NUM_CTX = int(os.getenv("BENCHMARK_NUM_CTX", "8192"))

# Plafond de tokens générés par réponse. Sans ça, un modèle qui n'émet jamais
# proprement de token de fin (fréquent sur les petits modèles peu entraînés)
# génère jusqu'à épuiser tout num_ctx — plusieurs minutes bloquées sur un seul
# test, pour un résultat de toute façon inexploitable au-delà de cette taille.
DEFAULT_NUM_PREDICT = int(os.getenv("BENCHMARK_NUM_PREDICT", "1024"))
