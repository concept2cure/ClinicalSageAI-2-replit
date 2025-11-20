"""
Sample Size Calculator for TrialSage

This module provides functionality to calculate sample sizes for clinical trials
based on different statistical approaches and trial designs.
"""

import math
import scipy.stats as stats
import numpy as np
from typing import Dict, Any, Optional, Tuple


def calculate_power_continuous(
    mean1: float,
    mean2: float,
    std_dev: float,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0
) -> Dict[str, Any]:
    """
    Calculate sample size for continuous outcomes (e.g., t-test)
    
    Args:
        mean1: Mean of group 1
        mean2: Mean of group 2
        std_dev: Pooled standard deviation
        power: Statistical power (default: 0.8)
        alpha: Significance level (default: 0.05)
        ratio: Allocation ratio between groups (default: 1.0 for equal allocation)
        
    Returns:
        Dictionary with sample size calculations and parameters
    """
    effect_size = abs(mean1 - mean2) / std_dev
    if effect_size == 0:
        return {
            "error": "Effect size cannot be zero",
            "parameters": {
                "mean1": mean1,
                "mean2": mean2,
                "std_dev": std_dev,
                "power": power,
                "alpha": alpha,
                "ratio": ratio
            }
        }

    # Calculate critical values for two-sided test
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    
    # Calculate sample size
    n1 = ((z_alpha + z_beta)**2 * (1 + 1/ratio) * std_dev**2) / (mean1 - mean2)**2
    n1 = math.ceil(n1)
    n2 = math.ceil(n1 * ratio)
    total_n = n1 + n2
    
    return {
        "group1_size": n1,
        "group2_size": n2,
        "total_sample_size": total_n,
        "effect_size": effect_size,
        "parameters": {
            "mean1": mean1,
            "mean2": mean2,
            "std_dev": std_dev,
            "power": power,
            "alpha": alpha,
            "ratio": ratio
        }
    }


def calculate_power_binary(
    p1: float,
    p2: float,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0
) -> Dict[str, Any]:
    """
    Calculate sample size for binary outcomes (e.g., proportions test)
    
    Args:
        p1: Proportion in group 1
        p2: Proportion in group 2
        power: Statistical power (default: 0.8)
        alpha: Significance level (default: 0.05)
        ratio: Allocation ratio between groups (default: 1.0 for equal allocation)
        
    Returns:
        Dictionary with sample size calculations and parameters
    """
    if p1 == p2:
        return {
            "error": "Proportions cannot be equal",
            "parameters": {
                "p1": p1,
                "p2": p2,
                "power": power,
                "alpha": alpha,
                "ratio": ratio
            }
        }
        
    # Ensure proportions are between 0 and 1
    if not (0 <= p1 <= 1 and 0 <= p2 <= 1):
        return {
            "error": "Proportions must be between 0 and 1",
            "parameters": {
                "p1": p1,
                "p2": p2,
                "power": power,
                "alpha": alpha,
                "ratio": ratio
            }
        }
    
    # Calculate pooled proportion
    p_pooled = (p1 + ratio * p2) / (1 + ratio)
    
    # Calculate critical values for two-sided test
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    
    # Calculate sample size using the formula for comparing two proportions
    numerator = (z_alpha * math.sqrt((1 + 1/ratio) * p_pooled * (1 - p_pooled)) + 
                 z_beta * math.sqrt(p1 * (1 - p1) + (p2 * (1 - p2)) / ratio))**2
    denominator = (p1 - p2)**2
    
    n1 = numerator / denominator
    n1 = math.ceil(n1)
    n2 = math.ceil(n1 * ratio)
    total_n = n1 + n2
    
    # Calculate effect size (difference in proportions)
    effect_size = abs(p1 - p2)
    
    return {
        "group1_size": n1,
        "group2_size": n2,
        "total_sample_size": total_n,
        "effect_size": effect_size,
        "parameters": {
            "p1": p1,
            "p2": p2,
            "power": power,
            "alpha": alpha,
            "ratio": ratio
        }
    }


