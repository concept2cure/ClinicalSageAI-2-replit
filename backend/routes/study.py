"""
Study Simulation API
-------------------
Provides statistical simulation endpoints for clinical trial design 
including power calculations, sample size estimation, and Monte Carlo simulations.
"""

import numpy as np
import scipy.stats as stats
import pandas as pd
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Union, Any
import statsmodels.stats.power as smp
import logging

# Create router for study endpoints
router = APIRouter(prefix="/api/study", tags=["study"])

# Define request models
class SimulationRequest(BaseModel):
    test_type: str = Field(..., description="Type of test: 'superiority' or 'non_inferiority'")
    alpha: float = Field(..., description="Significance level (Type I error rate)")
    effect_size: float = Field(..., description="Expected effect size (e.g., Cohen's d, difference in means)")
    margin: Optional[float] = Field(None, description="Non-inferiority margin (required for non-inferiority tests)")
    max_n: int = Field(..., description="Maximum sample size to evaluate")
    std_dev: float = Field(1.0, description="Standard deviation (for continuous outcomes)")
    n_simulations: int = Field(1000, description="Number of Monte Carlo simulations to run")
    
    class Config:
        schema_extra = {
            "example": {
                "test_type": "superiority",
                "alpha": 0.05,
                "effect_size": 0.5,
                "margin": None,
                "max_n": 500,
                "std_dev": 1.0,
                "n_simulations": 1000
            }
        }

class SimulationResult(BaseModel):
    sample_size: int
    power: float
    
class SimulationResponse(BaseModel):
    results: List[SimulationResult]
    recommended_n: int
    target_power: float = 0.8
    test_type: str
    effect_size: float
    alpha: float
    margin: Optional[float] = None

logger = logging.getLogger(__name__)

# Helper functions for calculations
def calculate_power_t_test(n, effect_size, alpha=0.05, sigma=1.0):
    """Calculate power for a two-sample t-test with equal sample sizes per group."""
    # Convert total sample size to per-group sample size
    n_per_group = n // 2
    
    # Use statsmodels for power calculation
    power = smp.TTestIndPower().power(
        effect_size=effect_size,
        nobs1=n_per_group,
        alpha=alpha,
        ratio=1.0
    )
    return power

def calculate_power_non_inferiority(n, effect_size, margin, alpha=0.05, sigma=1.0):
    """Calculate power for a non-inferiority test."""
    # Convert total sample size to per-group sample size
    n_per_group = n // 2
    
    # For non-inferiority, we need to account for the margin in the calculation
    # Adjust effect size to account for the non-inferiority margin
    adjusted_effect = effect_size - margin
    
    # Standard error of the difference
    se = sigma * np.sqrt(2 / n_per_group)
    
    # Critical value for one-sided test
    z_crit = stats.norm.ppf(1 - alpha)
    
    # Power calculation
    z_power = adjusted_effect / se - z_crit
    power = stats.norm.cdf(z_power)
    
    return power

def run_monte_carlo_superiority(n, effect_size, alpha=0.05, sigma=1.0, n_sims=1000):
    """Run Monte Carlo simulation for a superiority test."""
    n_per_group = n // 2
    significant_tests = 0
    
    for _ in range(n_sims):
        # Generate control group data
        control = np.random.normal(0, sigma, n_per_group)
        
        # Generate treatment group data with the specified effect size
        treatment = np.random.normal(effect_size, sigma, n_per_group)
        
        # Perform t-test
        t_stat, p_value = stats.ttest_ind(treatment, control)
        
        # Count significant results (one-sided test)
        if p_value / 2 < alpha and t_stat > 0:  # One-sided test
            significant_tests += 1
    
    # Calculate empirical power
    power = significant_tests / n_sims
    
    return power

def run_monte_carlo_non_inferiority(n, effect_size, margin, alpha=0.05, sigma=1.0, n_sims=1000):
    """Run Monte Carlo simulation for a non-inferiority test."""
    n_per_group = n // 2
    significant_tests = 0
    
    for _ in range(n_sims):
        # Generate control group data
        control = np.random.normal(0, sigma, n_per_group)
        
        # Generate treatment group data with the specified effect size
        treatment = np.random.normal(effect_size, sigma, n_per_group)
        
        # Calculate the difference and its standard error
        mean_diff = np.mean(treatment) - np.mean(control)
        pooled_sd = np.sqrt(((n_per_group - 1) * np.var(treatment, ddof=1) + 
                             (n_per_group - 1) * np.var(control, ddof=1)) / 
                            (2 * n_per_group - 2))
        se_diff = pooled_sd * np.sqrt(2 / n_per_group)
        
        # Calculate the lower bound of the confidence interval
        lower_bound = mean_diff - stats.t.ppf(1 - alpha, 2 * n_per_group - 2) * se_diff
        
        # Test if lower bound is greater than -margin (non-inferiority)
        if lower_bound > -margin:
            significant_tests += 1
    
    # Calculate empirical power
    power = significant_tests / n_sims
    
    return power

