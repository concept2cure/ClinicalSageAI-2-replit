/**
 * CDISC dataset-package readiness — submission-package conformance roll-up.
 *
 * A submission's dataset package mixes SDTM tabulation datasets and ADaM analysis
 * datasets. This orchestrator dispatches each dataset to the correct conformance
 * checker (SDTM domain checker for SDTM domains; the ADSL/BDS/OCCDS checkers for
 * ADaM by class) and rolls the per-dataset verdicts into one package-level
 * readiness answer — the "is my dataset package submission-ready?" deliverable
 * that pairs with the Define-XML generator.
 *
 * Pure / deterministic — composes the underlying deterministic checkers.
 *
 * @module server/services/cdisc/cdisc-package-readiness
 */

import { checkSdtmDomainConformance } from './sdtm-domain-conformance-checker';
import { checkAdamAdslConformance } from './adam-adsl-conformance-checker';
import { checkAdamBdsConformance } from './adam-bds-conformance-checker';
import { checkAdamOccdsConformance } from './adam-occds-conformance-checker';

export type DatasetStandard = 'SDTM' | 'ADaM';

export interface PackageVariable {
  name: string;
  dataType: 'Char' | 'Num';
  length?: number;
  controlledTerms?: string[];
}

export interface PackageDataset {
  /** Dataset name (e.g. 'DM', 'AE', 'ADSL', 'ADAE'). */
  name: string;
  standard: DatasetStandard;
  /** SDTM domain (DM/AE/…) or ADaM class (ADSL/BDS/OCCDS). */
  domainOrClass: string;
  variables: PackageVariable[];
}

export interface DatasetResult {
  dataset: string;
  standard: DatasetStandard;
  domainOrClass: string;
  /** Whether the domain/class was recognized by a checker. */
  recognized: boolean;
  ready: boolean;
  errors: number;
  warnings: number;
  /** Stable finding codes for quick triage. */
  findingCodes: string[];
}

export interface PackageReadinessResult {
  ready: boolean;
  studyName?: string;
  datasets: DatasetResult[];
  summary: {
    datasetCount: number;
    datasetsReady: number;
    unrecognized: number;
    totalErrors: number;
    totalWarnings: number;
  };
}

export interface PackageReadinessInput {
  studyName?: string;
  datasets: PackageDataset[];
}

const ADAM_CLASS = (cls: string) => cls.trim().toUpperCase();

/** Dispatch one dataset to the correct checker; null when unrecognized. */
function checkDataset(ds: PackageDataset): { ready: boolean; errors: number; warnings: number; codes: string[] } | null {
  if (ds.standard === 'SDTM') {
    const r = checkSdtmDomainConformance({ domain: ds.domainOrClass, variables: ds.variables }) as any;
    // The SDTM checker reports an unknown domain via recognized:false / UNKNOWN_DOMAIN.
    if (r.recognized === false) return null;
    return { ready: r.ready, errors: r.counts.errors, warnings: r.counts.warnings, codes: (r.findings ?? []).map((f: any) => f.code) };
  }
  // ADaM by class.
  const cls = ADAM_CLASS(ds.domainOrClass);
  const run =
    cls === 'ADSL' ? checkAdamAdslConformance
    : cls === 'BDS' ? checkAdamBdsConformance
    : cls === 'OCCDS' ? checkAdamOccdsConformance
    : null;
  if (!run) return null;
  const r = run({ variables: ds.variables }) as any;
  return { ready: r.ready, errors: r.counts.errors, warnings: r.counts.warnings, codes: (r.findings ?? []).map((f: any) => f.code) };
}

/**
 * Roll up per-dataset conformance into a package-level readiness verdict.
 * An unrecognized dataset is not ready (it cannot be validated). Pure.
 */
export function assessPackageReadiness(input: PackageReadinessInput): PackageReadinessResult {
  const datasets: DatasetResult[] = input.datasets.map((ds) => {
    const checked = checkDataset(ds);
    if (!checked) {
      return {
        dataset: ds.name,
        standard: ds.standard,
        domainOrClass: ds.domainOrClass,
        recognized: false,
        ready: false,
        errors: 1,
        warnings: 0,
        findingCodes: ['UNRECOGNIZED_DATASET'],
      };
    }
    return {
      dataset: ds.name,
      standard: ds.standard,
      domainOrClass: ds.domainOrClass,
      recognized: true,
      ready: checked.ready,
      errors: checked.errors,
      warnings: checked.warnings,
      findingCodes: [...new Set(checked.codes)].sort(),
    };
  });

  const datasetsReady = datasets.filter((d) => d.ready).length;
  const unrecognized = datasets.filter((d) => !d.recognized).length;
  const totalErrors = datasets.reduce((n, d) => n + d.errors, 0);
  const totalWarnings = datasets.reduce((n, d) => n + d.warnings, 0);

  return {
    ready: datasets.length > 0 && datasets.every((d) => d.ready),
    studyName: input.studyName,
    datasets,
    summary: { datasetCount: datasets.length, datasetsReady, unrecognized, totalErrors, totalWarnings },
  };
}
