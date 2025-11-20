// Device Document Validation Functions

import { DOC_TYPES } from '../../shared/docTypes.js';

// Validate document content by type
export function validateByDocType(docType, content) {
  const errors = [];
  const warnings = [];
  
  if (!content || content.length < 100) {
    errors.push('Document content is too short (minimum 100 characters required)');
  }
  
  // Check for required sections based on document type
  const docConfig = DOC_TYPES[docType];
  if (docConfig && docConfig.sections) {
    docConfig.sections.forEach(section => {
      if (section.required) {
        const sectionPattern = new RegExp(section.title, 'i');
        if (!sectionPattern.test(content)) {
          warnings.push(`Required section missing: ${section.title}`);
        }
      }
    });
  }
  
  // Check for placeholder text
  const placeholders = ['[PLACEHOLDER]', '[TODO]', '[INSERT', '[PENDING]', 'TBD', '<Populate'];
  placeholders.forEach(placeholder => {
    if (content.includes(placeholder)) {
      warnings.push(`Found placeholder text: ${placeholder}`);
    }
  });
  
  // Document-type specific validations
  switch(docType) {
    case 'cerv2_510k':
      if (!content.toLowerCase().includes('substantial equivalence')) {
        warnings.push('510(k) documents should include substantial equivalence discussion');
      }
      if (!content.toLowerCase().includes('predicate')) {
        warnings.push('510(k) documents should reference predicate device(s)');
      }
      break;
      
    case 'cerv2_pma':
      if (!content.toLowerCase().includes('clinical')) {
        warnings.push('PMA documents typically include clinical investigation data');
      }
      if (!content.toLowerCase().includes('safety')) {
        warnings.push('PMA documents should include safety and effectiveness data');
      }
      break;
      
    case 'cerv2_cer':
      if (!content.toLowerCase().includes('clinical evaluation')) {
        warnings.push('CER documents must include clinical evaluation');
      }
      if (!content.toLowerCase().includes('risk') || !content.toLowerCase().includes('benefit')) {
        warnings.push('CER documents should include risk-benefit analysis');
      }
      if (!content.toLowerCase().includes('meddev')) {
        warnings.push('CER documents typically reference MEDDEV guidelines');
      }
      break;
  }
  
  return { errors, warnings };
}

// Get validation summary
export function getValidationSummary(docType, content) {
  const { errors, warnings } = validateByDocType(docType, content);
  
  const score = Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5));
  const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'success';
  
  return {
    docType,
    status,
    score,
    errors,
    warnings,
    timestamp: new Date().toISOString()
  };
}

// Check document completeness
export function checkDocumentCompleteness(docType, content) {
  const docConfig = DOC_TYPES[docType];
  if (!docConfig || !docConfig.sections) {
    return { complete: false, missing: [], percentage: 0 };
  }
  
  const totalSections = docConfig.sections.length;
  const foundSections = [];
  const missingSections = [];
  
  docConfig.sections.forEach(section => {
    const sectionPattern = new RegExp(section.title, 'i');
    if (sectionPattern.test(content)) {
      foundSections.push(section.title);
    } else {
      missingSections.push(section.title);
    }
  });
  
  const percentage = Math.round((foundSections.length / totalSections) * 100);
  
  return {
    complete: missingSections.length === 0,
    found: foundSections,
    missing: missingSections,
    percentage,
    totalSections,
    foundCount: foundSections.length
  };
}