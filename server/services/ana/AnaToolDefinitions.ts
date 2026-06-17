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
import { ANA_ADVISORY_TOOL_SPECS, SUBMISSION_PLAN_TOOL_SPEC, PMA_ADVISORY_TOOL_SPEC, EU_TECHDOC_TOOL_SPEC, IVD_KNOWLEDGE_TOOL_SPEC } from '../ana-advisory';
import { GLOBAL_RI_TOOL_SPECS } from '../global-ri/ana-tools';

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
    "Assemble a regional eCTD zip (FDA us-regional.xml / EMA eu-regional.xml / PMDA jp-regional.xml) from a set of CTD leaves. Produces the correct Module 1 folder structure per region, computes SHA-256, and returns the bundle metadata for downstream transmit. Use after AnA has gathered the leaf manifest for a submission.",
  input_schema: {
    type: 'object',
    properties: {
      region:          { type: 'string', enum: ['fda', 'ema', 'pmda'] },
      application_id:  { type: 'string', description: 'IND/NDA number (FDA), procedure number (EMA), application number (PMDA).' },
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
    "Transmit an already-packaged bundle to a regulatory gateway (FDA ESG, EMA CESP, EMA EUDAMED, or PMDA Gateway). Returns the transmittal id and gateway-issued tracking number. Throws when credentials are not configured for the org × environment. Use after package_ectd_for_region or after assembling a region-specific deliverable like an eSTAR or a EUDAMED device-registration JSON.",
  input_schema: {
    type: 'object',
    properties: {
      region:      { type: 'string', enum: ['fda', 'ema', 'pmda'] },
      gateway:     { type: 'string', enum: ['esg', 'cesp', 'eudamed', 'pmda_gateway'] },
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

export const CREATE_GRANT_PROPOSAL: AnaTool = {
  name: 'create_grant_proposal',
  description:
    "Open a grant proposal (application) in the sponsored-programs pipeline. Optionally link the funding opportunity it responds to and the Project it belongs to. Returns the proposal id. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      opportunity_id: { type: 'number' },
      project_id: { type: 'number' },
      principal_investigator: { type: 'string' },
      requested_amount: { type: 'number' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['title'],
  },
};

export const RECORD_GRANT_AWARD: AnaTool = {
  name: 'record_grant_award',
  description:
    "Record a grant award (post-award). When linked to its proposal, the proposal is marked awarded and the proposal → award provenance link is written (preserving pre→post-award continuity). Returns the award id. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      award_number: { type: 'string' },
      funding_agency: { type: 'string', enum: ['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other'] },
      proposal_id: { type: 'number' },
      project_id: { type: 'number' },
      total_amount: { type: 'number' },
      period_start: { type: 'string', description: 'YYYY-MM-DD.' },
      period_end: { type: 'string', description: 'YYYY-MM-DD.' },
      reason: { type: 'string', description: 'Audit reason (>= 8 chars).' },
    },
    required: ['award_number', 'funding_agency'],
  },
};

export const REVIEW_GRANT_REPORTING: AnaTool = {
  name: 'review_grant_reporting',
  description:
    "Compute the federal post-award reporting obligations for an award (read-only): annual RPPRs and the final performance + financial reports (2 CFR 200.344, 120 days after period end), plus where the award sits in its period of performance. Use to tell the user what reports are coming due.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' } },
    required: ['award_id'],
  },
};

export const SET_GRANT_MILESTONE_STATUS: AnaTool = {
  name: 'set_grant_milestone_status',
  description:
    "Transition a grant milestone's status (pending → in_progress → met/submitted, or missed). Met/submitted stamps the completion date. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: { milestone_id: { type: 'number' }, status: { type: 'string', enum: ['pending', 'in_progress', 'met', 'missed', 'submitted'] }, completed_date: { type: 'string', description: 'YYYY-MM-DD.' }, reason: { type: 'string' } },
    required: ['milestone_id', 'status'],
  },
};

export const OPEN_GRANT_CLOSEOUT: AnaTool = {
  name: 'open_grant_closeout',
  description:
    "Open the closeout record for a grant award. Derives the federal closeout due date (period of performance end + 120 days, 2 CFR 200.344). One closeout per award. Governed + audited, org-scoped.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' }, reason: { type: 'string' } }, required: ['award_id'] },
};

export const UPDATE_GRANT_CLOSEOUT: AnaTool = {
  name: 'update_grant_closeout',
  description:
    "Mark grant-closeout checklist items complete: final performance report (RPPR), final FFR (SF-425), final property/equipment inventory, and reconciliation of final invoices (2 CFR 200.344 / 200.313). Submitting an item stamps its date. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      award_id: { type: 'number' },
      final_rppr_submitted: { type: 'boolean' }, final_ffr_submitted: { type: 'boolean' },
      equipment_inventory_returned: { type: 'boolean' }, final_invoices_reconciled: { type: 'boolean' },
      deobligation_amount: { type: 'number' }, notes: { type: 'string' }, reason: { type: 'string' },
    },
    required: ['award_id'],
  },
};

export const FINALIZE_GRANT_CLOSEOUT: AnaTool = {
  name: 'finalize_grant_closeout',
  description:
    "Finalize a grant closeout. Gated: all four 2 CFR 200.344 items must be complete (final RPPR, final FFR, property inventory, invoice reconciliation); otherwise it is rejected with the outstanding items. On success the award is closed. Governed + audited (signature).",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' }, reason: { type: 'string' } }, required: ['award_id'] },
};

export const RECORD_SUBAWARD: AnaTool = {
  name: 'record_subaward',
  description:
    "Record a subaward to a subrecipient under a prime award (2 CFR 200.331). Capture institution type, amount, period, and an initial risk level. The subaward starts in 'draft' and cannot be executed until screened and risk-assessed. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: {
      award_id: { type: 'number' }, subrecipient_name: { type: 'string' }, subrecipient_uei: { type: 'string' },
      institution_type: { type: 'string', enum: ['higher_ed', 'nonprofit', 'commercial', 'foreign', 'government', 'other'] },
      amount: { type: 'number' }, period_start: { type: 'string' }, period_end: { type: 'string' },
      risk_level: { type: 'string', enum: ['low', 'medium', 'high'] }, reason: { type: 'string' },
    },
    required: ['award_id', 'subrecipient_name'],
  },
};

export const SCREEN_SUBAWARD: AnaTool = {
  name: 'screen_subaward',
  description:
    "Record the restricted-party screening result for a subaward's subrecipient (2 CFR 200.214). Use screen_restricted_party first to perform the live SAM.gov exclusions lookup, then record 'cleared' or 'excluded' here. Optionally set the risk level. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { subaward_id: { type: 'number' }, screen_status: { type: 'string', enum: ['cleared', 'excluded'] }, screen_source: { type: 'string' }, risk_level: { type: 'string', enum: ['low', 'medium', 'high'] }, reason: { type: 'string' } },
    required: ['subaward_id', 'screen_status'],
  },
};

export const EXECUTE_SUBAWARD: AnaTool = {
  name: 'execute_subaward',
  description:
    "Execute a subaward. Gated: rejected unless the subrecipient was screened CLEAR of SAM.gov exclusions and a risk assessment is recorded (2 CFR 200.214 / 200.332). Governed + audited (signature).",
  input_schema: { type: 'object', properties: { subaward_id: { type: 'number' }, reason: { type: 'string' } }, required: ['subaward_id'] },
};

const BUDGET_CATEGORY_ENUM = ['personnel', 'fringe', 'equipment', 'travel', 'supplies', 'contractual', 'construction', 'other_direct', 'indirect'];

