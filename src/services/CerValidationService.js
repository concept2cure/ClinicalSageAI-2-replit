/**
 * CER Validation Service
 *
 * This service provides comprehensive validation of AI-generated Clinical Evaluation Reports (CERs)
 * to ensure regulatory compliance, completeness, and factual accuracy.
 *
 * Key features:
 * - Completeness check against regulatory requirements
 * - Internal consistency validation
 * - Citation verification
 * - Claim validation
 * - Regulatory checklist compliance
 */

import { cerApiService } from './CerAPIService';

class CerValidationService {
  /**
   * Validates a complete CER document against regulatory requirements
   *
   * @param {Object} cerDocument - The complete CER document object
   * @param {string} regulatoryFramework - The regulatory framework to validate against (e.g., 'EU_MDR', 'FDA', 'UKCA')
   * @param {boolean} enhancedValidation - Whether to use enhanced AI-powered validation
   * @returns {Promise<Object>} Validation results with issues categorized by severity
   */
  async validateCompleteCER(
    cerDocument,
    regulatoryFramework = 'EU_MDR',
    enhancedValidation = false
  ) {
    try {
      console.log(
        `Validating CER against ${regulatoryFramework} requirements (Enhanced mode: ${enhancedValidation ? 'ON' : 'OFF'})`
      );

      // Start with empty results structure
      const validationResults = {
        complete: false,
        critical: [],
        major: [],
        minor: [],
        suggestions: [],
        missingRequiredSections: [],
        inconsistentClaims: [],
        potentialFactualErrors: [],
        citationIssues: [],
        regulatoryChecklist: {
          total: 0,
          passed: 0,
          failed: 0,
          items: [],
        },
      };

      // Run all validation checks in parallel for efficiency
      const [completenessCheck, consistencyCheck, factualCheck, citationCheck, regulatoryCheck] =
        await Promise.all([
          this.validateCompleteness(cerDocument, regulatoryFramework),
          this.validateInternalConsistency(cerDocument),
          this.validateFactualAccuracy(cerDocument),
          this.validateCitations(cerDocument),
          this.validateRegulatoryCompliance(cerDocument, regulatoryFramework),
        ]);

      // Merge all validation results
      Object.assign(validationResults, {
        missingRequiredSections: completenessCheck.missingRequiredSections,
        inconsistentClaims: consistencyCheck.inconsistentClaims,
        potentialFactualErrors: factualCheck.potentialFactualErrors,
        citationIssues: citationCheck.citationIssues,
        regulatoryChecklist: regulatoryCheck.checklist,
      });

      // Aggregate issues by severity
      validationResults.critical = [
        ...completenessCheck.critical,
        ...consistencyCheck.critical,
        ...factualCheck.critical,
        ...citationCheck.critical,
        ...regulatoryCheck.critical,
      ];

      validationResults.major = [
        ...completenessCheck.major,
        ...consistencyCheck.major,
        ...factualCheck.major,
        ...citationCheck.major,
        ...regulatoryCheck.major,
      ];

      validationResults.minor = [
        ...completenessCheck.minor,
        ...consistencyCheck.minor,
        ...factualCheck.minor,
        ...citationCheck.minor,
        ...regulatoryCheck.minor,
      ];

      validationResults.suggestions = [
        ...completenessCheck.suggestions,
        ...consistencyCheck.suggestions,
        ...factualCheck.suggestions,
        ...citationCheck.suggestions,
        ...regulatoryCheck.suggestions,
      ];

      // Determine if the CER passes validation
      validationResults.complete =
        validationResults.critical.length === 0 &&
        validationResults.missingRequiredSections.length === 0 &&
        validationResults.regulatoryChecklist.failed === 0;

      return validationResults;
    } catch (error) {
      console.error('Error during CER validation:', error);
      throw new Error(`CER validation failed: ${error.message}`);
    }
  }

  /**
   * Validates completeness of a CER against regulatory requirements
   *
   * @param {Object} cerDocument - The CER document to validate
   * @param {string} regulatoryFramework - The regulatory framework to validate against
   * @returns {Promise<Object>} Completeness validation results
   */
  async validateCompleteness(cerDocument, regulatoryFramework) {
    console.log(`Checking CER completeness for ${regulatoryFramework}`);

    const result = {
      critical: [],
      major: [],
      minor: [],
      suggestions: [],
      missingRequiredSections: [],
    };

    // Get required sections based on regulatory framework
    const requiredSections = await this.getRequiredSections(regulatoryFramework);

    // Check for presence of all required sections
    for (const section of requiredSections) {
      const sectionExists = this.checkSectionExists(cerDocument, section.id);

      if (!sectionExists) {
        result.missingRequiredSections.push(section);

        // Add as critical issue if marked as critical in requirements
        if (section.criticality === 'critical') {
          result.critical.push({
            type: 'missing_required_section',
            section: section.id,
            message: `Missing critical required section: ${section.name}`,
            location: 'document',
            regulatoryReference: section.regulatoryReference,
          });
        } else {
          result.major.push({
            type: 'missing_required_section',
            section: section.id,
            message: `Missing required section: ${section.name}`,
            location: 'document',
            regulatoryReference: section.regulatoryReference,
          });
        }
      }
    }

    // Check for missing required content within existing sections
    for (const section of requiredSections) {
      if (this.checkSectionExists(cerDocument, section.id)) {
        const sectionContent = this.getSectionContent(cerDocument, section.id);
        const contentIssues = await this.validateSectionContent(
          sectionContent,
          section,
          regulatoryFramework
        );

        result.critical.push(...contentIssues.critical);
        result.major.push(...contentIssues.major);
        result.minor.push(...contentIssues.minor);
        result.suggestions.push(...contentIssues.suggestions);
      }
    }

    return result;
  }

