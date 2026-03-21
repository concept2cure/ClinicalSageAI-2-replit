/**
 * Cross-Reference Mapping Service for 510(k) Document Generation
 * Maps collected workflow data to specific eSTAR sections and FDA form fields
 */

import { db } from '../db';
import { fda510kDataMappings, fda510kStageProgress, fda510kDocuments } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

interface MappingRule {
  sourceField: string;
  targetSection: string;
  targetField: string;
  transformType?: string;
  validation?: string;
  fdaFormField?: string; // Maps to specific FDA form field
}

interface eSTARSection {
  sectionId: string;
  title: string;
  subsections?: eSTARSection[];
  fields: string[];
}

interface FDAFormField {
  formId: string;
  fieldId: string;
  fieldName: string;
  required: boolean;
  dataType: string;
  validation?: string;
}

// FDA Form Field Definitions
const FDA_FORMS: Record<string, Record<string, FDAFormField>> = {
  'FDA_3514': { // CDRH Cover Sheet
    'applicant_name': { formId: 'FDA_3514', fieldId: 'applicant_name', fieldName: 'Applicant Name', required: true, dataType: 'string' },
    'contact_name': { formId: 'FDA_3514', fieldId: 'contact_name', fieldName: 'Contact Person', required: true, dataType: 'string' },
    'contact_phone': { formId: 'FDA_3514', fieldId: 'contact_phone', fieldName: 'Phone Number', required: true, dataType: 'string' },
    'contact_email': { formId: 'FDA_3514', fieldId: 'contact_email', fieldName: 'Email Address', required: true, dataType: 'email' },
    'device_name': { formId: 'FDA_3514', fieldId: 'device_name', fieldName: 'Device Trade Name', required: true, dataType: 'string' },
    'device_class': { formId: 'FDA_3514', fieldId: 'device_class', fieldName: 'Device Classification', required: true, dataType: 'string' },
    'product_code': { formId: 'FDA_3514', fieldId: 'product_code', fieldName: 'Product Code', required: true, dataType: 'string' },
    'submission_type': { formId: 'FDA_3514', fieldId: 'submission_type', fieldName: 'Submission Type', required: true, dataType: 'string' },
    'establishment_registration': { formId: 'FDA_3514', fieldId: 'establishment_registration', fieldName: 'Establishment Registration Number', required: true, dataType: 'string' }
  },
  'FDA_3601': { // User Fee Cover Sheet
    'applicant_name': { formId: 'FDA_3601', fieldId: 'applicant_name', fieldName: 'Applicant Name', required: true, dataType: 'string' },
    'fee_category': { formId: 'FDA_3601', fieldId: 'fee_category', fieldName: 'User Fee Category', required: true, dataType: 'string' },
    'payment_method': { formId: 'FDA_3601', fieldId: 'payment_method', fieldName: 'Payment Method', required: true, dataType: 'string' },
    'reference_number': { formId: 'FDA_3601', fieldId: 'reference_number', fieldName: 'Reference Number', required: false, dataType: 'string' },
    'small_business': { formId: 'FDA_3601', fieldId: 'small_business', fieldName: 'Small Business Certification', required: false, dataType: 'boolean' },
    'fee_amount': { formId: 'FDA_3601', fieldId: 'fee_amount', fieldName: 'Fee Amount', required: true, dataType: 'number' }
  },
  'FDA_3881': { // Indications for Use
    'device_name': { formId: 'FDA_3881', fieldId: 'device_name', fieldName: 'Device Name', required: true, dataType: 'string' },
    'indications_for_use': { formId: 'FDA_3881', fieldId: 'indications_for_use', fieldName: 'Indications for Use Statement', required: true, dataType: 'text' },
    'prescription_use': { formId: 'FDA_3881', fieldId: 'prescription_use', fieldName: 'Prescription Use (21 CFR 801.109)', required: true, dataType: 'boolean' },
    'over_counter_use': { formId: 'FDA_3881', fieldId: 'over_counter_use', fieldName: 'Over-The-Counter Use', required: true, dataType: 'boolean' },
    'patient_population': { formId: 'FDA_3881', fieldId: 'patient_population', fieldName: 'Patient Population', required: false, dataType: 'text' },
    'comparison_predicate': { formId: 'FDA_3881', fieldId: 'comparison_predicate', fieldName: 'Comparison to Predicate', required: false, dataType: 'text' }
  },
  'FDA_3654': { // Certification/Disclosure Statement
    'certifier_name': { formId: 'FDA_3654', fieldId: 'certifier_name', fieldName: 'Name of Certifying Official', required: true, dataType: 'string' },
    'certifier_title': { formId: 'FDA_3654', fieldId: 'certifier_title', fieldName: 'Title', required: true, dataType: 'string' },
    'certification_statement': { formId: 'FDA_3654', fieldId: 'certification_statement', fieldName: 'Certification Statement', required: true, dataType: 'boolean' },
    'clinical_studies': { formId: 'FDA_3654', fieldId: 'clinical_studies', fieldName: 'Clinical Studies Conducted', required: true, dataType: 'boolean' },
    'financial_interests': { formId: 'FDA_3654', fieldId: 'financial_interests', fieldName: 'Financial Interests Disclosure', required: true, dataType: 'boolean' },
    'signature_date': { formId: 'FDA_3654', fieldId: 'signature_date', fieldName: 'Date', required: true, dataType: 'date' }
  }
};

