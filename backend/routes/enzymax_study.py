"""
Enzymax Forte Study Design Simulation API
-----------------------------------------
Specialized endpoint for running simulations for functional dyspepsia and chronic pancreatitis
studies based on FDA biostatistician recommendations.

This module implements the statistical approaches outlined in:
"Enzymax Forte Study Design and Sample Size Estimation v1.0 24 Apr 2025"
"""

import numpy as np
import scipy.stats as stats
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Union, Any, Literal
import logging

# Create router for enzymax study endpoints
router = APIRouter(prefix="/api/enzymax", tags=["enzymax"])

logger = logging.getLogger(__name__)

# Define request and response models
class EnzymaxDyspepsiaRequest(BaseModel):
    """Request model for functional dyspepsia simulations"""
    approach: Literal["superiority", "non_inferiority"] = Field(
        ..., description="Study approach: superiority (test vs placebo) or non-inferiority (test vs reference)"
    )
    test_reduction: float = Field(
        ..., description="Expected NDI SF score reduction in test product group"
    )
    control_reduction: float = Field(
        ..., description="Expected NDI SF score reduction in control group (placebo or reference product)"
    )
    standard_deviation: float = Field(
        18.0, description="Common standard deviation of score changes (default: 18.0 from Ullah et al.)"
    )
    non_inferiority_margin: Optional[float] = Field(
        None, description="Non-inferiority margin (required for non-inferiority studies, e.g. -10)"
    )
    alpha: float = Field(0.05, description="Significance level (Type I error rate)")
    power: float = Field(0.8, description="Desired statistical power")
    dropout_rate: float = Field(0.2, description="Expected dropout rate (e.g., 0.2 for 20%)")

class EnzymaxPancreatitisRequest(BaseModel):
    """Request model for chronic pancreatitis simulations (CFA endpoint)"""
    approach: Literal["superiority", "non_inferiority"] = Field(
        ..., description="Study approach: superiority (test vs placebo) or non-inferiority (test vs reference)"
    )
    test_cfa_change: float = Field(
        ..., description="Expected CFA change from baseline in test product group"
    )
    control_cfa_change: float = Field(
        ..., description="Expected CFA change from baseline in control group (placebo or reference product)"
    )
    standard_deviation: float = Field(
        15.0, description="Common standard deviation of CFA changes"
    )
    non_inferiority_margin: Optional[float] = Field(
        None, description="Non-inferiority margin (required for non-inferiority studies)"
    )
    alpha: float = Field(0.05, description="Significance level (Type I error rate)")
    power: float = Field(0.8, description="Desired statistical power")
    dropout_rate: float = Field(0.2, description="Expected dropout rate (e.g., 0.2 for 20%)")

class SampleSizeResponse(BaseModel):
    """Response model for sample size calculations"""
    sample_size_per_arm: int
    total_sample_size: int
    total_with_dropouts: int
    power: float
    alpha: float
    approach: str
    mean_difference: float
    standard_deviation: float
    non_inferiority_margin: Optional[float] = None
    parameters_used: Dict[str, Any]
    reference_studies: List[Dict[str, Any]]

# Helper functions
def calculate_sample_size_superiority(
    mean_diff: float, 
    std_dev: float, 
    alpha: float = 0.05, 
    power: float = 0.8
) -> int:
    """
    Calculate sample size for a superiority trial using two-sample t-test formula.
    
    Args:
        mean_diff: Expected difference between means
        std_dev: Common standard deviation
        alpha: Significance level
        power: Desired statistical power
        
    Returns:
        Sample size per arm (rounded up to nearest integer)
    """
    # Critical values for two-sided test
    z_alpha = stats.norm.ppf(1 - alpha/2)
    z_beta = stats.norm.ppf(power)
    
    # Sample size formula for two-sample t-test
    n = 2 * ((z_alpha + z_beta) ** 2) * (std_dev ** 2) / (mean_diff ** 2)
    
    # Round up to the nearest integer
    return int(np.ceil(n))

