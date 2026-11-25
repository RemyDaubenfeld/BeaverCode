"""
ollama_client.py

Client Python pour l'API Ollama (http://localhost:11434 par défaut).

RÔLE DANS TA STACK (mis à jour) :
  Ce module ne sert plus qu'à `benchmark_tool/benchmark.py` (méthodes
  list_models() et chat()). La "Gestion des modèles" de la WebUI (bibliothèque,
  import GGUF, création de modelfile, suppression) est désormais 100%
  TypeScript côté `webui/server/` — appel direct à l'API Ollama, aucun bridge
  Python. Le moteur du harnais est lui aussi en TypeScript (socle OpenFox),
  pas en Python.

POURQUOI CE MODULE EXISTE ENCORE (au lieu d'utiliser `requests` ou la lib
`ollama` directement dans benchmark.py) :
  - Un seul endroit où sont définis les formats de données (ModelInfo,
    ChatChunk) au lieu de parser des dict bruts dans le code du benchmark.
  - Un seul endroit à corriger si l'API d'Ollama change un jour.

Le support image (`encode_image_bytes`, paramètre `images` de `chat()`) est
gardé volontairement — prévu pour la catégorie de benchmark `vision`
(roadmap étape 2), pas encore écrite faute d'image de test à embarquer.

DÉPENDANCE :
  pip install httpx --break-system-packages
"""

from __future__ import annotations

import base64  # pour encoder les images en base64 (format attendu par Ollama pour la vision)
import json   # pour décoder les lignes de streaming (chaque ligne est un objet JSON)
from dataclasses import dataclass, field   # @dataclass évite d'écrire __init__ à la main
from typing import Any, Iterator

import httpx  # client HTTP moderne, remplace `requests`, gère aussi l'async


# URL par défaut du serveur Ollama. Modifiable à l'instanciation du client
# si jamais tu veux pointer vers un Ollama qui tourne ailleurs (autre conteneur,
# autre machine du réseau local, etc.)
DEFAULT_BASE_URL = "http://localhost:11434"


def encode_image_bytes(data: bytes) -> str:
    """
    Encode le contenu binaire d'une image en base64, format attendu par
    Ollama dans le champ "images" de /api/chat.

    Prévu pour la catégorie de benchmark `vision` (roadmap étape 2), pas
    encore écrite.
    """
    return base64.b64encode(data).decode("utf-8")


class OllamaError(RuntimeError):
    """Erreur renvoyée par Ollama dans sa réponse (ligne {"error": "..."})."""


@dataclass
class ModelInfo:
    """
    Représente UN modèle installé localement dans Ollama, tel que renvoyé
    par l'endpoint GET /api/tags.

    Utilisation : `benchmark_tool/benchmark.py` (`list_local_models()`).
    """
    name: str                          # ex: "qwen2.5-coder-custom:latest"
    size: int                          # taille du modèle en octets sur le disque
    parameter_size: str | None = None  # ex: "7B", "14B" — nombre de paramètres
    quantization: str | None = None    # ex: "Q4_K_M" — niveau de compression du modèle
    modified_at: str | None = None     # date de dernière modification (string ISO)

    @classmethod
    def from_tags_entry(cls, entry: dict[str, Any]) -> "ModelInfo":
        """
        Fabrique un ModelInfo à partir d'UNE entrée brute renvoyée par
        /api/tags. C'est une "factory method" : au lieu de faire
            ModelInfo(name=..., size=..., ...)
        partout où on lit la réponse JSON, on centralise ici la traduction
        JSON brut → objet Python propre.
        """
        details = entry.get("details", {})
        return cls(
            name=entry["name"],   # volontairement pas .get() : un modèle sans nom
                                   # est une réponse anormale d'Ollama, on VEUT planter
            size=entry.get("size", 0),
            parameter_size=details.get("parameter_size"),
            quantization=details.get("quantization_level"),
            modified_at=entry.get("modified_at"),
        )


