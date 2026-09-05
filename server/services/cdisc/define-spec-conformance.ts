/**
 * Structural conformance checks over a CDISC dataset spec (SDTM / ADaM basics).
 *
 * Runs deterministic structural rules — variable naming, required identifier
 * variables, data types, label length, codelist resolution — over the spec an
 * author supplies before a define.xml is generated from it. It is honest about
 * scope: these are the mechanical, reproducible metadata rules, NOT a full
 * Pinnacle21/CDISC CT rule engine, so run the validator of record before
 * submission.
 *
 * This file used to also carry a define.xml v2.0 generator, one of three in this
 * directory under names that read as alternatives. The generator is now
 * `define-xml-generator`, which takes the version as a parameter; this file was
 * renamed off `define-xml` so its name says what it does. Checking a spec and
 * rendering it are separate steps and the caller performs both.
 *
 * Pure: no DB, no network. Identical spec → identical findings.
 *
 * @module server/services/cdisc/define-spec-conformance
 */

export type CdiscStandard = 'SDTM' | 'ADaM';
export type CdiscDataType = 'text' | 'integer' | 'float' | 'date' | 'datetime' | 'time';

const VALID_TYPES: ReadonlySet<string> = new Set(['text', 'integer', 'float', 'date', 'datetime', 'time']);
const VAR_NAME_RE = /^[A-Z][A-Z0-9_]{0,7}$/; // uppercase, starts with a letter, ≤8 chars
const DATASET_NAME_RE = /^[A-Z][A-Z0-9]{1,7}$/;
const SDTM_REQUIRED = ['STUDYID', 'DOMAIN', 'USUBJID'];
const ADAM_REQUIRED = ['STUDYID', 'USUBJID'];

export interface VariableSpec {
  name: string;
  label: string;
  type: CdiscDataType;
  length?: number;
  /** OID of a codelist defined in the spec (optional). */
  codelist?: string;
  origin?: string;
  mandatory?: boolean;
}

export interface DatasetSpec {
  /** Dataset/domain name, e.g. "DM", "AE", "ADSL". */
  name: string;
  label: string;
  /** Observation class, e.g. "EVENTS", "FINDINGS", "SPECIAL PURPOSE". */
  datasetClass?: string;
  structure?: string;
  variables: VariableSpec[];
}

export interface CodeListSpec {
  oid: string;
  name: string;
  type?: CdiscDataType;
  items: { code: string; decode: string }[];
}

export interface DefineSpec {
  studyName: string;
  standard: CdiscStandard;
  datasets: DatasetSpec[];
  codelists?: CodeListSpec[];
}

export interface ConformanceFinding {
  severity: 'error' | 'warning';
  dataset: string;
  variable?: string;
  rule: string;
  message: string;
}

export interface ConformanceResult {
  standard: CdiscStandard;
  findings: ConformanceFinding[];
  summary: { datasets: number; variables: number; errors: number; warnings: number; pass: boolean };
}

/** Run deterministic structural conformance checks over a dataset spec. */
export function checkDatasetConformance(spec: DefineSpec): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  if (!spec || !Array.isArray(spec.datasets) || spec.datasets.length === 0) {
    throw new Error('spec.datasets must be a non-empty array');
  }
  const required = spec.standard === 'ADaM' ? ADAM_REQUIRED : SDTM_REQUIRED;
  const codelistOids = new Set((spec.codelists ?? []).map((c) => c.oid));
  let variableCount = 0;

  for (const ds of spec.datasets) {
    if (!DATASET_NAME_RE.test(ds.name ?? '')) {
      findings.push({ severity: 'error', dataset: ds.name ?? '(unnamed)', rule: 'dataset.name', message: 'Dataset name must be uppercase alphanumeric, start with a letter, ≤8 chars.' });
    }
    if (!Array.isArray(ds.variables) || ds.variables.length === 0) {
      findings.push({ severity: 'error', dataset: ds.name, rule: 'dataset.variables', message: 'Dataset has no variables.' });
      continue;
    }
    const names = new Set(ds.variables.map((v) => v.name));
    for (const req of required) {
      // DOMAIN only applies to SDTM domain datasets (skip the requirement for split/relrec-style names is out of scope here).
      if (!names.has(req)) {
        findings.push({ severity: 'error', dataset: ds.name, variable: req, rule: 'required.variable', message: `Required ${spec.standard} variable "${req}" is missing.` });
      }
    }
    for (const v of ds.variables) {
      variableCount++;
      if (!VAR_NAME_RE.test(v.name ?? '')) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'variable.name', message: 'Variable name must be uppercase, start with a letter, ≤8 chars.' });
      }
      if (!VALID_TYPES.has(v.type)) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'variable.type', message: `Invalid data type "${v.type}". Allowed: ${[...VALID_TYPES].join(', ')}.` });
      }
      if (!v.label?.trim()) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'variable.label', message: 'Variable label is required.' });
      } else if (v.label.length > 40) {
        findings.push({ severity: 'warning', dataset: ds.name, variable: v.name, rule: 'variable.label.length', message: 'Variable label exceeds 40 characters (SDTM/ADaM convention).' });
      }
      if (v.type === 'text' && (v.length === undefined || v.length <= 0)) {
        findings.push({ severity: 'warning', dataset: ds.name, variable: v.name, rule: 'variable.length', message: 'Text variable has no positive length defined.' });
      }
      if (v.codelist && !codelistOids.has(v.codelist)) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'codelist.ref', message: `Variable references codelist "${v.codelist}" which is not defined.` });
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  return {
    standard: spec.standard,
    findings,
    summary: { datasets: spec.datasets.length, variables: variableCount, errors, warnings, pass: errors === 0 },
  };
}
