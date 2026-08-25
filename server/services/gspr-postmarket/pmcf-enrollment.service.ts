/**
 * PMCF enrolment — the EU MDR Annex XIV Part B §6.2 / MDCG 2020-7 execution
 * evidence behind a CER's post-market section.
 *
 * This is the SINGLE PMCF enrolment path (ZERO DUPLICATION). It is consumed by
 *
 *   GET  /api/post-market/programs/:programId/pmcf-enrollment   (read)
 *   POST /api/post-market/programs/:programId/pmcf-enrollment   (write)
 *
 * in server/routes/gspr-postmarket.ts, and by nothing else.
 *
 * Table: pmcf_enrollment_records
 * (migrations/20260814c_pmcf_enrollment_records.sql — that file's header carries
 * the full design rationale; the short version is below.)
 *
 * It is the sibling of post-market.service.ts, not a replacement for it: that
 * service owns the PMCF *plan* (a versioned, approvable, lockable document);
 * this one owns what actually happened against the plan. `pmcfPlanDocumentId`
 * is the link, so the CER can report plan-vs-actual.
 *
 * Contract decisions, in doctrine order:
 *
 *   FAIL CLOSED     A missing table is a typed refusal naming the unapplied
 *                   migration, never a swallowed empty list — "no PMCF
 *                   activities" and "the store does not exist" are different
 *                   facts and only one of them is safe to show a notified body.
 *
 *   NEVER FABRICATE Three things this module will not do:
 *                     · invent a target — `targetEnrollment` null means no
 *                       planned sample size is set, and no ratio is computed
 *                       for that activity;
 *                     · conflate never-reported with reported-zero —
 *                       `enrolledCount` null is ABSENT from every aggregate,
 *                       and the summary reports how many activities are in that
 *                       state so the gap is visible rather than averaged away;
 *                     · compute a trend. Enrolment velocity needs at least two
 *                       dated observations of the same activity; the current
 *                       state carries one. The summary therefore has no trend
 *                       field at all, rather than a zero pretending to be one.
 *
 *   TENANCY         Every statement filters organization_id AND joins
 *                   regulatory_programs on the same org, matching the
 *                   post-market / q-sub / capa-mdr pattern. The org always
 *                   comes from the authenticated request, never from a payload.
 *
 *   PART 11         This module persists CURRENT state. The immutable
 *                   before/after trail is written by the route through
 *                   `auditService.logAction` — the sanctioned chained + sealed
 *                   writer (docs/AUDIT_STORE_INVENTORY_2026-08.md §2) — which
 *                   is why `upsertPmcfEnrollmentRecord` returns the SUPERSEDED
 *                   row alongside the new one. Nothing here hand-rolls an audit
 *                   INSERT.
 */

import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import {
  pmcfEnrollmentRecords,
  PMCF_ACTIVITY_KINDS,
  PMCF_ACTIVITY_STATUSES,
  type PmcfActivityKind,
  type PmcfActivityStatus,
  type PmcfEnrollmentRecord,
} from '../../../shared/schema/gspr-postmarket';

export { PMCF_ACTIVITY_KINDS, PMCF_ACTIVITY_STATUSES };
export type { PmcfActivityKind, PmcfActivityStatus, PmcfEnrollmentRecord };

/* ─── Refusals ───────────────────────────────────────────────────────────── */

/**
 * A refusal the caller can answer honestly with. Carries a machine code so the
 * route maps it to a status without string-matching a message.
 */
export class PmcfEnrollmentRefusal extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 422) {
    super(message);
    this.name = 'PmcfEnrollmentRefusal';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Postgres "relation does not exist". */
const PG_UNDEFINED_TABLE = '42P01';

const pgCode = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  // Drizzle wraps the driver error; the pg code hides one level down.
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === 'object' && cause !== null) {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === 'string') return nested;
  }
  return undefined;
};

/** True when the failure is "the PMCF enrolment migration has not been applied". */
export function isPmcfEnrollmentStoreAbsent(err: unknown): boolean {
  return pgCode(err) === PG_UNDEFINED_TABLE;
}

export const STORE_ABSENT =
  'the PMCF enrolment store is not present on this database — ' +
  'migrations/20260814c_pmcf_enrollment_records.sql has not been applied';

export const PROGRAM_NOT_IN_ORG =
  'that programme is not visible to this organization, so PMCF activities cannot be read or ' +
  'recorded against it';

/** Rethrow a driver error as the refusal that names what is actually wrong. */
function rethrow(err: unknown): never {
  if (isPmcfEnrollmentStoreAbsent(err)) {
    throw new PmcfEnrollmentRefusal('PMCF_STORE_ABSENT', STORE_ABSENT);
  }
  throw err;
}

