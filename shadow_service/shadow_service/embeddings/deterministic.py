"""Deterministic embeddings for development and testing.

This module provides reproducible embeddings based on text hashing,
enabling pgvector similarity searches to work without an external
embedding API. Crucial for dev/test so HNSW paths are exercised.
"""

from __future__ import annotations

import hashlib
import math
import random
from typing import List


def _seed_for_text(text: str) -> int:
    """Generate a deterministic seed from text content."""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big", signed=False)


def deterministic_unit_embedding(text: str, dim: int) -> List[float]:
    """
    Generate a deterministic unit-normalized embedding vector.
    
    Same text always produces the same vector, enabling reproducible
    similarity searches during development and testing.
    
    Args:
        text: Input text to embed
        dim: Embedding dimension (e.g., 1536 for OpenAI ada-002 compatibility)
    
    Returns:
        Unit-normalized vector of length `dim`
    """
    seed = _seed_for_text(text)
    rng = random.Random(seed)

    vec = [rng.uniform(-1.0, 1.0) for _ in range(dim)]
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def to_pgvector_literal(vec: List[float]) -> str:
    """
    Convert a vector to pgvector literal format.
    
    pgvector accepts: '[0.1,0.2,...]'
    
    Args:
        vec: List of floats
    
    Returns:
        String in pgvector format
    """
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Compute cosine similarity between two vectors.
    
    Args:
        vec1: First vector
        vec2: Second vector
    
    Returns:
        Cosine similarity in range [-1, 1]
    """
    if len(vec1) != len(vec2):
        raise ValueError("Vectors must have same dimension")
    
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1)) or 1.0
    norm2 = math.sqrt(sum(b * b for b in vec2)) or 1.0
    
    return dot / (norm1 * norm2)
