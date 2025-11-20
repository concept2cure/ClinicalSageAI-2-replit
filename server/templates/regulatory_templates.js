// FDA and ICH Regulatory Document Templates
// Real regulatory templates based on FDA and ICH guidelines

export const FDA_TEMPLATES = {
  '510k': {
    device_description: {
      title: 'Device Description and Intended Use',
      sections: [
        'Device Name and Classification',
        'Intended Use Statement',
        'Indications for Use',
        'Contraindications',
        'Warnings and Precautions',
        'Device Description',
        'Substantial Equivalence Comparison',
      ],
      requirements: ['FDA 21 CFR 807.87', 'FDA Guidance K98-1'],
      template: `# Device Description and Intended Use

## 1. Device Name and Classification
**Device Name:** [Product Name]
**FDA Product Code:** [XXX]
**Device Class:** Class [I/II/III]
**Regulation:** 21 CFR [regulation number]

## 2. Intended Use Statement
[Product Name] is intended for [specific medical purpose] in [target population].

## 3. Indications for Use
[Product Name] is indicated for [specific clinical indications].

## 4. Contraindications
- [List specific contraindications]
- [Medical conditions where device should not be used]

## 5. Warnings and Precautions
### Warnings:
- [Critical safety warnings]

### Precautions:
- [Important safety precautions]

## 6. Device Description
### Physical Description:
- [Detailed physical description]
- [Components and materials]

### Technical Specifications:
- [Performance specifications]
- [Operating parameters]

## 7. Substantial Equivalence Comparison
**Predicate Device:** [Predicate name] (K-number: [KXXXXXX])
**Comparison Table:**
| Feature | Subject Device | Predicate Device |
|---------|----------------|------------------|
| [Feature] | [Description] | [Description] |

---
*This template complies with FDA 21 CFR 807.87 requirements*`,
    },
    predicate_comparison: {
      title: 'Predicate Device Comparison',
      sections: [
        'Predicate Device Identification',
        'Technological Characteristics',
        'Performance Comparison',
        'Safety and Effectiveness',
        'Substantial Equivalence Conclusion',
      ],
      requirements: ['FDA 21 CFR 807.87(f)', 'FDA K98-1 Guidance'],
      template: `# Predicate Device Comparison

## 1. Predicate Device Identification
**Primary Predicate:** [Device Name]
**510(k) Number:** K[XXXXXX]
**FDA Product Code:** [XXX]
**Clearance Date:** [Date]

## 2. Technological Characteristics Comparison

| Characteristic | Subject Device | Predicate Device | Analysis |
|----------------|----------------|------------------|----------|
| Materials | [Description] | [Description] | [Same/Different] |
| Design | [Description] | [Description] | [Same/Different] |
| Energy Source | [Description] | [Description] | [Same/Different] |
| Operating Principle | [Description] | [Description] | [Same/Different] |

## 3. Performance Comparison
### Performance Testing Results:
- **Subject Device:** [Results]
- **Predicate Device:** [Literature/Reference results]
- **Analysis:** [Comparison and conclusions]

## 4. Safety and Effectiveness Analysis
The subject device demonstrates substantial equivalence to the predicate device based on:
- [Safety analysis]
- [Effectiveness analysis]
- [Risk assessment]

## 5. Substantial Equivalence Conclusion
Based on the comparison of technological characteristics and performance data, the subject device is substantially equivalent to the predicate device.

---
*This comparison meets FDA 21 CFR 807.87(f) requirements for substantial equivalence*`,
    },
  },
  IND: {
    investigational_plan: {
      title: 'General Investigational Plan',
      sections: [
        'Rationale and Objectives',
        'General Approach',
        'Study Population',
        'Study Design Overview',
        'Endpoints and Assessments',
        'Risk Assessment',
      ],
      requirements: ['21 CFR 312.23(a)(3)', 'FDA IND Guidance'],
      template: `# General Investigational Plan

## 1. Rationale and Objectives
### Scientific Rationale:
[Provide scientific justification for the investigation]

### Primary Objectives:
- [Primary objective 1]
- [Primary objective 2]

### Secondary Objectives:
- [Secondary objective 1]
- [Secondary objective 2]

## 2. General Approach
### Development Strategy:
[Describe overall development approach]

### Regulatory Pathway:
[Describe intended regulatory pathway]

## 3. Study Population
### Target Population:
- **Age Range:** [X-Y years]
- **Gender:** [Male/Female/Both]
- **Condition:** [Medical condition]
- **Severity:** [Disease severity]

### Inclusion Criteria:
- [Key inclusion criteria]

### Exclusion Criteria:
- [Key exclusion criteria]

## 4. Study Design Overview
### Phase I Studies:
- **Design:** [Study design]
- **Duration:** [Study duration]
- **Sample Size:** [N participants]

### Planned Future Studies:
- **Phase II:** [Brief description]
- **Phase III:** [Brief description]

## 5. Endpoints and Assessments
### Primary Endpoints:
- [Primary endpoint 1]
- [Primary endpoint 2]

### Secondary Endpoints:
- [Secondary endpoint 1]
- [Secondary endpoint 2]

### Safety Assessments:
- [Safety assessments planned]

## 6. Risk Assessment
### Known Risks:
- [Known risks from preclinical studies]

### Risk Mitigation:
- [Risk mitigation strategies]

---
*This plan complies with 21 CFR 312.23(a)(3) requirements*`,
    },
  },
};

