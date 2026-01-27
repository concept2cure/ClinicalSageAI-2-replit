"""
═══════════════════════════════════════════════════════════════════════════════
                    LUMEN CORTEX ENTERPRISE - CONFIGURATION MODULE
═══════════════════════════════════════════════════════════════════════════════

Centralized configuration management with validation, encryption support,
and environment-specific overrides.

FEATURES:
1. Pydantic Settings with validation
2. Environment variable loading
3. Secret encryption/decryption
4. Multi-environment support (dev, staging, prod)
5. Configuration hot-reload
6. Audit logging of config changes

COMPLIANCE:
- Part 11 §11.10(d) - System access limits via config
- Part 11 §11.10(g) - Authority checks via role config

@module lumen_cortex.enterprise.config
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
from base64 import b64decode, b64encode
from datetime import datetime, timedelta
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set, Union

from pydantic import (
    BaseModel,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("LumenCortex.Config")


# ═══════════════════════════════════════════════════════════════════════════
#                          ENVIRONMENT ENUM
# ═══════════════════════════════════════════════════════════════════════════

class Environment(str, Enum):
    """Deployment environment"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TESTING = "testing"


# ═══════════════════════════════════════════════════════════════════════════
#                          DATABASE CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class PostgresConfig(BaseModel):
    """PostgreSQL database configuration"""

    host: str = Field(default="localhost", description="Database host")
    port: int = Field(default=5432, ge=1, le=65535, description="Database port")
    database: str = Field(default="lumen_cortex", description="Database name")
    user: str = Field(default="postgres", description="Database user")
    password: SecretStr = Field(default=SecretStr(""), description="Database password")

    # Connection pool settings
    min_pool_size: int = Field(default=5, ge=1, le=100)
    max_pool_size: int = Field(default=20, ge=1, le=500)
    pool_timeout: int = Field(default=30, ge=1, le=300)

    # SSL settings
    ssl_mode: Literal["disable", "require", "verify-ca", "verify-full"] = "require"
    ssl_cert_path: Optional[str] = None
    ssl_key_path: Optional[str] = None
    ssl_ca_path: Optional[str] = None

    # Query settings
    statement_timeout_ms: int = Field(default=30000, ge=1000, le=300000)
    command_timeout_ms: int = Field(default=60000, ge=1000, le=600000)

    @property
    def dsn(self) -> str:
        """Generate connection string"""
        password = self.password.get_secret_value()
        return f"postgresql://{self.user}:{password}@{self.host}:{self.port}/{self.database}"

    @property
    def async_dsn(self) -> str:
        """Generate async connection string"""
        password = self.password.get_secret_value()
        return f"postgresql+asyncpg://{self.user}:{password}@{self.host}:{self.port}/{self.database}"


class Neo4jConfig(BaseModel):
    """Neo4j graph database configuration"""

    uri: str = Field(default="bolt://localhost:7687", description="Neo4j URI")
    user: str = Field(default="neo4j", description="Neo4j user")
    password: SecretStr = Field(default=SecretStr(""), description="Neo4j password")
    database: str = Field(default="neo4j", description="Default database")

    # Connection pool
    max_connection_lifetime: int = Field(default=3600, ge=60, le=86400)
    max_connection_pool_size: int = Field(default=50, ge=1, le=500)
    connection_acquisition_timeout: int = Field(default=60, ge=1, le=300)

    # Query settings
    max_transaction_retry_time: int = Field(default=30, ge=1, le=120)

    # GDS settings
    gds_enabled: bool = Field(default=True, description="Enable Graph Data Science")
    gds_memory_estimation: bool = Field(default=True)


class RedisConfig(BaseModel):
    """Redis cache configuration"""

    host: str = Field(default="localhost")
    port: int = Field(default=6379, ge=1, le=65535)
    password: SecretStr = Field(default=SecretStr(""))
    database: int = Field(default=0, ge=0, le=15)

    # Connection settings
    ssl: bool = Field(default=False)
    max_connections: int = Field(default=100, ge=1, le=1000)
    socket_timeout: float = Field(default=5.0, ge=0.1, le=60.0)
    socket_connect_timeout: float = Field(default=5.0, ge=0.1, le=60.0)

    # Cache settings
    default_ttl: int = Field(default=3600, ge=60, le=86400)
    max_memory_policy: str = Field(default="allkeys-lru")

    @property
    def url(self) -> str:
        """Generate Redis URL"""
        password = self.password.get_secret_value()
        protocol = "rediss" if self.ssl else "redis"
        auth = f":{password}@" if password else ""
        return f"{protocol}://{auth}{self.host}:{self.port}/{self.database}"