export const ADD_GRANT_BUDGET_LINE: AnaTool = {
  name: 'add_grant_budget_line',
  description:
    "Add a budget line to an award by cost category (2 CFR 200.308). Gated: rejected if the running total budgeted would over-allocate the award amount. On the 'indirect' line, set indirect_rate_pct for the F&A rate (2 CFR 200.414). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' }, category: { type: 'string', enum: BUDGET_CATEGORY_ENUM }, budgeted_amount: { type: 'number' }, indirect_rate_pct: { type: 'number' }, notes: { type: 'string' }, reason: { type: 'string' } },
    required: ['award_id', 'category', 'budgeted_amount'],
  },
};

export const RECORD_GRANT_EXPENDITURE: AnaTool = {
  name: 'record_grant_expenditure',
  description:
    "Record an actual expenditure booked against an award, by cost category (2 CFR 200.403). Expenditures are recorded as-is; over-budget categories are surfaced by review_grant_budget, not blocked here. Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' }, category: { type: 'string', enum: BUDGET_CATEGORY_ENUM }, amount: { type: 'number' }, expenditure_date: { type: 'string', description: 'YYYY-MM-DD.' }, description: { type: 'string' }, reason: { type: 'string' } },
    required: ['award_id', 'category', 'amount'],
  },
};

export const REVIEW_GRANT_BUDGET: AnaTool = {
  name: 'review_grant_budget',
  description:
    "Reconcile budget vs actual for an award (read-only): per-category budgeted/spent/remaining, over-budget and over-allocation flags, a risk level, and findings citing 2 CFR 200.308/200.403. Use to tell the user how the award is tracking financially.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' } }, required: ['award_id'] },
};

export const RECORD_COST_SHARE_CONTRIBUTION: AnaTool = {
  name: 'record_cost_share_contribution',
  description:
    "Record an actual cost-share / matching contribution against an award's committed cost share (2 CFR 200.306), by source (institutional, third-party, in-kind, other). Governed + audited.",
  input_schema: {
    type: 'object',
    properties: { award_id: { type: 'number' }, source: { type: 'string', enum: ['institutional', 'third_party', 'in_kind', 'other'] }, amount: { type: 'number' }, contribution_date: { type: 'string' }, description: { type: 'string' }, reason: { type: 'string' } },
    required: ['award_id', 'source', 'amount'],
  },
};

export const REVIEW_COST_SHARE: AnaTool = {
  name: 'review_cost_share',
  description:
    "Report cost-share status for an award (read-only): committed vs contributed, percent met, and any shortfall (2 CFR 200.306). Use to tell the user whether the match commitment is on track.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' } }, required: ['award_id'] },
};

export const REQUEST_NO_COST_EXTENSION: AnaTool = {
  name: 'request_no_cost_extension',
  description:
    "Request a no-cost extension of an award's period of performance (2 CFR 200.308). Returns whether it is within grantee authority (first extension, ≤12 months) or requires sponsor prior approval. Governed + audited.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' }, new_end_date: { type: 'string', description: 'YYYY-MM-DD.' }, reason: { type: 'string' } }, required: ['award_id', 'new_end_date'] },
};

export const APPROVE_NO_COST_EXTENSION: AnaTool = {
  name: 'approve_no_cost_extension',
  description:
    "Approve a requested no-cost extension. Gated: grantee authority cannot self-approve an extension that requires sponsor prior approval (a second extension, or one over 12 months). On approval the award's period end moves out. Governed + audited (signature).",
  input_schema: { type: 'object', properties: { nce_id: { type: 'number' }, authority: { type: 'string', enum: ['grantee', 'sponsor'] }, reason: { type: 'string' } }, required: ['nce_id', 'authority'] },
};

export const RECORD_GRANT_OPPORTUNITY: AnaTool = {
  name: 'record_grant_opportunity',
  description:
    "Record a federal funding opportunity (NOFO) into the pre-award pipeline as a governed grant_opportunities row. Pairs with search_grants_gov: pass the Grants.gov opportunity id as external_id to thread the external link. Specify agency and (optionally) the mechanism (SBIR/STTR/R01…), due date, and ceiling. Governed + audited, org-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      opportunity_number: { type: 'string' }, title: { type: 'string' },
      funding_agency: { type: 'string', enum: ['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other'] },
      mechanism: { type: 'string', enum: ['sbir', 'sttr', 'r01', 'r21', 'u01', 'p01', 'contract', 'cooperative_agreement', 'other'] },
      external_id: { type: 'string', description: 'Grants.gov opportunity id (from search_grants_gov).' },
      due_date: { type: 'string', description: 'YYYY-MM-DD.' }, ceiling_amount: { type: 'number' }, reason: { type: 'string' },
    },
    required: ['opportunity_number', 'title', 'funding_agency'],
  },
};

export const PREPARE_AWARD_CLOSEOUT: AnaTool = {
  name: 'prepare_award_closeout',
  description:
    "One-shot closeout-readiness assessment for a grant award (read-only orchestration): pulls the four 2 CFR 200.344 closeout items, outstanding/overdue milestones, the federal reporting obligations (final RPPR/FFR), cost-share status (200.306), and budget posture (200.403) into a single verdict with a prioritized blocker list. `readyToClose` is stricter than finalize — it also wants milestones current, cost share met, and spending within the award. Use to answer 'can we close this award and what's left?'.",
  input_schema: { type: 'object', properties: { award_id: { type: 'number' } }, required: ['award_id'] },
};

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
// BLA 351(a) biologics tools — deterministic engines (analytical similarity,
// comparability, immunogenicity). These compute on measured lot/subject data;
// report their numbers and verdicts verbatim, never estimate by hand.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ANALYTICAL_SIMILARITY: AnaTool = {
  name: 'assess_analytical_similarity',
  description:
    "Run the DETERMINISTIC analytical-similarity engine for a BLA 351(a)/biosimilar 351(k) program. Compares a proposed biologic to a reference product across critical quality attributes using the FDA tiered framework: Tier 1 equivalence test (EAC = ±1.5·σ_R, 90% CI), Tier 2 quality range (mean_R ± k·σ_R, % of test lots within), Tier 3 min–max. Use when the user asks to run a Tier 1 similarity check, compare to a reference product, or assess analytical similarity. Returns per-attribute verdicts with the underlying statistics and an overall conclusion. Report the verdicts and numbers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      referenceProduct: { type: 'string', description: 'Reference product name (e.g. the originator/RP).' },
      modality: { type: 'string', description: 'Product modality, e.g. monoclonal_antibody, fusion_protein, adc.' },
      targetAgency: { type: 'string', description: 'Target agency (FDA, EMA, PMDA).' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist the assessment against.' },
      attributes: {
        type: 'array',
        description: 'Critical quality attributes with reference and test lot measurements.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'CQA name, e.g. "Potency (relative %)".' },
            tier: { type: 'number', enum: [1, 2, 3], description: '1=most critical/MoA-related, 2=moderate, 3=least critical.' },
            criticality: { type: 'string', description: 'Free-text criticality note.' },
            unit: { type: 'string' },
            reference: { type: 'array', items: { type: 'number' }, description: 'Reference-product lot measurements.' },
            test: { type: 'array', items: { type: 'number' }, description: 'Proposed/test-product lot measurements.' },
            eacSigmaMultiplier: { type: 'number', description: 'Tier 1 σ_R multiplier for the EAC (default 1.5).' },
            qualityRangeK: { type: 'number', description: 'Tier 2 SD multiplier (default 3).' },
            withinThreshold: { type: 'number', description: 'Tier 2/3 fraction of test lots required within range (default 0.9).' },
            mechanismRelated: { type: 'boolean' },
          },
          required: ['name', 'tier', 'reference', 'test'],
        },
      },
    },
    required: ['attributes'],
  },
};