/* ─── Tenant guard ───────────────────────────────────────────────────────── */

/**
 * One roundtrip to confirm the programme belongs to the org. Every public
 * function calls this first; nothing below trusts a programId from a payload.
 */
async function assertProgramInOrg(organizationId: number, programId: string): Promise<void> {
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(
      and(
        eq(regulatoryPrograms.id, programId),
        eq(regulatoryPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new PmcfEnrollmentRefusal('PMCF_PROGRAM_NOT_IN_ORG', PROGRAM_NOT_IN_ORG, 404);
  }
}

/* ─── Read ───────────────────────────────────────────────────────────────── */

/**
 * Every PMCF activity recorded for one programme, ordered by activity code.
 *
 * The join back to regulatory_programs is the SECOND org filter (the first is
 * on the record itself): a mis-keyed row can never surface another tenant's
 * follow-up programme.
 */
export async function listPmcfEnrollmentRecords(
  organizationId: number,
  programId: string,
): Promise<PmcfEnrollmentRecord[]> {
  await assertProgramInOrg(organizationId, programId);
  try {
    const rows = await db
      .select({ row: pmcfEnrollmentRecords })
      .from(pmcfEnrollmentRecords)
      .innerJoin(
        regulatoryPrograms,
        and(
          eq(regulatoryPrograms.id, pmcfEnrollmentRecords.programId),
          eq(regulatoryPrograms.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(pmcfEnrollmentRecords.organizationId, organizationId),
          eq(pmcfEnrollmentRecords.programId, programId),
        ),
      )
      .orderBy(asc(pmcfEnrollmentRecords.activityCode));
    return rows.map(r => r.row);
  } catch (err) {
    rethrow(err);
  }
}

/**
 * What the CER's post-market section can honestly say about PMCF execution.
 *
 * Read the field names literally — each one is scoped to exactly the subset it
 * was computed over, because that is the difference between evidence and a
 * number:
 *
 *   activityCount            every activity recorded, whatever its state
 *   reportingActivityCount   activities with a dated enrolment report
 *   notReportedActivityCount activities where enrolment has NEVER been reported
 *   enrolledInReporting      sum of enrolled subjects ACROSS THE REPORTING ONES
 *   targetInReporting        sum of planned sample size across the reporting
 *                            ones that also have a target
 *   ratioBasisActivityCount  how many activities that ratio was computed over
 *   oldestReportAsOf /
 *   latestReportAsOf         the window the counts describe
 *
 * `enrolledInReporting / targetInReporting` is deliberately NOT returned as a
 * percentage here. The caller renders it next to `ratioBasisActivityCount` and
 * `activityCount` so a 92% computed over one of five activities cannot read as
 * 92% of the programme. When no activity has both a target and a report, both
 * sums are null — not 0, which would render as "0 enrolled of 0 planned" and
 * imply a verified-empty programme.
 */
export interface PmcfEnrollmentSummary {
  programId: string;
  activityCount: number;
  reportingActivityCount: number;
  notReportedActivityCount: number;
  byStatus: Record<PmcfActivityStatus, number>;
  /** Activities with no linked PMCF plan document — a reportable gap. */
  unlinkedToPlanCount: number;
  /** Null when nothing has been reported at all. */
  enrolledInReporting: number | null;
  /** Null when no reporting activity also carries a planned sample size. */
  targetInReporting: number | null;
  ratioBasisActivityCount: number;
  oldestReportAsOf: string | null;
  latestReportAsOf: string | null;
  generatedAt: string;
}

const EMPTY_BY_STATUS = (): Record<PmcfActivityStatus, number> => ({
  planned: 0,
  enrolling: 0,
  follow_up: 0,
  completed: 0,
  terminated: 0,
});

/**
 * Aggregate in the database rather than over a paged list: a client-side count
 * of a capped page silently under-reports, which is the same defect class as
 * fabricating one.
 */
export async function summarisePmcfEnrollment(
  organizationId: number,
  programId: string,
): Promise<PmcfEnrollmentSummary> {
  const rows = await listPmcfEnrollmentRecords(organizationId, programId);
  return summariseRecords(programId, rows);
}

/**
 * Pure aggregation over already-fetched rows — the read path fetches once and
 * summarises the same array it returns, so the table and the totals can never
 * disagree. Exported for direct testing.
 */
export function summariseRecords(
  programId: string,
  rows: PmcfEnrollmentRecord[],
): PmcfEnrollmentSummary {
  const byStatus = EMPTY_BY_STATUS();
  let reporting = 0;
  let notReported = 0;
  let unlinked = 0;
  let enrolledSum = 0;
  let targetSum = 0;
  let ratioBasis = 0;
  let oldest: Date | null = null;
  let latest: Date | null = null;

  for (const r of rows) {
    const status = r.status as PmcfActivityStatus;
    if (status in byStatus) byStatus[status] += 1;
    if (!r.pmcfPlanDocumentId) unlinked += 1;

    // null enrolledCount means NEVER reported. A reported 0 is a fact and
    // counts as reporting — the two must not collapse.
    if (r.enrolledCount === null || r.enrolledCount === undefined) {
      notReported += 1;
      continue;
    }

    reporting += 1;
    enrolledSum += r.enrolledCount;

    if (typeof r.targetEnrollment === 'number' && r.targetEnrollment > 0) {
      targetSum += r.targetEnrollment;
      ratioBasis += 1;
    }

    const asOf = r.enrollmentAsOf ? new Date(r.enrollmentAsOf) : null;
    if (asOf && !Number.isNaN(asOf.getTime())) {
      if (oldest === null || asOf < oldest) oldest = asOf;
      if (latest === null || asOf > latest) latest = asOf;
    }
  }

  return {
    programId,
    activityCount: rows.length,
    reportingActivityCount: reporting,
    notReportedActivityCount: notReported,
    byStatus,
    unlinkedToPlanCount: unlinked,
    // Null, not 0: "nothing reported" is not "zero enrolled".
    enrolledInReporting: reporting > 0 ? enrolledSum : null,
    // Null, not 0: a ratio with no denominator is not a ratio.
    targetInReporting: ratioBasis > 0 ? targetSum : null,
    ratioBasisActivityCount: ratioBasis,
    oldestReportAsOf: oldest ? oldest.toISOString() : null,
    latestReportAsOf: latest ? latest.toISOString() : null,
    generatedAt: new Date().toISOString(),
  };
}

/* ─── Write ──────────────────────────────────────────────────────────────── */

export interface UpsertPmcfEnrollmentInput {
  organizationId: number;
  programId: string;
  actorId: string;

  activityCode: string;
  activityKind: PmcfActivityKind;
  title: string;
  status?: PmcfActivityStatus;

  pmcfPlanDocumentId?: string | null;
  primaryEndpoint?: string | null;
  sitesCount?: number | null;

  /** Planned sample size. Omit or null for "not set"; 0 is rejected. */
  targetEnrollment?: number | null;
  /**
   * Subjects enrolled. Omit or null for "not reported". A number requires
   * `enrollmentAsOf` — an undated count is refused, not defaulted to now().
   */
  enrolledCount?: number | null;
  enrollmentAsOf?: Date | null;

  dataCollectionThrough?: Date | null;
  notes?: string | null;
}

export interface UpsertPmcfEnrollmentResult {
  record: PmcfEnrollmentRecord;
  /** The row as it stood before this write, or null on first record. */
  superseded: PmcfEnrollmentRecord | null;
  created: boolean;
}

const isBlank = (v: string | null | undefined): boolean =>
  typeof v !== 'string' || v.trim().length === 0;

/**
 * Validate the parts the database CHECKs also guard, so the caller gets a
 * sentence rather than a constraint name. Both layers are kept: the service
 * refusal is the readable one, the CHECK is the one that holds when someone
 * writes through psql.
 */
function validate(input: UpsertPmcfEnrollmentInput): void {
  if (isBlank(input.activityCode)) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_NO_CODE',
      'an activity code is required — it is how the PMCF plan and the CER refer to this activity',
    );
  }
  if (isBlank(input.title)) {
    throw new PmcfEnrollmentRefusal('PMCF_NO_TITLE', 'a title is required for the PMCF activity');
  }
  if (!PMCF_ACTIVITY_KINDS.includes(input.activityKind)) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_BAD_KIND',
      `activityKind must be one of: ${PMCF_ACTIVITY_KINDS.join(', ')} (MDCG 2020-7 §6)`,
    );
  }
  if (input.status !== undefined && !PMCF_ACTIVITY_STATUSES.includes(input.status)) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_BAD_STATUS',
      `status must be one of: ${PMCF_ACTIVITY_STATUSES.join(', ')}`,
    );
  }
  if (isBlank(input.actorId)) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_NO_ACTOR',
      'an attributable user is required — an unattributed PMCF progress report is not Part 11 evidence',
      403,
    );
  }

  const target = input.targetEnrollment;
  if (target !== undefined && target !== null) {
    if (!Number.isInteger(target) || target <= 0) {
      throw new PmcfEnrollmentRefusal(
        'PMCF_BAD_TARGET',
        'targetEnrollment must be a positive integer, or omitted entirely to mean "no planned ' +
          'sample size has been set" — 0 is not a target',
      );
    }
  }

  const enrolled = input.enrolledCount;
  const asOf = input.enrollmentAsOf;
  const hasEnrolled = enrolled !== undefined && enrolled !== null;
  const hasAsOf = asOf !== undefined && asOf !== null;

  if (hasEnrolled && (!Number.isInteger(enrolled) || (enrolled as number) < 0)) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_BAD_ENROLLED',
      'enrolledCount must be a non-negative integer, or omitted to mean "enrolment has not been reported"',
    );
  }
  if (hasEnrolled && !hasAsOf) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_NO_AS_OF',
      'an enrolment count must carry the date it was true on — an undated count is not Annex XIV ' +
        'Part B evidence, and this service will not stamp one for you',
    );
  }
  if (!hasEnrolled && hasAsOf) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_AS_OF_WITHOUT_COUNT',
      'enrollmentAsOf was supplied without an enrolment count — record the count, or omit both',
    );
  }
  if (hasAsOf && Number.isNaN((asOf as Date).getTime())) {
    throw new PmcfEnrollmentRefusal('PMCF_BAD_AS_OF', 'enrollmentAsOf must be a valid date');
  }
  if (
    input.sitesCount !== undefined &&
    input.sitesCount !== null &&
    (!Number.isInteger(input.sitesCount) || input.sitesCount < 0)
  ) {
    throw new PmcfEnrollmentRefusal(
      'PMCF_BAD_SITES',
      'sitesCount must be a non-negative integer, or omitted',
    );
  }
}

