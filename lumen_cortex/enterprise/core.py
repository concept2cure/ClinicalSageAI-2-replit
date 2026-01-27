"""
═══════════════════════════════════════════════════════════════════════════════
                    ENTERPRISE ARCHITECTURE CORE
═══════════════════════════════════════════════════════════════════════════════

Event-driven architecture with resilience patterns for regulatory AI.

PATTERNS IMPLEMENTED:
- Async Event Bus for decoupled components
- Circuit Breakers for LLM API resilience
- Audit Event Decorators for automatic trail generation
- Dependency Injection through compliance context

@module lumen_cortex.enterprise.core
"""

from __future__ import annotations

import hashlib
import asyncio
import logging
from datetime import datetime
from typing import (
    Dict, Any, List, Callable, Coroutine, TypeVar,
    Optional, Generic
)
from dataclasses import dataclass, field
from collections import defaultdict
from functools import wraps
from enum import Enum, auto

# Configure logging
logger = logging.getLogger("LumenCortex.Core")

T = TypeVar('T')
EventHandler = Callable[[Any], Coroutine[Any, Any, None]]


# ═══════════════════════════════════════════════════════════════════════════
#                          EVENT BUS
# ═══════════════════════════════════════════════════════════════════════════

class EventPriority(Enum):
    """Event processing priority levels"""
    CRITICAL = auto()
    HIGH = auto()
    NORMAL = auto()
    LOW = auto()


@dataclass
class Event:
    """Structured event with metadata"""
    event_id: str
    event_type: str
    payload: Any
    timestamp: datetime
    priority: EventPriority = EventPriority.NORMAL
    correlation_id: Optional[str] = None
    source_service: str = "unknown"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
            "priority": self.priority.name,
            "correlation_id": self.correlation_id,
            "source_service": self.source_service,
        }


class EventBus:
    """
    Enterprise Event Bus for decoupled architecture.

    Features:
    - Async event dispatch with priority ordering
    - Event sourcing with persistent store
    - Dead letter queue for failed handlers
    - Correlation ID tracking for distributed tracing
    """

    def __init__(self, max_store_size: int = 10000):
        self._handlers: Dict[str, List[tuple[EventPriority, EventHandler]]] = defaultdict(list)
        self._event_store: List[Event] = []
        self._dead_letter_queue: List[tuple[Event, Exception]] = []
        self._max_store_size = max_store_size
        self._correlation_context: Optional[str] = None
        self._lock = asyncio.Lock()

    def subscribe(
        self,
        event_type: str,
        handler: EventHandler,
        priority: EventPriority = EventPriority.NORMAL
    ) -> None:
        """Subscribe handler to event type with priority"""
        self._handlers[event_type].append((priority, handler))
        # Sort by priority (CRITICAL first)
        self._handlers[event_type].sort(key=lambda x: x[0].value)
        logger.debug(f"Handler subscribed to {event_type} with priority {priority.name}")

    def unsubscribe(self, event_type: str, handler: EventHandler) -> bool:
        """Remove handler from event type"""
        for i, (_, h) in enumerate(self._handlers[event_type]):
            if h == handler:
                self._handlers[event_type].pop(i)
                return True
        return False

    def set_correlation_context(self, correlation_id: str) -> None:
        """Set correlation ID for distributed tracing"""
        self._correlation_context = correlation_id

    def clear_correlation_context(self) -> None:
        """Clear correlation context"""
        self._correlation_context = None

    async def publish(
        self,
        event_type: str,
        payload: Any,
        priority: EventPriority = EventPriority.NORMAL,
        source_service: str = "unknown"
    ) -> str:
        """
        Publish event to all subscribers.

        Returns:
            Event ID for tracking
        """
        event = Event(
            event_id=hashlib.sha256(
                f"{event_type}{payload}{datetime.utcnow().isoformat()}".encode()
            ).hexdigest()[:16],
            event_type=event_type,
            payload=payload,
            timestamp=datetime.utcnow(),
            priority=priority,
            correlation_id=self._correlation_context,
            source_service=source_service,
        )

        # Store event (with size limit)
        async with self._lock:
            self._event_store.append(event)
            if len(self._event_store) > self._max_store_size:
                self._event_store = self._event_store[-self._max_store_size:]

        # Dispatch to handlers
        if event_type in self._handlers:
            tasks = []
            for _, handler in self._handlers[event_type]:
                tasks.append(self._safe_dispatch(event, handler))
            await asyncio.gather(*tasks)

        logger.debug(f"Published event {event.event_id} of type {event_type}")
        return event.event_id

    async def _safe_dispatch(self, event: Event, handler: EventHandler) -> None:
        """Dispatch with error handling and dead letter queue"""
        try:
            await asyncio.wait_for(handler(event.payload), timeout=30.0)
        except asyncio.TimeoutError:
            logger.error(f"Handler timeout for event {event.event_id}")
            self._dead_letter_queue.append((event, TimeoutError("Handler timeout")))
        except Exception as e:
            logger.error(f"Handler error for event {event.event_id}: {e}")
            self._dead_letter_queue.append((event, e))

    def get_events(
        self,
        event_type: Optional[str] = None,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Event]:
        """Query event store with filters"""
        events = self._event_store

        if event_type:
            events = [e for e in events if e.event_type == event_type]

        if since:
            events = [e for e in events if e.timestamp >= since]

        return events[-limit:]

    def get_dead_letters(self, limit: int = 100) -> List[tuple[Event, Exception]]:
        """Get failed events from dead letter queue"""
        return self._dead_letter_queue[-limit:]

    async def replay_dead_letter(self, event_id: str) -> bool:
        """Replay a failed event"""
        for i, (event, _) in enumerate(self._dead_letter_queue):
            if event.event_id == event_id:
                self._dead_letter_queue.pop(i)
                await self.publish(
                    event.event_type,
                    event.payload,
                    event.priority,
                    event.source_service
                )
                return True
        return False