def calculate_power_survival(
    hr: float,
    event_rate1: float,
    event_rate2: Optional[float] = None,
    study_duration: float = 12,
    follow_up_duration: float = 12,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0
) -> Dict[str, Any]:
    """
    Calculate sample size for survival/time-to-event outcomes
    
    Args:
        hr: Hazard ratio (treatment vs control)
        event_rate1: Event rate in control group
        event_rate2: Event rate in treatment group (calculated from HR if not provided)
        study_duration: Duration of study in months
        follow_up_duration: Duration of follow-up in months
        power: Statistical power (default: 0.8)
        alpha: Significance level (default: 0.05)
        ratio: Allocation ratio between groups (default: 1.0 for equal allocation)
        
    Returns:
        Dictionary with sample size calculations and parameters
    """
    if hr <= 0:
        return {
            "error": "Hazard ratio must be positive",
            "parameters": {
                "hr": hr,
                "event_rate1": event_rate1,
                "event_rate2": event_rate2,
                "study_duration": study_duration,
                "follow_up_duration": follow_up_duration,
                "power": power,
                "alpha": alpha,
                "ratio": ratio
            }
        }
        
    # Calculate event rate in treatment group if not provided
    if event_rate2 is None:
        event_rate2 = event_rate1 * hr
    
    # Calculate critical values for two-sided test
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    
    # Calculate number of events required
    log_hr = math.log(hr)
    events_required = ((z_alpha + z_beta)**2) / (log_hr**2) * (1 + ratio) / ratio
    events_required = math.ceil(events_required)
    
    # Calculate accrual rate based on study parameters
    accrual_time = study_duration - follow_up_duration
    if accrual_time <= 0:
        accrual_time = study_duration / 2
    
    # Assuming exponential survival, calculate sample size
    lambda1 = -math.log(1 - event_rate1) / follow_up_duration
    lambda2 = -math.log(1 - event_rate2) / follow_up_duration
    
    # Expected number of events per person over the study duration
    events_per_person1 = 1 - math.exp(-lambda1 * follow_up_duration)
    events_per_person2 = 1 - math.exp(-lambda2 * follow_up_duration)
    
    # Calculate weighted average
    avg_events_per_person = (events_per_person1 + ratio * events_per_person2) / (1 + ratio)
    
    # Total sample size needed
    total_n = events_required / avg_events_per_person
    total_n = math.ceil(total_n)
    
    n1 = math.ceil(total_n / (1 + ratio))
    n2 = total_n - n1
    
    return {
        "group1_size": n1,
        "group2_size": n2,
        "total_sample_size": total_n,
        "events_required": events_required,
        "parameters": {
            "hr": hr,
            "event_rate1": event_rate1,
            "event_rate2": event_rate2,
            "study_duration": study_duration,
            "follow_up_duration": follow_up_duration,
            "power": power,
            "alpha": alpha,
            "ratio": ratio
        }
    }


def calculate_non_inferiority_binary(
    p0: float,
    non_inferiority_margin: float,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0
) -> Dict[str, Any]:
    """
    Calculate sample size for non-inferiority trial with binary outcome
    
    Args:
        p0: Expected proportion in both groups (assuming no actual difference)
        non_inferiority_margin: Non-inferiority margin (delta)
        power: Statistical power (default: 0.8)
        alpha: Significance level (default: 0.05)
        ratio: Allocation ratio between groups (default: 1.0 for equal allocation)
        
    Returns:
        Dictionary with sample size calculations and parameters
    """
    if non_inferiority_margin <= 0:
        return {
            "error": "Non-inferiority margin must be positive",
            "parameters": {
                "p0": p0,
                "non_inferiority_margin": non_inferiority_margin,
                "power": power,
                "alpha": alpha,
                "ratio": ratio
            }
        }
    
    # Calculate critical values for one-sided test (non-inferiority is one-sided)
    z_alpha = stats.norm.ppf(1 - alpha)
    z_beta = stats.norm.ppf(power)
    
    # Calculate sample size
    numerator = (z_alpha + z_beta)**2 * p0 * (1 - p0) * (1 + 1/ratio)
    denominator = non_inferiority_margin**2
    
    n1 = numerator / denominator
    n1 = math.ceil(n1)
    n2 = math.ceil(n1 * ratio)
    total_n = n1 + n2
    
    return {
        "group1_size": n1,
        "group2_size": n2,
        "total_sample_size": total_n,
        "parameters": {
            "p0": p0,
            "non_inferiority_margin": non_inferiority_margin,
            "power": power,
            "alpha": alpha,
            "ratio": ratio
        }
    }


def calculate_non_inferiority_continuous(
    std_dev: float,
    non_inferiority_margin: float,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0
) -> Dict[str, Any]:
    """
    Calculate sample size for non-inferiority trial with continuous outcome
    
    Args:
        std_dev: Expected standard deviation in both groups
        non_inferiority_margin: Non-inferiority margin (delta)
        power: Statistical power (default: 0.8)
        alpha: Significance level (default: 0.05)
        ratio: Allocation ratio between groups (default: 1.0 for equal allocation)
        
    Returns:
        Dictionary with sample size calculations and parameters
    """
    if non_inferiority_margin <= 0:
        return {
            "error": "Non-inferiority margin must be positive",
            "parameters": {
                "std_dev": std_dev,
                "non_inferiority_margin": non_inferiority_margin,
                "power": power,
                "alpha": alpha,
                "ratio": ratio
            }
        }
    
    # Calculate critical values for one-sided test (non-inferiority is one-sided)
    z_alpha = stats.norm.ppf(1 - alpha)
    z_beta = stats.norm.ppf(power)
    
    # Calculate sample size
    numerator = ((z_alpha + z_beta) * std_dev)**2 * (1 + 1/ratio)
    denominator = non_inferiority_margin**2
    
    n1 = numerator / denominator
    n1 = math.ceil(n1)
    n2 = math.ceil(n1 * ratio)
    total_n = n1 + n2
    
    return {
        "group1_size": n1,
        "group2_size": n2,
        "total_sample_size": total_n,
        "parameters": {
            "std_dev": std_dev,
            "non_inferiority_margin": non_inferiority_margin,
            "power": power,
            "alpha": alpha,
            "ratio": ratio
        }
    }


