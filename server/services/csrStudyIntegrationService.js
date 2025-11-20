/**
 * CSR/Study Design Integration Service - Sprint 3
 * Multi-Agency Validation: Enhanced CSR and Study Design Validation
 *
 * Validates content against structured data from related study components,
 * cross-references CSR claims with study design data, and provides
 * sophisticated validation for clinical study reports.
 */

import { db } from '../db/index.js';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class CSRStudyIntegrationService {
  constructor() {
    this.studyDataTypes = {
      ADVERSE_EVENTS: 'adverse_events',
      EFFICACY_OUTCOMES: 'efficacy_outcomes',
      DEMOGRAPHICS: 'demographics',
      DISPOSITION: 'disposition',
      CONCOMITANT_MEDS: 'concomitant_medications',
      PROTOCOL_DEVIATIONS: 'protocol_deviations',
      LABORATORY_DATA: 'laboratory_data',
      VITAL_SIGNS: 'vital_signs',
    };

    this.validationRules = {
      ADVERSE_EVENTS: {
        requiredFields: ['event_term', 'frequency', 'severity', 'causality'],
        tolerances: {
          frequency: 0.05, // 5% tolerance
          percentage: 0.02, // 2% tolerance
        },
      },
      EFFICACY_OUTCOMES: {
        requiredFields: ['endpoint', 'result', 'pvalue', 'confidence_interval'],
        tolerances: {
          result: 0.1, // 10% tolerance
          pvalue: 0.001, // 0.1% tolerance
        },
      },
      DEMOGRAPHICS: {
        requiredFields: ['age_mean', 'age_sd', 'gender_distribution', 'race_distribution'],
        tolerances: {
          age: 0.5, // 0.5 year tolerance
          percentage: 0.05, // 5% tolerance
        },
      },
    };

    this.csrSections = {
      STUDY_SUMMARY: 'study_summary',
      STUDY_OBJECTIVES: 'study_objectives',
      STUDY_DESIGN: 'study_design',
      STUDY_POPULATION: 'study_population',
      EFFICACY_RESULTS: 'efficacy_results',
      SAFETY_RESULTS: 'safety_results',
      DISCUSSION: 'discussion',
      CONCLUSIONS: 'conclusions',
    };
  }

  /**
   * Validate CSR content against structured study data
   */
  async validateCSRContent(csrDocument, tenantId) {
    try {
      console.log(`Starting CSR validation for document: ${csrDocument.id}`);

      const validationResults = {
        documentId: csrDocument.id,
        studyId: this.extractStudyId(csrDocument),
        validationTimestamp: new Date(),
        validationSteps: [],
      };

      // Step 1: Retrieve structured study data
      const studyData = await this.retrieveStudyData(validationResults.studyId, tenantId);
      validationResults.studyData = studyData;

      // Step 2: Extract claims from CSR content
      const csrClaims = await this.extractCSRClaims(csrDocument.content);
      validationResults.extractedClaims = csrClaims;

      // Step 3: Validate adverse events
      const aeValidation = await this.validateAdverseEvents(csrClaims, studyData, tenantId);
      validationResults.validationSteps.push({
        step: 'adverse_events_validation',
        issues: aeValidation.issues,
        summary: aeValidation.summary,
      });

      // Step 4: Validate efficacy outcomes
      const efficacyValidation = await this.validateEfficacyOutcomes(
        csrClaims,
        studyData,
        tenantId
      );
      validationResults.validationSteps.push({
        step: 'efficacy_validation',
        issues: efficacyValidation.issues,
        summary: efficacyValidation.summary,
      });

      // Step 5: Validate demographics
      const demographicsValidation = await this.validateDemographics(
        csrClaims,
        studyData,
        tenantId
      );
      validationResults.validationSteps.push({
        step: 'demographics_validation',
        issues: demographicsValidation.issues,
        summary: demographicsValidation.summary,
      });

      // Step 6: Cross-reference protocol compliance
      const protocolValidation = await this.validateProtocolCompliance(
        csrClaims,
        studyData,
        tenantId
      );
      validationResults.validationSteps.push({
        step: 'protocol_compliance_validation',
        issues: protocolValidation.issues,
        summary: protocolValidation.summary,
      });

      // Step 7: Validate statistical analysis consistency
      const statisticalValidation = await this.validateStatisticalAnalysis(
        csrClaims,
        studyData,
        tenantId
      );
      validationResults.validationSteps.push({
        step: 'statistical_validation',
        issues: statisticalValidation.issues,
        summary: statisticalValidation.summary,
      });

      // Compile final validation summary
      const allIssues = validationResults.validationSteps.reduce(
        (acc, step) => acc.concat(step.issues),
        []
      );
      validationResults.summary = {
        totalIssues: allIssues.length,
        criticalIssues: allIssues.filter(issue => issue.severity === 'Critical').length,
        majorIssues: allIssues.filter(issue => issue.severity === 'Major').length,
        minorIssues: allIssues.filter(issue => issue.severity === 'Minor').length,
        validationSteps: validationResults.validationSteps.length,
      };

      console.log(
        `CSR validation completed. Found ${allIssues.length} issues across ${validationResults.validationSteps.length} validation steps`
      );
      return validationResults;
    } catch (error) {
      console.error('CSR validation error:', error);
      throw error;
    }
  }

  /**
   * Validate adverse events against structured data
   */
  async validateAdverseEvents(csrClaims, studyData, tenantId) {
    const issues = [];
    const aeData = studyData.adverse_events || [];

    try {
      // Extract adverse event claims from CSR
      const aeClaims = csrClaims.adverse_events || [];

      for (const claim of aeClaims) {
        // Find corresponding structured data
        const structuredAE = aeData.find(
          ae => ae.event_term.toLowerCase() === claim.event_term.toLowerCase()
        );

        if (!structuredAE) {
          issues.push({
            type: 'ADVERSE_EVENT_MISSING',
            severity: 'Major',
            claim: claim.event_term,
            violation: `Adverse event "${claim.event_term}" mentioned in CSR but not found in structured data`,
            recommendedAction:
              'Verify adverse event data completeness and update structured dataset',
            section: 'Safety Results',
            dataSource: 'CSR vs Structured AE Data',
          });
          continue;
        }

        // Validate frequency consistency
        if (claim.frequency && structuredAE.frequency) {
          const frequencyDiff = Math.abs(claim.frequency - structuredAE.frequency);
          const tolerance = this.validationRules.ADVERSE_EVENTS.tolerances.frequency;

          if (frequencyDiff > tolerance) {
            issues.push({
              type: 'FREQUENCY_INCONSISTENCY',
              severity: 'Critical',
              claim: claim.event_term,
              violation: `Frequency mismatch for ${claim.event_term}: CSR=${claim.frequency}, Data=${structuredAE.frequency}`,
              recommendedAction: 'Reconcile frequency data between CSR and structured dataset',
              section: 'Safety Results',
              dataSource: 'CSR vs Structured AE Data',
              tolerance: tolerance,
              actualDifference: frequencyDiff,
            });
          }
        }

        // Validate percentage consistency
        if (claim.percentage && structuredAE.percentage) {
          const percentageDiff = Math.abs(claim.percentage - structuredAE.percentage);
          const tolerance = this.validationRules.ADVERSE_EVENTS.tolerances.percentage;

          if (percentageDiff > tolerance) {
            issues.push({
              type: 'PERCENTAGE_INCONSISTENCY',
              severity: 'Critical',
              claim: claim.event_term,
              violation: `Percentage mismatch for ${claim.event_term}: CSR=${claim.percentage}%, Data=${structuredAE.percentage}%`,
              recommendedAction: 'Reconcile percentage data between CSR and structured dataset',
              section: 'Safety Results',
              dataSource: 'CSR vs Structured AE Data',
              tolerance: tolerance,
              actualDifference: percentageDiff,
            });
          }
        }

        // Validate severity consistency
        if (claim.severity && structuredAE.severity) {
          if (claim.severity !== structuredAE.severity) {
            issues.push({
              type: 'SEVERITY_INCONSISTENCY',
              severity: 'Major',
              claim: claim.event_term,
              violation: `Severity mismatch for ${claim.event_term}: CSR="${claim.severity}", Data="${structuredAE.severity}"`,
              recommendedAction:
                'Reconcile severity classification between CSR and structured dataset',
              section: 'Safety Results',
              dataSource: 'CSR vs Structured AE Data',
            });
          }
        }
      }

      // Check for missing events in CSR
      for (const structuredAE of aeData) {
        if (structuredAE.frequency > 0.1) {
          // Only check for events > 10%
          const mentionedInCSR = aeClaims.some(
            claim => claim.event_term.toLowerCase() === structuredAE.event_term.toLowerCase()
          );

          if (!mentionedInCSR) {
            issues.push({
              type: 'ADVERSE_EVENT_OMISSION',
              severity: 'Major',
              claim: structuredAE.event_term,
              violation: `Significant adverse event "${structuredAE.event_term}" (${structuredAE.frequency}%) not mentioned in CSR`,
              recommendedAction: 'Include significant adverse events in CSR safety section',
              section: 'Safety Results',
              dataSource: 'Structured AE Data vs CSR',
            });
          }
        }
      }

      return {
        issues,
        summary: {
          totalAEClaims: aeClaims.length,
          structuredAERecords: aeData.length,
          inconsistencies: issues.length,
          validationCompleted: true,
        },
      };
    } catch (error) {
      console.error('Adverse events validation error:', error);
      return {
        issues: [
          {
            type: 'VALIDATION_ERROR',
            severity: 'Major',
            violation: 'Unable to complete adverse events validation',
            error: error.message,
          },
        ],
        summary: { validationCompleted: false },
      };
    }
  }

  /**
   * Validate efficacy outcomes against structured data
   */
  async validateEfficacyOutcomes(csrClaims, studyData, tenantId) {
    const issues = [];
    const efficacyData = studyData.efficacy_outcomes || [];

    try {
      const efficacyClaims = csrClaims.efficacy_outcomes || [];

      for (const claim of efficacyClaims) {
        const structuredOutcome = efficacyData.find(
          outcome => outcome.endpoint.toLowerCase() === claim.endpoint.toLowerCase()
        );

        if (!structuredOutcome) {
          issues.push({
            type: 'EFFICACY_ENDPOINT_MISSING',
            severity: 'Critical',
            claim: claim.endpoint,
            violation: `Efficacy endpoint "${claim.endpoint}" mentioned in CSR but not found in structured data`,
            recommendedAction: 'Verify efficacy endpoint data completeness',
            section: 'Efficacy Results',
            dataSource: 'CSR vs Structured Efficacy Data',
          });
          continue;
        }

        // Validate result consistency
        if (claim.result && structuredOutcome.result) {
          const resultDiff = Math.abs(claim.result - structuredOutcome.result);
          const tolerance = this.validationRules.EFFICACY_OUTCOMES.tolerances.result;

          if (resultDiff > tolerance) {
            issues.push({
              type: 'EFFICACY_RESULT_INCONSISTENCY',
              severity: 'Critical',
              claim: claim.endpoint,
              violation: `Result mismatch for ${claim.endpoint}: CSR=${claim.result}, Data=${structuredOutcome.result}`,
              recommendedAction: 'Reconcile efficacy results between CSR and structured dataset',
              section: 'Efficacy Results',
              dataSource: 'CSR vs Structured Efficacy Data',
              tolerance: tolerance,
              actualDifference: resultDiff,
            });
          }
        }

        // Validate p-value consistency
        if (claim.pvalue && structuredOutcome.pvalue) {
          const pvalueDiff = Math.abs(claim.pvalue - structuredOutcome.pvalue);
          const tolerance = this.validationRules.EFFICACY_OUTCOMES.tolerances.pvalue;

          if (pvalueDiff > tolerance) {
            issues.push({
              type: 'PVALUE_INCONSISTENCY',
              severity: 'Critical',
              claim: claim.endpoint,
              violation: `P-value mismatch for ${claim.endpoint}: CSR=${claim.pvalue}, Data=${structuredOutcome.pvalue}`,
              recommendedAction:
                'Reconcile p-value calculations between CSR and structured dataset',
              section: 'Efficacy Results',
              dataSource: 'CSR vs Structured Efficacy Data',
              tolerance: tolerance,
              actualDifference: pvalueDiff,
            });
          }
        }

        // Validate confidence interval consistency
        if (claim.confidence_interval && structuredOutcome.confidence_interval) {
          const ciMatch = this.validateConfidenceInterval(
            claim.confidence_interval,
            structuredOutcome.confidence_interval
          );
          if (!ciMatch.valid) {
            issues.push({
              type: 'CONFIDENCE_INTERVAL_INCONSISTENCY',
              severity: 'Major',
              claim: claim.endpoint,
              violation: `Confidence interval mismatch for ${claim.endpoint}: ${ciMatch.details}`,
              recommendedAction: 'Reconcile confidence interval calculations',
              section: 'Efficacy Results',
              dataSource: 'CSR vs Structured Efficacy Data',
            });
          }
        }
      }

      return {
        issues,
        summary: {
          totalEfficacyClaims: efficacyClaims.length,
          structuredEfficacyRecords: efficacyData.length,
          inconsistencies: issues.length,
          validationCompleted: true,
        },
      };
    } catch (error) {
      console.error('Efficacy outcomes validation error:', error);
      return {
        issues: [
          {
            type: 'VALIDATION_ERROR',
            severity: 'Major',
            violation: 'Unable to complete efficacy outcomes validation',
            error: error.message,
          },
        ],
        summary: { validationCompleted: false },
      };
    }
  }

  /**
   * Validate demographics against structured data
   */
  async validateDemographics(csrClaims, studyData, tenantId) {
    const issues = [];
    const demographicsData = studyData.demographics || {};

    try {
      const demographicsClaims = csrClaims.demographics || {};

      // Validate age statistics
      if (demographicsClaims.age_mean && demographicsData.age_mean) {
        const ageDiff = Math.abs(demographicsClaims.age_mean - demographicsData.age_mean);
        const tolerance = this.validationRules.DEMOGRAPHICS.tolerances.age;

        if (ageDiff > tolerance) {
          issues.push({
            type: 'AGE_MEAN_INCONSISTENCY',
            severity: 'Major',
            violation: `Mean age mismatch: CSR=${demographicsClaims.age_mean}, Data=${demographicsData.age_mean}`,
            recommendedAction: 'Reconcile age statistics between CSR and structured data',
            section: 'Study Population',
            dataSource: 'CSR vs Structured Demographics Data',
            tolerance: tolerance,
            actualDifference: ageDiff,
          });
        }
      }

      // Validate gender distribution
      if (demographicsClaims.gender_distribution && demographicsData.gender_distribution) {
        const genderValidation = this.validateGenderDistribution(
          demographicsClaims.gender_distribution,
          demographicsData.gender_distribution
        );

        if (!genderValidation.valid) {
          issues.push({
            type: 'GENDER_DISTRIBUTION_INCONSISTENCY',
            severity: 'Major',
            violation: `Gender distribution mismatch: ${genderValidation.details}`,
            recommendedAction: 'Reconcile gender distribution between CSR and structured data',
            section: 'Study Population',
            dataSource: 'CSR vs Structured Demographics Data',
          });
        }
      }

      // Validate race distribution
      if (demographicsClaims.race_distribution && demographicsData.race_distribution) {
        const raceValidation = this.validateRaceDistribution(
          demographicsClaims.race_distribution,
          demographicsData.race_distribution
        );

        if (!raceValidation.valid) {
          issues.push({
            type: 'RACE_DISTRIBUTION_INCONSISTENCY',
            severity: 'Major',
            violation: `Race distribution mismatch: ${raceValidation.details}`,
            recommendedAction: 'Reconcile race distribution between CSR and structured data',
            section: 'Study Population',
            dataSource: 'CSR vs Structured Demographics Data',
          });
        }
      }

      return {
        issues,
        summary: {
          demographicsValidated: true,
          inconsistencies: issues.length,
          validationCompleted: true,
        },
      };
    } catch (error) {
      console.error('Demographics validation error:', error);
      return {
        issues: [
          {
            type: 'VALIDATION_ERROR',
            severity: 'Major',
            violation: 'Unable to complete demographics validation',
            error: error.message,
          },
        ],
        summary: { validationCompleted: false },
      };
    }
  }

  /**
   * Validate protocol compliance
   */
  async validateProtocolCompliance(csrClaims, studyData, tenantId) {
    const issues = [];
    const protocolData = studyData.protocol_compliance || {};

    try {
      // Validate protocol deviations
      if (csrClaims.protocol_deviations && protocolData.deviations) {
        const deviationValidation = this.validateProtocolDeviations(
          csrClaims.protocol_deviations,
          protocolData.deviations
        );

        issues.push(...deviationValidation.issues);
      }

      // Validate enrollment vs planned
      if (csrClaims.enrollment && protocolData.planned_enrollment) {
        const enrollmentDiff = Math.abs(csrClaims.enrollment - protocolData.actual_enrollment);
        const plannedEnrollment = protocolData.planned_enrollment;

        if (enrollmentDiff > plannedEnrollment * 0.1) {
          // 10% tolerance
          issues.push({
            type: 'ENROLLMENT_DEVIATION',
            severity: 'Major',
            violation: `Significant enrollment deviation: Planned=${plannedEnrollment}, Actual=${protocolData.actual_enrollment}`,
            recommendedAction: 'Explain enrollment deviation in CSR discussion section',
            section: 'Study Population',
            dataSource: 'Protocol vs Actual Enrollment',
          });
        }
      }

      return {
        issues,
        summary: {
          protocolComplianceValidated: true,
          inconsistencies: issues.length,
          validationCompleted: true,
        },
      };
    } catch (error) {
      console.error('Protocol compliance validation error:', error);
      return {
        issues: [
          {
            type: 'VALIDATION_ERROR',
            severity: 'Major',
            violation: 'Unable to complete protocol compliance validation',
            error: error.message,
          },
        ],
        summary: { validationCompleted: false },
      };
    }
  }

  /**
   * Validate statistical analysis consistency
   */
  async validateStatisticalAnalysis(csrClaims, studyData, tenantId) {
    const issues = [];
    const statisticalData = studyData.statistical_analysis || {};

    try {
      // Validate sample size calculations
      if (csrClaims.sample_size && statisticalData.planned_sample_size) {
        const sampleSizeDiff = Math.abs(
          csrClaims.sample_size - statisticalData.planned_sample_size
        );

        if (sampleSizeDiff > 0) {
          issues.push({
            type: 'SAMPLE_SIZE_INCONSISTENCY',
            severity: 'Major',
            violation: `Sample size mismatch: CSR=${csrClaims.sample_size}, Planned=${statisticalData.planned_sample_size}`,
            recommendedAction: 'Explain sample size differences in CSR methods section',
            section: 'Statistical Methods',
            dataSource: 'CSR vs Statistical Analysis Plan',
          });
        }
      }

      // Validate statistical methods
      if (csrClaims.statistical_methods && statisticalData.methods) {
        const methodsValidation = this.validateStatisticalMethods(
          csrClaims.statistical_methods,
          statisticalData.methods
        );

        if (!methodsValidation.valid) {
          issues.push({
            type: 'STATISTICAL_METHODS_INCONSISTENCY',
            severity: 'Major',
            violation: `Statistical methods inconsistency: ${methodsValidation.details}`,
            recommendedAction:
              'Ensure statistical methods in CSR match the Statistical Analysis Plan',
            section: 'Statistical Methods',
            dataSource: 'CSR vs Statistical Analysis Plan',
          });
        }
      }

      return {
        issues,
        summary: {
          statisticalAnalysisValidated: true,
          inconsistencies: issues.length,
          validationCompleted: true,
        },
      };
    } catch (error) {
      console.error('Statistical analysis validation error:', error);
      return {
        issues: [
          {
            type: 'VALIDATION_ERROR',
            severity: 'Major',
            violation: 'Unable to complete statistical analysis validation',
            error: error.message,
          },
        ],
        summary: { validationCompleted: false },
      };
    }
  }

  /**
   * Helper methods for data extraction and validation
   */
  extractStudyId(csrDocument) {
    // Extract study ID from document metadata or content
    const studyIdPatterns = [
      /Study\s+ID:\s*([A-Z0-9-]+)/i,
      /Protocol\s+Number:\s*([A-Z0-9-]+)/i,
      /Study\s+Number:\s*([A-Z0-9-]+)/i,
    ];

    for (const pattern of studyIdPatterns) {
      const match = csrDocument.content.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return csrDocument.metadata?.study_id || 'UNKNOWN_STUDY';
  }

  async retrieveStudyData(studyId, tenantId) {
    try {
      // Simulate structured study data retrieval
      // In production, this would query actual study databases
      const studyData = {
        study_id: studyId,
        adverse_events: [
          {
            event_term: 'Headache',
            frequency: 0.25,
            percentage: 25.0,
            severity: 'Mild',
            causality: 'Possible',
          },
          {
            event_term: 'Nausea',
            frequency: 0.15,
            percentage: 15.0,
            severity: 'Mild',
            causality: 'Probable',
          },
        ],
        efficacy_outcomes: [
          {
            endpoint: 'Primary Efficacy Endpoint',
            result: 12.5,
            pvalue: 0.032,
            confidence_interval: '8.2-16.8',
          },
        ],
        demographics: {
          age_mean: 52.3,
          age_sd: 12.1,
          gender_distribution: { male: 45.2, female: 54.8 },
          race_distribution: { white: 78.5, black: 12.3, asian: 7.2, other: 2.0 },
        },
        protocol_compliance: {
          planned_enrollment: 200,
          actual_enrollment: 195,
          deviations: [
            { type: 'Inclusion criteria', count: 3 },
            { type: 'Dosing schedule', count: 7 },
          ],
        },
        statistical_analysis: {
          planned_sample_size: 200,
          methods: ['ANOVA', 'Chi-square test', 'Logistic regression'],
        },
      };

      return studyData;
    } catch (error) {
      console.error('Error retrieving study data:', error);
      return {};
    }
  }

  async extractCSRClaims(csrContent) {
    try {
      const prompt = `Extract structured claims from this Clinical Study Report content. Return a JSON object with:
      {
        "adverse_events": [{"event_term": "string", "frequency": number, "percentage": number, "severity": "string"}],
        "efficacy_outcomes": [{"endpoint": "string", "result": number, "pvalue": number, "confidence_interval": "string"}],
        "demographics": {"age_mean": number, "gender_distribution": {"male": number, "female": number}, "race_distribution": {}},
        "protocol_deviations": [{"type": "string", "count": number}],
        "enrollment": number,
        "sample_size": number,
        "statistical_methods": ["string"]
      }
      
      Content: ${csrContent.substring(0, 4000)}...`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('CSR claims extraction error:', error);
      return {};
    }
  }

  validateConfidenceInterval(csrCI, structuredCI) {
    try {
      // Simple confidence interval validation
      const csrValues = csrCI.split('-').map(v => parseFloat(v.trim()));
      const structuredValues = structuredCI.split('-').map(v => parseFloat(v.trim()));

      if (csrValues.length !== 2 || structuredValues.length !== 2) {
        return { valid: false, details: 'Invalid confidence interval format' };
      }

      const lowerDiff = Math.abs(csrValues[0] - structuredValues[0]);
      const upperDiff = Math.abs(csrValues[1] - structuredValues[1]);

      if (lowerDiff > 1.0 || upperDiff > 1.0) {
        return {
          valid: false,
          details: `CSR: ${csrCI}, Data: ${structuredCI}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, details: 'Confidence interval validation error' };
    }
  }

  validateGenderDistribution(csrDistribution, structuredDistribution) {
    try {
      const tolerance = this.validationRules.DEMOGRAPHICS.tolerances.percentage;

      for (const gender of ['male', 'female']) {
        const csrValue = csrDistribution[gender] || 0;
        const structuredValue = structuredDistribution[gender] || 0;
        const diff = Math.abs(csrValue - structuredValue);

        if (diff > tolerance) {
          return {
            valid: false,
            details: `${gender}: CSR=${csrValue}%, Data=${structuredValue}%`,
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, details: 'Gender distribution validation error' };
    }
  }

  validateRaceDistribution(csrDistribution, structuredDistribution) {
    try {
      const tolerance = this.validationRules.DEMOGRAPHICS.tolerances.percentage;

      for (const race in structuredDistribution) {
        const csrValue = csrDistribution[race] || 0;
        const structuredValue = structuredDistribution[race] || 0;
        const diff = Math.abs(csrValue - structuredValue);

        if (diff > tolerance) {
          return {
            valid: false,
            details: `${race}: CSR=${csrValue}%, Data=${structuredValue}%`,
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, details: 'Race distribution validation error' };
    }
  }

  validateProtocolDeviations(csrDeviations, structuredDeviations) {
    const issues = [];

    for (const csrDeviation of csrDeviations) {
      const structuredDeviation = structuredDeviations.find(
        sd => sd.type.toLowerCase() === csrDeviation.type.toLowerCase()
      );

      if (!structuredDeviation) {
        issues.push({
          type: 'PROTOCOL_DEVIATION_MISSING',
          severity: 'Major',
          violation: `Protocol deviation "${csrDeviation.type}" mentioned in CSR but not found in structured data`,
          recommendedAction: 'Verify protocol deviation data completeness',
          section: 'Protocol Deviations',
          dataSource: 'CSR vs Structured Protocol Data',
        });
      } else if (csrDeviation.count !== structuredDeviation.count) {
        issues.push({
          type: 'PROTOCOL_DEVIATION_COUNT_MISMATCH',
          severity: 'Major',
          violation: `Deviation count mismatch for "${csrDeviation.type}": CSR=${csrDeviation.count}, Data=${structuredDeviation.count}`,
          recommendedAction: 'Reconcile protocol deviation counts',
          section: 'Protocol Deviations',
          dataSource: 'CSR vs Structured Protocol Data',
        });
      }
    }

    return { issues };
  }

  validateStatisticalMethods(csrMethods, structuredMethods) {
    try {
      const missingMethods = structuredMethods.filter(
        method =>
          !csrMethods.some(csrMethod => csrMethod.toLowerCase().includes(method.toLowerCase()))
      );

      if (missingMethods.length > 0) {
        return {
          valid: false,
          details: `Missing methods in CSR: ${missingMethods.join(', ')}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, details: 'Statistical methods validation error' };
    }
  }
}

export default new CSRStudyIntegrationService();
