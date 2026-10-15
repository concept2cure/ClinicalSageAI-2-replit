/**
 * A new project's blueprint milestones, on the task board and on the ledger.
 *
 * POST /api/concept2cure/projects (server/routes/concept2cure.ts) seeds the
 * registry blueprint's milestones as board tasks. It did so with one
 * `pool.query` per milestone and no lineage row, so every project began with
 * tasks on the regulated board that no §11.10(e) record said anyone had
 * created. A failure part-way through left some milestones seeded and the rest
 * missing.
 *
 * Now the whole set is one transaction. Each milestone the board did not
 * already hold is inserted, and its `task.create` row is written on the same
 * connection straight after it. Either every seeded milestone is on the board
 * with its row, or none is. A creator who cannot be named (no user id) seeds
 * nothing: an unattributed board task is the thing this removes.
 *
 * @module server/services/tasking/blueprint-milestones
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import { auditTaskAction, TaskAuditNotRecordedError } from './task-audit.js';

export interface BlueprintMilestone {
  id: string;
  title: string;
  description?: string | null;
}

export interface SeedBlueprintMilestonesInput {
  organizationId: number;
  projectId: number;
  /** The authenticated user creating the project: the milestones' creator. */
  userId: number | null | undefined;
  /** The registry entry the blueprint came from. */
  registryId: string;
  milestones: readonly BlueprintMilestone[];
}

/** The board's key for a project's blueprint milestone. Deterministic, so a re-run inserts nothing twice. */
export const blueprintMilestoneTaskId = (projectId: number, milestoneId: string) =>
  `TASK-BP-${projectId}-${milestoneId}`;

/**
 * Seed the milestones and their `task.create` rows in one transaction, and
 * return the task ids it inserted. Throws, having rolled everything back, when
 * any insert or lineage row fails, including when the creator is not
 * attributable (`TaskAuditNotRecordedError`).
 */
export async function seedBlueprintMilestones(input: SeedBlueprintMilestonesInput): Promise<string[]> {
  const { organizationId, projectId, userId, registryId, milestones } = input;
  if (milestones.length === 0) return [];

  const client = (await pool.connect()) as PoolClient;
  try {
    await client.query('BEGIN');
    const seeded: string[] = [];
    for (const milestone of milestones) {
      const taskId = blueprintMilestoneTaskId(projectId, milestone.id);
      const sourceEntityId = `${registryId}:${milestone.id}`;
      const inserted = await client.query(
        `INSERT INTO unified_tasks
           (task_id, organization_id, project_id, module_type, title,
            description, task_type, category, priority, status,
            source_entity_type, source_entity_id, created_by_id,
            created_at, updated_at)
         VALUES ($1, $2, $3, 'Regulatory', $4, $5, 'milestone',
                 'regulatory', 'high', 'pending', 'registry_blueprint',
                 $6, $7, NOW(), NOW())
         ON CONFLICT (task_id) DO NOTHING
         RETURNING task_id`,
        [taskId, organizationId, projectId, milestone.title, milestone.description || '', sourceEntityId, userId ?? null],
      );
      // Already on the board: nothing was created, so there is nothing to record.
      if (inserted.rows.length === 0) continue;

      const outcome = await auditTaskAction(
        {
          orgId: organizationId,
          userId,
          command: 'task.create',
          taskId,
          payload: {
            moduleType: 'Regulatory',
            title: milestone.title,
            priority: 'high',
            status: 'pending',
            taskType: 'milestone',
            projectId,
            sourceEntityType: 'registry_blueprint',
            sourceEntityId,
          },
          // The system's act, which nobody gave a reason for: a summary, and no reason (D5).
          summary: `Milestone seeded from the ${registryId} blueprint when the project was created`,
        },
        client,
      );
      if (!outcome.recorded) throw new TaskAuditNotRecordedError(outcome.reason);
      seeded.push(taskId);
    }
    await client.query('COMMIT');
    return seeded;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
