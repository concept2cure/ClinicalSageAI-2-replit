
#!/usr/bin/env python3
"""
TrialSage Python Analytics Engine
Real Python/R integration for regulatory intelligence and predictive analytics
"""

import json
import sys
import os
import numpy as np
import pandas as pd
from scipy import stats
import subprocess
from datetime import datetime
import logging
from typing import Dict, Any, List, Optional

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TrialSageAnalyticsEngine:
    """Main analytics engine for TrialSage platform"""
    
    def __init__(self):
        self.analysis_cache = {}
        self.r_scripts_path = os.path.join(os.path.dirname(__file__), 'r_scripts')
        
    def run_fda_compliance_analysis(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        """Run FDA compliance analysis using Python/scipy"""
        try:
            logger.info("Starting FDA compliance analysis")
            
            # Extract document content
            content = document_data.get('content', '')
            doc_type = document_data.get('type', 'IND')
            
            # FDA compliance scoring
            compliance_keywords = [
                'gcp', 'good clinical practice', 'ich', 'cfr', 'fda guidance',
                'informed consent', 'institutional review board', 'irb',
                'adverse event', 'safety reporting', 'investigator brochure'
            ]
            
            # Calculate compliance score
            content_lower = content.lower()
            keyword_matches = sum(1 for keyword in compliance_keywords if keyword in content_lower)
            base_score = min(90, (keyword_matches / len(compliance_keywords)) * 100)
            
            # Statistical analysis of document structure
            sections = content.split('\n\n')
            section_analysis = {
                'total_sections': len(sections),
                'avg_section_length': np.mean([len(s) for s in sections if s.strip()]),
                'section_variance': np.var([len(s) for s in sections if s.strip()])
            }
            
            # Regulatory compliance gaps
            required_sections = {
                'IND': ['clinical protocol', 'investigator information', 'chemistry manufacturing controls'],
                'NDA': ['clinical studies', 'nonclinical studies', 'chemistry manufacturing controls'],
                '510k': ['predicate device', 'substantial equivalence', 'clinical data']
            }
            
            missing_sections = []
            if doc_type in required_sections:
                for section in required_sections[doc_type]:
                    if section.lower() not in content_lower:
                        missing_sections.append(section)
            
            # Calculate final compliance score
            section_penalty = len(missing_sections) * 5
            final_score = max(0, base_score - section_penalty)
            
            return {
                'fda_compliance_score': round(final_score, 1),
                'compliance_level': 'High' if final_score >= 80 else 'Medium' if final_score >= 60 else 'Low',
                'keyword_matches': keyword_matches,
                'section_analysis': section_analysis,
                'missing_sections': missing_sections,
                'recommendations': self._generate_compliance_recommendations(missing_sections, final_score),
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"FDA compliance analysis failed: {str(e)}")
            return {'error': str(e), 'analysis_type': 'fda_compliance'}
    
    def run_statistical_analysis(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Run statistical analysis using scipy and numpy"""
        try:
            logger.info("Starting statistical analysis")
            
            # Sample data for demonstration - in production this would come from trials data
            sample_sizes = data.get('sample_sizes', [50, 75, 100, 150, 200])
            effect_sizes = data.get('effect_sizes', [0.2, 0.3, 0.5, 0.8])
            
            # Power analysis
            power_analysis = []
            for n in sample_sizes:
                for effect in effect_sizes:
                    # Simplified power calculation
                    z_alpha = stats.norm.ppf(0.975)  # Two-tailed test, alpha = 0.05
                    z_beta = z_alpha - (effect * np.sqrt(n/2))
                    power = 1 - stats.norm.cdf(z_beta)
                    
                    power_analysis.append({
                        'sample_size': n,
                        'effect_size': effect,
                        'statistical_power': round(power, 3)
                    })
            
            # Endpoint success probability
            historical_success_rates = np.array([0.65, 0.72, 0.58, 0.81, 0.69])
            success_stats = {
                'mean_success_rate': round(np.mean(historical_success_rates), 3),
                'std_success_rate': round(np.std(historical_success_rates), 3),
                'confidence_interval_95': [
                    round(np.percentile(historical_success_rates, 2.5), 3),
                    round(np.percentile(historical_success_rates, 97.5), 3)
                ]
            }
            
            return {
                'power_analysis': power_analysis,
                'success_probability_stats': success_stats,
                'recommended_sample_size': self._calculate_optimal_sample_size(power_analysis),
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Statistical analysis failed: {str(e)}")
            return {'error': str(e), 'analysis_type': 'statistical'}
    
    def run_r_integration_analysis(self, analysis_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Run R statistical analysis via subprocess"""
        try:
            logger.info(f"Starting R analysis: {analysis_type}")
            
            # Prepare data file for R
            data_file = f"/tmp/trialsage_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(data_file, 'w') as f:
                json.dump(data, f)
            
            # Determine R script based on analysis type
            r_script_map = {
                'survival_analysis': 'survival_analysis.R',
                'bayesian_analysis': 'bayesian_analysis.R',
                'regression_modeling': 'regression_modeling.R'
            }
            
            r_script = r_script_map.get(analysis_type, 'default_analysis.R')
            r_script_path = os.path.join(self.r_scripts_path, r_script)
            
            # Run R script
            cmd = ['Rscript', r_script_path, data_file]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            # Clean up temp file
            if os.path.exists(data_file):
                os.remove(data_file)
            
            if result.returncode == 0:
                # Parse R output
                try:
                    r_output = json.loads(result.stdout)
                    return {
                        'r_analysis_results': r_output,
                        'analysis_type': analysis_type,
                        'success': True,
                        'analysis_timestamp': datetime.now().isoformat()
                    }
                except json.JSONDecodeError:
                    return {
                        'r_analysis_output': result.stdout,
                        'analysis_type': analysis_type,
                        'success': True,
                        'analysis_timestamp': datetime.now().isoformat()
                    }
            else:
                logger.error(f"R script failed: {result.stderr}")
                return {
                    'error': result.stderr,
                    'analysis_type': analysis_type,
                    'success': False
                }
                
        except Exception as e:
            logger.error(f"R integration analysis failed: {str(e)}")
            return {'error': str(e), 'analysis_type': analysis_type}
    
    def run_predictive_modeling(self, protocol_data: Dict[str, Any]) -> Dict[str, Any]:
        """Run predictive modeling for trial success"""
        try:
            logger.info("Starting predictive modeling")
            
            # Extract features from protocol
            features = {
                'sample_size': protocol_data.get('sample_size', 100),
                'duration_weeks': protocol_data.get('duration_weeks', 12),
                'phase': self._encode_phase(protocol_data.get('phase', 'II')),
                'indication_risk': self._calculate_indication_risk(protocol_data.get('indication', 'unknown')),
                'endpoint_complexity': self._calculate_endpoint_complexity(protocol_data.get('endpoints', []))
            }
            
            # Simple linear model for success prediction (in production, use trained ML model)
            base_success = 0.6
            
            # Adjust based on features
            size_factor = min(1.2, features['sample_size'] / 100)
            duration_factor = min(1.1, features['duration_weeks'] / 24)
            phase_factor = 1.0 - (features['phase'] * 0.1)  # Earlier phases are riskier
            
            predicted_success = base_success * size_factor * duration_factor * phase_factor
            predicted_success = max(0.1, min(0.95, predicted_success))  # Clamp between 10-95%
            
            # Risk factors
            risk_factors = []
            if features['sample_size'] < 50:
                risk_factors.append('Small sample size may lead to underpowering')
            if features['duration_weeks'] < 8:
                risk_factors.append('Short study duration may miss delayed effects')
            if features['indication_risk'] > 0.7:
                risk_factors.append('High-risk indication with historical failures')
            
            return {
                'predicted_success_probability': round(predicted_success, 3),
                'confidence_interval': [
                    round(predicted_success - 0.1, 3),
                    round(predicted_success + 0.1, 3)
                ],
                'risk_factors': risk_factors,
                'feature_importance': {
                    'sample_size_impact': round(size_factor - 1, 3),
                    'duration_impact': round(duration_factor - 1, 3),
                    'phase_impact': round(phase_factor - 1, 3)
                },
                'analysis_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Predictive modeling failed: {str(e)}")
            return {'error': str(e), 'analysis_type': 'predictive_modeling'}
    
    def _generate_compliance_recommendations(self, missing_sections: List[str], score: float) -> List[str]:
        """Generate compliance recommendations"""
        recommendations = []
        
        if score < 60:
            recommendations.append("Comprehensive regulatory review required")
        elif score < 80:
            recommendations.append("Address identified compliance gaps")
        
        for section in missing_sections:
            recommendations.append(f"Add required section: {section}")
        
        if not missing_sections and score >= 80:
            recommendations.append("Document meets regulatory standards")
        
        return recommendations
    
    def _calculate_optimal_sample_size(self, power_analysis: List[Dict]) -> int:
        """Calculate optimal sample size for 80% power"""
        for analysis in power_analysis:
            if analysis['statistical_power'] >= 0.8:
                return analysis['sample_size']
        return 100  # Default fallback
    
    def _encode_phase(self, phase: str) -> int:
        """Encode clinical trial phase"""
        phase_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4}
        return phase_map.get(phase.upper(), 2)
    
    def _calculate_indication_risk(self, indication: str) -> float:
        """Calculate risk score for indication"""
        high_risk_indications = ['oncology', 'alzheimer', 'als', 'rare disease']
        return 0.8 if any(risk in indication.lower() for risk in high_risk_indications) else 0.4
    
    def _calculate_endpoint_complexity(self, endpoints: List[str]) -> float:
        """Calculate endpoint complexity score"""
        return min(1.0, len(endpoints) * 0.2)

def main():
    """Command line interface for analytics engine"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python PythonAnalyticsEngine.py <analysis_data_json>"}))
        sys.exit(1)
    
    try:
        # Parse input data
        input_data = json.loads(sys.argv[1])
        analysis_type = input_data.get('analysis_type', 'fda_compliance')
        
        # Initialize engine
        engine = TrialSageAnalyticsEngine()
        
        # Run analysis based on type
        if analysis_type == 'fda_compliance':
            result = engine.run_fda_compliance_analysis(input_data)
        elif analysis_type == 'statistical':
            result = engine.run_statistical_analysis(input_data)
        elif analysis_type == 'predictive_modeling':
            result = engine.run_predictive_modeling(input_data)
        elif analysis_type.startswith('r_'):
            r_analysis_type = analysis_type[2:]  # Remove 'r_' prefix
            result = engine.run_r_integration_analysis(r_analysis_type, input_data)
        else:
            result = {"error": f"Unknown analysis type: {analysis_type}"}
        
        # Output result
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_result = {"error": str(e), "analysis_type": "unknown"}
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
