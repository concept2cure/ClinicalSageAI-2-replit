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
// Document Intake, OCR & Spreadsheet Tools — read/study/OCR/edit uploaded files
// ─────────────────────────────────────────────────────────────────────────────

export const INSPECT_UPLOADED_DOCUMENT: AnaTool = {
  name: 'inspect_uploaded_document',
  description:
    'Inventory/triage an uploaded file by file_id BEFORE reading it — the first move on any large or unknown document. ' +
    'For PDFs: page count, embedded bookmarks/TOC outline, document metadata, a sampled per-page text-layer census, a ' +
    'scanned-vs-born-digital verdict, and a recommended extraction strategy (e.g. for a 1,000-page scanned binder with no ' +
    'bookmarks: sweep the top band of each page with ocr_document_pages to find section/exhibit separators cheaply, then ' +
    'full-OCR only the pages that matter). For Excel/CSV: the sheet inventory (names, dimensions, formula counts). For ' +
    'DOCX/Markdown/text: size, word count, and the heading outline. The file_id comes from a chat upload (response field ' +
    '`fileId`, e.g. "file_17…") or a Data Room source ref like "upload:file_17…".',
  input_schema: {
    type: 'object',
    properties: {
      file_id: { type: 'string', description: 'The upload\'s file_id, e.g. "file_1712345678_ab12cd".' },
      max_sampled_pages: {
        type: 'number',
        description: 'For PDFs: how many pages to census for text-layer presence (default 30, max 200).',
      },
    },
    required: ['file_id'],
  },
};

export const READ_UPLOADED_DOCUMENT: AnaTool = {
  name: 'read_uploaded_document',
  description:
    'Read and extract the content of an uploaded file by file_id — AnA\'s front door to learn from and study any client ' +
    'document. Handles PDF (born-digital text with automatic OCR fallback for scanned pages), DOCX, Markdown, plain ' +
    'text/CSV/JSON, Excel (.xlsx, all sheets rendered as text), and images (OCR). Returns the extracted text (paged via ' +
    'max_chars/offset), the extraction method and OCR confidence, plus a structural outline (sections, tables, figures). ' +
    'For PDFs you can scope to a page range (page_start/page_end) — preferred for large documents; run ' +
    'inspect_uploaded_document first to plan. For cell-level Excel access (values, formulas, specific sheets) use ' +
    'read_spreadsheet instead. Set force_ocr to re-read a PDF/image with OCR even when a text layer exists (e.g. a bad ' +
    'or partial text layer).',
  input_schema: {
    type: 'object',
    properties: {
      file_id: { type: 'string', description: 'The upload\'s file_id, e.g. "file_1712345678_ab12cd".' },
      max_chars: {
        type: 'number',
        description: 'Maximum characters of text to return (default 30000, max 80000). Page with `offset`.',
      },
      offset: { type: 'number', description: 'Character offset to start from (for paging long documents). Default 0.' },
      page_start: { type: 'number', description: 'PDF only: first page to extract, 1-based inclusive.' },
      page_end: { type: 'number', description: 'PDF only: last page to extract, 1-based inclusive.' },
      force_ocr: { type: 'boolean', description: 'PDF/image only: OCR even if a text layer exists (default false).' },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'OCR languages when OCR is used: eng, fra, deu, spa, ita (default ["eng"]).',
      },
    },
    required: ['file_id'],
  },
};

export const OCR_DOCUMENT_PAGES: AnaTool = {
  name: 'ocr_document_pages',
  description:
    'Targeted optical character recognition over specific pages — and optionally a REGION of each page — of an uploaded ' +
    'PDF or image. This is the precision instrument for big scanned documents: OCR costs ~0.5–2s per page, so never ' +
    'brute-force a huge binder. Proven strategy: (1) inspect_uploaded_document to get the page count and bookmark/text ' +
    'census; (2) sweep cheaply with region "top_band" at modest dpi to find separators/headings (e.g. "EXHIBIT 12") and ' +
    'build an index; (3) full-OCR only the page ranges that matter. Select pages with page_start/page_end or an explicit ' +
    '`pages` list. Returns per-page text with per-page confidence (0–100). Languages supported: eng, fra, deu, spa, ita.',
  input_schema: {
    type: 'object',
    properties: {
      file_id: { type: 'string', description: 'The upload\'s file_id (a PDF or an image).' },
      page_start: { type: 'number', description: 'First page to OCR, 1-based inclusive (default 1).' },
      page_end: { type: 'number', description: 'Last page to OCR, 1-based inclusive.' },
      pages: {
        type: 'array',
        items: { type: 'number' },
        description: 'Explicit 1-based page list — overrides page_start/page_end.',
      },
      region: {
        type: 'string',
        enum: ['full', 'top_band', 'bottom_band', 'left_half', 'right_half', 'custom'],
        description:
          'Page region to OCR. "top_band"/"bottom_band" = top/bottom 25% (cheap separator/header sweeps); ' +
          '"custom" uses the region_* fractions. Default "full".',
      },
      region_top: { type: 'number', description: 'custom region: top edge as a fraction of page height (0–1).' },
      region_left: { type: 'number', description: 'custom region: left edge as a fraction of page width (0–1).' },
      region_width: { type: 'number', description: 'custom region: width as a fraction of page width (0–1).' },
      region_height: { type: 'number', description: 'custom region: height as a fraction of page height (0–1).' },
      dpi: { type: 'number', description: 'Render resolution for OCR, 72–400 (default 200; ~110 is fine for separator sweeps).' },
      max_pages: { type: 'number', description: 'Hard cap on pages OCRed in this call (default 20, max 50).' },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'OCR languages: eng, fra, deu, spa, ita (default ["eng"]).',
      },
    },
    required: ['file_id'],
  },
};

export const READ_SPREADSHEET: AnaTool = {
  name: 'read_spreadsheet',
  description:
    'Structured, cell-level read of an uploaded Excel (.xlsx) or CSV file: returns the sheet inventory plus the requested ' +
    'sheet\'s rows as a table — display values with row numbers, and formulas preserved alongside their cached results. ' +
    'Page through big sheets with start_row/max_rows. Use this (not read_uploaded_document) whenever you need to study ' +
    'specific cells, formulas, or a particular sheet; use edit_spreadsheet to change cells afterwards.',
  input_schema: {
    type: 'object',
    properties: {
      file_id: { type: 'string', description: 'The upload\'s file_id (.xlsx or .csv).' },
      sheet: {
        type: 'string',
        description: 'Sheet name, or 1-based sheet index as a string (e.g. "2"). Default: first sheet.',
      },
      start_row: { type: 'number', description: 'First row to return, 1-based (default 1).' },
      end_row: { type: 'number', description: 'Last row to return, 1-based inclusive.' },
      max_rows: { type: 'number', description: 'Row cap per call (default 100, max 1000).' },
      include_formulas: { type: 'boolean', description: 'Include the formulas list (default true).' },
    },
    required: ['file_id'],
  },
};

export const EDIT_SPREADSHEET: AnaTool = {
  name: 'edit_spreadsheet',
  description:
    'Edit an uploaded Excel workbook (or CSV, promoted to .xlsx on save) and persist the result as a NEW uploaded file — ' +
    'the original is never mutated, so provenance is preserved. Supply cell edits as A1 addresses with either a literal ' +
    '`value` (string/number/boolean; null clears the cell) or an Excel `formula` (without the leading "="). Optionally ' +
    'create missing sheets. Returns the new file_id of the edited copy plus a summary of every applied edit — report that ' +
    'new file_id to the user. ALWAYS read_spreadsheet first to confirm the target cells before editing.',
  input_schema: {
    type: 'object',
    properties: {
      file_id: { type: 'string', description: 'The upload\'s file_id (.xlsx or .csv).' },
      edits: {
        type: 'array',
        description: 'Cell edits to apply, in order.',
        items: {
          type: 'object',
          properties: {
            sheet: { type: 'string', description: 'Sheet name (default: first sheet).' },
            cell: { type: 'string', description: 'A1-style address, e.g. "B7".' },
            value: { description: 'New literal value (string/number/boolean). null clears the cell.' },
            formula: { type: 'string', description: 'Excel formula without "=", e.g. "SUM(B2:B6)". Overrides value.' },
          },
          required: ['cell'],
        },
      },
      create_missing_sheets: { type: 'boolean', description: 'Create sheets named in edits that don\'t exist (default false).' },
      new_file_name: { type: 'string', description: 'Filename for the edited copy (default: "<original> (edited).xlsx").' },
    },
    required: ['file_id', 'edits'],
  },
};

export const MINE_PRECEDENTS: AnaTool = {
  name: 'mine_precedents',
  description:
    "Construct a precedent-mining plan for a regulatory document type: how did recently approved drugs/devices frame the same type of content? Returns structured search targets across Drugs@FDA, EMA EPARs, FDA 510(k), PMA/De Novo databases, EUDAMED, EMA guidelines, and relevant scientific repositories — with URL templates, web_search query strings, and 'what to look for' guidance specific to the document type. This is how senior regulatory consultants calibrate: read the last three approved NDAs in the indication, read the CHMP rapporteur comments, read the FDA medical review. When web_search is enabled, AnA can execute the returned queries directly; when not, the URLs serve as a handoff for the regulatory author. Use this BEFORE drafting a document type that has meaningful precedent (Module 2.5, 510(k) SE, CER, CRL response, PIP) — the time to learn from precedent is BEFORE the first draft, not during revision.",
  input_schema: {
    type: 'object',
    properties: {
      document_type: {
        type: 'string',
        description: "Canonical document type. One of: clinical_overview (M2.5), clinical_summary (M2.7), quality_overall_summary (M2.3), nonclinical_overview (M2.4), ind_briefing_document, nda_response, labeling, 510k_substantial_equivalence, pma_ssed, de_novo_classification, clinical_evaluation_report (CER), ivdr_technical_file, risk_management_plan, pediatric_investigation_plan, breakthrough_designation_request, fast_track_request.",
      },
      search_context: {
        type: 'string',
        description: 'Therapeutic area, indication, device class, sponsor name, or other disambiguation to scope the precedent search (e.g. "SGLT2 inhibitor type 2 diabetes", "pulse oximeter pediatric", "GLP-1 receptor agonist obesity").',
      },
    },
    required: ['document_type', 'search_context'],
  },
};

export const CHECK_NUMERICAL_INTEGRITY: AnaTool = {
  name: 'check_numerical_integrity',
  description:
    "Scan a single drafted artifact for same labelled quantity stated with multiple distinct values. Surfaces candidates like: sample size N=648 in the narrative but N=641 in Table 14.1; p<0.001 in text but p<0.01 in the forest plot; 100 mg/kg NOAEL in one paragraph and 200 mg/kg two pages later. This is the classic 'numbers drift between text and table' failure that triggers FDA RTFs. The checker reports CANDIDATES — multi-arm studies legitimately report different N per arm or timepoint — so the author or model must adjudicate whether each candidate is a real inconsistency or documented variance. Call this AFTER drafting a regulatory artifact containing numerical claims and BEFORE finalizing. Returns verdict (clean | review_candidates | likely_inconsistency) with per-candidate severity and context snippets.",
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The drafted artifact content to scan for internal numerical inconsistency.',
      },
    },
    required: ['content'],
  },
};

export const COMPUTE_SAMPLE_SIZE: AnaTool = {
  name: 'compute_sample_size',
  description:
    "Compute sample size, statistical power, and a regulatory defensibility judgment using the platform's DETERMINISTIC biostatistics engine (validated closed-form formulas — not an estimate). ALWAYS call this tool when the user asks for a sample-size, power, or study-design calculation (e.g. via /power, /sap, /dose, /design, /defensibility). NEVER hand-calculate or estimate these numbers yourself — a fabricated sample size in a regulatory submission is a critical defect. First gather the required parameters from the user in plain language, then call this tool with structured arguments; report the returned numbers verbatim. If the engine returns validation errors, relay exactly which parameters are missing and ask the user for them. Returns: required total/per-arm N, achieved power, the assumptions used (including any defaults the engine applied), a multi-dimension defensibility judgment, and suggested next steps.",
  input_schema: {
    type: 'object',
    properties: {
      clientTrack: {
        type: 'string',
        enum: ['biotech_pharma', 'medical_device', 'diagnostics_ivd'],
        description: 'Product track. Infer from the project context when possible.',
      },
      studyType: {
        type: 'string',
        enum: [
          'superiority', 'non_inferiority', 'equivalence', 'single_arm', 'dose_response',
          'adaptive', 'basket', 'platform', 'diagnostic_accuracy', 'agreement', 'usability', 'performance',
        ],
        description: 'Study design type.',
      },
      objectiveType: {
        type: 'string',
        enum: ['efficacy', 'safety', 'performance', 'diagnostic_accuracy', 'usability', 'bioequivalence', 'dose_finding'],
        description: 'Primary objective of the study.',
      },
      endpointType: {
        type: 'string',
        enum: ['continuous', 'binary', 'time_to_event', 'ordinal', 'count', 'composite', 'sensitivity_specificity', 'agreement', 'auc_roc'],
        description: 'Primary endpoint type. Drives which effect-size inputs are needed.',
      },
      effectSize: {
        type: 'number',
        description: "Standardized effect size (e.g. Cohen's d for continuous). For binary endpoints you may instead supply controlRate and treatmentRate and the engine derives the effect.",
      },
      controlRate: {
        type: 'number',
        description: 'Event/response rate in the control arm (binary endpoints), 0–1.',
      },
      treatmentRate: {
        type: 'number',
        description: 'Event/response rate in the treatment arm (binary endpoints), 0–1.',
      },
      alpha: {
        type: 'number',
        description: 'Type I error rate. Defaults to 0.05 if omitted.',
      },
      powerTarget: {
        type: 'number',
        description: 'Target power, 0–1. Defaults to 0.80 if omitted.',
      },
      attritionRate: {
        type: 'number',
        description: 'Expected dropout/attrition rate, 0–1. Defaults to 0.15 if omitted.',
      },
      allocationRatio: {
        type: 'number',
        description: 'Treatment:control allocation ratio. Defaults to 1 (balanced) if omitted.',
      },
      nonInferiorityMargin: {
        type: 'number',
        description: 'Non-inferiority margin (required for non_inferiority studies).',
      },
      equivalenceMargin: {
        type: 'number',
        description: 'Equivalence margin (required for equivalence studies).',
      },
      comparatorType: {
        type: 'string',
        enum: ['placebo', 'active', 'historical', 'performance_goal'],
        description: 'Comparator type. Defaults to placebo.',
      },
      numberOfGroups: { type: 'number', description: 'Number of study arms/groups (defaults to 2).' },
      followUpDuration: { type: 'number', description: 'Follow-up duration in the study time unit (for time-to-event designs).' },
      interimAnalyses: { type: 'number', description: 'Number of planned interim analyses (group-sequential alpha spending).' },

      sensitivity: { type: 'number', description: 'Target sensitivity, 0–1 (diagnostic-accuracy / sensitivity_specificity endpoints).' },
      specificity: { type: 'number', description: 'Target specificity, 0–1 (diagnostic-accuracy endpoints).' },
      prevalence: { type: 'number', description: 'Disease/condition prevalence in the intended-use population, 0–1 (diagnostic-accuracy endpoints).' },
      aucTarget: { type: 'number', description: 'Target AUC for an ROC analysis, 0.5–1 (auc_roc endpoints).' },
      aucNull: { type: 'number', description: 'Null-hypothesis AUC to test against, 0.5–1 (auc_roc endpoints).' },
      agreementTarget: { type: 'number', description: "Target agreement/kappa for an agreement study (agreement endpoints)." },

      crossoverPeriods: { type: 'number', description: 'Number of periods in a crossover design (enables crossover sample-size adjustment).' },
      withinSubjectCorrelation: { type: 'number', description: 'Within-subject correlation for crossover designs, 0–1.' },

      numberOfEndpoints: { type: 'number', description: 'Number of co-primary/multiple primary endpoints (triggers multiplicity adjustment).' },
      multiplicityMethod: {
        type: 'string',
        enum: ['bonferroni', 'holm', 'hochberg', 'dunnett', 'none'],
        description: 'Multiplicity adjustment method when there are multiple endpoints.',
      },
      estimandStrategy: {
        type: 'string',
        enum: ['treatment_policy', 'hypothetical', 'composite', 'principal_stratum', 'while_on_treatment'],
        description: 'ICH E9(R1) estimand strategy for intercurrent events.',
      },
      missingDataMethod: {
        type: 'string',
        enum: ['complete_case', 'LOCF', 'MMRM', 'multiple_imputation', 'pattern_mixture'],
        description: 'Planned handling of missing data (affects the power/sensitivity assessment).',
      },
      expectedMissingRate: { type: 'number', description: 'Expected proportion of missing primary-endpoint data, 0–1.' },
      regulatoryBody: {
        type: 'string',
        enum: ['FDA', 'EMA', 'MHRA', 'PMDA', 'NMPA', 'TGA', 'Health_Canada'],
        description: 'Target regulator, so the engine can add agency-specific customization.',
      },
      indication: { type: 'string', description: 'Therapeutic indication or intended use.' },
      phase: { type: 'string', description: 'Trial phase (e.g. "Phase III"), if applicable.' },
      projectId: { type: 'number', description: 'Project id for scoping/audit.' },
    },
    required: ['clientTrack', 'studyType', 'objectiveType', 'endpointType'],
  },
};