export const ASSESS_COMPARABILITY: AnaTool = {
  name: 'assess_comparability',
  description:
    "Run the DETERMINISTIC ICH Q5E comparability engine: assess whether a biologic produced after a manufacturing change (process/site/scale/formulation) is comparable to the pre-change material. Per attribute it tests post-change lots against the pre-change quality range, the standardized mean shift, and (for high-criticality attributes) equivalence; then derives the overall conclusion and whether analytical data alone is sufficient or non-clinical/clinical bridging is indicated. Use for manufacturing change comparability questions. Report the verdicts, the bridging recommendation, and numbers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      changeDescription: { type: 'string', description: 'What changed (e.g. "new DS manufacturing site").' },
      changeType: { type: 'string', description: 'process | site | scale | formulation | cell_bank.' },
      modality: { type: 'string' },
      targetAgency: { type: 'string' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist against.' },
      attributes: {
        type: 'array',
        description: 'Quality attributes with pre- and post-change lot measurements.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            criticality: { type: 'string', enum: ['high', 'moderate', 'low'] },
            unit: { type: 'string' },
            preChange: { type: 'array', items: { type: 'number' } },
            postChange: { type: 'array', items: { type: 'number' } },
            qualityRangeK: { type: 'number', description: 'SD multiplier (default 3).' },
            withinThreshold: { type: 'number', description: 'Fraction of post-change lots required within range (default 0.9).' },
            eacSigmaMultiplier: { type: 'number', description: 'σ_pre multiplier for high-criticality equivalence (default 1.5).' },
          },
          required: ['name', 'criticality', 'preChange', 'postChange'],
        },
      },
    },
    required: ['attributes'],
  },
};

export const ASSESS_IMMUNOGENICITY: AnaTool = {
  name: 'assess_immunogenicity',
  description:
    "Run the DETERMINISTIC immunogenicity engine: compute ADA and neutralizing-antibody (NAb) incidence with 95% Wilson CIs per arm, the comparative between-arm difference (Newcombe), and an overall immunogenicity risk classification (low/moderate/high) using the FDA risk-based framework (likelihood × clinical consequence). Use for immunogenicity incidence, comparative immunogenicity, and risk-assessment questions. Report the incidences, comparison, and risk tier verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['biologic', 'biosimilar'] },
      modality: { type: 'string' },
      targetAgency: { type: 'string' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist against.' },
      riskFactors: {
        type: 'object',
        description: 'Product/patient factors that modulate immunogenicity risk.',
        properties: {
          chronicDosing: { type: 'boolean' },
          immunomodulator: { type: 'boolean' },
          foreignSequence: { type: 'boolean' },
          aggregationProne: { type: 'boolean' },
          neutralizesEndogenous: { type: 'boolean', description: 'Product neutralizes a non-redundant endogenous protein (severe consequence).' },
        },
      },
      arms: {
        type: 'array',
        description: 'Study arms with tiered-assay subject counts.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            role: { type: 'string', enum: ['test', 'reference', 'comparator'] },
            nSubjects: { type: 'number', description: 'Evaluable subjects.' },
            adaPositive: { type: 'number', description: 'Confirmed ADA-positive subjects.' },
            treatmentEmergentAda: { type: 'number', description: 'Treatment-emergent (induced + boosted) ADA+ — preferred numerator.' },
            nabPositive: { type: 'number', description: 'Neutralizing-antibody-positive subjects.' },
            persistentAda: { type: 'number' },
            titers: { type: 'array', items: { type: 'number' }, description: 'ADA reciprocal titers among positives.' },
            impactedPk: { type: 'number', description: 'ADA+ subjects with a relevant PK impact.' },
            impactedEfficacy: { type: 'number', description: 'ADA+ subjects with loss of efficacy.' },
            hypersensitivity: { type: 'number', description: 'Serious hypersensitivity/anaphylaxis events associated with ADA.' },
          },
          required: ['label', 'nSubjects'],
        },
      },
    },
    required: ['arms'],
  },
};

export const ASSESS_BLA_FILING_RISK: AnaTool = {
  name: 'assess_bla_filing_risk',
  description:
    "Run the DETERMINISTIC BLA 351(a) filing-risk engine. Maps a biologics program's CMC/clinical readiness signals — and the conclusions of the analytical-similarity, comparability, and immunogenicity engines — onto Refuse-to-File (RTF) and Complete Response Letter (CRL) failure modes (21 CFR 601.2; ICH Q5A/Q5E/Q6B/Q1A; FDA immunogenicity & process-validation guidance). Use when the user asks about BLA filing readiness, RTF/CRL risk, or what would block a biologics filing. Returns cited per-finding triggers with mitigations and overall RTF/CRL risk bands. Report the triggers and bands verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['biologic', 'biosimilar'] },
      modality: { type: 'string' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist against.' },
      manufacturingChange: { type: 'boolean', description: 'True if a manufacturing change requiring comparability is in scope.' },
      analyticalSimilarity: {
        type: 'string',
        enum: ['similar', 'similar_with_residual_uncertainty', 'not_demonstrated', 'insufficient_data'],
        description: 'Conclusion from assess_analytical_similarity, if run.',
      },
      comparability: {
        type: 'string',
        enum: ['comparable', 'comparable_with_additional_data', 'not_comparable', 'insufficient_data'],
        description: 'Conclusion from assess_comparability, if run.',
      },
      immunogenicityRisk: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description: 'Risk tier from assess_immunogenicity, if run.',
      },
      readiness: {
        type: 'object',
        description: 'CMC/clinical/quality readiness signals (true=met, false=known missing, omit=unknown).',
        properties: {
          potencyAssayValidated: { type: 'boolean' },
          viralClearanceValidated: { type: 'boolean' },
          adventitiousAgentTesting: { type: 'boolean' },
          cellBankCharacterized: { type: 'boolean' },
          stabilityMonths: { type: 'number' },
          requiredShelfLifeMonths: { type: 'number' },
          processValidationComplete: { type: 'boolean' },
          containerClosureQualified: { type: 'boolean' },
          inspectionReady: { type: 'boolean' },
        },
      },
      administrative: {
        type: 'object',
        description: 'BLA completeness signals for RTF assessment (21 CFR 601.2).',
        properties: {
          form356h: { type: 'boolean' },
          coverLetter: { type: 'boolean' },
          module3CmcComplete: { type: 'boolean' },
          clinicalSummaries: { type: 'boolean' },
          immunogenicityData: { type: 'boolean' },
          cdiscDatasets: { type: 'boolean' },
        },
      },
    },
    required: [],
  },
};

