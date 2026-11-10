/**
 * Project Rollup Service
 *
 * Computes aggregate metrics for hierarchical projects (Program → Project → Study → Sub-project).
 * When a child project changes, its metrics bubble up through the hierarchy to the root.
 *
 * Rollup fields: progress (weighted avg), budget (sum), risk (worst-case), task counts,
 * module counts, milestone completion %, child status summary.
 *
 * A read (P-122 defects, 2026-11-10; docs/evidence/DESIGN/P-122/defects/2-rollup/):
 *   - the roll-up is computed when asked and written nowhere. getTree used to write every
 *     node's roll-up into projects.metadata and move its updated_at, so opening the project
 *     page's Plan step changed the project and each work project under it, and Projects said
 *     each was "updated" when someone had only looked. Nothing read the written copy.
 *   - risk is the worst of the levels RECORDED on the subtree's projects, and none when none is
 *     recorded. A missing or unknown level used to read as "medium", a risk nobody assessed.
 *
 * @module server/services/project-rollup-service.ts
 */

import { Pool } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RollupMetrics {
  /** Weighted average progress across children (0-100) */
  aggregateProgress: number;
  /** Sum of budgets across children */
  totalBudget: number;
  /** Worst risk level recorded on this project or below it; null when none is recorded */
  worstRiskLevel: RiskLevel | null;
  /** Total tasks across all descendants */
  totalTasks: number;
  /** Completed tasks across all descendants */
  completedTasks: number;
  /** Blocked tasks across all descendants */
  blockedTasks: number;
  /** Overdue tasks (past target date, not done) */
  overdueTasks: number;
  /** Number of direct children */
  childCount: number;
  /** Summary of child statuses */
  childStatusSummary: Record<string, number>;
  /** Number of linked modules across descendants */
  moduleCount: number;
  /** Deepest depth in the subtree */
  maxDepth: number;
  /** Budget status across children */
  budgetRollup: { withinBudget: number; atRisk: number; overBudget: number };
  /** Timestamp of computation */
  computedAt: string;
}

export interface ProjectTreeNode {
  id: number;
  name: string;
  code: string | null;
  status: string;
  priority: string;
  type: string;
  depth: number;
  path: string | null;
  progress: number;
  budget: number | null;
  budgetStatus: string;
  /** The risk level recorded on the project, as stored; null when none is recorded */
  riskLevel: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  ownerId: number | null;
  ownerName: string | null;
  rollup: RollupMetrics | null;
  children: ProjectTreeNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** A recorded risk level the engine can rank, or null: a missing or unknown one is not ranked as anything. */
function rankedRisk(value: string | null | undefined): RiskLevel | null {
  return (RISK_LEVELS as readonly string[]).includes(String(value)) ? (value as RiskLevel) : null;
}

/** The worse of two levels; one that is not recorded does not count. */
function worstRisk(a: RiskLevel | null, b: RiskLevel | null): RiskLevel | null {
  if (a === null || b === null) return a ?? b;
  return RISK_LEVELS[Math.max(RISK_LEVELS.indexOf(a), RISK_LEVELS.indexOf(b))];
}

// People are named through public.actor_name, not a join on users: since users
// took row-level security (D3, 2026-09-28) a tenant scope reads only current
// members, so the join dropped the name of anyone who had left
// (docs/evidence/D3/2026-09-29-actor-names/).
export class ProjectRollupService {
  constructor(private pool: Pool) {}

