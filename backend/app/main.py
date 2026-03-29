"""
RegIntel API Main Application

This module defines the FastAPI application and its middleware.
"""
import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

from backend.app.routers import validation, explanation

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="RegIntel API",
    description="RegIntel provides document validation and explanation services for regulatory document compliance",
    version="1.0.0"
)

# Configure CORS
cors_origins_raw = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-CSRF-Token"],
)

# Include routers
app.include_router(validation.router, prefix="/validate", tags=["validation"])
app.include_router(explanation.router, prefix="/explain", tags=["explanation"])

# Root endpoint - TrialSage Platform Interface
@app.get("/", response_class=HTMLResponse, tags=["system"])
async def root():
    """
    Root endpoint displaying the TrialSage platform interface.
    """
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TrialSage™ Clinical Trial Intelligence Platform</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Poppins', system-ui, sans-serif; background: linear-gradient(135deg, #d97757 0%, #c15f3c 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
            .container { background: white; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); padding: 40px; max-width: 800px; width: 90%; }
            .header { text-align: center; margin-bottom: 40px; }
            .logo { font-size: 2.5rem; font-weight: bold; color: #4a5568; margin-bottom: 10px; }
            .beta-badge { background: #d97757; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; margin-left: 10px; }
            .subtitle { color: #718096; font-size: 1.1rem; margin-bottom: 20px; }
            .status { background: #48bb78; color: white; padding: 8px 16px; border-radius: 20px; font-size: 0.9rem; display: inline-block; }
            .services { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 30px; }
            .service-card { background: #f7fafc; padding: 20px; border-radius: 12px; border-left: 4px solid #d97757; transition: transform 0.2s; }
            .service-card:hover { transform: translateY(-2px); }
            .service-title { font-weight: bold; color: #2d3748; margin-bottom: 8px; }
            .service-desc { color: #4a5568; font-size: 0.9rem; }
            .api-links { margin-top: 30px; text-align: center; }
            .api-link { display: inline-block; margin: 0 10px; padding: 10px 20px; background: #d97757; color: white; text-decoration: none; border-radius: 8px; transition: background 0.2s; }
            .api-link:hover { background: #5a67d8; }
            .footer { text-align: center; margin-top: 30px; color: #718096; font-size: 0.9rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="logo">TrialSage™ <span class="beta-badge">BETA</span></h1>
                <p class="subtitle">AI-Powered Clinical Trial Intelligence Platform</p>
                <div class="status">✅ System Operational</div>
            </div>
            
            <div class="services">
                <div class="service-card">
                    <div class="service-title">📄 Document Validation</div>
                    <div class="service-desc">Comprehensive regulatory document validation with real-time compliance checking</div>
                </div>
                <div class="service-card">
                    <div class="service-title">🧠 Rule Explanations</div>
                    <div class="service-desc">AI-powered explanations for regulatory requirements and compliance issues</div>
                </div>
                <div class="service-card">
                    <div class="service-title">🔍 Regulatory Intelligence</div>
                    <div class="service-desc">Advanced regulatory framework analysis and compliance monitoring</div>
                </div>
                <div class="service-card">
                    <div class="service-title">⚡ FastAPI Backend</div>
                    <div class="service-desc">High-performance API serving regulatory compliance services</div>
                </div>
            </div>
            
            <div class="api-links">
                <a href="/docs" class="api-link">📚 API Documentation</a>
                <a href="/health" class="api-link">🏥 Health Check</a>
                <a href="/validate" class="api-link">✅ Validation Services</a>
                <a href="/explain" class="api-link">💡 Explanation Services</a>
            </div>
            
            <div class="footer">
                <p>FastAPI RegIntel API v1.0.0 | Successfully Running on Port 5000</p>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

# Health check endpoint
@app.get("/health", tags=["system"])
async def health_check():
    """
    Health check endpoint to verify the API is running.
    """
    return {"status": "healthy", "api": "RegIntel"}
    
# Mount static files
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Startup event handler
@app.on_event("startup")
async def startup_event():
    """
    Actions to perform on application startup.
    """
    logger.info("RegIntel API started")

# Shutdown event handler
@app.on_event("shutdown")
async def shutdown_event():
    """
    Actions to perform on application shutdown.
    """
    logger.info("RegIntel API shutting down")