/**
 * Document intake, OCR and spreadsheet tool definitions — read, study, OCR and
 * edit the files a client uploads.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 7). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` (and the drafting/review tool arrays, where they
 * reference these names) resolve unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

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