# Global event bus singleton
event_bus = EventBus()


# ═══════════════════════════════════════════════════════════════════════════
#                          CIRCUIT BREAKER
# ═══════════════════════════════════════════════════════════════════════════

class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class CircuitBreakerMetrics:
    """Metrics for circuit breaker monitoring"""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    last_failure_time: Optional[datetime] = None
    last_success_time: Optional[datetime] = None
    state_changes: List[tuple[datetime, CircuitState]] = field(default_factory=list)


class CircuitBreaker:
    """
    Circuit Breaker pattern for LLM API resilience.

    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: After threshold failures, requests rejected immediately
    - HALF_OPEN: After timeout, allow test request

    Features:
    - Configurable failure threshold and timeout
    - Exponential backoff support
    - Metrics collection
    - Health check integration
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        timeout_seconds: int = 60,
        half_open_max_calls: int = 3,
        exponential_backoff: bool = True
    ):
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.half_open_max_calls = half_open_max_calls
        self.exponential_backoff = exponential_backoff

        self.failure_count = 0
        self.half_open_calls = 0
        self.last_failure_time: Optional[datetime] = None
        self.state = CircuitState.CLOSED
        self.current_timeout = timeout_seconds

        self.metrics = CircuitBreakerMetrics()
        self._lock = asyncio.Lock()

    @property
    def is_available(self) -> bool:
        """Check if circuit allows requests"""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            # Check if timeout has passed
            if self.last_failure_time:
                elapsed = (datetime.utcnow() - self.last_failure_time).total_seconds()
                if elapsed >= self.current_timeout:
                    return True  # Will transition to HALF_OPEN
            return False

        # HALF_OPEN: allow limited calls
        return self.half_open_calls < self.half_open_max_calls

    async def call(
        self,
        func: Callable[..., Coroutine[Any, Any, T]],
        *args,
        **kwargs
    ) -> T:
        """Execute function through circuit breaker"""
        async with self._lock:
            self.metrics.total_calls += 1

            if not self.is_available:
                self.metrics.rejected_calls += 1
                raise CircuitBreakerOpenError(
                    f"Circuit breaker is {self.state.value}, "
                    f"retry after {self.current_timeout}s"
                )

            # Transition from OPEN to HALF_OPEN if timeout passed
            if self.state == CircuitState.OPEN:
                self._transition_to(CircuitState.HALF_OPEN)
                self.half_open_calls = 0

        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as e:
            await self._on_failure(e)
            raise

    def call_sync(self, func: Callable[..., T], *args, **kwargs) -> T:
        """Synchronous call through circuit breaker"""
        self.metrics.total_calls += 1

        if not self.is_available:
            self.metrics.rejected_calls += 1
            raise CircuitBreakerOpenError(
                f"Circuit breaker is {self.state.value}"
            )

        if self.state == CircuitState.OPEN:
            self._transition_to(CircuitState.HALF_OPEN)
            self.half_open_calls = 0

        try:
            result = func(*args, **kwargs)
            self._on_success_sync()
            return result
        except Exception as e:
            self._on_failure_sync(e)
            raise

    async def _on_success(self) -> None:
        """Handle successful call"""
        async with self._lock:
            self.metrics.successful_calls += 1
            self.metrics.last_success_time = datetime.utcnow()

            if self.state == CircuitState.HALF_OPEN:
                self.half_open_calls += 1
                if self.half_open_calls >= self.half_open_max_calls:
                    self._transition_to(CircuitState.CLOSED)
                    self.failure_count = 0
                    self.current_timeout = self.timeout_seconds  # Reset timeout
            else:
                self.failure_count = max(0, self.failure_count - 1)

    def _on_success_sync(self) -> None:
        """Synchronous success handler"""
        self.metrics.successful_calls += 1
        self.metrics.last_success_time = datetime.utcnow()

        if self.state == CircuitState.HALF_OPEN:
            self._transition_to(CircuitState.CLOSED)
            self.failure_count = 0
            self.current_timeout = self.timeout_seconds

    async def _on_failure(self, error: Exception) -> None:
        """Handle failed call"""
        async with self._lock:
            self.metrics.failed_calls += 1
            self.metrics.last_failure_time = datetime.utcnow()
            self.failure_count += 1
            self.last_failure_time = datetime.utcnow()

            if self.state == CircuitState.HALF_OPEN:
                self._transition_to(CircuitState.OPEN)
                if self.exponential_backoff:
                    self.current_timeout = min(self.current_timeout * 2, 300)
            elif self.failure_count >= self.failure_threshold:
                self._transition_to(CircuitState.OPEN)

            logger.warning(
                f"Circuit breaker failure {self.failure_count}/{self.failure_threshold}: {error}"
            )

    def _on_failure_sync(self, error: Exception) -> None:
        """Synchronous failure handler"""
        self.metrics.failed_calls += 1
        self.metrics.last_failure_time = datetime.utcnow()
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()

        if self.failure_count >= self.failure_threshold:
            self._transition_to(CircuitState.OPEN)

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to new state with logging"""
        old_state = self.state
        self.state = new_state
        self.metrics.state_changes.append((datetime.utcnow(), new_state))
        logger.info(f"Circuit breaker: {old_state.value} -> {new_state.value}")

    def reset(self) -> None:
        """Manual reset of circuit breaker"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.half_open_calls = 0
        self.current_timeout = self.timeout_seconds
        logger.info("Circuit breaker manually reset")

    def get_health(self) -> Dict[str, Any]:
        """Get circuit breaker health status"""
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "threshold": self.failure_threshold,
            "timeout_seconds": self.current_timeout,
            "is_available": self.is_available,
            "metrics": {
                "total_calls": self.metrics.total_calls,
                "successful_calls": self.metrics.successful_calls,
                "failed_calls": self.metrics.failed_calls,
                "rejected_calls": self.metrics.rejected_calls,
                "success_rate": (
                    self.metrics.successful_calls / self.metrics.total_calls
                    if self.metrics.total_calls > 0 else 0
                ),
            }
        }


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker rejects a request"""
    pass


