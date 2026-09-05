/**
 * AnA Tool Definitions — Agentic Document Generation
 *
 * Tools that AnA can invoke during document generation workflows:
 * - Evidence search (clinical trials, literature)
 * - FDA guidance lookup
 * - Cross-reference validation
 * - Regulatory citation generation
 * - Compliance checking
 */

import type { AnaTool, AnthropicServerTool, AnyAnaTool } from '../ai-gateway/types';
// Agentic-workflow tool definitions extracted to their own module (first tranche
// of decomposing this file). Imported so the enabled-tools array can reference
// them exactly as before.
import {
  CONVENE_DRAFTING_COUNCIL,
  GET_CLIENT_JOURNEY,
  START_DEEP_INVESTIGATION,
  CHECK_DEEP_INVESTIGATION,
} from './agentic-workflow-tools.js';
// Biotech program orchestrator — the biologics/advanced-therapy development
// spine (discovery → IND → Phase 1/2/3 → BLA → post-approval). Handler is
// registered from biotech-program.ts via the inject-and-sibling pattern.
import { GET_BIOTECH_PROGRAM_STATUS } from './biotech-program.js';
// Canonical document revision spine — the ONE atomic flow (version → AI action →
// audit → review → placement → provenance → readiness) over concept2cure_artifacts.
// Handler registered from document-spine.ts via the inject-and-sibling pattern.
import { COMMIT_DOCUMENT_REVISION } from './document-spine.js';
// Project-folder discovery + whole-document read + comprehension record +
// semantic catalog search. Handlers registered from document-catalog-tools.ts
// (inject-and-sibling).
import {
  LIST_PROJECT_DOCUMENTS,
  READ_PROJECT_DOCUMENT,
  CATALOG_PROJECT_DOCUMENT,
  SEARCH_PROJECT_DOCUMENTS,
} from './document-catalog-tool-defs.js';
// BLA biologics + CTD nonclinical/clinical tool definitions extracted to their
// own module (decomposition tranche 2). Imported so the enabled-tools array can
// reference them exactly as before.
import {
  ASSESS_ANALYTICAL_SIMILARITY,
  ASSESS_COMPARABILITY,
  ASSESS_IMMUNOGENICITY,
  ASSESS_BLA_FILING_RISK,
  GENERATE_SOP,
  RESOLVE_SUBMISSION_PLAN,
  GET_CTD_MODULE_HOME,
  COMPUTE_FIH_DOSE,
  CLASSIFY_TOX_FINDINGS,
  SELECT_EXPOSURE_RESPONSE_DOSE,
  DRAFT_NONCLINICAL_OVERVIEW_M2_4,
  ASSESS_CONCENTRATION_QTC,
  ASSESS_DDI_RISK,
  DRAFT_CLINICAL_SUMMARY_M2_7,
  ASSESS_NONCLINICAL_PROGRAM,
  CHARACTERIZE_PK,
  DRAFT_NONCLINICAL_SUMMARIES_M2_6,
  LOAD_NONCLINICAL_PROGRAM,
  GET_NONCLINICAL_TEMPLATE,
  GET_CSR_TEMPLATE,
  ASSESS_NONCLINICAL_SAFETY,
  DRAFT_QUALITY_OVERALL_SUMMARY_M2_3,
  LIST_PLATFORM_COMMANDS,
  EXECUTE_PLATFORM_COMMAND,
} from './bla-biologics-tool-defs.js';
// Document view + operations tool definitions extracted to their own module
// (decomposition tranche 3). Imported so the enabled-tools array can reference
// them exactly as before.
import {
  LIST_VAULT_DOCUMENTS,
  READ_VAULT_DOCUMENT,
  GET_DOCUMENT_VERSIONS,
  LIST_GOVERNED_DOCUMENTS,
  READ_GOVERNED_DOCUMENT,
  GET_TMF_VIEW,
  SAVE_DOCUMENT_TO_VAULT,
  UPDATE_VAULT_DOCUMENT,
  COMPARE_VAULT_VERSIONS,
  SEED_TMF,
  UPDATE_TMF_ARTIFACT_STATUS,
  SEARCH_ALL_DOCUMENTS,
  GET_PLAN_USAGE,
  GET_BILLING_CREDITS,
  GET_ORG_CAPABILITIES,
} from './document-surface-tool-defs.js';
// Notification + clinical-study + working-memory tool definitions extracted to
// their own module (decomposition tranche 4). Imported so the enabled-tools
// array can reference them exactly as before.
import {
  FIRE_NOTIFICATION,
  CREATE_CLINICAL_STUDY,
  CREATE_CLINICAL_INVESTIGATOR,
  CREATE_FINANCIAL_DISCLOSURE,
  ADD_DISCLOSURE_INTEREST,
  REVIEW_FINANCIAL_DISCLOSURE,
  CREATE_HA_INTERACTION,
  CREATE_REGULATORY_COMMITMENT,
  REVIEW_COMMITMENT_PORTFOLIO,
  CREATE_IACUC_PROTOCOL,
  REGISTER_ANIMAL_COHORT,
  REVIEW_IACUC_PROTOCOL,
  CREATE_IRB_SUBMISSION,
  ADD_IRB_SITE,
  REVIEW_IRB_SUBMISSION,
  CREATE_IBC_REGISTRATION,
  ADD_BIOLOGICAL_AGENT,
  REVIEW_IBC_REGISTRATION,
  CREATE_NONCLINICAL_STUDY,
  REVIEW_SEND_READINESS,
  CREATE_PROTOCOL_DOCUMENT,
  UPDATE_PROTOCOL_SECTION,
  ADD_PROTOCOL_OBJECTIVE,
  ADD_ELIGIBILITY_CRITERION,
  REVIEW_PROTOCOL_COMPLETENESS,
  FINALIZE_PROTOCOL_DOCUMENT,
  ADD_PROTOCOL_RISK,
  REVIEW_PROTOCOL_RISK_REGISTER,
  CREATE_PROTOCOL_AMENDMENT,
  ADD_AMENDMENT_CHANGE,
  REVIEW_AMENDMENT,
  REPORT_PROTOCOL_DEVIATION,
  ADD_CAPA_ACTION,
  REVIEW_DEVIATION,
  ASSIGN_PROTOCOL_REVIEWER,
  ADD_PROTOCOL_REVIEW_COMMENT,
  REVIEW_PROTOCOL_REVIEW_STATUS,
  CREATE_CONSENT_FORM,
  UPDATE_CONSENT_ELEMENT,
  REVIEW_CONSENT_COMPLETENESS,
  CREATE_DMS_PLAN,
  UPDATE_DMS_PLAN_ELEMENT,
  REVIEW_DMS_PLAN_COMPLETENESS,
  FINALIZE_DMS_PLAN,
  CREATE_OTHER_SUPPORT,
  ADD_OTHER_SUPPORT_ENTRY,
  REVIEW_OTHER_SUPPORT,
  CERTIFY_OTHER_SUPPORT,
  CREATE_BIOSKETCH,
  UPDATE_BIOSKETCH_SECTION,
  REVIEW_BIOSKETCH_COMPLETENESS,
  FINALIZE_BIOSKETCH,
  CREATE_INVENTION_DISCLOSURE,
  UPDATE_INVENTION_DISCLOSURE,
  REVIEW_INVENTION_DISCLOSURE,
  SUBMIT_INVENTION_DISCLOSURE,
  CREATE_EXPORT_CONTROL_REVIEW,
  UPDATE_EXPORT_CONTROL_REVIEW,
  REVIEW_EXPORT_CONTROL,
  FINALIZE_EXPORT_CONTROL_DETERMINATION,
  CREATE_RESEARCH_AGREEMENT,
  UPDATE_RESEARCH_AGREEMENT,
  REVIEW_RESEARCH_AGREEMENT,
  EXECUTE_RESEARCH_AGREEMENT,
  CREATE_PROTOCOL_TEMPLATE,
  CLONE_PROTOCOL_TEMPLATE,
  SAVE_DOCUMENT_AS_TEMPLATE,
  LIST_PROTOCOL_TEMPLATES,
  ADD_PROTOCOL_MILESTONE,
  SET_PROTOCOL_MILESTONE_STATUS,
  REVIEW_PROTOCOL_TIMELINE,
  EXPORT_PROTOCOL_DOCUMENT,
  GENERATE_CTGOV_REGISTRATION_DRAFT,
  ADD_SOA_ASSESSMENT,
  SET_SOA_CELL,
  REVIEW_SOA_MATRIX,
  ADD_PROTOCOL_BUDGET_ITEM,
  SET_PROTOCOL_BUDGET_PARAMS,
  REVIEW_PROTOCOL_BUDGET,
  IMPORT_CITI_RECORDS,
  REVIEW_TRAINING_MATRIX,
  REVIEW_EXPIRING_TRAINING,
  SET_FUNDING_PROFILE,
  FIND_GRANT_OPPORTUNITIES,
  REVIEW_PROTOCOL_PORTFOLIO_ANALYTICS,
  ASSIGN_COMMITTEE_MEMBER,
  CONVENE_COMMITTEE_MEETING,
  ADD_COMMITTEE_AGENDA_ITEM,
  CAST_COMMITTEE_VOTE,
  FINALIZE_COMMITTEE_DETERMINATION,
  REVIEW_PROTOCOL_PORTFOLIO,
  CREATE_COVERAGE_ANALYSIS,
  SET_COVERAGE_QUALIFYING_DETERMINATION,
  ADD_COVERAGE_ITEM,
  CLASSIFY_COVERAGE_ITEM,
  REVIEW_COVERAGE_ANALYSIS,
  CREATE_GRANT_PROPOSAL,
  RECORD_GRANT_AWARD,
  REVIEW_GRANT_REPORTING,
  SET_GRANT_MILESTONE_STATUS,
  OPEN_GRANT_CLOSEOUT,
  UPDATE_GRANT_CLOSEOUT,
  FINALIZE_GRANT_CLOSEOUT,
  RECORD_SUBAWARD,
  SCREEN_SUBAWARD,
  EXECUTE_SUBAWARD,
  ADD_GRANT_BUDGET_LINE,
  RECORD_GRANT_EXPENDITURE,
  REVIEW_GRANT_BUDGET,
  RECORD_COST_SHARE_CONTRIBUTION,
  REVIEW_COST_SHARE,
  REQUEST_NO_COST_EXTENSION,
  APPROVE_NO_COST_EXTENSION,
  RECORD_GRANT_OPPORTUNITY,
  PREPARE_AWARD_CLOSEOUT,
  RESEARCH_COMPLIANCE_BRIEFING,
  TRIAGE_COMPLIANCE_ATTENTION,
  FULFILL_REGULATORY_COMMITMENT,
  REVIEW_HA_INTERACTION,
  PREPARE_MEETING_PACKAGE,
  REGISTER_CONTROLLED_SUBSTANCE,
  CREATE_RIM_PRODUCT,
  SET_REGISTRATION_STATUS,
  REVIEW_LABEL_CURRENCY,
  CREATE_INSPECTION,
  LOG_INSPECTION_FINDING,
  REVIEW_INSPECTION_READINESS,
  REGISTER_DEA,
  LOG_CS_TRANSACTION,
  REVIEW_CS_BALANCE,
  CREATE_LIFECYCLE_OBLIGATION,
  REVIEW_LIFECYCLE_CALENDAR,
  CREATE_TMF,
  CLASSIFY_TMF_ARTIFACT,
  REVIEW_TMF_COMPLETENESS,
  RUN_COMPLIANCE_CHECKLIST,
  ASSESS_STUDY_ONBOARDING,
  ADD_PERSONNEL_TRAINING,
  REVIEW_TRAINING_GATE,
  CREATE_EFFORT_CERTIFICATION,
  ADD_EFFORT_LINE,
  CREATE_COI_DISCLOSURE,
  SEARCH_GRANTS_GOV,
  SCREEN_RESTRICTED_PARTY,
  LOG_STUDY_DEVIATION,
  LOG_STUDY_AE,
  RECORD_ENDPOINT_RESULT,
  VERIFY_MEMORY_ATOM,
} from './notifications-study-memory-tool-defs.js';
// Evidence & literature tool definitions extracted to their own module
// (decomposition tranche 5). Imported so the enabled-tools array and the
// drafting/review tool arrays can reference them exactly as before.
import {
  SEARCH_CLINICAL_EVIDENCE,
  SEARCH_MEDICARE_COVERAGE,
  SEARCH_CONNECTED_REPOSITORIES,
  ADVISE_STUDY_DESIGN,
  ADVISE_LABELING_STRUCTURE,
  PLAN_LABELING_AUTHORING,
  ADVISE_MEDICAL_INFORMATION,
  ADVISE_REPORTING_GUIDELINE,
  ADVISE_DATA_INTEGRITY,
  ADVISE_RWE_DESIGN,
  NARRATE_STATISTICAL_RESULT,
  VALUE_DOSSIER_GUIDANCE,
  ADVISE_ESTIMAND,
  ADVISE_PHARMACOVIGILANCE,
  ADVISE_CTD_STRUCTURE,
  ADVISE_SPECIAL_DESIGNATION,
  PLAN_ORPHAN_DRUG_DESIGNATION,
  PLAN_IND_MODULE_AUTHORING,
  ADVISE_GCP,
  REVIEW_INFORMED_CONSENT,
  ADVISE_COA_SELECTION,
  ADVISE_RISK_MANAGEMENT,
  RUN_RBM_ASSESSMENT,
  ASSESS_SITE_RISK,
  EVALUATE_KRIS_QTLS,
  GENERATE_RBM_PLAN,
  PRIORITIZE_MONITORING_QUERIES,
  RUN_CENTRAL_MONITORING,
  SCAN_PATIENT_PROFILES,
  GENERATE_RBM_REPORT,
  GET_RBM_ATTENTION,
  ADD_CTQ_FACTOR,
  DEFINE_KRI,
  RECORD_KRI_READING,
  SET_QTL,
  RAISE_MONITORING_SIGNAL,
  TRIAGE_SIGNAL,
  DRAFT_MONITORING_PLAN,
  CREATE_MONITORING_ACTION,
  UPDATE_MONITORING_ACTION,
  APPROVE_RBM_ASSESSMENT,
  APPROVE_RBM_PLAN,
  ADVISE_REGULATORY_PATHWAY,
  SCREEN_PROMOTIONAL_LANGUAGE,
  DRAFT_SAFETY_NARRATIVE,
  LOOKUP_ICD10_CODE,
  MEDICAL_WRITING_GUIDANCE,
  ASSESS_READABILITY,
  BUILD_ABBREVIATION_LIST,
  MEDICAL_WRITING_REVIEW,
  DESCRIBE_CAPABILITIES,
  ASSESS_REGULATORY_LANDSCAPE,
  SEARCH_DRUG_APPROVALS,
  SEARCH_DRUG_LABELS,
  SEARCH_DEVICE_RECALLS,
  SEARCH_CRM,
  CREATE_CALENDAR_EVENT,
  SEARCH_REGULATORY_CORRESPONDENCE,
  SEARCH_LITERATURE,
  RECORD_LITERATURE,
  SEARCH_IVD_KNOWLEDGE,
  PROJECT_KNOWLEDGE_SEARCH,
  RENDER_SIGNATURE_MANIFESTATION,
  ASSESS_OUTPUT_CONFIDENCE,
  CHECK_GROUNDING,
  RUN_SUBMISSION_PREMORTEM,
  ASSEMBLE_CRL_PREMORTEM_ARTIFACT,
  ASSEMBLE_BRIEFING_BOOK,
  SCAN_REGULATORY_DEFICIENCIES,
  SEARCH_LARGE_DOCUMENT,
  REMEMBER_DOCUMENT_IN_PROJECT,
  PROJECT_KNOWLEDGE_SEARCH_MULTI,
  RECALL_SESSION_CONTEXT,
  SIMULATE_STUDY_DESIGN,
} from './evidence-literature-tool-defs.js';
// Legacy-import tool definitions extracted to their own module (decomposition
// tranche 6). Imported so the enabled-tools array can reference them as before.
import {
  START_LEGACY_IMPORT,
  OVERRIDE_IMPORT_MAPPING,
  APPROVE_IMPORT,
  AUTHOR_DOCX_NATIVE,
  CONVERT_DOCX_TO_PDF,
  RUN_PYTHON_SCRIPT,
  INSERT_DOCUMENT_CONTENT,
  SURGICAL_DOCX_XML_EDIT,
  INSERT_CLAUSE_TEMPLATE,
  RUN_IN_CONTAINER,
  VALIDATE_DOCX,
  VERIFY_DOCX_AGAINST_SOURCE,
  WRITE_KIT_SECTION,
  ASSEMBLE_ECTD_MODULE_FROM_ARTIFACTS,
  DRAFT_510K_SUBSTANTIAL_EQUIVALENCE,
  DRAFT_CLINICAL_OVERVIEW_M2_5,
  BATCH_DRAFT_SECTIONS,
  DRAFT_FDA_IR_RESPONSE,
} from './legacy-import-tool-defs.js';
// Submission-center tool definitions extracted to their own module
// (decomposition tranche 6). Imported so the enabled-tools array can reference
// them exactly as before.
import {
  COMPUTE_LIFECYCLE_OPERATIONS,
  CONVERT_TO_RPS_V4,
  GENERATE_STF,
  CHECK_ECTD_CROSS_REFERENCES,
  CLASSIFY_SUBMISSION_DOCUMENT,
  EXTRACT_SUBMISSION_DOCUMENT,
  RUN_SHADOW_REVIEW,
  VALIDATE_ECTD_PACKAGE,
  PLAN_SUBMISSION,
  EXPLAIN_VALIDATION_FINDINGS,
  CROSS_REGION_GAP_ANALYSIS,
  DISPATCH_QC_CHECK,
  TRACE_PROVENANCE,
  CHECK_CONSISTENCY,
  ASSESS_PATHWAY_READINESS,
  BUILD_PATHWAY_MANIFEST,
  LIST_VALIDATION_RULES,
  LOOKUP_REGULATORY_PATHWAY,
  RESOLVE_REGULATORY_STRUCTURE,
  GET_MARKET_SUBMISSION_SPEC,
  GET_DOCUMENT_TEMPLATE,
  VALIDATE_MARKET_FORMATTING,
  GET_SUBMISSION_REQUIREMENTS,
  ASSESS_PATHWAY_ELIGIBILITY,
  CLASSIFY_POST_SUBMISSION_CHANGE,
  ASSESS_DEVICE_EVIDENCE_STRUCTURE,
  CLASSIFY_DEVICE,
  GET_DEVICE_REVIEWER_CHECKLIST,
  GET_BIOCOMPATIBILITY_ENDPOINTS,
  BUILD_DEVICE_BLUEPRINT,
  ASSESS_STORED_CER,
  BUILD_GLOBAL_DEVICE_STRATEGY,
  GET_REGULATORY_TIMELINE,
  VALIDATE_UDI,
  GET_ELECTRICAL_STANDARDS,
  GET_STERILIZATION_REQUIREMENTS,
  ASSESS_COMBINATION_PRODUCT,
  GET_DEVICE_LABELING,
  ASSESS_QMS,
  LIST_REGULATORY_CAPABILITIES,
  ASSESS_DISPATCH_READINESS,
  PLACE_INTO_SEQUENCE,
} from './submission-center-tool-defs.js';
// QMS + labeling + search + analytics tool definitions extracted to their own module (tranche 7).
import {
  CREATE_QMS_DOCUMENT,
  APPROVE_QMS_DOCUMENT,
  ACK_TRAINING,
  REVISE_QMS_DOCUMENT,
  RETIRE_QMS_DOCUMENT,
  REGISTER_SUPPLIER,
  LOG_NONCONFORMING_PRODUCT,
  QMS_CHANGE_CREATE,
  QMS_CHANGE_TRANSITION,
  QMS_CHANGE_LINK,
  SEARCH_CLINICAL_REGULATORY_EVIDENCE,
  COMPARE_PROPOSED_DESIGN_TO_PRECEDENT,
  EXPLAIN_DESIGN_RISK,
  STRESS_TEST_PROTOCOL,
  TRACE_DESIGN_RECOMMENDATION,
  PROJECT_CSR_EVIDENCE,
  CREATE_LABELING_DOCUMENT,
  ADD_LABELING_TRANSLATION,
  ADD_LABELING_SYMBOL,
  GLOBAL_SEARCH,
} from './qms-labeling-analytics-tool-defs.js';
// MDX + beta + IVD mutation tool definitions extracted to their own module (tranche 7).
import {
  CREATE_Q_SUB,
  UPDATE_Q_SUB_COMMITMENT_ROLLED_IN,
  LINK_PROGRAM_CLINICAL_STUDY,
  SET_PROGRAM_METADATA,
  CREATE_UDI_RECORD,
  CREATE_RISK_ITEM,
  ADD_RISK_CONTROL,
  CREATE_SOFTWARE_LIFECYCLE_ITEM,
  WRITE_Q_SUB_SECTION,
  RECORD_ANALYTICAL_PERFORMANCE_STUDY,
  RECORD_CLINICAL_PERFORMANCE_STUDY,
  CLASSIFY_IVD_DEVICE,
  CREATE_PER_DOCUMENT,
  CATEGORIZE_CLIA_COMPLEXITY,
  PAIR_COMPANION_DIAGNOSTIC,
  REGISTER_LDT,
} from './mutation-surface-tool-defs.js';
// Document intake + OCR + spreadsheet tool definitions extracted to their own module (tranche 7).
import {
  INSPECT_UPLOADED_DOCUMENT,
  READ_UPLOADED_DOCUMENT,
  OCR_DOCUMENT_PAGES,
  READ_SPREADSHEET,
  EDIT_SPREADSHEET,
  MINE_PRECEDENTS,
  CHECK_NUMERICAL_INTEGRITY,
  COMPUTE_SAMPLE_SIZE,
  COMPARE_STATISTICAL_SCENARIOS,
  ASSESS_STATISTICAL_DEFENSIBILITY,
  ANALYZE_MISSING_DATA_IMPACT,
  GENERATE_STATISTICAL_DOCUMENT,
  CHECK_DOSSIER_CONSISTENCY,
} from './document-intake-tool-defs.js';
// ./index.ts re-exports these two from this module, so keep them on the public
// surface of this file even though the definitions now live in the sibling.
export { SEARCH_CLINICAL_EVIDENCE, SEARCH_LITERATURE } from './evidence-literature-tool-defs.js';
// Discovery & cheminformatics tool definitions extracted to their own module
// (decomposition tranche 3). Imported so the enabled-tools array can reference
// them exactly as before.
import {
  SEARCH_CHEMBL_COMPOUND,
  ASSESS_TRIAL_FEASIBILITY,
  SEARCH_PREPRINTS,
  SCREEN_COMPOUND_LIABILITIES,
  GENERATE_SCHEDULE_OF_EVENTS,
  AMEND_SCHEDULE_OF_EVENTS,
  REVIEW_SCHEDULE_OF_EVENTS_HEALTH,
  RESET_PROJECT_GOALS,
  RECONCILE_DOSSIER_NUMBERS,
} from './discovery-cheminformatics-tool-defs.js';
import { ANA_ADVISORY_TOOL_SPECS, SUBMISSION_PLAN_TOOL_SPEC, PMA_ADVISORY_TOOL_SPEC, EU_TECHDOC_TOOL_SPEC, IVD_KNOWLEDGE_TOOL_SPEC } from '../ana-advisory';
import { GLOBAL_RI_TOOL_SPECS } from '../global-ri/ana-tools';
import { STATISTICAL_DESIGN_TOOLS } from './statisticalDesignTools';
import { RECONCILIATION_TOOLS } from './reconciliationTools';
import { CHANGE_PROPAGATION_TOOLS } from './changePropagationTools';
import { IVD_LIFECYCLE_TOOLS } from './ivdLifecycleTools';
import { CAPA_MDR_TOOLS } from './capaMdrTools';
import { PREDICATE_INTELLIGENCE_TOOLS } from './predicateIntelligenceTools';
import { REGULATORY_CURRENCY_TOOLS } from './regulatoryCurrencyTools';
import { LICENSE_STATUS_TOOLS } from './licenseStatusTools';
import { SUBMISSION_INTELLIGENCE_TOOLS } from './submissionIntelligenceTools';
import { DEVICE_SUBMISSION_TOOLS } from './deviceSubmissionTools';
import { CODING_TOOLS } from './codingTools';
import { NAVIGATION_TOOLS } from './navigationTools';
import { EXTENDED_REGULATORY_TOOLS } from './extendedRegulatoryTools';
import { HEOR_MARKET_ACCESS_TOOLS } from './heorTools';
import { PHARMACOVIGILANCE_REPORTING_TOOLS } from './pharmacovigilanceReportingTools';
import { ANALYTICAL_METHOD_TOOLS } from './analyticalMethodTools';
import { ADVANCED_MODELING_TOOLS } from './advancedModelingTools';
import { COVER_LETTER_TOOLS } from './coverLetterTools';
import { SHELF_LIFE_TOOLS } from './shelfLifeTools';
import { DEEPENING_TOOLS } from './deepeningTools';
import { DAILYMED_TOOLS } from './dailymedTools';
import { RIM_TOOLS } from './rimTools';
import { RIM_QUERY_TOOLS } from './rimQueryTools';
import { EU_DATA_TOOLS } from './euDataTools';
import { CDISC_TOOLS } from './cdiscTools';
import { GUIDANCE_INGESTION_TOOLS } from './guidanceIngestionTools';
import { SPL_SAFETY_TOOLS } from './splSafetyTools';
import { BIOEQUIVALENCE_TOOLS } from './bioequivalenceTools';
import { PHARMACOMETRICS_TOOLS } from './pharmacometricsTools';
import { TOXICOLOGY_TOOLS } from './toxicologyTools';
import { PEDIATRIC_TOOLS } from './pediatricTools';
import { ADVANCED_THERAPY_TOOLS } from './advancedTherapyTools';
import { RWE_METHODOLOGY_TOOLS } from './rweMethodologyTools';
import { CLINICAL_PHARMACOLOGY_TOOLS } from './clinicalPharmacologyTools';
import { CMC_QUALITY_TOOLS } from './cmcQualityTools';
import { REGULATORY_STRATEGY_TOOLS } from './regulatoryStrategyTools';
import { BIOSIMILAR_TOOLS } from './biosimilarTools';
import { MUTAGENIC_IMPURITY_TOOLS } from './mutagenicImpurityTools';
import { LABELING_INTELLIGENCE_TOOLS } from './labelingIntelligenceTools';
import { IMMUNOGENICITY_TOOLS } from './immunogenicityTools';
import { SAFETY_PHARMACOLOGY_TOOLS } from './safetyPharmacologyTools';
import { PHARMACOVIGILANCE_TOOLS } from './pharmacovigilanceTools';
import { COA_PRO_TOOLS } from './coaProTools';
import { DOSE_OPTIMIZATION_TOOLS } from './doseOptimizationTools';
import { COMBINATION_PRODUCTS_TOOLS } from './combinationProductsTools';
import { TRIAL_STATISTICS_TOOLS } from './trialStatisticsTools';
import { GMP_QUALITY_SYSTEMS_TOOLS } from './gmpQualitySystemsTools';
import { NONCLINICAL_ADME_TOOLS } from './nonclinicalAdmeTools';
import { BIOMARKER_TOOLS } from './biomarkerTools';
import { RARE_DISEASE_TOOLS } from './rareDiseaseTools';
import { GCP_OPERATIONS_TOOLS } from './gcpOperationsTools';
import { MEDICAL_DEVICE_TOOLS } from './medicalDeviceTools';
import { DIGITAL_HEALTH_TOOLS } from './digitalHealthTools';
import { VACCINE_TOOLS } from './vaccineTools';
import { BENEFIT_RISK_TOOLS } from './benefitRiskTools';
import { POST_APPROVAL_TOOLS } from './postApprovalTools';