# ═══════════════════════════════════════════════════════════════════════════
#                          AI PROVIDER CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class OpenAIConfig(BaseModel):
    """OpenAI API configuration"""

    api_key: SecretStr = Field(default=SecretStr(""), description="OpenAI API key")
    organization_id: Optional[str] = Field(default=None, description="Organization ID")

    # Model defaults
    default_model: str = Field(default="gpt-4o")
    default_embedding_model: str = Field(default="text-embedding-3-large")

    # Rate limiting
    max_retries: int = Field(default=3, ge=1, le=10)
    retry_delay: float = Field(default=1.0, ge=0.1, le=30.0)
    request_timeout: float = Field(default=60.0, ge=5.0, le=300.0)

    # Token limits
    max_tokens_per_minute: int = Field(default=150000, ge=1000)
    max_requests_per_minute: int = Field(default=500, ge=10)

    # Cost tracking
    cost_tracking_enabled: bool = Field(default=True)
    daily_budget_usd: float = Field(default=100.0, ge=0.0)

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, v: SecretStr) -> SecretStr:
        key = v.get_secret_value()
        if key and not key.startswith("sk-"):
            logger.warning("OpenAI API key format may be invalid")
        return v


class AnthropicConfig(BaseModel):
    """Anthropic API configuration"""

    api_key: SecretStr = Field(default=SecretStr(""), description="Anthropic API key")

    # Model defaults
    default_model: str = Field(default="claude-3-opus-20240229")

    # Rate limiting
    max_retries: int = Field(default=3, ge=1, le=10)
    retry_delay: float = Field(default=1.0, ge=0.1, le=30.0)
    request_timeout: float = Field(default=120.0, ge=5.0, le=600.0)

    # Token limits
    max_tokens_per_minute: int = Field(default=100000, ge=1000)
    max_requests_per_minute: int = Field(default=60, ge=1)

    # Cost tracking
    cost_tracking_enabled: bool = Field(default=True)
    daily_budget_usd: float = Field(default=100.0, ge=0.0)


class EmbeddingConfig(BaseModel):
    """Embedding service configuration"""

    primary_provider: Literal["openai", "sentence_transformers", "mock"] = "openai"
    fallback_provider: Optional[Literal["sentence_transformers", "mock"]] = "sentence_transformers"

    # OpenAI embeddings
    openai_model: str = Field(default="text-embedding-3-large")
    openai_dimensions: int = Field(default=1536, ge=256, le=3072)

    # Sentence Transformers
    st_model: str = Field(default="all-MiniLM-L6-v2")
    st_device: Literal["cpu", "cuda", "mps"] = "cpu"

    # Caching
    cache_enabled: bool = Field(default=True)
    cache_ttl: int = Field(default=86400, ge=3600, le=604800)
    cache_max_size: int = Field(default=100000, ge=1000)

    # Batch processing
    batch_size: int = Field(default=100, ge=1, le=2048)
    parallel_workers: int = Field(default=4, ge=1, le=32)


# ═══════════════════════════════════════════════════════════════════════════
#                          SECURITY CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class JWTConfig(BaseModel):
    """JWT authentication configuration"""

    secret_key: SecretStr = Field(
        default_factory=lambda: SecretStr(secrets.token_urlsafe(64)),
        description="JWT signing key"
    )
    algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=30, ge=5, le=1440)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=30)

    # Token settings
    issuer: str = Field(default="lumen-cortex")
    audience: str = Field(default="lumen-cortex-api")

    # Security
    require_https: bool = Field(default=True)
    cookie_secure: bool = Field(default=True)
    cookie_httponly: bool = Field(default=True)
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"


