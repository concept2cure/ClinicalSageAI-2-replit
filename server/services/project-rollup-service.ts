/**
 * Project Rollup Service
 *
 * Computes aggregate metrics for hierarchical projects (Program → Project → Study → Sub-project).
 * When a child project changes, its metrics bubble up through the hierarchy to the root.
 *
 * Rollup fields: progress (weighted avg), budget (sum), risk (worst-case), task counts,
 * module counts, milestone completion %, child status summary.
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
  /** Worst-case risk level across children */
  worstRiskLevel: 'low' | 'medium' | 'high' | 'critical';
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
  riskLevel: string;
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

function worstRisk(a: string, b: string): 'low' | 'medium' | 'high' | 'critical' {
  const ai = RISK_LEVELS.indexOf(a as any);
  const bi = RISK_LEVELS.indexOf(b as any);
  return RISK_LEVELS[Math.max(ai >= 0 ? ai : 1, bi >= 0 ? bi : 1)];
}

export class ProjectRollupService {
  constructor(private pool: Pool) {}

  /**
   * Get the full subtree rooted at projectId with rollup metrics computed bottom-up.
   */
  async getTree(projectId: number, organizationId: number): Promise<ProjectTreeNode | null> {
    // Fetch root project
    const rootResult = await this.pool.query(
      `SELECT p.*, u.name as owner_name
       FROM projects p LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.id = $1 AND p.organization_id = $2`,
      [projectId, organizationId]
    );

    if (rootResult.rows.length === 0) return null;

    // Fetch all descendants using materialied path
    const root = rootResult.rows[0];
    const pathPrefix = root.path ? `${root.path}/${root.id}` : `${root.id}`;

    const descendantsResult = await this.pool.query(
      `SELECT p.*, u.name as owner_name
       FROM projects p LEFT JOIN users u ON p.owner_id = u.id
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
        riskLevel: row.risk_level || 'medium',
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
    const rootNode = nodeMap.get(projectId)!;
    await this.computeRollupRecursive(rootNode, organizationId);

    return rootNode;
  }

  /**
   * Compute rollup metrics for a node and all its descendants (post-order).
   */
  private async computeRollupRecursive(
    node: ProjectTreeNode,
    organizationId: number
  ): Promise<RollupMetrics> {
    // First, recurse into children
    const childRollups: RollupMetrics[] = [];
    for (const child of node.children) {
      childRollups.push(await this.computeRollupRecursive(child, organizationId));
    }

    // Get task counts for this specific project
    const taskResult = await this.pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status = 'done')::int as completed,
         COUNT(*) FILTER (WHERE status = 'blocked')::int as blocked,
         COUNT(*) FILTER (WHERE status != 'done' AND due_date < NOW())::int as overdue
       FROM unified_tasks
       WHERE project_id = $1`,
      [node.id]
    );

    const tasks = taskResult.rows[0] || { total: 0, completed: 0, blocked: 0, overdue: 0 };

    // Get module count for this project
    const moduleResult = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM project_modules WHERE project_id = $1`,
      [node.id]
    );
    const moduleCount = moduleResult.rows[0]?.count || 0;

    // Aggregate
    let rollup: RollupMetrics;

    if (node.children.length === 0) {
      // Leaf node
      rollup = {
        aggregateProgress: node.progress,
        totalBudget: node.budget || 0,
        worstRiskLevel: (node.riskLevel as any) || 'medium',
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

      let risk: 'low' | 'medium' | 'high' | 'critical' = (node.riskLevel as any) || 'medium';
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

    // Persist rollup to project metadata for fast reads
    await this.pool.query(
      `UPDATE projects
       SET metadata = COALESCE(metadata, '{}'::json)::jsonb || jsonb_build_object('rollup', $1::jsonb),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(rollup), node.id]
    );

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
  async recomputePaths(projectId: number): Promise<void> {
    // Get the parent's path
    const projResult = await this.pool.query(
      `SELECT id, parent_project_id FROM projects WHERE id = $1`,
      [projectId]
    );
    if (projResult.rows.length === 0) return;

    const proj = projResult.rows[0];
    let newPath: string;

    if (!proj.parent_project_id) {
      newPath = String(proj.id);
    } else {
      const parentResult = await this.pool.query(`SELECT path FROM projects WHERE id = $1`, [
        proj.parent_project_id,
      ]);
      const parentPath = parentResult.rows[0]?.path || String(proj.parent_project_id);
      newPath = `${parentPath}/${proj.id}`;
    }

    // Update self
    await this.pool.query(`UPDATE projects SET path = $1 WHERE id = $2`, [newPath, projectId]);

    // Recursively update children
    const children = await this.pool.query(`SELECT id FROM projects WHERE parent_project_id = $1`, [
      projectId,
    ]);
    for (const child of children.rows) {
      await this.recomputePaths(child.id);
    }
  }

  /**
   * Validate a move operation — ensures no circular references and depth limit respected.
   */
  async validateMove(
    projectId: number,
    newParentId: number | null,
    maxDepth: number = 3
  ): Promise<{ valid: boolean; reason?: string }> {
    if (newParentId === null) return { valid: true }; // Moving to root is always valid
    if (projectId === newParentId)
      return { valid: false, reason: 'Cannot make a project its own parent' };

    // Check that newParentId is not a descendant of projectId (circular reference)
    const proj = await this.pool.query(`SELECT path FROM projects WHERE id = $1`, [projectId]);
    const projPath = proj.rows[0]?.path;

    const newParent = await this.pool.query(`SELECT path, depth FROM projects WHERE id = $1`, [
      newParentId,
    ]);
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
      `SELECT MAX(depth) - $1 as relative_depth FROM projects WHERE path LIKE $2 || '/%'`,
      [parentDepth, projPath || String(projectId)]
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
