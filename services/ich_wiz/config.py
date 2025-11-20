#!/usr/bin/env python
"""
ICH Wiz Configuration

This module defines the configuration settings for the ICH Wiz service,
with validation to ensure all required settings are available.
"""
import os
import sys
from pathlib import Path
from typing import Optional

import pydantic
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Settings class for the ICH Wiz service with Pydantic validation.
    """
    # API configuration
    API_KEY: Optional[str] = None
    API_KEY_REQUIRED: bool = False
    DEBUG: bool = False
    
    # OpenAI configuration
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o"  # Default to gpt-4o as the newest model
    
    # Pinecone configuration
    PINECONE_API_KEY: str
    PINECONE_ENVIRONMENT: str = "us-west1-gcp-free"
    PINECONE_INDEX_NAME: str = "ich-guidelines"
    
    # Path configuration
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data" / "ich_wiz")))
    GUIDELINES_DIR: Path = Path(os.environ.get("GUIDELINES_DIR", str(DATA_DIR / "guidelines")))
    UPLOADS_DIR: Path = Path(os.environ.get("UPLOADS_DIR", str(DATA_DIR / "uploads")))
    
    # Logging configuration
    LOG_LEVEL: str = "INFO"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )
    
    # Validators for required fields
    @pydantic.field_validator("OPENAI_API_KEY")
    def validate_openai_api_key(cls, v):
        if not v:
            print("ERROR: OPENAI_API_KEY environment variable is required but not set.")
            sys.exit(1)
        return v
    
    @pydantic.field_validator("PINECONE_API_KEY")
    def validate_pinecone_api_key(cls, v):
        if not v:
            print("ERROR: PINECONE_API_KEY environment variable is required but not set.")
            sys.exit(1)
        return v

def create_directories(settings: Settings):
    """
    Create required directories if they don't exist.
    
    Args:
        settings: The application settings
    """
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    os.makedirs(settings.GUIDELINES_DIR, exist_ok=True)
    os.makedirs(settings.UPLOADS_DIR, exist_ok=True)

# Create settings object with fail-fast behavior
try:
    settings = Settings()
    create_directories(settings)
except Exception as e:
    print(f"ERROR: Failed to initialize settings: {str(e)}")
    sys.exit(1)