#!/bin/bash
# TrialSage Light Deployment Script
# Installs only essential Python dependencies to avoid timeout issues

set -e

echo "🚀 Starting TrialSage light deployment..."

# Step 1: Install only essential Python dependencies (no heavy ML packages)
echo "📦 Installing essential Python dependencies..."

# Create temporary lightweight requirements
cat > temp_light_requirements.txt << 'EOF'
# Essential FastAPI dependencies only
fastapi==0.108.0
uvicorn[standard]==0.25.0
pydantic[email]==2.5.2
pydantic-settings>=2.0.0
python-multipart==0.0.6
starlette>=0.26.1
websockets>=11.0.0

# Database essentials
psycopg2-binary==2.9.7
sqlalchemy==2.0.23

# Document processing essentials
PyPDF2==3.0.1
python-docx==0.8.11

# Basic utilities
requests==2.31.0
httpx==0.25.0
python-dotenv==1.0.0
structlog==23.1.0

# Testing
pytest==7.4.3
EOF

pip install --no-cache-dir -r temp_light_requirements.txt
rm temp_light_requirements.txt
echo "✅ Essential Python dependencies installed"

# Step 2: Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install
echo "✅ Node.js dependencies installed"

# Step 3: Build the application
echo "🔨 Building application..."
npm run build
echo "✅ Application built successfully"

echo "🎉 Light deployment completed successfully!"
echo "📝 To start: npm run start"