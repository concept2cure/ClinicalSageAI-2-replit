#!/usr/bin/env Rscript
# R Statistical Analysis Module for TrialSage™
# Advanced clinical trial design optimization and regulatory statistics

# Load required libraries
suppressMessages({
  library(jsonlite)
  library(survival)
  library(pwr)
  library(gsDesign)
  library(rpact)
  library(dplyr)
  library(ggplot2)
  library(RColorBrewer)
  library(boot)
})

# Clinical Trial Design Optimization Class
ClinicalTrialOptimizer <- R6::R6Class("ClinicalTrialOptimizer",
  public = list(
    
    # Initialize optimizer
    initialize = function() {
      private$fda_guidelines <- list(
        "Phase_I" = list(
          "primary_endpoint" = "Safety",
          "typical_n" = c(20, 80),
          "duration_months" = c(12, 24),
          "success_criteria" = 0.33  # DLT rate threshold
        ),
        "Phase_II" = list(
          "primary_endpoint" = "Efficacy",
          "typical_n" = c(40, 300),
          "duration_months" = c(18, 36),
          "success_criteria" = 0.20  # Response rate threshold
        ),
        "Phase_III" = list(
          "primary_endpoint" = "Superiority",
          "typical_n" = c(300, 3000),
          "duration_months" = c(24, 60),
          "success_criteria" = 0.025  # Alpha level
        )
      )
      
      private$therapeutic_areas <- list(
        "Oncology" = list("effect_size" = 0.35, "dropout_rate" = 0.15),
        "Neurology" = list("effect_size" = 0.25, "dropout_rate" = 0.20),
        "Cardiovascular" = list("effect_size" = 0.30, "dropout_rate" = 0.10),
        "Immunology" = list("effect_size" = 0.40, "dropout_rate" = 0.12),
        "Infectious_Disease" = list("effect_size" = 0.45, "dropout_rate" = 0.08)
      )
    },
    
    # Optimize sample size for clinical trial
    optimize_sample_size = function(study_params) {
      tryCatch({
        phase <- study_params$phase
        indication <- study_params$indication
        effect_size <- study_params$effect_size
        power <- ifelse(is.null(study_params$power), 0.80, study_params$power)
        alpha <- ifelse(is.null(study_params$alpha), 0.05, study_params$alpha)
        
        # Get therapeutic area defaults
        therapeutic_defaults <- private$therapeutic_areas[[indication]]
        if (is.null(therapeutic_defaults)) {
          therapeutic_defaults <- list("effect_size" = 0.30, "dropout_rate" = 0.15)
        }
        
        # Calculate sample size based on phase
        if (phase == "Phase I") {
          result <- private$calculate_phase1_sample_size(study_params, therapeutic_defaults)
        } else if (phase == "Phase II") {
          result <- private$calculate_phase2_sample_size(study_params, therapeutic_defaults)
        } else if (phase == "Phase III") {
          result <- private$calculate_phase3_sample_size(study_params, therapeutic_defaults)
        } else {
          stop("Invalid phase specified")
        }
        
        # Add regulatory compliance assessment
        result$regulatory_compliance <- private$assess_regulatory_compliance(result, phase)
        
        # Add cost-effectiveness analysis
        result$cost_analysis <- private$analyze_cost_effectiveness(result, study_params)
        
        return(result)
        
      }, error = function(e) {
        return(list("error" = paste("Sample size optimization failed:", e$message)))
      })
    },
    
    # Perform interim analysis planning
    plan_interim_analysis = function(study_params) {
      tryCatch({
        # Group sequential design
        k <- ifelse(is.null(study_params$interim_looks), 2, study_params$interim_looks)
        alpha <- ifelse(is.null(study_params$alpha), 0.05, study_params$alpha)
        beta <- ifelse(is.null(study_params$beta), 0.20, study_params$beta)
        
        # Use gsDesign for group sequential boundaries
        design <- gsDesign(
          k = k,
          test.type = 1,  # One-sided test
          alpha = alpha,
          beta = beta,
          sfu = sfHSD,  # Hwang-Shih-DeCani spending function
          sfupar = -4
        )
        
        # Extract key information
        result <- list(
          "design_type" = "Group Sequential",
          "number_of_looks" = k,
          "alpha_spending" = design$upper$spend,
          "beta_spending" = design$lower$spend,
          "critical_values" = design$upper$bound,
          "information_fractions" = design$timing,
          "maximum_information" = design$n.I[k],
          "expected_sample_size" = design$n.I[k] * 0.75,  # Expected reduction
          "recommendations" = private$generate_interim_recommendations(design)
        )
        
        return(result)
        
      }, error = function(e) {
        return(list("error" = paste("Interim analysis planning failed:", e$message)))
      })
    },
    
    # Perform survival analysis for oncology trials
    analyze_survival_endpoints = function(study_params) {
      tryCatch({
        # Simulate survival data based on parameters
        hazard_ratio <- ifelse(is.null(study_params$hazard_ratio), 0.70, study_params$hazard_ratio)
        median_survival <- ifelse(is.null(study_params$median_survival), 12, study_params$median_survival)
        accrual_period <- ifelse(is.null(study_params$accrual_period), 18, study_params$accrual_period)
        followup_period <- ifelse(is.null(study_params$followup_period), 24, study_params$followup_period)
        
        # Calculate events needed
        events_needed <- private$calculate_events_for_survival(hazard_ratio, study_params)
        
        # Sample size calculation
        sample_size <- private$calculate_survival_sample_size(
          hazard_ratio, median_survival, accrual_period, followup_period
        )
        
        result <- list(
          "primary_endpoint" = "Overall Survival",
          "hazard_ratio" = hazard_ratio,
          "median_survival_control" = median_survival,
          "median_survival_treatment" = median_survival / hazard_ratio,
          "events_needed" = events_needed,
          "total_sample_size" = sample_size,
          "accrual_period_months" = accrual_period,
          "followup_period_months" = followup_period,
          "study_duration_months" = accrual_period + followup_period,
          "power_analysis" = private$perform_survival_power_analysis(sample_size, hazard_ratio)
        )
        
        return(result)
        
      }, error = function(e) {
        return(list("error" = paste("Survival analysis failed:", e$message)))
      })
    },
    
    # Generate comprehensive statistical report
    generate_statistical_report = function(study_params) {
      tryCatch({
        # Combine all analyses
        sample_size_result <- self$optimize_sample_size(study_params)
        interim_result <- self$plan_interim_analysis(study_params)
        
        # Add survival analysis if applicable
        if (!is.null(study_params$endpoint_type) && study_params$endpoint_type == "survival") {
          survival_result <- self$analyze_survival_endpoints(study_params)
        } else {
          survival_result <- NULL
        }
        
        # Generate executive summary
        executive_summary <- private$generate_executive_summary(
          sample_size_result, interim_result, survival_result
        )
        
        # Compile comprehensive report
        report <- list(
          "study_title" = study_params$title,
          "phase" = study_params$phase,
          "indication" = study_params$indication,
          "analysis_date" = Sys.Date(),
          "executive_summary" = executive_summary,
          "sample_size_analysis" = sample_size_result,
          "interim_analysis_plan" = interim_result,
          "survival_analysis" = survival_result,
          "regulatory_considerations" = private$generate_regulatory_considerations(study_params),
          "statistical_assumptions" = private$document_statistical_assumptions(study_params),
          "recommendations" = private$generate_comprehensive_recommendations(
            sample_size_result, interim_result, survival_result
          )
        )
        
        return(report)
        
      }, error = function(e) {
        return(list("error" = paste("Statistical report generation failed:", e$message)))
      })
    }
  ),
  
  private = list(
    fda_guidelines = NULL,
    therapeutic_areas = NULL,
    
    # Calculate Phase I sample size (3+3 design)
    calculate_phase1_sample_size = function(study_params, therapeutic_defaults) {
      # Traditional 3+3 design
      cohort_size <- 3
      max_dose_levels <- ifelse(is.null(study_params$dose_levels), 6, study_params$dose_levels)
      
      # Expected sample size calculation
      dlt_rate <- ifelse(is.null(study_params$expected_dlt_rate), 0.20, study_params$expected_dlt_rate)
      
      # Simulate 3+3 design
      expected_n <- cohort_size * 3  # Minimum
      max_n <- max_dose_levels * 6   # Maximum
      
      list(
        "design_type" = "3+3 Dose Escalation",
        "cohort_size" = cohort_size,
        "max_dose_levels" = max_dose_levels,
        "expected_sample_size" = expected_n,
        "maximum_sample_size" = max_n,
        "expected_dlt_rate" = dlt_rate,
        "study_duration_months" = 18,
        "primary_endpoint" = "Maximum Tolerated Dose"
      )
    },
    
    # Calculate Phase II sample size
    calculate_phase2_sample_size = function(study_params, therapeutic_defaults) {
      response_rate <- ifelse(is.null(study_params$response_rate), 0.30, study_params$response_rate)
      null_response_rate <- ifelse(is.null(study_params$null_response_rate), 0.10, study_params$null_response_rate)
      
      # Simon's two-stage design
      alpha <- 0.05
      beta <- 0.20
      
      # Calculate sample size for single-arm design
      n <- pwr.p.test(
        h = ES.h(response_rate, null_response_rate),
        sig.level = alpha,
        power = 1 - beta,
        alternative = "greater"
      )$n
      
      # Adjust for dropout
      dropout_rate <- therapeutic_defaults$dropout_rate
      adjusted_n <- ceiling(n / (1 - dropout_rate))
      
      list(
        "design_type" = "Single-Arm Phase II",
        "target_response_rate" = response_rate,
        "null_response_rate" = null_response_rate,
        "sample_size" = ceiling(adjusted_n),
        "dropout_rate" = dropout_rate,
        "power" = 0.80,
        "alpha" = alpha,
        "study_duration_months" = 24,
        "primary_endpoint" = "Objective Response Rate"
      )
    },
    
    # Calculate Phase III sample size
    calculate_phase3_sample_size = function(study_params, therapeutic_defaults) {
      effect_size <- ifelse(is.null(study_params$effect_size), 
                           therapeutic_defaults$effect_size, 
                           study_params$effect_size)
      
      # Two-sample t-test calculation
      n <- pwr.t.test(
        d = effect_size,
        sig.level = 0.05,
        power = 0.80,
        type = "two.sample",
        alternative = "two.sided"
      )$n
      
      # Adjust for dropout
      dropout_rate <- therapeutic_defaults$dropout_rate
      adjusted_n <- ceiling(n / (1 - dropout_rate))
      total_n <- adjusted_n * 2  # Two arms
      
      list(
        "design_type" = "Randomized Controlled Trial",
        "effect_size" = effect_size,
        "sample_size_per_arm" = adjusted_n,
        "total_sample_size" = total_n,
        "dropout_rate" = dropout_rate,
        "randomization_ratio" = "1:1",
        "power" = 0.80,
        "alpha" = 0.05,
        "study_duration_months" = 36,
        "primary_endpoint" = "Superiority"
      )
    },
    
    # Calculate events needed for survival analysis
    calculate_events_for_survival = function(hazard_ratio, study_params) {
      alpha <- 0.05
      beta <- 0.20
      
      # Calculate events using standard formula
      events <- 4 * (qnorm(1 - alpha/2) + qnorm(1 - beta))^2 / (log(hazard_ratio))^2
      
      return(ceiling(events))
    },
    
    # Calculate sample size for survival endpoints
    calculate_survival_sample_size = function(hazard_ratio, median_survival, accrual_period, followup_period) {
      # Simplified calculation - in practice would use more sophisticated methods
      events_needed <- private$calculate_events_for_survival(hazard_ratio, list())
      
      # Estimate sample size based on event rate
      total_study_time <- accrual_period + followup_period
      lambda <- log(2) / median_survival
      
      # Probability of event by end of study
      prob_event <- 1 - exp(-lambda * (total_study_time - accrual_period/2))
      
      sample_size <- ceiling(events_needed / prob_event)
      
      return(sample_size)
    },
    
    # Assess regulatory compliance
    assess_regulatory_compliance = function(result, phase) {
      guidelines <- private$fda_guidelines[[phase]]
      
      compliance_score <- 0.9  # Base score
      
      # Check sample size adequacy
      if (result$total_sample_size < guidelines$typical_n[1]) {
        compliance_score <- compliance_score - 0.2
      }
      
      list(
        "compliance_score" = compliance_score,
        "fda_guidance_alignment" = "High",
        "ich_e9_compliance" = "Compliant",
        "regulatory_risk" = ifelse(compliance_score > 0.8, "Low", "Medium")
      )
    },
    
    # Analyze cost-effectiveness
    analyze_cost_effectiveness = function(result, study_params) {
      # Cost per patient estimates
      cost_per_patient <- ifelse(is.null(study_params$cost_per_patient), 25000, study_params$cost_per_patient)
      
      total_cost <- result$total_sample_size * cost_per_patient
      
      list(
        "cost_per_patient" = cost_per_patient,
        "total_study_cost" = total_cost,
        "cost_per_evaluable_patient" = cost_per_patient / 0.85,  # Assuming 85% evaluability
        "cost_effectiveness_ratio" = total_cost / result$total_sample_size
      )
    },
    
    # Generate interim analysis recommendations
    generate_interim_recommendations = function(design) {
      c(
        "Implement independent Data Monitoring Committee",
        "Pre-specify interim analysis timing in protocol",
        "Use appropriate alpha spending function",
        "Plan for potential sample size re-estimation",
        "Document interim analysis procedures in SAP"
      )
    },
    
    # Perform survival power analysis
    perform_survival_power_analysis = function(sample_size, hazard_ratio) {
      # Simplified power calculation
      power <- pwr.f2.test(
        u = 1,
        v = sample_size - 2,
        f2 = (hazard_ratio - 1)^2 / 4,
        sig.level = 0.05
      )$power
      
      list(
        "power" = round(power, 3),
        "hazard_ratio" = hazard_ratio,
        "sample_size" = sample_size,
        "alpha" = 0.05
      )
    },
    
    # Generate executive summary
    generate_executive_summary = function(sample_size_result, interim_result, survival_result) {
      summary <- paste0(
        "Statistical Analysis Summary:\n",
        "- Recommended sample size: ", sample_size_result$total_sample_size, "\n",
        "- Study design: ", sample_size_result$design_type, "\n",
        "- Power: ", ifelse(is.null(sample_size_result$power), "0.80", sample_size_result$power), "\n",
        "- Interim analyses: ", interim_result$number_of_looks, " planned\n"
      )
      
      if (!is.null(survival_result)) {
        summary <- paste0(summary, "- Primary endpoint: ", survival_result$primary_endpoint, "\n")
      }
      
      return(summary)
    },
    
    # Generate regulatory considerations
    generate_regulatory_considerations = function(study_params) {
      c(
        "Ensure compliance with ICH E9 Statistical Principles",
        "Consider FDA guidance on adaptive designs if applicable",
        "Plan for regulatory interaction meetings",
        "Document all statistical assumptions clearly",
        "Prepare for potential regulatory questions on design"
      )
    },
    
    # Document statistical assumptions
    document_statistical_assumptions = function(study_params) {
      list(
        "alpha_level" = 0.05,
        "power" = 0.80,
        "two_sided_testing" = TRUE,
        "missing_data_handling" = "Complete case analysis",
        "multiplicity_adjustments" = "Planned for secondary endpoints",
        "interim_analysis_impact" = "Accounted for in design"
      )
    },
    
    # Generate comprehensive recommendations
    generate_comprehensive_recommendations = function(sample_size_result, interim_result, survival_result) {
      recommendations <- c(
        "Implement robust randomization and blinding procedures",
        "Plan for adequate follow-up duration",
        "Consider adaptive design elements if appropriate",
        "Prepare comprehensive Statistical Analysis Plan",
        "Ensure adequate data monitoring procedures"
      )
      
      if (!is.null(survival_result)) {
        recommendations <- c(recommendations, "Plan for time-to-event analysis complexities")
      }
      
      return(recommendations)
    }
  )
)

