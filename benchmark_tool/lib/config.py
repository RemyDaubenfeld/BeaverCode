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

# Graine du tirage aléatoire des modèles testés : à graine et réglages égaux, un modèle redonne la même
# réponse (vérifié dans le chat le 19/11 : qwen2.5:3b, température 1, seed 42, trois fois la même réponse).
# Deux runs deviennent comparables sans imposer de température, qui reste celle du modèle si on le souhaite.
DEFAULT_SEED = int(os.getenv("BENCHMARK_SEED", "42"))

# Plafond de durée d'un passage de test « thinking », compté à partir du premier token (le chargement du
# modèle n'est pas compté). Mesuré dans le leaderboard du 23/11 : des réflexions sans fin jusqu'à 54 min
# pour un seul test. Au-delà, le passage est arrêté et noté comme une réflexion sans fin.
THINKING_TIME_LIMIT_SEC = int(os.getenv("BENCHMARK_THINKING_TIME_LIMIT", "300"))
