// Pre-configured templates for different FDA device classifications and types
export const DEVICE_TEMPLATES = {
  // Class I Templates
  class_i_general: {
    name: 'Class I - General Controls',
    description: 'Template for Class I devices subject to general controls only',
    deviceClassification: 'I',
    submissionType: 'exempt',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: false,
      hasBiocompatibility: false,
      hasClinicalData: false,
      hasAI: false,
      estimatedDuration: '3',
      priority: 'low'
    },
    requiredSections: [
      'device_description',
      'intended_use',
      'labeling',
      'registration_listing'
    ],
    documentMapping: {
      'device_description': 'eSTAR.section_5.1',
      'intended_use': 'eSTAR.section_5.2',
      'labeling': 'eSTAR.section_12'
    }
  },

  class_i_reserved: {
    name: 'Class I - Reserved',
    description: 'Template for Class I reserved devices requiring 510(k)',
    deviceClassification: 'I',
    submissionType: 'traditional',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: false,
      hasBiocompatibility: true,
      hasClinicalData: false,
      hasAI: false,
      estimatedDuration: '6',
      priority: 'medium'
    },
    requiredSections: [
      'device_description',
      'intended_use',
      'substantial_equivalence',
      'performance_data',
      'labeling'
    ],
    documentMapping: {
      'device_description': 'eSTAR.section_5.1',
      'intended_use': 'eSTAR.section_5.2',
      'substantial_equivalence': 'eSTAR.section_6',
      'performance_data': 'eSTAR.section_9',
      'labeling': 'eSTAR.section_12'
    }
  },

  // Class II Templates
  class_ii_traditional: {
    name: 'Class II - Traditional 510(k)',
    description: 'Standard template for Class II devices requiring traditional 510(k)',
    deviceClassification: 'II',
    submissionType: 'traditional',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: false,
      hasBiocompatibility: true,
      hasClinicalData: false,
      hasAI: false,
      estimatedDuration: '6',
      priority: 'medium'
    },
    requiredSections: [
      'device_description',
      'intended_use',
      'substantial_equivalence',
      'performance_data',
      'biocompatibility',
      'software_validation',
      'sterility_assurance',
      'labeling'
    ],
    documentMapping: {
      'device_description': 'eSTAR.section_5.1',
      'intended_use': 'eSTAR.section_5.2',
      'substantial_equivalence': 'eSTAR.section_6',
      'performance_data': 'eSTAR.section_9',
      'biocompatibility': 'eSTAR.section_10',
      'software_validation': 'eSTAR.section_11',
      'sterility_assurance': 'eSTAR.section_8',
      'labeling': 'eSTAR.section_12'
    }
  },

  class_ii_special: {
    name: 'Class II - Special 510(k)',
    description: 'Template for device modifications requiring special 510(k)',
    deviceClassification: 'II',
    submissionType: 'special',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: false,
      hasBiocompatibility: true,
      hasClinicalData: false,
      hasAI: false,
      estimatedDuration: '3',
      priority: 'high'
    },
    requiredSections: [
      'device_modification_summary',
      'comparative_information',
      'design_control_activities',
      'verification_validation'
    ],
    documentMapping: {
      'device_modification_summary': 'eSTAR.section_5.3',
      'comparative_information': 'eSTAR.section_6.2',
      'design_control_activities': 'eSTAR.section_7',
      'verification_validation': 'eSTAR.section_9'
    }
  },

  class_ii_abbreviated: {
    name: 'Class II - Abbreviated 510(k)',
    description: 'Template using guidance documents or special controls',
    deviceClassification: 'II',
    submissionType: 'abbreviated',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: false,
      hasBiocompatibility: true,
      hasClinicalData: false,
      hasAI: false,
      estimatedDuration: '4',
      priority: 'medium'
    },
    requiredSections: [
      'device_description',
      'substantial_equivalence',
      'summary_conformance',
      'consensus_standards',
      'special_controls'
    ],
    documentMapping: {
      'device_description': 'eSTAR.section_5.1',
      'substantial_equivalence': 'eSTAR.section_6',
      'summary_conformance': 'eSTAR.section_7.1',
      'consensus_standards': 'eSTAR.section_7.2',
      'special_controls': 'eSTAR.section_7.3'
    }
  },

  // Software/Digital Health Templates
  software_samd: {
    name: 'Software as Medical Device (SaMD)',
    description: 'Template for standalone software medical devices',
    deviceClassification: 'II',
    submissionType: 'traditional',
    defaultValues: {
      hasSoftware: true,
      hasCybersecurity: true,
      hasSterility: false,
      hasBiocompatibility: false,
      hasClinicalData: false,
      hasAI: false,
      estimatedDuration: '9',
      priority: 'high'
    },
    requiredSections: [
      'software_description',
      'level_of_concern',
      'software_requirements',
      'software_design',
      'verification_validation',
      'cybersecurity_documentation',
      'clinical_validation',
      'human_factors'
    ],
    documentMapping: {
      'software_description': 'eSTAR.section_11.1',
      'level_of_concern': 'eSTAR.section_11.2',
      'software_requirements': 'eSTAR.section_11.3',
      'software_design': 'eSTAR.section_11.4',
      'verification_validation': 'eSTAR.section_11.5',
      'cybersecurity_documentation': 'eSTAR.section_11.6',
      'clinical_validation': 'eSTAR.section_13',
      'human_factors': 'eSTAR.section_14'
    }
  },

  software_ai_ml: {
    name: 'AI/ML-Enabled Medical Device',
    description: 'Template for devices using artificial intelligence or machine learning',
    deviceClassification: 'II',
    submissionType: 'traditional',
    defaultValues: {
      hasSoftware: true,
      hasCybersecurity: true,
      hasSterility: false,
      hasBiocompatibility: false,
      hasClinicalData: true,
      hasAI: true,
      estimatedDuration: '12',
      priority: 'critical'
    },
    requiredSections: [
      'algorithm_description',
      'training_data',
      'performance_testing',
      'clinical_validation',
      'bias_mitigation',
      'continuous_learning',
      'cybersecurity_ml',
      'transparency_explainability'
    ],
    documentMapping: {
      'algorithm_description': 'eSTAR.section_11.7',
      'training_data': 'eSTAR.section_11.8',
      'performance_testing': 'eSTAR.section_11.9',
      'clinical_validation': 'eSTAR.section_13',
      'bias_mitigation': 'eSTAR.section_11.10',
      'continuous_learning': 'eSTAR.section_11.11',
      'cybersecurity_ml': 'eSTAR.section_11.6',
      'transparency_explainability': 'eSTAR.section_11.12'
    }
  },

  // IVD Templates
  ivd_traditional: {
    name: 'In Vitro Diagnostic (IVD)',
    description: 'Template for in vitro diagnostic devices',
    deviceClassification: 'II',
    submissionType: 'traditional',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: false,
      hasBiocompatibility: false,
      hasClinicalData: true,
      hasAI: false,
      estimatedDuration: '9',
      priority: 'high'
    },
    requiredSections: [
      'device_description',
      'intended_use_ivd',
      'analytical_performance',
      'clinical_performance',
      'reagent_stability',
      'quality_control',
      'reference_materials',
      'labeling_ivd'
    ],
    documentMapping: {
      'device_description': 'eSTAR.section_5.1',
      'intended_use_ivd': 'eSTAR.section_5.2',
      'analytical_performance': 'eSTAR.section_15.1',
      'clinical_performance': 'eSTAR.section_15.2',
      'reagent_stability': 'eSTAR.section_15.3',
      'quality_control': 'eSTAR.section_15.4',
      'reference_materials': 'eSTAR.section_15.5',
      'labeling_ivd': 'eSTAR.section_12'
    }
  },

  // Combination Products
  combination_drug_device: {
    name: 'Drug-Device Combination',
    description: 'Template for combination products with drug components',
    deviceClassification: 'II',
    submissionType: 'traditional',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: true,
      hasBiocompatibility: true,
      hasClinicalData: true,
      hasAI: false,
      estimatedDuration: '12',
      priority: 'critical'
    },
    requiredSections: [
      'device_description',
      'drug_component',
      'combination_rationale',
      'drug_device_interaction',
      'pharmacokinetics',
      'sterility_assurance',
      'biocompatibility',
      'clinical_studies',
      'labeling_combination'
    ],
    documentMapping: {
      'device_description': 'eSTAR.section_5.1',
      'drug_component': 'eSTAR.section_16.1',
      'combination_rationale': 'eSTAR.section_16.2',
      'drug_device_interaction': 'eSTAR.section_16.3',
      'pharmacokinetics': 'eSTAR.section_16.4',
      'sterility_assurance': 'eSTAR.section_8',
      'biocompatibility': 'eSTAR.section_10',
      'clinical_studies': 'eSTAR.section_13',
      'labeling_combination': 'eSTAR.section_12'
    }
  },

  // Implantable Devices
  implantable_device: {
    name: 'Implantable Medical Device',
    description: 'Template for permanently implantable devices',
    deviceClassification: 'II',
    submissionType: 'traditional',
    defaultValues: {
      hasSoftware: false,
      hasCybersecurity: false,
      hasSterility: true,
      hasBiocompatibility: true,
      hasClinicalData: true,
      hasAI: false,
      estimatedDuration: '12',
      priority: 'critical'
    },
    requiredSections: [
      'device_description',
      'materials_characterization',
      'biocompatibility_comprehensive',
      'sterility_validation',
      'shelf_life',
      'mri_safety',
      'clinical_data',
      'post_market_surveillance',
      'labeling'
    ],
    documentMapping: {
      'device_description': 'eSTAR.section_5.1',
      'materials_characterization': 'eSTAR.section_10.1',
      'biocompatibility_comprehensive': 'eSTAR.section_10.2',
      'sterility_validation': 'eSTAR.section_8',
      'shelf_life': 'eSTAR.section_9.3',
      'mri_safety': 'eSTAR.section_9.4',
      'clinical_data': 'eSTAR.section_13',
      'post_market_surveillance': 'eSTAR.section_17',
      'labeling': 'eSTAR.section_12'
    }
  }
};

