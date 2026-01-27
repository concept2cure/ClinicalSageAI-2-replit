"""
═══════════════════════════════════════════════════════════════════════════════
                  LUMEN CORTEX - PROMETHEUS METRICS EXPORTER
═══════════════════════════════════════════════════════════════════════════════

Enterprise metrics collection and Prometheus export for monitoring.

METRICS CATEGORIES:
1. System Metrics - CPU, memory, disk, network
2. Application Metrics - Requests, latency, errors
3. Database Metrics - Connection pools, query times
4. Cache Metrics - Hit rates, evictions
5. AI/ML Metrics - Embeddings, inference times
6. Business Metrics - Documents processed, compliance checks

EXPORT FORMATS:
- Prometheus text exposition
- JSON endpoint
- StatsD
- OpenTelemetry

@module lumen_cortex.enterprise.metrics
@version 2.0.0
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
import re
import threading
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import (
    Any, Callable, Dict, Generator, List, Optional,
    Set, Tuple, TypeVar, Union
)

logger = logging.getLogger("LumenCortex.Metrics")

T = TypeVar('T')


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class MetricType(Enum):
    """Metric types"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class MetricsConfig:
    """Metrics configuration"""

    # Export settings
    enabled: bool = True
    prefix: str = "lumen_cortex"

    # Prometheus
    prometheus_enabled: bool = True
    prometheus_port: int = 9090
    prometheus_path: str = "/metrics"

    # StatsD
    statsd_enabled: bool = False
    statsd_host: str = "localhost"
    statsd_port: int = 8125
    statsd_prefix: str = "lumen_cortex"

    # Push gateway
    push_gateway_enabled: bool = False
    push_gateway_url: str = ""
    push_interval: float = 15.0

    # Histogram buckets
    request_buckets: List[float] = field(default_factory=lambda: [
        0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0
    ])

    embedding_buckets: List[float] = field(default_factory=lambda: [
        0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0
    ])

    # Labels
    default_labels: Dict[str, str] = field(default_factory=lambda: {
        "service": "lumen_cortex",
        "environment": os.getenv("ENVIRONMENT", "development"),
    })

    @classmethod
    def from_env(cls) -> "MetricsConfig":
        """Create config from environment"""
        return cls(
            enabled=os.getenv("METRICS_ENABLED", "true").lower() == "true",
            prefix=os.getenv("METRICS_PREFIX", "lumen_cortex"),
            prometheus_port=int(os.getenv("PROMETHEUS_PORT", "9090")),
            statsd_enabled=os.getenv("STATSD_ENABLED", "false").lower() == "true",
            statsd_host=os.getenv("STATSD_HOST", "localhost"),
            statsd_port=int(os.getenv("STATSD_PORT", "8125")),
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          METRIC VALUES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class MetricValue:
    """Base metric value"""
    name: str
    help: str
    type: MetricType = field(default=MetricType.COUNTER)
    labels: Dict[str, str] = field(default_factory=dict)
    timestamp: Optional[float] = None


@dataclass
class CounterValue(MetricValue):
    """Counter metric"""
    value: float = 0.0
    type: MetricType = field(default=MetricType.COUNTER)


@dataclass
class GaugeValue(MetricValue):
    """Gauge metric"""
    value: float = 0.0
    type: MetricType = field(default=MetricType.GAUGE)


@dataclass
class HistogramValue(MetricValue):
    """Histogram metric"""
    buckets: List[float] = field(default_factory=list)
    bucket_counts: List[int] = field(default_factory=list)
    sum: float = 0.0
    count: int = 0
    type: MetricType = field(default=MetricType.HISTOGRAM)

    def __post_init__(self):
        if not self.bucket_counts and self.buckets:
            self.bucket_counts = [0] * len(self.buckets)


@dataclass
class SummaryValue(MetricValue):
    """Summary metric"""
    quantiles: Dict[float, float] = field(default_factory=dict)
    sum: float = 0.0
    count: int = 0
    type: MetricType = field(default=MetricType.SUMMARY)


# ═══════════════════════════════════════════════════════════════════════════
#                          METRIC CLASSES
# ═══════════════════════════════════════════════════════════════════════════

class Metric(ABC):
    """Abstract metric base class"""

    def __init__(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        registry: Optional["MetricRegistry"] = None
    ):
        self.name = name
        self.help = help_text
        self.label_names = labels or []
        self._lock = threading.Lock()

        # Register with registry
        if registry:
            registry.register(self)

    @abstractmethod
    def collect(self) -> List[MetricValue]:
        """Collect metric values"""
        pass

    def _make_key(self, labels: Dict[str, str]) -> str:
        """Make label key"""
        parts = [f"{k}={v}" for k, v in sorted(labels.items())]
        return "|".join(parts)


class Counter(Metric):
    """
    Counter metric - monotonically increasing.

    Usage:
        requests_total = Counter("requests_total", "Total requests", ["method", "path"])
        requests_total.inc(labels={"method": "GET", "path": "/api/v1/documents"})
    """

    def __init__(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        registry: Optional["MetricRegistry"] = None
    ):
        super().__init__(name, help_text, labels, registry)
        self._values: Dict[str, float] = defaultdict(float)

    def inc(self, value: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment counter"""
        if value < 0:
            raise ValueError("Counter can only increase")

        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            self._values[key] += value

    def labels(self, **kwargs) -> "CounterChild":
        """Return child with labels"""
        return CounterChild(self, kwargs)

    def collect(self) -> List[MetricValue]:
        """Collect counter values"""
        with self._lock:
            return [
                CounterValue(
                    name=self.name,
                    help=self.help,
                    labels=self._parse_key(key),
                    value=value
                )
                for key, value in self._values.items()
            ]

    def _parse_key(self, key: str) -> Dict[str, str]:
        """Parse label key back to dict"""
        if not key:
            return {}
        parts = key.split("|")
        return dict(p.split("=") for p in parts)


class CounterChild:
    """Counter with bound labels"""

    def __init__(self, counter: Counter, labels: Dict[str, str]):
        self._counter = counter
        self._labels = labels

    def inc(self, value: float = 1.0) -> None:
        self._counter.inc(value, self._labels)


class Gauge(Metric):
    """
    Gauge metric - can increase or decrease.

    Usage:
        active_connections = Gauge("active_connections", "Current connections", ["pool"])
        active_connections.set(10, labels={"pool": "postgres"})
    """

    def __init__(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        registry: Optional["MetricRegistry"] = None
    ):
        super().__init__(name, help_text, labels, registry)
        self._values: Dict[str, float] = defaultdict(float)

    def inc(self, value: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment gauge"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            self._values[key] += value

    def dec(self, value: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Decrement gauge"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            self._values[key] -= value

    def set(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Set gauge value"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            self._values[key] = value

    def labels(self, **kwargs) -> "GaugeChild":
        """Return child with labels"""
        return GaugeChild(self, kwargs)

    @contextmanager
    def track_inprogress(self, labels: Optional[Dict[str, str]] = None):
        """Track in-progress operations"""
        self.inc(labels=labels)
        try:
            yield
        finally:
            self.dec(labels=labels)

    def collect(self) -> List[MetricValue]:
        """Collect gauge values"""
        with self._lock:
            return [
                GaugeValue(
                    name=self.name,
                    help=self.help,
                    labels=self._parse_key(key),
                    value=value
                )
                for key, value in self._values.items()
            ]

    def _parse_key(self, key: str) -> Dict[str, str]:
        if not key:
            return {}
        parts = key.split("|")
        return dict(p.split("=") for p in parts)


class GaugeChild:
    """Gauge with bound labels"""

    def __init__(self, gauge: Gauge, labels: Dict[str, str]):
        self._gauge = gauge
        self._labels = labels

    def inc(self, value: float = 1.0) -> None:
        self._gauge.inc(value, self._labels)

    def dec(self, value: float = 1.0) -> None:
        self._gauge.dec(value, self._labels)

    def set(self, value: float) -> None:
        self._gauge.set(value, self._labels)


class Histogram(Metric):
    """
    Histogram metric - observe value distributions.

    Usage:
        request_latency = Histogram(
            "request_latency_seconds",
            "Request latency",
            ["method", "path"],
            buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
        )
        request_latency.observe(0.123, labels={"method": "GET", "path": "/api"})
    """

    def __init__(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        buckets: Optional[List[float]] = None,
        registry: Optional["MetricRegistry"] = None
    ):
        super().__init__(name, help_text, labels, registry)
        self.buckets = sorted(buckets or [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0])
        self._values: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"buckets": [0] * len(self.buckets), "sum": 0.0, "count": 0}
        )

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Record an observation"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            data = self._values[key]
            data["sum"] += value
            data["count"] += 1

            # Update bucket counts
            for i, bucket in enumerate(self.buckets):
                if value <= bucket:
                    data["buckets"][i] += 1

    def labels(self, **kwargs) -> "HistogramChild":
        """Return child with labels"""
        return HistogramChild(self, kwargs)

    @contextmanager
    def time(self, labels: Optional[Dict[str, str]] = None):
        """Time a block of code"""
        start = time.perf_counter()
        try:
            yield
        finally:
            self.observe(time.perf_counter() - start, labels)

    def collect(self) -> List[MetricValue]:
        """Collect histogram values"""
        with self._lock:
            return [
                HistogramValue(
                    name=self.name,
                    help=self.help,
                    labels=self._parse_key(key),
                    buckets=self.buckets,
                    bucket_counts=data["buckets"].copy(),
                    sum=data["sum"],
                    count=data["count"]
                )
                for key, data in self._values.items()
            ]

    def _parse_key(self, key: str) -> Dict[str, str]:
        if not key:
            return {}
        parts = key.split("|")
        return dict(p.split("=") for p in parts)


class HistogramChild:
    """Histogram with bound labels"""

    def __init__(self, histogram: Histogram, labels: Dict[str, str]):
        self._histogram = histogram
        self._labels = labels

    def observe(self, value: float) -> None:
        self._histogram.observe(value, self._labels)

    @contextmanager
    def time(self):
        start = time.perf_counter()
        try:
            yield
        finally:
            self.observe(time.perf_counter() - start)


class Summary(Metric):
    """
    Summary metric - calculate quantiles.

    Usage:
        response_size = Summary("response_size_bytes", "Response size", ["endpoint"])
        response_size.observe(1024, labels={"endpoint": "/api/v1/documents"})
    """

    def __init__(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        quantiles: Optional[List[float]] = None,
        max_age: float = 600.0,
        registry: Optional["MetricRegistry"] = None
    ):
        super().__init__(name, help_text, labels, registry)
        self.quantiles = quantiles or [0.5, 0.9, 0.99]
        self.max_age = max_age
        self._values: Dict[str, List[Tuple[float, float]]] = defaultdict(list)

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Record an observation"""
        labels = labels or {}
        key = self._make_key(labels)
        now = time.time()

        with self._lock:
            self._values[key].append((now, value))

            # Clean old observations
            cutoff = now - self.max_age
            self._values[key] = [(t, v) for t, v in self._values[key] if t > cutoff]

    def collect(self) -> List[MetricValue]:
        """Collect summary values"""
        with self._lock:
            results = []

            for key, observations in self._values.items():
                if not observations:
                    continue

                values = [v for _, v in observations]
                values.sort()

                quantile_values = {}
                for q in self.quantiles:
                    idx = int(len(values) * q)
                    quantile_values[q] = values[min(idx, len(values) - 1)]

                results.append(SummaryValue(
                    name=self.name,
                    help=self.help,
                    labels=self._parse_key(key),
                    quantiles=quantile_values,
                    sum=sum(values),
                    count=len(values)
                ))

            return results

    def _parse_key(self, key: str) -> Dict[str, str]:
        if not key:
            return {}
        parts = key.split("|")
        return dict(p.split("=") for p in parts)


# ═══════════════════════════════════════════════════════════════════════════
#                          METRIC REGISTRY
# ═══════════════════════════════════════════════════════════════════════════

class MetricRegistry:
    """
    Central registry for all metrics.
    """

    def __init__(self, config: Optional[MetricsConfig] = None):
        self.config = config or MetricsConfig.from_env()
        self._metrics: Dict[str, Metric] = {}
        self._lock = threading.Lock()

    def register(self, metric: Metric) -> None:
        """Register a metric"""
        name = self._prefix_name(metric.name)

        with self._lock:
            if name in self._metrics:
                raise ValueError(f"Metric {name} already registered")
            self._metrics[name] = metric

    def unregister(self, name: str) -> None:
        """Unregister a metric"""
        name = self._prefix_name(name)

        with self._lock:
            self._metrics.pop(name, None)

    def get(self, name: str) -> Optional[Metric]:
        """Get a metric by name"""
        name = self._prefix_name(name)
        return self._metrics.get(name)

    def _prefix_name(self, name: str) -> str:
        """Add prefix to metric name"""
        if self.config.prefix and not name.startswith(self.config.prefix):
            return f"{self.config.prefix}_{name}"
        return name

    def collect(self) -> List[MetricValue]:
        """Collect all metrics"""
        results = []

        with self._lock:
            for metric in self._metrics.values():
                try:
                    values = metric.collect()
                    results.extend(values)
                except Exception as e:
                    logger.error(f"Error collecting metric: {e}")

        return results

    def counter(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None
    ) -> Counter:
        """Create and register a counter"""
        return Counter(name, help_text, labels, self)

    def gauge(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None
    ) -> Gauge:
        """Create and register a gauge"""
        return Gauge(name, help_text, labels, self)

    def histogram(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        buckets: Optional[List[float]] = None
    ) -> Histogram:
        """Create and register a histogram"""
        return Histogram(name, help_text, labels, buckets, self)

    def summary(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        quantiles: Optional[List[float]] = None
    ) -> Summary:
        """Create and register a summary"""
        return Summary(name, help_text, labels, quantiles, registry=self)


# ═══════════════════════════════════════════════════════════════════════════
#                          PROMETHEUS EXPORTER
# ═══════════════════════════════════════════════════════════════════════════

class PrometheusExporter:
    """
    Export metrics in Prometheus text exposition format.
    """

    def __init__(self, registry: MetricRegistry):
        self.registry = registry

    def export(self) -> str:
        """Export all metrics as Prometheus text"""
        lines = []
        metrics = self.registry.collect()

        # Group by metric name
        by_name: Dict[str, List[MetricValue]] = defaultdict(list)
        for metric in metrics:
            by_name[metric.name].append(metric)

        for name, values in by_name.items():
            if not values:
                continue

            first = values[0]

            # HELP line
            lines.append(f"# HELP {name} {first.help}")

            # TYPE line
            lines.append(f"# TYPE {name} {first.type.value}")

            # Value lines
            for value in values:
                lines.extend(self._format_value(value))

        return "\n".join(lines) + "\n"

    def _format_value(self, value: MetricValue) -> List[str]:
        """Format a single metric value"""
        lines = []
        labels_str = self._format_labels(value.labels)

        if isinstance(value, CounterValue):
            lines.append(f"{value.name}{labels_str} {value.value}")

        elif isinstance(value, GaugeValue):
            lines.append(f"{value.name}{labels_str} {value.value}")

        elif isinstance(value, HistogramValue):
            # Bucket counts
            cumulative = 0
            for bucket, count in zip(value.buckets, value.bucket_counts):
                cumulative += count
                bucket_labels = {**value.labels, "le": str(bucket)}
                lines.append(f"{value.name}_bucket{self._format_labels(bucket_labels)} {cumulative}")

            # +Inf bucket
            inf_labels = {**value.labels, "le": "+Inf"}
            lines.append(f"{value.name}_bucket{self._format_labels(inf_labels)} {value.count}")

            # Sum and count
            lines.append(f"{value.name}_sum{labels_str} {value.sum}")
            lines.append(f"{value.name}_count{labels_str} {value.count}")

        elif isinstance(value, SummaryValue):
            # Quantiles
            for quantile, q_value in value.quantiles.items():
                q_labels = {**value.labels, "quantile": str(quantile)}
                lines.append(f"{value.name}{self._format_labels(q_labels)} {q_value}")

            # Sum and count
            lines.append(f"{value.name}_sum{labels_str} {value.sum}")
            lines.append(f"{value.name}_count{labels_str} {value.count}")

        return lines

    def _format_labels(self, labels: Dict[str, str]) -> str:
        """Format labels for Prometheus"""
        if not labels:
            return ""

        pairs = [f'{k}="{self._escape_label_value(v)}"' for k, v in sorted(labels.items())]
        return "{" + ",".join(pairs) + "}"

    def _escape_label_value(self, value: str) -> str:
        """Escape label value"""
        return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


# ═══════════════════════════════════════════════════════════════════════════
#                          HTTP SERVER
# ═══════════════════════════════════════════════════════════════════════════

class MetricsServer:
    """
    HTTP server for Prometheus scraping.
    """

    def __init__(
        self,
        registry: MetricRegistry,
        host: str = "0.0.0.0",
        port: int = 9090,
        path: str = "/metrics"
    ):
        self.registry = registry
        self.exporter = PrometheusExporter(registry)
        self.host = host
        self.port = port
        self.path = path
        self._server = None

    async def start(self) -> None:
        """Start metrics server"""
        from aiohttp import web

        app = web.Application()
        app.router.add_get(self.path, self._handle_metrics)
        app.router.add_get("/health", self._handle_health)

        runner = web.AppRunner(app)
        await runner.setup()

        self._server = web.TCPSite(runner, self.host, self.port)
        await self._server.start()

        logger.info(f"Metrics server started on http://{self.host}:{self.port}{self.path}")

    async def stop(self) -> None:
        """Stop metrics server"""
        if self._server:
            await self._server.stop()
            logger.info("Metrics server stopped")

    async def _handle_metrics(self, request) -> Any:
        """Handle /metrics endpoint"""
        from aiohttp import web

        content = self.exporter.export()
        return web.Response(
            text=content,
            content_type="text/plain; version=0.0.4; charset=utf-8"
        )

    async def _handle_health(self, request) -> Any:
        """Handle /health endpoint"""
        from aiohttp import web

        return web.json_response({"status": "healthy"})


# ═══════════════════════════════════════════════════════════════════════════
#                          LUMEN CORTEX METRICS
# ═══════════════════════════════════════════════════════════════════════════

class LumenCortexMetrics:
    """
    Pre-defined metrics for Lumen Cortex.
    """

    def __init__(self, registry: Optional[MetricRegistry] = None):
        self.registry = registry or MetricRegistry()

        # HTTP Request metrics
        self.http_requests_total = self.registry.counter(
            "http_requests_total",
            "Total HTTP requests",
            ["method", "path", "status"]
        )

        self.http_request_duration = self.registry.histogram(
            "http_request_duration_seconds",
            "HTTP request duration",
            ["method", "path"],
            buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        )

        self.http_requests_in_progress = self.registry.gauge(
            "http_requests_in_progress",
            "HTTP requests in progress",
            ["method", "path"]
        )

        # Document processing metrics
        self.documents_processed_total = self.registry.counter(
            "documents_processed_total",
            "Total documents processed",
            ["type", "status"]
        )

        self.document_processing_duration = self.registry.histogram(
            "document_processing_duration_seconds",
            "Document processing time",
            ["type"],
            buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 120.0]
        )

        # Embedding metrics
        self.embeddings_generated_total = self.registry.counter(
            "embeddings_generated_total",
            "Total embeddings generated",
            ["model"]
        )

        self.embedding_generation_duration = self.registry.histogram(
            "embedding_generation_duration_seconds",
            "Embedding generation time",
            ["model"],
            buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5]
        )

        self.embedding_batch_size = self.registry.histogram(
            "embedding_batch_size",
            "Embedding batch sizes",
            ["model"],
            buckets=[1, 5, 10, 25, 50, 100, 250, 500]
        )

        # LLM metrics
        self.llm_requests_total = self.registry.counter(
            "llm_requests_total",
            "Total LLM requests",
            ["model", "operation"]
        )

        self.llm_request_duration = self.registry.histogram(
            "llm_request_duration_seconds",
            "LLM request duration",
            ["model", "operation"],
            buckets=[0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0]
        )

        self.llm_tokens_used = self.registry.counter(
            "llm_tokens_used_total",
            "Total LLM tokens used",
            ["model", "type"]  # type: prompt, completion
        )

        # GraphRAG metrics
        self.graph_queries_total = self.registry.counter(
            "graph_queries_total",
            "Total graph queries",
            ["query_type"]
        )

        self.graph_query_duration = self.registry.histogram(
            "graph_query_duration_seconds",
            "Graph query duration",
            ["query_type"],
            buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
        )

        self.graph_nodes_total = self.registry.gauge(
            "graph_nodes_total",
            "Total nodes in graph",
            ["type"]
        )

        self.graph_edges_total = self.registry.gauge(
            "graph_edges_total",
            "Total edges in graph",
            ["type"]
        )

        # Citation metrics
        self.citations_validated_total = self.registry.counter(
            "citations_validated_total",
            "Total citations validated",
            ["result"]  # valid, invalid, uncertain
        )

        self.citation_validation_duration = self.registry.histogram(
            "citation_validation_duration_seconds",
            "Citation validation time",
            buckets=[0.1, 0.5, 1.0, 2.5, 5.0]
        )

        # Compliance metrics
        self.compliance_checks_total = self.registry.counter(
            "compliance_checks_total",
            "Total compliance checks",
            ["framework", "result"]
        )

        self.compliance_check_duration = self.registry.histogram(
            "compliance_check_duration_seconds",
            "Compliance check duration",
            ["framework"],
            buckets=[0.1, 0.5, 1.0, 5.0, 10.0]
        )

        # Cache metrics
        self.cache_hits_total = self.registry.counter(
            "cache_hits_total",
            "Cache hits",
            ["tier"]  # local, redis
        )

        self.cache_misses_total = self.registry.counter(
            "cache_misses_total",
            "Cache misses",
            ["tier"]
        )

        self.cache_size = self.registry.gauge(
            "cache_size",
            "Cache size",
            ["tier"]
        )

        # Database metrics
        self.db_connections_active = self.registry.gauge(
            "db_connections_active",
            "Active database connections",
            ["pool"]
        )

        self.db_connections_idle = self.registry.gauge(
            "db_connections_idle",
            "Idle database connections",
            ["pool"]
        )

        self.db_query_duration = self.registry.histogram(
            "db_query_duration_seconds",
            "Database query duration",
            ["pool", "operation"],
            buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
        )

        # Auth metrics
        self.auth_attempts_total = self.registry.counter(
            "auth_attempts_total",
            "Authentication attempts",
            ["method", "result"]
        )

        self.active_sessions = self.registry.gauge(
            "active_sessions_total",
            "Active user sessions"
        )

        # Error metrics
        self.errors_total = self.registry.counter(
            "errors_total",
            "Total errors",
            ["type", "component"]
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          DECORATORS
# ═══════════════════════════════════════════════════════════════════════════

def track_request(
    metrics: LumenCortexMetrics,
    method: str,
    path: str
):
    """Decorator to track HTTP requests"""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            labels = {"method": method, "path": path}

            metrics.http_requests_in_progress.inc(labels=labels)
            start = time.perf_counter()

            try:
                result = await func(*args, **kwargs)
                status = getattr(result, "status_code", 200)
                return result
            except Exception as e:
                status = 500
                raise
            finally:
                duration = time.perf_counter() - start
                metrics.http_request_duration.observe(duration, labels=labels)
                metrics.http_requests_total.inc(labels={**labels, "status": str(status)})
                metrics.http_requests_in_progress.dec(labels=labels)

        return wrapper
    return decorator


def track_operation(
    histogram: Histogram,
    labels: Optional[Dict[str, str]] = None
):
    """Decorator to track operation duration"""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            with histogram.time(labels=labels):
                return await func(*args, **kwargs)
        return wrapper
    return decorator


def track_errors(
    counter: Counter,
    component: str
):
    """Decorator to track errors"""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                counter.inc(labels={"type": type(e).__name__, "component": component})
                raise
        return wrapper
    return decorator


# ═══════════════════════════════════════════════════════════════════════════
#                          GLOBAL INSTANCE
# ═══════════════════════════════════════════════════════════════════════════

_registry: Optional[MetricRegistry] = None
_metrics: Optional[LumenCortexMetrics] = None
_server: Optional[MetricsServer] = None


def get_registry() -> MetricRegistry:
    """Get global metric registry"""
    global _registry
    if _registry is None:
        _registry = MetricRegistry()
    return _registry


def get_metrics() -> LumenCortexMetrics:
    """Get global Lumen Cortex metrics"""
    global _metrics
    if _metrics is None:
        _metrics = LumenCortexMetrics(get_registry())
    return _metrics


async def start_metrics_server(
    host: str = "0.0.0.0",
    port: int = 9090,
    path: str = "/metrics"
) -> MetricsServer:
    """Start global metrics server"""
    global _server

    _server = MetricsServer(get_registry(), host, port, path)
    await _server.start()

    return _server


async def stop_metrics_server() -> None:
    """Stop global metrics server"""
    global _server

    if _server:
        await _server.stop()
        _server = None


# ═══════════════════════════════════════════════════════════════════════════
#                          EXPORTS
# ═══════════════════════════════════════════════════════════════════════════

__all__ = [
    # Config
    "MetricsConfig",
    "MetricType",
    # Metrics
    "Metric",
    "Counter",
    "Gauge",
    "Histogram",
    "Summary",
    # Registry
    "MetricRegistry",
    # Exporters
    "PrometheusExporter",
    "MetricsServer",
    # Lumen Cortex specific
    "LumenCortexMetrics",
    # Decorators
    "track_request",
    "track_operation",
    "track_errors",
    # Global
    "get_registry",
    "get_metrics",
    "start_metrics_server",
    "stop_metrics_server",
]
