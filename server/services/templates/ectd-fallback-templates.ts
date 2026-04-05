/**
 * eCTD fallback templates — static data extracted from server/index.ts
 * Based on FDA ICH guidelines and eCTD v4.0 structure
 */

export const fallbackTemplates = [
  // MODULE 1 - REGIONAL ADMINISTRATIVE INFORMATION
  {
    id: 1,
    name: 'Module_1_1_Form_1571',
    title: 'Module 1.1 - Form FDA 1571',
    template_name: 'Module 1.1 - Form FDA 1571',
    region: 'FDA',
    version: '4.0',
    description: 'Form FDA 1571 - Investigational New Drug Application',
    module_number: '1',
    granule_id: 'm1-1-form1571',
    category: 'administrative',
    content: `FORM FDA 1571 - INVESTIGATIONAL NEW DRUG APPLICATION

DEPARTMENT OF HEALTH AND HUMAN SERVICES
FOOD AND DRUG ADMINISTRATION

IND NUMBER: [IND_NUMBER]
DATE OF SUBMISSION: [DATE_OF_SUBMISSION]

PART 1 - SPONSOR INFORMATION
1. NAME OF SPONSOR: [SPONSOR_NAME]
2. COMPLETE ADDRESS: [SPONSOR_ADDRESS]
3. TELEPHONE NUMBER: [SPONSOR_PHONE]
4. FAX NUMBER: [SPONSOR_FAX]
5. EMAIL ADDRESS: [SPONSOR_EMAIL]

PART 2 - DRUG INFORMATION
6. NAME OF DRUG: [DRUG_NAME]
7. CHEMICAL NAME: [CHEMICAL_NAME]
8. TRADE NAME(S): [TRADE_NAME]
9. NATIONAL DRUG CODE (NDC) NUMBER: [NDC_NUMBER]

PART 3 - INDICATION(S)
10. INDICATION(S) FOR INVESTIGATION: [INDICATION]

PART 4 - PHASE(S) OF INVESTIGATION
11. PHASE(S) OF CLINICAL INVESTIGATION TO BE CONDUCTED:
    ☐ Phase 1
    ☐ Phase 2
    ☐ Phase 3
    ☐ Other: [OTHER_PHASE]

PART 5 - SPONSOR CERTIFICATION
I certify that all information provided in this application is accurate and complete.

Sponsor or Sponsor's Authorized Representative:
Name: [SPONSOR_REP_NAME]
Title: [SPONSOR_REP_TITLE]
Signature: _________________________ Date: [SIGNATURE_DATE]

PART 6 - ATTACHMENTS
☐ Protocol(s)
☐ Investigator's Brochure
☐ Chemistry, Manufacturing, and Controls Information
☐ Pharmacology and Toxicology Information
☐ Previous Human Experience with the Drug
☐ Additional Information`,
    placeholders: {
      ind_number: '[IND_NUMBER]',
      date_of_submission: '[DATE_OF_SUBMISSION]',
      sponsor_name: '[SPONSOR_NAME]',
      sponsor_address: '[SPONSOR_ADDRESS]',
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
    },
  },
  {
    id: 2,
    name: 'Module_1_2_Cover_Letter',
    title: 'Module 1.2 - Cover Letter',
    template_name: 'Module 1.2 - Cover Letter',
    region: 'FDA',
    version: '4.0',
    description: 'Cover letter for IND submission',
    module_number: '1',
    granule_id: 'm1-2-cover-letter',
    category: 'administrative',
    content: `COVER LETTER

[DATE]

Food and Drug Administration
Center for Drug Evaluation and Research
Office of New Drugs
[DIVISION_NAME]
Silver Spring, MD 20993-0002

SUBJECT: [SUBMISSION_TYPE] - IND [IND_NUMBER]
         [DRUG_NAME] ([GENERIC_NAME])
         [INDICATION]

Dear Reviewer:

[SPONSOR_NAME] ("Sponsor") is pleased to submit this [SUBMISSION_TYPE] for IND [IND_NUMBER] for [DRUG_NAME] ([GENERIC_NAME]) for the treatment of [INDICATION].

PURPOSE OF SUBMISSION:
[PURPOSE_DESCRIPTION]

CONTENTS OF SUBMISSION:
This submission contains the following information:
• [CONTENT_ITEM_1]
• [CONTENT_ITEM_2]
• [CONTENT_ITEM_3]

REGULATORY BACKGROUND:
[REGULATORY_BACKGROUND]

PROPOSED CLINICAL DEVELOPMENT:
[CLINICAL_DEVELOPMENT_PLAN]

CONTACT INFORMATION:
Primary Contact: [PRIMARY_CONTACT_NAME]
Title: [PRIMARY_CONTACT_TITLE]
Phone: [PRIMARY_CONTACT_PHONE]
Email: [PRIMARY_CONTACT_EMAIL]

Regulatory Contact: [REGULATORY_CONTACT_NAME]
Title: [REGULATORY_CONTACT_TITLE]
Phone: [REGULATORY_CONTACT_PHONE]
Email: [REGULATORY_CONTACT_EMAIL]

We appreciate the Agency's review of this submission and look forward to your feedback.

Sincerely,

[SIGNATURE_NAME]
[SIGNATURE_TITLE]
[SPONSOR_NAME]`,
    placeholders: {
      ind_number: '[IND_NUMBER]',
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
      sponsor_name: '[SPONSOR_NAME]',
      submission_type: '[SUBMISSION_TYPE]',
    },
  },
  {
    id: 3,
    name: 'Module_1_3_1_Sponsor_Contact_Information',
    title: 'Module 1.3.1 - Sponsor Contact Information',
    template_name: 'Module 1.3.1 - Sponsor Contact Information',
    region: 'FDA',
    version: '4.0',
    description: 'Sponsor contact information and authorized representatives',
    module_number: '1',
    granule_id: 'm1-3-1-sponsor-contact',
    category: 'administrative',
    content: `SPONSOR CONTACT INFORMATION

1. SPONSOR ORGANIZATION
Organization Name: [SPONSOR_NAME]
Organization Type: [ORGANIZATION_TYPE]
Tax ID/EIN: [TAX_ID]

2. CORPORATE ADDRESS
Street Address: [CORPORATE_ADDRESS]
City: [CORPORATE_CITY]
State/Province: [CORPORATE_STATE]
ZIP/Postal Code: [CORPORATE_ZIP]
Country: [CORPORATE_COUNTRY]

3. AUTHORIZED REPRESENTATIVE
Name: [AUTHORIZED_REP_NAME]
Title: [AUTHORIZED_REP_TITLE]
Department: [AUTHORIZED_REP_DEPARTMENT]
Phone: [AUTHORIZED_REP_PHONE]
Fax: [AUTHORIZED_REP_FAX]
Email: [AUTHORIZED_REP_EMAIL]

4. REGULATORY AFFAIRS CONTACT
Name: [REGULATORY_CONTACT_NAME]
Title: [REGULATORY_CONTACT_TITLE]
Phone: [REGULATORY_CONTACT_PHONE]
Email: [REGULATORY_CONTACT_EMAIL]

5. MEDICAL AFFAIRS CONTACT
Name: [MEDICAL_CONTACT_NAME]
Title: [MEDICAL_CONTACT_TITLE]
Phone: [MEDICAL_CONTACT_PHONE]
Email: [MEDICAL_CONTACT_EMAIL]

6. PHARMACOVIGILANCE CONTACT
Name: [PV_CONTACT_NAME]
Title: [PV_CONTACT_TITLE]
Phone: [PV_CONTACT_PHONE]
Email: [PV_CONTACT_EMAIL]

7. QUALITY ASSURANCE CONTACT
Name: [QA_CONTACT_NAME]
Title: [QA_CONTACT_TITLE]
Phone: [QA_CONTACT_PHONE]
Email: [QA_CONTACT_EMAIL]

8. EMERGENCY CONTACT (24-hour)
Name: [EMERGENCY_CONTACT_NAME]
Phone: [EMERGENCY_CONTACT_PHONE]
Email: [EMERGENCY_CONTACT_EMAIL]

CERTIFICATION:
I certify that the contact information provided above is accurate and current.

Authorized Representative Signature: _________________________
Date: [CERTIFICATION_DATE]`,
    placeholders: {
      sponsor_name: '[SPONSOR_NAME]',
      organization_type: '[ORGANIZATION_TYPE]',
      corporate_address: '[CORPORATE_ADDRESS]',
      authorized_rep_name: '[AUTHORIZED_REP_NAME]',
      regulatory_contact_name: '[REGULATORY_CONTACT_NAME]',
    },
  },
  {
    id: 4,
    name: 'Module_1_20_Introduction_General_Plan',
    title: 'Module 1.20 - Introduction and General Investigational Plan',
    template_name: 'Module 1.20 - Introduction and General Investigational Plan',
    region: 'FDA',
    version: '4.0',
    description: 'Introduction and general investigational plan for IND',
    module_number: '1',
    granule_id: 'm1-20-intro-plan',
    category: 'administrative',
    content: `INTRODUCTION AND GENERAL INVESTIGATIONAL PLAN

1. INTRODUCTION

1.1 Drug Development Background
[DRUG_NAME] is a [DRUG_CLASS] being developed for the treatment of [INDICATION]. The development of [DRUG_NAME] is based on [SCIENTIFIC_RATIONALE].

1.2 Regulatory History
[REGULATORY_HISTORY_DESCRIPTION]

1.3 Unmet Medical Need
[UNMET_MEDICAL_NEED_DESCRIPTION]

2. GENERAL INVESTIGATIONAL PLAN

2.1 Overall Development Strategy
The clinical development program for [DRUG_NAME] is designed to evaluate:
• Safety and tolerability
• Pharmacokinetics and pharmacodynamics
• Efficacy in the target indication
• Optimal dosing regimen

2.2 Phase I Studies
Objective: [PHASE_I_OBJECTIVE]
Design: [PHASE_I_DESIGN]
Population: [PHASE_I_POPULATION]
Primary Endpoints: [PHASE_I_PRIMARY_ENDPOINTS]
Secondary Endpoints: [PHASE_I_SECONDARY_ENDPOINTS]

2.3 Phase II Studies
Objective: [PHASE_II_OBJECTIVE]
Design: [PHASE_II_DESIGN]
Population: [PHASE_II_POPULATION]
Primary Endpoints: [PHASE_II_PRIMARY_ENDPOINTS]
Secondary Endpoints: [PHASE_II_SECONDARY_ENDPOINTS]

2.4 Phase III Studies (if applicable)
Objective: [PHASE_III_OBJECTIVE]
Design: [PHASE_III_DESIGN]
Population: [PHASE_III_POPULATION]
Primary Endpoints: [PHASE_III_PRIMARY_ENDPOINTS]

3. RISK ASSESSMENT AND MITIGATION

3.1 Identified Risks
[IDENTIFIED_RISKS_DESCRIPTION]

3.2 Risk Mitigation Strategies
[RISK_MITIGATION_STRATEGIES]

3.3 Safety Monitoring Plan
[SAFETY_MONITORING_PLAN]

4. REGULATORY STRATEGY

4.1 Regulatory Milestones
[REGULATORY_MILESTONES]

4.2 FDA Interactions
[FDA_INTERACTIONS_PLAN]

4.3 Marketing Application Strategy
[MARKETING_APPLICATION_STRATEGY]

5. CONCLUSION
The investigational plan for [DRUG_NAME] is designed to systematically evaluate the safety and efficacy of this compound in [INDICATION] while minimizing risk to study participants.`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
      drug_class: '[DRUG_CLASS]',
      scientific_rationale: '[SCIENTIFIC_RATIONALE]',
      phase_i_objective: '[PHASE_I_OBJECTIVE]',
    },
  },

  // MODULE 2 - COMMON TECHNICAL DOCUMENT SUMMARIES
  {
    id: 5,
    name: 'Module_2_2_Introduction',
    title: 'Module 2.2 - Introduction',
    template_name: 'Module 2.2 - Introduction',
    region: 'FDA',
    version: '4.0',
    description: 'Introduction to the Common Technical Document',
    module_number: '2',
    granule_id: 'm2-2-introduction',
    category: 'summary',
    content: `MODULE 2.2 - INTRODUCTION

1. OVERVIEW
This Common Technical Document (CTD) provides a comprehensive overview of [DRUG_NAME] development program for the treatment of [INDICATION].

2. DRUG SUBSTANCE AND DRUG PRODUCT
2.1 Drug Substance
Name: [DRUG_SUBSTANCE_NAME]
Chemical Name: [CHEMICAL_NAME]
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]
CAS Number: [CAS_NUMBER]

2.2 Drug Product
Dosage Form: [DOSAGE_FORM]
Route of Administration: [ROUTE_OF_ADMINISTRATION]
Strength(s): [STRENGTH]
Container/Closure: [CONTAINER_CLOSURE]

3. THERAPEUTIC INDICATION
[DRUG_NAME] is indicated for [INDICATION_DESCRIPTION].

4. DEVELOPMENT RATIONALE
4.1 Scientific Rationale
[SCIENTIFIC_RATIONALE_DESCRIPTION]

4.2 Clinical Rationale
[CLINICAL_RATIONALE_DESCRIPTION]

5. REGULATORY BACKGROUND
5.1 Regulatory Status
[REGULATORY_STATUS_DESCRIPTION]

5.2 Regulatory Advice
[REGULATORY_ADVICE_RECEIVED]

6. RISK-BENEFIT ASSESSMENT
6.1 Benefit Assessment
[BENEFIT_ASSESSMENT]

6.2 Risk Assessment
[RISK_ASSESSMENT]

6.3 Risk-Benefit Conclusion
[RISK_BENEFIT_CONCLUSION]

7. DOCUMENT ORGANIZATION
This CTD is organized according to ICH M4 guidelines:
• Module 1: Regional Administrative Information
• Module 2: CTD Summaries
• Module 3: Quality
• Module 4: Nonclinical Study Reports
• Module 5: Clinical Study Reports`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      chemical_name: '[CHEMICAL_NAME]',
      dosage_form: '[DOSAGE_FORM]',
    },
  },
  {
    id: 6,
    name: 'Module_2_3_Quality_Overall_Summary',
    title: 'Module 2.3 - Quality Overall Summary',
    template_name: 'Module 2.3 - Quality Overall Summary',
    region: 'FDA',
    version: '4.0',
    description: 'Quality overall summary for drug substance and drug product',
    module_number: '2',
    granule_id: 'm2-3-quality-summary',
    category: 'quality',
    content: `MODULE 2.3 - QUALITY OVERALL SUMMARY

1. INTRODUCTION
This Quality Overall Summary (QOS) provides an overview of the quality aspects of [DRUG_NAME] drug substance and drug product.

2. DRUG SUBSTANCE

2.1 General Information
Name: [DRUG_SUBSTANCE_NAME]
Manufacturer: [DRUG_SUBSTANCE_MANUFACTURER]
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]

2.2 Manufacturing Process
Manufacturing Site: [MANUFACTURING_SITE]
Manufacturing Process: [MANUFACTURING_PROCESS_DESCRIPTION]
Critical Process Parameters: [CRITICAL_PROCESS_PARAMETERS]

2.3 Control of Drug Substance
Specification: [DRUG_SUBSTANCE_SPECIFICATION]
Analytical Methods: [ANALYTICAL_METHODS]
Batch Analysis: [BATCH_ANALYSIS_RESULTS]

2.4 Stability
Stability Conditions: [STABILITY_CONDITIONS]
Stability Results: [STABILITY_RESULTS]
Proposed Storage Conditions: [PROPOSED_STORAGE_CONDITIONS]

3. DRUG PRODUCT

3.1 Description and Composition
Dosage Form: [DOSAGE_FORM]
Composition: [COMPOSITION_DESCRIPTION]
Container/Closure System: [CONTAINER_CLOSURE_SYSTEM]

3.2 Pharmaceutical Development
Formulation Development: [FORMULATION_DEVELOPMENT]
Manufacturing Process Development: [PROCESS_DEVELOPMENT]
Container/Closure Selection: [CONTAINER_CLOSURE_SELECTION]

3.3 Manufacturing Process
Manufacturing Site: [DRUG_PRODUCT_MANUFACTURING_SITE]
Batch Formula: [BATCH_FORMULA]
Manufacturing Process: [DRUG_PRODUCT_MANUFACTURING_PROCESS]
Process Controls: [PROCESS_CONTROLS]

3.4 Control of Drug Product
Specification: [DRUG_PRODUCT_SPECIFICATION]
Analytical Methods: [DRUG_PRODUCT_ANALYTICAL_METHODS]
Batch Analysis: [DRUG_PRODUCT_BATCH_ANALYSIS]

3.5 Stability
Stability Protocol: [STABILITY_PROTOCOL]
Stability Results: [DRUG_PRODUCT_STABILITY_RESULTS]
Proposed Shelf Life: [PROPOSED_SHELF_LIFE]

4. QUALITY RISK ASSESSMENT
4.1 Risk Assessment Summary
[QUALITY_RISK_ASSESSMENT]

4.2 Risk Mitigation Strategies
[RISK_MITIGATION_STRATEGIES]

5. CONCLUSION
The quality data support the safety and efficacy of [DRUG_NAME] for the proposed indication.`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      molecular_formula: '[MOLECULAR_FORMULA]',
      dosage_form: '[DOSAGE_FORM]',
      manufacturing_site: '[MANUFACTURING_SITE]',
    },
  },
  {
    id: 7,
    name: 'Module_2_4_Nonclinical_Overview',
    title: 'Module 2.4 - Nonclinical Overview',
    template_name: 'Module 2.4 - Nonclinical Overview',
    region: 'FDA',
    version: '4.0',
    description: 'Nonclinical overview and risk assessment',
    module_number: '2',
    granule_id: 'm2-4-nonclinical-overview',
    category: 'nonclinical',
    content: `MODULE 2.4 - NONCLINICAL OVERVIEW

1. INTRODUCTION
This nonclinical overview summarizes the pharmacology, pharmacokinetics, and toxicology data for [DRUG_NAME] to support clinical development.

2. PHARMACOLOGY

2.1 Primary Pharmacodynamics
Mechanism of Action: [MECHANISM_OF_ACTION]
Target: [PRIMARY_TARGET]
In Vitro Studies: [IN_VITRO_STUDIES_SUMMARY]
In Vivo Studies: [IN_VIVO_STUDIES_SUMMARY]

2.2 Secondary Pharmacodynamics
Off-Target Effects: [OFF_TARGET_EFFECTS]
Secondary Targets: [SECONDARY_TARGETS]

2.3 Safety Pharmacology
Cardiovascular System: [CARDIOVASCULAR_FINDINGS]
Central Nervous System: [CNS_FINDINGS]
Respiratory System: [RESPIRATORY_FINDINGS]

2.4 Pharmacodynamic Drug Interactions
[PHARMACODYNAMIC_INTERACTIONS]

3. PHARMACOKINETICS

3.1 Absorption
Bioavailability: [BIOAVAILABILITY]
Absorption Rate: [ABSORPTION_RATE]
Food Effects: [FOOD_EFFECTS]

3.2 Distribution
Tissue Distribution: [TISSUE_DISTRIBUTION]
Protein Binding: [PROTEIN_BINDING]
Blood-Brain Barrier: [BBB_PENETRATION]

3.3 Metabolism
Metabolic Pathways: [METABOLIC_PATHWAYS]
Major Metabolites: [MAJOR_METABOLITES]
Enzyme Induction/Inhibition: [ENZYME_EFFECTS]

3.4 Excretion
Elimination Route: [ELIMINATION_ROUTE]
Half-life: [HALF_LIFE]
Clearance: [CLEARANCE]

4. TOXICOLOGY

4.1 Single-Dose Toxicity
Species: [SINGLE_DOSE_SPECIES]
Route: [SINGLE_DOSE_ROUTE]
Findings: [SINGLE_DOSE_FINDINGS]

4.2 Repeat-Dose Toxicity
Study Duration: [REPEAT_DOSE_DURATION]
Species: [REPEAT_DOSE_SPECIES]
NOAEL: [NOAEL]
Target Organs: [TARGET_ORGANS]

4.3 Genotoxicity
Ames Test: [AMES_RESULTS]
Chromosomal Aberration: [CHROMOSOMAL_ABERRATION_RESULTS]
Micronucleus: [MICRONUCLEUS_RESULTS]

4.4 Carcinogenicity
[CARCINOGENICITY_ASSESSMENT]

4.5 Reproductive Toxicity
Fertility: [FERTILITY_STUDIES]
Embryo-Fetal Development: [EMBRYO_FETAL_STUDIES]
Pre/Postnatal Development: [PRENATAL_STUDIES]

5. INTEGRATED RISK ASSESSMENT

5.1 Risk Characterization
[RISK_CHARACTERIZATION]

5.2 Safety Margins
[SAFETY_MARGINS]

5.3 Clinical Monitoring Recommendations
[CLINICAL_MONITORING_RECOMMENDATIONS]

6. CONCLUSION
The nonclinical data support the clinical development of [DRUG_NAME] with appropriate safety monitoring.`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      mechanism_of_action: '[MECHANISM_OF_ACTION]',
      primary_target: '[PRIMARY_TARGET]',
      bioavailability: '[BIOAVAILABILITY]',
      noael: '[NOAEL]',
    },
  },
  {
    id: 8,
    name: 'Module_2_5_Clinical_Overview',
    title: 'Module 2.5 - Clinical Overview',
    template_name: 'Module 2.5 - Clinical Overview',
    region: 'FDA',
    version: '4.0',
    description: 'Clinical overview and development plan',
    module_number: '2',
    granule_id: 'm2-5-clinical-overview',
    category: 'clinical',
    content: `MODULE 2.5 - CLINICAL OVERVIEW

1. PRODUCT DEVELOPMENT RATIONALE

1.1 Drug Class and Mechanism
[DRUG_NAME] is a [DRUG_CLASS] that [MECHANISM_DESCRIPTION]. The development rationale is based on [DEVELOPMENT_RATIONALE].

1.2 Clinical Need
[CLINICAL_NEED_DESCRIPTION]

1.3 Development Strategy
[DEVELOPMENT_STRATEGY]

2. BIOPHARMACEUTICS

2.1 Formulation Development
Dosage Form: [DOSAGE_FORM]
Formulation Strategy: [FORMULATION_STRATEGY]

2.2 Bioavailability/Bioequivalence
[BIOAVAILABILITY_ASSESSMENT]

3. CLINICAL PHARMACOLOGY

3.1 Pharmacokinetics
Absorption: [ABSORPTION_SUMMARY]
Distribution: [DISTRIBUTION_SUMMARY]
Metabolism: [METABOLISM_SUMMARY]
Excretion: [EXCRETION_SUMMARY]

3.2 Pharmacodynamics
[PHARMACODYNAMICS_SUMMARY]

3.3 Exposure-Response Relationships
[EXPOSURE_RESPONSE_RELATIONSHIPS]

4. CLINICAL EFFICACY

4.1 Study Design Overview
[STUDY_DESIGN_OVERVIEW]

4.2 Primary Efficacy Results
[PRIMARY_EFFICACY_RESULTS]

4.3 Secondary Efficacy Results
[SECONDARY_EFFICACY_RESULTS]

4.4 Subgroup Analyses
[SUBGROUP_ANALYSES]

5. CLINICAL SAFETY

5.1 Overall Safety Profile
[OVERALL_SAFETY_PROFILE]

5.2 Adverse Events
Common AEs: [COMMON_AES]
Serious AEs: [SERIOUS_AES]
Deaths: [DEATHS_SUMMARY]

5.3 Laboratory Abnormalities
[LABORATORY_ABNORMALITIES]

5.4 Vital Signs and ECG
[VITAL_SIGNS_ECG]

6. BENEFIT-RISK ASSESSMENT

6.1 Benefits
[BENEFITS_SUMMARY]

6.2 Risks
[RISKS_SUMMARY]

6.3 Benefit-Risk Conclusion
[BENEFIT_RISK_CONCLUSION]

7. LITERATURE REVIEW
[LITERATURE_REVIEW_SUMMARY]

8. CONCLUSION
The clinical data support the continued development of [DRUG_NAME] for [INDICATION].`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      drug_class: '[DRUG_CLASS]',
      indication: '[INDICATION]',
      dosage_form: '[DOSAGE_FORM]',
      development_rationale: '[DEVELOPMENT_RATIONALE]',
    },
  },

  // MODULE 3 - QUALITY DOCUMENTATION
  {
    id: 9,
    name: 'Module_3_2_A_1_Facilities_Equipment',
    title: 'Module 3.2.A.1 - Facilities and Equipment',
    template_name: 'Module 3.2.A.1 - Facilities and Equipment',
    region: 'FDA',
    version: '4.0',
    description: 'Facilities and equipment used in drug substance manufacture',
    module_number: '3',
    granule_id: 'm3-2-a-1-facilities',
    category: 'quality',
    content: `MODULE 3.2.A.1 - FACILITIES AND EQUIPMENT

1. MANUFACTURING FACILITIES

1.1 Facility Overview
Facility Name: [FACILITY_NAME]
Address: [FACILITY_ADDRESS]
Registration Number: [REGISTRATION_NUMBER]
GMP Certification: [GMP_CERTIFICATION]

1.2 Facility Description
Building Description: [BUILDING_DESCRIPTION]
Total Floor Area: [TOTAL_FLOOR_AREA]
Manufacturing Areas: [MANUFACTURING_AREAS]
Storage Areas: [STORAGE_AREAS]
Quality Control Areas: [QC_AREAS]

2. MANUFACTURING EQUIPMENT

2.1 Equipment List
[EQUIPMENT_LIST_TABLE]

2.2 Equipment Specifications
Equipment ID: [EQUIPMENT_ID]
Equipment Type: [EQUIPMENT_TYPE]
Manufacturer: [EQUIPMENT_MANUFACTURER]
Model: [EQUIPMENT_MODEL]
Capacity: [EQUIPMENT_CAPACITY]

3. UTILITIES

3.1 Water Systems
Water Quality: [WATER_QUALITY]
Water Treatment: [WATER_TREATMENT]
Distribution System: [DISTRIBUTION_SYSTEM]

3.2 Compressed Air
Air Quality: [AIR_QUALITY]
Filtration: [AIR_FILTRATION]
Testing Program: [AIR_TESTING_PROGRAM]

4. QUALITY CONTROL LABORATORY

4.1 Laboratory Facilities
Laboratory Area: [LABORATORY_AREA]
Equipment: [LABORATORY_EQUIPMENT]

4.2 Testing Capabilities
Analytical Methods: [ANALYTICAL_METHODS]
Testing Equipment: [TESTING_EQUIPMENT]

5. CONCLUSION
The facilities and equipment are suitable for the manufacture of [DRUG_SUBSTANCE_NAME] according to GMP standards.`,
    placeholders: {
      facility_name: '[FACILITY_NAME]',
      facility_address: '[FACILITY_ADDRESS]',
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      equipment_list_table: '[EQUIPMENT_LIST_TABLE]',
      gmp_certification: '[GMP_CERTIFICATION]',
    },
  },
  {
    id: 10,
    name: 'Module_3_2_P_1_Description_Composition',
    title: 'Module 3.2.P.1 - Description and Composition',
    template_name: 'Module 3.2.P.1 - Description and Composition',
    region: 'FDA',
    version: '4.0',
    description: 'Description and composition of drug product',
    module_number: '3',
    granule_id: 'm3-2-p-1-description-composition',
    category: 'quality',
    content: `MODULE 3.2.P.1 - DESCRIPTION AND COMPOSITION

1. DRUG PRODUCT DESCRIPTION

1.1 General Description
Product Name: [PRODUCT_NAME]
Dosage Form: [DOSAGE_FORM]
Route of Administration: [ROUTE_OF_ADMINISTRATION]
Physical Description: [PHYSICAL_DESCRIPTION]

1.2 Presentation
Strength(s): [STRENGTH]
Pack Size(s): [PACK_SIZE]
Container Type: [CONTAINER_TYPE]
Closure Type: [CLOSURE_TYPE]

2. COMPOSITION

2.1 Active Ingredient(s)
Active Ingredient: [ACTIVE_INGREDIENT]
Chemical Name: [CHEMICAL_NAME]
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]
Amount per Unit: [AMOUNT_PER_UNIT]

2.2 Excipients
[EXCIPIENTS_TABLE]

2.3 Batch Formula
Batch Size: [BATCH_SIZE]
[BATCH_FORMULA_TABLE]

3. PHYSICOCHEMICAL PROPERTIES

3.1 Appearance
Color: [COLOR]
Shape: [SHAPE]
Size: [SIZE]
Markings: [MARKINGS]

3.2 Identification
Identification Tests: [IDENTIFICATION_TESTS]
Acceptance Criteria: [IDENTIFICATION_CRITERIA]

4. CONTAINER CLOSURE SYSTEM

4.1 Primary Container
Container Material: [CONTAINER_MATERIAL]
Container Type: [CONTAINER_TYPE]
Container Size: [CONTAINER_SIZE]

4.2 Closure System
Closure Material: [CLOSURE_MATERIAL]
Closure Type: [CLOSURE_TYPE]
Sealing Method: [SEALING_METHOD]

5. CONCLUSION
The description and composition of [PRODUCT_NAME] are consistent with the intended therapeutic use.`,
    placeholders: {
      product_name: '[PRODUCT_NAME]',
      dosage_form: '[DOSAGE_FORM]',
      active_ingredient: '[ACTIVE_INGREDIENT]',
      excipients_table: '[EXCIPIENTS_TABLE]',
      batch_formula_table: '[BATCH_FORMULA_TABLE]',
    },
  },
  {
    id: 11,
    name: 'Module_3_2_S_1_General_Information',
    title: 'Module 3.2.S.1 - General Information',
    template_name: 'Module 3.2.S.1 - General Information',
    region: 'FDA',
    version: '4.0',
    description: 'General information about drug substance',
    module_number: '3',
    granule_id: 'm3-2-s-1-general-information',
    category: 'quality',
    content: `MODULE 3.2.S.1 - GENERAL INFORMATION

1. NOMENCLATURE

1.1 Recommended International Non-proprietary Name (INN)
INN Name: [INN_NAME]
INN Status: [INN_STATUS]

1.2 Chemical Names
IUPAC Name: [IUPAC_NAME]
Chemical Abstract Service (CAS) Name: [CAS_NAME]

1.3 Company/Code Number
Company Code: [COMPANY_CODE]
Development Code: [DEVELOPMENT_CODE]

2. STRUCTURE

2.1 Structural Formula
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]
Structural Formula: [STRUCTURAL_FORMULA]

2.2 Stereochemistry
Stereochemical Description: [STEREOCHEMISTRY]
Chiral Centers: [CHIRAL_CENTERS]

3. PHYSICOCHEMICAL PROPERTIES

3.1 Appearance
Physical State: [PHYSICAL_STATE]
Color: [COLOR]
Odor: [ODOR]

3.2 Solubility
Aqueous Solubility: [AQUEOUS_SOLUBILITY]
Organic Solvent Solubility: [ORGANIC_SOLVENT_SOLUBILITY]

3.3 Other Properties
Melting Point: [MELTINGPOINT]
Boiling Point: [BOILING_POINT]
Density: [DENSITY]

4. IDENTIFICATION

4.1 Identity Tests
Spectroscopic Methods: [SPECTROSCOPIC_METHODS]
Chromatographic Methods: [CHROMATOGRAPHIC_METHODS]

4.2 Acceptance Criteria
[IDENTIFICATION_CRITERIA]

5. PURITY

5.1 Impurities
Organic Impurities: [ORGANIC_IMPURITIES]
Inorganic Impurities: [INORGANIC_IMPURITIES]
Residual Solvents: [RESIDUAL_SOLVENTS]

5.2 Purity Tests
Assay: [ASSAY_METHOD]
Related Substances: [RELATED_SUBSTANCES]

6. CONCLUSION
The general information demonstrates that [DRUG_SUBSTANCE_NAME] is adequately characterized for pharmaceutical development.`,
    placeholders: {
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      inn_name: '[INN_NAME]',
      iupac_name: '[IUPAC_NAME]',
      molecular_formula: '[MOLECULAR_FORMULA]',
      company_code: '[COMPANY_CODE]',
    },
  },
  {
    id: 12,
    name: 'Module_4_2_3_Safety_Pharmacology',
    title: 'Module 4.2.3 - Safety Pharmacology',
    template_name: 'Module 4.2.3 - Safety Pharmacology',
    region: 'FDA',
    version: '4.0',
    description: 'Safety pharmacology studies on vital organ systems',
    module_number: '4',
    granule_id: 'm4-2-3-safety-pharmacology',
    category: 'nonclinical',
    content: `MODULE 4.2.3 - SAFETY PHARMACOLOGY

1. INTRODUCTION

1.1 Study Purpose
To investigate the potential undesirable pharmacodynamic effects of [TEST_ARTICLE_NAME] on physiological functions in relation to exposure in the therapeutic range and above.

1.2 Study Design Overview
Core Battery Studies:
• Cardiovascular System
• Central Nervous System
• Respiratory System

2. CARDIOVASCULAR SYSTEM STUDIES

2.1 In Vitro Cardiovascular Studies
2.1.1 hERG Channel Assay
Test System: [HERG_TEST_SYSTEM]
Concentrations Tested: [HERG_CONCENTRATIONS]
IC50: [HERG_IC50]
Results: [HERG_RESULTS]

2.1.2 Isolated Heart Preparations
Preparation: [ISOLATED_HEART_PREPARATION]
Parameters: [HEART_PARAMETERS]
Results: [ISOLATED_HEART_RESULTS]

2.2 In Vivo Cardiovascular Studies
2.2.1 Telemetry Study
Species: [TELEMETRY_SPECIES]
Number of Animals: [TELEMETRY_ANIMALS]
Dose Levels: [TELEMETRY_DOSES]
Parameters Measured: [TELEMETRY_PARAMETERS]

2.2.2 Results
Heart Rate: [HEART_RATE_RESULTS]
Blood Pressure: [BLOOD_PRESSURE_RESULTS]
ECG Parameters: [ECG_RESULTS]
QT Interval: [QT_INTERVAL_RESULTS]

3. CENTRAL NERVOUS SYSTEM STUDIES

3.1 Behavioral Assessment
3.1.1 Functional Observational Battery
Test System: [FOB_TEST_SYSTEM]
Dose Levels: [FOB_DOSES]
Observations: [FOB_OBSERVATIONS]

3.1.2 Motor Activity
Test System: [MOTOR_ACTIVITY_SYSTEM]
Measurement Period: [MEASUREMENT_PERIOD]
Results: [MOTOR_ACTIVITY_RESULTS]

3.2 Neurological Assessment
3.2.1 Grip Strength
Results: [GRIP_STRENGTH_RESULTS]

3.2.2 Coordination Tests
Test Method: [COORDINATION_TEST_METHOD]
Results: [COORDINATION_RESULTS]

4. RESPIRATORY SYSTEM STUDIES

4.1 Respiratory Function Assessment
4.1.1 Test System
Species: [RESPIRATORY_SPECIES]
Number of Animals: [RESPIRATORY_ANIMALS]
Dose Levels: [RESPIRATORY_DOSES]

4.1.2 Parameters Measured
Respiratory Rate: [RESPIRATORY_RATE_RESULTS]
Tidal Volume: [TIDAL_VOLUME_RESULTS]
Minute Volume: [MINUTE_VOLUME_RESULTS]

4.2 Blood Gas Analysis
pH: [PH_RESULTS]
PO2: [PO2_RESULTS]
PCO2: [PCO2_RESULTS]

5. INTEGRATED ASSESSMENT

5.1 No-Observed-Adverse-Effect Levels
Cardiovascular NOAEL: [CV_NOAEL]
CNS NOAEL: [CNS_NOAEL]
Respiratory NOAEL: [RESPIRATORY_NOAEL]

5.2 Safety Margins
Cardiovascular: [CV_SAFETY_MARGIN]
CNS: [CNS_SAFETY_MARGIN]
Respiratory: [RESPIRATORY_SAFETY_MARGIN]

6. CONCLUSION
The safety pharmacology studies demonstrate that [TEST_ARTICLE_NAME] has an acceptable safety profile for clinical development.`,
    placeholders: {
      test_article_name: '[TEST_ARTICLE_NAME]',
      herg_test_system: '[HERG_TEST_SYSTEM]',
      telemetry_species: '[TELEMETRY_SPECIES]',
      cv_noael: '[CV_NOAEL]',
      respiratory_species: '[RESPIRATORY_SPECIES]',
    },
  },
  {
    id: 13,
    name: 'Module_4_3_1_Single_Dose_Toxicity',
    title: 'Module 4.3.1 - Single Dose Toxicity',
    template_name: 'Module 4.3.1 - Single Dose Toxicity',
    region: 'FDA',
    version: '4.0',
    description: 'Single dose toxicity studies',
    module_number: '4',
    granule_id: 'm4-3-1-single-dose-toxicity',
    category: 'nonclinical',
    content: `MODULE 4.3.1 - SINGLE DOSE TOXICITY

1. STUDY OVERVIEW

1.1 Study Objectives
Primary Objective: To determine the acute toxicity of [TEST_ARTICLE_NAME] following single dose administration
Secondary Objectives:
• Determine approximate lethal dose (LD50)
• Identify target organs of toxicity
• Characterize dose-response relationship

1.2 Study Design
Study Type: Acute Toxicity Study
Study Duration: 14 days observation period
Test System: [TEST_SYSTEM]
Route of Administration: [ROUTE_OF_ADMINISTRATION]

2. MATERIALS AND METHODS

2.1 Test System
Species: [SPECIES]
Strain: [STRAIN]
Age: [AGE]
Weight: [WEIGHT_RANGE]
Sex: [SEX_DISTRIBUTION]
Number of Animals: [NUMBER_OF_ANIMALS]

2.2 Test Article
Name: [TEST_ARTICLE_NAME]
Batch Number: [BATCH_NUMBER]
Purity: [PURITY]
Formulation: [FORMULATION]

2.3 Dose Groups
[DOSE_GROUPS_TABLE]

2.4 Observations
Clinical Observations: [CLINICAL_OBSERVATIONS]
Mortality: [MORTALITY_CHECKS]
Body Weight: [BODY_WEIGHT_SCHEDULE]

3. RESULTS

3.1 Mortality
Mortality Data: [MORTALITY_DATA]
Time to Death: [TIME_TO_DEATH]
LD50 Calculation: [LD50_CALCULATION]

3.2 Clinical Observations
Clinical Signs: [CLINICAL_SIGNS]
Onset of Effects: [ONSET_OF_EFFECTS]
Duration of Effects: [DURATION_OF_EFFECTS]

3.3 Body Weight and Food Consumption
Body Weight Changes: [BODY_WEIGHT_CHANGES]
Food Consumption: [FOOD_CONSUMPTION_DATA]

3.4 Necropsy Findings
Gross Pathology: [GROSS_PATHOLOGY]
Organ Weights: [ORGAN_WEIGHTS]
Histopathology: [HISTOPATHOLOGY]

4. TOXICOKINETICS

4.1 Systemic Exposure
Cmax: [CMAX]
Tmax: [TMAX]
AUC: [AUC]
Half-life: [HALF_LIFE]

5. DISCUSSION

5.1 Dose-Response Relationship
[DOSE_RESPONSE_DISCUSSION]

5.2 Target Organ Identification
[TARGET_ORGAN_DISCUSSION]

5.3 Clinical Relevance
[CLINICAL_RELEVANCE]

6. CONCLUSION

6.1 LD50 Determination
The LD50 of [TEST_ARTICLE_NAME] in [SPECIES] is [LD50_VALUE] mg/kg following [ROUTE_OF_ADMINISTRATION] administration.

6.2 Target Organs
Primary target organs: [PRIMARY_TARGET_ORGANS]

6.3 Recommendations
Starting dose for repeat-dose studies: [RECOMMENDED_STARTING_DOSE]
Safety margin: [SAFETY_MARGIN]`,
    placeholders: {
      test_article_name: '[TEST_ARTICLE_NAME]',
      species: '[SPECIES]',
      route_of_administration: '[ROUTE_OF_ADMINISTRATION]',
      ld50_value: '[LD50_VALUE]',
      primary_target_organs: '[PRIMARY_TARGET_ORGANS]',
    },
  },

  // MODULE 3 - QUALITY DOCUMENTATION
  // (Skipping Module 3.2.A.1 and 3.2.P.1 for brevity as they are similar in structure)

  // MODULE 4 - NONCLINICAL DOCUMENTATION
  // (Skipping Module 4.2.3 and 4.3.1 for brevity)
];

