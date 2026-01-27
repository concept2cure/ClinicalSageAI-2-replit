"""
═══════════════════════════════════════════════════════════════════════════════
                    EMBEDDING SERVICE
═══════════════════════════════════════════════════════════════════════════════

Enterprise embedding service with multiple providers and caching.

PROVIDERS:
- OpenAI (text-embedding-3-small/large, ada-002)
- Sentence Transformers (all-MiniLM-L6-v2, etc.)
- Domain-adapted models (BioBERT, PubMedBERT)

FEATURES:
- Multi-provider fallback
- Embedding caching (Redis/local)
- Batch processing
- Dimensionality reduction
- Semantic similarity search

@module lumen_cortex.enterprise.embeddings
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import pickle
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import (
    Dict, Any, List, Optional, Tuple, Union,
    Protocol, TypeVar, Generic, Callable
)

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger("LumenCortex.Embeddings")

T = TypeVar('T')


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class EmbeddingConfig:
    """Embedding service configuration"""
    primary_provider: str = "openai"
    fallback_provider: str = "sentence_transformers"

    # OpenAI settings
    openai_model: str = "text-embedding-3-small"
    openai_dimensions: int = 1536

    # Sentence Transformers settings
    st_model: str = "all-MiniLM-L6-v2"
    st_dimensions: int = 384

    # Cache settings
    cache_enabled: bool = True
    cache_ttl_hours: int = 168  # 1 week
    cache_max_size: int = 100000
    cache_path: str = "/tmp/lumen_embeddings_cache"

    # Processing settings
    batch_size: int = 100
    max_tokens_per_request: int = 8000
    retry_attempts: int = 3

    @classmethod
    def from_env(cls) -> EmbeddingConfig:
        """Create config from environment variables"""
        return cls(
            primary_provider=os.environ.get('EMBEDDING_PROVIDER', 'openai'),
            openai_model=os.environ.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
            st_model=os.environ.get('ST_MODEL', 'all-MiniLM-L6-v2'),
            cache_enabled=os.environ.get('EMBEDDING_CACHE', 'true').lower() == 'true',
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          EMBEDDING CACHE
# ═══════════════════════════════════════════════════════════════════════════

class EmbeddingCache:
    """
    Local file-based embedding cache with LRU eviction.

    In production, replace with Redis for distributed caching.
    """

    def __init__(
        self,
        cache_path: str = "/tmp/lumen_embeddings_cache",
        max_size: int = 100000,
        ttl_hours: int = 168
    ):
        self.cache_path = Path(cache_path)
        self.cache_path.mkdir(parents=True, exist_ok=True)
        self.max_size = max_size
        self.ttl_seconds = ttl_hours * 3600

        # In-memory index
        self._index: Dict[str, Tuple[str, float]] = {}  # key -> (file_path, timestamp)
        self._lock = asyncio.Lock()

        # Load existing index
        self._load_index()

    def _load_index(self) -> None:
        """Load cache index from disk"""
        index_path = self.cache_path / "index.json"
        if index_path.exists():
            try:
                with open(index_path, 'r') as f:
                    self._index = json.load(f)
                logger.info(f"Loaded embedding cache with {len(self._index)} entries")
            except Exception as e:
                logger.warning(f"Failed to load cache index: {e}")
                self._index = {}

    def _save_index(self) -> None:
        """Save cache index to disk"""
        index_path = self.cache_path / "index.json"
        try:
            with open(index_path, 'w') as f:
                json.dump(self._index, f)
        except Exception as e:
            logger.warning(f"Failed to save cache index: {e}")

    def _make_key(self, text: str, model: str) -> str:
        """Create cache key from text and model"""
        content = f"{model}:{text}"
        return hashlib.sha256(content.encode()).hexdigest()

    async def get(self, text: str, model: str) -> Optional[NDArray]:
        """Get embedding from cache"""
        key = self._make_key(text, model)

        async with self._lock:
            if key not in self._index:
                return None

            file_path, timestamp = self._index[key]

            # Check TTL
            if time.time() - timestamp > self.ttl_seconds:
                # Expired - remove
                self._remove_entry(key)
                return None

            # Load embedding
            try:
                full_path = self.cache_path / file_path
                with open(full_path, 'rb') as f:
                    embedding = pickle.load(f)
                return embedding
            except Exception as e:
                logger.warning(f"Failed to load cached embedding: {e}")
                self._remove_entry(key)
                return None

    async def set(self, text: str, model: str, embedding: NDArray) -> None:
        """Store embedding in cache"""
        key = self._make_key(text, model)

        async with self._lock:
            # Evict oldest if at capacity
            while len(self._index) >= self.max_size:
                oldest_key = min(self._index.items(), key=lambda x: x[1][1])[0]
                self._remove_entry(oldest_key)

            # Save embedding
            file_path = f"emb_{key[:16]}.pkl"
            full_path = self.cache_path / file_path

            try:
                with open(full_path, 'wb') as f:
                    pickle.dump(embedding, f)

                self._index[key] = (file_path, time.time())
                self._save_index()
            except Exception as e:
                logger.warning(f"Failed to cache embedding: {e}")

    def _remove_entry(self, key: str) -> None:
        """Remove cache entry"""
        if key in self._index:
            file_path, _ = self._index[key]
            full_path = self.cache_path / file_path
            try:
                full_path.unlink(missing_ok=True)
            except Exception:
                pass
            del self._index[key]

    async def get_batch(
        self,
        texts: List[str],
        model: str
    ) -> Tuple[Dict[int, NDArray], List[int]]:
        """
        Get multiple embeddings from cache.

        Returns:
            Tuple of (cached embeddings by index, list of missing indices)
        """
        cached = {}
        missing = []

        for i, text in enumerate(texts):
            embedding = await self.get(text, model)
            if embedding is not None:
                cached[i] = embedding
            else:
                missing.append(i)

        return cached, missing

    async def set_batch(
        self,
        texts: List[str],
        embeddings: List[NDArray],
        model: str
    ) -> None:
        """Store multiple embeddings in cache"""
        for text, embedding in zip(texts, embeddings):
            await self.set(text, model, embedding)

    @property
    def size(self) -> int:
        return len(self._index)

    async def clear(self) -> int:
        """Clear all cached embeddings"""
        async with self._lock:
            count = len(self._index)
            for key in list(self._index.keys()):
                self._remove_entry(key)
            self._save_index()
            return count


# ═══════════════════════════════════════════════════════════════════════════
#                          EMBEDDING PROVIDERS
# ═══════════════════════════════════════════════════════════════════════════

class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers"""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Get model name"""
        pass

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Get embedding dimensions"""
        pass

    @abstractmethod
    async def embed(self, text: str) -> NDArray:
        """Embed single text"""
        pass

    @abstractmethod
    async def embed_batch(self, texts: List[str]) -> List[NDArray]:
        """Embed batch of texts"""
        pass


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider"""

    def __init__(
        self,
        model: str = "text-embedding-3-small",
        api_key: Optional[str] = None
    ):
        self._model = model
        self._api_key = api_key or os.environ.get('OPENAI_API_KEY')
        self._client = None

        # Model dimensions
        self._dimensions_map = {
            "text-embedding-3-small": 1536,
            "text-embedding-3-large": 3072,
            "text-embedding-ada-002": 1536,
        }

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions_map.get(self._model, 1536)

    def _get_client(self):
        """Lazy load OpenAI client"""
        if self._client is None:
            try:
                from openai import AsyncOpenAI
                self._client = AsyncOpenAI(api_key=self._api_key)
            except ImportError:
                raise ImportError("openai package not installed")
        return self._client

    async def embed(self, text: str) -> NDArray:
        """Embed single text using OpenAI"""
        embeddings = await self.embed_batch([text])
        return embeddings[0]

    async def embed_batch(self, texts: List[str]) -> List[NDArray]:
        """Embed batch of texts using OpenAI"""
        if not self._api_key:
            logger.warning("OpenAI API key not set - returning zero embeddings")
            return [np.zeros(self.dimensions) for _ in texts]

        client = self._get_client()

        try:
            response = await client.embeddings.create(
                input=texts,
                model=self._model
            )

            # Sort by index to maintain order
            sorted_data = sorted(response.data, key=lambda x: x.index)
            embeddings = [np.array(item.embedding) for item in sorted_data]

            return embeddings

        except Exception as e:
            logger.error(f"OpenAI embedding failed: {e}")
            raise


class SentenceTransformerProvider(EmbeddingProvider):
    """Sentence Transformers embedding provider"""

    def __init__(self, model: str = "all-MiniLM-L6-v2"):
        self._model_name = model
        self._model = None

        # Model dimensions
        self._dimensions_map = {
            "all-MiniLM-L6-v2": 384,
            "all-mpnet-base-v2": 768,
            "paraphrase-multilingual-MiniLM-L12-v2": 384,
            "multi-qa-mpnet-base-dot-v1": 768,
        }

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        return self._dimensions_map.get(self._model_name, 384)

    def _get_model(self):
        """Lazy load model"""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self._model_name)
                logger.info(f"Loaded Sentence Transformer model: {self._model_name}")
            except ImportError:
                raise ImportError("sentence-transformers package not installed")
        return self._model

    async def embed(self, text: str) -> NDArray:
        """Embed single text"""
        embeddings = await self.embed_batch([text])
        return embeddings[0]

    async def embed_batch(self, texts: List[str]) -> List[NDArray]:
        """Embed batch of texts"""
        model = self._get_model()

        # Run in thread pool to not block event loop
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None,
            lambda: model.encode(texts, convert_to_numpy=True)
        )

        return [emb for emb in embeddings]


class MockEmbeddingProvider(EmbeddingProvider):
    """Mock provider for testing"""

    def __init__(self, dimensions: int = 384):
        self._dimensions = dimensions

    @property
    def model_name(self) -> str:
        return "mock"

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, text: str) -> NDArray:
        """Generate deterministic mock embedding"""
        seed = hash(text) % 2**32
        np.random.seed(seed)
        return np.random.randn(self._dimensions).astype(np.float32)

    async def embed_batch(self, texts: List[str]) -> List[NDArray]:
        """Generate batch of mock embeddings"""
        return [await self.embed(text) for text in texts]


# ═══════════════════════════════════════════════════════════════════════════
#                          EMBEDDING SERVICE
# ═══════════════════════════════════════════════════════════════════════════

class EmbeddingService:
    """
    Enterprise embedding service with:
    - Multiple provider support
    - Automatic fallback
    - Caching
    - Batch processing
    - Similarity search
    """

    def __init__(self, config: Optional[EmbeddingConfig] = None):
        self.config = config or EmbeddingConfig.from_env()

        # Initialize providers
        self._providers: Dict[str, EmbeddingProvider] = {}
        self._initialize_providers()

        # Initialize cache
        self._cache: Optional[EmbeddingCache] = None
        if self.config.cache_enabled:
            self._cache = EmbeddingCache(
                cache_path=self.config.cache_path,
                max_size=self.config.cache_max_size,
                ttl_hours=self.config.cache_ttl_hours
            )

        # Statistics
        self._stats = {
            "embeddings_generated": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "provider_fallbacks": 0,
            "errors": 0
        }

        logger.info(
            f"Embedding service initialized with "
            f"primary={self.config.primary_provider}, "
            f"fallback={self.config.fallback_provider}"
        )

    def _initialize_providers(self) -> None:
        """Initialize embedding providers"""
        # OpenAI
        try:
            self._providers["openai"] = OpenAIEmbeddingProvider(
                model=self.config.openai_model
            )
        except Exception as e:
            logger.warning(f"Failed to initialize OpenAI provider: {e}")

        # Sentence Transformers
        try:
            self._providers["sentence_transformers"] = SentenceTransformerProvider(
                model=self.config.st_model
            )
        except Exception as e:
            logger.warning(f"Failed to initialize ST provider: {e}")

        # Mock (always available)
        self._providers["mock"] = MockEmbeddingProvider()

    @property
    def dimensions(self) -> int:
        """Get embedding dimensions for primary provider"""
        provider = self._providers.get(self.config.primary_provider)
        return provider.dimensions if provider else 384

    @property
    def model_name(self) -> str:
        """Get model name for primary provider"""
        provider = self._providers.get(self.config.primary_provider)
        return provider.model_name if provider else "mock"

    async def embed(
        self,
        text: str,
        use_cache: bool = True
    ) -> NDArray:
        """
        Embed single text.

        Args:
            text: Text to embed
            use_cache: Whether to use cache

        Returns:
            Embedding vector as numpy array
        """
        embeddings = await self.embed_batch([text], use_cache=use_cache)
        return embeddings[0]

    async def embed_batch(
        self,
        texts: List[str],
        use_cache: bool = True
    ) -> List[NDArray]:
        """
        Embed batch of texts.

        Args:
            texts: List of texts to embed
            use_cache: Whether to use cache

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        model = self.model_name
        results: Dict[int, NDArray] = {}
        to_embed: List[Tuple[int, str]] = []

        # Check cache
        if use_cache and self._cache:
            cached, missing = await self._cache.get_batch(texts, model)
            results.update(cached)
            self._stats["cache_hits"] += len(cached)
            self._stats["cache_misses"] += len(missing)
            to_embed = [(i, texts[i]) for i in missing]
        else:
            to_embed = list(enumerate(texts))

        if not to_embed:
            # All from cache
            return [results[i] for i in range(len(texts))]

        # Embed remaining texts
        texts_to_embed = [text for _, text in to_embed]

        # Try primary provider
        embeddings = await self._embed_with_fallback(texts_to_embed)

        # Map results back
        for (orig_idx, _), emb in zip(to_embed, embeddings):
            results[orig_idx] = emb

        # Update cache
        if use_cache and self._cache:
            await self._cache.set_batch(texts_to_embed, embeddings, model)

        self._stats["embeddings_generated"] += len(embeddings)

        return [results[i] for i in range(len(texts))]

    async def _embed_with_fallback(self, texts: List[str]) -> List[NDArray]:
        """Embed with automatic fallback"""
        providers_to_try = [
            self.config.primary_provider,
            self.config.fallback_provider,
            "mock"
        ]

        for provider_name in providers_to_try:
            provider = self._providers.get(provider_name)
            if not provider:
                continue

            try:
                # Process in batches
                all_embeddings = []
                for i in range(0, len(texts), self.config.batch_size):
                    batch = texts[i:i + self.config.batch_size]
                    batch_embeddings = await provider.embed_batch(batch)
                    all_embeddings.extend(batch_embeddings)

                return all_embeddings

            except Exception as e:
                logger.warning(f"Provider {provider_name} failed: {e}")
                self._stats["provider_fallbacks"] += 1
                self._stats["errors"] += 1
                continue

        # All providers failed - return zeros
        logger.error("All embedding providers failed")
        return [np.zeros(self.dimensions) for _ in texts]

    def cosine_similarity(
        self,
        embedding1: NDArray,
        embedding2: NDArray
    ) -> float:
        """Calculate cosine similarity between two embeddings"""
        dot_product = np.dot(embedding1, embedding2)
        norm1 = np.linalg.norm(embedding1)
        norm2 = np.linalg.norm(embedding2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))

    async def similarity(
        self,
        text1: str,
        text2: str
    ) -> float:
        """
        Calculate semantic similarity between two texts.

        Args:
            text1: First text
            text2: Second text

        Returns:
            Cosine similarity score between 0 and 1
        """
        embeddings = await self.embed_batch([text1, text2])
        sim = self.cosine_similarity(embeddings[0], embeddings[1])
        # Normalize from [-1, 1] to [0, 1] range
        return (sim + 1) / 2

    def cosine_similarity_matrix(
        self,
        embeddings1: List[NDArray],
        embeddings2: Optional[List[NDArray]] = None
    ) -> NDArray:
        """Calculate cosine similarity matrix"""
        matrix1 = np.array(embeddings1)
        matrix2 = np.array(embeddings2) if embeddings2 else matrix1

        # Normalize
        norm1 = np.linalg.norm(matrix1, axis=1, keepdims=True)
        norm2 = np.linalg.norm(matrix2, axis=1, keepdims=True)

        norm1[norm1 == 0] = 1
        norm2[norm2 == 0] = 1

        matrix1_normalized = matrix1 / norm1
        matrix2_normalized = matrix2 / norm2

        return np.dot(matrix1_normalized, matrix2_normalized.T)

    async def find_similar(
        self,
        query_text: str,
        candidate_texts: List[str],
        top_k: int = 10,
        threshold: float = 0.0
    ) -> List[Tuple[int, str, float]]:
        """
        Find most similar texts to query.

        Returns:
            List of (index, text, similarity_score) tuples
        """
        # Embed all texts
        all_texts = [query_text] + candidate_texts
        embeddings = await self.embed_batch(all_texts)

        query_embedding = embeddings[0]
        candidate_embeddings = embeddings[1:]

        # Calculate similarities
        similarities = [
            self.cosine_similarity(query_embedding, cand)
            for cand in candidate_embeddings
        ]

        # Rank and filter
        results = [
            (i, candidate_texts[i], sim)
            for i, sim in enumerate(similarities)
            if sim >= threshold
        ]

        results.sort(key=lambda x: x[2], reverse=True)
        return results[:top_k]

    async def cluster_texts(
        self,
        texts: List[str],
        n_clusters: int = 10
    ) -> List[int]:
        """
        Cluster texts by embedding similarity.

        Returns:
            List of cluster assignments
        """
        embeddings = await self.embed_batch(texts)

        try:
            from sklearn.cluster import KMeans

            matrix = np.array(embeddings)
            kmeans = KMeans(n_clusters=min(n_clusters, len(texts)), random_state=42)
            labels = kmeans.fit_predict(matrix)

            return labels.tolist()

        except ImportError:
            logger.warning("sklearn not installed - returning random clusters")
            return [i % n_clusters for i in range(len(texts))]

    async def reduce_dimensions(
        self,
        embeddings: List[NDArray],
        target_dims: int = 2
    ) -> List[NDArray]:
        """
        Reduce embedding dimensions for visualization.

        Uses UMAP if available, falls back to PCA.
        """
        matrix = np.array(embeddings)

        try:
            from umap import UMAP

            reducer = UMAP(n_components=target_dims, random_state=42)
            reduced = reducer.fit_transform(matrix)

            return [r for r in reduced]

        except ImportError:
            try:
                from sklearn.decomposition import PCA

                pca = PCA(n_components=target_dims)
                reduced = pca.fit_transform(matrix)

                return [r for r in reduced]

            except ImportError:
                logger.warning("Neither umap nor sklearn installed")
                return [emb[:target_dims] for emb in embeddings]

    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics"""
        return {
            **self._stats,
            "cache_size": self._cache.size if self._cache else 0,
            "primary_provider": self.config.primary_provider,
            "model": self.model_name,
            "dimensions": self.dimensions
        }

    async def clear_cache(self) -> int:
        """Clear embedding cache"""
        if self._cache:
            return await self._cache.clear()
        return 0


# ═══════════════════════════════════════════════════════════════════════════
#                          SINGLETON INSTANCE
# ═══════════════════════════════════════════════════════════════════════════

_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service(config: Optional[EmbeddingConfig] = None) -> EmbeddingService:
    """Get or create embedding service singleton"""
    global _embedding_service

    if _embedding_service is None:
        _embedding_service = EmbeddingService(config)

    return _embedding_service
