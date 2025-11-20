"""
Statistical Predictor Module for TrialSage

This module provides advanced statistical modeling and prediction capabilities
for clinical trial design, including sample size estimation, power analysis,
and success probability modeling based on historical trial data.
"""

import math
import numpy as np
import scipy.stats as stats
from typing import Dict, List, Optional, Tuple, Union, Any
import logging

logger = logging.getLogger(__name__)

class StatisticalPredictor:
    """
    Statistical prediction engine for clinical trial design and analysis.
    """
    
    def __init__(self, csr_database=None):
        """
        Initialize with optional reference to CSR database for historical data lookup.
        
        Args:
            csr_database: Optional database connection for accessing historical trial data
        """
        self.csr_database = csr_database
        self.z_alpha = {
            0.01: 2.576,
            0.025: 1.96,
            0.05: 1.645,
            0.1: 1.282
        }
        self.z_beta = {
            0.8: 0.84,
            0.85: 1.04, 
            0.9: 1.28,
            0.95: 1.645,
            0.99: 2.326
        }
    
    def predict_sample_size_continuous(
        self,
        mean1: float,
        mean2: float,
        std_dev: float,
        alpha: float = 0.05,
        power: float = 0.8,
        ratio: float = 1.0,
        dropout_rate: float = 0.0,
        two_sided: bool = True
    ) -> Dict[str, Any]:
        """
        Predict sample size for continuous outcomes (t-test, mean comparison).
        
        Args:
            mean1: Mean of group 1 (control)
            mean2: Mean of group 2 (treatment)
            std_dev: Standard deviation (pooled)
            alpha: Significance level (default: 0.05)
            power: Desired power (default: 0.8)
            ratio: Allocation ratio n2/n1 (default: 1.0 for equal allocation)
            dropout_rate: Expected dropout rate (default: 0.0)
            two_sided: Whether test is two-sided (default: True)
            
        Returns:
            Dictionary with sample size results and parameters
        """
        # Calculate effect size
        effect_size = abs(mean1 - mean2) / std_dev
        
        # Get critical values
        if two_sided:
            z_a = stats.norm.ppf(1 - alpha/2)
        else:
            z_a = stats.norm.ppf(1 - alpha)
        
        z_b = stats.norm.ppf(power)
        
        # Calculate sample sizes
        n1 = ((1 + 1/ratio) * (z_a + z_b)**2) / effect_size**2
        n2 = n1 * ratio
        
        # Round up to nearest integer
        n1 = math.ceil(n1)
        n2 = math.ceil(n2)
        total_n = n1 + n2
        
        # Adjust for dropouts if specified
        adjusted_n = total_n
        if dropout_rate > 0:
            adjusted_n = math.ceil(total_n / (1 - dropout_rate))
        
        return {
            "group1_size": n1,
            "group2_size": n2,
            "total_sample_size": total_n,
            "adjusted_sample_size": adjusted_n,
            "effect_size": effect_size,
            "dropout_rate": dropout_rate,
            "parameters": {
                "mean1": mean1,
                "mean2": mean2,
                "std_dev": std_dev,
                "alpha": alpha,
                "power": power,
                "ratio": ratio
            }
        }
    
    def predict_sample_size_binary(
        self,
        p1: float,
        p2: float,
        alpha: float = 0.05,
        power: float = 0.8,
        ratio: float = 1.0,
        dropout_rate: float = 0.0,
        two_sided: bool = True,
        continuity_correction: bool = True
    ) -> Dict[str, Any]:
        """
        Predict sample size for binary outcomes (proportion comparison).
        
        Args:
            p1: Proportion in group 1 (control)
            p2: Proportion in group 2 (treatment)
            alpha: Significance level (default: 0.05)
            power: Desired power (default: 0.8)
            ratio: Allocation ratio n2/n1 (default: 1.0 for equal allocation)
            dropout_rate: Expected dropout rate (default: 0.0)
            two_sided: Whether test is two-sided (default: True)
            continuity_correction: Whether to apply continuity correction (default: True)
            
        Returns:
            Dictionary with sample size results and parameters
        """
        # Get critical values
        if two_sided:
            z_a = stats.norm.ppf(1 - alpha/2)
        else:
            z_a = stats.norm.ppf(1 - alpha)
        
        z_b = stats.norm.ppf(power)
        
        # Pooled proportion
        p_pooled = (p1 + ratio * p2) / (1 + ratio)
        
        # Calculate sample sizes
        term1 = z_a * math.sqrt((1 + 1/ratio) * p_pooled * (1 - p_pooled))
        term2 = z_b * math.sqrt(p1 * (1 - p1) + (p2 * (1 - p2))/ratio)
        
        n1 = (term1 + term2)**2 / (p1 - p2)**2
        
        # Apply continuity correction if requested
        if continuity_correction:
            n1 = n1 * 1.1  # Simple approximation for continuity correction
        
        n2 = n1 * ratio
        
        # Round up to nearest integer
        n1 = math.ceil(n1)
        n2 = math.ceil(n2)
        total_n = n1 + n2
        
        # Calculate effect size (difference in proportions)
        effect_size = abs(p1 - p2)
        
        # Adjust for dropouts if specified
        adjusted_n = total_n
        if dropout_rate > 0:
            adjusted_n = math.ceil(total_n / (1 - dropout_rate))
        
        return {
            "group1_size": n1,
            "group2_size": n2,
            "total_sample_size": total_n,
            "adjusted_sample_size": adjusted_n,
            "effect_size": effect_size,
            "dropout_rate": dropout_rate,
            "parameters": {
                "p1": p1,
                "p2": p2, 
                "alpha": alpha,
                "power": power,
                "ratio": ratio
            }
        }
    
    def predict_sample_size_survival(
        self,
        hr: float,
        event_rate1: float,
        event_rate2: Optional[float] = None,
        study_duration: float = 12,
        follow_up_duration: float = 12,
        alpha: float = 0.05,
        power: float = 0.8,
        ratio: float = 1.0,
        dropout_rate: float = 0.0
    ) -> Dict[str, Any]:
        """
        Predict sample size for survival outcomes (time-to-event).
        
        Args:
            hr: Hazard ratio (treatment vs control)
            event_rate1: Event rate in control group
            event_rate2: Event rate in treatment group (if None, calculated from HR)
            study_duration: Total study duration in months
            follow_up_duration: Follow-up duration in months
            alpha: Significance level (default: 0.05)
            power: Desired power (default: 0.8)
            ratio: Allocation ratio n2/n1 (default: 1.0 for equal allocation)
            dropout_rate: Expected dropout rate (default: 0.0)
            
        Returns:
            Dictionary with sample size results and parameters
        """
        # If event_rate2 not provided, calculate it from hazard ratio
        if event_rate2 is None:
            event_rate2 = 1 - (1 - event_rate1) ** hr
        
        # Get critical values
        z_a = stats.norm.ppf(1 - alpha/2)  # Always two-sided for survival
        z_b = stats.norm.ppf(power)
        
        # Calculate required number of events
        log_hr = math.log(hr)
        events_required = (z_a + z_b)**2 * (1 + ratio) / (ratio * log_hr**2)
        events_required = math.ceil(events_required)
        
        # Calculate total sample size based on event rate
        # Simplified calculation assuming constant hazard rate
        pooled_event_rate = (event_rate1 + event_rate2 * ratio) / (1 + ratio)
        
        # Adjust for accrual and follow-up periods
        # This is a simplified approach, a more complex model would account for
        # recruitment patterns and time-dependent event rates
        effective_study_time = (study_duration + follow_up_duration) / 2
        event_probability = 1 - math.exp(-pooled_event_rate * effective_study_time)
        
        total_n = math.ceil(events_required / event_probability)
        
        # Calculate group sizes
        n1 = math.ceil(total_n / (1 + ratio))
        n2 = total_n - n1
        
        # Adjust for dropouts if specified
        adjusted_n = total_n
        if dropout_rate > 0:
            adjusted_n = math.ceil(total_n / (1 - dropout_rate))
        
        return {
            "group1_size": n1,
            "group2_size": n2,
            "total_sample_size": total_n,
            "adjusted_sample_size": adjusted_n,
            "events_required": events_required,
            "dropout_rate": dropout_rate,
            "parameters": {
                "hr": hr,
                "event_rate1": event_rate1,
                "event_rate2": event_rate2,
                "study_duration": study_duration,
                "follow_up_duration": follow_up_duration,
                "alpha": alpha,
                "power": power,
                "ratio": ratio
            }
        }
    
    def predict_sample_size_non_inferiority_binary(
        self,
        p0: float,
        non_inferiority_margin: float,
        alpha: float = 0.05,
        power: float = 0.8,
        ratio: float = 1.0,
        dropout_rate: float = 0.0
    ) -> Dict[str, Any]:
        """
        Predict sample size for non-inferiority test with binary outcome.
        
        Args:
            p0: Expected proportion in both groups
            non_inferiority_margin: Non-inferiority margin (delta)
            alpha: Significance level (default: 0.05)
            power: Desired power (default: 0.8)
            ratio: Allocation ratio n2/n1 (default: 1.0 for equal allocation)
            dropout_rate: Expected dropout rate (default: 0.0)
            
        Returns:
            Dictionary with sample size results and parameters
        """
        # Get critical values
        z_a = stats.norm.ppf(1 - alpha)  # One-sided test
        z_b = stats.norm.ppf(power)
        
        # Calculate sample size
        var_pooled = p0 * (1 - p0) * (1 + 1/ratio)
        
        n1 = (z_a + z_b)**2 * var_pooled / non_inferiority_margin**2
        n2 = n1 * ratio
        
        # Round up to nearest integer
        n1 = math.ceil(n1)
        n2 = math.ceil(n2)
        total_n = n1 + n2
        
        # Adjust for dropouts if specified
        adjusted_n = total_n
        if dropout_rate > 0:
            adjusted_n = math.ceil(total_n / (1 - dropout_rate))
        
        return {
            "group1_size": n1,
            "group2_size": n2,
            "total_sample_size": total_n,
            "adjusted_sample_size": adjusted_n,
            "dropout_rate": dropout_rate,
            "parameters": {
                "p0": p0,
                "non_inferiority_margin": non_inferiority_margin, 
                "alpha": alpha,
                "power": power,
                "ratio": ratio
            }
        }
    
    def predict_sample_size_non_inferiority_continuous(
        self,
        std_dev: float,
        non_inferiority_margin: float,
        alpha: float = 0.05,
        power: float = 0.8,
        ratio: float = 1.0,
        dropout_rate: float = 0.0
    ) -> Dict[str, Any]:
        """
        Predict sample size for non-inferiority test with continuous outcome.
        
        Args:
            std_dev: Standard deviation (pooled)
            non_inferiority_margin: Non-inferiority margin (delta)
            alpha: Significance level (default: 0.05)
            power: Desired power (default: 0.8)
            ratio: Allocation ratio n2/n1 (default: 1.0 for equal allocation)
            dropout_rate: Expected dropout rate (default: 0.0)
            
        Returns:
            Dictionary with sample size results and parameters
        """
        # Get critical values
        z_a = stats.norm.ppf(1 - alpha)  # One-sided test
        z_b = stats.norm.ppf(power)
        
        # Calculate sample size
        n1 = ((1 + 1/ratio) * std_dev**2 * (z_a + z_b)**2) / non_inferiority_margin**2
        n2 = n1 * ratio
        
        # Round up to nearest integer
        n1 = math.ceil(n1)
        n2 = math.ceil(n2)
        total_n = n1 + n2
        
        # Adjust for dropouts if specified
        adjusted_n = total_n
        if dropout_rate > 0:
            adjusted_n = math.ceil(total_n / (1 - dropout_rate))
        
        return {
            "group1_size": n1,
            "group2_size": n2,
            "total_sample_size": total_n,
            "adjusted_sample_size": adjusted_n,
            "dropout_rate": dropout_rate,
            "parameters": {
                "std_dev": std_dev,
                "non_inferiority_margin": non_inferiority_margin, 
                "alpha": alpha,
                "power": power,
                "ratio": ratio
            }
        }
    
    def predict_trial_success_probability(
        self,
        design_type: str,
        parameters: Dict[str, Any],
        historical_data: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Predict probability of trial success based on design parameters and historical data.
        
        Args:
            design_type: Type of trial design (e.g., "superiority_continuous", "non_inferiority_binary")
            parameters: Dictionary of design parameters
            historical_data: Optional list of similar historical trials for reference
            
        Returns:
            Dictionary with success probability and supporting evidence
        """
        # Initialize base probability
        base_probability = 0.5
        
        # If historical data provided, use it to refine prediction
        if historical_data:
            matching_trials = len(historical_data)
            successful_trials = sum(1 for trial in historical_data if trial.get("success", False))
            
            if matching_trials > 0:
                historical_probability = successful_trials / matching_trials
                
                # Weighted average (more weight to historical data as sample size increases)
                weight = min(0.8, matching_trials / 20)  # Cap at 0.8 weight
                base_probability = (1 - weight) * base_probability + weight * historical_probability
        
        # Apply design-specific adjustments
        if design_type == "superiority_continuous":
            effect_size = abs(parameters.get("mean1", 0) - parameters.get("mean2", 0)) / parameters.get("std_dev", 1)
            # Larger effect sizes increase success probability
            effect_adjustment = min(0.3, effect_size / 3)  # Cap at 0.3
            
            sample_size = parameters.get("total_sample_size", 0)
            recommended_size = self.predict_sample_size_continuous(
                parameters.get("mean1", 0),
                parameters.get("mean2", 0),
                parameters.get("std_dev", 1),
                parameters.get("alpha", 0.05),
                parameters.get("power", 0.8)
            )["total_sample_size"]
            
            # Sample size relative to recommended impacts success probability
            size_ratio = sample_size / max(1, recommended_size)
            size_adjustment = min(0.2, (size_ratio - 1) * 0.2)  # Cap at 0.2
            
            # Final probability adjustment
            success_probability = base_probability + effect_adjustment + size_adjustment
            
        elif design_type == "superiority_binary":
            effect_size = abs(parameters.get("p1", 0) - parameters.get("p2", 0))
            # Larger effect sizes increase success probability
            effect_adjustment = min(0.3, effect_size / 0.3)  # Cap at 0.3
            
            sample_size = parameters.get("total_sample_size", 0)
            recommended_size = self.predict_sample_size_binary(
                parameters.get("p1", 0),
                parameters.get("p2", 0),
                parameters.get("alpha", 0.05),
                parameters.get("power", 0.8)
            )["total_sample_size"]
            
            # Sample size relative to recommended impacts success probability
            size_ratio = sample_size / max(1, recommended_size)
            size_adjustment = min(0.2, (size_ratio - 1) * 0.2)  # Cap at 0.2
            
            # Final probability adjustment
            success_probability = base_probability + effect_adjustment + size_adjustment
            
        else:
            # Generic calculation for other design types
            success_probability = base_probability
        
        # Cap probability between 0.1 and 0.95
        success_probability = max(0.1, min(0.95, success_probability))
        
        # Generate insights based on result
        insights = []
        confidence_level = "Moderate"
        
        if success_probability < 0.3:
            confidence_level = "Low"
            insights.append("The trial has a low probability of success based on current parameters.")
            insights.append("Consider reassessing study design and effect size assumptions.")
        elif success_probability > 0.7:
            confidence_level = "High"
            insights.append("The trial has a favorable probability of success.")
            insights.append("Design parameters and assumptions appear to be well-aligned with success criteria.")
        else:
            insights.append("The trial has a moderate probability of success.")
            insights.append("Consider optimizing sample size or reviewing effect size assumptions.")
        
        return {
            "success_probability": round(success_probability, 2),
            "confidence_level": confidence_level,
            "insights": insights,
            "base_probability": round(base_probability, 2),
            "historical_trials_count": len(historical_data) if historical_data else 0
        }
    
    def recommend_sample_size(
        self,
        indication: str,
        phase: str,
        design_type: str,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate intelligent sample size recommendations based on indication, phase,
        and historical data from similar trials.
        
        Args:
            indication: The therapeutic indication (e.g., "oncology", "cardiology")
            phase: Trial phase (e.g., "phase 1", "phase 2", "phase 3")
            design_type: Type of trial design
            parameters: Dictionary of basic design parameters
            
        Returns:
            Dictionary with recommended sample size and supporting evidence
        """
        # Base recommendation using standard formulas
        base_recommendation = {}
        
        if design_type == "superiority_continuous":
            base_recommendation = self.predict_sample_size_continuous(
                parameters.get("mean1", 0),
                parameters.get("mean2", 0),
                parameters.get("std_dev", 1),
                parameters.get("alpha", 0.05),
                parameters.get("power", 0.8),
                parameters.get("ratio", 1.0),
                parameters.get("dropout_rate", 0.15)
            )
        elif design_type == "superiority_binary":
            base_recommendation = self.predict_sample_size_binary(
                parameters.get("p1", 0),
                parameters.get("p2", 0),
                parameters.get("alpha", 0.05),
                parameters.get("power", 0.8),
                parameters.get("ratio", 1.0),
                parameters.get("dropout_rate", 0.15)
            )
        elif design_type == "non_inferiority_continuous":
            base_recommendation = self.predict_sample_size_non_inferiority_continuous(
                parameters.get("std_dev", 1),
                parameters.get("non_inferiority_margin", 0.2),
                parameters.get("alpha", 0.05),
                parameters.get("power", 0.8),
                parameters.get("ratio", 1.0),
                parameters.get("dropout_rate", 0.15)
            )
        elif design_type == "non_inferiority_binary":
            base_recommendation = self.predict_sample_size_non_inferiority_binary(
                parameters.get("p0", 0.5),
                parameters.get("non_inferiority_margin", 0.1),
                parameters.get("alpha", 0.05),
                parameters.get("power", 0.8),
                parameters.get("ratio", 1.0),
                parameters.get("dropout_rate", 0.15)
            )
        elif design_type == "survival":
            base_recommendation = self.predict_sample_size_survival(
                parameters.get("hr", 0.7),
                parameters.get("event_rate1", 0.4),
                parameters.get("event_rate2", None),
                parameters.get("study_duration", 12),
                parameters.get("follow_up_duration", 12),
                parameters.get("alpha", 0.05),
                parameters.get("power", 0.8),
                parameters.get("ratio", 1.0),
                parameters.get("dropout_rate", 0.15)
            )
        
        # Retrieve historical data if database is available
        historical_data = []
        adjusted_recommendation = dict(base_recommendation)
        
        if self.csr_database:
            try:
                # Query similar trials from the database
                historical_data = self.csr_database.filter_trials({
                    "indication": indication,
                    "phase": phase
                })
                
                if historical_data:
                    # Calculate average sample size from historical data
                    historical_sizes = [trial.get("total_sample_size", 0) for trial in historical_data]
                    avg_historical_size = sum(historical_sizes) / len(historical_sizes)
                    
                    # Calculate dropout rates from historical data if available
                    historical_dropout_rates = [
                        trial.get("dropout_rate", 0) 
                        for trial in historical_data 
                        if "dropout_rate" in trial
                    ]
                    
                    if historical_dropout_rates:
                        avg_dropout_rate = sum(historical_dropout_rates) / len(historical_dropout_rates)
                        # Update our recommendation with historical dropout rate
                        if avg_dropout_rate > parameters.get("dropout_rate", 0):
                            adjusted_recommendation["dropout_rate"] = avg_dropout_rate
                            # Recalculate adjusted sample size
                            adjusted_recommendation["adjusted_sample_size"] = math.ceil(
                                adjusted_recommendation["total_sample_size"] / (1 - avg_dropout_rate)
                            )
                    
                    # Blend our calculation with historical average
                    # More weight to our calculation for more precise designs
                    calc_weight = 0.7
                    hist_weight = 0.3
                    
                    blended_size = (
                        calc_weight * adjusted_recommendation["total_sample_size"] + 
                        hist_weight * avg_historical_size
                    )
                    
                    # If blended size is significantly different, adjust
                    if abs(blended_size - adjusted_recommendation["total_sample_size"]) > adjusted_recommendation["total_sample_size"] * 0.2:
                        # Store original size for reference
                        adjusted_recommendation["calculated_size"] = adjusted_recommendation["total_sample_size"]
                        adjusted_recommendation["historical_average_size"] = round(avg_historical_size)
                        
                        # Update with blended size
                        ratio = adjusted_recommendation["group2_size"] / adjusted_recommendation["group1_size"]
                        adjusted_recommendation["total_sample_size"] = round(blended_size)
                        adjusted_recommendation["group1_size"] = math.ceil(blended_size / (1 + ratio))
                        adjusted_recommendation["group2_size"] = adjusted_recommendation["total_sample_size"] - adjusted_recommendation["group1_size"]
                        
                        # Update adjusted size for dropouts
                        adjusted_recommendation["adjusted_sample_size"] = math.ceil(
                            adjusted_recommendation["total_sample_size"] / (1 - adjusted_recommendation["dropout_rate"])
                        )
            except Exception as e:
                logger.error(f"Error retrieving historical data: {e}")
        
        # Generate insights based on recommendation
        insights = []
        
        if design_type == "superiority_continuous":
            effect_size = abs(parameters.get("mean1", 0) - parameters.get("mean2", 0)) / parameters.get("std_dev", 1)
            if effect_size < 0.3:
                insights.append("The expected effect size is relatively small, requiring a larger sample size.")
            elif effect_size > 0.8:
                insights.append("The expected effect size is large, allowing for a smaller sample size.")
                
        elif design_type == "superiority_binary":
            effect_size = abs(parameters.get("p1", 0) - parameters.get("p2", 0))
            if effect_size < 0.1:
                insights.append("The expected difference in proportions is small, requiring a larger sample size.")
            elif effect_size > 0.3:
                insights.append("The expected difference in proportions is large, allowing for a smaller sample size.")
        
        # If historical data was used for adjustment
        if "calculated_size" in adjusted_recommendation:
            calc_size = adjusted_recommendation["calculated_size"]
            hist_size = adjusted_recommendation["historical_average_size"]
            final_size = adjusted_recommendation["total_sample_size"]
            
            if final_size > calc_size * 1.2:
                insights.append(f"The recommended sample size was increased based on historical trials in {indication} {phase} (avg: {hist_size}).")
            elif final_size < calc_size * 0.8:
                insights.append(f"The recommended sample size was decreased based on historical trials in {indication} {phase} (avg: {hist_size}).")
            else:
                insights.append(f"The recommended sample size aligns with historical trials in {indication} {phase} (avg: {hist_size}).")
        
        # Add dropout rate insight if applicable
        if adjusted_recommendation["dropout_rate"] > parameters.get("dropout_rate", 0):
            insights.append(f"The dropout rate was adjusted to {adjusted_recommendation['dropout_rate']*100:.0f}% based on historical data.")
        
        # Add power/precision insights
        if parameters.get("power", 0.8) >= 0.9:
            insights.append("A high power level (≥90%) was specified, increasing the required sample size.")
        
        # Add recommendation summary
        summary = f"Recommended total sample size: {adjusted_recommendation['total_sample_size']} participants"
        if adjusted_recommendation["dropout_rate"] > 0:
            summary += f" ({adjusted_recommendation['adjusted_sample_size']} with dropout adjustment)"
        
        # Add recommendation confidence level
        confidence_level = "High"
        if not historical_data:
            confidence_level = "Moderate"
            insights.append("No historical trial data was available for this indication and phase to refine the recommendation.")
        
        # Return full recommendation
        return {
            "recommendation": adjusted_recommendation,
            "summary": summary,
            "confidence_level": confidence_level,
            "insights": insights,
            "historical_trials_count": len(historical_data),
            "indication": indication,
            "phase": phase,
            "design_type": design_type
        }
    
    def analyze_historical_trends(
        self,
        indication: str,
        phase: Optional[str] = None,
        outcome_type: Optional[str] = None,
        min_year: Optional[int] = None,
        max_year: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Analyze historical trends in trial design and sample sizes.
        
        Args:
            indication: The therapeutic indication
            phase: Optional filter for trial phase
            outcome_type: Optional filter for outcome type
            min_year: Optional minimum year filter
            max_year: Optional maximum year filter
            
        Returns:
            Dictionary with trend analysis and insights
        """
        if not self.csr_database:
            return {
                "success": False,
                "message": "Database connection not available for historical analysis"
            }
        
        try:
            # Build filter criteria
            filters = {"indication": indication}
            if phase:
                filters["phase"] = phase
            if outcome_type:
                filters["outcome_type"] = outcome_type
            if min_year:
                filters["min_year"] = min_year
            if max_year:
                filters["max_year"] = max_year
                
            # Query similar trials from the database
            historical_data = self.csr_database.filter_trials(filters)
            
            if not historical_data:
                return {
                    "success": False,
                    "message": f"No historical data found for the specified criteria: {filters}"
                }
            
            # Group trials by year
            trials_by_year = {}
            for trial in historical_data:
                year = trial.get("year")
                if year:
                    if year not in trials_by_year:
                        trials_by_year[year] = []
                    trials_by_year[year].append(trial)
            
            # Calculate yearly statistics
            yearly_stats = []
            for year, trials in sorted(trials_by_year.items()):
                sample_sizes = [t.get("total_sample_size", 0) for t in trials]
                dropout_rates = [t.get("dropout_rate", 0) for t in trials if "dropout_rate" in t]
                success_rates = [1 if t.get("success", False) else 0 for t in trials if "success" in t]
                
                year_stat = {
                    "year": year,
                    "trial_count": len(trials),
                    "avg_sample_size": sum(sample_sizes) / len(sample_sizes) if sample_sizes else 0,
                    "median_sample_size": np.median(sample_sizes) if sample_sizes else 0,
                    "min_sample_size": min(sample_sizes) if sample_sizes else 0,
                    "max_sample_size": max(sample_sizes) if sample_sizes else 0
                }
                
                if dropout_rates:
                    year_stat["avg_dropout_rate"] = sum(dropout_rates) / len(dropout_rates)
                
                if success_rates:
                    year_stat["success_rate"] = sum(success_rates) / len(success_rates)
                
                yearly_stats.append(year_stat)
            
            # Generate trend analysis
            trends = {
                "sample_size_trend": self._analyze_numeric_trend([y["avg_sample_size"] for y in yearly_stats]),
                "trial_count_trend": self._analyze_numeric_trend([y["trial_count"] for y in yearly_stats])
            }
            
            if all("avg_dropout_rate" in y for y in yearly_stats):
                trends["dropout_rate_trend"] = self._analyze_numeric_trend([y["avg_dropout_rate"] for y in yearly_stats])
            
            if all("success_rate" in y for y in yearly_stats):
                trends["success_rate_trend"] = self._analyze_numeric_trend([y["success_rate"] for y in yearly_stats])
            
            # Generate insights
            insights = []
            
            if trends["sample_size_trend"]["direction"] == "increasing":
                insights.append(f"Sample sizes for {indication} {phase or 'all phases'} trials have been increasing over time.")
            elif trends["sample_size_trend"]["direction"] == "decreasing":
                insights.append(f"Sample sizes for {indication} {phase or 'all phases'} trials have been decreasing over time.")
            else:
                insights.append(f"Sample sizes for {indication} {phase or 'all phases'} trials have remained relatively stable over time.")
            
            if "dropout_rate_trend" in trends:
                if trends["dropout_rate_trend"]["direction"] == "increasing":
                    insights.append("Dropout rates have been increasing, suggesting a need for more conservative dropout adjustments.")
                elif trends["dropout_rate_trend"]["direction"] == "decreasing":
                    insights.append("Dropout rates have been decreasing, suggesting improved participant retention strategies.")
            
            if "success_rate_trend" in trends:
                if trends["success_rate_trend"]["direction"] == "increasing":
                    insights.append("Trial success rates have been improving over time, potentially due to better study designs or patient selection.")
                elif trends["success_rate_trend"]["direction"] == "decreasing":
                    insights.append("Trial success rates have been declining, suggesting increasing challenges in demonstrating efficacy.")
            
            # Return full analysis
            return {
                "success": True,
                "indication": indication,
                "phase": phase,
                "outcome_type": outcome_type,
                "year_range": [min(trials_by_year.keys()), max(trials_by_year.keys())],
                "total_trials": len(historical_data),
                "yearly_statistics": yearly_stats,
                "trends": trends,
                "insights": insights
            }
            
        except Exception as e:
            logger.error(f"Error analyzing historical trends: {e}")
            return {
                "success": False,
                "message": f"Error analyzing historical trends: {str(e)}"
            }
    
    def _analyze_numeric_trend(self, values: List[float]) -> Dict[str, Any]:
        """Helper method to analyze trend direction and magnitude in a numeric series"""
        if len(values) < 2:
            return {"direction": "stable", "change_rate": 0, "magnitude": "none"}
        
        # Simple linear regression
        x = list(range(len(values)))
        slope, intercept, r_value, p_value, std_err = stats.linregress(x, values)
        
        # Calculate percent change
        start_val = values[0] if values[0] != 0 else 0.001  # Avoid division by zero
        percent_change = (values[-1] - values[0]) / start_val * 100
        
        # Determine direction
        if abs(percent_change) < 10:
            direction = "stable"
        elif percent_change > 0:
            direction = "increasing"
        else:
            direction = "decreasing"
        
        # Determine magnitude
        if abs(percent_change) < 10:
            magnitude = "minimal"
        elif abs(percent_change) < 30:
            magnitude = "moderate"
        else:
            magnitude = "substantial"
        
        return {
            "direction": direction,
            "change_rate": round(slope, 3),
            "percent_change": round(percent_change, 1),
            "magnitude": magnitude,
            "r_squared": round(r_value ** 2, 3),
            "p_value": round(p_value, 3)
        }