import { pool } from '../server/db.js';

// Real IND eCTD Templates for Module 1 and 2
const indTemplates = [
  {
    name: 'IND_Module_1_0_Cover_Letter',
    title: 'Module 1.0 - IND Cover Letter',
    region: 'FDA',
    version: '4.0',
    description: 'FDA IND submission cover letter template with all required elements',
    template_data: {
      module: '1',
      granule_id: 'm1-0-cover',
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
      placeholders: {
        sponsor_name: '[SPONSOR NAME]',
        drug_name: '[DRUG NAME]',
        generic_name: '[GENERIC NAME]',
        indication: '[INDICATION]',
        submission_type: '[SUBMISSION TYPE]',
        ind_number: '[NUMBER]',
      },
    },
  },
  {
    name: 'IND_Module_1_2_Admin_Info',
    title: 'Module 1.2 - Administrative Information',
    region: 'FDA',
    version: '4.0',
    description: 'FDA Form 1571 and administrative information for IND submissions',
    template_data: {
      module: '1',
      granule_id: 'm1-2-admin',
      content: `MODULE 1.2 - ADMINISTRATIVE INFORMATION AND FORM FDA 1571

1.2.1 FORM FDA 1571 - INVESTIGATIONAL NEW DRUG APPLICATION

IND NUMBER: [IND NUMBER]
DATE OF SUBMISSION: [DATE]

NAME OF SPONSOR: [SPONSOR NAME]
ADDRESS: [SPONSOR ADDRESS]
TELEPHONE: [PHONE]
FAX: [FAX]

DRUG SUBSTANCE/PRODUCT:
Name: [DRUG NAME]
Code Name: [CODE NAME]
Chemical/Generic Name: [GENERIC NAME]

INDICATION(S): [INDICATION]

PHASE(S) OF CLINICAL INVESTIGATION TO BE CONDUCTED:
☐ Phase 1    ☐ Phase 2    ☐ Phase 3

IND SUBMISSION TYPE:
☐ Initial IND
☐ Amendment to IND
☐ IND Safety Report
☐ Annual Report

1.2.2 DEBARMENT CERTIFICATION
[SPONSOR NAME] certifies that it did not and will not use in any capacity the services of any person debarred under section 306 of the Federal Food, Drug, and Cosmetic Act.

1.2.3 FIELD COPY CERTIFICATION
[SPONSOR NAME] certifies that a field copy has been provided to the FDA District Office.

1.2.4 RESPONSIBLE PERSONS
Sponsor's Responsible Official:
Name: [NAME]
Title: [TITLE]
Signature: ________________________
Date: [DATE]

Medical Expert:
Name: [MEDICAL EXPERT NAME]
Title: [TITLE]
Telephone: [PHONE]
Facsimile: [FAX]`,
      placeholders: {
        ind_number: '[IND NUMBER]',
        sponsor_name: '[SPONSOR NAME]',
        sponsor_address: '[SPONSOR ADDRESS]',
        drug_name: '[DRUG NAME]',
        code_name: '[CODE NAME]',
        generic_name: '[GENERIC NAME]',
      },
    },
  },
  {
    name: 'IND_Module_1_14_Labeling',
    title: 'Module 1.14 - Investigational Drug Labeling',
    region: 'FDA',
    version: '4.0',
    description: 'Clinical trial labeling templates compliant with 21 CFR 312.6',
    template_data: {
      module: '1',
      granule_id: 'm1-14-label',
      content: `MODULE 1.14 - LABELING

1.14.1 INVESTIGATIONAL DRUG LABELS

CLINICAL TRIAL LABEL - PRIMARY CONTAINER:
----------------------------------------
[DRUG NAME] ([GENERIC NAME])
[STRENGTH]
Lot #: [LOT NUMBER]
Exp. Date: [EXPIRY DATE]

FOR INVESTIGATIONAL USE ONLY
CAUTION: New Drug - Limited by Federal Law to Investigational Use

Protocol: [PROTOCOL NUMBER]
Subject ID: ________________
Visit: ________________

Dosing: [DOSING INSTRUCTIONS]
Route: [ROUTE OF ADMINISTRATION]

Storage: [STORAGE CONDITIONS]
Keep out of reach of children

[SPONSOR NAME]
[SPONSOR ADDRESS]
In case of emergency: [EMERGENCY PHONE]
----------------------------------------

1.14.2 CARTON LABEL
[Similar format with additional protocol information]

1.14.3 PHARMACY LABEL
For pharmacy dispensing with subject-specific information

1.14.4 LABEL TRANSLATIONS
[If applicable for multi-national trials]

1.14.5 INVESTIGATOR'S BROCHURE REFERENCE
The complete Investigator's Brochure is provided in Module 5`,
      placeholders: {
        drug_name: '[DRUG NAME]',
        generic_name: '[GENERIC NAME]',
        strength: '[STRENGTH]',
        lot_number: '[LOT NUMBER]',
        protocol_number: '[PROTOCOL NUMBER]',
      },
    },
  },
  {
    name: 'IND_Module_2_2_Introduction',
    title: 'Module 2.2 - CTD Introduction',
    region: 'FDA',
    version: '4.0',
    description: 'Common Technical Document introduction for IND submissions',
    template_data: {
      module: '2',
      granule_id: 'm2-2-intro',
      content: `MODULE 2.2 - COMMON TECHNICAL DOCUMENT INTRODUCTION

PRODUCT INFORMATION
Product Name: [DRUG NAME]
Generic Name: [GENERIC NAME]
Company Code: [COMPANY CODE]
Chemical Name: [CHEMICAL NAME]
Dosage Form(s): [DOSAGE FORM]
Route of Administration: [ROUTE]
Strength(s): [STRENGTHS]

PHARMACOLOGICAL CLASS: [PHARMACOLOGICAL CLASS]
ATC Code: [ATC CODE]

STRUCTURAL FORMULA:
[INSERT CHEMICAL STRUCTURE]
Molecular Formula: [MOLECULAR FORMULA]
Molecular Weight: [MOLECULAR WEIGHT]

PHYSICOCHEMICAL PROPERTIES:
Physical Description: [PHYSICAL DESCRIPTION]
Solubility: [SOLUBILITY DATA]
pH: [pH RANGE]
pKa: [pKa VALUES]
Log P: [LOG P VALUE]
Melting Point: [MELTING POINT]
Polymorphism: [POLYMORPHIC FORMS]

PROPOSED CLINICAL USE:
Indication: [PROPOSED INDICATION]
Dosing Regimen: [DOSING INFORMATION]
Duration of Treatment: [TREATMENT DURATION]
Patient Population: [TARGET POPULATION]

REGULATORY STATUS:
This is the first submission for [DRUG NAME] to FDA.
[OR describe previous regulatory interactions]

PATENT INFORMATION:
Composition of Matter: [PATENT NUMBER]
Method of Use: [PATENT NUMBER]
Expiry Dates: [DATES]`,
      placeholders: {
        drug_name: '[DRUG NAME]',
        generic_name: '[GENERIC NAME]',
        chemical_name: '[CHEMICAL NAME]',
        molecular_formula: '[MOLECULAR FORMULA]',
        indication: '[PROPOSED INDICATION]',
      },
    },
  },
  {
    name: 'IND_Module_2_3_Quality_Summary',
    title: 'Module 2.3 - Quality Overall Summary',
    region: 'FDA',
    version: '4.0',
    description: 'Comprehensive quality summary for drug substance and product',
    template_data: {
      module: '2',
      granule_id: 'm2-3-qos',
      content: `MODULE 2.3 - QUALITY OVERALL SUMMARY (QOS)

TABLE OF CONTENTS
2.3.S Drug Substance
2.3.P Drug Product
2.3.A Appendices
2.3.R Regional Information

2.3.S DRUG SUBSTANCE - [DRUG SUBSTANCE NAME]

2.3.S.1 General Information
2.3.S.1.1 Nomenclature
International Nonproprietary Name: [INN]
Compendial Name: [IF APPLICABLE]
Chemical Name (IUPAC): [IUPAC NAME]
Other Names: [LIST OTHER NAMES]
CAS Registry Number: [CAS NUMBER]

2.3.S.1.2 Structure
[INSERT CHEMICAL STRUCTURE DIAGRAM]

Molecular Formula: [MOLECULAR FORMULA]
Molecular Weight: [MOLECULAR WEIGHT]
Structural Formula: [SHOW STEREOCHEMISTRY]

2.3.S.1.3 General Properties
Appearance: [COLOR, FORM]
Melting Point: [TEMPERATURE]
Solubility: 
- Water: [mg/mL at 25°C]
- Ethanol: [mg/mL at 25°C]
- pH 1.2: [mg/mL at 37°C]
- pH 6.8: [mg/mL at 37°C]

pH (1% solution): [pH VALUE]
pKa: [pKa VALUES]
Partition Coefficient: [LOG P]
Optical Rotation: [IF CHIRAL]

2.3.S.2 Manufacture
2.3.S.2.1 Manufacturer(s)
[NAME AND ADDRESS OF MANUFACTURER]
DMF Number: [IF APPLICABLE]

2.3.S.2.2 Description of Manufacturing Process
[PROVIDE FLOW DIAGRAM]
[NARRATIVE DESCRIPTION OF EACH STEP]

2.3.S.2.3 Control of Materials
Starting Materials:
[LIST WITH SPECIFICATIONS]

Reagents and Solvents:
[LIST WITH GRADES]

2.3.S.2.4 Controls of Critical Steps
[IDENTIFY CRITICAL PROCESS PARAMETERS]
[IN-PROCESS CONTROLS]

2.3.S.2.5 Process Validation
[SUMMARY OF VALIDATION APPROACH]

2.3.S.3 Characterization
2.3.S.3.1 Elucidation of Structure
- 1H NMR: [SUMMARY]
- 13C NMR: [SUMMARY]
- Mass Spectrometry: [SUMMARY]
- IR Spectroscopy: [SUMMARY]
- X-ray Crystallography: [IF AVAILABLE]

2.3.S.3.2 Impurities
Process-Related Impurities:
[LIST WITH STRUCTURES]

Degradation Products:
[LIST WITH STRUCTURES]

2.3.S.4 Control of Drug Substance
2.3.S.4.1 Specification
[TABLE FORMAT WITH TESTS, METHODS, ACCEPTANCE CRITERIA]

2.3.S.4.2 Analytical Procedures
[SUMMARY OF METHODS]

2.3.S.4.3 Validation of Analytical Procedures
[VALIDATION PARAMETERS FOR EACH METHOD]

2.3.S.4.4 Batch Analyses
[RESULTS FOR REPRESENTATIVE BATCHES]

2.3.S.5 Reference Standards
[DESCRIPTION OF REFERENCE STANDARDS]

2.3.S.6 Container Closure System
[DESCRIPTION AND SUITABILITY DATA]

2.3.S.7 Stability
[STABILITY SUMMARY AND CONCLUSIONS]`,
      placeholders: {
        drug_substance_name: '[DRUG SUBSTANCE NAME]',
        inn: '[INN]',
        iupac_name: '[IUPAC NAME]',
        molecular_formula: '[MOLECULAR FORMULA]',
        cas_number: '[CAS NUMBER]',
      },
    },
  },
  {
    name: 'IND_Module_2_5_Clinical_Overview',
    title: 'Module 2.5 - Clinical Overview',
    region: 'FDA',
    version: '4.0',
    description: 'Comprehensive clinical overview for IND submissions',
    template_data: {
      module: '2',
      granule_id: 'm2-5-clinical',
      content: `MODULE 2.5 - CLINICAL OVERVIEW

This clinical overview provides a critical analysis of the clinical data for [DRUG NAME] in support of the proposed clinical development program for [INDICATION].

2.5.1 PRODUCT DEVELOPMENT RATIONALE

2.5.1.1 Scientific Rationale
[DRUG NAME] is a [DRUG CLASS] that targets [MECHANISM OF ACTION]. The development of this compound is based on:
- [KEY SCIENTIFIC RATIONALE POINTS]
- [UNMET MEDICAL NEED]
- [ADVANTAGES OVER CURRENT THERAPY]

2.5.1.2 Clinical Development Plan
The clinical development program consists of:
- Phase 1: [BRIEF DESCRIPTION]
- Phase 2: [BRIEF DESCRIPTION]
- Phase 3: [BRIEF DESCRIPTION]

2.5.2 OVERVIEW OF BIOPHARMACEUTICS

[DRUG NAME] exhibits the following biopharmaceutical properties:
- Bioavailability: [VALUE]
- Food Effect: [PRESENT/ABSENT]
- Dose Proportionality: [LINEAR/NONLINEAR]

2.5.3 OVERVIEW OF CLINICAL PHARMACOLOGY

2.5.3.1 Pharmacokinetics
Absorption:
- Tmax: [TIME]
- Cmax: [CONCENTRATION]
- Bioavailability: [PERCENTAGE]

Distribution:
- Volume of Distribution: [VALUE]
- Protein Binding: [PERCENTAGE]
- CNS Penetration: [YES/NO]

Metabolism:
- Primary Pathways: [PATHWAYS]
- Major Metabolites: [LIST]
- CYP Enzymes: [LIST]

Elimination:
- Half-life: [TIME]
- Clearance: [VALUE]
- Primary Route: [RENAL/HEPATIC]

2.5.3.2 Pharmacodynamics
- Target Engagement: [DESCRIPTION]
- Biomarkers: [LIST]
- PK/PD Relationship: [DESCRIPTION]

2.5.3.3 Special Populations
- Renal Impairment: [SUMMARY]
- Hepatic Impairment: [SUMMARY]
- Elderly: [SUMMARY]
- Pediatric: [IF APPLICABLE]

2.5.4 OVERVIEW OF EFFICACY

2.5.4.1 Completed Studies
[TABLE SUMMARIZING EFFICACY STUDIES]

2.5.4.2 Ongoing Studies
[TABLE SUMMARIZING ONGOING STUDIES]

2.5.4.3 Planned Studies
[DESCRIPTION OF PLANNED STUDIES]

2.5.5 OVERVIEW OF SAFETY

2.5.5.1 Exposure
Total Subjects Exposed: [NUMBER]
Exposure by Dose: [TABLE]
Exposure Duration: [TABLE]

2.5.5.2 Adverse Events
Common AEs (>10%): [LIST]
Serious AEs: [NUMBER AND TYPES]
Discontinuations due to AEs: [PERCENTAGE]

2.5.5.3 Deaths and Serious Adverse Events
[SUMMARY IF ANY]

2.5.5.4 Laboratory Findings
[SUMMARY OF SIGNIFICANT FINDINGS]

2.5.5.5 Vital Signs and ECG
[SUMMARY OF FINDINGS]

2.5.6 BENEFITS AND RISKS CONCLUSIONS

Benefits:
- [LIST KEY BENEFITS]

Risks:
- [LIST KEY RISKS]

Risk Mitigation:
- [STRATEGIES]

Overall Benefit-Risk Assessment:
[CONCLUDING STATEMENT]

2.5.7 LITERATURE REFERENCES
[KEY REFERENCES]`,
      placeholders: {
        drug_name: '[DRUG NAME]',
        indication: '[INDICATION]',
        drug_class: '[DRUG CLASS]',
        mechanism_of_action: '[MECHANISM OF ACTION]',
      },
    },
  },
];

