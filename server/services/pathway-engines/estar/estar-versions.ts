/**
 * FDA eSTAR version registry — the authoritative "Current eSTAR Versions" table.
 *
 * FDA distributes the eSTAR program as three interactive-PDF template families,
 * each revised on its own cadence with a published retirement date for the prior
 * revision and an OMB control number set. This module encodes that table so every
 * surface (readiness gates, the submission catalog, client registration, the
 * template registry) reads version, retirement, OMB, and supported-submission
 * facts from one source instead of hard-coding them.
 *
 * PROVENANCE. Every row says where it came from (`sourceUrl`), when it was last
 * checked (`lastVerified`) and how (`confidence`). The table once said 7.0 / 3.0
 * long after FDA's eSTAR Program page moved to 7.1 / 3.1, and recorded no date,
 * so its decay was invisible. `versionTableAgeDays` / `isVersionTableStale` age
 * it with the currency registry's own arithmetic (imported, not copied). No
 * eSTAR version fact lives in currency-registry.ts: this table is its one home.
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

import type { RegulatoryConfidence } from '../../../../shared/regulatory/regulatory-basis';
import {
  isVerificationStale,
  verificationAgeDays,
  type RegulatoryFact,
} from '../../regulatory-currency/currency-registry';

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
 * How a row's facts were established — the two `RegulatoryConfidence` values a
 * regulator fact may carry. `regulator-text` needs a verbatim read of the FDA
 * page on `lastVerified`; a search extract or a transcription with no read on
 * record is `recall`, and is shown to the reader as such.
 */
export type EstarVersionConfidence = Extract<RegulatoryConfidence, 'regulator-text' | 'recall'>;

/**
 * Lifecycle of a version relative to an "as of" date: `current` (the updated
 * version), `retiring-soon` (a prior version still accepted, retirement pending),
 * or `retired` (past its retirement date — still accepted by FDA, but expect
 * version-delta information requests). `retiring-date-unverified` is a version
 * FDA has superseded whose retirement date nobody has read: it is neither the
 * recommended version nor known to be retired, and no date is guessed for it.
 */
export type EstarVersionLifecycle = 'current' | 'retiring-soon' | 'retired' | 'retiring-date-unverified';

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
  /** ISO date (YYYY-MM-DD) this row was last checked against `sourceUrl`. */
  lastVerified: string;
  /** Where the row can be checked: FDA's eSTAR Program page. */
  sourceUrl: string;
  /** `regulator-text` only after a verbatim read on `lastVerified`; otherwise `recall`. */
  confidence: EstarVersionConfidence;
  /** What is not known about this row, said in words (e.g. an unread retirement date). */
  note?: string;
}

/**
 * The shared retirement date recorded for nIVD 6.2, IVD 6.2 and PreSTAR2 2.2.
 * It has passed; those rows are kept, lifecycle `retired`, until a read of
 * FDA's table shows they are no longer listed.
 */
export const ESTAR_RETIREMENT_DATE = '2026-08-03';

/** FDA's eSTAR Program page — the source every row names. */
export const ESTAR_PROGRAM_URL =
  'https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program';

/**
 * The date the rows below were last checked. 2026-10-05: fda.gov-restricted
 * search extracts of the eSTAR Program page (fda.gov itself is not fetchable
 * from this environment), so every row is `recall` until a verbatim read is
 * filed. The 6.2 / 2.2 rows were not re-checked then; their date is the one
 * on which the repository first recorded them.
 */
const CHECKED_2026_10_05 = '2026-10-05';
const RECORDED_2026_09_06 = '2026-09-06';

const SUPERSEDED_NOTE =
  "Superseded on FDA's eSTAR Program page (search extract, 2026-10-05). FDA's retirement date for this version was not found and is not invented; a verbatim read of the page is owed.";
const PAST_RETIREMENT_NOTE =
  'Retirement date 2026-08-03 has passed. Whether FDA still lists this version was not re-checked on 2026-10-05.';

const NIVD_IVD_SUBMISSION_TYPES: EstarProgramSubmissionType[] = ['510k', 'de_novo', 'pma'];
const PRESTAR_SUBMISSION_TYPES: EstarProgramSubmissionType[] = ['q_sub', 'ide', '513g'];

