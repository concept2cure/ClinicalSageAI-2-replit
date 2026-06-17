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
import { createNotification, type NotificationSeverity } from '../notifications/notification-service.js';

export const PROACTIVE_DIGEST_CATEGORY = 'proactive_digest';

export interface ProactiveDigest {
  severity: NotificationSeverity;
  title: string;
  body: string;
  metadata: {
    overdue: number;
    dueSoon: number;
    risks: { critical: number; high: number; medium: number; low: number; total: number };
    topDeadlines: Array<{ title: string; agency: string | null; daysUntilDue: number; bucket: string }>;
    topRisks: Array<{ title: string; severity: string }>;
    generatedAt: string;
  };
}

/**
 * Pure: assemble the digest from a deadline radar result + open blockers.
 * Returns null when there is nothing material to surface (no overdue/due-soon
 * deadlines and no open risks), so the caller skips sending an empty digest.
 */
export function buildProactiveDigest(
  radar: RadarResult,
  blockers: OpenBlocker[]
): ProactiveDigest | null {
  const overdue = radar.summary.overdue;
  const dueSoon = radar.summary.due_soon;
  const risks = summarizeBlockers(blockers);

  if (overdue === 0 && dueSoon === 0 && risks.total === 0) return null;

  const severity: NotificationSeverity =
    overdue > 0 || risks.critical > 0 ? 'critical' : dueSoon > 0 || risks.high > 0 ? 'warning' : 'info';

  const titleParts: string[] = [];
  if (overdue > 0) titleParts.push(`${overdue} overdue`);
  if (dueSoon > 0) titleParts.push(`${dueSoon} due soon`);
  if (risks.total > 0) titleParts.push(`${risks.total} open risk${risks.total === 1 ? '' : 's'}`);
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

  return {
    severity,
    title,
    body: bodyLines.join('\n'),
    metadata: {
      overdue,
      dueSoon,
      risks,
      topDeadlines,
      topRisks,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Org-scoped runner: compute the digest and, if material, fire one in-app
 * notification. Returns whether a notification was created. Tenant-scoped via
 * the org id passed to the signal sources and the notification.
 */
export async function runProactiveDigest(
  organizationId: number
): Promise<{ created: boolean; notificationId?: number }> {
  const [radar, blockers] = await Promise.all([
    getDeadlineRadar({ organizationId }),
    getOpenBlockersForOrg(organizationId, 10),
  ]);

  const digest = buildProactiveDigest(radar, blockers);
  if (!digest) return { created: false };

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
