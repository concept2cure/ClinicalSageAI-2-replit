/**
 * Record the application number a market's own agency assigned, on that
 * market's submission (decision P-44, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * A project's recorded number is its home market's. A submission for another
 * market (an added market, FILING_SPINE F22) packages under the number recorded
 * here, and until one is recorded its packages refuse by name
 * (package-identity.ts readSubmissionPackageIdentity). This is the one act that
 * writes it:
 *   - the project's lead or an organization manager (the anchor's gate,
 *     canMutateProgram), with a stated reason;
 *   - the existing identifier rules: usableIdentifier, and the FDA six-digit
 *     rule when the market is the US;
 *   - in one transaction, the column and a chained audit row naming the old
 *     and the new value. An unchanged number writes nothing.
 * Refused by name: another organization's submission (NOT_FOUND), a submission
 * with no project (UNANCHORED_SUBMISSION), a home-market submission, whose
 * number is the project's (INVALID_STATE), an unusable number (VALIDATION),
 * and a change to a number a frozen or dispatched sequence of this submission
 * was built under (INVALID_STATE). Unrecognized market/home-agency records
 * are refused rather than guessed to be the home market.
 * The audit row carries the project id, so the project's activity feed shows it.
 *
 * @module server/services/submission-service/market-application-number
 */
import { pool } from '../../db';
import { writeChainedAuditRow } from '../auditService';
import { canMutateProgram } from '../c2c/program-access';
import { isHomeMarket, readSubmissionPackageIdentity, type PackageIdentityQueryable } from '../ectd/package-identity';
import { fdaIdentifierProblems, usableIdentifier } from '../ectd/regulatory-identifiers';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import { SubmissionError, getSubmission } from './submission-service';

export interface MarketNumberContext { organizationId: number; userId: number; orgRole: string | null }

export interface MarketNumberRecorded {
  submissionId: number;
  /** The market's canonical region ('EU', 'JP', 'US', …). */
  market: string;
  applicationNumber: string;
  previous: string | null;
  changed: boolean;
}

/** Read the market and authority after locking the submission, then its project. */
async function marketOf(
  submission: { programId: string | null; primaryRegion: string },
  ctx: MarketNumberContext,
  client: PackageIdentityQueryable,
): Promise<{ market: string; programId: string }> {
  if (!submission.programId) {
    throw new SubmissionError('UNANCHORED_SUBMISSION',
      'This submission is not anchored to a project, so it has no market of a project to number. Anchor it first. Nothing was changed.');
  }
  const program = (await client.query(
    `SELECT primary_agency, lead_user_id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR SHARE`,
    [submission.programId, ctx.organizationId],
  )).rows[0] as { primary_agency?: unknown; lead_user_id?: unknown } | undefined;
  if (!program) throw new SubmissionError('NOT_FOUND', 'Project not found for this organization. Nothing was changed.');
  const leadUserId = program.lead_user_id == null ? null : Number(program.lead_user_id);
  if (!canMutateProgram({ actor: { userId: ctx.userId, orgRole: ctx.orgRole }, program: { leadUserId } })) {
    throw new SubmissionError('FORBIDDEN',
      "Only the project's lead or an organization manager can record a market's application number. Nothing was changed.");
  }
  const market = canonicalRegionOf(submission.primaryRegion);
  if (!market) {
    throw new SubmissionError('INVALID_STATE',
      "This submission's market is not recognized. Correct its primary region before recording an application number. Nothing was changed.");
  }
  if (!canonicalRegionOf(typeof program.primary_agency === 'string' ? program.primary_agency : null)) {
    throw new SubmissionError('INVALID_STATE',
      "The project's primary agency is not recognized. Correct it before recording a market's application number. Nothing was changed.");
  }
  if (isHomeMarket(submission.primaryRegion, program.primary_agency)) {
    throw new SubmissionError('INVALID_STATE',
      `This submission is the project's home market (${String(program.primary_agency)}), so its application number is the ` +
      "project's, recorded on the project. A number is recorded on a submission only for another market (P-44). Nothing was changed.");
  }
  return { market, programId: submission.programId };
}

/** The number as the market's agency holds it, or the refusal that names why not. */
function usableMarketNumber(raw: string, market: string): string {
  const number = usableIdentifier('applicationNumber', raw);
  if (!number) {
    throw new SubmissionError('VALIDATION',
      'That is not a usable application number: it starts with a letter or digit and holds only letters, digits, ".", "_" ' +
      'or "-", up to 64. A slash is not accepted yet. Nothing was changed.');
  }
  // Only the number's own rule: the sponsor's DUNS and contact are the project's,
  // judged where a package is built.
  const problem = market === 'US'
    ? fdaIdentifierProblems({ applicationNumber: number }).find((p) => p.fields.includes('applicationNumber'))
    : undefined;
  if (problem) throw new SubmissionError('VALIDATION', `${problem.message} Nothing was changed.`);
  return number;
}