async function addINDTemplates() {
  console.log('🚀 Adding real IND eCTD templates...');

  try {
    // Check existing templates
    const checkResult = await pool.query(
      "SELECT COUNT(*) as count FROM ectd_templates WHERE name LIKE 'IND_%'"
    );

    if (checkResult.rows[0].count > 0) {
      console.log(`⚠️  Found ${checkResult.rows[0].count} existing IND templates.`);

      // Delete existing IND templates to replace with new ones
      await pool.query("DELETE FROM ectd_templates WHERE name LIKE 'IND_%'");
      console.log('🗑️  Removed existing IND templates.');
    }

    // Insert new templates
    for (const template of indTemplates) {
      try {
        const result = await pool.query(
          `INSERT INTO ectd_templates 
           (name, title, region, version, description, template_data, organization_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name, title`,
          [
            template.name,
            template.title,
            template.region,
            template.version,
            template.description,
            JSON.stringify(template.template_data),
            1, // organization_id
          ]
        );

        console.log(`✅ Created template: ${result.rows[0].title} (ID: ${result.rows[0].id})`);
      } catch (error) {
        console.error(`❌ Failed to create template: ${template.title}`, error.message);
      }
    }

    // Verify insertion
    const finalCount = await pool.query(
      "SELECT COUNT(*) as count, STRING_AGG(title, ', ' ORDER BY id) as titles FROM ectd_templates WHERE organization_id = 1"
    );

    console.log(`\n✨ Template addition complete!`);
    console.log(`Total templates in database: ${finalCount.rows[0].count}`);
    console.log(`Templates: ${finalCount.rows[0].titles}`);
  } catch (error) {
    console.error('❌ Error adding templates:', error);
  } finally {
    await pool.end();
  }
}

// Run the script
addINDTemplates().catch(console.error);
