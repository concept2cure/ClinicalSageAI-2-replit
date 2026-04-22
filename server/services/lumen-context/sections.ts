/**
 * CTD section-specific prompt supplements.
 *
 * Encodes ICH M4 and region-specific drafting guidance per CTD section
 * (Module 1–5). Consumed by both /chat and /stream when an authoring
 * context carries a sectionCode, so AnA gives section-appropriate
 * drafting scaffolding (body expectations, common review concerns,
 * formatting requirements).
 *
 * Extracted from server/services/lumen-context-builder.ts. The original
 * import site re-exports buildSectionSpecificPrompt to preserve backward
 * compatibility.
 *
 * @module server/services/lumen-context/sections
 */

const SECTION_PROMPTS: Record<string, string> = {
  // ── MODULE 1: Administrative ──────────────────────────────────────────────

  '1.1': `## Drafting: Module 1.1 — Cover Letter / FDA Form 1571
You are drafting the IND Cover Letter and FDA Form 1571.

### Required Content:
- Sponsor name, address, and contact information
- Drug name (proposed proprietary name, chemical name, code designation)
- IND number (if amendment or annual report; "NEW" for initial)
- Cross-reference to any related INDs, NDAs, or DMFs
- Phase of clinical investigation proposed
- Description of protocol(s) included
- Identification of the serial number
- Signature of sponsor or authorized representative

### FDA Expectations:
- Must list ALL components being submitted in this package
- Cross-reference table to prior submissions if amending
- eSignature must comply with 21 CFR Part 11
- Include statement of commitment per 21 CFR 312.23(a)(1)

### Common Deficiencies:
- Missing serial numbers on amendments
- Incomplete cross-reference to master files
- Ambiguous identification of clinical phases`,

  '1.2': `## Drafting: Module 1.2 — Table of Contents
You are generating the Table of Contents for the CTD.

### Requirements:
- Must reflect the actual eCTD structure per ICH M4
- Hyperlink every entry to the corresponding document/section
- Include volume/page references for paper submissions
- Use eCTD 4.0 lifecycle operations for amendments
- Automatically generated from the eCTD backbone.xml in electronic submissions

### Best Practice:
- Use the eCTD Module structure as the organizational backbone
- Cross-reference CTD triangle diagram for completeness check`,

  '1.3.1': `## Drafting: Module 1.3.1 — FDA Form 1572
You are assisting with FDA Form 1572 (Statement of Investigator).

### Required Fields:
- Name and address of investigator
- Name and address of research facility
- Name and code of protocol(s)
- Drug name and IND reference
- Clinical laboratory information
- List of sub-investigators and research team
- IRB name and address
- Investigator commitments (8 required statements)

### Critical Compliance Points:
- Must be signed BEFORE drug is shipped to the site
- One 1572 per investigator per protocol
- All sub-investigators listed must have adequate training
- Lab certifications (CLIA, CAP) must be current
- Must be updated when investigator information changes`,

  '1.3.3': `## Drafting: Module 1.3.3 — Investigator's Brochure (IB)
You are drafting the Investigator's Brochure per ICH E6(R2) Section 7.

### Required Sections (per ICH E6):
1. Title page (drug name, IND number, edition date)
2. Confidentiality statement
3. Table of Contents
4. Summary (1-2 pages; nonclinical + clinical overview)
5. Introduction (rationale, target population)
6. Physical, Chemical, and Pharmaceutical Properties
7. Nonclinical Studies: pharmacology, pharmacokinetics, toxicology
8. Effects in Humans: PK, safety, efficacy, post-marketing
9. Summary of Data and Guidance for the Investigator
10. References

### FDA Review Focus:
- Summary section must allow rapid risk-benefit assessment
- Nonclinical safety data presentation should match ICH M4 organization
- Known/expected adverse reactions must be clearly presented
- Dosing rationale derived from nonclinical/PK data
- Must be updated at least annually per 21 CFR 312.55

### Common Deficiencies:
- Missing sections (especially effects in humans for FIH)
- Inadequate dose-response characterization
- Safety margin calculations absent or poorly presented
- No clear guidance section for investigators`,

  // ── MODULE 2: Summaries ───────────────────────────────────────────────────

  '2.2': `## Drafting: Module 2.2 — Introduction to the CTD
You are drafting the CTD Introduction (typically 1-2 pages).

### Required Content:
- Drug name (all names: proprietary, non-proprietary, chemical, company code)
- Pharmacological class
- Proposed indication(s) and route of administration
- Dosage form and strength(s)
- Brief pharmacological rationale
- Reference to any orphan drug or fast-track designations

### Format:
- Maximum 2 pages
- Factual, concise overview
- Do NOT include efficacy claims or promotional language`,

  '2.3': `## Drafting: Module 2.3 — Quality Overall Summary (QOS)
You are drafting the Quality Overall Summary per ICH M4Q(R1).

### Required Structure:
1. Introduction
2. Drug Substance (2.3.S) — summary of each active ingredient
   - General Information (nomenclature, structure, properties)
   - Manufacture (synthetic route, process controls, critical steps)
   - Characterization (elucidation of structure, impurities)
   - Control (specifications, analytical procedures, validation)
   - Reference Standards
   - Container Closure System
   - Stability (summary of stability studies, proposed shelf-life)
3. Drug Product (2.3.P) — summary of each dosage form
   - Description and Composition
   - Pharmaceutical Development (formulation rationale, excipient selection)
   - Manufacture (process description, process controls, validation)
   - Control (specifications, analytical procedures, batch analysis)
   - Reference Standards
   - Container Closure System
   - Stability (summary studies, proposed shelf-life)
4. Appendices (facilities, adventitious agents assessment)
5. Regional Information

### ICH Guidelines to Reference:
- **ICH Q1A-Q1F**: Stability testing
- **ICH Q2(R1)**: Analytical validation
- **ICH Q3A/Q3B**: Impurities
- **ICH Q6A/Q6B**: Specifications
- **ICH Q7**: GMP for APIs
- **ICH Q8-Q12**: Pharmaceutical development, QRM, PQS

### FDA Review Focus for Initial IND:
- For Phase 1: Abbreviated CMC is acceptable per 21 CFR 312.23(a)(7)
- Focus on identity, strength, purity, potency sufficient for initial clinical safety
- GMP compliance for clinical supplies
- Detailed stability data may be limited; provide available data with commitment to generate

### Common Deficiencies:
- Insufficient characterization of impurity profiles
- Missing identity/purity specifications for drug substance
- Inadequate description of manufacturing process controls
- No discussion of container closure system suitability`,

  '2.4': `## Drafting: Module 2.4 — Nonclinical Overview
You are drafting the Nonclinical Overview per ICH M4S.

### Required Content:
- Integrated assessment of ALL nonclinical pharmacology, PK, and toxicology
- Safety pharmacology assessment (cardiovascular, CNS, respiratory)
- PK/ADME profile summary
- Toxicology findings across all completed studies
- Evaluation of impurities' qualification status per ICH Q3A/Q3B
- Integrated risk assessment with safety margins for proposed clinical dose
- Carcinogenicity assessment strategy (if applicable)
- Reproductive toxicology strategy and available data

### ICH Guidelines:
- **ICH M3(R2)**: Nonclinical safety studies timing
- **ICH S1-S11**: Various nonclinical study guidelines
- **ICH S6(R1)**: Biotechnology-derived biologicals
- **ICH S7A/S7B**: Safety pharmacology, QT prolongation
- **ICH S9**: Oncology products

### Structure:
This is a NARRATIVE overview, not a study-by-study listing. It should:
1. Synthesize findings across studies
2. Discuss relevance to human risk
3. Identify gaps and mitigation strategies
4. Support the proposed clinical program

### Common Deficiencies:
- Tabular listings without integration/interpretation
- Missing safety margin calculations
- Inadequate PK/tox correlation
- No discussion of species relevance`,

  '2.5': `## Drafting: Module 2.5 — Clinical Overview
You are drafting the Clinical Overview per ICH M4E.

### Required Structure:
1. Product Development Rationale
2. Overview of Biopharmaceutics
3. Overview of Clinical Pharmacology
4. Overview of Efficacy
5. Overview of Safety
6. Benefits and Risks Conclusions

### For Initial IND (Phase 1):
- Focus on Sections 1-3 (rationale and pharmacology)
- Efficacy section may reference disease background and unmet need
- Safety section should discuss nonclinical-to-clinical safety extrapolation
- Include MRTD (maximum recommended therapeutic dose) rationale from nonclinical data
- Starting dose justification (MRSD calculation per FDA Guidance)

### ICH Guidelines:
- **ICH E1**: Population exposure sizing
- **ICH E2-E4**: Clinical safety/periodic reporting
- **ICH E3**: Clinical study report structure
- **ICH E6(R2)**: GCP compliance
- **ICH E8(R3)**: General considerations for clinical studies
- **ICH E9(R1)**: Estimands framework

### Critical for FDA:
- Must be a critical assessment, NOT just a summary
- Discuss published literature on the drug class
- Address known class effects and monitoring strategy
- Provide benefit-risk analysis that supports the clinical plan`,

  '2.6': `## Drafting: Module 2.6 — Nonclinical Written and Tabulated Summaries
You are assisting with the Nonclinical Summaries per ICH M4S.

### Sub-sections:
- **2.6.1**: Introduction
- **2.6.2**: Pharmacology Written Summary
- **2.6.3**: Pharmacology Tabulated Summary
- **2.6.4**: Pharmacokinetics Written Summary
- **2.6.5**: Pharmacokinetics Tabulated Summary
- **2.6.6**: Toxicology Written Summary
- **2.6.7**: Toxicology Tabulated Summary

### Key Requirements:
- Written summaries: concise narrative per study category
- Tabulated summaries: standardized tables per ICH M4S templates
- Cross-reference all study reports in Module 4
- Include GLP compliance status for each study
- Highlight study deviations and their impact

### Format Standards:
- Use ICH M4S prescribed table formats
- Each table must reference the full report location in Module 4
- Include species, strain, dose levels, duration, key findings
- No-Observed-Adverse-Effect-Level (NOAEL) for each study`,

  '2.7': `## Drafting: Module 2.7 — Clinical Summary
You are assisting with the Clinical Summary per ICH M4E.

### Sub-sections:
- **2.7.1**: Summary of Biopharmaceutic Studies
- **2.7.2**: Summary of Clinical Pharmacology Studies
- **2.7.3**: Summary of Clinical Efficacy
- **2.7.4**: Summary of Clinical Safety
- **2.7.5**: Literature References
- **2.7.6**: Synopses of Individual Studies

### For Initial IND:
- 2.7.1-2.7.2 may be abbreviated
- 2.7.3/2.7.4 will reference the proposed clinical plan
- 2.7.6 should include any available FIH study data (if from foreign sites)
- Include any published literature on the compound or analogs

### Format:
- Study synopses should follow ICH E3 format
- Cross-reference CSRs in Module 5
- Use integrated tables for multi-study datasets`,

  // ── MODULE 3: Quality (CMC) ───────────────────────────────────────────────

  '3.2.S': `## Drafting: Module 3.2.S — Drug Substance
You are drafting the Drug Substance section per ICH M4Q.

### Full Structure:
- **3.2.S.1**: General Information (nomenclature, structure, properties)
- **3.2.S.2**: Manufacture (manufacturer info, description, process controls, critical steps, validation)
- **3.2.S.3**: Characterisation (structure elucidation, impurity profile)
- **3.2.S.4**: Control (specification, analytical procedures, validation, batch analyses, justification)
- **3.2.S.5**: Reference Standards
- **3.2.S.6**: Container Closure System
- **3.2.S.7**: Stability (protocol, results, proposed retest period/storage)

### ICH Guidelines:
- **Q2(R1)**: Analytical Validation
- **Q3A(R2)**: Impurities in Drug Substances
- **Q6A**: Specifications for Chemical Substances
- **Q7**: GMP for APIs
- **Q11**: Development and Manufacture of Drug Substances

### Phase 1 IND Expectations (Abbreviated CMC):
- Identity, purity, and strength data required
- Full validation of analytical methods not required for Phase 1
- Manufacturing process description (not full validation)
- Certificate of Analysis for clinical batch(es)
- Preliminary stability data (≥ sufficient for study duration)

### Common FDA Feedback:
- Ensure impurity identification and qualification per ICH Q3A
- Starting material justification is a frequent discussion point
- Process description should identify critical process parameters`,

  '3.2.P': `## Drafting: Module 3.2.P — Drug Product
You are drafting the Drug Product section per ICH M4Q.

### Full Structure:
- **3.2.P.1**: Description and Composition
- **3.2.P.2**: Pharmaceutical Development
- **3.2.P.3**: Manufacture (batch formula, process description, controls, validation)
- **3.2.P.4**: Control (specifications, analytical procedures, validation, batch analyses)
- **3.2.P.5**: Reference Standards
- **3.2.P.6**: Container Closure System
- **3.2.P.7**: Stability (protocol, results, proposed shelf-life)
- **3.2.P.8**: Appendices

### ICH Guidelines:
- **Q1A-Q1E**: Stability testing
- **Q2(R1)**: Analytical validation
- **Q3B(R2)**: Impurities in Drug Products
- **Q6A**: Specifications
- **Q8(R2)**: Pharmaceutical Development
- **Q9**: Quality Risk Management

### Phase 1 Expectations:
- Abbreviated P.2 (development rationale, not full QbD)
- Clinical batch CoA with proposed specification
- Basic compatibility data for container closure
- Stability data supporting proposed clinical study duration
- GMP compliance per 21 CFR 211 for clinical manufacturing`,

  // ── MODULE 4: Nonclinical Study Reports ────────────────────────────────────

  '4.2.1': `## Drafting: Module 4.2.1 — Pharmacology Studies
You are organizing/summarizing the Pharmacology Study Reports.

### Sub-sections:
- **4.2.1.1**: Primary Pharmacodynamics (mechanism of action, receptor binding, in vitro/in vivo efficacy)
- **4.2.1.2**: Secondary Pharmacodynamics (off-target effects)
- **4.2.1.3**: Safety Pharmacology (hERG, Irwin, respiratory)
- **4.2.1.4**: Pharmacodynamic Drug Interactions

### ICH Guidelines:
- **S7A**: Safety Pharmacology Studies for Human Pharmaceuticals
- **S7B**: Nonclinical Evaluation of QT/QTc Prolongation
- **ICH M3(R2)**: Timing of nonclinical studies to support clinical

### FDA Expectations:
- Safety pharmacology core battery (cardiovascular, CNS, respiratory) required before FIH
- hERG study with IC50 relative to anticipated therapeutic Cmax
- In vivo QT study (e.g., conscious telemetry in non-rodent) if hERG positive
- Justify species relevance for pharmacology models`,

  '4.2.2': `## Drafting: Module 4.2.2 — Pharmacokinetics
You are organizing the PK/ADME study reports.

### Required Studies:
- **4.2.2.1**: Analytical Methods and Validation
- **4.2.2.2**: Absorption studies (bioavailability, food effect if applicable)
- **4.2.2.3**: Distribution studies (tissue distribution, protein binding, placental transfer)
- **4.2.2.4**: Metabolism (in vitro metabolism, CYP interaction, metabolite ID)
- **4.2.2.5**: Excretion (mass balance, routes)
- **4.2.2.6**: Pharmacokinetic Drug Interactions (in vitro DDI)
- **4.2.2.7**: Other (toxicokinetics cross-referenced from tox studies)

### ICH Guidelines:
- **S3A**: Toxicokinetics
- **M3(R2)**: Timing guidance

### Data Requirements for IND:
- Species PK data (minimum 2 species, including the tox species)
- Protein binding in plasma (human + tox species)
- In vitro metabolism (microsomal/hepatocyte stability)
- CYP inhibition/induction panel
- Human PK prediction (allometric scaling or PBPK)`,

  '4.2.3': `## Drafting: Module 4.2.3 — Toxicology
You are organizing the Toxicology study reports.

### Sub-sections:
- **4.2.3.1**: Single-Dose Toxicity
- **4.2.3.2**: Repeat-Dose Toxicity (pivotal studies)
- **4.2.3.3**: Genotoxicity (ICH S2(R1) battery)
- **4.2.3.4**: Carcinogenicity (if applicable)
- **4.2.3.5**: Reproductive/Developmental Toxicity
- **4.2.3.6**: Local Tolerance
- **4.2.3.7**: Other (immunotoxicity, phototoxicity, etc.)

### ICH Guidelines:
- **S1A-S1C(R2)**: Carcinogenicity
- **S2(R1)**: Genotoxicity (3-test battery)
- **S4**: Duration of repeat-dose tox
- **S5(R3)**: Reproductive toxicology
- **S6(R1)**: Biotech-derived products
- **S9**: Oncology products (modified requirements)
- **S11**: Nonclinical safety testing for pediatric

### For Phase 1 IND:
- Minimum: GLP repeat-dose tox in 2 species (rodent + non-rodent)
  - Duration must exceed proposed clinical study by ICH M3 requirements
- Genotoxicity: minimum Ames test + one in vitro/in vivo chromosomal aberration test
- Single-dose tox studies (range-finding) can support Phase 1
- Segment II repro-tox NOT required for Phase 1 (males in short studies)

### Common FDA RTF Issues:
- Study duration insufficient for proposed clinical program
- Missing GLP statement in study reports
- Inadequate toxicokinetic sampling
- NOAEL poorly supported by the data presentation`,

  // ── MODULE 5: Clinical Study Reports ───────────────────────────────────────

  '5.2': `## Drafting: Module 5.2 — Tabular Listing of All Clinical Studies
You are generating the Tabular Listing per ICH E3.

### Required Columns:
- Study Number
- Study Title
- Study Design (randomized, blinded, etc.)
- Study Population
- Treatment Groups and Dosing
- Number of Subjects
- Study Duration
- Study Status
- CSR Section Reference

### For Initial IND:
- Include the PROPOSED clinical study protocol
- Reference any published or foreign clinical data
- Include any PK bridging studies if applicable`,

  '5.3.1': `## Drafting: Module 5.3.1 — Reports of Biopharmaceutic Studies
BA/BE studies, dissolution, food effect, etc.

### For Phase 1 IND:
- May not have human biopharmaceutic data yet
- Include any in vitro dissolution data from Module 3
- Reference any published class PK data`,

  '5.3.3': `## Drafting: Module 5.3.3 — Reports of Human PK Studies
You are organizing PK study reports.

### For Phase 1:
- This section may contain the proposed Phase 1 PK study protocol
- Include any FIH exposure predictions (allometric scaling, PBPK modeling)
- Reference nonclinical PK data bridging from Module 4`,

  '5.3.5': `## Drafting: Module 5.3.5 — Clinical Study Reports
You are assisting with CSR formatting per ICH E3.

### ICH E3 CSR Structure:
1. Title Page
2. Synopsis
3. Table of Contents
4. List of Abbreviations
5. Ethics (IRB/IEC, consent, regulatory compliance)
6. Investigators and Study Administrative Structure
7. Introduction
8. Study Objectives
9. Investigational Plan (study design, endpoints, statistics)
10. Study Patients (disposition, demographics, protocol deviations)
11. Efficacy Evaluation
12. Safety Evaluation
13. Discussion and Overall Conclusions
14. Tables, Figures, Graphs (referenced by section)
15. Reference List
16. Appendices (protocol, amendments, sample CRF, listing of patients, etc.)

### FDA Expectations:
- Synopsis must be stand-alone
- Individual patient data listings in appendices
- Statistical analysis plan (SAP) as an appendix
- Follow ICH E9(R1) estimands framework for efficacy endpoints`,

  // ── Protocol-specific ─────────────────────────────────────────────────────

  '5.3.5.1': `## Drafting: Module 5.3.5.1 — Clinical Protocol
You are drafting a Clinical Study Protocol per ICH E6(R2).

### Standard Protocol Sections:
1. Protocol Summary/Synopsis
2. Introduction and Background/Rationale
3. Study Objectives and Endpoints
4. Study Design (including schema figure)
5. Study Population (inclusion/exclusion criteria)
6. Study Treatments (drug, dose, route, schedule, duration)
7. Study Assessments and Procedures
8. Statistical Considerations (sample size, analysis populations, methods)
9. Adverse Event Reporting
10. Data Management and Quality Assurance
11. Ethics and Regulatory Considerations
12. References
13. Appendices (schedule of assessments table, lab normals, etc.)

### ICH E6(R2) Requirements:
- Risk-Based Monitoring plan
- Protocol amendments process
- IMP accountability procedures
- Investigator responsibilities

### ICH E8(R3) Considerations:
- Quality by Design approach to clinical studies
- Critical to Quality factors identification
- Stakeholder engagement framework

### FDA Phase 1 Specifics:
- Starting dose justification (MRSD per FDA Guidance)
- Dose escalation scheme with stopping rules
- Safety monitoring (DSMB/SMC charter reference)
- Sentinel dosing requirements
- Biomarker or PD endpoint rationale`,
};

