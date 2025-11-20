from fastapi import APIRouter

# Import route modules
from .intelligence_report import router as intelligence_report_router

# Create main router
api_router = APIRouter()

# Include all route modules
api_router.include_router(intelligence_report_router)