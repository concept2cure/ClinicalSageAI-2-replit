/**
 * FDA eSTAR version registry — the authoritative "Current eSTAR Versions" table.
 *
 * FDA distributes the eSTAR program as three interactive-PDF template families,
 * each revised on its own cadence with a published retirement date for the prior
 * revision and an OMB control number set. This module encodes that table verbatim
 * so every surface (readiness gates, the submission catalog, client registration,
 * the template registry) reads version, retirement, OMB, and supported-submission
 * facts from one source instead of hard-coding them.
 *
 *   nIVD eSTAR    — Non-In Vitro Diagnostic devices: 510(k), De Novo, PMA
 *   IVD  eSTAR    — In Vitro Diagnostic devices:       510(k), De Novo, PMA
 *   PreSTAR (PreSTAR2) — Early Submission Requests:    Q-Submissions, IDEs, 513(g)
 *
 * When FDA revises eSTAR the prior version keeps being accepted until its
 * retirement date; after that a submission on the retired version is not rejected
 * but may draw information requests about the version delta. `versionLifecycleAsOf`
 * expresses exactly that three-state lifecycle relative to a caller-supplied date.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no clock read.
 * The caller passes the "as of" date so the result is reproducible and testable.
 *
 * @module server/services/pathway-engines/estar/estar-versions
 */

/** The three FDA eSTAR template families. */
export type EstarTemplateFamily = 'nivd' | 'ivd' | 'prestar';

/**
 * Every submission type the eSTAR program covers. The nIVD/IVD families carry the
 * marketing pathways; PreSTAR carries the early/pre-market request pathways.
 */
export type EstarProgramSubmissionType =
  | '510k'
  | 'de_novo'
  | 'pma'
  | 'q_sub'
  | 'ide'
  | '513g';

/** Publication status of an eSTAR version as published by FDA. */
export type EstarVersionStatus = 'current' | 'retiring';

/**
 * Lifecycle of a version relative to an "as of" date: `current` (the updated
 * version), `retiring-soon` (a prior version still accepted, retirement pending),
 * or `retired` (past its retirement date — still accepted by FDA, but expect
 * version-delta information requests).
 */
export type EstarVersionLifecycle = 'current' | 'retiring-soon' | 'retired';

export interface EstarVersionRecord {
  /** Template family this version belongs to. */
  family: EstarTemplateFamily;
  /** FDA version string, e.g. "7.0", "6.2", "3.0", "2.2". */
  version: string;
  /** FDA-facing template name, verbatim from the eSTAR versions table. */
  templateName: string;
  /** "Used For" description, verbatim from the eSTAR versions table. */
  usedFor: string;
  /** `current` = the updated version; `retiring` = the prior, soon-to-retire version. */
  status: EstarVersionStatus;
  /** ISO-8601 retirement date for a `retiring` version; null for the `current` one. */
  retirementDate: string | null;
  /** OMB control numbers that cover this template's collections of information. */
  ombNumbers: string[];
  /** Submission types this template family can carry. */
  supportedSubmissionTypes: EstarProgramSubmissionType[];
}

/**
 * The shared retirement date FDA published for the retiring eSTAR versions
 * (nIVD 6.2, IVD 6.2, PreSTAR2 2.2). Kept as a named constant so a single edit
 * moves every retiring version when FDA republishes the table.
 */
export const ESTAR_RETIREMENT_DATE = '2026-08-03';

const NIVD_IVD_SUBMISSION_TYPES: EstarProgramSubmissionType[] = ['510k', 'de_novo', 'pma'];
const PRESTAR_SUBMISSION_TYPES: EstarProgramSubmissionType[] = ['q_sub', 'ide', '513g'];

const NIVD_IVD_OMB = ['0910-0120', '0910-0844', '0910-0231'];
const PRESTAR_OMB = ['0910-0756', '0910-0078', '0910-0511'];

/**
 * The FDA eSTAR versions table, verbatim. Two rows per family: the retiring prior
 * version and the current updated version. Update this table (not call sites) when
 * FDA republishes eSTAR.
 */
