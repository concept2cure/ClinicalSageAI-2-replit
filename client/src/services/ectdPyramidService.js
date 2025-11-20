const COMPREHENSIVE_TEMPLATES = {
  'clinical-overview-module-2-5': {
    title: 'Clinical Overview (Module 2.5)',
    sections: [
      {
        id: 'product-development-rationale',
        title: '2.5.1 Product Development Rationale',
        content: `# Product Development Rationale

## Background and Scientific Rationale
[Product Name] represents a novel therapeutic approach targeting [specific indication]. The development rationale is based on:

### Unmet Medical Need
- Current therapeutic options for [indication] are limited by [specific limitations]
- Existing treatments show [efficacy/safety concerns]
- Patient population requires improved [therapeutic outcomes]

### Scientific Foundation
- Mechanism of action: [detailed MOA]
- Target engagement: [specificity and selectivity data]
- Preclinical proof of concept: [key findings]

### Regulatory Pathway
- FDA guidance: [relevant guidance documents]
- ICH guidelines: [applicable ICH guidelines]
- Special designations: [orphan drug, breakthrough therapy, etc.]

## Development Strategy
The clinical development program follows a systematic approach:
1. **Phase 1**: Safety, tolerability, and preliminary efficacy
2. **Phase 2**: Dose optimization and efficacy confirmation
3. **Phase 3**: Confirmatory studies for regulatory approval

## Risk-Benefit Assessment
Based on available data, the anticipated benefit-risk profile supports continued development with appropriate safety monitoring.`,
      },
      {
        id: 'overview-biopharmaceutics',
        title: '2.5.2 Overview of Biopharmaceutics',
        content: `# Overview of Biopharmaceutics

## Pharmaceutical Development Summary
### Dosage Form Selection
- **Formulation**: [tablet/capsule/injection]
- **Rationale**: Based on [stability, bioavailability, patient convenience]
- **Manufacturing considerations**: [scalability, quality control]

### Bioavailability and Bioequivalence
- **Absolute bioavailability**: [percentage and methodology]
- **Relative bioavailability**: [comparison with reference formulation]
- **Food effect studies**: [impact of food on absorption]

### Pharmacokinetic Profile
- **Absorption**: [Tmax, Cmax, extent of absorption]
- **Distribution**: [Volume of distribution, protein binding]
- **Metabolism**: [primary metabolic pathways, CYP enzymes]
- **Elimination**: [half-life, clearance, excretion routes]

## Special Populations
### Hepatic Impairment
- Mild impairment: [dosing recommendations]
- Moderate impairment: [dosing modifications]
- Severe impairment: [contraindications or special monitoring]

### Renal Impairment
- CrCl 30-60 mL/min: [dose adjustments]
- CrCl <30 mL/min: [recommendations]
- Dialysis patients: [special considerations]

### Drug-Drug Interactions
- **CYP inhibitors**: [clinical significance and management]
- **CYP inducers**: [dose modifications required]
- **Transport proteins**: [P-gp, BCRP interactions]`,
      },
      {
        id: 'overview-clinical-pharmacology',
        title: '2.5.3 Overview of Clinical Pharmacology',
        content: `# Overview of Clinical Pharmacology

## Pharmacodynamics
### Mechanism of Action
[Product Name] exerts its therapeutic effect through [specific mechanism]:
- **Primary target**: [receptor/enzyme/pathway]
- **Downstream effects**: [cascade of biological effects]
- **Clinical outcomes**: [relationship between target engagement and efficacy]

### Dose-Response Relationship
- **Efficacy**: [relationship between dose and therapeutic effect]
- **Safety**: [dose-limiting toxicities and their occurrence]
- **Therapeutic window**: [optimal dosing range]

### Biomarkers
- **Pharmacodynamic markers**: [target engagement biomarkers]
- **Efficacy biomarkers**: [predictive and prognostic markers]
- **Safety biomarkers**: [early indicators of toxicity]

## Population Pharmacokinetics
### Covariate Analysis
- **Age**: [impact on clearance and exposure]
- **Gender**: [sex-related differences]
- **Race/Ethnicity**: [pharmacogenomic considerations]
- **Body weight**: [dosing implications]

### Model Development
- **Structural model**: [compartmental analysis]
- **Covariate model**: [significant covariates identified]
- **Validation**: [external validation approaches]

## Exposure-Response Analysis
### Efficacy Analysis
- **Primary endpoint**: [relationship with exposure metrics]
- **Secondary endpoints**: [additional efficacy relationships]
- **Time-to-event analyses**: [survival models if applicable]

### Safety Analysis
- **Adverse events**: [exposure-dependent safety signals]
- **Laboratory abnormalities**: [clinically relevant changes]
- **Dose modifications**: [exposure-guided dose adjustments]`,
      },
      {
        id: 'overview-efficacy',
        title: '2.5.4 Overview of Efficacy',
        content: `# Overview of Efficacy

## Clinical Development Program
The efficacy of [Product Name] has been demonstrated across [number] clinical studies enrolling [total number] patients with [indication].

### Study Design Summary
| Study | Phase | Design | Population | Primary Endpoint | n |
|-------|--------|---------|------------|------------------|---|
| [Study 1] | 1/2 | [design] | [population] | [endpoint] | [n] |
| [Study 2] | 2 | [design] | [population] | [endpoint] | [n] |
| [Study 3] | 3 | [design] | [population] | [endpoint] | [n] |

## Primary Efficacy Results
### Pivotal Study Results
**Study [ID]**: [Study title and design]
- **Primary endpoint**: [definition and results]
- **Statistical significance**: p = [value], 95% CI: [range]
- **Clinical significance**: [clinical interpretation]
- **Effect size**: [magnitude of benefit]

### Secondary Endpoints
- **Endpoint 1**: [results and interpretation]
- **Endpoint 2**: [results and interpretation]
- **Quality of life**: [patient-reported outcomes]

## Subgroup Analyses
### Pre-specified Subgroups
- **Age groups**: [<65 vs ≥65 years]
- **Disease severity**: [mild, moderate, severe]
- **Prior therapy**: [treatment-naive vs experienced]
- **Biomarker status**: [positive vs negative]

### Forest Plot Summary
[Key subgroup analyses showing consistency of effect]

## Dose-Response Relationship
### Dose Selection Rationale
- **Minimum effective dose**: [lowest dose showing efficacy]
- **Maximum tolerated dose**: [highest dose with acceptable safety]
- **Recommended dose**: [optimal balance of efficacy and safety]

## Durability of Response
- **Time to response**: [median time to initial response]
- **Duration of response**: [median duration in responders]
- **Progression-free survival**: [if applicable]
- **Overall survival**: [if mature data available]`,
      },
      {
        id: 'overview-safety',
        title: '2.5.5 Overview of Safety',
        content: `# Overview of Safety

## Safety Database
The safety profile of [Product Name] is based on [total exposure] patient-years of exposure across [number] clinical studies.

### Exposure Summary
- **Total patients exposed**: [number]
- **Duration of exposure**:
  - ≥6 months: [number] patients
  - ≥12 months: [number] patients
  - ≥24 months: [number] patients

## Adverse Event Profile
### Most Common Adverse Events (≥10%)
| Adverse Event | [Product] (n=[n]) | Placebo (n=[n]) |
|---------------|-------------------|-----------------|
| [AE 1] | [%] | [%] |
| [AE 2] | [%] | [%] |
| [AE 3] | [%] | [%] |

### Serious Adverse Events
- **Incidence**: [%] of patients
- **Most common SAEs**: [list with frequencies]
- **Drug-related SAEs**: [%] of patients
- **Fatal SAEs**: [number and relationship assessment]

### Adverse Events of Special Interest
#### [AESI Category 1]
- **Incidence**: [%]
- **Severity**: [grade distribution]
- **Management**: [dose modifications, supportive care]
- **Reversibility**: [time to resolution]

#### [AESI Category 2]
- **Clinical presentation**: [signs and symptoms]
- **Risk factors**: [predisposing conditions]
- **Monitoring recommendations**: [frequency and parameters]

## Laboratory Abnormalities
### Hematologic Parameters
- **Neutropenia**: [grade 3/4 incidence]
- **Thrombocytopenia**: [grade 3/4 incidence]
- **Anemia**: [grade 3/4 incidence]

### Chemistry Parameters
- **Hepatic enzymes**: [ALT/AST elevations]
- **Renal function**: [creatinine changes]
- **Electrolyte abnormalities**: [clinically significant changes]

## Safety in Special Populations
### Elderly Patients (≥65 years)
- **Overall safety profile**: [comparison with younger patients]
- **Dose modifications**: [frequency and reasons]
- **Specific considerations**: [age-related safety concerns]

### Patients with Comorbidities
- **Hepatic impairment**: [safety considerations]
- **Renal impairment**: [safety monitoring]
- **Cardiac disease**: [cardiovascular safety]

## Risk Management
### Identified Risks
- **Important identified risks**: [list with frequency]
- **Important potential risks**: [list with rationale]
- **Missing information**: [knowledge gaps]

### Risk Minimization Measures
- **Routine measures**: [prescribing information, labeling]
- **Additional measures**: [educational materials, monitoring]
- **Pharmacovigilance activities**: [safety studies, registries]`,
      },
      {
        id: 'benefit-risk-assessment',
        title: '2.5.6 Benefit-Risk Assessment',
        content: `# Benefit-Risk Assessment

## Executive Summary
The benefit-risk profile of [Product Name] supports its use for the treatment of [indication]. The demonstrated efficacy benefits outweigh the identified safety risks when used according to the proposed prescribing information.

## Benefit Assessment
### Clinical Benefits Demonstrated
1. **Primary Efficacy**
   - **Magnitude of effect**: [quantified benefit]
   - **Clinical significance**: [meaningful improvement]
   - **Durability**: [sustained benefit]

2. **Secondary Benefits**
   - **Quality of life improvement**: [patient-reported outcomes]
   - **Functional status**: [performance measures]
   - **Reduced disease burden**: [symptom improvement]

### Benefit in Context of Standard of Care
- **Comparative efficacy**: [versus existing treatments]
- **Unmet medical need addressed**: [specific gaps filled]
- **Patient population impact**: [number of patients who could benefit]

## Risk Assessment
### Identified Risks
#### Serious Risks
1. **[Risk 1]**
   - **Frequency**: [incidence rate]
   - **Severity**: [clinical impact]
   - **Reversibility**: [recovery potential]
   - **Management**: [mitigation strategies]

2. **[Risk 2]**
   - **Clinical presentation**: [signs and symptoms]
   - **Risk factors**: [predisposing conditions]
   - **Monitoring**: [detection methods]

#### Common but Less Serious Risks
- **[Risk 3]**: [frequency and management]
- **[Risk 4]**: [frequency and management]

### Risk Mitigation
#### Prescribing Information
- **Contraindications**: [absolute contraindications]
- **Warnings and precautions**: [important safety information]
- **Dose modifications**: [safety-guided adjustments]

#### Risk Management Plan
- **Routine pharmacovigilance**: [standard monitoring]
- **Additional activities**: [enhanced safety surveillance]
- **Educational materials**: [healthcare provider and patient resources]

## Benefit-Risk Balance
### Overall Assessment
The benefit-risk balance is **positive** based on:

1. **Significant clinical benefit**: [quantified efficacy outcomes]
2. **Manageable safety profile**: [acceptable risk with proper management]
3. **Unmet medical need**: [limited therapeutic alternatives]
4. **Quality of life improvement**: [patient-centered outcomes]

### Special Populations
#### Favorable Benefit-Risk
- **[Population 1]**: [rationale for positive benefit-risk]
- **[Population 2]**: [specific benefits outweigh risks]

#### Requires Careful Consideration
- **[Population 3]**: [enhanced monitoring needed]
- **[Population 4]**: [individualized assessment required]

### Conditions for Positive Benefit-Risk
1. **Appropriate patient selection**: [target population characteristics]
2. **Proper dosing**: [adherence to recommended regimen]
3. **Safety monitoring**: [required surveillance activities]
4. **Risk communication**: [informed prescribing and patient counseling]

## Conclusion
[Product Name] demonstrates a favorable benefit-risk profile for the treatment of [indication]. The clinical benefits observed in the development program, combined with the manageable safety profile and available risk mitigation measures, support regulatory approval with appropriate prescribing information and risk management activities.`,
      },
    ],
  },
  'safety-summary': {
    title: 'Clinical Safety Summary',
    sections: [
      {
        id: 'safety-summary-overview',
        title: 'Safety Summary Overview',
        content: `# Clinical Safety Summary

## Executive Summary
This document provides a comprehensive summary of the safety profile of [Product Name] based on the integrated analysis of [number] clinical studies encompassing [total patient-years] of exposure in [total patients] patients.

### Key Safety Findings
- **Overall safety profile**: Generally well-tolerated
- **Most common AEs**: [list top 3-5 AEs with frequencies]
- **Serious AEs**: [overall incidence and most common]
- **Discontinuation rate**: [percentage] due to adverse events
- **No new safety signals**: Identified in recent studies

## Safety Database Description
### Study Population
The integrated safety database includes:
- **Phase 1 studies**: [number] studies, [number] patients
- **Phase 2 studies**: [number] studies, [number] patients  
- **Phase 3 studies**: [number] studies, [number] patients
- **Extension studies**: [number] studies, [number] patients

### Exposure Characteristics
| Exposure Duration | Number of Patients | Percentage |
|------------------|-------------------|------------|
| Any exposure | [number] | 100% |
| ≥ 6 months | [number] | [%] |
| ≥ 12 months | [number] | [%] |
| ≥ 18 months | [number] | [%] |
| ≥ 24 months | [number] | [%] |

## Methodology
### Data Sources
- **Clinical study databases**: [database systems used]
- **Coding dictionaries**: MedDRA version [version]
- **Analysis populations**: Safety population definition
- **Cut-off dates**: Data included through [date]

### Analysis Approach
- **Integrated analysis**: Pooled safety data approach
- **Subgroup analyses**: Pre-specified populations
- **Temporal analysis**: Time-to-onset and duration
- **Dose-response analysis**: Safety by dose level`,
      },
      {
        id: 'adverse-events-overview',
        title: 'Adverse Events Overview',
        content: `# Adverse Events Overview

## Summary of Adverse Events
### Overall Incidence
- **Any AE**: [%] ([n]/[N]) patients
- **Drug-related AEs**: [%] ([n]/[N]) patients
- **Serious AEs**: [%] ([n]/[N]) patients
- **AEs leading to discontinuation**: [%] ([n]/[N]) patients
- **AEs leading to death**: [%] ([n]/[N]) patients

### Most Frequent Adverse Events (≥5% incidence)
| System Organ Class<br/>Preferred Term | [Product Name]<br/>(N=[total]) | Placebo<br/>(N=[total]) |
|----------------------------------------|--------------------------------|-------------------------|
| **GASTROINTESTINAL DISORDERS** | | |
| Nausea | [n] ([%]) | [n] ([%]) |
| Diarrhea | [n] ([%]) | [n] ([%]) |
| Vomiting | [n] ([%]) | [n] ([%]) |
| **NERVOUS SYSTEM DISORDERS** | | |
| Headache | [n] ([%]) | [n] ([%]) |
| Dizziness | [n] ([%]) | [n] ([%]) |
| **GENERAL DISORDERS** | | |
| Fatigue | [n] ([%]) | [n] ([%]) |
| Injection site reaction | [n] ([%]) | [n] ([%]) |

### Adverse Events by Severity
| Severity Grade | Number of Patients | Percentage |
|----------------|-------------------|------------|
| Grade 1 (Mild) | [number] | [%] |
| Grade 2 (Moderate) | [number] | [%] |
| Grade 3 (Severe) | [number] | [%] |
| Grade 4 (Life-threatening) | [number] | [%] |
| Grade 5 (Death) | [number] | [%] |

## Dose-Related Safety Findings
### Safety by Dose Group
| Parameter | Low Dose | Medium Dose | High Dose |
|-----------|----------|-------------|-----------|
| Any AE | [%] | [%] | [%] |
| Grade ≥3 AEs | [%] | [%] | [%] |
| SAEs | [%] | [%] | [%] |
| Discontinuations | [%] | [%] | [%] |

### Dose Modifications for Safety
- **Dose reductions**: [%] of patients
- **Dose interruptions**: [%] of patients
- **Permanent discontinuations**: [%] of patients

## Temporal Patterns
### Time to Onset
- **Early onset (<30 days)**: [most common AEs]
- **Late onset (>90 days)**: [AEs with delayed presentation]
- **Chronic events**: [AEs persisting >6 months]

### Duration of Events
- **Acute (<7 days)**: [%] of all AEs
- **Subacute (7-30 days)**: [%] of all AEs  
- **Chronic (>30 days)**: [%] of all AEs
- **Ongoing at study end**: [%] of all AEs`,
      },
      {
        id: 'serious-adverse-events',
        title: 'Serious Adverse Events Analysis',
        content: `# Serious Adverse Events Analysis

## Overview of Serious Adverse Events
### Incidence and Characteristics
- **Overall SAE incidence**: [%] ([n]/[N]) patients
- **Drug-related SAEs**: [%] ([n]/[N]) patients
- **Fatal SAEs**: [%] ([n]/[N]) patients
- **SAEs leading to discontinuation**: [%] ([n]/[N]) patients

### Most Common Serious Adverse Events (≥0.5% incidence)
| System Organ Class / Preferred Term | Number of Patients | Percentage | Drug-Related |
|--------------------------------------|-------------------|------------|--------------|
| **INFECTIONS AND INFESTATIONS** | | | |
| Pneumonia | [n] | [%] | [n] |
| Sepsis | [n] | [%] | [n] |
| **CARDIAC DISORDERS** | | | |
| Myocardial infarction | [n] | [%] | [n] |
| Cardiac failure | [n] | [%] | [n] |
| **NEOPLASMS** | | | |
| [Specific malignancy] | [n] | [%] | [n] |

## Serious Adverse Events by System Organ Class
### Detailed Analysis by SOC
#### Infections and Infestations
- **Incidence**: [%] of patients
- **Most common**: [list with frequencies]
- **Risk factors**: [immunosuppression, comorbidities]
- **Management**: [prophylaxis, monitoring]

#### Cardiac Disorders  
- **Incidence**: [%] of patients
- **Types**: [specific cardiac events]
- **Risk factors**: [pre-existing conditions]
- **Monitoring**: [cardiac assessments required]

#### Hepatobiliary Disorders
- **Incidence**: [%] of patients
- **Presentation**: [laboratory abnormalities, clinical signs]
- **Reversibility**: [recovery patterns]
- **Risk management**: [liver monitoring requirements]

## Fatal Serious Adverse Events
### Overview of Deaths
- **Total deaths**: [number] patients ([%])
- **Treatment-related deaths**: [number] patients ([%])
- **Deaths due to disease progression**: [number] patients ([%])
- **Deaths due to other causes**: [number] patients ([%])

### Analysis of Treatment-Related Deaths
| Cause of Death | Number | Days from First Dose | Relationship Assessment |
|----------------|--------|---------------------|------------------------|
| [Cause 1] | [n] | [range] | [probable/possible] |
| [Cause 2] | [n] | [range] | [probable/possible] |

### Narrative Summaries
**Case [ID]**: [Brief narrative of treatment-related death including timeline, concomitant medications, and causality assessment]

## Risk Factors for Serious Adverse Events
### Patient Characteristics
- **Age**: Higher incidence in patients >65 years
- **Performance status**: Increased risk with poor performance status
- **Comorbidities**: [specific conditions associated with increased risk]
- **Concomitant medications**: [drug interactions or additive toxicities]

### Predictive Factors
- **Baseline laboratory values**: [parameters associated with increased risk]
- **Disease characteristics**: [tumor burden, disease stage]
- **Prior treatments**: [previous therapies affecting risk]

## Risk Mitigation Strategies
### Monitoring Requirements
- **Frequency**: [monitoring schedule by parameter]
- **Parameters**: [specific tests and assessments]
- **Dose modifications**: [criteria for dose adjustments]

### Management Guidelines
- **Early recognition**: [signs and symptoms to monitor]
- **Intervention criteria**: [when to hold or modify treatment]
- **Supportive care**: [standard management approaches]
- **Specialist consultation**: [when to involve subspecialists]`,
      },
    ],
  },
  'clinical-protocol': {
    title: 'Clinical Study Protocol',
    sections: [
      {
        id: 'protocol-synopsis',
        title: 'Protocol Synopsis',
        content: `# Protocol Synopsis

## Study Title
A [Phase/Design] Study to Evaluate the [Primary Objective] of [Investigational Product] in Patients with [Indication]

## Protocol Information
- **Protocol Number**: [Protocol ID]
- **Study Phase**: Phase [I/II/III]
- **Sponsor**: [Sponsor Name]
- **Principal Investigator**: [Name and Institution]
- **IND Number**: [IND number if applicable]

## Study Design
### Design Type
- **Study Type**: [Interventional/Observational]
- **Design**: [Randomized, double-blind, placebo-controlled]
- **Allocation**: [Randomization ratio]
- **Duration**: [Treatment period and follow-up]

### Study Schema
[Visual representation of study design with screening, treatment, and follow-up periods]

## Study Population
### Target Population
Patients with [specific indication and stage/severity]

### Key Inclusion Criteria
1. Confirmed diagnosis of [indication]
2. Age ≥18 years
3. Performance status ECOG 0-1
4. Adequate organ function:
   - Hemoglobin ≥9.0 g/dL
   - ANC ≥1.5 × 10⁹/L
   - Platelets ≥100 × 10⁹/L
   - Total bilirubin ≤1.5 × ULN
   - ALT/AST ≤2.5 × ULN
   - Serum creatinine ≤1.5 × ULN

### Key Exclusion Criteria
1. Prior treatment with [specific exclusions]
2. Active second malignancy
3. Significant cardiovascular disease
4. Active infection requiring systemic therapy
5. Pregnant or nursing women

## Study Objectives
### Primary Objective
To evaluate [primary endpoint] of [investigational product] in patients with [indication]

### Secondary Objectives
1. To assess the safety and tolerability
2. To evaluate [secondary efficacy endpoints]
3. To characterize pharmacokinetics
4. To assess biomarkers of [target engagement/efficacy]

## Study Endpoints
### Primary Endpoint
[Specific measurable endpoint with clear definition and assessment criteria]

### Secondary Endpoints
1. **Safety**: Adverse events, laboratory abnormalities, vital signs
2. **Efficacy**: [Additional efficacy measures]
3. **Pharmacokinetics**: [PK parameters if applicable]
4. **Quality of Life**: [Patient-reported outcomes]

## Sample Size and Statistical Considerations
### Sample Size Calculation
- **Total sample size**: [number] patients
- **Power**: 80%
- **Alpha level**: 0.05 (two-sided)
- **Effect size**: [expected difference]
- **Dropout rate**: [expected percentage]

### Analysis Populations
- **Intent-to-treat (ITT)**: All randomized patients
- **Per-protocol (PP)**: Patients completing per protocol
- **Safety**: All patients receiving ≥1 dose

## Study Schedule
### Study Duration
- **Screening period**: [timeframe]
- **Treatment period**: [duration]
- **Follow-up period**: [duration]
- **Total study duration**: [estimated completion]

### Visit Schedule
| Visit | Screening | Baseline | Cycle 1-6 | End of Treatment | Follow-up |
|-------|-----------|----------|-----------|------------------|-----------|
| Window | -28 days | Day 1 | q3 weeks | Within 30 days | q12 weeks |`,
      },
      {
        id: 'study-objectives',
        title: 'Study Objectives and Endpoints',
        content: `# Study Objectives and Endpoints

## Primary Objective
**Objective**: To evaluate the [efficacy/safety] of [investigational product] compared to [control] in patients with [indication].

**Rationale**: [Scientific and clinical rationale for the primary objective, including unmet medical need and expected benefit]

## Secondary Objectives
### Efficacy Objectives
1. **Objective 2.1**: To assess [secondary efficacy parameter]
   - **Rationale**: [Why this endpoint is important]
   - **Clinical relevance**: [How results will inform clinical practice]

2. **Objective 2.2**: To evaluate [duration/time-to-event outcome]
   - **Rationale**: [Importance of temporal aspects]
   - **Clinical relevance**: [Impact on treatment decisions]

### Safety Objectives
3. **Objective 3.1**: To characterize the safety and tolerability profile
   - **Rationale**: [Importance of safety assessment]
   - **Risk-benefit assessment**: [How safety data will be integrated]

4. **Objective 3.2**: To identify dose-limiting toxicities (if applicable)
   - **Rationale**: [For dose-escalation studies]
   - **Clinical relevance**: [Dose recommendation for future studies]

### Pharmacokinetic Objectives
5. **Objective 4.1**: To characterize the pharmacokinetic profile
   - **Parameters of interest**: [Cmax, AUC, t½, clearance]
   - **Population PK**: [Covariate analysis planned]

6. **Objective 4.2**: To assess drug-drug interactions (if applicable)
   - **Specific interactions**: [Known or suspected interactions]
   - **Clinical significance**: [Impact on dosing recommendations]

### Biomarker Objectives
7. **Objective 5.1**: To explore biomarkers of [target engagement/efficacy]
   - **Biomarker types**: [Pharmacodynamic, predictive, prognostic]
   - **Clinical utility**: [How biomarkers may guide treatment]

## Study Endpoints

### Primary Endpoint
**Definition**: [Specific, measurable endpoint with clear criteria]
- **Assessment method**: [How endpoint will be measured]
- **Timing**: [When assessments will occur]
- **Success criteria**: [What constitutes a positive result]

**Example**: Overall Response Rate (ORR) defined as the proportion of patients achieving complete response (CR) or partial response (PR) according to RECIST v1.1 criteria, assessed by independent central review.

### Key Secondary Endpoints
#### Efficacy Endpoints
1. **Progression-Free Survival (PFS)**
   - **Definition**: Time from randomization to disease progression or death
   - **Assessment**: [Imaging schedule and criteria]
   - **Censoring rules**: [Specific censoring scenarios]

2. **Overall Survival (OS)**
   - **Definition**: Time from randomization to death from any cause
   - **Follow-up**: [Long-term follow-up plan]
   - **Analysis timing**: [Planned interim and final analyses]

3. **Duration of Response (DOR)**
   - **Definition**: Time from first response to progression
   - **Population**: Patients achieving CR or PR
   - **Clinical relevance**: [Durability of benefit]

#### Safety Endpoints
4. **Adverse Events**
   - **Grading**: CTCAE version [version number]
   - **Attribution**: Relationship to study drug
   - **Reporting**: [Serious AE reporting timelines]

5. **Laboratory Safety**
   - **Parameters**: [Specific lab tests and normal ranges]
   - **Frequency**: [Monitoring schedule]
   - **Stopping rules**: [Safety stopping criteria]

#### Quality of Life Endpoints
6. **Patient-Reported Outcomes**
   - **Instruments**: [Specific questionnaires]
   - **Domains**: [Physical, emotional, functional well-being]
   - **Clinical relevance**: [Meaningful change definitions]

### Exploratory Endpoints
#### Pharmacokinetic Endpoints
- **PK parameters**: Cmax, Tmax, AUC, t½, CL/F, Vd/F
- **Population PK**: Covariate effects on exposure
- **Exposure-response**: Relationship between exposure and efficacy/safety

#### Biomarker Endpoints
- **Pharmacodynamic markers**: [Target engagement biomarkers]
- **Predictive biomarkers**: [Patient selection markers]
- **Resistance mechanisms**: [Mechanisms of treatment failure]

## Endpoint Assessment Schedule
| Assessment | Screening | Baseline | On-Treatment | End of Treatment | Follow-up |
|------------|-----------|----------|--------------|------------------|-----------|
| Primary endpoint | - | ✓ | [frequency] | ✓ | [schedule] |
| Safety | ✓ | ✓ | Continuous | ✓ | 30 days |
| PK sampling | - | ✓ | [specific visits] | - | - |
| Biomarkers | ✓ | ✓ | [frequency] | ✓ | - |
| QoL | - | ✓ | [frequency] | ✓ | [schedule] |`,
      },
    ],
  },
  'investigator-brochure': {
    title: 'Investigator Brochure',
    sections: [
      {
        id: 'ib-summary',
        title: 'Investigator Brochure Summary',
        content: `# Investigator Brochure Summary

## Executive Summary
This Investigator Brochure provides comprehensive information about [Investigational Product] to support the safe and effective conduct of clinical studies. The data presented herein represents the current state of knowledge as of [date].

### Key Information
- **Chemical Name**: [IUPAC name]
- **Molecular Formula**: [formula]
- **Molecular Weight**: [weight] Da
- **CAS Number**: [number]
- **Development Code**: [code]

## Physical, Chemical, and Pharmaceutical Properties
### Physical Description
- **Appearance**: [description of compound]
- **Physical state**: [solid/liquid at room temperature]
- **Color**: [color description]
- **Odor**: [odor characteristics if applicable]

### Chemical Properties
- **Solubility**: 
  - Water: [solubility in mg/mL]
  - Organic solvents: [specific solvents and solubility]
- **pH stability**: [stable pH range]
- **pKa**: [ionization constants]
- **Log P**: [partition coefficient]

### Pharmaceutical Properties
- **Stability**: [thermal, photostability, oxidation]
- **Polymorphism**: [crystal forms identified]
- **Formulation considerations**: [excipient compatibility]

## Pharmacology
### Mechanism of Action
[Investigational Product] is a [drug class] that [mechanism of action]. The compound specifically [target interaction] leading to [downstream effects].

#### Primary Target
- **Target**: [specific protein/receptor/enzyme]
- **Binding affinity**: [Kd or IC50 values]
- **Selectivity**: [selectivity profile vs related targets]

#### Pathway Modulation
- **Upstream effects**: [immediate biochemical changes]
- **Downstream signaling**: [pathway consequences]
- **Cellular outcomes**: [cell-level effects]
- **Tissue-level effects**: [organ system impacts]

### Primary Pharmacodynamics
#### In Vitro Studies
- **Target engagement**: [biochemical assays demonstrating target binding]
- **Functional assays**: [cellular assays showing biological activity]
- **Concentration-response**: [EC50/IC50 values in relevant assays]

#### Ex Vivo Studies
- **Tissue studies**: [effects in isolated tissues/organs]
- **Biomarker modulation**: [pharmacodynamic markers affected]

### Secondary Pharmacodynamics
#### Off-Target Effects
- **Related targets**: [activity at similar targets]
- **Safety pharmacology targets**: [cardiovascular, CNS, respiratory]
- **Selectivity profile**: [selectivity ratios and implications]

## Pharmacokinetics
### Absorption
#### Oral Administration (if applicable)
- **Bioavailability**: [percentage absorbed]
- **Tmax**: [time to maximum concentration]
- **Food effects**: [impact of food on absorption]
- **Dose proportionality**: [linear vs non-linear kinetics]

#### Other Routes of Administration
- **Intravenous**: [if applicable - bioavailability, distribution]
- **Subcutaneous**: [if applicable - absorption rate and extent]
- **Topical**: [if applicable - systemic absorption]

### Distribution
- **Volume of distribution**: [Vd values in different species]
- **Protein binding**: [percentage bound to plasma proteins]
- **Tissue distribution**: [major organs of accumulation]
- **Blood-brain barrier**: [CNS penetration if relevant]
- **Placental transfer**: [if reproductive studies conducted]

### Metabolism
#### Metabolic Pathways
- **Primary pathways**: [major metabolic routes]
- **CYP enzymes involved**: [specific isoforms and contribution]
- **Metabolites identified**: [structure and activity of major metabolites]
- **Species differences**: [comparative metabolism across species]

#### Drug Interactions
- **CYP inhibition**: [potential to inhibit drug-metabolizing enzymes]
- **CYP induction**: [potential to induce enzymes]
- **Transporter interactions**: [P-gp, BCRP, OAT, OCT interactions]

### Excretion
- **Primary route**: [urine, feces, other]
- **Percentage excreted unchanged**: [renal clearance component]
- **Half-life**: [elimination half-life in different species]
- **Clearance**: [total body clearance values]

## Toxicology
### Single-Dose Toxicity
#### Acute Toxicity Studies
| Species | Route | LD50/MTD | Primary Findings |
|---------|-------|----------|------------------|
| Mouse | Oral | [value] | [key findings] |
| Mouse | IV | [value] | [key findings] |
| Rat | Oral | [value] | [key findings] |

### Repeat-Dose Toxicity
#### Subchronic Studies (28-day to 6-month)
**Species**: [species used]
**Duration**: [study duration]
**Dose levels**: [dose range tested]
**NOAEL**: [no observed adverse effect level]
**Target organs**: [organs showing toxicity]
**Reversibility**: [recovery assessment]

**Key Findings**:
- [Major toxicity findings]
- [Dose-relationship]
- [Gender differences]
- [Reversibility]

### Reproductive and Developmental Toxicity
#### Fertility Studies
- **Species**: [species tested]
- **NOAEL**: [fertility NOAEL]
- **Findings**: [effects on reproductive organs/function]

#### Embryo-Fetal Development
- **Species**: [species tested]
- **NOAEL**: [developmental NOAEL]
- **Teratogenic potential**: [malformation findings]
- **Growth effects**: [fetal weight/size impacts]

#### Pre- and Postnatal Development
- **Study conducted**: [Yes/No]
- **NOAEL**: [maternal and offspring NOAEL]
- **Findings**: [effects on offspring development]

### Genotoxicity
| Assay | Result | Comments |
|-------|--------|----------|
| Ames test | [+/-] | [specific findings] |
| In vitro chromosome aberration | [+/-] | [concentration/findings] |
| In vivo micronucleus | [+/-] | [dose/findings] |

### Carcinogenicity
- **Studies planned/conducted**: [status of carcinogenicity studies]
- **Rationale**: [ICH M3 guidance application]
- **Alternative approaches**: [if long-term studies not conducted]

## Human Experience
### First-in-Human Study
- **Study design**: [design and objectives]
- **Population**: [healthy volunteers or patients]
- **Dose range**: [starting dose to maximum tested]
- **Safety findings**: [key safety observations]
- **PK findings**: [human pharmacokinetics]

### Subsequent Clinical Studies
#### Phase I Studies
- **Number of studies**: [count]
- **Total exposure**: [number of subjects]
- **Dose range explored**: [range tested]
- **Key findings**: [safety, PK, preliminary efficacy]

#### Phase II Studies
- **Indication(s) studied**: [specific patient populations]
- **Efficacy signals**: [preliminary efficacy data]
- **Optimal dose identification**: [dose selection rationale]
- **Safety profile**: [adverse event profile]

## Safety Profile
### Adverse Event Summary
#### Most Common AEs (>5% incidence)
- [List of common adverse events with frequencies]

#### Serious Adverse Events
- [Description of SAEs and relationship assessment]

#### Dose-Limiting Toxicities
- [DLTs identified and dose relationship]

### Safety Monitoring
#### Recommended Monitoring
- **Laboratory parameters**: [specific tests and frequency]
- **Vital signs**: [parameters and frequency]
- **ECG monitoring**: [if cardiac effects observed]
- **Special assessments**: [organ-specific monitoring]

#### Risk Mitigation
- **Contraindications**: [absolute contraindications]
- **Warnings and precautions**: [important safety information]
- **Dose modifications**: [criteria for dose adjustments]

## Clinical Pharmacology
### Human Pharmacokinetics
- **Absorption**: [bioavailability and absorption characteristics]
- **Distribution**: [volume of distribution and protein binding]
- **Metabolism**: [human metabolic pathways]
- **Excretion**: [elimination routes and half-life]

### Special Populations
#### Hepatic Impairment
- **Study conducted**: [Yes/No]
- **Findings**: [impact on exposure]
- **Recommendations**: [dose adjustments if needed]

#### Renal Impairment
- **Study conducted**: [Yes/No]
- **Findings**: [impact on exposure]
- **Recommendations**: [dose adjustments if needed]

#### Drug-Drug Interactions
- **CYP interactions**: [inhibition/induction studies]
- **Transporter interactions**: [clinical DDI studies]
- **Recommendations**: [contraindicated combinations]

## Risk Assessment
### Benefit-Risk for Proposed Studies
#### Potential Benefits
- [Expected therapeutic benefits based on MOA and preclinical data]

#### Identified Risks
- [Known risks from preclinical and clinical data]

#### Risk Mitigation Strategies
- [Proposed monitoring and safety measures]

### Starting Dose Rationale
- **NOAEL**: [from toxicology studies]
- **Safety factor**: [applied safety margin]
- **Allometric scaling**: [if used for dose translation]
- **MABEL approach**: [if applicable]
- **Final starting dose**: [recommended dose with rationale]

## References
[Comprehensive list of supporting literature and internal study reports]

---
**Document Version**: [version number]
**Date of Last Update**: [date]
**Next Scheduled Update**: [date]`,
      },
    ],
  },
};

