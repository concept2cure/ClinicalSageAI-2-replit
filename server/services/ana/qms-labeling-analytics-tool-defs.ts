/**
 * QMS, labeling, search and analytics tool definitions (migration 20260511).
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 7). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` (and the drafting/review tool arrays, where they
 * reference these names) resolve unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

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

export const PROJECT_CSR_EVIDENCE: AnaTool = {
  name: 'project_csr_evidence',
  description:
    "Project THIS tenant's own Clinical Study Reports (csr_reports) into the clinical-regulatory evidence spine so they become searchable precedent (comparable studies + design features). It only links your existing CSRs — it copies no text and mints no findings — and is idempotent (already-projected reports are skipped). Run this once for a workspace whose CSRs are not yet showing up as precedent in search_clinical_regulatory_evidence / compare_proposed_design_to_precedent.",
  input_schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max CSR reports to project this run (1–2000, default 500).' },
    },
    required: [],
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