// eSTAR Document Structure based on FDA guidance
const ESTAR_STRUCTURE: Record<string, eSTARSection> = {
  'section_1': {
    sectionId: 'section_1',
    title: 'Administrative Information',
    fields: ['submission_type', 'applicant_info', 'contact_info', 'correspondence'],
    subsections: [
      {
        sectionId: 'section_1.1',
        title: 'Cover Letter',
        fields: ['cover_letter_content']
      },
      {
        sectionId: 'section_1.2',
        title: 'Table of Contents',
        fields: ['toc_generated']
      }
    ]
  },
  'section_2': {
    sectionId: 'section_2',
    title: 'Submission Summary',
    fields: ['executive_summary', 'device_overview', 'submission_history']
  },
  'section_3': {
    sectionId: 'section_3',
    title: 'Applicant Information',
    fields: ['manufacturer_name', 'manufacturer_address', 'contact_person', 'establishment_registration']
  },
  'section_4': {
    sectionId: 'section_4',
    title: 'Device Information',
    fields: ['trade_name', 'common_name', 'classification_name', 'product_code']
  },
  'section_5': {
    sectionId: 'section_5',
    title: 'Device Description',
    subsections: [
      {
        sectionId: 'section_5.1',
        title: 'General Device Description',
        fields: ['device_description', 'physical_characteristics', 'dimensions', 'materials']
      },
      {
        sectionId: 'section_5.2',
        title: 'Intended Use/Indications for Use',
        fields: ['intended_use', 'indications_for_use', 'patient_population', 'use_environment']
      },
      {
        sectionId: 'section_5.3',
        title: 'Principle of Operation',
        fields: ['operating_principle', 'energy_sources', 'mechanism_of_action']
      }
    ]
  },
  'section_6': {
    sectionId: 'section_6',
    title: 'Substantial Equivalence',
    subsections: [
      {
        sectionId: 'section_6.1',
        title: 'Predicate Device Identification',
        fields: ['predicate_device_name', 'predicate_k_number', 'predicate_manufacturer']
      },
      {
        sectionId: 'section_6.2',
        title: 'Comparison Table',
        fields: ['comparison_table', 'similarities', 'differences', 'rationale']
      }
    ]
  },
  'section_7': {
    sectionId: 'section_7',
    title: 'Standards',
    subsections: [
      {
        sectionId: 'section_7.1',
        title: 'Consensus Standards',
        fields: ['standard_number', 'standard_title', 'conformance_summary']
      },
      {
        sectionId: 'section_7.2',
        title: 'Guidance Documents',
        fields: ['guidance_document', 'compliance_summary']
      },
      {
        sectionId: 'section_7.3',
        title: 'Special Controls',
        fields: ['special_control_requirements', 'compliance_demonstration']
      }
    ]
  },
  'section_8': {
    sectionId: 'section_8',
    title: 'Sterilization',
    fields: ['sterilization_method', 'sterility_assurance_level', 'validation_summary', 'packaging_validation']
  },
  'section_9': {
    sectionId: 'section_9',
    title: 'Performance Testing',
    subsections: [
      {
        sectionId: 'section_9.1',
        title: 'Bench Testing',
        fields: ['test_methods', 'acceptance_criteria', 'test_results', 'statistical_analysis']
      },
      {
        sectionId: 'section_9.2',
        title: 'Animal Testing',
        fields: ['study_protocol', 'animal_model', 'study_results', 'clinical_relevance']
      },
      {
        sectionId: 'section_9.3',
        title: 'Shelf Life Testing',
        fields: ['shelf_life_protocol', 'accelerated_aging', 'real_time_aging', 'expiry_dating']
      }
    ]
  },
  'section_10': {
    sectionId: 'section_10',
    title: 'Biocompatibility',
    subsections: [
      {
        sectionId: 'section_10.1',
        title: 'Materials Characterization',
        fields: ['material_list', 'material_certificates', 'chemical_characterization']
      },
      {
        sectionId: 'section_10.2',
        title: 'Biological Evaluation',
        fields: ['iso_10993_matrix', 'test_selection_rationale', 'test_reports', 'toxicological_assessment']
      }
    ]
  },
  'section_11': {
    sectionId: 'section_11',
    title: 'Software',
    subsections: [
      {
        sectionId: 'section_11.1',
        title: 'Software Description',
        fields: ['software_overview', 'features_functions', 'operating_environment', 'hardware_requirements']
      },
      {
        sectionId: 'section_11.2',
        title: 'Level of Concern',
        fields: ['level_of_concern', 'loc_rationale', 'hazard_analysis']
      },
      {
        sectionId: 'section_11.3',
        title: 'Software Documentation',
        fields: ['software_requirements', 'design_specifications', 'traceability_matrix']
      },
      {
        sectionId: 'section_11.4',
        title: 'Verification and Validation',
        fields: ['v_and_v_plan', 'test_protocols', 'test_results', 'regression_analysis']
      },
      {
        sectionId: 'section_11.5',
        title: 'Revision History',
        fields: ['version_history', 'change_log', 'anomaly_list']
      },
      {
        sectionId: 'section_11.6',
        title: 'Cybersecurity',
        fields: ['threat_model', 'security_controls', 'vulnerability_assessment', 'sbom']
      }
    ]
  },
  'section_12': {
    sectionId: 'section_12',
    title: 'Labeling',
    fields: ['device_labeling', 'instructions_for_use', 'package_insert', 'patient_labeling', 'promotional_materials']
  },
  'section_13': {
    sectionId: 'section_13',
    title: 'Clinical Studies',
    subsections: [
      {
        sectionId: 'section_13.1',
        title: 'Study Protocol',
        fields: ['protocol_synopsis', 'study_design', 'endpoints', 'statistical_plan']
      },
      {
        sectionId: 'section_13.2',
        title: 'Study Report',
        fields: ['patient_demographics', 'study_results', 'adverse_events', 'conclusions']
      }
    ]
  },
  'section_14': {
    sectionId: 'section_14',
    title: 'Human Factors',
    fields: ['use_specification', 'task_analysis', 'use_related_risk_analysis', 'validation_testing', 'training_materials']
  },
  'section_15': {
    sectionId: 'section_15',
    title: 'IVD Specific',
    subsections: [
      {
        sectionId: 'section_15.1',
        title: 'Analytical Performance',
        fields: ['precision', 'accuracy', 'linearity', 'detection_limits', 'interfering_substances']
      },
      {
        sectionId: 'section_15.2',
        title: 'Clinical Performance',
        fields: ['clinical_sensitivity', 'clinical_specificity', 'positive_predictive_value', 'negative_predictive_value']
      }
    ]
  },
  'section_16': {
    sectionId: 'section_16',
    title: 'Combination Products',
    subsections: [
      {
        sectionId: 'section_16.1',
        title: 'Drug Component',
        fields: ['drug_substance', 'drug_product', 'pharmacology', 'toxicology']
      },
      {
        sectionId: 'section_16.2',
        title: 'Drug-Device Interaction',
        fields: ['compatibility_studies', 'delivery_performance', 'stability_studies']
      }
    ]
  },
  'section_17': {
    sectionId: 'section_17',
    title: 'Post-Market',
    fields: ['complaint_handling', 'mdr_reporting', 'recalls', 'post_market_surveillance_plan']
  }
};

