#!/usr/bin/env python3
# trialsage/design_recommendations.py
# Bridge script to generate evidence-based study design recommendations

import os
import sys
import json
from typing import List, Dict, Any, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from trialsage.services.deep_csr_analyzer import generate_study_design_recommendations
except ImportError:
    logger.error("Failed to import deep_csr_analyzer. Make sure it's in the correct path.")
    # Fallback function in case the import fails
    def generate_study_design_recommendations(
        indication: str, 
        phase: str, 
        primary_endpoint: Optional[str] = None
    ) -> Dict[str, Any]:
        """Emergency fallback function for study design recommendations"""
        logger.warning("Using fallback design recommendations - limited functionality")
        
        # Basic fallback recommendations based on phase
        if phase.lower() in ["phase 1", "phase i", "1"]:
            recommendations = {
                "sampleSize": {
                    "min": 20,
                    "max": 80,
                    "recommended": 30,
                    "rationale": "Standard Phase I safety study size",
                    "confidence": "low"
                },
                "duration": {
                    "min": 2,
                    "max": 6,
                    "recommended": 3,
                    "unit": "months",
                    "rationale": "Typical Phase I duration for initial safety assessment",
                    "confidence": "low"
                },
                "design": {
                    "recommended": "Single arm, open label",
                    "alternatives": ["Dose escalation", "Multiple cohorts"],
                    "rationale": "Standard design for initial safety assessment",
                    "confidence": "medium"
                },
                "primaryEndpoint": {
                    "recommended": "Safety and tolerability",
                    "alternatives": ["Maximum tolerated dose", "Pharmacokinetics"],
                    "rationale": "Primary focus on safety in Phase I",
                    "confidence": "medium"
                },
                "secondaryEndpoints": [
                    "Pharmacokinetics",
                    "Pharmacodynamics",
                    "Preliminary efficacy signals"
                ],
                "inclusionCriteria": [
                    "Healthy volunteers (typically)",
                    "Age 18-65",
                    "No significant medical history"
                ],
                "exclusionCriteria": [
                    "Significant medical conditions",
                    "Pregnancy or nursing",
                    "Recent participation in other clinical trials"
                ],
                "fallback": True
            }
        elif phase.lower() in ["phase 2", "phase ii", "2"]:
            recommendations = {
                "sampleSize": {
                    "min": 100,
                    "max": 300,
                    "recommended": 200,
                    "rationale": "Standard Phase II efficacy study size",
                    "confidence": "low"
                },
                "duration": {
                    "min": 6,
                    "max": 18,
                    "recommended": 12,
                    "unit": "months",
                    "rationale": "Typical Phase II duration for efficacy assessment",
                    "confidence": "low"
                },
                "design": {
                    "recommended": "Randomized, placebo-controlled",
                    "alternatives": ["Multiple dose arms", "Adaptive design"],
                    "rationale": "Standard design for preliminary efficacy assessment",
                    "confidence": "medium"
                },
                "primaryEndpoint": {
                    "recommended": primary_endpoint or "Disease-specific efficacy measure",
                    "alternatives": ["Biomarker change", "Functional improvement"],
                    "rationale": "Focus on establishing preliminary efficacy",
                    "confidence": "medium"
                },
                "secondaryEndpoints": [
                    "Safety and tolerability",
                    "Quality of life measures",
                    "Pharmacokinetics"
                ],
                "inclusionCriteria": [
                    f"Confirmed diagnosis of {indication}",
                    "Age 18+ (indication specific)",
                    "Specified disease severity"
                ],
                "exclusionCriteria": [
                    "Severe comorbidities",
                    "Recent use of excluded medications",
                    "Pregnancy or nursing"
                ],
                "fallback": True
            }
        else: # Phase 3
            recommendations = {
                "sampleSize": {
                    "min": 300,
                    "max": 3000,
                    "recommended": 1000,
                    "rationale": "Standard Phase III confirmatory study size",
                    "confidence": "low"
                },
                "duration": {
                    "min": 12,
                    "max": 48,
                    "recommended": 24,
                    "unit": "months",
                    "rationale": "Typical Phase III duration for definitive assessment",
                    "confidence": "low"
                },
                "design": {
                    "recommended": "Randomized, double-blind, controlled",
                    "alternatives": ["Multi-center", "Stratified randomization"],
                    "rationale": "Gold standard design for definitive efficacy assessment",
                    "confidence": "medium"
                },
                "primaryEndpoint": {
                    "recommended": primary_endpoint or "Definitive clinical outcome",
                    "alternatives": ["Composite endpoint", "Time-to-event"],
                    "rationale": "Focus on clinically meaningful outcomes",
                    "confidence": "medium"
                },
                "secondaryEndpoints": [
                    "Safety profile",
                    "Quality of life",
                    "Health economics",
                    "Patient-reported outcomes"
                ],
                "inclusionCriteria": [
                    f"Confirmed diagnosis of {indication}",
                    "Diverse patient population",
                    "Range of disease severity (when appropriate)"
                ],
                "exclusionCriteria": [
                    "Conditions that may interfere with assessment",
                    "Recent use of excluded medications",
                    "Participation in other trials"
                ],
                "fallback": True
            }
        
        # Return the recommendations with a note about fallback mode
        return {
            "indication": indication,
            "phase": phase,
            "primaryEndpoint": primary_endpoint,
            "recommendations": recommendations,
            "note": "These are fallback recommendations. For more accurate guidance, ensure the deep CSR analyzer service is available."
        }