export const GENERATE_SOP: AnaTool = {
  name: 'generate_sop',
  description:
    "Generate a GxP-structured client Standard Operating Procedure (SOP), region-aware across FDA (US), EMA (EU), and PMDA (Japan). Use when the user asks AnA to write/draft an SOP for a process (e.g. change control, CAPA, deviation, document control, eCTD publishing, regulatory submission, pharmacovigilance case processing, training, supplier qualification, internal audit). Returns the SOP as structured sections plus rendered markdown, with the canonical SOP skeleton (Purpose, Scope, Responsibilities, Definitions, Procedure, Records, References, Revision history, Approval) and region-appropriate regulatory references. The draft opens in AnA's editor; the client tailors and approves it.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'SOP title, e.g. "Change Control for Manufacturing Processes".' },
      processType: {
        type: 'string',
        enum: [
          'change_control', 'document_control', 'capa', 'deviation_management',
          'ectd_publishing', 'regulatory_submission', 'pharmacovigilance_case',
          'training', 'supplier_qualification', 'internal_audit', 'generic',
        ],
        description: 'Known regulated process (drives the starter procedure). Use generic for an unlisted topic.',
      },
      regions: {
        type: 'array',
        items: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'] },
        description: 'Regions the SOP must satisfy (default FDA).',
      },
      filingType: { type: 'string', description: 'Optional filing context (NDA/BLA/MAA/JNDA/IND).' },
      organization: { type: 'string' },
      documentId: { type: 'string', description: 'SOP identifier, e.g. SOP-QA-CC-001 (generated if omitted).' },
      effectiveDate: { type: 'string', description: 'ISO date; defaults to today.' },
      ownerRole: { type: 'string', description: 'Role accountable for the SOP (e.g. "Head of Quality").' },
      scopeNote: { type: 'string', description: 'Extra scope sentence from the client.' },
    },
    required: ['title'],
  },
};

export const RESOLVE_SUBMISSION_PLAN: AnaTool = {
  name: 'resolve_submission_plan',
  description:
    "Resolve the multi-region BUILD + SUBMIT plan for a filing across FDA (US), EMA (EU), and PMDA (Japan). Given a filing type (IND/NDA/BLA/MAA/JNDA/…) and/or product class, returns the regional equivalent application per region (e.g. a biologic marketing application → US BLA, EU MAA, JP JNDA), each with its dossier standard, region Module 1 path, validation profile, blueprints, and submission gateway, plus whether region-correct build and gateway submission are supported. Also returns an overall coverage summary asserting which (filing × region) combinations are fully supported. Use when the user asks whether/how a product can be filed in the US, EU, and Japan, or which gateway/structure applies.",
  input_schema: {
    type: 'object',
    properties: {
      filingType: { type: 'string', description: 'Filing string or registry id (IND, NDA, BLA, MAA, JNDA, …).' },
      applicationFamily: {
        type: 'string',
        enum: ['clinical_trial', 'marketing_authorization', 'variation', 'renewal', 'supplement', 'pediatric', 'orphan'],
        description: 'Used when no filingType is given.',
      },
      productClass: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'biosimilar', 'vaccine', 'atmp', 'generic', 'any'],
        description: 'Drives the regional equivalent (biologic → BLA in the US).',
      },
      regions: {
        type: 'array',
        items: { type: 'string', enum: ['US', 'EU', 'JP', 'UK', 'CA', 'CN', 'AU', 'CH'] },
        description: 'Target regions (default US, EU, JP).',
      },
    },
    required: [],
  },
};

export const GET_CTD_MODULE_HOME: AnaTool = {
  name: 'get_ctd_module_home',
  description:
    "Return the CTD Module 1 (regional administrative) and Module 2 (CTD summaries) section structure for a region (FDA / EMA / PMDA). Module 1 is region-specific (FDA forms 356h/1571 + labeling; EU application form + SmPC/PL + RMP; JP 様式 + 添付文書 + J-RMP); Module 2 is the ICH-common summary set 2.1–2.7 where each summary declares its source module (2.3 ← M3, 2.4/2.6 ← M4, 2.5/2.7 ← M5). Use when the user asks what goes in Module 1 or Module 2, how the CTD summaries map to the source modules, or to scaffold a dedicated M1/M2 authoring view. Per-program build-state (which sections are drafted/approved) is available from GET /api/biopharma/ctd/build-state.",
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['FDA', 'EMA', 'PMDA', 'US', 'EU', 'JP'], description: 'Region (default FDA).' },
      module: { type: 'string', enum: ['1', '2'], description: 'Restrict to a single module; omit for both.' },
    },
    required: [],
  },
};

/** Custom JSON-schema tools dispatched by our local AnaToolExecutor. */
// ─────────────────────────────────────────────────────────────────────────────
// Nonclinical & Clinical Pharmacology Engines (deterministic)
// ─────────────────────────────────────────────────────────────────────────────

export const COMPUTE_FIH_DOSE: AnaTool = {
  name: 'compute_fih_dose',
  description:
    "Compute a defensible first-in-human (FIH) starting dose using the platform's DETERMINISTIC dose engine. Shows BOTH standard derivations: (1) NOAEL → HED (FDA 2005 body-surface Km scaling) → safety factor → MRSD from the most sensitive species, and (2) MABEL from the minimum anticipated effective exposure (EMA FIH guidance), then selects the more conservative and flags which is limiting. ALWAYS call this tool for FIH/MRSD/MABEL/starting-dose questions (e.g. /fih, /dose, Module 2.4 dose-justification). NEVER hand-calculate an HED, MRSD, or MABEL — a fabricated starting dose is a critical safety defect. Gather the per-species NOAELs (mg/kg/day) and, for high-risk molecules, the MABEL inputs, then report the returned numbers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      speciesNoaels: {
        type: 'array',
        description: 'One NOAEL per relevant species. At least one is required.',
        items: {
          type: 'object',
          properties: {
            species: { type: 'string', description: 'Species name (e.g. "rat", "cynomolgus monkey").' },
            noaelMgPerKg: { type: 'number', description: 'NOAEL in mg/kg/day.' },
            studyRef: { type: 'string', description: 'Optional study reference for provenance.' },
            km: { type: 'number', description: 'Optional explicit Km factor override.' },
          },
          required: ['species', 'noaelMgPerKg'],
        },
      },
      safetyFactor: { type: 'number', description: 'Safety factor applied to the selected HED (default 10 per FDA 2005).' },
      safetyFactorRationale: { type: 'string', description: 'Justification for any deviation from the default safety factor.' },
      mostAppropriateSpecies: { type: 'string', description: 'Force a species to carry the MRSD (default: most sensitive).' },
      humanReferenceWeightKg: { type: 'number', description: 'Human reference body weight in kg (default 60).' },
      mabel: {
        type: 'object',
        description: 'Optional MABEL derivation; when supplied it competes with the MRSD.',
        properties: {
          minAnticipatedEffectiveExposure: { type: 'number', description: 'Minimum anticipated effective exposure to target at the starting dose.' },
          exposurePerMgDose: { type: 'number', description: 'Exposure produced per 1 mg of total dose (linear factor).' },
          mabelSafetyFactor: { type: 'number', description: 'Additional MABEL safety factor (default 1).' },
          basis: { type: 'string', description: 'Free-text basis for audit (e.g. "10% receptor occupancy from in vitro Kd + human popPK").' },
        },
        required: ['minAnticipatedEffectiveExposure', 'exposurePerMgDose'],
      },
    },
    required: ['speciesNoaels'],
  },
};

export const CLASSIFY_TOX_FINDINGS: AnaTool = {
  name: 'classify_tox_findings',
  description:
    "Classify nonclinical target-organ findings as adverse / adaptive-non-adverse / monitor / indeterminate using the platform's DETERMINISTIC toxicologic-pathology classifier (STP adversity framework, INHAND nomenclature). Returns a reversibility and human-relevance call and an overview-ready framing sentence per finding, plus the assembled M2.4 target-organ paragraph. Use this when framing tox findings for a Module 2.4 Nonclinical Overview or deciding which findings define the NOAEL. The classifier conservatively escalates normally-adaptive findings (e.g. hepatocellular hypertrophy) to adverse when adverse correlates or moderate+ severity are present, and never assumes an unrecognised finding is benign. Report the classifications and rationale; a pathologist adjudicates the final adversity call.",
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        description: 'Target-organ findings to classify.',
        items: {
          type: 'object',
          properties: {
            organ: { type: 'string', description: 'Target organ (e.g. "liver").' },
            finding: { type: 'string', description: 'Finding text (e.g. "hepatocellular hypertrophy").' },
            severity: { type: 'string', description: 'Severity grade if reported (minimal/mild/moderate/marked/severe).' },
            doseLevel: { type: 'string', description: 'Dose level at which the finding occurred.' },
            reversible: { type: 'boolean', description: 'Reversibility from a recovery cohort, when known.' },
            correlates: { type: 'array', items: { type: 'string' }, description: 'Concurrent correlates that can escalate adversity (e.g. "increased ALT").' },
          },
          required: ['organ', 'finding'],
        },
      },
    },
    required: ['findings'],
  },
};

