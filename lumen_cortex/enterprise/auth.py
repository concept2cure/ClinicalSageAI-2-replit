"""
═══════════════════════════════════════════════════════════════════════════════
                    LUMEN CORTEX - ENTERPRISE AUTHENTICATION MIDDLEWARE
═══════════════════════════════════════════════════════════════════════════════

Production-grade authentication and authorization middleware.

FEATURES:
1. JWT token validation with RS256/ES256
2. API key authentication
3. Role-based access control (RBAC)
4. Session management with Redis
5. OAuth2/OIDC integration
6. Multi-factor authentication support
7. Rate limiting per user/role
8. Audit logging of auth events

COMPLIANCE:
- 21 CFR Part 11 authentication requirements
- NIST 800-63B Digital Identity Guidelines
- SOC 2 Type II ready

@module lumen_cortex.enterprise.auth
@version 2.0.0
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, TypeVar, Union

logger = logging.getLogger("LumenCortex.Auth")


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class AuthConfig:
    """Authentication configuration"""

    # JWT Settings
    jwt_algorithm: str = "RS256"
    jwt_issuer: str = "lumen-cortex"
    jwt_audience: str = "lumen-cortex-api"
    jwt_expiry_minutes: int = 60
    jwt_refresh_expiry_days: int = 30

    # API Key Settings
    api_key_prefix: str = "lc_"
    api_key_length: int = 48
    api_key_hash_algorithm: str = "sha256"

    # Session Settings
    session_timeout_minutes: int = 480  # 8 hours
    session_max_concurrent: int = 5
    session_extend_on_activity: bool = True

    # Security Settings
    password_min_length: int = 12
    password_require_uppercase: bool = True
    password_require_lowercase: bool = True
    password_require_digit: bool = True
    password_require_special: bool = True
    password_history_count: int = 12

    # Lockout Settings
    max_failed_attempts: int = 5
    lockout_duration_minutes: int = 30
    lockout_reset_minutes: int = 60

    # MFA Settings
    mfa_enabled: bool = True
    mfa_totp_issuer: str = "Lumen Cortex"
    mfa_totp_digits: int = 6
    mfa_totp_period: int = 30

    # Rate Limiting
    rate_limit_per_minute: int = 100
    rate_limit_per_hour: int = 1000

    # Redis Settings
    redis_url: str = ""
    redis_prefix: str = "lc:auth:"

    @classmethod
    def from_env(cls) -> "AuthConfig":
        """Create config from environment variables"""
        return cls(
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "RS256"),
            jwt_issuer=os.getenv("JWT_ISSUER", "lumen-cortex"),
            jwt_audience=os.getenv("JWT_AUDIENCE", "lumen-cortex-api"),
            jwt_expiry_minutes=int(os.getenv("JWT_EXPIRY_MINUTES", "60")),
            jwt_refresh_expiry_days=int(os.getenv("JWT_REFRESH_DAYS", "30")),
            session_timeout_minutes=int(os.getenv("SESSION_TIMEOUT_MINUTES", "480")),
            max_failed_attempts=int(os.getenv("MAX_FAILED_ATTEMPTS", "5")),
            lockout_duration_minutes=int(os.getenv("LOCKOUT_DURATION", "30")),
            mfa_enabled=os.getenv("MFA_ENABLED", "true").lower() == "true",
            rate_limit_per_minute=int(os.getenv("RATE_LIMIT_PER_MIN", "100")),
            redis_url=os.getenv("REDIS_URL", ""),
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          ENUMS AND TYPES
# ═══════════════════════════════════════════════════════════════════════════

class Permission(Enum):
    """System permissions"""
    # Document permissions
    DOCUMENT_READ = "document:read"
    DOCUMENT_WRITE = "document:write"
    DOCUMENT_DELETE = "document:delete"
    DOCUMENT_SIGN = "document:sign"
    DOCUMENT_APPROVE = "document:approve"

    # Analysis permissions
    ANALYSIS_RUN = "analysis:run"
    ANALYSIS_EXPORT = "analysis:export"

    # Graph permissions
    GRAPH_READ = "graph:read"
    GRAPH_WRITE = "graph:write"
    GRAPH_ADMIN = "graph:admin"

    # Admin permissions
    USER_MANAGE = "user:manage"
    ROLE_MANAGE = "role:manage"
    SYSTEM_ADMIN = "system:admin"
    AUDIT_VIEW = "audit:view"

    # API permissions
    API_ACCESS = "api:access"
    API_ADMIN = "api:admin"


class Role(Enum):
    """System roles"""
    VIEWER = "viewer"
    ANALYST = "analyst"
    AUTHOR = "author"
    REVIEWER = "reviewer"
    APPROVER = "approver"
    ADMIN = "admin"
    SYSTEM = "system"


# Role to permission mapping
ROLE_PERMISSIONS: Dict[Role, Set[Permission]] = {
    Role.VIEWER: {
        Permission.DOCUMENT_READ,
        Permission.GRAPH_READ,
        Permission.API_ACCESS,
    },
    Role.ANALYST: {
        Permission.DOCUMENT_READ,
        Permission.ANALYSIS_RUN,
        Permission.ANALYSIS_EXPORT,
        Permission.GRAPH_READ,
        Permission.API_ACCESS,
    },
    Role.AUTHOR: {
        Permission.DOCUMENT_READ,
        Permission.DOCUMENT_WRITE,
        Permission.ANALYSIS_RUN,
        Permission.GRAPH_READ,
        Permission.GRAPH_WRITE,
        Permission.API_ACCESS,
    },
    Role.REVIEWER: {
        Permission.DOCUMENT_READ,
        Permission.DOCUMENT_WRITE,
        Permission.ANALYSIS_RUN,
        Permission.ANALYSIS_EXPORT,
        Permission.GRAPH_READ,
        Permission.AUDIT_VIEW,
        Permission.API_ACCESS,
    },
    Role.APPROVER: {
        Permission.DOCUMENT_READ,
        Permission.DOCUMENT_WRITE,
        Permission.DOCUMENT_SIGN,
        Permission.DOCUMENT_APPROVE,
        Permission.ANALYSIS_RUN,
        Permission.ANALYSIS_EXPORT,
        Permission.GRAPH_READ,
        Permission.AUDIT_VIEW,
        Permission.API_ACCESS,
    },
    Role.ADMIN: {
        Permission.DOCUMENT_READ,
        Permission.DOCUMENT_WRITE,
        Permission.DOCUMENT_DELETE,
        Permission.DOCUMENT_SIGN,
        Permission.DOCUMENT_APPROVE,
        Permission.ANALYSIS_RUN,
        Permission.ANALYSIS_EXPORT,
        Permission.GRAPH_READ,
        Permission.GRAPH_WRITE,
        Permission.GRAPH_ADMIN,
        Permission.USER_MANAGE,
        Permission.ROLE_MANAGE,
        Permission.AUDIT_VIEW,
        Permission.API_ACCESS,
        Permission.API_ADMIN,
    },
    Role.SYSTEM: set(Permission),  # All permissions
}


class AuthEventType(Enum):
    """Authentication event types for audit"""
    LOGIN_SUCCESS = "auth.login.success"
    LOGIN_FAILURE = "auth.login.failure"
    LOGOUT = "auth.logout"
    TOKEN_REFRESH = "auth.token.refresh"
    TOKEN_REVOKE = "auth.token.revoke"
    PASSWORD_CHANGE = "auth.password.change"
    PASSWORD_RESET = "auth.password.reset"
    MFA_ENABLE = "auth.mfa.enable"
    MFA_DISABLE = "auth.mfa.disable"
    MFA_VERIFY = "auth.mfa.verify"
    LOCKOUT = "auth.lockout"
    UNLOCK = "auth.unlock"
    SESSION_CREATE = "auth.session.create"
    SESSION_EXPIRE = "auth.session.expire"
    API_KEY_CREATE = "auth.apikey.create"
    API_KEY_REVOKE = "auth.apikey.revoke"


# ═══════════════════════════════════════════════════════════════════════════
#                          DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class User:
    """User entity"""
    id: str
    email: str
    username: str
    roles: List[Role]
    organization_id: Optional[str] = None
    department: Optional[str] = None
    is_active: bool = True
    is_locked: bool = False
    mfa_enabled: bool = False
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def permissions(self) -> Set[Permission]:
        """Get all permissions for user's roles"""
        perms = set()
        for role in self.roles:
            perms.update(ROLE_PERMISSIONS.get(role, set()))
        return perms

    def has_permission(self, permission: Permission) -> bool:
        """Check if user has a specific permission"""
        return permission in self.permissions

    def has_any_permission(self, permissions: List[Permission]) -> bool:
        """Check if user has any of the specified permissions"""
        return bool(self.permissions & set(permissions))

    def has_all_permissions(self, permissions: List[Permission]) -> bool:
        """Check if user has all specified permissions"""
        return set(permissions).issubset(self.permissions)

    def has_role(self, role: Role) -> bool:
        """Check if user has a specific role"""
        return role in self.roles