@router.post("/simulate", response_model=SimulationResponse)
async def simulate_study_power(request: SimulationRequest = Body(...)):
    """
    Run power simulation for clinical trial design.
    
    This endpoint simulates statistical power across a range of sample sizes
    based on the provided parameters.
    """
    try:
        # Validate inputs
        if request.test_type not in ["superiority", "non_inferiority"]:
            raise HTTPException(status_code=400, detail="test_type must be 'superiority' or 'non_inferiority'")
        
        if request.test_type == "non_inferiority" and request.margin is None:
            raise HTTPException(status_code=400, detail="margin is required for non-inferiority tests")
        
        if request.alpha <= 0 or request.alpha >= 1:
            raise HTTPException(status_code=400, detail="alpha must be between 0 and 1")
        
        if request.max_n <= 0:
            raise HTTPException(status_code=400, detail="max_n must be positive")
        
        # Generate sample sizes to evaluate (more points for smaller sample sizes)
        if request.max_n <= 100:
            sample_sizes = list(range(10, request.max_n + 1, 10))
        elif request.max_n <= 200:
            sample_sizes = list(range(20, 100, 10)) + list(range(100, request.max_n + 1, 20))
        else:
            sample_sizes = list(range(20, 100, 20)) + list(range(100, 500, 50)) + list(range(500, request.max_n + 1, 100))
        
        # Ensure we include the max sample size
        if request.max_n not in sample_sizes:
            sample_sizes.append(request.max_n)
        
        # Sort sample sizes
        sample_sizes.sort()
        
        # Calculate power for each sample size
        results = []
        for n in sample_sizes:
            if n % 2 != 0:  # Ensure even sample size for equal allocation
                n += 1
                
            if request.test_type == "superiority":
                # For superiority tests, use analytical formula for speed
                if request.n_simulations <= 100:  # Use Monte Carlo for small simulations
                    power = run_monte_carlo_superiority(
                        n=n, 
                        effect_size=request.effect_size,
                        alpha=request.alpha,
                        sigma=request.std_dev,
                        n_sims=request.n_simulations
                    )
                else:
                    power = calculate_power_t_test(
                        n=n, 
                        effect_size=request.effect_size,
                        alpha=request.alpha,
                        sigma=request.std_dev
                    )
            else:  # Non-inferiority
                if request.n_simulations <= 100:  # Use Monte Carlo for small simulations
                    power = run_monte_carlo_non_inferiority(
                        n=n, 
                        effect_size=request.effect_size,
                        margin=request.margin,
                        alpha=request.alpha,
                        sigma=request.std_dev,
                        n_sims=request.n_simulations
                    )
                else:
                    power = calculate_power_non_inferiority(
                        n=n, 
                        effect_size=request.effect_size,
                        margin=request.margin,
                        alpha=request.alpha,
                        sigma=request.std_dev
                    )
            
            results.append(SimulationResult(sample_size=n, power=power))
        
        # Find the minimum sample size that achieves 80% power
        target_power = 0.8
        recommended_n = next((r.sample_size for r in results if r.power >= target_power), request.max_n)
        
        return SimulationResponse(
            results=results,
            recommended_n=recommended_n,
            target_power=target_power,
            test_type=request.test_type,
            effect_size=request.effect_size,
            alpha=request.alpha,
            margin=request.margin
        )
        
    except Exception as e:
        logger.exception("Error in simulation endpoint")
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


@router.get("/sample-size", response_model=Dict[str, Any])
async def calculate_sample_size(
    test_type: str,
    effect_size: float,
    power: float = 0.8,
    alpha: float = 0.05,
    margin: Optional[float] = None
):
    """
    Calculate required sample size for a desired statistical power.
    
    This endpoint returns the estimated sample size needed to achieve
    the specified power for detecting the given effect size.
    """
    try:
        if test_type not in ["superiority", "non_inferiority"]:
            raise HTTPException(status_code=400, detail="test_type must be 'superiority' or 'non_inferiority'")
            
        if test_type == "non_inferiority" and margin is None:
            raise HTTPException(status_code=400, detail="margin is required for non-inferiority tests")
        
        if test_type == "superiority":
            # Use statsmodels for sample size calculation
            n_per_group = smp.TTestIndPower().solve_power(
                effect_size=effect_size,
                power=power,
                alpha=alpha,
                ratio=1.0
            )
            total_n = int(np.ceil(n_per_group * 2))
            
        else:  # Non-inferiority
            # We'll use a binary search approach for non-inferiority
            min_n = 4  # Minimum reasonable sample size (2 per group)
            max_n = 10000  # Maximum reasonable sample size
            
            while min_n < max_n:
                mid_n = (min_n + max_n) // 2
                # Ensure it's even for equal allocation
                if mid_n % 2 != 0:
                    mid_n += 1
                    
                current_power = calculate_power_non_inferiority(
                    n=mid_n,
                    effect_size=effect_size,
                    margin=margin,
                    alpha=alpha
                )
                
                if abs(current_power - power) < 0.01:  # Close enough
                    total_n = mid_n
                    break
                elif current_power < power:
                    min_n = mid_n + 2  # Increase sample size
                else:
                    max_n = mid_n - 2  # Decrease sample size
            
            total_n = max_n  # Use the upper bound if we didn't converge
        
        return {
            "sample_size": total_n,
            "per_group": total_n // 2,
            "power": power,
            "effect_size": effect_size,
            "alpha": alpha,
            "test_type": test_type,
            "margin": margin
        }
        
    except Exception as e:
        logger.exception("Error in sample size calculation endpoint")
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")