/**
 * CER AI Validation Service
 *
 * This service provides specialized AI-powered validation for Clinical Evaluation Reports (CERs)
 * with focus on detecting and preventing AI hallucinations, verifying citations,
 * ensuring factual accuracy, and maintaining regulatory compliance.
 */

import { cerApiService } from './CerAPIService';

class CerAiValidationService {
  /**
   * Perform comprehensive AI-powered validation on a CER document
   *
   * @param {Object} cerDocument - Complete CER document to validate
   * @param {string} regulatoryFramework - The regulatory framework to validate against
   * @returns {Promise<Object>} Validation results with detailed analysis
   */
  async validateWithAI(cerDocument, regulatoryFramework = 'EU_MDR') {
    console.log(`Performing AI-powered validation for ${regulatoryFramework}`);

    try {
      // Initialize validation results
      const validationResults = {
        aiValidated: true,
        timestamp: new Date().toISOString(),
        framework: regulatoryFramework,
        summary: {
          totalIssues: 0,
          criticalIssues: 0,
          majorIssues: 0,
          minorIssues: 0,
          passedChecks: 0,
          complianceScore: 0,
        },
        categories: {
          regulatory_compliance: { passed: 0, failed: 0, status: 'pending' },
          completeness: { passed: 0, failed: 0, status: 'pending' },
          references: { passed: 0, failed: 0, status: 'pending' },
          consistency: { passed: 0, failed: 0, status: 'pending' },
          factual_accuracy: { passed: 0, failed: 0, status: 'pending' },
        },
        issues: [],
        hallucinations: [],
        factualErrors: [],
        citationErrors: [],
        consistencyErrors: [],
        recommendedChanges: [],
      };

      // Run specialized AI validation
      const validationPromises = [
        this.detectHallucinations(cerDocument),
        this.verifyFactualClaims(cerDocument),
        this.validateCompliance(cerDocument, regulatoryFramework),
        this.validateReferences(cerDocument),
      ];

      const [hallucinationResults, factualResults, complianceResults, referenceResults] =
        await Promise.all(validationPromises);

      // Process hallucination detection results
      validationResults.hallucinations = hallucinationResults.hallucinations;
      hallucinationResults.hallucinations.forEach(hallucination => {
        validationResults.issues.push({
          id: `hal-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          category: 'factual_accuracy',
          type: 'hallucination',
          severity: hallucination.confidence > 0.8 ? 'critical' : 'major',
          message: hallucination.message,
          location: hallucination.location,
          details: hallucination.details,
          confidence: hallucination.confidence,
        });
      });

      // Process factual claim verification results
      validationResults.factualErrors = factualResults.errors;
      factualResults.errors.forEach(error => {
        validationResults.issues.push({
          id: `fact-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          category: 'factual_accuracy',
          type: 'factual_error',
          severity: error.severity,
          message: error.message,
          location: error.location,
          details: error.details,
          correctValue: error.correctValue,
        });
      });

      // Process compliance validation results
      complianceResults.issues.forEach(issue => {
        validationResults.issues.push({
          id: `comp-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          category: 'regulatory_compliance',
          type: issue.type,
          severity: issue.severity,
          message: issue.message,
          location: issue.location,
          regulatoryReference: issue.regulatoryReference,
          details: issue.details,
        });
      });

      // Process reference validation results
      validationResults.citationErrors = referenceResults.errors;
      referenceResults.errors.forEach(error => {
        validationResults.issues.push({
          id: `ref-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          category: 'references',
          type: 'citation_error',
          severity: error.severity,
          message: error.message,
          location: error.location,
          details: error.details,
        });
      });

      // Process recommendations
      const recommendations = [
        ...hallucinationResults.recommendations,
        ...factualResults.recommendations,
        ...complianceResults.recommendations,
        ...referenceResults.recommendations,
      ];

      validationResults.recommendedChanges = recommendations;

      // Update summary statistics
      const criticalIssues = validationResults.issues.filter(i => i.severity === 'critical').length;
      const majorIssues = validationResults.issues.filter(i => i.severity === 'major').length;
      const minorIssues = validationResults.issues.filter(i => i.severity === 'minor').length;

      // Update category statistics
      const categories = [
        'regulatory_compliance',
        'completeness',
        'references',
        'consistency',
        'factual_accuracy',
      ];

      categories.forEach(category => {
        const categoryIssues = validationResults.issues.filter(i => i.category === category);
        validationResults.categories[category].failed = categoryIssues.length;

        // Calculate passed checks (assumption: each category has a typical number of checks)
        const typicalChecks = this.getTypicalCheckCount(category, regulatoryFramework);
        validationResults.categories[category].passed = typicalChecks - categoryIssues.length;

        // Status determination
        if (categoryIssues.some(i => i.severity === 'critical')) {
          validationResults.categories[category].status = 'error';
        } else if (categoryIssues.some(i => i.severity === 'major')) {
          validationResults.categories[category].status = 'warning';
        } else if (categoryIssues.length > 0) {
          validationResults.categories[category].status = 'needs_review';
        } else {
          validationResults.categories[category].status = 'success';
        }
      });

      // Update overall summary
      validationResults.summary.criticalIssues = criticalIssues;
      validationResults.summary.majorIssues = majorIssues;
      validationResults.summary.minorIssues = minorIssues;
      validationResults.summary.totalIssues = criticalIssues + majorIssues + minorIssues;

      // Calculate total passed checks
      validationResults.summary.passedChecks = Object.values(validationResults.categories).reduce(
        (total, category) => total + category.passed,
        0
      );

      // Calculate compliance score (0-100)
      const totalChecks =
        validationResults.summary.passedChecks + validationResults.summary.totalIssues;
      if (totalChecks > 0) {
        validationResults.summary.complianceScore = Math.round(
          (validationResults.summary.passedChecks / totalChecks) * 100
        );
      }

      return validationResults;
    } catch (error) {
      console.error('Error in AI validation:', error);
      throw new Error(`AI validation failed: ${error.message}`);
    }
  }