// ─────────────────────────────────────────────────────────────────────────────
// Evidence & literature tool definitions moved to
// ./evidence-literature-tool-defs.ts (decomposition tranche 5) and imported at
// the top of this file, so ALL_ANA_TOOLS_RAW and the drafting/review tool
// arrays reference them unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding (read-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lets a client ask AnA, in conversation, what its workspace still needs and
 * what a document could contribute — WITHOUT giving the model a way to write.
 *
 * Deliberately read-only. There is no `onboarding_commit` tool and there will
 * not be one: a model-callable commit could self-invoke inside the agentic loop,
 * which would defeat the human-approval gate the whole onboarding flow is built
 * on. Applying proposals stays a human action through the governed endpoint.
 */
export const SUMMARIZE_ONBOARDING_READINESS: AnaTool = {
  name: 'summarize_onboarding_readiness',
  description:
    "Report which onboarding fields this organization's profile already has and which are still blank, and explain what a client can upload to fill the gaps. Read-only: it inspects the org profile and never changes it. Use when a client asks what setup they still need, or what a document could help with. To actually apply values from a document, direct the client to the 'Set up from a document' flow — extraction proposes, the client reviews and approves, and only then is anything written.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FDA Postmarket Surveillance Tools (live openFDA)
// ─────────────────────────────────────────────────────────────────────────────

export const SEARCH_DEVICE_ADVERSE_EVENTS: AnaTool = {
  name: 'search_device_adverse_events',
  description:
    'Search the FDA MAUDE database (live openFDA) for medical-device adverse-event reports by product code, device name, or manufacturer. Returns a summary (total reports, serious events, top event types, date range) plus a capped sample of recent reports. Use for device postmarket surveillance and CER vigilance sections.',
  input_schema: {
    type: 'object',
    properties: {
      product_code: { type: 'string', description: 'FDA product code (e.g. "MDS"), most precise filter' },
      device_name: { type: 'string', description: 'Generic device name' },
      manufacturer: { type: 'string', description: 'Manufacturer name' },
      date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
      date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
      max_results: { type: 'number', description: 'Maximum reports to summarize (default: 50)' },
    },
    required: [],
  },
};

export const SEARCH_DRUG_ADVERSE_EVENTS: AnaTool = {
  name: 'search_drug_adverse_events',
  description:
    'Search the FDA FAERS database (live openFDA) for drug adverse-event reports by product NDC, product name, or manufacturer. Returns a summary (total reports, serious events, top reactions, date range) plus a capped sample. Use for pharmacovigilance and safety-signal context.',
  input_schema: {
    type: 'object',
    properties: {
      product_ndc: { type: 'string', description: 'Product NDC code, most precise filter' },
      product_name: { type: 'string', description: 'Drug product or brand name' },
      manufacturer: { type: 'string', description: 'Manufacturer name' },
      date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
      date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
      max_results: { type: 'number', description: 'Maximum reports to summarize (default: 50)' },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory & Compliance Tools
// ─────────────────────────────────────────────────────────────────────────────

export const LOOKUP_FDA_GUIDANCE: AnaTool = {
  name: 'lookup_fda_guidance',
  description:
    'Look up FDA guidance documents, regulations (21 CFR), and draft/final guidance relevant to a topic. Returns guidance title, document number, key requirements, and citation-ready references.',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Regulatory topic to look up (e.g., "510(k) predicate comparison", "biocompatibility testing")',
      },
      regulation_type: {
        type: 'string',
        enum: ['guidance', '21cfr', 'federal_register', 'any'],
        description: 'Type of regulatory document',
      },
      device_class: {
        type: 'string',
        enum: ['I', 'II', 'III', 'any'],
        description: 'FDA device classification',
      },
    },
    required: ['topic'],
  },
};

export const CHECK_REGULATORY_COMPLIANCE: AnaTool = {
  name: 'check_regulatory_compliance',
  description:
    'Check a document section against specific regulatory requirements. Returns compliance status, gaps, and recommended remediation for each requirement.',
  input_schema: {
    type: 'object',
    properties: {
      section_content: {
        type: 'string',
        description: 'The document section content to check',
      },
      regulatory_framework: {
        type: 'string',
        enum: ['fda_510k', 'fda_pma', 'eu_mdr', 'ich_e6', 'ich_e8', 'ich_e9', '21cfr_part11'],
        description: 'Regulatory framework to check against',
      },
      section_type: {
        type: 'string',
        description: 'Type of document section (e.g., "device_description", "clinical_evidence", "risk_analysis")',
      },
    },
    required: ['section_content', 'regulatory_framework'],
  },
};

export const LOOKUP_ICH_GUIDELINE: AnaTool = {
  name: 'lookup_ich_guideline',
  description:
    'Look up ICH (International Council for Harmonisation) guidelines relevant to a topic. Returns guideline reference, key requirements, and applicable sections.',
  input_schema: {
    type: 'object',
    properties: {
      guideline: {
        type: 'string',
        description: 'ICH guideline code (e.g., "E6(R2)", "E8(R1)", "E9(R1)", "M4") or topic to search',
      },
      section: {
        type: 'string',
        description: 'Specific section within the guideline (optional)',
      },
    },
    required: ['guideline'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Reference & Validation Tools
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATE_CROSS_REFERENCES: AnaTool = {
  name: 'validate_cross_references',
  description:
    'Validate cross-references within a document — check that cited sections exist, table/figure numbers are correct, and internal references are consistent.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'Internal document ID to validate',
      },
      section_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of section references to validate (e.g., ["Section 3.2", "Table 4", "Figure 1"])',
      },
    },
    required: ['document_id'],
  },
};