@dataclass
class ChatChunk:
    """
    Représente UN morceau de réponse reçu pendant un streaming de /api/chat.

    Le "streaming" veut dire qu'Ollama n'envoie pas la réponse d'un coup à la fin,
    mais token par token (ou petit groupe de tokens) au fur et à mesure qu'il génère.
    Chaque morceau reçu devient un ChatChunk.

    Le DERNIER chunk reçu a `done=True` et contient en plus les métriques
    de performance finales (nombre de tokens générés, durée, etc.) — c'est
    le comportement standard de l'API Ollama.
    """
    content: str                        # le texte de CE morceau (peut être vide sur le dernier chunk)
    done: bool = False                  # True uniquement sur le tout dernier chunk du stream
    total_duration_ns: int | None = None    # durée totale de la requête, en nanosecondes
    eval_count: int | None = None           # nombre de tokens générés (uniquement rempli si done=True)
    eval_duration_ns: int | None = None     # durée de la génération seule (hors chargement du modèle)
    # Ce qui se passe AVANT le premier token (le TTFT, « time to first token », en est la somme) :
    load_duration_ns: int | None = None         # chargement du modèle en mémoire (quelques s à froid, ~0,2 s s'il est déjà chargé)
    prompt_eval_count: int | None = None        # nombre de tokens du prompt lus par le modèle
    prompt_eval_duration_ns: int | None = None  # durée de lecture du prompt
    # Modèles à raisonnement : leur réflexion arrive à part (message.thinking), AVANT la réponse
    thinking: str = ""
    done_reason: str | None = None  # dernier chunk : "stop" (fin normale) ou "length" (limite num_predict atteinte)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)  # appels d'outils demandés par le modèle : sur le morceau qui les contient, AVANT le chunk final (vide) — à cumuler sur tout le flux

    @property
    def tokens_per_second(self) -> float | None:
        """
        Calcule la vitesse de génération en tokens/seconde.

        @property permet d'appeler ça comme un attribut plutôt qu'une méthode :
            chunk.tokens_per_second       (correct, grâce à @property)
            chunk.tokens_per_second()     (incorrect, lèverait une erreur)

        Renvoie None si les données ne sont pas encore disponibles
        (c'est-à-dire sur tous les chunks SAUF le dernier, où done=True).
        """
        if self.eval_count and self.eval_duration_ns:
            # eval_duration_ns est en nanosecondes -> on divise par 1e9 pour avoir des secondes
            return self.eval_count / (self.eval_duration_ns / 1e9)
        return None


