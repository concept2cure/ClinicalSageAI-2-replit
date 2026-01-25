"""
═══════════════════════════════════════════════════════════════════════════════
                    EXCEPTION HIERARCHY
═══════════════════════════════════════════════════════════════════════════════

Structured exception hierarchy for Lumen Cortex Enterprise.

DESIGN:
- LumenCortexError as base for all module exceptions
- Module-specific subclasses (Extraction, Citation, Compliance, Graph)
- Error codes for programmatic handling
- Contextual data for debugging
- Audit trail integration

@module lumen_cortex.enterprise.exceptions
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from typing import Any, Dict, Optional, List


class ErrorSeverity(Enum):
    """Severity levels for errors"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class ErrorCode(Enum):
    """Standardized error codes"""
    # General (1000-1999)
    UNKNOWN = 1000
    CONFIGURATION = 1001
    INITIALIZATION = 1002
    TIMEOUT = 1003
    DEPENDENCY = 1004
    PERMISSION = 1005

    # Extraction (2000-2999)
    EXTRACTION_FAILED = 2000
    NO_TABLES_FOUND = 2001
    INVALID_PDF = 2002
    STRATEGY_FAILED = 2003
    ENSEMBLE_DEGRADED = 2004
    OCR_FAILED = 2005
    SCHEMA_MISMATCH = 2006

    # Citation (3000-3999)
    CITATION_FAILED = 3000
    NO_CITATIONS_FOUND = 3001
    NLI_FAILED = 3002
    SOURCE_NOT_FOUND = 3003
    VERIFICATION_FAILED = 3004
    HALLUCINATION_DETECTED = 3005
    CLAIM_UNSUPPORTED = 3006
    NUMBER_MISMATCH = 3007

    # Compliance (4000-4999)
    COMPLIANCE_FAILED = 4000
    SIGNATURE_INVALID = 4001
    MERKLE_VERIFICATION_FAILED = 4002
    PERMISSION_DENIED = 4003
    WORM_VIOLATION = 4004
    ENCRYPTION_FAILED = 4005
    AUDIT_FAILURE = 4006
    ROLE_REQUIRED = 4007

    # Graph (5000-5999)
    GRAPH_FAILED = 5000
    ENTITY_NOT_FOUND = 5001
    RELATIONSHIP_INVALID = 5002
    COMMUNITY_DETECTION_FAILED = 5003
    EMBEDDING_FAILED = 5004
    QUERY_TIMEOUT = 5005
    CYCLE_DETECTED = 5006

    # Circuit Breaker (6000-6999)
    CIRCUIT_OPEN = 6000
    RATE_LIMIT_EXCEEDED = 6001
    RETRY_EXHAUSTED = 6002


@dataclass
class ErrorContext:
    """Additional context for debugging"""
    operation: str = ""
    component: str = ""
    input_summary: Optional[str] = None
    stack_trace: Optional[str] = None
    correlation_id: Optional[str] = None
    user_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "operation": self.operation,
            "component": self.component,
            "input_summary": self.input_summary,
            "correlation_id": self.correlation_id,
            "user_id": self.user_id,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }


class LumenCortexError(Exception):
    """
    Base exception for all Lumen Cortex errors.

    Attributes:
        message: Human-readable error message
        code: Standardized error code
        severity: Error severity level
        context: Additional debugging context
        cause: Original exception if wrapping
        remediation: Suggested fix or action
    """

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.UNKNOWN,
        severity: ErrorSeverity = ErrorSeverity.ERROR,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None,
        remediation: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.severity = severity
        self.context = context or ErrorContext()
        self.cause = cause
        self.remediation = remediation
        self.timestamp = datetime.utcnow()

    def __str__(self) -> str:
        parts = [f"[{self.code.name}] {self.message}"]
        if self.remediation:
            parts.append(f"Remediation: {self.remediation}")
        if self.cause:
            parts.append(f"Caused by: {self.cause}")
        return " | ".join(parts)

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"code={self.code.name}, "
            f"message={self.message!r}, "
            f"severity={self.severity.value})"
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "error_type": self.__class__.__name__,
            "message": self.message,
            "code": self.code.value,
            "code_name": self.code.name,
            "severity": self.severity.value,
            "timestamp": self.timestamp.isoformat(),
            "context": self.context.to_dict(),
            "remediation": self.remediation,
            "cause": str(self.cause) if self.cause else None,
        }

    @classmethod
    def from_exception(
        cls,
        exc: Exception,
        code: ErrorCode = ErrorCode.UNKNOWN,
        context: Optional[ErrorContext] = None
    ) -> "LumenCortexError":
        """Wrap an existing exception"""
        import traceback

        ctx = context or ErrorContext()
        ctx.stack_trace = traceback.format_exc()

        return cls(
            message=str(exc),
            code=code,
            context=ctx,
            cause=exc,
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          EXTRACTION EXCEPTIONS
# ═══════════════════════════════════════════════════════════════════════════

class ExtractionError(LumenCortexError):
    """Base exception for table extraction errors"""

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.EXTRACTION_FAILED,
        strategy: Optional[str] = None,
        page_number: Optional[int] = None,
        **kwargs
    ):
        super().__init__(message, code, **kwargs)
        self.strategy = strategy
        self.page_number = page_number
        self.context.metadata["strategy"] = strategy
        self.context.metadata["page_number"] = page_number