export const GENERATE_CITATION: AnaTool = {
  name: 'generate_citation',
  description:
    'Generate a properly formatted regulatory citation for a given source. Supports FDA guidance, ICH guidelines, EU MDR articles, journal articles, and 21 CFR references.',
  input_schema: {
    type: 'object',
    properties: {
      source_type: {
        type: 'string',
        enum: ['fda_guidance', 'ich_guideline', 'eu_mdr', 'journal_article', '21cfr', 'iso_standard'],
        description: 'Type of source to cite',
      },
      source_identifier: {
        type: 'string',
        description: 'Source identifier (guidance number, DOI, CFR section, etc.)',
      },
      citation_style: {
        type: 'string',
        enum: ['regulatory', 'apa', 'vancouver'],
        description: 'Citation style (default: regulatory)',
      },
    },
    required: ['source_type', 'source_identifier'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Document Intelligence Tools
// ─────────────────────────────────────────────────────────────────────────────

export const ANALYZE_PREDICATE_DEVICE: AnaTool = {
  name: 'analyze_predicate_device',
  description:
    'Analyze a predicate device for 510(k) substantial equivalence comparison. Returns device details, clearance info, indications for use, and technology comparison points.',
  input_schema: {
    type: 'object',
    properties: {
      predicate_510k_number: {
        type: 'string',
        description: '510(k) number of the predicate device (e.g., "K201234")',
      },
      comparison_aspects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Aspects to compare (e.g., ["intended_use", "technology", "materials", "performance"])',
      },
    },
    required: ['predicate_510k_number'],
  },
};

export const EXTRACT_DOCUMENT_STRUCTURE: AnaTool = {
  name: 'extract_document_structure',
  description:
    'Parse the structure of a document from its extracted text — the heading/section/clause outline, a table of contents, and counts of tables and figures. Headings are detected from markdown, decimal numbering (e.g. "2.3 Scope"), Article/Section/Clause prefixes, or ALL-CAPS lines. Pass the document text in `text`. Use this to understand a client document before reviewing or comparing it.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The extracted plain text of the document to analyze.',
      },
      document_id: {
        type: 'string',
        description: 'Optional internal document ID (informational; the analysis runs on `text`).',
      },
    },
    required: ['text'],
  },
};

export const COMPARE_DOCUMENT_VERSIONS: AnaTool = {
  name: 'compare_document_versions',
  description:
    'Compare two versions of a document and report what changed — at the section/clause level (which sections were added, removed, or modified) and as a line-level diff. Pass the two texts as `old_text` and `new_text`. Use this for redline-style version review of client documents (e.g. a brief, protocol, or contract).',
  input_schema: {
    type: 'object',
    properties: {
      old_text: { type: 'string', description: 'Text of the earlier version.' },
      new_text: { type: 'string', description: 'Text of the later version.' },
    },
    required: ['old_text', 'new_text'],
  },
};

export const SEARCH_DOCUMENT: AnaTool = {
  name: 'search_document',
  description:
    'Search within a document\'s text for a term or pattern ("grep" the document) and return each hit with its line number and the section it falls under. Set `regex` to true to treat `query` as a regular expression. Use this to locate clauses, defined terms, obligations, or specific values inside a client document.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The extracted plain text of the document to search.' },
      query: { type: 'string', description: 'The term or pattern to find.' },
      regex: { type: 'boolean', description: 'Treat `query` as a regular expression (default false).' },
      case_sensitive: { type: 'boolean', description: 'Case-sensitive match (default false).' },
      max_results: { type: 'number', description: 'Maximum matches to return (default 200).' },
    },
    required: ['text', 'query'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Document intake + OCR + spreadsheet tool definitions moved to ./document-intake-tool-defs.ts
// (decomposition tranche 7) and imported at the top of this file, so
// ALL_ANA_TOOLS_RAW and the drafting/review arrays resolve unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Tool Collections by Use Case
// ─────────────────────────────────────────────────────────────────────────────

/** Tools for regulatory document drafting */
export const DOCUMENT_DRAFTING_TOOLS: AnaTool[] = [
  SEARCH_CLINICAL_EVIDENCE,
  SEARCH_LITERATURE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  GENERATE_CITATION,
  ANALYZE_PREDICATE_DEVICE,
];

/** Tools for compliance review */
export const COMPLIANCE_REVIEW_TOOLS: AnaTool[] = [
  CHECK_REGULATORY_COMPLIANCE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  VALIDATE_CROSS_REFERENCES,
];

/** Tools for gap analysis */
export const GAP_ANALYSIS_TOOLS: AnaTool[] = [
  CHECK_REGULATORY_COMPLIANCE,
  EXTRACT_DOCUMENT_STRUCTURE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  VALIDATE_CROSS_REFERENCES,
];

/** Tools for reviewing and comparing client documents */
export const DOCUMENT_REVIEW_TOOLS: AnaTool[] = [
  EXTRACT_DOCUMENT_STRUCTURE,
  COMPARE_DOCUMENT_VERSIONS,
  SEARCH_DOCUMENT,
  INSPECT_UPLOADED_DOCUMENT,
  READ_UPLOADED_DOCUMENT,
  OCR_DOCUMENT_PAGES,
  READ_SPREADSHEET,
];

// ─────────────────────────────────────────────────────────────────────────────
// Document Generation Tools (Master Python Builder)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a regulatory document from scratch or template */
export const GENERATE_DOCUMENT: AnaTool = {
  name: 'generate_document',
  description: 'Generate a complete regulatory document (CSR, CTD section, CER, 510(k), protocol, SAP, IB, ICSR). Produces DOCX, PDF, or XML output. Use when the user asks to create, generate, draft, or build a regulatory document.',
  input_schema: {
    type: 'object',
    properties: {
      document_type: {
        type: 'string',
        description: 'Type of document to generate',
        enum: ['csr', 'ctd_module1', 'ctd_module2', 'ctd_module3', 'ctd_module4', 'ctd_module5', 'cer', '510k', 'pma', 'protocol', 'sap', 'ib', 'icsr', 'ectd_backbone'],
      },
      title: {
        type: 'string',
        description: 'Document title',
      },
      sections: {
        type: 'array',
        description: 'Sections to include with content',
        items: {
          type: 'object',
          properties: {
            number: { type: 'string', description: 'Section number (e.g., 2.5, 5.3.1)' },
            title: { type: 'string', description: 'Section title' },
            content: { type: 'string', description: 'Section content (can be HTML)' },
          },
          required: ['number', 'title', 'content'],
        },
      },
      output_format: {
        type: 'string',
        description: 'Output format',
        enum: ['docx', 'pdf', 'xml'],
      },
      agencies: {
        type: 'array',
        description: 'Target regulatory agencies',
        items: { type: 'string', enum: ['FDA', 'EMA', 'PMDA', 'NMPA', 'Health_Canada', 'TGA', 'MHRA'] },
      },
      template_path: {
        type: 'string',
        description: 'Optional: path to a client-uploaded DOCX template to use as base',
      },
      replacements: {
        type: 'object',
        description: 'Optional: placeholder-to-value string replacements for template mode',
      },
    },
    required: ['document_type', 'title'],
  },
};

/** Build a document from a client-uploaded template with string replacement and XML injection */
export const BUILD_FROM_TEMPLATE: AnaTool = {
  name: 'build_from_template',
  description: 'Copy a client-uploaded DOCX template, unpack it, perform string replacement to inject content, and optionally inject raw XML for complex structures like tables and regulatory elements. Use when the user has uploaded a template and wants to fill it with project-specific content.',
  input_schema: {
    type: 'object',
    properties: {
      template_path: {
        type: 'string',
        description: 'Path to the uploaded DOCX template file',
      },
      replacements: {
        type: 'object',
        description: 'Map of placeholder strings to replacement values. E.g., {"{{PRODUCT_NAME}}": "Compound X", "{{SPONSOR}}": "Acme Pharma"}',
      },
      xml_injections: {
        type: 'array',
        description: 'Direct XML injections into the DOCX structure',
        items: {
          type: 'object',
          properties: {
            position: { type: 'string', enum: ['before-close-body', 'after-open-body', 'replace-placeholder', 'append-to-body'] },
            xml: { type: 'string', description: 'OOXML content to inject' },
            placeholder: { type: 'string', description: 'For replace-placeholder: the text to find and replace with XML' },
          },
          required: ['position', 'xml'],
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
      },
      document_title: {
        type: 'string',
        description: 'Title for the output file',
      },
    },
    required: ['template_path', 'replacements'],
  },
};

/** Generate an IND CTD section */
export const IND_GENERATE_SECTION: AnaTool = {
  name: 'ind_generate_section',
  description: 'Generate a specific CTD section for an IND submission. Creates a governed draft artifact with regulatory-quality content. Use when the user asks to draft, generate, or create a specific IND/CTD section (e.g., "draft section 2.5", "generate the clinical overview", "create Module 3 drug substance section").',
  input_schema: {
    type: 'object',
    properties: {
      section_code: {
        type: 'string',
        description: 'CTD section code (e.g., "2.5" for Clinical Overview, "3.2.S" for Drug Substance, "4.2.3" for Toxicology)',
      },
      project_id: {
        type: 'string',
        description: 'Project ID to save the generated section to',
      },
      product_name: { type: 'string', description: 'Name of the drug/product' },
      indication: { type: 'string', description: 'Therapeutic indication' },
      sponsor: { type: 'string', description: 'Sponsor company name' },
      phase: { type: 'string', description: 'Clinical phase (Phase 1, Phase 2, etc.)' },
    },
    required: ['section_code'],
  },
};

/** Get IND submission status and structure */
export const IND_GET_STATUS: AnaTool = {
  name: 'ind_get_status',
  description: 'Get the complete IND submission structure and section-by-section completion status. Use when the user asks about IND progress, what sections are done, what\'s missing, or the overall readiness of their IND submission.',
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID to check status for',
      },
    },
    required: ['project_id'],
  },
};

/** Rasterize a document page for visual inspection */
export const RASTERIZE_PAGE: AnaTool = {
  name: 'rasterize_page',
  description: 'Rasterize (render as image) a specific page of a DOCX or PDF document for visual inspection. Returns a PNG image of the page. Use when the user wants to preview, inspect, or visually verify a generated document page.',
  input_schema: {
    type: 'object',
    properties: {
      document_path: {
        type: 'string',
        description: 'Path to the DOCX or PDF document',
      },
      page_number: {
        type: 'number',
        description: 'Page number to rasterize (1-based)',
      },
      dpi: {
        type: 'number',
        description: 'Resolution in DPI (default: 150)',
      },
    },
    required: ['document_path'],
  },
};

