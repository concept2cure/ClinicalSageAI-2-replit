"""
ForesightAI™ Translational Intelligence Engine API
Predictive scoring, pattern recognition, and study design recommendations
"""

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import os
import logging
from uuid import uuid4
import hashlib

# Import existing CSR infrastructure
from csr_deep_learning import CSRDeepLearningEngine
from csr_vectorizer import CSRVectorizer
from csr_database import CSRDatabase

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ForesightAI")

# Initialize FastAPI app
app = FastAPI(title="ForesightAI™ API", version="1.0.0")

# CORS configuration
cors_origins_raw = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-CSRF-Token"],
)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    """Create database connection"""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# Initialize AI engines
csr_engine = CSRDeepLearningEngine()
vectorizer = CSRVectorizer()
csr_db = CSRDatabase()

# ============================================================================
# Data Models
# ============================================================================

class BiomarkerEndpoint(BaseModel):
    biomarker_id: str
    biomarker_name: str
    biomarker_type: Optional[str]
    endpoint_id: str
    endpoint_name: str
    endpoint_type: Optional[str]
    correlation_score: float = 0.0
    confidence: float = 0.5
    phase: Optional[str]
    indication: Optional[str]

class PredictionRequest(BaseModel):
    study_id: str
    phase: str
    indication: str
    biomarkers: List[Dict[str, Any]]
    endpoints: List[Dict[str, Any]]
    patient_count: Optional[int]
    organization_id: Optional[int]

class PredictionResponse(BaseModel):
    prediction_id: str
    study_id: str
    phase: str
    success_score: float
    confidence_interval: Dict[str, float]
    risk_factors: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]
    similar_trials: List[Dict[str, Any]]
    failure_patterns: List[Dict[str, Any]]

class FeedbackRequest(BaseModel):
    study_id: str
    prediction_id: Optional[str]
    phase: str
    feedback_type: str
    actual_outcome: str
    learning_points: Optional[List[Dict[str, Any]]]

# ============================================================================
# Knowledge Graph Service
# ============================================================================

class KnowledgeGraphAssembler:
    """Builds and manages the translational knowledge graph"""
    
    def __init__(self):
        self.conn = None
        
    def connect(self):
        """Connect to database"""
        self.conn = get_db_connection()
        
    def disconnect(self):
        """Disconnect from database"""
        if self.conn:
            self.conn.close()
            
    def create_biomarker_endpoint_relationship(self, relationship: BiomarkerEndpoint):
        """Create a new biomarker-endpoint relationship"""
        self.connect()
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT INTO biomarker_endpoints (
                    biomarker_id, biomarker_name, biomarker_type,
                    endpoint_id, endpoint_name, endpoint_type,
                    correlation_score, confidence, phase, indication
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                relationship.biomarker_id, relationship.biomarker_name, relationship.biomarker_type,
                relationship.endpoint_id, relationship.endpoint_name, relationship.endpoint_type,
                relationship.correlation_score, relationship.confidence, relationship.phase, relationship.indication
            ))
            result = cursor.fetchone()
            self.conn.commit()
            return result['id']
        finally:
            self.disconnect()
            
    def find_correlations(self, biomarker_id: str = None, endpoint_id: str = None, phase: str = None):
        """Find correlations in the knowledge graph"""
        self.connect()
        try:
            cursor = self.conn.cursor()
            query = "SELECT * FROM biomarker_endpoints WHERE 1=1"
            params = []
            
            if biomarker_id:
                query += " AND biomarker_id = %s"
                params.append(biomarker_id)
            if endpoint_id:
                query += " AND endpoint_id = %s"
                params.append(endpoint_id)
            if phase:
                query += " AND phase = %s"
                params.append(phase)
                
            query += " ORDER BY correlation_score DESC"
            cursor.execute(query, params)
            return cursor.fetchall()
        finally:
            self.disconnect()
            
    def update_correlation_scores(self, outcome_data: Dict):
        """Update correlation scores based on clinical outcomes"""
        self.connect()
        try:
            cursor = self.conn.cursor()
            # Calculate new correlation based on outcome
            success_factor = 1.1 if outcome_data['outcome_type'] == 'success' else 0.9
            
            cursor.execute("""
                UPDATE biomarker_endpoints
                SET correlation_score = LEAST(1.0, correlation_score * %s),
                    evidence_count = evidence_count + 1,
                    updated_at = NOW()
                WHERE biomarker_id = %s AND endpoint_id = %s
            """, (success_factor, outcome_data['biomarker_id'], outcome_data['endpoint_id']))
            self.conn.commit()
        finally:
            self.disconnect()

