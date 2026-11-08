/**
 * Proactive Digest — bring AnA's session-time awareness (deadlines + open risks)
 * to users ASYNCHRONOUSLY, as an in-app notification, even when they aren't in
 * the AnA chat. Reuses the deadline radar (#867) and risk watch (#874) signal
 * sources and the existing notification service.
 *
 * `buildProactiveDigest` is pure (unit-testable, no DB/IO); `runProactiveDigest`
 * is the org-scoped runner that materializes the digest and fires the in-app
 * notification. Deterministic — surfaces only tracked, real items.
 */

import { getDeadlineRadar, type RadarResult, type RadarItem } from '../ana/deadline-radar.js';
import { getOpenBlockersForOrg, summarizeBlockers, type OpenBlocker } from '../ana/risk-watch.js';
import {
  getOpenContradictionsForOrg,
  summarizeContradictions,
  type OpenContradiction,
} from '../ana/contradiction-watch.js';
import { createNotification, type NotificationSeverity } from '../notifications/notification-service.js';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { getTenantScope, runWithOrgJobScope } from '../../db/tenantStore';
import type { RequestSqlClient } from '../../db/requestDb';
import type { AlignmentRuleSnapshot } from '../account-skill-bundles';
import {
  applyMutedSignals,
  isWithinQuietHours,
  severityMeetsFloor,
  DEFAULT_DIGEST_PREFERENCES,
  type DigestPreferences,
} from './digest-preferences.js';

export const PROACTIVE_DIGEST_CATEGORY = 'proactive_digest';

export interface ProactiveDigest {
  severity: NotificationSeverity;
  title: string;
  body: string;
  metadata: {
    overdue: number;
    dueSoon: number;
    risks: { critical: number; high: number; medium: number; low: number; total: number };
    contradictions: { critical: number; high: number; medium: number; low: number; blocksPromotion: number; total: number };
    topDeadlines: Array<{ title: string; agency: string | null; daysUntilDue: number; bucket: string }>;
    topRisks: Array<{ title: string; severity: string }>;
    topContradictions: Array<{ title: string; severity: string; blocksPromotion: boolean }>;
    generatedAt: string;
  };
}

/**
 * Pure: assemble the digest from a deadline radar result + open blockers + open
 * contradiction-engine findings. Returns null when there is nothing material to
 * surface (no overdue/due-soon deadlines, no open risks, no open contradictions),
 * so the caller skips sending an empty digest.
 */