/** Overlay content onto a PDF template (forms, headers, signatures, stamps) */
export const PDF_OVERLAY: AnaTool = {
  name: 'pdf_overlay',
  description: 'Overlay text, images, or regulatory stamps onto specific coordinates of an existing PDF template. Use for form filling, adding signatures, watermarks, approval stamps, or finalizing templates with positioned content. Supports multi-page overlay.',
  input_schema: {
    type: 'object',
    properties: {
      base_pdf_path: {
        type: 'string',
        description: 'Path to the base PDF template to overlay onto',
      },
      overlays: {
        type: 'array',
        description: 'List of overlay operations',
        items: {
          type: 'object',
          properties: {
            page: { type: 'number', description: 'Page number (1-based)' },
            type: { type: 'string', enum: ['text', 'image', 'stamp'], description: 'Overlay type' },
            x: { type: 'number', description: 'X coordinate (points from left)' },
            y: { type: 'number', description: 'Y coordinate (points from bottom)' },
            content: { type: 'string', description: 'Text content, image path, or stamp type' },
            font_size: { type: 'number', description: 'Font size for text overlays' },
            color: { type: 'string', description: 'Color for text (e.g., "#000000")' },
          },
          required: ['page', 'type', 'x', 'y', 'content'],
        },
      },
      output_path: {
        type: 'string',
        description: 'Path for the finalized output PDF',
      },
    },
    required: ['base_pdf_path', 'overlays'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Precedent Engine — exposes the 60KB precedent-engine.ts service as tools.
// search() and compare() are the two highest-value entry points: search lets
// AnA pulls approved-submission records by indication/class/therapeutic
// area; compare lets AnA pit a user's draft submission against a specific
// historical precedent and get back similarities, differences, and risk.
// ─────────────────────────────────────────────────────────────────────────────

export const LOOKUP_REGULATORY_PRECEDENTS: AnaTool = {
  name: 'lookup_regulatory_precedents',
  description:
    "Find approved or rejected regulatory submissions that resemble the user's submission across indication, device class, therapeutic area, or free-text query. Returns structured records (clearance number, applicant, decision date and outcome, predicate device, primary endpoint, FDA questions, risk factors, similarity score) so the model can ground risk claims in actual decisions instead of guessing. This is a non-LLM lookup against the local precedent corpus — fast, deterministic, and tenant-scoped. Use BEFORE drafting strategy or risk sections, BEFORE responding to FDA questions, or whenever the user asks 'has anyone done this before?' Tools that compare-against-precedent or analyze-risk should be called AFTER this returns at least one promising match.",
  input_schema: {
    type: 'object',
    properties: {
      submission_type: {
        type: 'string',
        description:
          "Submission pathway. One of: 510(k), De Novo, PMA, NDA, BLA, IND, ANDA, CER, IVDR, MAA. Required.",
      },
      indication: {
        type: 'string',
        description: 'Target indication or intended use (e.g. "type 2 diabetes", "knee replacement").',
      },
      device_class: {
        type: 'string',
        description: 'FDA device class for device pathways: "1", "2", or "3".',
      },
      product_type: {
        type: 'string',
        description: 'Product type: "Device", "Drug", "Biologic", "Diagnostic".',
      },
      therapeutic_area: {
        type: 'string',
        description: 'Therapeutic area (e.g. "Oncology", "CNS", "Cardiovascular", "Endocrinology").',
      },
      query: {
        type: 'string',
        description: 'Free-text query for semantic search across precedent records.',
      },
      device_name: {
        type: 'string',
        description: 'Device or product trade/generic name.',
      },
      product_code: {
        type: 'string',
        description: 'FDA product code (e.g. "LRH" for cardiac monitor).',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return. Defaults to 10 if omitted.',
      },
    },
    required: ['submission_type'],
  },
};

export const COMPARE_SUBMISSION_AGAINST_PRECEDENT: AnaTool = {
  name: 'compare_submission_against_precedent',
  description:
    "Pit the user's drafted submission against a specific approved/rejected precedent and get a structured similarity/difference/risk report. Returns per-dimension comparisons (indication, trial design, sample size, primary endpoint, testing approach, predicate device) with match flags, impact severity, an overall risk level (low/medium/high/critical), an overall numeric score, and concrete recommendations. Call this AFTER lookup_regulatory_precedents has returned a promising precedent_id — typically the closest similarity match. The output gives the user evidence-grounded talking points for why their submission is or is not aligned with how a comparable case was decided.",
  input_schema: {
    type: 'object',
    properties: {
      precedent_id: {
        type: 'string',
        description: "ID of the precedent record to compare against, from lookup_regulatory_precedents results.",
      },
      submission_type: {
        type: 'string',
        description: "User's submission pathway. One of: 510(k), De Novo, PMA, NDA, BLA, IND, ANDA, CER, IVDR, MAA.",
      },
      device_name: {
        type: 'string',
        description: 'User device or product name.',
      },
      indication: {
        type: 'string',
        description: 'Target indication or intended use for the user submission.',
      },
      trial_design: {
        type: 'string',
        description: 'User trial design summary (e.g. "randomized double-blind placebo-controlled, 2:1 randomization, 52-week treatment").',
      },
      sample_size: {
        type: 'number',
        description: 'Planned or actual sample size (N).',
      },
      primary_endpoint: {
        type: 'string',
        description: 'Primary endpoint definition.',
      },
      testing_approach: {
        type: 'string',
        description: 'Testing/evidence approach summary.',
      },
      predicate_device: {
        type: 'string',
        description: 'Cited predicate device name (510(k)/De Novo only).',
      },
    },
    required: ['precedent_id', 'submission_type'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Submission Twin — exposes the 51KB submission-twin-service.ts as tools.
// All three require organizationId from request context (plumbed via
// ToolContext); the LLM cannot pass tenant identifiers as tool inputs by
// design.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_CLAIM_EVIDENCE_INTEGRITY: AnaTool = {
  name: 'assess_claim_evidence_integrity',
  description:
    "Run the claim-to-evidence integrity check across a submission package. For each extracted claim (efficacy, safety, manufacturing, performance) the service returns whether the claim is supported, weak, unsupported, or contradicted by linked artifacts. Returns aggregate counts (total/supported/weak/unsupported/contradicted) plus the per-claim evidence link records. Call this BEFORE the user finalizes a section or hits Submit on a package — the failure mode it catches (claims that drift away from their evidence base during multi-author drafting) is one of the top causes of FDA Refuse-to-File and EMA major objections. Tenant context (organizationId) is injected from the request; the LLM does not pass it.",
  input_schema: {
    type: 'object',
    properties: {
      package_id: {
        type: 'number',
        description: 'Submission package ID. Required.',
      },
    },
    required: ['package_id'],
  },
};

export const SIMULATE_REVIEWER_CHALLENGES: AnaTool = {
  name: 'simulate_reviewer_challenges',
  description:
    "Generate the questions and objections a regulator would raise against a submission package. Runs the package through configurable reviewer lenses — skeptical reviewer, evidence sufficiency skeptic, CMC-heavy reviewer, clinical risk reviewer, biostatistics skeptic — and returns the challenges each lens surfaces (severity, lens, claim referenced, suggested response). Pre-empts the questions that arrive in FDA Information Requests, EMA Day-120 questions, and PMDA questioning rounds. Requires an existing assessment_id (run a full submission-twin assessment first if you don't have one); package_id is also required so the service can scope correctly. Tenant context is injected from the request.",
  input_schema: {
    type: 'object',
    properties: {
      package_id: {
        type: 'number',
        description: 'Submission package ID.',
      },
      assessment_id: {
        type: 'number',
        description: 'Submission-twin assessment ID to attach challenges to. Run a full assessment first if you don\'t have one.',
      },
      lenses: {
        type: 'array',
        description:
          'Reviewer lenses to run. Defaults to all five (skeptical_reviewer, evidence_sufficiency_skeptic, cmc_heavy_reviewer, clinical_risk_reviewer, biostatistics_skeptic). Pass a subset to scope the simulation.',
        items: { type: 'string' },
      },
    },
    required: ['package_id', 'assessment_id'],
  },
};

export const PREDICT_CHANGE_IMPACT: AnaTool = {
  name: 'predict_change_impact',
  description:
    "Predict the cascading impact of changing one artifact in a submission package — which downstream claims are affected, which sibling artifacts need updates to stay consistent, and what the regulatory risk is if the change ships unaddressed. Use BEFORE the user commits a substantive change to a section or document so they can see the blast radius first (e.g. updating the safety pool changes summary tables in M2.5 and M2.7, plus the SCS in M5). Returns ordered impact records with severity, affected_artifact, claim_dependencies, and suggested follow-up actions. Tenant context is injected from the request.",
  input_schema: {
    type: 'object',
    properties: {
      package_id: {
        type: 'number',
        description: 'Submission package ID.',
      },
      changed_artifact_id: {
        type: 'number',
        description: 'Artifact ID being changed.',
      },
      change_description: {
        type: 'string',
        description: 'Plain-language description of what is changing (e.g. "added 12-month safety follow-up data").',
      },
      change_type: {
        type: 'string',
        description: 'Category of change. One of: content, scope, data_source, methodology, conclusion, scope_expansion, scope_reduction.',
      },
    },
    required: ['package_id', 'changed_artifact_id', 'change_description', 'change_type'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Template Library — exposes server/services/templateService.ts plus
// server/services/docx/masterDocumentBuilder.ts as a single tool. Two
// modes: discovery (returns template metadata + content preview) and
// fill (returns a path to a filled DOCX with placeholder substitutions).
// ─────────────────────────────────────────────────────────────────────────────

export const FETCH_TEMPLATE_AND_FILL: AnaTool = {
  name: 'fetch_template_and_fill',
  description:
    "Fetch an eCTD/regulatory template from the project's template library and (when fill_data is supplied) emit a filled DOCX with placeholder substitutions applied. Use to assemble templated documents — cover letters, eCTD module sections, CSR shells, regulatory forms — without copy-pasting from spreadsheets. Two modes: (1) call without fill_data to retrieve the template's name, category, module, content preview, and whether a Word template is attached — useful for discovering placeholders before filling; (2) call with fill_data populated to perform string-placeholder replacement and return the filled DOCX path. Tenant-scoped via ToolContext.organizationId; templates are organization-private.",
  input_schema: {
    type: 'object',
    properties: {
      template_id: {
        type: 'number',
        description: 'eCTD template ID from the library (ectdTemplates.id).',
      },
      fill_data: {
        type: 'object',
        description:
          'Map of placeholder name → replacement value (e.g. {"PRODUCT_NAME": "Compound X", "SPONSOR": "Acme Pharma"}). Omit to fetch template metadata only (discovery mode).',
        additionalProperties: { type: 'string' },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description: 'Output format. Defaults to docx.',
      },
    },
    required: ['template_id'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MDX + beta + IVD mutation tool definitions moved to ./mutation-surface-tool-defs.ts
// (decomposition tranche 7) and imported at the top of this file, so
// ALL_ANA_TOOLS_RAW and the drafting/review arrays resolve unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Submission gateway tools — package an eCTD bundle for a region, transmit
// to FDA ESG / EMA CESP / EMA EUDAMED / PMDA Gateway, poll status, and
// download acknowledgements. Backed by server/services/submission-gateways/.
// Tenant-scoped via ToolContext.organizationId. All transports are real
// protocol code, credential-gated through env vars.
// ─────────────────────────────────────────────────────────────────────────────

export const PACKAGE_ECTD_FOR_REGION: AnaTool = {
  name: 'package_ectd_for_region',
  description:
    "Assemble a regional eCTD zip (FDA us-regional.xml / EMA eu-regional.xml / PMDA jp-regional.xml / Health Canada ca-regional.xml) from a set of CTD leaves. Produces the correct Module 1 folder structure per region, computes SHA-256, and returns the bundle metadata for downstream transmit. Use after AnA has gathered the leaf manifest for a submission.",
  input_schema: {
    type: 'object',
    properties: {
      region:          { type: 'string', enum: ['fda', 'ema', 'pmda', 'ca'] },
      application_id:  { type: 'string', description: 'IND/NDA number (FDA), procedure number (EMA), application number (PMDA), dossier id (Health Canada).' },
      sequence:        { type: 'string', description: '4-digit submission sequence, e.g. 0001.' },
      submission_type: { type: 'string', description: 'original | amendment | response | annual_report | safety.' },
      application_type: { type: 'string', description: 'REQUIRED for region "fda": what is being filed — nda | snda | anda | bla | ind | dmf. The us-regional backbone carries this as the application-type attribute, and it is a statement about the filing, so the packager refuses to guess it. Device pathways (510k, de_novo, pma) have no eCTD Module 1 code and are not filed on this backbone.' },
      sponsor_id:      { type: 'string', description: 'DUNS / EMA org id / PMDA applicant id.' },
      sponsor_name:    { type: 'string' },
      product_name:    { type: 'string' },
      leaves: {
        type: 'array',
        description: 'List of eCTD leaves. Each leaf is { ctd_section, operation, source_path, file_name, title }.',
        items: {
          type: 'object',
          properties: {
            ctd_section: { type: 'string' },
            operation:   { type: 'string', enum: ['new', 'append', 'replace', 'delete'] },
            source_path: { type: 'string' },
            file_name:   { type: 'string' },
            title:       { type: 'string' },
          },
          required: ['ctd_section', 'operation', 'source_path', 'file_name', 'title'],
        },
      },
      output_dir: { type: 'string', description: 'Where to write the zip. Defaults to tmp/submissions.' },
    },
    required: ['region', 'application_id', 'sequence', 'submission_type', 'sponsor_id', 'sponsor_name', 'product_name', 'leaves'],
  },
};

export const TRANSMIT_SUBMISSION: AnaTool = {
  name: 'transmit_submission',
  // The description states the refusal, because a tool whose description
  // promises transmission will be called for transmission and its refusal
  // reported to the user as a failure. It does not transmit — see the handler
  // in AnaToolExecutor.ts and the gateway guard in submission-gateways/index.ts.
  description:
    'Explains how to transmit an already-packaged bundle to a regulatory gateway (FDA ESG, EMA CESP, EMA EUDAMED, PMDA Gateway, Health Canada CESG). This tool does NOT transmit: agency transmission is irreversible and requires a person to re-authenticate, give a reason, pass the eCTD structural gate and apply a Part 11 signature on the Gateway transmittals surface. Call it to hand the user the exact next step and the bundle identifiers they will need. Everything before the wire — packaging, digest verification, status checks, acknowledgements — is available as separate tools.',
  input_schema: {
    type: 'object',
    properties: {
      region:      { type: 'string', enum: ['fda', 'ema', 'pmda', 'ca'] },
      gateway:     { type: 'string', enum: ['esg', 'cesp', 'eudamed', 'pmda_gateway', 'hc_cesg'] },
      environment: { type: 'string', enum: ['staging', 'production'], description: "Default 'production'." },
      bundle_path: { type: 'string', description: 'Absolute path to the package on disk.' },
      bundle_sha256: { type: 'string', description: '64-char hex SHA-256.' },
      bundle_size_bytes: { type: 'number' },
      format:      { type: 'string', enum: ['ectd', 'estar', 'eudamed_register', 'pmda_ectd'] },
      program_id:  { type: 'string', description: 'regulatory_programs.id (UUID).' },
      package_id:  { type: 'number', description: 'c2c_submission_packages.id (when applicable).' },
      submission_type: { type: 'string' },
      application_id:  { type: 'string', description: 'Stored on metadata; consumed by gateway-specific transports.' },
      sequence:    { type: 'string', description: 'Stored on metadata.' },
    },
    required: ['region', 'gateway', 'bundle_path', 'bundle_sha256', 'bundle_size_bytes', 'format'],
  },
};

export const CHECK_SUBMISSION_STATUS: AnaTool = {
  name: 'check_submission_status',
  description:
    "Poll the latest status for a transmitted submission. For FDA ESG, fetches the AS2 MDN / SFTP ack chain. For EMA CESP, polls /baskets/{id}. For EUDAMED, returns the most recent stored state. For PMDA Gateway, polls /receipts/{id}. Status transitions surface from the gateway's domain language (received → ack1 → ack2 → ack3 → validation_passed → review_started etc.).",
  input_schema: {
    type: 'object',
    properties: { transmittal_id: { type: 'number' } },
    required: ['transmittal_id'],
  },
};

export const GET_SUBMISSION_ACK: AnaTool = {
  name: 'get_submission_ack',
  description:
    "Download the latest acknowledgment for a transmittal as a text summary. Includes the gateway's transmission id, current status, ack timestamp, and (when present) the raw acknowledgment payload. Use when the user wants to inspect the receipt or attach it to the audit trail.",
  input_schema: {
    type: 'object',
    properties: { transmittal_id: { type: 'number' } },
    required: ['transmittal_id'],
  },
};

export const RECORD_VALIDATION_FINDING: AnaTool = {
  name: 'record_validation_finding',
  description:
    "Record a validator finding against a transmittal (FDA eValidator, EMA-validator, PMDA pre-check, commercial validators Lorenz / GlobalSubmit, or AnA's internal pre-check). Severity 'error' blocks acceptance; 'warning' is advisory; 'info' is contextual. After the finding lands, the kit's transmittal view shows it; use resolve_validation_finding to mark it addressed.",
  input_schema: {
    type: 'object',
    properties: {
      transmittal_id: { type: 'number' },
      validator:      { type: 'string', enum: ['fda_evalidator', 'ema_validator', 'pmda_precheck', 'lorenz', 'globalsubmit', 'internal'] },
      severity:       { type: 'string', enum: ['error', 'warning', 'info'] },
      rule_id:        { type: 'string' },
      rule_title:     { type: 'string' },
      message:        { type: 'string' },
      file_path:      { type: 'string' },
      line_number:    { type: 'number' },
    },
    required: ['transmittal_id', 'validator', 'severity', 'message'],
  },
};

export const RESOLVE_VALIDATION_FINDING: AnaTool = {
  name: 'resolve_validation_finding',
  description:
    "Mark a validator finding as resolved with a short note describing how the issue was addressed. Captures resolved_by + resolved_at for the 21 CFR Part 11 audit trail.",
  input_schema: {
    type: 'object',
    properties: {
      finding_id:       { type: 'number' },
      resolution_note:  { type: 'string' },
    },
    required: ['finding_id'],
  },
};

export const GATEWAY_CONFIGURATION_STATUS: AnaTool = {
  name: 'gateway_configuration_status',
  description:
    "Report which submission gateways are configured for the caller's organization × environment. Returns one row per (region, gateway) with a boolean configured flag. Use before transmitting to give the user a clear answer to 'which regions can we submit to today?'.",
  input_schema: {
    type: 'object',
    properties: {
      environment: { type: 'string', enum: ['staging', 'production'], description: "Default 'production'." },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Submission-center tool definitions moved to ./submission-center-tool-defs.ts
// (decomposition tranche 6) and imported at the top of this file, so
// ALL_ANA_TOOLS_RAW references them unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Notification + clinical-study + working-memory tool definitions moved to
// ./notifications-study-memory-tool-defs.ts (decomposition tranche 4) and
// imported at the top of this file, so ALL_ANA_TOOLS_RAW references them
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// QMS + labeling + search + analytics tool definitions moved to ./qms-labeling-analytics-tool-defs.ts
// (decomposition tranche 7) and imported at the top of this file, so
// ALL_ANA_TOOLS_RAW and the drafting/review arrays resolve unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Legacy-import tool definitions moved to ./legacy-import-tool-defs.ts
// (decomposition tranche 6) and imported at the top of this file, so
// ALL_ANA_TOOLS_RAW references them unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// BLA 351(a) biologics + CTD nonclinical/clinical tool definitions moved to
// ./bla-biologics-tool-defs.ts (decomposition tranche 2) and imported at the top
// of this file, so ALL_ANA_TOOLS_RAW references them unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Discovery & cheminformatics tool definitions moved to
// ./discovery-cheminformatics-tool-defs.ts (decomposition tranche 3) and
// imported at the top of this file, so ALL_ANA_TOOLS_RAW references them
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Intelligence Questioning Engine Tools
// ─────────────────────────────────────────────────────────────────────────────

const START_INTELLIGENCE_FLOW: AnaTool = {
  name: 'start_intelligence_flow',
  description:
    'Start an intelligence questioning flow for a regulatory document type. ' +
    'When a user wants to build a protocol, CSR, IND, SOP, 510(k), CER, or other regulatory document, ' +
    'invoke this tool to launch the guided questioning flow. The engine will return structured questions ' +
    'that the user answers step by step, with branching logic, validation, and regulatory issue detection.',
  input_schema: {
    type: 'object',
    properties: {
      document_type: {
        type: 'string',
        description:
          'The type of regulatory document to build. Examples: "protocol", "csr", "ind", "sop", "510k", "cer", ' +
          '"clinical protocol", "clinical study report", "IND submission", "standard operating procedure".',
      },
    },
    required: ['document_type'],
  },
};

const ANSWER_INTELLIGENCE_QUESTION: AnaTool = {
  name: 'answer_intelligence_question',
  description:
    'Submit an answer to the current intelligence question in an active flow. ' +
    'The engine validates the answer, runs issue checks, and advances to the next question ' +
    'or completes the flow with a structured output. The engine is stateless: pass back the ' +
    'entire `flow_state` object returned by the previous start_intelligence_flow / ' +
    'answer_intelligence_question call (not just an id) so it can resume.',
  input_schema: {
    type: 'object',
    properties: {
      flow_state: {
        type: 'object',
        description:
          'The full flow state object returned by the previous call (start_intelligence_flow or the ' +
          'prior answer_intelligence_question). Round-trip it verbatim — the engine holds no state of its own.',
      },
      node_id: {
        type: 'string',
        description: 'The ID of the question node being answered.',
      },
      answers: {
        type: 'object',
        description:
          'Map of field IDs to their values. Keys are the field IDs from the question node, ' +
          'values are the user\'s answers (strings, numbers, booleans, or arrays for multi-select).',
      },
    },
    required: ['flow_state', 'node_id', 'answers'],
  },
};

const LIST_INTELLIGENCE_FLOWS: AnaTool = {
  name: 'list_intelligence_flows',
  description:
    'List all available intelligence questioning flows for the current client context. ' +
    'Returns flow categories, names, descriptions, and estimated completion times.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// War Game Simulation Tool
// ─────────────────────────────────────────────────────────────────────────────

const START_WAR_GAME: AnaTool = {
  name: 'start_war_game',
  description:
    'Simulate an FDA auditor review of collected intelligence data. Pressure-tests the document ' +
    'against regulatory requirements and produces an advisory report with findings and remediation ' +
    'recommendations. Use this after completing an intelligence questioning flow to war-game the ' +
    'document before submission.',
  input_schema: {
    type: 'object',
    properties: {
      war_game_category: {
        type: 'string',
        enum: ['protocol', 'ind', 'csr', '510k', 'cer', 'sop', 'nda', 'bla', 'pma', 'cmc', 'risk_management', 'safety_narrative', 'labeling', 'briefing_book', 'stability'],
        description: 'The type of document to war-game.',
      },
      source_flow_id: {
        type: 'string',
        description: 'The flow ID of the completed intelligence questionnaire to audit.',
      },
      answers: {
        type: 'object',
        description: 'The collected answers from the intelligence flow.',
      },
    },
    required: ['war_game_category', 'source_flow_id', 'answers'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Document view + operations tool definitions moved to
// ./document-surface-tool-defs.ts (decomposition tranche 3) and imported at the
// top of this file, so ALL_ANA_TOOLS_RAW references them unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Reporting View Tools — read/list access over the governed Report-OS
// product, segment-anchored and entitlement-aware. AnA NARRATES report
// outputs; it never originates a metric, score, or probability — those come
// only from deterministic providers (report-os/ana/report-tools.ts
// ANA_REPORTING_GUARDRAIL). All tenant-scoped, read-only.
// ─────────────────────────────────────────────────────────────────────────────

export const LIST_REPORT_TYPES: AnaTool = {
  name: 'list_report_types',
  description:
    "List the governed report types available to this organization for a given scope — already " +
    "filtered to the org's client segment(s) and annotated with the entitlement verdict for its " +
    "plan tier (entitled vs the tier that unlocks it). Use before generating or discussing a report " +
    "so the user is only offered report types their segment, scope, and plan actually permit. " +
    "AnA narrates these; it never invents a report type. Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['account', 'program', 'project', 'study', 'submission', 'document'],
        description: 'The report scope to list types for.',
      },
      persona: { type: 'string', description: 'Optional persona filter (e.g. executive, ra_lead, qa).' },
    },
    required: ['scope'],
  },
};

export const GET_PORTFOLIO_READINESS: AnaTool = {
  name: 'get_portfolio_readiness',
  description:
    "The enterprise portfolio board-pack rollup for a program group: average readiness and " +
    "confidence, worst risk, ready/partial/missing counts, total critical blockers, the " +
    "attention-ranked worklist (lowest readiness first), and top blocker themes. Every number is " +
    "computed by the deterministic orchestrator — AnA explains the rollup, never originates it. " +
    "Requires the enterprise plan (portfolio_rollup); returns a locked notice otherwise. " +
    "Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      program_group_id: { type: 'number', description: 'The program group id to roll up.' },
    },
    required: ['program_group_id'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AnA Reporting Canvas tools — AnA conversationally generates governed reports,
// suggests a best-practices dashboard grounded in the client's programs, answers
// reporting questions, and saves dashboards. Every report is a governed run
// (same orchestrator + entitlement gate + truthfulness gate as a direct run):
// AnA composes and narrates, it NEVER originates a metric.
// ─────────────────────────────────────────────────────────────────────────────

export const GENERATE_REPORT: AnaTool = {
  name: 'generate_report',
  description:
    'Generate one governed report LIVE for the reporting canvas: runs the given report type over a ' +
    'scope through the same orchestrator + truthfulness gate as a direct run, and returns the rendered ' +
    'report (sections + typed blocks: metrics, tables, charts, blockers, gaps, disclosures). Use to ' +
    'build a report the user asked for or to populate a dashboard panel. Entitlement-gated (returns a ' +
    'locked notice with the required tier otherwise). AnA presents and explains this report; every ' +
    'number is computed by the engine, never by AnA. Tenant-scoped.',
  input_schema: {
    type: 'object',
    properties: {
      report_type_id: { type: 'string', description: 'A governed report type id (from list_report_types).' },
      scope_type: {
        type: 'string',
        enum: ['account', 'program', 'project', 'study', 'submission', 'document'],
        description: 'The scope to run the report at.',
      },
      scope_id: { type: 'string', description: 'The id of the scope entity (e.g. project id).' },
      submission_type: { type: 'string', description: 'Optional submission type hint (e.g. NDA, 510k).' },
    },
    required: ['report_type_id', 'scope_type', 'scope_id'],
  },
};

export const EXPLAIN_REPORT_BLOCKERS: AnaTool = {
  name: 'explain_report_blockers',
  description:
    'Generate a governed report and return its blockers + gaps for AnA to explain in plain language — ' +
    'what is blocking readiness/finality and why. Reuses generate_report under the hood (same governed ' +
    'engine); AnA narrates the returned blockers, it never invents one. Entitlement-gated. Tenant-scoped.',
  input_schema: {
    type: 'object',
    properties: {
      report_type_id: { type: 'string', description: 'A governed report type id.' },
      scope_type: {
        type: 'string',
        enum: ['account', 'program', 'project', 'study', 'submission', 'document'],
      },
      scope_id: { type: 'string' },
    },
    required: ['report_type_id', 'scope_type', 'scope_id'],
  },
};

export const SUGGEST_REPORTS: AnaTool = {
  name: 'suggest_reports',
  description:
    "Suggest the best-practice reports and a preset dashboard for THIS client, grounded in their real " +
    "programs, segment, entitlement tier, and what they already run/subscribe to. Returns a ranked, " +
    "reasoned list (each with a plain-language why) plus a ready-to-save preset dashboard spec of " +
    "governed report panels. Locked-but-relevant reports are surfaced with the tier that unlocks them, " +
    "never as available picks. AnA proposes; the numbers come only when each report is generated. " +
    "Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      persona: { type: 'string', description: 'Optional persona lens (e.g. executive, ra_lead, qa).' },
    },
    required: [],
  },
};

export const SAVE_REPORT_DEFINITION: AnaTool = {
  name: 'save_report_definition',
  description:
    'Save an AnA-authored dashboard/report canvas: a titled, ordered set of governed report-type panels. ' +
    'Every panel is validated against the report catalog + the org entitlement tier before saving — an ' +
    'unknown or un-entitled panel is rejected with the reason. Use after the user approves a suggested or ' +
    'assembled dashboard so it persists and can be re-opened. Tenant-scoped.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The dashboard/report title.' },
      description: { type: 'string', description: 'Optional description.' },
      persona: { type: 'string', description: 'Optional persona lens the canvas was framed for.' },
      panels: {
        type: 'array',
        description: 'Ordered governed panels.',
        items: {
          type: 'object',
          properties: {
            report_type_id: { type: 'string' },
            scope_type: {
              type: 'string',
              enum: ['account', 'program', 'project', 'study', 'submission', 'document'],
            },
            scope_id: { type: 'string', description: 'Optional pinned scope id.' },
            label: { type: 'string', description: 'Optional panel label override.' },
          },
          required: ['report_type_id', 'scope_type'],
        },
      },
    },
    required: ['title', 'panels'],
  },
};

export const LIST_REPORT_DEFINITIONS: AnaTool = {
  name: 'list_report_definitions',
  description:
    "List the org's saved report dashboards/canvases (title, kind, origin, persona, panel count). Use to " +
    'let the user re-open or extend a dashboard they saved earlier. Tenant-scoped, read-only.',
  input_schema: { type: 'object', properties: {}, required: [] },
};

const LIST_FDA_FORMS: AnaTool = {
  name: 'list_fda_forms',
  description: 'List forms from the existing canonical FDA registry for project selection, including implementation and release-readiness status.',
  input_schema: { type: 'object', properties: {
    category: { type: 'string' }, implementationStatus: { type: 'string', enum: ['metadata', 'full'] },
  } },
};

const PREPARE_FDA_FORM: AnaTool = {
  name: 'prepare_fda_form',
  description: 'Use the existing universal FDAFormGenerator to prepare any registered FDA form as a structured editable draft for Document Studio. Does not approve, sign, or submit.',
  input_schema: { type: 'object', properties: {
    formId: { type: 'string' }, values: { type: 'object' }, reasonForChange: { type: 'string' },
  }, required: ['formId'] },
};

const AMEND_FDA_FORM: AnaTool = {
  name: 'amend_fda_form',
  description: 'Use the existing universal FDAFormGenerator to amend a structured FDA form into a new Document Studio draft. Requires a reason and never mutates an approved version.',
  input_schema: { type: 'object', properties: {
    formId: { type: 'string' }, currentValues: { type: 'object' }, changes: { type: 'object' }, reasonForChange: { type: 'string' },
  }, required: ['formId', 'currentValues', 'changes', 'reasonForChange'] },
};

// Exported for the registry-consistency suite only: ALL_ANA_TOOLS is deduped,
// so a duplicate-name assertion against it can never fail. Tests assert against
// this pre-dedupe array to catch collisions at source.
export const ALL_ANA_TOOLS_RAW: AnaTool[] = [
  LIST_FDA_FORMS,
  PREPARE_FDA_FORM,
  AMEND_FDA_FORM,
  LIST_VAULT_DOCUMENTS,
  READ_VAULT_DOCUMENT,
  GET_DOCUMENT_VERSIONS,
  LIST_GOVERNED_DOCUMENTS,
  READ_GOVERNED_DOCUMENT,
  GET_TMF_VIEW,
  LIST_REPORT_TYPES,
  GET_PORTFOLIO_READINESS,
  GENERATE_REPORT,
  EXPLAIN_REPORT_BLOCKERS,
  SUGGEST_REPORTS,
  SAVE_REPORT_DEFINITION,
  LIST_REPORT_DEFINITIONS,
  SAVE_DOCUMENT_TO_VAULT,
  UPDATE_VAULT_DOCUMENT,
  COMPARE_VAULT_VERSIONS,
  SEED_TMF,
  UPDATE_TMF_ARTIFACT_STATUS,
  SEARCH_ALL_DOCUMENTS,
  GET_PLAN_USAGE,
  GET_BILLING_CREDITS,
  GET_ORG_CAPABILITIES,
  RECONCILE_DOSSIER_NUMBERS,
  GENERATE_SCHEDULE_OF_EVENTS,
  AMEND_SCHEDULE_OF_EVENTS,
  REVIEW_SCHEDULE_OF_EVENTS_HEALTH,
  RESET_PROJECT_GOALS,
  LIST_PLATFORM_COMMANDS,
  EXECUTE_PLATFORM_COMMAND,
  SEARCH_CHEMBL_COMPOUND,
  SCREEN_COMPOUND_LIABILITIES,
  SEARCH_PREPRINTS,
  ASSESS_TRIAL_FEASIBILITY,
  SEARCH_CLINICAL_EVIDENCE,
  SEARCH_LITERATURE,
  RECORD_LITERATURE,
  SEARCH_MEDICARE_COVERAGE,
  SEARCH_CONNECTED_REPOSITORIES,
  SEARCH_REGULATORY_CORRESPONDENCE,
  CREATE_CALENDAR_EVENT,
  SEARCH_CRM,
  SEARCH_IVD_KNOWLEDGE,
  SEARCH_DEVICE_RECALLS,
  SEARCH_DRUG_LABELS,
  SEARCH_DRUG_APPROVALS,
  ASSESS_REGULATORY_LANDSCAPE,
  LOOKUP_ICD10_CODE,
  DRAFT_SAFETY_NARRATIVE,
  NARRATE_STATISTICAL_RESULT,
  VALUE_DOSSIER_GUIDANCE,
  ADVISE_REGULATORY_PATHWAY,
  ADVISE_RISK_MANAGEMENT,
  RUN_RBM_ASSESSMENT,
  ASSESS_SITE_RISK,
  EVALUATE_KRIS_QTLS,
  GENERATE_RBM_PLAN,
  PRIORITIZE_MONITORING_QUERIES,
  RUN_CENTRAL_MONITORING,
  SCAN_PATIENT_PROFILES,
  GENERATE_RBM_REPORT,
  GET_RBM_ATTENTION,
  // RBM actuation (conversation replaces forms) — see rbm-actuator.ts.
  ADD_CTQ_FACTOR,
  DEFINE_KRI,
  RECORD_KRI_READING,
  SET_QTL,
  RAISE_MONITORING_SIGNAL,
  TRIAGE_SIGNAL,
  DRAFT_MONITORING_PLAN,
  CREATE_MONITORING_ACTION,
  UPDATE_MONITORING_ACTION,
  APPROVE_RBM_ASSESSMENT,
  APPROVE_RBM_PLAN,
  ADVISE_GCP,
  REVIEW_INFORMED_CONSENT,
  ADVISE_COA_SELECTION,
  ADVISE_CTD_STRUCTURE,
  ADVISE_SPECIAL_DESIGNATION,
  PLAN_ORPHAN_DRUG_DESIGNATION,
  PLAN_IND_MODULE_AUTHORING,
  ADVISE_ESTIMAND,
  ADVISE_PHARMACOVIGILANCE,
  ADVISE_STUDY_DESIGN,
  ADVISE_LABELING_STRUCTURE,
  PLAN_LABELING_AUTHORING,
  ADVISE_MEDICAL_INFORMATION,
  ADVISE_REPORTING_GUIDELINE,
  ADVISE_DATA_INTEGRITY,
  ADVISE_RWE_DESIGN,
  SCREEN_PROMOTIONAL_LANGUAGE,
  MEDICAL_WRITING_GUIDANCE,
  MEDICAL_WRITING_REVIEW,
  ASSESS_READABILITY,
  BUILD_ABBREVIATION_LIST,
  DESCRIBE_CAPABILITIES,
  PROJECT_KNOWLEDGE_SEARCH,
  PROJECT_KNOWLEDGE_SEARCH_MULTI,
  SEARCH_LARGE_DOCUMENT,
  REMEMBER_DOCUMENT_IN_PROJECT,
  RUN_SUBMISSION_PREMORTEM,
  ASSEMBLE_CRL_PREMORTEM_ARTIFACT,
  ASSEMBLE_BRIEFING_BOOK,
  ASSESS_OUTPUT_CONFIDENCE,
  CHECK_GROUNDING,
  RENDER_SIGNATURE_MANIFESTATION,
  SCAN_REGULATORY_DEFICIENCIES,
  RECALL_SESSION_CONTEXT,
  SIMULATE_STUDY_DESIGN,
  SEARCH_DEVICE_ADVERSE_EVENTS,
  SEARCH_DRUG_ADVERSE_EVENTS,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  CHECK_REGULATORY_COMPLIANCE,
  VALIDATE_CROSS_REFERENCES,
  GENERATE_CITATION,
  LOOKUP_REGULATORY_PRECEDENTS,
  COMPARE_SUBMISSION_AGAINST_PRECEDENT,
  ASSESS_CLAIM_EVIDENCE_INTEGRITY,
  SIMULATE_REVIEWER_CHALLENGES,
  PREDICT_CHANGE_IMPACT,
  FETCH_TEMPLATE_AND_FILL,
  AUTHOR_DOCX_NATIVE,
  CONVERT_DOCX_TO_PDF,
  RUN_PYTHON_SCRIPT,
  INSERT_DOCUMENT_CONTENT,
  SURGICAL_DOCX_XML_EDIT,
  VERIFY_DOCX_AGAINST_SOURCE,
  INSERT_CLAUSE_TEMPLATE,
  VALIDATE_DOCX,
  RUN_IN_CONTAINER,
  WRITE_KIT_SECTION,
  CREATE_Q_SUB,
  UPDATE_Q_SUB_COMMITMENT_ROLLED_IN,
  LINK_PROGRAM_CLINICAL_STUDY,
  SET_PROGRAM_METADATA,
  WRITE_Q_SUB_SECTION,
  CREATE_UDI_RECORD,
  CREATE_RISK_ITEM,
  ADD_RISK_CONTROL,
  CREATE_SOFTWARE_LIFECYCLE_ITEM,
  RECORD_ANALYTICAL_PERFORMANCE_STUDY,
  RECORD_CLINICAL_PERFORMANCE_STUDY,
  CLASSIFY_IVD_DEVICE,
  CREATE_PER_DOCUMENT,
  CATEGORIZE_CLIA_COMPLEXITY,
  PAIR_COMPANION_DIAGNOSTIC,
  REGISTER_LDT,
  PACKAGE_ECTD_FOR_REGION,
  TRANSMIT_SUBMISSION,
  CHECK_SUBMISSION_STATUS,
  GET_SUBMISSION_ACK,
  RECORD_VALIDATION_FINDING,
  RESOLVE_VALIDATION_FINDING,
  GATEWAY_CONFIGURATION_STATUS,
  COMPUTE_LIFECYCLE_OPERATIONS,
  CONVERT_TO_RPS_V4,
  GENERATE_STF,
  CHECK_ECTD_CROSS_REFERENCES,
  CLASSIFY_SUBMISSION_DOCUMENT,
  EXTRACT_SUBMISSION_DOCUMENT,
  RUN_SHADOW_REVIEW,
  VALIDATE_ECTD_PACKAGE,
  PLAN_SUBMISSION,
  EXPLAIN_VALIDATION_FINDINGS,
  CROSS_REGION_GAP_ANALYSIS,
  DISPATCH_QC_CHECK,
  TRACE_PROVENANCE,
  CHECK_CONSISTENCY,
  ASSESS_PATHWAY_READINESS,
  BUILD_PATHWAY_MANIFEST,
  LIST_VALIDATION_RULES,
  LOOKUP_REGULATORY_PATHWAY,
  RESOLVE_REGULATORY_STRUCTURE,
  GET_MARKET_SUBMISSION_SPEC,
  GET_DOCUMENT_TEMPLATE,
  VALIDATE_MARKET_FORMATTING,
  GET_SUBMISSION_REQUIREMENTS,
  ASSESS_PATHWAY_ELIGIBILITY,
  CLASSIFY_POST_SUBMISSION_CHANGE,
  ASSESS_DEVICE_EVIDENCE_STRUCTURE,
  CLASSIFY_DEVICE,
  GET_DEVICE_REVIEWER_CHECKLIST,
  GET_BIOCOMPATIBILITY_ENDPOINTS,
  BUILD_DEVICE_BLUEPRINT,
  ASSESS_STORED_CER,
  BUILD_GLOBAL_DEVICE_STRATEGY,
  GET_REGULATORY_TIMELINE,
  VALIDATE_UDI,
  GET_ELECTRICAL_STANDARDS,
  GET_STERILIZATION_REQUIREMENTS,
  ASSESS_COMBINATION_PRODUCT,
  GET_DEVICE_LABELING,
  ASSESS_QMS,
  LIST_REGULATORY_CAPABILITIES,
  ASSESS_DISPATCH_READINESS,
  PLACE_INTO_SEQUENCE,
  FIRE_NOTIFICATION,
  CREATE_CLINICAL_STUDY,
  CREATE_CLINICAL_INVESTIGATOR,
  CREATE_FINANCIAL_DISCLOSURE,
  ADD_DISCLOSURE_INTEREST,
  REVIEW_FINANCIAL_DISCLOSURE,
  CREATE_HA_INTERACTION,
  CREATE_REGULATORY_COMMITMENT,
  REVIEW_COMMITMENT_PORTFOLIO,
  CREATE_IACUC_PROTOCOL,
  REGISTER_ANIMAL_COHORT,
  REVIEW_IACUC_PROTOCOL,
  CREATE_IRB_SUBMISSION,
  ADD_IRB_SITE,
  REVIEW_IRB_SUBMISSION,
  CREATE_IBC_REGISTRATION,
  ADD_BIOLOGICAL_AGENT,
  REVIEW_IBC_REGISTRATION,
  CREATE_NONCLINICAL_STUDY,
  REVIEW_SEND_READINESS,
  CREATE_PROTOCOL_DOCUMENT,
  UPDATE_PROTOCOL_SECTION,
  ADD_PROTOCOL_OBJECTIVE,
  ADD_ELIGIBILITY_CRITERION,
  REVIEW_PROTOCOL_COMPLETENESS,
  FINALIZE_PROTOCOL_DOCUMENT,
  ADD_PROTOCOL_RISK,
  REVIEW_PROTOCOL_RISK_REGISTER,
  CREATE_PROTOCOL_TEMPLATE,
  CLONE_PROTOCOL_TEMPLATE,
  SAVE_DOCUMENT_AS_TEMPLATE,
  LIST_PROTOCOL_TEMPLATES,
  ADD_PROTOCOL_MILESTONE,
  SET_PROTOCOL_MILESTONE_STATUS,
  REVIEW_PROTOCOL_TIMELINE,
  EXPORT_PROTOCOL_DOCUMENT,
  GENERATE_CTGOV_REGISTRATION_DRAFT,
  ADD_SOA_ASSESSMENT,
  SET_SOA_CELL,
  REVIEW_SOA_MATRIX,
  ADD_PROTOCOL_BUDGET_ITEM,
  SET_PROTOCOL_BUDGET_PARAMS,
  REVIEW_PROTOCOL_BUDGET,
  CREATE_PROTOCOL_AMENDMENT,
  ADD_AMENDMENT_CHANGE,
  REVIEW_AMENDMENT,
  REPORT_PROTOCOL_DEVIATION,
  ADD_CAPA_ACTION,
  REVIEW_DEVIATION,
  ASSIGN_PROTOCOL_REVIEWER,
  ADD_PROTOCOL_REVIEW_COMMENT,
  REVIEW_PROTOCOL_REVIEW_STATUS,
  CREATE_CONSENT_FORM,
  UPDATE_CONSENT_ELEMENT,
  REVIEW_CONSENT_COMPLETENESS,
  CREATE_DMS_PLAN,
  UPDATE_DMS_PLAN_ELEMENT,
  REVIEW_DMS_PLAN_COMPLETENESS,
  FINALIZE_DMS_PLAN,
  CREATE_OTHER_SUPPORT,
  ADD_OTHER_SUPPORT_ENTRY,
  REVIEW_OTHER_SUPPORT,
  CERTIFY_OTHER_SUPPORT,
  CREATE_BIOSKETCH,
  UPDATE_BIOSKETCH_SECTION,
  REVIEW_BIOSKETCH_COMPLETENESS,
  FINALIZE_BIOSKETCH,
  CREATE_INVENTION_DISCLOSURE,
  UPDATE_INVENTION_DISCLOSURE,
  REVIEW_INVENTION_DISCLOSURE,
  SUBMIT_INVENTION_DISCLOSURE,
  CREATE_EXPORT_CONTROL_REVIEW,
  UPDATE_EXPORT_CONTROL_REVIEW,
  REVIEW_EXPORT_CONTROL,
  FINALIZE_EXPORT_CONTROL_DETERMINATION,
  CREATE_RESEARCH_AGREEMENT,
  UPDATE_RESEARCH_AGREEMENT,
  REVIEW_RESEARCH_AGREEMENT,
  EXECUTE_RESEARCH_AGREEMENT,
  IMPORT_CITI_RECORDS,
  REVIEW_TRAINING_MATRIX,
  REVIEW_EXPIRING_TRAINING,
  REVIEW_PROTOCOL_PORTFOLIO_ANALYTICS,
  SET_FUNDING_PROFILE,
  FIND_GRANT_OPPORTUNITIES,
  ASSIGN_COMMITTEE_MEMBER,
  CONVENE_COMMITTEE_MEETING,
  ADD_COMMITTEE_AGENDA_ITEM,
  CAST_COMMITTEE_VOTE,
  FINALIZE_COMMITTEE_DETERMINATION,
  REVIEW_PROTOCOL_PORTFOLIO,
  CREATE_COVERAGE_ANALYSIS,
  SET_COVERAGE_QUALIFYING_DETERMINATION,
  ADD_COVERAGE_ITEM,
  CLASSIFY_COVERAGE_ITEM,
  REVIEW_COVERAGE_ANALYSIS,
  CREATE_GRANT_PROPOSAL,
  RECORD_GRANT_AWARD,
  REVIEW_GRANT_REPORTING,
  SET_GRANT_MILESTONE_STATUS,
  OPEN_GRANT_CLOSEOUT,
  UPDATE_GRANT_CLOSEOUT,
  FINALIZE_GRANT_CLOSEOUT,
  RECORD_SUBAWARD,
  SCREEN_SUBAWARD,
  EXECUTE_SUBAWARD,
  ADD_GRANT_BUDGET_LINE,
  RECORD_GRANT_EXPENDITURE,
  REVIEW_GRANT_BUDGET,
  RECORD_COST_SHARE_CONTRIBUTION,
  REVIEW_COST_SHARE,
  REQUEST_NO_COST_EXTENSION,
  APPROVE_NO_COST_EXTENSION,
  RECORD_GRANT_OPPORTUNITY,
  PREPARE_AWARD_CLOSEOUT,
  RESEARCH_COMPLIANCE_BRIEFING,
  TRIAGE_COMPLIANCE_ATTENTION,
  FULFILL_REGULATORY_COMMITMENT,
  REVIEW_HA_INTERACTION,
  PREPARE_MEETING_PACKAGE,
  REGISTER_CONTROLLED_SUBSTANCE,
  CREATE_RIM_PRODUCT,
  SET_REGISTRATION_STATUS,
  REVIEW_LABEL_CURRENCY,
  CREATE_INSPECTION,
  LOG_INSPECTION_FINDING,
  REVIEW_INSPECTION_READINESS,
  REGISTER_DEA,
  LOG_CS_TRANSACTION,
  REVIEW_CS_BALANCE,
  CREATE_LIFECYCLE_OBLIGATION,
  REVIEW_LIFECYCLE_CALENDAR,
  CREATE_TMF,
  CLASSIFY_TMF_ARTIFACT,
  REVIEW_TMF_COMPLETENESS,
  RUN_COMPLIANCE_CHECKLIST,
  ASSESS_STUDY_ONBOARDING,
  ADD_PERSONNEL_TRAINING,
  REVIEW_TRAINING_GATE,
  CREATE_EFFORT_CERTIFICATION,
  ADD_EFFORT_LINE,
  CREATE_COI_DISCLOSURE,
  SEARCH_GRANTS_GOV,
  SCREEN_RESTRICTED_PARTY,
  LOG_STUDY_DEVIATION,
  LOG_STUDY_AE,
  RECORD_ENDPOINT_RESULT,
  VERIFY_MEMORY_ATOM,
  CREATE_QMS_DOCUMENT,
  APPROVE_QMS_DOCUMENT,
  REVISE_QMS_DOCUMENT,
  RETIRE_QMS_DOCUMENT,
  ACK_TRAINING,
  REGISTER_SUPPLIER,
  LOG_NONCONFORMING_PRODUCT,
  QMS_CHANGE_CREATE,
  QMS_CHANGE_TRANSITION,
  QMS_CHANGE_LINK,
  SEARCH_CLINICAL_REGULATORY_EVIDENCE,
  COMPARE_PROPOSED_DESIGN_TO_PRECEDENT,
  EXPLAIN_DESIGN_RISK,
  STRESS_TEST_PROTOCOL,
  TRACE_DESIGN_RECOMMENDATION,
  PROJECT_CSR_EVIDENCE,
  CREATE_LABELING_DOCUMENT,
  ADD_LABELING_TRANSLATION,
  ADD_LABELING_SYMBOL,
  GLOBAL_SEARCH,
  START_LEGACY_IMPORT,
  OVERRIDE_IMPORT_MAPPING,
  APPROVE_IMPORT,
  ASSEMBLE_ECTD_MODULE_FROM_ARTIFACTS,
  DRAFT_510K_SUBSTANTIAL_EQUIVALENCE,
  DRAFT_CLINICAL_OVERVIEW_M2_5,
  BATCH_DRAFT_SECTIONS,
  CONVENE_DRAFTING_COUNCIL,
  GET_CLIENT_JOURNEY,
  GET_BIOTECH_PROGRAM_STATUS,
  COMMIT_DOCUMENT_REVISION,
  START_DEEP_INVESTIGATION,
  CHECK_DEEP_INVESTIGATION,
  DRAFT_FDA_IR_RESPONSE,
  ANALYZE_PREDICATE_DEVICE,
  EXTRACT_DOCUMENT_STRUCTURE,
  COMPARE_DOCUMENT_VERSIONS,
  SEARCH_DOCUMENT,
  INSPECT_UPLOADED_DOCUMENT,
  READ_UPLOADED_DOCUMENT,
  OCR_DOCUMENT_PAGES,
  READ_SPREADSHEET,
  EDIT_SPREADSHEET,
  LIST_PROJECT_DOCUMENTS,
  READ_PROJECT_DOCUMENT,
  CATALOG_PROJECT_DOCUMENT,
  SEARCH_PROJECT_DOCUMENTS,
  CHECK_DOSSIER_CONSISTENCY,
  CHECK_NUMERICAL_INTEGRITY,
  COMPUTE_SAMPLE_SIZE,
  COMPARE_STATISTICAL_SCENARIOS,
  ASSESS_STATISTICAL_DEFENSIBILITY,
  ANALYZE_MISSING_DATA_IMPACT,
  GENERATE_STATISTICAL_DOCUMENT,
  COMPUTE_FIH_DOSE,
  CLASSIFY_TOX_FINDINGS,
  SELECT_EXPOSURE_RESPONSE_DOSE,
  LOAD_NONCLINICAL_PROGRAM,
  GET_NONCLINICAL_TEMPLATE,
  GET_CSR_TEMPLATE,
  DRAFT_NONCLINICAL_OVERVIEW_M2_4,
  DRAFT_QUALITY_OVERALL_SUMMARY_M2_3,
  DRAFT_NONCLINICAL_SUMMARIES_M2_6,
  ASSESS_NONCLINICAL_PROGRAM,
  ASSESS_NONCLINICAL_SAFETY,
  ASSESS_CONCENTRATION_QTC,
  ASSESS_DDI_RISK,
  CHARACTERIZE_PK,
  DRAFT_CLINICAL_SUMMARY_M2_7,
  ASSESS_ANALYTICAL_SIMILARITY,
  ASSESS_COMPARABILITY,
  ASSESS_IMMUNOGENICITY,
  ASSESS_BLA_FILING_RISK,
  GENERATE_SOP,
  RESOLVE_SUBMISSION_PLAN,
  GET_CTD_MODULE_HOME,
  MINE_PRECEDENTS,
  GENERATE_DOCUMENT,
  BUILD_FROM_TEMPLATE,
  IND_GENERATE_SECTION,
  IND_GET_STATUS,
  RASTERIZE_PAGE,
  PDF_OVERLAY,
  // AnA device/IVD + global-market advisory (grounded, non-LLM; honest about
  // assemble/transmit limits). Handlers registered in AnaToolExecutor; specs
  // authored in services/ana-advisory.
  ...(ANA_ADVISORY_TOOL_SPECS as unknown as AnaTool[]),
  SUBMISSION_PLAN_TOOL_SPEC as unknown as AnaTool,
  PMA_ADVISORY_TOOL_SPEC as unknown as AnaTool,
  EU_TECHDOC_TOOL_SPEC as unknown as AnaTool,
  IVD_KNOWLEDGE_TOOL_SPEC as unknown as AnaTool,
  // Global-RI deterministic expert tools (registry-grounded, no LLM, no
  // fabrication). Specs authored in services/global-ri/ana-tools; handlers
  // loop-registered in AnaToolExecutor.
  ...(GLOBAL_RI_TOOL_SPECS as unknown as AnaTool[]),
  // Bioequivalence & generic drug intelligence (BCS, BE study design, dissolution,
  // biowaiver, ANDA/505(b)(2) pathway). Deterministic registry lookups.
  ...BIOEQUIVALENCE_TOOLS,
  // Pharmacometrics intelligence (PopPK, PBPK, exposure-response, MIDD, dose
  // selection). Deterministic knowledge base.
  ...PHARMACOMETRICS_TOOLS,
  // Preclinical toxicology intelligence (species selection, repeat-dose design,
  // safety margins, genotoxicity, carcinogenicity, reproductive tox). Deterministic.
  ...TOXICOLOGY_TOOLS,
  // Pediatric development intelligence (age classification, PIP/PSP, extrapolation,
  // formulation, dose selection, regulatory requirements). Deterministic.
  ...PEDIATRIC_TOOLS,
  // Advanced therapy (ATMP/CGT) intelligence (classification, gene therapy, cell
  // therapy manufacturing, CAR-T, pathway selection, comparability). Deterministic.
  ...ADVANCED_THERAPY_TOOLS,
  // Real-world evidence methodology intelligence (target trial emulation, data
  // source scoring, propensity scores, study design, bias, regulatory). Deterministic.
  ...RWE_METHODOLOGY_TOOLS,
  // Wave 2 — Clinical pharmacology intelligence (DDI risk, QTc/E14-S7B, organ
  // impairment, CYP phenotype, bioanalytical method, food effect). Deterministic.
  ...CLINICAL_PHARMACOLOGY_TOOLS,
  // Wave 2 — CMC quality intelligence (stability, analytical validation, impurity
  // classification, specifications, process validation, comparability). Deterministic.
  ...CMC_QUALITY_TOOLS,
  // Wave 2 — Regulatory strategy intelligence (expedited programs, FDA meetings,
  // orphan designation, 505 pathway, rolling submission, global pathways). Deterministic.
  ...REGULATORY_STRATEGY_TOOLS,
  // Wave 2 — Biosimilar development intelligence (analytical similarity, clinical
  // program, extrapolation, interchangeability, IP strategy, CMC). Deterministic.
  ...BIOSIMILAR_TOOLS,
  // Wave 2 — Mutagenic impurity intelligence (ICH M7 classification, TTC, structural
  // alerts, purge study, nitrosamine risk, control strategy). Deterministic.
  ...MUTAGENIC_IMPURITY_TOOLS,
  // Wave 2 — Labeling intelligence (PLR structure, boxed warning, REMS, PLLR,
  // EU SmPC, OTC Drug Facts). Deterministic.
  ...LABELING_INTELLIGENCE_TOOLS,
  // Wave 3 — Immunogenicity intelligence (risk assessment, ADA/NAb assay
  // strategy, clinical impact, sampling, comparability). FDA 2019 / EMA. Deterministic.
  ...IMMUNOGENICITY_TOOLS,
  // Wave 3 — Safety pharmacology intelligence (ICH S7A core battery: CV/CNS/
  // respiratory, follow-up studies, abuse liability). Deterministic.
  ...SAFETY_PHARMACOLOGY_TOOLS,
  // Wave 3 — Pharmacovigilance & signal detection (ICH E2A-E2F, causality,
  // disproportionality, signal priority, PV system). Deterministic.
  ...PHARMACOVIGILANCE_TOOLS,
  // Wave 3 — Clinical outcome assessment / PRO (COA type, validation, meaningful
  // change, fit-for-purpose, endpoint positioning, development plan). Deterministic.
  ...COA_PRO_TOOLS,
  // Wave 3 — Oncology dose optimization (Project Optimus: dose-finding design,
  // alignment, randomized comparison, RP2D, backfill, exposure-response). Deterministic.
  ...DOSE_OPTIMIZATION_TOOLS,
  // Wave 3 — Combination products & device constituent (PMOA, classification,
  // cGMP, human factors, design controls, submission pathway). Deterministic.
  ...COMBINATION_PRODUCTS_TOOLS,
  // Wave 4 — Clinical trial statistics & estimands (ICH E9(R1) estimands,
  // intercurrent events, multiplicity, adaptive, missing data, sample size). Deterministic.
  ...TRIAL_STATISTICS_TOOLS,
  // Wave 4 — GMP quality systems & data integrity (ICH Q7, ALCOA+, CAPA,
  // deviations, Annex 1 sterile, computer system validation). Deterministic.
  ...GMP_QUALITY_SYSTEMS_TOOLS,
  // Wave 4 — Nonclinical PK/ADME & toxicokinetics (ADME program, mass balance,
  // metabolite safety/MIST, TK, reaction phenotyping, protein binding). Deterministic.
  ...NONCLINICAL_ADME_TOOLS,
  // Wave 4 — Biomarkers & companion diagnostics (BEST classification, qualification,
  // CDx co-development, analytical/clinical validation, enrichment). Deterministic.
  ...BIOMARKER_TOOLS,
  // Wave 4 — Rare disease & external control arms (natural history, external
  // controls, small-population design, Bayesian borrowing, endpoints). Deterministic.
  ...RARE_DISEASE_TOOLS,
  // Wave 4 — GCP & clinical trial operations (risk-based monitoring, inspection
  // readiness, GCP compliance, informed consent, deviations, TMF). Deterministic.
  ...GCP_OPERATIONS_TOOLS,
  // Wave 5 — Medical device & IVD regulatory (classification, pathway, substantial
  // equivalence, clinical evidence, essential principles/GSPR, submission). Deterministic.
  ...MEDICAL_DEVICE_TOOLS,
  // Wave 5 — Digital health, SaMD & AI/ML devices (IMDRF SaMD class, AI/ML, PCCP,
  // GMLP, SaMD clinical validation, premarket cybersecurity). Deterministic.
  ...DIGITAL_HEALTH_TOOLS,
  // Wave 5 — Vaccine development (CMC, correlate of protection, clinical program,
  // lot consistency, platform technology, special populations). Deterministic.
  ...VACCINE_TOOLS,
  // Wave 5 — Structured benefit-risk (FDA BR framework, effects table, balance,
  // value tree, uncertainty, communication). Deterministic.
  ...BENEFIT_RISK_TOOLS,
  // Wave 5 — Post-approval lifecycle / ICH Q12 (change classification, established
  // conditions, PACMP, annual report, comparability, lifecycle plan). Deterministic.
  ...POST_APPROVAL_TOOLS,
  // Inference self-awareness: classify a tool's output by determinism pedigree
  // (deterministic_registry / deterministic_query / external_api_live /
  // model_assisted) so AnA can weight bulletproof registry facts above
  // model-assisted narrative. Handler registered in AnaToolExecutor.
  {
    name: 'ana_tool_pedigree',
    description:
      'Determinism pedigree of AnA tools: how trustworthy a tool\'s output is. Pass a tool name to classify it ' +
      '(deterministic_registry = bulletproof registry lookup; external_api_live = authoritative but time-varying; ' +
      'model_assisted = verify before relying), or omit it to list the pedigree levels and the known deterministic tools. ' +
      'Use this to decide whether a claim can be stated as fact or must be flagged for verification.',
    input_schema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Optional tool name to classify. Omit to list levels + deterministic tools.' },
      },
    },
  } as unknown as AnaTool,
  // Evidence self-check: deterministically flag contradictions across gathered
  // evidence claims (numeric mismatch / opposing polarity) BEFORE synthesis.
  // Handler registered in AnaToolExecutor.
  {
    name: 'detect_evidence_contradictions',
    description:
      'Deterministically flag contradictions across gathered evidence (no LLM): same-subject numeric mismatches and ' +
      'opposing positive/negative assertions. Pass structured claims (subject required; optional metric/value/polarity/date). ' +
      'Use before stating a synthesized conclusion to catch self-contradicting sources.',
    input_schema: {
      type: 'object',
      properties: {
        claims: {
          type: 'array',
          description: 'Structured evidence claims to cross-check.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              subject: { type: 'string', description: 'Entity the claim is about (required to pair claims).' },
              metric: { type: 'string' },
              value: { type: 'number' },
              unit: { type: 'string' },
              polarity: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
              date: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['subject'],
          },
        },
        relativeTolerance: { type: 'number', description: 'Optional relative tolerance for numeric-mismatch detection (default 0.1).' },
      },
      required: ['claims'],
    },
  } as unknown as AnaTool,
  // Evidence sufficiency: deterministically detect coverage gaps (geographic /
  // population / outcome / temporal) so AnA offers to search further rather than
  // answer on partial data. Handler registered in AnaToolExecutor.
  {
    name: 'detect_evidence_gaps',
    description:
      'Deterministically detect what the gathered evidence is MISSING relative to the question (no LLM): geographic, ' +
      'population, outcome, and temporal/recency gaps. Returns gaps with suggested follow-up queries. Use to decide whether ' +
      'to answer now or first offer to broaden the search.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          description: 'What the answer should cover.',
          properties: {
            regions: { type: 'array', items: { type: 'string' }, description: 'Regions the answer should cover.' },
            population: { type: 'string', description: 'Population the answer should cover (e.g. pediatric).' },
            outcomeTypes: { type: 'array', items: { type: 'string', enum: ['efficacy', 'safety'] }, description: 'Outcome types required.' },
            recencyYears: { type: 'number', description: 'Evidence should include something within this many years of asOfYear.' },
            asOfYear: { type: 'number', description: 'Reference year for recency (required if recencyYears is set).' },
          },
        },
        evidence: {
          type: 'array',
          description: 'The gathered evidence items.',
          items: {
            type: 'object',
            properties: {
              region: { type: 'string' },
              population: { type: 'string' },
              outcomeType: { type: 'string', enum: ['efficacy', 'safety', 'other'] },
              year: { type: 'number' },
            },
          },
        },
      },
      required: ['query', 'evidence'],
    },
  } as unknown as AnaTool,
  // Submission deficiency taxonomy lookup: surface likely reviewer deficiencies,
  // their reviewer language, mitigations, and references for a submission type.
  // Handler wraps the deterministic deficiency-taxonomy (no LLM, no fabrication).
  {
    name: 'lookup_submission_deficiencies',
    description:
      'Look up the curated taxonomy of likely reviewer deficiencies for a submission type ' +
      '(ind, nda, bla, 510k, pma, de_novo, cer, ectd, general). Returns each deficiency with severity, ' +
      'likelihood, common reviewer language, concrete mitigations, and regulatory references. Use ' +
      'proactively to pre-empt agency findings and to ground "what could go wrong / how to prevent it" ' +
      'advice for the user\'s pathway. Set critical_only to focus on the highest-severity items.',
    input_schema: {
      type: 'object',
      properties: {
        submission_type: {
          type: 'string',
          enum: ['ind', 'nda', 'bla', '510k', 'pma', 'de_novo', 'cer', 'ectd', 'general'],
          description: 'The regulatory submission type to look up deficiencies for.',
        },
        critical_only: {
          type: 'boolean',
          description: 'When true, return only CRITICAL-severity deficiencies.',
        },
      },
      required: ['submission_type'],
    },
  } as unknown as AnaTool,
  // Regulatory deadline radar: aggregate the org's regulatory obligations /
  // commitments into overdue / due-soon / upcoming buckets. Handler is tenant-
  // scoped from context; deterministic (no LLM, no fabrication).
  {
    name: 'regulatory_deadline_radar',
    description:
      'Surface the active organization\'s regulatory deadlines (from tracked regulatory ' +
      'obligations & agency commitments): what is OVERDUE, DUE SOON, and UPCOMING, sorted by ' +
      'urgency, each with agency, obligation type, priority, days-until-due, legal basis, and the ' +
      'consequence of non-compliance. Use proactively to open a session, answer "what\'s due?", or ' +
      'flag time-critical risk. Scoped to the user\'s organization automatically.',
    input_schema: {
      type: 'object',
      properties: {
        window_days: {
          type: 'number',
          description: 'Days ahead that count as "due soon" (default 30, max 365).',
        },
        include_completed: {
          type: 'boolean',
          description: 'When true, also include completed/cancelled obligations (default false).',
        },
      },
    },
  } as unknown as AnaTool,
  // Governed correspondence response package: deterministic assembly of an
  // issue matrix, evidence checklist, and readiness state from structured,
  // already-parsed agency-correspondence issues. Complements draft_fda_ir_response
  // (which scaffolds from raw IR text); this works on tracked/structured issues
  // and gates readiness on evidence gaps. Handler wraps the deterministic
  // response-package compiler — no LLM, no fabrication.
  {
    name: 'compile_correspondence_response_package',
    description:
      'Assemble a GOVERNED response package for a health-authority correspondence (FDA IR, EMA LoQ/RSI, ' +
      'PMDA inquiry) from already-structured issues: returns a per-issue matrix (category, severity, ' +
      'blocker, impacted CTD sections, artifacts), an evidence checklist (each item missing/satisfied), ' +
      'unresolved gaps, and a readiness_state (evidence_gap until all evidence is satisfied, else ' +
      'review_ready). Use after issues have been identified/parsed to plan the response and see what ' +
      'still blocks sending. Deterministic — never invents evidence or marks a gap satisfied on its own.',
    input_schema: {
      type: 'object',
      properties: {
        correspondence_id: {
          type: 'string',
          description: 'Identifier for the correspondence being responded to.',
        },
        issues: {
          type: 'array',
          description: 'Structured issues extracted from the correspondence.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Issue identifier.' },
              category: { type: 'string', description: 'Issue category (e.g. cmc_quality, clinical, safety).' },
              severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              blocker: { type: 'boolean', description: 'Whether the issue blocks the submission.' },
              mappedCtdSections: { type: 'array', items: { type: 'string' }, description: 'Impacted CTD section keys.' },
              mappedArtifactIds: { type: 'array', items: { type: 'string' }, description: 'Related artifact IDs.' },
              evidenceNeeds: { type: 'array', items: { type: 'string' }, description: 'Evidence required to resolve the issue.' },
            },
            required: ['id', 'category', 'severity'],
          },
        },
        selected_issue_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional subset of issue IDs to include (default: all).',
        },
        revised_artifact_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional artifact IDs already revised in response.',
        },
      },
      required: ['correspondence_id', 'issues'],
    },
  } as unknown as AnaTool,
  // Session briefing: reconcile where the program stands right now — overdue/
  // due-soon regulatory deadlines + recent formal decisions — so AnA can open
  // with a calm situational brief. Handler is tenant-scoped from context;
  // deterministic (no LLM, no fabrication).
  {
    name: 'get_session_briefing',
    description:
      'Produce a short situational briefing for the active organization/project: overdue and due-soon ' +
      'regulatory deadlines plus the most recent formal decisions. Use to open a session ("where do things ' +
      'stand?") or whenever the user wants to re-orient. Scoped to the user\'s org/project automatically; ' +
      'deterministic — surfaces only tracked items, never invents deadlines or decisions.',
    input_schema: {
      type: 'object',
      properties: {
        decision_limit: {
          type: 'number',
          description: 'Max recent decisions to include (default 5).',
        },
        window_days: {
          type: 'number',
          description: 'Days ahead that count as "due soon" for deadlines (default 30).',
        },
      },
    },
  } as unknown as AnaTool,
  // Risk watch: surface a project's OPEN blockers (contradiction/dispatch/
  // correspondence findings) severity-first. Handler is tenant+project scoped
  // from context; deterministic (no LLM, no fabrication).
  {
    name: 'scan_project_risks',
    description:
      'List the active project\'s OPEN blockers — the live risks tracked by the platform (contradiction ' +
      'findings, dispatch-gate failures, correspondence-driven blockers) — ordered by severity ' +
      '(critical → low), each with type, owner, and next action. Use to answer "what\'s blocking us?", ' +
      'before committing to a plan, or to proactively flag risk. Scoped to the user\'s org/project ' +
      'automatically; deterministic — surfaces only tracked, open blockers, never invented ones.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max blockers to return (default 20).',
        },
      },
    },
  } as unknown as AnaTool,
  // Deterministic statistical design & analysis engines (server/services/stats/*),
  // previously implemented but unreachable by AnA. See statisticalDesignTools.ts.
  ...STATISTICAL_DESIGN_TOOLS,
  // Cross-document number reconciliation — flags figures that disagree ACROSS a
  // submission's documents (enrolled N in 2.5 ≠ 2.7.3 ≠ CSR). The cross-module
  // reconciliation check_numerical_integrity / check_dossier_consistency lack.
  ...RECONCILIATION_TOOLS,
  // Change propagation / Inconsistency Intelligence — preview the blast radius of
  // changing a governed value, apply the change under governance (flag + cascade +
  // resolution plan), trace a value to its source, and explain the resulting plan.
  ...CHANGE_PROPAGATION_TOOLS,
  // IVD lifecycle deterministic calculators — signal disproportionality, ISO
  // 17511 traceability, scientific validity, cutoff, stability, DoC, and the
  // post-market report authoring (eMDR/MIR/FSN/PSUR).
  ...IVD_LIFECYCLE_TOOLS,
  // CAPA / complaint / MDR / vigilance — the device post-market safety
  // workstream: deterministic reportability triage, the triage queue, the
  // vigilance timeline, and governed complaint/CAPA creation.
  ...CAPA_MDR_TOOLS,
  // Predicate intelligence — discover/rank candidate predicates, auto-build the
  // substantial-equivalence matrix, and read the defense preview (shadow-service
  // proxy with org→program ownership).
  ...PREDICATE_INTELLIGENCE_TOOLS,
  // Regulatory Currency Engine: curated, freshness-stamped registry of DATED facts
  // (vacated/superseded/upcoming-mandatory rules) so AnA never advises on a VOID
  // rule from its static knowledge. See regulatoryCurrencyTools.ts.
  ...REGULATORY_CURRENCY_TOOLS,
  // Submission intelligence: precedent benchmarking + package completeness.
  ...SUBMISSION_INTELLIGENCE_TOOLS,
  // Device/IVD submission assembly, predicate-adequacy scoring, drug coding —
  // engines/data sources previously unreachable by AnA. See deviceSubmissionTools.ts.
  ...DEVICE_SUBMISSION_TOOLS,
  // License-gated medical coding (MedDRA / WHODrug). Proprietary dictionaries are
  // NOT shipped: these fail closed with license_required until a licensed dictionary
  // is configured, then code deterministically over it. See codingTools.ts.
  ...CODING_TOOLS,
  // Read-only window into enterprise usage controls (weekly limits, overage, seats).
  ...LICENSE_STATUS_TOOLS,
  // Self-navigation: discover + navigate to any app screen via the governed
  // navigation registry (shared/navigation). See navigationTools.ts.
  ...NAVIGATION_TOOLS,
  // HEOR modeling, SPL labeling XML, CDISC define.xml/conformance, and reference
  // formatting — deterministic engines newly reachable by AnA. See
  // extendedRegulatoryTools.ts.
  ...EXTENDED_REGULATORY_TOOLS,
  // HEOR / market-access modeling — comparator-mix budget impact and net-monetary-
  // benefit cost-effectiveness for payer/AMCP dossiers. See heorTools.ts.
  ...HEOR_MARKET_ACCESS_TOOLS,
  // Pharmacovigilance reporting: SAE line listing + E2B(R3) ICSR composition
  // over the org's recorded adverse events. See pharmacovigilanceReportingTools.ts.
  ...PHARMACOVIGILANCE_REPORTING_TOOLS,
  // ICH Q2 analytical method-validation assessment (linearity/precision/accuracy).
  // See analyticalMethodTools.ts.
  ...ANALYTICAL_METHOD_TOOLS,
  // Advanced HEOR (Markov cohort + probabilistic sensitivity) and the full CDISC
  // pipeline. See advancedModelingTools.ts.
  ...ADVANCED_MODELING_TOOLS,
  // 510(k) cover-letter + 510(k) summary composition (tenant-scoped). See
  // coverLetterTools.ts.
  ...COVER_LETTER_TOOLS,
  // ICH Q1E shelf-life / retest-period estimation by regression. See shelfLifeTools.ts.
  ...SHELF_LIFE_TOOLS,
  // Multi-batch ICH Q1E poolability + structured benefit-risk. See deepeningTools.ts.
  ...DEEPENING_TOOLS,
  // DailyMed (NLM) published-label lookup. See dailymedTools.ts.
  ...DAILYMED_TOOLS,
  // RIM learning-loop read path: recall the org's learned regulatory patterns
  // (deterministic_query over the tenant-scoped RIM pattern store). See rimTools.ts.
  ...RIM_TOOLS,
  // RIM domain query + summarization: filter by domain/confidence/occurrences,
  // and get a high-level summary of accumulated RIM intelligence. See rimQueryTools.ts.
  ...RIM_QUERY_TOOLS,
  // Live EU/global data: EUDAMED, EMA EPAR, EU CTIS. See euDataTools.ts.
  ...EU_DATA_TOOLS,
  // CDISC SDTM/ADaM conformance + define.xml generation. See cdiscTools.ts.
  ...CDISC_TOOLS,
  // Live guidance ingestion: FDA guidance API, ICH guideline registry, freshness checks.
  // See guidanceIngestionTools.ts + ../regulatory-currency/guidance-ingestion-service.ts.
  ...GUIDANCE_INGESTION_TOOLS,
  // SPL generation + PSUR/DSUR safety-report structure. See splSafetyTools.ts.
  ...SPL_SAFETY_TOOLS,
  // Intelligence Questioning Engine — guided flows for document generation
  START_INTELLIGENCE_FLOW,
  ANSWER_INTELLIGENCE_QUESTION,
  LIST_INTELLIGENCE_FLOWS,
  // War Game Simulation — FDA auditor pressure-testing of intelligence flow output
  START_WAR_GAME,
  // Onboarding — read-only look at what a document could contribute to setup.
  SUMMARIZE_ONBOARDING_READINESS,
];

