/**
 * eCTD Document Templates
 * Comprehensive templates for all eCTD sections with guidance and regulatory requirements
 */

export const ectdTemplates = {
  // Module 1: Administrative Information
  '1.0': {
    title: 'Cover Letter',
    template: `[COMPANY LETTERHEAD]

Date: [Current Date]

Food and Drug Administration
Center for Drug Evaluation and Research
Division of [Specific Division]

Re: IND [Number] - [Drug Name]
    Submission Type: [Original/Amendment/Annual Report]

Dear Review Team,

This submission contains [brief description of submission content].

Key highlights of this submission include:
• [Highlight 1]
• [Highlight 2]
• [Highlight 3]

The following documents are included in this submission:
• Module 1: Administrative Information
• Module 2: Summaries
• Module 3: Quality
• Module 4: Nonclinical Study Reports
• Module 5: Clinical Study Reports

Contact Information:
[Regulatory Contact Name]
[Title]
[Phone] | [Email]

Sincerely,
[Signature]
[Name]
[Title]`,
    guidance: 'The cover letter should provide a clear overview of the submission and highlight key information for reviewers.',
    requirements: ['Must be on company letterhead', 'Include IND number', 'List all modules included', 'Provide contact information'],
    metadata: { fileType: 'PDF', maxSize: '10MB', required: true }
  },

  '1.2': {
    title: 'FDA Form 1571',
    template: `Form FDA 1571 - Investigational New Drug Application

1. NAME OF SPONSOR: [Company Name]
2. DATE OF SUBMISSION: [Date]
3. ADDRESS: [Complete Address]
4. TELEPHONE: [Phone] FAX: [Fax]
5. NAME OF DRUG: [Generic and Trade Names]
6. IND NUMBER: [If known]
7. INDICATION(S): [Therapeutic indication(s)]
8. PHASE(S) OF CLINICAL INVESTIGATION: □ Phase 1 □ Phase 2 □ Phase 3
9. TYPE OF SUBMISSION:
   □ Initial IND
   □ Amendment to IND
   □ Annual Report
   □ Response to Clinical Hold

10. SUBMISSION CONTAINS:
    □ Chemistry, Manufacturing, and Control Information
    □ Pharmacology and Toxicology Information
    □ Clinical Protocol(s)
    □ Clinical Investigator Information

11. CLINICAL PROTOCOL(S):
    Protocol Number: [Number]
    Protocol Title: [Title]
    Phase: [1/2/3]
    Number of Subjects: [N]

12. INVESTIGATOR INFORMATION:
    [List all investigators with qualifications]

13. SPONSOR SIGNATURE:
    I agree to conduct the investigation in accordance with 21 CFR Part 312.

    _____________________  Date: __________
    [Name and Title]`,
    guidance: 'Form 1571 is the cover sheet for IND submissions. All sections must be completed accurately.',
    requirements: ['21 CFR 312.23', 'Must be signed by sponsor', 'Include all protocol information'],
    metadata: { fileType: 'PDF', maxSize: '5MB', required: true }
  },

  '1.3.1': {
    title: 'Introductory Statement',
    template: `INTRODUCTORY STATEMENT AND GENERAL INVESTIGATIONAL PLAN

1. NAME AND DESCRIPTION OF DRUG
   Generic Name: [Name]
   Trade Name: [If applicable]
   Chemical Name: [IUPAC name]
   Molecular Formula: [Formula]
   Molecular Weight: [Weight]
   Drug Class: [Pharmacological class]

2. SUMMARY OF PREVIOUS HUMAN EXPERIENCE
   [Describe any previous human exposure to the drug, including foreign marketing experience]

3. GENERAL INVESTIGATIONAL PLAN
   3.1 Rationale for Drug Development
       [Scientific rationale and unmet medical need]
   
   3.2 Development Strategy
       [Overall clinical development plan]
   
   3.3 Indication(s) to be Studied
       [Target population and disease state]
   
   3.4 General Approach to Clinical Studies
       [Study designs, endpoints, duration]
   
   3.5 Estimated Duration of Clinical Program
       [Timeline for each phase]

4. RISK ASSESSMENT
   [Known and potential risks based on nonclinical and clinical data]

5. REGULATORY HISTORY
   [Previous regulatory interactions, if any]`,
    guidance: 'Provide comprehensive overview of the investigational drug and development plan.',
    requirements: ['Include chemical/pharmaceutical information', 'Describe clinical development strategy', 'Risk-benefit assessment'],
    metadata: { fileType: 'PDF', maxSize: '20MB', required: true }
  },

  '1.14.1': {
    title: 'Draft Labeling',
    template: `DRAFT INVESTIGATOR'S BROCHURE COVER PAGE

[DRUG NAME]
Investigator's Brochure
Edition Number: [X]
Date: [Current Date]

CONFIDENTIAL

Sponsor: [Company Name]
Address: [Complete Address]

DRAFT LABELING CONTENT:

1. DESCRIPTION
   [Drug description and formulation]

2. CLINICAL PHARMACOLOGY
   2.1 Mechanism of Action
   2.2 Pharmacokinetics
   2.3 Pharmacodynamics

3. INDICATIONS AND USAGE
   [Proposed indication(s)]

4. CONTRAINDICATIONS
   [List all contraindications]

5. WARNINGS AND PRECAUTIONS
   [Important safety information]

6. ADVERSE REACTIONS
   [Known adverse events from studies]

7. DRUG INTERACTIONS
   [Known or potential interactions]

8. USE IN SPECIFIC POPULATIONS
   8.1 Pregnancy
   8.2 Lactation
   8.3 Pediatric Use
   8.4 Geriatric Use

9. DOSAGE AND ADMINISTRATION
   [Dosing regimen and administration instructions]

10. HOW SUPPLIED
    [Available formulations and strengths]`,
    guidance: 'Draft labeling should reflect current knowledge about the investigational drug.',
    requirements: ['Follow FDA labeling guidelines', 'Include all safety information', 'Update with new data'],
    metadata: { fileType: 'PDF', maxSize: '15MB', required: false }
  },

  // Module 2: Summaries
  '2.1': {
    title: 'Table of Contents',
    template: `MODULE 2: COMMON TECHNICAL DOCUMENT SUMMARIES
TABLE OF CONTENTS

2.1 TABLE OF CONTENTS (This Document)

2.2 INTRODUCTION
    Page [X]

2.3 QUALITY OVERALL SUMMARY
    2.3.S DRUG SUBSTANCE
        2.3.S.1 General Information.................[X]
        2.3.S.2 Manufacture.........................[X]
        2.3.S.3 Characterization....................[X]
        2.3.S.4 Control of Drug Substance...........[X]
        2.3.S.5 Reference Standards.................[X]
        2.3.S.6 Container Closure System............[X]
        2.3.S.7 Stability...........................[X]
    
    2.3.P DRUG PRODUCT
        2.3.P.1 Description and Composition.........[X]
        2.3.P.2 Pharmaceutical Development..........[X]
        2.3.P.3 Manufacture.........................[X]
        2.3.P.4 Control of Excipients...............[X]
        2.3.P.5 Control of Drug Product.............[X]
        2.3.P.6 Reference Standards.................[X]
        2.3.P.7 Container Closure System............[X]
        2.3.P.8 Stability...........................[X]

2.4 NONCLINICAL OVERVIEW
    Page [X]

2.5 CLINICAL OVERVIEW
    Page [X]

2.6 NONCLINICAL WRITTEN AND TABULATED SUMMARIES
    2.6.1 Introduction.........................[X]
    2.6.2 Pharmacology Written Summary.........[X]
    2.6.3 Pharmacology Tabulated Summary.......[X]
    2.6.4 Pharmacokinetics Written Summary.....[X]
    2.6.5 Pharmacokinetics Tabulated Summary...[X]
    2.6.6 Toxicology Written Summary...........[X]
    2.6.7 Toxicology Tabulated Summary.........[X]

2.7 CLINICAL SUMMARY
    2.7.1 Summary of Biopharmaceutic Studies...[X]
    2.7.2 Summary of Clinical Pharmacology.....[X]
    2.7.3 Summary of Clinical Efficacy.........[X]
    2.7.4 Summary of Clinical Safety...........[X]
    2.7.5 References............................[X]
    2.7.6 Individual Study Synopses............[X]`,
    guidance: 'The table of contents should list all documents in Module 2 with page numbers.',
    requirements: ['Include all sections', 'Accurate page numbers', 'Hyperlinks if electronic'],
    metadata: { fileType: 'PDF', maxSize: '5MB', required: true }
  },

  '2.2': {
    title: 'Introduction to Summary',
    template: `MODULE 2.2: INTRODUCTION

1. PRODUCT DEVELOPMENT RATIONALE

[Provide scientific rationale for the development of the drug product, including:]
• Unmet medical need
• Therapeutic advantages over existing treatments
• Novel mechanism of action or formulation benefits

2. QUALITY SUMMARY OVERVIEW

[Brief overview of drug substance and drug product characteristics:]
• Chemical/biological nature
• Formulation approach
• Manufacturing strategy
• Key quality attributes

3. NONCLINICAL DEVELOPMENT OVERVIEW

[Summary of nonclinical development program:]
• Pharmacology studies conducted
• Toxicology program overview
• Key safety findings
• Support for first-in-human dosing

4. CLINICAL DEVELOPMENT OVERVIEW

[Summary of clinical development strategy:]
• Phase 1: [Objectives and design]
• Phase 2: [Objectives and design]
• Phase 3: [Objectives and design]
• Special populations studied
• Dose selection rationale

5. REGULATORY STRATEGY

[Overview of regulatory approach:]
• Regulatory precedents
• Special designations sought/granted
• Key regulatory interactions
• Global development considerations

6. BENEFIT-RISK ASSESSMENT

[Preliminary assessment based on available data:]
• Expected benefits
• Identified risks
• Risk mitigation strategies
• Overall benefit-risk conclusion`,
    guidance: 'Provide high-level overview to orient reviewers to the submission content.',
    requirements: ['Concise overview', 'Link to detailed sections', 'Current data only'],
    metadata: { fileType: 'PDF', maxSize: '10MB', required: true }
  },

  // Module 2.3.S - Drug Substance sections
  '2.3.S.1': {
    title: 'Drug Substance - General Information',
    template: `2.3.S.1 GENERAL INFORMATION

2.3.S.1.1 Nomenclature
• Recommended INN: [Name]
• Compendial name: [If applicable]
• Chemical name(s): [IUPAC and CAS]
• Company code: [Internal designation]
• Other names: [List all]

2.3.S.1.2 Structure
• Molecular formula: [Formula]
• Molecular weight: [Weight]
• Structural formula: [Include diagram]
• Stereochemistry: [Describe]
• Polymorphism: [If applicable]

2.3.S.1.3 General Properties
• Physical description: [Appearance, color, physical form]
• Melting point: [Temperature]
• Solubility profile:
  - Water: [mg/mL at 25°C]
  - pH profile: [pH 1-14]
  - Organic solvents: [List]
• Partition coefficient: [Log P]
• pKa values: [If applicable]
• Optical rotation: [For chiral compounds]
• Hygroscopicity: [Description]
• Crystalline forms: [Polymorphs, hydrates]
• Particle size: [Specification]

Additional Characterization:
• UV/Visible spectrum
• IR spectrum
• NMR data (1H, 13C)
• Mass spectrum
• X-ray powder diffraction`,
    guidance: 'Provide comprehensive physicochemical characterization of the drug substance.',
    requirements: ['ICH Q6A guidelines', 'Complete structural elucidation', 'All relevant physical properties'],
    metadata: { fileType: 'PDF', maxSize: '20MB', required: true }
  },

  '2.3.S.2': {
    title: 'Drug Substance - Manufacture',
    template: `2.3.S.2 MANUFACTURE

2.3.S.2.1 Manufacturer(s)
Name: [Manufacturer name]
Address: [Complete address]
Responsibilities: [Specific manufacturing steps]
DMF Reference: [If applicable]

2.3.S.2.2 Description of Manufacturing Process and Process Controls

Step 1: [Starting Material Preparation]
• Starting materials: [List with specifications]
• Reagents: [List with grades]
• Solvents: [List with grades]
• Equipment: [Type and material]
• Process parameters:
  - Temperature: [Range]
  - Time: [Duration]
  - pH: [If applicable]
• In-process controls:
  - [Test]: [Specification]
• Critical process parameters (CPPs):
  - [Parameter]: [Range and justification]

[Repeat for each synthetic step]

Final Step: [Crystallization/Purification]
• Crystallization solvent: [Solvent system]
• Conditions: [Temperature, time]
• Filtration: [Method]
• Drying: [Conditions]
• Milling: [If applicable]

Process Flow Diagram:
[Include visual flowchart]

2.3.S.2.3 Control of Materials
• Starting materials specifications
• Reagent specifications
• Solvent specifications
• Recovery and reuse procedures

2.3.S.2.4 Controls of Critical Steps and Intermediates
• Critical quality attributes (CQAs)
• Process analytical technology (PAT)
• Intermediate specifications

2.3.S.2.5 Process Validation
• Validation protocol
• Batch analysis data
• Process capability studies

2.3.S.2.6 Manufacturing Process Development
• Process optimization studies
• Scale-up considerations
• Technology transfer`,
    guidance: 'Detailed description of manufacturing process with controls and validation.',
    requirements: ['ICH Q7 compliance', 'Complete process description', 'Critical parameters identified'],
    metadata: { fileType: 'PDF', maxSize: '30MB', required: true }
  },

  // Module 3: Quality sections
  '3.2.S.1': {
    title: 'Module 3 - Drug Substance General Information',
    template: `3.2.S.1 GENERAL INFORMATION (NAME, MANUFACTURER)

3.2.S.1.1 Nomenclature
Provide information on the nomenclature of the drug substance, including:

• Recommended International Nonproprietary Name (INN): [Name]
• Compendial name if relevant: [USP/EP/JP name]
• Chemical name(s): 
  - IUPAC name: [Full chemical name]
  - CAS name: [CAS registry name]
• Laboratory code: [Company code/designation]
• CAS Registry Number: [Number]

3.2.S.1.2 Structure
Provide the structural formula, including:

• Molecular formula: [CxHyNzOw]
• Relative molecular mass: [g/mol]
• Structural formula: 
  [Include chemical structure drawing]
• Stereochemistry:
  - Number of chiral centers: [N]
  - Absolute configuration: [R/S designation]
  - Optical rotation: [α]D = [value]

3.2.S.1.3 General Properties
Provide a list of physicochemical properties:

Physical Properties:
• Description: [White crystalline powder]
• Melting point: [XXX-XXX°C]
• Boiling point: [XXX°C at XXX mmHg]

Solubility:
• Water: [mg/mL at 25°C]
• 0.1N HCl: [mg/mL]
• 0.1N NaOH: [mg/mL]
• Common organic solvents:
  - Methanol: [mg/mL]
  - Ethanol: [mg/mL]
  - Acetone: [mg/mL]

Additional Properties:
• Partition coefficient (log P): [Value]
• pKa: [Value(s)]
• pH (1% solution): [Range]
• Hygroscopicity: [Non-hygroscopic/Hygroscopic]
• Polymorphism: [Forms identified]`,
    guidance: 'Complete characterization of drug substance identity and properties per ICH M4Q.',
    requirements: ['ICH M4Q CTD format', 'Complete chemical characterization', 'All physical properties'],
    metadata: { fileType: 'PDF', maxSize: '25MB', required: true }
  },

  // Module 4: Nonclinical sections
  '4.2.1': {
    title: 'Pharmacology',
    template: `4.2.1 PHARMACOLOGY

4.2.1.1 Primary Pharmacodynamics

Study Title: [Title]
Study Number: [Number]
Test System: [In vitro/In vivo model]

Objectives:
• [Primary objective]
• [Secondary objectives]

Methods:
• Test Article: [Drug name and formulation]
• Dose/Concentrations: [Range tested]
• Route of Administration: [If in vivo]
• Duration: [Exposure time]
• Endpoints: [Measured parameters]

Results:
• EC50/IC50: [Value with 95% CI]
• Efficacy: [Maximum response]
• Selectivity: [Fold selectivity]

[Include dose-response curves and key data tables]

4.2.1.2 Secondary Pharmacodynamics

Off-Target Screening:
• Receptors tested: [Number]
• Significant interactions: [List if >50% inhibition]
• Safety pharmacology implications

4.2.1.3 Safety Pharmacology

Cardiovascular Effects:
• hERG assay: IC50 = [Value]
• Telemetry study in [species]
• Effects on BP, HR, ECG parameters

CNS Effects:
• FOB/Irwin test in [species]
• Effects on behavior, motor function

Respiratory Effects:
• Plethysmography in [species]
• Effects on respiratory rate, tidal volume

4.2.1.4 Pharmacodynamic Drug Interactions
[Studies of potential drug-drug interactions]`,
    guidance: 'Comprehensive pharmacology package supporting clinical development.',
    requirements: ['ICH S7A/B guidelines', 'GLP compliance where required', 'Dose-response relationships'],
    metadata: { fileType: 'PDF', maxSize: '50MB', required: true }
  },

  '4.2.2': {
    title: 'Pharmacokinetics',
    template: `4.2.2 PHARMACOKINETICS

4.2.2.1 Absorption

Single Dose PK Study:
Species: [Rat/Dog/Monkey]
Route: [PO/IV]
Doses: [mg/kg]

PK Parameters:
• Cmax: [ng/mL]
• Tmax: [hours]
• AUC0-inf: [ng•h/mL]
• T1/2: [hours]
• Bioavailability: [%]
• Volume of distribution: [L/kg]
• Clearance: [mL/min/kg]

[Include plasma concentration-time curves]

4.2.2.2 Distribution

Tissue Distribution Study:
• Species: [Species used]
• Time points: [List]
• Key tissues: [Brain, liver, kidney, etc.]
• Protein binding: [% bound]
• Blood/plasma ratio: [Value]

4.2.2.3 Metabolism

In Vitro Metabolism:
• Hepatocytes: [Species tested]
• Microsomes: [Species tested]
• Major metabolites: [M1, M2, etc.]
• Metabolic pathways: [Phase I/II]
• CYP enzymes involved: [CYP3A4, etc.]

In Vivo Metabolism:
• Species: [Species tested]
• Major circulating metabolites
• Excretion pathways

4.2.2.4 Excretion

Mass Balance Study:
• Species: [Species]
• Recovery: [% in urine/feces]
• Unchanged drug: [%]
• Timeline: [Days]

4.2.2.5 Pharmacokinetic Drug Interactions
• CYP inhibition: IC50 values
• CYP induction: Fold change
• Transporter interactions`,
    guidance: 'Complete ADME characterization across species.',
    requirements: ['ICH S3A guidelines', 'Multiple species', 'Human predictions'],
    metadata: { fileType: 'PDF', maxSize: '40MB', required: true }
  },

  '4.2.3': {
    title: 'Toxicology',
    template: `4.2.3 TOXICOLOGY

4.2.3.1 Single-Dose Toxicity

Acute Toxicity Study:
Species: [Rat and one non-rodent]
Route: [Clinical route]
Doses: [mg/kg]
Observations:
• Clinical signs: [Description]
• Mortality: [Dose level]
• MTD: [Maximum tolerated dose]
• LD50: [If determined]

4.2.3.2 Repeat-Dose Toxicity

[Study Duration]-Day Study in [Species]:
Doses: [0, X, Y, Z mg/kg/day]
Route: [Route]

Key Findings:
• NOAEL: [mg/kg/day]
• Target organs: [List]
• Clinical pathology: [Notable changes]
• Histopathology: [Findings]
• Recovery: [Reversibility]
• TK parameters: [Exposure data]

4.2.3.3 Genotoxicity

Bacterial Reverse Mutation (Ames):
• Result: [Positive/Negative]
• Strains: [TA98, TA100, etc.]

In Vitro Chromosomal Aberration:
• Cell type: [CHO/human lymphocytes]
• Result: [Positive/Negative]

In Vivo Micronucleus:
• Species: [Mouse/Rat]
• Result: [Positive/Negative]

4.2.3.4 Carcinogenicity
[If conducted or planned]

4.2.3.5 Reproductive Toxicity

Fertility and Early Embryonic Development:
• Species: [Rat]
• NOAEL: [mg/kg/day]

Embryo-Fetal Development:
• Species: [Rat and Rabbit]
• NOAEL maternal/fetal: [mg/kg/day]

4.2.3.6 Local Tolerance
[Route-specific irritation studies]

4.2.3.7 Other Toxicity Studies
• Immunotoxicity
• Dependence potential
• Metabolite toxicity
• Impurity qualification`,
    guidance: 'Comprehensive safety assessment supporting clinical development.',
    requirements: ['ICH M3(R2) guidelines', 'GLP compliance', 'Clinical route and duration'],
    metadata: { fileType: 'PDF', maxSize: '75MB', required: true }
  },

  // Module 5: Clinical sections
  '5.3.1': {
    title: 'Reports of Biopharmaceutic Studies',
    template: `5.3.1 REPORTS OF BIOPHARMACEUTIC STUDIES

5.3.1.1 Bioavailability Study Reports

Study [Protocol Number]
Title: [Comparative Bioavailability Study of...]

Study Design:
• Type: [Crossover/Parallel]
• Population: [Healthy volunteers/Patients]
• Sample size: N = [Number]
• Treatments: [Test vs Reference]
• Doses: [mg]
• Fed/Fasted: [Conditions]

Bioequivalence Parameters:
• Test/Reference Ratio for Cmax: [90% CI]
• Test/Reference Ratio for AUC0-t: [90% CI]
• Test/Reference Ratio for AUC0-inf: [90% CI]
• Intra-subject CV%: [Values]

Statistical Analysis:
• ANOVA model
• 90% Confidence intervals
• Power calculation

Conclusions:
[Bioequivalence demonstrated/not demonstrated]

5.3.1.2 In Vitro-In Vivo Correlation Study Reports

Dissolution Profiles:
• Media tested: [pH conditions]
• Apparatus: [USP Type]
• Correlation model: [Level A/B/C]
• R² value: [Correlation coefficient]

5.3.1.3 Bioanalytical Method Reports

Method Validation:
• Analyte: [Drug and metabolites]
• Matrix: [Plasma/Urine/etc.]
• LLOQ: [ng/mL]
• Range: [ng/mL]
• Accuracy: [%]
• Precision: [CV%]
• Stability: [Conditions and duration]

5.3.1.4 Comparative BA/BE Study Reports
[Additional formulation comparisons]`,
    guidance: 'Biopharmaceutic studies supporting formulation development and bridging.',
    requirements: ['FDA Bioequivalence guidance', 'ICH E6 GCP compliance', 'Validated bioanalytical methods'],
    metadata: { fileType: 'PDF', maxSize: '30MB', required: false }
  },

  '5.3.2': {
    title: 'Reports of Studies Using Human Biomaterials',
    template: `5.3.2 REPORTS OF STUDIES PERTINENT TO PK USING HUMAN BIOMATERIALS

5.3.2.1 Plasma Protein Binding Study Reports

Study Design:
• Method: [Equilibrium dialysis/Ultrafiltration]
• Concentrations tested: [Range]
• Temperature: 37°C
• Duration: [Hours to equilibrium]

Results:
• % Bound: [Value ± SD]
• Concentration dependency: [Yes/No]
• Primary binding proteins: [Albumin/AAG/etc.]

5.3.2.2 Hepatocyte and Hepatic Metabolism Study Reports

Human Hepatocyte Study:
• Donors: N = [Number]
• Incubation time: [Minutes/Hours]
• Intrinsic clearance: [μL/min/10⁶ cells]

Major Metabolites:
• M1: [Structure and % of parent]
• M2: [Structure and % of parent]
• Metabolic pathways: [CYP/UGT/etc.]

Enzyme Phenotyping:
• CYP3A4: [% contribution]
• CYP2C9: [% contribution]
• Other enzymes: [List]

5.3.2.3 Drug-Drug Interaction Study Reports

CYP Inhibition:
• CYP3A4 IC50: [μM]
• CYP2D6 IC50: [μM]
• Time-dependent inhibition: [Yes/No]

CYP Induction:
• Fold change in mRNA: [Values]
• Fold change in activity: [Values]
• EC50: [μM]

Transporter Studies:
• P-gp substrate: [Yes/No]
• BCRP substrate: [Yes/No]
• OATP1B1/1B3: [Substrate/Inhibitor]`,
    guidance: 'In vitro studies using human materials to predict clinical PK/DDI.',
    requirements: ['FDA DDI guidance', 'Industry standards for in vitro studies', 'Multiple donors'],
    metadata: { fileType: 'PDF', maxSize: '25MB', required: false }
  },

  '5.3.3': {
    title: 'Reports of Human PK Studies',
    template: `5.3.3 REPORTS OF HUMAN PHARMACOKINETIC STUDIES

5.3.3.1 Healthy Subject PK Study Reports

Study [Protocol Number]: Single Ascending Dose Study
Population: Healthy volunteers
Design: Double-blind, placebo-controlled

Dose Cohorts:
• Cohort 1: [X] mg (n=8)
• Cohort 2: [Y] mg (n=8)
• Cohort 3: [Z] mg (n=8)

PK Parameters Summary:
[Table with Dose, Cmax, Tmax, AUC, T1/2, CL/F, Vd/F]

Dose Proportionality:
• Power model slope for Cmax: [Value, 90% CI]
• Power model slope for AUC: [Value, 90% CI]

5.3.3.2 Patient PK Study Reports

Population PK Analysis:
• Patients: N = [Number]
• Model: [1/2/3 compartment]
• Covariates tested: [Age, weight, sex, renal function]
• Significant covariates: [List]

Parameter Estimates:
• CL/F: [Value] L/h (CV%)
• Vd/F: [Value] L (CV%)
• Ka: [Value] h⁻¹ (CV%)

5.3.3.3 Intrinsic Factor PK Study Reports

Renal Impairment Study:
• Normal: [CL > 90 mL/min]
• Mild: [CL 60-89 mL/min]
• Moderate: [CL 30-59 mL/min]
• Severe: [CL < 30 mL/min]
• Dose adjustment needed: [Yes/No]

Hepatic Impairment Study:
• Child-Pugh A: [Exposure change]
• Child-Pugh B: [Exposure change]
• Child-Pugh C: [Exposure change]

5.3.3.4 Extrinsic Factor PK Study Reports

Food Effect Study:
• Fed/Fasted Cmax ratio: [Value, 90% CI]
• Fed/Fasted AUC ratio: [Value, 90% CI]
• Clinical relevance: [Assessment]

Drug Interaction Studies:
[List DDI studies with perpetrators/victims]`,
    guidance: 'Human PK characterization in healthy subjects and special populations.',
    requirements: ['ICH E7 special populations', 'FDA Clinical Pharmacology guidance', 'Dose adjustment recommendations'],
    metadata: { fileType: 'PDF', maxSize: '40MB', required: false }
  },

  '5.3.4': {
    title: 'Reports of Human PD Studies',
    template: `5.3.4 REPORTS OF HUMAN PHARMACODYNAMIC STUDIES

5.3.4.1 Healthy Subject PD Studies

Study [Protocol Number]: PD Biomarker Study
Objective: Establish PK/PD relationship

Biomarker Assessments:
• Primary: [Biomarker name and rationale]
• Secondary: [Additional biomarkers]
• Sampling times: [Schedule]

PK/PD Modeling:
• Model type: [Direct/Indirect response]
• EC50: [Value with 95% CI]
• Emax: [Maximum effect]
• Hill coefficient: [If applicable]

Dose-Response:
[Graph showing dose vs biomarker response]

5.3.4.2 Patient PD Studies

Proof of Concept Study:
Population: [Disease indication]
Sample size: N = [Number]
Duration: [Weeks/Months]

Primary PD Endpoint:
• Baseline: [Mean ± SD]
• End of treatment: [Mean ± SD]
• Change from baseline: [Value, p-value]

Secondary PD Endpoints:
[List with results]

PK/PD Correlation:
• Exposure-response analysis
• Minimum effective concentration
• Target engagement confirmation

5.3.4.3 PD Drug Interaction Studies
[If conducted]

Mechanistic Interaction Study:
• Combination: [Drug A + Drug B]
• PD effect: [Additive/Synergistic/Antagonistic]
• Clinical implications: [Assessment]`,
    guidance: 'Pharmacodynamic studies demonstrating mechanism and dose-response.',
    requirements: ['Biomarker validation', 'PK/PD modeling', 'Dose selection support'],
    metadata: { fileType: 'PDF', maxSize: '35MB', required: false }
  },

  '5.3.5': {
    title: 'Reports of Efficacy and Safety Studies',
    template: `5.3.5 REPORTS OF EFFICACY AND SAFETY STUDIES

5.3.5.1 Controlled Clinical Studies

STUDY [Protocol Number]
Title: [A Phase 2/3, Randomized, Double-Blind, Placebo-Controlled Study...]

PROTOCOL SUMMARY
Objectives:
Primary: [Primary efficacy endpoint]
Secondary: [List secondary endpoints]
Safety: [Safety objectives]

Study Design:
• Phase: [2/3]
• Design: [Parallel/Crossover]
• Randomization: [Ratio]
• Blinding: [Double-blind/Open-label]
• Duration: [Treatment period]
• Follow-up: [Duration]

Study Population:
• Indication: [Disease/Condition]
• Sample size: N = [Total]
  - Treatment: n = [Number]
  - Control: n = [Number]
• Key inclusion criteria:
  - [Criterion 1]
  - [Criterion 2]
• Key exclusion criteria:
  - [Criterion 1]
  - [Criterion 2]

Treatments:
• Test: [Drug, dose, regimen]
• Control: [Placebo/Active comparator]
• Rescue medication: [If allowed]

Statistical Methods:
• Primary analysis: [ITT/PP]
• Missing data: [Imputation method]
• Multiplicity: [Adjustment method]
• Sample size: [Power, assumptions]

RESULTS

Disposition:
• Screened: N = [Number]
• Randomized: N = [Number]
• Completed: N = [Number] (%)
• Discontinued: N = [Number] (%)
  - Adverse events: n = [Number]
  - Lack of efficacy: n = [Number]
  - Withdrawal of consent: n = [Number]

Demographics and Baseline:
[Table of baseline characteristics]

Primary Efficacy Results:
• Treatment: [Result ± SD/SE]
• Control: [Result ± SD/SE]
• Difference: [Value, 95% CI]
• P-value: [Value]

Secondary Efficacy Results:
[Table of secondary endpoints]

Safety Results:
• Any AE: [n (%) in each group]
• Serious AEs: [n (%) in each group]
• Deaths: [n in each group]
• Discontinuations due to AEs: [n (%)]

Most Common AEs (≥5%):
[Table listing AEs by treatment group]

Laboratory Parameters:
[Notable changes]

CONCLUSIONS:
[Efficacy and safety conclusions]

5.3.5.2 Uncontrolled Clinical Studies
[Open-label extension studies, single-arm studies]

5.3.5.3 Analysis of Data from More than One Study
[Pooled analyses, meta-analyses]

5.3.5.4 Other Study Reports
[Substudy reports, interim analyses]`,
    guidance: 'Pivotal efficacy and safety studies supporting indication.',
    requirements: ['ICH E6 GCP', 'ICH E9 Statistical Principles', 'ICH E3 Study Reports'],
    metadata: { fileType: 'PDF', maxSize: '100MB', required: true }
  }
};

