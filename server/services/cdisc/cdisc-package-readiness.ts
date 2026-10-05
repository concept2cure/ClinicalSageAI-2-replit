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
 * Per-dataset conformance is not enough: FDA's Technical Rejection Criteria for
 * Study Data reject a study whose package lacks the datasets they name, however
 * conformant the rest is. `assessStudyDataRequirements` is the one place those
 * package-level requirements are decided (1734: ts.xpt with the study start
 * date; 1736: DM and define.xml for SDTM, ADSL and define.xml for ADaM), and
 * `assessPackageReadiness` is ready only when every one is met. Until
 * 2026-10-05 a package of [ADLB, ADAE] alone read ready, and a package carrying
 * TS could never pass because TS was an unrecognised dataset.
 *
 * Scope: clinical study data (SDTM, ADaM) described by caller-supplied
 * metadata. No .xpt or define.xml is read; define.xml presence and the TS
 * parameter codes are what the caller declares, and anything not declared is
 * reported 'not-stated', never met. SEND (nonclinical, start date STSTDTC) is
 * not assessed here.
 *
 * Pure / deterministic — composes the underlying deterministic checkers.
 *
 * @module server/services/cdisc/cdisc-package-readiness
 */

import { checkSdtmDomainConformance } from './sdtm-domain-conformance-checker';
import { FDA_STUDY_DATA_TRC, recall } from '../ind/ctd/regulatory-basis';
import type { RegulatoryBasis } from '../ind/ctd/types';
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
  /**
   * Whether the dataset was checked against a reference spec. False for an
   * unrecognised dataset and for a known SDTM domain with no spec
   * (NOT_CONFORMANCE_CHECKED); either way it is not ready.
   */
  conformanceChecked: boolean;
  ready: boolean;
  errors: number;
  warnings: number;
  /** Stable finding codes for quick triage. */
  findingCodes: string[];
}

/** FDA study-data technical rejection criterion a requirement comes from. */
export type TrcCriterion = '1734' | '1736';

/**
 * met: the package, as described, satisfies it. missing: it does not.
 * not-stated: the caller did not say (define.xml, TS parameters), so it is
 * unverified — never treated as met.
 */
export type StudyDataRequirementState = 'met' | 'missing' | 'not-stated';

export interface StudyDataRequirement {
  id:
    | 'TRC_1734_NO_TS'
    | 'TRC_1734_SSTDTC'
    | 'TRC_1736_NO_DM'
    | 'TRC_1736_NO_ADSL'
    | 'TRC_1736_DEFINE_SDTM'
    | 'TRC_1736_DEFINE_ADAM';
  criterion: TrcCriterion;
  state: StudyDataRequirementState;
  message: string;
  basis: RegulatoryBasis;
}

/** Advisory observation about the package; does not decide readiness. */
export interface StudyDataNote {
  id: 'ADAM_WITHOUT_SDTM';
  message: string;
  basis: RegulatoryBasis;
}

export interface StudyDataRequirementsInput {
  /** The datasets in one study's package; only name and standard are read. */
  datasets: ReadonlyArray<Pick<PackageDataset, 'name' | 'standard'>>;
  /** Whether a define.xml is present for each standard; omitted means not stated. */
  defineXml?: { sdtm?: boolean; adam?: boolean };
  /** TSPARMCD values present in the TS dataset; omitted means not stated. */
  tsParameters?: readonly string[];
}

export interface StudyDataRequirementsResult {
  requirements: StudyDataRequirement[];
  notes: StudyDataNote[];
}

export interface PackageReadinessResult {
  ready: boolean;
  studyName?: string;
  datasets: DatasetResult[];
  /** FDA study-data TRC requirements for the package (assessStudyDataRequirements). */
  requirements: StudyDataRequirement[];
  notes: StudyDataNote[];
  /** Why the package is not ready; empty when ready. */
  reasons: string[];
  summary: {
    datasetCount: number;
    datasetsReady: number;
    unrecognized: number;
    /** Known SDTM domains with no reference spec: recognised, not checked, not ready. */
    notChecked: number;
    totalErrors: number;
    totalWarnings: number;
  };
}

export interface PackageReadinessInput {
  studyName?: string;
  datasets: PackageDataset[];
  /** Whether a define.xml is present for each standard; omitted means not stated. */
  defineXml?: { sdtm?: boolean; adam?: boolean };
  /** TSPARMCD values present in the TS dataset; omitted means not stated. */
  tsParameters?: string[];
}

