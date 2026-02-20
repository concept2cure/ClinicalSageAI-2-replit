/**
 * AI Sentinel — Core Service
 *
 * Proactive monitoring system with 5 analyzer types:
 *   1. Deadline Risk   — Projects/tasks approaching or past due dates
 *   2. Cross-Project   — Resource conflicts, dependency chains, timeline overlaps
 *   3. Regulatory Change — Compliance gaps from regulatory updates
 *   4. Quality Drift    — Declining task completion, increasing blockers
 *   5. Budget Burn      — Spend rate vs. progress tracking
 *
 * Each analyzer runs independently and produces SentinelFindings that are
 * persisted and optionally fed into the rules engine for automated response.
 *
 * @module server/services/sentinel/sentinel.ts
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  SentinelAnalyzerType,
  SentinelFinding,
  AnalyzerResult,
  SentinelConfig,
  FindingSeverity,
} from './types';
import { DEFAULT_SENTINEL_CONFIG } from './types';

export class AISentinel {
  private configs = new Map<number, SentinelConfig>();

  constructor(private pool: Pool) {}

  // ── Configuration ────────────────────────────────────────────────────────

  async getConfig(organizationId: number): Promise<SentinelConfig> {
    if (this.configs.has(organizationId)) return this.configs.get(organizationId)!;

    const result = await this.pool.query(
      `SELECT metadata FROM pm_settings WHERE organization_id = $1 AND key = 'sentinel_config'`,
      [organizationId]
    );

    const config: SentinelConfig =
      result.rows.length > 0
        ? { organizationId, ...DEFAULT_SENTINEL_CONFIG, ...result.rows[0].metadata }
        : { organizationId, ...DEFAULT_SENTINEL_CONFIG };

    this.configs.set(organizationId, config);
    return config;
  }

  async updateConfig(
    organizationId: number,
    update: Partial<SentinelConfig>
  ): Promise<SentinelConfig> {
    const current = await this.getConfig(organizationId);
    const merged = { ...current, ...update, organizationId };

    await this.pool.query(
      `INSERT INTO pm_settings (organization_id, key, value, metadata, updated_at)
       VALUES ($1, 'sentinel_config', 'sentinel', $2, NOW())
       ON CONFLICT (organization_id, key) DO UPDATE SET metadata = $2, updated_at = NOW()`,
      [organizationId, JSON.stringify(merged)]
    );

    this.configs.set(organizationId, merged);
    return merged;
  }

  // ── Full Scan ────────────────────────────────────────────────────────────

  /**
   * Run all enabled analyzers for an organization. Returns all findings.
   */
  async scan(organizationId: number): Promise<AnalyzerResult[]> {
    const config = await this.getConfig(organizationId);
    const results: AnalyzerResult[] = [];

    const analyzerMap: Record<SentinelAnalyzerType, () => Promise<AnalyzerResult>> = {
      deadline_risk: () => this.analyzeDeadlineRisk(organizationId, config),
      cross_project: () => this.analyzeCrossProject(organizationId, config),
      regulatory_change: () => this.analyzeRegulatoryChange(organizationId, config),
      quality_drift: () => this.analyzeQualityDrift(organizationId, config),
      budget_burn: () => this.analyzeBudgetBurn(organizationId, config),
    };

    for (const [type, enabled] of Object.entries(config.analyzers)) {
      if (!enabled) continue;
      const analyzerType = type as SentinelAnalyzerType;
      try {
        const result = await analyzerMap[analyzerType]();
        results.push(result);

        // Persist findings
        for (const finding of result.findings) {
          await this.persistFinding(finding);
        }

        console.log(
          `[Sentinel] ${analyzerType}: ${result.findings.length} findings from ${result.projectsScanned} projects in ${result.durationMs}ms`
        );
      } catch (error) {
        console.error(`[Sentinel] ${analyzerType} analyzer failed:`, error);
      }
    }

    return results;
  }

  /**
   * Run a single analyzer type for testing/on-demand.
   */
  async scanSingle(
    organizationId: number,
    analyzerType: SentinelAnalyzerType
  ): Promise<AnalyzerResult> {
    const config = await this.getConfig(organizationId);
    const analyzerMap: Record<SentinelAnalyzerType, () => Promise<AnalyzerResult>> = {
      deadline_risk: () => this.analyzeDeadlineRisk(organizationId, config),
      cross_project: () => this.analyzeCrossProject(organizationId, config),
      regulatory_change: () => this.analyzeRegulatoryChange(organizationId, config),
      quality_drift: () => this.analyzeQualityDrift(organizationId, config),
      budget_burn: () => this.analyzeBudgetBurn(organizationId, config),
    };

    const result = await analyzerMap[analyzerType]();
    for (const finding of result.findings) {
      await this.persistFinding(finding);
    }
    return result;
  }

  // ── Analyzer 1: Deadline Risk ────────────────────────────────────────────

  private async analyzeDeadlineRisk(
    orgId: number,
    config: SentinelConfig
  ): Promise<AnalyzerResult> {
    const start = Date.now();
    const findings: SentinelFinding[] = [];
    const warningDays = config.thresholds.deadlineWarningDays;

    // Projects approaching deadline
    const projectsResult = await this.pool.query(
      `SELECT id, name, status, target_end_date, progress, risk_level, depth, parent_project_id
       FROM projects
       WHERE organization_id = $1
         AND status NOT IN ('completed', 'archived')
         AND target_end_date IS NOT NULL
         AND target_end_date <= NOW() + INTERVAL '${warningDays} days'
       ORDER BY target_end_date ASC`,
      [orgId]
    );

    for (const proj of projectsResult.rows) {
      const daysLeft = Math.ceil(
        (new Date(proj.target_end_date).getTime() - Date.now()) / 86400000
      );
      const isOverdue = daysLeft < 0;
      const severity: FindingSeverity = isOverdue
        ? 'critical'
        : daysLeft <= 3
          ? 'high'
          : daysLeft <= 7
            ? 'medium'
            : 'low';

      findings.push({
        findingId: uuidv4(),
        organizationId: orgId,
        projectId: proj.id,
        analyzerType: 'deadline_risk',
        severity,
        title: isOverdue
          ? `Project "${proj.name}" is ${Math.abs(daysLeft)} days overdue`
          : `Project "${proj.name}" deadline in ${daysLeft} days`,
        summary: `Project at ${proj.progress || 0}% progress with ${isOverdue ? 'expired' : 'approaching'} deadline. Current risk: ${proj.risk_level || 'unknown'}.`,
        details: {
          targetDate: proj.target_end_date,
          daysRemaining: daysLeft,
          progress: proj.progress || 0,
          currentRisk: proj.risk_level,
          depth: proj.depth,
          parentProjectId: proj.parent_project_id,
        },
        recommendations: isOverdue
          ? [
              'Review project scope for reduction',
              'Escalate to project sponsor',
              'Consider additional resources',
            ]
          : [
              'Review remaining task backlog',
              'Identify and remove blockers',
              'Consider timeline extension if < 50% complete',
            ],
        affectedItems: [{ type: 'project', id: proj.id, label: proj.name }],
        status: 'open',
        metadata: { analyzerVersion: '1.0', scanTimestamp: new Date().toISOString() },
        createdAt: new Date(),
      });
    }

    // Overdue tasks across organization
    const tasksResult = await this.pool.query(
      `SELECT t.id, t.title, t.project_id, t.due_date, t.priority, p.name as project_name
       FROM unified_tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.organization_id = $1
         AND t.status NOT IN ('done', 'cancelled')
         AND t.due_date < NOW()
       ORDER BY t.due_date ASC
       LIMIT 50`,
      [orgId]
    );

    if (tasksResult.rows.length > 0) {
      // Group by project
      const byProject = new Map<number, any[]>();
      for (const task of tasksResult.rows) {
        if (!byProject.has(task.project_id)) byProject.set(task.project_id, []);
        byProject.get(task.project_id)!.push(task);
      }

      for (const [projectId, tasks] of byProject) {
        const criticalCount = tasks.filter((t: any) => t.priority === 'critical').length;
        const severity: FindingSeverity =
          criticalCount > 0 ? 'high' : tasks.length > 5 ? 'high' : 'medium';

        findings.push({
          findingId: uuidv4(),
          organizationId: orgId,
          projectId,
          analyzerType: 'deadline_risk',
          severity,
          title: `${tasks.length} overdue tasks in "${tasks[0].project_name}"`,
          summary: `${tasks.length} tasks past due date. ${criticalCount} are critical priority.`,
          details: {
            overdueTaskCount: tasks.length,
            criticalCount,
            taskIds: tasks.map((t: any) => t.id),
          },
          recommendations: [
            'Review task assignments',
            'Prioritize critical items',
            'Consider deadline renegotiation',
          ],
          affectedItems: tasks.map((t: any) => ({ type: 'task', id: t.id, label: t.title })),
          status: 'open',
          metadata: {},
          createdAt: new Date(),
        });
      }
    }

    return {
      findings,
      analyzerType: 'deadline_risk',
      durationMs: Date.now() - start,
      projectsScanned: projectsResult.rows.length,
      timestamp: new Date(),
    };
  }

  // ── Analyzer 2: Cross-Project Intelligence ──────────────────────────────

  private async analyzeCrossProject(
    orgId: number,
    _config: SentinelConfig
  ): Promise<AnalyzerResult> {
    const start = Date.now();
    const findings: SentinelFinding[] = [];

    // Find resource over-allocation (users assigned to too many active projects)
    const resourceResult = await this.pool.query(
      `SELECT u.id as user_id, u.name as user_name,
              COUNT(DISTINCT t.project_id)::int as active_projects,
              COUNT(t.id)::int as open_tasks,
              ARRAY_AGG(DISTINCT p.name) as project_names,
              ARRAY_AGG(DISTINCT p.id) as project_ids
       FROM users u
       JOIN unified_tasks t ON t.assignee_id = u.id
       JOIN projects p ON t.project_id = p.id
       WHERE p.organization_id = $1
         AND p.status = 'active'
         AND t.status NOT IN ('done', 'cancelled')
       GROUP BY u.id, u.name
       HAVING COUNT(DISTINCT t.project_id) > 3
       ORDER BY active_projects DESC`,
      [orgId]
    );

    for (const row of resourceResult.rows) {
      findings.push({
        findingId: uuidv4(),
        organizationId: orgId,
        projectId: row.project_ids[0],
        analyzerType: 'cross_project',
        severity: row.active_projects > 5 ? 'high' : 'medium',
        title: `${row.user_name} is spread across ${row.active_projects} active projects`,
        summary: `Resource over-allocation: ${row.open_tasks} open tasks across ${row.active_projects} projects.`,
        details: {
          userId: row.user_id,
          activeProjects: row.active_projects,
          openTasks: row.open_tasks,
          projectNames: row.project_names,
          projectIds: row.project_ids,
        },
        recommendations: [
          'Consider redistributing tasks to balance workload',
          'Review task priorities across projects',
          'Assess if additional resources are needed',
        ],
        affectedItems: row.project_ids.map((id: number, i: number) => ({
          type: 'project',
          id,
          label: row.project_names[i],
        })),
        status: 'open',
        metadata: {},
        createdAt: new Date(),
      });
    }

    // Find sibling project timeline conflicts (under same parent)
    const siblingResult = await this.pool.query(
      `SELECT p1.id as p1_id, p1.name as p1_name, p1.target_end_date as p1_end,
              p2.id as p2_id, p2.name as p2_name, p2.start_date as p2_start,
              p1.parent_project_id
       FROM projects p1
       JOIN projects p2 ON p1.parent_project_id = p2.parent_project_id
         AND p1.id < p2.id
       WHERE p1.organization_id = $1
         AND p1.parent_project_id IS NOT NULL
         AND p1.target_end_date IS NOT NULL
         AND p2.start_date IS NOT NULL
         AND p1.target_end_date > p2.start_date
         AND p1.status NOT IN ('completed', 'archived')
         AND p2.status NOT IN ('completed', 'archived')`,
      [orgId]
    );

    for (const row of siblingResult.rows) {
      findings.push({
        findingId: uuidv4(),
        organizationId: orgId,
        projectId: row.parent_project_id,
        analyzerType: 'cross_project',
        severity: 'medium',
        title: `Timeline overlap: "${row.p1_name}" and "${row.p2_name}"`,
        summary: `Sibling projects under the same parent have overlapping timelines. "${row.p1_name}" ends after "${row.p2_name}" starts.`,
        details: {
          project1: { id: row.p1_id, name: row.p1_name, endDate: row.p1_end },
          project2: { id: row.p2_id, name: row.p2_name, startDate: row.p2_start },
        },
        recommendations: [
          'Review if sequential execution is required',
          'Adjust timelines to avoid resource conflicts',
        ],
        affectedItems: [
          { type: 'project', id: row.p1_id, label: row.p1_name },
          { type: 'project', id: row.p2_id, label: row.p2_name },
        ],
        status: 'open',
        metadata: {},
        createdAt: new Date(),
      });
    }

    return {
      findings,
      analyzerType: 'cross_project',
      durationMs: Date.now() - start,
      projectsScanned: resourceResult.rows.length + siblingResult.rows.length,
      timestamp: new Date(),
    };
  }

  // ── Analyzer 3: Regulatory Change Impact ────────────────────────────────

  private async analyzeRegulatoryChange(
    orgId: number,
    _config: SentinelConfig
  ): Promise<AnalyzerResult> {
    const start = Date.now();
    const findings: SentinelFinding[] = [];

    // Check if there are regulatory submission projects missing key modules
    const regResult = await this.pool.query(
      `SELECT p.id, p.name, p.type, p.status,
              (SELECT COUNT(*)::int FROM project_modules pm WHERE pm.project_id = p.id) as module_count,
              (SELECT COUNT(*)::int FROM project_modules pm WHERE pm.project_id = p.id AND pm.status = 'completed') as completed_modules
       FROM projects p
       WHERE p.organization_id = $1
         AND p.type = 'regulatory_submission'
         AND p.status NOT IN ('completed', 'archived')`,
      [orgId]
    );

    for (const proj of regResult.rows) {
      if (proj.module_count === 0) {
        findings.push({
          findingId: uuidv4(),
          organizationId: orgId,
          projectId: proj.id,
          analyzerType: 'regulatory_change',
          severity: 'high',
          title: `Regulatory project "${proj.name}" has no linked modules`,
          summary:
            'A regulatory submission project has no CER, eCTD, or protocol modules linked. This may result in incomplete submissions.',
          details: { projectType: proj.type, moduleCount: 0 },
          recommendations: [
            'Link required regulatory modules (CER, eCTD)',
            'Review submission timeline against regulatory deadlines',
            'Ensure all required documentation modules are activated',
          ],
          affectedItems: [{ type: 'project', id: proj.id, label: proj.name }],
          status: 'open',
          metadata: {},
          createdAt: new Date(),
        });
      } else if (proj.completed_modules < proj.module_count * 0.5) {
        findings.push({
          findingId: uuidv4(),
          organizationId: orgId,
          projectId: proj.id,
          analyzerType: 'regulatory_change',
          severity: 'medium',
          title: `Regulatory project "${proj.name}" module completion below 50%`,
          summary: `Only ${proj.completed_modules}/${proj.module_count} modules complete.`,
          details: { moduleCount: proj.module_count, completedModules: proj.completed_modules },
          recommendations: ['Prioritize module completion', 'Review blocking dependencies'],
          affectedItems: [{ type: 'project', id: proj.id, label: proj.name }],
          status: 'open',
          metadata: {},
          createdAt: new Date(),
        });
      }
    }

    return {
      findings,
      analyzerType: 'regulatory_change',
      durationMs: Date.now() - start,
      projectsScanned: regResult.rows.length,
      timestamp: new Date(),
    };
  }

  // ── Analyzer 4: Quality Drift ───────────────────────────────────────────

  private async analyzeQualityDrift(
    orgId: number,
    config: SentinelConfig
  ): Promise<AnalyzerResult> {
    const start = Date.now();
    const findings: SentinelFinding[] = [];
    const threshold = config.thresholds.qualityDriftThreshold;

    // Per-project task health
    const qualityResult = await this.pool.query(
      `SELECT p.id, p.name,
              COUNT(t.id)::int as total_tasks,
              COUNT(t.id) FILTER (WHERE t.status = 'done')::int as done_tasks,
              COUNT(t.id) FILTER (WHERE t.status = 'blocked')::int as blocked_tasks,
              COUNT(t.id) FILTER (WHERE t.status != 'done' AND t.due_date < NOW())::int as overdue_tasks,
              CASE WHEN COUNT(t.id) > 0
                THEN ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.status = 'done') / COUNT(t.id))
                ELSE 100 END as completion_rate
       FROM projects p
       LEFT JOIN unified_tasks t ON t.project_id = p.id
       WHERE p.organization_id = $1
         AND p.status = 'active'
       GROUP BY p.id, p.name
       HAVING COUNT(t.id) >= 5`,
      [orgId]
    );

    for (const row of qualityResult.rows) {
      const completionRate = parseInt(row.completion_rate);
      const blockRate = row.total_tasks > 0 ? (row.blocked_tasks / row.total_tasks) * 100 : 0;

      if (completionRate < threshold) {
        const severity: FindingSeverity =
          completionRate < 25 ? 'critical' : completionRate < threshold ? 'high' : 'medium';
        findings.push({
          findingId: uuidv4(),
          organizationId: orgId,
          projectId: row.id,
          analyzerType: 'quality_drift',
          severity,
          title: `Quality drift: "${row.name}" at ${completionRate}% task completion`,
          summary: `${row.done_tasks}/${row.total_tasks} tasks done, ${row.blocked_tasks} blocked, ${row.overdue_tasks} overdue.`,
          details: {
            totalTasks: row.total_tasks,
            doneTasks: row.done_tasks,
            blockedTasks: row.blocked_tasks,
            overdueTasks: row.overdue_tasks,
            completionRate,
            blockRate: Math.round(blockRate),
          },
          recommendations: [
            'Review and unblock stuck tasks',
            'Reallocate resources from lower-priority projects',
            `Target minimum ${threshold}% completion rate`,
          ],
          affectedItems: [{ type: 'project', id: row.id, label: row.name }],
          status: 'open',
          metadata: {},
          createdAt: new Date(),
        });
      }

      // High block rate
      if (blockRate > 20 && row.blocked_tasks >= 3) {
        findings.push({
          findingId: uuidv4(),
          organizationId: orgId,
          projectId: row.id,
          analyzerType: 'quality_drift',
          severity: 'high',
          title: `High blocker rate in "${row.name}": ${row.blocked_tasks} tasks blocked`,
          summary: `${Math.round(blockRate)}% of tasks are in blocked state.`,
          details: { blockedTasks: row.blocked_tasks, blockRate: Math.round(blockRate) },
          recommendations: [
            'Investigate common blocker patterns',
            'Escalate dependency resolution',
            'Consider scope adjustment',
          ],
          affectedItems: [{ type: 'project', id: row.id, label: row.name }],
          status: 'open',
          metadata: {},
          createdAt: new Date(),
        });
      }
    }

    return {
      findings,
      analyzerType: 'quality_drift',
      durationMs: Date.now() - start,
      projectsScanned: qualityResult.rows.length,
      timestamp: new Date(),
    };
  }

  // ── Analyzer 5: Budget Burn Rate ────────────────────────────────────────

  private async analyzeBudgetBurn(orgId: number, config: SentinelConfig): Promise<AnalyzerResult> {
    const start = Date.now();
    const findings: SentinelFinding[] = [];
    const burnThreshold = config.thresholds.budgetBurnThreshold;

    const budgetResult = await this.pool.query(
      `SELECT id, name, budget, budget_spent, budget_status, progress, start_date, target_end_date
       FROM projects
       WHERE organization_id = $1
         AND budget IS NOT NULL
         AND budget > 0
         AND status NOT IN ('completed', 'archived')`,
      [orgId]
    );

    for (const proj of budgetResult.rows) {
      const budgetSpent = proj.budget_spent || 0;
      const burnPercent = Math.round((budgetSpent / proj.budget) * 100);
      const progress = proj.progress || 0;

      if (burnPercent >= burnThreshold) {
        const severity: FindingSeverity =
          burnPercent >= 100 ? 'critical' : burnPercent >= 90 ? 'high' : 'medium';
        findings.push({
          findingId: uuidv4(),
          organizationId: orgId,
          projectId: proj.id,
          analyzerType: 'budget_burn',
          severity,
          title: `Budget at ${burnPercent}% for "${proj.name}" (${progress}% complete)`,
          summary: `Spent $${budgetSpent.toLocaleString()} of $${proj.budget.toLocaleString()} budget at ${progress}% progress.`,
          details: {
            budget: proj.budget,
            budgetSpent,
            burnPercent,
            progress,
            budgetStatus: proj.budget_status,
            burnVsProgressRatio: progress > 0 ? (burnPercent / progress).toFixed(2) : 'N/A',
          },
          recommendations:
            burnPercent >= 100
              ? [
                  'Freeze non-essential spending',
                  'Request budget increase',
                  'Review scope for cost reduction',
                ]
              : [
                  'Monitor spending closely',
                  'Review top cost categories',
                  'Assess remaining scope feasibility',
                ],
          affectedItems: [{ type: 'project', id: proj.id, label: proj.name }],
          status: 'open',
          metadata: {},
          createdAt: new Date(),
        });
      }

      // Burn vs progress mismatch (spending too fast relative to progress)
      if (progress > 0 && burnPercent > 0) {
        const ratio = burnPercent / progress;
        if (ratio > 1.5 && burnPercent > 30) {
          findings.push({
            findingId: uuidv4(),
            organizationId: orgId,
            projectId: proj.id,
            analyzerType: 'budget_burn',
            severity: ratio > 2.0 ? 'high' : 'medium',
            title: `Budget burn outpacing progress for "${proj.name}"`,
            summary: `Spending at ${burnPercent}% but only ${progress}% complete (${ratio.toFixed(1)}x burn-to-progress ratio).`,
            details: { burnPercent, progress, ratio: parseFloat(ratio.toFixed(2)) },
            recommendations: [
              'Investigate cost drivers',
              'Compare actuals to budget plan',
              'Consider work-effort re-estimation',
            ],
            affectedItems: [{ type: 'project', id: proj.id, label: proj.name }],
            status: 'open',
            metadata: {},
            createdAt: new Date(),
          });
        }
      }
    }

    return {
      findings,
      analyzerType: 'budget_burn',
      durationMs: Date.now() - start,
      projectsScanned: budgetResult.rows.length,
      timestamp: new Date(),
    };
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private async persistFinding(finding: SentinelFinding): Promise<void> {
    try {
      // Dedup: skip if identical finding (same project + analyzer + title) exists in last 24h
      const exists = await this.pool.query(
        `SELECT 1 FROM sentinel_findings
         WHERE project_id = $1 AND analyzer_type = $2 AND title = $3
           AND created_at > NOW() - INTERVAL '24 hours' AND status = 'open'
         LIMIT 1`,
        [finding.projectId, finding.analyzerType, finding.title]
      );
      if (exists.rows.length > 0) return;

      await this.pool.query(
        `INSERT INTO sentinel_findings (
           finding_id, organization_id, project_id, analyzer_type,
           severity, title, summary, details, recommendations,
           affected_items, status, ai_request_id, metadata,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        [
          finding.findingId,
          finding.organizationId,
          finding.projectId,
          finding.analyzerType,
          finding.severity,
          finding.title,
          finding.summary,
          JSON.stringify(finding.details),
          JSON.stringify(finding.recommendations),
          JSON.stringify(finding.affectedItems),
          finding.status,
          finding.aiRequestId || null,
          JSON.stringify(finding.metadata),
        ]
      );
    } catch (error) {
      console.error('[Sentinel] Failed to persist finding:', error);
    }
  }

  // ── Query Findings ───────────────────────────────────────────────────────

  async getFindings(
    organizationId: number,
    options: {
      projectId?: number;
      analyzerType?: string;
      status?: string;
      severity?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ findings: any[]; total: number }> {
    let query = `SELECT * FROM sentinel_findings WHERE organization_id = $1`;
    const params: any[] = [organizationId];
    let idx = 2;

    if (options.projectId) {
      query += ` AND project_id = $${idx++}`;
      params.push(options.projectId);
    }
    if (options.analyzerType) {
      query += ` AND analyzer_type = $${idx++}`;
      params.push(options.analyzerType);
    }
    if (options.status) {
      query += ` AND status = $${idx++}`;
      params.push(options.status);
    }
    if (options.severity) {
      query += ` AND severity = $${idx++}`;
      params.push(options.severity);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)::int as total');
    const countResult = await this.pool.query(countQuery, params);

    query += ` ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at DESC`;
    query += ` LIMIT $${idx++} OFFSET $${idx}`;
    params.push(options.limit || 50, options.offset || 0);

    const result = await this.pool.query(query, params);

    return { findings: result.rows, total: countResult.rows[0]?.total || 0 };
  }

  async updateFindingStatus(
    findingId: string,
    organizationId: number,
    status: string,
    resolvedById?: number
  ): Promise<any> {
    const result = await this.pool.query(
      `UPDATE sentinel_findings SET
         status = $1,
         resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
         resolved_by_id = CASE WHEN $1 = 'resolved' THEN $2 ELSE resolved_by_id END,
         updated_at = NOW()
       WHERE finding_id = $3 AND organization_id = $4
       RETURNING *`,
      [status, resolvedById || null, findingId, organizationId]
    );
    return result.rows[0];
  }

  // ── Summary Statistics ───────────────────────────────────────────────────

  async getSummary(organizationId: number): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status = 'open')::int as open_count,
         COUNT(*) FILTER (WHERE severity = 'critical')::int as critical_count,
         COUNT(*) FILTER (WHERE severity = 'high')::int as high_count,
         COUNT(*) FILTER (WHERE severity = 'medium')::int as medium_count,
         COUNT(*) FILTER (WHERE analyzer_type = 'deadline_risk')::int as deadline_risk_count,
         COUNT(*) FILTER (WHERE analyzer_type = 'cross_project')::int as cross_project_count,
         COUNT(*) FILTER (WHERE analyzer_type = 'quality_drift')::int as quality_drift_count,
         COUNT(*) FILTER (WHERE analyzer_type = 'budget_burn')::int as budget_burn_count,
         COUNT(*) FILTER (WHERE analyzer_type = 'regulatory_change')::int as regulatory_change_count,
         MAX(created_at) as last_scan
       FROM sentinel_findings
       WHERE organization_id = $1`,
      [organizationId]
    );

    return result.rows[0] || {};
  }
}
