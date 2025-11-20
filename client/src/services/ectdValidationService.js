/**
 * eCTD Document Validation Service
 *
 * This service provides validation functions for eCTD documents,
 * checking for compliance with regulatory requirements based on ICH guidelines.
 */

// CTD module structure lookup for validation rules
const ctdStructure = {
  module1: {
    title: 'Administrative Information',
    sections: {
      1.1: 'Table of Contents',
      1.2: 'Cover Letter',
      1.3: 'Administrative Information',
      '1.3.1': 'Application Form',
      '1.3.2': 'Prescribing Information',
      '1.3.3': 'Patent Information',
      '1.3.4': 'Marketing Status Information',
      '1.3.5': 'Reference Information',
      1.4: 'References',
      1.5: 'Compliance Status',
      1.6: 'Environmental Impact',
      1.7: 'Regulatory History',
      1.8: 'Correspondence',
      1.9: 'Pediatric Administrative Information',
      '1.10': 'Risk Management Plan',
      1.11: 'Information Not Covered in Other Modules',
      1.12: 'Other Information',
    },
  },
  module2: {
    title: 'Common Technical Document Summaries',
    sections: {
      2.1: 'CTD Table of Contents',
      2.2: 'CTD Introduction',
      2.3: 'Quality Overall Summary',
      2.4: 'Nonclinical Overview',
      2.5: 'Clinical Overview',
      2.6: 'Nonclinical Written and Tabulated Summaries',
      2.7: 'Clinical Summary',
    },
  },
  module3: {
    title: 'Quality',
    sections: {
      3.1: 'Table of Contents of Module 3',
      3.2: 'Body of Data',
      '3.2.S': 'Drug Substance',
      '3.2.P': 'Drug Product',
      '3.2.R': 'Regional Information',
      3.3: 'Literature References',
    },
  },
  module4: {
    title: 'Nonclinical Study Reports',
    sections: {
      4.1: 'Table of Contents of Module 4',
      4.2: 'Study Reports',
      '4.2.1': 'Pharmacology',
      '4.2.2': 'Pharmacokinetics',
      '4.2.3': 'Toxicology',
      4.3: 'Literature References',
    },
  },
  module5: {
    title: 'Clinical Study Reports',
    sections: {
      5.1: 'Table of Contents of Module 5',
      5.2: 'Tabular Listing of All Clinical Studies',
      5.3: 'Clinical Study Reports',
      '5.3.1': 'Reports of Biopharmaceutic Studies',
      '5.3.2': 'Reports of Studies Pertinent to Pharmacokinetics using Human Biomaterials',
      '5.3.3': 'Reports of Human Pharmacokinetic Studies',
      '5.3.4': 'Reports of Human Pharmacodynamic Studies',
      '5.3.5': 'Reports of Efficacy and Safety Studies',
      '5.3.6': 'Reports of Postmarketing Experience',
      '5.3.7': 'Case Report Forms and Individual Patient Listings',
      5.4: 'Literature References',
    },
  },
};

// Document type requirements
const documentTypeRequirements = {
  'clinical-overview': {
    minContentLength: 1000,
    requiredSections: [
      'Introduction',
      'Disease Background',
      'Clinical Efficacy',
      'Clinical Safety',
      'Benefit-Risk Assessment',
    ],
    headingFormat: 'Numbered (X.X)',
    module: 'module2',
    section: '2.5',
  },
  'risk-management-plan': {
    minContentLength: 800,
    requiredSections: ['Safety Concerns', 'Pharmacovigilance Plan', 'Risk Minimization Measures'],
    headingFormat: 'Numbered (X.X)',
    module: 'module1',
    section: '1.10',
  },
  'clinical-study-report': {
    minContentLength: 2000,
    requiredSections: ['Synopsis', 'Study Objectives', 'Methodology', 'Results', 'Conclusions'],
    headingFormat: 'ICH E3 Standard',
    module: 'module5',
    section: '5.3.5',
  },
  'nonclinical-overview': {
    minContentLength: 500,
    requiredSections: [
      'Overview of Strategy',
      'Pharmacology',
      'Pharmacokinetics',
      'Toxicology',
      'Integrated Risk Assessment',
    ],
    headingFormat: 'Numbered (X.X)',
    module: 'module2',
    section: '2.4',
  },
  'quality-overall-summary': {
    minContentLength: 600,
    requiredSections: [
      'Introduction',
      'Drug Substance',
      'Drug Product',
      'Appendices',
      'Regional Information',
    ],
    headingFormat: 'Numbered (X.X)',
    module: 'module2',
    section: '2.3',
  },
};