export class CrossReferenceMapper {
  /**
   * Create intelligent mapping rules based on template and collected data
   */
  async createMappingRules(
    projectId: number,
    templateId: string,
    organizationId: number
  ): Promise<MappingRule[]> {
    const mappingRules: MappingRule[] = [];

    // Get template-specific mapping from database
    const customMappings = await db!
      .select()
      .from(fda510kDataMappings)
      .where(
        and(
          eq(fda510kDataMappings.organizationId, organizationId),
          eq(fda510kDataMappings.isActive, true)
        )
      );

    // Base mapping rules for common fields with FDA form linkage
    const baseMappings: MappingRule[] = [
      // Device Information -> Section 4 & 5 AND FDA Forms
      { sourceField: 'deviceInfo.deviceName', targetSection: 'section_4', targetField: 'trade_name', fdaFormField: 'FDA_3514.device_name' },
      { sourceField: 'deviceInfo.deviceName', targetSection: 'FDA_3881', targetField: 'device_name', fdaFormField: 'FDA_3881.device_name' },
      { sourceField: 'deviceInfo.commonName', targetSection: 'section_4', targetField: 'common_name' },
      { sourceField: 'deviceInfo.deviceDescription', targetSection: 'section_5.1', targetField: 'device_description' },
      { sourceField: 'deviceInfo.intendedUse', targetSection: 'section_5.2', targetField: 'intended_use' },
      { sourceField: 'deviceInfo.indicationsForUse', targetSection: 'section_5.2', targetField: 'indications_for_use', fdaFormField: 'FDA_3881.indications_for_use' },
      { sourceField: 'deviceInfo.materials', targetSection: 'section_5.1', targetField: 'materials' },
      { sourceField: 'deviceInfo.prescriptionUse', targetSection: 'FDA_3881', targetField: 'prescription_use', fdaFormField: 'FDA_3881.prescription_use' },
      { sourceField: 'deviceInfo.overCounterUse', targetSection: 'FDA_3881', targetField: 'over_counter_use', fdaFormField: 'FDA_3881.over_counter_use' },
      
      // Manufacturer Information -> Section 3 AND FDA Forms
      { sourceField: 'manufacturerInfo.name', targetSection: 'section_3', targetField: 'manufacturer_name', fdaFormField: 'FDA_3514.applicant_name' },
      { sourceField: 'manufacturerInfo.name', targetSection: 'FDA_3601', targetField: 'applicant_name', fdaFormField: 'FDA_3601.applicant_name' },
      { sourceField: 'manufacturerInfo.address', targetSection: 'section_3', targetField: 'manufacturer_address' },
      { sourceField: 'manufacturerInfo.contactPerson', targetSection: 'section_3', targetField: 'contact_person', fdaFormField: 'FDA_3514.contact_name' },
      { sourceField: 'manufacturerInfo.contactPhone', targetSection: 'FDA_3514', targetField: 'contact_phone', fdaFormField: 'FDA_3514.contact_phone' },
      { sourceField: 'manufacturerInfo.contactEmail', targetSection: 'FDA_3514', targetField: 'contact_email', fdaFormField: 'FDA_3514.contact_email' },
      { sourceField: 'manufacturerInfo.establishmentNumber', targetSection: 'section_3', targetField: 'establishment_registration', fdaFormField: 'FDA_3514.establishment_registration' },
      
      // Classification -> Section 4 AND FDA Forms
      { sourceField: 'regulatoryInfo.deviceClass', targetSection: 'section_4', targetField: 'classification_name', fdaFormField: 'FDA_3514.device_class' },
      { sourceField: 'regulatoryInfo.productCode', targetSection: 'section_4', targetField: 'product_code', fdaFormField: 'FDA_3514.product_code' },
      { sourceField: 'regulatoryInfo.submissionType', targetSection: 'FDA_3514', targetField: 'submission_type', fdaFormField: 'FDA_3514.submission_type' },
      
      // Predicate Device -> Section 6
      { sourceField: 'predicateInfo.deviceName', targetSection: 'section_6.1', targetField: 'predicate_device_name' },
      { sourceField: 'predicateInfo.kNumber', targetSection: 'section_6.1', targetField: 'predicate_k_number' },
      { sourceField: 'predicateInfo.manufacturer', targetSection: 'section_6.1', targetField: 'predicate_manufacturer' },
      { sourceField: 'predicateInfo.comparisonTable', targetSection: 'section_6.2', targetField: 'comparison_table' },
      
      // Performance Testing -> Section 9
      { sourceField: 'performanceData.benchTesting', targetSection: 'section_9.1', targetField: 'test_results' },
      { sourceField: 'performanceData.testMethods', targetSection: 'section_9.1', targetField: 'test_methods' },
      { sourceField: 'performanceData.acceptanceCriteria', targetSection: 'section_9.1', targetField: 'acceptance_criteria' },
      
      // Biocompatibility -> Section 10
      { sourceField: 'biocompatibilityData.materials', targetSection: 'section_10.1', targetField: 'material_list' },
      { sourceField: 'biocompatibilityData.iso10993', targetSection: 'section_10.2', targetField: 'iso_10993_matrix' },
      { sourceField: 'biocompatibilityData.testReports', targetSection: 'section_10.2', targetField: 'test_reports' },
      
      // Software -> Section 11
      { sourceField: 'softwareData.description', targetSection: 'section_11.1', targetField: 'software_overview' },
      { sourceField: 'softwareData.levelOfConcern', targetSection: 'section_11.2', targetField: 'level_of_concern' },
      { sourceField: 'softwareData.requirements', targetSection: 'section_11.3', targetField: 'software_requirements' },
      { sourceField: 'softwareData.cybersecurity', targetSection: 'section_11.6', targetField: 'security_controls' },
      
      // Labeling -> Section 12
      { sourceField: 'labelingData.deviceLabel', targetSection: 'section_12', targetField: 'device_labeling' },
      { sourceField: 'labelingData.instructionsForUse', targetSection: 'section_12', targetField: 'instructions_for_use' },
      { sourceField: 'labelingData.packageInsert', targetSection: 'section_12', targetField: 'package_insert' },
      
      // Clinical Studies -> Section 13
      { sourceField: 'clinicalData.studyProtocol', targetSection: 'section_13.1', targetField: 'protocol_synopsis' },
      { sourceField: 'clinicalData.studyResults', targetSection: 'section_13.2', targetField: 'study_results' },
      { sourceField: 'clinicalData.adverseEvents', targetSection: 'section_13.2', targetField: 'adverse_events' }
    ];

    // Apply custom mappings from database
    for (const customMapping of customMappings) {
      const rule: MappingRule = {
        sourceField: customMapping.sourceReference,
        targetSection: customMapping.targetTemplate,
        targetField: customMapping.targetField,
        transformType: customMapping.transformationType || undefined
      };
      mappingRules.push(rule);
    }

    // Add base mappings if no conflicts
    for (const baseMapping of baseMappings) {
      const hasCustom = mappingRules.some(
        r => r.sourceField === baseMapping.sourceField && 
            r.targetField === baseMapping.targetField
      );
      if (!hasCustom) {
        mappingRules.push(baseMapping);
      }
    }

    return mappingRules;
  }