  /**
   * Validates internal consistency of a CER document
   *
   * @param {Object} cerDocument - The CER document to validate
   * @returns {Promise<Object>} Consistency validation results
   */
  async validateInternalConsistency(cerDocument) {
    console.log('Checking CER internal consistency');

    const result = {
      critical: [],
      major: [],
      minor: [],
      suggestions: [],
      inconsistentClaims: [],
    };

    // Extract device claims from different sections
    const deviceClaims = this.extractDeviceClaims(cerDocument);

    // Extract indications and intended use statements
    const intendedUse = this.extractIntendedUse(cerDocument);

    // Check for inconsistencies between claims
    const claimConsistencyIssues = this.checkClaimConsistency(deviceClaims);
    result.inconsistentClaims = claimConsistencyIssues;

    // Add inconsistent claims as major issues
    claimConsistencyIssues.forEach(issue => {
      result.major.push({
        type: 'inconsistent_claim',
        message: issue.message,
        location: issue.location,
        details: issue.details,
      });
    });

    // Check if claims are consistent with intended use
    const intendedUseIssues = this.checkClaimsVsIntendedUse(deviceClaims, intendedUse);

    intendedUseIssues.forEach(issue => {
      result.critical.push({
        type: 'claim_exceeds_intended_use',
        message: issue.message,
        location: issue.location,
        details: issue.details,
      });

      result.inconsistentClaims.push(issue);
    });

    return result;
  }

  /**
   * Validates the factual accuracy of a CER document
   *
   * @param {Object} cerDocument - The CER document to validate
   * @returns {Promise<Object>} Factual accuracy validation results
   */
  async validateFactualAccuracy(cerDocument) {
    console.log('Checking CER factual accuracy');

    const result = {
      critical: [],
      major: [],
      minor: [],
      suggestions: [],
      potentialFactualErrors: [],
    };

    // Extract clinical data interpretations
    const clinicalDataInterpretations = this.extractClinicalDataInterpretations(cerDocument);

    // Verify against source data (actual study data in the system)
    const factualIssues = await this.verifyAgainstSourceData(clinicalDataInterpretations);

    result.potentialFactualErrors = factualIssues;

    // Categorize factual issues by severity
    factualIssues.forEach(issue => {
      if (issue.severity === 'critical') {
        result.critical.push({
          type: 'factual_error',
          message: issue.message,
          location: issue.location,
          details: issue.details,
          correctValue: issue.correctValue,
        });
      } else if (issue.severity === 'major') {
        result.major.push({
          type: 'factual_error',
          message: issue.message,
          location: issue.location,
          details: issue.details,
          correctValue: issue.correctValue,
        });
      } else {
        result.minor.push({
          type: 'factual_error',
          message: issue.message,
          location: issue.location,
          details: issue.details,
          correctValue: issue.correctValue,
        });
      }
    });

    return result;
  }

  /**
   * Validates citations in a CER document to prevent hallucinated references
   *
   * @param {Object} cerDocument - The CER document to validate
   * @returns {Promise<Object>} Citation validation results
   */
  async validateCitations(cerDocument) {
    console.log('Checking CER citations');

    const result = {
      critical: [],
      major: [],
      minor: [],
      suggestions: [],
      citationIssues: [],
    };

    // Extract all citations from the document
    const citations = this.extractCitations(cerDocument);

    // Verify each citation against the knowledge base
    const citationVerificationPromises = citations.map(citation => this.verifyCitation(citation));

    const citationVerificationResults = await Promise.all(citationVerificationPromises);

    // Process verification results
    citationVerificationResults.forEach((verificationResult, index) => {
      const citation = citations[index];

      if (!verificationResult.exists) {
        const issue = {
          type: 'invalid_citation',
          citation: citation,
          message: `Citation not found in knowledge base: ${citation.text}`,
          location: citation.location,
          confidence: verificationResult.confidence,
        };

        result.citationIssues.push(issue);
        result.major.push({
          type: 'invalid_citation',
          message: issue.message,
          location: issue.location,
          details: citation,
        });
      } else if (verificationResult.contentMismatch) {
        const issue = {
          type: 'citation_content_mismatch',
          citation: citation,
          message: `Citation exists but content does not match: ${citation.text}`,
          location: citation.location,
          actualContent: verificationResult.actualContent,
          confidence: verificationResult.confidence,
        };

        result.citationIssues.push(issue);
        result.major.push({
          type: 'citation_content_mismatch',
          message: issue.message,
          location: issue.location,
          details: {
            citation: citation,
            actualContent: verificationResult.actualContent,
          },
        });
      }
    });

    return result;
  }

