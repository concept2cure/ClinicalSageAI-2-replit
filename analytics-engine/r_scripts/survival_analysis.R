
#!/usr/bin/env Rscript

# TrialSage R Analytics - Survival Analysis
# Load required libraries
suppressMessages({
  library(jsonlite)
  library(survival)
  library(dplyr)
})

# Read command line arguments
args <- commandArgs(trailingOnly = TRUE)
if (length(args) == 0) {
  stop("Usage: Rscript survival_analysis.R <data_file.json>")
}

data_file <- args[1]

# Read input data
tryCatch({
  input_data <- fromJSON(data_file)
  
  # Generate sample survival data (in production, this would come from real trial data)
  n_patients <- input_data$sample_size %||% 100
  
  # Simulate survival data
  set.seed(42)
  survival_data <- data.frame(
    time = rexp(n_patients, rate = 0.1),
    event = rbinom(n_patients, 1, 0.7),
    treatment = sample(c("Control", "Treatment"), n_patients, replace = TRUE),
    age = rnorm(n_patients, 65, 10)
  )
  
  # Fit survival model
  surv_model <- survfit(Surv(time, event) ~ treatment, data = survival_data)
  
  # Calculate summary statistics
  surv_summary <- summary(surv_model)
  
  # Median survival times
  median_survival <- data.frame(
    treatment = names(surv_model$strata),
    median_survival_time = as.numeric(surv_model$median),
    stringsAsFactors = FALSE
  )
  
  # Log-rank test
  logrank_test <- survdiff(Surv(time, event) ~ treatment, data = survival_data)
  p_value <- 1 - pchisq(logrank_test$chisq, df = 1)
  
  # Hazard ratio calculation
  cox_model <- coxph(Surv(time, event) ~ treatment, data = survival_data)
  hazard_ratio <- exp(coef(cox_model))
  hr_ci <- exp(confint(cox_model))
  
  # Create result object
  result <- list(
    analysis_type = "survival_analysis",
    median_survival_times = median_survival,
    logrank_test_pvalue = round(p_value, 4),
    hazard_ratio = round(hazard_ratio, 3),
    hazard_ratio_ci_lower = round(hr_ci[1], 3),
    hazard_ratio_ci_upper = round(hr_ci[2], 3),
    sample_size = n_patients,
    events_observed = sum(survival_data$event),
    analysis_timestamp = Sys.time()
  )
  
  # Output JSON result
  cat(toJSON(result, auto_unbox = TRUE, pretty = TRUE))
  
}, error = function(e) {
  error_result <- list(
    error = paste("R analysis failed:", e$message),
    analysis_type = "survival_analysis"
  )
  cat(toJSON(error_result, auto_unbox = TRUE))
  quit(status = 1)
})