  /**
   * Get the full subtree rooted at projectId with rollup metrics computed bottom-up.
   */
  async getTree(projectId: number, organizationId: number): Promise<ProjectTreeNode | null> {
    // Fetch root project
    const rootResult = await this.pool.query(
      `SELECT p.*, u.name as owner_name
       FROM projects p LEFT JOIN LATERAL public.actor_name(p.owner_id) u ON TRUE
       WHERE p.id = $1 AND p.organization_id = $2`,
      [projectId, organizationId]
    );

    if (rootResult.rows.length === 0) return null;

    // Fetch all descendants using materialied path
    const root = rootResult.rows[0];
    const pathPrefix = root.path ? `${root.path}/${root.id}` : `${root.id}`;

    const descendantsResult = await this.pool.query(
      `SELECT p.*, u.name as owner_name
       FROM projects p LEFT JOIN LATERAL public.actor_name(p.owner_id) u ON TRUE
       WHERE p.organization_id = $1
         AND (p.path LIKE $2 || '/%' OR p.path = $2 OR p.parent_project_id = $3)
       ORDER BY p.depth ASC, p.name ASC`,
      [organizationId, pathPrefix, projectId]
    );

    // Build tree from flat list
    const allProjects = [root, ...descendantsResult.rows];
    const nodeMap = new Map<number, ProjectTreeNode>();

    for (const row of allProjects) {
      nodeMap.set(row.id, {
        id: row.id,
        name: row.name,
        code: row.code,
        status: row.status,
        priority: row.priority,
        type: row.type,
        depth: row.depth,
        path: row.path,
        progress: row.progress ?? 0,
        budget: row.budget,
        budgetStatus: row.budget_status || 'within-budget',
        riskLevel: row.risk_level ?? null,
        startDate: row.start_date,
        targetEndDate: row.target_end_date,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        rollup: null,
        children: [],
      });
    }

    // Link children to parents
    for (const row of allProjects) {
      if (row.parent_project_id && nodeMap.has(row.parent_project_id)) {
        const child = nodeMap.get(row.id)!;
        nodeMap.get(row.parent_project_id)!.children.push(child);
      }
    }

    // Compute rollups bottom-up (post-order traversal)
    // Pre-fetch task and module counts in bulk to avoid N+1 queries
    const allNodeIds = Array.from(nodeMap.keys());
    const [taskCountsMap, moduleCountsMap] = await Promise.all([
      this.batchFetchTaskCounts(allNodeIds, organizationId),
      this.batchFetchModuleCounts(allNodeIds, organizationId),
    ]);

    const rootNode = nodeMap.get(projectId)!;
    this.computeRollupFromCache(rootNode, taskCountsMap, moduleCountsMap);

    return rootNode;
  }

  /**
   * Fetch task counts for all project IDs in a single query.
   * Reads from project_tasks, the canonical writer table for PM workflows.
   */
  private async batchFetchTaskCounts(
    projectIds: number[],
    organizationId: number
  ): Promise<Map<number, { total: number; completed: number; blocked: number; overdue: number }>> {
    const map = new Map<
      number,
      { total: number; completed: number; blocked: number; overdue: number }
    >();
    if (projectIds.length === 0) return map;

    const result = await this.pool.query(
      `SELECT
         project_id,
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status = 'done')::int as completed,
         COUNT(*) FILTER (WHERE status = 'blocked')::int as blocked,
         COUNT(*) FILTER (WHERE status != 'done' AND due_date < NOW())::int as overdue
       FROM project_tasks
       WHERE project_id = ANY($1) AND organization_id = $2
       GROUP BY project_id`,
      [projectIds, organizationId]
    );

    for (const row of result.rows) {
      map.set(row.project_id, {
        total: row.total,
        completed: row.completed,
        blocked: row.blocked,
        overdue: row.overdue,
      });
    }
    return map;
  }

  /**
   * Fetch module counts for all project IDs in a single query.
   */
  private async batchFetchModuleCounts(
    projectIds: number[],
    organizationId: number
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (projectIds.length === 0) return map;

    const result = await this.pool.query(
      `SELECT project_id, COUNT(*)::int as count
       FROM project_modules
       WHERE project_id = ANY($1) AND organization_id = $2
       GROUP BY project_id`,
      [projectIds, organizationId]
    );

    for (const row of result.rows) {
      map.set(row.project_id, row.count);
    }
    return map;
  }