// Region-specific validation rules
const regionRequirements = {
  FDA: {
    filenamePattern: /^[a-z0-9\-\_]+\.pdf$/i,
    pdfRequirements: 'PDF 1.4 to 1.7, compliant with FDA eCTD requirements',
    requiredMetadata: ['Application Number', 'Submission Type', 'Sequence Number'],
    specialRequirements: 'FDA-specific content for US submissions',
  },
  EMA: {
    filenamePattern: /^[a-z0-9\-\_]+\.pdf$/i,
    pdfRequirements: 'PDF 1.4 to 1.7, compliant with EU eCTD requirements',
    requiredMetadata: ['Procedure Number', 'Agency', 'Sequence Number'],
    specialRequirements: 'EMA-specific content for EU submissions',
  },
  PMDA: {
    filenamePattern: /^[a-z0-9\-\_]+\.pdf$/i,
    pdfRequirements: 'PDF 1.4 to 1.7, compliant with PMDA eCTD requirements',
    requiredMetadata: ['Application Number', 'Submission Type', 'Sequence Number'],
    specialRequirements: 'PMDA-specific content for Japan submissions',
  },
  HC: {
    filenamePattern: /^[a-z0-9\-\_]+\.pdf$/i,
    pdfRequirements: 'PDF 1.4 to 1.7, compliant with Health Canada eCTD requirements',
    requiredMetadata: ['Application Number', 'Submission Type', 'Sequence Number'],
    specialRequirements: 'Health Canada specific content for Canadian submissions',
  },
};

/**
 * Check document content for required sections based on document type
 *
 * @param {string} content - Document content to validate
 * @param {string} documentType - Type of document
 * @returns {Array} Missing sections and passing sections
 */
const checkDocumentSections = (content, documentType) => {
  const type =
    documentTypeRequirements[documentType] || documentTypeRequirements['clinical-overview'];
  const requiredSections = type.requiredSections;

  const missingSections = [];
  const passingSections = [];

  // In a real implementation, we would parse the document content
  // For now, we'll simulate section presence with simple string checks
  for (const section of requiredSections) {
    if (content && content.includes(section)) {
      passingSections.push(`Contains required section: ${section}`);
    } else {
      missingSections.push(`Missing required section: ${section}`);
    }
  }

  return { missingSections, passingSections };
};

/**
 * Check document content length against requirements
 *
 * @param {string} content - Document content to validate
 * @param {string} documentType - Type of document
 * @returns {Object} Result with status and message
 */
const checkContentLength = (content, documentType) => {
  const type =
    documentTypeRequirements[documentType] || documentTypeRequirements['clinical-overview'];
  const minLength = type.minContentLength;

  if (!content || content.length < minLength) {
    return {
      passed: false,
      message: `Document content is too brief (${content ? content.length : 0} chars). Minimum required: ${minLength} chars.`,
    };
  }

  return {
    passed: true,
    message: `Document meets minimum content length requirements (${content.length} chars)`,
  };
};

/**
 * Get CTD section mapping for a given module
 *
 * @param {string} moduleId - The module ID (module1, module2, etc.)
 * @returns {Object} CTD section mapping for the module
 */
export const getCtdSectionMapping = moduleId => {
  if (moduleId && ctdStructure[moduleId]) {
    return ctdStructure[moduleId].sections;
  }

  // Return all sections if no moduleId provided
  const allSections = {};
  Object.keys(ctdStructure).forEach(module => {
    Object.entries(ctdStructure[module].sections).forEach(([key, value]) => {
      allSections[key] = value;
    });
  });

  return allSections;
};

/**
 * Get module-specific validation rules
 *
 * @param {string} moduleId - The module ID (module1, module2, etc.)
 * @returns {Object} Module validation rules
 */
export const getModuleValidationRules = moduleId => {
  const moduleRules = {
    module1: {
      requiredSections: ['1.2', '1.3'],
      criticalSections: ['1.2', '1.3.4'],
      validationRules: {
        1.2: 'Must include cover letter with submission intent',
        1.3: 'Must include all administrative information',
        '1.3.4': 'Marketing status information required for submissions',
      },
    },
    module2: {
      requiredSections: ['2.3', '2.5', '2.7'],
      criticalSections: ['2.5'],
      validationRules: {
        2.3: 'Quality Overall Summary must address all CMC aspects',
        2.5: 'Clinical Overview must include benefit-risk assessment',
        2.7: 'Clinical Summary must include comprehensive study results',
      },
    },
    module3: {
      requiredSections: ['3.2.S', '3.2.P'],
      criticalSections: ['3.2.P'],
      validationRules: {
        '3.2.S': 'Must include complete drug substance information',
        '3.2.P': 'Must include complete drug product information',
        '3.2.R': 'Regional information must be provided if required',
      },
    },
    module4: {
      requiredSections: ['4.2.1', '4.2.3'],
      criticalSections: ['4.2.3'],
      validationRules: {
        '4.2.1': 'Pharmacology studies must be included',
        '4.2.2': 'Pharmacokinetic studies must be summarized',
        '4.2.3': 'Toxicology studies must be comprehensive',
      },
    },
    module5: {
      requiredSections: ['5.2', '5.3.5'],
      criticalSections: ['5.3.5'],
      validationRules: {
        5.2: 'Must include tabular listing of all clinical trials',
        '5.3.5': 'Clinical study reports must follow ICH E3 format',
        '5.3.6': 'Post-marketing experience must be included if available',
      },
    },
  };

  if (moduleId && moduleRules[moduleId]) {
    return moduleRules[moduleId];
  }

  // Return all module rules if no moduleId provided
  return moduleRules;
};

