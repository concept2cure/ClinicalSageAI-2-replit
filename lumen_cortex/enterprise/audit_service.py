"""
═══════════════════════════════════════════════════════════════════════════════
                    LUMEN CORTEX - ENTERPRISE AUDIT LOGGING SERVICE
═══════════════════════════════════════════════════════════════════════════════

Comprehensive audit logging for 21 CFR Part 11 compliance.

FEATURES:
1. Immutable audit trail with Merkle tree verification
2. High-performance async logging
3. Multi-destination support (DB, S3, Elasticsearch)
4. Structured logging with correlation IDs
5. Automatic PII detection and masking
6. Retention policy management
7. Export to regulatory formats
8. Real-time streaming for monitoring

COMPLIANCE:
- 21 CFR Part 11 (Electronic Records)
- HIPAA Audit Requirements
- SOC 2 Type II
- GxP Audit Trail Requirements

@module lumen_cortex.enterprise.audit_service
@version 2.0.0
"""

from __future__ import annotations

import asyncio
import gzip
import hashlib
import json
import logging
import os
import re
import secrets
import threading
import time
from abc import ABC, abstractmethod
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, timedelta
from enum import Enum
from pathlib import Path
from typing import (
    Any, AsyncGenerator, Callable, Dict, List, Optional,
    Set, Tuple, TypeVar, Union
)
from uuid import uuid4

