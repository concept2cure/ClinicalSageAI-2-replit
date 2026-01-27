"""
═══════════════════════════════════════════════════════════════════════════════
                    LUMEN CORTEX AI - ENTERPRISE EDITION v2.0
═══════════════════════════════════════════════════════════════════════════════

Advanced Regulatory Intelligence Platform with Cryptographic Compliance

CAPABILITIES:
1. Multi-Modal Ensemble Table Extraction (Camelot + Vision + LLM)
2. Mechanistic Citation Enforcement (FACTUM-inspired + NLI)
3. Hierarchical Vector-Graph RAG (Neo4j + Leiden clustering)
4. Cryptographic Part 11++ Compliance (Merkle Trees + Digital Signatures)
5. FastAPI REST Bridge for TypeScript Integration
6. Multi-Provider Embedding Service (OpenAI + Sentence Transformers)
7. Multi-Provider LLM Router with Failover (GPT-4o + Claude 3)
8. Async Neo4j Connector with Connection Pooling

ARCHITECTURE PATTERNS:
- Event-Driven with Async Event Bus
- Circuit Breakers for LLM Resilience
- Strategy Pattern for Pluggable Extractors
- CQRS for Audit Trail Management
- Factory Pattern for Provider Selection
- Repository Pattern for Data Access

COMPLIANCE:
- 21 CFR Part 11 Ready
- FIPS 186-5 Digital Signatures
- ICH E3/E6(R2) Compatible
- GxP Validation Ready

@version 2.0.0
@author TrialSage AI Team
@license Proprietary
"""

import logging
import warnings

__version__ = "2.0.0"
_logger = logging.getLogger("LumenCortex")

# Track loaded modules
_loaded_modules = set()

def _safe_import(module_name: str, class_names: list):
    """Safely import classes from a module, logging warnings on failure."""
    results = {}
    try:
        module = __import__(
            f"lumen_cortex.enterprise.{module_name}",
            fromlist=class_names
        )
        for name in class_names:
            if hasattr(module, name):
                results[name] = getattr(module, name)
                _loaded_modules.add(f"{module_name}.{name}")
            else:
                _logger.debug(f"Class {name} not found in {module_name}")
    except ImportError as e:
        _logger.debug(f"Could not import {module_name}: {e}")
    except Exception as e:
        _logger.warning(f"Error importing {module_name}: {e}")
    return results

# Core Infrastructure
_core = _safe_import("core", [
    "EventBus", "CircuitBreaker", "CircuitState", "Event",
    "audit_event", "event_bus"
])
globals().update(_core)

# Compliance Module
_compliance = _safe_import("compliance", [
    "MerkleNode", "DigitalSignature", "ComplianceContext",
    "WORMStorage", "CRYPTO_AVAILABLE"
])
globals().update(_compliance)

# Table Extraction
_extraction = _safe_import("extraction", [
    "EnsembleTableExtractor", "ExtractedTable", "TableSchemaType",
    "ExtractionArtifact", "TableExtractionStrategy"
])
globals().update(_extraction)

# Citation Enforcement
_citation = _safe_import("citation", [
    "CitationEnforcer", "ValidatedAnswer", "MechanisticCheck",
    "CitationMechanism", "NLIVerifier", "Citation"
])
globals().update(_citation)

# Hierarchical GraphRAG
_graphrag = _safe_import("graphrag", [
    "HierarchicalGraphRAG", "GraphCommunity", "GraphEntity",
    "GraphRelationship", "EntityType", "RelationshipType"
])
globals().update(_graphrag)

# Exception Hierarchy
_exceptions = _safe_import("exceptions", [
    "LumenCortexError", "ExtractionError", "CitationError",
    "ComplianceError"
])
globals().update(_exceptions)

# API Bridge (optional - requires fastapi)
_api = _safe_import("api_bridge", [
    "CortexAPIBridge"
])
globals().update(_api)

# Neo4j Connector (optional - requires neo4j driver)
_neo4j = _safe_import("neo4j_connector", [
    "Neo4jAsyncConnector", "Neo4jConfig", "QueryResult"
])
globals().update(_neo4j)

# Embedding Service
_embeddings = _safe_import("embeddings", [
    "EmbeddingService", "EmbeddingConfig", "EmbeddingProvider"
])
globals().update(_embeddings)

# LLM Router
_llm = _safe_import("llm_router", [
    "LLMRouter", "LLMConfig", "LLMRequest", "LLMResponse",
    "ChatMessage", "ChatRole"
])
globals().update(_llm)

# Validation Runner
_validation = _safe_import("validation_runner", [
    "ValidationRunner", "ValidationReport", "TestSuite",
    "TestCase", "TestResult", "TestStatus", "TestCategory",
    "run_validation"
])
globals().update(_validation)

# Authentication & Authorization
_auth = _safe_import("auth", [
    "AuthConfig", "Permission", "Role", "User", "Session",
    "TokenPair", "APIKey", "AuthEvent", "AuthenticationService",
    "PasswordHasher", "JWTHandler", "SessionStore", "RateLimiter",
    "require_auth", "require_permission", "require_role"
])
globals().update(_auth)

# Audit Logging Service
_audit = _safe_import("audit_service", [
    "AuditConfig", "AuditAction", "AuditSeverity", "AuditOutcome",
    "AuditEntry", "AuditQuery", "AuditStats", "AuditService",
    "PIIDetector", "AuditStorage", "AuditMerkleTree", "audit_context"
])
globals().update(_audit)

# Caching Layer
_caching = _safe_import("caching", [
    "CacheConfig", "SerializationFormat", "CacheStrategy",
    "CacheService", "LRUCache", "RedisCache", "CacheEntry",
    "CacheCircuitBreaker", "cached", "cache_invalidate"
])
globals().update(_caching)

# Connection Pool Manager
_pool = _safe_import("pool_manager", [
    "PoolConfig", "PostgresConfig", "Neo4jConfig", "RedisPoolConfig",
    "PoolManager", "PostgreSQLPool", "Neo4jPool", "RedisPool",
    "get_pool_manager", "init_pools", "close_pools"
])
globals().update(_pool)

# Prometheus Metrics
_metrics = _safe_import("metrics", [
    "MetricsConfig", "MetricRegistry", "Counter", "Gauge",
    "Histogram", "Summary", "PrometheusExporter", "MetricsServer",
    "LumenCortexMetrics", "get_registry", "get_metrics",
    "start_metrics_server", "stop_metrics_server",
    "track_request", "track_operation", "track_errors"
])
globals().update(_metrics)


def get_loaded_components() -> list:
    """Return list of successfully loaded components."""
    return sorted(_loaded_modules)


def print_status():
    """Print module loading status."""
    print(f"Lumen Cortex Enterprise v{__version__}")
    print(f"Loaded {len(_loaded_modules)} components:")
    for comp in sorted(_loaded_modules):
        print(f"  ✅ {comp}")


# Build __all__ dynamically from loaded modules
__all__ = [
    "__version__",
    "get_loaded_components",
    "print_status",
]

# Add successfully loaded classes to __all__
for _module_dict in [_core, _compliance, _extraction, _citation,
                     _graphrag, _exceptions, _api, _neo4j,
                     _embeddings, _llm, _validation, _auth,
                     _audit, _caching, _pool, _metrics]:
    __all__.extend(_module_dict.keys())
