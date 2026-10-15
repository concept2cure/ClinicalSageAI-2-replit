/**
 * Sign-in and session events — every sign-in, second-factor, sign-out,
 * password and enrolment event this organisation's audit chain holds for the
 * period, and a count of each by outcome.
 *
 * The action names are the ones the writers store, verified at each writer:
 * routes/auth.ts and routes/authEnterprise.ts (recordAuthEvent →
 * auditService.logAction, `action` as given), routes/sso.ts (user_login), and
 * the organisation switch, which goes through auditLogger.logAuditEvent and is
 * stored as `<category>.<action>` = 'authorization.organization_switch'.
 * recordAuthEvent writes `outcome` / `reason` / `email` into new_values; the
 * organisation switch writes `success` instead of `outcome`.
 *
 * @module server/services/audit/compliance-reports/queries/authentication-events
 */
import type { ReportDefinition, RunContext, SectionResult } from '../types';
import { actorJoin, cappedSection, columns, isoUtc, naiveAsUtc } from './section';

export const AUTHENTICATION_ACTIONS: readonly string[] = [
  'user_login',
  'user_login_mfa_challenge',
  'user_login_mfa_failed',
  'user_logout',
  'user_password_reset_requested',
  'user_password_reset_failed',
  'user_password_changed',
  'user_mfa_setup',
  'user_mfa_enable',
  'user_mfa_disable',
  'user_signup',
  'email_verified',
  'authorization.organization_switch',
];

/** The outcome a row states: recordAuthEvent's `outcome`, or the audit logger's `success` flag. */
const OUTCOME_SQL = `COALESCE(a.new_values->>'outcome',
         CASE a.new_values->>'success' WHEN 'true' THEN 'success' WHEN 'false' THEN 'failure' END)`;

/** When the row was written: occurred_at, else the unzoned created_at read as UTC (queries/section.ts). */
const AT = `COALESCE(a.occurred_at, ${naiveAsUtc('a.created_at')})`;

/* $1 organisation, $2 the actions, $3 period start, $4 period end (exclusive). */
const EVENTS_SQL = `
SELECT ${isoUtc(AT)} AS occurred_at,
       a.action,
       ${OUTCOME_SQL} AS outcome,
       COALESCE(a.new_values->>'reason', a.reason) AS reason,
       COALESCE(a.actor_id, a.user_id) AS user_id,
       COALESCE(n.email, a.new_values->>'email') AS email,
       n.name,
       a.ip_address,
       a.user_agent,
       a.id AS audit_id,
       a.chain_seq
  FROM audit_logs a
  ${actorJoin('COALESCE(a.actor_id, a.user_id)', 'n')}
 WHERE a.tenant_id = $1
   AND a.action = ANY($2::text[])
   AND ${AT} >= $3::timestamptz
   AND ${AT} < $4::timestamptz
 ORDER BY ${AT}, a.chain_seq NULLS FIRST, a.id`;

const SUMMARY_SQL = `
SELECT a.action,
       COALESCE(${OUTCOME_SQL}, 'not stated') AS outcome,
       count(*)::int AS events
  FROM audit_logs a
 WHERE a.tenant_id = $1
   AND a.action = ANY($2::text[])
   AND ${AT} >= $3::timestamptz
   AND ${AT} < $4::timestamptz
 GROUP BY 1, 2
 ORDER BY 1, 2`;

async function run(ctx: RunContext): Promise<Record<string, SectionResult>> {
  const params = [ctx.orgId, AUTHENTICATION_ACTIONS, ctx.bounds.start, ctx.bounds.end];
  return {
    events: {
      ...(await cappedSection(ctx.client, EVENTS_SQL, params)),
      notes: ['Times are UTC.'],
    },
    summary: {
      ...(await cappedSection(ctx.client, SUMMARY_SQL, params)),
      notes: ['Counted over the whole period, including any events beyond the row limit of the events section.'],
    },
  };
}

export const authenticationEvents: ReportDefinition = {
  id: 'authentication-events',
  title: 'Sign-in and session events',
  purpose: 'Lists every sign-in, second-factor, sign-out, password and enrolment event recorded for this organisation in the period, with a count of each by outcome.',
  basis: [
    '21 CFR 11.10(d)',
    '21 CFR 11.10(e)',
    '21 CFR 11.300(d)',
    'HIPAA 45 CFR 164.312(b)',
    'HIPAA 45 CFR 164.312(d)',
    'EU GMP Annex 11 §12',
  ],
  period: 'range',
  sections: [
    {
      key: 'events',
      title: 'Events',
      columns: columns([
        ['occurred_at', 'Occurred'],
        ['action', 'Event'],
        ['outcome', 'Outcome'],
        ['reason', 'Reason'],
        ['user_id', 'User id'],
        ['email', 'Email'],
        ['name', 'Name'],
        ['ip_address', 'IP address'],
        ['user_agent', 'Client'],
        ['audit_id', 'Audit record'],
        ['chain_seq', 'Chain position'],
      ]),
    },
    {
      key: 'summary',
      title: 'Summary by event and outcome',
      columns: columns([
        ['action', 'Event'],
        ['outcome', 'Outcome'],
        ['events', 'Events'],
      ]),
    },
  ],
  notRecorded: [
    'Sessions that end by idle timeout, by reaching their absolute lifetime or by being replaced by a newer session are not recorded.',
    'A refused session refresh is not recorded.',
    'A wrong current password entered while changing a password is not recorded.',
    'Use of a recovery code is recorded as a second-factor verification, not separately.',
    'A successful resend of the emailed sign-in code is not recorded; a refused resend is.',
    'Sign-in attempts against an address with no account are recorded outside any organisation, so they do not appear here.',
  ],
  run,
};