// Shared biostatistics input schema — the full StatisticalInput surface the
// deterministic engine accepts. Reused by the scenario / defensibility /
// missing-data / document tools so they all speak the same parameter language.
const BIOSTATS_INPUT_PROPERTIES = COMPUTE_SAMPLE_SIZE.input_schema.properties;

export const COMPARE_STATISTICAL_SCENARIOS: AnaTool = {
  name: 'compare_statistical_scenarios',
  description:
    "Compare two study-design scenarios side by side using the DETERMINISTIC biostatistics engine. Use this when the user weighs trade-offs — e.g. 80% vs 90% power, two effect-size assumptions, balanced vs 2:1 allocation, superiority vs non-inferiority. Each scenario takes the same parameter set as compute_sample_size. Returns each scenario's sample size and power, the deltas, which design is statistically stronger, a recommendation, and a scenario-comparison brief. NEVER estimate these trade-offs by hand.",
  input_schema: {
    type: 'object',
    properties: {
      scenarioA: {
        type: 'object',
        description: 'First design scenario (same fields as compute_sample_size).',
        properties: BIOSTATS_INPUT_PROPERTIES,
      },
      scenarioB: {
        type: 'object',
        description: 'Second design scenario (same fields as compute_sample_size).',
        properties: BIOSTATS_INPUT_PROPERTIES,
      },
      label: { type: 'string', description: 'Optional short label for what is being compared (e.g. "80% vs 90% power").' },
    },
    required: ['scenarioA', 'scenarioB'],
  },
};

export const ASSESS_STATISTICAL_DEFENSIBILITY: AnaTool = {
  name: 'assess_statistical_defensibility',
  description:
    "Run the DETERMINISTIC engine's regulatory defensibility judgment on a study design. Backs /defensibility. Takes the same parameters as compute_sample_size and returns the multi-dimension judgment: overall verdict and risk level, per-dimension scores (evidence sufficiency, defensibility, reviewer sensitivity, claim risk, consistency, submission risk, endpoint-method fit), a fragility assessment, escalation reasons, and the confidence level. Use this when the user asks how defensible / reviewer-proof a design is, or before committing to a sample size. Report the engine's verdict and scores verbatim.",
  input_schema: {
    type: 'object',
    properties: BIOSTATS_INPUT_PROPERTIES,
    required: ['clientTrack', 'studyType', 'objectiveType', 'endpointType'],
  },
};

export const ANALYZE_MISSING_DATA_IMPACT: AnaTool = {
  name: 'analyze_missing_data_impact',
  description:
    "Quantify how missing primary-endpoint data erodes a study's power, using the DETERMINISTIC engine. Takes the same design parameters as compute_sample_size plus missingDataMethod and expectedMissingRate. Returns the effective sample size after attrition/missingness, the power reduction, the adjusted power, a bias-risk rating, and a handling recommendation (e.g. MMRM vs multiple imputation). Use this for missing-data strategy questions and ICH E9(R1) sensitivity discussions. Do not estimate the power loss by hand.",
  input_schema: {
    type: 'object',
    properties: BIOSTATS_INPUT_PROPERTIES,
    required: ['clientTrack', 'studyType', 'objectiveType', 'endpointType', 'missingDataMethod', 'expectedMissingRate'],
  },
};

export const GENERATE_STATISTICAL_DOCUMENT: AnaTool = {
  name: 'generate_statistical_document',
  description:
    "Generate a submission-ready statistical document grounded in the DETERMINISTIC engine's computed numbers (every sample size / power figure in the output is engine-computed, not invented). Backs /sap and statistical-authoring requests, and the produced draft opens in AnA's document editor. Takes the same design parameters as compute_sample_size plus a documentType. Returns the document title and full markdown content (a draft — the user promotes it through the governed authoring flow). documentType options: full_statistical_analysis_plan (complete SAP), sap_section_draft (single SAP section), sample_size_rationale, statistical_methods_section (CSR §9.7), interim_analysis_plan, dsmb_charter, tlf_shell_plan (tables/listings/figures shells), randomization_plan, statistical_risk_memo, design_assumption_note, protocol_statistical_section, submission_statistical_note, statistical_reviewer_response, scenario_comparison_brief. Pick the documentType that matches the client's request (e.g. a full SAP → full_statistical_analysis_plan; a DSMB charter → dsmb_charter).",
  input_schema: {
    type: 'object',
    properties: {
      ...BIOSTATS_INPUT_PROPERTIES,
      documentType: {
        type: 'string',
        enum: [
          'full_statistical_analysis_plan', 'sap_section_draft', 'sample_size_rationale',
          'statistical_methods_section', 'interim_analysis_plan', 'dsmb_charter',
          'tlf_shell_plan', 'randomization_plan', 'statistical_risk_memo',
          'design_assumption_note', 'protocol_statistical_section', 'submission_statistical_note',
          'statistical_reviewer_response', 'scenario_comparison_brief',
        ],
        description: 'Which statistical document to generate.',
      },
    },
    required: ['clientTrack', 'studyType', 'objectiveType', 'endpointType', 'documentType'],
  },
};

export const CHECK_DOSSIER_CONSISTENCY: AnaTool = {
  name: 'check_dossier_consistency',
  description:
    "Cross-check a drafted artifact against other artifacts in the same project for factual consistency — sample sizes, p-values, dose levels, NOAEL, shelf life, endpoint definitions, and CTD section cross-references. Surfaces the class of divergences that cause FDA RTFs and EMA IRs: the same labelled quantity stated with different values across Module 2 and Module 5, section references that point to non-existent targets, dose mismatches between nonclinical and clinical sections. Call this AFTER drafting a CTD section or regulatory document but BEFORE recommending it for the dossier. Returns a verdict (clean | minor_issues | needs_review | blocker) with per-divergence severity, the conflicting values, and a pointer to the source artifact — so the author can resolve the inconsistency or justify it explicitly.",
  input_schema: {
    type: 'object',
    properties: {
      draft_content: {
        type: 'string',
        description: 'The drafted artifact content to check against the project dossier.',
      },
      project_id: {
        type: 'number',
        description: 'The project the draft belongs to. Required so the check is scoped to the correct dossier.',
      },
      ctd_section: {
        type: 'string',
        description: 'Optional CTD section code for this draft (e.g. "2.5", "3.2.P.8.1"). Used to skip self-reference cross-checks.',
      },
      exclude_artifact_id: {
        type: 'number',
        description: 'Optional numeric artifact id to exclude from comparison — used when re-checking a revision of an existing artifact so it does not compare against its prior version.',
      },
    },
    required: ['draft_content', 'project_id'],
  },
};

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
// MDX mutation tools — let AnA take action against the kit's data domain.
// These complement the read tools (lookup_*, search_*, etc.) and the
// document-authoring tools (author_docx_native, generate_document, etc.):
// once AnA has gathered the facts and drafted the deliverable, she can
// also commit state changes back into the system of record. Every
// mutation is tenant-scoped via ToolContext.organizationId and audit-logged
// through the global mutation-audit middleware (server/startup/middleware.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const CREATE_Q_SUB: AnaTool = {
  name: 'create_q_sub',
  description:
    "Create a new Q-Submission (Pre-Sub, SIR, study-risk determination, informational meeting) for a regulatory program. Use after the user agrees on the meeting topic + questions, or after AnA has identified that a Pre-Sub is the right next step. Returns the created row including the q-number, stage ('plan'), and target date so AnA can reference it in subsequent turns. Tenant-scoped: programId must belong to the caller's org.",
  input_schema: {
    type: 'object',
    properties: {
      program_id: {
        type: 'string',
        description: "regulatory_programs.id (UUID) the Q-Sub is filed under.",
      },
      q_sub_type: {
        type: 'string',
        enum: ['presub', 'sir', 'srd', 'agree', 'info'],
        description:
          "Q-Sub category. presub = standard Pre-Submission meeting; sir = Submission Issue Request; srd = Study Risk Determination; agree = Agreement Meeting; info = Informational Meeting.",
      },
      title: {
        type: 'string',
        description:
          "Short topic title (e.g. 'Pre-Sub on biocompatibility strategy for IV-415').",
      },
      fda_team: {
        type: 'string',
        description: "Optional FDA branch/team (e.g. 'CDRH/OHT3/DOG/DOG2').",
      },
      target_date: {
        type: 'string',
        description: "Optional ISO-8601 target date for the meeting/feedback.",
      },
      summary: {
        type: 'string',
        description: 'Optional summary/agenda paragraph for the briefing document.',
      },
    },
    required: ['program_id', 'q_sub_type', 'title'],
  },
};

export const UPDATE_Q_SUB_COMMITMENT_ROLLED_IN: AnaTool = {
  name: 'update_q_sub_commitment_rolled_in',
  description:
    "Mark a Q-Sub commitment as rolled-in (or revert) — i.e. confirmation that the agreed-to commitment is reflected in the dossier. Used after AnA verifies the dossier section that addresses the commitment. Tenant-scoped via the parent Q-Sub's program org.",
  input_schema: {
    type: 'object',
    properties: {
      commitment_id: {
        type: 'string',
        description: 'q_sub_commitments.id (UUID) of the commitment row.',
      },
      rolled_in: {
        type: 'boolean',
        description: 'true to mark as rolled-in, false to revert.',
      },
    },
    required: ['commitment_id', 'rolled_in'],
  },
};

export const LINK_PROGRAM_CLINICAL_STUDY: AnaTool = {
  name: 'link_program_clinical_study',
  description:
    "Bind a regulatory program to a specific clinical_ops.studies row by writing the study UUID into program.metadata.clinicalStudyId. The PMA trial-metrics endpoint reads this binding to compute Enrolled / Sites / AE rate / Endpoints-achieved — without it the endpoint falls back to a fuzzy product-name match that can pick up the wrong study in orgs running multiple trials. Use whenever the user identifies which clinical study backs a program. Tenant-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      program_id: {
        type: 'string',
        description: 'regulatory_programs.id (UUID).',
      },
      clinical_study_id: {
        type: 'string',
        description: 'clinical_ops.studies.id (UUID).',
      },
    },
    required: ['program_id', 'clinical_study_id'],
  },
};

export const SET_PROGRAM_METADATA: AnaTool = {
  name: 'set_program_metadata',
  description:
    "Merge keys into a regulatory program's metadata jsonb (program.metadata). Used to set production-recommended keys: clinicalStudyId (binds to clinical_ops.studies — prefer the dedicated link_program_clinical_study tool), ndcCode (FAERS lookups), programCode (display override), stage (richer stage state), gateErrs/gateWarns/gateOk (per-package transmit gate counts), fileCount/bytes/cover/esig/transmitAt (rich submission-list fields). Performs a shallow JSON merge — passing { foo: null } removes that key. Tenant-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      program_id: {
        type: 'string',
        description: 'regulatory_programs.id (UUID).',
      },
      metadata: {
        type: 'object',
        description:
          'Object whose keys are merged into program.metadata. Values must be JSON-serializable (string|number|boolean|object|null).',
        additionalProperties: true,
      },
    },
    required: ['program_id', 'metadata'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Beta-surface mutation tools — let AnA author into the new MDX domain
// surfaces: UDI records, risk management (ISO 14971), software lifecycle
// (IEC 62304), Q-Sub briefing-doc sections. Every tool tenant-scoped via
// ToolContext.organizationId; backing tables ship in migration 20260507.
// ─────────────────────────────────────────────────────────────────────────────

export const CREATE_UDI_RECORD: AnaTool = {
  name: 'create_udi_record',
  description:
    "Create a UDI device record under the caller's organization, optionally bound to a regulatory program. Use after the user identifies a device variant that needs a UDI-DI assignment (or after AnA has gathered the device's classification + brand + catalog data). Issuing agency must be one of GS1 / HIBCC / ICCBBA. The record starts in gudid_status='draft'; later use submit_udi_record to flip to 'submitted' once payload is ready.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:      { type: 'string', description: 'regulatory_programs.id (UUID), optional.' },
      device_name:     { type: 'string' },
      udi_di:          { type: 'string', description: 'Device identifier (UDI-DI).' },
      issuing_agency:  { type: 'string', enum: ['GS1', 'HIBCC', 'ICCBBA'] },
      device_class:    { type: 'string', description: 'Risk class (e.g. I, IIa, IIb, III).' },
      product_code:    { type: 'string', description: 'FDA 3-letter product code.' },
      gmdn_code:       { type: 'string' },
      brand_name:      { type: 'string' },
      catalog_number:  { type: 'string' },
      version_or_model: { type: 'string' },
      mri_safety:      { type: 'string', enum: ['mri_safe', 'mri_conditional', 'mri_unsafe', 'not_evaluated'] },
      lot_serial:      { type: 'string', enum: ['lot', 'serial', 'none'] },
      single_use:      { type: 'boolean' },
    },
    required: ['device_name', 'udi_di', 'issuing_agency'],
  },
};

export const CREATE_RISK_ITEM: AnaTool = {
  name: 'create_risk_item',
  description:
    "Add a new ISO 14971 risk row (hazard + harm + severity × probability) under a regulatory program. Severity and probability are 1..5 scales (5 = most severe / most frequent). initial_risk = severity × probability is computed server-side. After creation, attach risk_controls via add_risk_control. Status starts 'open' unless explicitly set.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:           { type: 'string', description: 'regulatory_programs.id (UUID), optional.' },
      ref_code:             { type: 'string', description: 'Display id, e.g. RISK-0042.' },
      hazard:               { type: 'string' },
      hazardous_situation:  { type: 'string' },
      harm:                 { type: 'string' },
      sequence_of_events:   { type: 'string', description: 'How hazard becomes harm.' },
      severity:             { type: 'number', minimum: 1, maximum: 5 },
      probability:          { type: 'number', minimum: 1, maximum: 5 },
      detectability:        { type: 'number', minimum: 1, maximum: 5 },
      control_strategy:     { type: 'string', enum: ['design_eliminate', 'design_reduce', 'protective', 'information'] },
      source:               { type: 'string', enum: ['fmea', 'pha', 'fault_tree', 'literature', 'complaint', 'capa', 'other'] },
    },
    required: ['hazard', 'harm', 'severity', 'probability'],
  },
};

export const ADD_RISK_CONTROL: AnaTool = {
  name: 'add_risk_control',
  description:
    "Attach a risk control measure (per ISO 14971 §7) to an existing risk_item. control_type maps to the 14971 hierarchy: inherent_safety (design changes that remove the hazard), protective_measure (alarms, interlocks), information_safety (labeling, training). Provide evidence references (test reports, design docs) when available. If the control introduces a new hazard, set introduces_new_risk=true and link the new risk_item via new_risk_item_id.",
  input_schema: {
    type: 'object',
    properties: {
      risk_item_id:            { type: 'number' },
      description:             { type: 'string' },
      control_type:            { type: 'string', enum: ['inherent_safety', 'protective_measure', 'information_safety'] },
      implementation_evidence: { type: 'string' },
      verification_evidence:   { type: 'string' },
      effectiveness_evidence:  { type: 'string' },
      introduces_new_risk:     { type: 'boolean' },
      new_risk_item_id:        { type: 'number' },
      status:                  { type: 'string', enum: ['proposed', 'implemented', 'verified', 'effective'] },
    },
    required: ['risk_item_id', 'description', 'control_type'],
  },
};

export const CREATE_SOFTWARE_LIFECYCLE_ITEM: AnaTool = {
  name: 'create_software_lifecycle_item',
  description:
    "Create an IEC 62304 / FDA 2023 software guidance deliverable under a program. item_kind selects the document type from the canonical set: srs (software requirements specification), sds (software design specification — Enhanced level only), arch (architecture), unit_test / integration_test / system_test, release_note, anomaly_log, ots_list (off-the-shelf software list), sbom (CycloneDX/SPDX), pentest, threat_model, risk_control, use_error, cybersecurity_label. doc_level is 'basic' or 'enhanced' per the FDA 2023 software guidance. safety_class is A / B / C per IEC 62304. Optionally link to a backing concept2cure_artifact via evidence_artifact_id.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:           { type: 'string', description: 'regulatory_programs.id (UUID), optional.' },
      doc_level:            { type: 'string', enum: ['basic', 'enhanced'] },
      safety_class:         { type: 'string', enum: ['A', 'B', 'C'] },
      item_kind: {
        type: 'string',
        enum: [
          'srs', 'sds', 'arch', 'unit_test', 'integration_test', 'system_test',
          'release_note', 'anomaly_log', 'ots_list', 'sbom', 'pentest',
          'threat_model', 'risk_control', 'use_error', 'cybersecurity_label',
        ],
      },
      title:                { type: 'string' },
      identifier:           { type: 'string', description: 'e.g. SRS-1.0, SBOM-2026Q2.' },
      status:               { type: 'string', enum: ['draft', 'in_review', 'approved', 'superseded'] },
      evidence_artifact_id: { type: 'number', description: 'concept2cure_artifacts.id.' },
      notes:                { type: 'string' },
    },
    required: ['doc_level', 'item_kind', 'title'],
  },
};

