#!/usr/bin/env python3
"""
Strategic Insights Analyzer

This script processes clinical study reports to extract strategic insights,
patterns, and recommendations based on deep analysis of study designs.

It uses NLP techniques to identify success patterns, design strategies, and 
evidence-based recommendations that go far beyond generic advice.
"""

import json
import os
import re
import sys
import math
import numpy as np
from collections import Counter, defaultdict
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple, Set

class StrategicInsightsAnalyzer:
    """Analyzes CSR data to extract strategic intelligence insights"""
    
    def __init__(self, input_data: Dict[str, Any]):
        """
        Initialize the analyzer with input data
        
        Args:
            input_data: Dictionary with protocol_data, matching_csrs, and academic_evidence
        """
        self.protocol_data = input_data.get('protocol_data', {})
        self.matching_csrs = input_data.get('matching_csrs', [])
        self.academic_evidence = input_data.get('academic_evidence', [])
        self.indication = self.protocol_data.get('indication', '')
        self.phase = self.protocol_data.get('phase', '')
        self.sponsor = self.protocol_data.get('sponsor', '')
        
        # Extract core CSR text for analysis
        self.csr_texts = self._extract_csr_texts()
        
        # Initialize results structure
        self.results = {
            'success_patterns': [],
            'design_insights': [],
            'endpoint_analysis': {},
            'competitive_positioning': {},
            'statistical_strategies': {},
            'operational_factors': {},
            'success_probability': {},
            'implementation_recommendations': []
        }
    
    def _extract_csr_texts(self) -> List[Dict[str, Any]]:
        """Extract and normalize text content from CSRs for analysis"""
        csr_texts = []
        
        for csr in self.matching_csrs:
            details = csr.get('details', {})
            
            # Combine all relevant text fields
            text_fields = [
                details.get('studyDescription', ''),
                details.get('primaryObjective', ''),
                details.get('studyDesign', ''),
                details.get('statisticalMethods', ''),
                details.get('efficacyResults', ''),
                details.get('safetyResults', ''),
                details.get('discussionAndConclusions', '')
            ]
            
            # Filter out None values and join
            text_content = ' '.join([t for t in text_fields if t])
            
            # Add to results if we have content
            if text_content.strip():
                csr_texts.append({
                    'id': csr.get('id', ''),
                    'title': csr.get('title', ''),
                    'sponsor': csr.get('sponsor', ''),
                    'indication': csr.get('indication', ''),
                    'phase': csr.get('phase', ''),
                    'status': csr.get('status', ''),
                    'text': text_content,
                    'is_successful': csr.get('status') in ['Successful', 'Completed']
                })
        
        return csr_texts
    
    def analyze_all(self) -> Dict[str, Any]:
        """Run all analysis methods and return comprehensive results"""
        self.analyze_success_patterns()
        self.analyze_endpoints()
        self.analyze_statistical_approaches()
        self.analyze_design_factors()
        self.analyze_operational_factors()
        self.analyze_competitive_positioning()
        self.calculate_success_probability()
        self.generate_implementation_recommendations()
        
        return self.results
    
    def analyze_success_patterns(self) -> None:
        """Identify patterns in successful vs. failed trials"""
        if not self.csr_texts:
            self.results['success_patterns'] = []
            return
        
        # Separate successful and failed trials
        successful_csrs = [csr for csr in self.csr_texts if csr.get('is_successful')]
        failed_csrs = [csr for csr in self.csr_texts if not csr.get('is_successful')]
        
        # Skip if we don't have enough data in both categories
        if len(successful_csrs) < 2 or len(failed_csrs) < 2:
            self.results['success_patterns'] = [{
                'factor': 'Insufficient data',
                'description': 'Not enough successful and failed trials to identify patterns',
                'confidence': 'Low',
                'evidence': f'Analysis based on {len(successful_csrs)} successful and {len(failed_csrs)} failed trials'
            }]
            return
        
        # Extract sample sizes
        successful_sizes = self._extract_sample_sizes(successful_csrs)
        failed_sizes = self._extract_sample_sizes(failed_csrs)
        
        patterns = []
        
        # Sample size pattern
        if successful_sizes and failed_sizes:
            avg_successful_size = sum(successful_sizes) / len(successful_sizes)
            avg_failed_size = sum(failed_sizes) / len(failed_sizes)
            
            if avg_successful_size > avg_failed_size * 1.25:  # At least 25% larger
                patterns.append({
                    'factor': 'Sample Size',
                    'description': f'Successful trials used larger sample sizes ({int(avg_successful_size)} vs {int(avg_failed_size)} patients)',
                    'confidence': 'High',
                    'evidence': f'Based on {len(successful_sizes)} successful and {len(failed_sizes)} failed trials',
                    'recommendation': f'Target a minimum sample size of {int(avg_successful_size)} patients',
                    'impact': f'{int((avg_successful_size - avg_failed_size) / avg_failed_size * 100)}% increase in sample size correlates with success'
                })
        
        # Duration pattern
        successful_durations = self._extract_durations(successful_csrs)
        failed_durations = self._extract_durations(failed_csrs)
        
        if successful_durations and failed_durations:
            avg_successful_duration = sum(successful_durations) / len(successful_durations)
            avg_failed_duration = sum(failed_durations) / len(failed_durations)
            
            if avg_successful_duration > avg_failed_duration * 1.2:  # At least 20% longer
                patterns.append({
                    'factor': 'Trial Duration',
                    'description': f'Successful trials had longer duration ({int(avg_successful_duration)} vs {int(avg_failed_duration)} weeks)',
                    'confidence': 'Medium',
                    'evidence': f'Based on {len(successful_durations)} successful and {len(failed_durations)} failed trials',
                    'recommendation': f'Design for at least {int(avg_successful_duration)} weeks of follow-up',
                    'impact': f'{int((avg_successful_duration - avg_failed_duration) / avg_failed_duration * 100)}% increase in duration correlates with success'
                })
        
        # Endpoint selection pattern
        successful_endpoints = self._extract_endpoints(successful_csrs)
        failed_endpoints = self._extract_endpoints(failed_csrs)
        
        # Find endpoints that appear more frequently in successful trials
        successful_counts = Counter(successful_endpoints)
        failed_counts = Counter(failed_endpoints)
        
        # Normalize by number of trials
        successful_freq = {k: v / len(successful_csrs) for k, v in successful_counts.items()}
        failed_freq = {k: v / len(failed_csrs) for k, v in failed_counts.items()}
        
        # Find endpoints with significant difference in frequency
        for endpoint, freq in successful_freq.items():
            if endpoint in failed_freq:
                if freq > failed_freq[endpoint] * 1.5:  # At least 50% more common in successful trials
                    patterns.append({
                        'factor': 'Endpoint Selection',
                        'description': f'"{endpoint}" used more frequently in successful trials ({int(freq*100)}% vs {int(failed_freq[endpoint]*100)}%)',
                        'confidence': 'Medium',
                        'evidence': f'Appears in {successful_counts[endpoint]} successful trials vs {failed_counts.get(endpoint, 0)} failed trials',
                        'recommendation': f'Consider "{endpoint}" as primary endpoint',
                        'impact': 'Associated with higher probability of success'
                    })
            elif freq > 0.25:  # Appears in at least 25% of successful trials but not in failed ones
                patterns.append({
                    'factor': 'Unique Successful Endpoint',
                    'description': f'"{endpoint}" appears in successful trials but not in failed trials',
                    'confidence': 'Medium',
                    'evidence': f'Appears in {successful_counts[endpoint]} successful trials and 0 failed trials',
                    'recommendation': f'Consider "{endpoint}" as primary endpoint',
                    'impact': 'Potentially strongly associated with success'
                })
        
        # Text pattern analysis for methods mentioned more in successful trials
        successful_text = ' '.join([csr['text'] for csr in successful_csrs])
        failed_text = ' '.join([csr['text'] for csr in failed_csrs])
        
        # Statistical methods pattern
        stat_methods = ['ANOVA', 'regression', 't-test', 'Cox', 'Kaplan-Meier', 
                        'non-inferiority', 'superiority', 'log-rank', 'ITT', 'per-protocol']
        
        for method in stat_methods:
            successful_count = len(re.findall(r'\b' + method + r'\b', successful_text, re.IGNORECASE))
            failed_count = len(re.findall(r'\b' + method + r'\b', failed_text, re.IGNORECASE))
            
            # Normalize by text length
            successful_rate = successful_count / len(successful_text) if successful_text else 0
            failed_rate = failed_count / len(failed_text) if failed_text else 0
            
            if successful_rate > 0 and successful_rate > failed_rate * 2:  # At least twice as common
                patterns.append({
                    'factor': 'Statistical Approach',
                    'description': f'"{method}" statistical approach more common in successful trials',
                    'confidence': 'Medium',
                    'evidence': f'Mentioned {successful_count} times in successful trials vs {failed_count} in failed trials',
                    'recommendation': f'Consider {method} in statistical analysis plan',
                    'impact': 'Associated with higher probability of success'
                })
        
        # Add patterns to results
        self.results['success_patterns'] = patterns
    
    def analyze_endpoints(self) -> None:
        """Analyze endpoint selection and measurement strategies"""
        endpoints = {}
        
        # Extract all primary endpoints
        all_endpoints = []
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('primaryObjective'):
                all_endpoints.append(csr['details']['primaryObjective'])
        
        # Count frequencies
        endpoint_counts = Counter(all_endpoints)
        total_csrs = len(self.matching_csrs)
        
        # Analyze each common endpoint
        for endpoint, count in endpoint_counts.most_common(5):
            # Skip if too rare
            if count < 2:
                continue
                
            endpoint_data = {
                'name': endpoint,
                'frequency': count,
                'frequency_percent': int((count / total_csrs) * 100) if total_csrs > 0 else 0,
                'measurement_methods': self._extract_measurement_methods(endpoint),
                'validation_methods': self._extract_validation_methods(endpoint),
                'success_rate': self._calculate_endpoint_success_rate(endpoint),
                'measurement_challenges': self._extract_measurement_challenges(endpoint),
                'time_to_result': self._estimate_time_to_result(endpoint),
                'regulatory_acceptance': self._analyze_regulatory_acceptance(endpoint)
            }
            
            # Get academic evidence for this endpoint
            endpoint_data['academic_evidence'] = self._get_academic_evidence_for_endpoint(endpoint)
            
            # Add to results
            endpoints[endpoint] = endpoint_data
        
        self.results['endpoint_analysis'] = endpoints
    
    def analyze_statistical_approaches(self) -> None:
        """Analyze statistical methods used in trials"""
        # Extract statistical methods from all CSRs
        all_methods = []
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('statisticalMethods'):
                methods_text = csr['details']['statisticalMethods']
                
                # Extract methods using regex
                method_patterns = [
                    (r'\b(ANOVA|analysis of variance)\b', 'ANOVA'),
                    (r'\b(t-test|t test|student\'s t)\b', 'T-test'),
                    (r'\b(logistic regression|cox regression|linear regression)\b', 'Regression'),
                    (r'\b(survival analysis)\b', 'Survival Analysis'),
                    (r'\b(kaplan-meier|kaplan meier)\b', 'Kaplan-Meier'),
                    (r'\b(log-rank|log rank)\b', 'Log-rank test'),
                    (r'\b(non-inferiority|noninferiority)\b', 'Non-inferiority'),
                    (r'\b(superiority)\b', 'Superiority'),
                    (r'\b(intention to treat|ITT)\b', 'Intention-to-treat'),
                    (r'\b(per-protocol|per protocol)\b', 'Per-protocol'),
                    (r'\b(bayesian)\b', 'Bayesian methods'),
                    (r'\b(mixed model|MMRM)\b', 'Mixed models'),
                    (r'\b(sensitivity analysis)\b', 'Sensitivity analysis')
                ]
                
                for pattern, method_name in method_patterns:
                    if re.search(pattern, methods_text, re.IGNORECASE):
                        all_methods.append(method_name)
        
        # Count frequencies
        method_counts = Counter(all_methods)
        total_csrs = len(self.matching_csrs)
        
        # Calculate success rates for each method
        method_success_rates = {}
        
        for method in set(all_methods):
            # Find CSRs using this method
            csrs_with_method = []
            
            for csr in self.matching_csrs:
                if csr.get('details', {}).get('statisticalMethods'):
                    method_pattern = next((p for p, m in method_patterns if m == method), r'\b' + method + r'\b')
                    if re.search(method_pattern, csr['details']['statisticalMethods'], re.IGNORECASE):
                        csrs_with_method.append(csr)
            
            # Calculate success rate
            successful_count = sum(1 for csr in csrs_with_method if csr.get('status') in ['Successful', 'Completed'])
            
            if csrs_with_method:
                success_rate = (successful_count / len(csrs_with_method)) * 100
                method_success_rates[method] = int(success_rate)
        
        # Compile results
        statistical_strategies = {
            'common_methods': [
                {
                    'method': method,
                    'frequency': count,
                    'percentage': int((count / total_csrs) * 100) if total_csrs > 0 else 0,
                    'success_rate': method_success_rates.get(method, 0)
                }
                for method, count in method_counts.most_common(5)
            ],
            'method_combinations': self._analyze_method_combinations(),
            'approach_recommendations': self._generate_statistical_recommendations()
        }
        
        self.results['statistical_strategies'] = statistical_strategies
    
    def analyze_design_factors(self) -> None:
        """Analyze study design factors and their impact on success"""
        # Extract design types
        design_types = []
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('studyDesign'):
                design_text = csr['details']['studyDesign']
                
                # Extract design patterns
                design_patterns = [
                    (r'\b(double.blind|double-blind)\b', 'Double-blind'),
                    (r'\b(single.blind|single-blind)\b', 'Single-blind'),
                    (r'\b(open.label|open-label)\b', 'Open-label'),
                    (r'\b(randomized|randomised)\b', 'Randomized'),
                    (r'\b(placebo.controlled)\b', 'Placebo-controlled'),
                    (r'\b(active.controlled)\b', 'Active-controlled'),
                    (r'\b(parallel.group|parallel-group)\b', 'Parallel-group'),
                    (r'\b(crossover)\b', 'Crossover'),
                    (r'\b(factorial)\b', 'Factorial'),
                    (r'\b(adaptive)\b', 'Adaptive'),
                    (r'\b(basket)\b', 'Basket'),
                    (r'\b(umbrella)\b', 'Umbrella'),
                    (r'\b(platform)\b', 'Platform')
                ]
                
                for pattern, design_name in design_patterns:
                    if re.search(pattern, design_text, re.IGNORECASE):
                        design_types.append(design_name)
        
        # Count frequencies
        design_counts = Counter(design_types)
        
        # Calculate success rates for each design type
        design_success_rates = {}
        
        for design in set(design_types):
            # Find CSRs using this design
            csrs_with_design = []
            
            for csr in self.matching_csrs:
                if csr.get('details', {}).get('studyDesign'):
                    design_pattern = next((p for p, d in design_patterns if d == design), r'\b' + design + r'\b')
                    if re.search(design_pattern, csr['details']['studyDesign'], re.IGNORECASE):
                        csrs_with_design.append(csr)
            
            # Calculate success rate
            successful_count = sum(1 for csr in csrs_with_design if csr.get('status') in ['Successful', 'Completed'])
            
            if csrs_with_design:
                success_rate = (successful_count / len(csrs_with_design)) * 100
                design_success_rates[design] = int(success_rate)
        
        # Count co-occurring designs (e.g., double-blind AND randomized)
        design_combinations = []
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('studyDesign'):
                design_text = csr['details']['studyDesign']
                
                # Get all designs for this CSR
                csr_designs = []
                for pattern, design_name in design_patterns:
                    if re.search(pattern, design_text, re.IGNORECASE):
                        csr_designs.append(design_name)
                
                # Add all pairs
                if len(csr_designs) >= 2:
                    for i in range(len(csr_designs)):
                        for j in range(i+1, len(csr_designs)):
                            combo = f"{csr_designs[i]} + {csr_designs[j]}"
                            design_combinations.append(combo)
        
        # Count combination frequencies
        combo_counts = Counter(design_combinations)
        
        # Get design insights
        design_insights = []
        
        # Add insights for top design types
        for design, count in design_counts.most_common(3):
            success_rate = design_success_rates.get(design, 0)
            
            design_insights.append({
                'factor': f'{design} Design',
                'usage_rate': f"Used in {int((count / len(self.matching_csrs)) * 100)}% of trials",
                'success_rate': f"{success_rate}% success rate",
                'evidence': f"Based on {count} trials using this design",
                'recommendation': success_rate > 60 
                    ? f"Recommended: {design} design shows strong success correlation"
                    : f"Consider alternatives to {design} design based on success rates"
            })
        
        # Add insights for top combinations
        for combo, count in combo_counts.most_common(2):
            if count < 2:
                continue
                
            design_insights.append({
                'factor': f'Design Combination',
                'usage_rate': f"Used in {int((count / len(self.matching_csrs)) * 100)}% of trials",
                'success_rate': "Not calculated for combinations",
                'evidence': f"Based on {count} trials using {combo}",
                'recommendation': f"Consider {combo} as comprehensive design approach"
            })
        
        # Add recommendation from academic evidence
        academic_design_evidence = self._extract_design_insights_from_academic_evidence()
        if academic_design_evidence:
            design_insights.append(academic_design_evidence)
        
        self.results['design_insights'] = design_insights
    
    def analyze_operational_factors(self) -> None:
        """Analyze operational factors affecting trial success"""
        # Extract operational metrics
        dropout_rates = []
        site_counts = []
        countries = []
        
        for csr in self.matching_csrs:
            details = csr.get('details', {})
            
            # Extract dropout rates
            if details.get('dropoutRate'):
                rate_match = re.search(r'(\d+(?:\.\d+)?)', details['dropoutRate'])
                if rate_match:
                    dropout_rates.append({
                        'rate': float(rate_match.group(1)),
                        'successful': csr.get('status') in ['Successful', 'Completed']
                    })
            
            # Extract site counts
            if details.get('siteCount'):
                count_match = re.search(r'(\d+)', details['siteCount'])
                if count_match:
                    site_counts.append({
                        'count': int(count_match.group(1)),
                        'successful': csr.get('status') in ['Successful', 'Completed']
                    })
            
            # Extract countries
            if details.get('countries'):
                if isinstance(details['countries'], list):
                    countries.extend(details['countries'])
                elif isinstance(details['countries'], str):
                    countries.extend([c.strip() for c in details['countries'].split(',')])
        
        # Analyze dropout rates
        dropout_analysis = {}
        if dropout_rates:
            successful_rates = [d['rate'] for d in dropout_rates if d['successful']]
            failed_rates = [d['rate'] for d in dropout_rates if not d['successful']]
            
            if successful_rates and failed_rates:
                avg_successful = sum(successful_rates) / len(successful_rates)
                avg_failed = sum(failed_rates) / len(failed_rates)
                
                dropout_analysis = {
                    'average_successful_rate': round(avg_successful, 1),
                    'average_failed_rate': round(avg_failed, 1),
                    'target_rate': round(min(avg_successful, avg_failed * 0.9), 1),
                    'impact': 'Significant' if avg_successful < avg_failed * 0.8 else 'Moderate'
                }
        
        # Analyze site counts
        site_analysis = {}
        if site_counts:
            successful_counts = [s['count'] for s in site_counts if s['successful']]
            failed_counts = [s['count'] for s in site_counts if not s['successful']]
            
            if successful_counts:
                avg_successful = sum(successful_counts) / len(successful_counts)
                site_analysis = {
                    'average_site_count': round(avg_successful),
                    'min_recommended': max(3, round(avg_successful * 0.8)),
                    'optimal_range': f"{round(avg_successful * 0.8)}-{round(avg_successful * 1.2)}"
                }
        
        # Analyze country distribution
        country_analysis = {}
        if countries:
            country_counts = Counter(countries)
            most_common = country_counts.most_common(5)
            
            country_analysis = {
                'most_common_countries': [c[0] for c in most_common],
                'geographic_diversity': len(set(countries)),
                'recommendation': 'Single-country' if len(set(countries)) <= 3 else 'Multi-country'
            }
        
        # Compile operational factors
        operational_factors = {
            'dropout_analysis': dropout_analysis,
            'site_analysis': site_analysis,
            'country_analysis': country_analysis,
            'key_success_factors': self._extract_operational_success_factors()
        }
        
        self.results['operational_factors'] = operational_factors
    
    def analyze_competitive_positioning(self) -> None:
        """Analyze competitive positioning based on CSR data"""
        # Group trials by sponsor
        sponsor_trials = defaultdict(list)
        
        for csr in self.matching_csrs:
            if csr.get('sponsor'):
                sponsor_trials[csr['sponsor']].append(csr)
        
        # Filter out own sponsor
        if self.sponsor:
            sponsor_trials.pop(self.sponsor, None)
        
        # Get top competitors by trial count
        top_competitors = []
        
        for sponsor, trials in sorted(sponsor_trials.items(), key=lambda x: len(x[1]), reverse=True)[:5]:
            # Calculate success rate
            success_count = sum(1 for t in trials if t.get('status') in ['Successful', 'Completed'])
            success_rate = int((success_count / len(trials)) * 100) if trials else 0
            
            # Extract endpoints
            endpoints = []
            for trial in trials:
                if trial.get('details', {}).get('primaryObjective'):
                    endpoints.append(trial['details']['primaryObjective'])
            
            # Get most common endpoints
            common_endpoints = [e for e, _ in Counter(endpoints).most_common(2)] if endpoints else []
            
            top_competitors.append({
                'name': sponsor,
                'trial_count': len(trials),
                'success_rate': success_rate,
                'common_endpoints': common_endpoints,
                'most_recent_trial': trials[0]['title'] if trials else ''
            })
        
        # Identify differentiating factors
        differentiating_factors = self._identify_differentiating_factors()
        
        # Compile competitive positioning data
        competitive_positioning = {
            'top_competitors': top_competitors,
            'differentiating_factors': differentiating_factors,
            'market_gaps': self._identify_market_gaps(),
            'positioning_strategy': self._recommend_positioning_strategy()
        }
        
        self.results['competitive_positioning'] = competitive_positioning
    
    def calculate_success_probability(self) -> None:
        """Calculate success probability based on multiple factors"""
        # Base probability for this phase
        base_probability = self._get_base_probability_for_phase()
        
        # Factor adjustments
        adjustments = []
        
        # Sample size factor
        own_sample_size = self._get_protocol_sample_size()
        if own_sample_size:
            successful_sizes = []
            for csr in self.matching_csrs:
                if csr.get('status') in ['Successful', 'Completed'] and csr.get('details', {}).get('sampleSize'):
                    size_match = re.search(r'(\d+)', csr['details']['sampleSize'])
                    if size_match:
                        successful_sizes.append(int(size_match.group(1)))
            
            if successful_sizes:
                avg_successful = sum(successful_sizes) / len(successful_sizes)
                if own_sample_size >= avg_successful:
                    adjustments.append({
                        'factor': 'Sample Size',
                        'impact': +5,
                        'explanation': f'Sample size ({own_sample_size}) meets or exceeds average for successful trials ({int(avg_successful)})'
                    })
                elif own_sample_size >= avg_successful * 0.8:
                    adjustments.append({
                        'factor': 'Sample Size',
                        'impact': 0,
                        'explanation': f'Sample size ({own_sample_size}) is close to average for successful trials ({int(avg_successful)})'
                    })
                else:
                    adjustments.append({
                        'factor': 'Sample Size',
                        'impact': -10,
                        'explanation': f'Sample size ({own_sample_size}) is below average for successful trials ({int(avg_successful)})'
                    })
        
        # Endpoint factor
        own_endpoint = self._get_protocol_endpoint()
        if own_endpoint:
            endpoint_success_rates = {}
            for endpoint in set([csr.get('details', {}).get('primaryObjective') for csr in self.matching_csrs if csr.get('details', {}).get('primaryObjective')]):
                csrs_with_endpoint = [csr for csr in self.matching_csrs if csr.get('details', {}).get('primaryObjective') == endpoint]
                successful_count = sum(1 for csr in csrs_with_endpoint if csr.get('status') in ['Successful', 'Completed'])
                if csrs_with_endpoint:
                    endpoint_success_rates[endpoint] = (successful_count / len(csrs_with_endpoint)) * 100
            
            if own_endpoint in endpoint_success_rates:
                success_rate = endpoint_success_rates[own_endpoint]
                if success_rate >= 70:
                    adjustments.append({
                        'factor': 'Endpoint Selection',
                        'impact': +10,
                        'explanation': f'Selected endpoint "{own_endpoint}" has high historical success rate ({int(success_rate)}%)'
                    })
                elif success_rate >= 50:
                    adjustments.append({
                        'factor': 'Endpoint Selection',
                        'impact': +5,
                        'explanation': f'Selected endpoint "{own_endpoint}" has moderate historical success rate ({int(success_rate)}%)'
                    })
                else:
                    adjustments.append({
                        'factor': 'Endpoint Selection',
                        'impact': -5,
                        'explanation': f'Selected endpoint "{own_endpoint}" has low historical success rate ({int(success_rate)}%)'
                    })
        
        # Design factor
        own_design = self._get_protocol_design()
        if own_design:
            design_patterns = [
                (r'\b(double.blind|double-blind)\b', 'Double-blind'),
                (r'\b(randomized|randomised)\b', 'Randomized'),
                (r'\b(placebo.controlled)\b', 'Placebo-controlled')
            ]
            
            design_elements = []
            for pattern, design_name in design_patterns:
                if re.search(pattern, own_design, re.IGNORECASE):
                    design_elements.append(design_name)
            
            if 'Double-blind' in design_elements and 'Randomized' in design_elements:
                adjustments.append({
                    'factor': 'Study Design',
                    'impact': +5,
                    'explanation': 'Double-blind randomized design correlated with higher success'
                })
            elif 'Randomized' in design_elements:
                adjustments.append({
                    'factor': 'Study Design',
                    'impact': +3,
                    'explanation': 'Randomized design provides methodological rigor'
                })
        
        # Calculate total adjustment
        total_adjustment = sum(adj['impact'] for adj in adjustments)
        
        # Calculate final probability
        final_probability = max(1, min(99, base_probability + total_adjustment))
        
        # Add confidence interval
        confidence_interval = f"{max(1, final_probability - 10)}% - {min(99, final_probability + 10)}%"
        
        self.results['success_probability'] = {
            'base_probability': base_probability,
            'adjustments': adjustments,
            'final_probability': final_probability,
            'confidence_interval': confidence_interval,
            'evaluation': self._evaluate_success_probability(final_probability)
        }
    
    def generate_implementation_recommendations(self) -> None:
        """Generate implementation recommendations based on all analyses"""
        recommendations = []
        
        # Sample size recommendation
        if self.results.get('success_patterns'):
            sample_size_pattern = next((p for p in self.results['success_patterns'] if p['factor'] == 'Sample Size'), None)
            if sample_size_pattern:
                recommendations.append({
                    'area': 'Sample Size',
                    'recommendation': sample_size_pattern.get('recommendation', ''),
                    'rationale': sample_size_pattern.get('description', ''),
                    'implementation': 'Ensure statistical power calculation accounts for estimated effect size and dropout',
                    'priority': 'High'
                })
        
        # Endpoint recommendation
        endpoint_analysis = self.results.get('endpoint_analysis', {})
        if endpoint_analysis:
            # Find endpoint with highest success rate
            best_endpoint = None
            best_rate = 0
            
            for endpoint, data in endpoint_analysis.items():
                if data.get('success_rate', 0) > best_rate:
                    best_rate = data.get('success_rate', 0)
                    best_endpoint = endpoint
            
            if best_endpoint and best_rate > 50:
                endpoint_data = endpoint_analysis[best_endpoint]
                recommendations.append({
                    'area': 'Endpoint Selection',
                    'recommendation': f'Use "{best_endpoint}" as primary endpoint',
                    'rationale': f'Has {best_rate}% historical success rate in similar trials',
                    'implementation': (f'Measure using {endpoint_data.get("measurement_methods", [])[0]}' 
                                    if endpoint_data.get('measurement_methods') else
                                    'Standardize measurement protocol across all sites'),
                    'priority': 'High'
                })
        
        # Statistical approach recommendation
        stat_strategies = self.results.get('statistical_strategies', {})
        if stat_strategies and stat_strategies.get('common_methods'):
            best_method = None
            best_rate = 0
            
            for method in stat_strategies.get('common_methods', []):
                if method.get('success_rate', 0) > best_rate:
                    best_rate = method.get('success_rate', 0)
                    best_method = method.get('method')
            
            if best_method and best_rate > 50:
                recommendations.append({
                    'area': 'Statistical Approach',
                    'recommendation': f'Use {best_method} for primary analysis',
                    'rationale': f'Associated with {best_rate}% success rate in similar trials',
                    'implementation': 'Document approach in Statistical Analysis Plan with sensitivity analyses',
                    'priority': 'Medium'
                })
        
        # Operational recommendation
        op_factors = self.results.get('operational_factors', {})
        if op_factors and op_factors.get('dropout_analysis'):
            dropout = op_factors.get('dropout_analysis', {})
            if dropout.get('target_rate'):
                recommendations.append({
                    'area': 'Dropout Prevention',
                    'recommendation': f'Target dropout rate below {dropout.get("target_rate")}%',
                    'rationale': f'Successful trials averaged {dropout.get("average_successful_rate")}% vs {dropout.get("average_failed_rate")}% in failed trials',
                    'implementation': 'Implement patient retention strategies including regular follow-up, minimized visit burden, and patient engagement',
                    'priority': 'Medium'
                })
        
        # Add from academic evidence
        academic_recs = self._extract_academic_recommendations()
        if academic_recs:
            recommendations.extend(academic_recs)
        
        self.results['implementation_recommendations'] = recommendations
    
    def _extract_sample_sizes(self, csrs: List[Dict[str, Any]]) -> List[int]:
        """Extract sample sizes from CSR data"""
        sample_sizes = []
        
        for csr in csrs:
            csr_id = csr.get('id')
            if not csr_id:
                continue
                
            # Find the original CSR with details
            original_csr = next((c for c in self.matching_csrs if c.get('id') == csr_id), None)
            if not original_csr:
                continue
                
            details = original_csr.get('details', {})
            if details.get('sampleSize'):
                size_match = re.search(r'(\d+)', details['sampleSize'])
                if size_match:
                    sample_sizes.append(int(size_match.group(1)))
        
        return sample_sizes
    
    def _extract_durations(self, csrs: List[Dict[str, Any]]) -> List[int]:
        """Extract durations from CSR data"""
        durations = []
        
        for csr in csrs:
            csr_id = csr.get('id')
            if not csr_id:
                continue
                
            # Find the original CSR with details
            original_csr = next((c for c in self.matching_csrs if c.get('id') == csr_id), None)
            if not original_csr:
                continue
                
            details = original_csr.get('details', {})
            if details.get('duration'):
                duration_match = re.search(r'(\d+)', details['duration'])
                if duration_match:
                    durations.append(int(duration_match.group(1)))
        
        return durations
    
    def _extract_endpoints(self, csrs: List[Dict[str, Any]]) -> List[str]:
        """Extract endpoints from CSR data"""
        endpoints = []
        
        for csr in csrs:
            csr_id = csr.get('id')
            if not csr_id:
                continue
                
            # Find the original CSR with details
            original_csr = next((c for c in self.matching_csrs if c.get('id') == csr_id), None)
            if not original_csr:
                continue
                
            details = original_csr.get('details', {})
            if details.get('primaryObjective'):
                endpoints.append(details['primaryObjective'])
        
        return endpoints
    
    def _extract_measurement_methods(self, endpoint: str) -> List[str]:
        """Extract measurement methods for an endpoint"""
        methods = []
        
        # Look for measurement methods in CSRs with this endpoint
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('primaryObjective') == endpoint:
                # Get text
                text_fields = [
                    csr.get('details', {}).get('studyDescription', ''),
                    csr.get('details', {}).get('efficacyResults', ''),
                    csr.get('details', {}).get('discussionAndConclusions', '')
                ]
                
                text = ' '.join([t for t in text_fields if t])
                
                # Look for measurement patterns
                measurement_patterns = [
                    (r'measured (?:using|with|by) ([\w\s\-]+)', 1),
                    (r'assessed (?:using|with|by) ([\w\s\-]+)', 1),
                    (r'([\w\s\-]+) scale', 1),
                    (r'([\w\s\-]+) questionnaire', 1),
                    (r'([\w\s\-]+) instrument', 1)
                ]
                
                for pattern, group in measurement_patterns:
                    matches = re.finditer(pattern, text, re.IGNORECASE)
                    for match in matches:
                        if match.group(group):
                            # Limit the length to avoid pulling in too much text
                            method = match.group(group)[:50].strip()
                            methods.append(method)
        
        # Return unique methods
        return list(set(methods))
    
    def _extract_validation_methods(self, endpoint: str) -> List[str]:
        """Extract validation methods for an endpoint"""
        validations = []
        
        # Look for validation methods in CSRs with this endpoint
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('primaryObjective') == endpoint:
                # Get text
                text_fields = [
                    csr.get('details', {}).get('studyDescription', ''),
                    csr.get('details', {}).get('discussionAndConclusions', '')
                ]
                
                text = ' '.join([t for t in text_fields if t])
                
                # Look for validation patterns
                validation_patterns = [
                    (r'validated (?:using|with|by) ([\w\s\-]+)', 1),
                    (r'validation (?:using|with|by) ([\w\s\-]+)', 1),
                    (r'clinically validated ([\w\s\-]+)', 1),
                    (r'([\w\s\-]+) was validated', 1)
                ]
                
                for pattern, group in validation_patterns:
                    matches = re.finditer(pattern, text, re.IGNORECASE)
                    for match in matches:
                        if match.group(group):
                            # Limit the length to avoid pulling in too much text
                            validation = match.group(group)[:50].strip()
                            validations.append(validation)
        
        # Return unique validations
        return list(set(validations))
    
    def _calculate_endpoint_success_rate(self, endpoint: str) -> int:
        """Calculate success rate for a specific endpoint"""
        csrs_with_endpoint = [
            csr for csr in self.matching_csrs 
            if csr.get('details', {}).get('primaryObjective') == endpoint
        ]
        
        successful_count = sum(
            1 for csr in csrs_with_endpoint 
            if csr.get('status') in ['Successful', 'Completed']
        )
        
        if csrs_with_endpoint:
            return int((successful_count / len(csrs_with_endpoint)) * 100)
        
        return 0
    
    def _extract_measurement_challenges(self, endpoint: str) -> List[str]:
        """Extract measurement challenges for an endpoint"""
        challenges = []
        
        # Look for challenges in CSRs with this endpoint
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('primaryObjective') == endpoint:
                # Get text
                text_fields = [
                    csr.get('details', {}).get('discussionAndConclusions', ''),
                    csr.get('details', {}).get('limitations', '')
                ]
                
                text = ' '.join([t for t in text_fields if t])
                
                # Look for challenge patterns
                challenge_patterns = [
                    r'challenge(?:s)? (?:in|with|for) (?:measuring|assessing) ([\w\s\-]+)',
                    r'limitation(?:s)? (?:in|with|for) (?:measuring|assessing) ([\w\s\-]+)',
                    r'difficult(?:y)? (?:in|with) (?:measuring|assessing) ([\w\s\-]+)',
                    r'([\w\s\-]+) was challenging to measure',
                    r'([\w\s\-]+) was difficult to assess'
                ]
                
                for pattern in challenge_patterns:
                    matches = re.finditer(pattern, text, re.IGNORECASE)
                    for match in matches:
                        if match.group(1):
                            # Get some context (40 chars before and after)
                            start = max(0, match.start() - 40)
                            end = min(len(text), match.end() + 40)
                            context = text[start:end].strip()
                            challenges.append(context)
        
        # Return unique challenges
        return list(set(challenges))
    
    def _estimate_time_to_result(self, endpoint: str) -> Dict[str, any]:
        """Estimate time to result for an endpoint"""
        # Get durations for trials with this endpoint
        durations = []
        
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('primaryObjective') == endpoint:
                if csr.get('details', {}).get('duration'):
                    duration_match = re.search(r'(\d+)', csr['details']['duration'])
                    if duration_match:
                        durations.append(int(duration_match.group(1)))
        
        if not durations:
            # Estimate based on endpoint name
            if re.search(r'survival|mortality|death', endpoint, re.IGNORECASE):
                return {
                    'estimated_weeks': 104,
                    'range': '52-156 weeks',
                    'confidence': 'Medium',
                    'notes': 'Based on typical survival endpoint timeframes'
                }
            elif re.search(r'progression|free|disease', endpoint, re.IGNORECASE):
                return {
                    'estimated_weeks': 52,
                    'range': '26-78 weeks',
                    'confidence': 'Medium',
                    'notes': 'Based on typical progression endpoint timeframes'
                }
            elif re.search(r'response|improvement', endpoint, re.IGNORECASE):
                return {
                    'estimated_weeks': 24,
                    'range': '12-36 weeks',
                    'confidence': 'Medium',
                    'notes': 'Based on typical response endpoint timeframes'
                }
            else:
                return {
                    'estimated_weeks': 26,
                    'range': '12-52 weeks',
                    'confidence': 'Low',
                    'notes': 'Generic estimate, no specific data available'
                }
        
        # Calculate statistics
        avg = sum(durations) / len(durations)
        median = sorted(durations)[len(durations) // 2]
        min_val = min(durations)
        max_val = max(durations)
        
        return {
            'estimated_weeks': int(median),
            'range': f"{min_val}-{max_val} weeks",
            'confidence': 'High' if len(durations) >= 3 else 'Medium',
            'notes': f"Based on {len(durations)} trials using this endpoint"
        }
    
    def _analyze_regulatory_acceptance(self, endpoint: str) -> Dict[str, any]:
        """Analyze regulatory acceptance for an endpoint"""
        # Analyze if endpoint is used in successful trials
        csrs_with_endpoint = [
            csr for csr in self.matching_csrs 
            if csr.get('details', {}).get('primaryObjective') == endpoint
        ]
        
        successful_csrs = [
            csr for csr in csrs_with_endpoint 
            if csr.get('status') in ['Successful', 'Completed']
        ]
        
        success_count = len(successful_csrs)
        total_count = len(csrs_with_endpoint)
        
        # Success rate
        success_rate = int((success_count / total_count) * 100) if total_count > 0 else 0
        
        # Determine acceptance level
        acceptance_level = 'Low'
        if success_rate >= 70:
            acceptance_level = 'High'
        elif success_rate >= 50:
            acceptance_level = 'Medium'
        
        # Look for regulatory mentions in text
        regulatory_mentions = []
        for csr in csrs_with_endpoint:
            text_fields = [
                csr.get('details', {}).get('discussionAndConclusions', ''),
                csr.get('details', {}).get('regulatoryNotes', '')
            ]
            
            text = ' '.join([t for t in text_fields if t])
            
            # Look for mentions of regulatory bodies
            reg_patterns = [
                r'FDA',
                r'EMA',
                r'regulatory (?:approval|acceptance)',
                r'(?:approved|accepted) by regulatory',
                r'(?:submitted|submission) to regulatory'
            ]
            
            for pattern in reg_patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    # Extract sentence with match
                    sentences = re.split(r'(?<=[.!?])\s+', text)
                    for sentence in sentences:
                        if re.search(pattern, sentence, re.IGNORECASE):
                            regulatory_mentions.append(sentence.strip())
        
        return {
            'acceptance_level': acceptance_level,
            'success_rate': success_rate,
            'successful_trials': success_count,
            'total_trials': total_count,
            'regulatory_mentions': regulatory_mentions[:3]  # Limit to top 3
        }
    
    def _get_academic_evidence_for_endpoint(self, endpoint: str) -> List[Dict[str, Any]]:
        """Get relevant academic evidence for an endpoint"""
        relevant_evidence = []
        
        # Look through academic evidence
        for source in self.academic_evidence:
            # Skip if no excerpts
            if 'excerpts' not in source:
                continue
                
            # Check if any excerpt mentions the endpoint
            endpoint_excerpts = []
            for excerpt in source.get('excerpts', []):
                # Check if excerpt contains the endpoint or related terms
                endpoint_terms = [endpoint] + self._generate_related_terms(endpoint)
                
                if any(term.lower() in excerpt.lower() for term in endpoint_terms):
                    endpoint_excerpts.append(excerpt)
            
            # Add if we found relevant excerpts
            if endpoint_excerpts:
                relevant_evidence.append({
                    'title': source.get('title', ''),
                    'author': source.get('author', ''),
                    'date': source.get('date', ''),
                    'type': source.get('type', ''),
                    'url': source.get('url', ''),
                    'excerpts': endpoint_excerpts[:2]  # Limit to top 2 excerpts
                })
        
        # Sort by recency
        relevant_evidence.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        return relevant_evidence[:3]  # Return top 3 sources
    
    def _generate_related_terms(self, term: str) -> List[str]:
        """Generate related terms for a given term"""
        # Split into words
        words = re.findall(r'\w+', term.lower())
        
        # Generate related forms
        related = []
        
        # Add singular/plural variants
        for word in words:
            if word.endswith('s'):
                related.append(word[:-1])
            else:
                related.append(word + 's')
        
        # Add common synonyms for endpoints
        endpoint_synonyms = {
            'survival': ['mortality', 'death', 'fatality'],
            'response': ['improvement', 'benefit', 'effect'],
            'progression': ['advancement', 'deterioration', 'worsening'],
            'rate': ['frequency', 'incidence', 'proportion'],
            'reduction': ['decrease', 'decline', 'lowering'],
            'improvement': ['enhancement', 'benefit', 'amelioration'],
            'score': ['measurement', 'index', 'rating']
        }
        
        for word in words:
            if word in endpoint_synonyms:
                related.extend(endpoint_synonyms[word])
        
        return related
    
    def _analyze_method_combinations(self) -> List[Dict[str, Any]]:
        """Analyze common statistical method combinations"""
        # Extract combinations from text
        combinations = []
        
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('statisticalMethods'):
                methods_text = csr['details']['statisticalMethods']
                
                # Check for common combinations
                combination_patterns = [
                    (r'\b(ANOVA).*\b(regression)\b', 'ANOVA + Regression'),
                    (r'\b(log-rank).*\b(Cox)\b', 'Log-rank + Cox regression'),
                    (r'\b(Kaplan-Meier).*\b(log-rank)\b', 'Kaplan-Meier + Log-rank'),
                    (r'\b(t-test).*\b(chi-square)\b', 'T-test + Chi-square'),
                    (r'\b(ITT).*\b(per-protocol)\b', 'ITT + Per-protocol')
                ]
                
                for pattern, combo_name in combination_patterns:
                    if re.search(pattern, methods_text, re.IGNORECASE):
                        successful = csr.get('status') in ['Successful', 'Completed']
                        combinations.append({
                            'name': combo_name,
                            'successful': successful
                        })
        
        # Count frequencies
        combo_counts = {}
        combo_success = {}
        
        for combo in combinations:
            name = combo['name']
            if name not in combo_counts:
                combo_counts[name] = 0
                combo_success[name] = 0
            
            combo_counts[name] += 1
            if combo['successful']:
                combo_success[name] += 1
        
        # Format results
        results = []
        
        for name, count in combo_counts.items():
            success_rate = int((combo_success[name] / count) * 100) if count > 0 else 0
            results.append({
                'combination': name,
                'frequency': count,
                'success_rate': success_rate,
                'recommendation': 'Recommended' if success_rate >= 60 else 'Consider with caution'
            })
        
        # Sort by success rate
        results.sort(key=lambda x: x['success_rate'], reverse=True)
        
        return results
    
    def _generate_statistical_recommendations(self) -> List[Dict[str, Any]]:
        """Generate statistical approach recommendations"""
        recommendations = []
        
        # Look for common approaches in successful trials
        successful_texts = [
            csr.get('details', {}).get('statisticalMethods', '')
            for csr in self.matching_csrs
            if csr.get('status') in ['Successful', 'Completed']
            and csr.get('details', {}).get('statisticalMethods')
        ]
        
        # Combine and analyze
        if successful_texts:
            all_text = ' '.join(successful_texts)
            
            # Look for common recommendation patterns
            recommendation_patterns = [
                (r'(?:data|values) (?:were|was) (?:imputed|estimated|calculated) using ([\w\s\-]+)', 'Missing data handling'),
                (r'(?:sensitivity|subgroup) analysis (?:was|were) performed using ([\w\s\-]+)', 'Sensitivity analysis'),
                (r'(?:significance|significance level|alpha) (?:was|were) set at ([\w\s\-\d\.]+)', 'Significance threshold'),
                (r'(?:adjusted|corrected) for ([\w\s\-]+)', 'Multiple comparisons'),
                (r'(?:interim|futility) analysis', 'Interim analysis')
            ]
            
            for pattern, category in recommendation_patterns:
                matches = re.finditer(pattern, all_text, re.IGNORECASE)
                for match in matches:
                    if match.groups():
                        detail = match.group(1).strip()
                        recommendations.append({
                            'category': category,
                            'approach': detail,
                            'rationale': 'Commonly used in successful trials',
                            'implementation': f'Include in Statistical Analysis Plan'
                        })
                    else:
                        recommendations.append({
                            'category': category,
                            'approach': 'Recommended approach',
                            'rationale': 'Used in successful trials',
                            'implementation': f'Include in Statistical Analysis Plan'
                        })
        
        # Add recommendation from academic evidence
        academic_stat_evidence = self._extract_statistical_insights_from_academic_evidence()
        if academic_stat_evidence:
            recommendations.append(academic_stat_evidence)
        
        # Remove duplicates by category
        unique_recommendations = []
        categories_seen = set()
        
        for rec in recommendations:
            if rec['category'] not in categories_seen:
                unique_recommendations.append(rec)
                categories_seen.add(rec['category'])
        
        return unique_recommendations
    
    def _extract_design_insights_from_academic_evidence(self) -> Dict[str, Any]:
        """Extract design insights from academic evidence"""
        # Look for design-related evidence
        design_evidence = []
        
        design_keywords = ['design', 'methodology', 'protocol', 'randomized', 'blinded']
        
        for source in self.academic_evidence:
            if 'excerpts' not in source:
                continue
                
            # Check if any excerpt mentions design
            for excerpt in source.get('excerpts', []):
                if any(keyword in excerpt.lower() for keyword in design_keywords):
                    design_evidence.append({
                        'title': source.get('title', ''),
                        'author': source.get('author', ''),
                        'date': source.get('date', ''),
                        'excerpt': excerpt
                    })
        
        # Sort by recency
        design_evidence.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        # Return top insight if available
        if design_evidence:
            evidence = design_evidence[0]
            return {
                'factor': 'Academic Design Insight',
                'usage_rate': 'From published literature',
                'success_rate': 'Not applicable',
                'evidence': f"{evidence['author']} ({evidence['date']}): {evidence['excerpt']}",
                'recommendation': f"Consider design approach from recent literature: {evidence['title']}"
            }
        
        return None
    
    def _extract_statistical_insights_from_academic_evidence(self) -> Dict[str, Any]:
        """Extract statistical insights from academic evidence"""
        # Look for statistics-related evidence
        stat_evidence = []
        
        stat_keywords = ['statistical', 'analysis', 'power', 'sample size', 'significance']
        
        for source in self.academic_evidence:
            if 'excerpts' not in source:
                continue
                
            # Check if any excerpt mentions statistics
            for excerpt in source.get('excerpts', []):
                if any(keyword in excerpt.lower() for keyword in stat_keywords):
                    stat_evidence.append({
                        'title': source.get('title', ''),
                        'author': source.get('author', ''),
                        'date': source.get('date', ''),
                        'excerpt': excerpt
                    })
        
        # Sort by recency
        stat_evidence.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        # Return top insight if available
        if stat_evidence:
            evidence = stat_evidence[0]
            return {
                'category': 'Evidence-based approach',
                'approach': f"Recent literature recommendation",
                'rationale': f"{evidence['author']} ({evidence['date']}): {evidence['excerpt']}",
                'implementation': f"Apply approach from: {evidence['title']}"
            }
        
        return None
    
    def _extract_operational_success_factors(self) -> List[Dict[str, Any]]:
        """Extract operational success factors from CSR data"""
        factors = []
        
        # Extract site management information
        site_texts = []
        for csr in self.matching_csrs:
            if csr.get('status') in ['Successful', 'Completed']:
                details = csr.get('details', {})
                text_fields = [
                    details.get('studyDescription', ''),
                    details.get('discussionAndConclusions', '')
                ]
                
                site_texts.extend([t for t in text_fields if t])
        
        # Combined text
        combined_text = ' '.join(site_texts)
        
        # Extract operational patterns
        operational_patterns = [
            (r'(?:site|center) (?:monitoring|management) ([\w\s\-]+)', 'Site Management'),
            (r'(?:recruitment|enrollment) (?:strategy|approach) ([\w\s\-]+)', 'Recruitment Strategy'),
            (r'(?:retention|compliance) (?:strategy|approach) ([\w\s\-]+)', 'Patient Retention'),
            (r'(?:data|quality) (?:monitoring|management) ([\w\s\-]+)', 'Data Quality')
        ]
        
        for pattern, category in operational_patterns:
            matches = re.finditer(pattern, combined_text, re.IGNORECASE)
            for match in matches:
                if match.groups():
                    approach = match.group(1).strip()
                    # Get context (40 chars before and after)
                    start = max(0, match.start() - 40)
                    end = min(len(combined_text), match.end() + 40)
                    context = combined_text[start:end].strip()
                    
                    factors.append({
                        'factor': category,
                        'approach': approach,
                        'context': context,
                        'source': 'Successful trial practices'
                    })
        
        # If no factors found, add generic ones
        if not factors:
            factors = [
                {
                    'factor': 'Site Selection',
                    'approach': 'Prioritize sites with proven recruitment capabilities',
                    'context': 'High-performing sites correlate with successful trials',
                    'source': 'Industry best practice'
                },
                {
                    'factor': 'Patient Retention',
                    'approach': 'Implement patient-centric visit schedules',
                    'context': 'Reducing patient burden improves retention rates',
                    'source': 'Industry best practice'
                }
            ]
        
        return factors
    
    def _identify_differentiating_factors(self) -> List[Dict[str, Any]]:
        """Identify factors that differentiate from competitors"""
        differentiating_factors = []
        
        # Extract endpoints
        own_endpoints = []
        if self.protocol_data.get('primaryObjective'):
            own_endpoints.append(self.protocol_data.get('primaryObjective'))
        
        if self.protocol_data.get('endpoints'):
            if isinstance(self.protocol_data.get('endpoints'), list):
                own_endpoints.extend(self.protocol_data.get('endpoints'))
            elif isinstance(self.protocol_data.get('endpoints'), str):
                own_endpoints.append(self.protocol_data.get('endpoints'))
        
        # Extract competitor endpoints
        competitor_endpoints = []
        for csr in self.matching_csrs:
            if self.sponsor and csr.get('sponsor') != self.sponsor:
                if csr.get('details', {}).get('primaryObjective'):
                    competitor_endpoints.append(csr['details']['primaryObjective'])
        
        # Find unique endpoints
        unique_endpoints = [e for e in own_endpoints if e not in competitor_endpoints]
        
        if unique_endpoints:
            differentiating_factors.append({
                'factor': 'Unique Endpoint',
                'description': f'"{unique_endpoints[0]}" not used by competitors',
                'advantage': 'Potential for differentiated positioning',
                'implementation': 'Ensure robust validation and measurement protocol'
            })
        
        # Extract own design elements
        own_design = self.protocol_data.get('studyDesign', '')
        
        if own_design:
            # Look for innovative design elements
            innovative_patterns = [
                r'\b(adaptive)\b',
                r'\b(basket)\b',
                r'\b(umbrella)\b',
                r'\b(platform)\b',
                r'\b(novel)\b',
                r'\b(innovative)\b',
                r'\b(digital)\b',
                r'\b(decentralized)\b'
            ]
            
            for pattern in innovative_patterns:
                if re.search(pattern, own_design, re.IGNORECASE):
                    # Get the match
                    match = re.search(pattern, own_design, re.IGNORECASE)
                    if match:
                        design_element = match.group(1)
                        
                        differentiating_factors.append({
                            'factor': 'Innovative Design',
                            'description': f'{design_element.capitalize()} design approach',
                            'advantage': 'Methodological innovation compared to standard designs',
                            'implementation': 'Ensure regulatory acceptance through early engagement'
                        })
                        break
        
        # Add generic factor if none found
        if not differentiating_factors:
            differentiating_factors.append({
                'factor': 'Efficiency Opportunity',
                'description': 'Streamlined operational execution',
                'advantage': 'Faster time to completion than industry average',
                'implementation': 'Implement optimized site selection and management'
            })
        
        return differentiating_factors
    
    def _identify_market_gaps(self) -> List[Dict[str, Any]]:
        """Identify gaps in the market based on analysis"""
        gaps = []
        
        # Look for endpoint gaps
        all_endpoints = []
        for csr in self.matching_csrs:
            if csr.get('details', {}).get('primaryObjective'):
                all_endpoints.append(csr['details']['primaryObjective'])
        
        # Check if patient-reported outcomes are underrepresented
        pro_terms = ['patient-reported', 'quality of life', 'functioning', 'symptom burden']
        pro_count = sum(1 for endpoint in all_endpoints if any(term in endpoint.lower() for term in pro_terms))
        
        if pro_count < len(all_endpoints) * 0.2:  # Less than 20% use PROs
            gaps.append({
                'gap': 'Patient-Reported Outcomes',
                'description': 'Underutilization of patient-reported outcomes',
                'opportunity': 'Differentiate by including patient perspective',
                'implementation': 'Add validated PRO measures as secondary endpoints'
            })
        
        # Check if digital endpoints are underrepresented
        digital_terms = ['digital', 'wearable', 'sensor', 'app', 'remote', 'continuous']
        digital_count = sum(1 for endpoint in all_endpoints if any(term in endpoint.lower() for term in digital_terms))
        
        if digital_count < len(all_endpoints) * 0.1:  # Less than 10% use digital
            gaps.append({
                'gap': 'Digital Endpoints',
                'description': 'Limited use of digital biomarkers or measurements',
                'opportunity': 'Incorporate novel digital measurements',
                'implementation': 'Explore validated digital endpoints as exploratory measures'
            })
        
        # Check for combination endpoint opportunity
        if len(set(all_endpoints)) > 3:
            gaps.append({
                'gap': 'Composite Endpoints',
                'description': 'Separate assessment of related outcomes',
                'opportunity': 'Develop composite endpoint combining related measures',
                'implementation': 'Create validated composite incorporating key individual endpoints'
            })
        
        # Add academic gap if available
        academic_gap = self._extract_gap_from_academic_evidence()
        if academic_gap:
            gaps.append(academic_gap)
        
        return gaps
    
    def _extract_gap_from_academic_evidence(self) -> Dict[str, Any]:
        """Extract market gap insights from academic evidence"""
        gap_keywords = ['gap', 'unmet', 'need', 'opportunity', 'limitation', 'challenge']
        
        for source in self.academic_evidence:
            if 'excerpts' not in source:
                continue
                
            # Check if any excerpt mentions gaps
            for excerpt in source.get('excerpts', []):
                if any(keyword in excerpt.lower() for keyword in gap_keywords):
                    return {
                        'gap': 'Literature-Identified Need',
                        'description': excerpt[:100] + '...' if len(excerpt) > 100 else excerpt,
                        'opportunity': f"Address need identified in {source.get('title', '')}",
                        'implementation': f"Follow approach suggested by {source.get('author', '')}"
                    }
        
        return None
    
    def _recommend_positioning_strategy(self) -> Dict[str, Any]:
        """Recommend positioning strategy based on analysis"""
        # Default positioning options
        positioning_options = [
            'Efficacy Superiority',
            'Safety Advantage',
            'Novel Mechanism',
            'Patient Experience',
            'Operational Excellence'
        ]
        
        # Analyze CSR data for positioning insights
        successful_text = ' '.join([
            csr.get('details', {}).get('discussionAndConclusions', '')
            for csr in self.matching_csrs
            if csr.get('status') in ['Successful', 'Completed']
            and csr.get('details', {}).get('discussionAndConclusions')
        ])
        
        # Check for positioning indicators in successful trials
        positioning_indicators = {
            'Efficacy Superiority': ['superior', 'more effective', 'greater efficacy', 'higher response'],
            'Safety Advantage': ['safer', 'better tolerated', 'fewer adverse', 'less toxicity'],
            'Novel Mechanism': ['novel mechanism', 'new approach', 'innovative', 'first in class'],
            'Patient Experience': ['quality of life', 'patient-reported', 'convenience', 'preference'],
            'Operational Excellence': ['efficient', 'streamlined', 'faster', 'cost-effective']
        }
        
        # Count mentions of each indicator
        indicator_counts = {}
        for position, terms in positioning_indicators.items():
            count = sum(successful_text.lower().count(term) for term in terms)
            indicator_counts[position] = count
        
        # Select top positioning
        if indicator_counts:
            top_position = max(indicator_counts.items(), key=lambda x: x[1])
            if top_position[1] > 0:
                selected_position = top_position[0]
            else:
                # Fall back to default based on phase
                if self.phase.lower() in ['phase 1', 'phase i']:
                    selected_position = 'Safety Advantage'
                elif self.phase.lower() in ['phase 2', 'phase ii']:
                    selected_position = 'Efficacy Superiority'
                else:
                    selected_position = 'Patient Experience'
        else:
            # Fall back to default based on phase
            if self.phase.lower() in ['phase 1', 'phase i']:
                selected_position = 'Safety Advantage'
            elif self.phase.lower() in ['phase 2', 'phase ii']:
                selected_position = 'Efficacy Superiority'
            else:
                selected_position = 'Patient Experience'
        
        # Generate positioning strategies
        positioning_strategies = {
            'Efficacy Superiority': {
                'tagline': 'Superior Efficacy for Improved Outcomes',
                'evidence_needed': 'Comparative effectiveness data',
                'trial_design_implications': 'Include active comparator and superiority hypothesis',
                'success_metrics': 'Statistically significant improvement in primary endpoint'
            },
            'Safety Advantage': {
                'tagline': 'Enhanced Safety Profile with Maintained Efficacy',
                'evidence_needed': 'Comprehensive safety database with comparator data',
                'trial_design_implications': 'Detailed safety assessments and sufficient follow-up',
                'success_metrics': 'Lower rates of adverse events with non-inferior efficacy'
            },
            'Novel Mechanism': {
                'tagline': 'First-in-Class Approach for Unmet Needs',
                'evidence_needed': 'Mechanistic data and proof-of-concept',
                'trial_design_implications': 'Include biomarkers to demonstrate target engagement',
                'success_metrics': 'Efficacy in specific subpopulations or refractory cases'
            },
            'Patient Experience': {
                'tagline': 'Patient-Centered Outcomes that Matter',
                'evidence_needed': 'Validated patient-reported outcome measures',
                'trial_design_implications': 'Include PROs as key secondary endpoints',
                'success_metrics': 'Significant improvements in quality of life metrics'
            },
            'Operational Excellence': {
                'tagline': 'Accelerated Path to Market with Streamlined Design',
                'evidence_needed': 'Efficient trial design and execution metrics',
                'trial_design_implications': 'Optimized protocol with minimal burden',
                'success_metrics': 'Faster completion times with lower dropout rates'
            }
        }
        
        # Return the selected strategy
        return {
            'position': selected_position,
            'strategy': positioning_strategies[selected_position],
            'rationale': f'Based on analysis of {len(self.matching_csrs)} trials and {len(self.academic_evidence)} academic sources',
            'implementation': 'Incorporate positioning into protocol design and endpoint selection'
        }
    
    def _get_base_probability_for_phase(self) -> int:
        """Get base success probability for the trial phase"""
        phase_probabilities = {
            'phase 1': 80,
            'phase i': 80,
            'phase 2': 50,
            'phase ii': 50,
            'phase 3': 60,
            'phase iii': 60,
            'phase 4': 90,
            'phase iv': 90
        }
        
        if not self.phase:
            return 50  # Default
        
        phase_lower = self.phase.lower()
        return phase_probabilities.get(phase_lower, 50)
    
    def _get_protocol_sample_size(self) -> Optional[int]:
        """Get sample size from protocol data"""
        if self.protocol_data.get('sampleSize'):
            size_match = re.search(r'(\d+)', str(self.protocol_data.get('sampleSize')))
            if size_match:
                return int(size_match.group(1))
        return None
    
    def _get_protocol_endpoint(self) -> Optional[str]:
        """Get primary endpoint from protocol data"""
        if self.protocol_data.get('primaryObjective'):
            return self.protocol_data.get('primaryObjective')
        if self.protocol_data.get('primaryEndpoint'):
            return self.protocol_data.get('primaryEndpoint')
        return None
    
    def _get_protocol_design(self) -> Optional[str]:
        """Get study design from protocol data"""
        if self.protocol_data.get('studyDesign'):
            return self.protocol_data.get('studyDesign')
        return None
    
    def _evaluate_success_probability(self, probability: int) -> str:
        """Evaluate the success probability"""
        if probability >= 80:
            return 'High probability of success with strong historical precedent'
        elif probability >= 60:
            return 'Moderate-to-high probability of success with favorable factors'
        elif probability >= 40:
            return 'Moderate probability of success with some risk factors'
        else:
            return 'Lower probability of success with significant risk factors'
    
    def _extract_academic_recommendations(self) -> List[Dict[str, Any]]:
        """Extract recommendations from academic evidence"""
        recommendations = []
        
        # Look for recommendation language in academic evidence
        recommendation_keywords = ['recommend', 'should', 'best practice', 'guidance', 'advised']
        
        for source in self.academic_evidence:
            if 'excerpts' not in source:
                continue
                
            # Check if any excerpt contains recommendation language
            for excerpt in source.get('excerpts', []):
                if any(keyword in excerpt.lower() for keyword in recommendation_keywords):
                    # Determine area
                    area = 'General Design'
                    
                    if any(term in excerpt.lower() for term in ['endpoint', 'outcome', 'measure']):
                        area = 'Endpoint Selection'
                    elif any(term in excerpt.lower() for term in ['sample', 'size', 'power']):
                        area = 'Sample Size'
                    elif any(term in excerpt.lower() for term in ['statistic', 'analysis', 'model']):
                        area = 'Statistical Approach'
                    elif any(term in excerpt.lower() for term in ['recruit', 'enroll', 'patient']):
                        area = 'Patient Recruitment'
                    
                    recommendations.append({
                        'area': area,
                        'recommendation': excerpt[:100] + '...' if len(excerpt) > 100 else excerpt,
                        'rationale': f"Evidence from {source.get('author', '')} ({source.get('date', '')})",
                        'implementation': f"Apply guidance from {source.get('title', '')}",
                        'priority': 'High'
                    })
        
        # Limit to top 2 academic recommendations
        return recommendations[:2]


def main():
    """Main function to process input and return results"""
    try:
        # Read input JSON from stdin
        input_data = json.load(sys.stdin)
        
        # Initialize analyzer
        analyzer = StrategicInsightsAnalyzer(input_data)
        
        # Run analysis
        results = analyzer.analyze_all()
        
        # Print results as JSON
        print(json.dumps(results, indent=2))
        
    except Exception as e:
        # Handle errors
        error_response = {
            'error': str(e),
            'status': 'failed'
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()