export const SELECT_EXPOSURE_RESPONSE_DOSE: AnaTool = {
  name: 'select_exposure_response_dose',
  description:
    "Select a dose from the exposure-response (E-R) relationship rather than the MTD, using the platform's DETERMINISTIC E-R engine (FDA Project Optimus / ICH E4). For each candidate dose it predicts efficacy (Emax/Hill on exposure) and safety (logistic P(AE) or an exposure threshold), then recommends the lowest dose that reaches the efficacy plateau within the acceptable safety bound and contrasts it with the MTD. ALWAYS call this tool for dose-optimization / dose-selection / Project Optimus / exposure-response questions (e.g. /dose-optimization, Module 2.7 dose-selection rationale). NEVER estimate the optimized dose by hand. Report the returned dose, MTD, and per-dose predictions verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      dosesMg: { type: 'array', items: { type: 'number' }, description: 'Candidate doses in mg.' },
      exposurePerMgDose: { type: 'number', description: 'Exposure produced per 1 mg of dose (linear). Supply this OR exposuresByDose.' },
      exposuresByDose: {
        type: 'array',
        description: 'Explicit exposure per dose (for non-linear PK). Overrides the linear factor.',
        items: {
          type: 'object',
          properties: {
            doseMg: { type: 'number' },
            exposure: { type: 'number' },
          },
          required: ['doseMg', 'exposure'],
        },
      },
      efficacy: {
        type: 'object',
        description: 'Emax efficacy model on exposure.',
        properties: {
          ec50: { type: 'number', description: 'Concentration giving half-maximal effect, in exposure units.' },
          hill: { type: 'number', description: 'Hill coefficient (default 1).' },
        },
        required: ['ec50'],
      },
      safety: {
        type: 'object',
        description: 'Logistic safety model {intercept, slope, acceptableAeProbability} OR exposure-threshold model {thresholdExposure}.',
        properties: {
          intercept: { type: 'number' },
          slope: { type: 'number' },
          acceptableAeProbability: { type: 'number' },
          thresholdExposure: { type: 'number' },
        },
      },
      targetEfficacyFraction: { type: 'number', description: 'Fraction of Emax that counts as the efficacy plateau (default 0.9).' },
    },
    required: ['dosesMg', 'efficacy', 'safety'],
  },
};

export const DRAFT_NONCLINICAL_OVERVIEW_M2_4: AnaTool = {
  name: 'draft_nonclinical_overview_m2_4',
  description:
    "Draft the Module 2.4 Nonclinical Overview (ICH M4S) from the program's nonclinical study set using the platform's deterministic composer. Maps ingest-shaped studies (single/repeat-dose tox, genotox, DART, carcinogenicity, safety pharm, PK/ADME) into the ICH M4S structure, flags the gaps against ICH M3(R2)/S2(R1)/S7A, and — when target-organ findings are supplied — appends the adversity profile (adverse vs adaptive vs monitor) from the toxicologic-pathology classifier. Returns a draft M2.4 (a starting point the author promotes through the governed authoring flow), its completeness score, and the gap list. Use this for Module 2.4 / nonclinical-overview authoring requests. Report the gaps and completeness honestly; do not assert a study exists that was not supplied.",
  input_schema: {
    type: 'object',
    properties: {
      studies: {
        type: 'array',
        description: 'Nonclinical studies feeding the overview.',
        items: {
          type: 'object',
          properties: {
            studyType: { type: 'string', description: 'Study type (ingest enum e.g. repeat_dose_tox, genotox, dart, safety_pharm, pk — or a builder category).' },
            studyTitle: { type: 'string' },
            species: { type: 'string' },
            durationWeeks: { type: 'number' },
            glpCompliant: { type: 'boolean' },
            noael: { type: 'string', description: 'NOAEL (e.g. "50 mg/kg/day").' },
            keyFindings: { type: 'string', description: 'Primary finding / summary.' },
            doseLevels: { type: 'array', items: { type: 'string' } },
            reportSection: { type: 'string', description: 'Module 4 section (e.g. "4.2.3.2").' },
          },
          required: ['studyType'],
        },
      },
      findings: {
        type: 'array',
        description: 'Target-organ findings to classify for the overview (optional).',
        items: {
          type: 'object',
          properties: {
            organ: { type: 'string' },
            finding: { type: 'string' },
            severity: { type: 'string' },
            correlates: { type: 'array', items: { type: 'string' } },
          },
          required: ['organ', 'finding'],
        },
      },
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
    },
    required: ['studies'],
  },
};

export const ASSESS_CONCENTRATION_QTC: AnaTool = {
  name: 'assess_concentration_qtc',
  description:
    "Assess whether a thorough-QT (TQT) study can be waived using the platform's deterministic concentration-QTc engine (ICH E14 Q&A R3). From the fitted C-QTc slope and its SE, the intercept, and the high clinical exposure, it computes the predicted ΔΔQTc and the upper bound of the two-sided 90% CI, and reports whether the 10 ms threshold is excluded — guarding against inadequate supratherapeutic coverage or an uninformatively wide CI. ALWAYS call this for TQT-waiver / concentration-QT / QT-risk questions. NEVER eyeball the QT decision — report the returned bound and verdict verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      slope: { type: 'number', description: 'C-QTc slope (ms per concentration unit).' },
      slopeSE: { type: 'number', description: 'Standard error of the slope.' },
      intercept: { type: 'number', description: 'Model intercept (ms at zero concentration). Default 0.' },
      interceptSE: { type: 'number', description: 'SE of the intercept (optional, propagated into the prediction SE).' },
      slopeInterceptCov: { type: 'number', description: 'Covariance of slope and intercept (optional).' },
      targetConcentration: { type: 'number', description: 'High clinical exposure to evaluate (geometric-mean Cmax).' },
      therapeuticCmax: { type: 'number', description: 'Therapeutic Cmax, to check supratherapeutic coverage.' },
      requiredCoverageMultiple: { type: 'number', description: 'Required multiple of therapeutic Cmax (default 2).' },
      thresholdMs: { type: 'number', description: 'ΔΔQTc threshold of concern (default 10 ms).' },
      ciZ: { type: 'number', description: 'z for the two-sided 90% CI upper bound (default 1.645).' },
    },
    required: ['slope', 'slopeSE', 'targetConcentration'],
  },
};