class NoTablesFoundError(ExtractionError):
    """No tables could be extracted from document"""

    def __init__(self, message: str = "No tables found in document", **kwargs):
        super().__init__(
            message,
            code=ErrorCode.NO_TABLES_FOUND,
            remediation="Try different extraction strategies or verify the document contains tables",
            **kwargs
        )


class InvalidPDFError(ExtractionError):
    """PDF is invalid or corrupted"""

    def __init__(self, message: str = "Invalid or corrupted PDF", **kwargs):
        super().__init__(
            message,
            code=ErrorCode.INVALID_PDF,
            severity=ErrorSeverity.ERROR,
            remediation="Verify PDF integrity and re-upload",
            **kwargs
        )


class StrategyFailedError(ExtractionError):
    """Individual extraction strategy failed"""

    def __init__(
        self,
        message: str,
        strategy: str,
        fallback_available: bool = True,
        **kwargs
    ):
        remediation = (
            "Other strategies will be attempted"
            if fallback_available
            else "No fallback strategies available"
        )
        super().__init__(
            message,
            code=ErrorCode.STRATEGY_FAILED,
            strategy=strategy,
            remediation=remediation,
            severity=ErrorSeverity.WARNING if fallback_available else ErrorSeverity.ERROR,
            **kwargs
        )


class SchemaMismatchError(ExtractionError):
    """Extracted table doesn't match expected schema"""

    def __init__(
        self,
        message: str,
        expected_columns: Optional[List[str]] = None,
        actual_columns: Optional[List[str]] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.SCHEMA_MISMATCH,
            remediation="Review table structure or update schema definition",
            **kwargs
        )
        self.expected_columns = expected_columns
        self.actual_columns = actual_columns
        self.context.metadata["expected_columns"] = expected_columns
        self.context.metadata["actual_columns"] = actual_columns


# ═══════════════════════════════════════════════════════════════════════════
#                          CITATION EXCEPTIONS
# ═══════════════════════════════════════════════════════════════════════════

class CitationError(LumenCortexError):
    """Base exception for citation verification errors"""

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.CITATION_FAILED,
        citation_id: Optional[str] = None,
        claim: Optional[str] = None,
        **kwargs
    ):
        super().__init__(message, code, **kwargs)
        self.citation_id = citation_id
        self.claim = claim
        self.context.metadata["citation_id"] = citation_id
        self.context.metadata["claim"] = claim[:100] if claim else None


class NoCitationsFoundError(CitationError):
    """No citations found in text"""

    def __init__(self, message: str = "No citations found in text", **kwargs):
        super().__init__(
            message,
            code=ErrorCode.NO_CITATIONS_FOUND,
            severity=ErrorSeverity.WARNING,
            remediation="Add citations to support claims",
            **kwargs
        )


class SourceNotFoundError(CitationError):
    """Referenced source document not found"""

    def __init__(
        self,
        message: str,
        source_id: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.SOURCE_NOT_FOUND,
            remediation="Verify source document exists and is accessible",
            **kwargs
        )
        self.source_id = source_id
        self.context.metadata["source_id"] = source_id


class HallucinationDetectedError(CitationError):
    """Potential hallucination detected in claim"""

    def __init__(
        self,
        message: str,
        claim: str,
        confidence: float = 0.0,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.HALLUCINATION_DETECTED,
            claim=claim,
            severity=ErrorSeverity.CRITICAL,
            remediation="Review and correct the claim against source material",
            **kwargs
        )
        self.confidence = confidence
        self.context.metadata["confidence"] = confidence