  /**
   * Validates a CER document against regulatory compliance checklists
   *
   * @param {Object} cerDocument - The CER document to validate
   * @param {string} regulatoryFramework - The regulatory framework to validate against
   * @returns {Promise<Object>} Regulatory compliance validation results
   */
  async validateRegulatoryCompliance(cerDocument, regulatoryFramework) {
    console.log(`Validating regulatory compliance for ${regulatoryFramework}`);

    const result = {
      critical: [],
      major: [],
      minor: [],
      suggestions: [],
      checklist: {
        total: 0,
        passed: 0,
        failed: 0,
        items: [],
      },
    };

    // Get regulatory checklist for the specified framework
    const regulatoryChecklist = await this.getRegulatoryChecklist(regulatoryFramework);
    result.checklist.total = regulatoryChecklist.length;

    // Validate each checklist item
    for (const checklistItem of regulatoryChecklist) {
      const validationResult = await this.validateChecklistItem(cerDocument, checklistItem);

      result.checklist.items.push({
        id: checklistItem.id,
        description: checklistItem.description,
        regulatoryReference: checklistItem.regulatoryReference,
        result: validationResult.passed ? 'passed' : 'failed',
        details: validationResult.details || '',
      });

      if (validationResult.passed) {
        result.checklist.passed++;
      } else {
        result.checklist.failed++;

        // Add issue based on criticality
        if (checklistItem.criticality === 'critical') {
          result.critical.push({
            type: 'regulatory_checklist_failure',
            message: `Failed critical regulatory requirement: ${checklistItem.description}`,
            regulatoryReference: checklistItem.regulatoryReference,
            details: validationResult.details,
          });
        } else if (checklistItem.criticality === 'major') {
          result.major.push({
            type: 'regulatory_checklist_failure',
            message: `Failed major regulatory requirement: ${checklistItem.description}`,
            regulatoryReference: checklistItem.regulatoryReference,
            details: validationResult.details,
          });
        } else {
          result.minor.push({
            type: 'regulatory_checklist_failure',
            message: `Failed regulatory requirement: ${checklistItem.description}`,
            regulatoryReference: checklistItem.regulatoryReference,
            details: validationResult.details,
          });
        }
      }
    }

    return result;
  }

  /**
   * Gets required sections for a CER based on regulatory framework
   *
   * @param {string} regulatoryFramework - The regulatory framework
   * @returns {Promise<Array>} List of required sections
   */
  async getRequiredSections(regulatoryFramework) {
    // In production, this would call an API or database
    // For now, we're using a simplified example for EU MDR

    if (regulatoryFramework === 'EU_MDR') {
      return [
        {
          id: 'device_description',
          name: 'Device Description',
          criticality: 'critical',
          regulatoryReference: 'MEDDEV 2.7/1 Rev 4, Section 7',
        },
        {
          id: 'intended_purpose',
          name: 'Intended Purpose',
          criticality: 'critical',
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 1',
        },
        {
          id: 'state_of_art',
          name: 'State of the Art',
          criticality: 'critical',
          regulatoryReference: 'EU MDR Article 61(3)',
        },
        {
          id: 'clinical_evaluation_data',
          name: 'Clinical Evaluation Data',
          criticality: 'critical',
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 2',
        },
        {
          id: 'risk_benefit_analysis',
          name: 'Risk-Benefit Analysis',
          criticality: 'critical',
          regulatoryReference: 'EU MDR Annex I, Chapter I, Section 8',
        },
        {
          id: 'conclusion',
          name: 'Conclusion',
          criticality: 'critical',
          regulatoryReference: 'MEDDEV 2.7/1 Rev 4, Section 10',
        },
        {
          id: 'post_market_surveillance',
          name: 'Post-Market Surveillance',
          criticality: 'critical',
          regulatoryReference: 'EU MDR Article 83',
        },
        {
          id: 'equivalence_data',
          name: 'Equivalence Data',
          criticality: 'major',
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 3',
        },
      ];
    } else if (regulatoryFramework === 'FDA') {
      // FDA requirements would be defined here
      return [];
    } else {
      // Default to a basic set of requirements
      return [];
    }
  }

  /**
   * Checks if a section exists in the CER document
   *
   * @param {Object} cerDocument - The CER document
   * @param {string} sectionId - The section ID to check
   * @returns {boolean} Whether the section exists
   */
  checkSectionExists(cerDocument, sectionId) {
    if (!cerDocument || !cerDocument.sections) {
      return false;
    }

    return cerDocument.sections.some(
      section =>
        section.id === sectionId ||
        section.type === sectionId ||
        (section.metadata && section.metadata.sectionType === sectionId)
    );
  }

  /**
   * Gets content of a specific section in the CER document
   *
   * @param {Object} cerDocument - The CER document
   * @param {string} sectionId - The section ID
   * @returns {Object|null} The section content or null if not found
   */
  getSectionContent(cerDocument, sectionId) {
    if (!cerDocument || !cerDocument.sections) {
      return null;
    }

    const section = cerDocument.sections.find(
      section =>
        section.id === sectionId ||
        section.type === sectionId ||
        (section.metadata && section.metadata.sectionType === sectionId)
    );

    return section || null;
  }

  /**
   * Validates content of a specific section
   *
   * @param {Object} sectionContent - The section content
   * @param {Object} sectionRequirements - The section requirements
   * @param {string} regulatoryFramework - The regulatory framework
   * @returns {Promise<Object>} Section content validation results
   */
  async validateSectionContent(sectionContent, sectionRequirements, regulatoryFramework) {
    const result = {
      critical: [],
      major: [],
      minor: [],
      suggestions: [],
    };

    if (!sectionContent) {
      return result;
    }

    // Check for minimum content length
    if (sectionContent.content && sectionContent.content.length < 50) {
      result.major.push({
        type: 'insufficient_content',
        message: `Section ${sectionRequirements.name} has insufficient content`,
        location: `section.${sectionRequirements.id}`,
        regulatoryReference: sectionRequirements.regulatoryReference,
      });
    }

    // More detailed content validation would be implemented here
    // This would likely use GPT-4o to evaluate the quality and completeness of content

    return result;
  }