def calculate_sample_size_non_inferiority(
    mean_diff: float, 
    std_dev: float, 
    margin: float,
    alpha: float = 0.05, 
    power: float = 0.8
) -> int:
    """
    Calculate sample size for a non-inferiority trial.
    
    Args:
        mean_diff: Expected difference between test and reference (test - reference)
        std_dev: Common standard deviation
        margin: Non-inferiority margin (negative value)
        alpha: Significance level
        power: Desired statistical power
        
    Returns:
        Sample size per arm (rounded up to nearest integer)
    """
    # Critical values (one-sided test for non-inferiority)
    z_alpha = stats.norm.ppf(1 - alpha)
    z_beta = stats.norm.ppf(power)
    
    # Adjusted difference accounting for non-inferiority margin
    adjusted_diff = mean_diff - margin
    
    # Sample size formula for non-inferiority
    n = 2 * ((z_alpha + z_beta) ** 2) * (std_dev ** 2) / (adjusted_diff ** 2)
    
    # Round up to the nearest integer
    return int(np.ceil(n))

@router.post("/functional-dyspepsia", response_model=SampleSizeResponse)
async def calculate_functional_dyspepsia_sample_size(
    request: EnzymaxDyspepsiaRequest = Body(...)
):
    """
    Calculate sample size for functional dyspepsia studies based on NDI SF scores.
    
    This endpoint implements the calculations from the Enzymax Forte Study Design
    document, based on the Ullah et al. and Majeed et al. studies.
    """
    try:
        # Validate inputs
        if request.approach == "non_inferiority" and request.non_inferiority_margin is None:
            raise HTTPException(status_code=400, detail="non_inferiority_margin is required for non-inferiority approach")
        
        if request.dropout_rate < 0 or request.dropout_rate >= 1:
            raise HTTPException(status_code=400, detail="dropout_rate must be between 0 and 1")
        
        # Calculate the mean difference (adjusted for sign)
        # For NDI SF score reduction, negative numbers are better, so we take control - test
        mean_diff = request.test_reduction - request.control_reduction
        
        # Calculate sample size per arm
        if request.approach == "superiority":
            n_per_arm = calculate_sample_size_superiority(
                mean_diff=mean_diff, 
                std_dev=request.standard_deviation, 
                alpha=request.alpha, 
                power=request.power
            )
            non_inferiority_margin = None
        else:  # non_inferiority
            n_per_arm = calculate_sample_size_non_inferiority(
                mean_diff=mean_diff, 
                std_dev=request.standard_deviation, 
                margin=request.non_inferiority_margin, 
                alpha=request.alpha, 
                power=request.power
            )
            non_inferiority_margin = request.non_inferiority_margin
        
        # Calculate total sample size with dropouts
        total_n = n_per_arm * 2
        total_with_dropouts = int(np.ceil(total_n / (1 - request.dropout_rate)))
        
        # Reference studies from the document
        reference_studies = [
            {
                "name": "Ullah et al.",
                "description": "Placebo-controlled, parallel design study for functional dyspepsia",
                "parameters": {
                    "test_reduction": -5,
                    "placebo_reduction": 5,
                    "standard_deviation": 19,
                    "sample_size_per_arm": 58
                }
            },
            {
                "name": "Majeed et al.",
                "description": "Placebo-controlled parallel design study for functional dyspepsia",
                "parameters": {
                    "test_reduction": -11,
                    "placebo_reduction": -6,
                    "standard_deviation": 7,
                    "sample_size_per_arm": 32
                }
            }
        ]
        
        return SampleSizeResponse(
            sample_size_per_arm=n_per_arm,
            total_sample_size=total_n,
            total_with_dropouts=total_with_dropouts,
            power=request.power,
            alpha=request.alpha,
            approach=request.approach,
            mean_difference=mean_diff,
            standard_deviation=request.standard_deviation,
            non_inferiority_margin=non_inferiority_margin,
            parameters_used={
                "test_reduction": request.test_reduction,
                "control_reduction": request.control_reduction,
                "standard_deviation": request.standard_deviation,
                "dropout_rate": request.dropout_rate
            },
            reference_studies=reference_studies
        )
    except Exception as e:
        logger.exception("Error in functional dyspepsia endpoint")
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")

