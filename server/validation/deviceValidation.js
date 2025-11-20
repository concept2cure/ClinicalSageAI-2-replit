// Validation Rules for Medical Device Documents

// Check if document contains a specific heading
const hasHeading = (doc, needle) => {
  const docStr = typeof doc === 'string' ? doc : JSON.stringify(doc);
  return docStr.toLowerCase().includes(needle.toLowerCase());
};

// Check if document section has content
const hasContent = (doc, section) => {
  const docStr = typeof doc === 'string' ? doc : JSON.stringify(doc);
  const sectionRegex = new RegExp(`${section}[\\s\\S]{10,}`, 'i');
  return sectionRegex.test(docStr);
};

// Validate document based on type
function validateByDocType(docType, doc) {
  const issues = [];

  if (docType === 'cerv2_510k') {
    // FDA 510(k) Requirements
    if (!hasHeading(doc, 'Indications for Use')) {
      issues.push({
        section: 'Indications for Use',
        message: 'Required section missing. FDA requires clear indications for use statement.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Substantial Equivalence')) {
      issues.push({
        section: 'Substantial Equivalence Discussion',
        message: 'Required section missing. Must demonstrate SE to predicate device.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Predicate')) {
      issues.push({
        section: 'Predicate Devices',
        message: 'At least one predicate device must be identified with K number.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Device Description')) {
      issues.push({
        section: 'Device Description',
        message: 'Required section missing. Must provide comprehensive device description.',
        severity: 'error'
      });
    }

    if (!hasContent(doc, 'Performance Testing')) {
      issues.push({
        section: 'Performance Testing',
        message: 'Consider adding bench testing or clinical data if applicable.',
        severity: 'warning'
      });
    }

    if (!hasContent(doc, 'Labeling')) {
      issues.push({
        section: 'Proposed Labeling',
        message: 'Draft labeling should be included for FDA review.',
        severity: 'warning'
      });
    }
  }

  if (docType === 'cerv2_pma') {
    // FDA PMA Requirements
    if (!hasHeading(doc, 'Clinical Investigations')) {
      issues.push({
        section: 'Clinical Investigations',
        message: 'PMA requires comprehensive clinical evidence with pivotal study data.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Nonclinical Laboratory Studies')) {
      issues.push({
        section: 'Nonclinical Laboratory Studies',
        message: 'Required section missing. Must include biocompatibility and bench testing.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Manufacturing')) {
      issues.push({
        section: 'Manufacturing and Quality Systems',
        message: 'QSR compliance and manufacturing information required.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Risk')) {
      issues.push({
        section: 'Risk/Benefit Determination',
        message: 'Must demonstrate that benefits outweigh risks.',
        severity: 'error'
      });
    }

    if (!hasContent(doc, 'Post-Approval')) {
      issues.push({
        section: 'Post-Approval Study',
        message: 'Consider if post-approval studies are needed.',
        severity: 'info'
      });
    }
  }

  if (docType === 'cerv2_cer') {
    // EU MDR CER Requirements
    if (!hasHeading(doc, 'State of the Art')) {
      issues.push({
        section: 'State of the Art',
        message: 'MDR Annex XIV requires SOTA analysis. This section is mandatory.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Clinical Data Set')) {
      issues.push({
        section: 'Clinical Data Set',
        message: 'Must include systematic literature review and clinical data.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Critical Appraisal')) {
      issues.push({
        section: 'Critical Appraisal & Weighting',
        message: 'Required per MEDDEV 2.7/1. Must appraise data quality and relevance.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'Benefit') && !hasHeading(doc, 'Risk')) {
      issues.push({
        section: 'Benefit–Risk Determination',
        message: 'MDR requires demonstration of positive benefit-risk profile.',
        severity: 'error'
      });
    }

    if (!hasHeading(doc, 'GSPR')) {
      issues.push({
        section: 'GSPR Mapping',
        message: 'Should map device to relevant GSPRs from MDR Annex I.',
        severity: 'warning'
      });
    }

    if (!hasContent(doc, 'PMCF') && !hasContent(doc, 'PMS')) {
      issues.push({
        section: 'PMS Plan / PMCF',
        message: 'Post-market surveillance plan recommended per MDR Article 84.',
        severity: 'warning'
      });
    }
  }

  // Common quality checks for all document types
  const wordCount = (typeof doc === 'string' ? doc : JSON.stringify(doc)).split(/\s+/).length;
  
  if (wordCount < 500) {
    issues.push({
      section: 'Overall Document',
      message: `Document appears incomplete (${wordCount} words). Regulatory submissions typically require comprehensive documentation.`,
      severity: 'warning'
    });
  }

  // Check for placeholder text
  if (hasHeading(doc, '<') && hasHeading(doc, '>')) {
    issues.push({
      section: 'Document Content',
      message: 'Document contains placeholder text that needs to be replaced.',
      severity: 'warning'
    });
  }

  return issues;
}

// Validate completeness percentage
function getCompleteness(docType, doc) {
  const issues = validateByDocType(docType, doc);
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  
  // Calculate completeness based on errors and warnings
  let completeness = 100;
  completeness -= errorCount * 15; // Each error reduces 15%
  completeness -= warningCount * 5; // Each warning reduces 5%
  
  return Math.max(0, Math.min(100, completeness));
}

// Get validation summary
function getValidationSummary(docType, doc) {
  const issues = validateByDocType(docType, doc);
  const completeness = getCompleteness(docType, doc);
  
  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    completeness: completeness,
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
    info: issues.filter(i => i.severity === 'info'),
    totalIssues: issues.length,
    summary: completeness >= 80 ? 'Ready for review' : 
             completeness >= 60 ? 'In progress' : 
             'Needs significant work'
  };
}

module.exports = {
  validateByDocType,
  getCompleteness,
  getValidationSummary,
  hasHeading,
  hasContent
};