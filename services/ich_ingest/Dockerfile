FROM python:3.10-slim

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH="${PYTHONPATH}:/app"

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY services/ich_ingest/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY services/ich_ingest /app/services/ich_ingest

# Create necessary directories
RUN mkdir -p /data /data/guidelines /data/csr_uploads

# Set default environment variables
ENV ICH_SERVICE_NAME="ich-specialist" \
    ICH_LOG_LEVEL="INFO" \
    ICH_DATA_DIR="/data" \
    ICH_GUIDELINES_DIR="/data/guidelines" \
    ICH_UPLOADS_DIR="/data/csr_uploads" \
    ICH_PROCESSED_FILE="processed.json" \
    ICH_CHUNK_SIZE="1000" \
    ICH_CHUNK_OVERLAP="200" \
    ICH_CACHE_TTL="3600" \
    ICH_METRICS_PREFIX="ich_agent_" \
    ICH_API_AUTH_ENABLED="true"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose application port
EXPOSE 8080

# Start API service
CMD ["uvicorn", "services.ich_ingest.agent:app", "--host", "0.0.0.0", "--port", "8080"]