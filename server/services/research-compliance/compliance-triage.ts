/**
 * Compliance triage — turn the cross-domain briefing into central tasks.
 *
 * `buildComplianceBriefing` answers "what needs attention?" read-only. This makes
 * it ACTIONABLE: for each CRITICAL attention item it creates a review task in the
 * platform's central unified_tasks system (via the tasking bridge), so the work
 * lands in the same task list everything else uses — no parallel tracker.
 *
 * Idempotent: each item has a stable source key (`domain|signal`); a critical item
 * that already has a triage task is left alone, so re-running triage doesn't spam.
 * Governed: the caller records one governed action over the batch.
 *
 * @module server/services/research-compliance/compliance-triage
 */

import { pool } from '../../db';
import { buildComplianceBriefing, type BriefingItem } from './compliance-briefing';
import { emitDeadlineTask } from './tasking-bridge';

const SOURCE_TYPE = 'compliance_attention';

/** Stable, deterministic source id for an attention item (so re-triage dedupes). */
function itemKey(item: BriefingItem): string {
  return `${item.domain}|${item.signal}`.toLowerCase().replace(/\s+/g, '_').slice(0, 120);
}

async function hasOpenTriageTask(orgId: number, key: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM unified_tasks WHERE organization_id = $1 AND source_entity_type = $2 AND source_entity_id = $3 LIMIT 1`,
    [orgId, SOURCE_TYPE, key],
  );
  return rows.length > 0;
}

export interface TriageResult {
  criticalItems: number;
  created: Array<{ key: string; title: string; taskId: string }>;
  alreadyTracked: string[];
  skipped: string[];
}

/**
 * Run the briefing and dispatch each CRITICAL item into central tasking (high
 * priority, regulatory-impact). Read of the briefing is org-scoped; task creation
 * is best-effort per item. Returns what was created vs already tracked.
 */
export async function triageComplianceAttention(orgId: number, projectId?: number | null): Promise<TriageResult> {
  const briefing = await buildComplianceBriefing(orgId);
  const critical = briefing.items.filter((i) => i.severity === 'critical');

  const created: TriageResult['created'] = [];
  const alreadyTracked: string[] = [];
  const skipped: string[] = [];

  for (const item of critical) {
    const key = itemKey(item);
    if (await hasOpenTriageTask(orgId, key)) { alreadyTracked.push(key); continue; }
    const title = `${item.count} ${item.signal} (${item.domain})`;
    const taskId = await emitDeadlineTask({
      organizationId: orgId,
      title,
      sourceEntityType: SOURCE_TYPE,
      sourceEntityId: key,
      taskType: 'review',
      regulatoryImpact: true,
      priority: 'critical',
      projectId: projectId ?? undefined,
    });
    if (taskId) created.push({ key, title, taskId });
    else skipped.push(key);
  }

  return { criticalItems: critical.length, created, alreadyTracked, skipped };
}