/**
 * Build section-specific prompt supplement based on CTD section code.
 * Handles exact matches of, e.g., "3.2.S" or prefix matches
 * for sections like "3.2.S.1" → "3.2.S".
 */
export function buildSectionSpecificPrompt(sectionCode: string): string | null {
  // Exact match first
  if (SECTION_PROMPTS[sectionCode]) {
    return SECTION_PROMPTS[sectionCode];
  }

  // Try prefix match (e.g., "3.2.S.2.1" → "3.2.S")
  const parts = sectionCode.split('.');
  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('.');
    if (SECTION_PROMPTS[prefix]) {
      return (
        SECTION_PROMPTS[prefix] +
        `\n\n> **Note**: You are specifically working on sub-section ${sectionCode}. Provide guidance focused on this particular sub-section within the broader ${prefix} context described above.`
      );
    }
  }

  // Module-level fallback
  const moduleNum = sectionCode.charAt(0);
  const MODULE_GUIDES: Record<string, string> = {
    '1': `## Module 1 — Administrative Information
You are working on Module 1 (Administrative and Prescribing Information) section ${sectionCode}.
This module contains region-specific administrative documents, forms, and cover letters.
Reference 21 CFR 312.23 for IND requirements or other relevant regional guidance.`,
    '2': `## Module 2 — CTD Summaries
You are working on Module 2 (Common Technical Document Summaries) section ${sectionCode}.
Module 2 provides the critical overview documents that FDA reviewers read first.
Follow ICH M4 format requirements for all summaries.`,
    '3': `## Module 3 — Quality (CMC)
You are working on Module 3 (Quality) section ${sectionCode}.
This covers Chemistry, Manufacturing, and Controls per ICH M4Q(R1).
For Phase 1 IND, abbreviated CMC per 21 CFR 312.23(a)(7).
Reference ICH Q-series guidelines as appropriate.`,
    '4': `## Module 4 — Nonclinical Study Reports
You are working on Module 4 (Nonclinical Study Reports) section ${sectionCode}.
Organize study reports per ICH M4S. Include GLP statements.
Reference ICH S-series guidelines for study design requirements.`,
    '5': `## Module 5 — Clinical Study Reports
You are working on Module 5 (Clinical Study Reports) section ${sectionCode}.
Format per ICH E3. Include ICH E6(R2) GCP compliance.
Reference ICH E-series guidelines for study design and reporting.`,
  };

  return MODULE_GUIDES[moduleNum] || null;
}