class OllamaClient:
    """
    Client HTTP synchrone vers Ollama. Utilisé par `benchmark_tool/benchmark.py`.

    S'utilise avec un `with` (context manager) pour garantir la fermeture
    propre de la connexion HTTP même en cas d'erreur :

        with OllamaClient() as client:
            models = client.list_models()
        # la connexion est automatiquement fermée ici, même si une exception
        # a été levée dans le bloc `with`
    """

    def __init__(self, base_url: str = DEFAULT_BASE_URL, timeout: float = 120.0):
        # .rstrip("/") retire un éventuel "/" final pour éviter d'avoir
        # "http://localhost:11434//api/tags" (double slash) plus loin
        self.base_url = base_url.rstrip("/")
        # httpx.Client garde une connexion TCP réutilisable entre les appels
        # (plus rapide que d'ouvrir/fermer une connexion à chaque requête).
        # timeout=120s car générer du texte avec un LLM local peut prendre
        # largement plus de temps qu'un appel HTTP classique.
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout)

    def close(self) -> None:
        """Ferme proprement la connexion HTTP sous-jacente."""
        self._client.close()

    def __enter__(self) -> "OllamaClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def version(self) -> str | None:
        """Version du serveur Ollama (GET /api/version), ex. "0.31.1" ; None si indisponible."""
        try:
            r = self._client.get("/api/version")
            r.raise_for_status()
            return r.json().get("version")
        except (httpx.HTTPError, ValueError):
            return None

    def capabilities(self, model: str) -> list[str]:
        """Capacités du modèle selon Ollama (/api/show) : completion, tools, thinking, vision, embedding…"""
        r = self._client.post("/api/show", json={"model": model})
        r.raise_for_status()
        return r.json().get("capabilities") or []

    def list_models(self) -> list[ModelInfo]:
        """
        Liste tous les modèles installés localement (GET /api/tags).
        Utilisé par `benchmark.py` pour peupler la liste de modèles testables.
        """
        r = self._client.get("/api/tags")
        r.raise_for_status()  # lève une exception si Ollama renvoie un code d'erreur HTTP (4xx/5xx)
        # .get("models", []) : si la clé "models" est absente (réponse vide/inattendue),
        # on itère sur une liste vide plutôt que de planter
        return [ModelInfo.from_tags_entry(m) for m in r.json().get("models", [])]

    def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None,
        options: dict[str, Any] | None = None,
        images: list[str] | None = None,
        think: bool | None = None,
    ) -> Iterator[ChatChunk]:
        """
        Appel STREAMÉ à /api/chat : on travaille avec un historique de
        conversation (`messages`, une liste de {"role": ..., "content": ...}),
        et on reçoit la réponse progressivement, morceau par morceau.

        Renvoie un générateur de ChatChunk : chaque itération du `for`
        correspond à un nouveau morceau de texte reçu.

        Utilisé par `benchmark.py` (`run_prompt()`) pour exécuter les tests
        du benchmark.

        Le paramètre `tools` existe déjà (function calling façon OpenAI),
        même si le benchmark ne l'utilise pas encore pour tous les cas — le
        scoring `tool_calling` de `tests_bank.py` en aura besoin.

        `images` (base64, voir encode_image_bytes()) est attaché au DERNIER
        message de `messages` — c'est la convention Ollama pour /api/chat
        avec un modèle vision (catégorie de benchmark `vision`).

        `think` : True / False active ou coupe la réflexion d'un modèle à
        thinking (paramètre `think` d'Ollama) ; None = comportement par défaut
        du modèle. Avec True, la réflexion arrive à part (ChatChunk.thinking),
        hors de `content`.

        Lève OllamaError si Ollama signale une erreur (modèle introuvable,
        plantage en cours de génération…).

        Exemple d'utilisation :
            for chunk in client.chat("qwen2.5-coder:7b", [{"role": "user", "content": "Bonjour"}]):
                print(chunk.content, end="", flush=True)  # affiche au fur et à mesure
                if chunk.done:
                    print(f"\\n({chunk.tokens_per_second:.1f} tokens/s)")
        """
        if images and messages:
            messages = [*messages[:-1], {**messages[-1], "images": images}]

        payload: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
        if tools:
            payload["tools"] = tools
        if options:
            payload["options"] = options
        if think is not None:
            payload["think"] = think

        with self._client.stream("POST", "/api/chat", json=payload) as r:
            # Ollama envoie une ligne JSON par "morceau" de réponse générée.
            # Format typique d'une ligne :
            #   {"message": {"role": "assistant", "content": "Bon"}, "done": false}
            #   {"message": {"role": "assistant", "content": "jour"}, "done": false}
            #   {"message": {"role": "assistant", "content": ""}, "done": true, "eval_count": 42, ...}
            for line in r.iter_lines():
                if not line:
                    continue  # ignore les lignes vides
                data = json.loads(line)
                # Erreur signalée PENDANT la réponse : Ollama a déjà renvoyé « 200 OK », il ne peut plus changer
                # le code HTTP et envoie à la place une ligne {"error": "..."} puis ferme le flux. Ex. réel
                # (17/11) : « CUDA error: out of memory » à l'encodage d'une image, llama-server planté. Ignorer
                # cette ligne transformait la panne en « réponse vide » notée 0 → on lève une exception, que le
                # benchmark enregistre comme test en erreur (relançable). Couvre aussi les erreurs HTTP (404
                # modèle introuvable…), dont le corps a le même format.
                if data.get("error"):
                    raise OllamaError(data["error"])
                # .get("message", {}) : sécurité si jamais une ligne ne contient
                # pas cette clé (ne devrait pas arriver avec l'API Ollama standard,
                # mais évite un plantage si le format change légèrement un jour)
                message = data.get("message", {})
                yield ChatChunk(
                    content=message.get("content", ""),
                    done=data.get("done", False),
                    total_duration_ns=data.get("total_duration"),
                    eval_count=data.get("eval_count"),
                    eval_duration_ns=data.get("eval_duration"),
                    load_duration_ns=data.get("load_duration"),
                    prompt_eval_count=data.get("prompt_eval_count"),
                    prompt_eval_duration_ns=data.get("prompt_eval_duration"),
                    thinking=message.get("thinking", "") or "",
                    done_reason=data.get("done_reason"),
                    tool_calls=message.get("tool_calls") or [],
                )


# =============================================================================
# EXEMPLE D'USAGE
#
# Ce bloc ne s'exécute QUE si le fichier est lancé directement
# (`python3 ollama_client.py`), pas s'il est importé depuis un autre script
# (`from ollama_client import OllamaClient`). C'est la convention standard
# Python pour ajouter un exemple/test rapide sans qu'il s'exécute par erreur
# ailleurs.
# =============================================================================

if __name__ == "__main__":
    with OllamaClient() as client:
        print("Modèles installés :")
        for m in client.list_models():
            print(f"  - {m.name} ({m.parameter_size or '?'}, {m.quantization or '?'})")