export const WRITE_Q_SUB_SECTION: AnaTool = {
  name: 'write_q_sub_section',
  description:
    "Write drafted content into a Q-Sub briefing-document section. section_key is one of the 8 canonical briefing sections: 'submission_type', 'sponsor_information', 'device_description', 'regulatory_history', 'issues_for_discussion', 'specific_questions_for_fda', 'proposed_meeting_format', 'supporting_information'. Marks the section as draft_source='ana'; the kit surfaces an Accept/Refine affordance after this writes. Tenant-scoped via the parent Q-Sub's program org.",
  input_schema: {
    type: 'object',
    properties: {
      q_sub_id:    { type: 'string', description: 'q_submissions.id (UUID).' },
      section_key: {
        type: 'string',
        enum: [
          'submission_type', 'sponsor_information', 'device_description',
          'regulatory_history', 'issues_for_discussion', 'specific_questions_for_fda',
          'proposed_meeting_format', 'supporting_information',
        ],
      },
      content:     { type: 'string', description: 'Markdown-style content (≥ 40 chars).' },
      summary_note: { type: 'string', description: 'Optional one-line note for the audit trail.' },
    },
    required: ['q_sub_id', 'section_key', 'content'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// IVD + diagnostic surface mutation tools — backs the 4 diagnostic-specific
// surfaces in the gap inventory (IVD pathway, EU IVDR, companion diagnostics,
// lab-developed tests). Tenant-scoped via ToolContext.organizationId.
// ─────────────────────────────────────────────────────────────────────────────

export const RECORD_ANALYTICAL_PERFORMANCE_STUDY: AnaTool = {
  name: 'record_analytical_performance_study',
  description:
    "Log an IVD analytical performance study (accuracy, precision, linearity, LoD, LoQ, analytical specificity, interference, matrix comparison, reagent stability, sample stability, carryover). Captures study_type, acceptance_criterion, result, pass/fail, n_samples, sites, analytes. Use after the user runs (or AnA reviews) a performance study.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:           { type: 'string' },
      study_type:           { type: 'string', enum: ['accuracy', 'precision', 'linearity', 'limit_of_detection', 'limit_of_quantitation', 'analytical_specificity', 'interference', 'matrix_comparison', 'reagent_stability', 'sample_stability', 'carryover'] },
      study_id:             { type: 'string' },
      title:                { type: 'string' },
      acceptance_criterion: { type: 'string' },
      result_summary:       { type: 'string' },
      pass_fail:            { type: 'string', enum: ['pass', 'fail', 'pending'] },
      n_samples:            { type: 'number' },
      n_replicates:         { type: 'number' },
      sites:                { type: 'array', items: { type: 'string' } },
      analytes:             { type: 'array', items: { type: 'string' } },
      matrix_type:          { type: 'string' },
    },
    required: ['study_type', 'title'],
  },
};

export const RECORD_CLINICAL_PERFORMANCE_STUDY: AnaTool = {
  name: 'record_clinical_performance_study',
  description:
    "Log an IVD clinical performance study (sensitivity, specificity, PPV, NPV, AUC-ROC). Captures the comparator (predicate, clinical_truth, composite, follow_up), study population, total subjects, and the 95% confidence intervals. Use after a clinical study completes or when adapting a prior study's results into the regulatory record.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:               { type: 'string' },
      study_id:                 { type: 'string' },
      title:                    { type: 'string' },
      intended_population:      { type: 'string' },
      comparator:               { type: 'string' },
      comparator_kind:          { type: 'string', enum: ['predicate', 'clinical_truth', 'composite', 'follow_up'] },
      total_subjects:           { type: 'number' },
      positive_n:               { type: 'number' },
      negative_n:               { type: 'number' },
      sensitivity_pct:          { type: 'number', minimum: 0, maximum: 100 },
      sensitivity_lower:        { type: 'number', minimum: 0, maximum: 100 },
      sensitivity_upper:        { type: 'number', minimum: 0, maximum: 100 },
      specificity_pct:          { type: 'number', minimum: 0, maximum: 100 },
      specificity_lower:        { type: 'number', minimum: 0, maximum: 100 },
      specificity_upper:        { type: 'number', minimum: 0, maximum: 100 },
      ppv_pct:                  { type: 'number', minimum: 0, maximum: 100 },
      npv_pct:                  { type: 'number', minimum: 0, maximum: 100 },
      prevalence_pct:           { type: 'number', minimum: 0, maximum: 100 },
      auc_roc:                  { type: 'number', minimum: 0, maximum: 1 },
      pre_specified_endpoint_met: { type: 'boolean' },
    },
    required: ['title'],
  },
};

export const CLASSIFY_IVD_DEVICE: AnaTool = {
  name: 'classify_ivd_device',
  description:
    "Assign the EU IVDR Class A/B/C/D classification + Annex VIII rule to a device. Notified body requirement is server-computed (Class A = no NB; Class B/C/D = NB required). Use this when the user or AnA has worked through the Annex VIII decision tree.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:           { type: 'string' },
      device_name:          { type: 'string' },
      ivdr_class:           { type: 'string', enum: ['A', 'B', 'C', 'D'] },
      classification_rule:  { type: 'string', enum: ['1', '2', '3', '4', '5', '6', '7'] },
      rationale:            { type: 'string' },
      companion_diagnostic: { type: 'boolean' },
      self_test:            { type: 'boolean' },
      near_patient_test:    { type: 'boolean' },
      notified_body_name:   { type: 'string' },
      notified_body_id:     { type: 'string', description: '4-digit NB id (e.g. 0123).' },
    },
    required: ['device_name', 'ivdr_class'],
  },
};

export const CREATE_PER_DOCUMENT: AnaTool = {
  name: 'create_per_document',
  description:
    "Start a Performance Evaluation Report (PER) record for an IVDR device — distinct from the medical-device CER. PER covers scientific validity, analytical performance, and clinical performance per IVDR Annex XIII. Use this when the user begins (or AnA helps assemble) a PER. Author name + qualifications required for compliance.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:                    { type: 'string' },
      device_name:                   { type: 'string' },
      per_version:                   { type: 'string' },
      per_status:                    { type: 'string', enum: ['draft', 'review', 'approved', 'superseded'] },
      scientific_validity_done:      { type: 'boolean' },
      analytical_performance_done:   { type: 'boolean' },
      clinical_performance_done:     { type: 'boolean' },
      benefit_risk_conclusion:       { type: 'string' },
      pmpf_plan_attached:            { type: 'boolean', description: 'Post-Market Performance Follow-up plan attached.' },
      author_name:                   { type: 'string' },
      author_qualifications:         { type: 'string' },
      per_date:                      { type: 'string', description: 'ISO date.' },
    },
    required: ['device_name', 'per_version'],
  },
};

export const CATEGORIZE_CLIA_COMPLEXITY: AnaTool = {
  name: 'categorize_clia_complexity',
  description:
    "Record the CLIA complexity categorization (waived, moderate, high) for an IVD test. CMS issues a categorization letter for each FDA-cleared test; capture the letter reference + date so the lab knows which tests need a moderate/high-complexity CLIA certificate. To track a CLIA waiver application, follow up with apply_clia_waiver.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:       { type: 'string' },
      test_name:        { type: 'string' },
      analyte:          { type: 'string' },
      clia_complexity:  { type: 'string', enum: ['waived', 'moderate', 'high'] },
      cms_letter_date:  { type: 'string', description: 'ISO date of the CMS letter.' },
      cms_letter_ref:   { type: 'string' },
    },
    required: ['test_name', 'clia_complexity'],
  },
};

export const PAIR_COMPANION_DIAGNOSTIC: AnaTool = {
  name: 'pair_companion_diagnostic',
  description:
    "Register a drug ↔ companion-diagnostic-device pairing. Links the device program (regulatory_programs.id) to a drug application (NDA/BLA/ANDA/foreign) so the team can track concordance studies, paired-approval timeline, and CDx-claim alignment with the drug label. Use whenever a CDx is in scope for a program.",
  input_schema: {
    type: 'object',
    properties: {
      device_program_id:     { type: 'string' },
      drug_name:             { type: 'string' },
      drug_innn:             { type: 'string', description: 'International Nonproprietary Name.' },
      drug_application_type: { type: 'string', enum: ['nda', 'bla', 'anda', 'foreign'] },
      drug_application_no:   { type: 'string', description: 'e.g. NDA 214567.' },
      drug_sponsor:          { type: 'string' },
      indication:            { type: 'string' },
      biomarker:             { type: 'string', description: 'e.g. EGFR, BRAF V600E, PD-L1.' },
      approval_status:       { type: 'string', enum: ['planned', 'submitted', 'approved', 'withdrawn'] },
      fda_approval_date:     { type: 'string' },
      ema_approval_date:     { type: 'string' },
      cdx_label_text:        { type: 'string', description: 'Exact CDx claim on the drug labeling.' },
    },
    required: ['drug_name'],
  },
};

export const REGISTER_LDT: AnaTool = {
  name: 'register_ldt',
  description:
    "Register a laboratory-developed test in the LDT inventory. Tracks lab name, CLIA certificate, intended use, first-offered date (used for grandfathering eligibility per FDA 2024 LDT final rule), and FDA pathway. current_phase starts at 1 per the rule's phased transition schedule; use set_ldt_phase_milestone to log specific milestone progress.",
  input_schema: {
    type: 'object',
    properties: {
      lab_name:                       { type: 'string' },
      clia_certificate_no:            { type: 'string' },
      test_name:                      { type: 'string' },
      analyte:                        { type: 'string' },
      intended_use:                   { type: 'string' },
      first_offered_date:             { type: 'string', description: 'ISO date — pre-rule date supports grandfathering.' },
      grandfathered:                  { type: 'boolean' },
      enforcement_discretion_eligible: { type: 'boolean' },
      enforcement_discretion_basis:   { type: 'string', enum: ['unmet_need', 'hde_companion', 'forensic', 'cf_blood_banking', 'public_health'] },
      fda_pathway:                    { type: 'string', enum: ['510k', 'pma', 'de_novo', 'none', 'enforcement_discretion'] },
      current_phase:                  { type: 'number', minimum: 1, maximum: 5 },
    },
    required: ['lab_name', 'test_name'],
  },
};

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
  description:
    "Transmit an already-packaged bundle to a regulatory gateway (FDA ESG, EMA CESP, EMA EUDAMED, PMDA Gateway, or Health Canada CESG). Returns the transmittal id and gateway-issued tracking number. Throws when credentials are not configured for the org × environment. Use after package_ectd_for_region or after assembling a region-specific deliverable like an eSTAR or a EUDAMED device-registration JSON.",
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
// Submission-center tools — give AnA reach over the canonical core + ingestion
// + deterministic eCTD primitives. The three compute tools are pure (no tenant
// data touched); the two ingestion tools persist and are tenant-scoped via the
// active context. Irreversible/outward actions (freeze, transmit) stay in the
// existing governed tools — these do not bypass that.
// ─────────────────────────────────────────────────────────────────────────────

export const COMPUTE_LIFECYCLE_OPERATIONS: AnaTool = {
  name: 'compute_lifecycle_operations',
  description:
    'Compute the eCTD lifecycle operator (new, replace, append, or delete) for each leaf of a new sequence by diffing it against the prior sequence. You pass the prior leaves and the desired leaves, each with its md5 checksum; you get every leaf with its computed operation plus a summary count (new, replace, append, delete, unchanged). This is pure computation — nothing is written. Use it when planning a sequence so the user sees exactly which leaves change.',
  input_schema: {
    type: 'object',
    properties: {
      prior_leaves: {
        type: 'array',
        description: 'Leaves published in the prior sequence.',
        items: {
          type: 'object',
          properties: {
            leaf_key: { type: 'string', description: 'Stable leaf identity (eCTD leaf GUID); defaults to ctd_section/file_name.' },
            ctd_section: { type: 'string', description: 'CTD section code, e.g. "2.5".' },
            file_name: { type: 'string', description: 'Leaf file name.' },
            md5: { type: 'string', description: 'Published content checksum.' },
            title: { type: 'string', description: 'Leaf title.' },
            source_path: { type: 'string', description: 'Path of the prior file (used for delete leaves).' },
          },
          required: ['ctd_section', 'file_name', 'md5'],
        },
      },
      desired_leaves: {
        type: 'array',
        description: 'Leaves the new sequence intends to contain.',
        items: {
          type: 'object',
          properties: {
            leaf_key: { type: 'string', description: 'Stable leaf identity; defaults to ctd_section/file_name.' },
            ctd_section: { type: 'string', description: 'CTD section code.' },
            file_name: { type: 'string', description: 'Leaf file name.' },
            md5: { type: 'string', description: 'Content checksum of the desired file.' },
            title: { type: 'string', description: 'Leaf title.' },
            source_path: { type: 'string', description: 'Path of the desired file.' },
            append_on_change: { type: 'boolean', description: 'When content changed, emit append instead of replace.' },
          },
          required: ['ctd_section', 'file_name', 'md5'],
        },
      },
    },
    required: ['desired_leaves'],
  },
};

export const GENERATE_STF: AnaTool = {
  name: 'generate_stf',
  description:
    'Generate FDA Study Tagging File (stf.xml) content for each study from its tagged study-report leaves. You pass the leaves with their study id, file tag, CTD section, href, title, and operation; you get one stf.xml per study, grouped by file tag, plus a summary. Pure computation — nothing is written to the package. Use it when assembling Module 4 or 5 so each study folder carries a correct STF.',
  input_schema: {
    type: 'object',
    properties: {
      leaves: {
        type: 'array',
        description: 'Study-report leaves to tag.',
        items: {
          type: 'object',
          properties: {
            study_id: { type: 'string', description: 'Controlling study identifier.' },
            file_tag: { type: 'string', description: "STF file-tag, e.g. 'study-report-body', 'protocol-or-amendment'." },
            ctd_section: { type: 'string', description: 'CTD section, e.g. "5.3.5.1".' },
            href: { type: 'string', description: 'Relative href of the leaf in the package.' },
            title: { type: 'string', description: 'Leaf title.' },
            operation: { type: 'string', enum: ['new', 'append', 'replace', 'delete'], description: 'Lifecycle operation.' },
          },
          required: ['study_id', 'file_tag', 'ctd_section', 'href', 'title', 'operation'],
        },
      },
      study_meta: {
        type: 'array',
        description: 'Optional per-study title and category.',
        items: {
          type: 'object',
          properties: {
            study_id: { type: 'string' },
            study_title: { type: 'string' },
            study_category: { type: 'string' },
          },
          required: ['study_id'],
        },
      },
    },
    required: ['leaves'],
  },
};

export const CHECK_ECTD_CROSS_REFERENCES: AnaTool = {
  name: 'check_ectd_cross_references',
  description:
    'Check that every intra-package cross-reference in an eCTD submission resolves to a leaf that is present and not deleted. You pass the package leaves and the references between them; you get the resolved references and any broken ones with the reason (target not found, or target deleted). Pure computation — read only. Use it before validation to catch dangling hyperlinks.',
  input_schema: {
    type: 'object',
    properties: {
      leaves: {
        type: 'array',
        description: 'All leaves in the package.',
        items: {
          type: 'object',
          properties: {
            leaf_key: { type: 'string' },
            ctd_section: { type: 'string' },
            file_name: { type: 'string' },
            title: { type: 'string' },
            operation: { type: 'string', enum: ['new', 'append', 'replace', 'delete'] },
          },
          required: ['ctd_section', 'file_name'],
        },
      },
      references: {
        type: 'array',
        description: 'Cross-references to validate.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional reference id.' },
            source: { type: 'string', description: 'The leaf making the reference (section code, leaf key, or file name).' },
            target: { type: 'string', description: 'The referenced leaf (section code, leaf key, file name, or href).' },
            label: { type: 'string', description: 'Optional display label.' },
          },
          required: ['source', 'target'],
        },
      },
    },
    required: ['leaves', 'references'],
  },
};

export const CLASSIFY_SUBMISSION_DOCUMENT: AnaTool = {
  name: 'classify_submission_document',
  description:
    'Classify a submission document to its CTD section through the ingestion pipeline, and optionally draft a leaf placement in a target sequence. The document, tenant, and acting user come from the active context — you pass only the document id and an optional sequence id. The proposal is persisted onto the document and the AI call is audited. Use this when a user uploads a document and asks where it belongs.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number', description: 'Id of the coauthor document to classify.' },
      sequence_id: { type: 'number', description: 'Optional target sequence; when set and owned, a draft leaf is placed.' },
    },
    required: ['document_id'],
  },
};