  /**
   * Map workflow data to eSTAR sections using mapping rules
   */
  async mapDataToSections(
    workflowData: any,
    mappingRules: MappingRule[]
  ): Promise<Record<string, any>> {
    const mappedSections: Record<string, any> = {};

    for (const rule of mappingRules) {
      try {
        // Extract value from source using dot notation
        const sourceValue = this.extractValueFromPath(workflowData, rule.sourceField);
        
        if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
          // Apply transformation if specified
          const transformedValue = rule.transformType 
            ? this.applyTransformation(sourceValue, rule.transformType)
            : sourceValue;

          // Initialize section if not exists
          if (!mappedSections[rule.targetSection]) {
            mappedSections[rule.targetSection] = {};
          }

          // Set the field value
          mappedSections[rule.targetSection][rule.targetField] = transformedValue;
        }
      } catch (error) {
        console.error(`Mapping error for rule ${rule.sourceField} -> ${rule.targetField}:`, error);
      }
    }

    return mappedSections;
  }

  /**
   * Generate smart field links between form inputs and document placeholders
   */
  async generateSmartLinks(
    projectId: number
  ): Promise<Array<{ inputId: string; placeholderId: string; bidirectional: boolean }>> {
    const smartLinks: Array<{ inputId: string; placeholderId: string; bidirectional: boolean }> = [];

    // Get all stage progress data
    const stageData = await db!
      .select()
      .from(fda510kStageProgress)
      .where(eq(fda510kStageProgress.projectId, projectId));

    // Get all documents
    const documents = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.projectId, projectId));

    // Analyze data to find matching patterns
    for (const stage of stageData) {
      if (stage.collectedData) {
        const stageDataObj = stage.collectedData as any;
        
        // Iterate through collected data fields
        for (const [fieldKey, fieldValue] of Object.entries(stageDataObj)) {
          // Generate input ID
          const inputId = `${stage.stageId}.${fieldKey}`;
          
          // Search for matching placeholders in documents
          for (const doc of documents) {
            if (doc.content) {
              const placeholderPattern = new RegExp(`\\{\\{\\s*${fieldKey}\\s*\\}\\}`, 'gi');
              const matches = doc.content.match(placeholderPattern);
              
              if (matches) {
                for (const match of matches) {
                  smartLinks.push({
                    inputId,
                    placeholderId: `${doc.documentId}.${fieldKey}`,
                    bidirectional: true // Allow two-way sync
                  });
                }
              }
            }
          }
        }
      }
    }

    return smartLinks;
  }

  /**
   * Validate mapped data against eSTAR requirements
   */
  validateMapping(
    mappedSections: Record<string, any>,
    requiredSections: string[]
  ): { isValid: boolean; missingFields: string[]; warnings: string[] } {
    const missingFields: string[] = [];
    const warnings: string[] = [];

    // Check required sections
    for (const requiredSection of requiredSections) {
      if (!mappedSections[requiredSection] || Object.keys(mappedSections[requiredSection]).length === 0) {
        missingFields.push(requiredSection);
      }
    }

    // Validate specific field requirements
    // Device name is always required
    if (!mappedSections['section_4']?.trade_name) {
      missingFields.push('Device Trade Name (section_4.trade_name)');
    }

    // Intended use is always required
    if (!mappedSections['section_5.2']?.intended_use) {
      missingFields.push('Intended Use (section_5.2.intended_use)');
    }

    // Manufacturer info is always required
    if (!mappedSections['section_3']?.manufacturer_name) {
      missingFields.push('Manufacturer Name (section_3.manufacturer_name)');
    }

    // For traditional 510(k), predicate is required
    if (!mappedSections['section_6.1']?.predicate_k_number) {
      warnings.push('Predicate Device K Number not specified (recommended for traditional 510(k))');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
      warnings
    };
  }

  /**
   * Helper: Extract value from nested object using dot notation
   */
  private extractValueFromPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Helper: Apply transformation to field value
   */
  private applyTransformation(value: any, transformType: string): any {
    switch (transformType) {
      case 'uppercase':
        return String(value).toUpperCase();
      case 'lowercase':
        return String(value).toLowerCase();
      case 'date_format':
        return new Date(value).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      case 'boolean_to_text':
        return value ? 'Yes' : 'No';
      case 'array_to_list':
        return Array.isArray(value) ? value.join(', ') : value;
      default:
        return value;
    }
  }

  /**
   * Get eSTAR section structure
   */
  getSectionStructure(sectionId: string): eSTARSection | undefined {
    return ESTAR_STRUCTURE[sectionId];
  }

  /**
   * Get all eSTAR sections
   */
  getAllSections(): eSTARSection[] {
    return Object.values(ESTAR_STRUCTURE);
  }

  /**
   * Map workflow data to FDA forms (3514, 3601, 3881, 3654)
   */
  async mapDataToFDAForms(
    workflowData: any,
    organizationId: number
  ): Promise<Record<string, any>> {
    const fdaFormData: Record<string, any> = {
      'FDA_3514': {},
      'FDA_3601': {},
      'FDA_3881': {},
      'FDA_3654': {}
    };

    // FDA Form 3514 - CDRH Cover Sheet
    fdaFormData['FDA_3514'] = {
      applicant_name: workflowData.manufacturerInfo?.name || workflowData.applicantName || '',
      contact_name: workflowData.manufacturerInfo?.contactPerson || workflowData.contactName || '',
      contact_phone: workflowData.manufacturerInfo?.contactPhone || workflowData.contactPhone || '',
      contact_email: workflowData.manufacturerInfo?.contactEmail || workflowData.contactEmail || '',
      device_name: workflowData.deviceInfo?.deviceName || workflowData.deviceName || '',
      device_class: workflowData.regulatoryInfo?.deviceClass || workflowData.deviceClassification || '',
      product_code: workflowData.regulatoryInfo?.productCode || workflowData.productCode || '',
      submission_type: workflowData.regulatoryInfo?.submissionType || workflowData.submissionType || 'Traditional 510(k)',
      establishment_registration: workflowData.manufacturerInfo?.establishmentNumber || ''
    };

    // FDA Form 3601 - User Fee Cover Sheet
    fdaFormData['FDA_3601'] = {
      applicant_name: workflowData.manufacturerInfo?.name || workflowData.applicantName || '',
      fee_category: workflowData.feeInfo?.category || 'Standard 510(k)',
      payment_method: workflowData.feeInfo?.paymentMethod || 'Check',
      reference_number: workflowData.feeInfo?.referenceNumber || '',
      small_business: workflowData.feeInfo?.smallBusiness || false,
      fee_amount: workflowData.feeInfo?.amount || 0
    };

    // FDA Form 3881 - Indications for Use
    fdaFormData['FDA_3881'] = {
      device_name: workflowData.deviceInfo?.deviceName || workflowData.deviceName || '',
      indications_for_use: workflowData.deviceInfo?.indicationsForUse || workflowData.intendedUse || '',
      prescription_use: workflowData.deviceInfo?.prescriptionUse !== false,
      over_counter_use: workflowData.deviceInfo?.overCounterUse === true,
      patient_population: workflowData.deviceInfo?.patientPopulation || '',
      comparison_predicate: workflowData.predicateInfo?.comparison || ''
    };

    // FDA Form 3654 - Certification/Disclosure
    fdaFormData['FDA_3654'] = {
      certifier_name: workflowData.certificationInfo?.certifierName || workflowData.manufacturerInfo?.contactPerson || '',
      certifier_title: workflowData.certificationInfo?.certifierTitle || 'Regulatory Affairs Manager',
      certification_statement: true, // Always true when submitting
      clinical_studies: workflowData.clinicalData?.hasStudies || false,
      financial_interests: workflowData.certificationInfo?.financialInterests || false,
      signature_date: new Date().toISOString().split('T')[0]
    };

    return fdaFormData;
  }

  /**
   * Create bidirectional smart links between workflow fields and document placeholders
   */
  async createSmartFieldLinks(
    projectId: number,
    workflowData: any
  ): Promise<Record<string, any>> {
    const smartLinks: Record<string, any> = {
      bidirectionalLinks: [],
      fieldMappings: {},
      syncStatus: {}
    };

    // Get existing mappings
    const mappingRules = await this.createMappingRules(
      projectId,
      'standard',
      workflowData.organizationId
    );

    // Create bidirectional links for each mapping rule
    for (const rule of mappingRules) {
      const link = {
        sourceField: rule.sourceField,
        targetField: `${rule.targetSection}.${rule.targetField}`,
        fdaFormField: rule.fdaFormField,
        bidirectional: true,
        lastSyncTime: new Date().toISOString(),
        syncDirection: 'source_to_target' as 'source_to_target' | 'target_to_source'
      };

      smartLinks.bidirectionalLinks.push(link);
      
      // Track field mapping
      if (!smartLinks.fieldMappings[rule.sourceField]) {
        smartLinks.fieldMappings[rule.sourceField] = [];
      }
      smartLinks.fieldMappings[rule.sourceField].push({
        target: link.targetField,
        fdaForm: rule.fdaFormField
      });

      // Track sync status
      smartLinks.syncStatus[rule.sourceField] = {
        synced: true,
        lastSync: new Date().toISOString(),
        targets: smartLinks.fieldMappings[rule.sourceField]
      };
    }

    // Store smart links in database
    await this.persistSmartLinks(projectId, smartLinks);

    return smartLinks;
  }

  /**
   * Dynamic Content Assembly - Compile complete documents from multiple sources
   */
  async assembleDocument(
    projectId: number,
    documentType: string,
    workflowData: any
  ): Promise<{ content: string; metadata: any }> {
    const assembledDocument = {
      content: '',
      metadata: {
        documentType,
        projectId,
        assemblyTime: new Date().toISOString(),
        sources: [] as string[],
        completeness: 0
      }
    };

    // Get mapped sections
    const mappingRules = await this.createMappingRules(
      projectId,
      documentType,
      workflowData.organizationId
    );
    const mappedSections = await this.mapDataToSections(workflowData, mappingRules);

    // Get FDA form data
    const fdaFormData = await this.mapDataToFDAForms(workflowData, workflowData.organizationId);

    // Assemble based on document type
    switch (documentType) {
      case 'FDA_3514':
        assembledDocument.content = this.assembleFDA3514(fdaFormData['FDA_3514']);
        assembledDocument.metadata.sources = ['workflow.manufacturerInfo', 'workflow.deviceInfo', 'workflow.regulatoryInfo'];
        break;

      case 'FDA_3881':
        assembledDocument.content = this.assembleFDA3881(fdaFormData['FDA_3881']);
        assembledDocument.metadata.sources = ['workflow.deviceInfo', 'workflow.predicateInfo'];
        break;

      case 'FDA_3601':
        assembledDocument.content = this.assembleFDA3601(fdaFormData['FDA_3601']);
        assembledDocument.metadata.sources = ['workflow.manufacturerInfo', 'workflow.feeInfo'];
        break;

      case 'FDA_3654':
        assembledDocument.content = this.assembleFDA3654(fdaFormData['FDA_3654']);
        assembledDocument.metadata.sources = ['workflow.certificationInfo', 'workflow.clinicalData'];
        break;

      case 'eSTAR_FULL':
        assembledDocument.content = this.assembleFullESTAR(mappedSections, fdaFormData);
        assembledDocument.metadata.sources = Object.keys(mappedSections);
        break;

      default:
        // Assemble generic document from mapped sections
        assembledDocument.content = this.assembleGenericDocument(mappedSections);
        assembledDocument.metadata.sources = Object.keys(mappedSections);
    }

    // Calculate completeness
    const requiredFields = this.getRequiredFieldsForDocument(documentType);
    const filledFields = this.countFilledFields(documentType === 'eSTAR_FULL' ? mappedSections : fdaFormData[documentType]);
    assembledDocument.metadata.completeness = (filledFields / requiredFields.length) * 100;

    return assembledDocument;
  }

  /**
   * Helper: Assemble FDA Form 3514 content
   */
  private assembleFDA3514(data: any): string {
    return `
FDA FORM 3514 - CDRH PREMARKET NOTIFICATION COVER SHEET

APPLICANT INFORMATION
=====================
Applicant Name: ${data.applicant_name}
Contact Person: ${data.contact_name}
Phone Number: ${data.contact_phone}
Email Address: ${data.contact_email}
Establishment Registration: ${data.establishment_registration}

DEVICE INFORMATION
==================
Device Trade Name: ${data.device_name}
Device Classification: ${data.device_class}
Product Code: ${data.product_code}
Submission Type: ${data.submission_type}

Submitted Date: ${new Date().toLocaleDateString()}
    `.trim();
  }

  /**
   * Helper: Assemble FDA Form 3881 content
   */
  private assembleFDA3881(data: any): string {
    return `
FDA FORM 3881 - INDICATIONS FOR USE STATEMENT

Device Name: ${data.device_name}

Indications for Use:
${data.indications_for_use}

☐ Prescription Use (Part 21 CFR 801 Subpart D): ${data.prescription_use ? '☑' : '☐'}
☐ Over-The-Counter Use (21 CFR 801 Subpart C): ${data.over_counter_use ? '☑' : '☐'}

Patient Population:
${data.patient_population || 'N/A'}

Comparison to Predicate Device:
${data.comparison_predicate || 'See Substantial Equivalence section'}
    `.trim();
  }

  /**
   * Helper: Assemble FDA Form 3601 content
   */
  private assembleFDA3601(data: any): string {
    return `
FDA FORM 3601 - USER FEE COVER SHEET

APPLICANT INFORMATION
=====================
Applicant Name: ${data.applicant_name}

FEE INFORMATION
===============
Fee Category: ${data.fee_category}
Payment Method: ${data.payment_method}
Reference Number: ${data.reference_number || 'Pending'}
Small Business Certification: ${data.small_business ? 'Yes' : 'No'}
Fee Amount: $${data.fee_amount || 'TBD'}
    `.trim();
  }

  /**
   * Helper: Assemble FDA Form 3654 content
   */
  private assembleFDA3654(data: any): string {
    return `
FDA FORM 3654 - CERTIFICATION/DISCLOSURE STATEMENT

I, ${data.certifier_name}, ${data.certifier_title}, certify that:

☑ I have reviewed the information contained in this 510(k) submission
☑ The information provided is complete and accurate
☑ All required documentation is included

Clinical Studies Conducted: ${data.clinical_studies ? 'Yes' : 'No'}
Financial Interests Disclosure: ${data.financial_interests ? 'Yes - See attached disclosure' : 'No financial interests to disclose'}

Signature: _______________________
Date: ${data.signature_date}
    `.trim();
  }

  /**
   * Helper: Assemble full eSTAR document
   */
  private assembleFullESTAR(mappedSections: Record<string, any>, fdaFormData: Record<string, any>): string {
    const sections: string[] = ['# FDA eSTAR SUBMISSION DOCUMENT\n'];
    
    // Add FDA forms at the beginning
    sections.push('## ADMINISTRATIVE FORMS\n');
    sections.push('### Form FDA 3514 - Cover Sheet');
    sections.push(this.assembleFDA3514(fdaFormData['FDA_3514']));
    sections.push('\n### Form FDA 3881 - Indications for Use');
    sections.push(this.assembleFDA3881(fdaFormData['FDA_3881']));
    
    // Add mapped sections
    for (const [sectionId, sectionData] of Object.entries(mappedSections)) {
      const sectionInfo = this.getSectionStructure(sectionId);
      if (sectionInfo) {
        sections.push(`\n## ${sectionInfo.title.toUpperCase()}`);
        for (const [field, value] of Object.entries(sectionData as any)) {
          sections.push(`**${field}**: ${value}`);
        }
      }
    }
    
    return sections.join('\n');
  }

  /**
   * Helper: Assemble generic document from mapped sections
   */
  private assembleGenericDocument(mappedSections: Record<string, any>): string {
    const sections: string[] = [];
    
    for (const [sectionId, sectionData] of Object.entries(mappedSections)) {
      sections.push(`[${sectionId}]`);
      for (const [field, value] of Object.entries(sectionData as any)) {
        sections.push(`${field}: ${value}`);
      }
      sections.push('');
    }
    
    return sections.join('\n');
  }

  /**
   * Helper: Get required fields for a document type
   */
  private getRequiredFieldsForDocument(documentType: string): string[] {
    if (FDA_FORMS[documentType]) {
      return Object.entries(FDA_FORMS[documentType])
        .filter(([_, field]) => field.required)
        .map(([fieldId, _]) => fieldId);
    }
    
    // Default required fields for eSTAR
    return ['device_name', 'intended_use', 'manufacturer_name', 'product_code'];
  }

  /**
   * Helper: Count filled fields in data
   */
  private countFilledFields(data: any): number {
    if (!data) return 0;
    
    return Object.values(data).filter(value => 
      value !== null && 
      value !== undefined && 
      value !== '' &&
      value !== false
    ).length;
  }

  /**
   * Helper: Persist smart links to database
   */
  private async persistSmartLinks(projectId: number, smartLinks: any): Promise<void> {
    try {
      // Store in fda510kDataMappings table
      await db!.insert(fda510kDataMappings).values({
        organizationId: smartLinks.organizationId,
        mappingCode: `SMART_LINK_${projectId}_${Date.now()}`,
        mappingName: `Smart Links for Project ${projectId}`,
        sourceType: 'workflow_data',
        sourceReference: JSON.stringify(smartLinks.fieldMappings),
        targetTemplate: 'smart_links',
        targetField: projectId.toString(),
        transformationType: 'smart_sync',
        transformationRules: JSON.stringify({
          bidirectional: true,
          syncMode: 'real-time'
        }),
        validationRules: JSON.stringify(smartLinks.syncStatus),
        isActive: true,
        createdBy: 1,
        updatedBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error persisting smart links:', error);
    }
  }
}

export default CrossReferenceMapper;