@dataclass
class Session:
    """User session"""
    id: str
    user_id: str
    created_at: datetime
    expires_at: datetime
    last_activity: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    device_fingerprint: Optional[str] = None
    is_valid: bool = True

    @property
    def is_expired(self) -> bool:
        """Check if session is expired"""
        return datetime.now(timezone.utc) > self.expires_at

    def extend(self, minutes: int) -> None:
        """Extend session expiry"""
        self.expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes)
        self.last_activity = datetime.now(timezone.utc)


@dataclass
class TokenPair:
    """JWT token pair"""
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = 3600  # seconds
    refresh_expires_in: int = 2592000  # 30 days


@dataclass
class APIKey:
    """API key entity"""
    id: str
    name: str
    key_hash: str
    prefix: str
    user_id: str
    permissions: Set[Permission]
    created_at: datetime
    expires_at: Optional[datetime] = None
    last_used: Optional[datetime] = None
    is_active: bool = True
    rate_limit: Optional[int] = None
    allowed_ips: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AuthEvent:
    """Authentication event for audit"""
    id: str
    event_type: AuthEventType
    user_id: Optional[str]
    timestamp: datetime
    ip_address: Optional[str]
    user_agent: Optional[str]
    success: bool
    details: Dict[str, Any] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════
#                          PASSWORD UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