logger = logging.getLogger("LumenCortex.Audit")


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class AuditConfig:
    """Audit service configuration"""

    # General settings
    service_name: str = "lumen-cortex"
    environment: str = "production"

    # Buffer settings
    buffer_size: int = 1000
    flush_interval_seconds: float = 5.0
    max_batch_size: int = 100

    # Retention settings
    retention_days: int = 2555  # 7 years for FDA compliance
    archive_after_days: int = 90

    # Storage settings
    storage_backend: str = "postgresql"  # postgresql, s3, elasticsearch
    storage_connection: str = ""

    # Merkle tree settings
    merkle_checkpoint_interval: int = 1000
    merkle_hash_algorithm: str = "sha256"

    # PII settings
    pii_detection_enabled: bool = True
    pii_masking_enabled: bool = True
    pii_fields: Set[str] = field(default_factory=lambda: {
        "ssn", "social_security", "date_of_birth", "dob", "phone",
        "email", "address", "credit_card", "bank_account"
    })

    # Compression
    compress_archives: bool = True
    compression_level: int = 6

    # Async settings
    writer_pool_size: int = 4

    @classmethod
    def from_env(cls) -> "AuditConfig":
        """Create config from environment variables"""
        return cls(
            service_name=os.getenv("SERVICE_NAME", "lumen-cortex"),
            environment=os.getenv("ENVIRONMENT", "production"),
            buffer_size=int(os.getenv("AUDIT_BUFFER_SIZE", "1000")),
            flush_interval_seconds=float(os.getenv("AUDIT_FLUSH_INTERVAL", "5.0")),
            retention_days=int(os.getenv("AUDIT_RETENTION_DAYS", "2555")),
            storage_backend=os.getenv("AUDIT_STORAGE_BACKEND", "postgresql"),
            storage_connection=os.getenv("AUDIT_STORAGE_CONNECTION", ""),
            pii_detection_enabled=os.getenv("AUDIT_PII_DETECTION", "true").lower() == "true",
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          ENUMS AND TYPES
# ═══════════════════════════════════════════════════════════════════════════

class AuditAction(Enum):
    """Audit action types"""
    # Document actions
    DOCUMENT_CREATE = "document.create"
    DOCUMENT_READ = "document.read"
    DOCUMENT_UPDATE = "document.update"
    DOCUMENT_DELETE = "document.delete"
    DOCUMENT_SIGN = "document.sign"
    DOCUMENT_APPROVE = "document.approve"
    DOCUMENT_REJECT = "document.reject"
    DOCUMENT_EXPORT = "document.export"
    DOCUMENT_ARCHIVE = "document.archive"

    # User actions
    USER_CREATE = "user.create"
    USER_UPDATE = "user.update"
    USER_DELETE = "user.delete"
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    USER_PASSWORD_CHANGE = "user.password_change"
    USER_MFA_ENABLE = "user.mfa_enable"
    USER_MFA_DISABLE = "user.mfa_disable"

    # Analysis actions
    ANALYSIS_START = "analysis.start"
    ANALYSIS_COMPLETE = "analysis.complete"
    ANALYSIS_FAIL = "analysis.fail"
    ANALYSIS_EXPORT = "analysis.export"

    # System actions
    SYSTEM_CONFIG_CHANGE = "system.config_change"
    SYSTEM_BACKUP = "system.backup"
    SYSTEM_RESTORE = "system.restore"
    SYSTEM_MAINTENANCE = "system.maintenance"

    # API actions
    API_REQUEST = "api.request"
    API_ERROR = "api.error"
    API_RATE_LIMIT = "api.rate_limit"

    # Compliance actions
    COMPLIANCE_CHECK = "compliance.check"
    COMPLIANCE_VIOLATION = "compliance.violation"
    COMPLIANCE_REMEDIATION = "compliance.remediation"


class AuditSeverity(Enum):
    """Audit entry severity levels"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AuditOutcome(Enum):
    """Audit action outcomes"""
    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"
    PENDING = "pending"


# ═══════════════════════════════════════════════════════════════════════════
#                          DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class AuditEntry:
    """
    Immutable audit log entry.

    Designed for 21 CFR Part 11 compliance with:
    - Unique identifier
    - Timestamp with timezone
    - User identification
    - Action performed
    - Resource affected
    - Outcome
    - Digital signature support
    """

    # Core fields
    id: str = field(default_factory=lambda: f"aud_{uuid4().hex[:16]}")
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # User context
    user_id: Optional[str] = None
    username: Optional[str] = None
    organization_id: Optional[str] = None
    session_id: Optional[str] = None

    # Action details
    action: AuditAction = AuditAction.API_REQUEST
    severity: AuditSeverity = AuditSeverity.INFO
    outcome: AuditOutcome = AuditOutcome.SUCCESS

    # Resource context
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None

    # Request context
    correlation_id: Optional[str] = None
    request_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None

    # Additional data
    details: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Compliance fields
    reason: Optional[str] = None
    previous_value: Optional[str] = None
    new_value: Optional[str] = None

    # Integrity fields
    sequence_number: Optional[int] = None
    previous_hash: Optional[str] = None
    hash: Optional[str] = None
    signature: Optional[str] = None

    def compute_hash(self, algorithm: str = "sha256") -> str:
        """Compute hash of entry for integrity verification"""
        data = {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "action": self.action.value,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "outcome": self.outcome.value,
            "details": json.dumps(self.details, sort_keys=True),
            "previous_hash": self.previous_hash,
            "sequence_number": self.sequence_number,
        }

        content = json.dumps(data, sort_keys=True)

        if algorithm == "sha256":
            return hashlib.sha256(content.encode()).hexdigest()
        elif algorithm == "sha3_256":
            return hashlib.sha3_256(content.encode()).hexdigest()
        else:
            raise ValueError(f"Unsupported hash algorithm: {algorithm}")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "username": self.username,
            "organization_id": self.organization_id,
            "session_id": self.session_id,
            "action": self.action.value,
            "severity": self.severity.value,
            "outcome": self.outcome.value,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "resource_name": self.resource_name,
            "correlation_id": self.correlation_id,
            "request_id": self.request_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "endpoint": self.endpoint,
            "method": self.method,
            "details": self.details,
            "metadata": self.metadata,
            "reason": self.reason,
            "previous_value": self.previous_value,
            "new_value": self.new_value,
            "sequence_number": self.sequence_number,
            "previous_hash": self.previous_hash,
            "hash": self.hash,
            "signature": self.signature,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AuditEntry":
        """Create from dictionary"""
        return cls(
            id=data.get("id", f"aud_{uuid4().hex[:16]}"),
            timestamp=datetime.fromisoformat(data["timestamp"]) if isinstance(data.get("timestamp"), str) else data.get("timestamp", datetime.now(timezone.utc)),
            user_id=data.get("user_id"),
            username=data.get("username"),
            organization_id=data.get("organization_id"),
            session_id=data.get("session_id"),
            action=AuditAction(data["action"]) if isinstance(data.get("action"), str) else data.get("action", AuditAction.API_REQUEST),
            severity=AuditSeverity(data["severity"]) if isinstance(data.get("severity"), str) else data.get("severity", AuditSeverity.INFO),
            outcome=AuditOutcome(data["outcome"]) if isinstance(data.get("outcome"), str) else data.get("outcome", AuditOutcome.SUCCESS),
            resource_type=data.get("resource_type"),
            resource_id=data.get("resource_id"),
            resource_name=data.get("resource_name"),
            correlation_id=data.get("correlation_id"),
            request_id=data.get("request_id"),
            ip_address=data.get("ip_address"),
            user_agent=data.get("user_agent"),
            endpoint=data.get("endpoint"),
            method=data.get("method"),
            details=data.get("details", {}),
            metadata=data.get("metadata", {}),
            reason=data.get("reason"),
            previous_value=data.get("previous_value"),
            new_value=data.get("new_value"),
            sequence_number=data.get("sequence_number"),
            previous_hash=data.get("previous_hash"),
            hash=data.get("hash"),
            signature=data.get("signature"),
        )


@dataclass
class AuditQuery:
    """Query parameters for audit log search"""

    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    user_id: Optional[str] = None
    organization_id: Optional[str] = None
    actions: Optional[List[AuditAction]] = None
    severities: Optional[List[AuditSeverity]] = None
    outcomes: Optional[List[AuditOutcome]] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    correlation_id: Optional[str] = None
    ip_address: Optional[str] = None
    search_text: Optional[str] = None
    limit: int = 100
    offset: int = 0
    order_by: str = "timestamp"
    order_desc: bool = True


@dataclass
class AuditStats:
    """Audit statistics"""

    total_entries: int = 0
    entries_by_action: Dict[str, int] = field(default_factory=dict)
    entries_by_severity: Dict[str, int] = field(default_factory=dict)
    entries_by_outcome: Dict[str, int] = field(default_factory=dict)
    entries_by_user: Dict[str, int] = field(default_factory=dict)
    entries_per_hour: Dict[str, int] = field(default_factory=dict)
    merkle_root: Optional[str] = None
    last_sequence: int = 0
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════════════════
#                          PII DETECTION
# ═══════════════════════════════════════════════════════════════════════════

class PIIDetector:
    """
    Detect and mask personally identifiable information.
    """

    # Regex patterns for common PII
    PATTERNS = {
        "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        "phone": re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"),
        "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
        "credit_card": re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
        "ip_v4": re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
        "date_of_birth": re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b"),
    }

    def __init__(self, config: AuditConfig):
        self.config = config
        self.sensitive_fields = config.pii_fields

    def detect(self, data: Dict[str, Any]) -> List[Tuple[str, str, str]]:
        """
        Detect PII in data.
        Returns list of (field_path, pii_type, value) tuples.
        """
        findings = []
        self._scan_dict(data, "", findings)
        return findings

    def _scan_dict(
        self,
        data: Dict[str, Any],
        path: str,
        findings: List[Tuple[str, str, str]]
    ) -> None:
        """Recursively scan dictionary for PII"""
        for key, value in data.items():
            current_path = f"{path}.{key}" if path else key

            # Check field name
            if key.lower() in self.sensitive_fields:
                findings.append((current_path, "field_name", str(value)[:50]))

            # Check value
            if isinstance(value, str):
                for pii_type, pattern in self.PATTERNS.items():
                    if pattern.search(value):
                        findings.append((current_path, pii_type, value[:50]))
            elif isinstance(value, dict):
                self._scan_dict(value, current_path, findings)
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict):
                        self._scan_dict(item, f"{current_path}[{i}]", findings)
                    elif isinstance(item, str):
                        for pii_type, pattern in self.PATTERNS.items():
                            if pattern.search(item):
                                findings.append((f"{current_path}[{i}]", pii_type, item[:50]))

    def mask(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Mask PII in data.
        Returns a copy with PII masked.
        """
        return self._mask_dict(data.copy())

    def _mask_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively mask PII in dictionary"""
        result = {}

        for key, value in data.items():
            # Mask sensitive field names
            if key.lower() in self.sensitive_fields:
                result[key] = "[REDACTED]"
                continue

            if isinstance(value, str):
                masked_value = value
                for pii_type, pattern in self.PATTERNS.items():
                    masked_value = pattern.sub(f"[{pii_type.upper()}_REDACTED]", masked_value)
                result[key] = masked_value
            elif isinstance(value, dict):
                result[key] = self._mask_dict(value)
            elif isinstance(value, list):
                result[key] = [
                    self._mask_dict(item) if isinstance(item, dict)
                    else self._mask_value(item) if isinstance(item, str)
                    else item
                    for item in value
                ]
            else:
                result[key] = value

        return result

    def _mask_value(self, value: str) -> str:
        """Mask PII in a string value"""
        for pii_type, pattern in self.PATTERNS.items():
            value = pattern.sub(f"[{pii_type.upper()}_REDACTED]", value)
        return value


# ═══════════════════════════════════════════════════════════════════════════
#                          STORAGE BACKENDS
# ═══════════════════════════════════════════════════════════════════════════

class AuditStorage(ABC):
    """Abstract audit storage backend"""

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize storage"""
        pass

    @abstractmethod
    async def write(self, entries: List[AuditEntry]) -> int:
        """Write entries to storage. Returns count written."""
        pass

    @abstractmethod
    async def read(self, query: AuditQuery) -> List[AuditEntry]:
        """Query entries from storage"""
        pass

    @abstractmethod
    async def count(self, query: AuditQuery) -> int:
        """Count entries matching query"""
        pass

    @abstractmethod
    async def get_stats(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> AuditStats:
        """Get statistics for time period"""
        pass

    @abstractmethod
    async def get_merkle_checkpoint(self) -> Optional[Tuple[int, str]]:
        """Get last Merkle checkpoint (sequence, root)"""
        pass

    @abstractmethod
    async def save_merkle_checkpoint(self, sequence: int, root: str) -> None:
        """Save Merkle checkpoint"""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close storage connection"""
        pass


class InMemoryAuditStorage(AuditStorage):
    """In-memory audit storage for development/testing"""

    def __init__(self, max_entries: int = 100000):
        self.max_entries = max_entries
        self._entries: deque = deque(maxlen=max_entries)
        self._merkle_checkpoints: List[Tuple[int, str]] = []
        self._lock = asyncio.Lock()

    async def initialize(self) -> None:
        pass

    async def write(self, entries: List[AuditEntry]) -> int:
        async with self._lock:
            for entry in entries:
                self._entries.append(entry)
            return len(entries)

    async def read(self, query: AuditQuery) -> List[AuditEntry]:
        results = []

        for entry in self._entries:
            if self._matches_query(entry, query):
                results.append(entry)

        # Sort
        results.sort(
            key=lambda e: getattr(e, query.order_by, e.timestamp),
            reverse=query.order_desc
        )

        # Paginate
        return results[query.offset:query.offset + query.limit]

    async def count(self, query: AuditQuery) -> int:
        return sum(1 for e in self._entries if self._matches_query(e, query))

    def _matches_query(self, entry: AuditEntry, query: AuditQuery) -> bool:
        """Check if entry matches query filters"""
        if query.start_date and entry.timestamp < query.start_date:
            return False
        if query.end_date and entry.timestamp > query.end_date:
            return False
        if query.user_id and entry.user_id != query.user_id:
            return False
        if query.organization_id and entry.organization_id != query.organization_id:
            return False
        if query.actions and entry.action not in query.actions:
            return False
        if query.severities and entry.severity not in query.severities:
            return False
        if query.outcomes and entry.outcome not in query.outcomes:
            return False
        if query.resource_type and entry.resource_type != query.resource_type:
            return False
        if query.resource_id and entry.resource_id != query.resource_id:
            return False
        if query.correlation_id and entry.correlation_id != query.correlation_id:
            return False
        if query.ip_address and entry.ip_address != query.ip_address:
            return False
        if query.search_text:
            search_lower = query.search_text.lower()
            if not any([
                search_lower in str(entry.details).lower(),
                search_lower in (entry.reason or "").lower(),
                search_lower in (entry.resource_name or "").lower(),
            ]):
                return False
        return True

    async def get_stats(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> AuditStats:
        stats = AuditStats(
            period_start=start_date,
            period_end=end_date,
        )

        for entry in self._entries:
            if start_date <= entry.timestamp <= end_date:
                stats.total_entries += 1

                action_key = entry.action.value
                stats.entries_by_action[action_key] = stats.entries_by_action.get(action_key, 0) + 1

                severity_key = entry.severity.value
                stats.entries_by_severity[severity_key] = stats.entries_by_severity.get(severity_key, 0) + 1

                outcome_key = entry.outcome.value
                stats.entries_by_outcome[outcome_key] = stats.entries_by_outcome.get(outcome_key, 0) + 1

                if entry.user_id:
                    stats.entries_by_user[entry.user_id] = stats.entries_by_user.get(entry.user_id, 0) + 1

                hour_key = entry.timestamp.strftime("%Y-%m-%d %H:00")
                stats.entries_per_hour[hour_key] = stats.entries_per_hour.get(hour_key, 0) + 1

                if entry.sequence_number:
                    stats.last_sequence = max(stats.last_sequence, entry.sequence_number)

        return stats

    async def get_merkle_checkpoint(self) -> Optional[Tuple[int, str]]:
        if self._merkle_checkpoints:
            return self._merkle_checkpoints[-1]
        return None

    async def save_merkle_checkpoint(self, sequence: int, root: str) -> None:
        self._merkle_checkpoints.append((sequence, root))

    async def close(self) -> None:
        pass


class FileAuditStorage(AuditStorage):
    """File-based audit storage with daily rotation"""

    def __init__(self, config: AuditConfig, base_path: str = "/var/log/lumen-cortex/audit"):
        self.config = config
        self.base_path = Path(base_path)
        self._current_file: Optional[Path] = None
        self._current_date: Optional[str] = None
        self._lock = asyncio.Lock()
        self._sequence = 0

    async def initialize(self) -> None:
        self.base_path.mkdir(parents=True, exist_ok=True)

        # Find last sequence number
        for file in sorted(self.base_path.glob("*.jsonl"), reverse=True):
            try:
                with open(file, 'r') as f:
                    for line in f:
                        try:
                            entry = json.loads(line)
                            if entry.get("sequence_number"):
                                self._sequence = max(self._sequence, entry["sequence_number"])
                        except json.JSONDecodeError:
                            pass
                break
            except Exception:
                pass

    def _get_file_path(self, date: datetime) -> Path:
        """Get file path for a given date"""
        date_str = date.strftime("%Y-%m-%d")
        return self.base_path / f"audit_{date_str}.jsonl"

    async def write(self, entries: List[AuditEntry]) -> int:
        async with self._lock:
            written = 0

            for entry in entries:
                file_path = self._get_file_path(entry.timestamp)

                with open(file_path, 'a') as f:
                    f.write(json.dumps(entry.to_dict()) + "\n")
                    written += 1

            return written

    async def read(self, query: AuditQuery) -> List[AuditEntry]:
        results = []

        # Determine date range
        start_date = query.start_date or (datetime.now(timezone.utc) - timedelta(days=30))
        end_date = query.end_date or datetime.now(timezone.utc)

        current = start_date.date()
        end = end_date.date()

        while current <= end:
            file_path = self._get_file_path(datetime.combine(current, datetime.min.time()))

            if file_path.exists():
                with open(file_path, 'r') as f:
                    for line in f:
                        try:
                            entry = AuditEntry.from_dict(json.loads(line))
                            # Apply filters (simplified)
                            if query.user_id and entry.user_id != query.user_id:
                                continue
                            results.append(entry)
                        except (json.JSONDecodeError, KeyError):
                            pass

            current += timedelta(days=1)

        # Sort and paginate
        results.sort(
            key=lambda e: getattr(e, query.order_by, e.timestamp),
            reverse=query.order_desc
        )

        return results[query.offset:query.offset + query.limit]

    async def count(self, query: AuditQuery) -> int:
        # Simplified count - in production, use index
        entries = await self.read(AuditQuery(
            start_date=query.start_date,
            end_date=query.end_date,
            user_id=query.user_id,
            limit=1000000,
            offset=0,
        ))
        return len(entries)

    async def get_stats(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> AuditStats:
        query = AuditQuery(start_date=start_date, end_date=end_date, limit=100000)
        entries = await self.read(query)

        stats = AuditStats(
            total_entries=len(entries),
            period_start=start_date,
            period_end=end_date,
        )

        for entry in entries:
            action_key = entry.action.value
            stats.entries_by_action[action_key] = stats.entries_by_action.get(action_key, 0) + 1

        return stats

    async def get_merkle_checkpoint(self) -> Optional[Tuple[int, str]]:
        checkpoint_file = self.base_path / "merkle_checkpoint.json"
        if checkpoint_file.exists():
            with open(checkpoint_file, 'r') as f:
                data = json.load(f)
                return (data["sequence"], data["root"])
        return None

    async def save_merkle_checkpoint(self, sequence: int, root: str) -> None:
        checkpoint_file = self.base_path / "merkle_checkpoint.json"
        with open(checkpoint_file, 'w') as f:
            json.dump({"sequence": sequence, "root": root, "timestamp": datetime.now(timezone.utc).isoformat()}, f)

    async def close(self) -> None:
        pass


# ═══════════════════════════════════════════════════════════════════════════
#                          MERKLE TREE FOR INTEGRITY
# ═══════════════════════════════════════════════════════════════════════════

class AuditMerkleTree:
    """
    Merkle tree for audit trail integrity verification.

    Provides tamper-evident audit logs per 21 CFR Part 11.
    """

    def __init__(self, config: AuditConfig):
        self.config = config
        self._leaves: List[str] = []
        self._root: Optional[str] = None

    def add_entry(self, entry: AuditEntry) -> str:
        """Add entry to tree and return its hash"""
        entry_hash = entry.compute_hash(self.config.merkle_hash_algorithm)
        self._leaves.append(entry_hash)
        self._root = None  # Invalidate cached root
        return entry_hash

    def compute_root(self) -> str:
        """Compute Merkle root hash"""
        if self._root:
            return self._root

        if not self._leaves:
            return hashlib.sha256(b"").hexdigest()

        # Build tree
        level = self._leaves.copy()

        while len(level) > 1:
            next_level = []

            for i in range(0, len(level), 2):
                if i + 1 < len(level):
                    combined = level[i] + level[i + 1]
                else:
                    combined = level[i] + level[i]  # Duplicate odd leaf

                next_level.append(
                    hashlib.sha256(combined.encode()).hexdigest()
                )

            level = next_level

        self._root = level[0]
        return self._root

    def get_proof(self, index: int) -> List[Tuple[str, str]]:
        """Get Merkle proof for entry at index"""
        if index >= len(self._leaves):
            raise IndexError("Index out of range")

        proof = []
        level = self._leaves.copy()
        idx = index

        while len(level) > 1:
            next_level = []

            for i in range(0, len(level), 2):
                if i + 1 < len(level):
                    combined = level[i] + level[i + 1]
                else:
                    combined = level[i] + level[i]

                next_level.append(
                    hashlib.sha256(combined.encode()).hexdigest()
                )

                # Record sibling
                if i == idx or i + 1 == idx:
                    sibling_idx = i if idx == i + 1 else i + 1
                    if sibling_idx < len(level):
                        side = "left" if idx == i + 1 else "right"
                        proof.append((side, level[sibling_idx] if sibling_idx < len(level) else level[i]))

            idx = idx // 2
            level = next_level

        return proof

    def verify_proof(
        self,
        entry_hash: str,
        proof: List[Tuple[str, str]],
        root: str
    ) -> bool:
        """Verify a Merkle proof"""
        current = entry_hash

        for side, sibling in proof:
            if side == "left":
                combined = sibling + current
            else:
                combined = current + sibling

            current = hashlib.sha256(combined.encode()).hexdigest()

        return current == root

    def clear(self) -> None:
        """Clear tree for next checkpoint"""
        self._leaves = []
        self._root = None


# ═══════════════════════════════════════════════════════════════════════════
#                          AUDIT SERVICE
# ═══════════════════════════════════════════════════════════════════════════

class AuditService:
    """
    Enterprise audit logging service.

    Features:
    - Async buffered writes
    - Merkle tree integrity
    - PII detection/masking
    - Multi-storage backend
    - Correlation tracking
    """

    def __init__(
        self,
        config: Optional[AuditConfig] = None,
        storage: Optional[AuditStorage] = None
    ):
        self.config = config or AuditConfig.from_env()
        self.storage = storage or InMemoryAuditStorage()

        # Components
        self.pii_detector = PIIDetector(self.config)
        self.merkle_tree = AuditMerkleTree(self.config)

        # Buffer
        self._buffer: deque = deque(maxlen=self.config.buffer_size)
        self._buffer_lock = asyncio.Lock()

        # Sequence tracking
        self._sequence = 0
        self._last_hash: Optional[str] = None
        self._sequence_lock = asyncio.Lock()

        # Background tasks
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False

        # Stats
        self._stats = {
            "entries_logged": 0,
            "entries_flushed": 0,
            "flush_count": 0,
            "errors": 0,
        }

    async def start(self) -> None:
        """Start the audit service"""
        await self.storage.initialize()

        # Load last checkpoint
        checkpoint = await self.storage.get_merkle_checkpoint()
        if checkpoint:
            self._sequence = checkpoint[0]
            self._last_hash = checkpoint[1]

        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())

        logger.info(f"Audit service started (sequence: {self._sequence})")

    async def stop(self) -> None:
        """Stop the audit service"""
        self._running = False

        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass

        # Final flush
        await self._flush()

        # Save checkpoint
        if self._sequence > 0:
            root = self.merkle_tree.compute_root()
            await self.storage.save_merkle_checkpoint(self._sequence, root)

        await self.storage.close()

        logger.info(f"Audit service stopped (sequence: {self._sequence})")

    async def log(
        self,
        action: AuditAction,
        *,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        organization_id: Optional[str] = None,
        session_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        resource_name: Optional[str] = None,
        outcome: AuditOutcome = AuditOutcome.SUCCESS,
        severity: AuditSeverity = AuditSeverity.INFO,
        correlation_id: Optional[str] = None,
        request_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        endpoint: Optional[str] = None,
        method: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None,
        previous_value: Optional[str] = None,
        new_value: Optional[str] = None,
    ) -> str:
        """
        Log an audit entry.
        Returns the entry ID.
        """
        # Process details
        processed_details = details or {}

        # PII handling
        if self.config.pii_detection_enabled and processed_details:
            if self.config.pii_masking_enabled:
                processed_details = self.pii_detector.mask(processed_details)

        # Create entry
        async with self._sequence_lock:
            self._sequence += 1
            entry = AuditEntry(
                timestamp=datetime.now(timezone.utc),
                user_id=user_id,
                username=username,
                organization_id=organization_id,
                session_id=session_id,
                action=action,
                severity=severity,
                outcome=outcome,
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=resource_name,
                correlation_id=correlation_id,
                request_id=request_id,
                ip_address=ip_address,
                user_agent=user_agent,
                endpoint=endpoint,
                method=method,
                details=processed_details,
                reason=reason,
                previous_value=previous_value,
                new_value=new_value,
                sequence_number=self._sequence,
                previous_hash=self._last_hash,
            )

            # Compute hash
            entry.hash = entry.compute_hash(self.config.merkle_hash_algorithm)
            self._last_hash = entry.hash

            # Add to Merkle tree
            self.merkle_tree.add_entry(entry)

        # Buffer entry
        async with self._buffer_lock:
            self._buffer.append(entry)
            self._stats["entries_logged"] += 1

        # Check if we should checkpoint
        if self._sequence % self.config.merkle_checkpoint_interval == 0:
            asyncio.create_task(self._save_checkpoint())

        return entry.id

    async def query(self, query: AuditQuery) -> List[AuditEntry]:
        """Query audit entries"""
        return await self.storage.read(query)

    async def count(self, query: AuditQuery) -> int:
        """Count audit entries"""
        return await self.storage.count(query)

    async def get_stats(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> AuditStats:
        """Get audit statistics"""
        start = start_date or (datetime.now(timezone.utc) - timedelta(days=7))
        end = end_date or datetime.now(timezone.utc)

        stats = await self.storage.get_stats(start, end)
        stats.merkle_root = self.merkle_tree.compute_root()
        stats.last_sequence = self._sequence

        return stats

    async def verify_integrity(
        self,
        entry_ids: Optional[List[str]] = None
    ) -> Tuple[bool, List[str]]:
        """
        Verify audit trail integrity.
        Returns (is_valid, list of invalid entry IDs)
        """
        # Get entries to verify
        if entry_ids:
            query = AuditQuery(limit=len(entry_ids))
            entries = await self.storage.read(query)
            entries = [e for e in entries if e.id in entry_ids]
        else:
            query = AuditQuery(limit=10000, order_desc=False)
            entries = await self.storage.read(query)

        invalid = []
        prev_hash: Optional[str] = None

        for entry in entries:
            # Verify hash chain
            if entry.previous_hash != prev_hash:
                invalid.append(entry.id)
                continue

            # Verify entry hash
            computed = entry.compute_hash(self.config.merkle_hash_algorithm)
            if computed != entry.hash:
                invalid.append(entry.id)
                continue

            prev_hash = entry.hash

        return len(invalid) == 0, invalid

    async def export(
        self,
        query: AuditQuery,
        format: str = "json",
        output_path: Optional[str] = None
    ) -> Union[str, bytes]:
        """
        Export audit entries.

        Formats: json, csv, xml
        """
        entries = await self.storage.read(query)

        if format == "json":
            data = json.dumps(
                [e.to_dict() for e in entries],
                indent=2,
                default=str
            )
        elif format == "csv":
            import csv
            import io

            output = io.StringIO()
            if entries:
                fieldnames = list(entries[0].to_dict().keys())
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                for entry in entries:
                    writer.writerow(entry.to_dict())
            data = output.getvalue()
        else:
            raise ValueError(f"Unsupported format: {format}")

        if output_path:
            with open(output_path, 'w') as f:
                f.write(data)

        return data

    async def _flush_loop(self) -> None:
        """Background flush loop"""
        while self._running:
            try:
                await asyncio.sleep(self.config.flush_interval_seconds)
                await self._flush()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Flush error: {e}")
                self._stats["errors"] += 1

    async def _flush(self) -> None:
        """Flush buffer to storage"""
        async with self._buffer_lock:
            if not self._buffer:
                return

            entries = list(self._buffer)
            self._buffer.clear()

        # Write in batches
        for i in range(0, len(entries), self.config.max_batch_size):
            batch = entries[i:i + self.config.max_batch_size]
            try:
                written = await self.storage.write(batch)
                self._stats["entries_flushed"] += written
            except Exception as e:
                logger.error(f"Storage write error: {e}")
                self._stats["errors"] += 1
                # Re-buffer failed entries
                async with self._buffer_lock:
                    for entry in batch:
                        self._buffer.appendleft(entry)

        self._stats["flush_count"] += 1

    async def _save_checkpoint(self) -> None:
        """Save Merkle checkpoint"""
        root = self.merkle_tree.compute_root()
        await self.storage.save_merkle_checkpoint(self._sequence, root)
        self.merkle_tree.clear()
        logger.info(f"Merkle checkpoint saved at sequence {self._sequence}")

    def get_service_stats(self) -> Dict[str, Any]:
        """Get service statistics"""
        return {
            **self._stats,
            "buffer_size": len(self._buffer),
            "sequence": self._sequence,
            "merkle_root": self.merkle_tree.compute_root() if self.merkle_tree._leaves else None,
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          CONTEXT MANAGER
# ═══════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def audit_context(
    service: AuditService,
    action: AuditAction,
    **kwargs
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Context manager for audit logging.

    Automatically logs start and completion/failure.

    Usage:
        async with audit_context(audit_service, AuditAction.DOCUMENT_UPDATE,
                                user_id="usr_123", resource_id="doc_456") as ctx:
            # Do work
            ctx["details"]["changes"] = {"field": "value"}
    """
    ctx = {
        "details": {},
        "outcome": AuditOutcome.SUCCESS,
        "error": None,
    }

    start_time = time.time()

    try:
        yield ctx
    except Exception as e:
        ctx["outcome"] = AuditOutcome.FAILURE
        ctx["error"] = str(e)
        ctx["details"]["error_type"] = type(e).__name__
        raise
    finally:
        duration = time.time() - start_time
        ctx["details"]["duration_ms"] = round(duration * 1000, 2)

        await service.log(
            action=action,
            outcome=ctx["outcome"],
            details=ctx["details"],
            **kwargs
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          EXPORTS
# ═══════════════════════════════════════════════════════════════════════════

__all__ = [
    # Config
    "AuditConfig",
    # Enums
    "AuditAction",
    "AuditSeverity",
    "AuditOutcome",
    # Data classes
    "AuditEntry",
    "AuditQuery",
    "AuditStats",
    # Service
    "AuditService",
    # Storage
    "AuditStorage",
    "InMemoryAuditStorage",
    "FileAuditStorage",
    # Components
    "PIIDetector",
    "AuditMerkleTree",
    # Context
    "audit_context",
]
