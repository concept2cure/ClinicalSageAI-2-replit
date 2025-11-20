/**
 * FDA Forms Registry - Central configuration for all SMART FDA forms
 * Defines form metadata, fields, and mappings to CERV2 workflow stages
 */

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number';
  required: boolean;
  maxLength?: number;
  options?: string[];
  workflowMapping?: {
    stage: string;
    section?: string;
    field: string;
  };
  aiSuggestionEnabled?: boolean;
  validationRule?: string;
}

export interface FDAFormDefinition {
  formId: string;
  formNumber: string;
  title: string;
  description: string;
  category: '510k' | 'PMA' | 'Clinical' | 'Special' | 'Common';
  version: string;
  lastUpdated: string;
  fields: FormField[];
  dependencies?: string[]; // Other forms that must be completed first
  autoGenerationTrigger?: {
    stage: number;
    condition?: string;
  };
}

// Registry of all FDA SMART Forms
export const FDAFormsRegistry: Record<string, FDAFormDefinition> = {
  // ============ Already Implemented Forms ============
  FDA_3514: {
    formId: 'FDA_3514',
    formNumber: '3514',
    title: 'CDRH Premarket Notification 510(k) Cover Sheet',
    description: 'Cover sheet for 510(k) premarket notification submission',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'applicant_name',
        label: 'Applicant Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'applicantName' }
      },
      {
        id: 'device_name',
        label: 'Device Trade/Proprietary Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceName' }
      }
    ],
    autoGenerationTrigger: { stage: 0 }
  },

  FDA_3601: {
    formId: 'FDA_3601',
    formNumber: '3601',
    title: 'Medical Device User Fee Cover Sheet',
    description: 'User fee information for medical device submissions',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [],
    autoGenerationTrigger: { stage: 0 }
  },

  FDA_3881: {
    formId: 'FDA_3881',
    formNumber: '3881',
    title: 'Indications for Use Statement',
    description: 'Statement of indications for use for the medical device',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [],
    autoGenerationTrigger: { stage: 1 }
  },

  FDA_3654: {
    formId: 'FDA_3654',
    formNumber: '3654',
    title: 'Certification/Disclosure Statement',
    description: 'Certification and financial disclosure statement',
    category: 'Common',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [],
    autoGenerationTrigger: { stage: 5 }
  },

  // ============ New 510(k) Forms ============
  FDA_3872: {
    formId: 'FDA_3872',
    formNumber: '3872',
    title: '510(k) Summary or Statement',
    description: '510(k) summary of safety and effectiveness or 510(k) statement',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'submission_type',
        label: 'Submission Type',
        type: 'select',
        required: true,
        options: ['510(k) Summary', '510(k) Statement'],
        workflowMapping: { stage: 'Strategy', field: 'submissionType' }
      },
      {
        id: 'device_description',
        label: 'Device Description',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceDescription' },
        aiSuggestionEnabled: true
      },
      {
        id: 'intended_use',
        label: 'Intended Use',
        type: 'textarea',
        required: true,
        maxLength: 3000,
        workflowMapping: { stage: 'Strategy', section: 'IntendedUse', field: 'intendedUseStatement' }
      },
      {
        id: 'predicate_device',
        label: 'Predicate Device',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Strategy', section: 'PredicateSearch', field: 'predicateDevice' }
      }
    ],
    dependencies: ['FDA_3514'],
    autoGenerationTrigger: { stage: 1 }
  },

  FDA_3674: {
    formId: 'FDA_3674',
    formNumber: '3674',
    title: 'Certification Statement for Premarket Notification',
    description: 'Certification for Class III devices subject to premarket notification',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'device_classification',
        label: 'Device Classification',
        type: 'select',
        required: true,
        options: ['Class I', 'Class II', 'Class III'],
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceClass' }
      },
      {
        id: 'certification_statement',
        label: 'Certification Statement',
        type: 'checkbox',
        required: true,
        workflowMapping: { stage: 'Compliance', field: 'certificationAgreed' }
      }
    ],
    autoGenerationTrigger: { stage: 5 }
  },

  FDA_2891: {
    formId: 'FDA_2891',
    formNumber: '2891',
    title: 'Truthful and Accurate Statement',
    description: 'Statement certifying truthfulness and accuracy of submission',
    category: 'Common',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'signatory_name',
        label: 'Name of Responsible Person',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'contactName' }
      },
      {
        id: 'signatory_title',
        label: 'Title',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'contactTitle' }
      },
      {
        id: 'signature_date',
        label: 'Date',
        type: 'date',
        required: true
      }
    ],
    autoGenerationTrigger: { stage: 6 }
  },

  FDA_3455: {
    formId: 'FDA_3455',
    formNumber: '3455',
    title: 'Reprocessing/Sterilization Information',
    description: 'Information about device reprocessing and sterilization methods',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'sterilization_method',
        label: 'Sterilization Method',
        type: 'select',
        required: false,
        options: ['Steam', 'Ethylene Oxide', 'Radiation', 'Dry Heat', 'Not Applicable'],
        workflowMapping: { stage: 'Evidence', section: 'SterilizationValidation', field: 'sterilizationMethod' }
      },
      {
        id: 'sterility_assurance_level',
        label: 'Sterility Assurance Level (SAL)',
        type: 'text',
        required: false,
        workflowMapping: { stage: 'Evidence', section: 'SterilizationValidation', field: 'sal' }
      },
      {
        id: 'reprocessing_instructions',
        label: 'Reprocessing Instructions',
        type: 'textarea',
        required: false,
        maxLength: 5000,
        workflowMapping: { stage: 'Evidence', section: 'ReprocessingValidation', field: 'instructions' },
        aiSuggestionEnabled: true
      }
    ],
    autoGenerationTrigger: { stage: 3 }
  },

  // ============ PMA Forms ============
  FDA_3663: {
    formId: 'FDA_3663',
    formNumber: '3663',
    title: 'PMA Cover Sheet',
    description: 'Cover sheet for Premarket Approval Application',
    category: 'PMA',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'pma_type',
        label: 'PMA Type',
        type: 'select',
        required: true,
        options: ['Original PMA', 'Panel Track Supplement', '180-Day Supplement', 'Real-Time Supplement'],
        workflowMapping: { stage: 'Strategy', field: 'pmaType' }
      },
      {
        id: 'trade_name',
        label: 'Trade/Proprietary Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceName' }
      },
      {
        id: 'common_name',
        label: 'Common/Usual Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'commonName' }
      }
    ],
    autoGenerationTrigger: { stage: 0 }
  },

  FDA_3667: {
    formId: 'FDA_3667',
    formNumber: '3667',
    title: 'PMA Amendment',
    description: 'Amendment to a pending PMA application',
    category: 'PMA',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'pma_number',
        label: 'PMA Number',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', field: 'pmaNumber' }
      },
      {
        id: 'amendment_number',
        label: 'Amendment Number',
        type: 'number',
        required: true
      },
      {
        id: 'amendment_reason',
        label: 'Reason for Amendment',
        type: 'textarea',
        required: true,
        maxLength: 3000,
        aiSuggestionEnabled: true
      }
    ],
    dependencies: ['FDA_3663'],
    autoGenerationTrigger: { stage: 6, condition: 'amendment_required' }
  },

  // ============ Clinical Forms ============
  FDA_1571: {
    formId: 'FDA_1571',
    formNumber: '1571',
    title: 'Investigational New Drug Application (IND)',
    description: 'Application for authorization to use investigational drug/device',
    category: 'Clinical',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'ind_type',
        label: 'IND Type',
        type: 'select',
        required: true,
        options: ['Commercial IND', 'Research IND', 'Emergency Use IND', 'Treatment IND'],
        workflowMapping: { stage: 'Evidence', section: 'ClinicalStrategy', field: 'indType' }
      },
      {
        id: 'phase_of_study',
        label: 'Phase of Clinical Investigation',
        type: 'select',
        required: true,
        options: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        workflowMapping: { stage: 'Evidence', section: 'ClinicalProtocol', field: 'studyPhase' }
      }
    ],
    autoGenerationTrigger: { stage: 2 }
  },

  FDA_1572: {
    formId: 'FDA_1572',
    formNumber: '1572',
    title: 'Statement of Investigator',
    description: 'Statement by clinical investigator for drug/device studies',
    category: 'Clinical',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'investigator_name',
        label: 'Name of Investigator',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Evidence', section: 'ClinicalTeam', field: 'principalInvestigator' }
      },
      {
        id: 'study_title',
        label: 'Study Title',
        type: 'text',
        required: true,
        maxLength: 500,
        workflowMapping: { stage: 'Evidence', section: 'ClinicalProtocol', field: 'studyTitle' }
      },
      {
        id: 'facility_name',
        label: 'Facility Name and Address',
        type: 'textarea',
        required: true,
        workflowMapping: { stage: 'Evidence', section: 'ClinicalSites', field: 'primarySite' }
      }
    ],
    dependencies: ['FDA_1571'],
    autoGenerationTrigger: { stage: 2 }
  },

  // ============ Special Submission Forms ============
  FDA_3847: {
    formId: 'FDA_3847',
    formNumber: '3847',
    title: 'Q-Submission Cover Sheet',
    description: 'Cover sheet for Q-Submission (Pre-Submission) meetings with FDA',
    category: 'Special',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'q_sub_type',
        label: 'Q-Submission Type',
        type: 'select',
        required: true,
        options: ['Pre-Submission', 'Submission Issue Meeting', 'Study Risk Determination', 'Informational Meeting'],
        workflowMapping: { stage: 'Strategy', section: 'RegulatoryStrategy', field: 'qSubType' }
      },
      {
        id: 'meeting_type',
        label: 'Meeting Type Requested',
        type: 'select',
        required: true,
        options: ['In-Person', 'Teleconference', 'Written Feedback Only'],
        workflowMapping: { stage: 'Strategy', section: 'RegulatoryStrategy', field: 'meetingType' }
      }
    ],
    autoGenerationTrigger: { stage: 1, condition: 'q_submission_planned' }
  },

  FDA_3898: {
    formId: 'FDA_3898',
    formNumber: '3898',
    title: 'De Novo Classification Request',
    description: 'Request for De Novo classification for novel devices',
    category: 'Special',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'device_name',
        label: 'Device Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceName' }
      },
      {
        id: 'classification_name',
        label: 'Proposed Classification Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Strategy', field: 'proposedClassification' }
      },
      {
        id: 'novel_features',
        label: 'Novel Features Description',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        aiSuggestionEnabled: true,
        workflowMapping: { stage: 'Strategy', section: 'DeNovoJustification', field: 'novelFeatures' }
      }
    ],
    autoGenerationTrigger: { stage: 1, condition: 'de_novo_pathway' }
  },

  FDA_3853: {
    formId: 'FDA_3853',
    formNumber: '3853',
    title: 'Breakthrough Device Designation Request',
    description: 'Request for breakthrough device designation',
    category: 'Special',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'device_description',
        label: 'Device Description',
        type: 'textarea',
        required: true,
        maxLength: 3000,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceDescription' }
      },
      {
        id: 'breakthrough_criteria',
        label: 'Breakthrough Criteria Met',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        aiSuggestionEnabled: true,
        workflowMapping: { stage: 'Strategy', section: 'BreakthroughJustification', field: 'criteria' }
      },
      {
        id: 'unmet_medical_need',
        label: 'Description of Unmet Medical Need',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        aiSuggestionEnabled: true,
        workflowMapping: { stage: 'Strategy', section: 'BreakthroughJustification', field: 'unmetNeed' }
      }
    ],
    autoGenerationTrigger: { stage: 1, condition: 'breakthrough_eligible' }
  }
};

