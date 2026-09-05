/**
 * CDISC submission pipeline orchestrator (SDTM / ADaM).
 *
 * Runs the full deterministic flow over a dataset spec: structural conformance
 * (the base rules) + a set of deeper cross-dataset/metadata rules, then generates
 * define.xml, and returns a consolidated submission-readiness report.
 *
 * The define.xml comes from `define-xml-generator`, the one generator, at the
 * version `spec.defineVersion` names. That default is '2.1': this pipeline used
 * to emit 2.0 because it called a second generator that only knew 2.0, which was
 * never a decision anyone made about the submission. A package targeting 2.0
 * now says so.
 *
 * Honest scope: covers the mechanical, reproducible rules. It is NOT a
 * substitute for the validator of record (Pinnacle21/CDISC CT) — it does not
 * apply the full controlled-terminology dictionary or every conformance rule.
 *
 * @module server/services/cdisc/pipeline
 */

import {
  checkDatasetConformance,
  type DefineSpec,
  type ConformanceFinding,
} from './define-spec-conformance.js';
import {
  generateDefineXml,
  type DefineXmlInput,
  type DefineXmlVersion,
} from './define-xml-generator.js';

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
  /** The Define-XML version the `defineXml` above actually is. */
  defineVersion: DefineXmlVersion;
  notes: string[];
}

/**
 * Map the conformance spec shape onto the generator's input. The two models name
 * the same things differently (`type`/`dataType`, `codelist`/`codelistId`,
 * `oid`/`id`, `items`/`terms`); this is the single place that translation lives.
 */
function toDefineXmlInput(spec: DefineSpec, defineVersion: DefineXmlVersion): DefineXmlInput {
  return {
    studyName: spec.studyName,
    defineVersion,
    datasets: spec.datasets.map((ds) => ({
      name: ds.name,
      label: ds.label,
      datasetClass: ds.datasetClass,
      structure: ds.structure,
      variables: (ds.variables ?? []).map((v) => ({
        name: v.name,
        label: v.label,
        dataType: v.type === 'time' ? 'text' : v.type,
        length: v.length,
        mandatory: v.mandatory,
        codelistId: v.codelist,
        origin: v.origin,
      })),
    })),
    codelists: (spec.codelists ?? []).map((cl) => ({
      id: cl.oid,
      name: cl.name,
      dataType: cl.type === 'integer' ? 'integer' : 'text',
      terms: cl.items.map((it) => ({ value: it.code, decode: it.decode })),
    })),
  };
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
export function runCdiscPipeline(spec: DefineSpec & { defineVersion?: DefineXmlVersion }): CdiscPipelineResult {
  const defineVersion: DefineXmlVersion = spec.defineVersion ?? '2.1';
  const base = checkDatasetConformance(spec); // throws on an empty/invalid spec
  const deep = deepChecks(spec);
  const findings = [...base.findings, ...deep];

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  // The generator reports its own gaps (keys, orphan codelists); those overlap
  // ours and the findings above are the report of record here, so keep the XML.
  const { xml } = generateDefineXml(toDefineXmlInput(spec, defineVersion));

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
    defineVersion,
    notes: [
      `define.xml emitted at Define-XML ${defineVersion}.`,
      'Structural + metadata rules only; run Pinnacle21/CDISC-CT before submission.',
      'submissionReady reflects zero structural errors here — not full validator-of-record clearance.',
    ],
  };
}
