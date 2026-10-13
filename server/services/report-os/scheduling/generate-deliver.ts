/** Scheduled reports use the same engines and audited run store as manual runs.
 * Saved output, platform notifications, delivery audit and cursor commit together. */
import { createHash } from 'node:crypto';
import type { ReportScope, ReportSubscriptionRow } from '@shared/schema/report-os';
import { computeRunForType } from '../compute-run';
import { persistReportRun } from '../persistence';
import { resolveScope } from '../scope-model';
import { createNotification } from '../../notifications/notification-service';
import { writeChainedAuditRow } from '../../auditService';
import { computeNextRun } from './cadence';
import { validateSubscriptionConfiguration } from './configuration';
import { decideDelivery } from './delivery';
import type { CreateSubscriptionInput } from './subscription-service';
import type { ReportSchedule } from './types';

/** One occurrence has one run identity, across workers and retry attempts. */
export function subscriptionRunUuid(sub: Pick<ReportSubscriptionRow, 'id' | 'organizationId'>, scheduledFor: Date): string {
  const bytes = createHash('sha256').update(`report-subscription:${sub.organizationId}:${sub.id}:${scheduledFor.toISOString()}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function generateAndDeliver(sub: ReportSubscriptionRow, now = new Date()): Promise<void> {
  const input = { ...sub, schedule: sub.schedule as ReportSchedule, recipients: sub.recipients ?? [], format: sub.format, channel: sub.channel } as CreateSubscriptionInput;
  if (!sub.enabled) throw new Error('This subscription is disabled; no output was generated.');
  const configured = await validateSubscriptionConfiguration(input);
  const scopeType = sub.scopeType as ReportScope;
  const scope = resolveScope({ organizationId: sub.organizationId, scopeType, scopeId: sub.scopeId });
  const scheduledFor = sub.nextRunAt ?? computeNextRun(input.schedule, sub.lastRunAt ?? sub.createdAt);
  if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() > now.getTime()) {
    throw new Error('This subscription is not due; no output was generated.');
  }
  const engine = configured.availability.engine;
  if (!engine) throw new Error('Unsupported scheduled report engine');
  // The SAME dispatcher as an interactive run; omitted regional declaration
  // makes the engine read the deployed registry, rather than receive {}.
  const { computed, lineageRendered } = await computeRunForType({
    engine, typeId: sub.reportTypeId, organizationId: sub.organizationId,
    scopeType, scopeId: sub.scopeId, clientWorkspaceId: sub.clientWorkspaceId,
    ...(configured.programProjectIds ? { programProjectIds: configured.programProjectIds } : {}),
  });
  computed.summary.computedScope ??= configured.availability.computedScope;
  const status = computed.blockers.length ? 'partial' : 'completed';
  const decision = decideDelivery({ status: 'partial' }, 'platform');
  if (!decision.allowed) throw new Error('Platform report delivery was refused');
  const subscription = { id: sub.id, scheduledFor: scheduledFor.toISOString() };
  const dependencySummary = { providers: computed.providers, scopeLineage: scope.lineage, summary: computed.summary, criticalBlockers: computed.criticalBlockers, subscription, ...(lineageRendered ? { lineageRendered } : {}) };
  await persistReportRun({
    run: { organizationId: sub.organizationId, clientWorkspaceId: sub.clientWorkspaceId, runUuid: subscriptionRunUuid(sub, scheduledFor), scopeType, scopeId: sub.scopeId, reportTypeId: sub.reportTypeId, requestedBy: sub.createdBy, status, dependencySummary, blockers: computed.blockers, confidence: computed.confidence, freshness: { generatedAt: now.toISOString(), freshnessBudgetMs: scope.freshnessBudgetMs }, completedAt: now },
    snapshot: { organizationId: sub.organizationId, scopeType, scopeId: sub.scopeId, snapshotVersion: 1, isLatest: true, snapshotMetadata: { reportTypeId: sub.reportTypeId, providers: computed.providers, summary: computed.summary, confidence: computed.confidence, subscription, computedScope: configured.availability.computedScope }, createdBy: sub.createdBy },
    dependencies: computed.providers.map(p => ({ organizationId: sub.organizationId, provider: p.provider, status: p.status, blocker: p.blocker, observedAt: new Date(p.observedAt), payload: { scopeType, scopeId: sub.scopeId, computedScope: configured.availability.computedScope, atoms: p.atoms ?? [], calculation: p.calculation ?? null } })),
  }, { userId: sub.createdBy ?? undefined, userAgent: 'report-subscription-worker' }, async (client, created) => {
    // Optimistic cursor guard also refuses edits/disablement during generation.
    const advanced = await client.query(
      `UPDATE report_subscriptions SET last_run_at = $3, next_run_at = $4, updated_at = $3
       WHERE id = $1 AND organization_id = $2 AND enabled = true
       AND date_trunc('milliseconds', updated_at) = $5::timestamp
       AND next_run_at IS NOT DISTINCT FROM $6 AND schedule::jsonb = $7::jsonb
       AND report_type_id = $8 AND scope_type = $9 AND scope_id = $10
       AND COALESCE(recipients::jsonb, '[]'::jsonb) = $11::jsonb AND channel = $12 AND format = $13
       AND created_by IS NOT DISTINCT FROM $14 AND client_workspace_id IS NOT DISTINCT FROM $15 RETURNING id`,
      [sub.id, sub.organizationId, now, computeNextRun(input.schedule, now), sub.updatedAt, sub.nextRunAt,
        JSON.stringify(sub.schedule), sub.reportTypeId, sub.scopeType, sub.scopeId, JSON.stringify(sub.recipients ?? []), sub.channel, sub.format, sub.createdBy, sub.clientWorkspaceId ?? null],
    );
    if (!advanced.rows.length) throw new Error('The subscription changed during generation; no output was delivered.');
    const notificationIds: number[] = [];
    for (const recipientUserId of configured.recipientUserIds) {
      notificationIds.push(await createNotification({
        organizationId: sub.organizationId, recipientUserId, category: 'system', severity: computed.blockers.length ? 'warning' : 'info',
        title: `Scheduled report ready: ${configured.reportType.label}`,
        body: `A non-final report has been saved. ${sub.format === 'pdf' ? 'Its PDF is available through the report export action. ' : ''}${configured.availability.computedScope === 'organization' ? 'The data covers the organization. ' : ''}Review its blockers and sources before finalizing.`,
        resourceType: 'report_run', resourceId: String(created.run.id), actionUrl: `/concept2cure/insights?reportRunId=${created.run.id}`,
        metadata: { runId: created.run.id, subscriptionId: sub.id, scheduledFor: scheduledFor.toISOString(), scopeType, scopeId: sub.scopeId, format: sub.format, watermark: decision.watermark },
      }, client));
    }
    await writeChainedAuditRow(client, {
      tenantId: sub.organizationId, userId: sub.createdBy ?? undefined, action: 'report_os.subscription_delivered', resourceType: 'report_run', resourceId: String(created.run.id),
      details: { subscriptionId: sub.id, scheduledFor: scheduledFor.toISOString(), channel: 'platform', notificationIds, recipientUserIds: configured.recipientUserIds, status, watermark: decision.watermark },
    });
  });
}
