"""
═══════════════════════════════════════════════════════════════════════════════
                    FASTAPI BRIDGE FOR ENTERPRISE SERVICES
═══════════════════════════════════════════════════════════════════════════════

RESTful API exposing enterprise Python services to TypeScript backend.

ENDPOINTS:
- POST /api/v2/extract/tables - Multi-modal table extraction
- POST /api/v2/citations/validate - Citation enforcement
- POST /api/v2/graph/query - GraphRAG queries
- POST /api/v2/compliance/sign - Digital signatures
- GET /api/v2/audit/trail - Audit trail retrieval

SECURITY:
- JWT authentication
- Role-based access control
- Rate limiting
- Request signing

@module lumen_cortex.enterprise.api_bridge
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, Any, List, Optional, Union

from fastapi import (
    FastAPI, HTTPException, Depends, Request, Response,
    BackgroundTasks, Header, Query, Path, Body, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from contextlib import asynccontextmanager

# Import enterprise modules
from .core import EventBus, CircuitBreaker, event_bus
from .compliance import (
    ComplianceContext, DigitalSignature, MerkleNode,
    WORMStorage, MerkleAuditTrail, Permission
)
from .extraction import (
    EnsembleTableExtractor, ExtractedTable, TableSchemaType
)
from .citation import (
    CitationEnforcer, ValidatedAnswer, SourceDocument
)
from .graphrag import (
    HierarchicalGraphRAG, GraphEntity, GraphCommunity
)
from .exceptions import (
    LumenCortexError, ExtractionError, CitationError,
    ComplianceError, GraphError
)
from .config import get_settings
from .metrics import MetricRegistry

logger = logging.getLogger("LumenCortex.API")
settings = get_settings()

# ═══════════════════════════════════════════════════════════════════════════
#                          REQUEST/RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════

class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str
    services: Dict[str, str]


class ExtractTableRequest(BaseModel):
    """Request for table extraction"""
    pdf_path: str = Field(..., description="Path to PDF document")
    pages: Optional[List[int]] = Field(None, description="Specific pages to extract")
    strategies: Optional[List[str]] = Field(
        default=["camelot", "vision", "llm"],
        description="Extraction strategies to use"
    )
    detect_schema: bool = Field(default=True, description="Auto-detect table schema")
    sign_output: bool = Field(default=False, description="Digitally sign results")

    @field_validator('pdf_path')
    @classmethod
    def validate_path(cls, v: str) -> str:
        if not v.endswith('.pdf'):
            raise ValueError("Must be a PDF file")
        return v


class ExtractTableResponse(BaseModel):
    """Response from table extraction"""
    request_id: str
    tables: List[Dict[str, Any]]
    total_tables: int
    processing_time_ms: float
    merkle_root: Optional[str] = None
    signature: Optional[Dict[str, Any]] = None
    warnings: List[str] = []


class ValidateCitationsRequest(BaseModel):
    """Request for citation validation"""
    text: str = Field(..., description="Text with citations to validate")
    sources: List[Dict[str, Any]] = Field(..., description="Source documents")
    enforcement_level: str = Field(
        default="strict",
        description="strict, moderate, or lenient"
    )
    check_mechanisms: Optional[List[str]] = Field(
        default=["nli", "kg", "numbers"],
        description="Validation mechanisms to use"
    )


class ValidateCitationsResponse(BaseModel):
    """Response from citation validation"""
    request_id: str
    is_valid: bool
    overall_faithfulness: float
    citations_found: int
    citations_valid: int
    citations_invalid: int
    missing_citations: List[Dict[str, Any]]
    verification_details: List[Dict[str, Any]]
    merkle_root: str
    processing_time_ms: float


class GraphQueryRequest(BaseModel):
    """Request for GraphRAG query"""
    query: str = Field(..., description="Natural language query")
    top_k: int = Field(default=10, description="Number of results")
    include_communities: bool = Field(default=True, description="Include community context")
    max_hops: int = Field(default=2, description="Max graph traversal depth")
    filters: Optional[Dict[str, Any]] = Field(None, description="Entity/relationship filters")


class GraphQueryResponse(BaseModel):
    """Response from GraphRAG query"""
    request_id: str
    answer: str
    entities: List[Dict[str, Any]]
    relationships: List[Dict[str, Any]]
    communities: List[Dict[str, Any]]
    subgraph_size: int
    confidence: float
    sources: List[str]
    processing_time_ms: float


class SignDocumentRequest(BaseModel):
    """Request for document signing"""
    content: str = Field(..., description="Content to sign")
    purpose: str = Field(..., description="Signing purpose/reason")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class SignDocumentResponse(BaseModel):
    """Response from document signing"""
    request_id: str
    content_hash: str
    signature: str
    public_key_pem: str
    algorithm: str
    timestamp: str
    signer_id: str


class AuditTrailResponse(BaseModel):
    """Response containing audit trail"""
    entries: List[Dict[str, Any]]
    total_entries: int
    merkle_root: str
    time_range: Dict[str, str]


class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
    error_code: str
    details: Optional[Dict[str, Any]] = None
    request_id: str
    timestamp: str


# ═══════════════════════════════════════════════════════════════════════════
#                          AUTHENTICATION & SECURITY
# ═══════════════════════════════════════════════════════════════════════════

security = HTTPBearer(auto_error=False)

def _b64url_decode(raw: str) -> bytes:
    """Decode base64-url data with optional padding."""
    padding = '=' * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _get_bridge_jwt_secret() -> str:
    """Resolve bridge JWT secret with explicit env override."""
    return os.getenv("LUMEN_API_BRIDGE_JWT_SECRET", "") or settings.jwt.secret_key.get_secret_value()


def _decode_bearer_token(token: str) -> Dict[str, Any]:
    """Decode and validate HS256 JWT for enterprise bridge access."""
    secret_value = _get_bridge_jwt_secret()
    if not secret_value:
        raise ValueError("bridge JWT secret is not configured")

    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError("invalid token format")

    header_b64, payload_b64, signature_b64 = parts
    header = json.loads(_b64url_decode(header_b64).decode('utf-8'))
    payload = json.loads(_b64url_decode(payload_b64).decode('utf-8'))
    signature = _b64url_decode(signature_b64)

    alg = header.get("alg")
    if alg != "HS256":
        raise ValueError("only HS256 is supported by bridge")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    secret = secret_value.encode("utf-8")
    expected = hmac.new(secret, signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("invalid token signature")

    now = int(time.time())
    exp = int(payload.get("exp", 0))
    if exp <= now:
        raise ValueError("token expired")

    nbf = payload.get("nbf")
    if nbf is not None and int(nbf) > now:
        raise ValueError("token is not active yet")

    expected_issuer = os.getenv("LUMEN_API_BRIDGE_JWT_ISSUER", settings.jwt.issuer)
    expected_audience = os.getenv("LUMEN_API_BRIDGE_JWT_AUDIENCE", settings.jwt.audience)
    if payload.get("iss") and payload.get("iss") != expected_issuer:
        raise ValueError("invalid token issuer")

    aud = payload.get("aud")
    if aud:
        audience_values = aud if isinstance(aud, list) else [aud]
        if expected_audience not in audience_values:
            raise ValueError("invalid token audience")

    if not payload.get("sub"):
        raise ValueError("missing subject")

    return payload


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate HS256 JWT for enterprise bridge access."""
    try:
        return _decode_bearer_token(token)
    except (ValueError, json.JSONDecodeError, binascii.Error) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """Extract user from auth token"""
    static_service_token = (
        os.getenv("LUMEN_CORTEX_ENTERPRISE_BRIDGE_TOKEN", "")
        or os.getenv("LUMEN_API_BRIDGE_BEARER_TOKEN", "")
    )
    static_fallback_enabled = (
        os.getenv("LUMEN_API_BRIDGE_ALLOW_STATIC_TOKEN", "false").lower() == "true"
    )
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization bearer token"
        )

    token = credentials.credentials
    if (
        static_fallback_enabled
        and static_service_token
        and hmac.compare_digest(token, static_service_token)
    ):
        static_role = os.getenv("LUMEN_API_BRIDGE_STATIC_ROLE", "analyst")
        return {
            "sub": "ana-control-plane",
            "role": static_role,
            "iss": "bridge-static-token",
        }

    payload = decode_token(token)
    role = payload.get("role")
    if not role or not isinstance(role, str):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token missing required role claim"
        )
    return payload


