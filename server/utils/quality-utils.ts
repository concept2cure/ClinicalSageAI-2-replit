/**
 * Quality Management Utility Functions
 *
 * This module provides utility functions for quality management operations,
 * including validation logic, factor evaluation, and quality metric calculations.
 */
import { createScopedLogger } from './logger';

const logger = createScopedLogger('quality-utils');

/**
 * Risk Levels for CTQ Factors and Quality Rules
 */
export enum RiskLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Gate Types for Section Validation
 */
export enum GateType {
  HARD = 'hard',
  SOFT = 'soft',
  INFO = 'info',
}

/**
 * Result of a validation check
 */
export interface ValidationResult {
  passed: boolean;
  message: string;
  details?: string;
  severity: RiskLevel;
}

/**
 * Evaluate if a text content meets the requirements specified in a validation rule
 *
 * @param content The text content to validate
 * @param validationRule The rule to apply (comma-separated required terms)
 * @param riskLevel The risk level of the factor
 * @returns ValidationResult with passed status and message
 */
export function evaluateContentAgainstRule(
  content: string,
  validationRule: string,
  riskLevel: RiskLevel = RiskLevel.MEDIUM
): ValidationResult {
  try {
    // Normalize content and rules
    const contentLower = content.toLowerCase();
    const requiredTerms = validationRule
      .toLowerCase()
      .split(',')
      .map(term => term.trim());

    // Check if all required terms are present
    const missingTerms = requiredTerms.filter(term => !contentLower.includes(term));

    if (missingTerms.length > 0) {
      return {
        passed: false,
        message: `Missing required terms: ${missingTerms.join(', ')}`,
        severity: riskLevel,
      };
    }

    return {
      passed: true,
      message: 'All required terms are present',
      severity: riskLevel,
    };
  } catch (error) {
    logger.error('Error evaluating content against rule', { error, validationRule });
    return {
      passed: false,
      message: 'Error evaluating validation rule',
      details: String(error),
      severity: riskLevel,
    };
  }
}

/**
 * Calculate completion percentage based on validated factors
 *
 * @param totalFactors Total number of factors
 * @param passedFactors Number of passed factors
 * @returns Completion percentage (0-100)
 */
export function calculateCompletionPercentage(totalFactors: number, passedFactors: number): number {
  if (totalFactors === 0) return 100; // Avoid division by zero
  return Math.round((passedFactors / totalFactors) * 100);
}

/**
 * Determine if a section passes quality validation based on gate level and factor results
 *
 * @param validationResults Array of validation results
 * @param gateType Type of gate (hard, soft, info)
 * @returns Object with valid status and message
 */
export function determineSectionValidity(
  validationResults: ValidationResult[],
  gateType: GateType
): { valid: boolean; message: string } {
  // Count failures by severity
  const highRiskFailures = validationResults.filter(
    r => !r.passed && r.severity === RiskLevel.HIGH
  ).length;

  const mediumRiskFailures = validationResults.filter(
    r => !r.passed && r.severity === RiskLevel.MEDIUM
  ).length;

  const lowRiskFailures = validationResults.filter(
    r => !r.passed && r.severity === RiskLevel.LOW
  ).length;

  // Determine validity based on gate type
  switch (gateType) {
    case GateType.HARD:
      // Hard gate - any high risk failures block
      if (highRiskFailures > 0) {
        return {
          valid: false,
          message: 'Section contains critical quality issues',
        };
      }
      break;

    case GateType.SOFT:
      // Soft gate - high risk failures block, medium risk warn
      if (highRiskFailures > 0) {
        return {
          valid: false,
          message: 'Section contains critical quality issues',
        };
      }
      break;

    case GateType.INFO:
      // Info gate - nothing blocks, just provide information
      break;
  }

  // If we reach here, the section is valid but may have warnings
  if (mediumRiskFailures > 0) {
    return {
      valid: true,
      message: 'Section contains quality warnings',
    };
  }

  if (lowRiskFailures > 0) {
    return {
      valid: true,
      message: 'Section contains minor quality issues',
    };
  }

  return {
    valid: true,
    message: 'Section meets quality requirements',
  };
}

/**
 * Calculate quality score based on validation results
 *
 * @param validationResults Array of validation results across all sections
 * @returns Quality score from 0-100
 */
export function calculateQualityScore(validationResults: ValidationResult[]): number {
  if (validationResults.length === 0) return 100;

  // Assign weights to different risk levels
  const weights = {
    [RiskLevel.HIGH]: 5,
    [RiskLevel.MEDIUM]: 3,
    [RiskLevel.LOW]: 1,
  };

  // Calculate total possible score
  const totalPossibleScore = validationResults.reduce((sum, result) => {
    return sum + weights[result.severity];
  }, 0);

  // Calculate actual score based on passed validations
  const actualScore = validationResults.reduce((sum, result) => {
    return sum + (result.passed ? weights[result.severity] : 0);
  }, 0);

  // Calculate percentage
  const scorePercentage = (actualScore / totalPossibleScore) * 100;
  return Math.round(scorePercentage);
}

/**
 * Generate a quality report summary based on section validations
 *
 * @param sectionResults Array of section validation results
 * @returns Summary object with quality metrics
 */