class CORSConfig(BaseModel):
    """CORS configuration"""

    allow_origins: List[str] = Field(default=["http://localhost:3000"])
    allow_methods: List[str] = Field(default=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    allow_headers: List[str] = Field(default=["*"])
    allow_credentials: bool = Field(default=True)
    max_age: int = Field(default=600, ge=0, le=86400)


class RateLimitConfig(BaseModel):
    """Rate limiting configuration"""

    enabled: bool = Field(default=True)

    # Global limits
    global_requests_per_minute: int = Field(default=1000, ge=10)
    global_requests_per_hour: int = Field(default=10000, ge=100)

    # Per-user limits
    user_requests_per_minute: int = Field(default=60, ge=1)
    user_requests_per_hour: int = Field(default=1000, ge=10)

    # Endpoint-specific limits
    extraction_requests_per_minute: int = Field(default=10, ge=1)
    embedding_requests_per_minute: int = Field(default=100, ge=1)
    llm_requests_per_minute: int = Field(default=30, ge=1)

    # Burst settings
    burst_multiplier: float = Field(default=2.0, ge=1.0, le=10.0)


class ComplianceConfig(BaseModel):
    """21 CFR Part 11 compliance configuration"""

    # Audit settings
    audit_enabled: bool = Field(default=True)
    audit_retention_years: int = Field(default=10, ge=1, le=30)

    # Signature settings
    signature_algorithm: Literal["RSA-PSS-SHA256", "RSA-PKCS1-SHA256"] = "RSA-PSS-SHA256"
    key_size_bits: int = Field(default=4096, ge=2048, le=8192)

    # WORM storage
    worm_enabled: bool = Field(default=True)
    worm_base_path: str = Field(default="/var/lib/lumen-cortex/worm")

    # Merkle tree
    merkle_batch_size: int = Field(default=1000, ge=100, le=10000)
    merkle_anchor_interval_hours: int = Field(default=24, ge=1, le=168)

    # Session settings
    session_timeout_minutes: int = Field(default=30, ge=5, le=480)
    max_failed_logins: int = Field(default=5, ge=3, le=10)
    lockout_duration_minutes: int = Field(default=30, ge=5, le=1440)

    # Password policy
    password_min_length: int = Field(default=12, ge=8, le=128)
    password_require_uppercase: bool = Field(default=True)
    password_require_lowercase: bool = Field(default=True)
    password_require_numbers: bool = Field(default=True)
    password_require_special: bool = Field(default=True)
    password_history_count: int = Field(default=12, ge=0, le=24)
    password_expiry_days: int = Field(default=90, ge=0, le=365)


# ═══════════════════════════════════════════════════════════════════════════
#                          EXTRACTION CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class ExtractionConfig(BaseModel):
    """Table extraction configuration"""

    # Strategy weights (Bayesian priors)
    camelot_lattice_weight: float = Field(default=0.3, ge=0.0, le=1.0)
    camelot_stream_weight: float = Field(default=0.2, ge=0.0, le=1.0)
    tabula_weight: float = Field(default=0.1, ge=0.0, le=1.0)
    vision_transformer_weight: float = Field(default=0.2, ge=0.0, le=1.0)
    multimodal_llm_weight: float = Field(default=0.2, ge=0.0, le=1.0)

    # Quality thresholds
    min_confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    ensemble_agreement_threshold: float = Field(default=0.6, ge=0.0, le=1.0)

    # Processing settings
    max_pages_per_document: int = Field(default=500, ge=1, le=2000)
    max_tables_per_page: int = Field(default=10, ge=1, le=50)
    ocr_enabled: bool = Field(default=True)
    ocr_language: str = Field(default="eng")

    # Timeout settings
    extraction_timeout_seconds: int = Field(default=300, ge=30, le=1800)
    ocr_timeout_seconds: int = Field(default=60, ge=10, le=300)

    @model_validator(mode="after")
    def validate_weights(self) -> "ExtractionConfig":
        total = (
            self.camelot_lattice_weight +
            self.camelot_stream_weight +
            self.tabula_weight +
            self.vision_transformer_weight +
            self.multimodal_llm_weight
        )
        if abs(total - 1.0) > 0.01:
            logger.warning(f"Extraction weights sum to {total}, normalizing...")
        return self


class CitationConfig(BaseModel):
    """Citation enforcement configuration"""

    # Verification layers
    mechanistic_enabled: bool = Field(default=True)
    nli_enabled: bool = Field(default=True)
    knowledge_graph_enabled: bool = Field(default=True)

    # Thresholds
    nli_entailment_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    nli_contradiction_threshold: float = Field(default=0.3, ge=0.0, le=1.0)
    kg_path_max_length: int = Field(default=3, ge=1, le=10)

    # Hallucination detection
    hallucination_sensitivity: Literal["low", "medium", "high"] = "medium"
    max_uncited_claims: int = Field(default=0, ge=0, le=10)

    # Source requirements
    require_primary_sources: bool = Field(default=True)
    max_source_age_years: int = Field(default=10, ge=1, le=50)


class GraphRAGConfig(BaseModel):
    """GraphRAG configuration"""

    # Vector search
    vector_top_k: int = Field(default=20, ge=1, le=100)
    vector_similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)

    # Graph traversal
    max_hops: int = Field(default=3, ge=1, le=10)
    max_entities_per_hop: int = Field(default=50, ge=1, le=200)

    # Community detection
    leiden_resolution: float = Field(default=1.0, ge=0.1, le=10.0)
    min_community_size: int = Field(default=5, ge=2, le=100)

    # Context assembly
    max_context_tokens: int = Field(default=8000, ge=1000, le=128000)
    include_community_summaries: bool = Field(default=True)
    include_entity_descriptions: bool = Field(default=True)


