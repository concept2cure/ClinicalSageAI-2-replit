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
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned data and regulatory citations verbatim — do NOT reinterpret ' +
  'citations, invent additional guidance, or substitute your own recommendations. ' +
  'If a parameter is missing or invalid, relay the validation error and ask the user for the correct value.';

const TRIAL_PHASE_ENUM = ['phase1', 'phase2', 'phase3', 'phase4', 'device', 'other'];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Design Monitoring Plan
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_MONITORING_PLAN: AnaTool = {
  name: 'design_monitoring_plan',
  description:
    'Design a risk-based monitoring (RBM) plan per ICH E6(R3) and ICH E8(R1) ' +
    'quality-by-design principles. Scores overall trial risk from design factors ' +
    '(phase, first-in-human, multi-regional, blinding, vulnerable population, ' +
    'protocol complexity, endpoint objectivity, site experience) and returns the ' +
    'critical-to-quality factors, a recommended monitoring mix (centralized vs ' +
    'on-site vs remote with source-data-verification/review strategy and sampling ' +
    'approach), key risk indicators, and on-site visit frequency guidance. Cites ' +
    'ICH E6(R3), ICH E8(R1), and the FDA Risk-Based Monitoring guidance (2013). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      phase: { type: 'string', enum: TRIAL_PHASE_ENUM, description: 'Trial phase.' },
      therapeuticArea: { type: 'string', description: 'Therapeutic area (context for risk weighting).' },
      numberOfSites: { type: 'number', description: 'Number of investigational sites.' },
      plannedEnrollment: { type: 'number', description: 'Planned total enrollment.' },
      isFirstInHuman: { type: 'boolean', description: 'Whether this is a first-in-human study.' },
      isMultiRegional: { type: 'boolean', description: 'Whether the trial is multi-regional (MRCT).' },
      usesInvestigationalDevice: { type: 'boolean', description: 'Whether an investigational device is used.' },
      blinded: { type: 'boolean', description: 'Whether the trial is blinded.' },
      vulnerablePopulation: { type: 'boolean', description: 'Whether vulnerable populations are enrolled.' },
      complexProtocol: { type: 'boolean', description: 'Whether the protocol is operationally complex.' },
      noveltyOfIntervention: { type: 'string', enum: ['established', 'novel', 'first_in_class'], description: 'Novelty of the intervention.' },
      endpointObjectivity: { type: 'string', enum: ['objective', 'subjective', 'mixed'], description: 'Objectivity of the primary endpoint.' },
      electronicDataCapture: { type: 'boolean', description: 'Whether EDC is used (enables centralized monitoring).' },
      experiencedSites: { type: 'boolean', description: 'Whether sites are experienced with this type of trial.' },
      priorInspectionFindings: { type: 'boolean', description: 'Whether there are prior inspection findings to account for.' },
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
    'inspection. Cites 21 CFR 312, the FDA BIMO Compliance Program, and ICH E6(R3). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      inspectionTarget: { type: 'string', enum: ['sponsor', 'cro', 'clinical_investigator', 'irb'], description: 'Who is being inspected.' },
      essentialDocsCompletePercent: { type: 'number', description: 'Percent of essential documents complete (0–100).' },
      tmfContemporaneous: { type: 'boolean', description: 'Whether the TMF is contemporaneous (filed in real time).' },
      consentDocumentationComplete: { type: 'boolean', description: 'Whether informed-consent documentation is complete.' },
      delegationLogCurrent: { type: 'boolean', description: 'Whether the delegation-of-authority log is current.' },
      trainingRecordsComplete: { type: 'boolean', description: 'Whether training records are complete.' },
      ipAccountabilityReconciled: { type: 'boolean', description: 'Whether investigational-product accountability is reconciled.' },
      safetyReportingCurrent: { type: 'boolean', description: 'Whether safety reporting is current.' },
      protocolDeviationsLogged: { type: 'boolean', description: 'Whether protocol deviations are logged.' },
      capaProcessInPlace: { type: 'boolean', description: 'Whether a CAPA process is in place.' },
      openCapas: { type: 'number', description: 'Number of open CAPAs.' },
      dataTraceabilityVerified: { type: 'boolean', description: 'Whether source-to-database data traceability has been verified.' },
      computerizedSystemsValidated: { type: 'boolean', description: 'Whether computerized systems are validated.' },
      monitoringReportsCurrent: { type: 'boolean', description: 'Whether monitoring reports are current.' },
      priorInspectionFindings: { type: 'boolean', description: 'Whether there are prior inspection findings.' },
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
    'Evaluate a trial against the ICH E6(R3) Good Clinical Practice principles and ' +
    'return a principle-by-principle conformance assessment with prioritized gaps. ' +
    'Covers ethics/consent, sponsor and vendor oversight, delegation, personnel ' +
    'qualification, protocol adherence with change control, IP management, safety ' +
    'reporting, ALCOA+ data governance, computerized-system validation, audit-trail ' +
    'review, risk-based quality management, and record retention — classifying each ' +
    'as conforms / partial / gap / unverified and grouping deficiencies by domain ' +
    'and severity. Cites ICH E6(R3) and ICH E8(R1). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      ethicsApprovalCurrent: { type: 'boolean', description: 'Whether IRB/IEC approval is current.' },
      informedConsentProcessCompliant: { type: 'boolean', description: 'Whether the informed-consent process is compliant.' },
      sponsorOversightDocumented: { type: 'boolean', description: 'Whether sponsor oversight is documented.' },
      vendorOversightDocumented: { type: 'boolean', description: 'Whether vendor/CRO oversight is documented.' },
      delegationDocumented: { type: 'boolean', description: 'Whether delegation of duties is documented.' },
      personnelQualified: { type: 'boolean', description: 'Whether personnel are qualified/trained.' },
      protocolFollowedWithChangeControl: { type: 'boolean', description: 'Whether the protocol is followed with proper change control.' },
      ipManagementCompliant: { type: 'boolean', description: 'Whether investigational-product management is compliant.' },
      safetyReportingCompliant: { type: 'boolean', description: 'Whether safety reporting is compliant.' },
      dataGovernanceAlcoaPlus: { type: 'boolean', description: 'Whether data governance meets ALCOA+ principles.' },
      computerizedSystemsValidated: { type: 'boolean', description: 'Whether computerized systems are validated.' },
      auditTrailReviewPerformed: { type: 'boolean', description: 'Whether audit-trail review is performed.' },
      riskBasedQualityManagement: { type: 'boolean', description: 'Whether risk-based quality management is implemented.' },
      recordRetentionCompliant: { type: 'boolean', description: 'Whether record retention is compliant.' },
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
    'the eight basic required elements, the additional elements, and which ' +
    'additional elements apply given the study features (randomization, placebo, ' +
    'greater-than-minimal risk, biospecimen collection, future research use, ' +
    'genomic data, commercial profit potential). Adds readability guidance, ' +
    'population-specific safeguards for vulnerable groups (children, pregnant, ' +
    'cognitively impaired, prisoners, non-English speakers, emergency), re-consent ' +
    'triggers, electronic/remote consent considerations, and documentation ' +
    'requirements. Cites 21 CFR 50.25, 21 CFR 50 Subpart B, and ICH E6(R3). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      studyType: { type: 'string', enum: ['interventional', 'observational', 'device', 'gene_therapy'], description: 'Type of study.' },
      involvesRandomization: { type: 'boolean', description: 'Whether the study involves randomization.' },
      involvesPlacebo: { type: 'boolean', description: 'Whether a placebo is used.' },
      moreThanMinimalRisk: { type: 'boolean', description: 'Whether the study poses more than minimal risk.' },
      collectsBiospecimens: { type: 'boolean', description: 'Whether biospecimens are collected.' },
      futureResearchUse: { type: 'boolean', description: 'Whether specimens/data may be used for future research.' },
      genomicData: { type: 'boolean', description: 'Whether genomic data are collected.' },
      vulnerablePopulations: {
        type: 'array',
        items: { type: 'string', enum: ['children', 'pregnant', 'cognitively_impaired', 'prisoners', 'non_english', 'emergency'] },
        description: 'Vulnerable populations enrolled — drives additional safeguards.',
      },
      electronicConsent: { type: 'boolean', description: 'Whether electronic consent (eConsent) is used.' },
      remoteConsent: { type: 'boolean', description: 'Whether consent is obtained remotely.' },
      commercialProfitPotential: { type: 'boolean', description: 'Whether there is commercial profit potential from specimens/data (triggers disclosure).' },
      targetReadingGradeLevel: { type: 'number', description: 'Target reading grade level for the consent form (e.g., 6–8).' },
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
    'number of participants affected, unreported SAE, increased risk) and returns ' +
    'whether the deviation must be reported to the IRB/IEC, sponsor, and/or FDA, ' +
    'whether prompt reporting is required, and the recommended CAPA. Cites 21 CFR ' +
    '312.53/312.66, 21 CFR 56.108, and ICH E6(R3). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['eligibility', 'consent', 'safety_reporting', 'study_procedure', 'visit_window', 'investigational_product', 'randomization', 'gcp_general', 'other'],
        description: 'Category of the deviation.',
      },
      affectsParticipantSafety: { type: 'boolean', description: 'Whether the deviation affects participant safety.' },
      affectsPrimaryEndpoint: { type: 'boolean', description: 'Whether the deviation affects the primary endpoint / data integrity.' },
      affectsEligibilityCriticalCriterion: { type: 'boolean', description: 'Whether a critical eligibility criterion was violated.' },
      affectsConsentValidity: { type: 'boolean', description: 'Whether informed-consent validity is affected.' },
      isRecurring: { type: 'boolean', description: 'Whether the deviation is recurring/systemic.' },
      numberOfParticipantsAffected: { type: 'number', description: 'Number of participants affected.' },
      involvedUnreportedSAE: { type: 'boolean', description: 'Whether an unreported serious adverse event was involved.' },
      deviationFromIRBApprovedProtocol: { type: 'boolean', description: 'Whether this is a deviation from the IRB-approved protocol.' },
      increasedRiskToSubjects: { type: 'boolean', description: 'Whether the deviation increased risk to subjects.' },
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
    'the sponsor TMF and accounting for electronic TMF and device trials. Cites ' +
    'ICH E6(R3) Section on essential documents and 21 CFR 312.57/312.62. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      stage: { type: 'string', enum: ['before', 'during', 'after', 'all'], description: 'Trial stage to scope the document set (default all).' },
      includeInvestigatorSiteFile: { type: 'boolean', description: 'Whether to include the investigator site file (ISF).' },
      includeSponsorTmf: { type: 'boolean', description: 'Whether to include the sponsor TMF.' },
      electronicTmf: { type: 'boolean', description: 'Whether an electronic TMF (eTMF) is used.' },
      usesInvestigationalDevice: { type: 'boolean', description: 'Whether an investigational device is used (adds device-specific documents).' },
      multiSite: { type: 'boolean', description: 'Whether the trial is multi-site.' },
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
