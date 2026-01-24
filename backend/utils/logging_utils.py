"""
Logging utilities for the CER (Clinical Evaluation Report) API
Provides consistent logging across Python modules with unique request IDs,
timing information, and properly formatted log messages.
"""

import logging
import time
import uuid
from functools import wraps
from typing import Callable, Dict, Any, Optional, Union

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(asctime)s - %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S%z'
)

# Create logger
logger = logging.getLogger("cer_app")

def get_logger():
    """Get the CER application logger"""
    return logger

def generate_request_id() -> str:
    """Generate a unique request ID for tracing"""
    timestamp = int(time.time() * 1000)
    random_suffix = uuid.uuid4().hex[:6]
    return f"{timestamp}-{random_suffix}"

def log_request(request_id: str, method: str, path: str, ip: Optional[str] = None) -> float:
    """
    Log the start of a request and return the start time
    
    Args:
        request_id: The unique ID for the request
        method: The HTTP method (GET, POST, etc.)
        path: The request path
        ip: The requesting IP address (optional)
        
    Returns:
        float: Start time in seconds since the epoch
    """
    ip_str = f"({ip})" if ip else ""
    logger.info(f"Request {request_id} - START: {method} {path} {ip_str}")
    return time.time()

def log_response(request_id: str, method: str, path: str, status_code: int, 
                 start_time: float, response_body: Any = None) -> None:
    """
    Log the completion of a request
    
    Args:
        request_id: The unique ID for the request
        method: The HTTP method (GET, POST, etc.)
        path: The request path
        status_code: The HTTP status code
        start_time: The start time returned by log_request
        response_body: Optional response body for debugging (will be truncated)
    """
    duration_ms = (time.time() - start_time) * 1000
    
    # Determine log level based on status code
    log_level = logging.INFO
    if status_code >= 500:
        log_level = logging.ERROR
    elif status_code >= 400:
        log_level = logging.WARNING
        
    log_message = f"Request {request_id} - END: {method} {path} - Status: {status_code} - {duration_ms:.2f}ms"
    
    # Add truncated response for non-error responses
    if response_body and log_level != logging.ERROR:
        response_str = str(response_body)
        if len(response_str) > 100:
            log_message += f" :: {response_str[:100]}..."
        else:
            log_message += f" :: {response_str}"
    
    logger.log(log_level, log_message)
    
    # For errors, log the full response separately
    if log_level == logging.ERROR and response_body:
        logger.error(f"Response body for {request_id}: {response_body}")

def timed_function(func: Callable) -> Callable:
    """
    Decorator to time a function and log its execution time
    
    Args:
        func: The function to time
    
    Returns:
        Callable: The wrapped function
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        function_id = generate_request_id()
        start_time = time.time()
        logger.debug(f"Function {function_id} - START: {func.__name__}")
        
        try:
            result = func(*args, **kwargs)
            duration_ms = (time.time() - start_time) * 1000
            logger.debug(f"Function {function_id} - END: {func.__name__} - {duration_ms:.2f}ms")
            return result
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(f"Function {function_id} - ERROR: {func.__name__} - {duration_ms:.2f}ms - {str(e)}")
            raise
    
    return wrapper