// Defensive registry guard: v2's cdiscTools.ts currently re-registers
// run_cdisc_pipeline / generate_define_xml, which also live in
// EXTENDED_REGULATORY_TOOLS — producing duplicate tool names in the raw list.
// Dedupe by name (first occurrence wins) so the ALL_ANA_TOOLS invariant holds
// regardless of upstream double-registration. Remove once the duplicate is
// resolved at source in the CDISC tools refactor.
export const ALL_ANA_TOOLS: AnaTool[] = ALL_ANA_TOOLS_RAW.filter(
  (tool, index) => ALL_ANA_TOOLS_RAW.findIndex((t) => t.name === tool.name) === index,
);

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic server-side tools (executed by Anthropic's infrastructure)
//
// These are NOT dispatched by our local AnaToolExecutor. AnA invokes
// them server-side; results arrive as content blocks in the response stream
// (web_search_tool_result, web_fetch_tool_result, etc.). No local handler
// needed — we just declare them in the tools array so AnA knows it can
// reach for them.
//
// Gated by env flags so the rollout is controllable:
//   ANA_ENABLE_WEB_SEARCH=true   — live regulatory search (fda.gov, ema.europa.eu, ich.org, ...)
//   ANA_ENABLE_WEB_FETCH=true    — retrieve actual guidance/CFR/ICH text by URL
//   ANA_ENABLE_CODE_EXECUTION=true — sandboxed Python for biostat checks and dynamic result filtering
//
// Note: web_search costs $10/1000 searches plus token costs, and must be
// admin-enabled in the Anthropic Console before it will work. Leave flags
// off by default; flip them per environment once the billing + admin
// enablement is confirmed.
// ─────────────────────────────────────────────────────────────────────────────

export const WEB_SEARCH_TOOL: AnthropicServerTool = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
  // Keep the search surface tight to sources AnA actually cites. The allowlist
  // prevents drift into low-quality web content during regulatory lookups.
  allowed_domains: [
    'fda.gov',
    'www.fda.gov',
    'accessdata.fda.gov',
    'ema.europa.eu',
    'www.ema.europa.eu',
    'ich.org',
    'www.ich.org',
    'pmda.go.jp',
    'www.pmda.go.jp',
    'mhra.gov.uk',
    'www.mhra.gov.uk',
    'tga.gov.au',
    'www.tga.gov.au',
    'canada.ca',
    'www.canada.ca',
    'iso.org',
    'www.iso.org',
    'ecfr.gov',
    'www.ecfr.gov',
    'federalregister.gov',
    'www.federalregister.gov',
    'clinicaltrials.gov',
    'pubmed.ncbi.nlm.nih.gov',
    'ncbi.nlm.nih.gov',
  ],
};