export const EXTRACT_SUBMISSION_DOCUMENT: AnaTool = {
  name: 'extract_submission_document',
  description:
    "Extract a submission document's structure, claims, and referenced sources through the ingestion pipeline, and record a provenance link from the target section to the document. You pass the document id, the CTD section it maps to, and the submission id; tenant and acting user come from the active context. The result is persisted and audited. Use this after classification to capture what a document supports.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number', description: 'Id of the coauthor document to extract.' },
      section_code: { type: 'string', description: 'CTD section the document maps to, e.g. "2.7.3".' },
      submission_id: { type: 'number', description: 'Submission the provenance link belongs to.' },
    },
    required: ['document_id', 'section_code', 'submission_id'],
  },
};

export const RUN_SHADOW_REVIEW: AnaTool = {
  name: 'run_shadow_review',
  description:
    'Run a shadow review on an assembled sequence — a simulated reviewer pass that returns severity-scored Refuse-to-File and Complete-Response-risk findings, each with a regulatory basis and a fix, plus rtf/crl risk scores. You pass the sequence id and an optional reviewer lens; tenant and acting user come from the active context. The run and its findings are persisted and the AI call is audited. Use this before dispatch to surface what a reviewer would reject.',
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'Id of the assembled eCTD sequence to review.' },
      lens: {
        type: 'string',
        enum: ['fda_filing', 'ema_d120', 'pmda', 'nb_mdr', 'nb_ivdr'],
        description: "Reviewer lens; defaults to 'fda_filing'.",
      },
    },
    required: ['sequence_id'],
  },
};

export const VALIDATE_ECTD_PACKAGE: AnaTool = {
  name: 'validate_ectd_package',
  description:
    'Run the deterministic eCTD 4.0 validator over a set of leaves and return a pass/fail verdict, a 0-100 score, and severity-scored findings (required-section coverage, filename rules, MD5 format, lifecycle operations, ICH M8). Pure computation — read only, no transmission. Use it before packaging or transmitting so the user sees and fixes errors first.',
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', description: "Submission type for required-section rules (default 'IND')." },
      leaves: {
        type: 'array',
        description: 'Leaves to validate.',
        items: {
          type: 'object',
          properties: {
            section_code: { type: 'string', description: 'eCTD section code, e.g. "m3.2.S.1".' },
            title: { type: 'string', description: 'Document title.' },
            checksum: { type: 'string', description: 'MD5 checksum.' },
            operation: { type: 'string', enum: ['new', 'append', 'replace', 'delete'], description: 'Lifecycle operation.' },
            file_path: { type: 'string', description: 'Relative file path within the package.' },
            mime_type: { type: 'string', description: "Defaults to 'application/pdf'." },
            file_size: { type: 'number', description: 'File size in bytes.' },
            lifecycle_operator: { type: 'string', description: 'Optional lifecycle operator id.' },
          },
          required: ['section_code', 'title', 'checksum', 'operation', 'file_path'],
        },
      },
    },
    required: ['leaves'],
  },
};

// ── Submission AI tasks (gateway-backed, audited) ────────────────────────────

export const PLAN_SUBMISSION: AnaTool = {
  name: 'plan_submission',
  description:
    'Generate a submission plan for a target product: the required module/section map, regional forms, a timeline keyed to health-authority clocks, a dependency graph, and an initial gap list. Tenant and acting user come from the active context. Grounds against ICH and region guidance and is audited. Use it when a user starts a new submission and asks what is required.',
  input_schema: {
    type: 'object',
    properties: {
      application_type: { type: 'string', description: 'e.g. ind, nda, bla, maa, 510k, de_novo, pma, cta.' },
      client_type: { type: 'string', enum: ['pharma', 'biotech', 'mdx', 'ivd'], description: 'Client type.' },
      regions: { type: 'array', items: { type: 'string', enum: ['fda', 'eu', 'jp'] }, description: 'Target regions.' },
      product_profile: { type: 'string', description: 'Optional product and indication description.' },
      submission_id: { type: 'number', description: 'Optional submission this plan is for (recorded on the audit entry).' },
    },
    required: ['application_type', 'client_type', 'regions'],
  },
};

export const EXPLAIN_VALIDATION_FINDINGS: AnaTool = {
  name: 'explain_validation_findings',
  description:
    'Translate deterministic eCTD/region validator findings into plain-language causes and concrete fixes, without changing any verdict. Tenant comes from the active context; the call is audited. Use it after validate_ectd_package so the user understands and can fix each finding.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['fda', 'eu', 'jp'] },
      findings: {
        type: 'array',
        description: 'Deterministic validator findings to explain.',
        items: {
          type: 'object',
          properties: {
            rule_id: { type: 'string' },
            severity: { type: 'string', enum: ['error', 'warning', 'info'] },
            message: { type: 'string' },
            leaf: { type: 'string' },
          },
          required: ['severity', 'message'],
        },
      },
      submission_id: { type: 'number', description: 'Optional submission id for the audit entry.' },
    },
    required: ['region', 'findings'],
  },
};

export const CROSS_REGION_GAP_ANALYSIS: AnaTool = {
  name: 'cross_region_gap_analysis',
  description:
    'Given a submission prepared for a source region, compute what is additionally needed to file the same product in target regions: Module 1 deltas, bridging-study needs (ICH E5), translation scope, and format conversion. Tenant comes from the active context; the call is audited.',
  input_schema: {
    type: 'object',
    properties: {
      source_region: { type: 'string', enum: ['fda', 'eu', 'jp'] },
      target_regions: { type: 'array', items: { type: 'string', enum: ['fda', 'eu', 'jp'] } },
      application_type: { type: 'string', description: 'e.g. nda, maa, jnda.' },
      sections_present: { type: 'array', items: { type: 'string' }, description: 'Optional CTD section codes already prepared.' },
      submission_id: { type: 'number', description: 'Optional submission id for the audit entry.' },
    },
    required: ['source_region', 'target_regions', 'application_type'],
  },
};

export const DISPATCH_QC_CHECK: AnaTool = {
  name: 'dispatch_qc_check',
  description:
    'Run a final adversarial pre-transmit QC pass and decide whether dispatch may proceed. Hard rule: never cleared when there are open error-severity validation findings or unacknowledged Shadow Review criticals. This does NOT transmit — it gates. Tenant comes from the active context; the call is audited.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['fda', 'eu', 'jp'] },
      validation_errors: { type: 'number', description: 'Count of open error-severity validation findings.' },
      unresolved_shadow_criticals: { type: 'number', description: 'Count of unacknowledged Shadow Review criticals.' },
      leaves: {
        type: 'array',
        items: { type: 'object', properties: { section_code: { type: 'string' }, operation: { type: 'string' } }, required: ['section_code', 'operation'] },
      },
      submission_id: { type: 'number', description: 'Optional submission id for the audit entry.' },
    },
    required: ['region', 'validation_errors', 'unresolved_shadow_criticals', 'leaves'],
  },
};

// ── Truth Engine (provenance + consistency) ──────────────────────────────────

export const TRACE_PROVENANCE: AnaTool = {
  name: 'trace_provenance',
  description:
    'Trace where a submission section derives from: returns the provenance links (source document, direction, confidence) recorded for that section, ordered by confidence. Deterministic read of the evidence graph — never invents sources. Tenant comes from the active context. Use it to answer "what does 2.7 draw on?".',
  input_schema: {
    type: 'object',
    properties: {
      submission_id: { type: 'number', description: 'The submission.' },
      target_section_code: { type: 'string', description: 'The section to trace, e.g. "2.7.3".' },
    },
    required: ['submission_id', 'target_section_code'],
  },
};

export const CHECK_CONSISTENCY: AnaTool = {
  name: 'check_consistency',
  description:
    'Cross-check a claim against other parts of the dossier for consistency along a named dimension (e.g. subject-counts, spec-vs-qos, label-vs-safety), and record each verdict (match or conflict) as a consistency finding. Tenant comes from the active context; the call is audited. Use it to catch contradictions before review.',
  input_schema: {
    type: 'object',
    properties: {
      submission_id: { type: 'number', description: 'The submission.' },
      dimension: { type: 'string', description: 'What is being checked, e.g. "subject-counts".' },
      left: {
        type: 'object',
        description: 'The claim under review.',
        properties: { ref: { type: 'string' }, text: { type: 'string' } },
        required: ['ref', 'text'],
      },
      right: {
        type: 'array',
        description: 'The sources to check against.',
        items: { type: 'object', properties: { ref: { type: 'string' }, text: { type: 'string' } }, required: ['ref', 'text'] },
      },
    },
    required: ['submission_id', 'dimension', 'left', 'right'],
  },
};

export const ASSESS_PATHWAY_READINESS: AnaTool = {
  name: 'assess_pathway_readiness',
  description:
    "Assess whether a submission sequence is ready for a non-eCTD regulatory pathway (EU CTIS clinical trials, EU MDR/IVDR device tech doc, FDA eSTAR 510(k)/De Novo, or Japan PMDA Shōnin). Reads the sequence's leaves from the active tenant context and returns a required-slot gap report (ready + missingRequired). Deterministic, read-only — it maps and gap-checks, it never submits.",
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'The sequence whose leaves are assessed.' },
      pathway: {
        type: 'string',
        enum: ['ctis', 'mdr', 'ivdr', 'estar_510k', 'estar_de_novo', 'pmda_shonin'],
        description: 'The target pathway.',
      },
      member_states: {
        type: 'array',
        items: { type: 'string' },
        description: 'CTIS only — concerned EU member-state codes (e.g. ["DE","FR"]).',
      },
    },
    required: ['sequence_id', 'pathway'],
  },
};

export const BUILD_PATHWAY_MANIFEST: AnaTool = {
  name: 'build_pathway_manifest',
  description:
    "Build the assembled table-of-contents for a non-eCTD pathway (EU CTIS, EU MDR/IVDR, FDA eSTAR 510(k)/De Novo, Japan PMDA Shōnin). Reads the sequence's leaves from the active tenant context, projects them onto the pathway's section registry, and returns a uniform ordered manifest: each slot as an entry with a group label (annex / eSTAR / CTIS part+state / STED), a deterministic path, present/missing status, and the source leaves mapped into it. Deterministic, read-only — it maps and reports gaps, it never invents a missing slot and never submits. Use after assess_pathway_readiness when you need the full ordered structure, not just the gap list.",
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'The sequence whose leaves are assembled into the manifest.' },
      pathway: {
        type: 'string',
        enum: ['ctis', 'mdr', 'ivdr', 'estar_510k', 'estar_de_novo', 'pmda_shonin'],
        description: 'The target pathway.',
      },
      member_states: {
        type: 'array',
        items: { type: 'string' },
        description: 'CTIS only — concerned EU member-state codes (e.g. ["DE","FR"]).',
      },
    },
    required: ['sequence_id', 'pathway'],
  },
};

export const LIST_VALIDATION_RULES: AnaTool = {
  name: 'list_validation_rules',
  description:
    "List the named, sourced eCTD validation rule corpus the Submission Center checks against (ICH/FDA/EU/JP criteria). Returns each rule's id, title, category, regions, severity (high/medium/low), rationale, published source, and enforcement (whether the rule is floored by the deterministic dispatch gate, guaranteed by the packager, or requires the agency validator). Static reference data — read-only, not tenant-specific. Use it to explain WHY a validation finding blocks dispatch and to cite the rule behind a gate verdict (a finding's code equals the rule id).",
  input_schema: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        enum: ['fda', 'eu', 'jp'],
        description: 'Optional — scope to one region (includes shared ICH rules). Omit for the full corpus.',
      },
    },
    required: [],
  },
};

export const LOOKUP_REGULATORY_PATHWAY: AnaTool = {
  name: 'lookup_regulatory_pathway',
  description:
    "Look up expedited-development, accelerated-review and early-access pathways across the major global regulators (FDA, EMA, PMDA, MHRA, Health Canada, TGA, NMPA, ANVISA, Swissmedic). Returns the agency, program name, kind, eligibility, benefits and a statute/guidance citation. Static reference data — read-only, not tenant-specific. NOTE: designations and criteria change; confirm eligibility against the agency's current guidance before relying on a pathway. Pass `agency` to list a regulator's programs, `query` to search by goal (e.g. 'breakthrough', 'conditional approval', 'orphan', 'priority review'), or omit both for a summary across agencies.",
  input_schema: {
    type: 'object',
    properties: {
      agency: {
        type: 'string',
        enum: ['FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada', 'TGA', 'NMPA', 'ANVISA', 'Swissmedic'],
        description: 'Optional — scope to one regulator.',
      },
      query: { type: 'string', description: "Goal/keyword to search, e.g. 'breakthrough', 'orphan'." },
    },
    required: [],
  },
};

export const RESOLVE_REGULATORY_STRUCTURE: AnaTool = {
  name: 'resolve_regulatory_structure',
  description:
    "Resolve the DETERMINISTIC submission structure for a region + application type via the reasoning engine (not the LLM): the required CTD sections (regional Module 1 + ICH M4 common Modules 2–5) and the review-clock model. Use this to ground a submission plan's structure — it is rule-resolved and citable, never invented. Covers regions fda|eu|jp and application types ind|nda|bla|maa|cta|anda|510k|pma; unsupported combinations are reported as unsupported (no fabrication). Read-only, deterministic, not tenant-specific.",
  input_schema: {
    type: 'object',
    properties: {
      regions: {
        type: 'array',
        items: { type: 'string' },
        description: "Target regions, e.g. ['fda','eu']. Aliases like 'us'/'europe'/'japan' are accepted.",
      },
      application_type: {
        type: 'string',
        description: "Application type, e.g. 'ind', 'nda', 'maa', '510k'.",
      },
    },
    required: ['regions', 'application_type'],
  },
};

export const GET_MARKET_SUBMISSION_SPEC: AnaTool = {
  name: 'get_market_submission_spec',
  description:
    "Look up the per-market submission specification — the governance + FORMATTING datasheet for a market and submission format. Returns, in one place: accepted file formats / PDF versions / file-naming + size + path limits / checksum, the regional backbone, e-signature basis + sequencing + lifecycle governance, language/translation rules, required forms, template references, and source citations. Covers drug/biologic eCTD (FDA/EU/JP/Health Canada), FDA eSTAR (device 510(k)/De Novo), EU MDR & IVDR technical documentation (EUDAMED), and EU CTIS. Static reference data — read-only, not tenant-specific. Pass `spec_id` (e.g. 'us-ectd', 'eu-mdr') for one spec, or `market` (us|eu|jp|ca) / `family` (ectd|estar|eu_mdr|eu_ivdr|ctis) to filter; omit all for the full registry.",
  input_schema: {
    type: 'object',
    properties: {
      spec_id: { type: 'string', description: "A specific spec id, e.g. 'us-ectd', 'eu-mdr', 'eu-ctis'." },
      market: { type: 'string', description: 'Market code to filter by (us, eu, jp, ca, …).' },
      family: {
        type: 'string',
        enum: ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'],
        description: 'Submission family to filter by.',
      },
    },
    required: [],
  },
};

export const GET_DOCUMENT_TEMPLATE: AnaTool = {
  name: 'get_document_template',
  description:
    "Look up the canonical SECTION STRUCTURE (heading skeleton) of a key submission document — the ordered sections (number + heading + purpose + required) with the regulatory basis. Covers the CTD Module 2 summaries (Quality Overall Summary 2.3, Nonclinical Overview 2.4, Clinical Overview 2.5, Clinical Summary 2.7), the cover letter, the FDA 510(k) Summary (21 CFR 807.92), the EU SmPC, the MDR/IVDR GSPR checklist, the IVDR Performance Evaluation Report, and the CTA IMPD. These are factual document spines from published guidance, not drafted prose — use them to scaffold authoring or to check a document's completeness. Static reference data, read-only. Pass `template_id` for one (e.g. 'clinical_overview', 'k510_summary', 'smpc'), or `family` (ectd|estar|eu_mdr|eu_ivdr|ctis) to list a family's templates.",
  input_schema: {
    type: 'object',
    properties: {
      template_id: { type: 'string', description: "A specific template id, e.g. 'clinical_overview', 'k510_summary', 'smpc', 'gspr_checklist'." },
      family: {
        type: 'string',
        enum: ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'],
        description: 'Submission family to list templates for.',
      },
    },
    required: [],
  },
};

export const VALIDATE_MARKET_FORMATTING: AnaTool = {
  name: 'validate_market_formatting',
  description:
    "Enforce a market's FORMATTING rules against a set of files. Given a market spec id (e.g. 'us-ectd', 'eu-ectd') and a list of file descriptors (fileName, optional filePath, fileSizeBytes, fileFormat, encrypted), it deterministically reports every formatting violation — file-naming pattern, name/path length caps, accepted file types, per-file and total size limits, and encryption ban — with each finding's rule aligned to the validation-rule-corpus id. Read-only; it checks bytes-level conformance before a filing, it does not transmit. Use it to pre-flight an assembled package against the target market.",
  input_schema: {
    type: 'object',
    properties: {
      spec_id: { type: 'string', description: "The market spec id, e.g. 'us-ectd', 'eu-ectd', 'jp-ectd'." },
      leaves: {
        type: 'array',
        description: 'The files to check.',
        items: {
          type: 'object',
          properties: {
            file_name: { type: 'string', description: 'Base file name, e.g. "overview.pdf".' },
            file_path: { type: 'string', description: 'Full relative path within the package.' },
            file_size_bytes: { type: 'number', description: 'File size in bytes.' },
            file_format: { type: 'string', description: 'Format hint, e.g. "PDF".' },
            encrypted: { type: 'boolean', description: 'Whether the file is encrypted / permission-restricted.' },
          },
          required: ['file_name'],
        },
      },
    },
    required: ['spec_id', 'leaves'],
  },
};

