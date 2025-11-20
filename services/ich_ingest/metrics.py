"""
Metrics module for the ICH Specialist service

This module defines Prometheus metrics for the ICH Specialist service
using the prometheus_client library.
"""
import prometheus_client
from typing import Callable
import time

from services.ich_ingest.config import settings

# Prefix for all metrics
PREFIX = settings.METRICS_PREFIX

# Define metrics
REQUESTS = prometheus_client.Counter(
    f"{PREFIX}requests_total", 
    "Total number of requests received",
    ["endpoint", "method"]
)

RESPONSES = prometheus_client.Counter(
    f"{PREFIX}responses_total", 
    "Total number of responses sent",
    ["endpoint", "status_code"]
)

PROCESSING_TIME = prometheus_client.Histogram(
    f"{PREFIX}request_processing_seconds", 
    "Time spent processing requests",
    ["endpoint"],
    buckets=(0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, 15.0, 30.0, 60.0)
)

EMBEDDING_TIME = prometheus_client.Histogram(
    f"{PREFIX}embedding_processing_seconds", 
    "Time spent generating embeddings",
    ["operation"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0)
)

TOKEN_USAGE = prometheus_client.Counter(
    f"{PREFIX}token_usage_total", 
    "Total number of tokens used",
    ["model", "operation"]
)

EMBEDDING_COUNT = prometheus_client.Counter(
    f"{PREFIX}embeddings_total", 
    "Total number of embeddings generated",
    ["model"]
)

DOCUMENT_CHUNKS = prometheus_client.Counter(
    f"{PREFIX}document_chunks_total", 
    "Total number of document chunks processed",
    ["operation"]
)

INDEXING_TIME = prometheus_client.Histogram(
    f"{PREFIX}indexing_processing_seconds", 
    "Time spent indexing documents",
    ["operation"],
    buckets=(0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 300.0, 600.0)
)

RETRIEVAL_TIME = prometheus_client.Histogram(
    f"{PREFIX}retrieval_processing_seconds", 
    "Time spent retrieving documents",
    ["operation"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
)

ERROR_COUNT = prometheus_client.Counter(
    f"{PREFIX}errors_total", 
    "Total number of errors encountered",
    ["operation", "error_type"]
)

CACHE_HITS = prometheus_client.Counter(
    f"{PREFIX}cache_hits_total", 
    "Total number of cache hits",
    ["cache_type"]
)

CACHE_MISSES = prometheus_client.Counter(
    f"{PREFIX}cache_misses_total", 
    "Total number of cache misses",
    ["cache_type"]
)

ACTIVE_REQUESTS = prometheus_client.Gauge(
    f"{PREFIX}active_requests", 
    "Number of active requests being processed",
    ["endpoint"]
)

def timing_decorator(metric: prometheus_client.Histogram) -> Callable:
    """
    Decorator to measure execution time of a function
    
    Args:
        metric: The Prometheus Histogram to update
        
    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            start_time = time.time()
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            metric.observe(execution_time)
            return result
        return wrapper
    return decorator

def init_metrics_endpoint() -> None:
    """Initialize metrics endpoint"""
    # Create a registry
    registry = prometheus_client.CollectorRegistry()
    
    # Add all metrics to registry
    for metric in [
        REQUESTS, RESPONSES, PROCESSING_TIME, EMBEDDING_TIME,
        TOKEN_USAGE, EMBEDDING_COUNT, DOCUMENT_CHUNKS,
        INDEXING_TIME, RETRIEVAL_TIME, ERROR_COUNT,
        CACHE_HITS, CACHE_MISSES, ACTIVE_REQUESTS
    ]:
        registry.register(metric)
    
    # Start HTTP server for metrics
    prometheus_client.start_http_server(8000, registry=registry)