export const WEB_FETCH_TOOL: AnthropicServerTool = {
  type: 'web_fetch_20260209',
  name: 'web_fetch',
};

export const CODE_EXECUTION_TOOL: AnthropicServerTool = {
  type: 'code_execution_20260120',
  name: 'code_execution',
};

/**
 * Returns the subset of Anthropic server tools that are enabled for this
 * environment. Empty array when none are enabled — safe to spread into the
 * tools array unconditionally.
 */
export function getEnabledServerTools(): AnthropicServerTool[] {
  const enabled: AnthropicServerTool[] = [];
  if (process.env.ANA_ENABLE_WEB_SEARCH === 'true') enabled.push(WEB_SEARCH_TOOL);
  if (process.env.ANA_ENABLE_WEB_FETCH === 'true') enabled.push(WEB_FETCH_TOOL);
  if (process.env.ANA_ENABLE_CODE_EXECUTION === 'true') enabled.push(CODE_EXECUTION_TOOL);
  return enabled;
}

/**
 * Full tool surface: custom tools + any enabled Anthropic server tools.
 * Use this when building the `tools` array for a chat turn so AnA has
 * access to both layers simultaneously.
 */
export function getAllEnabledTools(): AnyAnaTool[] {
  return [...ALL_ANA_TOOLS, ...getEnabledServerTools()];
}
