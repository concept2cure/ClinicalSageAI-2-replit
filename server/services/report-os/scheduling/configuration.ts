/** Validate a schedule at creation, enablement and fire time. Catalog filters
 * are presentation; ownership, current writer membership and entitlement gate IO. */
import { getPool } from '../../../db';
import { GOVERNED_WRITE_ROLES } from '../../../middleware/orgMembership';
import { scheduledReportsEntitled, scheduledReportsRefusal } from './entitlement';
import { decideReportEntitlement } from '../entitlement-map';
import { reportAvailability, reportTypeApplies, type ReportAvailability } from '../report-engine';
import { deriveScopeSegments, deriveOrgSegments } from '../segment';
import { resolveOwnedReportScope, ReportScopeOwnershipError } from '../scope-ownership';
import { getAccessibleReportProjectIds, type ReportProjectActor } from '../project-access';
import { computeNextRun } from './cadence';
import type { CreateSubscriptionInput } from './subscription-service';

export class ScheduleConfigurationError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 422, public readonly requiredTier?: string) { super(message); }
}

export type SubscriptionConfiguration = {
  reportType: { typeId: string; label: string; family: string };
  availability: ReportAvailability;
  recipientUserIds: number[];
  projectId: number | null;
  programProjectIds?: number[];
};

export async function validateSubscriptionConfiguration(input: CreateSubscriptionInput): Promise<SubscriptionConfiguration> {
  try { computeNextRun(input.schedule, new Date()); } catch {
    throw new ScheduleConfigurationError('Use a valid local time and timezone for this schedule.', 'REPORT_SCHEDULE_INVALID');
  }
  if ((input.channel ?? 'platform') !== 'platform') {
    throw new ScheduleConfigurationError('External scheduled delivery is unavailable because no report transport is configured. Use platform notifications.', 'REPORT_EXTERNAL_TRANSPORT_UNAVAILABLE');
  }
  if (!['in_app', 'pdf'].includes(input.format ?? 'in_app')) throw new ScheduleConfigurationError('Unsupported delivery format', 'REPORT_DELIVERY_FORMAT_UNSUPPORTED');
  const pool = getPool();
  if (!Number.isSafeInteger(input.createdBy) || !input.createdBy) throw new ScheduleConfigurationError('A current report creator is required.', 'REPORT_CREATOR_UNAVAILABLE', 403);
  const membership = await pool.query<{ role: string }>(
    `SELECT ou.role FROM organization_users ou JOIN users u ON u.id = ou.user_id
     JOIN organizations o ON o.id = ou.organization_id
     WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active' AND o.status = 'active'`, [input.organizationId, input.createdBy],
  );
  if (!membership.rows[0] || !GOVERNED_WRITE_ROLES.has(membership.rows[0].role)) {
    throw new ScheduleConfigurationError('The subscription creator no longer has permission to create reports.', 'REPORT_CREATOR_NOT_AUTHORIZED', 403);
  }
  const caps = await scheduledReportsEntitled(input.organizationId);
  if (!caps.entitled) throw new ScheduleConfigurationError(scheduledReportsRefusal(caps).error, 'REPORT_SCHEDULE_NOT_ENTITLED', 403, caps.requiredTier);
  const types = await pool.query<{ type_id: string; label: string; family: string; allowed_scopes: string[]; allowed_client_segments: string[] }>(
    'SELECT type_id, label, family, allowed_scopes, allowed_client_segments FROM report_type_registry WHERE type_id = $1 AND enabled = true', [input.reportTypeId],
  );
  const type = types.rows[0];
  if (!type) throw new ScheduleConfigurationError('This report type is unavailable.', 'REPORT_TYPE_NOT_AVAILABLE');
  const availability = reportAvailability(type.type_id, input.scopeType, type.allowed_scopes);
  if (!availability.runnable) throw new ScheduleConfigurationError(availability.availabilityReason ?? 'This report cannot be computed.', 'REPORT_TYPE_NOT_COMPUTED');
  const entitlement = decideReportEntitlement(type.type_id, type.family, caps.tier);
  if (!entitlement.entitled) throw new ScheduleConfigurationError(`This report requires the ${entitlement.requiredTier} plan.`, 'REPORT_TYPE_NOT_ENTITLED', 403, entitlement.requiredTier);
  if (input.clientWorkspaceId != null && availability.computedScope === 'organization') {
    throw new ScheduleConfigurationError('This report computes organization-wide data and cannot be restricted to a client workspace.', 'REPORT_CLIENT_SCOPE_UNSUPPORTED');
  }

  let ownedScope;
  try {
    ownedScope = await resolveOwnedReportScope(input);
  } catch (error) {
    if (error instanceof ReportScopeOwnershipError) {
      throw new ScheduleConfigurationError(error.message, error.code, error.status);
    }
    throw error;
  }
  const { projectId, programProjectIds } = ownedScope;
  const scopeProjectIds = [...new Set([...(projectId == null ? [] : [projectId]), ...(programProjectIds ?? [])])];
  const creator = { userId: input.createdBy, role: membership.rows[0].role };
  await requireProjectUseAccess(input.organizationId, creator, scopeProjectIds, 'creator');

  const segments = projectId != null ? await deriveScopeSegments(input.organizationId, projectId) : await deriveOrgSegments(input.organizationId);
  if (!reportTypeApplies({ allowedClientSegments: type.allowed_client_segments }, segments)) throw new ScheduleConfigurationError('This report does not apply to the recorded client or product type.', 'REPORT_TYPE_NOT_APPLICABLE');
  const emails = [...new Set((input.recipients ?? []).map(email => email.trim().toLowerCase()))];
  const recipientUserIds = emails.length ? (await pool.query<{ id: number; email: string; role: string }>(
    `SELECT u.id, lower(u.email) AS email, ou.role FROM users u JOIN organization_users ou ON ou.user_id = u.id
     WHERE ou.organization_id = $1 AND u.status = 'active' AND lower(u.email) = ANY($2::text[])`, [input.organizationId, emails],
  )).rows : [{ id: input.createdBy, email: '', role: creator.role }];
  if (recipientUserIds.length !== (emails.length || 1)) throw new ScheduleConfigurationError('Platform recipients must be active members of this organization.', 'REPORT_RECIPIENT_NOT_IN_ORGANIZATION', 403);
  for (const recipient of recipientUserIds) {
    if (recipient.id === creator.userId && recipient.role === creator.role) continue;
    await requireProjectUseAccess(input.organizationId, { userId: recipient.id, role: recipient.role }, scopeProjectIds, 'recipient');
  }
  return { reportType: { typeId: type.type_id, label: type.label, family: type.family }, availability, recipientUserIds: recipientUserIds.map(r => r.id), projectId, ...(programProjectIds ? { programProjectIds } : {}) };
}

/** Organization membership never grants access to an explicitly private project.
 * Delegate to the same sharing policy as manual/saved reporting reads. */
async function requireProjectUseAccess(organizationId: number, actor: ReportProjectActor, projectIds: number[], target: 'creator' | 'recipient'): Promise<void> {
  if (projectIds.length === 0) return; // organization registers retain their existing organization policy
  const accessible = new Set(await getAccessibleReportProjectIds(organizationId, actor));
  if (projectIds.some(id => !accessible.has(id))) {
    throw new ScheduleConfigurationError(
      target === 'creator' ? 'The subscription creator cannot access every project in this report scope.' : 'A platform recipient cannot access every project in this report scope.',
      target === 'creator' ? 'REPORT_CREATOR_PROJECT_ACCESS_DENIED' : 'REPORT_RECIPIENT_PROJECT_ACCESS_DENIED', 403,
    );
  }
}
