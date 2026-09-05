/**
 * Extended regulatory capability tools — exposes four deterministic engines to
 * AnA as first-class tools:
 *
 *   HEOR (server/services/heor)        → model_budget_impact, model_cost_effectiveness
 *   SPL  (server/services/labeling)    → generate_spl, validate_spl
 *   CDISC(server/services/cdisc)        → generate_define_xml, check_dataset_conformance
 *   Refs (server/services/references)   → import_ris_references, format_references, lint_references
 *
 * Every engine is pure/deterministic (no DB/network/LLM), so the handlers in
 * AnaToolExecutor.ts are thin validated pass-throughs and the numbers/artifacts
 * are reproducible and submission-defensible.
 *
 * @module server/services/ana/extendedRegulatoryTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic engine — report the returned values/artifacts verbatim; do not recompute or reformat. Relay any validation error or finding exactly and ask for missing inputs rather than guessing.';

// ── HEOR ──────────────────────────────────────────────────────────────────────

export const MODEL_BUDGET_IMPACT: AnaTool = {
  name: 'model_budget_impact',
  description:
    'Compute a multi-year budget-impact model for adopting a new intervention vs all-comparator use (for payer/AMCP dossiers, esp. MDX/diagnostics). Returns per-year treated patients, cost with/without the new intervention, incremental budget impact, cumulative impact, and per-member-per-month (PMPM). Costs are in the caller-supplied currency unit. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      populationSize: { type: 'number', description: 'Covered population / plan members.' },
      eligibleFraction: { type: 'number', description: 'Fraction of population eligible (0–1).' },
      treatedFraction: { type: 'number', description: 'Fraction of eligible actually treated (0–1, default 1).' },
      annualCostNew: { type: 'number', description: 'Per-patient annual cost of the new intervention.' },
      annualCostComparator: { type: 'number', description: 'Per-patient annual cost of the comparator / standard of care.' },
      newShareByYear: { type: 'array', items: { type: 'number' }, description: 'New-intervention market share per year (each 0–1); array length = horizon years.' },
    },
    required: ['populationSize', 'eligibleFraction', 'annualCostNew', 'annualCostComparator', 'newShareByYear'],
  },
};

export const MODEL_COST_EFFECTIVENESS: AnaTool = {
  name: 'model_cost_effectiveness',
  description:
    'Compute incremental cost-effectiveness: incremental cost, incremental effect (e.g. QALYs), the ICER (ΔCost/ΔEffect), dominance (dominant/dominated/trade-off), and — if a willingness-to-pay threshold is given — net monetary benefit and whether it is cost-effective at that threshold. Reports a null ICER honestly when effects are equal. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      costIntervention: { type: 'number', description: 'Total cost of the intervention arm.' },
      effectIntervention: { type: 'number', description: 'Health effect of the intervention (e.g. QALYs).' },
      costComparator: { type: 'number', description: 'Total cost of the comparator arm.' },
      effectComparator: { type: 'number', description: 'Health effect of the comparator.' },
      willingnessToPay: { type: 'number', description: 'WTP per unit effect for net monetary benefit (optional).' },
    },
    required: ['costIntervention', 'effectIntervention', 'costComparator', 'effectComparator'],
  },
};

// ── SPL ─────────────────────────────────────────────────────────────────────

const SPL_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    documentTypeCode: { type: 'string', description: 'LOINC document-type code, e.g. "34391-3".' },
    documentTypeDisplayName: { type: 'string' },
    title: { type: 'string' },
    setId: { type: 'string', description: 'SPL set id GUID (stable across versions).' },
    versionNumber: { type: 'number', description: 'Integer version ≥ 1.' },
    effectiveDate: { type: 'string', description: 'YYYYMMDD.' },
    organizationName: { type: 'string', description: 'Labeler / author organization.' },
    documentId: { type: 'string', description: 'Document GUID (synthesized deterministically if omitted).' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'LOINC section code, e.g. "34067-9".' },
          title: { type: 'string' },
          text: { type: 'string' },
          id: { type: 'string', description: 'Section GUID (synthesized if omitted).' },
          displayName: { type: 'string' },
        },
        required: ['code', 'title', 'text'],
      },
    },
  },
  required: ['documentTypeCode', 'title', 'setId', 'versionNumber', 'effectiveDate', 'organizationName', 'sections'],
} as const;

export const GENERATE_SPL: AnaTool = {
  name: 'generate_spl',
  description:
    'Generate a conformant FDA Structured Product Labeling (SPL) XML document (HL7 v3, LOINC code system) from a structured spec. Validates structure first and returns the XML plus any warnings; flags structural errors rather than emitting a silently-malformed document. Honest scope: structural SPL, NOT FDA full-schematron acceptance. ' +
    DETERMINISTIC_NOTE,
  input_schema: { type: 'object', properties: { spec: SPL_SPEC_SCHEMA }, required: ['spec'] },
};

export const VALIDATE_SPL: AnaTool = {
  name: 'validate_spl',
  description:
    "Validate an SPL spec against SPL's structural requirements (LOINC document/section codes, set-id GUID, integer version, YYYYMMDD effective date, organization, per-section code+title+text). Returns valid + typed errors/warnings. Structural only — not FDA's full business-rule schematron. " +
    DETERMINISTIC_NOTE,
  input_schema: { type: 'object', properties: { spec: SPL_SPEC_SCHEMA }, required: ['spec'] },
};

// ── CDISC ─────────────────────────────────────────────────────────────────────

const DEFINE_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    studyName: { type: 'string' },
    standard: { type: 'string', enum: ['SDTM', 'ADaM'] },
    datasets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Dataset/domain, e.g. "DM", "ADSL".' },
          label: { type: 'string' },
          datasetClass: { type: 'string' },
          structure: { type: 'string' },
          variables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                label: { type: 'string' },
                type: { type: 'string', enum: ['text', 'integer', 'float', 'date', 'datetime', 'time'] },
                length: { type: 'number' },
                codelist: { type: 'string', description: 'OID of a codelist defined in the spec.' },
                origin: { type: 'string' },
                mandatory: { type: 'boolean' },
              },
              required: ['name', 'label', 'type'],
            },
          },
        },
        required: ['name', 'label', 'variables'],
      },
    },
    codelists: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          oid: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['text', 'integer', 'float', 'date', 'datetime', 'time'] },
          items: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, decode: { type: 'string' } }, required: ['code', 'decode'] } },
        },
        required: ['oid', 'name', 'items'],
      },
    },
  },
  required: ['studyName', 'standard', 'datasets'],
} as const;

export const GENERATE_DEFINE_XML: AnaTool = {
  name: 'generate_define_xml',
  description:
    'Generate a CDISC define.xml (ODM-based) document from a dataset spec (datasets, variables, codelists) for SDTM or ADaM, at Define-XML 2.1 (default) or 2.0. Returns the XML, the version emitted, and a gap report (datasets with no key variables, variables citing an undefined codelist, missing labels). Structural conformance is the separate check_dataset_conformance tool; neither is a full Pinnacle21/CDISC-CT rule engine. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      spec: DEFINE_SPEC_SCHEMA,
      defineVersion: { type: 'string', enum: ['2.0', '2.1'], description: "Define-XML version to emit. Default '2.1'." },
    },
    required: ['spec'],
  },
};

export const CHECK_DATASET_CONFORMANCE: AnaTool = {
  name: 'check_dataset_conformance',
  description:
    'Run deterministic structural conformance checks over an SDTM/ADaM dataset spec: required identifier variables present (STUDYID/DOMAIN/USUBJID for SDTM), variable naming (uppercase, ≤8 chars), valid data types, label length, text-length presence, and codelist resolution. Returns per-finding severity + a pass/fail summary. Structural subset, not the full validator of record. ' +
    DETERMINISTIC_NOTE,
  input_schema: { type: 'object', properties: { spec: DEFINE_SPEC_SCHEMA }, required: ['spec'] },
};

// ── References ─────────────────────────────────────────────────────────────────

const REFERENCE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    authors: { type: 'array', items: { type: 'string' }, description: 'Author names ("Last, First" or "First Last").' },
    title: { type: 'string' },
    journal: { type: 'string' },
    year: { type: 'string' },
    volume: { type: 'string' },
    issue: { type: 'string' },
    pages: { type: 'string' },
    doi: { type: 'string' },
  },
  required: ['authors', 'title'],
} as const;

export const IMPORT_RIS_REFERENCES: AnaTool = {
  name: 'import_ris_references',
  description:
    'Parse RIS-format reference text (e.g. exported from PubMed/EndNote/Zotero) into structured references (authors, title, journal, year, volume, issue, pages, doi). Use before formatting or linting a bibliography. ' +
    DETERMINISTIC_NOTE,
  input_schema: { type: 'object', properties: { ris: { type: 'string', description: 'RIS-format text (one or more TY…ER records).' } }, required: ['ris'] },
};

export const FORMAT_REFERENCES: AnaTool = {
  name: 'format_references',
  description:
    'Format structured references into a numbered bibliography in Vancouver or AMA style (author initials, et al after 6 authors, year;volume(issue):pages; AMA italicizes the journal and appends the DOI). For CERs, clinical overviews, IBs. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      references: { type: 'array', items: REFERENCE_SCHEMA, description: 'Structured references to format.' },
      style: { type: 'string', enum: ['vancouver', 'ama'], description: 'Citation style (default vancouver).' },
    },
    required: ['references'],
  },
};

export const LINT_REFERENCES: AnaTool = {
  name: 'lint_references',
  description:
    'Lint a reference list for completeness (missing title/authors/year/journal) and duplicates (by DOI, then normalized title). Returns per-reference issues with severity + duplicate groups + a summary. ' +
    DETERMINISTIC_NOTE,
  input_schema: { type: 'object', properties: { references: { type: 'array', items: REFERENCE_SCHEMA } }, required: ['references'] },
};

/** Extended regulatory capability tools, spread into ALL_ANA_TOOLS. */
export const EXTENDED_REGULATORY_TOOLS: AnaTool[] = [
  MODEL_BUDGET_IMPACT,
  MODEL_COST_EFFECTIVENESS,
  GENERATE_SPL,
  VALIDATE_SPL,
  GENERATE_DEFINE_XML,
  CHECK_DATASET_CONFORMANCE,
  IMPORT_RIS_REFERENCES,
  FORMAT_REFERENCES,
  LINT_REFERENCES,
];
