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

// ─────────────────────────────────────────────────────────────────────────────
// Evidence & Literature Tools
// ─────────────────────────────────────────────────────────────────────────────

export const SEARCH_CLINICAL_EVIDENCE: AnaTool = {
  name: 'search_clinical_evidence',
  description:
    'Search for clinical evidence by condition, intervention, or outcome. Returns relevant clinical trial data, study results, and evidence summaries from ClinicalTrials.gov and internal databases.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for clinical evidence (condition, drug, device, etc.)',
      },
      evidence_type: {
        type: 'string',
        enum: ['clinical_trial', 'literature', 'real_world_evidence', 'meta_analysis'],
        description: 'Type of evidence to search for',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
    required: ['query'],
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
      organization_id: {
        type: 'number',
        description: 'The organization that owns the project (for tenant scoping).',
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
    required: ['draft_content', 'project_id', 'organization_id'],
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

export const ALL_ANA_TOOLS: AnaTool[] = [
  LIST_PLATFORM_COMMANDS,
  EXECUTE_PLATFORM_COMMAND,
  SEARCH_CLINICAL_EVIDENCE,
  SEARCH_LITERATURE,
  PROJECT_KNOWLEDGE_SEARCH,
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
  VALIDATE_ECTD_PACKAGE,
  FIRE_NOTIFICATION,
  CREATE_CLINICAL_STUDY,
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