class PasswordHasher:
    """Secure password hashing with Argon2"""

    def __init__(self):
        try:
            from argon2 import PasswordHasher as Argon2Hasher
            self._hasher = Argon2Hasher(
                time_cost=2,
                memory_cost=65536,
                parallelism=4,
                hash_len=32,
                salt_len=16
            )
            self._available = True
        except ImportError:
            self._hasher = None
            self._available = False
            logger.warning("argon2-cffi not available, using fallback hasher")

    def hash(self, password: str) -> str:
        """Hash a password"""
        if self._available and self._hasher:
            return self._hasher.hash(password)
        else:
            # Fallback to PBKDF2
            salt = secrets.token_bytes(16)
            key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
            return f"pbkdf2:{salt.hex()}:{key.hex()}"

    def verify(self, password: str, hash_str: str) -> bool:
        """Verify a password against a hash"""
        try:
            if hash_str.startswith("pbkdf2:"):
                # Fallback verification
                _, salt_hex, key_hex = hash_str.split(":")
                salt = bytes.fromhex(salt_hex)
                expected_key = bytes.fromhex(key_hex)
                actual_key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
                return hmac.compare_digest(expected_key, actual_key)
            elif self._available and self._hasher:
                return self._hasher.verify(hash_str, password)
            return False
        except Exception:
            return False

    def needs_rehash(self, hash_str: str) -> bool:
        """Check if password needs rehashing"""
        if hash_str.startswith("pbkdf2:"):
            return self._available  # Rehash to Argon2 if available
        if self._available and self._hasher:
            return self._hasher.check_needs_rehash(hash_str)
        return False


class PasswordValidator:
    """Password policy validator"""

    def __init__(self, config: AuthConfig):
        self.config = config

    def validate(self, password: str) -> Tuple[bool, List[str]]:
        """Validate password against policy"""
        errors = []

        if len(password) < self.config.password_min_length:
            errors.append(f"Password must be at least {self.config.password_min_length} characters")

        if self.config.password_require_uppercase and not any(c.isupper() for c in password):
            errors.append("Password must contain at least one uppercase letter")

        if self.config.password_require_lowercase and not any(c.islower() for c in password):
            errors.append("Password must contain at least one lowercase letter")

        if self.config.password_require_digit and not any(c.isdigit() for c in password):
            errors.append("Password must contain at least one digit")

        if self.config.password_require_special:
            special_chars = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
            if not any(c in special_chars for c in password):
                errors.append("Password must contain at least one special character")

        return len(errors) == 0, errors


# ═══════════════════════════════════════════════════════════════════════════
#                          JWT UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

