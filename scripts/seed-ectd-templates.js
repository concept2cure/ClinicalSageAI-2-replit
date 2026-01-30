import { pool } from '../server/db.js';

// Real IND eCTD Templates for Module 1 and Module 2
const ectdTemplates = [
  // ========================
  // MODULE 1 TEMPLATES - Administrative Information
  // ========================
  {
    templateName: 'Module 1.0 - Regional Administrative Information',
    granuleId: 'm1-0',
    moduleNumber: '1',
    category: 'administrative',
    templateType: 'ich_standard',
    content: `MODULE 1.0 - REGIONAL ADMINISTRATIVE INFORMATION

This module contains administrative information about the submission specific to the FDA region.

1.0 COVER LETTER
[Insert cover letter content addressing FDA]

1.1 COMPREHENSIVE TABLE OF CONTENTS
[Auto-generated based on submission contents]

1.2 INTRODUCTORY STATEMENT
[Brief overview of the submission]`,
    placeholders: JSON.stringify({
      applicationNumber: '[APPLICATION NUMBER]',
      sponsorName: '[SPONSOR NAME]',
      submissionDate: '[SUBMISSION DATE]',
      drugName: '[DRUG NAME]',
    }),
    ichGuidance:
      'ICH M4: Common Technical Document - Module 1 contains region-specific administrative information',
    tags: ['module-1', 'administrative', 'fda-required'],
  },
  {
    templateName: 'Module 1.2 - Cover Letter',
    granuleId: 'm1-2',
    moduleNumber: '1',
    category: 'administrative',
    templateType: 'ich_standard',
    content: `[SPONSOR LETTERHEAD]

[Date]

Center for Drug Evaluation and Research
Food and Drug Administration
5901-B Ammendale Road
Beltsville, MD 20705-1266

RE: IND [NUMBER] for [DRUG NAME]
     [SUBMISSION TYPE] Submission

Dear Review Team:

[SPONSOR NAME] is pleased to submit this [SUBMISSION TYPE] for [DRUG NAME] ([GENERIC NAME]), intended for the treatment of [INDICATION].

SUBMISSION OVERVIEW:
This submission contains:
- [List key components of submission]
- [Clinical protocol details if applicable]
- [Manufacturing updates if applicable]

KEY HIGHLIGHTS:
[Bullet points of key information FDA needs to know]

REGULATORY HISTORY:
[Brief summary of previous interactions with FDA]

CONTACT INFORMATION:
Regulatory Contact: [NAME]
Phone: [PHONE]
Email: [EMAIL]

We look forward to your review and are available to address any questions.

Sincerely,

[SIGNATURE]
[NAME]
[TITLE]
[SPONSOR NAME]`,
    placeholders: JSON.stringify({
      sponsorLetterhead: '[SPONSOR LETTERHEAD]',
      indNumber: '[IND NUMBER]',
      drugName: '[DRUG NAME]',
      genericName: '[GENERIC NAME]',
      submissionType: '[SUBMISSION TYPE]',
      indication: '[INDICATION]',
    }),
    ichGuidance: 'FDA Guidance: IND Submissions - Cover Letter Requirements',
    tags: ['module-1', 'cover-letter', 'fda-required'],
  },
  {
    templateName: 'Module 1.3 - Administrative Information and Prescribing Information',
    granuleId: 'm1-3',
    moduleNumber: '1',
    category: 'administrative',
    templateType: 'ich_standard',
    content: `MODULE 1.3 - ADMINISTRATIVE INFORMATION

1.3.1 CONTACT/SPONSOR INFORMATION
Sponsor Name: [SPONSOR NAME]
Sponsor Address: [SPONSOR ADDRESS]
Sponsor Contact Person: [CONTACT NAME]
Telephone: [PHONE]
Fax: [FAX]
Email: [EMAIL]

1.3.2 AUTHORIZED AGENTS (if applicable)
Agent Name: [AGENT NAME]
Agent Address: [AGENT ADDRESS]
Authorization Letter Reference: [REFERENCE]

1.3.3 PATENT INFORMATION
Patent Number(s): [PATENT NUMBERS]
Patent Expiry Date(s): [EXPIRY DATES]
Patent Certification: [CERTIFICATION TYPE]

1.3.4 DEBARMENT CERTIFICATION
[SPONSOR NAME] certifies that it did not and will not use in any capacity the services of any person debarred under section 306 of the Federal Food, Drug, and Cosmetic Act in connection with this application.

1.3.5 FINANCIAL DISCLOSURE
[Include financial disclosure statements for clinical investigators]

1.3.6 FIELD COPY CERTIFICATION
[SPONSOR NAME] certifies that the field copy is a true copy of the technical sections of this application.`,
    placeholders: JSON.stringify({
      sponsorName: '[SPONSOR NAME]',
      sponsorAddress: '[SPONSOR ADDRESS]',
      contactName: '[CONTACT NAME]',
      patentNumbers: '[PATENT NUMBERS]',
    }),
    ichGuidance: 'FDA Form 1571 and administrative requirements for IND submissions',
    tags: ['module-1', 'administrative', 'sponsor-info'],
  },
  {
    templateName: 'Module 1.14 - Labeling',
    granuleId: 'm1-14',
    moduleNumber: '1',
    category: 'administrative',
    templateType: 'ich_standard',
    content: `MODULE 1.14 - LABELING

1.14.1 DRAFT LABELING
1.14.1.1 Investigational Drug Labels

CLINICAL TRIAL LABEL:
----------------------------------------
[DRUG NAME] ([GENERIC NAME])
[STRENGTH]
Investigational Drug - For Clinical Trial Use Only
Lot #: [LOT NUMBER]
Exp. Date: [EXPIRY DATE]
Store at: [STORAGE CONDITIONS]

Protocol: [PROTOCOL NUMBER]
Subject ID: ________________
Dosing Instructions: As directed by study protocol

[SPONSOR NAME]
[SPONSOR ADDRESS]
----------------------------------------

1.14.1.2 Carton Labeling
[Similar format with additional space for protocol-specific information]

1.14.1.3 Container Labels
[Detailed labeling for primary containers]

1.14.2 INVESTIGATOR'S BROCHURE REFERENCE
See Module 2.7.1 for complete Investigator's Brochure`,
    placeholders: JSON.stringify({
      drugName: '[DRUG NAME]',
      genericName: '[GENERIC NAME]',
      strength: '[STRENGTH]',
      storageConditions: '[STORAGE CONDITIONS]',
      protocolNumber: '[PROTOCOL NUMBER]',
    }),
    ichGuidance: '21 CFR 312.6 - Labeling of investigational drug',
    tags: ['module-1', 'labeling', 'clinical-trial'],
  },

  // ========================
  // MODULE 2 TEMPLATES - Common Technical Document Summaries
  // ========================
  {
    templateName: 'Module 2.2 - CTD Introduction',
    granuleId: 'm2-2',
    moduleNumber: '2',
    category: 'quality',
    templateType: 'ich_standard',
    content: `MODULE 2.2 - COMMON TECHNICAL DOCUMENT INTRODUCTION

GENERAL INFORMATION
Product Name: [DRUG NAME]
Generic Name: [GENERIC NAME]
Dosage Form: [DOSAGE FORM]
Route of Administration: [ROUTE]
Strength(s): [STRENGTHS]

PHARMACOLOGIC Class: [PHARMACOLOGIC CLASS]
Chemical Name: [CHEMICAL NAME]
Molecular Formula: [MOLECULAR FORMULA]
Molecular Weight: [MOLECULAR WEIGHT]
Structural Formula: [INSERT STRUCTURE]

GENERAL PROPERTIES
Physical Description: [PHYSICAL DESCRIPTION]
Solubility: [SOLUBILITY DATA]
pH: [pH RANGE]
pKa: [pKa VALUES]
Partition Coefficient: [LOG P]
Melting Point: [MELTING POINT]

PROPOSED INDICATION
[DRUG NAME] is indicated for [PROPOSED INDICATION WITH DETAILS]

PROPOSED DOSING REGIMEN
[DETAILED DOSING INFORMATION]

REGULATORY HISTORY
[SUMMARY OF REGULATORY INTERACTIONS AND MILESTONES]`,
    placeholders: JSON.stringify({
      drugName: '[DRUG NAME]',
      genericName: '[GENERIC NAME]',
      dosageForm: '[DOSAGE FORM]',
      route: '[ROUTE]',
      pharmacologicClass: '[PHARMACOLOGIC CLASS]',
      proposedIndication: '[PROPOSED INDICATION]',
    }),
    ichGuidance: 'ICH M4: CTD Introduction provides overview of the medicinal product',
    tags: ['module-2', 'ctd-introduction', 'overview'],
  },
  {
    templateName: 'Module 2.3 - Quality Overall Summary',
    granuleId: 'm2-3',
    moduleNumber: '2',
    category: 'quality',
    templateType: 'ich_standard',
    content: `MODULE 2.3 - QUALITY OVERALL SUMMARY (QOS)

2.3.S DRUG SUBSTANCE
2.3.S.1 General Information
2.3.S.1.1 Nomenclature
- Nonproprietary Name: [NONPROPRIETARY NAME]
- Compendial Name: [COMPENDIAL NAME]
- Chemical Name(s): [CHEMICAL NAMES]
- Company Code: [COMPANY CODE]
- Other Names: [OTHER NAMES]

2.3.S.1.2 Structure
[INSERT CHEMICAL STRUCTURE DIAGRAM]
Molecular Formula: [MOLECULAR FORMULA]
Molecular Weight: [MOLECULAR WEIGHT]

2.3.S.1.3 General Properties
- Physical Description: [APPEARANCE, COLOR, PHYSICAL STATE]
- Solubility Profile: [SOLUBILITY IN VARIOUS SOLVENTS]
- pH and pKa: [pH AND pKa VALUES]
- Polymorphism: [POLYMORPHIC FORMS IF APPLICABLE]
- Hygroscopicity: [HYGROSCOPIC PROPERTIES]
- Melting Point: [MELTING POINT RANGE]

2.3.S.2 Manufacture
2.3.S.2.1 Manufacturer(s)
[NAME AND ADDRESS OF MANUFACTURER(S)]

2.3.S.2.2 Description of Manufacturing Process and Process Controls
[DETAILED MANUFACTURING PROCESS FLOW DIAGRAM AND NARRATIVE]

2.3.S.2.3 Control of Materials
[RAW MATERIALS AND STARTING MATERIALS SPECIFICATIONS]

2.3.S.2.4 Controls of Critical Steps and Intermediates
[CRITICAL PROCESS PARAMETERS AND INTERMEDIATE TESTING]

2.3.S.2.5 Process Validation and/or Evaluation
[PROCESS VALIDATION SUMMARY]

2.3.S.3 Characterization
2.3.S.3.1 Elucidation of Structure and Other Characteristics
[STRUCTURE CONFIRMATION DATA: NMR, MS, IR, ETC.]

2.3.S.3.2 Impurities
[IMPURITY PROFILE AND CONTROL STRATEGY]

2.3.S.4 Control of Drug Substance
2.3.S.4.1 Specification
[DRUG SUBSTANCE SPECIFICATION TABLE]

2.3.S.4.2 Analytical Procedures
[SUMMARY OF ANALYTICAL METHODS]

2.3.S.4.3 Validation of Analytical Procedures
[ANALYTICAL METHOD VALIDATION SUMMARY]

2.3.S.4.4 Batch Analyses
[BATCH ANALYSIS RESULTS]

2.3.S.4.5 Justification of Specification
[SPECIFICATION JUSTIFICATION]

2.3.S.5 Reference Standards or Materials
[REFERENCE STANDARD INFORMATION]

2.3.S.6 Container Closure System
[CONTAINER CLOSURE DESCRIPTION AND SUITABILITY]

2.3.S.7 Stability
2.3.S.7.1 Stability Summary and Conclusions
[STABILITY DATA SUMMARY]

2.3.S.7.2 Post-approval Stability Protocol and Stability Commitment
[STABILITY PROTOCOL]

2.3.S.7.3 Stability Data
[STABILITY RESULTS TABLES]`,
    placeholders: JSON.stringify({
      nonproprietaryName: '[NONPROPRIETARY NAME]',
      molecularFormula: '[MOLECULAR FORMULA]',
      molecularWeight: '[MOLECULAR WEIGHT]',
      manufacturer: '[MANUFACTURER NAME AND ADDRESS]',
    }),
    ichGuidance: 'ICH M4Q: Quality Overall Summary - comprehensive quality information',
    tags: ['module-2', 'quality', 'qos', 'drug-substance'],
  },
  {
    templateName: 'Module 2.4 - Nonclinical Overview',
    granuleId: 'm2-4',
    moduleNumber: '2',
    category: 'nonclinical',
    templateType: 'ich_standard',
    content: `MODULE 2.4 - NONCLINICAL OVERVIEW

EXECUTIVE SUMMARY
[DRUG NAME] has been evaluated in a comprehensive nonclinical development program designed to support [INDICATION]. This overview summarizes the key findings from pharmacology, pharmacokinetics, and toxicology studies.

2.4.1 OVERVIEW OF THE NONCLINICAL TESTING STRATEGY
The nonclinical development program for [DRUG NAME] was designed in accordance with ICH guidelines and FDA guidance documents. The program included:
- Primary and secondary pharmacology studies
- Safety pharmacology assessments
- Pharmacokinetic and ADME studies
- Toxicology studies in relevant species
- Genotoxicity assessments
- Reproductive toxicology studies (if applicable)

2.4.2 PHARMACOLOGY
2.4.2.1 Primary Pharmacodynamics
Mechanism of Action: [MECHANISM OF ACTION]
Target Engagement: [TARGET BINDING/INHIBITION DATA]
In Vitro Potency: [IC50/EC50 VALUES]
In Vivo Efficacy: [SUMMARY OF EFFICACY MODELS]

2.4.2.2 Secondary Pharmacodynamics
[OFF-TARGET EFFECTS AND SELECTIVITY DATA]

2.4.2.3 Safety Pharmacology
CNS Effects: [CNS SAFETY FINDINGS]
Cardiovascular Effects: [CV SAFETY INCLUDING hERG]
Respiratory Effects: [RESPIRATORY SAFETY]

2.4.3 PHARMACOKINETICS
2.4.3.1 Absorption
- Bioavailability: [ORAL BIOAVAILABILITY %]
- Tmax: [TIME TO PEAK CONCENTRATION]
- Dose Linearity: [DOSE PROPORTIONALITY]

2.4.3.2 Distribution
- Volume of Distribution: [Vd VALUES]
- Protein Binding: [% PROTEIN BINDING]
- Tissue Distribution: [KEY TISSUE DISTRIBUTION]

2.4.3.3 Metabolism
- Metabolic Pathways: [PRIMARY METABOLIC ROUTES]
- Major Metabolites: [METABOLITE IDENTIFICATION]
- Species Differences: [METABOLIC DIFFERENCES]

2.4.3.4 Excretion
- Primary Route: [URINE/FECES %]
- Half-life: [T1/2 VALUES]
- Clearance: [CLEARANCE VALUES]

2.4.4 TOXICOLOGY
2.4.4.1 Single-Dose Toxicity
[ACUTE TOXICITY FINDINGS AND NOAEL]

2.4.4.2 Repeat-Dose Toxicity
Species Tested: [RAT, DOG, ETC.]
Duration: [4-WEEK, 13-WEEK, ETC.]
NOAEL: [NOAEL VALUES AND SAFETY MARGINS]
Target Organs: [IDENTIFIED TARGET ORGANS]

2.4.4.3 Genotoxicity
Ames Test: [POSITIVE/NEGATIVE]
Chromosomal Aberration: [RESULTS]
In Vivo Micronucleus: [RESULTS]

2.4.4.4 Carcinogenicity
[IF APPLICABLE OR JUSTIFICATION FOR ABSENCE]

2.4.4.5 Reproductive and Developmental Toxicity
[FERTILITY, EMBRYO-FETAL, PRE/POSTNATAL FINDINGS]

2.4.4.6 Local Tolerance
[INJECTION SITE REACTIONS IF APPLICABLE]

2.4.5 INTEGRATED OVERVIEW AND CONCLUSIONS
[OVERALL NONCLINICAL SAFETY ASSESSMENT]
[SAFETY MARGINS TO CLINICAL DOSES]
[RISK MITIGATION STRATEGIES]`,
    placeholders: JSON.stringify({
      drugName: '[DRUG NAME]',
      indication: '[INDICATION]',
      mechanismOfAction: '[MECHANISM OF ACTION]',
      noael: '[NOAEL VALUES]',
    }),
    ichGuidance: 'ICH M4S: Nonclinical Overview summarizing all nonclinical data',
    tags: ['module-2', 'nonclinical', 'overview', 'safety'],
  },
  {
    templateName: 'Module 2.5 - Clinical Overview',
    granuleId: 'm2-5',
    moduleNumber: '2',
    category: 'clinical',
    templateType: 'ich_standard',
    content: `MODULE 2.5 - CLINICAL OVERVIEW

This clinical overview provides a comprehensive analysis of the clinical data supporting the safety and efficacy of [DRUG NAME] for the treatment of [INDICATION].

2.5.1 PRODUCT DEVELOPMENT RATIONALE

The development of [DRUG NAME] is based on a compelling scientific rationale supported by extensive preclinical research and early clinical findings. The therapeutic target and mechanism of action provide a strong foundation for clinical development in [INDICATION].

Key Development Considerations:
- Unmet Medical Need: [DESCRIBE CURRENT TREATMENT LANDSCAPE AND GAPS]
- Therapeutic Hypothesis: [MECHANISTIC RATIONALE]
- Dose Selection Rationale: [BASIS FOR DOSE SELECTION]
- Patient Population: [TARGET POPULATION CHARACTERISTICS]

2.5.2 OVERVIEW OF BIOPHARMACEUTICS

[DRUG NAME] demonstrates favorable biopharmaceutical properties:
- Predictable pharmacokinetic profile
- Dose-proportional exposure across the therapeutic range
- No significant drug-drug interactions identified to date
- Acceptable bioavailability for the intended dosing regimen

Formulation Development:
[SUMMARY OF FORMULATION OPTIMIZATION]

2.5.3 OVERVIEW OF CLINICAL PHARMACOLOGY

2.5.3.1 Pharmacokinetics
Absorption:
- Tmax: [TIME TO PEAK]
- Bioavailability: [ABSOLUTE/RELATIVE BIOAVAILABILITY]
- Food Effect: [IMPACT OF FOOD]

Distribution:
- Volume of Distribution: [Vd]
- Protein Binding: [% BOUND]
- CNS Penetration: [IF RELEVANT]

Metabolism:
- Primary Pathways: [METABOLIC ROUTES]
- Active Metabolites: [IF APPLICABLE]
- CYP Involvement: [CYP ENZYMES]

Elimination:
- Half-life: [T1/2]
- Clearance: [CL]
- Route of Elimination: [RENAL/HEPATIC %]

2.5.3.2 Pharmacodynamics
- Mechanism of Action: [DETAILED MOA]
- PD Markers: [BIOMARKERS USED]
- PK/PD Relationship: [EXPOSURE-RESPONSE]
- Onset/Duration: [TIME COURSE OF EFFECT]

2.5.3.3 Special Populations
- Hepatic Impairment: [DOSE ADJUSTMENTS]
- Renal Impairment: [DOSE ADJUSTMENTS]
- Elderly: [AGE EFFECTS]
- Pediatric: [IF STUDIED]

2.5.4 OVERVIEW OF EFFICACY

Clinical Efficacy Program:
[TABLE: SUMMARY OF CLINICAL STUDIES]

Study | Design | N | Duration | Primary Endpoint | Result
------|--------|---|----------|------------------|--------
[STUDY ID] | [DESIGN] | [N] | [WEEKS] | [ENDPOINT] | [RESULT]

Primary Efficacy Results:
- Primary Endpoint: [ENDPOINT AND RESULTS]
- Key Secondary Endpoints: [RESULTS]
- Subgroup Analyses: [NOTABLE FINDINGS]
- Durability of Response: [LONG-TERM DATA]

2.5.5 OVERVIEW OF SAFETY

Safety Database:
- Total Exposed: [N PATIENTS]
- Exposure Duration: [PATIENT-YEARS]
- Demographics: [KEY CHARACTERISTICS]

Common Adverse Events:
[TABLE OF MOST FREQUENT AEs]

Serious Adverse Events:
- Incidence: [% SAEs]
- Relationship to Study Drug: [RELATED SAEs]
- Deaths: [IF ANY, WITH CAUSALITY]

Special Safety Topics:
[ORGAN-SPECIFIC OR CLASS EFFECTS]

Laboratory Findings:
- Hematology: [NOTABLE CHANGES]
- Chemistry: [NOTABLE CHANGES]
- Liver Function: [TRANSAMINASE DATA]

2.5.6 BENEFITS AND RISKS CONCLUSIONS

Benefits:
- [ENUMERATE KEY EFFICACY BENEFITS]
- [CLINICAL MEANINGFULNESS]
- [ADVANTAGES OVER EXISTING THERAPY]

Risks:
- [KEY SAFETY CONCERNS]
- [MANAGEABLE WITH MONITORING]
- [RISK MITIGATION STRATEGIES]

Overall Benefit-Risk Assessment:
[INTEGRATED ASSESSMENT SUPPORTING POSITIVE B-R]

2.5.7 LITERATURE REFERENCES
[KEY SUPPORTING PUBLICATIONS]`,
    placeholders: JSON.stringify({
      drugName: '[DRUG NAME]',
      indication: '[INDICATION]',
      tmax: '[TIME TO PEAK]',
      halfLife: '[T1/2]',
      primaryEndpoint: '[PRIMARY ENDPOINT]',
    }),
    ichGuidance: 'ICH M4E: Clinical Overview - critical assessment of clinical data',
    tags: ['module-2', 'clinical', 'overview', 'efficacy', 'safety'],
  },
  {
    templateName: 'Module 2.6 - Nonclinical Written and Tabulated Summaries',
    granuleId: 'm2-6',
    moduleNumber: '2',
    category: 'nonclinical',
    templateType: 'ich_standard',
    content: `MODULE 2.6 - NONCLINICAL WRITTEN AND TABULATED SUMMARIES

2.6.1 INTRODUCTION
This document provides detailed written and tabulated summaries of all nonclinical studies conducted with [DRUG NAME].

2.6.2 PHARMACOLOGY WRITTEN SUMMARY
2.6.2.1 Brief Summary
[DRUG NAME] is a [DRUG CLASS] that acts by [MECHANISM OF ACTION].

2.6.2.2 Primary Pharmacodynamics
[DETAILED DISCUSSION OF MOA AND TARGET ENGAGEMENT]

Study Reference: [STUDY NUMBER]
Species/Model: [IN VITRO/IN VIVO MODEL]
Key Findings: [RESULTS WITH STATISTICS]

2.6.2.3 Secondary Pharmacodynamics
[OFF-TARGET SCREENING RESULTS]

2.6.2.4 Safety Pharmacology
Core Battery Studies:
- CNS: [FOB, IRWIN TEST RESULTS]
- Cardiovascular: [TELEMETRY, hERG RESULTS]
- Respiratory: [PLETHYSMOGRAPHY RESULTS]

2.6.2.5 Pharmacodynamic Drug Interactions
[DDI POTENTIAL BASED ON MECHANISM]

2.6.3 PHARMACOLOGY TABULATED SUMMARY
[INSERT DETAILED TABLES OF ALL PHARMACOLOGY STUDIES]

2.6.4 PHARMACOKINETICS WRITTEN SUMMARY
2.6.4.1 Brief Summary
[OVERVIEW OF ADME PROPERTIES]

2.6.4.2 Methods of Analysis
[BIOANALYTICAL METHODS USED]

2.6.4.3 Absorption
[DETAILED ABSORPTION DATA ACROSS SPECIES]

2.6.4.4 Distribution
[TISSUE DISTRIBUTION AND PROTEIN BINDING]

2.6.4.5 Metabolism
[METABOLIC PATHWAYS AND SPECIES COMPARISON]

2.6.4.6 Excretion
[ROUTES AND RATES OF ELIMINATION]

2.6.5 PHARMACOKINETICS TABULATED SUMMARY
[COMPREHENSIVE PK PARAMETER TABLES]

2.6.6 TOXICOLOGY WRITTEN SUMMARY
2.6.6.1 Brief Summary
[OVERVIEW OF TOXICOLOGY PROGRAM AND KEY FINDINGS]

2.6.6.2 Single-Dose Toxicity
[ACUTE TOXICITY RESULTS BY SPECIES AND ROUTE]

2.6.6.3 Repeat-Dose Toxicity
Study Design Tables:
[SPECIES, DURATION, DOSES, N/GROUP]

Key Findings:
- Clinical Signs: [OBSERVATIONS]
- Body Weight/Food Consumption: [EFFECTS]
- Clinical Pathology: [HEMATOLOGY/CHEMISTRY CHANGES]
- Histopathology: [TARGET ORGAN FINDINGS]
- NOAEL: [VALUES AND SAFETY MARGINS]

2.6.6.4 Genotoxicity
[FULL BATTERY RESULTS AND INTERPRETATION]

2.6.6.5 Carcinogenicity
[IF CONDUCTED OR WAIVER JUSTIFICATION]

2.6.6.6 Reproductive and Developmental Toxicity
- Fertility: [SEGMENT I FINDINGS]
- Embryo-fetal: [SEGMENT II FINDINGS]
- Pre/postnatal: [SEGMENT III FINDINGS]

2.6.6.7 Local Tolerance
[INJECTION SITE OR TOPICAL IRRITATION]

2.6.6.8 Other Toxicity Studies
[IMMUNOTOXICITY, PHOTOTOXICITY, ETC.]

2.6.7 TOXICOLOGY TABULATED SUMMARY
[DETAILED TOXICOLOGY STUDY TABLES]`,
    placeholders: JSON.stringify({
      drugName: '[DRUG NAME]',
      drugClass: '[DRUG CLASS]',
      mechanismOfAction: '[MECHANISM OF ACTION]',
      noael: '[NOAEL VALUES]',
    }),
    ichGuidance: 'ICH M4S: Detailed nonclinical summaries with tabulated data',
    tags: ['module-2', 'nonclinical', 'written-summary', 'tabulated'],
  },
  {
    templateName: 'Module 2.7 - Clinical Summary',
    granuleId: 'm2-7',
    moduleNumber: '2',
    category: 'clinical',
    templateType: 'ich_standard',
    content: `MODULE 2.7 - CLINICAL SUMMARY

2.7.1 SUMMARY OF BIOPHARMACEUTIC STUDIES AND ASSOCIATED ANALYTICAL METHODS

2.7.1.1 Background and Overview
This section summarizes the biopharmaceutic studies conducted to support the development of [DRUG NAME] [DOSAGE FORM].

2.7.1.2 Summary of Results of Individual Studies
[TABLE: BIOPHARMACEUTIC STUDIES SUMMARY]
Study No. | Objectives | Design | Treatments | Results
----------|------------|--------|------------|--------

2.7.1.3 Comparison and Analyses of Results Across Studies
- Formulation Development: [EVOLUTION OF FORMULATION]
- Bioequivalence: [BE ASSESSMENTS]
- Food Effect: [FED VS FASTED]
- Dissolution Correlation: [IVIVC IF APPLICABLE]

2.7.1.4 Appendix
[ANALYTICAL METHOD VALIDATION SUMMARIES]

2.7.2 SUMMARY OF CLINICAL PHARMACOLOGY STUDIES

2.7.2.1 Background and Overview
The clinical pharmacology program characterized the PK, PD, and drug interaction potential of [DRUG NAME].

2.7.2.2 Summary of Results of Individual Studies
[DETAILED SUMMARIES OF EACH CLINICAL PHARMACOLOGY STUDY]

2.7.2.3 Comparison and Analyses of Results Across Studies
Population PK Analysis:
- Covariates Evaluated: [AGE, WEIGHT, SEX, ETC.]
- Significant Covariates: [FINDINGS]
- Dosing Recommendations: [ADJUSTMENTS NEEDED]

PK/PD Relationships:
- Efficacy: [EXPOSURE-RESPONSE FOR EFFICACY]
- Safety: [EXPOSURE-RESPONSE FOR SAFETY]

2.7.2.4 Special Populations
[INTRINSIC AND EXTRINSIC FACTOR EFFECTS]

2.7.2.5 Appendix
[PK PARAMETER TABLES ACROSS ALL STUDIES]

2.7.3 SUMMARY OF CLINICAL EFFICACY

2.7.3.1 Background and Overview
Clinical efficacy of [DRUG NAME] was evaluated in [N] studies including [TOTAL N] patients with [INDICATION].

2.7.3.2 Summary of Results of Individual Studies
[DETAILED STUDY SUMMARIES WITH FOREST PLOTS]

2.7.3.3 Comparison and Analyses of Results Across Studies
Meta-Analysis Results:
- Primary Endpoint: [POOLED EFFECT SIZE]
- Consistency: [I² STATISTIC]
- Subgroup Effects: [NOTABLE DIFFERENCES]

2.7.3.4 Analysis of Clinical Information Relevant to Dosing Recommendations
[DOSE-RESPONSE AND OPTIMAL DOSING]

2.7.3.5 Persistence of Efficacy and/or Tolerance Effects
[LONG-TERM EFFICACY DATA]

2.7.3.6 Appendix
[EFFICACY TABLES AND FIGURES]

2.7.4 SUMMARY OF CLINICAL SAFETY

2.7.4.1 Exposure to the Drug
Safety Population:
- Total Exposed: [N]
- Exposure by Dose: [TABLE]
- Exposure by Duration: [TABLE]

2.7.4.2 Adverse Events
Common Adverse Events (≥5%):
[TABLE BY SYSTEM ORGAN CLASS]

Serious Adverse Events:
[DETAILED LISTING WITH NARRATIVES]

2.7.4.3 Clinical Laboratory Evaluations
[SHIFT TABLES AND OUTLIER ANALYSIS]

2.7.4.4 Vital Signs, Physical Findings, and Other Observations
[SUMMARY OF CLINICALLY SIGNIFICANT CHANGES]

2.7.4.5 Safety in Special Groups and Situations
- Intrinsic Factors: [AGE, SEX, RACE EFFECTS]
- Extrinsic Factors: [DDI, FOOD EFFECTS]
- Pregnancy/Lactation: [IF APPLICABLE]

2.7.4.6 Post-marketing Data
[IF APPLICABLE FROM OTHER REGIONS]

2.7.4.7 Appendix
[COMPREHENSIVE SAFETY TABLES]

2.7.5 LITERATURE REFERENCES
[CITATIONS FOR ALL REFERENCED PUBLICATIONS]

2.7.6 SYNOPSES OF INDIVIDUAL STUDIES
[STRUCTURED SYNOPSIS FOR EACH CLINICAL STUDY]`,
    placeholders: JSON.stringify({
      drugName: '[DRUG NAME]',
      dosageForm: '[DOSAGE FORM]',
      indication: '[INDICATION]',
      totalPatients: '[TOTAL N]',
    }),
    ichGuidance: 'ICH M4E: Detailed clinical summaries with comprehensive data analysis',
    tags: ['module-2', 'clinical', 'summary', 'comprehensive'],
  },
];