/**
 * Record (or re-record) one PMCF activity's enrolment state.
 *
 * Keyed on (organization, programme, activity code), so re-reporting the same
 * activity UPDATEs in place. The row it replaced is returned as `superseded` so
 * the route can put the before/after into the chained audit entry — this
 * service never writes to audit_logs itself.
 */
export async function upsertPmcfEnrollmentRecord(
  input: UpsertPmcfEnrollmentInput,
): Promise<UpsertPmcfEnrollmentResult> {
  validate(input);
  await assertProgramInOrg(input.organizationId, input.programId);

  const activityCode = input.activityCode.trim();
  const now = new Date();

  try {
    const [existing] = await db
      .select()
      .from(pmcfEnrollmentRecords)
      .where(
        and(
          eq(pmcfEnrollmentRecords.organizationId, input.organizationId),
          eq(pmcfEnrollmentRecords.programId, input.programId),
          eq(pmcfEnrollmentRecords.activityCode, activityCode),
        ),
      )
      .limit(1);

    const values = {
      organizationId: input.organizationId,
      programId: input.programId,
      pmcfPlanDocumentId: input.pmcfPlanDocumentId ?? null,
      activityCode,
      activityKind: input.activityKind,
      title: input.title.trim(),
      status: input.status ?? 'planned',
      primaryEndpoint: input.primaryEndpoint ?? null,
      sitesCount: input.sitesCount ?? null,
      targetEnrollment: input.targetEnrollment ?? null,
      enrolledCount: input.enrolledCount ?? null,
      enrollmentAsOf: input.enrollmentAsOf ?? null,
      dataCollectionThrough: input.dataCollectionThrough ?? null,
      notes: input.notes ?? null,
      updatedBy: input.actorId,
      updatedAt: now,
    };

    if (existing) {
      const [updated] = await db
        .update(pmcfEnrollmentRecords)
        .set(values)
        .where(eq(pmcfEnrollmentRecords.id, existing.id))
        .returning();
      return { record: updated, superseded: existing, created: false };
    }

    const [inserted] = await db
      .insert(pmcfEnrollmentRecords)
      .values({ ...values, createdBy: input.actorId, createdAt: now })
      .returning();
    return { record: inserted, superseded: null, created: true };
  } catch (err) {
    rethrow(err);
  }
}

/**
 * Count of PMCF activities across a whole organization, for callers that need
 * a cheap existence check rather than a programme's detail. Org-scoped like
 * everything else here.
 */
export async function countPmcfActivitiesForOrg(organizationId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pmcfEnrollmentRecords)
      .where(eq(pmcfEnrollmentRecords.organizationId, organizationId));
    return row?.n ?? 0;
  } catch (err) {
    rethrow(err);
  }
}
