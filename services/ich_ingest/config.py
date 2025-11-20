"""
Configuration settings for ICH Specialist service

This module provides configuration settings for the ICH Specialist service
using Pydantic Settings to ensure proper environment variables handling and
configuration validation.
"""
import os
from typing import List, Optional, Dict, Any

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, validator


class Settings(BaseSettings):
    """
    Configuration settings for ICH Specialist service with environment variable support
    """
    # API configuration
    API_AUTH_ENABLED: bool = Field(True, description="Enable API key authentication")
    API_KEY: str = Field("", description="API key for authentication")
    DEBUG: bool = Field(False, description="Enable debug mode")
    
    # Service settings
    SERVICE_NAME: str = Field("ich-specialist", description="Service name")
    LOG_LEVEL: str = Field("INFO", description="Log level")
    
    # OpenAI settings
    OPENAI_API_KEY: str = Field(..., description="OpenAI API key")
    OPENAI_MODEL: str = Field("gpt-4o", description="OpenAI model to use")
    
    # Vector database settings
    PINECONE_API_KEY: str = Field(..., description="Pinecone API key")
    PINECONE_ENV: str = Field("us-west1-gcp", description="Pinecone environment")
    PINECONE_INDEX: str = Field("ich-guidelines", description="Pinecone index name")
    
    # CORS settings
    CORS_ORIGINS: List[str] = Field(
        ["*"], 
        description="CORS allowed origins"
    )
    
    # Metrics settings
    METRICS_PREFIX: str = Field(
        "ich_agent_", 
        description="Prefix for metrics names"
    )
    
    # Files and directories
    DATA_DIR: str = Field(
        "/data", 
        description="Directory for data storage"
    )
    GUIDELINES_DIR: str = Field(
        "/data/guidelines", 
        description="Directory for ICH guidelines"
    )
    UPLOADS_DIR: str = Field(
        "/data/csr_uploads", 
        description="Directory for CSR uploads"
    )
    PROCESSED_FILE: str = Field(
        "processed.json", 
        description="File to track processed documents"
    )
    
    # Chunking settings
    CHUNK_SIZE: int = Field(
        1000, 
        description="Default chunk size for document indexing"
    )
    CHUNK_OVERLAP: int = Field(
        200, 
        description="Default chunk overlap for document indexing"
    )
    
    # Cache settings
    CACHE_TTL: int = Field(
        3600, 
        description="Cache TTL in seconds"
    )
    
    @validator("OPENAI_MODEL")
    def validate_openai_model(cls, v):
        """Validate that the OpenAI model is using the latest version"""
        if v == "gpt-4":
            return "gpt-4o"  # Use the latest OpenAI model
        return v
    
    @validator("DATA_DIR", "GUIDELINES_DIR", "UPLOADS_DIR")
    def create_directory_if_not_exists(cls, v):
        """Create directory if it doesn't exist"""
        os.makedirs(v, exist_ok=True)
        return v
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="ICH_",
        case_sensitive=True,
    )


# Create settings instance
settings = Settings()

# For backwards compatibility with code that might import old-style settings
API_AUTH_ENABLED = settings.API_AUTH_ENABLED
API_KEY = settings.API_KEY
OPENAI_API_KEY = settings.OPENAI_API_KEY
OPENAI_MODEL = settings.OPENAI_MODEL
PINECONE_API_KEY = settings.PINECONE_API_KEY
PINECONE_ENV = settings.PINECONE_ENV
PINECONE_INDEX = settings.PINECONE_INDEX
CORS_ORIGINS = settings.CORS_ORIGINS
METRICS_PREFIX = settings.METRICS_PREFIX