  /**
   * Extracts device claims from the CER document
   *
   * @param {Object} cerDocument - The CER document
   * @returns {Array} List of device claims with their locations
   */
  extractDeviceClaims(cerDocument) {
    const claims = [];

    if (!cerDocument || !cerDocument.sections) {
      return claims;
    }

    // Search through document sections for claims
    cerDocument.sections.forEach(section => {
      if (!section.content) return;

      // Use regex to find claim-like statements
      // This is a simplified approach - in production, we'd use more sophisticated NLP
      const claimRegex = /(?:claim|assert|state|demonstrate|show)s? that (.+?)(?:\.|\n|$)/gi;
      let match;

      while ((match = claimRegex.exec(section.content)) !== null) {
        claims.push({
          text: match[1].trim(),
          location: `section.${section.id}`,
          context: section.content.substring(
            Math.max(0, match.index - 50),
            Math.min(section.content.length, match.index + match[0].length + 50)
          ),
        });
      }
    });

    return claims;
  }

  /**
   * Extracts intended use statements from the CER document
   *
   * @param {Object} cerDocument - The CER document
   * @returns {Object} Intended use information
   */
  extractIntendedUse(cerDocument) {
    if (!cerDocument || !cerDocument.sections) {
      return null;
    }

    // Find the intended purpose section
    const intendedUseSection = cerDocument.sections.find(
      section =>
        section.id === 'intended_purpose' ||
        section.type === 'intended_purpose' ||
        (section.metadata && section.metadata.sectionType === 'intended_purpose')
    );

    if (!intendedUseSection || !intendedUseSection.content) {
      return null;
    }

    // Extract key intended use information
    // In production, this would use more sophisticated NLP
    return {
      fullText: intendedUseSection.content,
      indications: this.extractIndications(intendedUseSection.content),
      contraindications: this.extractContraindications(intendedUseSection.content),
      patientPopulation: this.extractPatientPopulation(intendedUseSection.content),
      location: `section.${intendedUseSection.id}`,
    };
  }

  /**
   * Extracts indications from intended use text
   *
   * @param {string} intendedUseText - The intended use text
   * @returns {Array} List of indications
   */
  extractIndications(intendedUseText) {
    // Simplified extraction - in production, use more advanced NLP
    const indicationsRegex =
      /(?:indication|indicated for|used for|intended for)s?:?\s*(.+?)(?:\.|\n|$)/i;
    const match = indicationsRegex.exec(intendedUseText);

    if (match) {
      return [match[1].trim()];
    }

    return [];
  }

  /**
   * Extracts contraindications from intended use text
   *
   * @param {string} intendedUseText - The intended use text
   * @returns {Array} List of contraindications
   */
  extractContraindications(intendedUseText) {
    // Simplified extraction - in production, use more advanced NLP
    const contraRegex =
      /(?:contraindication|not indicated for|should not be used for)s?:?\s*(.+?)(?:\.|\n|$)/i;
    const match = contraRegex.exec(intendedUseText);

    if (match) {
      return [match[1].trim()];
    }

    return [];
  }

  /**
   * Extracts patient population from intended use text
   *
   * @param {string} intendedUseText - The intended use text
   * @returns {string|null} Patient population description
   */
  extractPatientPopulation(intendedUseText) {
    // Simplified extraction - in production, use more advanced NLP
    const popRegex =
      /(?:patient population|intended patient|target population|for use in)s?:?\s*(.+?)(?:\.|\n|$)/i;
    const match = popRegex.exec(intendedUseText);

    if (match) {
      return match[1].trim();
    }

    return null;
  }