export const GET_SUBMISSION_REQUIREMENTS: AnaTool = {
  name: 'get_submission_requirements',
  description:
    "Get the required content for a submission TYPE (ind, nda, bla, anda, 510k, de_novo, pma, maa, cta, jnda, mdr_td, ivdr_td): the required CTD modules, document templates, and forms, with the regulatory basis. Optionally ASSESS a candidate set — pass `present_template_ids`, `present_document_names`, and/or `present_forms` and it returns which required documents/forms are present vs missing (optional documents never block). Read-only, static reference data. Use it to plan a submission or to gap-check what's assembled. Omit `submission_type` to list all types.",
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', description: "e.g. 'nda', '510k', 'maa', 'cta', 'mdr_td'." },
      present_template_ids: { type: 'array', items: { type: 'string' }, description: 'Document-template ids already present (for assessment).' },
      present_document_names: { type: 'array', items: { type: 'string' }, description: 'Document names already present (for assessment).' },
      present_forms: { type: 'array', items: { type: 'string' }, description: 'Forms already present (for assessment).' },
    },
    required: [],
  },
};

export const ASSESS_PATHWAY_ELIGIBILITY: AnaTool = {
  name: 'assess_pathway_eligibility',
  description:
    "Check eligibility for an expedited/special regulatory designation (fda_breakthrough, fda_fast_track, fda_accelerated_approval, fda_priority_review, fda_orphan, eu_prime, eu_orphan, eu_conditional_ma, pmda_sakigake, pmda_orphan). Without `answers` it returns the designation's criteria. With `answers` (a map of criterion id → true/false) it returns eligibility — eligible only when EVERY criterion is met, undetermined while any is unanswered. This is a structured check against the published program definition, NOT the agency's designation decision. Omit `designation` to list all; pass `market` to scope.",
  input_schema: {
    type: 'object',
    properties: {
      designation: { type: 'string', description: "e.g. 'fda_breakthrough', 'eu_prime', 'pmda_sakigake'." },
      market: { type: 'string', description: 'Filter the list by market (us, eu, jp).' },
      answers: { type: 'object', description: 'Map of criterion id → boolean, to assess eligibility.' },
    },
    required: [],
  },
};

export const CLASSIFY_POST_SUBMISSION_CHANGE: AnaTool = {
  name: 'classify_post_submission_change',
  description:
    "Classify a post-approval change into its lifecycle category — FDA supplements (Prior Approval Supplement, CBE-30, CBE-0, Annual Report) or EU variations (Type IA, IAIN, IB, II, Line Extension) — and the canonical sequence type it maps to. Without `flags` it returns the catalog for the market. With `flags` (scope_extension, major_impact, moderate_impact, immediate_safety_change, minimal_impact, eu_immediate_notification) it recommends a category by deterministic precedence. This is a structured decision aid from your flags, NOT the agency's classification decision — confirm against the variation/classification guideline. `market` is 'us' or 'eu'.",
  input_schema: {
    type: 'object',
    properties: {
      market: { type: 'string', enum: ['us', 'eu'], description: "The market: 'us' (FDA supplements) or 'eu' (variations)." },
      flags: {
        type: 'object',
        description: 'Structured change characteristics. Omit to list the category catalog.',
        properties: {
          scope_extension: { type: 'boolean', description: 'New indication/strength/form/route.' },
          major_impact: { type: 'boolean', description: 'Substantial potential impact on safety/efficacy/quality.' },
          moderate_impact: { type: 'boolean', description: 'Moderate potential impact.' },
          immediate_safety_change: { type: 'boolean', description: 'Safety-related change to take effect immediately (US CBE-0).' },
          minimal_impact: { type: 'boolean', description: 'Minimal/no impact (administrative / within validated ranges).' },
          eu_immediate_notification: { type: 'boolean', description: 'EU: requires immediate notification (Type IAIN).' },
        },
      },
    },
    required: ['market'],
  },
};

export const ASSESS_DEVICE_EVIDENCE_STRUCTURE: AnaTool = {
  name: 'assess_device_evidence_structure',
  description:
    "Assess a device/IVD evidence document against its regulated structure. For `document: 'cer'` it checks the CER against MEDDEV 2.7/1 Rev 4 / MDR Annex XIV (set `equivalence_claimed` if equivalence is used); for `document: 'per'` it checks the IVDR Annex XIII Performance Evaluation Report and reports which of the three pillars (scientific validity, analytical, clinical) are covered; for `document: 'rmf'` it checks the ISO 14971 risk management file. Pass `present_section_ids` (the sections you have). Without `present_section_ids` it returns the full structure (stages/pillars/sections + reviewer questions). Deterministic, read-only. Use it to gap-check a CER/PER/RMF before Notified-Body review.",
  input_schema: {
    type: 'object',
    properties: {
      document: { type: 'string', enum: ['cer', 'per', 'rmf'], description: "'cer' (MDR clinical evaluation), 'per' (IVDR performance evaluation), or 'rmf' (ISO 14971 risk management file)." },
      present_section_ids: { type: 'array', items: { type: 'string' }, description: 'Section ids present in the document (for assessment).' },
      equivalence_claimed: { type: 'boolean', description: 'CER only — set true if equivalence to another device is claimed.' },
    },
    required: ['document'],
  },
};

export const CLASSIFY_DEVICE: AnaTool = {
  name: 'classify_device',
  description:
    "Determine a device/IVD risk classification or FDA pathway from structured facts. `framework: 'mdr'` applies the EU MDR Annex VIII principal rules (facts like invasive, surgicallyInvasive, implantable, active, softwareDecisionSupport, contactsCnsOrCentralCirculation, incorporatesMedicinalSubstance, duration) → Class I/IIa/IIb/III with the rule that drove it. `framework: 'ivdr'` applies IVDR Annex VIII (facts like bloodDonationScreening, companionDiagnostic, infectiousOrCancerOrGenetic, selfTesting) → Class A/B/C/D. `framework: 'fda'` recommends a pathway (facts: fdaClass, predicateAvailable, exempt, novelLowModerateRisk) → exempt/510k/de_novo/pma. Each result carries a caveat to confirm against the full Annex / FDA classification database. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      framework: { type: 'string', enum: ['mdr', 'ivdr', 'fda'], description: 'The classification framework.' },
      facts: { type: 'object', description: 'Structured device facts (see description for the keys per framework).' },
    },
    required: ['framework', 'facts'],
  },
};

export const GET_DEVICE_REVIEWER_CHECKLIST: AnaTool = {
  name: 'get_device_reviewer_checklist',
  description:
    "Get the shadow-reviewer checklist for a device submission — the section-anchored questions an FDA or Notified-Body reviewer asks of a 510k, de_novo, pma, cer, or per, each with severity and the regulatory basis. This is the reverse-workflow oversight: what a reviewer will ask of YOUR submission, always-on and independent of risk flags. Use it to pre-empt deficiencies and to ask the client the right questions. Deterministic, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', enum: ['510k', 'de_novo', 'pma', 'cer', 'per'], description: 'The device submission type.' },
    },
    required: ['submission_type'],
  },
};

export const GET_BIOCOMPATIBILITY_ENDPOINTS: AnaTool = {
  name: 'get_biocompatibility_endpoints',
  description:
    "Return the ISO 10993-1 biological-evaluation endpoints a reviewer expects addressed for a device's contact category. Pass `nature` (skin, mucosal_membrane, breached_surface, blood_path_indirect, tissue_bone_dentin, circulating_blood, implant_tissue_bone, implant_blood) and `duration` (limited ≤24h, prolonged >24h–30d, long_term >30d). Returns the endpoint set (cytotoxicity, sensitization, irritation, pyrogenicity, haemocompatibility, implantation, systemic toxicity, genotoxicity, chronic toxicity, carcinogenicity as applicable). Deterministic; the Biological Evaluation Plan determines the actual tests vs. justifications.",
  input_schema: {
    type: 'object',
    properties: {
      nature: { type: 'string', enum: ['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood'], description: 'Nature of body contact.' },
      duration: { type: 'string', enum: ['limited', 'prolonged', 'long_term'], description: 'Duration of contact.' },
    },
    required: ['nature', 'duration'],
  },
};

export const BUILD_DEVICE_BLUEPRINT: AnaTool = {
  name: 'build_device_blueprint',
  description:
    "Build the COMPLETE reverse-workflow blueprint for a device/IVD submission: from the submission type + structured device facts it returns the risk classification, the required documents/forms, the APPLICABLE evidence modules (risk management always; clinical evaluation for mdr_td; performance evaluation for ivdr_td; biocompatibility when body-contacting → ISO 10993 endpoints; software when present → IEC 62304 class + deliverables) each with its gap assessment, and the matching FDA/NB reviewer checklist. This is the one-call planning + oversight view working backward from a submitted application. Deterministic, read-only. `submission_type` ∈ 510k|de_novo|pma|mdr_td|ivdr_td.",
  input_schema: {
    type: 'object',
    properties: {
      submission_type: { type: 'string', enum: ['510k', 'de_novo', 'pma', 'mdr_td', 'ivdr_td'], description: 'The device submission type.' },
      classification: { type: 'object', description: 'Optional { framework: mdr|ivdr|fda, facts: {...} } to classify the device.' },
      contact: { type: 'object', description: 'Optional { nature, duration } — when present, biocompatibility applies.' },
      software: { type: 'object', description: 'Optional { applicable, canContributeToDeathOrSeriousInjury?, canContributeToNonSeriousInjury?, presentDeliverableIds? }.' },
      present: { type: 'object', description: 'Optional { cerSectionIds?, perSectionIds?, rmfSectionIds? } already authored, for gap assessment.' },
      equivalence_claimed: { type: 'boolean', description: 'CER equivalence claim (mdr_td).' },
    },
    required: ['submission_type'],
  },
};

export const ASSESS_STORED_CER: AnaTool = {
  name: 'assess_stored_cer',
  description:
    "Gap-check a STORED Clinical Evaluation Report (an existing cer_reports record + its cer_sections) against the canonical MEDDEV 2.7/1 / MDR Annex XIV structure. Reads the tenant's actual saved CER, maps its populated fields/sections onto the canonical sections, and reports readiness, the missing required sections, and which sections still need clinical-data substantiation. Tenant-scoped (the report must belong to the caller's organization). Pass `report_id` (the cer_reports.report_id) and optionally `equivalence_claimed`. Use this to oversee a real CER in progress, not a hand-supplied section list.",
  input_schema: {
    type: 'object',
    properties: {
      report_id: { type: 'string', description: 'The cer_reports.report_id of the stored CER.' },
      equivalence_claimed: { type: 'boolean', description: 'Set true if equivalence to another device is claimed.' },
    },
    required: ['report_id'],
  },
};

export const BUILD_GLOBAL_DEVICE_STRATEGY: AnaTool = {
  name: 'build_global_device_strategy',
  description:
    "Map how a single device/IVD's evidence carries across the major regions (FDA, EU MDR, EU IVDR, Japan PMDA): which evidence is SHARED via internationally-recognised standards (ISO 14971/10993/13485, IEC 60601/62304/62366 — build once) vs. REGION-SPECIFIC (the clinical/performance argument, labelling, UDI, forms — produce per region), with each region's pathway + registration. `kind` ∈ device|ivd (eu_mdr applies to devices, eu_ivdr to IVDs); optional `regions` to filter. A planning map, not a strategy decision — and a 510(k) SE story does NOT satisfy an MDR CER/IVDR PER. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['device', 'ivd'], description: 'Device or IVD.' },
      regions: { type: 'array', items: { type: 'string', enum: ['fda', 'eu_mdr', 'eu_ivdr', 'pmda'] }, description: 'Optional region filter.' },
    },
    required: ['kind'],
  },
};

export const GET_REGULATORY_TIMELINE: AnaTool = {
  name: 'get_regulatory_timeline',
  description:
    "Get the published review-clock goals + milestones for a submission pathway (510k, de_novo, pma, mdr_ce, ivdr_ce, eu_cta, pmda_device, fda_nda, eu_maa): the ordered milestones (day offsets from submission), the target decision horizon, and whether the clock stops for applicant responses. Honest: EU MDR/IVDR Notified-Body assessment has NO statutory clock (returned as null, not an invented number). These are TARGET/GOAL timelines subject to clock stops and program changes — planning anchors, not commitments. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      pathway: { type: 'string', enum: ['510k', 'de_novo', 'pma', 'mdr_ce', 'ivdr_ce', 'eu_cta', 'pmda_device', 'fda_nda', 'eu_maa'], description: 'The submission pathway.' },
    },
    required: ['pathway'],
  },
};

export const VALIDATE_UDI: AnaTool = {
  name: 'validate_udi',
  description:
    "Validate a device UDI carrier. For a GS1 carrier (the parenthesised AI form, e.g. '(01)00012345678905(17)241231(10)LOT1(21)SER1') it computes the GS1 mod-10 check digit, validates the GTIN-14 UDI-DI, and parses the UDI-PI (11 manufacture date / 17 expiry / 10 lot / 21 serial), then notes the GUDID (FDA) and EUDAMED (EU) registration. HIBCC/ICCBBA carriers are detected but not parsed. Returns udiDiOk + warnings. Exact algorithm, deterministic.",
  input_schema: {
    type: 'object',
    properties: { udi: { type: 'string', description: 'The UDI carrier string (GS1 parenthesised AI form supported).' } },
    required: ['udi'],
  },
};

export const GET_ELECTRICAL_STANDARDS: AnaTool = {
  name: 'get_electrical_standards',
  description:
    "Resolve the applicable IEC 60601 electrical-safety standards for a device from its facts (electricallyPowered, hasAlarms, closedLoopControl, homeUse, emsUse, hasParticularStandard). Returns the general standard + always-on collaterals (EMC, usability) plus the conditional collaterals triggered (alarms 60601-1-8, closed-loop 60601-1-10, home use 60601-1-11, EMS 60601-1-12), the core test categories (means of protection, leakage currents, dielectric, EMC…), and the reviewer questions. Not applicable when the device is not electrically powered. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      electricallyPowered: { type: 'boolean', description: 'Mains/battery powered medical electrical equipment.' },
      hasAlarms: { type: 'boolean', description: 'Generates clinical alarms (→ 60601-1-8).' },
      closedLoopControl: { type: 'boolean', description: 'Has a physiologic closed-loop controller (→ 60601-1-10).' },
      homeUse: { type: 'boolean', description: 'Intended for home/lay use (→ 60601-1-11).' },
      emsUse: { type: 'boolean', description: 'Intended for the EMS environment (→ 60601-1-12).' },
      hasParticularStandard: { type: 'boolean', description: 'A device-type particular standard (60601-2-xx) applies.' },
    },
    required: ['electricallyPowered'],
  },
};

export const GET_STERILIZATION_REQUIREMENTS: AnaTool = {
  name: 'get_sterilization_requirements',
  description:
    "Resolve sterilization requirements for a device from its facts. Pass `sterile` (true/false) and optionally `method` (eo, radiation, steam, dry_heat, vh2o2, aseptic). Returns the governing ISO standard (11135 EO / 11137 radiation / 17665 steam / …), the Sterility Assurance Level (SAL 10⁻⁶ for terminal; aseptic makes no SAL claim), the validation elements (bioburden, dose-setting/half-cycle, EO residuals), the packaging standard (ISO 11607), and the reviewer questions. Not applicable for a non-sterile device. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      sterile: { type: 'boolean', description: 'Whether the device is supplied sterile.' },
      method: { type: 'string', enum: ['eo', 'radiation', 'steam', 'dry_heat', 'vh2o2', 'aseptic', 'unknown'], description: 'Sterilization method, if known.' },
    },
    required: ['sterile'],
  },
};

export const ASSESS_COMBINATION_PRODUCT: AnaTool = {
  name: 'assess_combination_product',
  description:
    "Assess a (possible) combination product under 21 CFR Part 3. Pass `components` (drug/biologic/device — ≥2 distinct types makes it a combination), optionally the `primary_mode_of_action` (the PMOA component) and `combination_type` (single_entity/co_packaged/cross_labeled). Returns whether it's a combination, the FDA lead center from the PMOA (drug→CDER, biologic→CBER, device→CDRH), the EU consideration (MDR Article 117 / medicines framework), and practical considerations (21 CFR Part 4 cGMP, RFD). When the PMOA isn't established it recommends a Request for Designation rather than guessing. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      components: { type: 'array', items: { type: 'string', enum: ['drug', 'biologic', 'device'] }, description: 'The constituent component types.' },
      primary_mode_of_action: { type: 'string', enum: ['drug', 'biologic', 'device'], description: 'The component providing the primary mode of action, if established.' },
      combination_type: { type: 'string', enum: ['single_entity', 'co_packaged', 'cross_labeled'], description: 'How the constituents are combined.' },
    },
    required: ['components'],
  },
};