class ClaimUnsupportedError(CitationError):
    """Claim is not supported by cited source"""

    def __init__(
        self,
        message: str,
        claim: str,
        nli_score: Optional[float] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.CLAIM_UNSUPPORTED,
            claim=claim,
            remediation="Revise claim to match source content or cite different source",
            **kwargs
        )
        self.nli_score = nli_score
        self.context.metadata["nli_score"] = nli_score


class NumberMismatchError(CitationError):
    """Numerical values don't match source"""

    def __init__(
        self,
        message: str,
        claimed_value: Any,
        source_value: Any,
        tolerance: float = 0.0,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.NUMBER_MISMATCH,
            severity=ErrorSeverity.ERROR,
            remediation="Correct the numerical value to match source",
            **kwargs
        )
        self.claimed_value = claimed_value
        self.source_value = source_value
        self.tolerance = tolerance
        self.context.metadata.update({
            "claimed_value": claimed_value,
            "source_value": source_value,
            "tolerance": tolerance,
        })


# ═══════════════════════════════════════════════════════════════════════════
#                          COMPLIANCE EXCEPTIONS
# ═══════════════════════════════════════════════════════════════════════════

class ComplianceError(LumenCortexError):
    """Base exception for compliance and security errors"""

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.COMPLIANCE_FAILED,
        regulation: Optional[str] = None,
        **kwargs
    ):
        super().__init__(message, code, **kwargs)
        self.regulation = regulation
        self.context.metadata["regulation"] = regulation


class SignatureInvalidError(ComplianceError):
    """Digital signature verification failed"""

    def __init__(
        self,
        message: str = "Digital signature verification failed",
        signer_id: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.SIGNATURE_INVALID,
            severity=ErrorSeverity.CRITICAL,
            regulation="21 CFR Part 11",
            remediation="Document integrity compromised - investigate and re-sign",
            **kwargs
        )
        self.signer_id = signer_id
        self.context.metadata["signer_id"] = signer_id


class MerkleVerificationError(ComplianceError):
    """Merkle tree verification failed"""

    def __init__(
        self,
        message: str = "Merkle tree verification failed",
        expected_root: Optional[str] = None,
        actual_root: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.MERKLE_VERIFICATION_FAILED,
            severity=ErrorSeverity.CRITICAL,
            remediation="Data tampering detected - investigate audit trail",
            **kwargs
        )
        self.expected_root = expected_root
        self.actual_root = actual_root
        self.context.metadata.update({
            "expected_root": expected_root,
            "actual_root": actual_root,
        })


class PermissionDeniedError(ComplianceError):
    """User lacks required permission"""

    def __init__(
        self,
        message: str,
        required_permission: Optional[str] = None,
        user_role: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.PERMISSION_DENIED,
            remediation="Request access from administrator or use appropriate credentials",
            **kwargs
        )
        self.required_permission = required_permission
        self.user_role = user_role
        self.context.metadata.update({
            "required_permission": required_permission,
            "user_role": user_role,
        })


class WORMViolationError(ComplianceError):
    """Attempted modification of WORM-protected data"""

    def __init__(
        self,
        message: str = "Cannot modify WORM-protected record",
        record_id: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.WORM_VIOLATION,
            severity=ErrorSeverity.CRITICAL,
            regulation="21 CFR Part 11 / SEC Rule 17a-4",
            remediation="WORM records cannot be modified - create new version instead",
            **kwargs
        )
        self.record_id = record_id
        self.context.metadata["record_id"] = record_id


class RoleRequiredError(ComplianceError):
    """Operation requires specific role"""

    def __init__(
        self,
        message: str,
        required_role: str,
        current_role: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.ROLE_REQUIRED,
            remediation=f"Operation requires {required_role} role",
            **kwargs
        )
        self.required_role = required_role
        self.current_role = current_role
        self.context.metadata.update({
            "required_role": required_role,
            "current_role": current_role,
        })


# ═══════════════════════════════════════════════════════════════════════════
#                          GRAPH EXCEPTIONS
# ═══════════════════════════════════════════════════════════════════════════

class GraphError(LumenCortexError):
    """Base exception for knowledge graph errors"""

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.GRAPH_FAILED,
        query: Optional[str] = None,
        **kwargs
    ):
        super().__init__(message, code, **kwargs)
        self.query = query
        self.context.metadata["query"] = query[:200] if query else None