const MOCK_TEMPLATES = {
  'clinical-overview-module-2-5': {
    title: 'Clinical Overview (Module 2.5)',
    content: 'This is a comprehensive Clinical Overview following ICH M4 guidelines...',
  },
  'safety-summary': {
    title: 'Clinical Safety Summary',
    content: 'Comprehensive safety analysis of clinical trial data...',
  },
  'clinical-protocol': {
    title: 'Clinical Study Protocol',
    content: 'Detailed protocol for Phase II/III clinical study...',
  },
  'investigator-brochure': {
    title: 'Investigator Brochure',
    content: 'Complete investigator brochure with pharmacology and safety data...',
  },
};

export const ectdPyramidService = {
  async getAvailableTemplates() {
    try {
      console.log('[eCTD Service] Fetching available templates...');

      // Use comprehensive templates instead of mock data
      const templates = Object.keys(COMPREHENSIVE_TEMPLATES).map(key => ({
        id: key,
        title: COMPREHENSIVE_TEMPLATES[key].title,
        description: `Professional ${COMPREHENSIVE_TEMPLATES[key].title} template with comprehensive regulatory content`,
        category: 'eCTD Module',
        sections: COMPREHENSIVE_TEMPLATES[key].sections.length,
      }));

      console.log('[eCTD Service] Templates loaded successfully:', templates.length);
      return { success: true, templates };
    } catch (error) {
      console.error('[eCTD Service] Error fetching templates:', error);
      // Fallback to basic templates if comprehensive ones fail
      const fallbackTemplates = Object.keys(MOCK_TEMPLATES).map(key => ({
        id: key,
        title: MOCK_TEMPLATES[key].title,
        description: `Template for ${MOCK_TEMPLATES[key].title}`,
        category: 'eCTD Module',
      }));

      return { success: true, templates: fallbackTemplates };
    }
  },

  async getTemplate(templateId) {
    try {
      console.log('[eCTD Service] Loading template:', templateId);

      // Check comprehensive templates first
      if (COMPREHENSIVE_TEMPLATES[templateId]) {
        const template = COMPREHENSIVE_TEMPLATES[templateId];
        console.log('[eCTD Service] Comprehensive template loaded:', templateId);
        return {
          success: true,
          template: {
            id: templateId,
            title: template.title,
            sections: template.sections,
            metadata: {
              version: '2.1',
              lastUpdated: new Date().toISOString(),
              type: 'comprehensive',
              wordCount: template.sections.reduce(
                (acc, section) => acc + section.content.length,
                0
              ),
            },
          },
        };
      }

      // Fallback to mock templates
      if (MOCK_TEMPLATES[templateId]) {
        const template = MOCK_TEMPLATES[templateId];
        console.log('[eCTD Service] Fallback template loaded:', templateId);
        return {
          success: true,
          template: {
            id: templateId,
            title: template.title,
            content: template.content,
            metadata: {
              version: '1.0',
              type: 'basic',
            },
          },
        };
      }

      throw new Error(`Template ${templateId} not found`);
    } catch (error) {
      console.error('[eCTD Service] Error loading template:', error);
      return {
        success: false,
        error: error.message,
        template: {
          id: templateId,
          title: 'Template Loading Error',
          content: 'Unable to load template content. Please try again.',
          metadata: { type: 'error' },
        },
      };
    }
  },

  async validateTemplate(templateData) {
    try {
      console.log('[eCTD Service] Validating template...');

      const validationResults = {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
      };

      // Validate required fields
      if (!templateData.title || templateData.title.trim().length === 0) {
        validationResults.errors.push('Template title is required');
        validationResults.isValid = false;
      }

      if (!templateData.content && (!templateData.sections || templateData.sections.length === 0)) {
        validationResults.errors.push('Template must have content or sections');
        validationResults.isValid = false;
      }

      // Content quality checks
      if (templateData.content) {
        if (templateData.content.length < 100) {
          validationResults.warnings.push('Template content is very short');
        }

        if (
          templateData.content.includes('[placeholder]') ||
          templateData.content.includes('TODO')
        ) {
          validationResults.warnings.push('Template contains placeholder text');
        }
      }

      // Section validation for comprehensive templates
      if (templateData.sections) {
        templateData.sections.forEach((section, index) => {
          if (!section.title) {
            validationResults.errors.push(`Section ${index + 1} missing title`);
            validationResults.isValid = false;
          }
          if (!section.content || section.content.length < 50) {
            validationResults.warnings.push(`Section "${section.title}" has minimal content`);
          }
        });
      }

      // Regulatory compliance suggestions
      if (templateData.title.toLowerCase().includes('clinical')) {
        validationResults.suggestions.push('Consider adding ICH GCP compliance statements');
      }

      if (templateData.title.toLowerCase().includes('safety')) {
        validationResults.suggestions.push(
          'Ensure CIOMS safety reporting guidelines are referenced'
        );
      }

      console.log('[eCTD Service] Template validation completed:', validationResults);
      return { success: true, validation: validationResults };
    } catch (error) {
      console.error('[eCTD Service] Template validation error:', error);
      return {
        success: false,
        error: error.message,
        validation: { isValid: false, errors: ['Validation failed'] },
      };
    }
  },

  async generateDocument(templateId, parameters = {}) {
    try {
      console.log('[eCTD Service] Generating document from template:', templateId);

      const templateResult = await this.getTemplate(templateId);
      if (!templateResult.success) {
        throw new Error(`Failed to load template: ${templateResult.error}`);
      }

      const template = templateResult.template;
      let generatedContent;

      // Generate content based on template type
      if (template.sections) {
        // Comprehensive template with sections
        generatedContent = {
          title: template.title,
          sections: template.sections.map(section => ({
            ...section,
            content: this.populateTemplate(section.content, parameters),
          })),
          metadata: {
            ...template.metadata,
            generatedAt: new Date().toISOString(),
            parameters: parameters,
          },
        };
      } else {
        // Basic template with simple content
        generatedContent = {
          title: template.title,
          content: this.populateTemplate(template.content, parameters),
          metadata: {
            ...template.metadata,
            generatedAt: new Date().toISOString(),
            parameters: parameters,
          },
        };
      }

      console.log('[eCTD Service] Document generated successfully');
      return {
        success: true,
        document: generatedContent,
        statistics: {
          sectionsGenerated: generatedContent.sections ? generatedContent.sections.length : 1,
          wordCount: this.calculateWordCount(generatedContent),
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('[eCTD Service] Document generation error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  populateTemplate(content, parameters) {
    let populatedContent = content;

    // Replace common placeholders with actual values
    const replacements = {
      '[Product Name]': parameters.productName || '[Product Name]',
      '[Indication]': parameters.indication || '[Indication]',
      '[Study ID]': parameters.studyId || '[Study ID]',
      '[Protocol ID]': parameters.protocolId || '[Protocol ID]',
      '[Sponsor Name]': parameters.sponsorName || '[Sponsor Name]',
      '[Principal Investigator]': parameters.principalInvestigator || '[Principal Investigator]',
      '[number]': parameters.sampleSize || '[number]',
      '[percentage]': parameters.percentage || '[percentage]',
      '[date]': new Date().toLocaleDateString(),
      '[version]': parameters.version || '1.0',
    };

    Object.entries(replacements).forEach(([placeholder, value]) => {
      populatedContent = populatedContent.replace(
        new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        value
      );
    });

    return populatedContent;
  },

  calculateWordCount(document) {
    if (document.sections) {
      return document.sections.reduce((total, section) => {
        return total + (section.content.split(/\s+/).length || 0);
      }, 0);
    } else if (document.content) {
      return document.content.split(/\s+/).length || 0;
    }
    return 0;
  },
};

export default ectdPyramidService;
