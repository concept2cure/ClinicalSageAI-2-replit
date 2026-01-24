#!/usr/bin/env python3
"""
Protocol Correction Engine
--------------------------
Analyzes CSR alignment reports and generates intelligent suggestions
for correcting protocol elements that diverge from CSR precedent.

This module processes the alignment_score_report.json generated during
protocol-CSR comparison and produces actionable recommendations.
"""

import os
import json
import math
from typing import Dict, List, Any, Optional
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
THRESHOLD_SIMILARITY = 0.6  # Threshold below which we consider a field misaligned
MIN_CONFIDENCE = 0.65      # Minimum confidence threshold for making suggestions

class CorrectionEngine:
    """Engine that generates intelligent protocol correction suggestions based on CSR alignment."""
    
    def __init__(self):
        # Domain knowledge for correction suggestions
        self.recommendation_rules = {
            "primary_endpoint": self._recommend_primary_endpoint,
            "secondary_endpoint": self._recommend_secondary_endpoint,
            "sample_size": self._recommend_sample_size,
            "duration": self._recommend_duration,
            "duration_weeks": self._recommend_duration,
            "control": self._recommend_control,
            "inclusion_criteria": self._recommend_inclusion_criteria,
            "exclusion_criteria": self._recommend_exclusion_criteria,
            "population": self._recommend_population
        }
        
    def generate_suggestions(self, session_id: str) -> Dict[str, Any]:
        """
        Generate suggestions based on alignment report.
        
        Args:
            session_id: The session ID for retrieving the alignment report
            
        Returns:
            Dict containing suggestions for protocol improvements
        """
        # Get alignment report
        try:
            alignment = self._load_alignment_report(session_id)
            if not alignment:
                return {"error": "No alignment report found", "suggestions": []}
            
            protocol_data = self._load_protocol_data(session_id)
            
            # Process mismatches
            suggestions = []
            for match in alignment.get("matches", []):
                field = match.get("field")
                similarity = match.get("similarity", 0)
                protocol_value = match.get("protocol_value", "")
                csr_value = match.get("csr_value", "")
                
                # Skip if similarity is above threshold
                if similarity >= THRESHOLD_SIMILARITY or not field or not csr_value:
                    continue
                
                # Process field-specific recommendations using rule engine
                if field in self.recommendation_rules:
                    recommendation = self.recommendation_rules[field](
                        protocol_value, csr_value, similarity, alignment, protocol_data
                    )
                    
                    if recommendation and recommendation.get("confidence", 0) >= MIN_CONFIDENCE:
                        suggestions.append(recommendation)
            
            # Get other CSR metadata if available to enhance suggestions
            csr_id = alignment.get("csr_id")
            if csr_id:
                csr_metadata = self._get_csr_metadata(csr_id)
                suggestions = self._enhance_with_metadata(suggestions, csr_metadata)
            
            return {
                "session_id": session_id,
                "suggestions": suggestions,
                "source_alignment_score": alignment.get("alignment_score", 0)
            }
            
        except Exception as e:
            logger.error(f"Error generating suggestions: {str(e)}")
            return {"error": str(e), "suggestions": []}
    
    def _load_alignment_report(self, session_id: str) -> Optional[Dict]:
        """Load the alignment report for a session."""
        try:
            path = f"/mnt/data/lumen_reports_backend/sessions/{session_id}/alignment_score_report.json"
            if not os.path.exists(path):
                logger.warning(f"Alignment report not found for session {session_id}")
                return None
                
            with open(path, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading alignment report: {str(e)}")
            return None
    
    def _load_protocol_data(self, session_id: str) -> Dict:
        """Load the protocol data for additional context."""
        try:
            path = f"/mnt/data/lumen_reports_backend/sessions/{session_id}/protocol.txt"
            if not os.path.exists(path):
                return {}
                
            with open(path, "r") as f:
                content = f.read()
                
            # For now, return just the raw text
            # A more sophisticated approach would parse the protocol
            return {"text": content}
        except Exception:
            return {}
            
    def _get_csr_metadata(self, csr_id: str) -> Dict:
        """Get additional metadata about the CSR for context."""
        try:
            path = f"/mnt/data/lumen_reports_backend/intelligence_db/{csr_id}.json"
            if not os.path.exists(path):
                return {}
                
            with open(path, "r") as f:
                data = json.load(f)
                
            # Extract relevant metadata fields
            return {
                "indication": data.get("indication", ""),
                "phase": data.get("phase", ""),
                "sponsor": data.get("sponsor", ""),
                "outcome": data.get("outcome", {}).get("success", True),
                "year": data.get("date", {}).get("year", "")
            }
        except Exception:
            return {}
    
    def _enhance_with_metadata(self, suggestions: List[Dict], metadata: Dict) -> List[Dict]:
        """Enhance suggestions with CSR metadata for better context."""
        for suggestion in suggestions:
            if "justification" in suggestion and metadata:
                # Add context about the reference CSR
                context_parts = []
                if metadata.get("indication"):
                    context_parts.append(f"indication: {metadata['indication']}")
                if metadata.get("phase"):
                    context_parts.append(f"phase: {metadata['phase']}")
                if metadata.get("outcome") is not None:
                    outcome = "successful" if metadata["outcome"] else "unsuccessful"
                    context_parts.append(f"outcome: {outcome}")
                
                if context_parts:
                    context = f" (Reference CSR {', '.join(context_parts)})"
                    suggestion["justification"] += context
        
        return suggestions
    
    # Rule-based recommendation generators
    def _recommend_primary_endpoint(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for primary endpoint."""
        # Check if endpoints are completely different
        if similarity < 0.3:
            return {
                "field": "primary_endpoint",
                "current": protocol_value,
                "suggested": csr_value,
                "justification": "Similar studies used a different primary endpoint which may be more appropriate for your target indication.",
                "confidence": 0.85
            }
        # Check if endpoints are similar but differ in specifics
        elif similarity < 0.6:
            return {
                "field": "primary_endpoint",
                "current": protocol_value,
                "suggested": csr_value,
                "justification": "Consider refining your primary endpoint to match successful precedents.",
                "confidence": 0.75
            }
        return None
        
    def _recommend_secondary_endpoint(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for secondary endpoint."""
        if similarity < 0.5:
            return {
                "field": "secondary_endpoint",
                "current": protocol_value,
                "suggested": csr_value,
                "justification": "Your secondary endpoints may not capture important data points seen in precedent studies.",
                "confidence": 0.7
            }
        return None
        
    def _recommend_sample_size(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for sample size."""
        try:
            protocol_n = int(''.join(filter(str.isdigit, str(protocol_value))))
            csr_n = int(''.join(filter(str.isdigit, str(csr_value))))
            
            # If protocol sample size is significantly smaller
            if protocol_n < csr_n * 0.7:
                return {
                    "field": "sample_size",
                    "current": str(protocol_n),
                    "suggested": str(csr_n),
                    "justification": f"Your proposed sample size ({protocol_n}) may be underpowered compared to precedent studies ({csr_n}).",
                    "confidence": 0.9
                }
            # If protocol sample size is significantly larger
            elif protocol_n > csr_n * 1.5:
                return {
                    "field": "sample_size",
                    "current": str(protocol_n),
                    "suggested": str(csr_n),
                    "justification": f"Your proposed sample size ({protocol_n}) may be larger than necessary based on precedent studies ({csr_n}).",
                    "confidence": 0.7
                }
        except (ValueError, TypeError):
            pass
        return None
        
    def _recommend_duration(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for study duration."""
        try:
            # Extract numeric values from duration strings
            protocol_weeks = int(''.join(filter(str.isdigit, str(protocol_value))))
            csr_weeks = int(''.join(filter(str.isdigit, str(csr_value))))
            
            # If protocol duration is significantly shorter
            if protocol_weeks < csr_weeks * 0.8:
                return {
                    "field": "duration",
                    "current": f"{protocol_weeks} weeks",
                    "suggested": f"{csr_weeks} weeks",
                    "justification": f"Your proposed duration ({protocol_weeks} weeks) may be too short to observe clinically meaningful endpoints based on precedent studies.",
                    "confidence": 0.85
                }
            # If protocol duration is significantly longer
            elif protocol_weeks > csr_weeks * 1.3:
                return {
                    "field": "duration",
                    "current": f"{protocol_weeks} weeks",
                    "suggested": f"{csr_weeks} weeks",
                    "justification": f"Your proposed duration ({protocol_weeks} weeks) may be longer than necessary, potentially increasing costs and dropout rates.",
                    "confidence": 0.7
                }
        except (ValueError, TypeError):
            pass
        return None
        
    def _recommend_control(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for control arm."""
        if similarity < 0.5:
            return {
                "field": "control",
                "current": protocol_value,
                "suggested": csr_value,
                "justification": "Your control arm differs from regulatory precedent, which may impact study comparability and acceptance.",
                "confidence": 0.8
            }
        return None
        
    def _recommend_inclusion_criteria(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for inclusion criteria."""
        if similarity < 0.5:
            return {
                "field": "inclusion_criteria",
                "current": protocol_value,
                "suggested": csr_value,
                "justification": "Your inclusion criteria may be too broad or narrow compared to successful precedents, potentially affecting enrollment or results.",
                "confidence": 0.75
            }
        return None
        
    def _recommend_exclusion_criteria(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for exclusion criteria."""
        if similarity < 0.5:
            return {
                "field": "exclusion_criteria",
                "current": protocol_value,
                "suggested": csr_value,
                "justification": "Your exclusion criteria diverge from precedent, which may affect safety profile or statistical power.",
                "confidence": 0.75
            }
        return None
        
    def _recommend_population(self, protocol_value, csr_value, similarity, alignment, protocol_data):
        """Generate recommendation for study population."""
        if similarity < 0.6:
            return {
                "field": "population",
                "current": protocol_value,
                "suggested": csr_value,
                "justification": "Your target population differs from successful precedent, which may affect regulatory acceptance.",
                "confidence": 0.8
            }
        return None

# Instantiate for direct use
engine = CorrectionEngine()

if __name__ == "__main__":
    # For testing purposes
    import sys
    if len(sys.argv) > 1:
        session_id = sys.argv[1]
        suggestions = engine.generate_suggestions(session_id)
        print(json.dumps(suggestions, indent=2))
    else:
        print("Please provide a session ID")