/**
 * FDA's study-data TRC requirements for one study's dataset package. Pure.
 *
 * TRC 1734: a ts.xpt carrying the study start date for each study. Applies to
 * any study data, ADaM-only included. The start date is checked as the
 * presence of TSPARMCD SSTDTC (clinical); its value's yyyy-mm-dd format and the
 * TS/STF study-ID match are not checked, because no values are supplied.
 * TRC 1736: SDTM needs dm.xpt and define.xml; ADaM needs adsl.xpt and
 * define.xml. Datasets are matched by name, the file name the criteria check.
 *
 * An empty package has no study data, so no requirement applies; it is not
 * ready for that reason instead (assessPackageReadiness).
 */
export function assessStudyDataRequirements(input: StudyDataRequirementsInput): StudyDataRequirementsResult {
  const datasets = input.datasets ?? [];
  if (datasets.length === 0) return { requirements: [], notes: [] };

  const named = (standard: DatasetStandard, name: string) =>
    datasets.some((d) => d.standard === standard && (d.name ?? '').trim().toUpperCase() === name);
  const hasSdtm = datasets.some((d) => d.standard === 'SDTM');
  const hasAdam = datasets.some((d) => d.standard === 'ADaM');
  const hasTs = named('SDTM', 'TS');

  const requirements: StudyDataRequirement[] = [
    requirement('TRC_1734_NO_TS', '1734', hasTs ? 'met' : 'missing'),
    requirement('TRC_1734_SSTDTC', '1734', startDateState(hasTs, input.tsParameters)),
  ];
  if (hasSdtm) {
    requirements.push(
      requirement('TRC_1736_NO_DM', '1736', named('SDTM', 'DM') ? 'met' : 'missing'),
      requirement('TRC_1736_DEFINE_SDTM', '1736', declared(input.defineXml?.sdtm)),
    );
  }
  if (hasAdam) {
    requirements.push(
      requirement('TRC_1736_NO_ADSL', '1736', named('ADaM', 'ADSL') ? 'met' : 'missing'),
      requirement('TRC_1736_DEFINE_ADAM', '1736', declared(input.defineXml?.adam)),
    );
  }

  const notes: StudyDataNote[] = hasAdam && !hasSdtm ? [ADAM_WITHOUT_SDTM_NOTE] : [];
  return { requirements, notes };
}

type RequirementId = StudyDataRequirement['id'];

/** The message for each requirement in each state. One table, so wording stays consistent. */
const REQUIREMENT_MESSAGES: Record<RequirementId, Record<StudyDataRequirementState, string>> = {
  TRC_1734_NO_TS: {
    met: 'A Trial Summary dataset (ts.xpt) is present.',
    missing: 'No Trial Summary dataset (ts.xpt). FDA TRC 1734 requires a ts.xpt with the study start date for each study, ADaM-only packages included.',
    'not-stated': 'Whether a Trial Summary dataset (ts.xpt) is present was not stated.',
  },
  TRC_1734_SSTDTC: {
    met: 'TS carries the study start date parameter (SSTDTC). Its yyyy-mm-dd format and the TS/STF study-ID match are not checked here.',
    missing: 'No study start date (TSPARMCD SSTDTC) in a ts.xpt. FDA TRC 1734 requires the study start date in ts.xpt.',
    'not-stated': 'The TS parameter codes were not supplied, so the study start date (TSPARMCD SSTDTC) is unverified.',
  },
  TRC_1736_NO_DM: {
    met: 'SDTM includes a Demographics dataset (dm.xpt).',
    missing: 'SDTM data with no Demographics dataset (dm.xpt). FDA TRC 1736 requires DM for SDTM.',
    'not-stated': 'Whether SDTM includes a Demographics dataset (dm.xpt) was not stated.',
  },
  TRC_1736_NO_ADSL: {
    met: 'ADaM includes a subject-level analysis dataset (adsl.xpt).',
    missing: 'ADaM data with no subject-level analysis dataset (adsl.xpt). FDA TRC 1736 requires ADSL for ADaM.',
    'not-stated': 'Whether ADaM includes a subject-level analysis dataset (adsl.xpt) was not stated.',
  },
  TRC_1736_DEFINE_SDTM: {
    met: 'A define.xml for the SDTM datasets is declared present.',
    missing: 'No define.xml for the SDTM datasets. FDA TRC 1736 requires define.xml for SDTM.',
    'not-stated': 'Whether a define.xml accompanies the SDTM datasets was not stated, so TRC 1736 is unverified.',
  },
  TRC_1736_DEFINE_ADAM: {
    met: 'A define.xml for the ADaM datasets is declared present.',
    missing: 'No define.xml for the ADaM datasets. FDA TRC 1736 requires define.xml for ADaM.',
    'not-stated': 'Whether a define.xml accompanies the ADaM datasets was not stated, so TRC 1736 is unverified.',
  },
};

