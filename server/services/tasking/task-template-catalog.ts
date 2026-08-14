/**
 * Workflow-template listing — the org's stored templates merged with the
 * built-in catalog, in the shape the "Start workflow" picker renders.
 *
 * This is the read half of the template journey, and it is the half that was
 * missing: the list route selected only from `task_templates`, so on every
 * install with no seeded rows (which is all of them — nothing seeds that table
 * and there is no UI to author one) the picker got `[]` and its Create button
 * stayed disabled, even though the from-template route accepted the built-in
 * ids the whole time.
 *
 * Extracted from taskManagement.routes.ts, which sits against the repo-health
 * 1500-line gate. Same precedent as task-analytics.ts / task-planning.ts.
 *
 * @module server/services/tasking/task-template-catalog
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { taskTemplates } from '../../../shared/schema';
import { BUILTIN_WORKFLOW_TEMPLATES } from './workflow-templates';

/**
 * Cap on how many task definitions ride along in a preview. The picker shows
 * them before anything is written, so the list must stay small — but it must
 * also say when it truncated, rather than quietly showing fewer tasks than the
 * instantiate route will create.
 */
export const MAX_TEMPLATE_TASK_PREVIEW = 50;

export interface TemplatePreview {
  templateId: string;
  name: string;
  description: string | null;
  category: string | null;
  submissionType: string | null;
  milestone: string | null;
  isDefault: boolean;
  version: number;
  usageCount: number;
  taskCount: number;
  dependencyCount: number;
  /** Days from start to the last task's end; 0 when no definition carries timing. */
  spanDays: number;
  /** Sum of estimatedHours across definitions; 0 when none carry it. */
  estimatedHours: number;
  tasks: Array<{
    id: string;
    title: string;
    moduleType: string;
    priority: string;
    dayOffset: number;
    duration: number;
  }>;
  tasksTruncated: boolean;
  /** True for catalog entries, so the picker can label them and an admin knows
   *  an org template of the same id would override it. */
  builtin: boolean;
}

/** Shared shape logic, so a stored template and a built-in cannot disagree. */
function toPreview(
  src: {
    templateId: string;
    name: string;
    description?: string | null;
    category?: string | null;
    submissionType?: string | null;
    milestone?: string | null;
    isDefault?: boolean | null;
    version?: number | null;
    usageCount?: number | null;
    tasks?: unknown;
    dependencies?: unknown;
  },
  builtin: boolean
): TemplatePreview {
  const defs = Array.isArray(src.tasks) ? (src.tasks as any[]) : [];
  const deps = Array.isArray(src.dependencies) ? (src.dependencies as any[]) : [];
  // Span and effort come from the SAME fields the instantiate route consumes
  // (dayOffset / duration / estimatedHours), so the preview a user approves
  // cannot disagree with what actually gets written.
  const spanDays = defs.reduce(
    (max, d) => Math.max(max, Number(d?.dayOffset ?? 0) + Number(d?.duration ?? 0)),
    0
  );
  return {
    templateId: src.templateId,
    name: src.name,
    description: src.description ?? null,
    category: src.category ?? null,
    submissionType: src.submissionType ?? null,
    milestone: src.milestone ?? null,
    isDefault: src.isDefault ?? false,
    version: src.version ?? 1,
    usageCount: src.usageCount ?? 0,
    taskCount: defs.length,
    dependencyCount: deps.length,
    spanDays,
    estimatedHours: defs.reduce((sum, d) => sum + Number(d?.estimatedHours ?? 0), 0),
    tasks: defs.slice(0, MAX_TEMPLATE_TASK_PREVIEW).map(d => ({
      id: String(d?.id ?? ''),
      title: String(d?.title ?? ''),
      moduleType: String(d?.moduleType ?? 'general'),
      priority: String(d?.priority ?? 'medium'),
      dayOffset: Number(d?.dayOffset ?? 0),
      duration: Number(d?.duration ?? 0),
    })),
    tasksTruncated: defs.length > MAX_TEMPLATE_TASK_PREVIEW,
    builtin,
  };
}

/**
 * The org's active templates PLUS the built-in catalog. An org template of the
 * same templateId overrides the built-in — one entry, theirs.
 *
 * `organizationId` must already be the verified JWT org, never request input.
 * An unprovisioned `task_templates` degrades to catalog-only rather than 500,
 * matching the from-template route's own 42P01 guard: that is precisely the
 * situation the catalog exists to cover.
 */
export async function listTemplatesForOrg(organizationId: number): Promise<TemplatePreview[]> {
  let rows: Array<typeof taskTemplates.$inferSelect> = [];
  try {
    rows = await db
      .select()
      .from(taskTemplates)
      .where(
        and(eq(taskTemplates.organizationId, organizationId), eq(taskTemplates.isActive, true))
      )
      .orderBy(taskTemplates.name);
  } catch (err: any) {
    if (err?.code !== '42P01') throw err;
  }

  const stored = rows.map(r => toPreview(r as any, false));
  const storedIds = new Set(stored.map(t => t.templateId));
  const builtins = BUILTIN_WORKFLOW_TEMPLATES.filter(b => !storedIds.has(b.templateId)).map(b =>
    toPreview(b as any, true)
  );
  return [...stored, ...builtins];
}
