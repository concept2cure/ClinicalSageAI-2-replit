/**
 * IND (Investigational New Drug) Templates Data
 * 
 * Comprehensive set of templates for FDA IND submissions.
 * Follows 21 CFR Part 312 requirements.
 */

export const indTemplates = [
  {
    id: 'ind-m1-cover',
    title: 'Module 1.0 - IND Cover Letter',
    moduleId: 'module1',
    moduleSection: '1.0',
    region: 'FDA',
    version: '4.0',
    description: 'FDA IND submission cover letter template with all required elements',
    documentType: 'Administrative',
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
    sections: [
      { id: '1.0.1', title: 'Cover Letter Body', required: true }
    ]
  },
  {
    id: 'ind-m1-1571',
    title: 'Module 1.2 - Form FDA 1571 (Administrative Info)',
    moduleId: 'module1',
    moduleSection: '1.2',
    region: 'FDA',
    version: '4.0',
    description: 'FDA Form 1571 and administrative information for IND submissions',
    documentType: 'Form',
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
☐ Annual Report`,
    sections: [
      { id: '1.2.1', title: 'Form FDA 1571', required: true }
    ]
  },
  {
    id: 'ind-m2-intro',
    title: 'Module 2.2 - Introduction to the IND',
    moduleId: 'module2',
    moduleSection: '2.2',
    region: 'FDA',
    version: '2.0',
    description: 'Brief introductory statement and general investigational plan',
    documentType: 'Summary',
    content: `MODULE 2.2 - INTRODUCTION

1. NAME OF DRUG: [DRUG NAME]

2. PHARMACOLOGICAL CLASS: [CLASS]

3. STRUCTURAL FORMULA: [IMAGE OR DESCRIPTION]

4. FORMULATION: [DOSAGE FORM]

5. ROUTE OF ADMINISTRATION: [ROUTE]

6. BROAD OBJECTIVES AND PLANNED DURATION:
[Describe the overall aim of the clinical investigation and the estimated duration]

7. BRIEF SUMMARY OF PREVIOUS HUMAN EXPERIENCE:
[If applicable, summarize previous INDs or foreign marketing experience]

8. WITHDRAWAL FROM INVESTIGATION OR MARKETING:
[State if the drug has been withdrawn from investigation or marketing in any country]`,
    sections: [
      { id: '2.2.1', title: 'Introduction', required: true }
    ]
  },
  {
    id: 'ind-m2-ib',
    title: 'Module 2.3 - Investigator\'s Brochure (IB)',
    moduleId: 'module2',
    moduleSection: '2.3',
    region: 'FDA',
    version: '3.0',
    description: 'Comprehensive summary of clinical and non-clinical data',
    documentType: 'Summary',
    content: `INVESTIGATOR'S BROCHURE

EDITION NUMBER: [NUMBER]
RELEASE DATE: [DATE]

TABLE OF CONTENTS

1. SUMMARY
[A brief summary (preferably not exceeding two pages) highlighting the significant physical, chemical, pharmaceutical, pharmacological, toxicological, pharmacokinetic, metabolic, and clinical information available.]

2. INTRODUCTION
[Chemical name, generic name, trade name, active ingredients, pharmacological class, and rationale for performing research.]

3. PHYSICAL, CHEMICAL, AND PHARMACEUTICAL PROPERTIES AND FORMULATION
[Description of the drug substance and the drug product.]

4. NONCLINICAL STUDIES
4.1 Nonclinical Pharmacology
4.2 Pharmacokinetics and Product Metabolism in Animals
4.3 Toxicology

5. EFFECTS IN HUMANS
5.1 Pharmacokinetics and Product Metabolism in Humans
5.2 Safety and Efficacy
5.3 Marketing Experience

6. SUMMARY OF DATA AND GUIDANCE FOR THE INVESTIGATOR
[Interpretation of all available data and implications for future clinical trials.]`,
    sections: [
      { id: '2.3.1', title: 'Summary', required: true },
      { id: '2.3.2', title: 'Introduction', required: true },
      { id: '2.3.3', title: 'Physical/Chemical Properties', required: true },
      { id: '2.3.4', title: 'Nonclinical Studies', required: true },
      { id: '2.3.5', title: 'Effects in Humans', required: true },
      { id: '2.3.6', title: 'Guidance for Investigator', required: true }
    ]
  },
  {
    id: 'ind-m3-cmc',
    title: 'Module 3 - CMC (Chemistry, Manufacturing, and Controls)',
    moduleId: 'module3',
    moduleSection: '3.0',
    region: 'FDA',
    version: '2.5',
    description: 'CMC data for IND safety assessment',
    documentType: 'Quality',
    content: `MODULE 3 - QUALITY (CMC)

3.2.S DRUG SUBSTANCE
3.2.S.1 General Information
- Nomenclature
- Structure
- General Properties

3.2.S.2 Manufacture
- Manufacturer(s)
- Description of Manufacturing Process and Process Controls
- Control of Materials

3.2.S.3 Characterization
- Elucidation of Structure and other Characteristics
- Impurities

3.2.S.4 Control of Drug Substance
- Specification
- Analytical Procedures
- Validation of Analytical Procedures
- Batch Analyses
- Justification of Specification

3.2.S.5 Reference Standards or Materials

3.2.S.6 Container Closure System

3.2.S.7 Stability

3.2.P DRUG PRODUCT
3.2.P.1 Description and Composition of the Drug Product
3.2.P.2 Pharmaceutical Development
3.2.P.3 Manufacture
3.2.P.4 Control of Excipients
3.2.P.5 Control of Drug Product
3.2.P.6 Reference Standards or Materials
3.2.P.7 Container Closure System
3.2.P.8 Stability`,
    sections: [
      { id: '3.2.S', title: 'Drug Substance', required: true },
      { id: '3.2.P', title: 'Drug Product', required: true }
    ]
  },
  {
    id: 'ind-m4-pharm-tox',
    title: 'Module 4 - Pharmacology and Toxicology',
    moduleId: 'module4',
    moduleSection: '4.0',
    region: 'FDA',
    version: '2.0',
    description: 'Nonclinical pharmacology and toxicology summary',
    documentType: 'Nonclinical',
    content: `MODULE 4 - PHARMACOLOGY AND TOXICOLOGY

4.1 PHARMACOLOGY
- Primary Pharmacodynamics
- Secondary Pharmacodynamics
- Safety Pharmacology
- Pharmacodynamic Drug Interactions

4.2 PHARMACOKINETICS
- Absorption
- Distribution
- Metabolism
- Excretion
- Pharmacokinetic Drug Interactions

4.3 TOXICOLOGY
- Single-Dose Toxicity
- Repeat-Dose Toxicity
- Genotoxicity
- Carcinogenicity
- Reproductive and Developmental Toxicity
- Local Tolerance`,
    sections: [
      { id: '4.1', title: 'Pharmacology', required: true },
      { id: '4.2', title: 'Pharmacokinetics', required: true },
      { id: '4.3', title: 'Toxicology', required: true }
    ]
  },
  {
    id: 'ind-m5-protocol',
    title: 'Module 5 - Clinical Protocol',
    moduleId: 'module5',
    moduleSection: '5.3.5',
    region: 'FDA',
    version: '3.0',
    description: 'Clinical study protocol for the proposed investigation',
    documentType: 'Clinical',
    content: `CLINICAL STUDY PROTOCOL

TITLE: [PROTOCOL TITLE]
PROTOCOL NUMBER: [NUMBER]

1. PROTOCOL SUMMARY

2. INTRODUCTION AND RATIONALE
- Background
- Rationale

3. STUDY OBJECTIVES
- Primary Objective
- Secondary Objectives

4. STUDY DESIGN
- Overview of Study Design
- Study Population
- Inclusion/Exclusion Criteria

5. STUDY TREATMENTS
- Investigational Product
- Dosage and Administration
- Blinding/Unblinding

6. STUDY PROCEDURES AND ASSESSMENTS
- Schedule of Events
- Efficacy Assessments
- Safety Assessments

7. STATISTICAL PLAN
- Sample Size Determination
- Statistical Methods

8. ETHICS AND REGULATORY
- Institutional Review Board (IRB)
- Informed Consent`,
    sections: [
      { id: '5.1', title: 'Protocol Summary', required: true },
      { id: '5.2', title: 'Introduction', required: true },
      { id: '5.3', title: 'Objectives', required: true },
      { id: '5.4', title: 'Study Design', required: true }
    ]
  }
];