const NIVD_IVD_OMB = ['0910-0120', '0910-0844', '0910-0231'];
const PRESTAR_OMB = ['0910-0756', '0910-0078', '0910-0511'];

/**
 * The FDA eSTAR versions table. Per family, in age order: the version whose
 * recorded retirement date has passed, the superseded version whose retirement
 * date is unread, and the current version. Update this table (not call sites)
 * when FDA republishes eSTAR, and move `lastVerified` / `confidence` with it.
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
    lastVerified: RECORDED_2026_09_06,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
    note: PAST_RETIREMENT_NOTE,
  },
  {
    family: 'nivd',
    version: '7.0',
    templateName: 'Non-In Vitro Diagnostic (nIVD) eSTAR Version 7.0',
    usedFor: '510(k), De Novo, and PMA: medical device submissions for Non-In Vitro Diagnostic devices',
    status: 'retiring',
    retirementDate: null,
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
    lastVerified: CHECKED_2026_10_05,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
    note: SUPERSEDED_NOTE,
  },
  {
    family: 'nivd',
    version: '7.1',
    templateName: 'Non-In Vitro Diagnostic (nIVD) eSTAR Version 7.1',
    usedFor: '510(k), De Novo, and PMA: medical device submissions for Non-In Vitro Diagnostic devices',
    status: 'current',
    retirementDate: null,
    // OMB numbers carried forward from 7.0; not re-read for 7.1.
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
    lastVerified: CHECKED_2026_10_05,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
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
    lastVerified: RECORDED_2026_09_06,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
    note: PAST_RETIREMENT_NOTE,
  },
  {
    family: 'ivd',
    version: '7.0',
    templateName: 'In Vitro Diagnostic (IVD) eSTAR Version 7.0',
    usedFor: '510(k), De Novo, and PMA medical device submissions for In Vitro Diagnostic devices',
    status: 'retiring',
    retirementDate: null,
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
    lastVerified: CHECKED_2026_10_05,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
    note: SUPERSEDED_NOTE,
  },
  {
    family: 'ivd',
    version: '7.1',
    templateName: 'In Vitro Diagnostic (IVD) eSTAR Version 7.1',
    usedFor: '510(k), De Novo, and PMA medical device submissions for In Vitro Diagnostic devices',
    status: 'current',
    retirementDate: null,
    // OMB numbers carried forward from 7.0; not re-read for 7.1.
    ombNumbers: NIVD_IVD_OMB,
    supportedSubmissionTypes: NIVD_IVD_SUBMISSION_TYPES,
    lastVerified: CHECKED_2026_10_05,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
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
    lastVerified: RECORDED_2026_09_06,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
    note: PAST_RETIREMENT_NOTE,
  },
  {
    family: 'prestar',
    version: '3.0',
    templateName: 'Early Submission Requests eSTAR (PreSTAR2) Version 3.0',
    usedFor: 'Q-Submissions, IDEs, and 513(g) requests for information for Non-In Vitro and In Vitro Diagnostic devices',
    status: 'retiring',
    retirementDate: null,
    ombNumbers: PRESTAR_OMB,
    supportedSubmissionTypes: PRESTAR_SUBMISSION_TYPES,
    lastVerified: CHECKED_2026_10_05,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
    note: SUPERSEDED_NOTE,
  },
  {
    family: 'prestar',
    version: '3.1',
    templateName: 'Early Submission Requests eSTAR (PreSTAR) Version 3.1',
    usedFor: 'Q-Submissions, IDEs, and 513(g) requests for information for Non-In Vitro and In Vitro Diagnostic devices',
    status: 'current',
    retirementDate: null,
    // OMB numbers carried forward from 3.0; not re-read for 3.1.
    ombNumbers: PRESTAR_OMB,
    supportedSubmissionTypes: PRESTAR_SUBMISSION_TYPES,
    lastVerified: CHECKED_2026_10_05,
    sourceUrl: ESTAR_PROGRAM_URL,
    confidence: 'recall',
  },
];

/** Human-readable label for each family. */
export const ESTAR_FAMILY_LABELS: Record<EstarTemplateFamily, string> = {
  nivd: 'Non-In Vitro Diagnostic (nIVD) eSTAR',
  ivd: 'In Vitro Diagnostic (IVD) eSTAR',
  prestar: 'Early Submission Requests eSTAR (PreSTAR2)',
};

