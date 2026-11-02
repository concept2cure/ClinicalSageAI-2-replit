/**
 * How a study population is defined with respect to a predictive biomarker —
 * the positions the protocol and IND interviews offer, written once.
 *
 * Split out of the two flows that ask it (2026-11-02, S4), as
 * csr-report-robustness.ts and cmc-specification-container-closure-stability.ts
 * are: one list, so the two interviews cannot drift apart on what a position
 * commits a sponsor to. The four enrichment designs are typed against the
 * biomarker engine's own (`EnrichmentDesignOption`, services/biomarkers), so
 * the interview and the engine name the same designs.
 *
 * 'not_defined' is the one value in the refusal set (cross-node-context.ts):
 * xn_oncology_no_biomarker_strategy fires on it, and on nothing else here.
 */
import type { QuestionOption } from '../types.js';
import type { EnrichmentDesignOption } from '../../../biomarkers/biomarker-knowledge.js';

type Selection =
  | EnrichmentDesignOption['design']
  | 'tissue_agnostic'
  | 'escalation_unselected_expansion_selected'
  | 'imaging_agent_selection'
  | 'all_comers_exploratory'
  | 'not_defined';

export const BIOMARKER_SELECTION_OPTIONS: ReadonlyArray<QuestionOption & { value: Selection }> = [
  {
    value: 'biomarker_positive_only',
    label: 'Biomarker-selected: only marker-positive patients enrol',
    commits:
      'The selecting assay should be analytically validated before it enrols anyone, or specimens banked for a later bridging study. Used to decide eligibility without confirmation by an established test, it is generally not exempt under 21 CFR 812.2(c)(3)(iv), so a significant-risk determination is needed and an IDE if significant risk. A companion diagnostic is co-developed if the label will require the test, and the label is limited to marker-positive patients, so excluding marker-negative patients needs justifying.',
    authority: 'FDA Guidance: Enrichment Strategies for Clinical Trials to Support Determination of Effectiveness of Human Drugs and Biological Products (2019); FDA Guidance: In Vitro Companion Diagnostic Devices (2014); FDA Draft Guidance: Principles for Codevelopment of an In Vitro Companion Diagnostic Device with a Therapeutic Product (2016); 21 CFR 812.2(c)(3), 812.3(m), 812.20',
  },
  {
    value: 'enrichment_with_negative_cohort',
    label: 'Marker-positive enrichment, with a smaller marker-negative cohort',
    commits:
      'Every patient tested; the marker-negative cohort is sized to show whether they benefit, which decides whether the label is restricted. The selecting assay carries the same device-study and companion-diagnostic consequences as positive-only selection.',
    authority: 'FDA Guidance: Enrichment Strategies (2019); FDA Guidance: In Vitro Companion Diagnostic Devices (2014)',
  },
  {
    value: 'stratified',
    label: 'All-comers, stratified by marker status, with a prespecified marker-positive analysis',
    commits:
      'Every patient tested; the testing order and alpha split between the overall and marker-positive populations are fixed in the protocol and SAP. Whether an assay used only to stratify needs a study-risk determination is confirmed with FDA, not assumed.',
    authority: 'FDA Guidance: Enrichment Strategies (2019); ICH E9 (1998) §2.2.5, §5.6, §5.7',
  },
  {
    value: 'tissue_agnostic',
    label: 'Selected by a molecular alteration across tumour types (tissue-agnostic)',
    commits:
      'An assay that detects the alteration in each histology enrolled, and evidence of effect across tumour types, including the rare ones.',
    authority: 'FDA Draft Guidance: Tissue Agnostic Drug Development in Oncology (2022); FDA Guidance: Developing Targeted Therapies in Low-Frequency Molecular Subsets of a Disease (2018)',
  },
  {
    value: 'escalation_unselected_expansion_selected',
    label: 'Dose escalation unselected; expansion cohorts biomarker-selected',
    commits:
      "The selecting assay, and its study-risk determination, in place before the first selected expansion cohort opens; each cohort's selection criterion and objective prespecified.",
    authority: 'FDA Guidance: Expansion Cohorts: Use in First-in-Human Clinical Trials to Expedite Development of Oncology Drugs and Biologics (2022); FDA Guidance: Investigational In Vitro Diagnostics in Oncology Trials: Streamlined Submission Process for Study Risk Determination (2019)',
  },
  {
    value: 'imaging_agent_selection',
    label: 'Selected by an imaging agent (a theranostic pair)',
    commits:
      'The selecting imaging agent is a drug: approved, or used under an IND, with its uptake threshold prespecified. The 2014 companion-diagnostic guidance addresses in vitro tests and does not set out this route.',
    authority: '21 CFR Part 312. No FDA guidance on theranostic patient selection is cited (unverified).',
  },
  {
    value: 'all_comers_exploratory',
    label: 'Unselected; biomarkers collected for exploratory analysis only',
    commits:
      'Specimen collection and future-use consent. A retrospective marker finding is hypothesis-generating and needs confirmation before it supports a marker-restricted claim.',
    authority: 'ICH E9 (1998) §5.7; FDA Guidance: Enrichment Strategies (2019)',
  },
  {
    value: 'all_comers',
    label: 'Unselected: no predictive biomarker is known for this mechanism (rationale documented)',
    commits:
      'A label for the unselected population, with the rationale stated in the protocol. FDA may still ask whether the effect differs by marker status.',
    authority: 'FDA Guidance: Enrichment Strategies (2019): enrichment is a design option, not a requirement',
  },
  {
    value: 'not_defined',
    label: 'Not yet decided',
    commits:
      'AnA raises the finding: which assay selects patients, its device-study status and whether a companion diagnostic is needed are still open.',
    authority: 'FDA Guidance: In Vitro Companion Diagnostic Devices (2014); 21 CFR 812',
  },
];