  /**
   * Compute rollup metrics using pre-fetched data (no additional DB queries).
   */
  private computeRollupFromCache(
    node: ProjectTreeNode,
    taskCountsMap: Map<
      number,
      { total: number; completed: number; blocked: number; overdue: number }
    >,
    moduleCountsMap: Map<number, number>
  ): RollupMetrics {
    // First, recurse into children
    const childRollups: RollupMetrics[] = [];
    for (const child of node.children) {
      childRollups.push(this.computeRollupFromCache(child, taskCountsMap, moduleCountsMap));
    }

    const tasks = taskCountsMap.get(node.id) || { total: 0, completed: 0, blocked: 0, overdue: 0 };
    const moduleCount = moduleCountsMap.get(node.id) || 0;

    const riskLevel = rankedRisk(node.riskLevel);

    // Aggregate
    let rollup: RollupMetrics;

    if (node.children.length === 0) {
      // Leaf node
      rollup = {
        aggregateProgress: node.progress,
        totalBudget: node.budget || 0,
        worstRiskLevel: riskLevel,
        totalTasks: tasks.total,
        completedTasks: tasks.completed,
        blockedTasks: tasks.blocked,
        overdueTasks: tasks.overdue,
        childCount: 0,
        childStatusSummary: {},
        moduleCount,
        maxDepth: node.depth,
        budgetRollup: {
          withinBudget: node.budgetStatus === 'within-budget' ? 1 : 0,
          atRisk: node.budgetStatus === 'at-risk' ? 1 : 0,
          overBudget: node.budgetStatus === 'over-budget' ? 1 : 0,
        },
        computedAt: new Date().toISOString(),
      };
    } else {
      // Aggregate children
      const childStatusSummary: Record<string, number> = {};
      for (const child of node.children) {
        childStatusSummary[child.status] = (childStatusSummary[child.status] || 0) + 1;
      }

      let risk: RiskLevel | null = riskLevel;
      for (const cr of childRollups) {
        risk = worstRisk(risk, cr.worstRiskLevel);
      }

      // Weighted average progress (weight by budget if available, else equal)
      let weightedProgress = 0;
      let totalWeight = 0;
      for (let i = 0; i < node.children.length; i++) {
        const weight = node.children[i].budget || 1;
        weightedProgress += childRollups[i].aggregateProgress * weight;
        totalWeight += weight;
      }
      const avgProgress =
        totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : node.progress;

      rollup = {
        aggregateProgress: avgProgress,
        totalBudget: (node.budget || 0) + childRollups.reduce((s, r) => s + r.totalBudget, 0),
        worstRiskLevel: risk,
        totalTasks: tasks.total + childRollups.reduce((s, r) => s + r.totalTasks, 0),
        completedTasks: tasks.completed + childRollups.reduce((s, r) => s + r.completedTasks, 0),
        blockedTasks: tasks.blocked + childRollups.reduce((s, r) => s + r.blockedTasks, 0),
        overdueTasks: tasks.overdue + childRollups.reduce((s, r) => s + r.overdueTasks, 0),
        childCount: node.children.length,
        childStatusSummary,
        moduleCount: moduleCount + childRollups.reduce((s, r) => s + r.moduleCount, 0),
        maxDepth: Math.max(node.depth, ...childRollups.map(r => r.maxDepth)),
        budgetRollup: {
          withinBudget:
            (node.budgetStatus === 'within-budget' ? 1 : 0) +
            childRollups.reduce((s, r) => s + r.budgetRollup.withinBudget, 0),
          atRisk:
            (node.budgetStatus === 'at-risk' ? 1 : 0) +
            childRollups.reduce((s, r) => s + r.budgetRollup.atRisk, 0),
          overBudget:
            (node.budgetStatus === 'over-budget' ? 1 : 0) +
            childRollups.reduce((s, r) => s + r.budgetRollup.overBudget, 0),
        },
        computedAt: new Date().toISOString(),
      };
    }

    node.rollup = rollup;
    return rollup;
  }

  /**
   * Get the ancestor chain from a project up to the root.
   */
  async getAncestors(
    projectId: number,
    organizationId: number
  ): Promise<Array<{ id: number; name: string; depth: number; status: string }>> {
    const result = await this.pool.query(
      `WITH RECURSIVE ancestors AS (
         SELECT id, name, depth, status, parent_project_id
         FROM projects
         WHERE id = $1 AND organization_id = $2
         UNION ALL
         SELECT p.id, p.name, p.depth, p.status, p.parent_project_id
         FROM projects p
         JOIN ancestors a ON p.id = a.parent_project_id
         WHERE p.organization_id = $2
       )
       SELECT id, name, depth, status FROM ancestors ORDER BY depth ASC`,
      [projectId, organizationId]
    );
    return result.rows;
  }

