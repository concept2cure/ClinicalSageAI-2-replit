/**
 * Audit trail integrity attestation — what this organisation's two audit
 * stores hold, and what each integrity check found when the report was run.
 *
 * Each verdict is one of 'intact', 'broken' or 'not verified'. A check that did
 * not run, or ran over nothing it could verify, is 'not verified' with the
 * reason — never 'intact' (server/lib/verification-outcome.ts). The checks are
 * the platform's own, not re-implementations:
 *   (a) the audit_logs hash chain: the tenant chain walk every export states
 *       (audited-export.ts walkTenantChain), its break already redacted to what
 *       this organisation may read;
 *   (b) the audit_events linkage: signedAuditExport.ts snapshotChainIntegrity;
 *   (c) the audit_logs HMAC seals: chain.ts verifyAuditChainSeals for this
 *       tenant on the admin-scope connection the chain walk uses
 *       (compliance-reports/integrity-checks.ts).
 *
 * It also names the latest signed audit-trail review on or before the end of
 * the period, and says when it is overdue (P1-25, Annex 11 §9; the record is
 * services/audit/compliance-reviews.ts, the section queries/review-record.ts).
 *
 * @module server/services/audit/compliance-reports/queries/audit-trail-integrity
 */
import { NO_CHAINED_ROWS_REASON } from '../../audited-export';
import type {
  ChainSummary,
  LinkageSnapshot,
  ReportDefinition,
  RunContext,
  SealCheck,
  SectionResult,
  TenantChainWalk,
} from '../types';
import { reviewSection, reviewSectionDef } from './review-record';
import { columns, isoNaiveUtc, isoUtc, naiveAsUtc, naiveUtcNote, utcWallClock } from './section';

type Verdict = 'intact' | 'broken' | 'not verified';
type VerdictRow = {
  check: string;
  store: string;
  verdict: Verdict;
  rows_checked: number | null;
  detail: string;
};

const LOG_AT = `COALESCE(a.occurred_at, ${naiveAsUtc('a.created_at')})`;
const EVENT_AT = 'COALESCE(e.timestamp, e.created_at)';

/* $1 organisation, $2 period start, $3 period end (exclusive). One row each. */
const AUDIT_LOGS_STORE_SQL = `
SELECT 'audit_logs' AS store,
       count(*)::int AS rows_total,
       count(*) FILTER (WHERE a.sha256_chain IS NOT NULL)::int AS hashed,
       count(*) FILTER (WHERE a.sha256_chain IS NOT NULL AND a.chain_seq IS NULL)::int AS legacy,
       count(*) FILTER (WHERE a.hmac_seal IS NOT NULL)::int AS sealed,
       ${isoUtc(`min(${LOG_AT})`)} AS first_at,
       ${isoUtc(`max(${LOG_AT})`)} AS last_at,
       count(*) FILTER (WHERE ${LOG_AT} >= $2::timestamptz AND ${LOG_AT} < $3::timestamptz)::int AS in_period
  FROM audit_logs a
 WHERE a.tenant_id = $1`;

const AUDIT_EVENTS_STORE_SQL = `
SELECT 'audit_events' AS store,
       count(*)::int AS rows_total,
       count(*) FILTER (WHERE e.record_hash IS NOT NULL)::int AS hashed,
       NULL::int AS legacy,
       count(*) FILTER (WHERE e.hmac_seal IS NOT NULL)::int AS sealed,
       ${isoNaiveUtc(`min(${EVENT_AT})`)} AS first_at,
       ${isoNaiveUtc(`max(${EVENT_AT})`)} AS last_at,
       count(*) FILTER (WHERE ${EVENT_AT} >= ${utcWallClock(2)} AND ${EVENT_AT} < ${utcWallClock(3)})::int AS in_period
  FROM audit_events e
 WHERE e.organization_id = $1`;

/**
 * Where the chain broke. The walk's first break as JSON (its break already
 * redacted by walkTenantChain); when the anchored head is what broke, the
 * head's own words and its breaks, this organisation's only (fix round DP-71,
 * 2026-10-01: a head break used to print "null").
 */
function brokenDetail(walk: TenantChainWalk): string {
  const head = walk.head;
  if (head?.status !== 'broken') return JSON.stringify(walk.brokenAt ?? null);
  const headWords = `${head.reason}: ${JSON.stringify(head.breaks)}`;
  return walk.brokenAt == null ? headWords : `${JSON.stringify(walk.brokenAt)}; ${headWords}`;
}

function chainVerdict(walk: TenantChainWalk | undefined): VerdictRow {
  const base = { check: 'audit_logs hash chain', store: 'audit_logs', rows_checked: walk?.rowsChecked ?? null };
  if (!walk) return { ...base, verdict: 'not verified', detail: 'The chain walk did not run.' };
  // A walk over nothing checked nothing: never 'intact' (review round 1).
  if (walk.ok === true && walk.rowsChecked === 0) {
    return { ...base, verdict: 'not verified', rows_checked: 0, detail: NO_CHAINED_ROWS_REASON };
  }
  if (walk.ok === true) {
    // What was done about the newest rows, which the walk cannot see removed:
    // verified against the latest anchor, or "head not verified against the anchor".
    const head = walk.head ? `; ${walk.head.reason}` : '';
    return { ...base, verdict: 'intact', detail: `Every chained row re-derives from its predecessor${head}.` };
  }
  if (walk.ok === false) {
    return { ...base, verdict: 'broken', detail: brokenDetail(walk) };
  }
  return {
    ...base,
    verdict: 'not verified',
    rows_checked: walk.rowsChecked ?? null,
    detail: walk.reason ?? 'The chain walk did not run.',
  };
}

