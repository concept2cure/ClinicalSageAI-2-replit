from __future__ import annotations

import os
from dataclasses import dataclass


def _env(key: str, default: str | None = None) -> str | None:
    v = os.getenv(key)
    return v if v is not None and v != "" else default


def _env_int(key: str, default: int) -> int:
    v = _env(key)
    if v is None:
        return default
    try:
        return int(v)
    except ValueError:
        return default


def _env_float(key: str, default: float) -> float:
    v = _env(key)
    if v is None:
        return default
    try:
        return float(v)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # Required
    database_url: str

    # Embeddings
    embedding_provider: str = "hash"  # "hash" (dev), "none", or custom
    embedding_dim: int = 1536

    # Interrogation thresholds
    drift_red_threshold: float = 0.25
    drift_amber_threshold: float = 0.10
    ir_sim_distance_threshold: float = 0.20  # cosine distance (lower == closer)
    precedent_top_k: int = 5

    # Service
    service_name: str = "shadow-interrogation"
    default_agent_identity: str = "SHADOW_AGENT"

    @staticmethod
    def load() -> "Settings":
        db = _env("DATABASE_URL")
        if not db:
            raise RuntimeError("DATABASE_URL is required")
        return Settings(
            database_url=db,
            embedding_provider=_env("EMBEDDING_PROVIDER", "hash") or "hash",
            embedding_dim=_env_int("EMBEDDING_DIM", 1536),
            drift_red_threshold=_env_float("DRIFT_RED_THRESHOLD", 0.25),
            drift_amber_threshold=_env_float("DRIFT_AMBER_THRESHOLD", 0.10),
            ir_sim_distance_threshold=_env_float("IR_SIM_DISTANCE_THRESHOLD", 0.20),
            precedent_top_k=_env_int("PRECEDENT_TOP_K", 5),
            service_name=_env("SERVICE_NAME", "shadow-interrogation") or "shadow-interrogation",
            default_agent_identity=_env("DEFAULT_AGENT_IDENTITY", "SHADOW_AGENT") or "SHADOW_AGENT",
        )