export const ASSESS_DDI_RISK: AnaTool = {
  name: 'assess_ddi_risk',
  description:
    "Decide whether a drug needs a clinical DDI study as a CYP/transporter perpetrator, using the FDA in-vitro DDI basic/static models (R1 reversible inhibition ≥1.02, R1,gut ≥11, R2 time-dependent inhibition ≥1.25, R3 induction ≤0.8, transporter Igut/IC50 ≥10 or Iu/IC50 ≥0.1). Each mechanism is evaluated only when its inputs are supplied; any flag triggers a clinical-study recommendation. Concentrations and constants for a mechanism must share units (the engine does not convert). ALWAYS call this for DDI / perpetrator-risk questions. Report the computed R-values and the recommendation verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      imaxUnbound: { type: 'number', description: 'Unbound maximum plasma concentration (Imax,u).' },
      ki: { type: 'number', description: 'Reversible inhibition constant Ki (systemic).' },
      doseMol: { type: 'number', description: 'Molar dose, for Igut = dose / 0.25 L.' },
      igut: { type: 'number', description: 'Explicit gut concentration Igut (overrides doseMol).' },
      kiGut: { type: 'number', description: 'Ki for gut CYP3A (defaults to ki).' },
      kinact: { type: 'number', description: 'TDI maximal inactivation rate kinact.' },
      kI: { type: 'number', description: 'TDI concentration for half-maximal inactivation KI.' },
      kdeg: { type: 'number', description: 'Enzyme degradation rate constant kdeg.' },
      emax: { type: 'number', description: 'Induction maximal effect Emax (fold).' },
      ec50: { type: 'number', description: 'Induction EC50.' },
      inductionD: { type: 'number', description: 'Induction calibration factor d (default 1).' },
      transporters: {
        type: 'array',
        description: 'Transporter inhibition inputs.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            ic50: { type: 'number' },
            gut: { type: 'boolean', description: 'Gut transporter (P-gp/BCRP): compares Igut/IC50 ≥ 10.' },
            igut: { type: 'number' },
            unboundConcentration: { type: 'number', description: 'Unbound systemic/inlet concentration for hepatic/renal transporters.' },
          },
          required: ['name', 'ic50'],
        },
      },
    },
    required: [],
  },
};

export const DRAFT_CLINICAL_SUMMARY_M2_7: AnaTool = {
  name: 'draft_clinical_summary_m2_7',
  description:
    "Draft the Module 2.7 Clinical Summary (ICH M4E) from the program's clinical study reports using the platform's deterministic composer — the integrated summary of biopharmaceutics (2.7.1), clinical pharmacology (2.7.2), efficacy (2.7.3), and safety (2.7.4). Returns a draft (a starting point the author promotes through the governed authoring flow), with gap-flagging. Use this for Module 2.7 / clinical-summary authoring requests. Report the safety counts and gaps honestly; do not invent studies or events that were not supplied.",
  input_schema: {
    type: 'object',
    properties: {
      csrs: {
        type: 'array',
        description: 'Clinical study reports feeding the summary (one per study).',
        items: {
          type: 'object',
          properties: {
            studyId: { type: 'string' },
            protocolNumber: { type: 'string' },
            phase: { type: 'string', description: 'e.g. "1", "2", "3".' },
            studyDesign: { type: 'string' },
            primaryEndpoint: { type: 'string' },
            primaryResult: { type: 'string' },
            sampleSize: { type: 'number' },
            ittPopulation: { type: 'number' },
            saeCount: { type: 'number' },
            deathCount: { type: 'number' },
            topAEs: {
              type: 'array',
              items: { type: 'object', properties: { pt: { type: 'string' }, rate: { type: 'string' }, severity: { type: 'string' } }, required: ['pt', 'rate'] },
            },
          },
          required: ['studyId', 'phase', 'primaryEndpoint', 'primaryResult', 'sampleSize'],
        },
      },
      indication: { type: 'string' },
      investigationalProduct: { type: 'string' },
    },
    required: ['csrs', 'indication', 'investigationalProduct'],
  },
};

export const ASSESS_NONCLINICAL_PROGRAM: AnaTool = {
  name: 'assess_nonclinical_program',
  description:
    "Determine which nonclinical studies are required to support a clinical trial of a given duration and phase, and which are missing, using the platform's deterministic ICH M3(R2)/S-series staging engine. Encodes the repeat-dose tox duration vs clinical duration table (two species), the genotox battery timing (S2(R1)), safety pharmacology before FIH (S7A), reproductive tox staging (S5(R3)), carcinogenicity at marketing for chronic use (S1), and the ICH S9 oncology relaxations. ALWAYS call this for 'what nonclinical studies do I need for Phase X' / nonclinical gap-analysis / study-program planning. Report the required battery and the gaps verbatim; only studies due at or before the target phase are gated.",
  input_schema: {
    type: 'object',
    properties: {
      maxClinicalDurationWeeks: { type: 'number', description: 'Maximum clinical dosing duration to support, in weeks.' },
      targetPhase: { type: 'number', description: 'Clinical phase being enabled (1, 2, or 3).' },
      route: { type: 'string', description: 'Route of administration (non-oral routes add local tolerance).' },
      includesWocbp: { type: 'boolean', description: 'Trial enrols women of childbearing potential.' },
      chronicUse: { type: 'boolean', description: 'Intended chronic therapy (≥6 months).' },
      oncology: { type: 'boolean', description: 'Advanced-cancer program (ICH S9 relaxations).' },
      marketingApplication: { type: 'boolean', description: 'This is a marketing application (carcinogenicity becomes due).' },
      present: {
        type: 'array',
        description: 'Studies the program already holds.',
        items: {
          type: 'object',
          properties: {
            studyType: { type: 'string', description: 'Study type (ingest enum or builder category).' },
            species: { type: 'string' },
            durationWeeks: { type: 'number' },
            genotoxComponent: { type: 'string', description: 'For genotox: ames | in_vitro_mammalian | in_vivo.' },
          },
          required: ['studyType'],
        },
      },
    },
    required: ['maxClinicalDurationWeeks'],
  },
};

export const CHARACTERIZE_PK: AnaTool = {
  name: 'characterize_pk',
  description:
    "Characterize PK with the platform's deterministic engine: dose proportionality by the power model (judges whether the 90% CI of the ln-ln slope falls in the [1+ln0.8/lnr, 1+ln1.25/lnr] acceptance region — slope ≈ 1 is dose-proportional), and/or accumulation (Rac = 1/(1−e^−ke·τ)) with time to steady state from the half-life and dosing interval. Supply doseProportionality and/or accumulation. ALWAYS call this for dose-proportionality / accumulation / steady-state questions; report the slope, CI, verdict, and Rac verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      doseProportionality: {
        type: 'object',
        description: 'Power-model dose-proportionality assessment.',
        properties: {
          dataPoints: {
            type: 'array',
            items: { type: 'object', properties: { dose: { type: 'number' }, exposure: { type: 'number' } }, required: ['dose', 'exposure'] },
            description: 'Dose vs exposure (AUC or Cmax) pairs across ≥2 dose levels.',
          },
          theta: {
            type: 'object',
            properties: { low: { type: 'number' }, high: { type: 'number' } },
            description: 'Acceptance bounds for the critical region (default 0.8, 1.25).',
          },
        },
        required: ['dataPoints'],
      },
      accumulation: {
        type: 'object',
        description: 'Accumulation and time-to-steady-state from half-life and interval.',
        properties: {
          halfLifeHours: { type: 'number' },
          dosingIntervalHours: { type: 'number' },
        },
        required: ['halfLifeHours', 'dosingIntervalHours'],
      },
    },
    required: [],
  },
};

