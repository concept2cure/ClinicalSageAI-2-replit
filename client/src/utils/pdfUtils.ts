/**
 * PDF Utility Functions
 *
 * This module provides functions to work with PDF files in the TrialSage application.
 */

/**
 * Get protocol text from the obesity study PDF for display in the application
 * In a real application, this would use a PDF parser library to extract the actual text.
 *
 * @returns {string} The extracted protocol text
 */
export function getObesityProtocolText(): string {
  // In a production environment, we would extract this from the PDF
  // For now, we're returning a representative summary
  return `
Obesity POC Study Protocol (Australia) v1.1c 07MAR25

LMN-0801: A Dose-Ranging Study Evaluating the Safety and Efficacy of LMN-0801 for Weight Loss in Adults with BMI ≥30 kg/m² or ≥27 kg/m² with Weight-Related Comorbidity

PROTOCOL SUMMARY:
This study is a 12-week, randomized, double-blind, placebo-controlled, parallel-group, dose-ranging study to evaluate the safety and efficacy of LMN-0801, a novel leptin analog, for weight management in adults with obesity. The study will enroll approximately 90 participants (randomized 4:4:4:1 to 3 active dose groups and placebo).

PRIMARY OBJECTIVES:
1. To evaluate the safety and tolerability of multiple doses of LMN-0801 in adults with obesity
2. To assess the effect of LMN-0801 on body weight reduction compared to placebo

SECONDARY OBJECTIVES:
1. To determine the dose-response relationship for LMN-0801
2. To evaluate changes in waist circumference and body composition
3. To assess changes in metabolic parameters (lipids, glucose, insulin)
4. To evaluate patient-reported outcomes related to hunger, satiety, and food cravings

STUDY DESIGN:
- Population: Adults aged 18-75 years with BMI ≥30 kg/m² or ≥27 kg/m² with at least one weight-related comorbidity
- Study duration: 12 weeks treatment + 4 weeks follow-up
- Sample size: 90 participants
- Treatment arms:
  * LMN-0801 low dose (5 mg daily)
  * LMN-0801 medium dose (10 mg daily)
  * LMN-0801 high dose (20 mg daily)
  * Placebo

PRIMARY ENDPOINTS:
1. Safety assessments (adverse events, labs, vitals, ECGs)
2. Percent change in body weight at Week 12 compared to baseline

SECONDARY ENDPOINTS:
1. Proportion of participants losing ≥5% of baseline body weight at Week 12
2. Change in waist circumference at Week 12
3. Changes in fasting glucose, insulin, and lipid parameters at Week 12
4. Changes in patient-reported hunger, satiety, and food cravings

STATISTICAL CONSIDERATIONS:
- Primary efficacy analysis: ANCOVA model with treatment as a factor and baseline weight as a covariate
- Sample size determination: 72 subjects (24 per active arm) provides 80% power to detect a 3% difference in weight loss between active and placebo at alpha=0.05
- Missing data will be handled using last observation carried forward (LOCF)

INCLUSION CRITERIA:
- Adults aged 18-75 years
- BMI ≥30 kg/m² or ≥27 kg/m² with at least one weight-related comorbidity
- Weight stable (±5%) for ≥3 months prior to screening
- Willing to follow a mildly hypocaloric diet and maintain physical activity levels

EXCLUSION CRITERIA:
- Prior bariatric surgery
- Use of weight loss medications within 3 months
- History of eating disorders
- Uncontrolled hypertension (>160/100 mmHg)
- History of cardiovascular disease
- Type 1 diabetes or uncontrolled Type 2 diabetes (HbA1c >9.0%)
- Significant renal or hepatic impairment

This protocol is part of Concept2Cure's development program for LMN-0801, a novel leptin analog being developed for weight management in adults with obesity.
  `;
}