@router.post("/chronic-pancreatitis", response_model=SampleSizeResponse)
async def calculate_chronic_pancreatitis_sample_size(
    request: EnzymaxPancreatitisRequest = Body(...)
):
    """
    Calculate sample size for chronic pancreatitis studies based on CFA changes.
    
    This endpoint implements the calculations from the Enzymax Forte Study Design
    document, focusing on the Coefficient of Fat Absorption (CFA) endpoint.
    """
    try:
        # Validate inputs
        if request.approach == "non_inferiority" and request.non_inferiority_margin is None:
            raise HTTPException(status_code=400, detail="non_inferiority_margin is required for non-inferiority approach")
        
        if request.dropout_rate < 0 or request.dropout_rate >= 1:
            raise HTTPException(status_code=400, detail="dropout_rate must be between 0 and 1")
        
        # Calculate the mean difference
        # For CFA, higher values are better
        mean_diff = request.test_cfa_change - request.control_cfa_change
        
        # Calculate sample size per arm
        if request.approach == "superiority":
            n_per_arm = calculate_sample_size_superiority(
                mean_diff=mean_diff, 
                std_dev=request.standard_deviation, 
                alpha=request.alpha, 
                power=request.power
            )
            non_inferiority_margin = None
        else:  # non_inferiority
            n_per_arm = calculate_sample_size_non_inferiority(
                mean_diff=mean_diff, 
                std_dev=request.standard_deviation, 
                margin=request.non_inferiority_margin, 
                alpha=request.alpha, 
                power=request.power
            )
            non_inferiority_margin = request.non_inferiority_margin
        
        # Calculate total sample size with dropouts
        total_n = n_per_arm * 2
        total_with_dropouts = int(np.ceil(total_n / (1 - request.dropout_rate)))
        
        # Reference studies from the document
        reference_studies = [
            {
                "name": "Thorat et al.",
                "description": "Study evaluating CFA changes in chronic pancreatitis",
                "parameters": {
                    "test_cfa_change": 26.0,
                    "placebo_cfa_change": 4.0,
                    "standard_deviation": 15.0
                }
            }
        ]
        
        return SampleSizeResponse(
            sample_size_per_arm=n_per_arm,
            total_sample_size=total_n,
            total_with_dropouts=total_with_dropouts,
            power=request.power,
            alpha=request.alpha,
            approach=request.approach,
            mean_difference=mean_diff,
            standard_deviation=request.standard_deviation,
            non_inferiority_margin=non_inferiority_margin,
            parameters_used={
                "test_cfa_change": request.test_cfa_change,
                "control_cfa_change": request.control_cfa_change,
                "standard_deviation": request.standard_deviation,
                "dropout_rate": request.dropout_rate
            },
            reference_studies=reference_studies
        )
    except Exception as e:
        logger.exception("Error in chronic pancreatitis endpoint")
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")

# Add endpoints for simulating power curves across different sample sizes
@router.post("/functional-dyspepsia/power-curve", response_model=Dict[str, Any])
async def simulate_dyspepsia_power_curve(
    request: EnzymaxDyspepsiaRequest = Body(...)
):
    """
    Generate a power curve for functional dyspepsia studies.
    
    This endpoint calculates statistical power across a range of sample sizes
    to help visualize the relationship between sample size and power.
    """
    try:
        # Validate inputs
        if request.approach == "non_inferiority" and request.non_inferiority_margin is None:
            raise HTTPException(status_code=400, detail="non_inferiority_margin is required for non-inferiority approach")
        
        # Generate a range of sample sizes to evaluate
        min_n = 10
        max_n = 400
        
        if max_n <= 100:
            sample_sizes = list(range(min_n, max_n + 1, 5))
        elif max_n <= 200:
            sample_sizes = list(range(min_n, 100, 10)) + list(range(100, max_n + 1, 20))
        else:
            sample_sizes = list(range(min_n, 100, 10)) + list(range(100, 200, 20)) + list(range(200, max_n + 1, 50))
        
        # Ensure we include the max sample size
        if max_n not in sample_sizes:
            sample_sizes.append(max_n)
        
        # Sort sample sizes
        sample_sizes.sort()
        
        # Calculate the mean difference
        mean_diff = request.test_reduction - request.control_reduction
        
        # Calculate power for each sample size
        power_curve = []
        for n in sample_sizes:
            if request.approach == "superiority":
                # Calculate power for superiority test
                t_alpha = stats.t.ppf(1 - request.alpha/2, 2*n-2)
                ncp = mean_diff / (request.standard_deviation * np.sqrt(2/n))  # Non-centrality parameter
                power = 1 - stats.nct.cdf(t_alpha, 2*n-2, ncp)
            else:  # non_inferiority
                # Calculate power for non-inferiority test
                t_alpha = stats.t.ppf(1 - request.alpha, 2*n-2)
                adjusted_diff = mean_diff - request.non_inferiority_margin
                ncp = adjusted_diff / (request.standard_deviation * np.sqrt(2/n))
                power = 1 - stats.nct.cdf(t_alpha, 2*n-2, ncp)
            
            power_curve.append({
                "sample_size_per_arm": n,
                "total_sample_size": 2*n,
                "power": round(power, 3)
            })
        
        # Find the minimum sample size that achieves the desired power
        target_power = request.power
        min_n_for_target = next((p["sample_size_per_arm"] for p in power_curve if p["power"] >= target_power), max_n)
        
        # Calculate with dropouts
        total_with_dropouts = int(np.ceil(2 * min_n_for_target / (1 - request.dropout_rate)))
        
        return {
            "power_curve": power_curve,
            "recommended_sample_size": {
                "per_arm": min_n_for_target,
                "total": 2 * min_n_for_target,
                "with_dropouts": total_with_dropouts
            },
            "parameters": {
                "approach": request.approach,
                "test_reduction": request.test_reduction,
                "control_reduction": request.control_reduction,
                "standard_deviation": request.standard_deviation,
                "non_inferiority_margin": request.non_inferiority_margin,
                "alpha": request.alpha,
                "target_power": request.power,
                "dropout_rate": request.dropout_rate
            }
        }
    except Exception as e:
        logger.exception("Error in dyspepsia power curve endpoint")
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")

