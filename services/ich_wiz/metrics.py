#!/usr/bin/env python
"""
ICH Wiz Metrics

This module provides metrics tracking for the ICH Wiz service.
"""
import time
import contextlib
from typing import Optional, Dict, Any, Callable

try:
    from prometheus_client import Counter, Histogram
    prometheus_available = True
except ImportError:
    prometheus_available = False

# Define metrics if Prometheus is available
if prometheus_available:
    API_REQUESTS = Counter(
        "ich_wiz_api_requests_total",
        "Total number of API requests to ICH Wiz",
        ["endpoint", "status"]
    )
    
    API_LATENCY = Histogram(
        "ich_wiz_api_latency_seconds",
        "Latency of ICH Wiz API requests",
        ["endpoint"]
    )
    
    OPENAI_REQUESTS = Counter(
        "ich_wiz_openai_requests_total",
        "Total number of OpenAI requests from ICH Wiz",
        ["endpoint", "model"]
    )
    
    PINECONE_REQUESTS = Counter(
        "ich_wiz_pinecone_requests_total",
        "Total number of Pinecone requests from ICH Wiz",
        ["operation"]
    )
    
    DOCUMENT_CHUNKS = Counter(
        "ich_wiz_document_chunks_total",
        "Total number of document chunks processed by ICH Wiz",
        ["source"]
    )
else:
    # Define mock metrics for when Prometheus is not available
    class MockMetric:
        def __init__(self, *args, **kwargs):
            self.name = args[0] if args else "mock_metric"
            self.values = {}
            
        def labels(self, **kwargs):
            return self
            
        def inc(self, amount=1):
            pass
            
        def observe(self, value):
            pass
    
    # Create mock metrics
    API_REQUESTS = MockMetric("ich_wiz_api_requests_total")
    API_LATENCY = MockMetric("ich_wiz_api_latency_seconds")
    OPENAI_REQUESTS = MockMetric("ich_wiz_openai_requests_total")
    PINECONE_REQUESTS = MockMetric("ich_wiz_pinecone_requests_total")
    DOCUMENT_CHUNKS = MockMetric("ich_wiz_document_chunks_total")

@contextlib.contextmanager
def time_and_count(counter: Any, histogram: Optional[Any] = None, **labels):
    """
    Context manager to time and count an operation.
    
    Args:
        counter: The counter to increment
        histogram: Optional histogram to observe the duration
        **labels: Labels for the metrics
    """
    start_time = time.time()
    try:
        yield
    finally:
        duration = time.time() - start_time
        if counter:
            counter.labels(**labels).inc()
        if histogram:
            histogram.labels(**labels).observe(duration)

def track_function(counter: Any, histogram: Optional[Any] = None, **labels):
    """
    Decorator to track a function call.
    
    Args:
        counter: The counter to increment
        histogram: Optional histogram to observe the duration
        **labels: Labels for the metrics
    """
    def decorator(func: Callable):
        def wrapper(*args, **kwargs):
            with time_and_count(counter, histogram, **labels):
                return func(*args, **kwargs)
        return wrapper
    return decorator