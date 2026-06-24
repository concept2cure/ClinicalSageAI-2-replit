/**
 * CDISC submission pipeline orchestrator (SDTM / ADaM).
 *
 * Runs the full deterministic flow over a dataset spec: structural conformance
 * (the base rules) + a set of deeper cross-dataset/metadata rules, then generates
 * define.xml, and returns a consolidated submission-readiness report.
 *
 * Honest scope: covers the mechanical, reproducible rules. It is NOT a
 * substitute for the validator of record (Pinnacle21/CDISC CT) — it does not
 * apply the full controlled-terminology dictionary or every conformance rule.
 *
 * @module server/services/cdisc/pipeline
 */

import {
  checkDatasetConformance,
  generateDefineXml,
  type DefineSpec,
  type ConformanceFinding,
} from './define-xml.js';

export interface CdiscReadiness {
  submissionReady: boolean;
  datasets: number;
  variables: number;
  errors: number;
  warnings: number;
}

export interface CdiscPipelineResult {
  standard: DefineSpec['standard'];
  findings: ConformanceFinding[];
  readiness: CdiscReadiness;
  defineXml: string;
  notes: string[];
}

/** Deeper rules layered on top of the base structural conformance checks. */
function deepChecks(spec: DefineSpec): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  const definedCodelists = new Set((spec.codelists ?? []).map((c) => c.oid));
  const usedCodelists = new Set<string>();

  for (const ds of spec.datasets) {
    if (!ds.label || !ds.label.trim()) {
      findings.push({ severity: 'error', dataset: ds.name, rule: 'dataset.label', message: 'Dataset label is required.' });
    } else if (ds.label.length > 40) {
      findings.push({ severity: 'warning', dataset: ds.name, rule: 'dataset.label.length', message: 'Dataset label exceeds 40 characters.' });
    }
    // Duplicate variable names within the dataset.
    const seen = new Set<string>();
    for (const v of ds.variables ?? []) {
      if (seen.has(v.name)) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'variable.duplicate', message: `Duplicate variable "${v.name}" in dataset.` });
      }
      seen.add(v.name);
      if (v.codelist) usedCodelists.add(v.codelist);
    }
  }

  // Codelist hygiene: defined-but-empty (error), defined-but-unused (warning).
  for (const cl of spec.codelists ?? []) {
    if (!cl.items || cl.items.length === 0) {
      findings.push({ severity: 'error', dataset: '(codelists)', rule: 'codelist.empty', message: `Codelist "${cl.oid}" has no items.` });
    }
    if (!usedCodelists.has(cl.oid)) {
      findings.push({ severity: 'warning', dataset: '(codelists)', rule: 'codelist.unused', message: `Codelist "${cl.oid}" is defined but not referenced by any variable.` });
    }
  }
  // Referenced-but-undefined codelists are already covered by the base codelist.ref rule.
  void definedCodelists;

  // ADaM expects an ADSL (subject-level) dataset.
  if (spec.standard === 'ADaM' && !spec.datasets.some((d) => d.name.toUpperCase() === 'ADSL')) {
    findings.push({ severity: 'warning', dataset: '(study)', rule: 'adam.adsl', message: 'ADaM submission has no ADSL (subject-level) dataset.' });
  }

  return findings;
}

/** Run the full CDISC pipeline: conformance (base + deep) → define.xml → readiness. */
export function runCdiscPipeline(spec: DefineSpec): CdiscPipelineResult {
  const base = checkDatasetConformance(spec); // throws on an empty/invalid spec
  const deep = deepChecks(spec);
  const findings = [...base.findings, ...deep];

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  // Reuse the generator; its own conformance run is redundant with ours, so we
  // keep only its XML.
  const { xml } = generateDefineXml(spec);

  return {
    standard: spec.standard,
    findings,
    readiness: {
      submissionReady: errors === 0,
      datasets: base.summary.datasets,
      variables: base.summary.variables,
      errors,
      warnings,
    },
    defineXml: xml,
    notes: [
      'Structural + metadata rules only; run Pinnacle21/CDISC-CT before submission.',
      'submissionReady reflects zero structural errors here — not full validator-of-record clearance.',
    ],
  };
}