export const DRAFT_NONCLINICAL_SUMMARIES_M2_6: AnaTool = {
  name: 'draft_nonclinical_summaries_m2_6',
  description:
    "Draft the Module 2.6 Nonclinical Written and Tabulated Summaries (ICH M4S) from the program's nonclinical study set using the platform's deterministic composer — the 2.6.1 introduction, 2.6.2/2.6.4/2.6.6 written summaries (pharmacology, PK, toxicology) and the 2.6.3/2.6.5/2.6.7 tabulated summaries — weaving in the target-organ adversity profile when findings are supplied. Returns a draft, per-discipline tables, the gap list, and a completeness score. Use this for Module 2.6 authoring; report gaps and completeness honestly.",
  input_schema: {
    type: 'object',
    properties: {
      studies: {
        type: 'array',
        description: 'Nonclinical studies feeding the summaries.',
        items: {
          type: 'object',
          properties: {
            studyType: { type: 'string', description: 'Study type (ingest enum or builder category).' },
            studyId: { type: 'string' },
            studyTitle: { type: 'string' },
            species: { type: 'string' },
            durationWeeks: { type: 'number' },
            glpCompliant: { type: 'boolean' },
            noael: { type: 'string' },
            keyFindings: { type: 'string' },
            reportSection: { type: 'string' },
          },
          required: ['studyType'],
        },
      },
      findings: {
        type: 'array',
        description: 'Target-organ findings for the 2.6.6 adversity profile (optional).',
        items: {
          type: 'object',
          properties: {
            organ: { type: 'string' },
            finding: { type: 'string' },
            severity: { type: 'string' },
            correlates: { type: 'array', items: { type: 'string' } },
          },
          required: ['organ', 'finding'],
        },
      },
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
    },
    required: ['studies'],
  },
};

export const LOAD_NONCLINICAL_PROGRAM: AnaTool = {
  name: 'load_nonclinical_program',
  description:
    "Load a program's ingested nonclinical studies (from ctd_nonclinical_studies) and return them in the shapes the other tools consume: study inputs for draft_nonclinical_overview_m2_4 / draft_nonclinical_summaries_m2_6, present-studies for assess_nonclinical_program, and species-NOAELs for compute_fih_dose. Call this FIRST when the user references a program/IND by id and wants the overview drafted, the gap analysis run, or the FIH dose computed from the program's real data — then pass the returned arrays into the relevant tool. Feature-gated: returns status 'unavailable' when the preclinical data layer is not enabled in this environment.",
  input_schema: {
    type: 'object',
    properties: {
      ctdProgramId: { type: 'number', description: 'The ctd_programs id whose nonclinical studies to load.' },
    },
    required: ['ctdProgramId'],
  },
};

export const GET_NONCLINICAL_TEMPLATE: AnaTool = {
  name: 'get_nonclinical_template',
  description:
    "Fetch a blank structured template (form) for a Module 4 study report (4.2.1 pharmacology, 4.2.2 PK, 4.2.3 toxicology), the Module 2.6 nonclinical summaries, or a first-in-human dose-justification memo. Pass a template key (a granule id like 'm4-2-3-toxicology' or a section code like '4.2.3'); omit it to list the available templates. Use this when starting a nonclinical document from scratch (no ingested data yet) — the scaffold's [PLACEHOLDER] tokens guide what to fill. When the program already has ingested studies, prefer the draft_* composer tools, which fill the content from data.",
  input_schema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: "Template key — granule id (e.g. 'm2-6-nonclinical-summaries') or CTD section code (e.g. '4.2.3'). Omit to list templates." },
    },
    required: [],
  },
};

export const GET_CSR_TEMPLATE: AnaTool = {
  name: 'get_csr_template',
  description:
    "Fetch a blank structured template (form) for a Module 5 clinical document: the full ICH E3 Clinical Study Report body (5.3.5.1, 16 sections), the standalone CSR synopsis (ICH E3 §2), the Integrated Summary of Safety or Efficacy (ISS/ISE, 5.3.5.3), or a clinical study protocol (ICH E6). Pass a template key (a granule id like 'm5-3-5-1-csr' or 'm5-3-5-3-iss', or a section code like '5.3.5.1'); omit it to list the available templates. Use this to start a Module 5 clinical document from scratch — the scaffold's [PLACEHOLDER] tokens guide what to fill. When the program already has ingested study data, prefer the draft_* composer tools, which fill content from data.",
  input_schema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: "Template key — granule id (e.g. 'm5-3-5-1-csr', 'm5-3-5-3-ise') or CTD section code (e.g. '5.3.5.1'). Omit to list templates." },
    },
    required: [],
  },
};

export const ASSESS_NONCLINICAL_SAFETY: AnaTool = {
  name: 'assess_nonclinical_safety',
  description:
    "Produce the integrated nonclinical safety assessment for an IND in one call — the roll-up a toxicology lead writes. Composes the first-in-human starting dose (NOAEL→HED→MRSD vs MABEL), the target-organ adversity profile, the ICH M3(R2)/S-series program gaps, and the M2.4 overview into a single readiness verdict (ready_for_fih / gaps_block_fih / insufficient_input) with the blocker list. Each input block is optional; supply what the program has. Prefer this for 'what is the nonclinical safety story / are we ready for first-in-human?' questions; report the verdict, dose, adverse findings, and blockers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
      fih: {
        type: 'object',
        description: 'First-in-human dose inputs (same shape as compute_fih_dose).',
        properties: {
          speciesNoaels: {
            type: 'array',
            items: { type: 'object', properties: { species: { type: 'string' }, noaelMgPerKg: { type: 'number' }, studyRef: { type: 'string' }, km: { type: 'number' } }, required: ['species', 'noaelMgPerKg'] },
          },
          safetyFactor: { type: 'number' },
          mabel: { type: 'object', properties: { minAnticipatedEffectiveExposure: { type: 'number' }, exposurePerMgDose: { type: 'number' }, mabelSafetyFactor: { type: 'number' }, basis: { type: 'string' } }, required: ['minAnticipatedEffectiveExposure', 'exposurePerMgDose'] },
        },
        required: ['speciesNoaels'],
      },
      findings: {
        type: 'array',
        items: { type: 'object', properties: { organ: { type: 'string' }, finding: { type: 'string' }, severity: { type: 'string' }, correlates: { type: 'array', items: { type: 'string' } } }, required: ['organ', 'finding'] },
      },
      program: {
        type: 'object',
        properties: { maxClinicalDurationWeeks: { type: 'number' }, targetPhase: { type: 'number' }, route: { type: 'string' }, includesWocbp: { type: 'boolean' }, chronicUse: { type: 'boolean' }, oncology: { type: 'boolean' }, marketingApplication: { type: 'boolean' } },
        required: ['maxClinicalDurationWeeks'],
      },
      presentStudies: {
        type: 'array',
        items: { type: 'object', properties: { studyType: { type: 'string' }, species: { type: 'string' }, durationWeeks: { type: 'number' }, genotoxComponent: { type: 'string' } }, required: ['studyType'] },
      },
      studies: {
        type: 'array',
        items: { type: 'object', properties: { studyType: { type: 'string' }, species: { type: 'string' }, durationWeeks: { type: 'number' }, glpCompliant: { type: 'boolean' }, noael: { type: 'string' }, keyFindings: { type: 'string' } }, required: ['studyType'] },
      },
    },
    required: [],
  },
};

export const DRAFT_QUALITY_OVERALL_SUMMARY_M2_3: AnaTool = {
  name: 'draft_quality_overall_summary_m2_3',
  description:
    "Draft the Module 2.3 Quality Overall Summary (ICH M4Q) deterministically — the CMC summary of drug substance (3.2.S) and drug product (3.2.P). Supply the program's CMC source objects as cmcSources[]; the tool composes Module 3 through the platform's convergence engine and then builds the QOS, returning the 2.3.S / 2.3.P narrative, the headline tables, completeness, and the missing-section gaps. This is the deterministic, data-grounded counterpart to the generic generate_document path — parity with draft_nonclinical_overview_m2_4 / draft_clinical_overview_m2_5 / draft_clinical_summary_m2_7. Report completeness and gaps honestly.",
  input_schema: {
    type: 'object',
    properties: {
      cmcSources: {
        type: 'array',
        description: 'CMC source objects feeding Module 3 / the QOS.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sourceType: { type: 'string', description: 'CMC source type (e.g. drug substance manufacture/characterisation/specification/stability; drug product description/development/manufacture/control/stability).' },
            sourcePayload: { type: 'object', description: 'The structured CMC data for this source.' },
          },
          required: ['sourceType', 'sourcePayload'],
        },
      },
      drugSubstanceName: { type: 'string' },
      drugProductName: { type: 'string' },
    },
    required: ['cmcSources'],
  },
};

