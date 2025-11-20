"""
Conflict Checker for eCTD CoAuthor Module

This agent detects source contradictions and inconsistencies within the existing
eCTD document structure, ensuring regulatory submission integrity.
"""

import os
import json
import asyncio
from typing import Dict, List, Optional, Tuple, Set
from datetime import datetime
from dataclasses import dataclass, asdict
import hashlib
import re
from collections import defaultdict

@dataclass
class ConflictDetail:
    """Represents a detected conflict between sources"""
    conflict_id: str
    conflict_type: str  # 'data_contradiction', 'methodology_conflict', 'temporal_inconsistency'
    severity: str  # 'critical', 'major', 'minor', 'informational'
    source_document_1: str
    source_document_2: str
    conflicting_statement_1: str
    conflicting_statement_2: str
    context_1: str
    context_2: str
    confidence_score: float
    resolution_suggestion: str
    detected_at: str
    section_affected: str

@dataclass
class ConflictAnalysis:
    """Complete conflict analysis for a document or section"""
    analysis_id: str
    scope: str  # 'section', 'document', 'submission'
    total_conflicts: int
    critical_conflicts: int
    major_conflicts: int
    minor_conflicts: int
    conflicts: List[ConflictDetail]
    overall_risk_score: float
    recommendations: List[str]
    analysis_timestamp: str