export function generateQualityReportSummary(sectionResults: any[]): any {
  // Extract all validation results
  const allValidations = sectionResults.flatMap(section => section.validations || []);

  // Count sections by status
  const sectionsPassing = sectionResults.filter(s => s.valid).length;
  const sectionsWithWarnings = sectionResults.filter(
    s => s.valid && s.validations.some((v: { passed?: boolean }) => !v.passed)
  ).length;
  const sectionsWithCriticalIssues = sectionResults.filter(s => !s.valid).length;

  // Calculate overall quality score
  const qualityScore = calculateQualityScore(allValidations);

  // Determine overall compliance status
  let complianceStatus = 'compliant';
  if (sectionsWithCriticalIssues > 0) {
    complianceStatus = 'non-compliant';
  } else if (sectionsWithWarnings > 0) {
    complianceStatus = 'compliant-with-warnings';
  }

  return {
    qualityScore,
    totalSections: sectionResults.length,
    sectionsPassing,
    sectionsWithWarnings,
    sectionsWithCriticalIssues,
    complianceStatus,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parse validation rules from various rule formats
 *
 * @param rule The validation rule to parse
 * @returns Normalized validation rule object
 */
export function parseValidationRule(rule: string | object): any {
  // If rule is a string, assume it's a simple comma-separated list of required terms
  if (typeof rule === 'string') {
    return {
      type: 'terms',
      terms: rule.split(',').map(term => term.trim()),
      operator: 'all',
    };
  }

  // If rule is already an object, return as is
  if (typeof rule === 'object') {
    return rule;
  }

  // Default empty rule
  return {
    type: 'terms',
    terms: [],
    operator: 'all',
  };
}

/**
 * Apply a validation function to a content string based on validation type
 *
 * @param content The content to validate
 * @param validationRule The rule to apply
 * @param riskLevel The risk level of the factor
 * @returns Validation result
 */
export function applyValidation(
  content: string,
  validationRule: string | object,
  riskLevel: RiskLevel = RiskLevel.MEDIUM
): ValidationResult {
  try {
    const parsedRule = parseValidationRule(validationRule);

    // Handle different validation types
    switch (parsedRule.type) {
      case 'terms':
        // Simple term presence validation
        return evaluateContentAgainstRule(content, parsedRule.terms.join(','), riskLevel);

      case 'regex':
        // Regular expression validation
        if (!parsedRule.pattern) {
          return {
            passed: false,
            message: 'Invalid regex pattern',
            severity: riskLevel,
          };
        }

        const regex = new RegExp(parsedRule.pattern, 'i');
        const regexPassed = regex.test(content);
        return {
          passed: regexPassed,
          message: regexPassed
            ? 'Content matches pattern'
            : 'Content does not match required pattern',
          severity: riskLevel,
        };

      case 'length':
        // Content length validation
        const contentLength = content.length;
        const minLength = parsedRule.minLength || 0;
        const maxLength = parsedRule.maxLength || Infinity;

        const lengthPassed = contentLength >= minLength && contentLength <= maxLength;
        return {
          passed: lengthPassed,
          message: lengthPassed
            ? 'Content length is within acceptable range'
            : `Content length (${contentLength}) is outside acceptable range (${minLength}-${maxLength})`,
          severity: riskLevel,
        };

      default:
        // Default to simple term validation
        return evaluateContentAgainstRule(
          content,
          typeof validationRule === 'string' ? validationRule : '',
          riskLevel
        );
    }
  } catch (error) {
    logger.error('Error applying validation', { error, validationRule });
    return {
      passed: false,
      message: 'Error applying validation',
      details: String(error),
      severity: riskLevel,
    };
  }
}

/**
 * Calculate statistics on quality validation results
 *
 * @param validationResults Array of validation results
 * @returns Statistics object with counts and percentages
 */
export function calculateValidationStatistics(validationResults: ValidationResult[]): any {
  const total = validationResults.length;

  // Count validations by risk level and pass status
  const countsByRisk = {
    [RiskLevel.HIGH]: {
      passed: 0,
      failed: 0,
      total: 0,
    },
    [RiskLevel.MEDIUM]: {
      passed: 0,
      failed: 0,
      total: 0,
    },
    [RiskLevel.LOW]: {
      passed: 0,
      failed: 0,
      total: 0,
    },
  };

  validationResults.forEach(result => {
    const status = result.passed ? 'passed' : 'failed';
    countsByRisk[result.severity][status]++;
    countsByRisk[result.severity].total++;
  });

  // Calculate percentages
  const passRate =
    total === 0 ? 100 : Math.round((validationResults.filter(r => r.passed).length / total) * 100);

  const byRiskLevel = Object.entries(countsByRisk).map(([level, counts]) => ({
    riskLevel: level,
    passed: counts.passed,
    failed: counts.failed,
    total: counts.total,
    passRate: counts.total === 0 ? 100 : Math.round((counts.passed / counts.total) * 100),
  }));

  return {
    total,
    passed: validationResults.filter(r => r.passed).length,
    failed: validationResults.filter(r => !r.passed).length,
    passRate,
    byRiskLevel,
  };
}

export default {
  evaluateContentAgainstRule,
  calculateCompletionPercentage,
  determineSectionValidity,
  calculateQualityScore,
  generateQualityReportSummary,
  parseValidationRule,
  applyValidation,
  calculateValidationStatistics,
  RiskLevel,
  GateType,
};