def recommend_sample_size(
    design_type: str,
    indication: str,
    phase: str,
    parameters: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Provide recommendations for sample size based on protocol details
    
    Args:
        design_type: Type of study design (superiority, non-inferiority, etc.)
        indication: Disease/condition under study
        phase: Clinical trial phase
        parameters: Parameters for sample size calculation
        
    Returns:
        Dictionary with sample size recommendations and justification
    """
    # Calculate sample size based on design type
    if design_type == "superiority_continuous":
        result = calculate_power_continuous(**parameters)
    elif design_type == "superiority_binary":
        result = calculate_power_binary(**parameters)
    elif design_type == "survival":
        result = calculate_power_survival(**parameters)
    elif design_type == "non_inferiority_binary":
        result = calculate_non_inferiority_binary(**parameters)
    elif design_type == "non_inferiority_continuous":
        result = calculate_non_inferiority_continuous(**parameters)
    else:
        return {
            "error": f"Unknown design type: {design_type}",
            "parameters": parameters
        }
    
    # Add dropout adjustment
    dropout_rate = parameters.get("dropout_rate", 0.15)  # Default to 15% dropout
    if "error" not in result:
        adjusted_n = math.ceil(result["total_sample_size"] / (1 - dropout_rate))
        result["adjusted_sample_size"] = adjusted_n
        result["dropout_rate"] = dropout_rate
    
    # Add justification and recommendations based on indication and phase
    if "error" not in result:
        # Fetch historical data for similar trials
        # This would typically come from a database call, but for now we'll simulate it
        historical_data = get_historical_sample_sizes(indication, phase)
        
        result["historical_range"] = historical_data
        
        # Add recommendations
        if result["total_sample_size"] < historical_data["min"]:
            result["recommendation"] = "The calculated sample size is lower than historical precedent. Consider increasing to at least {0} participants to align with previous successful trials.".format(historical_data["min"])
            result["risk_level"] = "high"
        elif result["total_sample_size"] > historical_data["max"]:
            result["recommendation"] = "The calculated sample size is higher than historical precedent. This may be statistically sound but could increase recruitment challenges and study costs."
            result["risk_level"] = "low"
        else:
            result["recommendation"] = "The calculated sample size aligns well with historical precedent for this indication and phase."
            result["risk_level"] = "low"
    
    return result


def get_historical_sample_sizes(indication: str, phase: str) -> Dict[str, int]:
    """
    Get historical sample size ranges for a given indication and phase
    
    This is a simplified version that would typically query a database
    of past trials.
    
    Args:
        indication: Disease/condition
        phase: Clinical trial phase
        
    Returns:
        Dictionary with min, max, median sample sizes
    """
    # This would typically come from a database, but for this example we'll use hardcoded values
    # based on common ranges
    
    indication = indication.lower()
    
    base_ranges = {
        "phase 1": {"min": 20, "max": 80, "median": 36},
        "phase 2": {"min": 100, "max": 300, "median": 160},
        "phase 3": {"min": 300, "max": 3000, "median": 600},
        "phase 4": {"min": 300, "max": 5000, "median": 800},
    }
    
    # Adjustment factors for specific indications
    indication_factors = {
        "oncology": 0.8,  # Typically smaller due to recruitment challenges
        "cardiovascular": 1.5,  # Often larger for mortality endpoints
        "rare disease": 0.5,  # Smaller due to patient availability
        "infectious disease": 1.2,  # Larger for adequate power
        "cns": 1.3,  # Neurological trials often need more patients
        "diabetes": 1.2,
        "copd": 1.1,
        "nash": 1.2,
        "alzheimer": 1.4,
        "parkinson": 1.2,
        "multiple sclerosis": 1.1,
        "hiv": 0.9,
        "hepatitis": 1.0,
        "asthma": 1.1,
        "rheumatoid arthritis": 1.0,
        "crohn": 0.9,
        "ulcerative colitis": 0.9,
        "psoriasis": 0.8,
    }
    
    # Find the best match for the indication
    factor = 1.0
    for key, value in indication_factors.items():
        if key in indication:
            factor = value
            break
    
    # Get the base range for the phase
    phase_key = phase.lower()
    if phase_key not in base_ranges:
        # Default to phase 2 if unknown
        phase_key = "phase 2"
    
    base_range = base_ranges[phase_key]
    
    # Apply the indication factor
    return {
        "min": int(base_range["min"] * factor),
        "max": int(base_range["max"] * factor),
        "median": int(base_range["median"] * factor)
    }