  /**
   * Recompute the materialized path for a project and all its descendants.
   * Called after insert or move operations.
   */
  async recomputePaths(projectId: number, organizationId: number): Promise<void> {
    // One recursive CTE rewrites the whole subtree. This used to be a JavaScript walk that
    // issued, per node, a parent-path lookup, an UPDATE and a children query before recursing
    // serially into each child — O(n) sequential round trips on a deep move, and, because
    // nothing wrapped the traversal, a failure part-way through left `path` half-rewritten.
    // Lookups in this service key off the materialized path (the LIKE prefix scans at
    // getTree and computeRelativeDepth), so a partial rewrite silently returns wrong
    // subtrees until someone notices. Note getTree builds its prefix as
    // `${root.path}/${root.id}`, which double-counts the root's own id under this format
    // and already misses grandchildren — a pre-existing bug this change neither causes nor
    // fixes; validateMove uses the format correctly. A single statement is atomic, so either the whole subtree moves
    // or none of it does; no explicit transaction is needed.
    //
    // The generated format has to match what the old walk produced byte for byte or existing
    // rows stop matching those prefix scans: a root project's path is its own id, and every
    // other path is `<parentPath>/<id>`, falling back to the bare parent id when the parent's
    // own path has not been materialized yet.
    //
    // organization_id is repeated on every branch — anchor row, parent-path lookup, recursive
    // child join, and the UPDATE itself — so a cross-org child can never be pulled into the
    // subtree or written through. RLS fails closed in production, but the predicate has to
    // stand on its own here too.
    //
    // `visited` guards against a parent_project_id cycle. validateMove is meant to reject
    // those, but a cycle that slipped in used to blow the JS stack (loud and immediate);
    // inside a recursive CTE it would instead spin forever holding a pool connection, so the
    // walk refuses to re-enter a node it has already emitted.
    await this.pool.query(
      `WITH RECURSIVE subtree AS (
         SELECT p.id,
                CASE
                  WHEN p.parent_project_id IS NULL THEN p.id::text
                  ELSE COALESCE(
                         NULLIF(
                           (SELECT parent.path FROM projects parent
                             WHERE parent.id = p.parent_project_id
                               AND parent.organization_id = $2),
                           ''
                         ),
                         p.parent_project_id::text
                       ) || '/' || p.id
                END AS path,
                ARRAY[p.id] AS visited
           FROM projects p
          WHERE p.id = $1 AND p.organization_id = $2
         UNION ALL
         SELECT c.id, s.path || '/' || c.id, s.visited || c.id
           FROM projects c
           JOIN subtree s ON c.parent_project_id = s.id
          WHERE c.organization_id = $2
            AND NOT c.id = ANY(s.visited)
       )
       UPDATE projects p
          SET path = s.path
         FROM subtree s
        WHERE p.id = s.id AND p.organization_id = $2`,
      [projectId, organizationId]
    );
  }

  /**
   * Validate a move operation — ensures no circular references and depth limit respected.
   */
  async validateMove(
    projectId: number,
    newParentId: number | null,
    maxDepth: number = 3,
    organizationId: number
  ): Promise<{ valid: boolean; reason?: string }> {
    if (newParentId === null) return { valid: true }; // Moving to root is always valid
    if (projectId === newParentId)
      return { valid: false, reason: 'Cannot make a project its own parent' };

    // Check that newParentId is not a descendant of projectId (circular reference).
    // Tenant-scoped: a cross-org parent id reads as "does not exist" instead of
    // leaking another org's hierarchy data.
    const proj = await this.pool.query(
      `SELECT path FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );
    const projPath = proj.rows[0]?.path;

    const newParent = await this.pool.query(
      `SELECT path, depth FROM projects WHERE id = $1 AND organization_id = $2`,
      [newParentId, organizationId]
    );
    if (newParent.rows.length === 0)
      return { valid: false, reason: 'Target parent does not exist' };

    const parentPath = newParent.rows[0]?.path;
    if (parentPath && projPath && parentPath.startsWith(projPath)) {
      return {
        valid: false,
        reason: 'Cannot move a project under its own descendant (circular reference)',
      };
    }

    // Check depth limit
    const parentDepth = newParent.rows[0].depth;
    // Get max depth of projectId subtree
    const subtreeResult = await this.pool.query(
      `SELECT MAX(depth) - $1 as relative_depth FROM projects WHERE organization_id = $3 AND path LIKE $2 || '/%'`,
      [parentDepth, projPath || String(projectId), organizationId]
    );
    const subtreeRelativeDepth = subtreeResult.rows[0]?.relative_depth || 0;
    const newMaxDepth = parentDepth + 1 + subtreeRelativeDepth;

    if (newMaxDepth > maxDepth) {
      return {
        valid: false,
        reason: `Move would exceed maximum hierarchy depth of ${maxDepth + 1} levels`,
      };
    }

    return { valid: true };
  }
}