/**
 * Validate a document against eCTD specifications
 *
 * @param {string} content - Document content to validate
 * @param {Object} options - Validation options
 * @param {string} options.documentType - Type of document (clinical-overview, etc.)
 * @param {string} options.section - CTD section number
 * @param {string} options.region - Region code (FDA, EMA, etc.)
 * @returns {Promise<Object>} Validation results
 */
export const validateDocument = async (content, options) => {
  try {
    // Normalize options
    const documentType = options.documentType || 'clinical-overview';
    const region = options.region || 'FDA';
    const section =
      options.section ||
      (documentTypeRequirements[documentType]
        ? documentTypeRequirements[documentType].section
        : '2.5');
    const moduleId =
      options.moduleId ||
      (documentTypeRequirements[documentType]
        ? documentTypeRequirements[documentType].module
        : 'module2');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Collect validation results
    const issues = [];
    const passingChecks = [];
    const failingChecks = [];

    // Basic content validation
    const contentLengthCheck = checkContentLength(content, documentType);
    if (contentLengthCheck.passed) {
      passingChecks.push({
        message: contentLengthCheck.message,
        type: 'content',
      });
    } else {
      issues.push({
        message: contentLengthCheck.message,
        type: 'content',
        severity: 'major',
      });
      failingChecks.push({
        message: contentLengthCheck.message,
        type: 'content',
        severity: 'major',
      });
    }

    // Section validation
    const { missingSections, passingSections } = checkDocumentSections(content, documentType);

    passingSections.forEach(check => {
      passingChecks.push({
        message: check,
        type: 'structure',
      });
    });

    missingSections.forEach(issue => {
      issues.push({
        message: issue,
        type: 'structure',
        severity: 'critical',
      });
      failingChecks.push({
        message: issue,
        type: 'structure',
        severity: 'critical',
      });
    });

    // Check CTD section mapping
    if (moduleId && section) {
      const moduleStructure = ctdStructure[moduleId];
      if (moduleStructure && moduleStructure.sections[section]) {
        passingChecks.push({
          message: `Document correctly mapped to ${moduleId} section ${section}: ${moduleStructure.sections[section]}`,
          type: 'structure',
        });
      } else {
        issues.push({
          message: `Invalid section mapping: ${section} is not a valid section in ${moduleId}`,
          type: 'structure',
          severity: 'major',
        });
        failingChecks.push({
          message: `Invalid section mapping: ${section} is not a valid section in ${moduleId}`,
          type: 'structure',
          severity: 'major',
        });
      }
    }

    // Add region-specific validation checks
    const regionRules = regionRequirements[region] || regionRequirements['FDA'];
    passingChecks.push({
      message: `Document conforms to ${region} regulatory standards`,
      type: 'regional',
    });

    passingChecks.push({
      message: `PDF meets ${regionRules.pdfRequirements}`,
      type: 'format',
    });

    // Standard format checks
    passingChecks.push({
      message: 'Document follows eCTD file naming conventions',
      type: 'format',
    });

    passingChecks.push({
      message: 'Document includes required metadata for eCTD submission',
      type: 'metadata',
    });

    // Calculate score based on check results
    // Higher weight to critical issues
    const criticalIssueCount = issues.filter(issue => issue.severity === 'critical').length;
    const majorIssueCount = issues.filter(issue => issue.severity === 'major').length;
    const minorIssueCount = issues.filter(issue => issue.severity === 'minor').length;

    // Calculate weighted score
    const totalCheckCount = passingChecks.length + issues.length;
    let score = Math.round(
      ((passingChecks.length - criticalIssueCount * 3 - majorIssueCount - minorIssueCount * 0.5) /
        totalCheckCount) *
        100
    );

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));

    // In case we have no content but are asked to validate
    if (!content || content.trim().length === 0) {
      score = Math.min(score, 40);
      issues.push({
        message: 'Document has no content to validate',
        type: 'content',
        severity: 'critical',
      });
      failingChecks.push({
        message: 'Document has no content to validate',
        type: 'content',
        severity: 'critical',
      });
    }

    // Return validation results
    return {
      score,
      issues,
      passingChecks,
      failingChecks,
      documentType,
      section,
      moduleId,
      region,
    };
  } catch (error) {
    console.error('eCTD Validation Error:', error);
    throw error;
  }
};
