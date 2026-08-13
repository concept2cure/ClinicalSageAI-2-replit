/**
 * Evidence & literature tool definitions.
 *
 * AnA's evidence-gathering surface: clinical-evidence and literature search,
 * guidance/coverage lookup, citation generation and the related retrieval
 * tools that ground her answers in sources rather than recall.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 5). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` and the drafting/review tool arrays reference them
 * unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Evidence & Literature Tools
// ─────────────────────────────────────────────────────────────────────────────

export const SEARCH_CLINICAL_EVIDENCE: AnaTool = {
  name: 'search_clinical_evidence',
  description:
    'Search live ClinicalTrials.gov for clinical evidence and competitive/precedent intelligence. ' +
    'Use structured filters (condition, intervention, sponsor, status, phase) for precision, or a ' +
    'free-text query. Returns trials with NCT IDs and canonical URLs for citation, plus the total ' +
    'match count. Cite results by NCT ID and link to the provided url.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Free-text query for clinical evidence (condition, drug, device, etc.)',
      },
      condition: {
        type: 'string',
        description: 'Disease / condition filter, e.g. "non-small cell lung cancer"',
      },
      intervention: {
        type: 'string',
        description: 'Intervention / drug / device name filter',
      },
      sponsor: {
        type: 'string',
        description: 'Lead sponsor or collaborator (company/institution) filter',
      },
      status: {
        type: 'string',
        description:
          'Overall status filter, e.g. RECRUITING, COMPLETED, ACTIVE_NOT_RECRUITING, TERMINATED',
      },
      phase: {
        type: 'string',
        description: 'Trial phase filter, e.g. PHASE3 or 3',
      },
      evidence_type: {
        type: 'string',
        enum: ['clinical_trial', 'literature', 'real_world_evidence', 'meta_analysis'],
        description: 'Type of evidence to search for',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 20)',
      },
    },
    required: ['query'],
  },
};

export const SEARCH_MEDICARE_COVERAGE: AnaTool = {
  name: 'search_medicare_coverage',
  description:
    'Search the CMS Medicare Coverage Database for National Coverage Determinations (NCDs) ' +
    'and final Local Coverage Determinations (LCDs). Use for market-access / reimbursement ' +
    'readiness — whether and how Medicare covers a procedure, device, lab test, or service — ' +
    'alongside regulatory analysis. Returns coverage documents with their MCD numbers, ' +
    'last-updated dates, and canonical CMS URLs for citation.',
  input_schema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description:
          'Term to match in the coverage document title (e.g. "cardiac", "next generation sequencing").',
      },
      coverage_type: {
        type: 'string',
        enum: ['ncd', 'lcd'],
        description: "Coverage level: 'ncd' (national, all states) or 'lcd' (local, by MAC). Default: ncd.",
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of documents to return (default: 10, max: 25).',
      },
    },
    required: ['keyword'],
  },
};

export const SEARCH_CONNECTED_REPOSITORIES: AnaTool = {
  name: 'search_connected_repositories',
  description:
    "Search the organization's connected external document repositories (Google Drive, Box, " +
    'OneDrive, SharePoint, Veeva Vault, …) for source material relevant to a query. Use when the ' +
    "user references documents that live in their own connected systems rather than this project's " +
    'uploaded corpus (use project_knowledge_search for the latter). Returns matching documents with ' +
    'their source system, summary, and a link. Reports which systems are not yet connected.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to look for across connected repositories (keywords or a topic).',
      },
      connectors: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Optional connector ids to restrict the search (e.g. ['google-drive']). Omit to search all connected systems.",
      },
      max_results: {
        type: 'number',
        description: 'Maximum documents to return (default: 8, max: 25).',
      },
    },
    required: ['query'],
  },
};

export const ADVISE_STUDY_DESIGN: AnaTool = {
  name: 'advise_study_design',
  description:
    'Study-design & sample-size advisor: explains superiority / non-inferiority / equivalence designs ' +
    '(hypotheses, key considerations, pitfalls) and, given endpoint family and assumptions, returns a ' +
    'two-arm sample-size planning estimate (continuous: mean difference + SD; binary: p1/p2; ' +
    'time-to-event: hazard ratio + event probability via Schoenfeld). Planning estimate only — confirm ' +
    'with a statistician; define the estimand first (advise_estimand).',
  input_schema: {
    type: 'object',
    properties: {
      goal: { type: 'string', enum: ['superiority', 'non_inferiority', 'equivalence'] },
      sample_size: {
        type: 'object',
        description: 'Inputs for a sample-size estimate.',
        properties: {
          endpoint_family: { type: 'string', enum: ['continuous', 'binary', 'time_to_event'] },
          alpha: { type: 'number', description: 'Default 0.05.' },
          power: { type: 'number', description: 'Default 0.8.' },
          two_sided: { type: 'boolean' },
          mean_difference: { type: 'number' },
          sd: { type: 'number' },
          p1: { type: 'number' },
          p2: { type: 'number' },
          hazard_ratio: { type: 'number' },
          prob_event: { type: 'number', description: 'Overall event probability (TTE → patients).' },
          allocation_ratio: { type: 'number', description: 'n2/n1, default 1.' },
          margin: { type: 'number', description: 'NI/equivalence margin.' },
        },
        required: ['endpoint_family'],
      },
    },
  },
};

export const ADVISE_LABELING_STRUCTURE: AnaTool = {
  name: 'advise_labeling_structure',
  description:
    'Product-labeling structure advisor: explains the section architecture of the US Prescribing ' +
    'Information (PLR, 21 CFR 201.56/201.57) or EU SmPC (QRD template), or routes free-text content to ' +
    'the right section ("which section does this go in?") with the US↔EU cross-map. Use when drafting or ' +
    'QC-ing a label.',
  input_schema: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['uspi', 'smpc'], description: 'uspi (US PI) | smpc (EU). Aliases accepted.' },
      content: { type: 'string', description: 'Free-text content to place into a label section.' },
    },
  },
};

export const PLAN_LABELING_AUTHORING: AnaTool = {
  name: 'plan_labeling_authoring',
  description:
    'Build-from-template labeling authoring plan (US PLR / EU QRD). Given a labeling mode, returns the ' +
    'deterministic mandatory PLR/QRD section headers (the section guard), the required_strings to pass to ' +
    'verify_docx_against_source, and the replacements to pass to build_from_template — plus a section-guard ' +
    'completeness check of any draft_text supplied. Use to drive build_from_template → review_label_currency ' +
    '(deterministic currency gate) → verify_docx_against_source. The currency verdict is produced by ' +
    'review_label_currency and is deterministic — never inferred here.',
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['us', 'eu'], description: "us (USPI/PLR) | eu (SmPC/QRD). Aliases (uspi/plr/smpc/qrd) accepted." },
      product_name: { type: 'string', description: 'Product name used in the scaffold title/replacements.' },
      draft_text: { type: 'string', description: 'Optional current draft text to run the section guard against.' },
    },
    required: ['mode'],
  },
};

export const ADVISE_MEDICAL_INFORMATION: AnaTool = {
  name: 'advise_medical_information',
  description:
    'Medical-information / standard-response advisor: the structure of a Standard Response Document (SRD), ' +
    'the on-label vs unsolicited off-label distinction with compliance guardrails, product-complaint ' +
    'handling, and the pharmacovigilance/AE-capture overlay that applies to every interaction. Use when ' +
    'scaffolding or QC-ing a response to an unsolicited HCP/patient enquiry. Advisory — MI/compliance ' +
    'review is authoritative; off-label responses are strictly regulated.',
  input_schema: {
    type: 'object',
    properties: {
      response_type: { type: 'string', description: 'on_label | off_label | product_complaint (aliases accepted).' },
    },
  },
};

export const ADVISE_REPORTING_GUIDELINE: AnaTool = {
  name: 'advise_reporting_guideline',
  description:
    'Reporting-guideline advisor (EQUATOR network): selects the right guideline for a study type and ' +
    'returns its essential checklist items + common pitfalls — CONSORT (RCTs), SPIRIT (protocols), ' +
    'STROBE (observational), PRISMA (systematic reviews/meta-analyses), STARD (diagnostic accuracy), ' +
    'ARRIVE (animal), CARE (case reports). Use when preparing/QC-ing a manuscript or protocol.',
  input_schema: {
    type: 'object',
    properties: {
      guideline: { type: 'string', description: 'consort | spirit | strobe | prisma | stard | arrive | care.' },
      study_type: { type: 'string', description: 'Free-text study type to auto-select the guideline.' },
    },
  },
};

export const ADVISE_DATA_INTEGRITY: AnaTool = {
  name: 'advise_data_integrity',
  description:
    'Data-integrity / 21 CFR Part 11 advisor: explains the ALCOA+ principles and the core Part 11 / EU ' +
    'Annex 11 control areas (audit trails, access control, e-signatures, CSV/GAMP 5, copies & retention), ' +
    'or runs a cue-based ALCOA+ gap check on a free-text system/process description with a coverage score. ' +
    'Use when QC-ing a GxP computerized system or process. Advisory — formal CSV/QA is authoritative.',
  input_schema: {
    type: 'object',
    properties: {
      requirement: { type: 'string', description: 'audit_trail | access_control | esignature | validation | copies_retention.' },
      description: { type: 'string', description: 'System/process description to gap-check against ALCOA+.' },
    },
  },
};

export const ADVISE_RWE_DESIGN: AnaTool = {
  name: 'advise_rwe_design',
  description:
    'Real-world-evidence (RWE) study-design advisor: explains retrospective cohort, case-control, ' +
    'self-controlled (SCCS/case-crossover), target-trial emulation and pragmatic trials (strengths/' +
    'weaknesses), common real-world data sources, and the FDA RWE-framework / causal-inference ' +
    'guardrails (fit-for-purpose data, time-zero, confounding control, pre-specification). Use when ' +
    'planning or QC-ing an RWE study.',
  input_schema: {
    type: 'object',
    properties: {
      design: { type: 'string', description: 'retrospective_cohort | case_control | self_controlled | target_trial_emulation | pragmatic_trial.' },
    },
  },
};

export const NARRATE_STATISTICAL_RESULT: AnaTool = {
  name: 'narrate_statistical_result',
  description:
    'Turn a structured analysis result (effect measure + estimate + CI + p-value, plus per-arm ' +
    'values) into correctly-hedged ICH-E3-style prose — determines significance from the confidence ' +
    'interval (preferred) or p-value, distinguishes statistical from clinical significance, and flags ' +
    'exploratory/post-hoc and multiplicity-uncontrolled analyses. Use when writing efficacy/safety ' +
    'results so the language never overstates beyond the data.',
  input_schema: {
    type: 'object',
    properties: {
      endpoint: { type: 'string', description: 'Endpoint name, e.g. "overall survival".' },
      analysis_type: { type: 'string', enum: ['time_to_event', 'binary', 'continuous'] },
      arms: {
        type: 'array',
        description: 'Per-arm values (median for TTE, rate/% for binary, mean change for continuous).',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            n: { type: 'number' },
            value: { type: 'string' },
            unit: { type: 'string' },
          },
          required: ['name'],
        },
      },
      measure: {
        type: 'string',
        enum: ['HR', 'OR', 'RR', 'rate ratio', 'risk difference', 'mean difference', 'rate difference'],
      },
      estimate: { type: 'number' },
      ci_lower: { type: 'number' },
      ci_upper: { type: 'number' },
      ci_level: { type: 'number', description: 'Default 95.' },
      p_value: { type: 'number' },
      alpha: { type: 'number', description: 'Significance level (default 0.05).' },
      exploratory: { type: 'boolean', description: 'Mark exploratory/post-hoc.' },
      multiplicity_controlled: { type: 'boolean', description: 'Whether multiplicity was controlled.' },
    },
    required: ['endpoint', 'analysis_type'],
  },
};

export const VALUE_DOSSIER_GUIDANCE: AnaTool = {
  name: 'value_dossier_guidance',
  description:
    'Market-access / HEOR guidance: returns the framework, structure, key requirements and common ' +
    'pitfalls for a value deliverable (AMCP formulary dossier, NICE/HTA submission, budget-impact ' +
    'model, global value dossier, value-message framework) and, optionally, the decision basis and ' +
    'conventions for a specific HTA body (NICE, ICER, G-BA/IQWiG, HAS, CADTH, PBAC). Use when planning ' +
    'or QC-ing payer/HTA deliverables so they follow the right comparator/economic conventions per market.',
  input_schema: {
    type: 'object',
    properties: {
      deliverable: {
        type: 'string',
        description:
          'Value deliverable: amcp_dossier, nice_submission, hta_submission, budget_impact_model, ' +
          'global_value_dossier, value_message_framework (aliases accepted).',
      },
      hta_body: {
        type: 'string',
        description: 'Optional HTA body: nice, icer, gba, has, cadth, pbac (country names accepted).',
      },
    },
  },
};

export const ADVISE_ESTIMAND: AnaTool = {
  name: 'advise_estimand',
  description:
    'Estimand / study-design advisor (ICH E9(R1)): explains the five estimand attributes (treatment, ' +
    'population, variable, intercurrent-event handling, population-level summary) and the five ' +
    'intercurrent-event strategies (treatment-policy, hypothetical, composite, while-on-treatment, ' +
    'principal-stratum); given a structured draft, QCs which of the five attributes are specified. Use ' +
    'when defining or reviewing an estimand before choosing the estimator.',
  input_schema: {
    type: 'object',
    properties: {
      strategy: { type: 'string', description: 'Focus an intercurrent-event strategy (treatment_policy, hypothetical, composite, while_on_treatment, principal_stratum).' },
      draft: {
        type: 'object',
        description: 'A structured estimand to QC against the five attributes.',
        properties: {
          treatment: { type: 'string' },
          population: { type: 'string' },
          variable: { type: 'string' },
          intercurrent_events: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    },
  },
};

export const ADVISE_PHARMACOVIGILANCE: AnaTool = {
  name: 'advise_pharmacovigilance',
  description:
    'Pharmacovigilance aggregate-reporting & signal-management advisor: purpose, cadence, key sections ' +
    'and pitfalls for the DSUR (ICH E2F), PBRER/PSUR (ICH E2C(R2)), expedited ICSR/SUSAR reporting ' +
    '(ICH E2A/E2B) and the GVP Module IX signal-management cycle — or a candidate set by stage ' +
    '(development | post-authorization). Use when scaffolding or QC-ing safety reports.',
  input_schema: {
    type: 'object',
    properties: {
      deliverable: { type: 'string', description: 'dsur | pbrer | icsr | signal_management (aliases accepted).' },
      stage: { type: 'string', enum: ['development', 'post-authorization'] },
    },
  },
};

export const ADVISE_CTD_STRUCTURE: AnaTool = {
  name: 'advise_ctd_structure',
  description:
    'CTD / eCTD structure advisor (ICH M4): explains a CTD module (1–5) and its key sections, or routes ' +
    'a free-text document description to the best-fit module ("where does this go?"). Covers Module 1 ' +
    '(regional/administrative), Module 2 (summaries: QOS, overviews), Module 3 (quality/CMC), Module 4 ' +
    '(nonclinical), Module 5 (clinical). Use when assembling or QC-ing a submission dossier.',
  input_schema: {
    type: 'object',
    properties: {
      module: { type: 'string', description: 'm1..m5, a module number, or alias (quality, clinical, …).' },
      document: { type: 'string', description: 'Free-text document description to place into a module.' },
    },
  },
};

export const ADVISE_SPECIAL_DESIGNATION: AnaTool = {
  name: 'advise_special_designation',
  description:
    'Expedited-program & special-designation advisor: eligibility, benefit conferred, evidence and ' +
    'common pitfalls for FDA programs (Fast Track, Breakthrough Therapy, Accelerated Approval, Priority ' +
    'Review, Orphan) and EMA programs (PRIME, conditional MA, accelerated assessment, orphan) — or a ' +
    'candidate set by jurisdiction. Advisory — eligibility is determined by the agency.',
  input_schema: {
    type: 'object',
    properties: {
      designation: { type: 'string', description: 'e.g. fast_track, breakthrough, accelerated_approval, orphan, prime, conditional_ma.' },
      jurisdiction: { type: 'string', enum: ['us', 'eu'] },
    },
  },
};

// Orphan-Drug Designation request authoring + verification plan (21 CFR 316).
// Builds the §316.20/§316.21 ODD-request document content from a product's
// indication/modality/strategy fields, returns the author_docx_native markdown
// PLUS the required_strings (the mandatory section headers) for the downstream
// verify_docx_against_source step — so the author→verify loop proves every
// mandatory element is present before the draft is sealed/exported. Chain
// advise_special_designation (designation='orphan') for rationale,
// search_drug_approvals + lookup_regulatory_precedents for same-drug/same-disease
// prior-designation precedent, and search_literature for prevalence &
// natural-history citations, then pass the gathered evidence in `citations`.
export const PLAN_ORPHAN_DRUG_DESIGNATION: AnaTool = {
  name: 'plan_orphan_drug_designation',
  description:
    'Author an FDA Orphan-Drug Designation (ODD) request under 21 CFR Part 316 from a BiotechProduct. ' +
    'Returns the author_docx_native title + markdown content (all mandatory §316.20(b) / §316.21(b)(c) ' +
    'sections), and the required_strings (the mandatory section headers) to pass to ' +
    'verify_docx_against_source so the verification proves every required element is present before ' +
    'download. Honesty contract: no prevalence/eligibility claim is asserted without a cited source ' +
    '(supply them via `citations`), and sample/not-assessed drafts are non-sealable. Chain ' +
    'advise_special_designation (designation="orphan") for rationale, search_drug_approvals + ' +
    'lookup_regulatory_precedents for prior same-drug/same-disease designation precedent, and ' +
    'search_literature for prevalence & natural-history citations.',
  input_schema: {
    type: 'object',
    properties: {
      product: {
        type: 'object',
        description: 'Product fields, typically drawn from BiotechProduct (name/indication/modality/strategy).',
        properties: {
          name: { type: 'string', description: 'Product code, e.g. "ABC-123".' },
          generic_name: { type: 'string' },
          brand_name: { type: 'string' },
          indication: { type: 'string', description: 'Proposed orphan indication, e.g. "relapsed/refractory AML".' },
          modality: { type: 'string', description: 'small_molecule | biologic | cell_therapy | gene_therapy | combination.' },
          designations: { type: 'array', items: { type: 'string' }, description: 'strategy.designation values; "orphan" expected.' },
          sponsor_name: { type: 'string' },
          sponsor_address: { type: 'string' },
          contact_name: { type: 'string' },
          fda_division: { type: 'string' },
        },
        required: ['name', 'indication'],
      },
      rationale: {
        type: 'string',
        description: 'Scientific rationale narrative, e.g. the brief from advise_special_designation(designation="orphan").',
      },
      citations: {
        type: 'array',
        description: 'Evidence supporting a section. A prevalence/eligibility section asserts no claim without one.',
        items: {
          type: 'object',
          properties: {
            section_id: { type: 'string', description: 'e.g. population_estimate | cost_recovery_basis | same_drug_summary.' },
            label: { type: 'string' },
            source: { type: 'string', description: 'DOI, PMID, FDA application number, precedent id, or URL.' },
          },
          required: ['section_id', 'label', 'source'],
        },
      },
      provenance: {
        type: 'string',
        enum: ['live', 'sample', 'not_assessed'],
        description: 'Provenance of the product data. sample/not_assessed drafts are non-sealable and non-exportable.',
      },
    },
    required: ['product'],
  },
};

// IND narrative-module authoring (E11). Author a CTD Module 2 clinical summary
// (2.5 Clinical Overview / 2.7 Clinical Summary) from a STRUCTURED source and
// derive the required_strings for verify_docx_against_source from the source's
// key facts/figures — so the verify step proves transcription fidelity (a
// missing/mistyped figure fails) before the user signs + seals the persisted
// version. Honesty contract: sample/not_assessed sources are non-sealable.
export const PLAN_IND_MODULE_AUTHORING: AnaTool = {
  name: 'plan_ind_module_authoring',
  description:
    'Author a transcription-safe IND narrative module (CTD Module 2.5 Clinical Overview or 2.7 Clinical ' +
    'Summary) from a STRUCTURED source. Returns the author_docx_native title + markdown content (every ' +
    'mandatory CTD Module 2 section header) and the required_strings to pass to verify_docx_against_source. ' +
    'CRITICAL: required_strings include the section headers PLUS every source figure VALUE, so the verify ' +
    'step proves each figure was transcribed verbatim and CATCHES a missing or mistyped figure before the ' +
    'draft can be sealed. Honesty contract: a sample/not_assessed source is never sealable, and a draft ' +
    'whose figures do not verify is non-sealable. Supply the structured source facts/figures in `facts`.',
  input_schema: {
    type: 'object',
    properties: {
      module: {
        type: 'string',
        enum: ['2.5', '2.7'],
        description: 'CTD Module 2 clinical summary to author: 2.5 (Clinical Overview) or 2.7 (Clinical Summary).',
      },
      product_name: { type: 'string', description: 'Product / compound name for the title + running header.' },
      indication: { type: 'string', description: 'Proposed indication.' },
      facts: {
        type: 'array',
        description:
          'Structured source facts/figures to transcribe verbatim. Each value becomes a required_strings entry, ' +
          'so a mistyped figure fails verification.',
        items: {
          type: 'object',
          properties: {
            section_id: {
              type: 'string',
              description: 'Which template section the fact belongs in (e.g. overview_efficacy, summary_clinical_safety).',
            },
            label: { type: 'string', description: 'Human label for the fact (e.g. "Primary endpoint response rate").' },
            value: {
              type: 'string',
              description: 'The verbatim figure/string to transcribe AND verify (e.g. "42.3%", "200 mg", "24 months").',
            },
            source: { type: 'string', description: 'Optional source pointer (table/dataset id) recorded for provenance.' },
          },
          required: ['section_id', 'label', 'value'],
        },
      },
      provenance: {
        type: 'string',
        enum: ['live', 'sample', 'not_assessed'],
        description: 'Provenance of the source data. sample/not_assessed sources are non-sealable.',
      },
    },
    required: ['module', 'product_name', 'indication'],
  },
};

export const ADVISE_GCP: AnaTool = {
  name: 'advise_gcp',
  description:
    'Good Clinical Practice (ICH E6(R2)) advisor: returns the GCP principles or a specific ' +
    'responsibility domain (sponsor, investigator, IRB/IEC) with the key obligations and citation. ' +
    'Use when briefing teams on GCP roles or preparing for inspection readiness.',
  input_schema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'principles | sponsor | investigator | irb_ec (aliases accepted).' },
    },
  },
};

export const REVIEW_INFORMED_CONSENT: AnaTool = {
  name: 'review_informed_consent',
  description:
    'QC an informed-consent form draft for the required elements of informed consent (ICH E6(R2) §4.8 ' +
    'and 21 CFR 50.25 / 45 CFR 46.116): flags missing required and when-appropriate elements with their ' +
    'citation and returns a completeness score. Cue-based and advisory — IRB/EC review is authoritative.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The consent-form text to review.' },
    },
    required: ['text'],
  },
};

export const ADVISE_COA_SELECTION: AnaTool = {
  name: 'advise_coa_selection',
  description:
    'Clinical Outcome Assessment (COA) selection advisor (FDA COA framework / PRO Guidance / Roadmap): ' +
    'explains PRO/ClinRO/ObsRO/PerfO, suggests the best-fit COA type from a concept of interest and ' +
    'reporter, and returns the fit-for-purpose evidence and endpoint-positioning needed to support a ' +
    'label claim. Advisory — endpoint/label-claim strategy must be agreed with the agency.',
  input_schema: {
    type: 'object',
    properties: {
      coa_type: { type: 'string', enum: ['pro', 'clinro', 'obsro', 'perfo'] },
      concept: { type: 'string', description: 'Concept of interest, e.g. "pain", "6-minute walk", for a suggestion.' },
      reporter: { type: 'string', description: 'Who reports it (patient, clinician, caregiver) — refines the suggestion.' },
    },
  },
};

export const ADVISE_RISK_MANAGEMENT: AnaTool = {
  name: 'advise_risk_management',
  description:
    'Risk-management / safety-governance advisor: returns the components, when-required criteria and ' +
    'common pitfalls of the US REMS (FDAAA §505-1) or EU RMP (GVP Module V), plus a routine-vs-' +
    'additional risk-minimization toolbox (labeling, Medication Guide, HCP education, controlled access/' +
    'ETASU, pregnancy-prevention programmes, registries). Use when scaffolding or QC-ing a post-' +
    'authorization safety strategy. Advisory only — must be agreed with FDA/EMA PRAC.',
  input_schema: {
    type: 'object',
    properties: {
      program: { type: 'string', description: 'rems | eu_rmp (aliases accepted).' },
      jurisdiction: { type: 'string', enum: ['us', 'eu'] },
    },
  },
};

export const RUN_RBM_ASSESSMENT: AnaTool = {
  name: 'run_rbm_assessment',
  description:
    'Risk-Based Monitoring (ICH E6(R3)/E8(R1)) advisor: seeds or summarizes a study Risk Assessment ' +
    '(RACT) for a program — Critical-to-Quality (CtQ) factors with likelihood × impact scores, the ' +
    'critical factors, and the rolled-up overall risk level. Use when scoping risk-based quality ' +
    'management for a study. Reads/writes the program\'s RBM risk assessment.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID to assess.' },
      seed: { type: 'boolean', description: 'If true, create a default RACT from the CtQ library when none exists.' },
    },
    required: ['programId'],
  },
};

export const ASSESS_SITE_RISK: AnaTool = {
  name: 'assess_site_risk',
  description:
    'Derives a per-site risk snapshot for a program from Site Intelligence and assigns a risk-proportionate ' +
    'monitoring tier (reduced / standard / enhanced) per ICH E6(R3). Returns the sites ranked by composite ' +
    'risk with their tier and the drivers. Use to plan monitoring intensity by site.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
      persist: { type: 'boolean', description: 'If true, recompute and store the snapshot; otherwise read the latest.' },
    },
    required: ['programId'],
  },
};

export const EVALUATE_KRIS_QTLS: AnaTool = {
  name: 'evaluate_kris_qtls',
  description:
    'Summarizes the Key Risk Indicators (KRIs) and Quality Tolerance Limits (QTLs) for a program — which ' +
    'KRIs are amber/red and which QTLs are approaching or breached — so central monitoring can focus on ' +
    'what is out of tolerance. Use for a central-monitoring status read.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
    },
    required: ['programId'],
  },
};

export const GENERATE_RBM_PLAN: AnaTool = {
  name: 'generate_rbm_plan',
  description:
    'Drafts an integrated risk-based monitoring plan for a program: recommends a monitoring strategy ' +
    '(centralized / risk-based / hybrid) from the assessment\'s overall risk and proposes monitoring actions ' +
    'from the critical CtQ factors. Advisory — must be reviewed and approved.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
    },
    required: ['programId'],
  },
};

export const PRIORITIZE_MONITORING_QUERIES: AnaTool = {
  name: 'prioritize_monitoring_queries',
  description:
    'Ranks a program\'s open central-monitoring signals and high-risk CtQ items by urgency (severity, ' +
    'criticality, risk score) so monitors and data managers triage the most consequential first. ' +
    'Use to produce a prioritized monitoring worklist.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
      limit: { type: 'number', description: 'Max items to return (default 15).' },
    },
    required: ['programId'],
  },
};

export const RUN_CENTRAL_MONITORING: AnaTool = {
  name: 'run_central_monitoring',
  description:
    'Runs unsupervised central statistical monitoring (CluePoints SMART-style) over a program\'s ' +
    'per-site risk snapshot: scores each site against the study cohort with a robust modified z-score and ' +
    'flags the sites that are statistical risk outliers (by composite/enrollment/quality/operational ' +
    'dimension), raising central_stat signals. Use to surface atypical sites before source verification.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
    },
    required: ['programId'],
  },
};

export const SCAN_PATIENT_PROFILES: AnaTool = {
  name: 'scan_patient_profiles',
  description:
    'Runs patient-level anomaly detection (CluePoints Patient-Profiles style) across a program\'s subject ' +
    'cohort: scores each subject against the cohort on every recorded metric with a robust modified z-score ' +
    'and flags atypical patients (review / flagged). Use to prioritize subjects for medical/safety review.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
    },
    required: ['programId'],
  },
};

export const GENERATE_RBM_REPORT: AnaTool = {
  name: 'generate_rbm_report',
  description:
    'Generates an inspection-ready ICH E6(R3) Risk Review for a program from its live RBM data — overall ' +
    'risk, open critical CtQ factors, red/amber KRIs, breached/approaching QTLs, high signals, enhanced-tier ' +
    'sites, flagged patients and overdue actions — as a structured report plus a markdown document. Use to ' +
    'produce the quality-oversight / inspection deliverable.',
  input_schema: {
    type: 'object',
    properties: { programId: { type: 'string', description: 'Program (project) UUID.' } },
    required: ['programId'],
  },
};

export const GET_RBM_ATTENTION: AnaTool = {
  name: 'get_rbm_attention',
  description:
    'Returns the prioritized "needs attention now" feed for a program: breached QTLs, high signals, red KRIs, ' +
    'flagged patients, overdue actions and unapproved active assessments, ordered by severity. Use for a fast ' +
    'monitoring stand-up or daily review.',
  input_schema: {
    type: 'object',
    properties: { programId: { type: 'string', description: 'Program (project) UUID.' } },
    required: ['programId'],
  },
};

// ── RBM actuation tools (conversation replaces forms) ─────────────────────────
// These WRITE. Each asks the user only for the primitives a monitor actually
// knows and infers the derived fields (risk score + criticality, KRI/QTL status,
// the QTL secondary limit, the plan strategy). Tenant scope (organization_id) is
// injected from server context in the handler — never from these inputs. When a
// required field is missing, the model should ASK a short follow-up rather than
// guess. Backed by server/services/rbm/rbm-actuator.ts.

export const ADD_CTQ_FACTOR: AnaTool = {
  name: 'add_ctq_factor',
  description:
    'Adds a Critical-to-Quality (CtQ) factor to a program\'s risk assessment (RACT). Ask the user for the ' +
    'factor and its likelihood (1–5) and impact (1–5); infer the risk score (likelihood×impact) and, unless ' +
    'told otherwise, mark it critical when the score falls in the high band. Optionally capture category, a ' +
    'risk description and the planned mitigation. Use when the user describes a new risk to the study.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
      ctqFactor: { type: 'string', description: 'The critical-to-quality factor / risk name.' },
      likelihood: { type: 'number', description: 'Likelihood 1 (rare) – 5 (almost certain).' },
      impact: { type: 'number', description: 'Impact 1 (negligible) – 5 (critical).' },
      category: { type: 'string', enum: ['safety', 'efficacy', 'data_integrity', 'compliance', 'operational'], description: 'Risk category (default operational).' },
      riskDescription: { type: 'string', description: 'What could go wrong and why it matters.' },
      detectability: { type: 'number', description: 'Optional detectability 1–5.' },
      mitigation: { type: 'string', description: 'Planned mitigation / control.' },
      isCritical: { type: 'boolean', description: 'Override the inferred criticality.' },
    },
    required: ['programId', 'ctqFactor', 'likelihood', 'impact'],
  },
};

export const DEFINE_KRI: AnaTool = {
  name: 'define_kri',
  description:
    'Defines a Key Risk Indicator (KRI) for a program. Ask for the indicator name, whether higher or lower is ' +
    'worse (direction), and the amber/red thresholds; infer the green/amber/red status from the current value ' +
    'if one is given. Use when the user wants to start tracking a new central-monitoring metric.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
      name: { type: 'string', description: 'KRI name, e.g. "Screen-failure rate".' },
      direction: { type: 'string', enum: ['higher_worse', 'lower_worse'], description: 'Whether a higher or lower value is worse.' },
      thresholdAmber: { type: 'number', description: 'Amber (warning) threshold.' },
      thresholdRed: { type: 'number', description: 'Red (action) threshold.' },
      unit: { type: 'string', description: 'Unit, e.g. "%", "days".' },
      dataSource: { type: 'string', enum: ['edc', 'ctms', 'site_intel', 'central_stats', 'manual'], description: 'Where the value comes from (default manual).' },
      metricDefinition: { type: 'string', description: 'How the metric is calculated.' },
      currentValue: { type: 'number', description: 'Current value, if known.' },
    },
    required: ['programId', 'name'],
  },
};

export const RECORD_KRI_READING: AnaTool = {
  name: 'record_kri_reading',
  description:
    'Records a new reading for an existing KRI and recomputes its status. Identify the KRI by id, or by name ' +
    'within the program (so the user can say "log screen-failure rate at 34%"). Ask for the value; infer the ' +
    'resulting green/amber/red status from the KRI\'s thresholds and direction.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID (needed to resolve a KRI by name).' },
      kriId: { type: 'number', description: 'KRI id, if known.' },
      kriName: { type: 'string', description: 'KRI name to match within the program, if the id is unknown.' },
      value: { type: 'number', description: 'The observed value.' },
      observedAt: { type: 'string', description: 'ISO timestamp of the observation (default now).' },
      note: { type: 'string', description: 'Optional note about the reading.' },
    },
    required: ['programId', 'value'],
  },
};

export const SET_QTL: AnaTool = {
  name: 'set_qtl',
  description:
    'Defines a Quality Tolerance Limit (QTL) for a program. Ask for the parameter, its primary threshold and a ' +
    'rationale; infer the secondary early-warning limit (75% of the threshold) when not given, and the ' +
    'within/approaching/breached status from the current value. Use for study-level tolerance governance.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
      parameter: { type: 'string', description: 'The QTL parameter, e.g. "Important protocol deviation rate".' },
      threshold: { type: 'number', description: 'Primary tolerance threshold.' },
      rationale: { type: 'string', description: 'Documented rationale for the limit (required by RBQM).' },
      secondaryLimit: { type: 'number', description: 'Override the inferred early-warning limit.' },
      currentValue: { type: 'number', description: 'Current value, if known.' },
    },
    required: ['programId', 'parameter'],
  },
};

export const RAISE_MONITORING_SIGNAL: AnaTool = {
  name: 'raise_monitoring_signal',
  description:
    'Raises a central-monitoring signal for triage. Ask for a short title and the severity (low/medium/high/' +
    'critical); optionally the site and a detail. Use when the user reports something to investigate that isn\'t ' +
    'already flagged by the automated detectors.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
      title: { type: 'string', description: 'Short signal title.' },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Severity (default medium).' },
      siteId: { type: 'string', description: 'Site id/number the signal concerns, if any.' },
      signalType: { type: 'string', description: 'Optional signal type/category.' },
      detail: { type: 'string', description: 'What was observed.' },
    },
    required: ['programId', 'title'],
  },
};

export const TRIAGE_SIGNAL: AnaTool = {
  name: 'triage_signal',
  description:
    'Triages an existing central-monitoring signal: move its status (new → triaged → investigating → resolved / ' +
    'dismissed), adjust severity, or attach resolution notes. Ask which signal (by id) and the new state.',
  input_schema: {
    type: 'object',
    properties: {
      signalId: { type: 'number', description: 'Signal id.' },
      status: { type: 'string', enum: ['new', 'triaged', 'investigating', 'resolved', 'dismissed'], description: 'New status.' },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Revised severity.' },
      resolutionNotes: { type: 'string', description: 'Notes on the investigation / resolution.' },
    },
    required: ['signalId'],
  },
};

export const DRAFT_MONITORING_PLAN: AnaTool = {
  name: 'draft_monitoring_plan',
  description:
    'Creates a monitoring plan for a program. Infer the strategy (centralized / risk-based / hybrid) from the ' +
    'program\'s assessment overall risk when not specified. The plan starts as a draft and must be approved ' +
    '(governed) before it is active. Follow with create_monitoring_action to populate the actions.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'Program (project) UUID.' },
      title: { type: 'string', description: 'Plan title (default "Risk-based monitoring plan").' },
      strategy: { type: 'string', enum: ['centralized', 'risk_based', 'on_site', 'hybrid'], description: 'Override the inferred strategy.' },
      assessmentId: { type: 'number', description: 'Assessment id to bind the plan to, if known.' },
    },
    required: ['programId'],
  },
};

export const CREATE_MONITORING_ACTION: AnaTool = {
  name: 'create_monitoring_action',
  description:
    'Adds a monitoring action (issue / CAPA / site visit / query / escalation) to a plan. Ask for the plan, a ' +
    'description, and the priority; optionally a due date and the linked risk item or signal. Use to turn a ' +
    'risk or signal into a tracked action.',
  input_schema: {
    type: 'object',
    properties: {
      planId: { type: 'number', description: 'Monitoring plan id.' },
      description: { type: 'string', description: 'What needs to be done.' },
      actionType: { type: 'string', enum: ['issue', 'capa', 'site_visit', 'query', 'escalation'], description: 'Action type (default issue).' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority (default medium).' },
      dueDate: { type: 'string', description: 'Due date YYYY-MM-DD.' },
      riskItemId: { type: 'number', description: 'Linked CtQ risk item id, if any.' },
      signalId: { type: 'number', description: 'Linked signal id, if any.' },
      owner: { type: 'number', description: 'Owner user id, if assigned.' },
    },
    required: ['planId', 'description'],
  },
};

export const UPDATE_MONITORING_ACTION: AnaTool = {
  name: 'update_monitoring_action',
  description:
    'Updates a monitoring action — most often to move its status (open → in_progress → done) or reassign / ' +
    'reprioritize it. Ask which action (by id) and what changed.',
  input_schema: {
    type: 'object',
    properties: {
      actionId: { type: 'number', description: 'Action id.' },
      status: { type: 'string', enum: ['open', 'in_progress', 'done'], description: 'New status.' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Revised priority.' },
      description: { type: 'string', description: 'Revised description.' },
      dueDate: { type: 'string', description: 'Revised due date YYYY-MM-DD.' },
      owner: { type: 'number', description: 'Reassign to user id.' },
    },
    required: ['actionId'],
  },
};

export const APPROVE_RBM_ASSESSMENT: AnaTool = {
  name: 'approve_rbm_assessment',
  description:
    'Approves and activates a risk assessment — a GOVERNED (21 CFR Part 11) action. You MUST obtain an explicit ' +
    'reason-for-change from the user before calling; the approval is attributed to the signed-in user. Do not ' +
    'infer or fabricate the reason. Confirm intent, then approve.',
  input_schema: {
    type: 'object',
    properties: {
      assessmentId: { type: 'number', description: 'Assessment id to approve.' },
      reason: { type: 'string', description: 'The user-supplied reason for change (required, non-empty).' },
    },
    required: ['assessmentId', 'reason'],
  },
};

export const APPROVE_RBM_PLAN: AnaTool = {
  name: 'approve_rbm_plan',
  description:
    'Approves and activates a monitoring plan — a GOVERNED (21 CFR Part 11) action. You MUST obtain an explicit ' +
    'reason-for-change from the user before calling; the approval is attributed to the signed-in user. Do not ' +
    'infer or fabricate the reason. Confirm intent, then approve.',
  input_schema: {
    type: 'object',
    properties: {
      planId: { type: 'number', description: 'Monitoring plan id to approve.' },
      reason: { type: 'string', description: 'The user-supplied reason for change (required, non-empty).' },
    },
    required: ['planId', 'reason'],
  },
};

export const ADVISE_REGULATORY_PATHWAY: AnaTool = {
  name: 'advise_regulatory_pathway',
  description:
    'Regulatory-strategy advisor: returns the authority, statutory basis, evidentiary expectations, key ' +
    'requirements and common pitfalls of a marketing-authorization route — or, given a product domain ' +
    'and/or jurisdiction, a ranked candidate set. Covers US drug/biologic routes (505(b)(1), 505(b)(2), ' +
    'ANDA, BLA 351(a)/351(k) biosimilar), US device/IVD routes (510(k), PMA, De Novo), and EU routes ' +
    '(centralised MA, MDR, IVDR). Advisory only — not a substitute for an agency pre-submission meeting.',
  input_schema: {
    type: 'object',
    properties: {
      pathway: {
        type: 'string',
        description: 'Specific pathway id/alias (e.g. 505b2, anda, 510k, pma, de_novo, biosimilar, mdr, ivdr).',
      },
      domain: { type: 'string', enum: ['drug', 'biologic', 'device', 'ivd'] },
      jurisdiction: { type: 'string', enum: ['us', 'eu'] },
    },
  },
};

export const SCREEN_PROMOTIONAL_LANGUAGE: AnaTool = {
  name: 'screen_promotional_language',
  description:
    'Screen text for promotional / non-compliant claim language (FDA OPDP & EU advertising risk) — ' +
    'superlatives/superiority, absolutes/guarantees, unqualified safety claims, causal/curative ' +
    'overreach, and unsupported comparatives — returning each flagged phrase with its category, ' +
    'severity, context, and a remediation suggestion. Run on any externally-facing or regulatory ' +
    'text before release. (A QC aid, not a substitute for regulatory/legal review.)',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to screen for claims/promotional language.' },
    },
    required: ['text'],
  },
};

export const DRAFT_SAFETY_NARRATIVE: AnaTool = {
  name: 'draft_safety_narrative',
  description:
    'Draft an ICH E3 §16-style patient safety narrative from structured case facts (death/SAE/' +
    'discontinuation): subject → relevant history & concomitant meds → study-drug exposure → event ' +
    '(severity, seriousness, onset) → action taken & treatment → dechallenge/rechallenge → outcome → ' +
    'investigator causality. Drafts ONLY from the supplied facts and reports any missing required ' +
    'fields for QC — never invents clinical detail.',
  input_schema: {
    type: 'object',
    properties: {
      subject_id: { type: 'string', description: 'Subject/patient identifier.' },
      age: { type: 'string', description: 'Age (years).' },
      sex: { type: 'string', description: 'Sex (e.g. male/female).' },
      study_id: { type: 'string', description: 'Study/protocol identifier.' },
      treatment_arm: { type: 'string', description: 'Randomized arm / treatment group.' },
      study_drug: { type: 'string', description: 'Investigational product name.' },
      dose: { type: 'string', description: 'Dose/regimen.' },
      first_dose_date: { type: 'string', description: 'Date of first dose.' },
      medical_history: { type: 'array', items: { type: 'string' }, description: 'Relevant medical history.' },
      concomitant_meds: { type: 'array', items: { type: 'string' }, description: 'Concomitant medications.' },
      event: {
        type: 'object',
        description: 'The adverse event facts.',
        properties: {
          term: { type: 'string', description: 'Event term (verbatim or MedDRA PT).' },
          onset_date: { type: 'string' },
          day_on_study: { type: 'string' },
          severity: { type: 'string', description: 'mild/moderate/severe or CTCAE grade.' },
          seriousness_criteria: { type: 'array', items: { type: 'string' }, description: 'e.g. hospitalization, life-threatening, death.' },
          causality: { type: 'string', description: 'Investigator causality, e.g. related/possibly related/not related.' },
          action_taken: { type: 'string', description: 'e.g. drug withdrawn/dose reduced/none.' },
          treatment: { type: 'string', description: 'Treatment given for the event.' },
          dechallenge: { type: 'string' },
          rechallenge: { type: 'string' },
          outcome: { type: 'string', description: 'e.g. recovered/recovering/fatal.' },
          notes: { type: 'string', description: 'Additional clinical course.' },
        },
        required: ['term'],
      },
    },
    required: ['subject_id', 'event'],
  },
};

export const LOOKUP_ICD10_CODE: AnaTool = {
  name: 'lookup_icd10_code',
  description:
    'Map a diagnosis / indication / condition term to billable ICD-10-CM codes (NLM Clinical Tables). ' +
    'Use to code an indication for labeling, claims/coverage, or case reporting, and to confirm exact ' +
    'code descriptions. Returns matching codes with their official descriptions.',
  input_schema: {
    type: 'object',
    properties: {
      term: { type: 'string', description: 'Diagnosis/condition/indication to code, e.g. "type 2 diabetes".' },
      max_results: { type: 'number', description: 'Maximum codes to return (default 10, max 25).' },
    },
    required: ['term'],
  },
};

export const MEDICAL_WRITING_GUIDANCE: AnaTool = {
  name: 'medical_writing_guidance',
  description:
    'Get authoritative medical-writing standards and craft for a deliverable — document structure, ' +
    'governing standards, therapeutic-area endpoints/terminology/reporting conventions, region/market ' +
    'style, audience register, and universal craft rules. ALWAYS call this before drafting or ' +
    'critiquing a regulatory/scientific document (CSR, protocol, CER, CTD summary, manuscript, lay ' +
    'summary, regulatory response, RMP, briefing package, IVD PER, PMCF) so the writing follows ICH/' +
    'EU MDR/IVDR/ICMJE/GPP conventions for the specific document × therapeutic area × market × ' +
    'audience. Combine with the evidence search tools to ground every claim.',
  input_schema: {
    type: 'object',
    properties: {
      document_type: {
        type: 'string',
        description:
          'Deliverable, e.g. csr, protocol, ib, clinical_overview, clinical_summary, cer, pmcf, per, ' +
          'manuscript, plain_language_summary, regulatory_response, rmp, meeting_package.',
      },
      therapeutic_area: {
        type: 'string',
        description: 'e.g. oncology, cardiology, neuroscience, infectious_disease, immunology, metabolic, respiratory, rare_disease, vaccines (or a disease name).',
      },
      region: {
        type: 'string',
        description: 'Target market: fda, ema, pmda, nmpa, hc, mhra, tga, or ich (global). Default ich.',
      },
      audience: {
        type: 'string',
        description: 'regulator, payer, clinician, or patient. Defaults to the document type’s primary audience.',
      },
      client_segment: {
        type: 'string',
        description: 'Optional: pharma, biotech, device, ivd, or cro (informational).',
      },
    },
    required: ['document_type'],
  },
};

export const ASSESS_READABILITY: AnaTool = {
  name: 'assess_readability',
  description:
    'Score text readability (Flesch Reading Ease + Flesch–Kincaid grade, sentence/word/syllable ' +
    'stats) against a target audience and return whether it meets the reading-level target with ' +
    'concrete suggestions. Use to QC lay/plain-language summaries and EU patient information leaflets ' +
    '(target ~grade 8), or to check that any document is not needlessly dense.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to assess.' },
      audience: {
        type: 'string',
        enum: ['patient', 'general', 'clinician', 'regulator'],
        description: 'Reading-level target. patient≈grade 8, general≈10, clinician≈16, regulator≈18.',
      },
    },
    required: ['text'],
  },
};

export const BUILD_ABBREVIATION_LIST: AnaTool = {
  name: 'build_abbreviation_list',
  description:
    'Extract acronyms/abbreviations from a draft, detect which are defined at first use (via "Full ' +
    'Term (ABC)" / "ABC (Full Term)" patterns), and return the abbreviation table plus a list of ' +
    'undefined ones to fix. Every CSR, CTD summary, CER, and manuscript needs a complete, ' +
    'defined-at-first-use abbreviation list — run this before finalizing.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The document text to scan for abbreviations.' },
    },
    required: ['text'],
  },
};

export const MEDICAL_WRITING_REVIEW: AnaTool = {
  name: 'medical_writing_review',
  description:
    "Self-review a draft (or pre-draft) against a document type's governing standard — checks section " +
    'coverage vs the required structure (ICH E3/M4E, EU MDR/IVDR, ICMJE, …) and returns a conformance ' +
    'checklist (structure, key requirements, pitfalls) plus a readiness verdict. Use before handing ' +
    'off or finalizing any regulatory/scientific document to QC it like an expert medical writer.',
  input_schema: {
    type: 'object',
    properties: {
      document_type: {
        type: 'string',
        description: 'Document type to review against, e.g. csr, protocol, cer, clinical_summary, manuscript.',
      },
      draft_text: {
        type: 'string',
        description: 'Optional draft text — when provided, section coverage is assessed against it.',
      },
    },
    required: ['document_type'],
  },
};

export const DESCRIBE_CAPABILITIES: AnaTool = {
  name: 'describe_capabilities',
  description:
    "Introspect AnA's OWN live abilities in this deployment: every registered tool, and which " +
    'integrations (evidence APIs, Gmail mailbox, Google Calendar, HubSpot CRM, document connectors) ' +
    'are actually configured right now. ALWAYS call this before answering "what can you do?", when ' +
    'planning a multi-tool workflow, or before relying on a workflow integration — so you only ' +
    'promise and attempt what is truly available, and can tell the user exactly what to connect to ' +
    'unlock the rest. Deterministic and read-only.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const ASSESS_REGULATORY_LANDSCAPE: AnaTool = {
  name: 'assess_regulatory_landscape',
  description:
    'Assemble a cross-source regulatory landscape for a topic in ONE call — fans out across ' +
    'ClinicalTrials.gov, PubMed, and CMS coverage, plus FDA device recalls (device domain) and/or ' +
    'FDA drug labels + Drugs@FDA approvals (drug domain). Returns compact, citeable sections to ' +
    'synthesize into a competitive / safety / reimbursement briefing. Prefer this over calling each ' +
    'source separately when the user wants an overview or landscape.',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'The product, indication, or device/drug to profile (e.g. "pembrolizumab NSCLC").',
      },
      domain: {
        type: 'string',
        enum: ['device', 'drug', 'auto'],
        description: "Scope the FDA sources: 'device', 'drug', or 'auto' (both). Default: auto.",
      },
      max_per_source: {
        type: 'number',
        description: 'Max items per source (default: 5, max: 15).',
      },
    },
    required: ['topic'],
  },
};

export const SEARCH_DRUG_APPROVALS: AnaTool = {
  name: 'search_drug_approvals',
  description:
    'Look up FDA drug approval status and regulatory history (Drugs@FDA) by brand name, generic ' +
    'name, or application number. Returns the application number (NDA/BLA/ANDA), sponsor, approval ' +
    'count + latest approval date, marketing status, and brand/generic names. Use for "is X ' +
    'approved / when / under what application" and reference-product / 505(b)(2) strategy.',
  input_schema: {
    type: 'object',
    properties: {
      brand_name: { type: 'string', description: 'Brand (trade) name, e.g. "Keytruda".' },
      generic_name: { type: 'string', description: 'Generic name, e.g. "pembrolizumab".' },
      application_number: { type: 'string', description: 'FDA application number, e.g. "BLA125514".' },
      query: { type: 'string', description: 'Free-text fallback matched against the brand name.' },
      max_results: { type: 'number', description: 'Maximum applications to return (default: 5, max: 10).' },
    },
    required: [],
  },
};

export const SEARCH_DRUG_LABELS: AnaTool = {
  name: 'search_drug_labels',
  description:
    'Search FDA drug labeling (openFDA Structured Product Labeling) by brand or generic name. ' +
    'Returns the key label sections — indications & usage, boxed/warnings, dosage & administration — ' +
    'plus manufacturer. Use for label-claim grounding, comparing against a reference/predicate label, ' +
    'and drafting safety sections.',
  input_schema: {
    type: 'object',
    properties: {
      brand_name: { type: 'string', description: 'Brand (trade) name, e.g. "Keytruda".' },
      generic_name: { type: 'string', description: 'Generic (nonproprietary) name, e.g. "pembrolizumab".' },
      query: { type: 'string', description: 'Free-text fallback matched against the brand name.' },
      max_results: { type: 'number', description: 'Maximum labels to return (default: 3, max: 10).' },
    },
    required: [],
  },
};

export const SEARCH_DEVICE_RECALLS: AnaTool = {
  name: 'search_device_recalls',
  description:
    'Search FDA device recalls (openFDA) by device name, manufacturer, or keyword. Returns a ' +
    'classification breakdown (Class I/II/III — Class I is most serious) plus recall details ' +
    '(reason, status, recalling firm). Use for post-market surveillance, CER safety sections, and ' +
    'competitive safety analysis.',
  input_schema: {
    type: 'object',
    properties: {
      device_name: {
        type: 'string',
        description: 'Device name / product description to search recalls for.',
      },
      manufacturer: {
        type: 'string',
        description: 'Recalling firm / manufacturer (used when no device name is given).',
      },
      query: {
        type: 'string',
        description: 'Free-text fallback matched against the recall product description.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum recalls to return (default: 25, max: 100).',
      },
    },
    required: [],
  },
};

export const SEARCH_CRM: AnaTool = {
  name: 'search_crm',
  description:
    'Search the HubSpot CRM (read-only) for contacts, companies, deals, or tickets related to a ' +
    'client account or project — to tie regulatory work to the commercial relationship (who the ' +
    'sponsor contacts are, deal stage, open tickets). Returns matching records with key properties ' +
    'and a link. Reports if the CRM is not connected.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search text (name, email, company, deal name, etc.).',
      },
      object: {
        type: 'string',
        enum: ['contacts', 'companies', 'deals', 'tickets'],
        description: 'CRM object type to search. Default: contacts.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum records to return (default: 10, max: 25).',
      },
    },
    required: ['query'],
  },
};

export const CREATE_CALENDAR_EVENT: AnaTool = {
  name: 'create_calendar_event',
  description:
    'Create an all-day event on the team Google Calendar for a regulatory milestone — a submission ' +
    'deadline, IR response due date, or document freeze date. This WRITES to the shared calendar; ' +
    'confirm the date and summary with the user before calling. Reports if the calendar is not connected.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Short event title, e.g. "IND sequence 0003 submission deadline".',
      },
      date: {
        type: 'string',
        description: 'All-day date in YYYY-MM-DD format.',
      },
      description: {
        type: 'string',
        description: 'Optional details (context, links, owner).',
      },
      timezone: {
        type: 'string',
        description: 'Optional IANA timezone (default: server TZ / UTC).',
      },
    },
    required: ['summary', 'date'],
  },
};

export const SEARCH_REGULATORY_CORRESPONDENCE: AnaTool = {
  name: 'search_regulatory_correspondence',
  description:
    "Search the organization's connected regulatory mailbox (read-only Gmail) for recent agency / " +
    'regulatory correspondence — information requests, deficiency letters, deadline notices, reviewer ' +
    'emails. Use for "what did the agency ask for recently?", deadline awareness, or pulling the ' +
    'context of an IR. Returns recent messages (subject, sender, date, snippet). Reports if the ' +
    'mailbox is not connected.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional keyword to filter messages (subject/sender/snippet). Omit for the most recent.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum messages to return (default: 10, max: 25).',
      },
    },
    required: [],
  },
};

export const SEARCH_LITERATURE: AnaTool = {
  name: 'search_literature',
  description:
    'Search published literature databases (PubMed, internal corpus) for relevant publications. Returns titles, abstracts, DOIs, and key findings.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Literature search query',
      },
      date_range: {
        type: 'string',
        description: 'Date range filter, e.g. "2020-2025"',
      },
      study_type: {
        type: 'string',
        enum: ['rct', 'observational', 'systematic_review', 'case_report', 'any'],
        description: 'Filter by study type',
      },
      max_results: {
        type: 'number',
        description: 'Maximum results (default: 10)',
      },
    },
    required: ['query'],
  },
};

export const RECORD_LITERATURE: AnaTool = {
  name: 'record_literature',
  description:
    "Record PubMed search hits into the organization's literature corpus (literature_entries) so " +
    'they appear in the CER workbench corpus chart. Use after search_literature when the user asks ' +
    'to save, record, or keep results. Idempotent per PMID — re-recording updates the stored entry ' +
    'instead of duplicating it. The organization comes from the active context, never from ' +
    'arguments. Honest limits: entries are stored unscreened (the table has no screening-state ' +
    'column, so include/exclude appraisal is not persisted) and are org-scoped (no program ' +
    'binding); the per-program corpus chart matches entries by product name in title/abstract.',
  input_schema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        description:
          'Search hits to record — typically the articles returned by search_literature. ' +
          'Each needs pmid + title; the other fields enrich the stored entry when present.',
        items: {
          type: 'object',
          properties: {
            pmid: { type: 'string', description: 'PubMed ID (numeric).' },
            title: { type: 'string', description: 'Article title.' },
            abstract: { type: 'string', description: 'Abstract text, when available.' },
            journal: { type: 'string', description: 'Journal name.' },
            year: { type: 'number', description: 'Publication year.' },
            authors: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Author names; a single comma-separated string is also accepted.',
            },
            doi: { type: 'string', description: 'DOI, when available.' },
            url: {
              type: 'string',
              description: 'Canonical PubMed URL — derived from the PMID when omitted.',
            },
          },
          required: ['pmid', 'title'],
        },
      },
    },
    required: ['entries'],
  },
};

export const SEARCH_IVD_KNOWLEDGE: AnaTool = {
  name: 'search_ivd_knowledge',
  description:
    'Search the curated IVD (in-vitro diagnostic) knowledge base — a citable corpus of scientific, ' +
    'legal, and regulatory intelligence spanning FDA (510(k)/De Novo/PMA, CLIA, CDx, LDT), EU IVDR ' +
    '(Annex VIII classification, performance evaluation, transition timeline), global pathways ' +
    '(Health Canada, PMDA, NMPA, ANVISA, TGA, MDSAP, IMDRF), analytical & clinical performance ' +
    '(CLSI EP series, traceability, ROC/cut-off), legal topics (LDT rule, patent eligibility, ' +
    'privacy, reimbursement), and key standards. Returns entries with summaries and source ' +
    'citations (CFR/IVDR article/ISO/CLSI/case law). Use this to ground IVD answers in a defensible ' +
    'source and cite the returned citations.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to look up (a topic, term, standard, article, or question).',
      },
      domain: {
        type: 'string',
        enum: ['regulatory', 'scientific', 'legal', 'standard'],
        description: 'Optional domain filter.',
      },
      jurisdiction: {
        type: 'string',
        enum: ['US', 'EU', 'UK', 'JP', 'CN', 'BR', 'CA', 'AU', 'global'],
        description: 'Optional jurisdiction filter.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum entries to return (default: 5, max: 15).',
      },
    },
    required: ['query'],
  },
};

export const PROJECT_KNOWLEDGE_SEARCH: AnaTool = {
  name: 'project_knowledge_search',
  description:
    "Search the ACTIVE project's own knowledge corpus — the documents and governed artifacts uploaded to this project — for passages relevant to a question. Use this when the user asks about content that lives in this project's files rather than general regulatory knowledge. Returns the most relevant passages with their source document titles and relevance scores; cite the document titles in your answer. The project and tenant come from the active context — you only supply the query.",
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to look for in the project knowledge (a question or topic).',
      },
      max_results: {
        type: 'number',
        description: 'Maximum passages to return (default: 6).',
      },
    },
    required: ['query'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic regulatory deficiency scan — runs the codified pattern registry
// (95+ FDA/EMA deficiency and reviewer-trigger patterns) against text with NO
// language-model call: pure regex/heuristic matching. Surfaces likely reviewer
// triggers, the question each would provoke, the regulatory basis, and concrete
// remediations / stronger phrasings. This is AnA's reasoning-without-the-LLM
// surface — fast, stable, citable, and runnable on its own.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Submission pre-mortem (RTF/CRL) — the economic-moat capability. Composes the
// deterministic deficiency scan with the precedent engine into one grounded,
// honest-by-construction readiness verdict: what a reviewer will likely flag,
// ranked, each with the reviewer question, regulatory basis, remediation, and
// precedent citations — and an overall risk level that ALWAYS carries its
// confidence and denominator (n of precedents), degrading to an explicit
// "insufficient data, confidence: low" rather than a fabricated probability.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Grounding guarantee — make the product's "never invent figures" rule
// checkable. Detects quantitative claims (percentages, p-values, n=, CIs,
// fold-changes, counts, doses, durations) in drafted text and flags any not
// accompanied by a citation/source marker, so AnA grounds or hedges every
// number before it reaches a regulatory reader. Deterministic, no LLM.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 21 CFR Part 11 §11.50 signature manifestation — produce the human-readable
// signature block (printed name, date/time of signing, meaning) to embed in the
// rendered record. The platform captures e-signatures but had no formatted
// manifestation to surface; this closes that inspection-readiness gap.
// ─────────────────────────────────────────────────────────────────────────────

export const RENDER_SIGNATURE_MANIFESTATION: AnaTool = {
  name: 'render_signature_manifestation',
  description:
    "Produce the human-readable 21 CFR Part 11 §11.50 signature manifestation block for an executed electronic signature — the printed name of the signer, the date and time of signing (UTC), and the meaning of the signature (review / approval / authorship), plus the supporting authentication and signature-id/hash controls. Embed the returned block in any rendered (PDF/Word) form of a signed record so it is inspection-ready. Provide the signature_id; the signature is loaded tenant-scoped from the governed signature store.",
  input_schema: {
    type: 'object',
    properties: {
      signature_id: {
        type: 'string',
        description: 'The signatureId of the executed electronic signature to manifest.',
      },
      record_title: {
        type: 'string',
        description: 'Optional title of the record the signature applies to, included in the block.',
      },
    },
    required: ['signature_id'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Honesty envelope — the platform's "confidence with its denominator attached"
// moat as a reusable primitive. Turns an evidence basis (n + freshness) into a
// confidence level + human-readable label, and gates "final-ready" claims when
// a dependency is missing or stale. Deterministic, no LLM.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_OUTPUT_CONFIDENCE: AnaTool = {
  name: 'assess_output_confidence',
  description:
    "Attach honest confidence to a quantitative output: given the number of supporting data points (n) and how fresh the evidence is, returns a confidence level (low/medium/high) and a ready-to-show label like 'confidence: medium (n=28, freshness: 6 days ago)'. Confidence is downgraded when evidence is stale and is always 'low (insufficient data)' at n=0 — never overstated. Optionally gate a 'final-ready' claim: provide dependencies and it returns whether the output is final-ready plus the explicit blockers (missing/stale) to show. Use this to stamp any number AnA presents so the platform's 'decision confidence with its denominator attached' rule holds everywhere. Deterministic, no LLM.",
  input_schema: {
    type: 'object',
    properties: {
      n: {
        type: 'number',
        description: 'Number of supporting data points / precedents (the denominator).',
      },
      freshness_days: {
        type: 'number',
        description: 'Age in days of the freshest supporting evidence. Omit if unknown.',
      },
      max_freshness_days: {
        type: 'number',
        description: 'Age (days) beyond which evidence is stale. Default 180.',
      },
      dependencies: {
        type: 'array',
        description: 'Optional dependencies to gate a final-ready claim.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            present: { type: 'boolean' },
            freshness_days: { type: 'number' },
          },
          required: ['name', 'present'],
        },
      },
    },
    required: ['n'],
  },
};

export const CHECK_GROUNDING: AnaTool = {
  name: 'check_grounding',
  description:
    "Check drafted regulatory text for UNGROUNDED quantitative claims — numbers, percentages, p-values, sample sizes, confidence intervals, fold-changes, doses, durations — that are not backed by a nearby citation or source marker. Returns each ungrounded claim, a grounding score (0–1), and whether the text passes. Run this on your own draft BEFORE presenting numbers to a regulatory reader: every figure must trace to a source or be explicitly hedged. Deterministic (no LLM). Use it to enforce 'never state a number without a cited source'.",
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The drafted text to check for ungrounded quantitative claims.',
      },
    },
    required: ['text'],
  },
};

export const RUN_SUBMISSION_PREMORTEM: AnaTool = {
  name: 'run_submission_premortem',
  description:
    "Run an RTF/CRL pre-mortem on draft submission text BEFORE filing: predict what a reviewer is likely to flag and how to fix it, so the client avoids a refuse-to-file or complete-response cycle. Combines deterministic deficiency/reviewer-trigger detection (no LLM) with the precedent engine, and returns a ranked finding list — each with the reviewer question, regulatory basis, and concrete remediation — plus an overall risk level. Honest by construction: the risk read ALWAYS carries its confidence and denominator (number of precedents), and returns an explicit 'pattern-only / insufficient data, confidence: low' when the precedent corpus is thin, never a fabricated probability. Provide the draft text and, ideally, the agency and submission type.",
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The draft submission text to assess (a section, module, or claim set).',
      },
      submission_type: {
        type: 'string',
        description: 'Submission type for precedent calibration (e.g. IND, NDA, BLA, 510(k), PMA, MAA).',
      },
      agency: {
        type: 'string',
        description: 'Target agency (e.g. FDA, EMA, PMDA). Used for scope and precedent filtering.',
      },
      indication: {
        type: 'string',
        description: 'Optional indication / therapeutic area to sharpen precedent matching.',
      },
      location: {
        type: 'string',
        description: "Section/field reference for provenance (e.g. '2.5 Clinical Overview'). Default 'document'.",
      },
    },
    required: ['text'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// E14 — CRL/RTF pre-mortem sealed as an exportable DECISION ARTIFACT. Lifts the
// run_submission_premortem verdict into a board-ready artifact: an approval-
// probability ESTIMATE (grounded in the cited precedent approve/deny split,
// never a guarantee), a ranked top-risks list with each risk bound to its
// grounding precedent, a prioritized fix-list, and an exportability/honesty
// guard. Honest by construction: pattern-only / insufficient-data reads are
// marked not_assessed and are NOT exportable/sealable; sample artifacts never
// export. The artifact is generated UNSEALED — E1's Sign-and-seal attaches the
// seal/provenance without changing assembly.
// ─────────────────────────────────────────────────────────────────────────────
export const ASSEMBLE_CRL_PREMORTEM_ARTIFACT: AnaTool = {
  name: 'assemble_crl_premortem_artifact',
  description:
    "Assemble a board-ready CRL/RTF pre-mortem DECISION ARTIFACT from draft submission text: runs the RTF/CRL pre-mortem (deterministic reviewer-trigger detection + the precedent engine) and composes an executive-ready artifact — an approval-probability ESTIMATE grounded in the approve/deny split of the cited precedents (always framed as an estimate, never a guarantee, carrying its denominator and confidence), a ranked top-risks list where each risk is bound to the precedent that grounds it, a prioritized fix-list, and the precedent citations. Honest by construction: when the precedent corpus is too thin to calibrate, the artifact is marked 'not_assessed' and carries NO probability and is NOT exportable. Set export=true to also render and author the artifact as a Word document via the native docx engine (only permitted for an 'estimated', non-sample artifact); the exported document is marked UNSEALED until signed. Provide the draft text and, ideally, the agency and submission type.",
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The draft submission text to assess (a section, module, or claim set).',
      },
      submission_type: {
        type: 'string',
        description: 'Submission type for precedent calibration (e.g. IND, NDA, BLA, 510(k), PMA, MAA).',
      },
      agency: {
        type: 'string',
        description: 'Target agency (e.g. FDA, EMA, PMDA). Used for scope and precedent filtering.',
      },
      indication: {
        type: 'string',
        description: 'Optional indication / therapeutic area to sharpen precedent matching.',
      },
      location: {
        type: 'string',
        description: "Section/field reference for provenance (e.g. '2.5 Clinical Overview'). Default 'document'.",
      },
      title: {
        type: 'string',
        description: 'Optional artifact title for the board-ready report.',
      },
      export: {
        type: 'boolean',
        description:
          'When true, also render and author the artifact as a Word document via the native docx engine (only for an estimable, non-sample artifact). Default false.',
      },
    },
    required: ['text'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// E8 — Pre-IND / EOP2 briefing-book builder with reviewer-challenge pre-mortem.
// Assembles a regulatory-agency meeting briefing book (background, objectives,
// questions for the agency, supporting-data summary) from a RegAgencyMeeting,
// then stress-tests the sponsor's enumerated questions against ANTICIPATED FDA
// pushback via simulate_reviewer_challenges + run_submission_premortem. Returns
// the assembled markdown (hand to author_docx_native), the required_strings for
// verify_docx_against_source (mandatory headers + sponsor questions), and an
// honest pre-mortem verdict. Honest by construction: a book built from sample /
// fixture meeting data is not_assessed and not sealable/exportable; anticipated
// pushback is framed as anticipated, never an actual agency position.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSEMBLE_BRIEFING_BOOK: AnaTool = {
  name: 'assemble_briefing_book',
  description:
    "Assemble a Pre-IND / End-of-Phase-2 (or other Type A/B/C) regulatory-agency MEETING BRIEFING BOOK from a RegAgencyMeeting and stress-test the sponsor's questions against anticipated FDA pushback. Produces the four mandatory sections (Background, Product Development Objectives, Questions for the Agency, Supporting-Data Summary) as markdown ready for author_docx_native, plus the required_strings (the mandatory section headers AND each enumerated sponsor question, verbatim) to pass to verify_docx_against_source. When run_premortem is set, it also surfaces the anticipated reviewer pushback per sponsor question by folding in simulate_reviewer_challenges + run_submission_premortem — labelled ANTICIPATED, never an actual agency position. Honest by construction: a book assembled from sample/fixture meeting data (no live meeting id supplied) is marked not_assessed and is NOT sealable or exportable. Tenant context is injected from the request.",
  input_schema: {
    type: 'object',
    properties: {
      meeting_id: {
        type: 'string',
        description:
          'Optional id of a live RegAgencyMeeting to build from. When omitted, a labelled fixture EOP2 meeting is used and the resulting book is marked sample / not_assessed.',
      },
      meeting_type: {
        type: 'string',
        enum: ['pre_ind', 'eop1', 'eop2', 'pre_nda', 'pre_bla', 'type_a', 'type_b', 'type_c', 'type_d'],
        description: 'Meeting type. Defaults to the fixture meeting type (eop2) when no live meeting is supplied.',
      },
      key_questions: {
        type: 'array',
        items: { type: 'string' },
        description: "The sponsor's enumerated questions for the agency. Each becomes a required_string and a pre-mortem row.",
      },
      product_name: { type: 'string', description: 'Investigational product name for the title and narrative.' },
      indication: { type: 'string', description: 'Indication / therapeutic area.' },
      sponsor: { type: 'string', description: 'Sponsor name.' },
      run_premortem: {
        type: 'boolean',
        description:
          'When true (default), surface anticipated FDA pushback per sponsor question via the reviewer-challenge and pre-mortem engines. Requires package_id + assessment_id for the reviewer-lens pass; degrades to pattern-only pre-mortem otherwise.',
      },
      package_id: { type: 'number', description: 'Submission package id for simulate_reviewer_challenges (optional).' },
      assessment_id: { type: 'number', description: 'Submission-twin assessment id for simulate_reviewer_challenges (optional).' },
    },
    required: [],
  },
};

export const SCAN_REGULATORY_DEFICIENCIES: AnaTool = {
  name: 'scan_regulatory_deficiencies',
  description:
    "Deterministically scan regulatory text for known deficiency and reviewer-trigger patterns using AnA's codified pattern registry — NO language-model call, pure heuristic/regex matching, fast and reproducible. Returns each match with the pattern name, category (deficiency / reviewer_trigger), severity, the matched text, a confidence score, the reviewer question it is likely to provoke, the regulatory basis, and concrete remediation plus stronger alternative phrasings. Use it as a quick, defensible first pass over a draft section, or whenever you want pattern-level analysis without invoking the full model. Optional filters narrow to an agency, submission type, category, or minimum severity.",
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The regulatory text to scan (a section, paragraph, or claim).',
      },
      location: {
        type: 'string',
        description: "A section or field reference for provenance (e.g. '2.5 Clinical Overview'). Default 'document'.",
      },
      agency: {
        type: 'string',
        description: 'Optional agency filter (e.g. FDA, EMA, PMDA).',
      },
      submission_type: {
        type: 'string',
        description: 'Optional submission-type filter (e.g. IND, NDA, BLA, 510(k)).',
      },
      category: {
        type: 'string',
        enum: ['deficiency', 'reviewer_trigger', 'rejection', 'strength', 'any'],
        description: 'Optional pattern category filter.',
      },
      min_severity: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        description: 'Optional minimum severity to report.',
      },
    },
    required: ['text'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Large-document working set — extract a single uploaded document's FULL text
// server-side and run query-targeted search over it, returning only the
// relevant windows (with char offsets) plus a heading outline. Lets AnA work
// with documents far larger than the per-turn result cap without dumping the
// whole file into context. Stateless and tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

export const SEARCH_LARGE_DOCUMENT: AnaTool = {
  name: 'search_large_document',
  description:
    "Search WITHIN a single uploaded document that is too large to hold in context at once. AnA extracts the document's full text server-side and returns only the passages relevant to your queries — the matching windows with surrounding context and their character offsets — plus a heading outline of the document. Use this instead of paging blindly through a big file: give the questions/terms you care about and get back the exact excerpts to read and cite. Tenant-scoped; the file must belong to the active organization.",
  input_schema: {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'The uploaded file id (e.g. "file_1712…" from a chat upload).',
      },
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'One or more terms/phrases/questions to locate within the document.',
      },
      window_chars: {
        type: 'number',
        description: 'Characters of context kept around each match. Default 320.',
      },
      max_windows_per_query: {
        type: 'number',
        description: 'Maximum excerpt windows returned per query. Default 4.',
      },
    },
    required: ['file_id', 'queries'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Remember a read document into durable project memory — promote a document AnA
// has read into the project's persistent memory (project_memory_entries,
// embedded) so it is surfaced automatically in future sessions via the memory
// assembler and session bootstrap. Reuses the real project-ingestion pipeline.
// Tenant- and project-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

export const REMEMBER_DOCUMENT_IN_PROJECT: AnaTool = {
  name: 'remember_document_in_project',
  description:
    "Persist a document AnA has read into the active project's durable memory so it is automatically recalled in future sessions (not just this turn). The document's text is extracted and its key facts are embedded into project memory, where the memory assembler and session bootstrap will surface them later. Use this when a read document contains material the project should remember going forward. Requires an active project; the file must belong to the active organization.",
  input_schema: {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'The uploaded file id to remember (e.g. "file_1712…").',
      },
    },
    required: ['file_id'],
  },
};

export const PROJECT_KNOWLEDGE_SEARCH_MULTI: AnaTool = {
  name: 'project_knowledge_search_multi',
  description:
    "Run SEVERAL knowledge-base searches against the active project's corpus in one call, then merge and de-duplicate the results. Use this to gather evidence across multiple angles at once — e.g. decompose a complex question into sub-queries (primary endpoint, safety signal, statistical method) and retrieve all of them simultaneously instead of one search at a time. Returns a merged, de-duplicated, relevance-ranked passage list plus a per-query breakdown, each passage cited by source document title and locator. The project and tenant come from the active context.",
  input_schema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Two to eight distinct sub-queries to search simultaneously (different angles on the question).',
      },
      max_results_per_query: {
        type: 'number',
        description: 'Maximum passages to retrieve per sub-query before merging (default: 5, max: 10).',
      },
      max_merged_results: {
        type: 'number',
        description: 'Maximum passages in the merged, de-duplicated result set (default: 12, max: 25).',
      },
    },
    required: ['queries'],
  },
};

export const RECALL_SESSION_CONTEXT: AnaTool = {
  name: 'recall_session_context',
  description:
    "Rehydrate prior context so the session doesn't start cold: load where we left off (the latest thread working-memory summary), the most important project and client knowledge atoms (by importance/verification/recency — no query needed), and recent lessons from your own past work on this org/project. Call this at the start of a conversation, or whenever you need to ground yourself in what has already been established, before answering. The org and project come from the active context.",
  input_schema: {
    type: 'object',
    properties: {
      thread_id: {
        type: 'string',
        description: 'Optional conversation/thread id to load the latest working-memory summary for. Omit if unknown — project/client memory and past lessons still load.',
      },
      atom_limit: {
        type: 'number',
        description: 'Maximum project knowledge atoms to surface (default 6).',
      },
    },
    required: [],
  },
};

export const SIMULATE_STUDY_DESIGN: AnaTool = {
  name: 'simulate_study_design',
  description:
    "Simulate a clinical study design as a DIGITAL TWIN and predict its likely outcomes — approximate probability of success on the primary endpoint, expected effect vs. the powered assumption, enrolment/dropout feasibility, and the design risks most likely to sink the readout. Works for ANY therapeutic area and ANY phase (first-in-human through phase 4). Grounds the prediction in the client's uploaded history (prior CSRs / study records) when available. The result ALWAYS carries a predictive disclaimer — you MUST include that disclaimer verbatim in your answer — and when the client has uploaded no history, it carries a request to upload prior CSRs so AnA can learn; surface that request to the user. The organization and project come from the active context.",
  input_schema: {
    type: 'object',
    properties: {
      phase: { type: 'string', description: 'Development phase: FIH, 1, 1b, 2, 2b, 3, 3b, or 4.' },
      indication: { type: 'string', description: 'Disease / indication (any therapeutic area).' },
      product_type: {
        type: 'string',
        enum: ['drug', 'biologic', 'device', 'ivd', 'combination'],
        description: 'Product type.',
      },
      structural_design: {
        type: 'string',
        description: 'e.g. parallel_group, crossover, single_arm, adaptive, platform, basket.',
      },
      control_type: { type: 'string', description: 'e.g. placebo, active, historical, external, none.' },
      inferential_frame: {
        type: 'string',
        enum: ['superiority', 'non_inferiority', 'equivalence'],
        description: 'Inferential frame.',
      },
      primary_endpoint: {
        type: 'string',
        description: 'Primary endpoint definition, e.g. "change from baseline in HbA1c at week 24".',
      },
      primary_endpoint_type: {
        type: 'string',
        enum: ['continuous', 'binary', 'time_to_event', 'ordinal', 'count', 'composite', 'patient_reported'],
        description: 'Primary endpoint measurement family.',
      },
      planned_sample_size: { type: 'number', description: 'Planned total N.' },
      power: { type: 'number', description: 'Target power (0-1).' },
      alpha: { type: 'number', description: 'Type I error (e.g. 0.05).' },
      dropout_rate: { type: 'number', description: 'Assumed dropout rate (0-1).' },
      effect_size: { type: 'number', description: 'Assumed effect size used to power the study.' },
      question: { type: 'string', description: 'Optional focus for the simulation.' },
    },
    required: ['phase', 'indication'],
  },
};
