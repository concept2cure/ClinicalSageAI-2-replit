"""
Example FastAPI application that demonstrates how to use the logging middleware.
This shows how to integrate the middleware with your FastAPI routes.
"""

import time
from typing import Dict, Any, Optional

from fastapi import FastAPI, Request, Depends, HTTPException
from pydantic import BaseModel

from fastapi_middleware import setup_middleware
from logging_utils import timed_function, logger

# Create the FastAPI application
app = FastAPI(title="CER API Example")

# Apply middleware
setup_middleware(app)

# Define some data models
class CERQuery(BaseModel):
    ndc_code: str
    event: Optional[str] = None
    time_range: Optional[str] = None

class CERResponse(BaseModel):
    report: Dict[str, Any]
    timestamp: str
    request_id: str

# Define a dependency to extract the request ID
def get_request_id(request: Request) -> str:
    """
    Extract the request ID from the request state.
    This was set by the RequestLoggingMiddleware.
    """
    return request.state.request_id

@app.get("/health")
async def health_check():
    """Simple health check endpoint"""
    return {"status": "healthy", "timestamp": time.time()}

@app.get("/api/cer/{ndc_code}")
@timed_function
async def get_cer(
    ndc_code: str, 
    request_id: str = Depends(get_request_id)
) -> CERResponse:
    """
    Generate a CER for a specific NDC code
    
    Args:
        ndc_code: The NDC code to generate a report for
        request_id: The request ID (injected by dependency)
        
    Returns:
        CERResponse: The CER data
    """
    logger.info(f"Generating CER for NDC: {ndc_code}")
    
    # Here you would typically call your actual CER generation logic
    # For this example, we're just returning a sample response
    
    try:
        # Simulate processing time
        time.sleep(0.5)
        
        # Example response
        report_data = {
            "ndc_code": ndc_code,
            "title": f"Clinical Evaluation Report for {ndc_code}",
            "summary": "This is a sample CER report summary.",
            "findings": [
                "Finding 1: Example finding",
                "Finding 2: Another example finding"
            ]
        }
        
        logger.info(f"Successfully generated CER for NDC: {ndc_code}")
        
        return CERResponse(
            report=report_data,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            request_id=request_id
        )
        
    except Exception as e:
        logger.error(f"Error generating CER for NDC {ndc_code}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error generating CER: {str(e)}"
        )

@app.post("/api/cer/analyze")
@timed_function
async def analyze_cer(
    query: CERQuery,
    request_id: str = Depends(get_request_id)
) -> Dict[str, Any]:
    """
    Analyze CER data based on a query
    
    Args:
        query: The CER query parameters
        request_id: The request ID (injected by dependency)
        
    Returns:
        Dict: Analysis results
    """
    logger.info(f"Analyzing CER for NDC: {query.ndc_code}, event: {query.event}")
    
    try:
        # Simulate processing
        time.sleep(0.3)
        
        return {
            "ndc_code": query.ndc_code,
            "event": query.event,
            "analysis": {
                "trend": "stable",
                "risk_level": "low",
                "recommendations": [
                    "No specific actions required at this time."
                ]
            },
            "request_id": request_id
        }
    except Exception as e:
        logger.error(f"Error analyzing CER: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing CER data: {str(e)}"
        )

# This is how you would run the application with uvicorn
if __name__ == "__main__":
    import uvicorn
    logger.info("Starting CER API server")
    uvicorn.run(app, host="0.0.0.0", port=8000)