"""
RegIntel API Configuration

This module contains configuration settings for the RegIntel API.
"""
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """
    API configuration settings
    """
    API_VERSION: str = "1.0.0"
    API_NAME: str = "RegIntel API"
    API_DESCRIPTION: str = "RegIntel provides document validation and explanation services for regulatory document compliance"
    
    # JWT settings — no insecure default; must be set via environment variable
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    # Validation engine settings
    VALIDATION_ENGINE_PATH: str = os.getenv("REGINTEL_ENGINE_PATH", "")
    
    # File upload settings
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50 MB
    ALLOWED_EXTENSIONS: list = ["pdf", "docx", "doc", "xml"]
    
    # Path settings
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    VALIDATION_LOGS_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "validation_logs")
    DEFINE_OUTPUT_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "define_outputs")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Create settings instance
settings = Settings()

# Validate critical configuration at startup
if not settings.JWT_SECRET_KEY or settings.JWT_SECRET_KEY == "regintel_development_key":
    import warnings
    warnings.warn(
        "JWT_SECRET_KEY is not set or uses the insecure default. "
        "Set JWT_SECRET_KEY environment variable with a strong random key.",
        stacklevel=1,
    )

# Ensure directories exist
for directory in [settings.UPLOAD_DIR, settings.VALIDATION_LOGS_DIR, settings.DEFINE_OUTPUT_DIR]:
    os.makedirs(directory, exist_ok=True)