export const LIST_PLATFORM_COMMANDS: AnaTool = {
  name: 'list_platform_commands',
  description:
    "List the full catalog of governed platform commands ANA can run via execute_platform_command — the operational surface beyond the typed tools: project / document / artifact / task / milestone / version lifecycle, dossier packaging, Module 3 / CMC composition, biostatistics & trial design, compliance scans, freeze / sign / export, personal-data operations, MDX governed mutations, and the PDEV→IND workflow. Optionally filter with `query`. Call this to discover everything ANA can command across the whole platform, then act with execute_platform_command.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional substring filter over command name / description.' },
    },
    required: [],
  },
};

export const EXECUTE_PLATFORM_COMMAND: AnaTool = {
  name: 'execute_platform_command',
  description:
    "Execute any governed platform command — ANA's full operational control beyond the typed tools (see list_platform_commands for the catalog). Pass `command` (a command name) and `params`. Runs through the platform's governed command executor: reads are open; governed mutations require params.confirm = true and a params.reason string, and are written to the audit trail. The organization, user, and active project are taken from the session context, never from params, and per-tenant tool policy is enforced. If a result asks for confirmation, re-issue with params.confirm = true and params.reason set. Report the result message verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command name from list_platform_commands (e.g. create_artifact, module3_build_all, sign_document).' },
      params: { type: 'object', description: 'Command parameters. For governed mutations include confirm: true and reason: "…".' },
    },
    required: ['command'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Discovery & Cheminformatics Tools
// ─────────────────────────────────────────────────────────────────────────────

export const SEARCH_CHEMBL_COMPOUND: AnaTool = {
  name: 'search_chembl_compound',
  description:
    'Search the curated ChEMBL database (EMBL-EBI) for a drug or compound by name. Returns ' +
    'citeable molecule records (ChEMBL ID + canonical URL) with the curated physicochemical / ' +
    'drug-likeness descriptors (molecular weight, cLogP, PSA, H-bond donors/acceptors, rotatable ' +
    'bonds, rule-of-five violations, QED), the molecule type, and the highest development phase ' +
    '(0–4, where 4 = approved). Optionally include mechanism(s) of action and molecular target(s). ' +
    'Use for discovery / competitive-landscape / developability questions about a known compound. ' +
    'Cite results by ChEMBL ID and link to the provided url.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Drug or compound name to search (e.g. "pembrolizumab", "osimertinib").',
      },
      include_mechanism: {
        type: 'boolean',
        description:
          'When true, also fetch mechanism(s) of action and target(s) for the top match. Default false.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum molecules to return (default: 5, max: 20).',
      },
    },
    required: ['query'],
  },
};

export const ASSESS_TRIAL_FEASIBILITY: AnaTool = {
  name: 'assess_trial_feasibility',
  description:
    'Assess the OPERATIONAL feasibility of a planned clinical trial from empirical ClinicalTrials.gov ' +
    'base rates for comparable studies (by condition, optional intervention and phase). Returns the ' +
    'completion vs discontinuation rate among trials that reached a terminal state — each with a 95% ' +
    'confidence interval — the realised enrollment distribution of completed comparators, the number ' +
    'of currently-active competing trials, sponsor breadth, and a feasibility verdict. Every figure is ' +
    'a count-based statistic; when too few comparable trials have resolved, it returns ' +
    "'insufficient_evidence' rather than an invented number. This answers 'can the trial be run?' " +
    "(recruitment, completion, competition) — distinct from the statistical probability of the endpoint hitting.",
  input_schema: {
    type: 'object',
    properties: {
      condition: {
        type: 'string',
        description: 'Disease / condition for the planned trial, e.g. "non-small cell lung cancer".',
      },
      intervention: {
        type: 'string',
        description: 'Optional intervention / drug / device to narrow the comparator set.',
      },
      phase: {
        type: 'string',
        description: 'Optional trial phase filter, e.g. PHASE3 or 3.',
      },
      max_comparators: {
        type: 'number',
        description: 'Maximum comparable trials to analyze (default 100, max 200).',
      },
    },
    required: ['condition'],
  },
};

export const SEARCH_PREPRINTS: AnaTool = {
  name: 'search_preprints',
  description:
    'Search preprints on bioRxiv / medRxiv (and other preprint servers) for emerging, ' +
    'pre-peer-review evidence — new mechanisms, targets, biomarkers, and translational findings. ' +
    'Backed by Europe PMC full-text preprint search. Returns records with a citeable DOI/URL, the ' +
    'preprint server, and the posting date. IMPORTANT: preprints are NOT peer-reviewed — always ' +
    'surface the returned caveat and label these findings as preliminary. Use to scout the leading ' +
    'edge of a field; corroborate with search_literature (PubMed) for peer-reviewed support.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Free-text query (mechanism, target, biomarker, disease, method).',
      },
      server: {
        type: 'string',
        enum: ['biorxiv', 'medrxiv', 'any'],
        description: "Restrict to a preprint server, or 'any' (default).",
      },
      max_results: {
        type: 'number',
        description: 'Maximum preprints to return (default: 5, max: 25).',
      },
    },
    required: ['query'],
  },
};

export const SCREEN_COMPOUND_LIABILITIES: AnaTool = {
  name: 'screen_compound_liabilities',
  description:
    'Deterministic structural-alert and developability screen for a small molecule. Provide a SMILES ' +
    'string and/or a compound name (if only a name is given, the SMILES and descriptors are pulled ' +
    'from ChEMBL). Returns: (1) SMILES validation + heavy-atom inventory; (2) an ICH M7(R2)-relevant ' +
    'structural-alert screen — most importantly the N-nitrosamine motif, plus aromatic amine/nitro, ' +
    'epoxide/aziridine, azide, Michael acceptor, etc., each with a confidence level; and (3) a ' +
    'Lipinski/Veber oral-developability read over curated descriptors. This is a SCREEN, not an ICH ' +
    'M7 classification — always surface the returned disclaimer and recommend a qualified (Q)SAR ' +
    '(e.g. Derek/Sarah Nexus) plus expert review before any regulatory conclusion. High value for ' +
    'nitrosamine risk and early developability triage.',
  input_schema: {
    type: 'object',
    properties: {
      smiles: {
        type: 'string',
        description: 'SMILES structure of the molecule to screen.',
      },
      compound_name: {
        type: 'string',
        description: 'Compound/drug name to resolve via ChEMBL when no SMILES is supplied.',
      },
    },
  },
};

export const ALL_ANA_TOOLS: AnaTool[] = [
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
  ADVISE_GCP,
  REVIEW_INFORMED_CONSENT,
  ADVISE_COA_SELECTION,
  ADVISE_CTD_STRUCTURE,
  ADVISE_SPECIAL_DESIGNATION,
  ADVISE_ESTIMAND,
  ADVISE_PHARMACOVIGILANCE,
  ADVISE_STUDY_DESIGN,
  ADVISE_LABELING_STRUCTURE,
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
  ACK_TRAINING,
  REGISTER_SUPPLIER,
  LOG_NONCONFORMING_PRODUCT,
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
];

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