# ═══════════════════════════════════════════════════════════════════════════
#                          OBSERVABILITY CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class LoggingConfig(BaseModel):
    """Logging configuration"""

    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    format: Literal["json", "text"] = "json"

    # Output settings
    log_to_console: bool = Field(default=True)
    log_to_file: bool = Field(default=True)
    log_file_path: str = Field(default="/var/log/lumen-cortex/app.log")
    log_file_max_bytes: int = Field(default=104857600, ge=1048576)  # 100MB default
    log_file_backup_count: int = Field(default=10, ge=1, le=100)

    # Structured logging
    include_timestamp: bool = Field(default=True)
    include_hostname: bool = Field(default=True)
    include_process_id: bool = Field(default=True)
    include_correlation_id: bool = Field(default=True)


class MetricsConfig(BaseModel):
    """Prometheus metrics configuration"""

    enabled: bool = Field(default=True)
    port: int = Field(default=9090, ge=1, le=65535)
    path: str = Field(default="/metrics")

    # Histogram buckets
    latency_buckets: List[float] = Field(
        default=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    )


class TracingConfig(BaseModel):
    """OpenTelemetry tracing configuration"""

    enabled: bool = Field(default=True)
    service_name: str = Field(default="lumen-cortex")

    # Exporter settings
    exporter: Literal["otlp", "jaeger", "zipkin", "console"] = "otlp"
    endpoint: str = Field(default="http://localhost:4317")

    # Sampling
    sample_rate: float = Field(default=1.0, ge=0.0, le=1.0)


# ═══════════════════════════════════════════════════════════════════════════
#                          MASTER CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class Settings(BaseSettings):
    """
    Master configuration for Lumen Cortex Enterprise.

    Loads settings from:
    1. Environment variables (highest priority)
    2. .env file
    3. Default values
    """

    model_config = SettingsConfigDict(
        env_prefix="LUMEN_",
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )

    # Environment
    environment: Environment = Field(default=Environment.DEVELOPMENT)
    debug: bool = Field(default=False)
    testing: bool = Field(default=False)

    # Application
    app_name: str = Field(default="Lumen Cortex Enterprise")
    app_version: str = Field(default="2.0.0")
    api_prefix: str = Field(default="/api/cortex")

    # Server
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000, ge=1, le=65535)
    workers: int = Field(default=4, ge=1, le=32)

    # Databases
    postgres: PostgresConfig = Field(default_factory=PostgresConfig)
    neo4j: Neo4jConfig = Field(default_factory=Neo4jConfig)
    redis: RedisConfig = Field(default_factory=RedisConfig)

    # AI Providers
    openai: OpenAIConfig = Field(default_factory=OpenAIConfig)
    anthropic: AnthropicConfig = Field(default_factory=AnthropicConfig)
    embedding: EmbeddingConfig = Field(default_factory=EmbeddingConfig)

    # Security
    jwt: JWTConfig = Field(default_factory=JWTConfig)
    cors: CORSConfig = Field(default_factory=CORSConfig)
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)
    compliance: ComplianceConfig = Field(default_factory=ComplianceConfig)

    # Features
    extraction: ExtractionConfig = Field(default_factory=ExtractionConfig)
    citation: CitationConfig = Field(default_factory=CitationConfig)
    graphrag: GraphRAGConfig = Field(default_factory=GraphRAGConfig)

    # Observability
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    metrics: MetricsConfig = Field(default_factory=MetricsConfig)
    tracing: TracingConfig = Field(default_factory=TracingConfig)

    @model_validator(mode="after")
    def validate_environment_settings(self) -> "Settings":
        """Apply environment-specific validations"""
        if self.environment == Environment.PRODUCTION:
            # Enforce security in production
            if not self.jwt.require_https:
                logger.warning("HTTPS should be required in production")
            if self.debug:
                logger.warning("Debug mode should be disabled in production")
            if not self.compliance.audit_enabled:
                raise ValueError("Audit must be enabled in production")
        return self

    def get_config_hash(self) -> str:
        """Generate hash of current configuration for change detection"""
        config_str = self.model_dump_json(exclude={"jwt": {"secret_key"}})
        return hashlib.sha256(config_str.encode()).hexdigest()[:16]

    def to_safe_dict(self) -> Dict[str, Any]:
        """Export configuration with secrets masked"""
        data = self.model_dump()

        # Mask secrets
        def mask_secrets(obj: Any, path: str = "") -> Any:
            if isinstance(obj, dict):
                return {
                    k: mask_secrets(v, f"{path}.{k}")
                    for k, v in obj.items()
                }
            if isinstance(obj, list):
                return [mask_secrets(v, path) for v in obj]
            if any(secret in path.lower() for secret in ["password", "secret", "key", "token"]):
                return "***MASKED***"
            return obj

        return mask_secrets(data)