function requirement(id: RequirementId, criterion: TrcCriterion, state: StudyDataRequirementState): StudyDataRequirement {
  return { id, criterion, state, message: REQUIREMENT_MESSAGES[id][state], basis: FDA_STUDY_DATA_TRC };
}

/** A caller declaration: true is met, false is missing, absent is not stated. */
function declared(v: boolean | undefined): StudyDataRequirementState {
  if (v === true) return 'met';
  return v === false ? 'missing' : 'not-stated';
}

/** No TS means no start date; TS without its parameter codes is unverified. */
function startDateState(hasTs: boolean, tsParameters: readonly string[] | undefined): StudyDataRequirementState {
  if (!hasTs) return 'missing';
  if (tsParameters === undefined) return 'not-stated';
  return tsParameters.some((p) => String(p).trim().toUpperCase() === 'SSTDTC') ? 'met' : 'missing';
}

const ADAM_WITHOUT_SDTM_NOTE: StudyDataNote = {
  id: 'ADAM_WITHOUT_SDTM',
  message: 'ADaM datasets with no SDTM tabulation datasets. Analysis datasets are expected alongside the tabulation datasets they are derived from; if SDTM is submitted separately, assess it with this package.',
  basis: recall('FDA, Study Data Technical Conformance Guide: analysis datasets are submitted with the tabulation datasets they trace to (not checked against the guide text)'),
};

const ADAM_CLASS = (cls: string) => cls.trim().toUpperCase();

/** Dispatch one dataset to the correct checker; null when unrecognized. */
function checkDataset(ds: PackageDataset): { ready: boolean; checked: boolean; errors: number; warnings: number; codes: string[] } | null {
  if (ds.standard === 'SDTM') {
    const r = checkSdtmDomainConformance({ domain: ds.domainOrClass, variables: ds.variables });
    // The SDTM checker reports an unknown domain via recognized:false / UNKNOWN_DOMAIN,
    // and a known domain with no spec via conformanceChecked:false / NOT_CONFORMANCE_CHECKED.
    if (r.recognized === false) return null;
    return { ready: r.ready, checked: r.conformanceChecked, errors: r.counts.errors, warnings: r.counts.warnings, codes: r.findings.map((f) => f.code) };
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
  return { ready: r.ready, checked: true, errors: r.counts.errors, warnings: r.counts.warnings, codes: (r.findings ?? []).map((f: any) => f.code) };
}

/**
 * Roll up per-dataset conformance and the FDA study-data TRC requirements into
 * a package-level readiness verdict. Ready only when there is at least one
 * dataset, every dataset was conformance-checked and is ready, and every
 * requirement is met. An unrecognised or unchecked dataset is not ready (it
 * was not validated). Pure.
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
        conformanceChecked: false,
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
      conformanceChecked: checked.checked,
      ready: checked.checked && checked.ready,
      errors: checked.errors,
      warnings: checked.warnings,
      findingCodes: [...new Set(checked.codes)].sort(),
    };
  });

  const datasetsReady = datasets.filter((d) => d.ready).length;
  const unrecognized = datasets.filter((d) => !d.recognized).length;
  const notChecked = datasets.filter((d) => d.recognized && !d.conformanceChecked).length;
  const totalErrors = datasets.reduce((n, d) => n + d.errors, 0);
  const totalWarnings = datasets.reduce((n, d) => n + d.warnings, 0);

  const { requirements, notes } = assessStudyDataRequirements({
    datasets: input.datasets,
    defineXml: input.defineXml,
    tsParameters: input.tsParameters,
  });

  const plural = (n: number) => (n === 1 ? `${n} dataset` : `${n} datasets`);
  const reasons: string[] = [];
  if (datasets.length === 0) reasons.push('No datasets supplied');
  if (unrecognized > 0) reasons.push(`${plural(unrecognized)} not recognised`);
  if (notChecked > 0) reasons.push(`${plural(notChecked)} not conformance-checked`);
  const failing = datasets.filter((d) => d.conformanceChecked && !d.ready).length;
  if (failing > 0) reasons.push(`${plural(failing)} with conformance errors`);
  for (const r of requirements) if (r.state !== 'met') reasons.push(`${r.id} (TRC ${r.criterion}): ${r.state}`);

  return {
    ready: reasons.length === 0,
    studyName: input.studyName,
    datasets,
    requirements,
    notes,
    reasons,
    summary: { datasetCount: datasets.length, datasetsReady, unrecognized, notChecked, totalErrors, totalWarnings },
  };
}
