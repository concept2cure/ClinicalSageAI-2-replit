/**
 * Mutation-surface tool definitions — the MDX kit data domain, the beta MDX
 * authoring surface, and the IVD/diagnostic surface. These let AnA take action
 * against those domains rather than only read them.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 7). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` (and the drafting/review tool arrays, where they
 * reference these names) resolve unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

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
      sources: {
        type: 'array',
        description:
          "The passages the text was grounded in, exactly as project_knowledge_search returned them: pass each passage's evidence_source_id (or artifact_id) and its text as excerpt. Every clause of the content that quotes an excerpt verbatim is recorded as a citation of that Data Room source; everything else is recorded as your own assertion. Only sources that exist in this organization are accepted — any other entry is dropped and reported back.",
        items: {
          type: 'object',
          properties: {
            evidence_source_id: { type: 'integer', description: 'cre_evidence_sources.id from a retrieval passage.' },
            artifact_id: { type: 'string', description: 'The retrieval artifact id, when no evidence_source_id was returned.' },
            excerpt: { type: 'string', description: 'The passage text as retrieved (required).' },
            title: { type: 'string' },
          },
          required: ['excerpt'],
        },
      },
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