class ConflictChecker:
    """
    Advanced conflict detection system that identifies contradictions
    and inconsistencies in regulatory document sources.
    """
    
    def __init__(self):
        self.conflict_patterns = self._load_conflict_patterns()
        self.medical_terminology = self._load_medical_terminology()
        self.regulatory_standards = self._load_regulatory_standards()
        self.analysis_history = []
        
    def _load_conflict_patterns(self) -> Dict:
        """Load patterns that indicate potential conflicts"""
        return {
            'numerical_contradictions': [
                r'(\d+(?:\.\d+)?)\s*%?\s*(subjects?|patients?|participants?)',
                r'(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg)',
                r'p\s*[<>=]\s*(\d+(?:\.\d+)?)',
                r'(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?)'
            ],
            'temporal_conflicts': [
                r'(before|after|during|prior to|following)\s+([^.]+)',
                r'(baseline|week\s*\d+|day\s*\d+|month\s*\d+)',
                r'(administered|given|dosed)\s+([^.]+)'
            ],
            'safety_contradictions': [
                r'(adverse\s+events?|AEs?)\s+([^.]+)',
                r'(serious\s+adverse\s+events?|SAEs?)\s+([^.]+)',
                r'(deaths?|mortality)\s+([^.]+)',
                r'(well\s+tolerated|safety\s+profile)\s+([^.]+)'
            ],
            'efficacy_contradictions': [
                r'(primary\s+endpoint)\s+([^.]+)',
                r'(secondary\s+endpoint)\s+([^.]+)',
                r'(statistically\s+significant|significant)\s+([^.]+)',
                r'(response\s+rate|efficacy)\s+([^.]+)'
            ]
        }
    
    def _load_medical_terminology(self) -> Dict:
        """Load medical terminology for context understanding"""
        return {
            'severity_terms': {
                'mild': 1,
                'moderate': 2,
                'severe': 3,
                'life-threatening': 4,
                'fatal': 5
            },
            'frequency_terms': {
                'rare': (0, 0.1),
                'uncommon': (0.1, 1),
                'common': (1, 10),
                'very common': (10, 100)
            },
            'temporal_terms': {
                'acute': 'short_term',
                'chronic': 'long_term',
                'immediate': 'instant',
                'delayed': 'later'
            }
        }
    
    def _load_regulatory_standards(self) -> Dict:
        """Load regulatory standards for validation"""
        return {
            'FDA': {
                'required_sections': ['safety', 'efficacy', 'quality'],
                'data_consistency_rules': {
                    'safety_data': 'must_match_across_modules',
                    'efficacy_data': 'must_be_consistent',
                    'demographic_data': 'must_align'
                }
            },
            'EMA': {
                'required_sections': ['safety', 'efficacy', 'quality'],
                'data_consistency_rules': {
                    'safety_profile': 'must_be_harmonized',
                    'benefit_risk': 'must_be_consistent'
                }
            }
        }
    
    async def analyze_document_conflicts(
        self,
        documents: List[Dict],
        analysis_scope: str = 'submission'
    ) -> ConflictAnalysis:
        """
        Perform comprehensive conflict analysis across documents
        
        Args:
            documents: List of documents to analyze
            analysis_scope: Scope of analysis ('section', 'document', 'submission')
            
        Returns:
            ConflictAnalysis with detected conflicts and recommendations
        """
        
        analysis_id = hashlib.md5(str(datetime.utcnow()).encode()).hexdigest()[:8]
        timestamp = datetime.utcnow().isoformat()
        
        # Extract structured data from documents
        structured_data = await self._extract_structured_data(documents)
        
        # Detect various types of conflicts
        conflicts = []
        
        # Check for numerical contradictions
        numerical_conflicts = await self._detect_numerical_conflicts(structured_data)
        conflicts.extend(numerical_conflicts)
        
        # Check for temporal inconsistencies
        temporal_conflicts = await self._detect_temporal_conflicts(structured_data)
        conflicts.extend(temporal_conflicts)
        
        # Check for safety data contradictions
        safety_conflicts = await self._detect_safety_contradictions(structured_data)
        conflicts.extend(safety_conflicts)
        
        # Check for efficacy contradictions
        efficacy_conflicts = await self._detect_efficacy_contradictions(structured_data)
        conflicts.extend(efficacy_conflicts)
        
        # Check for methodology conflicts
        methodology_conflicts = await self._detect_methodology_conflicts(structured_data)
        conflicts.extend(methodology_conflicts)
        
        # Classify conflicts by severity
        critical_conflicts = [c for c in conflicts if c.severity == 'critical']
        major_conflicts = [c for c in conflicts if c.severity == 'major']
        minor_conflicts = [c for c in conflicts if c.severity == 'minor']
        
        # Calculate overall risk score
        risk_score = self._calculate_risk_score(conflicts)
        
        # Generate recommendations
        recommendations = self._generate_recommendations(conflicts, analysis_scope)
        
        analysis = ConflictAnalysis(
            analysis_id=analysis_id,
            scope=analysis_scope,
            total_conflicts=len(conflicts),
            critical_conflicts=len(critical_conflicts),
            major_conflicts=len(major_conflicts),
            minor_conflicts=len(minor_conflicts),
            conflicts=conflicts,
            overall_risk_score=risk_score,
            recommendations=recommendations,
            analysis_timestamp=timestamp
        )
        
        # Store analysis
        self.analysis_history.append(analysis)
        
        return analysis
    
    async def _extract_structured_data(self, documents: List[Dict]) -> Dict:
        """Extract structured data points from documents for analysis"""
        
        structured_data = {
            'numerical_data': defaultdict(list),
            'temporal_data': defaultdict(list),
            'safety_data': defaultdict(list),
            'efficacy_data': defaultdict(list),
            'methodology_data': defaultdict(list)
        }
        
        for doc in documents:
            content = doc.get('content', '')
            doc_id = doc.get('id', 'unknown')
            doc_title = doc.get('title', 'Unknown')
            
            # Extract numerical data
            for pattern in self.conflict_patterns['numerical_contradictions']:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    structured_data['numerical_data'][pattern].append({
                        'value': match.group(1),
                        'context': match.group(0),
                        'document_id': doc_id,
                        'document_title': doc_title,
                        'full_context': self._get_sentence_context(content, match.start())
                    })
            
            # Extract temporal data
            for pattern in self.conflict_patterns['temporal_conflicts']:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    structured_data['temporal_data'][pattern].append({
                        'temporal_reference': match.group(1),
                        'context': match.group(0),
                        'document_id': doc_id,
                        'document_title': doc_title,
                        'full_context': self._get_sentence_context(content, match.start())
                    })
            
            # Extract safety data
            for pattern in self.conflict_patterns['safety_contradictions']:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    structured_data['safety_data'][pattern].append({
                        'safety_term': match.group(1),
                        'description': match.group(2) if len(match.groups()) > 1 else '',
                        'context': match.group(0),
                        'document_id': doc_id,
                        'document_title': doc_title,
                        'full_context': self._get_sentence_context(content, match.start())
                    })
            
            # Extract efficacy data
            for pattern in self.conflict_patterns['efficacy_contradictions']:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    structured_data['efficacy_data'][pattern].append({
                        'efficacy_term': match.group(1),
                        'description': match.group(2) if len(match.groups()) > 1 else '',
                        'context': match.group(0),
                        'document_id': doc_id,
                        'document_title': doc_title,
                        'full_context': self._get_sentence_context(content, match.start())
                    })
        
        return structured_data
    
    def _get_sentence_context(self, content: str, position: int, window: int = 100) -> str:
        """Get sentence context around a specific position"""
        start = max(0, position - window)
        end = min(len(content), position + window)
        return content[start:end].strip()
    
    async def _detect_numerical_conflicts(self, structured_data: Dict) -> List[ConflictDetail]:
        """Detect contradictions in numerical data"""
        
        conflicts = []
        numerical_data = structured_data.get('numerical_data', {})
        
        for pattern, data_points in numerical_data.items():
            if len(data_points) < 2:
                continue
            
            # Compare data points from different documents
            for i in range(len(data_points)):
                for j in range(i + 1, len(data_points)):
                    point1 = data_points[i]
                    point2 = data_points[j]
                    
                    if point1['document_id'] != point2['document_id']:
                        # Check for potential conflicts
                        conflict = self._compare_numerical_values(point1, point2)
                        if conflict:
                            conflicts.append(conflict)
        
        return conflicts
    
    def _compare_numerical_values(self, point1: Dict, point2: Dict) -> Optional[ConflictDetail]:
        """Compare two numerical data points for conflicts"""
        
        try:
            val1 = float(point1['value'])
            val2 = float(point2['value'])
            
            # Check for significant differences (>10% difference)
            if abs(val1 - val2) / max(val1, val2) > 0.1:
                conflict_id = hashlib.md5(f"{point1['document_id']}-{point2['document_id']}-{val1}-{val2}".encode()).hexdigest()[:8]
                
                # Determine severity based on the magnitude of difference
                diff_percentage = abs(val1 - val2) / max(val1, val2) * 100
                if diff_percentage > 50:
                    severity = 'critical'
                elif diff_percentage > 25:
                    severity = 'major'
                else:
                    severity = 'minor'
                
                return ConflictDetail(
                    conflict_id=conflict_id,
                    conflict_type='data_contradiction',
                    severity=severity,
                    source_document_1=point1['document_title'],
                    source_document_2=point2['document_title'],
                    conflicting_statement_1=point1['context'],
                    conflicting_statement_2=point2['context'],
                    context_1=point1['full_context'],
                    context_2=point2['full_context'],
                    confidence_score=0.8,
                    resolution_suggestion=f"Verify which value is correct: {val1} vs {val2}. Consider if different study populations or methodologies might explain the difference.",
                    detected_at=datetime.utcnow().isoformat(),
                    section_affected='numerical_data'
                )
        
        except ValueError:
            # Non-numeric values, skip comparison
            pass
        
        return None
    
    async def _detect_temporal_conflicts(self, structured_data: Dict) -> List[ConflictDetail]:
        """Detect temporal inconsistencies"""
        
        conflicts = []
        temporal_data = structured_data.get('temporal_data', {})
        
        # Look for contradictory temporal statements
        all_temporal_points = []
        for pattern, data_points in temporal_data.items():
            all_temporal_points.extend(data_points)
        
        # Compare temporal references from different documents
        for i in range(len(all_temporal_points)):
            for j in range(i + 1, len(all_temporal_points)):
                point1 = all_temporal_points[i]
                point2 = all_temporal_points[j]
                
                if point1['document_id'] != point2['document_id']:
                    conflict = self._compare_temporal_references(point1, point2)
                    if conflict:
                        conflicts.append(conflict)
        
        return conflicts
    
    def _compare_temporal_references(self, point1: Dict, point2: Dict) -> Optional[ConflictDetail]:
        """Compare temporal references for conflicts"""
        
        # Simple temporal conflict detection (would be enhanced with NLP)
        temp_ref1 = point1['temporal_reference'].lower()
        temp_ref2 = point2['temporal_reference'].lower()
        
        # Check for obvious contradictions
        contradictory_pairs = [
            ('before', 'after'),
            ('prior to', 'following'),
            ('baseline', 'endpoint'),
            ('acute', 'chronic')
        ]
        
        for pair in contradictory_pairs:
            if (pair[0] in temp_ref1 and pair[1] in temp_ref2) or (pair[1] in temp_ref1 and pair[0] in temp_ref2):
                conflict_id = hashlib.md5(f"{point1['document_id']}-{point2['document_id']}-temporal".encode()).hexdigest()[:8]
                
                return ConflictDetail(
                    conflict_id=conflict_id,
                    conflict_type='temporal_inconsistency',
                    severity='major',
                    source_document_1=point1['document_title'],
                    source_document_2=point2['document_title'],
                    conflicting_statement_1=point1['context'],
                    conflicting_statement_2=point2['context'],
                    context_1=point1['full_context'],
                    context_2=point2['full_context'],
                    confidence_score=0.7,
                    resolution_suggestion=f"Clarify temporal relationship: '{temp_ref1}' vs '{temp_ref2}'. Ensure timeline consistency across documents.",
                    detected_at=datetime.utcnow().isoformat(),
                    section_affected='temporal_sequence'
                )
        
        return None
    
    async def _detect_safety_contradictions(self, structured_data: Dict) -> List[ConflictDetail]:
        """Detect safety data contradictions"""
        
        conflicts = []
        safety_data = structured_data.get('safety_data', {})
        
        # Compare safety statements across documents
        all_safety_points = []
        for pattern, data_points in safety_data.items():
            all_safety_points.extend(data_points)
        
        for i in range(len(all_safety_points)):
            for j in range(i + 1, len(all_safety_points)):
                point1 = all_safety_points[i]
                point2 = all_safety_points[j]
                
                if point1['document_id'] != point2['document_id']:
                    conflict = self._compare_safety_statements(point1, point2)
                    if conflict:
                        conflicts.append(conflict)
        
        return conflicts
    
    def _compare_safety_statements(self, point1: Dict, point2: Dict) -> Optional[ConflictDetail]:
        """Compare safety statements for contradictions"""
        
        # Look for contradictory safety assessments
        safety_term1 = point1.get('safety_term', '').lower()
        safety_term2 = point2.get('safety_term', '').lower()
        
        contradictory_safety = [
            ('well tolerated', 'adverse events'),
            ('safe', 'serious adverse events'),
            ('no deaths', 'mortality'),
            ('mild', 'severe')
        ]
        
        for pair in contradictory_safety:
            if (pair[0] in safety_term1 and pair[1] in safety_term2) or (pair[1] in safety_term1 and pair[0] in safety_term2):
                conflict_id = hashlib.md5(f"{point1['document_id']}-{point2['document_id']}-safety".encode()).hexdigest()[:8]
                
                severity = 'critical' if 'death' in safety_term1.lower() or 'death' in safety_term2.lower() else 'major'
                
                return ConflictDetail(
                    conflict_id=conflict_id,
                    conflict_type='data_contradiction',
                    severity=severity,
                    source_document_1=point1['document_title'],
                    source_document_2=point2['document_title'],
                    conflicting_statement_1=point1['context'],
                    conflicting_statement_2=point2['context'],
                    context_1=point1['full_context'],
                    context_2=point2['full_context'],
                    confidence_score=0.85,
                    resolution_suggestion=f"Reconcile safety assessment: '{safety_term1}' vs '{safety_term2}'. Ensure consistent safety profile across all documents.",
                    detected_at=datetime.utcnow().isoformat(),
                    section_affected='safety_profile'
                )
        
        return None
    
    async def _detect_efficacy_contradictions(self, structured_data: Dict) -> List[ConflictDetail]:
        """Detect efficacy data contradictions"""
        
        conflicts = []
        efficacy_data = structured_data.get('efficacy_data', {})
        
        # Similar logic to safety contradictions but for efficacy
        all_efficacy_points = []
        for pattern, data_points in efficacy_data.items():
            all_efficacy_points.extend(data_points)
        
        for i in range(len(all_efficacy_points)):
            for j in range(i + 1, len(all_efficacy_points)):
                point1 = all_efficacy_points[i]
                point2 = all_efficacy_points[j]
                
                if point1['document_id'] != point2['document_id']:
                    conflict = self._compare_efficacy_statements(point1, point2)
                    if conflict:
                        conflicts.append(conflict)
        
        return conflicts
    
    def _compare_efficacy_statements(self, point1: Dict, point2: Dict) -> Optional[ConflictDetail]:
        """Compare efficacy statements for contradictions"""
        
        efficacy_term1 = point1.get('efficacy_term', '').lower()
        efficacy_term2 = point2.get('efficacy_term', '').lower()
        
        contradictory_efficacy = [
            ('statistically significant', 'not significant'),
            ('effective', 'ineffective'),
            ('primary endpoint met', 'primary endpoint not met'),
            ('superior', 'non-inferior')
        ]
        
        for pair in contradictory_efficacy:
            if (pair[0] in efficacy_term1 and pair[1] in efficacy_term2) or (pair[1] in efficacy_term1 and pair[0] in efficacy_term2):
                conflict_id = hashlib.md5(f"{point1['document_id']}-{point2['document_id']}-efficacy".encode()).hexdigest()[:8]
                
                return ConflictDetail(
                    conflict_id=conflict_id,
                    conflict_type='data_contradiction',
                    severity='critical',
                    source_document_1=point1['document_title'],
                    source_document_2=point2['document_title'],
                    conflicting_statement_1=point1['context'],
                    conflicting_statement_2=point2['context'],
                    context_1=point1['full_context'],
                    context_2=point2['full_context'],
                    confidence_score=0.9,
                    resolution_suggestion=f"Critical efficacy contradiction: '{efficacy_term1}' vs '{efficacy_term2}'. This requires immediate resolution before submission.",
                    detected_at=datetime.utcnow().isoformat(),
                    section_affected='efficacy_assessment'
                )
        
        return None
    
    async def _detect_methodology_conflicts(self, structured_data: Dict) -> List[ConflictDetail]:
        """Detect methodology and study design conflicts"""
        
        # Placeholder for methodology conflict detection
        # Would analyze study designs, statistical methods, etc.
        return []
    
    def _calculate_risk_score(self, conflicts: List[ConflictDetail]) -> float:
        """Calculate overall risk score based on conflicts"""
        
        if not conflicts:
            return 0.0
        
        severity_weights = {
            'critical': 1.0,
            'major': 0.7,
            'minor': 0.3,
            'informational': 0.1
        }
        
        total_weight = sum(severity_weights.get(c.severity, 0.3) for c in conflicts)
        max_possible_weight = len(conflicts) * 1.0  # All critical
        
        return min(total_weight / max_possible_weight, 1.0) if max_possible_weight > 0 else 0.0
    
    def _generate_recommendations(self, conflicts: List[ConflictDetail], scope: str) -> List[str]:
        """Generate recommendations based on detected conflicts"""
        
        recommendations = []
        
        if not conflicts:
            recommendations.append("No conflicts detected. Document consistency appears good.")
            return recommendations
        
        critical_count = len([c for c in conflicts if c.severity == 'critical'])
        major_count = len([c for c in conflicts if c.severity == 'major'])
        
        if critical_count > 0:
            recommendations.append(f"URGENT: {critical_count} critical conflicts detected. These must be resolved before submission.")
        
        if major_count > 0:
            recommendations.append(f"IMPORTANT: {major_count} major conflicts detected. Review and resolve these issues.")
        
        # Group conflicts by type
        conflict_types = {}
        for conflict in conflicts:
            if conflict.conflict_type not in conflict_types:
                conflict_types[conflict.conflict_type] = []
            conflict_types[conflict.conflict_type].append(conflict)
        
        for conflict_type, type_conflicts in conflict_types.items():
            if len(type_conflicts) > 1:
                recommendations.append(f"Multiple {conflict_type} issues detected. Consider systematic review of this data type.")
        
        if len(conflicts) > 5:
            recommendations.append("High number of conflicts detected. Consider comprehensive document review and harmonization.")
        
        return recommendations
    
    def get_analysis_by_id(self, analysis_id: str) -> Optional[ConflictAnalysis]:
        """Retrieve a specific conflict analysis by ID"""
        for analysis in self.analysis_history:
            if analysis.analysis_id == analysis_id:
                return analysis
        return None
    
    def get_conflicts_by_severity(self, severity: str) -> List[ConflictDetail]:
        """Get all conflicts of a specific severity across all analyses"""
        all_conflicts = []
        for analysis in self.analysis_history:
            severity_conflicts = [c for c in analysis.conflicts if c.severity == severity]
            all_conflicts.extend(severity_conflicts)
        return all_conflicts

