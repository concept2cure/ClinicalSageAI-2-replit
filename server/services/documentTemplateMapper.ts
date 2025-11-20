/**
 * Document Template Mapper Service
 * 
 * Maps 510(k) workflow data to FDA eSTAR template sections
 * Ensures data flows intelligently to correct template locations
 */

import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('DocumentTemplateMapper');

// FDA eSTAR 510(k) Template Structure
const ESTAR_TEMPLATE_MAPPING = {
  // Administrative Information (FDA Form 3514)
  'FDA_3514': {
    templateSection: 'administrative.form3514',
    fields: {
      'applicantName': 'workflow.applicantName',
      'contactName': 'workflow.contactName',
      'contactEmail': 'workflow.contactEmail',
      'contactPhone': 'workflow.contactPhone',
      'dunsNumber': 'workflow.dunsNumber',
      'establishmentNumber': 'workflow.establishmentNumber',
      'submissionDate': 'workflow.metadata.submissionDate',
      'correspondenceEmail': 'workflow.correspondenceEmail'
    }
  },

  // Premarket Review Information (FDA Form 3601)
  'FDA_3601': {
    templateSection: 'administrative.form3601',
    fields: {
      'deviceName': 'workflow.deviceName',
      'commonName': 'workflow.deviceCommonName',
      'classificationName': 'workflow.classificationName',
      'productCode': 'workflow.productCode',
      'regulationNumber': 'workflow.regulationNumber',
      'deviceClass': 'workflow.deviceClass',
      'submissionType': 'workflow.submissionType',
      'panelCode': 'workflow.panelCode'
    }
  },

  // Device Description Section
  'DEVICE_DESCRIPTION': {
    templateSection: 'deviceDescription',
    subsections: {
      'intendedUse': {
        templateField: 'deviceDescription.intendedUse',
        workflowPath: 'workflow.intendedUse',
        required: true
      },
      'indicationsForUse': {
        templateField: 'deviceDescription.indications',
        workflowPath: 'workflow.indicationsForUse',
        required: true
      },
      'deviceModels': {
        templateField: 'deviceDescription.models',
        workflowPath: 'workflow.deviceModels',
        isArray: true
      },
      'accessories': {
        templateField: 'deviceDescription.accessories',
        workflowPath: 'workflow.deviceAccessories',
        isArray: true
      },
      'technicalSpecifications': {
        templateField: 'deviceDescription.specifications',
        workflowPath: 'workflow.technicalSpecifications'
      },
      'materialsComposition': {
        templateField: 'deviceDescription.materials',
        workflowPath: 'workflow.materialsComposition'
      }
    }
  },

  // Substantial Equivalence Section
  'SUBSTANTIAL_EQUIVALENCE': {
    templateSection: 'substantialEquivalence',
    subsections: {
      'predicateDevice': {
        templateField: 'se.primaryPredicate',
        workflowPath: 'workflow.primaryPredicateKNumber',
        required: true
      },
      'predicateManufacturer': {
        templateField: 'se.predicateManufacturer',
        workflowPath: 'workflow.predicateManufacturer'
      },
      'comparisonTable': {
        templateField: 'se.comparisonTable',
        workflowPath: 'workflow.predicateComparison',
        transform: 'buildComparisonTable'
      },
      'differencesDiscussion': {
        templateField: 'se.differencesDiscussion',
        workflowPath: 'workflow.predicateDifferences'
      }
    }
  },

  // Performance Data Section
  'PERFORMANCE_DATA': {
    templateSection: 'performanceData',
    subsections: {
      'benchTesting': {
        templateField: 'performance.benchTesting',
        workflowPath: 'workflow.testingData.bench',
        conditional: 'workflow.testingData.hasBenchTesting'
      },
      'animalTesting': {
        templateField: 'performance.animalTesting', 
        workflowPath: 'workflow.testingData.animal',
        conditional: 'workflow.testingData.hasAnimalTesting'
      },
      'clinicalData': {
        templateField: 'performance.clinicalData',
        workflowPath: 'workflow.testingData.clinical',
        conditional: 'workflow.hasClinicalData'
      }
    }
  },

  // Software Section (if applicable)
  'SOFTWARE': {
    templateSection: 'software',
    conditional: 'workflow.hasSoftware',
    subsections: {
      'softwareLevel': {
        templateField: 'software.levelOfConcern',
        workflowPath: 'workflow.softwareLevel'
      },
      'softwareDescription': {
        templateField: 'software.description',
        workflowPath: 'workflow.softwareDescription'
      },
      'cybersecurity': {
        templateField: 'software.cybersecurity',
        workflowPath: 'workflow.cybersecurityData',
        conditional: 'workflow.isCyberDevice'
      }
    }
  },

  // Biocompatibility (if applicable)
  'BIOCOMPATIBILITY': {
    templateSection: 'biocompatibility',
    conditional: 'workflow.hasPatientContacting',
    subsections: {
      'contactType': {
        templateField: 'biocomp.contactType',
        workflowPath: 'workflow.contactType'
      },
      'contactDuration': {
        templateField: 'biocomp.contactDuration',
        workflowPath: 'workflow.contactDuration'
      },
      'testingSummary': {
        templateField: 'biocomp.testingSummary',
        workflowPath: 'workflow.biocompatibilityData'
      }
    }
  },

  // Sterility (if applicable)
  'STERILITY': {
    templateSection: 'sterility',
    conditional: 'workflow.isSterile',
    subsections: {
      'sterilizationMethod': {
        templateField: 'sterility.method',
        workflowPath: 'workflow.sterilizationMethod'
      },
      'sterilitySAL': {
        templateField: 'sterility.sal',
        workflowPath: 'workflow.sterilitySAL'
      },
      'validationData': {
        templateField: 'sterility.validation',
        workflowPath: 'workflow.sterilityValidation'
      }
    }
  }
};