@router.post("/chronic-pancreatitis/power-curve", response_model=Dict[str, Any])
async def simulate_pancreatitis_power_curve(
    request: EnzymaxPancreatitisRequest = Body(...)
):
    """
    Generate a power curve for chronic pancreatitis studies.
    
    This endpoint calculates statistical power across a range of sample sizes
    to help visualize the relationship between sample size and power.
    """
    try:
        # Validate inputs
        if request.approach == "non_inferiority" and request.non_inferiority_margin is None:
            raise HTTPException(status_code=400, detail="non_inferiority_margin is required for non-inferiority approach")
        
        # Generate a range of sample sizes to evaluate
        min_n = 10
        max_n = 200
        
        if max_n <= 100:
            sample_sizes = list(range(min_n, max_n + 1, 5))
        elif max_n <= 200:
            sample_sizes = list(range(min_n, 100, 10)) + list(range(100, max_n + 1, 20))
        else:
            sample_sizes = list(range(min_n, 100, 10)) + list(range(100, 200, 20)) + list(range(200, max_n + 1, 50))
        
        # Ensure we include the max sample size
        if max_n not in sample_sizes:
            sample_sizes.append(max_n)
        
        # Sort sample sizes
        sample_sizes.sort()
        
        # Calculate the mean difference
        mean_diff = request.test_cfa_change - request.control_cfa_change
        
        # Calculate power for each sample size
        power_curve = []
        for n in sample_sizes:
            if request.approach == "superiority":
                # Calculate power for superiority test
                t_alpha = stats.t.ppf(1 - request.alpha/2, 2*n-2)
                ncp = mean_diff / (request.standard_deviation * np.sqrt(2/n))  # Non-centrality parameter
                power = 1 - stats.nct.cdf(t_alpha, 2*n-2, ncp)
            else:  # non_inferiority
                # Calculate power for non-inferiority test
                t_alpha = stats.t.ppf(1 - request.alpha, 2*n-2)
                adjusted_diff = mean_diff - request.non_inferiority_margin
                ncp = adjusted_diff / (request.standard_deviation * np.sqrt(2/n))
                power = 1 - stats.nct.cdf(t_alpha, 2*n-2, ncp)
            
            power_curve.append({
                "sample_size_per_arm": n,
                "total_sample_size": 2*n,
                "power": round(power, 3)
            })
        
        # Find the minimum sample size that achieves the desired power
        target_power = request.power
        min_n_for_target = next((p["sample_size_per_arm"] for p in power_curve if p["power"] >= target_power), max_n)
        
        # Calculate with dropouts
        total_with_dropouts = int(np.ceil(2 * min_n_for_target / (1 - request.dropout_rate)))
        
        return {
            "power_curve": power_curve,
            "recommended_sample_size": {
                "per_arm": min_n_for_target,
                "total": 2 * min_n_for_target,
                "with_dropouts": total_with_dropouts
            },
            "parameters": {
                "approach": request.approach,
                "test_cfa_change": request.test_cfa_change,
                "control_cfa_change": request.control_cfa_change,
                "standard_deviation": request.standard_deviation,
                "non_inferiority_margin": request.non_inferiority_margin,
                "alpha": request.alpha,
                "target_power": request.power,
                "dropout_rate": request.dropout_rate
            }
        }
    except Exception as e:
        logger.exception("Error in pancreatitis power curve endpoint")
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")