export function buildProactiveDigest(
  radar: RadarResult,
  blockers: OpenBlocker[],
  contradictions: OpenContradiction[] = []
): ProactiveDigest | null {
  const overdue = radar.summary.overdue;
  const dueSoon = radar.summary.due_soon;
  const risks = summarizeBlockers(blockers);
  const cons = summarizeContradictions(contradictions);

  if (overdue === 0 && dueSoon === 0 && risks.total === 0 && cons.total === 0) return null;

  const severity: NotificationSeverity =
    overdue > 0 || risks.critical > 0 || cons.critical > 0 || cons.blocksPromotion > 0
      ? 'critical'
      : dueSoon > 0 || risks.high > 0 || cons.high > 0
        ? 'warning'
        : 'info';

  const titleParts: string[] = [];
  if (overdue > 0) titleParts.push(`${overdue} overdue`);
  if (dueSoon > 0) titleParts.push(`${dueSoon} due soon`);
  if (risks.total > 0) titleParts.push(`${risks.total} open risk${risks.total === 1 ? '' : 's'}`);
  if (cons.total > 0)
    titleParts.push(`${cons.total} contradiction${cons.total === 1 ? '' : 's'}`);
  const title = `Regulatory attention needed: ${titleParts.join(', ')}`;

  const topDeadlines = radar.items
    .filter(i => i.bucket === 'overdue' || i.bucket === 'due_soon')
    .slice(0, 5)
    .map((i: RadarItem) => ({
      title: i.title ?? 'Untitled obligation',
      agency: i.agency,
      daysUntilDue: i.daysUntilDue,
      bucket: i.bucket,
    }));
  const topRisks = blockers.slice(0, 5).map(b => ({
    title: b.title,
    severity: (b.severity ?? 'medium').toLowerCase(),
  }));
  const topContradictions = contradictions.slice(0, 5).map(c => ({
    title: c.title,
    severity: (c.severity ?? 'medium').toLowerCase(),
    blocksPromotion: c.blocksPromotion,
  }));

  const bodyLines: string[] = [];
  if (topDeadlines.length) {
    bodyLines.push('Deadlines:');
    for (const d of topDeadlines) {
      const when = d.daysUntilDue < 0 ? `${Math.abs(d.daysUntilDue)}d overdue` : `due in ${d.daysUntilDue}d`;
      bodyLines.push(`• ${d.agency ? `[${d.agency}] ` : ''}${d.title} (${when})`);
    }
  }
  if (topRisks.length) {
    bodyLines.push('Open risks:');
    for (const r of topRisks) bodyLines.push(`• [${r.severity}] ${r.title}`);
  }
  if (topContradictions.length) {
    bodyLines.push('Open contradictions:');
    for (const c of topContradictions) {
      bodyLines.push(`• [${c.severity}] ${c.title}${c.blocksPromotion ? ' — blocks promotion' : ''}`);
    }
  }

  return {
    severity,
    title,
    body: bodyLines.join('\n'),
    metadata: {
      overdue,
      dueSoon,
      risks,
      contradictions: cons,
      topDeadlines,
      topRisks,
      topContradictions,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** Why a digest run did not deliver a notification (for job telemetry). */
export type DigestSkipReason = 'nothing_material' | 'below_severity_floor' | 'quiet_hours';

export interface RunProactiveDigestResult {
  created: boolean;
  notificationId?: number;
  skipped?: DigestSkipReason;
}

/**
 * Org-scoped runner: compute the digest and, if material AND allowed by the
 * org's preferences, fire one in-app notification. Tenant-scoped via the org id
 * passed to the signal sources and the notification.
 *
 * Preferences (optional; permissive default = prior behavior) let an org mute
 * signal types, set a severity floor, and define quiet hours. `now` is injectable
 * for deterministic quiet-hours testing.
 */
export async function runProactiveDigest(
  organizationId: number,
  preferences: DigestPreferences = DEFAULT_DIGEST_PREFERENCES,
  now: Date = new Date()
): Promise<RunProactiveDigestResult> {
  // Quiet hours gate first — cheap, and avoids needless signal queries.
  if (isWithinQuietHours(now, preferences.quietHours)) {
    return { created: false, skipped: 'quiet_hours' };
  }

  const [radar, blockers, contradictions] = await Promise.all([
    getDeadlineRadar({ organizationId }),
    getOpenBlockersForOrg(organizationId, 10),
    getOpenContradictionsForOrg(organizationId, 10),
  ]);

  // Drop muted signal types before assembling the digest.
  const emptyRadar: RadarResult = {
    windowDays: radar.windowDays,
    summary: { overdue: 0, due_soon: 0, upcoming: 0, total: 0 },
    items: [],
  };
  const filtered = applyMutedSignals(
    { radar, blockers, contradictions },
    preferences.mutedSignals,
    emptyRadar
  );

  const digest = buildProactiveDigest(filtered.radar, filtered.blockers, filtered.contradictions);
  if (!digest) return { created: false, skipped: 'nothing_material' };

  if (!severityMeetsFloor(digest.severity, preferences.minSeverity)) {
    return { created: false, skipped: 'below_severity_floor' };
  }

  const notificationId = await createNotification({
    organizationId,
    category: PROACTIVE_DIGEST_CATEGORY,
    severity: digest.severity,
    title: digest.title,
    body: digest.body,
    actionUrl: '/notifications',
    metadata: digest.metadata,
  });

  return { created: true, notificationId };
}

interface AlignmentWindow { start: string; end: string }
interface AlignmentRecipient { userId: number; role: string }
interface AlignmentCounts { learned: number; changed: number; promoted: number; revoked: number; issues: number; openReviews: number }
interface AlignmentRunResult { notificationsCreated: number; tasksCreated: number }

/** A deterministic seven-day UTC reporting window; the current incomplete day is reported next time. */
export function alignmentDigestWindow(now: Date): AlignmentWindow {
  if (!Number.isFinite(now.getTime())) throw new Error('Alignment digest time is invalid.');
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start: new Date(end.getTime() - 7 * 86400000).toISOString(), end: end.toISOString() };
}

export function alignmentDigestCounts(snapshot: AlignmentRuleSnapshot, window: AlignmentWindow, openReviews = 0): AlignmentCounts {
  const changes = snapshot.rules.filter(rule => rule.occurredAt >= window.start && rule.occurredAt < window.end);
  return { learned: changes.filter(rule => rule.action === 'ana_rule.created').length,
    promoted: changes.filter(rule => rule.action === 'ana_rule.promoted').length,
    revoked: changes.filter(rule => rule.action === 'ana_rule.revoked').length,
    changed: changes.filter(rule => ['ana_skill.updated','ana_rule.superseded'].includes(rule.action)).length,
    issues: snapshot.issues.length, openReviews };
}

/** Scheduled in-app records only. An HTTP request or model argument cannot establish this job authority. */
export async function runRuleAlignmentDigest(organizationId: number, preferences: DigestPreferences = DEFAULT_DIGEST_PREFERENCES,
  now: Date = new Date()): Promise<AlignmentRunResult> {
  const scope = getTenantScope();
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || scope?.source !== 'job' ||
    scope.tenantId !== String(organizationId) || scope.role || scope.accountId != null) throw new Error('An organization job scope is required for the alignment digest.');
  const window = alignmentDigestWindow(now);
  if (isWithinQuietHours(now, preferences.quietHours)) return { notificationsCreated: 0, tasksCreated: 0 };
  return runWithOrgJobScope(organizationId, 'alignment-digest:rule_review', () => alignmentDigestTransaction(organizationId, window, preferences));
}

async function alignmentDigestTransaction(organizationId: number, window: AlignmentWindow, preferences: DigestPreferences): Promise<AlignmentRunResult> {
  const { pool } = await import('../../db/runtime');
  const client = await pool.connect();
  let committing = false;
  let discard: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('rule-alignment:' || $1::text))`, [organizationId]);
    const recipients = await alignmentRecipients(client, organizationId);
    const result = { notificationsCreated: 0, tasksCreated: 0 };
    for (const recipient of recipients) await alignmentForRecipient(client, { organizationId, recipient, window, preferences }, result);
    committing = true; await client.query('COMMIT'); return result;
  } catch (error) {
    if (committing) { discard = new Error('Alignment digest commit outcome is unknown.'); throw discard; }
    try { await client.query('ROLLBACK'); } catch { discard = new Error('Alignment digest rollback failed.'); }
    throw error;
  } finally { client.release(discard); }
}

async function alignmentRecipients(client: RequestSqlClient, organizationId: number): Promise<AlignmentRecipient[]> {
  const rows = await client.query(`SELECT ou.user_id,ou.role FROM organization_users ou JOIN users u ON u.id=ou.user_id
    JOIN organizations o ON o.id=ou.organization_id WHERE ou.organization_id=$1 AND u.status='active' AND o.status='active'
    ORDER BY ou.user_id FOR SHARE OF ou,u,o`, [organizationId]);
  const unique = new Set<number>();
  return rows.rows.map(row => {
    const userId = Number(row.user_id); const role = String(row.role).trim().toLowerCase();
    if (!Number.isSafeInteger(userId) || userId <= 0 || !role || unique.has(userId)) throw new Error('Alignment recipient membership is ambiguous.');
    unique.add(userId); return { userId,role };
  });
}

interface RecipientAlignment {
  organizationId: number; recipient: AlignmentRecipient; window: AlignmentWindow; preferences: DigestPreferences;
}

async function alignmentForRecipient(client: RequestSqlClient, input: RecipientAlignment, result: AlignmentRunResult): Promise<void> {
  const { getAccessibleReportProjectIds } = await import('../report-os/project-access');
  const projectIds = await getAccessibleReportProjectIds(input.organizationId, input.recipient, client);
  const current = await client.query(`SELECT id FROM projects WHERE organization_id=$1 AND id=ANY($2::integer[])
    AND status NOT IN ('archived','deleted') ORDER BY id`, [input.organizationId,projectIds]);
  // Tenant-admin reporting never contains project data. Project reports are individually admitted and targeted.
  await alignmentForScope(client, input, null, result);
  for (const project of current.rows) await alignmentForScope(client, input, Number(project.id), result);
}

async function alignmentForScope(client: RequestSqlClient, input: RecipientAlignment, projectId: number | null, result: AlignmentRunResult): Promise<void> {
  const { readAlignmentRuleSnapshot } = await import('../account-skill-bundles');
  const snapshot = await readAlignmentRuleSnapshot(client, input.organizationId, projectId, input.window);
  await admitAlignmentRecipient(client, input, projectId);
  const taskId = await alignmentRepairTasks(client, input, projectId, snapshot, result);
  const open = await client.query(`SELECT task_id FROM unified_tasks WHERE organization_id=$1 AND assignee_id=$2
    AND project_id IS NOT DISTINCT FROM $3::integer AND source_entity_type='rule_alignment' AND deleted_at IS NULL
    AND created_by_id IS NULL AND metadata->>'purpose'='alignment_review' AND status NOT IN ('completed','cancelled')
    AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.tenant_id=unified_tasks.organization_id AND a.record_id=unified_tasks.task_id
      AND a.table_name='unified_tasks' AND a.action='task.create' AND a.user_id IS NULL
      AND a.new_values->>'actorType'='system' AND a.new_values->>'source'='scheduled_rule_alignment')
    ORDER BY task_id`, [input.organizationId,input.recipient.userId,projectId]);
  const counts = alignmentDigestCounts(snapshot, input.window, open.rows.length);
  if (!Object.values(counts).some(Boolean)) return;
  const severity = counts.issues || counts.openReviews ? 'warning' : 'info';
  if (!severityMeetsFloor(severity, input.preferences.minSeverity)) return;
  const alignmentKey = alignmentHash({ organizationId: input.organizationId, userId: input.recipient.userId, projectId, window: input.window, snapshot, counts });
  const previous = await client.query(`SELECT id FROM mdx_notifications WHERE organization_id=$1 AND recipient_user_id=$2
    AND category='proactive_digest' AND metadata->>'alignmentKey'=$3
    AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.tenant_id=mdx_notifications.organization_id
      AND a.table_name='mdx_notifications' AND a.record_id=mdx_notifications.id::text AND a.action='ana_rule.alignment_digest_created'
      AND a.user_id IS NULL AND a.new_values->>'actorType'='system' AND a.new_values->>'alignmentKey'=$3)
    LIMIT 1`, [input.organizationId,input.recipient.userId,alignmentKey]);
  if (previous.rows.length) return;
  await admitAlignmentRecipient(client, input, projectId);
  const notificationId = await createNotification({ organizationId: input.organizationId, recipientUserId: input.recipient.userId, category: 'proactive_digest', severity,
    title: projectId === null ? 'Standing-rule alignment: organization' : 'Standing-rule alignment: your project',
    body: `${counts.learned} rules learned; ${counts.changed} changed; ${counts.promoted} guardrail promotions; ${counts.revoked} revoked; ${counts.issues} issues requiring review; ${counts.openReviews} open review tasks. A human must record any repair decision.`,
    ...(taskId ? { resourceType: 'unified_task', resourceId: taskId } : {}),
    metadata: { kind: 'rule_alignment', alignmentKey, scope: projectId === null ? 'tenant' : 'project', window: input.window, counts } }, client);
  const { writeChainedAuditRow } = await import('../auditService');
  await writeChainedAuditRow(client, { tenantId: input.organizationId, action: 'ana_rule.alignment_digest_created', resourceType: 'mdx_notifications',
    resourceId: notificationId, details: { actorType: 'system', source: 'scheduled_rule_alignment', recipientUserId: input.recipient.userId,
      scope: projectId === null ? 'tenant' : 'project', alignmentKey, window: input.window, counts } });
  result.notificationsCreated += 1;
}

async function admitAlignmentRecipient(client: RequestSqlClient, input: RecipientAlignment, projectId: number | null): Promise<void> {
  const { readActiveAnaActorRole } = await import('../ana/project-scope-admission');
  const role = await readActiveAnaActorRole(client, { organizationId: input.organizationId, userId: input.recipient.userId });
  if (role !== input.recipient.role) throw new Error('Alignment recipient standing changed.');
  if (projectId === null) return;
  const { canAccessReportProject } = await import('../report-os/project-access');
  const parent = await client.query(`SELECT id FROM projects WHERE organization_id=$1 AND id=$2
    AND status NOT IN ('archived','deleted') FOR SHARE`, [input.organizationId,projectId]);
  await client.query(`SELECT user_id FROM project_members WHERE organization_id=$1 AND project_id=$2 AND user_id=$3 FOR SHARE`,
    [input.organizationId,projectId,input.recipient.userId]);
  await client.query(`SELECT project_id FROM project_visibility_settings WHERE organization_id=$1 AND project_id=$2 FOR SHARE`, [input.organizationId,projectId]);
  if (parent.rows.length !== 1 || !await canAccessReportProject(input.organizationId,input.recipient,projectId,client)) throw new Error('Alignment recipient project access changed.');
}

async function alignmentRepairTasks(client: RequestSqlClient, input: RecipientAlignment, projectId: number | null,
  snapshot: AlignmentRuleSnapshot, result: AlignmentRunResult): Promise<string | null> {
  if (!['admin','owner','super_admin'].includes(input.recipient.role)) return null;
  const { createSystemAlignmentTaskInTx } = await import('../tasking/create-task');
  let taskId: string | null = null;
  for (const issue of snapshot.issues) {
    const taskKey = alignmentHash({ organizationId: input.organizationId, userId: input.recipient.userId, projectId, issue });
    const task = await createSystemAlignmentTaskInTx(client, { organizationId: input.organizationId, recipientUserId: input.recipient.userId,
      projectId, taskKey, issueCode: issue.code, ruleVersions: issue.refs });
    taskId = task.taskId; if (task.created) result.tasksCreated += 1;
  }
  return taskId;
}

function alignmentHash(value: unknown): string { return createHash('sha256').update(stableStringify(value)).digest('hex'); }