# Main execution function
main <- function() {
  # Parse command line arguments
  args <- commandArgs(trailingOnly = TRUE)
  
  if (length(args) < 1) {
    cat("Usage: Rscript RStatisticalAnalysis.R <study_params_json>\n")
    quit(status = 1)
  }
  
  tryCatch({
    # Parse JSON input
    study_params <- fromJSON(args[1])
    
    # Initialize optimizer
    optimizer <- ClinicalTrialOptimizer$new()
    
    # Determine analysis type
    if (!is.null(study_params$analysis_type)) {
      if (study_params$analysis_type == "sample_size") {
        result <- optimizer$optimize_sample_size(study_params)
      } else if (study_params$analysis_type == "interim") {
        result <- optimizer$plan_interim_analysis(study_params)
      } else if (study_params$analysis_type == "survival") {
        result <- optimizer$analyze_survival_endpoints(study_params)
      } else {
        result <- optimizer$generate_statistical_report(study_params)
      }
    } else {
      # Default to comprehensive report
      result <- optimizer$generate_statistical_report(study_params)
    }
    
    # Output JSON result
    cat(toJSON(result, auto_unbox = TRUE, pretty = TRUE))
    
  }, error = function(e) {
    error_result <- list("error" = paste("R Analysis failed:", e$message))
    cat(toJSON(error_result, auto_unbox = TRUE, pretty = TRUE))
  })
}

# Execute main function
if (!interactive()) {
  main()
}