export const ICH_TEMPLATES = {
  M4: {
    clinical_overview: {
      title: 'Clinical Overview (Module 2.5)',
      sections: [
        'Product Development Rationale',
        'Overview of Biopharmaceutics',
        'Overview of Clinical Pharmacology',
        'Overview of Efficacy',
        'Overview of Safety',
        'Benefits and Risks Conclusions',
      ],
      requirements: ['ICH M4 Section 2.5', 'ICH E3 Guidelines'],
      template: `# Clinical Overview (Module 2.5)

## 1. Product Development Rationale
### Medical Need:
[Description of unmet medical need]

### Product Characteristics:
- **Mechanism of Action:** [MOA description]
- **Therapeutic Class:** [Drug class]
- **Route of Administration:** [Route]
- **Dosage Form:** [Formulation]

## 2. Overview of Biopharmaceutics
### Formulation Development:
[Summary of formulation development]

### Bioavailability/Bioequivalence:
[Summary of BA/BE studies if applicable]

## 3. Overview of Clinical Pharmacology
### Pharmacokinetics:
- **Absorption:** [Summary]
- **Distribution:** [Summary]
- **Metabolism:** [Summary]
- **Excretion:** [Summary]

### Pharmacodynamics:
[Summary of PD findings]

### Special Populations:
- **Renal Impairment:** [Summary]
- **Hepatic Impairment:** [Summary]
- **Elderly:** [Summary]
- **Pediatric:** [Summary]

## 4. Overview of Efficacy
### Primary Studies:
**Study [XXX-001]:**
- **Design:** [Study design]
- **Population:** [Patient population]
- **Primary Endpoint:** [Endpoint description]
- **Results:** [Key efficacy results]

### Supportive Studies:
[Summary of supportive efficacy data]

### Dose-Response Relationship:
[Summary of dose-response findings]

## 5. Overview of Safety
### Exposure:
- **Total Subjects:** [N]
- **Duration:** [Exposure duration]

### Common Adverse Events:
| System Organ Class | Adverse Event | Frequency |
|--------------------|---------------|-----------|
| [SOC] | [AE] | [Frequency] |

### Serious Adverse Events:
[Summary of SAEs]

### Deaths:
[Summary of deaths if any]

### Laboratory Abnormalities:
[Summary of clinically significant lab abnormalities]

## 6. Benefits and Risks Conclusions
### Benefits:
- [Key benefit 1]
- [Key benefit 2]

### Risks:
- [Key risk 1]
- [Key risk 2]

### Benefit-Risk Assessment:
[Overall benefit-risk conclusion]

---
*This overview follows ICH M4 Module 2.5 format and guidelines*`,
    },
    clinical_summary: {
      title: 'Clinical Summary (Module 2.7)',
      sections: [
        'Summary of Biopharmaceutic Studies',
        'Summary of Clinical Pharmacology Studies',
        'Summary of Clinical Efficacy',
        'Summary of Clinical Safety',
        'Literature References',
      ],
      requirements: ['ICH M4 Section 2.7', 'ICH E3 Guidelines'],
      template: `# Clinical Summary (Module 2.7)

## 1. Summary of Biopharmaceutic Studies and Associated Analytical Methods

### Analytical Methods:
[Summary of bioanalytical methods]

### Bioavailability Studies:
[Summary of BA studies]

### Bioequivalence Studies:
[Summary of BE studies if applicable]

## 2. Summary of Clinical Pharmacology Studies

### Pharmacokinetic Studies:
**Study [PK-001]:**
- **Objective:** [Study objective]
- **Design:** [Study design]
- **Results:** [Key PK parameters]

### Pharmacodynamic Studies:
**Study [PD-001]:**
- **Objective:** [Study objective]
- **Design:** [Study design]
- **Results:** [Key PD findings]

### Drug-Drug Interaction Studies:
[Summary of DDI studies]

## 3. Summary of Clinical Efficacy

### Indication and Usage:
[Proposed indication]

### Study Design and Conduct Issues:
[Summary of design considerations]

### Study Results:
**Pivotal Study [XXX-301]:**
- **Primary Analysis:** [Results]
- **Secondary Analyses:** [Results]
- **Subgroup Analyses:** [Results]

### Clinical Significance:
[Discussion of clinical significance]

## 4. Summary of Clinical Safety

### Patient Exposure:
| Study Phase | Number of Subjects | Duration of Exposure |
|-------------|-------------------|---------------------|
| Phase I | [N] | [Duration] |
| Phase II | [N] | [Duration] |
| Phase III | [N] | [Duration] |

### Adverse Events:
**Most Common AEs (≥5%):**
- [AE 1]: [Frequency]
- [AE 2]: [Frequency]

### Serious Adverse Events:
[Summary of SAEs by system organ class]

### Discontinuations:
- **Due to AEs:** [N (%)]
- **Due to Lack of Efficacy:** [N (%)]

### Deaths:
[Summary of deaths with causality assessment]

### Special Safety Concerns:
[Discussion of any special safety concerns]

## 5. Literature References
[Relevant published literature supporting the application]

---
*This summary follows ICH M4 Module 2.7 format and requirements*`,
    },
  },
};

