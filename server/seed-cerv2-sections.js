// Seed CERV2 510(k) Sections - Complete FDA eSTAR Template
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';

const FDA_ESTAR_SECTIONS = [
  // ADMINISTRATIVE SECTIONS (1.0-10.0)
  {
    section_number: '1.0',
    section_title: 'Medical Device User Fee Cover Sheet',
    section_key: 'user-fee-cover',
    category: 'Administrative',
    display_order: 1,
    is_required: true,
    icon: 'DollarSign',
    fields: [
      { id: 'fda_form_3601', label: 'FDA Form 3601 Completed', type: 'checkbox', required: true },
      { id: 'applicant_name', label: 'Applicant Name', type: 'text', required: true },
      { id: 'payment_confirmation', label: 'Payment Confirmation Number', type: 'text', required: false },
      { id: 'fee_amount', label: 'Fee Amount', type: 'text', required: false }
    ]
  },
  {
    section_number: '2.0',
    section_title: 'CDRH Premarket Review Submission Cover Sheet',
    section_key: 'cdrh-cover-sheet',
    category: 'Administrative',
    display_order: 2,
    is_required: true,
    icon: 'FileSignature',
    fields: [
      { id: 'fda_form_3514', label: 'FDA Form 3514 Completed', type: 'checkbox', required: true },
      { id: 'submission_type', label: 'Submission Type', type: 'select', options: ['Traditional 510(k)', 'Special 510(k)', 'Abbreviated 510(k)'], required: true },
      { id: 'device_name', label: 'Device Trade Name', type: 'text', required: true },
      { id: 'device_class', label: 'Device Class', type: 'select', options: ['Class I', 'Class II', 'Class III'], required: true },
      { id: 'product_code', label: 'Product Code', type: 'text', required: true },
      { id: 'contact_name', label: 'Contact Person', type: 'text', required: true },
      { id: 'contact_phone', label: 'Phone', type: 'tel', required: true },
      { id: 'contact_email', label: 'Email', type: 'email', required: true },
      { id: 'establishment_reg', label: 'Establishment Registration Number', type: 'text', required: true },
      { id: 'duns_number', label: 'DUNS Number', type: 'text', required: false }
    ]
  },
  {
    section_number: '3.0',
    section_title: 'Executive Summary',
    section_key: 'executive-summary',
    category: 'Administrative',
    display_order: 3,
    is_required: true,
    icon: 'FileText',
    fields: [
      { id: 'device_overview', label: 'Device Overview', type: 'textarea', required: true },
      { id: 'predicate_comparison_summary', label: 'Predicate Device Comparison Summary', type: 'textarea', required: true },
      { id: 'testing_summary', label: 'Key Testing Summary', type: 'textarea', required: true },
      { id: 'se_conclusion', label: 'Substantial Equivalence Conclusion', type: 'textarea', required: true }
    ]
  },
  {
    section_number: '4.0',
    section_title: 'Indications for Use Statement',
    section_key: 'indications-for-use',
    category: 'Administrative',
    display_order: 4,
    is_required: true,
    icon: 'FileSearch',
    fields: [
      { id: 'intended_use_statement', label: 'Intended Use Statement', type: 'textarea', required: true },
      { id: 'indications_for_use', label: 'Indications for Use', type: 'textarea', required: true },
      { id: 'prescription_otc', label: 'Prescription or OTC', type: 'select', options: ['Prescription', 'OTC', 'Both'], required: true }
    ]
  },
  {
    section_number: '5.0',
    section_title: '510(k) Summary or Statement',
    section_key: '510k-summary',
    category: 'Administrative',
    display_order: 5,
    is_required: true,
    icon: 'FileMinus',
    fields: [
      { id: 'summary_type', label: 'Type', type: 'select', options: ['510(k) Summary (21 CFR 807.92)', '510(k) Statement (21 CFR 807.93)'], required: true },
      { id: 'device_characteristics', label: 'Device Physical and Performance Characteristics', type: 'textarea', required: true },
      { id: 'predicate_comparison', label: 'Comparison with Predicate', type: 'textarea', required: true },
      { id: 'summary_conclusions', label: 'Conclusions', type: 'textarea', required: true }
    ]
  },
  {
    section_number: '6.0',
    section_title: 'Truthful and Accuracy Statement',
    section_key: 'truthful-statement',
    category: 'Administrative',
    display_order: 6,
    is_required: true,
    icon: 'CheckCircle',
    fields: [
      { id: 'statement_confirmed', label: 'Statement Confirmed', type: 'checkbox', required: true },
      { id: 'signatory_name', label: 'Signatory Name', type: 'text', required: true },
      { id: 'signatory_title', label: 'Signatory Title', type: 'text', required: true },
      { id: 'signature_date', label: 'Date', type: 'date', required: true }
    ]
  },
  {
    section_number: '7.0',
    section_title: 'Class III Summary and Certification',
    section_key: 'class-iii-cert',
    category: 'Administrative',
    display_order: 7,
    is_required: false,
    icon: 'AlertCircle',
    fields: [
      { id: 'class_iii_applicable', label: 'Is this a Class III device?', type: 'checkbox', required: false },
      { id: 'class_iii_summary', label: 'Class III Summary', type: 'textarea', required: false },
      { id: 'class_iii_certification', label: 'Certification Statement', type: 'checkbox', required: false }
    ]
  },
  {
    section_number: '8.0',
    section_title: 'Financial Disclosure',
    section_key: 'financial-disclosure',
    category: 'Administrative',
    display_order: 8,
    is_required: false,
    icon: 'Banknote',
    fields: [
      { id: 'clinical_studies_conducted', label: 'Were Clinical Studies Conducted?', type: 'checkbox', required: false },
      { id: 'fda_form_3454', label: 'FDA Form 3454 Completed', type: 'checkbox', required: false },
      { id: 'disclosure_statement', label: 'Financial Disclosure Statement', type: 'textarea', required: false }
    ]
  },
  {
    section_number: '9.0',
    section_title: 'Declaration of Conformity & Summary Reports',
    section_key: 'conformity-declaration',
    category: 'Administrative',
    display_order: 9,
    is_required: false,
    icon: 'Award',
    fields: [
      { id: 'consensus_standards_list', label: 'List of Consensus Standards Used', type: 'textarea', required: false },
      { id: 'declaration_of_conformity', label: 'Declaration of Conformity Statement', type: 'textarea', required: false },
      { id: 'summary_reports', label: 'Summary Reports (if applicable)', type: 'textarea', required: false }
    ]
  },
  {
    section_number: '10.0',
    section_title: 'Executive Summary of Studies',
    section_key: 'studies-summary',
    category: 'Administrative',
    display_order: 10,
    is_required: false,
    icon: 'BookOpen',
    fields: [
      { id: 'nonclinical_studies', label: 'Non-Clinical Studies Summary', type: 'textarea', required: false },
      { id: 'clinical_studies', label: 'Clinical Studies Summary', type: 'textarea', required: false },
      { id: 'literature_references', label: 'Literature References', type: 'textarea', required: false }
    ]
  },
  
  // DEVICE DESCRIPTION GROUP (11.0-13.0)
  {
    section_number: '11.0',
    section_title: 'Device Description',
    section_key: 'device-description',
    category: 'Device',
    display_order: 11,
    is_required: true,
    icon: 'Package',
    fields: [
      { id: 'physical_description', label: 'Physical Description', type: 'textarea', required: true },
      { id: 'engineering_drawings', label: 'Engineering Drawings', type: 'file', required: false },
      { id: 'materials_of_construction', label: 'Materials of Construction', type: 'textarea', required: true },
      { id: 'device_components', label: 'Device Components', type: 'textarea', required: true },
      { id: 'accessories', label: 'Accessories', type: 'textarea', required: false },
      { id: 'packaging', label: 'Packaging Description', type: 'textarea', required: true },
      { id: 'shelf_life', label: 'Shelf Life', type: 'text', required: false }
    ]
  },
  {
    section_number: '12.0',
    section_title: 'Substantial Equivalence Discussion',
    section_key: 'substantial-equivalence',
    category: 'Device',
    display_order: 12,
    is_required: true,
    icon: 'GitCompare',
    fields: [
      { id: 'predicate_device_name', label: 'Predicate Device Name', type: 'text', required: true },
      { id: 'predicate_510k_number', label: 'Predicate 510(k) Number', type: 'text', required: true },
      { id: 'comparison_table', label: 'Subject vs. Predicate Comparison Table', type: 'textarea', required: true },
      { id: 'similarities', label: 'Similarities', type: 'textarea', required: true },
      { id: 'differences', label: 'Differences', type: 'textarea', required: true },
      { id: 'se_rationale', label: 'Substantial Equivalence Rationale', type: 'textarea', required: true }
    ]
  },
  {
    section_number: '13.0',
    section_title: 'Proposed Labeling',
    section_key: 'labeling',
    category: 'Device',
    display_order: 13,
    is_required: true,
    icon: 'Tag',
    fields: [
      { id: 'device_label', label: 'Device Label', type: 'file', required: true },
      { id: 'instructions_for_use', label: 'Instructions for Use (IFU)', type: 'file', required: true },
      { id: 'patient_labeling', label: 'Patient Labeling (if applicable)', type: 'file', required: false },
      { id: 'warnings_precautions', label: 'Warnings and Precautions', type: 'textarea', required: true },
      { id: 'contraindications', label: 'Contraindications', type: 'textarea', required: true }
    ]
  },
  
  // TESTING & PERFORMANCE GROUP (14.0-16.0)
  {
    section_number: '14.0',
    section_title: 'Sterilization and Shelf Life',
    section_key: 'sterilization',
    category: 'Testing',
    display_order: 14,
    is_required: false,
    icon: 'Droplet',
    fields: [
      { id: 'sterilization_applicable', label: 'Is Device Sterile?', type: 'checkbox', required: false },
      { id: 'sterilization_method', label: 'Sterilization Method', type: 'select', options: ['Ethylene Oxide (EtO)', 'Gamma Irradiation', 'E-Beam', 'Steam', 'Other'], required: false },
      { id: 'sterilization_validation', label: 'Sterilization Validation Summary', type: 'textarea', required: false },
      { id: 'packaging_validation', label: 'Packaging Validation', type: 'textarea', required: false },
      { id: 'shelf_life_testing', label: 'Shelf Life Testing', type: 'textarea', required: false }
    ]
  },
  {
    section_number: '15.0',
    section_title: 'Biocompatibility',
    section_key: 'biocompatibility',
    category: 'Testing',
    display_order: 15,
    is_required: false,
    icon: 'Activity',
    fields: [
      { id: 'biocompatibility_applicable', label: 'Is Biocompatibility Testing Required?', type: 'checkbox', required: false },
      { id: 'iso_10993_endpoints', label: 'ISO 10993 Endpoints Tested', type: 'textarea', required: false },
      { id: 'cytotoxicity', label: 'Cytotoxicity Results', type: 'textarea', required: false },
      { id: 'sensitization', label: 'Sensitization Results', type: 'textarea', required: false },
      { id: 'irritation', label: 'Irritation Results', type: 'textarea', required: false },
      { id: 'additional_testing', label: 'Additional Biocompatibility Testing', type: 'textarea', required: false }
    ]
  },
  {
    section_number: '16.0',
    section_title: 'Non-Clinical Performance Testing (Bench)',
    section_key: 'performance-testing',
    category: 'Testing',
    display_order: 16,
    is_required: true,
    icon: 'TestTube',
    fields: [
      { id: 'performance_testing_overview', label: 'Performance Testing Overview', type: 'textarea', required: true },
      { id: 'test_methods', label: 'Test Methods and Standards', type: 'textarea', required: true },
      { id: 'acceptance_criteria', label: 'Acceptance Criteria', type: 'textarea', required: true },
      { id: 'test_results_summary', label: 'Test Results Summary', type: 'textarea', required: true },
      { id: 'mechanical_testing', label: 'Mechanical Testing', type: 'textarea', required: false },
      { id: 'electrical_testing', label: 'Electrical Testing', type: 'textarea', required: false }
    ]
  },
  
  // SOFTWARE & ELECTRICAL GROUP (17.0-19.0)
  {
    section_number: '17.0',
    section_title: 'Software',
    section_key: 'software',
    category: 'Software',
    display_order: 17,
    is_required: false,
    icon: 'Code',
    fields: [
      { id: 'software_present', label: 'Does Device Contain Software?', type: 'checkbox', required: false },
      { id: 'software_level_of_concern', label: 'Level of Concern', type: 'select', options: ['Minor', 'Moderate', 'Major'], required: false },
      { id: 'software_description', label: 'Software Description', type: 'textarea', required: false },
      { id: 'software_architecture', label: 'Software Architecture', type: 'textarea', required: false },
      { id: 'software_validation', label: 'Software Validation Summary', type: 'textarea', required: false },
      { id: 'cybersecurity', label: 'Cybersecurity', type: 'textarea', required: false },
      { id: 'ai_ml_algorithms', label: 'AI/ML Algorithms (if applicable)', type: 'textarea', required: false }
    ]
  },
  {
    section_number: '18.0',
    section_title: 'Electromagnetic Compatibility (EMC) & Electrical Safety',
    section_key: 'emc-electrical',
    category: 'Software',
    display_order: 18,
    is_required: false,
    icon: 'Zap',
    fields: [
      { id: 'electrical_powered', label: 'Is Device Electrically Powered?', type: 'checkbox', required: false },
      { id: 'emc_testing', label: 'EMC Testing (IEC 60601-1-2)', type: 'textarea', required: false },
      { id: 'electrical_safety', label: 'Electrical Safety (IEC 60601-1)', type: 'textarea', required: false },
      { id: 'essential_performance', label: 'Essential Performance Requirements', type: 'textarea', required: false }
    ]
  },
  {
    section_number: '19.0',
    section_title: 'Interoperability',
    section_key: 'interoperability',
    category: 'Software',
    display_order: 19,
    is_required: false,
    icon: 'Network',
    fields: [
      { id: 'interoperability_applicable', label: 'Does Device Connect to Other Systems?', type: 'checkbox', required: false },
      { id: 'communication_protocols', label: 'Communication Protocols', type: 'textarea', required: false },
      { id: 'data_interfaces', label: 'Data Interfaces', type: 'textarea', required: false },
      { id: 'interoperability_testing', label: 'Interoperability Testing', type: 'textarea', required: false }
    ]
  },
  
  // CLINICAL & HUMAN FACTORS (20.0-21.0)
  {
    section_number: '20.0',
    section_title: 'Clinical Data',
    section_key: 'clinical-data',
    category: 'Clinical',
    display_order: 20,
    is_required: false,
    icon: 'Users',
    fields: [
      { id: 'clinical_data_required', label: 'Is Clinical Data Required?', type: 'checkbox', required: false },
      { id: 'clinical_study_design', label: 'Clinical Study Design', type: 'textarea', required: false },
      { id: 'study_endpoints', label: 'Study Endpoints', type: 'textarea', required: false },
      { id: 'clinical_results', label: 'Clinical Results Summary', type: 'textarea', required: false },
      { id: 'adverse_events', label: 'Adverse Events', type: 'textarea', required: false },
      { id: 'literature_data', label: 'Literature Data', type: 'textarea', required: false }
    ]
  },
  {
    section_number: '21.0',
    section_title: 'Human Factors / Usability Engineering',
    section_key: 'human-factors',
    category: 'Clinical',
    display_order: 21,
    is_required: false,
    icon: 'UserCheck',
    fields: [
      { id: 'hf_applicable', label: 'Is Human Factors Study Required?', type: 'checkbox', required: false },
      { id: 'use_related_hazards', label: 'Use-Related Hazards', type: 'textarea', required: false },
      { id: 'formative_evaluation', label: 'Formative Evaluation Summary', type: 'textarea', required: false },
      { id: 'summative_evaluation', label: 'Summative (Validation) Testing', type: 'textarea', required: false },
      { id: 'residual_risk', label: 'Residual Risk Assessment', type: 'textarea', required: false }
    ]
  },
  
  // DEVICE-SPECIFIC (22.0)
  {
    section_number: '22.0',
    section_title: 'Additional Device-Specific Requirements',
    section_key: 'device-specific',
    category: 'Additional',
    display_order: 22,
    is_required: false,
    icon: 'Settings',
    fields: [
      { id: 'animal_tissue', label: 'Animal Tissue Compliance (if applicable)', type: 'textarea', required: false },
      { id: 'nanotechnology', label: 'Nanotechnology Considerations', type: 'textarea', required: false },
      { id: 'combination_products', label: 'Combination Product Information', type: 'textarea', required: false },
      { id: 'reprocessing', label: 'Reprocessing Instructions', type: 'textarea', required: false },
      { id: 'color_additives', label: 'Color Additives FDA Approval References', type: 'textarea', required: false },
      { id: 'radiation_emitting', label: 'Radiation-Emitting Device RCHSA Compliance', type: 'textarea', required: false },
      { id: 'additional_requirements', label: 'Other Device-Specific Requirements', type: 'textarea', required: false }
    ]
  }
];