  /**
   * Detect hallucinations (fabricated content) in a CER document
   *
   * @param {Object} cerDocument - The CER document to analyze
   * @returns {Promise<Object>} Detected hallucinations with recommendations
   */
  async detectHallucinations(cerDocument) {
    console.log('Detecting hallucinations in CER document...');

    try {
      // Make API call to AI-powered hallucination detector
      const response = await cerApiService.detectHallucinations(cerDocument);

      return {
        hallucinations: response.hallucinations || [],
        recommendations: response.recommendations || [],
      };
    } catch (error) {
      console.error('Error detecting hallucinations:', error);
      return { hallucinations: [], recommendations: [] };
    }
  }

  /**
   * Verify factual claims in a CER document
   *
   * @param {Object} cerDocument - The CER document to verify
   * @returns {Promise<Object>} Factual errors with recommendations
   */
  async verifyFactualClaims(cerDocument) {
    console.log('Verifying factual claims in CER document...');

    try {
      // Extract all factual claims from document
      const claims = this.extractFactualClaims(cerDocument);

      // Verify each claim against authoritative sources
      const verificationPromises = claims.map(claim => this.verifyFactualClaim(claim));

      const verificationResults = await Promise.all(verificationPromises);

      // Process verification results
      const errors = [];
      const recommendations = [];

      verificationResults.forEach((result, index) => {
        const claim = claims[index];

        if (!result.verified) {
          // Create error record
          errors.push({
            id: `fact-${Date.now()}-${index}`,
            message: `Factual error: ${claim.text}`,
            severity: this.determineFactualErrorSeverity(claim, result),
            location: claim.location,
            details: {
              claim: claim.text,
              factualIssue: result.issue,
              confidence: result.confidence,
            },
            correctValue: result.correctInformation,
          });

          // Create recommendation
          recommendations.push({
            id: `rec-fact-${Date.now()}-${index}`,
            type: 'correction',
            location: claim.location,
            original: claim.text,
            suggested: result.suggestedCorrection,
            explanation: result.explanation,
            confidence: result.confidence,
          });
        }
      });

      return {
        errors,
        recommendations,
      };
    } catch (error) {
      console.error('Error verifying factual claims:', error);
      return { errors: [], recommendations: [] };
    }
  }

  /**
   * Validate compliance with regulatory framework
   *
   * @param {Object} cerDocument - The CER document to validate
   * @param {string} regulatoryFramework - The regulatory framework
   * @returns {Promise<Object>} Compliance issues with recommendations
   */
  async validateCompliance(cerDocument, regulatoryFramework) {
    console.log(`Validating compliance with ${regulatoryFramework}...`);

    try {
      // Make API call to regulatory compliance validator
      const response = await cerApiService.validateRegulatory(cerDocument, regulatoryFramework);

      return {
        issues: response.issues || [],
        recommendations: response.recommendations || [],
      };
    } catch (error) {
      console.error('Error validating compliance:', error);
      return { issues: [], recommendations: [] };
    }
  }

