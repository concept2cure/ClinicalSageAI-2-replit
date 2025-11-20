"""
Advanced Simulation API for TrialSage Study Architect™
------------------------------------------------------
Provides sophisticated simulation capabilities for clinical trial design,
including Monte Carlo simulations, adaptive design simulations,
and advanced statistical modeling.
"""

import numpy as np
import scipy.stats as stats
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Union, Any, Literal
import logging
import pandas as pd
from datetime import datetime

# Create router
router = APIRouter(prefix="/api/simulation", tags=["simulation"])

# Set up logging
logger = logging.getLogger(__name__)

# Define request and response models
class MonteCarloRequest(BaseModel):
    """Request model for Monte Carlo simulations"""
    design_type: Literal["parallel", "crossover", "adaptive", "group_sequential"] = Field(
        ..., description="Type of study design to simulate"
    )
    test_type: Literal["superiority", "non_inferiority", "equivalence"] = Field(
        ..., description="Type of statistical test"
    )
    endpoint_type: Literal["continuous", "binary", "time_to_event", "count"] = Field(
        ..., description="Type of primary endpoint"
    )
    alpha: float = Field(0.05, description="Significance level (Type I error rate)")
    power: float = Field(0.8, description="Desired power (1 - Type II error rate)")
    effect_size: float = Field(..., description="Expected effect size")
    variability: float = Field(..., description="Measure of variability (SD for continuous, dispersion for others)")
    margin: Optional[float] = Field(None, description="Non-inferiority or equivalence margin")
    dropout_rate: float = Field(0.2, description="Expected dropout rate")
    sample_size: int = Field(..., description="Total sample size to simulate")
    n_simulations: int = Field(1000, description="Number of Monte Carlo simulation iterations")
    interim_analyses: Optional[List[float]] = Field(None, description="List of fractions at which to perform interim analyses")
    allocation_ratio: List[float] = Field([1.0, 1.0], description="Allocation ratio between arms")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    include_sensitivity: bool = Field(False, description="Whether to include sensitivity analyses")

class SimulationResult(BaseModel):
    """Base model for simulation results"""
    sim_id: str
    timestamp: str
    execution_time_ms: float
    n_simulations: int
    success_rate: float
    design_type: str
    test_type: str
    parameters: Dict[str, Any]

class MonteCarloResponse(SimulationResult):
    """Response model for Monte Carlo simulations"""
    empirical_power: float
    type_1_error: float
    average_sample_size: float
    success_probability: List[Dict[str, float]]
    sample_size_distribution: Optional[List[Dict[str, float]]]
    sensitivity_analysis: Optional[Dict[str, Any]]
    
class AdaptiveSimulationRequest(BaseModel):
    """Request model for adaptive design simulations"""
    adaptation_type: Literal["sample_size_reassessment", "response_adaptive", "treatment_selection", "early_stopping"] = Field(
        ..., description="Type of adaptation"
    )
    max_sample_size: int = Field(..., description="Maximum total sample size")
    initial_sample_size: int = Field(..., description="Initial sample size before first adaptation")
    interim_points: List[float] = Field(..., description="List of fractions at which to perform interim analyses")
    alpha_spending: Literal["obrien_fleming", "pocock", "haybittle_peto", "power_family"] = Field(
        "obrien_fleming", description="Alpha spending function"
    )
    futility_bounds: Optional[List[float]] = Field(None, description="Futility boundaries at each interim")
    efficacy_bounds: Optional[List[float]] = Field(None, description="Efficacy boundaries at each interim")
    effect_size: float = Field(..., description="Expected effect size")
    std_dev: float = Field(1.0, description="Standard deviation")
    alpha: float = Field(0.05, description="Overall significance level")
    n_simulations: int = Field(1000, description="Number of simulation iterations")

