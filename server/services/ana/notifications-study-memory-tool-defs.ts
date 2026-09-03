/**
 * Notification, clinical-study and working-memory tool definitions.
 *
 * The operational surface AnA uses to raise actionable state (notifications),
 * work the clinical-study record, and read/write her own working memory —
 * landed together by migration 20260510.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 4). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` references them unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications + clinical-study + memory tools (migration 20260510).
// AnA fires notifications when she identifies actionable state, logs
// clinical study events as she ingests them, and curates her own memory.
// ─────────────────────────────────────────────────────────────────────────────

export const FIRE_NOTIFICATION: AnaTool = {
  name: 'fire_notification',
  description:
    "Create a notification row that lands in the user's inbox + the kit's notification badge. Use when AnA detects something a human needs to act on: a transmittal rejected, a deviation marked major, an LDT milestone due, a residual risk above the acceptance threshold. recipient_user_id targets a person; recipient_role targets a team; both null = org-wide notice. Severity drives sort + visual treatment in the inbox.",
  input_schema: {
    type: 'object',
    properties: {
      recipient_user_id: { type: 'number' },
      recipient_role:    { type: 'string' },
      category: {
        type: 'string',
        enum: [
          'submission_status', 'validation_finding', 'q_sub_response',
          'cdx_pairing', 'ldt_milestone_due', 'gateway_credential_expiring',
          'ana_draft_pending', 'risk_residual_high', 'capa_due',
          'study_deviation', 'enrollment_milestone', 'admin', 'system',
        ],
      },
      severity:      { type: 'string', enum: ['info', 'warning', 'critical'] },
      title:         { type: 'string', description: 'Short one-line headline.' },
      body:          { type: 'string', description: 'Paragraph of context.' },
      resource_type: { type: 'string', description: 'e.g. submission_transmittal, risk_item.' },
      resource_id:   { type: 'string' },
      action_url:    { type: 'string', description: 'In-kit deeplink, e.g. /submissions/42.' },
    },
    required: ['category', 'severity', 'title'],
  },
};

export const CREATE_CLINICAL_STUDY: AnaTool = {
  name: 'create_clinical_study',
  description:
    "Open a new clinical study record (pivotal, feasibility, pilot, post-market, PMS). Phase + study_type are the canonical taxonomy. Returns the study id for follow-up calls (sites, deviations, AEs, endpoints).",
  input_schema: {
    type: 'object',
    properties: {
      program_id:           { type: 'string' },
      study_id:             { type: 'string', description: "Sponsor's internal id." },
      nct_id:               { type: 'string' },
      title:                { type: 'string' },
      phase:                { type: 'string', enum: ['pivotal', 'feasibility', 'pilot', 'post_market', 'pms'] },
      study_type:           { type: 'string', enum: ['rct', 'single_arm', 'observational', 'registry'] },
      primary_endpoint:     { type: 'string' },
      sample_size_planned:  { type: 'number' },
      start_date:           { type: 'string' },
      ide_number:           { type: 'string' },
      irb_approved:         { type: 'boolean' },
    },
    required: ['study_id', 'title'],
  },
};

export const CREATE_CLINICAL_INVESTIGATOR: AnaTool = {
  name: 'create_clinical_investigator',
  description:
    "Register a clinical investigator for financial-disclosure tracking (21 CFR 54). Returns the investigator id for follow-up disclosure calls. Governed + audited; org-scoped from context.",
  input_schema: {
    type: 'object',
    properties: {
      full_name: { type: 'string' },
      role: { type: 'string', enum: ['principal_investigator', 'sub_investigator', 'coordinator', 'other'] },
      institution: { type: 'string' },
      study_id: { type: 'number', description: 'Optional clinical_studies.id to link.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['full_name', 'role'],
  },
};

export const CREATE_FINANCIAL_DISCLOSURE: AnaTool = {
  name: 'create_financial_disclosure',
  description:
    "Open a 21 CFR 54 financial disclosure for an investigator. form_type is DERIVED from has_disclosable_interests (false → Form FDA 3454 certification of none; true → Form FDA 3455 disclosure). Returns the disclosure id. Creates a DRAFT — certification (e-signature) is done in the disclosure panel, not here.",
  input_schema: {
    type: 'object',
    properties: {
      investigator_id: { type: 'number' },
      submission_id: { type: 'number', description: 'The filing this disclosure supports (Module 1).' },
      has_disclosable_interests: { type: 'boolean' },
      disclosure_period_start: { type: 'string', description: 'YYYY-MM-DD.' },
      disclosure_period_end: { type: 'string', description: 'YYYY-MM-DD.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['investigator_id', 'has_disclosable_interests'],
  },
};

export const ADD_DISCLOSURE_INTEREST: AnaTool = {
  name: 'add_disclosure_interest',
  description:
    "Add a disclosable financial interest (one of the four 21 CFR 54.2 categories) to a financial disclosure (a Form FDA 3455). Org-scoped, governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      disclosure_id: { type: 'number' },
      interest_type: { type: 'string', enum: ['COMPENSATION_BY_OUTCOME', 'EQUITY_INTEREST', 'PROPRIETARY_INTEREST', 'SIGNIFICANT_PAYMENTS'] },
      description: { type: 'string' },
      monetary_value: { type: 'number' },
      arrangements_to_minimize_bias: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['disclosure_id', 'interest_type', 'description'],
  },
};

export const REVIEW_FINANCIAL_DISCLOSURE: AnaTool = {
  name: 'review_financial_disclosure',
  description:
    "Run the deterministic 21 CFR 54 completeness gate on a financial disclosure (read-only). Returns cited findings + a risk level (high blocks certification). Use this to tell the user what is missing before they certify.",
  input_schema: {
    type: 'object',
    properties: { disclosure_id: { type: 'number' } },
    required: ['disclosure_id'],
  },
};

export const CREATE_HA_INTERACTION: AnaTool = {
  name: 'create_ha_interaction',
  description:
    "Open a health-authority interaction (agency meeting): Pre-IND, EOP1/EOP2, pre-NDA/pre-BLA, Type A/B/C, or EMA scientific advice. Returns the interaction id for follow-up (questions, commitments). Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      interaction_type: { type: 'string', enum: ['pre_ind', 'eop1', 'eop2', 'pre_nda', 'pre_bla', 'type_a', 'type_b', 'type_c', 'scientific_advice', 'other'] },
      agency: { type: 'string', enum: ['fda', 'ema', 'pmda', 'mhra', 'other'] },
      title: { type: 'string' },
      objective: { type: 'string' },
      submission_id: { type: 'number' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['interaction_type', 'agency', 'title'],
  },
};

export const CREATE_REGULATORY_COMMITMENT: AnaTool = {
  name: 'create_regulatory_commitment',
  description:
    "Record a regulatory commitment (PMR / PMC / REMS / meeting commitment) with its due date and statutory basis (e.g. FDAAA 505(o)(3) for a PMR). Optionally link the source interaction (the meeting that created it) and the submission it supports — both are threaded onto the provenance spine. Returns the commitment id.",
  input_schema: {
    type: 'object',
    properties: {
      commitment_type: { type: 'string', enum: ['pmr', 'pmc', 'rems', 'meeting_commitment', 'other'] },
      description: { type: 'string' },
      due_date: { type: 'string', description: 'YYYY-MM-DD.' },
      regulatory_basis: { type: 'string' },
      source_interaction_id: { type: 'number' },
      submission_id: { type: 'number' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['commitment_type', 'description'],
  },
};

export const REVIEW_COMMITMENT_PORTFOLIO: AnaTool = {
  name: 'review_commitment_portfolio',
  description:
    "Summarize the regulatory commitment portfolio by urgency (overdue / due in 30 / due in 90 / later / undated / closed), read-only. Use to tell the user what is overdue or coming due. Optionally scope to a submission.",
  input_schema: {
    type: 'object',
    properties: { submission_id: { type: 'number' } },
    required: [],
  },
};

export const CREATE_IACUC_PROTOCOL: AnaTool = {
  name: 'create_iacuc_protocol',
  description:
    "Open an IACUC animal-use protocol (PHS Policy / Animal Welfare Act / OLAW). pain_category is the USDA category (B breeding, C no pain, D pain relieved, E unrelieved pain — E needs scientific justification). Returns the protocol id and the recommended review pathway. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      protocol_number: { type: 'string' },
      title: { type: 'string' },
      pain_category: { type: 'string', enum: ['B', 'C', 'D', 'E'] },
      submission_id: { type: 'number', description: 'Optional submission this preclinical work feeds (Module 4).' },
      three_rs_replacement: { type: 'string' },
      three_rs_reduction: { type: 'string' },
      three_rs_refinement: { type: 'string' },
      pain_justification: { type: 'string', description: 'Required for category E.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['protocol_number', 'title', 'pain_category'],
  },
};

export const REGISTER_ANIMAL_COHORT: AnaTool = {
  name: 'register_animal_cohort',
  description:
    "Register an animal cohort (census) on an IACUC protocol: species, strain, planned count, USDA pain category, and housing location. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      protocol_id: { type: 'number' },
      species: { type: 'string' },
      strain: { type: 'string' },
      planned_count: { type: 'number' },
      pain_category: { type: 'string', enum: ['B', 'C', 'D', 'E'] },
      housing_location: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['protocol_id', 'species', 'planned_count', 'pain_category'],
  },
};

export const REVIEW_IACUC_PROTOCOL: AnaTool = {
  name: 'review_iacuc_protocol',
  description:
    "Run the deterministic IACUC completeness gate on a protocol (read-only): the 3 Rs, category-D analgesia / category-E justification, animal numbers, plus continuing-review/expiration status. Returns cited findings + risk level. Use to tell the user what is missing before committee review.",
  input_schema: {
    type: 'object',
    properties: { protocol_id: { type: 'number' } },
    required: ['protocol_id'],
  },
};

export const CREATE_IRB_SUBMISSION: AnaTool = {
  name: 'create_irb_submission',
  description:
    "Open an IRB/IEC human-subjects review submission (revised Common Rule 45 CFR 46 / 21 CFR 56 / ICH E6). risk_level drives the review pathway (greater-than-minimal → full board). Flag vulnerable populations and single-IRB (sIRB) for multi-site studies. Returns the submission id and recommended review type. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      protocol_number: { type: 'string' },
      title: { type: 'string' },
      risk_level: { type: 'string', enum: ['minimal', 'greater_than_minimal'] },
      study_id: { type: 'number' },
      submission_id: { type: 'number', description: 'Optional regulatory submission this ethics approval feeds (Module 5).' },
      involves_vulnerable_populations: { type: 'boolean' },
      vulnerable_population_protections: { type: 'string' },
      is_single_irb: { type: 'boolean' },
      consent_waiver_requested: { type: 'boolean' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['protocol_number', 'title', 'risk_level'],
  },
};

export const ADD_IRB_SITE: AnaTool = {
  name: 'add_irb_site',
  description:
    "Add a participating site to an IRB submission (single-IRB multi-site coordination): site name, PI, and local context. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      irb_submission_id: { type: 'number' },
      site_name: { type: 'string' },
      principal_investigator: { type: 'string' },
      local_context: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['irb_submission_id', 'site_name'],
  },
};

export const REVIEW_IRB_SUBMISSION: AnaTool = {
  name: 'review_irb_submission',
  description:
    "Run the deterministic IRB approval-criteria gate (45 CFR 46.111) on a submission (read-only): informed consent / waiver, vulnerable-population safeguards, sIRB for multi-site, risk-vs-review-type, plus continuing-review status. Returns cited findings + risk level.",
  input_schema: {
    type: 'object',
    properties: { irb_submission_id: { type: 'number' } },
    required: ['irb_submission_id'],
  },
};

export const CREATE_IBC_REGISTRATION: AnaTool = {
  name: 'create_ibc_registration',
  description:
    "Open an IBC biosafety registration (NIH Guidelines / BMBL) for recombinant or synthetic nucleic acid work — the clearance modality-heavy CGT/mRNA programs need. biosafety_level is the declared containment (BSL-1..4); nih_guidelines_section is the experiment category (III-A..III-F/exempt). Returns the registration id and whether convened IBC review is required. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      registration_number: { type: 'string' },
      title: { type: 'string' },
      biosafety_level: { type: 'string', enum: ['BSL-1', 'BSL-2', 'BSL-3', 'BSL-4'] },
      nih_guidelines_section: { type: 'string', enum: ['III-A', 'III-B', 'III-C', 'III-D', 'III-E', 'III-F', 'exempt', 'not_applicable'] },
      submission_id: { type: 'number', description: 'Optional IND-enabling submission this clearance supports.' },
      involves_recombinant_dna: { type: 'boolean' },
      involves_human_gene_transfer: { type: 'boolean' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['registration_number', 'title', 'biosafety_level'],
  },
};

export const ADD_BIOLOGICAL_AGENT: AnaTool = {
  name: 'add_biological_agent',
  description:
    "Add a biological agent to an IBC registration. risk_group is RG1-4; the required containment BSL is DERIVED from the risk group (RG1→BSL-1 … RG4→BSL-4) — you do not set it. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      registration_id: { type: 'number' },
      agent_name: { type: 'string' },
      agent_type: { type: 'string', enum: ['virus', 'bacterium', 'fungus', 'toxin', 'viral_vector', 'cell_line', 'recombinant_construct', 'other'] },
      risk_group: { type: 'string', enum: ['RG1', 'RG2', 'RG3', 'RG4'] },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['registration_id', 'agent_name', 'agent_type', 'risk_group'],
  },
};

export const REVIEW_IBC_REGISTRATION: AnaTool = {
  name: 'review_ibc_registration',
  description:
    "Run the deterministic IBC containment gate on a registration (read-only): does the declared BSL meet the highest containment its agents require, are agents at the right level for their risk group, and does the work need convened IBC review — plus annual-review expiration. Returns cited findings + risk level.",
  input_schema: {
    type: 'object',
    properties: { registration_id: { type: 'number' } },
    required: ['registration_id'],
  },
};

export const CREATE_NONCLINICAL_STUDY: AnaTool = {
  name: 'create_nonclinical_study',
  description:
    "Open a governed nonclinical (tox/pharmacology) study record. study_type drives the CTD Module 4 section (derived automatically). Optionally link the authorizing IACUC protocol and the submission it supports — both are threaded onto the provenance spine. Returns the study id, CTD section, and the required SEND domains. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      study_number: { type: 'string' },
      title: { type: 'string' },
      study_type: { type: 'string', enum: ['single_dose_tox', 'repeat_dose_tox', 'safety_pharmacology', 'genotoxicity', 'carcinogenicity', 'reproductive_tox', 'local_tolerance', 'adme_pk', 'immunotoxicity', 'other'] },
      species: { type: 'string' },
      glp_compliant: { type: 'boolean' },
      testing_facility: { type: 'string' },
      noael: { type: 'string' },
      submission_id: { type: 'number' },
      iacuc_protocol_id: { type: 'number' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['study_number', 'title', 'study_type'],
  },
};

export const REVIEW_SEND_READINESS: AnaTool = {
  name: 'review_send_readiness',
  description:
    "Run the deterministic SEND (CDISC) submission-readiness gate on a nonclinical study (read-only): required domains for the study type, define.xml, nSDRG, and validation status. Returns cited findings, missing domains, and a risk level.",
  input_schema: {
    type: 'object',
    properties: { study_id: { type: 'number' } },
    required: ['study_id'],
  },
};

// ─── Protocol Development (C2C-17) ───────────────────────────────────────────

export const CREATE_PROTOCOL_DOCUMENT: AnaTool = {
  name: 'create_protocol_document',
  description:
    "Start authoring a protocol document for a given kind (iacuc / irb / clinical / ibc). Auto-seeds the kind's templated sections (ICH M11/E6 for clinical, 3Rs for IACUC, 45 CFR 46.111 for IRB). Optionally link an existing governed protocol record. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      protocol_kind: { type: 'string', enum: ['iacuc', 'irb', 'clinical', 'ibc'] },
      title: { type: 'string' },
      protocol_number: { type: 'string' },
      design_type: { type: 'string', enum: ['interventional', 'observational', 'expanded_access', 'animal_study', 'basic_science', 'registry', 'other'] },
      phase: { type: 'string' },
      therapeutic_area: { type: 'string' },
      linked_protocol_id: { type: 'number' },
      synopsis: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['protocol_kind', 'title'],
  },
};

export const UPDATE_PROTOCOL_SECTION: AnaTool = {
  name: 'update_protocol_section',
  description:
    "Write or update a protocol section's content and mark its status (not_started / draft / complete). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { section_id: { type: 'number' }, content: { type: 'string' }, status: { type: 'string', enum: ['not_started', 'draft', 'complete'] }, sources: { type: 'array', description: "The passages the text was grounded in, as project_knowledge_search returned them: each passage's evidence_source_id (or artifact_id) and its text as excerpt. Clauses that quote an excerpt verbatim are recorded as citations of that Data Room source; everything else as your own assertion. Unresolvable entries are dropped and reported back.", items: { type: 'object', properties: { evidence_source_id: { type: 'integer' }, artifact_id: { type: 'string' }, excerpt: { type: 'string' }, title: { type: 'string' } }, required: ['excerpt'] } }, reason: { type: 'string' } },
    required: ['section_id'],
  },
};

export const ADD_PROTOCOL_OBJECTIVE: AnaTool = {
  name: 'add_protocol_objective',
  description:
    "Add an objective + endpoint to a protocol (primary / secondary / exploratory), with an optional analysis timepoint. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'number' }, objective_type: { type: 'string', enum: ['primary', 'secondary', 'exploratory'] }, objective: { type: 'string' }, endpoint: { type: 'string' }, timepoint: { type: 'string' }, reason: { type: 'string' } },
    required: ['document_id', 'objective'],
  },
};

export const ADD_ELIGIBILITY_CRITERION: AnaTool = {
  name: 'add_eligibility_criterion',
  description:
    "Add an inclusion or exclusion eligibility criterion to a protocol. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'number' }, kind: { type: 'string', enum: ['inclusion', 'exclusion'] }, criterion: { type: 'string' }, reason: { type: 'string' } },
    required: ['document_id', 'kind', 'criterion'],
  },
};

export const REVIEW_PROTOCOL_COMPLETENESS: AnaTool = {
  name: 'review_protocol_completeness',
  description:
    "Read-only completeness assessment of a protocol document: percent of required sections complete, cited gaps (missing sections, no objectives, missing eligibility/schedule for clinical/IRB), and whether it is ready to finalize.",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

export const FINALIZE_PROTOCOL_DOCUMENT: AnaTool = {
  name: 'finalize_protocol_document',
  description:
    "Finalize a protocol document. Gated on the deterministic completeness check (all required sections complete + objectives, plus eligibility/schedule for clinical/IRB); rejected with the gaps otherwise. On success it snapshots a major version. Governed + audited (signature).",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' }, reason: { type: 'string' } }, required: ['document_id'] },
};

// ─── Protocol Risk Register (C2C-19) ─────────────────────────────────────────

export const ADD_PROTOCOL_RISK: AnaTool = {
  name: 'add_protocol_risk',
  description:
    "Add a risk to a protocol's risk register, scored on a likelihood × impact matrix (ICH E6(R2) §5.0). Categories: participant_safety, data_integrity, regulatory, operational, privacy, other. Returns the computed risk level. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number' },
      category: { type: 'string', enum: ['participant_safety', 'data_integrity', 'regulatory', 'operational', 'privacy', 'other'] },
      description: { type: 'string' },
      likelihood: { type: 'string', enum: ['rare', 'unlikely', 'possible', 'likely', 'almost_certain'] },
      impact: { type: 'string', enum: ['negligible', 'minor', 'moderate', 'major', 'severe'] },
      mitigation: { type: 'string' },
      owner: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['document_id', 'description'],
  },
};

export const REVIEW_PROTOCOL_RISK_REGISTER: AnaTool = {
  name: 'review_protocol_risk_register',
  description:
    "Read-only protocol risk register: each risk with its inherent and residual scores/levels, plus a summary (counts by level, open high/extreme risks, residual exposure index). Use to see where mitigation is still needed.",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

// ─── Protocol Amendments / Deviations / Reviews / Consent (C2C-18a–d) ─────────

export const CREATE_PROTOCOL_AMENDMENT: AnaTool = {
  name: 'create_protocol_amendment',
  description:
    "Open a protocol amendment against a protocol document. Type (major/minor/administrative) plus the affects-consent / affects-risk flags drive the deterministic review path and reconsent trigger (45 CFR 46.109 / 21 CFR 56.110). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      protocol_document_id: { type: 'number' }, title: { type: 'string' }, amendment_number: { type: 'string' },
      rationale: { type: 'string' }, amendment_type: { type: 'string', enum: ['major', 'minor', 'administrative'] },
      affects_consent: { type: 'boolean' }, affects_risk: { type: 'boolean' }, reason: { type: 'string' },
    },
    required: ['protocol_document_id', 'title'],
  },
};

export const ADD_AMENDMENT_CHANGE: AnaTool = {
  name: 'add_amendment_change',
  description: "Add a specific change (section, previous → proposed text) to a protocol amendment. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { amendment_id: { type: 'number' }, section_ref: { type: 'string' }, change_description: { type: 'string' }, previous_text: { type: 'string' }, proposed_text: { type: 'string' }, reason: { type: 'string' } },
    required: ['amendment_id', 'change_description'],
  },
};

export const REVIEW_AMENDMENT: AnaTool = {
  name: 'review_amendment',
  description: "Read-only amendment readiness: change count, computed review path / reconsent trigger, and any blockers before submission.",
  input_schema: { type: 'object', properties: { amendment_id: { type: 'number' } }, required: ['amendment_id'] },
};

export const REPORT_PROTOCOL_DEVIATION: AnaTool = {
  name: 'report_protocol_deviation',
  description:
    "Report a protocol deviation. Category + severity (and whether it affects safety) drive the deterministic reportability + timeliness assessment (45 CFR 46.108 / ICH E6). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      protocol_document_id: { type: 'number' }, description: { type: 'string' },
      category: { type: 'string', enum: ['enrollment', 'consent', 'procedure', 'safety', 'data', 'other'] },
      severity: { type: 'string', enum: ['minor', 'major', 'critical'] },
      affects_safety: { type: 'boolean' }, root_cause: { type: 'string' }, reason: { type: 'string' },
    },
    required: ['protocol_document_id', 'description'],
  },
};

export const ADD_CAPA_ACTION: AnaTool = {
  name: 'add_capa_action',
  description: "Add a corrective/preventive action (CAPA) to a protocol deviation. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { deviation_id: { type: 'number' }, action: { type: 'string' }, owner: { type: 'string' }, due_date: { type: 'string' }, reason: { type: 'string' } },
    required: ['deviation_id', 'action'],
  },
};

export const REVIEW_DEVIATION: AnaTool = {
  name: 'review_deviation',
  description: "Read-only deviation review: the deviation with its CAPA actions and whether it is ready to close (all CAPA complete/verified).",
  input_schema: { type: 'object', properties: { deviation_id: { type: 'number' } }, required: ['deviation_id'] },
};

export const ASSIGN_PROTOCOL_REVIEWER: AnaTool = {
  name: 'assign_protocol_reviewer',
  description: "Assign a reviewer to a protocol document with a review role (scientific/statistical/ethics/safety/regulatory/general). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { protocol_document_id: { type: 'number' }, reviewer_name: { type: 'string' }, reviewer_user_id: { type: 'number' }, role: { type: 'string', enum: ['scientific', 'statistical', 'ethics', 'safety', 'regulatory', 'general'] }, due_date: { type: 'string' }, reason: { type: 'string' } },
    required: ['protocol_document_id', 'reviewer_name'],
  },
};

export const ADD_PROTOCOL_REVIEW_COMMENT: AnaTool = {
  name: 'add_protocol_review_comment',
  description: "Add a review comment to a protocol document (optionally tied to an assignment / section), with severity (blocking/major/minor/info). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { protocol_document_id: { type: 'number' }, comment: { type: 'string' }, assignment_id: { type: 'number' }, section_ref: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'major', 'minor', 'info'] }, reason: { type: 'string' } },
    required: ['protocol_document_id', 'comment'],
  },
};

export const REVIEW_PROTOCOL_REVIEW_STATUS: AnaTool = {
  name: 'review_protocol_review_status',
  description: "Read-only review-workflow status for a protocol: assignment completion, dispositions, consensus, open blocking comments, and whether a decision can be made.",
  input_schema: { type: 'object', properties: { protocol_document_id: { type: 'number' } }, required: ['protocol_document_id'] },
};

export const CREATE_CONSENT_FORM: AnaTool = {
  name: 'create_consent_form',
  description: "Create an informed-consent form (optionally for a protocol document), auto-seeded with the 45 CFR 46.116 required elements as not-yet-present rows. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { title: { type: 'string' }, protocol_document_id: { type: 'number' }, version: { type: 'string' }, language: { type: 'string' }, reading_level: { type: 'string' }, reason: { type: 'string' } },
    required: ['title'],
  },
};

export const UPDATE_CONSENT_ELEMENT: AnaTool = {
  name: 'update_consent_element',
  description: "Write a consent-form element's content and mark it present. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { element_id: { type: 'number' }, content: { type: 'string' }, present: { type: 'boolean' }, reason: { type: 'string' } },
    required: ['element_id'],
  },
};

export const REVIEW_CONSENT_COMPLETENESS: AnaTool = {
  name: 'review_consent_completeness',
  description: "Read-only consent-form completeness: percent of required 45 CFR 46.116 elements present, missing required elements, and whether it can be approved.",
  input_schema: { type: 'object', properties: { form_id: { type: 'number' } }, required: ['form_id'] },
};

// ─── NIH Data Management & Sharing Plan (C2C-23) ─────────────────────────────

export const CREATE_DMS_PLAN: AnaTool = {
  name: 'create_dms_plan',
  description: "Create an NIH Data Management & Sharing (DMS) plan (optionally linked to a grant proposal and/or protocol document), auto-seeded with the six required DMS plan elements (NIH NOT-OD-21-013) as not-yet-addressed rows. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { title: { type: 'string' }, grant_proposal_id: { type: 'number' }, protocol_document_id: { type: 'number' }, reason: { type: 'string' } },
    required: ['title'],
  },
};

export const UPDATE_DMS_PLAN_ELEMENT: AnaTool = {
  name: 'update_dms_plan_element',
  description: "Write a DMS plan element's narrative content and mark it addressed. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { element_id: { type: 'number' }, content: { type: 'string' }, addressed: { type: 'boolean' }, reason: { type: 'string' } },
    required: ['element_id'],
  },
};

export const REVIEW_DMS_PLAN_COMPLETENESS: AnaTool = {
  name: 'review_dms_plan_completeness',
  description: "Read-only DMS plan completeness: percent of the six required NIH DMS plan elements addressed, the missing elements, and whether the plan can be finalized.",
  input_schema: { type: 'object', properties: { plan_id: { type: 'number' } }, required: ['plan_id'] },
};

export const FINALIZE_DMS_PLAN: AnaTool = {
  name: 'finalize_dms_plan',
  description: "Finalize an NIH DMS plan behind the deterministic completeness gate (all six required elements addressed). Records a governed signature. Governed + audited.",
  input_schema: { type: 'object', properties: { plan_id: { type: 'number' }, reason: { type: 'string' } }, required: ['plan_id'] },
};

// ─── NIH Other Support (C2C-24A) ──────────────────────────────────────────────

export const CREATE_OTHER_SUPPORT: AnaTool = {
  name: 'create_other_support',
  description: "Create an NIH Other Support document for a person (optionally linked to a research-personnel roster row and/or a grant proposal). Add funding-source entries next, then certify. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { person_name: { type: 'string' }, personnel_id: { type: 'number' }, grant_proposal_id: { type: 'number' }, era_commons_id: { type: 'string' }, role: { type: 'string' }, reason: { type: 'string' } },
    required: ['person_name'],
  },
};

export const ADD_OTHER_SUPPORT_ENTRY: AnaTool = {
  name: 'add_other_support_entry',
  description: "Add an Other Support entry (one funding source / resource) to a document: project title, funding source, active/pending status, foreign flag + country, committed person-months (calendar/academic/summer), major goals and overlap statement. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'number' },
      support_type: { type: 'string', enum: ['grant', 'contract', 'in_kind', 'other'] },
      project_title: { type: 'string' },
      funding_source: { type: 'string' },
      status: { type: 'string', enum: ['active', 'pending'] },
      is_foreign: { type: 'boolean' },
      foreign_country: { type: 'string' },
      person_months_calendar: { type: 'number' },
      person_months_academic: { type: 'number' },
      person_months_summer: { type: 'number' },
      major_goals: { type: 'string' },
      overlap_statement: { type: 'string' },
      award_identifier: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['document_id', 'project_title', 'funding_source'],
  },
};

export const REVIEW_OTHER_SUPPORT: AnaTool = {
  name: 'review_other_support',
  description: "Read-only Other Support review: committed person-month totals (active/pending/combined), effort-overcommitment flag (>12 calendar months), and the disclosure-readiness blockers/findings that gate certification (NIH GPS 2.5.1 / NOT-OD-21-073).",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

export const CERTIFY_OTHER_SUPPORT: AnaTool = {
  name: 'certify_other_support',
  description: "Certify an NIH Other Support document behind the deterministic readiness gate (every entry complete, foreign components disclosed, no effort overcommitment). Records a governed signature. Governed + audited.",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' }, reason: { type: 'string' } }, required: ['document_id'] },
};

// ─── NIH Biosketch (C2C-24B) ──────────────────────────────────────────────────

export const CREATE_BIOSKETCH: AnaTool = {
  name: 'create_biosketch',
  description: "Create an NIH biosketch for a person (optionally linked to a research-personnel roster row and/or a grant proposal), auto-seeded with the required NIH biosketch sections (FORMS-H: Personal Statement; Positions/Appointments/Honors; Contributions to Science) as not-yet-addressed rows. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { person_name: { type: 'string' }, personnel_id: { type: 'number' }, grant_proposal_id: { type: 'number' }, biosketch_type: { type: 'string', enum: ['nih', 'nsf', 'other'] }, reason: { type: 'string' } },
    required: ['person_name'],
  },
};

export const UPDATE_BIOSKETCH_SECTION: AnaTool = {
  name: 'update_biosketch_section',
  description: "Write a biosketch section's content and mark it addressed. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { section_id: { type: 'number' }, content: { type: 'string' }, addressed: { type: 'boolean' }, reason: { type: 'string' }, sources: { type: 'array', description: "The passages the text was grounded in, as project_knowledge_search returned them: each passage's evidence_source_id (or artifact_id) and its text as excerpt. Clauses that quote an excerpt verbatim are recorded as citations of that Data Room source; everything else as your own assertion. Unresolvable entries are dropped and reported back.", items: { type: 'object', properties: { evidence_source_id: { type: 'integer' }, artifact_id: { type: 'string' }, excerpt: { type: 'string' }, title: { type: 'string' } }, required: ['excerpt'] } } },
    required: ['section_id'],
  },
};

export const REVIEW_BIOSKETCH_COMPLETENESS: AnaTool = {
  name: 'review_biosketch_completeness',
  description: "Read-only biosketch completeness: percent of the required NIH biosketch sections (FORMS-H) addressed, the missing sections, and whether the biosketch can be finalized.",
  input_schema: { type: 'object', properties: { biosketch_id: { type: 'number' } }, required: ['biosketch_id'] },
};

export const FINALIZE_BIOSKETCH: AnaTool = {
  name: 'finalize_biosketch',
  description: "Finalize an NIH biosketch behind the deterministic completeness gate (all required sections addressed). Records a governed signature. Governed + audited.",
  input_schema: { type: 'object', properties: { biosketch_id: { type: 'number' }, reason: { type: 'string' } }, required: ['biosketch_id'] },
};

// ─── Invention Disclosure / Tech Transfer (C2C-25) ────────────────────────────

export const CREATE_INVENTION_DISCLOSURE: AnaTool = {
  name: 'create_invention_disclosure',
  description: "Create an invention disclosure for the technology-transfer office (optionally linked to a grant proposal). Federal funding starts the Bayh-Dole reporting clock (37 CFR 401.14). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' }, inventors: { type: 'string' }, funding_source: { type: 'string' },
      federal_funding: { type: 'boolean' }, federal_award: { type: 'string' }, disclosure_date: { type: 'string', description: 'yyyy-mm-dd' },
      grant_proposal_id: { type: 'number' }, reason: { type: 'string' },
    },
    required: ['title'],
  },
};

export const UPDATE_INVENTION_DISCLOSURE: AnaTool = {
  name: 'update_invention_disclosure',
  description: "Update an invention disclosure's status / TTO decision and dates (election_date drives the patent-filing clock). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      disclosure_id: { type: 'number' },
      status: { type: 'string', enum: ['submitted', 'under_review', 'elected', 'patent_filed', 'licensed', 'released', 'abandoned'] },
      inventors: { type: 'string' }, funding_source: { type: 'string' }, federal_funding: { type: 'boolean' }, federal_award: { type: 'string' },
      disclosure_date: { type: 'string' }, election_date: { type: 'string' }, decision_rationale: { type: 'string' }, reason: { type: 'string' },
    },
    required: ['disclosure_id'],
  },
};

export const REVIEW_INVENTION_DISCLOSURE: AnaTool = {
  name: 'review_invention_disclosure',
  description: "Read-only invention-disclosure review: the Bayh-Dole reporting deadlines + their status (37 CFR 401.14) and the submission-readiness blockers.",
  input_schema: { type: 'object', properties: { disclosure_id: { type: 'number' }, as_of: { type: 'string', description: 'yyyy-mm-dd (defaults to today)' } }, required: ['disclosure_id'] },
};

export const SUBMIT_INVENTION_DISCLOSURE: AnaTool = {
  name: 'submit_invention_disclosure',
  description: "Submit an invention disclosure for TTO review behind the deterministic readiness gate (title, inventors, funding source, disclosure date; federal award if federally funded). Governed + audited.",
  input_schema: { type: 'object', properties: { disclosure_id: { type: 'number' }, reason: { type: 'string' } }, required: ['disclosure_id'] },
};

// ─── Export Control review (C2C-26) ───────────────────────────────────────────

export const CREATE_EXPORT_CONTROL_REVIEW: AnaTool = {
  name: 'create_export_control_review',
  description: "Open an export-control review for a project (ITAR/EAR/OFAC). Capture jurisdiction, classification (USML/ECCN/EAR99), foreign-national involvement and publication/proprietary restrictions. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      project_title: { type: 'string' }, description: { type: 'string' },
      jurisdiction: { type: 'string', enum: ['itar', 'ear', 'ofac', 'not_subject', 'pending'] },
      classification: { type: 'string' }, involves_foreign_nationals: { type: 'boolean' }, foreign_countries: { type: 'string' },
      has_publication_restrictions: { type: 'boolean' }, has_proprietary_restrictions: { type: 'boolean' }, involves_physical_export: { type: 'boolean' },
      grant_proposal_id: { type: 'number' }, reason: { type: 'string' },
    },
    required: ['project_title'],
  },
};

export const UPDATE_EXPORT_CONTROL_REVIEW: AnaTool = {
  name: 'update_export_control_review',
  description: "Update an export-control review's inputs (jurisdiction, classification, restrictions, foreign-national involvement). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      review_id: { type: 'number' }, project_title: { type: 'string' }, description: { type: 'string' },
      jurisdiction: { type: 'string', enum: ['itar', 'ear', 'ofac', 'not_subject', 'pending'] },
      classification: { type: 'string' }, involves_foreign_nationals: { type: 'boolean' }, foreign_countries: { type: 'string' },
      has_publication_restrictions: { type: 'boolean' }, has_proprietary_restrictions: { type: 'boolean' }, involves_physical_export: { type: 'boolean' },
      reason: { type: 'string' },
    },
    required: ['review_id'],
  },
};

export const REVIEW_EXPORT_CONTROL: AnaTool = {
  name: 'review_export_control',
  description: "Read-only export-control assessment: whether the Fundamental Research Exclusion applies and whether a license is required (ITAR/EAR/OFAC, 15 CFR 734.8), plus the determination-readiness blockers.",
  input_schema: { type: 'object', properties: { review_id: { type: 'number' } }, required: ['review_id'] },
};

export const FINALIZE_EXPORT_CONTROL_DETERMINATION: AnaTool = {
  name: 'finalize_export_control_determination',
  description: "Finalize an export-control determination behind the deterministic readiness gate; persists the computed license-required outcome and FRE finding. Records a governed signature. Governed + audited.",
  input_schema: { type: 'object', properties: { review_id: { type: 'number' }, reason: { type: 'string' } }, required: ['review_id'] },
};

// ─── Research Agreements MTA/DUA/CDA (C2C-27) ─────────────────────────────────

export const CREATE_RESEARCH_AGREEMENT: AnaTool = {
  name: 'create_research_agreement',
  description: "Create a research agreement (MTA/DUA/CDA) for a material or data transfer. Capture parties, direction, the material/data, and PHI/human-data flags that gate execution under HIPAA (45 CFR 164.514). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' }, other_party: { type: 'string' }, our_party: { type: 'string' },
      agreement_type: { type: 'string', enum: ['mta', 'dua', 'cda'] }, direction: { type: 'string', enum: ['incoming', 'outgoing'] },
      material_or_data_description: { type: 'string' }, contains_phi: { type: 'boolean' }, contains_human_data: { type: 'boolean' },
      is_deidentified: { type: 'boolean' }, limited_data_set: { type: 'boolean' }, ip_rights_terms: { type: 'string' }, publication_rights: { type: 'boolean' },
      effective_date: { type: 'string' }, expiration_date: { type: 'string' }, grant_proposal_id: { type: 'number' }, protocol_document_id: { type: 'number' },
      reason: { type: 'string' },
    },
    required: ['title', 'other_party'],
  },
};

export const UPDATE_RESEARCH_AGREEMENT: AnaTool = {
  name: 'update_research_agreement',
  description: "Update a research agreement's terms or status (not executed — use the execute tool). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      agreement_id: { type: 'number' }, title: { type: 'string' }, other_party: { type: 'string' }, our_party: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'under_review', 'negotiation', 'expired', 'terminated'] },
      agreement_type: { type: 'string', enum: ['mta', 'dua', 'cda'] }, direction: { type: 'string', enum: ['incoming', 'outgoing'] },
      material_or_data_description: { type: 'string' }, contains_phi: { type: 'boolean' }, contains_human_data: { type: 'boolean' },
      is_deidentified: { type: 'boolean' }, limited_data_set: { type: 'boolean' }, ip_rights_terms: { type: 'string' }, publication_rights: { type: 'boolean' },
      effective_date: { type: 'string' }, expiration_date: { type: 'string' }, reason: { type: 'string' },
    },
    required: ['agreement_id'],
  },
};

export const REVIEW_RESEARCH_AGREEMENT: AnaTool = {
  name: 'review_research_agreement',
  description: "Read-only research-agreement execution readiness: HIPAA PHI handling blockers (limited data set / de-identification, 45 CFR 164.514), protocol-link and publication-rights findings.",
  input_schema: { type: 'object', properties: { agreement_id: { type: 'number' } }, required: ['agreement_id'] },
};

export const EXECUTE_RESEARCH_AGREEMENT: AnaTool = {
  name: 'execute_research_agreement',
  description: "Execute a research agreement behind the deterministic HIPAA readiness gate (PHI properly handled, parties + material described). Records a governed signature. Governed + audited.",
  input_schema: { type: 'object', properties: { agreement_id: { type: 'number' }, reason: { type: 'string' } }, required: ['agreement_id'] },
};

// ─── Protocol Authoring Extensions (C2C-20: templates / milestones / export) ──

export const CREATE_PROTOCOL_TEMPLATE: AnaTool = {
  name: 'create_protocol_template',
  description: "Create an org protocol template (named, kind-scoped) that can later be cloned into new protocol documents. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string' }, protocol_kind: { type: 'string', enum: ['iacuc', 'irb', 'clinical', 'ibc'] }, design_type: { type: 'string' }, description: { type: 'string' }, reason: { type: 'string' } },
    required: ['name', 'protocol_kind'],
  },
};

export const CLONE_PROTOCOL_TEMPLATE: AnaTool = {
  name: 'clone_protocol_template',
  description: "Clone a protocol template into a new protocol document, seeding its sections (any required catalog section missing from the template is injected automatically). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { template_id: { type: 'number' }, title: { type: 'string' }, protocol_number: { type: 'string' }, reason: { type: 'string' } },
    required: ['template_id', 'title'],
  },
};

export const SAVE_DOCUMENT_AS_TEMPLATE: AnaTool = {
  name: 'save_document_as_template',
  description: "Snapshot an existing protocol document's sections into a new reusable org template. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'number' }, name: { type: 'string' }, description: { type: 'string' }, reason: { type: 'string' } },
    required: ['document_id', 'name'],
  },
};

export const LIST_PROTOCOL_TEMPLATES: AnaTool = {
  name: 'list_protocol_templates',
  description: "Read-only list of the org's protocol templates (optionally filtered by kind).",
  input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['iacuc', 'irb', 'clinical', 'ibc'] } }, required: [] },
};

export const ADD_PROTOCOL_MILESTONE: AnaTool = {
  name: 'add_protocol_milestone',
  description: "Add a milestone to a protocol document's timeline (IRB submission, first/last subject, database lock, CSR, …) with a target date. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'number' }, name: { type: 'string' }, milestone_type: { type: 'string', enum: ['protocol_approval', 'irb_submission', 'site_activation', 'first_subject', 'last_subject', 'enrollment_complete', 'database_lock', 'csr', 'closeout', 'other'] }, target_date: { type: 'string', description: 'YYYY-MM-DD.' }, notes: { type: 'string' }, reason: { type: 'string' } },
    required: ['document_id', 'name'],
  },
};

export const SET_PROTOCOL_MILESTONE_STATUS: AnaTool = {
  name: 'set_protocol_milestone_status',
  description: "Transition a protocol milestone's status (planned/in_progress/met/missed/cancelled); 'met' stamps the actual date. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { milestone_id: { type: 'number' }, status: { type: 'string', enum: ['planned', 'in_progress', 'met', 'missed', 'cancelled'] }, actual_date: { type: 'string' }, reason: { type: 'string' } },
    required: ['milestone_id', 'status'],
  },
};

export const REVIEW_PROTOCOL_TIMELINE: AnaTool = {
  name: 'review_protocol_timeline',
  description: "Read-only protocol timeline: milestones ordered by date with urgency buckets (overdue/due_30/due_90/upcoming), counts, and the next upcoming milestone.",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

export const EXPORT_PROTOCOL_DOCUMENT: AnaTool = {
  name: 'export_protocol_document',
  description: "Read-only: assemble a protocol document (sections + objectives + eligibility + schedule) into a structured export and rendered Markdown.",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

export const GENERATE_CTGOV_REGISTRATION_DRAFT: AnaTool = {
  name: 'generate_ctgov_registration_draft',
  description: "Read-only: generate a ClinicalTrials.gov PRS registration draft (FDAAA 801 data elements: titles, study type, phase, primary/secondary outcomes, eligibility) from a protocol document, with completeness findings.",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

// ─── Protocol Schedule of Assessments (C2C-21) ───────────────────────────────

export const ADD_SOA_ASSESSMENT: AnaTool = {
  name: 'add_soa_assessment',
  description: "Add an assessment (row) to a protocol's schedule-of-assessments matrix (category: lab/imaging/exam/vital_signs/pk/questionnaire/procedure/eligibility/other). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'number' }, name: { type: 'string' }, category: { type: 'string', enum: ['lab', 'imaging', 'exam', 'vital_signs', 'pk', 'questionnaire', 'procedure', 'eligibility', 'other'] }, reason: { type: 'string' } },
    required: ['document_id', 'name'],
  },
};

export const SET_SOA_CELL: AnaTool = {
  name: 'set_soa_cell',
  description: "Mark an assessment as performed at a visit in the SoA matrix (cell = assessment_id × visit_id; visit_id is a protocol_schedule_visits id). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { assessment_id: { type: 'number' }, visit_id: { type: 'number' }, required: { type: 'boolean' }, notes: { type: 'string' }, reason: { type: 'string' } },
    required: ['assessment_id', 'visit_id'],
  },
};

export const REVIEW_SOA_MATRIX: AnaTool = {
  name: 'review_soa_matrix',
  description: "Read-only schedule-of-assessments matrix for a protocol: assessments × visits grid plus validation findings (empty visits, unscheduled assessments, screening coverage; ICH M11).",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

// ─── Protocol Budget & Feasibility (C2C-22) ──────────────────────────────────

export const ADD_PROTOCOL_BUDGET_ITEM: AnaTool = {
  name: 'add_protocol_budget_item',
  description: "Add a per-subject budget line item to a protocol (category, unit cost, quantity per subject, payer). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'number' }, category: { type: 'string', enum: ['personnel', 'procedure', 'lab', 'imaging', 'overhead', 'equipment', 'patient_stipend', 'other'] }, description: { type: 'string' }, unit_cost: { type: 'number' }, quantity_per_subject: { type: 'number' }, payer: { type: 'string', enum: ['sponsor', 'institution', 'other'] }, reason: { type: 'string' } },
    required: ['document_id', 'description', 'unit_cost'],
  },
};

export const SET_PROTOCOL_BUDGET_PARAMS: AnaTool = {
  name: 'set_protocol_budget_params',
  description: "Set a protocol's budget parameters (target enrollment, sponsor payment per subject, F&A/indirect rate %). Upsert — one per document. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'number' }, target_enrollment: { type: 'number' }, sponsor_payment_per_subject: { type: 'number' }, indirect_rate_pct: { type: 'number' }, reason: { type: 'string' } },
    required: ['document_id'],
  },
};

export const REVIEW_PROTOCOL_BUDGET: AnaTool = {
  name: 'review_protocol_budget',
  description: "Read-only protocol budget & feasibility: per-category + per-subject direct cost, indirect (F&A), total per subject, total study cost across enrollment, sponsor revenue, margin, and the feasibility verdict (funded / under_funded / unknown).",
  input_schema: { type: 'object', properties: { document_id: { type: 'number' } }, required: ['document_id'] },
};

// ─── CITI Training full integration (C2C-01/02) ──────────────────────────────

export const IMPORT_CITI_RECORDS: AnaTool = {
  name: 'import_citi_records',
  description:
    "Import CITI Program training completion records for a person on the research-personnel roster (training type, completion + expiry dates, certificate reference). Bulk insert. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      personnel_id: { type: 'number' },
      records: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            training_type: { type: 'string', enum: ['citi_human_subjects', 'citi_gcp', 'citi_animal', 'citi_rcr', 'biosafety', 'bloodborne_pathogens', 'iata_shipping', 'hipaa', 'fcoi_disclosure', 'other'] },
            completed_date: { type: 'string', description: 'YYYY-MM-DD.' },
            expires_date: { type: 'string', description: 'YYYY-MM-DD.' },
            certificate_ref: { type: 'string' },
          },
          required: ['training_type'],
        },
      },
      reason: { type: 'string' },
    },
    required: ['personnel_id', 'records'],
  },
};

export const REVIEW_TRAINING_MATRIX: AnaTool = {
  name: 'review_training_matrix',
  description:
    "Read-only org training matrix: every person on the roster with each of their CITI/training records and its currency status (current / expiring / expired / missing), plus summary counts. Use to see who is cleared and who needs recertification.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const REVIEW_EXPIRING_TRAINING: AnaTool = {
  name: 'review_expiring_training',
  description:
    "Read-only report of training records expiring within a window (default 60 days), soonest first, so programs can recertify before lapse. Optionally pass within_days.",
  input_schema: { type: 'object', properties: { within_days: { type: 'number' } }, required: [] },
};

// ─── Intelligent Grant Finder (C2C-14) ───────────────────────────────────────

export const SET_FUNDING_PROFILE: AnaTool = {
  name: 'set_funding_profile',
  description:
    "Set the organization's funding profile — research keywords, target agencies, preferred mechanisms, institution type, and award-size range — that the intelligent opportunity finder matches against. One profile per org (upsert). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      keywords: { type: 'array', items: { type: 'string' }, description: 'Research foci / keywords.' },
      agencies: { type: 'array', items: { type: 'string', enum: ['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other'] } },
      mechanisms: { type: 'array', items: { type: 'string', enum: ['sbir', 'sttr', 'r01', 'r21', 'u01', 'p01', 'contract', 'cooperative_agreement', 'other'] } },
      institution_type: { type: 'string', description: 'e.g. higher_ed, nonprofit, small_business.' },
      min_award: { type: 'number' },
      max_award: { type: 'number' },
      reason: { type: 'string' },
    },
    required: [],
  },
};

export const FIND_GRANT_OPPORTUNITIES: AnaTool = {
  name: 'find_grant_opportunities',
  description:
    "Intelligently discover funding opportunities: searches Grants.gov, hydrates the top candidates, and ranks every opportunity against the org's funding profile with a transparent fit score (0-100) and per-factor reasons (keyword overlap, agency/mechanism fit, deadline window, award size, eligibility). Read-only. Optionally pass a query to seed/override the search; without a stored profile a query is required.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional keyword/topic to seed or override the profile search.' },
      limit: { type: 'number', description: 'Max opportunities to score (default 25, max 50).' },
    },
    required: [],
  },
};

export const REVIEW_PROTOCOL_PORTFOLIO_ANALYTICS: AnaTool = {
  name: 'review_protocol_portfolio_analytics',
  description:
    "Read-only expiration & continuing-review analytics across all IACUC protocols and IRB submissions: counts by urgency bucket (expired / due in 30 / due in 90 / current), the overdue and expiring-soon lists, and a single prioritized 'needs attention' list with regulatory citations (PHS Policy IV.C.5 de novo; 45 CFR 46.109 annual). Use to manage many protocols and surface what is due.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

// ─── Research Committee Governance (C2C-16) ──────────────────────────────────

export const ASSIGN_COMMITTEE_MEMBER: AnaTool = {
  name: 'assign_committee_member',
  description:
    "Add a member to an IACUC / IRB / IBC committee with their stakeholder role (chair, vice_chair, member, veterinarian, nonscientist, community_member, coordinator, administrator). Composition is checked against the regulatory minimums (PHS Policy / 45 CFR 46.107). Governed + audited; requires the 'assign' privilege.",
  input_schema: {
    type: 'object',
    properties: {
      committee_type: { type: 'string', enum: ['iacuc', 'irb', 'ibc'] },
      member_name: { type: 'string' },
      role: { type: 'string', enum: ['chair', 'vice_chair', 'member', 'veterinarian', 'nonscientist', 'community_member', 'coordinator', 'administrator'] },
      user_id: { type: 'number', description: 'Platform user id (for role-gated privileges).' },
      personnel_id: { type: 'number', description: 'research_personnel id (where CITI training is tracked).' },
      voting_member: { type: 'boolean' },
      scientist: { type: 'boolean' },
      affiliated: { type: 'boolean' },
      reason: { type: 'string' },
    },
    required: ['committee_type', 'member_name'],
  },
};

export const CONVENE_COMMITTEE_MEETING: AnaTool = {
  name: 'convene_committee_meeting',
  description:
    "Convene a scheduled committee meeting with the members present, computing quorum (a majority of voting members, plus a nonscientist present for the IRB — 45 CFR 46.108). Returns whether quorum is met. Governed + audited; requires the 'assign' privilege.",
  input_schema: {
    type: 'object',
    properties: {
      meeting_id: { type: 'number' },
      present_member_ids: { type: 'array', items: { type: 'number' }, description: 'committee_members ids recorded present.' },
      reason: { type: 'string' },
    },
    required: ['meeting_id', 'present_member_ids'],
  },
};

export const ADD_COMMITTEE_AGENDA_ITEM: AnaTool = {
  name: 'add_committee_agenda_item',
  description:
    "Add a protocol to a meeting agenda for committee review — references an existing iacuc_protocol or irb_submission. Governed + audited; requires the 'assign' privilege.",
  input_schema: {
    type: 'object',
    properties: {
      meeting_id: { type: 'number' },
      protocol_kind: { type: 'string', enum: ['iacuc_protocol', 'irb_submission'] },
      protocol_id: { type: 'number' },
      title: { type: 'string' },
      review_type: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['meeting_id', 'protocol_kind', 'protocol_id', 'title'],
  },
};

export const CAST_COMMITTEE_VOTE: AnaTool = {
  name: 'cast_committee_vote',
  description:
    "Cast (or change) a committee member's vote on an agenda item during a convened meeting (the poll): approve, approve_with_modifications, disapprove, abstain, or recuse. The voter must be an active voting member recorded present. Governed + audited; requires the 'review' privilege.",
  input_schema: {
    type: 'object',
    properties: {
      agenda_item_id: { type: 'number' },
      member_id: { type: 'number' },
      vote: { type: 'string', enum: ['approve', 'approve_with_modifications', 'disapprove', 'abstain', 'recuse'] },
      comment: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['agenda_item_id', 'member_id', 'vote'],
  },
};

export const FINALIZE_COMMITTEE_DETERMINATION: AnaTool = {
  name: 'finalize_committee_determination',
  description:
    "Finalize an agenda item by tallying the poll into the deterministic determination (approved / approved_with_modifications / disapproved / tabled). Gated: a convened meeting WITH quorum, the 'approve' privilege, AND current CITI training for the finalizing actor (citi_human_subjects for IRB, citi_animal for IACUC). Governed + audited (signature).",
  input_schema: {
    type: 'object',
    properties: { agenda_item_id: { type: 'number' }, reason: { type: 'string' } },
    required: ['agenda_item_id'],
  },
};

export const REVIEW_PROTOCOL_PORTFOLIO: AnaTool = {
  name: 'review_protocol_portfolio',
  description:
    "Read-only portfolio across all IACUC protocols and IRB submissions for the org — status, review type, approval/expiration dates — plus any pending committee agenda items. Use to manage many protocols at once and surface what is due for review or expiring.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

// ─── Medicare Coverage Analysis (C2C-15) ─────────────────────────────────────

export const CREATE_COVERAGE_ANALYSIS: AnaTool = {
  name: 'create_coverage_analysis',
  description:
    "Open a Medicare Coverage Analysis for a clinical trial (NCD 310.1 routine costs in clinical trials). Optionally link the clinical study (study_id), the IRB submission it sits under (irb_submission_id — threads provenance), the ClinicalTrials.gov id (nct_id), and the sponsor. Returns the analysis id. Governed + audited, org-scoped. Advisory only — final billing remains the institution's responsibility.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      study_id: { type: 'number' },
      irb_submission_id: { type: 'number' },
      nct_id: { type: 'string', description: 'ClinicalTrials.gov identifier (e.g. NCT01234567).' },
      sponsor: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['title'],
  },
};

export const SET_COVERAGE_QUALIFYING_DETERMINATION: AnaTool = {
  name: 'set_coverage_qualifying_determination',
  description:
    "Make the NCD 310.1 'qualifying clinical trial' determination for a coverage analysis — the gate for Medicare coverage of routine costs. A trial is deemed qualifying (IND / IDE Category B / AHRQ- or federally-funded), else all three required criteria must hold (therapeutic intent, enrolls patients with the condition, principal purpose within a Medicare benefit category). The seven desirable characteristics are advisory. The determination is computed deterministically. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      analysis_id: { type: 'number' },
      has_therapeutic_intent: { type: 'boolean' },
      enrolls_diagnosis_treatment: { type: 'boolean' },
      has_medicare_benefit_category: { type: 'boolean' },
      deemed_qualifying: { type: 'boolean', description: 'IND / IDE Cat B / AHRQ- or federally-funded — auto-qualifies.' },
      desirable_characteristics_count: { type: 'number', description: '0..7, advisory only.' },
      reason: { type: 'string' },
    },
    required: ['analysis_id', 'has_therapeutic_intent', 'enrolls_diagnosis_treatment', 'has_medicare_benefit_category'],
  },
};

export const ADD_COVERAGE_ITEM: AnaTool = {
  name: 'add_coverage_item',
  description:
    "Add a protocol procedure / service / visit item to a coverage analysis: description, category, optional CPT/HCPCS code (free text — AMA-licensed, never keyed on), an ICD-10 indication, and whether the item is standard-of-care and whether the sponsor pays for it. The item starts unclear / on hold until classified. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      analysis_id: { type: 'number' },
      item_description: { type: 'string' },
      category: { type: 'string', enum: ['procedure', 'lab', 'imaging', 'drug_administration', 'visit', 'device', 'other'] },
      cpt_hcpcs_code: { type: 'string' },
      icd10_code: { type: 'string' },
      is_standard_of_care: { type: 'boolean' },
      sponsor_paid_in_budget: { type: 'boolean' },
      reason: { type: 'string' },
    },
    required: ['analysis_id', 'item_description'],
  },
};

export const CLASSIFY_COVERAGE_ITEM: AnaTool = {
  name: 'classify_coverage_item',
  description:
    "Run the DETERMINISTIC NCD 310.1 billing-designation classifier on a coverage item. The designation is computed from the parent analysis's qualifying determination plus the standard-of-care and sponsor-paid flags: sponsor-paid → bill the sponsor (anti double-billing); standard-of-care → bill the usual payer; qualifying-trial routine cost → bill Medicare; otherwise → hold. Any AI text is advisory rationale only. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'number' },
      is_standard_of_care: { type: 'boolean' },
      sponsor_paid_in_budget: { type: 'boolean' },
      ncd_citation: { type: 'string' },
      lcd_citation: { type: 'string' },
      coverage_doc_url: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['item_id', 'is_standard_of_care', 'sponsor_paid_in_budget'],
  },
};

export const REVIEW_COVERAGE_ANALYSIS: AnaTool = {
  name: 'review_coverage_analysis',
  description:
    "Read-only review of a coverage analysis: the exportable billing grid (per-designation summary) and the readiness verdict — qualifying determination made, every item classified (no unclear/hold), ICD-10 validated — with cited blockers (NCD 310.1). Use before finalizing.",
  input_schema: {
    type: 'object',
    properties: { analysis_id: { type: 'number' } },
    required: ['analysis_id'],
  },
};

// ─── Grants & Sponsored Programs (proposal → award → closeout) ────────────────
// Extracted verbatim to ./grants-management-tool-defs.ts (decomposition
// tranche 4a). Re-exported here so this module's aggregate export surface —
// and the import block in AnaToolDefinitions.ts — stay exactly as before.
export {
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
} from './grants-management-tool-defs.js';

export const RESEARCH_COMPLIANCE_BRIEFING: AnaTool = {
  name: 'research_compliance_briefing',
  description:
    "Cross-domain 'what needs my attention' briefing for research compliance & sponsored programs (read-only). Fans across the report providers and returns a prioritized list of time-sensitive items — overdue HA commitments, expiring IACUC protocols, expired training, unmanaged COI / foreign-nexus disclosures, effort recertifications, grant closeouts/over-spends/unscreened subawards/cost-share shortfalls/pending NCEs, open inspection findings, and unsigned FCOI disclosures — each cited to the regulation that makes it matter. Use to answer 'what's overdue / at risk across the org?'.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const TRIAGE_COMPLIANCE_ATTENTION: AnaTool = {
  name: 'triage_compliance_attention',
  description:
    "Turn the cross-domain compliance briefing into ACTION: for each CRITICAL attention item (overdue commitments/closeouts, expired training, unmanaged COI, unscreened subawards, over-spends, expiring IACUC, overdue lifecycle obligations) create a high-priority review task in the platform's central task list (unified_tasks). Idempotent — a critical item already tracked is left alone, so re-running won't duplicate. Governed + audited. Use after research_compliance_briefing to dispatch the work.",
  input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: [] },
};

export const FULFILL_REGULATORY_COMMITMENT: AnaTool = {
  name: 'fulfill_regulatory_commitment',
  description:
    "Mark a regulatory commitment (PMR/PMC/REMS/meeting commitment) fulfilled, optionally with the date it was met. Closes the commitment lifecycle. Governed + audited, org-scoped.",
  input_schema: { type: 'object', properties: { commitment_id: { type: 'number' }, fulfilled_date: { type: 'string', description: 'YYYY-MM-DD.' }, reason: { type: 'string' } }, required: ['commitment_id'] },
};

export const REVIEW_HA_INTERACTION: AnaTool = {
  name: 'review_ha_interaction',
  description:
    "Assess a health-authority interaction's meeting readiness (read-only): whether a briefing package and a specific question list are in place by the time the meeting is scheduled/held, with cited findings (FDA Formal Meetings guidance / PDUFA). Use to tell the user if a meeting is ready.",
  input_schema: { type: 'object', properties: { interaction_id: { type: 'number' } }, required: ['interaction_id'] },
};

export const PREPARE_MEETING_PACKAGE: AnaTool = {
  name: 'prepare_meeting_package',
  description:
    "One-shot pre-meeting package for a health-authority interaction (read-only orchestration): the readiness verdict (briefing book + question list present by the time it's scheduled/held, FDA Formal Meetings/PDUFA), the open questions (no agreement yet), and the commitments that originated from this interaction with their status — folded into a prioritized 'before the meeting' action list. Use to answer 'are we ready for this FDA meeting and what's left?'.",
  input_schema: { type: 'object', properties: { interaction_id: { type: 'number' } }, required: ['interaction_id'] },
};

export const REGISTER_CONTROLLED_SUBSTANCE: AnaTool = {
  name: 'register_controlled_substance',
  description:
    "Register a controlled substance under a DEA registration so transactions can be booked against it (21 CFR 1304 perpetual inventory). Specify the DEA schedule (I–V); optionally link the DEA registration and set the unit. Governed + audited. Pair with log_cs_transaction to maintain the running balance.",
  input_schema: {
    type: 'object',
    properties: { substance_name: { type: 'string' }, dea_schedule: { type: 'string', enum: ['I', 'II', 'III', 'IV', 'V'] }, unit: { type: 'string' }, dea_registration_id: { type: 'number' }, reason: { type: 'string' } },
    required: ['substance_name', 'dea_schedule'],
  },
};

export const CREATE_RIM_PRODUCT: AnaTool = {
  name: 'create_rim_product',
  description:
    "Open a product in the RIM (Regulatory Information Management) registry for registration-grid and labeling tracking. Returns the product id. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      product_name: { type: 'string' },
      inn: { type: 'string', description: 'International Nonproprietary Name.' },
      dosage_form: { type: 'string' },
      atc_code: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['product_name'],
  },
};

export const SET_REGISTRATION_STATUS: AnaTool = {
  name: 'set_registration_status',
  description:
    "Upsert a product's registration status in a country/market (the RIM grid): planned/submitted/under_review/approved/withdrawn/suspended/cancelled, with registration number, MA holder, approval and renewal dates. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      product_id: { type: 'number' },
      country: { type: 'string', description: "ISO country (e.g. 'US','DE') or 'EU'." },
      market_status: { type: 'string', enum: ['planned','submitted','under_review','approved','withdrawn','suspended','cancelled'] },
      registration_number: { type: 'string' },
      marketing_auth_holder: { type: 'string' },
      approval_date: { type: 'string' },
      renewal_due_date: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['product_id', 'country'],
  },
};

export const REVIEW_LABEL_CURRENCY: AnaTool = {
  name: 'review_label_currency',
  description:
    "Run the deterministic label-currency gate on a product (read-only): every approved market should carry a current approved label of the region-appropriate type (US→USPI, EU→SmPC, else CCDS). Returns cited findings + risk level.",
  input_schema: {
    type: 'object',
    properties: { product_id: { type: 'number' } },
    required: ['product_id'],
  },
};

export const CREATE_INSPECTION: AnaTool = {
  name: 'create_inspection',
  description:
    "Open an inspection record (FDA BIMO / pre-approval, EMA GCP/GMP, routine, for-cause). Returns the inspection id for follow-up (findings, readiness). Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      inspection_type: { type: 'string', enum: ['bimo','pai','gcp','gmp','routine','for_cause','other'] },
      agency: { type: 'string', enum: ['fda','ema','mhra','pmda','other'] },
      site_name: { type: 'string' },
      scheduled_date: { type: 'string', description: 'YYYY-MM-DD.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['inspection_type', 'agency', 'site_name'],
  },
};

export const LOG_INSPECTION_FINDING: AnaTool = {
  name: 'log_inspection_finding',
  description:
    "Log a Form 483 observation / inspection finding with its classification (critical/major/minor/observation). The 15-business-day response clock starts from the inspection end date. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      inspection_id: { type: 'number' },
      observation_number: { type: 'number' },
      description: { type: 'string' },
      classification: { type: 'string', enum: ['critical','major','minor','observation'] },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['inspection_id', 'observation_number', 'description', 'classification'],
  },
};

export const REVIEW_INSPECTION_READINESS: AnaTool = {
  name: 'review_inspection_readiness',
  description:
    "Score inspection readiness across assessment areas (read-only): ready/in-progress/at-risk → a 0-100 score, verdict, and blockers (any at-risk area). Optionally scope to one inspection. Use to tell the user if they are inspection-ready.",
  input_schema: {
    type: 'object',
    properties: { inspection_id: { type: 'number' } },
    required: [],
  },
};

export const REGISTER_DEA: AnaTool = {
  name: 'register_dea',
  description:
    "Record a DEA registration (Controlled Substances Act / 21 CFR 1301) for controlled-substance tracking: registrant, DEA number, business activity, authorized schedules (I-V), expiration. Returns the registration id. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      registrant_name: { type: 'string' },
      dea_number: { type: 'string' },
      business_activity: { type: 'string', enum: ['researcher','analytical_lab','manufacturer','distributor','practitioner','teaching_institution','other'] },
      schedules: { type: 'array', items: { type: 'string', enum: ['I','II','III','IV','V'] } },
      expiration_date: { type: 'string', description: 'YYYY-MM-DD.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['registrant_name', 'dea_number', 'business_activity'],
  },
};

export const LOG_CS_TRANSACTION: AnaTool = {
  name: 'log_cs_transaction',
  description:
    "Record a controlled-substance transaction on the perpetual ledger (receipt/dispense/use/disposal/transfer/adjustment). The balance is reconciled automatically and a subtraction that would go negative is rejected. Disposals should name a witness. Returns the new balance. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      substance_id: { type: 'number' },
      transaction_type: { type: 'string', enum: ['receipt','dispense','use','disposal','transfer','adjustment'] },
      quantity: { type: 'number', description: 'Use a signed value for adjustment; magnitude for others.' },
      transaction_date: { type: 'string' },
      witnessed_by: { type: 'string' },
      reference: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['substance_id', 'transaction_type', 'quantity'],
  },
};

export const REVIEW_CS_BALANCE: AnaTool = {
  name: 'review_cs_balance',
  description:
    "List controlled-substance inventory balances (read-only) so the user can see current on-hand quantities by schedule. Org-scoped.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const CREATE_LIFECYCLE_OBLIGATION: AnaTool = {
  name: 'create_lifecycle_obligation',
  description:
    "Open a post-approval lifecycle obligation: variation (EU IA/IB/II), supplement (FDA PAS/CBE-30/CBE-0/annual report), periodic safety report (PSUR/PBRER), pediatric (PREA/PIP), or renewal. For a periodic_report with recurrence_months + anchor_date, the recurring occurrences are generated automatically. Returns the obligation id, the review pathway, and how many occurrences were created. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      obligation_type: { type: 'string', enum: ['variation','supplement','periodic_report','pediatric','renewal','annual_report'] },
      region: { type: 'string', enum: ['fda','eu','jp','mhra','other'] },
      title: { type: 'string' },
      classification: { type: 'string', description: "e.g. 'II','CBE-30','PSUR','PREA'." },
      product_id: { type: 'number' },
      submission_id: { type: 'number' },
      due_date: { type: 'string' },
      recurrence_months: { type: 'number', description: 'For periodic reports, e.g. 6 or 12.' },
      anchor_date: { type: 'string', description: 'Start date to generate periodic occurrences from.' },
      occurrences_to_generate: { type: 'number' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['obligation_type', 'region', 'title'],
  },
};

export const REVIEW_LIFECYCLE_CALENDAR: AnaTool = {
  name: 'review_lifecycle_calendar',
  description:
    "Summarize the post-approval obligation calendar by urgency (overdue / due in 30 / due in 90 / later / undated / closed), read-only — covers both obligations and their recurring occurrences. Use to tell the user what filings are coming due.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const CREATE_TMF: AnaTool = {
  name: 'create_tmf',
  description:
    "Open a Trial Master File (eTMF) for a study, organized to the DIA TMF Reference Model. Returns the TMF id for adding artifacts. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      study_id: { type: 'number', description: 'Optional clinical_studies.id.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['title'],
  },
};

export const CLASSIFY_TMF_ARTIFACT: AnaTool = {
  name: 'classify_tmf_artifact',
  description:
    "File a TMF artifact: when no zone is given, it is AUTO-CLASSIFIED into a DIA TMF Reference Model zone by name (deterministic). Set status (expected/received/in_review/final/missing/not_applicable). Returns the artifact id and the assigned zone. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      tmf_file_id: { type: 'number' },
      artifact_name: { type: 'string' },
      zone: { type: 'number', description: 'DIA RM zone 1-11; omit to auto-classify.' },
      status: { type: 'string', enum: ['expected','received','in_review','final','missing','not_applicable'] },
      document_date: { type: 'string' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['tmf_file_id', 'artifact_name'],
  },
};

export const REVIEW_TMF_COMPLETENESS: AnaTool = {
  name: 'review_tmf_completeness',
  description:
    "Run the deterministic TMF completeness gap-check on a TMF (read-only): completeness %, per-zone coverage, the list of required artifacts not yet final, and an inspection-readiness verdict. Use to tell the user where the TMF has gaps before an inspection.",
  input_schema: {
    type: 'object',
    properties: { tmf_file_id: { type: 'number' } },
    required: ['tmf_file_id'],
  },
};

export const RUN_COMPLIANCE_CHECKLIST: AnaTool = {
  name: 'run_compliance_checklist',
  description:
    "Resolve the DETERMINISTIC compliance checklist for a research activity (the auto-updating, regulation-cited engine, not the LLM): which committee approvals (IRB/IACUC/IBC) are required, which personnel training is required, and the ordered steps. Use to tell a client what they must do before they can start. Read-only.",
  input_schema: {
    type: 'object',
    properties: {
      involves_human_subjects: { type: 'boolean' },
      involves_animals: { type: 'boolean' },
      involves_recombinant_dna: { type: 'boolean' },
      involves_human_gene_transfer: { type: 'boolean' },
      funding_source: { type: 'string', enum: ['nih','nsf','barda','dod','industry','internal','other'] },
      region: { type: 'string', enum: ['us','eu','other'] },
    },
    required: [],
  },
};

export const ASSESS_STUDY_ONBOARDING: AnaTool = {
  name: 'assess_study_onboarding',
  description:
    "One-shot study-onboarding assessment (read-only orchestration): resolves the required committee approvals + training for the activity profile, runs the training gate over the named team, and CROSS-REFERENCES each training gap to the specific approval it blocks (e.g. a PI missing CITI human-subjects blocks the IRB submission, not the IACUC one). Returns per-committee readiness, overall readyToSubmit, and a prioritized blocker list. Answers 'what do I need to stand up this study and is my team ready?' in one turn.",
  input_schema: {
    type: 'object',
    properties: {
      involves_human_subjects: { type: 'boolean' },
      involves_animals: { type: 'boolean' },
      involves_recombinant_dna: { type: 'boolean' },
      involves_human_gene_transfer: { type: 'boolean' },
      funding_source: { type: 'string', enum: ['nih', 'nsf', 'barda', 'dod', 'industry', 'internal', 'other'] },
      region: { type: 'string', enum: ['us', 'eu', 'other'] },
      personnel_ids: { type: 'array', items: { type: 'number' }, description: 'research_personnel ids of the study team to gate.' },
    },
    required: [],
  },
};

export const ADD_PERSONNEL_TRAINING: AnaTool = {
  name: 'add_personnel_training',
  description:
    "Record a training/clearance completion for a person on the research roster (CITI human subjects/GCP/animal/RCR, biosafety, FCOI, etc.) with completion + expiry dates. This feeds the 'no index until trained' gate. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      personnel_id: { type: 'number' },
      training_type: { type: 'string', enum: ['citi_human_subjects','citi_gcp','citi_animal','citi_rcr','biosafety','bloodborne_pathogens','iata_shipping','hipaa','fcoi_disclosure','other'] },
      completed_date: { type: 'string', description: 'YYYY-MM-DD.' },
      expires_date: { type: 'string', description: 'YYYY-MM-DD.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['personnel_id', 'training_type'],
  },
};

export const REVIEW_TRAINING_GATE: AnaTool = {
  name: 'review_training_gate',
  description:
    "Run the 'no index until trained' gate for a set of personnel against the required training for a research activity (read-only): returns whether the team is cleared, who is missing or expired on what training, and who is expiring soon. Use before letting a protocol proceed.",
  input_schema: {
    type: 'object',
    properties: {
      personnel_ids: { type: 'array', items: { type: 'number' } },
      involves_human_subjects: { type: 'boolean' },
      involves_animals: { type: 'boolean' },
      involves_recombinant_dna: { type: 'boolean' },
      involves_human_gene_transfer: { type: 'boolean' },
      funding_source: { type: 'string', enum: ['nih','nsf','barda','dod','industry','internal','other'] },
      region: { type: 'string', enum: ['us','eu','other'] },
    },
    required: ['personnel_ids'],
  },
};

export const CREATE_EFFORT_CERTIFICATION: AnaTool = {
  name: 'create_effort_certification',
  description: "Open a time-&-effort certification statement for a person and period (2 CFR 200.430). Returns the statement id for adding effort lines. Governed + audited, org-scoped.",
  input_schema: { type: 'object', properties: { personnel_id: { type: 'number' }, period_start: { type: 'string' }, period_end: { type: 'string' }, reason: { type: 'string', description: 'Audit reason (>= 8 chars).' } }, required: ['personnel_id', 'period_start', 'period_end'] },
};
export const ADD_EFFORT_LINE: AnaTool = {
  name: 'add_effort_line',
  description: "Add an effort line to a certification: an activity/award with committed % and actual %. Total across lines must not exceed 100%; a sponsored line whose actual deviates materially from committed triggers recertification. Governed + audited.",
  input_schema: { type: 'object', properties: { certification_id: { type: 'number' }, activity_label: { type: 'string' }, committed_pct: { type: 'number' }, actual_pct: { type: 'number' }, award_id: { type: 'number' }, reason: { type: 'string' } }, required: ['certification_id', 'activity_label', 'committed_pct', 'actual_pct'] },
};
export const CREATE_COI_DISCLOSURE: AnaTool = {
  name: 'create_coi_disclosure',
  description: "File a research-security / conflict-of-interest disclosure (NOT-OD-26-017 / NSPM-33): outside activity, financial interest, foreign appointment/support, other support, gift, or IP. Foreign appointments/support are flagged for research-security review. Governed + audited, org-scoped.",
  input_schema: { type: 'object', properties: { personnel_id: { type: 'number' }, disclosure_type: { type: 'string', enum: ['financial_interest','outside_activity','foreign_appointment','foreign_support','other_support','gift','intellectual_property','other'] }, entity_name: { type: 'string' }, country: { type: 'string' }, description: { type: 'string' }, monetary_value: { type: 'number' }, reason: { type: 'string' } }, required: ['personnel_id', 'disclosure_type', 'entity_name'] },
};
export const SEARCH_GRANTS_GOV: AnaTool = {
  name: 'search_grants_gov',
  description: "Search US federal funding opportunities on Grants.gov (public, no credentials). Use to build the pre-award pipeline: find NOFOs by keyword, topic, or agency. Read-only; returns opportunity number, agency, status, and close date. Org context required.",
  input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Keyword / topic / therapeutic area to search.' }, limit: { type: 'number', description: 'Max opportunities (default 15).' } }, required: ['query'] },
};
export const SCREEN_RESTRICTED_PARTY: AnaTool = {
  name: 'screen_restricted_party',
  description: "Screen a person or organization against the US SAM.gov Exclusions (debarment/suspension) list for research-security and 2 CFR 200.214 suspension-and-debarment checks. Requires the org to have configured the SAM.gov connector. Read-only; an empty result is a CLEAN screen (no exclusion found).",
  input_schema: { type: 'object', properties: { party_name: { type: 'string', description: 'Full legal name of the investigator, sub-recipient, or vendor to screen.' } }, required: ['party_name'] },
};

export const LOG_STUDY_DEVIATION: AnaTool = {
  name: 'log_study_deviation',
  description:
    "Log a clinical study deviation. Category drives how severely the kit highlights it (major = orange row, minor = neutral). When capa_required=true the kit cross-posts to the CAPA queue via capa-mdr.",
  input_schema: {
    type: 'object',
    properties: {
      study_id:        { type: 'number' },
      site_id:         { type: 'number' },
      deviation_date:  { type: 'string', description: 'ISO date.' },
      category:        { type: 'string', enum: ['major', 'minor', 'inclusion_exclusion', 'visit_window', 'consent', 'protocol', 'other'] },
      description:     { type: 'string' },
      subject_id:      { type: 'string', description: 'Sponsor internal subject identifier (no PHI).' },
      capa_required:   { type: 'boolean' },
    },
    required: ['study_id', 'deviation_date', 'category', 'description'],
  },
};

export const LOG_STUDY_AE: AnaTool = {
  name: 'log_study_ae',
  description:
    "Log an adverse event in a clinical study. Captures seriousness, unanticipated-device-effect (UADE) flag per 21 CFR 812.150(b), device relationship, severity, outcome, and MedDRA preferred term + SOC. AnA can later mark reported-to-FDA / reported-to-IRB dates.",
  input_schema: {
    type: 'object',
    properties: {
      study_id:        { type: 'number' },
      site_id:         { type: 'number' },
      ae_id:           { type: 'string', description: "Sponsor's internal AE id." },
      subject_id:      { type: 'string' },
      ae_date:         { type: 'string' },
      serious:         { type: 'boolean' },
      unanticipated:   { type: 'boolean', description: 'UADE per 21 CFR 812.150(b).' },
      device_related:  { type: 'string', enum: ['yes', 'no', 'possibly', 'probably', 'definitely', 'unrelated'] },
      severity:        { type: 'string', enum: ['mild', 'moderate', 'severe'] },
      outcome:         { type: 'string', enum: ['recovered', 'recovering', 'not_recovered', 'fatal', 'unknown'] },
      preferred_term:  { type: 'string', description: 'MedDRA preferred term.' },
      soc:             { type: 'string', description: 'MedDRA system organ class.' },
    },
    required: ['study_id', 'ae_id', 'ae_date'],
  },
};

export const RECORD_ENDPOINT_RESULT: AnaTool = {
  name: 'record_endpoint_result',
  description:
    "Record the result of a pre-specified clinical study endpoint. Captures observed value, 95% CI, p-value, and met/not-met. Use after the SAP analysis completes.",
  input_schema: {
    type: 'object',
    properties: {
      study_id:        { type: 'number' },
      endpoint_kind:   { type: 'string', enum: ['primary', 'secondary', 'exploratory', 'safety'] },
      name:            { type: 'string' },
      description:     { type: 'string' },
      target_value:    { type: 'string' },
      observed_value:  { type: 'string' },
      ci_lower:        { type: 'string' },
      ci_upper:        { type: 'string' },
      p_value:         { type: 'number', minimum: 0, maximum: 1 },
      met:             { type: 'boolean' },
      analysis_note:   { type: 'string' },
    },
    required: ['study_id', 'endpoint_kind', 'name'],
  },
};

export const VERIFY_MEMORY_ATOM: AnaTool = {
  name: 'verify_memory_atom',
  description:
    "Mark an AnA memory atom as verified by a human user (records verified_by + verified_at). When bump_importance is true and the current importance is low/medium, the importance is bumped to high so the atom surfaces more aggressively in future conversations.",
  input_schema: {
    type: 'object',
    properties: {
      memory_id:       { type: 'number' },
      bump_importance: { type: 'boolean', description: 'Bump importance to high.' },
    },
    required: ['memory_id'],
  },
};
