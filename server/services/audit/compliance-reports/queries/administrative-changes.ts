/**
 * Administrative and privileged changes — the security-relevant changes an
 * administrator (or an automated provisioner) made to this organisation in the
 * period: API keys, invitations, second-factor changes, lifecycle overrides,
 * cross-tenant attempts, organisation profile and settings, and SCIM account
 * provisioning.
 *
 * Each action name is the one its writer stores, verified at the writer:
 *   api_key_created, api_key_revoked     routes/api-keys.ts (auditService.logAction)
 *   api_key_expired                      services/api-key-service.ts
 *   user_invited                         services/tenant/invitation-delivery.ts
 *   user_mfa_enable, user_mfa_disable    routes/auth.ts recordSecondFactorChange
 *   authorization.tenant_lifecycle_override
 *                                        middleware/tenantLifecycleGuard.ts — through
 *                                        auditLogger.logAuditEvent, which stores
 *                                        `<category>.<action>`
 *   tenant_impersonation_attempt         middleware/enterprise-security.ts
 *   data_modify on organization / organization_settings
 *                                        routes/organizations-routes.ts (orgAdminAction
 *                                        in new_values names the change)
 *   audit_events scim.user.*             routes/scim.ts auditScim
 *
 * Settings (verified 2026-10-01): routes/tenant-config.ts PATCH
 * /:tenantId/settings, PATCH /:tenantId/settings/:section and POST
 * /:tenantId/settings/reset write organizations.settings with no audit row;
 * routes/organizations-routes.ts PATCH /:id/settings records data_modify on
 * organization_settings with the section names only (`sections`), never values.
 *
 * @module server/services/audit/compliance-reports/queries/administrative-changes
 */
import type { ReportDefinition, RunContext, SectionResult } from '../types';
import { actorJoin, cappedSection, columns, isoUtc, naiveAsUtc, naiveUtcNote } from './section';

export const ADMINISTRATIVE_ACTIONS: readonly string[] = [
  'api_key_created',
  'api_key_revoked',
  'api_key_expired',
  'user_invited',
  'user_mfa_enable',
  'user_mfa_disable',
  'authorization.tenant_lifecycle_override',
  'tenant_impersonation_attempt',
];

const LOG_AT = `COALESCE(a.occurred_at, ${naiveAsUtc('a.created_at')})`;
const EVENT_AT = naiveAsUtc('COALESCE(e.timestamp, e.created_at)');

/*
 * $1 organisation, $2 the audit_logs actions, $3 period start, $4 period end
 * (exclusive). `at` is the instant both stores are ordered by; it is not a column.
 */
const CHANGES_SQL = `
SELECT u.source, u.occurred_at, u.action, u.sub_action, u.actor_user_id, u.actor_name, u.actor_email,
       u.target_type, u.target_id, u.detail, u.reason, u.ip_address
  FROM (
SELECT 'audit_logs' AS source,
       ${LOG_AT} AS at,
       ${isoUtc(LOG_AT)} AS occurred_at,
       a.action,
       COALESCE(a.new_values->>'orgAdminAction', a.new_values->>'outcome') AS sub_action,
       COALESCE(a.actor_id, a.user_id) AS actor_user_id,
       n.name AS actor_name,
       n.email AS actor_email,
       a.table_name AS target_type,
       a.record_id AS target_id,
       a.new_values::text AS detail,
       COALESCE(a.reason, a.new_values->>'reason') AS reason,
       a.ip_address
  FROM audit_logs a
  ${actorJoin('COALESCE(a.actor_id, a.user_id)', 'n')}
 WHERE a.tenant_id = $1
   AND (a.action = ANY($2::text[])
        OR (a.action = 'data_modify' AND a.table_name IN ('organization', 'organization_settings')))
   AND ${LOG_AT} >= $3::timestamptz
   AND ${LOG_AT} < $4::timestamptz
UNION ALL
SELECT 'audit_events' AS source,
       ${EVENT_AT} AS at,
       ${isoUtc(EVENT_AT)} AS occurred_at,
       e.event_type AS action,
       NULL AS sub_action,
       e.user_id AS actor_user_id,
       COALESCE(n.name, e.user_name) AS actor_name,
       n.email AS actor_email,
       e.entity_type AS target_type,
       e.entity_id::text AS target_id,
       e.metadata::text AS detail,
       e.reason,
       e.ip_address
  FROM audit_events e
  ${actorJoin('e.user_id', 'n')}
 WHERE e.organization_id = $1
   AND e.event_type LIKE 'scim.user.%'
   AND ${EVENT_AT} >= $3::timestamptz
   AND ${EVENT_AT} < $4::timestamptz
       ) u
 ORDER BY u.at, u.source, u.action`;

async function run(ctx: RunContext): Promise<Record<string, SectionResult>> {
  return {
    changes: {
      ...(await cappedSection(ctx.client, CHANGES_SQL, [ctx.orgId, ADMINISTRATIVE_ACTIONS, ctx.bounds.start, ctx.bounds.end])),
      notes: [naiveUtcNote('SCIM provisioning times')],
    },
  };
}

export const administrativeChanges: ReportDefinition = {
  id: 'administrative-changes',
  title: 'Administrative and privileged changes',
  purpose: 'Lists the security-relevant changes made to this organisation in the period: API keys, invitations, second-factor changes, lifecycle overrides, cross-organisation access attempts, organisation profile and settings, and SCIM account provisioning.',
  basis: ['21 CFR 11.10(d)', '21 CFR 11.10(e)', '21 CFR 11.10(g)', 'SOC 2 CC6.2', 'SOC 2 CC8.1', 'EU GMP Annex 11 §12'],
  period: 'range',
  sections: [
    {
      key: 'changes',
      title: 'Changes',
      columns: columns([
        ['source', 'Record store'],
        ['occurred_at', 'Occurred'],
        ['action', 'Change'],
        ['sub_action', 'Detail of change'],
        ['actor_user_id', 'Actor user id'],
        ['actor_name', 'Actor'],
        ['actor_email', 'Actor email'],
        ['target_type', 'Target type'],
        ['target_id', 'Target'],
        ['detail', 'Recorded values'],
        ['reason', 'Reason'],
        ['ip_address', 'IP address'],
      ]),
    },
  ],
  notRecorded: [
    "A change to a member's organisation role, and a member's removal by an administrator, are not recorded.",
    'Acceptance of an invitation is not recorded.',
    'A role change that arrives through a SCIM group is not recorded.',
    'Settings changed through the tenant configuration are not recorded: branding; security (the second-factor requirement, password policy, session timeout and IP restrictions); notifications; workflow; clinical evaluation and quality-plan settings, including audit-trail retention; and integrations. Resetting them to their defaults is not recorded either.',
    'Changes to the organisation settings are recorded by section name only, without the values before or after the change.',
    'Administration of SCIM tokens and of the IP allow-list is not recorded.',
    'SAML single sign-on is configured from the server environment, so its configuration has no change record.',
    "Suspensions by the platform operator and grants of platform roles are recorded in the platform's records, not the organisation's, so they do not appear here.",
  ],
  run,
};