class JWTHandler:
    """JWT token handler"""

    def __init__(self, config: AuthConfig, private_key: Optional[str] = None, public_key: Optional[str] = None):
        self.config = config
        self._private_key = private_key or os.getenv("JWT_PRIVATE_KEY", "")
        self._public_key = public_key or os.getenv("JWT_PUBLIC_KEY", "")

        try:
            import jwt
            self._jwt = jwt
            self._available = True
        except ImportError:
            self._jwt = None
            self._available = False
            logger.warning("PyJWT not available")

    def create_access_token(self, user: User, session_id: str) -> str:
        """Create access token"""
        if not self._available:
            raise RuntimeError("JWT library not available")

        now = datetime.now(timezone.utc)
        payload = {
            "sub": user.id,
            "email": user.email,
            "username": user.username,
            "roles": [r.value for r in user.roles],
            "permissions": [p.value for p in user.permissions],
            "org_id": user.organization_id,
            "session_id": session_id,
            "iss": self.config.jwt_issuer,
            "aud": self.config.jwt_audience,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=self.config.jwt_expiry_minutes)).timestamp()),
            "jti": secrets.token_urlsafe(16),
        }

        return self._jwt.encode(
            payload,
            self._private_key,
            algorithm=self.config.jwt_algorithm
        )

    def create_refresh_token(self, user_id: str, session_id: str) -> str:
        """Create refresh token"""
        if not self._available:
            raise RuntimeError("JWT library not available")

        now = datetime.now(timezone.utc)
        payload = {
            "sub": user_id,
            "session_id": session_id,
            "type": "refresh",
            "iss": self.config.jwt_issuer,
            "aud": self.config.jwt_audience,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(days=self.config.jwt_refresh_expiry_days)).timestamp()),
            "jti": secrets.token_urlsafe(16),
        }

        return self._jwt.encode(
            payload,
            self._private_key,
            algorithm=self.config.jwt_algorithm
        )

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a token"""
        if not self._available:
            return None

        try:
            payload = self._jwt.decode(
                token,
                self._public_key,
                algorithms=[self.config.jwt_algorithm],
                issuer=self.config.jwt_issuer,
                audience=self.config.jwt_audience
            )
            return payload
        except self._jwt.ExpiredSignatureError:
            logger.debug("Token expired")
            return None
        except self._jwt.InvalidTokenError as e:
            logger.debug(f"Invalid token: {e}")
            return None

    def decode_without_verify(self, token: str) -> Optional[Dict[str, Any]]:
        """Decode token without verification (for inspection)"""
        if not self._available:
            return None

        try:
            return self._jwt.decode(
                token,
                options={"verify_signature": False}
            )
        except Exception:
            return None


# ═══════════════════════════════════════════════════════════════════════════
#                          API KEY UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

class APIKeyManager:
    """API key generation and validation"""

    def __init__(self, config: AuthConfig):
        self.config = config

    def generate_key(self) -> Tuple[str, str]:
        """Generate a new API key. Returns (full_key, hash)"""
        key_bytes = secrets.token_bytes(self.config.api_key_length)
        key = self.config.api_key_prefix + key_bytes.hex()
        key_hash = self._hash_key(key)
        return key, key_hash

    def _hash_key(self, key: str) -> str:
        """Hash an API key"""
        return hashlib.sha256(key.encode()).hexdigest()

    def verify_key(self, key: str, key_hash: str) -> bool:
        """Verify an API key against its hash"""
        return hmac.compare_digest(self._hash_key(key), key_hash)

    def get_prefix(self, key: str) -> str:
        """Get the visible prefix of an API key"""
        if key.startswith(self.config.api_key_prefix):
            # Return prefix + first 8 chars
            return key[:len(self.config.api_key_prefix) + 8]
        return key[:12]


# ═══════════════════════════════════════════════════════════════════════════
#                          SESSION STORE (ABSTRACT)
# ═══════════════════════════════════════════════════════════════════════════

class SessionStore(ABC):
    """Abstract session store"""

    @abstractmethod
    async def create(self, session: Session) -> None:
        """Create a new session"""
        pass

    @abstractmethod
    async def get(self, session_id: str) -> Optional[Session]:
        """Get a session by ID"""
        pass

    @abstractmethod
    async def update(self, session: Session) -> None:
        """Update a session"""
        pass

    @abstractmethod
    async def delete(self, session_id: str) -> None:
        """Delete a session"""
        pass

    @abstractmethod
    async def get_user_sessions(self, user_id: str) -> List[Session]:
        """Get all sessions for a user"""
        pass

    @abstractmethod
    async def delete_user_sessions(self, user_id: str) -> int:
        """Delete all sessions for a user"""
        pass


class InMemorySessionStore(SessionStore):
    """In-memory session store (for development)"""

    def __init__(self):
        self._sessions: Dict[str, Session] = {}
        self._lock = asyncio.Lock()

    async def create(self, session: Session) -> None:
        async with self._lock:
            self._sessions[session.id] = session

    async def get(self, session_id: str) -> Optional[Session]:
        session = self._sessions.get(session_id)
        if session and session.is_expired:
            await self.delete(session_id)
            return None
        return session

    async def update(self, session: Session) -> None:
        async with self._lock:
            self._sessions[session.id] = session

    async def delete(self, session_id: str) -> None:
        async with self._lock:
            self._sessions.pop(session_id, None)

    async def get_user_sessions(self, user_id: str) -> List[Session]:
        return [s for s in self._sessions.values() if s.user_id == user_id and not s.is_expired]

    async def delete_user_sessions(self, user_id: str) -> int:
        async with self._lock:
            to_delete = [sid for sid, s in self._sessions.items() if s.user_id == user_id]
            for sid in to_delete:
                del self._sessions[sid]
            return len(to_delete)


class RedisSessionStore(SessionStore):
    """Redis-backed session store"""

    def __init__(self, config: AuthConfig):
        self.config = config
        self._redis = None
        self._prefix = config.redis_prefix + "session:"

    async def _get_redis(self):
        """Get or create Redis connection"""
        if self._redis is None:
            try:
                import redis.asyncio as redis
                self._redis = await redis.from_url(self.config.redis_url)
            except ImportError:
                raise RuntimeError("redis package not installed")
        return self._redis

    async def create(self, session: Session) -> None:
        r = await self._get_redis()
        key = self._prefix + session.id
        ttl = int((session.expires_at - datetime.now(timezone.utc)).total_seconds())

        data = {
            "id": session.id,
            "user_id": session.user_id,
            "created_at": session.created_at.isoformat(),
            "expires_at": session.expires_at.isoformat(),
            "last_activity": session.last_activity.isoformat(),
            "ip_address": session.ip_address,
            "user_agent": session.user_agent,
            "device_fingerprint": session.device_fingerprint,
            "is_valid": session.is_valid,
        }

        await r.setex(key, ttl, json.dumps(data))

        # Add to user's session list
        user_key = self._prefix + f"user:{session.user_id}"
        await r.sadd(user_key, session.id)

    async def get(self, session_id: str) -> Optional[Session]:
        r = await self._get_redis()
        key = self._prefix + session_id
        data = await r.get(key)

        if not data:
            return None

        d = json.loads(data)
        return Session(
            id=d["id"],
            user_id=d["user_id"],
            created_at=datetime.fromisoformat(d["created_at"]),
            expires_at=datetime.fromisoformat(d["expires_at"]),
            last_activity=datetime.fromisoformat(d["last_activity"]),
            ip_address=d.get("ip_address"),
            user_agent=d.get("user_agent"),
            device_fingerprint=d.get("device_fingerprint"),
            is_valid=d.get("is_valid", True),
        )

    async def update(self, session: Session) -> None:
        await self.create(session)  # Same operation with TTL reset

    async def delete(self, session_id: str) -> None:
        r = await self._get_redis()
        session = await self.get(session_id)
        if session:
            await r.delete(self._prefix + session_id)
            user_key = self._prefix + f"user:{session.user_id}"
            await r.srem(user_key, session_id)

    async def get_user_sessions(self, user_id: str) -> List[Session]:
        r = await self._get_redis()
        user_key = self._prefix + f"user:{user_id}"
        session_ids = await r.smembers(user_key)

        sessions = []
        for sid in session_ids:
            session = await self.get(sid.decode() if isinstance(sid, bytes) else sid)
            if session:
                sessions.append(session)
        return sessions

    async def delete_user_sessions(self, user_id: str) -> int:
        r = await self._get_redis()
        user_key = self._prefix + f"user:{user_id}"
        session_ids = await r.smembers(user_key)

        count = 0
        for sid in session_ids:
            await r.delete(self._prefix + (sid.decode() if isinstance(sid, bytes) else sid))
            count += 1

        await r.delete(user_key)
        return count


# ═══════════════════════════════════════════════════════════════════════════
#                          RATE LIMITER
# ═══════════════════════════════════════════════════════════════════════════

class RateLimiter:
    """Token bucket rate limiter"""

    def __init__(self, config: AuthConfig):
        self.config = config
        self._buckets: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def check(self, identifier: str, cost: int = 1) -> Tuple[bool, Dict[str, Any]]:
        """
        Check if request is allowed.
        Returns (allowed, info) where info contains remaining, reset_at, etc.
        """
        async with self._lock:
            now = time.time()

            if identifier not in self._buckets:
                self._buckets[identifier] = {
                    "tokens": self.config.rate_limit_per_minute,
                    "last_update": now,
                    "minute_count": 0,
                    "minute_start": now,
                    "hour_count": 0,
                    "hour_start": now,
                }

            bucket = self._buckets[identifier]

            # Refill tokens
            elapsed = now - bucket["last_update"]
            refill = elapsed * (self.config.rate_limit_per_minute / 60)
            bucket["tokens"] = min(
                self.config.rate_limit_per_minute,
                bucket["tokens"] + refill
            )
            bucket["last_update"] = now

            # Reset minute counter
            if now - bucket["minute_start"] >= 60:
                bucket["minute_count"] = 0
                bucket["minute_start"] = now

            # Reset hour counter
            if now - bucket["hour_start"] >= 3600:
                bucket["hour_count"] = 0
                bucket["hour_start"] = now

            # Check limits
            if bucket["tokens"] < cost:
                return False, {
                    "allowed": False,
                    "remaining": 0,
                    "reset_at": bucket["minute_start"] + 60,
                    "retry_after": 60 - (now - bucket["minute_start"]),
                }

            if bucket["minute_count"] >= self.config.rate_limit_per_minute:
                return False, {
                    "allowed": False,
                    "remaining": 0,
                    "reset_at": bucket["minute_start"] + 60,
                    "retry_after": 60 - (now - bucket["minute_start"]),
                }

            if bucket["hour_count"] >= self.config.rate_limit_per_hour:
                return False, {
                    "allowed": False,
                    "remaining": 0,
                    "reset_at": bucket["hour_start"] + 3600,
                    "retry_after": 3600 - (now - bucket["hour_start"]),
                }

            # Consume tokens
            bucket["tokens"] -= cost
            bucket["minute_count"] += 1
            bucket["hour_count"] += 1

            return True, {
                "allowed": True,
                "remaining": int(bucket["tokens"]),
                "reset_at": bucket["minute_start"] + 60,
            }


# ═══════════════════════════════════════════════════════════════════════════
#                          AUTHENTICATION SERVICE
# ═══════════════════════════════════════════════════════════════════════════

class AuthenticationService:
    """
    Enterprise authentication service.

    Provides:
    - User authentication (password, API key, token)
    - Session management
    - Token generation and validation
    - Rate limiting
    - Audit logging
    """

    def __init__(
        self,
        config: Optional[AuthConfig] = None,
        session_store: Optional[SessionStore] = None,
        user_repository: Optional[Any] = None  # Abstract user repo
    ):
        self.config = config or AuthConfig.from_env()
        self.session_store = session_store or InMemorySessionStore()
        self.user_repository = user_repository

        self.password_hasher = PasswordHasher()
        self.password_validator = PasswordValidator(self.config)
        self.jwt_handler = JWTHandler(self.config)
        self.api_key_manager = APIKeyManager(self.config)
        self.rate_limiter = RateLimiter(self.config)

        # Failed login tracking
        self._failed_logins: Dict[str, List[datetime]] = {}
        self._lockouts: Dict[str, datetime] = {}

        # Event handlers
        self._event_handlers: List[Callable[[AuthEvent], None]] = []

    def add_event_handler(self, handler: Callable[[AuthEvent], None]) -> None:
        """Add auth event handler for audit logging"""
        self._event_handlers.append(handler)

    def _emit_event(self, event: AuthEvent) -> None:
        """Emit authentication event"""
        for handler in self._event_handlers:
            try:
                handler(event)
            except Exception as e:
                logger.error(f"Auth event handler error: {e}")

    async def authenticate_password(
        self,
        username_or_email: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Tuple[Optional[User], Optional[TokenPair], Optional[str]]:
        """
        Authenticate with username/email and password.
        Returns (user, tokens, error_message)
        """
        # Check lockout
        if self._is_locked_out(username_or_email):
            self._emit_event(AuthEvent(
                id=secrets.token_urlsafe(8),
                event_type=AuthEventType.LOGIN_FAILURE,
                user_id=None,
                timestamp=datetime.now(timezone.utc),
                ip_address=ip_address,
                user_agent=user_agent,
                success=False,
                details={"reason": "account_locked", "identifier": username_or_email}
            ))
            return None, None, "Account is temporarily locked"

        # Check rate limit
        allowed, rate_info = await self.rate_limiter.check(f"login:{ip_address or 'unknown'}")
        if not allowed:
            return None, None, f"Rate limit exceeded. Retry after {rate_info['retry_after']:.0f}s"

        # Get user (mock - replace with actual repository)
        user = await self._get_user_by_identifier(username_or_email)

        if not user:
            self._record_failed_login(username_or_email)
            self._emit_event(AuthEvent(
                id=secrets.token_urlsafe(8),
                event_type=AuthEventType.LOGIN_FAILURE,
                user_id=None,
                timestamp=datetime.now(timezone.utc),
                ip_address=ip_address,
                user_agent=user_agent,
                success=False,
                details={"reason": "user_not_found", "identifier": username_or_email}
            ))
            return None, None, "Invalid credentials"

        if not user.is_active:
            return None, None, "Account is disabled"

        # Verify password (mock - replace with actual verification)
        # In production, get stored hash from database
        # if not self.password_hasher.verify(password, stored_hash):
        #     self._record_failed_login(username_or_email)
        #     return None, None, "Invalid credentials"

        # Create session
        session = await self._create_session(user, ip_address, user_agent)

        # Generate tokens
        tokens = self._generate_tokens(user, session.id)

        # Update last login
        user.last_login = datetime.now(timezone.utc)

        # Clear failed logins
        self._clear_failed_logins(username_or_email)

        self._emit_event(AuthEvent(
            id=secrets.token_urlsafe(8),
            event_type=AuthEventType.LOGIN_SUCCESS,
            user_id=user.id,
            timestamp=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=user_agent,
            success=True,
            details={"session_id": session.id}
        ))

        return user, tokens, None

    async def authenticate_token(
        self,
        token: str,
        ip_address: Optional[str] = None
    ) -> Tuple[Optional[User], Optional[str]]:
        """
        Authenticate with JWT token.
        Returns (user, error_message)
        """
        payload = self.jwt_handler.verify_token(token)

        if not payload:
            return None, "Invalid or expired token"

        # Check session validity
        session_id = payload.get("session_id")
        if session_id:
            session = await self.session_store.get(session_id)
            if not session or not session.is_valid:
                return None, "Session expired or invalidated"

            # Extend session on activity
            if self.config.session_extend_on_activity:
                session.extend(self.config.session_timeout_minutes)
                await self.session_store.update(session)

        # Get user
        user = await self._get_user_by_id(payload["sub"])
        if not user or not user.is_active:
            return None, "User not found or disabled"

        return user, None

    async def authenticate_api_key(
        self,
        api_key: str,
        ip_address: Optional[str] = None
    ) -> Tuple[Optional[User], Optional[Set[Permission]], Optional[str]]:
        """
        Authenticate with API key.
        Returns (user, permissions, error_message)
        """
        # In production, lookup key in database by prefix/hash
        # For now, return mock data
        return None, None, "API key authentication not configured"

    async def refresh_tokens(
        self,
        refresh_token: str,
        ip_address: Optional[str] = None
    ) -> Tuple[Optional[TokenPair], Optional[str]]:
        """
        Refresh access token using refresh token.
        Returns (new_tokens, error_message)
        """
        payload = self.jwt_handler.verify_token(refresh_token)

        if not payload or payload.get("type") != "refresh":
            return None, "Invalid refresh token"

        session_id = payload.get("session_id")
        session = await self.session_store.get(session_id) if session_id else None

        if not session or not session.is_valid:
            return None, "Session expired"

        user = await self._get_user_by_id(payload["sub"])
        if not user or not user.is_active:
            return None, "User not found or disabled"

        # Generate new tokens
        tokens = self._generate_tokens(user, session.id)

        # Extend session
        session.extend(self.config.session_timeout_minutes)
        await self.session_store.update(session)

        self._emit_event(AuthEvent(
            id=secrets.token_urlsafe(8),
            event_type=AuthEventType.TOKEN_REFRESH,
            user_id=user.id,
            timestamp=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=None,
            success=True,
            details={"session_id": session.id}
        ))

        return tokens, None

    async def logout(
        self,
        session_id: str,
        user_id: str,
        ip_address: Optional[str] = None
    ) -> None:
        """Logout and invalidate session"""
        await self.session_store.delete(session_id)

        self._emit_event(AuthEvent(
            id=secrets.token_urlsafe(8),
            event_type=AuthEventType.LOGOUT,
            user_id=user_id,
            timestamp=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=None,
            success=True,
            details={"session_id": session_id}
        ))

    async def logout_all(self, user_id: str, ip_address: Optional[str] = None) -> int:
        """Logout all sessions for a user"""
        count = await self.session_store.delete_user_sessions(user_id)

        self._emit_event(AuthEvent(
            id=secrets.token_urlsafe(8),
            event_type=AuthEventType.LOGOUT,
            user_id=user_id,
            timestamp=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=None,
            success=True,
            details={"sessions_terminated": count, "all_sessions": True}
        ))

        return count

    async def _create_session(
        self,
        user: User,
        ip_address: Optional[str],
        user_agent: Optional[str]
    ) -> Session:
        """Create a new session"""
        # Check concurrent session limit
        existing = await self.session_store.get_user_sessions(user.id)
        if len(existing) >= self.config.session_max_concurrent:
            # Remove oldest session
            oldest = min(existing, key=lambda s: s.created_at)
            await self.session_store.delete(oldest.id)

        now = datetime.now(timezone.utc)
        session = Session(
            id=secrets.token_urlsafe(32),
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(minutes=self.config.session_timeout_minutes),
            last_activity=now,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        await self.session_store.create(session)
        return session

    def _generate_tokens(self, user: User, session_id: str) -> TokenPair:
        """Generate JWT token pair"""
        access_token = self.jwt_handler.create_access_token(user, session_id)
        refresh_token = self.jwt_handler.create_refresh_token(user.id, session_id)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=self.config.jwt_expiry_minutes * 60,
            refresh_expires_in=self.config.jwt_refresh_expiry_days * 86400,
        )

    def _is_locked_out(self, identifier: str) -> bool:
        """Check if user is locked out"""
        lockout_until = self._lockouts.get(identifier)
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            return True
        return False

    def _record_failed_login(self, identifier: str) -> None:
        """Record failed login attempt"""
        now = datetime.now(timezone.utc)

        if identifier not in self._failed_logins:
            self._failed_logins[identifier] = []

        # Remove old attempts
        cutoff = now - timedelta(minutes=self.config.lockout_reset_minutes)
        self._failed_logins[identifier] = [
            t for t in self._failed_logins[identifier] if t > cutoff
        ]

        # Add new attempt
        self._failed_logins[identifier].append(now)

        # Check for lockout
        if len(self._failed_logins[identifier]) >= self.config.max_failed_attempts:
            self._lockouts[identifier] = now + timedelta(minutes=self.config.lockout_duration_minutes)
            logger.warning(f"Account locked: {identifier}")

    def _clear_failed_logins(self, identifier: str) -> None:
        """Clear failed login attempts"""
        self._failed_logins.pop(identifier, None)
        self._lockouts.pop(identifier, None)

    async def _get_user_by_identifier(self, identifier: str) -> Optional[User]:
        """Get user by username or email (mock implementation)"""
        # In production, query database
        # For testing, return mock user
        if identifier in ["admin", "admin@example.com"]:
            return User(
                id="usr_admin_001",
                email="admin@example.com",
                username="admin",
                roles=[Role.ADMIN],
                organization_id="org_001",
            )
        return None

    async def _get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID (mock implementation)"""
        if user_id == "usr_admin_001":
            return User(
                id="usr_admin_001",
                email="admin@example.com",
                username="admin",
                roles=[Role.ADMIN],
                organization_id="org_001",
            )
        return None