export const THERAPEUTIC_TEMPLATES = {
  oncology: {
    clinical_overview: {
      title: 'Oncology Clinical Overview',
      sections: [
        'Cancer Type and Staging',
        'Treatment Landscape',
        'Mechanism of Action',
        'Efficacy in Target Population',
        'Safety in Cancer Patients',
        'Benefit-Risk in Oncology Context',
      ],
      template: `# Oncology Clinical Overview

## 1. Cancer Type and Staging
### Cancer Indication:
**Primary Indication:** [Cancer type]
**Stage/Grade:** [Cancer stage/grade]
**Molecular Markers:** [Relevant biomarkers]

### Epidemiology:
- **Incidence:** [Incidence data]
- **Prevalence:** [Prevalence data]
- **Prognosis:** [Prognostic factors]

## 2. Treatment Landscape
### Standard of Care:
- **First-line:** [Current first-line treatment]
- **Second-line:** [Current second-line treatment]
- **Unmet Medical Need:** [Description of unmet need]

### Regulatory Precedent:
[Similar approved therapies and their approval basis]

## 3. Mechanism of Action
### Target/Pathway:
[Description of therapeutic target]

### Anticancer Activity:
[Mechanism of anticancer effect]

### Biomarkers:
[Predictive/prognostic biomarkers]

## 4. Efficacy in Target Population
### Primary Efficacy Endpoints:
- **Overall Survival (OS):** [Results if available]
- **Progression-Free Survival (PFS):** [Results]
- **Overall Response Rate (ORR):** [Results]
- **Duration of Response (DoR):** [Results]

### Clinically Meaningful Benefit:
[Discussion of clinical meaningfulness]

## 5. Safety in Cancer Patients
### Oncology-Specific Safety Considerations:
- **Hematologic Toxicity:** [Summary]
- **Immunosuppression:** [Summary]
- **Secondary Malignancies:** [Assessment]

### Common Adverse Events in Oncology:
[AEs relevant to cancer patient population]

## 6. Benefit-Risk in Oncology Context
### Acceptable Toxicity Profile:
[Justification for acceptable risk in cancer setting]

### Benefit-Risk Conclusion:
[Oncology-specific benefit-risk assessment]

---
*Specialized for oncology regulatory submissions*`,
    },
  },
  cardiovascular: {
    clinical_overview: {
      title: 'Cardiovascular Clinical Overview',
      sections: [
        'Cardiovascular Indication',
        'CV Risk Assessment',
        'Efficacy Endpoints',
        'CV Safety Profile',
        'CV Outcomes Studies',
      ],
      template: `# Cardiovascular Clinical Overview

## 1. Cardiovascular Indication
### Target Condition:
**Primary Indication:** [CV condition]
**Patient Population:** [Target CV patient population]
**Severity:** [Disease severity/classification]

### Pathophysiology:
[CV pathophysiology relevant to treatment]

## 2. CV Risk Assessment
### Baseline CV Risk:
[Assessment of baseline cardiovascular risk]

### Risk Factors:
- **Major CV Risk Factors:** [List]
- **Modifiable Risk Factors:** [List]

## 3. Efficacy Endpoints
### CV Efficacy Measures:
- **Primary Endpoint:** [CV primary endpoint]
- **MACE Components:** [If applicable]
  - CV Death
  - Myocardial Infarction
  - Stroke
  - Hospitalization for Unstable Angina

### Surrogate Endpoints:
[Validated CV surrogate endpoints used]

## 4. CV Safety Profile
### CV Safety Assessments:
- **ECG Monitoring:** [ECG findings]
- **Blood Pressure:** [BP effects]
- **Heart Rate:** [HR effects]
- **Cardiac Function:** [Echo/other assessments]

### CV Adverse Events:
[Summary of CV-related AEs]

## 5. CV Outcomes Studies
### CVOT Results:
[If CV outcomes trial conducted]

### Meta-analyses:
[Any relevant meta-analyses of CV outcomes]

---
*Specialized for cardiovascular regulatory submissions*`,
    },
  },
};

// Template selection functions
export function getTemplate(category, subcategory, templateType) {
  const templates = {
    FDA: FDA_TEMPLATES,
    ICH: ICH_TEMPLATES,
    THERAPEUTIC: THERAPEUTIC_TEMPLATES,
  };

  return templates[category]?.[subcategory]?.[templateType];
}

export function getAvailableTemplates() {
  return {
    regulatory: {
      fda: Object.keys(FDA_TEMPLATES),
      ich: Object.keys(ICH_TEMPLATES),
    },
    therapeutic: Object.keys(THERAPEUTIC_TEMPLATES),
  };
}