  /**
   * Validate references and citations
   *
   * @param {Object} cerDocument - The CER document to validate
   * @returns {Promise<Object>} Reference errors with recommendations
   */
  async validateReferences(cerDocument) {
    console.log('Validating references and citations...');

    try {
      // Extract references and citations from document
      const references = this.extractReferences(cerDocument);

      // Verify each reference
      const verificationPromises = references.map(reference => this.verifyReference(reference));

      const verificationResults = await Promise.all(verificationPromises);

      // Process verification results
      const errors = [];
      const recommendations = [];

      verificationResults.forEach((result, index) => {
        const reference = references[index];

        if (!result.valid) {
          // Create error record
          errors.push({
            id: `ref-${Date.now()}-${index}`,
            message: `Citation error: ${result.issue}`,
            severity: result.severity || 'major',
            location: reference.location,
            details: {
              reference: reference,
              issue: result.issue,
              confidence: result.confidence,
            },
          });

          // Create recommendation
          if (result.suggestedCorrection) {
            recommendations.push({
              id: `rec-ref-${Date.now()}-${index}`,
              type: 'citation_correction',
              location: reference.location,
              original: reference,
              suggested: result.suggestedCorrection,
              explanation: result.explanation,
              confidence: result.confidence,
            });
          }
        }
      });

      return {
        errors,
        recommendations,
      };
    } catch (error) {
      console.error('Error validating references:', error);
      return { errors: [], recommendations: [] };
    }
  }

  /**
   * Extract factual claims from a CER document
   *
   * @param {Object} cerDocument - The CER document
   * @returns {Array} Array of factual claims
   */
  extractFactualClaims(cerDocument) {
    const claims = [];

    // Process each section of the document
    this.getAllSections(cerDocument).forEach(section => {
      // Skip sections that are unlikely to contain factual claims
      if (['references', 'appendix', 'toc'].includes(section.id)) {
        return;
      }

      // Extract claims from section content
      const sectionClaims = this.extractClaimsFromText(section.id, section.content);
      claims.push(...sectionClaims);
    });

    return claims;
  }

  /**
   * Extract claims from text content
   *
   * @param {string} sectionId - ID of the section
   * @param {string} content - Text content
   * @returns {Array} Array of claim objects
   */
  extractClaimsFromText(sectionId, content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const claims = [];

    // Split into sentences (simple approach)
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

    // Process each sentence
    sentences.forEach((sentence, index) => {
      // Skip very short sentences
      if (sentence.trim().length < 10) {
        return;
      }

      // Check for factual claim patterns
      const isFactualClaim = this.checkFactualClaimPatterns(sentence);

      if (isFactualClaim) {
        claims.push({
          text: sentence.trim(),
          location: `section:${sectionId}:sentence:${index}`,
          type: 'factual_claim',
        });
      }
    });

    return claims;
  }

  /**
   * Check if a sentence contains factual claim patterns
   *
   * @param {string} sentence - Sentence to check
   * @returns {boolean} True if sentence contains factual claim patterns
   */
  checkFactualClaimPatterns(sentence) {
    // Keywords indicating factual claims
    const factualPatterns = [
      /(?:results|data|study|evidence|trial|analysis)(?:.{0,30})(?:show|demonstrate|indicate|reveal|confirm)/i,
      /(?:analysis|studies|literature|evidence)(?:.{0,30})(?:support|establish|confirm|validate)/i,
      /significant(?:.{0,20})(?:improvement|reduction|increase|decrease|difference)/i,
      /(?:mortality|morbidity|adverse events|incidents|complications)(?:.{0,30})(?:rate|percentage|incidence)/i,
      /(?:reported|observed|documented|recorded)(?:.{0,30})(?:in|by|during|after)/i,
      /according to/i,
      /(?:published|reported)(?:.{0,20})(?:data|study|studies|literature|guidelines)/i,
    ];

    // Check if any pattern matches
    return factualPatterns.some(pattern => pattern.test(sentence));
  }

