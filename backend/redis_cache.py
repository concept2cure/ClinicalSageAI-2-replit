"""
Redis Caching Module for LumenTrialGuide.AI

This module provides a Redis-based caching layer that abstracts
set/get operations and handles JSON serialization for storing complex data.
"""

import os
import json
import logging
import time
from typing import Any, Dict, Optional, Union, List
import redis

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Redis connection settings from environment variables
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', '6379'))
REDIS_DB = int(os.environ.get('REDIS_DB', '0'))
REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', None)

# Default TTL for cache items (24 hours)
DEFAULT_TTL = 86400


class RedisCache:
    """Redis cache for storing and retrieving data with automatic JSON serialization/deserialization."""
    
    def __init__(self):
        """Initialize Redis connection."""
        try:
            self.redis = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                decode_responses=False  # Keep binary data for proper JSON handling
            )
            self.redis.ping()  # Test connection
            logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}, DB: {REDIS_DB}")
        except redis.ConnectionError as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            # Don't raise exception to allow app to continue without caching
            self.redis = None
    
    def set(self, key: str, value: Any, ttl: int = DEFAULT_TTL) -> bool:
        """
        Store a value in the cache.
        
        Args:
            key: Cache key
            value: Value to store (will be serialized to JSON)
            ttl: Time-to-live in seconds (default: 24 hours)
            
        Returns:
            bool: True if success, False otherwise
        """
        if not self.redis:
            return False
        
        try:
            # Serialize value to JSON
            serialized_value = json.dumps(value).encode('utf-8')
            
            # Store in Redis with TTL
            result = self.redis.setex(key, ttl, serialized_value)
            
            logger.debug(f"Cache SET: {key}, TTL: {ttl}s, Size: {len(serialized_value)} bytes")
            return result
        except Exception as e:
            logger.error(f"Error setting cache key {key}: {str(e)}")
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """
        Retrieve a value from the cache.
        
        Args:
            key: Cache key
            
        Returns:
            Deserialized value or None if not found or error
        """
        if not self.redis:
            return None
        
        try:
            # Retrieve from Redis
            value = self.redis.get(key)
            
            if not value:
                logger.debug(f"Cache MISS: {key}")
                return None
            
            # Deserialize from JSON
            deserialized_value = json.loads(value.decode('utf-8'))
            
            logger.debug(f"Cache HIT: {key}")
            return deserialized_value
        except Exception as e:
            logger.error(f"Error getting cache key {key}: {str(e)}")
            return None
    
    def delete(self, key: str) -> bool:
        """
        Delete a key from the cache.
        
        Args:
            key: Cache key
            
        Returns:
            bool: True if success, False otherwise
        """
        if not self.redis:
            return False
        
        try:
            result = self.redis.delete(key)
            logger.debug(f"Cache DELETE: {key}")
            return bool(result)
        except Exception as e:
            logger.error(f"Error deleting cache key {key}: {str(e)}")
            return False
    
    def flush_all(self) -> bool:
        """
        Clear the entire cache (use with caution!).
        
        Returns:
            bool: True if success, False otherwise
        """
        if not self.redis:
            return False
        
        try:
            self.redis.flushdb()
            logger.warning("Cache FLUSH: All keys deleted")
            return True
        except Exception as e:
            logger.error(f"Error flushing cache: {str(e)}")
            return False
    
    def get_with_fallback(self, key: str, fallback_function, ttl: int = DEFAULT_TTL, *args, **kwargs) -> Any:
        """
        Get a value from cache, using a fallback function if not found.
        When using the fallback, the result is automatically cached.
        
        Args:
            key: Cache key
            fallback_function: Function to call if cache miss
            ttl: Cache TTL for new values
            *args, **kwargs: Arguments to pass to the fallback function
            
        Returns:
            Cached value or result of fallback function
        """
        # Try to get from cache first
        cached_value = self.get(key)
        
        # If found in cache, return it
        if cached_value is not None:
            return cached_value
        
        # Cache miss - call fallback function
        try:
            logger.info(f"Cache miss for key {key}, calling fallback function")
            start_time = time.time()
            
            # Call fallback function with provided args
            fresh_value = fallback_function(*args, **kwargs)
            
            # Calculate execution time
            execution_time = time.time() - start_time
            logger.info(f"Fallback function executed in {execution_time:.2f}s")
            
            # Cache the result
            if fresh_value is not None:
                self.set(key, fresh_value, ttl)
            
            return fresh_value
        except Exception as e:
            logger.error(f"Error in fallback function for key {key}: {str(e)}")
            raise  # Re-raise the exception
    

# Create a singleton instance
cache = RedisCache()