"""Embedding provider abstraction.

Supports multiple embedding modes:
- deterministic: Hash-based reproducible embeddings for dev/test
- none: No embeddings (skip vector operations)
- (future) openai: Real OpenAI ada-002 embeddings
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ..config import get_settings
from .deterministic import deterministic_unit_embedding, to_pgvector_literal


@dataclass(frozen=True)
class EmbeddingResult:
    """Result of embedding operation."""
    dim: int
    pgvector_literal: str  # e.g., "[0.01,0.02,...]"
    raw_vector: Optional[list[float]] = None


class EmbeddingProvider:
    """Base class for embedding providers."""
    
    async def embed(self, text: str) -> Optional[EmbeddingResult]:
        """
        Generate embedding for text.
        
        Args:
            text: Text to embed
        
        Returns:
            EmbeddingResult or None if embedding not available
        """
        raise NotImplementedError


class DeterministicEmbeddingProvider(EmbeddingProvider):
    """
    Deterministic hash-based embeddings.
    
    Produces reproducible vectors for testing and development,
    allowing pgvector similarity search to work without external APIs.
    """
    
    def __init__(self, dim: int = 1536):
        self.dim = dim
    
    async def embed(self, text: str) -> Optional[EmbeddingResult]:
        if not text or not text.strip():
            return None
        
        vec = deterministic_unit_embedding(text=text, dim=self.dim)
        return EmbeddingResult(
            dim=self.dim,
            pgvector_literal=to_pgvector_literal(vec),
            raw_vector=vec,
        )


class NullEmbeddingProvider(EmbeddingProvider):
    """No-op embedding provider (skip all vector operations)."""
    
    async def embed(self, text: str) -> Optional[EmbeddingResult]:
        return None


def get_embedding_provider() -> EmbeddingProvider:
    """
    Get configured embedding provider.
    
    Returns:
        EmbeddingProvider based on EMBEDDING_MODE setting
    """
    settings = get_settings()
    mode = (settings.embedding_mode or "deterministic").lower().strip()
    
    if mode == "none":
        return NullEmbeddingProvider()
    
    # Default to deterministic
    return DeterministicEmbeddingProvider(dim=settings.embedding_dim)