# ═══════════════════════════════════════════════════════════════════════════
#                          AUDIT DECORATORS
# ═══════════════════════════════════════════════════════════════════════════

def audit_event(entity_type: str, action: str, include_result: bool = False):
    """
    Decorator for automatic audit trail generation.

    Args:
        entity_type: Type of entity being audited (e.g., "table", "citation")
        action: Action being performed (e.g., "extract", "validate")
        include_result: Whether to include function result in audit

    Usage:
        @audit_event("table", "extract")
        async def extract_table(self, pdf_path: str, user_id: str): ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> T:
            start_time = datetime.utcnow()
            error_occurred = None
            result = None

            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                error_occurred = str(e)
                raise
            finally:
                # Build audit payload
                audit_payload = {
                    "entity_type": entity_type,
                    "action": action,
                    "user_id": kwargs.get('user_id', kwargs.get('context', {}).get('user_id', 'system')),
                    "timestamp": start_time.isoformat(),
                    "duration_ms": (datetime.utcnow() - start_time).total_seconds() * 1000,
                    "success": error_occurred is None,
                    "error": error_occurred,
                    "function": func.__name__,
                    "args_hash": hashlib.sha256(str(args[1:]).encode()).hexdigest()[:16] if len(args) > 1 else None,
                }

                if include_result and result is not None:
                    audit_payload["result_hash"] = hashlib.sha256(
                        str(result).encode()
                    ).hexdigest()[:32]

                await event_bus.publish(
                    "audit",
                    audit_payload,
                    priority=EventPriority.HIGH,
                    source_service=entity_type
                )

        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> T:
            start_time = datetime.utcnow()
            error_occurred = None
            result = None

            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                error_occurred = str(e)
                raise
            finally:
                # For sync functions, we can't await, so we schedule the event
                audit_payload = {
                    "entity_type": entity_type,
                    "action": action,
                    "user_id": kwargs.get('user_id', 'system'),
                    "timestamp": start_time.isoformat(),
                    "duration_ms": (datetime.utcnow() - start_time).total_seconds() * 1000,
                    "success": error_occurred is None,
                    "error": error_occurred,
                    "function": func.__name__,
                }

                # Try to schedule async publish
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(event_bus.publish("audit", audit_payload))
                except RuntimeError:
                    pass  # No event loop available

        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# ═══════════════════════════════════════════════════════════════════════════
#                          RETRY UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

async def retry_with_backoff(
    func: Callable[..., Coroutine[Any, Any, T]],
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential: bool = True,
    **kwargs
) -> T:
    """
    Retry async function with exponential backoff.

    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay between retries
        max_delay: Maximum delay cap
        exponential: Use exponential backoff (vs linear)
    """
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt if exponential else attempt + 1)
                delay = min(delay, max_delay)
                logger.warning(
                    f"Retry {attempt + 1}/{max_retries} after {delay}s: {e}"
                )
                await asyncio.sleep(delay)

    raise last_error


# ═══════════════════════════════════════════════════════════════════════════
#                          HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════

class HealthStatus(Enum):
    """Service health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class ServiceHealth:
    """Health check result"""
    service_name: str
    status: HealthStatus
    message: str
    timestamp: datetime
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "service": self.service_name,
            "status": self.status.value,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "details": self.details,
        }