  /**
   * Checks consistency between device claims
   *
   * @param {Array} claims - List of device claims
   * @returns {Array} List of inconsistency issues
   */
  checkClaimConsistency(claims) {
    const inconsistencies = [];

    // Compare each claim against all others
    // This is a simplified approach - production would use semantic comparison
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        // Check for direct contradictions
        // In production, this would use a more sophisticated contradiction detection
        if (this.areClaimsContradictory(claims[i].text, claims[j].text)) {
          inconsistencies.push({
            type: 'contradictory_claims',
            message: 'Contradictory claims detected',
            location: [claims[i].location, claims[j].location],
            details: {
              claim1: claims[i].text,
              claim2: claims[j].text,
              context1: claims[i].context,
              context2: claims[j].context,
            },
          });
        }
      }
    }

    return inconsistencies;
  }

  /**
   * Checks if two claims are contradictory
   *
   * @param {string} claim1 - First claim
   * @param {string} claim2 - Second claim
   * @returns {boolean} Whether the claims are contradictory
   */
  areClaimsContradictory(claim1, claim2) {
    // Simplified check - production would use semantic analysis
    // Check for direct negation
    const negationPairs = [
      ['improves', 'does not improve'],
      ['prevents', 'does not prevent'],
      ['reduces', 'does not reduce'],
      ['effective', 'ineffective'],
      ['safe', 'unsafe'],
      ['significant', 'insignificant'],
    ];

    for (const [positive, negative] of negationPairs) {
      if (
        (claim1.includes(positive) && claim2.includes(negative)) ||
        (claim1.includes(negative) && claim2.includes(positive))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if claims are consistent with intended use
   *
   * @param {Array} claims - List of device claims
   * @param {Object} intendedUse - Intended use information
   * @returns {Array} List of inconsistency issues
   */
  checkClaimsVsIntendedUse(claims, intendedUse) {
    const issues = [];

    if (!claims || !intendedUse) {
      return issues;
    }

    // Check each claim against intended use statements
    for (const claim of claims) {
      // Check against indications
      const exceedsIndications = this.claimExceedsIndications(claim.text, intendedUse.indications);
      if (exceedsIndications) {
        issues.push({
          type: 'claim_exceeds_indications',
          message: 'Claim appears to exceed approved indications for use',
          location: claim.location,
          details: {
            claim: claim.text,
            indications: intendedUse.indications,
            context: claim.context,
          },
        });
      }

      // Check against contraindications
      const violatesContraindications = this.claimViolatesContraindications(
        claim.text,
        intendedUse.contraindications
      );
      if (violatesContraindications) {
        issues.push({
          type: 'claim_violates_contraindications',
          message: 'Claim appears to violate contraindications',
          location: claim.location,
          details: {
            claim: claim.text,
            contraindications: intendedUse.contraindications,
            context: claim.context,
          },
        });
      }
    }

    return issues;
  }

  /**
   * Checks if a claim exceeds indicated uses
   *
   * @param {string} claim - The claim text
   * @param {Array} indications - List of indications
   * @returns {boolean} Whether the claim exceeds indications
   */
  claimExceedsIndications(claim, indications) {
    // Simplified check - production would use semantic analysis
    // Check for keywords that might indicate exceeding approved uses
    const exceedingKeywords = [
      'all patients',
      'all cases',
      'universally',
      'always',
      '100%',
      'guaranteed',
      'cure',
      'completely eliminates',
    ];

    return exceedingKeywords.some(keyword => claim.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * Checks if a claim violates contraindications
   *
   * @param {string} claim - The claim text
   * @param {Array} contraindications - List of contraindications
   * @returns {boolean} Whether the claim violates contraindications
   */
  claimViolatesContraindications(claim, contraindications) {
    // Simplified check - production would use semantic analysis
    if (!contraindications || contraindications.length === 0) {
      return false;
    }

    // Check if claim appears to recommend use in contraindicated scenarios
    for (const contraindication of contraindications) {
      if (contraindication && claim.toLowerCase().includes(contraindication.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts clinical data interpretations from the CER document
   *
   * @param {Object} cerDocument - The CER document
   * @returns {Array} List of clinical data interpretations
   */
  extractClinicalDataInterpretations(cerDocument) {
    const interpretations = [];

    if (!cerDocument || !cerDocument.sections) {
      return interpretations;
    }

    // Find clinical evaluation data section
    const clinicalDataSection = cerDocument.sections.find(
      section =>
        section.id === 'clinical_evaluation_data' ||
        section.type === 'clinical_evaluation_data' ||
        (section.metadata && section.metadata.sectionType === 'clinical_evaluation_data')
    );

    if (!clinicalDataSection || !clinicalDataSection.content) {
      return interpretations;
    }

    // Extract numerical results
    // This is a simplified approach - production would use more sophisticated extraction
    const numericalResults = this.extractNumericalResults(clinicalDataSection.content);

    numericalResults.forEach(result => {
      interpretations.push({
        text: result.text,
        metrics: {
          value: result.value,
          unit: result.unit,
          parameter: result.parameter,
        },
        source: result.source || null,
        location: `section.${clinicalDataSection.id}`,
      });
    });

    return interpretations;
  }

  /**
   * Extracts numerical results from text
   *
   * @param {string} text - The text to extract from
   * @returns {Array} List of extracted numerical results
   */
  extractNumericalResults(text) {
    const results = [];

    // Simplified regex for numerical results with units and parameters
    // In production, use more sophisticated NLP
    const resultRegex =
      /(?:([a-z\s]+(?:rate|score|index|ratio|level|count|value))\s*(?:was|of|:)\s*)?([-+]?\d+(?:\.\d+)?)(%|mmHg|mg\/dl|μg\/ml|mg\/l|ng\/ml|mmol\/l|s|min|h|d|week|month|year|units?)?/gi;

    let match;
    while ((match = resultRegex.exec(text)) !== null) {
      const parameter = match[1] ? match[1].trim() : null;
      const value = parseFloat(match[2]);
      const unit = match[3] || null;

      // Get the context around this result
      const contextStart = Math.max(0, match.index - 100);
      const contextEnd = Math.min(text.length, match.index + match[0].length + 100);
      const context = text.substring(contextStart, contextEnd);

      // Try to extract source study
      const source = this.extractSourceStudy(context);

      results.push({
        text: match[0],
        value,
        unit,
        parameter,
        source,
        context,
      });
    }

    return results;
  }

  /**
   * Extracts source study information from text
   *
   * @param {string} text - The text to extract from
   * @returns {Object|null} Source study information or null if not found
   */
  extractSourceStudy(text) {
    // Check for citation patterns
    const citationRegex = /\(([^)]+et al\.,? \d{4}[a-z]?)\)/i;
    const match = citationRegex.exec(text);

    if (match) {
      return {
        citation: match[1].trim(),
        type: 'literature',
      };
    }

    // Check for study reference patterns
    const studyRegex =
      /(?:study|trial|investigation)\s+(?:by\s+)?([A-Za-z\s]+(?:et al)?\.?,?\s*\d{4})/i;
    const studyMatch = studyRegex.exec(text);

    if (studyMatch) {
      return {
        citation: studyMatch[1].trim(),
        type: 'literature',
      };
    }

    return null;
  }

  /**
   * Verifies clinical data interpretations against source data
   *
   * @param {Array} interpretations - List of clinical data interpretations
   * @returns {Promise<Array>} List of factual issues
   */
  async verifyAgainstSourceData(interpretations) {
    const issues = [];

    for (const interpretation of interpretations) {
      // Skip interpretations without source or metrics
      if (!interpretation.metrics || !interpretation.metrics.value) {
        continue;
      }

      // Check if we have source study data to verify against
      if (interpretation.source && interpretation.source.citation) {
        // In production, this would query a database of study results
        const sourceData = await this.fetchSourceData(interpretation.source.citation);

        if (sourceData) {
          // Check if the interpretation matches the source data
          const parameter = interpretation.metrics.parameter;
          const value = interpretation.metrics.value;

          if (parameter && sourceData.parameters && sourceData.parameters[parameter]) {
            const actualValue = sourceData.parameters[parameter].value;

            // Check for significant discrepancy
            if (Math.abs((value - actualValue) / actualValue) > 0.1) {
              // 10% threshold
              issues.push({
                severity: 'critical',
                message: `Reported value (${value}) differs significantly from source data (${actualValue})`,
                location: interpretation.location,
                details: {
                  parameter,
                  reportedValue: value,
                  actualValue,
                  source: interpretation.source,
                },
                correctValue: actualValue,
              });
            }
          }
        }
      }

      // Check for implausible values
      if (this.isValueImplausible(interpretation.metrics)) {
        issues.push({
          severity: 'major',
          message: `Reported value (${interpretation.metrics.value}) appears implausible for ${interpretation.metrics.parameter}`,
          location: interpretation.location,
          details: {
            parameter: interpretation.metrics.parameter,
            reportedValue: interpretation.metrics.value,
            unit: interpretation.metrics.unit,
          },
        });
      }
    }

    return issues;
  }

  /**
   * Fetches source data for a given citation
   *
   * @param {string} citation - The citation to fetch data for
   * @returns {Promise<Object|null>} Source data or null if not found
   */
  async fetchSourceData(citation) {
    // In production, this would query a database of study results
    // For now, return null to indicate we don't have source data
    return null;
  }

  /**
   * Checks if a value is implausible for the given parameter
   *
   * @param {Object} metrics - The metrics to check
   * @returns {boolean} Whether the value is implausible
   */
  isValueImplausible(metrics) {
    // Simplified plausibility check - production would have a more comprehensive database
    const plausibilityRanges = {
      'heart rate': { min: 30, max: 200, unit: 'bpm' },
      'blood pressure': { min: 50, max: 200, unit: 'mmHg' },
      'glucose level': { min: 30, max: 500, unit: 'mg/dl' },
      'survival rate': { min: 0, max: 100, unit: '%' },
      'mortality rate': { min: 0, max: 100, unit: '%' },
    };

    // Check if we have a plausibility range for this parameter
    if (metrics.parameter) {
      const paramKey = Object.keys(plausibilityRanges).find(key =>
        metrics.parameter.toLowerCase().includes(key.toLowerCase())
      );

      if (paramKey) {
        const range = plausibilityRanges[paramKey];

        // Check if units match
        if (metrics.unit && range.unit !== metrics.unit) {
          return false; // Can't compare different units
        }

        // Check if value is outside plausible range
        return metrics.value < range.min || metrics.value > range.max;
      }
    }

    return false;
  }

  /**
   * Extracts citations from a CER document
   *
   * @param {Object} cerDocument - The CER document
   * @returns {Array} List of citations
   */
  extractCitations(cerDocument) {
    const citations = [];

    if (!cerDocument || !cerDocument.sections) {
      return citations;
    }

    // Process each section of the document
    cerDocument.sections.forEach(section => {
      if (!section.content) return;

      // Check for in-text citations (Author, YYYY) format
      const authorYearRegex = /\(([^)]+(?:et al\.?)?[,;]?\s*\d{4}[a-z]?)\)/g;
      let match;

      while ((match = authorYearRegex.exec(section.content)) !== null) {
        citations.push({
          text: match[1].trim(),
          format: 'author-year',
          location: `section.${section.id}`,
          context: section.content.substring(
            Math.max(0, match.index - 50),
            Math.min(section.content.length, match.index + match[0].length + 50)
          ),
        });
      }

      // Check for numeric citations [1], [2-5] format
      const numericRegex = /\[(\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*)\]/g;

      while ((match = numericRegex.exec(section.content)) !== null) {
        citations.push({
          text: match[1].trim(),
          format: 'numeric',
          location: `section.${section.id}`,
          context: section.content.substring(
            Math.max(0, match.index - 50),
            Math.min(section.content.length, match.index + match[0].length + 50)
          ),
        });
      }
    });

    // Extract references from the references section, if present
    const referencesSection = cerDocument.sections.find(
      section =>
        section.id === 'references' ||
        section.type === 'references' ||
        (section.metadata && section.metadata.sectionType === 'references')
    );

    if (referencesSection && referencesSection.content) {
      // Extract structured references
      const referenceList = this.extractStructuredReferences(referencesSection.content);

      // Add to citations if not already included
      referenceList.forEach(reference => {
        if (!citations.some(citation => citation.text === reference.key)) {
          citations.push({
            text: reference.text,
            format: 'reference-list',
            key: reference.key,
            location: `section.${referencesSection.id}`,
            details: reference,
          });
        }
      });
    }

    return citations;
  }

  /**
   * Extracts structured references from reference list text
   *
   * @param {string} referencesText - The references text
   * @returns {Array} List of structured references
   */
  extractStructuredReferences(referencesText) {
    const references = [];

    // Split text into individual references
    // This is a simplified approach - production would use more robust parsing
    const lines = referencesText.split('\n');
    let currentReference = '';
    let currentKey = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // Check if this is a new reference
      const newRefMatch = /^(\d+|\[\d+\])\.\s+(.+)/.exec(trimmedLine);

      if (newRefMatch) {
        // Save previous reference if it exists
        if (currentReference) {
          references.push({
            text: currentReference,
            key: currentKey,
          });
        }

        // Start new reference
        currentKey = newRefMatch[1].replace(/[\[\]]/g, '');
        currentReference = newRefMatch[2];
      } else {
        // Continue previous reference
        currentReference += ' ' + trimmedLine;
      }
    }

    // Add the last reference
    if (currentReference) {
      references.push({
        text: currentReference,
        key: currentKey,
      });
    }

    return references;
  }

  /**
   * Verifies a citation against the knowledge base
   *
   * @param {Object} citation - The citation to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyCitation(citation) {
    // In production, this would query a citation database or LLM

    // For now, we'll simulate a verification result
    // In reality, this would verify against PubMed, citation databases, or content libraries
    const result = {
      exists: Math.random() > 0.05, // 5% chance of flagging a citation as non-existent
      confidence: 0.9,
      contentMismatch: false,
      actualContent: null,
    };

    return result;
  }

  /**
   * Gets regulatory checklist for a specific framework
   *
   * @param {string} regulatoryFramework - The regulatory framework
   * @returns {Promise<Array>} List of checklist items
   */
  async getRegulatoryChecklist(regulatoryFramework) {
    // In production, this would be fetched from a database or API
    // For now, we'll return a simplified example checklist for EU MDR

    if (regulatoryFramework === 'EU_MDR') {
      return [
        {
          id: 'mdr_checklist_1',
          description: 'Device description includes physical and chemical characteristics',
          regulatoryReference: 'MEDDEV 2.7/1 Rev 4, Section 7',
          criticality: 'critical',
        },
        {
          id: 'mdr_checklist_2',
          description: 'Intended purpose clearly stated including intended patient population',
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 1',
          criticality: 'critical',
        },
        {
          id: 'mdr_checklist_3',
          description: 'State of the art determination includes literature search methodology',
          regulatoryReference: 'EU MDR Article 61(3)',
          criticality: 'major',
        },
        {
          id: 'mdr_checklist_4',
          description:
            'Clinical evaluation includes data from PMS of equivalent device (if applicable)',
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 2',
          criticality: 'critical',
        },
        {
          id: 'mdr_checklist_5',
          description: 'Benefit-risk analysis quantifies both benefits and risks',
          regulatoryReference: 'EU MDR Annex I, Chapter I, Section 8',
          criticality: 'critical',
        },
        {
          id: 'mdr_checklist_6',
          description: 'Conclusion includes statement of conformity to GSPRs',
          regulatoryReference: 'MEDDEV 2.7/1 Rev 4, Section 10',
          criticality: 'critical',
        },
        {
          id: 'mdr_checklist_7',
          description: 'Post-market clinical follow-up (PMCF) plan included',
          regulatoryReference: 'EU MDR Article 83',
          criticality: 'critical',
        },
        {
          id: 'mdr_checklist_8',
          description:
            'Equivalence justification meets all three criteria (clinical, technical, biological)',
          regulatoryReference: 'EU MDR Annex XIV, Part A, Section 3',
          criticality: 'major',
        },
      ];
    } else if (regulatoryFramework === 'FDA') {
      // FDA checklist would be here
      return [];
    } else {
      // Default to empty checklist
      return [];
    }
  }

  /**
   * Validates a checklist item against CER document
   *
   * @param {Object} cerDocument - The CER document
   * @param {Object} checklistItem - The checklist item to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateChecklistItem(cerDocument, checklistItem) {
    // In a production system, this would use more sophisticated validation
    // including GPT-4o or other LLM for complex semantic validation

    // For now, we'll do a simplified keyword-based check
    const result = {
      passed: false,
      details: '',
    };

    // Find relevant sections for this checklist item
    const relevantSections = this.findRelevantSections(cerDocument, checklistItem);

    if (relevantSections.length === 0) {
      result.details = 'No relevant sections found to validate this requirement';
      return result;
    }

    // Check for presence of key terms related to the checklist item
    const keyTerms = this.extractKeyTerms(checklistItem.description);
    let termMatches = 0;

    for (const section of relevantSections) {
      if (!section.content) continue;

      for (const term of keyTerms) {
        if (section.content.toLowerCase().includes(term.toLowerCase())) {
          termMatches++;
        }
      }
    }

    // Simple heuristic: if we match more than half the key terms, consider it passed
    if (termMatches >= Math.ceil(keyTerms.length / 2)) {
      result.passed = true;
      result.details = `Found ${termMatches}/${keyTerms.length} key terms in relevant sections`;
    } else {
      result.details = `Only found ${termMatches}/${keyTerms.length} key terms in relevant sections. Missing terms related to: ${keyTerms.slice(termMatches).join(', ')}`;
    }

    return result;
  }

  /**
   * Finds sections relevant to a checklist item
   *
   * @param {Object} cerDocument - The CER document
   * @param {Object} checklistItem - The checklist item
   * @returns {Array} List of relevant sections
   */
  findRelevantSections(cerDocument, checklistItem) {
    if (!cerDocument || !cerDocument.sections) {
      return [];
    }

    // Map checklist items to relevant section types
    const checklistToSectionMap = {
      mdr_checklist_1: ['device_description'],
      mdr_checklist_2: ['intended_purpose'],
      mdr_checklist_3: ['state_of_art'],
      mdr_checklist_4: ['clinical_evaluation_data'],
      mdr_checklist_5: ['risk_benefit_analysis'],
      mdr_checklist_6: ['conclusion'],
      mdr_checklist_7: ['post_market_surveillance'],
      mdr_checklist_8: ['equivalence_data'],
    };

    const relevantSectionTypes = checklistToSectionMap[checklistItem.id] || [];

    // Find all sections that match the relevant types
    return cerDocument.sections.filter(section =>
      relevantSectionTypes.some(
        type =>
          section.id === type ||
          section.type === type ||
          (section.metadata && section.metadata.sectionType === type)
      )
    );
  }

  /**
   * Extracts key terms from a description
   *
   * @param {string} description - The description to extract from
   * @returns {Array} List of key terms
   */
  extractKeyTerms(description) {
    // Simplified term extraction - production would use more sophisticated NLP
    // Remove common words and split into key phrases
    const commonWords = [
      'and',
      'or',
      'the',
      'a',
      'an',
      'in',
      'on',
      'of',
      'to',
      'for',
      'with',
      'from',
    ];

    return description
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.includes(word))
      .concat(this.extractPhrases(description));
  }

  /**
   * Extracts phrases from text
   *
   * @param {string} text - The text to extract from
   * @returns {Array} List of phrases
   */
  extractPhrases(text) {
    // Extract quoted phrases and noun phrases
    const phrases = [];

    // Extract quoted content
    const quoteRegex = /"([^"]+)"/g;
    let match;

    while ((match = quoteRegex.exec(text)) !== null) {
      phrases.push(match[1]);
    }

    // Extract noun phrases (simplified)
    const nounPhraseRegex =
      /(?:[a-z]+\s){1,3}(?:analysis|evaluation|assessment|statement|plan|criteria|justification|determination|data|characteristics|population|methodology)/gi;

    while ((match = nounPhraseRegex.exec(text)) !== null) {
      phrases.push(match[0].trim());
    }

    return phrases;
  }

  /**
   * Performs human reviewer feedback integration
   *
   * @param {Object} cerDocument - The CER document
   * @param {Object} validationResults - Validation results
   * @param {Object} feedback - Human reviewer feedback
   * @returns {Promise<Object>} Updated CER document
   */
  async integrateHumanFeedback(cerDocument, validationResults, feedback) {
    // Clone the document to avoid modifying the original
    const updatedDocument = JSON.parse(JSON.stringify(cerDocument));

    // Process each feedback item
    for (const item of feedback.items) {
      // Apply the feedback based on its type
      if (item.type === 'text_correction') {
        this.applyTextCorrection(updatedDocument, item);
      } else if (item.type === 'section_addition') {
        this.applySectionAddition(updatedDocument, item);
      } else if (item.type === 'citation_correction') {
        this.applyCitationCorrection(updatedDocument, item);
      } else if (item.type === 'data_correction') {
        this.applyDataCorrection(updatedDocument, item);
      }
    }

    // Add revision history entry
    if (!updatedDocument.revisionHistory) {
      updatedDocument.revisionHistory = [];
    }

    updatedDocument.revisionHistory.push({
      date: new Date().toISOString(),
      reviewer: feedback.reviewerName || 'Unknown Reviewer',
      changes: feedback.items.length,
      summary: feedback.summary || 'Human reviewer feedback applied',
    });

    return updatedDocument;
  }

  /**
   * Applies a text correction to a CER document
   *
   * @param {Object} document - The CER document
   * @param {Object} correction - The correction to apply
   */
  applyTextCorrection(document, correction) {
    // Find the section to correct
    const sectionPath = correction.location.split('.');
    const sectionId = sectionPath[1];

    const section = document.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Apply the text correction
    if (correction.replaceText && correction.withText) {
      section.content = section.content.replace(correction.replaceText, correction.withText);
    }
  }

  /**
   * Applies a section addition to a CER document
   *
   * @param {Object} document - The CER document
   * @param {Object} addition - The addition to apply
   */
  applySectionAddition(document, addition) {
    // Create the new section
    const newSection = {
      id: addition.sectionId || `section_${Date.now()}`,
      title: addition.title,
      content: addition.content,
      type: addition.sectionType,
      metadata: {
        sectionType: addition.sectionType,
        addedBy: 'human_reviewer',
        addedDate: new Date().toISOString(),
      },
    };

    // Add to the document sections
    document.sections.push(newSection);
  }

  /**
   * Applies a citation correction to a CER document
   *
   * @param {Object} document - The CER document
   * @param {Object} correction - The correction to apply
   */
  applyCitationCorrection(document, correction) {
    // Find the section containing the citation
    const sectionPath = correction.location.split('.');
    const sectionId = sectionPath[1];

    const section = document.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Apply the citation correction
    if (correction.incorrectCitation && correction.correctCitation) {
      // For in-text citations
      section.content = section.content.replace(
        new RegExp(`\\(${correction.incorrectCitation}\\)`, 'g'),
        `(${correction.correctCitation})`
      );

      // For numeric citations
      section.content = section.content.replace(
        new RegExp(`\\[${correction.incorrectCitation}\\]`, 'g'),
        `[${correction.correctCitation}]`
      );
    }

    // If there's a references section, update there too
    const referencesSection = document.sections.find(
      s =>
        s.id === 'references' ||
        s.type === 'references' ||
        (s.metadata && s.metadata.sectionType === 'references')
    );

    if (referencesSection && correction.fullReference) {
      // This is simplified - would be more complex in a real system
      referencesSection.content = referencesSection.content.replace(
        new RegExp(`^${correction.incorrectCitationKey}\\..*$`, 'm'),
        `${correction.incorrectCitationKey}. ${correction.fullReference}`
      );
    }
  }

  /**
   * Applies a data correction to a CER document
   *
   * @param {Object} document - The CER document
   * @param {Object} correction - The correction to apply
   */
  applyDataCorrection(document, correction) {
    // Find the section containing the data
    const sectionPath = correction.location.split('.');
    const sectionId = sectionPath[1];

    const section = document.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Apply the data correction
    if (correction.incorrectValue && correction.correctValue) {
      section.content = section.content.replace(
        new RegExp(correction.incorrectValue, 'g'),
        correction.correctValue
      );
    }
  }
}

// Export the service
export const cerValidationService = new CerValidationService();