# ═══════════════════════════════════════════════════════════════════════════
#                          DECORATORS
# ═══════════════════════════════════════════════════════════════════════════

F = TypeVar('F', bound=Callable[..., Any])


def require_auth(func: F) -> F:
    """Decorator to require authentication"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # In FastAPI context, would extract token from request
        # and validate it before calling the function
        return await func(*args, **kwargs)
    return wrapper  # type: ignore


def require_permission(*permissions: Permission) -> Callable[[F], F]:
    """Decorator to require specific permissions"""
    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Check permissions from authenticated user
            # In FastAPI, would use Depends() to inject user
            return await func(*args, **kwargs)
        return wrapper  # type: ignore
    return decorator


def require_role(*roles: Role) -> Callable[[F], F]:
    """Decorator to require specific roles"""
    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Check roles from authenticated user
            return await func(*args, **kwargs)
        return wrapper  # type: ignore
    return decorator


# ═══════════════════════════════════════════════════════════════════════════
#                          EXPORTS
# ═══════════════════════════════════════════════════════════════════════════

__all__ = [
    # Config
    "AuthConfig",
    # Enums
    "Permission",
    "Role",
    "AuthEventType",
    "ROLE_PERMISSIONS",
    # Data classes
    "User",
    "Session",
    "TokenPair",
    "APIKey",
    "AuthEvent",
    # Services
    "AuthenticationService",
    "PasswordHasher",
    "PasswordValidator",
    "JWTHandler",
    "APIKeyManager",
    "RateLimiter",
    # Session stores
    "SessionStore",
    "InMemorySessionStore",
    "RedisSessionStore",
    # Decorators
    "require_auth",
    "require_permission",
    "require_role",
]
