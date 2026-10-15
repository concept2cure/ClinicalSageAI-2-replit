/**
 * CTD section-specific prompt supplements.
 *
 * Consumed by both /chat and /stream when an authoring context carries a
 * sectionCode, so AnA gives section-appropriate drafting scaffolding.
 *
 * A section the canonical CTD overlay registers (CTD_AUTHORING_GUIDANCE), or
 * one beneath it, is briefed from that overlay through ind/ctd/section-brief.ts
 * — the same entries the orchestrator names the open section from. The
 * playbooks kept in this file cover what the overlay does not model: a whole
 * module ('2.7', '3.2.S', '5.3.5') and deliverables outside the CTD tree
 * ('SAP', 'CER-BODY', 'TYPE-B-MEETING'). This file used to brief registered
 * codes itself, and twelve of those entries were removed on 2026-10-04 (D2,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/): five named the wrong
 * section — 1.1 "Cover Letter / FDA Form 1571", 1.2 "Table of Contents", 1.3.1
 * "FDA Form 1572", 1.3.3 "Investigator's Brochure" (FDA Module 1: 1.1 forms,
 * 1.2 cover letter, 1.3.3 debarment certification, 1.14.4.1 IB) and 5.3.5.1
 * "Clinical Protocol" (5.3.5.1 holds the reports of controlled studies) — and
 * seven (2.2–2.5, 5.2, 5.3.1, 5.3.3) were shadowed copies of overlay entries.
 *
 * Extracted from server/services/lumen-context-builder.ts. The original
 * import site re-exports buildSectionSpecificPrompt to preserve backward
 * compatibility.
 *
 * @module server/services/lumen-context/sections
 */

import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { renderSectionBrief, resolveSectionBriefSource, e3TopLevel } from '../ind/ctd/index.js';

/** ICH E3's sixteen headings, from the overlay (ind/ctd/csr-e3-guidance.ts). */
const E3_OUTLINE = e3TopLevel().map((s) => `${s.number}. ${s.title}`).join('\n');