async function seedCERV2Sections() {
  try {
    console.log('🌱 Seeding CERV2 510(k) Sections...');
    
    // Get organization ID 7 (test org)
    const organizationId = 7;
    
    // Clear existing template sections for this org
    await db.execute(sql`
      DELETE FROM cerv2_510k_sections 
      WHERE organization_id = ${organizationId} AND document_id IS NULL
    `);
    
    console.log('✅ Cleared existing template sections');
    
    // Insert all sections
    for (const section of FDA_ESTAR_SECTIONS) {
      await db.execute(sql`
        INSERT INTO cerv2_510k_sections (
          organization_id,
          document_id,
          section_number,
          section_title,
          section_key,
          category,
          display_order,
          is_required,
          icon,
          fields
        ) VALUES (
          ${organizationId},
          NULL,
          ${section.section_number},
          ${section.section_title},
          ${section.section_key},
          ${section.category},
          ${section.display_order},
          ${section.is_required},
          ${section.icon},
          ${JSON.stringify(section.fields)}
        )
      `);
      console.log(`  ✓ Seeded section ${section.section_number}: ${section.section_title}`);
    }
    
    console.log(`\n✅ Successfully seeded ${FDA_ESTAR_SECTIONS.length} FDA eSTAR sections!`);
    console.log('📋 Sections by category:');
    console.log('   - Administrative: 10 sections (1.0-10.0)');
    console.log('   - Device: 3 sections (11.0-13.0)');
    console.log('   - Testing: 3 sections (14.0-16.0)');
    console.log('   - Software: 3 sections (17.0-19.0)');
    console.log('   - Clinical: 2 sections (20.0-21.0)');
    console.log('   - Additional: 1 section (22.0)');
    console.log('\n🚀 Ready for production use!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding sections:', error);
    process.exit(1);
  }
}

seedCERV2Sections();
