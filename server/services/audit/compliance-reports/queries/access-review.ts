/**
 * User access review — who holds access to this organisation on the as-of
 * date, with what role and what second factor, and who among them is
 * privileged (the list POLICY-AC-002 §4a says a periodic review must decide on).
 *
 * Read from organization_users joined to users (a member's own row is readable
 * under the users membership policy, 20260928_users_membership_rls.sql) and
 * platform_role_grants. Last sign-in is read from this organisation's sign-in
 * audit rows only: users.last_login is stamped when the password alone is
 * accepted, before the second factor, so it is not reported.
 *
 * A role change or removal an administrator makes (routes/tenant-users.ts,
 * through services/tenant/membership-change.ts) writes a chained audit row
 * since P1-41 (2026-10-01); those rows are listed in the administrative
 * changes report, not reconstructed into this as-of list. A role change made
 * through a SCIM group (routes/scim.ts PATCH /Groups/:id) writes no row, and
 * notRecorded says so (pinned against that handler by review-round-1.test.ts).
 *
 * @module server/services/audit/compliance-reports/queries/access-review
 */
import type { ReportDefinition, RunContext, SectionResult } from '../types';
import { cappedSection, columns, isoNaiveUtc, isoUtc, naiveUtcNote, utcWallClock } from './section';

const MEMBER_COLUMNS = columns([
  ['user_id', 'User id'],
  ['name', 'Name'],
  ['email', 'Email'],
  ['org_role', 'Organisation role'],
  ['persona', 'Persona'],
  ['account_status', 'Account status'],
  ['mfa_posture', 'Second factor'],
  ['authenticator_enrolled_at', 'Authenticator enrolled'],
  ['recovery_codes_remaining', 'Recovery codes remaining'],
  ['locked_until', 'Locked until'],
  ['password_changed_at', 'Password last changed'],
  ['last_sign_in_at', 'Last successful sign-in'],
  ['member_since', 'Member since'],
  ['platform_roles', 'Platform roles'],
]);

/** The organisation roles a review must decide on (POLICY-AC-002 §4a), plus anyone with a platform role. */
export const PRIVILEGED_ORG_ROLES: readonly string[] = ['owner', 'admin', 'manager'];

/*
 * $1 organisation, $2 the end of the as-of day. Membership is as-of (joined by
 * then); role, persona, platform roles, account status, second factor and lock
 * are as they are now — none has a recorded history to read a past value from.
 * Unzoned times are UTC wall-clock time (queries/section.ts).
 */
const MEMBERS_SQL = `
SELECT ou.user_id,
       u.name,
       u.email,
       ou.role AS org_role,
       ou.persona,
       u.status AS account_status,
       CASE WHEN u.mfa_enabled AND u.mfa_method = 'totp' THEN 'authenticator_app' ELSE 'emailed_code' END AS mfa_posture,
       ${isoNaiveUtc('u.mfa_verified_at')} AS authenticator_enrolled_at,
       CASE WHEN json_typeof(u.mfa_backup_codes) = 'array' THEN json_array_length(u.mfa_backup_codes) END AS recovery_codes_remaining,
       ${isoNaiveUtc('u.locked_until')} AS locked_until,
       ${isoNaiveUtc('u.password_changed_at')} AS password_changed_at,
       ${isoUtc(`SELECT max(a.occurred_at)
          FROM audit_logs a
         WHERE a.tenant_id = $1
           AND a.actor_id = ou.user_id
           AND a.action = 'user_login'
           AND a.new_values->>'outcome' = 'success'
           AND a.occurred_at < $2::timestamptz`)} AS last_sign_in_at,
       ${isoNaiveUtc('ou.created_at')} AS member_since,
       (SELECT string_agg(g.role, ', ' ORDER BY g.role)
          FROM platform_role_grants g
         WHERE g.user_id = ou.user_id
           AND g.revoked_at IS NULL) AS platform_roles
  FROM organization_users ou
  JOIN users u ON u.id = ou.user_id
 WHERE ou.organization_id = $1
   AND ou.created_at < ${utcWallClock(2)}
 ORDER BY ou.role, u.email, ou.user_id`;

function isPrivileged(row: Record<string, unknown>): boolean {
  return PRIVILEGED_ORG_ROLES.includes(String(row.org_role ?? '').toLowerCase()) || Boolean(row.platform_roles);
}

async function run(ctx: RunContext): Promise<Record<string, SectionResult>> {
  const members = await cappedSection(ctx.client, MEMBERS_SQL, [ctx.orgId, ctx.bounds.end]);
  const currentState =
    'Organisation role, persona, platform roles, account status, second factor, recovery codes and lock are read as they are at generation time; none of them has a recorded history to read a past value from.';
  const times = naiveUtcNote('Membership, second-factor enrolment, lock and password-change times');
  return {
    members: { ...members, notes: [currentState, times] },
    privileged: {
      rows: members.rows.filter(isPrivileged),
      // Derived from the members list: incomplete exactly when that list is.
      truncated: members.truncated,
      notes: ['Owners, admins and managers of this organisation, and anyone holding a platform role.', currentState, times],
    },
  };
}

export const accessReview: ReportDefinition = {
  id: 'access-review',
  title: 'User access review',
  purpose: 'Lists everyone who holds access to this organisation on the chosen date, with their role, second factor and last sign-in, and separates the privileged accounts a periodic review must decide on.',
  basis: [
    '21 CFR 11.10(d)',
    '21 CFR 11.10(g)',
    'EU GMP Annex 11 §12',
    'HIPAA 45 CFR 164.308(a)(4)',
    'SOC 2 CC6.2–CC6.3',
    'POLICY-AC-002 §4a',
  ],
  period: 'as-of',
  sections: [
    { key: 'members', title: 'Members', columns: MEMBER_COLUMNS },
    { key: 'privileged', title: 'Privileged accounts', columns: MEMBER_COLUMNS },
  ],
  notRecorded: [
    'A member who was removed leaves no membership record, so removed members do not appear. A removal made by an administrator in the product or through SCIM provisioning is recorded and appears in the administrative changes report. Removals and role changes an administrator made before the product began recording them were not recorded.',
    "A member's role on a past date is not reconstructed: the role shown is the current one. A role change made by an administrator in the product is listed, with the role before and after, in the administrative changes report. A role change made through a SCIM group, which is how an identity provider assigns roles, is not recorded, so a role the identity provider assigned has no record of when it was assigned or what it replaced.",
    'This report records no review decision, reviewer or sign-off. POLICY-AC-002 §4a keeps those in the access-review record.',
    'The account sign-in timestamp is set when the password alone is accepted, before the second factor, so it is not reported; the last sign-in shown is read from successful sign-in audit records only.',
  ],
  run,
};