class AdaptiveSimulationResponse(SimulationResult):
    """Response model for adaptive design simulations"""
    expected_sample_size: float
    probability_early_stopping: float
    conditional_power: List[Dict[str, float]]
    efficacy_stopping: List[Dict[str, float]]
    futility_stopping: List[Dict[str, float]]
    average_treatment_effect: float

# Helper functions for simulations
def run_monte_carlo_continuous(
    n_per_group: List[int],
    effect_size: float,
    std_dev: float,
    alpha: float = 0.05,
    test_type: str = "superiority",
    margin: Optional[float] = None,
    dropout_rate: float = 0.0,
    n_simulations: int = 1000,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    Run Monte Carlo simulation for continuous endpoint.
    
    Args:
        n_per_group: List of sample sizes per group
        effect_size: Expected difference between groups
        std_dev: Standard deviation
        alpha: Significance level
        test_type: Type of test (superiority, non_inferiority, equivalence)
        margin: Non-inferiority or equivalence margin
        dropout_rate: Expected dropout rate
        n_simulations: Number of simulation iterations
        seed: Random seed for reproducibility
        
    Returns:
        Dictionary with simulation results
    """
    if seed is not None:
        np.random.seed(seed)
    
    # Adjust for dropouts
    n_per_group_adjusted = [int(n * (1 - dropout_rate)) for n in n_per_group]
    
    # Initialize counters
    significant_results = 0
    
    # Calculate p-values for each simulation
    p_values = []
    effect_estimates = []
    
    for _ in range(n_simulations):
        # Generate control group data
        control = np.random.normal(0, std_dev, n_per_group_adjusted[0])
        
        # Generate treatment group data
        treatment = np.random.normal(effect_size, std_dev, n_per_group_adjusted[1])
        
        # Run t-test
        t_stat, p_value = stats.ttest_ind(treatment, control, equal_var=True)
        p_values.append(p_value)
        
        # Calculate observed effect
        effect = np.mean(treatment) - np.mean(control)
        effect_estimates.append(effect)
        
        # Determine significance based on test type
        if test_type == "superiority":
            # One-sided test for superiority
            if p_value / 2 < alpha and t_stat > 0:
                significant_results += 1
        elif test_type == "non_inferiority" and margin is not None:
            # Calculate lower bound of CI
            se = np.sqrt(std_dev**2 * (1/n_per_group_adjusted[0] + 1/n_per_group_adjusted[1]))
            lower_bound = effect - stats.t.ppf(1-alpha, n_per_group_adjusted[0] + n_per_group_adjusted[1] - 2) * se
            
            # Test if lower bound is greater than -margin (non-inferiority)
            if lower_bound > -margin:
                significant_results += 1
        elif test_type == "equivalence" and margin is not None:
            # Calculate bounds of CI
            se = np.sqrt(std_dev**2 * (1/n_per_group_adjusted[0] + 1/n_per_group_adjusted[1]))
            lower_bound = effect - stats.t.ppf(1-alpha/2, n_per_group_adjusted[0] + n_per_group_adjusted[1] - 2) * se
            upper_bound = effect + stats.t.ppf(1-alpha/2, n_per_group_adjusted[0] + n_per_group_adjusted[1] - 2) * se
            
            # Test if CI is within [-margin, margin] (equivalence)
            if lower_bound > -margin and upper_bound < margin:
                significant_results += 1
    
    # Calculate empirical power
    empirical_power = significant_results / n_simulations
    
    # Calculate distribution of p-values and effects
    p_value_quantiles = np.quantile(p_values, [0.025, 0.25, 0.5, 0.75, 0.975])
    effect_quantiles = np.quantile(effect_estimates, [0.025, 0.25, 0.5, 0.75, 0.975])
    
    # Format success probability by sample size
    success_probability = [
        {"sample_size": sum(n_per_group), "power": empirical_power}
    ]
    
    return {
        "empirical_power": empirical_power,
        "type_1_error": 1 - empirical_power if effect_size == 0 else None,
        "effect_estimate_mean": float(np.mean(effect_estimates)),
        "effect_estimate_sd": float(np.std(effect_estimates)),
        "effect_estimate_median": float(np.median(effect_estimates)),
        "effect_estimate_ci": [float(effect_quantiles[0]), float(effect_quantiles[4])],
        "p_value_quantiles": {
            "p025": float(p_value_quantiles[0]),
            "p25": float(p_value_quantiles[1]),
            "p50": float(p_value_quantiles[2]),
            "p75": float(p_value_quantiles[3]),
            "p975": float(p_value_quantiles[4])
        },
        "success_probability": success_probability
    }

def run_monte_carlo_binary(
    n_per_group: List[int],
    p_control: float,
    p_treatment: float,
    alpha: float = 0.05,
    test_type: str = "superiority",
    margin: Optional[float] = None,
    dropout_rate: float = 0.0,
    n_simulations: int = 1000,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    Run Monte Carlo simulation for binary endpoint.
    
    Args:
        n_per_group: List of sample sizes per group
        p_control: Expected proportion in control group
        p_treatment: Expected proportion in treatment group
        alpha: Significance level
        test_type: Type of test (superiority, non_inferiority, equivalence)
        margin: Non-inferiority or equivalence margin
        dropout_rate: Expected dropout rate
        n_simulations: Number of simulation iterations
        seed: Random seed for reproducibility
        
    Returns:
        Dictionary with simulation results
    """
    if seed is not None:
        np.random.seed(seed)
    
    # Adjust for dropouts
    n_per_group_adjusted = [int(n * (1 - dropout_rate)) for n in n_per_group]
    
    # Initialize counters
    significant_results = 0
    
    # Calculate effect size (risk difference)
    effect_size = p_treatment - p_control
    
    # Track test statistics
    test_stats = []
    p_values = []
    risk_diffs = []
    
    for _ in range(n_simulations):
        # Generate control group data
        control = np.random.binomial(1, p_control, n_per_group_adjusted[0])
        
        # Generate treatment group data
        treatment = np.random.binomial(1, p_treatment, n_per_group_adjusted[1])
        
        # Calculate proportions
        p_c = np.mean(control)
        p_t = np.mean(treatment)
        
        # Calculate risk difference
        risk_diff = p_t - p_c
        risk_diffs.append(risk_diff)
        
        # Calculate pooled proportion for standard error
        p_pooled = (np.sum(control) + np.sum(treatment)) / (n_per_group_adjusted[0] + n_per_group_adjusted[1])
        
        # Standard error of difference in proportions
        if test_type == "superiority":
            # Pooled standard error for superiority
            se = np.sqrt(p_pooled * (1 - p_pooled) * (1/n_per_group_adjusted[0] + 1/n_per_group_adjusted[1]))
        else:
            # Unpooled standard error for non-inferiority/equivalence
            se = np.sqrt(p_c * (1 - p_c) / n_per_group_adjusted[0] + p_t * (1 - p_t) / n_per_group_adjusted[1])
        
        # Z-statistic
        z = risk_diff / se if se > 0 else 0
        test_stats.append(z)
        
        # Two-sided p-value
        p_value = 2 * (1 - stats.norm.cdf(abs(z)))
        p_values.append(p_value)
        
        # Determine significance based on test type
        if test_type == "superiority":
            # One-sided test for superiority
            if p_value / 2 < alpha and z > 0:
                significant_results += 1
        elif test_type == "non_inferiority" and margin is not None:
            # Calculate lower bound of CI
            lower_bound = risk_diff - stats.norm.ppf(1-alpha) * se
            
            # Test if lower bound is greater than -margin (non-inferiority)
            if lower_bound > -margin:
                significant_results += 1
        elif test_type == "equivalence" and margin is not None:
            # Calculate bounds of CI
            lower_bound = risk_diff - stats.norm.ppf(1-alpha/2) * se
            upper_bound = risk_diff + stats.norm.ppf(1-alpha/2) * se
            
            # Test if CI is within [-margin, margin] (equivalence)
            if lower_bound > -margin and upper_bound < margin:
                significant_results += 1
    
    # Calculate empirical power
    empirical_power = significant_results / n_simulations
    
    # Calculate distribution of test statistics and risk differences
    test_stat_quantiles = np.quantile(test_stats, [0.025, 0.25, 0.5, 0.75, 0.975])
    risk_diff_quantiles = np.quantile(risk_diffs, [0.025, 0.25, 0.5, 0.75, 0.975])
    
    # Format success probability by sample size
    success_probability = [
        {"sample_size": sum(n_per_group), "power": empirical_power}
    ]
    
    return {
        "empirical_power": empirical_power,
        "type_1_error": 1 - empirical_power if p_control == p_treatment else None,
        "risk_difference_mean": float(np.mean(risk_diffs)),
        "risk_difference_sd": float(np.std(risk_diffs)),
        "risk_difference_median": float(np.median(risk_diffs)),
        "risk_difference_ci": [float(risk_diff_quantiles[0]), float(risk_diff_quantiles[4])],
        "test_statistic_quantiles": {
            "z025": float(test_stat_quantiles[0]),
            "z25": float(test_stat_quantiles[1]),
            "z50": float(test_stat_quantiles[2]),
            "z75": float(test_stat_quantiles[3]),
            "z975": float(test_stat_quantiles[4])
        },
        "success_probability": success_probability
    }

def simulate_adaptive_design(
    adaptation_type: str,
    max_sample_size: int,
    initial_sample_size: int,
    interim_points: List[float],
    alpha_spending: str,
    effect_size: float,
    std_dev: float = 1.0,
    futility_bounds: Optional[List[float]] = None,
    efficacy_bounds: Optional[List[float]] = None,
    alpha: float = 0.05,
    n_simulations: int = 1000,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    Simulate an adaptive clinical trial design.
    
    Args:
        adaptation_type: Type of adaptation
        max_sample_size: Maximum total sample size
        initial_sample_size: Initial sample size before first adaptation
        interim_points: List of fractions at which to perform interim analyses
        alpha_spending: Alpha spending function
        effect_size: Expected effect size
        std_dev: Standard deviation
        futility_bounds: Futility boundaries at each interim
        efficacy_bounds: Efficacy boundaries at each interim
        alpha: Overall significance level
        n_simulations: Number of simulation iterations
        seed: Random seed for reproducibility
        
    Returns:
        Dictionary with simulation results
    """
    if seed is not None:
        np.random.seed(seed)
    
    # Number of analyses (including final)
    n_analyses = len(interim_points) + 1
    
    # Determine alpha spending based on selected function
    if alpha_spending == "obrien_fleming":
        # O'Brien-Fleming spending
        if n_analyses == 2:  # One interim plus final
            alpha_spend = [0.005, alpha - 0.005]
        elif n_analyses == 3:  # Two interims plus final
            alpha_spend = [0.0005, 0.014, alpha - 0.0145]
        elif n_analyses == 4:  # Three interims plus final
            alpha_spend = [0.0001, 0.004, 0.019, alpha - 0.0231]
        else:
            # Default equal spacing
            alpha_spend = [alpha / n_analyses] * n_analyses
    elif alpha_spending == "pocock":
        # Pocock spending (approximately equal alpha at each analysis)
        alpha_spend = [alpha / n_analyses] * n_analyses
    elif alpha_spending == "haybittle_peto":
        # Haybittle-Peto (very strict early stopping)
        if n_analyses > 1:
            alpha_spend = [0.001] * (n_analyses - 1) + [alpha - 0.001 * (n_analyses - 1)]
        else:
            alpha_spend = [alpha]
    else:  # power_family or default
        # Simple linear spending
        alpha_spend = [i/sum(range(1, n_analyses+1)) * alpha for i in range(1, n_analyses+1)]
    
    # Calculate critical values for efficacy
    efficacy_critical_values = [stats.norm.ppf(1 - a) for a in alpha_spend]
    
    # Use provided efficacy bounds if available
    if efficacy_bounds is not None and len(efficacy_bounds) == len(interim_points):
        efficacy_critical_values = efficacy_bounds + [efficacy_critical_values[-1]]
    
    # Use provided futility bounds if available, otherwise use non-binding futility
    if futility_bounds is not None and len(futility_bounds) == len(interim_points):
        futility_critical_values = futility_bounds + [-100]  # No futility stopping at final analysis
    else:
        # Default conservative futility bounds
        futility_critical_values = [-0.5] * len(interim_points) + [-100]
    
    # Track results
    stopped_early = 0
    stopped_efficacy = [0] * n_analyses
    stopped_futility = [0] * n_analyses
    final_sample_sizes = []
    treatment_effects = []
    
    # Interim sample sizes
    interim_sample_sizes = [int(initial_sample_size + (max_sample_size - initial_sample_size) * point) 
                           for point in interim_points]
    sample_sizes = interim_sample_sizes + [max_sample_size]
    
    for _ in range(n_simulations):
        # Initialize
        trial_stopped = False
        n_enrolled = 0
        z_stats = []
        
        # For each analysis
        for i in range(n_analyses):
            current_n = sample_sizes[i]
            additional_n = current_n - n_enrolled
            
            # Generate additional data
            control_data = np.random.normal(0, std_dev, additional_n // 2)
            treatment_data = np.random.normal(effect_size, std_dev, additional_n - additional_n // 2)
            
            # Accumulate sample size
            n_enrolled = current_n
            
            # Calculate z-statistic
            mean_diff = np.mean(treatment_data) - np.mean(control_data)
            se = std_dev * np.sqrt(2 / (additional_n // 2))
            z_stat = mean_diff / se
            z_stats.append(z_stat)
            
            # Check efficacy boundary
            if z_stat >= efficacy_critical_values[i]:
                stopped_early += 1
                stopped_efficacy[i] += 1
                trial_stopped = True
                break
            
            # Check futility boundary (except at final analysis)
            if i < n_analyses - 1 and z_stat <= futility_critical_values[i]:
                stopped_early += 1
                stopped_futility[i] += 1
                trial_stopped = True
                break
        
        # Record final sample size and estimated effect
        final_sample_sizes.append(n_enrolled)
        treatment_effects.append(mean_diff if 'mean_diff' in locals() else None)
    
    # Calculate expected sample size
    expected_sample_size = np.mean(final_sample_sizes)
    
    # Calculate probability of early stopping
    prob_early_stopping = stopped_early / n_simulations
    
    # Calculate efficacy and futility stopping probabilities
    efficacy_prob = [count / n_simulations for count in stopped_efficacy]
    futility_prob = [count / n_simulations for count in stopped_futility]
    
    # Format results for efficacy and futility stopping
    efficacy_stopping = [
        {"analysis": i+1, "sample_size": sample_sizes[i], "probability": prob}
        for i, prob in enumerate(efficacy_prob)
    ]
    
    futility_stopping = [
        {"analysis": i+1, "sample_size": sample_sizes[i], "probability": prob}
        for i, prob in enumerate(futility_prob)
    ]
    
    # Format conditional power
    conditional_power = []
    for i in range(len(interim_points)):
        # Placeholder for conditional power calculation
        conditional_power.append({
            "analysis": i+1,
            "sample_size": sample_sizes[i],
            "power": np.sum(efficacy_prob[i:]) / (1 - np.sum(efficacy_prob[:i]) - np.sum(futility_prob[:i])) 
                    if (np.sum(efficacy_prob[:i]) + np.sum(futility_prob[:i])) < 1 else 0
        })
    
    return {
        "expected_sample_size": float(expected_sample_size),
        "probability_early_stopping": prob_early_stopping,
        "average_treatment_effect": float(np.mean([e for e in treatment_effects if e is not None])),
        "efficacy_stopping": efficacy_stopping,
        "futility_stopping": futility_stopping,
        "conditional_power": conditional_power,
        "alpha_spending": [float(a) for a in alpha_spend],
        "critical_values": {
            "efficacy": [float(cv) for cv in efficacy_critical_values],
            "futility": [float(cv) for cv in futility_critical_values]
        }
    }

# Define API endpoints
@router.post("/monte-carlo", response_model=MonteCarloResponse)
async def run_monte_carlo_simulation(
    request: MonteCarloRequest = Body(...)
):
    """
    Run Monte Carlo simulation for clinical trial design.
    
    This endpoint performs detailed simulation based on the specified parameters
    to estimate power, sample size requirements, and other statistical properties.
    """
    try:
        start_time = datetime.now()
        
        # Generate a unique simulation ID
        sim_id = f"sim_{start_time.strftime('%Y%m%d%H%M%S')}_{np.random.randint(1000, 9999)}"
        
        # Set seed for reproducibility if provided
        if request.seed is not None:
            np.random.seed(request.seed)
        
        # Calculate sample size per group based on allocation ratio
        total_allocation = sum(request.allocation_ratio)
        n_per_group = [int(request.sample_size * ratio / total_allocation) for ratio in request.allocation_ratio]
        
        # Adjust if rounding caused a discrepancy
        if sum(n_per_group) != request.sample_size:
            n_per_group[0] += request.sample_size - sum(n_per_group)
        
        # Run appropriate simulation based on endpoint type
        if request.endpoint_type == "continuous":
            sim_results = run_monte_carlo_continuous(
                n_per_group=n_per_group,
                effect_size=request.effect_size,
                std_dev=request.variability,
                alpha=request.alpha,
                test_type=request.test_type,
                margin=request.margin,
                dropout_rate=request.dropout_rate,
                n_simulations=request.n_simulations,
                seed=request.seed
            )
        elif request.endpoint_type == "binary":
            # For binary endpoints, convert effect size to proportions
            # Assume effect_size is absolute risk difference
            if request.test_type == "superiority":
                # For superiority, assume control rate is baseline and treatment adds effect
                p_control = max(0, min(1, 0.5 - request.effect_size / 2))
                p_treatment = max(0, min(1, p_control + request.effect_size))
            else:
                # For non-inferiority/equivalence, assume both are close but slightly different
                p_control = 0.5
                p_treatment = max(0, min(1, p_control + request.effect_size))
            
            sim_results = run_monte_carlo_binary(
                n_per_group=n_per_group,
                p_control=p_control,
                p_treatment=p_treatment,
                alpha=request.alpha,
                test_type=request.test_type,
                margin=request.margin,
                dropout_rate=request.dropout_rate,
                n_simulations=request.n_simulations,
                seed=request.seed
            )
        elif request.endpoint_type == "time_to_event":
            # Placeholder for time-to-event simulation
            # This would use survival analysis methods
            raise HTTPException(status_code=501, detail="Time-to-event endpoint simulation not yet implemented")
        elif request.endpoint_type == "count":
            # Placeholder for count data simulation
            # This would use Poisson/negative binomial distributions
            raise HTTPException(status_code=501, detail="Count endpoint simulation not yet implemented")
        else:
            raise HTTPException(status_code=400, detail=f"Unknown endpoint type: {request.endpoint_type}")
        
        # Calculate execution time
        execution_time = (datetime.now() - start_time).total_seconds() * 1000  # milliseconds
        
        # Run sensitivity analysis if requested
        sensitivity_results = None
        if request.include_sensitivity:
            sensitivity_results = {
                "effect_size_sensitivity": [],
                "variability_sensitivity": [],
                "dropout_sensitivity": []
            }
            
            # Effect size sensitivity
            effect_sizes = [request.effect_size * factor for factor in [0.5, 0.75, 1.0, 1.25, 1.5]]
            for effect in effect_sizes:
                if request.endpoint_type == "continuous":
                    result = run_monte_carlo_continuous(
                        n_per_group=n_per_group,
                        effect_size=effect,
                        std_dev=request.variability,
                        alpha=request.alpha,
                        test_type=request.test_type,
                        margin=request.margin,
                        dropout_rate=request.dropout_rate,
                        n_simulations=max(100, request.n_simulations // 10),  # Use fewer simulations for sensitivity
                        seed=None  # Different seed for each run
                    )
                    sensitivity_results["effect_size_sensitivity"].append({
                        "effect_size": effect,
                        "power": result["empirical_power"]
                    })
                elif request.endpoint_type == "binary":
                    # Skip for now - binary handling is more complex for sensitivity
                    pass
            
            # Variability sensitivity
            variabilities = [request.variability * factor for factor in [0.75, 1.0, 1.25, 1.5, 2.0]]
            for var in variabilities:
                if request.endpoint_type == "continuous":
                    result = run_monte_carlo_continuous(
                        n_per_group=n_per_group,
                        effect_size=request.effect_size,
                        std_dev=var,
                        alpha=request.alpha,
                        test_type=request.test_type,
                        margin=request.margin,
                        dropout_rate=request.dropout_rate,
                        n_simulations=max(100, request.n_simulations // 10),
                        seed=None
                    )
                    sensitivity_results["variability_sensitivity"].append({
                        "variability": var,
                        "power": result["empirical_power"]
                    })
            
            # Dropout sensitivity
            dropouts = [0.0, 0.1, 0.2, 0.3, 0.4]
            for dropout in dropouts:
                if request.endpoint_type == "continuous":
                    result = run_monte_carlo_continuous(
                        n_per_group=n_per_group,
                        effect_size=request.effect_size,
                        std_dev=request.variability,
                        alpha=request.alpha,
                        test_type=request.test_type,
                        margin=request.margin,
                        dropout_rate=dropout,
                        n_simulations=max(100, request.n_simulations // 10),
                        seed=None
                    )
                    sensitivity_results["dropout_sensitivity"].append({
                        "dropout_rate": dropout,
                        "power": result["empirical_power"]
                    })
        
        # Prepare response
        response = MonteCarloResponse(
            sim_id=sim_id,
            timestamp=start_time.isoformat(),
            execution_time_ms=execution_time,
            n_simulations=request.n_simulations,
            success_rate=sim_results["empirical_power"],
            design_type=request.design_type,
            test_type=request.test_type,
            empirical_power=sim_results["empirical_power"],
            type_1_error=sim_results.get("type_1_error"),
            average_sample_size=float(request.sample_size * (1 - request.dropout_rate)),
            success_probability=sim_results["success_probability"],
            sample_size_distribution=None,  # Not calculated in this version
            sensitivity_analysis=sensitivity_results,
            parameters={
                "endpoint_type": request.endpoint_type,
                "alpha": request.alpha,
                "power": request.power,
                "effect_size": request.effect_size,
                "variability": request.variability,
                "margin": request.margin,
                "dropout_rate": request.dropout_rate,
                "sample_size": request.sample_size,
                "allocation_ratio": request.allocation_ratio,
                "n_per_group": n_per_group
            }
        )
        
        return response
        
    except Exception as e:
        logger.exception("Error in Monte Carlo simulation")
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")

@router.post("/adaptive-design", response_model=AdaptiveSimulationResponse)
async def run_adaptive_design_simulation(
    request: AdaptiveSimulationRequest = Body(...)
):
    """
    Simulate adaptive clinical trial design.
    
    This endpoint simulates adaptive designs including sample size re-estimation,
    response-adaptive randomization, treatment selection, and early stopping.
    """
    try:
        start_time = datetime.now()
        
        # Generate a unique simulation ID
        sim_id = f"adaptive_{start_time.strftime('%Y%m%d%H%M%S')}_{np.random.randint(1000, 9999)}"
        
        # Run adaptive design simulation
        sim_results = simulate_adaptive_design(
            adaptation_type=request.adaptation_type,
            max_sample_size=request.max_sample_size,
            initial_sample_size=request.initial_sample_size,
            interim_points=request.interim_points,
            alpha_spending=request.alpha_spending,
            effect_size=request.effect_size,
            std_dev=request.std_dev,
            futility_bounds=request.futility_bounds,
            efficacy_bounds=request.efficacy_bounds,
            alpha=request.alpha,
            n_simulations=request.n_simulations
        )
        
        # Calculate execution time
        execution_time = (datetime.now() - start_time).total_seconds() * 1000  # milliseconds
        
        # Prepare response
        response = AdaptiveSimulationResponse(
            sim_id=sim_id,
            timestamp=start_time.isoformat(),
            execution_time_ms=execution_time,
            n_simulations=request.n_simulations,
            success_rate=sum(prob["probability"] for prob in sim_results["efficacy_stopping"]),
            design_type=f"adaptive_{request.adaptation_type}",
            test_type="group_sequential",
            expected_sample_size=sim_results["expected_sample_size"],
            probability_early_stopping=sim_results["probability_early_stopping"],
            conditional_power=sim_results["conditional_power"],
            efficacy_stopping=sim_results["efficacy_stopping"],
            futility_stopping=sim_results["futility_stopping"],
            average_treatment_effect=sim_results["average_treatment_effect"],
            parameters={
                "adaptation_type": request.adaptation_type,
                "max_sample_size": request.max_sample_size,
                "initial_sample_size": request.initial_sample_size,
                "interim_points": request.interim_points,
                "alpha_spending": request.alpha_spending,
                "effect_size": request.effect_size,
                "std_dev": request.std_dev,
                "alpha": request.alpha,
                "critical_values": sim_results["critical_values"]
            }
        )
        
        return response
        
    except Exception as e:
        logger.exception("Error in adaptive design simulation")
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")

@router.get("/methods", response_model=Dict[str, Any])
async def get_simulation_methods():
    """
    Get available simulation methods and their parameters.
    
    This endpoint provides information about the simulation methods
    supported by the API, including required parameters and constraints.
    """
    return {
        "monte_carlo": {
            "description": "Monte Carlo simulation for clinical trial design",
            "endpoint_types": ["continuous", "binary", "time_to_event", "count"],
            "design_types": ["parallel", "crossover", "adaptive", "group_sequential"],
            "test_types": ["superiority", "non_inferiority", "equivalence"],
            "parameters": {
                "alpha": "Significance level (Type I error rate)",
                "power": "Desired power (1 - Type II error rate)",
                "effect_size": "Expected effect size",
                "variability": "Measure of variability (SD for continuous, dispersion for others)",
                "margin": "Non-inferiority or equivalence margin (required for those test types)",
                "dropout_rate": "Expected dropout rate",
                "sample_size": "Total sample size to simulate",
                "n_simulations": "Number of Monte Carlo simulation iterations",
                "allocation_ratio": "Allocation ratio between arms"
            }
        },
        "adaptive_design": {
            "description": "Simulation of adaptive clinical trial designs",
            "adaptation_types": ["sample_size_reassessment", "response_adaptive", "treatment_selection", "early_stopping"],
            "alpha_spending": ["obrien_fleming", "pocock", "haybittle_peto", "power_family"],
            "parameters": {
                "max_sample_size": "Maximum total sample size",
                "initial_sample_size": "Initial sample size before first adaptation",
                "interim_points": "List of fractions at which to perform interim analyses",
                "effect_size": "Expected effect size",
                "std_dev": "Standard deviation",
                "futility_bounds": "Futility boundaries at each interim",
                "efficacy_bounds": "Efficacy boundaries at each interim",
                "alpha": "Overall significance level"
            }
        }
    }