# Global instance for use in the eCTD CoAuthor module
conflict_checker = ConflictChecker()

async def check_document_conflicts(
    documents: List[Dict],
    scope: str = 'submission'
) -> Dict:
    """
    Main function to check for conflicts from the CoAuthor module
    
    Returns:
        Dictionary containing conflict analysis results
    """
    
    analysis = await conflict_checker.analyze_document_conflicts(documents, scope)
    return asdict(analysis)

def get_conflict_summary() -> Dict:
    """Get a summary of all conflict analyses"""
    
    total_analyses = len(conflict_checker.analysis_history)
    if total_analyses == 0:
        return {"message": "No conflict analyses performed yet"}
    
    latest_analysis = conflict_checker.analysis_history[-1]
    
    return {
        "total_analyses": total_analyses,
        "latest_analysis": asdict(latest_analysis),
        "critical_conflicts_found": latest_analysis.critical_conflicts,
        "overall_risk_score": latest_analysis.overall_risk_score
    }

if __name__ == "__main__":
    # Test the conflict checker
    test_docs = [
        {
            "id": "doc1",
            "title": "Clinical Study Report",
            "content": "The study showed 15% adverse events in treated subjects. Primary endpoint was statistically significant with p<0.001."
        },
        {
            "id": "doc2", 
            "title": "Safety Overview",
            "content": "Adverse events occurred in 25% of subjects. The drug was well tolerated with no serious safety concerns."
        }
    ]
    
    result = asyncio.run(check_document_conflicts(test_docs))
    print(json.dumps(result, indent=2))if __name__ == "__main__":
    import sys
    import json
    import argparse
    import asyncio
    
    parser = argparse.ArgumentParser(description="Conflict Checker Agent")
    parser.add_argument("--input", type=str, required=True, help="JSON input data")
    args = parser.parse_args()
    
    try:
        input_data = json.loads(args.input)
        
        async def main():
            result = await check_document_conflicts(
                documents=input_data.get("documents", []),
                scope=input_data.get("scope", "submission")
            )
            print(json.dumps(result))
        
        asyncio.run(main())
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Command line execution error: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result))