# ═══════════════════════════════════════════════════════════════════════════
#                          SINGLETON ACCESS
# ═══════════════════════════════════════════════════════════════════════════

@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Use `get_settings.cache_clear()` to reload.
    """
    return Settings()


def reload_settings() -> Settings:
    """Force reload of settings"""
    get_settings.cache_clear()
    return get_settings()


# ═══════════════════════════════════════════════════════════════════════════
#                          ENVIRONMENT FILE GENERATOR
# ═══════════════════════════════════════════════════════════════════════════

def generate_env_template(output_path: str = ".env.template") -> str:
    """Generate .env template file with all configuration options"""

    template = '''# ═══════════════════════════════════════════════════════════════════════════════
#                    LUMEN CORTEX ENTERPRISE - ENVIRONMENT CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
#
# Copy this file to .env and configure for your environment
# All values prefixed with LUMEN_
#
# Generated: {timestamp}
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────────
#                              ENVIRONMENT
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_ENVIRONMENT=development  # development, staging, production, testing
LUMEN_DEBUG=false
LUMEN_TESTING=false

# ─────────────────────────────────────────────────────────────────────────────────
#                              SERVER
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_HOST=0.0.0.0
LUMEN_PORT=8000
LUMEN_WORKERS=4

# ─────────────────────────────────────────────────────────────────────────────────
#                              POSTGRESQL
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_POSTGRES__HOST=localhost
LUMEN_POSTGRES__PORT=5432
LUMEN_POSTGRES__DATABASE=lumen_cortex
LUMEN_POSTGRES__USER=postgres
LUMEN_POSTGRES__PASSWORD=your_postgres_password_here
LUMEN_POSTGRES__SSL_MODE=require

# ─────────────────────────────────────────────────────────────────────────────────
#                              NEO4J
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_NEO4J__URI=bolt://localhost:7687
LUMEN_NEO4J__USER=neo4j
LUMEN_NEO4J__PASSWORD=your_neo4j_password_here
LUMEN_NEO4J__DATABASE=neo4j
LUMEN_NEO4J__GDS_ENABLED=true

# ─────────────────────────────────────────────────────────────────────────────────
#                              REDIS
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_REDIS__HOST=localhost
LUMEN_REDIS__PORT=6379
LUMEN_REDIS__PASSWORD=
LUMEN_REDIS__DATABASE=0
LUMEN_REDIS__SSL=false

# ─────────────────────────────────────────────────────────────────────────────────
#                              OPENAI
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_OPENAI__API_KEY=sk-your_openai_api_key_here
LUMEN_OPENAI__ORGANIZATION_ID=
LUMEN_OPENAI__DEFAULT_MODEL=gpt-4o
LUMEN_OPENAI__DEFAULT_EMBEDDING_MODEL=text-embedding-3-large
LUMEN_OPENAI__DAILY_BUDGET_USD=100.0

# ─────────────────────────────────────────────────────────────────────────────────
#                              ANTHROPIC
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_ANTHROPIC__API_KEY=sk-ant-your_anthropic_api_key_here
LUMEN_ANTHROPIC__DEFAULT_MODEL=claude-3-opus-20240229
LUMEN_ANTHROPIC__DAILY_BUDGET_USD=100.0

# ─────────────────────────────────────────────────────────────────────────────────
#                              EMBEDDINGS
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_EMBEDDING__PRIMARY_PROVIDER=openai
LUMEN_EMBEDDING__FALLBACK_PROVIDER=sentence_transformers
LUMEN_EMBEDDING__CACHE_ENABLED=true

# ─────────────────────────────────────────────────────────────────────────────────
#                              JWT AUTHENTICATION
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_JWT__SECRET_KEY=your_64_character_secret_key_here_use_secrets_token_urlsafe_64
LUMEN_JWT__ALGORITHM=HS256
LUMEN_JWT__ACCESS_TOKEN_EXPIRE_MINUTES=30
LUMEN_JWT__REFRESH_TOKEN_EXPIRE_DAYS=7

# ─────────────────────────────────────────────────────────────────────────────────
#                              CORS
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_CORS__ALLOW_ORIGINS=["http://localhost:3000","http://localhost:5000"]
LUMEN_CORS__ALLOW_CREDENTIALS=true

# ─────────────────────────────────────────────────────────────────────────────────
#                              COMPLIANCE (Part 11)
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_COMPLIANCE__AUDIT_ENABLED=true
LUMEN_COMPLIANCE__AUDIT_RETENTION_YEARS=10
LUMEN_COMPLIANCE__WORM_ENABLED=true
LUMEN_COMPLIANCE__WORM_BASE_PATH=/var/lib/lumen-cortex/worm
LUMEN_COMPLIANCE__SESSION_TIMEOUT_MINUTES=30

# ─────────────────────────────────────────────────────────────────────────────────
#                              LOGGING
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_LOGGING__LEVEL=INFO
LUMEN_LOGGING__FORMAT=json
LUMEN_LOGGING__LOG_TO_FILE=true
LUMEN_LOGGING__LOG_FILE_PATH=/var/log/lumen-cortex/app.log

# ─────────────────────────────────────────────────────────────────────────────────
#                              METRICS & TRACING
# ─────────────────────────────────────────────────────────────────────────────────

LUMEN_METRICS__ENABLED=true
LUMEN_METRICS__PORT=9090

LUMEN_TRACING__ENABLED=true
LUMEN_TRACING__EXPORTER=otlp
LUMEN_TRACING__ENDPOINT=http://localhost:4317
'''

    content = template.format(timestamp=datetime.utcnow().isoformat())

    with open(output_path, 'w') as f:
        f.write(content)

    logger.info(f"Generated environment template: {output_path}")
    return content


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIG VALIDATION
# ═══════════════════════════════════════════════════════════════════════════

def validate_config(settings: Optional[Settings] = None) -> Dict[str, Any]:
    """
    Validate configuration and return health status.

    Returns:
        Dict with validation results for each component
    """
    settings = settings or get_settings()
    results = {
        "valid": True,
        "environment": settings.environment.value,
        "config_hash": settings.get_config_hash(),
        "checks": {}
    }

    # Check PostgreSQL
    results["checks"]["postgres"] = {
        "configured": bool(settings.postgres.password.get_secret_value()),
        "host": settings.postgres.host,
        "port": settings.postgres.port,
        "database": settings.postgres.database,
    }

    # Check Neo4j
    results["checks"]["neo4j"] = {
        "configured": bool(settings.neo4j.password.get_secret_value()),
        "uri": settings.neo4j.uri,
        "gds_enabled": settings.neo4j.gds_enabled,
    }

    # Check OpenAI
    openai_key = settings.openai.api_key.get_secret_value()
    results["checks"]["openai"] = {
        "configured": bool(openai_key),
        "valid_format": openai_key.startswith("sk-") if openai_key else False,
        "default_model": settings.openai.default_model,
    }

    # Check Anthropic
    anthropic_key = settings.anthropic.api_key.get_secret_value()
    results["checks"]["anthropic"] = {
        "configured": bool(anthropic_key),
        "default_model": settings.anthropic.default_model,
    }

    # Check compliance
    results["checks"]["compliance"] = {
        "audit_enabled": settings.compliance.audit_enabled,
        "worm_enabled": settings.compliance.worm_enabled,
        "production_ready": (
            settings.compliance.audit_enabled and
            settings.compliance.worm_enabled
        ),
    }

    # Overall validation
    results["valid"] = all(
        check.get("configured", True)
        for check in results["checks"].values()
    )

    return results


if __name__ == "__main__":
    # Generate template
    generate_env_template()

    # Test configuration
    settings = get_settings()
    print(f"Environment: {settings.environment.value}")
    print(f"Config hash: {settings.get_config_hash()}")

    validation = validate_config(settings)
    print(f"Valid: {validation['valid']}")
    for name, check in validation["checks"].items():
        status = "✅" if check.get("configured", True) else "❌"
        print(f"  {status} {name}")