// Document ID Generator
export function generateDocumentId(workflowId: string, sectionCode: string): string {
  const timestamp = Date.now();
  return `510K_${workflowId}_${sectionCode}_${timestamp}`;
}

// Transform workflow data to template format
export function mapWorkflowToTemplate(workflowData: any): any {
  const templateData: any = {
    documentId: generateDocumentId(workflowData.id || 'NEW', 'FULL'),
    templateVersion: '2024.1',
    generatedAt: new Date().toISOString(),
    sections: {}
  };

  // Process each template section
  for (const [sectionKey, sectionConfig] of Object.entries(ESTAR_TEMPLATE_MAPPING)) {
    // Check conditional sections
    if (sectionConfig.conditional) {
      const shouldInclude = evaluateCondition(workflowData, sectionConfig.conditional);
      if (!shouldInclude) continue;
    }

    // Map fields or subsections
    if (sectionConfig.fields) {
      // Simple field mapping
      templateData.sections[sectionKey] = mapFields(workflowData, sectionConfig.fields);
    } else if (sectionConfig.subsections) {
      // Complex subsection mapping
      templateData.sections[sectionKey] = mapSubsections(workflowData, sectionConfig.subsections);
    }
  }

  // Add metadata for traceability
  templateData.metadata = {
    sourceWorkflowId: workflowData.id,
    mappingVersion: '1.0.0',
    mappedFields: countMappedFields(templateData.sections),
    validationStatus: validateRequiredFields(templateData.sections)
  };

  return templateData;
}

// Map simple fields
function mapFields(workflowData: any, fieldMapping: any): any {
  const mapped: any = {};
  
  for (const [templateField, workflowPath] of Object.entries(fieldMapping)) {
    const value = getNestedValue(workflowData, workflowPath as string);
    if (value !== undefined && value !== null) {
      mapped[templateField] = value;
    }
  }
  
  return mapped;
}