@router.get("/sample-scenarios", response_model=Dict[str, Any])
async def get_enzymax_sample_scenarios():
    """
    Get sample scenarios based on the Enzymax Forte Study Design document.
    
    This endpoint returns pre-calculated sample size scenarios directly from
    the FDA biostatistician study design document.
    """
    # Functional Dyspepsia - Superiority Approach (Ullah et al.)
    dyspepsia_superiority_scenarios = [
        {"test": -5, "placebo": -1, "std_dev": 19, "sample_size_per_arm": 355},
        {"test": -5, "placebo": 0, "std_dev": 19, "sample_size_per_arm": 228},
        {"test": -5, "placebo": 1, "std_dev": 19, "sample_size_per_arm": 159},
        {"test": -5, "placebo": 2, "std_dev": 19, "sample_size_per_arm": 117},
        {"test": -5, "placebo": 3, "std_dev": 19, "sample_size_per_arm": 90},
        {"test": -5, "placebo": 4, "std_dev": 19, "sample_size_per_arm": 71},
        {"test": -5, "placebo": 5, "std_dev": 19, "sample_size_per_arm": 58},
        {"test": -4, "placebo": -1, "std_dev": 19, "sample_size_per_arm": 630},
        {"test": -4, "placebo": 0, "std_dev": 19, "sample_size_per_arm": 355},
        {"test": -4, "placebo": 1, "std_dev": 19, "sample_size_per_arm": 228},
        {"test": -4, "placebo": 2, "std_dev": 19, "sample_size_per_arm": 159},
        {"test": -4, "placebo": 3, "std_dev": 19, "sample_size_per_arm": 117},
        {"test": -4, "placebo": 4, "std_dev": 19, "sample_size_per_arm": 90}
    ]
    
    # Functional Dyspepsia - Superiority Approach (Majeed et al.)
    majeed_scenarios = [
        {"measure": "SF-LDQ", "test": 6, "placebo": 3, "std_dev": 5, "sample_size_per_arm": 45},
        {"measure": "NDI-SF", "test": 11, "placebo": 6, "std_dev": 7, "sample_size_per_arm": 32},
        {"measure": "CFI-S", "test": 9, "placebo": 3, "std_dev": 4, "sample_size_per_arm": 9},
        {"measure": "VAS", "test": 5, "placebo": 2, "std_dev": 2.5, "sample_size_per_arm": 12},
        {"measure": "GDSS", "test": 3, "placebo": 2, "std_dev": 2, "sample_size_per_arm": 64}
    ]
    
    # Functional Dyspepsia - Non-Inferiority Approach
    dyspepsia_noninferiority_scenarios = [
        {"reference": 5, "test": 5, "diff": 0, "std_dev": 18, "margin": -10, "sample_size_per_arm": 52},
        {"reference": 5, "test": 4, "diff": -1, "std_dev": 18, "margin": -10, "sample_size_per_arm": 64},
        {"reference": 5, "test": 3, "diff": -2, "std_dev": 18, "margin": -10, "sample_size_per_arm": 81},
        {"reference": 5, "test": 2, "diff": -3, "std_dev": 18, "margin": -10, "sample_size_per_arm": 105},
        {"reference": 10, "test": 10, "diff": 0, "std_dev": 7, "margin": -10, "sample_size_per_arm": 9},
        {"reference": 10, "test": 9, "diff": -1, "std_dev": 7, "margin": -10, "sample_size_per_arm": 11},
        {"reference": 10, "test": 8, "diff": -2, "std_dev": 7, "margin": -10, "sample_size_per_arm": 14},
        {"reference": 10, "test": 7, "diff": -3, "std_dev": 7, "margin": -10, "sample_size_per_arm": 17}
    ]
    
    return {
        "functional_dyspepsia": {
            "superiority": {
                "ullah": dyspepsia_superiority_scenarios,
                "majeed": majeed_scenarios
            },
            "non_inferiority": dyspepsia_noninferiority_scenarios
        },
        "chronic_pancreatitis": {
            "superiority": [
                # Would add scenarios from the document here
            ],
            "non_inferiority": [
                # Would add scenarios from the document here
            ]
        },
        "recommendations": {
            "functional_dyspepsia": "For functional dyspepsia, using Ullah et al. approach with NDI SF1 score as the primary endpoint, a study with 58 participants per arm (total 116) would be sufficient for a superiority design. With 20% dropout allowance, 146 total participants would be recommended.",
            "chronic_pancreatitis": "For chronic pancreatitis, using CFA as the primary endpoint, sample size would depend on the expected effect sizes."
        }
    }