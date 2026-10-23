/**
 * A project's own skill settings (project_skill_settings, 20261022c): a skill
 * deployed to the project, so AnA loads it on every turn there ('always'), or
 * turned off there ('off'). The organization's on/off for a library skill
 * (organization_skill_settings) is the same decision one level up, and is
 * written the same way: a stated reason, the change, and its chained audit row
 * in one transaction on the request's tenant-scoped connection.
 *
 * Who may write is the project's write admission (requireProjectAdmission with
 * forWrite), checked by the route before this runs.
 *
 * @module server/services/ana/skills/project-skills
 */

import { PROJECT_ALWAYS_MAX, type ProjectSkillState } from '../../../../shared/ana/skills.js';
import {
  OrgSkillRefusal,
  inTransaction,
  type SkillChange,
  type SkillConnectable,
  type SkillReadClient,
} from '../../account-skill-bundles.js';
import { writeChainedAuditRow } from '../../auditService.js';

export interface ProjectSkillSetting {
  state: ProjectSkillState;
  reason: string;
  updatedAt: string | null;
}

function isState(v: unknown): v is ProjectSkillState {
  return v === 'always' || v === 'off';
}

/** Every setting the project holds, by skill key. */
export async function readProjectSkillSettings(
  client: SkillReadClient,
  organizationId: number,
  projectId: number,
): Promise<Map<string, ProjectSkillSetting>> {
  const { rows } = await client.query(
    `SELECT skill_key, state, reason, updated_at
       FROM project_skill_settings
      WHERE organization_id = $1 AND project_id = $2`,
    [organizationId, projectId],
  );
  const out = new Map<string, ProjectSkillSetting>();
  for (const r of rows) {
    if (typeof r.skill_key !== 'string' || !isState(r.state)) continue;
    const at = r.updated_at instanceof Date ? r.updated_at.toISOString() : typeof r.updated_at === 'string' ? r.updated_at : null;
    out.set(r.skill_key, { state: r.state, reason: typeof r.reason === 'string' ? r.reason : '', updatedAt: at });
  }
  return out;
}

/** The keys a project deploys and the keys it turns off. */
export function projectChoices(settings: ReadonlyMap<string, ProjectSkillSetting>): { deployed: string[]; off: Set<string> } {
  const deployed: string[] = [];
  const off = new Set<string>();
  for (const [key, s] of settings) {
    if (s.state === 'always') deployed.push(key);
    else off.add(key);
  }
  return { deployed: deployed.sort(), off };
}

const AUDIT_ACTION: Record<ProjectSkillState | 'cleared', string> = {
  always: 'ana_skill.project_deployed',
  off: 'ana_skill.project_turned_off',
  cleared: 'ana_skill.project_cleared',
};

/**
 * Set a project's state for one skill: 'always', 'off', or null to clear it
 * (the organization's setting then applies). Writing the state it already has
 * records nothing. More than PROJECT_ALWAYS_MAX deployed skills is refused:
 * they load on every turn, and more would leave no room for the question.
 */
export async function setProjectSkillState(
  pool: SkillConnectable,
  scope: { organizationId: number; projectId: number },
  skillKey: string,
  state: ProjectSkillState | null,
  change: SkillChange,
): Promise<{ changed: boolean; state: ProjectSkillState | null }> {
  const { organizationId, projectId } = scope;
  const { reason, actor } = change;
  return inTransaction(pool, async client => {
    // One writer per project at a time, so two deployments cannot both pass the cap.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ana_project_skills:' || $1::text))`, [projectId]);
    const { rows } = await client.query(
      `SELECT skill_key, state FROM project_skill_settings WHERE organization_id = $1 AND project_id = $2`,
      [organizationId, projectId],
    );
    const previous = rows.find(r => r.skill_key === skillKey)?.state ?? null;
    if (previous === state) return { changed: false, state };
    if (state === 'always') {
      const deployed = rows.filter(r => r.state === 'always' && r.skill_key !== skillKey).length;
      if (deployed >= PROJECT_ALWAYS_MAX) {
        throw new OrgSkillRefusal(
          409,
          'PROJECT_SKILLS_FULL',
          `This project already has ${PROJECT_ALWAYS_MAX} skills deployed. Remove one before deploying another. Nothing was changed.`,
        );
      }
    }
    if (state === null) {
      await client.query(`DELETE FROM project_skill_settings WHERE organization_id = $1 AND project_id = $2 AND skill_key = $3`, [
        organizationId,
        projectId,
        skillKey,
      ]);
    } else {
      await client.query(
        `INSERT INTO project_skill_settings (organization_id, project_id, skill_key, state, reason, updated_by_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (project_id, skill_key) DO UPDATE SET
           state = EXCLUDED.state, reason = EXCLUDED.reason,
           updated_by_id = EXCLUDED.updated_by_id, updated_at = NOW()`,
        [organizationId, projectId, skillKey, state, reason, actor.userId],
      );
    }
    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      userId: actor.userId,
      action: AUDIT_ACTION[state ?? 'cleared'],
      resourceType: 'project_skill_settings',
      resourceId: `${projectId}:${skillKey}`,
      reason,
      ipAddress: actor.ipAddress ?? undefined,
      userAgent: actor.userAgent ?? undefined,
      details: { projectId, skillKey, previousState: previous, state, reason },
    });
    return { changed: true, state };
  });
}