def main():
    """
    Main function to generate evidence-based study design recommendations
    
    Takes a filepath as a command-line argument, reads the design parameters,
    generates recommendations, and prints the result as JSON to stdout.
    """
    if len(sys.argv) != 2:
        logger.error("Usage: python3 design_recommendations.py <filepath>")
        print(json.dumps({"error": "Invalid arguments", "recommendations": {}}))
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        # Read the design parameters from the file
        with open(filepath, 'r', encoding='utf-8') as f:
            params = json.load(f)
        
        indication = params.get("indication")
        phase = params.get("phase")
        primary_endpoint = params.get("primaryEndpoint")
        secondary_endpoints = params.get("secondaryEndpoints", [])
        population = params.get("population")
        context = params.get("context")
        
        if not indication or not phase:
            logger.error("Indication and phase parameters are required")
            print(json.dumps({"error": "Indication and phase parameters are required", "recommendations": {}}))
            sys.exit(1)
        
        # Generate design recommendations
        try:
            recommendations = generate_study_design_recommendations(
                indication=indication,
                phase=phase,
                primary_endpoint=primary_endpoint
            )
            
            # Enhance with additional information if available
            if population:
                recommendations.setdefault("population", population)
            
            if secondary_endpoints:
                recommendations.setdefault("secondaryEndpoints", secondary_endpoints)
            
            if context:
                recommendations.setdefault("context", context)
            
            # Print the result as JSON
            print(json.dumps({
                "parameters": {
                    "indication": indication,
                    "phase": phase,
                    "primaryEndpoint": primary_endpoint,
                    "secondaryEndpoints": secondary_endpoints,
                    "population": population
                },
                "recommendations": recommendations
            }))
            
        except Exception as e:
            logger.error(f"Error generating study design recommendations: {str(e)}")
            print(json.dumps({
                "error": f"Failed to generate recommendations: {str(e)}",
                "parameters": {
                    "indication": indication,
                    "phase": phase,
                    "primaryEndpoint": primary_endpoint
                },
                "recommendations": {}
            }))
            sys.exit(1)
        
    except Exception as e:
        logger.error(f"Error reading file {filepath}: {str(e)}")
        print(json.dumps({"error": f"Failed to read file: {str(e)}", "recommendations": {}}))
        sys.exit(1)

if __name__ == "__main__":
    main()