// Helper function to get forms by category
export function getFormsByCategory(category: FDAFormDefinition['category']): FDAFormDefinition[] {
  return Object.values(FDAFormsRegistry).filter(form => form.category === category);
}

// Helper function to get forms required for a specific submission type
export function getRequiredForms(submissionType: '510k' | 'PMA' | 'DeNovo'): string[] {
  switch (submissionType) {
    case '510k':
      return ['FDA_3514', 'FDA_3601', 'FDA_3881', 'FDA_3654', 'FDA_3872', 'FDA_2891'];
    case 'PMA':
      return ['FDA_3663', 'FDA_3601', 'FDA_3654', 'FDA_2891', 'FDA_1571', 'FDA_1572'];
    case 'DeNovo':
      return ['FDA_3898', 'FDA_3601', 'FDA_3654', 'FDA_2891'];
    default:
      return [];
  }
}

// Helper function to check if all dependencies are met
export function checkFormDependencies(formId: string, completedForms: string[]): boolean {
  const form = FDAFormsRegistry[formId];
  if (!form || !form.dependencies) return true;
  
  return form.dependencies.every(dep => completedForms.includes(dep));
}

// Helper function to get forms that should auto-generate at a specific stage
export function getFormsForStage(stage: number): string[] {
  return Object.entries(FDAFormsRegistry)
    .filter(([_, form]) => form.autoGenerationTrigger?.stage === stage)
    .map(([formId, _]) => formId);
}

// Class wrapper for FDAFormsRegistry
export class FDAFormsRegistryClass {
  private registry = FDAFormsRegistry;
  
  getFullRegistry(): Record<string, FDAFormDefinition> {
    return this.registry;
  }
  
  getForm(formId: string): FDAFormDefinition | undefined {
    return this.registry[formId];
  }
  
  getCategories(): string[] {
    return ['510k', 'PMA', 'Clinical', 'Special', 'Common'];
  }
  
  getFormsByCategory(category: FDAFormDefinition['category']): string[] {
    return Object.keys(this.registry).filter(
      formId => this.registry[formId].category === category
    );
  }
  
  getRequiredForms(submissionType: '510k' | 'PMA' | 'DeNovo'): string[] {
    return getRequiredForms(submissionType);
  }
  
  checkDependencies(formId: string, completedForms: string[]): boolean {
    return checkFormDependencies(formId, completedForms);
  }
  
  getFormsForStage(stage: number): string[] {
    return getFormsForStage(stage);
  }
}