export const GET_DEVICE_LABELING: AnaTool = {
  name: 'get_device_labeling',
  description:
    "Resolve the labeling requirements for a device from its facts (sterile, singleUse, reusable, implantable, prescriptionOnly, forClinicalInvestigation, hasExpiry, containsMedicinalSubstance). Returns the applicable FDA label elements (21 CFR 801), EU MDR label elements (Annex I §23.2), IFU content sections (Annex I §23.4), the ISO 15223-1 symbols, and reviewer questions — e.g. a sterile device adds the sterilisation method + sterile symbol; a reusable device adds reprocessing instructions; an implant adds the implant-card note. Labeling is a frequent deficiency; this is the required element set, not approved label text. Deterministic.",
  input_schema: {
    type: 'object',
    properties: {
      sterile: { type: 'boolean' }, singleUse: { type: 'boolean' }, reusable: { type: 'boolean' },
      implantable: { type: 'boolean' }, prescriptionOnly: { type: 'boolean' },
      forClinicalInvestigation: { type: 'boolean' }, hasExpiry: { type: 'boolean' },
      containsMedicinalSubstance: { type: 'boolean' },
    },
    required: [],
  },
};

export const ASSESS_QMS: AnaTool = {
  name: 'assess_qms',
  description:
    "Inspect or gap-check a device quality management system against ISO 13485:2016 (with the FDA QSR→QMSR mapping). Without `present_clause_ids` it returns the major clause structure (design controls, purchasing, production, complaints/reporting, nonconforming product, CAPA…) with each clause's FDA mapping (21 CFR 820.x) and auditor questions, plus the QMSR transition note (effective 2026-02-02). With `present_clause_ids` it reports readiness + missing clauses. Static reference + pure assessment, deterministic — an audit-prep aid, not an audit verdict.",
  input_schema: {
    type: 'object',
    properties: {
      present_clause_ids: { type: 'array', items: { type: 'string' }, description: 'Clause ids the QMS has in place (for the readiness assessment).' },
    },
    required: [],
  },
};

export const LIST_REGULATORY_CAPABILITIES: AnaTool = {
  name: 'list_regulatory_capabilities',
  description:
    "List the Submission Center's deterministic regulatory capabilities — each with its category (reference/classification/evidence/oversight/planning/enforcement), description, primary HTTP route, and AnA tool. Use it to discover what regulatory tooling is available (market specs, document templates, requirements, eligibility, device classification, CER/PER/RMF structures, biocompatibility, electrical safety, sterilization, UDI, reviewer checklists, blueprint, global strategy, timelines, dispatch gate). Static reference data, deterministic.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const ASSESS_DISPATCH_READINESS: AnaTool = {
  name: 'assess_dispatch_readiness',
  description:
    "Determine whether an eCTD sequence is clear to dispatch, with every input computed SERVER-SIDE from the canonical core — never a client-supplied number. Returns the authoritative validationErrors (structural defects in the sequence's leaves), the count of open critical Shadow Review findings, and the hard dispatch-gate verdict (cleared + blockers). Deterministic, read-only — it proves readiness, it never transmits. Prefer this over dispatch_qc_check when you need the tamper-proof verdict rather than the AI advisory.",
  input_schema: {
    type: 'object',
    properties: {
      sequence_id: { type: 'number', description: 'The sequence to assess for dispatch readiness.' },
    },
    required: ['sequence_id'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Notification + clinical-study + working-memory tool definitions moved to
// ./notifications-study-memory-tool-defs.ts (decomposition tranche 4) and
// imported at the top of this file, so ALL_ANA_TOOLS_RAW references them
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// QMS + Labeling + Search + Analytics tools (migration 20260511).
// ─────────────────────────────────────────────────────────────────────────────

export const CREATE_QMS_DOCUMENT: AnaTool = {
  name: 'create_qms_document',
  description:
    "Create a controlled QMS document (SOP, WI, form, spec, policy, manual, protocol). Starts in draft; flip to effective via approve_qms_document. Use when the user agrees to write a new procedure or AnA derives one from regulatory analysis.",
  input_schema: {
    type: 'object',
    properties: {
      doc_number: { type: 'string' },
      title:      { type: 'string' },
      doc_type:   { type: 'string', enum: ['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol'] },
      category:   { type: 'string', description: "e.g. design / production / capa / training." },
      version:    { type: 'string' },
    },
    required: ['doc_number', 'title', 'doc_type'],
  },
};

export const APPROVE_QMS_DOCUMENT: AnaTool = {
  name: 'approve_qms_document',
  description:
    "Approve a draft / in-review QMS document and flip status to 'effective'. Stamps approver_id + approved_at; sets effective_date to today (or to the provided override).",
  input_schema: {
    type: 'object',
    properties: {
      document_id:    { type: 'number' },
      effective_date: { type: 'string', description: 'Optional ISO date override.' },
    },
    required: ['document_id'],
  },
};

export const ACK_TRAINING: AnaTool = {
  name: 'ack_training',
  description:
    "Record that a user acknowledged training on a specific QMS document version. Captures method (electronic_signature / attestation / trainer_verified) and optional quiz score. Expires in 365 days for periodic refresh.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number' },
      method:      { type: 'string', enum: ['electronic_signature', 'attestation', 'trainer_verified'] },
      quiz_score:  { type: 'number', minimum: 0, maximum: 100 },
    },
    required: ['document_id'],
  },
};

export const REVISE_QMS_DOCUMENT: AnaTool = {
  name: 'revise_qms_document',
  description:
    "Open a controlled revision of a QMS document (change control). Bumps to the next major version, returns it to draft, clears the prior approval so it must be re-reviewed, and captures the reason for change (21 CFR Part 11). Use when the user wants to revise / update an effective procedure.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number' },
      reason:      { type: 'string', description: 'Reason for change (required).' },
    },
    required: ['document_id', 'reason'],
  },
};

export const RETIRE_QMS_DOCUMENT: AnaTool = {
  name: 'retire_qms_document',
  description:
    "Retire a controlled QMS document — the terminal lifecycle state. Captures an optional reason in the audit trail. Use when the user wants to retire / withdraw a procedure that is no longer in use.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number' },
      reason:      { type: 'string' },
    },
    required: ['document_id'],
  },
};

export const REGISTER_SUPPLIER: AnaTool = {
  name: 'register_supplier',
  description:
    "Add a supplier to the approved supplier list. Criticality drives the kit's audit schedule + supplier-quality-agreement requirements (critical = annual audit + signed QA mandatory).",
  input_schema: {
    type: 'object',
    properties: {
      supplier_name:      { type: 'string' },
      supplier_code:      { type: 'string' },
      scope:              { type: 'string' },
      criticality:        { type: 'string', enum: ['critical', 'major', 'minor'] },
      iso_certifications: { type: 'array', items: { type: 'string' } },
    },
    required: ['supplier_name', 'criticality'],
  },
};

export const LOG_NONCONFORMING_PRODUCT: AnaTool = {
  name: 'log_nonconforming_product',
  description:
    "Log a nonconforming product. After creation, dispositions are set via the disposition endpoint. AnA can chain to fire_notification when source is 'complaint' or 'supplier' to alert reg-affairs.",
  input_schema: {
    type: 'object',
    properties: {
      nc_number:     { type: 'string' },
      device_name:   { type: 'string' },
      lot_or_serial: { type: 'string' },
      source:        { type: 'string', enum: ['in_process', 'final_inspection', 'complaint', 'audit', 'supplier'] },
      description:   { type: 'string' },
    },
    required: ['nc_number', 'description'],
  },
};

export const QMS_CHANGE_CREATE: AnaTool = {
  name: 'qms_change_create',
  description:
    "Raise a controlled change request in the change-control log (ICH Q10 change management / EU GMP Annex 15). Starts in 'proposed'; advance it through the lifecycle with qms_change_transition, and attach related records with qms_change_link. Use when the user wants to raise, open or propose a change.",
  input_schema: {
    type: 'object',
    properties: {
      change_number:              { type: 'string', description: 'e.g. CC-2026-001.' },
      title:                      { type: 'string' },
      description:                { type: 'string' },
      change_type:                { type: 'string', enum: ['document', 'process', 'equipment', 'material', 'supplier', 'method', 'facility', 'computer_system', 'specification', 'other'] },
      classification:             { type: 'string', enum: ['minor', 'major', 'critical'] },
      risk_level:                 { type: 'string', enum: ['low', 'medium', 'high'] },
      reason:                     { type: 'string', description: 'Reason for the change (captured for 21 CFR Part 11).' },
      impact_assessment:          { type: 'string' },
      implementation_plan:        { type: 'string' },
      target_implementation_date: { type: 'string', description: 'ISO date (YYYY-MM-DD).' },
      qms_document_id:            { type: 'number', description: 'Optional QMS document this change controls.' },
    },
    required: ['change_number', 'title'],
  },
};

export const QMS_CHANGE_TRANSITION: AnaTool = {
  name: 'qms_change_transition',
  description:
    "Advance a change through its controlled lifecycle (proposed → under_assessment → approved → in_implementation → verification → closed; or rejected/cancelled). Approval enforces segregation of duties — the approver must differ from the person who proposed the change. A reason-for-change is required (21 CFR Part 11); pass effectiveness_review when closing.",
  input_schema: {
    type: 'object',
    properties: {
      change_id:            { type: 'number' },
      to:                   { type: 'string', enum: ['proposed', 'under_assessment', 'approved', 'rejected', 'in_implementation', 'verification', 'closed', 'cancelled'] },
      reason:               { type: 'string', description: 'Reason-for-change for this governed transition.' },
      effectiveness_review: { type: 'string', description: 'Effectiveness-check outcome — provide when moving to closed.' },
    },
    required: ['change_id', 'to'],
  },
};

export const QMS_CHANGE_LINK: AnaTool = {
  name: 'qms_change_link',
  description:
    "Link a change to a related quality record — a deviation, CAPA, validation protocol, or controlled document — so the change-control log stays traceable end to end. Give the record's reference (its number) and how the change relates to it.",
  input_schema: {
    type: 'object',
    properties: {
      change_id:    { type: 'number' },
      link_type:    { type: 'string', enum: ['deviation', 'capa', 'validation', 'document', 'sop', 'supplier', 'risk', 'other'] },
      linked_ref:   { type: 'string', description: "The record's reference, e.g. DEV-2026-014, CAPA-88, VP-7." },
      linked_label: { type: 'string' },
      relationship: { type: 'string', enum: ['triggered_by', 'addresses', 'requires', 'impacts', 'references'] },
      note:         { type: 'string' },
    },
    required: ['change_id', 'link_type', 'linked_ref'],
  },
};

// ── Clinical Regulatory Evidence (CSR ⇄ FDA CRL ⇄ study design) ──────────────
// These combine CSR evidence and FDA regulatory findings through the shared
// evidence spine. They report precedent + provenance; they never predict an FDA
// decision, never claim a design "will be accepted", and never emit a dose value.

export const SEARCH_CLINICAL_REGULATORY_EVIDENCE: AnaTool = {
  name: 'search_clinical_regulatory_evidence',
  description:
    "Search the shared clinical-regulatory evidence spine — comparable study designs, structured result observations, FDA regulatory findings (CRL deficiencies), regulatory outcomes, and governed design lessons — for an indication/phase. Returns provenance-carrying records, honest about coverage. Use when asked what comparable studies did, what FDA objected to, or what evidence exists.",
  input_schema: {
    type: 'object',
    properties: {
      indication:  { type: 'string' },
      phase:       { type: 'string' },
      query:       { type: 'string', description: 'Free-text keywords (endpoint, deficiency, design term).' },
      entity_types: { type: 'array', items: { type: 'string', enum: ['studies', 'findings', 'outcomes', 'lessons'] }, description: 'Which entities to search; default all.' },
      limit:       { type: 'number' },
    },
    required: [],
  },
};

export const COMPARE_PROPOSED_DESIGN_TO_PRECEDENT: AnaTool = {
  name: 'compare_proposed_design_to_precedent',
  description:
    "Compare a proposed study design to comparable precedent: design distributions, observed effects (with uncertainty), FDA objections affecting similar features, and the data limitations. Returns evidence, not a verdict — it never outputs a binary 'FDA will accept'.",
  input_schema: {
    type: 'object',
    properties: {
      indication:    { type: 'string' },
      phase:         { type: 'string' },
      endpoint:      { type: 'string', description: 'The proposed primary endpoint.' },
      design_type:   { type: 'string' },
      modality:      { type: 'string' },
      population:    { type: 'string' },
      comparator:    { type: 'string' },
    },
    required: ['indication'],
  },
};

export const EXPLAIN_DESIGN_RISK: AnaTool = {
  name: 'explain_design_risk',
  description:
    "Explain the regulatory risk of a proposed design feature (usually an endpoint): supportive precedent, adverse FDA precedent (CRL objections), applicability, unanswered questions, evidence quality and source citations. Never asserts acceptance; absence of objection is not evidence of acceptance.",
  input_schema: {
    type: 'object',
    properties: {
      feature:     { type: 'string', description: 'The design feature / endpoint to assess.' },
      indication:  { type: 'string' },
      phase:       { type: 'string' },
    },
    required: ['feature'],
  },
};

export const STRESS_TEST_PROTOCOL: AnaTool = {
  name: 'stress_test_protocol',
  description:
    "Select the defensible regulatory-stress scenarios for a protocol — reduced effect, higher dropout, missing-not-at-random, subgroup heterogeneity, multiplicity penalty, etc. — DRIVEN by the FDA findings on record (which stress tests are relevant, not arbitrary magnitudes). The values are then run on the existing study-design simulator.",
  input_schema: {
    type: 'object',
    properties: {
      indication:  { type: 'string' },
      phase:       { type: 'string' },
      endpoint:    { type: 'string' },
    },
    required: ['indication'],
  },
};

export const TRACE_DESIGN_RECOMMENDATION: AnaTool = {
  name: 'trace_design_recommendation',
  description:
    "Trace the evidence chain behind a recommendation or claim — from a proposed endpoint through comparable CSR endpoints, observed effects, and FDA objections to the recommendation — so every step is inspectable with its source. Give a spine entity (source/study/finding/outcome/lesson) and its id.",
  input_schema: {
    type: 'object',
    properties: {
      entity_type: { type: 'string', enum: ['source', 'study', 'finding', 'outcome', 'design_lesson'] },
      entity_id:   { type: 'number' },
    },
    required: ['entity_type', 'entity_id'],
  },
};

export const CREATE_LABELING_DOCUMENT: AnaTool = {
  name: 'create_labeling_document',
  description:
    "Open a new labeling document — IFU, package insert, patient label, operator/service manual, quick reference, or box label. Primary language defaults to 'en'; add translations via add_labeling_translation.",
  input_schema: {
    type: 'object',
    properties: {
      program_id:    { type: 'string' },
      device_name:   { type: 'string' },
      doc_kind:      { type: 'string', enum: ['ifu', 'package_insert', 'patient_label', 'operator_manual', 'service_manual', 'quick_ref', 'box_label'] },
      language:      { type: 'string', description: 'BCP 47 (e.g. en, de-DE).' },
      region:        { type: 'string', enum: ['us', 'eu', 'jp', 'global'] },
      udi_di:        { type: 'string' },
    },
    required: ['device_name', 'doc_kind'],
  },
};

export const ADD_LABELING_TRANSLATION: AnaTool = {
  name: 'add_labeling_translation',
  description:
    "Add a translation of an existing labeling document. translation_method covers human, mt_postedited, machine. Set back_translation_verified=true when verified — required for EU MDR Class IIb+ in most member states.",
  input_schema: {
    type: 'object',
    properties: {
      labeling_document_id:       { type: 'number' },
      language:                   { type: 'string', description: 'BCP 47 tag.' },
      translator:                 { type: 'string' },
      translation_method:         { type: 'string', enum: ['human', 'mt_postedited', 'machine'] },
      back_translation_verified:  { type: 'boolean' },
    },
    required: ['labeling_document_id', 'language'],
  },
};

export const ADD_LABELING_SYMBOL: AnaTool = {
  name: 'add_labeling_symbol',
  description:
    "Record an ISO 15223-1 symbol used on a labeling document. symbol_code is the standard's reference number (e.g. '5.4.3' for Caution). required_by lists which regulators require the symbol for this device type.",
  input_schema: {
    type: 'object',
    properties: {
      labeling_document_id: { type: 'number' },
      symbol_code:          { type: 'string' },
      symbol_name:          { type: 'string' },
      description:          { type: 'string' },
      required_by:          { type: 'array', items: { type: 'string' } },
    },
    required: ['labeling_document_id', 'symbol_code', 'symbol_name'],
  },
};