// Helper function to get template by key
export function getTemplate(templateKey) {
  return DEVICE_TEMPLATES[templateKey] || null;
}

// Helper function to get templates by classification
export function getTemplatesByClassification(classification) {
  return Object.entries(DEVICE_TEMPLATES)
    .filter(([_, template]) => template.deviceClassification === classification)
    .map(([key, template]) => ({ key, ...template }));
}

// Helper function to apply template to form data
export function applyTemplateToForm(templateKey, currentFormData = {}) {
  const template = getTemplate(templateKey);
  if (!template) return currentFormData;

  return {
    ...currentFormData,
    deviceClassification: template.deviceClassification,
    submissionType: template.submissionType,
    ...template.defaultValues,
    templateId: templateKey,
    requiredSections: template.requiredSections,
    documentMapping: template.documentMapping
  };
}

// Helper function to get all available templates
export function getAllTemplates() {
  return Object.entries(DEVICE_TEMPLATES).map(([key, template]) => ({
    key,
    ...template
  }));
}

// Helper function to validate if all required sections are filled
export function validateRequiredSections(templateKey, collectedData) {
  const template = getTemplate(templateKey);
  if (!template) return { isValid: true, missingSections: [] };

  const missingSections = [];
  for (const section of template.requiredSections) {
    if (!collectedData[section] || Object.keys(collectedData[section]).length === 0) {
      missingSections.push(section);
    }
  }

  return {
    isValid: missingSections.length === 0,
    missingSections
  };
}