const SECTION_PROMPTS: Record<string, string> = {
  // ── MODULE 2: Summaries ───────────────────────────────────────────────────

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
- **Q2(R2)**: Analytical Validation (with Q14, Analytical Procedure Development)
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
- **Q2(R2)**: Analytical validation
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

  '5.3.5': `## Drafting: Module 5.3.5 — Clinical Study Reports
You are assisting with CSR formatting per ICH E3.

### ICH E3 CSR Structure:
${E3_OUTLINE}

### FDA Expectations:
- Synopsis must be stand-alone
- Individual patient data listings in appendices
- Statistical analysis plan (SAP) as appendix 16.1.9
- Case report forms for every patient who died or left the study because of an adverse event (21 CFR 314.50(f)(2)), in 16.3.1
- Follow ICH E9(R1) estimands framework for efficacy endpoints`,

  // ── DEVICE: 510(k) Substantial Equivalence ────────────────────────────────

  '510K-SE': `## Drafting: 510(k) Substantial Equivalence Comparison
You are drafting the substantial equivalence (SE) discussion for a Traditional, Special, or Abbreviated 510(k) per FDA Form 3514 and the 510(k) Program guidance (Section 7).

### Required Structure (per FDA Decision-Making Process):
1. **Predicate identification** — Cite legally marketed predicate(s) by 510(k) number with clearance date
2. **Intended use comparison** — Side-by-side, identical or with documented justification for any difference
3. **Indications for use comparison** — Verbatim from predicate labeling vs. proposed; flag any expansion
4. **Technological characteristics** — Component-level comparison: principle of operation, materials, energy source, design specifications, performance specifications
5. **Performance data summary** — Bench, biocompatibility, sterilization, software, animal, and clinical data demonstrating equivalent performance
6. **SE conclusion statement** — Affirmative declaration with the regulatory basis

### What FDA Reviewers Verify:
- The predicate is legally marketed and has not been removed from market
- Different intended use → automatic NSE; the intended-use comparison must be airtight
- "Same" technological characteristics or "different but does not raise different questions of safety and effectiveness"
- Performance data demonstrates the differences do not affect safety or effectiveness
- Each technological difference is paired with corresponding performance data

### Common Deficiencies (Refuse-to-Accept Triggers):
- Vague intended-use language that masks an indication expansion
- Predicate selection that pre-dates current consensus standards (e.g., outdated biocompatibility per ISO 10993-1:2018)
- Technology comparison that lists differences without explaining performance equivalence
- Missing reference to any performance test that supports equivalence
- Citing a predicate that itself was cleared via 510(k) reliance on a now-recalled device

### SE Tone:
The SE discussion is a regulatory argument, not a marketing pitch. State the comparison facts; let the equivalence conclusion follow from the data. Avoid "innovative," "novel," or "improved" anywhere in the SE narrative — those words invite NSE classification.`,

  // ── DEVICE: Clinical Evaluation Report (EU MDR) ───────────────────────────

  'CER-BODY': `## Drafting: Clinical Evaluation Report (CER) per EU MDR / MDCG 2020-13
You are drafting the body of a Clinical Evaluation Report under Regulation (EU) 2017/745 (MDR), MEDDEV 2.7/1 Rev 4 framework, with current MDCG guidance (MDCG 2020-1, 2020-13, 2020-6).

### Required Structure (MEDDEV 2.7/1 Rev 4 Stages):
- **Stage 0 — Scope** — Device description, intended purpose, intended patient population, intended clinical benefit
- **Stage 1 — Clinical evaluation plan** — Equivalence claim (if any), device classification, state-of-the-art definition, acceptance criteria
- **Stage 2 — Data identification & appraisal** — Literature search protocol (PICO, databases, dates), included/excluded studies with rationale, GRADE-style appraisal of each
- **Stage 3 — Data analysis** — Benefit-risk profile, residual risks per ISO 14971, comparison to state-of-the-art, conclusions on safety and performance
- **Stage 4 — Conclusion** — Whether clinical evidence supports conformity with GSPRs 1, 6, 7, 8

### Equivalence Claims (MDCG 2020-5):
- Three pillars must ALL be demonstrated: clinical, technical, biological equivalence
- For Class III and implantables, equivalence routes are highly restricted post-MDR
- If using equivalence, you must have access to the comparator device's technical documentation (a contract is now required)
- Most legacy CE-marked devices cannot rely on equivalence under MDR — generate own clinical data

### Notified Body Scrutiny Patterns (MDCG 2020-13):
- Literature search must be reproducible — protocol, dates, search strings, hit counts at each stage
- Each included publication must be appraised for relevance AND methodological quality
- State-of-the-art definition must be evidenced from current guidance, standards, and recent literature
- Residual risks must trace from the risk management file (ISO 14971) into the CER
- PMCF plan must be specific — "ongoing literature surveillance" alone is not sufficient

### Common Deficiencies:
- Equivalence claimed without access to comparator technical documentation
- Literature appraisal that lists papers but does not weight them
- State-of-the-art described in general terms without specific benchmarks
- Benefit-risk conclusion that does not address each identified residual risk
- PMCF plan that is generic rather than device-specific
- Missing acceptance criteria — "favorable benefit-risk" without quantitative anchors

### CER Voice:
Notified body reviewers expect the register of a clinical assessment, not a marketing document. Every claim of safety or performance must be traceable to a specific data source cited in the appraisal table. Use "the available clinical evidence supports..." not "the device is proven to..."`,

  // ── CLINICAL: Statistical Analysis Plan ───────────────────────────────────

  'SAP': `## Drafting: Statistical Analysis Plan (SAP) per ICH E9(R1)
You are drafting a Statistical Analysis Plan using the ICH E9(R1) Estimand framework. The SAP must be finalized and signed before database lock.

### Required Structure:
1. **Administrative information** — Protocol reference, SAP version, approval signatures, change-control procedure
2. **Study objectives and endpoints** — Primary, key secondary, secondary, exploratory; each mapped to its estimand
3. **Estimands** (ICH E9(R1) core) — For each key endpoint, specify the five attributes: treatment condition, population, variable, intercurrent event strategy, population-level summary
4. **Study design and sample size** — Design description, randomization scheme, blinding, sample size with assumptions (effect size, variance, dropout, alpha, power)
5. **Analysis populations** — ITT / mITT / PP / Safety / PK; definitions and rules for inclusion/exclusion
6. **Statistical methods** — Primary analysis model (with covariates, fixed/random effects), handling of missing data, sensitivity analyses, supportive analyses
7. **Multiple comparisons / Multiplicity control** — Hierarchical testing, graphical procedures, type I error preservation
8. **Interim analyses** — Timing, stopping rules, alpha spending function (if group sequential), DSMB charter reference
9. **Safety analyses** — Coding (MedDRA version), TEAE summaries, AE severity/relationship tabulations, death and SAE narratives
10. **Data presentation** — TFL conventions (decimal precision, missing-value handling, population headers), shell references

### ICH E9(R1) Estimand Discipline:
- Every primary/key secondary endpoint MUST have a fully specified estimand — not just "change from baseline in HbA1c at Week 26," but the five attributes.
- Intercurrent event strategies: Treatment Policy / Composite / While On Treatment / Hypothetical / Principal Stratum. Each handled event must name its strategy.
- The estimator (analysis method) must align with the estimand — a hypothetical strategy requires a method that targets that estimand (e.g., MMRM with specific assumptions), not an ITT ANCOVA and a hope.

### Common SAP Deficiencies:
- Estimand present in name only — attributes not explicitly enumerated
- Primary analysis specified without a sensitivity analysis that stresses the missing-data assumption
- Subgroup analyses listed without pre-specification of which are confirmatory vs exploratory
- Multiplicity control plan that doesn't close on the family of claims being made
- Mismatch between protocol-defined endpoints and SAP endpoints (SAP must be the source of truth; protocol is directional)
- MedDRA version not locked — must specify version at database lock
- TFL shells referenced but not appended or not consistent with the analysis methods

### SAP Voice:
The SAP is a contract with the regulator about what the analysis will be — pre-specification is its core value. Use declarative, unambiguous language. "The primary analysis will use a mixed-effects model for repeated measures (MMRM) with fixed effects for treatment, visit, treatment-by-visit interaction, and stratification factors" — not "the analysis may consider MMRM." Avoid "if needed" and "as appropriate"; specify the trigger conditions.`,

  // ── DEVICE: PMA Summary of Safety & Effectiveness Data (SSED) ─────────────

  'PMA-SSED': `## Drafting: PMA Summary of Safety and Effectiveness Data (SSED)
You are drafting the SSED that will be published on the FDA CDRH database after PMA approval. It becomes the public-facing description of the device, its trials, and the approval basis — plan accordingly.

### Required Structure (per CDRH SSED guidance):
1. **General information** — Device trade name, generic name, applicant, date of notice, PMA number, review classification
2. **Indications for use** — Final cleared language (verify against the approval letter before finalizing)
3. **Contraindications, warnings, precautions** — From the labeling
4. **Device description** — Principle of operation, components, materials, dimensions, software version, accessories
5. **Alternative practices and procedures** — Standard of care being replaced or supplemented
6. **Marketing history** — Prior 510(k) clearances, international availability, recalls or field actions
7. **Summary of studies** — Non-clinical (bench, biocompatibility, sterilization, software, animal) and clinical (design, enrollment, endpoints, results, adverse events)
8. **Summary of nonclinical laboratory studies** — Testing to relevant consensus standards; discrepancies explained
9. **Summary of clinical investigations** — Pivotal study design, populations, endpoints (primary/secondary), results vs pre-specified success criteria, subgroup analyses, adverse events
10. **Conclusions drawn from the studies** — Safety conclusions and effectiveness conclusions separately
11. **Panel recommendation** (if applicable) — Advisory committee position
12. **FDA decision** — Approval basis

### What FDA Reviewers (and the Public) Will Verify:
- Indications for use match the final labeling verbatim
- Pivotal study was pre-registered on ClinicalTrials.gov with consistent endpoints
- Primary endpoint met with pre-specified success criterion (not met is fatal for PMA)
- All adverse device effects (ADE), serious ADEs, and device-related deaths disclosed
- Subgroup analyses disclosed even when unfavorable
- Post-approval study commitments listed with enrollment and follow-up targets
- Conflicts between study and labeling (e.g., exclusions in study not reflected in labeling) flagged

### Common SSED Deficiencies:
- Clinical effectiveness conclusions that over-reach the data (SSED is a public permanent record)
- Missing disclosure of post-hoc analyses or protocol amendments that affected the primary endpoint
- Adverse events summarized without rates — regulators and the public both need denominators
- Inconsistency with the clinical study report submitted in the PMA module 5
- Post-approval study (PAS) commitments described too loosely to be auditable
- Device description that doesn't match the current design history file (DHF) / post-market changes

### SSED Voice:
The SSED is a public document. It will be read by plaintiffs' attorneys, journalists, competitors, and payers — not just regulators. Write accordingly: every claim of effectiveness must be traceable to a specific pre-specified endpoint result, every safety statement must be anchored to event rates from the pivotal study, and the language must be defensible ten years after publication. Avoid promotional language; report findings.`,

  // ── MEETING: FDA Pre-IND / Type B Meeting Briefing Document ───────────────

  'TYPE-B-MEETING': `## Drafting: FDA Type B Meeting Briefing Document (Pre-IND, EOP2, Pre-NDA/BLA)
You are drafting a Type B meeting briefing document for FDA. The briefing package is submitted approximately 6 weeks before the meeting and sets the agenda for a ~60-minute discussion.

### Required Structure (per FDA Formal Meetings guidance):
1. **Product and application overview** — Drug, development stage, proposed indication, IND/NDA number, prior FDA interactions
2. **Meeting background** — Purpose of the meeting (Type B1/B2/B3), prior correspondence with FDA, the specific decision points being brought
3. **Specific questions for FDA** — Numbered, discrete, decision-oriented. Each question must be answerable with yes/no or a specific recommendation, not "please comment on our overall approach"
4. **Sponsor's position on each question** — Your proposed answer and rationale, so FDA can agree/disagree/modify
5. **Supporting data and rationale** — For each question, the data package and regulatory precedent that supports your position
6. **Specific discussion topics** — If any topics require discussion but not FDA decision, called out separately
7. **Proposed attendees** — Sponsor team with roles; FDA will match the relevant review division
8. **Appendices** — Protocol, CMC updates, nonclinical summaries, prior minutes — as needed for the questions being asked

### Question Discipline (the most important part):
- **Bad question:** "Does FDA have any comments on our Phase 3 program?"
- **Good question:** "Does FDA agree that a single confirmatory Phase 3 study using the endpoint and population described in Section 4.2 is sufficient to support an efficacy claim for [indication]?"
- Every question must be:
  - Answerable with a specific FDA position
  - Supported by a proposed sponsor position in the briefing
  - Bounded to one decision (compound questions dilute the answer)
- Maximum useful: 5–7 well-framed questions. More than 10 and FDA will triage.

### What FDA Prepares Before the Meeting:
- Reviewers read the briefing and draft preliminary responses
- Division leadership aligns on positions for key questions before the meeting
- Written minutes will reflect the briefing's questions verbatim — so the questions you ask are the questions that get answered officially

### Common Briefing Deficiencies:
- Questions that are requests for coaching rather than decisions ("please comment on...")
- Sponsor position that is weak or absent — FDA must then construct both sides
- Data referenced but not included in the appendix, forcing reviewers to cross-reference prior submissions during their prep week
- Meeting type mismatch (requesting Type B for what is actually a Type C scientific discussion, or vice versa)
- Too many questions — the first 5 are discussed meaningfully; the rest get cursory responses
- Failure to cite prior FDA feedback — divisions remember their positions and expect continuity

### Briefing Voice:
The briefing is a regulatory argument, not a marketing pitch. State your position with the confidence of someone who has done the work, and let the data support it. Use "the sponsor proposes..." framing, not "we believe..." or "we feel that..." Avoid enthusiasm; FDA reads briefings with a skeptical eye and marketing tone invites that skepticism.`,
};

