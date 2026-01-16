/**
 * ValidationService - Validate CSR data quality and completeness
 * 
 * Checks for required ICH E3 sections and data quality metrics
 */

export interface ValidationResult {
  isValid: boolean;
  score: number;
  completeness: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  missingSections: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export class ValidationService {
  // ICH E3 required sections
  private readonly REQUIRED_SECTIONS = [
    'regulatory',
    'protocol',
    'population',
    'safety',
    'efficacy'
  ];

  /**
   * Validate extracted CSR data
   * 
   * @param data - Extracted deep data object
   * @returns Validation result with scores and issues
   */
  validate(data: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const missingSections: string[] = [];

    // Check for required sections
    for (const section of this.REQUIRED_SECTIONS) {
      if (!data[section] || Object.keys(data[section] || {}).length === 0) {
        missingSections.push(section);
        errors.push({
          field: section,
          message: `Required section '${section}' is missing or empty`,
          severity: 'error'
        });
      }
    }

    // Calculate completeness score
    const presentSections = this.REQUIRED_SECTIONS.filter(
      section => data[section] && Object.keys(data[section]).length > 0
    );
    const completeness = presentSections.length / this.REQUIRED_SECTIONS.length;

    // Validate regulatory section specifics
    if (data.regulatory) {
      if (!data.regulatory.submission_id) {
        errors.push({
          field: 'regulatory.submission_id',
          message: 'Submission ID is required',
          severity: 'error'
        });
      }
      if (!data.regulatory.regulatory_agency) {
        warnings.push({
          field: 'regulatory.regulatory_agency',
          message: 'Regulatory agency not specified'
        });
      }
    }

    // Validate protocol section
    if (data.protocol) {
      if (!data.protocol.study_id) {
        errors.push({
          field: 'protocol.study_id',
          message: 'Study ID is required',
          severity: 'error'
        });
      }
      if (!data.protocol.study_title) {
        warnings.push({
          field: 'protocol.study_title',
          message: 'Study title not found'
        });
      }
    }

    // Validate population data
    if (data.population) {
      if (!data.population.randomized_n && !data.population.enrolled_n) {
        warnings.push({
          field: 'population',
          message: 'No enrollment or randomization numbers found'
        });
      }
    }

    // Calculate overall quality score
    let score = completeness * 0.7; // 70% weight on completeness

    // Add bonus for data richness
    if (data.safety?.adverse_events?.length > 0) {
      score += 0.1;
    }
    if (data.efficacy?.primary_endpoints?.length > 0) {
      score += 0.1;
    }
    if (data.pharmacokinetics && Object.keys(data.pharmacokinetics).length > 0) {
      score += 0.1;
    }

    score = Math.min(score, 1.0);

    const isValid = errors.filter(e => e.severity === 'error').length === 0 && completeness >= 0.6;

    return {
      isValid,
      score,
      completeness,
      errors,
      warnings,
      missingSections
    };
  }

  /**
   * Validate URL format
   */
  validateURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate submission ID format
   */
  validateSubmissionId(submissionId: string): boolean {
    return /^[A-Z0-9\-_]{3,100}$/i.test(submissionId);
  }
}