// Template metadata and helper functions
export const getTemplate = (sectionId) => {
  return ectdTemplates[sectionId] || {
    title: `Section ${sectionId}`,
    template: `[Template for section ${sectionId} is being prepared]`,
    guidance: 'Please refer to regulatory guidelines for this section.',
    requirements: [],
    metadata: { fileType: 'PDF', required: false }
  };
};

export const getTemplatesByModule = (moduleNumber) => {
  const modulePrefix = moduleNumber.toString();
  return Object.entries(ectdTemplates)
    .filter(([key]) => key.startsWith(modulePrefix))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
};

export const getAllRequiredTemplates = () => {
  return Object.entries(ectdTemplates)
    .filter(([, template]) => template.metadata.required)
    .map(([key, template]) => ({
      sectionId: key,
      title: template.title,
      ...template.metadata
    }));
};

export const validateDocument = (sectionId, content) => {
  const template = ectdTemplates[sectionId];
  if (!template) return { valid: false, errors: ['Unknown section'] };
  
  const errors = [];
  
  // Check required fields are present
  const requiredFields = template.template.match(/\[([^\]]+)\]/g) || [];
  requiredFields.forEach(field => {
    if (content.includes(field)) {
      errors.push(`Required field ${field} not completed`);
    }
  });
  
  // Check file size if content is base64
  if (template.metadata.maxSize) {
    const sizeInMB = (content.length * 0.75) / 1024 / 1024; // Rough estimate for base64
    const maxSize = parseInt(template.metadata.maxSize);
    if (sizeInMB > maxSize) {
      errors.push(`Document exceeds maximum size of ${template.metadata.maxSize}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

export default ectdTemplates;