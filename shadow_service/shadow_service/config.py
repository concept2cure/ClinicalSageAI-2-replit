"""Configuration settings for Shadow Interrogation Service."""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Service
    service_name: str = "shadow-interrogation"
    
    # Database
    database_url: str = ""
    database_pool_size: int = 10
    database_max_overflow: int = 20
    
    # Embeddings
    embedding_dim: int = 1536
    embedding_mode: str = "deterministic"  # deterministic | none | openai
    embedding_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    
    # Shadow Agent - Interrogation thresholds
    top_k_precedents: int = 5
    drift_threshold: float = 0.20  # Red threshold for DATA_DRIFT
    ir_similarity_threshold: float = 0.78  # Threshold for IR_PREDICTED
    drift_red_threshold: float = 0.20  # Alias for drift_threshold
    
    # Logging
    log_level: str = "INFO"
    
    # API
    api_title: str = "Shadow Interrogation Service"
    api_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    
    # CORS
    cors_origins: list[str] = ["*"]
    
    @property
    def database_url_async(self) -> str:
        """Convert database URL to asyncpg format."""
        url = self.database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
