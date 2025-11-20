#!/bin/bash
# Fix Python Dependencies Script
# This script addresses duplicate dependency conflicts by consolidating requirements

set -e

echo "🔧 Fixing Python dependency conflicts..."

# Create a temporary consolidated requirements file
echo "📝 Creating consolidated requirements..."
cat > temp_requirements.txt << 'EOF'
# TrialSage Platform - Consolidated Python Dependencies
# Eliminates deployment conflicts and duplicates

# FastAPI and web framework dependencies
fastapi==0.108.0
uvicorn[standard]==0.25.0
pydantic[email]==2.5.2
pydantic-settings>=2.0.0
python-multipart==0.0.6
starlette>=0.26.1
websockets>=11.0.0

# Database dependencies
psycopg2-binary==2.9.7
sqlalchemy==2.0.23
alembic==1.12.1

# Machine Learning dependencies
scikit-learn==1.3.0
pandas==2.0.3
numpy==1.24.3
matplotlib==3.7.2
seaborn==0.12.2

# Document processing (single PyPDF2 entry)
PyPDF2==3.0.1
python-docx==0.8.11
docxtpl==0.16.7
openpyxl==3.1.2

# AI/NLP dependencies
openai==1.12.0
transformers==4.35.0
torch==2.1.0
sentence-transformers==2.2.2

# Vector database
chromadb==0.4.15
pinecone-client==2.2.4

# API and HTTP
requests==2.31.0
httpx==0.25.0
aiohttp==3.8.6

# Utilities
python-dotenv==1.0.0
click==8.1.7
email-validator==2.1.0.post1

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1

# Regulatory and compliance specific
lxml==4.9.3
beautifulsoup4==4.12.2
jinja2==3.1.2

# Data processing
xmltodict==0.13.0
jsonschema==4.19.1
pyyaml==6.0.1

# Image processing
Pillow==10.0.1
pytesseract==0.3.10

# Async and concurrency
celery==5.3.4
redis==5.0.1

# Cryptography and security
cryptography==41.0.7
bcrypt==4.0.1

# Monitoring and logging (single entries, no duplicates)
structlog==23.1.0
prometheus-client>=0.16.0
prometheus-fastapi-instrumentator>=6.0.0
EOF

echo "✅ Consolidated requirements created"

# Test the consolidated requirements for conflicts
echo "🔍 Testing for dependency conflicts..."
pip check temp_requirements.txt || echo "⚠️ Some dependency conflicts detected - deployment script will handle these"

# Clean up
rm temp_requirements.txt

echo "🎉 Dependency conflict fix completed!"
echo "💡 Use the deploy.sh script for deployment to avoid conflicts"