// Map complex subsections
function mapSubsections(workflowData: any, subsections: any): any {
  const mapped: any = {};
  
  for (const [key, config] of Object.entries(subsections as any)) {
    // Check conditional subsections
    if (config.conditional) {
      const shouldInclude = evaluateCondition(workflowData, config.conditional);
      if (!shouldInclude) continue;
    }

    // Get value from workflow data
    const value = getNestedValue(workflowData, config.workflowPath);
    
    // Apply transformation if needed
    if (config.transform) {
      mapped[key] = applyTransformation(value, config.transform, workflowData);
    } else if (config.isArray && Array.isArray(value)) {
      mapped[key] = value;
    } else if (value !== undefined && value !== null) {
      mapped[key] = value;
    }
  }
  
  return mapped;
}

// Get nested value from object using path string
function getNestedValue(obj: any, path: string): any {
  const keys = path.replace('workflow.', '').split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value && typeof value === 'object') {
      value = value[key];
    } else {
      return undefined;
    }
  }
  
  return value;
}

// Evaluate conditional expressions
function evaluateCondition(workflowData: any, condition: string): boolean {
  const value = getNestedValue(workflowData, condition);
  return Boolean(value);
}

// Apply data transformations
function applyTransformation(value: any, transformType: string, workflowData: any): any {
  switch (transformType) {
    case 'buildComparisonTable':
      return buildPredicateComparisonTable(value, workflowData);
    default:
      return value;
  }
}

// Build predicate comparison table
function buildPredicateComparisonTable(predicateData: any, workflowData: any): any {
  return {
    headers: ['Feature', 'Subject Device', 'Predicate Device', 'Comments'],
    rows: [
      ['Device Name', workflowData.deviceName, predicateData?.deviceName || '', ''],
      ['Intended Use', workflowData.intendedUse, predicateData?.intendedUse || '', ''],
      ['Product Code', workflowData.productCode, predicateData?.productCode || '', ''],
      ['Device Class', workflowData.deviceClass, predicateData?.deviceClass || '', ''],
      // Add more comparison rows as needed
    ]
  };
}

// Count mapped fields for metadata
function countMappedFields(sections: any): number {
  let count = 0;
  
  const countFields = (obj: any) => {
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        countFields(value);
      } else if (value !== undefined && value !== null) {
        count++;
      }
    }
  };
  
  countFields(sections);
  return count;
}

// Validate required fields
function validateRequiredFields(sections: any): string {
  const requiredFields = [
    'FDA_3514.applicantName',
    'FDA_3601.deviceName',
    'DEVICE_DESCRIPTION.intendedUse',
    'DEVICE_DESCRIPTION.indicationsForUse',
    'SUBSTANTIAL_EQUIVALENCE.predicateDevice'
  ];
  
  const missing: string[] = [];
  
  for (const field of requiredFields) {
    const [section, fieldName] = field.split('.');
    if (!sections[section]?.[fieldName]) {
      missing.push(field);
    }
  }
  
  return missing.length === 0 ? 'complete' : `missing: ${missing.join(', ')}`;
}

// Generate unique section IDs
export function generateSectionId(workflowId: string, sectionCode: string, subsection?: string): string {
  const base = `${workflowId}_${sectionCode}`;
  if (subsection) {
    return `${base}_${subsection}`;
  }
  return base;
}

// Export mapping configuration for external use
export const TemplateMapper = {
  mapWorkflowToTemplate,
  generateDocumentId,
  generateSectionId,
  getTemplateSections: () => Object.keys(ESTAR_TEMPLATE_MAPPING),
  getRequiredFields: () => {
    const required: string[] = [];
    for (const [section, config] of Object.entries(ESTAR_TEMPLATE_MAPPING)) {
      if (config.subsections) {
        for (const [key, subsection] of Object.entries(config.subsections as any)) {
          if (subsection.required) {
            required.push(`${section}.${key}`);
          }
        }
      }
    }
    return required;
  }
};

export default TemplateMapper;