async function seedTemplates() {
  logger.info('🚀 Starting eCTD template seeding...');

  try {
    // First check if templates already exist
    const checkResult = await pool.query(
      'SELECT COUNT(*) as count FROM ectd_templates WHERE organization_id = 1'
    );

    if (checkResult.rows[0].count > 0) {
      logger.info('⚠️  Templates already exist. Skipping seed to avoid duplicates.');
      logger.info(`   Found ${checkResult.rows[0].count} existing templates.`);
      return;
    }

    // Insert templates
    for (const template of ectdTemplates) {
      try {
        const result = await pool.query(
          `INSERT INTO ectd_templates 
           (organization_id, template_name, granule_id, module_number, category, 
            template_type, content, placeholders, ich_guidance, tags, 
            created_by, is_active, is_default, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id, template_name`,
          [
            1, // organization_id
            template.templateName,
            template.granuleId,
            template.moduleNumber,
            template.category,
            template.templateType,
            template.content,
            template.placeholders,
            template.ichGuidance,
            template.tags,
            1, // created_by (default user)
            true, // is_active
            false, // is_default
            '1.0', // version
          ]
        );

        logger.info(
          `✅ Created template: ${result.rows[0].template_name} (ID: ${result.rows[0].id})`
        );
      } catch (error) {
        logger.error(`❌ Failed to create template: ${template.templateName}`, error.message);
      }
    }

    // Verify insertion
    const finalCount = await pool.query(
      'SELECT COUNT(*) as count FROM ectd_templates WHERE organization_id = 1'
    );

    logger.info(`\n✨ Template seeding complete! Total templates: ${finalCount.rows[0].count}`);

    // Show summary by module
    const summaryResult = await pool.query(
      `SELECT module_number, COUNT(*) as count 
       FROM ectd_templates 
       WHERE organization_id = 1 
       GROUP BY module_number 
       ORDER BY module_number`
    );

    logger.info('\n📊 Templates by Module:');
    summaryResult.rows.forEach(row => {
      logger.info(`   Module ${row.module_number}: ${row.count} templates`);
    });
  } catch (error) {
    logger.error('❌ Error seeding templates:', error);
  } finally {
    await pool.end();
  }
}

// Run the seeder
seedTemplates().catch(console.error);