/** A frozen or dispatched sequence of the submission, which fixes its number; null when none. */
async function fixingSequence(client: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }, submissionId: number, organizationId: number): Promise<string | null> {
  const row = (await client.query(
    `SELECT sequence_number FROM ectd_sequences
      WHERE submission_id = $1 AND organization_id = $2 AND deleted_at IS NULL
        AND (status IN ('frozen', 'dispatched') OR frozen_at IS NOT NULL OR dispatch_status IS NOT NULL)
      ORDER BY sequence_number LIMIT 1`,
    [submissionId, organizationId],
  )).rows[0] as { sequence_number?: string } | undefined;
  return row?.sequence_number ?? null;
}

export async function recordMarketApplicationNumber(
  input: { submissionId: number; applicationNumber: string; reason: string; ipAddress?: string | null; userAgent?: string | null },
  ctx: MarketNumberContext,
): Promise<MarketNumberRecorded> {
  await getSubmission(input.submissionId, ctx);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      `SELECT program_id, primary_region, to_jsonb(s)->>'application_number' AS previous FROM submissions s
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [input.submissionId, ctx.organizationId],
    )).rows[0] as { program_id: string | null; primary_region: string; previous?: string | null } | undefined;
    if (!row) throw new SubmissionError('NOT_FOUND', 'Submission not found for this organization.');
    const { market, programId } = await marketOf({ programId: row.program_id, primaryRegion: row.primary_region }, ctx, client);
    const number = usableMarketNumber(input.applicationNumber, market);
    const previous = row.previous ?? null;
    if (previous === number) {
      await client.query('COMMIT');
      return { submissionId: input.submissionId, market, applicationNumber: number, previous, changed: false };
    }
    const fixed = previous === null ? null : await fixingSequence(client, input.submissionId, ctx.organizationId);
    if (fixed) {
      throw new SubmissionError('INVALID_STATE',
        `Sequence ${fixed} of this market is frozen or dispatched under ${previous}, so that number is not changed here. ` +
        'Nothing was changed.');
    }
    await client.query(
      `UPDATE submissions SET application_number = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [number, input.submissionId, ctx.organizationId],
    );
    await writeChainedAuditRow(client, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'SUBMISSION_APPLICATION_NUMBER_RECORDED',
      resourceType: 'submission',
      resourceId: input.submissionId,
      reason: input.reason,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
      details: { market, previous, applicationNumber: number, programId, reason: input.reason },
    });
    await client.query('COMMIT');
    return { submissionId: input.submissionId, market, applicationNumber: number, previous, changed: true };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* the failure below is the one to report */ }
    throw err;
  } finally {
    client.release();
  }
}

/** What a market's row says about its application number (GET /:id/application-number). */
export interface MarketNumberRead {
  submissionId: number;
  /** The project's home market: its number is the project's, recorded on the project. */
  home: boolean;
  /** The market's canonical region when it is not the home market. */
  market: string | null;
  /** The project's primary agency, which names its home market. */
  homeAgency: string | null;
  /** The number its packages carry: the project's for the home market, else the submission's own, or null. */
  applicationNumber: string | null;
  /** Ownership could not be resolved; no number may be recorded until corrected. */
  unresolvedReason: string | null;
  /** Who recorded the market's number, when and why (the newest audit row); null when none is on record. */
  lastRecorded: { by: string | null; at: string; reason: string | null } | null;
}

/** The newest recording of the market's number, from the audit trail. */
async function lastRecording(organizationId: number, submissionId: number): Promise<MarketNumberRead['lastRecorded']> {
  const row = (await pool.query(
    `SELECT COALESCE(u.name, u.email) AS by, al.occurred_at AS at, al.reason
       FROM audit_logs al
       LEFT JOIN LATERAL public.actor_name(COALESCE(al.actor_id, al.user_id)) u ON TRUE
      WHERE al.tenant_id = $1 AND al.table_name = 'submission' AND al.record_id = $2
        AND al.action = 'SUBMISSION_APPLICATION_NUMBER_RECORDED'
      ORDER BY al.occurred_at DESC LIMIT 1`,
    [organizationId, String(submissionId)],
  )).rows[0] as { by?: string | null; at?: string | Date; reason?: string | null } | undefined;
  if (!row?.at) return null;
  return { by: row.by ?? null, at: new Date(row.at).toISOString(), reason: row.reason ?? null };
}

/** Read through the reader every package uses, so the row says what the package will carry. */
export async function readMarketApplicationNumber(submissionId: number, ctx: { organizationId: number }): Promise<MarketNumberRead> {
  await getSubmission(submissionId, ctx);
  const identity = await readSubmissionPackageIdentity(pool, ctx.organizationId, submissionId);
  return {
    submissionId,
    home: !identity.market && !identity.marketResolutionProblem,
    market: identity.market?.region ?? null,
    homeAgency: identity.homeAgency ?? null,
    applicationNumber: identity.applicationNumber,
    unresolvedReason: identity.marketResolutionProblem ?? null,
    lastRecorded: identity.market && !identity.marketResolutionProblem ? await lastRecording(ctx.organizationId, submissionId) : null,
  };
}
