/**
 * GCP & Clinical Trial Operations tools — exposes the deterministic GCP
 * operations knowledge base to AnA as first-class, selectable tools.
 *
 * Each tool wraps a pure function grounded in ICH E6(R3) Good Clinical Practice,
 * ICH E8(R1) (quality by design), the FDA Risk-Based Monitoring guidance (2013)
 * and ICH E6(R3) Annex, 21 CFR Parts 50/54/56/312, and the FDA BIMO inspection
 * program. NO LLM estimation, NO network calls — results are deterministic and
 * inspection-defensible.
 *
 * Tools:
 *   design_monitoring_plan      — risk-based monitoring plan (ICH E6(R3)/E8(R1))
 *   assess_inspection_readiness — BIMO/sponsor inspection readiness + 483 risks
 *   assess_gcp_compliance       — ICH E6(R3) principle-by-principle gap analysis
 *   design_informed_consent     — 21 CFR 50.25 consent element design
 *   classify_protocol_deviation — important/non-important + reportability
 *   plan_essential_documents    — ICH E6 essential documents / TMF structure
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the matching gcp-operations-knowledge module.
 *
 * @module server/services/ana/gcpOperationsTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic: no LLM, no network. ' +
  'Report the returned data and regulatory citations verbatim — do NOT reinterpret ' +
  'citations, invent additional guidance, or substitute your own recommendations. ' +
  'If a parameter is missing or invalid, relay the validation error and ask the user for the correct value.';

const TRIAL_PHASE_ENUM = ['phase1', 'phase2', 'phase3', 'phase4', 'device', 'other'];

/** What an omitted (or null) boolean means, per tool; a malformed one is refused by name. */
const UNSCORED = ' Omitted or null stays not_stated; a risk factor it decides is not scored (see notAssessed).';
const AREA_UNASSESSED = ' Omitted or null stays not_stated: its area is not assessed.';
const NOT_PROVIDED = ' Omitted or null stays not_stated and is reported as not provided.';
const UNVERIFIED = ' Omitted or null stays not_stated: the principle is unverified.';
const NO_GAP = ' Omitted or null stays not_stated: no gap or strength is reported for it.';
const NOT_FALSE = ' Omitted or null stays not_stated and is not read as false (see notAssessed).';
const NOT_READ = ' Not read: it does not change the result.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Design Monitoring Plan
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_MONITORING_PLAN: AnaTool = {
  name: 'design_monitoring_plan',
  description:
    'Design a risk-based monitoring (RBM) plan per ICH E6(R3) and ICH E8(R1) ' +
    'quality-by-design principles. Scores overall trial risk from design factors ' +
    '(phase, first-in-human, multi-regional, vulnerable population, ' +
    'protocol complexity, endpoint objectivity, site experience) and returns the ' +
    'critical-to-quality factors, a recommended monitoring mix (centralized vs ' +
    'on-site vs remote with source-data-verification/review strategy and sampling ' +
    'approach), key risk indicators, and on-site visit frequency guidance. A factor ' +
    'left out is not scored as absent (see notAssessed). Cites ' +
    'ICH E6(R3), ICH E8(R1), and the FDA Risk-Based Monitoring guidance (2013). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      phase: { type: 'string', enum: TRIAL_PHASE_ENUM, description: 'Trial phase. Omitted or null stays not_stated (see notAssessed).' },
      therapeuticArea: { type: 'string', description: 'Therapeutic area.' + NOT_READ },
      numberOfSites: { type: 'number', description: 'Number of investigational sites, a whole number of at least 1. Omitted or null stays not_stated (see notAssessed).' },
      plannedEnrollment: { type: 'number', description: 'Planned total enrollment, a whole number of at least 1. Read only for the enrollment-per-site warning.' },
      isFirstInHuman: { type: 'boolean', description: 'Whether this is a first-in-human study.' + UNSCORED },
      isMultiRegional: { type: 'boolean', description: 'Whether the trial is multi-regional (MRCT).' + UNSCORED },
      usesInvestigationalDevice: { type: 'boolean', description: 'Whether an investigational device is used.' + UNSCORED },
      blinded: { type: 'boolean', description: 'Whether the trial is blinded (adds blinding maintenance as a critical-to-quality factor). Omitted or null stays not_stated, and notes name that factor as not assessed.' },
      vulnerablePopulation: { type: 'boolean', description: 'Whether vulnerable populations are enrolled.' + UNSCORED },
      complexProtocol: { type: 'boolean', description: 'Whether the protocol is operationally complex.' + UNSCORED },
      noveltyOfIntervention: { type: 'string', enum: ['established', 'novel', 'first_in_class'], description: 'Novelty of the intervention. Omitted or null stays not_stated (see notAssessed).' },
      endpointObjectivity: { type: 'string', enum: ['objective', 'subjective', 'mixed'], description: 'Objectivity of the primary endpoint. Omitted or null stays not_stated (see notAssessed).' },
      electronicDataCapture: { type: 'boolean', description: 'Whether EDC is used (enables centralized monitoring).' + UNSCORED },
      experiencedSites: { type: 'boolean', description: 'Whether sites are experienced with this type of trial.' + UNSCORED },
      priorInspectionFindings: { type: 'boolean', description: 'Whether there are prior inspection findings to account for.' + UNSCORED },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Assess Inspection Readiness
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_INSPECTION_READINESS: AnaTool = {
  name: 'assess_inspection_readiness',
  description:
    'Assess readiness for an FDA BIMO (or sponsor/CRO/investigator/IRB) inspection ' +
    'and return a prioritized gap list. Scores readiness across essential-document ' +
    'completeness, TMF contemporaneousness, consent documentation, delegation and ' +
    'training records, IP accountability, safety reporting, deviation logging, ' +
    'CAPA posture, data traceability, and computerized-system validation; surfaces ' +
    'the common Form FDA-483 observations for the inspection target with their ' +
    'regulatory citations, and the data-traceability checks to run before the ' +
    'inspection. An input left out is reported as not assessed, not scored. Cites ' +
    '21 CFR 312, the FDA BIMO Compliance Program, and ICH E6(R3). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      inspectionTarget: { type: 'string', enum: ['sponsor', 'cro', 'clinical_investigator', 'irb'], description: 'Who is being inspected. Omitted or null stays not_stated, and the common Form FDA-483 observations listed are the sponsor ones (see warnings).' },
      essentialDocsCompletePercent: { type: 'number', description: 'Percent of essential documents complete (0–100). Omitted or null: the TMF area is not assessed unless tmfContemporaneous is false.' },
      tmfContemporaneous: { type: 'boolean', description: 'Whether the TMF is contemporaneous (filed in real time).' + AREA_UNASSESSED },
      consentDocumentationComplete: { type: 'boolean', description: 'Whether informed-consent documentation is complete.' + AREA_UNASSESSED },
      delegationLogCurrent: { type: 'boolean', description: 'Whether the delegation-of-authority log is current.' + AREA_UNASSESSED },
      trainingRecordsComplete: { type: 'boolean', description: 'Whether training records are complete.' + AREA_UNASSESSED },
      ipAccountabilityReconciled: { type: 'boolean', description: 'Whether investigational-product accountability is reconciled.' + AREA_UNASSESSED },
      safetyReportingCurrent: { type: 'boolean', description: 'Whether safety reporting is current.' + AREA_UNASSESSED },
      protocolDeviationsLogged: { type: 'boolean', description: 'Whether protocol deviations are logged.' + AREA_UNASSESSED },
      capaProcessInPlace: { type: 'boolean', description: 'Whether a CAPA process is in place.' + NOT_PROVIDED },
      openCapas: { type: 'number', description: 'Number of open CAPAs, a whole number of 0 or more. Omitted or null is reported as not provided.' },
      dataTraceabilityVerified: { type: 'boolean', description: 'Whether source-to-database data traceability has been verified.' + AREA_UNASSESSED },
      computerizedSystemsValidated: { type: 'boolean', description: 'Whether computerized systems are validated.' + AREA_UNASSESSED },
      monitoringReportsCurrent: { type: 'boolean', description: 'Whether monitoring reports are current.' + AREA_UNASSESSED },
      priorInspectionFindings: { type: 'boolean', description: 'Whether there are prior inspection findings.' + NOT_PROVIDED },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Assess GCP Compliance
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_GCP_COMPLIANCE: AnaTool = {
  name: 'assess_gcp_compliance',
  description:
    "Assess a trial's conformance to each ICH E6(R3) Good Clinical Practice principle, " +
    "with each gap's domain and severity. " +
    'Covers ethics/consent, independent ethics review, sponsor and vendor oversight, ' +
    'delegation, personnel qualification, protocol adherence with change control, IP ' +
    'management, safety reporting, ALCOA+ data governance, computerized-system ' +
    'validation, audit-trail review, risk-based quality management, proportionate ' +
    'processes, and record retention. Each principle conforms, is a gap or is ' +
    'unverified; an omitted fact raises no gap or strength, the score is null while a ' +
    'principle is unverified, and the status not_assessed unless no answer could ' +
    'change it. Cites ICH E6(R3) and ICH E8(R1). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      ethicsApprovalCurrent: { type: 'boolean', description: 'Whether IRB/IEC approval is current.' + UNVERIFIED },
      independentEthicsReviewDocumented: { type: 'boolean', description: 'Whether the IRB/IEC is documented as adequately constituted and independent of the investigator and sponsor (21 CFR 56.107; ICH E6(R3) Principle 3).' + UNVERIFIED },
      informedConsentProcessCompliant: { type: 'boolean', description: 'Whether the informed-consent process is compliant.' + UNVERIFIED },
      sponsorOversightDocumented: { type: 'boolean', description: 'Whether sponsor oversight is documented.' + UNVERIFIED },
      vendorOversightDocumented: { type: 'boolean', description: 'Whether vendor/CRO oversight is documented.' + NO_GAP },
      delegationDocumented: { type: 'boolean', description: 'Whether delegation of duties is documented.' + NO_GAP },
      personnelQualified: { type: 'boolean', description: 'Whether personnel are qualified/trained.' + UNVERIFIED },
      protocolFollowedWithChangeControl: { type: 'boolean', description: 'Whether the protocol is followed with proper change control (false is a major gap).' + NO_GAP },
      ipManagementCompliant: { type: 'boolean', description: 'Whether investigational-product management is compliant.' + UNVERIFIED },
      safetyReportingCompliant: { type: 'boolean', description: 'Whether safety reporting is compliant.' + NO_GAP },
      dataGovernanceAlcoaPlus: { type: 'boolean', description: 'Whether data governance meets ALCOA+ principles.' + UNVERIFIED },
      computerizedSystemsValidated: { type: 'boolean', description: 'Whether computerized systems are validated.' + NO_GAP },
      auditTrailReviewPerformed: { type: 'boolean', description: 'Whether audit-trail review is performed.' + NO_GAP },
      riskBasedQualityManagement: { type: 'boolean', description: 'Whether risk-based quality management is implemented.' + UNVERIFIED },
      proportionateProcessesDocumented: { type: 'boolean', description: 'Whether trial processes and effort are documented as proportionate to the risks to participants and to result reliability (ICH E6(R3) Principle 7).' + UNVERIFIED },
      recordRetentionCompliant: { type: 'boolean', description: 'Whether record retention is compliant.' + NO_GAP },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Design Informed Consent
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_INFORMED_CONSENT: AnaTool = {
  name: 'design_informed_consent',
  description:
    'Design an informed-consent framework per 21 CFR 50.25 and ICH E6(R3). Returns ' +
    'the eight basic required elements, the additional elements, and which of ' +
    'them apply given the study features (greater-than-minimal risk, biospecimen ' +
    'collection, genomic data, commercial profit potential); an omitted feature ' +
    'leaves the elements it decides not assessed (see warnings). Adds readability guidance, ' +
    'population-specific safeguards for vulnerable groups (children, pregnant, ' +
    'cognitively impaired, prisoners, non-English speakers, emergency), re-consent ' +
    'triggers, electronic/remote consent considerations, and documentation ' +
    'requirements. Cites 21 CFR 50.25, 21 CFR 50 Subpart B, and ICH E6(R3). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      studyType: { type: 'string', enum: ['interventional', 'observational', 'device', 'gene_therapy'], description: 'Type of study. Read for two warnings: observational drops the applicable-clinical-trial one, and gene_therapy adds a long-term follow-up reminder unless genomicData is true. Omitted or null is read as neither.' },
      applicableClinicalTrial: { type: 'boolean', description: 'Whether the trial is an applicable clinical trial (42 U.S.C. 282(j)). Decides the 21 CFR 50.25(c) ClinicalTrials.gov statement. Omitted or null stays not_stated; unless the study is observational, the result says so.' },
      involvesRandomization: { type: 'boolean', description: 'Whether the study involves randomization.' + NOT_READ },
      involvesPlacebo: { type: 'boolean', description: 'Whether a placebo is used (adds a placebo-disclosure warning). Omitted or null stays not_stated, and the warnings say placebo use was not stated.' },
      moreThanMinimalRisk: { type: 'boolean', description: 'Whether the study poses more than minimal risk (decides the unforeseeable-risks element). Omitted or null stays not_stated: that element is not assessed (see warnings).' },
      collectsBiospecimens: { type: 'boolean', description: 'Whether biospecimens are collected (decides the commercial-profit, return-of-results and genome-sequencing elements). Omitted or null stays not_stated: each is not assessed unless another stated fact decides it (see warnings).' },
      futureResearchUse: { type: 'boolean', description: 'Whether specimens/data may be used for future research.' + NOT_READ },
      genomicData: { type: 'boolean', description: 'Whether genomic data are collected (decides the genome-sequencing element). Omitted or null stays not_stated: unless collectsBiospecimens is true, that element is not assessed (see warnings).' },
      vulnerablePopulations: {
        type: 'array',
        items: { type: 'string', enum: ['children', 'pregnant', 'cognitively_impaired', 'prisoners', 'non_english', 'emergency'] },
        description: 'Vulnerable populations enrolled — drives additional safeguards. An empty list means none; omitted or null lists no safeguard and says so (see warnings).',
      },
      electronicConsent: { type: 'boolean', description: 'Whether electronic consent (eConsent) is used. Omitted or null stays not_stated: unless remoteConsent is true, the consent method is not assessed.' },
      remoteConsent: { type: 'boolean', description: 'Whether consent is obtained remotely. Omitted or null stays not_stated: unless electronicConsent is true, the consent method is not assessed.' },
      commercialProfitPotential: { type: 'boolean', description: 'Whether there is commercial profit potential from specimens/data (decides the commercial-profit element when biospecimens are collected). Omitted or null stays not_stated (see warnings).' },
      targetReadingGradeLevel: { type: 'number', description: 'Target reading grade level for the consent form, from 4 to 12 (e.g., 6–8). Omitted or null: grade 8 is used, and the guidance says no target was stated.' },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Classify Protocol Deviation
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_PROTOCOL_DEVIATION: AnaTool = {
  name: 'classify_protocol_deviation',
  description:
    'Classify a protocol deviation as important or non-important and determine its ' +
    'reportability, severity, and corrective/preventive actions. Assesses ' +
    'participant-safety impact (none/potential/actual) and data-integrity impact ' +
    '(none/minor/significant) from the deviation features (category, effect on ' +
    'safety, primary endpoint, critical eligibility, consent validity, recurrence, ' +
    'participants affected, unreported SAE, increased risk) and returns ' +
    'whether it is reportable to the IRB/IEC, sponsor, and/or FDA, ' +
    'whether prompt reporting is required, and recommended CAPA. A fact left out ' +
    'is not read as false (see notAssessed). Cites 21 CFR ' +
    '312.60/312.66 and 56.108, and ICH E6(R3). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['eligibility', 'consent', 'safety_reporting', 'study_procedure', 'visit_window', 'investigational_product', 'randomization', 'gcp_general', 'other'],
        description: 'Category of the deviation. Omitted or null stays not_stated (see notAssessed).',
      },
      affectsParticipantSafety: { type: 'boolean', description: 'Whether the deviation affects participant safety.' + NOT_FALSE },
      affectsPrimaryEndpoint: { type: 'boolean', description: 'Whether the deviation affects the primary endpoint / data integrity.' + NOT_FALSE },
      affectsEligibilityCriticalCriterion: { type: 'boolean', description: 'Whether a critical eligibility criterion was violated.' + NOT_FALSE },
      affectsConsentValidity: { type: 'boolean', description: 'Whether informed-consent validity is affected.' + NOT_FALSE },
      isRecurring: { type: 'boolean', description: 'Whether the deviation is recurring/systemic.' + NOT_FALSE },
      numberOfParticipantsAffected: { type: 'number', description: 'Number of participants affected, a whole number of at least 1. Read only for the systemic-cause note on a minor deviation.' },
      involvedUnreportedSAE: { type: 'boolean', description: 'Whether an unreported serious adverse event was involved.' + NOT_FALSE },
      deviationFromIRBApprovedProtocol: { type: 'boolean', description: 'Whether this is a deviation from the IRB-approved protocol.' + NOT_FALSE },
      increasedRiskToSubjects: { type: 'boolean', description: 'Whether the deviation increased risk to subjects.' + NOT_FALSE },
      description: { type: 'string', description: 'Free-text description of the deviation (context only).' },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Plan Essential Documents
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_ESSENTIAL_DOCUMENTS: AnaTool = {
  name: 'plan_essential_documents',
  description:
    'Generate the essential-documents / Trial Master File (TMF) plan per ICH E6 ' +
    '(the before-, during-, and after-trial document sets). Returns the essential ' +
    'documents grouped by trial stage, a TMF zone structure (aligned to the DIA ' +
    'TMF Reference Model concepts), a completeness/QC plan with citations, and ' +
    'record-retention guidance — distinguishing the investigator site file from ' +
    'the sponsor TMF and accounting for electronic TMF and device trials. An ' +
    'unstated device status is not read as no device (see notes). Cites ' +
    'ICH E6(R3) Section on essential documents and 21 CFR 312.57/312.62. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      stage: { type: 'string', enum: ['before', 'during', 'after', 'all'], description: 'Trial stage to scope the document set. Omitted or null: all stages.' },
      includeInvestigatorSiteFile: { type: 'boolean', description: 'Whether to include the investigator site file (ISF). Omitted or null stays not_stated, and the ISF documents are included.' },
      includeSponsorTmf: { type: 'boolean', description: 'Whether to include the sponsor TMF. Omitted or null stays not_stated, and the sponsor TMF documents are included.' },
      electronicTmf: { type: 'boolean', description: 'Whether an electronic TMF (eTMF) is used (adds an eTMF QC check). Omitted or null stays not_stated and adds no such check.' },
      usesInvestigationalDevice: { type: 'boolean', description: 'Whether an investigational device is used (adds device-specific documents). Omitted or null stays not_stated: outside the during stage, notes name the device records, which are not added.' },
      multiSite: { type: 'boolean', description: 'Whether the trial is multi-site (adds a per-site ISF note). Omitted or null stays not_stated and adds no such note.' },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Array
// ─────────────────────────────────────────────────────────────────────────────

/** GCP & clinical trial operations tools, spread into ALL_ANA_TOOLS. */
export const GCP_OPERATIONS_TOOLS: AnaTool[] = [
  DESIGN_MONITORING_PLAN,
  ASSESS_INSPECTION_READINESS,
  ASSESS_GCP_COMPLIANCE,
  DESIGN_INFORMED_CONSENT,
  CLASSIFY_PROTOCOL_DEVIATION,
  PLAN_ESSENTIAL_DOCUMENTS,
];