export const ESTAR_VERSIONS: EstarVersionRecord[] = [
  // ── Non-In Vitro Diagnostic (nIVD) eSTAR ──────────────────────────────────
  {
    family: 'nivd',
    version: '6.2',
    templateName: 'Non-In Vitro Diagnostic (nIVD) eSTAR Version 6.2',
    usedFor: '510(k), De Novo, and PMA: medical device submissions for Non-In Vitro Diagnostic devices',
    status: 'retiring',
    retirementDate: ESTAR_RETIREMENT_DATE,
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
  },
  {
    family: 'nivd',
    version: '7.0',
    templateName: 'Non-In Vitro Diagnostic (nIVD) eSTAR Version 7.0',
    usedFor: '510(k), De Novo, and PMA: medical device submissions for Non-In Vitro Diagnostic devices',
    status: 'current',
    retirementDate: null,
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
  },

  // ── In Vitro Diagnostic (IVD) eSTAR ───────────────────────────────────────
  {
    family: 'ivd',
    version: '6.2',
    templateName: 'In Vitro Diagnostic (IVD) eSTAR Version 6.2',
    usedFor: '510(k), De Novo, and PMA medical device submissions for In Vitro Diagnostic devices',
    status: 'retiring',
    retirementDate: ESTAR_RETIREMENT_DATE,
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
  },
  {
    family: 'ivd',
    version: '7.0',
    templateName: 'In Vitro Diagnostic (IVD) eSTAR Version 7.0',
    usedFor: '510(k), De Novo, and PMA medical device submissions for In Vitro Diagnostic devices',
    status: 'current',
    retirementDate: null,
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
  },

  // ── Early Submission Requests eSTAR (PreSTAR2) ────────────────────────────
  {
    family: 'prestar',
    version: '2.2',
    templateName: 'Early Submission Requests eSTAR (PreSTAR2) Version 2.2',
    usedFor: 'Pre-Submissions, IDE, and 513(g) requests for information for Non-In Vitro and In Vitro Diagnostic devices',
    status: 'retiring',
    retirementDate: ESTAR_RETIREMENT_DATE,
    ombNumbers: PRESTAR_OMB,
    supportedSubmissionTypes: PRESTAR_SUBMISSION_TYPES,
  },
  {
    family: 'prestar',
    version: '3.0',
    templateName: 'Early Submission Requests eSTAR (PreSTAR2) Version 3.0',
    usedFor: 'Q-Submissions, IDEs, and 513(g) requests for information for Non-In Vitro and In Vitro Diagnostic devices',
    status: 'current',
    retirementDate: null,
    ombNumbers: PRESTAR_OMB,
    supportedSubmissionTypes: PRESTAR_SUBMISSION_TYPES,
  },
];

/** Human-readable label for each family. */
export const ESTAR_FAMILY_LABELS: Record<EstarTemplateFamily, string> = {
  nivd: 'Non-In Vitro Diagnostic (nIVD) eSTAR',
  ivd: 'In Vitro Diagnostic (IVD) eSTAR',
  prestar: 'Early Submission Requests eSTAR (PreSTAR2)',
};

// ─── Query functions ──────────────────────────────────────────────────────────

/** All version records for a family, in table order (retiring first, then current). */
export function versionsForFamily(family: EstarTemplateFamily): EstarVersionRecord[] {
  return ESTAR_VERSIONS.filter((v) => v.family === family);
}

/** The current (updated) version record for a family, or undefined if none. */
export function currentVersionFor(family: EstarTemplateFamily): EstarVersionRecord | undefined {
  return ESTAR_VERSIONS.find((v) => v.family === family && v.status === 'current');
}

/** The retiring (prior) version record for a family, or undefined if none. */
export function retiringVersionFor(family: EstarTemplateFamily): EstarVersionRecord | undefined {
  return ESTAR_VERSIONS.find((v) => v.family === family && v.status === 'retiring');
}

/** Look up a specific version record by family + version string. */
export function getVersionRecord(
  family: EstarTemplateFamily,
  version: string,
): EstarVersionRecord | undefined {
  return ESTAR_VERSIONS.find((v) => v.family === family && v.version === version);
}

/** The template families able to carry a given submission type. */
export function familiesForSubmissionType(
  type: EstarProgramSubmissionType,
): EstarTemplateFamily[] {
  const families = new Set<EstarTemplateFamily>();
  for (const v of ESTAR_VERSIONS) {
    if (v.supportedSubmissionTypes.includes(type)) families.add(v.family);
  }
  return [...families];
}

/** All families, in canonical order. */
export function listFamilies(): EstarTemplateFamily[] {
  return ['nivd', 'ivd', 'prestar'];
}

/**
 * Classify a version's lifecycle relative to an "as of" date (YYYY-MM-DD or ISO):
 *   - `current`       → the updated version (never retires)
 *   - `retiring-soon` → a retiring version whose retirement date has not passed
 *   - `retired`       → a retiring version on/after its retirement date
 *
 * On the retirement date itself the version is treated as retired (FDA's stated
 * behaviour: retired versions are still accepted but draw version-delta IRs).
 */
export function versionLifecycleAsOf(
  record: EstarVersionRecord,
  asOf: string | Date,
): EstarVersionLifecycle {
  if (record.status === 'current' || record.retirementDate === null) return 'current';
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const retire = new Date(record.retirementDate);
  if (Number.isNaN(asOfDate.getTime())) return 'retiring-soon';
  return asOfDate.getTime() >= retire.getTime() ? 'retired' : 'retiring-soon';
}

/**
 * True when a version is still the one FDA recommends for immediate use. Only the
 * `current` version qualifies — a retiring version is accepted, not recommended.
 */
export function isRecommendedVersion(record: EstarVersionRecord): boolean {
  return record.status === 'current';
}

export default {
  ESTAR_VERSIONS,
  ESTAR_RETIREMENT_DATE,
  ESTAR_FAMILY_LABELS,
  versionsForFamily,
  currentVersionFor,
  retiringVersionFor,
  getVersionRecord,
  familiesForSubmissionType,
  listFamilies,
  versionLifecycleAsOf,
  isRecommendedVersion,
};