# ============================================================================
# Predictive Engine
# ============================================================================

class PredictiveEngine:
    """Core prediction engine for ForesightAI"""
    
    def __init__(self):
        self.kg = KnowledgeGraphAssembler()
        
    def calculate_success_score(self, request: PredictionRequest) -> Dict:
        """Calculate probability of trial success"""
        
        # Base score from historical data
        base_score = 0.5
        
        # Adjust based on biomarker-endpoint correlations
        correlations = []
        for biomarker in request.biomarkers:
            for endpoint in request.endpoints:
                corr = self.kg.find_correlations(
                    biomarker_id=biomarker.get('id'),
                    endpoint_id=endpoint.get('id'),
                    phase=request.phase
                )
                if corr:
                    correlations.append(corr[0]['correlation_score'])
        
        if correlations:
            base_score = np.mean(correlations)
            
        # Phase-specific adjustments
        phase_multipliers = {
            "I": 0.8,
            "II": 0.7,
            "III": 0.6,
            "IV": 0.9
        }
        phase_adjusted = base_score * phase_multipliers.get(request.phase, 1.0)
        
        # Patient count adjustment
        if request.patient_count:
            if request.patient_count < 50:
                phase_adjusted *= 0.85
            elif request.patient_count > 500:
                phase_adjusted *= 1.1
                
        # Calculate confidence interval
        std_dev = 0.15
        confidence_interval = {
            "lower": max(0, phase_adjusted - (1.96 * std_dev)),
            "upper": min(1, phase_adjusted + (1.96 * std_dev))
        }
        
        return {
            "score": round(phase_adjusted, 3),
            "confidence_interval": confidence_interval
        }
        
    def identify_risk_factors(self, request: PredictionRequest) -> List[Dict]:
        """Identify risk factors for the study"""
        risk_factors = []
        
        # Check for small sample size
        if request.patient_count and request.patient_count < 100:
            risk_factors.append({
                "factor": "small_sample_size",
                "impact": -0.15,
                "recommendation": "Consider increasing patient count to improve statistical power"
            })
            
        # Check for novel biomarkers
        for biomarker in request.biomarkers:
            correlations = self.kg.find_correlations(biomarker_id=biomarker.get('id'))
            if not correlations or len(correlations) < 3:
                risk_factors.append({
                    "factor": "novel_biomarker",
                    "impact": -0.10,
                    "recommendation": f"Limited evidence for biomarker {biomarker.get('name', 'unknown')}"
                })
                
        return risk_factors
        
    def find_similar_trials(self, request: PredictionRequest) -> List[Dict]:
        """Find similar trials using CSR database"""
        # Use existing CSR search functionality
        biomarker_names = [b.get('name', '') for b in request.biomarkers]
        endpoint_names = [e.get('name', '') for e in request.endpoints]
        
        query = f"{request.indication} {' '.join(biomarker_names)} {' '.join(endpoint_names)}"
        similar = csr_db.search_csr(query, limit=5)
        
        return [
            {
                "id": trial.get('trial_id', 'unknown'),
                "title": trial.get('title', ''),
                "similarity": trial.get('similarity_score', 0),
                "outcome": trial.get('outcome', 'unknown')
            }
            for trial in similar
        ]
        
    def detect_failure_patterns(self, request: PredictionRequest) -> List[Dict]:
        """Detect potential failure patterns"""
        patterns = []
        
        # Check historical failure patterns
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT pattern_name, pattern_type, success_rate, confidence
                FROM translational_patterns
                WHERE indication = %s AND phase = %s
                ORDER BY confidence DESC
                LIMIT 5
            """, (request.indication, request.phase))
            
            for row in cursor.fetchall():
                if row['success_rate'] < 0.3:
                    patterns.append({
                        "pattern": row['pattern_name'],
                        "type": row['pattern_type'],
                        "probability": 1 - row['success_rate'],
                        "confidence": row['confidence']
                    })
        finally:
            conn.close()
            
        return patterns

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/api/foresight/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "ForesightAI™", "version": "1.0.0"}

@app.post("/api/foresight/score", response_model=PredictionResponse)
async def calculate_prediction_score(request: PredictionRequest):
    """Calculate predictive success score for a study"""
    try:
        engine = PredictiveEngine()
        
        # Generate prediction
        success_data = engine.calculate_success_score(request)
        risk_factors = engine.identify_risk_factors(request)
        similar_trials = engine.find_similar_trials(request)
        failure_patterns = engine.detect_failure_patterns(request)
        
        # Generate recommendations based on analysis
        recommendations = []
        if success_data["score"] < 0.5:
            recommendations.append({
                "type": "protocol",
                "priority": "high",
                "action": "Consider protocol modifications based on similar successful trials"
            })
        
        for risk in risk_factors:
            if risk["impact"] < -0.1:
                recommendations.append({
                    "type": "risk_mitigation",
                    "priority": "medium",
                    "action": risk["recommendation"]
                })
                
        # Store prediction in database
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            prediction_id = str(uuid4())
            cursor.execute("""
                INSERT INTO foresight_predictions (
                    id, study_id, phase, prediction_type, success_score,
                    confidence_interval, risk_factors, recommendations,
                    similar_trials, failure_patterns, model_version,
                    organization_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                prediction_id, request.study_id, request.phase, 'success_score',
                success_data["score"], json.dumps(success_data["confidence_interval"]),
                json.dumps(risk_factors), json.dumps(recommendations),
                json.dumps(similar_trials), json.dumps(failure_patterns),
                "1.0.0", request.organization_id
            ))
            conn.commit()
        finally:
            conn.close()
            
        return PredictionResponse(
            prediction_id=prediction_id,
            study_id=request.study_id,
            phase=request.phase,
            success_score=success_data["score"],
            confidence_interval=success_data["confidence_interval"],
            risk_factors=risk_factors,
            recommendations=recommendations,
            similar_trials=similar_trials,
            failure_patterns=failure_patterns
        )
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/foresight/patterns")
async def get_failure_patterns(
    indication: Optional[str] = None,
    phase: Optional[str] = None,
    limit: int = 10
):
    """Get learned failure patterns"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        query = "SELECT * FROM translational_patterns WHERE 1=1"
        params = []
        
        if indication:
            query += " AND indication = %s"
            params.append(indication)
        if phase:
            query += " AND phase = %s"
            params.append(phase)
            
        query += " ORDER BY confidence DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, params)
        patterns = cursor.fetchall()
        
        return {"patterns": patterns}
    finally:
        conn.close()

@app.post("/api/foresight/feedback")
async def capture_feedback(feedback: FeedbackRequest):
    """Capture real-world outcomes for continuous learning"""
    try:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            
            # Store feedback
            feedback_id = str(uuid4())
            cursor.execute("""
                INSERT INTO clinical_feedback (
                    id, study_id, prediction_id, phase, feedback_type,
                    actual_outcome, learning_points, organization_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                feedback_id, feedback.study_id, feedback.prediction_id,
                feedback.phase, feedback.feedback_type, feedback.actual_outcome,
                json.dumps(feedback.learning_points), None
            ))
            
            # Update knowledge graph if applicable
            if feedback.learning_points:
                kg = KnowledgeGraphAssembler()
                for point in feedback.learning_points:
                    if point.get('type') == 'correlation':
                        kg.update_correlation_scores(point)
                        
            conn.commit()
            
            return {
                "feedback_id": feedback_id,
                "status": "captured",
                "message": "Feedback captured successfully for model improvement"
            }
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"Feedback error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/foresight/recommendations")
async def get_recommendations(
    study_id: str,
    phase: str,
    indication: Optional[str] = None
):
    """Get study design recommendations"""
    try:
        # Get latest prediction for study
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT recommendations, similar_trials, risk_factors
                FROM foresight_predictions
                WHERE study_id = %s AND phase = %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (study_id, phase))
            
            result = cursor.fetchone()
            if not result:
                return {"recommendations": [], "message": "No predictions found for this study"}
                
            return {
                "recommendations": json.loads(result['recommendations'] or '[]'),
                "similar_trials": json.loads(result['similar_trials'] or '[]'),
                "risk_factors": json.loads(result['risk_factors'] or '[]')
            }
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"Recommendation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/foresight/biomarkers")
async def get_biomarker_correlations(
    biomarker_id: Optional[str] = None,
    indication: Optional[str] = None,
    phase: Optional[str] = None
):
    """Get biomarker-endpoint correlations from knowledge graph"""
    kg = KnowledgeGraphAssembler()
    correlations = kg.find_correlations(biomarker_id=biomarker_id, phase=phase)
    
    # Filter by indication if provided
    if indication:
        correlations = [c for c in correlations if c.get('indication') == indication]
        
    return {"correlations": correlations}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)