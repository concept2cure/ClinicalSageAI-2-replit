/**
 * Module 3 contradictions → real, assignable work.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * `deriveImpactTasks()` has always turned each detected contradiction into a
 * title, a priority and a list of required reviewers — and the contradiction
 * sweep returned that array to the caller and threw it away. So the one place
 * the product knows exactly who needs to do what ("Formulation Scientist and
 * Analytical Lead must resolve a dissolution failure affecting 3.2.P.2 and
 * 3.2.P.5") produced a number on a screen and never a task anyone was holding.
 *
 * This routes it into `unified_tasks` through the central `unifiedTaskService`,
 * which is what every other module's work already flows through — the same
 * service, the same board, the same assignment and status model. Nothing about
 * task management is reimplemented here.
 *
 * ── Why the sweep must not own these rows ─────────────────────────────────────
 * The contradiction sweep is idempotent by DELETE-then-INSERT: every run
 * replaces `cmc_contradictions` wholesale. Tasks cannot work that way. A task
 * that has been assigned, commented on, started or linked carries human state
 * the sweep knows nothing about, and deleting it on the next sweep would destroy
 * that. So this is strictly ADDITIVE:
 *
 *   • one task per (project, contradiction type), created only if absent;
 *   • an existing task is left completely alone — not retitled, not reprioritised,
 *     not reopened. It is somebody's work item now;
 *   • a contradiction that has since been resolved does NOT close its task here.
 *     Whether the work is done is a judgment its owner records, and a sweep
 *     silently closing assigned work would be worse than leaving it open.
 *
 * ── Failure is non-blocking, but never silent ─────────────────────────────────
 * Contradiction detection is the primary answer. If tasking is unavailable, the
 * sweep must still return its findings — but the caller is told tasks were not
 * created, rather than being left to assume they were.
 *
 * @module server/services/cmc/contradiction-tasks
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db';
import * as schema from '../../../shared/schema';
import unifiedTaskService from '../unifiedTaskService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('cmc-contradiction-tasks');

export interface ContradictionForTask {
  contradictionType: string;
  severity: string;
  details?: string | null;
  impactedSections?: string[] | null;
  requiredReviewers?: string[] | null;
}

export interface ContradictionTaskSync {
  created: number;
  existing: number;
  /** Present only when tasking could not run; the sweep still succeeded. */
  error?: string;
}

/**
 * A stable identity for "the task about this contradiction".
 *
 * Keyed on the project and the contradiction TYPE, not on the
 * `cmc_contradictions` row id — that row is deleted and re-inserted on every
 * sweep, so its id would make every run look like a brand-new contradiction and
 * pile up a duplicate task each time.
 */
export function contradictionTaskKey(projectUuid: string, contradictionType: string): string {
  return `cmc-contradiction:${projectUuid}:${contradictionType}`;
}

/** Contradiction severity → the task board's priority vocabulary. */
function priorityFor(severity: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (String(severity).toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'low': return 'low';
    default: return 'medium';
  }
}

/**
 * The integer project id the task board keys on, for a uuid program id.
 *
 * `projects.regulatory_program_id` is the Document Identity Contract's C1
 * bridge between the uuid spine every v2 surface uses and the integer PM spine
 * `unified_tasks.project_id` references. Not being anchored is a valid and
 * common state, so this returns undefined rather than failing — the task is
 * still created, still org-scoped, and still carries the uuid in its metadata;
 * it simply will not appear under a project filter until the project is
 * anchored.
 */
async function resolveProjectId(
  organizationId: number,
  projectUuid: string
): Promise<number | undefined> {
  try {
    const [row] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.regulatoryProgramId, projectUuid),
          eq(schema.projects.organizationId, organizationId)
        )
      )
      .limit(1);
    return row?.id;
  } catch {
    return undefined;
  }
}

/**
 * Create a task for every contradiction that does not already have one.
 *
 * Returns counts rather than the rows: the caller is a detection endpoint whose
 * answer is the contradictions, and it reports tasking as an outcome alongside
 * them.
 */
export async function syncContradictionTasks(input: {
  organizationId: number;
  projectUuid: string;
  contradictions: ContradictionForTask[];
}): Promise<ContradictionTaskSync> {
  const { organizationId, projectUuid, contradictions } = input;
  if (!contradictions.length) return { created: 0, existing: 0 };

  try {
    const projectId = await resolveProjectId(organizationId, projectUuid);
    let created = 0;
    let existing = 0;

    for (const c of contradictions) {
      const key = contradictionTaskKey(projectUuid, c.contradictionType);

      /* Scoped by organization as well as key. The equivalent check in
         unifiedTaskService.syncCMCTasks matches on sourceEntityId + moduleType
         only, which lets one tenant's row suppress another's task; there is no
         reason to copy that here. Archived tasks (soft delete) do not count as
         existing — if the work item was deleted, a live contradiction should
         raise it again. */
      const [already] = await db
        .select({ id: schema.unifiedTasks.id })
        .from(schema.unifiedTasks)
        .where(
          and(
            eq(schema.unifiedTasks.organizationId, organizationId),
            eq(schema.unifiedTasks.moduleType, 'CMC'),
            eq(schema.unifiedTasks.sourceEntityId, key),
            isNull(schema.unifiedTasks.deletedAt)
          )
        )
        .limit(1);

      if (already) {
        existing++;
        continue;
      }

      const sections = Array.isArray(c.impactedSections) ? c.impactedSections : [];
      const reviewers = Array.isArray(c.requiredReviewers) ? c.requiredReviewers : [];

      await unifiedTaskService.createUnifiedTask({
        moduleType: 'CMC',
        title: `Resolve ${c.contradictionType}`,
        /* The detail is the whole value of the task — it names what actually
           conflicts. A title alone would send someone back to the sweep. */
        description: [
          c.details || '',
          sections.length ? `Impacted sections: ${sections.join(', ')}.` : '',
          reviewers.length ? `Required reviewers: ${reviewers.join(', ')}.` : '',
          'Raised by the Module 3 contradiction sweep. Resolving the underlying data clears the contradiction; this task is not closed automatically.',
        ].filter(Boolean).join(' '),
        category: 'module3-contradiction',
        taskType: 'action',
        priority: priorityFor(c.severity),
        sourceEntityId: key,
        sourceEntityType: 'cmc_contradiction',
        tags: ['module-3', 'contradiction', ...sections],
        metadata: {
          contradictionType: c.contradictionType,
          severity: c.severity,
          impactedSections: sections,
          requiredReviewers: reviewers,
          projectUuid,
        },
        organizationId,
        projectId,
      });
      created++;
    }

    return { created, existing };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Contradiction task sync failed', { projectUuid, error: message });
    // The sweep's own answer stands; the caller reports that tasks did not land.
    return { created: 0, existing: 0, error: message };
  }
}