function linkageVerdict(s: LinkageSnapshot): VerdictRow {
  const base = { check: 'audit_events linkage', store: 'audit_events', rows_checked: s.hashedEntries ?? null };
  switch (s.status) {
    case 'intact':
      return { ...base, verdict: 'intact', detail: `Every one of ${s.totalEntries} rows carries a hash linked to its predecessor.` };
    case 'broken':
      return { ...base, verdict: 'broken', detail: `${s.brokenLinks} link(s) do not match their predecessor.` };
    case 'unverified':
      return { ...base, verdict: 'not verified', detail: `Nothing could be verified: ${s.reason ?? 'no hashed rows'}.` };
    default:
      // The query did not run. Its failure text is for the operator's log, not the report.
      return { ...base, verdict: 'not verified', rows_checked: null, detail: 'The linkage check could not be run when this report was generated.' };
  }
}

function sealVerdict(c: SealCheck): VerdictRow {
  const base = { check: 'audit_logs HMAC seals', store: 'audit_logs' };
  if (!c.ran) return { ...base, verdict: 'not verified', rows_checked: null, detail: c.reason };
  if (c.sealedRows === 0) {
    return { ...base, verdict: 'not verified', rows_checked: 0, detail: "No row in this organisation's audit_logs carries a seal, so no seal was checked." };
  }
  if (c.valid) return { ...base, verdict: 'intact', rows_checked: c.sealedRows, detail: `All ${c.sealedRows} sealed rows verify.` };
  const at = c.brokenAt == null ? '' : ` The first failure is sealed row ${c.brokenAt + 1} in write order.`;
  return { ...base, verdict: 'broken', rows_checked: c.sealedRows, detail: `A seal does not verify.${at}` };
}

/**
 * The chain statement of the attestation (data.chain, manifest.chainAtGeneration):
 * ok only when every check is intact, false when any is broken, otherwise null
 * with how many could not verify.
 */
export function summarizeIntegrityChecks(rows: Record<string, unknown>[], walk: TenantChainWalk | undefined): ChainSummary {
  const total = rows.length;
  const intact = rows.filter((r) => r.verdict === 'intact').length;
  const broken = rows.filter((r) => r.verdict === 'broken').length;
  const checks = { total, intact, broken, notVerified: total - intact - broken };
  const size = walk?.rowsChecked != null ? { rowsChecked: walk.rowsChecked } : {};
  if (broken > 0) {
    return {
      ok: false,
      scope: 'integrity-checks',
      ...size,
      reason: `${broken} of ${total} checks found a break; the integrity checks section shows where.`,
      checks,
    };
  }
  if (total > 0 && intact === total) return { ok: true, scope: 'integrity-checks', ...size, checks };
  return { ok: null, scope: 'integrity-checks', ...size, reason: `${checks.notVerified} of ${total} checks could not verify.`, checks };
}

async function run(ctx: RunContext): Promise<Record<string, SectionResult>> {
  const params = [ctx.orgId, ctx.bounds.start, ctx.bounds.end];
  const logs = await ctx.client.query(AUDIT_LOGS_STORE_SQL, params);
  const events = await ctx.client.query(AUDIT_EVENTS_STORE_SQL, params);
  const linkage = await ctx.checks.auditEventsLinkage(ctx.client, ctx.orgId);
  const seals = await ctx.checks.auditLogsSeals(ctx.orgId);
  return {
    stores: {
      rows: [...logs.rows, ...events.rows],
      truncated: false,
      notes: [naiveUtcNote('audit_events times')],
    },
    verdicts: {
      rows: [chainVerdict(ctx.chain), linkageVerdict(linkage), sealVerdict(seals)],
      truncated: false,
      notes: ['Each check covers every row of its store for this organisation, not only the rows in the period.'],
    },
    review: await reviewSection(ctx, 'audit_trail'),
  };
}

export const auditTrailIntegrity: ReportDefinition = {
  id: 'audit-trail-integrity',
  title: 'Audit trail integrity attestation',
  purpose: "States what this organisation's audit stores hold and what each integrity check found at the time of the report, saying so plainly when a check could not be run, and names the latest signed audit trail review.",
  basis: ['21 CFR 11.10(e)', 'EU GMP Annex 11 §9', 'PMDA ER/ES guideline (authenticity)'],
  period: 'range',
  walksChain: true,
  chainSummary: (results, walk) => summarizeIntegrityChecks(results.verdicts?.rows ?? [], walk),
  sections: [
    {
      key: 'stores',
      title: 'Audit stores',
      columns: columns([
        ['store', 'Store'],
        ['rows_total', 'Rows'],
        ['hashed', 'Hashed rows'],
        ['legacy', 'Legacy-chain rows'],
        ['sealed', 'Sealed rows'],
        ['first_at', 'First entry'],
        ['last_at', 'Last entry'],
        ['in_period', 'Rows in period'],
      ]),
    },
    {
      key: 'verdicts',
      title: 'Integrity checks',
      columns: columns([
        ['check', 'Check'],
        ['store', 'Store'],
        ['verdict', 'Verdict'],
        ['rows_checked', 'Rows checked'],
        ['detail', 'Detail'],
      ]),
    },
    reviewSectionDef('audit_trail'),
  ],
  notRecorded: [
    'Rows written before hashing was introduced carry no hash; they are counted, but no link through them can be checked.',
    'Rows written while the seal key was not configured carry no seal; the hash chain still covers them.',
  ],
  run,
};
