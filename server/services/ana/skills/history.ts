/**
 * An organization skill's history, from the chained audit rows its governed
 * writes committed (server/services/account-skill-bundles.ts): every version,
 * who changed it, when, and the reason they stated. It is the record a person
 * tuning a skill reads to see what changed and why; nothing here is a second
 * copy of it.
 *
 * @module server/services/ana/skills/history
 */

import type { SkillReadClient } from '../../account-skill-bundles.js';

export interface SkillHistoryEntry {
  occurredAt: string;
  action: string;
  actorName: string | null;
  reason: string | null;
  /** The version the change produced; null when the row does not state one. */
  version: number | null;
  /** The instructions after the change; null when the row does not hold them. */
  instructions: string | null;
  status: string | null;
}

const HISTORY_LIMIT = 50;

function objectOf(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      return objectOf(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return null;
}

function entryOf(row: Record<string, unknown>): SkillHistoryEntry {
  const next = objectOf(objectOf(row.new_values)?.next);
  const at = row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at ?? '');
  return {
    occurredAt: at,
    action: String(row.action ?? ''),
    actorName: typeof row.actor_name === 'string' ? row.actor_name : null,
    reason: typeof row.reason === 'string' ? row.reason : null,
    version: typeof next?.version === 'number' ? next.version : null,
    instructions: typeof next?.instructions === 'string' ? next.instructions : null,
    status: typeof next?.status === 'string' ? next.status : null,
  };
}

/**
 * The skill's changes, newest first. Null when the organization holds no skill
 * with that id. Read on the request's tenant-scoped connection.
 */
export async function readOrgSkillHistory(
  client: SkillReadClient,
  organizationId: number,
  id: number,
): Promise<SkillHistoryEntry[] | null> {
  const skill = await client.query(
    `SELECT bundle_id FROM account_skill_bundles WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );
  const bundleId = skill.rows[0]?.bundle_id;
  if (typeof bundleId !== 'string') return null;
  const { rows } = await client.query(
    `SELECT a.occurred_at, a.action, a.reason, a.new_values, u.name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = $1
        AND a.table_name = 'account_skill_bundles'
        AND a.record_id = $2
      ORDER BY a.occurred_at DESC
      LIMIT $3`,
    [organizationId, bundleId, HISTORY_LIMIT],
  );
  return rows.map(entryOf);
}