export const GLOBAL_SEARCH: AnaTool = {
  name: 'global_search',
  description:
    "Search across the MDX corpus — programs, artifacts, Q-Subs, audit log, AnA threads, labeling, risk items, clinical studies, UDI records, CDx, LDT, QMS documents. Returns results grouped by type. Use to answer 'find everything about X' user queries before drafting an answer.",
  input_schema: {
    type: 'object',
    properties: {
      q:    { type: 'string', minLength: 2 },
      type: { type: 'string', description: 'Optional CSV of types to restrict to (e.g. program,artifact).' },
      limit:{ type: 'number', minimum: 1, maximum: 100 },
    },
    required: ['q'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy-import tools (migration 20260512).
// ─────────────────────────────────────────────────────────────────────────────

export const START_LEGACY_IMPORT: AnaTool = {
  name: 'start_legacy_import',
  description:
    "Kick off an import of a legacy archive (eCTD zip from FDA/EMA/PMDA, eSTAR bundle, raw 510(k) folder, raw PMA module). The detector sniffs the backbone XML or falls back to filename heuristics and produces a per-file mapping into the kit's canonical sections. Returns the job id; use override_import_mapping for any low-confidence rows and then approve_import to materialize artifacts.",
  input_schema: {
    type: 'object',
    properties: {
      source_path:    { type: 'string', description: 'Absolute path to the uploaded zip / folder.' },
      source_kind:    { type: 'string', enum: ['zip', 'folder', 'tar', 'rar'] },
      source_filename:{ type: 'string', description: 'Original filename for display.' },
      program_id:     { type: 'string', description: 'Optional program (UUID) the archive belongs to.' },
    },
    required: ['source_path'],
  },
};

export const OVERRIDE_IMPORT_MAPPING: AnaTool = {
  name: 'override_import_mapping',
  description:
    "Override the detector's mapping on a specific file in an import job. Use when AnA recognizes a file the detector bucketed as 'attachment' or assigned a wrong CTD section. Sets mapping_source='manual' and confidence=1.0.",
  input_schema: {
    type: 'object',
    properties: {
      import_job_id:        { type: 'number' },
      file_id:              { type: 'number' },
      mapped_ctd_section:   { type: 'string' },
      mapped_section_key:   { type: 'string' },
      mapped_artifact_kind: { type: 'string' },
      status:               { type: 'string', enum: ['pending', 'mapped', 'skipped'] },
    },
    required: ['import_job_id', 'file_id'],
  },
};

export const APPROVE_IMPORT: AnaTool = {
  name: 'approve_import',
  description:
    "Finalize an import job — materialize one concept2cure_artifacts row per file that's in 'mapped' status, attached to the specified projectId. Marks the import job 'completed' and stamps approved_by + approved_at for the 21 CFR Part 11 audit trail.",
  input_schema: {
    type: 'object',
    properties: {
      import_job_id: { type: 'number' },
      project_id:    { type: 'number', description: 'projects.id the imported artifacts will hang off.' },
    },
    required: ['import_job_id', 'project_id'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Native python-docx authoring — canonical Word-grade authoring path.
// Spawns workers/artifact-compute/docx-python-runtime.py inside the isolated
// compute worker (no network egress, bounded timeout) which uses python-docx
// directly: real Document with configured fonts, page margins, headers,
// footers, headings (h0–h3), bullet/numbered lists, tables (pipe-delimited),
// page breaks (--- marker), inline images. Returns the .docx and — when
// output_format='pdf' — chains through headless LibreOffice
// (server/scripts/docx_pdf_pipeline.py) to produce a native-fidelity PDF.
//
// Prefer this over generate_document for paying-client deliverables that
// must look like real Word output (regulatory submissions, investor decks,
// signed cover letters). Keep generate_document for lightweight inline
// composition where JSZip+OOXML fidelity is sufficient.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHOR_DOCX_NATIVE: AnaTool = {
  name: 'author_docx_native',
  description:
    "Author a native Word-grade .docx using python-docx (workers/artifact-compute/docx-python-runtime.py) running inside the isolated compute worker. Real headers, footers, configured fonts (Calibri 11pt), page margins, heading levels, bullet/numbered lists (markdown-style ‐ and 1. prefixes), pipe-delimited tables, page breaks (--- marker), inline base64 images via ![alt](key). When output_format='pdf', the .docx is then converted via headless LibreOffice for native Word→PDF fidelity. Use for regulatory submissions, signed cover letters, paying-client deliverables — anything that must look like real Word output. Tenant-scoped via ToolContext (organizationId, userId, projectId).",
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description:
          'Document title. Used for the title page heading, the running header, and the output filename.',
      },
      content: {
        type: 'string',
        description:
          "Markdown-style content. Supported syntax: '# H1' through '#### H4' headings, '- ' or '* ' for bullets, '1. ' for numbered, '|col|col|' rows + '|---|---|' separator for tables, '---' on its own line for a page break, '![alt](image_key)' for inline images keyed against the images map. Plain paragraphs render as Calibri body text.",
      },
      images: {
        type: 'object',
        description:
          'Optional map of image_key → base64-encoded PNG/JPEG bytes. Referenced from content via ![alt](image_key). Omit if the document has no inline images.',
        additionalProperties: { type: 'string' },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description:
          "Output format. 'docx' returns the python-docx authored Word document; 'pdf' additionally converts via headless LibreOffice. Default 'docx'.",
      },
      pdf_compress: {
        type: 'boolean',
        description:
          'When output_format=pdf, run a Ghostscript compression pass after conversion. Useful for submission gateways that cap file size.',
      },
      pdf_quality: {
        type: 'string',
        enum: ['screen', 'ebook', 'printer', 'prepress', 'default'],
        description:
          "Ghostscript PDFSETTINGS preset when pdf_compress=true. Default 'ebook'.",
      },
    },
    required: ['title', 'content'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCX → PDF — canonical Word-grade rendering. Wraps the Python pipeline
// (server/scripts/docx_pdf_pipeline.py) which shells out to headless
// LibreOffice (`soffice --headless --convert-to pdf`). The .docx remains the
// editable source of truth; the PDF is a downstream rendering with native
// Word fidelity (fonts, headers/footers, page breaks, tables, styles). We
// never render PDF directly via reportlab — see
// docs/architecture/docx-pipeline-canonical-designation.md.
//
// Use after generate_document, fetch_template_and_fill, or
// assemble_ectd_module_from_artifacts when the user asks for a PDF
// deliverable. Optional Ghostscript compression for size-sensitive shipping
// (FDA submission gateways, email attachments).
// ─────────────────────────────────────────────────────────────────────────────

export const CONVERT_DOCX_TO_PDF: AnaTool = {
  name: 'convert_docx_to_pdf',
  description:
    "Convert an existing .docx to a .pdf using headless LibreOffice — the canonical Word-grade rendering path. The .docx must already exist on disk (typically produced by generate_document, fetch_template_and_fill, or assemble_ectd_module_from_artifacts). Returns the path to the produced PDF, plus optional Ghostscript-compressed variant for submission gateways. The .docx is preserved as the editable source; the PDF is a downstream rendering with native fonts, page layout, headers, and footers — not a reportlab-flat render.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description:
          'Absolute path to the source .docx file. Typically the outputPath returned by a prior generate_document / fetch_template_and_fill / assemble_ectd_module_from_artifacts call.',
      },
      output_pdf_path: {
        type: 'string',
        description:
          'Optional output path for the PDF. Defaults to the same directory as the input with a .pdf extension.',
      },
      compress: {
        type: 'boolean',
        description:
          'When true, run a Ghostscript compression pass after conversion. Useful for FDA submission gateways that cap file size.',
      },
      quality: {
        type: 'string',
        enum: ['screen', 'ebook', 'printer', 'prepress', 'default'],
        description:
          "Ghostscript PDFSETTINGS preset. Default 'ebook' (~150dpi, web-grade). Use 'prepress' for color-critical print, 'screen' for the smallest file.",
      },
    },
    required: ['input_docx_path'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// General-purpose scripting sandbox — AnA's "write a Python script to do X
// precisely" capability, governed. Runs AnA-authored Python inside the
// isolated compute worker (workers/artifact-compute/python-script-runtime.py):
// ephemeral tempdir, NO network egress, bounded CPU time + address space, and
// a wall-clock SIGKILL. Optional input files are written into the script's
// working directory; any files the script produces are captured and returned.
//
// Use for data transforms, parsing, numerical checks, building intermediate
// artifacts, and bespoke manipulation that no structured tool covers. This is
// NOT a path to the host filesystem or shell — the sandbox cwd is a throwaway
// tempdir with no network and no access to the application's files.
// ─────────────────────────────────────────────────────────────────────────────

export const RUN_PYTHON_SCRIPT: AnaTool = {
  name: 'run_python_script',
  description:
    "Write and run a Python 3 script in AnA's isolated sandbox to do something precisely — data transforms, parsing, numerical/biostat checks, generating intermediate files, bespoke manipulation no other tool covers. The script runs in an ephemeral tempdir with NO network access, bounded CPU time, bounded memory, and a wall-clock timeout. Provide optional input_files (filename → base64) which are written into the script's working directory; the script reads/writes files relative to its cwd. Returns captured stdout, stderr, any error traceback, and any files the script created (base64, size-capped). The standard library plus python-docx, openpyxl, and common scientific packages available on the host can be imported. This is a sandbox: it cannot reach the network, the host filesystem outside its tempdir, or a shell. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description:
          "The Python 3 source to execute. Runs with __name__ == '__main__' and cwd set to the sandbox tempdir. Print results to stdout and/or write output files relative to cwd — both are returned to you.",
      },
      input_files: {
        type: 'object',
        description:
          'Optional map of filename → base64-encoded bytes, written into the script working directory before execution (e.g. a CSV to parse, a .docx to transform). Filenames must be relative; path traversal is rejected.',
        additionalProperties: { type: 'string' },
      },
      cpu_seconds: {
        type: 'number',
        description: 'Best-effort CPU-time cap in seconds (POSIX). Default 20.',
      },
      timeout_ms: {
        type: 'number',
        description: 'Wall-clock timeout in milliseconds before SIGKILL. Default 30000, max 120000.',
      },
    },
    required: ['code'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Targeted document insertion — the governed, document-aware equivalent of
// "write a Python script to make the targeted insertions precisely". Surgically
// inserts content into an existing .docx at exact anchors (heading text,
// placeholder token, paragraph index, start/end) using python-docx inside the
// isolated worker (workers/artifact-compute/docx-insert-runtime.py). The source
// document is preserved; a new edited .docx is produced with a per-insertion
// outcome report.
//
// Prefer this over author_docx_native when the document already exists and you
// need precise edits rather than full re-authoring (e.g. drop a new subsection
// after "10.3 Statistical Methods", fill a {{SPONSOR}} placeholder, append a
// paragraph at the end). Tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

export const INSERT_DOCUMENT_CONTENT: AnaTool = {
  name: 'insert_document_content',
  description:
    "Make precise, targeted insertions into an existing Word (.docx) document using python-docx in the isolated worker — the governed equivalent of scripting exact edits. Locate anchors by heading text, placeholder token (e.g. {{SPONSOR}}), paragraph index, or document start/end, then insert content before/after the anchor or replace it. Content uses markdown-style paragraph syntax ('#'/'##'/'###' headings, '- '/'* ' bullets, '1. ' numbered, plain lines as body paragraphs). The original .docx is preserved as the source; a new edited .docx is written and its path returned, along with a per-insertion report (applied / anchor_not_found). Use when a document already exists and needs surgical edits rather than full re-authoring. For full document authoring use author_docx_native; for tables/images use that path. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description:
          'Absolute path to the source .docx to edit (typically the docxPath returned by author_docx_native, generate_document, or fetch_template_and_fill).',
      },
      insertions: {
        type: 'array',
        description: 'Ordered list of targeted insertions to apply.',
        items: {
          type: 'object',
          properties: {
            anchor_type: {
              type: 'string',
              enum: ['heading_text', 'placeholder', 'paragraph_index', 'start', 'end'],
              description:
                "How to locate the insertion point. 'heading_text'/'placeholder' match paragraph text, 'paragraph_index' is a 0-based index, 'start'/'end' target the document boundaries (no anchor_value needed).",
            },
            anchor_value: {
              type: 'string',
              description:
                "The heading text, placeholder token, or paragraph index (as a string) to match. Omit for 'start'/'end'.",
            },
            position: {
              type: 'string',
              enum: ['before', 'after', 'replace'],
              description:
                "Where to place content relative to the anchor. Default 'after'. 'replace' with a placeholder substitutes the token inline; 'replace' with another anchor type removes the matched paragraph and inserts in its place.",
            },
            match: {
              type: 'string',
              enum: ['exact', 'contains'],
              description: "For text anchors: 'exact' matches the trimmed paragraph, 'contains' (default) matches a substring.",
            },
            content: {
              type: 'string',
              description:
                "Markdown-style content to insert. Supported: '#'/'##'/'###' headings, '- '/'* ' bullets, '1. ' numbered lists, plain lines as body paragraphs.",
            },
          },
          required: ['anchor_type', 'content'],
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description:
          "Output format. 'docx' (default) returns the edited Word document; 'pdf' additionally converts via headless LibreOffice.",
      },
    },
    required: ['input_docx_path', 'insertions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Raw-OOXML document surgery — the deepest file-engineering path. Unpacks a
// .docx (a ZIP of XML parts), parses word/document.xml as an XML tree (lxml),
// locates text anchors at the paragraph/run level, and surgically inserts new
// <w:p> paragraph blocks (inheriting the anchor's exact formatting) or replaces
// placeholder text — preserving fonts, bold/italic, spacing, and justification
// — then repacks every original ZIP entry and VALIDATES the result. Use when
// edits must land at precise XML locations and inherit the document's existing
// character formatting, beyond what insert_document_content (python-docx object
// level) can address. Tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

export const SURGICAL_DOCX_XML_EDIT: AnaTool = {
  name: 'surgical_docx_xml_edit',
  description:
    "Surgically edit an existing Word (.docx) at the raw OOXML/XML level: unpack the archive, parse word/document.xml, locate text anchors, insert new paragraph blocks that inherit the anchor's formatting (fonts, bold/italic, spacing, justification), or replace placeholder tokens preserving the run's formatting, then repack and validate (well-formedness + python-docx round-trip). Deeper than insert_document_content (which works at the python-docx object level) — use this when you need exact XML placement and faithful inheritance of existing character/paragraph formatting. Returns the edited .docx path, a per-operation report, and a validation report. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description: 'Absolute path to the source .docx to edit (e.g. a docxPath from author_docx_native or an uploaded document).',
      },
      operations: {
        type: 'array',
        description: 'Ordered list of XML-level operations.',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['insert_paragraphs', 'replace_text'],
              description: "'insert_paragraphs' inserts new <w:p> blocks near a text anchor; 'replace_text' swaps a placeholder token in place.",
            },
            anchor_text: { type: 'string', description: 'For insert_paragraphs: the paragraph text to anchor on.' },
            match: { type: 'string', enum: ['exact', 'contains'], description: "Anchor match mode. Default 'contains'." },
            position: { type: 'string', enum: ['before', 'after'], description: "Insert before or after the anchor. Default 'after'." },
            paragraphs: {
              type: 'array',
              items: { type: 'string' },
              description: 'For insert_paragraphs: the new paragraph texts, in order. Each inherits the anchor paragraph/run formatting when inherit_format is true.',
            },
            inherit_format: { type: 'boolean', description: "Clone the anchor's paragraph (w:pPr) and run (w:rPr) properties onto the inserted paragraphs. Default true." },
            find: { type: 'string', description: 'For replace_text: the placeholder/token to find.' },
            replace: { type: 'string', description: 'For replace_text: the replacement text (the run formatting around the token is preserved).' },
          },
          required: ['op'],
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description: "Output format. 'docx' (default) returns the edited Word document; 'pdf' additionally converts via headless LibreOffice.",
      },
    },
    required: ['input_docx_path', 'operations'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Clause-template library — insert a named regulatory building block
// (signature/approval block, cover-letter header, section heading, sponsor
// placeholder swap) into an existing .docx. A curated, field-validated content
// layer over insert_document_content's governed docx-insert worker — the
// productized equivalent of hand-scripting per-document clause helpers. Prefer
// this over insert_document_content when the content is a standard regulatory
// block; drop to insert_document_content for free-form content and to
// surgical_docx_xml_edit for raw-XML formatting inheritance. Tenant-scoped.
// ─────────────────────────────────────────────────────────────────────────────

export const INSERT_CLAUSE_TEMPLATE: AnaTool = {
  name: 'insert_clause_template',
  description:
    "Insert a named regulatory clause/building block into an existing Word (.docx) — signature/approval block, cover-letter header, section heading, or sponsor placeholder swap — via the governed docx-insert worker. Each clause is a curated, field-validated template: supply the clause key and its fields and it renders the block (required-field checks included) and inserts it at the given anchor. clause='signature_block' (fields: signatory_name, signatory_title, organization?, closing?, signature_date?); 'cover_letter_header' (sponsor_name, letter_date, re_line, sponsor_address?, recipient?, submission_type?; defaults to document start); 'section_heading' (heading_text, heading_number?, heading_level? 1–3, intro?); 'sponsor_placeholder_swap' (sponsor_name + optional sponsor_address/submission_date/contact_name/contact_email; replaces {{SPONSOR}}-style tokens already in the document, no anchor needed). Returns the edited .docx path, an applied report, and any field/anchor warnings. Prefer this for standard blocks; use insert_document_content for free-form content. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description:
          'Absolute path to the source .docx to edit (e.g. a docxPath from author_docx_native, generate_document, fetch_template_and_fill, or an uploaded template).',
      },
      clause: {
        type: 'string',
        enum: ['signature_block', 'cover_letter_header', 'section_heading', 'sponsor_placeholder_swap'],
        description: 'Which named regulatory clause/building block to render and insert.',
      },
      fields: {
        type: 'object',
        description:
          'Clause-specific fields (see the tool description for required/optional fields per clause). Values are plain text; multi-line fields (e.g. sponsor_address) are newline-separated.',
      },
      anchor: {
        type: 'object',
        description:
          "Where to place the rendered block. Not used for 'sponsor_placeholder_swap' (it locates its own {{TOKEN}}s).",
        properties: {
          anchor_type: {
            type: 'string',
            enum: ['heading_text', 'placeholder', 'paragraph_index', 'start', 'end'],
            description: "How to locate the insertion point. Defaults: 'end' (most clauses) or 'start' (cover_letter_header).",
          },
          anchor_value: { type: 'string', description: "Heading text, placeholder token, or paragraph index (as a string). Omit for 'start'/'end'." },
          position: { type: 'string', enum: ['before', 'after', 'replace'], description: "Placement relative to the anchor. Default 'after'." },
          match: { type: 'string', enum: ['exact', 'contains'], description: "Text-anchor match mode. Default 'contains'." },
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description: "Output format. 'docx' (default) returns the edited Word document; 'pdf' additionally converts via headless LibreOffice.",
      },
    },
    required: ['input_docx_path', 'clause'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCX validation — open a .docx and confirm it is structurally sound before
// shipping: required parts present ([Content_Types].xml, _rels/.rels,
// word/document.xml), every XML/rels part well-formed, relationship targets
// resolve, and python-docx can re-open it. Closes the "repack-and-validate"
// loop for any document AnA produced (via surgical edits or scripts) or
// received from a client. Tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Container execution — a real Linux container with bash, Python, and file
// manipulation (the native equivalent of Anthropic computer-use), run via a
// hardened `docker run`: dropped capabilities, no-new-privileges, read-only
// root fs, resource limits, non-root user, wall-clock timeout. GATED OFF by
// default; outbound network is a separate explicit opt-in. Use for
// multi-step shell/file workflows that the python sandbox can't express; for
// document surgery prefer surgical_docx_xml_edit / run_python_script.
// ─────────────────────────────────────────────────────────────────────────────

export const RUN_IN_CONTAINER: AnaTool = {
  name: 'run_in_container',
  description:
    "Run a bash script inside a real, hardened Linux container (bash + Python + file tools) — the native computer-use path for multi-step shell/file workflows. The container has dropped Linux capabilities, no privilege escalation, a read-only root filesystem, a size-bounded writable /work directory (the cwd), CPU/memory/PID limits, a non-root user, and a wall-clock timeout. Outbound network is OFF unless the deployment explicitly enables it. Provide optional input_files (filename → base64) written into /work; files the script leaves in /work are returned (base64, size-capped). Returns stdout, stderr, and exit code. This capability is gated by deployment configuration and may be disabled. Prefer run_python_script for pure-Python work and surgical_docx_xml_edit for document edits.",
  input_schema: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: 'The bash script to run inside the container (cwd is /work).',
      },
      input_files: {
        type: 'object',
        description: 'Optional map of filename → base64 bytes, written into /work before the script runs.',
        additionalProperties: { type: 'string' },
      },
      timeout_ms: {
        type: 'number',
        description: 'Wall-clock timeout in milliseconds. Default 60000, max 300000.',
      },
    },
    required: ['script'],
  },
};

export const VALIDATE_DOCX: AnaTool = {
  name: 'validate_docx',
  description:
    "Validate a Word (.docx) document's OOXML/ZIP integrity without modifying it: confirms required parts are present, every XML/rels part is well-formed, relationship targets resolve to real parts, and python-docx can re-open the file. Use after any raw-XML or scripted edit, or on a client-supplied document, to catch silent corruption before it ships. Returns a structured report (ok, parts checked, malformed/missing parts, dangling relationships, paragraph count).",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description: 'Absolute path to the .docx to validate.',
      },
    },
    required: ['input_docx_path'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Content-fidelity verification — proves a freshly built/edited .docx actually
// reproduces the supplied source text (and any required caption/boilerplate
// strings) verbatim, beyond what validate_docx (structural OOXML integrity)
// checks. Extracts the .docx text via the same extraction path AnA reads
// uploads with, diffs it against the source, and asserts each required string
// is present exactly. This is the audited "verify it against your text" step.
// ─────────────────────────────────────────────────────────────────────────────

export const VERIFY_DOCX_AGAINST_SOURCE: AnaTool = {
  name: 'verify_docx_against_source',
  description:
    "Verify that a built or edited Word (.docx) faithfully reproduces a known source text — the audited \"verify it against your text\" step after rebuilding from a template, applying corrections, or appending paragraphs. Unlike validate_docx (which checks OOXML/ZIP structural integrity only), this extracts the document's text and (1) diffs it against expected_text to surface any content divergence, and (2) confirms each entry in required_strings (e.g. caption block, case/sponsor identifiers, sworn-paragraph or boilerplate anchors) appears verbatim. Returns { ok, missingRequiredStrings, divergenceSummary, additions, deletions } — a pass/fail the user and the Part 11 audit trail can cite. Pair with validate_docx for full (structural + content) verification. Tenant-scoped via ToolContext.",
  input_schema: {
    type: 'object',
    properties: {
      input_docx_path: {
        type: 'string',
        description: 'Absolute path to the built/edited .docx to verify (e.g. a docxPath returned by author_docx_native, build_from_template, or surgical_docx_xml_edit).',
      },
      expected_text: {
        type: 'string',
        description: 'The verbatim source text the document is supposed to contain (e.g. the complete text the user provided). The extracted document text is diffed against this. Optional when only required_strings is supplied.',
      },
      required_strings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Strings that MUST appear verbatim in the document (e.g. caption strings, case/sponsor numbers, sworn-paragraph anchors). Each is checked for an exact substring match; any missing entry fails verification.',
      },
    },
    required: ['input_docx_path'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MDX kit-section write-back — closes the loop between AnA's drafting and the
// kit's section editors (K510Surface, PmaSurface, CerSurface). When the model
// has produced a draft section (cover letter, SE discussion, device
// description, software documentation, PMA module narrative, CER body, etc.),
// this tool persists that content into cerv2_510k_sections.content for the
// matching section_key — flagged as draft_source='ana' so the surface can
// render an "AnA drafted this — accept / refine" affordance. Audit-logged.
// ─────────────────────────────────────────────────────────────────────────────

export const WRITE_KIT_SECTION: AnaTool = {
  name: 'write_kit_section',
  description:
    "Write drafted section content back into the MDX kit's section editor (cerv2_510k_sections), so the user sees it inside K510Surface / PmaSurface / CerSurface instead of only in chat. Use after producing a drafted section narrative the user has asked you to author — typical section_keys include 'cover-letter', 'indications-for-use', '510k-summary', 'device-description', 'substantial-equivalence', 'software', 'cybersecurity', 'biocompatibility', 'sterilization', 'electromagnetic', 'performance-bench', 'performance-clinical', 'labeling', 'cer-main', 'cer-pmcf', 'pma-module-1' through 'pma-module-6', 'qsub-briefing', 'qsub-cover'. The section is marked as drafted-by-AnA and surfaces a review affordance; the user accepts or refines from inside the editor. Section row is matched by (organization_id, section_key); tenant-scoped via ToolContext.organizationId. Returns the updated row's id, status, and completionPercentage.",
  input_schema: {
    type: 'object',
    properties: {
      section_key: {
        type: 'string',
        description:
          "Stable section identifier matching cerv2_510k_sections.section_key (e.g. 'substantial-equivalence', 'cybersecurity', 'cer-main').",
      },
      content: {
        type: 'string',
        description:
          'The drafted section content (markdown or plain text). Replaces the existing content of the row. Must be the finished prose intended for review, not raw notes.',
      },
      status: {
        type: 'string',
        enum: ['drafting', 'ready_for_review', 'in_review'],
        description:
          "Workflow status to set. Default 'drafting'. Use 'ready_for_review' when the draft is comprehensive enough for human review.",
      },
      completion_percentage: {
        type: 'number',
        description:
          'Optional explicit completion %. If omitted, status drives a sensible default (drafting=60, ready_for_review=85, in_review=90).',
      },
      summary_note: {
        type: 'string',
        description:
          'One-line note for the audit trail describing what this draft covers (e.g. "drafted SE discussion citing K251234 + reference device").',
      },
    },
    required: ['section_key', 'content'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// eCTD Module Assembly — collects existing artifacts in a project belonging
// to a CTD module prefix (e.g. "3.2.S") and assembles them into a single DOCX
// via masterDocumentBuilder.generateFromScratch. Pure assembly, no AI.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSEMBLE_ECTD_MODULE_FROM_ARTIFACTS: AnaTool = {
  name: 'assemble_ectd_module_from_artifacts',
  description:
    "Collect every artifact in a project whose CTD section starts with a given module prefix (e.g. '3.2.S' for drug substance, '2.5' for clinical overview, '5.3.5' for clinical study reports), order them by section number, and assemble a single DOCX with proper headings. Use when the user has drafted several module sections as separate artifacts and wants the assembled module document for review or submission. Pulls the latest non-archived version of each artifact, dedupes by section, and emits the output to disk. Tenant-scoped via ToolContext.organizationId.",
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'number',
        description: 'Project ID whose artifacts should be assembled.',
      },
      module_number: {
        type: 'string',
        description:
          'CTD module prefix to match on artifact.ctd_section (e.g. "3.2.S", "3.2.P", "2.5", "2.7", "5.3.5"). Trailing dot/wildcard not required.',
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
        description: 'Output format. Defaults to docx.',
      },
    },
    required: ['project_id', 'module_number'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section-aware drafting scaffolds — return a structured outline + anchor
// data that the model uses to draft prose inline in its own response.
// Following the mine_precedents pattern: tool provides STRUCTURE, LLM
// provides PROSE.
// ─────────────────────────────────────────────────────────────────────────────

export const DRAFT_510K_SUBSTANTIAL_EQUIVALENCE: AnaTool = {
  name: 'draft_510k_substantial_equivalence',
  description:
    "Return the canonical FDA 510(k) Substantial Equivalence comparison structure for a subject-vs-predicate device pair, with per-section guidance and the SE table column format. Use when drafting the SE section of a 510(k) — the structure is what FDA reviewers expect, the table format is what the SE summary requires. The tool does NOT draft prose; the model uses the returned structure + the user's device data to draft each section inline. Pair with analyze_predicate_device first if predicate technical details are needed.",
  input_schema: {
    type: 'object',
    properties: {
      predicate_510k_number: {
        type: 'string',
        description: 'Primary predicate K-number (e.g. "K223456").',
      },
      device_name: {
        type: 'string',
        description: 'Subject device name.',
      },
      intended_use: {
        type: 'string',
        description: 'Subject device intended use statement.',
      },
      technology_summary: {
        type: 'string',
        description:
          'Brief summary of subject device technology (energy source, sensors, materials, software, principles of operation).',
      },
    },
    required: ['predicate_510k_number', 'device_name', 'intended_use'],
  },
};

export const DRAFT_CLINICAL_OVERVIEW_M2_5: AnaTool = {
  name: 'draft_clinical_overview_m2_5',
  description:
    "Draft the ICH M4E(R2) Clinical Overview (Module 2.5) — the critical benefit-risk assessment. Two modes: (1) when called with csrs[] (the program's clinical studies), it composes the data-driven overview through the platform's deterministic buildM25ClinicalOverview — the 2.5.1–2.5.6 narrative, the pivotal-efficacy and benefit-risk tables, completeness, and gaps — the same engine the submission package uses, parity with draft_nonclinical_overview_m2_4 / draft_clinical_summary_m2_7; (2) without csrs[], it returns the six-subsection outline with drafting guidance and (with project_id) the project's artifacts for citation. Prefer mode 1 when clinical study data exists; report completeness and gaps honestly.",
  input_schema: {
    type: 'object',
    properties: {
      product_name: {
        type: 'string',
        description: 'Drug substance / product name.',
      },
      indication: {
        type: 'string',
        description: 'Target indication.',
      },
      csrs: {
        type: 'array',
        description: 'Clinical study summaries — when supplied, the Clinical Overview is composed from them (data-driven mode).',
        items: {
          type: 'object',
          properties: {
            studyId: { type: 'string' },
            protocolNumber: { type: 'string' },
            phase: { type: 'string' },
            studyDesign: { type: 'string' },
            primaryEndpoint: { type: 'string' },
            primaryResult: { type: 'string' },
            sampleSize: { type: 'number' },
            ittPopulation: { type: 'number' },
            saeCount: { type: 'number' },
            deathCount: { type: 'number' },
          },
          required: ['protocolNumber', 'phase'],
        },
      },
      development_rationale: { type: 'string', description: 'Disease background / unmet need for 2.5.1 (optional, data-driven mode).' },
      project_id: {
        type: 'number',
        description:
          'Project ID — in outline mode, returns up to 50 existing artifacts so you can pick citations.',
      },
    },
    required: ['product_name', 'indication'],
  },
};

export const BATCH_DRAFT_SECTIONS: AnaTool = {
  name: 'batch_draft_sections',
  description:
    "Draft MANY document sections in ONE parallel batch instead of one section per turn. Use this when the author asks to draft/regenerate several sections at once (e.g. 'draft all the TODO sections in Module 2', 'give me first drafts of 2.4, 2.5 and 2.7'). Each request is a section to draft with its own instructions; they run concurrently (bounded) through the same framework-grade drafting engine used for single sections, so a five-section batch returns in roughly the time of the slowest one rather than five sequential turns. Returns per-section drafted content the author promotes through the governed authoring flow — nothing is auto-saved. Do NOT use it to fabricate quantitative results; where a value is unknown the draft must say so.",
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: 'The sections to draft in parallel (2–20).',
        items: {
          type: 'object',
          properties: {
            section_type: { type: 'string', description: 'Document section / CTD type to draft (e.g. "2.5", "nonclinical_overview", "device_description").' },
            instructions: { type: 'string', description: 'What this section must contain / how to draft it.' },
            existing_content: { type: 'string', description: 'Optional existing content to revise rather than draft from scratch.' },
          },
          required: ['section_type', 'instructions'],
        },
      },
      framework: { type: 'string', description: 'Regulatory framework context (e.g. "FDA", "EMA", "MDR", "IVDR"). Shared across the batch.' },
      submission_type: { type: 'string', description: 'Canonical filing type (e.g. "US_IND", "510k", "IVDR-TF") — unlocks framework-grade authoring for all filing types. Shared across the batch.' },
      project_context: {
        type: 'object',
        description: 'Shared project context applied to every section (device/product name, indication, etc.).',
        properties: {
          deviceName: { type: 'string' },
          deviceType: { type: 'string' },
          indication: { type: 'string' },
          predicateDevice: { type: 'string' },
          classification: { type: 'string' },
        },
      },
    },
    required: ['sections'],
  },
};

export const DRAFT_FDA_IR_RESPONSE: AnaTool = {
  name: 'draft_fda_ir_response',
  description:
    "Parse a pasted FDA Information Request letter, extract the numbered questions, and return a per-question response scaffold with the canonical 3-section format (FDA Question verbatim · Sponsor Response · Supporting Data/Citation) plus cover-letter guidance. Use when the user has received an IR (typically Day 74 RTF or mid-cycle) and needs to draft a response within the 14-day window. The tool extracts questions heuristically (numbered '1.', '1.1', or 'Question N:'); if extraction fails, it tells you so you can paste a more structured version. The model drafts each response inline using the scaffold; the tool itself does not call any AI.",
  input_schema: {
    type: 'object',
    properties: {
      ir_text: {
        type: 'string',
        description:
          'The full text of the Information Request letter (pasted as plain text). PDF parsing is out of scope — paste the text manually.',
      },
    },
    required: ['ir_text'],
  },
};

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
    'or completes the flow with a structured output.',
  input_schema: {
    type: 'object',
    properties: {
      flow_id: {
        type: 'string',
        description: 'The flow ID returned by start_intelligence_flow.',
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
    required: ['flow_id', 'node_id', 'answers'],
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

const ALL_ANA_TOOLS_RAW: AnaTool[] = [
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