/**
 * Build section-specific prompt supplement based on CTD section code.
 * Handles exact matches of, e.g., "3.2.S" or prefix matches
 * for sections like "3.2.S.1" → "3.2.S".
 */
export function buildSectionSpecificPrompt(sectionCode: string): string | null {
  // A section the canonical overlay registers, or one beneath it, is briefed
  // from the overlay, so this playbook and the orchestrator's section line
  // can never name the open section differently.
  const source = resolveSectionBriefSource(sectionCode);
  if (source && source.kind !== 'parent') return renderSectionBrief(sectionCode);

  // A module playbook ('2.7', '3.2.S') or a deliverable outside the CTD tree
  // ('SAP'). CTD-shaped input is normalised first ('m2.7' → '2.7').
  const key = normalizeCtdCode(sectionCode) ?? sectionCode.trim();
  if (SECTION_PROMPTS[key]) {
    return SECTION_PROMPTS[key];
  }

  // A parent of registered sections with no playbook here ('1.1', '1.14'):
  // the sections it contains, from the overlay.
  if (source) return renderSectionBrief(sectionCode);

  // Try prefix match (e.g., "4.2.1.5" → "4.2.1")
  const parts = key.split('.');
  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('.');
    if (SECTION_PROMPTS[prefix]) {
      return (
        SECTION_PROMPTS[prefix] +
        `\n\n> **Note**: You are specifically working on sub-section ${key}. Provide guidance focused on this particular sub-section within the broader ${prefix} context described above.`
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
Format per ICH E3. Include ICH E6(R3) GCP compliance.
Reference ICH E-series guidelines for study design and reporting.`,
  };

  return MODULE_GUIDES[moduleNum] || null;
}