class EntityNotFoundError(GraphError):
    """Entity not found in graph"""

    def __init__(
        self,
        message: str,
        entity_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.ENTITY_NOT_FOUND,
            severity=ErrorSeverity.WARNING,
            **kwargs
        )
        self.entity_id = entity_id
        self.entity_type = entity_type
        self.context.metadata.update({
            "entity_id": entity_id,
            "entity_type": entity_type,
        })


class CommunityDetectionError(GraphError):
    """Community detection algorithm failed"""

    def __init__(
        self,
        message: str,
        algorithm: Optional[str] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.COMMUNITY_DETECTION_FAILED,
            remediation="Check graph connectivity and algorithm parameters",
            **kwargs
        )
        self.algorithm = algorithm
        self.context.metadata["algorithm"] = algorithm


class GraphCycleError(GraphError):
    """Unexpected cycle detected in graph"""

    def __init__(
        self,
        message: str,
        cycle_nodes: Optional[List[str]] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.CYCLE_DETECTED,
            severity=ErrorSeverity.WARNING,
            **kwargs
        )
        self.cycle_nodes = cycle_nodes
        self.context.metadata["cycle_nodes"] = cycle_nodes


# ═══════════════════════════════════════════════════════════════════════════
#                          CIRCUIT BREAKER EXCEPTIONS
# ═══════════════════════════════════════════════════════════════════════════

class CircuitBreakerError(LumenCortexError):
    """Base exception for circuit breaker errors"""

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.CIRCUIT_OPEN,
        service_name: Optional[str] = None,
        **kwargs
    ):
        super().__init__(message, code, **kwargs)
        self.service_name = service_name
        self.context.metadata["service_name"] = service_name


class CircuitOpenError(CircuitBreakerError):
    """Circuit breaker is open - service unavailable"""

    def __init__(
        self,
        message: str = "Circuit breaker is open",
        service_name: Optional[str] = None,
        reset_time: Optional[datetime] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.CIRCUIT_OPEN,
            service_name=service_name,
            remediation="Wait for circuit to reset or check service health",
            **kwargs
        )
        self.reset_time = reset_time
        self.context.metadata["reset_time"] = reset_time.isoformat() if reset_time else None


class RateLimitExceededError(CircuitBreakerError):
    """Rate limit exceeded"""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        limit: Optional[int] = None,
        window_seconds: Optional[int] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.RATE_LIMIT_EXCEEDED,
            remediation="Wait before retrying or increase rate limits",
            **kwargs
        )
        self.limit = limit
        self.window_seconds = window_seconds
        self.context.metadata.update({
            "limit": limit,
            "window_seconds": window_seconds,
        })


class RetryExhaustedError(CircuitBreakerError):
    """All retry attempts exhausted"""

    def __init__(
        self,
        message: str = "All retry attempts exhausted",
        attempts: int = 0,
        last_error: Optional[Exception] = None,
        **kwargs
    ):
        super().__init__(
            message,
            code=ErrorCode.RETRY_EXHAUSTED,
            cause=last_error,
            remediation="Check service availability and try again later",
            **kwargs
        )
        self.attempts = attempts
        self.context.metadata["attempts"] = attempts


# ═══════════════════════════════════════════════════════════════════════════
#                          EXCEPTION UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

def handle_exception(exc: Exception) -> LumenCortexError:
    """
    Convert any exception to a LumenCortexError.

    Useful for wrapping third-party exceptions.
    """
    if isinstance(exc, LumenCortexError):
        return exc

    # Map common exceptions
    exc_type = type(exc).__name__

    mapping = {
        "ValueError": ErrorCode.CONFIGURATION,
        "TypeError": ErrorCode.CONFIGURATION,
        "FileNotFoundError": ErrorCode.INVALID_PDF,
        "PermissionError": ErrorCode.PERMISSION_DENIED,
        "TimeoutError": ErrorCode.TIMEOUT,
        "ConnectionError": ErrorCode.CIRCUIT_OPEN,
    }

    code = mapping.get(exc_type, ErrorCode.UNKNOWN)
    return LumenCortexError.from_exception(exc, code)


def format_error_chain(exc: LumenCortexError) -> str:
    """Format error with cause chain"""
    lines = [str(exc)]

    current = exc.cause
    indent = 1

    while current is not None and indent < 10:
        prefix = "  " * indent + "└─ "
        lines.append(f"{prefix}{current}")

        if isinstance(current, LumenCortexError):
            current = current.cause
        else:
            break

        indent += 1

    return "\n".join(lines)
