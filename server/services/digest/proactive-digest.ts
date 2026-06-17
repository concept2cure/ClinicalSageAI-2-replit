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
