from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from typing import Protocol

from .utils import normalize


class EmbeddingsProvider(Protocol):
    def embed_text(self, text: str) -> list[float] | None: ...


@dataclass
class NoneEmbeddingsProvider:
    dim: int

    def embed_text(self, text: str) -> list[float] | None:
        return None


@dataclass
class HashEmbeddingsProvider:
    """Deterministic, offline embeddings for dev/test.

    Not semantically meaningful, but:
      - deterministic per exact input string
      - correct dimensionality
      - normalized for cosine distance ops

    This is ideal for:
      - verifying pgvector index/query wiring
      - smoke tests in CI without external API keys
    """

    dim: int

    def embed_text(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        seed = int.from_bytes(digest[:8], "big", signed=False)
        rng = random.Random(seed)
        vec = [rng.uniform(-1.0, 1.0) for _ in range(self.dim)]
        return normalize(vec)


def build_provider(name: str, dim: int) -> EmbeddingsProvider:
    name = (name or "").strip().lower()
    if name in ("none", "null", "off"):
        return NoneEmbeddingsProvider(dim=dim)
    if name in ("hash", "dev", "test"):
        return HashEmbeddingsProvider(dim=dim)
    # If you want OpenAI or other providers, implement in a separate module
    # and extend this factory. Keep the core service keyless by default.
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {name}")