async def get_compliance_context(
    user: Dict[str, Any] = Depends(get_current_user)
) -> ComplianceContext:
    """Build compliance context from authenticated user"""
    return ComplianceContext(
        user_id=user.get('sub', 'unknown'),
        role=user.get('role', 'analyst'),
        session_id=hashlib.sha256(str(time.time()).encode()).hexdigest()[:16],
        attributes=user.get('attributes', {}),
    )


# Rate limiting
class RateLimiter:
    """Simple in-memory rate limiter"""
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, List[float]] = {}

    def check(self, key: str) -> bool:
        """Check if request is allowed"""
        now = time.time()
        minute_ago = now - 60

        if key not in self.requests:
            self.requests[key] = []

        # Remove old requests
        self.requests[key] = [t for t in self.requests[key] if t > minute_ago]

        if len(self.requests[key]) >= self.requests_per_minute:
            return False

        self.requests[key].append(now)
        return True

rate_limiter = RateLimiter(requests_per_minute=100)


async def rate_limit_check(request: Request):
    """Check rate limit for request"""
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.check(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          APPLICATION LIFECYCLE
# ═══════════════════════════════════════════════════════════════════════════

# Service instances (initialized on startup)
extractor: Optional[EnsembleTableExtractor] = None
citation_enforcer: Optional[CitationEnforcer] = None
graph_rag: Optional[HierarchicalGraphRAG] = None
worm_storage: Optional[WORMStorage] = None
audit_trail: Optional[MerkleAuditTrail] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global extractor, citation_enforcer, graph_rag, worm_storage, audit_trail

    logger.info("Starting Lumen Cortex Enterprise API...")

    # Initialize services
    try:
        extractor = EnsembleTableExtractor()
        citation_enforcer = CitationEnforcer()

        # Initialize GraphRAG if Neo4j is available
        neo4j_uri = os.environ.get('NEO4J_URI', 'bolt://localhost:7687')
        neo4j_user = os.environ.get('NEO4J_USER', 'neo4j')
        neo4j_password = os.environ.get('NEO4J_PASSWORD', '')

        if neo4j_password:
            graph_rag = HierarchicalGraphRAG(neo4j_uri, neo4j_user, neo4j_password)
            logger.info("GraphRAG initialized with Neo4j")
        else:
            logger.warning("Neo4j credentials not found - GraphRAG running in mock mode")
            graph_rag = HierarchicalGraphRAG(neo4j_uri, neo4j_user, "")

        # Initialize storage
        worm_storage = WORMStorage()
        audit_trail = MerkleAuditTrail(
            entity_type="api_requests",
            base_path=str(worm_storage.base_path / "api_audit")
        )

        logger.info("All enterprise services initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise

    # Emit startup event
    await event_bus.publish("api.started", {
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0"
    })

    yield

    # Shutdown
    logger.info("Shutting down Lumen Cortex Enterprise API...")

    # Close connections
    if graph_rag and hasattr(graph_rag, 'driver'):
        await graph_rag.close()

    await event_bus.publish("api.stopped", {
        "timestamp": datetime.utcnow().isoformat()
    })


# ═══════════════════════════════════════════════════════════════════════════
#                          FASTAPI APPLICATION
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Lumen Cortex Enterprise API",
    description="Advanced Regulatory Intelligence Platform with Cryptographic Compliance",
    version="2.0.0",
    docs_url="/api/v2/docs",
    redoc_url="/api/v2/redoc",
    openapi_url="/api/v2/openapi.json",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.allow_origins,
    allow_credentials=settings.cors.allow_credentials,
    allow_methods=settings.cors.allow_methods,
    allow_headers=settings.cors.allow_headers,
    max_age=settings.cors.max_age,
)


# Request ID middleware
metrics_registry = MetricRegistry()
api_requests_total = metrics_registry.counter(
    "enterprise_api_requests_total",
    "Total enterprise API requests",
    ["method", "path", "status"]
)
api_request_latency_seconds = metrics_registry.histogram(
    "enterprise_api_request_latency_seconds",
    "Enterprise API request latency in seconds",
    ["method", "path", "status"]
)


def _is_public_route(path: str) -> bool:
    return path.startswith("/api/v2/health") or path.startswith("/api/v2/version")


def _verify_request_signature(request: Request, body: bytes) -> None:
    signing_secret = os.getenv("LUMEN_API_BRIDGE_HMAC_SECRET", "")
    if not signing_secret:
        return

    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return

    if _is_public_route(request.url.path):
        return

    timestamp = request.headers.get("x-lumen-timestamp")
    signature = request.headers.get("x-lumen-signature")
    if not timestamp or not signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing request signature headers"
        )

    try:
        ts = int(timestamp)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature timestamp"
        )

    if abs(int(time.time()) - ts) > 300:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature timestamp outside allowed window"
        )

    message = f"{request.method}|{request.url.path}|{timestamp}|".encode("utf-8") + body
    expected = hmac.new(signing_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid request signature"
        )


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add unique request ID to each request"""
    request_id = hashlib.sha256(
        f"{time.time()}{request.url}".encode()
    ).hexdigest()[:16]
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# Audit logging middleware
@app.middleware("http")
async def audit_log(request: Request, call_next):
    """Log all API requests for audit trail"""
    start_time = time.time()
    response: Response
    try:
        body = await request.body()
        _verify_request_signature(request, body)
        response = await call_next(request)
    except HTTPException as exc:
        response = JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.detail,
                "error_code": "REQUEST_REJECTED",
                "request_id": getattr(request.state, 'request_id', 'unknown'),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

    processing_time = (time.time() - start_time) * 1000
    latency_seconds = processing_time / 1000.0
    labels = {
        "method": request.method,
        "path": str(request.url.path),
        "status": str(response.status_code)
    }
    api_requests_total.inc(labels=labels)
    api_request_latency_seconds.observe(latency_seconds, labels=labels)

    # Log to audit trail
    if audit_trail:
        await audit_trail.append({
            "request_id": getattr(request.state, 'request_id', 'unknown'),
            "method": request.method,
            "path": str(request.url.path),
            "status_code": response.status_code,
            "processing_time_ms": processing_time,
            "client_ip": request.client.host if request.client else "unknown",
            "timestamp": datetime.utcnow().isoformat()
        })

    return response


# ═══════════════════════════════════════════════════════════════════════════
#                          HEALTH & STATUS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/v2/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version="2.0.0",
        timestamp=datetime.utcnow().isoformat(),
        services={
            "extractor": "ready" if extractor else "unavailable",
            "citation_enforcer": "ready" if citation_enforcer else "unavailable",
            "graph_rag": "ready" if graph_rag else "unavailable",
            "worm_storage": "ready" if worm_storage else "unavailable",
            "request_signing": "enabled" if os.getenv("LUMEN_API_BRIDGE_HMAC_SECRET") else "disabled",
            "static_token_fallback": (
                "enabled"
                if os.getenv("LUMEN_API_BRIDGE_ALLOW_STATIC_TOKEN", "false").lower() == "true"
                else "disabled"
            ),
            "jwt_auth": "enabled" if _get_bridge_jwt_secret() else "disabled",
        }
    )


@app.get("/api/v2/version")
async def get_version():
    """Get API version info"""
    return {
        "version": "2.0.0",
        "api_version": "v2",
        "build": "enterprise",
        "compliance": ["21CFR11", "FIPS186-5", "ICHE3"],
        "capabilities": [
            "multi_modal_extraction",
            "mechanistic_citations",
            "hierarchical_graphrag",
            "cryptographic_compliance"
        ]
    }


@app.get("/api/v2/metrics")
async def get_metrics(
    context: ComplianceContext = Depends(get_compliance_context),
):
    """Expose enterprise bridge metrics as JSON."""
    if not context.has_permission(Permission.AUDIT):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User lacks audit permission"
        )
    values = metrics_registry.collect()
    return {
        "metric_count": len(values),
        "metrics": [
            {
                "name": metric.name,
                "type": metric.type.value,
                "labels": metric.labels,
                "timestamp": metric.timestamp,
                "value": getattr(metric, "value", None),
                "count": getattr(metric, "count", None),
                "sum": getattr(metric, "sum", None),
            }
            for metric in values
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
#                          TABLE EXTRACTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.post(
    "/api/v2/extract/tables",
    response_model=ExtractTableResponse,
    dependencies=[Depends(rate_limit_check)]
)
async def extract_tables(
    request: ExtractTableRequest,
    background_tasks: BackgroundTasks,
    context: ComplianceContext = Depends(get_compliance_context),
    req: Request = None,
):
    """
    Extract tables from PDF using multi-modal ensemble.

    Uses Bayesian model averaging across:
    - Camelot (rules-based)
    - Vision Transformer (Donut)
    - Multimodal LLM (GPT-4V)
    """
    request_id = getattr(req.state, 'request_id', 'unknown') if req else 'unknown'
    start_time = time.time()

    try:
        if not extractor:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Extraction service not available"
            )

        # Check permissions
        if not context.has_permission(Permission.EXTRACT):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User lacks extraction permission"
            )

        # Extract tables
        tables = await extractor.extract_ensemble(
            pdf_path=request.pdf_path,
            pages=request.pages,
            strategies=request.strategies or ["camelot", "vision", "llm"],
            context=context
        )

        # Build Merkle tree of results
        table_hashes = [t.content_hash for t in tables]
        merkle_tree = MerkleNode.build_tree(table_hashes) if table_hashes else None

        # Optional signing
        signature = None
        if request.sign_output and context.has_permission(Permission.SIGN):
            sig_data = json.dumps({
                "tables": len(tables),
                "merkle_root": merkle_tree.hash if merkle_tree else None,
                "timestamp": datetime.utcnow().isoformat()
            })
            private_key, _ = DigitalSignature.generate_keypair()
            digital_sig = DigitalSignature.sign(sig_data, private_key)
            signature = {
                "signature": digital_sig.signature.hex(),
                "public_key_pem": digital_sig.public_key_pem,
                "algorithm": digital_sig.algorithm
            }

        processing_time = (time.time() - start_time) * 1000

        # Emit event
        await event_bus.publish("extraction.completed", {
            "request_id": request_id,
            "tables_extracted": len(tables),
            "processing_time_ms": processing_time
        })

        return ExtractTableResponse(
            request_id=request_id,
            tables=[t.to_dict() for t in tables],
            total_tables=len(tables),
            processing_time_ms=processing_time,
            merkle_root=merkle_tree.hash if merkle_tree else None,
            signature=signature,
            warnings=[]
        )

    except ExtractionError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction failed: {str(e)}"
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          CITATION VALIDATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.post(
    "/api/v2/citations/validate",
    response_model=ValidateCitationsResponse,
    dependencies=[Depends(rate_limit_check)]
)
async def validate_citations(
    request: ValidateCitationsRequest,
    context: ComplianceContext = Depends(get_compliance_context),
    req: Request = None,
):
    """
    Validate citations using mechanistic enforcement.

    Validation layers:
    - NLI entailment checking
    - Knowledge graph verification
    - Number/statistic matching
    - Self-consistency checks
    """
    request_id = getattr(req.state, 'request_id', 'unknown') if req else 'unknown'
    start_time = time.time()

    try:
        if not citation_enforcer:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Citation enforcement service not available"
            )

        # Check permissions
        if not context.has_permission(Permission.VALIDATE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User lacks validation permission"
            )

        # Convert sources to SourceDocument objects
        sources = [
            SourceDocument(
                id=s.get('id', str(i)),
                title=s.get('title', f'Source {i}'),
                content=s.get('content', ''),
                document_type=s.get('type', 'document')
            )
            for i, s in enumerate(request.sources)
        ]

        # Run citation enforcement
        result = await citation_enforcer.enforce_citations(
            text=request.text,
            sources=sources,
            context=context,
            enforcement_level=request.enforcement_level,
            mechanisms=request.check_mechanisms or ["nli", "kg", "numbers"]
        )

        processing_time = (time.time() - start_time) * 1000

        # Emit event
        await event_bus.publish("citation.validated", {
            "request_id": request_id,
            "is_valid": result.is_valid,
            "faithfulness": result.overall_faithfulness
        })

        return ValidateCitationsResponse(
            request_id=request_id,
            is_valid=result.is_valid,
            overall_faithfulness=result.overall_faithfulness,
            citations_found=result.total_citations,
            citations_valid=result.valid_citations,
            citations_invalid=result.invalid_citations,
            missing_citations=[m.to_dict() for m in result.missing_citations],
            verification_details=[v.to_dict() for v in result.verification_details],
            merkle_root=result.merkle_root,
            processing_time_ms=processing_time
        )

    except CitationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Citation validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Citation validation failed: {str(e)}"
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          GRAPHRAG QUERY ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.post(
    "/api/v2/graph/query",
    response_model=GraphQueryResponse,
    dependencies=[Depends(rate_limit_check)]
)
async def query_graph(
    request: GraphQueryRequest,
    context: ComplianceContext = Depends(get_compliance_context),
    req: Request = None,
):
    """
    Query knowledge graph using hierarchical GraphRAG.

    Features:
    - Vector similarity search
    - Community-aware retrieval
    - Multi-hop graph traversal
    - LLM answer generation
    """
    request_id = getattr(req.state, 'request_id', 'unknown') if req else 'unknown'
    start_time = time.time()

    try:
        if not graph_rag:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="GraphRAG service not available"
            )

        # Check permissions
        if not context.has_permission(Permission.READ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User lacks read permission"
            )

        # Execute query
        result = await graph_rag.query_with_context(
            query=request.query,
            top_k=request.top_k,
            include_communities=request.include_communities,
            max_hops=request.max_hops,
            filters=request.filters
        )

        processing_time = (time.time() - start_time) * 1000

        # Emit event
        await event_bus.publish("graphrag.queried", {
            "request_id": request_id,
            "query_length": len(request.query),
            "results_count": len(result.entities)
        })

        return GraphQueryResponse(
            request_id=request_id,
            answer=result.answer,
            entities=[e.to_dict() for e in result.entities],
            relationships=[r.to_dict() for r in result.relationships],
            communities=[c.to_dict() for c in result.communities],
            subgraph_size=result.subgraph_size,
            confidence=result.confidence,
            sources=result.source_ids,
            processing_time_ms=processing_time
        )

    except GraphError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"GraphRAG query failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"GraphRAG query failed: {str(e)}"
        )


@app.get("/api/v2/graph/communities")
async def get_communities(
    level: int = Query(default=None, description="Community hierarchy level"),
    context: ComplianceContext = Depends(get_compliance_context),
):
    """Get community structure from knowledge graph"""
    if not graph_rag:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GraphRAG service not available"
        )

    communities = await graph_rag.get_communities(level=level)

    return {
        "communities": [c.to_dict() for c in communities],
        "total": len(communities),
        "levels": list(set(c.level for c in communities))
    }


@app.post("/api/v2/graph/entities")
async def add_entity(
    entity: Dict[str, Any] = Body(...),
    context: ComplianceContext = Depends(get_compliance_context),
):
    """Add entity to knowledge graph"""
    if not graph_rag:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GraphRAG service not available"
        )

    if not context.has_permission(Permission.WRITE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User lacks write permission"
        )

    created = await graph_rag.add_entity(
        name=entity['name'],
        entity_type=entity['type'],
        properties=entity.get('properties', {}),
        context=context
    )

    return {"entity_id": created.id, "status": "created"}


# ═══════════════════════════════════════════════════════════════════════════
#                          COMPLIANCE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.post(
    "/api/v2/compliance/sign",
    response_model=SignDocumentResponse,
    dependencies=[Depends(rate_limit_check)]
)
async def sign_document(
    request: SignDocumentRequest,
    context: ComplianceContext = Depends(get_compliance_context),
    req: Request = None,
):
    """
    Digitally sign content with FIPS 186-5 compliant signature.

    Uses RSA-PSS with SHA-256 and 3072-bit keys.
    """
    request_id = getattr(req.state, 'request_id', 'unknown') if req else 'unknown'

    try:
        # Check permissions
        if not context.has_permission(Permission.SIGN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User lacks signing permission"
            )

        # Generate signature
        private_key, _ = DigitalSignature.generate_keypair()

        sign_data = {
            "content_hash": hashlib.sha256(request.content.encode()).hexdigest(),
            "purpose": request.purpose,
            "metadata": request.metadata or {},
            "signer": context.user_id,
            "timestamp": datetime.utcnow().isoformat()
        }

        signature = DigitalSignature.sign(json.dumps(sign_data), private_key)

        # Store in WORM storage
        if worm_storage:
            worm_storage.write(
                f"signature_{request_id}.json",
                json.dumps({
                    "request_id": request_id,
                    "sign_data": sign_data,
                    "signature": signature.signature.hex(),
                    "public_key": signature.public_key_pem
                })
            )

        # Emit event
        await event_bus.publish("document.signed", {
            "request_id": request_id,
            "signer": context.user_id,
            "purpose": request.purpose
        })

        return SignDocumentResponse(
            request_id=request_id,
            content_hash=sign_data["content_hash"],
            signature=signature.signature.hex(),
            public_key_pem=signature.public_key_pem,
            algorithm=signature.algorithm,
            timestamp=sign_data["timestamp"],
            signer_id=context.user_id
        )

    except Exception as e:
        logger.error(f"Signing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signing failed: {str(e)}"
        )


@app.post("/api/v2/compliance/verify")
async def verify_signature(
    signature: str = Body(...),
    public_key_pem: str = Body(...),
    content: str = Body(...),
):
    """Verify a digital signature"""
    try:
        is_valid = DigitalSignature(
            signature=bytes.fromhex(signature),
            public_key_pem=public_key_pem,
            timestamp=datetime.utcnow()
        ).verify(content)

        return {
            "valid": is_valid,
            "verified_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        return {
            "valid": False,
            "error": str(e)
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          AUDIT TRAIL ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.get(
    "/api/v2/audit/trail",
    response_model=AuditTrailResponse,
    dependencies=[Depends(rate_limit_check)]
)
async def get_audit_trail(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    limit: int = Query(default=100, le=1000, description="Max entries to return"),
    context: ComplianceContext = Depends(get_compliance_context),
):
    """
    Retrieve audit trail entries.

    Returns Merkle tree root for integrity verification.
    """
    try:
        # Check permissions
        if not context.has_permission(Permission.AUDIT):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User lacks audit permission"
            )

        if not audit_trail:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Audit trail not available"
            )

        # Parse dates
        start = datetime.fromisoformat(start_date) if start_date else None
        end = datetime.fromisoformat(end_date) if end_date else None

        # Get entries
        entries = await audit_trail.get_entries(
            start_date=start,
            end_date=end,
            action_filter=action,
            limit=limit
        )

        # Build Merkle tree for returned entries
        entry_hashes = [
            hashlib.sha256(json.dumps(e).encode()).hexdigest()
            for e in entries
        ]
        merkle_tree = MerkleNode.build_tree(entry_hashes) if entry_hashes else None

        return AuditTrailResponse(
            entries=entries,
            total_entries=len(entries),
            merkle_root=merkle_tree.hash if merkle_tree else "",
            time_range={
                "start": start_date or "unbounded",
                "end": end_date or "unbounded"
            }
        )

    except Exception as e:
        logger.error(f"Audit trail retrieval failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audit trail retrieval failed: {str(e)}"
        )


@app.get("/api/v2/audit/verify/{entry_id}")
async def verify_audit_entry(
    entry_id: str = Path(..., description="Audit entry ID"),
    context: ComplianceContext = Depends(get_compliance_context),
):
    """Verify integrity of specific audit entry"""
    if not context.has_permission(Permission.AUDIT):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User lacks audit permission"
        )

    if not audit_trail:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audit trail not available"
        )

    result = await audit_trail.verify_entry(entry_id)

    return {
        "entry_id": entry_id,
        "integrity_valid": result.valid,
        "stored_hash": result.stored_hash,
        "computed_hash": result.computed_hash,
        "verified_at": datetime.utcnow().isoformat()
    }


# ═══════════════════════════════════════════════════════════════════════════
#                          ERROR HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

@app.exception_handler(LumenCortexError)
async def lumen_error_handler(request: Request, exc: LumenCortexError):
    """Handle Lumen Cortex specific errors"""
    request_id = getattr(request.state, 'request_id', 'unknown')

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": str(exc),
            "error_code": exc.__class__.__name__,
            "request_id": request_id,
            "timestamp": datetime.utcnow().isoformat()
        }
    )


@app.exception_handler(Exception)
async def general_error_handler(request: Request, exc: Exception):
    """Handle unexpected errors"""
    request_id = getattr(request.state, 'request_id', 'unknown')

    logger.error(f"Unexpected error in request {request_id}: {exc}")

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "error_code": "INTERNAL_ERROR",
            "request_id": request_id,
            "timestamp": datetime.utcnow().isoformat()
        }
    )


# ═══════════════════════════════════════════════════════════════════════════
#                          MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

def create_app() -> FastAPI:
    """Factory function for creating the FastAPI app"""
    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "lumen_cortex.enterprise.api_bridge:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        log_level="info"
    )