class HealthCheckRegistry:
    """Registry for service health checks"""

    def __init__(self):
        self._checks: Dict[str, Callable[[], Coroutine[Any, Any, ServiceHealth]]] = {}

    def register(self, name: str, check: Callable[[], Coroutine[Any, Any, ServiceHealth]]) -> None:
        """Register a health check"""
        self._checks[name] = check

    async def check_all(self) -> Dict[str, ServiceHealth]:
        """Run all health checks"""
        results = {}
        for name, check in self._checks.items():
            try:
                results[name] = await asyncio.wait_for(check(), timeout=5.0)
            except asyncio.TimeoutError:
                results[name] = ServiceHealth(
                    service_name=name,
                    status=HealthStatus.UNHEALTHY,
                    message="Health check timeout",
                    timestamp=datetime.utcnow()
                )
            except Exception as e:
                results[name] = ServiceHealth(
                    service_name=name,
                    status=HealthStatus.UNHEALTHY,
                    message=str(e),
                    timestamp=datetime.utcnow()
                )
        return results

    def get_overall_status(self, results: Dict[str, ServiceHealth]) -> HealthStatus:
        """Determine overall system health"""
        statuses = [r.status for r in results.values()]

        if all(s == HealthStatus.HEALTHY for s in statuses):
            return HealthStatus.HEALTHY
        elif any(s == HealthStatus.UNHEALTHY for s in statuses):
            return HealthStatus.UNHEALTHY
        return HealthStatus.DEGRADED


# Global health registry
health_registry = HealthCheckRegistry()