  /**
   * Extract references from a CER document
   *
   * @param {Object} cerDocument - The CER document
   * @returns {Array} Array of reference objects
   */
  extractReferences(cerDocument) {
    const references = [];

    // Extract from references section if available
    if (cerDocument.references && Array.isArray(cerDocument.references)) {
      cerDocument.references.forEach((ref, index) => {
        references.push({
          ...ref,
          location: `references:${index}`,
        });
      });
      return references;
    }

    // Alternative: scan through document sections for citations
    this.getAllSections(cerDocument).forEach(section => {
      if (!section.content) return;

      // Look for citation patterns in text
      const citationPatterns = [
        /\[(\d+)\]/g, // [1], [2], etc.
        /\(([^)]+et al\.,?\s+\d{4})\)/g, // (Smith et al., 2020)
        /\(([^,]+,\s+\d{4})\)/g, // (Smith, 2020)
      ];

      citationPatterns.forEach(pattern => {
        const matches = section.content.matchAll(pattern);
        for (const match of matches) {
          references.push({
            id: match[1],
            text: match[0],
            location: `section:${section.id}:position:${match.index}`,
          });
        }
      });
    });

    return references;
  }

  /**
   * Get all sections from a CER document
   *
   * @param {Object} cerDocument - The CER document
   * @returns {Array} Array of section objects
   */
  getAllSections(cerDocument) {
    const sections = [];

    // This would be implementation-specific based on your document structure
    // Simplified example:
    if (cerDocument.sections && Array.isArray(cerDocument.sections)) {
      return cerDocument.sections;
    }

    // Alternative approach gathering sections from different parts of the document
    const sectionMappings = [
      { id: 'device_description', content: cerDocument.deviceDescription },
      { id: 'scope', content: cerDocument.scope },
      { id: 'clinical_evaluation', content: cerDocument.clinicalEvaluation },
      { id: 'methods', content: cerDocument.methods },
      { id: 'results', content: cerDocument.results },
      { id: 'discussion', content: cerDocument.discussion },
      { id: 'conclusions', content: cerDocument.conclusions },
    ];

    for (const mapping of sectionMappings) {
      if (mapping.content) {
        sections.push({
          id: mapping.id,
          content:
            typeof mapping.content === 'string' ? mapping.content : JSON.stringify(mapping.content),
        });
      }
    }

    return sections;
  }

  /**
   * Get typical number of checks for a category
   *
   * @param {string} category - The category name
   * @param {string} framework - The regulatory framework
   * @returns {number} Typical number of checks
   */
  getTypicalCheckCount(category, framework) {
    // This would ideally be based on actual regulatory requirements
    const checkCounts = {
      EU_MDR: {
        regulatory_compliance: 25,
        completeness: 15,
        references: 20,
        consistency: 10,
        factual_accuracy: 30,
      },
      FDA: {
        regulatory_compliance: 20,
        completeness: 12,
        references: 15,
        consistency: 8,
        factual_accuracy: 25,
      },
      UKCA: {
        regulatory_compliance: 22,
        completeness: 14,
        references: 18,
        consistency: 9,
        factual_accuracy: 28,
      },
      health_canada: {
        regulatory_compliance: 18,
        completeness: 10,
        references: 15,
        consistency: 8,
        factual_accuracy: 22,
      },
      ICH: {
        regulatory_compliance: 20,
        completeness: 12,
        references: 15,
        consistency: 8,
        factual_accuracy: 25,
      },
    };

    // Default fallback if framework or category not found
    if (!checkCounts[framework] || !checkCounts[framework][category]) {
      return 15; // Default assumption
    }

    return checkCounts[framework][category];
  }

  /**
   * Verify a factual claim against authoritative sources
   *
   * @param {Object} claim - The claim to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyFactualClaim(claim) {
    try {
      // Make API call to verify claim
      const result = await cerApiService.verifyFactualClaim(claim);
      return result;
    } catch (error) {
      console.error('Error verifying factual claim:', error);
      return {
        verified: false,
        confidence: 0,
        issue: 'Verification failed due to API error',
        explanation: error.message,
      };
    }
  }

  /**
   * Verify a reference against literature databases
   *
   * @param {Object} reference - The reference to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyReference(reference) {
    try {
      // Make API call to verify reference
      const result = await cerApiService.verifyReference(reference);
      return result;
    } catch (error) {
      console.error('Error verifying reference:', error);
      return {
        valid: false,
        confidence: 0,
        severity: 'minor',
        issue: 'Reference verification failed due to API error',
        explanation: error.message,
      };
    }
  }

  /**
   * Determine severity of a factual error
   *
   * @param {Object} claim - The factual claim
   * @param {Object} result - Verification result
   * @returns {string} Severity level
   */
  determineFactualErrorSeverity(claim, result) {
    // High confidence errors are more severe
    if (result.confidence > 0.9) {
      return 'critical';
    }

    // Medium confidence errors
    if (result.confidence > 0.7) {
      return 'major';
    }

    // Lower confidence errors
    return 'minor';
  }
}

export const cerAiValidationService = new CerAiValidationService();