// ─── Query functions ──────────────────────────────────────────────────────────

/** All version records for a family, in table order (oldest first, current last). */
export function versionsForFamily(family: EstarTemplateFamily): EstarVersionRecord[] {
  return ESTAR_VERSIONS.filter((v) => v.family === family);
}

/** The current (updated) version record for a family, or undefined if none. */
export function currentVersionFor(family: EstarTemplateFamily): EstarVersionRecord | undefined {
  return ESTAR_VERSIONS.find((v) => v.family === family && v.status === 'current');
}

/**
 * The most recent retiring (prior) version for a family — the one a sponsor is
 * most likely still holding — or undefined if none.
 */
export function retiringVersionFor(family: EstarTemplateFamily): EstarVersionRecord | undefined {
  const retiring = ESTAR_VERSIONS.filter((v) => v.family === family && v.status === 'retiring');
  return retiring[retiring.length - 1];
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
 *   - `retiring-date-unverified` → a retiring version with no read retirement date
 *
 * On the retirement date itself the version is treated as retired (FDA's stated
 * behaviour: retired versions are still accepted but draw version-delta IRs).
 */
export function versionLifecycleAsOf(
  record: EstarVersionRecord,
  asOf: string | Date,
): EstarVersionLifecycle {
  if (record.status === 'current') return 'current';
  // A superseded version with no read date is not current, and not guessed retired.
  if (record.retirementDate === null) return 'retiring-date-unverified';
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

// ─── Table currency ───────────────────────────────────────────────────────────

/**
 * Days since the table was last verified, as of `asOf` (YYYY-MM-DD): the age of
 * its OLDEST row, computed by the currency registry's `verificationAgeDays`.
 * Null when a date cannot be read — never zero.
 */
export function versionTableAgeDays(asOf: string): number | null {
  return verificationAgeDays(tableVerification(), asOf);
}

/**
 * True when the table is older than `maxAgeDays` (default: the currency
 * registry's VERIFICATION_MAX_AGE_DAYS), or its age cannot be computed.
 */
export function isVersionTableStale(asOf: string, maxAgeDays?: number): boolean {
  return isVerificationStale(tableVerification(), asOf, maxAgeDays);
}

/**
 * The currency registry's ageing functions read only `lastVerified`; the table
 * presents its oldest row's date in that shape so the arithmetic is reused, not
 * restated.
 */
function tableVerification(): RegulatoryFact {
  const oldest = ESTAR_VERSIONS.map((v) => v.lastVerified).sort()[0] ?? '';
  return { lastVerified: oldest } as RegulatoryFact;
}

// ─── Template version currency ────────────────────────────────────────────────

export interface TemplateVersionCurrency {
  /** The version of the official template on file, or null when none is pinned. */
  vendoredVersion: string | null;
  /** FDA's current version for the family, or null when the table has none. */
  currentVersion: string | null;
  /** True only when both are known and equal. */
  current: boolean;
  /** The sentence a reader acts on when `current` is false; null otherwise. */
  blocker: string | null;
}

/**
 * Is the official template on file FDA's current eSTAR for this family?
 *
 * The one comparison every reader uses (filing readiness, the template
 * registry). Fails closed: an absent, empty or `'unset'` vendored version is
 * not current, and neither is a family the table has no current row for.
 */
export function templateVersionCurrency(
  family: EstarTemplateFamily,
  vendoredVersion: string | null | undefined,
): TemplateVersionCurrency {
  const currentVersion = currentVersionFor(family)?.version ?? null;
  const pinned = vendoredVersion && vendoredVersion !== 'unset' ? vendoredVersion : null;
  const current = pinned !== null && currentVersion !== null && pinned === currentVersion;
  let blocker: string | null = null;
  if (!current) {
    const fda = currentVersion ? `FDA's current version is v${currentVersion}` : "FDA's current version is not recorded";
    blocker = pinned
      ? `Official template on file is eSTAR v${pinned}; ${fda}.`
      : `No official ${ESTAR_FAMILY_LABELS[family]} template version is pinned on file; ${fda}.`;
  }
  return { vendoredVersion: pinned, currentVersion, current, blocker };
}

export default {
  ESTAR_VERSIONS,
  ESTAR_PROGRAM_URL,
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
  versionTableAgeDays,
  isVersionTableStale,
  templateVersionCurrency,
};
